/**
 * VelocityCalculator.js
 * Centralized velocity-to-interval calculation for musical timing
 * Eliminates duplication across EnhancedGestureCapture.js and main.js
 */

/**
 * Speed thresholds mapped to musical intervals (at 120 BPM)
 * Each entry: { threshold, interval (ms), noteValue }
 * Higher speed = shorter interval = faster notes
 * @type {Array<{threshold: number, interval: number, noteValue: string}>}
 */
const SPEED_INTERVALS = [
  { threshold: 2.0, interval: 31.25, noteValue: '64n' },   // Very fast: 64th notes
  { threshold: 1.2, interval: 62.5, noteValue: '32n' },    // Fast: 32nd notes
  { threshold: 0.7, interval: 125, noteValue: '16n' },     // Medium-fast: 16th notes
  { threshold: 0.4, interval: 250, noteValue: '8n' },      // Medium: 8th notes
  { threshold: 0.2, interval: 500, noteValue: '4n' },      // Slow: quarter notes
  { threshold: 0.1, interval: 1000, noteValue: '2n' },     // Very slow: half notes
  { threshold: 0, interval: 2000, noteValue: '1n' }        // Extremely slow: whole notes
]

/**
 * Duration mapping from Tone.js notation to seconds (at 120 BPM)
 * @type {Object<string, number>}
 */
const VELOCITY_DURATION_MAP = {
  '64n': 0.03125,  // 1/64 note
  '32n': 0.0625,   // 1/32 note
  '16n': 0.125,    // 1/16 note
  '8n': 0.25,      // 1/8 note
  '4n': 0.5,       // 1/4 note (quarter note)
  '2n': 1.0,       // 1/2 note (half note)
  '1n': 2.0        // whole note
}

/**
 * Get interval data from normalized speed
 * @param {number} speed - Normalized speed (0-3 typical range)
 * @returns {{threshold: number, interval: number, noteValue: string}} Interval data
 */
function getIntervalFromSpeed(speed) {
  for (const entry of SPEED_INTERVALS) {
    if (speed > entry.threshold) {
      return entry
    }
  }
  // Return slowest interval for speeds at or below 0
  return SPEED_INTERVALS[SPEED_INTERVALS.length - 1]
}

/**
 * Calculate velocity magnitude from x/y components
 * @param {number} vx - X velocity component
 * @param {number} vy - Y velocity component
 * @returns {number} Velocity magnitude
 */
function calculateVelocityMagnitude(vx, vy) {
  return Math.sqrt(vx * vx + vy * vy)
}

/**
 * Normalize speed to a usable range (0-3)
 * @param {number} rawSpeed - Raw speed value
 * @param {number} maxSpeed - Maximum expected speed (default: 3)
 * @returns {number} Normalized speed (0-maxSpeed)
 */
function normalizeSpeed(rawSpeed, maxSpeed = 3) {
  return Math.min(rawSpeed, maxSpeed)
}

/**
 * Get note duration in seconds from Tone.js notation
 * @param {string} noteValue - Tone.js note value (e.g., '8n', '4n')
 * @returns {number} Duration in seconds (at 120 BPM)
 */
function getDurationSeconds(noteValue) {
  return VELOCITY_DURATION_MAP[noteValue] || 0.25 // Default to 8th note
}

/**
 * Get articulation based on velocity (for varied musical expression)
 * @param {number} normalizedVelocity - Normalized velocity (0-1)
 * @param {number} noteIndex - Index of the note in a phrase
 * @returns {string} Articulation type
 */
function getArticulationFromVelocity(normalizedVelocity, noteIndex) {
  if (normalizedVelocity > 0.6) {
    // Fast: short, articulated notes
    return 'staccato'
  } else if (normalizedVelocity > 0.3) {
    // Medium: accented notes
    return 'marcato'
  } else {
    // Slow: smooth, connected notes
    return 'legato'
  }
}

/**
 * Get envelope parameters based on articulation and duration
 * @param {string} articulation - Articulation type
 * @param {number} duration - Note duration in seconds
 * @returns {{attack: number, decay: number, sustain: number, release: number}} ADSR envelope
 */
function getEnvelopeFromArticulation(articulation, duration) {
  switch (articulation) {
    case 'staccato':
      return {
        attack: 0.005,
        decay: duration * 0.2,
        sustain: 0.3,
        release: duration * 0.3
      }
    case 'marcato':
      return {
        attack: 0.01,
        decay: duration * 0.3,
        sustain: 0.5,
        release: duration * 0.4
      }
    case 'legato':
      return {
        attack: duration * 0.1,
        decay: duration * 0.2,
        sustain: 0.7,
        release: duration * 0.7
      }
    default:
      return {
        attack: 0.005,
        decay: 0.02,
        sustain: 0.1,
        release: 0.05
      }
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.VelocityCalculator = {
    SPEED_INTERVALS,
    VELOCITY_DURATION_MAP,
    getIntervalFromSpeed,
    calculateVelocityMagnitude,
    normalizeSpeed,
    getDurationSeconds,
    getArticulationFromVelocity,
    getEnvelopeFromArticulation
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SPEED_INTERVALS,
    VELOCITY_DURATION_MAP,
    getIntervalFromSpeed,
    calculateVelocityMagnitude,
    normalizeSpeed,
    getDurationSeconds,
    getArticulationFromVelocity,
    getEnvelopeFromArticulation
  }
}
