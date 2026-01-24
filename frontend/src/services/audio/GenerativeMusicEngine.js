/**
 * GenerativeMusicEngine.js
 * Handles background music generation, harmonic progressions, and composition
 * Extracted from AudioService.js for Phase 2 refactoring
 */
// Golden ratio for non-repeating sequences
const PHI = 1.618033988749894848

class GenerativeMusicEngine {
  constructor() {
    // Reference to ambient layer synths (set by AudioService)
    this.ambientLayers = null

    // Mute state
    this.muted = false

    // Active state for generation loop
    this.evolvingGenerationActive = false
    this.lastVoiceUpdateTime = Date.now()

    // Initialize generative composition state
    this.generativeState = {
      currentScale: [0, 2, 4, 7, 9], // Pentatonic major
      currentTonic: 220, // A3
      harmonicProgression: 0,
      evolutionCycle: 0,
      userInfluence: 0,
      lastUserActivity: Date.now(),
      evolutionSpeed: 8000,
      complexity: 0.3,
      rhythmicComplexity: 0.5,
      harmonicTension: 0.3,
      pendingModulation: null,
      mode: 'major',

      // Rhythmic patterns for variety
      rhythmPatterns: [
        [3.0],                      // 0: single very long note
        [2.0, 1.0],                 // 1: long + medium
        [1.5, 1.5],                 // 2: two sustained notes
        [0.3, 0.3, 0.3, 0.3],       // 3: four rapid notes
        [0.4, 0.4, 0.4, 0.4, 0.4],  // 4: five rapid notes
        [0.25, 0.25, 0.5],          // 5: very fast triplet
        [0.5, 1.5],                 // 6: classic short-long
        [1.5, 0.5],                 // 7: inverted long-short
        [0.3, 2.0],                 // 8: very short + very long
        [2.0, 0.3],                 // 9: very long + very short
        [1.0, 1.0, 1.0],            // 10: steady triplet
        [0.8, 0.8, 0.8, 0.8],       // 11: steady quadruplet
      ],

      // Layer configuration
      layers: {
        bass: {
          nextNoteTime: 0,
          rhythm: 2000,
          currentNote: 0,
          octave: -2,
          velocity: 0.45,
          lastFrequency: null,
          currentPatternIndex: 3,
          patternPosition: 0
        },
        pad: {
          nextNoteTime: 1200,
          rhythm: 16000,
          currentNotes: [2, 4],
          octave: 0,
          velocity: 0.30,
          lastFrequencies: [],
          currentPatternIndex: 0,
          patternPosition: 0
        },
        chords: {
          nextNoteTime: 2400,
          rhythm: 4000,
          currentChord: 0,
          octave: 1,
          velocity: 0.40,
          lastFrequencies: [],
          currentPatternIndex: 10,
          patternPosition: 0,
          // Enhanced voicing state
          lastInversion: 0,
          phrasePosition: 0,
          phraseLength: 4,
          lastVoicingType: 0
        }
      },

      // Harmonic progressions
      availableProgressions: [
        { name: 'I-V-vi-IV', degrees: [0, 4, 5, 3], mood: 'uplifting' },
        { name: 'I-IV-V-IV', degrees: [0, 3, 4, 3], mood: 'driving' },
        { name: 'i-VI-III-VII', degrees: [0, 5, 2, 6], mood: 'dramatic' },
        { name: 'I-vi-IV-V', degrees: [0, 5, 3, 4], mood: 'circular' },
        { name: 'I-V-vi-iii-IV', degrees: [0, 4, 5, 2, 3], mood: 'flowing' },
        { name: 'I-iii-vi-IV', degrees: [0, 2, 5, 3], mood: 'melancholic' },
        { name: 'I-VII-IV-V', degrees: [0, 6, 3, 4], mood: 'mysterious' }
      ],
      currentProgressionIndex: 0,
      chordProgression: [0, 4, 5, 3],
      currentChord: 0,
      chordDuration: 8000,
      lastChordChange: Date.now(),
      progressionCycles: 0,
      nextProgressionChange: 4
    }
  }

  /**
   * Set synth references
   * @param {Object} ambientLayers - Ambient layer synths
   */
  setAmbientLayers(ambientLayers) {
    this.ambientLayers = ambientLayers
  }

  /**
   * Set mute state
   * @param {boolean} muted - Mute state
   */
  setMuted(muted) {
    this.muted = muted
  }

  /**
   * Set ambient filter references
   * @param {Object} ambientFilters - Ambient filter instances
   */
  setAmbientFilters(ambientFilters) {
    this.ambientFilters = ambientFilters
  }

  /**
   * Start evolving generative music system
   * Entry #73: Converted from setTimeout to Tone.Transport.scheduleRepeat
   */
  startEvolvingGeneration() {
    if (this.evolvingGenerationActive) return

    this.evolvingGenerationActive = true
    this.lastVoiceUpdateTime = Date.now()

    // Pre-cache layer names to avoid Object.keys allocation in loop
    const layerNames = Object.keys(this.generativeState.layers)

    // Composition tick function - called precisely by Transport
    const compositionTick = () => {
      if (!this.evolvingGenerationActive) {
        return
      }

      try {
        const now = Date.now()
        const deltaTime = now - this.lastVoiceUpdateTime
        this.lastVoiceUpdateTime = now

        // Update each layer independently using for loop (no allocation)
        for (let i = 0; i < layerNames.length; i++) {
          const layerName = layerNames[i]
          const layer = this.generativeState.layers[layerName]

          layer.nextNoteTime -= deltaTime
          if (layer.nextNoteTime <= 0) {
            this.playLayer(layerName)

            const currentPattern = this.generativeState.rhythmPatterns[layer.currentPatternIndex]
            const patternMultiplier = currentPattern[layer.patternPosition]

            layer.patternPosition++

            if (layer.patternPosition >= currentPattern.length) {
              const oldPattern = layer.currentPatternIndex
              do {
                layer.currentPatternIndex = Math.floor(Math.random() * this.generativeState.rhythmPatterns.length)
              } while (layer.currentPatternIndex === oldPattern && this.generativeState.rhythmPatterns.length > 1)

              layer.patternPosition = 0
            }

            const baseTime = layer.rhythm * patternMultiplier
            const jitter = 1 + (Math.random() - 0.5) * 0.1
            layer.nextNoteTime = baseTime * jitter
          }
        }

        // Harmonic progression change
        const timeSinceChordChange = now - this.generativeState.lastChordChange
        if (timeSinceChordChange >= this.generativeState.chordDuration) {
          this.advanceHarmony()
          this.generativeState.lastChordChange = now
        }

        this.generativeState.evolutionCycle++

      } catch (error) {
        // Silently handle errors to prevent loop disruption
      }
    }

    // Entry #73: Use Tone.Transport.scheduleRepeat instead of setTimeout
    // This schedules on the audio thread, immune to main thread congestion
    if (typeof Tone !== 'undefined' && Tone.Transport) {
      // Ensure Transport is running
      if (Tone.Transport.state !== 'started') {
        Tone.Transport.start()
      }

      const startTime = Tone.now() + 2 // 2 second delay like original

      this.compositionLoopEventId = Tone.Transport.scheduleRepeat(() => {
        compositionTick()
      }, 0.1, startTime) // 100ms interval

    } else {
      // Fallback to setTimeout if Tone not available
      const compositionLoopFallback = () => {
        if (!this.evolvingGenerationActive) return
        compositionTick()
        this._fallbackTimeoutId = setTimeout(compositionLoopFallback, 100)
      }
      this._fallbackTimeoutId = setTimeout(compositionLoopFallback, 2000)
    }
  }

  /**
   * Stop evolving generation
   * Entry #73: Properly cancels Transport-scheduled events
   */
  stopEvolvingGeneration() {
    this.evolvingGenerationActive = false

    // Clear Transport-scheduled event
    if (this.compositionLoopEventId !== undefined && typeof Tone !== 'undefined' && Tone.Transport) {
      Tone.Transport.clear(this.compositionLoopEventId)
      this.compositionLoopEventId = undefined
    }

    // Clear fallback setTimeout if used
    if (this._fallbackTimeoutId) {
      clearTimeout(this._fallbackTimeoutId)
      this._fallbackTimeoutId = null
    }

    // console.log('🎵 Evolving generation stopped')
  }

  /**
   * Play a musical layer
   * @param {string} layerName - Name of layer ('bass', 'pad', 'chords')
   */
  playLayer(layerName) {
    const state = this.generativeState
    const layer = state.layers[layerName]
    const scale = state.currentScale

    if (!this.ambientLayers || this.muted) return

    const synth = this.ambientLayers[layerName]
    if (!synth) return

    const chordRoot = state.chordProgression[state.currentChord]
    const chordRootIndex = scale.indexOf(chordRoot)

    let frequencies = []

    // Pattern-based duration
    const currentPattern = state.rhythmPatterns[layer.currentPatternIndex]
    const currentPosition = (layer.patternPosition - 1 + currentPattern.length) % currentPattern.length
    const patternMultiplier = currentPattern[currentPosition]

    let baseDuration
    if (layerName === 'bass') baseDuration = 1.0
    else if (layerName === 'pad') baseDuration = 2.5
    else if (layerName === 'chords') baseDuration = 1.8

    const articulationFactor = 0.8 - (state.complexity * 0.1)
    const duration = baseDuration * patternMultiplier * articulationFactor

    if (layerName === 'bass') {
      const scaleNote = chordRoot
      const frequency = state.currentTonic * Math.pow(2, (scaleNote / 12) + layer.octave)
      frequencies = [frequency]

      try { synth.releaseAll() } catch (e) {}
      layer.lastFrequency = frequency

    } else if (layerName === 'pad') {
      const third = scale[(chordRootIndex + 2) % scale.length]
      const fifth = scale[(chordRootIndex + 4) % scale.length]

      const freq3 = state.currentTonic * Math.pow(2, (third / 12) + layer.octave)
      const freq5 = state.currentTonic * Math.pow(2, (fifth / 12) + layer.octave)
      frequencies = [freq3, freq5]

      try { synth.releaseAll() } catch (e) {}
      layer.lastFrequencies = frequencies

    } else if (layerName === 'chords') {
      // Enhanced chord generation with varied voicing, inversions, rhythm, velocity
      const root = chordRoot
      const third = scale[(chordRootIndex + 2) % scale.length]
      const fifth = scale[(chordRootIndex + 4) % scale.length]

      // 1. Select voicing type based on harmonic tension
      const voicingType = this._selectVoicingType(state, layer)

      // 2. Generate frequencies with voicing spread
      frequencies = this._generateChordVoicing(
        root, third, fifth,
        layer.octave, state.currentTonic,
        voicingType
      )

      // 3. Select and apply inversion with voice leading
      const inversion = this._selectInversion(state, layer, chordRootIndex)
      frequencies = this._applyInversion(frequencies, inversion)

      // 4. Select attack style based on rhythmic complexity
      const attackStyle = this._selectAttackStyle(state, layer)

      // 5. Calculate per-note velocities with dynamic arcs
      const velocities = this._calculateChordVelocities(
        state, layer, layer.velocity, frequencies.length
      )

      try { synth.releaseAll() } catch (e) {}
      layer.lastFrequencies = frequencies

      // 6. Play chord with style and velocities
      try {
        const triggerTime = typeof Tone !== 'undefined' ? Tone.now() : undefined
        this._playChordWithStyle(synth, frequencies, duration, velocities, attackStyle, triggerTime)
      } catch (error) {
        // Log context for debugging (only in development)
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('Chord playback error:', error.message)
        }
      }
      return // Skip default playback below
    }

    // Velocity variation for bass and pad
    let velocityVariation
    if (layerName === 'bass') velocityVariation = 0.8 + Math.random() * 0.4
    else if (layerName === 'pad') velocityVariation = 0.85 + Math.random() * 0.3
    else velocityVariation = 1.0

    const dynamicFactor = 0.9 + (Math.random() * 0.2) * state.complexity
    const playVelocity = layer.velocity * velocityVariation * dynamicFactor

    try {
      const triggerTime = typeof Tone !== 'undefined' ? Tone.now() : undefined

      frequencies.forEach(freq => {
        synth.triggerAttackRelease(freq, duration, triggerTime, playVelocity)
      })
    } catch (error) {
      // console.warn(`🎵 Layer ${layerName} play error:`, error.message)
    }
  }

  /**
   * Update generative state based on user activity
   */
  updateGenerativeState() {
    const state = this.generativeState
    state.evolutionCycle++

    const timeFactor = Math.sin(state.evolutionCycle * 0.05) * 0.5 + 0.5
    state.complexity = 0.2 + timeFactor * 0.4 + state.userInfluence * 0.4

    state.userInfluence *= 0.95
    state.userInfluence = Math.max(0.1, state.userInfluence)

    if (Math.random() < 0.3 + state.complexity * 0.2) {
      state.harmonicProgression = (state.harmonicProgression + 1) % state.currentScale.length
    }

    if (state.evolutionCycle % 20 === 0) {
      this.mutateHarmonicContext()
    }

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
        const intervals = [3, 4, 5, 7, 9]
        const interval = intervals[Math.floor(Math.random() * intervals.length)]
        state.currentTonic = 110 + (state.currentTonic + interval * 20) % 440
        break

      case 'scale_change':
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
        if (Math.random() > 0.5) {
          state.currentScale = [...state.currentScale, 1, 6, 8, 11].slice(0, 7)
        }
        break
    }

    // console.log(`🎵 Harmonic mutation: ${mutation}, new tonic: ${state.currentTonic}Hz`)
  }

  /**
   * Advance harmonic progression
   */
  advanceHarmony() {
    const state = this.generativeState
    state.currentChord = (state.currentChord + 1) % state.chordProgression.length

    if (state.currentChord === 0) {
      state.progressionCycles++

      if (state.progressionCycles >= state.nextProgressionChange) {
        this.changeProgression()
        state.progressionCycles = 0
        state.nextProgressionChange = 3 + Math.floor(Math.random() * 4)
      }
    }

    if (state.evolutionCycle % 32 === 0 && Math.random() < 0.2) {
      this.mutateHarmonicContext()
    }
  }

  /**
   * Change to a different chord progression
   */
  changeProgression() {
    const state = this.generativeState

    let targetMoods
    if (state.complexity > 0.7) {
      targetMoods = ['driving', 'uplifting', 'flowing']
    } else if (state.complexity > 0.4) {
      targetMoods = ['circular', 'mysterious', 'flowing']
    } else {
      targetMoods = ['melancholic', 'dramatic', 'mysterious']
    }

    const suitableProgressions = state.availableProgressions
      .map((prog, index) => ({ ...prog, index }))
      .filter(prog => targetMoods.includes(prog.mood))

    const options = suitableProgressions.filter(p => p.index !== state.currentProgressionIndex)
    if (options.length > 0) {
      const chosen = options[Math.floor(Math.random() * options.length)]
      state.currentProgressionIndex = chosen.index
      state.chordProgression = chosen.degrees
      state.currentChord = 0

      // console.log(`🎼 PROGRESSION CHANGE: ${chosen.name} (${chosen.mood})`)
    }
  }

  /**
   * Trigger immediate background evolution
   */
  triggerImmediateEvolution() {
    const state = this.generativeState

    if (state.pendingModulation) {
      const frequencyRatio = Math.pow(2, state.pendingModulation / 12)
      state.currentTonic *= frequencyRatio
      state.currentTonic = Math.max(110, Math.min(440, state.currentTonic))
      state.pendingModulation = null
    }

    if (state.complexity > 0.7) {
      if (state.currentScale.length === 5) {
        state.currentScale = [0, 2, 4, 7, 9, 11]
      }
    } else if (state.complexity < 0.3) {
      state.currentScale = [0, 2, 4, 7, 9]
    }
  }

  /**
   * Consider harmonic modulation based on user input
   * @param {number} targetPitchClass - Target pitch class
   */
  considerHarmonicModulation(targetPitchClass) {
    const state = this.generativeState
    const currentTonicClass = Math.round(state.currentTonic) % 12

    let modulationInterval = (targetPitchClass - currentTonicClass + 12) % 12

    const meaningfulIntervals = [5, 7, 2, 9, 4]
    const closestInterval = meaningfulIntervals.reduce((prev, curr) => {
      const prevDist = Math.abs((prev - modulationInterval + 12) % 12)
      const currDist = Math.abs((curr - modulationInterval + 12) % 12)
      return currDist < prevDist ? curr : prev
    })

    if (closestInterval <= 7) {
      state.pendingModulation = closestInterval
    }
  }

  /**
   * Integrate user phrase into background composition
   * @param {Object} musicalEvent - Musical event data
   * @param {number} frequency - Note frequency
   * @param {number} duration - Note duration
   */
  integrateUserPhrase(musicalEvent, frequency, duration) {
    const state = this.generativeState

    state.userInfluence = Math.min(1.0, state.userInfluence + 0.1)
    state.lastUserActivity = Date.now()

    const midiPitch = musicalEvent.pitch
    const articulation = musicalEvent.articulation || 'default'

    if (articulation === 'staccato') {
      state.complexity = Math.min(1.0, state.complexity + 0.05)
    } else if (articulation === 'legato') {
      state.complexity = Math.max(0.1, state.complexity - 0.03)
    }

    if (midiPitch) {
      const pitchClass = midiPitch % 12
      const currentTonicClass = Math.round(state.currentTonic) % 12

      const pitchDistance = Math.min((pitchClass - currentTonicClass + 12) % 12,
                                   (currentTonicClass - pitchClass + 12) % 12)

      if (pitchDistance > 4 && Math.random() > 0.7) {
        this.considerHarmonicModulation(pitchClass)
      }
    }

    if (duration < 0.2) {
      state.rhythmicComplexity = Math.min(1.0, state.rhythmicComplexity + 0.1)
    } else if (duration > 1.0) {
      state.rhythmicComplexity = Math.max(0.2, state.rhythmicComplexity - 0.05)
      state.harmonicTension = Math.min(1.0, (state.harmonicTension || 0.3) + 0.1)
    }

    if (state.userInfluence > 0.2) {
      this.triggerImmediateEvolution()
    }
  }

  /**
   * Update compositional parameters from collective metrics
   * @param {Object} parameters - Parameters from backend
   */
  updateCompositionalParameters(parameters) {
    if (!parameters) return

    const state = this.generativeState
    const scales = {
      'pentatonic': [0, 2, 4, 7, 9],
      'major': [0, 2, 4, 5, 7, 9, 11],
      'minor': [0, 2, 3, 5, 7, 8, 10]
    }

    if (parameters.scaleType) {
      state.currentScale = scales[parameters.scaleType] || scales['pentatonic']
    }

    if (parameters.baseOctave) {
      const baseFreq = 32.7 * Math.pow(2, parameters.baseOctave)
      state.currentTonic = baseFreq
    }

    if (parameters.harmonicDensity) {
      state.complexity = Math.min(parameters.harmonicDensity / 4, 1)
    }

    if (parameters.rhythmicDensity !== undefined && state.layers) {
      const speedFactor = 1 + parameters.rhythmicDensity
      Object.keys(state.layers).forEach(layerName => {
        const layer = state.layers[layerName]
        const baseRhythm = {
          bass: 3700,
          pad: 5300,
          chords: 7900
        }[layerName]
        layer.rhythm = baseRhythm / speedFactor
      })
    }

    if (parameters.articulationBias && state.layers) {
      const velocityMap = {
        'staccato': 0.3,
        'marcato': 0.5,
        'legato': 0.6
      }
      const baseVelocity = velocityMap[parameters.articulationBias] || 0.4
      Object.keys(state.layers).forEach(layerName => {
        state.layers[layerName].velocity = baseVelocity * (0.9 + Math.random() * 0.2)
      })
    }

    if (parameters.mode) {
      state.mode = parameters.mode
    }
  }

  /**
   * Get current generative state
   * @returns {Object} Current state
   */
  getState() {
    return { ...this.generativeState }
  }

  /**
   * Check if generation is active
   * @returns {boolean} True if active
   */
  isActive() {
    return this.evolvingGenerationActive
  }

  // ============================================
  // Enhanced Chord Voicing Methods
  // ============================================

  /**
   * Select voicing type based on harmonic tension
   * @param {Object} state - Generative state
   * @param {Object} layer - Layer config
   * @returns {number} Voicing type (0-3)
   */
  _selectVoicingType(state, layer) {
    const voicingSelector = ((state.evolutionCycle * PHI) + state.harmonicTension) % 1

    // Avoid repeating same voicing
    let voicingType
    if (state.harmonicTension > 0.7) {
      // High tension: favor open and spread voicings
      voicingType = voicingSelector < 0.5 ? 1 : 3
    } else if (state.harmonicTension > 0.4) {
      // Medium tension: all voicings possible
      const voicings = [0, 1, 2, 0]
      voicingType = voicings[Math.floor(voicingSelector * voicings.length)]
    } else {
      // Low tension: favor close voicing
      voicingType = voicingSelector < 0.7 ? 0 : 1
    }

    // Avoid immediate repetition
    if (voicingType === layer.lastVoicingType && state.evolutionCycle > 1) {
      voicingType = (voicingType + 1) % 4
    }
    layer.lastVoicingType = voicingType

    return voicingType
  }

  /**
   * Generate chord frequencies with voicing spread
   * @param {number} root - Root scale degree
   * @param {number} third - Third scale degree
   * @param {number} fifth - Fifth scale degree
   * @param {number} octave - Base octave
   * @param {number} tonic - Tonic frequency
   * @param {number} voicingType - Voicing type (0-3)
   * @returns {Array} Array of frequencies (clamped to 80-1200Hz for ambient)
   */
  _generateChordVoicing(root, third, fifth, octave, tonic, voicingType) {
    // Input validation
    if (!tonic || tonic <= 0 || isNaN(tonic)) {
      tonic = 220 // Fallback to A3
    }
    if (!Number.isFinite(octave)) {
      octave = 1
    }

    let frequencies
    switch (voicingType) {
      case 1: // Open voicing - root low, fifth high
        frequencies = [
          tonic * Math.pow(2, (root / 12) + octave - 1),
          tonic * Math.pow(2, (third / 12) + octave),
          tonic * Math.pow(2, (fifth / 12) + octave + 0.5)
        ]
        break
      case 2: // Drop-2 voicing - third dropped
        frequencies = [
          tonic * Math.pow(2, (root / 12) + octave),
          tonic * Math.pow(2, (third / 12) + octave - 1),
          tonic * Math.pow(2, (fifth / 12) + octave)
        ]
        break
      case 3: // Wide spread
        frequencies = [
          tonic * Math.pow(2, (root / 12) + octave - 1),
          tonic * Math.pow(2, (third / 12) + octave),
          tonic * Math.pow(2, (fifth / 12) + octave + 1)
        ]
        break
      default: // Close voicing (0)
        frequencies = [
          tonic * Math.pow(2, (root / 12) + octave),
          tonic * Math.pow(2, (third / 12) + octave),
          tonic * Math.pow(2, (fifth / 12) + octave)
        ]
    }

    // Clamp to ambient frequency range (80Hz - 1200Hz)
    return frequencies.map(f => Math.max(80, Math.min(1200, f)))
  }

  /**
   * Select inversion with voice leading preference
   * @param {Object} state - Generative state
   * @param {Object} layer - Layer config
   * @param {number} chordRootIndex - Index in scale
   * @returns {number} Inversion (0-2)
   */
  _selectInversion(state, layer, chordRootIndex) {
    const inversionSelector = ((state.evolutionCycle * PHI) + (chordRootIndex * 0.3)) % 1

    let targetInversion
    if (inversionSelector < 0.5) {
      targetInversion = 0 // Root position most common
    } else if (inversionSelector < 0.8) {
      targetInversion = 1 // First inversion
    } else {
      targetInversion = 2 // Second inversion (cadential)
    }

    // Voice leading: prefer inversions close to previous when complexity low
    const lastInv = layer.lastInversion || 0
    const stepSize = Math.abs(targetInversion - lastInv)

    if (stepSize > 1 && state.complexity < 0.5) {
      targetInversion = lastInv + (targetInversion > lastInv ? 1 : -1)
      targetInversion = Math.max(0, Math.min(2, targetInversion))
    }

    layer.lastInversion = targetInversion
    return targetInversion
  }

  /**
   * Apply inversion to frequency array
   * @param {Array} frequencies - [root, third, fifth] frequencies
   * @param {number} inversion - Inversion type (0-2)
   * @returns {Array} Reordered frequencies with proper voice leading
   */
  _applyInversion(frequencies, inversion) {
    // Bounds check
    if (!frequencies || frequencies.length < 3) {
      return frequencies
    }

    switch (inversion) {
      case 1: // First inversion: 3rd in bass (third, fifth, root up)
        return [
          frequencies[1],
          frequencies[2],
          frequencies[0] * 2
        ]
      case 2: // Second inversion: 5th in bass (fifth, root up, third up)
        return [
          frequencies[2],
          frequencies[0] * 2,
          frequencies[1] * 2
        ]
      default: // Root position
        return frequencies
    }
  }

  /**
   * Select attack style based on rhythmic complexity
   * @param {Object} state - Generative state
   * @param {Object} layer - Layer config
   * @returns {number} Attack style (0-3)
   */
  _selectAttackStyle(state, layer) {
    const attackSelector = ((layer.patternPosition * PHI) + state.rhythmicComplexity) % 1

    if (state.rhythmicComplexity > 0.7) {
      // High complexity: arpeggiated or staggered
      return attackSelector < 0.6 ? 1 : 2
    } else if (state.rhythmicComplexity > 0.4) {
      // Medium: mix of styles
      const styles = [0, 0, 1, 2]
      return styles[Math.floor(attackSelector * styles.length)]
    } else {
      // Low complexity: mostly block chords
      return attackSelector < 0.8 ? 0 : 3
    }
  }

  /**
   * Calculate per-note velocities with musical dynamics
   * @param {Object} state - Generative state
   * @param {Object} layer - Layer config
   * @param {number} baseVelocity - Base velocity
   * @param {number} noteCount - Number of notes
   * @returns {Array} Per-note velocities
   */
  _calculateChordVelocities(state, layer, baseVelocity, noteCount) {
    const velocities = []

    // Normalize phrase position to [0, 1] range for arc calculations
    // phraseLength=4: positions 0,1,2,3 map to 0, 0.33, 0.67, 1.0
    const phrasePos = layer.phraseLength > 1
      ? layer.phrasePosition / (layer.phraseLength - 1)
      : 0

    // Select arc type using PHI
    const arcSelector = ((state.evolutionCycle * PHI * 0.5) % 1)
    let arcMultiplier
    if (arcSelector < 0.4) {
      // Swell: crescendo to middle, decrescendo
      arcMultiplier = 0.85 + Math.sin(phrasePos * Math.PI) * 0.25
    } else if (arcSelector < 0.7) {
      // Fade: start strong, diminish
      arcMultiplier = 1.1 - (phrasePos * 0.3)
    } else {
      // Steady with slight PHI variation
      arcMultiplier = 0.95 + ((phrasePos * PHI) % 1) * 0.1
    }

    // Voice hierarchy: root loud, third soft, fifth medium
    const voiceWeights = [1.0, 0.85, 0.95]

    // Accent on first note of pattern
    const isAccent = layer.patternPosition === 0
    const accentBoost = isAccent ? 1.15 : 1.0

    // Tension scaling
    const tensionRange = 0.8 + (state.harmonicTension * 0.4)

    for (let i = 0; i < noteCount; i++) {
      const noteVel = baseVelocity
        * arcMultiplier
        * voiceWeights[i % voiceWeights.length]
        * accentBoost
        * tensionRange

      velocities.push(Math.max(0.1, Math.min(1.0, noteVel)))
    }

    // Advance phrase position
    layer.phrasePosition = (layer.phrasePosition + 1) % layer.phraseLength

    return velocities
  }

  /**
   * Play chord with selected attack style and velocities
   * @param {Object} synth - Tone.js synth
   * @param {Array} frequencies - Note frequencies
   * @param {number} duration - Note duration
   * @param {Array} velocities - Per-note velocities
   * @param {number} attackStyle - Attack style (0-3)
   * @param {number} triggerTime - Tone.now() time
   */
  _playChordWithStyle(synth, frequencies, duration, velocities, attackStyle, triggerTime) {
    switch (attackStyle) {
      case 1: // Arpeggiated - notes in sequence
        frequencies.forEach((freq, i) => {
          const noteTime = triggerTime + (i * 0.08)
          const noteDur = Math.max(0.1, duration - (i * 0.08))
          synth.triggerAttackRelease(freq, noteDur, noteTime, velocities[i])
        })
        break

      case 2: // Staggered - PHI-based offsets
        frequencies.forEach((freq, i) => {
          const offset = ((i * PHI) % 1) * 0.05
          const noteTime = triggerTime + offset
          synth.triggerAttackRelease(freq, duration, noteTime, velocities[i])
        })
        break

      case 3: // Broken - two notes then third
        synth.triggerAttackRelease(frequencies[0], duration, triggerTime, velocities[0])
        synth.triggerAttackRelease(frequencies[1], duration, triggerTime, velocities[1])
        const delayedTime = triggerTime + 0.15
        synth.triggerAttackRelease(frequencies[2], Math.max(0.1, duration - 0.15), delayedTime, velocities[2])
        break

      default: // Block chord (0)
        frequencies.forEach((freq, i) => {
          synth.triggerAttackRelease(freq, duration, triggerTime, velocities[i])
        })
    }
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.GenerativeMusicEngine = GenerativeMusicEngine
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GenerativeMusicEngine
}
