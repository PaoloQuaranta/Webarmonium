/**
 * GenerativeVisualService
 * Orchestrates enhanced generative graphics driven by user gestures
 *
 * Architecture:
 * - SpringMeshNetwork: Physics simulation and curved edges
 * - WavePacketSystem: Pulse propagation along edges
 * - ParticleFlowManager: Particle flow effects
 * - NoiseTextureNebulaSystem: Atmospheric noise texture background
 * - PrecomputedAttractorSystem: Strange attractors (Lorenz/Rossler) with precomputed keyframes
 *
 * Responsibilities:
 * - p5.js instance lifecycle (setup, draw, dispose)
 * - Coordinate all visual subsystems
 * - Maintain API compatibility (updateCursorPosition, updateGestureData, removeUser)
 * - Performance monitoring and degradation modes
 */

class GenerativeVisualService {
  constructor() {
    // p5.js instance (created in instance mode)
    this.p5Instance = null

    // Subsystems
    this.springMesh = null
    this.wavePackets = null
    this.particles = null
    this.nebulas = null
    this.attractors = null

    // Performance monitoring
    this.lastFrameTime = 0
    this.fps = 30
    this.performanceMode = 'normal' // 'normal', 'degraded', 'disabled'
    this.frameCount = 0

    // PERF: Stress factor for graceful degradation (0.3-1.0)
    // Exposed for subsystems to reduce particle/pulse counts under stress
    this.stressFactor = 1.0

    // Idle detection
    this.lastActivityTime = Date.now()
    this.idleThreshold = 10000 // 10 seconds
    this.isPaused = false

    // Performance configuration
    this.targetFps = 30
    this.degradeThreshold = 20
    this.disableThreshold = 15
    this.recoveryThreshold = 28

    // P&P emission throttling per user
    this._lastEmitByUser = new Map()
    this.MIN_EMIT_INTERVAL = 300  // ms between p&p emissions per user
    this.frameSampleInterval = 60

    // Background color (matching Webarmonium theme)
    this.bgColor = [26, 26, 46]

    // PERF: Consolidated cursor rendering (eliminates CursorManager rAF loop)
    this.cursorManager = null
    this.getActiveLocalHold = null  // Function to get local hold state
    this.getActiveRemoteHolds = null  // Function to get remote holds Map
  }

  /**
   * Initialize p5.js instance and all subsystems
   * @param {HTMLElement} containerElement - DOM element to attach p5.js canvas
   */
  initialize(containerElement) {
    console.log('🎨 GenerativeVisualService.initialize() called with container:', containerElement)

    if (!containerElement) {
      console.error('❌ GenerativeVisualService: Container element not found')
      return
    }

    // Save container reference
    this.containerElement = containerElement

    try {
      // Initialize subsystems
      console.log('🎨 Creating SpringMeshNetwork...')
      this.springMesh = new SpringMeshNetwork()

      console.log('🎨 Creating WavePacketSystem...')
      this.wavePackets = new WavePacketSystem(this.springMesh)

      console.log('🎨 Creating ParticleFlowManager...')
      this.particles = new ParticleFlowManager(this.springMesh)

      console.log('🎨 Creating NoiseTextureNebulaSystem...')
      this.nebulas = new NoiseTextureNebulaSystem()

      console.log('🎨 Creating PrecomputedAttractorSystem...')
      this.attractors = new PrecomputedAttractorSystem()

      console.log('🎨 Creating p5 instance...')
      // Create p5.js instance in instance mode
      this.p5Instance = new p5((p) => {
        p.setup = () => {
          console.log('🎨 p5 setup() called')
          this.setup(p)
        }
        p.draw = () => {
          this.draw(p)
        }
      }, containerElement)

      // PERF: Expose instance on window for subsystem stress factor access
      window.visualService = this

      // Note: Graphics quality is now applied in setup() after p5.js canvas is ready
      // This prevents race conditions where settings are applied before subsystems
      // are fully connected to the p5 rendering context

      console.log('✅ GenerativeVisualService: Enhanced p5.js initialized with subsystems')
    } catch (error) {
      console.error('❌ Error during GenerativeVisualService initialization:', error)
      throw error
    }
  }

  /**
   * p5.js setup - runs once on initialization
   * @param {p5} p - p5.js instance
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
      console.warn('GenerativeVisualService: Container has zero dimensions, deferring setup')
      setTimeout(() => this.setup(p), 100)
      return
    }

    // Create canvas matching container size
    p.createCanvas(containerWidth, containerHeight)

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
      console.log('🎨 Graphics quality applied after p5 setup')
    } catch (e) {
      console.warn('🎨 Failed to apply graphics quality after setup:', e)
    }

    console.log('✅ GenerativeVisualService: Canvas created', containerWidth, 'x', containerHeight, 'pixelDensity:', p.pixelDensity())
  }

  /**
   * p5.js draw - runs every frame
   * @param {p5} p - p5.js instance
   */
  draw(p) {
    // Check idle state
    if (this.isPaused) {
      return
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

    // Clear background (match Webarmonium background color)
    p.background(26, 26, 46)

    // Update and render based on performance mode
    if (this.performanceMode === 'disabled') {
      // Minimal rendering - simple nodes only
      this.renderSimpleNodes(p)
    } else {
      // Update all systems
      this.springMesh.updatePhysics(dt)
      this.wavePackets.update(dt)
      this.particles.update(dt)
      if (this.nebulas) this.nebulas.update(dt)
      if (this.attractors) this.attractors.update(dt)

      // Render layers (back to front)
      // 0. Nebulas (background layer) - render in both normal and degraded modes
      if (this.nebulas) {
        this.nebulas.setPerformanceMode(this.performanceMode)
        this.nebulas.render(p)
      }

      // 1. Spring mesh network (curved edges + nodes)
      this.springMesh.render(p)

      // 2. Wave pulses
      this.wavePackets.render(p)

      // 3. Particles (skip in degraded mode)
      if (this.performanceMode === 'normal') {
        this.particles.render(p)
      }

      // 4. Attractors (top layer)
      if (this.attractors) {
        this.attractors.setPerformanceMode(this.performanceMode)
        this.attractors.setStressFactor(this.stressFactor)
        // Sync color with current nebula palette
        if (this.nebulas && this.nebulas.currentPalette) {
          const nebulaColor = this.nebulas.currentPalette.colors[0]
          this.attractors.setBaseColor(nebulaColor)
        }
        this.attractors.render(p)
      }

      // 5. Hold indicators (pulsing circles)
      // Eliminates separate startRenderLoop() rAF in main.js
      this.renderHoldIndicators(p)
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
          }

          // Also emit particles on tap/hold for better visual feedback
          // PERF: Reduce particle emission under stress
          const baseCount = (gestureData.type === 'tap' || gestureData.type === 'hold') ? 5 : 2
          const particleCount = Math.max(1, Math.floor(baseCount * this.stressFactor))
          if (this.particles) {
            this.particles.emitParticles(userId, particleCount)
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
      // Performance mode based on FPS only - audio stress should NOT affect graphics
      // The user experience is more important than "protecting" audio
      const graphicsBudget = Math.min(1.0, Math.max(0.3, this.fps / this.targetFps))

      // PERF: Expose stress factor for subsystems (particle/pulse limiting)
      // Entry #46 FIX: Enforce minimum 0.3 to prevent zero particle/pulse limits
      // If FPS drops very low, stressFactor could become < 0.3 without this enforcement
      this.stressFactor = Math.max(0.3, graphicsBudget)

      let targetMode = this.performanceMode

      if (graphicsBudget < 0.5) {
        // Only degrade if graphics FPS is actually low
        targetMode = 'degraded'
      } else {
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
   * Handle background composition events - forward to nebulas
   * @param {Object} composition - Background composition from backend
   */
  onBackgroundComposition(composition) {
    if (this.nebulas && this.nebulas.onBackgroundComposition) {
      this.nebulas.onBackgroundComposition(composition)
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
      console.warn('🎨 updateInteractionMetrics: nebulas not available', {
        hasNebulas: !!this.nebulas,
        hasMethod: !!(this.nebulas && this.nebulas.setInteractionMetrics)
      })
    }
  }

  // =========================================================================
  // CONSOLIDATED CURSOR RENDERING (Fase 9 - Performance Optimization)
  // Eliminates separate CursorManager rAF loop by rendering cursors in p5.js
  // =========================================================================

  /**
   * Set cursor manager reference for consolidated rendering
   * @param {CursorManager} cursorManager - Reference to cursor manager
   */
  setCursorManager(cursorManager) {
    this.cursorManager = cursorManager
  }

  /**
   * Set hold state accessor functions
   * @param {Function} getLocalHold - Function that returns activeLocalHold
   * @param {Function} getRemoteHolds - Function that returns activeRemoteHolds Map
   */
  setHoldReferences(getLocalHold, getRemoteHolds) {
    this.getActiveLocalHold = getLocalHold
    this.getActiveRemoteHolds = getRemoteHolds
  }

  /**
   * Render all cursors from CursorManager
   * PERF: Called from p5.js draw() loop instead of separate rAF loop
   * @param {p5} p - p5.js instance
   */
  renderCursors(p) {
    if (!this.cursorManager?.cursors) return

    this.cursorManager.cursors.forEach((cursor, userId) => {
      const { x, y, color, isDrawing, isVirtual, alpha } = cursor
      const pixelX = x * p.width
      const pixelY = y * p.height

      p.push()

      // Apply alpha for virtual cursor fade animations
      if (alpha !== undefined && alpha < 1) {
        p.drawingContext.globalAlpha = alpha
      }

      // Cursor circle - larger base size to match landing page visibility
      // Virtual cursors use dashed line style (handled below)
      const baseSize = isDrawing ? 16 : 20
      const size = baseSize
      p.noFill()
      p.stroke(color)
      p.strokeWeight(isVirtual ? 1.5 : 2.5)

      // Set dash pattern for virtual cursors
      if (isVirtual) {
        p.drawingContext.setLineDash([8, 5])
      }

      p.circle(pixelX, pixelY, size * 2)

      // Reset line dash
      if (isVirtual) {
        p.drawingContext.setLineDash([])
      }

      // Crosshair lines
      const crosshairExtend = 8
      p.strokeWeight(1.5)
      p.line(pixelX - size - crosshairExtend, pixelY, pixelX + size + crosshairExtend, pixelY)
      p.line(pixelX, pixelY - size - crosshairExtend, pixelX, pixelY + size + crosshairExtend)

      // User label
      const label = isVirtual ? userId.replace('-metrics', '') : userId.substring(0, 8)
      p.fill(color)
      p.noStroke()
      p.textAlign(p.CENTER, p.TOP)
      p.textSize(12)
      p.text(label, pixelX, pixelY + size + 8)

      p.pop()
    })
  }

  /**
   * Render hold indicators (pulsing circles for sustained holds)
   * PERF: Called from p5.js draw() loop instead of separate rAF loop
   * @param {p5} p - p5.js instance
   */
  renderHoldIndicators(p) {
    const now = Date.now()

    // Get hold states via accessor functions
    const activeLocalHold = this.getActiveLocalHold?.()
    const activeRemoteHolds = this.getActiveRemoteHolds?.()

    // Render local hold indicator
    if (activeLocalHold?.position) {
      const elapsed = now - (activeLocalHold.visualStartTime || now)
      const pulse = Math.sin(elapsed * 0.001 * Math.PI * 2)
      const radius = 20 + pulse * 5

      p.push()
      p.drawingContext.globalAlpha = 0.6 + pulse * 0.1
      p.noFill()
      p.stroke(activeLocalHold.color || '#6bcf7f')
      p.strokeWeight(3)
      p.circle(
        activeLocalHold.position.x * p.width,
        activeLocalHold.position.y * p.height,
        radius * 2
      )
      p.pop()
    }

    // Render remote hold indicators
    if (activeRemoteHolds?.size > 0) {
      activeRemoteHolds.forEach((hold, userId) => {
        if (!hold?.position) return

        const elapsed = now - (hold.visualStartTime || now)
        const pulse = Math.sin(elapsed * 0.001 * Math.PI * 2)
        const radius = 20 + pulse * 5

        p.push()
        p.drawingContext.globalAlpha = 0.5 + pulse * 0.1
        p.noFill()
        p.stroke(hold.color || '#ff6b6b')
        p.strokeWeight(3)
        p.circle(
          hold.position.x * p.width,
          hold.position.y * p.height,
          radius * 2
        )
        p.pop()
      })
    }
  }

  // =========================================================================
  // Entry #74: Graphics Quality Control
  // =========================================================================

  /**
   * Apply graphics quality settings from UserSettings
   * Called when settings panel applies new graphics quality
   */
  applyGraphicsQuality () {
    if (typeof UserSettings === 'undefined') {
      console.warn('UserSettings not loaded, cannot apply graphics quality')
      return
    }

    // Entry #90 FIX: Get base profile from device capabilities (not hardcoded full)
    let baseProfile = {
      shadowBlur: true,
      particleCount: 120,
      attractorPoints: 1200,
      pulseGlow: true,
      cascadeEnabled: true
    }

    // Use device-detected profile if available
    if (typeof DeviceCapabilities !== 'undefined') {
      baseProfile = DeviceCapabilities.getGraphicsProfile()
      console.log('🎨 Graphics baseProfile from DeviceCapabilities:', baseProfile)
    }

    // Get effective profile with user overrides
    const profile = UserSettings.getEffectiveGraphicsProfile(baseProfile)

    console.log('🎨 Applying graphics quality:', profile)
    console.log('🎨 Visual subsystems available:', {
      springMesh: !!this.springMesh,
      wavePackets: !!this.wavePackets,
      particles: !!this.particles,
      attractors: !!this.attractors
    })

    // Apply to SpringMeshNetwork (node glow)
    if (this.springMesh) {
      this.springMesh.setShadowBlurEnabled(profile.shadowBlur !== false)
      console.log('🎨 SpringMesh shadowBlur set to:', profile.shadowBlur !== false)
    } else {
      console.warn('🎨 No springMesh available')
    }

    // Apply to WavePacketSystem (pulses)
    if (this.wavePackets) {
      this.wavePackets.setGlowEnabled(profile.pulseGlow !== false)
      console.log('🎨 WavePackets glow set to:', profile.pulseGlow !== false)
    } else {
      console.warn('🎨 No wavePackets available')
    }

    // Apply to ParticleFlowManager
    if (this.particles) {
      this.particles.setCascadeEnabled(profile.cascadeEnabled !== false)
      if (profile.particleCount) {
        this.particles.setMaxParticles(profile.particleCount)
        console.log('🎨 Particles maxCount set to:', profile.particleCount)
      }
    } else {
      console.warn('🎨 No particles available')
    }

    // Apply to PrecomputedAttractorSystem
    if (this.attractors && profile.attractorPoints) {
      this.attractors.setPointLimit(profile.attractorPoints)
      console.log('🎨 Attractors pointLimit set to:', profile.attractorPoints)
    } else if (!this.attractors) {
      console.warn('🎨 No attractors available')
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
        attractorPoints: 1200,
        pulseGlow: true,
        cascadeEnabled: true
      },
      reduced: {
        shadowBlur: false,
        particleCount: 80,
        attractorPoints: 800,
        pulseGlow: false,
        cascadeEnabled: true
      },
      minimal: {
        shadowBlur: false,
        particleCount: 40,
        attractorPoints: 400,
        pulseGlow: false,
        cascadeEnabled: false
      }
    }

    const profile = profiles[quality] || profiles.full

    console.log(`🎨 Setting graphics quality: ${quality}`, profile)

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

    // Remove p5.js instance
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
