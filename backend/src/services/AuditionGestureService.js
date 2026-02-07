/**
 * AuditionGestureService
 *
 * Generates virtual gestures for the Audition feature in SynthPanel.
 * These gestures:
 * - Are transmitted to all room participants (like real gestures)
 * - Respect harmonic/stylistic coherence with composition algorithm
 * - Use RAW parameters (not quantized) to avoid feedback loops
 * - Have synchronized cursor movement
 *
 * Reuses patterns from VirtualUserService:
 * - PHI-based timing for natural distribution
 * - Position calculation from frequency
 * - hold:start/hold:end event pattern
 */

// Golden ratio constants for optimal distribution
const PHI = 1.618033988749895
const PHI_SQ = 2.618033988749895

class AuditionGestureService {
  /**
   * @param {Object} io - Socket.io server instance
   * @param {Object} backgroundCompositionService - Reference to BackgroundCompositionService
   * @param {Object} webMetricsPoller - Reference to WebMetricsPoller (optional)
   */
  constructor (io, backgroundCompositionService, webMetricsPoller = null) {
    this.io = io
    this.backgroundCompositionService = backgroundCompositionService
    this.webMetricsPoller = webMetricsPoller

    // Active audition sessions: socketId -> AuditionState
    this.activeAuditions = new Map()

    // HarmonicEngine reference for pitch quantization
    this.harmonicEngine = null

    // Cursor emission throttle: track last emission time per socket
    this._lastCursorEmission = new Map()
    this._cursorThrottleMs = 100 // 10Hz max (100ms between emissions)

    // Frequency range for synth (A2 to A5)
    this.baseFrequencyRange = {
      min: 110,
      max: 880
    }
  }

  /**
   * Set shared HarmonicEngine for pitch quantization
   * @param {Object} harmonicEngine - HarmonicEngine instance
   */
  setHarmonicEngine (harmonicEngine) {
    if (harmonicEngine && typeof harmonicEngine.constrainToScale === 'function') {
      this.harmonicEngine = harmonicEngine
      console.log('[AuditionGesture] HarmonicEngine connected')
    }
  }

  /**
   * Start audition gesture generation for a socket
   * @param {string} socketId - Socket ID of the user
   * @param {string} roomId - Room ID
   * @param {Object} params - Audition parameters from UI
   * @param {string} userId - Real user ID (not 'audition-user')
   * @param {string} userColor - Real user color
   * @returns {Object} Audition state
   */
  startAudition (socketId, roomId, params, userId, userColor) {
    // Stop any existing audition for this socket
    if (this.activeAuditions.has(socketId)) {
      this.stopAudition(socketId)
    }

    const state = {
      socketId,
      roomId,
      // Use real user identity (not 'audition-user')
      userId: userId || socketId,
      userColor: userColor || '#6bcf7f',
      params: {
        source: params.source || 'random',
        frequency: params.frequency ?? 0.5,
        regularity: params.regularity ?? 0.5,
        uniformity: params.uniformity ?? 0.5,
        gestureType: params.gestureType ?? 0.5,
        range: params.range ?? 0.5
      },
      isActive: true,
      isPaused: false, // For pause/resume on real gesture
      gestureTimer: null,
      // Issue #7: gestureCount resets to 0 on each session start.
      // This is by design - each audition session starts fresh.
      // PHI-based distribution ensures natural variation regardless of start value.
      gestureCount: 0,
      currentPosition: { x: 0.5, y: 0.5 },
      targetPosition: { x: 0.5, y: 0.5 },
      // Issue #2 fix: Track all pending timers for cleanup
      pendingTimers: [],
      // Track active noteIds for hold:end flush on stop/disconnect
      activeNotes: []
    }

    this.activeAuditions.set(socketId, state)

    console.log(`[AuditionGesture] Started for user ${userId} (socket ${socketId}) in room ${roomId}`)

    // Generate first gesture immediately
    this._generateAndEmitGesture(socketId)

    // Schedule subsequent gestures
    this._scheduleNextGesture(socketId)

    return state
  }

  /**
   * Stop audition gesture generation for a socket
   * Issue #2 fix: Properly clear all pending timers to prevent memory leaks
   * @param {string} socketId - Socket ID
   */
  stopAudition (socketId) {
    const state = this.activeAuditions.get(socketId)
    if (state) {
      state.isActive = false

      // Clear main gesture scheduling timer
      if (state.gestureTimer) {
        clearTimeout(state.gestureTimer)
        state.gestureTimer = null
      }

      // Issue #2 fix: Clear ALL pending timers (note emissions, hold:end, etc.)
      if (state.pendingTimers && state.pendingTimers.length > 0) {
        state.pendingTimers.forEach(timerId => clearTimeout(timerId))
        state.pendingTimers = []
      }

      // Flush active notes: emit hold:end immediately to prevent hanging visuals
      this._flushActiveNotes(state)

      this.activeAuditions.delete(socketId)

      // Clean up cursor throttle tracking
      this._lastCursorEmission.delete(socketId)

      console.log(`[AuditionGesture] Stopped for socket ${socketId}`)
    }
  }

  /**
   * Pause audition gesture generation (when user starts a real gesture)
   * Critical fix: Also clears pendingTimers to prevent notes playing during pause
   * @param {string} socketId - Socket ID
   */
  pauseAudition (socketId) {
    const state = this.activeAuditions.get(socketId)
    if (state && state.isActive && !state.isPaused) {
      state.isPaused = true

      // Clear pending gesture scheduling timer
      if (state.gestureTimer) {
        clearTimeout(state.gestureTimer)
        state.gestureTimer = null
      }

      // Critical: Clear ALL pending note timers to stop notes during pause
      if (state.pendingTimers && state.pendingTimers.length > 0) {
        state.pendingTimers.forEach(timerId => clearTimeout(timerId))
        state.pendingTimers = []
      }

      // Flush active notes to prevent hanging on pause
      this._flushActiveNotes(state)

      console.log(`[AuditionGesture] Paused for socket ${socketId}`)
    }
  }

  /**
   * Resume audition gesture generation (when user ends their real gesture)
   * @param {string} socketId - Socket ID
   */
  resumeAudition (socketId) {
    const state = this.activeAuditions.get(socketId)
    if (state && state.isActive && state.isPaused) {
      state.isPaused = false
      // Resume gesture scheduling
      this._scheduleNextGesture(socketId)
      console.log(`[AuditionGesture] Resumed for socket ${socketId}`)
    }
  }

  /**
   * Update audition parameters
   * @param {string} socketId - Socket ID
   * @param {Object} params - New parameters (partial update)
   */
  updateParams (socketId, params) {
    const state = this.activeAuditions.get(socketId)
    if (state) {
      state.params = { ...state.params, ...params }
      console.log(`[AuditionGesture] Params updated for socket ${socketId}:`, state.params)
    }
  }

  /**
   * Flush all active notes by emitting hold:end immediately.
   * Prevents hanging visuals when audition is stopped or paused.
   * @param {Object} state - Audition state
   * @private
   */
  _flushActiveNotes (state) {
    if (!state.activeNotes || state.activeNotes.length === 0) return

    for (const note of state.activeNotes) {
      this.io.to(note.roomId).emit('hold:end', {
        type: 'hold:end',
        userId: note.userId,
        noteId: note.noteId,
        isAudition: true,
        timestamp: Date.now()
      })
    }

    state.activeNotes = []
  }

  /**
   * Clean up auditions for a room (called when room is destroyed)
   * @param {string} roomId - Room ID
   */
  cleanupRoom (roomId) {
    for (const [socketId, state] of this.activeAuditions) {
      if (state.roomId === roomId) {
        this.stopAudition(socketId)
      }
    }
  }

  // ============================================================
  // PRIVATE: GESTURE SCHEDULING
  // ============================================================

  /**
   * Schedule next gesture with PHI-based timing
   * @param {string} socketId - Socket ID
   * @private
   */
  _scheduleNextGesture (socketId) {
    const state = this.activeAuditions.get(socketId)
    if (!state || !state.isActive || state.isPaused) return

    const { frequency, regularity } = state.params

    // Base interval: 500ms (fast) to 4000ms (slow)
    // frequency=1 → 500ms, frequency=0 → 4000ms
    const baseInterval = 500 + (1 - frequency) * 3500

    // Regularity affects jitter: 0 = high variance, 1 = precise timing
    const jitterRange = baseInterval * 0.5 * (1 - regularity)
    const randomJitter = (Math.random() - 0.5) * 2 * jitterRange

    // PHI-based variation for natural feel
    const phiVariation = ((state.gestureCount * PHI) % 1 - 0.5) * 0.2 * baseInterval

    const interval = Math.max(200, baseInterval + randomJitter + phiVariation)

    state.gestureTimer = setTimeout(() => {
      if (!state.isActive) return
      this._generateAndEmitGesture(socketId)
      this._scheduleNextGesture(socketId)
    }, interval)
  }

  /**
   * Generate and emit a gesture (tap or drag)
   * @param {string} socketId - Socket ID
   * @private
   */
  _generateAndEmitGesture (socketId) {
    const state = this.activeAuditions.get(socketId)
    if (!state || !state.isActive || state.isPaused || !this.io) return

    state.gestureCount++

    const { source, uniformity, gestureType, range } = state.params

    // Determine tap vs drag based on gestureType parameter
    const isTap = this._shouldBeTap(gestureType, state.gestureCount)

    // Get activity level from metrics or random
    const activityLevel = this._getActivityLevel(source)

    // Calculate frequency range based on range parameter
    const { minFreq, maxFreq } = this._calculateFrequencyRange(range)

    // Generate frequency within range (uniformity affects variance)
    const noteFrequency = this._generateFrequency(minFreq, maxFreq, uniformity, state.gestureCount, activityLevel)

    // Calculate position from frequency (reverse mapping)
    const position = this._frequencyToPosition(noteFrequency, minFreq, maxFreq, state.gestureCount)

    // Update cursor position
    state.targetPosition = position
    this._emitCursorPosition(state.roomId, socketId, position, state)

    if (isTap) {
      this._emitTapGesture(state, noteFrequency, position, activityLevel)
    } else {
      this._emitDragGesture(state, noteFrequency, position, activityLevel, uniformity)
    }
  }

  // ============================================================
  // PRIVATE: GESTURE TYPE SELECTION
  // ============================================================

  /**
   * Determine if gesture should be tap (vs drag) using PHI-based selection
   * @param {number} gestureType - 0=all taps, 1=all drags
   * @param {number} gestureCount - Current gesture count
   * @returns {boolean} True if should be tap
   * @private
   */
  _shouldBeTap (gestureType, gestureCount) {
    // PHI-based selection for natural distribution
    const selector = ((gestureCount * PHI) % 1)
    // gestureType: 0 = all taps (selector always > 0), 1 = all drags (selector always < 1)
    return selector > gestureType
  }

  // ============================================================
  // PRIVATE: FREQUENCY CALCULATION
  // ============================================================

  /**
   * Calculate effective frequency range based on range parameter
   * @param {number} rangeParam - 0=minor 3rd, 1=5 octaves
   * @returns {{minFreq: number, maxFreq: number}}
   * @private
   */
  _calculateFrequencyRange (rangeParam) {
    // Range: 0 = minor 3rd (3 semitones), 1 = 5 octaves (60 semitones)
    const minRangeSemitones = 3
    const maxRangeSemitones = 60

    const rangeInSemitones = minRangeSemitones + rangeParam * (maxRangeSemitones - minRangeSemitones)

    // Center frequency (E4 = 329.63 Hz)
    const centerFreq = 329.63
    const halfRangeSemitones = rangeInSemitones / 2
    const ratio = Math.pow(2, halfRangeSemitones / 12)

    return {
      minFreq: Math.max(32, centerFreq / ratio), // Min: C1
      maxFreq: Math.min(4000, centerFreq * ratio) // Max: B7
    }
  }

  /**
   * Generate a frequency within range
   * @param {number} minFreq - Minimum frequency
   * @param {number} maxFreq - Maximum frequency
   * @param {number} uniformity - 0=varied, 1=similar
   * @param {number} gestureCount - Current gesture count
   * @param {number} activityLevel - Activity level 0-1
   * @returns {number} Frequency in Hz
   * @private
   */
  _generateFrequency (minFreq, maxFreq, uniformity, gestureCount, activityLevel) {
    const center = (minFreq + maxFreq) / 2
    const fullRange = maxFreq - minFreq

    // Uniformity reduces effective range (at uniformity=1, range is 20%)
    const effectiveRange = fullRange * (1 - uniformity * 0.8)

    // PHI-based selection within range
    const phiSelector = ((gestureCount * PHI_SQ) % 1)
    const offset = (phiSelector - 0.5) * effectiveRange

    // Activity level biases toward higher (more active) or lower (less active)
    const activityBias = (activityLevel - 0.5) * effectiveRange * 0.3

    const frequency = center + offset + activityBias
    return Math.max(minFreq, Math.min(maxFreq, frequency))
  }

  /**
   * Get activity level from metrics or random
   * @param {string} source - 'random' or 'metrics'
   * @returns {number} Activity level 0-1
   * @private
   */
  _getActivityLevel (source) {
    if (source === 'metrics' && this.webMetricsPoller) {
      const metrics = this.webMetricsPoller.getMetrics()
      if (metrics) {
        const wiki = (metrics.wikipedia?.editsPerMinute || 0) / 50
        const hn = (metrics.hackernews?.postsPerMinute || 0) / 10
        const gh = (metrics.github?.commitsPerMinute || 0) / 30
        const avg = (wiki + hn + gh) / 3
        return Math.max(0, Math.min(1, avg))
      }
    }
    // Random fallback
    return 0.3 + Math.random() * 0.4 // 0.3-0.7 range
  }

  // ============================================================
  // PRIVATE: POSITION CALCULATION
  // ============================================================

  /**
   * Convert frequency to canvas position (reverse mapping)
   * @param {number} frequency - Note frequency
   * @param {number} minFreq - Min frequency of range
   * @param {number} maxFreq - Max frequency of range
   * @param {number} gestureCount - Gesture count for variation
   * @returns {{x: number, y: number}} Canvas position (0.05-0.95)
   * @private
   */
  _frequencyToPosition (frequency, minFreq, maxFreq, gestureCount) {
    const MIN_BOUND = 0.05
    const MAX_BOUND = 0.95
    const RANGE = MAX_BOUND - MIN_BOUND

    // Y from frequency (inverted: high freq = top)
    const normalizedFreq = (frequency - minFreq) / (maxFreq - minFreq)
    const yFromFreq = 1 - normalizedFreq

    // X from PHI-based golden ratio distribution
    const xGolden = (gestureCount * PHI) % 1

    // Add slight variation
    const xBase = 0.3 + xGolden * 0.4 // Center around 0.5, vary ±0.2

    // Apply bounds
    const x = MIN_BOUND + Math.max(0, Math.min(1, xBase)) * RANGE
    const y = MIN_BOUND + Math.max(0, Math.min(1, yFromFreq)) * RANGE

    return { x, y }
  }

  // ============================================================
  // PRIVATE: GESTURE EMISSION
  // ============================================================

  /**
   * Emit cursor position to room using standard cursor:move event
   * Throttled to 10Hz max to prevent excessive network traffic
   * @param {string} roomId - Room ID
   * @param {string} socketId - Socket ID (originator)
   * @param {{x: number, y: number}} position - Canvas position
   * @param {Object} state - Audition state with userId and userColor
   * @private
   */
  _emitCursorPosition (roomId, socketId, position, state) {
    if (!this.io || !state) return

    // Throttle: skip if emitted too recently (10Hz max)
    const now = Date.now()
    const lastEmission = this._lastCursorEmission.get(socketId) || 0
    if (now - lastEmission < this._cursorThrottleMs) {
      return // Skip this emission, too soon
    }
    this._lastCursorEmission.set(socketId, now)

    // Use standard cursor:move event with real user identity
    this.io.to(roomId).emit('cursor:move', {
      userId: state.userId,
      x: position.x,
      y: position.y,
      color: state.userColor,
      isAudition: true, // Flag so frontend knows this is audition-generated
      timestamp: now
    })
  }

  /**
   * Emit a tap gesture (single note)
   * @param {Object} state - Audition state
   * @param {number} frequency - Note frequency
   * @param {{x: number, y: number}} position - Canvas position
   * @param {number} intensity - Note intensity/activity
   * @private
   */
  _emitTapGesture (state, frequency, position, intensity) {
    const noteId = `audition_tap_${Date.now()}_${state.gestureCount}`
    const duration = 0.15 + Math.random() * 0.35 // 150-500ms

    // Get style from composition service for harmonic coherence
    const style = this.backgroundCompositionService?.getCurrentStyleForRoom(state.roomId)

    // Velocity based on intensity
    const velocity = 0.5 + intensity * 0.4 // 0.5-0.9

    // Quantize pitch to scale for harmonic coherence
    const rawPitch = this._frequencyToMidi(frequency)
    const quantizedPitch = this._quantizePitch(rawPitch, state.roomId)
    const quantizedFrequency = 440 * Math.pow(2, (quantizedPitch - 69) / 12)

    // Emit hold:start for remote playback (using real user identity)
    this.io.to(state.roomId).emit('hold:start', {
      type: 'hold:start',
      userId: state.userId,
      noteId: noteId,
      frequency: quantizedFrequency,
      pitch: quantizedPitch,
      velocity: velocity,
      duration: duration,
      position: position,
      userColor: state.userColor,
      isRemote: true,
      isAudition: true,
      timestamp: Date.now(),
      style: style
    })

    // Track active note for flush on stop/disconnect
    state.activeNotes.push({ noteId, roomId: state.roomId, userId: state.userId })

    // Add material to BackgroundCompositionService (RAW params to avoid feedback)
    if (this.backgroundCompositionService) {
      const gestureData = {
        userId: state.userId,
        gesture: {
          type: 'tap',
          duration: duration * 1000,
          intensity: intensity,
          startTime: Date.now(),
          rawParams: true // Skip StyleAnalyzer to avoid feedback
        }
      }
      const musicalPhrase = {
        notes: [{
          pitch: rawPitch,
          duration: duration * 1000,
          velocity: velocity,
          timestamp: Date.now()
        }],
        duration: duration * 1000,
        type: 'tap'
      }
      this.backgroundCompositionService.addMaterial(state.roomId, gestureData, musicalPhrase)
    }

    // Emit hold:end after duration
    // Issue #2 fix: Track timer for cleanup
    const durationMs = duration * 1000
    const holdEndTimer = setTimeout(() => {
      if (!state.isActive) return
      // Remove from active notes
      state.activeNotes = state.activeNotes.filter(n => n.noteId !== noteId)
      this.io.to(state.roomId).emit('hold:end', {
        type: 'hold:end',
        userId: state.userId,
        noteId: noteId,
        isAudition: true,
        position: position,
        userColor: state.userColor,
        duration: durationMs,
        timestamp: Date.now(),
        style: style
      })
    }, durationMs)
    state.pendingTimers.push(holdEndTimer)
  }

  /**
   * Emit a drag gesture (multi-note phrase)
   * @param {Object} state - Audition state
   * @param {number} startFrequency - Starting frequency
   * @param {{x: number, y: number}} startPosition - Starting position
   * @param {number} intensity - Note intensity/activity
   * @param {number} uniformity - Uniformity parameter
   * @private
   */
  _emitDragGesture (state, startFrequency, startPosition, intensity, uniformity) {
    const noteId = `audition_drag_${Date.now()}_${state.gestureCount}`

    // Phrase duration: 500ms to 2500ms (shorter for uniformity=1)
    const phraseDuration = 500 + (1 - uniformity) * 2000
    const noteCount = Math.floor(2 + Math.random() * 5) // 2-6 notes

    // Calculate frequency trajectory (end frequency varies based on uniformity)
    const frequencyVariation = (1 - uniformity) * 200 // More variation when less uniform
    const endFrequency = startFrequency + (Math.random() - 0.5) * 2 * frequencyVariation

    // Get style for harmonic coherence
    const style = this.backgroundCompositionService?.getCurrentStyleForRoom(state.roomId)

    // Emit musical:event for phrase visual (using real user identity)
    this.io.to(state.roomId).emit('musical:event', {
      type: 'phrase',
      userId: state.userId,
      velocity: intensity,
      noteCount: noteCount,
      isRemote: true,
      isAudition: true,
      timestamp: Date.now(),
      style: style
    })

    // Generate and emit individual notes
    const noteInterval = phraseDuration / noteCount
    const notes = []

    for (let i = 0; i < noteCount; i++) {
      const t = noteCount > 1 ? i / (noteCount - 1) : 0
      const noteFreq = startFrequency + (endFrequency - startFrequency) * t

      // Quantize pitch to scale for harmonic coherence
      const rawPitch = this._frequencyToMidi(noteFreq)
      const quantizedPitch = this._quantizePitch(rawPitch, state.roomId)
      const quantizedFrequency = 440 * Math.pow(2, (quantizedPitch - 69) / 12)

      const notePosition = this._frequencyToPosition(
        quantizedFrequency,
        Math.min(startFrequency, endFrequency) * 0.9,
        Math.max(startFrequency, endFrequency) * 1.1,
        state.gestureCount + i
      )

      // Store note for material (raw pitch to avoid harmonic feedback)
      notes.push({
        pitch: rawPitch,
        duration: noteInterval * 0.8,
        velocity: 0.4 + intensity * 0.4,
        timestamp: Date.now() + i * noteInterval
      })

      // Schedule note emission
      // Issue #2 fix: Track all timers for cleanup
      const noteStartTimer = setTimeout(() => {
        if (!state.isActive || state.isPaused) return

        // Update cursor position
        this._emitCursorPosition(state.roomId, state.socketId, notePosition, state)

        const dragNoteId = `${noteId}_${i}`

        this.io.to(state.roomId).emit('hold:start', {
          type: 'hold:start',
          userId: state.userId,
          noteId: dragNoteId,
          frequency: quantizedFrequency,
          pitch: quantizedPitch,
          velocity: 0.4 + intensity * 0.4,
          duration: (noteInterval * 0.8) / 1000,
          position: notePosition,
          userColor: state.userColor,
          isRemote: true,
          isAudition: true,
          suppressVisual: i > 0, // Only first note triggers phrase visual
          timestamp: Date.now(),
          style: style
        })

        // Track active note for flush on stop/disconnect
        state.activeNotes.push({ noteId: dragNoteId, roomId: state.roomId, userId: state.userId })

        // Emit hold:end after note duration
        // Issue #2 fix: Track nested timer
        const noteEndTimer = setTimeout(() => {
          if (!state.isActive) return
          // Remove from active notes
          state.activeNotes = state.activeNotes.filter(n => n.noteId !== dragNoteId)
          this.io.to(state.roomId).emit('hold:end', {
            type: 'hold:end',
            userId: state.userId,
            noteId: dragNoteId,
            isAudition: true,
            timestamp: Date.now()
          })
        }, noteInterval * 0.8)
        state.pendingTimers.push(noteEndTimer)
      }, i * noteInterval)
      state.pendingTimers.push(noteStartTimer)
    }

    // Add drag material to BackgroundCompositionService (RAW params)
    if (this.backgroundCompositionService) {
      const gestureData = {
        userId: state.userId,
        gesture: {
          type: 'drag',
          duration: phraseDuration,
          intensity: intensity,
          startTime: Date.now(),
          rawParams: true // Skip StyleAnalyzer to avoid feedback
        }
      }
      const musicalPhrase = {
        notes: notes,
        duration: phraseDuration,
        type: 'drag'
      }
      this.backgroundCompositionService.addMaterial(state.roomId, gestureData, musicalPhrase)
    }
  }

  // ============================================================
  // PRIVATE: UTILITY
  // ============================================================

  /**
   * Convert frequency to MIDI note number
   * @param {number} frequency - Frequency in Hz
   * @returns {number} MIDI note number
   * @private
   */
  _frequencyToMidi (frequency) {
    return Math.round(12 * Math.log2(frequency / 440) + 69)
  }

  /**
   * Get room's musical context (key and mode)
   * @param {string} roomId - Room ID
   * @returns {{key: string, mode: string}} Musical context
   * @private
   */
  _getMusicalContext (roomId) {
    const roomState = this.backgroundCompositionService?.getRoomState?.(roomId)
    return {
      key: roomState?.musicalContext?.key || 'C',
      mode: roomState?.musicalContext?.mode || 'ionian'
    }
  }

  /**
   * Quantize raw MIDI pitch to current scale
   * @param {number} rawPitch - Raw MIDI pitch
   * @param {string} roomId - Room ID for musical context
   * @returns {number} Quantized MIDI pitch
   * @private
   */
  _quantizePitch (rawPitch, roomId) {
    if (!this.harmonicEngine) return rawPitch

    try {
      const { key, mode } = this._getMusicalContext(roomId)
      return this.harmonicEngine.constrainToScale(rawPitch, key, mode)
    } catch (error) {
      console.warn(`[AuditionGesture] constrainToScale failed: ${error.message}`)
      return rawPitch // Fallback to raw pitch on error
    }
  }
}

module.exports = AuditionGestureService
