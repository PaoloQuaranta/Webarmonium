const DrawingStroke = require('../models/DrawingStroke')

/**
 * DrawingSyncService
 * Manages drawing stroke lifecycle and synchronization
 * Constitutional requirement: <1000ms stroke broadcast, validated data
 */
class DrawingSyncService {
  constructor () {
    // Track in-progress strokes: Map<userId, DrawingStroke>
    this.activeStrokes = new Map()
  }

  /**
   * Create new stroke from draw-start event
   * @param {string} userId - User ID
   * @param {string} roomId - Room ID
   * @param {string} color - User's assigned color
   * @param {Object} data - Event data {x, y, strokeWidth}
   * @returns {DrawingStroke} New stroke instance
   * @throws {Error} If validation fails or user already has active stroke
   */
  createStroke (userId, roomId, color, data) {
    // Validate inputs
    if (!userId || !roomId || !color) {
      throw new Error('userId, roomId, and color are required')
    }

    if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') {
      throw new Error('Start point (x, y) is required')
    }

    if (data.strokeWidth === undefined || data.strokeWidth === null || typeof data.strokeWidth !== 'number') {
      throw new Error('strokeWidth is required')
    }

    // Validate strokeWidth range (1-20)
    if (data.strokeWidth < 1 || data.strokeWidth > 20) {
      throw new Error('strokeWidth must be between 1 and 20')
    }

    // Check if user already has active stroke
    if (this.activeStrokes.has(userId)) {
      throw new Error(`User ${userId} already has an active stroke`)
    }

    // Create stroke with start point
    const stroke = new DrawingStroke(
      userId,
      roomId,
      color,
      data.strokeWidth,
      { x: data.x, y: data.y }
    )

    // Store as active stroke
    this.activeStrokes.set(userId, stroke)

    return stroke
  }

  /**
   * Add point to active stroke
   * @param {string} userId - User ID
   * @param {Object} data - Point data {x, y}
   * @returns {DrawingStroke} Updated stroke instance
   * @throws {Error} If user has no active stroke or validation fails
   */
  addPoint (userId, data) {
    // Validate inputs
    if (!userId) {
      throw new Error('userId is required')
    }

    if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') {
      throw new Error('Point coordinates (x, y) are required')
    }

    // Get active stroke
    const stroke = this.activeStrokes.get(userId)

    if (!stroke) {
      throw new Error(`User ${userId} has no active stroke`)
    }

    // Calculate time since stroke start
    const timeSinceStart = Date.now() - stroke.startedAt.getTime()

    // Add point to stroke
    stroke.addPoint(data.x, data.y, timeSinceStart)

    return stroke
  }

  /**
   * Complete stroke and remove from active strokes
   * @param {string} userId - User ID
   * @param {Object} data - End point data {x, y}
   * @returns {DrawingStroke} Completed stroke instance
   * @throws {Error} If user has no active stroke or validation fails
   */
  completeStroke (userId, data) {
    // Validate inputs
    if (!userId) {
      throw new Error('userId is required')
    }

    if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') {
      throw new Error('End point coordinates (x, y) are required')
    }

    // Get active stroke
    const stroke = this.activeStrokes.get(userId)

    if (!stroke) {
      throw new Error(`User ${userId} has no active stroke`)
    }

    // Add final point
    const timeSinceStart = Date.now() - stroke.startedAt.getTime()
    stroke.addPoint(data.x, data.y, timeSinceStart)

    // Mark stroke as completed
    stroke.complete()

    // Remove from active strokes
    this.activeStrokes.delete(userId)

    // Validate completed stroke
    stroke.validate()

    return stroke
  }

  /**
   * Get active stroke for user
   * @param {string} userId - User ID
   * @returns {DrawingStroke|null} Active stroke or null
   */
  getActiveStroke (userId) {
    return this.activeStrokes.get(userId) || null
  }

  /**
   * Check if user has active stroke
   * @param {string} userId - User ID
   * @returns {boolean} True if user has active stroke
   */
  hasActiveStroke (userId) {
    return this.activeStrokes.has(userId)
  }

  /**
   * Cancel active stroke (cleanup on disconnect)
   * @param {string} userId - User ID
   * @returns {DrawingStroke|null} Cancelled stroke or null
   */
  cancelStroke (userId) {
    const stroke = this.activeStrokes.get(userId)

    if (stroke) {
      this.activeStrokes.delete(userId)
    }

    return stroke || null
  }

  /**
   * Prepare stroke for broadcasting
   * @param {DrawingStroke} stroke - Completed stroke
   * @returns {Object} Stroke event payload
   */
  broadcastStroke (stroke) {
    if (!stroke || !stroke.isCompleted()) {
      throw new Error('Cannot broadcast incomplete stroke')
    }

    return stroke.toEventPayload()
  }

  /**
   * Get number of active strokes
   * @returns {number} Number of active strokes
   */
  getActiveStrokeCount () {
    return this.activeStrokes.size
  }

  /**
   * Get all active stroke IDs for debugging
   * @returns {string[]} Array of user IDs with active strokes
   */
  getActiveUserIds () {
    return Array.from(this.activeStrokes.keys())
  }

  /**
   * Reset service (for testing or room cleanup)
   */
  reset () {
    this.activeStrokes.clear()
  }

  /**
   * Get current state for debugging
   * @returns {Object} Current state of active strokes
   */
  getState () {
    return {
      activeStrokeCount: this.activeStrokes.size,
      activeUserIds: this.getActiveUserIds(),
      activeStrokes: Array.from(this.activeStrokes.entries()).map(([userId, stroke]) => ({
        userId,
        strokeId: stroke.id,
        pointCount: stroke.points.length,
        isCompleted: stroke.isCompleted()
      }))
    }
  }
}

module.exports = DrawingSyncService
