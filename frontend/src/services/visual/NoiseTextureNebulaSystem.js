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
    // Configuration
    const config = (typeof window !== 'undefined' && window.VisualConstants?.NOISE_TEXTURE)
      ? window.VisualConstants.NOISE_TEXTURE
      : {
          cellSize: 70,
          octaves: [
            { scale: 0.002, amplitude: 1.0 },
            { scale: 0.008, amplitude: 0.5 },
            { scale: 0.02, amplitude: 0.25 }
          ],
          transitionSpeed: 0.02,
          morphSpeed: 0.01,
          pulseDecay: 0.95
        }

    this.cellSize = config.cellSize || 70
    this.baseOctaves = config.octaves || [
      { scale: 0.002, amplitude: 1.0 },
      { scale: 0.008, amplitude: 0.5 },
      { scale: 0.02, amplitude: 0.25 }
    ]
    this.transitionSpeed = config.transitionSpeed || 0.02
    this.morphSpeed = config.morphSpeed || 0.01
    this.pulseDecay = config.pulseDecay || 0.95

    // Performance mode
    this.performanceMode = 'normal'

    // Time offset for noise animation
    this.time = 0

    // Current and target noise scales (for morphing)
    this.currentOctaves = JSON.parse(JSON.stringify(this.baseOctaves))
    this.targetOctaves = JSON.parse(JSON.stringify(this.baseOctaves))

    // Color palettes for background composition types
    // CALIBRATED for visibility on dark background RGB(26,26,46) ≈ HSB(240,43,18)
    // Alpha 45-60, Lightness 35-55, Saturation 30-60
    this.palettes = {
      ambient: {
        // Subtle, calm - blue/cool tones (oceanic)
        colors: [
          { hue: 210, sat: 45, light: 45, alpha: 55 },  // Deep sky blue
          { hue: 220, sat: 50, light: 40, alpha: 50 },  // Ocean blue
          { hue: 195, sat: 40, light: 50, alpha: 45 },  // Soft cyan
          { hue: 230, sat: 35, light: 42, alpha: 48 }   // Twilight
        ]
      },
      riff: {
        // Energetic, rhythmic - warm/orange tones
        colors: [
          { hue: 25, sat: 60, light: 55, alpha: 60 },   // Warm amber
          { hue: 15, sat: 55, light: 50, alpha: 55 },   // Soft orange
          { hue: 35, sat: 50, light: 52, alpha: 50 },   // Golden
          { hue: 10, sat: 45, light: 48, alpha: 52 }    // Rust glow
        ]
      },
      phrase: {
        // Melodic, expressive - purple/violet tones
        colors: [
          { hue: 280, sat: 50, light: 48, alpha: 55 },  // Royal purple
          { hue: 290, sat: 45, light: 45, alpha: 50 },  // Violet
          { hue: 270, sat: 40, light: 50, alpha: 48 },  // Lavender
          { hue: 300, sat: 35, light: 46, alpha: 52 }   // Magenta hint
        ]
      },
      arpeggio: {
        // Bright, lively - cyan/green tones
        colors: [
          { hue: 175, sat: 55, light: 52, alpha: 58 },  // Bright cyan
          { hue: 185, sat: 50, light: 48, alpha: 52 },  // Teal
          { hue: 165, sat: 45, light: 55, alpha: 50 },  // Aquamarine
          { hue: 190, sat: 40, light: 50, alpha: 55 }   // Steel cyan
        ]
      },
      drone: {
        // Sustained, foundational - deep blue/purple (meditation)
        colors: [
          { hue: 240, sat: 40, light: 38, alpha: 50 },  // Deep indigo
          { hue: 250, sat: 35, light: 35, alpha: 45 },  // Night blue
          { hue: 235, sat: 30, light: 40, alpha: 48 },  // Muted navy
          { hue: 255, sat: 25, light: 36, alpha: 42 }   // Subtle violet
        ]
      }
    }

    // Current palette (start with ambient)
    this.currentPalette = JSON.parse(JSON.stringify(this.palettes.ambient))
    this.targetPalette = JSON.parse(JSON.stringify(this.palettes.ambient))

    // Composition pulses (for accent effects)
    this.pulses = [] // {x, y, intensity, age}

    // Initialize
    console.log('🌫️ NoiseTextureNebulaSystem initialized')
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
   * Map noise value to color from current palette
   */
  mapToPalette(value, p) {
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

    // Interpolate
    const hue = color1.hue + (color2.hue - color1.hue) * t
    const sat = color1.sat + (color2.sat - color1.sat) * t
    const light = color1.light + (color2.light - color1.light) * t
    const alpha = color1.alpha + (color2.alpha - color1.alpha) * t

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

        // Map to palette color
        const color = this.mapToPalette(value, p)

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

    // Adjust cell size based on mode
    if (mode === 'degraded') {
      this.cellSize = 100 // Larger cells = fewer draw calls
    } else {
      this.cellSize = 70
    }
  }

  /**
   * Clear all state
   */
  clear() {
    this.pulses = []
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
