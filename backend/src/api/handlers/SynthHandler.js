/**
 * SynthHandler - Synth parameter synchronization handlers
 * Handles: synth:params, synth:preset-request, synth:preset-changed
 * Enables users to customize their synth timbre and sync across all room participants
 */

const ValidationHandler = require('./ValidationHandler')
const RateLimiter = require('../../utils/RateLimiter')

/**
 * Real user preset names (matches frontend PatchDefinitions.js)
 */
const PRESET_NAMES = {
  0: 'Retro Square',
  1: 'Nasal Reed',
  2: 'Warm Chorus',
  3: 'Bell Chime',
  4: 'Soft Square',
  5: 'Wide Pulse',
  6: 'Bright Chorus',
  7: 'Deep Bell'
}

/**
 * Validate synth params are within safe ranges
 * @param {Object} params - Synth parameters
 * @returns {Object} Validated and clamped parameters
 */
function validateSynthParams (params) {
  if (!params || typeof params !== 'object') {
    return {}
  }

  const validated = {}

  // Oscillator-specific params
  if (params.pulseWidth !== undefined) {
    validated.pulseWidth = Math.max(0.1, Math.min(0.9, Number(params.pulseWidth) || 0.3))
  }
  if (params.fatSpread !== undefined) {
    validated.fatSpread = Math.max(5, Math.min(50, Number(params.fatSpread) || 25))
  }
  if (params.fatCount !== undefined) {
    validated.fatCount = Math.max(2, Math.min(5, Math.round(Number(params.fatCount) || 3)))
  }
  if (params.modulationIndex !== undefined) {
    validated.modulationIndex = Math.max(0.5, Math.min(12, Number(params.modulationIndex) || 4))
  }
  if (params.modulationType !== undefined) {
    const validTypes = ['sine', 'triangle', 'square']
    validated.modulationType = validTypes.includes(params.modulationType) ? params.modulationType : 'sine'
  }

  // Filter params - full synth range
  if (params.filterType !== undefined) {
    const validFilterTypes = ['lowpass', 'highpass', 'bandpass']
    validated.filterType = validFilterTypes.includes(params.filterType) ? params.filterType : 'lowpass'
  }
  if (params.filterCutoff !== undefined) {
    validated.filterCutoff = Math.max(20, Math.min(20000, Number(params.filterCutoff) || 2000))
  }
  if (params.filterQ !== undefined) {
    validated.filterQ = Math.max(0.1, Math.min(20.0, Number(params.filterQ) || 1.0))
  }

  // Envelope params - full synth range
  if (params.attack !== undefined) {
    validated.attack = Math.max(0.001, Math.min(4.0, Number(params.attack) || 0.05))
  }
  if (params.decay !== undefined) {
    validated.decay = Math.max(0.001, Math.min(8.0, Number(params.decay) || 0.3))
  }
  if (params.sustain !== undefined) {
    validated.sustain = Math.max(0.0, Math.min(1.0, Number(params.sustain) || 0.5))
  }
  if (params.release !== undefined) {
    validated.release = Math.max(0.001, Math.min(10.0, Number(params.release) || 0.5))
  }

  // Effects params - full range
  if (params.volume !== undefined) {
    validated.volume = Math.max(-12, Math.min(12, Number(params.volume) || 0))
  }
  if (params.pan !== undefined) {
    validated.pan = Math.max(-1.0, Math.min(1.0, Number(params.pan) || 0))
  }
  if (params.delaySend !== undefined) {
    validated.delaySend = Math.max(0, Math.min(1.0, Number(params.delaySend) || 0.2))
  }
  if (params.reverbSend !== undefined) {
    validated.reverbSend = Math.max(0, Math.min(1.0, Number(params.reverbSend) || 0.3))
  }

  return validated
}

const SynthHandler = {
  /**
   * Register synth:params event handler
   * Broadcasts user's synth settings to other users in room
   * @param {Socket} socket - Socket instance
   */
  registerSynthParamsHandler (socket) {
    socket.on('synth:params', async (data, callback) => {
      try {
        // Rate limiting - synth params don't need to update faster than 5Hz
        const limitResult = RateLimiter.checkLimit('synth:params', socket)
        if (!limitResult.allowed) {
          // Silent drop for rate-limited param updates
          return
        }

        if (!socket.userId || !socket.roomId) {
          if (callback) {
            ValidationHandler.sendError(callback, 'NO_ACTIVE_SESSION', 'No active room session')
          }
          return
        }

        if (!data || !data.params) {
          if (callback) {
            ValidationHandler.sendError(callback, 'INVALID_DATA', 'Missing params')
          }
          return
        }

        const room = socket.services.roomManager.getRoom(socket.roomId)
        if (!room) {
          if (callback) {
            ValidationHandler.sendError(callback, 'ROOM_NOT_FOUND', 'Room not found')
          }
          return
        }

        const user = room.getUser(socket.userId)
        if (!user) {
          if (callback) {
            ValidationHandler.sendError(callback, 'USER_NOT_FOUND', 'User not found in room')
          }
          return
        }

        // Validate and clamp params
        const validatedParams = validateSynthParams(data.params)

        // Validate preset slot if provided
        let presetSlot = data.presetSlot
        if (presetSlot !== undefined) {
          presetSlot = Math.max(0, Math.min(7, Math.round(Number(presetSlot) || 0)))
        }

        // Store in user object for late joiners
        user.synthParams = validatedParams
        if (presetSlot !== undefined) {
          user.synthPresetSlot = presetSlot
        }

        // Broadcast to other users in room
        const broadcast = {
          type: 'synth:params',
          userId: socket.userId,
          presetSlot: user.synthPresetSlot,
          params: validatedParams,
          userColor: user.assignedColor || '#6bcf7f',
          timestamp: Date.now()
        }

        socket.to(socket.roomId).emit('synth:params', broadcast)

        if (callback) {
          callback({ success: true, timestamp: Date.now() })
        }
      } catch (error) {
        console.error('[SynthHandler] synth:params error:', error)
        if (callback) {
          ValidationHandler.sendError(callback, 'SYNTH_PARAMS_FAILED', error.message)
        }
      }
    })
  },

  /**
   * Register synth:preset-request event handler
   * Handles preset selection with conflict resolution
   * @param {Socket} socket - Socket instance
   */
  registerPresetRequestHandler (socket) {
    socket.on('synth:preset-request', async (data, callback) => {
      try {
        if (!socket.userId || !socket.roomId) {
          if (callback) {
            ValidationHandler.sendError(callback, 'NO_ACTIVE_SESSION', 'No active room session')
          }
          return
        }

        if (data.requestedSlot === undefined) {
          if (callback) {
            ValidationHandler.sendError(callback, 'INVALID_DATA', 'Missing requestedSlot')
          }
          return
        }

        const requestedSlot = Math.max(0, Math.min(7, Math.round(Number(data.requestedSlot) || 0)))

        const room = socket.services.roomManager.getRoom(socket.roomId)
        if (!room) {
          if (callback) {
            ValidationHandler.sendError(callback, 'ROOM_NOT_FOUND', 'Room not found')
          }
          return
        }

        // Check if slot is already used by another user
        for (const [userId, user] of room.users) {
          if (userId !== socket.userId && user.synthPresetSlot === requestedSlot) {
            // Slot is taken
            if (callback) {
              callback({
                granted: false,
                takenBy: PRESET_NAMES[requestedSlot] || `Preset ${requestedSlot}`
              })
            }
            return
          }
        }

        // Slot is free, assign to user
        const user = room.getUser(socket.userId)
        if (user) {
          const previousSlot = user.synthPresetSlot
          user.synthPresetSlot = requestedSlot

          // Broadcast change to other users
          socket.to(socket.roomId).emit('synth:preset-changed', {
            userId: socket.userId,
            presetSlot: requestedSlot,
            previousSlot: previousSlot,
            timestamp: Date.now()
          })
        }

        if (callback) {
          callback({ granted: true, slot: requestedSlot })
        }
      } catch (error) {
        console.error('[SynthHandler] synth:preset-request error:', error)
        if (callback) {
          ValidationHandler.sendError(callback, 'PRESET_REQUEST_FAILED', error.message)
        }
      }
    })
  },

  /**
   * Get all users' synth params for a joining user
   * Called during room join to sync existing settings
   * @param {Object} room - Room instance
   * @returns {Object} Map of userId -> { presetSlot, params }
   */
  getAllSynthParams (room) {
    const allSynthData = {}

    if (room?.users) {
      for (const [userId, user] of room.users) {
        if (user.synthPresetSlot !== undefined || user.synthParams) {
          allSynthData[userId] = {
            presetSlot: user.synthPresetSlot ?? user.slot,
            params: user.synthParams || null
          }
        }
      }
    }

    return allSynthData
  },

  /**
   * Get list of occupied preset slots in a room
   * @param {Object} room - Room instance
   * @returns {number[]} Array of occupied slot numbers
   */
  getOccupiedSlots (room) {
    const occupied = []

    if (room?.users) {
      for (const [userId, user] of room.users) {
        if (user.synthPresetSlot !== undefined) {
          occupied.push(user.synthPresetSlot)
        }
      }
    }

    return occupied
  }
}

module.exports = SynthHandler
