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

    // Map of userId -> cursor data {x, y, color, isDrawing, timestamp}
    this.cursors = new Map()

    // Rendering settings
    this.cursorSize = 12 // Cursor circle radius
    this.cursorLineWidth = 2
    this.drawingCursorSize = 8 // Smaller when drawing
    this.cursorAlpha = 0.8

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
    console.log(`👆 CursorManager.updateCursor called - userId: ${userId?.substring(0,8)}, x: ${x}, y: ${y}, color: ${color}`)

    if (!userId || typeof userId !== 'string') {
      if (window.ErrorReporter) {
        window.ErrorReporter.warn('CursorManager', 'Invalid userId', userId)
      } else {
        console.warn('CursorManager: Invalid userId', userId)
      }
      return
    }

    if (typeof x !== 'number' || typeof y !== 'number') {
      if (window.ErrorReporter) {
        window.ErrorReporter.warn('CursorManager', 'Invalid coordinates', { x, y })
      } else {
        console.warn('CursorManager: Invalid coordinates', { x, y })
      }
      return
    }

    if (!this.isValidColor(color)) {
      if (window.ErrorReporter) {
        window.ErrorReporter.warn('CursorManager', 'Invalid color format', color)
      } else {
        console.warn('CursorManager: Invalid color format', color)
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

    console.log(`✅ Cursor updated! Total cursors: ${this.cursors.size}`)
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
  }

  /**
   * Render all cursors at 60fps
   * Starts continuous rendering loop
   */
  renderCursors () {
    // CRITICAL: Check if rendering should continue BEFORE processing
    if (!this.animationFrameId) {
      console.log('CursorManager: Rendering stopped (no animationFrameId)')
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

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Render each cursor
    if (this.cursors.size > 0) {
      console.log(`🖱️  Rendering ${this.cursors.size} cursor(s)`)
    }
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
   * @param {Object} cursor - Cursor data {x, y, color, isDrawing}
   * @param {string} userId - User ID (for label)
   */
  renderSingleCursor (cursor, userId) {
    const { x, y, color, isDrawing } = cursor

    // Set alpha transparency
    this.ctx.globalAlpha = this.cursorAlpha

    // Determine cursor size based on drawing state
    const size = isDrawing ? this.drawingCursorSize : this.cursorSize

    // Draw cursor circle
    this.ctx.beginPath()
    this.ctx.arc(x, y, size, 0, Math.PI * 2)
    this.ctx.strokeStyle = color
    this.ctx.lineWidth = this.cursorLineWidth
    this.ctx.stroke()

    // Fill if drawing
    if (isDrawing) {
      this.ctx.fillStyle = color
      this.ctx.fill()
    }

    // Draw crosshair
    this.drawCrosshair(x, y, color, size + 4)

    // Draw user label (first 8 chars of userId)
    this.drawUserLabel(x, y + size + 15, userId.substring(0, 8), color)

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
      this.lastRenderTime = performance.now()
      this.renderCursors()
    }

    // Start stale cursor cleanup (check every 10 seconds)
    if (!this.staleCheckInterval) {
      this.staleCheckInterval = setInterval(() => {
        const removed = this.removeStale(5000)
        if (removed > 0) {
          console.log(`CursorManager: Removed ${removed} stale cursors`)
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
    console.log('CursorManager: Destroying instance')
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
