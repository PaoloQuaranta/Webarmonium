/**
 * CircularBuffer - Fixed-size buffer with O(1) push and no memory allocation
 * Replaces array.slice(-N) and array.shift() patterns that cause GC pressure
 */
class CircularBuffer {
  /**
   * @param {number} maxSize - Maximum number of items to store
   */
  constructor(maxSize) {
    this.maxSize = maxSize
    this.buffer = new Array(maxSize)
    this.head = 0      // Next write position
    this.count = 0     // Current number of items
  }

  /**
   * Add an item to the buffer (O(1), no allocation)
   * @param {*} item - Item to add
   */
  push(item) {
    this.buffer[this.head] = item
    this.head = (this.head + 1) % this.maxSize
    if (this.count < this.maxSize) {
      this.count++
    }
  }

  /**
   * Get all items as array in order (oldest to newest)
   * Note: Creates new array - use sparingly in hot paths
   * @returns {Array} Items in insertion order
   */
  toArray() {
    if (this.count === 0) return []
    const result = new Array(this.count)
    const start = this.count < this.maxSize ? 0 : this.head
    for (let i = 0; i < this.count; i++) {
      result[i] = this.buffer[(start + i) % this.maxSize]
    }
    return result
  }

  /**
   * Get the most recent item
   * @returns {*} Most recently added item, or undefined if empty
   */
  getLast() {
    if (this.count === 0) return undefined
    const lastIndex = (this.head - 1 + this.maxSize) % this.maxSize
    return this.buffer[lastIndex]
  }

  /**
   * Get item at logical index (0 = oldest)
   * @param {number} index - Logical index
   * @returns {*} Item at index, or undefined if out of bounds
   */
  get(index) {
    if (index < 0 || index >= this.count) return undefined
    const start = this.count < this.maxSize ? 0 : this.head
    return this.buffer[(start + index) % this.maxSize]
  }

  /**
   * Current number of items in buffer
   * @returns {number}
   */
  get length() {
    return this.count
  }

  /**
   * Clear all items from buffer
   * Nullifies elements to allow GC of referenced objects while keeping array allocated
   */
  clear() {
    // Nullify elements to prevent memory leaks from retained object references
    for (let i = 0; i < this.maxSize; i++) {
      this.buffer[i] = undefined
    }
    this.head = 0
    this.count = 0
  }

  /**
   * Iterate over items (oldest to newest)
   * @param {Function} callback - Called with (item, index)
   */
  forEach(callback) {
    const start = this.count < this.maxSize ? 0 : this.head
    for (let i = 0; i < this.count; i++) {
      callback(this.buffer[(start + i) % this.maxSize], i)
    }
  }
}

module.exports = CircularBuffer
