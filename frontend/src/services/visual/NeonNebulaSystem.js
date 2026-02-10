/**
 * NeonNebulaSystem
 * Discrete floating nebula blobs with neon glow effects on pure black background
 *
 * Features:
 * - 5-6 discrete nebula blobs as slow-moving colored glows
 * - Each blob's color determined by Perlin noise at its position
 * - Colors mutate slowly over time as noise animates
 * - Very slow, organic floating movement
 * - Soft edge falloff with glow effect
 */

class NeonNebulaSystem {
  // Configuration constants - extracted for maintainability
  static CONFIG = {
    // Blob count and size
    BLOB_COUNT_NORMAL: 2,
    BLOB_COUNT_DEGRADED: 4,
    BLOB_RADIUS_MIN: 150,
    BLOB_RADIUS_MAX: 550,
    CELL_SIZE_NORMAL: 16,
    CELL_SIZE_DEGRADED: 28,

    // Movement
    MOVEMENT_SPEED_MIN: 0.00002,
    MOVEMENT_SPEED_MAX: 0.00004,
    ASPECT_RATIO_MIN: 0.5,
    ASPECT_RATIO_MAX: 1.2,

    // Lifecycle timing (milliseconds)
    LIFECYCLE_MIN_MS: 2000,
    LIFECYCLE_MAX_MS: 4000,
    ALIVE_DURATION_MS: 200,

    // Rendering
    BUFFER_SCALE: 0.25,
    BUFFER_SCALE_DEGRADED: 0.2,
    CELL_SKIP_THRESHOLD: 0.4,
    MIN_ALPHA_THRESHOLD: 2,

    // Visual parameters
    BASE_SATURATION: 90,        // Increased for vibrancy
    BASE_LIGHTNESS: 65,         // Increased for visibility
    BASE_ALPHA: 40,             // Slightly more presence
    NOISE_SCALE: 0.003,
    SATURATION_VARIATION: 25,   // +/- range for noise-based variation
    LIGHTNESS_VARIATION: 20,    // +/- range for noise-based variation
    HUE_VARIATION_RANGE: 80,    // +/- 40 degrees (was 50 = +/- 25)

    // Transitions
    BIAS_TRANSITION_SPEED: 0.02,
    PULSE_DECAY_RATE: 0.995,

    // Valid composition types
    VALID_COMPOSITION_TYPES: ['ambient', 'riff', 'phrase', 'arpeggio', 'drone']
  }

  constructor() {
    const C = NeonNebulaSystem.CONFIG

    // Blob configuration - sparse, sporadic appearance
    this.blobs = []
    this.blobCount = C.BLOB_COUNT_NORMAL
    this.minRadius = C.BLOB_RADIUS_MIN
    this.maxRadius = C.BLOB_RADIUS_MAX
    this.cellSize = C.CELL_SIZE_NORMAL

    // Noise parameters
    this.noiseScale = C.NOISE_SCALE
    this.time = 0  // Animation time (advances very slowly)

    // Performance mode
    this.performanceMode = 'normal'

    // Composition influences the hue bias, distributed across full 360° spectrum
    // Weight reduced to 0.15 → 85% of color driven by noise for maximum variety
    this.compositionBias = {
      ambient: { center: 195, weight: 0.15 },  // cyan-blue (cool)
      riff: { center: 20, weight: 0.15 },      // red-orange (warm)
      phrase: { center: 310, weight: 0.15 },   // magenta-pink (bridge)
      arpeggio: { center: 85, weight: 0.15 },  // yellow-green (warm)
      drone: { center: 260, weight: 0.15 }     // blue-violet (cool)
    }

    // Current composition bias (start with ambient)
    this.currentBias = { center: 195, weight: 0.15 }
    this.targetBias = { center: 195, weight: 0.15 }
    this.biasTransitionSpeed = C.BIAS_TRANSITION_SPEED

    // Color settings - soft, diffuse appearance
    this.baseSaturation = C.BASE_SATURATION
    this.baseLightness = C.BASE_LIGHTNESS
    this.baseAlpha = C.BASE_ALPHA

    // Glow settings (not used in new sphere approach but kept for API)
    this.glowEnabled = true
    this.glowIntensity = 0.5

    // Interaction tracking (for reactive movement)
    this.targetInteraction = { x: 0.5, y: 0.5 }
    this.attractionStrength = 0.1

    // Lifecycle settings (in milliseconds) - random 2-4s per blob
    this.minCycleDuration = C.LIFECYCLE_MIN_MS
    this.maxCycleDuration = C.LIFECYCLE_MAX_MS
    this.aliveDuration = C.ALIVE_DURATION_MS

    // Offscreen buffer for low-res rendering (created on first render)
    this.buffer = null
    this.bufferScale = C.BUFFER_SCALE
    this.lastBufferWidth = 0
    this.lastBufferHeight = 0

    // Buffer frame caching — nebula moves at noise time += 0.0003/frame,
    // imperceptible to update every 2 frames instead of every frame
    this._bufferAge = 0
    this._bufferRefreshInterval = 2

    // Initialize blobs with staggered lifecycle phases
    this.initializeBlobs()
  }

  /**
   * Initialize blob positions distributed across canvas
   */
  initializeBlobs() {
    this.blobs = []

    for (let i = 0; i < this.blobCount; i++) {
      this.blobs.push(this.createBlob(i))
    }
  }

  /**
   * Create a single blob with random position and staggered lifecycle
   * @param {number} index - Blob index for staggering
   * @returns {Object} Blob object
   */
  createBlob(index = 0) {
    const C = NeonNebulaSystem.CONFIG

    // Random position anywhere on canvas (with margin)
    const x = 0.1 + Math.random() * 0.8
    const y = 0.1 + Math.random() * 0.8

    // Random radius within range - more varied shapes
    const rx = this.minRadius + Math.random() * (this.maxRadius - this.minRadius)
    // Aspect ratio for diverse shapes
    const aspectRatio = C.ASPECT_RATIO_MIN + Math.random() * (C.ASPECT_RATIO_MAX - C.ASPECT_RATIO_MIN)
    const ry = rx * aspectRatio

    // Random movement direction - slow but perceptible drift
    const moveAngle = Math.random() * Math.PI * 2
    const moveSpeed = C.MOVEMENT_SPEED_MIN + Math.random() * (C.MOVEMENT_SPEED_MAX - C.MOVEMENT_SPEED_MIN)

    // Random lifecycle duration per blob (2-4 seconds)
    const cycleDuration = this.minCycleDuration + Math.random() * (this.maxCycleDuration - this.minCycleDuration)
    // FadeIn and FadeOut split the remaining time equally
    const fadeDuration = (cycleDuration - this.aliveDuration) / 2
    // Random starting point in the cycle
    const randomAge = Math.random() * cycleDuration

    return {
      x,
      y,
      rx,
      ry,
      baseRx: rx,
      baseRy: ry,
      // Movement
      vx: Math.cos(moveAngle) * moveSpeed,
      vy: Math.sin(moveAngle) * moveSpeed,
      // Lifecycle: each blob has its own duration
      cycleDuration,
      fadeInDuration: fadeDuration,
      fadeOutDuration: fadeDuration,
      age: randomAge,
      // Visual variation
      phase: Math.random() * Math.PI * 2,
      noiseOffsetX: Math.random() * 1000,
      noiseOffsetY: Math.random() * 1000,
      pulseIntensity: 0,
      // Per-blob alpha variation (0.4 to 1.0)
      alphaMultiplier: 0.4 + Math.random() * 0.6,
      // Edge chaos - how much noise distorts the shape (0.2 to 0.5)
      edgeChaos: 0.2 + Math.random() * 0.3,
      // Rotation for asymmetry
      rotation: Math.random() * Math.PI * 2,
      // Per-blob hue offset for inter-blob color variety (+/- 30 degrees)
      hueOffset: Math.random() * 60 - 30
    }
  }

  /**
   * Respawn a blob at a new random position
   * @param {Object} blob - Blob to respawn
   */
  respawnBlob(blob) {
    const C = NeonNebulaSystem.CONFIG

    // New random position
    blob.x = 0.1 + Math.random() * 0.8
    blob.y = 0.1 + Math.random() * 0.8

    // New random size - more varied shapes
    blob.rx = this.minRadius + Math.random() * (this.maxRadius - this.minRadius)
    const aspectRatio = C.ASPECT_RATIO_MIN + Math.random() * (C.ASPECT_RATIO_MAX - C.ASPECT_RATIO_MIN)
    blob.ry = blob.rx * aspectRatio
    blob.baseRx = blob.rx
    blob.baseRy = blob.ry

    // New movement direction - slow but perceptible drift
    const moveAngle = Math.random() * Math.PI * 2
    const moveSpeed = C.MOVEMENT_SPEED_MIN + Math.random() * (C.MOVEMENT_SPEED_MAX - C.MOVEMENT_SPEED_MIN)
    blob.vx = Math.cos(moveAngle) * moveSpeed
    blob.vy = Math.sin(moveAngle) * moveSpeed

    // New random lifecycle duration (2-4 seconds)
    blob.cycleDuration = this.minCycleDuration + Math.random() * (this.maxCycleDuration - this.minCycleDuration)
    const fadeDuration = (blob.cycleDuration - this.aliveDuration) / 2
    blob.fadeInDuration = fadeDuration
    blob.fadeOutDuration = fadeDuration
    blob.age = 0

    // New noise offset for different color
    blob.noiseOffsetX = Math.random() * 1000
    blob.noiseOffsetY = Math.random() * 1000

    // New alpha and chaos values
    blob.alphaMultiplier = 0.4 + Math.random() * 0.6
    blob.edgeChaos = 0.2 + Math.random() * 0.3
    blob.rotation = Math.random() * Math.PI * 2
    // New hue offset for color variety
    blob.hueOffset = Math.random() * 60 - 30
  }

  /**
   * Calculate opacity based on lifecycle phase
   * @param {Object} blob - Blob object
   * @returns {number} Opacity multiplier 0-1
   */
  getLifecycleOpacity(blob) {
    const age = blob.age
    const fadeIn = blob.fadeInDuration
    const fadeOut = blob.fadeOutDuration

    if (age < fadeIn) {
      // Fading in
      return age / fadeIn
    } else if (age < fadeIn + this.aliveDuration) {
      // Fully visible
      return 1
    } else if (age < blob.cycleDuration) {
      // Fading out
      const fadeOutProgress = (age - fadeIn - this.aliveDuration) / fadeOut
      return 1 - fadeOutProgress
    } else {
      // Should respawn
      return 0
    }
  }

  /**
   * Map noise value (0-1) to full hue spectrum
   * @param {number} noiseVal - Noise value 0-1
   * @returns {number} Hue 0-360 (full spectrum including purples/magentas)
   */
  noiseToHue(noiseVal) {
    // Full 0-360° spectrum for maximum color variety
    return noiseVal * 360
  }

  /**
   * Update animation, movement and lifecycle
   * @param {number} dt - Delta time in milliseconds
   */
  update(dt) {
    // dt comes in SECONDS from p5.js (e.g., 0.016 for 60fps)
    // Convert to milliseconds for our calculations
    const dtMs = dt < 1 ? dt * 1000 : dt  // Handle both seconds and ms
    const clampedDt = Math.min(dtMs, 100)  // Cap at 100ms

    // Advance global time for noise animation
    this.time += clampedDt * 0.0003

    // Interpolate current bias toward target bias (smooth composition transitions)
    this.currentBias.center += (this.targetBias.center - this.currentBias.center) * this.biasTransitionSpeed
    this.currentBias.weight += (this.targetBias.weight - this.currentBias.weight) * this.biasTransitionSpeed

    // Update each blob
    for (const blob of this.blobs) {
      // Advance lifecycle age
      blob.age += clampedDt

      // Check if blob should respawn
      if (blob.age >= blob.cycleDuration) {
        this.respawnBlob(blob)
      }

      // Move blob in its direction (slow but perceptible drift)
      blob.x += blob.vx * clampedDt
      blob.y += blob.vy * clampedDt

      // Soft boundary bounce (reverse direction near edges)
      if (blob.x < 0.05 || blob.x > 0.95) {
        blob.vx *= -1
        blob.x = Math.max(0.05, Math.min(0.95, blob.x))
      }
      if (blob.y < 0.05 || blob.y > 0.95) {
        blob.vy *= -1
        blob.y = Math.max(0.05, Math.min(0.95, blob.y))
      }

      // Gentle radius breathing
      const breathe = Math.sin(this.time * 2 + blob.phase) * 0.05
      const pulseEffect = 1 + blob.pulseIntensity * 0.15
      blob.rx = blob.baseRx * pulseEffect * (1 + breathe)
      blob.ry = blob.baseRy * pulseEffect * (1 + breathe * 0.8)

      // Decay of pulse effect
      blob.pulseIntensity *= NeonNebulaSystem.CONFIG.PULSE_DECAY_RATE
      if (blob.pulseIntensity < 0.01) blob.pulseIntensity = 0
    }
  }

  /**
   * Main render function - renders to low-res buffer then scales up for natural blur
   * @param {p5} p - p5.js instance
   */
  render(p) {
    if (this.performanceMode === 'disabled') return

    const C = NeonNebulaSystem.CONFIG
    const scale = this.performanceMode === 'degraded' ? C.BUFFER_SCALE_DEGRADED : this.bufferScale
    const bufferWidth = Math.floor(p.width * scale)
    const bufferHeight = Math.floor(p.height * scale)

    // Create or resize buffer if needed
    const bufferResized = !this.buffer || this.lastBufferWidth !== bufferWidth || this.lastBufferHeight !== bufferHeight
    if (bufferResized) {
      this.buffer = p.createGraphics(bufferWidth, bufferHeight)
      this.lastBufferWidth = bufferWidth
      this.lastBufferHeight = bufferHeight
    }

    // Only re-render buffer every N frames (noise moves imperceptibly between frames)
    this._bufferAge++
    const needsRefresh = bufferResized || this._bufferAge >= this._bufferRefreshInterval
    if (needsRefresh) {
      this._bufferAge = 0

      // Clear buffer with transparent background
      this.buffer.clear()
      this.buffer.colorMode(this.buffer.HSB, 360, 100, 100, 100)
      this.buffer.noStroke()

      // Render each blob to the low-res buffer
      for (const blob of this.blobs) {
        this.renderBlobToBuffer(this.buffer, blob, scale)
      }
    }

    // Always blit cached buffer to main canvas (bilinear interpolation = free blur)
    p.push()
    p.imageMode(p.CORNER)
    p.image(this.buffer, 0, 0, p.width, p.height)
    p.pop()
  }

  /**
   * Render a blob to a scaled buffer
   * @param {p5.Graphics} buf - Graphics buffer
   * @param {Object} blob - Blob object
   * @param {number} scale - Scale factor (0.25 = 1/4 resolution)
   */
  renderBlobToBuffer(buf, blob, scale) {
    const C = NeonNebulaSystem.CONFIG
    const lifecycleOpacity = this.getLifecycleOpacity(blob)
    if (lifecycleOpacity < 0.01) return

    const cx = blob.x * buf.width
    const cy = blob.y * buf.height
    const rx = blob.rx * scale
    const ry = blob.ry * scale

    // Scaled cell size
    const baseCellSize = this.performanceMode === 'degraded' ? C.CELL_SIZE_DEGRADED : C.CELL_SIZE_NORMAL
    const cellSize = Math.max(4, baseCellSize * scale)

    const minX = Math.max(0, cx - rx - cellSize)
    const maxX = Math.min(buf.width, cx + rx + cellSize)
    const minY = Math.max(0, cy - ry - cellSize)
    const maxY = Math.min(buf.height, cy + ry + cellSize)

    // Sample noise for base hue
    const blobNoiseX = (cx + blob.noiseOffsetX) * this.noiseScale * 0.3
    const blobNoiseY = (cy + blob.noiseOffsetY) * this.noiseScale * 0.3
    const blobNoiseVal = buf.noise(blobNoiseX, blobNoiseY, this.time)
    const noiseHue = this.noiseToHue(blobNoiseVal)
    const biasWeight = this.currentBias.weight
    const baseHue = (noiseHue * (1 - biasWeight) + this.currentBias.center * biasWeight + 360) % 360

    const chaos = blob.edgeChaos || 0.3
    const rot = blob.rotation || 0
    const blobAlpha = blob.alphaMultiplier || 1.0
    const cosR = Math.cos(rot)
    const sinR = Math.sin(rot)

    for (let x = minX; x < maxX; x += cellSize) {
      for (let y = minY; y < maxY; y += cellSize) {
        const relX = x + cellSize / 2 - cx
        const relY = y + cellSize / 2 - cy
        const rotX = relX * cosR - relY * sinR
        const rotY = relX * sinR + relY * cosR
        const dx = rotX / rx
        const dy = rotY / ry
        let dist = Math.sqrt(dx * dx + dy * dy)

        const angle = Math.atan2(dy, dx)
        const edgeNoise = buf.noise(
          blob.noiseOffsetX * 0.01 + Math.cos(angle) * 2,
          blob.noiseOffsetY * 0.01 + Math.sin(angle) * 2,
          this.time * 0.3
        )
        dist = dist * (1 + (edgeNoise - 0.5) * chaos * 2)

        if (dist > 1.0) continue

        const falloff = Math.pow(1 - dist, 2)
        const texNoiseX = (x + blob.noiseOffsetX) * this.noiseScale * 2
        const texNoiseY = (y + blob.noiseOffsetY) * this.noiseScale * 2
        const texNoise = buf.noise(texNoiseX, texNoiseY, this.time * 0.5)

        // Enhanced hue variation with per-blob offset
        const hueVariation = (texNoise - 0.5) * C.HUE_VARIATION_RANGE
        const blobHueOffset = blob.hueOffset || 0
        const hue = (baseHue + hueVariation + blobHueOffset + 360) % 360

        // Noise-based saturation and lightness variation (reuses existing texNoise)
        const satVariation = (texNoise - 0.5) * C.SATURATION_VARIATION * 2
        const lightVariation = (texNoise - 0.5) * C.LIGHTNESS_VARIATION * 2
        const sat = Math.max(50, Math.min(100, this.baseSaturation + satVariation))
        const light = Math.max(40, Math.min(80, this.baseLightness + lightVariation))

        const alphaVariation = 0.7 + texNoise * 0.3
        const alpha = this.baseAlpha * falloff * alphaVariation * lifecycleOpacity * blobAlpha

        if (alpha < C.MIN_ALPHA_THRESHOLD) continue

        // Skip ~40% of cells using texNoise (already computed, spatially coherent = organic clusters)
        if (texNoise < C.CELL_SKIP_THRESHOLD) continue

        // Smooth jitter from sin/cos (spatially coherent, nearly free, per-blob variation)
        const jitterX = Math.sin(x * 0.3 + y * 0.7 + blob.noiseOffsetX) * cellSize * 0.4
        const jitterY = Math.cos(x * 0.5 + y * 0.3 + blob.noiseOffsetY) * cellSize * 0.4
        const cellCenterX = x + cellSize / 2 + jitterX
        const cellCenterY = y + cellSize / 2 + jitterY

        // 2-layer rendering with vibrant colors (less aggressive multipliers)
        buf.fill(hue, sat * 0.92, light * 0.88, alpha * 0.4)
        buf.ellipse(cellCenterX, cellCenterY, cellSize * 2, cellSize * 2)

        buf.fill(hue, sat, light, alpha * 0.7)
        buf.ellipse(cellCenterX, cellCenterY, cellSize, cellSize)
      }
    }
  }

  // REMOVED: renderBlob() - duplicate of renderBlobToBuffer(), unused since buffer rendering was implemented

  /**
   * Get current bias settings (for external use/debugging)
   * @returns {Object} Current bias settings {center, weight}
   */
  getCurrentBias() {
    return { ...this.currentBias }
  }

  /**
   * Handle background composition events - adjust color bias
   * @param {Object} composition - Background composition from backend
   */
  onBackgroundComposition(composition) {
    if (!composition || !composition.type) return

    const type = composition.type
    const C = NeonNebulaSystem.CONFIG

    // Validate composition type
    if (!C.VALID_COMPOSITION_TYPES.includes(type)) {
      return
    }

    if (this.compositionBias[type]) {
      // Set target bias for smooth transition
      this.targetBias = { ...this.compositionBias[type] }

      // Trigger pulse on composition change
      this.triggerPulse(0.5)
    }
  }

  /**
   * Update interaction metrics for reactive movement
   * @param {Object} metrics - Interaction metrics
   */
  setInteractionMetrics(metrics) {
    if (!metrics) return

    // Update target interaction zone
    if (metrics.dominantZone) {
      this.targetInteraction.x = metrics.dominantZone.x
      this.targetInteraction.y = metrics.dominantZone.y
    }

    // Increase attraction with more users/activity
    if (metrics.spatialDensity !== undefined) {
      this.attractionStrength = 0.1 + metrics.spatialDensity * 0.2
    }
  }

  /**
   * Trigger pulse effect on all blobs
   * @param {number} intensity - Pulse intensity 0-1
   */
  triggerPulse(intensity = 0.5) {
    for (const blob of this.blobs) {
      blob.pulseIntensity = Math.min(1, blob.pulseIntensity + intensity)
    }
  }

  /**
   * Set performance mode
   * @param {string} mode - 'normal', 'degraded', or 'disabled'
   */
  setPerformanceMode(mode) {
    const C = NeonNebulaSystem.CONFIG

    // Only reinitialize if mode actually changed
    if (this.performanceMode === mode) return

    this.performanceMode = mode

    if (mode === 'degraded') {
      this.glowEnabled = false
      this.blobCount = C.BLOB_COUNT_DEGRADED
      // Reinitialize with fewer blobs
      this.initializeBlobs()
    } else if (mode === 'normal') {
      this.glowEnabled = true
      this.blobCount = C.BLOB_COUNT_NORMAL
      this.initializeBlobs()
    }
  }

  /**
   * Get current color info for attractor color sync
   * @returns {Object} Current color configuration
   */
  get colors() {
    // Return array of color objects matching expected format
    return [{
      hue: this.currentBias.center,
      sat: this.baseSaturation,
      light: this.baseLightness,
      alpha: this.baseAlpha
    }]
  }

  /**
   * Clear all state
   */
  clear() {
    this.blobs = []
    this.initializeBlobs()
  }

  /**
   * Get blob count
   * @returns {number} Number of active blobs
   */
  getCount() {
    return this.blobs.length
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.blobs = []
    if (this.buffer) {
      this.buffer.remove()
      this.buffer = null
    }
  }
}

// Export for different module systems
if (typeof window !== 'undefined') {
  window.NeonNebulaSystem = NeonNebulaSystem
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NeonNebulaSystem
}
