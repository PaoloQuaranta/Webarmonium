/**
 * PixiAdapter — PixiJS v8 WebGL rendering adapter for Webarmonium
 *
 * Replaces CanvasAdapter (Canvas 2D) with GPU-accelerated rendering.
 * Manages PIXI.Application lifecycle, stage hierarchy, texture atlas,
 * and WebGL context loss recovery.
 *
 * Stage Hierarchy (back → front):
 *   nebulaLayer → attractorLayer → edgeLayer → waveLayer →
 *   particleLayer → nodeLayer → textLayer → trailLayer
 */
class PixiAdapter {
  constructor() {
    this.app = null
    this.width = 0
    this.height = 0

    // Stage layers (created in init)
    this.layers = {}

    // Shared texture atlas
    this.textures = {}

    // Lifecycle state
    this._startTime = performance.now()
    this._initialized = false
    this._contextLost = false

    // Callbacks for context loss recovery
    this._onContextLost = null
    this._onContextRestored = null

    // Frame control
    this._targetFps = 30
    this._looping = true
    this.frameCount = 0

    // Custom draw callback
    this._drawCallback = null
    this._setupCallback = null
  }

  /**
   * Initialize PixiJS application (async — required by PixiJS v8)
   * @param {HTMLElement} container - DOM element to mount canvas into
   * @param {Object} options - Configuration options
   * @returns {Promise<void>}
   */
  async init(container, options = {}) {
    if (this._initialized) return

    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)

    this.app = new PIXI.Application()

    await this.app.init({
      background: options.background || 0x020208,
      antialias: options.antialias !== false,
      resolution: 1,
      autoDensity: true,
      powerPreference: 'high-performance',
      width: container.offsetWidth || window.innerWidth,
      height: container.offsetHeight || window.innerHeight,
    })

    // Mount canvas
    container.appendChild(this.app.canvas)

    // Style the canvas for proper layering
    this.app.canvas.style.position = 'absolute'
    this.app.canvas.style.top = '0'
    this.app.canvas.style.left = '0'
    this.app.canvas.style.zIndex = '1'
    this.app.canvas.style.pointerEvents = 'none'

    this.width = this.app.renderer.width
    this.height = this.app.renderer.height

    // Create stage layers (back → front order)
    const layerNames = [
      'nebulaLayer',
      'attractorLayer',
      'edgeLayer',
      'waveLayer',
      'particleLayer',
      'nodeLayer',
      'textLayer',
      'trailLayer'
    ]

    for (const name of layerNames) {
      const layer = new PIXI.Container()
      layer.label = name
      this.layers[name] = layer
      this.app.stage.addChild(layer)
    }

    // Generate shared texture atlas
    this._generateTextureAtlas(isMobile)

    // Setup WebGL context loss handling
    this._setupContextLossHandling()

    // Disable auto-render — we render manually from GenerativeVisualService draw loop
    this.app.ticker.autoStart = false
    this.app.ticker.stop()

    this._initialized = true
  }

  /**
   * Generate shared pre-baked textures for all subsystems
   * @param {boolean} isMobile - Whether running on mobile device
   * @private
   */
  _generateTextureAtlas(isMobile) {
    const renderer = this.app.renderer

    // Particle dot (8x8 white circle)
    const dotGfx = new PIXI.Graphics()
      .circle(0, 0, 4)
      .fill({ color: 0xFFFFFF })
    this.textures.particleDot = renderer.generateTexture({
      target: dotGfx,
      resolution: 1,
    })
    dotGfx.destroy()

    // Attractor point (smaller, 3px radius)
    const attractorGfx = new PIXI.Graphics()
      .circle(0, 0, 3)
      .fill({ color: 0xFFFFFF })
    this.textures.attractorPoint = renderer.generateTexture({
      target: attractorGfx,
      resolution: 1,
    })
    attractorGfx.destroy()

    // Pulse core (bright white, 8px radius)
    const coreGfx = new PIXI.Graphics()
      .circle(0, 0, 8)
      .fill({ color: 0xFFFFFF })
    this.textures.pulseCore = renderer.generateTexture({
      target: coreGfx,
      resolution: 1,
    })
    coreGfx.destroy()

    // Glow circle (soft radial gradient via concentric rings)
    const glowSize = isMobile ? 32 : 64
    const glowGfx = new PIXI.Graphics()
    const rings = 16
    for (let i = rings; i >= 0; i--) {
      const t = i / rings
      const radius = (glowSize / 2) * t
      const alpha = (1 - t) * (1 - t) * 0.6  // quadratic falloff
      glowGfx.circle(0, 0, Math.max(radius, 0.5))
        .fill({ color: 0xFFFFFF, alpha })
    }
    this.textures.glowCircle = renderer.generateTexture({
      target: glowGfx,
      resolution: 1,
    })
    glowGfx.destroy()

    // Node glow (larger, for user cursor glow effect)
    const nodeGlowSize = isMobile ? 48 : 80
    const nodeGlowGfx = new PIXI.Graphics()
    for (let i = rings; i >= 0; i--) {
      const t = i / rings
      const radius = (nodeGlowSize / 2) * t
      const alpha = (1 - t) * (1 - t) * 0.4
      nodeGlowGfx.circle(0, 0, Math.max(radius, 0.5))
        .fill({ color: 0xFFFFFF, alpha })
    }
    this.textures.nodeGlow = renderer.generateTexture({
      target: nodeGlowGfx,
      resolution: 1,
    })
    nodeGlowGfx.destroy()

    // Trail halo (for gesture trail system)
    const trailGlowGfx = new PIXI.Graphics()
    for (let i = rings; i >= 0; i--) {
      const t = i / rings
      const radius = 24 * t
      const alpha = (1 - t) * (1 - t) * 0.5
      trailGlowGfx.circle(0, 0, Math.max(radius, 0.5))
        .fill({ color: 0xFFFFFF, alpha })
    }
    this.textures.trailHalo = renderer.generateTexture({
      target: trailGlowGfx,
      resolution: 1,
    })
    trailGlowGfx.destroy()
  }

  /**
   * Setup WebGL context loss/restore handling
   * @private
   */
  _setupContextLossHandling() {
    const canvas = this.app.canvas

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this._contextLost = true
      if (this._onContextLost) this._onContextLost()
    })

    canvas.addEventListener('webglcontextrestored', () => {
      this._contextLost = false
      // Regenerate textures
      const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)
      this._generateTextureAtlas(isMobile)
      if (this._onContextRestored) this._onContextRestored()
    })
  }

  /**
   * Set callbacks for WebGL context loss recovery
   * @param {Function} onLost - Called when context is lost
   * @param {Function} onRestored - Called when context is restored
   */
  setContextLossCallbacks(onLost, onRestored) {
    this._onContextLost = onLost
    this._onContextRestored = onRestored
  }

  /**
   * Render the stage (called manually from draw loop)
   */
  render() {
    if (this._contextLost || !this._initialized) return
    this.app.renderer.render(this.app.stage)
  }

  /**
   * Set background color
   * @param {number} r - Red (0-255)
   * @param {number} g - Green (0-255)
   * @param {number} b - Blue (0-255)
   */
  setBackground(r, g, b) {
    if (!this.app) return
    this.app.renderer.background.color = (r << 16) | (g << 8) | b
  }

  /**
   * Resize the renderer
   * @param {number} width - New width in pixels
   * @param {number} height - New height in pixels
   */
  resize(width, height) {
    if (!this.app) return
    this.app.renderer.resize(width, height)
    this.width = width
    this.height = height
  }

  /**
   * Get a shared texture by name
   * @param {string} name - Texture name (particleDot, glowCircle, pulseCore, etc.)
   * @returns {PIXI.Texture}
   */
  getTexture(name) {
    return this.textures[name] || null
  }

  /**
   * Get a stage layer by name
   * @param {string} name - Layer name
   * @returns {PIXI.Container}
   */
  getLayer(name) {
    return this.layers[name] || null
  }

  /**
   * Create a RenderTexture
   * @param {number} width - Texture width
   * @param {number} height - Texture height
   * @returns {PIXI.RenderTexture}
   */
  createRenderTexture(width, height) {
    return PIXI.RenderTexture.create({ width, height })
  }

  /**
   * Render a container into a RenderTexture
   * @param {PIXI.Container} container - Source container
   * @param {PIXI.RenderTexture} renderTexture - Target render texture
   * @param {boolean} clear - Whether to clear before rendering
   */
  renderToTexture(container, renderTexture, clear = true) {
    if (this._contextLost) return
    this.app.renderer.render({
      target: renderTexture,
      container: container,
      clear: clear,
    })
  }

  /**
   * Get elapsed time since init
   * @returns {number} Milliseconds since adapter creation
   */
  millis() {
    return performance.now() - this._startTime
  }

  /**
   * Check if context is currently lost
   * @returns {boolean}
   */
  isContextLost() {
    return this._contextLost
  }

  /**
   * Cleanup: destroy application and all resources
   */
  dispose() {
    // Destroy all generated textures
    for (const key in this.textures) {
      if (this.textures[key]) {
        this.textures[key].destroy(true)
      }
    }
    this.textures = {}

    // Destroy all layers
    for (const key in this.layers) {
      if (this.layers[key]) {
        this.layers[key].destroy({ children: true })
      }
    }
    this.layers = {}

    // Destroy application
    if (this.app) {
      this.app.destroy(true, { children: true, texture: true })
      this.app = null
    }

    this._initialized = false
  }
}

// Exports
if (typeof window !== 'undefined') {
  window.PixiAdapter = PixiAdapter
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PixiAdapter
}
