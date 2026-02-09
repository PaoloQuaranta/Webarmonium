/**
 * UserSynthManager.js
 * Manages per-user synth instances with unique timbres
 * Each user gets a dedicated synth based on their patch definition
 */
// console.log('📦 UserSynthManager.js LOADING...')

class UserSynthManager {
  /**
   * @param {Object} options - Configuration options
   * @param {Tone.Volume} options.masterVolume - Master volume node to connect to
   * @param {Tone.FeedbackDelay} options.delay - Delay effect bus
   * @param {Tone.Reverb} options.reverb - Reverb effect bus
   */
  constructor(options = {}) {
    this.masterVolume = options.masterVolume || null
    this.delay = options.delay || null
    this.reverb = options.reverb || null

    // Map<userId, { synth, filter, volume, pan, delaySend, reverbSend }>
    this.userSynths = new Map()

    // Map<userId, drumKit> - cached drum kits for remote users
    this.userDrumKits = new Map()

    // Track active notes per user for cleanup
    this.activeNotes = new Map()  // Map<noteId, userId>

    // MONOPHONY: Each user can only play ONE note at a time
    // This is a core architectural requirement - no chords per user
    this.maxPolyphonyPerUser = 1

    // Get patch definitions
    this.patchDefinitions = window.PatchDefinitions || null
    if (this.patchDefinitions) {
      // console.log('✅ UserSynthManager: PatchDefinitions available')
    } else {
      console.error('❌ UserSynthManager: PatchDefinitions NOT available - synths cannot be created!')
    }

    // Persistent set of userIds with custom synth params
    // Survives synth cleanup/recreation during preset changes and late-join races
    this.usersWithCustomParams = new Set()

    // Slot lookup function - will be set by AudioService to use backend-assigned slots
    // Falls back to hash if not set
    this.slotLookupFn = null

    // OPTIMIZATION: Synth pooling and automatic cleanup
    // Detect browser to set appropriate synth limits (Safari has 1000 node limit)
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const isFirefox = /firefox/i.test(navigator.userAgent)
    this.maxSynths = isSafari ? 8 : (isFirefox ? 10 : 12)  // Browser-specific limits

    // CRITICAL: Extended thresholds to prevent cleanup during long release envelopes
    this.IDLE_THRESHOLD = 90000  // 90 seconds (not 60)
    this.RELEASE_BUFFER = 10000  // 10 seconds for longest release envelopes

    // Start automatic cleanup interval (every 30 seconds)
    this.cleanupInterval = setInterval(() => this._cleanupInactiveSynths(), 30000)
    // console.log(`✅ UserSynthManager: Auto-cleanup started (max ${this.maxSynths} synths)`)
  }

  /**
   * Set the slot lookup function (called by AudioService)
   * @param {Function} fn - Function that takes userId and returns slot (0-3) or null
   */
  setSlotLookup(fn) {
    this.slotLookupFn = fn
    // console.log('✅ UserSynthManager: slotLookupFn set')
  }

  /**
   * Set audio nodes for routing (can be set after construction)
   */
  setAudioNodes(masterVolume, delay, reverb) {
    this.masterVolume = masterVolume
    this.delay = delay
    this.reverb = reverb
  }

  /**
   * Entry #175b: Set current style for genre-aware playback
   * Entry #183: Now detects changes in all relevant fields, not just genre
   * @param {Object} style - Style object with dominantGenre, genreWeights, energy, currentBPM, synthParams
   */
  setCurrentStyle(style) {
    if (!style) return

    // Entry #183: Check if any relevant field has changed
    const hasChanged = !this.currentStyle ||
      this.currentStyle.dominantGenre !== style.dominantGenre ||
      this.currentStyle.forcedGenre !== style.forcedGenre ||
      this.currentStyle.currentBPM !== style.currentBPM ||
      this.currentStyle.energy !== style.energy ||
      // Deep compare synthParams if present (stringify is safe for small objects)
      JSON.stringify(this.currentStyle.synthParams) !== JSON.stringify(style.synthParams)

    if (!hasChanged) return

    this.currentStyle = style
    this.applyStyleToAllSynths(style)
  }

  /**
   * Entry #175b: Apply genre-specific envelope to all existing user synths
   * Entry #180: Now also applies filter modulation for genre-specific timbre
   * Entry #180b: Prioritizes backend synthParams, minimal local fallbacks
   * @param {Object} style - Style object with dominantGenre, synthParams (defaults to 'ambient' if missing)
   */
  applyStyleToAllSynths(style) {
    // Entry #175b fix: Default to 'ambient' if no style or dominantGenre
    const genre = style?.dominantGenre || 'ambient'

    // Entry #180b: Backend synthParams is the primary source of truth
    // These come from GenreCharacteristics.js on backend
    const synthParams = style?.synthParams || null

    // Entry #180b: Minimal safe fallback defaults (only used if backend doesn't send synthParams)
    // These should match GenreCharacteristics.melodic as a reasonable middle ground
    const SAFE_DEFAULTS = {
      filterCutoff: 1800,
      filterQ: 0.6,
      attackTime: 0.03,
      releaseTime: 0.4,
      decay: 0.25,
      sustain: 0.6
    }

    // Use backend synthParams exclusively if available
    const filterFreq = synthParams?.filterCutoff ?? SAFE_DEFAULTS.filterCutoff
    const filterQ = synthParams?.filterQ ?? SAFE_DEFAULTS.filterQ
    const envAttack = synthParams?.attackTime ?? SAFE_DEFAULTS.attackTime
    const envRelease = synthParams?.releaseTime ?? SAFE_DEFAULTS.releaseTime
    const envDecay = synthParams?.decayTime ?? SAFE_DEFAULTS.decay
    const envSustain = synthParams?.sustainLevel ?? SAFE_DEFAULTS.sustain

    // Apply to all synths
    for (const [userId, synthData] of this.userSynths) {
      if (synthData.disposing) continue

      // Skip users with custom synth params (set via SynthPanel)
      // Check both per-synth flag AND persistent Set (covers recreation race window)
      if (synthData.hasCustomParams || this.usersWithCustomParams.has(userId)) continue

      try {
        // Apply envelope
        if (synthData.synth?.set) {
          synthData.synth.set({
            envelope: {
              attack: envAttack,
              decay: envDecay,
              sustain: envSustain,
              release: envRelease
            }
          })
        }

        // Entry #180: Apply filter modulation
        if (synthData.filter && !synthData.filter.disposed) {
          // Use rampTo for smooth transitions
          synthData.filter.frequency.rampTo(filterFreq, 0.5)
          synthData.filter.Q.rampTo(filterQ, 0.5)
        }
      } catch (e) {
        // Synth may be disposed, ignore
      }
    }

    // Entry #181: Apply delay feedback and delay time to shared delay node
    // Entry #181b: Add proper initialization checks to prevent race conditions
    if (synthParams && this.delay && !this.delay.disposed) {
      try {
        if (synthParams.delayFeedback !== undefined && this.delay.feedback) {
          this.delay.feedback.rampTo(synthParams.delayFeedback, 0.5)
        }
        if (synthParams.delayTime !== undefined && this.delay.delayTime) {
          this.delay.delayTime.rampTo(synthParams.delayTime, 0.5)
        }
      } catch (e) {
        // Delay may not be ready, ignore
      }
    }

    // console.log(`🎨 [Genre] Applied ${genre}: filter=${filterFreq}Hz Q=${filterQ}, attack=${envAttack}s`)
  }

  /**
   * Entry #175b: Get velocity multiplier based on genre
   * Entry #180: Expanded to all genres
   * @param {Object} style - Style object with dominantGenre
   * @returns {number} Velocity multiplier (0.6 - 1.4)
   */
  getVelocityMultiplier(style) {
    const multipliers = {
      ambient: 0.6,
      classical: 0.8,
      melodic: 1.0,
      jazz: 1.0,
      pop: 1.0,
      electronic: 1.2,
      rhythmic: 1.2,
      experimental: 1.1,
      rock: 1.4
    }
    return multipliers[style?.dominantGenre] || 1.0
  }

  /**
   * Get slot for a real user - uses backend-assigned slot if available, falls back to hash
   * @param {string} userId - The user ID
   * @returns {number} Slot number (0-3), or -1 for virtual users
   */
  getUserSlot(userId) {
    if (!this.patchDefinitions) return 0

    // Virtual users don't need slots - they have dedicated patches
    if (this.patchDefinitions.isVirtualUser(userId)) {
      return -1
    }

    // Use backend-assigned slot if lookup function is available
    if (this.slotLookupFn) {
      const backendSlot = this.slotLookupFn(userId)
      // console.log(`🔍 SLOT LOOKUP: userId=${userId?.substring(0, 8)}, backendSlot=${backendSlot}, hasLookupFn=true`)
      if (backendSlot !== null && backendSlot !== undefined) {
        return backendSlot
      }
      // Fall through to hash if lookup returned null (user not in room yet)
    } else {
    }

    // Fallback: Simple hash from userId string to get consistent slot
    // EXPANDED: Use % 8 to match expanded backend pool (prevents slot collision during race conditions)
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i)
      hash = hash & hash // Convert to 32-bit integer
    }
    const hashSlot = Math.abs(hash) % 8
    // console.log(`🔍 HASH FALLBACK: userId=${userId?.substring(0, 8)}, hashSlot=${hashSlot}`)
    return hashSlot
  }

  /**
   * Get the synth data for a user, creating if necessary
   * @param {string} userId - The user ID
   * @returns {Object} { synth, filter, volume, pan, patch }
   */
  getSynthForUser(userId) {
    if (!userId) {
      return null
    }

    const existing = this.userSynths.get(userId)

    // If synth exists but is being disposed, don't use it
    if (existing && existing.disposing) {
      return null
    }

    if (!existing) {
      this.createSynthForUser(userId)

      // Verify creation succeeded
      if (!this.userSynths.has(userId)) {
        console.error(`Failed to create synth for user ${userId}`)
        return null
      }
    }

    return this.userSynths.get(userId)
  }

  /**
   * Create a new synth for a user based on their patch definition
   * @param {string} userId - The user ID
   */
  createSynthForUser(userId) {
    if (!this.patchDefinitions || typeof Tone === 'undefined') {
      return
    }

    const slot = this.getUserSlot(userId)
    const patch = this.patchDefinitions.getPatchForUser(userId, slot)

    if (!patch) {
      return
    }

    try {
      // Create synth based on patch oscillator type
      // FIX: Tone.js PolySynth expects voice options at top level, NOT nested in 'options'
      let synth
      const oscillatorConfig = patch.oscillator

      // DEBUG: Show all current synth assignments
      // const existingAssignments = Array.from(this.userSynths.entries()).map(([uid, data]) =>
      //   `${uid.substring(0,8)}→${data.patch?.name || '?'}`
      // ).join(', ')
      // console.log(`🎹 NEW SYNTH: user=${userId.substring(0,8)}, patch="${patch.name}", slot=${slot}, osc=${oscillatorConfig.type}`)
      // console.log(`   Current synths: [${existingAssignments || 'none'}]`)

      // MONOPHONY: Use MonoSynth instead of PolySynth for true monophonic behavior
      // MonoSynth is structurally monophonic - only one note can play at a time
      if (oscillatorConfig.type === 'fmsine') {
        // FM Synthesis - use FMSynth directly (inherently monophonic)
        synth = new Tone.FMSynth({
          modulationIndex: oscillatorConfig.modulationIndex || 3,
          modulationType: oscillatorConfig.modulationType || 'sine',
          envelope: patch.envelope
        })
      } else if (oscillatorConfig.type === 'pulse') {
        // Pulse wave - MonoSynth with pulse oscillator
        synth = new Tone.MonoSynth({
          oscillator: {
            type: 'pulse',
            width: oscillatorConfig.width || 0.5
          },
          envelope: patch.envelope
        })
      } else if (oscillatorConfig.type.startsWith('fat')) {
        // Fat oscillators - MonoSynth with fat oscillator
        synth = new Tone.MonoSynth({
          oscillator: {
            type: oscillatorConfig.type,
            count: oscillatorConfig.count || 3,
            spread: oscillatorConfig.spread || 20
          },
          envelope: patch.envelope
        })
      } else {
        // Basic oscillator types (sine, sawtooth, triangle, square)
        synth = new Tone.MonoSynth({
          oscillator: {
            type: oscillatorConfig.type
          },
          envelope: patch.envelope
        })
      }

      // console.log(`✅ Synth created for ${userId}: oscillator type should be ${oscillatorConfig.type}`)

      // Create filter based on patch
      const filterConfig = patch.filter
      const filter = new Tone.Filter({
        type: filterConfig.type || 'lowpass',
        frequency: filterConfig.frequency || 2000,
        Q: filterConfig.Q || 1
      })

      // Create volume node
      // Entry #46 FIX: Limit patch volume to prevent clipping and speaker damage
      // High volume patches could cause distortion if multiple play simultaneously
      // Safety limit for patch volumes (patches now range -1 to +6 dB)
      const MAX_PATCH_VOLUME_DB = 6  // Safety limit - prevents clipping with multiple simultaneous users
      const patchVolume = Math.min(patch.volume || 0, MAX_PATCH_VOLUME_DB)
      if (patch.volume > MAX_PATCH_VOLUME_DB) {
      }
      const volume = new Tone.Volume(patchVolume)

      // Create panner for stereo placement (virtual users get fixed positions)
      let panValue = 0
      if (this.patchDefinitions.isVirtualUser(userId)) {
        // Virtual users: Wikipedia left, HackerNews center, GitHub right
        if (userId === 'wikipedia-metrics') panValue = -0.5
        else if (userId === 'github-metrics') panValue = 0.5
        // hackernews-metrics stays at center (0)
      } else {
        // Real users: slight spread based on slot (11 slots: 0-7 synth, 8-10 drum)
        // Map slot 0-7 to pan -0.7 to +0.7, drum slots 8-10 center
        panValue = slot >= 8 ? 0 : ((slot % 8) - 3.5) * 0.2
      }
      // DEFENSIVE: Clamp pan value to valid range [-1, 1]
      panValue = Math.max(-1, Math.min(1, panValue))
      const pan = new Tone.Panner(panValue)

      // Connect signal chain: synth -> filter -> volume -> pan -> master
      synth.connect(filter)
      filter.connect(volume)
      volume.connect(pan)

      // DEFENSIVE: Check if masterVolume is a valid Tone.js node before connecting
      // This prevents errors when audio nodes aren't fully initialized (e.g., Reverb not ready)
      if (this.masterVolume && typeof this.masterVolume.input !== 'undefined') {
        try {
          pan.connect(this.masterVolume)
        } catch (e) {
          pan.toDestination()
        }
      } else {
        pan.toDestination()
      }

      // Create send nodes for effects
      let delaySend = null
      let reverbSend = null

      // DEFENSIVE: Validate delay node before connecting
      if (this.delay && typeof this.delay.input !== 'undefined' && patch.effects?.delaySend > 0) {
        try {
          delaySend = new Tone.Gain(patch.effects.delaySend)
          volume.connect(delaySend)
          delaySend.connect(this.delay)
        } catch (e) {
          delaySend = null
        }
      }

      // DEFENSIVE: Validate reverb node before connecting
      if (this.reverb && typeof this.reverb.input !== 'undefined' && patch.effects?.reverbSend > 0) {
        try {
          reverbSend = new Tone.Gain(patch.effects.reverbSend)
          volume.connect(reverbSend)
          reverbSend.connect(this.reverb)
        } catch (e) {
          reverbSend = null
        }
      }

      // Store synth data (includes lastTriggerTime for MonoSynth timing safety)
      this.userSynths.set(userId, {
        synth,
        filter,
        volume,
        pan,
        delaySend,
        reverbSend,
        patch,
        slot,
        lastTriggerTime: 0,  // Track last trigger time to prevent MonoSynth timing errors
        hasCustomParams: this.usersWithCustomParams.has(userId)  // Restore flag if user had custom params before synth recreation
      })

      // console.log(`Created synth for ${userId}: ${patch.name} (oscillator: ${oscillatorConfig.type})`)

    } catch (error) {
      console.error(`Failed to create synth for ${userId}:`, error)
    }
  }

  /**
   * Constrain a frequency to the tessitura range of a user
   * Uses octave wrapping for musical results
   * @param {number} frequency - The input frequency
   * @param {string} userId - The user ID
   * @returns {number} The constrained frequency
   */
  constrainFrequencyToTessitura(frequency, userId) {
    if (!userId || !this.patchDefinitions) {
      return frequency
    }

    const slot = this.getUserSlot(userId)
    const patch = this.patchDefinitions.getPatchForUser(userId, slot)

    if (!patch || !patch.frequencyRange) {
      return frequency  // No tessitura constraint for real users
    }

    const { min, max } = patch.frequencyRange

    // CRITICAL: Validate input to prevent infinite loops
    // frequency = 0, NaN, Infinity, or negative would cause while loops to never exit
    if (!isFinite(frequency) || frequency <= 0) {
      return min
    }

    let constrainedFreq = Math.abs(frequency)  // Force positive
    const MAX_ITERATIONS = 20  // Safety limit (~20 octaves covers all audible range)
    let iterations = 0

    // Octave wrapping - move to nearest octave within range
    while (constrainedFreq < min && iterations < MAX_ITERATIONS) {
      constrainedFreq *= 2  // Up an octave
      iterations++
    }

    iterations = 0
    while (constrainedFreq > max && iterations < MAX_ITERATIONS) {
      constrainedFreq /= 2  // Down an octave
      iterations++
    }

    // Final clamp in case of edge cases
    return Math.max(min, Math.min(max, constrainedFreq))
  }

  /**
   * Trigger a note attack on a user's synth
   * @param {string} userId - The user ID
   * @param {number} frequency - Note frequency
   * @param {number} velocity - Note velocity (0-1)
   * @param {boolean} isRemote - Whether this is a remote user's note (reduces volume)
   * @returns {string|null} Note ID for tracking, or null on failure
   */
  triggerAttack(userId, frequency, velocity, isRemote = false) {
    const synthData = this.getSynthForUser(userId)
    if (!synthData) {
      return null
    }

    try {
      // OPTIMIZATION: Track usage for cleanup logic
      synthData.lastUsedTime = Date.now()
      synthData.isPlaying = true

      // Apply tessitura constraint
      const constrainedFreq = this.constrainFrequencyToTessitura(frequency, userId)

      // Entry #175b fix: Apply genre-based velocity multiplier
      const genreMultiplier = this.getVelocityMultiplier(this.currentStyle)
      // All users play at equal velocity - no remote reduction
      const finalVelocity = velocity * genreMultiplier

      // Trigger the note
      synthData.synth.triggerAttack(constrainedFreq, Tone.now(), finalVelocity)

      // Generate note ID for tracking
      const noteId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      this.activeNotes.set(noteId, { userId, frequency: constrainedFreq })

      return noteId

    } catch (error) {
      console.error(`Failed to trigger attack for ${userId}:`, error)
      return null
    }
  }

  /**
   * Release a specific note
   * @param {string} noteId - The note ID from triggerAttack
   */
  triggerRelease(noteId) {
    const noteData = this.activeNotes.get(noteId)
    if (!noteData) {
      return
    }

    const synthData = this.userSynths.get(noteData.userId)
    if (synthData) {
      try {
        // OPTIMIZATION: Track state for cleanup logic
        synthData.isPlaying = false
        synthData.lastUsedTime = Date.now()

        // MonoSynth.triggerRelease(time?) does NOT take frequency argument
        synthData.synth.triggerRelease(Tone.now())
      } catch (error) {
        // Note may have already been released
      }
    }

    this.activeNotes.delete(noteId)
  }

  /**
   * Trigger attack and release with duration
   * @param {string} userId - The user ID
   * @param {number} frequency - Note frequency
   * @param {string|number} duration - Note duration (e.g., '4n' or seconds)
   * @param {number} velocity - Note velocity (0-1)
   * @param {boolean} isRemote - Whether this is a remote user's note
   */
  triggerAttackRelease(userId, frequency, duration, velocity, isRemote = false) {
    const synthData = this.getSynthForUser(userId)
    if (!synthData) {
      return
    }

    try {
      const constrainedFreq = this.constrainFrequencyToTessitura(frequency, userId)
      // Entry #175b fix: Apply genre-based velocity multiplier
      const genreMultiplier = this.getVelocityMultiplier(this.currentStyle)
      // All users play at equal velocity - no remote reduction
      const finalVelocity = velocity * genreMultiplier

      // MONOSYNTH TIMING FIX: Ensure strictly increasing start times
      const now = Tone.now()
      const lastTime = synthData.lastTriggerTime || 0
      const minGap = 0.005  // 5ms minimum gap between notes
      const safeTime = Math.max(now, lastTime + minGap)

      // Update last trigger time
      synthData.lastTriggerTime = safeTime

      try {
        synthData.synth.triggerAttackRelease(
          constrainedFreq,
          duration,
          safeTime,
          finalVelocity
        )
      } catch (triggerErr) {
        // If still failing, force release and retry with fresh timing
        try {
          synthData.synth.triggerRelease()
          const freshTime = Tone.now() + 0.01
          synthData.lastTriggerTime = freshTime
          synthData.synth.triggerAttackRelease(constrainedFreq, duration, freshTime, finalVelocity)
        } catch (retryErr) {
          // Silently fail - note will be skipped
        }
      }

    } catch (error) {
      console.error(`Failed to trigger attack/release for ${userId}:`, error)
    }
  }

  /**
   * Play a drum hit for a remote user
   * Creates/caches a drum kit per user using PatchDefinitions defaults
   * @param {string} userId - Remote user ID
   * @param {string} instrument - 'bd', 'sn', or 'hh'
   * @param {number} velocity - Hit velocity (0-1)
   * @param {number} presetSlot - Drum kit preset slot (8-10), defaults to 8
   */
  playDrumHit (userId, instrument, velocity = 0.7, presetSlot = 8) {
    if (!userId || !instrument) return

    try {
      let kit = this.userDrumKits.get(userId)

      // Create drum kit if not cached (use actual preset slot for correct timbre)
      if (!kit) {
        const patchDefs = this.patchDefinitions || window.PatchDefinitions
        const drumPatch = patchDefs?.REAL_USER_PATCHES?.[presetSlot] ||
                          patchDefs?.REAL_USER_PATCHES?.[8] // Fallback to 808
        if (!drumPatch || drumPatch.type !== 'drum') return

        const inst = drumPatch.instruments
        kit = {}

        // BD: MembraneSynth
        kit.bd = new Tone.MembraneSynth({
          pitchDecay: 0.05 + inst.bd.pitch * 0.3,
          octaves: 2 + inst.bd.tone * 6,
          envelope: { attack: 0.001, decay: 0.05 + inst.bd.decay * 1.45, sustain: 0, release: 0.1 }
        })
        kit.bd.frequency.value = 30 + inst.bd.pitch * 60

        // SN: MembraneSynth + NoiseSynth
        kit.snBody = new Tone.MembraneSynth({
          pitchDecay: 0.02, octaves: 3,
          envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 }
        })
        kit.snBody.frequency.value = 120 + inst.sn.pitch * 180
        kit.snNoise = new Tone.NoiseSynth({
          noise: { type: 'white' },
          envelope: { attack: 0.001, decay: 0.05 + inst.sn.decay * 0.45, sustain: 0, release: 0.01 }
        })
        kit.snFilter = new Tone.Filter({ type: 'bandpass', frequency: 1000 + inst.sn.tone * 7000, Q: 1.5 })
        kit.snMerge = new Tone.Gain(1)
        kit.snBody.connect(kit.snMerge)
        kit.snNoise.connect(kit.snFilter)
        kit.snFilter.connect(kit.snMerge)

        // HH: MetalSynth — resonance=300 keeps highpass below fundamental so partials pass through
        kit.hh = new Tone.MetalSynth({
          frequency: 200 + inst.hh.pitch * 600,
          envelope: { attack: 0.001, decay: 0.08 + inst.hh.decay * 0.32, release: 0.05 },
          harmonicity: 5.1 + inst.hh.tone * 3, resonance: 300, octaves: 4, volume: -6
        })

        // Connect all to master volume
        if (this.masterVolume) {
          const gain = new Tone.Gain(0.7)
          kit.bd.connect(gain)
          kit.snMerge.connect(gain)
          kit.hh.connect(gain)
          gain.connect(this.masterVolume)
          kit.outputGain = gain
        }

        kit.lastUsedTime = Date.now()
        this.userDrumKits.set(userId, kit)
      }

      kit.lastUsedTime = Date.now()

      // Trigger hit
      const now = Tone.now()
      const safeTime = Math.max(now, (kit.lastTriggerTime || 0) + 0.01)
      kit.lastTriggerTime = safeTime
      const vel = Math.max(0.1, Math.min(1.0, velocity))

      switch (instrument) {
        case 'bd':
          kit.bd.triggerAttackRelease('C1', '8n', safeTime, vel)
          break
        case 'sn':
          kit.snBody.triggerAttackRelease('E1', '16n', safeTime, vel * 0.6)
          kit.snNoise.triggerAttackRelease('16n', safeTime, vel)
          break
        case 'hh':
          kit.hh.triggerAttackRelease(kit.hh.frequency.value, '16n', safeTime, vel)
          break
      }
    } catch (error) {
      console.warn(`[UserSynthManager] playDrumHit failed for ${userId}:`, error.message)
    }
  }

  /**
   * Cleanup a user's cached drum kit
   * @param {string} userId
   */
  cleanupUserDrumKit (userId) {
    const kit = this.userDrumKits.get(userId)
    if (!kit) return

    const nodes = [
      kit.bd, kit.snBody, kit.snNoise, kit.snFilter, kit.snMerge,
      kit.hh, kit.outputGain
    ]
    nodes.forEach(n => {
      if (n && !n.disposed) {
        try { n.disconnect(); n.dispose() } catch (e) { /* already disposed */ }
      }
    })
    this.userDrumKits.delete(userId)
  }

  /**
   * OPTIMIZATION: Automatic cleanup of inactive synths
   * Runs every 30 seconds to prevent memory leaks
   * CRITICAL: Uses 90s + 10s buffer to prevent cleanup during long release envelopes
   * @private
   */
  _cleanupInactiveSynths() {
    const now = Date.now()

    for (const [userId, synthData] of this.userSynths.entries()) {
      const lastUsed = synthData.lastUsedTime || synthData.lastTriggerTime || 0
      const idleTime = now - lastUsed

      // CRITICAL: Check THREE conditions before cleanup:
      // 1. Not currently playing
      // 2. Idle longer than threshold + release buffer
      // 3. Not marked as disposing
      if (!synthData.isPlaying &&
          !synthData.disposing &&
          idleTime > (this.IDLE_THRESHOLD + this.RELEASE_BUFFER)) {

        // DEFENSIVE: Double-check no active notes in activeNotes map
        const hasActiveNotes = Array.from(this.activeNotes.values())
          .some(noteData => noteData.userId === userId)

        if (!hasActiveNotes) {
          // console.log(`🧹 Auto-cleanup synth for ${userId.substring(0, 8)} (idle ${(idleTime/1000).toFixed(0)}s)`)
          this.cleanupUserSynth(userId)
        }
      }
    }

    // Enforce maximum capacity by removing least-recently-used synths
    if (this.userSynths.size > this.maxSynths) {
      const sorted = Array.from(this.userSynths.entries())
        .filter(([_, data]) => !data.isPlaying && !data.disposing)
        .sort((a, b) => {
          const aTime = a[1].lastUsedTime || a[1].lastTriggerTime || 0
          const bTime = b[1].lastUsedTime || b[1].lastTriggerTime || 0
          return aTime - bTime  // Oldest first
        })

      const toRemove = this.userSynths.size - this.maxSynths
      for (let i = 0; i < toRemove && i < sorted.length; i++) {
        const userId = sorted[i][0]
        // console.log(`🧹 Max capacity cleanup for ${userId.substring(0, 8)}`)
        this.cleanupUserSynth(userId)
      }
    }

    // Also cleanup idle drum kits
    for (const [userId, kit] of this.userDrumKits.entries()) {
      const idleTime = now - (kit.lastUsedTime || 0)
      if (idleTime > this.IDLE_THRESHOLD) {
        this.cleanupUserDrumKit(userId)
      }
    }
  }

  /**
   * Release all notes for a user
   * @param {string} userId - The user ID
   */
  releaseAllForUser(userId) {
    const synthData = this.userSynths.get(userId)
    if (synthData) {
      try {
        synthData.synth.triggerRelease()  // MonoSynth uses triggerRelease()
      } catch (error) {
        // Ignore release errors
      }
    }

    // Clean up active notes for this user
    for (const [noteId, noteData] of this.activeNotes) {
      if (noteData.userId === userId) {
        this.activeNotes.delete(noteId)
      }
    }
  }

  /**
   * Cleanup synth for a user (on user leave)
   * Handles race conditions with proper disposal sequencing
   * @param {string} userId - The user ID
   */
  cleanupUserSynth(userId) {
    const synthData = this.userSynths.get(userId)
    if (!synthData) {
      return
    }

    // Prevent double-disposal if cleanup called multiple times
    if (synthData.disposing) {
      return
    }

    try {
      // Mark as disposing FIRST to prevent new notes from using it
      synthData.disposing = true

      // Release all notes
      this.releaseAllForUser(userId)

      // CRITICAL FIX: Capture nodes in closure BEFORE deleting from map
      // This prevents race condition if user rejoins within 1 second
      const { delaySend, reverbSend, pan, volume, filter, synth } = synthData

      // Remove from map immediately to prevent new getSynthForUser calls
      this.userSynths.delete(userId)

      // Wait for release envelopes to complete, THEN dispose audio nodes
      setTimeout(() => {
        try {
          // Use captured references (not synthData) to avoid disposing NEW synth
          if (delaySend) delaySend.dispose()
          if (reverbSend) reverbSend.dispose()
          if (pan) pan.dispose()
          if (volume) volume.dispose()
          if (filter) filter.dispose()
          if (synth) synth.dispose()

          // console.log(`Fully disposed synth for ${userId}`)
        } catch (e) {
        }
      }, 1000)

      // console.log(`Initiated cleanup for ${userId}`)

    } catch (error) {
      console.error(`Error cleaning up synth for ${userId}:`, error)
      this.userSynths.delete(userId)
    }
  }

  /**
   * Cleanup all synths
   */
  cleanupAll() {
    // OPTIMIZATION: Clear automatic cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    for (const userId of this.userSynths.keys()) {
      this.cleanupUserSynth(userId)
    }
    this.activeNotes.clear()
    this.usersWithCustomParams.clear()
  }

  /**
   * Reset all synth states without destroying them
   * Called when tab becomes visible to clear stale timing and release stuck notes
   * This fixes issues where notes skip or have wrong envelopes after window switching
   */
  resetAllSynthStates() {
    const now = typeof Tone !== 'undefined' ? Tone.now() : 0

    for (const [userId, synthData] of this.userSynths.entries()) {
      try {
        // 1. Release any stuck notes
        if (synthData.synth && !synthData.synth.disposed) {
          try {
            synthData.synth.triggerRelease()
          } catch (e) {
            // Ignore release errors - note may already be released
          }
        }

        // 2. Reset lastTriggerTime to prevent timing conflicts
        // Using current time ensures next note will be scheduled properly
        synthData.lastTriggerTime = now

        // console.log(`🔄 Reset synth state for ${userId.substring(0, 8)}: ${synthData.patch?.name}`)
      } catch (e) {
      }
    }

    // 3. Clear all active notes tracking
    this.activeNotes.clear()

  }

  /**
   * Get stats about current synths
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      totalSynths: this.userSynths.size,
      activeNotes: this.activeNotes.size,
      users: Array.from(this.userSynths.keys())
    }
  }

  /**
   * Check if a user has an active synth
   * @param {string} userId - The user ID
   * @returns {boolean} True if synth exists
   */
  hasSynthForUser(userId) {
    return this.userSynths.has(userId)
  }

  /**
   * Get the patch for a user (for debugging/display)
   * @param {string} userId - The user ID
   * @returns {Object|null} The patch definition
   */
  getPatchForUser(userId) {
    const slot = this.getUserSlot(userId)
    return this.patchDefinitions?.getPatchForUser(userId, slot) || null
  }

  /**
   * Entry #104: Get all active per-user filters for hover modulation
   * Returns array of Tone.Filter objects that can be modulated
   * @returns {Array<Tone.Filter>} Array of active filters
   */
  getAllFilters() {
    const filters = []
    for (const [userId, synthData] of this.userSynths) {
      if (synthData.filter && !synthData.filter.disposed) {
        filters.push(synthData.filter)
      }
    }
    return filters
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.UserSynthManager = UserSynthManager
  // console.log('✅ UserSynthManager exported to window.UserSynthManager')
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UserSynthManager
}
