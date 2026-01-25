/**
 * GenreCharacteristics.js - Centralized genre-specific musical configurations
 * Entry #180: Complete genre differentiation system
 *
 * Each genre has distinct characteristics for:
 * - Voice configuration (count, roles, density)
 * - Rhythm patterns (multiple patterns per role that cycle)
 * - Duration pools (note lengths per role)
 * - Articulation and swing
 * - Synth parameters (filter, envelope, effects)
 *
 * Entry #180b: Added validation, PHI distribution fix, swing/syncopation integration
 */

// Golden ratio for non-repetitive PHI-based cycling (Entry #114, #117)
const PHI = 1.618033988749895

// Maximum voices allowed for performance safety
const MAX_VOICES = 8

// ============================================
// GENRE CHARACTERISTICS
// ============================================
const GENRE_CHARACTERISTICS = {
  // ============================================
  // AMBIENT - Atmospheric, textural, minimal
  // Reference: Brian Eno, Aphex Twin Selected Ambient Works
  // ============================================
  ambient: {
    voiceConfig: {
      voiceCount: 2,
      roles: ['pad', 'texture'],
      padDensity: 0.9,
      melodyDensity: 0.15,
      bassDensity: 0.2,
      textureDensity: 0.8
    },
    rhythmPatterns: {
      melody: [[8], [6, 2], [4, 4]],
      accompaniment: [[16], [8, 8], [12, 4]],
      bass: [[8], [16]],
      pad: [[16], [12, 4], [8, 8]]
    },
    durationPools: {
      melody: [2.0, 3.0, 4.0, 6.0],
      harmony: [4.0, 6.0, 8.0],
      bass: [4.0, 8.0, 16.0],
      pad: [8.0, 12.0, 16.0, 24.0]
    },
    articulation: 'legato',
    swingAmount: 0,
    syncopation: 0.05,
    synthParams: {
      filterCutoff: 600,    // Low-pass for warm, dark ambient timbre
      filterQ: 0.3,         // Gentle slope for smooth texture
      attackTime: 0.5,      // Slow attack for pad-like fade in
      releaseTime: 2.0,     // Long release for sustained ambient notes
      delaySend: 0.5,       // Spacious delay for depth
      reverbSend: 0.7,      // Very wet for immersive atmosphere
      reverbDecay: 4.0      // Long reverb tail for expansive space
    }
  },

  // ============================================
  // ELECTRONIC (House/Techno) - Driving, repetitive, 4-on-floor
  // Reference: 120-130 BPM, TR-909 aesthetic
  // ============================================
  electronic: {
    voiceConfig: {
      voiceCount: 3,
      roles: ['melody', 'bass', 'arpeggio'],
      melodyDensity: 0.7,
      bassDensity: 0.85,
      arpeggioDensity: 0.9,
      padDensity: 0.3
    },
    rhythmPatterns: {
      melody: [
        [0.5, 0.25, 0.25],
        [0.25, 0.25, 0.5],
        [0.75, 0.25],
        [0.25, 0.25, 0.25, 0.25]
      ],
      accompaniment: [
        [0.25, 0.25, 0.25, 0.25],
        [0.125, 0.125, 0.25, 0.25, 0.25],
        [0.5, 0.25, 0.25]
      ],
      bass: [
        [0.5, 0.5],
        [0.25, 0.75],
        [0.25, 0.25, 0.25, 0.25],
        [1, 0.5, 0.5]
      ],
      pad: [[4], [2, 2], [4]]
    },
    durationPools: {
      melody: [0.125, 0.25, 0.375, 0.5],
      harmony: [0.25, 0.5, 1.0],
      bass: [0.125, 0.25, 0.5],
      pad: [2.0, 4.0]
    },
    articulation: 'staccato',
    swingAmount: 0,
    syncopation: 0.6,
    synthParams: {
      filterCutoff: 3500,   // Bright, cutting through mix (synth lead characteristic)
      filterQ: 2.5,         // Resonant peak for acid/303-style sounds
      attackTime: 0.005,    // Near-instant attack for punchy transients
      releaseTime: 0.1,     // Quick release for tight rhythmic precision
      delaySend: 0.35,      // Rhythmic delay for groove enhancement
      reverbSend: 0.15,     // Dry-ish, keeps rhythm tight
      reverbDecay: 1.0      // Short reverb for clarity
    }
  },

  // ============================================
  // JAZZ - Swing feel, complex harmony, improvised character
  // Reference: Bebop/post-bop comping, walking bass
  // ============================================
  jazz: {
    voiceConfig: {
      voiceCount: 4,
      roles: ['melody', 'comping', 'bass', 'pad'],
      melodyDensity: 0.55,
      compingDensity: 0.5,
      bassDensity: 0.7,
      padDensity: 0.3
    },
    rhythmPatterns: {
      melody: [
        [1.5, 0.5],
        [0.5, 1, 0.5],
        [1, 0.5, 0.5],
        [0.75, 0.75, 0.5],
        [2, 0.5, 0.5, 1]
      ],
      accompaniment: [
        [1, 0.5, 1.5, 1],
        [0.5, 1, 0.5, 2],
        [1.5, 1.5, 1],
        [2, 1, 1],
        [0.5, 0.5, 1, 2]
      ],
      bass: [
        [1, 1, 1, 1],
        [1.5, 0.5, 1, 1],
        [1, 1, 0.5, 0.5, 1],
        [2, 1, 1]
      ],
      pad: [[4], [2, 2], [4, 4]]
    },
    durationPools: {
      melody: [0.5, 0.75, 1.0, 1.5, 2.0, 3.0],
      harmony: [0.5, 1.0, 1.5, 2.0],
      bass: [0.75, 1.0, 1.5],
      pad: [2.0, 4.0, 8.0]
    },
    articulation: 'portato',      // Between legato and staccato, jazz phrasing
    swingAmount: 0.67,            // Classic 2:1 swing ratio (triplet feel)
    syncopation: 0.7,             // High syncopation for jazz anticipations
    synthParams: {
      filterCutoff: 2200,   // Warm but clear, electric piano territory
      filterQ: 0.8,         // Subtle resonance, not harsh
      attackTime: 0.015,    // Quick but not aggressive, piano-like
      releaseTime: 0.25,    // Natural decay for acoustic feel
      delaySend: 0.2,       // Light delay for depth
      reverbSend: 0.35,     // Club/studio ambience
      reverbDecay: 1.8      // Medium reverb for jazz club feel
    }
  },

  // ============================================
  // ROCK - Driving, backbeat emphasis, power chords
  // Reference: Classic rock energy, 4/4 power
  // ============================================
  rock: {
    voiceConfig: {
      voiceCount: 4,
      roles: ['melody', 'powerchord', 'bass', 'pad'],
      melodyDensity: 0.65,
      powerchordDensity: 0.75,
      bassDensity: 0.85,
      padDensity: 0.25
    },
    rhythmPatterns: {
      melody: [
        [0.5, 0.5, 1],
        [0.75, 0.25, 1],
        [0.5, 1, 0.5],
        [1, 0.5, 0.5]
      ],
      accompaniment: [
        [0.5, 0.5, 0.5, 0.5],
        [1, 0.5, 0.5],
        [0.5, 0.5, 1],
        [0.25, 0.25, 0.5, 1],
        [0.5, 1, 0.5, 1, 0.5]
      ],
      bass: [
        [0.5, 0.5, 0.5, 0.5],
        [1, 0.5, 0.5],
        [0.25, 0.25, 0.5, 0.5, 0.5],
        [0.5, 0.5, 1]
      ],
      pad: [[4], [2, 2]]
    },
    durationPools: {
      melody: [0.25, 0.5, 0.75, 1.0, 1.5],
      harmony: [0.5, 1.0, 1.5, 2.0],
      bass: [0.25, 0.5, 0.75],
      pad: [2.0, 4.0]
    },
    articulation: 'marcato',       // Accented, strong attack for rock energy
    swingAmount: 0,                // Straight rock feel, no swing
    syncopation: 0.4,              // Some push/pull but mostly on-beat
    synthParams: {
      filterCutoff: 2800,   // Bright and aggressive, guitar-like presence
      filterQ: 1.8,         // Some edge/grit from resonance
      attackTime: 0.008,    // Fast attack for punch and impact
      releaseTime: 0.2,     // Tight release, keeps rhythm crisp
      delaySend: 0.1,       // Minimal delay, keeps it raw
      reverbSend: 0.2,      // Room sound, not washy
      reverbDecay: 1.2      // Short reverb for live room feel
    }
  },

  // ============================================
  // CLASSICAL - Balanced voices, counterpoint, phrase structure
  // Reference: Romantic era, clear voice leading
  // ============================================
  classical: {
    voiceConfig: {
      voiceCount: 4,
      roles: ['melody', 'alto', 'tenor', 'bass'],
      melodyDensity: 0.5,
      altoDensity: 0.45,
      tenorDensity: 0.4,
      bassDensity: 0.4
    },
    rhythmPatterns: {
      melody: [
        [1, 1, 2],
        [0.5, 0.5, 1, 2],
        [2, 1, 1],
        [1.5, 0.5, 1, 1],
        [1, 1, 1, 1]
      ],
      accompaniment: [
        [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        [1, 1, 1, 1],
        [2, 2],
        [0.5, 1, 0.5, 1, 0.5, 0.5]
      ],
      bass: [
        [2, 2],
        [4],
        [1, 1, 2],
        [1, 1, 1, 1]
      ],
      pad: [[4], [8], [4, 4]]
    },
    durationPools: {
      melody: [0.5, 1.0, 1.5, 2.0, 3.0, 4.0],
      harmony: [1.0, 1.5, 2.0, 4.0],
      bass: [1.0, 2.0, 4.0],
      pad: [4.0, 8.0]
    },
    articulation: 'legato',        // Smooth, connected phrases
    swingAmount: 0,                // No swing in classical
    syncopation: 0.15,             // Minimal syncopation, mostly on-beat
    synthParams: {
      filterCutoff: 1400,   // Warm, not harsh - strings/piano territory
      filterQ: 0.5,         // Smooth, gentle resonance
      attackTime: 0.06,     // Gentle attack for bowed/struck instruments
      releaseTime: 0.5,     // Natural acoustic decay
      delaySend: 0.08,      // Minimal delay, preserve clarity
      reverbSend: 0.45,     // Concert hall ambience
      reverbDecay: 2.5      // Long reverb for orchestral space
    }
  },

  // ============================================
  // MELODIC (Pop ballad style) - Singable melody, clear harmony
  // ============================================
  melodic: {
    voiceConfig: {
      voiceCount: 3,
      roles: ['melody', 'harmony', 'bass'],
      melodyDensity: 0.6,
      harmonyDensity: 0.5,
      bassDensity: 0.5
    },
    rhythmPatterns: {
      melody: [
        [1, 1, 1, 1],
        [0.5, 0.5, 1, 1, 1],
        [1.5, 0.5, 2],
        [1, 0.5, 0.5, 2]
      ],
      accompaniment: [
        [1, 1, 1, 1],
        [2, 2],
        [0.5, 0.5, 0.5, 0.5, 2]
      ],
      bass: [
        [2, 2],
        [1, 1, 2],
        [1, 1, 1, 1]
      ],
      pad: [[4], [2, 2], [4, 4]]
    },
    durationPools: {
      melody: [0.5, 1.0, 1.5, 2.0],
      harmony: [1.0, 2.0, 4.0],
      bass: [1.0, 2.0],
      pad: [4.0, 8.0]
    },
    articulation: 'legato',
    swingAmount: 0,
    syncopation: 0.25,
    synthParams: {
      filterCutoff: 1800,
      filterQ: 0.6,
      attackTime: 0.03,
      releaseTime: 0.4,
      delaySend: 0.25,
      reverbSend: 0.35,
      reverbDecay: 1.8
    }
  },

  // ============================================
  // RHYTHMIC (Funk/Groove) - Syncopated, groove-focused
  // ============================================
  rhythmic: {
    voiceConfig: {
      voiceCount: 3,
      roles: ['melody', 'rhythm', 'bass'],
      melodyDensity: 0.55,
      rhythmDensity: 0.85,
      bassDensity: 0.9
    },
    rhythmPatterns: {
      melody: [
        [0.5, 0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.5, 0.25],
        [0.5, 0.5]
      ],
      accompaniment: [
        [0.25, 0.75],
        [0.25, 0.25, 0.5],
        [0.5, 0.25, 0.25],
        [0.25, 0.25, 0.25, 0.25]
      ],
      bass: [
        [0.25, 0.75],
        [0.5, 0.25, 0.25],
        [0.25, 0.5, 0.25],
        [0.25, 0.25, 0.5]
      ],
      pad: [[2], [1, 1], [2, 2]]
    },
    durationPools: {
      melody: [0.25, 0.5, 0.75],
      harmony: [0.25, 0.5, 1.0],
      bass: [0.125, 0.25, 0.5],
      pad: [2.0, 4.0]
    },
    articulation: 'staccato',
    swingAmount: 0.15,
    syncopation: 0.85,
    synthParams: {
      filterCutoff: 2500,
      filterQ: 1.5,
      attackTime: 0.01,
      releaseTime: 0.15,
      delaySend: 0.2,
      reverbSend: 0.2,
      reverbDecay: 1.0
    }
  },

  // ============================================
  // EXPERIMENTAL - Unpredictable, asymmetric, textural
  // ============================================
  experimental: {
    voiceConfig: {
      voiceCount: 3,
      roles: ['texture', 'melody', 'noise'],
      textureDensity: 0.7,
      melodyDensity: 0.4,
      noiseDensity: 0.5,
      bassDensity: 0.4
    },
    rhythmPatterns: {
      melody: [
        [0.75, 0.5, 1.25],
        [0.33, 0.67, 1],
        [2.5, 0.5],
        [0.25, 1.75]
      ],
      accompaniment: [
        [1.5, 0.5, 1],
        [0.5, 0.5, 0.5, 1.5],
        [3, 1]
      ],
      bass: [
        [2, 1, 1],
        [0.5, 2.5],
        [1.5, 1.5, 1]
      ],
      pad: [[3], [5], [7], [4]]
    },
    durationPools: {
      melody: [0.25, 0.75, 1.25, 2.5],
      harmony: [0.5, 1.5, 3.0],
      bass: [1.0, 1.5, 2.5],
      pad: [3.0, 5.0, 7.0]
    },
    articulation: 'varied',
    swingAmount: 0.3,
    syncopation: 0.6,
    synthParams: {
      filterCutoff: 1500,
      filterQ: 3.0,
      attackTime: 0.1,
      releaseTime: 0.8,
      delaySend: 0.5,
      reverbSend: 0.5,
      reverbDecay: 3.0
    }
  },

  // ============================================
  // POP - Accessible, catchy, I-V-vi-IV territory
  // ============================================
  pop: {
    voiceConfig: {
      voiceCount: 3,
      roles: ['melody', 'harmony', 'bass'],
      melodyDensity: 0.65,
      harmonyDensity: 0.55,
      bassDensity: 0.6
    },
    rhythmPatterns: {
      melody: [
        [1, 1, 1, 1],
        [0.5, 0.5, 1, 2],
        [1, 0.5, 0.5, 1, 1],
        [2, 1, 1]
      ],
      accompaniment: [
        [1, 1, 1, 1],
        [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        [2, 2]
      ],
      bass: [
        [1, 1, 1, 1],
        [2, 2],
        [0.5, 0.5, 1, 1, 1]
      ],
      pad: [[4], [2, 2], [4, 4]]
    },
    durationPools: {
      melody: [0.5, 1.0, 1.5, 2.0],
      harmony: [1.0, 2.0, 4.0],
      bass: [0.5, 1.0, 2.0],
      pad: [4.0, 8.0]
    },
    articulation: 'normal',
    swingAmount: 0,
    syncopation: 0.3,
    synthParams: {
      filterCutoff: 2200,
      filterQ: 1.0,
      attackTime: 0.02,
      releaseTime: 0.3,
      delaySend: 0.25,
      reverbSend: 0.3,
      reverbDecay: 1.5
    }
  }
}

// Default characteristics for unknown genres
const DEFAULT_CHARACTERISTICS = GENRE_CHARACTERISTICS.melodic

// Required structure keys for validation
const REQUIRED_KEYS = ['voiceConfig', 'rhythmPatterns', 'durationPools', 'synthParams']

/**
 * Validate that characteristics object has required structure
 * @param {Object} characteristics - Characteristics to validate
 * @returns {boolean} True if valid
 */
function validateCharacteristics(characteristics) {
  if (!characteristics || typeof characteristics !== 'object') return false
  return REQUIRED_KEYS.every(key => characteristics[key] && typeof characteristics[key] === 'object')
}

/**
 * Get characteristics for a specific genre
 * @param {string} genre - Genre name
 * @returns {Object} Genre characteristics object
 */
function getGenreCharacteristics(genre) {
  const characteristics = GENRE_CHARACTERISTICS[genre]
  if (characteristics && validateCharacteristics(characteristics)) {
    return characteristics
  }
  // Fallback to default if genre not found or malformed
  if (!validateCharacteristics(DEFAULT_CHARACTERISTICS)) {
    console.error('GenreCharacteristics: DEFAULT_CHARACTERISTICS is malformed!')
    // Return safe minimal structure
    return {
      voiceConfig: { voiceCount: 3, roles: ['melody', 'harmony', 'bass'], melodyDensity: 0.5 },
      rhythmPatterns: { melody: [[1, 1, 1, 1]], accompaniment: [[1, 1, 1, 1]], bass: [[2, 2]] },
      durationPools: { melody: [0.5, 1.0, 1.5, 2.0], harmony: [1.0, 2.0], bass: [1.0, 2.0] },
      articulation: 'normal',
      swingAmount: 0,
      syncopation: 0.3,
      synthParams: { filterCutoff: 1800, filterQ: 0.6, attackTime: 0.03, releaseTime: 0.4, delaySend: 0.2, reverbSend: 0.3 }
    }
  }
  return DEFAULT_CHARACTERISTICS
}

/**
 * Get rhythm pattern for a role, cycling through available patterns
 * @param {string} genre - Genre name
 * @param {string} role - Voice role (melody, accompaniment, bass, pad)
 * @param {number} compositionCount - Current composition count for variation
 * @returns {Array} Rhythm pattern array
 */
function getRhythmPattern(genre, role, compositionCount = 0) {
  const characteristics = getGenreCharacteristics(genre)
  if (!characteristics.rhythmPatterns) {
    return [1, 1, 1, 1]
  }
  const patterns = characteristics.rhythmPatterns[role] ||
                   characteristics.rhythmPatterns.melody ||
                   [[1, 1, 1, 1]]

  if (!Array.isArray(patterns) || patterns.length === 0) {
    return [1, 1, 1, 1]
  }

  // Entry #180b: Fixed PHI distribution - use modulo on raw value for even distribution
  // Old: Math.floor(((compositionCount * PHI) % 1) * patterns.length) - uneven for 5 patterns
  // New: Math.floor((compositionCount * PHI) % patterns.length) - all patterns accessible
  const patternIndex = Math.floor((compositionCount * PHI) % patterns.length)
  return patterns[patternIndex] || patterns[0]
}

/**
 * Get duration pool for a role
 * @param {string} genre - Genre name
 * @param {string} role - Voice role
 * @returns {Array} Duration pool array
 */
function getDurationPool(genre, role) {
  const characteristics = getGenreCharacteristics(genre)
  const fallbackPool = [0.5, 1.0, 1.5, 2.0]

  if (!characteristics.durationPools) {
    return fallbackPool
  }

  const pool = characteristics.durationPools[role] ||
               characteristics.durationPools.melody ||
               fallbackPool

  // Validate pool is an array with valid numbers
  if (!Array.isArray(pool) || pool.length === 0) {
    return fallbackPool
  }

  return pool
}

/**
 * Get a duration from the pool using PHI-based selection
 * @param {string} genre - Genre name
 * @param {string} role - Voice role
 * @param {number} index - Note index
 * @param {number} compositionCount - Composition count for variation
 * @returns {number} Duration value (always positive number)
 */
function getDuration(genre, role, index, compositionCount = 0) {
  const pool = getDurationPool(genre, role)
  const temporalOffset = (compositionCount * PHI) % 1
  const phiIndex = Math.floor(((index * PHI) + temporalOffset) % 1 * pool.length)
  const duration = pool[phiIndex]

  // Entry #180b: Validate duration is a positive finite number
  if (typeof duration === 'number' && isFinite(duration) && duration > 0) {
    return duration
  }

  // Fallback to safe default
  console.warn(`GenreCharacteristics: Invalid duration ${duration} for ${genre}/${role}, using 1.0`)
  return 1.0
}

/**
 * Get voice configuration for a genre
 * @param {string} genre - Genre name
 * @returns {Object} Voice configuration with capped voiceCount
 */
function getVoiceConfig(genre) {
  const characteristics = getGenreCharacteristics(genre)
  const voiceConfig = characteristics.voiceConfig

  if (!voiceConfig || typeof voiceConfig !== 'object') {
    return { voiceCount: 3, roles: ['melody', 'harmony', 'bass'], melodyDensity: 0.5 }
  }

  // Entry #180b: Cap voice count for performance safety
  return {
    ...voiceConfig,
    voiceCount: Math.min(voiceConfig.voiceCount || 3, MAX_VOICES)
  }
}

/**
 * Get density for a specific role in a genre
 * @param {string} genre - Genre name
 * @param {string} role - Voice role
 * @returns {number} Density value 0-1
 */
function getRoleDensity(genre, role) {
  const voiceConfig = getVoiceConfig(genre)
  const densityKey = `${role}Density`
  return voiceConfig[densityKey] || voiceConfig.melodyDensity || 0.5
}

/**
 * Get synth parameters for a genre
 * @param {string} genre - Genre name
 * @returns {Object} Synth parameters
 */
function getSynthParams(genre) {
  const characteristics = getGenreCharacteristics(genre)
  return characteristics.synthParams
}

/**
 * Get articulation style for a genre
 * @param {string} genre - Genre name
 * @returns {string} Articulation type (legato, staccato, marcato, portato, normal, varied)
 */
function getArticulation(genre) {
  const characteristics = getGenreCharacteristics(genre)
  return characteristics.articulation || 'normal'
}

/**
 * Get swing amount for a genre
 * @param {string} genre - Genre name
 * @returns {number} Swing ratio (0 = straight, 0.67 = jazz swing)
 */
function getSwingAmount(genre) {
  const characteristics = getGenreCharacteristics(genre)
  return characteristics.swingAmount || 0
}

/**
 * Get syncopation level for a genre
 * @param {string} genre - Genre name
 * @returns {number} Syncopation level 0-1
 */
function getSyncopation(genre) {
  const characteristics = getGenreCharacteristics(genre)
  return characteristics.syncopation || 0.3
}

/**
 * Get all available genres
 * @returns {Array} List of genre names
 */
function getAllGenres() {
  return Object.keys(GENRE_CHARACTERISTICS)
}

module.exports = {
  GENRE_CHARACTERISTICS,
  DEFAULT_CHARACTERISTICS,
  MAX_VOICES,
  PHI,
  getGenreCharacteristics,
  getRhythmPattern,
  getDurationPool,
  getDuration,
  getVoiceConfig,
  getRoleDensity,
  getSynthParams,
  getArticulation,
  getSwingAmount,
  getSyncopation,
  getAllGenres
}
