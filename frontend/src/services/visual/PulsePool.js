/**
 * PulsePool.js
 * Object pool for pulse reuse - reduces GC pressure and allocation overhead
 *
 * Benefits:
 * - Pre-allocated pulse objects avoid runtime allocation
 * - Reuse existing objects instead of creating new ones
 * - Reduces garbage collection pauses during animation
 */

class PulsePool {
  /**
   * Create a pulse pool
   * @param {number} initialSize - Number of pulses to pre-allocate
   * @param {number} maxSize - Maximum pool size (prevents unbounded growth)
   */
  constructor(initialSize = 30, maxSize = 60) {
    this.pool = []
    this.activeCount = 0
    this.maxSize = maxSize

    // Pre-allocate pulses
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this._createEmptyPulse())
    }
  }

  /**
   * Create an empty pulse object with all required properties
   * @returns {Object} Empty pulse object
   * @private
   */
  _createEmptyPulse() {
    return {
      id: null,
      edge: null,
      progress: 0,
      speed: 0,
      intensity: 0,
      color: null,
      width: 0,
      createdAt: 0,
      waveContext: null,
      hopCount: 0,
      isReverse: false,
      destinationNodeId: null,
      _inUse: false  // Pool tracking flag
    }
  }

  /**
   * Acquire a pulse from the pool
   * Returns an unused pulse or creates a new one if pool is exhausted
   * @returns {Object|null} Pulse object ready for use, or null if max size reached
   */
  acquire() {
    // Search for an unused pulse
    for (const pulse of this.pool) {
      if (!pulse._inUse) {
        pulse._inUse = true
        this.activeCount++
        return pulse
      }
    }

    // Pool exhausted - check if we can grow
    if (this.pool.length >= this.maxSize) {
      // console.warn('PulsePool exhausted at max size', this.maxSize)
      return null
    }

    // Create new pulse (under limit)
    const newPulse = this._createEmptyPulse()
    newPulse._inUse = true
    this.pool.push(newPulse)
    this.activeCount++
    return newPulse
  }

  /**
   * Release a pulse back to the pool for reuse
   * @param {Object} pulse - Pulse to release
   */
  release(pulse) {
    if (!pulse._inUse) {
      return // Already released
    }

    // Reset pulse state for reuse
    pulse._inUse = false
    pulse.id = null
    pulse.edge = null
    pulse.waveContext = null
    pulse.destinationNodeId = null
    pulse.color = null
    this.activeCount--
  }

  /**
   * Get the number of currently active (in-use) pulses
   * @returns {number} Active pulse count
   */
  getActiveCount() {
    return this.activeCount
  }

  /**
   * Get the total pool size (active + available)
   * @returns {number} Total pool size
   */
  getPoolSize() {
    return this.pool.length
  }

  /**
   * Clear all pulses (for cleanup/disposal)
   */
  clear() {
    for (const pulse of this.pool) {
      pulse._inUse = false
    }
    this.activeCount = 0
  }
}

// Export for browser and Node.js
if (typeof window !== 'undefined') {
  window.PulsePool = PulsePool
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PulsePool
}
