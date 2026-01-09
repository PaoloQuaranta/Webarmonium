// Using global io from socket.io CDN

/**
 * SocketService
 * WebSocket client for real-time communication with Webarmonium backend
 * Constitutional requirement: <100ms WebSocket latency, anonymous sessions
 */
class SocketService {
  constructor() {
    this.socket = null
    this.isConnected = false
    this.connectionAttempts = 0
    this.maxReconnectionAttempts = 5
    this.reconnectionDelay = 1000

    // Event listeners
    this.eventListeners = new Map()

    // Performance tracking
    this.performanceMetrics = {
      connectionLatency: 0,
      messageLatency: [],
      averageLatency: 0,
      messagesReceived: 0,
      messagesSent: 0,
      connectionDrops: 0
    }

    // Room state
    this.currentRoom = null
    this.currentUser = null
    this.currentUserId = null  // Backend-assigned userId (different from socket.id!)
    this.currentSlot = null    // Backend-assigned synth slot (0-3)
    this.roomUsers = []
    this.userSlots = new Map() // userId → slot mapping for all users in room

    // Heartbeat management
    this.heartbeatInterval = null
    this.heartbeatFrequency = 30000 // 30 seconds

    // Message queue for when disconnected
    this.messageQueue = []
  }

  /**
   * Connect to WebSocket server
   * @param {string} serverUrl - WebSocket server URL
   * @param {Object} options - Connection options
   */
  async connect(serverUrl = 'http://localhost:3001', options = {}) {
    if (this.socket && this.socket.connected) {
      // console.warn('Already connected to WebSocket')
      return
    }

    const connectionStartTime = performance.now()

    try {
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 5000,
        forceNew: true,
        ...options
      })

      // Setup event handlers
      this.setupEventHandlers()

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'))
        }, 10000)

        this.socket.on('connect', () => {
          clearTimeout(timeout)
          this.isConnected = true
          this.connectionAttempts = 0

          // Calculate connection latency
          this.performanceMetrics.connectionLatency = performance.now() - connectionStartTime

          // console.log('Connected to Webarmonium server:', {
//            socketId: this.socket.id,
//            latency: this.performanceMetrics.connectionLatency
////          })

          // Start heartbeat
          this.startHeartbeat()

          // Process queued messages
          this.processMessageQueue()

          resolve()
        })

        this.socket.on('connect_error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

    } catch (error) {
      // console.error('WebSocket connection failed:', error)
      this.handleConnectionError(error)
      throw error
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    // Connection events
    this.socket.on('disconnect', (reason) => {
      // console.log('Disconnected from server:', reason)
      this.isConnected = false
      this.performanceMetrics.connectionDrops++
      this.stopHeartbeat()

      this.emit('disconnected', { reason })

      // Auto-reconnect if not intentional
      if (reason !== 'io client disconnect') {
        this.attemptReconnection()
      }
    })

    this.socket.on('reconnect', () => {
      // console.log('Reconnected to server')
      this.isConnected = true
      this.startHeartbeat()
      this.emit('reconnected')
    })

    // Room events
    this.socket.on('room-joined', (data) => {
      this.handleRoomJoined(data)
    })

    this.socket.on('user-joined', (data) => {
      this.handleUserJoined(data)
    })

    this.socket.on('user-left', (data) => {
      this.handleUserLeft(data)
    })

    this.socket.on('user-disconnected', (data) => {
      this.handleUserDisconnected(data)
    })

    // Gesture events
    this.socket.on('gesture-echo', (data) => {
      this.handleGestureEcho(data)
    })

    this.socket.on('gesture-processed', (data) => {
      this.handleGestureProcessed(data)
    })

    // Audio events
    this.socket.on('sonic-update', (data) => {
      this.handleSonicUpdate(data)
    })

    // Multi-user canvas events
    this.socket.on('cursor-position', (data) => {
      // console.log('🖱️ SocketService received cursor-position:', data)
      this.emit('cursor-position', data)
    })

    this.socket.on('draw-stroke', (data) => {
      this.emit('draw-stroke', data)
    })

    this.socket.on('drawing-history', (data) => {
      this.emit('drawing-history', data)
    })

    // System events
    this.socket.on('users-inactive', (data) => {
      this.handleUsersInactive(data)
    })

    // Multi-user hover events
    this.socket.on('hover-update', (data) => {
      // console.log('🎛️ SocketService received hover-update:', data)
      this.emit('hover-update', data)
    })

    // Musical events for gesture processing
    this.socket.on('musical:event', (data) => {
      // console.log('🎵 SocketService received musical:event:', data)
      this.emit('musical:event', data)
    })

    // Sustained hold events for remote note synchronization
    this.socket.on('hold:start', (data) => {
      // console.log('🎵 SocketService received hold:start:', {
//        noteId: data.noteId,
//        userId: data.userId?.substring(0, 8),
//        frequency: data.frequency?.toFixed(1) + 'Hz',
//        velocity: data.velocity?.toFixed(2)
////      })
      this.emit('hold:start', data)
    })

    this.socket.on('hold:end', (data) => {
      // console.log('🎵 SocketService received hold:end:', {
//        noteId: data.noteId,
//        userId: data.userId?.substring(0, 8),
//        duration: data.duration + 'ms'
////      })
      this.emit('hold:end', data)
    })

    // Real-time drag note streaming from remote users
    this.socket.on('note:stream', (data) => {
      this.emit('note:stream', data)
    })

    // Unified modulation from HoverOrchestrator
    this.socket.on('unified-modulation', (data) => {
      // console.log('🎛️ SocketService received unified-modulation:', data)
      this.emit('unified-modulation', data)
    })

    // Collective compositional parameters
    this.socket.on('compositional-parameters', (data) => {
      // console.log('🎼 SocketService received compositional-parameters:', data.parameters)
      this.emit('compositional-parameters', data)
    })

    // Background composition events from BackgroundCompositionService
    this.socket.on('background-composition', (data) => {
      // console.log('🎼🎼 SocketService received background-composition:', {
//        compositionNumber: data.compositionNumber,
//        roomId: data.roomId,
//        type: data.composition?.type
////      })
      this.emit('background-composition', data)
    })

    // Virtual user events for solo mode
    this.socket.on('virtual-users-activated', (data) => {
      console.log('🎭 SocketService received virtual-users-activated:', data)
      this.emit('virtual-users-activated', data)
    })

    this.socket.on('virtual-users-deactivated', (data) => {
      console.log('🎭 SocketService received virtual-users-deactivated:', data)
      this.emit('virtual-users-deactivated', data)
    })

    this.socket.on('virtual-cursors', (data) => {
      this.emit('virtual-cursors', data)
    })

    this.socket.on('mode-transition', (data) => {
      console.log('🔄 SocketService received mode-transition:', data)
      this.emit('mode-transition', data)
    })

    // Debug: raw hover events (development only)
    this.socket.on('hover-update-raw', (data) => {
      if (process.env.NODE_ENV === 'development') {
        // console.log('🐛 Debug: SocketService received hover-update-raw:', data)
        this.emit('hover-update-raw', data)
      }
    })

    // Error handling
    this.socket.on('error', (error) => {
      // console.error('Socket error:', error)
      this.emit('socket-error', error)
    })
  }

  /**
   * Join a room
   * @param {string} roomId - Room ID to join
   * @param {Object} userData - User device/capability data
   */
  async joinRoom(roomId, userData = {}) {
    if (!this.isConnected) {
      throw new Error('Not connected to server')
    }

    const startTime = performance.now()

    try {
      const response = await this.sendWithResponse('join-room', {
        roomId,
        userData: {
          device: this.detectDevice(),
          platform: navigator.platform,
          capabilities: this.detectCapabilities(),
          ...userData
        }
      })

      if (response.success) {
        this.currentRoom = response.room
        this.currentUser = response.user
        this.roomUsers = response.otherUsers || []

        // CRITICAL FIX: Save backend-assigned userId for per-user synth routing
        if (response.userId) {
          this.currentUserId = response.userId
          console.log(`🆔 Backend userId saved from joinRoom: ${response.userId.substring(0, 8)}... (socket.id=${this.socket?.id?.substring(0, 8)}...)`)
        }

        // Save backend-assigned slot for exclusive timbre per room
        if (response.assignedSlot !== undefined && response.assignedSlot !== null) {
          this.currentSlot = response.assignedSlot
          console.log(`🎹 Backend slot SAVED: slot=${response.assignedSlot}`)
        } else {
          console.warn(`⚠️ Backend slot NOT received in joinRoom response! assignedSlot=${response.assignedSlot}`)
          console.warn(`   Full response keys: ${Object.keys(response).join(', ')}`)
        }

        // Populate userSlots map from all users in room
        this.userSlots.clear()
        if (response.users) {
          response.users.forEach(u => {
            if (u.slot !== undefined) {
              this.userSlots.set(u.id, u.slot)
            }
          })
          console.log(`🎹 UserSlots populated: ${this.userSlots.size} users`)
        }

        // Track latency
        const latency = performance.now() - startTime
        this.updateLatencyMetrics(latency)

        // console.log('Joined room successfully:', {
//          roomId: response.room.roomId,
//          userCount: response.room.userCount,
//          latency
////        })

        this.emit('room-joined', response)
        return response
      } else {
        throw new Error(response.error?.message || 'Failed to join room')
      }

    } catch (error) {
      // console.error('Join room failed:', error)
      throw error
    }
  }

  /**
   * Leave current room
   */
  async leaveRoom() {
    if (!this.isConnected || !this.currentRoom) {
      throw new Error('Not in a room')
    }

    try {
      const response = await this.sendWithResponse('leave-room', {})

      if (response.success) {
        const roomId = this.currentRoom.roomId
        this.currentRoom = null
        this.currentUser = null
        this.roomUsers = []

        // console.log('Left room successfully:', roomId)

        this.emit('room-left', response)
        return response
      } else {
        throw new Error(response.error?.message || 'Failed to leave room')
      }

    } catch (error) {
      // console.error('Leave room failed:', error)
      throw error
    }
  }

  /**
   * Send gesture data
   * @param {Object} gestureData - Gesture data from input
   */
  async sendGesture(gestureData) {
    if (!this.isConnected || !this.currentRoom) {
      // Queue gesture if disconnected
      this.queueMessage('gesture', gestureData)
      return
    }

    const startTime = performance.now()

    try {
      // Add client timestamp for latency measurement
      const gestureWithTimestamp = {
        ...gestureData,
        clientTimestamp: Date.now()
      }

      const response = await this.sendWithResponse('gesture', gestureWithTimestamp)

      if (response.success) {
        // Track processing latency
        const latency = performance.now() - startTime
        this.updateLatencyMetrics(latency)

        // Check constitutional latency requirement
        if (latency > 100) {
          // console.warn(`Gesture latency ${latency}ms exceeds 100ms constitutional requirement`)
        }

        this.emit('gesture-sent', {
          gesture: response.gesture,
          latency,
          memoryUpdated: response.memoryUpdated
        })

        return response
      } else {
        throw new Error(response.error?.message || 'Gesture processing failed')
      }

    } catch (error) {
      // console.error('Send gesture failed:', error)
      // Don't throw - gesture loss is acceptable for real-time performance
    }
  }

  /**
   * Send message with response callback
   * @param {string} event - Event name
   * @param {Object} data - Message data
   * @param {number} timeout - Response timeout
   */
  sendWithResponse(event, data, timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected) {
        reject(new Error('Socket not connected'))
        return
      }

      const timer = setTimeout(() => {
        reject(new Error(`Response timeout for ${event}`))
      }, timeout)

      this.socket.emit(event, data, (response) => {
        clearTimeout(timer)
        this.performanceMetrics.messagesReceived++
        resolve(response)
      })

      this.performanceMetrics.messagesSent++
    })
  }

  /**
   * Queue message for later sending when reconnected
   */
  queueMessage(event, data) {
    // Only queue important messages, not gestures (too frequent)
    if (event !== 'gesture') {
      this.messageQueue.push({ event, data, timestamp: Date.now() })

      // Limit queue size
      if (this.messageQueue.length > 10) {
        this.messageQueue.shift()
      }
    }
  }

  /**
   * Process queued messages after reconnection
   */
  processMessageQueue() {
    const currentTime = Date.now()

    // Process messages that are still relevant (< 30 seconds old)
    this.messageQueue = this.messageQueue.filter(message => {
      const age = currentTime - message.timestamp
      if (age < 30000) {
        this.socket.emit(message.event, message.data)
        return false // Remove from queue
      }
      return true // Keep in queue (but will be removed due to age)
    })
  }

  /**
   * Start heartbeat to maintain connection
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    this.heartbeatInterval = setInterval(async () => {
      if (this.isConnected && this.currentUser) {
        try {
          await this.sendWithResponse('heartbeat', {})
        } catch (error) {
          // console.warn('Heartbeat failed:', error)
        }
      }
    }, this.heartbeatFrequency)
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /**
   * Handle room joined event
   */
  handleRoomJoined(data) {
    // console.log('Room joined event received:', data)

    // CRITICAL FIX: Save backend-assigned userId for per-user synth routing
    // This is different from socket.id and must be used for synth lookup
    if (data.userId) {
      this.currentUserId = data.userId
      console.log(`🆔 Backend userId saved: ${data.userId.substring(0, 8)}... (socket.id=${this.socket?.id?.substring(0, 8)}...)`)
    }

    this.emit('room-joined-update', data)
  }

  /**
   * Get the backend-assigned userId (NOT socket.id)
   * @returns {string|null} The user's backend-assigned ID
   */
  getUserId() {
    return this.currentUserId || this.socket?.id || null
  }

  /**
   * Get the current user's assigned synth slot
   * @returns {number|null} The user's backend-assigned slot (0-3) or null
   */
  getSlot() {
    return this.currentSlot !== undefined ? this.currentSlot : null
  }

  /**
   * Get the slot for any user in the room (including self)
   * @param {string} userId - The user ID to look up
   * @returns {number|null} The user's slot (0-3) or null if not found
   */
  getSlotForUser(userId) {
    // Check if it's the current user
    if (userId === this.currentUserId) {
      // console.log(`🔍 getSlotForUser: ${userId?.substring(0,8)} is CURRENT user, slot=${this.currentSlot}`)
      return this.currentSlot
    }
    // Look up in the userSlots map
    const mapSlot = this.userSlots.get(userId)
    // console.log(`🔍 getSlotForUser: ${userId?.substring(0,8)} lookup in userSlots map, found=${mapSlot !== undefined}, slot=${mapSlot}, mapSize=${this.userSlots.size}`)
    return mapSlot !== undefined ? mapSlot : null
  }

  /**
   * Handle user joined event
   */
  handleUserJoined(data) {
    // console.log('User joined:', data.userId)

    // Add user to room users list
    if (!this.roomUsers.find(u => u.id === data.userId)) {
      this.roomUsers.push(data.user)
    }

    // Track user's slot for synth timbre (check both data.slot and data.user.slot)
    const userSlot = data.slot ?? data.user?.slot
    if (userSlot !== undefined) {
      this.userSlots.set(data.userId || data.user?.id, userSlot)
      // console.log(`🎹 User joined with slot ${userSlot}: ${(data.userId || data.user?.id).substring(0, 8)}`)
    }

    this.emit('user-joined', {
      user: data.user,
      userCount: data.userCount
    })
  }

  /**
   * Handle user left event
   */
  handleUserLeft(data) {
    // console.log('User left:', data.userId)

    // Remove user from room users list
    this.roomUsers = this.roomUsers.filter(u => u.id !== data.userId)

    // Remove user's slot from tracking
    if (data.userId) {
      this.userSlots.delete(data.userId)
      // console.log(`🎹 User left, slot released: ${data.userId.substring(0, 8)}`)
    }

    this.emit('user-left', {
      userId: data.userId,
      userCount: data.userCount
    })
  }

  /**
   * Handle user disconnected event
   */
  handleUserDisconnected(data) {
    // console.log('User disconnected:', data.userId)

    // Remove user from room users list
    this.roomUsers = this.roomUsers.filter(u => u.id !== data.userId)

    this.emit('user-disconnected', {
      userId: data.userId
    })
  }

  /**
   * Handle gesture echo from other users
   */
  handleGestureEcho(data) {
    this.emit('gesture-echo', data)
  }

  /**
   * Handle gesture processed response
   */
  handleGestureProcessed(data) {
    this.emit('gesture-processed', data)
  }

  /**
   * Handle sonic update from server
   */
  handleSonicUpdate(data) {
    // console.log('Sonic update received:', {
//      patternCount: data.patterns?.length || 0,
//      memoryInfluence: data.memoryInfluence
////    })

    this.emit('sonic-update', data)
  }

  /**
   * Handle users inactive notification
   */
  handleUsersInactive(data) {
    // console.log('Users marked inactive:', data.inactiveUsers)

    // Update user activity status
    data.inactiveUsers.forEach(userId => {
      const user = this.roomUsers.find(u => u.id === userId)
      if (user) {
        user.isActive = false
      }
    })

    this.emit('users-inactive', data)
  }

  /**
   * Handle connection errors and attempt reconnection
   */
  handleConnectionError(error) {
    // console.error('Connection error:', error)
    this.emit('connection-error', error)
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  async attemptReconnection() {
    if (this.connectionAttempts >= this.maxReconnectionAttempts) {
      // console.error('Max reconnection attempts reached')
      this.emit('reconnection-failed')
      return
    }

    this.connectionAttempts++
    const delay = this.reconnectionDelay * Math.pow(2, this.connectionAttempts - 1)

    // console.log(`Attempting reconnection ${this.connectionAttempts}/${this.maxReconnectionAttempts} in ${delay}ms`)

    setTimeout(async () => {
      try {
        await this.connect()

        // Rejoin room if we were in one
        if (this.currentRoom) {
          await this.joinRoom(this.currentRoom.roomId)
        }
      } catch (error) {
        // console.error('Reconnection failed:', error)
        this.attemptReconnection()
      }
    }, delay)
  }

  /**
   * Detect device type
   */
  detectDevice() {
    const userAgent = navigator.userAgent.toLowerCase()

    if (/tablet|ipad/.test(userAgent)) return 'mobile' // Backend expects only 'desktop' or 'mobile'
    if (/mobile|phone|android|iphone/.test(userAgent)) return 'mobile'
    return 'desktop'
  }

  /**
   * Detect input capabilities
   */
  detectCapabilities() {
    return {
      mouse: !('ontouchstart' in window),
      touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      gyroscope: 'DeviceOrientationEvent' in window
    }
  }

  /**
   * Update latency metrics
   */
  updateLatencyMetrics(latency) {
    this.performanceMetrics.messageLatency.push(latency)

    // Keep only recent measurements
    if (this.performanceMetrics.messageLatency.length > 50) {
      this.performanceMetrics.messageLatency.shift()
    }

    // Calculate average
    this.performanceMetrics.averageLatency =
      this.performanceMetrics.messageLatency.reduce((a, b) => a + b, 0) /
      this.performanceMetrics.messageLatency.length
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event).push(callback)
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event)
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          // console.error(`Error in event listener for ${event}:`, error)
        }
      })
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      socketId: this.socket?.id,
      currentRoom: this.currentRoom?.roomId,
      userCount: this.roomUsers.length + (this.currentUser ? 1 : 0),
      performanceMetrics: this.performanceMetrics
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this.stopHeartbeat()

    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }

    this.isConnected = false
    this.currentRoom = null
    this.currentUser = null
    this.roomUsers = []

    // console.log('Disconnected from Webarmonium server')
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    return {
      ...this.performanceMetrics,
      connectionAttempts: this.connectionAttempts,
      isConnected: this.isConnected,
      queuedMessages: this.messageQueue.length
    }
  }
}

// Export singleton instance
// Make SocketService available globally
window.SocketService = SocketService