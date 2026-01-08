/**
 * UnifiedUpdateLoop
 *
 * Performance optimization: Consolidates multiple setInterval timers into a single
 * requestAnimationFrame-based update loop. This reduces GC pressure and timer
 * competition on the main thread, critical for Windows + Chrome audio stability.
 *
 * Benefits:
 * - Single animation frame callback instead of 40-60 timer callbacks/sec
 * - Reduced closure allocations (less GC pressure)
 * - Better Chrome timer coalescing
 * - Automatic frame budget management
 *
 * Usage:
 *   const loop = UnifiedUpdateLoop.getInstance()
 *   loop.register('lfo', (dt) => { updateLFO(dt) }, 30) // 30Hz
 *   loop.register('drone', (dt) => { updateDrone(dt) }, 10) // 10Hz
 *   loop.start()
 */
class UnifiedUpdateLoop {
  static instance = null

  /**
   * Get singleton instance
   * @returns {UnifiedUpdateLoop}
   */
  static getInstance() {
    if (!UnifiedUpdateLoop.instance) {
      UnifiedUpdateLoop.instance = new UnifiedUpdateLoop()
    }
    return UnifiedUpdateLoop.instance
  }

  constructor() {
    // Registered callbacks with their target frequencies
    this.callbacks = new Map() // id -> { callback, targetHz, lastCall, interval }

    // Animation frame state
    this.rafId = null
    this.isRunning = false
    this.lastTime = 0

    // Performance tracking
    this.frameCount = 0
    this.lastFpsTime = 0
    this.currentFps = 60

    // Frame budget (16.67ms for 60fps, but we aim for 30Hz updates)
    this.maxFrameTime = 33.33 // 30fps target for updates

    // Bind the loop function once to avoid creating new closures
    this._boundLoop = this._loop.bind(this)
  }

  /**
   * Register a callback for periodic updates
   * @param {string} id - Unique identifier for this callback
   * @param {Function} callback - Function to call with delta time (seconds)
   * @param {number} targetHz - Target frequency in Hz (default 30)
   */
  register(id, callback, targetHz = 30) {
    if (typeof callback !== 'function') {
      console.warn(`UnifiedUpdateLoop: Invalid callback for ${id}`)
      return
    }

    this.callbacks.set(id, {
      callback,
      targetHz: Math.max(1, Math.min(60, targetHz)), // Clamp 1-60Hz
      lastCall: 0,
      interval: 1000 / targetHz
    })

    // console.log(`UnifiedUpdateLoop: Registered '${id}' at ${targetHz}Hz`)
  }

  /**
   * Unregister a callback
   * @param {string} id - Callback identifier
   */
  unregister(id) {
    if (this.callbacks.has(id)) {
      this.callbacks.delete(id)
      // console.log(`UnifiedUpdateLoop: Unregistered '${id}'`)
    }
  }

  /**
   * Check if a callback is registered
   * @param {string} id - Callback identifier
   * @returns {boolean}
   */
  has(id) {
    return this.callbacks.has(id)
  }

  /**
   * Start the unified update loop
   */
  start() {
    if (this.isRunning) return

    this.isRunning = true
    this.lastTime = performance.now()
    this.lastFpsTime = this.lastTime
    this.frameCount = 0

    // Use requestAnimationFrame for optimal browser scheduling
    this.rafId = requestAnimationFrame(this._boundLoop)

    console.log(`UnifiedUpdateLoop: Started with ${this.callbacks.size} callbacks`)
  }

  /**
   * Stop the unified update loop
   */
  stop() {
    if (!this.isRunning) return

    this.isRunning = false

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    console.log('UnifiedUpdateLoop: Stopped')
  }

  /**
   * Main loop function - called by requestAnimationFrame
   * @param {number} timestamp - High-resolution timestamp from rAF
   */
  _loop(timestamp) {
    if (!this.isRunning) return

    // Calculate delta time in milliseconds
    const deltaMs = timestamp - this.lastTime
    this.lastTime = timestamp

    // Update FPS tracking every second
    this.frameCount++
    if (timestamp - this.lastFpsTime >= 1000) {
      this.currentFps = this.frameCount
      this.frameCount = 0
      this.lastFpsTime = timestamp
    }

    // Process all registered callbacks based on their target frequency
    for (const [id, entry] of this.callbacks) {
      const timeSinceLastCall = timestamp - entry.lastCall

      // Only call if enough time has passed for this callback's frequency
      if (timeSinceLastCall >= entry.interval) {
        try {
          // Pass delta time in seconds for consistency with existing code
          const dtSeconds = timeSinceLastCall / 1000
          entry.callback(dtSeconds)
          entry.lastCall = timestamp
        } catch (error) {
          console.warn(`UnifiedUpdateLoop: Error in callback '${id}':`, error.message)
        }
      }
    }

    // Schedule next frame
    this.rafId = requestAnimationFrame(this._boundLoop)
  }

  /**
   * Get current FPS
   * @returns {number}
   */
  getFps() {
    return this.currentFps
  }

  /**
   * Get number of registered callbacks
   * @returns {number}
   */
  getCallbackCount() {
    return this.callbacks.size
  }

  /**
   * Get debug info
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      isRunning: this.isRunning,
      fps: this.currentFps,
      callbackCount: this.callbacks.size,
      callbacks: Array.from(this.callbacks.keys())
    }
  }

  /**
   * Dispose and cleanup
   */
  dispose() {
    this.stop()
    this.callbacks.clear()
    UnifiedUpdateLoop.instance = null
    console.log('UnifiedUpdateLoop: Disposed')
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.UnifiedUpdateLoop = UnifiedUpdateLoop
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnifiedUpdateLoop
}
