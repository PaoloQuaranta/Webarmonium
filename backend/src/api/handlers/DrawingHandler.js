/**
 * DrawingHandler - Collaborative drawing handlers
 * Handles: draw-start, draw-point, draw-end
 */

const DrawingHandler = {
  /**
   * Register draw-start event handler
   * @param {Socket} socket - Socket instance
   */
  registerDrawStartHandler (socket) {
    socket.on('draw-start', async (data) => {
      try {
        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          console.warn('draw-start: No active session')
          return
        }

        // Validate data
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number' || !data.strokeWidth) {
          console.warn('draw-start: Invalid data')
          return
        }

        // Get room and user
        const room = socket.services.roomManager.getUserRoom(socket.userId)
        if (!room) {
          console.warn('draw-start: Room not found')
          return
        }

        const user = room.getUser(socket.userId)
        if (!user || !user.assignedColor) {
          console.warn('draw-start: User or color not found')
          return
        }

        // Get drawing service
        const drawingService = socket.services.roomManager.getDrawingService(socket.roomId)
        if (!drawingService) {
          console.warn('draw-start: Drawing service not found')
          return
        }

        // Create stroke
        const stroke = drawingService.createStroke(
          socket.userId,
          socket.roomId,
          user.assignedColor,
          data
        )

        console.log(`User ${socket.userId} started stroke ${stroke.id}`)
      } catch (error) {
        console.error('draw-start error:', error)
      }
    })
  },

  /**
   * Register draw-point event handler
   * @param {Socket} socket - Socket instance
   */
  registerDrawPointHandler (socket) {
    socket.on('draw-point', async (data) => {
      try {
        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          return
        }

        // Validate data
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') {
          return
        }

        // Get drawing service
        const drawingService = socket.services.roomManager.getDrawingService(socket.roomId)
        if (!drawingService) {
          return
        }

        // Add point to active stroke
        drawingService.addPoint(socket.userId, data)
      } catch (error) {
        console.error('draw-point error:', error)
      }
    })
  },

  /**
   * Register draw-end event handler
   * @param {Socket} socket - Socket instance
   */
  registerDrawEndHandler (socket) {
    socket.on('draw-end', async (data) => {
      const startTime = Date.now()

      try {
        // Validate user is in a room
        if (!socket.userId || !socket.roomId) {
          console.warn('draw-end: No active session')
          return
        }

        // Validate data
        if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') {
          console.warn('draw-end: Invalid data')
          return
        }

        // Get drawing service
        const drawingService = socket.services.roomManager.getDrawingService(socket.roomId)
        if (!drawingService) {
          console.warn('draw-end: Drawing service not found')
          return
        }

        // Complete stroke
        const stroke = drawingService.completeStroke(socket.userId, data)

        // Add stroke to room history
        socket.services.roomManager.addStrokeToHistory(socket.roomId, stroke)

        // Broadcast completed stroke to other users in room
        const strokePayload = drawingService.broadcastStroke(stroke)
        socket.to(socket.roomId).emit('draw-stroke', strokePayload)

        const latency = Date.now() - startTime

        console.log(`User ${socket.userId} completed stroke ${stroke.id} (${latency}ms, ${stroke.points.length} points)`)

        // Log constitutional compliance (FR-006: <1000ms stroke broadcast)
        if (latency > 1000) {
          console.warn(`draw-end latency ${latency}ms exceeds 1000ms requirement (FR-006)`)
        }
      } catch (error) {
        console.error('draw-end error:', error)
      }
    })
  }
}

module.exports = DrawingHandler
