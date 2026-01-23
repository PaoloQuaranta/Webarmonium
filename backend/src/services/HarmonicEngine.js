const { PHI } = require('../utils/constants')

class HarmonicEngine {
  constructor() {
    this.currentKey = 'C'
    this.currentMode = 'ionian'
    this.currentChord = null
    this.progressionHistory = []

    // Musical scales and intervals
    this.scales = {
      ionian: [0, 2, 4, 5, 7, 9, 11],        // Major
      dorian: [0, 2, 3, 5, 7, 9, 10],        // Dorian
      phrygian: [0, 1, 3, 5, 7, 8, 10],       // Phrygian
      lydian: [0, 2, 4, 6, 7, 9, 11],        // Lydian
      mixolydian: [0, 2, 4, 5, 7, 9, 10],    // Mixolydian
      aeolian: [0, 2, 3, 5, 7, 8, 10],       // Natural minor
      locrian: [0, 1, 3, 5, 6, 8, 10],       // Locrian
      harmonicMinor: [0, 2, 3, 5, 7, 8, 11],  // Harmonic minor
      melodicMinor: [0, 2, 3, 5, 7, 9, 11],   // Melodic minor
      majorPentatonic: [0, 2, 4, 7, 9],        // Major pentatonic
      minorPentatonic: [0, 3, 5, 7, 10],       // Minor pentatonic
      blues: [0, 3, 5, 6, 7, 10],             // Blues scale
      wholeTone: [0, 2, 4, 6, 8, 10],         // Whole tone
      diminished: [0, 2, 3, 5, 6, 8, 9, 11]   // Diminished
    }

    // Chord quality definitions
    this.chordQualities = {
      major: [0, 4, 7],
      minor: [0, 3, 7],
      diminished: [0, 3, 6],
      augmented: [0, 4, 8],
      major7: [0, 4, 7, 11],
      minor7: [0, 3, 7, 10],
      dominant7: [0, 4, 7, 10],
      halfDiminished7: [0, 3, 6, 10],
      diminished7: [0, 3, 6, 9],
      suspended2: [0, 2, 7],
      suspended4: [0, 5, 7]
    }
  }

  /**
   * Select progression by complexity with golden ratio context variation
   * WEIGHTING: Complexity dominates (70%) for harmonic appropriateness, bars provide drift (30%)
   * Entry #117: Added compositionCount for temporal variation across compositions
   * @param {Array} progressions - Array of progression options
   * @param {number} complexity - 0-1 complexity value
   * @param {number} bars - Number of bars for context variation
   * @param {number} compositionCount - Composition counter for temporal variation
   * @returns {Array} Selected progression
   */
  _selectProgressionByComplexity(progressions, complexity, bars, compositionCount = 0) {
    const safeComplexity = complexity || 0.5
    const safeBars = bars || 4
    // Entry #117: Add compositionCount to temporal variation
    // This ensures different progressions are selected across compositions
    const temporalOffset = ((compositionCount * PHI) % 1) * 0.4
    const contextVariation = ((safeBars * PHI) % 1) * 0.2
    const combinedIndex = safeComplexity * 0.5 + contextVariation + temporalOffset
    const index = Math.min(
      Math.floor(combinedIndex * progressions.length),
      progressions.length - 1
    )
    return progressions[index]
  }

  /**
   * Get key offset from C (base key) to current key
   * Entry #117: Used for transposing progressions to current key
   * @returns {number} Semitone offset (0-11)
   */
  _getKeyOffset() {
    const keyMap = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    }
    return keyMap[this.currentKey] || 0
  }

  /**
   * Transpose chord notes to current key
   * Entry #117: Ensures progressions are in the correct key
   * @param {Array} progression - Chord progression with notes arrays
   * @returns {Array} Transposed progression
   */
  _transposeToCurrentKey(progression) {
    const offset = this._getKeyOffset()
    if (offset === 0) return progression // Already in C

    return progression.map(chord => ({
      ...chord,
      root: (chord.root + offset) % 12,
      notes: chord.notes.map(note => note + offset)
    }))
  }

  /**
   * Convert quality name to chord suffix for display
   * @param {string} quality - Chord quality (major, minor, minor7, etc.)
   * @returns {string} Chord suffix
   */
  _getQualitySuffix(quality) {
    const suffixMap = {
      'major': '',
      'minor': 'm',
      'minor7': 'm7',
      'major7': 'maj7',
      'dominant7': '7',
      'diminished': 'dim',
      'augmented': 'aug',
      'sus2': 'sus2',
      'sus4': 'sus4',
      'add9': 'add9',
      'minor9': 'm9',
      'major9': 'maj9',
      'dominant9': '9',
      'suspended2': 'sus2',
      'suspended4': 'sus4'
    }
    return suffixMap[quality] || ''
  }

  /**
   * Generate harmonic progression based on style analysis
   * Entry #117: Added compositionCount for temporal variation
   * @param {Object} styleAnalysis - Style analysis with genreWeights and harmonicComplexity
   * @param {number} phraseLength - Length in bars
   * @param {number} compositionCount - Composition counter for variation
   * @returns {Array} Chord progression
   */
  generateProgression(styleAnalysis, phraseLength, compositionCount = 0) {
    const { genreWeights, harmonicComplexity } = styleAnalysis
    // Extract complexity value (0-1), default to 0.5
    const complexity = harmonicComplexity?.modalFlavor === 'minor' ? 0.6 :
                       harmonicComplexity?.modalFlavor === 'major' ? 0.4 :
                       typeof harmonicComplexity === 'number' ? harmonicComplexity : 0.5

    // Entry #161: Vary key based on compositionCount using circle of fifths
    // SLOWED DOWN: Only change key ~8% of the time (keySelector > 0.92)
    // This gives ~2-3 minutes between key changes (~50 keyChanges/day target)
    const circleOfFifths = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']
    const keySelector = (compositionCount * PHI) % 1
    if (keySelector > 0.92) {
      // Move by fifths (more musical than random jumps)
      const currentKeyIndex = circleOfFifths.indexOf(this.currentKey)
      const direction = keySelector > 0.96 ? 1 : -1 // Up or down the circle
      const newKeyIndex = (currentKeyIndex + direction + 12) % 12
      this.currentKey = circleOfFifths[newKeyIndex]
    }
    // If key not in circle (shouldn't happen), default to C
    if (!circleOfFifths.includes(this.currentKey)) {
      this.currentKey = 'C'
    }

    // Entry #161: Expanded mode selection - all 7 church modes
    // Changed from 70% ionian bias to uniform distribution
    const modes = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian']
    const modeSelector = ((compositionCount * PHI * 2) % 1)
    // Change mode ~25% of the time (was 30% but now with more modes)
    if (modeSelector > 0.75) {
      const modeIndex = Math.floor(modeSelector * modes.length * 4) % modes.length
      this.currentMode = modes[modeIndex]
    }
    // Keep current mode if not changing (no default to ionian)

    // Select progression type based on dominant genre, passing complexity and compositionCount
    let progression
    if (genreWeights.jazz > 0.7) {
      progression = this.generateJazzProgression(phraseLength, complexity, compositionCount)
    } else if (genreWeights.classical > 0.7) {
      progression = this.generateClassicalProgression(phraseLength, complexity, compositionCount)
    } else if (genreWeights.electronic > 0.7) {
      progression = this.generateElectronicProgression(phraseLength, complexity, compositionCount)
    } else if (genreWeights.rock > 0.7) {
      progression = this.generateRockProgression(phraseLength, complexity, compositionCount)
    } else {
      progression = this.generatePopProgression(phraseLength, complexity, compositionCount)
    }

    // Update currentChord with the first chord of the progression (using transposed root)
    if (progression && progression.length > 0) {
      const firstChord = progression[0]
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
      const rootName = noteNames[firstChord.root % 12]
      const qualitySuffix = this._getQualitySuffix(firstChord.quality)
      this.currentChord = rootName + qualitySuffix

      // Entry #161: Populate progressionHistory for monitoring
      this.progressionHistory.push({
        key: this.currentKey,
        mode: this.currentMode,
        chord: this.currentChord,
        timestamp: Date.now(),
        compositionCount
      })
      // Keep history manageable (last 100 progressions)
      if (this.progressionHistory.length > 100) {
        this.progressionHistory.shift()
      }
    }

    return progression
  }

  generateJazzProgression(bars, complexity = 0.5, compositionCount = 0) {
    // Jazz progressions ordered by complexity (simple → complex)
    const progressions = [
      // Simple: Classic ii-V-I progression (complexity ~0.3)
      [
        { chord: 'Dm7', function: 'subdominant', bars: 1, extension: 'ii7' },
        { chord: 'G7', function: 'dominant', bars: 1, extension: 'V7' },
        { chord: 'Cmaj7', function: 'tonic', bars: 2, extension: 'Imaj7' }
      ],
      // Medium: Minor blues progression (complexity ~0.5)
      [
        { chord: 'Cm7', function: 'tonic', bars: 1, extension: 'Im7' },
        { chord: 'Fm7', function: 'subdominant', bars: 1, extension: 'IVm7' },
        { chord: 'Cm7', function: 'tonic', bars: 1, extension: 'Im7' },
        { chord: 'Cm7', function: 'tonic', bars: 1, extension: 'Im7' }
      ],
      // Complex: Jazz turnaround with vi (complexity ~0.8)
      [
        { chord: 'Imaj7', function: 'tonic', bars: 1, extension: 'Imaj7' },
        { chord: 'VI7', function: 'subdominant', bars: 1, extension: 'VI7' },
        { chord: 'ii7', function: 'subdominant', bars: 1, extension: 'ii7' },
        { chord: 'V7', function: 'dominant', bars: 1, extension: 'V7' }
      ]
    ]

    const selected = this._selectProgressionByComplexity(progressions, complexity, bars, compositionCount)

    // Entry #117: Transpose to current key
    return this._transposeToCurrentKey(selected.map(chord => ({
      ...chord,
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord),
      notes: this.buildChord(chord.chord)
    })))
  }

  generateClassicalProgression(bars, complexity = 0.5, compositionCount = 0) {
    // Classical progressions ordered by complexity (simple → complex)
    const progressions = [
      // Simple: Plagal cadence (complexity ~0.2)
      [
        { chord: 'IV', function: 'subdominant', bars: 2 },
        { chord: 'I', function: 'tonic', bars: 2 }
      ],
      // Medium: Perfect authentic cadence preparation (complexity ~0.5)
      [
        { chord: 'IV', function: 'subdominant', bars: 1 },
        { chord: 'V', function: 'dominant', bars: 1 },
        { chord: 'I', function: 'tonic', bars: 2 }
      ],
      // Complex: Deceptive cadence followed by authentic (complexity ~0.8)
      [
        { chord: 'V', function: 'dominant', bars: 1 },
        { chord: 'vi', function: 'tonic', bars: 1 },
        { chord: 'IV', function: 'subdominant', bars: 1 },
        { chord: 'V', function: 'dominant', bars: 1 }
      ]
    ]

    const selected = this._selectProgressionByComplexity(progressions, complexity, bars, compositionCount)

    // Entry #117: Transpose to current key
    return this._transposeToCurrentKey(selected.map(chord => ({
      ...chord,
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord),
      notes: this.buildChord(chord.chord)
    })))
  }

  generateElectronicProgression(bars, complexity = 0.5, compositionCount = 0) {
    // Electronic progressions ordered by complexity (simple → complex)
    const progressions = [
      // Simple: Ambient pads - single chord (complexity ~0.2)
      [
        { chord: 'Cmaj7', function: 'tonic', bars: 4 }
      ],
      // Medium: Basic house progression (complexity ~0.5)
      [
        { chord: 'Cm', function: 'tonic', bars: 2 },
        { chord: 'Ab', function: 'subdominant', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 }
      ],
      // Complex: Techno minor progression (complexity ~0.8)
      [
        { chord: 'Am', function: 'tonic', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 1 },
        { chord: 'E', function: 'dominant', bars: 1 }
      ]
    ]

    const selected = this._selectProgressionByComplexity(progressions, complexity, bars, compositionCount)

    // Entry #117: Transpose to current key
    return this._transposeToCurrentKey(selected.map(chord => ({
      ...chord,
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord),
      notes: this.buildChord(chord.chord)
    })))
  }

  generateRockProgression(bars, complexity = 0.5, compositionCount = 0) {
    // Rock progressions ordered by complexity (simple → complex)
    const progressions = [
      // Simple: Power chord progression (complexity ~0.2)
      [
        { chord: 'E5', function: 'tonic', bars: 2 },
        { chord: 'A5', function: 'subdominant', bars: 1 },
        { chord: 'B5', function: 'dominant', bars: 1 }
      ],
      // Medium: Classic rock progression (complexity ~0.5)
      [
        { chord: 'G', function: 'tonic', bars: 1 },
        { chord: 'C', function: 'subdominant', bars: 1 },
        { chord: 'D', function: 'dominant', bars: 1 },
        { chord: 'G', function: 'tonic', bars: 1 }
      ],
      // Complex: 12-bar blues variation (complexity ~0.8)
      [
        { chord: 'I7', function: 'tonic', bars: 1 },
        { chord: 'IV7', function: 'subdominant', bars: 1 },
        { chord: 'I7', function: 'tonic', bars: 2 }
      ]
    ]

    const selected = this._selectProgressionByComplexity(progressions, complexity, bars, compositionCount)

    // Entry #117: Transpose to current key
    return this._transposeToCurrentKey(selected.map(chord => ({
      ...chord,
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord),
      notes: this.buildChord(chord.chord)
    })))
  }

  generatePopProgression(bars, complexity = 0.5, compositionCount = 0) {
    // Pop progressions ordered by complexity (simple → complex)
    const progressions = [
      // Simple: Vieni-qua progression (complexity ~0.2)
      [
        { chord: 'C', function: 'tonic', bars: 2 },
        { chord: 'G', function: 'dominant', bars: 1 },
        { chord: 'Am', function: 'tonic', bars: 1 }
      ],
      // Medium: 50s progression (complexity ~0.5)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'Am', function: 'tonic', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 }
      ],
      // Complex: Classic I-V-vi-IV (complexity ~0.8)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 },
        { chord: 'Am', function: 'tonic', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 1 }
      ]
    ]

    const selected = this._selectProgressionByComplexity(progressions, complexity, bars, compositionCount)

    // Entry #117: Transpose to current key
    return this._transposeToCurrentKey(selected.map(chord => ({
      ...chord,
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord),
      notes: this.buildChord(chord.chord)
    })))
  }

  harmonizeMelody(melody, progression) {
    // Harmonize a melody with the given progression
    const harmonized = []
    let previousVoicing = null

    melody.forEach((note, i) => {
      const chord = this.getChordAtBeat(progression, i)
      const voicing = this.voiceLeadToChord(note.pitch, chord, previousVoicing)
      previousVoicing = voicing

      harmonized.push({
        melodyNote: note,
        harmony: voicing,
        chordFunction: chord.function
      })
    })

    return harmonized
  }

  voiceLeadToChord(melodyNote, targetChord, previousVoicing) {
    // Voice leading: move voices by minimal intervals
    const chordNotes = this.buildChord(targetChord.chord)
    let voicedChord = []

    if (previousVoicing) {
      // Find closest voicing to previous
      voicedChord = chordNotes.map((note, index) => {
        const prevNote = previousVoicing[index] || note
        const difference = note - prevNote

        // Keep within one octave if possible
        if (Math.abs(difference) > 6) {
          const octaves = Math.round(difference / 12)
          return note - (octaves * 12)
        }

        return note
      })
    } else {
      // Default voicing in closest position to melody
      voicedChord = chordNotes.map(note => {
        while (note < melodyNote - 12) note += 12
        while (note > melodyNote + 12) note -= 12
        return note
      })
    }

    return voicedChord.sort((a, b) => a - b)
  }

  modulateTo(newKey, technique = 'pivot') {
    const oldKey = this.currentKey

    switch (technique) {
      case 'pivot':
        return this.modulateByPivotChord(oldKey, newKey)
      case 'direct':
        return this.modulateDirectly(oldKey, newKey)
      case 'common_tone':
        return this.modulateByCommonTone(oldKey, newKey)
      case 'sequential':
        return this.modulateSequentially(oldKey, newKey)
      default:
        return this.modulateByPivotChord(oldKey, newKey)
    }
  }

  modulateByPivotChord(oldKey, newKey) {
    // Find a chord that works in both keys
    const oldScale = this.scales[this.currentMode]
    const newScale = this.scales[this.currentMode]

    // For simplicity, use the dominant of the old key that becomes
    // the subdominant of the new key (circle of fifths)
    const oldDominant = this.getScaleDegree(oldScale, 5) // V degree
    const newSubdominant = this.getScaleDegree(newScale, 4) // IV degree

    // Update current key AFTER building the return object
    const result = {
      type: 'pivot_chord',
      chord: this.buildChordFromRoot(oldDominant, 'dominant7'),
      function: 'pivot',
      oldKey,
      newKey
    }

    this.currentKey = newKey
    return result
  }

  modulateDirectly(oldKey, newKey) {
    // Direct modulation for dramatic effect
    this.currentKey = newKey

    return {
      type: 'direct',
      chord: this.buildChordFromRoot(this.getTonicNote(newKey), 'major'),
      function: 'tonic',
      oldKey,
      newKey
    }
  }

  modulateByCommonTone(oldKey, newKey) {
    // Modulation using a common tone between keys
    const oldTonic = this.getTonicNote(oldKey)
    const commonTone = oldTonic // Simplified: use old tonic as common tone

    const result = {
      type: 'common_tone',
      commonTone,
      chord: this.buildChordFromRoot(this.getTonicNote(newKey), 'major'),
      function: 'tonic',
      oldKey,
      newKey
    }

    this.currentKey = newKey
    return result
  }

  modulateSequentially(oldKey, newKey) {
    // Sequential modulation - repeat a pattern in the new key
    const pattern = ['I', 'IV', 'V', 'I'] // Simple pattern

    const result = {
      type: 'sequential',
      pattern: pattern.map(roman => this.romanToChord(roman, newKey)),
      oldKey,
      newKey
    }

    this.currentKey = newKey
    return result
  }

  addCadence(type = 'authentic') {
    // Add cadential patterns for musical punctuation
    const cadences = {
      authentic: [
        { chord: 'G7', function: 'dominant', type: 'V7' },
        { chord: 'C', function: 'tonic', type: 'I' }
      ],
      plagal: [
        { chord: 'F', function: 'subdominant', type: 'IV' },
        { chord: 'C', function: 'tonic', type: 'I' }
      ],
      deceptive: [
        { chord: 'G7', function: 'dominant', type: 'V7' },
        { chord: 'Am', function: 'tonic', type: 'vi' }
      ],
      half: [
        { chord: 'Dm', function: 'subdominant', type: 'ii' },
        { chord: 'G7', function: 'dominant', type: 'V7' }
      ]
    }

    const cadence = cadences[type] || cadences.authentic
    return cadence.map(chord => ({
      ...chord,
      notes: this.buildChord(chord.chord),
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord)
    }))
  }

  // Helper methods
  getChordAtBeat(progression, beat) {
    const totalBars = progression.reduce((sum, chord) => sum + chord.bars, 0)
    const beatsPerBar = 4
    const totalBeats = totalBars * beatsPerBar
    const normalizedBeat = beat % totalBeats

    let currentBeat = 0
    for (const chord of progression) {
      const chordBeats = chord.bars * beatsPerBar
      if (normalizedBeat >= currentBeat && normalizedBeat < currentBeat + chordBeats) {
        return chord
      }
      currentBeat += chordBeats
    }

    return progression[progression.length - 1] // Default to last chord
  }

  buildChord(chordSymbol) {
    const root = this.getChordRoot(chordSymbol)
    const quality = this.getChordQuality(chordSymbol)
    const intervals = this.chordQualities[quality] || this.chordQualities.major

    return intervals.map(interval => root + interval)
  }

  buildChordFromRoot(root, quality) {
    const intervals = this.chordQualities[quality] || this.chordQualities.major
    return intervals.map(interval => root + interval)
  }

  getChordRoot(chordSymbol) {
    // Extract root note from chord symbol
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const noteNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

    for (let i = 0; i < noteNames.length; i++) {
      if (chordSymbol.startsWith(noteNames[i])) {
        return noteNumbers[i]
      }
    }

    return 0 // Default to C
  }

  getChordQuality(chordSymbol) {
    // Extract chord quality from chord symbol
    if (chordSymbol.includes('maj7')) return 'major7'
    if (chordSymbol.includes('m7')) return 'minor7'
    if (chordSymbol.includes('7')) return 'dominant7'
    if (chordSymbol.includes('m')) return 'minor'
    if (chordSymbol.includes('aug')) return 'augmented'
    if (chordSymbol.includes('dim')) return 'diminished'
    if (chordSymbol.includes('sus2')) return 'suspended2'
    if (chordSymbol.includes('sus4') || chordSymbol.includes('sus')) return 'suspended4'

    return 'major' // Default
  }

  getTonicNote(key) {
    // Convert key name to MIDI note number
    const noteMap = {
      'C': 60, 'C#': 61, 'D': 62, 'D#': 63, 'E': 64, 'F': 65,
      'F#': 66, 'G': 67, 'G#': 68, 'A': 69, 'A#': 70, 'B': 71
    }

    return noteMap[key] || 60 // Default to Middle C
  }

  getScaleDegree(scale, degree) {
    // Get the scale degree (1-based)
    return scale[(degree - 1) % scale.length]
  }

  romanToChord(roman, key) {
    const romanNumerals = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7 }
    const degree = romanNumerals[roman.toUpperCase()]
    const scale = this.scales[this.currentMode]
    const rootNote = this.getScaleDegree(scale, degree)
    const tonic = this.getTonicNote(key)

    return {
      chord: this.buildChordFromRoot(tonic + rootNote, 'major'),
      root: tonic + rootNote,
      quality: 'major'
    }
  }

  /**
   * Constrain MIDI pitch to current scale
   * Snaps any pitch to the nearest note in the current key and mode
   */
  constrainToScale(pitch, key = null, mode = null) {
    const useKey = key || this.currentKey
    const useMode = mode || this.currentMode

    // Get scale intervals
    const scaleIntervals = this.scales[useMode] || this.scales.ionian

    // Get tonic note
    const tonic = this.getTonicNote(useKey)

    // Calculate pitch class (0-11) and octave
    const pitchClass = pitch % 12
    const octave = Math.floor(pitch / 12)

    // Find nearest scale degree
    let nearestDistance = 12
    let nearestScaleDegree = 0

    scaleIntervals.forEach(interval => {
      const scalePitchClass = (tonic + interval) % 12
      const distance = Math.abs(pitchClass - scalePitchClass)

      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestScaleDegree = interval
      }
    })

    // Reconstruct pitch in scale
    const constrainedPitchClass = (tonic + nearestScaleDegree) % 12
    const constrainedPitch = octave * 12 + constrainedPitchClass

    return constrainedPitch
  }

  /**
   * Get current scale as array of MIDI pitches in one octave
   */
  getCurrentScale(key = null, mode = null) {
    const useKey = key || this.currentKey
    const useMode = mode || this.currentMode

    const tonic = this.getTonicNote(useKey)
    const scaleIntervals = this.scales[useMode] || this.scales.ionian

    return scaleIntervals.map(interval => tonic + interval)
  }
}

module.exports = HarmonicEngine