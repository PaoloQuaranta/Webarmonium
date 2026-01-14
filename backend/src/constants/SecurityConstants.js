/**
 * SecurityConstants - Centralized security configuration constants
 * Entry #Security: Extract magic numbers to named constants for maintainability
 */

/**
 * Rate limiting configuration
 * @type {Object}
 */
const RATE_LIMITS = {
  // HTTP rate limiting
  HTTP: {
    WINDOW_MS: 15 * 60 * 1000,  // 15 minutes
    MAX_REQUESTS: 100           // requests per window
  },

  // WebSocket connection rate limiting
  CONNECTION: {
    WINDOW_MS: 60000,           // 1 minute
    MAX_PER_IP: 10              // connections per IP per window
  },

  // Room creation rate limiting
  ROOM_CREATION: {
    WINDOW_MS: 3600000,         // 1 hour
    MAX_PER_IP: 5               // rooms per IP per window
  },

  // Event rate limits (ms between events)
  EVENTS: {
    CURSOR_MOVE: { WINDOW_MS: 1000, MAX_REQUESTS: 60 },   // 60fps
    GESTURE: { WINDOW_MS: 1000, MAX_REQUESTS: 20 },       // 20/sec
    HOVER_UPDATE: { WINDOW_MS: 1000, MAX_REQUESTS: 20 },  // 20/sec
    NOTE_STREAM: { WINDOW_MS: 1000, MAX_REQUESTS: 25 },   // 25/sec
    HOLD_START: { WINDOW_MS: 1000, MAX_REQUESTS: 30 },    // 30/sec
    HOLD_END: { WINDOW_MS: 1000, MAX_REQUESTS: 30 }       // 30/sec
  }
}

/**
 * Payload size limits (bytes)
 * @type {Object}
 */
const PAYLOAD_LIMITS = {
  MAX_HTTP_BUFFER: 1e6,         // 1MB for Socket.io
  MAX_JSON_BODY: '50mb',        // Express JSON limit
  MAX_URLENCODED: '50mb'        // Express URL-encoded limit
}

/**
 * Array length limits for validation
 * @type {Object}
 */
const ARRAY_LIMITS = {
  STREAMED_NOTES: 500,
  POINTS: 1000,
  TRAIL_POINTS: 200,
  DEFAULT: 1000
}

/**
 * Session and timeout constants
 * @type {Object}
 */
const SESSION = {
  CONNECTION_STATE_RECOVERY_MS: 2 * 60 * 1000,  // 2 minutes
  SHUTDOWN_TIMEOUT_MS: 10000,                    // 10 seconds
  HEARTBEAT_INTERVAL_MS: 30000                   // 30 seconds
}

/**
 * Security headers configuration
 * @type {Object}
 */
const SECURITY_HEADERS = {
  CSP: {
    DEFAULT_SRC: "'self'",
    SCRIPT_SRC: "'self' 'unsafe-inline' 'unsafe-eval'",
    STYLE_SRC: "'self' 'unsafe-inline'",
    IMG_SRC: "'self' data: blob:",
    CONNECT_SRC: "'self' wss: ws:",
    FONT_SRC: "'self'",
    MEDIA_SRC: "'self' blob:",
    WORKER_SRC: "'self' blob:"
  },
  REFERRER_POLICY: 'strict-origin-when-cross-origin',
  X_CONTENT_TYPE_OPTIONS: 'nosniff',
  X_FRAME_OPTIONS: 'SAMEORIGIN',
  X_XSS_PROTECTION: '1; mode=block'
}

/**
 * Error codes for security-related errors
 * @type {Object}
 */
const SECURITY_ERROR_CODES = {
  RATE_LIMITED: 'RATE_LIMITED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  ARRAY_TOO_LARGE: 'ARRAY_TOO_LARGE',
  INVALID_INPUT: 'INVALID_INPUT',
  ROOM_CREATION_LIMIT: 'ROOM_CREATION_LIMIT',
  CONNECTION_LIMIT: 'CONNECTION_LIMIT'
}

module.exports = {
  RATE_LIMITS,
  PAYLOAD_LIMITS,
  ARRAY_LIMITS,
  SESSION,
  SECURITY_HEADERS,
  SECURITY_ERROR_CODES
}
