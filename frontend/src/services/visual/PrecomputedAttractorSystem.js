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

    // Offscreen buffer for cached rendering (legacy Canvas 2D fallback)
    this.buffer = null
    this.lastBufferWidth = 0
    this.lastBufferHeight = 0
    this._budgetExceeded = false

    // PixiJS rendering state
    this._pixiAdapter = null
    this._pixiWrapper = null         // Container with translation + rotation
    this._pixiCoreContainer = null   // ParticleContainer for core points
    this._pixiGlowContainer = null   // ParticleContainer for glow points
    this._pixiCoreParticles = []     // Pre-allocated core PIXI.Particle objects
    this._pixiGlowParticles = []     // Pre-allocated glow PIXI.Particle objects

    // Precompute fuzzy offsets for all points (eliminates 4800 trig calls/frame)
    this.fuzzyOffsetsX = []
    this.fuzzyOffsetsY = []
    for (let i = 0; i < this.pointCount; i++) {
      this.fuzzyOffsetsX[i] = (Math.sin(i * 0.1) + Math.cos(i * 0.17)) * this.fuzzyOffset
      this.fuzzyOffsetsY[i] = (Math.cos(i * 0.13) + Math.sin(i * 0.19)) * this.fuzzyOffset
    }

    // Initialize
    this._precomputeAttractors()

    // Pre-allocated interpolation buffers (zero GC pressure in render loop)
    this._interpBuffer1 = new Array(this.pointCount)
    this._interpBuffer2 = new Array(this.pointCount)
    this._morphOutput = new Array(this.pointCount)
    for (let i = 0; i < this.pointCount; i++) {
      this._interpBuffer1[i] = { x: 0, y: 0, z: 0 }
      this._interpBuffer2[i] = { x: 0, y: 0, z: 0 }
      this._morphOutput[i] = { x: 0, y: 0, z: 0 }
    }
  }

  /**
   * Precompute all attractor frames at initialization
   */
  _precomputeAttractors() {
    this.lorenzFrames = this._computeLorenzFrames()

    this.rosslerFrames = this._computeRosslerFrames()

  }

  /**
   * Initialize PixiJS rendering for attractor points
   * Creates wrapper container (position + rotation) with two ParticleContainers
   * @param {PixiAdapter} adapter - PixiAdapter instance
   */
  initPixi(adapter) {
    // Clean up previous PixiJS state (for context loss recovery / setPointLimit)
    if (this._pixiWrapper) {
      if (this._pixiWrapper.parent) {
        this._pixiWrapper.parent.removeChild(this._pixiWrapper)
      }
      this._pixiWrapper.destroy({ children: true })
      this._pixiWrapper = null
      this._pixiCoreContainer = null
      this._pixiGlowContainer = null
      this._pixiCoreParticles = []
      this._pixiGlowParticles = []
    }

    this._pixiAdapter = adapter
    const layer = adapter.getLayer('attractorLayer')
    if (!layer) return

    // Wrapper container for center-translate + rotation (GPU-free transform)
    this._pixiWrapper = new PIXI.Container()
    this._pixiWrapper.rotation = this.rotationAngle
    layer.addChild(this._pixiWrapper)

    // Glow layer (rendered first = behind core)
    // Container + Sprite (ParticleContainer + Particle has pool visibility bug in PixiJS v8)
    this._pixiGlowContainer = new PIXI.Container()
    this._pixiWrapper.addChild(this._pixiGlowContainer)

    // Core layer (rendered second = on top)
    this._pixiCoreContainer = new PIXI.Container()
    this._pixiWrapper.addChild(this._pixiCoreContainer)

    // Pre-allocate sprites for all points
    this._allocatePixiParticles(adapter)
  }

  /**
   * Allocate PIXI.Sprite objects for current pointCount
   * @param {PixiAdapter} adapter
   * @private
   */
  _allocatePixiParticles(adapter) {
    const coreTexture = adapter.getTexture('attractorPoint')
    this._pixiTexDiameter = coreTexture?.width || 6

    this._pixiCoreParticles = []
    this._pixiGlowParticles = []

    for (let i = 0; i < this.pointCount; i++) {
      const glowSprite = new PIXI.Sprite(coreTexture)
      glowSprite.anchor.set(0.5)
      glowSprite.x = -9999
      glowSprite.y = -9999
      glowSprite.scale.set(0.001)
      glowSprite.alpha = 0
      glowSprite.visible = false
      this._pixiGlowParticles.push(glowSprite)
      this._pixiGlowContainer.addChild(glowSprite)

      const coreSprite = new PIXI.Sprite(coreTexture)
      coreSprite.anchor.set(0.5)
      coreSprite.x = -9999
      coreSprite.y = -9999
      coreSprite.scale.set(0.001)
      coreSprite.alpha = 0
      coreSprite.visible = false
      this._pixiCoreParticles.push(coreSprite)
      this._pixiCoreContainer.addChild(coreSprite)
    }
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
   * Get interpolated points for current time (zero-allocation: writes to pre-allocated buffer)
   * @param {Array} frames - Precomputed keyframes
   * @param {Array} outputBuffer - Pre-allocated output buffer to write into
   * @returns {Array} The outputBuffer (same reference)
   */
  _getInterpolatedPoints(frames, outputBuffer) {
    const t = (this.loopTime % this.loopDuration) / this.loopDuration
    const floatIndex = t * (frames.length - 1)
    const frame0 = Math.floor(floatIndex)
    const frame1 = (frame0 + 1) % frames.length
    const blend = floatIndex - frame0

    const points0 = frames[frame0]
    const points1 = frames[frame1]

    for (let i = 0; i < points0.length; i++) {
      const p0 = points0[i], p1 = points1[i], out = outputBuffer[i]
      out.x = p0.x + (p1.x - p0.x) * blend
      out.y = p0.y + (p1.y - p0.y) * blend
      out.z = p0.z + (p1.z - p0.z) * blend
    }
    return outputBuffer
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
   * Set budget exceeded flag — when true, render() blits cached buffer instead of re-rendering
   */
  setBudgetExceeded(exceeded) {
    this._budgetExceeded = exceeded
  }

  /**
   * Render the attractor points
   * PixiJS path: update sprite positions/colors in ParticleContainers
   * Budget exceeded: skip update — retained mode keeps sprites visible (no flicker)
   */
  render(p) {
    if (this.performanceMode === 'disabled') return

    // PixiJS path — update sprite properties in scene graph
    if (this._pixiAdapter) {
      if (!this._budgetExceeded) {
        this._renderPixi()
      }
      return
    }
  }

  /**
   * PixiJS render: update particle positions/colors/alpha in scene graph
   * Wrapper container handles center translation + rotation (GPU-free)
   * @private
   */
  _renderPixi() {
    if (!this._pixiAdapter || !this._pixiWrapper) return
    const width = this._pixiAdapter.width
    const height = this._pixiAdapter.height
    const centerX = width / 2
    const centerY = height / 2
    const displaySize = Math.min(width, height) * this.scale

    // Update wrapper container transform (center + rotation)
    this._pixiWrapper.x = centerX
    this._pixiWrapper.y = centerY
    this._pixiWrapper.rotation = this.rotationAngle

    // Get interpolated points — zero-allocation using pre-allocated buffers
    let points
    if (this.morphProgress < 1.0) {
      const fromFrames = this.currentAttractor === 'lorenz' ? this.lorenzFrames : this.rosslerFrames
      const toFrames = this.targetAttractor === 'lorenz' ? this.lorenzFrames : this.rosslerFrames
      const fromPoints = this._getInterpolatedPoints(fromFrames, this._interpBuffer1)
      const toPoints = this._getInterpolatedPoints(toFrames, this._interpBuffer2)
      const t = this._easeInOutCubic(this.morphProgress)
      for (let i = 0; i < fromPoints.length; i++) {
        const fp = fromPoints[i], tp = toPoints[i], out = this._morphOutput[i]
        out.x = fp.x + (tp.x - fp.x) * t
        out.y = fp.y + (tp.y - fp.y) * t
        out.z = fp.z + (tp.z - fp.z) * t
      }
      points = this._morphOutput
    } else {
      const frames = this.currentAttractor === 'lorenz' ? this.lorenzFrames : this.rosslerFrames
      points = this._getInterpolatedPoints(frames, this._interpBuffer1)
    }

    // Hysteresis for step transitions — prevents rapid oscillation
    const roundedStep = Math.round(this.currentStep)
    if (this.lastRenderedStep === 1 && this.currentStep < 1.7) {
      this.lastRenderedStep = 1
    } else if (this.lastRenderedStep === 2 && this.currentStep > 1.3) {
      this.lastRenderedStep = 2
    } else {
      this.lastRenderedStep = roundedStep
    }
    const step = Math.max(1, this.lastRenderedStep)

    // Glow opacity with easing (wider transition range 0.35-0.75)
    const glowFactor = Math.max(0, Math.min(1, (this.stressFactor - 0.35) / 0.4))
    const glowOpacity = this._easeInOutCubic(glowFactor)
    const showGlow = glowOpacity > 0

    // Color: HSB hue to 0-1 range for hsbToPixiColor
    const hue = ((this.baseColor.hue || 180) % 360) / 360

    // Use actual texture diameter for scale calculation
    const texDiam = this._pixiTexDiameter || 6

    for (let i = 0; i < this.pointCount; i++) {
      const coreP = this._pixiCoreParticles[i]
      const glowP = this._pixiGlowParticles[i]

      // Hide particles skipped by stress step or out of range
      if (i % step !== 0 || i >= points.length) {
        coreP.visible = false
        glowP.visible = false
        continue
      }

      const point = points[i]
      const nx = point.x - 0.5
      const ny = point.y - 0.5

      // Position with precomputed fuzzy offsets + pixel offsets
      const screenX = nx * displaySize + this.fuzzyOffsetsX[i] + this.offsetXPixels
      const screenY = (ny + this.centerOffsetY) * displaySize + this.fuzzyOffsetsY[i] + this.offsetYPixels

      // Depth-based appearance
      const depthFactor = 0.8 + point.z * 0.2
      const bright = (70 + point.z * 25) / 100   // 0.70-0.95
      let alpha = (60 + point.z * 25) / 100       // 0.60-0.85

      // Endpoint fading: taper trajectory at head/tail to avoid abrupt cutoff
      // (Canvas 2D shadowBlur masked endpoints; PixiJS needs explicit fade)
      const fadeZone = 60  // number of points to fade at each end
      const activeCount = Math.ceil(points.length / step)
      const activeIdx = Math.floor(i / step)
      if (activeIdx < fadeZone) {
        alpha *= activeIdx / fadeZone
      } else if (activeIdx > activeCount - fadeZone) {
        alpha *= (activeCount - activeIdx) / fadeZone
      }

      // Core particle
      coreP.x = screenX
      coreP.y = screenY
      coreP.alpha = alpha
      coreP.tint = hsbToPixiColor(hue, 1.0, bright)
      const coreScale = this.pointSize * depthFactor / texDiam
      coreP.scale.set(coreScale)
      coreP.visible = alpha > 0.01

      // Glow particle (larger, semi-transparent)
      if (showGlow && alpha > 0.01) {
        glowP.x = screenX
        glowP.y = screenY
        glowP.alpha = alpha * 0.4 * glowOpacity
        glowP.tint = hsbToPixiColor(hue, 1.0, bright * 0.85)
        const glowScale = this.glowSize * depthFactor / texDiam
        glowP.scale.set(glowScale)
        glowP.visible = true
      } else {
        glowP.visible = false
      }
    }
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
    // Only drive targetHue from nebula — don't overwrite baseColor directly,
    // otherwise the smooth hue transition in update() gets reset every frame
    if (color && typeof color.hue === 'number') {
      this.targetHue = color.hue
    }
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

      // Re-allocate interpolation buffers for new point count
      this._interpBuffer1 = new Array(this.pointCount)
      this._interpBuffer2 = new Array(this.pointCount)
      this._morphOutput = new Array(this.pointCount)
      for (let i = 0; i < this.pointCount; i++) {
        this._interpBuffer1[i] = { x: 0, y: 0, z: 0 }
        this._interpBuffer2[i] = { x: 0, y: 0, z: 0 }
        this._morphOutput[i] = { x: 0, y: 0, z: 0 }
      }

      // Re-allocate PixiJS particles if initialized
      if (this._pixiAdapter && this._pixiWrapper) {
        // Full re-init (idempotent — cleans up old containers before creating new ones)
        this.initPixi(this._pixiAdapter)
      }
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
    if (this.buffer) {
      this.buffer.remove()
      this.buffer = null
    }

    // PixiJS cleanup
    if (this._pixiGlowContainer) {
      this._pixiGlowContainer.destroy({ children: true })
      this._pixiGlowContainer = null
    }
    if (this._pixiCoreContainer) {
      this._pixiCoreContainer.destroy({ children: true })
      this._pixiCoreContainer = null
    }
    if (this._pixiWrapper) {
      this._pixiWrapper.destroy({ children: true })
      this._pixiWrapper = null
    }
    this._pixiCoreParticles = []
    this._pixiGlowParticles = []
    this._pixiAdapter = null

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
