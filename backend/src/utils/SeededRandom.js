/**
 * SeededRandom - Deterministic PRNG for fallback scenarios
 *
 * Uses Mulberry32 algorithm:
 * - Fast (single multiplication)
 * - Good distribution
 * - Period: 2^32
 *
 * Used when deterministic derivation from data is not possible
 * (e.g., missing gesture history, insufficient context)
 */
class SeededRandom {
  constructor(seed) {
    this.seed = seed >>> 0 // Ensure 32-bit unsigned
    this.state = this.seed
  }

  /**
   * Generate next random float [0, 1)
   * @returns {number} Random float
   */
  random() {
    this.state |= 0
    this.state = (this.state + 0x6D2B79F5) | 0
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /**
   * Generate random integer [0, max)
   * @param {number} max - Upper bound (exclusive)
   * @returns {number} Random integer
   */
  randomInt(max) {
    return Math.floor(this.random() * max)
  }

  /**
   * Pick random element from array
   * @param {Array} array - Source array
   * @returns {*} Random element
   */
  pick(array) {
    if (!array || array.length === 0) return undefined
    return array[this.randomInt(array.length)]
  }

  /**
   * Generate random float in range [min, max)
   * @param {number} min - Lower bound
   * @param {number} max - Upper bound
   * @returns {number} Random float in range
   */
  randomInRange(min, max) {
    return min + this.random() * (max - min)
  }

  /**
   * Reset to initial seed state
   */
  reset() {
    this.state = this.seed
  }

  /**
   * Create SeededRandom from string (hashed)
   * @param {string} str - Source string
   * @returns {SeededRandom} New instance
   */
  static fromString(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash | 0 // Convert to 32bit integer
    }
    return new SeededRandom(hash >>> 0)
  }

  /**
   * Create SeededRandom from room context (for composition fallback)
   * @param {string} roomId - Room identifier
   * @param {number} compositionIndex - Composition count in session
   * @param {number} gestureCount - Total gestures in room
   * @returns {SeededRandom} New instance
   */
  static fromRoomContext(roomId, compositionIndex = 0, gestureCount = 0) {
    const seedString = `${roomId}:${compositionIndex}:${gestureCount}`
    return SeededRandom.fromString(seedString)
  }

  /**
   * Create SeededRandom from gesture data
   * @param {Object} gesture - Gesture object
   * @param {string} roomId - Room identifier
   * @returns {SeededRandom} New instance
   */
  static fromGesture(gesture, roomId) {
    const x = gesture.coordinates?.x ?? gesture.position?.x ?? 0.5
    const y = gesture.coordinates?.y ?? gesture.position?.y ?? 0.5
    const timestamp = gesture.timestamp || gesture.clientTimestamp || Date.now()
    const seedString = `${roomId}:${x.toFixed(4)}:${y.toFixed(4)}:${timestamp}`
    return SeededRandom.fromString(seedString)
  }
}

module.exports = SeededRandom
