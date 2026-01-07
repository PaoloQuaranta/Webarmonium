/**
 * GestureHandler - Gesture processing handlers
 * Handles: gesture, gesture:record
 */

const ValidationHandler = require('./ValidationHandler')

const GestureHandler = {
  /**
   * Register gesture event handler
   * @param {Socket} socket - Socket instance
   */
  registerGestureHandler (socket) {
    socket.on('gesture', async (data, callback) => {
      const startTime = Date.now()

      // Ensure callback exists and provide timeout safety
      const timeoutId = setTimeout(() => {
        // // console.warn('⚠️ Gesture processing timeout - sending fallback response')
        if (typeof callback === 'function') {
          callback({
            success: true,
            gesture: { id: `fallback_${Date.now()}` },
            memoryUpdated: false,
            totalLatency: Date.now() - startTime,
            timestamp: Date.now()
          })
        }
      }, 4000)

      try {
        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          clearTimeout(timeoutId)
          return ValidationHandler.sendError(callback, 'NO_ACTIVE_SESSION', 'No active room session')
        }

        // Validate gesture data
        if (!data || !data.type || !data.coordinates || data.intensity === undefined) {
          clearTimeout(timeoutId)
          return ValidationHandler.sendError(callback, 'INVALID_GESTURE_DATA', 'Invalid gesture data')
        }

        // Record gesture for collective metrics analysis (non-blocking)
        try {
          socket.services.roomManager.recordGesture(socket.roomId, {
            ...data,
            userId: socket.userId,
            timestamp: Date.now()
          })
        } catch (error) {
          // // console.warn('⚠️ Failed to record gesture for metrics:', error.message)
        }

        // Check if gesture includes streamedNotes from frontend
        let musicalResult = null
        let gestureData = {
          userId: socket.userId,
          roomId: socket.roomId,
          gesture: data
        }

        // CRITICAL FIX: Skip GestureToMusicService if hold system was active
        // This prevents duplicate note generation (strum effect) when hold:start/hold:end is used
        if (data.holdWasActive) {
          // // console.log(`⏭️ [gesture handler] Skipping GestureToMusicService - hold system was active (already handled via hold:start/hold:end)`)
          musicalResult = null
        } else if (data.streamedNotes && Array.isArray(data.streamedNotes) && data.streamedNotes.length > 0) {
          // // console.log('🔍 Processing streamedNotes from frontend:', data.streamedNotes.length, 'notes')

          const startTime = Date.now()
          musicalResult = data.streamedNotes.map((note, index) => {
            const relativeDelay = note.timestamp - data.streamedNotes[0].timestamp

            return {
              id: `streamed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${index}`,
              eventType: 'note',
              userId: socket.userId,
              timestamp: startTime + relativeDelay,
              position: note.position,
              properties: {
                frequency: note.frequency,
                duration: note.duration,
                velocity: note.velocity * 100 || 80,
                articulation: note.articulation || 'staccato',
                gestureAction: data.action,
                gestureType: data.type,
                noteIndex: index,
                totalNotes: data.streamedNotes.length,
                isStreamed: true
              }
            }
          })
        } else {
          try {
            musicalResult = socket.services.gestureToMusicService.processGesture(gestureData)
          } catch (error) {
            // // console.error('GestureToMusicService failed:', error)
            musicalResult = null
          }
        }

        // Add material to BackgroundCompositionService
        if (musicalResult && socket.services.backgroundCompositionService) {
          try {
            const toneDurationToMs = (toneDuration) => {
              if (typeof toneDuration === 'number') return toneDuration
              const durationMap = {
                '32n': 62.5, '16n': 125, '8n': 250, '4n': 500, '2n': 1000, '1n': 2000
              }
              return durationMap[toneDuration] || 250
            }

            const musicalPhrase = Array.isArray(musicalResult)
              ? {
                notes: musicalResult.map(event => ({
                  pitch: event.properties.frequency,
                  duration: toneDurationToMs(event.properties.duration),
                  velocity: event.properties.velocity / 100,
                  articulation: event.properties.articulation,
                  timestamp: event.timestamp
                })),
                duration: musicalResult.reduce((sum, event) => sum + toneDurationToMs(event.properties.duration), 0)
              }
              : musicalResult

            socket.services.backgroundCompositionService.addMaterial(
              socket.roomId,
              gestureData,
              musicalPhrase
            )
          } catch (error) {
            // // console.error('❌ addMaterial ERROR:', error)
          }
        }

        // Constitutional requirement: <200ms processing
        const processingLatency = Date.now() - startTime
        if (processingLatency > 200) {
          // // console.warn(`Gesture processing exceeded 200ms: ${processingLatency}ms`)
        }

        // Store gesture in room memory using old system for compatibility
        let gesture = null
        let memoryResult = null
        let memoryUpdate = null

        const hasStreamedNotes = data.streamedNotes && Array.isArray(data.streamedNotes) && data.streamedNotes.length > 0

        if (data.action !== 'hover' && !hasStreamedNotes) {
          gesture = socket.services.gestureProcessor.processGesture(
            socket.userId,
            socket.roomId,
            data
          )
          memoryResult = socket.services.roomManager.processGesture(socket.userId, gesture)

          const room = socket.services.roomManager.getRoom(socket.roomId)
          memoryUpdate = socket.services.environmentalMemoryCoordinator.processGestureMemory(
            gesture,
            { activeUsers: room.getUserCount() }
          )
        } else if (hasStreamedNotes) {
          gesture = {
            toProcessedResponse: () => ({
              id: data.id,
              action: data.action,
              coordinates: data.coordinates,
              timestamp: Date.now()
            })
          }
          memoryUpdate = { success: false, patternsEvolved: 0, newPatterns: 0 }
        } else {
          memoryUpdate = { success: false, patternsEvolved: 0, newPatterns: 0 }
        }

        // Generate sonic update if patterns evolved
        let sonicUpdate = null
        if (memoryUpdate.success && (memoryUpdate.patternsEvolved > 0 || memoryUpdate.newPatterns > 0)) {
          sonicUpdate = socket.services.environmentalMemoryCoordinator.generateSonicUpdate(socket.roomId)
        }

        const totalLatency = Date.now() - startTime

        let gestureResponse
        if (data.action === 'hover') {
          gestureResponse = {
            id: `hover_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            action: 'hover',
            coordinates: data.coordinates,
            intensity: data.intensity,
            timestamp: Date.now()
          }
        } else {
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

        clearTimeout(timeoutId)
        ValidationHandler.sendResponse(callback, response)

        // Broadcast musical events to all users in room
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

          if (eventType === 'filter_modulation') {
            const io = socket.server || socket.nsp.server
            if (io) {
              io.to(socket.roomId).emit('musical:event', musicalEventBroadcast)
            } else {
              socket.adapter.to(socket.roomId).emit('musical:event', musicalEventBroadcast)
            }
          } else {
            socket.to(socket.roomId).emit('musical:event', musicalEventBroadcast)
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

        socket.services.roomManager.updateUserActivity(socket.userId)

        if (totalLatency > 100) {
          // // console.warn(`Gesture total latency ${totalLatency}ms exceeds 100ms constitutional requirement`)
        }
      } catch (error) {
        // // console.error('Gesture processing error:', error)
        clearTimeout(timeoutId)
        return ValidationHandler.sendError(callback, 'GESTURE_PROCESSING_FAILED', 'Gesture processing failed')
      }
    })
  },

  /**
   * Register gesture:record event handler
   * @param {Socket} socket - Socket instance
   */
  registerGestureRecordHandler (socket) {
    socket.on('gesture:record', async (data, callback) => {
      const startTime = Date.now()

      try {
        if (!data || !data.gesture || !socket.roomId || !socket.userId) {
          ValidationHandler.sendError(callback, 'validation_error', 'Missing required fields: gesture, roomId, userId')
          return
        }

        const gestureValidation = ValidationHandler.validateGestureData(data.gesture)
        if (!gestureValidation.isValid) {
          ValidationHandler.sendError(callback, 'validation_error', gestureValidation.error)
          return
        }

        const gestureData = {
          userId: socket.userId,
          roomId: socket.roomId,
          gesture: data.gesture
        }

        const musicalResult = socket.services.gestureToMusicService.processGesture(gestureData)

        if (musicalResult && socket.services.backgroundCompositionService) {
          try {
            socket.services.backgroundCompositionService.addMaterial(
              socket.roomId,
              gestureData,
              musicalResult
            )
          } catch (error) {
            // // console.error('❌ addMaterial ERROR:', error)
          }
        }

        socket.services.roomManager.addGestureToRoom(socket.roomId, {
          ...data.gesture,
          userId: socket.userId,
          timestamp: Date.now()
        })

        const musicalEvents = Array.isArray(musicalResult) ? musicalResult : [musicalResult]

        musicalEvents.forEach(musicalEvent => {
          const musicalEventBroadcast = {
            id: musicalEvent.id,
            userId: socket.userId,
            roomId: socket.roomId,
            event: musicalEvent.toJSON ? musicalEvent.toJSON() : musicalEvent,
            timestamp: Date.now()
          }

          socket.to(socket.roomId).emit('musical:event', musicalEventBroadcast)

          this.storeGestureForMultiUserSync(socket, socket.roomId, socket.userId, data.gesture, musicalEventBroadcast)
        })

        socket.to(socket.roomId).emit('gesture-broadcast', {
          type: 'gesture',
          userId: socket.userId,
          coordinates: data.gesture.coordinates || [0, 0],
          intensity: data.gesture.intensity || 0.5,
          direction: data.gesture.direction || 'unknown',
          timestamp: Date.now()
        })

        // Update room activity (room.updateActivity exists and handles lastActivity)
        const room = socket.services.roomManager.getRoom(socket.roomId)
        if (room) {
          room.updateActivity()
        }

        ValidationHandler.sendResponse(callback, {
          success: true,
          gestureId: data.gesture.id,
          musicalEvent: musicalResult.toJSON ? musicalResult.toJSON() : musicalResult,
          processingTime: Date.now() - startTime,
          timestamp: Date.now()
        })
      } catch (error) {
        // // console.error('Gesture record error:', error)
        ValidationHandler.sendError(callback, 'processing_error', error.message)
      }
    })
  },

  /**
   * Store gesture for multi-user synchronization
   */
  storeGestureForMultiUserSync (socket, roomId, userId, gesture, musicalEvent) {
    if (!socket.services.roomManager.rooms.has(roomId)) {
      // // console.warn(`Room ${roomId} not found for multi-user sync`)
      return
    }

    const room = socket.services.roomManager.rooms.get(roomId)

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
      processed: true
    }

    room.gestureSyncBuffer.push(syncData)

    if (room.gestureSyncBuffer.length > 100) {
      room.gestureSyncBuffer = room.gestureSyncBuffer.slice(-100)
    }

    room.lastActivity = Date.now()
    room.totalGestures = (room.totalGestures || 0) + 1
  },

  /**
   * Register gesture-complete event handler
   * Handles completed gestures with streamedNotes from frontend
   * @param {Socket} socket - Socket instance
   */
  registerGestureCompleteHandler (socket) {
    socket.on('gesture-complete', async (data) => {
      const startTime = Date.now()

      try {
        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          // // console.warn('⚠️ gesture-complete: No active room session')
          return
        }

        // Extract gesture from wrapper
        const gesture = data.gesture
        if (!gesture) {
          // // console.warn('⚠️ gesture-complete: Missing gesture data')
          return
        }

        // // console.log(`🎯 gesture-complete received from ${socket.userId?.substring(0, 8)}:`, {
        //   hasStreamedNotes: !!(gesture.streamedNotes?.length),
        //   noteCount: gesture.streamedNotes?.length || 0,
        //   streamingWasActive: gesture.streamingWasActive,
        //   holdWasActive: gesture.holdWasActive
        // })

        // CRITICAL: If streamedNotes present, broadcast exact notes for remote replication
        if (gesture.streamedNotes && Array.isArray(gesture.streamedNotes) && gesture.streamedNotes.length > 0) {
          const firstNoteTime = gesture.streamedNotes[0].timestamp
          const broadcastTime = Date.now()

          // Broadcast each note as a musical:event with proper timing
          gesture.streamedNotes.forEach((note, index) => {
            // Calculate relative delay from first note (in milliseconds)
            const relativeDelay = note.timestamp - firstNoteTime

            const musicalEventBroadcast = {
              id: `streamed_${broadcastTime}_${index}`,
              userId: socket.userId,
              roomId: socket.roomId,
              event: {
                eventType: 'note',
                timestamp: broadcastTime + relativeDelay,
                relativeDelay: relativeDelay, // FIX: Include explicit delay for frontend
                position: note.position,
                properties: {
                  frequency: note.frequency,
                  duration: note.duration,
                  velocity: (note.velocity || 0.5) * 100,
                  articulation: note.articulation || 'staccato',
                  noteIndex: index,
                  totalNotes: gesture.streamedNotes.length,
                  isStreamed: true,
                  gestureAction: 'drag'
                }
              },
              timestamp: broadcastTime + relativeDelay
            }

            // Broadcast to other users in the room
            socket.to(socket.roomId).emit('musical:event', musicalEventBroadcast)
          })

          // // console.log(`✅ Broadcasted ${gesture.streamedNotes.length} streamed notes to room ${socket.roomId}`)
        } else if (gesture.holdWasActive) {
          // CRITICAL: hold:start/hold:end system was used for this gesture
          // Do NOT generate additional notes via gestureToMusicService to avoid duplicate playback (strum effect)
          // // console.log(`⏭️ Skipping gestureToMusicService - hold system was active (already handled via hold:start/hold:end)`)
        } else if (gesture.localPhraseGenerated) {
          // CRITICAL: Frontend already generated and played the phrase locally
          // Do NOT generate additional notes via gestureToMusicService to avoid double playback
          // // console.log(`⏭️ Skipping gestureToMusicService - frontend already generated phrase locally`)
        } else {
          // No streamedNotes - use legacy behavior (let gestureToMusicService generate notes)
          // This handles taps and other non-streaming gestures
          const gestureData = {
            userId: socket.userId,
            roomId: socket.roomId,
            gesture: {
              action: gesture.action || 'tap', // CRITICAL: Include action so GestureToMusicService knows tap vs drag
              type: gesture.type || 'tap',
              coordinates: gesture.coordinates || gesture.position,
              position: gesture.position || gesture.coordinates,
              intensity: gesture.intensity || 0.5,
              speed: gesture.speed || 0.5,
              direction: gesture.direction || 'unknown',
              duration: gesture.duration || 0
            }
          }

          try {
            const musicalResult = socket.services.gestureToMusicService.processGesture(gestureData)

            if (musicalResult) {
              const musicalEvents = Array.isArray(musicalResult) ? musicalResult : [musicalResult]

              musicalEvents.forEach(musicalEvent => {
                const musicalEventBroadcast = {
                  id: musicalEvent.id,
                  userId: socket.userId,
                  roomId: socket.roomId,
                  event: musicalEvent.toJSON ? musicalEvent.toJSON() : musicalEvent,
                  timestamp: Date.now()
                }

                socket.to(socket.roomId).emit('musical:event', musicalEventBroadcast)
              })
            }
          } catch (error) {
            // // console.error('❌ gestureToMusicService failed:', error)
          }
        }

        // Update room activity (room.updateActivity exists and handles lastActivity)
        const roomForUpdate = socket.services.roomManager.getRoom(socket.roomId)
        if (roomForUpdate) {
          roomForUpdate.updateActivity()
        }

        const processingTime = Date.now() - startTime
        if (processingTime > 100) {
          // // console.warn(`⚠️ gesture-complete processing time ${processingTime}ms exceeds 100ms target`)
        }
      } catch (error) {
        // // console.error('❌ gesture-complete error:', error)
      }
    })
  }
}

module.exports = GestureHandler
