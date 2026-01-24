/**
 * SectionContext.js - Entry #169
 *
 * Represents the current musical context for a section.
 * Contains all parameters that influence music generation.
 * Supports evolution over time within a section.
 */

const {
  getSectionParams,
  getFormSequence,
  getFormCycleLength,
  applyVoiceRole,
  evolveSectionParams
} = require('./FormDefinitions')

class SectionContext {
  /**
   * Create a new SectionContext
   * @param {Object} options - Initial parameters
   * @param {string} [options.sectionType='A'] - Section identifier (e.g., 'A', 'B', 'exposition')
   * @param {string} [options.formType='ABA'] - Form type (e.g., 'ABA', 'sonata', 'verse_chorus')
   * @param {number} [options.sectionIndex=0] - Index in form sequence (0-based)
   * @param {number} [options.totalSections] - Total sections in form (defaults to form cycle length)
   * @param {string} [options.thematicRole='exposition'] - Role: 'exposition'|'development'|'recapitulation'|'transition'|'coda'
   * @param {string} [options.developmentTechnique='statement'] - Technique: 'statement'|'variation'|'sequence'|etc.
   * @param {number} [options.dynamicLevel=0.5] - Dynamic level 0.0 (pp) to 1.0 (ff)
   * @param {string} [options.dynamicContour='stable'] - Contour: 'stable'|'crescendo'|'diminuendo'|'terraced'
   * @param {number} [options.rhythmicDensity=0.5] - Notes per beat 0.0 (sparse) to 1.0 (dense)
   * @param {number} [options.rhythmicComplexity=0.3] - Syncopation/polyrhythm 0.0-1.0
   * @param {string} [options.harmonicRhythm='medium'] - Chord changes: 'slow'|'medium'|'fast'
   * @param {number} [options.harmonicTension=0.3] - Diatonic (0) to chromatic (1)
   * @param {string} [options.harmonicFunction='tonic'] - Function: 'tonic'|'dominant'|'predominant'
   * @param {number} [options.registerCenter=0.5] - Pitch center 0.0 (bass) to 1.0 (treble)
   * @param {number} [options.registerSpread=0.5] - Pitch range 0.0 (narrow) to 1.0 (wide)
   * @param {string} [options.textureType='homophonic'] - Texture: 'monophonic'|'homophonic'|'polyphonic'
   * @param {string} [options.articulationStyle='portato'] - Style: 'legato'|'portato'|'staccato'|'marcato'
   * @param {number} [options.progressionPosition=0] - Progress within section 0.0-1.0
   * @param {number} [options.formCyclePosition=0] - Progress within entire form 0.0-1.0
   */
  constructor(options = {}) {
    // Section identity
    this.sectionType = options.sectionType || 'A'
    this.formType = options.formType || 'ABA'
    this.sectionIndex = options.sectionIndex || 0
    // Fix #1: Ensure totalSections is never 0
    const formCycleLen = getFormCycleLength(this.formType)
    this.totalSections = Math.max(1, options.totalSections || formCycleLen || 1)

    // Thematic role and development
    this.thematicRole = options.thematicRole || 'exposition'
    this.developmentTechnique = options.developmentTechnique || 'statement'

    // Dynamic parameters (0.0-1.0)
    this.dynamicLevel = options.dynamicLevel ?? 0.5
    this.dynamicContour = options.dynamicContour || 'stable'

    // Rhythmic parameters
    this.rhythmicDensity = options.rhythmicDensity ?? 0.5
    this.rhythmicComplexity = options.rhythmicComplexity ?? 0.3

    // Harmonic parameters
    this.harmonicRhythm = options.harmonicRhythm || 'medium'
    this.harmonicTension = options.harmonicTension ?? 0.3
    this.harmonicFunction = options.harmonicFunction || 'tonic'

    // Register and texture
    this.registerCenter = options.registerCenter ?? 0.5
    this.registerSpread = options.registerSpread ?? 0.5
    this.textureType = options.textureType || 'homophonic'

    // Articulation
    this.articulationStyle = options.articulationStyle || 'portato'

    // Timing
    this.barLength = options.barLength || 8
    this.beatsPerBar = options.beatsPerBar || 4

    // Position tracking
    this.progressionPosition = options.progressionPosition ?? 0.0
    this.formCyclePosition = options.formCyclePosition ?? 0.0
    this.compositionsInSection = options.compositionsInSection || 0

    // Creation timestamp for ordering
    this.createdAt = options.createdAt || Date.now()
  }

  /**
   * Create a SectionContext from form and section type
   * @param {string} formType - Form type (e.g., 'sonata', 'ABA')
   * @param {string} sectionType - Section type (e.g., 'A', 'exposition')
   * @param {number} sectionIndex - Index in form sequence
   * @returns {SectionContext}
   */
  static fromForm(formType, sectionType, sectionIndex = 0) {
    const params = getSectionParams(formType, sectionType)
    return new SectionContext({
      ...params,
      formType,
      sectionType,
      sectionIndex,
      totalSections: getFormCycleLength(formType)
    })
  }

  /**
   * Get the next section in the form sequence
   * @returns {SectionContext} New context for next section
   */
  nextSection() {
    const sequence = getFormSequence(this.formType)
    const nextIndex = (this.sectionIndex + 1) % sequence.length
    const nextSectionType = sequence[nextIndex]

    return SectionContext.fromForm(this.formType, nextSectionType, nextIndex)
  }

  /**
   * Evolve this context based on progress
   * @param {number} deltaProgress - Amount of progress (0-1)
   * @returns {SectionContext} Evolved context
   */
  evolve(deltaProgress) {
    const newProgress = Math.min(1.0, this.progressionPosition + deltaProgress)
    const evolved = evolveSectionParams(this, newProgress)

    // Fix #1: Guard against division by zero
    const safeTotalSections = this.totalSections || 1

    return new SectionContext({
      ...evolved,
      progressionPosition: newProgress,
      formCyclePosition: (this.sectionIndex + newProgress) / safeTotalSections,
      compositionsInSection: this.compositionsInSection + 1
    })
  }

  /**
   * Apply voice role modifiers to this context
   * @param {string} voiceRole - Voice role (soprano, alto, tenor, bass, etc.)
   * @returns {SectionContext} Modified context for voice
   */
  forVoice(voiceRole) {
    const modified = applyVoiceRole(this, voiceRole)
    return new SectionContext({
      ...this,
      ...modified,
      _voiceRole: voiceRole
    })
  }

  /**
   * Get mood for backward compatibility with existing code
   * @returns {string} Mood string (neutral, tense, energetic)
   */
  getMood() {
    if (this.dynamicLevel > 0.7 && this.rhythmicDensity > 0.6) return 'energetic'
    if (this.harmonicTension > 0.5) return 'tense'
    if (this.harmonicTension < 0.3 && this.dynamicLevel < 0.4) return 'calm'
    return 'neutral'
  }

  /**
   * Check if we should transition to next section
   * @param {number} minCompositions - Minimum compositions per section
   * @returns {boolean}
   */
  shouldTransition(minCompositions = 3) {
    return this.compositionsInSection >= minCompositions &&
           this.progressionPosition >= 0.9
  }

  /**
   * Get scale selection parameters
   * Higher tension = more chromatic notes allowed
   * @returns {Object} Scale parameters
   */
  getScaleParams() {
    return {
      chromaticism: this.harmonicTension,
      modality: this.thematicRole === 'development' ? 0.6 : 0.3,
      allowAlterations: this.harmonicTension > 0.5
    }
  }

  /**
   * Get rhythm generation parameters
   * @returns {Object} Rhythm parameters
   */
  getRhythmParams() {
    return {
      density: this.rhythmicDensity,
      complexity: this.rhythmicComplexity,
      syncopation: this.rhythmicComplexity > 0.5 ? 0.3 : 0.1,
      swing: this.formType === 'blues' || this.formType === 'rhythm_changes' ? 0.5 : 0
    }
  }

  /**
   * Get velocity (dynamics) generation parameters
   * @returns {Object} Velocity parameters
   */
  getVelocityParams() {
    return {
      baseVelocity: Math.round(40 + this.dynamicLevel * 80), // 40-120
      variation: this.dynamicContour === 'stable' ? 10 : 20,
      contour: this.dynamicContour
    }
  }

  /**
   * Get articulation parameters
   * @returns {Object} Articulation parameters
   */
  getArticulationParams() {
    const styleToParams = {
      legato: { overlap: 0.1, gateTime: 0.95 },
      portato: { overlap: 0, gateTime: 0.8 },
      staccato: { overlap: 0, gateTime: 0.4 },
      marcato: { overlap: 0, gateTime: 0.6, accentFirst: true }
    }
    return styleToParams[this.articulationStyle] || styleToParams.portato
  }

  /**
   * Get register (pitch range) parameters
   * @returns {Object} Register parameters with MIDI note ranges
   */
  getRegisterParams() {
    // Base register: C2 (36) to C7 (96)
    const fullRange = { min: 36, max: 96 }
    const rangeSize = (fullRange.max - fullRange.min) * this.registerSpread

    // Center the range based on registerCenter
    const centerNote = fullRange.min + (fullRange.max - fullRange.min) * this.registerCenter

    return {
      min: Math.round(Math.max(fullRange.min, centerNote - rangeSize / 2)),
      max: Math.round(Math.min(fullRange.max, centerNote + rangeSize / 2)),
      center: Math.round(centerNote),
      spread: this.registerSpread
    }
  }

  /**
   * Serialize to plain object for transmission
   * @returns {Object}
   */
  toJSON() {
    return {
      sectionType: this.sectionType,
      formType: this.formType,
      sectionIndex: this.sectionIndex,
      totalSections: this.totalSections,
      thematicRole: this.thematicRole,
      developmentTechnique: this.developmentTechnique,
      dynamicLevel: this.dynamicLevel,
      dynamicContour: this.dynamicContour,
      rhythmicDensity: this.rhythmicDensity,
      rhythmicComplexity: this.rhythmicComplexity,
      harmonicRhythm: this.harmonicRhythm,
      harmonicTension: this.harmonicTension,
      harmonicFunction: this.harmonicFunction,
      registerCenter: this.registerCenter,
      registerSpread: this.registerSpread,
      textureType: this.textureType,
      articulationStyle: this.articulationStyle,
      barLength: this.barLength,
      progressionPosition: this.progressionPosition,
      formCyclePosition: this.formCyclePosition,
      compositionsInSection: this.compositionsInSection
    }
  }

  /**
   * Create from serialized object
   * @param {Object} json
   * @returns {SectionContext}
   */
  static fromJSON(json) {
    return new SectionContext(json)
  }

  /**
   * Get a human-readable description
   * @returns {string}
   */
  toString() {
    return `[${this.formType}] ${this.sectionType} (${this.thematicRole}): ` +
           `dyn=${this.dynamicLevel.toFixed(2)}, ` +
           `tension=${this.harmonicTension.toFixed(2)}, ` +
           `tech=${this.developmentTechnique}, ` +
           `progress=${(this.progressionPosition * 100).toFixed(0)}%`
  }
}

module.exports = SectionContext
