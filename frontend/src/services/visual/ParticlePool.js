/**
 * ParticlePool.js
 * Object pool for particle reuse - reduces GC pressure and allocation overhead
 *
 * Benefits:
 * - Pre-allocated particle objects avoid runtime allocation
 * - Reuse existing objects instead of creating new ones
 * - Reduces garbage collection pauses during animation
 */

class ParticlePool {
  /**
   * Create a particle pool
   * @param {number} initialSize - Number of particles to pre-allocate
   * @param {number} maxSize - Maximum pool size (prevents unbounded growth)
   */
  constructor(initialSize = 60, maxSize = 150) {
    this.pool = []
    this.activeCount = 0
    this.maxSize = maxSize

    // Pre-allocate particles
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this._createEmptyParticle())
    }
  }

  /**
   * Create an empty particle object with all required properties
   * @returns {Object} Empty particle object
   * @private
   */
  _createEmptyParticle() {
    return {
      id: null,
      edge: null,
      progress: 0,
      speed: 0,
      size: 0,
      color: null,
      life: 0,
      createdAt: 0,
      waveContext: null,
      hopCount: 0,
      shouldCascade: false,
      isReverse: false,
      destinationNodeId: null,
      _inUse: false  // Pool tracking flag
    }
  }

  /**
   * Acquire a particle from the pool
   * Returns an unused particle or creates a new one if pool is exhausted
   * @returns {Object|null} Particle object ready for use, or null if max size reached
   */
  acquire() {
    // Search for an unused particle
    for (const particle of this.pool) {
      if (!particle._inUse) {
        particle._inUse = true
        this.activeCount++
        return particle
      }
    }

    // Pool exhausted - check if we can grow
    if (this.pool.length >= this.maxSize) {
      // console.warn('ParticlePool exhausted at max size', this.maxSize)
      return null
    }

    // Create new particle (under limit)
    const newParticle = this._createEmptyParticle()
    newParticle._inUse = true
    this.pool.push(newParticle)
    this.activeCount++
    return newParticle
  }

  /**
   * Release a particle back to the pool for reuse
   * @param {Object} particle - Particle to release
   */
  release(particle) {
    if (!particle._inUse) {
      return // Already released
    }

    // Reset particle state for reuse
    particle._inUse = false
    particle.id = null
    particle.edge = null
    particle.waveContext = null
    particle.destinationNodeId = null
    particle.color = null
    this.activeCount--
  }

  /**
   * Get the number of currently active (in-use) particles
   * @returns {number} Active particle count
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
   * Clear all particles (for cleanup/disposal)
   */
  clear() {
    for (const particle of this.pool) {
      particle._inUse = false
    }
    this.activeCount = 0
  }
}

// Export for browser and Node.js
if (typeof window !== 'undefined') {
  window.ParticlePool = ParticlePool
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParticlePool
}
