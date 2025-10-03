const express = require('express')
const http = require('http')
const socketIo = require('socket.io')
const cors = require('cors')

// Import services
const RoomManager = require('./services/RoomManager')
const GestureProcessor = require('./services/GestureProcessor')
const EnvironmentalMemoryCoordinator = require('./services/EnvironmentalMemoryCoordinator')
const SoundPatternGenerator = require('./services/SoundPatternGenerator')

// Import socket handlers
const socketHandlers = require('./api/socketHandlers')

/**
 * Webarmonium Backend Server
 * Real-time collaborative generative music ecosystem
 * Constitutional requirements: <100ms WebSocket latency, secure CORS, graceful scaling
 */
class WebarmoniumServer {
  constructor(options = {}) {
    this.port = options.port || process.env.PORT || 3001
    this.environment = options.environment || process.env.NODE_ENV || 'development'

    // Initialize Express app
    this.app = express()
    this.server = http.createServer(this.app)

    // Initialize services
    this.roomManager = new RoomManager()
    this.gestureProcessor = new GestureProcessor()
    this.memoryCoordinator = new EnvironmentalMemoryCoordinator()
    this.patternGenerator = new SoundPatternGenerator()

    // Initialize Socket.io with performance configuration
    this.io = socketIo(this.server, {
      cors: {
        origin: this.getAllowedOrigins(),
        methods: ['GET', 'POST'],
        credentials: false
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 5000,
      pingInterval: 10000,
      maxHttpBufferSize: 1e6, // 1MB max message size
      allowEIO3: true
    })

    this.setupMiddleware()
    this.setupRoutes()
    this.setupSocketHandlers()
    this.setupErrorHandling()
    this.setupGracefulShutdown()

    // Performance monitoring
    this.metrics = {
      startTime: Date.now(),
      connections: 0,
      totalMessages: 0,
      errors: 0
    }
  }

  /**
   * Get allowed CORS origins based on environment
   * @returns {string|string[]} Allowed origins
   */
  getAllowedOrigins() {
    if (this.environment === 'production') {
      return [
        'https://webarmonium.app',
        'https://www.webarmonium.app'
      ]
    } else {
      return ['http://localhost:3000', 'http://127.0.0.1:3000']
    }
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // CORS configuration
    this.app.use(cors({
      origin: this.getAllowedOrigins(),
      credentials: false,
      methods: ['GET', 'POST', 'OPTIONS']
    }))

    // JSON parsing with size limits
    this.app.use(express.json({ limit: '1mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }))

    // Security headers
    this.app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('X-Frame-Options', 'DENY')
      res.setHeader('X-XSS-Protection', '1; mode=block')
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
      res.removeHeader('X-Powered-By')
      next()
    })

    // Request logging for development
    if (this.environment === 'development') {
      this.app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} ${req.method} ${req.url}`)
        next()
      })
    }
  }

  /**
   * Setup REST API routes
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const uptime = Date.now() - this.metrics.startTime
      const memoryUsage = process.memoryUsage()

      res.json({
        status: 'healthy',
        uptime: uptime,
        environment: this.environment,
        version: '1.0.0',
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024)
        },
        metrics: {
          ...this.metrics,
          roomStats: this.roomManager.getRoomStatistics()
        }
      })
    })

    // Room discovery endpoint
    this.app.get('/api/rooms', (req, res) => {
      try {
        const limit = Math.min(50, parseInt(req.query.limit) || 10)
        const lobby = this.roomManager.getRoomLobby(limit)

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
    this.app.post('/api/rooms', (req, res) => {
      try {
        const roomId = req.body.roomId || this.generateRoomId()

        // Validate room ID format
        if (!/^[a-z0-9-]{3,50}$/.test(roomId)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid room ID format'
          })
        }

        // Check if room already exists
        if (this.roomManager.getRoom(roomId)) {
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
    this.app.get('/api/metrics', (req, res) => {
      try {
        res.json({
          server: this.metrics,
          rooms: this.roomManager.getRoomStatistics(),
          gestures: this.gestureProcessor.getProcessingStats(),
          patterns: this.patternGenerator.getGenerationStats(),
          memory: this.memoryCoordinator.getCoordinatorStats()
        })
      } catch (error) {
        console.error('Metrics error:', error)
        res.status(500).json({
          success: false,
          error: 'Metrics unavailable'
        })
      }
    })

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      })
    })
  }

  /**
   * Setup Socket.io event handlers
   */
  setupSocketHandlers() {
    // Connection handling
    this.io.on('connection', (socket) => {
      this.metrics.connections++

      console.log(`Client connected: ${socket.id} (${this.io.engine.clientsCount} total)`)

      // Initialize socket handlers with service dependencies
      socketHandlers.initializeSocket(socket, {
        roomManager: this.roomManager,
        gestureProcessor: this.gestureProcessor,
        memoryCoordinator: this.memoryCoordinator,
        patternGenerator: this.patternGenerator,
        io: this.io
      })

      // Track socket events for metrics
      const originalEmit = socket.emit.bind(socket)
      socket.emit = (...args) => {
        this.metrics.totalMessages++
        return originalEmit(...args)
      }

      // Disconnection handling
      socket.on('disconnect', (reason) => {
        this.metrics.connections--
        console.log(`Client disconnected: ${socket.id} (reason: ${reason})`)

        // Clean up user from any rooms
        try {
          socketHandlers.handleDisconnection(socket, this.roomManager)
        } catch (error) {
          console.error('Disconnection cleanup error:', error)
          this.metrics.errors++
        }
      })

      // Error handling
      socket.on('error', (error) => {
        console.error(`Socket error for ${socket.id}:`, error)
        this.metrics.errors++
      })
    })

    // Socket.io error handling
    this.io.on('error', (error) => {
      console.error('Socket.io server error:', error)
      this.metrics.errors++
    })
  }

  /**
   * Setup global error handling
   */
  setupErrorHandling() {
    // Express error handler
    this.app.use((error, req, res, next) => {
      console.error('Express error:', error)
      this.metrics.errors++

      res.status(500).json({
        success: false,
        error: this.environment === 'development' ? error.message : 'Internal server error'
      })
    })

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Promise Rejection:', reason)
      this.metrics.errors++
    })

    // Uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error)
      this.metrics.errors++

      // Graceful shutdown on critical errors
      this.shutdown('Uncaught exception')
    })
  }

  /**
   * Setup graceful shutdown handling
   */
  setupGracefulShutdown() {
    const gracefulShutdown = (signal) => {
      console.log(`Received ${signal}. Starting graceful shutdown...`)
      this.shutdown(signal)
    }

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  }

  /**
   * Generate unique room ID
   * @returns {string} Room ID
   */
  generateRoomId() {
    const adjectives = ['sonic', 'harmonic', 'melodic', 'rhythmic', 'ambient', 'textural']
    const nouns = ['space', 'realm', 'chamber', 'studio', 'lab', 'zone']

    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)]
    const noun = nouns[Math.floor(Math.random() * nouns.length)]
    const number = Math.floor(Math.random() * 1000)

    return `${adjective}-${noun}-${number}`
  }

  /**
   * Start the server
   * @returns {Promise} Server start promise
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        // Validate service states before starting
        this.roomManager.validateState()
        this.gestureProcessor.validateProcessorState()
        this.memoryCoordinator.validateCoordinatorState()
        this.patternGenerator.validateGeneratorState()

        this.server.listen(this.port, () => {
          console.log(`
🎵 Webarmonium Server Started
   Environment: ${this.environment}
   Port: ${this.port}
   WebSocket: ws://localhost:${this.port}
   Health: http://localhost:${this.port}/health

   Constitutional Requirements:
   ✓ <100ms WebSocket latency target
   ✓ <200ms gesture processing
   ✓ CORS security configured
   ✓ Anonymous user sessions
   ✓ 24-hour memory retention
          `)

          resolve(this)
        })

        this.server.on('error', reject)
      } catch (error) {
        console.error('Server startup validation failed:', error)
        reject(error)
      }
    })
  }

  /**
   * Shutdown the server gracefully
   * @param {string} reason - Shutdown reason
   */
  async shutdown(reason = 'Manual shutdown') {
    console.log(`Shutting down server: ${reason}`)

    try {
      // Stop accepting new connections
      this.io.close()

      // Shutdown services gracefully
      this.roomManager.shutdown()
      this.memoryCoordinator.shutdown()

      // Close HTTP server
      await new Promise((resolve) => {
        this.server.close(resolve)
      })

      console.log('Server shutdown complete')
      process.exit(0)
    } catch (error) {
      console.error('Error during shutdown:', error)
      process.exit(1)
    }
  }

  /**
   * Get server instance (for testing)
   * @returns {http.Server} HTTP server instance
   */
  getServer() {
    return this.server
  }

  /**
   * Get Socket.io instance (for testing)
   * @returns {socketIo.Server} Socket.io server instance
   */
  getSocketServer() {
    return this.io
  }
}

// Export server class
module.exports = WebarmoniumServer

// Start server if run directly
if (require.main === module) {
  const server = new WebarmoniumServer()

  server.start().catch((error) => {
    console.error('Failed to start server:', error)
    process.exit(1)
  })
}