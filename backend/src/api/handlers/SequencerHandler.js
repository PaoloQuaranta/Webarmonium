/**
 * SequencerHandler
 *
 * Socket event handlers for the Sequencer feature.
 * Handles:
 * - sequencer:start - Start step sequencer
 * - sequencer:stop - Stop step sequencer
 * - sequencer:config - Update sequencer parameters
 * - sequencer:pause - Pause during real gestures
 * - sequencer:resume - Resume after real gestures
 *
 * Uses static methods pattern consistent with other handlers.
 * All parameters are validated before processing.
 * Rate limiting on config updates (max 10/sec per socket).
 */

// Per-socket rate limiter for config updates
const configRateLimits = new Map()

/**
 * Validate sequencer parameters
 * @param {Object} params - Parameters to validate
 * @returns {Object} Validated and sanitized parameters
 */
function validateSequencerParams (params) {
  if (!params || typeof params !== 'object') return {}
  const validated = {}

  if (typeof params.stepCount === 'number') {
    const sc = Math.round(params.stepCount)
    if (sc >= 3 && sc <= 16) validated.stepCount = sc
  }

  const validSpeeds = [0.25, 0.5, 1, 2, 4, 8]
  if (validSpeeds.includes(params.speedMultiplier)) {
    validated.speedMultiplier = params.speedMultiplier
  }

  if (Array.isArray(params.steps)) {
    const validStates = ['normal', 'mute', 'random']
    validated.steps = params.steps.slice(0, 16).map(step => {
      if (!step || typeof step !== 'object') return { degree: 1, octave: 3, state: 'normal' }
      const degree = Math.round(Number(step.degree))
      const octave = Math.round(Number(step.octave))
      const state = validStates.includes(step.state) ? step.state : 'normal'
      return {
        degree: (degree >= 1 && degree <= 7) ? degree : 1,
        octave: (octave >= 2 && octave <= 5) ? octave : 3,
        state
      }
    })
  }

  // Drum mode flag
  if (typeof params.isDrumMode === 'boolean') {
    validated.isDrumMode = params.isDrumMode
  }

  // Drum layer params (3 layers: bd, sn, hh)
  if (params.layers && typeof params.layers === 'object') {
    const validDrumStates = ['off', 'ghost', 'normal', 'accent']
    const stepCount = validated.stepCount || params.stepCount || 8
    validated.layers = {}
    for (const inst of ['bd', 'sn', 'hh']) {
      const layer = params.layers[inst]
      if (layer && typeof layer === 'object') {
        validated.layers[inst] = {
          muted: !!layer.muted,
          steps: (Array.isArray(layer.steps) ? layer.steps : [])
            .slice(0, stepCount)
            .map(s => ({
              state: validDrumStates.includes(s?.state) ? s.state : 'off'
            }))
        }
        // Pad to stepCount
        while (validated.layers[inst].steps.length < stepCount) {
          validated.layers[inst].steps.push({ state: 'off' })
        }
      }
    }
  }

  return validated
}

const SequencerHandler = {
  /**
   * Register sequencer:start handler
   * Start step sequencer with specified parameters
   * @param {Object} socket - Socket.io socket instance
   */
  registerSequencerStartHandler (socket) {
    socket.on('sequencer:start', (params) => {
      try {
        const roomId = socket.roomId
        const sequencerService = socket.services?.sequencerGestureService
        const auditionService = socket.services?.auditionGestureService
        const roomManager = socket.services?.roomManager

        if (!roomId) {
          console.warn(`[SequencerHandler] No roomId for socket ${socket.id}`)
          return
        }

        if (!sequencerService) {
          console.warn(`[SequencerHandler] SequencerGestureService not available`)
          return
        }

        // Validate room existence and user membership
        const room = roomManager?.getRoom(roomId)
        if (!room) {
          console.warn(`[SequencerHandler] Room ${roomId} not found for socket ${socket.id}`)
          return
        }

        const user = room.getUser(socket.userId)
        if (!user) {
          console.warn(`[SequencerHandler] User ${socket.userId} not member of room ${roomId}`)
          return
        }

        // Mutual exclusion: stop audition first
        if (auditionService) {
          auditionService.stopAudition(socket.id)
          socket.emit('audition:stopped')
        }

        // Validate and sanitize parameters
        const validatedParams = validateSequencerParams(params)

        // Include preset slot for correct remote drum kit timbre
        if (validatedParams.isDrumMode && user.synthPresetSlot !== undefined) {
          validatedParams.drumPresetSlot = user.synthPresetSlot
        }

        // Get real user identity from room
        const userColor = user.assignedColor || '#6bcf7f'

        console.log(`[SequencerHandler] Start request from ${socket.userId} (socket ${socket.id}) in room ${roomId}`)
        sequencerService.startSequencer(socket.id, roomId, validatedParams, socket.userId, userColor)
      } catch (error) {
        console.error(`[SequencerHandler] Error starting sequencer:`, error.message)
      }
    })
  },

  /**
   * Register sequencer:stop handler
   * Stop step sequencer
   * @param {Object} socket - Socket.io socket instance
   */
  registerSequencerStopHandler (socket) {
    socket.on('sequencer:stop', () => {
      try {
        const sequencerService = socket.services?.sequencerGestureService

        if (!sequencerService) return

        console.log(`[SequencerHandler] Stop request from ${socket.id}`)
        sequencerService.stopSequencer(socket.id)
      } catch (error) {
        console.error(`[SequencerHandler] Error stopping sequencer:`, error.message)
      }
    })
  },

  /**
   * Register sequencer:config handler
   * Update sequencer parameters in real-time (rate-limited)
   * @param {Object} socket - Socket.io socket instance
   */
  registerSequencerConfigHandler (socket) {
    socket.on('sequencer:config', (params) => {
      try {
        // Rate limiting: max 10 updates/sec per socket
        const now = Date.now()
        const last = configRateLimits.get(socket.id) || 0
        if (now - last < 100) return // Drop if < 100ms since last
        configRateLimits.set(socket.id, now)

        const sequencerService = socket.services?.sequencerGestureService

        if (!sequencerService) return

        // Validate and sanitize parameters
        const validatedParams = validateSequencerParams(params)

        // Only update if we have valid params
        if (Object.keys(validatedParams).length > 0) {
          sequencerService.updateParams(socket.id, validatedParams)
        }
      } catch (error) {
        console.error(`[SequencerHandler] Error updating params:`, error.message)
      }
    })
  },

  /**
   * Register sequencer:pause handler
   * Pauses step sequencer when user starts a real gesture
   * @param {Object} socket - Socket.io socket instance
   */
  registerSequencerPauseHandler (socket) {
    socket.on('sequencer:pause', () => {
      try {
        const sequencerService = socket.services?.sequencerGestureService
        if (!sequencerService) return
        sequencerService.pauseSequencer(socket.id)
      } catch (error) {
        console.error(`[SequencerHandler] Error pausing sequencer:`, error.message)
      }
    })
  },

  /**
   * Register sequencer:resume handler
   * Resumes step sequencer when user ends their real gesture
   * @param {Object} socket - Socket.io socket instance
   */
  registerSequencerResumeHandler (socket) {
    socket.on('sequencer:resume', () => {
      try {
        const sequencerService = socket.services?.sequencerGestureService
        if (!sequencerService) return
        sequencerService.resumeSequencer(socket.id)
      } catch (error) {
        console.error(`[SequencerHandler] Error resuming sequencer:`, error.message)
      }
    })
  },

  /**
   * Register disconnect cleanup for sequencer
   * Stops any active sequencer when socket disconnects
   * @param {Object} socket - Socket.io socket instance
   */
  registerSequencerDisconnectHandler (socket) {
    socket.on('disconnect', () => {
      try {
        const sequencerService = socket.services?.sequencerGestureService
        if (sequencerService) {
          sequencerService.stopSequencer(socket.id)
        }
        // Clean up rate limiter
        configRateLimits.delete(socket.id)
      } catch (error) {
        console.warn(`[SequencerHandler] Error during disconnect cleanup for socket ${socket.id}:`, error.message)
      }
    })
  }
}

module.exports = SequencerHandler
