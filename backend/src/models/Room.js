/**
 * Room Model
 * Virtual collaborative space with unique sonic personality
 * Constitutional requirement: 3 users max, 24-hour memory retention
 */
class Room {
  constructor (id) {
    this.id = id
    this.createdAt = new Date()
    this.lastActivity = new Date()
    this.users = new Map() // userId -> User object
    this.memoryState = null
    this.isActive = false
    this.maxUsers = 3 // Limited for better musical control

    // Multi-user canvas state
    this.drawingStrokes = [] // Array of completed DrawingStroke objects
    this.cursorPositions = new Map() // userId -> CursorPosition object
    this.availableColors = new Set([
      '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
      '#ffff33', '#a65628', '#f781bf', '#999999', '#66c2a5'
    ]) // 10-color pool for user assignment
    this.maxStrokes = 10000 // Soft limit for memory management
  }

  /**
   * Add user to room
   * @param {User} user - User instance to add
   * @throws {Error} If room is full or user already in room
   */
  addUser (user) {
    if (this.users.size >= this.maxUsers) {
      throw new Error('ROOM_FULL')
    }

    if (this.users.has(user.id)) {
      throw new Error('User already in room')
    }

    this.users.set(user.id, user)
    user.joinRoom(this.id)
    this.updateActivity()

    if (!this.isActive) {
      this.isActive = true
    }
  }

  /**
   * Remove user from room
   * @param {string} userId - User ID to remove
   * @returns {User|null} Removed user or null if not found
   */
  removeUser (userId) {
    const user = this.users.get(userId)
    if (!user) {
      return null
    }

    this.users.delete(userId)
    user.leaveRoom()
    this.updateActivity()

    // Room becomes inactive when empty
    if (this.users.size === 0) {
      this.isActive = false
      this.startMemoryExpiration()
    }

    return user
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID to find
   * @returns {User|null} User instance or null
   */
  getUser (userId) {
    return this.users.get(userId) || null
  }

  /**
   * Get all users in room
   * @returns {User[]} Array of user instances
   */
  getUsers () {
    return Array.from(this.users.values())
  }

  /**
   * Get current user count
   * @returns {number} Number of users in room
   */
  getUserCount () {
    return this.users.size
  }

  /**
   * Check if room is full
   * @returns {boolean} True if room has reached max capacity
   */
  isFull () {
    return this.users.size >= this.maxUsers
  }

  /**
   * Check if room is empty
   * @returns {boolean} True if no users in room
   */
  isEmpty () {
    return this.users.size === 0
  }

  /**
   * Assign color to user from available pool
   * @param {User} user - User to assign color to
   * @returns {string} Assigned hex color
   * @throws {Error} If no colors available
   */
  assignColorToUser (user) {
    if (this.availableColors.size === 0) {
      throw new Error('No colors available in pool')
    }

    // Get first available color
    const color = Array.from(this.availableColors)[0]
    this.availableColors.delete(color)
    user.assignColor(color)

    return color
  }

  /**
   * Release user color back to available pool
   * @param {User} user - User whose color to release
   */
  releaseUserColor (user) {
    if (user.assignedColor) {
      this.availableColors.add(user.assignedColor)
    }
  }

  /**
   * Add completed drawing stroke to room history
   * @param {DrawingStroke} stroke - Completed stroke object
   */
  addDrawingStroke (stroke) {
    // Set roomId for referential integrity
    stroke.roomId = this.id

    this.drawingStrokes.push(stroke)
    this.updateActivity()

    // Enforce max strokes limit (prune oldest if exceeded)
    if (this.drawingStrokes.length > this.maxStrokes) {
      this.drawingStrokes.shift() // Remove oldest stroke
    }
  }

  /**
   * Get all drawing strokes for history transmission
   * @returns {DrawingStroke[]} Array of all strokes
   */
  getDrawingHistory () {
    return this.drawingStrokes
  }

  /**
   * Update cursor position for a user
   * @param {string} userId - User ID
   * @param {CursorPosition} cursorPosition - Cursor position object
   */
  updateCursorPosition (userId, cursorPosition) {
    this.cursorPositions.set(userId, cursorPosition)
    this.updateActivity()
  }

  /**
   * Remove cursor position for a user
   * @param {string} userId - User ID
   */
  removeCursorPosition (userId) {
    this.cursorPositions.delete(userId)
  }

  /**
   * Get cursor position for a user
   * @param {string} userId - User ID
   * @returns {CursorPosition|null} Cursor position or null
   */
  getCursorPosition (userId) {
    return this.cursorPositions.get(userId) || null
  }

  /**
   * Update room activity timestamp
   */
  updateActivity () {
    this.lastActivity = new Date()
  }

  /**
   * Start 24-hour memory expiration timer
   * Constitutional requirement: Memory persists exactly 24 hours after empty
   */
  startMemoryExpiration () {
    if (this.memoryState) {
      const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      this.memoryState.setExpiration(expirationTime)
    }
  }

  /**
   * Set room memory state
   * @param {MemoryState} memoryState - Memory state instance
   */
  setMemoryState (memoryState) {
    this.memoryState = memoryState
  }

  /**
   * Get current memory influence for new users
   * @returns {Object} Memory influence data
   */
  getMemoryInfluence () {
    if (!this.memoryState || this.memoryState.isExpired()) {
      return {
        patterns: [],
        adaptationStrength: 0.0,
        roomPersonality: {}
      }
    }

    return this.memoryState.getInfluence()
  }

  /**
   * Process gesture for room memory learning
   * @param {Gesture} gesture - Gesture instance
   */
  processGestureForMemory (gesture) {
    if (this.memoryState && !this.memoryState.isExpired()) {
      this.memoryState.learnFromGesture(gesture)
      this.updateActivity()
    }
  }

  /**
   * Get room state for room-joined response
   * @returns {Object} Room state data
   */
  toRoomJoinedResponse () {
    return {
      roomId: this.id,
      userCount: this.getUserCount(),
      memoryInfluence: this.getMemoryInfluence(),
      createdAt: this.createdAt.toISOString(),
      isActive: this.isActive
    }
  }

  /**
   * Get room data for user notifications
   * @returns {Object} Room notification data
   */
  toUserNotification () {
    return {
      roomId: this.id,
      userCount: this.getUserCount()
    }
  }

  /**
   * Check if room should be cleaned up
   * Constitutional requirement: Clean up expired rooms
   * @returns {boolean} True if room should be removed
   */
  shouldCleanup () {
    // Room can be cleaned up if:
    // 1. Empty for more than 24 hours AND memory expired
    // 2. No activity for more than 48 hours (safety cleanup)

    if (this.isEmpty() && this.memoryState && this.memoryState.isExpired()) {
      return true
    }

    const hoursSinceActivity = (Date.now() - this.lastActivity.getTime()) / (1000 * 60 * 60)
    return hoursSinceActivity > 48
  }

  /**
   * Get active users (recently active)
   * @returns {User[]} Array of active users
   */
  getActiveUsers () {
    return this.getUsers().filter(user => user.isActive)
  }

  /**
   * Mark inactive users based on activity timeout
   * @param {number} timeoutMs - Inactivity timeout in milliseconds (default: 30 seconds)
   * @returns {string[]} Array of user IDs marked inactive
   */
  markInactiveUsers (timeoutMs = 30 * 1000) {
    const inactiveUserIds = []
    const now = Date.now()

    this.users.forEach(user => {
      if (user.isActive && (now - user.lastActivity.getTime()) > timeoutMs) {
        user.markInactive()
        inactiveUserIds.push(user.id)
      }
    })

    return inactiveUserIds
  }

  /**
   * Remove expired user sessions
   * @param {number} sessionTimeoutMs - Session timeout in milliseconds (default: 5 minutes)
   * @returns {User[]} Array of removed users
   */
  removeExpiredSessions (sessionTimeoutMs = 5 * 60 * 1000) {
    const expiredUsers = []

    this.users.forEach(user => {
      if (user.isSessionExpired(sessionTimeoutMs)) {
        this.removeUser(user.id)
        expiredUsers.push(user)
      }
    })

    return expiredUsers
  }

  /**
   * Validate room state
   * Constitutional requirement: Ensure room state consistency
   * @throws {Error} If room state is invalid
   */
  validateState () {
    if (!this.id) {
      throw new Error('Room ID is required')
    }

    if (this.users.size > this.maxUsers) {
      throw new Error(`Room exceeds maximum user limit: ${this.maxUsers}`)
    }

    if (!this.createdAt) {
      throw new Error('Room creation timestamp is required')
    }

    // Validate all users belong to this room
    this.users.forEach(user => {
      if (user.roomId !== this.id) {
        throw new Error(`User ${user.id} room mismatch: expected ${this.id}, got ${user.roomId}`)
      }
    })
  }
}

module.exports = Room
