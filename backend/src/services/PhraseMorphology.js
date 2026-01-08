class PhraseMorphology {
  constructor() {
    // Musical scales with interval patterns
    this.scales = {
      major: [0, 2, 4, 5, 7, 9, 11],                    // Ionian
      majorPentatonic: [0, 2, 4, 7, 9],                  // Major pentatonic
      minor: [0, 2, 3, 5, 7, 8, 10],                    // Aeolian
      minorPentatonic: [0, 3, 5, 7, 10],                 // Minor pentatonic
      dorian: [0, 2, 3, 5, 7, 9, 10],                   // Dorian
      phrygian: [0, 1, 3, 5, 7, 8, 10],                  // Phrygian
      lydian: [0, 2, 4, 6, 7, 9, 11],                    // Lydian
      mixolydian: [0, 2, 4, 5, 7, 9, 10],                // Mixolydian
      harmonicMinor: [0, 2, 3, 5, 7, 8, 11],             // Harmonic minor
      blues: [0, 3, 5, 6, 7, 10],                        // Blues scale
      chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // Chromatic
      wholeTone: [0, 2, 4, 6, 8, 10],                    // Whole tone
      diminished: [0, 2, 3, 5, 6, 8, 9, 11]              // Diminished
    }

    // MIDI note numbers for pitch classes
    this.pitchClasses = {
      'C': 60, 'C#': 61, 'D': 62, 'D#': 63, 'E': 64, 'F': 65,
      'F#': 66, 'G': 67, 'G#': 68, 'A': 69, 'A#': 70, 'B': 71
    }
  }

  generatePhrase(gestureData, musicalContext) {
    const { velocity, trajectory, curvature, acceleration, intensity } = gestureData
    const { key = 'C', mode = 'major', tempo = 120, currentHarmony } = musicalContext

    // CRITICAL NEW FEATURE: Use gesture duration for phrase duration
    // This creates real-time feedback - phrase duration matches drag duration!
    const gestureDurationMs = gestureData.duration || 1000 // Default 1 second if missing
    const phraseDurationBeats = this.quantizeGestureDuration(gestureDurationMs, tempo)

// console.log('🎵 DRAG PHRASE - Gesture duration:', {
//      durationMs: gestureDurationMs,
//      tempo: tempo,
//      quantizedBeats: phraseDurationBeats
////    })

    // 1. Determine phrase length (note count) based on quantized duration and velocity
    const phraseLength = this.calculatePhraseLengthFromDuration(phraseDurationBeats, velocity, tempo)

    // 2. Select appropriate scale based on mood and mode
    const scale = this.selectScale(mode, gestureData)

    // 3. Generate melodic contour from gesture trajectory
    const contour = this.generateMelodicContour(trajectory, curvature, phraseLength)

    // 4. Convert contour to actual pitches
    const pitches = this.contourToPitches(contour, scale, key)

    // 5. Generate rhythm that fits EXACTLY in phraseDurationBeats
    const rhythm = this.generateRhythmForDuration(velocity, acceleration, phraseLength, phraseDurationBeats, tempo)

    // 6. Add ornamentation based on gesture character
    const ornamented = this.applyOrnamentation(pitches, rhythm, gestureData)

    // 7. Generate dynamics (velocity curve) - pass actual note count
    const dynamics = this.generateDynamics(acceleration, velocity, ornamented.length)

    // 8. Create articulation pattern - pass actual note count
    const articulations = this.generateArticulations(velocity, curvature, ornamented.length)

    // 9. CRITICAL: Extend rhythm array if ornamentation added extra notes
    // Ornament notes get short durations (1/4 of average original duration)
    const avgDuration = rhythm.length > 0
      ? rhythm.reduce((sum, d) => sum + d, 0) / rhythm.length
      : 0.25
    const ornamentDuration = avgDuration * 0.25
    while (rhythm.length < ornamented.length) {
      rhythm.push(ornamentDuration)
    }

// console.log('🎵 Generated phrase:', {
//      noteCount: phraseLength,
//      totalDurationBeats: phraseDurationBeats,
//      actualDurationBeats: rhythm.reduce((sum, dur) => sum + dur, 0).toFixed(2)
////    })

    return {
      notes: ornamented.map((pitch, i) => ({
        pitch,                    // MIDI note number
        duration: rhythm[i] || ornamentDuration,     // in beats (fallback for safety)
        velocity: dynamics[i] || 70,    // 0-127 (fallback for safety)
        articulation: articulations[i] || 'staccato',
        position: i / ornamented.length, // Position in phrase (0-1) - use ornamented.length
        startBeat: this.calculateStartBeat(rhythm, i) // When this note starts
      })),
      metadata: {
        scale: scale,
        key: key,
        length: phraseLength,
        tempo: tempo,
        phraseDurationBeats: phraseDurationBeats,  // NEW: Total phrase duration
        gestureDurationMs: gestureDurationMs,      // NEW: Original gesture duration
        contour: contour,
        gestureMood: this.analyzeMood(gestureData)
      }
    }
  }

  /**
   * Quantize gesture duration to musical beat values
   * Maps milliseconds to nearest musical duration (1, 2, 4, 8, 16 beats)
   */
  quantizeGestureDuration(durationMs, tempo = 120) {
    // Convert ms to beats
    const beatsPerMinute = tempo
    const msPerBeat = 60000 / beatsPerMinute
    const exactBeats = durationMs / msPerBeat

    // Quantize to musical divisions: 1, 2, 4, 8, 16 beats
    const quantizationLevels = [0.5, 1, 2, 4, 8, 16, 32]

    // Find nearest quantization level
    let nearestBeats = quantizationLevels[0]
    let minDiff = Math.abs(exactBeats - nearestBeats)

    for (const level of quantizationLevels) {
      const diff = Math.abs(exactBeats - level)
      if (diff < minDiff) {
        minDiff = diff
        nearestBeats = level
      }
    }

    // Clamp to reasonable range (min 1 beat, max 16 beats)
    return Math.max(1, Math.min(16, nearestBeats))
  }

  /**
   * Calculate phrase length (note count) from quantized duration
   * Faster velocity = more notes in same duration
   */
  calculatePhraseLengthFromDuration(phraseDurationBeats, velocity, tempo) {
    // Determine base note duration based on velocity
    let baseDuration
    if (velocity > 80) baseDuration = 0.25   // Fast = 16th notes
    else if (velocity > 60) baseDuration = 0.5  // Medium-fast = 8th notes
    else if (velocity > 40) baseDuration = 1.0  // Medium = quarter notes
    else if (velocity > 20) baseDuration = 1.5  // Medium-slow = dotted quarters
    else baseDuration = 2.0                     // Slow = half notes

    // Calculate how many notes fit in the phrase duration
    const idealNoteCount = Math.floor(phraseDurationBeats / baseDuration)

    // Clamp to reasonable range (min 2, max 12 notes)
    // Reduced from 32 to prevent explosive phrase generation
    const noteCount = Math.max(2, Math.min(12, idealNoteCount))

// console.log('📏 Phrase length calculation:', {
//      phraseDurationBeats,
//      velocity,
//      baseDuration,
//      idealNoteCount,
//      clampedNoteCount: noteCount
////    })

    return noteCount
  }

  /**
   * Generate rhythm that fits exactly in the target duration
   */
  generateRhythmForDuration(velocity, acceleration, noteCount, targetDurationBeats, tempo) {
    // Start with base durations
    let baseDuration
    if (velocity > 80) baseDuration = 0.25
    else if (velocity > 60) baseDuration = 0.5
    else if (velocity > 40) baseDuration = 1.0
    else if (velocity > 20) baseDuration = 1.5
    else baseDuration = 2.0

    const rhythm = []
    let totalDuration = 0

    // Generate rhythm with variation
    for (let i = 0; i < noteCount; i++) {
      // Add rhythmic variation
      const variation = (Math.random() - 0.5) * Math.abs(acceleration) * 0.02
      let duration = baseDuration * (1 + variation)

      // Occasionally add syncopation
      if (Math.random() < 0.15) {
        const rhythmicDevices = [0.5, 0.75, 1.5, 0.33, 0.67]
        duration = baseDuration * rhythmicDevices[Math.floor(Math.random() * rhythmicDevices.length)]
      }

      duration = Math.max(0.125, Math.min(4.0, duration))
      rhythm.push(duration)
      totalDuration += duration
    }

    // CRITICAL: Scale rhythm to fit EXACTLY in targetDurationBeats
    const scaleFactor = targetDurationBeats / totalDuration
    const scaledRhythm = rhythm.map(dur => dur * scaleFactor)

// console.log('🎵 Rhythm scaled:', {
//      originalTotal: totalDuration.toFixed(2),
//      targetDuration: targetDurationBeats,
//      scaleFactor: scaleFactor.toFixed(3),
//      finalTotal: scaledRhythm.reduce((sum, d) => sum + d, 0).toFixed(2)
////    })

    return scaledRhythm
  }

  calculatePhraseLength(velocity) {
    // Faster gestures = shorter, more active phrases
    // Slower gestures = longer, more lyrical phrases

    if (velocity > 80) return 3 + Math.floor(Math.random() * 3)      // 3-5 notes
    if (velocity > 60) return 4 + Math.floor(Math.random() * 4)      // 4-7 notes
    if (velocity > 40) return 5 + Math.floor(Math.random() * 5)      // 5-9 notes
    if (velocity > 20) return 6 + Math.floor(Math.random() * 6)      // 6-11 notes
    return 7 + Math.floor(Math.random() * 7)                         // 7-13 notes
  }

  selectScale(mode, gestureData) {
    // Intelligent scale selection based on gesture mood
    const mood = this.analyzeMood(gestureData)
    const curvature = gestureData.curvature || 0.5
    const velocity = gestureData.velocity || 50

    // Scale mapping based on mood and gesture character
    const scaleMap = {
      bright: { primary: 'major', secondary: 'majorPentatonic' },
      happy: { primary: 'majorPentatonic', secondary: 'major' },
      sad: { primary: 'minor', secondary: 'minorPentatonic' },
      dark: { primary: 'phrygian', secondary: 'harmonicMinor' },
      jazzy: { primary: 'dorian', secondary: 'mixolydian' },
      dreamy: { primary: 'lydian', secondary: 'wholeTone' },
      bluesy: { primary: 'blues', secondary: 'minorPentatonic' },
      exotic: { primary: 'harmonicMinor', secondary: 'phrygian' },
      tense: { primary: 'diminished', secondary: 'chromatic' },
      floating: { primary: 'wholeTone', secondary: 'lydian' }
    }

    const selectedScale = scaleMap[mood]?.primary || mode

    // Occasionally use secondary scale for variety
    if (Math.random() < 0.2 && scaleMap[mood]) {
      return this.scales[scaleMap[mood].secondary] || this.scales[selectedScale]
    }

    return this.scales[selectedScale] || this.scales.major
  }

  analyzeMood(gestureData) {
    const { velocity = 50, curvature = 0.5, acceleration = 0 } = gestureData

    // Analyze gesture characteristics to determine mood
    if (velocity > 70 && curvature < 0.3) return 'bright'
    if (velocity > 60 && curvature > 0.6) return 'happy'
    if (velocity < 30 && curvature < 0.4) return 'sad'
    if (velocity < 40 && curvature > 0.7) return 'dreamy'
    if (curvature > 0.8 && velocity > 50) return 'jazzy'
    if (acceleration > 10) return 'tense'
    if (velocity < 20 && curvature > 0.5) return 'floating'
    if (curvature > 0.6) return 'bluesy'
    if (acceleration < -10) return 'dark'

    return 'neutral'
  }

  generateMelodicContour(trajectory, curvature, length) {
    // Generate melodic contour based on gesture trajectory and curvature

    if (!trajectory) {
      return this.generateDefaultContour(length)
    }

    const angle = trajectory.angle || 0
    const direction = trajectory.direction || 'horizontal'

    // Determine contour type
    let contourType
    if (angle > 45) contourType = 'ascending'
    else if (angle < -45) contourType = 'descending'
    else if (curvature > 0.7) contourType = 'arch'
    else if (curvature < 0.3) contourType = 'linear'
    else contourType = 'wave'

    return this.createContour(contourType, length, curvature)
  }

  generateDefaultContour(length) {
    // Generate a balanced default contour
    const contourTypes = ['arch', 'wave', 'ascending_descending', 'level']
    const contourType = contourTypes[Math.floor(Math.random() * contourTypes.length)]
    return this.createContour(contourType, length, 0.5)
  }

  createContour(type, length, curvature) {
    const contour = []

    switch (type) {
      case 'ascending':
        for (let i = 0; i < length; i++) {
          contour.push(1 - (i / length) + (Math.random() - 0.5) * 0.2)
        }
        break

      case 'descending':
        for (let i = 0; i < length; i++) {
          contour.push(i / length + (Math.random() - 0.5) * 0.2)
        }
        break

      case 'arch':
        for (let i = 0; i < length; i++) {
          const peak = 0.5
          const distance = Math.abs(i / length - peak)
          contour.push(1 - distance * 2 + (Math.random() - 0.5) * 0.2)
        }
        break

      case 'wave':
        for (let i = 0; i < length; i++) {
          const wave = Math.sin((i / length) * Math.PI * 2 * curvature)
          contour.push((wave + 1) / 2)
        }
        break

      case 'ascending_descending':
        const midPoint = Math.floor(length / 2)
        for (let i = 0; i < length; i++) {
          if (i < midPoint) {
            contour.push(i / midPoint)
          } else {
            contour.push(1 - ((i - midPoint) / midPoint))
          }
        }
        break

      case 'level':
        for (let i = 0; i < length; i++) {
          contour.push(0.5 + (Math.random() - 0.5) * 0.1)
        }
        break

      default:
        for (let i = 0; i < length; i++) {
          contour.push(0.5 + (Math.random() - 0.5) * 0.3)
        }
    }

    // Normalize contour to 0-1 range
    const min = Math.min(...contour)
    const max = Math.max(...contour)
    return contour.map(val => (val - min) / (max - min))
  }

  contourToPitches(contour, scale, rootNote) {
    // Convert abstract contour to actual MIDI pitches using voice leading

    const rootMidi = this.pitchClasses[rootNote] || 60
    const pitches = []
    let currentDegree = 0 // Current scale degree

    contour.forEach((height, i) => {
      // Map contour height to scale degree range
      const targetDegree = Math.floor(height * (scale.length - 1))

      // Prefer stepwise motion (voice leading)
      const intervalType = this.selectIntervalType(currentDegree, targetDegree)

      let newDegree = currentDegree
      switch (intervalType) {
        case 'step':
          newDegree += targetDegree > currentDegree ? 1 : -1
          break
        case 'skip':
          newDegree += targetDegree > currentDegree ? 2 : -2
          break
        case 'leap':
          const leapSize = Math.min(5, Math.abs(targetDegree - currentDegree))
          newDegree += targetDegree > currentDegree ? leapSize : -leapSize
          break
        default:
          newDegree = targetDegree
      }

      // Keep within scale bounds
      currentDegree = Math.max(0, Math.min(scale.length - 1, newDegree))

      // Convert scale degree to MIDI note
      const octave = Math.floor(i / scale.length) // Move up octave as needed
      const pitch = rootMidi + scale[currentDegree] + (octave * 12)

      pitches.push(pitch)
    })

    return pitches
  }

  selectIntervalType(currentDegree, targetDegree) {
    const distance = Math.abs(targetDegree - currentDegree)

    // Musical interval distribution: 70% steps, 20% skips, 10% leaps
    const rand = Math.random()

    if (rand < 0.7 || distance <= 1) return 'step'
    if (rand < 0.9 || distance <= 3) return 'skip'
    return 'leap'
  }

  generateRhythm(velocity, acceleration, noteCount, tempo) {
    // Generate rhythm based on gesture velocity and acceleration

    // Base note duration inversely proportional to velocity
    let baseDuration
    if (velocity > 80) baseDuration = 0.25   // Sixteenth notes
    else if (velocity > 60) baseDuration = 0.5  // Eighth notes
    else if (velocity > 40) baseDuration = 1.0  // Quarter notes
    else if (velocity > 20) baseDuration = 1.5  // Dotted quarter
    else baseDuration = 2.0                     // Half notes

    const rhythm = []
    let currentTime = 0

    for (let i = 0; i < noteCount; i++) {
      // Add rhythmic variation based on acceleration
      const variation = (Math.random() - 0.5) * Math.abs(acceleration) * 0.02
      let duration = baseDuration * (1 + variation)

      // Occasionally add syncopation or rhythmic interest
      if (Math.random() < 0.15) {
        const rhythmicDevices = [0.5, 0.75, 1.5, 0.33, 0.67] // Various divisions
        duration = baseDuration * rhythmicDevices[Math.floor(Math.random() * rhythmicDevices.length)]
      }

      // Ensure reasonable duration bounds
      duration = Math.max(0.125, Math.min(4.0, duration))

      rhythm.push(duration)
      currentTime += duration
    }

    return rhythm
  }

  applyOrnamentation(pitches, rhythm, gestureData) {
    const { curvature = 0.5, velocity = 50 } = gestureData
    const ornamented = [...pitches]

    // Determine ornamentation style based on gesture character
    let ornamentationStyle
    if (curvature > 0.8 && velocity < 30) {
      ornamentationStyle = 'baroque'  // Trills, mordents
    } else if (curvature > 0.6 && velocity > 70) {
      ornamentationStyle = 'jazz'      // Runs, enclosures
    } else if (velocity > 80) {
      ornamentationStyle = 'blues'    // Bends, slides
    } else if (curvature > 0.7) {
      ornamentationStyle = 'romantic' // Arpeggios
    } else {
      return ornamented // No ornamentation
    }

    return this.addOrnaments(ornamented, rhythm, ornamentationStyle)
  }

  addOrnaments(pitches, rhythm, style) {
    const ornamented = []

    pitches.forEach((pitch, i) => {
      ornamented.push(pitch) // Always include the original note

      switch (style) {
        case 'baroque':
          if (Math.random() < 0.3 && i < pitches.length - 1) {
            // Add trill (rapid alternation with note above)
            const trillNote = pitch + 2 // Major second above
            ornamented.push(trillNote)
            rhythm[i] = rhythm[i] * 0.7 // Shorten main note
          }
          break

        case 'jazz':
          if (Math.random() < 0.4 && i < pitches.length - 1) {
            // Add approach note from below
            const approachNote = pitch - 1
            ornamented.splice(ornamented.length - 1, 0, approachNote)
          }
          break

        case 'blues':
          if (Math.random() < 0.3) {
            // Add blue note (flat 3, 5, or 7)
            const blueNote = pitch - 3 // Flat 3rd
            ornamented.push(blueNote)
          }
          break

        case 'romantic':
          if (Math.random() < 0.2 && i < pitches.length - 2) {
            // Add simple arpeggio fragment
            const third = pitch + 4
            const fifth = pitch + 7
            ornamented.push(third, fifth)
          }
          break
      }
    })

    return ornamented
  }

  generateDynamics(acceleration, velocity, noteCount = 5) {
    // Generate dynamic contour based on gesture acceleration
    const baseVel = Array.isArray(velocity) ? velocity[0] || 50 : velocity
    // Use provided noteCount instead of deriving from velocity
    const dynamics = []

    if (acceleration > 5) {
      // Positive acceleration = crescendo
      for (let i = 0; i < noteCount; i++) {
        const crescendo = 60 + (i / noteCount) * 60 // pp to ff
        dynamics.push(Math.round(crescendo + (Math.random() - 0.5) * 10))
      }
    } else if (acceleration < -5) {
      // Negative acceleration = diminuendo
      for (let i = 0; i < noteCount; i++) {
        const diminuendo = 120 - (i / noteCount) * 60 // ff to pp
        dynamics.push(Math.round(diminuendo + (Math.random() - 0.5) * 10))
      }
    } else {
      // Stable dynamics with small variations
      const baseVelocity = Math.max(40, Math.min(100, baseVel || 70))
      for (let i = 0; i < noteCount; i++) {
        dynamics.push(Math.round(baseVelocity + (Math.random() - 0.5) * 15))
      }
    }

    return dynamics
  }

  generateArticulations(velocity, curvature, noteCount = 5) {
    // Generate articulation patterns based on gesture character
    const baseVel = Array.isArray(velocity) ? velocity[0] || 50 : velocity
    // Use provided noteCount instead of deriving from velocity
    const articulations = []

    for (let i = 0; i < noteCount; i++) {
      const articulation = this.selectArticulation(baseVel, curvature)
      articulations.push(articulation)
    }

    return articulations
  }

  selectArticulation(velocity, curvature) {
    if (curvature > 0.8) {
      return velocity > 60 ? 'staccato' : 'legato'
    } else if (velocity > 80) {
      return 'marcato'
    } else if (velocity < 30) {
      return 'legato'
    } else {
      return 'normal'
    }
  }

  calculateStartBeat(rhythm, index) {
    // Calculate the beat position where each note starts
    let beat = 0
    for (let i = 0; i < index && i < rhythm.length; i++) {
      beat += rhythm[i]
    }
    return beat
  }

  // Utility methods for phrase manipulation
  transposePhrase(phrase, semitones) {
    return {
      ...phrase,
      notes: phrase.notes.map(note => ({
        ...note,
        pitch: note.pitch + semitones
      }))
    }
  }

  invertPhrase(phrase) {
    const pitches = phrase.notes.map(note => note.pitch)
    const center = (Math.min(...pitches) + Math.max(...pitches)) / 2

    return {
      ...phrase,
      notes: phrase.notes.map(note => ({
        ...note,
        pitch: Math.round(2 * center - note.pitch)
      }))
    }
  }

  retrogradePhrase(phrase) {
    return {
      ...phrase,
      notes: [...phrase.notes].reverse().map((note, i) => ({
        ...note,
        startBeat: phrase.notes[i].startBeat
      }))
    }
  }
}

module.exports = PhraseMorphology