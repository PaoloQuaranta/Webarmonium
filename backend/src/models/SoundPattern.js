const { v4: uuidv4 } = require('uuid')

/**
 * SoundPattern Model
 * Generative musical elements that evolve from user interactions
 * Constitutional requirement: Genre-agnostic, performance-optimized
 */
class SoundPattern {
  constructor(roomId, type, initialParams = {}) {
    this.id = uuidv4()
    this.roomId = roomId
    this.type = this.validateType(type)
    this.parameters = this.validateParameters(initialParams)
    this.evolutionState = {
      generation: 0,
      influences: [],
      adaptationHistory: []
    }
    this.influenceWeight = 0.0
    this.createdAt = new Date()
    this.lastModified = new Date()
    this.state = 'emerging' // emerging -> active -> evolving -> dormant -> expired
  }

  /**
   * Validate pattern type enum
   * @param {string} type - Pattern type
   * @returns {string} Validated type
   */
  validateType(type) {
    const validTypes = ['ambient', 'rhythmic', 'harmonic', 'textural']
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid pattern type: ${type}. Must be: ${validTypes.join(', ')}`)
    }
    return type
  }

  /**
   * Validate and normalize audio synthesis parameters
   * @param {Object} params - Audio parameters
   * @returns {Object} Validated parameters
   */
  validateParameters(params) {
    const defaultParams = {
      frequency: 440,      // Hz
      amplitude: 0.5,      // 0.0-1.0
      waveform: 'sine',    // sine, square, sawtooth, triangle
      filter: 'none',     // lowpass, highpass, bandpass, none
      envelope: {
        attack: 0.1,      // seconds
        decay: 0.2,       // seconds
        sustain: 0.7,     // 0.0-1.0
        release: 0.5      // seconds
      }
    }

    const validatedParams = { ...defaultParams, ...params }

    // Validate frequency range (20Hz - 20kHz)
    if (validatedParams.frequency < 20 || validatedParams.frequency > 20000) {
      throw new Error('Frequency must be between 20 and 20000 Hz')
    }

    // Validate amplitude range
    if (validatedParams.amplitude < 0 || validatedParams.amplitude > 1) {
      throw new Error('Amplitude must be between 0.0 and 1.0')
    }

    // Validate waveform
    const validWaveforms = ['sine', 'square', 'sawtooth', 'triangle']
    if (!validWaveforms.includes(validatedParams.waveform)) {
      validatedParams.waveform = 'sine'
    }

    // Validate envelope parameters
    if (validatedParams.envelope) {
      const env = validatedParams.envelope
      if (env.attack < 0 || env.decay < 0 || env.release < 0) {
        throw new Error('Envelope times must be non-negative')
      }
      if (env.sustain < 0 || env.sustain > 1) {
        throw new Error('Envelope sustain must be between 0.0 and 1.0')
      }
    }

    return validatedParams
  }

  /**
   * Evolve pattern based on gesture influence
   * @param {Gesture} gesture - Influencing gesture
   * @param {number} influenceStrength - How much gesture affects pattern (0.0-1.0)
   */
  evolveFromGesture(gesture, influenceStrength = 0.1) {
    if (!gesture || !gesture.sonicParams) {
      throw new Error('Gesture with sonic parameters required')
    }

    const gestureInfluence = {
      gestureId: gesture.id,
      userId: gesture.userId,
      timestamp: new Date(),
      strength: influenceStrength,
      changes: {}
    }

    // Apply gesture influence based on pattern type
    switch (this.type) {
      case 'ambient':
        this.evolveAmbient(gesture, influenceStrength, gestureInfluence)
        break

      case 'rhythmic':
        this.evolveRhythmic(gesture, influenceStrength, gestureInfluence)
        break

      case 'harmonic':
        this.evolveHarmonic(gesture, influenceStrength, gestureInfluence)
        break

      case 'textural':
        this.evolveTextural(gesture, influenceStrength, gestureInfluence)
        break
    }

    // Update evolution state
    this.evolutionState.generation++
    this.evolutionState.influences.push(gestureInfluence)
    this.evolutionState.adaptationHistory.push({
      timestamp: new Date(),
      changes: gestureInfluence.changes
    })

    // Limit history size for performance
    if (this.evolutionState.influences.length > 100) {
      this.evolutionState.influences = this.evolutionState.influences.slice(-50)
    }

    this.updateState()
    this.lastModified = new Date()
  }

  /**
   * Evolve ambient pattern (continuous, atmospheric sounds)
   * @param {Gesture} gesture - Influencing gesture
   * @param {number} strength - Influence strength
   * @param {Object} influence - Influence tracking object
   */
  evolveAmbient(gesture, strength, influence) {
    const coords = gesture.coordinates

    // Map gesture coordinates to frequency and amplitude changes
    const frequencyShift = (coords.x - 0.5) * 200 * strength // ±100Hz max
    const amplitudeShift = (coords.y - 0.5) * 0.2 * strength // ±0.1 max

    influence.changes.frequency = frequencyShift
    influence.changes.amplitude = amplitudeShift

    this.parameters.frequency = Math.max(20, Math.min(20000,
      this.parameters.frequency + frequencyShift))
    this.parameters.amplitude = Math.max(0, Math.min(1,
      this.parameters.amplitude + amplitudeShift))

    // Gyroscope adds filter modulation
    if (coords.z !== undefined) {
      this.parameters.filter = coords.z > 0.7 ? 'lowpass' : 'none'
      influence.changes.filter = this.parameters.filter
    }
  }

  /**
   * Evolve rhythmic pattern (percussive, temporal elements)
   * @param {Gesture} gesture - Influencing gesture
   * @param {number} strength - Influence strength
   * @param {Object} influence - Influence tracking object
   */
  evolveRhythmic(gesture, strength, influence) {
    const intensity = gesture.intensity

    // Intensity affects rhythm density and envelope
    const envelopeScale = intensity * strength
    influence.changes.envelope = envelopeScale

    this.parameters.envelope.attack *= (1 - envelopeScale * 0.5)
    this.parameters.envelope.decay *= (1 + envelopeScale)
    this.parameters.envelope.release *= (1 - envelopeScale * 0.3)

    // Gesture type affects waveform
    switch (gesture.type) {
      case 'mouse':
        this.parameters.waveform = 'square'
        break
      case 'touch':
        this.parameters.waveform = 'sawtooth'
        break
      case 'gyroscope':
        this.parameters.waveform = 'triangle'
        break
    }

    influence.changes.waveform = this.parameters.waveform
  }

  /**
   * Evolve harmonic pattern (tonal, melodic elements)
   * @param {Gesture} gesture - Influencing gesture
   * @param {number} strength - Influence strength
   * @param {Object} influence - Influence tracking object
   */
  evolveHarmonic(gesture, strength, influence) {
    const coords = gesture.coordinates

    // Map coordinates to harmonic intervals
    const harmonicRatio = 1 + (coords.y * 2) // 1.0 to 3.0
    const newFrequency = this.parameters.frequency * harmonicRatio * strength +
                        this.parameters.frequency * (1 - strength)

    influence.changes.frequency = newFrequency - this.parameters.frequency
    this.parameters.frequency = Math.max(20, Math.min(20000, newFrequency))

    // X coordinate affects harmonic complexity
    if (coords.x > 0.7) {
      this.parameters.waveform = 'sawtooth' // More harmonics
    } else if (coords.x < 0.3) {
      this.parameters.waveform = 'sine' // Pure tone
    }

    influence.changes.waveform = this.parameters.waveform
  }

  /**
   * Evolve textural pattern (noise-based, atmospheric)
   * @param {Gesture} gesture - Influencing gesture
   * @param {number} strength - Influence strength
   * @param {Object} influence - Influence tracking object
   */
  evolveTextural(gesture, strength, influence) {
    const coords = gesture.coordinates
    const intensity = gesture.intensity

    // Texture complexity based on gesture intensity
    this.parameters.amplitude = intensity * 0.8 * strength +
                               this.parameters.amplitude * (1 - strength)

    // Filter sweep based on coordinates
    if (coords.x < 0.3) {
      this.parameters.filter = 'lowpass'
    } else if (coords.x > 0.7) {
      this.parameters.filter = 'highpass'
    } else {
      this.parameters.filter = 'bandpass'
    }

    influence.changes.amplitude = this.parameters.amplitude
    influence.changes.filter = this.parameters.filter
  }

  /**
   * Update pattern state based on recent activity
   */
  updateState() {
    const recentInfluences = this.evolutionState.influences.filter(inf => {
      const ageMs = Date.now() - inf.timestamp.getTime()
      return ageMs < 30000 // Last 30 seconds
    })

    if (recentInfluences.length === 0) {
      if (this.state === 'active' || this.state === 'evolving') {
        this.state = 'dormant'
      }
    } else if (recentInfluences.length > 5) {
      this.state = 'evolving'
    } else {
      this.state = 'active'
    }

    // Calculate influence weight based on recent activity
    this.influenceWeight = Math.min(1.0, recentInfluences.length / 10)
  }

  /**
   * Check if pattern should expire (dormant for too long)
   * @param {number} maxDormantMs - Maximum dormant time (default: 5 minutes)
   * @returns {boolean} True if pattern should expire
   */
  shouldExpire(maxDormantMs = 5 * 60 * 1000) {
    if (this.state !== 'dormant') {
      return false
    }

    const timeSinceLastModified = Date.now() - this.lastModified.getTime()
    return timeSinceLastModified > maxDormantMs
  }

  /**
   * Get pattern data for sonic-update broadcast
   * @returns {Object} Sonic update data
   */
  toSonicUpdate() {
    return {
      id: this.id,
      type: this.type,
      parameters: { ...this.parameters },
      intensity: this.influenceWeight
    }
  }

  /**
   * Get pattern summary for memory state
   * @returns {Object} Memory summary data
   */
  toMemorySummary() {
    return {
      type: this.type,
      averageFrequency: this.parameters.frequency,
      averageAmplitude: this.parameters.amplitude,
      dominantWaveform: this.parameters.waveform,
      evolutionCount: this.evolutionState.generation,
      influenceWeight: this.influenceWeight,
      state: this.state
    }
  }

  /**
   * Static method to create pattern from gesture
   * @param {string} roomId - Room ID
   * @param {Gesture} gesture - Initial gesture
   * @returns {SoundPattern} New pattern instance
   */
  static fromGesture(roomId, gesture) {
    // Determine pattern type based on gesture characteristics
    let patternType = 'ambient' // default

    if (gesture.intensity > 0.8) {
      patternType = 'rhythmic'
    } else if (gesture.coordinates.z !== undefined) {
      patternType = 'textural'
    } else if (gesture.coordinates.x > 0.5 && gesture.coordinates.y > 0.5) {
      patternType = 'harmonic'
    }

    // Initial parameters based on gesture
    const initialParams = {
      frequency: 220 + (gesture.coordinates.x * 660), // 220-880 Hz
      amplitude: gesture.intensity * 0.6,
      waveform: gesture.type === 'gyroscope' ? 'triangle' : 'sine'
    }

    return new SoundPattern(roomId, patternType, initialParams)
  }

  /**
   * Validate pattern for sonic processing
   * Constitutional requirement: Ensure audio parameter validity
   * @throws {Error} If pattern is invalid
   */
  validateForSonicProcessing() {
    if (!this.id || !this.roomId || !this.type) {
      throw new Error('Pattern ID, Room ID, and type are required')
    }

    if (!this.parameters) {
      throw new Error('Pattern parameters are required')
    }

    // Validate critical audio parameters
    if (this.parameters.frequency < 20 || this.parameters.frequency > 20000) {
      throw new Error('Pattern frequency out of valid range')
    }

    if (this.parameters.amplitude < 0 || this.parameters.amplitude > 1) {
      throw new Error('Pattern amplitude out of valid range')
    }

    if (this.influenceWeight < 0 || this.influenceWeight > 1) {
      throw new Error('Pattern influence weight out of valid range')
    }
  }
}

module.exports = SoundPattern