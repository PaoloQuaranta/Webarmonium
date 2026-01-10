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
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Valid HTMLCanvasElement is required')
    }

    this.canvas = canvas
    this.ctx = canvas.getContext('2d')

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

  /**
   * Render all cursors at 60fps
   * Starts continuous rendering loop
   */
  renderCursors () {
    // CRITICAL: Check if rendering should continue BEFORE processing
    if (!this.animationFrameId) {
      // console.log('CursorManager: Rendering stopped (no animationFrameId)')
      return
    }

    const now = performance.now()
    const elapsed = now - this.lastRenderTime

    // Throttle to 60fps (skip if called too soon)
    if (elapsed < this.frameTime) {
      this.animationFrameId = requestAnimationFrame(() => this.renderCursors())
      return
    }

    this.lastRenderTime = now

    // Process fade animations
    this._processFadeAnimations()

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Render each cursor
    this.cursors.forEach((cursor, userId) => {
      this.renderSingleCursor(cursor, userId)
    })

    // Continue rendering loop only if still active
    if (this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(() => this.renderCursors())
    }
  }

  /**
   * Render a single cursor
   * @param {Object} cursor - Cursor data {x, y, color, isDrawing, isVirtual, alpha}
   * @param {string} userId - User ID (for label)
   */
  renderSingleCursor (cursor, userId) {
    const { x, y, color, isDrawing, isVirtual, alpha } = cursor

    // Convert normalized coordinates (0-1) to canvas pixel coordinates
    // Account for devicePixelRatio since canvas.width includes it
    const pixelX = x * this.canvas.width
    const pixelY = y * this.canvas.height

    // Set alpha transparency - use cursor's alpha for virtual cursors (for fade animations)
    const cursorAlphaValue = isVirtual && alpha !== undefined ? alpha : this.cursorAlpha
    this.ctx.globalAlpha = cursorAlphaValue

    // Skip rendering if fully transparent
    if (cursorAlphaValue <= 0) return

    // Determine cursor size based on state (virtual and remote use same size)
    let size
    if (isDrawing) {
      size = this.drawingCursorSize
    } else {
      size = this.cursorSize // Same size for real and virtual cursors
    }

    // Draw cursor circle - dashed for virtual cursors
    this.ctx.beginPath()
    this.ctx.arc(pixelX, pixelY, size, 0, Math.PI * 2)
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = this.cursorLineWidth

    const dpr = window.devicePixelRatio || 1
    if (isVirtual) {
      this.ctx.setLineDash([6 * dpr, 4 * dpr]) // Dashed line for virtual, scaled
    } else {
      this.ctx.setLineDash([]) // Solid line for real users
    }
    this.ctx.stroke()
    this.ctx.setLineDash([]) // Reset to solid

    // Fill if drawing
    if (isDrawing) {
      this.ctx.fillStyle = color
      this.ctx.fill()
    }

    // Draw crosshair
    this.drawCrosshair(pixelX, pixelY, color, size + 6 * dpr)

    // Draw user label - show source name for virtual cursors
    const label = isVirtual
      ? userId.replace('-metrics', '') // e.g., 'wikipedia', 'hackernews'
      : userId.substring(0, 8)
    this.drawUserLabel(pixelX, pixelY + size + 20 * dpr, label, color)

    // Reset alpha
    this.ctx.globalAlpha = 1.0
  }

  /**
   * Draw crosshair around cursor
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} color - Color
   * @param {number} size - Crosshair size
   */
  drawCrosshair (x, y, color, size) {
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = 1

    // Horizontal line
    this.ctx.beginPath()
    this.ctx.moveTo(x - size, y)
    this.ctx.lineTo(x + size, y)
    this.ctx.stroke()

    // Vertical line
    this.ctx.beginPath()
    this.ctx.moveTo(x, y - size)
    this.ctx.lineTo(x, y + size)
    this.ctx.stroke()
  }

  /**
   * Draw user label near cursor
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} label - Label text
   * @param {string} color - Color
   */
  drawUserLabel (x, y, label, color) {
    this.ctx.font = '12px sans-serif'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'top'

    // Draw background rectangle
    const metrics = this.ctx.measureText(label)
    const padding = 4
    const rectWidth = metrics.width + padding * 2
    const rectHeight = 16

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    this.ctx.fillRect(
      x - rectWidth / 2,
      y,
      rectWidth,
      rectHeight
    )

    // Draw text
    this.ctx.fillStyle = color
    this.ctx.fillText(label, x, y + 2)
  }

  /**
   * Start rendering loop
   */
  startRendering () {
    if (!this.animationFrameId) {
      // console.log('🖱️  CursorManager: Starting rendering loop')
      this.lastRenderTime = performance.now()
      // CRITICAL FIX: Set animationFrameId to a truthy value before calling renderCursors
      // This ensures renderCursors doesn't exit immediately on the animationFrameId check
      this.animationFrameId = true
      this.animationFrameId = requestAnimationFrame(() => this.renderCursors())
    }

    // Start stale cursor cleanup (check every 10 seconds)
    if (!this.staleCheckInterval) {
      this.staleCheckInterval = setInterval(() => {
        const removed = this.removeStale(5000)
        if (removed > 0) {
          // console.log(`CursorManager: Removed ${removed} stale cursors`)
        }
      }, 10000)
    }
  }

  /**
   * Stop rendering loop
   */
  stopRendering () {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }

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
    this.stopRendering()
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
