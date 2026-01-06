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
        frequencyRange: { min: 65, max: 130 }
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

    // Statistical tracking for dynamic normalization (per source)
    this.metricStatistics = {
      wikipedia: { velocity: { min: Infinity, max: 0, samples: [] } },
      hackernews: { velocity: { min: Infinity, max: 0, samples: [] } },
      github: { velocity: { min: Infinity, max: 0, samples: [] } }
    }
    this.maxSamples = 50

    // Clock for gesture timing
    this.clockTick = 0
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

    console.log(`🎭 Virtual users activated for room ${roomId}: ${sources.join(', ')}`)
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

    console.log(`🎭 Virtual users deactivated for room ${roomId}`)
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
    roomState.cursorInterpolationTimer = setInterval(() => {
      this._interpolateCursors(roomId)
    }, 50)

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
   * @param {string} roomId
   * @private
   */
  _scheduleNextGestureGeneration(roomId) {
    const roomState = this.activeRooms.get(roomId)
    if (!roomState || !roomState.isActive) return

    // Generate every 3-6 seconds based on activity
    const baseInterval = 4000
    const variance = 2000
    const interval = baseInterval + Math.random() * variance

    roomState.gestureGenerationTimer = setTimeout(() => {
      this._generateAndEmitGestures(roomId)
      this._scheduleNextGestureGeneration(roomId)
    }, interval)
  }

  /**
   * Generate and emit virtual gestures for a room
   * @param {string} roomId
   * @private
   */
  _generateAndEmitGestures(roomId) {
    const roomState = this.activeRooms.get(roomId)
    if (!roomState || !roomState.isActive || !this.io) return

    const metrics = this.webMetricsPoller?.getMetrics() || {}

    for (const source of roomState.sources) {
      const velocity = this.webMetricsPoller?.getVelocity(source) || 0
      const absVelocity = Math.abs(velocity)

      // Update statistics for normalization
      this._updateStatistics(source, 'velocity', absVelocity)

      // Normalize velocity
      const normalizedVelocity = this._normalizeValue(source, 'velocity', absVelocity)

      // Only generate gesture if there's activity
      if (normalizedVelocity < 0.1) continue

      // Classify gesture type
      const gestureType = this._classifyGestureType(source, metrics)
      const config = this.virtualUserConfigs[source]

      if (gestureType === 'tap') {
        this._emitTapGesture(roomId, source, config, roomState, normalizedVelocity)
      } else if (gestureType === 'drag') {
        this._emitDragGesture(roomId, source, config, roomState, normalizedVelocity, velocity)
      }
    }
  }

  /**
   * Emit a tap gesture (single short note)
   * @private
   */
  _emitTapGesture(roomId, source, config, roomState, normalizedVelocity) {
    const x = config.region.xMin + Math.random() * (config.region.xMax - config.region.xMin)
    const y = 0.2 + normalizedVelocity * 0.6

    // Update target position
    roomState.targetPositions[source] = { x, y }

    // Calculate frequency from position (same formula as normal rooms)
    const octaveBase = 110 + (1 - y) * 440
    const withinOctave = x * 660
    const rawFreq = octaveBase + withinOctave

    // Constrain to scale
    const rawPitch = Math.round(12 * Math.log2(rawFreq / 440) + 69)
    const pitch = this.harmonicEngine.constrainToScale(rawPitch, roomState.musicalContext.key, roomState.musicalContext.mode)
    const frequency = 440 * Math.pow(2, (pitch - 69) / 12)

    // Emit tap note - use wrapper format expected by main.js
    this.io.to(roomId).emit('musical:event', {
      event: {
        type: 'tap',
        properties: {
          frequency,
          velocity: 80, // 0-100 scale for backend format
          duration: 0.5, // Longer duration for audible tap (500ms)
          gestureAction: 'tap',
          articulation: 'marcato', // Use marcato for proper musical envelope
          isStreamed: false,
          totalNotes: 1,
          noteIndex: 0
        },
        position: { x, y },
        userColor: config.color,
        isRemote: true,
        isVirtual: true,
        timestamp: Date.now()
      },
      userId: config.userId
    })
  }

  /**
   * Emit a drag gesture (multi-note phrase using PhraseMorphology)
   * Same approach as LandingCompositionService - uses PhraseMorphology to generate
   * proper phrases with timing that emerges from the gesture data.
   * @private
   */
  _emitDragGesture(roomId, source, config, roomState, normalizedVelocity, rawVelocity) {
    // Starting position
    const startX = config.region.xMin + Math.random() * (config.region.xMax - config.region.xMin)
    const startY = 0.2 + normalizedVelocity * 0.6

    // Trajectory end position based on velocity direction
    const direction = rawVelocity >= 0 ? 1 : -1
    const trajectoryLength = 0.1 + normalizedVelocity * 0.2
    const endX = Math.max(config.region.xMin, Math.min(config.region.xMax,
      startX + direction * trajectoryLength * (config.region.xMax - config.region.xMin)))
    const endY = Math.max(0.05, Math.min(0.95, startY + direction * trajectoryLength * 0.3))

    // Update target position for cursor interpolation
    roomState.targetPositions[source] = { x: startX, y: startY }

    // Phrase duration emerges from velocity (300-2000ms)
    const phraseDurationMs = 300 + normalizedVelocity * 1700

    // Calculate curvature from velocity variance
    const curvature = Math.min(0.8, normalizedVelocity * 0.5)

    // Create gestureData for PhraseMorphology (same format as LandingCompositionService)
    const gestureData = {
      velocity: normalizedVelocity * 100,  // 0-100 range
      trajectory: { startX, startY, endX, endY },
      curvature,
      duration: phraseDurationMs
    }

    // Generate phrase using PhraseMorphology
    const phrase = this.phraseMorphology.generatePhrase(gestureData, roomState.musicalContext)
    const beatDurationMs = (60 / roomState.musicalContext.tempo) * 1000

    // Emit phrase event (for visual system)
    this.io.to(roomId).emit('musical:event', {
      event: {
        type: 'phrase',
        properties: {
          velocity: normalizedVelocity,
          noteCount: phrase.notes.length,
          gestureAction: 'phrase',
          isStreamed: true,
          totalNotes: phrase.notes.length
        },
        isRemote: true,
        isVirtual: true,
        timestamp: Date.now()
      },
      userId: config.userId
    })

    // Emit each note with timing from PhraseMorphology (same as LandingCompositionService)
    phrase.notes.forEach((note, i) => {
      if (typeof note.pitch !== 'number' || isNaN(note.pitch)) return

      const noteId = `virtual_${source}_${Date.now()}_${i}`
      const noteFreq = 440 * Math.pow(2, (note.pitch - 69) / 12)
      if (isNaN(noteFreq) || !isFinite(noteFreq)) return

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
   * Classify gesture type based on metrics
   * @private
   */
  _classifyGestureType(source, metrics) {
    const velocity = Math.abs(this.webMetricsPoller?.getVelocity(source) || 0)
    // Lower velocity = more stable = tap
    // Higher velocity = more dynamic = drag
    return velocity < 3 ? 'tap' : 'drag'
  }

  /**
   * Update statistics for dynamic normalization
   * @private
   */
  _updateStatistics(source, metricName, value) {
    const stats = this.metricStatistics[source]?.[metricName]
    if (!stats) return

    stats.min = Math.min(stats.min, value)
    stats.max = Math.max(stats.max, value)

    stats.samples.push(value)
    if (stats.samples.length > this.maxSamples) {
      stats.samples.shift()
    }
  }

  /**
   * Normalize value using historical min/max
   * @private
   */
  _normalizeValue(source, metricName, value) {
    const stats = this.metricStatistics[source]?.[metricName]
    if (!stats || stats.min === Infinity || stats.max === 0) return 0.5

    const range = stats.max - stats.min
    if (range === 0) return 0.5

    return Math.max(0, Math.min(1, (value - stats.min) / range))
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
    console.log('🎭 VirtualUserService shutdown complete')
  }
}

module.exports = VirtualUserService
