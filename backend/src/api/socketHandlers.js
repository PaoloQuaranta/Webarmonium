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
    this.registerDisconnectionHandler(socket)

    // SUSTAINED HOLD: Register hold event handlers
    this.registerHoldStartHandler(socket)
    this.registerHoldEndHandler(socket)

    // Multi-user canvas handlers
    this.registerDrawStartHandler(socket)
    this.registerDrawPointHandler(socket)
    this.registerDrawEndHandler(socket)
    this.registerCursorMoveHandler(socket)
    this.registerHoverUpdateHandler(socket)
    this.registerCursorPositionHandler(socket)

    console.log('🔌 Registered ALL handlers for socket:', socket.id, 'including hover-update and cursor-position')

    // Performance monitoring
    socket.on('*', () => {
      socket.lastActivity = Date.now()
    })

    // Phase 3.3 Generative Music System handlers
    this.registerGestureRecordHandler(socket)
    this.registerMusicalEventHandler(socket)
    this.registerCompositionUpdateHandler(socket)
    this.registerClockSyncHandler(socket)
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

        console.log(`✅ User joined room:`, {
          userId: socket.userId,
          socketId: socket.id,
          roomId: socket.roomId,
          roomsInSocket: Array.from(socket.rooms),
          totalUsersInRoom: result.users?.length || 0
        })

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

        // Emit room-joined event for test compatibility
        socket.emit('room-joined', {
          roomId: roomId,
          userId: socket.userId,
          users: result.users,
          room: result.room,
          timestamp: Date.now()
        })

        // Broadcast user-joined to other users in room (with color for multi-user canvas)
        socket.to(roomId).emit('user-joined', {
          userId: socket.userId,
          color: result.assignedColor, // Multi-user canvas: user's color
          user: result.user,
          userCount: result.room.userCount,
          timestamp: Date.now()
        })

        // Send user-joined events for existing users to the new user
        // This ensures the new user sees all users already in the room
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

        // Send drawing history to new user (T018: drawing-history emission)
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

      // Ensure callback exists and provide timeout safety
      const timeoutId = setTimeout(() => {
        console.warn('⚠️ Gesture processing timeout - sending fallback response')
        if (typeof callback === 'function') {
          callback({
            success: true,
            gesture: { id: `fallback_${Date.now()}` },
            memoryUpdated: false,
            totalLatency: Date.now() - startTime,
            timestamp: Date.now()
          })
        }
      }, 4000) // 4 second timeout

      try {
        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          clearTimeout(timeoutId)
          return this.sendError(callback, 'NO_ACTIVE_SESSION', 'No active room session')
        }

        // Validate gesture data
        if (!data || !data.type || !data.coordinates || data.intensity === undefined) {
          clearTimeout(timeoutId)
          return this.sendError(callback, 'INVALID_GESTURE_DATA', 'Invalid gesture data')
        }

        // Record gesture for collective metrics analysis (non-blocking)
        try {
          socket.services.roomManager.recordGesture(socket.roomId, {
            ...data,
            userId: socket.userId,
            timestamp: Date.now()
          })
        } catch (error) {
          console.warn('⚠️ Failed to record gesture for metrics:', error.message)
          // Don't block gesture processing if metrics recording fails
        }

        // CRITICAL: Check if gesture includes streamedNotes from frontend
        // If yes, use exact notes instead of generating new ones
        let musicalResult = null
        let gestureData = {
          userId: socket.userId,
          roomId: socket.roomId,
          gesture: data
        }

        if (data.streamedNotes && Array.isArray(data.streamedNotes) && data.streamedNotes.length > 0) {
          console.log('🔍 Processing streamedNotes from frontend:', data.streamedNotes.length, 'notes')

          // Convert streamedNotes to musical events format for broadcast
          const startTime = Date.now()
          musicalResult = data.streamedNotes.map((note, index) => {
            // Calculate delay from start of phrase
            const relativeDelay = note.timestamp - data.streamedNotes[0].timestamp

            return {
              id: `streamed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${index}`,
              eventType: 'note',
              userId: socket.userId,
              timestamp: startTime + relativeDelay, // Preserve relative timing
              position: note.position,
              properties: {
                frequency: note.frequency, // Use exact frequency from frontend
                duration: note.duration,
                velocity: note.velocity * 100 || 80,
                articulation: note.articulation || 'staccato', // Use velocity-based articulation from frontend
                gestureAction: data.action,
                gestureType: data.type,
                noteIndex: index,
                totalNotes: data.streamedNotes.length,
                // CRITICAL: Mark as streamed for remote playback with square wave
                isStreamed: true
              }
            }
          })
        } else {
          // Process gesture through our updated GestureToMusicService
          try {
            // Use shared service instance for harmonic coherence
            musicalResult = socket.services.gestureToMusicService.processGesture(gestureData)
          } catch (error) {
            console.error('GestureToMusicService failed:', error)
            // Continue with fallback gesture processing instead of throwing
            musicalResult = null
          }
        }

        // CRITICAL: Add material to BackgroundCompositionService for BOTH streamedNotes and processGesture paths
        // This ensures the gestural profiling system works for all gesture types
        if (musicalResult && socket.services.backgroundCompositionService) {
          console.log('🔍 DEBUG addMaterial condition check:', {
            hasMusicalResult: !!musicalResult,
            hasBackgroundService: !!socket.services.backgroundCompositionService,
            roomId: socket.roomId,
            gestureType: gestureData.gesture?.type,
            musicalResultType: Array.isArray(musicalResult) ? 'array' : 'object',
            musicalResultLength: Array.isArray(musicalResult) ? musicalResult.length : 'N/A'
          })

          try {
            // Helper: Convert Tone.js duration notation to milliseconds (at 120 BPM)
            const toneDurationToMs = (toneDuration) => {
              if (typeof toneDuration === 'number') return toneDuration // Already in ms

              const durationMap = {
                '32n': 62.5,   // 1/32 note at 120 BPM = 62.5ms
                '16n': 125,    // 1/16 note at 120 BPM = 125ms
                '8n': 250,     // 1/8 note at 120 BPM = 250ms
                '4n': 500,     // 1/4 note at 120 BPM = 500ms
                '2n': 1000,    // 1/2 note at 120 BPM = 1000ms
                '1n': 2000     // Whole note at 120 BPM = 2000ms
              }
              return durationMap[toneDuration] || 250 // Default to 8n if unknown
            }

            // Convert array format (streamedNotes) to object format expected by addMaterial
            const musicalPhrase = Array.isArray(musicalResult)
              ? {
                notes: musicalResult.map(event => ({
                  pitch: event.properties.frequency,
                  duration: toneDurationToMs(event.properties.duration), // Convert to ms
                  velocity: event.properties.velocity / 100,
                  articulation: event.properties.articulation,
                  timestamp: event.timestamp
                })),
                duration: musicalResult.reduce((sum, event) => sum + toneDurationToMs(event.properties.duration), 0)
              }
              : musicalResult

            console.log('✅ Calling addMaterial with:', {
              roomId: socket.roomId,
              gestureType: gestureData.gesture?.type,
              notes: musicalPhrase.notes?.length || 0,
              duration: musicalPhrase.duration
            })

            socket.services.backgroundCompositionService.addMaterial(
              socket.roomId,
              gestureData,
              musicalPhrase
            )
            console.log('✅ addMaterial completed successfully')
          } catch (error) {
            console.error('❌ addMaterial ERROR:', error)
          }
        } else {
          console.warn('⚠️ Skipping addMaterial - condition not met:', {
            hasMusicalResult: !!musicalResult,
            hasBackgroundService: !!socket.services.backgroundCompositionService
          })
        }

        // Constitutional requirement: <200ms processing
        const processingLatency = Date.now() - startTime
        if (processingLatency > 200) {
          console.warn(`Gesture processing exceeded 200ms: ${processingLatency}ms`)
        }

        // Store gesture in room memory using old system for compatibility
        // BUT NOT for hover gestures - they should only generate filter modulation, not notes
        // CRITICAL: SKIP old system if we already processed streamedNotes!
        let gesture = null
        let memoryResult = null
        let memoryUpdate = null

        const hasStreamedNotes = data.streamedNotes && Array.isArray(data.streamedNotes) && data.streamedNotes.length > 0

        if (data.action !== 'hover' && !hasStreamedNotes) {
          // Only use old system if NO streamedNotes (tap gestures, old clients)
          gesture = socket.services.gestureProcessor.processGesture(
            socket.userId,
            socket.roomId,
            data
          )
          memoryResult = socket.services.roomManager.processGesture(socket.userId, gesture)

          // Update environmental memory
          const room = socket.services.roomManager.getRoom(socket.roomId)
          memoryUpdate = socket.services.environmentalMemoryCoordinator.processGestureMemory(
            gesture,
            { activeUsers: room.getUserCount() }
          )
        } else if (hasStreamedNotes) {
          // Create minimal gesture for response
          gesture = {
            toProcessedResponse: () => ({
              id: data.id,
              action: data.action,
              coordinates: data.coordinates,
              timestamp: Date.now()
            })
          }
          // Skip memory updates for streamed notes
          memoryUpdate = { success: false, patternsEvolved: 0, newPatterns: 0 }
        } else {
          // Create empty memory update for hover gestures
          memoryUpdate = { success: false, patternsEvolved: 0, newPatterns: 0 }
        }

        // Generate sonic update if patterns evolved
        let sonicUpdate = null
        if (memoryUpdate.success && (memoryUpdate.patternsEvolved > 0 || memoryUpdate.newPatterns > 0)) {
          sonicUpdate = socket.services.environmentalMemoryCoordinator.generateSonicUpdate(socket.roomId)
        }

        // Calculate total latency
        const totalLatency = Date.now() - startTime

        // Send gesture-processed response to sender
        let gestureResponse
        if (data.action === 'hover') {
          // For hover gestures, create a minimal response since we don't process musical notes
          gestureResponse = {
            id: `hover_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            action: 'hover',
            coordinates: data.coordinates,
            intensity: data.intensity,
            timestamp: Date.now()
          }
        } else {
          // For normal gestures, use the processed response
          gestureResponse = gesture.toProcessedResponse()
        }

        const response = {
          success: true,
          gesture: gestureResponse,
          memoryUpdated: memoryUpdate ? memoryUpdate.success : false,
          patternsEvolved: memoryUpdate ? memoryUpdate.patternsEvolved || 0 : 0,
          newPatterns: memoryUpdate ? memoryUpdate.newPatterns || 0 : 0,
          totalLatency,
          timestamp: Date.now()
        }

        // Clear timeout before sending response
        clearTimeout(timeoutId)
        this.sendResponse(callback, response)

        // Broadcast musical events to all users in room
        // Filter out null/undefined results
        const musicalEvents = Array.isArray(musicalResult)
          ? musicalResult.filter(e => e != null)
          : (musicalResult ? [musicalResult] : [])

        musicalEvents.forEach((musicalEvent, index) => {
          const eventType = musicalEvent.eventType || 'musical'

          const musicalEventBroadcast = {
            id: musicalEvent.id,
            userId: socket.userId,
            roomId: socket.roomId,
            event: musicalEvent.toJSON ? musicalEvent.toJSON() : musicalEvent,
            timestamp: Date.now()
          }

          // For filter modulation events, include sender as well using global emit
          if (eventType === 'filter_modulation') {
            // Get global io instance by accessing socket's server
            const io = socket.server || socket.nsp.server
            if (io) {
              io.to(socket.roomId).emit('musical:event', musicalEventBroadcast)
              console.log(`  ✅ Broadcasted filter_modulation event to all users in room (including sender)`)
            } else {
              console.warn(`  ⚠️ Cannot access global io instance, falling back to local emit`)
              // Fallback: send to all in room including sender using adapter
              socket.adapter.to(socket.roomId).emit('musical:event', musicalEventBroadcast)
              console.log(`  ✅ Broadcasted filter_modulation using socket adapter`)
            }
          } else {
            // Send to other users only for regular musical events
            console.log(`  🔍 Broadcasting musical:event:`, {
              fromUser: socket.userId,
              toRoom: socket.roomId,
              eventId: musicalEventBroadcast.id,
              eventType: musicalEvent.eventType,
              hasProperties: !!musicalEvent.properties
            })
            socket.to(socket.roomId).emit('musical:event', musicalEventBroadcast)
            console.log(`  ✅ Broadcasted musical event to other users in room ${socket.roomId}`)
          }
        })

        // Broadcast gesture-echo to other users in room
        if (memoryResult && memoryResult.broadcastTo && memoryResult.broadcastTo.length > 0) {
          socket.to(socket.roomId).emit('gesture-echo', {
            ...gesture.toEchoBroadcast(),
            timestamp: Date.now()
          })
        }

        // Broadcast sonic-update if patterns changed
        if (sonicUpdate) {
          socket.to(socket.roomId).emit('sonic-update', sonicUpdate)
        }

        // Update user activity
        socket.services.roomManager.updateUserActivity(socket.userId)

        // Log constitutional compliance
        if (totalLatency > 100) {
          console.warn(`Gesture total latency ${totalLatency}ms exceeds 100ms constitutional requirement`)
        }
      } catch (error) {
        console.error('Gesture processing error:', error)
        clearTimeout(timeoutId)
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
   * SUSTAINED HOLD: Register hold:start event handler
   * @param {Socket} socket - Socket instance
   */
  registerHoldStartHandler (socket) {
    socket.on('hold:start', async (data, callback) => {
      const startTime = Date.now()

      try {
        // Validate session
        if (!socket.userId || !socket.roomId) {
          return this.sendError(callback, 'NO_ACTIVE_SESSION', 'No active room session')
        }

        // Validate data
        if (!data || !data.noteId || !data.frequency || !data.position) {
          return this.sendError(callback, 'INVALID_HOLD_DATA', 'Missing required hold data')
        }

        // Get room
        const room = socket.services.roomManager.getRoom(socket.roomId)
        if (!room) {
          return this.sendError(callback, 'ROOM_NOT_FOUND', 'Room not found')
        }

        // Get user for color
        const user = room.getUser(socket.userId)
        const userColor = user?.assignedColor || '#6bcf7f'

        // Track active hold for disconnect cleanup
        room.activeHolds.set(data.noteId, {
          userId: socket.userId,
          startTime: Date.now(),
          noteId: data.noteId,
          frequency: data.frequency,
          position: data.position
        })

        // Broadcast to other users in room
        const broadcastData = {
          type: 'hold:start',
          userId: socket.userId,
          noteId: data.noteId,
          frequency: data.frequency,
          velocity: data.velocity,
          position: data.position,
          userColor: userColor,
          isRemote: true,
          timestamp: Date.now()
        }

        console.log(`📡 Broadcasting hold:start to room ${socket.roomId}:`, {
          noteId: data.noteId,
          frequency: data.frequency,
          userColor: userColor,
          socketsInRoom: room.getUserCount()
        })

        socket.to(socket.roomId).emit('hold:start', broadcastData)

        // Send acknowledgment
        const latency = Date.now() - startTime
        this.sendResponse(callback, {
          success: true,
          noteId: data.noteId,
          latency,
          timestamp: Date.now()
        })

        console.log(`🎵 Hold started: ${data.noteId} by ${socket.userId} (${latency}ms)`)

        // Log constitutional compliance
        if (latency > 100) {
          console.warn(`⚠️ Hold start latency ${latency}ms exceeds 100ms requirement`)
        }
      } catch (error) {
        console.error('❌ Hold start error:', error)
        return this.sendError(callback, 'HOLD_START_FAILED', error.message)
      }
    })
  },

  /**
   * SUSTAINED HOLD: Register hold:end event handler
   * @param {Socket} socket - Socket instance
   */
  registerHoldEndHandler (socket) {
    socket.on('hold:end', async (data, callback) => {
      const startTime = Date.now()

      try {
        // Validate session
        if (!socket.userId || !socket.roomId) {
          return this.sendError(callback, 'NO_ACTIVE_SESSION', 'No active room session')
        }

        if (!data || !data.noteId) {
          return this.sendError(callback, 'INVALID_HOLD_DATA', 'Missing note ID')
        }

        // Get room and remove from active holds
        const room = socket.services.roomManager.getRoom(socket.roomId)
        if (room?.activeHolds) {
          room.activeHolds.delete(data.noteId)
        }

        // Broadcast to other users
        socket.to(socket.roomId).emit('hold:end', {
          type: 'hold:end',
          userId: socket.userId,
          noteId: data.noteId,
          duration: data.duration,
          timestamp: Date.now()
        })

        // Send acknowledgment
        const latency = Date.now() - startTime
        this.sendResponse(callback, {
          success: true,
          noteId: data.noteId,
          duration: data.duration,
          latency,
          timestamp: Date.now()
        })

        console.log(`🎵 Hold ended: ${data.noteId} (${data.duration}ms, ${latency}ms latency)`)

        // Log constitutional compliance
        if (latency > 100) {
          console.warn(`⚠️ Hold end latency ${latency}ms exceeds 100ms requirement`)
        }
      } catch (error) {
        console.error('❌ Hold end error:', error)
        return this.sendError(callback, 'HOLD_END_FAILED', error.message)
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
        console.log(`👆 cursor-move received from ${socket.userId?.substring(0, 8)}`, data)

        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          console.log('❌ cursor-move: No userId or roomId')
          return
        }

        // Validate data
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number' || typeof data.isDrawing !== 'boolean') {
          console.log('❌ cursor-move: Invalid data', data)
          return
        }

        // Get room and user
        const room = socket.services.roomManager.getUserRoom(socket.userId)
        if (!room) {
          console.log('❌ cursor-move: No room found')
          return
        }

        const user = room.getUser(socket.userId)
        if (!user || !user.assignedColor) {
          console.log('❌ cursor-move: No user or color')
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
        const payload = cursorPosition.toEventPayload(user.assignedColor)
        console.log(`✅ Broadcasting cursor-position to room ${socket.roomId}:`, payload)
        socket.to(socket.roomId).emit('cursor-position', payload)

        // Generate hover-update event for remote audio modulation (three-tier architecture)
        const hoverData = {
          position: { x: data.x, y: data.y },
          velocity: data.velocity || 50,
          intensity: data.intensity || 0.5,
          userId: socket.userId,
          isRemote: true
        }
        console.log(`✅ Broadcasting hover-update to room ${socket.roomId}:`, hoverData)
        // Broadcast to ALL users in room (including sender for testing)
        socket.broadcast.to(socket.roomId).emit('hover-update', hoverData)
        // Alternative: socket.to(socket.roomId).emit('hover-update', hoverData)
      } catch (error) {
        console.error('cursor-move error:', error)
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
        // Get user's color before cleanup (for broadcast)
        const room = roomManager.getRoom(socket.roomId)
        const user = room ? room.getUser(socket.userId) : null
        const userColor = user ? user.assignedColor : null

        // SUSTAINED HOLD: Clean up any active holds from disconnected user
        if (room?.activeHolds) {
          let cleanedCount = 0
          for (const [noteId, hold] of room.activeHolds.entries()) {
            if (hold.userId === socket.userId) {
              // Broadcast hold:end to remaining users
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
            console.log(`🧹 Cleaned up ${cleanedCount} active holds from disconnected user ${socket.userId}`)
          }
        }

        // Remove user from room (T025: calls leaveRoom which releases color, cancels stroke, removes cursor)
        roomManager.leaveRoom(socket.userId)

        // Broadcast user-left to remaining users (consistent with leave-room behavior)
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
            // Update room context with new user count
            socket.services.backgroundCompositionService.updateRoomContext(socket.roomId, {
              userCount: roomAfterLeave.users.size,
              activeUsers: Array.from(roomAfterLeave.users.values()).map(u => u.id)
            })
          }
        }

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
  },

  /**
   * Register gesture:record event handler
   * @param {Socket} socket - Socket instance
   */
  registerGestureRecordHandler (socket) {
    socket.on('gesture:record', async (data, callback) => {
      const startTime = Date.now()

      try {
        // Validate input data
        if (!data || !data.gesture || !socket.roomId || !socket.userId) {
          this.sendError(callback, 'validation_error', 'Missing required fields: gesture, roomId, userId')
          return
        }

        // Validate gesture data structure
        const gestureValidation = this.validateGestureData(data.gesture)
        if (!gestureValidation.isValid) {
          this.sendError(callback, 'validation_error', gestureValidation.error)
          return
        }

        // Process gesture through GestureToMusicService
        const gestureData = {
          userId: socket.userId,
          roomId: socket.roomId,
          gesture: data.gesture
        }

        // Use shared service instance for harmonic coherence
        const musicalResult = socket.services.gestureToMusicService.processGesture(gestureData)

        // Add material to BackgroundCompositionService for continuous composition
        console.log('🔍 DEBUG addMaterial condition check (gesture:record):', {
          hasMusicalResult: !!musicalResult,
          hasBackgroundService: !!socket.services.backgroundCompositionService,
          roomId: socket.roomId,
          gestureType: gestureData.type
        })

        if (musicalResult && socket.services.backgroundCompositionService) {
          console.log('✅ Calling addMaterial (gesture:record) with:', {
            roomId: socket.roomId,
            gestureType: gestureData.type,
            musicalResultKeys: Object.keys(musicalResult),
            notes: musicalResult.notes?.length || 0
          })

          try {
            socket.services.backgroundCompositionService.addMaterial(
              socket.roomId,
              gestureData,
              musicalResult
            )
            console.log('✅ addMaterial completed successfully')
          } catch (error) {
            console.error('❌ addMaterial ERROR:', error)
          }
        } else {
          console.warn('⚠️ Skipping addMaterial - condition not met')
        }

        // Store gesture in room memory
        socket.services.roomManager.addGestureToRoom(socket.roomId, {
          ...data.gesture,
          userId: socket.userId,
          timestamp: Date.now()
        })

        // Handle both single events and arrays of events
        const musicalEvents = Array.isArray(musicalResult) ? musicalResult : [musicalResult]

        // Emit musical events to all users in room
        musicalEvents.forEach(musicalEvent => {
          const musicalEventBroadcast = {
            id: musicalEvent.id,
            userId: socket.userId,
            roomId: socket.roomId,
            event: musicalEvent.toJSON ? musicalEvent.toJSON() : musicalEvent,
            timestamp: Date.now()
          }

          socket.to(socket.roomId).emit('musical:event', musicalEventBroadcast)

          // Store gesture for multi-user synchronization
          this.storeGestureForMultiUserSync(socket.roomId, socket.userId, data.gesture, musicalEventBroadcast)
        })

        // Broadcast gesture to other users for test compatibility
        socket.to(socket.roomId).emit('gesture-broadcast', {
          type: 'gesture',
          userId: socket.userId,
          coordinates: data.gesture.coordinates || [0, 0],
          intensity: data.gesture.intensity || 0.5,
          direction: data.gesture.direction || 'unknown',
          timestamp: Date.now()
        })

        // Update statistics
        socket.services.roomManager.updateRoomStats(socket.roomId, {
          gestureCount: 1,
          lastActivity: Date.now()
        })

        this.sendResponse(callback, {
          success: true,
          gestureId: data.gesture.id,
          musicalEvent: musicalEvent.toJSON(),
          processingTime: Date.now() - startTime,
          timestamp: Date.now()
        })

      } catch (error) {
        console.error('Gesture record error:', error)
        this.sendError(callback, 'processing_error', error.message)
      }
    })
  },

  /**
   * Register musical:event broadcast handler
   * @param {Socket} socket - Socket instance
   */
  registerMusicalEventHandler (socket) {
    socket.on('musical:event', async (data, callback) => {
      const startTime = Date.now()

      try {
        // Validate input data
        if (!data || !data.event || !socket.roomId || !socket.userId) {
          this.sendError(callback, 'validation_error', 'Missing required fields: event, roomId, userId')
          return
        }

        // Validate musical event data
        const eventValidation = this.validateMusicalEventData(data.event)
        if (!eventValidation.isValid) {
          this.sendError(callback, 'validation_error', eventValidation.error)
          return
        }

        // Broadcast musical event to all users in room with spatial audio parameters
        const enhancedEvent = {
          ...data.event,
          spatialAudio: this.calculateSpatialAudio(socket.userId, data.event),
          roomTimestamp: Date.now(),
          processingLatency: Date.now() - startTime
        }

        socket.to(socket.roomId).emit('musical:event', enhancedEvent)

        // Process through pattern recognition service
        if (socket.services.patternRecognitionService) {
          socket.services.patternRecognitionService.processEvent(socket.roomId, enhancedEvent)
        }

        // Update composition engine
        if (socket.services.compositionEngine) {
          socket.services.compositionEngine.processMusicalEvent(socket.roomId, enhancedEvent)
        }

        this.sendResponse(callback, {
          success: true,
          eventId: enhancedEvent.id,
          broadcastTime: Date.now() - startTime,
          timestamp: Date.now()
        })

      } catch (error) {
        console.error('Musical event error:', error)
        this.sendError(callback, 'processing_error', error.message)
      }
    })
  },

  /**
   * Register composition:update event handler
   * @param {Socket} socket - Socket instance
   */
  registerCompositionUpdateHandler (socket) {
    socket.on('composition:update', async (data, callback) => {
      const startTime = Date.now()

      try {
        // Validate input data
        if (!data || !socket.roomId) {
          this.sendError(callback, 'validation_error', 'Missing required fields: roomId')
          return
        }

        // Get current composition from engine
        const composition = socket.services.compositionEngine.getComposition(socket.roomId)

        // Broadcast composition update to all users in room
        const compositionUpdate = {
          roomId: socket.roomId,
          composition: composition.toJSON(),
          evolutionContext: data.evolutionContext || 'automatic',
          triggeredBy: socket.userId,
          timestamp: Date.now(),
          processingLatency: Date.now() - startTime
        }

        socket.to(socket.roomId).emit('composition:update', compositionUpdate)

        // Update pattern integration based on composition changes
        if (data.patternIntegration && socket.services.patternRecognitionService) {
          socket.services.patternRecognitionService.updateIntegrationLevel(
            socket.roomId,
            data.patternIntegration.patternSignature,
            data.patternIntegration.level
          )
        }

        this.sendResponse(callback, {
          success: true,
          composition: compositionUpdate.composition,
          broadcastTime: Date.now() - startTime,
          timestamp: Date.now()
        })

      } catch (error) {
        console.error('Composition update error:', error)
        this.sendError(callback, 'processing_error', error.message)
      }
    })
  },

  /**
   * Register clock:sync event handler
   * @param {Socket} socket - Socket instance
   */
  registerClockSyncHandler (socket) {
    socket.on('clock:sync', async (data, callback) => {
      const startTime = Date.now()

      try {
        // Validate input data
        if (!data || !socket.roomId) {
          this.sendError(callback, 'validation_error', 'Missing required fields: roomId')
          return
        }

        // Get or create musical clock for room
        const clock = socket.services.musicalClockService.getOrCreateClock(socket.roomId)

        // Validate clock parameters
        const clockValidation = this.validateClockData(data)
        if (!clockValidation.isValid) {
          this.sendError(callback, 'validation_error', clockValidation.error)
          return
        }

        // Update clock if parameters provided
        if (data.tempo || data.timeSignature || data.state !== undefined) {
          socket.services.musicalClockService.updateClock(socket.roomId, {
            tempo: data.tempo,
            timeSignature: data.timeSignature,
            state: data.state
          })
        }

        // Calculate timing offsets for synchronization
        const clientOffset = this.calculateTimingOffset(socket, data)

        // Get synchronized clock state
        const syncClock = socket.services.musicalClockService.getSynchronizedClock(socket.roomId, clientOffset)

        // Broadcast clock sync to all users in room
        const clockSync = {
          roomId: socket.roomId,
          clock: syncClock,
          timingOffset: clientOffset,
          networkLatency: Date.now() - startTime,
          syncSource: 'server',
          timestamp: Date.now()
        }

        socket.to(socket.roomId).emit('clock:sync', clockSync)

        // Track clock analytics
        socket.services.musicalClockService.recordSyncEvent(socket.roomId, {
          userId: socket.userId,
          clientOffset,
          networkLatency: Date.now() - startTime,
          timestamp: Date.now()
        })

        this.sendResponse(callback, {
          success: true,
          clock: syncClock,
          timingOffset: clientOffset,
          syncTime: Date.now() - startTime,
          timestamp: Date.now()
        })

      } catch (error) {
        console.error('Clock sync error:', error)
        this.sendError(callback, 'processing_error', error.message)
      }
    })
  },

  /**
   * Validate gesture data structure
   * @param {Object} gesture - Gesture data
   * @returns {Object} Validation result
   */
  validateGestureData (gesture) {
    if (!gesture || typeof gesture !== 'object') {
      return { isValid: false, error: 'Gesture must be an object' }
    }

    const requiredFields = ['id', 'startPosition', 'endPosition', 'speed', 'direction']
    for (const field of requiredFields) {
      if (!(field in gesture)) {
        return { isValid: false, error: `Missing required field: ${field}` }
      }
    }

    // Validate position data
    if (!this.validatePosition(gesture.startPosition) || !this.validatePosition(gesture.endPosition)) {
      return { isValid: false, error: 'Invalid position data' }
    }

    // Validate speed
    if (typeof gesture.speed !== 'number' || gesture.speed <= 0) {
      return { isValid: false, error: 'Speed must be a positive number' }
    }

    // Validate direction
    const validDirections = ['horizontal-left', 'horizontal-right', 'vertical-up', 'vertical-down',
                            'diagonal-up-left', 'diagonal-up-right', 'diagonal-down-left', 'diagonal-down-right']
    if (!validDirections.includes(gesture.direction)) {
      return { isValid: false, error: `Invalid direction. Must be one of: ${validDirections.join(', ')}` }
    }

    return { isValid: true }
  },

  /**
   * Validate musical event data structure
   * @param {Object} event - Musical event data
   * @returns {Object} Validation result
   */
  validateMusicalEventData (event) {
    if (!event || typeof event !== 'object') {
      return { isValid: false, error: 'Musical event must be an object' }
    }

    const requiredFields = ['id', 'userId', 'roomId', 'timestamp', 'pitch', 'duration', 'velocity', 'articulation', 'eventType']
    for (const field of requiredFields) {
      if (!(field in event)) {
        return { isValid: false, error: `Missing required field: ${field}` }
      }
    }

    // Validate musical parameters
    if (typeof event.pitch !== 'number' || event.pitch < 0 || event.pitch > 127) {
      return { isValid: false, error: 'Pitch must be between 0-127 (MIDI range)' }
    }

    if (typeof event.duration !== 'number' || event.duration <= 0) {
      return { isValid: false, error: 'Duration must be a positive number' }
    }

    if (typeof event.velocity !== 'number' || event.velocity < 0 || event.velocity > 127) {
      return { isValid: false, error: 'Velocity must be between 0-127' }
    }

    const validArticulations = ['staccato', 'legato', 'accent']
    if (!validArticulations.includes(event.articulation)) {
      return { isValid: false, error: `Invalid articulation. Must be one of: ${validArticulations.join(', ')}` }
    }

    return { isValid: true }
  },

  /**
   * Validate clock data structure
   * @param {Object} data - Clock data
   * @returns {Object} Validation result
   */
  validateClockData (data) {
    if (data.tempo !== undefined) {
      if (typeof data.tempo !== 'number' || data.tempo < 60 || data.tempo > 200) {
        return { isValid: false, error: 'Tempo must be between 60-200 BPM' }
      }
    }

    if (data.timeSignature !== undefined) {
      if (!data.timeSignature || typeof data.timeSignature !== 'object') {
        return { isValid: false, error: 'Time signature must be an object' }
      }
      if (typeof data.timeSignature.numerator !== 'number' || data.timeSignature.numerator < 1 || data.timeSignature.numerator > 16) {
        return { isValid: false, error: 'Time signature numerator must be between 1-16' }
      }
      if (typeof data.timeSignature.denominator !== 'number' || ![2, 4, 8, 16].includes(data.timeSignature.denominator)) {
        return { isValid: false, error: 'Time signature denominator must be 2, 4, 8, or 16' }
      }
    }

    if (data.state !== undefined && !['stopped', 'running'].includes(data.state)) {
      return { isValid: false, error: 'Clock state must be "stopped" or "running"' }
    }

    return { isValid: true }
  },

  /**
   * Calculate spatial audio parameters for event
   * @param {string} userId - User ID
   * @param {Object} event - Musical event
   * @returns {Object} Spatial audio parameters
   */
  calculateSpatialAudio (userId, event) {
    // Get user position in room (simplified)
    const userPosition = { x: 0, y: 0 } // Would get from room state
    const eventPosition = { x: 0, y: 0 } // Would calculate from event properties

    // Calculate spatial parameters
    const distance = Math.sqrt(
      Math.pow(eventPosition.x - userPosition.x, 2) +
      Math.pow(eventPosition.y - userPosition.y, 2)
    )

    const maxDistance = 500 // pixels
    const normalizedDistance = Math.min(1, distance / maxDistance)

    return {
      pan: Math.max(-1, Math.min(1, (eventPosition.x - userPosition.x) / maxDistance)),
      volume: Math.max(0.1, 1 - normalizedDistance * 0.7),
      reverb: normalizedDistance * 0.3,
      delay: normalizedDistance * 0.05 // seconds
    }
  },

  /**
   * Calculate timing offset for clock synchronization
   * @param {Socket} socket - Socket instance
   * @param {Object} data - Client sync data
   * @returns {number} Timing offset in milliseconds
   */
  calculateTimingOffset (socket, data) {
    if (!data.clientTimestamp) return 0

    const serverTime = Date.now()
    const roundTripTime = serverTime - data.clientTimestamp
    const estimatedOffset = roundTripTime / 2

    return estimatedOffset
  },

  /**
   * Store gesture for multi-user synchronization
   * @param {string} roomId - Room identifier
   * @param {string} userId - User identifier
   * @param {Object} gesture - Gesture data
   * @param {Object} musicalEvent - Musical event data
   */
  storeGestureForMultiUserSync (roomId, userId, gesture, musicalEvent) {
    // Store gesture in room for real-time synchronization
    if (!socket.services.roomManager.rooms.has(roomId)) {
      console.warn(`Room ${roomId} not found for multi-user sync`)
      return
    }

    const room = socket.services.roomManager.rooms.get(roomId)

    // Add gesture to synchronization buffer
    if (!room.gestureSyncBuffer) {
      room.gestureSyncBuffer = []
    }

    const syncData = {
      id: gesture.id || `gesture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      gesture: {
        ...gesture,
        timestamp: Date.now()
      },
      musicalEvent,
      syncedAt: Date.now(),
      processed: false
    }

    room.gestureSyncBuffer.push(syncData)

    // Keep buffer size manageable (last 100 gestures)
    if (room.gestureSyncBuffer.length > 100) {
      room.gestureSyncBuffer = room.gestureSyncBuffer.slice(-100)
    }

    // Mark gesture as processed
    syncData.processed = true

    // Update room state for real-time tracking
    room.lastActivity = Date.now()
    room.totalGestures = (room.totalGestures || 0) + 1
  },


  /**
   * Register hover-update event handler with HoverOrchestrator integration
   * @param {Socket} socket - Socket instance
   */
  registerHoverUpdateHandler (socket) {
    socket.on('hover-update', async (data) => {
      const startTime = Date.now()
      try {
        // Validate input data
        if (!data || !socket.roomId || !socket.userId) {
          console.warn('⚠️ hover-update validation failed - missing required fields', {
            hasData: !!data,
            hasRoomId: !!socket.roomId,
            hasUserId: !!socket.userId
          })
          return
        }

        // Get room
        const room = socket.services.roomManager.getRoom(socket.roomId)
        if (!room) {
          console.warn('⚠️ hover-update failed - room not found:', socket.roomId)
          return
        }

        // Validate hover data with proper structure
        const hoverData = {
          position: data.position || { x: 0.5, y: 0.5 },
          velocity: data.velocity || 50,
          intensity: data.intensity || 0.5,
          userId: data.userId || socket.userId,
          isRemote: data.isRemote || false, // preserve original isRemote flag
          timestamp: data.timestamp || Date.now()
        }

        // NEW: Send to HoverOrchestrator for centralized analysis
        this.sendToHoverOrchestrator(socket, hoverData)


        // Update room activity
        room.lastActivity = Date.now()

        // Log processing time
        const processingTime = Date.now() - startTime
        if (processingTime > 50) { // warning threshold for hover processing
          console.warn(`⚠️ Hover processing time ${processingTime}ms exceeds 50ms target`)
        }

      } catch (error) {
        console.error('❌ hover-update error:', error)
      }
    })
  },

  /**
   * Send hover data to HoverOrchestrator for centralized processing
   * @param {Socket} socket - Socket instance
   * @param {Object} hoverData - Hover event data
   */
  sendToHoverOrchestrator(socket, hoverData) {
    try {
      // Get or create HoverOrchestrator for this room
      let hoverOrchestrator = socket.services.roomManager.getHoverOrchestrator(socket.roomId)

      if (!hoverOrchestrator) {
        // Create new HoverOrchestrator instance
        const HoverOrchestrator = require('../services/HoverOrchestrator')
        const io = socket.server || socket.nsp.server
        hoverOrchestrator = new HoverOrchestrator(socket.roomId, io)

        // Store orchestrator in room manager
        socket.services.roomManager.setHoverOrchestrator(socket.roomId, hoverOrchestrator)

        // Start the orchestrator
        hoverOrchestrator.start()
      }

      // Add hover event to orchestrator
      hoverOrchestrator.addHoverEvent(hoverData)

    } catch (error) {
      console.error('❌ Failed to send hover to orchestrator:', error)

      // Fallback: broadcast raw hover data if orchestrator fails
      const io = socket.server || socket.nsp.server
      if (io) {
        io.to(socket.roomId).emit('hover-update', hoverData)
        console.log(`🔄 Fallback: Broadcasted raw hover due to orchestrator error`)
      }
    }
  },

  /**
   * Register cursor-position event handler
   * @param {Socket} socket - Socket instance
   */
  registerCursorPositionHandler (socket) {
    socket.on('cursor-position', async (data) => {
      const startTime = Date.now()
      try {
        // Validate input data
        if (!data || !socket.roomId || !socket.userId) {
          console.warn('⚠️ cursor-position validation failed - missing required fields')
          return
        }

        // Get room
        const room = socket.services.roomManager.getRoom(socket.roomId)
        if (!room) {
          console.warn('⚠️ cursor-position failed - room not found:', socket.roomId)
          return
        }

        // Validate cursor data
        const cursorData = {
          userId: data.userId || socket.userId,
          color: data.color || '#66c2a5',
          x: data.x || 0.5,
          y: data.y || 0.5,
          isDrawing: data.isDrawing || false,
          timestamp: data.timestamp || Date.now()
        }

        console.log(`👆 Received cursor-position from ${cursorData.userId}:`, cursorData)

        // Broadcast to ALL other users in room (excluding sender)
        socket.broadcast.to(socket.roomId).emit('cursor-position', cursorData)

        console.log(`✅ Broadcasted cursor-position to room ${socket.roomId}:`, {
          userId: cursorData.userId,
          x: cursorData.x,
          y: cursorData.y,
          isDrawing: cursorData.isDrawing
        })

        // Update room activity
        room.lastActivity = Date.now()

      } catch (error) {
        console.error('❌ cursor-position error:', error)
      }
    })
  }
}

module.exports = socketHandlers
