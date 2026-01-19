/**
 * SustainedHoldHandler.js
 * Handles sustained hold gestures with gate-based audio control
 * Extracted from main.js for Phase 2 refactoring
 */
class SustainedHoldHandler {
  constructor(audioService, socketService, visualService = null) {
    this.audioService = audioService
    this.socketService = socketService
    this.visualService = visualService

    // Active hold state
    this.activeLocalHold = null
    this.activeRemoteHolds = new Map()

    // Compositional parameters
    this.compositionalParameters = null
    this.cachedScale = null
  }

  /**
   * Set audio service reference
   * @param {Object} audioService - AudioService instance
   */
  setAudioService(audioService) {
    this.audioService = audioService
  }

  /**
   * Set socket service reference
   * @param {Object} socketService - SocketService instance
   */
  setSocketService(socketService) {
    this.socketService = socketService
  }

  /**
   * Set visual service reference
   * @param {Object} visualService - GenerativeVisualService instance
   */
  setVisualService(visualService) {
    this.visualService = visualService
  }

  /**
   * Update compositional parameters
   * @param {Object} params - Compositional parameters
   */
  updateCompositionalParameters(params) {
    this.compositionalParameters = params
    this.cachedScale = window.MusicalScales?.getScale(params?.scaleType || 'pentatonic') || [0, 2, 4, 7, 9]
  }

  /**
   * Get current scale
   * @returns {Array} Current scale degrees
   */
  getScale() {
    return this.cachedScale || window.MusicalScales?.getScale('pentatonic') || [0, 2, 4, 7, 9]
  }

  /**
   * Calculate frequency from position
   * @param {Object} position - {x, y} position
   * @returns {Object} {frequency, velocity, midiNote}
   */
  calculateFrequencyFromPosition(position) {
    const x = position.x
    const y = position.y

    const scale = this.getScale()
    const baseOctave = window.MusicalConstants.getBaseOctaveFromY(y)

    // Map X position to scale degree
    const scaleIndex = Math.floor(x * scale.length)
    const scaleNote = scale[scaleIndex % scale.length]
    const octaveOffset = Math.floor(scaleIndex / scale.length)
    const midiNote = 60 + (baseOctave - 4) * 12 + scaleNote + octaveOffset * 12

    // Convert MIDI to frequency
    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12)

    // Velocity based on Y position (higher = louder)
    const velocity = 0.6 + (1 - y) * 0.4

    return { frequency, velocity, midiNote }
  }

  /**
   * Handle local sustained hold start
   * @param {Object} holdData - Hold data from gesture capture
   * @returns {boolean} True if hold started successfully
   */
  handleLocalHoldStart(holdData) {
    if (!this.audioService) {
      // console.warn('⚠️ Audio not ready for sustained hold')
      return false
    }

    const { frequency, velocity } = this.calculateFrequencyFromPosition(holdData.position)

    // Get local user ID for per-user timbre routing
    const localUserId = this.socketService?.userId || null

    // Trigger note attack (gate opens) - local user, not remote
    const result = this.audioService.triggerSustainedNoteAttack(frequency, velocity, holdData.position, localUserId, false)

    if (result) {
      // Store note data
      this.activeLocalHold = {
        noteId: holdData.noteId,
        audioNoteId: result.noteId,
        frequency: frequency,
        startTime: result.startTime,
        position: holdData.position,
        velocity: velocity,
        visualStartTime: Date.now()
      }

      // console.log(`✅ Sustained hold started: ${frequency.toFixed(1)}Hz`)

      // Emit to server for multi-user sync
      this.emitHoldStart(holdData, frequency, velocity)

      // Update visual service
      this.updateVisualOnHoldStart(holdData.position)

      return true
    }

    return false
  }

  /**
   * Handle local sustained hold end
   * @param {Object} endData - End data from gesture capture
   */
  handleLocalHoldEnd(endData) {
    if (!this.audioService || !this.activeLocalHold) {
      return
    }

    // console.log('🎵 Sustained hold end:', endData)

    // Trigger note release (gate closes)
    this.audioService.triggerSustainedNoteRelease(this.activeLocalHold.audioNoteId)

    // console.log(`✅ Sustained hold ended: ${endData.duration}ms, reason: ${endData.reason}`)

    // Emit to server for multi-user sync
    this.emitHoldEnd(endData)

    // Update visual service
    this.updateVisualOnHoldEnd()

    // Clear tracking
    this.activeLocalHold = null
  }

  /**
   * Handle remote hold start event
   * @param {Object} data - Remote hold data from socket
   */
  handleRemoteHoldStart(data) {
    if (!data.isRemote || !this.audioService) {
      return
    }

    // console.log(`🌐 Remote hold start: user ${data.userId.substring(0, 8)}, freq ${data.frequency.toFixed(1)}Hz`)

    // Trigger remote note attack with per-user timbre routing
    // Volume reduction (0.7) is now handled internally by AudioService based on isRemote flag
    const result = this.audioService.triggerSustainedNoteAttack(
      data.frequency,
      data.velocity,  // Pass full velocity, AudioService applies remote reduction
      data.position,
      data.userId,    // User ID for per-user synth routing
      true            // isRemote = true for volume reduction
    )

    if (result) {
      // Track remote hold
      this.activeRemoteHolds.set(data.noteId, {
        noteId: data.noteId,
        audioNoteId: result.noteId,
        userId: data.userId,
        frequency: data.frequency,
        startTime: result.startTime,
        position: data.position,
        userColor: data.userColor || '#fb923c',
        visualStartTime: Date.now()
      })

      // Update visual service with remote hold
      if (this.visualService) {
        const color = data.userColor || '#fb923c'
        this.visualService.updateCursorPosition(data.userId, data.position.x, data.position.y, color)
        this.visualService.updateGestureData(data.userId, {
          type: 'hold',
          velocity: 0,
          holdStart: Date.now(),
          isActive: true
        })
      }
    }
  }

  /**
   * Handle remote hold end event
   * @param {Object} data - Remote hold end data from socket
   */
  handleRemoteHoldEnd(data) {
    const remoteHold = this.activeRemoteHolds.get(data.noteId)
    if (!remoteHold) {
      // console.warn(`⚠️ Received hold:end for unknown note: ${data.noteId}`)
      return
    }

    // Release remote note
    if (this.audioService) {
      this.audioService.triggerSustainedNoteRelease(remoteHold.audioNoteId)
    }

    // Update visual service
    if (this.visualService) {
      this.visualService.updateGestureData(data.userId, {
        type: 'idle',
        velocity: 0,
        isActive: false
      })
    }

    // Remove from tracking
    this.activeRemoteHolds.delete(data.noteId)

    // console.log(`🌐 Remote hold end: user ${data.userId.substring(0, 8)}, ${data.duration}ms hold`)
  }

  /**
   * Emit hold start to server
   * @param {Object} holdData - Hold data
   * @param {number} frequency - Note frequency
   * @param {number} velocity - Note velocity
   */
  emitHoldStart(holdData, frequency, velocity) {
    if (!this.socketService || !this.socketService.socket) return

    this.socketService.socket.emit('hold:start', {
      noteId: holdData.noteId,
      userId: this.socketService.userId,
      roomId: this.socketService.roomId,
      position: holdData.position,
      frequency: frequency,
      velocity: velocity,
      timestamp: Date.now()
    }, (response) => {
      if (response && response.success) {
        // console.log(`✅ Hold start acknowledged: ${response.latency}ms latency`)
      } else {
        // console.error('❌ Hold start failed:', response?.error)
      }
    })
  }

  /**
   * Emit hold end to server
   * @param {Object} endData - End data
   */
  emitHoldEnd(endData) {
    if (!this.socketService || !this.socketService.socket || !this.activeLocalHold) return

    this.socketService.socket.emit('hold:end', {
      noteId: this.activeLocalHold.noteId,
      userId: this.socketService.userId,
      roomId: this.socketService.roomId,
      duration: endData.duration,
      finalPosition: endData.finalPosition,
      timestamp: Date.now()
    }, (response) => {
      if (response && response.success) {
        // console.log(`✅ Hold end acknowledged: ${endData.duration}ms hold, ${response.latency}ms latency`)
      } else {
        // console.error('❌ Hold end failed:', response?.error)
      }
    })
  }

  /**
   * Update visual service on hold start
   * @param {Object} position - Hold position
   */
  updateVisualOnHoldStart(position) {
    if (!this.visualService || !this.socketService || !this.socketService.socket) return

    const userId = this.socketService.socket.id
    if (!userId) return // Skip if socket not ready (prevents ghost "local" cursor)
    const color = this.currentUserColor || '#22c55e'

    this.visualService.updateCursorPosition(userId, position.x, position.y, color)
    this.visualService.updateGestureData(userId, {
      type: 'hold',
      velocity: 0,
      holdStart: Date.now(),
      isActive: true
    })
  }

  /**
   * Update visual service on hold end
   */
  updateVisualOnHoldEnd() {
    if (!this.visualService || !this.socketService || !this.socketService.socket) return

    const userId = this.socketService.socket.id
    if (!userId) return // Skip if socket not ready (prevents ghost "local" cursor)

    this.visualService.updateGestureData(userId, {
      type: 'idle',
      velocity: 0,
      isActive: false
    })
  }

  /**
   * Set current user color
   * @param {string} color - User's assigned color
   */
  setCurrentUserColor(color) {
    this.currentUserColor = color
  }

  /**
   * Get active local hold
   * @returns {Object|null} Active local hold data
   */
  getActiveLocalHold() {
    return this.activeLocalHold
  }

  /**
   * Check if local hold is active
   * @returns {boolean} True if local hold is active
   */
  isLocalHoldActive() {
    return this.activeLocalHold !== null
  }

  /**
   * Get count of active remote holds
   * @returns {number} Count of active remote holds
   */
  getActiveRemoteHoldsCount() {
    return this.activeRemoteHolds.size
  }

  /**
   * Release all holds (local and remote)
   */
  releaseAllHolds() {
    // Release local hold
    if (this.activeLocalHold && this.audioService) {
      this.audioService.triggerSustainedNoteRelease(this.activeLocalHold.audioNoteId)
      this.activeLocalHold = null
    }

    // Release all remote holds
    for (const [noteId, holdData] of this.activeRemoteHolds) {
      if (this.audioService) {
        this.audioService.triggerSustainedNoteRelease(holdData.audioNoteId)
      }
    }
    this.activeRemoteHolds.clear()

    // console.log('🛑 All holds released')
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.releaseAllHolds()
    this.audioService = null
    this.socketService = null
    this.visualService = null
    this.compositionalParameters = null
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.SustainedHoldHandler = SustainedHoldHandler
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SustainedHoldHandler
}
