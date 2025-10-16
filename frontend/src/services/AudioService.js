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

    // Filter modulation throttling to prevent stuttering
    this.lastFilterUpdateTime = 0
    this.filterUpdateInterval = 50 // 50ms = 20 updates per second maximum
    this.lastFilterLogTime = 0

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
   * EVOLUTIVE: Now creates dynamic, evolving background composition with polyphony management
   */
  createContinuousGenerativeSystem() {
    // Create master volume node for centralized control (FR-011)
    this.masterVolume = new Tone.Volume(-10).toDestination()

    // Initialize generative composition state
    this.generativeState = {
      currentScale: [0, 2, 4, 7, 9], // Pentatonic major
      currentTonic: 220, // A3
      harmonicProgression: 0,
      evolutionCycle: 0,
      userInfluence: 0,
      lastUserActivity: Date.now(),
      ambientVoices: [],
      evolutionSpeed: 8000, // Base evolution cycle
      complexity: 0.3, // Starting complexity
      activeVoices: new Map() // Track active voices for polyphony management
    }

    // Create multi-layer ambient synth system with LIMITED polyphony
    this.ambientLayers = {
      bass: new Tone.PolySynth({
        oscillator: { type: 'sine' }, // Deep bass foundation
        envelope: { attack: 2, decay: 1, sustain: 0.8, release: 3 },
        maxPolyphony: 2 // REDUCED: was 3
      }),

      harmony: new Tone.PolySynth({
        oscillator: { type: 'triangle' }, // Warm harmonic layer
        envelope: { attack: 1.5, decay: 0.8, sustain: 0.6, release: 2.5 },
        maxPolyphony: 3 // REDUCED: was 4
      }),

      texture: new Tone.PolySynth({
        oscillator: { type: 'sawtooth' }, // Rich textural layer
        envelope: { attack: 0.5, decay: 0.3, sustain: 0.4, release: 2 },
        maxPolyphony: 3 // REDUCED: was 5
      })
    }

    // Create individual filters and volumes for each layer
    this.ambientFilters = {
      bass: new Tone.Filter({ type: 'lowpass', frequency: 200, Q: 2 }),
      harmony: new Tone.Filter({ type: 'lowpass', frequency: 800, Q: 3 }),
      texture: new Tone.Filter({ type: 'lowpass', frequency: 1500, Q: 5 })
    }

    this.ambientVolumes = {
      bass: new Tone.Volume(-8), // Subtle bass
      harmony: new Tone.Volume(-12), // Gentle harmony
      texture: new Tone.Volume(-15) // Subtle texture
    }

    // Connect each layer: synth -> filter -> volume -> master
    Object.keys(this.ambientLayers).forEach(layer => {
      this.ambientLayers[layer].connect(this.ambientFilters[layer])
      this.ambientFilters[layer].connect(this.ambientVolumes[layer])
      this.ambientVolumes[layer].connect(this.masterVolume)
    })

    // Create gesture-responsive synth with LIMITED polyphony
    this.gestureSynth = new Tone.PolySynth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.6, release: 0.5 },
      maxPolyphony: 4 // LIMITED polyphony
    })

    // Add filter to gesture synth for hover modulation - FIX: restore filter modulation
    this.gestureFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: 2000,
      Q: 1
    }).toDestination()

    this.gestureSynth.connect(this.gestureFilter)
    this.gestureFilter.connect(this.masterVolume)

    // Polyphony management
    this.maxTotalVoices = 8 // Maximum total voices across all synths

    // Start evolving generative system
    this.startEvolvingGeneration()

    console.log('🎵 Evolutive generative system created with limited polyphony management')
  }

  /**
   * Start evolving generative music system per FR-001
   * EVOLUTIVE: Creates dynamic, context-aware background composition
   */
  startEvolvingGeneration() {
    if (this.evolvingGenerationActive) return

    this.evolvingGenerationActive = true

    const evolveComposition = () => {
      if (!this.evolvingGenerationActive || !this.isInitialized) {
        console.log('🎵 Evolving generation stopped or not initialized')
        return
      }

      try {
        // Update generative state based on user activity and time
        this.updateGenerativeState()

        // Generate new musical material for each layer
        this.generateEvolvingLayer('bass')
        this.generateEvolvingLayer('harmony')
        this.generateEvolvingLayer('texture')

        // Log evolution details
        console.log(`🎵 Evolution cycle ${this.generativeState.evolutionCycle}: complexity=${this.generativeState.complexity.toFixed(2)}, userInfluence=${this.generativeState.userInfluence.toFixed(2)}`)

      } catch (error) {
        console.error('🎵 Error in evolution cycle:', error)
      }

      // Schedule next evolution based on current speed
      const evolutionDelay = this.generativeState.evolutionSpeed * (0.7 + Math.random() * 0.6)
      setTimeout(evolveComposition, evolutionDelay)
    }

    // Start evolution after initial delay
    setTimeout(() => {
      console.log('🎵 Starting evolving composition system')
      evolveComposition()
    }, 3000)

    // FIX: Force start background with immediate notes
    setTimeout(() => {
      this.forceStartBackground()
    }, 5000)

    // FIX: Test filter modulation to ensure it works
    setTimeout(() => {
      this.testFilterModulation()
    }, 7000)

    console.log('🎵 Evolving composition system initialized with forced start and filter test')
  }

  /**
   * Update generative state based on user activity and musical context
   */
  updateGenerativeState() {
    const state = this.generativeState
    state.evolutionCycle++

    // Time-based evolution (organic change over time)
    const timeFactor = Math.sin(state.evolutionCycle * 0.05) * 0.5 + 0.5
    state.complexity = 0.2 + timeFactor * 0.4 + state.userInfluence * 0.4

    // User activity influence (recent gestures increase complexity)
    const timeSinceActivity = Date.now() - state.lastUserActivity
    const activityDecay = Math.max(0, 1 - timeSinceActivity / 30000) // 30 second decay
    state.userInfluence *= 0.95 // Gradual decay
    state.userInfluence = Math.max(0.1, state.userInfluence)

    // Harmonic progression advancement
    if (Math.random() < 0.3 + state.complexity * 0.2) {
      state.harmonicProgression = (state.harmonicProgression + 1) % state.currentScale.length
    }

    // Occasional key changes (based on evolution cycles)
    if (state.evolutionCycle % 20 === 0) {
      this.mutateHarmonicContext()
    }

    // Adjust evolution speed based on complexity
    state.evolutionSpeed = 4000 + (1 - state.complexity) * 6000 + Math.random() * 2000
  }

  /**
   * Mutate harmonic context for variety
   */
  mutateHarmonicContext() {
    const state = this.generativeState
    const mutationTypes = ['tonic_shift', 'scale_change', 'mode_change']
    const mutation = mutationTypes[Math.floor(Math.random() * mutationTypes.length)]

    switch (mutation) {
      case 'tonic_shift':
        // Shift tonic by a musical interval
        const intervals = [3, 4, 5, 7, 9] // Minor third, major third, perfect fourth, fifth, major sixth
        const interval = intervals[Math.floor(Math.random() * intervals.length)]
        state.currentTonic = 110 + (state.currentTonic + interval * 20) % 440 // Keep in reasonable range
        break

      case 'scale_change':
        // Change scale type
        const scales = {
          pentatonic_major: [0, 2, 4, 7, 9],
          pentatonic_minor: [0, 3, 5, 7, 10],
          natural_minor: [0, 2, 3, 5, 7, 8, 10],
          dorian: [0, 2, 3, 5, 7, 9, 10],
          mixolydian: [0, 2, 4, 5, 7, 9, 10]
        }
        const scaleNames = Object.keys(scales)
        const newScaleName = scaleNames[Math.floor(Math.random() * scaleNames.length)]
        state.currentScale = scales[newScaleName]
        break

      case 'mode_change':
        // Invert or modify current scale
        if (Math.random() > 0.5) {
          // Add chromatic tones
          state.currentScale = [...state.currentScale, 1, 6, 8, 11].slice(0, 7)
        }
        break
    }

    console.log(`🎵 Harmonic mutation: ${mutation}, new tonic: ${state.currentTonic}Hz`)
  }

  /**
   * Generate evolving musical material for a specific layer
   * @param {string} layer - Layer name ('bass', 'harmony', 'texture')
   */
  generateEvolvingLayer(layer) {
    const state = this.generativeState
    const synth = this.ambientLayers[layer]
    const filter = this.ambientFilters[layer]

    if (!synth || this.muted) return

    // Release existing notes in this layer to avoid overlap
    synth.releaseAll()

    // Determine layer-specific parameters
    let notes, octaveRange, durationRange, velocity

    switch (layer) {
      case 'bass':
        notes = this.selectNotesForLayer(state, 0, 2) // Root and third
        octaveRange = [0, 1] // Low octaves
        durationRange = [4, 8] // Long durations
        velocity = 0.3 + state.complexity * 0.2
        break

      case 'harmony':
        notes = this.selectNotesForLayer(state, 2, 4) // Middle scale degrees
        octaveRange = [1, 2] // Middle octaves
        durationRange = [2, 4] // Medium durations
        velocity = 0.2 + state.complexity * 0.3
        break

      case 'texture':
        notes = this.selectNotesForLayer(state, 1, 6) // Wider range
        octaveRange = [2, 3] // Higher octaves
        durationRange = [0.5, 2] // Shorter durations
        velocity = 0.1 + state.complexity * 0.2
        break
    }

    // Generate frequencies from selected notes
    const frequencies = notes.map(note => {
      const octave = octaveRange[0] + Math.floor(Math.random() * (octaveRange[1] - octaveRange[0] + 1))
      return state.currentTonic * Math.pow(2, (note + octave * 12) / 12)
    })

    // Apply dynamic filter modulation based on complexity
    const baseFrequency = {
      bass: 200,
      harmony: 800,
      texture: 1500
    }[layer]

    const filterModulation = 1 + state.complexity * Math.sin(Date.now() * 0.001) * 0.3
    filter.frequency.setValueAtTime(baseFrequency * filterModulation, Tone.context.currentTime)

    // Trigger notes with staggered timing for organic feel
    frequencies.forEach((freq, index) => {
      const delay = index * 0.1 + Math.random() * 0.2
      const duration = durationRange[0] + Math.random() * (durationRange[1] - durationRange[0])

      synth.triggerAttack(freq, `+${delay}`, velocity)

      // Schedule release for sustained notes
      if (layer !== 'texture' || Math.random() > 0.5) {
        synth.triggerRelease(freq, `+${delay + duration}`)
      }
    })

    console.log(`🎵 Generated ${layer} layer: ${frequencies.length} notes, complexity=${state.complexity.toFixed(2)}`)
  }

  /**
   * Select appropriate notes for a layer based on current harmonic context
   * @param {Object} state - Current generative state
   * @param {number} startIndex - Start index in scale
   * @param {number} range - Number of scale degrees to choose from
   * @returns {Array<number>} Selected scale degrees
   */
  selectNotesForLayer(state, startIndex, range) {
    const scale = state.currentScale
    const progression = state.harmonicProgression

    // Create chord-like structures based on harmonic progression
    const chordDegrees = []
    for (let i = 0; i < 3; i++) {
      const degree = (progression * 2 + i * 2 + startIndex) % scale.length
      chordDegrees.push(scale[degree])
    }

    // Add passing tones based on complexity
    if (state.complexity > 0.5 && Math.random() < state.complexity) {
      const passingTone = scale[(progression + Math.floor(Math.random() * scale.length)) % scale.length]
      chordDegrees.push(passingTone)
    }

    return chordDegrees
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

      // Stop evolving generation
      this.evolvingGenerationActive = false

      // Stop all sustained notes before disposing
      if (this.ambientLayers) {
        Object.keys(this.ambientLayers).forEach(layer => {
          if (this.ambientLayers[layer]) {
            this.ambientLayers[layer].releaseAll()
            this.ambientLayers[layer].dispose()
          }
        })
        this.ambientLayers = null
      }

      if (this.ambientFilters) {
        Object.keys(this.ambientFilters).forEach(layer => {
          if (this.ambientFilters[layer]) {
            this.ambientFilters[layer].dispose()
          }
        })
        this.ambientFilters = null
      }

      if (this.ambientVolumes) {
        Object.keys(this.ambientVolumes).forEach(layer => {
          if (this.ambientVolumes[layer]) {
            this.ambientVolumes[layer].dispose()
          }
        })
        this.ambientVolumes = null
      }

      if (this.gestureSynth) {
        this.gestureSynth.dispose()
        this.gestureSynth = null
      }

      if (this.gestureFilter) {
        this.gestureFilter.dispose()
        this.gestureFilter = null
      }

      this.isInitialized = false
      console.log('🔇 Evolutive AudioService stopped')
    }
  }

  /**
   * Update sonic parameters from gesture data per FR-002
   * System MUST translate user gestures into real-time sonic parameter modifications
   * FIX: Restored background filter modulation and added polyphony management
   * @param {Object} sonicParams - Parameters from gesture processing
   */
  updateSonicParams(sonicParams) {
    if (!this.isInitialized || !this.gestureSynth) return

    try {
      // Real-time gesture-to-sonic parameter mapping per FR-002
      const frequency = this.mapGestureToFrequency(sonicParams)
      const volume = this.mapGestureToVolume(sonicParams)
      const filterFreq = this.mapGestureToFilter(sonicParams)

      // FIX: Apply real-time parameters to gesture filter for hover modulation
      if (this.gestureFilter) {
        // FIX: Validate filter frequency to prevent null errors
        const validFreq = filterFreq && !isNaN(filterFreq) ? filterFreq : 1000
        const clampedFreq = Math.max(100, Math.min(8000, validFreq))

        this.gestureFilter.frequency.linearRampToValueAtTime(clampedFreq, Tone.context.currentTime + 0.05)

        const filterQ = 1 + (sonicParams.z || 0.5) * 3
        const clampedQ = Math.max(0.1, Math.min(10, filterQ))
        this.gestureFilter.Q.linearRampToValueAtTime(clampedQ, Tone.context.currentTime + 0.05)

        console.log(`🎛️ Applied gesture filter: ${clampedFreq.toFixed(1)}Hz, Q=${clampedQ.toFixed(2)}`)
      }

      // Apply filter frequency to gesture synth
      this.gestureSynth.set({
        filter: { frequency: filterFreq }
      })

      // Trigger gesture-responsive note (volume controlled by masterVolume)
      // Use volume from gesture as velocity parameter (0.3-0.7 range)
      this.gestureSynth.triggerAttackRelease(frequency, '8n', undefined, 0.3 + (volume * 0.4))

      // FIX: Update background filters with gesture modulation
      this.updateBackgroundFilters(sonicParams)

      // Log for performance monitoring per FR-006 (<200ms latency)
      const timestamp = performance.now()
      console.log(`🎵 Gesture processed: ${frequency.toFixed(1)}Hz at ${timestamp.toFixed(1)}ms`)

    } catch (error) {
      console.warn('Audio playback error:', error)
    }
  }

  /**
   * Update filter parameters directly (for remote filter modulation)
   * FIX: Added this missing method for hover and remote filter modulation
   * @param {Object} filterParams - Filter parameters
   */
  updateFilterParams(filterParams) {
    if (!this.isInitialized) {
      console.log('🔇 updateFilterParams blocked - audio not initialized')
      return
    }

    // THROTTLING: Prevent stuttering by limiting filter update frequency
    const now = Date.now()
    if (now - this.lastFilterUpdateTime < this.filterUpdateInterval) {
      // Skip this update to prevent audio stuttering
      return
    }
    this.lastFilterUpdateTime = now

    try {
      // Reduce console log frequency to prevent spam
      if (now - (this.lastFilterUpdateTime || 0) > 500) {
        console.log('🎛️ Applying filter params:', filterParams)
      }

      // Ensure Tone.js context is started
      if (Tone.context.state !== 'running') {
        console.log('🎛️ Starting Tone.js context for filter modulation')
        Tone.start()
        // Give it a moment to start
        setTimeout(() => this.applyFilterModulation(filterParams), 100)
        return
      }

      this.applyFilterModulation(filterParams)

    } catch (error) {
      console.warn('🔇 Error updating filter params:', error)
    }
  }

  /**
   * Helper method to safely apply filter modulation
   * @param {Object} filterParams - Filter parameters
   */
  applyFilterModulation(filterParams) {
    try {
      // Validate Tone context is ready
      if (!Tone.context || !Tone.context.currentTime) {
        console.warn('🔇 Tone context not ready for filter modulation')
        return
      }

      // Apply to gesture filter with enhanced validation
      if (this.gestureFilter && this.gestureFilter.frequency && filterParams.frequency) {
        const freq = Math.min(8000, Math.max(100, filterParams.frequency))

        // Validate filter frequency object exists and has the method
        if (typeof this.gestureFilter.frequency.linearRampToValueAtTime === 'function') {
          this.gestureFilter.frequency.linearRampToValueAtTime(freq, Tone.context.currentTime + 0.05)
          console.log(`🎛️ Gesture filter frequency set to ${freq.toFixed(1)}Hz`)
        }

        if (filterParams.resonance && this.gestureFilter.Q && typeof this.gestureFilter.Q.linearRampToValueAtTime === 'function') {
          const q = Math.min(10, Math.max(0.1, filterParams.resonance))
          this.gestureFilter.Q.linearRampToValueAtTime(q, Tone.context.currentTime + 0.05)
          console.log(`🎛️ Gesture filter resonance set to ${q.toFixed(2)}`)
        }
      } else {
        console.warn('🔇 Gesture filter or frequency parameter not available')
      }

      // FIX: Apply to background filters as well with validation
      if (filterParams && filterParams.frequency && this.ambientFilters && Tone.context) {
        const freq = filterParams.frequency

        // Validate Tone context is ready
        if (Tone.context && Tone.context.currentTime) {
          // Apply to all ambient layers with different intensities
          if (this.ambientFilters.texture) {
            this.ambientFilters.texture.frequency.linearRampToValueAtTime(
              Math.min(4000, Math.max(200, freq * 1.5)),
              Tone.context.currentTime + 0.1
            )
          }

          if (this.ambientFilters.harmony) {
            this.ambientFilters.harmony.frequency.linearRampToValueAtTime(
              Math.min(2000, Math.max(150, freq * 0.8)),
              Tone.context.currentTime + 0.15
            )
          }

          if (this.ambientFilters.bass) {
            this.ambientFilters.bass.frequency.linearRampToValueAtTime(
              Math.min(500, Math.max(50, freq * 0.3)),
              Tone.context.currentTime + 0.2
            )
          }

          console.log(`🎛️ Applied filter modulation: ${freq.toFixed(1)}Hz to all layers`)
        } else {
          console.warn('🔇 Tone context not ready for filter modulation')
        }
      }

    } catch (error) {
      console.warn('🔇 Error updating filter params:', error)
    }
  }

  /**
   * Update background filters with gesture-based modulation
   * FIX: Restored this missing functionality
   * @param {Object} sonicParams - Sonic parameters from gesture
   */
  updateBackgroundFilters(sonicParams) {
    if (!this.ambientFilters) return

    // Calculate filter modulation based on gesture coordinates
    const filterFreq = this.calculateFilterFrequency(sonicParams)
    const filterQ = this.calculateFilterResonance(sonicParams)

    // Apply modulation to ambient filters with much stronger intensities
    if (this.ambientFilters.texture) {
      // Strongest modulation on texture layer
      const textureFreq = filterFreq * 2.5 // Increased multiplier
      this.ambientFilters.texture.frequency.linearRampToValueAtTime(
        Math.min(8000, Math.max(100, textureFreq)), // Much wider range
        Tone.context.currentTime + 0.05 // Faster transition
      )
      this.ambientFilters.texture.Q.setValueAtTime(filterQ * 2, Tone.context.currentTime) // Stronger Q
      console.log(`🎛️ Texture filter: ${Math.min(8000, Math.max(100, textureFreq)).toFixed(1)}Hz, Q=${(filterQ * 2).toFixed(2)}`)
    }

    if (this.ambientFilters.harmony) {
      // Moderate modulation on harmony layer
      const harmonyFreq = filterFreq * 1.8 // Increased multiplier
      this.ambientFilters.harmony.frequency.linearRampToValueAtTime(
        Math.min(4000, Math.max(100, harmonyFreq)), // Wider range
        Tone.context.currentTime + 0.08 // Faster transition
      )
      this.ambientFilters.harmony.Q.setValueAtTime(filterQ * 1.5, Tone.context.currentTime) // Stronger Q
      console.log(`🎛️ Harmony filter: ${Math.min(4000, Math.max(100, harmonyFreq)).toFixed(1)}Hz, Q=${(filterQ * 1.5).toFixed(2)}`)
    }

    if (this.ambientFilters.bass) {
      // Less subtle modulation on bass layer
      const bassFreq = filterFreq * 0.6 // Increased multiplier
      this.ambientFilters.bass.frequency.linearRampToValueAtTime(
        Math.min(1000, Math.max(30, bassFreq)), // Wider range for bass
        Tone.context.currentTime + 0.1 // Faster transition
      )
      this.ambientFilters.bass.Q.setValueAtTime(filterQ * 1.2, Tone.context.currentTime) // Stronger Q
      console.log(`🎛️ Bass filter: ${Math.min(1000, Math.max(30, bassFreq)).toFixed(1)}Hz, Q=${(filterQ * 1.2).toFixed(2)}`)
    }
  }

  /**
   * Calculate filter frequency from gesture parameters
   * @param {Object} sonicParams - Sonic parameters
   * @returns {number} Filter frequency
   */
  calculateFilterFrequency(sonicParams) {
    const y = sonicParams.y || 0.5
    return 200 + ((1 - y) * 3800) // 200Hz to 4000Hz, inverted Y axis
  }

  /**
   * Calculate filter resonance from gesture parameters
   * @param {Object} sonicParams - Sonic parameters
   * @returns {number} Filter resonance (Q)
   */
  calculateFilterResonance(sonicParams) {
    const x = sonicParams.x || 0.5
    return 0.5 + (x * 4.5) // 0.5 to 5.0 Q range
  }

  /**
   * Check and manage polyphony to prevent audio overload
   */
  managePolyphony() {
    if (!this.generativeState) return

    const totalActiveVoices = this.generativeState.activeVoices.size

    // If we're exceeding polyphony limits, clean up old voices
    if (totalActiveVoices > this.maxTotalVoices) {
      const voicesToCleanup = totalActiveVoices - this.maxTotalVoices
      const now = Date.now()

      // Find oldest voices and release them
      const voicesByAge = Array.from(this.generativeState.activeVoices.entries())
        .sort((a, b) => a[1].startTime - b[1].startTime)

      for (let i = 0; i < voicesToCleanup && i < voicesByAge.length; i++) {
        const [voiceId, voiceData] = voicesByAge[i]

        // Release the voice if it's been playing for more than 1 second
        if (now - voiceData.startTime > 1000) {
          if (voiceData.synth && voiceData.synth.releaseAll) {
            voiceData.synth.releaseAll()
          }
          this.generativeState.activeVoices.delete(voiceId)
          console.log(`🔇 Cleaned up voice ${voiceId} for polyphony management`)
        }
      }
    }
  }

  /**
   * Track a new voice for polyphony management
   * @param {string} voiceId - Unique voice identifier
   * @param {Object} synth - Synth instance
   * @param {number} duration - Note duration
   */
  trackVoice(voiceId, synth, duration) {
    if (!this.generativeState) return

    this.generativeState.activeVoices.set(voiceId, {
      synth,
      startTime: Date.now(),
      duration
    })

    // Schedule voice cleanup
    setTimeout(() => {
      if (this.generativeState.activeVoices.has(voiceId)) {
        this.generativeState.activeVoices.delete(voiceId)
      }
    }, duration * 1000 + 500) // Add 500ms buffer

    // Check polyphony limits
    this.managePolyphony()
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
   * FIX: Added validation to prevent null returns
   */
  mapGestureToFilter(sonicParams) {
    // Movement speed or Z coordinate maps to filter cutoff
    const movement = sonicParams?.z ?? sonicParams?.movement ?? sonicParams?.y ?? 0.5
    const validMovement = typeof movement === 'number' && !isNaN(movement) ? movement : 0.5
    const clampedMovement = Math.max(0, Math.min(1, validMovement))

    const filterFreq = 200 + (clampedMovement * 2000) // 200Hz to 2200Hz filter range
    console.log(`🎛️ Map gesture to filter: movement=${validMovement} → freq=${filterFreq.toFixed(1)}Hz`)

    return filterFreq
  }

  /**
   * Update sound patterns from collaborative data
   * Plays audio feedback for remote users' gestures (FR-003)
   * EVOLUTIVE: Also influences generative composition and adds filter modulation
   * FIX: Added remote filter modulation and note hanging prevention
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

    // EVOLUTIVE: Update generative state based on user activity
    if (this.generativeState && patterns && patterns.length > 0) {
      // Update user activity timestamp
      this.generativeState.lastUserActivity = now

      // Increase user influence based on pattern intensity
      const avgIntensity = patterns.reduce((sum, p) => sum + (p.intensity || p.y || 0.5), 0) / patterns.length
      this.generativeState.userInfluence = Math.min(1.0, this.generativeState.userInfluence + avgIntensity * 0.2)

      // Influence harmonic progression based on pattern positions
      const avgX = patterns.reduce((sum, p) => sum + (p.x || 0.5), 0) / patterns.length
      if (avgX > 0.7) {
        // Right side activity: advance harmony
        this.generativeState.harmonicProgression = (this.generativeState.harmonicProgression + 1) % this.generativeState.currentScale.length
      } else if (avgX < 0.3) {
        // Left side activity: add chromatic tension
        if (this.generativeState.complexity < 0.7) {
          this.generativeState.complexity += 0.1
        }
      }

      console.log(`🎵 User influence updated: ${this.generativeState.userInfluence.toFixed(2)}, complexity: ${this.generativeState.complexity.toFixed(2)}`)
    }

    // Check if patterns are the same as last time to avoid repetition
    if (this.lastCollaborativePatterns && this.arePatternsEqual(this.lastCollaborativePatterns, patterns)) {
      console.log('🔇 Skipping duplicate collaborative patterns')
      return
    }
    this.lastCollaborativePatterns = [...(patterns || [])]

    // FIX: Apply filter modulation from remote patterns
    if (patterns && patterns.length > 0) {
      // Calculate average position for filter modulation
      const avgPosition = {
        x: patterns.reduce((sum, p) => sum + (p.x || 0.5), 0) / patterns.length,
        y: patterns.reduce((sum, p) => sum + (p.y || 0.5), 0) / patterns.length,
        z: patterns.reduce((sum, p) => sum + (p.z || 0.5), 0) / patterns.length
      }

      // Apply remote filter modulation to background
      this.updateBackgroundFilters(avgPosition)
      console.log(`🎛️ Applied remote filter modulation: x=${avgPosition.x.toFixed(2)}, y=${avgPosition.y.toFixed(2)}`)
    }

    // Play audio feedback for each pattern from remote users (FR-003, FR-006)
    // FIX: Added note hanging prevention and safe note management
    if (patterns && patterns.length > 0 && this.gestureSynth) {
      // Initialize notes tracking if not exists
      if (!this.activeNotes) {
        this.activeNotes = new Map()
      }

      patterns.forEach((pattern, index) => {
        // Stagger sounds slightly to avoid clipping (20ms per pattern)
        const delay = index * 0.02
        const noteId = `remote_${Date.now()}_${index}`

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

          // FIX: Use very short duration to prevent hanging
          const duration = 0.1 // 100ms maximum for remote notes

          console.log(`🎵 Playing collaborative pattern ${index}: ${frequency.toFixed(1)}Hz, duration: ${duration}s, intensity: ${intensity.toFixed(2)}`)

          // Play short note with guaranteed release (FR-006: <200ms latency)
          this.gestureSynth.triggerAttackRelease(
            frequency,
            duration,
            `+${delay}`,
            velocity
          )

          // Track the note for cleanup
          this.activeNotes.set(noteId, {
            frequency,
            startTime: Tone.context.currentTime + delay,
            synth: this.gestureSynth
          })

          // Schedule automatic cleanup to prevent hanging
          setTimeout(() => {
            if (this.activeNotes.has(noteId)) {
              try {
                this.gestureSynth.triggerRelease(frequency)
                this.activeNotes.delete(noteId)
                console.log(`🔇 Auto-released remote note: ${frequency.toFixed(1)}Hz`)
              } catch (e) {
                // Ignore release errors
                this.activeNotes.delete(noteId)
              }
            }
          }, (delay + duration) * 1000 + 500) // Add 500ms buffer

        } catch (error) {
          console.warn('🔇 Error playing collaborative pattern:', error)
        }
      })

      // Cleanup old notes periodically
      this.cleanupHangingNotes()
    }
  }

  /**
   * Cleanup hanging notes to prevent audio issues
   * FIX: Added note hanging prevention
   */
  cleanupHangingNotes() {
    if (!this.activeNotes || !this.gestureSynth) return

    const now = Tone.context.currentTime
    const maxDuration = 2.0 // Maximum 2 seconds for any note

    // Release any notes that have been playing too long
    this.activeNotes.forEach((noteData, noteId) => {
      if (now - noteData.startTime > maxDuration) {
        try {
          noteData.synth.triggerRelease(noteData.frequency)
          this.activeNotes.delete(noteId)
          console.log(`🔇 Force-released hanging note: ${noteData.frequency.toFixed(1)}Hz`)
        } catch (e) {
          this.activeNotes.delete(noteId)
        }
      }
    })
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
   * Play musical event from gesture with proper articulation and duration
   * FIX: Enhanced duration normalization and articulation support
   * EVOLUTIVE: Integrates user phrases into background composition
   * @param {Object} musicalEvent - Musical event data
   */
  playMusicalEvent(musicalEvent) {
    if (!this.isInitialized || !musicalEvent || this.muted) {
      console.log('🔇 playMusicalEvent blocked - initialized:', this.isInitialized, 'muted:', this.muted)
      return
    }

    const startTime = performance.now()

    try {
      const { pitch, velocity, duration, articulation, eventType } = musicalEvent

      if (pitch === undefined || velocity === undefined || duration === undefined) {
        console.warn('🔇 Invalid musical event data:', { pitch, velocity, duration, articulation })
        return
      }

      // Convert MIDI pitch to frequency
      const frequency = this.midiNoteToFrequency(pitch)

      // FIX: Normalize duration to audible range (prevents too short/long notes)
      let normalizedDuration = duration
      if (typeof duration === 'number') {
        // Convert beats to seconds if duration is in beats
        if (duration < 10) {
          normalizedDuration = duration * 0.25 // Assume quarter note = 0.25s at 60 BPM
        }

        // Clamp to reasonable range
        normalizedDuration = Math.max(0.05, Math.min(4.0, normalizedDuration))
      }

      // Apply articulation FIX: Enhanced duration and velocity adjustments
      let adjustedDuration = normalizedDuration
      let adjustedVelocity = Math.max(0.1, Math.min(1.0, velocity / 127))

      switch (articulation) {
        case 'staccato':
          adjustedDuration *= 0.2 // Much shorter for very noticeable staccato
          adjustedVelocity *= 1.15 // Louder for emphasis
          console.log(`🎵 STACCATO: ${normalizedDuration.toFixed(3)}s → ${adjustedDuration.toFixed(3)}s`)
          break
        case 'legato':
          adjustedDuration *= 1.8 // Much longer for sustained legato
          adjustedVelocity *= 0.85 // Softer
          console.log(`🎵 LEGATO: ${normalizedDuration.toFixed(3)}s → ${adjustedDuration.toFixed(3)}s`)
          break
        case 'accent':
          adjustedVelocity *= 1.4 // Much louder for emphasis
          adjustedDuration *= 1.2 // Slightly longer to emphasize
          console.log(`🎵 ACCENT: ${normalizedDuration.toFixed(3)}s → ${adjustedDuration.toFixed(3)}s, vel=${adjustedVelocity.toFixed(2)}`)
          break
        default:
          console.log(`🎵 DEFAULT: ${normalizedDuration.toFixed(3)}s`)
          break
      }

      // Final duration clamping
      adjustedDuration = Math.max(0.02, Math.min(3.0, adjustedDuration))

      // Enhanced logging for debugging
      console.log(`🎵 Playing musical event: pitch=${pitch} (${frequency.toFixed(1)}Hz), duration=${adjustedDuration.toFixed(3)}s (orig: ${duration}), articulation=${articulation}, velocity=${adjustedVelocity.toFixed(2)}`)

      // Play through gesture synth with proper articulation
      this.gestureSynth.triggerAttackRelease(frequency, adjustedDuration, undefined, adjustedVelocity)

      // EVOLUTIVE: Integrate user phrase into background composition
      this.integrateUserPhraseIntoBackground(musicalEvent, frequency, adjustedDuration)

      // Track performance
      const latency = performance.now() - startTime
      if (latency > 50) {
        console.warn(`🐌 High musical event latency: ${latency.toFixed(1)}ms`)
      }

    } catch (error) {
      console.error('🔇 Error playing musical event:', error)
    }
  }

  /**
   * Integrate user phrase into background composition
   * EVOLUTIVE: Makes background respond to user musical input
   * @param {Object} musicalEvent - Musical event data
   * @param {number} frequency - Note frequency
   * @param {number} duration - Note duration
   */
  integrateUserPhraseIntoBackground(musicalEvent, frequency, duration) {
    if (!this.generativeState || !this.ambientLayers) return

    const state = this.generativeState

    // Update user influence based on musical event characteristics
    state.userInfluence = Math.min(1.0, state.userInfluence + 0.1)
    state.lastUserActivity = Date.now()

    // Extract musical characteristics from the event
    const midiPitch = musicalEvent.pitch
    const velocity = musicalEvent.velocity || 64
    const articulation = musicalEvent.articulation || 'default'

    // Update generative complexity based on user input
    if (articulation === 'staccato') {
      state.complexity = Math.min(1.0, state.complexity + 0.05) // Staccato = increase complexity
    } else if (articulation === 'legato') {
      state.complexity = Math.max(0.1, state.complexity - 0.03) // Legato = slightly decrease
    }

    // Influence harmonic progression based on pitch
    if (midiPitch) {
      const pitchClass = midiPitch % 12
      const currentTonicClass = Math.round(state.currentTonic) % 12

      // If user plays a note far from current tonic, consider modulating
      const pitchDistance = Math.min((pitchClass - currentTonicClass + 12) % 12,
                                   (currentTonicClass - pitchClass + 12) % 12)

      if (pitchDistance > 4) { // More than a major third away
        if (Math.random() > 0.7) {
          // Consider harmonic modulation
          this.considerHarmonicModulation(state, pitchClass)
        }
      }
    }

    // Add rhythmic influence based on duration
    if (duration < 0.2) {
      // Short notes = increase rhythmic complexity
      state.rhythmicComplexity = Math.min(1.0, state.rhythmicComplexity + 0.1)
    } else if (duration > 1.0) {
      // Long notes = decrease rhythmic complexity, increase harmonic tension
      state.rhythmicComplexity = Math.max(0.2, state.rhythmicComplexity - 0.05)
      state.harmonicTension = Math.min(1.0, (state.harmonicTension || 0.3) + 0.1)
    }

    // Log integration for debugging
    console.log(`🎵 Integrated user phrase: influence=${state.userInfluence.toFixed(2)}, complexity=${state.complexity.toFixed(2)}`)

    // Trigger immediate background evolution if enough user influence
    if (state.userInfluence > 0.6) {
      this.triggerImmediateBackgroundEvolution()
    }
  }

  /**
   * Consider harmonic modulation based on user input
   * @param {Object} state - Generative state
   * @param {number} targetPitchClass - Target pitch class for modulation
   */
  considerHarmonicModulation(state, targetPitchClass) {
    const currentTonicClass = Math.round(state.currentTonic) % 12

    // Calculate modulation interval
    let modulationInterval = (targetPitchClass - currentTonicClass + 12) % 12

    // Favor musically meaningful intervals
    const meaningfulIntervals = [5, 7, 2, 9, 4] // Fifth, seventh, second, sixth, third
    const closestInterval = meaningfulIntervals.reduce((prev, curr) => {
      const prevDist = Math.abs((prev - modulationInterval + 12) % 12)
      const currDist = Math.abs((curr - modulationInterval + 12) % 12)
      return currDist < prevDist ? curr : prev
    })

    // Apply modulation if it's meaningful
    if (closestInterval <= 7) {
      state.pendingModulation = closestInterval
      console.log(`🎵 User input suggests modulation: ${closestInterval} semitones`)
    }
  }

  /**
   * Trigger immediate background evolution based on user input
   */
  triggerImmediateBackgroundEvolution() {
    if (!this.generativeState || !this.ambientLayers) return

    const state = this.generativeState

    // Apply pending modulation if exists
    if (state.pendingModulation) {
      const frequencyRatio = Math.pow(2, state.pendingModulation / 12)
      state.currentTonic *= frequencyRatio
      state.currentTonic = Math.max(110, Math.min(440, state.currentTonic))
      state.pendingModulation = null
      console.log(`🎵 Applied user-driven modulation: new tonic=${state.currentTonic.toFixed(1)}Hz`)
    }

    // Update scale based on user complexity preferences
    if (state.complexity > 0.7) {
      // High complexity: add chromatic notes
      if (state.currentScale.length === 5) {
        state.currentScale = [0, 2, 4, 7, 9, 11] // Add 7th
      }
    } else if (state.complexity < 0.3) {
      // Low complexity: simplify to pentatonic
      state.currentScale = [0, 2, 4, 7, 9]
    }

    // Trigger immediate regeneration of background layers
    Object.keys(this.ambientLayers).forEach(layer => {
      this.generateEvolvingLayer(layer)
    })

    console.log(`🎵 Triggered immediate background evolution by user influence`)
  }

  /**
   * Test filter modulation to ensure it's working
   * FIX: Added filter testing system
   */
  testFilterModulation() {
    if (!this.ambientFilters || !this.isInitialized) {
      console.log('🔇 Cannot test filters: not initialized')
      return
    }

    console.log('🧪 Testing filter modulation...')

    // Test with dramatic frequency changes
    const testFrequencies = [200, 500, 1000, 2000, 5000, 8000]
    let testIndex = 0

    const runFilterTest = () => {
      if (testIndex >= testFrequencies.length) {
        console.log('🧪 Filter test completed')
        return
      }

      const freq = testFrequencies[testIndex]
      console.log(`🧪 Testing filter: ${freq}Hz`)

      // Apply to all layers
      Object.keys(this.ambientFilters).forEach(layer => {
        if (this.ambientFilters[layer]) {
          this.ambientFilters[layer].frequency.linearRampToValueAtTime(
            freq * (layer === 'bass' ? 0.5 : layer === 'harmony' ? 1 : 2),
            Tone.context.currentTime + 0.5
          )
          this.ambientFilters[layer].Q.setValueAtTime(3, Tone.context.currentTime)
        }
      })

      testIndex++
      setTimeout(runFilterTest, 1500) // Test each frequency for 1.5 seconds
    }

    runFilterTest()
  }

  /**
   * Test filter modulation with a dramatic sweep
   * Call this method to verify filter modulation is working
   */
  testFilterModulation() {
    if (!this.isInitialized || !this.ambientFilters) {
      console.warn('Cannot test filter modulation - not initialized')
      return
    }

    console.log('🧪 Starting filter modulation test...')

    // Create a dramatic filter sweep over 2 seconds
    const startTime = Tone.now()
    const endTime = startTime + 2

    // Sweep all filters from low to high frequency
    Object.keys(this.ambientFilters).forEach(layerName => {
      const filter = this.ambientFilters[layerName]

      // Start at low frequency
      filter.frequency.setValueAtTime(100, startTime)

      // Sweep to high frequency
      filter.frequency.exponentialRampToValueAtTime(5000, endTime)

      console.log(`🧪 ${layerName} filter sweep: 100Hz → 5000Hz over 2 seconds`)
    })

    // Also sweep the gesture filter
    if (this.gestureFilter) {
      this.gestureFilter.frequency.setValueAtTime(100, startTime)
      this.gestureFilter.frequency.exponentialRampToValueAtTime(8000, endTime)
      console.log('🧪 Gesture filter sweep: 100Hz → 8000Hz over 2 seconds')
    }

    console.log('🧪 Filter test initiated - you should hear dramatic filter sweeps opening up')
  }

  /**
   * Force start background music if it's not playing
   * FIX: Ensures background always starts
   */
  forceStartBackground() {
    if (!this.isInitialized || !this.ambientLayers) {
      console.log('🔇 forceStartBackground: not initialized')
      return
    }

    if (this.muted) {
      console.log('🔇 forceStartBackground: muted')
      return
    }

    try {
      console.log('🎵 Force starting background music...')

      // Force play notes on each layer to ensure audio is working
      Object.keys(this.ambientLayers).forEach(layer => {
        const synth = this.ambientLayers[layer]
        if (!synth) return

        // Generate a simple chord for this layer
        const state = this.generativeState
        if (!state) return

        // Select notes based on layer type
        let notes = []
        switch (layer) {
          case 'bass':
            notes = [state.currentTonic, state.currentTonic * 0.75] // Root and fifth below
            break
          case 'harmony':
            notes = [state.currentTonic * 1.25, state.currentTonic * 1.5] // Third and fifth above
            break
          case 'texture':
            notes = [state.currentTonic * 2, state.currentTonic * 2.5] // Octave above
            break
        }

        // Play the notes with simple parameters
        notes.forEach((freq, index) => {
          setTimeout(() => {
            try {
              synth.triggerAttack(freq, undefined, 0.2)
              console.log(`🎵 Forced background note: ${layer} ${freq.toFixed(1)}Hz`)

              // Auto-release after a reasonable time
              setTimeout(() => {
                try {
                  synth.triggerRelease(freq)
                } catch (e) {
                  // Ignore release errors
                }
              }, 3000)
            } catch (e) {
              console.warn(`🔇 Error playing forced background note:`, e)
            }
          }, index * 200) // Stagger notes slightly
        })
      })

      // If evolution is not active, restart it
      if (!this.evolvingGenerationActive) {
        console.log('🎵 Restarting evolution system...')
        this.evolvingGenerationActive = true
        this.startEvolvingGeneration()
      }

    } catch (error) {
      console.error('🔇 Error in forceStartBackground:', error)
    }
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

    // THROTTLING: Prevent stuttering by limiting filter update frequency
    const now = Date.now()
    if (now - this.lastFilterUpdateTime < this.filterUpdateInterval) {
      // Skip this update to prevent audio stuttering
      return
    }
    this.lastFilterUpdateTime = now

    // Ensure Tone.js context is started and validated
    if (Tone.context.state !== 'running') {
      console.log('🎛️ Starting Tone.js context for filter modulation (second method)')
      Tone.start()
      setTimeout(() => this.applyLegacyFilterModulation(filterParams), 100)
      return
    }

    this.applyLegacyFilterModulation(filterParams)
  }

  /**
   * Apply filter modulation with proper validation for legacy filter system
   * @param {Object} filterParams - Filter modulation parameters
   */
  applyLegacyFilterModulation(filterParams) {
    try {
      // Reduce console log frequency to prevent spam
      const now = Date.now()
      if (now - (this.lastFilterLogTime || 0) > 1000) {
        console.log('🎛️ Applying filter modulation (legacy):', filterParams)
        this.lastFilterLogTime = now
      }

      // Validate Tone context is ready
      if (!Tone.context || !Tone.context.currentTime) {
        console.warn('🔇 Tone context not ready for legacy filter modulation')
        return
      }

      // Handle both parameter naming conventions: frequency or cutoffFrequency
      const cutoffFrequency = filterParams.frequency || filterParams.cutoffFrequency
      const resonance = filterParams.resonance

      // Validate we have valid parameters
      if (cutoffFrequency === null || cutoffFrequency === undefined) {
        console.warn('🔇 Invalid cutoff frequency for filter modulation')
        return
      }

      // Apply to ambient filters (for hover modulation) - FIX: use plural variable name
      if (this.ambientFilters) {
        Object.keys(this.ambientFilters).forEach(layerName => {
          const filter = this.ambientFilters[layerName]
          if (filter && filter.frequency && typeof filter.frequency.exponentialRampToValueAtTime === 'function') {
            // Apply different frequency ranges for each layer
            let targetFrequency = cutoffFrequency
            if (layerName === 'bass') {
              targetFrequency = Math.max(50, Math.min(500, cutoffFrequency * 0.3)) // Bass range
            } else if (layerName === 'harmony') {
              targetFrequency = Math.max(150, Math.min(2000, cutoffFrequency * 0.8)) // Harmony range
            } else if (layerName === 'texture') {
              targetFrequency = Math.max(200, Math.min(4000, cutoffFrequency * 1.5)) // Texture range
            }

            // Use smooth transitions instead of immediate changes to prevent audio artifacts
            const rampTime = 0.1 // 100ms smooth transition
            filter.frequency.exponentialRampToValueAtTime(targetFrequency, Tone.context.currentTime + rampTime)

            // Apply resonance if available with smooth transition
            if (filter.Q && resonance && typeof filter.Q.linearRampToValueAtTime === 'function') {
              let resonanceValue = resonance
              if (layerName === 'bass') {
                resonanceValue = resonance * 1.5 // Subtle bass resonance
              } else if (layerName === 'harmony') {
                resonanceValue = resonance * 2 // Moderate harmony resonance
              } else if (layerName === 'texture') {
                resonanceValue = resonance * 2.5 // Strong texture resonance
              }

              const clampedResonance = Math.max(0.1, Math.min(10, resonanceValue))
              filter.Q.linearRampToValueAtTime(clampedResonance, Tone.context.currentTime + rampTime)
            }
          }
        })
      }

      // Apply to ambient pads (if they exist)
      if (this.audioEngine && this.audioEngine.voices && this.audioEngine.voices.ambient) {
        Object.values(this.audioEngine.voices.ambient).forEach(voice => {
          if (voice.filter && voice.filter.frequency && typeof voice.filter.frequency.setValueAtTime === 'function') {
            // Map cutoff frequency to appropriate range (200-8000 Hz)
            const cutoffRange = cutoffFrequency * 80 + 200 // 0-1 to 200-8000Hz
            voice.filter.frequency.setValueAtTime(cutoffRange, Tone.context.currentTime)

            // Apply resonance if available
            if (voice.filter.Q && resonance && typeof voice.filter.Q.setValueAtTime === 'function') {
              const resonanceRange = resonance * 15 // 0-1 to 0-15
              voice.filter.Q.setValueAtTime(resonanceRange, Tone.context.currentTime)
            }
          }
        })
        console.log('✨ Applied filter to ambient voices')
      }

      // Apply to gesture voices
      if (this.audioEngine && this.audioEngine.voices && this.audioEngine.voices.gesture) {
        Object.values(this.audioEngine.voices.gesture).forEach(voice => {
          if (voice.filter && voice.filter.frequency && typeof voice.filter.frequency.setValueAtTime === 'function') {
            const cutoffRange = cutoffFrequency * 80 + 200
            voice.filter.frequency.setValueAtTime(cutoffRange, Tone.context.currentTime)

            if (voice.filter.Q && resonance && typeof voice.filter.Q.setValueAtTime === 'function') {
              const resonanceRange = resonance * 15
              voice.filter.Q.setValueAtTime(resonanceRange, Tone.context.currentTime)
            }
          }
        })
        console.log('✨ Applied filter to gesture voices')
      }

      // Apply to main gesture synth filter
      if (this.gestureFilter && this.gestureFilter.frequency && typeof this.gestureFilter.frequency.setValueAtTime === 'function') {
        const cutoffRange = cutoffFrequency * 80 + 200 // 0-1 to 200-8000Hz
        this.gestureFilter.frequency.setValueAtTime(cutoffRange, Tone.context.currentTime)
        console.log(`✨ Applied gesture filter cutoff: ${cutoffRange.toFixed(1)}Hz`)

        let resonanceRange = 0
        if (this.gestureFilter.Q && resonance && typeof this.gestureFilter.Q.setValueAtTime === 'function') {
          resonanceRange = resonance * 15 // 0-1 to 0-15
          this.gestureFilter.Q.setValueAtTime(resonanceRange, Tone.context.currentTime)
          console.log(`✨ Applied gesture filter resonance: ${resonanceRange.toFixed(2)}`)
        }
        console.log('✨ Applied filter to gesture synth:', { cutoff: cutoffRange, resonance: resonanceRange })
      }

      // Also apply to collaborative pattern voices if they exist
      if (this.audioEngine && this.audioEngine.collaborativePatterns) {
        this.audioEngine.collaborativePatterns.forEach(pattern => {
          if (pattern.oscillator && pattern.filter && pattern.filter.frequency && typeof pattern.filter.frequency.setValueAtTime === 'function') {
            const cutoffRange = cutoffFrequency * 80 + 200
            pattern.filter.frequency.setValueAtTime(cutoffRange, Tone.context.currentTime)

            if (pattern.filter.Q && resonance && typeof pattern.filter.Q.setValueAtTime === 'function') {
              const resonanceRange = resonance * 15
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