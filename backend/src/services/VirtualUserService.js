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

    // Gesture generation config - MATCHES landing page density control
    // Entry #174 addendum: Reduced from 0.65-0.70 to 0.45-0.55 to make virtual users less prolific
    this.gestureConfig = {
      baseDensityMultiplier: 0.45, // 45% pass at HIGH activity (reduced from 65%)
      minDensity: 0.15,            // Minimum for sparse compositions (unused in current formula)
      maxDensity: 0.55             // 55% pass at LOW activity (reduced from 70%)
    }

    // Initial distributed positions for each source
    this.initialPositions = {
      wikipedia: { x: 0.15, y: 0.75 },   // Bottom-left area (bass)
      hackernews: { x: 0.50, y: 0.50 },  // Center (tenor)
      github: { x: 0.85, y: 0.25 }       // Top-right area (soprano)
    }

    // Validate configurations at startup (fail-fast)
    this._validateConfigurations()
  }

  /**
   * Validate virtual user configurations at startup
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
    const interval = beatsPerComposition * beatDuration

    // Clamp to reasonable bounds (8-20 seconds) - increased from 4-15s
    const clampedInterval = Math.max(8000, Math.min(20000, interval))

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

        // Normalize velocity using P10-P90 percentile
        const normalizedVelocity = this._normalizeValue(source, 'velocity', absVelocity)

        // UNIFIED: Dynamic gesture intent based on activity level (same as Landing)
        // High activity sources gesture more frequently, even when stable
        const activityLevel = this._calculateActivityLevel(source)

        // Gesture intent: combine velocity (change) with activity (absolute level)
        // Formula: effectiveGestureIntent = baseIntent * (1 - activityLevel * 0.5)
        // - activityLevel 0 → gestureIntent = 0.1 (base threshold)
        // - activityLevel 1 → gestureIntent = 0.05 (lower threshold = more gestures)
        const baseGestureIntent = 0.1
        const gestureIntent = baseGestureIntent * (1 - activityLevel * 0.5)

        // Check if source should gesture this cycle
        if (normalizedVelocity < gestureIntent) {
          // No significant metric activity - skip this source this cycle
          continue
        }

        // DENSITY FILTER: Probabilistic gesture emission with INVERSE activity modulation
        // Low activity → higher density (more gestures pass, prevents silence)
        // High activity → lower density (fewer gestures pass, prevents chaos)
        // density varies from 0.5 (low activity) to 0.3 (high activity)
        const density = this.gestureConfig.maxDensity -
          (activityLevel * (this.gestureConfig.maxDensity - this.gestureConfig.baseDensityMultiplier))

        if (Math.random() > density) {
          // Skip this gesture probabilistically based on density
          continue
        }

        // Entry #174: Select duration category using PHI-based cycling
        // Guarantees balanced distribution: 20% taps, 30% short, 30% medium, 20% long
        const { category, durationRange } = this._selectDurationCategory(source)

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
    // Base from frequency (congruent with real users) + metric offsets (break diagonal)
    const fullCanvasFreq = 110 + (activityLevel * 1100) // Full range: 110-1210Hz
    const position = this._calculateHybridPosition(source, fullCanvasFreq)

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

    // Entry #171: Velocity variation 0.75-1.0 based on GitHub activity
    const tapVelocity = 0.75 + (gh * 0.25)

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
      timestamp: Date.now()
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

    // Create gestureData for PhraseMorphology
    const gestureData = {
      velocity: normalizedVelocity * 100,
      curvature: clampedCurvature,
      acceleration: acceleration,
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

    // Entry #171: Velocity variation based on GitHub activity (0.75-1.0 range for 0-127 MIDI)
    const velocityMultiplier = 0.75 + (gh * 0.25)

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
        audioFreq: audioFreq,       // For sound (tessitura-constrained)
        positionFreq: rawFreq,      // For cursor (full canvas)
        velocity: Math.max(0, Math.min(1, (note.velocity || 80) / 127)),
        startDelayMs: note.startBeat * beatDurationMs,
        durationMs: note.duration * beatDurationMs
      }
    }).filter(Boolean)

    if (noteData.length === 0) return

    // 3. Calculate HYBRID positions for trajectory
    const startFreq = noteData[0].positionFreq
    const endFreq = noteData[noteData.length - 1].positionFreq
    const startPosition = this._calculateHybridPosition(source, startFreq)

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

    // Emit phrase event for visual system
    this.io.to(roomId).emit('musical:event', {
      type: 'phrase',
      userId: config.userId,
      velocity: Math.min(1, normalizedVelocity),
      noteCount: noteData.length,
      isRemote: true,
      isVirtual: true,
      timestamp: Date.now()
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

    // 4. Generate HYBRID trajectory (frequency path + metric offsets)
    const trajectory = this._generateHybridTrajectory(source, startFreq, endFreq, phraseDurationMs)

    // 5. Emit cursor positions along trajectory (synchronized with phrase duration)
    trajectory.forEach((pos) => {
      setTimeout(() => {
        if (!this.activeRooms.has(roomId)) return
        this._emitCursorAtPosition(roomId, source, config, pos)
      }, pos.timeOffset)
    })

    // 6. Emit notes with HYBRID positions
    // - audioFreq for sound (tessitura-constrained)
    // - positionFreq + golden ratio stepIndex for cursor variation
    noteData.forEach((note, noteIndex) => {
      setTimeout(() => {
        if (!this.activeRooms.has(roomId)) return

        // Get HYBRID position with noteIndex for golden ratio spacing
        // Uses different step offset than trajectory for additional variation
        const notePosition = this._calculateHybridPosition(source, note.positionFreq, noteIndex + 100)

        this.io.to(roomId).emit('hold:start', {
          type: 'hold:start',
          userId: config.userId,
          noteId: note.noteId,
          frequency: note.audioFreq,  // Tessitura-constrained for sound
          velocity: note.velocity,
          duration: note.durationMs / 1000,
          position: notePosition,     // Full canvas position
          userColor: config.color,
          isRemote: true,
          isVirtual: true,
          suppressVisual: true,
          timestamp: Date.now()
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
          this.io.to(roomId).emit('hold:end', holdEndData)
        }, note.durationMs)
      }, note.startDelayMs)
    })
  }

  /**
   * Calculate activity level for a source (0.0-1.0)
   * Uses DYNAMIC NORMALIZATION based on HISTORICAL min/max
   * Same as LandingCompositionService
   * @param {string} source - Source name
   * @returns {number} Activity level (0.0-1.0)
   * @private
   */
  _calculateActivityLevel(source) {
    const metrics = this.webMetricsPoller?.getMetrics()
    if (!metrics || !metrics[source]) return 0.5

    switch (source) {
      case 'wikipedia':
        return this._normalizeValue(source, 'editsPerMinute', metrics[source].editsPerMinute || 0)
      case 'hackernews':
        return this._normalizeValue(source, 'postsPerMinute', metrics[source].postsPerMinute || 0)
      case 'github':
        return this._normalizeValue(source, 'commitsPerMinute', metrics[source].commitsPerMinute || 0)
      default:
        return 0.5
    }
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
   * Entry #174: Select duration category using PHI-based cycling
   * Addendum: Rebalanced to 25% taps, 40% short, 25% medium, 10% long
   * Long phrases are now rare, short phrases most common
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

    // Category boundaries: tap 25%, short 40%, medium 25%, long 10%
    // Long phrases are rare (10%), short phrases most common (40%)
    if (selector < 0.25) {
      return { category: 'tap', durationRange: { min: 50, max: 300 } }
    }
    if (selector < 0.65) {
      return { category: 'short', durationRange: { min: 300, max: 1500 } }
    }
    if (selector < 0.90) {
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
      return { x: 0.5, y: 0.5 }
    }

    // Get gesture counter
    const gestureCount = this.gestureCounters[source] || 0

    // Source-specific offset to differentiate patterns (prime numbers)
    const sourceOffset = source === 'wikipedia' ? 17 : source === 'hackernews' ? 53 : 97

    // Get metrics for influence - clamp explicitly
    const normalizedFreq = Math.max(0, Math.min(1, (baseFrequency - 110) / 1100))
    const metrics = this.webMetricsPoller?.getMetrics()
    let secondaryMetric = 0.5

    if (metrics && metrics[source]) {
      const m = metrics[source]
      switch (source) {
        case 'wikipedia':
          secondaryMetric = this._normalizeValue(source, 'avgEditSize', m.avgEditSize || 0)
          break
        case 'hackernews':
          secondaryMetric = this._normalizeValue(source, 'avgUpvotes', m.avgUpvotes || 0)
          break
        case 'github':
          secondaryMetric = this._normalizeValue(source, 'createsPerMinute', m.createsPerMinute || 0)
          break
      }
    }

    // Validate secondaryMetric is finite
    if (!Number.isFinite(secondaryMetric)) {
      secondaryMetric = 0.5
    }

    // GOLDEN RATIO DISTRIBUTION
    // Each axis uses different φ power for independent sequences
    // stepIndex ensures trajectory points don't cluster
    const combinedSeed = gestureCount + sourceOffset + stepIndex

    // X: golden ratio sequence modulated by frequency
    // Adding normalizedFreq shifts the sequence based on pitch
    const xGolden = (combinedSeed * VirtualUserService.PHI + normalizedFreq * 3.7) % 1

    // Y: golden ratio squared sequence modulated by secondary metric
    // Different multiplier (φ²) ensures X and Y are uncorrelated
    const yGolden = (combinedSeed * VirtualUserService.PHI_SQ + secondaryMetric * 5.3) % 1

    // FIX #3: Map to canvas range with EXPLICIT clamping to ensure bounds
    const x = Math.max(MIN_BOUND, Math.min(MAX_BOUND, MIN_BOUND + xGolden * RANGE))
    const y = Math.max(MIN_BOUND, Math.min(MAX_BOUND, MIN_BOUND + yGolden * RANGE))

    return { x, y }
  }

  /**
   * Generate trajectory for drag gesture using GOLDEN RATIO distribution:
   * - Interpolate frequency between start and end
   * - Each step gets unique stepIndex for optimal position spacing
   * - Reduced emission rate (100ms) to avoid trail spam
   *
   * @param {string} source - Source name
   * @param {number} startFreq - Starting frequency
   * @param {number} endFreq - Ending frequency
   * @param {number} durationMs - Gesture duration
   * @param {number} intervalMs - Update interval (default 100ms for reduced trail density)
   * @returns {Array<{x: number, y: number, timeOffset: number}>} Trajectory positions
   * @private
   */
  _generateHybridTrajectory(source, startFreq, endFreq, durationMs, intervalMs = 100) {
    const steps = Math.max(1, Math.ceil(durationMs / intervalMs))
    const positions = []

    for (let i = 0; i <= steps; i++) {
      const t = steps > 0 ? i / steps : 0
      // Ease-in-out for natural feel
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

      // Interpolate frequency
      const currentFreq = startFreq + (endFreq - startFreq) * eased

      // Pass stepIndex (i) for golden ratio variation within trajectory
      const pos = this._calculateHybridPosition(source, currentFreq, i)

      positions.push({
        x: pos.x,
        y: pos.y,
        timeOffset: i * intervalMs
      })
    }

    return positions
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
