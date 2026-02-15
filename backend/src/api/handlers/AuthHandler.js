/**
 * AuthHandler - Session management handlers
 * Handles: join-room, leave-room, heartbeat, disconnect
 * Entry #Security: Uses Logger and centralized RateLimiter
 */

const ValidationHandler = require('./ValidationHandler')
const { LATENCY } = require('../../constants/MusicConstants')
const { LANDING_ROOM_ID } = require('../../constants/virtualUserConfig')
const { loggers } = require('../../utils/Logger')
const RateLimiter = require('../../utils/RateLimiter')
const logger = loggers.auth

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

        const landingRoomId = LANDING_ROOM_ID

        // Join landing room
        socket.roomId = landingRoomId
        socket.join(landingRoomId)

        // Track connection for polling lifecycle control
        if (socket.services.connectionTracker) {
          socket.services.connectionTracker.onUserConnected(socket.id, landingRoomId)
        } else {
          logger.warn('join-landing: connectionTracker unavailable - polling lifecycle not managed')
        }

// console.log(`✅ User joined landing room:`, {
//          userId: socket.userId,
//          socketId: socket.id,
//          roomId: socket.roomId,
////        })

        // Start unified services for landing
        // Virtual users (3 sources: wikipedia, hackernews, github)
        if (socket.services.virtualUserService) {
          socket.services.virtualUserService.activateForLanding()
        } else {
          logger.warn('virtualUserService not available in socket.services')
        }

        // Background composition (uses SectionStateManager like rooms)
        if (socket.services.backgroundCompositionService) {
          socket.services.backgroundCompositionService.initializeForLanding(landingRoomId)

          // Emit drone to joining socket (delayed to ensure socket is fully joined)
          setTimeout(() => {
            const roomState = socket.services.backgroundCompositionService.roomCompositions?.get(landingRoomId)
            if (roomState) {
              socket.services.backgroundCompositionService.generateAndBroadcastDrone(landingRoomId)
            }
          }, 600)
        } else {
          logger.warn('backgroundCompositionService not available in socket.services')
        }

        // Get initial cursor positions from unified virtualUserService
        let cursors = {}
        if (socket.services.virtualUserService) {
          cursors = socket.services.virtualUserService.getVirtualCursorsForLanding()
        }

        // Get initial metrics from webMetricsPoller
        let metrics = {}
        if (socket.services.webMetricsPoller) {
          metrics = socket.services.webMetricsPoller.getMetrics() || {}
        }

        // Get room activity (users in regular rooms, not landing)
        let roomsActivity = { usersInRooms: 0, activeRooms: 0 }
        if (socket.services.connectionTracker) {
          roomsActivity.usersInRooms = socket.services.connectionTracker.getRegularRoomUserCount()
          roomsActivity.activeRooms = socket.services.connectionTracker.getActiveRoomCount()
        }

        const latency = Date.now() - startTime

        // Send success response
        const response = {
          success: true,
          userId: socket.userId,
          roomId: landingRoomId,
          cursors,
          metrics,
          roomsActivity,
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
          roomsActivity,
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
   * Register request-drone event handler
   * Entry #27: Allows frontend to request drone after audio restart
   * @param {Socket} socket - Socket instance
   */
  registerRequestDroneHandler (socket) {
    socket.on('request-drone', (data, callback) => {
      // console.log('📡 request-drone received from socket:', socket.id, 'roomId:', socket.roomId)
      try {
        const roomId = socket.roomId

        if (!roomId) {
          logger.warn('request-drone: socket not in a room')
          if (callback) callback({ success: false, error: 'Not in a room' })
          return
        }

        // All rooms (including landing): use unified BackgroundCompositionService
        if (socket.services.backgroundCompositionService) {
          // console.log('🎵 Emitting drone to room socket:', roomId)
          socket.services.backgroundCompositionService.emitDroneToSocket(socket, roomId)
          if (callback) callback({ success: true })
        } else {
          logger.error('Background service unavailable')
          if (callback) callback({ success: false, error: 'Background service unavailable' })
        }
      } catch (error) {
        logger.error('request-drone error', { error: error.message })
        if (callback) callback({ success: false, error: error.message })
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

        const { roomId, userData = {}, mode = 'jam' } = data

        // Validate mode
        const validModes = ['jam', 'listen']
        const joinMode = validModes.includes(mode) ? mode : 'jam'

        // Validate room ID format
        if (!/^[a-z0-9-]{3,50}$/i.test(roomId)) {
          return ValidationHandler.sendError(callback, 'INVALID_ROOM_ID', 'Invalid room ID format')
        }

        // Check if this is a new room creation (rate limit only for new rooms)
        const existingRoom = socket.services.roomManager.getRoom(roomId)
        if (!existingRoom) {
          // Rate limit room creation per IP using centralized RateLimiter
          const ip = RateLimiter.getIP(socket)
          const limitResult = RateLimiter.checkLimitByIP('room-creation', ip, {
            windowMs: parseInt(process.env.ROOM_CREATION_WINDOW_MS) || 3600000, // 1 hour
            maxRequests: parseInt(process.env.MAX_ROOMS_PER_IP) || 5
          })

          if (!limitResult.allowed) {
            logger.warn(`Room creation limit exceeded for IP ${ip}`, {
              remaining: limitResult.remaining,
              retryAfter: limitResult.retryAfter
            })
            return ValidationHandler.sendError(callback, 'ROOM_CREATION_LIMIT', 'Room creation limit exceeded. Please wait before creating more rooms.')
          }
        }

        // Generate anonymous user ID if not already set
        if (!socket.userId) {
          socket.userId = ValidationHandler.generateUserId()
        }

        // Validate user data
        const validatedUserData = ValidationHandler.validateUserData(userData)

        // CRITICAL: Join socket room BEFORE roomManager.joinRoom()
        // This ensures the socket receives virtual-users-activated event
        socket.roomId = roomId
        socket.join(roomId)

        // Track connection for polling lifecycle control
        if (socket.services.connectionTracker) {
          socket.services.connectionTracker.onUserConnected(socket.id, roomId)
          socket.services.connectionTracker.updateActivity()
        } else {
          logger.warn('join-room: connectionTracker unavailable - polling lifecycle not managed')
        }

        // Attempt to join room (this may emit virtual-users-activated)
        const result = await socket.services.roomManager.joinRoom(
          socket.userId,
          roomId,
          validatedUserData,
          joinMode
        )

        // Handle redirect case - move socket to correct room
        const actualRoomId = result.room?.roomId || roomId
        if (actualRoomId !== roomId) {
          socket.leave(roomId)
          socket.join(actualRoomId)
          socket.roomId = actualRoomId

          // Re-emit virtual-users-activated to this socket since it missed the event
          // (the event was emitted while socket was still in the original room)
          try {
            const overflowRoom = socket.services.roomManager.getRoom(actualRoomId)
            if (overflowRoom && typeof overflowRoom.hasVirtualUsers === 'function' && overflowRoom.hasVirtualUsers()) {
              const virtualUsersMap = overflowRoom.getVirtualUsers()
              if (virtualUsersMap && virtualUsersMap.size > 0) {
                const virtualUsers = Array.from(virtualUsersMap.entries()).map(([userId, config]) => ({
                  userId,
                  color: config?.color || '#888888',
                  source: userId.replace('-metrics', '')
                }))
                socket.emit('virtual-users-activated', {
                  roomId: actualRoomId,
                  sources: virtualUsers.map(v => v.source),
                  virtualUsers,
                  timestamp: Date.now()
                })
                // console.log(`🎭 Re-emitted virtual-users-activated to redirected socket for room ${actualRoomId}`)
              }
            }
          } catch (reEmitError) {
            logger.error(`Failed to re-emit virtual-users-activated for overflow room ${actualRoomId}`, { error: reEmitError.message })
            // Non-fatal: user will still be in room, just without virtual cursor display initially
          }
        }

        // console.log(`✅ User joined room:`, {
//          userId: socket.userId,
//          socketId: socket.id,
//          roomId: socket.roomId,
//          roomsInSocket: Array.from(socket.rooms),
//          totalUsersInRoom: result.users?.length || 0
////        })

        // Initialize memory state if needed (use actualRoomId in case of redirect)
        let memoryState = socket.services.environmentalMemoryCoordinator.getMemoryState(actualRoomId)
        if (!memoryState) {
          memoryState = socket.services.environmentalMemoryCoordinator.initializeMemoryState(actualRoomId)
        }

        // Calculate processing latency
        const latency = Date.now() - startTime

        // Check if user was redirected from a full room
        const wasRedirected = result.redirectedFrom != null

        // Enhance users with synth data for late joiners
        // Entry #SynthUI: Fetch room once before mapping (performance optimization)
        const currentRoom = socket.services.roomManager.getRoom(actualRoomId)
        const usersWithSynthData = (result.users || []).map(user => {
          const fullUser = currentRoom?.getUser(user.id)
          return {
            ...user,
            synthPresetSlot: fullUser?.synthPresetSlot ?? user.slot,  // Default to assigned slot
            synthParams: fullUser?.synthParams || null
          }
        })

        // Send success response with multi-user canvas data
        const response = {
          success: true,
          userId: socket.userId,
          assignedColor: result.assignedColor,
          assignedSlot: result.assignedSlot,  // Backend-assigned exclusive synth slot (0-3)
          users: usersWithSynthData,
          room: result.room,
          user: result.user,
          memoryInfluence: result.memoryInfluence,
          otherUsers: result.otherUsers,
          latency,
          timestamp: Date.now()
        }

        // Include redirect info if applicable
        if (wasRedirected) {
          response.redirectedFrom = result.redirectedFrom
          response.redirectMessage = `Room ${result.redirectedFrom} was full. You have been redirected to ${actualRoomId}`
        }

        // Include virtual users info if in solo mode
        // currentRoom already declared above for synth data mapping
        if (currentRoom && currentRoom.hasVirtualUsers()) {
          response.virtualUsers = Array.from(currentRoom.getVirtualUsers().entries()).map(([userId, config]) => ({
            userId,
            color: config.color,
            source: userId.replace('-metrics', '')
          }))
          response.roomMode = 'solo'
        } else {
          response.roomMode = 'multi'
        }

        // Add userType and canPromote to response for listen mode
        if (result.userType === 'listener') {
          response.userType = 'listener'
          response.canPromote = result.canPromote
        } else {
          response.userType = 'jammer'
        }

        ValidationHandler.sendResponse(callback, response)

        // ── LISTENER join path ──
        if (result.userType === 'listener') {
          // Emit room-joined to listener
          socket.emit('room-joined', {
            roomId: actualRoomId,
            userId: socket.userId,
            assignedSlot: null,
            userType: 'listener',
            canPromote: result.canPromote,
            users: result.users,
            room: result.room,
            timestamp: Date.now()
          })

          // Broadcast listener-joined to room
          socket.to(actualRoomId).emit('listener-joined', {
            userId: socket.userId,
            color: result.assignedColor,
            listenerCount: currentRoom ? currentRoom.getListenerCount() : 0,
            timestamp: Date.now()
          })

          // Send existing users info to listener
          const existingListenerUsers = usersWithSynthData.filter(u => u.id !== socket.userId)
          existingListenerUsers.forEach(existingUser => {
            socket.emit('user-joined', {
              userId: existingUser.id,
              color: existingUser.color,
              slot: existingUser.slot,
              synthPresetSlot: existingUser.synthPresetSlot,
              synthParams: existingUser.synthParams,
              user: existingUser,
              userCount: result.room.userCount,
              timestamp: Date.now()
            })
          })

          // Send drawing history to listener
          const listenerDrawingHistory = socket.services.roomManager.getDrawingHistory(actualRoomId)
          socket.emit('drawing-history', { strokes: listenerDrawingHistory })

          // Emit drone to listener (they need to hear the music)
          if (socket.services.backgroundCompositionService) {
            setTimeout(() => {
              socket.services.backgroundCompositionService.emitDroneToSocket(socket, actualRoomId)
            }, 600)
          }

        } else {
          // ── JAMMER join path (existing logic) ──

          // Emit room-joined event for test compatibility (use actualRoomId for overflow rooms)
          socket.emit('room-joined', {
            roomId: actualRoomId,
            userId: socket.userId,
            assignedSlot: result.assignedSlot,
            userType: 'jammer',
            users: result.users,
            room: result.room,
            timestamp: Date.now()
          })

          // Broadcast user-joined to other users in room (use actualRoomId for overflow rooms)
          socket.to(actualRoomId).emit('user-joined', {
            userId: socket.userId,
            color: result.assignedColor,
            slot: result.assignedSlot,
            synthPresetSlot: result.assignedSlot,  // Default synth preset = assigned slot
            synthParams: null,  // New user has no custom params yet
            user: result.user,
            userCount: result.room.userCount,
            timestamp: Date.now()
          })

          // Send user-joined events for existing users to the new user
          const existingUsers = usersWithSynthData.filter(u => u.id !== socket.userId)
          existingUsers.forEach(existingUser => {
            socket.emit('user-joined', {
              userId: existingUser.id,
              color: existingUser.color,
              slot: existingUser.slot,
              synthPresetSlot: existingUser.synthPresetSlot,
              synthParams: existingUser.synthParams,
              user: existingUser,
              userCount: result.room.userCount,
              timestamp: Date.now()
            })
          })

          // Send drawing history to new user (use actualRoomId for overflow rooms)
          const drawingHistory = socket.services.roomManager.getDrawingHistory(actualRoomId)
          socket.emit('drawing-history', {
            strokes: drawingHistory
          })

          // Start background composition for the room
          if (socket.services.backgroundCompositionService) {
            socket.services.backgroundCompositionService.startComposition(actualRoomId, {
              roomId: actualRoomId,
              userCount: result.room.userCount,
              activeUsers: result.users.map(u => u.id)
            })

            // Entry #27: Always emit drone to joining socket (fixes drone not playing after stop/start)
            // Delayed to ensure socket is fully joined and composition is initialized
            setTimeout(() => {
              socket.services.backgroundCompositionService.emitDroneToSocket(socket, actualRoomId)
            }, 600)
          }

          // Broadcast room-capacity-changed to listeners
          if (socket.services.io && currentRoom) {
            socket.services.io.to(actualRoomId).emit('room-capacity-changed', {
              roomId: actualRoomId,
              userCount: currentRoom.getUserCount(),
              listenerCount: currentRoom.getListenerCount(),
              isFull: currentRoom.isFull(),
              maxUsers: currentRoom.maxUsers,
              timestamp: Date.now()
            })
          }
        }

        // Emit rooms-activity update to landing page clients
        if (socket.services.connectionTracker && socket.services.io) {
          const usersInRooms = socket.services.connectionTracker.getRegularRoomUserCount()
          const activeRooms = socket.services.connectionTracker.getActiveRoomCount()
          socket.services.io.to(LANDING_ROOM_ID).emit('rooms-activity', {
            usersInRooms,
            activeRooms,
            timestamp: Date.now()
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

        if (error.message && error.message.startsWith('ROOM_EMPTY')) {
          return ValidationHandler.sendError(callback, 'ROOM_EMPTY', 'No active jammers in this room')
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

        // Get user info before leaving
        const room = socket.services.roomManager.getRoom(roomId)
        const isListener = room ? room.isListener(socket.userId) : false
        const user = isListener
          ? (room.listeners ? room.listeners.get(socket.userId) : null)
          : (room ? room.getUser(socket.userId) : null)
        const userColor = user ? user.assignedColor : null

        // Remove user from room (handles both jammers and listeners)
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
          wasListener: result.wasListener,
          remainingUsers: result.remainingUsers,
          memoryExpirationStarted: result.memoryExpirationStarted,
          latency,
          timestamp: Date.now()
        }

        ValidationHandler.sendResponse(callback, response)

        if (result.wasListener) {
          // Broadcast listener-left
          socket.to(roomId).emit('listener-left', {
            userId: socket.userId,
            listenerCount: result.remainingListeners,
            timestamp: Date.now()
          })
        } else {
          // Broadcast user-left to remaining users
          socket.to(roomId).emit('user-left', {
            userId: socket.userId,
            color: userColor,
            userCount: result.remainingUsers,
            timestamp: Date.now()
          })

          // Broadcast room-capacity-changed to listeners
          const roomAfterLeave = socket.services.roomManager.getRoom(roomId)
          if (socket.services.io && roomAfterLeave) {
            socket.services.io.to(roomId).emit('room-capacity-changed', {
              roomId,
              userCount: roomAfterLeave.getUserCount(),
              listenerCount: roomAfterLeave.getListenerCount(),
              isFull: roomAfterLeave.isFull(),
              maxUsers: roomAfterLeave.maxUsers,
              timestamp: Date.now()
            })
          }

          // Stop or update background composition
          if (socket.services.backgroundCompositionService) {
            const roomForComp = roomAfterLeave || socket.services.roomManager.getRoom(roomId)
            if (!roomForComp || roomForComp.getUserCount() === 0) {
              socket.services.backgroundCompositionService.stopComposition(roomId)
            } else {
              socket.services.backgroundCompositionService.updateRoomContext(roomId, {
                userCount: roomForComp.getUserCount(),
                activeUsers: roomForComp.getUsers().map(u => u.id)
              })
            }
          }
        }

        // Emit rooms-activity update to landing page clients
        if (socket.services.connectionTracker && socket.services.io) {
          const usersInRooms = socket.services.connectionTracker.getRegularRoomUserCount()
          const activeRooms = socket.services.connectionTracker.getActiveRoomCount()
          socket.services.io.to(LANDING_ROOM_ID).emit('rooms-activity', {
            usersInRooms,
            activeRooms,
            timestamp: Date.now()
          })
        }

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
   * Register promote-to-jammer event handler
   * Allows a listener to become a full jammer if room has space
   * @param {Socket} socket - Socket instance
   */
  registerPromoteToJammerHandler (socket) {
    socket.on('promote-to-jammer', async (data, callback) => {
      const startTime = Date.now()

      try {
        if (!socket.userId || !socket.roomId) {
          return ValidationHandler.sendError(callback, 'NO_SESSION', 'No active session')
        }

        const result = socket.services.roomManager.promoteToJammer(
          socket.userId,
          socket.roomId
        )

        if (!result.success) {
          // Emit promotion-failed event
          socket.emit('promotion-failed', {
            reason: result.error,
            message: result.message,
            timestamp: Date.now()
          })
          return ValidationHandler.sendError(callback, result.error, result.message)
        }

        const latency = Date.now() - startTime

        // Emit promoted-to-jammer to the promoted user
        const roomAfterPromote = socket.services.roomManager.getRoom(socket.roomId)
        socket.emit('promoted-to-jammer', {
          userId: socket.userId,
          assignedSlot: result.assignedSlot,
          assignedColor: result.assignedColor,
          userType: 'jammer',
          userCount: roomAfterPromote ? roomAfterPromote.getUserCount() : 1,
          latency,
          timestamp: Date.now()
        })

        // Broadcast user-joined to room (with promotedFromListener flag)
        const room = socket.services.roomManager.getRoom(socket.roomId)
        const promotedUser = room ? room.getUser(socket.userId) : null
        socket.to(socket.roomId).emit('user-joined', {
          userId: socket.userId,
          color: result.assignedColor,
          slot: result.assignedSlot,
          synthPresetSlot: result.assignedSlot,
          synthParams: null,
          user: promotedUser ? promotedUser.toUserProfile() : { id: socket.userId, color: result.assignedColor, slot: result.assignedSlot },
          promotedFromListener: true,
          userCount: room ? room.getUserCount() : 0,
          timestamp: Date.now()
        })

        // Broadcast room-capacity-changed
        if (socket.services.io && room) {
          socket.services.io.to(socket.roomId).emit('room-capacity-changed', {
            roomId: socket.roomId,
            userCount: room.getUserCount(),
            listenerCount: room.getListenerCount(),
            isFull: room.isFull(),
            maxUsers: room.maxUsers,
            timestamp: Date.now()
          })
        }

        // Start/update background composition
        if (socket.services.backgroundCompositionService && room) {
          socket.services.backgroundCompositionService.startComposition(socket.roomId, {
            roomId: socket.roomId,
            userCount: room.getUserCount(),
            activeUsers: room.getUsers().map(u => u.id)
          })
        }

        ValidationHandler.sendResponse(callback, {
          success: true,
          assignedSlot: result.assignedSlot,
          assignedColor: result.assignedColor,
          latency
        })
      } catch (error) {
        logger.error('Promote-to-jammer error', { error: error.message, userId: socket.userId })
        return ValidationHandler.sendError(callback, 'PROMOTION_ERROR', 'Failed to promote to jammer')
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
  async handleDisconnection (socket, roomManager) {
    // Track disconnection for polling lifecycle (applies to all rooms including landing)
    if (socket.services.connectionTracker) {
      socket.services.connectionTracker.onUserDisconnected(socket.id)
    } else {
      logger.warn('disconnect: connectionTracker unavailable - polling lifecycle not managed')
    }

    if (socket.userId && socket.roomId) {
      // Skip room manager for landing-room (not managed by RoomManager)
      const isLandingRoom = socket.roomId === LANDING_ROOM_ID

      if (!isLandingRoom) {
        // Hoist variables before try so they're accessible in catch for fallback broadcast
        let room = null
        let isListener = false
        let userColor = null

        try {
          // Get user info before cleanup
          room = roomManager.getRoom(socket.roomId)
          isListener = room ? room.isListener(socket.userId) : false
          const user = isListener
            ? (room.listeners ? room.listeners.get(socket.userId) : null)
            : (room ? room.getUser(socket.userId) : null)
          userColor = user ? user.assignedColor : null

          // Clean up any active holds from disconnected user (jammers only)
          if (!isListener && room?.activeHolds) {
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
              }
            }
          }

          // Remove user from room (handles both jammers and listeners)
          const leaveResult = await roomManager.leaveRoom(socket.userId)

          if (leaveResult.wasListener) {
            // Broadcast listener-left
            socket.to(socket.roomId).emit('listener-left', {
              userId: socket.userId,
              listenerCount: leaveResult.remainingListeners,
              timestamp: Date.now()
            })
          } else {
            // Broadcast user-left to remaining users
            socket.to(socket.roomId).emit('user-left', {
              userId: socket.userId,
              color: userColor,
              userCount: leaveResult.remainingUsers,
              timestamp: Date.now()
            })

            // Broadcast room-capacity-changed
            const roomForCapacity = roomManager.getRoom(socket.roomId)
            if (socket.services.io && roomForCapacity) {
              socket.services.io.to(socket.roomId).emit('room-capacity-changed', {
                roomId: socket.roomId,
                userCount: roomForCapacity.getUserCount(),
                listenerCount: roomForCapacity.getListenerCount(),
                isFull: roomForCapacity.isFull(),
                maxUsers: roomForCapacity.maxUsers,
                timestamp: Date.now()
              })
            }
          }

          // Get room reference for subsequent operations
          const roomAfterLeave = roomManager.getRoom(socket.roomId)

          // Stop background composition if room is now empty (no jammers)
          if (socket.services.backgroundCompositionService) {
            if (!roomAfterLeave || roomAfterLeave.getUserCount() === 0) {
              socket.services.backgroundCompositionService.stopComposition(socket.roomId)
            } else {
              socket.services.backgroundCompositionService.updateRoomContext(socket.roomId, {
                userCount: roomAfterLeave.getUserCount(),
                activeUsers: roomAfterLeave.getUsers().map(u => u.id)
              })
            }
          }

        // Emit rooms-activity update to landing page clients
        if (socket.services.connectionTracker && socket.services.io) {
          const usersInRooms = socket.services.connectionTracker.getRegularRoomUserCount()
          const activeRooms = socket.services.connectionTracker.getActiveRoomCount()
          socket.services.io.to(LANDING_ROOM_ID).emit('rooms-activity', {
            usersInRooms,
            activeRooms,
            timestamp: Date.now()
          })
        }
      } catch (error) {
        logger.error(`Disconnection cleanup error for user ${socket.userId} in room ${socket.roomId}:`, error.message)

        // FIX: Even if leaveRoom fails, broadcast user-left so clients clean up cursors/nodes
        try {
          if (!isListener) {
            socket.to(socket.roomId).emit('user-left', {
              userId: socket.userId,
              color: userColor,
              userCount: room ? room.getUserCount() : 0,
              timestamp: Date.now()
            })
          } else {
            socket.to(socket.roomId).emit('listener-left', {
              userId: socket.userId,
              listenerCount: room ? room.getListenerCount() : 0,
              timestamp: Date.now()
            })
          }
        } catch (broadcastError) {
          logger.error(`Failed to broadcast user-left fallback for ${socket.userId}:`, broadcastError.message)
        }
      }
      }
    }
  }
}

module.exports = AuthHandler
