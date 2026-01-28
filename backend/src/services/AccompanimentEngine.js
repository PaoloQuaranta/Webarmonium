/**
 * AccompanimentEngine.js - Sophisticated accompaniment generation
 * Entry #211: Brings accompaniment voices (bass, pad, keys) to counterpoint sophistication level
 *
 * Features:
 * - Voice leading between chord changes (minimizes intervallic jumps)
 * - Dynamic velocity curves (crescendo, diminuendo, swell, terraced)
 * - PHI-based temporal variation (different patterns across compositions)
 * - Intelligent chord voicings (inversions, extensions based on harmonic tension)
 * - Articulation variation per genre, position, and harmonic context
 * - Proper swing application for jazz
 */

const { PHI, getSwingAmount, getSyncopation, getArticulation } = require('../utils/GenreCharacteristics')

// ============================================
// CONSTANTS
// ============================================

// Velocity parameters
const BASS_BASE_VELOCITY = 0.65      // Base velocity for bass layer
const BASS_DYNAMIC_RANGE = 0.25      // Dynamic range added based on section level
const PAD_BASE_VELOCITY_AMBIENT = 0.35  // Quieter pads for ambient
const PAD_BASE_VELOCITY_DEFAULT = 0.45  // Standard pad velocity
const KEYS_BASE_VELOCITY = 0.55      // Base velocity for keys layer
const KEYS_DYNAMIC_RANGE = 0.2       // Dynamic range for keys

// Velocity curve limits
const VELOCITY_CURVE_MIN = 0.5       // Minimum velocity multiplier
const VELOCITY_CURVE_MAX = 1.2       // Maximum velocity multiplier

// Timing constants
const MS_PER_BEAT_AT_120BPM = 500    // Milliseconds per beat at 120 BPM (for stagger conversion)

// Harmonic tension thresholds for chord extensions
const TENSION_THRESHOLD_7TH = 0.6    // Add 7th when tension > 0.6
const TENSION_THRESHOLD_9TH = 0.8    // Add 9th when tension > 0.8
const TENSION_THRESHOLD_VARIED_ARTICULATION = 0.7  // Use varied articulation above this

class AccompanimentEngine {
  /**
   * Create AccompanimentEngine
   * @param {Object} harmonicEngine - HarmonicEngine instance for chord building
   */
  constructor(harmonicEngine) {
    this.harmonicEngine = harmonicEngine

    // Voice ranges for accompaniment layers (MIDI note numbers)
    this.layerRanges = {
      bass_accomp: { min: 28, max: 48 },  // E1 to C3
      pad: { min: 48, max: 72 },           // C3 to C5
      keys: { min: 48, max: 84 }           // C3 to C6
    }

    // Previous chord voicings for voice leading (per layer)
    this._previousVoicings = {
      bass_accomp: null,
      pad: null,
      keys: null
    }
  }

  /**
   * Reset voice leading state (call at start of new section)
   */
  resetVoiceLeading() {
    this._previousVoicings = {
      bass_accomp: null,
      pad: null,
      keys: null
    }
  }

  // ============================================
  // VOICE LEADING
  // ============================================

  /**
   * Apply voice leading to chord transition
   * Minimizes intervallic movement between successive chords
   * @param {number[]|null} previousPitches - Previous chord pitches or null
   * @param {number[]} targetPitches - Target chord pitches (pitch classes or MIDI)
   * @param {Object} range - {min, max} MIDI pitch range
   * @returns {number[]} Voice-led MIDI pitches
   */
  applyVoiceLeading(previousPitches, targetPitches, range) {
    if (!targetPitches || targetPitches.length === 0) {
      return []
    }

    // First chord: place in comfortable register
    if (!previousPitches || previousPitches.length === 0) {
      return this._placeInRegister(targetPitches, range)
    }

    const ledPitches = []
    const usedPitches = new Set()

    // For each target pitch, find closest available position
    targetPitches.forEach((targetPitch) => {
      let bestPitch = targetPitch
      let minDistance = Infinity

      // Try all octave placements within range
      for (let octaveShift = -3; octaveShift <= 3; octaveShift++) {
        const candidatePitch = targetPitch + (octaveShift * 12)

        if (candidatePitch < range.min || candidatePitch > range.max) continue
        if (usedPitches.has(candidatePitch)) continue

        // Find minimum distance to any previous pitch
        const distance = Math.min(...previousPitches.map(p =>
          Math.abs(candidatePitch - p)
        ))

        if (distance < minDistance) {
          minDistance = distance
          bestPitch = candidatePitch
        }
      }

      // Ensure pitch is in range
      while (bestPitch < range.min) bestPitch += 12
      while (bestPitch > range.max) bestPitch -= 12

      ledPitches.push(bestPitch)
      usedPitches.add(bestPitch)
    })

    return ledPitches.sort((a, b) => a - b)
  }

  /**
   * Place pitches in comfortable register for first chord
   * @param {number[]} pitches - Pitch classes or raw pitches
   * @param {Object} range - {min, max} range
   * @returns {number[]} MIDI pitches in register
   */
  _placeInRegister(pitches, range) {
    const center = (range.min + range.max) / 2
    return pitches.map(pitch => {
      let placed = pitch
      // Move into range
      while (placed < range.min) placed += 12
      while (placed > range.max) placed -= 12
      // Prefer pitches near center
      if (placed + 12 <= range.max &&
          Math.abs(placed + 12 - center) < Math.abs(placed - center)) {
        placed += 12
      }
      if (placed - 12 >= range.min &&
          Math.abs(placed - 12 - center) < Math.abs(placed - center)) {
        placed -= 12
      }
      return placed
    }).sort((a, b) => a - b)
  }

  // ============================================
  // VELOCITY CURVES
  // ============================================

  /**
   * Get velocity curve multiplier based on dynamic contour and harmonic tension
   * @param {string} contour - Dynamic contour type
   * @param {number} position - Position in phrase (0-1)
   * @param {number} harmonicTension - Harmonic tension level (0-1)
   * @returns {number} Velocity multiplier (0.5-1.2)
   */
  _getVelocityCurve(contour, position, harmonicTension = 0.5) {
    let baseCurve
    switch (contour) {
      case 'crescendo':
        baseCurve = 0.6 + position * 0.5  // 0.6 to 1.1
        break
      case 'diminuendo':
        baseCurve = 1.1 - position * 0.5  // 1.1 to 0.6
        break
      case 'terraced':
        baseCurve = 0.7 + Math.floor(position * 4) * 0.1  // Step increases
        break
      case 'swell':
        // Crescendo then diminuendo (arch shape)
        const swellPos = position < 0.5 ? position * 2 : (1 - position) * 2
        baseCurve = 0.7 + swellPos * 0.4
        break
      default:
        // Stable with slight arch for natural phrasing
        baseCurve = 0.8 + Math.sin(position * Math.PI) * 0.15
    }

    // Harmonic tension modulates dynamic range
    // Higher tension = more dynamic variation
    const tensionModifier = 1 + (harmonicTension - 0.5) * 0.2

    return Math.max(VELOCITY_CURVE_MIN, Math.min(VELOCITY_CURVE_MAX, baseCurve * tensionModifier))
  }

  // ============================================
  // BASS ACCOMPANIMENT
  // ============================================

  /**
   * Generate bass accompaniment with voice leading, dynamics, and articulation
   * @param {Array} progression - Chord progression
   * @param {string} genre - Current genre
   * @param {number} sectionLength - Section length in bars
   * @param {Object} sectionContext - Section context for dynamics
   * @param {number} compositionCount - For PHI-based variation
   * @returns {Object} Bass accompaniment layer
   */
  generateBassAccompaniment(progression, genre, sectionLength, sectionContext, compositionCount) {
    if (!progression || progression.length === 0) {
      return { type: 'bass_accomp', notes: [], genre }
    }

    const syncopation = getSyncopation(genre)
    const swingAmount = getSwingAmount(genre)
    const range = this.layerRanges.bass_accomp

    const notes = []
    const sectionBeats = sectionLength * 4
    const progressionLength = progression.length

    // Dynamic contour from section context
    const dynamicContour = sectionContext?.dynamicContour || 'stable'
    const harmonicTension = Math.max(0, Math.min(1, sectionContext?.harmonicTension || 0.5))
    const baseVelocity = BASS_BASE_VELOCITY + (sectionContext?.dynamicLevel || 0.5) * BASS_DYNAMIC_RANGE

    let previousPitch = this._previousVoicings.bass_accomp?.[0] || null

    progression.forEach((chord, chordIndex) => {
      const chordStartBeat = chordIndex * (sectionBeats / progressionLength)
      const chordDuration = sectionBeats / progressionLength
      const chordProgress = chordIndex / progressionLength

      // Get chord root and fifth
      const pitchClass = (chord.root !== undefined && chord.root !== null) ? chord.root : 0
      const chordTones = this.harmonicEngine.buildChord(chord.chord || 'major')

      // Target pitches for voice leading
      const targetRoot = 36 + pitchClass  // C2 base
      const targetFifth = targetRoot + 7

      // Apply voice leading
      const voicedPitches = this.applyVoiceLeading(
        previousPitch ? [previousPitch] : null,
        [targetRoot, targetFifth],
        range
      )

      const root = voicedPitches[0] || targetRoot
      const fifth = voicedPitches[1] || targetFifth

      // Generate pattern based on genre
      const patternNotes = this._generateBassPattern(
        root, fifth, chordTones, pitchClass,
        genre, chordDuration, chordStartBeat,
        syncopation, swingAmount, compositionCount, chordIndex
      )

      // Apply velocity curve and articulation
      patternNotes.forEach((note, noteIndex) => {
        const noteProgress = (chordProgress + noteIndex / Math.max(1, patternNotes.length) / progressionLength)
        const velocityCurve = this._getVelocityCurve(dynamicContour, noteProgress, harmonicTension)

        note.velocity = Math.round(baseVelocity * velocityCurve * 127)
        note.velocity = Math.max(40, Math.min(120, note.velocity))
        note.articulation = this._selectBassArticulation(genre, noteIndex, patternNotes.length, syncopation)
      })

      notes.push(...patternNotes)
      previousPitch = root
    })

    this._previousVoicings.bass_accomp = previousPitch ? [previousPitch] : null

    return {
      type: 'bass_accomp',
      notes,
      genre
    }
  }

  /**
   * Generate bass pattern for a single chord
   * @private
   */
  _generateBassPattern(root, fifth, chordTones, rootPitchClass, genre, duration, startBeat,
                       syncopation, swingAmount, compositionCount, chordIndex) {
    const notes = []

    // PHI-based pattern variation
    const patternIndex = Math.floor(((compositionCount || 0) * PHI + chordIndex * PHI * 0.3) % 4)

    switch (genre) {
      case 'jazz':
        return this._generateWalkingBass(root, chordTones, rootPitchClass, duration, startBeat, swingAmount)

      case 'electronic':
      case 'rhythmic':
        return this._generateDrivingBass(root, fifth, duration, startBeat, syncopation, patternIndex)

      case 'rock':
        return this._generatePowerBass(root, fifth, duration, startBeat, patternIndex)

      case 'ambient':
        return this._generateAmbientBass(root, duration, startBeat, patternIndex)

      case 'classical':
        return this._generateClassicalBass(root, chordTones, rootPitchClass, duration, startBeat, patternIndex)

      default:
        return this._generateMelodicBass(root, fifth, chordTones, rootPitchClass, duration, startBeat, patternIndex)
    }
  }

  /**
   * Walking bass for jazz
   * Uses chord tones in ascending pattern with swing feel
   * @param {number} root - MIDI root note (already voiced)
   * @param {number[]} chordTones - Chord intervals from root [0, 3/4, 7, ...]
   * @param {number} rootPitchClass - Root pitch class (0-11)
   * @param {number} duration - Duration in beats
   * @param {number} startBeat - Start beat position
   * @param {number} swingAmount - Swing ratio (0-0.67)
   * @returns {Object[]} Array of note objects
   * @private
   */
  _generateWalkingBass(root, chordTones, rootPitchClass, duration, startBeat, swingAmount) {
    const notes = []
    const bassOctave = 36

    // chordTones are intervals: [0, 3, 7] for minor, [0, 4, 7] for major
    const third = chordTones[1] || 4
    const fifth = chordTones[2] || 7
    // Use 7th if available (for jazz), otherwise use octave approach
    const seventh = chordTones[3] || 10  // Minor 7th as default leading tone

    // Classic walking bass pattern: root -> third -> fifth -> approach note
    const walkingNotes = [
      bassOctave + rootPitchClass,               // Beat 1: Root
      bassOctave + rootPitchClass + third,       // Beat 2: Third
      bassOctave + rootPitchClass + fifth,       // Beat 3: Fifth
      bassOctave + rootPitchClass + seventh      // Beat 4: 7th (leading tone)
    ]

    const notesPerBar = Math.min(4, Math.floor(duration))
    for (let i = 0; i < notesPerBar; i++) {
      const swingOffset = (i % 2 === 1) ? swingAmount * 0.15 : 0
      notes.push({
        pitch: walkingNotes[i % walkingNotes.length],
        startBeat: startBeat + i + swingOffset,
        duration: 0.85
      })
    }

    return notes
  }

  /**
   * Driving eighths for electronic
   * @private
   */
  _generateDrivingBass(root, fifth, duration, startBeat, syncopation, patternIndex) {
    const notes = []

    // PHI-varied patterns
    const patterns = [
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],      // Straight eighths
      [0, 0.5, 1, 1.75, 2, 2.5, 3, 3.75],    // Syncopated
      [0, 0.75, 1, 1.5, 2, 2.75, 3, 3.5],    // Pushed
      [0, 0.5, 1.25, 1.5, 2, 2.5, 3.25, 3.5] // Funkier
    ]

    const pattern = patterns[patternIndex % patterns.length]

    for (let i = 0; i < pattern.length && pattern[i] < duration; i++) {
      const beat = pattern[i]
      const isSyncopated = Math.random() < syncopation * 0.3
      const pitch = i % 4 === 2 ? fifth : root  // Occasional fifth

      notes.push({
        pitch,
        startBeat: startBeat + beat + (isSyncopated ? -0.125 : 0),
        duration: 0.4
      })
    }

    return notes
  }

  /**
   * Power bass for rock
   * @private
   */
  _generatePowerBass(root, fifth, duration, startBeat, patternIndex) {
    const notes = []

    // PHI-varied power patterns
    const patterns = [
      [[0, 1.5], [2, 0.5], [2.5, 0.5], [3, 0.8]],
      [[0, 1.0], [1, 0.5], [2, 1.0], [3, 0.8]],
      [[0, 0.75], [1, 0.75], [2, 0.75], [3, 0.75]],
      [[0, 2.0], [2.5, 0.5], [3, 0.8]]
    ]

    const pattern = patterns[patternIndex % patterns.length]
    const useFifth = [false, false, true, false]

    pattern.forEach((entry, i) => {
      const [beat, noteDuration] = entry
      if (beat < duration) {
        notes.push({
          pitch: useFifth[i % useFifth.length] ? fifth : root,
          startBeat: startBeat + beat,
          duration: noteDuration
        })
      }
    })

    return notes
  }

  /**
   * Ambient bass - sustained roots
   * @private
   */
  _generateAmbientBass(root, duration, startBeat, patternIndex) {
    const notes = []

    // Very sparse - just root with occasional movement
    if (patternIndex % 2 === 0) {
      // Single sustained note
      notes.push({
        pitch: root,
        startBeat,
        duration: duration * 0.9
      })
    } else {
      // Slight movement
      notes.push({
        pitch: root,
        startBeat,
        duration: duration * 0.6
      })
      notes.push({
        pitch: root - 5,  // Down a fourth
        startBeat: startBeat + duration * 0.65,
        duration: duration * 0.3
      })
    }

    return notes
  }

  /**
   * Classical bass - Alberti-influenced
   * @private
   */
  _generateClassicalBass(root, chordTones, rootPitchClass, duration, startBeat, patternIndex) {
    const notes = []
    const bassOctave = 36

    const third = chordTones[1] || 4
    const fifth = chordTones[2] || 7

    // Alberti-style patterns
    const patterns = [
      [0, fifth, third, fifth],     // Classic Alberti
      [0, third, fifth, third],     // Inverted Alberti
      [0, fifth, 0 + 12, fifth],    // Octave bounce
      [0, third, fifth, 0 + 12]     // Ascending
    ]

    const pattern = patterns[patternIndex % patterns.length]
    const noteLength = duration / pattern.length

    pattern.forEach((interval, i) => {
      if (i * noteLength < duration) {
        notes.push({
          pitch: bassOctave + rootPitchClass + interval,
          startBeat: startBeat + i * noteLength,
          duration: noteLength * 0.85
        })
      }
    })

    return notes
  }

  /**
   * Melodic bass - default pattern with more movement
   * @private
   */
  _generateMelodicBass(root, fifth, chordTones, rootPitchClass, duration, startBeat, patternIndex) {
    const notes = []

    // Create melodic interest with chord tones
    const third = chordTones[1] || 4

    const patterns = [
      [[0, 0.5], [root, 1.5]],
      [[0, 0.5], [root + third, 0.5], [root, 1.0]],
      [[0, 1.0], [fifth, 0.5], [root, 0.5]],
      [[0, 0.75], [root + third, 0.75], [fifth, 0.75], [root, 0.75]]
    ]

    const pattern = patterns[patternIndex % patterns.length]

    let beatOffset = 0
    pattern.forEach(([pitch, noteDur]) => {
      if (beatOffset < duration) {
        notes.push({
          pitch: pitch === 0 ? root : pitch,
          startBeat: startBeat + beatOffset,
          duration: Math.min(noteDur, duration - beatOffset) * 0.9
        })
        beatOffset += noteDur
      }
    })

    return notes
  }

  /**
   * Select bass articulation based on context
   * @private
   */
  _selectBassArticulation(genre, noteIndex, totalNotes, syncopation) {
    const position = noteIndex / Math.max(1, totalNotes)

    switch (genre) {
      case 'jazz':
        return noteIndex % 4 === 3 ? 'staccato' : 'portato'
      case 'rock':
        return 'marcato'
      case 'electronic':
      case 'rhythmic':
        return position > 0.75 ? 'staccato' : 'normal'
      case 'ambient':
        return 'legato'
      case 'classical':
        return noteIndex === 0 ? 'marcato' : 'normal'
      default:
        return syncopation > 0.5 && noteIndex % 2 === 1 ? 'staccato' : 'normal'
    }
  }

  // ============================================
  // PAD ACCOMPANIMENT
  // ============================================

  /**
   * Generate pad accompaniment with voice leading, dynamics, and intelligent voicing
   * @param {Array} progression - Chord progression
   * @param {string} genre - Current genre
   * @param {number} sectionLength - Section length in bars
   * @param {Object} sectionContext - Section context for dynamics
   * @param {number} compositionCount - For PHI-based variation
   * @returns {Object} Pad accompaniment layer
   */
  generatePadAccompaniment(progression, genre, sectionLength, sectionContext, compositionCount) {
    if (!progression || progression.length === 0) {
      return { type: 'pad', notes: [], genre, sustain: true }
    }

    const range = this.layerRanges.pad
    const notes = []
    const sectionBeats = sectionLength * 4
    const progressionLength = progression.length

    // Dynamic parameters
    const dynamicContour = sectionContext?.dynamicContour || 'stable'
    const harmonicTension = Math.max(0, Math.min(1, sectionContext?.harmonicTension || 0.5))
    const baseVelocity = genre === 'ambient' ? PAD_BASE_VELOCITY_AMBIENT : PAD_BASE_VELOCITY_DEFAULT

    // Stagger parameters based on genre and PHI
    const temporalOffset = ((compositionCount || 0) * PHI) % 1

    let previousVoicing = this._previousVoicings.pad

    progression.forEach((chord, chordIndex) => {
      const chordStartBeat = chordIndex * (sectionBeats / progressionLength)
      const chordDuration = sectionBeats / progressionLength
      const chordProgress = chordIndex / progressionLength

      // Build chord with appropriate extensions based on tension
      const chordPitches = this._buildPadChord(chord, harmonicTension, compositionCount)

      // Apply voice leading
      const voicedPitches = this.applyVoiceLeading(previousVoicing, chordPitches, range)

      // Velocity curve for this chord
      const velocityCurve = this._getVelocityCurve(dynamicContour, chordProgress, harmonicTension)
      const chordVelocity = Math.round(baseVelocity * velocityCurve * 127)

      // Get stagger amount for this genre
      const staggerBeats = this._getPadStagger(genre, temporalOffset, voicedPitches.length)

      // Generate pad notes with intelligent stagger
      voicedPitches.forEach((pitch, voiceIndex) => {
        // Velocity shaping per voice (inner voices slightly quieter)
        const isOuterVoice = voiceIndex === 0 || voiceIndex === voicedPitches.length - 1
        const voiceVelocityMod = isOuterVoice ? 1.0 : 0.9

        const noteStagger = staggerBeats * voiceIndex

        notes.push({
          pitch,
          startBeat: chordStartBeat + noteStagger,
          duration: Math.max(0.5, chordDuration * 0.95 - noteStagger),
          velocity: Math.round(chordVelocity * voiceVelocityMod),
          articulation: 'legato'
        })
      })

      previousVoicing = voicedPitches
    })

    this._previousVoicings.pad = previousVoicing

    return {
      type: 'pad',
      notes,
      genre,
      sustain: true
    }
  }

  /**
   * Build pad chord with extensions based on harmonic tension
   * @private
   */
  _buildPadChord(chord, harmonicTension, compositionCount) {
    const baseChord = this.harmonicEngine.buildChord(chord.chord || 'major')
    const rootPitchClass = chord.root !== undefined ? chord.root : 0
    const padOctave = 60  // C4 base

    // Convert chord intervals to MIDI pitches
    const pitches = baseChord.map(interval => padOctave + rootPitchClass + interval)

    // Add extensions based on harmonic tension
    if (harmonicTension > TENSION_THRESHOLD_7TH) {
      // Add 7th
      const isMajor = (chord.chord || '').includes('maj') || chord.chord === 'major'
      const seventh = isMajor ? 11 : 10
      pitches.push(padOctave + rootPitchClass + seventh)
    }

    if (harmonicTension > TENSION_THRESHOLD_9TH) {
      // Add 9th (in upper octave to avoid mud)
      pitches.push(padOctave + 12 + rootPitchClass + 2)
    }

    return pitches
  }

  /**
   * Get pad stagger amount based on genre
   * @private
   */
  _getPadStagger(genre, temporalOffset, voiceCount) {
    // Base stagger in beats (converted from ms approximation)
    const baseStaggerMs = {
      ambient: 100,
      classical: 60,
      jazz: 30,
      electronic: 20,
      rhythmic: 15,
      rock: 15
    }

    const baseMs = baseStaggerMs[genre] || 50
    const variedMs = baseMs + temporalOffset * 30

    // Convert ms to beats (MS_PER_BEAT_AT_120BPM = 500ms = 1 beat at 120 BPM)
    return (variedMs / MS_PER_BEAT_AT_120BPM) * (1 / Math.max(1, voiceCount - 1))
  }

  // ============================================
  // KEYS ACCOMPANIMENT
  // ============================================

  /**
   * Generate keys accompaniment with voice leading, swing, dynamics, and articulation
   * @param {Array} progression - Chord progression
   * @param {string} genre - Current genre
   * @param {number} sectionLength - Section length in bars
   * @param {Object} sectionContext - Section context for dynamics
   * @param {number} compositionCount - For PHI-based variation
   * @returns {Object} Keys accompaniment layer
   */
  generateKeysAccompaniment(progression, genre, sectionLength, sectionContext, compositionCount) {
    if (!progression || progression.length === 0) {
      return { type: 'keys', notes: [], genre }
    }

    const syncopation = getSyncopation(genre)
    const swingAmount = getSwingAmount(genre)
    const baseArticulation = getArticulation(genre)
    const range = this.layerRanges.keys

    const notes = []
    const sectionBeats = sectionLength * 4
    const progressionLength = progression.length

    // Dynamic parameters
    const dynamicContour = sectionContext?.dynamicContour || 'stable'
    const harmonicTension = Math.max(0, Math.min(1, sectionContext?.harmonicTension || 0.5))
    const baseVelocity = KEYS_BASE_VELOCITY + (sectionContext?.dynamicLevel || 0.5) * KEYS_DYNAMIC_RANGE

    let previousVoicing = this._previousVoicings.keys

    progression.forEach((chord, chordIndex) => {
      const chordStartBeat = chordIndex * (sectionBeats / progressionLength)
      const chordDuration = sectionBeats / progressionLength
      const chordProgress = chordIndex / progressionLength

      // Build chord
      const chordNotes = this.harmonicEngine.buildChord(chord.chord || 'major')
      const rootPitchClass = chord.root !== undefined ? chord.root : 0
      const keysOctave = 60  // C4 base

      const targetPitches = chordNotes.map(interval => keysOctave + rootPitchClass + interval)
      const voicedPitches = this.applyVoiceLeading(previousVoicing, targetPitches, range)

      // Generate rhythm pattern based on genre
      const patternNotes = this._generateKeysPattern(
        voicedPitches, genre, chordDuration, chordStartBeat,
        syncopation, swingAmount, compositionCount, chordIndex
      )

      // Apply velocity curve and articulation
      patternNotes.forEach((note, noteIndex) => {
        const noteProgress = chordProgress + (noteIndex / Math.max(1, patternNotes.length)) / progressionLength
        const velocityCurve = this._getVelocityCurve(dynamicContour, noteProgress, harmonicTension)

        note.velocity = Math.round(baseVelocity * velocityCurve * 127)
        note.velocity = Math.max(35, Math.min(115, note.velocity))
        note.articulation = this._selectKeysArticulation(
          genre, baseArticulation, noteIndex, patternNotes.length, harmonicTension
        )
      })

      notes.push(...patternNotes)
      previousVoicing = voicedPitches
    })

    this._previousVoicings.keys = previousVoicing

    return {
      type: 'keys',
      notes,
      genre,
      articulation: baseArticulation
    }
  }

  /**
   * Generate keys pattern for a single chord
   * @private
   */
  _generateKeysPattern(voicedPitches, genre, duration, startBeat,
                       syncopation, swingAmount, compositionCount, chordIndex) {
    // PHI-based pattern selection
    const patternIndex = Math.floor(((compositionCount || 0) * PHI + chordIndex * PHI * 0.5) % 4)

    switch (genre) {
      case 'electronic':
      case 'rhythmic':
        return this._generateArpeggio(voicedPitches, duration, startBeat, syncopation, patternIndex)

      case 'jazz':
        return this._generateJazzComping(voicedPitches, duration, startBeat, swingAmount, syncopation)

      case 'rock':
        return this._generateRockStabs(voicedPitches, duration, startBeat, patternIndex)

      case 'classical':
        return this._generateClassicalKeys(voicedPitches, duration, startBeat, patternIndex)

      case 'ambient':
        return this._generateAmbientKeys(voicedPitches, duration, startBeat)

      default:
        return this._generateBlockChords(voicedPitches, duration, startBeat, patternIndex)
    }
  }

  /**
   * Arpeggio for electronic/rhythmic
   * @private
   */
  _generateArpeggio(pitches, duration, startBeat, syncopation, patternIndex) {
    const notes = []
    const directions = ['up', 'down', 'updown', 'random']
    const direction = directions[patternIndex % directions.length]

    let orderedPitches
    switch (direction) {
      case 'down':
        orderedPitches = [...pitches].reverse()
        break
      case 'updown':
        orderedPitches = [...pitches, ...pitches.slice(1, -1).reverse()]
        break
      case 'random':
        orderedPitches = [...pitches].sort(() => ((patternIndex * PHI) % 1) - 0.5)
        break
      default: // up
        orderedPitches = [...pitches]
    }

    if (orderedPitches.length === 0) return notes

    const noteLength = 0.25  // 16th notes
    let beatOffset = 0
    let pitchIndex = 0

    while (beatOffset < duration) {
      const pitch = orderedPitches[pitchIndex % orderedPitches.length]
      const isSyncopated = Math.random() < syncopation * 0.2

      notes.push({
        pitch,
        startBeat: startBeat + beatOffset + (isSyncopated ? -0.0625 : 0),
        duration: noteLength * 0.8
      })

      beatOffset += noteLength
      pitchIndex++
    }

    return notes
  }

  /**
   * Jazz comping with swing
   * @private
   */
  _generateJazzComping(pitches, duration, startBeat, swingAmount, syncopation) {
    const notes = []

    // Jazz comping: sparse, syncopated chords
    const compBeats = [0, 1.5, 2.5]
    const anticipationProb = syncopation * 0.5

    compBeats.forEach(beat => {
      if (beat >= duration) return

      const swingOffset = (beat % 1 > 0) ? swingAmount * 0.15 : 0
      const anticipate = Math.random() < anticipationProb
      const adjustedBeat = anticipate ? Math.max(0, beat - 0.25) : beat

      pitches.forEach(pitch => {
        notes.push({
          pitch,
          startBeat: startBeat + adjustedBeat + swingOffset,
          duration: 0.4 + Math.random() * 0.2
        })
      })
    })

    return notes
  }

  /**
   * Rock power chord stabs
   * @private
   */
  _generateRockStabs(pitches, duration, startBeat, patternIndex) {
    const notes = []

    // PHI-varied stab patterns
    const patterns = [
      [0, 2, 2.5, 3.5],
      [0, 1, 2, 3],
      [0, 0.5, 2, 2.5],
      [0, 1.5, 3]
    ]

    const pattern = patterns[patternIndex % patterns.length]

    pattern.forEach(beat => {
      if (beat >= duration) return

      pitches.forEach(pitch => {
        notes.push({
          pitch,
          startBeat: startBeat + beat,
          duration: 0.4
        })
      })
    })

    return notes
  }

  /**
   * Classical block chords / broken chords
   * @private
   */
  _generateClassicalKeys(pitches, duration, startBeat, patternIndex) {
    const notes = []

    if (patternIndex % 2 === 0) {
      // Block chords on beats
      const beats = [0, 2]
      beats.forEach(beat => {
        if (beat >= duration) return
        pitches.forEach(pitch => {
          notes.push({
            pitch,
            startBeat: startBeat + beat,
            duration: 1.5
          })
        })
      })
    } else {
      // Broken chord
      pitches.forEach((pitch, i) => {
        const beat = i * 0.5
        if (beat >= duration) return
        notes.push({
          pitch,
          startBeat: startBeat + beat,
          duration: duration - beat
        })
      })
    }

    return notes
  }

  /**
   * Ambient sparse pads
   * @private
   */
  _generateAmbientKeys(pitches, duration, startBeat) {
    const notes = []

    // Very sparse - single chord hit
    pitches.forEach((pitch, i) => {
      notes.push({
        pitch,
        startBeat: startBeat + i * 0.03,  // Tiny stagger
        duration: duration * 0.85
      })
    })

    return notes
  }

  /**
   * Default block chord pattern
   * @private
   */
  _generateBlockChords(pitches, duration, startBeat, patternIndex) {
    const notes = []

    // PHI-varied block patterns
    const patterns = [
      [0, 2],
      [0, 1.5, 3],
      [0, 1, 2, 3],
      [0, 2.5]
    ]

    const pattern = patterns[patternIndex % patterns.length]

    pattern.forEach(beat => {
      if (beat >= duration) return
      pitches.forEach(pitch => {
        notes.push({
          pitch,
          startBeat: startBeat + beat,
          duration: 0.8
        })
      })
    })

    return notes
  }

  /**
   * Select keys articulation based on context
   * @private
   */
  _selectKeysArticulation(genre, baseArticulation, noteIndex, totalNotes, harmonicTension) {
    const position = noteIndex / Math.max(1, totalNotes)

    // High tension: more varied articulation
    if (harmonicTension > TENSION_THRESHOLD_VARIED_ARTICULATION) {
      const options = ['staccato', 'marcato', 'normal', 'portato']
      const phiIndex = Math.floor((noteIndex * PHI) % options.length)
      return options[phiIndex]
    }

    // Genre-specific defaults
    switch (genre) {
      case 'jazz':
        return position > 0.7 ? 'staccato' : 'portato'
      case 'rock':
        return 'marcato'
      case 'ambient':
        return 'legato'
      default:
        // Use genre articulation with position variation
        if (position < 0.25 || position > 0.9) {
          return baseArticulation === 'legato' ? 'portato' : baseArticulation
        }
        return baseArticulation
    }
  }
}

module.exports = AccompanimentEngine
