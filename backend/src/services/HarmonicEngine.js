const { PHI } = require('../utils/constants')

class HarmonicEngine {
  constructor() {
    // Entry #162: Default key/mode - will be overridden by initializeKeyFromMetrics()
    // when WebMetricsPoller data becomes available
    this.currentKey = 'C'
    this.currentMode = 'ionian'
    this.keyInitialized = false
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
   * Select progression by complexity with web metrics-driven variation
   * Entry #171: Web metrics add deterministic variety without randomness
   * @param {Array} progressions - Array of progression options
   * @param {number} complexity - 0-1 complexity value
   * @param {number} bars - Number of bars for context variation
   * @param {number} compositionCount - Composition counter for temporal variation
   * @param {Object} webMetrics - Optional web metrics for deterministic variation
   * @returns {Array} Selected progression
   */
  _selectProgressionByComplexity(progressions, complexity, bars, compositionCount = 0, webMetrics = null) {
    const safeComplexity = complexity || 0.5
    const safeBars = bars || 4

    // Base: complexity determines primary selection range (38%)
    // Entry #171: Weights sum to 0.95 max (0.38 + 0.38 + 0.19) to prevent edge case
    const complexityWeight = safeComplexity * 0.38

    // Web metrics add deterministic variation (38%)
    let metricsOffset = 0
    if (webMetrics) {
      const wiki = webMetrics.wikipedia?.normalized || 0.5
      const hn = webMetrics.hackernews?.normalized || 0.5
      const gh = webMetrics.github?.normalized || 0.5

      // Entry #171: PHI power scaling normalizes different metric ranges
      // Wikipedia: high volume (50 edits/min max) → PHI^1 = 1.618
      // HackerNews: medium volume (5 posts/min max) → PHI^2 = 2.618
      // GitHub: variable volume (30 commits/min max) → PHI^3 = 4.236
      // The powers compensate for different activity scales, creating equal musical influence
      // Modulo 1 wraps to [0,1], then scaled to 38% of index range
      metricsOffset = ((wiki * PHI + hn * PHI * PHI + gh * PHI * PHI * PHI) % 1) * 0.38
    }

    // Temporal drift from composition count (19%) - preserves determinism
    const temporalOffset = ((compositionCount * PHI) % 1) * 0.19

    const combinedIndex = complexityWeight + metricsOffset + temporalOffset
    const index = Math.min(
      Math.floor(combinedIndex * progressions.length),
      progressions.length - 1
    )
    return progressions[index]
  }

  /**
   * Entry #171: Transpose key by semitones
   * @param {string} key - Current key name
   * @param {number} semitones - Semitones to transpose (positive or negative)
   * @returns {string} New key name
   */
  _transposeKey(key, semitones) {
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const keyMap = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    }
    const currentIndex = keyMap[key] ?? 0
    const newIndex = ((currentIndex + semitones) % 12 + 12) % 12
    return keys[newIndex]
  }

  /**
   * Entry #171: Get relative major/minor key
   * @param {string} key - Current key name
   * @param {string} mode - Current mode
   * @returns {string} Relative key name
   */
  _getRelativeKey(key, mode) {
    // Minor modes → relative major (+3 semitones)
    // Major modes → relative minor (-3 semitones)
    const minorModes = ['aeolian', 'dorian', 'phrygian', 'locrian']
    const semitones = minorModes.includes(mode) ? 3 : -3
    return this._transposeKey(key, semitones)
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
   * Entry #171: Web metrics drive key/mode selection for deterministic variety
   * @param {Object} styleAnalysis - Style analysis with genreWeights and harmonicComplexity
   * @param {number} phraseLength - Length in bars
   * @param {number} compositionCount - Composition counter for variation
   * @param {Object} sectionContext - Optional SectionContext for section-aware generation
   * @param {Object} webMetrics - Optional web metrics for deterministic variation
   * @param {number} tensionLevel - Optional tension level (0-1) for harmonic complexity control
   * @returns {Array} Chord progression
   */
  generateProgression(styleAnalysis, phraseLength, compositionCount = 0, sectionContext = null, webMetrics = null, tensionLevel = 0.5) {
    // If we have a SectionContext, use tension-aware generation
    if (sectionContext) {
      return this.generateProgressionForSection(styleAnalysis, phraseLength, compositionCount, sectionContext, webMetrics, tensionLevel)
    }

    const { genreWeights, harmonicComplexity } = styleAnalysis
    // Extract complexity value (0-1), default to 0.5
    // Entry #NEW: Incorporate tensionLevel into complexity calculation
    const baseComplexity = harmonicComplexity?.modalFlavor === 'minor' ? 0.6 :
                           harmonicComplexity?.modalFlavor === 'major' ? 0.4 :
                           typeof harmonicComplexity === 'number' ? harmonicComplexity : 0.5
    // Tension adds up to 0.3 complexity (high tension = more complex harmonies)
    const complexity = Math.min(1, baseComplexity + (tensionLevel - 0.5) * 0.6)

    // Entry #171: Extract web metrics for key/mode selection
    const wiki = webMetrics?.wikipedia?.normalized || 0.5
    const hn = webMetrics?.hackernews?.normalized || 0.5
    const gh = webMetrics?.github?.normalized || 0.5
    const combinedActivity = (wiki + hn + gh) / 3

    // Entry #171: Dynamic key threshold based on web metrics
    // High activity → lower threshold → more key changes
    // Range: 0.70 (high activity) to 0.92 (low activity)
    const keyThreshold = 0.92 - (combinedActivity * 0.22)
    const keySelector = (compositionCount * PHI) % 1

    if (keySelector > keyThreshold) {
      // Entry #171: Modulation type based on metric dominance
      const wikiDominance = wiki / (wiki + hn + gh + 0.001)
      const hnDominance = hn / (wiki + hn + gh + 0.001)
      const ghDominance = gh / (wiki + hn + gh + 0.001)

      if (wikiDominance > 0.4) {
        // Wikipedia dominant → mediant modulation (±4 semitones)
        const direction = (compositionCount % 2 === 0) ? 4 : -4
        this.currentKey = this._transposeKey(this.currentKey, direction)
      } else if (ghDominance > 0.4) {
        // GitHub dominant → whole step modulation (±2 semitones)
        // Entry #171: Changed from ±1 (too jarring) to ±2 for smoother transition
        const direction = wiki > hn ? 2 : -2
        this.currentKey = this._transposeKey(this.currentKey, direction)
      } else if (hnDominance > 0.4) {
        // HackerNews dominant → Circle of Fifths (±7 semitones)
        const direction = gh > wiki ? 7 : -7
        this.currentKey = this._transposeKey(this.currentKey, direction)
      } else {
        // No dominance → relative key modulation
        this.currentKey = this._getRelativeKey(this.currentKey, this.currentMode)
      }
    }

    // Entry #171: Mode selection based on brightness from combined metrics
    // Modes ordered by brightness: locrian (dark) → lydian (bright)
    const modesByBrightness = ['locrian', 'phrygian', 'aeolian', 'dorian', 'mixolydian', 'ionian', 'lydian']
    const modeSelector = ((compositionCount * PHI * 2) % 1)

    // Dynamic mode threshold: high activity → more mode changes
    const modeThreshold = 0.80 - (combinedActivity * 0.20) // Range: 0.60-0.80

    if (modeSelector > modeThreshold) {
      // Brightness based on weighted metrics combination
      const brightnessFactor = (wiki * 0.5 + hn * 0.3 + gh * 0.2)
      const modeIndex = Math.floor(brightnessFactor * modesByBrightness.length)
      this.currentMode = modesByBrightness[Math.min(modeIndex, modesByBrightness.length - 1)]
    }

    // Select progression type based on dominant genre, passing webMetrics for selection
    // Entry #178: Threshold lowered from 0.35 to 0.20 for better genre activation
    let progression
    if (genreWeights.jazz > 0.20) {
      progression = this.generateJazzProgression(phraseLength, complexity, compositionCount, webMetrics)
    } else if (genreWeights.classical > 0.20) {
      progression = this.generateClassicalProgression(phraseLength, complexity, compositionCount, webMetrics)
    } else if (genreWeights.electronic > 0.20) {
      progression = this.generateElectronicProgression(phraseLength, complexity, compositionCount, webMetrics)
    } else if (genreWeights.rock > 0.20) {
      progression = this.generateRockProgression(phraseLength, complexity, compositionCount, webMetrics)
    } else {
      progression = this.generatePopProgression(phraseLength, complexity, compositionCount, webMetrics)
    }

    // Update currentChord with the first chord of the progression (using transposed root)
    if (progression && progression.length > 0) {
      const firstChord = progression[0]
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
      const rootName = noteNames[firstChord.root % 12]
      const qualitySuffix = this._getQualitySuffix(firstChord.quality)
      this.currentChord = rootName + qualitySuffix

      // Entry #171: Enhanced progressionHistory with web metrics info
      this.progressionHistory.push({
        key: this.currentKey,
        mode: this.currentMode,
        chord: this.currentChord,
        timestamp: Date.now(),
        compositionCount,
        webMetrics: webMetrics ? { wiki, hn, gh, combined: combinedActivity } : null
      })
      // Keep history manageable (last 100 progressions)
      if (this.progressionHistory.length > 100) {
        this.progressionHistory.shift()
      }
    }

    return progression
  }

  /**
   * Generate harmonic progression with section-aware tension and harmonic function
   * Entry #169: Section-aware progression generation
   * Entry #171: Added webMetrics for deterministic variation
   * @param {Object} styleAnalysis - Style analysis with genreWeights
   * @param {number} phraseLength - Length in bars
   * @param {number} compositionCount - Composition counter
   * @param {Object} sectionContext - SectionContext with tension and harmonic function
   * @param {Object} webMetrics - Optional web metrics for variation
   * @param {number} tensionLevel - Optional external tension level from CompositionEngine
   * @returns {Array} Chord progression
   */
  generateProgressionForSection(styleAnalysis, phraseLength, compositionCount, sectionContext, webMetrics = null, tensionLevel = 0.5) {
    const { genreWeights } = styleAnalysis
    const harmonicTension = sectionContext.harmonicTension ?? 0.5
    const harmonicFunction = sectionContext.harmonicFunction || 'tonic'
    const thematicRole = sectionContext.thematicRole || 'exposition'

    // Entry #NEW: Blend section harmonicTension with external tensionLevel
    // External tensionLevel incorporates energy, gestureWeight, and sectionContext
    // Use weighted blend: 60% section context, 40% external tension for section awareness
    const blendedTension = harmonicTension * 0.6 + tensionLevel * 0.4

    // Use blended tension as complexity for progression selection
    const complexity = blendedTension

    // Select key variation based on thematic role
    // Development sections are more likely to modulate
    const circleOfFifths = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']
    const keySelector = (compositionCount * PHI) % 1

    if (thematicRole === 'development' && keySelector > 0.7) {
      // Development: modulate more frequently (30% vs 15%)
      const currentKeyIndex = circleOfFifths.indexOf(this.currentKey)
      const direction = keySelector > 0.85 ? 1 : -1
      // Entry #NEW: Use blended tension for modulation distance
      const distance = blendedTension > 0.6 ? 2 : 1 // Higher tension = further modulation
      const newKeyIndex = (currentKeyIndex + direction * distance + 12) % 12
      this.currentKey = circleOfFifths[newKeyIndex]
    } else if (thematicRole === 'recapitulation' && keySelector > 0.9) {
      // Recapitulation: return to tonic key (rarely modulate)
      // Stay in current key mostly
    } else if (keySelector > 0.85) {
      // Other sections: standard 15% modulation rate
      const currentKeyIndex = circleOfFifths.indexOf(this.currentKey)
      const direction = keySelector > 0.925 ? 1 : -1
      const newKeyIndex = (currentKeyIndex + direction + 12) % 12
      this.currentKey = circleOfFifths[newKeyIndex]
    }

    // Mode selection based on tension and thematic role
    const modes = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian']
    const modeSelector = ((compositionCount * PHI * 2) % 1)

    if (modeSelector > 0.75) {
      // Entry #NEW: Mode changes based on blended tension (section + external)
      if (blendedTension > 0.7) {
        // High tension: prefer darker modes (phrygian, locrian, aeolian)
        const darkModes = ['phrygian', 'locrian', 'aeolian']
        const darkIndex = Math.floor(modeSelector * darkModes.length * 4) % darkModes.length
        this.currentMode = darkModes[darkIndex]
      } else if (blendedTension < 0.3) {
        // Low tension: prefer brighter modes (ionian, lydian, mixolydian)
        const brightModes = ['ionian', 'lydian', 'mixolydian']
        const brightIndex = Math.floor(modeSelector * brightModes.length * 4) % brightModes.length
        this.currentMode = brightModes[brightIndex]
      } else {
        // Medium tension: any mode
        const modeIndex = Math.floor(modeSelector * modes.length * 4) % modes.length
        this.currentMode = modes[modeIndex]
      }
    }

    // Generate genre-specific progression with tension-aware complexity
    // Entry #178: Threshold lowered from 0.35 to 0.20 for better genre activation
    let progression
    if (genreWeights.jazz > 0.20) {
      progression = this.generateJazzProgressionWithTension(phraseLength, complexity, compositionCount, sectionContext, webMetrics)
    } else if (genreWeights.classical > 0.20) {
      progression = this.generateClassicalProgressionWithTension(phraseLength, complexity, compositionCount, sectionContext, webMetrics)
    } else if (genreWeights.electronic > 0.20) {
      progression = this.generateElectronicProgression(phraseLength, complexity, compositionCount, webMetrics)
    } else if (genreWeights.rock > 0.20) {
      progression = this.generateRockProgression(phraseLength, complexity, compositionCount, webMetrics)
    } else {
      progression = this.generatePopProgressionWithTension(phraseLength, complexity, compositionCount, sectionContext, webMetrics)
    }

    // Add appropriate cadence based on thematic role and progress
    const progressPosition = sectionContext.progressionPosition || 0
    if (progressPosition > 0.8) {
      // Near end of section: add cadence
      const cadence = this.selectCadenceForRole(thematicRole, harmonicFunction)
      if (cadence) {
        progression = progression.concat(cadence)
      }
    }

    // Update currentChord with the first chord of the progression
    if (progression && progression.length > 0) {
      const firstChord = progression[0]
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
      const rootName = noteNames[firstChord.root % 12]
      const qualitySuffix = this._getQualitySuffix(firstChord.quality)
      this.currentChord = rootName + qualitySuffix

      this.progressionHistory.push({
        key: this.currentKey,
        mode: this.currentMode,
        chord: this.currentChord,
        timestamp: Date.now(),
        compositionCount,
        harmonicTension,
        thematicRole
      })

      if (this.progressionHistory.length > 100) {
        this.progressionHistory.shift()
      }
    }

    return progression
  }

  /**
   * Select appropriate cadence based on thematic role
   * Entry #169: Role-specific cadence selection
   */
  selectCadenceForRole(thematicRole, harmonicFunction) {
    switch (thematicRole) {
      case 'exposition':
        // Perfect authentic cadence for clear statement
        return this.addCadence('authentic')

      case 'development':
        // Deceptive or half cadence for continuation
        return harmonicFunction === 'dominant'
          ? this.addCadence('deceptive')
          : this.addCadence('half')

      case 'recapitulation':
        // Strong authentic cadence for resolution
        return this.addCadence('authentic')

      case 'transition':
        // Half cadence for forward motion
        return this.addCadence('half')

      case 'coda':
        // Plagal cadence for finality
        return this.addCadence('plagal')

      default:
        return this.addCadence('authentic')
    }
  }

  /**
   * Jazz progression with tension-aware extensions
   * Entry #169
   */
  generateJazzProgressionWithTension(bars, complexity, compositionCount, sectionContext, webMetrics = null) {
    const harmonicTension = sectionContext.harmonicTension ?? 0.5

    // Tension affects chord extensions and alterations
    const progressions = [
      // Low tension: Basic ii-V-I
      [
        { chord: 'Dm7', function: 'subdominant', bars: 1, extension: 'ii7' },
        { chord: 'G7', function: 'dominant', bars: 1, extension: 'V7' },
        { chord: 'Cmaj7', function: 'tonic', bars: 2, extension: 'Imaj7' }
      ],
      // Medium tension: Tritone substitution
      [
        { chord: 'Dm7', function: 'subdominant', bars: 1, extension: 'ii7' },
        { chord: 'Db7', function: 'dominant', bars: 1, extension: 'bII7' }, // Tritone sub
        { chord: 'Cmaj7', function: 'tonic', bars: 2, extension: 'Imaj7' }
      ],
      // High tension: Coltrane changes
      [
        { chord: 'Cmaj7', function: 'tonic', bars: 1, extension: 'Imaj7' },
        { chord: 'Eb7', function: 'dominant', bars: 1, extension: 'bIII7' },
        { chord: 'Abmaj7', function: 'tonic', bars: 1, extension: 'bVImaj7' },
        { chord: 'B7', function: 'dominant', bars: 1, extension: 'bVII7' }
      ],
      // Very high tension: Chromatic descent
      [
        { chord: 'Cm7', function: 'tonic', bars: 1, extension: 'Im7' },
        { chord: 'Bm7', function: 'passing', bars: 1, extension: 'bVIIm7' },
        { chord: 'Bbm7', function: 'passing', bars: 1, extension: 'bVIIm7' },
        { chord: 'Am7', function: 'subdominant', bars: 1, extension: 'VIm7' }
      ]
    ]

    const selected = this._selectProgressionByComplexity(progressions, harmonicTension, bars, compositionCount, webMetrics)

    return this._transposeToCurrentKey(selected.map(chord => ({
      ...chord,
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord),
      notes: this.buildChord(chord.chord)
    })))
  }

  /**
   * Classical progression with tension-aware dissonance
   * Entry #169
   */
  generateClassicalProgressionWithTension(bars, complexity, compositionCount, sectionContext, webMetrics = null) {
    const harmonicTension = sectionContext.harmonicTension ?? 0.5
    const thematicRole = sectionContext.thematicRole || 'exposition'

    // Role affects progression character
    let progressions
    if (thematicRole === 'development') {
      // Development: more unstable progressions
      progressions = [
        // Sequential modulation
        [
          { chord: 'I', function: 'tonic', bars: 1 },
          { chord: 'V/ii', function: 'secondary', bars: 1 },
          { chord: 'ii', function: 'subdominant', bars: 1 },
          { chord: 'V', function: 'dominant', bars: 1 }
        ],
        // Diminished chord sequence
        [
          { chord: 'viidim7', function: 'dominant', bars: 1 },
          { chord: 'I', function: 'tonic', bars: 1 },
          { chord: 'viidim7/V', function: 'secondary', bars: 1 },
          { chord: 'V', function: 'dominant', bars: 1 }
        ]
      ]
    } else if (thematicRole === 'recapitulation') {
      // Recapitulation: return to stability
      progressions = [
        [
          { chord: 'I', function: 'tonic', bars: 2 },
          { chord: 'IV', function: 'subdominant', bars: 1 },
          { chord: 'I', function: 'tonic', bars: 1 }
        ],
        [
          { chord: 'I', function: 'tonic', bars: 1 },
          { chord: 'V', function: 'dominant', bars: 1 },
          { chord: 'I', function: 'tonic', bars: 2 }
        ]
      ]
    } else {
      // Exposition/other: standard progressions with tension variation
      progressions = [
        [
          { chord: 'IV', function: 'subdominant', bars: 2 },
          { chord: 'I', function: 'tonic', bars: 2 }
        ],
        [
          { chord: 'IV', function: 'subdominant', bars: 1 },
          { chord: 'V', function: 'dominant', bars: 1 },
          { chord: 'I', function: 'tonic', bars: 2 }
        ],
        [
          { chord: 'V', function: 'dominant', bars: 1 },
          { chord: 'vi', function: 'tonic', bars: 1 },
          { chord: 'IV', function: 'subdominant', bars: 1 },
          { chord: 'V', function: 'dominant', bars: 1 }
        ]
      ]
    }

    const selected = this._selectProgressionByComplexity(progressions, harmonicTension, bars, compositionCount, webMetrics)

    return this._transposeToCurrentKey(selected.map(chord => ({
      ...chord,
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord),
      notes: this.buildChord(chord.chord)
    })))
  }

  /**
   * Pop progression with tension-aware variation
   * Entry #169
   */
  generatePopProgressionWithTension(bars, complexity, compositionCount, sectionContext, webMetrics = null) {
    const harmonicTension = sectionContext.harmonicTension ?? 0.5
    const thematicRole = sectionContext.thematicRole || 'exposition'

    // Different progressions for different roles
    let progressions
    if (thematicRole === 'development' || harmonicTension > 0.6) {
      // Higher tension progressions
      progressions = [
        // vi-IV-I-V (more movement)
        [
          { chord: 'Am', function: 'tonic', bars: 1 },
          { chord: 'F', function: 'subdominant', bars: 1 },
          { chord: 'C', function: 'tonic', bars: 1 },
          { chord: 'G', function: 'dominant', bars: 1 }
        ],
        // I-iii-IV-iv (minor iv for tension)
        [
          { chord: 'C', function: 'tonic', bars: 1 },
          { chord: 'Em', function: 'mediant', bars: 1 },
          { chord: 'F', function: 'subdominant', bars: 1 },
          { chord: 'Fm', function: 'subdominant', bars: 1 }
        ]
      ]
    } else {
      // Standard pop progressions
      progressions = [
        [
          { chord: 'C', function: 'tonic', bars: 2 },
          { chord: 'G', function: 'dominant', bars: 1 },
          { chord: 'Am', function: 'tonic', bars: 1 }
        ],
        [
          { chord: 'C', function: 'tonic', bars: 1 },
          { chord: 'Am', function: 'tonic', bars: 1 },
          { chord: 'F', function: 'subdominant', bars: 1 },
          { chord: 'G', function: 'dominant', bars: 1 }
        ],
        [
          { chord: 'C', function: 'tonic', bars: 1 },
          { chord: 'G', function: 'dominant', bars: 1 },
          { chord: 'Am', function: 'tonic', bars: 1 },
          { chord: 'F', function: 'subdominant', bars: 1 }
        ]
      ]
    }

    const selected = this._selectProgressionByComplexity(progressions, harmonicTension, bars, compositionCount, webMetrics)

    return this._transposeToCurrentKey(selected.map(chord => ({
      ...chord,
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord),
      notes: this.buildChord(chord.chord)
    })))
  }

  generateJazzProgression(bars, complexity = 0.5, compositionCount = 0, webMetrics = null) {
    // Entry #171: Expanded jazz progressions (12 total) ordered by complexity
    const progressions = [
      // 0.1 - Dorian vamp (modal jazz)
      [
        { chord: 'Dm7', function: 'tonic', bars: 2, extension: 'im7' },
        { chord: 'G7', function: 'dominant', bars: 2, extension: 'IV7' }
      ],
      // 0.2 - Basic ii-V-I
      [
        { chord: 'Dm7', function: 'subdominant', bars: 1, extension: 'ii7' },
        { chord: 'G7', function: 'dominant', bars: 1, extension: 'V7' },
        { chord: 'Cmaj7', function: 'tonic', bars: 2, extension: 'Imaj7' }
      ],
      // 0.25 - Minor ii-V-i
      [
        { chord: 'Dm7', function: 'subdominant', bars: 1, extension: 'iim7b5' },
        { chord: 'G7', function: 'dominant', bars: 1, extension: 'V7b9' },
        { chord: 'Cm7', function: 'tonic', bars: 2, extension: 'im7' }
      ],
      // 0.3 - I-vi-ii-V (Rhythm Changes A section)
      [
        { chord: 'Cmaj7', function: 'tonic', bars: 1, extension: 'Imaj7' },
        { chord: 'Am7', function: 'tonic', bars: 1, extension: 'vim7' },
        { chord: 'Dm7', function: 'subdominant', bars: 1, extension: 'iim7' },
        { chord: 'G7', function: 'dominant', bars: 1, extension: 'V7' }
      ],
      // 0.4 - iii-VI-ii-V (Extended turnaround)
      [
        { chord: 'Em7', function: 'mediant', bars: 1, extension: 'iiim7' },
        { chord: 'A7', function: 'secondary_dominant', bars: 1, extension: 'VI7' },
        { chord: 'Dm7', function: 'subdominant', bars: 1, extension: 'iim7' },
        { chord: 'G7', function: 'dominant', bars: 1, extension: 'V7' }
      ],
      // 0.5 - Minor blues
      [
        { chord: 'Cm7', function: 'tonic', bars: 2, extension: 'im7' },
        { chord: 'Fm7', function: 'subdominant', bars: 1, extension: 'ivm7' },
        { chord: 'G7', function: 'dominant', bars: 1, extension: 'V7' }
      ],
      // 0.55 - Backdoor ii-V
      [
        { chord: 'Fm7', function: 'subdominant', bars: 1, extension: 'ivm7' },
        { chord: 'Bb7', function: 'backdoor_dominant', bars: 1, extension: 'bVII7' },
        { chord: 'Cmaj7', function: 'tonic', bars: 2, extension: 'Imaj7' }
      ],
      // 0.6 - Modal interchange (major to minor borrowed)
      [
        { chord: 'Cmaj7', function: 'tonic', bars: 1, extension: 'Imaj7' },
        { chord: 'Ebmaj7', function: 'borrowed', bars: 1, extension: 'bIIImaj7' },
        { chord: 'Abmaj7', function: 'borrowed', bars: 1, extension: 'bVImaj7' },
        { chord: 'Dm7', function: 'subdominant', bars: 1, extension: 'iim7' }
      ],
      // 0.7 - Tritone substitution
      [
        { chord: 'Dm7', function: 'subdominant', bars: 1, extension: 'iim7' },
        { chord: 'Db7', function: 'tritone_sub', bars: 1, extension: 'bII7' },
        { chord: 'Cmaj7', function: 'tonic', bars: 2, extension: 'Imaj7' }
      ],
      // 0.8 - Coltrane changes (Giant Steps fragment)
      [
        { chord: 'Cmaj7', function: 'tonic', bars: 1, extension: 'Imaj7' },
        { chord: 'Eb7', function: 'secondary_dominant', bars: 1, extension: 'bIII7' },
        { chord: 'Abmaj7', function: 'tonic', bars: 1, extension: 'bVImaj7' },
        { chord: 'B7', function: 'secondary_dominant', bars: 1, extension: 'VII7' }
      ],
      // 0.85 - Altered dominant chain
      [
        { chord: 'Cmaj7', function: 'tonic', bars: 1, extension: 'Imaj7' },
        { chord: 'A7', function: 'secondary_dominant', bars: 1, extension: 'VI7alt' },
        { chord: 'Dm7', function: 'subdominant', bars: 1, extension: 'iim7' },
        { chord: 'G7', function: 'dominant', bars: 1, extension: 'V7alt' }
      ],
      // 0.95 - Complex bebop turnaround
      [
        { chord: 'Cmaj7', function: 'tonic', bars: 1, extension: 'Imaj7' },
        { chord: 'Bm7', function: 'passing', bars: 1, extension: 'viim7b5' },
        { chord: 'E7', function: 'secondary_dominant', bars: 1, extension: 'III7' },
        { chord: 'Am7', function: 'tonic', bars: 1, extension: 'vim7' }
      ]
    ]

    const selected = this._selectProgressionByComplexity(progressions, complexity, bars, compositionCount, webMetrics)

    // Entry #117: Transpose to current key
    return this._transposeToCurrentKey(selected.map(chord => ({
      ...chord,
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord),
      notes: this.buildChord(chord.chord)
    })))
  }

  generateClassicalProgression(bars, complexity = 0.5, compositionCount = 0, webMetrics = null) {
    // Entry #171: Expanded classical progressions (10 total) ordered by complexity
    const progressions = [
      // 0.1 - Plagal cadence (Amen)
      [
        { chord: 'F', function: 'subdominant', bars: 2 },
        { chord: 'C', function: 'tonic', bars: 2 }
      ],
      // 0.2 - Perfect authentic cadence
      [
        { chord: 'G', function: 'dominant', bars: 2 },
        { chord: 'C', function: 'tonic', bars: 2 }
      ],
      // 0.3 - IV-V-I preparation
      [
        { chord: 'F', function: 'subdominant', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 },
        { chord: 'C', function: 'tonic', bars: 2 }
      ],
      // 0.35 - I-IV-I-V (hymn style)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 1 },
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 }
      ],
      // 0.45 - Deceptive cadence
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 },
        { chord: 'Am', function: 'deceptive', bars: 2 }
      ],
      // 0.5 - Romanesca (descending bass)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 },
        { chord: 'Am', function: 'submediant', bars: 1 },
        { chord: 'E', function: 'dominant', bars: 1 }
      ],
      // 0.6 - Circle of fifths (partial)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 1 },
        { chord: 'Bdim', function: 'leading_tone', bars: 1 },
        { chord: 'Em', function: 'mediant', bars: 1 }
      ],
      // 0.7 - Secondary dominant to vi
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'E7', function: 'secondary_dominant', bars: 1 },
        { chord: 'Am', function: 'submediant', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 }
      ],
      // 0.8 - Neapolitan approach
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'Db', function: 'neapolitan', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 },
        { chord: 'C', function: 'tonic', bars: 1 }
      ],
      // 0.9 - Chromatic mediant relationships
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'E', function: 'chromatic_mediant', bars: 1 },
        { chord: 'Ab', function: 'chromatic_mediant', bars: 1 },
        { chord: 'C', function: 'tonic', bars: 1 }
      ]
    ]

    const selected = this._selectProgressionByComplexity(progressions, complexity, bars, compositionCount, webMetrics)

    // Entry #117: Transpose to current key
    return this._transposeToCurrentKey(selected.map(chord => ({
      ...chord,
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord),
      notes: this.buildChord(chord.chord)
    })))
  }

  generateElectronicProgression(bars, complexity = 0.5, compositionCount = 0, webMetrics = null) {
    // Entry #171: Expanded electronic progressions (10 total) ordered by complexity
    const progressions = [
      // 0.1 - Single chord drone (ambient)
      [
        { chord: 'Cmaj7', function: 'tonic', bars: 4 }
      ],
      // 0.2 - Dorian vamp (house)
      [
        { chord: 'Dm', function: 'tonic', bars: 2 },
        { chord: 'G', function: 'dominant', bars: 2 }
      ],
      // 0.3 - Minor with flat VII (EDM)
      [
        { chord: 'Am', function: 'tonic', bars: 2 },
        { chord: 'G', function: 'subtonic', bars: 2 }
      ],
      // 0.4 - i-bVI-bVII (dark progressive)
      [
        { chord: 'Am', function: 'tonic', bars: 1 },
        { chord: 'F', function: 'submediant', bars: 1 },
        { chord: 'G', function: 'subtonic', bars: 2 }
      ],
      // 0.5 - i-bVI-bIII-bVII (emotional trance)
      [
        { chord: 'Am', function: 'tonic', bars: 1 },
        { chord: 'F', function: 'submediant', bars: 1 },
        { chord: 'C', function: 'mediant', bars: 1 },
        { chord: 'G', function: 'subtonic', bars: 1 }
      ],
      // 0.55 - Phrygian flavor (psytrance)
      [
        { chord: 'Em', function: 'tonic', bars: 2 },
        { chord: 'F', function: 'phrygian_second', bars: 2 }
      ],
      // 0.6 - Parallel minor/major shift
      [
        { chord: 'C', function: 'tonic', bars: 2 },
        { chord: 'Cm', function: 'parallel_minor', bars: 2 }
      ],
      // 0.7 - Lydian float (ambient techno)
      [
        { chord: 'Cmaj7', function: 'tonic', bars: 2 },
        { chord: 'D', function: 'lydian_II', bars: 2 }
      ],
      // 0.8 - Modal interchange chain
      [
        { chord: 'Am', function: 'tonic', bars: 1 },
        { chord: 'Fm', function: 'borrowed', bars: 1 },
        { chord: 'Cmaj7', function: 'tonic', bars: 1 },
        { chord: 'E7', function: 'secondary_dominant', bars: 1 }
      ],
      // 0.9 - Whole tone ambiguity
      [
        { chord: 'Caug', function: 'tonic', bars: 2 },
        { chord: 'Ebaug', function: 'chromatic', bars: 2 }
      ]
    ]

    const selected = this._selectProgressionByComplexity(progressions, complexity, bars, compositionCount, webMetrics)

    // Entry #117: Transpose to current key
    return this._transposeToCurrentKey(selected.map(chord => ({
      ...chord,
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord),
      notes: this.buildChord(chord.chord)
    })))
  }

  generateRockProgression(bars, complexity = 0.5, compositionCount = 0, webMetrics = null) {
    // Entry #171: Expanded rock progressions (10 total) ordered by complexity
    const progressions = [
      // 0.1 - Power chord I-V
      [
        { chord: 'C5', function: 'tonic', bars: 2 },
        { chord: 'G5', function: 'dominant', bars: 2 }
      ],
      // 0.2 - I-IV-V (classic rock)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 2 }
      ],
      // 0.3 - I-bVII-IV (mixolydian rock)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'Bb', function: 'subtonic', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 2 }
      ],
      // 0.4 - i-bVII-bVI-bVII (Andalusian)
      [
        { chord: 'Am', function: 'tonic', bars: 1 },
        { chord: 'G', function: 'subtonic', bars: 1 },
        { chord: 'F', function: 'submediant', bars: 1 },
        { chord: 'G', function: 'subtonic', bars: 1 }
      ],
      // 0.5 - 12-bar blues (compressed)
      [
        { chord: 'C7', function: 'tonic', bars: 1 },
        { chord: 'F7', function: 'subdominant', bars: 1 },
        { chord: 'G7', function: 'dominant', bars: 1 },
        { chord: 'C7', function: 'tonic', bars: 1 }
      ],
      // 0.55 - sus4 resolution (arena rock)
      [
        { chord: 'Csus4', function: 'tonic', bars: 1 },
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'Gsus4', function: 'dominant', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 }
      ],
      // 0.6 - Borrowed iv (Beatles style)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'Fm', function: 'borrowed_iv', bars: 1 },
        { chord: 'C', function: 'tonic', bars: 2 }
      ],
      // 0.7 - Modal rock (Dorian)
      [
        { chord: 'Am', function: 'tonic', bars: 1 },
        { chord: 'D', function: 'dorian_IV', bars: 1 },
        { chord: 'Am', function: 'tonic', bars: 1 },
        { chord: 'G', function: 'subtonic', bars: 1 }
      ],
      // 0.8 - Chromatic descent (prog rock)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'B', function: 'chromatic', bars: 1 },
        { chord: 'Bb', function: 'chromatic', bars: 1 },
        { chord: 'A', function: 'chromatic', bars: 1 }
      ],
      // 0.9 - Tritone movement (heavy metal)
      [
        { chord: 'E5', function: 'tonic', bars: 2 },
        { chord: 'Bb5', function: 'tritone', bars: 2 }
      ]
    ]

    const selected = this._selectProgressionByComplexity(progressions, complexity, bars, compositionCount, webMetrics)

    // Entry #117: Transpose to current key
    return this._transposeToCurrentKey(selected.map(chord => ({
      ...chord,
      root: this.getChordRoot(chord.chord),
      quality: this.getChordQuality(chord.chord),
      notes: this.buildChord(chord.chord)
    })))
  }

  generatePopProgression(bars, complexity = 0.5, compositionCount = 0, webMetrics = null) {
    // Entry #171: Expanded pop progressions (10 total) ordered by complexity
    const progressions = [
      // 0.1 - I-V simple
      [
        { chord: 'C', function: 'tonic', bars: 2 },
        { chord: 'G', function: 'dominant', bars: 2 }
      ],
      // 0.2 - I-IV-V
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 2 }
      ],
      // 0.3 - I-V-vi-IV (Axis progression)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 },
        { chord: 'Am', function: 'submediant', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 1 }
      ],
      // 0.4 - vi-IV-I-V (Emotional pop)
      [
        { chord: 'Am', function: 'submediant', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 1 },
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 }
      ],
      // 0.5 - I-vi-IV-V (50s doo-wop)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'Am', function: 'submediant', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 }
      ],
      // 0.55 - I-iii-IV-iv (minor iv surprise)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'Em', function: 'mediant', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 1 },
        { chord: 'Fm', function: 'borrowed_iv', bars: 1 }
      ],
      // 0.6 - I-V/vi-vi-IV (secondary dominant)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'E7', function: 'secondary_dominant', bars: 1 },
        { chord: 'Am', function: 'submediant', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 1 }
      ],
      // 0.7 - I-bVII-IV (rock-influenced pop)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'Bb', function: 'subtonic', bars: 1 },
        { chord: 'F', function: 'subdominant', bars: 2 }
      ],
      // 0.8 - Chromatic bass line
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'C', function: 'passing', bars: 1 },
        { chord: 'Am', function: 'submediant', bars: 1 },
        { chord: 'Am', function: 'passing', bars: 1 }
      ],
      // 0.9 - Modal mixture (major/minor blend)
      [
        { chord: 'C', function: 'tonic', bars: 1 },
        { chord: 'Cm', function: 'parallel_minor', bars: 1 },
        { chord: 'Ab', function: 'borrowed', bars: 1 },
        { chord: 'G', function: 'dominant', bars: 1 }
      ]
    ]

    const selected = this._selectProgressionByComplexity(progressions, complexity, bars, compositionCount, webMetrics)

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

  /**
   * Entry #162: Initialize starting key/mode from WebMetrics data
   * Uses Wikipedia edits, HackerNews posts, and GitHub commits as seed
   * Called once when first metrics arrive from WebMetricsPoller
   * @param {Object} metrics - Metrics from WebMetricsPoller.getMetrics()
   */
  initializeKeyFromMetrics(metrics) {
    if (this.keyInitialized) return // Only initialize once

    const circleOfFifths = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']
    const modes = ['ionian', 'dorian', 'mixolydian', 'aeolian', 'lydian', 'phrygian', 'locrian']

    // Sum all available metrics for maximum variability
    const wikiEdits = metrics?.wikipedia?.editsPerMinute || 0
    const hnPosts = metrics?.hackernews?.postsPerMinute || 0
    const ghCommits = metrics?.github?.commitsPerMinute || 0
    const totalActivity = wikiEdits + hnPosts * 10 + ghCommits // Weight HN more (fewer posts)

    // Use golden ratio mapping for musical distribution
    const keyIndex = Math.floor((totalActivity * PHI) % 1 * 12)
    this.currentKey = circleOfFifths[keyIndex]

    // Mode based on which source is most active
    const dominantSource = wikiEdits >= hnPosts && wikiEdits >= ghCommits ? 'wikipedia' :
                          hnPosts >= ghCommits ? 'hackernews' : 'github'
    // Wikipedia → ionian/lydian (informational), HN → dorian/mixolydian (discussion), GitHub → aeolian/phrygian (technical)
    const modeBySource = {
      wikipedia: ['ionian', 'lydian'],
      hackernews: ['dorian', 'mixolydian'],
      github: ['aeolian', 'phrygian']
    }
    const sourceModes = modeBySource[dominantSource]
    const modeIndex = Math.floor((totalActivity * PHI * 2) % 1 * sourceModes.length)
    this.currentMode = sourceModes[modeIndex]

    this.keyInitialized = true
    // console.log(`🎹 HarmonicEngine initialized from web metrics: ${this.currentKey} ${this.currentMode} (activity: ${totalActivity})`)
  }
}

module.exports = HarmonicEngine