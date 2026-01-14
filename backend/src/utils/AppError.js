/**
 * AppError - Standardized Application Error Classes
 * Provides consistent error handling across the application
 */

/**
 * Base application error class
 * All custom errors should extend this class
 */
class AppError extends Error {
  constructor (code, message, statusCode = 500, data = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.data = data
    this.timestamp = Date.now()
    this.isOperational = true // Distinguishes operational errors from programming errors

    Error.captureStackTrace(this, this.constructor)
  }

  /**
   * Convert error to JSON-safe object
   * @param {boolean} includeStack - Whether to include stack trace
   * @returns {Object}
   */
  toJSON (includeStack = false) {
    const json = {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp,
        ...this.data
      }
    }

    if (includeStack && this.stack) {
      json.error.stack = this.stack
    }

    return json
  }

  /**
   * Convert to socket callback response format
   * @returns {Object}
   */
  toSocketResponse () {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp,
        ...this.data
      }
    }
  }
}

/**
 * Validation error - for invalid input data
 */
class ValidationError extends AppError {
  constructor (message, field = null, data = {}) {
    super('VALIDATION_ERROR', message, 400, { field, ...data })
    this.name = 'ValidationError'
  }
}

/**
 * Not found error - for missing resources
 */
class NotFoundError extends AppError {
  constructor (resource, identifier = null) {
    const message = identifier
      ? `${resource} '${identifier}' not found`
      : `${resource} not found`
    super('NOT_FOUND', message, 404, { resource, identifier })
    this.name = 'NotFoundError'
  }
}

/**
 * Session error - for authentication/session issues
 */
class SessionError extends AppError {
  constructor (message = 'No active session', shouldReconnect = true) {
    super('SESSION_ERROR', message, 401, { shouldReconnect })
    this.name = 'SessionError'
  }
}

/**
 * Room error - for room-related issues
 */
class RoomError extends AppError {
  constructor (code, message, roomId = null) {
    super(code, message, 400, { roomId })
    this.name = 'RoomError'
  }

  static full (roomId) {
    return new RoomError('ROOM_FULL', 'Room has reached maximum capacity', roomId)
  }

  static notFound (roomId) {
    return new RoomError('ROOM_NOT_FOUND', `Room '${roomId}' not found`, roomId)
  }

  static alreadyJoined (roomId) {
    return new RoomError('ALREADY_IN_ROOM', 'User is already in this room', roomId)
  }
}

/**
 * Musical error - for music processing issues
 */
class MusicalError extends AppError {
  constructor (code, message, data = {}) {
    super(code, message, 400, data)
    this.name = 'MusicalError'
  }

  static invalidPitch (pitch) {
    return new MusicalError('INVALID_PITCH', 'Pitch must be between 0-127 (MIDI range)', { pitch })
  }

  static invalidVelocity (velocity) {
    return new MusicalError('INVALID_VELOCITY', 'Velocity must be between 0-127', { velocity })
  }

  static invalidTempo (tempo) {
    return new MusicalError('INVALID_TEMPO', 'Tempo must be between 60-200 BPM', { tempo })
  }
}

/**
 * Latency error - for constitutional requirement violations
 */
class LatencyError extends AppError {
  constructor (operation, latency, threshold) {
    super(
      'LATENCY_VIOLATION',
      `${operation} latency ${latency}ms exceeds ${threshold}ms constitutional requirement`,
      200, // Not a failure status, just a warning
      { operation, latency, threshold }
    )
    this.name = 'LatencyError'
  }
}

/**
 * Error codes enum for consistency
 * Entry #Security: Added security-related error codes
 */
const ErrorCodes = {
  // Session errors
  NO_ACTIVE_SESSION: 'NO_ACTIVE_SESSION',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_INVALID: 'SESSION_INVALID',
  NO_USER_SESSION: 'NO_USER_SESSION',

  // Room errors
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  INVALID_ROOM_ID: 'INVALID_ROOM_ID',
  MISSING_ROOM_ID: 'MISSING_ROOM_ID',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_DATA_FORMAT: 'INVALID_DATA_FORMAT',
  INVALID_HOLD_DATA: 'INVALID_HOLD_DATA',
  INVALID_GESTURE_DATA: 'INVALID_GESTURE_DATA',
  INVALID_NOTE_DATA: 'INVALID_NOTE_DATA',
  INVALID_FREQUENCY: 'INVALID_FREQUENCY',
  INVALID_POSITION: 'INVALID_POSITION',

  // Musical errors
  INVALID_PITCH: 'INVALID_PITCH',
  INVALID_VELOCITY: 'INVALID_VELOCITY',
  INVALID_TEMPO: 'INVALID_TEMPO',
  INVALID_GESTURE: 'INVALID_GESTURE',

  // Operation errors
  OPERATION_FAILED: 'OPERATION_FAILED',
  JOIN_FAILED: 'JOIN_FAILED',
  LEAVE_FAILED: 'LEAVE_FAILED',
  HOLD_START_FAILED: 'HOLD_START_FAILED',
  HOLD_END_FAILED: 'HOLD_END_FAILED',
  NOTE_STREAM_FAILED: 'NOTE_STREAM_FAILED',
  GESTURE_PROCESSING_FAILED: 'GESTURE_PROCESSING_FAILED',
  HEARTBEAT_FAILED: 'HEARTBEAT_FAILED',

  // Security errors
  RATE_LIMITED: 'RATE_LIMITED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  ROOM_CREATION_LIMIT: 'ROOM_CREATION_LIMIT',
  CONNECTION_LIMIT: 'CONNECTION_LIMIT',
  ARRAY_TOO_LARGE: 'ARRAY_TOO_LARGE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',

  // System errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  LATENCY_VIOLATION: 'LATENCY_VIOLATION'
}

/**
 * Helper function to handle errors consistently
 * @param {Error} error - The error to handle
 * @param {Function} callback - Socket callback function
 * @param {Object} logger - Optional logger instance
 */
function handleError (error, callback, logger = console) {
  // If it's an operational error, send it to the client
  if (error instanceof AppError && error.isOperational) {
    if (typeof callback === 'function') {
      callback(error.toSocketResponse())
    }
    if (logger && error.statusCode >= 500) {
      logger.error(error.message, error.toJSON())
    }
    return
  }

  // For programming errors, log and send generic message
  logger.error('Unexpected error:', error)
  if (typeof callback === 'function') {
    callback({
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        timestamp: Date.now()
      }
    })
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  SessionError,
  RoomError,
  MusicalError,
  LatencyError,
  ErrorCodes,
  handleError
}
