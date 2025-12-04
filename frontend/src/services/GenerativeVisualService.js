/**
 * GenerativeVisualService
 * Manages p5.js generative graphics driven purely by user gestures
 *
 * Responsibilities:
 * - p5.js instance lifecycle (setup, draw, dispose)
 * - Track cursor positions per user (multi-user graph nodes)
 * - Track gesture states per user (velocity, type, hold state)
 * - Render graph pattern connecting users (nodes + edges)
 * - Visual properties modulated by gesture data (NO audio)
 * - Performance monitoring and degradation
 *
 * Visual Design:
 * - Nodes: User cursor positions (10-30px based on gesture type)
 * - Edges: Lines connecting all users (1-6px based on gesture velocity)
 * - Graph topology: Complete graph (all nodes connected)
 *
 * Performance:
 * - Target: 30fps for p5.js rendering
 * - Degradation: Simplify visuals if FPS drops below 20
 * - Idle detection: Pause rendering after 10s inactivity
 */

class GenerativeVisualService {
  constructor() {
    // p5.js instance (created in instance mode)
    this.p5Instance = null

    // Multi-user cursor tracking
    // userId -> {x, y, color, velocity, gestureType, isActive}
    this.cursorNodes = new Map()

    // Gesture state tracking per user
    // userId -> {type, velocity, holdStart, isActive}
    this.gestureStates = new Map()

    // Performance monitoring
    this.lastFrameTime = 0
    this.frameCount = 0
    this.fps = 30
    this.performanceMode = 'normal' // 'normal', 'degraded', 'disabled'

    // Idle detection
    this.lastActivityTime = Date.now()
    this.idleThreshold = 10000 // 10 seconds
    this.isPaused = false
  }

  /**
   * Initialize p5.js instance in the given container
   * @param {HTMLElement} containerElement - DOM element to attach p5.js canvas
   */
  initialize(containerElement) {
    if (!containerElement) {
      console.error('GenerativeVisualService: Container element not found')
      return
    }

    // Create p5.js instance in instance mode
    this.p5Instance = new p5((p) => {
      p.setup = () => this.setup(p)
      p.draw = () => this.draw(p)
    }, containerElement)

    console.log('✅ GenerativeVisualService: p5.js initialized')
  }

  /**
   * p5.js setup - runs once on initialization
   * @param {p5} p - p5.js instance
   */
  setup(p) {
    // Create canvas matching viewport size
    p.createCanvas(window.innerWidth, window.innerHeight)

    // Set frame rate cap to 30fps
    p.frameRate(30)

    console.log('✅ GenerativeVisualService: Canvas created', window.innerWidth, 'x', window.innerHeight)
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

    // Performance monitoring
    this.updatePerformanceMetrics(p)

    // Clear background (match Webarmonium background color)
    p.background(26, 26, 46)

    // Render graph pattern connecting cursor nodes
    this.renderGraphPattern(p)
  }

  /**
   * Render graph pattern: nodes at cursor positions, edges connecting users
   * Visual properties modulated by gesture velocity, type, and hold state
   * @param {p5} p - p5.js instance
   */
  renderGraphPattern(p) {
    const nodes = Array.from(this.cursorNodes.values())

    // Skip rendering if no nodes
    if (nodes.length === 0) {
      return
    }

    // Draw edges between all pairs (complete graph)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        this.renderEdge(p, nodes[i], nodes[j])
      }
    }

    // Draw nodes at cursor positions
    nodes.forEach(node => {
      this.renderNode(p, node)
    })
  }

  /**
   * Render edge between two cursor nodes
   * Thickness modulated by gesture velocity
   * @param {p5} p - p5.js instance
   * @param {Object} nodeI - First cursor node
   * @param {Object} nodeJ - Second cursor node
   */
  renderEdge(p, nodeI, nodeJ) {
    // Edge thickness from gesture velocity (1-6px range)
    const avgVelocity = (nodeI.velocity + nodeJ.velocity) / 2
    const thickness = 1 + Math.min(avgVelocity / 50, 5)

    p.strokeWeight(thickness)

    // Flash white for active gestures
    if (nodeI.isActive || nodeJ.isActive) {
      p.stroke(255, 255, 255, 150) // White flash with 150 alpha
    } else {
      // Use source node color
      p.stroke(nodeI.color)
    }

    // Draw line between nodes (normalized coordinates)
    p.line(
      nodeI.x * p.width, nodeI.y * p.height,
      nodeJ.x * p.width, nodeJ.y * p.height
    )
  }

  /**
   * Render node at cursor position
   * Size based on gesture type, pulsing for holds
   * @param {p5} p - p5.js instance
   * @param {Object} node - Cursor node data
   */
  renderNode(p, node) {
    // Node size based on gesture type
    let nodeSize = 10 // Default idle

    if (node.gestureType === 'tap') {
      nodeSize = 15
    } else if (node.gestureType === 'drag') {
      nodeSize = 20
    } else if (node.gestureType === 'hold') {
      // Pulsing animation for holds (sine wave)
      const pulse = Math.sin(p.millis() * 0.005) * 5
      nodeSize = 25 + pulse // 20-30px pulsing
    }

    // Draw main node
    p.fill(node.color)
    p.noStroke()
    p.circle(node.x * p.width, node.y * p.height, nodeSize)

    // Glow effect for active gestures (2x size, 25% opacity)
    if (node.isActive) {
      const glowColor = p.color(node.color)
      glowColor.setAlpha(64) // 25% opacity (255 * 0.25 = 64)
      p.fill(glowColor)
      p.circle(node.x * p.width, node.y * p.height, nodeSize * 2)
    }
  }

  /**
   * Update cursor position for a user
   * @param {string} userId - User identifier
   * @param {number} x - Normalized x position (0-1)
   * @param {number} y - Normalized y position (0-1)
   * @param {string} color - CSS color string
   */
  updateCursorPosition(userId, x, y, color) {
    const existing = this.cursorNodes.get(userId) || {}

    this.cursorNodes.set(userId, {
      x,
      y,
      color,
      velocity: existing.velocity || 0,
      gestureType: existing.gestureType || 'idle',
      isActive: existing.isActive || false
    })

    this.lastActivityTime = Date.now()
    this.isPaused = false
  }

  /**
   * Update gesture data for a user
   * @param {string} userId - User identifier
   * @param {Object} gestureData - {type, velocity, holdStart, isActive}
   */
  updateGestureData(userId, gestureData) {
    // Store gesture state
    this.gestureStates.set(userId, gestureData)

    // Update cursor node with gesture info
    const node = this.cursorNodes.get(userId)
    if (node) {
      node.velocity = gestureData.velocity || 0
      node.gestureType = gestureData.type || 'idle'
      node.isActive = gestureData.isActive || false
    }

    this.lastActivityTime = Date.now()
    this.isPaused = false
  }

  /**
   * Remove user from visualization
   * @param {string} userId - User identifier
   */
  removeUser(userId) {
    this.cursorNodes.delete(userId)
    this.gestureStates.delete(userId)
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
      console.log('GenerativeVisualService: Resized to', width, 'x', height)
    }
  }

  /**
   * Performance monitoring and degradation
   * @param {p5} p - p5.js instance
   */
  updatePerformanceMetrics(p) {
    const now = p.millis()
    const delta = now - this.lastFrameTime
    this.lastFrameTime = now

    // Calculate FPS (exponential moving average)
    if (delta > 0) {
      const instantFps = 1000 / delta
      this.fps = this.fps * 0.9 + instantFps * 0.1
    }

    this.frameCount++

    // Check for performance degradation every 60 frames (~2s at 30fps)
    if (this.frameCount % 60 === 0) {
      if (this.fps < 20 && this.performanceMode !== 'disabled') {
        console.warn('GenerativeVisualService: FPS below 20, disabling visuals')
        this.performanceMode = 'disabled'
        this.isPaused = true
      } else if (this.fps < 29 && this.performanceMode === 'normal') {
        console.warn('GenerativeVisualService: FPS below 29, entering degraded mode')
        this.performanceMode = 'degraded'
      }
    }

    // Check idle state
    if (Date.now() - this.lastActivityTime > this.idleThreshold) {
      if (!this.isPaused) {
        console.log('GenerativeVisualService: Pausing due to inactivity')
        this.isPaused = true
      }
    }
  }

  /**
   * Get performance metrics
   * @returns {Object} {fps, performanceMode, isPaused}
   */
  getPerformanceMetrics() {
    return {
      fps: Math.round(this.fps),
      performanceMode: this.performanceMode,
      isPaused: this.isPaused,
      nodeCount: this.cursorNodes.size
    }
  }

  /**
   * Cleanup: remove p5.js instance
   */
  dispose() {
    if (this.p5Instance) {
      this.p5Instance.remove()
      this.p5Instance = null
    }

    this.cursorNodes.clear()
    this.gestureStates.clear()

    console.log('✅ GenerativeVisualService: Disposed')
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
