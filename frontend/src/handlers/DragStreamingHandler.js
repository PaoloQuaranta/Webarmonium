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
      // FAST: Dynamic arpeggios
      return this.calculateFastArpeggio(isAscending, isDescending, noteIndex)
    } else if (velocity > 0.4) {
      // MEDIUM: Contour melodies
      return this.calculateMediumContour(x, isAscending, isDescending, noteIndex)
    } else {
      // SLOW: Intervallic exploration
      return this.calculateSlowIntervals(x, y, noteIndex, scale)
    }
  }

  /**
   * Calculate fast melodic pattern with variety
   * Entry #171: Removed hardcoded patterns, uses dynamic generation
   * @param {boolean} isAscending - Whether ascending
   * @param {boolean} isDescending - Whether descending
   * @param {number} noteIndex - Current note index
   * @returns {number} Scale index
   */
  calculateFastArpeggio(isAscending, isDescending, noteIndex) {
    const PHI = 1.618033988749895
    const lastNote = this.melodicMemory.lastNotes[this.melodicMemory.lastNotes.length - 1] || 0

    // Entry #171: Dynamic interval selection based on phrase position
    // Uses PHI stepping for non-repeating variety
    const phrasePosition = (noteIndex * PHI) % 1
    const intervalOptions = [1, 2, 3, 2, 1, 3, 2, 4] // More variety than single pattern
    const intervalIndex = Math.floor(phrasePosition * intervalOptions.length)
    const interval = intervalOptions[intervalIndex]

    if (isAscending) {
      // Ascending with varied intervals
      return (lastNote + interval) % 8
    } else if (isDescending) {
      // Descending with varied intervals
      return Math.max(0, lastNote - interval)
    } else {
      // Wave motion with varied intervals
      const direction = Math.floor(noteIndex * PHI) % 2 === 0 ? 1 : -1
      const newNote = lastNote + (interval * direction)
      return Math.max(0, Math.min(7, newNote))
    }
  }

  /**
   * Calculate medium-speed contour melody with dynamic intervals
   * Entry #171: Removed hardcoded patterns, uses position-based generation
   * @param {number} x - X position
   * @param {boolean} isAscending - Whether ascending
   * @param {boolean} isDescending - Whether descending
   * @param {number} noteIndex - Current note index
   * @returns {number} Scale index
   */
  calculateMediumContour(x, isAscending, isDescending, noteIndex) {
    const PHI = 1.618033988749895
    const lastNote = this.melodicMemory.lastNotes[this.melodicMemory.lastNotes.length - 1] || 3

    // X position influences interval size (left = small, right = large)
    const baseInterval = 1 + Math.floor(x * 2) // 1-3

    // Phrase position determines variation
    const phrasePosition = (noteIndex * PHI) % 1
    const intervalVariation = Math.floor(phrasePosition * 3) - 1 // -1, 0, 1
    const interval = Math.max(1, baseInterval + intervalVariation)

    if (isAscending) {
      // Gradual ascent with varied steps
      const newNote = lastNote + interval
      return Math.min(7, newNote)
    } else if (isDescending) {
      // Gradual descent with varied steps
      const newNote = lastNote - interval
      return Math.max(0, newNote)
    } else {
      // Wave motion: alternate direction based on phrase position
      const wavePhase = Math.sin(noteIndex * PHI * Math.PI)
      const direction = wavePhase > 0 ? 1 : -1
      const newNote = lastNote + (interval * direction)
      return Math.max(0, Math.min(7, newNote))
    }
  }

  /**
   * Calculate slow intervallic exploration
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} noteIndex - Current note index
   * @param {Array} scale - Current scale
   * @returns {number} Scale index
   */
  calculateSlowIntervals(x, y, noteIndex, scale) {
    const xIndex = Math.floor(x * scale.length)
    const yIndex = Math.floor((1 - y) * 3)
    const intervals = [2, 3, 4]
    const interval = intervals[yIndex]

    if (noteIndex % 4 === 0) {
      return xIndex
    } else {
      const lastIndex = this.melodicMemory.lastNotes[this.melodicMemory.lastNotes.length - 1] || 0
      return (lastIndex + interval) % scale.length
    }
  }

  /**
   * Get envelope settings based on articulation
   * @param {string} articulation - Articulation type
   * @param {number} duration - Note duration
   * @returns {Object} Envelope settings
   */
  getEnvelopeForArticulation(articulation, duration) {
    switch (articulation) {
      case 'staccato':
        return {
          attack: 0.005,
          decay: duration * 0.2,
          sustain: 0.3,
          release: duration * 0.3
        }
      case 'marcato':
        return {
          attack: 0.01,
          decay: duration * 0.3,
          sustain: 0.5,
          release: duration * 0.4
        }
      case 'legato':
        return {
          attack: duration * 0.1,
          decay: duration * 0.2,
          sustain: 0.7,
          release: duration * 0.7
        }
      default:
        return {
          attack: 0.005,
          decay: 0.02,
          sustain: 0.1,
          release: 0.05
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
