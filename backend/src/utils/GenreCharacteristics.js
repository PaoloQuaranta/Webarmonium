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

// Entry #183: Default genre constant to avoid magic strings
const DEFAULT_GENRE = 'ambient'

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
    // Entry #206: Orchestration - which voices play together
    orchestration: {
      counterpoint: ['melody'],  // Sparse melody only
      accompaniment: ['pad'],    // Pad dominant, no keys or bass
      velocities: {
        melody: 0.5,      // Quiet, atmospheric
        harmony: 0.3,
        bass_voice: 0.3,
        bass_accomp: 0.2,
        pad: 0.8,         // Dominant pad
        keys: 0.2
      }
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
      filterCutoff: 500,    // Very low-pass for warm, dark ambient timbre
      filterQ: 0.2,         // Very gentle slope for ultra-smooth texture
      attackTime: 1.5,      // Entry #181: Very slow attack (was 0.5) for ethereal fade-in
      releaseTime: 4.0,     // Entry #181: Very long release (was 2.0) for sustained ambient notes
      delaySend: 0.6,       // Spacious delay for depth
      delayFeedback: 0.55,  // Entry #181: Moderate feedback for cascading echoes
      delayTime: 0.5,       // Entry #181: 500ms for spacious, tempo-disconnected echoes
      reverbSend: 0.85,     // Entry #181: Very wet (was 0.7) for immersive atmosphere
      reverbDecay: 10.0     // Entry #181: Very long reverb (was 4.0) for vast expansive space
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
    // Entry #206: Orchestration - driving bass and rhythmic keys
    orchestration: {
      counterpoint: ['melody', 'bass_voice'],
      accompaniment: ['bass_accomp', 'keys'],  // Arpeggio-style keys
      velocities: {
        melody: 0.9,
        harmony: 0.5,
        bass_voice: 0.85,
        bass_accomp: 0.75,
        pad: 0.3,
        keys: 0.8         // Prominent arpeggios
      }
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
      filterCutoff: 4000,   // Entry #181: Brighter (was 3500), cutting through mix
      filterQ: 6.0,         // Entry #181: High resonance (was 2.5) for acid/303-style squelch
      attackTime: 0.002,    // Entry #181: Snappier (was 0.005) for punchy transients
      releaseTime: 0.06,    // Entry #181: Tighter (was 0.1) for crisp rhythmic precision
      delaySend: 0.45,      // Entry #181: More delay (was 0.35) for groove enhancement
      delayFeedback: 0.75,  // Entry #181: High feedback for pronounced echo trails
      delayTime: 0.15,      // Entry #181: 150ms for rhythmic, tempo-synced echoes
      reverbSend: 0.12,     // Entry #181: Drier (was 0.15), keeps rhythm tight
      reverbDecay: 0.8      // Entry #181: Shorter reverb (was 1.0) for clarity
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
    // Entry #206: Orchestration - full counterpoint with light comping
    orchestration: {
      counterpoint: ['melody', 'harmony', 'bass_voice'],  // Walking bass, melody, inner voice
      accompaniment: ['pad'],  // Light comping pad, no heavy keys
      velocities: {
        melody: 1.0,      // Lead voice prominent
        harmony: 0.6,     // Inner voice subtle
        bass_voice: 0.8,  // Walking bass clear
        bass_accomp: 0.3,
        pad: 0.4,         // Light comping
        keys: 0.3
      }
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
      delayFeedback: 0.4,   // Entry #181: Moderate feedback for jazzy depth
      delayTime: 0.3,       // Entry #181: 300ms for swung, triplet-feel echoes
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
    // Entry #206: Orchestration - driving rhythm section
    orchestration: {
      counterpoint: ['melody', 'bass_voice'],  // Lead + bass locked
      accompaniment: ['bass_accomp', 'keys'],  // Power chord keys
      velocities: {
        melody: 1.0,      // Lead guitar prominent
        harmony: 0.5,
        bass_voice: 0.9,  // Locked with drums
        bass_accomp: 0.7,
        pad: 0.3,         // Subtle sustain
        keys: 0.85        // Power chords
      }
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
      filterQ: 2.0,         // Entry #181: Slightly more edge (was 1.8) for grit
      attackTime: 0.005,    // Entry #181: Faster (was 0.008) for punch and impact
      releaseTime: 0.15,    // Entry #181: Tighter (was 0.2), keeps rhythm crisp
      delaySend: 0.15,      // Entry #181: Slight slapback (was 0.1)
      delayFeedback: 0.3,   // Entry #181: Low feedback for raw slapback feel
      delayTime: 0.2,       // Entry #181: 200ms for slapback/rockabilly echo
      reverbSend: 0.2,      // Room sound, not washy
      reverbDecay: 1.0      // Entry #181: Tighter room (was 1.2) for live feel
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
    // Entry #206: Orchestration - full SATB counterpoint with orchestral pad
    orchestration: {
      counterpoint: ['melody', 'harmony', 'bass_voice'],  // Full voice leading
      accompaniment: ['pad'],  // Orchestral sustain only
      velocities: {
        melody: 0.9,      // Soprano/lead
        harmony: 0.7,     // Alto/tenor balance
        bass_voice: 0.75, // Bass foundation
        bass_accomp: 0.3,
        pad: 0.5,         // Orchestral strings
        keys: 0.2
      }
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
      attackTime: 0.08,     // Entry #181: Slightly slower (was 0.06) for bowed instruments
      releaseTime: 0.6,     // Entry #181: Slightly longer (was 0.5) for natural decay
      delaySend: 0.08,      // Minimal delay, preserve clarity
      delayFeedback: 0.2,   // Entry #181: Very low feedback for subtle depth
      delayTime: 0.25,      // Entry #181: 250ms for subtle concert hall echo
      reverbSend: 0.5,      // Entry #181: More reverb (was 0.45) for concert hall
      reverbDecay: 3.0      // Entry #181: Longer (was 2.5) for orchestral space
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
    // Entry #206: Orchestration - balanced melody focus with support
    orchestration: {
      counterpoint: ['melody', 'harmony'],  // Lead + harmony
      accompaniment: ['pad', 'keys'],       // Full accompaniment support
      velocities: {
        melody: 1.0,      // Lead prominent
        harmony: 0.65,    // Supportive harmony
        bass_voice: 0.5,
        bass_accomp: 0.5,
        pad: 0.55,        // Warm pad
        keys: 0.6         // Gentle keys
      }
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
      delayFeedback: 0.35,  // Entry #181: Moderate feedback for pop shimmer
      delayTime: 0.28,      // Entry #181: 280ms for tempo-friendly echoes
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
    // Entry #206: Orchestration - groove-focused with rhythmic keys
    orchestration: {
      counterpoint: ['melody', 'bass_voice'],  // Funky bass line
      accompaniment: ['bass_accomp', 'keys'],  // Rhythmic section
      velocities: {
        melody: 0.85,     // Rhythmic melody
        harmony: 0.4,
        bass_voice: 0.95, // Funky bass prominent
        bass_accomp: 0.8,
        pad: 0.25,
        keys: 0.75        // Rhythmic stabs
      }
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
      filterQ: 1.8,         // Entry #181: More bite (was 1.5) for funk/groove edge
      attackTime: 0.008,    // Entry #181: Snappier (was 0.01) for tight funk hits
      releaseTime: 0.12,    // Entry #181: Tighter (was 0.15) for precise grooves
      delaySend: 0.25,      // Entry #181: Slightly more (was 0.2) for rhythmic depth
      delayFeedback: 0.5,   // Entry #181: Moderate-high for dub-influenced delays
      delayTime: 0.12,      // Entry #181: 120ms for tight rhythmic echoes
      reverbSend: 0.18,     // Entry #181: Slightly less (was 0.2) for clarity
      reverbDecay: 0.8      // Entry #181: Tighter (was 1.0) for dry funk sound
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
    // Entry #206: Orchestration - all voices sparse and textural
    orchestration: {
      counterpoint: ['melody', 'harmony', 'bass_voice'],  // All sparse
      accompaniment: ['pad', 'keys', 'bass_accomp'],      // All textural
      velocities: {
        melody: 0.6,      // Sparse, unpredictable
        harmony: 0.5,
        bass_voice: 0.55,
        bass_accomp: 0.45,
        pad: 0.65,        // Textural pads
        keys: 0.5         // Random stabs
      }
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
      filterQ: 4.0,         // Entry #181: More extreme (was 3.0) for experimental resonance
      attackTime: 0.15,     // Entry #181: Slower (was 0.1) for strange evolving attacks
      releaseTime: 1.2,     // Entry #181: Longer (was 0.8) for textural sustain
      delaySend: 0.55,      // Entry #181: More delay (was 0.5) for spacey effects
      delayFeedback: 0.7,   // Entry #181: High feedback for self-oscillating potential
      delayTime: 0.37,      // Entry #181: 370ms for off-grid, disorienting echoes
      reverbSend: 0.55,     // Entry #181: More reverb (was 0.5) for texture
      reverbDecay: 4.0      // Entry #181: Longer (was 3.0) for vast spaces
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
    // Entry #206: Orchestration - catchy melody with full band support
    orchestration: {
      counterpoint: ['melody', 'harmony'],
      accompaniment: ['bass_accomp', 'pad', 'keys'],
      velocities: {
        melody: 1.0,      // Hook melody prominent
        harmony: 0.6,
        bass_voice: 0.5,
        bass_accomp: 0.7, // Solid bass foundation
        pad: 0.5,         // Synth pad
        keys: 0.65        // Piano/synth
      }
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
      delayFeedback: 0.4,   // Entry #181: Moderate feedback for radio-friendly sheen
      delayTime: 0.22,      // Entry #181: 220ms for tempo-synced pop echoes
      reverbSend: 0.3,
      reverbDecay: 1.5
    }
  }
}

// Default characteristics for unknown genres
const DEFAULT_CHARACTERISTICS = GENRE_CHARACTERISTICS.melodic

// Required structure keys for validation
const REQUIRED_KEYS = ['voiceConfig', 'rhythmPatterns', 'durationPools', 'synthParams', 'orchestration']

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
      synthParams: { filterCutoff: 1800, filterQ: 0.6, attackTime: 0.03, releaseTime: 0.4, delaySend: 0.2, delayFeedback: 0.35, delayTime: 0.25, reverbSend: 0.3, reverbDecay: 1.5 },
      orchestration: {
        counterpoint: ['melody', 'harmony'],
        accompaniment: ['pad', 'keys'],
        velocities: { melody: 1.0, harmony: 0.7, bass_voice: 0.6, bass_accomp: 0.5, pad: 0.5, keys: 0.5 }
      }
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
 * Entry #206: Get orchestration configuration for a genre
 * Defines which counterpoint and accompaniment voices are active
 * @param {string} genre - Genre name
 * @returns {Object} Orchestration config with counterpoint, accompaniment, and velocities
 */
function getOrchestration(genre) {
  const characteristics = getGenreCharacteristics(genre)
  if (characteristics.orchestration) {
    return characteristics.orchestration
  }
  // Fallback orchestration
  return {
    counterpoint: ['melody', 'harmony'],
    accompaniment: ['pad', 'keys'],
    velocities: {
      melody: 1.0,
      harmony: 0.7,
      bass_voice: 0.6,
      bass_accomp: 0.5,
      pad: 0.5,
      keys: 0.5
    }
  }
}

/**
 * Get all available genres
 * @returns {Array} List of genre names
 */
function getAllGenres() {
  return Object.keys(GENRE_CHARACTERISTICS)
}

/**
 * Entry #183: Validate that a style object has required fields
 * @param {Object} style - Style object to validate
 * @returns {boolean} True if style is valid and usable
 */
function isValidStyle(style) {
  return style &&
         typeof style === 'object' &&
         (style.dominantGenre || style.forcedGenre) &&
         Object.keys(style).length > 0
}

/**
 * Entry #183: Create a standardized style object
 * Factory function to ensure consistent style structure across all services
 * @param {Object} options - Style creation options
 * @param {Object} [options.genreWeights={}] - Genre weight map from StyleAnalyzer
 * @param {string} [options.forcedGenre='ambient'] - Currently active genre from cycling
 * @param {number} [options.energy=0.5] - Energy level 0.0-1.0
 * @param {number} [options.currentBPM] - Current BPM (may be undefined)
 * @param {Object} [options.styleAnalyzerOutput] - Raw output from styleAnalyzer.getCurrentStyle()
 * @returns {Object} Standardized style object
 */
function createStyleObject(options = {}) {
  const {
    genreWeights = {},
    forcedGenre = DEFAULT_GENRE,
    energy = 0.5,
    currentBPM = undefined,
    styleAnalyzerOutput = null
  } = options

  // Use styleAnalyzer output if provided, otherwise use direct values
  const finalGenreWeights = styleAnalyzerOutput?.genreWeights || genreWeights
  const finalEnergy = styleAnalyzerOutput?.energy || energy

  return {
    genreWeights: finalGenreWeights,
    dominantGenre: forcedGenre,  // Entry #183: forcedGenre takes precedence for consistency
    forcedGenre: forcedGenre,
    energy: finalEnergy,
    currentBPM: currentBPM,
    synthParams: getSynthParams(forcedGenre)
  }
}

module.exports = {
  GENRE_CHARACTERISTICS,
  DEFAULT_CHARACTERISTICS,
  DEFAULT_GENRE,
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
  getOrchestration,
  getAllGenres,
  isValidStyle,
  createStyleObject
}
