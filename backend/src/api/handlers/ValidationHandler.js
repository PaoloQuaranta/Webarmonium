/**
 * ValidationHandler - Shared validation utilities for socket handlers
 * Extracted from socketHandlers.js for modularity
 */

const { v4: uuidv4 } = require('uuid')
const { MIDI, TEMPO } = require('../../constants/MusicConstants')
const { AppError, ErrorCodes } = require('../../utils/AppError')

const ValidationHandler = {
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
      validated.platform = userData.platform.substr(0, 50)
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
   * Supports both legacy (code, message) format and AppError instances
   * @param {Function} callback - Response callback
   * @param {string|AppError} codeOrError - Error code string or AppError instance
   * @param {string} message - Error message (ignored if codeOrError is AppError)
   * @param {Object} extra - Additional error data
   */
  sendError (callback, codeOrError, message, extra = {}) {
    let errorResponse

    // Support AppError instances directly
    if (codeOrError instanceof AppError) {
      errorResponse = codeOrError.toSocketResponse()
    } else {
      // Legacy format: code and message as separate arguments
      errorResponse = {
        success: false,
        error: {
          code: codeOrError,
          message,
          timestamp: Date.now(),
          ...extra
        }
      }
    }

    if (typeof callback === 'function') {
      callback(errorResponse)
    }
  },

  /**
   * Get error codes for consistent usage
   * @returns {Object} Error codes enum
   */
  getErrorCodes () {
    return ErrorCodes
  },

  /**
   * Validate position data
   * @param {Object} position - Position with x, y coordinates
   * @returns {boolean} Whether position is valid
   */
  validatePosition (position) {
    if (!position || typeof position !== 'object') {
      return false
    }
    const { x, y } = position
    if (typeof x !== 'number' || typeof y !== 'number') {
      return false
    }
    if (x < 0 || x > 1 || y < 0 || y > 1) {
      return false
    }
    return true
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

    // Validate musical parameters using constants
    if (typeof event.pitch !== 'number' || event.pitch < MIDI.MIN_NOTE || event.pitch > MIDI.MAX_NOTE) {
      return { isValid: false, error: `Pitch must be between ${MIDI.MIN_NOTE}-${MIDI.MAX_NOTE} (MIDI range)` }
    }

    if (typeof event.duration !== 'number' || event.duration <= 0) {
      return { isValid: false, error: 'Duration must be a positive number' }
    }

    if (typeof event.velocity !== 'number' || event.velocity < MIDI.MIN_VELOCITY || event.velocity > MIDI.MAX_VELOCITY) {
      return { isValid: false, error: `Velocity must be between ${MIDI.MIN_VELOCITY}-${MIDI.MAX_VELOCITY}` }
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
      if (typeof data.tempo !== 'number' || data.tempo < TEMPO.MIN_BPM || data.tempo > TEMPO.MAX_BPM) {
        return { isValid: false, error: `Tempo must be between ${TEMPO.MIN_BPM}-${TEMPO.MAX_BPM} BPM` }
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
   * Validate session (userId and roomId present)
   * @param {Object} socket - Socket instance
   * @returns {boolean} Whether session is valid
   */
  validateSession (socket) {
    return !!(socket.userId && socket.roomId)
  },

  /**
   * Calculate spatial audio parameters for event
   * @param {string} userId - User ID
   * @param {Object} event - Musical event
   * @returns {Object} Spatial audio parameters
   */
  calculateSpatialAudio (userId, event) {
    const userPosition = { x: 0, y: 0 }
    const eventPosition = { x: 0, y: 0 }

    const distance = Math.sqrt(
      Math.pow(eventPosition.x - userPosition.x, 2) +
      Math.pow(eventPosition.y - userPosition.y, 2)
    )

    const maxDistance = 500
    const normalizedDistance = Math.min(1, distance / maxDistance)

    return {
      pan: Math.max(-1, Math.min(1, (eventPosition.x - userPosition.x) / maxDistance)),
      volume: Math.max(0.1, 1 - normalizedDistance * 0.7),
      reverb: normalizedDistance * 0.3,
      delay: normalizedDistance * 0.05
    }
  },

  /**
   * Calculate timing offset for clock synchronization
   * @param {Object} socket - Socket instance
   * @param {Object} data - Client sync data
   * @returns {number} Timing offset in milliseconds
   */
  calculateTimingOffset (socket, data) {
    if (!data.clientTimestamp) return 0

    const serverTime = Date.now()
    const roundTripTime = serverTime - data.clientTimestamp
    const estimatedOffset = roundTripTime / 2

    return estimatedOffset
  }
}

module.exports = ValidationHandler
