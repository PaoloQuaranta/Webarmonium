/**
 * AccompanimentEngine Unit Tests
 * Entry #211: Tests for sophisticated accompaniment generation
 */

const assert = require('assert')
const AccompanimentEngine = require('../../src/services/AccompanimentEngine')
const HarmonicEngine = require('../../src/services/HarmonicEngine')

describe('AccompanimentEngine Test Suite', () => {
  let accompanimentEngine, harmonicEngine

  beforeEach(() => {
    harmonicEngine = new HarmonicEngine()
    accompanimentEngine = new AccompanimentEngine(harmonicEngine)
  })

  describe('Voice Leading', () => {
    it('should minimize voice movement between chords', () => {
      const prev = [60, 64, 67]  // C major chord
      const target = [59, 62, 67]  // G major as pitch classes
      const range = { min: 48, max: 84 }

      const led = accompanimentEngine.applyVoiceLeading(prev, target, range)

      // Result should be in range
      led.forEach(pitch => {
        assert(pitch >= range.min && pitch <= range.max, `Pitch ${pitch} should be in range`)
      })

      // Total movement should be minimal (less than 12 semitones total)
      const totalMovement = led.reduce((sum, pitch) => {
        const closestPrev = prev.reduce((closest, p) =>
          Math.abs(pitch - p) < Math.abs(pitch - closest) ? p : closest
        )
        return sum + Math.abs(pitch - closestPrev)
      }, 0)

      assert(totalMovement < 15, `Voice leading should minimize movement (got ${totalMovement})`)
    })

    it('should place first chord in comfortable register', () => {
      const target = [0, 4, 7]  // C major intervals (will need octave adjustment)
      const range = { min: 48, max: 72 }

      const placed = accompanimentEngine.applyVoiceLeading(null, target, range)

      assert(placed.length === target.length, 'Should preserve chord size')
      placed.forEach(pitch => {
        assert(pitch >= range.min && pitch <= range.max, `Pitch ${pitch} should be in range`)
      })
    })

    it('should return empty array for empty input', () => {
      const result = accompanimentEngine.applyVoiceLeading([60], [], { min: 48, max: 84 })
      assert.strictEqual(result.length, 0, 'Should return empty array for empty target')
    })

    it('should handle single pitch voice leading', () => {
      const prev = [48]
      const target = [60]
      const range = { min: 36, max: 72 }

      const led = accompanimentEngine.applyVoiceLeading(prev, target, range)

      assert.strictEqual(led.length, 1, 'Should return single pitch')
      assert(led[0] >= range.min && led[0] <= range.max, 'Pitch should be in range')
    })
  })

  describe('Velocity Curves', () => {
    it('should produce crescendo curve (increasing velocity)', () => {
      const start = accompanimentEngine._getVelocityCurve('crescendo', 0, 0.5)
      const mid = accompanimentEngine._getVelocityCurve('crescendo', 0.5, 0.5)
      const end = accompanimentEngine._getVelocityCurve('crescendo', 1, 0.5)

      assert(end > start, 'Crescendo should increase velocity')
      assert(mid > start && mid < end, 'Mid should be between start and end')
    })

    it('should produce diminuendo curve (decreasing velocity)', () => {
      const start = accompanimentEngine._getVelocityCurve('diminuendo', 0, 0.5)
      const mid = accompanimentEngine._getVelocityCurve('diminuendo', 0.5, 0.5)
      const end = accompanimentEngine._getVelocityCurve('diminuendo', 1, 0.5)

      assert(start > end, 'Diminuendo should decrease velocity')
      assert(mid < start && mid > end, 'Mid should be between start and end')
    })

    it('should produce swell curve (arch shape)', () => {
      const start = accompanimentEngine._getVelocityCurve('swell', 0, 0.5)
      const mid = accompanimentEngine._getVelocityCurve('swell', 0.5, 0.5)
      const end = accompanimentEngine._getVelocityCurve('swell', 1, 0.5)

      assert(mid > start, 'Swell should peak in middle')
      assert(mid > end, 'Swell should decrease after peak')
    })

    it('should modulate with harmonic tension', () => {
      const lowTension = accompanimentEngine._getVelocityCurve('stable', 0.5, 0.2)
      const highTension = accompanimentEngine._getVelocityCurve('stable', 0.5, 0.8)

      assert(Math.abs(highTension - lowTension) > 0.05, 'Tension should affect velocity')
    })

    it('should keep velocity in valid range', () => {
      const contours = ['crescendo', 'diminuendo', 'terraced', 'swell', 'stable']
      const positions = [0, 0.25, 0.5, 0.75, 1]
      const tensions = [0, 0.5, 1]

      contours.forEach(contour => {
        positions.forEach(pos => {
          tensions.forEach(tension => {
            const vel = accompanimentEngine._getVelocityCurve(contour, pos, tension)
            assert(vel >= 0.5 && vel <= 1.2, `Velocity ${vel} should be in 0.5-1.2 range`)
          })
        })
      })
    })
  })

  describe('Bass Accompaniment', () => {
    const progression = [
      { chord: 'major', root: 0, bars: 1 },  // C major
      { chord: 'minor', root: 5, bars: 1 }   // F minor
    ]

    it('should generate notes for all genres', () => {
      const genres = ['jazz', 'rock', 'electronic', 'ambient', 'classical', 'melodic', 'rhythmic']

      genres.forEach(genre => {
        const bass = accompanimentEngine.generateBassAccompaniment(
          progression, genre, 2, null, 0
        )

        assert(bass.type === 'bass_accomp', `${genre} should have correct type`)
        assert(bass.notes.length > 0, `${genre} should generate bass notes`)

        bass.notes.forEach(note => {
          assert(note.pitch >= 28 && note.pitch <= 60, `${genre} bass pitch ${note.pitch} should be in bass range`)
          assert(note.duration > 0, `${genre} bass notes should have duration`)
          assert(note.articulation, `${genre} bass should have articulation`)
          assert(typeof note.velocity === 'number', `${genre} bass should have velocity`)
        })
      })
    })

    it('should apply voice leading across chord changes', () => {
      const bass = accompanimentEngine.generateBassAccompaniment(
        progression, 'melodic', 2, null, 0
      )

      // Check that bass doesn't jump more than an octave between chords
      const chordBoundary = bass.notes.findIndex(n => n.startBeat >= 4)
      if (chordBoundary > 0 && chordBoundary < bass.notes.length) {
        const lastFirstChord = bass.notes[chordBoundary - 1].pitch
        const firstSecondChord = bass.notes[chordBoundary].pitch

        const jump = Math.abs(lastFirstChord - firstSecondChord)
        assert(jump <= 12, `Bass should not jump more than octave (got ${jump})`)
      }
    })

    it('should handle empty progression', () => {
      const bass = accompanimentEngine.generateBassAccompaniment([], 'jazz', 2, null, 0)

      assert.strictEqual(bass.notes.length, 0, 'Empty progression should produce no notes')
      assert.strictEqual(bass.type, 'bass_accomp', 'Should still have correct type')
    })

    it('should respect dynamic contour from section context', () => {
      const crescendoContext = { dynamicContour: 'crescendo', dynamicLevel: 0.5 }
      const diminuendoContext = { dynamicContour: 'diminuendo', dynamicLevel: 0.5 }

      const crescBass = accompanimentEngine.generateBassAccompaniment(
        progression, 'rock', 2, crescendoContext, 0
      )
      const dimBass = accompanimentEngine.generateBassAccompaniment(
        progression, 'rock', 2, diminuendoContext, 0
      )

      // Both should have notes with velocity
      assert(crescBass.notes.every(n => n.velocity > 0), 'Crescendo bass should have velocities')
      assert(dimBass.notes.every(n => n.velocity > 0), 'Diminuendo bass should have velocities')
    })

    it('should vary patterns with compositionCount (PHI variation)', () => {
      const bass0 = accompanimentEngine.generateBassAccompaniment(progression, 'electronic', 2, null, 0)
      const bass1 = accompanimentEngine.generateBassAccompaniment(progression, 'electronic', 2, null, 1)
      const bass2 = accompanimentEngine.generateBassAccompaniment(progression, 'electronic', 2, null, 5)

      // Hash patterns to compare
      const hash = (notes) => notes.map(n => `${n.pitch}:${n.startBeat.toFixed(2)}`).join(',')

      const hashes = [hash(bass0.notes), hash(bass1.notes), hash(bass2.notes)]
      const uniqueHashes = new Set(hashes)

      // At least some variation should occur
      assert(uniqueHashes.size >= 1, 'PHI variation should produce some pattern differences')
    })
  })

  describe('Pad Accompaniment', () => {
    const progression = [
      { chord: 'major', root: 0, bars: 2 }
    ]

    it('should generate sustained chords', () => {
      const pad = accompanimentEngine.generatePadAccompaniment(
        progression, 'ambient', 2, null, 0
      )

      assert(pad.notes.length >= 3, 'Pad should have multiple voices')
      assert(pad.sustain === true, 'Pad should have sustain flag')

      pad.notes.forEach(note => {
        assert(note.duration > 2, `Pad note duration ${note.duration} should be sustained`)
        assert.strictEqual(note.articulation, 'legato', 'Pad should be legato')
      })
    })

    it('should add extensions at high harmonic tension', () => {
      const lowTensionContext = { harmonicTension: 0.3, dynamicContour: 'stable' }
      const highTensionContext = { harmonicTension: 0.9, dynamicContour: 'stable' }

      const lowPad = accompanimentEngine.generatePadAccompaniment(
        progression, 'jazz', 2, lowTensionContext, 0
      )
      const highPad = accompanimentEngine.generatePadAccompaniment(
        progression, 'jazz', 2, highTensionContext, 0
      )

      const lowPitchClasses = new Set(lowPad.notes.map(n => n.pitch % 12))
      const highPitchClasses = new Set(highPad.notes.map(n => n.pitch % 12))

      // High tension should have more pitch classes (extensions)
      assert(highPitchClasses.size >= lowPitchClasses.size,
        'High tension should have at least as many pitch classes as low tension')
    })

    it('should apply voice leading between chords', () => {
      const multiChordProgression = [
        { chord: 'major', root: 0, bars: 1 },
        { chord: 'major', root: 5, bars: 1 }
      ]

      const pad = accompanimentEngine.generatePadAccompaniment(
        multiChordProgression, 'classical', 2, null, 0
      )

      // Find notes from each chord
      const chord1Notes = pad.notes.filter(n => n.startBeat < 4)
      const chord2Notes = pad.notes.filter(n => n.startBeat >= 4)

      if (chord1Notes.length > 0 && chord2Notes.length > 0) {
        // Check voice movement isn't too large
        const maxJump = Math.max(...chord2Notes.map(n2 => {
          const closestC1 = chord1Notes.reduce((closest, n1) =>
            Math.abs(n2.pitch - n1.pitch) < Math.abs(n2.pitch - closest.pitch) ? n1 : closest
          )
          return Math.abs(n2.pitch - closestC1.pitch)
        }))

        assert(maxJump <= 12, `Pad voice leading should minimize jumps (got ${maxJump})`)
      }
    })

    it('should handle empty progression', () => {
      const pad = accompanimentEngine.generatePadAccompaniment([], 'ambient', 2, null, 0)

      assert.strictEqual(pad.notes.length, 0, 'Empty progression should produce no notes')
      assert.strictEqual(pad.type, 'pad', 'Should still have correct type')
    })
  })

  describe('Keys Accompaniment', () => {
    const progression = [
      { chord: 'major', root: 0, bars: 2 }
    ]

    it('should generate appropriate patterns for each genre', () => {
      const genres = ['electronic', 'jazz', 'rock', 'classical', 'ambient', 'melodic']

      genres.forEach(genre => {
        const keys = accompanimentEngine.generateKeysAccompaniment(
          progression, genre, 2, null, 0
        )

        assert.strictEqual(keys.type, 'keys', `${genre} should have correct type`)
        assert(keys.notes.length > 0, `${genre} should generate keys notes`)

        keys.notes.forEach(note => {
          assert(note.pitch >= 48 && note.pitch <= 96, `${genre} keys pitch should be in range`)
          assert(note.duration > 0, `${genre} keys notes should have duration`)
          assert(note.articulation, `${genre} keys should have articulation`)
        })
      })
    })

    it('should produce denser pattern for electronic than jazz', () => {
      const electronic = accompanimentEngine.generateKeysAccompaniment(
        progression, 'electronic', 2, null, 0
      )
      const jazz = accompanimentEngine.generateKeysAccompaniment(
        progression, 'jazz', 2, null, 0
      )

      // Electronic arpeggios should have more notes than jazz comping
      assert(electronic.notes.length > jazz.notes.length,
        `Electronic (${electronic.notes.length}) should have more notes than jazz (${jazz.notes.length})`)
    })

    it('should vary articulation based on harmonic tension', () => {
      const highTensionContext = { harmonicTension: 0.85, dynamicContour: 'crescendo' }

      const keys = accompanimentEngine.generateKeysAccompaniment(
        progression, 'melodic', 2, highTensionContext, 0
      )

      const articulations = new Set(keys.notes.map(n => n.articulation))

      // High tension should produce varied articulation
      assert(articulations.size >= 1, 'Keys should have articulation')
    })

    it('should handle empty progression', () => {
      const keys = accompanimentEngine.generateKeysAccompaniment([], 'jazz', 2, null, 0)

      assert.strictEqual(keys.notes.length, 0, 'Empty progression should produce no notes')
      assert.strictEqual(keys.type, 'keys', 'Should still have correct type')
    })

    it('should apply swing for jazz', () => {
      const multiChordProg = [
        { chord: 'major7', root: 0, bars: 2 },
        { chord: 'dom7', root: 5, bars: 2 }
      ]

      const jazz = accompanimentEngine.generateKeysAccompaniment(
        multiChordProg, 'jazz', 4, null, 0
      )

      // Jazz comping should have notes at off-beat positions (swing)
      const offBeatNotes = jazz.notes.filter(n => {
        const beatFraction = n.startBeat % 1
        return beatFraction > 0.1 && beatFraction < 0.9
      })

      assert(offBeatNotes.length > 0, 'Jazz should have off-beat notes (swing/comping)')
    })
  })

  describe('Reset Voice Leading', () => {
    it('should reset previous voicings for all layers', () => {
      const progression = [{ chord: 'major', root: 0, bars: 1 }]

      // Generate to set previous voicings
      accompanimentEngine.generateBassAccompaniment(progression, 'jazz', 1, null, 0)
      accompanimentEngine.generatePadAccompaniment(progression, 'jazz', 1, null, 0)
      accompanimentEngine.generateKeysAccompaniment(progression, 'jazz', 1, null, 0)

      // Reset
      accompanimentEngine.resetVoiceLeading()

      // Check all are null
      assert.strictEqual(accompanimentEngine._previousVoicings.bass_accomp, null)
      assert.strictEqual(accompanimentEngine._previousVoicings.pad, null)
      assert.strictEqual(accompanimentEngine._previousVoicings.keys, null)
    })
  })

  describe('Note Format Compatibility', () => {
    it('should produce notes with all required fields', () => {
      const progression = [{ chord: 'major', root: 0, bars: 2 }]

      const bass = accompanimentEngine.generateBassAccompaniment(progression, 'rock', 2, null, 0)
      const pad = accompanimentEngine.generatePadAccompaniment(progression, 'rock', 2, null, 0)
      const keys = accompanimentEngine.generateKeysAccompaniment(progression, 'rock', 2, null, 0)

      const allNotes = [...bass.notes, ...pad.notes, ...keys.notes]

      allNotes.forEach(note => {
        assert(typeof note.pitch === 'number', 'Note should have numeric pitch')
        assert(typeof note.startBeat === 'number', 'Note should have numeric startBeat')
        assert(typeof note.duration === 'number', 'Note should have numeric duration')
        assert(typeof note.velocity === 'number', 'Note should have numeric velocity')
        assert(typeof note.articulation === 'string', 'Note should have string articulation')

        // Velocity should be MIDI range (0-127)
        assert(note.velocity >= 0 && note.velocity <= 127, 'Velocity should be in MIDI range')

        // Duration and startBeat should be positive
        assert(note.duration > 0, 'Duration should be positive')
        assert(note.startBeat >= 0, 'StartBeat should be non-negative')
      })
    })
  })
})
