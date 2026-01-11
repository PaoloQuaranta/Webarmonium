const { REAL_USER_COLOR_POOL } = require('../constants/colors')

/**
 * ColorAssignmentService
 * Manages the color pool for real users in multi-user canvas
 * Constitutional requirement: Unique colors per user, predictable assignment
 *
 * IMPORTANT: Real user colors are completely separate from virtual user colors
 * Virtual users use VIRTUAL_USER_COLORS from constants/colors.js
 */
class ColorAssignmentService {
  constructor () {
    // Real user color pool - excludes virtual user colors (red, orange, blue)
    // 7 colors for max 4 real users (buffer for race condition during refresh)
    this.COLOR_POOL = REAL_USER_COLOR_POOL

    // Track available colors (Set for O(1) operations)
    this.availableColors = new Set(this.COLOR_POOL)

    // Track assigned colors: Map<userId, color>
    this.assignedColors = new Map()
  }

  /**
   * Assign color to a user
   * @param {string} userId - User ID
   * @returns {string} Assigned hex color
   * @throws {Error} If no colors available or user already has color
   */
  assignColor (userId) {
    // Validate userId
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID is required')
    }

    // Check if user already has a color
    if (this.assignedColors.has(userId)) {
      throw new Error(`User ${userId} already has an assigned color`)
    }

    // Check if colors available
    if (this.availableColors.size === 0) {
      throw new Error(`No colors available in pool (max ${REAL_USER_COLOR_POOL.length} real users)`)
    }

    // Get first available color
    const color = Array.from(this.availableColors)[0]

    // Assign color
    this.availableColors.delete(color)
    this.assignedColors.set(userId, color)

    return color
  }

  /**
   * Release color back to available pool
   * @param {string} userId - User ID
   * @returns {string|null} Released color or null if user had no color
   */
  releaseColor (userId) {
    // Validate userId
    if (!userId || typeof userId !== 'string') {
      throw new Error('User ID is required')
    }

    // Get user's color
    const color = this.assignedColors.get(userId)

    if (!color) {
      return null // User had no color assigned
    }

    // Release color back to pool
    this.assignedColors.delete(userId)
    this.availableColors.add(color)

    return color
  }

  /**
   * Get color assigned to a user
   * @param {string} userId - User ID
   * @returns {string|null} Assigned color or null if not assigned
   */
  getAssignedColor (userId) {
    return this.assignedColors.get(userId) || null
  }

  /**
   * Check if user has assigned color
   * @param {string} userId - User ID
   * @returns {boolean} True if user has assigned color
   */
  hasAssignedColor (userId) {
    return this.assignedColors.has(userId)
  }

  /**
   * Get number of available colors
   * @returns {number} Number of available colors
   */
  getAvailableColorCount () {
    return this.availableColors.size
  }

  /**
   * Get number of assigned colors
   * @returns {number} Number of assigned colors
   */
  getAssignedColorCount () {
    return this.assignedColors.size
  }

  /**
   * Check if color pool is full (all 10 colors assigned)
   * @returns {boolean} True if all colors assigned
   */
  isFull () {
    return this.availableColors.size === 0
  }

  /**
   * Check if color pool is empty (no colors assigned)
   * @returns {boolean} True if no colors assigned
   */
  isEmpty () {
    return this.assignedColors.size === 0
  }

  /**
   * Reset color pool (for testing or room cleanup)
   */
  reset () {
    this.availableColors = new Set(this.COLOR_POOL)
    this.assignedColors.clear()
  }

  /**
   * Get current state for debugging
   * @returns {Object} Current state of color assignments
   */
  getState () {
    return {
      totalColors: this.COLOR_POOL.length,
      availableColors: Array.from(this.availableColors),
      assignedColors: Object.fromEntries(this.assignedColors),
      availableCount: this.availableColors.size,
      assignedCount: this.assignedColors.size
    }
  }

  /**
   * Validate color format (hex, lowercase)
   * @param {string} color - Color to validate
   * @returns {boolean} True if valid hex color
   */
  static validateColor (color) {
    return /^#[0-9a-f]{6}$/.test(color)
  }

  /**
   * Check if color is in the standard pool
   * @param {string} color - Color to check
   * @returns {boolean} True if color is in pool
   */
  isPoolColor (color) {
    return this.COLOR_POOL.includes(color)
  }
}

module.exports = ColorAssignmentService
