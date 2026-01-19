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
    // Target values for smooth interpolation in render loop
    this.targetDominantZone = { x: 0.5, y: 0.5 }
    this.targetGradientIntensity = 0
    this.gradientEnabled = true
    this.gradientIntensity = 0

    // Gradient effect configuration (tunable for subtle modern look)
    this.gradientConfig = {
      hueShift: 40,        // Reduced from 80 - subtler warm shift
      saturationBoost: 15, // Reduced from 30 - less dramatic
      lightnessBoost: 10,  // Reduced from 20 - maintains darkness
      maxDiagonal: Math.sqrt(2), // Max distance for normalized 0-1 coordinates
      maxUsers: 4          // Divisor for userFactor (4 for rooms, 3 for landing)
    }

    // Current and target noise scales (for morphing)
    this.currentOctaves = JSON.parse(JSON.stringify(this.baseOctaves))
    this.targetOctaves = JSON.parse(JSON.stringify(this.baseOctaves))

    // Color palettes for background composition types
    // MODERN DARK THEME on black background RGB(2,2,8) - matching UI --void
    // Lower lightness (20-42%), moderate saturation, subtle alpha (36-50%)
    // NO PURPLE - hues avoid 240-320 range
    this.palettes = {
      ambient: {
        // Calm, oceanic - deep blue tones
        colors: [
          { hue: 210, sat: 55, light: 35, alpha: 45 },  // Deep ocean blue
          { hue: 200, sat: 50, light: 32, alpha: 42 },  // Midnight blue
          { hue: 190, sat: 45, light: 38, alpha: 40 },  // Dark cyan
          { hue: 220, sat: 40, light: 30, alpha: 44 }   // Navy depths
        ]
      },
      riff: {
        // Energetic, rhythmic - warm/orange tones (darker)
        colors: [
          { hue: 25, sat: 70, light: 42, alpha: 50 },   // Dark amber
          { hue: 15, sat: 65, light: 38, alpha: 48 },   // Deep orange
          { hue: 35, sat: 60, light: 40, alpha: 45 },   // Muted gold
          { hue: 8, sat: 55, light: 35, alpha: 48 }     // Burnt sienna
        ]
      },
      phrase: {
        // Melodic, expressive - teal/cyan (REPLACES PURPLE)
        colors: [
          { hue: 170, sat: 60, light: 38, alpha: 48 },  // Deep teal
          { hue: 175, sat: 55, light: 35, alpha: 45 },  // Ocean teal
          { hue: 165, sat: 50, light: 40, alpha: 42 },  // Jade
          { hue: 180, sat: 45, light: 32, alpha: 46 }   // Dark cyan
        ]
      },
      arpeggio: {
        // Bright, lively - green tones
        colors: [
          { hue: 150, sat: 55, light: 36, alpha: 48 },  // Forest green
          { hue: 160, sat: 50, light: 34, alpha: 45 },  // Dark sea green
          { hue: 140, sat: 45, light: 38, alpha: 42 },  // Deep emerald
          { hue: 155, sat: 40, light: 32, alpha: 46 }   // Muted jade
        ]
      },
      drone: {
        // Sustained, foundational - desaturated blue-gray (REPLACES VIOLET)
        colors: [
          { hue: 215, sat: 35, light: 25, alpha: 40 },  // Deep steel blue
          { hue: 220, sat: 30, light: 22, alpha: 38 },  // Charcoal blue
          { hue: 210, sat: 25, light: 28, alpha: 36 },  // Slate
          { hue: 225, sat: 20, light: 20, alpha: 38 }   // Near-black blue
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

    // Set TARGET dominantZone (interpolation happens in render loop at 60fps)
    if (metrics.dominantZone &&
        typeof metrics.dominantZone.x === 'number' &&
        typeof metrics.dominantZone.y === 'number' &&
        isFinite(metrics.dominantZone.x) &&
        isFinite(metrics.dominantZone.y)) {
      this.targetDominantZone.x = Math.max(0, Math.min(1, metrics.dominantZone.x))
      this.targetDominantZone.y = Math.max(0, Math.min(1, metrics.dominantZone.y))
    }

    // Set TARGET gradient intensity (interpolation happens in render loop)
    const maxUsers = this.gradientConfig.maxUsers || 10
    const userFactor = Math.min(1, this.interactionMetrics.userCount / maxUsers)
    const baseIntensity = 0.3
    const activityBoost = userFactor * this.interactionMetrics.spatialDensity
    this.targetGradientIntensity = Math.min(1, baseIntensity + activityBoost * 0.7)
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

    // Interpolate gradient values every frame for smooth transitions (60fps)
    const lerpSpeed = 0.15  // ~6 frames to reach target
    this.interactionMetrics.dominantZone.x +=
      (this.targetDominantZone.x - this.interactionMetrics.dominantZone.x) * lerpSpeed
    this.interactionMetrics.dominantZone.y +=
      (this.targetDominantZone.y - this.interactionMetrics.dominantZone.y) * lerpSpeed
    this.gradientIntensity +=
      (this.targetGradientIntensity - this.gradientIntensity) * lerpSpeed

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
