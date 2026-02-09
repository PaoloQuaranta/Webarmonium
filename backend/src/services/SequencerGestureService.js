/**
 * SequencerGestureService
 *
 * Backend step sequencer engine for the Sequencer feature in SynthPanel.
 * Generates timed step-based gestures that:
 * - Are transmitted to all room participants (like real gestures)
 * - Respect harmonic/stylistic coherence with composition algorithm
 * - Use RAW pitch (pre-quantization) for addMaterial to avoid harmonic feedback
 * - Sync to system BPM with speed multiplier
 * - Support pause/resume when user makes real gestures
 *
 * Follows patterns from AuditionGestureService:
 * - Timer management with pendingTimers array
 * - Cursor emission throttled at 10Hz
 * - hold:start/hold:end event pattern
 * - Closure-captured values for disconnect safety
 */

class SequencerGestureService {
  /**
   * @param {Object} io - Socket.io server instance
   * @param {Object} backgroundCompositionService - Reference to BackgroundCompositionService
   */
  constructor (io, backgroundCompositionService) {
    this.io = io
    this.backgroundCompositionService = backgroundCompositionService

    // Active sequencer sessions: socketId -> SequencerState
    this.activeSequencers = new Map()

    // HarmonicEngine reference for pitch quantization
    this.harmonicEngine = null

    // Cursor emission throttle: track last emission time per socket
    this._lastCursorEmission = new Map()
    this._cursorThrottleMs = 100 // 10Hz max

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
      console.log('[SequencerGesture] HarmonicEngine connected')
    }
  }

  /**
   * Start sequencer for a socket
   * Idempotent: if already active for this socket, ignores with warning.
   * @param {string} socketId - Socket ID of the user
   * @param {string} roomId - Room ID
   * @param {Object} params - Sequencer parameters from UI
   * @param {string} userId - Real user ID
   * @param {string} userColor - Real user color
   * @returns {Object|null} Sequencer state or null if already active
   */
  startSequencer (socketId, roomId, params, userId, userColor) {
    // Idempotent: if already active, warn and ignore
    if (this.activeSequencers.has(socketId)) {
      console.warn(`[SequencerGesture] Already active for socket ${socketId}, ignoring start`)
      return null
    }

    const steps = Array.isArray(params.steps)
      ? params.steps.slice(0, 16).map(s => ({
        degree: (s && typeof s.degree === 'number' && s.degree >= 1 && s.degree <= 7) ? s.degree : 1,
        octave: (s && typeof s.octave === 'number' && s.octave >= 2 && s.octave <= 5) ? s.octave : 3,
        state: (s && ['normal', 'mute', 'random'].includes(s.state)) ? s.state : 'normal'
      }))
      : Array(8).fill(null).map(() => ({ degree: 1, octave: 3, state: 'normal' }))

    const stepCount = (typeof params.stepCount === 'number' && params.stepCount >= 3 && params.stepCount <= 16)
      ? Math.round(params.stepCount) : 8

    const validSpeeds = [0.25, 0.5, 1, 2, 4, 8]
    const speedMultiplier = validSpeeds.includes(params.speedMultiplier) ? params.speedMultiplier : 1

    const state = {
      socketId,
      roomId,
      userId: userId || socketId,
      userColor: userColor || '#6bcf7f',
      params: {
        stepCount,
        speedMultiplier,
        steps
      },
      isActive: true,
      isPaused: false,
      currentStepIndex: 0,
      currentBPM: this._getSystemBPM(roomId),
      stepTimer: null,
      pendingTimers: [],
      activeNotes: [], // Track active noteIds for hold:end flush on stop
      gestureCount: 0
    }

    this.activeSequencers.set(socketId, state)

    console.log(`[SequencerGesture] Started for user ${userId} (socket ${socketId}) in room ${roomId}, BPM=${state.currentBPM}, speed=${speedMultiplier}x`)

    // Execute first step immediately
    this._executeStep(socketId)

    // Schedule next step
    this._scheduleNextStep(socketId)

    return state
  }

  /**
   * Stop sequencer for a socket
   * Idempotent: if not in map, returns silently.
   * Marks isActive = false FIRST to prevent timer race conditions.
   * @param {string} socketId - Socket ID
   */
  stopSequencer (socketId) {
    const state = this.activeSequencers.get(socketId)
    if (!state) return

    // Mark inactive FIRST to prevent timer race conditions
    state.isActive = false

    // Clear step scheduling timer
    if (state.stepTimer) {
      clearTimeout(state.stepTimer)
      state.stepTimer = null
    }

    // Clear ALL pending timers (hold:end, etc.)
    if (state.pendingTimers && state.pendingTimers.length > 0) {
      state.pendingTimers.forEach(timerId => clearTimeout(timerId))
      state.pendingTimers = []
    }

    // Flush active notes: emit hold:end immediately to prevent hanging notes
    this._flushActiveNotes(state)

    this.activeSequencers.delete(socketId)
    this._lastCursorEmission.delete(socketId)

    console.log(`[SequencerGesture] Stopped for socket ${socketId}`)
  }

  /**
   * Pause sequencer (when user starts a real gesture)
   * Clears pending timers to prevent notes playing during pause.
   * @param {string} socketId - Socket ID
   */
  pauseSequencer (socketId) {
    const state = this.activeSequencers.get(socketId)
    if (state && state.isActive && !state.isPaused) {
      state.isPaused = true

      if (state.stepTimer) {
        clearTimeout(state.stepTimer)
        state.stepTimer = null
      }

      if (state.pendingTimers && state.pendingTimers.length > 0) {
        state.pendingTimers.forEach(timerId => clearTimeout(timerId))
        state.pendingTimers = []
      }

      // Flush active notes to prevent hanging on pause
      this._flushActiveNotes(state)

      console.log(`[SequencerGesture] Paused for socket ${socketId}`)
    }
  }

  /**
   * Resume sequencer (when user ends their real gesture)
   * @param {string} socketId - Socket ID
   */
  resumeSequencer (socketId) {
    const state = this.activeSequencers.get(socketId)
    if (state && state.isActive && state.isPaused) {
      state.isPaused = false
      // Refresh BPM on resume
      state.currentBPM = this._getSystemBPM(state.roomId)
      this._scheduleNextStep(socketId)
      console.log(`[SequencerGesture] Resumed for socket ${socketId}`)
    }
  }

  /**
   * Update sequencer parameters (live update)
   * If stepCount changed, resets currentStepIndex to 0.
   * @param {string} socketId - Socket ID
   * @param {Object} params - New parameters (partial update)
   */
  updateParams (socketId, params) {
    const state = this.activeSequencers.get(socketId)
    if (!state) return

    const oldStepCount = state.params.stepCount

    if (typeof params.stepCount === 'number') {
      state.params.stepCount = params.stepCount
    }
    if (typeof params.speedMultiplier === 'number') {
      state.params.speedMultiplier = params.speedMultiplier
    }
    if (Array.isArray(params.steps)) {
      state.params.steps = params.steps
    }

    // Reset step index if step count changed
    if (state.params.stepCount !== oldStepCount) {
      state.currentStepIndex = 0
    }
  }

  /**
   * Clean up sequencers for a room (called when room is destroyed)
   * @param {string} roomId - Room ID
   */
  cleanupRoom (roomId) {
    for (const [socketId, state] of this.activeSequencers) {
      if (state.roomId === roomId) {
        this.stopSequencer(socketId)
      }
    }
  }

  // ============================================================
  // PRIVATE: STEP SCHEDULING
  // ============================================================

  /**
   * Schedule next step based on BPM and speed multiplier.
   * Refreshes BPM between steps (not during).
   * Enforces minimum 100ms interval to prevent timer flood.
   * @param {string} socketId - Socket ID
   * @private
   */
  _scheduleNextStep (socketId) {
    const state = this.activeSequencers.get(socketId)
    if (!state || !state.isActive || state.isPaused) return

    // Refresh BPM from composition service (safe: between steps)
    state.currentBPM = this._getSystemBPM(state.roomId)

    const rawInterval = (60000 / state.currentBPM) / state.params.speedMultiplier
    // Enforce minimum 100ms interval (max 10 steps/sec)
    const stepIntervalMs = Math.max(100, rawInterval)

    state.stepTimer = setTimeout(() => {
      if (!state.isActive || state.isPaused) return
      this._executeStep(socketId)
      this._scheduleNextStep(socketId)
    }, stepIntervalMs)
  }

  /**
   * Execute a single step: resolve pitch, emit events, advance index.
   * Uses closure-captured values for disconnect safety.
   * @param {string} socketId - Socket ID
   * @private
   */
  _executeStep (socketId) {
    const state = this.activeSequencers.get(socketId)
    if (!state || !state.isActive || state.isPaused) return

    const stepIndex = state.currentStepIndex
    const step = state.params.steps[stepIndex]
    if (!step) {
      state.currentStepIndex = 0
      return
    }

    // Capture values in closure BEFORE any async operation (disconnect-safe)
    const { roomId, userId, userColor } = state
    const stepCount = state.params.stepCount

    // Emit sequencer:step for LED update (to originating socket only)
    const originSocket = this.io.sockets?.sockets?.get(socketId)
    if (originSocket) {
      originSocket.emit('sequencer:step', { stepIndex, userId })
    }

    // Advance index (wrapping)
    state.currentStepIndex = (stepIndex + 1) % stepCount
    state.gestureCount++

    // If muted, skip audio but LED still updates
    if (step.state === 'mute') return

    // Resolve pitch (random for 'random' state steps)
    let degree = step.degree
    let octave = step.octave
    if (step.state === 'random') {
      degree = Math.floor(Math.random() * 7) + 1 // 1-7 uniform
      octave = Math.floor(Math.random() * 4) + 2 // 2-5 uniform
    }

    // Build raw MIDI pitch from scale degree + octave
    const { key, mode } = this._getMusicalContext(roomId)
    const he = this._getHarmonicEngineForRoom(roomId)
    const scale = he?.scales?.[mode] || [0, 2, 4, 5, 7, 9, 11]
    const tonicMidi = he?.getTonicNote?.(key) || 60
    const tonicRoot = tonicMidi % 12 // Pitch class (0-11)
    const scaleInterval = scale[(degree - 1) % scale.length]
    const rawMidi = tonicRoot + scaleInterval + (octave * 12)

    // Quantize for playback
    const quantizedPitch = this._quantizePitch(rawMidi, roomId)
    const quantizedFrequency = 440 * Math.pow(2, (quantizedPitch - 69) / 12)

    // Canvas position
    const position = this._frequencyToPosition(quantizedFrequency, this.baseFrequencyRange.min, this.baseFrequencyRange.max, state.gestureCount)

    // Emit cursor position (throttled 10Hz)
    this._emitCursorPosition(roomId, socketId, position, state)

    // Calculate note duration: 80% of step interval
    const stepInterval = Math.max(100, (60000 / state.currentBPM) / state.params.speedMultiplier)
    const duration = (stepInterval * 0.8) / 1000 // seconds

    const noteId = `seq_${Date.now()}_${stepIndex}`

    // Track active note for flush on stop/pause
    state.activeNotes.push({ noteId, roomId, userId })

    // Get style from composition service for harmonic coherence (consistent with audition pattern)
    const style = this.backgroundCompositionService?.getCurrentStyleForRoom?.(roomId)

    // Emit hold:start for remote playback
    this.io.to(roomId).emit('hold:start', {
      type: 'hold:start',
      userId,
      noteId,
      frequency: quantizedFrequency,
      pitch: quantizedPitch,
      velocity: 0.7,
      duration,
      position,
      userColor,
      isRemote: true,
      isSequencer: true,
      isAudition: false,
      timestamp: Date.now(),
      style: style || null
    })

    // Schedule hold:end — use closure-captured values (disconnect-safe)
    const holdEndTimer = setTimeout(() => {
      // Remove from active notes
      const currentState = this.activeSequencers.get(socketId)
      if (currentState) {
        currentState.activeNotes = currentState.activeNotes.filter(n => n.noteId !== noteId)
      }

      this.io.to(roomId).emit('hold:end', {
        type: 'hold:end',
        userId,
        noteId,
        isSequencer: true,
        timestamp: Date.now()
      })
    }, stepInterval * 0.8)
    state.pendingTimers.push(holdEndTimer)

    // Prune pendingTimers array if too large (memory safeguard)
    if (state.pendingTimers.length > 500) {
      state.pendingTimers = state.pendingTimers.slice(-250)
    }

    // Add material to composition — use RAW pitch (pre-quantization) to avoid harmonic feedback
    if (this.backgroundCompositionService) {
      this.backgroundCompositionService.addMaterial(roomId, {
        userId,
        gesture: {
          type: 'tap',
          duration: duration * 1000,
          intensity: 0.7,
          startTime: Date.now(),
          rawParams: true // Skip StyleAnalyzer to avoid feedback
        }
      }, {
        notes: [{
          pitch: rawMidi, // RAW, not quantizedPitch — prevents harmonic feedback loop
          duration: duration * 1000,
          velocity: 0.7,
          timestamp: Date.now()
        }],
        duration: duration * 1000,
        type: 'tap'
      })
    }
  }

  // ============================================================
  // PRIVATE: POSITION & CURSOR
  // ============================================================

  /**
   * Convert frequency to canvas position (reverse mapping)
   * Reuses same logic as AuditionGestureService.
   * @param {number} frequency - Note frequency
   * @param {number} minFreq - Min frequency of range
   * @param {number} maxFreq - Max frequency of range
   * @param {number} gestureCount - Gesture count for X variation
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

    // X from golden ratio distribution
    const PHI = 1.618033988749895
    const xGolden = (gestureCount * PHI) % 1
    const xBase = 0.3 + xGolden * 0.4

    const x = MIN_BOUND + Math.max(0, Math.min(1, xBase)) * RANGE
    const y = MIN_BOUND + Math.max(0, Math.min(1, yFromFreq)) * RANGE

    return { x, y }
  }

  /**
   * Emit cursor position to room (throttled 10Hz)
   * @param {string} roomId - Room ID
   * @param {string} socketId - Socket ID
   * @param {{x: number, y: number}} position - Canvas position
   * @param {Object} state - Sequencer state
   * @private
   */
  _emitCursorPosition (roomId, socketId, position, state) {
    if (!this.io || !state) return

    const now = Date.now()
    const lastEmission = this._lastCursorEmission.get(socketId) || 0
    if (now - lastEmission < this._cursorThrottleMs) return
    this._lastCursorEmission.set(socketId, now)

    this.io.to(roomId).emit('cursor:move', {
      userId: state.userId,
      x: position.x,
      y: position.y,
      color: state.userColor,
      isSequencer: true,
      timestamp: now
    })
  }

  // ============================================================
  // PRIVATE: NOTE CLEANUP
  // ============================================================

  /**
   * Flush all active notes by emitting hold:end immediately.
   * Prevents hanging notes when sequencer is stopped or paused.
   * @param {Object} state - Sequencer state
   * @private
   */
  _flushActiveNotes (state) {
    if (!state.activeNotes || state.activeNotes.length === 0) return

    for (const note of state.activeNotes) {
      this.io.to(note.roomId).emit('hold:end', {
        type: 'hold:end',
        userId: note.userId,
        noteId: note.noteId,
        isSequencer: true,
        timestamp: Date.now()
      })
    }

    state.activeNotes = []
  }

  // ============================================================
  // PRIVATE: PITCH & MUSICAL CONTEXT
  // ============================================================

  /**
   * Get system BPM from BackgroundCompositionService
   * @param {string} roomId - Room ID
   * @returns {number} BPM (defaults to 120)
   * @private
   */
  _getSystemBPM (roomId) {
    const style = this.backgroundCompositionService?.getCurrentStyleForRoom?.(roomId)
    return style?.tempo || 120
  }

  /**
   * Get the HarmonicEngine for a specific room, falling back to shared engine.
   * @param {string} roomId
   * @returns {HarmonicEngine}
   * @private
   */
  _getHarmonicEngineForRoom (roomId) {
    if (roomId && this.backgroundCompositionService) {
      const roomEngine = this.backgroundCompositionService.getHarmonicEngineForRoom(roomId)
      if (roomEngine) return roomEngine
    }
    return this.harmonicEngine
  }

  /**
   * Get room's musical context (key and mode)
   * @param {string} roomId - Room ID
   * @returns {{key: string, mode: string}} Musical context
   * @private
   */
  _getMusicalContext (roomId) {
    const he = this._getHarmonicEngineForRoom(roomId)
    return {
      key: he?.currentKey || 'C',
      mode: he?.currentMode || 'ionian'
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
    const he = this._getHarmonicEngineForRoom(roomId)
    if (!he) return rawPitch

    try {
      const { key, mode } = this._getMusicalContext(roomId)
      return he.constrainToScale(rawPitch, key, mode)
    } catch (error) {
      console.warn(`[SequencerGesture] constrainToScale failed: ${error.message}`)
      return rawPitch
    }
  }
}

module.exports = SequencerGestureService
