/**
 * PolyphonyManager.js
 * Manages sustained notes and active note cleanup.
 * Voice tracking and priority-based polyphony management is handled
 * by AudioService (generativeState.activeVoices) — see trackVoice() there.
 */
class PolyphonyManager {
  constructor() {
    // Track active sustained notes for later release
    this.activeSustainedNotes = new Map()

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
      return null
    }

    // Check audio context state
    if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
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

    const noteId = `sustained-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
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

    return { noteId, frequency, startTime: Date.now() }
  }

  /**
   * SUSTAINED HOLD: Release sustained note (gate closes)
   * @param {string} noteId - Note ID from triggerSustainedNoteAttack
   */
  triggerSustainedNoteRelease(noteId) {
    if (!this.synth || this.synth.disposed) {
      return
    }

    const noteData = this.activeSustainedNotes.get(noteId)
    if (!noteData) {
      return
    }

    const now = typeof Tone !== 'undefined' ? Tone.now() : 0
    this.synth.triggerRelease(noteData.frequency, now)

    this.activeSustainedNotes.delete(noteId)
  }

  /**
   * Release all active sustained notes
   */
  releaseAllSustainedNotes() {
    if (this.activeSustainedNotes.size === 0) return

    for (const [noteId, noteData] of this.activeSustainedNotes.entries()) {
      try {
        if (this.synth && !this.synth.disposed) {
          const now = typeof Tone !== 'undefined' ? Tone.now() : 0
          this.synth.triggerRelease(noteData.frequency, now)
        }
      } catch (e) {
        // Ignore release errors
      }
    }

    this.activeSustainedNotes.clear()
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
   * Release all sustained notes and active notes
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
  }

  /**
   * Get status for debugging
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      activeSustainedNotes: this.activeSustainedNotes.size,
      activeNotes: this.activeNotes.size
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
