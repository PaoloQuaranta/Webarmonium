/**
 * UserSynthManager.js
 * Manages per-user synth instances with unique timbres
 * Each user gets a dedicated synth based on their patch definition
 */
console.log('📦 UserSynthManager.js LOADING...')

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

    // Map<userId, slotNumber> for real users (0-3)
    // Slots are assigned dynamically based on availability (see getUserSlot)
    this.userSlots = new Map()

    // Track active notes per user for cleanup
    this.activeNotes = new Map()  // Map<noteId, userId>

    // Max polyphony per user synth - REDUCED for performance
    // 8 voices × 7 users max = 56 total voices (was 224!)
    this.maxPolyphonyPerUser = 8

    // Get patch definitions
    this.patchDefinitions = window.PatchDefinitions || null
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
   * Get or assign a slot for a real user
   * Slots are assigned uniquely - finds the first available slot (0-3)
   * @param {string} userId - The user ID
   * @returns {number} Slot number (0-3)
   */
  getUserSlot(userId) {
    if (!this.patchDefinitions) return 0

    // Virtual users don't need slots
    if (this.patchDefinitions.isVirtualUser(userId)) {
      return -1
    }

    // If user already has a slot, return it
    if (this.userSlots.has(userId)) {
      return this.userSlots.get(userId)
    }

    // Find which slots are currently in use
    const usedSlots = new Set(this.userSlots.values())

    // Find the first available slot (0-3)
    let assignedSlot = -1
    for (let slot = 0; slot < 4; slot++) {
      if (!usedSlots.has(slot)) {
        assignedSlot = slot
        break
      }
    }

    // If all slots are taken, use modulo of user count (fallback)
    if (assignedSlot === -1) {
      assignedSlot = this.userSlots.size % 4
      console.warn(`⚠️ All 4 synth slots in use, reusing slot ${assignedSlot} for ${userId}`)
    }

    this.userSlots.set(userId, assignedSlot)
    console.log(`🎹 Assigned slot ${assignedSlot} to user ${userId.substring(0, 8)}`)
    return assignedSlot
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
      let synth
      const oscillatorConfig = patch.oscillator

      if (oscillatorConfig.type === 'fmsine') {
        // FM Synthesis
        synth = new Tone.PolySynth(Tone.FMSynth, {
          maxPolyphony: this.maxPolyphonyPerUser,
          voice: Tone.FMSynth,
          options: {
            modulationIndex: oscillatorConfig.modulationIndex || 3,
            modulationType: oscillatorConfig.modulationType || 'sine',
            envelope: patch.envelope
          }
        })
      } else if (oscillatorConfig.type === 'pulse') {
        // Pulse wave
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: this.maxPolyphonyPerUser,
          voice: Tone.Synth,
          options: {
            oscillator: {
              type: 'pulse',
              width: oscillatorConfig.width || 0.5
            },
            envelope: patch.envelope
          }
        })
      } else if (oscillatorConfig.type.startsWith('fat')) {
        // Fat oscillators (fatsine, fatsawtooth, fattriangle)
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: this.maxPolyphonyPerUser,
          voice: Tone.Synth,
          options: {
            oscillator: {
              type: oscillatorConfig.type,
              count: oscillatorConfig.count || 3,
              spread: oscillatorConfig.spread || 20
            },
            envelope: patch.envelope
          }
        })
      } else {
        // Basic oscillator types (sine, sawtooth, triangle, square)
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: this.maxPolyphonyPerUser,
          voice: Tone.Synth,
          options: {
            oscillator: {
              type: oscillatorConfig.type
            },
            envelope: patch.envelope
          }
        })
      }

      // Create filter based on patch
      const filterConfig = patch.filter
      const filter = new Tone.Filter({
        type: filterConfig.type || 'lowpass',
        frequency: filterConfig.frequency || 2000,
        Q: filterConfig.Q || 1
      })

      // Create volume node
      const volume = new Tone.Volume(patch.volume || 0)

      // Create panner for stereo placement (virtual users get fixed positions)
      let panValue = 0
      if (this.patchDefinitions.isVirtualUser(userId)) {
        // Virtual users: Wikipedia left, HackerNews center, GitHub right
        if (userId === 'wikipedia-metrics') panValue = -0.5
        else if (userId === 'github-metrics') panValue = 0.5
        // hackernews-metrics stays at center (0)
      } else {
        // Real users: slight spread based on slot
        panValue = (slot - 1.5) * 0.3  // -0.45 to 0.45
      }
      const pan = new Tone.Panner(panValue)

      // Connect signal chain: synth -> filter -> volume -> pan -> master
      synth.connect(filter)
      filter.connect(volume)
      volume.connect(pan)

      if (this.masterVolume) {
        pan.connect(this.masterVolume)
      } else {
        pan.toDestination()
      }

      // Create send nodes for effects
      let delaySend = null
      let reverbSend = null

      if (this.delay && patch.effects?.delaySend > 0) {
        delaySend = new Tone.Gain(patch.effects.delaySend)
        volume.connect(delaySend)
        delaySend.connect(this.delay)
      }

      if (this.reverb && patch.effects?.reverbSend > 0) {
        reverbSend = new Tone.Gain(patch.effects.reverbSend)
        volume.connect(reverbSend)
        reverbSend.connect(this.reverb)
      }

      // Store synth data
      this.userSynths.set(userId, {
        synth,
        filter,
        volume,
        pan,
        delaySend,
        reverbSend,
        patch,
        slot
      })

      console.log(`Created synth for ${userId}: ${patch.name} (oscillator: ${oscillatorConfig.type})`)

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
        synthData.synth.triggerRelease(noteData.frequency, Tone.now())
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

      synthData.synth.triggerAttackRelease(
        constrainedFreq,
        duration,
        Tone.now(),
        finalVelocity
      )

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
        synthData.synth.releaseAll()
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
      // Only free slot after full disposal to prevent premature reuse
      setTimeout(() => {
        try {
          if (synthData.delaySend) synthData.delaySend.dispose()
          if (synthData.reverbSend) synthData.reverbSend.dispose()
          if (synthData.pan) synthData.pan.dispose()
          if (synthData.volume) synthData.volume.dispose()
          if (synthData.filter) synthData.filter.dispose()
          if (synthData.synth) synthData.synth.dispose()

          // Only free slot AFTER full disposal
          this.userSlots.delete(userId)

          console.log(`Fully disposed synth for ${userId}`)
        } catch (e) {
          console.warn(`Error during synth disposal for ${userId}:`, e.message)
          // Still free slot even on error
          this.userSlots.delete(userId)
        }
      }, 1000)

      console.log(`Initiated cleanup for ${userId}`)

    } catch (error) {
      console.error(`Error cleaning up synth for ${userId}:`, error)
      // Ensure cleanup even on error
      this.userSynths.delete(userId)
      this.userSlots.delete(userId)
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
    // userSlots is cleared by cleanupUserSynth for each user
  }

  /**
   * Get stats about current synths
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      totalSynths: this.userSynths.size,
      activeNotes: this.activeNotes.size,
      userSlots: Object.fromEntries(this.userSlots),
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
  console.log('✅ UserSynthManager exported to window.UserSynthManager')
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UserSynthManager
}
