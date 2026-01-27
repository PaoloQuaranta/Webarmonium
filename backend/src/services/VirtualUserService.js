/**
 * VirtualUserService
 * Shared virtual user management for landing room and normal rooms in solo mode
 *
 * When a normal room has only 1 real user, this service activates 2 virtual users
 * that generate gestures from web metrics, providing musical companionship.
 *
 * Key features:
 * - Dynamic source selection (2 most active sources in last 5 minutes)
 * - Reverse mapping: cursor position derived FROM generated frequencies
 * - Musical event emission (tap, drag gestures)
 * - Per-room state management (multiple rooms can have virtual users)
 */

const HarmonicEngine = require('./HarmonicEngine')
const PhraseMorphology = require('./PhraseMorphology')
const FrequencyPositionMapper = require('../utils/FrequencyPositionMapper')
const { getGenreVelocityMultiplier } = require('../utils/GenreUtils')
const { VIRTUAL_USER_COLORS } = require('../constants/colors')

class VirtualUserService {
  constructor() {
    // WebMetricsPoller reference (set by ServiceContainer)
    this.webMetricsPoller = null

    // Socket.io instance (set by ServiceContainer)
    this.io = null

    // BackgroundCompositionService reference (set by ServiceContainer)
    // CRITICAL: Virtual user gestures must contribute to background composition
    this.backgroundCompositionService = null

    // Active rooms with virtual users: roomId -> RoomVirtualState
    this.activeRooms = new Map()

    // Musical components for harmonic coherence
    this.harmonicEngine = new HarmonicEngine()
    this.phraseMorphology = new PhraseMorphology()

    // Frequency-to-position mapper for reverse mapping (cursor follows notes)
    this.frequencyMapper = new FrequencyPositionMapper()

    // Virtual user configurations
    // Note: regions removed - cursor positions now derived from generated frequencies
    // Colors from VIRTUAL_USER_COLORS - exclusive, never overlap with real user colors
    this.virtualUserConfigs = {
      wikipedia: {
        userId: 'wikipedia-metrics',
        color: VIRTUAL_USER_COLORS.wikipedia,
        tessitura: 'bass',
        frequencyRange: { min: 110, max: 220 }  // A2-A3
      },
      hackernews: {
        userId: 'hackernews-metrics',
        color: VIRTUAL_USER_COLORS.hackernews,
        tessitura: 'tenor',
        frequencyRange: { min: 196, max: 392 }  // G3-G4
      },
      github: {
        userId: 'github-metrics',
        color: VIRTUAL_USER_COLORS.github,
        tessitura: 'soprano',
        frequencyRange: { min: 523, max: 1047 }  // C5-C6
      }
    }

    // Statistical tracking for DYNAMIC NORMALIZATION (per source)
    // Same as LandingCompositionService: tracks historical min/max for percentile normalization
    this.metricStatistics = {
      wikipedia: {
        velocity: { min: Infinity, max: 0, samples: [] },
        editsPerMinute: { min: Infinity, max: 0, samples: [] },
        avgEditSize: { min: Infinity, max: 0, samples: [] },
        newArticles: { min: Infinity, max: 0, samples: [] }
      },
      hackernews: {
        velocity: { min: Infinity, max: 0, samples: [] },
        postsPerMinute: { min: Infinity, max: 0, samples: [] },
        avgUpvotes: { min: Infinity, max: 0, samples: [] },
        commentCount: { min: Infinity, max: 0, samples: [] }
      },
      github: {
        velocity: { min: Infinity, max: 0, samples: [] },
        commitsPerMinute: { min: Infinity, max: 0, samples: [] },
        createsPerMinute: { min: Infinity, max: 0, samples: [] },
        deletesPerMinute: { min: Infinity, max: 0, samples: [] }
      }
    }
    this.maxSamples = 100 // Keep last 100 samples for percentile calculation (same as Landing)

    // Clock for gesture timing
    this.clockTick = 0

    // Gesture counter per source for position variation
    // Increments with each gesture, creates cyclic variation in cursor position
    this.gestureCounters = {
      wikipedia: 0,
      hackernews: 0,
      github: 0
    }

    // Interpolation settings for smooth cursor movement
    // FIX #5: Adjusted interpolationSpeed from 0.08 to 0.15 to match 100ms trajectory interval
    // At 100ms intervals, 0.15 speed provides smooth movement without teleporting
    this.interpolationInterval = 50  // 20fps
    this.interpolationSpeed = 0.15   // How fast to approach target (higher = faster, matches 100ms intervals)

    // Gesture generation config for ROOMS (different from Landing)
    // Entry #187g: Rooms need higher density because:
    // 1. Only 2 sources vs Landing's 3 sources
    // 2. No velocity check (removed in Entry #187f) - only density filter gates gestures
    // Increased from 0.45-0.55 to 0.60-0.75 to compensate
    this.gestureConfig = {
      baseDensityMultiplier: 0.60, // 60% pass at HIGH activity (was 0.45)
      minDensity: 0.15,            // Minimum for sparse compositions (unused in current formula)
      maxDensity: 0.75             // 75% pass at LOW activity (was 0.55)
    }

    // Entry #187: Source-specific balancing to equalize gesture distribution
    // Problem: Wikipedia polls every 5s with high activity, GitHub every 60s with low activity
    // Solution: Per-source parameters to compensate for structural differences
    //
    // Entry #187d: ROOM-SPECIFIC TUNING - Rooms use only 2 sources (no GitHub)
    // Without GitHub's 0.25x multiplier, need more permissive thresholds for Wiki/HN
    // Landing uses all 3 sources with aggressive tuning (4.0x/1.2x/0.25x)
    //
    // Tuning methodology for gestureIntentMultiplier (2-source rooms):
    // - Base threshold is 0.1 (10% of normalized velocity required to gesture)
    // - Wikipedia (2.0x): threshold 0.20 → moderate reduction (~50% fewer gestures)
    // - HackerNews (0.8x): threshold 0.08 → slightly more permissive (compensates for no GitHub)
    // - GitHub (0.3x): threshold 0.03 → permissive (rarely selected for rooms anyway)
    //
    // Activity floor rationale:
    // - Wikipedia (0.2): moderate floor
    // - HackerNews (0.3): moderate floor for 10s poll interval
    // - GitHub (0.5): high floor ensures presence if selected
    //
    // Duration bias rationale:
    // - Wikipedia: 50% taps, 35% short, 12% medium, 3% long (mostly quick gestures)
    // - HackerNews: balanced distribution
    // - GitHub: more substantial gestures (15% long)
    this.sourceBalancing = {
      wikipedia: {
        activityFloor: 0.2,           // Moderate floor
        gestureIntentMultiplier: 2.0, // 2x threshold → ~50% fewer gestures
        durationBias: { tap: 0.50, short: 0.35, medium: 0.12, long: 0.03 }  // Mostly quick gestures
      },
      hackernews: {
        activityFloor: 0.3,           // Moderate floor for 10s poll interval
        gestureIntentMultiplier: 0.8, // Slightly permissive (no GitHub to compensate)
        durationBias: { tap: 0.25, short: 0.40, medium: 0.25, long: 0.10 }  // Balanced distribution
      },
      github: {
        activityFloor: 0.5,           // High floor ensures presence if selected
        gestureIntentMultiplier: 0.3, // 0.3x threshold → permissive
        durationBias: { tap: 0.20, short: 0.35, medium: 0.30, long: 0.15 }  // Substantial gestures
      }
    }

    // Initial distributed positions for each source
    // Entry #182: Better tessellation to avoid center clustering
    this.initialPositions = {
      wikipedia: { x: 0.20, y: 0.80 },   // Bottom-left area (bass)
      hackernews: { x: 0.80, y: 0.50 },  // Right-center (tenor) - moved from center
      github: { x: 0.30, y: 0.20 }       // Top-left area (soprano)
    }

    // Validate configurations at startup (fail-fast)
    this._validateConfigurations()
  }

  /**
   * Validate virtual user configurations at startup
   * Entry #187: Also validates sourceBalancing configuration
   * @throws {Error} If configurations are invalid
   * @private
   */
  _validateConfigurations() {
    const sources = Object.keys(this.virtualUserConfigs)

    if (sources.length < 2) {
      throw new Error('VirtualUserService: At least 2 virtual user configurations required')
    }

    for (const source of sources) {
      const config = this.virtualUserConfigs[source]

      // Validate required fields
      if (!config.userId || typeof config.userId !== 'string') {
        throw new Error(`VirtualUserService: Invalid userId for source "${source}"`)
      }

      // Validate color format (hex)
      if (!config.color || !/^#[0-9a-fA-F]{6}$/.test(config.color)) {
        throw new Error(`VirtualUserService: Invalid color "${config.color}" for source "${source}" (must be #RRGGBB)`)
      }

      // Validate frequency range (tessitura)
      if (!config.frequencyRange ||
          typeof config.frequencyRange.min !== 'number' ||
          typeof config.frequencyRange.max !== 'number' ||
          config.frequencyRange.min <= 0 ||
          config.frequencyRange.min >= config.frequencyRange.max) {
        throw new Error(`VirtualUserService: Invalid frequencyRange for source "${source}"`)
      }

      // Entry #187: Validate sourceBalancing configuration
      const balancing = this.sourceBalancing[source]
      if (balancing) {
        // Validate activityFloor (must be 0-1)
        if (typeof balancing.activityFloor !== 'number' ||
            balancing.activityFloor < 0 || balancing.activityFloor > 1) {
          throw new Error(`VirtualUserService: Invalid activityFloor for "${source}" (must be 0-1)`)
        }

        // Validate gestureIntentMultiplier (must be > 0)
        if (typeof balancing.gestureIntentMultiplier !== 'number' ||
            balancing.gestureIntentMultiplier <= 0) {
          throw new Error(`VirtualUserService: Invalid gestureIntentMultiplier for "${source}" (must be > 0)`)
        }

        // Validate durationBias (must have all keys and sum to ~1.0)
        if (!balancing.durationBias) {
          throw new Error(`VirtualUserService: Missing durationBias for "${source}"`)
        }
        const bias = balancing.durationBias
        const sum = (bias.tap || 0) + (bias.short || 0) + (bias.medium || 0) + (bias.long || 0)
        if (Math.abs(sum - 1.0) > 0.01) {
          throw new Error(`VirtualUserService: durationBias for "${source}" must sum to 1.0 (got ${sum.toFixed(2)})`)
        }
      }
    }
  }

  /**
   * HIGH FIX #6: Validate position object has finite x and y coordinates
   * @param {Object} position - Position with x, y properties
   * @returns {boolean} True if valid
   * @private
   */
  _isValidPosition(position) {
    return position &&
           typeof position.x === 'number' && Number.isFinite(position.x) &&
           typeof position.y === 'number' && Number.isFinite(position.y)
  }

  /**
   * HIGH FIX #6: Validate color string
   * @param {string} color - Color string
   * @returns {boolean} True if valid
   * @private
   */
  _isValidColor(color) {
    return typeof color === 'string' && color.length > 0
  }

  /**
   * HIGH FIX #6: Validate duration is a finite non-negative number
   * @param {number} duration - Duration value
   * @returns {boolean} True if valid
   * @private
   */
  _isValidDuration(duration) {
    return typeof duration === 'number' && Number.isFinite(duration) && duration >= 0
  }

  /**
   * Set WebMetricsPoller reference
   * @param {WebMetricsPoller} poller
   */
  setWebMetricsPoller(poller) {
    this.webMetricsPoller = poller
  }

  /**
   * Set Socket.IO instance
   * @param {SocketIO} io
   */
  setSocketIO(io) {
    this.io = io
  }

  /**
   * Set BackgroundCompositionService reference
   * Virtual user gestures must contribute to background composition
   * @param {BackgroundCompositionService} service
   */
  setBackgroundCompositionService(service) {
    this.backgroundCompositionService = service
  }

  /**
   * Set RoomManager reference
   * @param {RoomManager} roomManager
   */
  setRoomManager(roomManager) {
    this.roomManager = roomManager
  }

  /**
   * Emit cursor position for a virtual user
   * Called when a note is emitted to synchronize cursor with audio
   * @param {string} roomId - Room ID
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @param {Object} config - Virtual user config (unused, kept for API compatibility)
   * @param {Object} position - {x, y} target position (0-1 range)
   * @private
   */
  _emitCursorAtPosition(roomId, source, config, position) {
    // Set target position - interpolation timer will smoothly move there
    const roomState = this.activeRooms.get(roomId)
    if (roomState && roomState.targetPositions[source]) {
      roomState.targetPositions[source].x = position.x
      roomState.targetPositions[source].y = position.y
    }
  }

  /**
   * Emit all cursor positions for a room at once
   * @param {string} roomId - Room ID
   * @param {Object} roomState - Room state
   * @private
   */
  _emitAllCursorsForRoom(roomId, roomState) {
    if (!this.io) return

    const cursors = {}
    for (const source of roomState.sources) {
      const config = this.virtualUserConfigs[source]
      const pos = roomState.currentPositions[source]
      cursors[source] = {
        userId: config.userId,
        x: pos.x,
        y: pos.y,
        color: config.color
      }
    }

    this.io.to(roomId).emit('virtual-cursors', {
      cursors,
      timestamp: Date.now()
    })
  }

  /**
   * Start cursor interpolation timer for a room
   * @param {string} roomId - Room ID
   * @param {Object} roomState - Room state
   * @private
   */
  _startCursorInterpolation(roomId, roomState) {
    if (roomState.cursorInterpolationTimer) {
      clearInterval(roomState.cursorInterpolationTimer)
    }

    roomState.cursorInterpolationTimer = setInterval(() => {
      this._interpolateCursorsForRoom(roomId, roomState)
    }, this.interpolationInterval)
  }

  /**
   * Interpolate cursors toward target positions for a room
   * @param {string} roomId - Room ID
   * @param {Object} roomState - Room state
   * @private
   */
  _interpolateCursorsForRoom(roomId, roomState) {
    if (!this.io || !roomState.isActive) return

    let anyMoved = false
    const threshold = 0.001  // Minimum movement threshold

    for (const source of roomState.sources) {
      const current = roomState.currentPositions[source]
      const target = roomState.targetPositions[source]

      if (!current || !target) continue

      const dx = target.x - current.x
      const dy = target.y - current.y

      // Only interpolate if there's meaningful distance to cover
      if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
        current.x += dx * this.interpolationSpeed
        current.y += dy * this.interpolationSpeed
        anyMoved = true
      }
    }

    // Only emit if any cursor actually moved
    if (anyMoved) {
      this._emitAllCursorsForRoom(roomId, roomState)

      // Record virtual cursor positions as gestures for gradient metrics
      if (this.roomManager) {
        for (const source of roomState.sources) {
          const config = this.virtualUserConfigs[source]
          const pos = roomState.currentPositions[source]
          if (config && pos) {
            this.roomManager.recordGesture(roomId, {
              action: 'drag',
              coordinates: { x: pos.x, y: pos.y },
              velocity: 0.3,  // Virtual users have moderate velocity
              userId: config.userId
            })
          }
        }
      }
    }
  }

  /**
   * Get the 2 most active sources from WebMetricsPoller
   * @returns {string[]} Array of 2 source names
   */
  getMostActiveSources() {
    if (this.webMetricsPoller && typeof this.webMetricsPoller.getMostActiveSources === 'function') {
      return this.webMetricsPoller.getMostActiveSources()
    }
    // Fallback to default
    return ['wikipedia', 'hackernews']
  }

  /**
   * Activate virtual users for a room
   * @param {string} roomId - Room ID
   * @param {string[]} sources - Array of 2 source names to use
   * @param {Object} musicalContext - Room's musical context (key, mode, tempo)
   */
  activateForRoom(roomId, sources, musicalContext = { key: 'C', mode: 'ionian', tempo: 120 }) {
    if (this.activeRooms.has(roomId)) {
      // Already active, update sources if needed
      const state = this.activeRooms.get(roomId)
      state.sources = sources
      state.musicalContext = musicalContext
      return
    }

    // Create room virtual state with cursor tracking for smooth interpolation
    const currentPositions = {}
    const targetPositions = {}
    for (const source of sources) {
      const initial = this.initialPositions[source] || { x: 0.5, y: 0.5 }
      currentPositions[source] = { ...initial }
      targetPositions[source] = { ...initial }
    }

    const roomState = {
      roomId,
      sources,
      musicalContext,
      isActive: true,
      gestureGenerationTimer: null,
      cursorInterpolationTimer: null,
      currentPositions,
      targetPositions
    }

    this.activeRooms.set(roomId, roomState)

    // Emit initial cursor positions (distributed across canvas)
    this._emitAllCursorsForRoom(roomId, roomState)

    // Start interpolation and gesture loops for this room
    this._startCursorInterpolation(roomId, roomState)
    this._startRoomLoops(roomId)

    // Emit activation event with virtual user info
    if (this.io) {
      const virtualUsers = sources.map(source => ({
        userId: this.virtualUserConfigs[source].userId,
        color: this.virtualUserConfigs[source].color,
        source
      }))

      this.io.to(roomId).emit('virtual-users-activated', {
        roomId,
        sources,
        virtualUsers,
        timestamp: Date.now()
      })
    }

    // console.log(`🎭 Virtual users activated for room ${roomId}: ${sources.join(', ')}`)
  }

  /**
   * Deactivate virtual users for a room
   * @param {string} roomId - Room ID
   * @param {boolean} fadeOut - Whether to emit fade-out event
   */
  deactivateForRoom(roomId, fadeOut = true) {
    const roomState = this.activeRooms.get(roomId)
    if (!roomState) return

    roomState.isActive = false

    // Stop cursor interpolation timer
    if (roomState.cursorInterpolationTimer) {
      clearInterval(roomState.cursorInterpolationTimer)
      roomState.cursorInterpolationTimer = null
    }

    // Stop gesture generation timer
    if (roomState.gestureGenerationTimer) {
      clearTimeout(roomState.gestureGenerationTimer)
      roomState.gestureGenerationTimer = null
    }

    // Emit deactivation event
    if (this.io && fadeOut) {
      this.io.to(roomId).emit('virtual-users-deactivated', {
        roomId,
        sources: roomState.sources,
        timestamp: Date.now()
      })
    }

    this.activeRooms.delete(roomId)

    // console.log(`🎭 Virtual users deactivated for room ${roomId}`)
  }

  /**
   * Check if room has active virtual users
   * @param {string} roomId
   * @returns {boolean}
   */
  isActiveForRoom(roomId) {
    return this.activeRooms.has(roomId)
  }

  /**
   * Update musical context for a room
   * @param {string} roomId
   * @param {Object} musicalContext - { key, mode, tempo }
   */
  updateMusicalContext(roomId, musicalContext) {
    const roomState = this.activeRooms.get(roomId)
    if (roomState) {
      roomState.musicalContext = { ...roomState.musicalContext, ...musicalContext }
    }
  }

  /**
   * Start gesture generation loop for a room
   * Note: Cursor positions are now emitted directly with notes (reverse mapping)
   * @param {string} roomId
   * @private
   */
  _startRoomLoops(roomId) {
    const roomState = this.activeRooms.get(roomId)
    if (!roomState) return

    // Gesture generation cycle (schedule first)
    this._scheduleNextGestureGeneration(roomId)
  }

  /**
   * Schedule next gesture generation cycle
   * UNIFIED: Uses SAME tempo-based interval as LandingCompositionService
   * Composition frequency emerges from metric activity (not random)
   * @param {string} roomId
   * @private
   */
  _scheduleNextGestureGeneration(roomId) {
    const roomState = this.activeRooms.get(roomId)
    if (!roomState || !roomState.isActive) return

    // Get tempo from musical context
    const tempo = roomState.musicalContext?.tempo || 120

    // Calculate activity level for each active source
    // Same formula as LandingCompositionService
    let totalActivity = 0
    let sourceCount = 0
    for (const source of roomState.sources) {
      const activity = this._calculateActivityLevel(source)
      totalActivity += activity
      sourceCount++
    }
    const avgActivity = sourceCount > 0 ? totalActivity / sourceCount : 0.5

    // UNIFIED: Map activity to beats (same as Landing)
    // Entry #174 addendum: Increased from 10-16 to 16-24 beats to reduce prolixity
    // High activity = more frequent (16 beats), Low activity = sparse (24 beats)
    const beatsPerComposition = 24 - (avgActivity * 8)  // 16-24 beats, emerges from activity

    const beatDuration = 60000 / tempo  // milliseconds per beat
    const baseInterval = beatsPerComposition * beatDuration

    // Entry #172: Add temporal jitter based on metric variance for regularity variation
    // Uses deterministic PHI-based variation instead of Math.random() for reproducibility
    const metrics = this.webMetricsPoller?.getMetrics()
    let jitter = 0
    if (metrics) {
      const velocities = [
        metrics.wikipedia?.velocityNorm ?? 0.5,
        metrics.hackernews?.velocityNorm ?? 0.5,
        metrics.github?.velocityNorm ?? 0.5
      ]
      // Calculate variance of velocities
      const mean = velocities.reduce((sum, v) => sum + v, 0) / velocities.length
      const variance = velocities.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / velocities.length
      // Jitter proportional to variance (±30% max)
      const jitterRange = variance * baseInterval * 0.6
      // Use PHI for deterministic pseudo-randomness based on gesture counter sum
      const totalGestureCount = Object.values(this.gestureCounters).reduce((sum, c) => sum + c, 0)
      const jitterPhase = (totalGestureCount * VirtualUserService.PHI) % 1
      jitter = (jitterPhase - 0.5) * jitterRange
    }
    const interval = baseInterval + jitter

    // Entry #187h: Reduced interval for rooms (4-12s vs Landing's 8-20s)
    // Rooms have only 2 sources vs Landing's 3, so need faster cycles to compensate
    const clampedInterval = Math.max(4000, Math.min(12000, interval))

    roomState.gestureGenerationTimer = setTimeout(() => {
      // Defensive check: if room was deleted without proper deactivation, don't reschedule
      if (!this.activeRooms.has(roomId)) {
        return
      }

      try {
        this._generateAndEmitGestures(roomId)
      } catch (error) {
        console.error(`⚠️ Gesture generation error for room ${roomId}:`, error.message)
        // Continue scheduling despite error to maintain service
      }

      // Only reschedule if room still exists and is active
      if (this.activeRooms.has(roomId)) {
        this._scheduleNextGestureGeneration(roomId)
      }
    }, clampedInterval)
  }

  /**
   * Generate and emit virtual gestures for a room
   * UNIFIED: Same gesture generation logic as LandingCompositionService
   * Uses dynamic gesture intent based on activity level
   * @param {string} roomId
   * @private
   */
  _generateAndEmitGestures(roomId) {
    const roomState = this.activeRooms.get(roomId)
    if (!roomState || !roomState.isActive || !this.io) return

    // Validate metrics availability
    const metrics = this.webMetricsPoller?.getMetrics()
    if (!metrics) {
      // No metrics available - skip this cycle silently (will retry on next schedule)
      return
    }

    // Validate sources array
    if (!roomState.sources || !Array.isArray(roomState.sources) || roomState.sources.length === 0) {
      return
    }

    for (const source of roomState.sources) {
      try {
        // Validate source config exists
        const config = this.virtualUserConfigs[source]
        if (!config) {
          continue
        }

        const velocity = this.webMetricsPoller?.getVelocity(source) || 0
        const absVelocity = Math.abs(velocity)

        // Update statistics for ALL metrics (same as Landing)
        this._updateStatistics(source, 'velocity', absVelocity)
        if (metrics[source]) {
          for (const [metricName, value] of Object.entries(metrics[source])) {
            if (typeof value === 'number') {
              this._updateStatistics(source, metricName, value)
            }
          }
        }

        // Entry #187f: SIMPLIFIED - Removed velocity-based gating entirely for rooms
        // Problem: Velocity check blocked ALL gestures when metrics were stable (velocity ≈ 0)
        // even though sources were active. The bypass logic was also ineffective.
        // Solution: Use ONLY density filter for gesture gating. This gives predictable
        // ~45-55% pass rate per cycle, resulting in ~2-3 gestures/minute per source.
        // Landing keeps velocity check since it uses all 3 sources with more permissive thresholds.

        const activityLevel = this._calculateActivityLevel(source)

        // DENSITY FILTER: Probabilistic gesture emission with INVERSE activity modulation
        // Low activity → higher density (more gestures pass, prevents silence)
        // High activity → lower density (fewer gestures pass, prevents chaos)
        // Entry #187g: density varies from 0.75 (low activity) to 0.60 (high activity)
        const density = this.gestureConfig.maxDensity -
          (activityLevel * (this.gestureConfig.maxDensity - this.gestureConfig.baseDensityMultiplier))

        if (Math.random() > density) {
          // Skip this gesture probabilistically based on density
          continue
        }

        // Entry #174: Select duration category using PHI-based cycling
        // Guarantees balanced distribution: 20% taps, 30% short, 30% medium, 20% long
        const { category, durationRange } = this._selectDurationCategory(source)

        // Entry #187f fix: Calculate normalizedVelocity for gesture emission
        // (needed by _emitTapGesture and _emitDragGesture for intensity/velocity values)
        const normalizedVelocity = this._normalizeValue(source, 'velocity', absVelocity)

        if (category === 'tap') {
          this._emitTapGesture(roomId, source, config, roomState, normalizedVelocity)
        } else {
          // Short, medium, and long all use drag with different duration ranges
          this._emitDragGesture(roomId, source, config, roomState, normalizedVelocity, velocity, durationRange)
        }
      } catch (sourceError) {
        console.error(`⚠️ VirtualUserService: Error generating gesture for source "${source}" in room ${roomId}:`, sourceError.message)
        // Continue with other sources
      }
    }
  }

  /**
   * Emit a tap gesture (single short note)
   * Uses REVERSE MAPPING: frequency determines cursor position
   * @private
   */
  _emitTapGesture(roomId, source, config, roomState, normalizedVelocity) {
    // Increment gesture counter for cyclic position variation
    // FIX #7: Add modulo to prevent gesture counter overflow at MAX_SAFE_INTEGER
    this.gestureCounters[source] = ((this.gestureCounters[source] || 0) + 1) % Number.MAX_SAFE_INTEGER

    // 1. Calculate AUDIO frequency (constrained to tessitura)
    const activityLevel = this._calculateActivityLevel(source)
    const { min: freqMin, max: freqMax } = config.frequencyRange

    // Map activity level to frequency within tessitura for AUDIO
    let rawFreq = freqMin + (activityLevel * (freqMax - freqMin))

    // Entry #171: Web metrics-driven variation (deterministic, no randomness)
    const webMetrics = this._normalizeWebMetrics()
    const wiki = webMetrics.wikipedia.normalized
    const hn = webMetrics.hackernews.normalized
    const gh = webMetrics.github.normalized

    // Convert to MIDI pitch with metrics offset
    let rawPitch = Math.round(12 * Math.log2(rawFreq / 440) + 69)

    // Entry #171: Pitch variation ±3 semitones based on combined metrics
    // (wiki + hn - 1) ranges from -1 to +1, scaled to -3 to +3 semitones
    const pitchOffset = Math.floor((wiki + hn - 1) * 3)
    rawPitch = rawPitch + pitchOffset

    // Constrain to scale AFTER adding variation (preserves harmonic coherence)
    const pitch = this.harmonicEngine.constrainToScale(rawPitch, roomState.musicalContext.key, roomState.musicalContext.mode)
    let frequency = 440 * Math.pow(2, (pitch - 69) / 12)

    // Ensure audio frequency stays within tessitura using octave wrapping
    frequency = this.frequencyMapper.enforceTessitura(frequency, freqMin, freqMax)

    // 2. Calculate HYBRID POSITION: frequency base + metric offsets
    // Entry #189: Use source-specific tessitura range (not fixed 110-1210Hz)
    // This ensures Y normalization in _calculateHybridPosition works correctly
    const cursorFreq = freqMin + (activityLevel * (freqMax - freqMin))
    const position = this._calculateHybridPosition(source, cursorFreq)

    // 3. Emit cursor position synchronized with note
    this._emitCursorAtPosition(roomId, source, config, position)

    // ORGANIC DURATION: Correlate tap duration to stability metric
    const stability = this._calculateStabilityMetric(source)
    const tapDurationMs = 50 + (stability * 250)  // 50-300ms organic range

    // Quantize to beat grid
    const tempo = roomState.musicalContext?.tempo || 120
    const quantizedBeats = this.phraseMorphology.quantizeGestureDuration(tapDurationMs, tempo)
    const beatDuration = 60 / tempo
    const tapDuration = quantizedBeats * beatDuration

    // Generate unique note ID
    const noteId = `virtual_${source}_tap_${Date.now()}`

    // FIX #2: Validate data before emitting hold:start
    if (!this._isValidPosition(position)) {
      return
    }
    if (!Number.isFinite(frequency) || frequency < 20 || frequency > 20000) {
      return
    }

    // Entry #175b fix: Get style for genre-aware playback (moved before velocity calc)
    const style = this.backgroundCompositionService?.getCurrentStyleForRoom(roomId)

    // Entry #171: Velocity variation 0.75-1.0 based on GitHub activity
    // Entry #NEW: Apply genre velocity multiplier for consistency with real users
    const baseVelocity = 0.75 + (gh * 0.25)
    const genreMultiplier = getGenreVelocityMultiplier(style)
    const tapVelocity = baseVelocity * genreMultiplier

    // 4. Emit hold:start with reverse-mapped position
    this.io.to(roomId).emit('hold:start', {
      type: 'hold:start',
      userId: config.userId,
      noteId: noteId,
      frequency: frequency,
      velocity: tapVelocity,
      duration: tapDuration,
      position: position,
      userColor: config.color,
      isRemote: true,
      isVirtual: true,
      timestamp: Date.now(),
      style: style  // Entry #175b fix
    })

    // CRITICAL: Add material to BackgroundCompositionService
    // Virtual user gestures must contribute to background composition
    if (this.backgroundCompositionService) {
      const gestureData = {
        userId: config.userId,
        gesture: {
          type: 'tap',
          duration: tapDurationMs,
          intensity: normalizedVelocity,
          startTime: Date.now()
        }
      }
      const musicalPhrase = {
        notes: [{
          pitch: pitch,
          duration: tapDurationMs,
          velocity: tapVelocity,
          timestamp: Date.now()
        }],
        duration: tapDurationMs,
        type: 'tap'
      }
      this.backgroundCompositionService.addMaterial(roomId, gestureData, musicalPhrase)
    }

    // Emit hold:end after duration (resets visual state)
    // Entry #81 FIX: Include position, userColor, duration for trail halo rendering
    // HIGH FIX #6: Validate all trail halo data before emitting
    // FIX: Use currentPosition (where cursor IS) instead of target position (where cursor WILL BE)
    const tapDurationMs2 = tapDuration * 1000
    setTimeout(() => {
      if (!this.activeRooms.has(roomId)) return
      const holdEndData = {
        type: 'hold:end',
        userId: config.userId,
        noteId: noteId,
        isVirtual: true,
        timestamp: Date.now()
      }
      // Use current interpolated position for trail (matches what user sees)
      const currentPos = roomState.currentPositions?.[source]
      const trailPosition = currentPos || position  // Fallback to target if current unavailable
      // Only include trail halo data if all values are valid
      if (this._isValidPosition(trailPosition) &&
          this._isValidColor(config.color) &&
          this._isValidDuration(tapDurationMs2)) {
        holdEndData.position = trailPosition
        holdEndData.userColor = config.color
        holdEndData.duration = tapDurationMs2
      }
      // Entry #183: Include style for consistent frontend style propagation
      holdEndData.style = this.backgroundCompositionService?.getCurrentStyleForRoom(roomId) || style
      this.io.to(roomId).emit('hold:end', holdEndData)
    }, tapDurationMs2)
  }

  /**
   * Emit a drag gesture (multi-note phrase using PhraseMorphology)
   * Uses REVERSE MAPPING: cursor trajectory derived from note frequencies
   * @private
   */
  _emitDragGesture(roomId, source, config, roomState, normalizedVelocity, rawVelocity, durationRange) {
    // Increment gesture counter for cyclic position variation
    // FIX #7: Add modulo to prevent gesture counter overflow at MAX_SAFE_INTEGER
    this.gestureCounters[source] = ((this.gestureCounters[source] || 0) + 1) % Number.MAX_SAFE_INTEGER

    // Entry #171: Web metrics-driven variation (deterministic, no randomness)
    const webMetrics = this._normalizeWebMetrics()
    const wiki = webMetrics.wikipedia.normalized
    const hn = webMetrics.hackernews.normalized
    const gh = webMetrics.github.normalized

    // Calculate metrics for gesture generation
    const density = this._calculateDensityMetric(source)
    const acceleration = this.webMetricsPoller?.getAcceleration(source) || 0
    const absAccel = Math.abs(acceleration)
    const normalizedAccel = this._normalizeValue(source, 'velocity', absAccel)

    // Calculate curvature from metric variance
    const velocityVariance = normalizedVelocity
    const accelerationVariance = normalizedAccel
    const curvature = accelerationVariance / (velocityVariance + accelerationVariance + 0.1)
    const clampedCurvature = Math.max(0, Math.min(1, curvature))

    // Entry #174: Duration within category range, modulated by density for musical coherence
    // Category ranges: tap (50-300ms), short (300-1500ms), medium (1500-5000ms), long (5000-16000ms)
    const { min: rangeMin, max: rangeMax } = durationRange
    // Validate density is finite and in expected range (defensive against NaN/Infinity)
    const safeDensity = Number.isFinite(density) ? Math.max(0, Math.min(1, density)) : 0.5
    const phraseDurationMs = rangeMin + (safeDensity * (rangeMax - rangeMin))

    // Entry #182: Create gestureData for PhraseMorphology with boosted metrics
    // Old values produced weak contours → small intervals
    // New values ensure more dramatic melodic contours
    //
    // CRITICAL #2 fix: Defensive clamping for acceleration (can be NaN/Infinity)
    const safeAcceleration = Number.isFinite(acceleration) ? acceleration : 0
    const clampedAcceleration = Math.max(-10, Math.min(10, safeAcceleration))
    //
    // MEDIUM #2 fix: Quadratic velocity preserves quiet moments (was floor at 50)
    // MEDIUM #4 fix: Full curvature range with boost multiplier (was compressed 0.4-0.9)
    const gestureData = {
      velocity: normalizedVelocity * normalizedVelocity * 100,  // Quadratic: 0.3→9, 0.5→25, 0.7→49, 1.0→100
      curvature: Math.min(1, clampedCurvature * 1.5),           // 0-1 boosted (0.5→0.75, 0.7→1.0)
      acceleration: clampedAcceleration * 30 + 20,              // -280 to 320 range, safe
      intensity: this._calculateActivityLevel(source),
      duration: phraseDurationMs
    }

    // 1. Generate phrase FIRST (musical content)
    const phrase = this.phraseMorphology.generatePhrase(gestureData, roomState.musicalContext)

    if (!phrase || !phrase.notes || !Array.isArray(phrase.notes) || phrase.notes.length === 0) {
      return
    }

    // HARMONIC COHERENCE: Constrain all phrase notes to room's scale/mode
    // PhraseMorphology uses mood-based scale selection; this ensures room coherence
    // Entry #171: Add web metrics-driven pitch offset and velocity variation
    const { key, mode } = roomState.musicalContext

    // Entry #171: Pitch offset ±3 semitones based on combined metrics
    const pitchOffset = Math.floor((wiki + hn - 1) * 3)

    // Entry #175b fix: Get style for genre-aware playback (moved before velocity calc)
    const style = this.backgroundCompositionService?.getCurrentStyleForRoom(roomId)

    // Entry #171: Velocity variation based on GitHub activity (0.75-1.0 range for 0-127 MIDI)
    // Entry #NEW: Apply genre velocity multiplier for consistency with real users
    const baseVelocityMultiplier = 0.75 + (gh * 0.25)
    const genreMultiplier = getGenreVelocityMultiplier(style)
    const velocityMultiplier = baseVelocityMultiplier * genreMultiplier

    phrase.notes = phrase.notes.map(note => ({
      ...note,
      // Add pitch offset BEFORE constraining to scale (preserves harmonic coherence)
      pitch: this.harmonicEngine.constrainToScale(note.pitch + pitchOffset, key, mode),
      // Modulate velocity while preserving relative dynamics
      velocity: Math.min(127, Math.max(1, Math.round((note.velocity || 80) * velocityMultiplier)))
    }))

    const beatDurationMs = (60 / (roomState.musicalContext.tempo || 120)) * 1000
    const { min: freqMin, max: freqMax } = config.frequencyRange

    // 2. Calculate frequencies for each note
    // - audioFreq: constrained to tessitura (for sound)
    // - rawFreq: unconstrained (for cursor position on full canvas)
    const noteData = phrase.notes.map((note, i) => {
      if (typeof note.pitch !== 'number' || isNaN(note.pitch)) return null

      const rawFreq = 440 * Math.pow(2, (note.pitch - 69) / 12)
      if (isNaN(rawFreq) || !isFinite(rawFreq) || rawFreq <= 0) return null

      // Tessitura enforcement for AUDIO only
      const audioFreq = this.frequencyMapper.enforceTessitura(rawFreq, freqMin, freqMax)

      return {
        noteId: `virtual_${source}_${Date.now()}_${i}`,
        audioFreq: audioFreq,       // For sound AND cursor (tessitura-constrained)
        velocity: Math.max(0, Math.min(1, (note.velocity || 80) / 127)),
        startDelayMs: note.startBeat * beatDurationMs,
        durationMs: note.duration * beatDurationMs
      }
    }).filter(Boolean)

    if (noteData.length === 0) return

    // Entry #187j: Calculate startPosition from first note (was removed in Entry #189 but still needed)
    const startPosition = this._calculateHybridPosition(source, noteData[0].audioFreq, 0)

    // Add material to BackgroundCompositionService
    if (this.backgroundCompositionService) {
      const dragGestureData = {
        userId: config.userId,
        gesture: {
          type: 'drag',
          duration: phraseDurationMs,
          intensity: normalizedVelocity,
          startTime: Date.now()
        }
      }
      const musicalPhrase = {
        notes: phrase.notes.map(note => ({
          pitch: note.pitch,
          duration: note.duration * beatDurationMs,
          velocity: (note.velocity || 80) / 127,
          timestamp: Date.now()
        })),
        duration: phraseDurationMs,
        type: 'drag'
      }
      this.backgroundCompositionService.addMaterial(roomId, dragGestureData, musicalPhrase)
    }

    // Entry #175b: style already retrieved above for genre velocity calculation

    // Emit phrase event for visual system
    this.io.to(roomId).emit('musical:event', {
      type: 'phrase',
      userId: config.userId,
      velocity: Math.min(1, normalizedVelocity),
      noteCount: noteData.length,
      isRemote: true,
      isVirtual: true,
      timestamp: Date.now(),
      style: style  // Entry #175b: Include style for genre-aware playback
    })

    // VISUAL CONSOLIDATION: Single visual event for entire phrase
    this.io.to(roomId).emit('virtual:phrase-visual', {
      userId: config.userId,
      noteCount: noteData.length,
      velocity: Math.min(1, normalizedVelocity),
      position: startPosition,
      userColor: config.color,
      isVirtual: true,
      timestamp: Date.now()
    })

    // Entry #185c: Cursor position derived from note frequency, synchronized with audio
    // Each note emission also moves cursor to match its pitch (Y = frequency)
    noteData.forEach((note, noteIndex) => {
      setTimeout(() => {
        if (!this.activeRooms.has(roomId)) return

        // Calculate cursor position from note frequency
        // Y based on pitch: high freq = top (low Y), low freq = bottom (high Y)
        const notePosition = this._calculateHybridPosition(source, note.audioFreq, noteIndex)

        // Move cursor to note position (synchronized with audio)
        this._emitCursorAtPosition(roomId, source, config, notePosition)

        // Emit note with matching position
        this.io.to(roomId).emit('hold:start', {
          type: 'hold:start',
          userId: config.userId,
          noteId: note.noteId,
          frequency: note.audioFreq,  // From PhraseMorphology (in scale)
          velocity: note.velocity,
          duration: note.durationMs / 1000,
          position: notePosition,      // Cursor at same position
          userColor: config.color,
          isRemote: true,
          isVirtual: true,
          suppressVisual: true,
          timestamp: Date.now(),
          style: style
        })

        setTimeout(() => {
          if (!this.activeRooms.has(roomId)) return
          // Entry #81 FIX: Include position, userColor, duration for trail halo
          // HIGH FIX #6: Validate all trail halo data before emitting
          // FIX: Use currentPosition (where cursor IS) instead of target position
          const holdEndData = {
            type: 'hold:end',
            userId: config.userId,
            noteId: note.noteId,
            isVirtual: true,
            timestamp: Date.now()
          }
          // Use current interpolated position for trail (matches what user sees)
          const currentPos = roomState.currentPositions?.[source]
          const trailPosition = currentPos || notePosition  // Fallback to target if unavailable
          // Only include trail halo data if all values are valid
          if (this._isValidPosition(trailPosition) &&
              this._isValidColor(config.color) &&
              this._isValidDuration(note.durationMs)) {
            holdEndData.position = trailPosition
            holdEndData.userColor = config.color
            holdEndData.duration = note.durationMs
          }
          // Entry #183: Include style for consistent frontend style propagation
          holdEndData.style = this.backgroundCompositionService?.getCurrentStyleForRoom(roomId) || style
          this.io.to(roomId).emit('hold:end', holdEndData)
        }, note.durationMs)
      }, note.startDelayMs)
    })
  }

  /**
   * Entry #187: Calculate gesture intent threshold for a source
   * Extracted for clarity and testability. Lower threshold = more gestures pass.
   *
   * Formula: BASE_THRESHOLD × sourceMultiplier × (1 - activityLevel × ACTIVITY_MODULATION)
   * - BASE_THRESHOLD (0.1): 10% of normalized velocity required to gesture
   * - sourceMultiplier: per-source adjustment (1.5 = stricter, 0.5 = more permissive)
   * - ACTIVITY_MODULATION (0.5): high activity reduces threshold by up to 50%
   *
   * @param {string} source - Source name
   * @param {number} activityLevel - Activity level (0-1)
   * @returns {number} Threshold value (0-1)
   * @private
   */
  _calculateGestureIntentThreshold(source, activityLevel) {
    const balancing = this.sourceBalancing[source] || VirtualUserService.DEFAULT_BALANCING
    const BASE_THRESHOLD = 0.1
    const ACTIVITY_MODULATION = 0.5  // 50% reduction at max activity

    return BASE_THRESHOLD * balancing.gestureIntentMultiplier * (1 - activityLevel * ACTIVITY_MODULATION)
  }

  /**
   * Calculate activity level for a source (0.0-1.0)
   * Uses DYNAMIC NORMALIZATION based on HISTORICAL min/max
   * Entry #187: Applies source-specific activityFloor for balanced gesture distribution
   * @param {string} source - Source name
   * @returns {number} Activity level (0.0-1.0)
   * @private
   */
  _calculateActivityLevel(source) {
    const metrics = this.webMetricsPoller?.getMetrics()
    if (!metrics || !metrics[source]) return 0.5

    let rawActivity
    switch (source) {
      case 'wikipedia':
        rawActivity = this._normalizeValue(source, 'editsPerMinute', metrics[source].editsPerMinute || 0)
        break
      case 'hackernews':
        rawActivity = this._normalizeValue(source, 'postsPerMinute', metrics[source].postsPerMinute || 0)
        break
      case 'github':
        rawActivity = this._normalizeValue(source, 'commitsPerMinute', metrics[source].commitsPerMinute || 0)
        break
      default:
        rawActivity = 0.5
    }

    // Entry #187: Apply source-specific floor to ensure minimum activity
    // Floor is a HARD MINIMUM - even if normalized activity is 0, return the floor
    // Example: GitHub floor=0.4 means it will gesture as if at least 40% active
    const balancing = this.sourceBalancing[source] || VirtualUserService.DEFAULT_BALANCING
    return Math.max(balancing.activityFloor, rawActivity)
  }

  /**
   * Normalize web metrics to 0-1 range for gesture variation
   * Entry #171: Centralized normalization matching BackgroundCompositionService
   * Uses fixed reference ranges for deterministic output
   * @returns {Object} Normalized metrics {wikipedia, hackernews, github}
   * @private
   */
  _normalizeWebMetrics() {
    const raw = this.webMetricsPoller?.getMetrics()
    if (!raw) {
      return {
        wikipedia: { normalized: 0.5 },
        hackernews: { normalized: 0.5 },
        github: { normalized: 0.5 }
      }
    }

    return {
      wikipedia: { normalized: Math.min(1, (raw.wikipedia?.editsPerMinute || 0) / 50) },
      hackernews: { normalized: Math.min(1, (raw.hackernews?.postsPerMinute || 0) / 5) },
      github: { normalized: Math.min(1, (raw.github?.commitsPerMinute || 0) / 30) }
    }
  }

  /**
   * Entry #172: Calculate curve amount based on source metrics.
   * Used for generating curved trajectories that vary based on web activity.
   * Extracted to avoid code duplication between trajectory generation and note positioning.
   *
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @returns {number} Curve amount (-0.2 to +0.2)
   * @private
   */
  _calculateCurveAmount(source) {
    const metrics = this.webMetricsPoller?.getMetrics()
    if (!metrics) return 0

    const wikiVel = metrics.wikipedia?.velocityNorm ?? 0.5
    const hnVel = metrics.hackernews?.velocityNorm ?? 0.5
    const ghVel = metrics.github?.velocityNorm ?? 0.5

    switch (source) {
      case 'wikipedia': return (wikiVel - 0.5) * 0.4
      case 'hackernews': return (hnVel - 0.5) * 0.4
      case 'github': return (ghVel - 0.5) * 0.4
      default: return ((wikiVel + hnVel + ghVel) / 3 - 0.5) * 0.4
    }
  }

  /**
   * Calculate stability metric for gesture classification
   * Lower velocity = higher stability = tap gesture
   * Same as LandingCompositionService
   * @param {string} source - Source name
   * @returns {number} Stability value (0.0-1.0)
   * @private
   */
  _calculateStabilityMetric(source) {
    const velocity = Math.abs(this.webMetricsPoller?.getVelocity(source) || 0)
    // Normalize velocity dynamically, then invert for stability
    const normalizedVelocity = this._normalizeValue(source, 'velocity', velocity)
    // Higher velocity = lower stability
    return Math.max(0, 1 - normalizedVelocity)
  }

  /**
   * Calculate density metric for gesture classification
   * Higher metric values = higher density = phrase gesture
   * Same as LandingCompositionService
   * @param {string} source - Source name
   * @returns {number} Density value (0.0-1.0)
   * @private
   */
  _calculateDensityMetric(source) {
    const metrics = this.webMetricsPoller?.getMetrics()
    if (!metrics || !metrics[source]) return 0.5

    switch (source) {
      case 'wikipedia':
        return this._normalizeValue(source, 'avgEditSize', metrics[source].avgEditSize || 0)
      case 'hackernews':
        return this._normalizeValue(source, 'avgUpvotes', metrics[source].avgUpvotes || 0)
      case 'github':
        return this._normalizeValue(source, 'createsPerMinute', metrics[source].createsPerMinute || 0)
      default:
        return 0.5
    }
  }

  /**
   * Calculate metric-based modulation values for HYBRID position calculation
   * Different metric combinations drive X and Y independently to break diagonal pattern
   *
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @returns {{x: number, y: number}} Metric values (0-1 range) for position modulation
   * @private
   */
  _calculateMetricOffsets(source) {
    // Get metrics for this source
    const metrics = this.webMetricsPoller?.getMetrics()
    if (!metrics || !metrics[source]) {
      return { x: 0, y: 0 }
    }

    const sourceMetrics = metrics[source]
    const velocity = Math.abs(this.webMetricsPoller?.getVelocity(source) || 0)
    const normalizedVelocity = this._normalizeValue(source, 'velocity', velocity)

    // COMBINE MULTIPLE METRICS per axis for non-linear variation
    // Each source uses DIFFERENT metric combinations = unique movement patterns
    let xMetric, yMetric

    switch (source) {
      case 'wikipedia': {
        // X: editsPerMinute * velocity (activity momentum)
        const edits = this._normalizeValue(source, 'editsPerMinute', sourceMetrics.editsPerMinute || 0)
        xMetric = Math.sqrt(edits * normalizedVelocity)

        // Y: avgEditSize * newArticles (content creation intensity)
        const editSize = this._normalizeValue(source, 'avgEditSize', sourceMetrics.avgEditSize || 0)
        const newArticles = this._normalizeValue(source, 'newArticles', sourceMetrics.newArticles || 0)
        yMetric = Math.sqrt(editSize * newArticles)
        break
      }

      case 'hackernews': {
        // X: postsPerMinute * commentCount (engagement momentum)
        const posts = this._normalizeValue(source, 'postsPerMinute', sourceMetrics.postsPerMinute || 0)
        const comments = this._normalizeValue(source, 'commentCount', sourceMetrics.commentCount || 0)
        xMetric = Math.sqrt(posts * comments)

        // Y: avgUpvotes * velocity (popularity momentum)
        const upvotes = this._normalizeValue(source, 'avgUpvotes', sourceMetrics.avgUpvotes || 0)
        yMetric = Math.sqrt(upvotes * normalizedVelocity)
        break
      }

      case 'github': {
        // X: pushesPerMinute * createsPerMinute (code activity)
        const pushes = this._normalizeValue(source, 'pushesPerMinute', sourceMetrics.pushesPerMinute || 0)
        const creates = this._normalizeValue(source, 'createsPerMinute', sourceMetrics.createsPerMinute || 0)
        xMetric = Math.sqrt(pushes * creates)

        // Y: deletesPerMinute * velocity (cleanup momentum)
        const deletes = this._normalizeValue(source, 'deletesPerMinute', sourceMetrics.deletesPerMinute || 0)
        yMetric = Math.sqrt(deletes * normalizedVelocity)
        break
      }

      default:
        xMetric = 0.5
        yMetric = 0.5
    }

    // Return raw metric values (0-1) - will be used to MODULATE position, not ADD offset
    return { x: xMetric, y: yMetric }
  }

  /**
   * Golden ratio constant for optimal distribution
   * φ = (1 + √5) / 2 ≈ 1.618033988749895
   * Consecutive values n*φ mod 1 are maximally spread across [0,1]
   * @private
   */
  static PHI = 1.618033988749895
  static PHI_SQ = 2.618033988749895  // φ² for Y axis (different sequence)

  /**
   * Entry #187: Default balancing configuration for sources without explicit config
   * Used as fallback to ensure consistent behavior across all methods
   * @static
   */
  static DEFAULT_BALANCING = {
    activityFloor: 0.3,           // Neutral floor
    gestureIntentMultiplier: 1.0, // No adjustment
    durationBias: { tap: 0.25, short: 0.40, medium: 0.25, long: 0.10 }
  }

  /**
   * Entry #174: Select duration category using PHI-based cycling
   * Entry #187: Source-specific duration bias for balanced gesture character
   * - Wikipedia: more taps/shorts (quick edits → quick gestures)
   * - GitHub: more medium/long (commits → substantial gestures)
   *
   * PHI stepping creates a low-discrepancy sequence that cycles through all categories
   * naturally without repeating patterns. Source offsets prevent synchronization.
   *
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @returns {{category: string, durationRange: {min: number, max: number}}}
   * @private
   */
  _selectDurationCategory(source) {
    const gestureCount = this.gestureCounters[source] || 0

    // Source-specific offset to prevent synchronization between sources
    // Uses irrational fractions for maximum distribution
    const sourceOffset = source === 'wikipedia' ? 0.17
                       : source === 'hackernews' ? 0.53
                       : 0.89

    // PHI-based selector creates low-discrepancy sequence
    const selector = ((gestureCount * VirtualUserService.PHI) + sourceOffset) % 1

    // Entry #187: Get source-specific duration weights (use DEFAULT_BALANCING as fallback)
    const balancing = this.sourceBalancing[source] || VirtualUserService.DEFAULT_BALANCING
    const bias = balancing.durationBias

    // Category boundaries from bias weights
    const tapEnd = bias.tap
    const shortEnd = tapEnd + bias.short
    const mediumEnd = shortEnd + bias.medium

    if (selector < tapEnd) {
      return { category: 'tap', durationRange: { min: 50, max: 300 } }
    }
    if (selector < shortEnd) {
      return { category: 'short', durationRange: { min: 300, max: 1500 } }
    }
    if (selector < mediumEnd) {
      return { category: 'medium', durationRange: { min: 1500, max: 5000 } }
    }
    return { category: 'long', durationRange: { min: 5000, max: 16000 } }
  }

  /**
   * Calculate cursor position using GOLDEN RATIO distribution:
   * - Uses golden ratio for optimal spacing between consecutive positions
   * - stepIndex adds variation within trajectories (different for each point)
   * - Still data-derived: position emerges from gestureCount + metrics + step
   *
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @param {number} baseFrequency - Audio frequency (encodes primary metric)
   * @param {number} stepIndex - Optional step index within trajectory (default 0)
   * @returns {{x: number, y: number}} Canvas position (always within 0.05-0.95)
   * @private
   */
  _calculateHybridPosition(source, baseFrequency, stepIndex = 0) {
    const MIN_BOUND = 0.05
    const MAX_BOUND = 0.95
    const RANGE = MAX_BOUND - MIN_BOUND  // 0.9

    // FIX #3: Validate input frequency - return safe fallback if invalid
    if (!Number.isFinite(baseFrequency) || baseFrequency < 0) {
      return this.initialPositions[source]
    }

    // Get gesture counter
    const gestureCount = this.gestureCounters[source] || 0

    // Source-specific offset to differentiate patterns (prime numbers)
    const sourceOffset = source === 'wikipedia' ? 17 : source === 'hackernews' ? 53 : 97

    // Entry #185d: X bias only - Y must purely reflect frequency
    // Removed Y bias to prevent cursor clamping at top/bottom edges
    const quadrantBias = {
      wikipedia: { x: -0.15, y: 0 },     // Left side (bass)
      hackernews: { x: 0.15, y: 0 },     // Right side (tenor)
      github: { x: -0.05, y: 0 }         // Center-left (soprano)
    }
    const bias = quadrantBias[source] || { x: 0, y: 0 }

    // Entry #185c: Y = frequency within source's tessitura range
    // Each source has its own frequency range - normalize within that range
    // Inverted: Y=0 (top) = high freq, Y=1 (bottom) = low freq
    const sourceConfig = this.virtualUserConfigs[source]
    const freqMin = sourceConfig?.frequencyRange?.min || 110
    const freqMax = sourceConfig?.frequencyRange?.max || 880
    const freqRange = freqMax - freqMin
    const normalizedFreq = freqRange > 0
      ? Math.max(0, Math.min(1, (baseFrequency - freqMin) / freqRange))
      : 0.5
    const yFromFreq = 1 - normalizedFreq  // Invert: high freq = low Y (top)

    // X position from secondary metrics
    const metrics = this.webMetricsPoller?.getMetrics()
    let xMetric = 0.5

    if (metrics && metrics[source]) {
      const m = metrics[source]
      switch (source) {
        case 'wikipedia':
          xMetric = this._normalizeValue(source, 'avgEditSize', m.avgEditSize || 0)
          break
        case 'hackernews':
          xMetric = this._normalizeValue(source, 'avgUpvotes', m.avgUpvotes || 0)
          break
        case 'github':
          xMetric = this._normalizeValue(source, 'createsPerMinute', m.createsPerMinute || 0)
          break
      }
    }

    if (!Number.isFinite(xMetric)) {
      xMetric = 0.5
    }

    // GOLDEN RATIO DISTRIBUTION for variation
    const combinedSeed = gestureCount + sourceOffset + stepIndex
    const xGolden = (combinedSeed * VirtualUserService.PHI) % 1
    const yGolden = (combinedSeed * VirtualUserService.PHI_SQ) % 1

    // Entry #190: Enhanced X variation for more dynamic cursor movement
    // - Increased golden ratio range from ±15% to ±35%
    // - Add frequency influence: higher notes drift right, lower notes drift left
    // - Creates diagonal movement patterns during phrases
    const freqInfluenceOnX = (normalizedFreq - 0.5) * 0.2  // ±10% based on pitch
    const xBase = xMetric + (xGolden - 0.5) * 0.7 + freqInfluenceOnX

    // Y position: frequency-based with ±10% golden ratio variation (less variation to preserve pitch coherence)
    const yBase = yFromFreq + (yGolden - 0.5) * 0.2

    // Apply bias and clamp
    const xBiased = Math.max(0, Math.min(1, xBase + bias.x))
    const yBiased = Math.max(0, Math.min(1, yBase + bias.y))

    const x = MIN_BOUND + xBiased * RANGE
    const y = MIN_BOUND + yBiased * RANGE

    return { x, y }
  }

  /**
   * Generate trajectory for drag gesture:
   * - Entry #185: Y = frequency (like real users)
   * - Fast notes = wider movements
   * - Smooth geometric path with arc curvature
   *
   * @param {string} source - Source name
   * @param {number} startFreq - Starting frequency
   * @param {number} endFreq - Ending frequency
   * @param {number} durationMs - Gesture duration
   * @param {number} noteCount - Number of notes in phrase (for amplitude scaling)
   * @param {number} intervalMs - Update interval (default 100ms)
   * @returns {Array<{x: number, y: number, timeOffset: number}>} Trajectory positions
   * @private
   */
  _generateHybridTrajectory(source, startFreq, endFreq, durationMs, noteCount = 4, intervalMs = 100) {
    const steps = Math.max(1, Math.ceil(durationMs / intervalMs))
    const positions = []

    // Entry #185: Calculate start and end positions from frequencies
    const startPos = this._calculateHybridPosition(source, startFreq, 0)
    const endPos = this._calculateHybridPosition(source, endFreq, steps)

    // Entry #185: Scale movement amplitude by note density (notes per second)
    // More notes = faster gesture = wider movement
    const notesPerSecond = noteCount / (durationMs / 1000)
    const densityFactor = Math.min(2, Math.max(0.5, notesPerSecond / 2))  // 0.5x to 2x
    const minDist = 0.12 * densityFactor  // 6% to 24% of canvas

    const dx = endPos.x - startPos.x
    const dy = endPos.y - startPos.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    let actualEndPos = endPos
    if (dist < minDist && dist > 0) {
      // Extend in same direction to reach minimum distance
      const scale = minDist / dist
      actualEndPos = {
        x: Math.max(0.05, Math.min(0.95, startPos.x + dx * scale)),
        y: Math.max(0.05, Math.min(0.95, startPos.y + dy * scale))
      }
    } else if (dist === 0) {
      // If no movement, create directional gesture based on gesture counter
      const gestureCount = this.gestureCounters[source] || 0
      const angle = gestureCount * 0.7
      actualEndPos = {
        x: Math.max(0.05, Math.min(0.95, startPos.x + Math.cos(angle) * minDist)),
        y: Math.max(0.05, Math.min(0.95, startPos.y + Math.sin(angle) * minDist))
      }
    }

    // Recalculate direction vector
    const actualDx = actualEndPos.x - startPos.x
    const actualDy = actualEndPos.y - startPos.y
    const actualLen = Math.sqrt(actualDx * actualDx + actualDy * actualDy) || 1

    // Perpendicular direction for curve offset
    const perpX = -actualDy / actualLen
    const perpY = actualDx / actualLen

    // Entry #185: Curve amount scales with density (faster = more curved)
    const baseCurve = this._calculateCurveAmount(source)
    const curveAmount = baseCurve * densityFactor

    for (let i = 0; i <= steps; i++) {
      const t = steps > 0 ? i / steps : 0
      // Ease-in-out for natural acceleration/deceleration
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

      // Geometric interpolation between start and end
      const x = startPos.x + (actualEndPos.x - startPos.x) * eased
      const y = startPos.y + (actualEndPos.y - startPos.y) * eased

      // Sinusoidal arc perpendicular to path
      const curveOffset = Math.sin(t * Math.PI) * curveAmount

      positions.push({
        x: Math.max(0.05, Math.min(0.95, x + perpX * curveOffset)),
        y: Math.max(0.05, Math.min(0.95, y + perpY * curveOffset)),
        timeOffset: i * intervalMs
      })
    }

    return positions
  }

  /**
   * Convert Y position to frequency (inverse of position calculation)
   * Entry #185: Y=0 (top) = high freq, Y=1 (bottom) = low freq
   * @param {number} y - Y position (0.05-0.95)
   * @returns {number} Frequency in Hz
   * @private
   */
  _yToFrequency(y) {
    // Normalize Y from canvas bounds (0.05-0.95) to 0-1
    const normalizedY = Math.max(0, Math.min(1, (y - 0.05) / 0.9))
    // Invert: low Y = high freq, high Y = low freq
    const normalizedFreq = 1 - normalizedY
    // Map to frequency range: 110Hz (A2) to 880Hz (A5)
    return 110 + normalizedFreq * 770
  }

  /**
   * Classify gesture type based on metric characteristics
   * Uses PURE relative comparison: stability vs density
   * NO thresholds - gestures emerge naturally from metric variations
   * Same as LandingCompositionService
   * @param {string} source - Source name
   * @returns {string} Gesture type: 'tap' or 'drag'
   * @private
   */
  _classifyGestureType(source) {
    const stability = this._calculateStabilityMetric(source)
    const density = this._calculateDensityMetric(source)


    // Pure relative comparison: stability vs density determines gesture type
    // Higher stability = single notes (tap), higher density = phrases (drag)
    return stability > density ? 'tap' : 'drag'
  }

  /**
   * Update statistics for dynamic normalization
   * Same as LandingCompositionService - builds historical data for percentile calculation
   * @private
   */
  _updateStatistics(source, metricName, value) {
    const stats = this.metricStatistics[source]?.[metricName]
    if (!stats) return

    stats.min = Math.min(stats.min, value)
    stats.max = Math.max(stats.max, value)

    stats.samples.push(value)
    // CRITICAL: Use slice to guarantee size bounds (prevents memory leak)
    if (stats.samples.length > this.maxSamples) {
      stats.samples = stats.samples.slice(-this.maxSamples)
    }
  }

  /**
   * DYNAMIC NORMALIZATION based on HISTORICAL RANGE with PERCENTILE STABILIZATION
   * Same as LandingCompositionService - uses P10-P90 to prevent outlier skewing
   * Maps metric values to [0, 1] using observed percentiles
   * NO hardcoded thresholds - adapts to actual data range
   * @private
   */
  _normalizeValue(source, metricName, value) {
    const stats = this.metricStatistics[source]?.[metricName]
    if (!stats) return 0.5

    // Wait for warm-up period (need enough samples for percentile)
    // Reduced from 10 to 5 for faster gesture activation
    const MIN_SAMPLES_FOR_PERCENTILE = 5
    if (stats.samples.length < MIN_SAMPLES_FOR_PERCENTILE) {
      // During warm-up, use simple min/max normalization instead of returning 0.5
      // This allows gestures to be generated immediately
      const range = stats.max - stats.min
      if (range > 0) {
        return Math.max(0, Math.min(1, (value - stats.min) / range))
      }
      return 0.5
    }

    // If no range yet, return 0.5
    if (stats.min === Infinity || stats.max === 0) {
      return 0.5
    }

    // PERCENTILE-BASED normalization for stability (same as Landing)
    // Uses P10-P90 range to prevent outliers from skewing normalization
    const sortedSamples = [...stats.samples].sort((a, b) => a - b)
    const p10Index = Math.floor(sortedSamples.length * 0.1)
    const p90Index = Math.floor(sortedSamples.length * 0.9)
    const p10 = sortedSamples[p10Index]
    const p90 = sortedSamples[p90Index]

    const stabilizedRange = p90 - p10
    if (stabilizedRange === 0) {
      return 0.5
    }

    // Normalize using percentile range
    const normalized = (value - p10) / stabilizedRange

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, normalized))
  }

  /**
   * Get virtual user configurations for specific sources
   * @param {string[]} sources
   * @returns {Object[]} Array of virtual user configs
   */
  getVirtualUserConfigs(sources) {
    return sources.map(source => ({
      ...this.virtualUserConfigs[source],
      source
    }))
  }

  /**
   * Shutdown all virtual users
   */
  shutdown() {
    for (const roomId of this.activeRooms.keys()) {
      this.deactivateForRoom(roomId, false)
    }
    // console.log('🎭 VirtualUserService shutdown complete')
  }
}

module.exports = VirtualUserService
