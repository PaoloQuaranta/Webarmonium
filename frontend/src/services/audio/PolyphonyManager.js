/**
 * PolyphonyManager.js
 * Manages sustained notes, voice lifecycle, and polyphony limits
 * Extracted from AudioService.js for Phase 2 refactoring
 */
class PolyphonyManager {
  constructor(maxVoices = 16) {
    // Maximum total voices across all synths
    this.maxTotalVoices = maxVoices

    // Track active sustained notes for later release
    this.activeSustainedNotes = new Map()

    // Track all active voices for polyphony management
    this.activeVoices = new Map()

    // Track active notes for cleanup
    this.activeNotes = new Map()

    // Reference to synth (set by AudioService)
    this.synth = null
  }

  /**
   * Set the synth reference
   * @param {Object} synth - Tone.js synth instance
   */
  setSynth(synth) {
    this.synth = synth
  }

  /**
   * SUSTAINED HOLD: Trigger sustained note attack (gate opens)
   * Uses triggerAttack without triggerRelease for open gate control
   * @param {number} frequency - Note frequency in Hz
   * @param {number} velocity - Note velocity (0-1)
   * @param {Object} position - Canvas position {x, y}
   * @returns {Object|null} Note tracking data { noteId, frequency, startTime } or null if failed
   */
  triggerSustainedNoteAttack(frequency, velocity, position) {
    if (!this.synth || this.synth.disposed) {
      // console.warn('🚫 Synth not available for sustained note')
      return null
    }

    // Check audio context state
    if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
      // console.warn('⚠️ Audio context not running, cannot start sustained note')
      return null
    }

    // Configure envelope for sustained hold
    this.synth.set({
      envelope: {
        attack: 0.005,      // 5ms - instant response
        decay: 0.01,        // 10ms - quick to sustain level
        sustain: 1.0,       // Full sustain - note held at max level
        release: 0.05       // 50ms - smooth release when gate closes
      }
    })

    const noteId = `sustained-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = typeof Tone !== 'undefined' ? Tone.now() : 0

    // Use triggerAttack (NOT triggerAttackRelease) to open gate without closing it
    this.synth.triggerAttack(frequency, now, velocity)

    this.activeSustainedNotes.set(noteId, {
      noteId,
      frequency,
      startTime: Date.now(),
      position,
      velocity,
      synth: this.synth
    })

    // console.log(`🎵 Sustained note ATTACK: ${frequency.toFixed(1)}Hz, vel=${velocity.toFixed(2)}, noteId=${noteId}`)

    return { noteId, frequency, startTime: Date.now() }
  }

  /**
   * SUSTAINED HOLD: Release sustained note (gate closes)
   * @param {string} noteId - Note ID from triggerSustainedNoteAttack
   */
  triggerSustainedNoteRelease(noteId) {
    if (!this.synth || this.synth.disposed) {
      // console.warn('🚫 Synth not available for note release')
      return
    }

    const noteData = this.activeSustainedNotes.get(noteId)
    if (!noteData) {
      // console.warn(`⚠️ No active sustained note found for ${noteId}`)
      return
    }

    const now = typeof Tone !== 'undefined' ? Tone.now() : 0
    this.synth.triggerRelease(noteData.frequency, now)

    this.activeSustainedNotes.delete(noteId)

    const duration = Date.now() - noteData.startTime
    // console.log(`🎵 Sustained note RELEASE: ${noteData.frequency.toFixed(1)}Hz, held ${duration}ms, noteId=${noteId}`)
  }

  /**
   * Release all active sustained notes
   */
  releaseAllSustainedNotes() {
    if (this.activeSustainedNotes.size === 0) return

    // console.log(`🛑 Releasing ${this.activeSustainedNotes.size} active sustained notes`)

    for (const [noteId, noteData] of this.activeSustainedNotes.entries()) {
      try {
        if (this.synth && !this.synth.disposed) {
          const now = typeof Tone !== 'undefined' ? Tone.now() : 0
          this.synth.triggerRelease(noteData.frequency, now)
        }
      } catch (e) {
        // console.warn(`⚠️ Error releasing sustained note ${noteId}:`, e.message)
      }
    }

    this.activeSustainedNotes.clear()
  }

  /**
   * Check and manage polyphony to prevent audio overload
   */
  managePolyphony() {
    const totalActiveVoices = this.activeVoices.size

    if (totalActiveVoices > this.maxTotalVoices) {
      const voicesToCleanup = totalActiveVoices - this.maxTotalVoices
      const now = Date.now()

      // Find oldest voices and release them
      const voicesByAge = Array.from(this.activeVoices.entries())
        .sort((a, b) => a[1].startTime - b[1].startTime)

      for (let i = 0; i < voicesToCleanup && i < voicesByAge.length; i++) {
        const [voiceId, voiceData] = voicesByAge[i]

        // Release the voice if it's been playing for more than 1 second
        if (now - voiceData.startTime > 1000) {
          if (voiceData.synth && voiceData.synth.releaseAll) {
            voiceData.synth.releaseAll()
          }
          this.activeVoices.delete(voiceId)
          // console.log(`🔇 Cleaned up voice ${voiceId} for polyphony management`)
        }
      }
    }
  }

  /**
   * Track a new voice for polyphony management
   * @param {string} voiceId - Unique voice identifier
   * @param {Object} synth - Synth instance
   * @param {number} duration - Note duration in seconds
   */
  trackVoice(voiceId, synth, duration) {
    this.activeVoices.set(voiceId, {
      synth,
      startTime: Date.now(),
      duration
    })

    // Schedule voice cleanup
    setTimeout(() => {
      if (this.activeVoices.has(voiceId)) {
        this.activeVoices.delete(voiceId)
      }
    }, duration * 1000 + 500) // Add 500ms buffer

    // Check polyphony limits
    this.managePolyphony()
  }

  /**
   * Track a note for cleanup
   * @param {string} noteId - Note identifier
   * @param {number} frequency - Note frequency
   * @param {number} startTime - Note start time
   * @param {Object} synth - Synth instance
   */
  trackNote(noteId, frequency, startTime, synth) {
    this.activeNotes.set(noteId, {
      frequency,
      startTime,
      synth
    })
  }

  /**
   * Release and untrack a note
   * @param {string} noteId - Note identifier
   */
  releaseNote(noteId) {
    const noteData = this.activeNotes.get(noteId)
    if (noteData) {
      try {
        if (noteData.synth && !noteData.synth.disposed) {
          noteData.synth.triggerRelease(noteData.frequency)
        }
        this.activeNotes.delete(noteId)
        // console.log(`🔇 Released note: ${noteData.frequency.toFixed(1)}Hz`)
      } catch (e) {
        this.activeNotes.delete(noteId)
      }
    }
  }

  /**
   * Cleanup hanging notes to prevent audio issues
   * @param {number} maxDuration - Maximum duration in seconds (default: 2)
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
   * Get count of active sustained notes
   * @returns {number} Number of active sustained notes
   */
  getActiveSustainedNotesCount() {
    return this.activeSustainedNotes.size
  }

  /**
   * Get count of active voices
   * @returns {number} Number of active voices
   */
  getActiveVoicesCount() {
    return this.activeVoices.size
  }

  /**
   * Check if a sustained note is active
   * @param {string} noteId - Note ID
   * @returns {boolean} True if note is active
   */
  isSustainedNoteActive(noteId) {
    return this.activeSustainedNotes.has(noteId)
  }

  /**
   * Get sustained note data
   * @param {string} noteId - Note ID
   * @returns {Object|undefined} Note data or undefined
   */
  getSustainedNoteData(noteId) {
    return this.activeSustainedNotes.get(noteId)
  }

  /**
   * Set maximum polyphony
   * @param {number} maxVoices - Maximum number of voices
   */
  setMaxPolyphony(maxVoices) {
    this.maxTotalVoices = maxVoices
    this.managePolyphony() // Apply immediately if needed
  }

  /**
   * Release all voices and notes
   */
  releaseAll() {
    this.releaseAllSustainedNotes()

    // Release all tracked notes
    this.activeNotes.forEach((noteData, noteId) => {
      try {
        if (noteData.synth && !noteData.synth.disposed) {
          noteData.synth.triggerRelease(noteData.frequency)
        }
      } catch (e) {
        // Ignore release errors
      }
    })
    this.activeNotes.clear()

    // Clear voice tracking
    this.activeVoices.clear()

    // console.log('🔇 PolyphonyManager: All voices released')
  }

  /**
   * Get status for debugging
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      activeSustainedNotes: this.activeSustainedNotes.size,
      activeVoices: this.activeVoices.size,
      activeNotes: this.activeNotes.size,
      maxPolyphony: this.maxTotalVoices
    }
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.PolyphonyManager = PolyphonyManager
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PolyphonyManager
}
