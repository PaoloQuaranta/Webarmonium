/**
 * ErrorReporter Utility
 * Centralized error handling and logging
 */
class ErrorReporter {
  /**
   * Log a warning (non-critical issue)
   * @param {string} component - Component name
   * @param {string} message - Warning message
   * @param {*} data - Additional data to log
   */
  static warn (component, message, data = null) {
    const timestamp = new Date().toISOString()
    console.warn(`[${timestamp}] [${component}] ${message}`, data || '')

    // Optional: Send to error tracking service (Sentry, etc.)
    // this.sendToErrorTracker('warn', component, message, data)
  }

  /**
   * Log an error (critical issue)
   * @param {string} component - Component name
   * @param {string} message - Error message
   * @param {Error|*} error - Error object or data
   */
  static error (component, message, error = null) {
    const timestamp = new Date().toISOString()
    console.error(`[${timestamp}] [${component}] ${message}`, error || '')

    // Show user-friendly error message if app is available
    if (window.webarmoniumApp) {
      const userMessage = `${component}: ${message}`
      window.webarmoniumApp.showError(userMessage)
    }

    // Optional: Send to error tracking service
    // this.sendToErrorTracker('error', component, message, error)
  }

  /**
   * Log an info message
   * @param {string} component - Component name
   * @param {string} message - Info message
   * @param {*} data - Additional data
   */
  static info (component, message, data = null) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [${component}] ${message}`, data || '')
  }

  /**
   * Log a debug message (only in development)
   * @param {string} component - Component name
   * @param {string} message - Debug message
   * @param {*} data - Additional data
   */
  static debug (component, message, data = null) {
    if (process.env.NODE_ENV !== 'production') {
      const timestamp = new Date().toISOString()
      console.debug(`[${timestamp}] [${component}] ${message}`, data || '')
    }
  }

  /**
   * Send error to tracking service (placeholder)
   * @private
   */
  static sendToErrorTracker (level, component, message, data) {
    // Placeholder for future integration with Sentry, LogRocket, etc.
    // Example:
    // if (window.Sentry) {
    //   Sentry.captureMessage(`[${component}] ${message}`, {
    //     level,
    //     extra: { data }
    //   })
    // }
  }
}

// Export for use in browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ErrorReporter
}

// Make available globally in browser
if (typeof window !== 'undefined') {
  window.ErrorReporter = ErrorReporter
}
