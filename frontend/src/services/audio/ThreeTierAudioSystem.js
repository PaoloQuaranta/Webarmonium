/**
 * ThreeTierAudioSystem.js
 * Manages three-tier audio architecture, musical scheduling, and cross-layer modulation
 * Extracted from AudioService.js for Phase 2 refactoring
 */
class ThreeTierAudioSystem {
  constructor() {
    // Three-tier audio architecture parameters
    // Volume hierarchy: background < remote < local
    this.threeTierConfig = {
      background: {
        waveform: 'triangle',
        volumeMultiplier: 0.7,  // Background quieter
        baseFrequency: 110,      // A2 - warm foundation
        color: '#4a9eff'
      },
      remote: {
        waveform: 'square',
        volumeMultiplier: 1.5,  // Slightly above background
        baseFrequency: 440,      // A4 - mid range
        color: '#ff6b6b'
      },
      local: {
        waveform: 'sawtooth',
        volumeMultiplier: 2.0,  // Most prominent (local gestures)
        baseFrequency: 880,      // A5 - bright upper register
        color: '#6bcf7f'
      }
    }

    // Parameter mapping configuration
    this.parameterMappings = {
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

    // Current parameters state
    this.currentParameters = {
      tier: 'local',
      velocity: 200,
      hysteresisThreshold: 0.15
    }

    // Musical architecture services (set externally)
    this.musicalScheduler = null
    this.lfoManager = null

    // Reference to audio components (set by AudioService)
    this.gestureSynth = null
    this.gestureFilter = null
    this.ambientFilters = null
    this.masterVolume = null
    this.generativeState = null

    // Current user ID for local/remote distinction
    this.currentUserId = null

    // Collaborative pattern state
    this.lastCollaborativePatternTime = 0
    this.lastCollaborativePatterns = null
    this.collaborativePatterns = []

    // Volume control
    this.volume = 1.0
    this.muted = false
    this.isInitialized = false

    // Active notes tracking
    this.activeNotes = new Map()

    // Duration map for note length parsing
    this.durationMap = {
      '1n': 4000, '2n': 2000, '4n': 1000, '8n': 500, '16n': 250,
      '1m': 60000, '2m': 30000, '4m': 15000
    }
  }

  /**
   * Set synth references
   * @param {Object} gestureSynth - Gesture synth instance
   * @param {Object} gestureFilter - Gesture filter instance
   */
  setSynths(gestureSynth, gestureFilter) {
    this.gestureSynth = gestureSynth
    this.gestureFilter = gestureFilter
  }

  /**
   * Set ambient filters reference
   * @param {Object} ambientFilters - Ambient filters object
   */
  setAmbientFilters(ambientFilters) {
    this.ambientFilters = ambientFilters
  }

  /**
   * Set master volume reference
   * @param {Object} masterVolume - Master volume node
   */
  setMasterVolume(masterVolume) {
    this.masterVolume = masterVolume
  }

  /**
   * Set generative state reference
   * @param {Object} generativeState - Generative state object
   */
  setGenerativeState(generativeState) {
    this.generativeState = generativeState
  }

  /**
   * Set current user ID
   * @param {string} userId - Current user ID
   */
  setCurrentUserId(userId) {
    this.currentUserId = userId
  }

  /**
   * Set initialization state
   * @param {boolean} isInitialized - Whether audio is initialized
   */
  setInitialized(isInitialized) {
    this.isInitialized = isInitialized
  }

  /**
   * Set volume and mute state
   * @param {number} volume - Volume level (0-1)
   * @param {boolean} muted - Whether muted
   */
  setVolumeState(volume, muted) {
    this.volume = volume
    this.muted = muted
  }

  /**
   * Initialize new musical architecture components
   * @param {Object} audioServiceContext - Reference to AudioService for callbacks
   */
  initializeNewMusicalArchitecture(audioServiceContext) {
    try {
      // Check if global classes are available
      if (typeof window.MusicalScheduler === 'undefined') {
        // console.warn('⚠️ MusicalScheduler not available - musical timing features disabled')
        return false
      }

      if (typeof window.LFOManager === 'undefined') {
        // console.warn('⚠️ LFOManager not available - modulation features disabled')
        return false
      }

      // Initialize Musical Scheduler
      this.musicalScheduler = new window.MusicalScheduler()

      // Initialize LFO Manager with audio context
      this.lfoManager = new window.LFOManager(audioServiceContext)

      // Start Musical Scheduler
      this.musicalScheduler.start()

      // Setup event listeners for cross-service communication
      this.setupMusicalArchitectureEvents(audioServiceContext)

      // console.log('🎵 New musical architecture initialized - MusicalScheduler and LFOManager active')
      return true
    } catch (error) {
      // console.error('🔴 Failed to initialize new musical architecture:', error)
      return false
    }
  }

  /**
   * Setup cross-service event communication
   * @param {Object} audioServiceContext - Reference to AudioService for callbacks
   */
  setupMusicalArchitectureEvents(audioServiceContext) {
    if (!this.musicalScheduler || !this.lfoManager) return

    // Musical Scheduler events
    this.musicalScheduler.on('tick', (data) => {
      this.onMusicalTick(data, audioServiceContext)
    })

    this.musicalScheduler.on('beat', (data) => {
      this.onMusicalBeat(data, audioServiceContext)
    })

    // LFO Manager events
    this.lfoManager.on('lfo:remote-sync', (data) => {
      this.onRemoteLFOSync(data, audioServiceContext)
    })
  }

  /**
   * Handle musical timing ticks
   * @param {Object} data - Tick data
   * @param {Object} audioServiceContext - AudioService context
   */
  onMusicalTick(data, audioServiceContext) {
    // Update timing-sensitive parameters on musical boundaries
    if (data.sixteenth === 0) {
      this.evolveParametersOnBeat(data, audioServiceContext)
    }
  }

  /**
   * Handle musical beats
   * @param {Object} data - Beat data
   * @param {Object} audioServiceContext - AudioService context
   */
  onMusicalBeat(data, audioServiceContext) {
    // Trigger beat-synchronized audio events
    if (this.isInitialized && !this.muted) {
      // Add subtle emphasis on downbeats
      if (data.beat === 0) {
        this.addDownbeatEmphasis()
      }
    }
  }

  /**
   * Handle remote LFO synchronization
   * @param {Object} data - LFO sync data
   * @param {Object} audioServiceContext - AudioService context
   */
  onRemoteLFOSync(data, audioServiceContext) {
    this.applyRemoteModulation(data, audioServiceContext)
  }

  /**
   * Evolve parameters on musical beat boundaries
   * @param {Object} data - Beat data
   * @param {Object} audioServiceContext - AudioService context
   */
  evolveParametersOnBeat(data, audioServiceContext) {
    // Slowly evolve background parameters
    if (this.generativeState && audioServiceContext && audioServiceContext.evolveAmbientParameters) {
      audioServiceContext.evolveAmbientParameters(data.beat, data.bar)
    }
  }

  /**
   * Add subtle emphasis on downbeats
   */
  addDownbeatEmphasis() {
    if (!this.masterVolume || !this.masterVolume.gain) return

    try {
      const currentGain = this.masterVolume.gain.value
      this.masterVolume.gain.rampTo(currentGain * 1.05, 0.05)
      setTimeout(() => {
        if (this.masterVolume && this.masterVolume.gain) {
          this.masterVolume.gain.rampTo(currentGain, 0.05)
        }
      }, 50)
    } catch (e) {
      // Ignore ramp errors
    }
  }

  /**
   * Apply remote modulation from LFOManager
   * @param {Object} data - Modulation data
   * @param {Object} audioServiceContext - AudioService context
   */
  applyRemoteModulation(data, audioServiceContext) {
    if (!data.data.modulation || !this.isInitialized) return

    const { target, amount } = data.data.modulation

    switch (target) {
      case 'filter':
        if (audioServiceContext && audioServiceContext.applyRemoteFilterModulation) {
          audioServiceContext.applyRemoteFilterModulation(amount)
        }
        break
      case 'volume':
        if (audioServiceContext && audioServiceContext.applyRemoteVolumeModulation) {
          audioServiceContext.applyRemoteVolumeModulation(amount)
        }
        break
      case 'pan':
        if (audioServiceContext && audioServiceContext.applyRemotePanModulation) {
          audioServiceContext.applyRemotePanModulation(amount)
        }
        break
    }
  }

  /**
   * Schedule a musical event with clock-consistent timing
   * @param {Function} callback - Event callback
   * @param {Object} data - Event data
   * @param {boolean} isRemote - Whether event is from remote user
   * @param {number} timestamp - Event timestamp
   * @returns {*} Scheduled event reference
   */
  scheduleMusicalEvent(callback, data, isRemote = false, timestamp = null) {
    if (!this.musicalScheduler) {
      // Fallback to direct execution if scheduler not available
      callback(data)
      return
    }

    if (isRemote) {
      return this.musicalScheduler.scheduleRemoteEvent(callback, data, timestamp)
    } else {
      return this.musicalScheduler.scheduleLocalEvent(callback, data)
    }
  }

  /**
   * Update collaborative patterns from remote users
   * @param {Array} patterns - Sound patterns from other users
   * @param {Function} updateBackgroundFilters - Callback to update filters
   */
  updatePatterns(patterns, updateBackgroundFilters) {
    if (!this.isInitialized || this.muted) {
      // console.log('🔇 updatePatterns blocked - initialized:', this.isInitialized, 'muted:', this.muted)
      return
    }

    // Rate limiting: prevent spamming collaborative patterns
    const now = Date.now()
    if (this.lastCollaborativePatternTime && (now - this.lastCollaborativePatternTime < 500)) {
      // console.log('🔇 Collaborative patterns rate limited')
      return
    }
    this.lastCollaborativePatternTime = now

    // Store patterns for later processing
    this.collaborativePatterns = patterns || []
    // console.log('🎵 Updated collaborative patterns:', patterns?.length || 0)

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

      // console.log(`🎵 User influence updated: ${this.generativeState.userInfluence.toFixed(2)}, complexity: ${this.generativeState.complexity.toFixed(2)}`)
    }

    // Check if patterns are the same as last time to avoid repetition
    if (this.lastCollaborativePatterns && this.arePatternsEqual(this.lastCollaborativePatterns, patterns)) {
      // console.log('🔇 Skipping duplicate collaborative patterns')
      return
    }
    this.lastCollaborativePatterns = [...(patterns || [])]

    // Apply filter modulation from remote patterns
    if (patterns && patterns.length > 0 && updateBackgroundFilters) {
      // Calculate average position for filter modulation
      const avgPosition = {
        x: patterns.reduce((sum, p) => sum + (p.x || 0.5), 0) / patterns.length,
        y: patterns.reduce((sum, p) => sum + (p.y || 0.5), 0) / patterns.length,
        z: patterns.reduce((sum, p) => sum + (p.z || 0.5), 0) / patterns.length
      }

      // Apply remote filter modulation to background
      updateBackgroundFilters(avgPosition)
      // console.log(`🎛️ Applied remote filter modulation: x=${avgPosition.x.toFixed(2)}, y=${avgPosition.y.toFixed(2)}`)
    }

    // Play audio feedback for each pattern from remote users
    if (patterns && patterns.length > 0 && this.gestureSynth) {
      this.playRemotePatterns(patterns)
    }
  }

  /**
   * Play audio feedback for remote patterns
   * @param {Array} patterns - Remote user patterns
   */
  playRemotePatterns(patterns) {
    if (!this.gestureSynth || this.gestureSynth.disposed) return

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

        // Short duration to prevent hanging
        const duration = 0.15

        // Track note for cleanup
        const now = typeof Tone !== 'undefined' ? Tone.context.currentTime : 0
        this.activeNotes.set(noteId, {
          frequency,
          startTime: now,
          synth: this.gestureSynth
        })

        // Play note with delay
        setTimeout(() => {
          if (this.gestureSynth && !this.gestureSynth.disposed) {
            this.gestureSynth.triggerAttackRelease(frequency, duration, undefined, velocity)
          }
          // Remove from tracking after note ends
          setTimeout(() => {
            this.activeNotes.delete(noteId)
          }, duration * 1000 + 100)
        }, delay * 1000)

      } catch (e) {
        // console.warn(`⚠️ Error playing remote pattern ${index}:`, e.message)
      }
    })
  }

  /**
   * Check if two pattern arrays are equal
   * @param {Array} patterns1 - First patterns array
   * @param {Array} patterns2 - Second patterns array
   * @returns {boolean} True if equal
   */
  arePatternsEqual(patterns1, patterns2) {
    if (!patterns1 || !patterns2) return false
    if (patterns1.length !== patterns2.length) return false

    return patterns1.every((p1, i) => {
      const p2 = patterns2[i]
      return Math.abs((p1.x || 0) - (p2.x || 0)) < 0.01 &&
             Math.abs((p1.y || 0) - (p2.y || 0)) < 0.01
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
      // console.warn(`Unknown tier: ${tier}, falling back to local`)
      tier = 'local'
    }

    // Calculate frequency based on tier and velocity
    const adjustedFrequency = this.calculateThreeTierFrequency(frequency, tier, velocity)
    const adjustedVolume = this.calculateThreeTierVolume(tier, options.volume || 0.5)
    const adjustedDuration = this.calculateThreeTierDuration(velocity, options.duration || '8n')

    // console.log(`🎵 Playing ${tierConfig.waveform} note on ${tier} tier: ${adjustedFrequency}Hz, velocity: ${velocity}`)

    // Configure synth with tier-specific waveform
    this.gestureSynth.set({
      oscillator: { type: tierConfig.waveform },
      envelope: { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.3 }
    })

    // Play note with tier-specific parameters
    this.gestureSynth.triggerAttackRelease(
      adjustedFrequency,
      adjustedDuration,
      undefined,
      adjustedVolume
    )
  }

  /**
   * Calculate frequency for three-tier architecture
   * @param {number} baseFrequency - Base frequency
   * @param {string} tier - Audio tier
   * @param {number} velocity - Gesture velocity
   * @returns {number} Adjusted frequency
   */
  calculateThreeTierFrequency(baseFrequency, tier, velocity) {
    const tierConfig = this.threeTierConfig[tier]
    if (!tierConfig) return baseFrequency

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
   * @param {string} tier - Audio tier
   * @param {number} baseVolume - Base volume
   * @returns {number} Adjusted volume
   */
  calculateThreeTierVolume(tier, baseVolume) {
    const tierConfig = this.threeTierConfig[tier]
    if (!tierConfig) return baseVolume * this.volume

    return baseVolume * tierConfig.volumeMultiplier * this.volume
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
   * @param {string|number} duration - Duration to parse
   * @returns {number} Duration in milliseconds
   */
  parseDuration(duration) {
    if (typeof duration === 'number') return duration
    if (typeof duration !== 'string') return 500

    return this.durationMap[duration] || 500
  }

  /**
   * Handle gesture with three-tier velocity mapping
   * @param {Object} gestureData - Gesture data
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

    // console.log(`🎹 Three-tier gesture: tier=${tier}, velocity=${gestureData.velocity}, freq=${baseFreq}`)
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
      // console.warn('🔇 Hover data missing or invalid position, skipping modulation')
      return
    }

    // console.log(`🎛️ Cross-layer hover modulation: userId=${userId}, intensity=${intensity}`)

    // Local user hover modulates:
    // 1. Background filters (low-mid frequency range)
    // 2. Remote gesture filters (mid-high frequency range)
    if (!userId || userId === this.currentUserId) {
      this.modulateBackgroundFilters(position, intensity * 0.7)
      this.modulateRemoteGestureFilters(position, intensity * 0.5)
    }

    // Remote user hover modulates:
    // Only local gesture filters (high frequency range)
    if (userId && userId !== this.currentUserId) {
      this.modulateLocalGestureFilters(position, intensity * 0.8)
    }
  }

  /**
   * Modulate background filters (low-mid frequency range)
   * @param {Object} position - Position data
   * @param {number} intensity - Modulation intensity
   */
  modulateBackgroundFilters(position, intensity) {
    if (!this.ambientFilters || typeof Tone === 'undefined' || !Tone.context) return

    // Bass layer: 100-400Hz range
    const bassFilter = this.ambientFilters.bass
    if (!bassFilter) return

    const baseFreq = 250
    const modFreq = baseFreq + (position.y || 0.5) * 150 * intensity

    try {
      bassFilter.frequency.linearRampToValueAtTime(
        modFreq,
        Tone.context.currentTime + 0.1
      )

      bassFilter.Q.linearRampToValueAtTime(
        2 + intensity * 3,
        Tone.context.currentTime + 0.1
      )
    } catch (e) {
      // Ignore ramp errors
    }
  }

  /**
   * Modulate remote gesture filters (mid-high frequency range)
   * @param {Object} position - Position data
   * @param {number} intensity - Modulation intensity
   */
  modulateRemoteGestureFilters(position, intensity) {
    if (!this.ambientFilters || typeof Tone === 'undefined' || !Tone.context) return

    // Pad layer: 400-1200Hz range
    const padFilter = this.ambientFilters.pad
    if (!padFilter) return

    const baseFreq = 800
    const modFreq = baseFreq + (position.x || 0.5) * 400 * intensity

    try {
      padFilter.frequency.linearRampToValueAtTime(
        modFreq,
        Tone.context.currentTime + 0.08
      )

      padFilter.Q.linearRampToValueAtTime(
        3 + intensity * 4,
        Tone.context.currentTime + 0.08
      )
    } catch (e) {
      // Ignore ramp errors
    }
  }

  /**
   * Modulate local gesture filters (high frequency range)
   * @param {Object} position - Position data
   * @param {number} intensity - Modulation intensity
   */
  modulateLocalGestureFilters(position, intensity) {
    if (!this.ambientFilters || typeof Tone === 'undefined' || !Tone.context) return

    // Chords layer: 800-2000Hz range
    const chordsFilter = this.ambientFilters.chords
    if (!chordsFilter) return

    const baseFreq = 1400
    const modFreq = baseFreq + (position.x || 0.5) * 600 * intensity

    try {
      chordsFilter.frequency.linearRampToValueAtTime(
        modFreq,
        Tone.context.currentTime + 0.05
      )

      chordsFilter.Q.linearRampToValueAtTime(
        5 + intensity * 8,
        Tone.context.currentTime + 0.05
      )
    } catch (e) {
      // Ignore ramp errors
    }
  }

  /**
   * Get tier configuration
   * @param {string} tier - Tier name
   * @returns {Object} Tier configuration
   */
  getTierConfig(tier) {
    return this.threeTierConfig[tier] || this.threeTierConfig.local
  }

  /**
   * Get current parameters
   * @returns {Object} Current parameters
   */
  getCurrentParameters() {
    return { ...this.currentParameters }
  }

  /**
   * Get collaborative patterns
   * @returns {Array} Current collaborative patterns
   */
  getCollaborativePatterns() {
    return [...this.collaborativePatterns]
  }

  /**
   * Cleanup hanging notes
   * @param {number} maxDuration - Maximum duration in seconds
   */
  cleanupHangingNotes(maxDuration = 2.0) {
    if (this.activeNotes.size === 0) return

    const now = typeof Tone !== 'undefined' ? Tone.context.currentTime : Date.now() / 1000

    this.activeNotes.forEach((noteData, noteId) => {
      if (now - noteData.startTime > maxDuration) {
        try {
          if (noteData.synth && !noteData.synth.disposed) {
            noteData.synth.triggerRelease(noteData.frequency)
          }
          this.activeNotes.delete(noteId)
          // console.log(`🔇 Force-released hanging note: ${noteData.frequency.toFixed(1)}Hz`)
        } catch (e) {
          this.activeNotes.delete(noteId)
        }
      }
    })
  }

  /**
   * Stop musical scheduler
   */
  stopMusicalScheduler() {
    if (this.musicalScheduler) {
      this.musicalScheduler.stop()
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopMusicalScheduler()
    this.activeNotes.clear()
    this.collaborativePatterns = []
    this.lastCollaborativePatterns = null
    this.gestureSynth = null
    this.gestureFilter = null
    this.ambientFilters = null
    this.masterVolume = null
    this.generativeState = null
    // console.log('ThreeTierAudioSystem cleanup completed')
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.ThreeTierAudioSystem = ThreeTierAudioSystem
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThreeTierAudioSystem
}
