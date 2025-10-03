/**
 * CursorPosition Model
 * Represents real-time cursor location for a user
 * Constitutional requirement: 60Hz updates, low latency validation
 */
class CursorPosition {
  constructor (userId, roomId, x, y, isDrawing = false, timestamp = Date.now()) {
    this.userId = userId
    this.roomId = roomId
    this.x = x
    this.y = y
    this.isDrawing = isDrawing
    this.timestamp = timestamp
  }

  /**
   * Update cursor position
   * @param {number} x - Canvas X coordinate
   * @param {number} y - Canvas Y coordinate
   * @param {boolean} isDrawing - True during active stroke
   * @param {number} timestamp - Unix timestamp milliseconds
   */
  update (x, y, isDrawing, timestamp = Date.now()) {
    this.x = x
    this.y = y
    this.isDrawing = isDrawing
    this.timestamp = timestamp
  }

  /**
   * Validate cursor position data
   * @throws {Error} If validation fails
   */
  validate () {
    // Validate userId
    if (!this.userId || typeof this.userId !== 'string') {
      throw new Error('User ID is required')
    }

    // Validate roomId
    if (!this.roomId || typeof this.roomId !== 'string') {
      throw new Error('Room ID is required')
    }

    // Validate coordinates
    if (typeof this.x !== 'number' || typeof this.y !== 'number') {
      throw new Error('Cursor coordinates must be numbers')
    }

    if (this.x < 0 || this.y < 0) {
      throw new Error('Cursor coordinates must be non-negative')
    }

    // Validate isDrawing flag
    if (typeof this.isDrawing !== 'boolean') {
      throw new Error('isDrawing must be a boolean')
    }

    // Validate timestamp
    if (typeof this.timestamp !== 'number' || this.timestamp <= 0) {
      throw new Error('Timestamp must be a positive number')
    }

    // Validate timestamp is recent (within 5 seconds)
    const now = Date.now()
    const timeDiff = Math.abs(now - this.timestamp)
    if (timeDiff > 5000) {
      throw new Error('Timestamp must be recent (within 5 seconds)')
    }
  }

  /**
   * Check if cursor position is stale
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 5000ms)
   * @returns {boolean} True if cursor position is stale
   */
  isStale (maxAgeMs = 5000) {
    const age = Date.now() - this.timestamp
    return age > maxAgeMs
  }

  /**
   * Convert cursor position to WebSocket event payload
   * @param {string} color - User's assigned color
   * @returns {Object} Cursor position data for broadcasting
   */
  toEventPayload (color) {
    return {
      userId: this.userId,
      color,
      x: this.x,
      y: this.y,
      isDrawing: this.isDrawing,
      timestamp: this.timestamp
    }
  }

  /**
   * Create cursor position from WebSocket event data
   * @param {string} userId - User ID
   * @param {string} roomId - Room ID
   * @param {Object} data - Event data from client
   * @returns {CursorPosition} New cursor position instance
   */
  static fromEventData (userId, roomId, data) {
    const { x, y, isDrawing, timestamp } = data

    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new Error('Cursor coordinates (x, y) are required and must be numbers')
    }

    if (typeof isDrawing !== 'boolean') {
      throw new Error('isDrawing flag is required and must be a boolean')
    }

    const ts = timestamp || Date.now()

    return new CursorPosition(userId, roomId, x, y, isDrawing, ts)
  }

  /**
   * Calculate distance from another cursor position
   * @param {CursorPosition} otherCursor - Another cursor position
   * @returns {number} Euclidean distance
   */
  distanceFrom (otherCursor) {
    const dx = this.x - otherCursor.x
    const dy = this.y - otherCursor.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  /**
   * Get age of cursor position in milliseconds
   * @returns {number} Age in milliseconds
   */
  getAge () {
    return Date.now() - this.timestamp
  }

  /**
   * Clone cursor position
   * @returns {CursorPosition} Cloned cursor position
   */
  clone () {
    return new CursorPosition(
      this.userId,
      this.roomId,
      this.x,
      this.y,
      this.isDrawing,
      this.timestamp
    )
  }
}

module.exports = CursorPosition
