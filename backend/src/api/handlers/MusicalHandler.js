/**
 * MusicalHandler - Musical event handlers
 * Handles: hold:start, hold:end, musical:event, composition:update, clock:sync
 * Entry #Security: Uses centralized rate limiter (tracks by userId/IP, not per-socket)
 */

const ValidationHandler = require('./ValidationHandler')
const { LATENCY } = require('../../constants/MusicConstants')
const RateLimiter = require('../../utils/RateLimiter')

// Entry #HarmonicCoherence: Frequency <-> MIDI pitch conversion for scale constraining
function frequencyToMidiPitch (frequency) {
  return Math.round(12 * Math.log2(frequency / 440) + 69)
}

function midiPitchToFrequency (pitch) {
  return 440 * Math.pow(2, (pitch - 69) / 12)
}

/**
 * Constrain frequency to current scale using HarmonicEngine
 * Entry #HarmonicCoherence: Ensures all user frequencies are quantized to the current harmonic context
 * @param {number} frequency - Input frequency in Hz
 * @param {Object} harmonicEngine - BackgroundCompositionService's harmonicEngine
 * @returns {number} Constrained frequency in Hz
 */
function constrainFrequencyToScale (frequency, harmonicEngine) {
  // Validate input: must be finite and within human hearing range (20-20000 Hz)
  if (!harmonicEngine || !frequency || !isFinite(frequency) ||
      frequency < 20 || frequency > 20000) {
    return frequency
  }

  // Capture harmonic context atomically to avoid race conditions
  const currentKey = harmonicEngine.currentKey
  const currentMode = harmonicEngine.currentMode

  const pitch = frequencyToMidiPitch(frequency)
  const constrainedPitch = harmonicEngine.constrainToScale(pitch, currentKey, currentMode)

  // Validate constrainedPitch before converting back
  if (!isFinite(constrainedPitch) || constrainedPitch < 0 || constrainedPitch > 127) {
    return frequency // Fall back to original if constraining fails
  }

  const constrainedFrequency = midiPitchToFrequency(constrainedPitch)

  // Validate output is in audible range
  if (!isFinite(constrainedFrequency) || constrainedFrequency < 20 || constrainedFrequency > 20000) {
    return frequency
  }

  return constrainedFrequency
}

const MusicalHandler = {
  /**
   * Register hold:start event handler
   * Entry #Security: Uses centralized rate limiter (tracks by userId/IP, not per-socket)
   * @param {Socket} socket - Socket instance
   */
  registerHoldStartHandler (socket) {
    socket.on('hold:start', async (data, callback) => {
      const startTime = Date.now()

      // Listener guard
      const guardRoom = socket.services.roomManager.getRoom(socket.roomId)
      if (guardRoom?.isListener(socket.userId)) {
        return ValidationHandler.sendError(callback, 'PERMISSION_DENIED', 'Listeners cannot create gestures')
      }

      try {
        // Centralized rate limiting
        const limitResult = RateLimiter.checkLimit('hold:start', socket)
        if (!limitResult.allowed) {
          return ValidationHandler.sendError(callback, 'RATE_LIMITED', 'Too many requests')
        }

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

        // Entry #175b: Get current style for genre-aware audio
        const style = socket.services.backgroundCompositionService?.getCurrentStyleForRoom(socket.roomId)

        // Entry #HarmonicCoherence: Constrain frequency to current scale before broadcasting
        const harmonicEngine = socket.services.backgroundCompositionService?.harmonicEngine
        const constrainedFrequency = constrainFrequencyToScale(data.frequency, harmonicEngine)

        room.activeHolds.set(data.noteId, {
          userId: socket.userId,
          startTime: Date.now(),
          noteId: data.noteId,
          frequency: constrainedFrequency,
          position: data.position
        })

        const broadcastData = {
          type: 'hold:start',
          userId: socket.userId,
          noteId: data.noteId,
          frequency: constrainedFrequency,
          velocity: data.velocity,
          position: data.position,
          userColor: userColor,
          isRemote: true,
          timestamp: Date.now(),
          style: style  // Entry #175b: Include style for genre-aware playback
        }

        // // console.log(`📡 BROADCASTING hold:start to room ${socket.roomId}:`, {
        //   noteId: broadcastData.noteId,
        //   userId: broadcastData.userId?.substring(0, 8),
        //   frequency: broadcastData.frequency?.toFixed(1) + 'Hz',
        //   velocity: broadcastData.velocity?.toFixed(2),
        //   isRemote: broadcastData.isRemote,
        //   recipientCount: socket.adapter.rooms.get(socket.roomId)?.size - 1 || 0
        // })

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
   * Entry #Security: Uses centralized rate limiter (tracks by userId/IP, not per-socket)
   * @param {Socket} socket - Socket instance
   */
  registerHoldEndHandler (socket) {
    socket.on('hold:end', async (data, callback) => {
      const startTime = Date.now()

      // Listener guard
      const guardRoom = socket.services.roomManager.getRoom(socket.roomId)
      if (guardRoom?.isListener(socket.userId)) {
        return ValidationHandler.sendError(callback, 'PERMISSION_DENIED', 'Listeners cannot create gestures')
      }

      try {
        // Centralized rate limiting
        const limitResult = RateLimiter.checkLimit('hold:end', socket)
        if (!limitResult.allowed) {
          return ValidationHandler.sendError(callback, 'RATE_LIMITED', 'Too many requests')
        }

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

        // Entry #175b: Get current style for genre-aware audio
        const style = socket.services.backgroundCompositionService?.getCurrentStyleForRoom(socket.roomId)

        socket.to(socket.roomId).emit('hold:end', {
          type: 'hold:end',
          userId: socket.userId,
          noteId: data.noteId,
          duration: data.duration,
          timestamp: Date.now(),
          style: style  // Entry #175b: Include style for genre-aware playback
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
   * Register note:stream event handler for real-time drag note streaming
   * Receives notes as they're played during drag gestures and broadcasts to other users
   * Entry #Security: Uses centralized rate limiter (tracks by userId/IP, not per-socket)
   * @param {Socket} socket - Socket instance with userId and roomId
   * @fires note:stream - Broadcasts note to other users in room
   */
  registerNoteStreamHandler (socket) {
    socket.on('note:stream', async (data, callback) => {
      // Listener guard
      const guardRoom = socket.services.roomManager.getRoom(socket.roomId)
      if (guardRoom?.isListener(socket.userId)) {
        return ValidationHandler.sendError(callback, 'PERMISSION_DENIED', 'Listeners cannot create gestures')
      }

      try {
        // Validate session
        if (!socket.userId || !socket.roomId) {
          if (typeof callback === 'function') {
            ValidationHandler.sendError(callback, 'NO_ACTIVE_SESSION', 'No active room session')
          }
          return
        }

        // Centralized rate limiting (tracks by userId/IP, not per-socket)
        const limitResult = RateLimiter.checkLimit('note:stream', socket)
        if (!limitResult.allowed) {
          // Silent drop - don't error, just skip this note
          return
        }

        // Validate required fields
        if (!data || data.frequency === undefined || !data.position) {
          if (typeof callback === 'function') {
            ValidationHandler.sendError(callback, 'INVALID_NOTE_DATA', 'Missing required note data')
          }
          return
        }

        // Validate frequency (20Hz - 20kHz human hearing range)
        if (typeof data.frequency !== 'number' || isNaN(data.frequency) ||
            data.frequency < 20 || data.frequency > 20000) {
          if (typeof callback === 'function') {
            ValidationHandler.sendError(callback, 'INVALID_FREQUENCY', 'Frequency must be 20-20000 Hz')
          }
          return
        }

        // Validate position (0-1 normalized coordinates)
        if (!data.position || typeof data.position.x !== 'number' || typeof data.position.y !== 'number' ||
            data.position.x < 0 || data.position.x > 1 || data.position.y < 0 || data.position.y > 1) {
          if (typeof callback === 'function') {
            ValidationHandler.sendError(callback, 'INVALID_POSITION', 'Position must be {x: 0-1, y: 0-1}')
          }
          return
        }

        // Validate velocity if present (0-1 range)
        const velocity = data.velocity !== undefined
          ? (typeof data.velocity === 'number' && !isNaN(data.velocity)
            ? Math.max(0, Math.min(1, data.velocity)) * 100
            : 80)
          : 80

        const room = socket.services.roomManager.getRoom(socket.roomId)
        if (!room) {
          if (typeof callback === 'function') {
            ValidationHandler.sendError(callback, 'ROOM_NOT_FOUND', 'Room not found')
          }
          return
        }

        // Get user color for visual sync
        const user = room.getUser(socket.userId)
        const userColor = user?.assignedColor || '#6bcf7f'

        // Entry #175b: Get current style for genre-aware audio
        const style = socket.services.backgroundCompositionService?.getCurrentStyleForRoom(socket.roomId)

        // Entry #HarmonicCoherence: Constrain frequency to current scale before broadcasting
        const harmonicEngine = socket.services.backgroundCompositionService?.harmonicEngine
        const constrainedFrequency = constrainFrequencyToScale(data.frequency, harmonicEngine)

        // Build broadcast payload matching musical:event format
        const noteStreamBroadcast = {
          type: 'note:stream',
          userId: socket.userId,
          event: {
            eventType: 'note',
            timestamp: Date.now(),
            position: data.position,
            properties: {
              frequency: constrainedFrequency,
              duration: data.duration,
              velocity: velocity, // Use validated velocity
              articulation: data.articulation || 'staccato',
              noteIndex: data.noteIndex || 0,
              isStreamed: true,
              gestureAction: 'drag-streaming'
            }
          },
          userColor: userColor,
          isRemote: true,
          timestamp: Date.now(),
          style: style  // Entry #175b: Include style for genre-aware playback
        }

        // Broadcast to other users in room (not sender)
        socket.to(socket.roomId).emit('note:stream', noteStreamBroadcast)

        // Update room activity
        if (room.updateActivity) {
          room.updateActivity()
        }

        // Fire-and-forget acknowledgment
        if (typeof callback === 'function') {
          callback({ success: true, timestamp: Date.now() })
        }
      } catch (error) {
        if (typeof callback === 'function') {
          ValidationHandler.sendError(callback, 'NOTE_STREAM_FAILED', error.message)
        }
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

        // Entry #175b: Get current style for genre-aware audio
        const style = socket.services.backgroundCompositionService?.getCurrentStyleForRoom(socket.roomId)

        // CRITICAL FIX: Wrap in same format as GestureHandler broadcasts
        // Frontend expects { userId, event, timestamp } wrapper
        const musicalEventBroadcast = {
          userId: socket.userId,
          event: enhancedEvent,
          timestamp: data.timestamp || Date.now(),
          style: style  // Entry #175b: Include style for genre-aware playback
        }

        socket.to(socket.roomId).emit('musical:event', musicalEventBroadcast)

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
  }
}

module.exports = MusicalHandler
