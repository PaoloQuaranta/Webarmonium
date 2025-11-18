/**
 * AudioService
 * Real-time audio parameter mapping and sonic feedback coordination
 * Constitutional requirement: <200ms gesture-to-sound latency, 60fps parameter updates
 *
 * Enhanced with MusicalScheduler for clock-consistent timing and LFOManager for advanced modulation
 */

// Note: MusicalScheduler and LFOManager will be loaded via global scripts
class AudioService {
  constructor() {
    this.isInitialized = false
    this.audioEngine = null
    this.gestureCapture = null

    // CRITICAL: Track all scheduled timeouts for cleanup on stop
    this.scheduledTimeouts = []

    // New musical architecture services
    this.musicalScheduler = null; // Will be initialized after scripts are loaded
    this.lfoManager = null; // Will be initialized after audio context

    // Volume control (extracted component - Sprint 2 refactoring)
    this.volumeController = new VolumeController()

    // Mute and volume controls (DEPRECATED: use volumeController instead)
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

    // Three-tier audio architecture parameters
    this.threeTierConfig = {
      background: {
        waveform: 'triangle',
        volumeMultiplier: 1.0,  // Baseline volume (0dB)
        baseFrequency: 110,      // A2 - warm foundation
        color: '#4a9eff'
      },
      remote: {
        waveform: 'square',
        volumeMultiplier: 1.3,  // +2-3dB above background
        baseFrequency: 440,      // A4 - mid range
        color: '#ff6b6b'
      },
      local: {
        waveform: 'sawtooth',
        volumeMultiplier: 1.6,  // +4-6dB above background
        baseFrequency: 880,      // A5 - bright upper register
        color: '#6bcf7f'
      }
    }

    // Real-time parameter state (maintained for backward compatibility)
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
      },
      // Three-tier specific parameters
      tier: 'local',  // default tier for gestures
      velocity: 200,
      hysteresisThreshold: 0.15
    }

    // Collaborative pattern rate limiting
    this.lastCollaborativePatternTime = 0
    this.lastCollaborativePatterns = null

    // Ambient synth state tracking
    this.ambientSynthActive = false

    // Remote LFO for filter cutoff modulation
    this.remoteFilterLFO = null
    this.remoteLFOTargetFilters = new Set()

    // Track connected users for dynamic modulation scaling
    this.activeRemoteUsers = new Set()
    this.lastUserCountUpdate = Date.now()

    // Track last hover activity for timeout system
    this.lastHoverTime = 0
    this.hoverTimeoutDuration = 500 // 500ms timeout for hover inactivity
    this.hoverTimeoutTimer = null

    // Filter modulation throttling to prevent stuttering
    this.lastFilterUpdateTime = 0
    this.filterUpdateInterval = 50 // 50ms = 20 updates per second maximum
    this.lastFilterLogTime = 0

    // LFO system for advanced hover modulation
    this.lfoSystem = {
      // Local hover LFO parameters
      localResonance: 1.0,      // x-axis controls resonance (1-10)
      localCutoff: 1000,        // y-axis controls base cutoff (200-4000Hz)

      // Remote hover LFO parameters
      remoteAmplitude: 0.5,     // x-axis controls LFO amplitude (0-2.0)
      remoteSpeed: 1.0,         // y-axis controls LFO speed (0.1-8Hz)

      // LFO state
      lfoPhase: 0,
      lastLfoUpdate: Date.now(),
      currentLFOValue: 0,
      isActive: false,
      updateInterval: null,      // setInterval reference

      // Initialize LFO
      init() {
        this.lfoPhase = 0
        this.lastLfoUpdate = Date.now()
        this.currentLFOValue = 0
        this.isActive = false
        console.log('🎛️ LFO system initialized for hover modulation')
      },

      // Start continuous LFO updates
      start() {
        if (this.isActive) return

        this.isActive = true
        this.lastLfoUpdate = Date.now()

        // Start continuous LFO updates at 30Hz for stable audio
        this.updateInterval = setInterval(() => {
          if (!this.isActive) return

          const now = Date.now()
          const deltaTime = (now - this.lastLfoUpdate) / 1000 // Convert to seconds
          this.lastLfoUpdate = now

          // Update LFO phase based on current speed
          this.lfoPhase += deltaTime * this.remoteSpeed * 2 * Math.PI

          // Keep phase in range [0, 2π]
          if (this.lfoPhase > 2 * Math.PI) {
            this.lfoPhase -= 2 * Math.PI
          }

          // Calculate new LFO value
          this.currentLFOValue = Math.sin(this.lfoPhase)

        }, 1000 / 30) // 30 FPS updates - stable for audio

        console.log('🌊 Continuous LFO started at 30Hz - stable for audio')
      },

      // Stop continuous LFO updates
      stop() {
        this.isActive = false
        if (this.updateInterval) {
          clearInterval(this.updateInterval)
          this.updateInterval = null
        }
        console.log('⏹️ Continuous LFO stopped')
      },

      // Update LFO phase and get current value 
      update() {
        if (!this.isActive) {
          // Fallback to manual update if not active
          const now = Date.now()
          const deltaTime = (now - this.lastLfoUpdate) / 1000
          this.lastLfoUpdate = now

          this.lfoPhase += deltaTime * this.remoteSpeed * 2 * Math.PI
          if (this.lfoPhase > 2 * Math.PI) {
            this.lfoPhase -= 2 * Math.PI
          }
          return Math.sin(this.lfoPhase)
        }
        return this.currentLFOValue
      },

      // Get current modulated cutoff frequency with LFO
      getModulatedCutoff() {
        const lfoValue = this.update()
        const modulationRange = this.localCutoff * this.remoteAmplitude * 0.8 // Max 80% modulation
        const modulatedCutoff = this.localCutoff + (lfoValue * modulationRange)

        // Clamp to valid frequency range
        return Math.max(50, Math.min(8000, modulatedCutoff))
      },

      // Get current LFO value for display/debug
      getCurrentLFOValue() {
        return this.currentLFOValue
      },

      // Check if LFO is currently active
      isLFOActive() {
        return this.isActive
      }
    }

    // Initialize LFO system - DISABILITATO per eliminare tremolo
    // this.lfoSystem.init() // Vecchio LFO system rimosso
    console.log('🛑 LFO system initialization DISABLED - using only unified modulation')

    // NUCLEAR OPTION: Completely disable all LFO functionality to eliminate tremolo
    this.disableAllLFOSystems()
  }

  /**
   * NUCLEAR OPTION: Completely disable all LFO systems to eliminate tremolo
   * This is the definitive fix for omnipresent tremolo issues
   */
  disableAllLFOSystems() {
    console.log('🚨 NUCLEAR OPTION: Disabling ALL LFO systems to eliminate tremolo')

    // Disable lfoSystem completely
    if (this.lfoSystem) {
      this.lfoSystem.isActive = false
      this.lfoSystem.currentLFOValue = 0
      this.lfoSystem.lfoPhase = 0
      if (this.lfoSystem.updateInterval) {
        clearInterval(this.lfoSystem.updateInterval)
        this.lfoSystem.updateInterval = null
      }
      console.log('🛑 lfoSystem completely disabled')
    }

    // Disable any existing LFO instances
    if (this.remoteFilterLFO) {
      this.remoteFilterLFO.stop()
      this.remoteFilterLFO.dispose()
      this.remoteFilterLFO = null
      console.log('🛑 remoteFilterLFO destroyed')
    }

    if (this.tremoloLFO) {
      this.tremoloLFO.stop()
      this.tremoloLFO.dispose()
      this.tremoloLFO = null
      console.log('🛑 tremoloLFO destroyed')
    }

    console.log('✅ ALL LFO SYSTEMS DISABLED - tremolo should be eliminated')
  }

  /**
   * Initialize the three-tier audio architecture
   */
  initializeThreeTierAudio() {
    // Continuous filter update system properties
    this.continuousFilterUpdate = {
      isActive: false,
      updateInterval: null,
      lastUpdate: 0,
      updateRate: 1000 / 30 // 30Hz - much more stable for audio filters
    }

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
      if (window.Tone) {
        // Always ensure Tone is started
        if (Tone.context.state !== 'running') {
          await Tone.start()
          console.log('🔊 Tone.js context started/resumed')
        }

        // CRITICAL: Start Transport for scheduled events
        if (Tone.Transport.state !== 'started') {
          Tone.Transport.start()
          console.log('🚀 Tone.Transport started for event scheduling')
        }

        // CRITICAL: Ensure audioContext is properly set
        this.audioContext = Tone.context
        console.log('🔊 AudioContext set:', !!this.audioContext, 'state:', Tone.context?.state)

        // Create continuous generative music system if not already created
        // This will create new synths on first call, or reuse existing synths on subsequent calls
        if (!this.isInitialized) {
          console.log('🔨 Starting audio system (will create or reuse synths)...')

          // This either creates new synths or reuses existing ones
          this.createContinuousGenerativeSystem()

          // Always restart generation loops
          this.startUpdateLoop()

          // Initialize new musical architecture services (only on first start)
          if (!this.musicalScheduler) {
            this.initializeNewMusicalArchitecture()
          }

          this.isInitialized = true
          console.log('🔊 AudioService initialized successfully - Continuous generative music active')
        }

        // CRITICAL: Always restore master volume after stop() (was set to -Infinity)
        if (this.masterVolume && this.masterVolume.volume.value === -Infinity) {
          this.masterVolume.volume.value = -10
          console.log('🔊 Master volume restored to -10dB')
        }

        // Verify components
        if (this.masterVolume && this.gestureSynth) {
          console.log('✅ Audio components verified:', {
            gestureSynthDisposed: this.gestureSynth.disposed,
            masterVolumeExists: !!this.masterVolume,
            masterVolumeValue: this.masterVolume.volume.value
          })
        } else {
          console.error('❌ Missing audio components:', {
            masterVolume: !!this.masterVolume,
            gestureSynth: !!this.gestureSynth
          })
        }

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
   * FIX: Never dispose synths - reuse existing synths to avoid "Synth was already disposed" error
   */
  createContinuousGenerativeSystem() {
    console.log('🔨 Creating continuous generative system...')
    console.log('🔖 AUDIOSERVICE VERSION: 2025-01-18-FLAT-ENVELOPE-v10')
    console.log('✅ PRIME RHYTHMS: 3700, 5300, 7900 (LCM=43 HOURS)')
    console.log('✅ PURE PATTERNS: Zero variation - only rhythm × pattern')
    console.log('✅ FLAT ENVELOPES: attack/release 5ms ONLY - envelope does NOT mask pattern!')
    console.log('✅ Pattern system: 12 contrasted patterns (LONG/SHORT/MIXED/EVEN)')
    console.log('🎯 Duration = EXACT pattern multiplier - no envelope artifacts!')

    // CRITICAL FIX: Never dispose synths immediately!
    // Tone.js internal timeouts from triggerAttackRelease() may still be scheduled
    // Disposing while these timeouts are pending causes "Synth was already disposed" error
    // Instead, we reuse existing synths if they exist

    // If synths already exist, skip creation and just reuse them
    if (this.gestureSynth && this.ambientLayers && this.masterVolume) {
      console.log('♻️ Reusing existing synths (never dispose to avoid Tone.js timeout errors)')
      // Ensure synths are ready to use
      if (this.gestureSynth && !this.gestureSynth.disposed) {
        this.gestureSynth.releaseAll()
        console.log('✅ Existing synths released and ready to reuse')
      }

      // Restart evolving generation (was stopped by stop())
      if (!this.evolvingGenerationActive) {
        this.startEvolvingGeneration()
        console.log('♻️ Restarted evolving generation with existing synths')
      }

      return // Exit early - synths already exist and are ready
    }

    console.log('🆕 Creating new synths (first time initialization)...')

    // Create master volume node for centralized control (FR-011)
    this.masterVolume = new Tone.Volume(-10).toDestination()

    // Pass masterVolume to VolumeController (Sprint 2 refactoring)
    this.volumeController.setMasterVolumeNode(this.masterVolume)

    // Create global effects for unified modulation
    this.reverb = new Tone.Reverb({
      decay: 3.0,        // 3 second decay
      preDelay: 0.01,    // 10ms predelay
      wet: 0.2           // Start with subtle reverb
    }).connect(this.masterVolume)

    this.delay = new Tone.Delay({
      delayTime: 0.2,    // 200ms delay
      maxDelay: 1,       // 1 second max
      wet: 0.1           // Start with subtle delay
    }).connect(this.masterVolume)

    // Initialize generative composition state
    this.generativeState = {
      currentScale: [0, 2, 4, 7, 9], // Pentatonic major
      currentTonic: 220, // A3
      harmonicProgression: 0,
      evolutionCycle: 0,
      userInfluence: 0,
      lastUserActivity: Date.now(),
      evolutionSpeed: 8000, // Base evolution cycle
      complexity: 0.3, // Starting complexity

      // RHYTHMIC PATTERNS: Highly contrasted combinations to eliminate repetition
      // Categories: LONG-dominant, SHORT-dominant, MIXED, EVEN
      rhythmPatterns: [
        // LONG-dominant patterns (sustained notes)
        [3.0],                      // 0: single very long note
        [2.0, 1.0],                 // 1: long + medium
        [1.5, 1.5],                 // 2: two sustained notes

        // SHORT-dominant patterns (rapid notes)
        [0.3, 0.3, 0.3, 0.3],       // 3: four rapid notes
        [0.4, 0.4, 0.4, 0.4, 0.4],  // 4: five rapid notes
        [0.25, 0.25, 0.5],          // 5: very fast triplet

        // MIXED patterns (contrast within pattern)
        [0.5, 1.5],                 // 6: classic short-long
        [1.5, 0.5],                 // 7: inverted long-short
        [0.3, 2.0],                 // 8: very short + very long (dramatic)
        [2.0, 0.3],                 // 9: very long + very short (dramatic inverted)

        // EVEN patterns (steady pulse)
        [1.0, 1.0, 1.0],            // 10: steady triplet
        [0.8, 0.8, 0.8, 0.8],       // 11: steady quadruplet
      ],

      // SIMPLIFIED STRUCTURE: Bass + Pad + Chords
      // Reduces polyphony and creates clearer musical texture
      // BALANCED RHYTHMS: All layers similar speed to avoid dominant pulse
      layers: {
        bass: {
          nextNoteTime: 0,
          rhythm: 3700,      // PRIME-ISH: Prevents synchronization with other layers
          currentNote: 0,    // Current scale degree
          octave: -2,        // Two octaves below tonic (55-110Hz range)
          velocity: 0.45,    // QUIETER: was 0.8, too dominant
          lastFrequency: null,  // Track for release
          currentPatternIndex: 3,  // Start with SHORT pattern (four rapid)
          patternPosition: 0       // Position within the pattern
        },
        pad: {
          nextNoteTime: 1200,  // Offset start to avoid initial cluster
          rhythm: 5300,      // PRIME: Completely independent from bass/chords
          currentNotes: [2, 4],  // Two notes for pad (third and fifth)
          octave: 0,         // Same as tonic (220Hz range)
          velocity: 0.30,    // LOUDER: was 0.25, too quiet
          lastFrequencies: [],  // Track for release
          currentPatternIndex: 0,  // Start with LONG pattern (single sustained)
          patternPosition: 0
        },
        chords: {
          nextNoteTime: 2400, // Different offset
          rhythm: 7900,      // PRIME: Maximum desynchronization from others
          currentChord: 0,   // Index in progression
          octave: 1,         // One octave above tonic (440Hz range)
          velocity: 0.40,    // LOUDER: was 0.3, chords should be prominent
          lastFrequencies: [],  // Track for release
          currentPatternIndex: 10,  // Start with EVEN pattern (steady triplet)
          patternPosition: 0
        }
      },

      // HARMONIC CONTEXT - Multiple progressions for variety
      availableProgressions: [
        { name: 'I-V-vi-IV', degrees: [0, 4, 5, 3], mood: 'uplifting' },     // Pop progression
        { name: 'I-IV-V-IV', degrees: [0, 3, 4, 3], mood: 'driving' },       // Rock progression
        { name: 'i-VI-III-VII', degrees: [0, 5, 2, 6], mood: 'dramatic' },   // Minor progression
        { name: 'I-vi-IV-V', degrees: [0, 5, 3, 4], mood: 'circular' },      // Classic progression
        { name: 'I-V-vi-iii-IV', degrees: [0, 4, 5, 2, 3], mood: 'flowing' },// Extended progression
        { name: 'I-iii-vi-IV', degrees: [0, 2, 5, 3], mood: 'melancholic' }, // Sad progression
        { name: 'I-VII-IV-V', degrees: [0, 6, 3, 4], mood: 'mysterious' }    // Modal progression
      ],
      currentProgressionIndex: 0,
      chordProgression: [0, 4, 5, 3], // Start with I-V-vi-IV
      currentChord: 0,
      chordDuration: 8000, // Time on each chord in milliseconds
      lastChordChange: Date.now(), // Track when chord last changed
      progressionCycles: 0, // How many times through current progression
      nextProgressionChange: 4 // Change progression after N cycles
    }

    // Create multi-layer ambient synth system with REDUCED POLYPHONY
    // BASS: Deep, warm foundation (single note)
    this.ambientLayers = {
      bass: new Tone.PolySynth({
        oscillator: {
          type: 'fatsawtooth',  // Rich bass tone
          count: 3,
          spread: 30
        },
        envelope: {
          attack: 0.005,  // MINIMAL attack - just enough to prevent click (5ms)
          decay: 0.01,    // Minimal decay
          sustain: 1.0,   // FULL sustain - note at constant volume
          release: 0.005  // MINIMAL release - just anti-click (5ms)
        },
        maxPolyphony: 3  // INCREASED: Allow overlap during release (was 1)
      }),

      // PAD: Warm pad-like sound (1-2 notes)
      pad: new Tone.PolySynth({
        oscillator: {
          type: 'fatsquare',  // Warm, hollow
          count: 3,
          spread: 40
        },
        envelope: {
          attack: 0.005,  // MINIMAL attack (5ms)
          decay: 0.01,    // Minimal decay
          sustain: 1.0,   // FULL sustain
          release: 0.005  // MINIMAL release (5ms)
        },
        maxPolyphony: 6  // INCREASED: Allow overlap during long release (was 2)
      }),

      // CHORDS: Triad chords (3 notes)
      chords: new Tone.PolySynth({
        oscillator: {
          type: 'fatsquare',  // Warm for chords
          count: 2,
          spread: 20
        },
        envelope: {
          attack: 0.005,  // MINIMAL attack (5ms)
          decay: 0.01,    // Minimal decay
          sustain: 1.0,   // FULL sustain
          release: 0.005  // MINIMAL release (5ms)
        },
        maxPolyphony: 9  // INCREASED: 3 notes × 3 voices = 9 (was 3)
      })
    }

    // Create individual filters and volumes for each layer
    this.ambientFilters = {
      bass: new Tone.Filter({ type: 'lowpass', frequency: 150, Q: 1 }),    // Deep bass (50-150Hz)
      pad: new Tone.Filter({ type: 'lowpass', frequency: 800, Q: 1.5 }),   // Mid-range pad
      chords: new Tone.Filter({ type: 'lowpass', frequency: 2000, Q: 2 })  // Brighter chords
    }

    // Balanced volumes - bass VERY loud, chords quiet
    this.ambientVolumes = {
      bass: new Tone.Volume(0),     // FULL VOLUME for deep bass prominence
      pad: new Tone.Volume(-10),    // Very subtle pad
      chords: new Tone.Volume(-9)   // Quiet chords (was -6dB)
    }

    // Connect each layer: synth -> filter -> volume -> effects -> master
    Object.keys(this.ambientLayers).forEach(layer => {
      this.ambientLayers[layer].connect(this.ambientFilters[layer])
      this.ambientFilters[layer].connect(this.ambientVolumes[layer])
      // Route through reverb only (NO DELAY to prevent note repetition)
      this.ambientVolumes[layer].connect(this.reverb)
      // Also connect directly to master for dry signal
      this.ambientVolumes[layer].connect(this.masterVolume)
    })

    // Create gesture-responsive synth with INCREASED polyphony and cleaner sound
    this.gestureSynth = new Tone.PolySynth({
      oscillator: {
        type: 'sawtooth',
        harmonicity: 0,  // Remove harmonicity to prevent triangle waves
        modulationType: 'none'  // Disable modulation
      },
      volume: -10,  // Quieter default volume
      envelope: {
        attack: 0.02,  // Faster attack
        decay: 0.2,   // Faster decay
        sustain: 0.3,  // Lower sustain to prevent overlapping
        release: 0.8    // Faster release
      },
      maxPolyphony: 8 // INCREASED polyphony to prevent note dropping
    })

    // Add filter to gesture synth for hover modulation - FIX: restore filter modulation
    this.gestureFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: 2000,
      Q: 1
    })

    // Add pan node for gesture synth spatial control
    this.gesturePan = new Tone.Panner(0).toDestination()

    // FIX: Correct routing - synth -> filter -> pan -> effects -> master -> destination
    this.gestureSynth.connect(this.gestureFilter)
    this.gestureFilter.connect(this.gesturePan)
    this.gesturePan.connect(this.reverb)
    this.gesturePan.connect(this.delay)
    this.gesturePan.connect(this.masterVolume)

    // Polyphony management
    this.maxTotalVoices = 8 // Maximum total voices across all synths

    // Start evolving generative system
    this.startEvolvingGeneration()

    console.log('🎵 Evolutive generative system created with limited polyphony management')
  }

  /**
   * Start evolving generative music system with independent voices
   * MUSICAL COMPOSITION: Multi-voice counterpoint with voice leading
   */
  startEvolvingGeneration() {
    if (this.evolvingGenerationActive) return

    this.evolvingGenerationActive = true
    this.lastVoiceUpdateTime = Date.now()

    // Main composition loop - runs frequently to check layer schedules
    const compositionLoop = () => {
      if (!this.evolvingGenerationActive || !this.isInitialized) {
        console.log('🎵 Evolving generation stopped or not initialized')
        return
      }

      try {
        const now = Date.now()
        const deltaTime = now - this.lastVoiceUpdateTime
        this.lastVoiceUpdateTime = now

        // Update each layer independently
        Object.keys(this.generativeState.layers).forEach(layerName => {
          const layer = this.generativeState.layers[layerName]

          // Check if it's time for this layer to play
          layer.nextNoteTime -= deltaTime
          if (layer.nextNoteTime <= 0) {
            this.playLayer(layerName)

            // PATTERN-BASED RHYTHM SYSTEM
            // Get the current rhythmic pattern for this layer
            const currentPattern = this.generativeState.rhythmPatterns[layer.currentPatternIndex]
            const patternMultiplier = currentPattern[layer.patternPosition]

            // Advance position in pattern
            layer.patternPosition++

            // If pattern is complete, choose a new random pattern
            if (layer.patternPosition >= currentPattern.length) {
              const oldPattern = layer.currentPatternIndex
              // Choose different pattern than current one
              do {
                layer.currentPatternIndex = Math.floor(Math.random() * this.generativeState.rhythmPatterns.length)
              } while (layer.currentPatternIndex === oldPattern && this.generativeState.rhythmPatterns.length > 1)

              layer.patternPosition = 0
              console.log(`🔄 ${layerName}: pattern change ${oldPattern} → ${layer.currentPatternIndex} [${this.generativeState.rhythmPatterns[layer.currentPatternIndex].join(', ')}]`)
            }

            // PURE PATTERN - NO DRIFT, NO JITTER, NO VARIATION
            // Just the pattern multiplier applied to base rhythm
            layer.nextNoteTime = layer.rhythm * patternMultiplier

            console.log(`⏱️ ${layerName}: nextNote in ${Math.round(layer.nextNoteTime)}ms (rhythm=${layer.rhythm} × pattern=${patternMultiplier})`)
          }
        })

        // Harmonic progression change based on actual time (chordDuration)
        const timeSinceChordChange = now - this.generativeState.lastChordChange
        if (timeSinceChordChange >= this.generativeState.chordDuration) {
          this.advanceHarmony()
          this.generativeState.lastChordChange = now
        }

        this.generativeState.evolutionCycle++

      } catch (error) {
        console.error('🎵 Error in composition loop:', error)
      }

      // Run loop every 100ms for responsive scheduling
      setTimeout(compositionLoop, 100)
    }

    // Start composition loop
    setTimeout(() => {
      console.log('🎵 Starting bass + pad + chords composition system')
      console.log('🎵 Initial layer state:', {
        bass: this.generativeState.layers.bass.octave,
        pad: this.generativeState.layers.pad.octave,
        chords: this.generativeState.layers.chords.octave,
        tonic: this.generativeState.currentTonic
      })
      compositionLoop()
    }, 2000)

    console.log('🎵 Simplified generative system initialized (bass/pad/chords)')
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

  // OLD FUNCTIONS REMOVED - Now using simplified playLayer() system
  // generateEvolvingLayer() and selectNotesForLayer() have been replaced
  // with bass + pad + chords architecture to reduce polyphony

  /**
   * Play a musical layer (bass, pad, or chords)
   * SIMPLIFIED COMPOSITION: Clear bass + sustained pad + triad chords
   * @param {string} layerName - Name of layer ('bass', 'pad', 'chords')
   */
  playLayer(layerName) {
    console.log(`🎹 playLayer CALLED for ${layerName} at ${Date.now()}`)

    const state = this.generativeState
    const layer = state.layers[layerName]
    const scale = state.currentScale

    if (!this.ambientLayers || this.muted) return

    const synth = this.ambientLayers[layerName]
    if (!synth) return

    // Get current chord root from progression
    const chordRoot = state.chordProgression[state.currentChord]
    const chordRootIndex = scale.indexOf(chordRoot)

    // Release previous notes moved inside layer-specific code
    // to prevent releasing notes we're about to retrigger

    // Calculate frequencies based on layer type
    let frequencies = []

    // PATTERN-BASED DURATION: Match note duration to rhythmic pattern
    // Duration should reflect the pattern multiplier for coherent rhythm
    const currentPattern = state.rhythmPatterns[layer.currentPatternIndex]
    const currentPosition = (layer.patternPosition - 1 + currentPattern.length) % currentPattern.length
    const patternMultiplier = currentPattern[currentPosition]

    // Base durations per layer
    let baseDuration
    if (layerName === 'bass') {
      baseDuration = 1.0  // 1 second base
    } else if (layerName === 'pad') {
      baseDuration = 2.5  // 2.5 seconds base (longer sustains)
    } else if (layerName === 'chords') {
      baseDuration = 1.8  // 1.8 seconds base
    }

    // Duration matches pattern: if pattern says 2.0x rhythm, note lasts 2.0x duration
    // This creates coherent relationship between note spacing and note length
    // Articulation: notes slightly shorter than inter-onset for clarity (80%)
    const articulationFactor = 0.8 - (state.complexity * 0.1)  // Higher complexity = more staccato
    const duration = baseDuration * patternMultiplier * articulationFactor

    // DEBUG: Log pattern usage for duration calculation
    console.log(`🎼 ${layerName} DURATION: pattern[${currentPosition}]=${patternMultiplier} → dur=${duration.toFixed(2)}s (from pattern ${layer.currentPatternIndex}: [${currentPattern.join(', ')}])`)

    if (layerName === 'bass') {
      // BASS: ONLY root note - NO variation to avoid repetitive melodic pattern
      // Previous variation [root, fifth, root+octave] created "C-G-C" repetition
      // User perceived this as "note played twice" pattern
      const scaleNote = chordRoot
      const frequency = state.currentTonic * Math.pow(2, (scaleNote / 12) + layer.octave)
      frequencies = [frequency]

      // CRITICAL: Always release all previous notes to prevent polyphony overflow
      try {
        synth.releaseAll()
      } catch (e) {
        // Ignore release errors
      }
      layer.lastFrequency = frequency

    } else if (layerName === 'pad') {
      // PAD: Third and fifth (2 notes)
      const third = scale[(chordRootIndex + 2) % scale.length]
      const fifth = scale[(chordRootIndex + 4) % scale.length]

      // octave=0 → same as tonic
      const freq3 = state.currentTonic * Math.pow(2, (third / 12) + layer.octave)
      const freq5 = state.currentTonic * Math.pow(2, (fifth / 12) + layer.octave)
      frequencies = [freq3, freq5]

      // CRITICAL: Always release all previous notes to prevent polyphony overflow
      try {
        synth.releaseAll()
      } catch (e) {
        // Ignore release errors
      }
      layer.lastFrequencies = frequencies

    } else if (layerName === 'chords') {
      // CHORDS: Triad (root, third, fifth)
      const root = chordRoot
      const third = scale[(chordRootIndex + 2) % scale.length]
      const fifth = scale[(chordRootIndex + 4) % scale.length]

      // octave=1 → one octave above tonic
      const freqR = state.currentTonic * Math.pow(2, (root / 12) + layer.octave)
      const freq3 = state.currentTonic * Math.pow(2, (third / 12) + layer.octave)
      const freq5 = state.currentTonic * Math.pow(2, (fifth / 12) + layer.octave)
      frequencies = [freqR, freq3, freq5]

      // CRITICAL: Always release all previous notes to prevent polyphony overflow
      try {
        synth.releaseAll()
      } catch (e) {
        // Ignore release errors
      }
      layer.lastFrequencies = frequencies
    }

    // ORGANIC VELOCITY VARIATION: Musical dynamics
    // Each layer varies around its base velocity with different ranges
    let velocityVariation
    if (layerName === 'bass') {
      // Bass: ±20% variation for rhythmic emphasis
      velocityVariation = 0.8 + Math.random() * 0.4
    } else if (layerName === 'pad') {
      // Pad: ±15% variation for subtle swells
      velocityVariation = 0.85 + Math.random() * 0.3
    } else if (layerName === 'chords') {
      // Chords: ±25% variation for dynamic interest
      velocityVariation = 0.75 + Math.random() * 0.5
    }

    // Complexity adds micro-variations in dynamics
    const dynamicFactor = 0.9 + (Math.random() * 0.2) * state.complexity
    const playVelocity = layer.velocity * velocityVariation * dynamicFactor

    // Trigger notes
    try {
      const triggerTime = Tone.now()
      console.log(`🔊 TRIGGERING ${layerName} at Tone.now()=${triggerTime.toFixed(3)}`)

      frequencies.forEach((freq, idx) => {
        console.log(`  ↳ Trigger #${idx+1}: freq=${freq.toFixed(1)}Hz, dur=${duration.toFixed(3)}s, vel=${playVelocity.toFixed(2)}`)
        synth.triggerAttackRelease(freq, duration, triggerTime, playVelocity)
      })

      // Detailed logging for rhythm debugging
      const freqStr = frequencies.map(f => f.toFixed(1) + 'Hz').join(', ')
      console.log(`🎵 ${layerName}: ${freqStr} dur=${duration.toFixed(2)}s vel=${playVelocity.toFixed(2)} (chord=${state.currentChord})`)
    } catch (error) {
      console.warn(`🎵 Layer ${layerName} play error:`, error.message)
    }
  }

  /**
   * Advance harmonic progression
   * Changes current chord in progression and evolves progressions
   */
  advanceHarmony() {
    const state = this.generativeState
    state.currentChord = (state.currentChord + 1) % state.chordProgression.length

    // If we completed a full progression cycle
    if (state.currentChord === 0) {
      state.progressionCycles++

      // Change progression after N cycles based on collective metrics
      if (state.progressionCycles >= state.nextProgressionChange) {
        this.changeProgression()
        state.progressionCycles = 0
        // Vary the cycles between changes (3-6 cycles)
        state.nextProgressionChange = 3 + Math.floor(Math.random() * 4)
      }
    }

    const currentProg = state.availableProgressions[state.currentProgressionIndex]
    console.log(`🎵 Harmony: ${currentProg.name} chord ${state.currentChord}/${state.chordProgression.length} (root: ${state.chordProgression[state.currentChord]})`)

    // Occasional key modulation
    if (state.evolutionCycle % 32 === 0 && Math.random() < 0.2) {
      this.mutateHarmonicContext()
    }
  }

  /**
   * Change to a different chord progression based on activity
   */
  changeProgression() {
    const state = this.generativeState

    // Use complexity to choose progression mood
    let targetMoods
    if (state.complexity > 0.7) {
      // High energy: use driving/uplifting progressions
      targetMoods = ['driving', 'uplifting', 'flowing']
    } else if (state.complexity > 0.4) {
      // Medium energy: use circular/mysterious progressions
      targetMoods = ['circular', 'mysterious', 'flowing']
    } else {
      // Low energy: use melancholic/dramatic progressions
      targetMoods = ['melancholic', 'dramatic', 'mysterious']
    }

    // Filter progressions by mood
    const suitableProgressions = state.availableProgressions
      .map((prog, index) => ({ ...prog, index }))
      .filter(prog => targetMoods.includes(prog.mood))

    // Choose random from suitable progressions (avoid current)
    const options = suitableProgressions.filter(p => p.index !== state.currentProgressionIndex)
    if (options.length > 0) {
      const chosen = options[Math.floor(Math.random() * options.length)]
      state.currentProgressionIndex = chosen.index
      state.chordProgression = chosen.degrees
      state.currentChord = 0 // Reset to beginning of new progression

      console.log(`🎼 PROGRESSION CHANGE: ${chosen.name} (${chosen.mood}) complexity=${state.complexity.toFixed(2)}`)
    }
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
      console.log('🛑 Stopping AudioService - immediate silence...')

      // STEP 0: MUTE EVERYTHING IMMEDIATELY (before anything else)
      if (this.masterVolume) {
        this.masterVolume.volume.value = -Infinity
        console.log('🔇 Master volume set to -Infinity (immediate silence)')
      }

      // STEP 1: Clear ALL scheduled timeouts (prevents future notes)
      console.log(`⏱️ Clearing ${this.scheduledTimeouts.length} scheduled timeouts...`)
      this.scheduledTimeouts.forEach(timeoutId => {
        clearTimeout(timeoutId)
      })
      this.scheduledTimeouts = []
      console.log('✅ All timeouts cleared')

      // STEP 2: Stop Transport (prevents new events from scheduling)
      try {
        if (Tone.Transport) {
          Tone.Transport.stop()
          Tone.Transport.clear()  // CHANGED: clear() removes ALL events (not just cancel)
          console.log('✅ Transport stopped and cleared')
        }
      } catch (error) {
        console.warn('⚠️ Transport error:', error.message)
      }

      // STEP 3: Stop generation
      this.evolvingGenerationActive = false
      this.stopUpdateLoop()

      // STEP 4: Release all notes on all synths
      console.log('🎹 Releasing all notes on all synths...')

      try {
        if (this.gestureSynth && !this.gestureSynth.disposed) {
          this.gestureSynth.releaseAll()
        }
      } catch (e) {
        console.warn('⚠️ gestureSynth releaseAll error:', e.message)
      }

      if (this.ambientLayers) {
        Object.keys(this.ambientLayers).forEach(layer => {
          try {
            if (this.ambientLayers[layer] && !this.ambientLayers[layer].disposed) {
              this.ambientLayers[layer].releaseAll()
            }
          } catch (e) {
            console.warn(`⚠️ ${layer} releaseAll error:`, e.message)
          }
        })
      }

      console.log('✅ All notes released')

      // Mark as uninitialized to force recreation of synths on next start()
      // This ensures old synths with scheduled events are properly disposed
      this.isInitialized = false

      console.log('🔇 AudioService stopped - will recreate synths on next start')
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
      const filterParams = this.mapGestureToFilter(sonicParams)

      // Handle both old format (number) and new format (object) for backward compatibility
      let cutoffFrequency, resonance, tremoloAmount
      if (typeof filterParams === 'object' && filterParams !== null) {
        cutoffFrequency = filterParams.cutoffFrequency
        resonance = filterParams.resonance
        tremoloAmount = filterParams.tremoloAmount || 0
      } else {
        //  treat as cutoff frequency
        cutoffFrequency = filterFreq || 1000
        resonance = 1.0
        tremoloAmount = 0
      }

      // FIX: Apply real-time parameters to gesture filter for hover modulation
      if (this.gestureFilter && this.gestureFilter.frequency && this.gestureFilter.Q) {
        // FIX: Validate filter frequency to prevent null errors
        const validFreq = cutoffFrequency && !isNaN(cutoffFrequency) ? cutoffFrequency : 1000
        const clampedFreq = Math.max(100, Math.min(8000, validFreq))

        // Additional validation to prevent null errors
        const currentTime = Tone.context && Tone.context.currentTime ? Tone.context.currentTime : Tone.now()

        if (this.gestureFilter.frequency.linearRampToValueAtTime) {
          this.gestureFilter.frequency.linearRampToValueAtTime(clampedFreq, currentTime + 0.05)
        }

        // Use resonance from our new filter mapping system
        const filterQ = resonance || (1 + (sonicParams.z || 0.5) * 3)
        const clampedQ = Math.max(0.1, Math.min(10, filterQ))

        if (this.gestureFilter.Q.linearRampToValueAtTime) {
          this.gestureFilter.Q.linearRampToValueAtTime(clampedQ, currentTime + 0.05)
        }

        // Apply tremolo if present (remote modulation high range)
        if (tremoloAmount > 0 && this.gestureSynth) {
          this.applyTremolo(tremoloAmount, currentTime)
        }

        console.log(`🎛️ Applied gesture filter: ${clampedFreq.toFixed(1)}Hz, Q=${clampedQ.toFixed(2)}, tremolo=${tremoloAmount.toFixed(2)}`)
      } else {
        console.warn('🔇 Gesture filter not available for modulation')
      }

      // Apply filter frequency to gesture synth with immediate effect
      if (this.gestureSynth && this.gestureSynth.filter) {
        this.gestureSynth.filter.frequency.linearRampToValueAtTime(filterFreq, Tone.now() + 0.05)
        console.log(`🎛️ Applied gesture filter: ${filterFreq.toFixed(1)}Hz (ramp 50ms)`)

        // Also apply to master volume for cleaner routing
        if (this.masterVolume && this.masterVolume.volume) {
          const targetVolume = Math.max(-40, Math.min(0, -5)) // Reduce background to make local gesture clearer
          this.masterVolume.volume.linearRampToValueAtTime(targetVolume, Tone.now() + 0.1)
          console.log(`🎛️ Applied master volume: ${targetVolume}dB for gesture clarity`)
        }
      }

      // Calculate three-tier duration based on gesture velocity
      const gestureVelocity = sonicParams.velocity || 200
      const tierDuration = this.calculateThreeTierDuration(gestureVelocity, '8n')

      // Trigger gesture-responsive note with three-tier duration
      // Use volume from gesture as velocity parameter (0.3-0.7 range)
      if (this.gestureSynth && this.gestureSynth.triggerAttackRelease) {
        // FIX: Simplified approach without delay to prevent hanging
        const velocity = Math.max(0.1, Math.min(0.8, 0.3 + (volume * 0.4)))

        // Trigger note directly with immediate effect and lower volume
        this.gestureSynth.triggerAttackRelease(frequency, tierDuration, undefined, velocity * 0.6)

        console.log(`🎵 Triggering gesture note: ${frequency.toFixed(1)}Hz, duration: ${tierDuration}s, velocity: ${velocity.toFixed(2)}`)
      } else {
        console.warn('🔇 Gesture synth not available for note triggering')
      }

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
    if (this.ambientFilters.chords) {
      // Strongest modulation on chords layer
      const chordsFreq = filterFreq * 2.5 // Increased multiplier
      this.ambientFilters.chords.frequency.linearRampToValueAtTime(
        Math.min(8000, Math.max(100, chordsFreq)), // Much wider range
        Tone.context.currentTime + 0.05 // Faster transition
      )
      this.ambientFilters.chords.Q.setValueAtTime(filterQ * 2, Tone.context.currentTime) // Stronger Q
      console.log(`🎛️ Chords filter: ${Math.min(8000, Math.max(100, chordsFreq)).toFixed(1)}Hz, Q=${(filterQ * 2).toFixed(2)}`)
    }

    if (this.ambientFilters.pad) {
      // Moderate modulation on pad layer
      const padFreq = filterFreq * 1.8 // Increased multiplier
      this.ambientFilters.pad.frequency.linearRampToValueAtTime(
        Math.min(4000, Math.max(100, padFreq)), // Wider range
        Tone.context.currentTime + 0.08 // Faster transition
      )
      this.ambientFilters.pad.Q.setValueAtTime(filterQ * 1.5, Tone.context.currentTime) // Stronger Q
      console.log(`🎛️ Pad filter: ${Math.min(4000, Math.max(100, padFreq)).toFixed(1)}Hz, Q=${(filterQ * 1.5).toFixed(2)}`)
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
   * FIX: Added validation to prevent null returns and implemented three-tier modulation
   */
  mapGestureToFilter(sonicParams) {
    const tier = sonicParams.tier || 'local'

    if (tier === 'local') {
      // LOCAL MODULATION: Y controls cutoff, X controls resonance
      const y = sonicParams.y || 0.5
      const x = sonicParams.x || 0.5

      const cutoff = 200 + ((1 - y) * 3800) // 200Hz to 4000Hz, inverted Y axis
      const resonance = 0.5 + (x * 4.5) // 0.5 to 5.0 Q range

      console.log(`🎛️ Local filter modulation: Y=${y.toFixed(2)}→cutoff=${cutoff.toFixed(1)}Hz, X=${x.toFixed(2)}→resonance=${resonance.toFixed(2)}`)

      return {
        cutoffFrequency: cutoff,
        resonance: resonance,
        tremoloAmount: 0 // No tremolo for local modulation
      }
    } else if (tier === 'remote') {
      // REMOTE MODULATION: X = LFO speed, Y = LFO amplitude that modulates cutoff frequency
      const y = sonicParams.y || 0.5
      const x = sonicParams.x || 0.5

      // X controls LFO speed (0.05Hz to 10Hz)
      const lfoSpeed = 0.05 + (x * 9.95) // 0.05Hz to 10Hz

      // Y controls LFO amplitude (0% to 100% modulation depth)
      const lfoAmplitude = y // 0.0 to 1.0 (0% to 100%)

      console.log(`🎛️ Remote LFO modulation: X=${x.toFixed(2)}→speed=${lfoSpeed.toFixed(2)}Hz, Y=${y.toFixed(2)}→amplitude=${(lfoAmplitude * 100).toFixed(0)}%`)

      return {
        lfoSpeed: lfoSpeed,
        lfoAmplitude: lfoAmplitude,
        isRemoteLFO: true
      }
    } else {
      // Background/default modulation (no tremolo)
      const movement = sonicParams?.z ?? sonicParams?.movement ?? sonicParams?.y ?? 0.5
      const validMovement = typeof movement === 'number' && !isNaN(movement) ? movement : 0.5
      const clampedMovement = Math.max(0, Math.min(1, validMovement))

      const filterFreq = 200 + (clampedMovement * 2000) // 200Hz to 2200Hz filter range
      console.log(`🎛️ Background filter modulation: movement=${validMovement} → freq=${filterFreq.toFixed(1)}Hz`)

      return {
        cutoffFrequency: filterFreq,
        resonance: 1.0, // Default resonance for background
        tremoloAmount: 0 // No tremolo for background
      }
    }
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
      // Handle both frontend format (pitch, velocity, duration) and backend format (properties.frequency, properties.duration)
      let pitch, velocity, duration, articulation, frequency

      if (musicalEvent.properties) {
        // Backend format - use properties directly
        frequency = musicalEvent.properties.frequency
        duration = musicalEvent.properties.duration
        velocity = musicalEvent.properties.velocity || 50
        articulation = musicalEvent.properties.articulation || 'default'

        // TAP PITCH DEBUG: Log for tap events
        if (musicalEvent.properties.noteIndex === 0 && musicalEvent.properties.totalNotes === 1) {
          console.log('🎯 TAP RECEIVED IN FRONTEND:', {
            userId: musicalEvent.userId?.substring(0, 8),
            pitch: musicalEvent.properties.pitch,
            frequency: frequency?.toFixed(1),
            position: musicalEvent.position
          })
        }

        console.log('🎵 Playing backend musical event:', {
          frequency: frequency?.toFixed(1),
          duration,
          velocity,
          noteIndex: musicalEvent.properties.noteIndex,
          totalNotes: musicalEvent.properties.totalNotes
        })
      } else {
        // Frontend format
        pitch = musicalEvent.pitch
        velocity = musicalEvent.velocity
        duration = musicalEvent.duration
        articulation = musicalEvent.articulation

        if (pitch === undefined || velocity === undefined || duration === undefined) {
          console.warn('🔇 Invalid musical event data:', { pitch, velocity, duration, articulation })
          return
        }

        // Convert MIDI pitch to frequency
        frequency = this.midiNoteToFrequency(pitch)
      }

      // FIX: Convert Tone.js duration notation to seconds
      let normalizedDuration = duration
      if (typeof duration === 'string') {
        // Manual conversion of Tone.js notation to seconds (120 BPM)
        // More reliable than Tone.Time() which requires Transport context
        const durationMap = {
          '32n': 0.0625,  // 1/32 note at 120 BPM
          '16n': 0.125,   // 1/16 note at 120 BPM
          '8n': 0.25,     // 1/8 note at 120 BPM
          '4n': 0.5,      // 1/4 note at 120 BPM
          '2n': 1.0,      // 1/2 note at 120 BPM
          '1n': 2.0       // whole note at 120 BPM
        }

        normalizedDuration = durationMap[duration] || 0.125

        console.log('🎵 Duration conversion:', {
          input: duration,
          output: normalizedDuration,
          articulation: articulation
        })
      } else if (typeof duration === 'number') {
        // Convert beats to seconds if duration is in beats
        if (duration < 10) {
          normalizedDuration = duration * 0.25 // Assume quarter note = 0.25s at 60 BPM
        }

        // Clamp to reasonable range
        normalizedDuration = Math.max(0.05, Math.min(4.0, normalizedDuration))
      }

      // Apply velocity normalization (articulation affects only envelope, not duration)
      let adjustedDuration = normalizedDuration
      let adjustedVelocity

      // Handle different velocity ranges for backend vs frontend format
      if (musicalEvent.properties) {
        // Backend format: velocity is typically 0-100, normalize to 0-1
        adjustedVelocity = Math.max(0.1, Math.min(1.0, (velocity || 50) / 100))
      } else {
        // Frontend format: velocity is MIDI 0-127
        adjustedVelocity = Math.max(0.1, Math.min(1.0, velocity / 127))
      }

      // Duration already determined by velocity in frontend (32n/16n/8n)
      // Only apply velocity boost for accents
      if (articulation === 'marcato') {
        adjustedVelocity *= 1.2 // Slightly louder for accented notes
      }

      // Final duration clamping
      adjustedDuration = Math.max(0.02, Math.min(3.0, adjustedDuration))

      // Calculate timing for Tone.js
      let playTime = Tone.now()
      let delay = 0

      if (musicalEvent.timestamp) {
        delay = Math.max(0, (musicalEvent.timestamp - Date.now()) / 1000)
        playTime = Tone.now() + delay
      }

      // CRITICAL FIX: Use ONLY setTimeout (no Transport.schedule)
      // Transport.schedule has race conditions with cancel()

      // Calculate delay in milliseconds
      const delayMs = delay * 1000

      // Schedule attack with setTimeout
      const attackTimeoutId = setTimeout(() => {
        if (!this.gestureSynth || this.gestureSynth.disposed) {
          console.warn('🔇 Synth disposed, skipping note')
          return
        }

        try {
          // CRITICAL: Configure oscillator and envelope based on note type and articulation
          // Remote streaming notes use square wave for differentiation
          const isStreamed = musicalEvent.properties?.isStreamed

          // Configure envelope based on articulation
          // Envelopes are proportional to note duration for better musicality
          let envelope
          switch (articulation) {
            case 'staccato':
              // Fast: short, articulated notes (50% of duration)
              envelope = {
                attack: 0.005,
                decay: adjustedDuration * 0.2,
                sustain: 0.3,
                release: adjustedDuration * 0.3
              }
              break
            case 'marcato':
              // Medium: accented notes (70% of duration)
              envelope = {
                attack: 0.01,
                decay: adjustedDuration * 0.3,
                sustain: 0.5,
                release: adjustedDuration * 0.4
              }
              break
            case 'legato':
              // Slow: smooth, connected notes (95% of duration)
              envelope = {
                attack: adjustedDuration * 0.1,
                decay: adjustedDuration * 0.2,
                sustain: 0.7,
                release: adjustedDuration * 0.7
              }
              break
            default:
              // Fallback
              envelope = {
                attack: 0.005,
                decay: 0.02,
                sustain: 0.1,
                release: 0.05
              }
          }

          if (isStreamed) {
            this.gestureSynth.set({
              oscillator: {
                type: 'square' // Square wave for remote notes
              },
              envelope
            })
          } else {
            // Local notes use sawtooth (default)
            this.gestureSynth.set({
              oscillator: {
                type: 'sawtooth' // Sawtooth for local notes
              },
              envelope
            })
          }

          // Use triggerAttackRelease for accurate duration control
          this.gestureSynth.triggerAttackRelease(
            frequency,
            adjustedDuration,  // Tone.js handles duration in seconds
            Tone.now(),
            adjustedVelocity
          )

          console.log('🎶 Note played:', {
            frequency: frequency.toFixed(1),
            duration: adjustedDuration.toFixed(3),
            velocity: adjustedVelocity.toFixed(2),
            articulation: articulation
          })
        } catch (e) {
          console.warn('Note play error:', e.message)
        }
      }, delayMs)

      // Store for cleanup
      if (!this.scheduledTimeouts) this.scheduledTimeouts = []
      this.scheduledTimeouts.push(attackTimeoutId)

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

    // Trigger immediate background evolution for ANY user influence to show response
    if (state.userInfluence > 0.2) {
      this.triggerImmediateBackgroundEvolution()
      console.log(`🎵 Triggered background evolution due to user input (influence: ${state.userInfluence.toFixed(2)})`)
    }

    // Also trigger immediate filter response to show background is reacting
    this.triggerBackgroundFilterResponse(frequency, duration)
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

    // Background layers now evolve automatically through playLayer() composition loop
    // No need to trigger immediate regeneration
    console.log(`🎵 User influence applied to generative state`)
  }

  /**
   * Trigger immediate background filter response to user input
   * @param {number} frequency - User input frequency
   * @param {number} duration - User input duration
   */
  triggerBackgroundFilterResponse(frequency, duration) {
    if (!this.ambientFilters || !Tone.context) return

    console.log(`🎛️ Triggering background filter response: ${frequency.toFixed(1)}Hz, ${duration.toFixed(3)}s`)

    // Calculate filter modulation based on user input
    const normalizedFreq = Math.max(100, Math.min(8000, frequency))
    const modulationIntensity = Math.min(1.0, duration * 2) // Longer notes = stronger modulation

    // Apply immediate filter changes to show background response
    if (this.ambientFilters.bass) {
      const bassFreq = normalizedFreq * 0.3
      this.ambientFilters.bass.frequency.linearRampToValueAtTime(
        Math.max(50, Math.min(500, bassFreq)),
        Tone.context.currentTime + 0.2
      )
      this.ambientFilters.bass.Q.linearRampToValueAtTime(
        1 + modulationIntensity * 3,
        Tone.context.currentTime + 0.2
      )
      console.log(`🎛️ Bass filter response: ${Math.max(50, Math.min(500, bassFreq)).toFixed(1)}Hz`)
    }

    if (this.ambientFilters.pad) {
      const padFreq = normalizedFreq * 0.8
      this.ambientFilters.pad.frequency.linearRampToValueAtTime(
        Math.max(150, Math.min(2000, padFreq)),
        Tone.context.currentTime + 0.15
      )
      this.ambientFilters.pad.Q.linearRampToValueAtTime(
        2 + modulationIntensity * 4,
        Tone.context.currentTime + 0.15
      )
      console.log(`🎛️ Pad filter response: ${Math.max(150, Math.min(2000, padFreq)).toFixed(1)}Hz`)
    }

    if (this.ambientFilters.chords) {
      const chordsFreq = normalizedFreq * 1.5
      this.ambientFilters.chords.frequency.linearRampToValueAtTime(
        Math.max(200, Math.min(4000, chordsFreq)),
        Tone.context.currentTime + 0.1
      )
      this.ambientFilters.chords.Q.linearRampToValueAtTime(
        3 + modulationIntensity * 5,
        Tone.context.currentTime + 0.1
      )
      console.log(`🎛️ Chords filter response: ${Math.max(200, Math.min(4000, chordsFreq)).toFixed(1)}Hz`)
    }
  }

  
  /**
   * Setup remote LFO for filter cutoff modulation
   * @param {number} speed - LFO frequency in Hz (0.1 to 10Hz)
   * @param {number} amplitude - LFO amplitude (0.0 to 1.0)
   */
  setupRemoteFilterLFO(speed, amplitude) {
    // DISABLED: All remote filter LFO functionality removed
    console.log('🛑 setupRemoteFilterLFO DISABLED')
    return

    if (amplitude === 0) {
      // No amplitude, no LFO
      this.remoteFilterLFO = null
      console.log('🛑 Remote filter LFO disabled (amplitude = 0)')
      return
    }

    // Apply dynamic scaling based on number of active users
    const userCount = this.activeRemoteUsers.size || 1 // At least 1
    const scalingMultiplier = this.calculateModulationScaling(userCount)

    // Scale up amplitude for fewer users
    const scaledAmplitude = Math.min(1.0, amplitude * scalingMultiplier)

    // Scale speed slightly for more dramatic effect with fewer users
    const scaledSpeed = speed * (1 + (scalingMultiplier - 1) * 0.5)

    console.log(`👥 User scaling: ${userCount} users, multiplier=${scalingMultiplier.toFixed(2)}, amp=${(amplitude * 100).toFixed(0)}%→${(scaledAmplitude * 100).toFixed(0)}%`)

    // Create new LFO for filter modulation with scaled parameters
    // Use higher base frequency offset for more dramatic effect
    const baseFreq = 1000 // 1kHz base frequency
    const modulationDepth = baseFreq * scaledAmplitude // Modulate ± this amount

    // Ensure minimum frequency doesn't go below 50Hz to prevent audio artifacts
    const minFreq = Math.max(50, baseFreq - modulationDepth)
    const maxFreq = baseFreq + modulationDepth

    this.remoteFilterLFO = new Tone.LFO(scaledSpeed, minFreq, maxFreq).start()

    // Connect LFO to all target filters with direct frequency control
    this.connectLFOToFiltersDirect()

    console.log(`🌊 Remote filter LFO: speed=${scaledSpeed.toFixed(2)}Hz, range=${(baseFreq - modulationDepth).toFixed(0)}-${(baseFreq + modulationDepth).toFixed(0)}Hz, users=${userCount}`)

    // Debug: test LFO output briefly
    setTimeout(() => {
      if (this.remoteFilterLFO) {
        console.log('✅ Remote LFO is running and should be modulating filters')
      } else {
        console.warn('⚠️ Remote LFO disappeared unexpectedly')
      }
    }, 1000)
  }

  /**
   * Calculate modulation scaling based on user count
   * @param {number} userCount - Number of active users
   * @returns {number} Scaling multiplier
   */
  calculateModulationScaling(userCount) {
    if (userCount === 1) {
      return 3.0 // 3x amplitude for single user
    } else if (userCount === 2) {
      return 2.0 // 2x amplitude for 2 users
    } else if (userCount <= 4) {
      return 1.5 // 1.5x amplitude for 3-4 users
    } else if (userCount <= 8) {
      return 1.2 // 1.2x amplitude for 5-8 users
    } else {
      return 1.0 // No scaling for 9+ users
    }
  }

  /**
   * Update active remote users tracking
   * @param {string} userId - User ID to track
   * @param {boolean} isActive - Whether user is active
   */
  updateActiveRemoteUser(userId, isActive = true) {
    if (isActive) {
      this.activeRemoteUsers.add(userId)
      this.lastUserCountUpdate = Date.now()
    } else {
      this.activeRemoteUsers.delete(userId)
    }

    // Clean up old users (remove inactive users after 10 seconds)
    const now = Date.now()
    if (now - this.lastUserCountUpdate > 10000) {
      // Could implement cleanup logic here if needed
      this.lastUserCountUpdate = now
    }

    console.log(`👥 Active remote users: ${this.activeRemoteUsers.size}`)
  }

  /**
   * Connect LFO directly to all relevant filters (bypassing gain nodes)
   */
  connectLFOToFiltersDirect() {
    if (!this.remoteFilterLFO) return

    // Clear existing connections
    this.remoteLFOTargetFilters.clear()

    // Connect directly to gesture filter frequency
    if (this.gestureFilter && this.gestureFilter.frequency) {
      this.remoteFilterLFO.connect(this.gestureFilter.frequency)
      this.remoteLFOTargetFilters.add('gestureFilter')
      console.log('🔗 Remote LFO connected directly to gesture filter')
    }

    // Connect directly to ambient filter frequencies
    if (this.ambientFilters) {
      Object.keys(this.ambientFilters).forEach(layerName => {
        const filter = this.ambientFilters[layerName]
        if (filter && filter.frequency) {
          this.remoteFilterLFO.connect(filter.frequency)
          this.remoteLFOTargetFilters.add(layerName)
        }
      })
      console.log(`🔗 Remote LFO connected directly to ${Object.keys(this.ambientFilters).length} ambient filters`)
    }

    console.log(`🔗 Remote LFO directly connected to ${this.remoteLFOTargetFilters.size} total filters`)
  }

  /**
   * Connect LFO to all relevant filters 
   */
  connectLFOToFilters() {
    if (!this.remoteFilterLFO) return

    // Connect to gesture filter
    if (this.gestureFilter) {
      // Create a signal for the LFO modulation
      const lfoGain = new Tone.Gain(1).connect(this.gestureFilter.frequency)
      this.remoteFilterLFO.connect(lfoGain)
      this.remoteLFOTargetFilters.add(lfoGain)
    }

    // Connect to ambient filters
    if (this.ambientFilters) {
      Object.keys(this.ambientFilters).forEach(layerName => {
        const filter = this.ambientFilters[layerName]
        if (filter && filter.frequency) {
          const lfoGain = new Tone.Gain(1).connect(filter.frequency)
          this.remoteFilterLFO.connect(lfoGain)
          this.remoteLFOTargetFilters.add(lfoGain)
        }
      })
    }

    console.log(`🔗 Remote LFO connected to ${this.remoteLFOTargetFilters.size} filters`)
  }

  /**
   * Stop remote filter LFO
   */
  stopRemoteFilterLFO() {
    // DISABLED: All remote filter LFO functionality removed
    console.log('🛑 stopRemoteFilterLFO DISABLED')
    return

    // For direct connections, we just clear the tracking
    // Tone.js handles disconnection automatically when the LFO is disposed
    this.remoteLFOTargetFilters.clear()

    console.log('🛑 Remote filter LFO stopped and disconnected')
  }

  /**
   * Apply tremolo effect to gesture synth for remote modulation high range
   * @param {number} amount - Tremolo amount (0-1)
   * @param {number} currentTime - Current audio context time
   */
  applyTremolo(amount, currentTime = Tone.now()) {
    // DISABLED: All tremolo functionality removed
    console.log('🛑 applyTremolo DISABLED')
    return

    if (!this.gestureSynth || amount <= 0) return

    // Create tremolo using volume modulation
    const tremoloRate = 4 + amount * 8 // 4Hz to 12Hz based on amount
    const tremoloDepth = amount * 0.6 // Max 60% depth for musical effect

    // We'll use a simple LFO on the volume parameter
    if (!this.tremoloLFO) {
      this.tremoloLFO = new Tone.LFO(tremoloRate, 1 - tremoloDepth, 1).start()
      this.tremoloLFO.connect(this.gestureSynth.volume)
    } else {
      // Stop existing LFO and create new one with updated parameters
      this.tremoloLFO.stop()
      this.tremoloLFO.dispose()
      this.tremoloLFO = new Tone.LFO(tremoloRate, 1 - tremoloDepth, 1).start()
      this.tremoloLFO.connect(this.gestureSynth.volume)
    }

    console.log(`🎛️ Applied tremolo: rate=${tremoloRate.toFixed(1)}Hz, depth=${(tremoloDepth * 100).toFixed(1)}%`)
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
      filter.frequency.linearRampToValueAtTime(5000, endTime)

      console.log(`🧪 ${layerName} filter sweep: 100Hz → 5000Hz over 2 seconds`)
    })

    // Also sweep the gesture filter
    if (this.gestureFilter) {
      this.gestureFilter.frequency.setValueAtTime(100, startTime)
      this.gestureFilter.frequency.linearRampToValueAtTime(8000, endTime)
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
          case 'pad':
            notes = [state.currentTonic * 1.25, state.currentTonic * 1.5] // Third and fifth above
            break
          case 'chords':
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
    // Delegate to VolumeController (Sprint 2 refactoring)
    this.volumeController.setMuted(muted)

    // Update deprecated state for backward compatibility
    this.muted = this.volumeController.isMuted()
  }

  /**
   * Set volume level (FR-011)
   * Controls master volume node in real-time
   * @param {number} volume - Volume level (0-1)
   */
  setVolume(volume) {
    // Delegate to VolumeController (Sprint 2 refactoring)
    this.volumeController.setVolume(volume)

    // Update deprecated state for backward compatibility
    this.volume = this.volumeController.getVolume()
  }

  /**
   * Get current mute state
   * @returns {boolean} True if muted
   */
  isMuted() {
    // Delegate to VolumeController (Sprint 2 refactoring)
    return this.volumeController.isMuted()
  }

  /**
   * Get current volume level
   * @returns {number} Volume (0-1)
   */
  getVolume() {
    // Delegate to VolumeController (Sprint 2 refactoring)
    return this.volumeController.getVolume()
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
   * Initialize new musical architecture components
   */
  initializeNewMusicalArchitecture() {
    try {
      // Check if global classes are available
      if (typeof window.MusicalScheduler === 'undefined') {
        console.warn('⚠️ MusicalScheduler not available - musical timing features disabled');
        return;
      }

      if (typeof window.LFOManager === 'undefined') {
        console.warn('⚠️ LFOManager not available - modulation features disabled');
        return;
      }

      // Initialize Musical Scheduler
      this.musicalScheduler = new window.MusicalScheduler();

      // Initialize LFO Manager with audio context
      this.lfoManager = new window.LFOManager(this);

      // Start Musical Scheduler
      this.musicalScheduler.start();

      // Setup event listeners for cross-service communication
      this.setupMusicalArchitectureEvents();

      console.log('🎵 New musical architecture initialized - MusicalScheduler and LFOManager active');
    } catch (error) {
      console.error('🔴 Failed to initialize new musical architecture:', error);
    }
  }

  /**
   * Setup cross-service event communication
   */
  setupMusicalArchitectureEvents() {
    // Musical Scheduler events
    this.musicalScheduler.on('tick', (data) => {
      // Use musical timing for precise parameter updates
      this.onMusicalTick(data);
    });

    this.musicalScheduler.on('beat', (data) => {
      // Trigger beat-synchronized effects
      this.onMusicalBeat(data);
    });

    // LFO Manager events
    this.lfoManager.on('lfo:remote-sync', (data) => {
      // Handle remote LFO synchronization
      this.onRemoteLFOSync(data);
    });
  }

  /**
   * Handle musical timing ticks
   */
  onMusicalTick(data) {
    // Update timing-sensitive parameters on musical boundaries
    if (data.sixteenth === 0) {
      // Reset or evolve parameters on beat boundaries
      this.evolveParametersOnBeat(data);
    }
  }

  /**
   * Handle musical beats
   */
  onMusicalBeat(data) {
    // Trigger beat-synchronized audio events
    if (this.isInitialized && !this.muted) {
      // Add subtle emphasis on downbeats
      if (data.beat === 0) {
        this.addDownbeatEmphasis();
      }
    }
  }

  /**
   * Handle remote LFO synchronization
   */
  onRemoteLFOSync(data) {
    // Apply remote modulation effects
    this.applyRemoteModulation(data);
  }

  /**
   * Evolve parameters on musical beat boundaries
   */
  evolveParametersOnBeat(data) {
    // Slowly evolve background parameters
    if (this.generativeState) {
      // Evolve ambient parameters slightly on each beat
      this.evolveAmbientParameters(data.beat, data.bar);
    }
  }

  /**
   * Add subtle emphasis on downbeats
   */
  addDownbeatEmphasis() {
    // Add very subtle filter sweep or volume emphasis on downbeats
    if (this.masterVolume && this.masterVolume.gain) {
      const currentGain = this.masterVolume.gain.value;
      this.masterVolume.gain.rampTo(currentGain * 1.05, 0.05);
      setTimeout(() => {
        this.masterVolume.gain.rampTo(currentGain, 0.05);
      }, 50);
    }
  }

  /**
   * Apply remote modulation from LFOManager
   */
  applyRemoteModulation(data) {
    // Apply modulation to appropriate audio parameters
    if (data.data.modulation && this.isInitialized) {
      const { target, amount } = data.data.modulation;

      switch (target) {
        case 'filter':
          this.applyRemoteFilterModulation(amount);
          break;
        case 'volume':
          this.applyRemoteVolumeModulation(amount);
          break;
        case 'pan':
          this.applyRemotePanModulation(amount);
          break;
      }
    }
  }

  /**
   * Schedule a musical event with clock-consistent timing
   */
  scheduleMusicalEvent(callback, data, isRemote = false, timestamp = null) {
    if (!this.musicalScheduler) {
      // Fallback to direct execution if scheduler not available
      callback(data);
      return;
    }

    if (isRemote) {
      return this.musicalScheduler.scheduleRemoteEvent(callback, data, timestamp);
    } else {
      return this.musicalScheduler.scheduleLocalEvent(callback, data);
    }
  }

  /**
   * Handle hover start with LFO integration
   */
  handleHoverStart(gestureData, targetInstrument = 'filter') {
    if (!this.lfoManager) return null;

    // Create LFO based on hover gesture
    const lfoId = this.lfoManager.handleLocalHoverStart(gestureData, targetInstrument);

    console.log(`🎛️ Hover start - LFO created: ${lfoId}`);
    return lfoId;
  }

  /**
   * Handle hover update with LFO integration
   */
  handleHoverUpdate(gestureData, lfoId) {
    if (!this.lfoManager || !lfoId) return;

    this.lfoManager.handleLocalHoverUpdate(gestureData, lfoId);
  }

  /**
   * Handle hover end with LFO cleanup
   */
  handleHoverEnd(gestureData) {
    if (!this.lfoManager) return;

    const sourceId = `local_${gestureData.gestureId}`;
    this.lfoManager.handleLocalHoverEnd(sourceId);
  }

  /**
   * Process remote hover data for synchronized LFOs
   */
  processRemoteHoverData(remoteData) {
    if (!this.lfoManager) return;

    this.lfoManager.handleRemoteHoverData(remoteData);
  }

  /**
   * Create ambient global LFO
   */
  createAmbientLFO(config = {}) {
    if (!this.lfoManager) return null;

    return this.lfoManager.createGlobalLFO({
      ...config,
      target: config.target || 'filter',
      name: config.name || 'ambient'
    });
  }

  /**
   * Get musical timing status
   */
  getMusicalTimingStatus() {
    return {
      scheduler: this.musicalScheduler ? this.musicalScheduler.getStatus() : null,
      lfoManager: this.lfoManager ? this.lfoManager.getStatus() : null,
      isInitialized: !!(this.musicalScheduler && this.lfoManager)
    };
  }

  /**
   * Apply remote filter modulation
   */
  applyRemoteFilterModulation(amount) {
    if (this.gestureFilter && this.gestureFilter.frequency) {
      const currentFreq = this.gestureFilter.frequency.value;
      const modulationRange = currentFreq * 0.3; // 30% modulation range
      const newFreq = currentFreq + (amount * modulationRange);
      this.gestureFilter.frequency.rampTo(newFreq, 0.1);
    }
  }

  /**
   * Apply remote volume modulation
   */
  applyRemoteVolumeModulation(amount) {
    if (this.masterVolume && this.masterVolume.gain) {
      const currentVolume = this.masterVolume.gain.value;
      const modulationRange = currentVolume * 0.2; // 20% modulation range
      const newVolume = Math.max(0.1, currentVolume + (amount * modulationRange));
      this.masterVolume.gain.rampTo(newVolume, 0.05);
    }
  }

  /**
   * Apply remote pan modulation
   */
  applyRemotePanModulation(amount) {
    if (this.gestureSynth && this.gestureSynth.pan) {
      this.gestureSynth.pan.rampTo(amount, 0.1);
    }
  }

  /**
   * Evolve ambient parameters on beat boundaries
   */
  evolveAmbientParameters(beat, bar) {
    if (this.ambientFilters && this.ambientFilters.length > 0) {
      // Slowly evolve filter frequencies
      this.ambientFilters.forEach((filter, index) => {
        if (filter && filter.frequency) {
          const currentFreq = filter.frequency.value;
          const evolution = Math.sin((bar + beat + index) * 0.1) * 50;
          filter.frequency.rampTo(currentFreq + evolution, 0.5);
        }
      });
    }
  }

  /**
   * Perform parameter update for current frame
   */
  performParameterUpdate() {
    // DISABILITATO: Update loop potrebbe causare tremoli non necessari
    // if (!this.audioEngine || this.gestureBuffer.length === 0) return
    return // Completamente disabilitato per prevenire tremoli

    /*
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
    */
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
   * Apply filter modulation with proper validation
   * @param {Object} filterParams - Filter modulation parameters
   */
  applyFilterModulation(filterParams) {
    try {
      // Reduce console log frequency to prevent spam
      const now = Date.now()
      if (now - (this.lastFilterLogTime || 0) > 1000) {
        console.log('🎛️ Applying filter modulation:', filterParams)
        this.lastFilterLogTime = now
      }

      // Validate Tone context is ready
      if (!Tone.context || !Tone.context.currentTime) {
        console.warn('🔇 Tone context not ready for filter modulation')
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
            } else if (layerName === 'pad') {
              targetFrequency = Math.max(150, Math.min(2000, cutoffFrequency * 0.8)) // Pad range
            } else if (layerName === 'chords') {
              targetFrequency = Math.max(200, Math.min(4000, cutoffFrequency * 1.5)) // Chords range
            }

            // Use smooth transitions instead of immediate changes to prevent audio artifacts
            const rampTime = 0.1 // 100ms smooth transition
            filter.frequency.linearRampToValueAtTime(targetFrequency, Tone.context.currentTime + rampTime)

            // Apply resonance if available with smooth transition
            if (filter.Q && resonance && typeof filter.Q.linearRampToValueAtTime === 'function') {
              let resonanceValue = resonance
              if (layerName === 'bass') {
                resonanceValue = resonance * 1.5 // Subtle bass resonance
              } else if (layerName === 'pad') {
                resonanceValue = resonance * 2 // Moderate pad resonance
              } else if (layerName === 'chords') {
                resonanceValue = resonance * 2.5 // Strong chords resonance
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
   * Play note with three-tier architecture support
   * @param {number} frequency - Note frequency in Hz
   * @param {string} tier - Which tier to play on ('background', 'remote', 'local')
   * @param {number} velocity - Gesture velocity for expressive control
   * @param {Object} options - Additional note options
   */
  playThreeTierNote(frequency, tier = 'local', velocity = 200, options = {}) {
    if (!this.isInitialized || !this.gestureSynth) return

    const tierConfig = this.threeTierConfig[tier]
    if (!tierConfig) {
      console.warn(`Unknown tier: ${tier}, falling back to local`)
      return this.playNote(frequency, options)
    }

    // Calculate frequency based on tier and velocity
    const adjustedFrequency = this.calculateThreeTierFrequency(frequency, tier, velocity)
    const adjustedVolume = this.calculateThreeTierVolume(tier, options.volume || 0.5)
    const adjustedDuration = this.calculateThreeTierDuration(velocity, options.duration || '8n')

    console.log(`🎵 Playing ${tierConfig.waveform} note on ${tier} tier: ${adjustedFrequency}Hz, velocity: ${velocity}`)

    // CRITICAL DEBUG: Stack trace to identify where this call comes from
    console.trace('🔍 Stack trace for playThreeTierNote call:')

    // Configure synth with tier-specific waveform
    this.gestureSynth.set({
      oscillator: { type: tierConfig.waveform },
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.3 }
    })

    // Play note with tier-specific parameters
    console.log('🔍 About to trigger single note:', adjustedFrequency.toFixed(1) + 'Hz, tier:', tier)
    this.gestureSynth.triggerAttackRelease(
      adjustedFrequency,
      adjustedDuration,
      undefined,
      adjustedVolume
    )
    console.log('🔍 Note triggered successfully')
  }

  /**
   * Calculate frequency for three-tier architecture
   */
  calculateThreeTierFrequency(baseFrequency, tier, velocity) {
    const tierConfig = this.threeTierConfig[tier]

    // Base frequency adjustment for tier
    const tierFrequency = tierConfig.baseFrequency

    // Velocity-based exponential mapping
    let velocityMultiplier = 1
    if (velocity < 150) {
      // Slow drags: lower frequency range
      velocityMultiplier = 0.5 + (velocity / 150) * 0.3
    } else if (velocity < 400) {
      // Medium drags: mid frequency range
      velocityMultiplier = 0.8 + ((velocity - 150) / 250) * 0.4
    } else {
      // Fast drags: higher frequency range
      velocityMultiplier = 1.2 + Math.min((velocity - 400) / 400, 0.8)
    }

    return tierFrequency * velocityMultiplier
  }

  /**
   * Calculate volume for three-tier architecture
   */
  calculateThreeTierVolume(tier, baseVolume) {
    const tierConfig = this.threeTierConfig[tier]
    return baseVolume * tierConfig.volumeMultiplier * this.volume
  }

  /**
   * Calculate duration for three-tier architecture based on velocity
   */
  calculateThreeTierDuration(velocity, baseDuration) {
    let durationMultiplier = 1

    if (velocity < 150) {
      // Slow drags: longer notes (0.5-2.0s)
      durationMultiplier = 2 + Math.random() * 2
    } else if (velocity < 400) {
      // Medium drags: medium notes (0.2-0.5s)
      durationMultiplier = 0.2 + Math.random() * 0.3
    } else {
      // Fast drags: shorter notes (0.05-0.2s)
      durationMultiplier = 0.05 + Math.random() * 0.15
    }

    // Apply to base duration
    const baseMs = this.parseDuration(baseDuration) || 500
    return (baseMs * durationMultiplier) / 1000 // Convert to seconds
  }

  /**
   * Parse duration string to milliseconds
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
   * Handle gesture with three-tier velocity mapping
   */
  handleThreeTierGesture(gestureData) {
    if (!gestureData) return

    // Determine tier based on gesture context
    let tier = 'local' // default
    if (gestureData.isRemote) {
      tier = 'remote'
    } else if (gestureData.isBackground) {
      tier = 'background'
    }

    // Apply hysteresis for tier switching
    if (this.currentParameters.velocity !== undefined) {
      const velocityDiff = Math.abs(gestureData.velocity - this.currentParameters.velocity)
      const hysteresisRatio = velocityDiff / this.currentParameters.velocity

      if (hysteresisRatio < this.currentParameters.hysteresisThreshold) {
        // Stay in current tier
        tier = this.currentParameters.tier
      }
    }

    // Update current parameters
    this.currentParameters.tier = tier
    this.currentParameters.velocity = gestureData.velocity

    // Calculate frequency based on gesture position
    const baseFreq = this.parameterMappings.frequency.range[0] +
                      (gestureData.position?.y || 0.5) *
                      (this.parameterMappings.frequency.range[1] - this.parameterMappings.frequency.range[0])

    // Play three-tier note
    this.playThreeTierNote(baseFreq, tier, gestureData.velocity, {
      volume: gestureData.intensity || 0.5
    })

    console.log(`🎹 Three-tier gesture: tier=${tier}, velocity=${gestureData.velocity}, freq=${baseFreq}`)
  }

  /**
   * Cross-layer hover modulation for three-tier architecture
   * @param {Object} hoverData - Hover position and context
   */
  applyCrossLayerHoverModulation(hoverData) {
    if (!hoverData) return

    const { position, userId, intensity = 0.5 } = hoverData || {}

    // Validate position and userId to prevent undefined errors
    if (!position || (position.x === null || position.y === null)) {
      console.warn('🔇 Hover data missing or invalid position, skipping modulation')
      return
    }

    // Log full hover data for debugging
    console.log('🎛️ HOVER DATA DEBUG:', {
      position,
      userId,
      intensity,
      hasValidPosition: !!(position.x == null || position.y == null),
      hasValidUserId: !!userId,
      source: 'handleHoverModulation call',
      isInitialized: this.isInitialized
    })

    // Log full hover data for debugging
    console.log('🎛️ HOVER DATA DEBUG:', {
      position,
      userId,
      intensity,
      hasValidPosition: !!(position.x == null || position.y == null),
      hasValidUserId: !!userId,
      source: 'handleHoverModulation call',
      isInitialized: this.isInitialized
    })
    console.log(`🎛️ Cross-layer hover modulation: userId=${userId}, intensity=${intensity}`)

    // Local user hover modulates:
    // 1. Background filters (low-mid frequency range)
    // 2. Remote gesture filters (mid-high frequency range)
    if (!userId || userId === this.currentUserId) {
      console.log('🎛️ LOCAL HOVER: Calling modulateBackgroundFilters and modulateRemoteGestureFilters')
      this.modulateBackgroundFilters(position, intensity * 0.7)
      this.modulateRemoteGestureFilters(position, intensity * 0.5)
    } else {
      console.log('🎛️ REMOTE HOVER: Calling modulateLocalGestureFilters')
    }

    // Remote user hover modulates:
    // Only local gesture filters (high frequency range)
    if (userId && userId !== this.currentUserId) {
      this.modulateLocalGestureFilters(position, intensity * 0.8)
    }
  }

  /**
   * Modulate background filters (low-mid frequency range)
   */
  modulateBackgroundFilters(position, intensity) {
    if (!this.ambientFilters || !Tone.context) return

    // Bass layer: 100-400Hz range
    const bassFilter = this.ambientFilters.bass
    const baseFreq = 250
    const modFreq = baseFreq + (position.y || 0.5) * 150 * intensity

    bassFilter.frequency.linearRampToValueAtTime(
      modFreq,
      Tone.context.currentTime + 0.1
    )

    bassFilter.Q.linearRampToValueAtTime(
      2 + intensity * 3,
      Tone.context.currentTime + 0.1
    )
  }

  /**
   * Modulate remote gesture filters (mid-high frequency range)
   */
  modulateRemoteGestureFilters(position, intensity) {
    if (!this.ambientFilters || !Tone.context) return

    // Pad layer: 400-1200Hz range
    const padFilter = this.ambientFilters.pad
    if (!padFilter) return

    const baseFreq = 800
    const modFreq = baseFreq + (position.x || 0.5) * 400 * intensity

    padFilter.frequency.linearRampToValueAtTime(
      modFreq,
      Tone.context.currentTime + 0.08
    )

    padFilter.Q.linearRampToValueAtTime(
      3 + intensity * 4,
      Tone.context.currentTime + 0.08
    )
  }

  /**
   * Modulate local gesture filters (high frequency range)
   */
  modulateLocalGestureFilters(position, intensity) {
    if (!this.ambientFilters || !Tone.context) return

    // Chords layer: 800-2000Hz range
    const chordsFilter = this.ambientFilters.chords
    if (!chordsFilter) return

    const baseFreq = 1400
    const modFreq = baseFreq + (position.x || 0.5) * 600 * intensity

    chordsFilter.frequency.linearRampToValueAtTime(
      modFreq,
      Tone.context.currentTime + 0.05
    )

    chordsFilter.Q.linearRampToValueAtTime(
      5 + intensity * 8,
      Tone.context.currentTime + 0.05
    )
  }

  /**
   * Handle hover modulation for cross-layer effects
   * @param {Object} hoverData - Hover data with position, velocity, intensity, and isRemote
   */
  handleHoverModulation(hoverData) {
    // PHASE 1 FIX: Re-enabled hover modulation (was disabled for debugging)
    console.log('🎛️ handleHoverModulation ACTIVE', { hasData: !!hoverData, isRemote: hoverData?.isRemote })

    // Force initialization if needed
    if (!this.isInitialized && this.gestureSynth) {
      console.log('🔇 Forcing initialization - setting isInitialized = true')
      this.isInitialized = true
    }

    // SIMPLIFIED HOVER MODULATION - Direct synth filter control
    if (!this.gestureSynth) {
      console.warn('🔇 handleHoverModulation blocked - no gestureSynth')
      return
    }

    // Extract position and data with safety checks
    const position = hoverData?.position || hoverData || { x: 0.5, y: 0.5 }
    const userId = hoverData?.userId || 'unknown'
    const isRemote = hoverData?.isRemote || false
    const intensity = hoverData?.intensity || 0.5

    // CRITICAL FIX: If intensity is 0, don't apply any modulation (but don't stop background audio)
    // EXCEPTION: If coordinates are outside canvas, we still need to reset filters
    if (intensity === 0) {
      const isOutsideCanvas = typeof originalX !== 'number' || typeof originalY !== 'number' ||
                             isNaN(originalX) || isNaN(originalY) || !isFinite(originalX) || !isFinite(originalY) ||
                             originalX < 0 || originalX > 1 || originalY < 0 || originalY > 1

      if (isOutsideCanvas) {
        console.log('🚫 Mouse left canvas with intensity=0 - resetting filters to prevent audio issues')
        this.stopRemoteFilterLFO()
        this.resetFiltersToSafeValues()
        return
      } else {
        console.log('🚫 Hover intensity is 0 on canvas - skipping modulation but keeping background audio')
        return
      }
    }

    // Track active remote users for dynamic scaling
    if (isRemote && userId !== 'unknown') {
      this.updateActiveRemoteUser(userId, true)
    }

    try {
      // CRITICAL: Check if mouse is outside canvas (invalid coordinates)
      const originalX = position?.x
      const originalY = position?.y
      let isOutsideCanvas = false

      // Check for invalid or undefined coordinates (mouse outside canvas)
      if (typeof originalX !== 'number' || typeof originalY !== 'number' ||
          isNaN(originalX) || isNaN(originalY) || !isFinite(originalX) || !isFinite(originalY)) {
        isOutsideCanvas = true
      }

      // Check if coordinates are outside reasonable canvas bounds
      if (originalX < 0 || originalX > 1 || originalY < 0 || originalY > 1) {
        isOutsideCanvas = true
      }

      // If mouse is outside canvas, DO NOT apply any HOVER modulation
      if (isOutsideCanvas) {
        console.log(`🚫 Mouse outside canvas detected (${originalX?.toFixed(2) || 'undefined'}, ${originalY?.toFixed(2) || 'undefined'}) - NO HOVER MODULATION APPLIED`)

        // Stop only HOVER modulation, NOT background music
        this.stopRemoteFilterLFO()

        // CRITICAL FIX: Reset filters to safe values that allow audio passage
        this.resetFiltersToSafeValues()

        return
      }

      // Mouse is inside canvas, proceed with modulation
      const safeX = originalX
      const safeY = originalY

      // Update last hover time and setup timeout
      this.lastHoverTime = Date.now()
      this.setupHoverTimeout()

      console.log(`🎛️ ${isRemote ? 'REMOTE' : 'LOCAL'} hover modulation: position=(${safeX.toFixed(2)}, ${safeY.toFixed(2)}), userId=${userId}, users=${this.activeRemoteUsers.size}`)

      // Create sonic parameters with tier information
      const sonicParams = {
        x: safeX,
        y: safeY,
        intensity: hoverData?.intensity || 0.5,
        velocity: hoverData?.velocity || 100,
        tier: isRemote ? 'remote' : 'local' // Set tier based on remote/local
      }

      // Use our new three-tier modulation system
      const filterParams = this.mapGestureToFilter(sonicParams)
      console.log(`🎛️ Three-tier hover modulation: tier=${sonicParams.tier}, cutoff=${filterParams.cutoffFrequency?.toFixed(1)}Hz, resonance=${filterParams.resonance?.toFixed(2)}, tremolo=${filterParams.tremoloAmount?.toFixed(2)}`)

      // Apply filter parameters based on tier
      const currentTime = Tone.context && Tone.context.currentTime ? Tone.context.currentTime : Tone.now()

      if (filterParams.isRemoteLFO) {
        // REMOTE HOVER: Setup LFO for filter cutoff modulation
        this.setupRemoteFilterLFO(filterParams.lfoSpeed, filterParams.lfoAmplitude)

        // Also apply resonance from X position for remote hover
        if (this.gestureFilter && this.gestureFilter.Q && this.gestureFilter.Q.linearRampToValueAtTime) {
          const resonance = 0.5 + ((sonicParams.x || 0.5) * 4.5) // 0.5 to 5.0 Q range
          const clampedQ = Math.max(0.1, Math.min(10, resonance))
          this.gestureFilter.Q.linearRampToValueAtTime(clampedQ, currentTime + 0.05)
        }

        // Apply resonance to ambient filters too
        if (this.ambientFilters) {
          Object.keys(this.ambientFilters).forEach(layerName => {
            const filter = this.ambientFilters[layerName]
            if (filter && filter.Q && filter.Q.linearRampToValueAtTime) {
              const resonance = 0.5 + ((sonicParams.x || 0.5) * 4.5)
              const clampedQ = Math.max(0.1, Math.min(10, resonance))
              filter.Q.linearRampToValueAtTime(clampedQ, currentTime + 0.05)
            }
          })
        }

      } else {
        // LOCAL HOVER: Direct filter modulation (no LFO)
        // Stop any remote LFO if we're in local mode
        this.stopRemoteFilterLFO()

        // Apply to gesture filter
        if (this.gestureFilter && this.gestureFilter.frequency && this.gestureFilter.Q) {
          // Apply cutoff frequency
          if (filterParams.cutoffFrequency && this.gestureFilter.frequency.linearRampToValueAtTime) {
            const clampedFreq = Math.max(100, Math.min(8000, filterParams.cutoffFrequency))
            this.gestureFilter.frequency.linearRampToValueAtTime(clampedFreq, currentTime + 0.05)
          }

          // Apply resonance
          if (filterParams.resonance && this.gestureFilter.Q.linearRampToValueAtTime) {
            const clampedQ = Math.max(0.1, Math.min(10, filterParams.resonance))
            this.gestureFilter.Q.linearRampToValueAtTime(clampedQ, currentTime + 0.05)
          }
        }

        // Apply to ambient filters for audible effect
        if (this.ambientFilters) {
          Object.keys(this.ambientFilters).forEach(layerName => {
            const filter = this.ambientFilters[layerName]
            if (filter && filter.frequency && filter.Q) {
              // Apply cutoff with layer-specific multipliers
              const layerMultiplier = {
                bass: 0.5,
                pad: 0.8,
                chords: 1.2
              }[layerName] || 1.0

              const clampedFreq = Math.max(100, Math.min(8000, filterParams.cutoffFrequency * layerMultiplier))
              filter.frequency.linearRampToValueAtTime(clampedFreq, currentTime + 0.05)

              // Apply resonance
              const clampedQ = Math.max(0.1, Math.min(10, filterParams.resonance))
              filter.Q.linearRampToValueAtTime(clampedQ, currentTime + 0.05)
            }
          })
          console.log('🎛️ Applied local filter modulation to ambient layers')
        }
      }

      if (isRemote) {
        console.log(`🌐 Remote hover modulation applied: position=(${safeX.toFixed(2)}, ${safeY.toFixed(2)})`)
      } else {
        console.log(`🏠 Local hover modulation applied: position=(${safeX.toFixed(2)}, ${safeY.toFixed(2)})`)
      }

    } catch (error) {
      console.error('❌ Hover modulation failed:', error)
      console.error('🐛 Error details:', {
        message: error.message,
        stack: error.stack,
        position: position,
        safeX: typeof safeX !== 'undefined' ? safeX : 'undefined',
        safeY: typeof safeY !== 'undefined' ? safeY : 'undefined',
        isRemote: isRemote,
        gestureSynth: !!this.gestureSynth,
        gestureFilter: !!this.gestureFilter,
        tremoloLFO: !!this.tremoloLFO
      })
    }
  }

  /**
   * Setup hover timeout to stop modulation after inactivity
   */
  setupHoverTimeout() {
    // Clear existing timeout
    if (this.hoverTimeoutTimer) {
      clearTimeout(this.hoverTimeoutTimer)
    }

    // Set new timeout
    this.hoverTimeoutTimer = setTimeout(() => {
      const timeSinceLastHover = Date.now() - this.lastHoverTime
      if (timeSinceLastHover >= this.hoverTimeoutDuration) {
        console.log('⏰ Hover timeout - stopping modulation due to inactivity')
        this.stopRemoteFilterLFO()
        this.hoverTimeoutTimer = null
      }
    }, this.hoverTimeoutDuration)
  }

  /**
   * Stop hover modulation when gesture ends
   * @param {string} userId - User ID to stop tracking
   */
  stopHoverModulation(userId) {
    // Stop tracking this user
    this.updateActiveRemoteUser(userId, false)

    // If no more active remote users, stop remote LFO
    if (this.activeRemoteUsers.size === 0) {
      this.stopRemoteFilterLFO()
      console.log('🛑 Stopped remote LFO - no active users')
    }
  }

  /**
   * Reset filters to safe values that allow audio passage
   * Critical fix for when mouse exits canvas and audio disappears
   */
  resetFiltersToSafeValues() {
    if (!this.ambientFilters || !Tone.context) return

    const currentTime = Tone.context.currentTime

    console.log('🔧 Resetting filters to safe values for audio continuation')

    // CRITICAL FIX: Stop any active tremolo LFO that could cause excessive modulation
    if (this.tremoloLFO) {
      console.log('🛑 STOPPING tremoloLFO - preventing excessive modulation')
      this.tremoloLFO.stop()
      this.tremoloLFO.dispose()
      this.tremoloLFO = null
    }

    // CRITICAL FIX: Stop the main lfoSystem that runs at 30Hz - this is likely the main tremolo source
    if (this.lfoSystem) {
      console.log('🛑 STOPPING lfoSystem - preventing excessive 30Hz tremolo')
      this.lfoSystem.stop()
    }

    // Reset ambient filters to original values
    if (this.ambientFilters.bass) {
      this.ambientFilters.bass.frequency.linearRampToValueAtTime(150, currentTime + 0.1)
      this.ambientFilters.bass.Q.linearRampToValueAtTime(1, currentTime + 0.1)
      console.log('🔧 Bass filter reset: 150Hz, Q=1')
    }

    if (this.ambientFilters.pad) {
      this.ambientFilters.pad.frequency.linearRampToValueAtTime(800, currentTime + 0.1)
      this.ambientFilters.pad.Q.linearRampToValueAtTime(1.5, currentTime + 0.1)
      console.log('🔧 Pad filter reset: 800Hz, Q=1.5')
    }

    if (this.ambientFilters.chords) {
      this.ambientFilters.chords.frequency.linearRampToValueAtTime(2000, currentTime + 0.1)
      this.ambientFilters.chords.Q.linearRampToValueAtTime(2, currentTime + 0.1)
      console.log('🔧 Chords filter reset: 2000Hz, Q=2')
    }

    // Reset gesture filter to open position
    if (this.gestureFilter) {
      this.gestureFilter.frequency.linearRampToValueAtTime(2000, currentTime + 0.1)
      this.gestureFilter.Q.linearRampToValueAtTime(3, currentTime + 0.1)
      console.log('🔧 Gesture filter reset: 2000Hz, Q=3')
    }

    // CRITICAL FIX: Reset gesture synth volume to prevent tremolo from persisting
    if (this.gestureSynth && this.gestureSynth.volume) {
      this.gestureSynth.volume.value = -6 // Reset to normal volume
      console.log('🔧 Gesture synth volume reset to normal')
    }

    // Ensure background evolution continues
    if (!this.evolvingGenerationActive && this.isInitialized && !this.muted) {
      console.log('🎵 Restarting background evolution after filter reset')
      this.evolvingGenerationActive = true
      this.startEvolvingGeneration()
    }
  }

  /**
   * Force stop ALL LFO systems (emergency cleanup)
   */
  forceStopAllLFO() {
    console.log('🚨 FORCE STOPPING ALL LFO SYSTEMS')

    // Stop remote filter LFO
    this.stopRemoteFilterLFO()

    // Stop old tremolo LFO
    if (this.tremoloLFO) {
      this.tremoloLFO.stop()
      this.tremoloLFO.dispose()
      this.tremoloLFO = null
      console.log('🛑 Stopped tremoloLFO')
    }

    // Stop old lfoSystem
    if (this.lfoSystem && this.lfoSystem.stop) {
      this.lfoSystem.stop()
      console.log('🛑 Stopped lfoSystem')
    }

    // Clear hover timeout
    if (this.hoverTimeoutTimer) {
      clearTimeout(this.hoverTimeoutTimer)
      this.hoverTimeoutTimer = null
    }

    console.log('✅ All LFO systems force stopped')
  }

  /**
   * Cleanup resources
   */



  /**
   * Apply unified modulation from HoverOrchestrator
   * @param {Object} modulationData - Unified modulation data from server
   */
  applyUnifiedModulation(modulationData) {
    // DISABLED: All unified modulation functionality removed
    console.log('🛑 applyUnifiedModulation DISABLED')
    return
  }

  cleanup() {
    this.stopUpdateLoop()
    this.lfoSystem.stop()
    this.stopRemoteFilterLFO() // Stop remote filter LFO

    // Clear hover timeout timer
    if (this.hoverTimeoutTimer) {
      clearTimeout(this.hoverTimeoutTimer)
      this.hoverTimeoutTimer = null
    }

    // FORCE STOP any tremolo LFO that might be causing issues
    if (this.tremoloLFO) {
      console.log('🛑 FORCE STOPPING tremoloLFO during cleanup')
      this.tremoloLFO.stop()
      this.tremoloLFO.dispose()
      this.tremoloLFO = null
    }

    // Cleanup new musical architecture services
    if (this.musicalScheduler && typeof this.musicalScheduler.dispose === 'function') {
      console.log('🛑 Stopping MusicalScheduler')
      this.musicalScheduler.stop()
      this.musicalScheduler.dispose()
      this.musicalScheduler = null
    }

    if (this.lfoManager && typeof this.lfoManager.dispose === 'function') {
      console.log('🛑 Disposing LFOManager')
      this.lfoManager.dispose()
      this.lfoManager = null
    }

    this.gestureBuffer = []
    this.audioEngine = null
    this.gestureCapture = null
    this.isInitialized = false

    console.log('AudioService cleanup completed - all LFO and musical timing systems stopped')
  }

  /**
   * Update compositional parameters from collective metrics
   * Influences background generative system based on room activity
   * @param {Object} parameters - Compositional parameters from backend
   */
  updateCompositionalParameters(parameters) {
    if (!this.generativeState || !parameters) return

    console.log('🎼 Updating generative system with collective parameters:', parameters)

    // Map scale type to actual scale
    const scales = {
      'pentatonic': [0, 2, 4, 7, 9],
      'major': [0, 2, 4, 5, 7, 9, 11],
      'minor': [0, 2, 3, 5, 7, 8, 10]
    }

    // Update scale if changed
    if (parameters.scaleType) {
      this.generativeState.currentScale = scales[parameters.scaleType] || scales['pentatonic']
    }

    // Update base octave (affects tonic frequency)
    if (parameters.baseOctave) {
      // Convert octave to frequency (C note)
      const baseFreq = 32.7 * Math.pow(2, parameters.baseOctave) // C0 = 32.7Hz
      this.generativeState.currentTonic = baseFreq
    }

    // Update complexity based on harmonic density (1-4 voices)
    if (parameters.harmonicDensity) {
      this.generativeState.complexity = Math.min(parameters.harmonicDensity / 4, 1)
    }

    // LAYER INFLUENCE: Rhythmic density affects layer rhythms
    if (parameters.rhythmicDensity !== undefined && this.generativeState.layers) {
      // Higher density = faster note generation
      const speedFactor = 1 + parameters.rhythmicDensity
      Object.keys(this.generativeState.layers).forEach(layerName => {
        const layer = this.generativeState.layers[layerName]
        // CRITICAL: Use PRIME NUMBERS to prevent rhythmic synchronization
        // Previous values (4000, 6000, 8000) were exact multiples → LCM=24000ms
        // All layers synchronized every 24 seconds creating "ta-taaaan" pattern
        const baseRhythm = {
          bass: 3700,   // PRIME-ISH: Ensures bass never aligns with others
          pad: 5300,    // PRIME: Completely independent rhythm
          chords: 7900  // PRIME: Maximum desynchronization
        }[layerName]
        layer.rhythm = baseRhythm / speedFactor
      })
    }

    // HARMONIC DENSITY: Affects chord complexity
    if (parameters.harmonicDensity !== undefined && this.generativeState) {
      // Higher density = more complex harmonies (could extend triads to 7ths)
      this.generativeState.complexity = 0.3 + parameters.harmonicDensity * 0.4
    }

    // ARTICULATION BIAS: Affects velocity
    if (parameters.articulationBias && this.generativeState.layers) {
      const velocityMap = {
        'staccato': 0.3,  // Lighter
        'marcato': 0.5,   // Medium
        'legato': 0.6     // Fuller
      }
      const baseVelocity = velocityMap[parameters.articulationBias] || 0.4
      Object.keys(this.generativeState.layers).forEach(layerName => {
        this.generativeState.layers[layerName].velocity = baseVelocity * (0.9 + Math.random() * 0.2)
      })
    }

    // Apply mode (influences harmonic progression choice)
    if (parameters.mode) {
      this.generativeState.mode = parameters.mode
    }

    console.log('🎵 Updated generative state:', {
      scale: this.generativeState.currentScale,
      tonic: this.generativeState.currentTonic.toFixed(1),
      complexity: this.generativeState.complexity.toFixed(2),
      bassRhythm: this.generativeState.layers.bass.rhythm.toFixed(0),
      activeLayers: Object.keys(this.generativeState.layers).length
    })
  }
}

// Export singleton instance
// Make AudioService available globally
window.AudioService = AudioService