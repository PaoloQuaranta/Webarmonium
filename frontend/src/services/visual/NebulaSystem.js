/**
 * NebulaSystem
 * Atmospheric nebula clouds that sync with musical composition events
 *
 * Creates organic, floating nebula effects that:
 * - Distributed across the canvas
 * - Mutate color based on musical events (tap/chord/phrase)
 * - Pulse intensity with note velocity
 * - Use multi-octave noise for organic movement
 */

class NebulaSystem {
  constructor() {
    // Configuration
    const config = (typeof window !== 'undefined' && window.VisualConstants?.NEBULA_CONFIG)
      ? window.VisualConstants.NEBULA_CONFIG
      : {
          count: 6,
          minRadius: 200,
          maxRadius: 500,
          phaseSpeed: 0.0005,
          colorLerpSpeed: 0.02,
          baseAlpha: 30
        }

    this.nebulas = []
    this.count = config.count || 6
    this.minRadius = config.minRadius || 200
    this.maxRadius = config.maxRadius || 500
    this.phaseSpeed = config.phaseSpeed || 0.0005
    this.colorLerpSpeed = config.colorLerpSpeed || 0.02
    this.baseAlpha = config.baseAlpha || 30

    // Musical event color targets (hue offsets in degrees)
    this.eventHueOffsets = {
      tap: 0,
      chord: 60,
      phrase: 120
    }

    // Current global hue target (syncs with musical events)
    this.targetHue = 0
    this.currentHue = 0

    // Initialize nebulas
    this.initializeNebulas()
  }

  /**
   * Initialize nebula clouds distributed across canvas
   */
  initializeNebulas() {
    this.nebulas = []
    for (let i = 0; i < this.count; i++) {
      this.nebulas.push({
        // Position (normalized 0-1)
        x: 0.2 + Math.random() * 0.6, // Keep away from edges
        y: 0.2 + Math.random() * 0.6,

        // Size
        radius: this.minRadius + Math.random() * (this.maxRadius - this.minRadius),

        // Phase for animation (0-1)
        phase: Math.random(),

        // Phase speed variation
        phaseSpeedMult: 0.8 + Math.random() * 0.4,

        // Color (HSL)
        hue: Math.random() * 360,
        saturation: 60 + Math.random() * 20,
        lightness: 50 + Math.random() * 20,

        // Hue offset for variety
        hueOffset: (Math.random() - 0.5) * 60, // -30 to +30 degrees

        // Noise offset for organic distortion
        noiseOffset: Math.random() * 1000,

        // Intensity multiplier
        intensity: 0.5 + Math.random() * 0.5
      })
    }
  }

  /**
   * Update nebula animation and color interpolation
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    for (const nebula of this.nebulas) {
      // Advance phase
      nebula.phase += nebula.phaseSpeedMult * this.phaseSpeed * dt * 1000
      if (nebula.phase > 1) nebula.phase -= 1

      // Interpolate hue toward target
      const targetHueWithOffset = this.targetHue + nebula.hueOffset
      let hueDiff = targetHueWithOffset - nebula.hue
      // Handle wraparound
      if (hueDiff > 180) hueDiff -= 360
      if (hueDiff < -180) hueDiff += 360
      nebula.hue += hueDiff * this.colorLerpSpeed
    }

    // Update current global hue
    let hueDiff = this.targetHue - this.currentHue
    if (hueDiff > 180) hueDiff -= 360
    if (hueDiff < -180) hueDiff += 360
    this.currentHue += hueDiff * this.colorLerpSpeed
  }

  /**
   * Handle musical events - update target hue based on event type
   * @param {Object} event - Musical event {type, velocity, pitch}
   */
  onMusicalEvent(event) {
    if (event.type && this.eventHueOffsets[event.type] !== undefined) {
      this.targetHue = this.eventHueOffsets[event.type]
    }

    // Pulse intensity of all nebulas based on velocity
    if (event.velocity !== undefined) {
      for (const nebula of this.nebulas) {
        nebula.intensity = Math.min(1, nebula.intensity + event.velocity * 0.3)
      }
    }
  }

  /**
   * Render nebulas as layered radial gradients with noise distortion
   * @param {p5} p - p5.js instance
   */
  render(p) {
    const width = p.width
    const height = p.height

    for (const nebula of this.nebulas) {
      this.renderNebula(p, nebula, width, height)
    }
  }

  /**
   * Render a single nebula
   * @param {p5} p - p5.js instance
   * @param {Object} nebula - Nebula object
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   */
  renderNebula(p, nebula, width, height) {
    const centerX = nebula.x * width
    const centerY = nebula.y * height
    const radius = nebula.radius

    // Use HSB mode for smoother color transitions
    p.push()
    p.colorMode(p.HSB, 360, 100, 100, 100)

    // Create layers for depth effect
    const layers = 3
    for (let layer = 0; layer < layers; layer++) {
      const layerRadius = radius * (1 - layer * 0.2)
      const layerPhase = nebula.phase + layer * 0.1

      // Calculate alpha based on layer and intensity
      const alpha = this.baseAlpha * (1 - layer / layers) * nebula.intensity

      // Animate radius slightly with phase
      const animatedRadius = layerRadius * (1 + Math.sin(layerPhase * Math.PI * 2) * 0.1)

      // Create radial gradient approximation
      const gradientSteps = 20
      for (let i = 0; i < gradientSteps; i++) {
        const t = i / gradientSteps
        const stepRadius = animatedRadius * (1 - t)

        // Perlin noise for organic distortion
        const noiseVal = p.noise(
          nebula.noiseOffset + layer * 100 + i * 10,
          nebula.phase
        )
        const distortedRadius = stepRadius * (0.8 + noiseVal * 0.4)

        // Color interpolation
        const hue = nebula.hue + t * 20 // Slight hue variation toward edge
        const sat = nebula.saturation * (1 - t * 0.3)
        const light = nebula.lightness * (1 - t * 0.5)
        const stepAlpha = alpha * (1 - t) // Fade toward edge

        p.noStroke()
        p.fill(hue, sat, light, stepAlpha)
        p.circle(centerX, centerY, distortedRadius * 2)
      }
    }

    p.pop()
  }

  /**
   * Clear all nebulas
   */
  clear() {
    this.nebulas = []
  }

  /**
   * Get nebula count
   */
  getCount() {
    return this.nebulas.length
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.clear()
  }
}

// Export for different module systems
if (typeof window !== 'undefined') {
  window.NebulaSystem = NebulaSystem
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NebulaSystem
}
