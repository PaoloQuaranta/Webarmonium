/**
 * MusicalScales.js
 * Centralized musical scale definitions for Webarmonium
 * Eliminates duplication across main.js, GestureProcessor.js, and EnhancedGestureCapture.js
 */

/**
 * Musical scale definitions (intervals in semitones from root)
 * @type {Object<string, number[]>}
 */
const SCALES = {
  pentatonic: [0, 2, 4, 7, 9],           // Major pentatonic
  major: [0, 2, 4, 5, 7, 9, 11],         // Ionian mode
  minor: [0, 2, 3, 5, 7, 8, 10],         // Natural minor
  dorian: [0, 2, 3, 5, 7, 9, 10],        // Dorian mode
  mixolydian: [0, 2, 4, 5, 7, 9, 10],    // Mixolydian mode
  blues: [0, 3, 5, 6, 7, 10],            // Blues scale
  phrygian: [0, 1, 3, 5, 7, 8, 10],      // Phrygian mode
  lydian: [0, 2, 4, 6, 7, 9, 11],        // Lydian mode
  locrian: [0, 1, 3, 5, 6, 8, 10],       // Locrian mode
  // Entry #HarmonicCoherence: Extended scales from backend HarmonicEngine
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11], // Harmonic minor
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],  // Melodic minor (ascending)
  minorPentatonic: [0, 3, 5, 7, 10],     // Minor pentatonic
  wholeTone: [0, 2, 4, 6, 8, 10],        // Whole tone scale
  diminished: [0, 2, 3, 5, 6, 8, 9, 11], // Diminished (half-whole)
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] // Chromatic scale
}

/**
 * Default scale type when none is specified
 * @type {string}
 */
const DEFAULT_SCALE = 'pentatonic'

/**
 * Get scale intervals by type
 * @param {string} scaleType - Scale name (e.g., 'pentatonic', 'major')
 * @returns {number[]} Array of intervals in semitones from root
 */
function getScale(scaleType = DEFAULT_SCALE) {
  return SCALES[scaleType] || SCALES[DEFAULT_SCALE]
}

/**
 * Get all available scale types
 * @returns {string[]} Array of scale type names
 */
function getAvailableScales() {
  return Object.keys(SCALES)
}

/**
 * Calculate MIDI note from scale and position
 * @param {number} scaleIndex - Index into the scale (can wrap around)
 * @param {string} scaleType - Scale type
 * @param {number} baseOctave - Base octave (4 = middle C octave)
 * @returns {number} MIDI note number
 */
function getMidiNoteFromScale(scaleIndex, scaleType = DEFAULT_SCALE, baseOctave = 4) {
  const scale = getScale(scaleType)
  const scaleNote = scale[scaleIndex % scale.length]
  const octaveOffset = Math.floor(scaleIndex / scale.length)
  return 60 + (baseOctave - 4) * 12 + scaleNote + octaveOffset * 12
}

/**
 * Convert MIDI note to frequency
 * @param {number} midiNote - MIDI note number (60 = middle C)
 * @returns {number} Frequency in Hz
 */
function midiToFrequency(midiNote) {
  return 440 * Math.pow(2, (midiNote - 69) / 12)
}

/**
 * Get frequency from scale position
 * @param {number} scaleIndex - Index into the scale
 * @param {string} scaleType - Scale type
 * @param {number} baseOctave - Base octave
 * @returns {number} Frequency in Hz
 */
function getFrequencyFromScale(scaleIndex, scaleType = DEFAULT_SCALE, baseOctave = 4) {
  const midiNote = getMidiNoteFromScale(scaleIndex, scaleType, baseOctave)
  return midiToFrequency(midiNote)
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.MusicalScales = {
    SCALES,
    DEFAULT_SCALE,
    getScale,
    getAvailableScales,
    getMidiNoteFromScale,
    midiToFrequency,
    getFrequencyFromScale
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SCALES,
    DEFAULT_SCALE,
    getScale,
    getAvailableScales,
    getMidiNoteFromScale,
    midiToFrequency,
    getFrequencyFromScale
  }
}
