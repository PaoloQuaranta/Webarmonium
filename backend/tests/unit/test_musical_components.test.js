const assert = require('assert')
const HarmonicEngine = require('../../src/services/HarmonicEngine')
const StyleAnalyzer = require('../../src/services/StyleAnalyzer')
const PhraseMorphology = require('../../src/services/PhraseMorphology')

describe('Musical Components Test Suite', () => {
  let harmonicEngine, styleAnalyzer, phraseMorphology

  beforeEach(() => {
    harmonicEngine = new HarmonicEngine()
    styleAnalyzer = new StyleAnalyzer()
    phraseMorphology = new PhraseMorphology()
  })

  describe('HarmonicEngine', () => {
    it('should generate chord progressions for different genres', () => {
      const jazzStyle = {
        genreWeights: { jazz: 0.8, classical: 0.1, electronic: 0.05, rock: 0.05 }
      }
      const classicalStyle = {
        genreWeights: { classical: 0.8, jazz: 0.1, electronic: 0.05, rock: 0.05 }
      }
      const electronicStyle = {
        genreWeights: { electronic: 0.8, jazz: 0.1, classical: 0.05, rock: 0.05 }
      }

      const jazzProgression = harmonicEngine.generateJazzProgression(4)
      const classicalProgression = harmonicEngine.generateClassicalProgression(4)
      const electronicProgression = harmonicEngine.generateElectronicProgression(4)

      assert(Array.isArray(jazzProgression), 'Jazz progression should be an array')
      assert(jazzProgression.length > 0, 'Jazz progression should not be empty')
      assert(jazzProgression.every(chord => chord.chord && chord.function), 'Jazz chords should have chord symbol and function')

      assert(Array.isArray(classicalProgression), 'Classical progression should be an array')
      assert(classicalProgression.length > 0, 'Classical progression should not be empty')
      assert(classicalProgression.every(chord => chord.chord && chord.function), 'Classical chords should have chord symbol and function')

      assert(Array.isArray(electronicProgression), 'Electronic progression should be an array')
      assert(electronicProgression.length > 0, 'Electronic progression should not be empty')
      assert(electronicProgression.every(chord => chord.chord && chord.function), 'Electronic chords should have chord symbol and function')
    })

    it('should perform voice leading between chords', () => {
      const melody = [{ pitch: 60 }, { pitch: 62 }, { pitch: 64 }]
      const progression = [
        { chord: 'C', function: 'tonic', bars: 2 },
        { chord: 'G', function: 'dominant', bars: 2 }
      ]

      const harmonized = harmonicEngine.harmonizeMelody(melody, progression)

      assert(Array.isArray(harmonized), 'Harmonized melody should be an array')
      assert.strictEqual(harmonized.length, melody.length, 'Should harmonize each melody note')
      assert(harmonized.every(item => item.harmony && item.chordFunction), 'Each note should have harmony and chord function')
    })

    it('should generate different types of cadences', () => {
      const authenticCadence = harmonicEngine.addCadence('authentic')
      const plagalCadence = harmonicEngine.addCadence('plagal')
      const deceptiveCadence = harmonicEngine.addCadence('deceptive')
      const halfCadence = harmonicEngine.addCadence('half')

      assert.strictEqual(authenticCadence.length, 2, 'Authentic cadence should have 2 chords')
      assert.strictEqual(plagalCadence.length, 2, 'Plagal cadence should have 2 chords')
      assert.strictEqual(deceptiveCadence.length, 2, 'Deceptive cadence should have 2 chords')
      assert.strictEqual(halfCadence.length, 2, 'Half cadence should have 2 chords')

      // Check chord functions
      assert.strictEqual(authenticCadence[1].function, 'tonic', 'Authentic cadence should end on tonic')
      assert.strictEqual(plagalCadence[1].function, 'tonic', 'Plagal cadence should end on tonic')
      assert.strictEqual(deceptiveCadence[1].function, 'tonic', 'Deceptive cadence should end on tonic')
      assert.strictEqual(halfCadence[1].function, 'dominant', 'Half cadence should end on dominant')
    })

    it('should handle modulations between keys', () => {
      harmonicEngine.currentKey = 'C' // Reset to known state

      const pivotModulation = harmonicEngine.modulateTo('G', 'pivot')
      assert(pivotModulation.type, 'Pivot modulation should have type')
      assert.strictEqual(pivotModulation.newKey, 'G', 'Pivot modulation should target correct key')
      assert.strictEqual(harmonicEngine.currentKey, 'G', 'Engine should update current key after modulation')

      harmonicEngine.currentKey = 'C' // Reset for next test
      const directModulation = harmonicEngine.modulateTo('F', 'direct')
      assert(directModulation.type, 'Direct modulation should have type')
      assert.strictEqual(directModulation.newKey, 'F', 'Direct modulation should target correct key')

      harmonicEngine.currentKey = 'C' // Reset for next test
      const commonToneModulation = harmonicEngine.modulateTo('D', 'common_tone')
      assert(commonToneModulation.type, 'Common tone modulation should have type')
      assert.strictEqual(commonToneModulation.newKey, 'D', 'Common tone modulation should target correct key')
    })
  })

  describe('StyleAnalyzer', () => {
    it('should analyze energy from gesture velocity and density', () => {
      const highEnergyGestures = [
        { velocity: 90, acceleration: 15 },
        { velocity: 85, acceleration: 12 }
      ]
      const lowEnergyGestures = [
        { velocity: 20, acceleration: 2 },
        { velocity: 25, acceleration: 1 }
      ]

      const highEnergy = styleAnalyzer.calculateEnergy(highEnergyGestures)
      const lowEnergy = styleAnalyzer.calculateEnergy(lowEnergyGestures)

      assert(highEnergy > lowEnergy, 'High energy gestures should produce higher energy score')
      assert(highEnergy >= 0 && highEnergy <= 1, 'Energy score should be normalized between 0 and 1')
      assert(lowEnergy >= 0 && lowEnergy <= 1, 'Energy score should be normalized between 0 and 1')
    })

    it('should estimate tempo from gesture timing', () => {
      const fastGestures = [
        { timestamp: 1000 },
        { timestamp: 1500 },  // 500ms interval = 120 BPM
        { timestamp: 2000 }   // 500ms interval = 120 BPM
      ]
      const slowGestures = [
        { timestamp: 1000 },
        { timestamp: 2000 },  // 1000ms interval = 60 BPM
        { timestamp: 3000 }   // 1000ms interval = 60 BPM
      ]

      const fastTempo = styleAnalyzer.estimateTempo(fastGestures)
      const slowTempo = styleAnalyzer.estimateTempo(slowGestures)

      assert(fastTempo > slowTempo, 'Fast gestures should produce higher tempo')
      assert(fastTempo >= 40 && fastTempo <= 200, 'Tempo should be within reasonable musical range')
      assert(slowTempo >= 40 && slowTempo <= 200, 'Tempo should be within reasonable musical range')
    })

    it('should detect swing and syncopation', () => {
      const swungGestures = [
        { timestamp: 1000, velocity: 50 },
        { timestamp: 1200, velocity: 100 },  // Long beat
        { timestamp: 1300, velocity: 30 },   // Short beat (2:1 ratio)
        { timestamp: 1500, velocity: 80 },
        { timestamp: 1600, velocity: 40 }
      ]

      const swingValue = styleAnalyzer.detectSwing(swungGestures)
      assert(swingValue >= 0 && swingValue <= 1, 'Swing detection should return normalized value')
    })

    it('should analyze melodic intervals from gesture positions', () => {
      const gestureSequence = [
        { position: { y: 0.8 } },  // Low pitch
        { position: { y: 0.6 } },  // Moving up (step)
        { position: { y: 0.3 } },  // Moving up (skip)
        { position: { y: 0.1 } }   // Moving up (leap)
      ]

      const intervalProfile = styleAnalyzer.analyzeIntervals(gestureSequence)

      assert(intervalProfile.step >= 0, 'Step interval count should be non-negative')
      assert(intervalProfile.skip >= 0, 'Skip interval count should be non-negative')
      assert(intervalProfile.leap >= 0, 'Leap interval count should be non-negative')

      const total = intervalProfile.step + intervalProfile.skip + intervalProfile.leap
      assert(Math.abs(total - 1) < 0.1, 'Interval profile should sum to approximately 1')
    })

    it('should detect contour types from gesture trajectories', () => {
      const ascendingGestures = [
        { position: { y: 0.8 } },
        { position: { y: 0.6 } },
        { position: { y: 0.4 } },
        { position: { y: 0.2 } }
      ]

      const descendingGestures = [
        { position: { y: 0.2 } },
        { position: { y: 0.4 } },
        { position: { y: 0.6 } },
        { position: { y: 0.8 } }
      ]

      const archGestures = [
        { position: { y: 0.7 } },
        { position: { y: 0.5 } },
        { position: { y: 0.2 } },
        { position: { y: 0.4 } },
        { position: { y: 0.8 } }
      ]

      const ascendingContour = styleAnalyzer.detectContour(ascendingGestures)
      const descendingContour = styleAnalyzer.detectContour(descendingGestures)
      const archContour = styleAnalyzer.detectContour(archGestures)

      assert.strictEqual(ascendingContour, 'ascending', 'Should detect ascending contour')
      assert.strictEqual(descendingContour, 'descending', 'Should detect descending contour')
      assert(['arch', 'inverted_arch', 'complex', 'neutral'].includes(archContour), `Should detect arch-type contour, got: ${archContour}`)
    })

    it('should calculate genre weights based on analysis', () => {
      const highEnergy = 0.8
      const fastTempo = 140
      const rhythmicChar = { swing: 0.2, syncopation: 0.3, regularity: 0.7 }
      const melodicChar = { intervalProfile: { step: 0.5, skip: 0.3, leap: 0.2 }, contourType: 'arch', range: 12 }
      const harmonicComplex = { chromaticism: 0.1, dissonance: 0.3, modalFlavor: 'major' }

      const genreWeights = styleAnalyzer.calculateGenreWeights(
        highEnergy, fastTempo, rhythmicChar, melodicChar, harmonicComplex
      )

      assert(genreWeights.rock >= 0, 'Rock weight should be non-negative')
      assert(genreWeights.electronic >= 0, 'Electronic weight should be non-negative')
      assert(genreWeights.jazz >= 0, 'Jazz weight should be non-negative')
      assert(genreWeights.classical >= 0, 'Classical weight should be non-negative')
      assert(genreWeights.ambient >= 0, 'Ambient weight should be non-negative')

      const total = Object.values(genreWeights).reduce((sum, weight) => sum + weight, 0)
      assert(Math.abs(total - 1) < 0.01, 'Genre weights should sum to 1')
    })

    it('should sharpen distribution to create clearer genre differentiation', () => {
      // Test the _sharpenDistribution method directly
      const flatWeights = {
        ambient: 0.125, rhythmic: 0.125, melodic: 0.125, experimental: 0.125,
        jazz: 0.125, classical: 0.125, electronic: 0.125, rock: 0.125
      }

      const sharpened = styleAnalyzer._sharpenDistribution(flatWeights, 2.0)

      // Uniform weights should remain uniform after sharpening
      const sharpenedValues = Object.values(sharpened)
      const total = sharpenedValues.reduce((sum, w) => sum + w, 0)
      assert(Math.abs(total - 1) < 0.001, 'Sharpened weights should sum to 1')

      // All values should be equal for uniform input
      const firstValue = sharpenedValues[0]
      sharpenedValues.forEach(v => {
        assert(Math.abs(v - firstValue) < 0.001, 'Uniform input should produce uniform output')
      })
    })

    it('should amplify differences when sharpening non-uniform weights', () => {
      const unevenWeights = {
        ambient: 0.05, rhythmic: 0.10, melodic: 0.12, experimental: 0.03,
        jazz: 0.15, classical: 0.15, electronic: 0.20, rock: 0.20
      }

      const sharpened = styleAnalyzer._sharpenDistribution(unevenWeights, 2.0)

      // Leaders (rock, electronic) should have increased share
      const originalLeaderShare = unevenWeights.rock + unevenWeights.electronic
      const sharpenedLeaderShare = sharpened.rock + sharpened.electronic
      assert(sharpenedLeaderShare > originalLeaderShare,
        `Leaders should gain share after sharpening: ${sharpenedLeaderShare.toFixed(3)} > ${originalLeaderShare.toFixed(3)}`)

      // Weak genres (experimental, ambient) should have decreased share
      const originalWeakShare = unevenWeights.experimental + unevenWeights.ambient
      const sharpenedWeakShare = sharpened.experimental + sharpened.ambient
      assert(sharpenedWeakShare < originalWeakShare,
        `Weak genres should lose share after sharpening: ${sharpenedWeakShare.toFixed(3)} < ${originalWeakShare.toFixed(3)}`)

      // Total should still sum to 1
      const total = Object.values(sharpened).reduce((sum, w) => sum + w, 0)
      assert(Math.abs(total - 1) < 0.001, 'Sharpened weights should sum to 1')
    })

    it('should handle edge case of very small weights without underflow', () => {
      const tinyWeights = {
        ambient: 0.001, rhythmic: 0.001, melodic: 0.001, experimental: 0.001,
        jazz: 0.001, classical: 0.001, electronic: 0.001, rock: 0.993
      }

      const sharpened = styleAnalyzer._sharpenDistribution(tinyWeights, 2.0)

      // Should not produce NaN or Infinity
      Object.values(sharpened).forEach(w => {
        assert(!isNaN(w), 'Sharpened weight should not be NaN')
        assert(isFinite(w), 'Sharpened weight should be finite')
        assert(w >= 0, 'Sharpened weight should be non-negative')
      })

      // Total should sum to 1
      const total = Object.values(sharpened).reduce((sum, w) => sum + w, 0)
      assert(Math.abs(total - 1) < 0.001, 'Sharpened weights should sum to 1')
    })

    it('should produce weights that can trigger genre-specific thresholds', () => {
      // Ambient-like gesture should produce dominant ambient weight
      const ambientWeights = styleAnalyzer.calculateGenreWeights(
        0.15,  // very low energy
        55,    // slow tempo
        { swing: 0.1, syncopation: 0.1, regularity: 0.8 },
        { intervalProfile: { step: 0.7, skip: 0.2, leap: 0.1 }, contourType: 'static', range: 5 },
        { chromaticism: 0.05, dissonance: 0.1, modalFlavor: 'lydian' }
      )

      const sortedWeights = Object.entries(ambientWeights).sort((a, b) => b[1] - a[1])
      const [topGenre, topWeight] = sortedWeights[0]
      const [secondGenre, secondWeight] = sortedWeights[1]

      // Top genre should have meaningful lead over second
      const leadRatio = topWeight / secondWeight
      assert(leadRatio > 1.1, `Top genre should lead by at least 10%: ${topGenre}=${topWeight.toFixed(3)} vs ${secondGenre}=${secondWeight.toFixed(3)}`)

      // With strongly characterized gestures, top weight should be able to reach threshold (0.35)
      // This test documents expected behavior - ambient gestures should produce high ambient weights
      assert(ambientWeights.ambient > 0.25 || ambientWeights.classical > 0.25,
        'Ambient-like gesture should produce dominant ambient or classical weight above 0.25')
    })
  })

  describe('PhraseMorphology', () => {
    it('should generate musical phrases from gesture data', () => {
      const gestureData = {
        velocity: 60,
        trajectory: { angle: 30, direction: 'diagonal' },
        curvature: 0.6,
        acceleration: 5
      }

      const musicalContext = {
        key: 'C',
        mode: 'major',
        tempo: 120,
        currentHarmony: { chord: 'C', function: 'tonic' }
      }

      const phrase = phraseMorphology.generatePhrase(gestureData, musicalContext)

      assert(phrase.notes, 'Phrase should contain notes')
      assert(Array.isArray(phrase.notes), 'Notes should be an array')
      assert(phrase.notes.length > 0, 'Phrase should have at least one note')
      assert(phrase.metadata, 'Phrase should have metadata')

      // Validate note structure
      phrase.notes.forEach(note => {
        assert(typeof note.pitch === 'number', 'Note should have numeric pitch')
        assert(typeof note.duration === 'number', 'Note should have numeric duration')
        assert(typeof note.velocity === 'number', 'Note should have numeric velocity')
        assert(typeof note.articulation === 'string', 'Note should have articulation string')
        assert(note.pitch >= 0 && note.pitch <= 127, 'MIDI pitch should be in valid range')
        assert(note.velocity >= 0 && note.velocity <= 127, 'MIDI velocity should be in valid range')
        assert(note.duration > 0, 'Note duration should be positive')
      })

      // Validate metadata
      assert(phrase.metadata.scale, 'Metadata should contain scale')
      assert(phrase.metadata.key, 'Metadata should contain key')
      assert(typeof phrase.metadata.length === 'number', 'Metadata should contain phrase length')
      assert(typeof phrase.metadata.tempo === 'number', 'Metadata should contain tempo')
    })

    it('should select appropriate scales based on mood', () => {
      const happyGesture = { velocity: 80, curvature: 0.4, acceleration: 0 }
      const sadGesture = { velocity: 25, curvature: 0.3, acceleration: -2 }
      const jazzyGesture = { velocity: 65, curvature: 0.8, acceleration: 3 }

      const happyScale = phraseMorphology.selectScale('major', happyGesture)
      const sadScale = phraseMorphology.selectScale('minor', sadGesture)
      const jazzyScale = phraseMorphology.selectScale('dorian', jazzyGesture)

      assert(Array.isArray(happyScale), 'Happy scale should be an array')
      assert(Array.isArray(sadScale), 'Sad scale should be an array')
      assert(Array.isArray(jazzyScale), 'Jazzy scale should be an array')

      assert(happyScale.length > 0, 'Happy scale should not be empty')
      assert(sadScale.length > 0, 'Sad scale should not be empty')
      assert(jazzyScale.length > 0, 'Jazzy scale should not be empty')
    })

    it('should generate different contour types', () => {
      const ascendingContour = phraseMorphology.createContour('ascending', 8, 0.5)
      const descendingContour = phraseMorphology.createContour('descending', 8, 0.5)
      const archContour = phraseMorphology.createContour('arch', 8, 0.5)
      const waveContour = phraseMorphology.createContour('wave', 8, 0.7)

      console.log('Generated contours:', { ascendingContour, descendingContour, archContour, waveContour })

      assert.strictEqual(ascendingContour.length, 8, 'Ascending contour should have correct length')
      assert.strictEqual(descendingContour.length, 8, 'Descending contour should have correct length')
      assert.strictEqual(archContour.length, 8, 'Arch contour should have correct length')
      assert.strictEqual(waveContour.length, 8, 'Wave contour should have correct length')

      // Check that contours are defined and normalized between 0 and 1
      [ascendingContour, descendingContour, archContour, waveContour].forEach((contour, index) => {
        assert(contour, `Contour ${index} should be defined`)
        assert(Array.isArray(contour), `Contour ${index} should be an array`)
        contour.forEach((val, valIndex) => {
          assert(typeof val === 'number', `Contour ${index}[${valIndex}] should be a number`)
          assert(val >= 0 && val <= 1, `Contour ${index}[${valIndex}] should be normalized between 0 and 1, got: ${val}`)
        })
      })
    })

    it('should apply ornamentation based on gesture character', () => {
      const pitches = [60, 62, 64, 65, 67]
      const rhythm = [1, 1, 1, 1, 1]

      const baroqueGesture = { velocity: 20, curvature: 0.9 }
      const jazzGesture = { velocity: 75, curvature: 0.7 }
      const bluesGesture = { velocity: 85, curvature: 0.4 }

      const baroqueOrnaments = phraseMorphology.applyOrnamentation(pitches, rhythm, baroqueGesture)
      const jazzOrnaments = phraseMorphology.applyOrnamentation(pitches, rhythm, jazzGesture)
      const bluesOrnaments = phraseMorphology.applyOrnamentation(pitches, rhythm, bluesGesture)

      assert(Array.isArray(baroqueOrnaments), 'Baroque ornaments should be an array')
      assert(Array.isArray(jazzOrnaments), 'Jazz ornaments should be an array')
      assert(Array.isArray(bluesOrnaments), 'Blues ornaments should be an array')

      // Ornaments should add or modify notes, not reduce them significantly
      assert(baroqueOrnaments.length >= pitches.length * 0.8, 'Baroque ornaments should not remove too many notes')
      assert(jazzOrnaments.length >= pitches.length * 0.8, 'Jazz ornaments should not remove too many notes')
      assert(bluesOrnaments.length >= pitches.length * 0.8, 'Blues ornaments should not remove too many notes')
    })

    it('should generate appropriate dynamics', () => {
      const crescendoGestures = { acceleration: 10, velocity: [50, 60, 70] }
      const diminuendoGestures = { acceleration: -10, velocity: [80, 60, 40] }
      const stableGestures = { acceleration: 0, velocity: 65 }

      const crescendoDynamics = phraseMorphology.generateDynamics(crescendoGestures.acceleration, crescendoGestures.velocity)
      const diminuendoDynamics = phraseMorphology.generateDynamics(diminuendoGestures.acceleration, diminuendoGestures.velocity)
      const stableDynamics = phraseMorphology.generateDynamics(stableGestures.acceleration, stableGestures.velocity)

      // Check that dynamics are within MIDI velocity range
      [crescendoDynamics, diminuendoDynamics, stableDynamics].forEach(dynamics => {
        dynamics.forEach(velocity => {
          assert(velocity >= 0 && velocity <= 127, 'Dynamics should be within MIDI velocity range')
        })
      })

      // Check crescendo trend
      if (crescendoDynamics.length > 1) {
        assert(crescendoDynamics[crescendoDynamics.length - 1] > crescendoDynamics[0], 'Crescendo should increase in velocity')
      }

      // Check diminuendo trend
      if (diminuendoDynamics.length > 1) {
        assert(diminuendoDynamics[diminuendoDynamics.length - 1] < diminuendoDynamics[0], 'Diminuendo should decrease in velocity')
      }
    })

    it('should provide phrase manipulation utilities', () => {
      const originalPhrase = {
        notes: [
          { pitch: 60, duration: 1, velocity: 80, articulation: 'normal' },
          { pitch: 62, duration: 1, velocity: 80, articulation: 'normal' },
          { pitch: 64, duration: 1, velocity: 80, articulation: 'normal' }
        ],
        metadata: { scale: [0, 2, 4, 5, 7, 9, 11], key: 'C' }
      }

      const transposedPhrase = phraseMorphology.transposePhrase(originalPhrase, 5)
      const invertedPhrase = phraseMorphology.invertPhrase(originalPhrase)
      const retrogradePhrase = phraseMorphology.retrogradePhrase(originalPhrase)

      // Check transposition
      assert.strictEqual(transposedPhrase.notes.length, originalPhrase.notes.length, 'Transposed phrase should have same number of notes')
      transposedPhrase.notes.forEach((note, i) => {
        assert.strictEqual(note.pitch, originalPhrase.notes[i].pitch + 5, 'Transposition should add semitones to all pitches')
      })

      // Check inversion
      assert.strictEqual(invertedPhrase.notes.length, originalPhrase.notes.length, 'Inverted phrase should have same number of notes')

      // Check retrograde
      assert.strictEqual(retrogradePhrase.notes.length, originalPhrase.notes.length, 'Retrograde phrase should have same number of notes')
      assert.strictEqual(retrogradePhrase.notes[0].pitch, originalPhrase.notes[originalPhrase.notes.length - 1].pitch, 'Retrograde should reverse note order')
    })
  })

  describe('Integration Test: Single Gesture to Musical Phrase', () => {
    it('should transform a complete gesture into a coherent musical phrase', () => {
      // Simulate a single complete gesture with all properties
      const gestureData = {
        velocity: 65,
        trajectory: { angle: 45, direction: 'diagonal-up' },
        curvature: 0.7,
        acceleration: 8,
        position: { x: 0.6, y: 0.4 },
        timestamp: Date.now()
      }

      const gestureArray = [gestureData]

      // 1. Analyze gesture style
      const styleAnalysis = styleAnalyzer.analyzeGestureStyle(gestureArray)

      assert(styleAnalysis, 'Style analysis should return a result')
      assert(typeof styleAnalysis.energy === 'number', 'Should have energy value')
      assert(typeof styleAnalysis.tempo === 'number', 'Should have tempo value')
      assert(styleAnalysis.genreWeights, 'Should have genre weights')

      // 2. Generate harmonic progression
      const harmonicProgression = harmonicEngine.generateProgression(styleAnalysis, 4)

      assert(Array.isArray(harmonicProgression), 'Should generate harmonic progression')
      assert(harmonicProgression.length > 0, 'Progression should not be empty')

      // 3. Generate musical phrase
      const musicalContext = {
        key: 'C',
        mode: styleAnalysis.harmonicComplexity.modalFlavor,
        tempo: styleAnalysis.tempo,
        currentHarmony: harmonicProgression[0]
      }

      const phrase = phraseMorphology.generatePhrase(gestureData, musicalContext)

      assert(phrase, 'Should generate phrase')
      assert(phrase.notes.length > 0, 'Phrase should have notes')
      assert(phrase.metadata, 'Phrase should have metadata')

      // 4. Validate musical coherence
      const pitches = phrase.notes.map(note => note.pitch)
      const uniquePitches = [...new Set(pitches)]

      // Should have reasonable pitch range (not all the same note)
      assert(uniquePitches.length > 1, 'Phrase should have pitch variety')

      // Should have reasonable durations
      const totalDuration = phrase.notes.reduce((sum, note) => sum + note.duration, 0)
      assert(totalDuration > 0, 'Phrase should have positive total duration')

      // Should be in reasonable tempo range
      assert(styleAnalysis.tempo >= 40 && styleAnalysis.tempo <= 200, 'Tempo should be musical')

      console.log('Generated musical phrase:', {
        style: styleAnalysis,
        harmony: harmonicProgression,
        phrase: phrase.metadata
      })
    })
  })
})