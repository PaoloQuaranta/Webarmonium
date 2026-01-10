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
    this.virtualUserConfigs = {
      wikipedia: {
        userId: 'wikipedia-metrics',
        color: '#e41a1c',
        tessitura: 'bass',
        frequencyRange: { min: 110, max: 220 }  // A2-A3
      },
      hackernews: {
        userId: 'hackernews-metrics',
        color: '#ff7f00',
        tessitura: 'tenor',
        frequencyRange: { min: 196, max: 392 }  // G3-G4
      },
      github: {
        userId: 'github-metrics',
        color: '#377eb8',
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

    // Interpolation settings for smooth cursor movement
    this.interpolationInterval = 50  // 20fps
    this.interpolationSpeed = 0.15   // How fast to approach target (0-1)

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
   * Set RoomManager reference for HoverOrchestrator access
   * Required for hover gesture modulation support
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
        console.log(`🎭 VirtualUser ${source} gesture: type=${gestureType}, velocity=${normalizedVelocity.toFixed(3)}`)

        if (gestureType === 'tap') {
          this._emitTapGesture(roomId, source, config, roomState, normalizedVelocity)
        } else if (gestureType === 'drag') {
          this._emitDragGesture(roomId, source, config, roomState, normalizedVelocity, velocity)
        } else if (gestureType === 'hover') {
          this._emitHoverGesture(roomId, source, config, roomState)
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
    // 1. Calculate AUDIO frequency (constrained to tessitura)
    const activityLevel = this._calculateActivityLevel(source)
    const { min: freqMin, max: freqMax } = config.frequencyRange

    // Map activity level to frequency within tessitura for AUDIO
    let rawFreq = freqMin + (activityLevel * (freqMax - freqMin))

    // Convert to MIDI pitch and constrain to scale
    const rawPitch = Math.round(12 * Math.log2(rawFreq / 440) + 69)
    const pitch = this.harmonicEngine.constrainToScale(rawPitch, roomState.musicalContext.key, roomState.musicalContext.mode)
    let frequency = 440 * Math.pow(2, (pitch - 69) / 12)

    // Ensure audio frequency stays within tessitura using octave wrapping
    frequency = this.frequencyMapper.enforceTessitura(frequency, freqMin, freqMax)

    // 2. Calculate POSITION on FULL CANVAS (independent of tessitura)
    // Cursor can move freely across entire canvas based on activity level
    const fullCanvasFreq = 110 + (activityLevel * 1100) // Full range: 110-1210Hz
    const position = this.frequencyMapper.frequencyToPosition(fullCanvasFreq)

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

    // 4. Emit hold:start with reverse-mapped position
    this.io.to(roomId).emit('hold:start', {
      type: 'hold:start',
      userId: config.userId,
      noteId: noteId,
      frequency: frequency,
      velocity: 0.9,
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
   * Uses REVERSE MAPPING: cursor trajectory derived from note frequencies
   * @private
   */
  _emitDragGesture(roomId, source, config, roomState, normalizedVelocity, rawVelocity) {
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

    // ORGANIC DURATION: Correlate phrase duration to density metric
    const phraseDurationMs = 300 + (density * 2700)  // 300-3000ms organic range

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
      console.warn(`VirtualUserService: Empty phrase generated for source "${source}" in room ${roomId}`)
      return
    }

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

    // 3. Calculate positions from RAW frequencies (full canvas movement)
    const startFreq = noteData[0].positionFreq
    const endFreq = noteData[noteData.length - 1].positionFreq
    const startPosition = this.frequencyMapper.frequencyToPosition(startFreq)

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

    // 4. Calculate cursor trajectory (linear interpolation)
    const trajectory = this.frequencyMapper.calculateDragTrajectory(
      startFreq, endFreq, phraseDurationMs
    )

    // 5. Emit cursor positions along trajectory (synchronized with phrase duration)
    trajectory.forEach((pos) => {
      setTimeout(() => {
        if (!this.activeRooms.has(roomId)) return
        this._emitCursorAtPosition(roomId, source, config, pos)
      }, pos.timeOffset)
    })

    // 6. Emit notes with their positions
    // - audioFreq for sound (tessitura-constrained)
    // - positionFreq for cursor (full canvas)
    noteData.forEach((note) => {
      setTimeout(() => {
        if (!this.activeRooms.has(roomId)) return

        // Get position from RAW frequency (full canvas movement)
        const notePosition = this.frequencyMapper.frequencyToPosition(note.positionFreq)

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
          this.io.to(roomId).emit('hold:end', {
            type: 'hold:end',
            userId: config.userId,
            noteId: note.noteId,
            timestamp: Date.now()
          })
        }, note.durationMs)
      }, note.startDelayMs)
    })
  }

  /**
   * Emit a hover gesture (no sound, only filter modulation)
   * Cursor position derived from periodicity metric
   * @private
   */
  _emitHoverGesture(roomId, source, config, roomState) {
    const periodicity = this._calculatePeriodicityMetric(source)

    // Calculate position on FULL CANVAS (independent of tessitura)
    // Hover has no audio, only modulation - cursor can move freely
    const fullCanvasFreq = 110 + (periodicity * 1100) // Full range: 110-1210Hz
    const position = this.frequencyMapper.frequencyToPosition(fullCanvasFreq)

    // Emit cursor position
    this._emitCursorAtPosition(roomId, source, config, position)

    const hoverData = {
      userId: config.userId,
      position: position,
      intensity: periodicity,
      velocity: 0,
      isVirtual: true,
      isRemote: true,
      timestamp: Date.now()
    }

    // Send to HoverOrchestrator for modulation processing
    if (this.roomManager) {
      let hoverOrchestrator = this.roomManager.getHoverOrchestrator(roomId)

      if (!hoverOrchestrator) {
        const HoverOrchestrator = require('./HoverOrchestrator')
        hoverOrchestrator = new HoverOrchestrator(roomId, this.io)
        this.roomManager.setHoverOrchestrator(roomId, hoverOrchestrator)
        hoverOrchestrator.start()
      }

      hoverOrchestrator.addHoverEvent(hoverData)
    }

    // Emit to clients for visual feedback
    this.io.to(roomId).emit('hover-update', hoverData)
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
   * @returns {string} Gesture type: 'tap', 'drag', or 'hover'
   * @private
   */
  _classifyGestureType(source) {
    const stability = this._calculateStabilityMetric(source)
    const density = this._calculateDensityMetric(source)
    const periodicity = this._calculatePeriodicityMetric(source)

    console.log(`🎭 ${source} metrics: stability=${stability.toFixed(3)}, density=${density.toFixed(3)}, periodicity=${periodicity.toFixed(3)}`)

    // Pure relative comparison: whichever metric is highest determines gesture type
    // NO thresholds - preserves correlation between metrics and gestures
    // UNIFIED with LandingCompositionService: now includes hover gesture type
    const maxMetric = Math.max(stability, density, periodicity)

    if (maxMetric === stability) {
      return 'tap'
    } else if (maxMetric === density) {
      return 'drag'  // phrase
    } else {
      return 'hover'  // modulation (no sound, only filter modulation)
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
