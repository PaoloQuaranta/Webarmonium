/**
 * Webarmonium Server
 * Real-time collaborative music platform with WebSocket support
 */

const express = require('express')
const http = require('http')
const socketIo = require('socket.io')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

// Import service container for dependency injection
const { createServiceContainer, wireServices } = require('./services/ServiceContainer')
const socketHandlers = require('./api/socketHandlers')


// Configuration
const PORT = process.env.PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
})

const app = express()
const server = http.createServer(app)

// Socket.IO configuration
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
})

// Middleware
app.use(limiter)
app.use(cors({
  origin: '*', // Allow all origins for development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Serve static files from frontend directory
app.use(express.static('../frontend'))

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${req.method} ${req.path}`)
  next()
})

// Initialize services using dependency injection container
const container = createServiceContainer({ io })
container.initializeAll()
wireServices(container, { io })

// Extract services for backward compatibility
const roomManager = container.get('roomManager')
const gestureProcessor = container.get('gestureProcessor')
const soundPatternGenerator = container.get('soundPatternGenerator')
const environmentalMemoryCoordinator = container.get('environmentalMemoryCoordinator')
const backgroundCompositionService = container.get('backgroundCompositionService')
const gestureToMusicService = container.get('gestureToMusicService')

// Global services object for socket handlers (backward compatible)
const services = container.toObject()

// Health check endpoint
app.get('/health', (req, res) => {
  const rooms = Array.from(roomManager.rooms.values())
  const totalUsers = rooms.reduce((sum, room) => sum + room.users.size, 0)

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: 'V.0.0.3-alpha',
    rooms: rooms.length,
    users: totalUsers,
    environment: NODE_ENV
  })
})

// Room discovery endpoint
app.get('/api/rooms', (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit) || 10)
    const lobby = roomManager.getRoomLobby(limit)

    res.json({
      success: true,
      rooms: lobby,
      timestamp: Date.now()
    })
  } catch (error) {
    console.error('Room discovery error:', error)
    res.status(500).json({
      success: false,
      error: 'Room discovery failed'
    })
  }
})

// Room creation endpoint
app.post('/api/rooms', (req, res) => {
  try {
    const roomId = req.body.roomId || generateRoomId()

    // Validate room ID format
    if (!/^[a-z0-9-]{3,50}$/.test(roomId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid room ID format'
      })
    }

    // Check if room already exists
    if (roomManager.getRoom(roomId)) {
      return res.status(409).json({
        success: false,
        error: 'Room already exists'
      })
    }

    res.json({
      success: true,
      roomId,
      message: 'Room ID reserved. Join via WebSocket to activate.'
    })
  } catch (error) {
    console.error('Room creation error:', error)
    res.status(500).json({
      success: false,
      error: 'Room creation failed'
    })
  }
})

// Performance metrics endpoint
app.get('/api/metrics', (req, res) => {
  try {
    res.json({
      server: {
        startTime: Date.now(),
        connections: io.engine.clientsCount,
        environment: NODE_ENV
      },
      rooms: roomManager.getRoomStatistics(),
      gestures: gestureProcessor.getProcessingStats(),
      patterns: soundPatternGenerator.getGenerationStats(),
      memory: environmentalMemoryCoordinator.getCoordinatorStats()
    })
  } catch (error) {
    console.error('Metrics error:', error)
    res.status(500).json({
      success: false,
      error: 'Metrics unavailable'
    })
  }
})

// Room statistics endpoint
app.get('/api/rooms/:id/stats', (req, res) => {
  try {
    const room = roomManager.rooms.get(req.params.id)
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'room_not_found',
        message: `Room ${req.params.id} not found`
      })
    }

    const stats = room.getStats()
    res.json({
      success: true,
      room: req.params.id,
      stats: stats
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'stats_error',
      message: error.message
    })
  }
})

// Room cleanup endpoint
app.delete('/api/rooms/:id', (req, res) => {
  try {
    const { id } = req.params

    if (!roomManager.rooms.has(id)) {
      return res.status(404).json({
        success: false,
        error: 'room_not_found',
        message: `Room ${id} not found`
      })
    }

    // Clean up room resources
    roomManager.rooms.delete(id)

    res.json({
      success: true,
      message: `Room ${id} deleted successfully`
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'room_deletion_failed',
      message: error.message
    })
  }
})

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`)

  // Properly initialize socket handlers using the object structure
  socketHandlers.initializeSocket(socket, services)
})

// Periodic broadcast of compositional parameters to all rooms
setInterval(() => {
  roomManager.rooms.forEach((room, roomId) => {
    if (room.users.size > 0) {
      const parameters = roomManager.getCompositionalParameters(roomId)
      if (parameters) {
        io.to(roomId).emit('compositional-parameters', {
          parameters,
          timestamp: Date.now()
        })
      }
    }
  })
}, 5000) // Broadcast every 5 seconds

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error)
  res.status(500).json({
    success: false,
    error: 'internal_server_error',
    message: NODE_ENV === 'development' ? error.message : 'Something went wrong'
  })
})

// 404 handler - MUST be last
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'not_found',
    message: 'Endpoint not found',
    path: req.originalUrl
  })
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
    // Clean up all rooms
    roomManager.rooms.clear()
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server')
  server.close(() => {
    console.log('HTTP server closed')
    // Clean up all rooms
    roomManager.rooms.clear()
    process.exit(0)
  })
})

// Helper function to generate room IDs
function generateRoomId () {
  const adjectives = ['sonic', 'harmonic', 'melodic', 'rhythmic', 'ambient', 'textural']
  const nouns = ['space', 'realm', 'chamber', 'studio', 'lab', 'zone']

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const number = Math.floor(Math.random() * 1000)

  return `${adjective}-${noun}-${number}`
}

// Expose room manager for tests
app.locals.roomManager = roomManager

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`🚀 Webarmonium server running on port ${PORT}`)
    console.log(`📊 Health check: http://localhost:${PORT}/health`)
    console.log(`🔌 WebSocket server ready for real-time collaboration`)
  })
}

module.exports = app