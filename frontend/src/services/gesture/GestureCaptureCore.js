/**
 * GestureCaptureCore.js
 * Base class for gesture capture with event handling and coordinate normalization
 * Phase 3 refactoring - Decomposed from EnhancedGestureCapture.js
 */
class GestureCaptureCore {
  constructor(canvas, socketService) {
    this.canvas = canvas
    this.socketService = socketService

    // Lifecycle state
    this.isActive = false
    this.isCapturing = false
    this.currentGesture = null

    // User identification
    this.localUserId = this.generateUserId()
    this.currentRoom = null

    // Multi-user tracking
    this.participantGestures = new Map()

    // Gesture history
    const historyConfig = window.GestureConstants?.HISTORY_CONFIG || { maxHistorySize: 50 }
    this.gestureHistory = []
    this.maxHistorySize = historyConfig.maxHistorySize

    // Performance metrics
    this.performanceMetrics = {
      gesturesCaptured: 0,
      gesturesClassified: 0,
      averageProcessingTime: 0,
      classificationAccuracy: 0
    }

    // Event callbacks (set externally)
    this.onGesture = null
    this.onGestureStart = null
    this.onGestureEnd = null
    this.onMultiUserGesture = null
  }

  /**
   * Generate unique user ID
   * @returns {string} User ID
   */
  generateUserId() {
    return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Setup event listeners for gesture capture
   * @param {Object} handlers - Event handler functions
   */
  setupEventListeners(handlers) {
    const { onGestureStart, onGestureMove, onGestureEnd, onHover, onHoverStart, onHoverEnd } = handlers

    // Mouse events
    this.canvas.addEventListener('mousedown', onGestureStart)
    this.canvas.addEventListener('mousemove', onGestureMove)
    this.canvas.addEventListener('mouseup', onGestureEnd)
    this.canvas.addEventListener('mouseleave', onGestureEnd)

    // Touch events
    this.canvas.addEventListener('touchstart', onGestureStart)
    this.canvas.addEventListener('touchmove', onGestureMove)
    this.canvas.addEventListener('touchend', onGestureEnd)
    this.canvas.addEventListener('touchcancel', onGestureEnd)

    // Hover events
    if (onHover) {
      this.canvas.addEventListener('mousemove', onHover)
    }
    if (onHoverStart) {
      this.canvas.addEventListener('mouseenter', onHoverStart)
    }
    if (onHoverEnd) {
      this.canvas.addEventListener('mouseleave', onHoverEnd)
    }

    // Prevent default touch behaviors
    this.canvas.addEventListener('touchstart', (e) => e.preventDefault())
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault())

    // console.log('GestureCaptureCore: Event listeners setup complete')
  }

  /**
   * Start gesture capture
   */
  start() {
    this.isActive = true
    // console.log('GestureCaptureCore started')
  }

  /**
   * Stop gesture capture
   */
  stop() {
    this.isActive = false
    this.isCapturing = false
    this.currentGesture = null
    // console.log('GestureCaptureCore stopped')
  }

  /**
   * Get coordinates from event
   * @param {Event} event - Mouse or touch event
   * @returns {Object|null} Normalized coordinates { x, y } (0-1) or null
   */
  getEventCoordinates(event) {
    const rect = this.canvas.getBoundingClientRect()

    let clientX, clientY

    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX
      clientY = event.touches[0].clientY
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      clientX = event.changedTouches[0].clientX
      clientY = event.changedTouches[0].clientY
    } else {
      clientX = event.clientX
      clientY = event.clientY
    }

    // Convert to normalized coordinates (0-1)
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    }
  }

  /**
   * Get event type (mouse, touch, etc.)
   * @param {Event} event - Input event
   * @returns {string} Event type
   */
  getEventType(event) {
    const eventTypes = window.GestureConstants?.EVENT_TYPES || {
      mouse: 'mouse',
      touch: 'touch',
      unknown: 'unknown'
    }

    if (event.touches) return eventTypes.touch
    if (event.type.includes('mouse')) return eventTypes.mouse
    return eventTypes.unknown
  }

  /**
   * Create new gesture object
   * @param {Object} coordinates - Starting coordinates
   * @param {string} eventType - Event type (mouse/touch)
   * @returns {Object} New gesture object
   */
  createGesture(coordinates, eventType) {
    const gestureActions = window.GestureConstants?.GESTURE_ACTIONS || { potentialTap: 'potential-tap' }

    return {
      id: `gesture-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: this.localUserId,
      roomId: this.currentRoom,
      startTime: Date.now(),
      startPosition: coordinates,
      currentPosition: coordinates,
      path: [coordinates],
      type: eventType,
      action: gestureActions.potentialTap
    }
  }

  /**
   * Add gesture to history
   * @param {Object} gesture - Gesture data
   */
  addToGestureHistory(gesture) {
    this.gestureHistory.push({
      ...gesture,
      timestamp: Date.now()
    })

    // Limit history size
    if (this.gestureHistory.length > this.maxHistorySize) {
      this.gestureHistory.shift()
    }

    this.performanceMetrics.gesturesCaptured++
  }

  /**
   * Set room context
   * @param {string} roomId - Room ID
   */
  setRoomContext(roomId) {
    this.currentRoom = roomId
    // console.log('GestureCaptureCore room context set to:', roomId)
  }

  /**
   * Get local user ID
   * @returns {string} Local user ID
   */
  getLocalUserId() {
    return this.localUserId
  }

  /**
   * Get gesture statistics
   * @returns {Object} Gesture statistics
   */
  getGestureStatistics() {
    return {
      totalGestures: this.performanceMetrics.gesturesCaptured,
      classifiedGestures: this.performanceMetrics.gesturesClassified,
      averageProcessingTime: Math.round(this.performanceMetrics.averageProcessingTime * 100) / 100,
      activeParticipants: this.participantGestures.size,
      recentGestures: this.gestureHistory.slice(-10)
    }
  }

  /**
   * Clear gesture history
   */
  clearHistory() {
    this.gestureHistory = []
    this.participantGestures.clear()
    // console.log('GestureCaptureCore history cleared')
  }

  /**
   * Handle multi-user gesture from server
   * @param {Object} data - Multi-user gesture data
   */
  handleMultiUserGesture(data) {
    const { userId, gesture, musicalEvent } = data

    // Store participant gesture
    this.participantGestures.set(userId, {
      gesture,
      musicalEvent,
      timestamp: Date.now()
    })

    // Trigger callback
    if (this.onMultiUserGesture) {
      this.onMultiUserGesture(data)
    }

    // console.log('Received multi-user gesture from:', userId)
  }

  /**
   * Emit gesture start to server
   * @param {Object} gesture - Gesture data
   */
  emitGestureStart(gesture) {
    if (this.socketService && this.socketService.socket) {
      this.socketService.socket.emit('gesture-start', {
        gestureId: gesture.id,
        userId: gesture.userId,
        roomId: gesture.roomId,
        startPosition: gesture.startPosition,
        timestamp: gesture.startTime
      })
    }
  }

  /**
   * Emit gesture update to server
   * @param {Object} gesture - Gesture data
   */
  emitGestureUpdate(gesture) {
    if (this.socketService && this.socketService.socket) {
      this.socketService.socket.emit('gesture-update', {
        gestureId: gesture.id,
        userId: gesture.userId,
        roomId: gesture.roomId,
        currentPosition: gesture.currentPosition,
        velocity: gesture.velocity,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Emit completed gesture to server
   * @param {Object} gesture - Gesture data
   * @param {Object} musicalEvent - Musical event data
   */
  emitGestureComplete(gesture, musicalEvent) {
    const defaultPosition = window.GestureConstants?.DEFAULT_POSITION || { x: 0.5, y: 0.5 }

    if (this.socketService && this.socketService.socket) {
      this.socketService.socket.emit('gesture-complete', {
        gesture: {
          id: gesture.id,
          userId: gesture.userId,
          roomId: gesture.roomId,
          path: gesture.path,
          position: gesture.coordinates || gesture.currentPosition || defaultPosition,
          coordinates: gesture.coordinates || gesture.currentPosition,
          duration: gesture.duration,
          direction: gesture.direction,
          intensity: gesture.intensity,
          speed: gesture.speed,
          musicalCharacteristics: gesture.musicalCharacteristics
        },
        musicalEvent,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stop()
    this.clearHistory()
    // console.log('GestureCaptureCore destroyed')
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.GestureCaptureCore = GestureCaptureCore
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GestureCaptureCore
}
