/**
 * Webarmonium Server
 * Real-time collaborative music platform with WebSocket support
 */

// Load environment variables FIRST (before any other imports that need them)
require('dotenv').config()

// Sentry Error Tracking - Must be imported after dotenv
const Sentry = require('@sentry/node')

const express = require('express')
const http = require('http')
const socketIo = require('socket.io')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

// Import service container for dependency injection
const { createServiceContainer, wireServices } = require('./services/ServiceContainer')
const socketHandlers = require('./api/socketHandlers')
const RateLimiter = require('./utils/RateLimiter')
const { createLogger } = require('./utils/Logger')
const {
  domainProtectionMiddleware,
  socketDomainProtection,
  securityHeadersMiddleware,
  getBlockedDomains,
  getAllowedDomains
} = require('./utils/DomainProtection')


// Configuration
const PORT = process.env.PORT || 3001
const NODE_ENV = process.env.NODE_ENV || 'development'

// CORS configuration from environment
// In production, CORS_ORIGIN should be set to allowed domains (comma-separated)
// Example: CORS_ORIGIN=https://webarmonium.com,https://www.webarmonium.com
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : '*'

// Rate limiting with health check bypass
// Entry #Security: Skip rate limiting for health checks to allow monitoring
// Entry #Security: Add rate limit headers to responses
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  skip: (req) => req.path === '/health', // Bypass for health checks
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers (deprecated)
  message: {
    success: false,
    error: 'RATE_LIMITED',
    message: 'Too many requests, please try again later.'
  }
})

const app = express()
const server = http.createServer(app)

// Initialize Sentry - Replace YOUR_SENTRY_DSN with actual DSN from sentry.io
const sentryDsn = process.env.SENTRY_DSN || 'YOUR_SENTRY_DSN'
console.log('[Sentry] Initializing with DSN:', sentryDsn ? `${sentryDsn.substring(0, 30)}...` : 'NOT SET')
console.log('[Sentry] Environment:', NODE_ENV)

Sentry.init({
  dsn: sentryDsn,
  environment: NODE_ENV,
  debug: true, // Enable debug logging to see what Sentry is doing
  tracesSampleRate: NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app })
  ],
  beforeSend(event, hint) {
    console.log('[Sentry] Sending event:', event.event_id, 'Error:', hint?.originalException?.message)
    return event
  }
})

// Sentry request handler must be first middleware
app.use(Sentry.Handlers.requestHandler())
app.use(Sentry.Handlers.tracingHandler())

// Trust proxy for rate limiter (behind nginx/cloudflare)
// Fixes ERR_ERL_UNEXPECTED_X_FORWARDED_FOR error
app.set('trust proxy', 1)

// Socket.IO configuration with CORS from environment
// Entry #Security: Added maxHttpBufferSize to prevent memory exhaustion attacks
const MAX_PAYLOAD_SIZE = parseInt(process.env.MAX_PAYLOAD_SIZE) || 1e6 // 1MB default
const io = socketIo(server, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"]
  },
  // Limit payload size BEFORE parsing to prevent memory exhaustion
  maxHttpBufferSize: MAX_PAYLOAD_SIZE,
  // Limit number of event listeners per socket
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: false
  }
})

// Connection rate limiting per IP (prevents connection flood attacks)
// Entry #Security: Using centralized RateLimiter to prevent race conditions
const serverLogger = createLogger('server')
const adminLogger = createLogger('admin')

// Entry #Security: Environment variable validation on startup
function validateEnvironment () {
  const warnings = []
  const errors = []

  // Production-required variables
  if (NODE_ENV === 'production') {
    if (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === '*') {
      warnings.push('CORS_ORIGIN is not set or is wildcard (*) in production')
    }
    if (!process.env.ADMIN_API_KEY) {
      warnings.push('ADMIN_API_KEY is not set - admin endpoints will be disabled')
    }
    if (!process.env.ALLOWED_DOMAINS) {
      warnings.push('ALLOWED_DOMAINS is not set - using defaults for domain protection')
    }
  }

  // Log domain protection configuration
  serverLogger.info('Domain protection configured', {
    blockedDomains: getBlockedDomains(),
    allowedDomains: getAllowedDomains(),
    strictMode: process.env.DOMAIN_STRICT_MODE === 'true' || NODE_ENV === 'production'
  })

  // Log warnings
  warnings.forEach(w => serverLogger.warn(`Environment: ${w}`))
  errors.forEach(e => serverLogger.error(`Environment: ${e}`))

  if (errors.length > 0 && NODE_ENV === 'production') {
    throw new Error(`Critical environment configuration errors: ${errors.join(', ')}`)
  }

  return { warnings, errors }
}

// Validate environment on startup (non-blocking in development)
try {
  validateEnvironment()
} catch (error) {
  serverLogger.error('Environment validation failed', { error: error.message })
  if (NODE_ENV === 'production') {
    process.exit(1)
  }
}

// Start RateLimiter cleanup (cleanup stale entries periodically)
RateLimiter.startCleanup(60000) // Every minute

// Entry #115: Domain protection for WebSocket connections
// Block connections from unauthorized/mirroring domains
io.use(socketDomainProtection)

io.use((socket, next) => {
  const ip = RateLimiter.getIP(socket)

  // Use centralized rate limiter with custom config for connections
  const limitResult = RateLimiter.checkLimitByIP('connection', ip, {
    windowMs: parseInt(process.env.CONNECTION_WINDOW_MS) || 60000,
    maxRequests: parseInt(process.env.MAX_CONNECTIONS_PER_IP) || 10
  })

  if (!limitResult.allowed) {
    serverLogger.warn(`Connection rate limit exceeded for IP ${ip}`, {
      remaining: limitResult.remaining,
      retryAfter: limitResult.retryAfter
    })
    return next(new Error('Too many connections from this IP'))
  }

  next()
})

// Entry #115: Domain protection middleware - MUST be first
// Blocks requests from unauthorized/mirroring domains
app.use(domainProtectionMiddleware)

// Middleware
app.use(limiter)
app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
  credentials: true
}))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Entry #115: Enhanced security headers with anti-embedding protection
// Includes frame-ancestors CSP, COOP, COEP, CORP headers
app.use(securityHeadersMiddleware)

// Serve static files from frontend directory
app.use(express.static('../frontend'))

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString()
  // console.log(`[${timestamp}] ${req.method} ${req.path}`)
  next()
})

// Initialize services using dependency injection container
const container = createServiceContainer({ io })
container.initializeAll()
wireServices(container, { io })

// Extract services for backward compatibility
const roomManager = container.get('roomManager')
const gestureProcessor = container.get('gestureProcessor')
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

// Temporary Sentry test endpoint - REMOVE AFTER TESTING
app.get('/api/test-sentry', (req, res) => {
  serverLogger.info('Sentry test endpoint called - throwing test error')
  throw new Error('Backend Sentry test error - if you see this in Sentry, it works!')
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
    // console.error('Room discovery error:', error)
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
    // console.error('Room creation error:', error)
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
      memory: environmentalMemoryCoordinator.getCoordinatorStats()
    })
  } catch (error) {
    // console.error('Metrics error:', error)
    res.status(500).json({
      success: false,
      error: 'Metrics unavailable'
    })
  }
})

// Global room statistics endpoint (for landing page)
app.get('/api/rooms/stats', (req, res) => {
  try {
    // Count users in normal rooms only (exclude landing-room)
    let totalUsers = 0
    let activeRooms = 0

    if (roomManager.rooms) {
      for (const [roomId, room] of roomManager.rooms) {
        // Exclude landing room from counts
        if (roomId === 'landing-room') continue

        const userCount = room.users?.size || 0
        if (userCount > 0) {
          totalUsers += userCount
          activeRooms++
        }
      }
    }

    res.json({
      success: true,
      totalUsers,
      activeRooms,
      timestamp: Date.now()
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Stats unavailable'
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

// Admin authentication middleware for protected endpoints
// Entry #Security: Logs failed attempts and successful admin actions
const adminAuth = (req, res, next) => {
  const apiKey = req.headers['x-admin-key']
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.socket?.remoteAddress ||
                   'unknown'

  // In production, ADMIN_API_KEY must be set
  if (!process.env.ADMIN_API_KEY) {
    if (NODE_ENV === 'production') {
      adminLogger.warn('Admin endpoint access attempted without ADMIN_API_KEY configured', {
        ip: clientIP,
        path: req.path,
        method: req.method
      })
      return res.status(403).json({
        success: false,
        error: 'admin_disabled',
        message: 'Admin endpoint disabled in production (ADMIN_API_KEY not configured)'
      })
    }
    // Allow in development without key
    adminLogger.debug('Admin access allowed in development mode without API key', {
      ip: clientIP,
      path: req.path
    })
    return next()
  }

  // Validate API key
  if (apiKey !== process.env.ADMIN_API_KEY) {
    adminLogger.warn('Admin authentication failed - invalid API key', {
      ip: clientIP,
      path: req.path,
      method: req.method,
      hasKey: !!apiKey
    })
    return res.status(401).json({
      success: false,
      error: 'unauthorized',
      message: 'Invalid or missing admin API key'
    })
  }

  // Log successful authentication
  adminLogger.info('Admin authentication successful', {
    ip: clientIP,
    path: req.path,
    method: req.method
  })

  next()
}

// Room cleanup endpoint (protected)
// Entry #Security: Audit logging for admin actions
app.delete('/api/rooms/:id', adminAuth, (req, res) => {
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.socket?.remoteAddress ||
                   'unknown'

  try {
    const { id } = req.params

    if (!roomManager.rooms.has(id)) {
      adminLogger.info('Room deletion attempted - room not found', {
        ip: clientIP,
        roomId: id
      })
      return res.status(404).json({
        success: false,
        error: 'room_not_found',
        message: `Room ${id} not found`
      })
    }

    // Get room info for audit log
    const room = roomManager.rooms.get(id)
    const userCount = room?.users?.size || 0

    // Clean up room resources
    roomManager.rooms.delete(id)

    adminLogger.info('Room deleted successfully', {
      ip: clientIP,
      roomId: id,
      userCount,
      timestamp: Date.now()
    })

    res.json({
      success: true,
      message: `Room ${id} deleted successfully`
    })
  } catch (error) {
    adminLogger.error('Room deletion failed', {
      ip: clientIP,
      roomId: req.params.id,
      error: error.message
    })
    res.status(500).json({
      success: false,
      error: 'room_deletion_failed',
      message: error.message
    })
  }
})

// Entry #115: Domain protection status endpoint (admin)
app.get('/api/admin/domain-protection', adminAuth, (req, res) => {
  res.json({
    success: true,
    blockedDomains: getBlockedDomains(),
    allowedDomains: getAllowedDomains(),
    strictMode: process.env.DOMAIN_STRICT_MODE === 'true' || NODE_ENV === 'production',
    timestamp: Date.now()
  })
})

// Entry #115: Domain validation endpoint (public)
// Frontend can use this to check if current domain is authorized
app.get('/api/domain/validate', (req, res) => {
  const origin = req.headers.origin
  const referer = req.headers.referer
  const { validateOrigin } = require('./utils/DomainProtection')

  const validation = validateOrigin(origin, referer)

  res.json({
    success: true,
    valid: validation.allowed,
    domain: validation.domain || null,
    reason: validation.reason || 'valid',
    timestamp: Date.now()
  })
})

// Socket.IO connection handling
io.on('connection', (socket) => {
  // console.log(`🔌 Socket connected: ${socket.id}`)

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

// Sentry error handler - MUST be before generic error handler
app.use(Sentry.Handlers.errorHandler())

// Error handling middleware
app.use((error, req, res, next) => {
  // console.error('Server error:', error)
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
// Entry #Security: Stop RateLimiter cleanup on shutdown
function gracefulShutdown (signal) {
  serverLogger.info(`${signal} signal received: closing HTTP server`)

  // Stop rate limiter cleanup
  RateLimiter.stopCleanup()

  server.close(() => {
    serverLogger.info('HTTP server closed')
    // Clean up all rooms
    roomManager.rooms.clear()
    process.exit(0)
  })

  // Force exit after timeout
  setTimeout(() => {
    serverLogger.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

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
    // console.log(`🚀 Webarmonium server running on port ${PORT}`)
    // console.log(`📊 Health check: http://localhost:${PORT}/health`)
    // console.log(`🔌 WebSocket server ready for real-time collaboration`)
  })
}

module.exports = app