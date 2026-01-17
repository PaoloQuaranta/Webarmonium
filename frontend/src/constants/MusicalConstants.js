/**
 * MusicalConstants.js
 * Centralized musical constants for Webarmonium
 * Phase 3 refactoring - Extract magic numbers
 */

// MIDI Reference Values
const MIDI_MIDDLE_C = 60      // C4 - Middle C
const MIDI_A4 = 69            // A4 - Concert pitch reference
const A4_FREQUENCY = 440      // Hz - A4 concert pitch
const SEMITONES_PER_OCTAVE = 12

// Octave Configuration
const DEFAULT_BASE_OCTAVE = 4 // Middle C octave
const MIN_OCTAVE = 0
const MAX_OCTAVE = 8

// Frequency Ranges (Hz)
const MIN_FREQUENCY = 20      // Lower limit of human hearing
const MAX_FREQUENCY = 20000   // Upper limit of human hearing
const MIN_MUSICAL_FREQUENCY = 32.7  // C0
const MAX_MUSICAL_FREQUENCY = 4186  // C8

// Tonic Range for Generative System
const MIN_TONIC_FREQUENCY = 110   // A2
const MAX_TONIC_FREQUENCY = 440   // A4

// Tempo Configuration (BPM)
const DEFAULT_TEMPO = 120
const MIN_TEMPO = 60
const MAX_TEMPO = 200

// Duration Constants (seconds at 120 BPM)
const DURATION_MAP = {
  '64n': 0.03125,   // 1/64 note
  '32n': 0.0625,    // 1/32 note
  '16n': 0.125,     // 1/16 note
  '8n': 0.25,       // 1/8 note
  '4n': 0.5,        // 1/4 note (quarter note)
  '2n': 1.0,        // 1/2 note (half note)
  '1n': 2.0,        // Whole note
  '1m': 4.0,        // 1 measure (4/4)
  '2m': 8.0,        // 2 measures
  '4m': 16.0        // 4 measures
}

// Layer Timing (ms) for Generative System
const LAYER_TIMING = {
  bass: { rhythm: 8000 },
  pad: { rhythm: 16000 },
  chords: { rhythm: 4000 }
}

// Polyphony Limits
const MAX_TOTAL_VOICES = 16
const MAX_SUSTAINED_NOTES = 8

// Envelope Defaults
const DEFAULT_ENVELOPE = {
  attack: 0.005,
  decay: 0.1,
  sustain: 0.5,
  release: 0.5
}

// Articulation Velocity Multipliers
const ARTICULATION_VELOCITY = {
  staccato: 0.3,
  marcato: 0.5,
  legato: 0.8
}

// Filter Configuration
const FILTER_CONFIG = {
  minFrequency: 200,
  maxFrequency: 2000,
  minQ: 0.5,
  maxQ: 5.0,
  defaultQ: 1.0
}

// Three-Tier Volume Configuration
const THREE_TIER_VOLUME = {
  background: 0.3,
  remote: 0.5,
  local: 0.8
}

/**
 * Convert MIDI note to frequency
 * @param {number} midiNote - MIDI note number (0-127)
 * @returns {number} Frequency in Hz
 */
function midiToFrequency(midiNote) {
  return A4_FREQUENCY * Math.pow(2, (midiNote - MIDI_A4) / SEMITONES_PER_OCTAVE)
}

/**
 * Convert frequency to MIDI note
 * @param {number} frequency - Frequency in Hz
 * @returns {number} MIDI note number
 */
function frequencyToMidi(frequency) {
  return Math.round(SEMITONES_PER_OCTAVE * Math.log2(frequency / A4_FREQUENCY) + MIDI_A4)
}

/**
 * Calculate base octave from Y position
 * @param {number} y - Y position (0-1)
 * @returns {number} Base octave (1-7, unified 6-octave range)
 */
function getBaseOctaveFromY(y) {
  return 1 + Math.floor((1 - y) * 6)
}

/**
 * Get beat duration from tempo
 * @param {number} tempo - BPM
 * @returns {number} Duration of one beat in seconds
 */
function getBeatDuration(tempo = DEFAULT_TEMPO) {
  return 60 / tempo
}

/**
 * Parse duration string to seconds
 * @param {string|number} duration - Duration string ('4n', '8n') or number
 * @param {number} tempo - BPM for calculation
 * @returns {number} Duration in seconds
 */
function parseDuration(duration, tempo = DEFAULT_TEMPO) {
  if (typeof duration === 'number') return duration

  const beatDuration = getBeatDuration(tempo)
  const durationMultiplier = DURATION_MAP[duration]

  if (durationMultiplier) {
    return durationMultiplier * beatDuration * 2 // Adjusted for standard tempo
  }

  return 0.25 // Default to 8th note equivalent
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.MusicalConstants = {
    // MIDI
    MIDI_MIDDLE_C,
    MIDI_A4,
    A4_FREQUENCY,
    SEMITONES_PER_OCTAVE,

    // Octave
    DEFAULT_BASE_OCTAVE,
    MIN_OCTAVE,
    MAX_OCTAVE,

    // Frequency
    MIN_FREQUENCY,
    MAX_FREQUENCY,
    MIN_MUSICAL_FREQUENCY,
    MAX_MUSICAL_FREQUENCY,
    MIN_TONIC_FREQUENCY,
    MAX_TONIC_FREQUENCY,

    // Tempo
    DEFAULT_TEMPO,
    MIN_TEMPO,
    MAX_TEMPO,

    // Duration
    DURATION_MAP,
    LAYER_TIMING,

    // Polyphony
    MAX_TOTAL_VOICES,
    MAX_SUSTAINED_NOTES,

    // Envelope
    DEFAULT_ENVELOPE,
    ARTICULATION_VELOCITY,

    // Filter
    FILTER_CONFIG,

    // Three-Tier
    THREE_TIER_VOLUME,

    // Functions
    midiToFrequency,
    frequencyToMidi,
    getBaseOctaveFromY,
    getBeatDuration,
    parseDuration
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MIDI_MIDDLE_C,
    MIDI_A4,
    A4_FREQUENCY,
    SEMITONES_PER_OCTAVE,
    DEFAULT_BASE_OCTAVE,
    MIN_OCTAVE,
    MAX_OCTAVE,
    MIN_FREQUENCY,
    MAX_FREQUENCY,
    MIN_MUSICAL_FREQUENCY,
    MAX_MUSICAL_FREQUENCY,
    MIN_TONIC_FREQUENCY,
    MAX_TONIC_FREQUENCY,
    DEFAULT_TEMPO,
    MIN_TEMPO,
    MAX_TEMPO,
    DURATION_MAP,
    LAYER_TIMING,
    MAX_TOTAL_VOICES,
    MAX_SUSTAINED_NOTES,
    DEFAULT_ENVELOPE,
    ARTICULATION_VELOCITY,
    FILTER_CONFIG,
    THREE_TIER_VOLUME,
    midiToFrequency,
    frequencyToMidi,
    getBaseOctaveFromY,
    getBeatDuration,
    parseDuration
  }
}
