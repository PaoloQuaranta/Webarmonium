/**
 * NotificationService
 * Simple auto-hide notification component for room events
 *
 * Features:
 * - Auto-hide after specified duration (default 3s)
 * - Fade in/out animations
 * - Queue support for multiple notifications
 * - Customizable styling
 */

class NotificationService {
  constructor() {
    this.container = null
    this.currentNotification = null
    this.queue = []
    this.isShowing = false

    this.defaultDuration = 3000
    this.animationDuration = 300

    this._createContainer()
  }

  /**
   * Create the notification container element
   * @private
   */
  _createContainer() {
    // Check if container already exists
    if (document.getElementById('notification-container')) {
      this.container = document.getElementById('notification-container')
      return
    }

    this.container = document.createElement('div')
    this.container.id = 'notification-container'
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    `

    // Add styles for notifications
    const style = document.createElement('style')
    style.textContent = `
      .webarmonium-notification {
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        padding: 12px 24px;
        border-radius: 8px;
        font-family: 'Archivo', -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        opacity: 0;
        transform: translateY(-20px);
        transition: opacity ${this.animationDuration}ms ease, transform ${this.animationDuration}ms ease;
        pointer-events: auto;
      }

      .webarmonium-notification.show {
        opacity: 1;
        transform: translateY(0);
      }

      .webarmonium-notification.hide {
        opacity: 0;
        transform: translateY(-20px);
      }

      .webarmonium-notification.info {
        border-left: 4px solid #3b82f6;
      }

      .webarmonium-notification.success {
        border-left: 4px solid #22c55e;
      }

      .webarmonium-notification.warning {
        border-left: 4px solid #f59e0b;
      }

      .webarmonium-notification.error {
        border-left: 4px solid #ef4444;
      }
    `
    document.head.appendChild(style)

    // Append container when DOM is ready
    if (document.body) {
      document.body.appendChild(this.container)
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.appendChild(this.container)
      })
    }
  }

  /**
   * Show a notification
   * @param {string} message - Notification message
   * @param {number} duration - Duration in ms (default 3000)
   * @param {string} type - Notification type: 'info', 'success', 'warning', 'error'
   * @param {Function} onDismiss - Callback when notification is dismissed
   */
  show(message, duration = this.defaultDuration, type = 'info', onDismiss = null) {
    const notification = {
      message,
      duration,
      type,
      onDismiss
    }

    if (this.isShowing) {
      // Queue the notification
      this.queue.push(notification)
      return
    }

    this._showNotification(notification)
  }

  /**
   * Show a notification immediately
   * @param {Object} notification - Notification object
   * @private
   */
  _showNotification(notification) {
    this.isShowing = true

    // Create notification element
    const element = document.createElement('div')
    element.className = `webarmonium-notification ${notification.type}`
    element.textContent = notification.message

    this.container.appendChild(element)
    this.currentNotification = element

    // Trigger show animation
    requestAnimationFrame(() => {
      element.classList.add('show')
    })

    // Schedule hide
    setTimeout(() => {
      this._hideNotification(element, notification.onDismiss)
    }, notification.duration)
  }

  /**
   * Hide a notification
   * @param {HTMLElement} element - Notification element
   * @param {Function} onDismiss - Callback when dismissed
   * @private
   */
  _hideNotification(element, onDismiss) {
    element.classList.remove('show')
    element.classList.add('hide')

    setTimeout(() => {
      if (element.parentNode) {
        element.parentNode.removeChild(element)
      }
      this.currentNotification = null
      this.isShowing = false

      if (onDismiss) {
        onDismiss()
      }

      // Show next queued notification
      if (this.queue.length > 0) {
        const next = this.queue.shift()
        this._showNotification(next)
      }
    }, this.animationDuration)
  }

  /**
   * Show mode transition notification
   * @param {string} message - Transition message
   * @param {number} duration - Duration in ms
   */
  showModeTransition(message, duration = 3000) {
    this.show(message, duration, 'info')
  }

  /**
   * Show redirect notification
   * @param {string} message - Redirect message
   * @param {number} duration - Duration in ms
   */
  showRedirect(message, duration = 3000) {
    this.show(message, duration, 'warning')
  }

  /**
   * Show virtual users activated notification
   * @param {string[]} sources - Virtual user sources
   */
  showVirtualUsersActivated(sources) {
    const message = `Utenti virtuali attivati: ${sources.join(', ')}`
    this.show(message, 2000, 'success')
  }

  /**
   * Clear all notifications
   */
  clear() {
    this.queue = []
    if (this.currentNotification && this.currentNotification.parentNode) {
      this.currentNotification.parentNode.removeChild(this.currentNotification)
    }
    this.currentNotification = null
    this.isShowing = false
  }
}

// Create singleton instance
const notificationService = new NotificationService()

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = notificationService
}

// Also expose globally for browser usage
if (typeof window !== 'undefined') {
  window.NotificationService = notificationService
}
