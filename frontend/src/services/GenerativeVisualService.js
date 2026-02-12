/**
 * GenerativeVisualService
 * Orchestrates enhanced generative graphics driven by user gestures
 *
 * Architecture:
 * - SpringMeshNetwork: Physics simulation and curved edges
 * - WavePacketSystem: Pulse propagation along edges
 * - ParticleFlowManager: Particle flow effects
 * - NeonNebulaSystem: Discrete floating nebula blobs with neon glow
 * - PrecomputedAttractorSystem: Strange attractors (Lorenz/Rossler) with precomputed keyframes
 *
 * Responsibilities:
 * - CanvasAdapter instance lifecycle (setup, draw, dispose)
 * - Coordinate all visual subsystems
 * - Maintain API compatibility (updateCursorPosition, updateGestureData, removeUser)
 * - Performance monitoring and degradation modes
 */

class GenerativeVisualService {
  constructor() {
    // CanvasAdapter instance (p5-compatible, created in instance mode)
    this.p5Instance = null

    // Subsystems
    this.springMesh = null
    this.wavePackets = null
    this.particles = null
    this.nebulas = null
    this.attractors = null

    // Accessibility: Reduced motion preference
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Listen for changes to reduced motion preference
    this._reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    this._handleReducedMotionChange = this._handleReducedMotionChange.bind(this)
    this._reducedMotionQuery.addEventListener('change', this._handleReducedMotionChange)

    // Performance monitoring
    this.lastFrameTime = 0
    this.fps = 30
    this.performanceMode = 'normal' // 'normal', 'degraded', 'disabled'
    this.frameCount = 0

    // PERF: Stress factor for graceful degradation (0.3-1.0)
    // Exposed for subsystems to reduce particle/pulse counts under stress
    this.stressFactor = 1.0

    // Idle detection (Phase 3 optimization)
    this.lastActivityTime = Date.now()
    this.lastWaveEmit = Date.now()
    this.lastParticleEmit = Date.now()

    // Mobile-specific idle thresholds
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
    this.idleThreshold = isMobile ? 1000 : 2000  // 1s mobile, 2s desktop (Phase 3)
    this.isPaused = false

    // Performance configuration
    this.targetFps = 30
    this._originalTargetFps = 30
    this.degradeThreshold = 20
    this.disableThreshold = 15
    this.recoveryThreshold = 28

    // AUDIO PRIORITY: Audio-driven performance override with hysteresis
    this._audioPerformanceOverride = null  // null = no audio override active
    this._pendingAudioStress = null        // Queued for frame-boundary application
    this._lastQualityTransition = 0        // Timestamp for cooldown enforcement
    this._consecutiveOverruns = 0          // Frame budget overrun counter

    // P&P emission throttling per user
    this._lastEmitByUser = new Map()
    this.MIN_EMIT_INTERVAL = 300  // ms between p&p emissions per user
    this.frameSampleInterval = 60

    // Background colors for themes (matching CSS --void)
    this.bgColors = {
      dark: [2, 2, 8],       // #020208
      light: [224, 224, 240] // #e0e0f0
    }
    // Set initial background based on current theme
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark'
    this.bgColor = this.bgColors[currentTheme] || this.bgColors.dark

    // Listen for theme changes
    this._handleThemeChange = this._handleThemeChange.bind(this)
    window.addEventListener('theme-change', this._handleThemeChange)
  }

  /**
   * Handle theme change event
   * @param {CustomEvent} event - theme-change event with { theme: 'dark' | 'light' }
   */
  _handleThemeChange(event) {
    // Read from event detail, fallback to DOM attribute, fallback to 'dark'
    let theme = event?.detail?.theme
    if (!theme) {
      // Fallback: read directly from DOM
      const attr = document.documentElement.getAttribute('data-theme')
      theme = attr === 'light' ? 'light' : 'dark'
    }
    this.bgColor = this.bgColors[theme] || this.bgColors.dark

    // Wake from idle state to ensure background is redrawn
    // This fixes the issue where theme change doesn't update canvas when paused
    this.isPaused = false
    this.lastActivityTime = Date.now()
  }

  /**
   * Initialize CanvasAdapter instance and all subsystems
   * @param {HTMLElement} containerElement - DOM element to attach canvas
   */
  initialize(containerElement) {

    if (!containerElement) {
      console.error('❌ GenerativeVisualService: Container element not found')
      return
    }

    // Save container reference
    this.containerElement = containerElement

    try {
      // Initialize subsystems
      this.springMesh = new SpringMeshNetwork()

      this.wavePackets = new WavePacketSystem(this.springMesh)

      this.particles = new ParticleFlowManager(this.springMesh)

      // NeonNebulaSystem is loaded via script tag and exposed on window
      if (typeof NeonNebulaSystem === 'undefined' && typeof window.NeonNebulaSystem === 'undefined') {
        console.error('❌ NeonNebulaSystem not loaded - ensure script is included before GenerativeVisualService')
      }
      const NebulaClass = typeof NeonNebulaSystem !== 'undefined' ? NeonNebulaSystem : window.NeonNebulaSystem
      this.nebulas = new NebulaClass()

      this.attractors = new PrecomputedAttractorSystem()

      // Create CanvasAdapter instance (lightweight p5-compatible replacement)
      this.p5Instance = new CanvasAdapter((p) => {
        p.setup = () => {
          this.setup(p)
        }
        p.draw = () => {
          this.draw(p)
        }
      }, containerElement)

      // PERF: Expose instance on window for subsystem stress factor access
      window.visualService = this

      // Note: Graphics quality is now applied in setup() after canvas is ready
      // This prevents race conditions where settings are applied before subsystems
      // are fully connected to the rendering context

      // Apply reduced motion settings if user prefers
      if (this.prefersReducedMotion) {
        this._applyReducedMotionSettings()
      }

    } catch (error) {
      console.error('❌ Error during GenerativeVisualService initialization:', error)
      throw error
    }
  }

  /**
   * Handle changes to reduced motion preference
   * @param {MediaQueryListEvent} event - Media query change event
   * @private
   */
  _handleReducedMotionChange(event) {
    this.prefersReducedMotion = event.matches
    if (this.prefersReducedMotion) {
      this._applyReducedMotionSettings()
    } else {
      this._restoreMotionSettings()
    }
  }

  /**
   * Apply settings for users who prefer reduced motion
   * Disables or minimizes animations while preserving core functionality
   * @private
   */
  _applyReducedMotionSettings() {
    // Disable nebula animations
    if (this.nebulas) {
      this.nebulas.setPerformanceMode('disabled')
    }

    // Disable attractor animations
    if (this.attractors) {
      this.attractors.setPerformanceMode('disabled')
    }

    // Reduce particle effects
    if (this.particles) {
      this.particles.setCascadeEnabled(false)
      this.particles.setMaxParticles(0)
    }

    // Disable wave pulse glow effects
    if (this.wavePackets) {
      this.wavePackets.setGlowEnabled(false)
    }
  }

  /**
   * Restore motion settings when user preference changes
   * @private
   */
  _restoreMotionSettings() {
    // Re-apply graphics quality which will restore appropriate settings
    this.applyGraphicsQuality()
  }

  /**
   * Canvas setup - runs once on initialization
   * @param {CanvasAdapter} p - CanvasAdapter instance
   */
  setup(p) {
    // CRITICAL: Set pixel density to 1 for consistent coordinate mapping
    // Prevents coordinate scaling issues on high-DPI displays
    p.pixelDensity(1)

    // Get container dimensions
    const containerWidth = this.containerElement.offsetWidth
    const containerHeight = this.containerElement.offsetHeight

    // Verify dimensions before creating canvas (prevents flickering)
    if (containerWidth === 0 || containerHeight === 0) {
      setTimeout(() => this.setup(p), 100)
      return
    }

    // Create canvas matching container size
    p.createCanvas(containerWidth, containerHeight)

    // FIX: Set z-index lower than trail-overlay (z-index: 10) so trails render on top
    // Use position:absolute (not relative) to enable z-index without affecting layout
    if (p.canvas) {
      p.canvas.style.position = 'absolute'
      p.canvas.style.top = '0'
      p.canvas.style.left = '0'
      p.canvas.style.zIndex = '1'
    }

    // Set frame rate cap
    p.frameRate(this.targetFps)

    // Initialize frame time
    this.lastFrameTime = p.millis()

    // Initialize background nodes explicitly (prevents flickering on first frame)
    if (this.springMesh && !this.springMesh.backgroundNodesInitialized) {
      this.springMesh.initializeBackgroundNodes()
    }

    // RACE CONDITION FIX: Apply graphics quality settings AFTER p5 setup completes
    // This ensures all subsystems are properly connected to the p5 rendering context
    try {
      this.applyGraphicsQuality()
    } catch (e) {
    }

  }

  /**
   * Canvas draw - runs every frame
   * @param {CanvasAdapter} p - CanvasAdapter instance
   */
  draw(p) {
    // Check idle state
    if (this.isPaused) {
      return
    }

    // AUDIO PRIORITY: Apply queued audio stress at frame boundary
    if (this._pendingAudioStress) {
      this._applyAudioStressInternal(this._pendingAudioStress)
      this._pendingAudioStress = null
    }

    // Calculate delta time and FPS
    const now = p.millis()
    const delta = now - this.lastFrameTime
    const dt = Math.min(delta / 1000, 0.1) // Cap at 100ms
    this.lastFrameTime = now

    // Calculate FPS (exponential moving average)
    if (delta > 0 && delta < 1000) {  // Ignore first frame and anomalies
      const instantFps = 1000 / delta
      this.fps = this.fps * 0.9 + instantFps * 0.1
    }

    // Performance monitoring
    this.updatePerformanceMetrics(p)

    // AUDIO PRIORITY: Frame budget enforcement
    // Reserve time for audio scheduling, browser compositor, and GC headroom
    const frameStart = performance.now()
    const OVERHEAD_RESERVE_MS = 22  // 12ms audio + 6ms browser + 4ms GC (audio priority)
    const frameBudgetMs = (1000 / this.targetFps) - OVERHEAD_RESERVE_MS

    // Clear background (theme-aware)
    p.background(...this.bgColor)

    // Update and render based on performance mode
    if (this.performanceMode === 'disabled') {
      // Minimal rendering - simple nodes only
      this.renderSimpleNodes(p)
    } else {
      // Phase 3 Idle Detection: Skip wave/particle updates if no recent activity
      const nowMs = Date.now()
      // DEFENSIVE FIX: Use Math.max to handle clock adjustments (NTP, timezone, DST)
      const waveIdle = Math.max(0, nowMs - this.lastWaveEmit) > this.idleThreshold && this.wavePackets.getPulseCount() === 0
      const particleIdle = Math.max(0, nowMs - this.lastParticleEmit) > this.idleThreshold && this.particles.getParticleCount() === 0

      // PRIORITY 1 (always): Physics + spring mesh (core visual identity)
      this.springMesh.updatePhysics(dt)
      if (this.nebulas) this.nebulas.update(dt)
      if (this.attractors) this.attractors.update(dt)
      if (!waveIdle) this.wavePackets.update(dt)
      if (!particleIdle) this.particles.update(dt)

      // Render: spring mesh always renders (core identity)
      this.springMesh.render(p)

      // PRIORITY 2: Nebulas (cheap - offscreen buffer blit)
      if (performance.now() - frameStart < frameBudgetMs) {
        if (this.nebulas) {
          this.nebulas.setPerformanceMode(this.performanceMode)
          this.nebulas.render(p)
        }
      }

      // PRIORITY 3: Wave pulses
      if (performance.now() - frameStart < frameBudgetMs) {
        this.wavePackets.render(p)
      }

      // PRIORITY 4: Attractors (expensive - 900+ ellipses)
      if (performance.now() - frameStart < frameBudgetMs * 0.85) {
        if (this.attractors) {
          this.attractors.setPerformanceMode(this.performanceMode)
          this.attractors.setStressFactor(this.stressFactor)
          if (this.nebulas && this.nebulas.currentPalette) {
            const nebulaColor = this.nebulas.currentPalette.colors[0]
            this.attractors.setBaseColor(nebulaColor)
          }
          this.attractors.render(p)
        }
      }

      // PRIORITY 5: Particles
      if (performance.now() - frameStart < frameBudgetMs * 0.85) {
        this.particles.render(p)
      }

      // AUDIO PRIORITY: Track frame overruns for preemptive stress reduction
      // Only apply when no audio override is active (prevents double penalty)
      // Visual-only stress floor at 0.5: frame overruns alone can't trigger emergency-like state
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

      // Hold indicators REMOVED - SpringMeshNetwork already renders hold state via node pulsing
    }

  }

  /**
   * Render simple nodes only (fallback mode)
   * @param {p5} p - p5.js instance
   */
  renderSimpleNodes(p) {
    for (const node of this.springMesh.nodes.values()) {
      const x = node.x * p.width
      const y = node.y * p.height

      p.noStroke()
      p.fill(node.color)
      p.circle(x, y, 10)
    }
  }

  /**
   * Update cursor position for a user (API compatible)
   * @param {string} userId - User identifier
   * @param {number} x - Normalized x position (0-1)
   * @param {number} y - Normalized y position (0-1)
   * @param {string} color - CSS color string
   */
  updateCursorPosition(userId, x, y, color) {
    if (!this.springMesh) {
      // console.warn('⚠️ springMesh not initialized in updateCursorPosition')
      return
    }

    this.springMesh.updateNode(userId, x, y, color, {
      type: 'idle',
      isActive: false
    })

    this.lastActivityTime = Date.now()
    this.isPaused = false

    // Debug: Log first cursor update
    if (this.springMesh.nodes.size === 1) {
      // console.log('🎨 First cursor added to visual service:', userId, 'at', x, y)
    }
  }

  /**
   * Update gesture data for a user (API compatible)
   * @param {string} userId - User identifier
   * @param {Object} gestureData - {type, velocity, holdStart, isActive}
   */
  updateGestureData(userId, gestureData) {
    if (!this.springMesh) {
      return
    }

    // Update the node in the spring mesh
    const node = this.springMesh.nodes.get(userId)

    if (node) {
      node.gestureType = gestureData.type || 'idle'
      node.isActive = gestureData.isActive || false

      // console.log('🎨 Node updated:', {
//        userId: userId.substring(0, 8),
//        gestureType: node.gestureType,
//        isActive: node.isActive,
//        color: node.color
////      })

      // Trigger visual effects based on gesture state
      if (gestureData.isActive) {
        // Emit wave pulse on tap, drag, or hold start
        if (gestureData.type === 'tap' || gestureData.type === 'drag' || gestureData.type === 'hold') {
          // THROTTLE: Check per-user emission rate to prevent p&p storms
          const now = Date.now()
          const lastEmit = this._lastEmitByUser.get(userId) || 0
          if (now - lastEmit < this.MIN_EMIT_INTERVAL) {
            // Skip emission, too soon since last p&p for this user
            return
          }
          this._lastEmitByUser.set(userId, now)

          // Emit pulse
          if (this.wavePackets) {
            this.wavePackets.emitPulse(userId, node.color)
            this.lastWaveEmit = Date.now()  // Track wave emission for idle detection
          }

          // Also emit particles on tap/hold for better visual feedback
          // PERF: Reduce particle emission under stress
          const baseCount = (gestureData.type === 'tap' || gestureData.type === 'hold') ? 5 : 2
          const particleCount = Math.max(1, Math.floor(baseCount * this.stressFactor))
          if (this.particles) {
            this.particles.emitParticles(userId, particleCount)
            this.lastParticleEmit = Date.now()  // Track particle emission for idle detection
          }
        }

        // Sequencer events: emit particles only (no wave pulses — those cause WaveContext leak)
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
    } else {
      // console.warn('⚠️ Node not found in spring mesh for userId:', userId.substring(0, 8))
      // console.log('🎨 Available nodes:', Array.from(this.springMesh.nodes.keys()).map(id => id.substring(0, 8)))
    }

    this.lastActivityTime = Date.now()
    this.isPaused = false
  }

  /**
   * Remove user from visualization (API compatible)
   * @param {string} userId - User identifier
   */
  removeUser(userId) {
    this.springMesh.removeNode(userId)
    // FIX: Clean up emission throttle tracking to prevent memory leak
    this._lastEmitByUser.delete(userId)
  }

  /**
   * Resize canvas to match container
   * Called by CanvasManager on window resize
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    if (this.p5Instance) {
      this.p5Instance.resizeCanvas(width, height)
      // console.log('GenerativeVisualService: Resized to', width, 'x', height)
    }
  }

  /**
   * Performance monitoring and degradation
   * PERFORMANCE: Integrates with AudioPerformanceController for audio-over-graphics priority
   * @param {p5} p - p5.js instance
   */
  updatePerformanceMetrics(p) {
    this.frameCount++

    // Only check performance every N frames to avoid overhead
    if (this.frameCount % this.frameSampleInterval === 0) {
      const graphicsBudget = Math.min(1.0, Math.max(0.3, this.fps / this.targetFps))

      // AUDIO PRIORITY: When audio override is active, use the LOWER of graphics and audio stress
      // This ensures graphics never exceeds what audio can tolerate
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

    // Check idle state
    if (Date.now() - this.lastActivityTime > this.idleThreshold) {
      if (!this.isPaused) {
        this.isPaused = true
        // console.log('GenerativeVisualService: Paused due to inactivity')
      }
    }
  }

  // =========================================================================
  // AUDIO PRIORITY: Audio stress → graphics degradation with hysteresis
  // =========================================================================

  /**
   * Queue audio stress data for application at next frame boundary
   * Prevents mid-frame state inconsistency
   * @param {Object} stressData - { stressFactor, mode, underrunCount }
   */
  applyAudioStress(stressData) {
    this._pendingAudioStress = stressData
  }

  /**
   * Apply queued audio stress at frame boundary (called from draw())
   * Uses hysteresis to prevent quality oscillation
   * @param {Object} stressData - { stressFactor, mode, underrunCount }
   * @private
   */
  _applyAudioStressInternal(stressData) {
    const COOLDOWN_MS = 2000
    const DEGRADE_THRESHOLD = 0.5
    const RECOVER_THRESHOLD = 0.7

    const now = Date.now()
    if (now - this._lastQualityTransition < COOLDOWN_MS) return

    const { stressFactor: audioStress, mode } = stressData
    const currentMode = this._audioPerformanceOverride || 'normal'

    // Hysteresis: different thresholds for degradation vs recovery
    if (mode !== 'normal' && currentMode === 'normal') {
      if (audioStress >= DEGRADE_THRESHOLD) return
    }
    if (mode === 'normal' && currentMode !== 'normal') {
      if (audioStress <= RECOVER_THRESHOLD) return
    }

    this._lastQualityTransition = now

    if (mode === 'emergency') {
      // AUDIO PRIORITY: Near-freeze — maximum main thread freedom for audio
      this._setAudioDrivenPerformanceMode('degraded')
      this._reduceFrameRate(5)
      if (this.springMesh) this.springMesh.setCurveSegments(2)
    } else if (mode === 'minimal') {
      this._setAudioDrivenPerformanceMode('degraded')
      this._reduceFrameRate(10)
      if (this.springMesh) this.springMesh.setCurveSegments(4)
    } else if (mode === 'degraded') {
      this._setAudioDrivenPerformanceMode('degraded')
      this._reduceFrameRate(20)
      if (this.springMesh) this.springMesh.setCurveSegments(10)
    } else {
      this._clearAudioDrivenPerformanceMode()
      this._restoreFrameRate()
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
  _reduceFrameRate(targetFps) {
    if (this.p5Instance && this.targetFps > targetFps) {
      this.targetFps = targetFps
      this.p5Instance.frameRate(targetFps)
    }
  }

  /** @private */
  _restoreFrameRate() {
    if (this.p5Instance && this.targetFps < this._originalTargetFps) {
      this.targetFps = this._originalTargetFps
      this.p5Instance.frameRate(this._originalTargetFps)
    }
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
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

  /**
   * Get subsystem references for external access
   * @returns {Object} Subsystem references
   */
  getSubsystems() {
    return {
      springMesh: this.springMesh,
      wavePackets: this.wavePackets,
      particles: this.particles,
      nebulas: this.nebulas,
      attractors: this.attractors
    }
  }

  /**
   * Handle musical events - forward to nebulas and attractors
   * @param {Object} event - Musical event {type, velocity, pitch}
   */
  onMusicalEvent(event) {
    if (this.nebulas && this.nebulas.onMusicalEvent) {
      this.nebulas.onMusicalEvent(event)
    }
    if (this.attractors) {
      this.attractors.onMusicalEvent(event)
    }
  }

  /**
   * Handle background composition events - forward to nebulas and attractors
   * @param {Object} composition - Background composition from backend
   */
  onBackgroundComposition(composition) {
    if (this.nebulas && this.nebulas.onBackgroundComposition) {
      this.nebulas.onBackgroundComposition(composition)
    }
    if (this.attractors && this.attractors.onBackgroundComposition) {
      this.attractors.onBackgroundComposition(composition)
    }
  }

  /**
   * Update interaction metrics for spatial gradient effects
   * @param {Object} metrics - Interaction metrics from backend
   * @param {number} [metrics.userCount] - Number of active users (1-10)
   * @param {number} [metrics.spatialDensity] - Spatial clustering density (0-1)
   * @param {Object} [metrics.dominantZone] - Activity center position {x: 0-1, y: 0-1}
   */
  updateInteractionMetrics(metrics) {
    if (!metrics) return

    if (this.nebulas && this.nebulas.setInteractionMetrics) {
      try {
        this.nebulas.setInteractionMetrics(metrics)
      } catch (error) {
        console.error('GenerativeVisualService: Error updating interaction metrics:', error)
      }
    } else {
    }

    // Forward to attractors for hue animation
    if (this.attractors && this.attractors.setInteractionMetrics) {
      this.attractors.setInteractionMetrics(metrics)
    }
  }

  // REMOVED: Hold indicator rendering - SpringMeshNetwork handles hold visualization via node pulsing
  // REMOVED: setCursorManager and renderCursors - cursors now rendered in SpringMeshNetwork as nodes

  // =========================================================================
  // Entry #74: Graphics Quality Control
  // =========================================================================

  /**
   * Apply graphics quality settings from UserSettings
   * Called when settings panel applies new graphics quality
   */
  applyGraphicsQuality () {
    if (typeof UserSettings === 'undefined') {
      return
    }

    // Entry #90 FIX: Get base profile from device capabilities (not hardcoded full)
    let baseProfile = {
      shadowBlur: true,
      particleCount: 120,
      attractorPoints: 900,
      pulseGlow: true,
      cascadeEnabled: true
    }

    // Use device-detected profile if available
    if (typeof DeviceCapabilities !== 'undefined') {
      baseProfile = DeviceCapabilities.getGraphicsProfile()
    }

    // Get effective profile with user overrides
    const profile = UserSettings.getEffectiveGraphicsProfile(baseProfile)


    // Apply to SpringMeshNetwork (node glow)
    if (this.springMesh) {
      this.springMesh.setShadowBlurEnabled(profile.shadowBlur !== false)
    } else {
    }

    // Apply to WavePacketSystem (pulses)
    if (this.wavePackets) {
      this.wavePackets.setGlowEnabled(profile.pulseGlow !== false)
    } else {
    }

    // Apply to ParticleFlowManager
    if (this.particles) {
      this.particles.setCascadeEnabled(profile.cascadeEnabled !== false)
      if (profile.particleCount) {
        this.particles.setMaxParticles(profile.particleCount)
      }
    } else {
    }

    // Apply to PrecomputedAttractorSystem
    if (this.attractors && profile.attractorPoints) {
      this.attractors.setPointLimit(profile.attractorPoints)
    } else if (!this.attractors) {
    }

    // Store current profile for reference
    this.currentGraphicsProfile = profile
  }

  /**
   * Set graphics quality directly (alternative to applyGraphicsQuality)
   * @param {string} quality - 'full', 'reduced', 'minimal'
   */
  setGraphicsQuality (quality) {
    const profiles = {
      full: {
        shadowBlur: true,
        particleCount: 120,
        attractorPoints: 900,
        pulseGlow: true,
        cascadeEnabled: true
      },
      reduced: {
        shadowBlur: false,
        particleCount: 80,
        attractorPoints: 600,
        pulseGlow: false,
        cascadeEnabled: true
      },
      minimal: {
        shadowBlur: false,
        particleCount: 40,
        attractorPoints: 300,
        pulseGlow: false,
        cascadeEnabled: false
      }
    }

    const profile = profiles[quality] || profiles.full


    // Apply to subsystems
    if (this.springMesh) {
      this.springMesh.setShadowBlurEnabled(profile.shadowBlur)
    }

    if (this.wavePackets) {
      this.wavePackets.setGlowEnabled(profile.pulseGlow)
    }

    if (this.particles) {
      this.particles.setCascadeEnabled(profile.cascadeEnabled)
      this.particles.setMaxParticles(profile.particleCount)
    }

    if (this.attractors) {
      this.attractors.setPointLimit(profile.attractorPoints)
    }

    this.currentGraphicsProfile = profile
  }

  /**
   * Cleanup: remove p5.js instance and dispose subsystems
   */
  dispose() {
    // Clean up reduced motion listener
    if (this._reducedMotionQuery && this._handleReducedMotionChange) {
      this._reducedMotionQuery.removeEventListener('change', this._handleReducedMotionChange)
      this._reducedMotionQuery = null
    }

    // Clean up theme change listener
    if (this._handleThemeChange) {
      window.removeEventListener('theme-change', this._handleThemeChange)
    }

    // AUDIO PRIORITY: Clear pending stress state
    this._pendingAudioStress = null
    this._audioPerformanceOverride = null

    // Dispose subsystems
    if (this.attractors) {
      this.attractors.dispose()
      this.attractors = null
    }

    if (this.nebulas) {
      this.nebulas.dispose()
      this.nebulas = null
    }

    if (this.particles) {
      this.particles.dispose()
      this.particles = null
    }

    if (this.wavePackets) {
      this.wavePackets.dispose()
      this.wavePackets = null
    }

    if (this.springMesh) {
      this.springMesh.dispose()
      this.springMesh = null
    }

    // Remove CanvasAdapter instance
    if (this.p5Instance) {
      this.p5Instance.remove()
      this.p5Instance = null
    }

    // Entry #46 FIX: Clean up global window reference to prevent memory leak
    // If this instance is the one exposed globally, remove the reference
    if (window.visualService === this) {
      delete window.visualService
    }

    // console.log('✅ GenerativeVisualService: Disposed')
  }
}

// Make GenerativeVisualService available globally
if (typeof window !== 'undefined') {
  window.GenerativeVisualService = GenerativeVisualService
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GenerativeVisualService
}
