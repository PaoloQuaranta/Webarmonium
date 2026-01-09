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

    // Slot lookup function - will be set by AudioService to use backend-assigned slots
    // Falls back to hash if not set
    this.slotLookupFn = null
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
      console.warn(`⚠️ No backend slot for ${userId?.substring(0, 8)}, falling back to hash`)
    } else {
      console.warn(`⚠️ No slotLookupFn set! userId=${userId?.substring(0, 8)} will use hash`)
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
      console.warn(`Synth for ${userId} is disposing, cannot use`)
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
      console.warn('PatchDefinitions or Tone.js not available')
      return
    }

    const slot = this.getUserSlot(userId)
    const patch = this.patchDefinitions.getPatchForUser(userId, slot)

    if (!patch) {
      console.warn(`No patch found for user ${userId}, slot ${slot}`)
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
      // High volume patches (like FM/bell at 11-12 dB) could cause distortion if multiple play simultaneously
      const MAX_PATCH_VOLUME_DB = 10  // Safety limit
      const patchVolume = Math.min(patch.volume || 0, MAX_PATCH_VOLUME_DB)
      if (patch.volume > MAX_PATCH_VOLUME_DB) {
        console.warn(`⚠️ Patch "${patch.name}" volume capped: ${patch.volume} dB → ${MAX_PATCH_VOLUME_DB} dB`)
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
        // Real users: slight spread based on slot (8 slots now)
        // Map slot 0-7 to pan -0.7 to +0.7
        panValue = ((slot % 8) - 3.5) * 0.2  // Clamps naturally to -0.7 to +0.7
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
          console.warn('UserSynthManager: Could not connect to masterVolume, using destination:', e.message)
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
          console.warn('UserSynthManager: Could not connect to delay:', e.message)
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
          console.warn('UserSynthManager: Could not connect to reverb:', e.message)
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
        lastTriggerTime: 0  // Track last trigger time to prevent MonoSynth timing errors
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
      console.warn(`Invalid frequency ${frequency} for user ${userId}, using tessitura min`)
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
      // Apply tessitura constraint
      const constrainedFreq = this.constrainFrequencyToTessitura(frequency, userId)

      // Reduce velocity for remote users
      const finalVelocity = isRemote ? velocity * 0.7 : velocity

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
      const finalVelocity = isRemote ? velocity * 0.7 : velocity

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
      console.warn(`Synth for ${userId} already disposing, skipping`)
      return
    }

    try {
      // Mark as disposing FIRST to prevent new notes from using it
      synthData.disposing = true

      // Release all notes
      this.releaseAllForUser(userId)

      // Remove from map immediately to prevent new getSynthForUser calls
      this.userSynths.delete(userId)

      // Wait for release envelopes to complete, THEN dispose audio nodes
      setTimeout(() => {
        try {
          if (synthData.delaySend) synthData.delaySend.dispose()
          if (synthData.reverbSend) synthData.reverbSend.dispose()
          if (synthData.pan) synthData.pan.dispose()
          if (synthData.volume) synthData.volume.dispose()
          if (synthData.filter) synthData.filter.dispose()
          if (synthData.synth) synthData.synth.dispose()

          // console.log(`Fully disposed synth for ${userId}`)
        } catch (e) {
          console.warn(`Error during synth disposal for ${userId}:`, e.message)
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
    for (const userId of this.userSynths.keys()) {
      this.cleanupUserSynth(userId)
    }
    this.activeNotes.clear()
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
        console.warn(`Failed to reset synth state for ${userId}:`, e)
      }
    }

    // 3. Clear all active notes tracking
    this.activeNotes.clear()

    console.log(`🔄 Reset ${this.userSynths.size} synth states after visibility change`)
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
