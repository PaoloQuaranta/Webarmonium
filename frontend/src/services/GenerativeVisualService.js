/**
 * GenerativeVisualService
 * Orchestrates enhanced generative graphics driven by user gestures
 *
 * Architecture (PixiJS v8 GPU-accelerated):
 * - SpringMeshNetwork: Physics simulation and curved edges
 * - WavePacketSystem: Pulse propagation along edges
 * - ParticleFlowManager: Particle flow effects
 * - NeonNebulaSystem: Discrete floating nebula blobs with neon glow
 * - PrecomputedAttractorSystem: Strange attractors (Lorenz/Rossler) with precomputed keyframes
 *
 * Responsibilities:
 * - PixiAdapter instance lifecycle (init, render, dispose)
 * - Coordinate all visual subsystems
 * - Maintain API compatibility (updateCursorPosition, updateGestureData, removeUser)
 * - Performance monitoring and degradation modes
 */

class GenerativeVisualService {
  constructor() {
    // PixiAdapter instance (replaces CanvasAdapter)
    this.pixiAdapter = null
    // Keep p5Instance reference for backward compat in resize() calls
    this.p5Instance = null

    // Subsystems
    this.springMesh = null
    this.wavePackets = null
    this.particles = null
    this.nebulas = null
    this.attractors = null

    // Accessibility: Reduced motion preference
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this._reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    this._handleReducedMotionChange = this._handleReducedMotionChange.bind(this)
    this._reducedMotionQuery.addEventListener('change', this._handleReducedMotionChange)

    // Performance monitoring
    this.lastFrameTime = 0
    this.fps = 30
    this.performanceMode = 'normal'
    this.frameCount = 0

    // Stress factor for graceful degradation (0.3-1.0)
    this.stressFactor = 1.0

    // Idle detection
    this.lastActivityTime = Date.now()
    this.lastWaveEmit = Date.now()
    this.lastParticleEmit = Date.now()

    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
    this.idleThreshold = isMobile ? 1000 : 2000
    this.isPaused = false

    // Performance configuration
    this.targetFps = 30
    this._originalTargetFps = 30
    this.degradeThreshold = 20
    this.disableThreshold = 15
    this.recoveryThreshold = 28

    // Audio-driven performance override with hysteresis
    this._audioPerformanceOverride = null
    this._pendingAudioStress = null
    this._lastQualityTransition = 0
    this._consecutiveOverruns = 0

    // P&P emission throttling per user
    this._lastEmitByUser = new Map()
    this.MIN_EMIT_INTERVAL = 300
    this.frameSampleInterval = 60

    // Background colors for themes
    this.bgColors = {
      dark: [2, 2, 8],
      light: [224, 224, 240]
    }
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark'
    this.bgColor = this.bgColors[currentTheme] || this.bgColors.dark

    this._handleThemeChange = this._handleThemeChange.bind(this)
    window.addEventListener('theme-change', this._handleThemeChange)

    // Draw loop timing
    this._rafId = null
    this._lastDrawTime = 0
    this._frameInterval = 1000 / this.targetFps
  }

  /**
   * Handle theme change event
   */
  _handleThemeChange(event) {
    let theme = event?.detail?.theme
    if (!theme) {
      const attr = document.documentElement.getAttribute('data-theme')
      theme = attr === 'light' ? 'light' : 'dark'
    }
    this.bgColor = this.bgColors[theme] || this.bgColors.dark

    // Update PixiJS background
    if (this.pixiAdapter) {
      this.pixiAdapter.setBackground(...this.bgColor)
    }

    this.isPaused = false
    this.lastActivityTime = Date.now()

    // Propagate light mode to subsystems that need alpha/blend adjustments
    const isLight = theme === 'light'
    if (this.wavePackets && typeof this.wavePackets.setLightMode === 'function') {
      this.wavePackets.setLightMode(isLight)
    }
    if (this.springMesh && typeof this.springMesh.setLightMode === 'function') {
      this.springMesh.setLightMode(isLight)
    }
  }

  /**
   * Initialize PixiAdapter and all subsystems (async)
   * @param {HTMLElement} containerElement - DOM element to attach canvas
   */
  async initialize(containerElement) {
    if (!containerElement) {
      console.error('GenerativeVisualService: Container element not found')
      return
    }

    this.containerElement = containerElement

    try {
      // Initialize subsystems (same as before — they will be migrated in subsequent steps)
      this.springMesh = new SpringMeshNetwork()
      this.wavePackets = new WavePacketSystem(this.springMesh)
      this.particles = new ParticleFlowManager(this.springMesh)

      const NebulaClass = typeof NeonNebulaSystem !== 'undefined' ? NeonNebulaSystem : window.NeonNebulaSystem
      this.nebulas = new NebulaClass()
      this.attractors = new PrecomputedAttractorSystem()

      // Create PixiAdapter (async init required by PixiJS v8)
      this.pixiAdapter = new PixiAdapter()
      await this.pixiAdapter.init(containerElement, {
        background: rgbToPixiColor(...this.bgColor),
      })

      // Setup context loss callbacks
      this.pixiAdapter.setContextLossCallbacks(
        () => this._onContextLost(),
        () => this._onContextRestored()
      )

      // Wire PixiAdapter to subsystems
      // Each subsystem will receive pixiAdapter in their initPixi() method
      // (to be implemented in Steps 4-8)
      this._initSubsystemPixi()

      // Expose on window for subsystem stress factor access
      window.visualService = this

      // Start manual draw loop (replaces CanvasAdapter's internal rAF loop)
      this.lastFrameTime = performance.now()
      this._lastDrawTime = performance.now()
      this._startDrawLoop()

      // Apply reduced motion settings if user prefers
      if (this.prefersReducedMotion) {
        this._applyReducedMotionSettings()
      }

      // Apply graphics quality after setup
      try {
        this.applyGraphicsQuality()
      } catch (e) {
        // Settings may not be loaded yet
      }

    } catch (error) {
      console.error('Error during GenerativeVisualService initialization:', error)
      throw error
    }
  }

  /**
   * Initialize subsystems with PixiJS rendering
   * Called after PixiAdapter is ready. Subsystems that haven't been migrated
   * yet will use a compatibility shim (CanvasAdapter-like wrapper).
   * @private
   */
  _initSubsystemPixi() {
    const adapter = this.pixiAdapter
    const w = adapter.width
    const h = adapter.height

    // Initialize background nodes (prevents flickering)
    if (this.springMesh && !this.springMesh.backgroundNodesInitialized) {
      this.springMesh.initializeBackgroundNodes()
    }

    // Pass PixiAdapter to subsystems that have been migrated
    // Unmigrated subsystems still use the legacy p5-compatible draw(p) API
    // with a compatibility shim created in the draw loop
    if (this.springMesh && typeof this.springMesh.initPixi === 'function') {
      this.springMesh.initPixi(adapter)
    }
    if (this.wavePackets && typeof this.wavePackets.initPixi === 'function') {
      this.wavePackets.initPixi(adapter)
    }
    if (this.particles && typeof this.particles.initPixi === 'function') {
      this.particles.initPixi(adapter)
    }
    if (this.nebulas && typeof this.nebulas.initPixi === 'function') {
      this.nebulas.initPixi(adapter)
    }
    if (this.attractors && typeof this.attractors.initPixi === 'function') {
      this.attractors.initPixi(adapter)
    }

    // Set initial light mode on subsystems
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark'
    const isLight = currentTheme === 'light'
    if (this.wavePackets && typeof this.wavePackets.setLightMode === 'function') {
      this.wavePackets.setLightMode(isLight)
    }
    if (this.springMesh && typeof this.springMesh.setLightMode === 'function') {
      this.springMesh.setLightMode(isLight)
    }
  }

  /**
   * WebGL context lost handler
   * @private
   */
  _onContextLost() {
    this.isPaused = true
  }

  /**
   * WebGL context restored handler
   * @private
   */
  _onContextRestored() {
    this.isPaused = false
    this._initSubsystemPixi()
    // Notify external listeners (e.g. trail system in main.js)
    if (this._contextRestoreCallbacks) {
      this._contextRestoreCallbacks.forEach(cb => cb(this.pixiAdapter))
    }
  }

  /**
   * Register a callback for WebGL context restore
   * @param {Function} callback - Called with pixiAdapter after context is restored
   */
  onContextRestored(callback) {
    if (!this._contextRestoreCallbacks) this._contextRestoreCallbacks = []
    this._contextRestoreCallbacks.push(callback)
  }

  /**
   * Start the manual draw loop (replaces CanvasAdapter's rAF loop)
   * @private
   */
  _startDrawLoop() {
    const loop = (now) => {
      if (!this.pixiAdapter || !this.pixiAdapter._initialized) return

      const elapsed = now - this._lastDrawTime
      if (elapsed >= this._frameInterval) {
        this._lastDrawTime = now - (elapsed % this._frameInterval)
        this.frameCount++
        this.draw()
      }

      this._rafId = requestAnimationFrame(loop)
    }
    this._rafId = requestAnimationFrame(loop)
  }

  /**
   * Main draw loop — runs every frame
   * Updated for PixiJS: subsystems update scene graph, then we render once
   */
  draw() {
    if (this.isPaused) return
    if (this.pixiAdapter && this.pixiAdapter.isContextLost()) return

    // Apply queued audio stress at frame boundary
    if (this._pendingAudioStress) {
      this._applyAudioStressInternal(this._pendingAudioStress)
      this._pendingAudioStress = null
    }

    // Calculate delta time and FPS
    const now = performance.now()
    const delta = now - this.lastFrameTime
    const dt = Math.min(delta / 1000, 0.1)
    this.lastFrameTime = now

    if (delta > 0 && delta < 1000) {
      const instantFps = 1000 / delta
      this.fps = this.fps * 0.9 + instantFps * 0.1
    }

    // Performance monitoring
    this.updatePerformanceMetrics()

    // Frame budget enforcement
    // GPU rendering (PixiJS) uses ~2-4ms CPU vs ~11ms Canvas 2D
    // Reduced reserve from 22ms → 14ms, giving ~19ms budget at 30fps
    const frameStart = performance.now()
    const OVERHEAD_RESERVE_MS = 14
    const frameBudgetMs = (1000 / this.targetFps) - OVERHEAD_RESERVE_MS

    // Create compatibility shim for unmigrated subsystems
    // This provides p5-compatible API backed by a temporary offscreen canvas
    // Subsystems that have initPixi() will not use this shim
    const p = this._getCompatShim()

    // Update and render based on performance mode
    if (this.performanceMode === 'disabled') {
      this.renderSimpleNodes(p)
    } else {
      const nowMs = Date.now()
      const waveIdle = Math.max(0, nowMs - this.lastWaveEmit) > this.idleThreshold && this.wavePackets.getPulseCount() === 0
      const particleIdle = Math.max(0, nowMs - this.lastParticleEmit) > this.idleThreshold && this.particles.getParticleCount() === 0

      // PRIORITY 1: Physics + spring mesh
      this.springMesh.updatePhysics(dt)
      if (this.nebulas) this.nebulas.update(dt)
      if (this.attractors) this.attractors.update(dt)
      if (!waveIdle) this.wavePackets.update(dt)
      if (!particleIdle) this.particles.update(dt)

      // Render: subsystems with initPixi update scene graph automatically
      // Subsystems without initPixi use the legacy render(p) path
      this.springMesh.render(p)

      if (performance.now() - frameStart < frameBudgetMs) {
        if (this.nebulas) {
          this.nebulas.setPerformanceMode(this.performanceMode)
          this.nebulas.render(p)
        }
      }

      if (performance.now() - frameStart < frameBudgetMs) {
        this.wavePackets.render(p)
      }

      if (this.attractors) {
        const budgetExceeded = performance.now() - frameStart >= frameBudgetMs * 0.85
        this.attractors.setBudgetExceeded(budgetExceeded)
        this.attractors.setPerformanceMode(this.performanceMode)
        this.attractors.setStressFactor(this.stressFactor)
        if (this.nebulas && this.nebulas.colors) {
          const nebulaColor = this.nebulas.colors[0]
          this.attractors.setBaseColor(nebulaColor)
        }
        this.attractors.render(p)
      }

      if (performance.now() - frameStart < frameBudgetMs * 0.85) {
        this.particles.render(p)
      }

      // Track frame overruns
      const frameTime = performance.now() - frameStart
      const VISUAL_ONLY_FLOOR = 0.5
      if (!this._audioPerformanceOverride && frameTime > frameBudgetMs * 1.5) {
        this._consecutiveOverruns = (this._consecutiveOverruns || 0) + 1
        this.stressFactor = Math.max(VISUAL_ONLY_FLOOR, this.stressFactor - 0.05)
        if (this._consecutiveOverruns >= 2) {
          this.stressFactor = Math.max(VISUAL_ONLY_FLOOR, this.stressFactor - 0.1)
          this._consecutiveOverruns = 0
        }
      } else {
        this._consecutiveOverruns = 0
      }
    }

    // Render PixiJS scene graph (single GPU draw call batch)
    this.pixiAdapter.render()
  }

  /**
   * Get a p5-compatible shim for unmigrated subsystems
   * This provides the minimum API needed: width, height, fill, stroke, etc.
   * backed by a hidden offscreen canvas that gets composited over the PixiJS output.
   * As subsystems are migrated to PixiJS, they stop using this shim.
   * @private
   * @returns {Object} p5-compatible shim
   */
  _getCompatShim() {
    if (this._compatShim) return this._compatShim

    // Create a minimal shim that subsystems can call without errors
    // but that doesn't actually render (rendering goes through PixiJS)
    const adapter = this.pixiAdapter
    this._compatShim = {
      width: adapter.width,
      height: adapter.height,
      // No-op drawing methods — subsystems will be migrated to use PixiJS directly
      noStroke: () => {},
      noFill: () => {},
      fill: () => {},
      stroke: () => {},
      strokeWeight: () => {},
      circle: () => {},
      ellipse: () => {},
      line: () => {},
      push: () => {},
      pop: () => {},
      translate: () => {},
      rotate: () => {},
      textAlign: () => {},
      textSize: () => {},
      text: () => {},
      image: () => {},
      imageMode: () => {},
      colorMode: () => {},
      background: () => {},
      noise: (x, y, z) => PerlinNoise.noise(x || 0, y || 0, z || 0),
      millis: () => adapter.millis(),
      createGraphics: (w, h) => {
        // Return a minimal offscreen buffer shim
        return {
          canvas: document.createElement('canvas'),
          width: w,
          height: h,
          drawingContext: null,
          clear: () => {},
          remove: () => {},
          colorMode: () => {},
          noStroke: () => {},
          noFill: () => {},
          fill: () => {},
          stroke: () => {},
          ellipse: () => {},
          circle: () => {},
          noise: (x, y, z) => PerlinNoise.noise(x || 0, y || 0, z || 0),
        }
      },
      drawingContext: {
        shadowBlur: 0,
        shadowColor: 'transparent',
        globalAlpha: 1,
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        fill: () => {},
        stroke: () => {},
        fillRect: () => {},
        clearRect: () => {},
        drawImage: () => {},
        fillText: () => {},
        scale: () => {},
        translate: () => {},
        rotate: () => {},
      },
    }

    return this._compatShim
  }

  /**
   * Render simple nodes only (fallback mode)
   */
  renderSimpleNodes(p) {
    // In PixiJS mode, disabled mode still shows static nodes via scene graph
    // No-op for now — subsystem migration will handle this
  }

  // =========================================================================
  // Public API (unchanged from Canvas 2D version)
  // =========================================================================

  updateCursorPosition(userId, x, y, color) {
    if (!this.springMesh) return

    this.springMesh.updateNode(userId, x, y, color, {
      type: 'idle',
      isActive: false
    })

    this.lastActivityTime = Date.now()
    this.isPaused = false
  }

  updateGestureData(userId, gestureData) {
    if (!this.springMesh) return

    const node = this.springMesh.nodes.get(userId)

    if (node) {
      node.gestureType = gestureData.type || 'idle'
      node.isActive = gestureData.isActive || false

      if (gestureData.isActive) {
        if (gestureData.type === 'tap' || gestureData.type === 'drag' || gestureData.type === 'hold') {
          const now = Date.now()
          const lastEmit = this._lastEmitByUser.get(userId) || 0
          if (now - lastEmit < this.MIN_EMIT_INTERVAL) return
          this._lastEmitByUser.set(userId, now)

          if (this.wavePackets) {
            this.wavePackets.emitPulse(userId, node.color)
            this.lastWaveEmit = Date.now()
          }

          const baseCount = (gestureData.type === 'tap' || gestureData.type === 'hold') ? 5 : 2
          const particleCount = Math.max(1, Math.floor(baseCount * this.stressFactor))
          if (this.particles) {
            this.particles.emitParticles(userId, particleCount)
            this.lastParticleEmit = Date.now()
          }
        }

        if (gestureData.type === 'sequencer') {
          const now = Date.now()
          const lastEmit = this._lastEmitByUser.get(userId) || 0
          if (now - lastEmit >= this.MIN_EMIT_INTERVAL) {
            this._lastEmitByUser.set(userId, now)
            if (this.particles) {
              const particleCount = Math.max(1, Math.floor(2 * this.stressFactor))
              this.particles.emitParticles(userId, particleCount)
              this.lastParticleEmit = now
            }
          }
        }
      }
    }

    this.lastActivityTime = Date.now()
    this.isPaused = false
  }

  removeUser(userId) {
    this.springMesh.removeNode(userId)
    this._lastEmitByUser.delete(userId)
  }

  unblockUser(userId) {
    if (this.springMesh) this.springMesh.unblockUser(userId)
  }

  clearBlockedUsers() {
    if (this.springMesh) this.springMesh.clearBlockedUsers()
  }

  /**
   * Resize — called by CanvasManager on window resize
   */
  resize(width, height) {
    if (this.pixiAdapter) {
      this.pixiAdapter.resize(width, height)
      // Update compat shim dimensions
      if (this._compatShim) {
        this._compatShim.width = width
        this._compatShim.height = height
      }
    }
  }

  // Alias for CanvasManager resize listener pattern
  setCanvasSize(width, height) {
    this.resize(width, height)
  }

  // =========================================================================
  // Performance monitoring
  // =========================================================================

  updatePerformanceMetrics() {
    this.frameCount++

    if (this.frameCount % this.frameSampleInterval === 0) {
      const graphicsBudget = Math.min(1.0, Math.max(0.3, this.fps / this.targetFps))

      if (this._audioPerformanceOverride) {
        this.stressFactor = Math.max(0.3, Math.min(graphicsBudget, this.stressFactor))
      } else {
        this.stressFactor = Math.max(0.3, graphicsBudget)
      }

      let targetMode = this._audioPerformanceOverride || this.performanceMode

      if (graphicsBudget < 0.5) {
        targetMode = 'degraded'
      } else if (!this._audioPerformanceOverride) {
        targetMode = 'normal'
      }

      if (targetMode !== this.performanceMode) {
        this.performanceMode = targetMode
      }
    }

    if (Date.now() - this.lastActivityTime > this.idleThreshold) {
      if (!this.isPaused) {
        this.isPaused = true
      }
    }
  }

  // =========================================================================
  // Audio stress → graphics degradation
  // =========================================================================

  applyAudioStress(stressData) {
    this._pendingAudioStress = stressData
  }

  /** @private */
  _applyAudioStressInternal(stressData) {
    const COOLDOWN_MS = 2000
    const DEGRADE_THRESHOLD = 0.5
    const RECOVER_THRESHOLD = 0.7

    const now = Date.now()
    if (now - this._lastQualityTransition < COOLDOWN_MS) return

    const { stressFactor: audioStress, mode } = stressData
    const currentMode = this._audioPerformanceOverride || 'normal'

    if (mode !== 'normal' && currentMode === 'normal') {
      if (audioStress >= DEGRADE_THRESHOLD) return
    }
    if (mode === 'normal' && currentMode !== 'normal') {
      if (audioStress <= RECOVER_THRESHOLD) return
    }

    this._lastQualityTransition = now

    if (mode === 'emergency') {
      this._setAudioDrivenPerformanceMode('degraded')
      this._setTargetFps(5)
      if (this.springMesh) this.springMesh.setCurveSegments(2)
    } else if (mode === 'minimal') {
      this._setAudioDrivenPerformanceMode('degraded')
      this._setTargetFps(10)
      if (this.springMesh) this.springMesh.setCurveSegments(4)
    } else if (mode === 'degraded') {
      this._setAudioDrivenPerformanceMode('degraded')
      this._setTargetFps(20)
      if (this.springMesh) this.springMesh.setCurveSegments(10)
    } else {
      this._clearAudioDrivenPerformanceMode()
      this._setTargetFps(this._originalTargetFps)
      const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
      if (this.springMesh) this.springMesh.setCurveSegments(isMobile ? 10 : 14)
    }
  }

  /** @private */
  _setAudioDrivenPerformanceMode(mode) {
    this._audioPerformanceOverride = mode
    if (this.performanceMode !== 'disabled') {
      this.performanceMode = mode
    }
  }

  /** @private */
  _clearAudioDrivenPerformanceMode() {
    this._audioPerformanceOverride = null
  }

  /** @private */
  _setTargetFps(fps) {
    this.targetFps = fps
    this._frameInterval = 1000 / fps
  }

  // =========================================================================
  // Reduced motion
  // =========================================================================

  _handleReducedMotionChange(event) {
    this.prefersReducedMotion = event.matches
    if (this.prefersReducedMotion) {
      this._applyReducedMotionSettings()
    } else {
      this._restoreMotionSettings()
    }
  }

  _applyReducedMotionSettings() {
    if (this.nebulas) this.nebulas.setPerformanceMode('disabled')
    if (this.attractors) this.attractors.setPerformanceMode('disabled')
    if (this.particles) {
      this.particles.setCascadeEnabled(false)
      this.particles.setMaxParticles(0)
    }
    if (this.wavePackets) this.wavePackets.setGlowEnabled(false)
  }

  _restoreMotionSettings() {
    this.applyGraphicsQuality()
  }

  // =========================================================================
  // Public accessors
  // =========================================================================

  getPerformanceMetrics() {
    return {
      fps: Math.round(this.fps),
      performanceMode: this.performanceMode,
      isPaused: this.isPaused,
      nodeCount: this.springMesh?.getNodeCount() || 0,
      edgeCount: this.springMesh?.getEdgeCount() || 0,
      particleCount: this.particles?.getParticleCount() || 0,
      pulseCount: this.wavePackets?.getPulseCount() || 0
    }
  }

  getSubsystems() {
    return {
      springMesh: this.springMesh,
      wavePackets: this.wavePackets,
      particles: this.particles,
      nebulas: this.nebulas,
      attractors: this.attractors
    }
  }

  onMusicalEvent(event) {
    if (this.nebulas && this.nebulas.onMusicalEvent) this.nebulas.onMusicalEvent(event)
    if (this.attractors) this.attractors.onMusicalEvent(event)
  }

  onBackgroundComposition(composition) {
    if (this.nebulas && this.nebulas.onBackgroundComposition) this.nebulas.onBackgroundComposition(composition)
    if (this.attractors && this.attractors.onBackgroundComposition) this.attractors.onBackgroundComposition(composition)
  }

  updateInteractionMetrics(metrics) {
    if (!metrics) return
    if (this.nebulas && this.nebulas.setInteractionMetrics) {
      try {
        this.nebulas.setInteractionMetrics(metrics)
      } catch (error) {
        console.error('GenerativeVisualService: Error updating interaction metrics:', error)
      }
    }
    if (this.attractors && this.attractors.setInteractionMetrics) {
      this.attractors.setInteractionMetrics(metrics)
    }
  }

  // =========================================================================
  // Graphics Quality Control
  // =========================================================================

  applyGraphicsQuality() {
    if (typeof UserSettings === 'undefined') return

    let baseProfile = {
      shadowBlur: true,
      particleCount: 120,
      attractorPoints: 900,
      pulseGlow: true,
      cascadeEnabled: true
    }

    if (typeof DeviceCapabilities !== 'undefined') {
      baseProfile = DeviceCapabilities.getGraphicsProfile()
    }

    const profile = UserSettings.getEffectiveGraphicsProfile(baseProfile)

    if (this.springMesh) this.springMesh.setShadowBlurEnabled(profile.shadowBlur !== false)
    if (this.wavePackets) this.wavePackets.setGlowEnabled(profile.pulseGlow !== false)
    if (this.particles) {
      this.particles.setCascadeEnabled(profile.cascadeEnabled !== false)
      if (profile.particleCount) this.particles.setMaxParticles(profile.particleCount)
    }
    if (this.attractors && profile.attractorPoints) {
      this.attractors.setPointLimit(profile.attractorPoints)
    }

    this.currentGraphicsProfile = profile
  }

  setGraphicsQuality(quality) {
    const profiles = {
      full: { shadowBlur: true, particleCount: 120, attractorPoints: 900, pulseGlow: true, cascadeEnabled: true },
      reduced: { shadowBlur: false, particleCount: 80, attractorPoints: 600, pulseGlow: false, cascadeEnabled: true },
      minimal: { shadowBlur: false, particleCount: 40, attractorPoints: 300, pulseGlow: false, cascadeEnabled: false }
    }

    const profile = profiles[quality] || profiles.full

    if (this.springMesh) this.springMesh.setShadowBlurEnabled(profile.shadowBlur)
    if (this.wavePackets) this.wavePackets.setGlowEnabled(profile.pulseGlow)
    if (this.particles) {
      this.particles.setCascadeEnabled(profile.cascadeEnabled)
      this.particles.setMaxParticles(profile.particleCount)
    }
    if (this.attractors) this.attractors.setPointLimit(profile.attractorPoints)

    this.currentGraphicsProfile = profile
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  dispose() {
    // Stop draw loop
    if (this._rafId) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }

    // Clean up listeners
    if (this._reducedMotionQuery && this._handleReducedMotionChange) {
      this._reducedMotionQuery.removeEventListener('change', this._handleReducedMotionChange)
      this._reducedMotionQuery = null
    }
    if (this._handleThemeChange) {
      window.removeEventListener('theme-change', this._handleThemeChange)
    }

    this._pendingAudioStress = null
    this._audioPerformanceOverride = null
    this._contextRestoreCallbacks = null

    // Dispose subsystems
    if (this.attractors) { this.attractors.dispose(); this.attractors = null }
    if (this.nebulas) { this.nebulas.dispose(); this.nebulas = null }
    if (this.particles) { this.particles.dispose(); this.particles = null }
    if (this.wavePackets) { this.wavePackets.dispose(); this.wavePackets = null }
    if (this.springMesh) { this.springMesh.dispose(); this.springMesh = null }

    // Dispose PixiAdapter
    if (this.pixiAdapter) {
      this.pixiAdapter.dispose()
      this.pixiAdapter = null
    }

    this._compatShim = null

    if (window.visualService === this) {
      delete window.visualService
    }
  }
}

// Make GenerativeVisualService available globally
if (typeof window !== 'undefined') {
  window.GenerativeVisualService = GenerativeVisualService
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GenerativeVisualService
}
