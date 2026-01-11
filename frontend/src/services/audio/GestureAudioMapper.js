/**
 * GestureAudioMapper.js
 * Maps gesture data to audio parameters
 * Extracted from AudioService.js for Phase 2 refactoring
 */
class GestureAudioMapper {
  constructor(parameterMappings = null, threeTierConfig = null, colorPool = null) {
    // Parameter mapping configuration (can be overridden)
    this.parameterMappings = parameterMappings || {
      frequency: {
        range: [220, 880], // A3 to A5
        curve: 'linear',
        smoothing: 0.1
      },
      amplitude: {
        range: [0.1, 0.8],
        curve: 'exponential',
        smoothing: 0.2
      },
      filter: {
        range: [200, 2000],
        curve: 'logarithmic',
        smoothing: 0.15
      },
      pan: {
        range: [-1, 1],
        curve: 'linear',
        smoothing: 0.05
      }
    }

    // Three-tier audio architecture parameters
    this.threeTierConfig = threeTierConfig || {
      background: {
        waveform: 'triangle',
        volumeMultiplier: 0.7,
        baseFrequency: 110,
        color: '#4a9eff'
      },
      remote: {
        waveform: 'square',
        volumeMultiplier: 1.5,
        baseFrequency: 440,
        color: '#ff6b6b'
      },
      local: {
        waveform: 'sawtooth',
        volumeMultiplier: 2.0,
        baseFrequency: 880,
        color: '#6bcf7f'
      }
    }

    // Color-to-frequency mapping (10-color pool: 3 virtual + 7 real)
    // Virtual user colors (exclusive): red, orange, blue
    // Real user colors (exclusive): green, purple, yellow, brown, pink, gray, teal
    this.colorPool = colorPool || [
      '#e41a1c', '#ff7f00', '#377eb8',  // Virtual users (Wikipedia, HackerNews, GitHub)
      '#4daf4a', '#984ea3', '#ffff33', '#a65628', '#f781bf', '#999999', '#66c2a5'  // Real users
    ]
    this.colorFrequencyRange = { min: 200, max: 800 }

    // Current parameters state for smoothing
    this.currentParameters = {}
  }

  /**
   * Map gesture coordinates to frequency per FR-002
   * @param {Object} sonicParams - Sonic parameters from gesture
   * @returns {number} Frequency in Hz
   */
  mapGestureToFrequency(sonicParams) {
    const x = sonicParams.x || sonicParams.frequency || 0.5
    return 100 + (x * 1000) // 100Hz to 1100Hz range
  }

  /**
   * Map gesture intensity to volume per FR-002
   * @param {Object} sonicParams - Sonic parameters
   * @returns {number} Volume (0-1)
   */
  mapGestureToVolume(sonicParams) {
    const intensity = sonicParams.y || sonicParams.amplitude || sonicParams.intensity || 0.5
    return Math.max(0.1, Math.min(0.8, intensity))
  }

  /**
   * Map gesture movement to filter parameters per FR-002
   * Implements three-tier modulation system
   * @param {Object} sonicParams - Sonic parameters
   * @returns {Object} Filter parameters
   */
  mapGestureToFilter(sonicParams) {
    const tier = sonicParams.tier || 'local'

    if (tier === 'local') {
      // LOCAL MODULATION: Y controls cutoff, X controls resonance
      const y = sonicParams.y || 0.5
      const x = sonicParams.x || 0.5

      const cutoff = 200 + ((1 - y) * 3800) // 200Hz to 4000Hz, inverted Y axis
      const resonance = 0.5 + (x * 4.5) // 0.5 to 5.0 Q range

      return {
        cutoffFrequency: cutoff,
        resonance: resonance,
        tremoloAmount: 0
      }
    } else if (tier === 'remote') {
      // REMOTE MODULATION: X = LFO speed, Y = LFO amplitude
      const y = sonicParams.y || 0.5
      const x = sonicParams.x || 0.5

      const lfoSpeed = 0.05 + (x * 9.95) // 0.05Hz to 10Hz
      const lfoAmplitude = y // 0.0 to 1.0

      return {
        lfoSpeed: lfoSpeed,
        lfoAmplitude: lfoAmplitude,
        isRemoteLFO: true
      }
    } else {
      // Background/default modulation
      const movement = sonicParams?.z ?? sonicParams?.movement ?? sonicParams?.y ?? 0.5
      const validMovement = typeof movement === 'number' && !isNaN(movement) ? movement : 0.5
      const clampedMovement = Math.max(0, Math.min(1, validMovement))

      const filterFreq = 200 + (clampedMovement * 2000)

      return {
        cutoffFrequency: filterFreq,
        resonance: 1.0,
        tremoloAmount: 0
      }
    }
  }

  /**
   * Map gesture data to complete audio parameters
   * @param {Object} gestureData - Gesture data
   * @returns {Object} Audio parameters
   */
  mapGestureToAudio(gestureData) {
    const { type, coordinates, intensity } = gestureData

    let audioParams = {
      frequency: this.mapCoordinateToParameter('frequency', coordinates.x),
      amplitude: this.mapIntensityToParameter('amplitude', intensity),
      waveform: this.selectWaveformFromGesture(gestureData),
      filter: this.generateFilterFromCoordinates(coordinates),
      envelope: this.generateEnvelopeFromGesture(gestureData),
      spatialParams: this.generateSpatialParameters(coordinates)
    }

    // Device-specific parameter adjustments
    audioParams = this.applyDeviceSpecificMappings(audioParams, type)

    // Apply parameter smoothing
    audioParams = this.applySmoothingToParameters(audioParams)

    return audioParams
  }

  /**
   * Map coordinate to parameter using configured mapping
   * @param {string} parameterName - Parameter to map
   * @param {number} value - Input value (0-1)
   * @returns {number} Mapped parameter value
   */
  mapCoordinateToParameter(parameterName, value) {
    const mapping = this.parameterMappings[parameterName]
    if (!mapping) return value

    const [min, max] = mapping.range

    let mappedValue
    switch (mapping.curve) {
      case 'exponential':
        mappedValue = min + (max - min) * Math.pow(value, 2)
        break
      case 'logarithmic':
        mappedValue = min + (max - min) * Math.log(value * 9 + 1) / Math.log(10)
        break
      case 'linear':
      default:
        mappedValue = min + (max - min) * value
        break
    }

    return mappedValue
  }

  /**
   * Map intensity to amplitude parameter
   * @param {string} parameterName - Parameter name
   * @param {number} intensity - Gesture intensity (0-1)
   * @returns {number} Mapped amplitude
   */
  mapIntensityToParameter(parameterName, intensity) {
    const mapping = this.parameterMappings[parameterName]
    if (!mapping) return intensity

    const [min, max] = mapping.range
    const mappedValue = min + (max - min) * Math.pow(intensity, 1.5)

    return Math.max(min, Math.min(max, mappedValue))
  }

  /**
   * Select waveform based on gesture characteristics
   * @param {Object} gestureData - Gesture data
   * @returns {string} Waveform type
   */
  selectWaveformFromGesture(gestureData) {
    const { type, intensity, coordinates } = gestureData

    switch (type) {
      case 'mouse':
        return coordinates.y > 0.6 ? 'sine' : 'triangle'
      case 'touch':
        if (intensity > 0.8) return 'square'
        if (intensity > 0.5) return 'sawtooth'
        return 'triangle'
      case 'gyroscope':
        if (coordinates.z > 0.7) return 'sawtooth'
        if (coordinates.z < 0.3) return 'triangle'
        return 'sine'
      default:
        return 'sine'
    }
  }

  /**
   * Generate filter parameters from coordinates
   * @param {Object} coordinates - Gesture coordinates
   * @returns {Object} Filter parameters
   */
  generateFilterFromCoordinates(coordinates) {
    const { x, y, z } = coordinates

    let filterType = 'none'
    let cutoffFrequency = 1000
    let resonance = 1

    if (y < 0.3) {
      filterType = 'lowpass'
      cutoffFrequency = this.mapCoordinateToParameter('filter', x)
      resonance = 1 + (0.3 - y) * 20
    } else if (y > 0.7) {
      filterType = 'highpass'
      cutoffFrequency = this.mapCoordinateToParameter('filter', x) * 0.5
      resonance = 1 + (y - 0.7) * 10
    } else if (x > 0.4 && x < 0.6) {
      filterType = 'bandpass'
      cutoffFrequency = this.mapCoordinateToParameter('filter', y)
      resonance = 2 + Math.abs(x - 0.5) * 10
    }

    if (z !== undefined) {
      cutoffFrequency *= (0.5 + z * 0.5)
    }

    return {
      type: filterType,
      cutoffFrequency: Math.max(100, Math.min(4000, cutoffFrequency)),
      resonance: Math.max(0.1, Math.min(20, resonance))
    }
  }

  /**
   * Generate envelope parameters from gesture characteristics
   * @param {Object} gestureData - Gesture data
   * @returns {Object} ADSR envelope parameters
   */
  generateEnvelopeFromGesture(gestureData) {
    const { type, intensity, coordinates } = gestureData

    let envelope = {
      attack: 0.1,
      decay: 0.2,
      sustain: 0.7,
      release: 0.5
    }

    switch (type) {
      case 'touch':
        envelope.attack = 0.01 + intensity * 0.1
        envelope.sustain = Math.max(0.3, intensity)
        envelope.release = 0.2 + (1 - intensity) * 0.5
        break
      case 'mouse':
        envelope.attack = 0.05 + coordinates.y * 0.2
        envelope.decay = 0.1 + coordinates.x * 0.3
        envelope.sustain = 0.5 + intensity * 0.4
        envelope.release = 0.3 + (1 - coordinates.y) * 0.4
        break
      case 'gyroscope':
        envelope.attack = 0.2 + coordinates.z * 0.3
        envelope.decay = 0.3 + coordinates.x * 0.2
        envelope.sustain = 0.7 + coordinates.y * 0.2
        envelope.release = 0.5 + coordinates.z * 0.5
        break
    }

    // Clamp values
    envelope.attack = Math.max(0.001, Math.min(2.0, envelope.attack))
    envelope.decay = Math.max(0.001, Math.min(2.0, envelope.decay))
    envelope.sustain = Math.max(0.0, Math.min(1.0, envelope.sustain))
    envelope.release = Math.max(0.001, Math.min(3.0, envelope.release))

    return envelope
  }

  /**
   * Generate spatial audio parameters
   * @param {Object} coordinates - Gesture coordinates
   * @returns {Object} Spatial parameters
   */
  generateSpatialParameters(coordinates) {
    const { x, y, z } = coordinates

    return {
      pan: this.mapCoordinateToParameter('pan', x),
      distance: y,
      reverbAmount: Math.max(0, Math.min(1, y * 0.8)),
      elevation: z !== undefined ? (z * 2) - 1 : 0
    }
  }

  /**
   * Apply device-specific parameter mappings
   * @param {Object} audioParams - Base audio parameters
   * @param {string} deviceType - Device type
   * @returns {Object} Adjusted parameters
   */
  applyDeviceSpecificMappings(audioParams, deviceType) {
    const adjusted = { ...audioParams }

    switch (deviceType) {
      case 'touch':
        adjusted.amplitude *= 1.2
        adjusted.filter.resonance *= 1.1
        break
      case 'gyroscope':
        adjusted.envelope.attack *= 1.5
        adjusted.envelope.release *= 1.3
        break
      case 'mouse':
        // Mouse: precise control, no adjustment needed
        break
    }

    return adjusted
  }

  /**
   * Apply smoothing to parameters to reduce jitter
   * @param {Object} audioParams - New parameters
   * @returns {Object} Smoothed parameters
   */
  applySmoothingToParameters(audioParams) {
    const smoothed = {}

    Object.keys(audioParams).forEach(key => {
      if (typeof audioParams[key] === 'number') {
        const smoothingFactor = this.parameterMappings[key]?.smoothing || 0.1
        const currentValue = this.currentParameters[key] || audioParams[key]
        smoothed[key] = currentValue + (audioParams[key] - currentValue) * smoothingFactor
      } else {
        smoothed[key] = audioParams[key]
      }
    })

    return smoothed
  }

  /**
   * Convert MIDI note number to frequency
   * @param {number} midiNote - MIDI note number (0-127)
   * @returns {number} Frequency in Hz
   */
  midiNoteToFrequency(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12)
  }

  /**
   * Map color to frequency based on 10-color pool
   * @param {string} color - Hex color (#rrggbb)
   * @returns {number|null} Frequency in Hz (200-800) or null if invalid
   */
  mapColorToFrequency(color) {
    if (!color || typeof color !== 'string') {
      return null
    }

    const normalizedColor = color.toLowerCase()
    const colorIndex = this.colorPool.findIndex(c => c.toLowerCase() === normalizedColor)

    if (colorIndex === -1) {
      return null
    }

    const { min, max } = this.colorFrequencyRange
    return min + (colorIndex / (this.colorPool.length - 1)) * (max - min)
  }

  /**
   * Calculate filter frequency from gesture parameters
   * @param {Object} sonicParams - Sonic parameters
   * @returns {number} Filter frequency
   */
  calculateFilterFrequency(sonicParams) {
    const y = sonicParams.y || 0.5
    return 200 + ((1 - y) * 3800)
  }

  /**
   * Calculate filter resonance from gesture parameters
   * @param {Object} sonicParams - Sonic parameters
   * @returns {number} Filter resonance (Q)
   */
  calculateFilterResonance(sonicParams) {
    const x = sonicParams.x || 0.5
    return 0.5 + (x * 4.5)
  }

  /**
   * Calculate frequency for three-tier architecture
   * @param {number} baseFrequency - Base frequency
   * @param {string} tier - Tier name
   * @param {number} velocity - Gesture velocity
   * @returns {number} Adjusted frequency
   */
  calculateThreeTierFrequency(baseFrequency, tier, velocity) {
    const tierConfig = this.threeTierConfig[tier]
    if (!tierConfig) return baseFrequency

    const tierFrequency = tierConfig.baseFrequency

    let velocityMultiplier = 1
    if (velocity < 150) {
      velocityMultiplier = 0.5 + (velocity / 150) * 0.3
    } else if (velocity < 400) {
      velocityMultiplier = 0.8 + ((velocity - 150) / 250) * 0.4
    } else {
      velocityMultiplier = 1.2 + Math.min((velocity - 400) / 400, 0.8)
    }

    return tierFrequency * velocityMultiplier
  }

  /**
   * Calculate volume for three-tier architecture
   * @param {string} tier - Tier name
   * @param {number} baseVolume - Base volume
   * @param {number} masterVolume - Master volume level
   * @returns {number} Adjusted volume
   */
  calculateThreeTierVolume(tier, baseVolume, masterVolume = 1.0) {
    const tierConfig = this.threeTierConfig[tier]
    if (!tierConfig) return baseVolume
    return baseVolume * tierConfig.volumeMultiplier * masterVolume
  }

  /**
   * Calculate duration for three-tier architecture based on velocity
   * @param {number} velocity - Gesture velocity
   * @param {string} baseDuration - Base duration string
   * @returns {number} Duration in seconds
   */
  calculateThreeTierDuration(velocity, baseDuration) {
    let durationMultiplier = 1

    if (velocity < 150) {
      durationMultiplier = 2 + Math.random() * 2
    } else if (velocity < 400) {
      durationMultiplier = 0.2 + Math.random() * 0.3
    } else {
      durationMultiplier = 0.05 + Math.random() * 0.15
    }

    const baseMs = this.parseDuration(baseDuration) || 500
    return (baseMs * durationMultiplier) / 1000
  }

  /**
   * Parse duration string to milliseconds
   * @param {string|number} duration - Duration value
   * @returns {number} Duration in milliseconds
   */
  parseDuration(duration) {
    if (typeof duration === 'number') return duration
    if (typeof duration !== 'string') return 500

    const durationMap = {
      '1n': 4000, '2n': 2000, '4n': 1000, '8n': 500, '16n': 250,
      '1m': 60000, '2m': 30000, '4m': 15000
    }

    return durationMap[duration] || 500
  }

  /**
   * Update current parameters (for smoothing)
   * @param {Object} params - New parameter values
   */
  updateCurrentParameters(params) {
    this.currentParameters = { ...this.currentParameters, ...params }
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.GestureAudioMapper = GestureAudioMapper
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GestureAudioMapper
}
