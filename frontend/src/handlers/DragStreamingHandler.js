/**
 * DragStreamingHandler.js
 * Handles drag streaming notes, melodic generation, and gesture-to-audio mapping
 * Extracted from main.js for Phase 2 refactoring
 */

// Entry #173 fix: Extract magic numbers to named constants
const MELODIC_CONFIG = {
  // Mathematical constants (scoped to avoid conflict with GenerativeMusicEngine.js)
  PHI: 1.618033988749895,
  PHI_SQ: 2.618033988749895,

  // Memory sizes
  SHORT_MEMORY_SIZE: 8,
  LONG_MEMORY_SIZE: 24,

  // Interval ranges by velocity tier
  INTERVAL_RANGES: {
    FAST: 7,     // velocity > 0.7
    MEDIUM: 5,   // velocity 0.4-0.7
    SLOW: 6      // velocity < 0.4
  },

  // Octave traversal configuration
  OCTAVE_TRAVERSAL: {
    START_THRESHOLD: 12,       // Notes before traversal begins
    MIN_NOTES_BETWEEN: 6,      // Minimum notes between shifts
    INITIAL_THRESHOLD: 0.85,   // Starting probability threshold
    THRESHOLD_DECAY: 0.15      // Decay over 100 notes (final = 0.70)
  },

  // Velocity thresholds for interval mode selection
  VELOCITY_THRESHOLDS: {
    FAST: 0.7,
    MEDIUM: 0.4
  }
}

class DragStreamingHandler {
  constructor(audioService, compositionalParameters = null) {
    this.audioService = audioService
    this.compositionalParameters = compositionalParameters

    // Entry #181: Current genre for melodic strategy
    this.currentGenre = 'melodic'
    this.genreStrategy = null

    // Cached scale for performance
    this.cachedScale = null
    this.cachedScaleType = null

    // Melodic memory for coherent phrases
    // Entry #172: Two-tier memory for long-term variety
    // Entry #173 fix: Added lastOctaveShift for rate limiting
    this.melodicMemory = {
      lastNotes: [],         // Short-term: last 8 notes for immediate coherence
      extendedHistory: [],   // Long-term: last 24 notes for anti-repetition
      currentDirection: 0,   // -1 down, 0 neutral, 1 up
      phrasePosition: 0,
      phaseAccumulator: 0,   // Accumulates PHI to break periodicity
      lastOctaveShift: -10   // Track last octave shift for rate limiting
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
   * Entry #181: Update current genre for melodic strategy differentiation
   * Called when genre changes from backend style updates
   * @param {string} genre - Genre name (electronic, ambient, jazz, rock, classical, etc.)
   */
  updateGenre(genre) {
    if (this.currentGenre === genre) return
    this.currentGenre = genre || 'melodic'

    // Get genre strategy from GenreMelodicStrategies if available
    if (window.GenreMelodicStrategies) {
      this.genreStrategy = window.GenreMelodicStrategies.getGenreMelodicStrategy(this.currentGenre)
    } else {
      this.genreStrategy = null
    }

    // console.log(`🎸 DragStreamingHandler: Genre updated to ${this.currentGenre}`)
  }

  /**
   * Entry #181: Get interval range for current genre and velocity tier
   * @param {string} tier - Velocity tier ('fast', 'medium', 'slow')
   * @returns {number} Maximum interval in semitones
   */
  _getGenreIntervalRange(tier) {
    if (this.genreStrategy && this.genreStrategy.intervalRange) {
      return this.genreStrategy.intervalRange[tier.toLowerCase()] || MELODIC_CONFIG.INTERVAL_RANGES[tier.toUpperCase()]
    }
    return MELODIC_CONFIG.INTERVAL_RANGES[tier.toUpperCase()] || 5
  }

  /**
   * Entry #181: Get preferred interval using genre strategy
   * @param {number} noteIndex - Note index for variation
   * @param {number} fallbackInterval - Fallback interval if no strategy
   * @returns {number} Interval in semitones
   */
  _getPreferredInterval(noteIndex, fallbackInterval) {
    if (this.genreStrategy && this.genreStrategy.preferredIntervals) {
      const intervals = this.genreStrategy.preferredIntervals
      const phiIndex = Math.floor((noteIndex * MELODIC_CONFIG.PHI) % intervals.length)
      return intervals[phiIndex]
    }
    return fallbackInterval
  }

  /**
   * Entry #181: Check if note should be repeated based on genre
   * @param {number} phiValue - PHI-based value (0-1)
   * @returns {boolean} True if should repeat
   */
  _shouldRepeatNote(phiValue) {
    if (this.genreStrategy) {
      return phiValue < (this.genreStrategy.noteRepetitionChance || 0.2)
    }
    return phiValue < 0.2
  }

  /**
   * Entry #181: Check if stepwise motion preferred
   * @param {number} phiValue - PHI-based value (0-1)
   * @returns {boolean} True if stepwise preferred
   */
  _shouldUseStepwise(phiValue) {
    if (this.genreStrategy && this.genreStrategy.characteristics) {
      return phiValue < (this.genreStrategy.characteristics.stepwiseChance || 0.5)
    }
    return phiValue < 0.5
  }

  /**
   * Get current scale
   * @returns {Array} Current scale degrees
   */
  getScale() {
    return this.cachedScale || window.MusicalScales?.getScale('pentatonic') || [0, 2, 4, 7, 9]
  }

  /**
   * Entry #181: Calculate melodic note data without playing
   * Used by main.js for genre-aware note calculation while keeping its own playback logic
   * @param {Object} noteData - Note data from gesture capture
   * @param {Array} [scale] - Optional scale to use (defaults to cached)
   * @returns {Object} Calculated note data { frequency, midiNote, scaleIndex, duration, envelope }
   */
  calculateMelodicNote(noteData, scale = null) {
    const x = noteData.position.x
    const y = noteData.position.y
    const useScale = scale || this.getScale()
    const baseOctave = window.MusicalConstants?.getBaseOctaveFromY(y) || 4

    // Calculate gesture direction
    const prevY = this.lastDragY || y
    const deltaY = y - prevY
    this.lastDragY = y
    const isAscending = deltaY < -0.02
    const isDescending = deltaY > 0.02

    // Reset state on first note
    if (noteData.noteIndex === 0) {
      this.melodicMemory = {
        lastNotes: [],
        extendedHistory: [],
        currentDirection: 0,
        phrasePosition: 0,
        phaseAccumulator: 0,
        lastOctaveShift: -10
      }
    }

    // Calculate scale index using genre-aware logic
    const velocity = noteData.velocity
    const scaleIndex = this.calculateScaleIndex(velocity, x, y, isAscending, isDescending, noteData.noteIndex, useScale)

    // Update melodic memory
    this.melodicMemory.lastNotes.push(scaleIndex)
    if (this.melodicMemory.lastNotes.length > MELODIC_CONFIG.SHORT_MEMORY_SIZE) {
      this.melodicMemory.lastNotes = this.melodicMemory.lastNotes.slice(-MELODIC_CONFIG.SHORT_MEMORY_SIZE)
    }
    this.melodicMemory.extendedHistory.push(scaleIndex)
    if (this.melodicMemory.extendedHistory.length > MELODIC_CONFIG.LONG_MEMORY_SIZE) {
      this.melodicMemory.extendedHistory = this.melodicMemory.extendedHistory.slice(-MELODIC_CONFIG.LONG_MEMORY_SIZE)
    }

    // Calculate MIDI note and frequency
    const scaleNote = useScale[scaleIndex % useScale.length]
    const octaveOffset = Math.floor(scaleIndex / useScale.length)
    const traversalOffset = this.calculateOctaveTraversal(noteData.noteIndex, y)
    const midiNote = 60 + (baseOctave - 4) * 12 + scaleNote + (octaveOffset + traversalOffset) * 12
    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12)

    // Calculate duration
    const duration = this.durationMap[noteData.duration] || 0.25

    // Get envelope
    const envelope = this.getEnvelopeForArticulation(noteData.articulation, duration)

    return {
      frequency,
      midiNote,
      scaleIndex,
      duration,
      envelope,
      position: { x, y },
      velocity: noteData.velocity,
      articulation: noteData.articulation
    }
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
    // Entry #172: Two-tier memory for long-term variety
    // Entry #173 fix: Use slice instead of shift for O(1) performance, use MELODIC_CONFIG
    this.melodicMemory.lastNotes.push(scaleIndex)
    if (this.melodicMemory.lastNotes.length > MELODIC_CONFIG.SHORT_MEMORY_SIZE) {
      this.melodicMemory.lastNotes = this.melodicMemory.lastNotes.slice(-MELODIC_CONFIG.SHORT_MEMORY_SIZE)
    }
    // Long-term memory for anti-repetition in extended drags
    this.melodicMemory.extendedHistory.push(scaleIndex)
    if (this.melodicMemory.extendedHistory.length > MELODIC_CONFIG.LONG_MEMORY_SIZE) {
      this.melodicMemory.extendedHistory = this.melodicMemory.extendedHistory.slice(-MELODIC_CONFIG.LONG_MEMORY_SIZE)
    }

    // Calculate MIDI note and frequency
    const scaleNote = scale[scaleIndex % scale.length]
    const octaveOffset = Math.floor(scaleIndex / scale.length)
    // Entry #172: Add octave traversal for long drags
    const traversalOffset = this.calculateOctaveTraversal(noteData.noteIndex, y)
    const midiNote = 60 + (baseOctave - 4) * 12 + scaleNote + (octaveOffset + traversalOffset) * 12
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

      // Entry #186b: Use safe trigger to avoid "Start time must be strictly greater" errors
      this.audioService.safeGestureSynthTrigger(
        frequency,
        duration,
        undefined,  // Let safeGestureSynthTrigger handle timing
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
    // Entry #173 fix: Use VELOCITY_THRESHOLDS constants
    if (velocity > MELODIC_CONFIG.VELOCITY_THRESHOLDS.FAST) {
      // FAST: Dynamic arpeggios - pass x for variety
      return this.calculateFastArpeggio(isAscending, isDescending, noteIndex, x)
    } else if (velocity > MELODIC_CONFIG.VELOCITY_THRESHOLDS.MEDIUM) {
      // MEDIUM: Contour melodies - pass y for variety
      return this.calculateMediumContour(x, isAscending, isDescending, noteIndex, y)
    } else {
      // SLOW: Intervallic exploration
      return this.calculateSlowIntervals(x, y, noteIndex, scale)
    }
  }

  /**
   * Calculate fast melodic pattern with variety
   * Entry #172: Multi-factor variety with extended memory and wider intervals
   * Entry #181: Genre-aware interval selection and note repetition
   * @param {boolean} isAscending - Whether ascending
   * @param {boolean} isDescending - Whether descending
   * @param {number} noteIndex - Current note index
   * @param {number} x - X position (0-1) for additional variety
   * @returns {number} Scale index
   */
  calculateFastArpeggio(isAscending, isDescending, noteIndex, x = 0.5) {
    // Entry #173 fix: Use global PHI constants
    const lastNote = this.melodicMemory.lastNotes[this.melodicMemory.lastNotes.length - 1] || 0

    // Entry #172: Multi-scale history analysis to break periodicity
    const shortHistory = this.melodicMemory.lastNotes.slice(-4)
    const longHistory = this.melodicMemory.extendedHistory || []

    // Short-term sum (recent notes)
    const shortSum = shortHistory.reduce((a, b) => a + b, 0)
    // Long-term sum (extended history)
    const longSum = longHistory.reduce((a, b) => a + b, 0)

    // Count direction changes in history
    let directionChanges = 0
    for (let i = 2; i < shortHistory.length; i++) {
      if ((shortHistory[i] - shortHistory[i - 1]) * (shortHistory[i - 1] - shortHistory[i - 2]) < 0) {
        directionChanges++
      }
    }

    // Phase accumulator (never resets during drag)
    this.melodicMemory.phaseAccumulator = (this.melodicMemory.phaseAccumulator || 0) + MELODIC_CONFIG.PHI
    const phaseOffset = this.melodicMemory.phaseAccumulator % 7  // Prime modulo

    // Entry #172: Combined multi-factor variety
    const varietyFactor = (
      (noteIndex * MELODIC_CONFIG.PHI) % 1 * 0.25 +           // PHI sequence
      (noteIndex * MELODIC_CONFIG.PHI_SQ) % 1 * 0.2 +         // PHI^2 sequence (uncorrelated)
      (shortSum * 0.15 + longSum * 0.05) % 1 + // History influence
      (directionChanges * 0.7) % 1 * 0.15 +    // Direction variety
      (x * 2.3) % 1 * 0.1 +                    // Position influence
      (phaseOffset / 7) * 0.15                 // Phase offset
    ) % 1

    // Entry #181: Check for note repetition based on genre
    if (this._shouldRepeatNote(varietyFactor)) {
      return lastNote
    }

    // Entry #181: Use genre-aware interval range or preferred interval
    const maxInterval = this._getGenreIntervalRange('fast')
    let interval

    // Entry #181: Use preferred intervals for certain genres
    if (this.genreStrategy && this.genreStrategy.preferredIntervals && varietyFactor > 0.3) {
      interval = this._getPreferredInterval(noteIndex, 1 + Math.floor(varietyFactor * maxInterval))
    } else {
      interval = 1 + Math.floor(varietyFactor * maxInterval)
    }

    // Entry #181: For ambient genre, force smaller intervals and prefer stepwise
    if (this.currentGenre === 'ambient' && this._shouldUseStepwise(varietyFactor)) {
      interval = Math.min(2, interval)
    }

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
   * Entry #172: Multi-factor variety with extended memory
   * Entry #181: Genre-aware interval selection
   * @param {number} x - X position (0-1)
   * @param {boolean} isAscending - Whether ascending
   * @param {boolean} isDescending - Whether descending
   * @param {number} noteIndex - Current note index
   * @param {number} y - Y position (0-1) for additional variety
   * @returns {number} Scale index
   */
  calculateMediumContour(x, isAscending, isDescending, noteIndex, y = 0.5) {
    // Entry #173 fix: Use global PHI constants
    const lastNote = this.melodicMemory.lastNotes[this.melodicMemory.lastNotes.length - 1] || 3

    // Entry #172: Multi-scale history for variety
    const shortHistory = this.melodicMemory.lastNotes.slice(-4)
    const longHistory = this.melodicMemory.extendedHistory || []
    const shortSum = shortHistory.reduce((a, b) => a + b, 0)
    const longSum = longHistory.reduce((a, b) => a + b, 0)

    // Phase accumulator
    this.melodicMemory.phaseAccumulator = (this.melodicMemory.phaseAccumulator || 0) + MELODIC_CONFIG.PHI
    const phaseOffset = this.melodicMemory.phaseAccumulator % 11  // Prime modulo

    // Entry #172: Combined multi-factor variety
    const varietyFactor = (
      (noteIndex * MELODIC_CONFIG.PHI) % 1 * 0.25 +
      (noteIndex * MELODIC_CONFIG.PHI_SQ) % 1 * 0.15 +
      (shortSum * 0.12 + longSum * 0.08) % 1 +
      (x * 2.5 + y * 1.8) % 1 * 0.2 +
      (phaseOffset / 11) * 0.2
    ) % 1

    // Entry #181: Check for note repetition based on genre
    if (this._shouldRepeatNote(varietyFactor)) {
      return lastNote
    }

    // Entry #181: Use genre-aware interval range
    const maxInterval = this._getGenreIntervalRange('medium')
    const baseInterval = 1 + Math.floor(x * 2)
    let interval = Math.max(1, Math.min(maxInterval, baseInterval + Math.floor(varietyFactor * 3)))

    // Entry #181: Use preferred intervals for jazz (chromatic approaches)
    if (this.currentGenre === 'jazz' && this.genreStrategy?.characteristics?.chromaticApproachChance) {
      if (varietyFactor < this.genreStrategy.characteristics.chromaticApproachChance) {
        interval = 1  // Chromatic approach (semitone)
      }
    }

    // Entry #181: Classical prefers stepwise motion
    if (this.currentGenre === 'classical' && this._shouldUseStepwise(varietyFactor)) {
      interval = Math.min(2, interval)
    }

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
   * Entry #172: Multi-factor variety with extended memory and wider intervals
   * Entry #181: Genre-aware interval selection
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} noteIndex - Current note index
   * @param {Array} scale - Current scale
   * @returns {number} Scale index
   */
  calculateSlowIntervals(x, y, noteIndex, scale) {
    // Entry #173 fix: Use global PHI constants
    const lastNote = this.melodicMemory.lastNotes[this.melodicMemory.lastNotes.length - 1] || Math.floor(scale.length / 2)

    // Entry #172: Multi-scale history for variety
    const shortHistory = this.melodicMemory.lastNotes.slice(-4)
    const longHistory = this.melodicMemory.extendedHistory || []
    const shortSum = shortHistory.reduce((a, b) => a + b, 0)
    const longSum = longHistory.reduce((a, b) => a + b, 0)

    // Phase accumulator
    this.melodicMemory.phaseAccumulator = (this.melodicMemory.phaseAccumulator || 0) + MELODIC_CONFIG.PHI
    const phaseOffset = this.melodicMemory.phaseAccumulator % 13  // Prime modulo

    // Entry #172: Combined multi-factor variety
    const varietyFactor = (
      (noteIndex * MELODIC_CONFIG.PHI) % 1 * 0.2 +
      (noteIndex * MELODIC_CONFIG.PHI_SQ) % 1 * 0.15 +
      (shortSum * 0.1 + longSum * 0.1) % 1 +
      (x * 3 + y * 2) % 1 * 0.25 +
      (phaseOffset / 13) * 0.2
    ) % 1

    // Entry #181: Check for note repetition based on genre (ambient especially)
    if (this._shouldRepeatNote(varietyFactor)) {
      return lastNote
    }

    // Entry #181: Use genre-aware interval range
    const maxInterval = this._getGenreIntervalRange('slow')

    // Y determines interval size (high Y = large intervals)
    const baseInterval = 1 + Math.floor((1 - y) * 4)

    // X determines direction tendency (left = descend, right = ascend)
    const directionBias = x - 0.5

    // Direction based on variety + X bias
    const direction = (varietyFactor + directionBias) > 0.5 ? 1 : -1

    // Entry #181: Genre-aware interval calculation
    let interval = Math.min(maxInterval, baseInterval + Math.floor(varietyFactor * 3))

    // Entry #181: Experimental genre allows extreme intervals
    if (this.currentGenre === 'experimental' && this.genreStrategy?.characteristics?.extremeRegisters) {
      if (varietyFactor > 0.8) {
        interval = maxInterval  // Use full range
      }
    }

    // Entry #181: Rock prefers pentatonic-like intervals
    if (this.currentGenre === 'rock' && this.genreStrategy?.preferredIntervals) {
      const rockIntervals = this.genreStrategy.preferredIntervals
      const idx = Math.floor(varietyFactor * rockIntervals.length)
      interval = rockIntervals[idx] || interval
    }

    const newNote = lastNote + (interval * direction)

    // Clamp to scale range
    return Math.max(0, Math.min(scale.length - 1, newNote))
  }

  /**
   * Calculate octave offset for extended phrases
   * Entry #172: Allows melody to traverse octaves during long drags
   * Entry #173 fix: Added rate limiting to prevent excessive octave shifts
   * @param {number} noteIndex - Current note index (0-based)
   * @param {number} y - Y position (0-1), where 0 is top, 1 is bottom
   * @returns {number} Octave offset (-1, 0, or +1)
   */
  calculateOctaveTraversal(noteIndex, y) {
    // Entry #173 fix: Use global MELODIC_CONFIG constants
    const { START_THRESHOLD, MIN_NOTES_BETWEEN, INITIAL_THRESHOLD, THRESHOLD_DECAY } = MELODIC_CONFIG.OCTAVE_TRAVERSAL

    // Only start traversing after START_THRESHOLD notes
    if (noteIndex < START_THRESHOLD) return 0

    // Entry #173 fix: Rate limiting - prevent shifts within MIN_NOTES_BETWEEN notes of previous shift
    const lastShift = this.melodicMemory.lastOctaveShift ?? -MIN_NOTES_BETWEEN
    if (noteIndex - lastShift < MIN_NOTES_BETWEEN) return 0

    // Use Y position to bias direction (top = up, bottom = down)
    const yBias = y < 0.33 ? 1 : y > 0.66 ? -1 : 0

    // PHI-based phase determines when to shift octave
    const phase = (noteIndex * MELODIC_CONFIG.PHI) % 1

    // Threshold decreases over time (more likely to shift as drag continues)
    // Starts at 0.85, decreases to 0.70 over 100 notes
    const threshold = INITIAL_THRESHOLD - (Math.min(noteIndex, 100) / 100) * THRESHOLD_DECAY

    if (phase > threshold) {
      // Track this shift for rate limiting
      this.melodicMemory.lastOctaveShift = noteIndex
      return yBias !== 0 ? yBias : (phase > 0.9 ? 1 : -1)
    }

    return 0
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
   * Entry #173 fix: Reset all memory fields including extendedHistory, phaseAccumulator, lastOctaveShift
   */
  resetMelodicMemory() {
    this.melodicMemory = {
      lastNotes: [],
      extendedHistory: [],
      currentDirection: 0,
      phrasePosition: 0,
      phaseAccumulator: 0,
      lastOctaveShift: -MELODIC_CONFIG.OCTAVE_TRAVERSAL.MIN_NOTES_BETWEEN
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
