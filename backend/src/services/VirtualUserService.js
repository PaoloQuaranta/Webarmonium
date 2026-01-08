/**
 * VirtualUserService
 * Shared virtual user management for landing room and normal rooms in solo mode
 *
 * When a normal room has only 1 real user, this service activates 2 virtual users
 * that generate gestures from web metrics, providing musical companionship.
 *
 * Key features:
 * - Dynamic source selection (2 most active sources in last 5 minutes)
 * - Virtual cursor interpolation at 20fps
 * - Musical event emission (tap, drag gestures)
 * - Per-room state management (multiple rooms can have virtual users)
 */

const HarmonicEngine = require('./HarmonicEngine')
const PhraseMorphology = require('./PhraseMorphology')

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

    // Virtual user configurations (same as LandingCompositionService)
    this.virtualUserConfigs = {
      wikipedia: {
        userId: 'wikipedia-metrics',
        color: '#e41a1c',
        region: { xMin: 0.05, xMax: 0.33 },
        tessitura: 'bass',
        frequencyRange: { min: 110, max: 220 }  // A2-A3 (FIXED: was 55-110, too low for speakers)
      },
      hackernews: {
        userId: 'hackernews-metrics',
        color: '#ff7f00',
        region: { xMin: 0.33, xMax: 0.66 },
        tessitura: 'tenor',
        frequencyRange: { min: 196, max: 392 }
      },
      github: {
        userId: 'github-metrics',
        color: '#377eb8',
        region: { xMin: 0.66, xMax: 0.95 },
        tessitura: 'soprano',
        frequencyRange: { min: 523, max: 1047 }
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

      // Validate region bounds
      if (!config.region ||
          typeof config.region.xMin !== 'number' ||
          typeof config.region.xMax !== 'number' ||
          config.region.xMin < 0 || config.region.xMin > 1 ||
          config.region.xMax < 0 || config.region.xMax > 1 ||
          config.region.xMin >= config.region.xMax) {
        throw new Error(`VirtualUserService: Invalid region for source "${source}" (must be 0-1 range with xMin < xMax)`)
      }

      // Validate frequency range
      if (!config.frequencyRange ||
          typeof config.frequencyRange.min !== 'number' ||
          typeof config.frequencyRange.max !== 'number' ||
          config.frequencyRange.min <= 0 ||
          config.frequencyRange.min >= config.frequencyRange.max) {
        throw new Error(`VirtualUserService: Invalid frequencyRange for source "${source}"`)
      }
    }

    // Check for region overlaps
    const sortedSources = sources.sort((a, b) =>
      this.virtualUserConfigs[a].region.xMin - this.virtualUserConfigs[b].region.xMin
    )
    for (let i = 0; i < sortedSources.length - 1; i++) {
      const current = this.virtualUserConfigs[sortedSources[i]].region
      const next = this.virtualUserConfigs[sortedSources[i + 1]].region
      if (current.xMax > next.xMin) {
        console.warn(`⚠️ VirtualUserService: Region overlap detected between "${sortedSources[i]}" and "${sortedSources[i + 1]}"`)
      }
    }

    // console.log(`✅ VirtualUserService: ${sources.length} configurations validated`)
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

    // Create room virtual state
    const roomState = {
      roomId,
      sources,
      musicalContext,
      isActive: true,
      // Cursor positions per source
      currentPositions: {},
      targetPositions: {},
      // Timers
      cursorInterpolationTimer: null,
      gestureGenerationTimer: null
    }

    // Initialize cursor positions for selected sources
    sources.forEach(source => {
      const config = this.virtualUserConfigs[source]
      const centerX = (config.region.xMin + config.region.xMax) / 2
      roomState.currentPositions[source] = { x: centerX, y: 0.5 }
      roomState.targetPositions[source] = { x: centerX, y: 0.5 }
    })

    this.activeRooms.set(roomId, roomState)

    // Start loops for this room
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

    // Stop timers
    if (roomState.cursorInterpolationTimer) {
      clearInterval(roomState.cursorInterpolationTimer)
      roomState.cursorInterpolationTimer = null
    }
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
   * Start cursor interpolation and gesture generation loops for a room
   * @param {string} roomId
   * @private
   */
  _startRoomLoops(roomId) {
    const roomState = this.activeRooms.get(roomId)
    if (!roomState) return

    // Cursor interpolation at 20fps (50ms)
    // Store timer ID in closure for self-cleanup if room is deleted
    const cursorTimer = setInterval(() => {
      // Defensive check: if room was deleted without proper deactivation, self-cleanup
      if (!this.activeRooms.has(roomId)) {
        clearInterval(cursorTimer)
        console.warn(`🧹 Orphan cursor timer cleaned up for deleted room ${roomId}`)
        return
      }
      try {
        this._interpolateCursors(roomId)
      } catch (error) {
        console.error(`⚠️ Cursor interpolation error for room ${roomId}:`, error.message)
      }
    }, 50)
    roomState.cursorInterpolationTimer = cursorTimer

    // Gesture generation cycle (schedule first)
    this._scheduleNextGestureGeneration(roomId)
  }

  /**
   * Interpolate cursor positions smoothly
   * @param {string} roomId
   * @private
   */
  _interpolateCursors(roomId) {
    const roomState = this.activeRooms.get(roomId)
    if (!roomState || !roomState.isActive) return

    const cursors = {}

    for (const source of roomState.sources) {
      const config = this.virtualUserConfigs[source]
      const current = roomState.currentPositions[source]
      const target = roomState.targetPositions[source]

      // Easing interpolation (20% per frame)
      const easing = 0.2
      let newX = current.x + (target.x - current.x) * easing
      let newY = current.y + (target.y - current.y) * easing

      // Clamp to region bounds
      newX = Math.max(config.region.xMin, Math.min(config.region.xMax, newX))
      newY = Math.max(0.05, Math.min(0.95, newY))

      roomState.currentPositions[source] = { x: newX, y: newY }

      cursors[source] = {
        userId: config.userId,
        x: newX,
        y: newY,
        color: config.color
      }
    }

    // Broadcast cursor positions
    if (this.io) {
      this.io.to(roomId).emit('virtual-cursors', {
        cursors,
        timestamp: Date.now()
      })
    }
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
    // High activity = frequent compositions (6 beats), Low activity = sparse (12 beats)
    const beatsPerComposition = 12 - (avgActivity * 6)  // 6-12 beats, emerges from activity

    const beatDuration = 60000 / tempo  // milliseconds per beat
    const interval = beatsPerComposition * beatDuration

    // Clamp to reasonable bounds (2-12 seconds)
    const clampedInterval = Math.max(2000, Math.min(12000, interval))

    roomState.gestureGenerationTimer = setTimeout(() => {
      // Defensive check: if room was deleted without proper deactivation, don't reschedule
      if (!this.activeRooms.has(roomId)) {
        console.warn(`🧹 Orphan gesture timer stopped for deleted room ${roomId}`)
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
      console.warn(`⚠️ VirtualUserService: No sources configured for room ${roomId}`)
      return
    }

    for (const source of roomState.sources) {
      try {
        // Validate source config exists
        const config = this.virtualUserConfigs[source]
        if (!config) {
          console.warn(`⚠️ VirtualUserService: Unknown source "${source}" for room ${roomId}`)
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

        // Classify gesture type using relative metrics (no hardcoded thresholds)
        const gestureType = this._classifyGestureType(source)

        if (gestureType === 'tap') {
          this._emitTapGesture(roomId, source, config, roomState, normalizedVelocity)
        } else if (gestureType === 'drag') {
          this._emitDragGesture(roomId, source, config, roomState, normalizedVelocity, velocity)
        }
      } catch (sourceError) {
        console.error(`⚠️ VirtualUserService: Error generating gesture for source "${source}" in room ${roomId}:`, sourceError.message)
        // Continue with other sources
      }
    }
  }

  /**
   * Emit a tap gesture (single short note)
   * UNIFIED: Same emission format as LandingCompositionService
   * Position and duration emerge from metrics
   * @private
   */
  _emitTapGesture(roomId, source, config, roomState, normalizedVelocity) {
    // Position emerges from activity level (same as Landing)
    const activityLevel = this._calculateActivityLevel(source)
    const x = config.region.xMin + (activityLevel * (config.region.xMax - config.region.xMin))
    const y = 0.1 + (normalizedVelocity * 0.8) // Full vertical range

    // Update target position
    roomState.targetPositions[source] = { x, y }

    // Calculate frequency from position (same formula as normal rooms and Landing)
    const octaveBase = 110 + (1 - y) * 440
    const withinOctave = x * 660
    const rawFreq = octaveBase + withinOctave

    // Constrain to scale for harmonic coherence
    const rawPitch = Math.round(12 * Math.log2(rawFreq / 440) + 69)
    const pitch = this.harmonicEngine.constrainToScale(rawPitch, roomState.musicalContext.key, roomState.musicalContext.mode)
    let frequency = 440 * Math.pow(2, (pitch - 69) / 12)

    // TESSITURA ENFORCEMENT: Clamp frequency to virtual user's range using octave wrapping
    // This ensures Wikipedia stays bass, HackerNews stays tenor, GitHub stays soprano
    const { min, max } = config.frequencyRange

    // CRITICAL: Validate frequency to prevent infinite loops (0, NaN, Infinity)
    if (!isFinite(frequency) || frequency <= 0) {
      frequency = min  // Fallback to tessitura minimum
    } else {
      const MAX_ITERATIONS = 20  // Safety limit
      let iterations = 0
      while (frequency < min && iterations < MAX_ITERATIONS) {
        frequency *= 2  // Up an octave
        iterations++
      }
      iterations = 0
      while (frequency > max && iterations < MAX_ITERATIONS) {
        frequency /= 2  // Down an octave
        iterations++
      }
      frequency = Math.max(min, Math.min(max, frequency))  // Final clamp
    }

    // ORGANIC DURATION: Correlate tap duration to stability metric (same as Landing)
    // Higher stability (slower) = longer note
    // Lower stability (faster) = shorter percussive note
    const stability = this._calculateStabilityMetric(source)
    const tapDurationMs = 50 + (stability * 250)  // 50-300ms organic range

    // Quantize to beat grid
    const tempo = roomState.musicalContext?.tempo || 120
    const quantizedBeats = this.phraseMorphology.quantizeGestureDuration(tapDurationMs, tempo)
    const beatDuration = 60 / tempo  // seconds per beat
    const tapDuration = quantizedBeats * beatDuration  // Convert beats to seconds

    // Generate unique note ID
    const noteId = `virtual_${source}_tap_${Date.now()}`

    // Emit hold:start (triggers audio AND visual feedback in frontend)
    this.io.to(roomId).emit('hold:start', {
      type: 'hold:start',
      userId: config.userId,
      noteId: noteId,
      frequency: frequency,
      velocity: 0.9,  // Strong tap (same as Landing)
      duration: tapDuration,
      position: { x, y },
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
          velocity: 0.9,
          timestamp: Date.now()
        }],
        duration: tapDurationMs,
        type: 'tap'
      }
      this.backgroundCompositionService.addMaterial(roomId, gestureData, musicalPhrase)
    }

    // Emit hold:end after duration (resets visual state)
    const tapDurationMs2 = tapDuration * 1000
    setTimeout(() => {
      if (!this.activeRooms.has(roomId)) return
      this.io.to(roomId).emit('hold:end', {
        type: 'hold:end',
        userId: config.userId,
        noteId: noteId,
        isVirtual: true,
        timestamp: Date.now()
      })
    }, tapDurationMs2)
  }

  /**
   * Emit a drag gesture (multi-note phrase using PhraseMorphology)
   * UNIFIED: Same approach as LandingCompositionService
   * Position, trajectory, duration and curvature all emerge from metrics
   * @private
   */
  _emitDragGesture(roomId, source, config, roomState, normalizedVelocity, rawVelocity) {
    // UNIFIED: Position emerges from density metric (same as Landing)
    const density = this._calculateDensityMetric(source)
    const startX = config.region.xMin + (density * (config.region.xMax - config.region.xMin))

    // Y position: based on acceleration (higher acceleration = higher in scene)
    const acceleration = this.webMetricsPoller?.getAcceleration(source) || 0
    const absAccel = Math.abs(acceleration)
    const normalizedAccel = this._normalizeValue(source, 'velocity', absAccel) // Use velocity stats for now
    const startY = 0.1 + (normalizedAccel * 0.8) // Full vertical range

    // UNIFIED: Calculate curvature from metric variance (not hardcoded)
    // Curvature emerges from relationship between velocity and acceleration
    // High acceleration with low velocity = high curvature (sharp changes)
    // Low acceleration with high velocity = low curvature (smooth motion)
    const velocityVariance = normalizedVelocity  // 0-1
    const accelerationVariance = normalizedAccel  // 0-1

    // Formula: curvature = |acceleration| / (|velocity| + |acceleration| + small_constant)
    const curvature = accelerationVariance / (velocityVariance + accelerationVariance + 0.1)
    const clampedCurvature = Math.max(0, Math.min(1, curvature))

    // Trajectory based on acceleration direction and magnitude
    const regionWidth = config.region.xMax - config.region.xMin
    const regionHeight = 0.9  // Full height is 0.05-0.95

    // Direction based on velocity sign
    const direction = rawVelocity >= 0 ? 1 : -1

    // Trajectory length based on normalized acceleration (0.1-0.3 range)
    const trajectoryLength = 0.1 + (normalizedAccel * 0.2)

    // Calculate end position
    const endX = Math.max(config.region.xMin, Math.min(config.region.xMax,
      startX + (direction * trajectoryLength * regionWidth)))
    const endY = Math.max(0.05, Math.min(0.95,
      startY + (direction * trajectoryLength * regionHeight * 0.5)))

    // Update target position for cursor interpolation
    roomState.targetPositions[source] = { x: startX, y: startY }

    // ORGANIC DURATION: Correlate phrase duration to density metric (same as Landing)
    // Higher density = more content magnitude = longer phrase
    const phraseDurationMs = 300 + (density * 2700)  // 300-3000ms organic range

    // Create gestureData for PhraseMorphology with trajectory and DYNAMIC curvature
    const gestureData = {
      velocity: normalizedVelocity * 100,  // 0-100 range
      trajectory: { startX, startY, endX, endY },
      curvature: clampedCurvature,  // EMERGES from velocity/acceleration relationship
      acceleration: acceleration,
      intensity: this._calculateActivityLevel(source),
      duration: phraseDurationMs
    }

    // Generate phrase using PhraseMorphology
    const phrase = this.phraseMorphology.generatePhrase(gestureData, roomState.musicalContext)

    // Guard against empty or invalid phrase
    if (!phrase || !phrase.notes || !Array.isArray(phrase.notes) || phrase.notes.length === 0) {
      console.warn(`⚠️ VirtualUserService: Empty phrase generated for source "${source}" in room ${roomId}`)
      return
    }

    const beatDurationMs = (60 / (roomState.musicalContext.tempo || 120)) * 1000

    // CRITICAL: Add material to BackgroundCompositionService
    // Virtual user gestures must contribute to background composition
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

    // Emit phrase event (for visual system) - direct format like Landing
    this.io.to(roomId).emit('musical:event', {
      type: 'phrase',
      userId: config.userId,
      velocity: Math.min(1, normalizedVelocity),
      noteCount: phrase.notes.length,
      isRemote: true,
      isVirtual: true,
      timestamp: Date.now()
    })

    // Emit each note with timing from PhraseMorphology (same as LandingCompositionService)
    const { min: freqMin, max: freqMax } = config.frequencyRange

    phrase.notes.forEach((note, i) => {
      if (typeof note.pitch !== 'number' || isNaN(note.pitch)) return

      const noteId = `virtual_${source}_${Date.now()}_${i}`
      let noteFreq = 440 * Math.pow(2, (note.pitch - 69) / 12)
      if (isNaN(noteFreq) || !isFinite(noteFreq) || noteFreq <= 0) return

      // TESSITURA ENFORCEMENT: Clamp frequency to virtual user's range using octave wrapping
      const MAX_ITERATIONS = 20  // Safety limit
      let iterations = 0
      while (noteFreq < freqMin && iterations < MAX_ITERATIONS) {
        noteFreq *= 2  // Up an octave
        iterations++
      }
      iterations = 0
      while (noteFreq > freqMax && iterations < MAX_ITERATIONS) {
        noteFreq /= 2  // Down an octave
        iterations++
      }
      noteFreq = Math.max(freqMin, Math.min(freqMax, noteFreq))  // Final clamp

      // Position along trajectory
      const noteProgress = i / Math.max(1, phrase.notes.length - 1)
      const noteX = Math.max(config.region.xMin, Math.min(config.region.xMax,
        startX + (endX - startX) * noteProgress))
      const noteY = Math.max(0.05, Math.min(0.95,
        startY + (endY - startY) * noteProgress))

      // Timing from PhraseMorphology (no artificial spacing)
      const startDelayMs = note.startBeat * beatDurationMs
      const noteDurationMs = note.duration * beatDurationMs

      setTimeout(() => {
        if (!this.activeRooms.has(roomId)) return

        // Update cursor position
        roomState.targetPositions[source] = { x: noteX, y: noteY }

        // Emit hold:start
        this.io.to(roomId).emit('hold:start', {
          type: 'hold:start',
          userId: config.userId,
          noteId,
          frequency: noteFreq,
          velocity: Math.max(0, Math.min(1, (note.velocity || 80) / 127)),
          duration: noteDurationMs / 1000,
          position: { x: noteX, y: noteY },
          userColor: config.color,
          isRemote: true,
          isVirtual: true,
          timestamp: Date.now()
        })

        // Emit hold:end after duration
        setTimeout(() => {
          if (!this.activeRooms.has(roomId)) return
          this.io.to(roomId).emit('hold:end', {
            type: 'hold:end',
            userId: config.userId,
            noteId,
            timestamp: Date.now()
          })
        }, noteDurationMs)
      }, startDelayMs)
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
   * Calculate periodicity metric for gesture classification
   * Higher periodic values = more periodic = hover/modulation gesture
   * Same as LandingCompositionService
   * @param {string} source - Source name
   * @returns {number} Periodicity value (0.0-1.0)
   * @private
   */
  _calculatePeriodicityMetric(source) {
    const metrics = this.webMetricsPoller?.getMetrics()
    if (!metrics || !metrics[source]) return 0.5

    switch (source) {
      case 'wikipedia':
        return this._normalizeValue(source, 'newArticles', metrics[source].newArticles || 0)
      case 'hackernews':
        return this._normalizeValue(source, 'commentCount', metrics[source].commentCount || 0)
      case 'github':
        return this._normalizeValue(source, 'deletesPerMinute', metrics[source].deletesPerMinute || 0)
      default:
        return 0.5
    }
  }

  /**
   * Classify gesture type based on metric characteristics
   * Uses PURE relative comparison: whichever metric is highest determines gesture type
   * NO thresholds - gestures emerge naturally from metric variations
   * Same as LandingCompositionService
   * @param {string} source - Source name
   * @returns {string} Gesture type: 'tap' or 'drag'
   * @private
   */
  _classifyGestureType(source) {
    const stability = this._calculateStabilityMetric(source)
    const density = this._calculateDensityMetric(source)

    // Pure relative comparison: whichever metric is highest determines gesture type
    // NO thresholds - preserves correlation between metrics and gestures
    // Note: We only use tap/drag for normal rooms (no hover modulation like landing)
    if (stability >= density) {
      return 'tap'
    } else {
      return 'drag'  // phrase
    }
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
