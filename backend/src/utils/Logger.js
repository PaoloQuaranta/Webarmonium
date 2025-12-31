/**
 * Logger Utility
 * Structured logging with levels and conditional output
 * Reduces hot-path console.log overhead in production
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
}

// Default to INFO in production, DEBUG in development
const DEFAULT_LEVEL = process.env.NODE_ENV === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG

class Logger {
  constructor (context = 'app', level = DEFAULT_LEVEL) {
    this.context = context
    this.level = level
    this.enabled = process.env.LOG_ENABLED !== 'false'
  }

  /**
   * Format log message with timestamp and context
   * @param {string} level - Log level name
   * @param {string} message - Log message
   * @param {Object} data - Optional data object
   * @returns {string} Formatted log string
   */
  format (level, message, data) {
    const timestamp = new Date().toISOString()
    const dataStr = data ? ` ${JSON.stringify(data)}` : ''
    return `[${timestamp}] [${level}] [${this.context}] ${message}${dataStr}`
  }

  /**
   * Log error message (always logged)
   * @param {string} message - Error message
   * @param {Error|Object} data - Error or additional data
   */
  error (message, data) {
    if (!this.enabled) return
    if (this.level >= LOG_LEVELS.ERROR) {
// console.error(this.format('ERROR', message, data))
    }
  }

  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {Object} data - Additional data
   */
  warn (message, data) {
    if (!this.enabled) return
    if (this.level >= LOG_LEVELS.WARN) {
// console.warn(this.format('WARN', message, data))
    }
  }

  /**
   * Log info message
   * @param {string} message - Info message
   * @param {Object} data - Additional data
   */
  info (message, data) {
    if (!this.enabled) return
    if (this.level >= LOG_LEVELS.INFO) {
// console.log(this.format('INFO', message, data))
    }
  }

  /**
   * Log debug message (disabled in production)
   * @param {string} message - Debug message
   * @param {Object} data - Additional data
   */
  debug (message, data) {
    if (!this.enabled) return
    if (this.level >= LOG_LEVELS.DEBUG) {
// console.log(this.format('DEBUG', message, data))
    }
  }

  /**
   * Log trace message (most verbose, for hot paths)
   * Only enabled when explicitly set
   * @param {string} message - Trace message
   * @param {Object} data - Additional data
   */
  trace (message, data) {
    if (!this.enabled) return
    if (this.level >= LOG_LEVELS.TRACE) {
// console.log(this.format('TRACE', message, data))
    }
  }

  /**
   * Log performance metric
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in ms
   * @param {Object} data - Additional data
   */
  perf (operation, duration, data) {
    if (!this.enabled) return
    if (this.level >= LOG_LEVELS.DEBUG) {
// console.log(this.format('PERF', `${operation} completed in ${duration}ms`, data))
    }
  }

  /**
   * Create a child logger with a sub-context
   * @param {string} subContext - Sub-context name
   * @returns {Logger} Child logger instance
   */
  child (subContext) {
    return new Logger(`${this.context}:${subContext}`, this.level)
  }

  /**
   * Set log level dynamically
   * @param {number} level - New log level
   */
  setLevel (level) {
    this.level = level
  }
}

// Factory function to create loggers
function createLogger (context, level) {
  return new Logger(context, level)
}

// Pre-configured loggers for common contexts
const loggers = {
  socket: createLogger('socket'),
  gesture: createLogger('gesture'),
  musical: createLogger('musical'),
  room: createLogger('room'),
  hover: createLogger('hover'),
  drawing: createLogger('drawing'),
  auth: createLogger('auth')
}

module.exports = {
  Logger,
  createLogger,
  loggers,
  LOG_LEVELS
}
