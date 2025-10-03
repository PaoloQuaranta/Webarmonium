const { v4: uuidv4 } = require('uuid')

/**
 * DrawingStroke Model
 * Represents a pen/brush stroke on the canvas
 * Constitutional requirement: Clean data validation, performance constraints
 */
class DrawingStroke {
  constructor (userId, roomId, color, strokeWidth, startPoint) {
    this.id = uuidv4()
    this.userId = userId
    this.roomId = roomId
    this.color = color
    this.strokeWidth = strokeWidth
    this.points = []
    this.startedAt = new Date()
    this.completedAt = null

    // Add start point if provided
    if (startPoint) {
      this.addPoint(startPoint.x, startPoint.y, 0)
    }
  }

  /**
   * Add point to stroke
   * @param {number} x - Canvas X coordinate
   * @param {number} y - Canvas Y coordinate
   * @param {number} t - Milliseconds since stroke start
   * @throws {Error} If validation fails
   */
  addPoint (x, y, t) {
    // Validate coordinates
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new Error('Point coordinates must be numbers')
    }

    if (x < 0 || y < 0) {
      throw new Error('Point coordinates must be non-negative')
    }

    if (typeof t !== 'number' || t < 0) {
      throw new Error('Point timestamp must be non-negative number')
    }

    // Enforce max points limit
    if (this.points.length >= 10000) {
      throw new Error('Stroke exceeds maximum 10,000 points')
    }

    this.points.push({ x, y, timestamp: t })
  }

  /**
   * Mark stroke as completed
   */
  complete () {
    this.completedAt = new Date()

    // Validate minimum points requirement
    if (this.points.length < 2) {
      throw new Error('Stroke must have at least 2 points')
    }
  }

  /**
   * Check if stroke is completed
   * @returns {boolean} True if stroke is completed
   */
  isCompleted () {
    return this.completedAt !== null
  }

  /**
   * Validate stroke data
   * @throws {Error} If validation fails
   */
  validate () {
    // Validate ID
    if (!this.id || typeof this.id !== 'string') {
      throw new Error('Stroke ID is required')
    }

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(this.id)) {
      throw new Error('Stroke ID must be valid UUID')
    }

    // Validate userId
    if (!this.userId || typeof this.userId !== 'string') {
      throw new Error('User ID is required')
    }

    // Validate roomId
    if (!this.roomId || typeof this.roomId !== 'string') {
      throw new Error('Room ID is required')
    }

    // Validate color format (lowercase hex)
    if (!/^#[0-9a-f]{6}$/.test(this.color)) {
      throw new Error('Color must be lowercase hex format (#rrggbb)')
    }

    // Validate strokeWidth range (1-20)
    if (typeof this.strokeWidth !== 'number' || this.strokeWidth < 1 || this.strokeWidth > 20) {
      throw new Error('Stroke width must be between 1 and 20')
    }

    // Validate points array
    if (!Array.isArray(this.points)) {
      throw new Error('Points must be an array')
    }

    if (this.points.length < 2) {
      throw new Error('Stroke must have at least 2 points')
    }

    if (this.points.length > 10000) {
      throw new Error('Stroke cannot exceed 10,000 points')
    }

    // Validate each point
    this.points.forEach((point, index) => {
      if (typeof point.x !== 'number' || typeof point.y !== 'number' || typeof point.timestamp !== 'number') {
        throw new Error(`Point ${index} has invalid data types`)
      }

      if (point.x < 0 || point.y < 0 || point.timestamp < 0) {
        throw new Error(`Point ${index} has negative coordinates or timestamp`)
      }
    })

    // Validate timestamps
    if (!this.startedAt || !(this.startedAt instanceof Date)) {
      throw new Error('Start timestamp is required')
    }

    if (this.isCompleted()) {
      if (!(this.completedAt instanceof Date)) {
        throw new Error('Completed timestamp must be a Date')
      }

      if (this.completedAt < this.startedAt) {
        throw new Error('Completed timestamp must be after start timestamp')
      }
    }
  }

  /**
   * Convert stroke to WebSocket event payload
   * @returns {Object} Stroke data for broadcasting
   */
  toEventPayload () {
    return {
      id: this.id,
      userId: this.userId,
      color: this.color,
      strokeWidth: this.strokeWidth,
      points: this.points,
      startedAt: this.startedAt.toISOString(),
      completedAt: this.completedAt ? this.completedAt.toISOString() : null
    }
  }

  /**
   * Calculate stroke duration in milliseconds
   * @returns {number|null} Duration or null if not completed
   */
  getDuration () {
    if (!this.isCompleted()) {
      return null
    }

    return this.completedAt.getTime() - this.startedAt.getTime()
  }

  /**
   * Get stroke statistics
   * @returns {Object} Stroke statistics
   */
  getStats () {
    return {
      id: this.id,
      pointCount: this.points.length,
      duration: this.getDuration(),
      isCompleted: this.isCompleted(),
      estimatedSizeBytes: JSON.stringify(this.toEventPayload()).length
    }
  }

  /**
   * Create stroke from WebSocket event data
   * @param {string} roomId - Room ID
   * @param {Object} data - Event data from client
   * @returns {DrawingStroke} New stroke instance
   */
  static fromEventData (roomId, data) {
    const { userId, color, strokeWidth, x, y } = data

    if (!roomId) {
      throw new Error('Room ID is required')
    }

    if (!userId || !color || !strokeWidth) {
      throw new Error('Missing required stroke data: userId, color, strokeWidth')
    }

    const stroke = new DrawingStroke(userId, roomId, color, strokeWidth, { x, y })
    return stroke
  }
}

module.exports = DrawingStroke
