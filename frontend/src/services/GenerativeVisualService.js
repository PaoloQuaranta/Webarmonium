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

    // Idle detection
    this.lastActivityTime = Date.now()
    this.idleThreshold = 10000 // 10 seconds
    this.isPaused = false

    // Performance configuration
    this.targetFps = 30
    this.degradeThreshold = 20
    this.disableThreshold = 15
    this.recoveryThreshold = 28
    this.frameSampleInterval = 60

    // Background color (matching Webarmonium theme)
    this.bgColor = [26, 26, 46]
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

    // Create canvas matching container size
    p.createCanvas(containerWidth, containerHeight)

    // Set frame rate cap
    p.frameRate(this.targetFps)

    // Initialize frame time
    this.lastFrameTime = p.millis()

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

    // Calculate delta time
    const now = p.millis()
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.1) // Cap at 100ms
    this.lastFrameTime = now

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
        // Sync color with current nebula palette
        if (this.nebulas && this.nebulas.currentPalette) {
          const nebulaColor = this.nebulas.currentPalette.colors[0]
          this.attractors.setBaseColor(nebulaColor)
        }
        this.attractors.render(p)
      }
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
    // DEBUG: Log entry
    // console.log('🎨 updateGestureData called:', {
//      userId: userId.substring(0, 8),
//      type: gestureData.type,
//      isActive: gestureData.isActive
////    })

    // Update the node in the spring mesh
    const node = this.springMesh.nodes.get(userId)
    // console.log('🎨 Node exists?', !!node, 'Total nodes:', this.springMesh.nodes.size)

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
        // Emit wave pulse on tap or drag start
        if (gestureData.type === 'tap' || gestureData.type === 'drag') {
          // console.log('✨ Emitting pulse for', gestureData, 'userId:', userId.substring(0, 8))
          // console.log('🔍 wavePackets type:', typeof this.wavePackets, 'is truthy:', !!this.wavePackets)
          // console.log('🔍 wavePackets keys:', this.wavePackets ? Object.keys(this.wavePackets).slice(0, 5) : 'N/A')

          // DEBUG: Check if wavePackets exists
          if (!this.wavePackets) {
            // console.error('❌ this.wavePackets is NULL or UNDEFINED!')
            // console.log('🔍 Available subsystems:', Object.keys(this))
          } else {
            try {
              this.wavePackets.emitPulse(userId, node.color)
            } catch (error) {
              // console.error('❌ ERROR calling emitPulse:', error)
              // console.error('Stack trace:', error.stack)
            }
          }

          // Also emit particles on tap for better visual feedback
          const particleCount = gestureData.type === 'tap' ? 5 : 2
          // console.log('✨ Emitting', particleCount, 'particles for', gestureData.type, 'userId:', userId.substring(0, 8))
          // console.log('🔍 particles type:', typeof this.particles, 'is truthy:', !!this.particles)

          // DEBUG: Check if particles exists
          if (!this.particles) {
            // console.error('❌ this.particles is NULL or UNDEFINED!')
          } else {
            try {
              this.particles.emitParticles(userId, particleCount)
            } catch (error) {
              // console.error('❌ ERROR calling emitParticles:', error)
              // console.error('Stack trace:', error.stack)
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
   * @param {p5} p - p5.js instance
   */
  updatePerformanceMetrics(p) {
    const now = p.millis()
    const delta = now - this.lastFrameTime

    // Calculate FPS (exponential moving average)
    if (delta > 0) {
      const instantFps = 1000 / delta
      this.fps = this.fps * 0.9 + instantFps * 0.1
    }

    this.frameCount++

    // Check for performance degradation every N frames
    if (this.frameCount % this.frameSampleInterval === 0) {
      if (this.fps < this.disableThreshold && this.performanceMode !== 'disabled') {
        // console.warn('GenerativeVisualService: FPS below threshold, disabling effects')
        this.performanceMode = 'disabled'
      } else if (this.fps < this.degradeThreshold && this.performanceMode === 'normal') {
        // console.warn('GenerativeVisualService: FPS below threshold, entering degraded mode')
        this.performanceMode = 'degraded'
      } else if (this.fps > this.recoveryThreshold && this.performanceMode !== 'normal') {
        // console.log('GenerativeVisualService: FPS recovered, returning to normal mode')
        this.performanceMode = 'normal'
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
