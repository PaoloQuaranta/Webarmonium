const Room = require('../models/Room')
const User = require('../models/User')
const MemoryState = require('../models/MemoryState')
const ColorAssignmentService = require('./ColorAssignmentService')
const DrawingSyncService = require('./DrawingSyncService')

/**
 * RoomManager Service
 * Manages room lifecycle, user coordination, and capacity management
 * Constitutional requirement: 5-10 users max, memory lifecycle management
 * Extended: Multi-user canvas support (color assignment, drawing sync)
 */
class RoomManager {
  constructor () {
    this.rooms = new Map() // roomId -> Room instance
    this.userRoomMap = new Map() // userId -> roomId
    this.cleanupInterval = null

    // Multi-user canvas services (per-room)
    this.colorServices = new Map() // roomId -> ColorAssignmentService
    this.drawingServices = new Map() // roomId -> DrawingSyncService

    this.startPeriodicCleanup()
  }

  /**
   * Create or join a room
   * @param {string} userId - User ID
   * @param {string} roomId - Room ID to join
   * @param {Object} userData - User connection data
   * @returns {Object} Room join result
   */
  async joinRoom(userId, roomId, userData = {}) {
    // Validate inputs
    if (!userId || !roomId) {
      throw new Error('User ID and Room ID are required')
    }

    // Check if user is already in a room
    if (this.userRoomMap.has(userId)) {
      const currentRoomId = this.userRoomMap.get(userId)
      if (currentRoomId === roomId) {
        throw new Error('User already in this room')
      }
      // Auto-leave current room
      await this.leaveRoom(userId)
    }

    // Get or create room
    let room = this.rooms.get(roomId)
    if (!room) {
      room = new Room(roomId)
      // Initialize memory state for new room
      room.setMemoryState(new MemoryState(roomId))
      this.rooms.set(roomId, room)

      // Initialize color and drawing services for new room
      this.colorServices.set(roomId, new ColorAssignmentService())
      this.drawingServices.set(roomId, new DrawingSyncService())
    }

    // Check room capacity (max 10 users - constitutional requirement)
    if (room.isFull()) {
      throw new Error('ROOM_FULL')
    }

    // Create user instance
    const user = new User(userId, userData)

    // Add user to room
    room.addUser(user)
    this.userRoomMap.set(userId, roomId)

    // Assign color to user from room's color pool
    const colorService = this.colorServices.get(roomId)
    const assignedColor = colorService.assignColor(userId)
    user.assignColor(assignedColor)

    // Get memory influence for new user
    const memoryInfluence = room.getMemoryInfluence()

    // Get all users with their colors for multi-user canvas
    const allUsers = room.getUsers().map(u => ({
      id: u.id,
      color: u.assignedColor
    }))

    return {
      success: true,
      userId: user.id,
      assignedColor: assignedColor,
      users: allUsers,
      room: room.toRoomJoinedResponse(),
      user: user.toUserProfile(),
      memoryInfluence,
      otherUsers: room.getUsers()
        .filter(u => u.id !== userId)
        .map(u => u.toUserProfile())
    }
  }

  /**
   * Remove user from room
   * @param {string} userId - User ID to remove
   * @returns {Object} Leave result
   */
  async leaveRoom(userId) {
    const roomId = this.userRoomMap.get(userId)
    if (!roomId) {
      throw new Error('User not in any room')
    }

    const room = this.rooms.get(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    const user = room.removeUser(userId)
    this.userRoomMap.delete(userId)

    if (!user) {
      throw new Error('User not found in room')
    }

    // Release user's color back to room pool
    const colorService = this.colorServices.get(roomId)
    if (colorService) {
      colorService.releaseColor(userId)
    }

    // Cancel any active drawing stroke
    const drawingService = this.drawingServices.get(roomId)
    if (drawingService) {
      drawingService.cancelStroke(userId)
    }

    // Remove cursor position from room
    room.removeCursorPosition(userId)

    const result = {
      success: true,
      userId,
      roomId,
      remainingUsers: room.getUserCount()
    }

    // Start memory expiration if room becomes empty
    if (room.isEmpty()) {
      room.startMemoryExpiration()
      result.memoryExpirationStarted = true
    }

    return result
  }

  /**
   * Get room instance by ID
   * @param {string} roomId - Room ID
   * @returns {Room|null} Room instance or null
   */
  getRoom(roomId) {
    return this.rooms.get(roomId) || null
  }

  /**
   * Get user's current room
   * @param {string} userId - User ID
   * @returns {Room|null} Room instance or null
   */
  getUserRoom(userId) {
    const roomId = this.userRoomMap.get(userId)
    return roomId ? this.rooms.get(roomId) : null
  }

  /**
   * Get all active rooms
   * @returns {Room[]} Array of active room instances
   */
  getActiveRooms() {
    return Array.from(this.rooms.values()).filter(room => room.isActive)
  }

  /**
   * Get room statistics
   * @returns {Object} Room statistics
   */
  getRoomStatistics() {
    const rooms = Array.from(this.rooms.values())
    const activeRooms = rooms.filter(room => room.isActive)
    const totalUsers = rooms.reduce((sum, room) => sum + room.getUserCount(), 0)
    const roomsWithMemory = rooms.filter(room => room.memoryState && !room.memoryState.isExpired())

    return {
      totalRooms: rooms.length,
      activeRooms: activeRooms.length,
      emptyRooms: rooms.filter(room => room.isEmpty()).length,
      totalUsers,
      roomsWithMemory: roomsWithMemory.length,
      averageUsersPerRoom: activeRooms.length > 0 ?
        totalUsers / activeRooms.length : 0
    }
  }

  /**
   * Update user activity in their room
   * @param {string} userId - User ID
   * @returns {boolean} True if user activity updated
   */
  updateUserActivity(userId) {
    const room = this.getUserRoom(userId)
    if (!room) {
      return false
    }

    const user = room.getUser(userId)
    if (!user) {
      return false
    }

    user.updateActivity()
    room.updateActivity()
    return true
  }

  /**
   * Process gesture for room memory and broadcast
   * @param {string} userId - User ID
   * @param {Gesture} gesture - Processed gesture
   * @returns {Object} Processing result
   */
  processGesture(userId, gesture) {
    const room = this.getUserRoom(userId)
    if (!room) {
      throw new Error('User not in any room')
    }

    // Validate gesture belongs to user in room
    if (gesture.userId !== userId || gesture.roomId !== room.id) {
      throw new Error('Gesture user/room mismatch')
    }

    // Update user activity
    this.updateUserActivity(userId)

    // Process gesture for memory learning
    room.processGestureForMemory(gesture)

    // Get other users for broadcasting
    const otherUsers = room.getUsers()
      .filter(u => u.id !== userId && u.isActive)
      .map(u => u.id)

    return {
      success: true,
      roomId: room.id,
      broadcastTo: otherUsers,
      gestureEcho: gesture.toEchoBroadcast(),
      memoryUpdated: true
    }
  }

  /**
   * Generate sonic update for room
   * @param {string} roomId - Room ID
   * @param {SoundPattern[]} patterns - Current sound patterns
   * @returns {Object} Sonic update data
   */
  generateSonicUpdate(roomId, patterns) {
    const room = this.getRoom(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    const memoryInfluence = room.getMemoryInfluence()
    const activeUsers = room.getActiveUsers()

    return {
      roomId,
      timestamp: Date.now(),
      patterns: patterns.map(p => p.toSonicUpdate()),
      memoryInfluence: memoryInfluence.adaptationStrength,
      roomPersonality: memoryInfluence.roomPersonality,
      activeUserCount: activeUsers.length,
      collaborativeContext: activeUsers.length > 1
    }
  }

  /**
   * Handle user heartbeat and session management
   * @param {string} userId - User ID
   * @returns {Object} Heartbeat result
   */
  handleHeartbeat(userId) {
    const room = this.getUserRoom(userId)
    if (!room) {
      return {
        success: false,
        error: 'User not in any room',
        shouldReconnect: true
      }
    }

    const user = room.getUser(userId)
    if (!user) {
      return {
        success: false,
        error: 'User not found in room',
        shouldReconnect: true
      }
    }

    // Update user activity
    user.updateActivity()
    room.updateActivity()

    // Check for inactive users in room
    const inactiveUsers = room.markInactiveUsers()

    return {
      success: true,
      userId,
      roomId: room.id,
      userCount: room.getUserCount(),
      lastActivity: user.lastActivity.getTime(),
      inactiveUsers
    }
  }

  /**
   * Get drawing service for a room
   * @param {string} roomId - Room ID
   * @returns {DrawingSyncService|null} Drawing service or null
   */
  getDrawingService (roomId) {
    return this.drawingServices.get(roomId) || null
  }

  /**
   * Get color service for a room
   * @param {string} roomId - Room ID
   * @returns {ColorAssignmentService|null} Color service or null
   */
  getColorService (roomId) {
    return this.colorServices.get(roomId) || null
  }

  /**
   * Get drawing stroke history for a room
   * @param {string} roomId - Room ID
   * @returns {Object[]} Array of stroke event payloads
   */
  getDrawingHistory (roomId) {
    const room = this.getRoom(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    const strokes = room.getDrawingHistory()
    return strokes.map(stroke => stroke.toEventPayload())
  }

  /**
   * Add completed stroke to room history
   * @param {string} roomId - Room ID
   * @param {DrawingStroke} stroke - Completed stroke
   */
  addStrokeToHistory (roomId, stroke) {
    const room = this.getRoom(roomId)
    if (!room) {
      throw new Error('Room not found')
    }

    room.addDrawingStroke(stroke)
  }

  /**
   * Update cursor position for a user
   * @param {string} userId - User ID
   * @param {CursorPosition} cursorPosition - Cursor position object
   * @returns {boolean} True if updated successfully
   */
  updateCursorPosition (userId, cursorPosition) {
    const room = this.getUserRoom(userId)
    if (!room) {
      return false
    }

    room.updateCursorPosition(userId, cursorPosition)
    return true
  }

  /**
   * Get all cursor positions for a room
   * @param {string} roomId - Room ID
   * @returns {Map<string, CursorPosition>} Map of userId -> CursorPosition
   */
  getRoomCursors (roomId) {
    const room = this.getRoom(roomId)
    if (!room) {
      return new Map()
    }

    return room.cursorPositions
  }

  /**
   * Start periodic cleanup of expired rooms and sessions
   */
  startPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.performCleanup()
    }, 5 * 60 * 1000)
  }

  /**
   * Perform cleanup of expired rooms and sessions
   * @returns {Object} Cleanup statistics
   */
  performCleanup() {
    const stats = {
      roomsCleaned: 0,
      sessionsExpired: 0,
      usersRemoved: 0,
      memoriesExpired: 0
    }

    // Clean up expired sessions in all rooms
    this.rooms.forEach(room => {
      const expiredUsers = room.removeExpiredSessions()
      stats.sessionsExpired += expiredUsers.length

      // Remove user-room mappings for expired users
      expiredUsers.forEach(user => {
        this.userRoomMap.delete(user.id)
        stats.usersRemoved++
      })
    })

    // Clean up expired rooms
    const roomsToDelete = []
    this.rooms.forEach((room, roomId) => {
      if (room.shouldCleanup()) {
        roomsToDelete.push(roomId)

        // Remove all remaining users from room mapping
        room.getUsers().forEach(user => {
          this.userRoomMap.delete(user.id)
          stats.usersRemoved++
        })

        if (room.memoryState && room.memoryState.isExpired()) {
          stats.memoriesExpired++
        }
      }
    })

    // Delete expired rooms and cleanup services
    roomsToDelete.forEach(roomId => {
      this.rooms.delete(roomId)

      // Cleanup color and drawing services
      this.colorServices.delete(roomId)
      this.drawingServices.delete(roomId)

      stats.roomsCleaned++
    })

    return stats
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Get room lobby information (for room discovery)
   * @param {number} limit - Maximum number of rooms to return
   * @returns {Object[]} Array of room lobby data
   */
  getRoomLobby(limit = 10) {
    return Array.from(this.rooms.values())
      .filter(room => room.isActive && !room.isFull())
      .sort((a, b) => b.getUserCount() - a.getUserCount()) // Most active first
      .slice(0, limit)
      .map(room => ({
        roomId: room.id,
        userCount: room.getUserCount(),
        maxUsers: room.maxUsers,
        hasMemory: room.memoryState && !room.memoryState.isExpired(),
        memoryAge: room.memoryState ?
          Date.now() - room.memoryState.createdAt.getTime() : 0,
        lastActivity: room.lastActivity.getTime(),
        createdAt: room.createdAt.getTime()
      }))
  }

  /**
   * Force disconnect user from room (admin function)
   * @param {string} userId - User ID to disconnect
   * @param {string} reason - Disconnect reason
   * @returns {Object} Disconnect result
   */
  forceDisconnectUser(userId, reason = 'Administrative disconnect') {
    try {
      const result = this.leaveRoom(userId)
      result.forced = true
      result.reason = reason
      return result
    } catch (error) {
      return {
        success: false,
        error: error.message,
        userId
      }
    }
  }

  /**
   * Validate room manager state
   * Constitutional requirement: Ensure service integrity
   * @throws {Error} If state is inconsistent
   */
  validateState() {
    // Validate room-user mappings consistency
    this.userRoomMap.forEach((roomId, userId) => {
      const room = this.rooms.get(roomId)
      if (!room) {
        throw new Error(`User ${userId} mapped to non-existent room ${roomId}`)
      }

      const user = room.getUser(userId)
      if (!user) {
        throw new Error(`User ${userId} in mapping but not in room ${roomId}`)
      }

      if (user.roomId !== roomId) {
        throw new Error(`User ${userId} room mismatch: mapping=${roomId}, user=${user.roomId}`)
      }
    })

    // Validate room user mappings
    this.rooms.forEach((room, roomId) => {
      room.validateState()

      room.getUsers().forEach(user => {
        const mappedRoomId = this.userRoomMap.get(user.id)
        if (mappedRoomId !== roomId) {
          throw new Error(`Room ${roomId} has user ${user.id} but mapping shows ${mappedRoomId}`)
        }
      })
    })

    // Validate constitutional room limits
    this.rooms.forEach(room => {
      if (room.getUserCount() > room.maxUsers) {
        throw new Error(`Room ${room.id} exceeds maximum user limit`)
      }
    })
  }

  /**
   * Shutdown room manager gracefully
   */
  shutdown() {
    this.stopPeriodicCleanup()

    // Disconnect all users
    const allUsers = Array.from(this.userRoomMap.keys())
    allUsers.forEach(userId => {
      try {
        this.leaveRoom(userId)
      } catch (error) {
        // Log error but continue shutdown
        console.warn(`Error disconnecting user ${userId} during shutdown:`, error.message)
      }
    })

    // Clear all data structures
    this.rooms.clear()
    this.userRoomMap.clear()
    this.colorServices.clear()
    this.drawingServices.clear()
  }
}

module.exports = RoomManager