/**
 * GenreMelodicStrategies.js
 * Entry #181: Per-genre melodic behavior definitions
 *
 * Defines how note generation differs per genre for real user drags
 * Used by DragStreamingHandler to produce genre-appropriate melodies
 */

// PHI constant is provided by GenerativeMusicEngine.js (loaded first)

/**
 * Genre-specific melodic strategies
 * Each genre defines:
 * - intervalRange: max interval for fast/medium/slow velocities
 * - preferredIntervals: intervals favored by this genre (in semitones)
 * - noteRepetitionChance: probability of repeating the same note
 * - rhythmicDivision: base subdivision (1=whole, 2=half, 4=quarter, etc.)
 * - useSwing: whether to apply swing timing
 * - characteristics: additional genre-specific behaviors
 */
const GENRE_MELODIC_STRATEGIES = {
  // ============================================
  // ELECTRONIC - Arpeggiated sequences, repetitive, sequencer-like
  // ============================================
  electronic: {
    intervalRange: { fast: 5, medium: 4, slow: 3 },
    preferredIntervals: [0, 3, 5, 7, 12],  // Chord tones, octave - arpeggiated feel
    noteRepetitionChance: 0.35,  // Sequencer-like repetitions
    rhythmicDivision: 4,  // 16th notes
    useSwing: false,
    characteristics: {
      octaveTraversal: false,  // Stay in one octave for pattern clarity
      stepwiseChance: 0.2,     // Mostly leaps (arpeggios)
      sequenceLength: 4,       // Tend toward 4-note patterns
      accentPattern: [1, 0.7, 0.8, 0.7]  // Strong downbeats
    }
  },

  // ============================================
  // AMBIENT - Long sustained notes, minimal movement, wide intervals but slow
  // ============================================
  ambient: {
    intervalRange: { fast: 3, medium: 2, slow: 2 },  // Small intervals
    preferredIntervals: [0, 2, 5, 7, 12],  // Consonant, wide
    noteRepetitionChance: 0.6,  // Minimal movement - repeat notes often
    rhythmicDivision: 1,  // Whole notes
    useSwing: false,
    characteristics: {
      octaveTraversal: true,   // Wide range but slow
      stepwiseChance: 0.7,     // Mostly stepwise when moving
      minNoteDuration: 2.0,    // Force long notes
      forceSlowVelocity: true  // Override velocity to slow
    }
  },

  // ============================================
  // JAZZ - Chromatic approaches, bebop intervals, swing phrasing
  // ============================================
  jazz: {
    intervalRange: { fast: 7, medium: 5, slow: 4 },  // Wide range for expression
    preferredIntervals: [1, 2, 3, 4, 5, 6],  // Chromatic options
    noteRepetitionChance: 0.15,  // Rarely repeat - always moving
    rhythmicDivision: 2,  // 8th notes (with swing)
    useSwing: true,
    swingRatio: 0.67,
    characteristics: {
      octaveTraversal: true,
      stepwiseChance: 0.35,      // Mix of steps and leaps
      chromaticApproachChance: 0.4,  // Approach target chromatically
      encircleChance: 0.2        // Encircle target note (above-below-target)
    }
  },

  // ============================================
  // ROCK - Pentatonic-based, power chord outlines, driving
  // ============================================
  rock: {
    intervalRange: { fast: 5, medium: 4, slow: 3 },
    preferredIntervals: [0, 2, 3, 5, 7],  // Pentatonic intervals
    noteRepetitionChance: 0.25,  // Some repetition for drive
    rhythmicDivision: 2,  // 8th notes
    useSwing: false,
    characteristics: {
      octaveTraversal: false,    // Stay grounded
      stepwiseChance: 0.4,       // Mix
      bendChance: 0.15,          // Pitch bends (not implemented in synth but affects interval choice)
      accentsOnDownbeats: true,
      powerChordOutline: true    // Favor root-5th patterns
    }
  },

  // ============================================
  // CLASSICAL - Scalar passages, sequences, strict voice leading
  // ============================================
  classical: {
    intervalRange: { fast: 4, medium: 3, slow: 2 },  // Smaller intervals
    preferredIntervals: [1, 2],  // Stepwise motion dominant
    noteRepetitionChance: 0.1,   // Rarely repeat - continuous line
    rhythmicDivision: 2,  // 8th notes
    useSwing: false,
    characteristics: {
      octaveTraversal: true,     // Can traverse octaves
      stepwiseChance: 0.65,      // Mostly stepwise
      sequenceChance: 0.4,       // Repeat patterns transposed
      voiceLeadingStrict: true,  // Prefer smooth motion
      avoidTritone: true         // Avoid augmented 4th
    }
  },

  // ============================================
  // MELODIC (default) - Balanced, singable
  // ============================================
  melodic: {
    intervalRange: { fast: 5, medium: 4, slow: 3 },
    preferredIntervals: [0, 2, 3, 4, 5, 7],  // Common melodic intervals
    noteRepetitionChance: 0.2,
    rhythmicDivision: 2,
    useSwing: false,
    characteristics: {
      octaveTraversal: true,
      stepwiseChance: 0.5,
      contourAwareness: true     // Follow gesture direction
    }
  },

  // ============================================
  // RHYTHMIC (Funk/Groove) - Syncopated, groove-focused
  // ============================================
  rhythmic: {
    intervalRange: { fast: 4, medium: 3, slow: 3 },
    preferredIntervals: [0, 2, 3, 5],  // Funky intervals
    noteRepetitionChance: 0.45,  // Repetition for groove
    rhythmicDivision: 4,  // 16th notes
    useSwing: true,
    swingRatio: 0.55,  // Slight shuffle
    characteristics: {
      octaveTraversal: false,
      stepwiseChance: 0.3,
      accentOffBeats: true,      // Ghost notes, off-beat accents
      syncpationHeavy: true
    }
  },

  // ============================================
  // EXPERIMENTAL - Unpredictable, wide leaps, textural
  // ============================================
  experimental: {
    intervalRange: { fast: 8, medium: 7, slow: 6 },  // Wide intervals
    preferredIntervals: [1, 4, 6, 7, 11],  // Dissonant, unusual
    noteRepetitionChance: 0.3,
    rhythmicDivision: 1,  // Variable
    useSwing: false,
    characteristics: {
      octaveTraversal: true,
      stepwiseChance: 0.2,       // Mostly leaps
      randomIntervalChance: 0.3, // Sometimes fully random interval
      clustersAllowed: true,     // Can play close clusters
      extremeRegisters: true     // Use very high/low notes
    }
  },

  // ============================================
  // POP - Accessible, catchy, hook-driven
  // ============================================
  pop: {
    intervalRange: { fast: 5, medium: 4, slow: 3 },
    preferredIntervals: [0, 2, 4, 5, 7],  // Consonant, singable
    noteRepetitionChance: 0.35,  // Hook-like repetition
    rhythmicDivision: 2,
    useSwing: false,
    characteristics: {
      octaveTraversal: false,
      stepwiseChance: 0.55,
      hookPatternChance: 0.3,    // Repeat short motifs
      avoidComplexity: true      // Keep it simple
    }
  }
}

/**
 * Get melodic strategy for a genre
 * @param {string} genre - Genre name
 * @returns {Object} Melodic strategy object
 */
function getGenreMelodicStrategy(genre) {
  return GENRE_MELODIC_STRATEGIES[genre] || GENRE_MELODIC_STRATEGIES.melodic
}

/**
 * Get interval range for velocity tier
 * @param {string} genre - Genre name
 * @param {string} tier - Velocity tier ('fast', 'medium', 'slow')
 * @returns {number} Maximum interval in semitones
 */
function getIntervalRange(genre, tier) {
  const strategy = getGenreMelodicStrategy(genre)
  return strategy.intervalRange[tier] || 5
}

/**
 * Get a preferred interval for genre using PHI-based selection
 * @param {string} genre - Genre name
 * @param {number} index - Note index for variation
 * @returns {number} Interval in semitones
 */
function getPreferredInterval(genre, index) {
  const strategy = getGenreMelodicStrategy(genre)
  const intervals = strategy.preferredIntervals
  const phiIndex = Math.floor((index * PHI) % intervals.length)
  return intervals[phiIndex]
}

/**
 * Check if note should be repeated based on genre
 * @param {string} genre - Genre name
 * @param {number} phiValue - PHI-based random value (0-1)
 * @returns {boolean} True if note should repeat
 */
function shouldRepeatNote(genre, phiValue) {
  const strategy = getGenreMelodicStrategy(genre)
  return phiValue < strategy.noteRepetitionChance
}

/**
 * Check if stepwise motion should be used
 * @param {string} genre - Genre name
 * @param {number} phiValue - PHI-based random value (0-1)
 * @returns {boolean} True if stepwise motion preferred
 */
function shouldUseStepwise(genre, phiValue) {
  const strategy = getGenreMelodicStrategy(genre)
  return phiValue < (strategy.characteristics?.stepwiseChance || 0.5)
}

/**
 * Get all available genres
 * @returns {string[]} Array of genre names
 */
function getAllMelodicGenres() {
  return Object.keys(GENRE_MELODIC_STRATEGIES)
}

// Export for browser
if (typeof window !== 'undefined') {
  window.GenreMelodicStrategies = {
    GENRE_MELODIC_STRATEGIES,
    getGenreMelodicStrategy,
    getIntervalRange,
    getPreferredInterval,
    shouldRepeatNote,
    shouldUseStepwise,
    getAllMelodicGenres
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GENRE_MELODIC_STRATEGIES,
    getGenreMelodicStrategy,
    getIntervalRange,
    getPreferredInterval,
    shouldRepeatNote,
    shouldUseStepwise,
    getAllMelodicGenres
  }
}
