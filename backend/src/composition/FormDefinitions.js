/**
 * FormDefinitions.js - Entry #169
 *
 * Defines musical parameters for each section of every form type.
 * Based on classical music theory and contemporary composition practice.
 *
 * Each section provides rich parameters that influence:
 * - Thematic development (statement, variation, fragmentation, etc.)
 * - Dynamic contour (crescendo, diminuendo, stable)
 * - Rhythmic density and complexity
 * - Harmonic tension and function
 * - Register and texture
 * - Articulation style
 */

const PHI = 1.618033988749895

// Default section parameters (used as base for all sections)
const DEFAULT_SECTION = {
  thematicRole: 'exposition',
  developmentTechnique: 'statement',
  dynamicLevel: 0.5,
  dynamicContour: 'stable',
  rhythmicDensity: 0.5,
  rhythmicComplexity: 0.3,
  harmonicRhythm: 'medium',
  harmonicTension: 0.3,
  harmonicFunction: 'tonic',
  registerCenter: 0.5,
  registerSpread: 0.5,
  textureType: 'homophonic',
  articulationStyle: 'portato',
  barLength: 8
}

// ============================================================================
// CLASSICAL FORMS
// ============================================================================

const SONATA_SECTIONS = {
  exposition: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'statement',
    dynamicLevel: 0.6,
    dynamicContour: 'stable',
    rhythmicDensity: 0.5,
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'legato',
    barLength: 16
  },
  development: {
    ...DEFAULT_SECTION,
    thematicRole: 'development',
    developmentTechnique: 'fragmentation',
    dynamicLevel: 0.7,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.7,
    rhythmicComplexity: 0.6,
    harmonicTension: 0.7,
    harmonicFunction: 'dominant',
    textureType: 'polyphonic',
    articulationStyle: 'mixed',
    barLength: 16
  },
  recapitulation: {
    ...DEFAULT_SECTION,
    thematicRole: 'recapitulation',
    developmentTechnique: 'variation',
    dynamicLevel: 0.8,
    dynamicContour: 'diminuendo',
    rhythmicDensity: 0.5,
    harmonicTension: 0.3,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'legato',
    barLength: 16
  }
}

const ABA_SECTIONS = {
  A: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'statement',
    dynamicLevel: 0.6,
    dynamicContour: 'stable',
    rhythmicDensity: 0.5,
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'legato',
    barLength: 8
  },
  B: {
    ...DEFAULT_SECTION,
    thematicRole: 'development',
    developmentTechnique: 'variation',
    dynamicLevel: 0.5,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.6,
    rhythmicComplexity: 0.5,
    harmonicTension: 0.5,
    harmonicFunction: 'dominant',
    textureType: 'polyphonic',
    articulationStyle: 'portato',
    barLength: 8
  }
}

const RONDO_SECTIONS = {
  A: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'statement',
    dynamicLevel: 0.6,
    dynamicContour: 'stable',
    rhythmicDensity: 0.5,
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'legato',
    barLength: 4
  },
  B: {
    ...DEFAULT_SECTION,
    thematicRole: 'development',
    developmentTechnique: 'variation',
    dynamicLevel: 0.5,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.6,
    harmonicTension: 0.5,
    harmonicFunction: 'dominant',
    textureType: 'polyphonic',
    articulationStyle: 'portato',
    barLength: 4
  },
  C: {
    ...DEFAULT_SECTION,
    thematicRole: 'development',
    developmentTechnique: 'sequence',
    dynamicLevel: 0.7,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.7,
    rhythmicComplexity: 0.6,
    harmonicTension: 0.6,
    harmonicFunction: 'predominant',
    textureType: 'polyphonic',
    articulationStyle: 'staccato',
    barLength: 4
  }
}

const AABA_SECTIONS = {
  A: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'statement',
    dynamicLevel: 0.6,
    dynamicContour: 'stable',
    rhythmicDensity: 0.5,
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'legato',
    barLength: 8
  },
  B: {
    ...DEFAULT_SECTION,
    thematicRole: 'development',
    developmentTechnique: 'sequence',
    dynamicLevel: 0.6,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.6,
    rhythmicComplexity: 0.5,
    harmonicTension: 0.5,
    harmonicFunction: 'dominant',
    textureType: 'polyphonic',
    articulationStyle: 'portato',
    barLength: 8
  }
}

const THEME_AND_VARIATIONS_SECTIONS = {
  theme: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'statement',
    dynamicLevel: 0.5,
    dynamicContour: 'stable',
    rhythmicDensity: 0.4,
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'legato',
    barLength: 8
  },
  var1: {
    ...DEFAULT_SECTION,
    thematicRole: 'development',
    developmentTechnique: 'variation',
    dynamicLevel: 0.6,
    dynamicContour: 'stable',
    rhythmicDensity: 0.6,
    rhythmicComplexity: 0.4,
    harmonicTension: 0.3,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'portato',
    barLength: 8
  },
  var2: {
    ...DEFAULT_SECTION,
    thematicRole: 'development',
    developmentTechnique: 'diminution',
    dynamicLevel: 0.7,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.8,
    rhythmicComplexity: 0.6,
    harmonicTension: 0.4,
    harmonicFunction: 'dominant',
    textureType: 'polyphonic',
    articulationStyle: 'staccato',
    barLength: 8
  },
  var3: {
    ...DEFAULT_SECTION,
    thematicRole: 'recapitulation',
    developmentTechnique: 'augmentation',
    dynamicLevel: 0.8,
    dynamicContour: 'diminuendo',
    rhythmicDensity: 0.3,
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'legato',
    barLength: 8
  }
}

const THROUGH_COMPOSED_SECTIONS = {
  A: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'statement',
    dynamicLevel: 0.5,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.4,
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'legato',
    barLength: 8
  },
  B: {
    ...DEFAULT_SECTION,
    thematicRole: 'development',
    developmentTechnique: 'sequence',
    dynamicLevel: 0.6,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.6,
    harmonicTension: 0.5,
    harmonicFunction: 'dominant',
    textureType: 'polyphonic',
    articulationStyle: 'portato',
    barLength: 8
  },
  C: {
    ...DEFAULT_SECTION,
    thematicRole: 'coda',
    developmentTechnique: 'fragmentation',
    dynamicLevel: 0.7,
    dynamicContour: 'diminuendo',
    rhythmicDensity: 0.5,
    harmonicTension: 0.3,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'legato',
    barLength: 8
  }
}

const STROPHIC_SECTIONS = {
  strophe: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'repetition',
    dynamicLevel: 0.5,
    dynamicContour: 'stable',
    rhythmicDensity: 0.5,
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'legato',
    barLength: 8
  }
}

// ============================================================================
// POP/SONG FORMS
// ============================================================================

const VERSE_CHORUS_SECTIONS = {
  intro: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'fragmentation',
    dynamicLevel: 0.3,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.3,
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'monophonic',
    articulationStyle: 'legato',
    barLength: 4
  },
  verse: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'statement',
    dynamicLevel: 0.5,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.4,
    harmonicTension: 0.3,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'legato',
    barLength: 8
  },
  chorus: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'repetition',
    dynamicLevel: 0.8,
    dynamicContour: 'stable',
    rhythmicDensity: 0.6,
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'marcato',
    barLength: 8
  },
  bridge: {
    ...DEFAULT_SECTION,
    thematicRole: 'development',
    developmentTechnique: 'variation',
    dynamicLevel: 0.6,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.5,
    rhythmicComplexity: 0.5,
    harmonicTension: 0.6,
    harmonicFunction: 'predominant',
    textureType: 'polyphonic',
    articulationStyle: 'portato',
    barLength: 8
  },
  outro: {
    ...DEFAULT_SECTION,
    thematicRole: 'coda',
    developmentTechnique: 'diminution',
    dynamicLevel: 0.4,
    dynamicContour: 'diminuendo',
    rhythmicDensity: 0.3,
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'monophonic',
    articulationStyle: 'legato',
    barLength: 4
  }
}

const INTRO_VERSE_CHORUS_BRIDGE_OUTRO_SECTIONS = {
  ...VERSE_CHORUS_SECTIONS
}

// ============================================================================
// JAZZ FORMS
// ============================================================================

const BLUES_SECTIONS = {
  blues: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'variation',
    dynamicLevel: 0.6,
    dynamicContour: 'stable',
    rhythmicDensity: 0.5,
    rhythmicComplexity: 0.6,
    harmonicTension: 0.4,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'portato',
    barLength: 12
  }
}

const RHYTHM_CHANGES_SECTIONS = {
  A: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'statement',
    dynamicLevel: 0.6,
    dynamicContour: 'stable',
    rhythmicDensity: 0.6,
    rhythmicComplexity: 0.6,
    harmonicTension: 0.3,
    harmonicFunction: 'tonic',
    textureType: 'polyphonic',
    articulationStyle: 'staccato',
    barLength: 8
  },
  B: {
    ...DEFAULT_SECTION,
    thematicRole: 'development',
    developmentTechnique: 'sequence',
    dynamicLevel: 0.7,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.7,
    rhythmicComplexity: 0.7,
    harmonicTension: 0.5,
    harmonicFunction: 'dominant',
    textureType: 'polyphonic',
    articulationStyle: 'staccato',
    barLength: 8
  }
}

const MODAL_SECTIONS = {
  A: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'statement',
    dynamicLevel: 0.5,
    dynamicContour: 'stable',
    rhythmicDensity: 0.4,
    rhythmicComplexity: 0.4,
    harmonicRhythm: 'slow',
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'legato',
    barLength: 8
  },
  B: {
    ...DEFAULT_SECTION,
    thematicRole: 'development',
    developmentTechnique: 'variation',
    dynamicLevel: 0.6,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.5,
    rhythmicComplexity: 0.5,
    harmonicRhythm: 'medium',
    harmonicTension: 0.4,
    harmonicFunction: 'predominant',
    textureType: 'polyphonic',
    articulationStyle: 'portato',
    barLength: 8
  }
}

// ============================================================================
// ELECTRONIC/CONTEMPORARY FORMS
// ============================================================================

const BUILD_DROP_SECTIONS = {
  build: {
    ...DEFAULT_SECTION,
    thematicRole: 'transition',
    developmentTechnique: 'augmentation',
    dynamicLevel: 0.4,
    dynamicContour: 'crescendo',
    rhythmicDensity: 0.6,
    rhythmicComplexity: 0.3,
    harmonicTension: 0.6,
    harmonicFunction: 'dominant',
    textureType: 'homophonic',
    articulationStyle: 'staccato',
    barLength: 8
  },
  drop: {
    ...DEFAULT_SECTION,
    thematicRole: 'exposition',
    developmentTechnique: 'statement',
    dynamicLevel: 0.9,
    dynamicContour: 'stable',
    rhythmicDensity: 0.8,
    rhythmicComplexity: 0.5,
    harmonicTension: 0.2,
    harmonicFunction: 'tonic',
    textureType: 'homophonic',
    articulationStyle: 'marcato',
    barLength: 8
  },
  breakdown: {
    ...DEFAULT_SECTION,
    thematicRole: 'development',
    developmentTechnique: 'fragmentation',
    dynamicLevel: 0.4,
    dynamicContour: 'diminuendo',
    rhythmicDensity: 0.3,
    harmonicTension: 0.4,
    harmonicFunction: 'predominant',
    textureType: 'monophonic',
    articulationStyle: 'legato',
    barLength: 4
  }
}

// ============================================================================
// FORM DEFINITIONS REGISTRY
// ============================================================================

const FORM_DEFINITIONS = {
  sonata: SONATA_SECTIONS,
  ABA: ABA_SECTIONS,
  rondo: RONDO_SECTIONS,
  AABA: AABA_SECTIONS,
  theme_and_variations: THEME_AND_VARIATIONS_SECTIONS,
  through_composed: THROUGH_COMPOSED_SECTIONS,
  strophic: STROPHIC_SECTIONS,
  verse_chorus: VERSE_CHORUS_SECTIONS,
  intro_verse_chorus_bridge_outro: INTRO_VERSE_CHORUS_BRIDGE_OUTRO_SECTIONS,
  blues: BLUES_SECTIONS,
  rhythm_changes: RHYTHM_CHANGES_SECTIONS,
  modal: MODAL_SECTIONS,
  build_drop: BUILD_DROP_SECTIONS
}

// Form sequences (order of sections in each form)
const FORM_SEQUENCES = {
  sonata: ['exposition', 'development', 'recapitulation'],
  ABA: ['A', 'B', 'A'],
  rondo: ['A', 'B', 'A', 'C', 'A'],
  AABA: ['A', 'A', 'B', 'A'],
  theme_and_variations: ['theme', 'var1', 'var2', 'var3'],
  through_composed: ['A', 'B', 'C'],
  strophic: ['strophe', 'strophe', 'strophe'],
  verse_chorus: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
  intro_verse_chorus_bridge_outro: ['intro', 'verse', 'chorus', 'bridge', 'outro'],
  blues: ['blues'],
  rhythm_changes: ['A', 'A', 'B', 'A'],
  modal: ['A', 'A', 'B', 'A'],
  build_drop: ['build', 'drop', 'breakdown']
}

// ============================================================================
// VOICE ROLE MODIFIERS
// ============================================================================

const VOICE_ROLE_MODIFIERS = {
  soprano: {
    registerOffset: +0.2,
    densityMultiplier: 1.2,
    dynamicOffset: +0.1,
    articulationBias: 'legato'
  },
  melody: {
    registerOffset: +0.2,
    densityMultiplier: 1.2,
    dynamicOffset: +0.1,
    articulationBias: 'legato'
  },
  alto: {
    registerOffset: 0,
    densityMultiplier: 0.8,
    dynamicOffset: -0.1,
    articulationBias: 'portato'
  },
  harmony: {
    registerOffset: 0,
    densityMultiplier: 0.8,
    dynamicOffset: -0.1,
    articulationBias: 'portato'
  },
  tenor: {
    registerOffset: -0.1,
    densityMultiplier: 0.9,
    dynamicOffset: 0,
    articulationBias: 'portato'
  },
  bass: {
    registerOffset: -0.3,
    densityMultiplier: 0.5,
    dynamicOffset: 0,
    articulationBias: 'marcato'
  },
  pad: {
    registerOffset: -0.1,
    densityMultiplier: 0.3,
    dynamicOffset: -0.2,
    articulationBias: 'legato'
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get section parameters for a specific form and section
 * Fix #7: Returns _isFallback flag when fallback was used
 * @param {string} formType - The form type (e.g., 'sonata', 'ABA')
 * @param {string} sectionType - The section type (e.g., 'A', 'exposition')
 * @returns {Object} Section parameters with _isFallback and _fallbackReason if applicable
 */
function getSectionParams(formType, sectionType) {
  const formDef = FORM_DEFINITIONS[formType]
  if (!formDef) {
    console.warn(`Unknown form type: ${formType}, using ABA`)
    const fallbackSection = FORM_DEFINITIONS.ABA[sectionType] || FORM_DEFINITIONS.ABA.A
    return {
      ...fallbackSection,
      sectionType: sectionType || 'A',
      formType: 'ABA',
      _isFallback: true,
      _fallbackReason: `Unknown form type: ${formType}`
    }
  }

  const sectionDef = formDef[sectionType]
  if (!sectionDef) {
    // Try to find a matching section or return default
    const firstSection = Object.keys(formDef)[0]
    console.warn(`Unknown section ${sectionType} for form ${formType}, using ${firstSection}`)
    return {
      ...formDef[firstSection],
      sectionType: firstSection,
      formType,
      _isFallback: true,
      _fallbackReason: `Unknown section ${sectionType} for form ${formType}`
    }
  }

  return { ...sectionDef, sectionType, formType, _isFallback: false }
}

/**
 * Get the sequence of sections for a form
 * @param {string} formType - The form type
 * @returns {string[]} Array of section names in order
 */
function getFormSequence(formType) {
  return FORM_SEQUENCES[formType] || FORM_SEQUENCES.ABA
}

/**
 * Get form cycle length (number of sections to complete one cycle)
 * @param {string} formType - The form type
 * @returns {number} Number of sections in one cycle
 */
function getFormCycleLength(formType) {
  return (FORM_SEQUENCES[formType] || FORM_SEQUENCES.ABA).length
}

/**
 * Apply voice role modifiers to section parameters
 * @param {Object} sectionParams - Base section parameters
 * @param {string} voiceRole - Voice role (soprano, alto, tenor, bass, etc.)
 * @returns {Object} Modified parameters
 */
function applyVoiceRole(sectionParams, voiceRole) {
  const modifiers = VOICE_ROLE_MODIFIERS[voiceRole] || VOICE_ROLE_MODIFIERS.alto

  return {
    ...sectionParams,
    registerCenter: Math.max(0, Math.min(1, sectionParams.registerCenter + modifiers.registerOffset)),
    rhythmicDensity: sectionParams.rhythmicDensity * modifiers.densityMultiplier,
    dynamicLevel: Math.max(0, Math.min(1, sectionParams.dynamicLevel + modifiers.dynamicOffset)),
    articulationStyle: sectionParams.articulationStyle === 'mixed'
      ? modifiers.articulationBias
      : sectionParams.articulationStyle
  }
}

/**
 * Get development technique progression for a thematic role
 * Development sections intensify technique as progress increases
 * @param {string} thematicRole - The thematic role (exposition, development, etc.)
 * @param {number} progress - Progress within section (0-1)
 * @returns {string} Development technique
 */
function getTechniqueForProgress(thematicRole, progress) {
  if (thematicRole === 'development') {
    // Development sections intensify
    if (progress < 0.33) return 'variation'
    if (progress < 0.66) return 'fragmentation'
    return 'sequence'
  }

  if (thematicRole === 'recapitulation') {
    // Recapitulation starts with variation, returns to statement
    if (progress < 0.5) return 'variation'
    return 'statement'
  }

  if (thematicRole === 'coda') {
    // Coda uses fragmentation and diminution
    if (progress < 0.5) return 'fragmentation'
    return 'diminution'
  }

  // Exposition and transition use statement
  return 'statement'
}

/**
 * Apply dynamic contour to base level
 * @param {number} baseLevel - Base dynamic level (0-1)
 * @param {string} contour - Contour type
 * @param {number} progress - Progress within section (0-1)
 * @returns {number} Modified dynamic level
 */
function applyDynamicContour(baseLevel, contour, progress) {
  switch (contour) {
    case 'crescendo':
      return Math.min(1, baseLevel + progress * 0.3)
    case 'diminuendo':
      return Math.max(0, baseLevel - progress * 0.3)
    case 'terraced':
      return baseLevel + (Math.floor(progress * 3) / 3) * 0.2
    case 'swell':
      // Crescendo then diminuendo
      const swellFactor = progress < 0.5 ? progress * 2 : (1 - progress) * 2
      return baseLevel + swellFactor * 0.2
    default:
      return baseLevel
  }
}

/**
 * Evolve section parameters based on progress
 * @param {Object} sectionParams - Base section parameters
 * @param {number} progress - Progress within section (0-1)
 * @returns {Object} Evolved parameters
 */
function evolveSectionParams(sectionParams, progress) {
  return {
    ...sectionParams,
    progressionPosition: progress,
    dynamicLevel: applyDynamicContour(
      sectionParams.dynamicLevel,
      sectionParams.dynamicContour,
      progress
    ),
    harmonicTension: sectionParams.thematicRole === 'development'
      ? sectionParams.harmonicTension + progress * 0.2
      : sectionParams.harmonicTension,
    developmentTechnique: getTechniqueForProgress(sectionParams.thematicRole, progress)
  }
}

module.exports = {
  FORM_DEFINITIONS,
  FORM_SEQUENCES,
  VOICE_ROLE_MODIFIERS,
  DEFAULT_SECTION,
  getSectionParams,
  getFormSequence,
  getFormCycleLength,
  applyVoiceRole,
  getTechniqueForProgress,
  applyDynamicContour,
  evolveSectionParams
}
