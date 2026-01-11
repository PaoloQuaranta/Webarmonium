/**
 * NoiseTextureNebulaSystem
 * Atmospheric noise field background - continuous texture without shapes
 *
 * Creates organic, variegated atmospheric textures through multi-octave Perlin noise.
 * No visible shapes, spheres, or geometric forms - only color/light variations that
 * respond to background composition events. The texture itself is the "object".
 *
 * Algorithmic Philosophy: "Atmospheric Noise Fields"
 * - Texture over form: canvas-wide continuous field
 * - Multi-octave noise for layered complexity
 * - Musical reactivity through background composition types
 * - Emergent simplicity from mathematical complexity
 */

class NoiseTextureNebulaSystem {
  constructor() {
    // Configuration - CALIBRATED FOR HIGHER RESOLUTION
    // cellSize 12 provides ~160x90 cells on 1920x1080 = 14,400 cells (smooth appearance)
    // cellSize 70 was too coarse: only ~27x15 = 405 cells (blocky appearance)
    const config = (typeof window !== 'undefined' && window.VisualConstants?.NOISE_TEXTURE)
      ? window.VisualConstants.NOISE_TEXTURE
      : {
          cellSize: 12,  // Reduced from 70 for much finer resolution
          octaves: [
            { scale: 0.003, amplitude: 1.0 },   // Slightly higher scale for more variation
            { scale: 0.012, amplitude: 0.5 },
            { scale: 0.03, amplitude: 0.25 }
          ],
          transitionSpeed: 0.02,
          morphSpeed: 0.01,
          pulseDecay: 0.95
        }

    this.cellSize = config.cellSize || 12
    this.baseOctaves = config.octaves || [
      { scale: 0.003, amplitude: 1.0 },
      { scale: 0.012, amplitude: 0.5 },
      { scale: 0.03, amplitude: 0.25 }
    ]
    this.transitionSpeed = config.transitionSpeed || 0.02
    this.morphSpeed = config.morphSpeed || 0.01
    this.pulseDecay = config.pulseDecay || 0.95

    // Performance mode
    this.performanceMode = 'normal'

    // Time offset for noise animation
    this.time = 0

    // Interaction-driven gradient state
    this.interactionMetrics = {
      userCount: 1,
      spatialDensity: 0,
      dominantZone: { x: 0.5, y: 0.5 }
    }
    this.gradientEnabled = true
    this.gradientIntensity = 0

    // Gradient effect configuration (tunable parameters)
    // Values boosted 4x for visible effect with low user counts
    this.gradientConfig = {
      hueShift: 120,       // Degrees toward warm (red/orange) at max effect
      saturationBoost: 50, // Percentage saturation increase at max effect
      lightnessBoost: 35,  // Percentage brightness increase at max effect
      maxDiagonal: Math.sqrt(2), // Max distance for normalized 0-1 coordinates
      maxUsers: 10         // Divisor for userFactor (10 for rooms, 3 for landing)
    }

    // Current and target noise scales (for morphing)
    this.currentOctaves = JSON.parse(JSON.stringify(this.baseOctaves))
    this.targetOctaves = JSON.parse(JSON.stringify(this.baseOctaves))

    // Color palettes for background composition types
    // VIBRANT COLORS on dark background RGB(26,26,46) ≈ HSB(240,43,18)
    // High saturation (60-85), good brightness (50-70), visible alpha (55-75)
    this.palettes = {
      ambient: {
        // Calm but visible - blue/cool tones (oceanic)
        colors: [
          { hue: 200, sat: 70, light: 60, alpha: 65 },  // Vivid sky blue
          { hue: 215, sat: 75, light: 55, alpha: 60 },  // Ocean blue
          { hue: 185, sat: 65, light: 62, alpha: 58 },  // Bright cyan
          { hue: 225, sat: 60, light: 58, alpha: 62 }   // Twilight blue
        ]
      },
      riff: {
        // Energetic, rhythmic - warm/orange tones
        colors: [
          { hue: 25, sat: 85, light: 65, alpha: 70 },   // Vivid amber
          { hue: 15, sat: 80, light: 60, alpha: 65 },   // Bright orange
          { hue: 35, sat: 75, light: 62, alpha: 60 },   // Golden
          { hue: 8, sat: 70, light: 58, alpha: 65 }     // Warm red-orange
        ]
      },
      phrase: {
        // Melodic, expressive - purple/violet tones
        colors: [
          { hue: 280, sat: 75, light: 60, alpha: 68 },  // Vivid purple
          { hue: 290, sat: 70, light: 58, alpha: 62 },  // Bright violet
          { hue: 265, sat: 65, light: 62, alpha: 60 },  // Lavender
          { hue: 300, sat: 60, light: 56, alpha: 64 }   // Magenta
        ]
      },
      arpeggio: {
        // Bright, lively - cyan/green tones
        colors: [
          { hue: 170, sat: 80, light: 62, alpha: 68 },  // Vivid cyan
          { hue: 180, sat: 75, light: 58, alpha: 62 },  // Bright teal
          { hue: 160, sat: 70, light: 64, alpha: 58 },  // Aquamarine
          { hue: 190, sat: 65, light: 60, alpha: 65 }   // Electric cyan
        ]
      },
      drone: {
        // Sustained, foundational - deep but visible blue/purple
        colors: [
          { hue: 240, sat: 65, light: 50, alpha: 60 },  // Deep indigo
          { hue: 250, sat: 60, light: 48, alpha: 55 },  // Night blue
          { hue: 235, sat: 55, light: 52, alpha: 58 },  // Rich navy
          { hue: 260, sat: 50, light: 50, alpha: 55 }   // Deep violet
        ]
      }
    }

    // Current palette (start with ambient)
    this.currentPalette = JSON.parse(JSON.stringify(this.palettes.ambient))
    this.targetPalette = JSON.parse(JSON.stringify(this.palettes.ambient))

    // Composition pulses (for accent effects)
    this.pulses = [] // {x, y, intensity, age}
  }

  /**
   * Sample multi-octave noise at a position
   */
  sampleNoise(x, y, p) {
    let value = 0
    let maxAmplitude = 0

    for (const octave of this.currentOctaves) {
      const nx = x * octave.scale
      const ny = y * octave.scale
      const nz = this.time * octave.scale * 0.5

      const noiseVal = p.noise(nx, ny, nz)
      value += noiseVal * octave.amplitude
      maxAmplitude += octave.amplitude
    }

    // Normalize to 0-1
    return (value / maxAmplitude + 1) / 2
  }

  /**
   * Map noise value to color from current palette with spatial gradient
   * @param {number} value - Noise value 0-1
   * @param {p5} p - p5.js instance
   * @param {number} cellX - Cell X position (normalized 0-1)
   * @param {number} cellY - Cell Y position (normalized 0-1)
   */
  mapToPalette(value, p, cellX = 0.5, cellY = 0.5) {
    // Clamp value to 0-1
    value = Math.max(0, Math.min(1, value))

    // Interpolate through palette colors
    const palette = this.currentPalette.colors
    const numColors = palette.length

    // Find position in palette
    const pos = value * (numColors - 1)
    const index = Math.floor(pos)
    const t = pos - index

    // Get two colors to interpolate between
    const color1 = palette[Math.min(index, numColors - 1)]
    const color2 = palette[Math.min(index + 1, numColors - 1)]

    // Interpolate base colors
    let hue = color1.hue + (color2.hue - color1.hue) * t
    let sat = color1.sat + (color2.sat - color1.sat) * t
    let light = color1.light + (color2.light - color1.light) * t
    const alpha = color1.alpha + (color2.alpha - color1.alpha) * t

    // Apply spatial gradient if enabled and has intensity
    if (this.gradientEnabled && this.gradientIntensity > 0.01) {
      const dz = this.interactionMetrics.dominantZone
      const cfg = this.gradientConfig

      // OPTIMIZED: Use squared distance to avoid expensive sqrt()
      // For normalized 0-1 coordinates, max diagonal² = 2.0
      const dx = cellX - dz.x
      const dy = cellY - dz.y
      const distanceSq = dx * dx + dy * dy
      const maxDistSq = cfg.maxDiagonal * cfg.maxDiagonal // = 2.0

      // Proximity factor: 1.0 at dominant zone, 0.0 at max distance
      // Using squared distance: proximity = 1 - sqrt(distSq)/sqrt(maxDistSq)
      // Approximation: proximity ≈ 1 - distSq/maxDistSq (faster, slightly different curve)
      const proximity = Math.max(0, 1 - distanceSq / maxDistSq)

      // Gradient effect strength scaled by intensity
      const effect = proximity * this.gradientIntensity

      // Apply configurable gradient effects
      hue = (hue + effect * cfg.hueShift) % 360
      sat = Math.min(100, sat + effect * cfg.saturationBoost)
      light = Math.min(100, light + effect * cfg.lightnessBoost)
    }

    return { hue, sat, light, alpha }
  }

  /**
   * Update animation and parameters
   */
  update(dt) {
    this.time += dt * 0.001

    // Interpolate noise scales toward target
    for (let i = 0; i < this.currentOctaves.length; i++) {
      const current = this.currentOctaves[i]
      const target = this.targetOctaves[i]

      current.scale += (target.scale - current.scale) * this.morphSpeed
      current.amplitude += (target.amplitude - current.amplitude) * this.morphSpeed
    }

    // Interpolate palette toward target
    for (let i = 0; i < this.currentPalette.colors.length; i++) {
      const current = this.currentPalette.colors[i]
      const target = this.targetPalette.colors[i]

      current.hue += (target.hue - current.hue) * this.transitionSpeed
      current.sat += (target.sat - current.sat) * this.transitionSpeed
      current.light += (target.light - current.light) * this.transitionSpeed
      current.alpha += (target.alpha - current.alpha) * this.transitionSpeed
    }

    // Update pulses
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pulse = this.pulses[i]
      pulse.intensity *= this.pulseDecay
      pulse.age += dt

      // Remove dead pulses
      if (pulse.intensity < 0.01 || pulse.age > 3000) {
        this.pulses.splice(i, 1)
      }
    }
  }

  /**
   * Handle background composition events
   * @param {Object} composition - Background composition from backend
   */
  onBackgroundComposition(composition) {
    if (!composition || !composition.type) return

    const compType = composition.type

    // Map composition type to visual response
    switch (compType) {
      case 'ambient':
        // Calm, subtle - minimal change
        this.targetPalette = JSON.parse(JSON.stringify(this.palettes.ambient))
        this.targetOctaves = [
          { scale: this.baseOctaves[0].scale * 1.0, amplitude: 1.0 },
          { scale: this.baseOctaves[1].scale * 1.0, amplitude: 0.5 },
          { scale: this.baseOctaves[2].scale * 1.0, amplitude: 0.25 }
        ]
        break

      case 'riff':
        // Rhythmic, energetic - warmer colors, more fine detail
        this.targetPalette = JSON.parse(JSON.stringify(this.palettes.riff))
        this.targetOctaves = [
          { scale: this.baseOctaves[0].scale * 1.3, amplitude: 1.0 },
          { scale: this.baseOctaves[1].scale * 1.8, amplitude: 0.5 },
          { scale: this.baseOctaves[2].scale * 2.5, amplitude: 0.25 }
        ]
        // Add pulse effect
        this.triggerPulse(0.6)
        break

      case 'phrase':
        // Melodic, expressive - purple tones, medium complexity
        this.targetPalette = JSON.parse(JSON.stringify(this.palettes.phrase))
        this.targetOctaves = [
          { scale: this.baseOctaves[0].scale * 0.8, amplitude: 1.0 },
          { scale: this.baseOctaves[1].scale * 1.3, amplitude: 0.5 },
          { scale: this.baseOctaves[2].scale * 2.0, amplitude: 0.25 }
        ]
        this.triggerPulse(0.4)
        break

      case 'arpeggio':
        // Bright, lively - cyan/green tones, high fine detail
        this.targetPalette = JSON.parse(JSON.stringify(this.palettes.arpeggio))
        this.targetOctaves = [
          { scale: this.baseOctaves[0].scale * 1.5, amplitude: 1.0 },
          { scale: this.baseOctaves[1].scale * 2.0, amplitude: 0.5 },
          { scale: this.baseOctaves[2].scale * 3.5, amplitude: 0.25 }
        ]
        this.triggerPulse(0.5)
        break

      case 'drone':
        // Sustained, foundational - deep tones, low complexity
        this.targetPalette = JSON.parse(JSON.stringify(this.palettes.drone))
        this.targetOctaves = [
          { scale: this.baseOctaves[0].scale * 0.6, amplitude: 1.0 },
          { scale: this.baseOctaves[1].scale * 0.8, amplitude: 0.5 },
          { scale: this.baseOctaves[2].scale * 1.0, amplitude: 0.25 }
        ]
        break

      default:
        // Unknown type - use ambient as fallback
        console.log(`🌫️ Unknown composition type: ${compType}, using ambient`)
        this.targetPalette = JSON.parse(JSON.stringify(this.palettes.ambient))
        this.targetOctaves = JSON.parse(JSON.stringify(this.baseOctaves))
    }
  }

  /**
   * Update interaction metrics for spatial color gradient
   * @param {Object} metrics - Interaction metrics from backend
   * @param {number} metrics.userCount - Number of active users (1-10)
   * @param {number} metrics.spatialDensity - Spatial clustering density (0-1)
   * @param {Object} metrics.dominantZone - Activity center position
   * @param {number} metrics.dominantZone.x - X coordinate (0-1)
   * @param {number} metrics.dominantZone.y - Y coordinate (0-1)
   */
  setInteractionMetrics(metrics) {
    if (!metrics) return

    // Validate and clamp userCount (positive integer, max practical value)
    if (typeof metrics.userCount === 'number' && isFinite(metrics.userCount)) {
      this.interactionMetrics.userCount = Math.max(0, Math.floor(metrics.userCount))
    }

    // Validate and clamp spatialDensity to 0-1 range
    if (typeof metrics.spatialDensity === 'number' && isFinite(metrics.spatialDensity)) {
      this.interactionMetrics.spatialDensity = Math.max(0, Math.min(1, metrics.spatialDensity))
    }

    // Validate and interpolate dominantZone with bounds checking
    if (metrics.dominantZone &&
        typeof metrics.dominantZone.x === 'number' &&
        typeof metrics.dominantZone.y === 'number' &&
        isFinite(metrics.dominantZone.x) &&
        isFinite(metrics.dominantZone.y)) {
      // Clamp incoming values to valid 0-1 range before interpolation
      const clampedX = Math.max(0, Math.min(1, metrics.dominantZone.x))
      const clampedY = Math.max(0, Math.min(1, metrics.dominantZone.y))

      // Smooth interpolation for dominant zone position
      const lerpSpeed = 0.1
      this.interactionMetrics.dominantZone.x +=
        (clampedX - this.interactionMetrics.dominantZone.x) * lerpSpeed
      this.interactionMetrics.dominantZone.y +=
        (clampedY - this.interactionMetrics.dominantZone.y) * lerpSpeed
    }

    // Gradient intensity = user activity × spatial clustering
    // - userFactor: scales with user count up to maxUsers (configurable)
    // - spatialDensity: 0 when spread out, 1.0 when clustered
    // - Product ensures gradient only visible with both activity AND clustering
    const maxUsers = this.gradientConfig.maxUsers || 10
    const userFactor = Math.min(1, this.interactionMetrics.userCount / maxUsers)
    this.gradientIntensity = userFactor * this.interactionMetrics.spatialDensity

    // Debug: log gradient intensity periodically
    if (!this._gradientDebugCounter) this._gradientDebugCounter = 0
    if (++this._gradientDebugCounter % 30 === 0) {
      console.log('🌫️ Gradient:', {
        userFactor: userFactor.toFixed(2),
        spatialDensity: this.interactionMetrics.spatialDensity.toFixed(2),
        intensity: this.gradientIntensity.toFixed(3),
        enabled: this.gradientEnabled,
        zone: `(${this.interactionMetrics.dominantZone.x.toFixed(2)}, ${this.interactionMetrics.dominantZone.y.toFixed(2)})`
      })
    }
  }

  /**
   * Enable/disable gradient effect (for performance modes)
   * @param {boolean} enabled
   */
  setGradientEnabled(enabled) {
    this.gradientEnabled = enabled
  }

  /**
   * Configure max users for gradient intensity calculation
   * Landing page uses 3 (virtual cursors), rooms use 10
   * @param {number} maxUsers
   */
  setMaxUsers(maxUsers) {
    if (typeof maxUsers === 'number' && maxUsers > 0) {
      this.gradientConfig.maxUsers = maxUsers
    }
  }

  /**
   * Trigger a localized pulse effect
   */
  triggerPulse(intensity = 0.5) {
    const pulse = {
      x: Math.random(), // Normalized position
      y: Math.random(),
      intensity: intensity,
      age: 0,
      radius: 100 + Math.random() * 150
    }
    this.pulses.push(pulse)
  }

  /**
   * Apply pulse effect to a noise value
   */
  applyPulse(x, y, baseValue) {
    let modifiedValue = baseValue

    for (const pulse of this.pulses) {
      // Calculate distance from pulse center
      const dx = (x / this.cellSize) - (pulse.x * 20)
      const dy = (y / this.cellSize) - (pulse.y * 20)
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Pulse effect based on distance
      const influence = Math.max(0, 1 - dist / (pulse.radius / this.cellSize))
      modifiedValue += influence * pulse.intensity * 0.3
    }

    return Math.min(1, modifiedValue)
  }

  /**
   * Render the noise texture field
   */
  render(p) {
    const width = p.width
    const height = p.height

    // Use HSB mode
    p.push()
    p.colorMode(p.HSB, 360, 100, 100, 100)
    p.noStroke()

    // Render grid cells
    for (let x = 0; x < width; x += this.cellSize) {
      for (let y = 0; y < height; y += this.cellSize) {
        // Sample noise at cell center
        const centerX = x + this.cellSize / 2
        const centerY = y + this.cellSize / 2

        let value = this.sampleNoise(centerX, centerY, p)

        // Apply pulse effects
        value = this.applyPulse(x, y, value)

        // Pass normalized cell position for spatial gradient
        const cellX = centerX / width
        const cellY = centerY / height
        const color = this.mapToPalette(value, p, cellX, cellY)

        // Draw cell
        p.fill(color.hue, color.sat, color.light, color.alpha)
        p.rect(x, y, this.cellSize, this.cellSize)
      }
    }

    p.pop()
  }

  /**
   * Set performance mode
   */
  setPerformanceMode(mode) {
    this.performanceMode = mode

    // Adjust cell size and gradient based on mode
    if (mode === 'degraded') {
      this.cellSize = 20 // Larger cells for performance
      this.gradientEnabled = true // Keep gradient but with larger cells
    } else if (mode === 'disabled') {
      this.cellSize = 12
      this.gradientEnabled = false // Disable gradient entirely
    } else {
      this.cellSize = 12 // Fine resolution for smooth appearance
      this.gradientEnabled = true
    }
  }

  /**
   * Clear all state (including gradient state for scene transitions)
   */
  clear() {
    this.pulses = []
    this.gradientIntensity = 0
    this.interactionMetrics = {
      userCount: 1,
      spatialDensity: 0,
      dominantZone: { x: 0.5, y: 0.5 }
    }
  }

  /**
   * Get nebula count (always 1 for texture field)
   */
  getCount() {
    return 1
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
  window.NoiseTextureNebulaSystem = NoiseTextureNebulaSystem
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NoiseTextureNebulaSystem
}
