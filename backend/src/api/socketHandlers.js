/**
 * Socket.io Event Handlers
 * Real-time WebSocket API implementation for Webarmonium
 * Constitutional requirements: <100ms WebSocket latency, anonymous sessions
 */

const { v4: uuidv4 } = require('uuid')

const socketHandlers = {
  /**
   * Initialize socket with all event handlers
   * @param {Socket} socket - Socket.io socket instance
   * @param {Object} services - Service dependencies
   */
  initializeSocket (socket, services) {
    // Store services on socket for handler access
    socket.services = services
    socket.userId = null
    socket.roomId = null
    socket.lastActivity = Date.now()

    // Register event handlers
    this.registerJoinRoomHandler(socket)
    this.registerLeaveRoomHandler(socket)
    this.registerGestureHandler(socket)
    this.registerHeartbeatHandler(socket)

    // Multi-user canvas handlers
    this.registerDrawStartHandler(socket)
    this.registerDrawPointHandler(socket)
    this.registerDrawEndHandler(socket)
    this.registerCursorMoveHandler(socket)

    // Performance monitoring
    socket.on('*', () => {
      socket.lastActivity = Date.now()
    })
  },

  /**
   * Register join-room event handler
   * @param {Socket} socket - Socket instance
   */
  registerJoinRoomHandler (socket) {
    socket.on('join-room', async (data, callback) => {
      const startTime = Date.now()

      try {
        // Validate input data
        if (!data || !data.roomId) {
          return this.sendError(callback, 'MISSING_ROOM_ID', 'Room ID is required')
        }

        const { roomId, userData = {} } = data

        // Validate room ID format
        if (!/^[a-z0-9-]{3,50}$/i.test(roomId)) {
          return this.sendError(callback, 'INVALID_ROOM_ID', 'Invalid room ID format')
        }

        // Generate anonymous user ID if not already set
        if (!socket.userId) {
          socket.userId = this.generateUserId()
        }

        // Validate user data
        const validatedUserData = this.validateUserData(userData)

        // Attempt to join room
        const result = await socket.services.roomManager.joinRoom(
          socket.userId,
          roomId,
          validatedUserData
        )

        // Store room association
        socket.roomId = roomId
        socket.join(roomId) // Join Socket.io room

        // Initialize memory state if needed
        let memoryState = socket.services.memoryCoordinator.getMemoryState(roomId)
        if (!memoryState) {
          memoryState = socket.services.memoryCoordinator.initializeMemoryState(roomId)
        }

        // Calculate processing latency
        const latency = Date.now() - startTime

        // Send success response with multi-user canvas data
        const response = {
          success: true,
          userId: socket.userId,
          assignedColor: result.assignedColor, // Multi-user canvas: assigned color
          users: result.users, // Multi-user canvas: all users with colors
          room: result.room,
          user: result.user,
          memoryInfluence: result.memoryInfluence,
          otherUsers: result.otherUsers,
          latency,
          timestamp: Date.now()
        }

        this.sendResponse(callback, response)

        // Broadcast user-joined to other users in room (with color for multi-user canvas)
        socket.to(roomId).emit('user-joined', {
          userId: socket.userId,
          color: result.assignedColor, // Multi-user canvas: user's color
          user: result.user,
          userCount: result.room.userCount,
          timestamp: Date.now()
        })

        // Send drawing history to new user (T018: drawing-history emission)
        const drawingHistory = socket.services.roomManager.getDrawingHistory(roomId)
        socket.emit('drawing-history', {
          strokes: drawingHistory
        })

        console.log(`User ${socket.userId} joined room ${roomId} (${latency}ms)`)

        // Log constitutional compliance
        if (latency > 100) {
          console.warn(`Join-room latency ${latency}ms exceeds 100ms constitutional requirement`)
        }
      } catch (error) {
        console.error('Join-room error:', error)

        // Handle specific error cases
        if (error.message === 'ROOM_FULL') {
          return this.sendError(callback, 'ROOM_FULL', 'Room has reached maximum capacity')
        }

        if (error.message === 'User already in this room') {
          return this.sendError(callback, 'ALREADY_IN_ROOM', 'User is already in this room')
        }

        return this.sendError(callback, 'JOIN_FAILED', 'Failed to join room')
      }
    })
  },

  /**
   * Register leave-room event handler
   * @param {Socket} socket - Socket instance
   */
  registerLeaveRoomHandler (socket) {
    socket.on('leave-room', async (data, callback) => {
      const startTime = Date.now()

      try {
        if (!socket.userId) {
          return this.sendError(callback, 'NO_USER_SESSION', 'No active user session')
        }

        if (!socket.roomId) {
          return this.sendError(callback, 'NOT_IN_ROOM', 'User is not in any room')
        }

        const roomId = socket.roomId

        // Get user's color before leaving (for broadcast)
        const room = socket.services.roomManager.getRoom(roomId)
        const user = room ? room.getUser(socket.userId) : null
        const userColor = user ? user.assignedColor : null

        // Remove user from room
        const result = await socket.services.roomManager.leaveRoom(socket.userId)

        // Leave Socket.io room
        socket.leave(roomId)

        // Clear room association
        socket.roomId = null

        // Calculate processing latency
        const latency = Date.now() - startTime

        // Send success response
        const response = {
          success: true,
          userId: socket.userId,
          roomId,
          remainingUsers: result.remainingUsers,
          memoryExpirationStarted: result.memoryExpirationStarted,
          latency,
          timestamp: Date.now()
        }

        this.sendResponse(callback, response)

        // Broadcast user-left to remaining users in room (T024: with color for multi-user canvas)
        socket.to(roomId).emit('user-left', {
          userId: socket.userId,
          color: userColor, // Multi-user canvas: user's color
          userCount: result.remainingUsers,
          timestamp: Date.now()
        })

        console.log(`User ${socket.userId} left room ${roomId} (${latency}ms)`)

        // Log constitutional compliance
        if (latency > 100) {
          console.warn(`Leave-room latency ${latency}ms exceeds 100ms constitutional requirement`)
        }
      } catch (error) {
        console.error('Leave-room error:', error)
        return this.sendError(callback, 'LEAVE_FAILED', 'Failed to leave room')
      }
    })
  },

  /**
   * Register gesture event handler
   * @param {Socket} socket - Socket instance
   */
  registerGestureHandler (socket) {
    socket.on('gesture', async (data, callback) => {
      const startTime = Date.now()

      try {
        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          return this.sendError(callback, 'NO_ACTIVE_SESSION', 'No active room session')
        }

        // Validate gesture data
        if (!data || !data.type || !data.coordinates || data.intensity === undefined) {
          return this.sendError(callback, 'INVALID_GESTURE_DATA', 'Invalid gesture data')
        }

        // Process gesture with latency tracking
        const gesture = socket.services.gestureProcessor.processGesture(
          socket.userId,
          socket.roomId,
          data
        )

        // Constitutional requirement: <200ms processing
        const processingLatency = gesture.getProcessingLatency()
        if (processingLatency > 200) {
          console.warn(`Gesture processing exceeded 200ms: ${processingLatency}ms`)
        }

        // Process gesture for room memory and broadcasting
        const memoryResult = socket.services.roomManager.processGesture(socket.userId, gesture)

        // Update environmental memory
        const room = socket.services.roomManager.getRoom(socket.roomId)
        const memoryUpdate = socket.services.memoryCoordinator.processGestureMemory(
          gesture,
          { activeUsers: room.getUserCount() }
        )

        // Generate sonic update if patterns evolved
        let sonicUpdate = null
        if (memoryUpdate.success && (memoryUpdate.patternsEvolved > 0 || memoryUpdate.newPatterns > 0)) {
          sonicUpdate = socket.services.memoryCoordinator.generateSonicUpdate(socket.roomId)
        }

        // Calculate total latency
        const totalLatency = Date.now() - startTime

        // Send gesture-processed response to sender
        const response = {
          success: true,
          gesture: gesture.toProcessedResponse(),
          memoryUpdated: memoryUpdate.success,
          patternsEvolved: memoryUpdate.patternsEvolved || 0,
          newPatterns: memoryUpdate.newPatterns || 0,
          totalLatency,
          timestamp: Date.now()
        }

        this.sendResponse(callback, response)

        // Broadcast gesture-echo to other users in room
        if (memoryResult.broadcastTo.length > 0) {
          socket.to(socket.roomId).emit('gesture-echo', {
            ...gesture.toEchoBroadcast(),
            timestamp: Date.now()
          })
        }

        // Broadcast sonic-update if patterns changed
        if (sonicUpdate) {
          socket.services.io.to(socket.roomId).emit('sonic-update', sonicUpdate)
        }

        // Update user activity
        socket.services.roomManager.updateUserActivity(socket.userId)

        // Log constitutional compliance
        if (totalLatency > 100) {
          console.warn(`Gesture total latency ${totalLatency}ms exceeds 100ms constitutional requirement`)
        }
      } catch (error) {
        console.error('Gesture processing error:', error)
        return this.sendError(callback, 'GESTURE_PROCESSING_FAILED', 'Gesture processing failed')
      }
    })
  },

  /**
   * Register heartbeat event handler
   * @param {Socket} socket - Socket instance
   */
  registerHeartbeatHandler (socket) {
    socket.on('heartbeat', async (data, callback) => {
      const startTime = Date.now()

      try {
        if (!socket.userId) {
          return this.sendError(callback, 'NO_USER_SESSION', 'No active user session')
        }

        // Process heartbeat
        const result = socket.services.roomManager.handleHeartbeat(socket.userId)

        const latency = Date.now() - startTime

        if (result.success) {
          // Send heartbeat response
          const response = {
            success: true,
            userId: socket.userId,
            roomId: result.roomId,
            userCount: result.userCount,
            lastActivity: result.lastActivity,
            serverTime: Date.now(),
            latency
          }

          this.sendResponse(callback, response)

          // Notify room of inactive users if any
          if (result.inactiveUsers && result.inactiveUsers.length > 0) {
            socket.services.io.to(result.roomId).emit('users-inactive', {
              inactiveUsers: result.inactiveUsers,
              timestamp: Date.now()
            })
          }
        } else {
          // User should reconnect
          return this.sendError(callback, 'SESSION_INVALID', result.error, {
            shouldReconnect: result.shouldReconnect
          })
        }
      } catch (error) {
        console.error('Heartbeat error:', error)
        return this.sendError(callback, 'HEARTBEAT_FAILED', 'Heartbeat processing failed')
      }
    })
  },

  /**
   * Register draw-start event handler (T019)
   * @param {Socket} socket - Socket instance
   */
  registerDrawStartHandler (socket) {
    socket.on('draw-start', async (data) => {
      try {
        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          console.warn('draw-start: No active session')
          return
        }

        // Validate data
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number' || !data.strokeWidth) {
          console.warn('draw-start: Invalid data')
          return
        }

        // Get room and user
        const room = socket.services.roomManager.getUserRoom(socket.userId)
        if (!room) {
          console.warn('draw-start: Room not found')
          return
        }

        const user = room.getUser(socket.userId)
        if (!user || !user.assignedColor) {
          console.warn('draw-start: User or color not found')
          return
        }

        // Get drawing service
        const drawingService = socket.services.roomManager.getDrawingService(socket.roomId)
        if (!drawingService) {
          console.warn('draw-start: Drawing service not found')
          return
        }

        // Create stroke
        const stroke = drawingService.createStroke(
          socket.userId,
          socket.roomId,
          user.assignedColor,
          data
        )

        console.log(`User ${socket.userId} started stroke ${stroke.id}`)
      } catch (error) {
        console.error('draw-start error:', error)
      }
    })
  },

  /**
   * Register draw-point event handler (T020)
   * @param {Socket} socket - Socket instance
   */
  registerDrawPointHandler (socket) {
    socket.on('draw-point', async (data) => {
      try {
        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          return
        }

        // Validate data
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') {
          return
        }

        // Get drawing service
        const drawingService = socket.services.roomManager.getDrawingService(socket.roomId)
        if (!drawingService) {
          return
        }

        // Add point to active stroke
        drawingService.addPoint(socket.userId, data)
      } catch (error) {
        console.error('draw-point error:', error)
      }
    })
  },

  /**
   * Register draw-end event handler (T021)
   * @param {Socket} socket - Socket instance
   */
  registerDrawEndHandler (socket) {
    socket.on('draw-end', async (data) => {
      const startTime = Date.now()

      try {
        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          console.warn('draw-end: No active session')
          return
        }

        // Validate data
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') {
          console.warn('draw-end: Invalid data')
          return
        }

        // Get drawing service
        const drawingService = socket.services.roomManager.getDrawingService(socket.roomId)
        if (!drawingService) {
          console.warn('draw-end: Drawing service not found')
          return
        }

        // Complete stroke
        const stroke = drawingService.completeStroke(socket.userId, data)

        // Add stroke to room history
        socket.services.roomManager.addStrokeToHistory(socket.roomId, stroke)

        // Broadcast completed stroke to other users in room
        const strokePayload = drawingService.broadcastStroke(stroke)
        socket.to(socket.roomId).emit('draw-stroke', strokePayload)

        const latency = Date.now() - startTime

        console.log(`User ${socket.userId} completed stroke ${stroke.id} (${latency}ms, ${stroke.points.length} points)`)

        // Log constitutional compliance (FR-006: <1000ms stroke broadcast)
        if (latency > 1000) {
          console.warn(`draw-end latency ${latency}ms exceeds 1000ms requirement (FR-006)`)
        }
      } catch (error) {
        console.error('draw-end error:', error)
      }
    })
  },

  /**
   * Register cursor-move event handler (T022)
   * @param {Socket} socket - Socket instance
   */
  registerCursorMoveHandler (socket) {
    socket.on('cursor-move', async (data) => {
      try {
        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          return
        }

        // Validate data
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number' || typeof data.isDrawing !== 'boolean') {
          return
        }

        // Get room and user
        const room = socket.services.roomManager.getUserRoom(socket.userId)
        if (!room) {
          return
        }

        const user = room.getUser(socket.userId)
        if (!user || !user.assignedColor) {
          return
        }

        // Import CursorPosition model
        const CursorPosition = require('../models/CursorPosition')

        // Create or update cursor position
        const cursorPosition = CursorPosition.fromEventData(
          socket.userId,
          socket.roomId,
          data
        )

        // Update cursor in room
        socket.services.roomManager.updateCursorPosition(socket.userId, cursorPosition)

        // Broadcast cursor position to other users in room
        socket.to(socket.roomId).emit('cursor-position', cursorPosition.toEventPayload(user.assignedColor))
      } catch (error) {
        console.error('cursor-move error:', error)
      }
    })
  },

  /**
   * Handle socket disconnection cleanup
   * @param {Socket} socket - Socket instance
   * @param {RoomManager} roomManager - Room manager service
   */
  handleDisconnection (socket, roomManager) {
    if (socket.userId && socket.roomId) {
      try {
        // Get user's color before cleanup (for broadcast)
        const room = roomManager.getRoom(socket.roomId)
        const user = room ? room.getUser(socket.userId) : null
        const userColor = user ? user.assignedColor : null

        // Remove user from room (T025: calls leaveRoom which releases color, cancels stroke, removes cursor)
        roomManager.leaveRoom(socket.userId)

        // Broadcast user-left to remaining users (consistent with leave-room behavior)
        socket.to(socket.roomId).emit('user-left', {
          userId: socket.userId,
          color: userColor,
          timestamp: Date.now()
        })

        console.log(`User ${socket.userId} disconnected from room ${socket.roomId}`)
      } catch (error) {
        console.error('Disconnection cleanup error:', error)
      }
    }
  },

  /**
   * Generate anonymous user ID (UUID v4 format)
   * @returns {string} Anonymous user ID (UUID)
   */
  generateUserId () {
    return uuidv4()
  },

  /**
   * Validate user data for anonymous sessions
   * @param {Object} userData - User data to validate
   * @returns {Object} Validated user data
   */
  validateUserData (userData) {
    const validated = {
      device: 'unknown',
      platform: 'unknown',
      capabilities: {
        mouse: true,
        touch: false,
        gyroscope: false
      }
    }

    // Validate device type
    if (userData.device && typeof userData.device === 'string') {
      const validDevices = ['desktop', 'mobile', 'tablet']
      if (validDevices.includes(userData.device)) {
        validated.device = userData.device
      }
    }

    // Validate platform
    if (userData.platform && typeof userData.platform === 'string') {
      validated.platform = userData.platform.substr(0, 50) // Limit length
    }

    // Validate capabilities
    if (userData.capabilities && typeof userData.capabilities === 'object') {
      if (typeof userData.capabilities.mouse === 'boolean') {
        validated.capabilities.mouse = userData.capabilities.mouse
      }
      if (typeof userData.capabilities.touch === 'boolean') {
        validated.capabilities.touch = userData.capabilities.touch
      }
      if (typeof userData.capabilities.gyroscope === 'boolean') {
        validated.capabilities.gyroscope = userData.capabilities.gyroscope
      }
    }

    return validated
  },

  /**
   * Send success response via callback
   * @param {Function} callback - Response callback
   * @param {Object} data - Response data
   */
  sendResponse (callback, data) {
    if (typeof callback === 'function') {
      callback(data)
    }
  },

  /**
   * Send error response via callback
   * @param {Function} callback - Response callback
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object} extra - Additional error data
   */
  sendError (callback, code, message, extra = {}) {
    const errorResponse = {
      success: false,
      error: {
        code,
        message,
        timestamp: Date.now(),
        ...extra
      }
    }

    if (typeof callback === 'function') {
      callback(errorResponse)
    }
  }
}

module.exports = socketHandlers
