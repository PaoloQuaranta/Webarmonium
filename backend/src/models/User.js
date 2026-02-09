/**
 * User Model
 * Represents an individual participant in a room
 * Constitutional requirement: Anonymous users, no personal data storage
 */
class User {
  constructor (userId, userData) {
    this.id = userId
    this.roomId = null
    this.assignedColor = null // Hex color from 10-color pool (multi-user canvas)
    this.assignedSlot = null  // Synth timbre slot (0-10: 0-7 synth, 8-10 drum) - exclusive per room
    this.isActive = false
    this.joinedAt = new Date()
    this.lastActivity = new Date()
    this.deviceType = this.validateDeviceType(userData.device)
    this.platform = userData.platform || 'unknown'
    this.capabilities = userData.capabilities || {}

    // Entry #SynthUI: User's selected synth preset and parameters
    this.synthPresetSlot = null // Selected preset slot (0-10), null = use assignedSlot
    this.synthParams = null     // Custom synth parameters object
  }

  /**
   * Validate device type enum
   * @param {string} deviceType - 'desktop' or 'mobile'
   * @returns {string} Validated device type
   */
  validateDeviceType (deviceType) {
    const validTypes = ['desktop', 'mobile']
    if (!validTypes.includes(deviceType)) {
      throw new Error(`Invalid device type: ${deviceType}. Must be: ${validTypes.join(', ')}`)
    }
    return deviceType
  }

  /**
   * Join a room
   * @param {string} roomId - Room identifier
   */
  joinRoom (roomId) {
    if (!roomId || typeof roomId !== 'string') {
      throw new Error('Room ID must be a non-empty string')
    }
    this.roomId = roomId
    this.updateActivity()
  }

  /**
   * Leave current room
   */
  leaveRoom () {
    this.roomId = null
    this.assignedColor = null // Release color back to pool
    this.assignedSlot = null  // Release slot back to pool
    this.isActive = false

    // Entry #SynthUI: Clear synth state on leave
    this.synthPresetSlot = null
    this.synthParams = null
  }

  /**
   * Assign synth timbre slot (0-10 for real users: 0-7 synth, 8-10 drum kits)
   * @param {number} slot - Slot number (0-10)
   * @throws {Error} If slot is invalid
   */
  assignSlot (slot) {
    if (typeof slot !== 'number' || slot < 0 || slot > 10) {
      throw new Error(`Invalid slot: ${slot}. Must be 0-10`)
    }
    this.assignedSlot = slot
  }

  /**
   * Entry #SynthUI: Set user's selected synth preset slot
   * @param {number|null} slot - Preset slot (0-10) or null to use default
   */
  setSynthPresetSlot (slot) {
    if (slot !== null && (typeof slot !== 'number' || slot < 0 || slot > 10)) {
      throw new Error(`Invalid synth preset slot: ${slot}. Must be 0-10 or null`)
    }
    this.synthPresetSlot = slot
  }

  /**
   * Entry #SynthUI: Set user's custom synth parameters
   * @param {Object|null} params - Synth parameters object or null
   */
  setSynthParams (params) {
    if (params !== null && typeof params !== 'object') {
      throw new Error('Synth params must be an object or null')
    }
    this.synthParams = params
  }

  /**
   * Assign color from pool
   * @param {string} color - Hex color (#e41a1c format)
   * @throws {Error} If color format is invalid
   */
  assignColor (color) {
    if (!this.validateHexColor(color)) {
      throw new Error(`Invalid color format: ${color}. Must be lowercase hex (#rrggbb)`)
    }
    this.assignedColor = color
  }

  /**
   * Validate hex color format (lowercase only)
   * @param {string} color - Color to validate
   * @returns {boolean} True if valid hex color
   */
  validateHexColor (color) {
    return /^#[0-9a-f]{6}$/.test(color)
  }

  /**
   * Update user activity timestamp
   * Constitutional requirement: Track activity for session management
   */
  updateActivity () {
    this.lastActivity = new Date()
    if (!this.isActive) {
      this.isActive = true
    }
  }

  /**
   * Mark user as inactive
   * Called when no gestures received for 30 seconds
   */
  markInactive () {
    this.isActive = false
  }

  /**
   * Check if user session is expired
   * @param {number} timeoutMs - Timeout in milliseconds (default: 5 minutes)
   * @returns {boolean} True if session expired
   */
  isSessionExpired (timeoutMs = 5 * 60 * 1000) {
    const timeSinceActivity = Date.now() - this.lastActivity.getTime()
    return timeSinceActivity > timeoutMs
  }

  /**
   * Get user status for room notifications
   * @returns {Object} User status object
   */
  getStatus () {
    return {
      userId: this.id,
      deviceType: this.deviceType,
      isActive: this.isActive,
      joinedAt: this.joinedAt.toISOString(),
      lastActivity: this.lastActivity.toISOString()
    }
  }

  /**
   * Get user profile for API responses
   * @returns {Object} User profile object
   */
  toUserProfile () {
    return {
      id: this.id,
      deviceType: this.deviceType,
      platform: this.platform,
      capabilities: this.capabilities,
      joinedAt: this.joinedAt.toISOString(),
      isActive: this.isActive
    }
  }

  /**
   * Validate user is in a room
   * @returns {boolean} True if user is in a room
   */
  isInRoom () {
    return this.roomId !== null
  }

  /**
   * Create user data for room-joined response
   * Constitutional requirement: No personal identification data
   * @returns {Object} Anonymous user data
   */
  toRoomJoinedResponse () {
    return {
      userId: this.id,
      assignedColor: this.assignedColor,
      assignedSlot: this.assignedSlot,
      deviceType: this.deviceType,
      joinedAt: this.joinedAt.toISOString()
    }
  }

  /**
   * Create user data for user-joined/user-left notifications
   * @returns {Object} User notification data
   */
  toUserNotification () {
    return {
      userId: this.id,
      color: this.assignedColor,
      slot: this.assignedSlot,
      deviceType: this.deviceType
    }
  }

  /**
   * Static method to create user from join-room request
   * @param {Object} joinRequest - Request data from client
   * @returns {User} New user instance
   */
  static fromJoinRequest (joinRequest) {
    const { deviceType } = joinRequest

    if (!deviceType) {
      throw new Error('Device type is required')
    }

    return new User(deviceType)
  }

  /**
   * Validate user for room operations
   * Constitutional requirement: Ensure user state consistency
   * @throws {Error} If user state is invalid
   */
  validateForRoomOperation () {
    if (!this.id) {
      throw new Error('User ID is required')
    }

    if (!this.deviceType) {
      throw new Error('Device type is required')
    }

    if (!this.joinedAt) {
      throw new Error('Join timestamp is required')
    }
  }
}

module.exports = User
