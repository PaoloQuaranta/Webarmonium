/**
 * FrequencyPositionMapper
 * Bidirectional mapping between canvas position and audio frequency
 *
 * Used to calculate virtual cursor positions from generated note frequencies,
 * ensuring perfect audio-visual coherence.
 *
 * FORWARD: position (x, y) -> frequency
 *   frequency = (110 + (1-y)*440) + (x*660)
 *   Range: 110Hz to 1210Hz
 *
 * REVERSE: frequency -> position (x, y)
 *   Given a frequency, calculate the canvas position that would produce it
 */

class FrequencyPositionMapper {
  constructor() {
    // Constants from the forward mapping formula (GestureToMusicService.js:185-187)
    this.OCTAVE_BASE_MIN = 110     // Hz at y=1 (top of canvas)
    this.OCTAVE_BASE_MAX = 550     // Hz at y=0 (bottom of canvas)
    this.OCTAVE_RANGE = 440        // OCTAVE_BASE_MAX - OCTAVE_BASE_MIN
    this.X_CONTRIBUTION_MAX = 660  // Hz added when x=1
    this.FREQ_MIN = 110            // Minimum frequency (x=0, y=1)
    this.FREQ_MAX = 1210           // Maximum frequency (x=1, y=0) = 550 + 660
  }

  /**
   * FORWARD MAPPING: Position to Frequency
   * Reference: GestureToMusicService.js:185-187, VirtualUserService.js:600-603
   *
   * @param {number} x - Horizontal position (0-1, left to right)
   * @param {number} y - Vertical position (0-1, top to bottom)
   * @returns {number} Frequency in Hz
   */
  positionToFrequency(x, y) {
    const clampedX = Math.max(0, Math.min(1, x))
    const clampedY = Math.max(0, Math.min(1, y))

    const octaveBase = this.OCTAVE_BASE_MIN + (1 - clampedY) * this.OCTAVE_RANGE
    const withinOctave = clampedX * this.X_CONTRIBUTION_MAX

    return octaveBase + withinOctave
  }

  /**
   * REVERSE MAPPING: Frequency to Position
   * Given a frequency, calculate the (x, y) position that would produce it.
   *
   * Strategy:
   * 1. Map frequency linearly to Y across the full range
   * 2. Calculate X from the residual frequency component
   *
   * @param {number} frequency - Frequency in Hz
   * @returns {{x: number, y: number}} Canvas position (0-1 range)
   */
  frequencyToPosition(frequency) {
    // Clamp frequency to valid range
    const clampedFreq = Math.max(this.FREQ_MIN, Math.min(this.FREQ_MAX, frequency))

    // Normalize frequency to 0-1 range
    const normalizedFreq = (clampedFreq - this.FREQ_MIN) / (this.FREQ_MAX - this.FREQ_MIN)

    // Map to Y: lower frequency = higher Y (bottom of screen)
    // Higher frequency = lower Y (top of screen)
    // Keep within 0.05-0.95 range to stay visible
    const y = Math.max(0.05, Math.min(0.95, 1 - normalizedFreq * 0.9 - 0.05))

    // Given Y, solve for X
    // frequency = (110 + (1-y)*440) + (x*660)
    // x = (frequency - 110 - (1-y)*440) / 660
    const octaveBase = this.OCTAVE_BASE_MIN + (1 - y) * this.OCTAVE_RANGE
    const xContribution = clampedFreq - octaveBase
    const x = Math.max(0, Math.min(1, xContribution / this.X_CONTRIBUTION_MAX))

    return { x, y }
  }

  /**
   * Calculate a smooth trajectory for drag gestures
   * Returns positions for linear interpolation between start and end frequencies
   *
   * @param {number} startFreq - First note frequency in Hz
   * @param {number} endFreq - Last note frequency in Hz
   * @param {number} durationMs - Total duration of the drag gesture in milliseconds
   * @param {number} intervalMs - Interval between position updates (default 50ms)
   * @returns {Array<{x: number, y: number, timeOffset: number}>} Array of positions with time offsets
   */
  calculateDragTrajectory(startFreq, endFreq, durationMs, intervalMs = 50) {
    const startPos = this.frequencyToPosition(startFreq)
    const endPos = this.frequencyToPosition(endFreq)
    const steps = Math.max(1, Math.ceil(durationMs / intervalMs))

    const positions = []

    for (let i = 0; i <= steps; i++) {
      const t = steps > 0 ? i / steps : 0

      // Linear interpolation between start and end
      positions.push({
        x: startPos.x + (endPos.x - startPos.x) * t,
        y: startPos.y + (endPos.y - startPos.y) * t,
        timeOffset: i * intervalMs
      })
    }

    return positions
  }

  /**
   * Get positions for each note in a phrase
   * For multi-note phrases, positions are linearly distributed along the trajectory
   *
   * @param {Array<{pitch: number}>} notes - Array of notes with MIDI pitch
   * @returns {Array<{x: number, y: number}>} Array of positions, one per note
   */
  calculateNotePositions(notes) {
    if (!notes || notes.length === 0) return []

    if (notes.length === 1) {
      const freq = this.midiToFrequency(notes[0].pitch)
      return [this.frequencyToPosition(freq)]
    }

    // Get start and end frequencies
    const startFreq = this.midiToFrequency(notes[0].pitch)
    const endFreq = this.midiToFrequency(notes[notes.length - 1].pitch)

    const startPos = this.frequencyToPosition(startFreq)
    const endPos = this.frequencyToPosition(endFreq)

    // Linear interpolation for each note
    return notes.map((_, i) => {
      const t = notes.length > 1 ? i / (notes.length - 1) : 0
      return {
        x: startPos.x + (endPos.x - startPos.x) * t,
        y: startPos.y + (endPos.y - startPos.y) * t
      }
    })
  }

  /**
   * Enforce tessitura bounds using octave wrapping
   * Ensures a frequency stays within the specified range by transposing octaves
   *
   * @param {number} frequency - Input frequency in Hz
   * @param {number} freqMin - Minimum frequency bound
   * @param {number} freqMax - Maximum frequency bound
   * @returns {number} Frequency adjusted to fit within bounds
   */
  enforceTessitura(frequency, freqMin, freqMax) {
    // Handle invalid input
    if (!isFinite(frequency) || frequency <= 0) {
      return freqMin
    }

    // Octave wrapping with iteration limit to prevent infinite loops
    const MAX_ITERATIONS = 20
    let iterations = 0

    // Transpose up if below minimum
    while (frequency < freqMin && iterations < MAX_ITERATIONS) {
      frequency *= 2
      iterations++
    }

    // Transpose down if above maximum
    iterations = 0
    while (frequency > freqMax && iterations < MAX_ITERATIONS) {
      frequency /= 2
      iterations++
    }

    // Final clamp to ensure bounds
    return Math.max(freqMin, Math.min(freqMax, frequency))
  }

  /**
   * Convert MIDI pitch to frequency
   * @param {number} pitch - MIDI note number (60 = middle C)
   * @returns {number} Frequency in Hz
   */
  midiToFrequency(pitch) {
    return 440 * Math.pow(2, (pitch - 69) / 12)
  }

  /**
   * Convert frequency to MIDI pitch
   * @param {number} frequency - Frequency in Hz
   * @returns {number} MIDI note number
   */
  frequencyToMidi(frequency) {
    return Math.round(12 * Math.log2(frequency / 440) + 69)
  }
}

module.exports = FrequencyPositionMapper
