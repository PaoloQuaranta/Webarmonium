/**
 * CanvasManager
 * Single-responsibility component for canvas setup and lifecycle management
 * Extracted from WebarmoniumApp (main.js) as part of Sprint 2 modularization
 *
 * Responsibilities:
 * - Canvas initialization and DOM setup
 * - Canvas resizing with device pixel ratio handling
 * - Overlay canvas management (for multi-user cursors)
 * - Window resize event handling
 * - Cleanup on destroy
 */

class CanvasManager {
  /**
   * @param {string} canvasId - Main gesture canvas ID
   * @param {string} overlayId - Cursor overlay canvas ID
   * @param {string} p5ContainerId - p5.js container div ID
   */
  constructor(canvasId = 'gestureCanvas', overlayId = 'cursorOverlay', p5ContainerId = 'p5-container') {
    this.canvasId = canvasId
    this.overlayId = overlayId
    this.p5ContainerId = p5ContainerId

    // Canvas references
    this.canvas = null
    this.ctx = null
    this.cursorOverlayCanvas = null
    this.p5Container = null

    // Resize handler reference for cleanup
    this.boundResizeHandler = null

    // Services to notify on resize
    this.resizeListeners = []
  }

  /**
   * Initialize and setup canvases
   * @returns {Object} Canvas references {canvas, ctx, cursorOverlayCanvas}
   */
  setup() {
    // Get main gesture canvas
    this.canvas = document.getElementById(this.canvasId)
    if (!this.canvas) {
      throw new Error(`Canvas element #${this.canvasId} not found`)
    }

    this.ctx = this.canvas.getContext('2d')

    // Create or get cursor overlay canvas
    this.cursorOverlayCanvas = document.getElementById(this.overlayId)
    if (!this.cursorOverlayCanvas) {
      this.cursorOverlayCanvas = this.createOverlayCanvas()
    }

    // Get p5.js container
    this.p5Container = document.getElementById(this.p5ContainerId)
    if (!this.p5Container) {
      console.warn(`CanvasManager: p5.js container #${this.p5ContainerId} not found`)
    }

    // Initial resize
    this.resize()

    // Setup resize listener
    this.boundResizeHandler = () => this.resize()
    window.addEventListener('resize', this.boundResizeHandler)

    console.log('✅ CanvasManager: Canvases initialized')

    return this.getCanvasRefs()
  }

  /**
   * Create overlay canvas for multi-user cursors
   * @private
   * @returns {HTMLCanvasElement} Created overlay canvas
   */
  createOverlayCanvas() {
    const overlay = document.createElement('canvas')
    overlay.id = this.overlayId
    overlay.style.position = 'absolute'
    overlay.style.top = '0'
    overlay.style.left = '0'
    overlay.style.pointerEvents = 'none'
    overlay.style.zIndex = '10'

    this.canvas.parentElement.appendChild(overlay)

    return overlay
  }

  /**
   * Resize canvases to match viewport with device pixel ratio
   */
  resize() {
    if (!this.canvas) return

    const devicePixelRatio = window.devicePixelRatio || 1
    const width = window.innerWidth
    const height = window.innerHeight

    // Resize main canvas
    this.canvas.width = width * devicePixelRatio
    this.canvas.height = height * devicePixelRatio
    this.canvas.style.width = width + 'px'
    this.canvas.style.height = height + 'px'
    this.ctx.scale(devicePixelRatio, devicePixelRatio)

    // Resize cursor overlay canvas
    if (this.cursorOverlayCanvas) {
      this.cursorOverlayCanvas.width = width * devicePixelRatio
      this.cursorOverlayCanvas.height = height * devicePixelRatio
      this.cursorOverlayCanvas.style.width = width + 'px'
      this.cursorOverlayCanvas.style.height = height + 'px'
    }

    // Notify registered listeners (services that need to know about resize)
    this.notifyResizeListeners(width * devicePixelRatio, height * devicePixelRatio)
  }

  /**
   * Register a service to be notified on canvas resize
   * @param {Object} service - Service with setCanvasSize(width, height) method
   */
  addResizeListener(service) {
    if (service && typeof service.setCanvasSize === 'function') {
      this.resizeListeners.push(service)
    }
  }

  /**
   * Notify all registered services about canvas size change
   * @private
   * @param {number} width - New canvas width
   * @param {number} height - New canvas height
   */
  notifyResizeListeners(width, height) {
    this.resizeListeners.forEach(service => {
      try {
        service.setCanvasSize(width, height)
      } catch (error) {
        console.warn('CanvasManager: Error notifying resize listener:', error)
      }
    })
  }

  /**
   * Get canvas references
   * @returns {Object} {canvas, ctx, cursorOverlayCanvas, p5Container}
   */
  getCanvasRefs() {
    return {
      canvas: this.canvas,
      ctx: this.ctx,
      cursorOverlayCanvas: this.cursorOverlayCanvas,
      p5Container: this.p5Container
    }
  }

  /**
   * Get current canvas dimensions
   * @returns {Object} {width, height, devicePixelRatio}
   */
  getDimensions() {
    const dpr = window.devicePixelRatio || 1
    return {
      width: window.innerWidth * dpr,
      height: window.innerHeight * dpr,
      devicePixelRatio: dpr,
      logicalWidth: window.innerWidth,
      logicalHeight: window.innerHeight
    }
  }

  /**
   * Cleanup: remove event listeners and references
   */
  destroy() {
    if (this.boundResizeHandler) {
      window.removeEventListener('resize', this.boundResizeHandler)
      this.boundResizeHandler = null
    }

    this.resizeListeners = []
    this.canvas = null
    this.ctx = null
    this.cursorOverlayCanvas = null
    this.p5Container = null

    console.log('✅ CanvasManager: Cleaned up')
  }
}

// Make CanvasManager available globally
if (typeof window !== 'undefined') {
  window.CanvasManager = CanvasManager
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CanvasManager
}
