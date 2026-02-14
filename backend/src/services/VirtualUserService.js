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
const BaseVirtualUserBehavior = require('./BaseVirtualUserBehavior')
const FrequencyPositionMapper = require('../utils/FrequencyPositionMapper')
const { getGenreVelocityMultiplier } = require('../utils/GenreUtils')
const {
  VIRTUAL_USER_CONFIGS,
  LANDING_ROOM_ID
} = require('../constants/virtualUserConfig')

class VirtualUserService extends BaseVirtualUserBehavior {
  constructor() {
    // Initialize base class with rooms context
    // Base class provides: metricStatistics, gestureCounters, sourceBalancing, gestureConfig,
    // initialPositions, _gestureStats, _gestureFallbacks from virtualUserConfig.js
    super({
      context: 'rooms',
      sources: ['wikipedia', 'hackernews'],
      balancingProfile: 'rooms'
    })

    // Socket.io instance (set by ServiceContainer)
    this.io = null

    // BackgroundCompositionService reference (set by ServiceContainer)
    // CRITICAL: Virtual user gestures must contribute to background composition
    this.backgroundCompositionService = null

    // RoomManager reference (set by ServiceContainer)
    this.roomManager = null

    // Active rooms with virtual users: roomId -> RoomVirtualState
    this.activeRooms = new Map()

    // Musical components for harmonic coherence
    this.harmonicEngine = new HarmonicEngine()
    this.phraseMorphology = new PhraseMorphology()

    // Frequency-to-position mapper for reverse mapping (cursor follows notes)
    this.frequencyMapper = new FrequencyPositionMapper()

    // Virtual user configurations from centralized config
    this.virtualUserConfigs = VIRTUAL_USER_CONFIGS

    // Clock for gesture timing
    this.clockTick = 0

    // Interpolation interval (speed comes from base class via interpolationConfig)
    this.interpolationInterval = 50  // 20fps

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
   * Get current harmonic context from BackgroundCompositionService
   * Entry #213: Ensures virtual users start with current key/mode/tempo instead of static defaults
   * @returns {Object} Current musical context { key, mode, tempo }
   * @private
   */
  _getCurrentHarmonicContext() {
    const defaults = { key: 'C', mode: 'ionian', tempo: 120 }

    if (!this.backgroundCompositionService?.compositionEngine) {
      return defaults
    }

    const engine = this.backgroundCompositionService.compositionEngine
    return {
      key: engine.keyCenter || defaults.key,
      mode: engine.mode || defaults.mode,
      tempo: engine.tempo || defaults.tempo
    }
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
  activateForRoom(roomId, sources, musicalContext = null) {
    // Entry #213: Get current harmonic context from BackgroundCompositionService
    // instead of using static defaults, ensuring virtual users start in sync
    const currentContext = this._getCurrentHarmonicContext()
    const resolvedContext = musicalContext
      ? { ...currentContext, ...musicalContext }
      : currentContext

    if (this.activeRooms.has(roomId)) {
      // Already active, update sources if needed
      const state = this.activeRooms.get(roomId)
      state.sources = sources
      state.musicalContext = resolvedContext
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
      musicalContext: resolvedContext,
      isActive: true,
      gestureGenerationTimers: new Map(),  // Per-source timers for staggered gestures
      staggerTimers: [],  // Initial stagger setTimeout IDs (cleaned on deactivation)
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
   * Activate virtual users for landing page
   * Uses 3 sources (wikipedia, hackernews, github) with landing-specific balancing
   * Creates isolated context from normal rooms
   */
  activateForLanding() {
    const { SOURCE_BALANCING, GESTURE_CONFIG, INTERPOLATION_CONFIG } = require('../constants/virtualUserConfig')

    // Use all 3 sources for landing (rooms use 2)
    const landingSources = ['wikipedia', 'hackernews', 'github']

    // Check if already active
    if (this.activeRooms.has(LANDING_ROOM_ID)) {
      const state = this.activeRooms.get(LANDING_ROOM_ID)
      state.sources = landingSources
      return
    }

    // Get current harmonic context
    const currentContext = this._getCurrentHarmonicContext()

    // Create cursor positions for all 3 sources
    const currentPositions = {}
    const targetPositions = {}
    for (const source of landingSources) {
      const initial = this.initialPositions[source] || { x: 0.5, y: 0.5 }
      currentPositions[source] = { ...initial }
      targetPositions[source] = { ...initial }
    }

    // Create landing-specific room state
    // Note: Uses landing balancing profile via the context passed to base class
    const roomState = {
      roomId: LANDING_ROOM_ID,
      sources: landingSources,
      musicalContext: currentContext,
      isActive: true,
      isLanding: true,  // Flag for landing-specific behavior
      gestureGenerationTimers: new Map(),  // Per-source timers for staggered gestures
      staggerTimers: [],  // Initial stagger setTimeout IDs (cleaned on deactivation)
      cursorInterpolationTimer: null,
      metricsEmissionTimer: null,  // Timer for dashboard metrics updates
      currentPositions,
      targetPositions,
      // Landing-specific overrides (from virtualUserConfig)
      sourceBalancing: SOURCE_BALANCING.landing,
      gestureConfig: GESTURE_CONFIG.landing,
      interpolationSpeed: INTERPOLATION_CONFIG.landing.speed
    }

    this.activeRooms.set(LANDING_ROOM_ID, roomState)

    // Emit initial cursor positions for all 3 sources
    this._emitAllCursorsForRoom(LANDING_ROOM_ID, roomState)

    // Start interpolation and gesture loops for landing
    this._startCursorInterpolation(LANDING_ROOM_ID, roomState)
    this._startRoomLoops(LANDING_ROOM_ID)

    // Emit activation event with all 3 virtual users
    if (this.io) {
      const virtualUsers = landingSources.map(source => ({
        userId: this.virtualUserConfigs[source].userId,
        color: this.virtualUserConfigs[source].color,
        source
      }))

      this.io.to(LANDING_ROOM_ID).emit('virtual-users-activated', {
        roomId: LANDING_ROOM_ID,
        sources: landingSources,
        virtualUsers,
        timestamp: Date.now(),
        isLanding: true
      })
    }

    // console.log(`🎭 Landing virtual users activated: ${landingSources.join(', ')}`)
  }

  /**
   * Deactivate virtual users for landing
   * Convenience wrapper for deactivateForRoom
   */
  deactivateForLanding() {
    this.deactivateForRoom(LANDING_ROOM_ID, true)
  }

  /**
   * Check if landing virtual users are active
   * @returns {boolean}
   */
  isActiveForLanding() {
    return this.isActiveForRoom(LANDING_ROOM_ID)
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

    // Stop initial stagger timers (may be pending during startup)
    if (roomState.staggerTimers) {
      for (const timerId of roomState.staggerTimers) {
        clearTimeout(timerId)
      }
      roomState.staggerTimers = []
    }

    // Stop all per-source gesture generation timers
    if (roomState.gestureGenerationTimers) {
      for (const [, timerId] of roomState.gestureGenerationTimers.entries()) {
        clearTimeout(timerId)
      }
      roomState.gestureGenerationTimers.clear()
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

    // Per-source gesture generation with staggered offsets
    const defaultTempo = roomState.musicalContext?.tempo || 120
    const defaultBeats = 16  // midpoint of 12-20 range
    const defaultInterval = defaultBeats * (60000 / defaultTempo)

    // Stagger formula: (i / n) distributes n sources across [0, 1-1/n) of interval
    // 2 sources: [0, 0.5] → wikipedia fires immediately, hackernews at ~4s (at 120bpm)
    roomState.sources.forEach((source, i) => {
      const staggerDelay = (i / roomState.sources.length) * defaultInterval
      const staggerTimerId = setTimeout(() => {
        if (this.activeRooms.has(roomId) && roomState.isActive) {
          this._scheduleNextGestureForSource(roomId, source)
        }
      }, staggerDelay)
      roomState.staggerTimers.push(staggerTimerId)
    })
  }

  /**
   * Schedule next gesture generation for a SINGLE source
   * Per-source timers create staggered, alternating gesture distribution
   * @param {string} roomId
   * @param {string} source - Source name (e.g. 'wikipedia', 'hackernews')
   * @private
   */
  _scheduleNextGestureForSource(roomId, source) {
    const roomState = this.activeRooms.get(roomId)
    if (!roomState || !roomState.isActive) return

    // Get tempo from musical context
    const tempo = roomState.musicalContext?.tempo || 120

    // Calculate activity level for THIS source only (not average of all)
    const activity = this.calculateActivityLevel(source, roomState.sourceBalancing)

    // Per-source interval: 12-20 beats (reduced from 16-24 for better distribution)
    // High activity = more frequent (12 beats), Low activity = sparse (20 beats)
    const beatsPerComposition = 20 - (activity * 8)  // 12-20 beats

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
      // Use PHI for deterministic pseudo-randomness based on gesture counter for this source
      const sourceGestureCount = this.gestureCounters[source] || 0
      const jitterPhase = (sourceGestureCount * BaseVirtualUserBehavior.PHI) % 1
      jitter = (jitterPhase - 0.5) * jitterRange
    }
    const interval = baseInterval + jitter

    // Entry #222: Track interval for adaptive bounds
    this.normalizeGestureParam('intervalTiming', interval)

    // Adaptive interval bounds (3-10s for per-source, was 4-12s for combined)
    const stats = this._gestureStats.intervalTiming
    let minInterval = 3000  // Fallback minimum (3s)
    let maxInterval = 10000 // Fallback maximum (10s)

    if (stats.samples.length >= 10) {
      const sorted = [...stats.samples].sort((a, b) => a - b)
      const p10Idx = Math.floor(sorted.length * 0.1)
      const p90Idx = Math.floor(sorted.length * 0.9)
      // Clamp derived bounds to reasonable limits (2s-15s)
      minInterval = Math.max(2000, Math.min(6000, sorted[p10Idx]))
      maxInterval = Math.max(5000, Math.min(15000, sorted[p90Idx]))
    }

    const clampedInterval = Math.max(minInterval, Math.min(maxInterval, interval))

    // Store per-source timer
    const timerId = setTimeout(() => {
      // Defensive check: if room was deleted without proper deactivation, don't reschedule
      if (!this.activeRooms.has(roomId)) {
        return
      }

      try {
        this._generateAndEmitGestureForSource(roomId, source)
      } catch (error) {
        console.error(`⚠️ Gesture generation error for source "${source}" in room ${roomId}:`, error.message)
        // Continue scheduling despite error to maintain service
      }

      // Only reschedule if room still exists and is active
      // Re-fetch roomState to avoid stale closure reference after deactivate/reactivate
      const currentRoomState = this.activeRooms.get(roomId)
      if (currentRoomState && currentRoomState.isActive) {
        this._scheduleNextGestureForSource(roomId, source)
      }
    }, clampedInterval)

    roomState.gestureGenerationTimers.set(source, timerId)
  }

  /**
   * Generate and emit a virtual gesture for a SINGLE source
   * Per-source method enables staggered, alternating gesture distribution
   * @param {string} roomId
   * @param {string} source - Source name (e.g. 'wikipedia', 'hackernews')
   * @private
   */
  _generateAndEmitGestureForSource(roomId, source) {
    const roomState = this.activeRooms.get(roomId)
    if (!roomState || !roomState.isActive || !this.io) return

    // Validate metrics availability
    const metrics = this.webMetricsPoller?.getMetrics()
    if (!metrics) {
      // No metrics available - skip this cycle silently (will retry on next schedule)
      return
    }

    try {
      // Validate source config exists
      const config = this.virtualUserConfigs[source]
      if (!config) return

      const velocity = this.webMetricsPoller?.getVelocity(source) || 0
      const absVelocity = Math.abs(velocity)

      // Update statistics for ALL metrics (same as Landing)
      this.updateStatistics(source, 'velocity', absVelocity)
      if (metrics[source]) {
        for (const [metricName, value] of Object.entries(metrics[source])) {
          if (typeof value === 'number') {
            this.updateStatistics(source, metricName, value)
          }
        }
      }

      // Entry #187f: SIMPLIFIED - Removed velocity-based gating entirely for rooms
      // Use ONLY density filter for gesture gating (~45-55% pass rate per cycle)

      const activityLevel = this.calculateActivityLevel(source, roomState.sourceBalancing)

      // DENSITY FILTER: Probabilistic gesture emission with INVERSE activity modulation
      // Low activity → higher density (more gestures pass, prevents silence)
      // High activity → lower density (fewer gestures pass, prevents chaos)
      const rawDensity = this.gestureConfig.maxDensity -
        (activityLevel * (this.gestureConfig.maxDensity - this.gestureConfig.baseDensityMultiplier))
      const density = this.adaptiveGestureValue('gestureDensity', rawDensity, 0.4, 0.85)

      if (Math.random() > density) {
        // Skip this gesture probabilistically based on density
        return
      }

      // Entry #174: Select duration category using PHI-based cycling
      const { category, durationRange } = this.selectDurationCategory(source, roomState.sourceBalancing)

      // Calculate normalizedVelocity for gesture emission
      const normalizedVelocity = this.normalizeValue(source, 'velocity', absVelocity)

      if (category === 'tap') {
        this._emitTapGesture(roomId, source, config, roomState, normalizedVelocity)
      } else {
        // Short, medium, and long all use drag with different duration ranges
        this._emitDragGesture(roomId, source, config, roomState, normalizedVelocity, velocity, durationRange)
      }
    } catch (sourceError) {
      console.error(`⚠️ VirtualUserService: Error generating gesture for source "${source}" in room ${roomId}:`, sourceError.message)
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
    const activityLevel = this.calculateActivityLevel(source, roomState.sourceBalancing)
    const { min: freqMin, max: freqMax } = config.frequencyRange

    // Map activity level to frequency within tessitura for AUDIO
    let rawFreq = freqMin + (activityLevel * (freqMax - freqMin))

    // Entry #171: Web metrics-driven variation (deterministic, no randomness)
    const webMetrics = this.normalizeWebMetrics()
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
    const position = this.calculateHybridPosition(source, cursorFreq)

    // 3. Emit cursor position synchronized with note
    this._emitCursorAtPosition(roomId, source, config, position)

    // ORGANIC DURATION: Correlate tap duration to stability metric
    const stability = this.calculateStabilityMetric(source)
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

    // Entry #222: Adaptive base velocity using percentile normalization
    // Track velocity values to derive adaptive range instead of hardcoded 0.75
    const rawBaseVelocity = 0.75 + (gh * 0.25)
    const adaptiveBaseVelocity = this.adaptiveGestureValue('gestureVelocity', rawBaseVelocity, 0.5, 1.0)
    // Entry #NEW: Apply genre velocity multiplier for consistency with real users
    const genreMultiplier = getGenreVelocityMultiplier(style)
    const tapVelocity = adaptiveBaseVelocity * genreMultiplier

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
    const webMetrics = this.normalizeWebMetrics()
    const wiki = webMetrics.wikipedia.normalized
    const hn = webMetrics.hackernews.normalized
    const gh = webMetrics.github.normalized

    // Calculate metrics for gesture generation
    const density = this.calculateDensityMetric(source)
    const acceleration = this.webMetricsPoller?.getAcceleration(source) || 0
    const absAccel = Math.abs(acceleration)
    const normalizedAccel = this.normalizeValue(source, 'velocity', absAccel)

    // Calculate curvature from metric variance
    const velocityVariance = normalizedVelocity
    const accelerationVariance = normalizedAccel
    const curvature = accelerationVariance / (velocityVariance + accelerationVariance + 0.1)
    const clampedCurvature = Math.max(0, Math.min(1, curvature))

    // Entry #222: Duration within category range, adaptively modulated
    // Category ranges: tap (50-300ms), short (300-1000ms), medium (1000-3000ms), long (3000-8000ms)
    const { min: rangeMin, max: rangeMax } = durationRange
    // Validate density is finite and in expected range (defensive against NaN/Infinity)
    const safeDensity = Number.isFinite(density) ? Math.max(0, Math.min(1, density)) : 0.5
    const rawDuration = rangeMin + (safeDensity * (rangeMax - rangeMin))
    // Track duration and use adaptive normalization to get better distribution within category
    const phraseDurationMs = this.adaptiveGestureValue('gestureDuration', rawDuration, rangeMin, rangeMax)

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
      intensity: this.calculateActivityLevel(source, roomState.sourceBalancing),
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

    // Entry #222: Adaptive velocity multiplier using percentile normalization
    // Track velocity values to derive adaptive range instead of hardcoded 0.75
    const rawVelocityMultiplier = 0.75 + (gh * 0.25)
    const adaptiveVelocityMultiplier = this.adaptiveGestureValue('gestureVelocity', rawVelocityMultiplier, 0.5, 1.0)
    // Entry #NEW: Apply genre velocity multiplier for consistency with real users
    const genreMultiplier = getGenreVelocityMultiplier(style)
    const velocityMultiplier = adaptiveVelocityMultiplier * genreMultiplier

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
    const startPosition = this.calculateHybridPosition(source, noteData[0].audioFreq, 0)

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
        const notePosition = this.calculateHybridPosition(source, note.audioFreq, noteIndex)

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
   * Note: _calculateGestureIntentThreshold, _calculateActivityLevel, _normalizeWebMetrics,
   * _calculateCurveAmount, _calculateStabilityMetric, _calculateDensityMetric
   * are now inherited from BaseVirtualUserBehavior as calculateGestureIntentThreshold,
   * calculateActivityLevel, normalizeWebMetrics, calculateCurveAmount,
   * calculateStabilityMetric, calculateDensityMetric (without underscore prefix)

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
    const normalizedVelocity = this.normalizeValue(source, 'velocity', velocity)

    // COMBINE MULTIPLE METRICS per axis for non-linear variation
    // Each source uses DIFFERENT metric combinations = unique movement patterns
    let xMetric, yMetric

    switch (source) {
      case 'wikipedia': {
        // X: editsPerMinute * velocity (activity momentum)
        const edits = this.normalizeValue(source, 'editsPerMinute', sourceMetrics.editsPerMinute || 0)
        xMetric = Math.sqrt(edits * normalizedVelocity)

        // Y: avgEditSize * newArticles (content creation intensity)
        const editSize = this.normalizeValue(source, 'avgEditSize', sourceMetrics.avgEditSize || 0)
        const newArticles = this.normalizeValue(source, 'newArticles', sourceMetrics.newArticles || 0)
        yMetric = Math.sqrt(editSize * newArticles)
        break
      }

      case 'hackernews': {
        // X: postsPerMinute * commentCount (engagement momentum)
        const posts = this.normalizeValue(source, 'postsPerMinute', sourceMetrics.postsPerMinute || 0)
        const comments = this.normalizeValue(source, 'commentCount', sourceMetrics.commentCount || 0)
        xMetric = Math.sqrt(posts * comments)

        // Y: avgUpvotes * velocity (popularity momentum)
        const upvotes = this.normalizeValue(source, 'avgUpvotes', sourceMetrics.avgUpvotes || 0)
        yMetric = Math.sqrt(upvotes * normalizedVelocity)
        break
      }

      case 'github': {
        // X: pushesPerMinute * createsPerMinute (code activity)
        const pushes = this.normalizeValue(source, 'pushesPerMinute', sourceMetrics.pushesPerMinute || 0)
        const creates = this.normalizeValue(source, 'createsPerMinute', sourceMetrics.createsPerMinute || 0)
        xMetric = Math.sqrt(pushes * creates)

        // Y: deletesPerMinute * velocity (cleanup momentum)
        const deletes = this.normalizeValue(source, 'deletesPerMinute', sourceMetrics.deletesPerMinute || 0)
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

  // Note: PHI, PHI_SQ, DEFAULT_BALANCING, _selectDurationCategory, _calculateHybridPosition
  // now inherited from BaseVirtualUserBehavior

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
    const startPos = this.calculateHybridPosition(source, startFreq, 0)
    const endPos = this.calculateHybridPosition(source, endFreq, steps)

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
    const baseCurve = this.calculateCurveAmount(source)
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
  // Note: _classifyGestureType, _updateStatistics, _normalizeValue now inherited from BaseVirtualUserBehavior

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
   * Get virtual cursor positions for a room
   * Used by AuthHandler to send initial cursor state to joining clients
   * @param {string} roomId - Room ID
   * @returns {Object} Virtual cursor positions { source: { userId, x, y, color } }
   */
  getVirtualCursors(roomId) {
    const roomState = this.activeRooms.get(roomId)
    if (!roomState) return {}

    const cursors = {}
    for (const source of roomState.sources) {
      const pos = roomState.currentPositions[source] || { x: 0.5, y: 0.5 }
      const config = this.virtualUserConfigs[source]
      if (config) {
        cursors[source] = {
          userId: config.userId,
          x: pos.x,
          y: pos.y,
          color: config.color
        }
      }
    }
    return cursors
  }

  /**
   * Get virtual cursors for landing page
   * Convenience wrapper for getVirtualCursors(LANDING_ROOM_ID)
   * @returns {Object} Virtual cursor positions for all 3 landing sources
   */
  getVirtualCursorsForLanding() {
    return this.getVirtualCursors(LANDING_ROOM_ID)
  }

  /**
   * Get current web metrics for landing page
   * Delegates to webMetricsPoller
   * @returns {Object} Current metrics { wikipedia, hackernews, github }
   */
  getMetricsForLanding() {
    if (!this.webMetricsPoller) {
      return {
        wikipedia: {},
        hackernews: {},
        github: {}
      }
    }
    return this.webMetricsPoller.getMetrics() || {
      wikipedia: {},
      hackernews: {},
      github: {}
    }
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
