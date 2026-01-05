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
    this.pointCount = 1200    // More points for denser cloud
    this.frameCount = 90      // ~1.5 seconds of animation at 60fps
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

    // Visual properties - VIVID colors, FULL SCENE coverage
    // Using HSB: hue 0-360, sat 0-100, brightness 0-100
    this.baseColor = { hue: 180, sat: 100, light: 80, alpha: 90 }
    this.pointSize = 1.5      // Tiny points for dense cloud
    this.glowSize = 3         // Minimal glow
    this.scale = 2.0          // FULL SCENE - use most of the canvas
    this.targetScale = 2.0
    this.fuzzyOffset = 8      // Random offset in pixels for blur effect

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
   * SINGLE TRAJECTORY: Correct attractor shape, blur applied at render time
   *
   * dx/dt = sigma * (y - x)
   * dy/dt = x * (rho - z) - y
   * dz/dt = x * y - beta * z
   */
  _computeLorenzFrames() {
    const frames = []
    const { sigma, rho, beta } = this.lorenzParams
    const dt = 0.005

    // Compute ONE long trajectory
    const trajectoryLength = this.pointCount * 20
    const trajectory = []

    let x = 1, y = 1, z = 20

    // Let system settle onto the attractor
    for (let settle = 0; settle < 2000; settle++) {
      const dx = sigma * (y - x)
      const dy = x * (rho - z) - y
      const dz = x * y - beta * z
      x += dx * dt
      y += dy * dt
      z += dz * dt
    }

    // Record trajectory
    for (let i = 0; i < trajectoryLength; i++) {
      trajectory.push({ x, y, z })

      const dx = sigma * (y - x)
      const dy = x * (rho - z) - y
      const dz = x * y - beta * z
      x += dx * dt
      y += dy * dt
      z += dz * dt
    }

    // Sample points distributed along trajectory with sliding window
    const windowSize = this.pointCount
    const stepPerFrame = Math.floor((trajectoryLength - windowSize) / this.frameCount)

    for (let f = 0; f < this.frameCount; f++) {
      const startIdx = f * stepPerFrame
      const framePoints = []

      for (let i = 0; i < windowSize; i++) {
        const idx = startIdx + i
        if (idx < trajectory.length) {
          const p = trajectory[idx]
          framePoints.push({
            x: this._normalizeCoord(p.x, -25, 25),
            y: this._normalizeCoord(p.y, -30, 30),
            z: this._normalizeCoord(p.z, 0, 50)
          })
        }
      }
      frames.push(framePoints)
    }

    return frames
  }

  /**
   * Compute Rossler attractor frames
   * SINGLE TRAJECTORY: Correct attractor shape, blur applied at render time
   *
   * dx/dt = -y - z
   * dy/dt = x + a*y
   * dz/dt = b + z*(x - c)
   */
  _computeRosslerFrames() {
    const frames = []
    const { a, b, c } = this.rosslerParams
    const dt = 0.012

    // Compute ONE long trajectory
    const trajectoryLength = this.pointCount * 20
    const trajectory = []

    let x = 0.1, y = 0.1, z = 0.1

    // Let system settle onto the attractor
    for (let settle = 0; settle < 3000; settle++) {
      const dx = -y - z
      const dy = x + a * y
      const dz = b + z * (x - c)
      x += dx * dt
      y += dy * dt
      z += dz * dt
    }

    // Record trajectory
    for (let i = 0; i < trajectoryLength; i++) {
      trajectory.push({ x, y, z })

      const dx = -y - z
      const dy = x + a * y
      const dz = b + z * (x - c)
      x += dx * dt
      y += dy * dt
      z += dz * dt
    }

    // Sample points distributed along trajectory with sliding window
    const windowSize = this.pointCount
    const stepPerFrame = Math.floor((trajectoryLength - windowSize) / this.frameCount)

    for (let f = 0; f < this.frameCount; f++) {
      const startIdx = f * stepPerFrame
      const framePoints = []

      for (let i = 0; i < windowSize; i++) {
        const idx = startIdx + i
        if (idx < trajectory.length) {
          const p = trajectory[idx]
          framePoints.push({
            x: this._normalizeCoord(p.x, -15, 15),
            y: this._normalizeCoord(p.y, -15, 15),
            z: this._normalizeCoord(p.z, 0, 30)
          })
        }
      }
      frames.push(framePoints)
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

      // Map normalized coords to screen with FUZZY OFFSET for blur effect
      // Use deterministic noise based on point index for stable blur
      const fuzzyX = (Math.sin(i * 0.1 + this.time * 2) + Math.cos(i * 0.17)) * this.fuzzyOffset
      const fuzzyY = (Math.cos(i * 0.13 + this.time * 2) + Math.sin(i * 0.19)) * this.fuzzyOffset
      const screenX = centerX + (point.x - 0.5) * displaySize + fuzzyX
      const screenY = centerY + (point.y - 0.5) * displaySize + fuzzyY

      // Depth-based appearance - closer points (higher z) are brighter and larger
      const depthFactor = 0.8 + point.z * 0.2

      // VIVID COLORS with slight variation for organic feel
      const hue = this.baseColor.hue || 180
      const sat = 100  // Full saturation
      const bright = 70 + point.z * 25  // 70-95 brightness based on depth
      const alpha = 60 + point.z * 25   // 60-85 alpha (slightly lower for blur effect)

      // Glow (larger, same vivid color)
      if (this.performanceMode !== 'degraded') {
        p.fill(hue, sat, bright * 0.85, alpha * 0.4)
        p.ellipse(screenX, screenY, this.glowSize * depthFactor, this.glowSize * depthFactor)
      }

      // Core point - maximum saturation
      p.fill(hue, sat, bright, alpha)
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
