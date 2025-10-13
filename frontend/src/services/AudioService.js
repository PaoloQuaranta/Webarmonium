/**
 * AudioService
 * Real-time audio parameter mapping and sonic feedback coordination
 * Constitutional requirement: <200ms gesture-to-sound latency, 60fps parameter updates
 */
class AudioService {
  constructor() {
    this.isInitialized = false
    this.audioEngine = null
    this.gestureCapture = null

    // Mute and volume controls
    this.muted = false
    this.volume = 1.0 // 0-1 range

    // Color-to-frequency mapping (10-color pool)
    this.colorPool = [
      '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
      '#ffff33', '#a65628', '#f781bf', '#999999', '#66c2a5'
    ]
    this.colorFrequencyRange = { min: 200, max: 800 } // Hz

    // Parameter mapping configuration
    this.parameterMappings = {
      frequency: {
        range: [220, 880], // A3 to A5
        curve: 'linear',   // linear, exponential, logarithmic
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

    // Real-time parameter state
    this.currentParameters = {
      frequency: 440,
      amplitude: 0.5,
      waveform: 'sawtooth',
      filter: {
        type: 'none',
        cutoffFrequency: 1000,
        resonance: 1
      },
      envelope: {
        attack: 0.1,
        decay: 0.2,
        sustain: 0.7,
        release: 0.5
      },
      spatialParams: {
        pan: 0,
        distance: 0.5,
        reverbAmount: 0.2,
        elevation: 0
      }
    }

    // Collaborative pattern rate limiting
    this.lastCollaborativePatternTime = 0
    this.lastCollaborativePatterns = null

    // Ambient synth state tracking
    this.ambientSynthActive = false

    // Performance tracking
    this.performanceMetrics = {
      gestureToSoundLatency: [],
      averageLatency: 0,
      maxLatency: 0,
      parameterUpdatesPerSecond: 0,
      droppedUpdates: 0,
      totalUpdates: 0
    }

    // Update loop management
    this.updateLoopActive = false
    this.updateInterval = null
    this.targetFPS = 60
    this.updateTimeSlice = 1000 / this.targetFPS // ~16.67ms

    // Gesture buffer for smooth interpolation
    this.gestureBuffer = []
    this.maxBufferSize = 10

    // Audio context state
    this.audioContextState = 'not-initialized'
  }

  /**
   * Initialize audio service with dependencies
   * @param {Object} audioEngine - AudioEngine component instance
   * @param {Object} gestureCapture - GestureCapture service instance
   */
  async initialize(audioEngine, gestureCapture) {
    try {
      this.audioEngine = audioEngine
      this.gestureCapture = gestureCapture

      // Start real-time parameter update loop
      this.startUpdateLoop()

      this.isInitialized = true
      this.audioContextState = 'initialized'

      console.log('AudioService initialized with 60fps parameter updates')

      return true
    } catch (error) {
      console.error('AudioService initialization failed:', error)
      throw error
    }
  }

  /**
   * Start the audio engine
   * @returns {Promise} Resolves when audio context is ready
   */
  async start() {
    try {
      // Initialize Tone.js audio context
      if (window.Tone && !this.isInitialized) {
        await Tone.start()

        // Create continuous generative music system per FR-001
        this.createContinuousGenerativeSystem()

        // Start the parameter update loop
        this.startUpdateLoop()

        this.isInitialized = true
        console.log('🔊 AudioService started successfully - Continuous generative music active')

        // Test audio immediately to verify setup
        this.testAudio()

        return true
      } else if (this.isInitialized) {
        console.log('🔊 AudioService already initialized')
        return true
      } else {
        throw new Error('Tone.js not available')
      }
    } catch (error) {
      console.error('❌ Failed to start AudioService:', error)
      throw error
    }
  }

  /**
   * Create continuous generative music system per FR-001
   * System MUST continuously generate ambient music even when no users are present
   */
  createContinuousGenerativeSystem() {
    // Create master volume node for centralized control (FR-011)
    this.masterVolume = new Tone.Volume(-10).toDestination()

    // Create ambient oscillators for continuous generation
    this.ambientSynth = new Tone.PolySynth({
      oscillator: { type: 'sawtooth' }, // Sawtooth for rich harmonics that respond well to filtering
      envelope: { attack: 0.5, decay: 0.3, sustain: 0.4, release: 2 }
    })

    // Create separate volume control for ambient synth to make it more audible
    this.ambientVolume = new Tone.Volume(-5).toDestination() // Louder than master volume

    // Add filter to ambient synth for hover modulation
    this.ambientFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: 1500,
      Q: 5 // Higher Q for more dramatic filtering effect
    })

    // Correct routing: synth -> filter -> volume -> master
    this.ambientSynth.connect(this.ambientFilter)
    this.ambientFilter.connect(this.ambientVolume)
    this.ambientVolume.connect(this.masterVolume)

    // Create gesture-responsive synth for user interactions
    this.gestureSynth = new Tone.PolySynth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.6, release: 0.5 }
    })

    // Add filter to gesture synth for hover modulation
    this.gestureFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: 2000,
      Q: 1
    }).toDestination()

    this.gestureSynth.connect(this.gestureFilter)
    this.gestureFilter.connect(this.masterVolume)

    // Set up continuous ambient generation
    this.startAmbientGeneration()

    console.log('🎵 Continuous generative system created with master volume control')
  }

  /**
   * Start ambient music generation per FR-001
   */
  startAmbientGeneration() {
    if (this.ambientGenerationActive) return

    this.ambientGenerationActive = true

    const generateAmbientNote = () => {
      console.log(`🎵 generateAmbientNote called - active: ${this.ambientGenerationActive}, initialized: ${this.isInitialized}, muted: ${this.muted}`)

      if (!this.ambientGenerationActive || !this.isInitialized) {
        console.log('🎵 Ambient generation stopped or not initialized')
        return
      }

      // Generate ambient frequencies based on room state
      const baseFrequencies = [220, 293.66, 369.99, 440, 554.37] // A3, D4, F#4, A4, C#5

      // Create continuous ambient sound with multiple voices for rich texture
      if (!this.muted && !this.ambientSynthActive) {
        try {
          // Trigger multiple notes simultaneously for continuous sound
          const frequencies = [
            baseFrequencies[0], // A3 - bass foundation
            baseFrequencies[2], // F#4 - mid harmony
            baseFrequencies[4]  // C#5 - high harmony
          ]

          // Use triggerAttack for sustained notes (not release)
          frequencies.forEach(freq => {
            this.ambientSynth.triggerAttack(freq, undefined, 0.2)
          })

          this.ambientSynthActive = true
          console.log(`🎵 Started continuous ambient sound with frequencies: ${frequencies.join(', ')}Hz`)
        } catch (error) {
          console.error('🎵 Error starting ambient sound:', error)
        }
      } else if (this.muted && this.ambientSynthActive) {
        // Stop all ambient notes when muted
        try {
          this.ambientSynth.releaseAll()
          this.ambientSynthActive = false
          console.log('🔇 Stopped ambient sound (muted)')
        } catch (error) {
          console.error('🎵 Error stopping ambient sound:', error)
        }
      }

      // Schedule next note (shorter delay for testing: 3-5 seconds)
      const nextDelay = 3000 + Math.random() * 2000
      console.log(`🎵 Next ambient note in ${nextDelay}ms`)
      setTimeout(generateAmbientNote, nextDelay)
    }

    // Start ambient generation after a short delay to let test audio finish
    setTimeout(() => {
      console.log('🎵 Starting ambient generation loop')
      generateAmbientNote()
    }, 2000)

    console.log('🎵 Ambient music generation scheduled')
  }

  /**
   * Test audio to verify setup
   */
  testAudio() {
    if (!this.ambientSynth) return

    console.log('🔊 Testing audio - you should hear a test tone')
    this.ambientSynth.triggerAttackRelease(440, '4n', undefined, 0.5)

    setTimeout(() => {
      console.log('🔊 Audio test completed')
    }, 1000)
  }

  /**
   * Stop the audio engine
   */
  stop() {
    if (this.isInitialized) {
      this.stopUpdateLoop()

      // Stop ambient generation
      this.ambientGenerationActive = false
      this.ambientSynthActive = false

      // Stop all sustained notes before disposing
      if (this.ambientSynth) {
        this.ambientSynth.releaseAll()
        this.ambientSynth.dispose()
        this.ambientSynth = null
      }

      if (this.gestureSynth) {
        this.gestureSynth.dispose()
        this.gestureSynth = null
      }

      this.isInitialized = false
      console.log('🔇 AudioService stopped')
    }
  }

  /**
   * Update sonic parameters from gesture data per FR-002
   * System MUST translate user gestures into real-time sonic parameter modifications
   * @param {Object} sonicParams - Parameters from gesture processing
   */
  updateSonicParams(sonicParams) {
    if (!this.isInitialized || !this.gestureSynth) return

    try {
      // Real-time gesture-to-sonic parameter mapping per FR-002
      const frequency = this.mapGestureToFrequency(sonicParams)
      const volume = this.mapGestureToVolume(sonicParams)
      const filterFreq = this.mapGestureToFilter(sonicParams)

      // Apply real-time parameters to gesture synth
      this.gestureSynth.set({
        filter: { frequency: filterFreq }
      })

      // Trigger gesture-responsive note (volume controlled by masterVolume)
      // Use volume from gesture as velocity parameter (0.3-0.7 range)
      this.gestureSynth.triggerAttackRelease(frequency, '8n', undefined, 0.3 + (volume * 0.4))

      // Log for performance monitoring per FR-006 (<200ms latency)
      const timestamp = performance.now()
      console.log(`🎵 Gesture processed: ${frequency.toFixed(1)}Hz at ${timestamp.toFixed(1)}ms`)

    } catch (error) {
      console.warn('Audio playback error:', error)
    }
  }

  /**
   * Map gesture coordinates to frequency per FR-002
   */
  mapGestureToFrequency(sonicParams) {
    // X coordinate maps to frequency (no musical theory constraints per FR-002)
    const x = sonicParams.x || sonicParams.frequency || 0.5
    return 100 + (x * 1000) // 100Hz to 1100Hz range
  }

  /**
   * Map gesture intensity to volume per FR-002
   */
  mapGestureToVolume(sonicParams) {
    // Y coordinate or intensity maps to volume
    const intensity = sonicParams.y || sonicParams.amplitude || sonicParams.intensity || 0.5
    return Math.max(0.1, Math.min(0.8, intensity))
  }

  /**
   * Map gesture movement to filter parameters per FR-002
   */
  mapGestureToFilter(sonicParams) {
    // Movement speed or Z coordinate maps to filter cutoff
    const movement = sonicParams.z || sonicParams.movement || 0.5
    return 200 + (movement * 2000) // 200Hz to 2200Hz filter range
  }

  /**
   * Update sound patterns from collaborative data
   * Plays audio feedback for remote users' gestures (FR-003)
   * @param {Array} patterns - Sound patterns from other users
   */
  updatePatterns(patterns) {
    if (!this.isInitialized || this.muted) {
      console.log('🔇 updatePatterns blocked - initialized:', this.isInitialized, 'muted:', this.muted)
      return
    }

    // Rate limiting: prevent spamming collaborative patterns
    const now = Date.now()
    if (this.lastCollaborativePatternTime && (now - this.lastCollaborativePatternTime < 500)) {
      console.log('🔇 Collaborative patterns rate limited')
      return
    }
    this.lastCollaborativePatternTime = now

    // Store patterns for later processing
    this.collaborativePatterns = patterns || []
    console.log('🎵 Updated collaborative patterns:', patterns?.length || 0)

    // Check if patterns are the same as last time to avoid repetition
    if (this.lastCollaborativePatterns && this.arePatternsEqual(this.lastCollaborativePatterns, patterns)) {
      console.log('🔇 Skipping duplicate collaborative patterns')
      return
    }
    this.lastCollaborativePatterns = [...(patterns || [])]

    // Play audio feedback for each pattern from remote users (FR-003, FR-006)
    if (patterns && patterns.length > 0 && this.gestureSynth) {
      patterns.forEach((pattern, index) => {
        // Stagger sounds slightly to avoid clipping (20ms per pattern)
        const delay = index * 0.02

        try {
          // Use pattern frequency if available, otherwise derive from position with added variation
          let frequency = pattern.frequency
          if (!frequency) {
            if (pattern.x) {
              frequency = 200 + (pattern.x * 600) // 200-800Hz range
            } else {
              // Add variation to prevent same note spam
              frequency = 300 + Math.random() * 400 // 300-700Hz range with randomness
            }
          }

          // Use pattern intensity as velocity parameter with variation
          let intensity = pattern.intensity || pattern.y || 0.5
          if (!pattern.intensity && !pattern.y) {
            // Add some randomness if no intensity provided
            intensity = 0.3 + Math.random() * 0.4 // 0.3-0.7 range
          }
          const velocity = 0.1 + (intensity * 0.3) // 0.1-0.4 range for subtle collaborative audio

          console.log(`🎵 Playing collaborative pattern ${index}: ${frequency.toFixed(1)}Hz, intensity: ${intensity.toFixed(2)}`)

          // Play short note (FR-006: <200ms latency, volume controlled by masterVolume)
          this.gestureSynth.triggerAttackRelease(
            frequency,
            '32n', // Very short note (~62ms at 120bpm)
            `+${delay}`,
            velocity
          )
        } catch (error) {
          console.warn('🔇 Error playing collaborative pattern:', error)
        }
      })
    }
  }

  /**
   * Play sound effect for remote drawing stroke
   * Maps user color to frequency in 200-800Hz range
   * @param {string} color - User's assigned color (hex format #rrggbb)
   */
  playDrawSound(color) {
    console.log(`🔊 playDrawSound called - muted: ${this.muted}, volume: ${this.volume}, initialized: ${this.isInitialized}`)

    if (!this.isInitialized || this.muted || !this.gestureSynth) {
      console.log(`🔇 Audio blocked - muted: ${this.muted}, initialized: ${this.isInitialized}`)
      return
    }

    try {
      // Map color to frequency
      const frequency = this.mapColorToFrequency(color)

      if (!frequency) {
        console.warn('AudioService: Invalid color for draw sound', color)
        return
      }

      // Play short beep (volume controlled by masterVolume)
      console.log(`🎵 Playing draw sound at frequency ${frequency}Hz`)
      this.gestureSynth.triggerAttackRelease(frequency, '16n', undefined, 0.3)

    } catch (error) {
      console.warn('AudioService: Error playing draw sound', error)
    }
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

    // Normalize color to lowercase
    const normalizedColor = color.toLowerCase()

    // Find color index in pool
    const colorIndex = this.colorPool.findIndex(c => c.toLowerCase() === normalizedColor)

    if (colorIndex === -1) {
      console.warn('AudioService: Color not in pool', color)
      return null
    }

    // Map index (0-9) to frequency (200-800Hz)
    const { min, max } = this.colorFrequencyRange
    const frequency = min + (colorIndex / (this.colorPool.length - 1)) * (max - min)

    return frequency
  }

  /**
   * Set mute state (FR-011)
   * Controls master volume node in real-time
   * @param {boolean} muted - True to mute, false to unmute
   */
  setMuted(muted) {
    this.muted = Boolean(muted)

    // Apply to master volume node if initialized
    if (this.masterVolume) {
      this.masterVolume.mute = this.muted
      console.log(`🔇 Master volume ${this.muted ? 'MUTED' : 'UNMUTED'}`)
    }
  }

  /**
   * Set volume level (FR-011)
   * Controls master volume node in real-time
   * @param {number} volume - Volume level (0-1)
   */
  setVolume(volume) {
    // Validate and clamp volume
    this.volume = Math.max(0, Math.min(1, Number(volume) || 0))

    // Apply to master volume node if initialized
    if (this.masterVolume) {
      // Convert 0-1 to dB range (-60dB to 0dB)
      // At volume=0 → -Infinity (silent)
      // At volume=0.5 → -30dB
      // At volume=1 → 0dB
      const db = this.volume === 0 ? -Infinity : (this.volume - 1) * 60
      this.masterVolume.volume.rampTo(db, 0.1) // Smooth 100ms ramp
      console.log(`🔊 Master volume set to ${(this.volume * 100).toFixed(0)}% (${db === -Infinity ? '-∞' : db.toFixed(1)}dB)`)
    }
  }

  /**
   * Get current mute state
   * @returns {boolean} True if muted
   */
  isMuted() {
    return this.muted
  }

  /**
   * Get current volume level
   * @returns {number} Volume (0-1)
   */
  getVolume() {
    return this.volume
  }

  /**
   * Process gesture and generate real-time audio parameters
   * @param {Object} gestureData - Normalized gesture data
   * @returns {Object} Audio parameters for immediate feedback
   */
  processGestureAudio(gestureData) {
    if (!this.isInitialized) {
      console.warn('AudioService not initialized')
      return null
    }

    const startTime = performance.now()

    try {
      // Add gesture to buffer for interpolation
      this.addGestureToBuffer(gestureData)

      // Generate audio parameters from gesture
      const audioParams = this.mapGestureToAudio(gestureData)

      // Update current parameter state
      this.updateCurrentParameters(audioParams)

      // Calculate processing latency
      const processingLatency = performance.now() - startTime

      // Track performance metrics
      this.updatePerformanceMetrics(processingLatency)

      // Constitutional requirement check
      if (processingLatency > 200) {
        console.warn(`Gesture-to-audio latency ${processingLatency}ms exceeds 200ms constitutional requirement`)
      }

      return {
        ...audioParams,
        processingLatency,
        timestamp: Date.now()
      }

    } catch (error) {
      console.error('Error processing gesture audio:', error)
      return null
    }
  }

  /**
   * Map gesture data to audio parameters
   * @param {Object} gestureData - Gesture data
   * @returns {Object} Audio parameters
   */
  mapGestureToAudio(gestureData) {
    const { type, coordinates, intensity } = gestureData

    // Base parameter calculation
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

    // Exponential curve for more natural volume response
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

    // Device-based waveform selection
    switch (type) {
      case 'mouse':
        // Mouse gestures: smooth waveforms for precise control
        return coordinates.y > 0.6 ? 'sine' : 'triangle'

      case 'touch':
        // Touch gestures: more organic waveforms
        if (intensity > 0.8) return 'square'
        if (intensity > 0.5) return 'sawtooth'
        return 'triangle'

      case 'gyroscope':
        // Gyroscope: textural waveforms
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

    // Y coordinate determines filter type and cutoff
    if (y < 0.3) {
      filterType = 'lowpass'
      cutoffFrequency = this.mapCoordinateToParameter('filter', x)
      resonance = 1 + (0.3 - y) * 20 // Higher resonance for lower Y
    } else if (y > 0.7) {
      filterType = 'highpass'
      cutoffFrequency = this.mapCoordinateToParameter('filter', x) * 0.5
      resonance = 1 + (y - 0.7) * 10 // Higher resonance for higher Y
    } else if (x > 0.4 && x < 0.6) {
      filterType = 'bandpass'
      cutoffFrequency = this.mapCoordinateToParameter('filter', y)
      resonance = 2 + Math.abs(x - 0.5) * 10
    }

    // Z coordinate (gyroscope) modulates filter sweep
    if (z !== undefined) {
      cutoffFrequency *= (0.5 + z * 0.5) // 0.5x to 1.0x modulation
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

    // Adjust envelope based on gesture type
    switch (type) {
      case 'touch':
        // Touch: quick attack, variable sustain
        envelope.attack = 0.01 + intensity * 0.1
        envelope.sustain = Math.max(0.3, intensity)
        envelope.release = 0.2 + (1 - intensity) * 0.5
        break

      case 'mouse':
        // Mouse: smooth envelopes
        envelope.attack = 0.05 + coordinates.y * 0.2
        envelope.decay = 0.1 + coordinates.x * 0.3
        envelope.sustain = 0.5 + intensity * 0.4
        envelope.release = 0.3 + (1 - coordinates.y) * 0.4
        break

      case 'gyroscope':
        // Gyroscope: atmospheric envelopes
        envelope.attack = 0.2 + coordinates.z * 0.3
        envelope.decay = 0.3 + coordinates.x * 0.2
        envelope.sustain = 0.7 + coordinates.y * 0.2
        envelope.release = 0.5 + coordinates.z * 0.5
        break
    }

    // Clamp values to reasonable ranges
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
      distance: y, // Y coordinate as distance (0 = near, 1 = far)
      reverbAmount: Math.max(0, Math.min(1, y * 0.8)), // More reverb for distant sounds
      elevation: z !== undefined ? (z * 2) - 1 : 0 // Z as elevation (-1 to +1)
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
        // Touch devices: boost dynamics for finger interaction
        adjusted.amplitude *= 1.2
        adjusted.filter.resonance *= 1.1
        break

      case 'gyroscope':
        // Gyroscope: smoother transitions for motion control
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
   * Add gesture to buffer for interpolation
   * @param {Object} gestureData - Gesture data
   */
  addGestureToBuffer(gestureData) {
    this.gestureBuffer.push({
      ...gestureData,
      bufferTimestamp: performance.now()
    })

    // Limit buffer size
    if (this.gestureBuffer.length > this.maxBufferSize) {
      this.gestureBuffer.shift()
    }
  }

  /**
   * Update current parameter state
   * @param {Object} newParams - New parameter values
   */
  updateCurrentParameters(newParams) {
    // Deep merge parameters
    this.currentParameters = {
      ...this.currentParameters,
      ...newParams,
      filter: {
        ...this.currentParameters.filter,
        ...newParams.filter
      },
      envelope: {
        ...this.currentParameters.envelope,
        ...newParams.envelope
      },
      spatialParams: {
        ...this.currentParameters.spatialParams,
        ...newParams.spatialParams
      }
    }
  }

  /**
   * Start 60fps parameter update loop
   */
  startUpdateLoop() {
    if (this.updateLoopActive) return

    this.updateLoopActive = true
    let lastFrameTime = 0
    let frameCount = 0

    const updateLoop = (currentTime) => {
      if (!this.updateLoopActive) return

      // Calculate frame timing
      const deltaTime = currentTime - lastFrameTime

      if (deltaTime >= this.updateTimeSlice) {
        // Update audio parameters at 60fps
        this.performParameterUpdate()

        frameCount++
        lastFrameTime = currentTime

        // Calculate updates per second every second
        if (frameCount % 60 === 0) {
          this.performanceMetrics.parameterUpdatesPerSecond = 60
        }
      }

      // Schedule next frame
      requestAnimationFrame(updateLoop)
    }

    requestAnimationFrame(updateLoop)

    console.log('AudioService parameter update loop started at 60fps')
  }

  /**
   * Stop parameter update loop
   */
  stopUpdateLoop() {
    this.updateLoopActive = false
    console.log('AudioService parameter update loop stopped')
  }

  /**
   * Perform parameter update for current frame
   */
  performParameterUpdate() {
    if (!this.audioEngine || this.gestureBuffer.length === 0) return

    try {
      // Interpolate parameters from gesture buffer
      const interpolatedParams = this.interpolateParametersFromBuffer()

      // Send parameters to audio engine
      if (this.audioEngine.updateSonicParameters) {
        this.audioEngine.updateSonicParameters(interpolatedParams)
      }

      this.performanceMetrics.totalUpdates++

    } catch (error) {
      console.error('Parameter update failed:', error)
      this.performanceMetrics.droppedUpdates++
    }
  }

  /**
   * Interpolate parameters from gesture buffer
   * @returns {Object} Interpolated parameters
   */
  interpolateParametersFromBuffer() {
    if (this.gestureBuffer.length === 0) {
      return this.currentParameters
    }

    // Use most recent gesture for now (could implement smoother interpolation)
    const recentGesture = this.gestureBuffer[this.gestureBuffer.length - 1]
    return this.mapGestureToAudio(recentGesture)
  }

  /**
   * Update performance metrics
   * @param {number} latency - Processing latency
   */
  updatePerformanceMetrics(latency) {
    this.performanceMetrics.gestureToSoundLatency.push(latency)

    // Keep only recent measurements
    if (this.performanceMetrics.gestureToSoundLatency.length > 100) {
      this.performanceMetrics.gestureToSoundLatency.shift()
    }

    // Calculate average latency
    this.performanceMetrics.averageLatency =
      this.performanceMetrics.gestureToSoundLatency.reduce((a, b) => a + b, 0) /
      this.performanceMetrics.gestureToSoundLatency.length

    // Track maximum latency
    this.performanceMetrics.maxLatency = Math.max(
      this.performanceMetrics.maxLatency,
      latency
    )
  }

  /**
   * Get current parameter state
   * @returns {Object} Current parameters
   */
  getCurrentParameters() {
    return { ...this.currentParameters }
  }

  /**
   * Update parameter mapping configuration
   * @param {string} parameter - Parameter name
   * @param {Object} mapping - Mapping configuration
   */
  updateParameterMapping(parameter, mapping) {
    if (this.parameterMappings[parameter]) {
      this.parameterMappings[parameter] = {
        ...this.parameterMappings[parameter],
        ...mapping
      }
      console.log(`Updated ${parameter} mapping:`, this.parameterMappings[parameter])
    }
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance metrics
   */
  getPerformanceStats() {
    return {
      ...this.performanceMetrics,
      updateLoopActive: this.updateLoopActive,
      bufferSize: this.gestureBuffer.length,
      audioContextState: this.audioContextState
    }
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceStats() {
    this.performanceMetrics = {
      gestureToSoundLatency: [],
      averageLatency: 0,
      maxLatency: 0,
      parameterUpdatesPerSecond: 0,
      droppedUpdates: 0,
      totalUpdates: 0
    }
    console.log('AudioService performance metrics reset')
  }

  /**
   * Update filter parameters for all active voices
   * @param {Object} filterParams - Filter modulation parameters
   * @param {number} filterParams.cutoffFrequency - Filter cutoff (20-20000 Hz)
   * @param {number} filterParams.resonance - Filter resonance (0-30)
   * @param {number} filterParams.intensity - Modulation intensity (0-1)
   */
  updateFilterParams(filterParams) {
    if (!filterParams) {
      console.log('updateFilterParams: no filter params')
      return
    }

    try {
      console.log('🎛️ Applying filter modulation:', filterParams)

      // Apply to ambient synth filter (for hover modulation)
      if (this.ambientFilter) {
        // Use values directly from backend (they're already in the correct range)
        const cutoffFrequency = Math.max(100, Math.min(8000, filterParams.cutoffFrequency)) // Clamp to audible range
        this.ambientFilter.frequency.setValueAtTime(cutoffFrequency, Tone.context.currentTime)

        let resonanceValue = 2 // Default resonance
        if (this.ambientFilter.Q && filterParams.resonance) {
          // Backend sends resonance 0.1-5.0, convert to Q range 1-10
          resonanceValue = Math.max(1, Math.min(10, 1 + filterParams.resonance * 2))
          this.ambientFilter.Q.setValueAtTime(resonanceValue, Tone.context.currentTime)
        }
        console.log('✨ Applied filter to ambient synth:', { cutoff: cutoffFrequency, resonance: resonanceValue })
      }

      // Apply to ambient pads (if they exist)
      if (this.audioEngine && this.audioEngine.voices && this.audioEngine.voices.ambient) {
        Object.values(this.audioEngine.voices.ambient).forEach(voice => {
          if (voice.filter && voice.filter.frequency) {
            // Map cutoff frequency to appropriate range (200-8000 Hz)
            const cutoffRange = filterParams.cutoffFrequency * 80 + 200 // 0-1 to 200-8000Hz
            voice.filter.frequency.setValueAtTime(cutoffRange, Tone.context.currentTime)

            // Apply resonance if available
            if (voice.filter.Q && filterParams.resonance) {
              const resonanceRange = filterParams.resonance * 15 // 0-1 to 0-15
              voice.filter.Q.setValueAtTime(resonanceRange, Tone.context.currentTime)
            }
          }
        })
        console.log('✨ Applied filter to ambient voices')
      }

      // Apply to gesture voices
      if (this.audioEngine && this.audioEngine.voices && this.audioEngine.voices.gesture) {
        Object.values(this.audioEngine.voices.gesture).forEach(voice => {
          if (voice.filter && voice.filter.frequency) {
            const cutoffRange = filterParams.cutoffFrequency * 80 + 200
            voice.filter.frequency.setValueAtTime(cutoffRange, Tone.context.currentTime)

            if (voice.filter.Q && filterParams.resonance) {
              const resonanceRange = filterParams.resonance * 15
              voice.filter.Q.setValueAtTime(resonanceRange, Tone.context.currentTime)
            }
          }
        })
        console.log('✨ Applied filter to gesture voices')
      }

      // Apply to main gesture synth filter
      if (this.gestureFilter) {
        const cutoffRange = filterParams.cutoffFrequency * 80 + 200 // 0-1 to 200-8000Hz
        this.gestureFilter.frequency.setValueAtTime(cutoffRange, Tone.context.currentTime)

        let resonanceRange = 0
        if (this.gestureFilter.Q && filterParams.resonance) {
          resonanceRange = filterParams.resonance * 15 // 0-1 to 0-15
          this.gestureFilter.Q.setValueAtTime(resonanceRange, Tone.context.currentTime)
        }
        console.log('✨ Applied filter to gesture synth:', { cutoff: cutoffRange, resonance: resonanceRange })
      }

      // Also apply to collaborative pattern voices if they exist
      if (this.audioEngine && this.audioEngine.collaborativePatterns) {
        this.audioEngine.collaborativePatterns.forEach(pattern => {
          if (pattern.oscillator && pattern.filter) {
            const cutoffRange = filterParams.cutoffFrequency * 80 + 200
            pattern.filter.frequency.setValueAtTime(cutoffRange, Tone.context.currentTime)

            if (pattern.filter.Q && filterParams.resonance) {
              const resonanceRange = filterParams.resonance * 15
              pattern.filter.Q.setValueAtTime(resonanceRange, Tone.context.currentTime)
            }
          }
        })
        console.log('✨ Applied filter to collaborative patterns')
      }

    } catch (error) {
      console.error('❌ Filter modulation failed:', error)
    }
  }

  /**
   * Check if two pattern arrays are equal (for duplicate prevention)
   * @param {Array} patterns1 - First pattern array
   * @param {Array} patterns2 - Second pattern array
   * @returns {boolean} True if patterns are effectively the same
   */
  arePatternsEqual(patterns1, patterns2) {
    if (!patterns1 || !patterns2) return false
    if (patterns1.length !== patterns2.length) return false

    return patterns1.every((pattern1, index) => {
      const pattern2 = patterns2[index]
      // Add more detailed logging to debug pattern values
      console.log('🔍 Comparing patterns:', {
        pattern1: { x: pattern1.x, y: pattern1.y, intensity: pattern1.intensity, frequency: pattern1.frequency },
        pattern2: { x: pattern2.x, y: pattern2.y, intensity: pattern2.intensity, frequency: pattern2.frequency }
      })
      return pattern1.x === pattern2.x &&
             pattern1.y === pattern2.y &&
             pattern1.intensity === pattern2.intensity &&
             pattern1.frequency === pattern2.frequency
    })
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopUpdateLoop()
    this.gestureBuffer = []
    this.audioEngine = null
    this.gestureCapture = null
    this.isInitialized = false

    console.log('AudioService cleanup completed')
  }
}

// Export singleton instance
// Make AudioService available globally
window.AudioService = AudioService