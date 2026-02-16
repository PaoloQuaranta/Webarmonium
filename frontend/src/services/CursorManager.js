/**
 * CursorManager Service
 * Manages multi-user cursor rendering and tracking
 * Constitutional requirement: 60fps rendering, <100ms UI latency
 */
class CursorManager {
  /**
   * @param {HTMLCanvasElement} canvas - Canvas element for cursor overlay
   */
  constructor (canvas) {
    // Canvas is optional — cursor rendering migrated to PixiJS SpringMeshNetwork
    // CursorManager now only handles data tracking (position, fade state)
    this.canvas = canvas || null
    this.ctx = canvas ? canvas.getContext('2d') : null

    // Map of userId -> cursor data {x, y, color, isDrawing, timestamp, isVirtual, alpha}
    this.cursors = new Map()

    // Virtual cursor tracking
    this.virtualCursors = new Set() // Set of virtual cursor userIds
    this.virtualCursorsBlocked = false // FIX: Block all virtual cursor operations after deactivation

    // Rendering settings - account for devicePixelRatio
    const dpr = window.devicePixelRatio || 1
    this.cursorSize = 10 * dpr // Cursor circle radius
    this.cursorLineWidth = 2 * dpr
    this.drawingCursorSize = 8 * dpr // Smaller when drawing
    this.cursorAlpha = 0.8
    this.virtualCursorAlpha = 0.7 // Slightly more transparent for virtual

    // Fade animation settings
    this.fadeAnimations = new Map() // userId -> { direction: 'in'|'out', startTime, duration, onComplete }
    this.fadeDuration = 500 // 500ms fade animation

    // Performance tracking
    this.lastRenderTime = 0
    this.targetFps = 60
    this.frameTime = 1000 / this.targetFps // ~16.67ms

    // Animation frame ID
    this.animationFrameId = null

    // Stale cursor cleanup interval
    this.staleCheckInterval = null
  }

  /**
   * Update cursor position for a user
   * @param {string} userId - User ID
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} color - User's assigned color
   * @param {boolean} isDrawing - Whether user is currently drawing
   */
  updateCursor (userId, x, y, color, isDrawing = false) {
    // console.log(`👆 CursorManager.updateCursor called - userId: ${userId?.substring(0,8)}, x: ${x}, y: ${y}, color: ${color}`)

    if (!userId || typeof userId !== 'string') {
      if (window.ErrorReporter) {
        window.ErrorReporter.warn('CursorManager', 'Invalid userId', userId)
      } else {
        // console.warn('CursorManager: Invalid userId', userId)
      }
      return
    }

    if (typeof x !== 'number' || typeof y !== 'number') {
      if (window.ErrorReporter) {
        window.ErrorReporter.warn('CursorManager', 'Invalid coordinates', { x, y })
      } else {
        // console.warn('CursorManager: Invalid coordinates', { x, y })
      }
      return
    }

    if (!this.isValidColor(color)) {
      if (window.ErrorReporter) {
        window.ErrorReporter.warn('CursorManager', 'Invalid color format', color)
      } else {
        // console.warn('CursorManager: Invalid color format', color)
      }
      return
    }

    this.cursors.set(userId, {
      x,
      y,
      color,
      isDrawing,
      timestamp: Date.now()
    })

    // console.log(`✅ Cursor updated! Total cursors: ${this.cursors.size}`)
  }

  /**
   * Remove cursor for a user
   * @param {string} userId - User ID
   * @returns {boolean} True if cursor was removed
   */
  removeCursor (userId) {
    return this.cursors.delete(userId)
  }

  /**
   * Get cursor data for a user
   * @param {string} userId - User ID
   * @returns {Object|null} Cursor data or null
   */
  getCursor (userId) {
    return this.cursors.get(userId) || null
  }

  /**
   * Get all active cursors
   * @returns {Map} Map of userId -> cursor data
   */
  getAllCursors () {
    return new Map(this.cursors)
  }

  /**
   * Clear all cursors
   */
  clearAll () {
    this.cursors.clear()
    this.virtualCursors.clear()
    this.fadeAnimations.clear()
    this.virtualCursorsBlocked = false // Reset block state
  }

  /**
   * Add a virtual cursor with optional fade-in animation
   * @param {string} userId - Virtual user ID
   * @param {string} color - Cursor color
   * @param {boolean} fadeIn - Whether to fade in
   */
  addVirtualCursor (userId, color, fadeIn = true) {
    // FIX: Block if virtual cursors were deactivated
    if (this.virtualCursorsBlocked) {
      return
    }

    const cursor = {
      x: 0.5,
      y: 0.5,
      color,
      isDrawing: false,
      isVirtual: true,
      alpha: fadeIn ? 0 : this.virtualCursorAlpha,
      timestamp: Date.now()
    }

    this.cursors.set(userId, cursor)
    this.virtualCursors.add(userId)

    if (fadeIn) {
      this.fadeAnimations.set(userId, {
        direction: 'in',
        startTime: performance.now(),
        duration: this.fadeDuration,
        targetAlpha: this.virtualCursorAlpha,
        onComplete: null
      })
    }
  }

  /**
   * Remove a virtual cursor with optional fade-out animation
   * @param {string} userId - Virtual user ID
   * @param {boolean} fadeOut - Whether to fade out
   */
  removeVirtualCursor (userId, fadeOut = true) {
    if (!this.virtualCursors.has(userId)) return

    if (fadeOut) {
      const cursor = this.cursors.get(userId)
      if (cursor) {
        this.fadeAnimations.set(userId, {
          direction: 'out',
          startTime: performance.now(),
          duration: this.fadeDuration,
          startAlpha: cursor.alpha,
          onComplete: () => {
            this.cursors.delete(userId)
            this.virtualCursors.delete(userId)
          }
        })
      }
    } else {
      this.cursors.delete(userId)
      this.virtualCursors.delete(userId)
    }
  }

  /**
   * Remove all virtual cursors with optional fade-out
   * FIX: Always removes immediately (no fade) to prevent race conditions
   * @param {boolean} fadeOut - Ignored, always removes immediately
   */
  removeAllVirtualCursors (fadeOut = true) {
    // FIX: Block all future virtual cursor operations
    this.virtualCursorsBlocked = true

    // FIX: Remove immediately (no fade) to prevent race conditions with late events
    for (const userId of this.virtualCursors) {
      this.cursors.delete(userId)
      this.fadeAnimations.delete(userId)
    }
    this.virtualCursors.clear()
  }

  /**
   * Enable virtual cursors (unblock after deactivation)
   * Call this before adding new virtual cursors
   */
  enableVirtualCursors () {
    this.virtualCursorsBlocked = false
  }

  /**
   * Update virtual cursor position
   * @param {string} userId - Virtual user ID
   * @param {number} x - X coordinate (0-1)
   * @param {number} y - Y coordinate (0-1)
   */
  updateVirtualCursor (userId, x, y) {
    // FIX: Block if virtual cursors were deactivated
    if (this.virtualCursorsBlocked) {
      return
    }

    const cursor = this.cursors.get(userId)
    if (cursor && cursor.isVirtual) {
      cursor.x = x
      cursor.y = y
      cursor.timestamp = Date.now()
    }
  }

  /**
   * Check if a cursor is virtual
   * @param {string} userId - User ID
   * @returns {boolean}
   */
  isVirtualCursor (userId) {
    return this.virtualCursors.has(userId)
  }

  /**
   * Get count of virtual cursors
   * @returns {number}
   */
  getVirtualCursorCount () {
    return this.virtualCursors.size
  }

  /**
   * Process fade animations
   * Called during render loop
   * @private
   */
  _processFadeAnimations () {
    const now = performance.now()

    for (const [userId, anim] of this.fadeAnimations) {
      const cursor = this.cursors.get(userId)
      if (!cursor) {
        this.fadeAnimations.delete(userId)
        continue
      }

      const elapsed = now - anim.startTime
      const progress = Math.min(1, elapsed / anim.duration)

      if (anim.direction === 'in') {
        cursor.alpha = progress * anim.targetAlpha
      } else {
        cursor.alpha = anim.startAlpha * (1 - progress)
      }

      if (progress >= 1) {
        this.fadeAnimations.delete(userId)
        if (anim.onComplete) {
          anim.onComplete()
        }
      }
    }
  }

  // REMOVED: Rendering methods - cursors now rendered in p5.js SpringMeshNetwork
  // Kept for reference: renderCursors, renderSingleCursor, drawCrosshair, drawUserLabel, startRendering, stopRendering
  // See commit history for original implementation

  /**
   * Remove stale cursors (older than timeout)
   * @param {number} timeout - Timeout in ms (default: 5000)
   * @returns {number} Number of cursors removed
   */
  removeStale (timeout = 5000) {
    const now = Date.now()
    let removed = 0

    this.cursors.forEach((cursor, userId) => {
      if (now - cursor.timestamp > timeout) {
        this.cursors.delete(userId)
        removed++
      }
    })

    return removed
  }

  /**
   * Validate color format (hex: #rrggbb)
   * @param {string} color - Color string
   * @returns {boolean} True if valid
   */
  isValidColor (color) {
    return typeof color === 'string' && /^#[0-9a-f]{6}$/.test(color)
  }

  /**
   * Set canvas size (for responsive resize)
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   */
  setCanvasSize (width, height) {
    this.canvas.width = width
    this.canvas.height = height
  }

  /**
   * Get active cursor count
   * @returns {number} Number of active cursors
   */
  getCursorCount () {
    return this.cursors.size
  }

  /**
   * Get rendering statistics
   * @returns {Object} Stats object
   */
  getStats () {
    return {
      activeCursors: this.cursors.size,
      targetFps: this.targetFps,
      frameTime: this.frameTime,
      isRendering: this.animationFrameId !== null,
      cursorSize: this.cursorSize,
      drawingCursorSize: this.drawingCursorSize,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height
    }
  }

  /**
   * Cleanup and destroy
   */
  destroy () {
    // console.log('CursorManager: Destroying instance')
    this.clearAll()

    // Clear stale check interval
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval)
      this.staleCheckInterval = null
    }

    // Nullify references to prevent memory leaks
    this.canvas = null
    this.ctx = null
    this.cursors = null
  }
}

// Export for use in browser and Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CursorManager
}
