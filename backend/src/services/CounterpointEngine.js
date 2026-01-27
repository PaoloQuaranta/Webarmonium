const { PHI } = require('../utils/constants')
const { applyVoiceRole, VOICE_ROLE_MODIFIERS } = require('../composition/FormDefinitions')
const {
  getGenreCharacteristics,
  getVoiceConfig,
  getRoleDensity,
  getDurationPool,
  getDuration,
  getArticulation,
  getSwingAmount,
  getSyncopation
} = require('../utils/GenreCharacteristics')

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

  /**
   * Create a voice with section-aware parameters
   * Uses SectionContext for dynamic level, articulation, and register adjustments
   * Entry #180: Added genre parameter for genre-aware voice generation
   * @param {Object} material - Musical material
   * @param {number} voiceIndex - Voice index (0=soprano, 1=alto, 2=tenor, 3=bass)
   * @param {Array} progression - Harmonic progression
   * @param {number} compositionCount - Composition count for temporal variation
   * @param {Object} sectionContext - Optional SectionContext for section-aware generation
   * @param {string} genre - Optional genre for genre-specific voice characteristics
   * @returns {Object} Voice with notes and metadata
   */
  createVoice(material, voiceIndex, progression, compositionCount = 0, sectionContext = null, genre = 'melodic', sectionLength = 8) {
    // Store genre for use in other methods
    this._currentGenre = genre

    // If we have a SectionContext, use section-aware voice creation
    if (sectionContext) {
      return this.createVoiceWithSection(material, voiceIndex, progression, compositionCount, sectionContext, genre, sectionLength)
    }

    // Entry #180: Get genre-aware voice role
    const voiceRole = this.getVoiceRole(voiceIndex, genre)

    // Entry #180: Check if this voice should be created for this genre
    const voiceConfig = getVoiceConfig(genre)
    if (voiceIndex >= voiceConfig.voiceCount) {
      // This genre doesn't need this many voices - return minimal voice
      return null
    }

    const voiceType = voiceRole.type
    const range = this.voiceRanges[voiceType]

    // Analyze material for melodic characteristics
    const melodicProfile = this.analyzeMaterialForVoice(material)

    // Override profile with role-specific characteristics (now genre-aware)
    melodicProfile.role = voiceRole.name
    melodicProfile.density = voiceRole.density
    melodicProfile.noteLength = voiceRole.noteLength
    melodicProfile.activity = voiceRole.activity
    melodicProfile.genre = genre

    // Generate voice based on role (pass compositionCount for temporal variation - Entry #114)
    // Entry #202: Pass sectionLength to spread notes across full duration
    const voiceNotes = this.generateVoiceNotes(material, range, melodicProfile, progression, compositionCount, sectionLength)

    return {
      voiceType,
      voiceRole: voiceRole.name,
      userId: material.userId,
      notes: voiceNotes,
      range: range,
      character: melodicProfile,
      voiceIndex: voiceIndex,
      timbre: voiceRole.timbre,
      genre: genre
    }
  }

  /**
   * Create a voice with section-aware parameters from SectionContext
   * Applies voice role modifiers and section parameters for coherent musical texture
   * Entry #180: Added genre parameter for genre-specific voice characteristics
   * @param {Object} material - Musical material
   * @param {number} voiceIndex - Voice index
   * @param {Array} progression - Harmonic progression
   * @param {number} compositionCount - Composition count
   * @param {Object} sectionContext - SectionContext with section parameters
   * @param {string} genre - Genre for genre-specific voice characteristics
   * @returns {Object} Voice with notes and metadata
   */
  createVoiceWithSection(material, voiceIndex, progression, compositionCount, sectionContext, genre = 'melodic', sectionLength = 8) {
    // Entry #180: Get genre-aware voice role
    const voiceRole = this.getVoiceRole(voiceIndex, genre)

    // Entry #180: Check if this voice should be created for this genre
    const voiceConfig = getVoiceConfig(genre)
    if (voiceIndex >= voiceConfig.voiceCount) {
      return null // This genre doesn't need this many voices
    }
    const voiceType = voiceRole.type

    // Apply voice role modifiers to section context
    const voiceContext = sectionContext.forVoice ?
      sectionContext.forVoice(voiceType) :
      applyVoiceRole(sectionContext, voiceType)

    // Get section-adjusted range from register parameters
    const registerParams = voiceContext.getRegisterParams ?
      voiceContext.getRegisterParams() :
      this._getRegisterFromContext(voiceContext, voiceType)

    const range = {
      min: Math.max(this.voiceRanges[voiceType].min, registerParams.min),
      max: Math.min(this.voiceRanges[voiceType].max, registerParams.max)
    }

    // Analyze material for melodic characteristics
    const melodicProfile = this.analyzeMaterialForVoice(material)

    // Apply section parameters to profile
    melodicProfile.role = voiceRole.name
    melodicProfile.density = this._densityFromSection(voiceContext.rhythmicDensity, voiceRole)
    melodicProfile.noteLength = this._noteLengthFromSection(voiceContext.rhythmicDensity, voiceRole)
    melodicProfile.activity = this._activityFromSection(voiceContext.dynamicLevel, voiceRole)
    melodicProfile.genre = genre

    // Section-aware articulation (Entry #180: prefer genre articulation)
    melodicProfile.articulationStyle = getArticulation(genre) || voiceContext.articulationStyle || voiceRole.timbre

    // Generate voice based on role with section context
    // Entry #202: Pass sectionLength to spread notes across full duration
    const voiceNotes = this.generateVoiceNotesWithSection(
      material, range, melodicProfile, progression, compositionCount, voiceContext, sectionLength
    )

    return {
      voiceType,
      voiceRole: voiceRole.name,
      userId: material.userId,
      notes: voiceNotes,
      range: range,
      character: melodicProfile,
      voiceIndex: voiceIndex,
      timbre: voiceRole.timbre,
      genre: genre,
      sectionParams: {
        dynamicLevel: voiceContext.dynamicLevel,
        harmonicTension: voiceContext.harmonicTension,
        developmentTechnique: voiceContext.developmentTechnique,
        thematicRole: voiceContext.thematicRole
      }
    }
  }

  /**
   * Get register parameters from voice context when getRegisterParams is not available
   */
  _getRegisterFromContext(voiceContext, voiceType) {
    const baseRange = this.voiceRanges[voiceType]
    const registerCenter = voiceContext.registerCenter ?? 0.5
    const registerSpread = voiceContext.registerSpread ?? 0.5

    const fullRange = { min: 36, max: 96 }
    const rangeSize = (fullRange.max - fullRange.min) * registerSpread
    const centerNote = fullRange.min + (fullRange.max - fullRange.min) * registerCenter

    return {
      min: Math.max(baseRange.min, Math.round(centerNote - rangeSize / 2)),
      max: Math.min(baseRange.max, Math.round(centerNote + rangeSize / 2)),
      center: Math.round(centerNote)
    }
  }

  /**
   * Calculate density string from section rhythmic density and voice role
   */
  _densityFromSection(rhythmicDensity, voiceRole) {
    // Voice role provides base density modifier
    const roleModifiers = {
      melody: 1.2,
      harmony: 0.8,
      bass: 0.5,
      pad: 0.3
    }
    const modifier = roleModifiers[voiceRole.name] || 1.0
    const effectiveDensity = rhythmicDensity * modifier

    if (effectiveDensity > 0.7) return 'high'
    if (effectiveDensity > 0.4) return 'medium'
    if (effectiveDensity > 0.2) return 'low'
    return 'sparse'
  }

  /**
   * Calculate note length from section density and voice role
   */
  _noteLengthFromSection(rhythmicDensity, voiceRole) {
    // Inverse relationship: higher density = shorter notes
    const roleLengthBias = {
      melody: -0.2,    // Tends shorter
      harmony: 0,      // Neutral
      bass: 0.2,       // Tends longer
      pad: 0.4         // Much longer
    }
    const bias = roleLengthBias[voiceRole.name] || 0
    const effectiveLength = (1 - rhythmicDensity) + bias

    if (effectiveLength > 0.7) return 'verylong'
    if (effectiveLength > 0.5) return 'long'
    if (effectiveLength > 0.3) return 'medium'
    return 'short'
  }

  /**
   * Calculate activity level from dynamic level and voice role
   */
  _activityFromSection(dynamicLevel, voiceRole) {
    const roleActivityBias = {
      melody: 0.2,     // More active
      harmony: 0,      // Neutral
      bass: -0.1,      // Less active
      pad: -0.2        // Much less active
    }
    const bias = roleActivityBias[voiceRole.name] || 0
    const effectiveActivity = dynamicLevel + bias

    if (effectiveActivity > 0.7) return 'high'
    if (effectiveActivity > 0.4) return 'medium'
    return 'low'
  }

  /**
   * Generate voice notes with section context awareness
   * Entry #202: Added sectionLength parameter to spread notes across full duration
   */
  generateVoiceNotesWithSection(material, range, profile, progression, compositionCount, voiceContext, sectionLength = 8) {
    const voiceNotes = []

    // Entry #202: Calculate total beats from sectionLength (bars * 4 beats per bar)
    const totalBeats = sectionLength * 4

    // Extract chord tones from progression
    const chordTones = this._extractChordTonesFromProgression(progression, range)

    // Store compositionCount for temporal variation
    this._currentCompositionCount = compositionCount

    // Get section parameters
    const dynamicLevel = voiceContext.dynamicLevel ?? 0.5
    const velocityParams = voiceContext.getVelocityParams ?
      voiceContext.getVelocityParams() :
      { baseVelocity: 40 + dynamicLevel * 80, variation: 15 }

    const articulationStyle = voiceContext.articulationStyle || 'portato'

    if (material.notes && material.notes.length > 0) {
      // Adapt existing material with section parameters
      const compCount = this._currentCompositionCount || 0
      const temporalOffset = (compCount * PHI) % 1
      const transposeInterval = Math.floor(temporalOffset * 5) - 2
      const noteCount = material.notes.length

      // Entry #203: Create phrase clusters instead of evenly distributed single notes
      const numPhrases = noteCount >= 6 ? 3 : (noteCount >= 4 ? 2 : 1)
      const notesPerPhrase = Math.ceil(noteCount / numPhrases)

      material.notes.forEach((note, i) => {
        const transposedPitch = note.pitch + transposeInterval
        let adaptedPitch = this.adaptPitchToRange(transposedPitch, range, profile)

        if (i > 0) {
          const prevNote = voiceNotes[i-1]
          adaptedPitch = this.applyVoiceLeading(prevNote.pitch, adaptedPitch, range)
        }

        // Section-aware duration
        const baseDuration = note.duration || 1
        const densityFactor = 1.5 - (voiceContext.rhythmicDensity || 0.5) // Higher density = shorter
        const durationVariation = 0.8 + (((i * PHI) + temporalOffset) % 1) * 0.4
        const duration = baseDuration * durationVariation * densityFactor

        // Section-aware velocity
        const baseVel = velocityParams.baseVelocity
        const velVariation = Math.sin((i / noteCount) * Math.PI) * velocityParams.variation
        const velocity = Math.round(Math.max(30, Math.min(127, baseVel + velVariation)))

        // Entry #203: Calculate phrase-clustered timing
        const phraseIndex = Math.floor(i / notesPerPhrase)
        const noteIndexInPhrase = i % notesPerPhrase
        const phraseStartBeat = (phraseIndex / numPhrases) * totalBeats
        const noteGap = duration + 0.25
        const startBeat = phraseStartBeat + (noteIndexInPhrase * noteGap)

        voiceNotes.push({
          pitch: adaptedPitch,
          duration: duration,
          velocity: velocity,
          articulation: articulationStyle,
          startBeat: startBeat
        })
      })
    } else {
      // Generate new voice based on role with section parameters
      const role = profile.role || 'melody'

      // Note count influenced by section density
      const baseCounts = { melody: 8, harmony: 5, bass: 3, pad: 2 }
      const densityMultiplier = 0.5 + (voiceContext.rhythmicDensity || 0.5) * 1.0
      const noteCount = Math.round((baseCounts[role] || 5) * densityMultiplier)

      // Entry #203: Create phrase clusters instead of evenly distributed single notes
      const numPhrases = noteCount >= 6 ? 3 : (noteCount >= 4 ? 2 : 1)
      const notesPerPhrase = Math.ceil(noteCount / numPhrases)

      for (let i = 0; i < noteCount; i++) {
        let pitch = this.generatePitchFromChordTones(chordTones, range, profile, i, noteCount, role)

        if (i > 0) {
          const prevNote = voiceNotes[i-1]
          pitch = this.applyVoiceLeading(prevNote.pitch, pitch, range)
        }

        const duration = this.generateDurationByRoleWithSection(role, i, noteCount, voiceContext)

        // Section-aware velocity
        const position = i / noteCount
        const velCurve = this._getVelocityCurve(voiceContext.dynamicContour, position)
        const velocity = Math.round(velocityParams.baseVelocity * velCurve)

        // Entry #203: Calculate phrase-clustered timing
        const phraseIndex = Math.floor(i / notesPerPhrase)
        const noteIndexInPhrase = i % notesPerPhrase
        const phraseStartBeat = (phraseIndex / numPhrases) * totalBeats
        const noteGap = duration + 0.25
        const startBeat = phraseStartBeat + (noteIndexInPhrase * noteGap)

        voiceNotes.push({
          pitch,
          duration: duration,
          velocity: Math.max(30, Math.min(127, velocity)),
          articulation: articulationStyle,
          startBeat: startBeat
        })
      }
    }

    return voiceNotes
  }

  /**
   * Get velocity curve multiplier based on dynamic contour
   */
  _getVelocityCurve(contour, position) {
    switch (contour) {
      case 'crescendo':
        return 0.7 + position * 0.5 // 0.7 to 1.2
      case 'diminuendo':
        return 1.2 - position * 0.5 // 1.2 to 0.7
      case 'terraced':
        return 0.8 + Math.floor(position * 3) * 0.15 // Step increases
      default:
        // Stable with slight arch
        return 0.9 + Math.sin(position * Math.PI) * 0.2
    }
  }

  /**
   * Generate duration by role with section context
   */
  generateDurationByRoleWithSection(role, index, total, voiceContext) {
    const baseDuration = this.generateDurationByRole(role, index, total)

    // Adjust based on section rhythmic density
    const densityFactor = 1.5 - (voiceContext.rhythmicDensity || 0.5)

    // Development sections may have more varied durations
    if (voiceContext.thematicRole === 'development') {
      const variationFactor = 0.7 + (((index * PHI) + (this._currentCompositionCount || 0) * PHI) % 1) * 0.6
      return baseDuration * densityFactor * variationFactor
    }

    return baseDuration * densityFactor
  }

  /**
   * Get voice role configuration - now genre-aware (Entry #180)
   * @param {number} voiceIndex - Voice index
   * @param {string} genre - Genre for genre-specific roles
   * @returns {Object} Voice role configuration
   */
  getVoiceRole(voiceIndex, genre = 'melodic') {
    // Entry #180: Get genre-specific voice configuration
    const genreConfig = getVoiceConfig(genre)
    const genreRoles = genreConfig.roles || ['melody', 'harmony', 'bass', 'pad']

    // Get the role name for this voice index
    const roleName = genreRoles[voiceIndex % genreRoles.length]

    // Get genre-specific density for this role
    const density = getRoleDensity(genre, roleName)

    // Map role names to voice types
    const roleToVoiceType = {
      melody: 'soprano',
      harmony: 'alto',
      alto: 'alto',
      comping: 'alto',
      powerchord: 'alto',
      rhythm: 'alto',
      tenor: 'tenor',
      bass: 'bass',
      pad: 'tenor',
      texture: 'tenor',
      arpeggio: 'soprano',
      noise: 'bass'
    }

    // Map density values to descriptive strings
    const densityToString = (d) => {
      if (d >= 0.8) return 'high'
      if (d >= 0.6) return 'medium-high'
      if (d >= 0.4) return 'medium'
      if (d >= 0.2) return 'low'
      return 'sparse'
    }

    // Map density to note length
    const densityToNoteLength = (d, genre) => {
      // Genre-specific adjustments
      if (genre === 'ambient') return d > 0.5 ? 'long' : 'verylong'
      if (genre === 'electronic') return d > 0.5 ? 'short' : 'medium'
      if (genre === 'rock') return d > 0.7 ? 'short' : 'medium'

      // Default mapping
      if (d >= 0.7) return 'short'
      if (d >= 0.4) return 'medium'
      if (d >= 0.2) return 'long'
      return 'verylong'
    }

    // Map density to activity
    const densityToActivity = (d) => {
      if (d >= 0.7) return 'high'
      if (d >= 0.4) return 'medium'
      return 'low'
    }

    // Map role to timbre
    const roleToTimbre = {
      melody: 'bright',
      harmony: 'warm',
      alto: 'warm',
      comping: 'warm',
      powerchord: 'bright',
      rhythm: 'bright',
      tenor: 'soft',
      bass: 'deep',
      pad: 'soft',
      texture: 'soft',
      arpeggio: 'bright',
      noise: 'deep'
    }

    const voiceType = roleToVoiceType[roleName] || 'alto'

    return {
      name: roleName,
      type: voiceType,
      density: densityToString(density),
      densityValue: density, // Numeric value for calculations
      noteLength: densityToNoteLength(density, genre),
      activity: densityToActivity(density),
      timbre: roleToTimbre[roleName] || 'warm',
      genre: genre
    }
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

  generateVoiceNotes(material, range, profile, progression, compositionCount = 0, sectionLength = 8) {
    const voiceNotes = []

    // Entry #202: Calculate total beats from sectionLength (bars * 4 beats per bar)
    const totalBeats = sectionLength * 4

    // Extract chord tones from progression for harmonic context
    const chordTones = this._extractChordTonesFromProgression(progression, range)

    // Store compositionCount for temporal variation in pitch generation
    this._currentCompositionCount = compositionCount

    if (material.notes && material.notes.length > 0) {
      // Adapt existing material to voice range
      // Entry #117: Add temporal variation even when using existing material
      const compCount = this._currentCompositionCount || 0
      const temporalOffset = (compCount * PHI) % 1
      // Variation: transpose material by interval based on compositionCount
      const transposeInterval = Math.floor(temporalOffset * 5) - 2 // -2 to +2 semitones

      const noteCount = material.notes.length

      // Entry #203: Create phrase clusters instead of evenly distributed single notes
      // Divide notes into 2-3 phrases, each phrase has consecutive notes
      const numPhrases = noteCount >= 6 ? 3 : (noteCount >= 4 ? 2 : 1)
      const notesPerPhrase = Math.ceil(noteCount / numPhrases)

      material.notes.forEach((note, i) => {
        // Entry #117: Apply transposition for variation across compositions
        const transposedPitch = note.pitch + transposeInterval
        let adaptedPitch = this.adaptPitchToRange(transposedPitch, range, profile)

        // Apply voice leading principles
        if (i > 0) {
          const prevNote = voiceNotes[i-1]
          adaptedPitch = this.applyVoiceLeading(prevNote.pitch, adaptedPitch, range)
        }

        // Entry #117: Vary duration slightly with temporal offset
        const baseDuration = note.duration || 1
        const durationVariation = 0.8 + (((i * PHI) + temporalOffset) % 1) * 0.4 // 0.8-1.2x
        const duration = baseDuration * durationVariation

        // Entry #203: Calculate phrase-clustered timing
        // Which phrase is this note in?
        const phraseIndex = Math.floor(i / notesPerPhrase)
        const noteIndexInPhrase = i % notesPerPhrase
        // Phrase starts are distributed across section
        const phraseStartBeat = (phraseIndex / numPhrases) * totalBeats
        // Notes within phrase are consecutive with small gaps
        const noteGap = duration + 0.25
        const startBeat = phraseStartBeat + (noteIndexInPhrase * noteGap)

        voiceNotes.push({
          pitch: adaptedPitch,
          duration: duration,
          velocity: note.velocity || 80,
          articulation: note.articulation || 'normal',
          startBeat: startBeat
        })
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

      // Entry #203: Create phrase clusters instead of evenly distributed single notes
      const numPhrases = noteCount >= 6 ? 3 : (noteCount >= 4 ? 2 : 1)
      const notesPerPhrase = Math.ceil(noteCount / numPhrases)

      for (let i = 0; i < noteCount; i++) {
        // Use chord tones with PHI-based selection for harmonic coherence
        let pitch = this.generatePitchFromChordTones(chordTones, range, profile, i, noteCount, role)

        if (i > 0) {
          const prevNote = voiceNotes[i-1]
          pitch = this.applyVoiceLeading(prevNote.pitch, pitch, range)
        }

        const duration = this.generateDurationByRole(role, i, noteCount)

        // Entry #203: Calculate phrase-clustered timing
        const phraseIndex = Math.floor(i / notesPerPhrase)
        const noteIndexInPhrase = i % notesPerPhrase
        const phraseStartBeat = (phraseIndex / numPhrases) * totalBeats
        const noteGap = duration + 0.25
        const startBeat = phraseStartBeat + (noteIndexInPhrase * noteGap)

        voiceNotes.push({
          pitch,
          duration: duration,
          velocity: this.generateVelocity(profile.activity, i, noteCount),
          articulation: this.generateArticulationByRole(role, i),
          startBeat: startBeat
        })
      }
    }

    return voiceNotes
  }

  /**
   * Extract chord tones from progression, transposed to voice range
   * @param {Array} progression - Harmonic progression
   * @param {Object} range - Voice range {min, max}
   * @returns {Array} - Array of available chord tones within range
   */
  _extractChordTonesFromProgression(progression, range) {
    const chordTones = new Set()

    if (!progression || progression.length === 0) {
      // Default to C major triad if no progression
      const defaultTones = [0, 4, 7] // C, E, G (scale degrees)
      defaultTones.forEach(tone => {
        for (let octave = -2; octave <= 2; octave++) {
          const pitch = 60 + tone + (octave * 12) // C4 = 60
          if (pitch >= range.min && pitch <= range.max) {
            chordTones.add(pitch)
          }
        }
      })
    } else {
      // Extract all chord tones from progression
      // Entry #117 FIX: Notes are pitch classes (0-11), need to add base octave (C4=60)
      progression.forEach(chord => {
        if (chord.notes && Array.isArray(chord.notes)) {
          chord.notes.forEach(note => {
            // Normalize note to pitch class (0-11)
            const pitchClass = note % 12
            // Transpose to all octaves within range, starting from C4 (MIDI 60)
            for (let octave = -2; octave <= 2; octave++) {
              const pitch = 60 + pitchClass + (octave * 12)
              if (pitch >= range.min && pitch <= range.max) {
                chordTones.add(pitch)
              }
            }
          })
        }
      })
    }

    return Array.from(chordTones).sort((a, b) => a - b)
  }

  /**
   * Generate pitch from chord tones with PHI-based variation
   * Different roles emphasize different chord tones
   * Uses compositionCount for temporal variation across compositions
   * @param {Array} chordTones - Available chord tones
   * @param {Object} range - Voice range
   * @param {Object} profile - Voice profile
   * @param {number} index - Note index in phrase
   * @param {number} total - Total notes in phrase
   * @param {string} role - Voice role (melody, harmony, bass, pad)
   * @returns {number} - MIDI pitch
   */
  generatePitchFromChordTones(chordTones, range, profile, index, total, role) {
    if (!chordTones || chordTones.length === 0) {
      // Fallback to old method if no chord tones
      return this.generatePitchForVoice(range, profile, index, total)
    }

    const { min, max } = range
    const rangeCenter = (min + max) / 2

    // Temporal variation: compositionCount shifts selection across compositions
    // This ensures successive compositions produce different note sequences
    const compCount = this._currentCompositionCount || 0
    const temporalOffset = (compCount * PHI) % 1

    // Role-specific pitch selection strategy
    switch (role) {
      case 'bass': {
        // Bass emphasizes roots (lowest chord tones) with occasional fifths
        // PHI stepping + temporalOffset determines which chord tone to use
        const bassWeight = ((index * PHI) + temporalOffset) % 1
        // Select from lower portion of available tones
        const lowerTones = chordTones.filter(t => t <= rangeCenter)
        if (lowerTones.length > 0) {
          // Temporal offset shifts which tone is selected each composition
          const selectedIndex = Math.floor(bassWeight * lowerTones.length)
          return lowerTones[selectedIndex]
        }
        // Fallback if no lower tones available
        const toneIndex = Math.floor(bassWeight * Math.min(2, chordTones.length))
        return chordTones[toneIndex]
      }

      case 'pad': {
        // Pad holds sustained chord tones, mostly 3rds and 5ths
        // Very slow movement, PHI + temporal offset selects which chord tone
        const padSelector = ((index * PHI) + temporalOffset * 0.5) % 1
        const padIndex = Math.floor(padSelector * chordTones.length)
        return chordTones[padIndex]
      }

      case 'harmony': {
        // Harmony fills in with chord tones, avoiding melody range
        // PHI + index + temporal creates varied selection
        const harmonySelector = ((index * PHI) + (total * PHI * 0.5) + temporalOffset) % 1
        const harmonyIndex = Math.floor(harmonySelector * chordTones.length)
        return chordTones[harmonyIndex]
      }

      case 'melody':
      default: {
        // Melody uses chord tones with passing tones (neighbors)
        // More movement and variation using PHI + contour + temporal
        // Entry #117: Fixed melodic shape variation across compositions

        // Base: select chord tone using PHI + temporal offset
        // CRITICAL FIX: temporalOffset must MULTIPLY with index to change melody SHAPE
        // AND add base offset so first note (index=0) also varies
        const phiVaried = PHI + (temporalOffset * 0.5) // PHI varies 1.618 to 1.868
        // FIX: Add temporalOffset as BASE so index=0 doesn't always give 0
        const melodicSelector = (temporalOffset + (index * phiVaried) + (index * temporalOffset * 0.3)) % 1
        const baseIndex = Math.floor(melodicSelector * chordTones.length)
        let pitch = chordTones[baseIndex]

        // Add contour variation: sine curve with PHI-modulated frequency
        // Temporal offset also modifies frequency AND amplitude for different contour shapes
        const contourFreq = 1 + (((total * PHI) + temporalOffset) % 1) * 1.0 // 1.0-2.0 (was 0.5)
        const position = index / Math.max(1, total - 1)
        // Entry #117: Increased contour range from ±3 to ±5 for more dramatic melodic shapes
        const contourAmplitude = 3 + (temporalOffset * 4) // 3-7 semitones based on composition
        const contourOffset = Math.sin(position * Math.PI * contourFreq) * contourAmplitude

        // Apply contour as chromatic offset, then snap to nearest chord tone
        const targetPitch = pitch + Math.round(contourOffset)
        pitch = this._snapToNearestChordTone(targetPitch, chordTones, range)

        return pitch
      }
    }
  }

  /**
   * Snap a pitch to the nearest available chord tone within range
   */
  _snapToNearestChordTone(targetPitch, chordTones, range) {
    if (!chordTones || chordTones.length === 0) return targetPitch

    let closest = chordTones[0]
    let minDist = Math.abs(targetPitch - closest)

    for (const tone of chordTones) {
      const dist = Math.abs(targetPitch - tone)
      if (dist < minDist) {
        minDist = dist
        closest = tone
      }
    }

    // Ensure within range
    while (closest < range.min) closest += 12
    while (closest > range.max) closest -= 12

    return closest
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
        // DERIVATION: pitch based on position in phrase (center-weighted distribution)
        const positionOffset = Math.sin((index / total) * Math.PI) * rangeSize * 0.2
        basePitch = min + rangeSize * 0.5 + positionOffset
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
    // DERIVATION: uses note position and total for deterministic variation

    switch (activity) {
      case 'high':
        // Fast, varied: mix of 16th, 8th, quarter notes
        const fastDurations = [0.25, 0.5, 0.75, 1.0]
        // DERIVATION: position determines duration selection
        return fastDurations[index % fastDurations.length]
      case 'low':
        // Long, sustained: half notes and whole notes with variation
        // DERIVATION: position within phrase determines length
        const lowPosition = index / total
        return 1.5 + (lowPosition * 2.5) // 1.5 to 4.0 beats based on position
      default:
        // Medium: quarter and half notes with syncopation
        const mediumDurations = [0.5, 0.75, 1.0, 1.5, 2.0]
        // DERIVATION: position determines duration selection
        return mediumDurations[index % mediumDurations.length]
    }
  }

  generateVelocity(activity, noteIndex = 0, totalNotes = 1) {
    // Generate velocity based on activity
    // DERIVATION: uses position to create natural dynamic contour

    // Guard against divide-by-zero
    if (totalNotes === 0) return 80 // Default velocity

    const position = noteIndex / totalNotes
    // Create varied arch contours - PHI stepping gives continuous frequency spectrum (1.0-1.5)
    // Avoids the low-cardinality problem of totalNotes % 3 (only 3 values)
    const freqVariation = ((totalNotes * PHI) % 1) * 0.5 // 0.0 to 0.5
    const freq = 1 + freqVariation // 1.0 to 1.5, non-repeating
    const dynamicCurve = Math.sin(position * Math.PI * freq) * 0.5 + 0.5 // 0.5 to 1.0

    switch (activity) {
      case 'high':
        // Base 90-120, modulated by position
        return Math.round(90 + dynamicCurve * 30)
      case 'low':
        // Base 60-80, modulated by position
        return Math.round(60 + dynamicCurve * 20)
      default:
        // Base 75-100, modulated by position
        return Math.round(75 + dynamicCurve * 25)
    }
  }

  generateArticulation(activity, noteIndex = 0) {
    // Generate articulation based on activity
    // DERIVATION: uses note index for deterministic alternation
    switch (activity) {
      case 'high':
        // Alternate between staccato and marcato based on position
        return noteIndex % 2 === 0 ? 'staccato' : 'marcato'
      case 'low': return 'legato'
      default: return 'normal'
    }
  }

  /**
   * Generate duration based on role - now genre-aware (Entry #180)
   * @param {string} role - Voice role
   * @param {number} index - Note index
   * @param {number} total - Total notes
   * @returns {number} Duration value
   */
  generateDurationByRole(role, index, total) {
    // Entry #180: Use genre-specific duration pools
    const genre = this._currentGenre || 'melodic'
    const compCount = this._currentCompositionCount || 0

    // Get duration from GenreCharacteristics
    const duration = getDuration(genre, role, index, compCount)

    // Entry #180b: Strict validation - must be a positive finite number
    if (typeof duration === 'number' && isFinite(duration) && duration > 0) {
      return duration
    }

    // Log warning for debugging
    console.warn(`CounterpointEngine: Invalid duration from genre ${genre}, role ${role}: ${duration}`)

    // Fallback: original behavior for backward compatibility
    const safeIndex = index || 0
    const temporalOffset = (compCount * PHI) % 1
    const phiIndex = (arr) => Math.floor(((safeIndex * PHI) + temporalOffset) % 1 * arr.length)

    switch (role) {
      case 'melody':
        const melodyOptions = [0.25, 0.5, 0.25, 0.75, 0.375, 0.625]
        return melodyOptions[phiIndex(melodyOptions)]

      case 'harmony':
        const harmonyOptions = [1.0, 1.5, 0.75, 1.0, 1.25, 0.5]
        return harmonyOptions[phiIndex(harmonyOptions)]

      case 'bass':
        const bassOptions = [3.0, 4.0, 2.0, 2.5, 3.5]
        return bassOptions[phiIndex(bassOptions)]

      case 'pad':
        const padOptions = [6.0, 8.0, 7.0, 5.0, 9.0]
        return padOptions[phiIndex(padOptions)]

      default:
        const position = index / total
        return 0.5 + position * 1.5
    }
  }

  /**
   * Generate articulation by role - now genre-aware (Entry #180)
   * @param {string} role - Voice role
   * @param {number} noteIndex - Note index for variation
   * @returns {string} Articulation type
   */
  generateArticulationByRole(role, noteIndex = 0) {
    // Entry #180: Use genre-specific articulation
    const genre = this._currentGenre || 'melodic'
    const genreArticulation = getArticulation(genre)

    // Genre-specific articulation overrides
    switch (genreArticulation) {
      case 'staccato':
        // Electronic, rhythmic: mostly staccato
        return (noteIndex % 4) === 3 ? 'normal' : 'staccato'

      case 'legato':
        // Ambient, classical: mostly legato
        return role === 'melody' ? 'portato' : 'legato'

      case 'marcato':
        // Rock: accented attacks
        return (noteIndex % 2) === 0 ? 'marcato' : 'normal'

      case 'portato':
        // Jazz: connected but articulated
        return (noteIndex % 3) === 0 ? 'staccato' : 'portato'

      case 'varied':
        // Experimental: mix everything with PHI-based selection for true variation
        // Entry #180b: Use PHI instead of simple modulo for unpredictable, non-repeating patterns
        const options = ['staccato', 'legato', 'normal', 'marcato', 'portato']
        const compCount = this._currentCompositionCount || 0
        // Combine note index and composition count for unique sequence each composition
        const phiIndex = Math.floor(((noteIndex * PHI) + (compCount * PHI * 0.5)) % 1 * options.length)
        return options[phiIndex]

      default:
        // Fallback to role-based articulation
        switch (role) {
          case 'melody':
            return (noteIndex % 4) < 3 ? 'staccato' : 'normal'
          case 'harmony':
          case 'comping':
          case 'powerchord':
            return 'normal'
          case 'bass':
            return 'legato'
          case 'pad':
          case 'texture':
            return 'legato'
          default:
            return 'normal'
        }
    }
  }

  generateGapByRole(role, noteIndex = 0, totalNotes = 1) {
    // Role-specific gaps for PIENI/VUOTI (full/empty sections)
    // DERIVATION: role-specific frequencies create varied gap patterns
    // Entry #117: Added compositionCount temporal variation for different spacing each composition

    // Guard against divide-by-zero
    if (totalNotes === 0) return 0

    const position = noteIndex / totalNotes
    // Entry #117: Add temporal offset to vary gaps across compositions
    const compCount = this._currentCompositionCount || 0
    const temporalOffset = (compCount * PHI) % 1
    // Role-specific frequencies prevent identical patterns across voices
    const roleFreq = { melody: 2, harmony: 3, bass: 1.5, pad: 1 }
    const freq = roleFreq[role] || 2
    // Combine position + temporal offset for variation
    const variationFactor = Math.sin((position + temporalOffset) * Math.PI * freq) * 0.5 + 0.5 // 0-1

    switch (role) {
      case 'melody':
        // Tight spacing - continuous (0-0.25)
        return variationFactor * 0.25
      case 'harmony':
        // Medium spacing (0.5-1.0)
        return 0.5 + variationFactor * 0.5
      case 'bass':
        // Wide spacing - allows silence (1.0-3.0)
        return 1.0 + variationFactor * 2.0
      case 'pad':
        // Very wide spacing - creates vuoti (2.0-6.0)
        return 2.0 + variationFactor * 4.0
      default:
        // Default (0-1.0)
        return variationFactor * 1.0
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
    // Threshold lowered from 0.7 to 0.35 to enable genre-specific timbres with sharpened weights
    const genreWeights = style.genreWeights || {}

    if (genreWeights.classical > 0.35) {
      return this.selectClassicalTimbre(material)
    } else if (genreWeights.jazz > 0.35) {
      return this.selectJazzTimbre(material)
    } else if (genreWeights.electronic > 0.35) {
      return this.selectElectronicTimbre(material)
    } else if (genreWeights.rock > 0.35) {
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