/**
 * PrecomputedAttractorSystem
 * Strange attractors (Lorenz + Rossler) with precomputed keyframes for performance
 *
 * Instead of calculating 72,000+ differential equations per frame, we:
 * 1. Precompute ~90 keyframes at initialization
 * 2. Store ~500 point positions per frame
 * 3. Interpolate between keyframes at runtime
 *
 * Result: From ~72,000 calc/frame → ~500 lookups + interpolations
 *
 * Musical reactivity:
 * - Lorenz ↔ Rossler switch on phrase changes
 * - Loop speed changes with beat intensity
 * - Color inherits from nebula palette
 */

class PrecomputedAttractorSystem {
  constructor() {
    // Configuration
    this.pointCount = 500
    this.frameCount = 90  // ~1.5 seconds of animation at 60fps
    this.loopDuration = 8000  // ms for full loop

    // Attractor parameters
    this.lorenzParams = { sigma: 10, rho: 28, beta: 8 / 3 }
    this.rosslerParams = { a: 0.2, b: 0.2, c: 5.7 }

    // Precomputed frame data
    this.lorenzFrames = []
    this.rosslerFrames = []

    // Current state
    this.currentAttractor = 'lorenz'
    this.targetAttractor = 'lorenz'
    this.morphProgress = 1.0  // 0 = transitioning, 1 = complete
    this.morphSpeed = 0.02

    // Animation
    this.time = 0
    this.loopTime = 0
    this.speedMultiplier = 1.0
    this.targetSpeedMultiplier = 1.0

    // Visual properties
    this.baseColor = { hue: 210, sat: 45, light: 45, alpha: 55 }
    this.pointSize = 3
    this.glowSize = 8
    this.scale = 0.8  // Scale factor for canvas fit
    this.targetScale = 0.8

    // Performance mode
    this.performanceMode = 'normal'

    // Initialize
    this._precomputeAttractors()
    console.log('🦋 PrecomputedAttractorSystem initialized')
  }

  /**
   * Precompute all attractor frames at initialization
   */
  _precomputeAttractors() {
    console.log('🦋 Precomputing Lorenz attractor...')
    this.lorenzFrames = this._computeLorenzFrames()

    console.log('🦋 Precomputing Rossler attractor...')
    this.rosslerFrames = this._computeRosslerFrames()

    console.log(`🦋 Precomputation complete: ${this.frameCount} frames × ${this.pointCount} points`)
  }

  /**
   * Compute Lorenz attractor frames
   * dx/dt = sigma * (y - x)
   * dy/dt = x * (rho - z) - y
   * dz/dt = x * y - beta * z
   */
  _computeLorenzFrames() {
    const frames = []
    const { sigma, rho, beta } = this.lorenzParams
    const dt = 0.005
    const stepsPerFrame = 50

    // Initialize points with slight variations
    let points = []
    for (let i = 0; i < this.pointCount; i++) {
      // Start near the attractor's basin
      points.push({
        x: 1 + (Math.random() - 0.5) * 0.1,
        y: 1 + (Math.random() - 0.5) * 0.1,
        z: 20 + (Math.random() - 0.5) * 0.1
      })
    }

    // Let system settle
    for (let settle = 0; settle < 500; settle++) {
      for (let p of points) {
        const dx = sigma * (p.y - p.x)
        const dy = p.x * (rho - p.z) - p.y
        const dz = p.x * p.y - beta * p.z
        p.x += dx * dt
        p.y += dy * dt
        p.z += dz * dt
      }
    }

    // Record frames
    for (let f = 0; f < this.frameCount; f++) {
      // Evolve system
      for (let step = 0; step < stepsPerFrame; step++) {
        for (let p of points) {
          const dx = sigma * (p.y - p.x)
          const dy = p.x * (rho - p.z) - p.y
          const dz = p.x * p.y - beta * p.z
          p.x += dx * dt
          p.y += dy * dt
          p.z += dz * dt
        }
      }

      // Store normalized positions
      const frame = points.map(p => ({
        x: this._normalizeCoord(p.x, -25, 25),
        y: this._normalizeCoord(p.y, -30, 30),
        z: this._normalizeCoord(p.z, 0, 50)
      }))
      frames.push(frame)
    }

    return frames
  }

  /**
   * Compute Rossler attractor frames
   * dx/dt = -y - z
   * dy/dt = x + a*y
   * dz/dt = b + z*(x - c)
   */
  _computeRosslerFrames() {
    const frames = []
    const { a, b, c } = this.rosslerParams
    const dt = 0.02
    const stepsPerFrame = 25

    // Initialize points
    let points = []
    for (let i = 0; i < this.pointCount; i++) {
      points.push({
        x: 0.1 + (Math.random() - 0.5) * 0.01,
        y: 0.1 + (Math.random() - 0.5) * 0.01,
        z: 0.1 + (Math.random() - 0.5) * 0.01
      })
    }

    // Let system settle
    for (let settle = 0; settle < 500; settle++) {
      for (let p of points) {
        const dx = -p.y - p.z
        const dy = p.x + a * p.y
        const dz = b + p.z * (p.x - c)
        p.x += dx * dt
        p.y += dy * dt
        p.z += dz * dt
      }
    }

    // Record frames
    for (let f = 0; f < this.frameCount; f++) {
      for (let step = 0; step < stepsPerFrame; step++) {
        for (let p of points) {
          const dx = -p.y - p.z
          const dy = p.x + a * p.y
          const dz = b + p.z * (p.x - c)
          p.x += dx * dt
          p.y += dy * dt
          p.z += dz * dt
        }
      }

      // Store normalized positions
      const frame = points.map(p => ({
        x: this._normalizeCoord(p.x, -15, 15),
        y: this._normalizeCoord(p.y, -15, 15),
        z: this._normalizeCoord(p.z, 0, 30)
      }))
      frames.push(frame)
    }

    return frames
  }

  /**
   * Normalize coordinate to [0, 1]
   */
  _normalizeCoord(value, min, max) {
    return Math.max(0, Math.min(1, (value - min) / (max - min)))
  }

  /**
   * Get interpolated points for current time
   */
  _getInterpolatedPoints(frames) {
    const t = (this.loopTime % this.loopDuration) / this.loopDuration
    const floatIndex = t * (frames.length - 1)
    const frame0 = Math.floor(floatIndex)
    const frame1 = (frame0 + 1) % frames.length
    const blend = floatIndex - frame0

    const points0 = frames[frame0]
    const points1 = frames[frame1]

    return points0.map((p0, i) => {
      const p1 = points1[i]
      return {
        x: p0.x + (p1.x - p0.x) * blend,
        y: p0.y + (p1.y - p0.y) * blend,
        z: p0.z + (p1.z - p0.z) * blend
      }
    })
  }

  /**
   * Update animation state
   */
  update(dt) {
    this.time += dt

    // Update loop time with speed multiplier
    this.loopTime += dt * this.speedMultiplier

    // Smooth speed transitions
    this.speedMultiplier += (this.targetSpeedMultiplier - this.speedMultiplier) * 0.05

    // Smooth scale transitions
    this.scale += (this.targetScale - this.scale) * 0.03

    // Update morph progress
    if (this.currentAttractor !== this.targetAttractor && this.morphProgress >= 1.0) {
      this.morphProgress = 0
    }
    if (this.morphProgress < 1.0) {
      this.morphProgress += this.morphSpeed
      if (this.morphProgress >= 1.0) {
        this.morphProgress = 1.0
        this.currentAttractor = this.targetAttractor
      }
    }
  }

  /**
   * Render the attractor points
   */
  render(p) {
    if (this.performanceMode === 'disabled') return

    const width = p.width
    const height = p.height
    const centerX = width / 2
    const centerY = height / 2
    const displaySize = Math.min(width, height) * this.scale

    // Get points from current attractor(s)
    let points
    if (this.morphProgress < 1.0) {
      // Morphing between attractors
      const fromFrames = this.currentAttractor === 'lorenz' ? this.lorenzFrames : this.rosslerFrames
      const toFrames = this.targetAttractor === 'lorenz' ? this.lorenzFrames : this.rosslerFrames

      const fromPoints = this._getInterpolatedPoints(fromFrames)
      const toPoints = this._getInterpolatedPoints(toFrames)

      // Blend between attractors
      const t = this._easeInOutCubic(this.morphProgress)
      points = fromPoints.map((fp, i) => ({
        x: fp.x + (toPoints[i].x - fp.x) * t,
        y: fp.y + (toPoints[i].y - fp.y) * t,
        z: fp.z + (toPoints[i].z - fp.z) * t
      }))
    } else {
      // Single attractor
      const frames = this.currentAttractor === 'lorenz' ? this.lorenzFrames : this.rosslerFrames
      points = this._getInterpolatedPoints(frames)
    }

    // Render points
    p.push()
    p.colorMode(p.HSB, 360, 100, 100, 100)
    p.noStroke()

    // In degraded mode, render fewer points
    const step = this.performanceMode === 'degraded' ? 3 : 1

    for (let i = 0; i < points.length; i += step) {
      const point = points[i]

      // Map normalized coords to screen
      const screenX = centerX + (point.x - 0.5) * displaySize
      const screenY = centerY + (point.y - 0.5) * displaySize

      // Depth-based appearance
      const depthFactor = 0.5 + point.z * 0.5

      // Color with depth influence
      const hue = this.baseColor.hue
      const sat = this.baseColor.sat * 0.7
      const light = Math.min(70, this.baseColor.light * depthFactor * 1.2)
      const alpha = 35 + point.z * 30  // 35-65 based on depth

      // Glow (larger, more transparent)
      if (this.performanceMode !== 'degraded') {
        p.fill(hue, sat, light, alpha * 0.3)
        p.ellipse(screenX, screenY, this.glowSize * depthFactor, this.glowSize * depthFactor)
      }

      // Core point
      p.fill(hue, sat, light, alpha)
      p.ellipse(screenX, screenY, this.pointSize * depthFactor, this.pointSize * depthFactor)
    }

    p.pop()
  }

  /**
   * Easing function for smooth transitions
   */
  _easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  /**
   * Switch to a different attractor
   */
  switchAttractor(type) {
    if (type !== 'lorenz' && type !== 'rossler') return
    if (type === this.targetAttractor) return

    this.targetAttractor = type
    console.log(`🦋 Switching to ${type} attractor`)
  }

  /**
   * Toggle between attractors
   */
  toggleAttractor() {
    const next = this.targetAttractor === 'lorenz' ? 'rossler' : 'lorenz'
    this.switchAttractor(next)
  }

  /**
   * Set base color (inherits from nebula palette)
   */
  setBaseColor(color) {
    this.baseColor = { ...color }
  }

  /**
   * Pulse the loop speed momentarily
   */
  pulseSpeed(multiplier = 1.5, duration = 200) {
    this.targetSpeedMultiplier = multiplier
    setTimeout(() => {
      this.targetSpeedMultiplier = 1.0
    }, duration)
  }

  /**
   * Expand/contract the attractor display
   */
  setScale(scale, animate = true) {
    if (animate) {
      this.targetScale = scale
    } else {
      this.scale = scale
      this.targetScale = scale
    }
  }

  /**
   * Handle musical events
   */
  onMusicalEvent(event) {
    if (!event || !event.type) return

    switch (event.type) {
      case 'phrase:change':
        // Switch attractor on phrase changes
        this.toggleAttractor()
        break

      case 'beat:strong':
        // Speed up momentarily
        this.pulseSpeed(1.5, 200)
        break

      case 'velocity:high':
        // Already handled by color from nebula
        break

      case 'section:climax':
        // Expand attractor
        this.setScale(1.0)
        setTimeout(() => this.setScale(0.8), 1000)
        break
    }
  }

  /**
   * Handle background composition (sync color with nebula)
   */
  onBackgroundComposition(composition) {
    // This is called to sync color palette with nebulas
    // The actual color will be passed via setBaseColor
  }

  /**
   * Set performance mode
   */
  setPerformanceMode(mode) {
    this.performanceMode = mode
  }

  /**
   * Clear state
   */
  clear() {
    this.loopTime = 0
    this.speedMultiplier = 1.0
    this.targetSpeedMultiplier = 1.0
  }

  /**
   * Dispose resources
   */
  dispose() {
    this.lorenzFrames = []
    this.rosslerFrames = []
    this.clear()
  }
}

// Export for different module systems
if (typeof window !== 'undefined') {
  window.PrecomputedAttractorSystem = PrecomputedAttractorSystem
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrecomputedAttractorSystem
}
