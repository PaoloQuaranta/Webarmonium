/**
 * RateLimiter Utility
 * Centralized rate limiting that tracks by userId/IP (not per-socket)
 * Prevents bypass via multiple socket connections
 * Entry #Security: Fix for per-socket rate limiting vulnerability
 */

const { loggers, createLogger } = require('./Logger')
const logger = createLogger('rate-limiter')

/**
 * Rate limit configuration by event type
 * @type {Object.<string, {windowMs: number, maxRequests: number}>}
 */
const RATE_LIMIT_CONFIG = {
  'cursor-move': { windowMs: 1000, maxRequests: 60 },   // 60/sec for 60fps
  'gesture': { windowMs: 1000, maxRequests: 20 },        // 20/sec
  'hover-update': { windowMs: 1000, maxRequests: 20 },   // 20/sec
  'note:stream': { windowMs: 1000, maxRequests: 25 },    // 25/sec
  'hold:start': { windowMs: 1000, maxRequests: 30 },     // 30/sec
  'hold:end': { windowMs: 1000, maxRequests: 30 },       // 30/sec
  'room-creation': { windowMs: 3600000, maxRequests: 5 }, // 5/hour
  'connection': { windowMs: 60000, maxRequests: 10 }     // 10/minute
}

/**
 * Storage for rate limit tracking
 * Key: `${eventType}:${identifier}` (identifier = userId or IP)
 * Value: { timestamps: number[], lastCleanup: number }
 */
const rateLimitStore = new Map()

/**
 * Cleanup interval reference for graceful shutdown
 */
let cleanupIntervalId = null

/**
 * Get identifier for rate limiting (userId preferred, fallback to IP)
 * @param {Object} socket - Socket.io socket instance
 * @returns {string} Identifier for rate limiting
 */
function getIdentifier (socket) {
  // Prefer userId if authenticated
  if (socket.userId) {
    return `user:${socket.userId}`
  }
  // Fallback to IP address
  const ip = socket.handshake?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
             socket.handshake?.address ||
             'unknown'
  return `ip:${ip}`
}

/**
 * Get IP address from socket
 * @param {Object} socket - Socket.io socket instance
 * @returns {string} IP address
 */
function getIP (socket) {
  return socket.handshake?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
         socket.handshake?.address ||
         'unknown'
}

/**
 * Check if request should be rate limited
 * @param {string} eventType - Type of event (e.g., 'cursor-move', 'gesture')
 * @param {Object} socket - Socket.io socket instance
 * @param {Object} options - Optional override options
 * @param {number} options.windowMs - Custom window in milliseconds
 * @param {number} options.maxRequests - Custom max requests per window
 * @returns {{allowed: boolean, remaining: number, resetTime: number, retryAfter?: number}}
 */
function checkLimit (eventType, socket, options = {}) {
  const config = options.windowMs && options.maxRequests
    ? options
    : RATE_LIMIT_CONFIG[eventType] || { windowMs: 1000, maxRequests: 100 }

  const identifier = getIdentifier(socket)
  const key = `${eventType}:${identifier}`
  const now = Date.now()

  // Get or create entry
  let entry = rateLimitStore.get(key)
  if (!entry) {
    entry = { timestamps: [], lastCleanup: now }
    rateLimitStore.set(key, entry)
  }

  // Remove timestamps outside the window
  const windowStart = now - config.windowMs
  entry.timestamps = entry.timestamps.filter(ts => ts > windowStart)

  // Check if limit exceeded
  if (entry.timestamps.length >= config.maxRequests) {
    const oldestTimestamp = entry.timestamps[0]
    const retryAfter = Math.ceil((oldestTimestamp + config.windowMs - now) / 1000)

    return {
      allowed: false,
      remaining: 0,
      resetTime: oldestTimestamp + config.windowMs,
      retryAfter: Math.max(1, retryAfter)
    }
  }

  // Add current timestamp
  entry.timestamps.push(now)

  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    resetTime: now + config.windowMs
  }
}

/**
 * Check rate limit by IP address directly (for pre-auth checks)
 * @param {string} eventType - Type of event
 * @param {string} ip - IP address
 * @param {Object} options - Optional override options
 * @returns {{allowed: boolean, remaining: number, resetTime: number, retryAfter?: number}}
 */
function checkLimitByIP (eventType, ip, options = {}) {
  const config = options.windowMs && options.maxRequests
    ? options
    : RATE_LIMIT_CONFIG[eventType] || { windowMs: 1000, maxRequests: 100 }

  const key = `${eventType}:ip:${ip}`
  const now = Date.now()

  let entry = rateLimitStore.get(key)
  if (!entry) {
    entry = { timestamps: [], lastCleanup: now }
    rateLimitStore.set(key, entry)
  }

  const windowStart = now - config.windowMs
  entry.timestamps = entry.timestamps.filter(ts => ts > windowStart)

  if (entry.timestamps.length >= config.maxRequests) {
    const oldestTimestamp = entry.timestamps[0]
    const retryAfter = Math.ceil((oldestTimestamp + config.windowMs - now) / 1000)

    return {
      allowed: false,
      remaining: 0,
      resetTime: oldestTimestamp + config.windowMs,
      retryAfter: Math.max(1, retryAfter)
    }
  }

  entry.timestamps.push(now)

  return {
    allowed: true,
    remaining: config.maxRequests - entry.timestamps.length,
    resetTime: now + config.windowMs
  }
}

/**
 * Reset rate limit for a specific identifier and event type
 * @param {string} eventType - Type of event
 * @param {Object|string} socketOrIdentifier - Socket instance or identifier string
 */
function resetLimit (eventType, socketOrIdentifier) {
  const identifier = typeof socketOrIdentifier === 'string'
    ? socketOrIdentifier
    : getIdentifier(socketOrIdentifier)
  const key = `${eventType}:${identifier}`
  rateLimitStore.delete(key)
}

/**
 * Clean up expired entries from the rate limit store
 * Should be called periodically to prevent memory leaks
 */
function cleanup () {
  const now = Date.now()
  let cleaned = 0

  for (const [key, entry] of rateLimitStore.entries()) {
    // Extract event type from key to get correct window
    const eventType = key.split(':')[0]
    const config = RATE_LIMIT_CONFIG[eventType] || { windowMs: 60000 }

    // Remove entries with no recent activity (2x window)
    const maxAge = config.windowMs * 2
    if (entry.timestamps.length === 0 || (now - Math.max(...entry.timestamps)) > maxAge) {
      rateLimitStore.delete(key)
      cleaned++
    }
  }

  if (cleaned > 0) {
    logger.debug(`Rate limiter cleanup: removed ${cleaned} stale entries`)
  }
}

/**
 * Start periodic cleanup (call once on server startup)
 * @param {number} intervalMs - Cleanup interval in milliseconds (default: 60000)
 * @returns {NodeJS.Timer} Interval ID for clearing on shutdown
 */
function startCleanup (intervalMs = 60000) {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId)
  }
  cleanupIntervalId = setInterval(cleanup, intervalMs)
  logger.info(`Rate limiter cleanup started (interval: ${intervalMs}ms)`)
  return cleanupIntervalId
}

/**
 * Stop periodic cleanup (call on server shutdown)
 */
function stopCleanup () {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId)
    cleanupIntervalId = null
    logger.info('Rate limiter cleanup stopped')
  }
}

/**
 * Get current rate limit stats (for monitoring/debugging)
 * @returns {{totalEntries: number, entriesByType: Object}}
 */
function getStats () {
  const entriesByType = {}

  for (const key of rateLimitStore.keys()) {
    const eventType = key.split(':')[0]
    entriesByType[eventType] = (entriesByType[eventType] || 0) + 1
  }

  return {
    totalEntries: rateLimitStore.size,
    entriesByType
  }
}

/**
 * Get rate limit configuration for an event type
 * @param {string} eventType - Type of event
 * @returns {{windowMs: number, maxRequests: number}}
 */
function getConfig (eventType) {
  return RATE_LIMIT_CONFIG[eventType] || { windowMs: 1000, maxRequests: 100 }
}

module.exports = {
  checkLimit,
  checkLimitByIP,
  resetLimit,
  cleanup,
  startCleanup,
  stopCleanup,
  getStats,
  getIdentifier,
  getIP,
  getConfig,
  RATE_LIMIT_CONFIG
}
