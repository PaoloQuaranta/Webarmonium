/**
 * ConnectionTracker
 * Tracks connected users across landing room and regular rooms
 * Controls WebMetricsPoller lifecycle based on connection state
 */

class ConnectionTracker {
  constructor () {
    // Socket to room mapping
    this.connections = new Map() // socketId -> { roomId, connectedAt }

    // Activity tracking for inactivity backoff
    this.lastActivityTime = Date.now()

    // Lifecycle callbacks
    this.onEmptyCallback = null
    this.onFirstUserCallback = null

    // Socket.IO reference for room counting
    this.io = null
  }

  /**
   * Set Socket.IO instance for room counting
   * @param {Server} io - Socket.IO server instance
   */
  setIO (io) {
    // Validate io is a Socket.IO server instance (basic duck-typing check)
    if (!io) {
      return
    }

    if (typeof io.to !== 'function' || typeof io.emit !== 'function') {
      return
    }

    this.io = io
  }

  /**
   * Set callback for when all users disconnect
   * @param {Function} callback - Called when going from 1+ to 0 users
   */
  setOnEmptyCallback (callback) {
    this.onEmptyCallback = callback
  }

  /**
   * Set callback for when first user connects
   * @param {Function} callback - Called when going from 0 to 1 users
   */
  setOnFirstUserCallback (callback) {
    this.onFirstUserCallback = callback
  }

  /**
   * Track a new user connection
   * @param {string} socketId - Socket ID
   * @param {string} roomId - Room ID (landing-room or regular room)
   */
  onUserConnected (socketId, roomId) {
    const wasEmpty = this.connections.size === 0

    this.connections.set(socketId, {
      roomId,
      connectedAt: Date.now()
    })

    // Update activity on connection
    this.updateActivity()

    // Trigger first user callback if we went from 0 to 1
    if (wasEmpty && this.onFirstUserCallback) {
      this.onFirstUserCallback()
    }
  }

  /**
   * Remove a user from tracking
   * @param {string} socketId - Socket ID
   */
  onUserDisconnected (socketId) {
    const wasTracked = this.connections.has(socketId)
    this.connections.delete(socketId)

    // Trigger empty callback if we went from 1 to 0
    if (wasTracked && this.connections.size === 0 && this.onEmptyCallback) {
      this.onEmptyCallback()
    }
  }

  /**
   * Update last activity timestamp
   * Called on user interactions (gestures, cursor moves, etc.)
   */
  updateActivity () {
    this.lastActivityTime = Date.now()
  }

  /**
   * Get timestamp of last user activity
   * @returns {number} Unix timestamp
   */
  getLastActivityTime () {
    return this.lastActivityTime
  }

  /**
   * Get total count of connected users
   * @returns {number} Total users across all rooms
   */
  getTotalUserCount () {
    return this.connections.size
  }

  /**
   * Get count of users in landing room
   * @returns {number} Users in landing-room
   */
  getLandingRoomUserCount () {
    let count = 0
    for (const conn of this.connections.values()) {
      if (conn.roomId === 'landing-room') {
        count++
      }
    }
    return count
  }

  /**
   * Get count of users in regular rooms (not landing)
   * @returns {number} Users in non-landing rooms
   */
  getRegularRoomUserCount () {
    let count = 0
    for (const conn of this.connections.values()) {
      if (conn.roomId !== 'landing-room') {
        count++
      }
    }
    return count
  }

  /**
   * Get count of unique regular rooms with users (not landing)
   * @returns {number} Number of rooms with at least one user
   */
  getActiveRoomCount () {
    const rooms = new Set()
    for (const conn of this.connections.values()) {
      if (conn.roomId !== 'landing-room') {
        rooms.add(conn.roomId)
      }
    }
    return rooms.size
  }

  /**
   * Check if there are any connected users
   * @returns {boolean} True if at least one user is connected
   */
  hasConnections () {
    return this.connections.size > 0
  }

  /**
   * Get connection statistics
   * @returns {Object} Statistics object
   */
  getStats () {
    const now = Date.now()
    return {
      totalConnections: this.connections.size,
      landingRoomUsers: this.getLandingRoomUserCount(),
      regularRoomUsers: this.getRegularRoomUserCount(),
      lastActivityTime: this.lastActivityTime,
      inactivityDuration: now - this.lastActivityTime
    }
  }
}

module.exports = ConnectionTracker
