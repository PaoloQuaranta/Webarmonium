const Room = require('../models/Room')
const User = require('../models/User')
const MemoryState = require('../models/MemoryState')
const ColorAssignmentService = require('./ColorAssignmentService')
const DrawingSyncService = require('./DrawingSyncService')
const CollectiveMetricsAnalyzer = require('./CollectiveMetricsAnalyzer')

/**
 * RoomManager Service
 * Manages room lifecycle, user coordination, and capacity management
 * Supports solo mode (1 real user + 2 virtual users) and multi mode (2-4 real users)
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

    // Hover orchestration services (per-room)
    this.hoverOrchestrators = new Map() // roomId -> HoverOrchestrator

    // Collective metrics analyzers (per-room)
    this.metricsAnalyzers = new Map() // roomId -> CollectiveMetricsAnalyzer

    // Virtual user service reference (set externally)
    this.virtualUserService = null

    // Socket.IO reference for mode transition events (set externally)
    this.io = null

    this.startPeriodicCleanup()
    this.startMetricsBroadcast()
  }

  /**
   * Set VirtualUserService reference
   * @param {VirtualUserService} service
   */
  setVirtualUserService(service) {
    this.virtualUserService = service
  }

  /**
   * Set Socket.IO reference for broadcasting
   * @param {SocketIO} io
   */
  setSocketIO(io) {
    this.io = io
  }

  /**
   * Create or join a room
   * @param {string} userId - User ID
   * @param {string} roomId - Room ID to join
   * @param {Object} userData - User connection data
   * @returns {Object} Room join result
   */
  async joinRoom (userId, roomId, userData = {}) {
    // Validate inputs
    if (!userId || !roomId) {
      throw new Error('User ID and Room ID are required')
    }

    // Check if user is already in a room
    if (this.userRoomMap.has(userId)) {
      const currentRoomId = this.userRoomMap.get(userId)
      if (currentRoomId === roomId) {
        // Idempotency: User already in this room, return current room instead of error
        // This handles reconnection cases where client doesn't properly disconnect
        const room = this.rooms.get(roomId)
        return room
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

      // Initialize collective metrics analyzer for new room
      const metricsAnalyzer = new CollectiveMetricsAnalyzer()
      metricsAnalyzer.start()
      this.metricsAnalyzers.set(roomId, metricsAnalyzer)
    }

    // Check room capacity - if full, create overflow room
    if (room.isFull()) {
      const overflowRoomId = this.createOverflowRoom(roomId)
      // Recursively join the overflow room
      return this.joinRoom(userId, overflowRoomId, { ...userData, redirectedFrom: roomId })
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

    // Handle virtual user mode transitions
    const modeChange = room.updateMode()
    let modeTransitionInfo = null

    console.log(`🔄 RoomManager.joinRoom: roomId=${roomId}, userCount=${room.getUserCount()}, modeChange=${JSON.stringify(modeChange)}, hasVirtualUserService=${!!this.virtualUserService}`)

    if (room.getUserCount() === 1 && this.virtualUserService) {
      // First user joined: activate virtual users
      const activeSources = this.virtualUserService.getMostActiveSources()
      console.log(`🎭 Activating virtual users for room ${roomId}: ${activeSources.join(', ')}`)
      this.virtualUserService.activateForRoom(roomId, activeSources, {
        key: 'C',
        mode: 'ionian',
        tempo: 120
      })
      room.addVirtualUser(activeSources[0] + '-metrics', this.virtualUserService.virtualUserConfigs[activeSources[0]])
      room.addVirtualUser(activeSources[1] + '-metrics', this.virtualUserService.virtualUserConfigs[activeSources[1]])
    } else if (modeChange.changed && modeChange.to === 'multi' && this.virtualUserService) {
      // Transition from solo to multi: deactivate virtual users
      console.log(`🎭 Deactivating virtual users for room ${roomId} (mode: solo→multi)`)
      this.virtualUserService.deactivateForRoom(roomId, true)
      room.clearVirtualUsers()

      // Emit mode transition notification
      if (this.io) {
        this.io.to(roomId).emit('mode-transition', {
          from: 'solo',
          to: 'multi',
          message: 'Un altro utente si \u00e8 unito - le voci virtuali vengono sostituite',
          duration: 3000,
          timestamp: Date.now()
        })
      }
      modeTransitionInfo = { from: 'solo', to: 'multi' }
    }

    return {
      success: true,
      userId: user.id,
      assignedColor,
      users: allUsers,
      room: room.toRoomJoinedResponse(),
      user: user.toUserProfile(),
      memoryInfluence,
      otherUsers: room.getUsers()
        .filter(u => u.id !== userId)
        .map(u => u.toUserProfile()),
      redirectedFrom: userData.redirectedFrom || null,
      modeTransition: modeTransitionInfo
    }
  }

  /**
   * Remove user from room
   * @param {string} userId - User ID to remove
   * @returns {Object} Leave result
   */
  async leaveRoom (userId) {
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

    // Handle mode transitions
    const modeChange = room.updateMode()

    console.log(`🔄 RoomManager.leaveRoom: roomId=${roomId}, userCount=${room.getUserCount()}, isEmpty=${room.isEmpty()}, modeChange=${JSON.stringify(modeChange)}, hasVirtualUserService=${!!this.virtualUserService}`)

    if (room.isEmpty()) {
      // Room is now empty: deactivate virtual users and start memory expiration
      console.log(`🎭 Deactivating virtual users for empty room ${roomId}`)
      if (this.virtualUserService) {
        this.virtualUserService.deactivateForRoom(roomId, false)
      }
      room.clearVirtualUsers()
      room.startMemoryExpiration()
      result.memoryExpirationStarted = true
    } else if (modeChange.changed && modeChange.to === 'solo' && this.virtualUserService) {
      // Transition from multi to solo: activate virtual users
      const activeSources = this.virtualUserService.getMostActiveSources()
      console.log(`🎭 Reactivating virtual users for room ${roomId} (mode: multi→solo): ${activeSources.join(', ')}`)
      this.virtualUserService.activateForRoom(roomId, activeSources, {
        key: 'C',
        mode: 'ionian',
        tempo: 120
      })
      room.addVirtualUser(activeSources[0] + '-metrics', this.virtualUserService.virtualUserConfigs[activeSources[0]])
      room.addVirtualUser(activeSources[1] + '-metrics', this.virtualUserService.virtualUserConfigs[activeSources[1]])
      result.modeTransition = { from: 'multi', to: 'solo' }

      // Emit mode-transition event for multi→solo (consistent with solo→multi in joinRoom)
      if (this.io) {
        this.io.to(roomId).emit('mode-transition', {
          from: 'multi',
          to: 'solo',
          message: 'Virtual voices are joining you',
          duration: 3000,
          timestamp: Date.now()
        })
      }
    }

    return result
  }

  /**
   * Get room instance by ID
   * @param {string} roomId - Room ID
   * @returns {Room|null} Room instance or null
   */
  getRoom (roomId) {
    return this.rooms.get(roomId) || null
  }

  /**
   * Get user's current room
   * @param {string} userId - User ID
   * @returns {Room|null} Room instance or null
   */
  getUserRoom (userId) {
    const roomId = this.userRoomMap.get(userId)
    return roomId ? this.rooms.get(roomId) : null
  }

  /**
   * Get all active rooms
   * @returns {Room[]} Array of active room instances
   */
  getActiveRooms () {
    return Array.from(this.rooms.values()).filter(room => room.isActive)
  }

  /**
   * Get room statistics
   * @returns {Object} Room statistics
   */
  getRoomStatistics () {
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
      averageUsersPerRoom: activeRooms.length > 0
        ? totalUsers / activeRooms.length
        : 0
    }
  }

  /**
   * Update user activity in their room
   * @param {string} userId - User ID
   * @returns {boolean} True if user activity updated
   */
  updateUserActivity (userId) {
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
  processGesture (userId, gesture) {
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
  generateSonicUpdate (roomId, patterns) {
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
  handleHeartbeat (userId) {
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
  startPeriodicCleanup () {
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
  performCleanup () {
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

      // Cleanup HoverOrchestrator
      this.removeHoverOrchestrator(roomId)

      // Cleanup CollectiveMetricsAnalyzer
      const metricsAnalyzer = this.metricsAnalyzers.get(roomId)
      if (metricsAnalyzer) {
        metricsAnalyzer.stop()
        this.metricsAnalyzers.delete(roomId)
      }

      stats.roomsCleaned++
    })

    return stats
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup () {
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
  getRoomLobby (limit = 10) {
    return Array.from(this.rooms.values())
      .filter(room => room.isActive && !room.isFull())
      .sort((a, b) => b.getUserCount() - a.getUserCount()) // Most active first
      .slice(0, limit)
      .map(room => ({
        roomId: room.id,
        userCount: room.getUserCount(),
        maxUsers: room.maxUsers,
        hasMemory: room.memoryState && !room.memoryState.isExpired(),
        memoryAge: room.memoryState
          ? Date.now() - room.memoryState.createdAt.getTime()
          : 0,
        lastActivity: room.lastActivity.getTime(),
        createdAt: room.createdAt.getTime()
      }))
  }

  /**
   * Create overflow room when original room is full
   * Uses incremental naming: room-2, room-3, etc.
   * @param {string} originalRoomId - Original room ID
   * @returns {string} New overflow room ID
   */
  createOverflowRoom(originalRoomId) {
    // Extract base name (remove any existing suffix like -2, -3)
    const baseMatch = originalRoomId.match(/^(.+?)(-\d+)?$/)
    const baseName = baseMatch ? baseMatch[1] : originalRoomId

    // Find next available suffix
    let suffix = 2
    let newRoomId = `${baseName}-${suffix}`

    // Check if rooms with this suffix exist and are full
    while (this.rooms.has(newRoomId)) {
      const existingRoom = this.rooms.get(newRoomId)
      if (!existingRoom.isFull()) {
        // Found a room with space
        return newRoomId
      }
      suffix++
      newRoomId = `${baseName}-${suffix}`
    }

    console.log(`🏠 Created overflow room: ${newRoomId} (from ${originalRoomId})`)
    return newRoomId
  }

  /**
   * Force disconnect user from room (admin function)
   * @param {string} userId - User ID to disconnect
   * @param {string} reason - Disconnect reason
   * @returns {Object} Disconnect result
   */
  forceDisconnectUser (userId, reason = 'Administrative disconnect') {
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
  validateState () {
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
   * Get HoverOrchestrator for a room
   * @param {string} roomId - Room ID
   * @returns {HoverOrchestrator|null} HoverOrchestrator instance or null
   */
  getHoverOrchestrator (roomId) {
    return this.hoverOrchestrators.get(roomId) || null
  }

  /**
   * Set HoverOrchestrator for a room
   * @param {string} roomId - Room ID
   * @param {HoverOrchestrator} hoverOrchestrator - HoverOrchestrator instance
   */
  setHoverOrchestrator (roomId, hoverOrchestrator) {
    this.hoverOrchestrators.set(roomId, hoverOrchestrator)
  }

  /**
   * Remove HoverOrchestrator for a room
   * @param {string} roomId - Room ID
   */
  removeHoverOrchestrator (roomId) {
    const orchestrator = this.hoverOrchestrators.get(roomId)
    if (orchestrator) {
      orchestrator.stop()
      this.hoverOrchestrators.delete(roomId)
      // console.log(`🗑️ Removed HoverOrchestrator for room ${roomId}`)
    }
  }

  /**
   * Shutdown room manager gracefully
   */
  shutdown () {
    this.stopPeriodicCleanup()

    // Disconnect all users
    const allUsers = Array.from(this.userRoomMap.keys())
    allUsers.forEach(userId => {
      try {
        this.leaveRoom(userId)
      } catch (error) {
        // Log error but continue shutdown
        // console.warn(`Error disconnecting user ${userId} during shutdown:`, error.message)
      }
    })

    // Stop all HoverOrchestrators
    this.hoverOrchestrators.forEach((orchestrator, roomId) => {
      try {
        orchestrator.stop()
        // console.log(`🛑 Stopped HoverOrchestrator for room ${roomId}`)
      } catch (error) {
        // console.warn(`Error stopping HoverOrchestrator for room ${roomId}:`, error.message)
      }
    })

    // Stop all CollectiveMetricsAnalyzers
    this.metricsAnalyzers.forEach((analyzer, roomId) => {
      try {
        analyzer.stop()
        // console.log(`🛑 Stopped CollectiveMetricsAnalyzer for room ${roomId}`)
      } catch (error) {
        // console.warn(`Error stopping CollectiveMetricsAnalyzer for room ${roomId}:`, error.message)
      }
    })

    // Shutdown VirtualUserService for all rooms
    if (this.virtualUserService) {
      this.virtualUserService.shutdown()
    }

    // Clear all data structures
    this.rooms.clear()
    this.userRoomMap.clear()
    this.colorServices.clear()
    this.drawingServices.clear()
    this.hoverOrchestrators.clear()
    this.metricsAnalyzers.clear()
  }

  /**
   * Record gesture in metrics analyzer
   * @param {string} roomId - Room ID
   * @param {Object} gesture - Gesture data
   */
  recordGesture(roomId, gesture) {
    const analyzer = this.metricsAnalyzers.get(roomId)
    if (analyzer) {
      analyzer.recordGesture(gesture)
    }
  }

  /**
   * Get compositional parameters for a room
   * @param {string} roomId - Room ID
   * @returns {Object} Compositional parameters
   */
  getCompositionalParameters(roomId) {
    const analyzer = this.metricsAnalyzers.get(roomId)
    if (analyzer) {
      return analyzer.getCompositionalParameters()
    }
    return null
  }

  /**
   * Start periodic broadcast of compositional parameters
   * Broadcasts every 5 seconds to all connected clients
   */
  startMetricsBroadcast() {
    if (this.metricsBroadcastInterval) {
      clearInterval(this.metricsBroadcastInterval)
    }

    // Broadcast metrics every 5 seconds
    this.metricsBroadcastInterval = setInterval(() => {
      this.rooms.forEach((room, roomId) => {
        const parameters = this.getCompositionalParameters(roomId)
        if (parameters && room.users.size > 0) {
          // This will be picked up by socket handlers to broadcast
          room.compositionalParameters = parameters
        }
      })
    }, 5000)
  }
}

module.exports = RoomManager
