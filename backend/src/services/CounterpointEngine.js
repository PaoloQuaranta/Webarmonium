class CounterpointEngine {
  constructor() {
    // Voice ranges in MIDI note numbers (standard SATB ranges)
    this.voiceRanges = {
      soprano: { min: 60, max: 79 },  // C4 - G5
      alto: { min: 55, max: 72 },      // A3 - C5
      tenor: { min: 48, max: 67 },     // C3 - G4
      bass: { min: 36, max: 55 }       // C2 - G3
    }

    // Interval sizes in semitones
    this.intervals = {
      unison: 0,
      minor2: 1,
      major2: 2,
      minor3: 3,
      major3: 4,
      perfect4: 5,
      tritone: 6,
      perfect5: 7,
      minor6: 8,
      major6: 9,
      minor7: 10,
      major7: 11,
      octave: 12
    }

    // Consonant intervals (stable)
    this.consonantIntervals = [0, 3, 4, 7, 9, 12] // P1, m3, M3, P5, M6, P8

    // Dissonant intervals (unstable)
    this.dissonantIntervals = [1, 2, 5, 6, 8, 10, 11] // m2, M2, P4, TT, m6, m7, M7
  }

  createVoice(material, voiceIndex, progression) {
    // Create a voice with DISTINCT ROLE based on index
    // Voice 0: MELODY (lead, soprano, fast notes)
    // Voice 1: HARMONY (supporting, alto, medium notes)
    // Voice 2: BASS (foundation, bass, long notes)
    // Voice 3: PAD (texture, tenor, very long notes)

    const voiceRole = this.getVoiceRole(voiceIndex)
    const voiceType = voiceRole.type
    const range = this.voiceRanges[voiceType]

    // Analyze material for melodic characteristics
    const melodicProfile = this.analyzeMaterialForVoice(material)

    // Override profile with role-specific characteristics
    melodicProfile.role = voiceRole.name
    melodicProfile.density = voiceRole.density
    melodicProfile.noteLength = voiceRole.noteLength
    melodicProfile.activity = voiceRole.activity

    // Generate voice based on role
    const voiceNotes = this.generateVoiceNotes(material, range, melodicProfile, progression)

    return {
      voiceType,
      voiceRole: voiceRole.name,
      userId: material.userId,
      notes: voiceNotes,
      range: range,
      character: melodicProfile,
      voiceIndex: voiceIndex,
      timbre: voiceRole.timbre
    }
  }

  getVoiceRole(voiceIndex) {
    const roles = [
      {
        name: 'melody',
        type: 'soprano',
        density: 'high',      // Many notes
        noteLength: 'short',  // Quick articulation
        activity: 'high',
        timbre: 'bright'
      },
      {
        name: 'harmony',
        type: 'alto',
        density: 'medium',    // Moderate notes
        noteLength: 'medium', // Normal articulation
        activity: 'medium',
        timbre: 'warm'
      },
      {
        name: 'bass',
        type: 'bass',
        density: 'low',       // Few notes
        noteLength: 'long',   // Sustained notes
        activity: 'low',
        timbre: 'deep'
      },
      {
        name: 'pad',
        type: 'tenor',
        density: 'sparse',    // Very few notes
        noteLength: 'verylong', // Very sustained
        activity: 'low',
        timbre: 'soft'
      }
    ]

    return roles[voiceIndex % 4]
  }

  analyzeMaterialForVoice(material) {
    // Analyze material to determine voice character
    let profile = {
      contour: 'neutral',
      activity: 'medium',
      register: 'middle',
      complexity: 0.5
    }

    if (material.gestureData) {
      const velocity = material.gestureData.velocity || 50
      const curvature = material.gestureData.curvature || 0.5

      // Determine activity level
      if (velocity > 70) profile.activity = 'high'
      else if (velocity < 30) profile.activity = 'low'

      // Determine contour
      if (curvature > 0.7) profile.contour = 'curvy'
      else if (curvature < 0.3) profile.contour = 'linear'
    }

    if (material.notes && material.notes.length > 1) {
      const pitches = material.notes.map(note => note.pitch)
      const range = Math.max(...pitches) - Math.min(...pitches)

      // Determine register
      const avgPitch = pitches.reduce((sum, p) => sum + p, 0) / pitches.length
      if (avgPitch > 72) profile.register = 'high'
      else if (avgPitch < 48) profile.register = 'low'
      else profile.register = 'middle'

      // Calculate complexity
      const intervals = []
      for (let i = 1; i < pitches.length; i++) {
        intervals.push(Math.abs(pitches[i] - pitches[i-1]))
      }
      const avgInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length
      profile.complexity = Math.min(1, avgInterval / 8)
    }

    return profile
  }

  generateVoiceNotes(material, range, profile, progression) {
    const voiceNotes = []
    let currentBeat = 0

    if (material.notes && material.notes.length > 0) {
      // Adapt existing material to voice range
      material.notes.forEach((note, i) => {
        let adaptedPitch = this.adaptPitchToRange(note.pitch, range, profile)

        // Apply voice leading principles
        if (i > 0) {
          const prevNote = voiceNotes[i-1]
          adaptedPitch = this.applyVoiceLeading(prevNote.pitch, adaptedPitch, range)
        }

        const duration = note.duration || 1
        voiceNotes.push({
          pitch: adaptedPitch,
          duration: duration,
          velocity: note.velocity || 80,
          articulation: note.articulation || 'normal',
          startBeat: currentBeat
        })

        // Accumulate timing: next note starts after this one plus optional gap
        currentBeat += duration + (Math.random() * 0.5) // Small random gap
      })
    } else {
      // Generate new voice based on ROLE (not just activity)
      const role = profile.role || 'melody'

      // Note count based on role density
      const noteCount = {
        'melody': 8,      // Many fast notes
        'harmony': 5,     // Moderate notes
        'bass': 3,        // Few long notes
        'pad': 2          // Very sparse
      }[role] || 5

      for (let i = 0; i < noteCount; i++) {
        let pitch = this.generatePitchForVoice(range, profile, i, noteCount)

        if (i > 0) {
          const prevNote = voiceNotes[i-1]
          pitch = this.applyVoiceLeading(prevNote.pitch, pitch, range)
        }

        const duration = this.generateDurationByRole(role, i, noteCount)
        voiceNotes.push({
          pitch,
          duration: duration,
          velocity: this.generateVelocity(profile.activity),
          articulation: this.generateArticulationByRole(role),
          startBeat: currentBeat
        })

        // Gap based on role
        const gap = this.generateGapByRole(role)
        currentBeat += duration + gap
      }
    }

    return voiceNotes
  }

  adaptPitchToRange(originalPitch, range, profile) {
    // Adapt pitch to fit within voice range
    let adaptedPitch = originalPitch

    // Simple transposition to fit range
    while (adaptedPitch < range.min) {
      adaptedPitch += 12 // Move up an octave
    }
    while (adaptedPitch > range.max) {
      adaptedPitch -= 12 // Move down an octave
    }

    // Adjust based on profile
    if (profile.register === 'high') {
      adaptedPitch = Math.min(range.max, adaptedPitch + 4)
    } else if (profile.register === 'low') {
      adaptedPitch = Math.max(range.min, adaptedPitch - 4)
    }

    return adaptedPitch
  }

  generatePitchForVoice(range, profile, index, total) {
    // Generate pitch within voice range
    const { min, max } = range
    const rangeSize = max - min

    let basePitch

    switch (profile.contour) {
      case 'curvy':
        // Create arch-like contour
        const center = min + rangeSize / 2
        const deviation = (rangeSize / 4) * Math.sin((index / total) * Math.PI)
        basePitch = center + deviation
        break

      case 'linear':
        // Create ascending or descending line
        const direction = index % 2 === 0 ? 1 : -1
        basePitch = min + (rangeSize * 0.3) + (index / total) * (rangeSize * 0.4) * direction
        break

      default:
        // Random but controlled
        basePitch = min + rangeSize * 0.3 + Math.random() * rangeSize * 0.4
    }

    // Snap to diatonic notes for more musical result
    return Math.round(basePitch / 2) * 2 // Approximate diatonic spacing
  }

  applyVoiceLeading(prevPitch, targetPitch, range) {
    // Apply voice leading principles to minimize voice movement
    let ledPitch = targetPitch

    // Find closest octave placement
    const octaveDiff = Math.round((prevPitch - targetPitch) / 12)
    ledPitch = targetPitch + (octaveDiff * 12)

    // Ensure within range
    if (ledPitch < range.min) ledPitch += 12
    if (ledPitch > range.max) ledPitch -= 12

    // Prefer stepwise motion when possible
    const interval = Math.abs(ledPitch - prevPitch)
    if (interval > 5) {
      // Try to find closer alternative
      const alternative1 = ledPitch - 12
      const alternative2 = ledPitch + 12

      if (alternative1 >= range.min && Math.abs(alternative1 - prevPitch) < interval) {
        ledPitch = alternative1
      } else if (alternative2 <= range.max && Math.abs(alternative2 - prevPitch) < interval) {
        ledPitch = alternative2
      }
    }

    return ledPitch
  }

  generateDuration(activity, index, total) {
    // Generate note duration with variation based on activity level
    const random = Math.random()

    switch (activity) {
      case 'high':
        // Fast, varied: mix of 16th, 8th, quarter notes
        const fastDurations = [0.25, 0.5, 0.75, 1.0]
        return fastDurations[Math.floor(random * fastDurations.length)]
      case 'low':
        // Long, sustained: half notes and whole notes with variation
        return 1.5 + (random * 2.5) // 1.5 to 4.0 beats
      default:
        // Medium: quarter and half notes with syncopation
        const mediumDurations = [0.5, 0.75, 1.0, 1.5, 2.0]
        return mediumDurations[Math.floor(random * mediumDurations.length)]
    }
  }

  generateVelocity(activity) {
    // Generate velocity based on activity
    switch (activity) {
      case 'high': return 90 + Math.random() * 30
      case 'low': return 60 + Math.random() * 20
      default: return 75 + Math.random() * 25
    }
  }

  generateArticulation(activity) {
    // Generate articulation based on activity
    switch (activity) {
      case 'high': return Math.random() > 0.5 ? 'staccato' : 'marcato'
      case 'low': return 'legato'
      default: return 'normal'
    }
  }

  generateDurationByRole(role, index, total) {
    // Role-specific duration generation for STRUCTURE
    switch (role) {
      case 'melody':
        // Fast, varied: 8th and 16th notes
        return [0.25, 0.5, 0.25, 0.75][index % 4]
      case 'harmony':
        // Medium: quarter and half notes
        return [1.0, 1.5, 0.75, 1.0][index % 4]
      case 'bass':
        // Long: whole notes and half notes
        return [3.0, 4.0, 2.0][index % 3]
      case 'pad':
        // Very long: sustained notes
        return [6.0, 8.0][index % 2]
      default:
        return 1.0
    }
  }

  generateArticulationByRole(role) {
    // Role-specific articulation for TIMBRAL DISTINCTION
    switch (role) {
      case 'melody':
        return Math.random() < 0.7 ? 'staccato' : 'normal'  // Bright, detached
      case 'harmony':
        return 'normal'                                      // Standard
      case 'bass':
        return 'legato'                                      // Smooth, connected
      case 'pad':
        return 'legato'                                      // Sustained, flowing
      default:
        return 'normal'
    }
  }

  generateGapByRole(role) {
    // Role-specific gaps for PIENI/VUOTI (full/empty sections)
    switch (role) {
      case 'melody':
        return Math.random() * 0.25  // Tight spacing - continuous
      case 'harmony':
        return 0.5 + Math.random() * 0.5  // Medium spacing
      case 'bass':
        return 1.0 + Math.random() * 2.0  // Wide spacing - allows silence
      case 'pad':
        return 2.0 + Math.random() * 4.0  // Very wide spacing - creates vuoti
      default:
        return Math.random() * 1.0
    }
  }

  validateVoiceLeading(voices) {
    // Validate voice leading rules across multiple voices
    if (voices.length < 2) return { isValid: true, errors: [] }

    const errors = []
    const maxNotes = Math.max(...voices.map(v => v.notes.length))

    for (let i = 0; i < maxNotes; i++) {
      const chordNotes = voices.map(voice => voice.notes[i] || voice.notes[voice.notes.length - 1])
      const pitches = chordNotes.map(note => note.pitch).filter(p => p !== undefined)

      if (pitches.length < 2) continue

      // Check for parallel perfect intervals
      if (i > 0) {
        const prevChordNotes = voices.map(voice => voice.notes[i-1] || voice.notes[0])
        const prevPitches = prevChordNotes.map(note => note.pitch).filter(p => p !== undefined)

        const parallelErrors = this.checkParallelIntervals(prevPitches, pitches)
        errors.push(...parallelErrors)
      }

      // Check voice crossings
      const crossingErrors = this.checkVoiceCrossings(pitches, voices.map(v => v.voiceType))
      errors.push(...crossingErrors)

      // Check spacing
      const spacingErrors = this.checkVoiceSpacing(pitches, voices.map(v => v.voiceType))
      errors.push(...spacingErrors)
    }

    return {
      isValid: errors.length === 0,
      errors,
      voiceCount: voices.length,
      recommendations: this.generateRecommendations(errors)
    }
  }

  checkParallelIntervals(prevPitches, currentPitches) {
    const errors = []

    // Create all interval pairs between voices
    for (let i = 0; i < prevPitches.length; i++) {
      for (let j = i + 1; j < prevPitches.length; j++) {
        const prevInterval = Math.abs(prevPitches[j] - prevPitches[i]) % 12
        const currInterval = Math.abs(currentPitches[j] - currentPitches[i]) % 12

        // Check for parallel perfect fifths and octaves
        if ((prevInterval === 7 && currInterval === 7) || // Parallel P5
            (prevInterval === 0 && currInterval === 0)) { // Parallel P8 (unison)
          errors.push({
            type: 'parallel_perfect_interval',
            voices: [i, j],
            interval: prevInterval === 7 ? 'perfect_fifth' : 'octave',
            beat: 'current'
          })
        }
      }
    }

    return errors
  }

  checkVoiceCrossings(pitches, voiceTypes) {
    const errors = []
    const voicedPitches = pitches.map((pitch, i) => ({ pitch, voice: voiceTypes[i] }))

    // Sort by pitch to check crossing
    const sorted = [...voicedPitches].sort((a, b) => a.pitch - b.pitch)

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i]
      const next = sorted[i + 1]

      // Check if lower voice is above higher voice
      const currentVoiceIndex = voiceTypes.indexOf(current.voice)
      const nextVoiceIndex = voiceTypes.indexOf(next.voice)

      if (currentVoiceIndex > nextVoiceIndex) {
        errors.push({
          type: 'voice_crossing',
          lowerVoice: next.voice,
          upperVoice: current.voice,
          lowerPitch: next.pitch,
          upperPitch: current.pitch
        })
      }
    }

    return errors
  }

  checkVoiceSpacing(pitches, voiceTypes) {
    const errors = []

    // Check for excessive spacing between adjacent voices
    const voicedPitches = pitches.map((pitch, i) => ({ pitch, voice: voiceTypes[i] }))
    const sorted = [...voicedPitches].sort((a, b) => a.pitch - b.pitch)

    for (let i = 0; i < sorted.length - 1; i++) {
      const interval = sorted[i + 1].pitch - sorted[i].pitch

      // Check for intervals larger than an octave between adjacent voices
      if (interval > 12) {
        errors.push({
          type: 'excessive_spacing',
          lowerVoice: sorted[i].voice,
          upperVoice: sorted[i + 1].voice,
          interval: interval
        })
      }

      // Check for extremely small intervals (unison only allowed for bass and tenor)
      if (interval === 0 &&
          !(sorted[i].voice === 'bass' && sorted[i + 1].voice === 'tenor') &&
          !(sorted[i].voice === 'tenor' && sorted[i + 1].voice === 'bass')) {
        errors.push({
          type: 'unison_voices',
          voice1: sorted[i].voice,
          voice2: sorted[i + 1].voice
        })
      }
    }

    return errors
  }

  generateRecommendations(errors) {
    const recommendations = []
    const errorTypes = [...new Set(errors.map(e => e.type))]

    errorTypes.forEach(type => {
      switch (type) {
        case 'parallel_perfect_interval':
          recommendations.push('Avoid parallel perfect fifths and octaves by using contrary motion or breaking the parallelism')
          break
        case 'voice_crossing':
          recommendations.push('Maintain proper voice order - avoid lower voices crossing above upper voices')
          break
        case 'excessive_spacing':
          recommendations.push('Keep adjacent voices within an octave of each other for better blend')
          break
        case 'unison_voices':
          recommendations.push('Limit unison intervals to bass and tenor voices only')
          break
      }
    })

    return recommendations
  }

  calculatePan(voiceIndex, totalVoices) {
    // Calculate stereo pan position for voice
    if (totalVoices === 1) return 0.5 // Center

    // Even distribution across stereo field
    const spacing = 1 / (totalVoices + 1)
    return spacing * (voiceIndex + 1)
  }

  selectTimbre(material, style) {
    // Select appropriate timbre based on material and style
    const genreWeights = style.genreWeights || {}

    if (genreWeights.classical > 0.7) {
      return this.selectClassicalTimbre(material)
    } else if (genreWeights.jazz > 0.7) {
      return this.selectJazzTimbre(material)
    } else if (genreWeights.electronic > 0.7) {
      return this.selectElectronicTimbre(material)
    } else if (genreWeights.rock > 0.7) {
      return this.selectRockTimbre(material)
    }

    return 'sawtooth' // Default
  }

  selectClassicalTimbre(material) {
    const activity = material.profile?.activity || 'medium'
    switch (activity) {
      case 'high': return 'string_section'
      case 'low': return 'woodwind'
      default: return 'piano'
    }
  }

  selectJazzTimbre(material) {
    const register = material.profile?.register || 'middle'
    switch (register) {
      case 'high': return 'trumpet'
      case 'low': return 'bass'
      default: return 'saxophone'
    }
  }

  selectElectronicTimbre(material) {
    const activity = material.profile?.activity || 'medium'
    switch (activity) {
      case 'high': return 'synth_lead'
      case 'low': return 'synth_pad'
      default: return 'electric_piano'
    }
  }

  selectRockTimbre(material) {
    const activity = material.profile?.activity || 'medium'
    switch (activity) {
      case 'high': return 'electric_guitar'
      case 'low': return 'bass_guitar'
      default: return 'clean_guitar'
    }
  }

  // Utility method to get interval quality
  getIntervalQuality(interval) {
    const modInterval = interval % 12

    if (this.consonantIntervals.includes(modInterval)) {
      if (modInterval === 0) return 'perfect_unison'
      if (modInterval === 3) return 'minor_third'
      if (modInterval === 4) return 'major_third'
      if (modInterval === 7) return 'perfect_fifth'
      if (modInterval === 9) return 'major_sixth'
      if (modInterval === 12) return 'perfect_octave'
    } else {
      if (modInterval === 1) return 'minor_second'
      if (modInterval === 2) return 'major_second'
      if (modInterval === 5) return 'perfect_fourth'
      if (modInterval === 6) return 'tritone'
      if (modInterval === 8) return 'minor_sixth'
      if (modInterval === 10) return 'minor_seventh'
      if (modInterval === 11) return 'major_seventh'
    }

    return 'unknown'
  }
}

module.exports = CounterpointEngine