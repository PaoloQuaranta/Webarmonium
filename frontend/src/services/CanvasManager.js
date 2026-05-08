/**
 * CanvasManager
 * Single-responsibility component for canvas setup and lifecycle management
 * Extracted from WebarmoniumApp (main.js) as part of Sprint 2 modularization
 *
 * Responsibilities:
 * - gestureCanvas initialization as input-only overlay (no 2D rendering)
 * - PixiJS renderer resize coordination
 * - Window resize event handling
 * - Cleanup on destroy
 */

class CanvasManager {
  /**
   * @param {string} canvasId - Main gesture canvas ID (input-only overlay)
   * @param {string} overlayId - Cursor overlay canvas ID (deprecated, kept for compat)
   * @param {string} p5ContainerId - PixiJS container div ID
   */
  constructor(canvasId = 'gestureCanvas', overlayId = 'cursorOverlay', p5ContainerId = 'p5-container') {
    this.canvasId = canvasId
    this.overlayId = overlayId
    this.p5ContainerId = p5ContainerId

    // Canvas references
    this.canvas = null
    this.ctx = null  // Legacy compat — null after Step 9 (trail rendering moved to PixiJS)
    this.cursorOverlayCanvas = null
    this.p5Container = null

    // PixiAdapter reference for resize coordination
    this.pixiAdapter = null

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
    // Get main gesture canvas (input-only overlay — pointer events target)
    this.canvas = document.getElementById(this.canvasId)
    if (!this.canvas) {
      throw new Error(`Canvas element #${this.canvasId} not found`)
    }

    // Step 9: No 2D context needed — trail rendering migrated to PixiJS
    // gestureCanvas is now purely an input-event overlay
    this.ctx = null

    // Cursor overlay is deprecated/removed
    this.cursorOverlayCanvas = document.getElementById(this.overlayId) || null

    // Get PixiJS container
    this.p5Container = document.getElementById(this.p5ContainerId)

    // Initial resize
    this.resize()

    // Setup resize listener
    this.boundResizeHandler = () => this.resize()
    window.addEventListener('resize', this.boundResizeHandler)

    // Chrome mobile: URL bar show/hide fires visualViewport resize, not window resize
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.boundResizeHandler)
    }

    return this.getCanvasRefs()
  }

  /**
   * Set the PixiAdapter for resize coordination
   * @param {PixiAdapter} adapter
   */
  setPixiAdapter(adapter) {
    this.pixiAdapter = adapter
  }

  /**
   * Resize canvases to match viewport.
   * Skipped when window.__webarmoniumRecording is truthy — the in-page recorder
   * controls canvas dimensions during a capture session and a window resize would
   * stomp the target resolution mid-recording.
   */
  resize() {
    if (!this.canvas) return
    if (typeof window !== 'undefined' && window.__webarmoniumRecording) return

    const devicePixelRatio = window.devicePixelRatio || 1
    const width = window.innerWidth
    const height = window.innerHeight

    // Resize gestureCanvas (input-only overlay — no 2D rendering)
    this.canvas.width = width * devicePixelRatio
    this.canvas.height = height * devicePixelRatio
    this.canvas.style.width = width + 'px'
    this.canvas.style.height = height + 'px'

    // Resize PixiJS renderer if available
    if (this.pixiAdapter && this.pixiAdapter.app) {
      this.pixiAdapter.resize(width, height)
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
        // silent
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
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', this.boundResizeHandler)
      }
      this.boundResizeHandler = null
    }

    this.resizeListeners = []
    this.canvas = null
    this.ctx = null
    this.cursorOverlayCanvas = null
    this.p5Container = null
    this.pixiAdapter = null
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
