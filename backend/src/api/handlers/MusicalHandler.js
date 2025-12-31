/**
 * MusicalHandler - Musical event handlers
 * Handles: hold:start, hold:end, musical:event, composition:update, clock:sync, hover-update
 */

const ValidationHandler = require('./ValidationHandler')
const { LATENCY } = require('../../constants/MusicConstants')

const MusicalHandler = {
  /**
   * Register hold:start event handler
   * @param {Socket} socket - Socket instance
   */
  registerHoldStartHandler (socket) {
    socket.on('hold:start', async (data, callback) => {
      const startTime = Date.now()

      try {
        if (!socket.userId || !socket.roomId) {
          return ValidationHandler.sendError(callback, 'NO_ACTIVE_SESSION', 'No active room session')
        }

        if (!data || !data.noteId || !data.frequency || !data.position) {
          return ValidationHandler.sendError(callback, 'INVALID_HOLD_DATA', 'Missing required hold data')
        }

        const room = socket.services.roomManager.getRoom(socket.roomId)
        if (!room) {
          return ValidationHandler.sendError(callback, 'ROOM_NOT_FOUND', 'Room not found')
        }

        const user = room.getUser(socket.userId)
        const userColor = user?.assignedColor || '#6bcf7f'

        room.activeHolds.set(data.noteId, {
          userId: socket.userId,
          startTime: Date.now(),
          noteId: data.noteId,
          frequency: data.frequency,
          position: data.position
        })

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

        // // console.log(`📡 BROADCASTING hold:start to room ${socket.roomId}:`, {
          noteId: broadcastData.noteId,
          userId: broadcastData.userId?.substring(0, 8),
          frequency: broadcastData.frequency?.toFixed(1) + 'Hz',
          velocity: broadcastData.velocity?.toFixed(2),
          isRemote: broadcastData.isRemote,
          recipientCount: socket.adapter.rooms.get(socket.roomId)?.size - 1 || 0
        })

        socket.to(socket.roomId).emit('hold:start', broadcastData)

        const latency = Date.now() - startTime
        ValidationHandler.sendResponse(callback, {
          success: true,
          noteId: data.noteId,
          latency,
          timestamp: Date.now()
        })

        // // console.log(`🎵 Hold started: ${data.noteId} by ${socket.userId} (${latency}ms)`)

        if (latency > LATENCY.WEBSOCKET_MAX) {
          // // console.warn(`⚠️ Hold start latency ${latency}ms exceeds ${LATENCY.WEBSOCKET_MAX}ms requirement`)
        }
      } catch (error) {
        // // console.error('❌ Hold start error:', error)
        return ValidationHandler.sendError(callback, 'HOLD_START_FAILED', error.message)
      }
    })
  },

  /**
   * Register hold:end event handler
   * @param {Socket} socket - Socket instance
   */
  registerHoldEndHandler (socket) {
    socket.on('hold:end', async (data, callback) => {
      const startTime = Date.now()

      try {
        if (!socket.userId || !socket.roomId) {
          return ValidationHandler.sendError(callback, 'NO_ACTIVE_SESSION', 'No active room session')
        }

        if (!data || !data.noteId) {
          return ValidationHandler.sendError(callback, 'INVALID_HOLD_DATA', 'Missing note ID')
        }

        const room = socket.services.roomManager.getRoom(socket.roomId)
        if (room?.activeHolds) {
          room.activeHolds.delete(data.noteId)
        }

        socket.to(socket.roomId).emit('hold:end', {
          type: 'hold:end',
          userId: socket.userId,
          noteId: data.noteId,
          duration: data.duration,
          timestamp: Date.now()
        })

        const latency = Date.now() - startTime
        ValidationHandler.sendResponse(callback, {
          success: true,
          noteId: data.noteId,
          duration: data.duration,
          latency,
          timestamp: Date.now()
        })

        // // console.log(`🎵 Hold ended: ${data.noteId} (${data.duration}ms, ${latency}ms latency)`)

        if (latency > LATENCY.WEBSOCKET_MAX) {
          // // console.warn(`⚠️ Hold end latency ${latency}ms exceeds ${LATENCY.WEBSOCKET_MAX}ms requirement`)
        }
      } catch (error) {
        // // console.error('❌ Hold end error:', error)
        return ValidationHandler.sendError(callback, 'HOLD_END_FAILED', error.message)
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
        if (!data || !data.event || !socket.roomId || !socket.userId) {
          ValidationHandler.sendError(callback, 'validation_error', 'Missing required fields: event, roomId, userId')
          return
        }

        const eventValidation = ValidationHandler.validateMusicalEventData(data.event)
        if (!eventValidation.isValid) {
          ValidationHandler.sendError(callback, 'validation_error', eventValidation.error)
          return
        }

        const enhancedEvent = {
          ...data.event,
          spatialAudio: ValidationHandler.calculateSpatialAudio(socket.userId, data.event),
          roomTimestamp: Date.now(),
          processingLatency: Date.now() - startTime
        }

        socket.to(socket.roomId).emit('musical:event', enhancedEvent)

        if (socket.services.patternRecognitionService) {
          socket.services.patternRecognitionService.processEvent(socket.roomId, enhancedEvent)
        }

        if (socket.services.compositionEngine) {
          socket.services.compositionEngine.processMusicalEvent(socket.roomId, enhancedEvent)
        }

        ValidationHandler.sendResponse(callback, {
          success: true,
          eventId: enhancedEvent.id,
          broadcastTime: Date.now() - startTime,
          timestamp: Date.now()
        })
      } catch (error) {
        // // console.error('Musical event error:', error)
        ValidationHandler.sendError(callback, 'processing_error', error.message)
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
        if (!data || !socket.roomId) {
          ValidationHandler.sendError(callback, 'validation_error', 'Missing required fields: roomId')
          return
        }

        const composition = socket.services.compositionEngine.getComposition(socket.roomId)

        const compositionUpdate = {
          roomId: socket.roomId,
          composition: composition.toJSON(),
          evolutionContext: data.evolutionContext || 'automatic',
          triggeredBy: socket.userId,
          timestamp: Date.now(),
          processingLatency: Date.now() - startTime
        }

        socket.to(socket.roomId).emit('composition:update', compositionUpdate)

        if (data.patternIntegration && socket.services.patternRecognitionService) {
          socket.services.patternRecognitionService.updateIntegrationLevel(
            socket.roomId,
            data.patternIntegration.patternSignature,
            data.patternIntegration.level
          )
        }

        ValidationHandler.sendResponse(callback, {
          success: true,
          composition: compositionUpdate.composition,
          broadcastTime: Date.now() - startTime,
          timestamp: Date.now()
        })
      } catch (error) {
        // // console.error('Composition update error:', error)
        ValidationHandler.sendError(callback, 'processing_error', error.message)
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
        if (!data || !socket.roomId) {
          ValidationHandler.sendError(callback, 'validation_error', 'Missing required fields: roomId')
          return
        }

        const clock = socket.services.musicalClockService.getOrCreateClock(socket.roomId)

        const clockValidation = ValidationHandler.validateClockData(data)
        if (!clockValidation.isValid) {
          ValidationHandler.sendError(callback, 'validation_error', clockValidation.error)
          return
        }

        if (data.tempo || data.timeSignature || data.state !== undefined) {
          socket.services.musicalClockService.updateClock(socket.roomId, {
            tempo: data.tempo,
            timeSignature: data.timeSignature,
            state: data.state
          })
        }

        const clientOffset = ValidationHandler.calculateTimingOffset(socket, data)

        const syncClock = socket.services.musicalClockService.getSynchronizedClock(socket.roomId, clientOffset)

        const clockSync = {
          roomId: socket.roomId,
          clock: syncClock,
          timingOffset: clientOffset,
          networkLatency: Date.now() - startTime,
          syncSource: 'server',
          timestamp: Date.now()
        }

        socket.to(socket.roomId).emit('clock:sync', clockSync)

        socket.services.musicalClockService.recordSyncEvent(socket.roomId, {
          userId: socket.userId,
          clientOffset,
          networkLatency: Date.now() - startTime,
          timestamp: Date.now()
        })

        ValidationHandler.sendResponse(callback, {
          success: true,
          clock: syncClock,
          timingOffset: clientOffset,
          syncTime: Date.now() - startTime,
          timestamp: Date.now()
        })
      } catch (error) {
        // // console.error('Clock sync error:', error)
        ValidationHandler.sendError(callback, 'processing_error', error.message)
      }
    })
  },

  /**
   * Register hover-update event handler
   * @param {Socket} socket - Socket instance
   */
  registerHoverUpdateHandler (socket) {
    socket.on('hover-update', async (data) => {
      const startTime = Date.now()
      try {
        if (!data || !socket.roomId || !socket.userId) {
          // // console.warn('⚠️ hover-update validation failed - missing required fields')
          return
        }

        const room = socket.services.roomManager.getRoom(socket.roomId)
        if (!room) {
          // // console.warn('⚠️ hover-update failed - room not found:', socket.roomId)
          return
        }

        const hoverData = {
          position: data.position || { x: 0.5, y: 0.5 },
          velocity: data.velocity || 50,
          intensity: data.intensity || 0.5,
          userId: data.userId || socket.userId,
          isRemote: data.isRemote || false,
          timestamp: data.timestamp || Date.now()
        }

        this.sendToHoverOrchestrator(socket, hoverData)

        room.lastActivity = Date.now()

        const processingTime = Date.now() - startTime
        if (processingTime > 50) {
          // // console.warn(`⚠️ Hover processing time ${processingTime}ms exceeds 50ms target`)
        }
      } catch (error) {
        // // console.error('❌ hover-update error:', error)
      }
    })
  },

  /**
   * Send hover data to HoverOrchestrator for centralized processing
   * @param {Socket} socket - Socket instance
   * @param {Object} hoverData - Hover event data
   */
  sendToHoverOrchestrator (socket, hoverData) {
    try {
      let hoverOrchestrator = socket.services.roomManager.getHoverOrchestrator(socket.roomId)

      if (!hoverOrchestrator) {
        const HoverOrchestrator = require('../../services/HoverOrchestrator')
        const io = socket.server || socket.nsp.server
        hoverOrchestrator = new HoverOrchestrator(socket.roomId, io)

        socket.services.roomManager.setHoverOrchestrator(socket.roomId, hoverOrchestrator)
        hoverOrchestrator.start()
      }

      hoverOrchestrator.addHoverEvent(hoverData)
    } catch (error) {
      // // console.error('❌ Failed to send hover to orchestrator:', error)

      const io = socket.server || socket.nsp.server
      if (io) {
        io.to(socket.roomId).emit('hover-update', hoverData)
        // // console.log(`🔄 Fallback: Broadcasted raw hover due to orchestrator error`)
      }
    }
  }
}

module.exports = MusicalHandler
