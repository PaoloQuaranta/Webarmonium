/**
 * CursorHandler - Multi-user cursor tracking handlers
 * Handles: cursor-move, cursor-position
 */

const CursorHandler = {
  /**
   * Register cursor-move event handler
   * @param {Socket} socket - Socket instance
   */
  registerCursorMoveHandler (socket) {
    socket.on('cursor-move', async (data) => {
      try {
        console.log(`👆 cursor-move received from ${socket.userId?.substring(0, 8)}`, data)

        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          console.log('❌ cursor-move: No userId or roomId')
          return
        }

        // Validate data
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number' || typeof data.isDrawing !== 'boolean') {
          console.log('❌ cursor-move: Invalid data', data)
          return
        }

        // Get room and user
        const room = socket.services.roomManager.getUserRoom(socket.userId)
        if (!room) {
          console.log('❌ cursor-move: No room found')
          return
        }

        const user = room.getUser(socket.userId)
        if (!user || !user.assignedColor) {
          console.log('❌ cursor-move: No user or color')
          return
        }

        // Import CursorPosition model
        const CursorPosition = require('../../models/CursorPosition')

        // Create or update cursor position
        const cursorPosition = CursorPosition.fromEventData(
          socket.userId,
          socket.roomId,
          data
        )

        // Update cursor in room
        socket.services.roomManager.updateCursorPosition(socket.userId, cursorPosition)

        // Broadcast cursor position to other users in room
        const payload = cursorPosition.toEventPayload(user.assignedColor)
        console.log(`✅ Broadcasting cursor-position to room ${socket.roomId}:`, payload)
        socket.to(socket.roomId).emit('cursor-position', payload)

        // Generate hover-update event for remote audio modulation (three-tier architecture)
        const hoverData = {
          position: { x: data.x, y: data.y },
          velocity: data.velocity || 50,
          intensity: data.intensity || 0.5,
          userId: socket.userId,
          isRemote: true
        }
        console.log(`✅ Broadcasting hover-update to room ${socket.roomId}:`, hoverData)
        socket.broadcast.to(socket.roomId).emit('hover-update', hoverData)
      } catch (error) {
        console.error('cursor-move error:', error)
      }
    })
  },

  /**
   * Register cursor-position event handler
   * @param {Socket} socket - Socket instance
   */
  registerCursorPositionHandler (socket) {
    socket.on('cursor-position', async (data) => {
      const startTime = Date.now()
      try {
        // Validate input data
        if (!data || !socket.roomId || !socket.userId) {
          console.warn('⚠️ cursor-position validation failed - missing required fields')
          return
        }

        // Get room
        const room = socket.services.roomManager.getRoom(socket.roomId)
        if (!room) {
          console.warn('⚠️ cursor-position failed - room not found:', socket.roomId)
          return
        }

        // Validate cursor data
        const cursorData = {
          userId: data.userId || socket.userId,
          color: data.color || '#66c2a5',
          x: data.x || 0.5,
          y: data.y || 0.5,
          isDrawing: data.isDrawing || false,
          timestamp: data.timestamp || Date.now()
        }

        console.log(`👆 Received cursor-position from ${cursorData.userId}:`, cursorData)

        // Broadcast to ALL other users in room (excluding sender)
        socket.broadcast.to(socket.roomId).emit('cursor-position', cursorData)

        console.log(`✅ Broadcasted cursor-position to room ${socket.roomId}:`, {
          userId: cursorData.userId,
          x: cursorData.x,
          y: cursorData.y,
          isDrawing: cursorData.isDrawing
        })

        // Update room activity
        room.lastActivity = Date.now()
      } catch (error) {
        console.error('❌ cursor-position error:', error)
      }
    })
  }
}

module.exports = CursorHandler
