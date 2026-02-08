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
    this.pointCount = 900     // Reduced from 1200 for audio priority (fewer canvas calls per frame)
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
    this.lastMorphTime = 0           // Timestamp of last morph (Entry #100)
    this.minMorphInterval = 2000     // Minimum 2s between morphs

    // Animation
    this.time = 0
    this.loopTime = 0
    this.speedMultiplier = 1.0
    this.targetSpeedMultiplier = 1.0

    // Visual properties - VIVID colors, FULL SCENE coverage
    // Using HSB: hue 0-360, sat 0-100, brightness 0-100
    // Hue 195 = cyan Electric Triad (#00d4ff)
    this.baseColor = { hue: 195, sat: 100, light: 80, alpha: 90 }

    // Interaction-driven hue (synced with room spatialDensity metric)
    // Maps spatialDensity (0-1) to hue range for color animation
    // 0 = spread apart → cyan (195°), 1 = clustered → magenta (330°)
    this.hueRange = { min: 195, max: 330 }  // Cool → warm as density increases
    this.targetHue = 195          // Target hue for smooth transition
    this.hueTransitionSpeed = 0.015  // Smooth transition speed

    this.pointSize = 1.5      // Tiny points for dense cloud
    this.glowSize = 3         // Minimal glow
    this.scale = 2.2          // FULL SCENE with slight zoom
    this.targetScale = 2.2
    this.fuzzyOffset = 8      // Random offset in pixels for blur effect

    // Canvas-level rotation for scene orientation (preserves attractor geometry)
    // Rotates the entire rendered animation without altering the attractor's axis
    this.rotationAngle = -Math.PI / 4  // -45° counter-clockwise rotation

    // Vertical offset to center the attractor's inner loops on canvas
    // Lorenz attractor is not symmetric; needs upward shift after rotation
    this.centerOffsetY = -0.08  // Shift up by 8% of displaySize
    this.offsetXPixels = 80     // Horizontal offset in pixels (positive = right)
    this.offsetYPixels = 100    // Vertical offset in pixels (positive = down)

    // Adaptive point reduction (smooth transitions)
    // Stress factor constants
    this.STRESS_MIN = 0.3
    this.STRESS_MAX = 1.0
    this.STEP_MIN = 1
    this.STEP_MAX = 2
    this.stressFactor = 1.0       // 1.0 = full performance, 0.3 = high stress
    this.currentStep = 1          // Current rendering step (1 = all points)
    this.targetStep = 1           // Target step for smooth transition
    this.stepTransitionRate = 0.05  // How fast step transitions
    this.lastRenderedStep = 1     // Hysteresis: prevents rapid step oscillation

    // Performance mode (kept for backwards compatibility)
    this.performanceMode = 'normal'

    // Precompute fuzzy offsets for all points (eliminates 4800 trig calls/frame)
    this.fuzzyOffsetsX = []
    this.fuzzyOffsetsY = []
    for (let i = 0; i < this.pointCount; i++) {
      this.fuzzyOffsetsX[i] = (Math.sin(i * 0.1) + Math.cos(i * 0.17)) * this.fuzzyOffset
      this.fuzzyOffsetsY[i] = (Math.cos(i * 0.13) + Math.sin(i * 0.19)) * this.fuzzyOffset
    }

    // Initialize
    this._precomputeAttractors()
  }

  /**
   * Precompute all attractor frames at initialization
   */
  _precomputeAttractors() {
    this.lorenzFrames = this._computeLorenzFrames()

    this.rosslerFrames = this._computeRosslerFrames()

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

    // Smooth step transitions for adaptive point reduction
    this.currentStep += (this.targetStep - this.currentStep) * this.stepTransitionRate

    // Smooth hue transition (composition-driven color)
    // Handle hue wraparound (e.g., 350° → 30° should go through 0°, not 180°)
    let hueDiff = this.targetHue - this.baseColor.hue
    if (hueDiff > 180) hueDiff -= 360
    if (hueDiff < -180) hueDiff += 360
    this.baseColor.hue = (this.baseColor.hue + hueDiff * this.hueTransitionSpeed + 360) % 360

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

    // Render points with canvas-level rotation (preserves attractor geometry)
    p.push()
    p.colorMode(p.HSB, 360, 100, 100, 100)
    p.noStroke()

    // Apply rotation at canvas level - rotates the entire rendered scene
    // without altering the attractor's mathematical shape
    p.translate(centerX, centerY)
    p.rotate(this.rotationAngle)

    // Hysteresis for step transitions - prevents rapid oscillation
    const roundedStep = Math.round(this.currentStep)
    if (this.lastRenderedStep === 1 && this.currentStep < 1.7) {
      // Stay at step 1 until currentStep reaches 1.7
      this.lastRenderedStep = 1
    } else if (this.lastRenderedStep === 2 && this.currentStep > 1.3) {
      // Stay at step 2 until currentStep drops below 1.3
      this.lastRenderedStep = 2
    } else {
      this.lastRenderedStep = roundedStep
    }
    const step = Math.max(1, this.lastRenderedStep)

    // Gradual glow opacity with easing
    // Wider transition range (0.35 to 0.75) with cubic easing
    const glowFactor = Math.max(0, Math.min(1, (this.stressFactor - 0.35) / 0.4))
    const glowOpacity = this._easeInOutCubic(glowFactor)

    for (let i = 0; i < points.length; i += step) {
      const point = points[i]

      // Use attractor coordinates directly (no axis rotation)
      // Canvas rotation handles scene orientation
      const nx = point.x - 0.5
      const ny = point.y - 0.5

      // Use precomputed fuzzy offsets - eliminates 4800 trig calls/frame
      // Apply offsets to position attractor on canvas
      const screenX = nx * displaySize + this.fuzzyOffsetsX[i] + this.offsetXPixels
      const screenY = (ny + this.centerOffsetY) * displaySize + this.fuzzyOffsetsY[i] + this.offsetYPixels

      // Depth-based appearance - closer points (higher z) are brighter and larger
      const depthFactor = 0.8 + point.z * 0.2

      // VIVID COLORS with slight variation for organic feel
      const hue = this.baseColor.hue || 180
      const sat = 100  // Full saturation
      const bright = 70 + point.z * 25  // 70-95 brightness based on depth
      const alpha = 60 + point.z * 25   // 60-85 alpha (slightly lower for blur effect)

      // Glow (larger, same vivid color) - gradual fade based on stress with easing
      if (glowOpacity > 0) {
        p.fill(hue, sat, bright * 0.85, alpha * 0.4 * glowOpacity)
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
  }

  /**
   * Toggle between attractors with reverse smoothing (Entry #100)
   * - Rate-limited to prevent oscillations from rapid gestures
   * - If morph in progress, smoothly reverses direction instead of jumping
   * @returns {boolean} True if toggle accepted, false if rate-limited
   */
  toggleAttractor() {
    const now = Date.now()
    const timeSinceLastMorph = now - this.lastMorphTime

    // Rate limiting: prevent rapid oscillations
    if (timeSinceLastMorph < this.minMorphInterval) {
      return false
    }

    if (this.morphProgress < 1.0) {
      // REVERSE SMOOTHING: Morph in progress, reverse direction
      // Invert progress first, then swap - this continues from current visual position
      this.morphProgress = 1.0 - this.morphProgress

      // Swap current and target to reverse direction (this IS the toggle)
      const temp = this.currentAttractor
      this.currentAttractor = this.targetAttractor
      this.targetAttractor = temp

    } else {
      // NORMAL TOGGLE: Complete, start new morph to opposite attractor
      const next = this.targetAttractor === 'lorenz' ? 'rossler' : 'lorenz'
      this.switchAttractor(next)
    }

    this.lastMorphTime = now
    return true
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
      case 'phrase':
        // Switch attractor on phrase changes (backend emits 'phrase' not 'phrase:change')
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
   * Handle background composition (kept for API compatibility)
   */
  onBackgroundComposition(composition) {
    // Hue now driven by spatialDensity via setInteractionMetrics
  }

  /**
   * Update interaction metrics - drives hue animation
   * @param {Object} metrics - Interaction metrics from room
   * @param {number} metrics.spatialDensity - Cursor clustering (0-1)
   */
  setInteractionMetrics(metrics) {
    if (!metrics) return

    // Map spatialDensity to hue range
    // 0 (spread) → cyan (195°), 1 (clustered) → magenta (330°)
    if (typeof metrics.spatialDensity === 'number' && isFinite(metrics.spatialDensity)) {
      const density = Math.max(0, Math.min(1, metrics.spatialDensity))
      this.targetHue = this.hueRange.min + density * (this.hueRange.max - this.hueRange.min)
    }
  }

  /**
   * Set performance mode (kept for backwards compatibility)
   */
  setPerformanceMode(mode) {
    this.performanceMode = mode
  }

  /**
   * Set stress factor for adaptive point reduction
   * @param {number} factor - 1.0 = full performance, 0.3 = high stress
   */
  setStressFactor(factor) {
    // Fix #3: Validate input to prevent NaN propagation
    if (typeof factor !== 'number' || !isFinite(factor)) {
      factor = 1.0
    }

    // Clamp to valid range
    this.stressFactor = Math.max(this.STRESS_MIN, Math.min(this.STRESS_MAX, factor))

    // Fix #2: Mathematically precise mapping
    // Map stress factor [0.3, 1.0] → target step [1, 2]
    const stressRange = this.STRESS_MAX - this.STRESS_MIN  // 0.7
    const stepRange = this.STEP_MAX - this.STEP_MIN        // 1
    this.targetStep = this.STEP_MIN + (this.STRESS_MAX - this.stressFactor) / stressRange * stepRange
  }

  /**
   * Entry #74: Set point limit for graphics quality control
   * @param {number} limit - Maximum points to render (affects performance)
   */
  setPointLimit (limit) {
    if (typeof limit !== 'number' || !isFinite(limit) || limit < 100) {
      return
    }

    // Limit can only reduce points (not increase above original)
    const newCount = Math.min(limit, 1200)
    if (newCount !== this.pointCount) {
      this.pointCount = newCount

      // Regenerate precomputed frames with new point count
      // This is expensive so only do it if really changing
      this._precomputeAttractors()
    }
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
