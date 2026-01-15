/**
 * SocketEventCoordinator.js
 * Coordinates socket events for audio, visual, and gesture updates
 * Extracted from main.js for Phase 2 refactoring
 */
class SocketEventCoordinator {
  constructor(socketService, audioService, visualService = null, cursorManager = null) {
    this.socketService = socketService
    this.audioService = audioService
    this.visualService = visualService
    this.cursorManager = cursorManager

    // State
    this.isAudioStarted = false
    this.currentRoom = null
    this.userCount = 1
    this.compositionalParameters = null
    this.cachedScale = null
    this.cachedScaleType = null

    // Handlers (set externally)
    this.sustainedHoldHandler = null
    this.dragStreamingHandler = null

    // Callbacks for UI updates
    this.onRoomJoined = null
    this.onUserCountChange = null
    this.onError = null
  }

  /**
   * Set audio service reference
   * @param {Object} audioService - AudioService instance
   */
  setAudioService(audioService) {
    this.audioService = audioService
  }

  /**
   * Set visual service reference
   * @param {Object} visualService - GenerativeVisualService instance
   */
  setVisualService(visualService) {
    this.visualService = visualService
  }

  /**
   * Set cursor manager reference
   * @param {Object} cursorManager - CursorManager instance
   */
  setCursorManager(cursorManager) {
    this.cursorManager = cursorManager
  }

  /**
   * Set sustained hold handler
   * @param {Object} handler - SustainedHoldHandler instance
   */
  setSustainedHoldHandler(handler) {
    this.sustainedHoldHandler = handler
  }

  /**
   * Set drag streaming handler
   * @param {Object} handler - DragStreamingHandler instance
   */
  setDragStreamingHandler(handler) {
    this.dragStreamingHandler = handler
  }

  /**
   * Set audio started state
   * @param {boolean} started - Whether audio is started
   */
  setAudioStarted(started) {
    this.isAudioStarted = started
  }

  /**
   * Register all socket event listeners
   */
  registerEventListeners() {
    if (!this.socketService) {
      // console.warn('⚠️ SocketService not available for event registration')
      return
    }

    // Room events
    this.registerRoomEvents()

    // Cursor events
    this.registerCursorEvents()

    // Audio events
    this.registerAudioEvents()

    // Sustained hold events
    this.registerHoldEvents()

    // Musical events
    this.registerMusicalEvents()

    // Real-time note streaming events
    this.registerNoteStreamEvents()

    // Error events
    this.registerErrorEvents()

    // console.log('✅ SocketEventCoordinator: All event listeners registered')
  }

  /**
   * Register room-related events
   */
  registerRoomEvents() {
    this.socketService.on('room-joined', (data) => {
      this.currentRoom = data.room
      // console.log('🏠 Joined room:', data.room.roomId)

      if (this.onRoomJoined) {
        this.onRoomJoined(data)
      }
    })

    this.socketService.on('user-joined', (data) => {
      this.userCount = data.userCount
      // console.log('👤 User joined, total users:', this.userCount)

      if (this.onUserCountChange) {
        this.onUserCountChange(this.userCount)
      }
    })

    this.socketService.on('user-left', (data) => {
      this.userCount = data.userCount
      // console.log('👋 User left, total users:', this.userCount)

      // Remove user's cursor
      if (data.userId && this.cursorManager) {
        this.cursorManager.removeCursor(data.userId)
      }

      // CRITICAL: Cleanup user's synth on disconnect to prevent memory leak
      // Each user has a dedicated synth that must be disposed when they leave
      if (data.userId && this.audioService?.userSynthManager) {
        this.audioService.userSynthManager.cleanupUserSynth(data.userId)
      }

      if (this.onUserCountChange) {
        this.onUserCountChange(this.userCount)
      }
    })

    // Virtual user events for solo mode
    this.registerVirtualUserEvents()
  }

  /**
   * Register virtual user events for solo mode
   */
  registerVirtualUserEvents() {
    // Virtual users activated (when room enters solo mode)
    this.socketService.on('virtual-users-activated', (data) => {
      console.log('🎭 Virtual users activated:', data.sources)

      if (this.cursorManager && data.virtualUsers) {
        data.virtualUsers.forEach(user => {
          this.cursorManager.addVirtualCursor(user.userId, user.color, true) // fadeIn
        })
      }

      if (this.visualService && data.virtualUsers) {
        data.virtualUsers.forEach(user => {
          this.visualService.addVirtualUser?.(user.userId, user.color)
        })
      }

      // Optional: Show notification
      if (window.NotificationService) {
        window.NotificationService.showVirtualUsersActivated(data.sources)
      }
    })

    // Virtual users deactivated (when room enters multi mode)
    this.socketService.on('virtual-users-deactivated', (data) => {
      console.log('🎭 Virtual users deactivated:', data.sources)

      if (this.cursorManager) {
        this.cursorManager.removeAllVirtualCursors(true) // fadeOut
      }

      if (this.visualService && data.sources) {
        data.sources.forEach(source => {
          const userId = `${source}-metrics`
          this.visualService.removeVirtualUser?.(userId)
        })
      }
    })

    // Virtual cursor position updates
    this.socketService.on('virtual-cursors', (data) => {
      if (!this.cursorManager || !data || !data.cursors) return

      for (const [source, cursor] of Object.entries(data.cursors)) {
        // Validate cursor data structure
        if (!cursor || !cursor.userId || typeof cursor.x !== 'number' || typeof cursor.y !== 'number') {
          console.warn('Invalid virtual cursor data for source:', source, cursor)
          continue
        }

        if (this.cursorManager.isVirtualCursor(cursor.userId)) {
          this.cursorManager.updateVirtualCursor(cursor.userId, cursor.x, cursor.y)
        }

        // Also update visual service
        if (this.visualService) {
          this.visualService.updateCursorPosition?.(
            cursor.userId,
            cursor.x,
            cursor.y,
            cursor.color || '#888888'
          )
        }
      }
    })

    // Mode transition notification
    this.socketService.on('mode-transition', (data) => {
      console.log('🔄 Mode transition:', data.from, '→', data.to)

      if (window.NotificationService) {
        window.NotificationService.showModeTransition(data.message, data.duration || 3000)
      }
    })
  }

  /**
   * Register cursor-related events
   */
  registerCursorEvents() {
    this.socketService.on('cursor-position', (data) => {
      if (this.cursorManager) {
        this.cursorManager.updateCursor(
          data.userId,
          data.x,
          data.y,
          data.color,
          data.isDrawing
        )
      }

      // Update visual service
      if (this.visualService) {
        this.visualService.updateCursorPosition(
          data.userId,
          data.x,
          data.y,
          data.color
        )
      }
    })
  }

  /**
   * Register audio-related events
   */
  registerAudioEvents() {
    // Compositional parameters from collective metrics
    this.socketService.on('compositional-parameters', (data) => {
      this.compositionalParameters = data.parameters
      // console.log('🎼 Updated compositional parameters:', this.compositionalParameters)

      // Update cached scale
      const newScaleType = data.parameters?.scaleType || 'pentatonic'
      if (this.cachedScaleType !== newScaleType) {
        this.cachedScale = window.MusicalScales?.getScale(newScaleType) || [0, 2, 4, 7, 9]
        this.cachedScaleType = newScaleType
        // console.log(`🎼 Cached scale updated: ${newScaleType}`)
      }

      // Update AudioService
      if (this.audioService && this.audioService.updateCompositionalParameters) {
        this.audioService.updateCompositionalParameters(this.compositionalParameters)
      }

      // Update handlers
      if (this.dragStreamingHandler) {
        this.dragStreamingHandler.updateCompositionalParameters(this.compositionalParameters)
      }
      if (this.sustainedHoldHandler) {
        this.sustainedHoldHandler.updateCompositionalParameters(this.compositionalParameters)
      }
    })

    // Sonic updates (pattern updates)
    this.socketService.on('sonic-update', (update) => {
      if (this.isAudioStarted && this.audioService) {
        this.audioService.updatePatterns(update.patterns)
      }
    })

    // Background composition
    this.socketService.on('background-composition', (data) => {
      // console.log('🎼 Background composition received:', {
//        compositionNumber: data.compositionNumber,
//        isDrone: data.isDrone,
//        type: data.composition?.type
////      })

      if (this.isAudioStarted && data.composition && this.audioService) {
        this.audioService.playComposition(data.composition, data.isDrone)
      }
    })
  }

  /**
   * Register sustained hold events
   */
  registerHoldEvents() {
    this.socketService.on('hold:start', (data) => {
      // console.log('🔔 Received hold:start event:', {
//        isRemote: data.isRemote,
//        userId: data.userId?.substring(0, 8)
////      })

      if (!this.isAudioStarted) {
        // console.log('⚠️ Ignoring remote hold - audio not started')
        return
      }

      if (!data.isRemote) {
        // console.log('⚠️ Ignoring hold:start - not marked as remote')
        return
      }

      if (this.sustainedHoldHandler) {
        this.sustainedHoldHandler.handleRemoteHoldStart(data)
      } else if (this.audioService) {
        // Fallback: direct audio handling
        this.handleRemoteHoldStartFallback(data)
      }
    })

    this.socketService.on('hold:end', (data) => {
      if (this.sustainedHoldHandler) {
        this.sustainedHoldHandler.handleRemoteHoldEnd(data)
      }
    })

    // console.log('✅ Sustained hold event listeners registered')
  }

  /**
   * Register musical events
   */
  registerMusicalEvents() {
    // Musical events (drag phrases, etc.)
    this.socketService.on('musical:event', (musicalEventWrapper) => {
      if (!this.isAudioStarted || !musicalEventWrapper?.event) {
        return
      }

      const event = musicalEventWrapper.event
      const remoteUserId = musicalEventWrapper.userId

      // Minimal logging
      if (event.properties?.noteIndex === 0 || !event.properties?.noteIndex) {
        // console.log(`🎵 Remote: ${event.properties?.gestureAction || 'unknown'} - freq=${event.properties?.frequency?.toFixed(0)}Hz`)
      }

      // CRITICAL: Include userId in event for per-user synth routing
      const eventWithUserId = { ...event, userId: remoteUserId }

      // Schedule note playback based on timestamp
      const now = Date.now()
      const eventTime = event.timestamp || now
      const delay = Math.max(0, eventTime - now)

      if (delay > 0) {
        setTimeout(() => {
          if (this.isAudioStarted && this.audioService) {
            this.audioService.playMusicalEvent(eventWithUserId)
          }
        }, delay)
      } else {
        if (this.audioService) {
          this.audioService.playMusicalEvent(eventWithUserId)
        }
      }
    })
  }

  /**
   * Register note stream events for real-time drag note playback from remote users
   */
  registerNoteStreamEvents() {
    this.socketService.on('note:stream', (data) => {
      if (!this.isAudioStarted || !data?.event) {
        return
      }

      const event = data.event
      const remoteUserId = data.userId

      // Include userId for per-user synth routing
      const eventWithUserId = { ...event, userId: remoteUserId }

      // Play immediately - no delay for real-time streaming
      if (this.audioService) {
        this.audioService.playMusicalEvent(eventWithUserId)
      }
    })
  }

  /**
   * Register error events
   */
  registerErrorEvents() {
    this.socketService.on('connect_error', (error) => {
      // console.error('❌ Socket connection error:', error)
      if (this.onError) {
        this.onError('Unable to connect to server. Please ensure the backend is running on port 3001.')
      }
    })

    this.socketService.on('room-full', (data) => {
      // console.error('❌ Room is full:', data.error)
      if (this.onError) {
        this.onError(`Unable to join room: ${data.error}. Maximum capacity (10 users) reached.`)
      }
    })
  }

  /**
   * Fallback handler for remote hold start when no handler is set
   * @param {Object} data - Remote hold data
   */
  handleRemoteHoldStartFallback(data) {
    // console.log(`🌐 Remote hold start (fallback): user ${data.userId.substring(0, 8)}, freq ${data.frequency.toFixed(1)}Hz`)

    // Include userId for per-user synth routing, isRemote=true for volume reduction
    const result = this.audioService.triggerSustainedNoteAttack(
      data.frequency,
      data.velocity,  // Pass full velocity - AudioService applies remote reduction
      data.position,
      data.userId,    // User ID for per-user synth routing
      true            // isRemote = true
    )

    if (result && this.visualService) {
      const color = data.userColor || '#ff6b6b'
      this.visualService.updateCursorPosition(data.userId, data.position.x, data.position.y, color)
      this.visualService.updateGestureData(data.userId, {
        type: 'hold',
        velocity: 0,
        holdStart: Date.now(),
        isActive: true
      })
    }
  }

  /**
   * Get current room
   * @returns {Object|null} Current room data
   */
  getCurrentRoom() {
    return this.currentRoom
  }

  /**
   * Get user count
   * @returns {number} Current user count
   */
  getUserCount() {
    return this.userCount
  }

  /**
   * Get compositional parameters
   * @returns {Object|null} Current compositional parameters
   */
  getCompositionalParameters() {
    return this.compositionalParameters
  }

  /**
   * Cleanup
   */
  cleanup() {
    // Socket service event cleanup is handled by socket disconnect
    this.socketService = null
    this.audioService = null
    this.visualService = null
    this.cursorManager = null
    this.sustainedHoldHandler = null
    this.dragStreamingHandler = null
    this.compositionalParameters = null
    // console.log('✅ SocketEventCoordinator cleanup completed')
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.SocketEventCoordinator = SocketEventCoordinator
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SocketEventCoordinator
}
