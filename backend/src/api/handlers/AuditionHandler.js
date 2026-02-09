/**
 * AuditionHandler
 *
 * Socket event handlers for the Audition feature.
 * Handles:
 * - audition:start - Start generating gestures
 * - audition:stop - Stop generating gestures
 * - audition:config - Update generation parameters
 *
 * Uses static methods pattern consistent with other handlers.
 * Issue #3 fix: All parameters are validated before processing.
 */

/**
 * Validate audition parameters
 * Issue #3 fix: Security - validate all numeric parameters are within bounds
 * @param {Object} params - Parameters to validate
 * @returns {Object} Validated and sanitized parameters
 */
function validateAuditionParams (params) {
  if (!params || typeof params !== 'object') {
    return {}
  }

  const validated = {}

  // Validate source (enum: 'random' or 'metrics')
  if (params.source === 'random' || params.source === 'metrics') {
    validated.source = params.source
  }

  // Validate numeric parameters (all must be 0-1 range)
  const numericParams = ['frequency', 'regularity', 'uniformity', 'gestureType', 'range']
  for (const param of numericParams) {
    if (typeof params[param] === 'number' && !isNaN(params[param])) {
      // Clamp to 0-1 range
      validated[param] = Math.max(0, Math.min(1, params[param]))
    }
  }

  return validated
}

const AuditionHandler = {
  /**
   * Register audition:start handler
   * Start generating gestures with specified parameters
   * @param {Object} socket - Socket.io socket instance
   */
  registerAuditionStartHandler (socket) {
    socket.on('audition:start', (params) => {
      try {
        const roomId = socket.roomId
        const auditionService = socket.services?.auditionGestureService
        const roomManager = socket.services?.roomManager

        if (!roomId) {
          console.warn(`[AuditionHandler] No roomId for socket ${socket.id}`)
          return
        }

        if (!auditionService) {
          console.warn(`[AuditionHandler] AuditionGestureService not available`)
          return
        }

        // Critical: Validate room existence and user membership
        const room = roomManager?.getRoom(roomId)
        if (!room) {
          console.warn(`[AuditionHandler] Room ${roomId} not found for socket ${socket.id}`)
          return
        }

        const user = room.getUser(socket.userId)
        if (!user) {
          console.warn(`[AuditionHandler] User ${socket.userId} not member of room ${roomId}`)
          return
        }

        // Issue #3 fix: Validate and sanitize parameters
        const validatedParams = validateAuditionParams(params)

        // Get real user identity from room
        const userColor = user.assignedColor || '#6bcf7f'

        // Mutual exclusion: stop sequencer first
        const sequencerService = socket.services?.sequencerGestureService
        if (sequencerService) {
          sequencerService.stopSequencer(socket.id)
          socket.emit('sequencer:stopped')
        }

        console.log(`[AuditionHandler] Start request from ${socket.userId} (socket ${socket.id}) in room ${roomId}`)
        auditionService.startAudition(socket.id, roomId, validatedParams, socket.userId, userColor)
      } catch (error) {
        console.error(`[AuditionHandler] Error starting audition:`, error.message)
      }
    })
  },

  /**
   * Register audition:stop handler
   * Stop generating gestures
   * @param {Object} socket - Socket.io socket instance
   */
  registerAuditionStopHandler (socket) {
    socket.on('audition:stop', () => {
      try {
        const auditionService = socket.services?.auditionGestureService

        if (!auditionService) {
          return
        }

        console.log(`[AuditionHandler] Stop request from ${socket.id}`)
        auditionService.stopAudition(socket.id)
      } catch (error) {
        console.error(`[AuditionHandler] Error stopping audition:`, error.message)
      }
    })
  },

  /**
   * Register audition:config handler
   * Update generation parameters in real-time
   * @param {Object} socket - Socket.io socket instance
   */
  registerAuditionConfigHandler (socket) {
    socket.on('audition:config', (params) => {
      try {
        const auditionService = socket.services?.auditionGestureService

        if (!auditionService) {
          return
        }

        // Issue #3 fix: Validate and sanitize parameters
        const validatedParams = validateAuditionParams(params)

        // Only update if we have valid params
        if (Object.keys(validatedParams).length > 0) {
          auditionService.updateParams(socket.id, validatedParams)
        }
      } catch (error) {
        console.error(`[AuditionHandler] Error updating params:`, error.message)
      }
    })
  },

  /**
   * Register audition:pause handler
   * Pauses gesture generation when user starts a real gesture
   * @param {Object} socket - Socket.io socket instance
   */
  registerAuditionPauseHandler (socket) {
    socket.on('audition:pause', () => {
      try {
        const auditionService = socket.services?.auditionGestureService

        if (!auditionService) {
          return
        }

        auditionService.pauseAudition(socket.id)
      } catch (error) {
        console.error(`[AuditionHandler] Error pausing audition:`, error.message)
      }
    })
  },

  /**
   * Register audition:resume handler
   * Resumes gesture generation when user ends their real gesture
   * @param {Object} socket - Socket.io socket instance
   */
  registerAuditionResumeHandler (socket) {
    socket.on('audition:resume', () => {
      try {
        const auditionService = socket.services?.auditionGestureService

        if (!auditionService) {
          return
        }

        auditionService.resumeAudition(socket.id)
      } catch (error) {
        console.error(`[AuditionHandler] Error resuming audition:`, error.message)
      }
    })
  },

  /**
   * Register disconnect cleanup for audition
   * Stops any active audition when socket disconnects
   * @param {Object} socket - Socket.io socket instance
   */
  registerAuditionDisconnectHandler (socket) {
    socket.on('disconnect', () => {
      try {
        const auditionService = socket.services?.auditionGestureService
        if (auditionService) {
          auditionService.stopAudition(socket.id)
        }
      } catch (error) {
        // Log errors during disconnect cleanup (don't throw to avoid breaking disconnect flow)
        console.warn(`[AuditionHandler] Error during disconnect cleanup for socket ${socket.id}:`, error.message)
      }
    })
  }
}

module.exports = AuditionHandler
