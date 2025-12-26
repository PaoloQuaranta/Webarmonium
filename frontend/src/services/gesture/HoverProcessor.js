/**
 * HoverProcessor.js
 * Handles hover gestures for cross-layer audio modulation
 * Phase 3 refactoring - Decomposed from EnhancedGestureCapture.js
 */
class HoverProcessor {
  constructor(socketService) {
    this.socketService = socketService

    // Hover configuration
    const hoverConfig = window.GestureConstants?.HOVER_CONFIG || {
      hoverThreshold: 100,
      defaultIntensity: 0.5,
      defaultVelocity: 0
    }

    const defaultPosition = window.GestureConstants?.DEFAULT_POSITION || { x: 0.5, y: 0.5 }

    // Hover state
    this.hoverState = {
      isHovering: false,
      position: { ...defaultPosition },
      lastHoverTime: 0,
      hoverThreshold: hoverConfig.hoverThreshold,
      hoverIntensity: hoverConfig.defaultIntensity,
      hoverVelocity: hoverConfig.defaultVelocity
    }

    // User identification (set externally)
    this.localUserId = null
    this.currentRoom = null

    // Callback for hover modulation
    this.onHoverModulation = null
  }

  /**
   * Set user context
   * @param {string} userId - Local user ID
   * @param {string} roomId - Current room ID
   */
  setUserContext(userId, roomId) {
    this.localUserId = userId
    this.currentRoom = roomId
  }

  /**
   * Set hover modulation callback
   * @param {Function} callback - Hover modulation callback
   */
  setHoverModulationCallback(callback) {
    this.onHoverModulation = callback
    console.log('HoverProcessor: Hover modulation callback set')
  }

  /**
   * Handle hover start
   * @param {Object} coordinates - Start coordinates
   */
  handleHoverStart(coordinates) {
    this.hoverState.isHovering = true
    if (coordinates) {
      this.hoverState.position = coordinates
    }
    console.log('HoverProcessor: Hover started at:', this.hoverState.position)
  }

  /**
   * Handle hover movement with cross-layer modulation
   * @param {Object} coordinates - Current coordinates
   * @param {boolean} isCapturing - Whether gesture capture is active
   * @returns {boolean} True if hover was processed
   */
  handleHover(coordinates, isCapturing = false) {
    // Don't process hover when capturing a gesture (drag)
    if (isCapturing) {
      return false
    }

    // Auto-activate hover state when mouse moves over canvas
    if (!this.hoverState.isHovering) {
      this.hoverState.isHovering = true
    }

    if (!coordinates) return false

    const now = Date.now()
    const deltaTime = now - this.hoverState.lastHoverTime

    // Throttle hover updates
    if (deltaTime < this.hoverState.hoverThreshold) {
      return false
    }

    // Calculate hover velocity and intensity
    const deltaX = coordinates.x - this.hoverState.position.x
    const deltaY = coordinates.y - this.hoverState.position.y
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

    this.hoverState.hoverVelocity = distance / (deltaTime / 1000)
    this.hoverState.hoverIntensity = Math.min(distance * 2, 1)

    this.hoverState.position = coordinates
    this.hoverState.lastHoverTime = now

    // Trigger cross-layer modulation callback
    if (this.onHoverModulation) {
      this.onHoverModulation({
        position: this.hoverState.position,
        velocity: this.hoverState.hoverVelocity,
        intensity: this.hoverState.hoverIntensity,
        isRemote: false
      })
    }

    // Emit hover state to server
    this.emitHoverUpdate()

    // Emit cursor position for multi-user cursors
    this.emitCursorPosition(false)

    return true
  }

  /**
   * Handle hover end
   */
  handleHoverEnd() {
    this.hoverState.isHovering = false
    this.hoverState.hoverVelocity = 0
    this.hoverState.hoverIntensity = 0

    // Reset modulation with safety check
    if (this.onHoverModulation && this.hoverState.position) {
      this.onHoverModulation({
        position: this.hoverState.position,
        velocity: 0,
        intensity: 0,
        isRemote: false
      })
    }

    console.log('HoverProcessor: Hover ended')
  }

  /**
   * Handle remote hover from multi-user
   * @param {Object} data - Remote hover data
   */
  handleRemoteHover(data) {
    const { userId, position, velocity, intensity } = data

    // Trigger cross-layer modulation for remote user
    if (this.onHoverModulation) {
      this.onHoverModulation({
        position,
        velocity,
        intensity,
        isRemote: true
      })
    }

    console.log('HoverProcessor: Remote hover from user:', userId)
  }

  /**
   * Emit hover update to server
   */
  emitHoverUpdate() {
    if (!this.socketService || !this.socketService.socket || !this.hoverState.isHovering) {
      return
    }

    const hoverData = {
      userId: this.localUserId,
      roomId: this.currentRoom,
      position: this.hoverState.position,
      velocity: this.hoverState.hoverVelocity,
      intensity: this.hoverState.hoverIntensity,
      timestamp: Date.now()
    }

    this.socketService.socket.emit('hover-update', hoverData)
  }

  /**
   * Emit cursor position for multi-user cursors
   * @param {boolean} isDrawing - Whether user is currently drawing
   */
  emitCursorPosition(isDrawing = false) {
    if (!this.socketService || !this.socketService.socket) {
      return
    }

    const defaultPosition = window.GestureConstants?.DEFAULT_POSITION || { x: 0.5, y: 0.5 }
    const position = this.hoverState.position || defaultPosition

    this.socketService.socket.emit('cursor-move', {
      x: position.x,
      y: position.y,
      isDrawing,
      timestamp: Date.now(),
      userId: this.localUserId
    })
  }

  /**
   * Get hover state
   * @returns {Object} Current hover state
   */
  getHoverState() {
    return {
      ...this.hoverState,
      isActive: this.hoverState.isHovering
    }
  }

  /**
   * Check if hovering
   * @returns {boolean}
   */
  isHovering() {
    return this.hoverState.isHovering
  }

  /**
   * Get current position
   * @returns {Object} Current position { x, y }
   */
  getPosition() {
    return { ...this.hoverState.position }
  }

  /**
   * Reset hover state
   */
  reset() {
    const defaultPosition = window.GestureConstants?.DEFAULT_POSITION || { x: 0.5, y: 0.5 }
    const hoverConfig = window.GestureConstants?.HOVER_CONFIG || {
      hoverThreshold: 100,
      defaultIntensity: 0.5,
      defaultVelocity: 0
    }

    this.hoverState = {
      isHovering: false,
      position: { ...defaultPosition },
      lastHoverTime: 0,
      hoverThreshold: hoverConfig.hoverThreshold,
      hoverIntensity: hoverConfig.defaultIntensity,
      hoverVelocity: hoverConfig.defaultVelocity
    }

    console.log('HoverProcessor: State reset')
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.HoverProcessor = HoverProcessor
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = HoverProcessor
}
