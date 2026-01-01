/**
 * AuthHandler - Session management handlers
 * Handles: join-room, leave-room, heartbeat, disconnect
 */

const ValidationHandler = require('./ValidationHandler')
const { LATENCY } = require('../../constants/MusicConstants')

const AuthHandler = {
  /**
   * Register join-landing event handler
   * For landing page clients (web metrics driven composition)
   * @param {Socket} socket - Socket instance
   */
  registerJoinLandingHandler (socket) {
    socket.on('join-landing', async (data, callback) => {
      const startTime = Date.now()

      try {
        // Generate anonymous user ID for landing page
        if (!socket.userId) {
          socket.userId = ValidationHandler.generateUserId()
        }

        const landingRoomId = 'landing-room'

        // Join landing room
        socket.roomId = landingRoomId
        socket.join(landingRoomId)

// console.log(`✅ User joined landing room:`, {
//          userId: socket.userId,
//          socketId: socket.id,
//          roomId: socket.roomId,
////        })

        // Start landing composition service
        if (socket.services.landingCompositionService) {
          socket.services.landingCompositionService.start()
        }

        // Get initial cursor positions
        let cursors = {}
        if (socket.services.landingCompositionService) {
          cursors = socket.services.landingCompositionService.getVirtualCursors()
        }

        // Get initial metrics
        let metrics = {}
        if (socket.services.landingCompositionService) {
          metrics = socket.services.landingCompositionService.getMetrics()
        }

        const latency = Date.now() - startTime

        // Send success response
        const response = {
          success: true,
          userId: socket.userId,
          roomId: landingRoomId,
          cursors,
          metrics,
          latency,
          timestamp: Date.now()
        }

        if (callback) {
          callback(response)
        }

        // Emit landing-joined event
        socket.emit('landing-joined', {
          roomId: landingRoomId,
          userId: socket.userId,
          cursors,
          metrics,
          timestamp: Date.now()
        })

// console.log(`User ${socket.userId} joined landing room (${latency}ms)`)
      } catch (error) {
// console.error('Join-landing error:', error)
        if (callback) {
          callback({
            success: false,
            error: error.message,
            timestamp: Date.now()
          })
        }
      }
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
          return ValidationHandler.sendError(callback, 'MISSING_ROOM_ID', 'Room ID is required')
        }

        const { roomId, userData = {} } = data

        // Validate room ID format
        if (!/^[a-z0-9-]{3,50}$/i.test(roomId)) {
          return ValidationHandler.sendError(callback, 'INVALID_ROOM_ID', 'Invalid room ID format')
        }

        // Generate anonymous user ID if not already set
        if (!socket.userId) {
          socket.userId = ValidationHandler.generateUserId()
        }

        // Validate user data
        const validatedUserData = ValidationHandler.validateUserData(userData)

        // Attempt to join room
        const result = await socket.services.roomManager.joinRoom(
          socket.userId,
          roomId,
          validatedUserData
        )

        // Store room association
        socket.roomId = roomId
        socket.join(roomId)

        // console.log(`✅ User joined room:`, {
//          userId: socket.userId,
//          socketId: socket.id,
//          roomId: socket.roomId,
//          roomsInSocket: Array.from(socket.rooms),
//          totalUsersInRoom: result.users?.length || 0
////        })

        // Initialize memory state if needed
        let memoryState = socket.services.environmentalMemoryCoordinator.getMemoryState(roomId)
        if (!memoryState) {
          memoryState = socket.services.environmentalMemoryCoordinator.initializeMemoryState(roomId)
        }

        // Calculate processing latency
        const latency = Date.now() - startTime

        // Send success response with multi-user canvas data
        const response = {
          success: true,
          userId: socket.userId,
          assignedColor: result.assignedColor,
          users: result.users,
          room: result.room,
          user: result.user,
          memoryInfluence: result.memoryInfluence,
          otherUsers: result.otherUsers,
          latency,
          timestamp: Date.now()
        }

        ValidationHandler.sendResponse(callback, response)

        // Emit room-joined event for test compatibility
        socket.emit('room-joined', {
          roomId: roomId,
          userId: socket.userId,
          users: result.users,
          room: result.room,
          timestamp: Date.now()
        })

        // Broadcast user-joined to other users in room
        socket.to(roomId).emit('user-joined', {
          userId: socket.userId,
          color: result.assignedColor,
          user: result.user,
          userCount: result.room.userCount,
          timestamp: Date.now()
        })

        // Send user-joined events for existing users to the new user
        const existingUsers = result.users.filter(u => u.id !== socket.userId)
        existingUsers.forEach(existingUser => {
          socket.emit('user-joined', {
            userId: existingUser.id,
            color: existingUser.color,
            user: existingUser,
            userCount: result.room.userCount,
            timestamp: Date.now()
          })
        })

        // Send drawing history to new user
        const drawingHistory = socket.services.roomManager.getDrawingHistory(roomId)
        socket.emit('drawing-history', {
          strokes: drawingHistory
        })

        // Start background composition for the room
        if (socket.services.backgroundCompositionService) {
          socket.services.backgroundCompositionService.startComposition(roomId, {
            roomId: roomId,
            userCount: result.room.userCount,
            activeUsers: result.users.map(u => u.id)
          })
        }

        // console.log(`User ${socket.userId} joined room ${roomId} (${latency}ms)`)

        // Log constitutional compliance
        if (latency > LATENCY.WEBSOCKET_MAX) {
          // console.warn(`Join-room latency ${latency}ms exceeds ${LATENCY.WEBSOCKET_MAX}ms constitutional requirement`)
        }
      } catch (error) {
        // console.error('Join-room error:', error)

        if (error.message === 'ROOM_FULL') {
          return ValidationHandler.sendError(callback, 'ROOM_FULL', 'Room has reached maximum capacity')
        }

        if (error.message === 'User already in this room') {
          return ValidationHandler.sendError(callback, 'ALREADY_IN_ROOM', 'User is already in this room')
        }

        return ValidationHandler.sendError(callback, 'JOIN_FAILED', 'Failed to join room')
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
          return ValidationHandler.sendError(callback, 'NO_USER_SESSION', 'No active user session')
        }

        if (!socket.roomId) {
          return ValidationHandler.sendError(callback, 'NOT_IN_ROOM', 'User is not in any room')
        }

        const roomId = socket.roomId

        // Get user's color before leaving
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

        ValidationHandler.sendResponse(callback, response)

        // Broadcast user-left to remaining users
        socket.to(roomId).emit('user-left', {
          userId: socket.userId,
          color: userColor,
          userCount: result.remainingUsers,
          timestamp: Date.now()
        })

        // console.log(`User ${socket.userId} left room ${roomId} (${latency}ms)`)

        if (latency > LATENCY.WEBSOCKET_MAX) {
          // console.warn(`Leave-room latency ${latency}ms exceeds ${LATENCY.WEBSOCKET_MAX}ms constitutional requirement`)
        }
      } catch (error) {
        // console.error('Leave-room error:', error)
        return ValidationHandler.sendError(callback, 'LEAVE_FAILED', 'Failed to leave room')
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
          return ValidationHandler.sendError(callback, 'NO_USER_SESSION', 'No active user session')
        }

        // Process heartbeat
        const result = socket.services.roomManager.handleHeartbeat(socket.userId)

        const latency = Date.now() - startTime

        if (result.success) {
          const response = {
            success: true,
            userId: socket.userId,
            roomId: result.roomId,
            userCount: result.userCount,
            lastActivity: result.lastActivity,
            serverTime: Date.now(),
            latency
          }

          ValidationHandler.sendResponse(callback, response)

          // Notify room of inactive users if any
          if (result.inactiveUsers && result.inactiveUsers.length > 0) {
            socket.services.io.to(result.roomId).emit('users-inactive', {
              inactiveUsers: result.inactiveUsers,
              timestamp: Date.now()
            })
          }
        } else {
          return ValidationHandler.sendError(callback, 'SESSION_INVALID', result.error, {
            shouldReconnect: result.shouldReconnect
          })
        }
      } catch (error) {
        // console.error('Heartbeat error:', error)
        return ValidationHandler.sendError(callback, 'HEARTBEAT_FAILED', 'Heartbeat processing failed')
      }
    })
  },

  /**
   * Register disconnect event handler
   * @param {Socket} socket - Socket instance
   */
  registerDisconnectionHandler (socket) {
    socket.on('disconnect', () => {
      this.handleDisconnection(socket, socket.services.roomManager)
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
        // Get user's color before cleanup
        const room = roomManager.getRoom(socket.roomId)
        const user = room ? room.getUser(socket.userId) : null
        const userColor = user ? user.assignedColor : null

        // Clean up any active holds from disconnected user
        if (room?.activeHolds) {
          let cleanedCount = 0
          for (const [noteId, hold] of room.activeHolds.entries()) {
            if (hold.userId === socket.userId) {
              socket.to(socket.roomId).emit('hold:end', {
                type: 'hold:end',
                userId: socket.userId,
                noteId: noteId,
                duration: Date.now() - hold.startTime,
                reason: 'disconnect',
                timestamp: Date.now()
              })
              room.activeHolds.delete(noteId)
              cleanedCount++
            }
          }
          if (cleanedCount > 0) {
            // console.log(`🧹 Cleaned up ${cleanedCount} active holds from disconnected user ${socket.userId}`)
          }
        }

        // Remove user from room
        roomManager.leaveRoom(socket.userId)

        // Broadcast user-left to remaining users
        socket.to(socket.roomId).emit('user-left', {
          userId: socket.userId,
          color: userColor,
          timestamp: Date.now()
        })

        // Stop background composition if room is now empty
        const roomAfterLeave = roomManager.getRoom(socket.roomId)
        if (socket.services.backgroundCompositionService) {
          if (!roomAfterLeave || roomAfterLeave.users.size === 0) {
            socket.services.backgroundCompositionService.stopComposition(socket.roomId)
          } else {
            socket.services.backgroundCompositionService.updateRoomContext(socket.roomId, {
              userCount: roomAfterLeave.users.size,
              activeUsers: Array.from(roomAfterLeave.users.values()).map(u => u.id)
            })
          }
        }

        // console.log(`User ${socket.userId} disconnected from room ${socket.roomId}`)
      } catch (error) {
        // console.error('Disconnection cleanup error:', error)
      }
    }
  }
}

module.exports = AuthHandler
