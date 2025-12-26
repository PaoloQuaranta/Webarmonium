/**
 * Socket Validation Utilities
 * Extracted common validation patterns from socketHandlers.js
 */

/**
 * Validates that a socket has an active session (userId and roomId)
 * @param {Object} socket - Socket.io socket instance
 * @returns {{valid: boolean, error?: string}}
 */
function validateSession (socket) {
  if (!socket.userId || !socket.roomId) {
    return { valid: false, error: 'NO_ACTIVE_SESSION' }
  }
  return { valid: true }
}

/**
 * Gets the room for a socket, with optional error handling
 * @param {Object} socket - Socket.io socket instance
 * @returns {{success: boolean, room?: Object, error?: string}}
 */
function getRoomOrFail (socket) {
  const room = socket.services?.roomManager?.getRoom(socket.roomId)
  if (!room) {
    return { success: false, error: 'ROOM_NOT_FOUND' }
  }
  return { success: true, room }
}

/**
 * Combined validation: session + room lookup
 * @param {Object} socket - Socket.io socket instance
 * @returns {{valid: boolean, room?: Object, error?: string}}
 */
function validateSessionAndRoom (socket) {
  const sessionResult = validateSession(socket)
  if (!sessionResult.valid) {
    return { valid: false, error: sessionResult.error }
  }

  const roomResult = getRoomOrFail(socket)
  if (!roomResult.success) {
    return { valid: false, error: roomResult.error }
  }

  return { valid: true, room: roomResult.room }
}

/**
 * Validates position data
 * @param {Object} position - Position object with x, y coordinates
 * @returns {{valid: boolean, error?: string}}
 */
function validatePosition (position) {
  if (!position || typeof position !== 'object') {
    return { valid: false, error: 'INVALID_POSITION' }
  }

  const { x, y } = position
  if (typeof x !== 'number' || typeof y !== 'number') {
    return { valid: false, error: 'INVALID_COORDINATES' }
  }

  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return { valid: false, error: 'COORDINATES_OUT_OF_RANGE' }
  }

  return { valid: true }
}

module.exports = {
  validateSession,
  getRoomOrFail,
  validateSessionAndRoom,
  validatePosition
}
