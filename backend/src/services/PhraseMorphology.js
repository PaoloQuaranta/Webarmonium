const { PHI } = require('../utils/constants')
const DevelopmentTechniques = require('../composition/DevelopmentTechniques')

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

  /**
   * Generate phrase from gesture data (original method - kept for backward compatibility)
   * Entry #171: Now accepts webMetrics for contour/rhythm/ornamentation variation
   * Fix #6: Now applies development techniques even when using old code path
   * @param {Object} gestureData - Gesture input
   * @param {Object} musicalContext - Musical context (key, mode, tempo, etc.)
   * @param {Object} sectionContext - Optional SectionContext for section-aware generation
   * @param {Object} webMetrics - Optional web metrics for deterministic variation
   */
  generatePhrase(gestureData, musicalContext, sectionContext = null, webMetrics = null) {
    // If we have a SectionContext and explicit contour, use section-aware generation
    if (sectionContext && gestureData.contour) {
      return this.generatePhraseFromContour(gestureData.contour, musicalContext, sectionContext, gestureData)
    }

    const { velocity, trajectory, curvature, acceleration, intensity } = gestureData
    const { key = 'C', mode = 'major', tempo = 120, currentHarmony } = musicalContext

    // CRITICAL NEW FEATURE: Use gesture duration for phrase duration
    // This creates real-time feedback - phrase duration matches drag duration!
    const gestureDurationMs = gestureData.duration || 1000 // Default 1 second if missing
    const phraseDurationBeats = this.quantizeGestureDuration(gestureDurationMs, tempo)

    // 1. Determine phrase length (note count) based on quantized duration, velocity, and webMetrics
    // Entry #171: webMetrics.hackernews.commentCount affects rhythmic density
    const phraseLength = this.calculatePhraseLengthFromDuration(phraseDurationBeats, velocity, tempo, webMetrics)

    // 2. Select appropriate scale based on mood, mode, and optional section tension
    const harmonicTension = sectionContext?.harmonicTension ?? 0
    const scale = this.selectScaleWithTension(mode, gestureData, harmonicTension)

    // 3. Generate melodic contour from gesture trajectory + webMetrics
    // Entry #171: webMetrics affects contour type and amplitude
    let contour = this.generateMelodicContour(trajectory, curvature, phraseLength, webMetrics)

    // Fix #6: Apply development technique if we have sectionContext
    if (sectionContext && contour && contour.length > 0) {
      const technique = sectionContext.developmentTechnique || 'statement'
      const techniqueOptions = this._getTechniqueOptions(sectionContext, gestureData)
      // Convert contour to expected format {pitch, time, intensity}
      const normalizedContour = contour.map((value, idx) => ({
        pitch: value,
        time: idx / (contour.length - 1 || 1),
        intensity: intensity || 0.5
      }))
      const developedContour = DevelopmentTechniques.applyTechnique(normalizedContour, technique, techniqueOptions)
      // Extract pitch values back
      if (developedContour && developedContour.length > 0) {
        contour = developedContour.map(p => p.pitch)
      }
    }

    // 4. Convert contour to actual pitches
    const pitches = this.contourToPitches(contour, scale, key)

    // 5. Generate rhythm that fits EXACTLY in phraseDurationBeats
    const rhythmParams = sectionContext?.getRhythmParams?.() || {}
    const rhythm = this.generateRhythmForDuration(
      velocity, acceleration, phraseLength, phraseDurationBeats, tempo, curvature,
      rhythmParams.density, rhythmParams.complexity
    )

    // 6. Add ornamentation based on gesture character + webMetrics
    // Entry #171: webMetrics.github affects ornamentation style
    const ornamented = this.applyOrnamentation(pitches, rhythm, gestureData, webMetrics)

    // 7. Generate dynamics (velocity curve) - section-aware if available
    const velocityParams = sectionContext?.getVelocityParams?.() || {}
    const dynamics = this.generateDynamicsWithSection(
      acceleration, velocity, ornamented.length,
      velocityParams.baseVelocity, velocityParams.contour
    )

    // 8. Create articulation pattern - section-aware if available
    const articulationParams = sectionContext?.getArticulationParams?.() || {}
    const articulations = this.generateArticulationsWithSection(
      velocity, curvature, ornamented.length,
      sectionContext?.articulationStyle
    )

    // 9. CRITICAL: Extend rhythm array if ornamentation added extra notes
    const avgDuration = rhythm.length > 0
      ? rhythm.reduce((sum, d) => sum + d, 0) / rhythm.length
      : 0.25
    const ornamentDuration = avgDuration * 0.25
    while (rhythm.length < ornamented.length) {
      rhythm.push(ornamentDuration)
    }

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
        gestureMood: this.analyzeMood(gestureData),
        developmentTechnique: sectionContext?.developmentTechnique || 'statement',
        thematicRole: sectionContext?.thematicRole || 'exposition'
      }
    }
  }

  /**
   * Generate phrase from raw contour with section-aware development techniques
   * This is the NEW section-aware phrase generation method
   *
   * @param {Array} rawContour - Array of {pitch, time, intensity} points (0-1 range)
   * @param {Object} musicalContext - Musical context (key, mode, tempo, etc.)
   * @param {Object} sectionContext - SectionContext with all section parameters
   * @param {Object} gestureMetadata - Optional gesture metadata for additional context
   * @returns {Object} Generated phrase with notes and metadata
   */
  generatePhraseFromContour(rawContour, musicalContext, sectionContext, gestureMetadata = {}) {
    const { key = 'C', mode = 'major', tempo = 120 } = musicalContext

    // 1. Apply development technique to contour BEFORE quantization
    const technique = sectionContext.developmentTechnique || 'statement'
    const techniqueOptions = this._getTechniqueOptions(sectionContext, gestureMetadata)
    const developedContour = DevelopmentTechniques.applyTechnique(rawContour, technique, techniqueOptions)

    // Fix #4: Handle null return from applyTechnique (invalid input)
    if (!developedContour) {
      return null
    }

    // 2. Resample contour to target phrase length
    const rhythmParams = sectionContext.getRhythmParams?.() || { density: 0.5, complexity: 0.3 }
    const targetLength = this._calculateTargetLength(developedContour, rhythmParams.density, tempo)
    const resampledContour = DevelopmentTechniques.resampleContour(developedContour, targetLength)

    // 3. Select scale based on harmonic tension (late binding)
    const harmonicTension = sectionContext.harmonicTension ?? 0.3
    const scale = this.selectScaleWithTension(mode, gestureMetadata, harmonicTension)

    // 4. Quantize contour to scale NOW (late binding)
    const registerParams = sectionContext.getRegisterParams?.() || { min: 48, max: 84, center: 66 }
    const pitches = this._contourToScalePitches(resampledContour, scale, key, registerParams)

    // 5. Generate rhythm from contour timing + section density
    const phraseDurationBeats = this._calculatePhraseDuration(resampledContour, tempo)
    const rhythm = this._generateRhythmFromContour(
      resampledContour, phraseDurationBeats, rhythmParams.density, rhythmParams.complexity
    )

    // 6. Generate dynamics from contour intensity + section parameters
    const velocityParams = sectionContext.getVelocityParams?.() || { baseVelocity: 80, variation: 15, contour: 'stable' }
    const dynamics = this._generateDynamicsFromContour(resampledContour, velocityParams)

    // 7. Generate articulations from section style
    const articulationParams = sectionContext.getArticulationParams?.() || { overlap: 0, gateTime: 0.8 }
    const articulations = this._generateArticulationsFromSection(
      resampledContour.length, sectionContext.articulationStyle || 'portato', articulationParams
    )

    // Fix #8: Removed unused smoothedContour calculation
    // Contour in metadata uses resampledContour directly

    return {
      notes: pitches.map((pitch, i) => ({
        pitch,
        duration: rhythm[i] || 0.5,
        velocity: dynamics[i] || velocityParams.baseVelocity,
        articulation: articulations[i] || 'portato',
        position: i / pitches.length,
        startBeat: this.calculateStartBeat(rhythm, i),
        gateTime: articulationParams.gateTime
      })),
      metadata: {
        scale: scale,
        key: key,
        length: pitches.length,
        tempo: tempo,
        phraseDurationBeats: phraseDurationBeats,
        contour: resampledContour,  // Fix #8: Use resampledContour directly
        developmentTechnique: technique,
        thematicRole: sectionContext.thematicRole || 'exposition',
        harmonicTension: harmonicTension,
        sectionType: sectionContext.sectionType,
        formType: sectionContext.formType
      }
    }
  }

  /**
   * Get technique-specific options based on section context
   */
  _getTechniqueOptions(sectionContext, gestureMetadata) {
    const technique = sectionContext.developmentTechnique || 'statement'
    const progress = sectionContext.progressionPosition || 0

    const baseOptions = {
      complexity: sectionContext.rhythmicComplexity || 0.3
    }

    switch (technique) {
      case 'variation':
        return { ...baseOptions, complexity: 0.3 + progress * 0.4 }

      case 'sequence':
        // Sequence interval based on harmonic function
        const intervals = { tonic: 0.15, dominant: 0.1, predominant: 0.12 }
        return {
          ...baseOptions,
          interval: intervals[sectionContext.harmonicFunction] || 0.1,
          repetitions: Math.floor(2 + progress),
          direction: sectionContext.dynamicContour === 'crescendo' ? 'up' : 'down'
        }

      case 'fragmentation':
        // Fragment type varies with progress
        const fragmentTypes = ['beginning', 'motive', 'end', 'middle']
        const fragmentIndex = Math.floor(progress * fragmentTypes.length)
        return {
          ...baseOptions,
          fragmentType: fragmentTypes[fragmentIndex] || 'beginning',
          fragmentSize: 0.3 + progress * 0.3,
          repeat: progress > 0.5,
          repeatCount: 2
        }

      case 'augmentation':
        return { ...baseOptions, factor: 2.0 - progress * 0.5 }

      case 'diminution':
        return { ...baseOptions, factor: 0.5 + progress * 0.25 }

      case 'inversion':
        // Axis shifts with progress
        return { ...baseOptions, axis: 0.5 + (progress - 0.5) * 0.2 }

      case 'retrograde':
      case 'retrograde_inversion':
        return baseOptions

      default:
        return baseOptions
    }
  }

  /**
   * Calculate target phrase length based on contour and density
   */
  _calculateTargetLength(contour, density, tempo) {
    const baseLength = contour.length
    const densityMultiplier = 0.5 + density * 1.5 // 0.5x to 2x

    // Clamp to reasonable range
    return Math.max(3, Math.min(16, Math.round(baseLength * densityMultiplier)))
  }

  /**
   * Calculate phrase duration in beats from contour
   */
  _calculatePhraseDuration(contour, tempo) {
    // Each contour point represents roughly 1/8 to 1/2 beat depending on density
    const baseDuration = contour.length * 0.5
    return Math.max(1, Math.min(16, baseDuration))
  }

  /**
   * Convert contour to scale-quantized pitches with register awareness
   */
  _contourToScalePitches(contour, scale, rootNote, registerParams) {
    const rootMidi = this.pitchClasses[rootNote] || 60
    const { min: regMin, max: regMax, center: regCenter } = registerParams

    const pitches = []
    let prevPitch = regCenter

    contour.forEach((point, i) => {
      // Map contour pitch (0-1) to register range
      const targetMidi = regMin + point.pitch * (regMax - regMin)

      // Find nearest scale pitch with voice leading preference
      const scalePitch = this._findNearestScalePitch(targetMidi, scale, rootMidi, prevPitch)

      // Clamp to register
      const clampedPitch = Math.max(regMin, Math.min(regMax, scalePitch))
      pitches.push(clampedPitch)
      prevPitch = clampedPitch
    })

    return pitches
  }

  /**
   * Find nearest pitch in scale with voice leading preference
   */
  _findNearestScalePitch(targetMidi, scale, rootMidi, prevPitch) {
    // Build all scale pitches in range
    const scalePitches = []
    for (let octave = -2; octave <= 2; octave++) {
      scale.forEach(interval => {
        const pitch = rootMidi + interval + (octave * 12)
        if (pitch >= 24 && pitch <= 108) {
          scalePitches.push(pitch)
        }
      })
    }

    // Find nearest with voice leading weighting
    let bestPitch = scalePitches[0] || targetMidi
    let bestScore = Infinity

    scalePitches.forEach(pitch => {
      const distanceToTarget = Math.abs(pitch - targetMidi)
      const distanceToPrev = Math.abs(pitch - prevPitch)

      // Weight: closer to target (60%) + stepwise motion preference (40%)
      const score = distanceToTarget * 0.6 + distanceToPrev * 0.4

      if (score < bestScore) {
        bestScore = score
        bestPitch = pitch
      }
    })

    return bestPitch
  }

  /**
   * Generate rhythm from contour timing
   */
  _generateRhythmFromContour(contour, totalDurationBeats, density, complexity) {
    if (contour.length === 0) return [1]
    if (contour.length === 1) return [totalDurationBeats]

    const rhythm = []

    // Calculate durations from time deltas in contour
    for (let i = 0; i < contour.length; i++) {
      const currentTime = contour[i].time
      const nextTime = i < contour.length - 1 ? contour[i + 1].time : 1

      let duration = (nextTime - currentTime) * totalDurationBeats

      // Apply complexity-based variation
      if (complexity > 0.5) {
        const syncopation = Math.sin(i * PHI * Math.PI) * complexity * 0.3
        duration *= (1 + syncopation)
      }

      // Clamp duration
      duration = Math.max(0.125, Math.min(4, duration))
      rhythm.push(duration)
    }

    // Normalize to fit exactly in totalDurationBeats
    const actualTotal = rhythm.reduce((sum, d) => sum + d, 0)
    const scaleFactor = totalDurationBeats / actualTotal

    return rhythm.map(d => d * scaleFactor)
  }

  /**
   * Generate dynamics from contour intensity
   */
  _generateDynamicsFromContour(contour, velocityParams) {
    const { baseVelocity, variation, contour: dynamicContour } = velocityParams

    return contour.map((point, i) => {
      const position = i / contour.length
      let velocity = baseVelocity

      // Apply contour-based dynamics
      switch (dynamicContour) {
        case 'crescendo':
          velocity = baseVelocity + position * 40
          break
        case 'diminuendo':
          velocity = baseVelocity + (1 - position) * 40
          break
        case 'terraced':
          velocity = baseVelocity + Math.floor(position * 3) * 15
          break
        default:
          // Use contour intensity
          velocity = baseVelocity + (point.intensity - 0.5) * variation * 2
      }

      return Math.round(Math.max(30, Math.min(127, velocity)))
    })
  }

  /**
   * Generate articulations from section style
   */
  _generateArticulationsFromSection(noteCount, style, params) {
    const articulations = []

    for (let i = 0; i < noteCount; i++) {
      const position = i / noteCount

      // Vary articulation based on position in phrase
      let articulation = style

      // First and last notes may have different articulation
      if (i === 0 && params.accentFirst) {
        articulation = 'marcato'
      } else if (i === noteCount - 1 && style === 'legato') {
        articulation = 'portato' // End phrase with slight separation
      }

      articulations.push(articulation)
    }

    return articulations
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

    // Clamp to reasonable range (min 1 beat, max 32 beats)
    // Entry #172: Extended from 16 to 32 for longer phrases
    return Math.max(1, Math.min(32, nearestBeats))
  }

  /**
   * Calculate phrase length (note count) from quantized duration
   * Entry #171 Addendum 4: Note durations are ONLY from gesture velocity
   * WebMetrics affect phrase STRUCTURE (contour), not note durations
   * @param {number} phraseDurationBeats - Duration in beats
   * @param {number} velocity - Gesture velocity
   * @param {number} tempo - Tempo in BPM
   * @param {Object} webMetrics - Unused, kept for API compatibility
   * @returns {number} Note count for phrase
   */
  calculatePhraseLengthFromDuration(phraseDurationBeats, velocity, tempo, webMetrics = null) {
    // Determine base note duration based on velocity ONLY
    // Entry #171 Addendum 4: webMetrics removed from duration calculation
    // Note durations should reflect gesture speed, not web activity
    let baseDuration
    if (velocity > 80) baseDuration = 0.25   // Fast = 16th notes
    else if (velocity > 60) baseDuration = 0.5  // Medium-fast = 8th notes
    else if (velocity > 40) baseDuration = 1.0  // Medium = quarter notes
    else if (velocity > 20) baseDuration = 1.5  // Medium-slow = dotted quarters
    else baseDuration = 2.0                     // Slow = half notes

    // Calculate how many notes would theoretically fit in the phrase duration
    // Entry #173 fix: Renamed from idealNoteCount for clarity
    const theoreticalNoteCount = Math.floor(phraseDurationBeats / baseDuration)

    // Entry #172: Progressive limits based on phrase duration
    // Entry #173 fix: Added ABSOLUTE_MAX_NOTES ceiling for performance protection
    const ABSOLUTE_MAX_NOTES = 64  // Constitutional limit to prevent performance issues
    const NOTE_LIMITS = {
      SHORT: 16,    // <= 4 beats
      MEDIUM: 32,   // <= 8 beats
      LONG: 48,     // <= 16 beats
      EXTENDED: 64  // > 16 beats
    }

    const maxNotesForDuration = (beats) => {
      if (beats <= 4) return NOTE_LIMITS.SHORT
      if (beats <= 8) return NOTE_LIMITS.MEDIUM
      if (beats <= 16) return NOTE_LIMITS.LONG
      return NOTE_LIMITS.EXTENDED
    }

    // Apply progressive limit with absolute ceiling
    const progressiveMax = maxNotesForDuration(phraseDurationBeats)
    const maxNotes = Math.min(ABSOLUTE_MAX_NOTES, progressiveMax)
    const noteCount = Math.max(2, Math.min(maxNotes, theoreticalNoteCount))

    return noteCount
  }

  /**
   * Generate rhythm that fits exactly in the target duration
   * DETERMINISTIC: variations derived from velocity, curvature, and position, not random
   * Entry #171 fix: Always creates varied durations, not just when acceleration ≠ 0
   * @param {number} velocity - Gesture velocity
   * @param {number} acceleration - Gesture acceleration
   * @param {number} noteCount - Number of notes
   * @param {number} targetDurationBeats - Target duration in beats
   * @param {number} tempo - Tempo in BPM
   * @param {number} curvature - Gesture curvature
   * @param {number} sectionDensity - Optional section rhythmic density (0-1)
   * @param {number} sectionComplexity - Optional section rhythmic complexity (0-1)
   */
  generateRhythmForDuration(velocity, acceleration, noteCount, targetDurationBeats, tempo, curvature = 0.5, sectionDensity = null, sectionComplexity = null) {
    // Start with base durations - modified by section density if available
    let baseDuration
    if (sectionDensity !== null) {
      // Section density overrides velocity-based duration
      // High density (0.8-1.0) = 16th notes, Low density (0-0.2) = half notes
      baseDuration = 2.0 - sectionDensity * 1.75 // Range: 0.25 to 2.0
    } else if (velocity > 80) baseDuration = 0.25
    else if (velocity > 60) baseDuration = 0.5
    else if (velocity > 40) baseDuration = 1.0
    else if (velocity > 20) baseDuration = 1.5
    else baseDuration = 2.0

    const rhythm = []
    let totalDuration = 0
    const safeCurvature = curvature || 0.5

    // Use section complexity for syncopation threshold if available
    const effectiveComplexity = sectionComplexity !== null ? sectionComplexity : safeCurvature

    // Generate rhythm with DETERMINISTIC variation
    for (let i = 0; i < noteCount; i++) {
      const phrasePosition = i / noteCount

      // Entry #171 fix: THREE sources of duration variation (all deterministic)
      // 1. Acceleration-based: rushing/dragging effect
      const positionFactor = phrasePosition - 0.5 // -0.5 to 0.5
      const accelerationVariation = (acceleration / 100) * positionFactor * 0.4

      // 2. Phrase shape: Natural musical phrasing (first/last notes slightly longer)
      // Uses cosine curve: peaks at start and end, dip in middle
      const phraseShapeVariation = Math.cos(phrasePosition * Math.PI * 2) * 0.15

      // 3. Curvature-based alternation: High curvature = more rhythmic contrast
      // Creates long-short or short-long patterns based on curvature direction
      const isOdd = i % 2 === 1
      const curvatureVariation = (safeCurvature - 0.5) * (isOdd ? 0.3 : -0.3)

      // Combine all variations (they stack but remain bounded)
      let duration = baseDuration * (1 + accelerationVariation + phraseShapeVariation + curvatureVariation)

      // DERIVATION: syncopation from curvature/complexity
      // High curvature/complexity → more syncopation at phrase midpoint
      const syncopationThreshold = 1 - effectiveComplexity // High complexity = low threshold

      if (phrasePosition > syncopationThreshold && phrasePosition < (1 - syncopationThreshold / 2)) {
        // Apply syncopation - device index derived from position + curvature + note index
        // WEIGHTING: position (40%) for musical flow, curvature (30%) for gesture character,
        // PHI stepping (30%) for non-repeating variety
        const rhythmicDevices = [0.5, 0.75, 1.5, 0.33, 0.67]
        const mixedIndex = phrasePosition * 0.4 + safeCurvature * 0.3 + ((i * PHI) % 1) * 0.3
        // Clamp to valid range before floor to ensure valid array access
        const clampedIndex = Math.max(0, Math.min(1, mixedIndex))
        const deviceIndex = Math.floor(clampedIndex * rhythmicDevices.length)
        duration = baseDuration * rhythmicDevices[deviceIndex]
      }

      duration = Math.max(0.125, Math.min(4.0, duration))
      rhythm.push(duration)
      totalDuration += duration
    }

    // CRITICAL: Scale rhythm to fit EXACTLY in targetDurationBeats
    const scaleFactor = targetDurationBeats / totalDuration
    const scaledRhythm = rhythm.map(dur => dur * scaleFactor)

    return scaledRhythm
  }

  calculatePhraseLength(velocity, intensity = 0.5) {
    // Faster gestures = shorter, more active phrases
    // Slower gestures = longer, more lyrical phrases
    // DERIVATION: intensity determines position within velocity-based range

    const ranges = {
      veryFast: { min: 3, max: 5 },   // velocity > 80
      fast: { min: 4, max: 7 },       // velocity > 60
      medium: { min: 5, max: 9 },     // velocity > 40
      slow: { min: 6, max: 11 },      // velocity > 20
      verySlow: { min: 7, max: 13 }   // velocity <= 20
    }

    const range = velocity > 80 ? ranges.veryFast :
                  velocity > 60 ? ranges.fast :
                  velocity > 40 ? ranges.medium :
                  velocity > 20 ? ranges.slow : ranges.verySlow

    // DERIVATION: intensity → position in range
    const normalizedIntensity = Math.max(0, Math.min(1, intensity))
    return Math.round(range.min + normalizedIntensity * (range.max - range.min))
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

    // DERIVATION: use secondary scale based on curvature+velocity+angle threshold
    // High curvature + slow velocity → more chromatic/secondary scales
    // WEIGHTING: curvature (40%) = gesture smoothness affects tonal color
    //            velocity (30%) = speed adds timbral variation
    //            angle (30%) = direction provides spatial variety
    const safeCurvature = curvature || 0.5
    const safeVelocity = velocity || 50
    const angle = gestureData.angle || 0
    const secondaryThreshold = (safeCurvature * 0.3) + ((100 - safeVelocity) / 100 * 0.2) // 0-0.5 range
    const scaleSelector = (safeCurvature * 0.4 + safeVelocity / 100 * 0.3 + (angle / 360) * 0.3) % 1

    if (scaleSelector < secondaryThreshold && scaleMap[mood]) {
      return this.scales[scaleMap[mood].secondary] || this.scales[selectedScale]
    }

    return this.scales[selectedScale] || this.scales.major
  }

  /**
   * Select scale with harmonic tension from section context
   * Higher tension → more chromatic/complex scales
   * @param {string} mode - Base mode
   * @param {Object} gestureData - Gesture data for mood analysis
   * @param {number} harmonicTension - 0-1 tension level from SectionContext
   * @returns {Array} Scale intervals
   */
  selectScaleWithTension(mode, gestureData, harmonicTension = 0) {
    const mood = this.analyzeMood(gestureData || {})
    const curvature = gestureData?.curvature || 0.5
    const velocity = gestureData?.velocity || 50

    // Tension-based scale tiers
    // Low tension (0-0.3): Pentatonic, Major, Minor
    // Medium tension (0.3-0.6): Modal scales (Dorian, Mixolydian, Lydian)
    // High tension (0.6-0.8): Blues, Harmonic Minor
    // Very high tension (0.8-1.0): Chromatic, Diminished, Whole Tone

    if (harmonicTension > 0.8) {
      // Very high tension - dissonant scales
      const tensionScales = ['chromatic', 'diminished', 'wholeTone']
      const idx = Math.floor((mood.charCodeAt(0) % 10) / 10 * tensionScales.length)
      return this.scales[tensionScales[idx]] || this.scales.chromatic
    }

    if (harmonicTension > 0.6) {
      // High tension - blues and harmonic minor
      const tensionScales = ['blues', 'harmonicMinor', 'phrygian']
      const idx = Math.floor(curvature * tensionScales.length)
      return this.scales[tensionScales[idx]] || this.scales.blues
    }

    if (harmonicTension > 0.3) {
      // Medium tension - modal scales
      const modalScales = ['dorian', 'mixolydian', 'lydian']
      const idx = Math.floor((velocity / 100) * modalScales.length)
      return this.scales[modalScales[idx]] || this.scales.dorian
    }

    // Low tension - use mood-based selection with preference for simpler scales
    const scaleMap = {
      bright: { primary: 'majorPentatonic', secondary: 'major' },
      happy: { primary: 'majorPentatonic', secondary: 'major' },
      sad: { primary: 'minorPentatonic', secondary: 'minor' },
      dark: { primary: 'minor', secondary: 'minorPentatonic' },
      jazzy: { primary: 'majorPentatonic', secondary: 'dorian' },
      dreamy: { primary: 'majorPentatonic', secondary: 'lydian' },
      bluesy: { primary: 'minorPentatonic', secondary: 'blues' },
      exotic: { primary: 'minorPentatonic', secondary: 'harmonicMinor' },
      tense: { primary: 'minor', secondary: 'harmonicMinor' },
      floating: { primary: 'majorPentatonic', secondary: 'major' },
      neutral: { primary: 'major', secondary: 'majorPentatonic' }
    }

    const selected = scaleMap[mood] || scaleMap.neutral

    // Use secondary scale based on tension within low range
    if (harmonicTension > 0.15) {
      return this.scales[selected.secondary] || this.scales.major
    }

    return this.scales[selected.primary] || this.scales.major
  }

  /**
   * Generate dynamics with section context parameters
   */
  generateDynamicsWithSection(acceleration, velocity, noteCount, baseVelocity, dynamicContour) {
    // If no section params, use original method
    if (!baseVelocity) {
      return this.generateDynamics(acceleration, velocity, noteCount)
    }

    const dynamics = []

    for (let i = 0; i < noteCount; i++) {
      const position = i / noteCount
      let vel = baseVelocity

      // Apply contour
      switch (dynamicContour) {
        case 'crescendo':
          vel = baseVelocity + position * 40
          break
        case 'diminuendo':
          vel = baseVelocity + (1 - position) * 40
          break
        case 'terraced':
          vel = baseVelocity + Math.floor(position * 3) * 15
          break
        default:
          // Stable with subtle variation from acceleration
          const accEffect = (acceleration / 100) * position * 15
          vel = baseVelocity + accEffect
      }

      // Add gesture-based micro-variation
      const microVar = Math.sin(position * Math.PI * 3) * 5
      vel = Math.round(vel + microVar)

      dynamics.push(Math.max(30, Math.min(127, vel)))
    }

    return dynamics
  }

  /**
   * Generate articulations with section style
   */
  generateArticulationsWithSection(velocity, curvature, noteCount, sectionStyle) {
    // If no section style, use original method
    if (!sectionStyle) {
      return this.generateArticulations(velocity, curvature, noteCount)
    }

    const articulations = []

    for (let i = 0; i < noteCount; i++) {
      const position = i / noteCount

      // Use section style as base
      let articulation = sectionStyle

      // Adjust based on position and gesture
      if (i === 0 && velocity > 70) {
        articulation = 'marcato' // Strong downbeat
      } else if (position > 0.9 && sectionStyle === 'legato') {
        articulation = 'portato' // Phrase ending
      } else if (curvature > 0.8 && velocity > 60 && position > 0.3 && position < 0.7) {
        // Gesture character overrides in middle of phrase
        articulation = velocity > 80 ? 'staccato' : 'legato'
      }

      articulations.push(articulation)
    }

    return articulations
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

  /**
   * Generate melodic contour based on gesture trajectory and web metrics
   * Entry #171: WebMetrics add deterministic variety to contour selection
   * @param {Object} trajectory - Gesture trajectory with angle/direction
   * @param {number} curvature - Gesture curvature 0-1
   * @param {number} length - Contour length (note count)
   * @param {Object} webMetrics - Optional web metrics for variation
   * @returns {Array} Contour values 0-1
   */
  generateMelodicContour(trajectory, curvature, length, webMetrics = null) {
    // Contour types ordered by "movement" (stable → dramatic)
    const contourTypes = [
      'level',               // 0.0-0.15: minimal movement
      'linear',              // 0.15-0.3: gradual
      'wave',                // 0.3-0.5: undulating
      'arch',                // 0.5-0.7: melodic arch
      'ascending',           // 0.7-0.85: rising
      'descending',          // 0.85-1.0: falling
      'ascending_descending' // alternative for high activity
    ]

    // Base contour from gesture (existing logic)
    let contourType
    if (!trajectory) {
      // No trajectory: use default contour selection
      const contourIndex = Math.floor((length % 4 + curvature * 2) % 4)
      contourType = ['level', 'wave', 'arch', 'ascending_descending'][contourIndex]
    } else {
      const angle = trajectory.angle || 0
      if (angle > 45) contourType = 'ascending'
      else if (angle < -45) contourType = 'descending'
      else if (curvature > 0.7) contourType = 'arch'
      else if (curvature < 0.3) contourType = 'linear'
      else contourType = 'wave'
    }

    // Entry #171 Addendum 4: WebMetrics COMBINE with gesture-based contour selection
    // Only override when metrics have meaningful deviation from defaults
    // Uses pre-normalized values from BackgroundCompositionService (all in 0-1 range)
    if (webMetrics) {
      const wiki = webMetrics.wikipedia || {}
      const hn = webMetrics.hackernews || {}
      const gh = webMetrics.github || {}

      // Use pre-normalized values (0-1 range from BackgroundCompositionService)
      const editSizeNorm = wiki.avgEditSizeNorm ?? 0.5
      const upvotesNorm = hn.avgUpvotesNorm ?? 0.5
      const createsNorm = gh.createsNorm ?? 0.5

      // Check if metrics have meaningful deviation from defaults (0.5)
      // If all values are near 0.5 (±0.1), keep gesture-based contour
      const editDeviation = Math.abs(editSizeNorm - 0.5)
      const upvotesDeviation = Math.abs(upvotesNorm - 0.5)
      const createsDeviation = Math.abs(createsNorm - 0.5)
      const maxDeviation = Math.max(editDeviation, upvotesDeviation, createsDeviation)

      // Only apply webMetrics override if there's meaningful signal (>0.1 deviation)
      if (maxDeviation > 0.1) {
        // Velocity values are now pre-normalized to 0-1, convert to -1 to +1 for combination
        const wikiVel = (wiki.velocityNorm ?? 0.5) * 2 - 1  // 0-1 → -1 to +1
        const hnVel = (hn.velocityNorm ?? 0.5) * 2 - 1
        const ghVel = (gh.velocityNorm ?? 0.5) * 2 - 1

        // Combined velocity for contour selection
        const combinedVelocity = (wikiVel + hnVel + ghVel) / 3

        // Velocity fallback: when all sources have near-zero velocity, use acceleration
        // This maintains contour variety during stable activity periods
        const effectiveVelocity = Math.abs(combinedVelocity) < 0.1
          ? ((wiki.accelerationNorm ?? 0.5) - 0.5) * 2  // Use acceleration as fallback
          : combinedVelocity

        // FORMULA: editSize (40%) + upvotes (30%) + velocity (30%)
        // Explicit clamp to 0-1 for safety
        const contourScore = Math.min(1, Math.max(0,
          (editSizeNorm * 0.4) + (upvotesNorm * 0.3) + ((effectiveVelocity + 1) / 2 * 0.3)
        ))

        // Map score to contour type index
        const contourIndex = Math.floor(contourScore * contourTypes.length)
        contourType = contourTypes[Math.min(contourIndex, contourTypes.length - 1)]

        // Negative velocity → invert contour (ascending ↔ descending)
        if (combinedVelocity < -0.3) {
          if (contourType === 'ascending') contourType = 'descending'
          else if (contourType === 'descending') contourType = 'ascending'
        }
      }
      // If maxDeviation <= 0.1, keep the gesture-based contourType selected above
    }

    return this.createContour(contourType, length, curvature, webMetrics)
  }

  generateDefaultContour(length, curvature = 0.5) {
    // Generate a balanced default contour
    // DERIVATION: contour type from length and curvature
    const contourTypes = ['level', 'wave', 'arch', 'ascending_descending'] // Ordered by complexity

    // Use length and curvature to derive contour type deterministically
    const contourIndex = Math.floor((length % 4 + curvature * 2) % contourTypes.length)
    const contourType = contourTypes[contourIndex]
    return this.createContour(contourType, length, curvature)
  }

  /**
   * Create contour pattern with web metrics-driven amplitude variation
   * Entry #171: Acceleration from webMetrics affects contour amplitude
   * @param {string} type - Contour type
   * @param {number} length - Contour length
   * @param {number} curvature - Base curvature 0-1
   * @param {Object} webMetrics - Optional web metrics for amplitude variation
   * @returns {Array} Contour values 0-1
   */
  createContour(type, length, curvature, webMetrics = null) {
    const contour = []

    // Base amplitude (existing: 0.1 * curvature)
    const baseAmplitude = 0.1 * curvature
    let amplitude = baseAmplitude

    // Entry #171: WebMetrics acceleration modulates amplitude
    // Uses pre-normalized values from BackgroundCompositionService (0-1 range)
    if (webMetrics) {
      // Convert 0-1 normalized to -1 to +1 for acceleration factor
      const wikiAcc = (webMetrics.wikipedia?.accelerationNorm ?? 0.5) * 2 - 1
      const hnAcc = (webMetrics.hackernews?.accelerationNorm ?? 0.5) * 2 - 1

      // Positive acceleration → more dramatic contour
      // Negative acceleration → flatter contour
      const accFactor = (wikiAcc + hnAcc) / 2
      amplitude = baseAmplitude * (1 + accFactor * 0.5) // ±50% variation

      // Symmetric clamping around base amplitude (±50% of base)
      const minAmplitude = Math.max(0.02, baseAmplitude * 0.5)
      const maxAmplitude = Math.min(0.3, baseAmplitude * 1.5)
      amplitude = Math.max(minAmplitude, Math.min(maxAmplitude, amplitude))
    }

    // DERIVATION: deterministic variation based on position and amplitude
    // Uses sine wave modulation for natural-sounding variation
    const positionVariation = (i, amp) => {
      const phaseOffset = curvature * Math.PI * 2
      return Math.sin((i / length) * Math.PI * 3 + phaseOffset) * amp
    }

    switch (type) {
      case 'ascending':
        for (let i = 0; i < length; i++) {
          const variation = positionVariation(i, amplitude)
          contour.push(1 - (i / length) + variation)
        }
        break

      case 'descending':
        for (let i = 0; i < length; i++) {
          const variation = positionVariation(i, amplitude)
          contour.push(i / length + variation)
        }
        break

      case 'arch':
        for (let i = 0; i < length; i++) {
          const peak = 0.5
          const distance = Math.abs(i / length - peak)
          const variation = positionVariation(i, amplitude)
          contour.push(1 - distance * 2 + variation)
        }
        break

      case 'wave':
        for (let i = 0; i < length; i++) {
          // Wave uses different amplitude calculation than other contours
          // With webMetrics: 0.5 + amplitude (more dramatic, 0.52-0.8 range)
          // Without webMetrics: curvature-based (0-1)
          const waveAmplitude = webMetrics ? (0.5 + amplitude) : curvature
          const wave = Math.sin((i / length) * Math.PI * 2 * waveAmplitude)
          contour.push((wave + 1) / 2)
        }
        break

      case 'ascending_descending':
        const midPoint = Math.floor(length / 2)
        for (let i = 0; i < length; i++) {
          const variation = positionVariation(i, amplitude * 0.5)
          if (i < midPoint) {
            contour.push(i / midPoint + variation)
          } else {
            contour.push(1 - ((i - midPoint) / midPoint) + variation)
          }
        }
        break

      case 'level':
        for (let i = 0; i < length; i++) {
          // DERIVATION: subtle variation from position and amplitude
          const variation = positionVariation(i, amplitude * 0.5)
          contour.push(0.5 + variation)
        }
        break

      case 'linear':
        // Entry #171: Linear contour with subtle variation
        for (let i = 0; i < length; i++) {
          const variation = positionVariation(i, amplitude * 0.3)
          contour.push(0.3 + (i / length) * 0.4 + variation)
        }
        break

      default:
        for (let i = 0; i < length; i++) {
          // DERIVATION: moderate variation for default case
          const variation = positionVariation(i, amplitude)
          contour.push(0.5 + variation)
        }
    }

    // Normalize contour to 0-1 range
    const min = Math.min(...contour)
    const max = Math.max(...contour)
    const range = max - min
    // Prevent division by zero for flat contours
    if (range < 0.001) {
      return contour.map(() => 0.5)
    }
    return contour.map(val => (val - min) / range)
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
      // DERIVATION: pass note position for deterministic interval selection
      const notePosition = i / contour.length
      const intervalType = this.selectIntervalType(currentDegree, targetDegree, notePosition)

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

  selectIntervalType(currentDegree, targetDegree, notePosition = 0) {
    const distance = Math.abs(targetDegree - currentDegree)

    // Entry #171 fix: Less restrictive voice leading to allow contour variety
    // Old logic forced stepwise motion at edges AND for distance<=1,
    // making all phrases sound like scale runs/arpeggios
    //
    // DERIVATION: interval type based on distance and phrase position
    // Edge notes (first/last 20%) prefer smoother motion but can skip if needed
    // Middle notes follow contour more closely
    const isEdge = notePosition < 0.2 || notePosition > 0.8

    // No movement needed
    if (distance === 0) return 'step'

    // Small distances: stepwise is natural
    if (distance === 1) return 'step'

    // Medium distances: edges use steps, middle uses skips
    if (distance <= 2) return isEdge ? 'step' : 'skip'

    // Larger distances: allow skips at edges, leaps in middle
    if (distance <= 4) return isEdge ? 'skip' : 'leap'

    // Very large distances: always leap to follow contour
    return 'leap'
  }

  generateRhythm(velocity, acceleration, noteCount, tempo, curvature = 0.5) {
    // Generate rhythm based on gesture velocity and acceleration
    // DETERMINISTIC: uses position and acceleration for variation

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
      // DERIVATION: variation from acceleration and position (same as generateRhythmForDuration)
      const positionFactor = (i / noteCount) - 0.5 // -0.5 to 0.5
      const variation = (acceleration / 100) * positionFactor * 0.4
      let duration = baseDuration * (1 + variation)

      // DERIVATION: syncopation from curvature and phrase position
      const syncopationThreshold = 1 - curvature
      const phrasePosition = i / noteCount

      if (phrasePosition > syncopationThreshold && phrasePosition < (1 - syncopationThreshold / 2)) {
        const rhythmicDevices = [0.5, 0.75, 1.5, 0.33, 0.67]
        const deviceIndex = Math.floor((phrasePosition - syncopationThreshold) * rhythmicDevices.length * 2) % rhythmicDevices.length
        duration = baseDuration * rhythmicDevices[deviceIndex]
      }

      // Ensure reasonable duration bounds
      duration = Math.max(0.125, Math.min(4.0, duration))

      rhythm.push(duration)
      currentTime += duration
    }

    return rhythm
  }

  /**
   * Apply ornamentation based on gesture character and web metrics
   * Entry #171: GitHub creates/deletes affects ornamentation style
   * @param {Array} pitches - MIDI pitch array
   * @param {Array} rhythm - Duration array
   * @param {Object} gestureData - Gesture data with curvature/velocity
   * @param {Object} webMetrics - Optional web metrics for style variation
   * @returns {Array} Ornamented pitch array
   */
  applyOrnamentation(pitches, rhythm, gestureData, webMetrics = null) {
    const { curvature = 0.5, velocity = 50 } = gestureData
    const ornamented = [...pitches]

    // Determine ornamentation style based on gesture character
    let ornamentationStyle = null
    if (curvature > 0.8 && velocity < 30) {
      ornamentationStyle = 'baroque'  // Trills, mordents
    } else if (curvature > 0.6 && velocity > 70) {
      ornamentationStyle = 'jazz'      // Runs, enclosures
    } else if (velocity > 80) {
      ornamentationStyle = 'blues'    // Bends, slides
    } else if (curvature > 0.7) {
      ornamentationStyle = 'romantic' // Arpeggios
    }

    // Entry #171: WebMetrics override based on GitHub activity patterns
    // Uses pre-normalized values from BackgroundCompositionService (0-1 range)
    if (webMetrics?.github) {
      const createsNorm = webMetrics.github.createsNorm ?? 0.5
      const deletesNorm = webMetrics.github.deletesNorm ?? 0.5

      // High creation activity → more ornaments (jazz/baroque)
      // High deletion activity → fewer ornaments (blues/none)
      // Creates:deletes ratio determines style
      if (createsNorm > 0.5 && deletesNorm < 0.4) {
        ornamentationStyle = 'baroque'  // Constructive → elaborate
      } else if (deletesNorm > 0.6) {
        ornamentationStyle = null       // Destructive → simple
      } else if (createsNorm > 0.3) {
        ornamentationStyle = 'jazz'     // Moderate → jazz runs
      }
    }

    if (!ornamentationStyle) return ornamented
    return this.addOrnaments(ornamented, rhythm, ornamentationStyle)
  }

  addOrnaments(pitches, rhythm, style) {
    const ornamented = []

    pitches.forEach((pitch, i) => {
      ornamented.push(pitch) // Always include the original note

      // DERIVATION: ornament placement based on phrase position
      // Ornaments occur at specific positions for each style
      const phrasePosition = i / pitches.length
      const pitchClass = pitch % 12 // 0-11

      // DERIVATION: ornament scores vary by phrase position to prevent same notes always getting same treatment
      const ornamentScore3 = (pitchClass + Math.floor(phrasePosition * 7)) % 3
      const ornamentScore4 = (pitchClass + Math.floor(phrasePosition * 7)) % 4
      const ornamentScore5 = (pitchClass + Math.floor(phrasePosition * 7)) % 5

      switch (style) {
        case 'baroque':
          // Trills on strong beats - varies by phrase position
          if ((ornamentScore3 === 0) && phrasePosition < 0.9 && i < pitches.length - 1) {
            const trillNote = pitch + 2 // Major second above
            ornamented.push(trillNote)
            rhythm[i] = rhythm[i] * 0.7 // Shorten main note
          }
          break

        case 'jazz':
          // Approach notes on weak beats - varies by phrase position
          if ((ornamentScore4 < 2) && phrasePosition > 0.1 && phrasePosition < 0.9 && i < pitches.length - 1) {
            const approachNote = pitch - 1
            ornamented.splice(ornamented.length - 1, 0, approachNote)
          }
          break

        case 'blues':
          // Blue notes on off-beat positions - varies by phrase position
          if ((ornamentScore3 === 0) && phrasePosition > 0.2 && phrasePosition < 0.8) {
            const blueNote = pitch - 3 // Flat 3rd
            ornamented.push(blueNote)
          }
          break

        case 'romantic':
          // Arpeggios near phrase midpoint - varies by phrase position
          if ((ornamentScore5 === 0) && phrasePosition > 0.3 && phrasePosition < 0.6 && i < pitches.length - 2) {
            const third = pitch + 4
            const fifth = pitch + 7
            ornamented.push(third, fifth)
          }
          break
      }
    })

    return ornamented
  }

  generateDynamics(acceleration, velocity, noteCount = 5, intensity = 0.5) {
    // Generate dynamic contour based on gesture acceleration
    // DETERMINISTIC: uses position and intensity for variation instead of random
    const baseVel = Array.isArray(velocity) ? velocity[0] || 50 : velocity
    const dynamics = []

    // DERIVATION: variation based on position using sine wave for natural feel
    const dynamicVariation = (position, amplitude) => {
      return Math.sin(position * Math.PI * 2 * intensity + intensity * Math.PI) * amplitude
    }

    if (acceleration > 5) {
      // Positive acceleration = crescendo
      for (let i = 0; i < noteCount; i++) {
        const position = i / noteCount
        const crescendo = 60 + position * 60 // pp to ff
        // DERIVATION: variation from position and intensity
        const variation = dynamicVariation(position, 5 * intensity)
        dynamics.push(Math.round(crescendo + variation))
      }
    } else if (acceleration < -5) {
      // Negative acceleration = diminuendo
      for (let i = 0; i < noteCount; i++) {
        const position = i / noteCount
        const diminuendo = 120 - position * 60 // ff to pp
        const variation = dynamicVariation(position, 5 * intensity)
        dynamics.push(Math.round(diminuendo + variation))
      }
    } else {
      // Stable dynamics with position-based variations
      const baseVelocity = Math.max(40, Math.min(100, baseVel || 70))
      for (let i = 0; i < noteCount; i++) {
        const position = i / noteCount
        // DERIVATION: subtle wave variation based on position
        const variation = dynamicVariation(position, 7.5 * intensity)
        dynamics.push(Math.round(baseVelocity + variation))
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