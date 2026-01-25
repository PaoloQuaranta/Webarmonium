/**
 * DragStreamingHandler.js
 * Handles drag streaming notes, melodic generation, and gesture-to-audio mapping
 * Extracted from main.js for Phase 2 refactoring
 */
class DragStreamingHandler {
  constructor(audioService, compositionalParameters = null) {
    this.audioService = audioService
    this.compositionalParameters = compositionalParameters

    // Cached scale for performance
    this.cachedScale = null
    this.cachedScaleType = null

    // Melodic memory for coherent phrases
    this.melodicMemory = {
      lastNotes: [],
      currentDirection: 0, // -1 down, 0 neutral, 1 up
      phrasePosition: 0
    }

    // Last drag position for direction detection
    this.lastDragY = null

    // Duration map for note length parsing
    // Entry #171: Expanded duration options for more variety
    this.durationMap = {
      '64n': 0.03125, // 1/64 note
      '32n': 0.0625,  // 1/32 note
      '16n': 0.125,   // 1/16 note
      '8n': 0.25,     // 1/8 note
      '4n': 0.5,      // 1/4 note
      '2n': 1.0,      // 1/2 note
      '1n': 2.0       // whole note
    }
  }

  /**
   * Set audio service reference
   * @param {Object} audioService - AudioService instance
   */
  setAudioService(audioService) {
    this.audioService = audioService
  }

  /**
   * Update compositional parameters
   * @param {Object} params - Compositional parameters from backend
   */
  updateCompositionalParameters(params) {
    this.compositionalParameters = params

    // Update cached scale if type changed
    const newScaleType = params?.scaleType || 'pentatonic'
    if (this.cachedScaleType !== newScaleType) {
      this.cachedScale = window.MusicalScales?.getScale(newScaleType) || [0, 2, 4, 7, 9]
      this.cachedScaleType = newScaleType
      // console.log(`🎼 Cached scale updated: ${newScaleType}`)
    }
  }

  /**
   * Get current scale
   * @returns {Array} Current scale degrees
   */
  getScale() {
    return this.cachedScale || window.MusicalScales?.getScale('pentatonic') || [0, 2, 4, 7, 9]
  }

  /**
   * Process drag streaming note and generate melodic content
   * @param {Object} noteData - Note data from gesture capture
   * @returns {Object|null} Note data for broadcast, or null if not played
   */
  processDragStreamingNote(noteData) {
    if (!this.audioService || !this.audioService.gestureSynth) {
      // console.warn('🎸🎸 BLOCKED - audio not ready')
      return null
    }

    const x = noteData.position.x
    const y = noteData.position.y

    // Get scale and octave
    const scale = this.getScale()
    const baseOctave = window.MusicalConstants.getBaseOctaveFromY(y)

    // Calculate gesture direction
    const prevY = this.lastDragY || y
    const deltaY = y - prevY
    this.lastDragY = y
    const isAscending = deltaY < -0.02
    const isDescending = deltaY > 0.02

    // Determine scale index based on velocity and direction
    const velocity = noteData.velocity
    let scaleIndex = this.calculateScaleIndex(velocity, x, y, isAscending, isDescending, noteData.noteIndex, scale)

    // Remember note for next iteration
    this.melodicMemory.lastNotes.push(scaleIndex)
    if (this.melodicMemory.lastNotes.length > 5) {
      this.melodicMemory.lastNotes.shift()
    }

    // Calculate MIDI note and frequency
    const scaleNote = scale[scaleIndex % scale.length]
    const octaveOffset = Math.floor(scaleIndex / scale.length)
    const midiNote = 60 + (baseOctave - 4) * 12 + scaleNote + octaveOffset * 12
    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12)

    // Get duration
    const duration = this.durationMap[noteData.duration] || 0.25

    // Configure envelope based on articulation
    const envelope = this.getEnvelopeForArticulation(noteData.articulation, duration)

    // Play the note
    try {
      this.audioService.gestureSynth.set({ envelope })
      const noteVelocity = 0.8 + noteData.velocity * 0.2

      // console.log('🎵🎵 PLAYING LOCAL NOTE:', {
//        frequency: frequency.toFixed(1),
//        duration: duration,
//        articulation: noteData.articulation,
//        velocity: noteVelocity.toFixed(3)
////      })

      this.audioService.gestureSynth.triggerAttackRelease(
        frequency,
        duration,
        typeof Tone !== 'undefined' ? Tone.now() : undefined,
        noteVelocity
      )
    } catch (error) {
      // console.warn('🎵 Error playing note:', error.message)
      return null
    }

    // Return note data for broadcast
    return {
      frequency: frequency,
      duration: noteData.duration,
      articulation: noteData.articulation,
      position: { x, y },
      velocity: noteData.velocity,
      timestamp: Date.now()
    }
  }

  /**
   * Calculate scale index based on velocity and direction
   * @param {number} velocity - Gesture velocity
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {boolean} isAscending - Whether gesture is ascending
   * @param {boolean} isDescending - Whether gesture is descending
   * @param {number} noteIndex - Current note index
   * @param {Array} scale - Current scale
   * @returns {number} Scale index
   */
  calculateScaleIndex(velocity, x, y, isAscending, isDescending, noteIndex, scale) {
    if (velocity > 0.7) {
      // FAST: Dynamic arpeggios - pass x for variety
      return this.calculateFastArpeggio(isAscending, isDescending, noteIndex, x)
    } else if (velocity > 0.4) {
      // MEDIUM: Contour melodies - pass y for variety
      return this.calculateMediumContour(x, isAscending, isDescending, noteIndex, y)
    } else {
      // SLOW: Intervallic exploration
      return this.calculateSlowIntervals(x, y, noteIndex, scale)
    }
  }

  /**
   * Calculate fast melodic pattern with variety
   * Entry #171: Uses melodic memory + noteIndex for non-repeating variety
   * @param {boolean} isAscending - Whether ascending
   * @param {boolean} isDescending - Whether descending
   * @param {number} noteIndex - Current note index
   * @param {number} x - X position (0-1) for additional variety
   * @returns {number} Scale index
   */
  calculateFastArpeggio(isAscending, isDescending, noteIndex, x = 0.5) {
    const PHI = 1.618033988749895
    const lastNote = this.melodicMemory.lastNotes[this.melodicMemory.lastNotes.length - 1] || 0

    // Entry #171: Combine noteIndex AND melodic history for variety
    // This prevents loops because history accumulates over time
    const historySum = this.melodicMemory.lastNotes.reduce((a, b) => a + b, 0)
    const varietyFactor = (noteIndex * PHI + historySum * 0.1 + x * 3) % 1

    // Interval based on combined factors (1-4 range)
    const interval = 1 + Math.floor(varietyFactor * 4)

    if (isAscending) {
      return (lastNote + interval) % 8
    } else if (isDescending) {
      return Math.max(0, lastNote - interval)
    } else {
      // Wave: direction changes based on variety factor
      const direction = varietyFactor > 0.5 ? 1 : -1
      const newNote = lastNote + (interval * direction)
      return Math.max(0, Math.min(7, newNote))
    }
  }

  /**
   * Calculate medium-speed contour melody with dynamic intervals
   * Entry #171: Uses X/Y position + melodic history for non-repeating variety
   * @param {number} x - X position (0-1)
   * @param {boolean} isAscending - Whether ascending
   * @param {boolean} isDescending - Whether descending
   * @param {number} noteIndex - Current note index
   * @param {number} y - Y position (0-1) for additional variety
   * @returns {number} Scale index
   */
  calculateMediumContour(x, isAscending, isDescending, noteIndex, y = 0.5) {
    const PHI = 1.618033988749895
    const lastNote = this.melodicMemory.lastNotes[this.melodicMemory.lastNotes.length - 1] || 3

    // Entry #171: Combine multiple factors for variety
    const historySum = this.melodicMemory.lastNotes.reduce((a, b) => a + b, 0)
    const varietyFactor = (noteIndex * PHI + historySum * 0.1 + x * 2 + y * 2) % 1

    // Interval based on X position + variety (1-4 range)
    const baseInterval = 1 + Math.floor(x * 2)
    const interval = Math.max(1, baseInterval + Math.floor(varietyFactor * 2))

    if (isAscending) {
      const newNote = lastNote + interval
      return Math.min(7, newNote)
    } else if (isDescending) {
      const newNote = lastNote - interval
      return Math.max(0, newNote)
    } else {
      // Wave: direction based on combined variety factor
      const direction = varietyFactor > 0.5 ? 1 : -1
      const newNote = lastNote + (interval * direction)
      return Math.max(0, Math.min(7, newNote))
    }
  }

  /**
   * Calculate slow intervallic exploration
   * Entry #171: Uses X/Y + melodic history for varied slow melodies
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} noteIndex - Current note index
   * @param {Array} scale - Current scale
   * @returns {number} Scale index
   */
  calculateSlowIntervals(x, y, noteIndex, scale) {
    const PHI = 1.618033988749895
    const lastNote = this.melodicMemory.lastNotes[this.melodicMemory.lastNotes.length - 1] || Math.floor(scale.length / 2)

    // Entry #171: Combine X/Y position + history for variety
    const historySum = this.melodicMemory.lastNotes.reduce((a, b) => a + b, 0)
    const varietyFactor = (noteIndex * PHI + historySum * 0.15 + x * 3 + y * 2) % 1

    // Y determines interval size (high Y = large intervals, exploring range)
    const baseInterval = 1 + Math.floor((1 - y) * 3) // 1-4

    // X determines direction tendency (left = descend, right = ascend)
    const directionBias = x - 0.5 // -0.5 to 0.5

    // Direction based on variety + X bias
    const direction = (varietyFactor + directionBias) > 0.5 ? 1 : -1

    // Calculate new note with variety
    const interval = baseInterval + Math.floor(varietyFactor * 2)
    const newNote = lastNote + (interval * direction)

    // Clamp to scale range
    return Math.max(0, Math.min(scale.length - 1, newNote))
  }

  /**
   * Get envelope settings based on articulation
   * Entry #171: All envelopes now scale with duration for audible variety
   * @param {string} articulation - Articulation type
   * @param {number} duration - Note duration
   * @returns {Object} Envelope settings
   */
  getEnvelopeForArticulation(articulation, duration) {
    // Ensure minimum duration for audible notes
    const safeDuration = Math.max(0.05, duration)

    switch (articulation) {
      case 'staccato':
        return {
          attack: 0.005,
          decay: safeDuration * 0.3,
          sustain: 0.2,
          release: safeDuration * 0.2
        }
      case 'marcato':
        return {
          attack: 0.01,
          decay: safeDuration * 0.4,
          sustain: 0.4,
          release: safeDuration * 0.3
        }
      case 'legato':
        return {
          attack: safeDuration * 0.15,
          decay: safeDuration * 0.25,
          sustain: 0.6,
          release: safeDuration * 0.5
        }
      default:
        // Entry #171: Default now also scales with duration
        return {
          attack: 0.01,
          decay: safeDuration * 0.3,
          sustain: 0.3,
          release: safeDuration * 0.3
        }
    }
  }

  /**
   * Reset melodic memory
   */
  resetMelodicMemory() {
    this.melodicMemory = {
      lastNotes: [],
      currentDirection: 0,
      phrasePosition: 0
    }
    this.lastDragY = null
  }

  /**
   * Cleanup
   */
  cleanup() {
    this.resetMelodicMemory()
    this.audioService = null
    this.compositionalParameters = null
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.DragStreamingHandler = DragStreamingHandler
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DragStreamingHandler
}
