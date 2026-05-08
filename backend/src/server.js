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
const CompositionMonitor = require('./services/CompositionMonitor')
const { createMonitorRoutes } = require('./api/monitorRoutes')


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

// Initialize Sentry for error tracking
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: NODE_ENV,
  tracesSampleRate: NODE_ENV === 'production' ? 0.1 : 1.0,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app })
  ]
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
  maxHttpBufferSize: MAX_PAYLOAD_SIZE
  // connectionStateRecovery REMOVED (v0.7.9 OOM fix)
  // Was buffering ALL emitted events for 2 minutes in native memory (~5 MB/room at 8x drum).
  // Musical events (hold:start/hold:end) have no value after reconnection.
  // Frontend already handles reconnection by requesting room:state.
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

// Health check endpoint for monitoring (UptimeRobot, etc.)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime()
  })
})

// Entry #PERF-FIX: Performance metrics endpoint for optimization validation
app.get('/metrics/performance', (req, res) => {
  const totalBroadcastOps = broadcastMetrics.broadcastsSent + broadcastMetrics.broadcastsSkipped
  const skipRate = totalBroadcastOps > 0
    ? (broadcastMetrics.broadcastsSkipped / totalBroadcastOps * 100).toFixed(1) + '%'
    : 'N/A'

  res.status(200).json({
    timestamp: Date.now(),
    broadcast: {
      totalChecks: broadcastMetrics.totalChecks,
      sent: broadcastMetrics.broadcastsSent,
      skipped: broadcastMetrics.broadcastsSkipped,
      skipRate,
      sinceReset: Date.now() - broadcastMetrics.lastResetTime
    },
    percentileCache: backgroundService?.getPerformanceMetrics?.()?.percentileCache || null,
    rooms: {
      active: roomManager.rooms.size,
      broadcastStateTracked: lastBroadcastState.size
    }
  })
})

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString()
  // console.log(`[${timestamp}] ${req.method} ${req.path}`)
  next()
})

// Initialize CompositionMonitor (before container for injection)
const compositionMonitor = new CompositionMonitor()

// Initialize services using dependency injection container
const container = createServiceContainer({ io })
container.initializeAll()
wireServices(container, { io })

// Inject CompositionMonitor into BackgroundCompositionService
const backgroundService = container.get('backgroundCompositionService')
if (backgroundService) {
  backgroundService.compositionMonitor = compositionMonitor
}

// Extract services for backward compatibility
const roomManager = container.get('roomManager')

// Global services object for socket handlers (backward compatible)
const services = container.toObject()

// v0.7.9: Memory watchdog - periodic heap/RSS logging + event loop lag + emergency cleanup
const HEAP_WARN_MB = 200 // ~78% of 256MB limit
let _lastWatchdogTime = Date.now()
setInterval(() => {
  const now = Date.now()
  const lagMs = now - _lastWatchdogTime - 60000 // how late this interval fired
  _lastWatchdogTime = now
  const mem = process.memoryUsage()
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024)
  const rssMB = Math.round(mem.rss / 1024 / 1024)
  const seqCount = container.get('sequencerGestureService')?.activeSequencers?.size || 0
  const audCount = container.get('auditionGestureService')?.activeAuditions?.size || 0
  console.log(`[MEM] heap=${heapMB}MB rss=${rssMB}MB lag=${lagMs}ms seq=${seqCount} aud=${audCount}`)
  if (heapMB > HEAP_WARN_MB) {
    console.warn(`[MEM] WARNING: heap ${heapMB}MB exceeds ${HEAP_WARN_MB}MB - emergency cleanup`)
    try {
      backgroundService.forceGlobalCleanup()
    } catch (err) {
      console.error('[MEM] Cleanup error:', err.message)
    }
    // Emergency: stop all audition/sequencer sessions to free memory, notify clients
    try {
      const audService = container.get('auditionGestureService')
      if (audService) {
        for (const socketId of [...audService.activeAuditions.keys()]) {
          audService.stopAudition(socketId)
          const sock = io.sockets.sockets.get(socketId)
          if (sock) sock.emit('audition:stopped', { reason: 'memory-pressure' })
        }
      }
      const seqService = container.get('sequencerGestureService')
      if (seqService) {
        for (const socketId of [...seqService.activeSequencers.keys()]) {
          seqService.stopSequencer(socketId)
          const sock = io.sockets.sockets.get(socketId)
          if (sock) sock.emit('sequencer:stopped', { reason: 'memory-pressure' })
        }
      }
    } catch (err) {
      console.error('[MEM] Session cleanup error:', err.message)
    }
  }
}, 60000)

// Admin authentication middleware for protected endpoints
// Entry #Security: Logs failed attempts and successful admin actions
// Accepts API key via header (X-Admin-Key) or query param (apiKey)
const adminAuth = (req, res, next) => {
  const apiKey = req.headers['x-admin-key'] || req.query.apiKey
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

// Room lobby endpoint (public, rate-limited)
// Returns rooms with active jammers for listen mode room discovery
app.get('/api/rooms/lobby', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 20)
    const rooms = roomManager.getRoomLobby(limit)

    res.json({
      success: true,
      rooms,
      timestamp: Date.now()
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch room lobby'
    })
  }
})

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


// Composition Monitor routes (protected by adminAuth)
app.use('/api/admin/monitor', adminAuth, createMonitorRoutes(compositionMonitor))

// Composition Monitor dashboard (protected)
app.get('/monitor', (req, res) => {
  // Disable COEP/CORP for this route to allow CDN scripts
  res.removeHeader('Cross-Origin-Embedder-Policy')
  res.removeHeader('Cross-Origin-Resource-Policy')

  const apiKey = req.query.apiKey || req.headers['x-admin-key']

  // In development without ADMIN_API_KEY, allow access
  if (!process.env.ADMIN_API_KEY && NODE_ENV !== 'production') {
    return res.sendFile(require('path').join(__dirname, '../public/monitor/index.html'))
  }

  // Validate API key
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).send('Unauthorized - Invalid or missing API key')
  }

  res.sendFile(require('path').join(__dirname, '../public/monitor/index.html'))
})

// Socket.IO connection handling
io.on('connection', (socket) => {
  // console.log(`🔌 Socket connected: ${socket.id}`)

  // Properly initialize socket handlers using the object structure
  socketHandlers.initializeSocket(socket, services)

  // Recording status relay: capture client (landing or jam room) → monitor dashboard.
  // Allowed if the socket is in landing-room OR has a roomId set (i.e. joined a jam room).
  // Includes the source room so the monitor can correlate when multiple sources exist.
  socket.on('recording:status', (data) => {
    const inLanding = socket.rooms?.has('landing-room')
    const inJamRoom = !!socket.roomId
    if (!inLanding && !inJamRoom) return

    monitorNamespace.emit('monitor:recording-update', {
      ...data,
      source: inLanding ? 'landing' : 'room',
      roomId: inLanding ? 'landing-room' : socket.roomId
    })
  })
})

// Composition Monitor WebSocket namespace (protected)
const monitorNamespace = io.of('/monitor')

monitorNamespace.use((socket, next) => {
  const apiKey = socket.handshake.query.apiKey

  // In development without ADMIN_API_KEY, allow access
  if (!process.env.ADMIN_API_KEY && NODE_ENV !== 'production') {
    return next()
  }

  // Validate API key
  if (apiKey !== process.env.ADMIN_API_KEY) {
    serverLogger.warn('Monitor WebSocket auth failed', {
      ip: socket.handshake.address
    })
    return next(new Error('Unauthorized'))
  }

  next()
})

monitorNamespace.on('connection', (socket) => {
  serverLogger.info('Monitor dashboard connected', { socketId: socket.id })
  compositionMonitor.addSubscriber(socket)

  // Entry #210: Genre Override Control Events

  /**
   * Validate input for genre override requests
   * @param {Object} data - Request data
   * @param {boolean} requireGenre - Whether genre field is required
   * @returns {{ valid: boolean, error?: string, roomId?: string, genre?: string }}
   */
  function validateOverrideInput(data, requireGenre = true) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Invalid request: data must be an object' }
    }

    const { roomId, genre } = data

    if (typeof roomId !== 'string' || !roomId.trim()) {
      return { valid: false, error: 'Invalid request: roomId must be a non-empty string' }
    }

    if (requireGenre) {
      if (typeof genre !== 'string' || !genre.trim()) {
        return { valid: false, error: 'Invalid request: genre must be a non-empty string' }
      }
      return { valid: true, roomId: roomId.trim(), genre: genre.trim() }
    }

    return { valid: true, roomId: roomId.trim() }
  }

  /**
   * Set manual genre override for a room or landing page
   * @param {Object} data - { roomId: string, genre: string }
   */
  socket.on('monitor:set-genre', (data) => {
    // Input validation (Fix #1)
    const validation = validateOverrideInput(data, true)
    if (!validation.valid) {
      return socket.emit('monitor:override-status', {
        success: false,
        error: validation.error,
        context: { received: typeof data }
      })
    }

    const { roomId, genre } = validation

    try {
      if (!backgroundService) {
        return socket.emit('monitor:override-status', {
          success: false,
          error: 'Background service not available',
          context: { roomId, genre }
        })
      }

      const result = backgroundService.setManualGenreOverride(roomId, genre)
      socket.emit('monitor:override-status', {
        success: true,
        roomId,
        override: result
      })
      monitorNamespace.emit('monitor:genre-override-changed', {
        roomId,
        override: result,
        timestamp: Date.now()
      })
      serverLogger.info('[GenreOverride] Manual override set', { roomId, genre })
    } catch (serviceError) {
      socket.emit('monitor:override-status', {
        success: false,
        error: serviceError.message,
        context: { roomId, genre }
      })
      serverLogger.error('[GenreOverride] Failed to set override', {
        roomId,
        genre,
        error: serviceError.message
      })
    }
  })

  /**
   * Clear manual override and return to automatic mode
   * @param {Object} data - { roomId: string }
   */
  socket.on('monitor:clear-override', (data) => {
    // Input validation (Fix #1)
    const validation = validateOverrideInput(data, false)
    if (!validation.valid) {
      return socket.emit('monitor:override-status', {
        success: false,
        error: validation.error,
        context: { received: typeof data }
      })
    }

    const { roomId } = validation

    try {
      if (!backgroundService) {
        return socket.emit('monitor:override-status', {
          success: false,
          error: 'Background service not available',
          context: { roomId }
        })
      }

      const result = backgroundService.clearManualGenreOverride(roomId)
      socket.emit('monitor:override-status', { success: true, roomId, override: result })
      monitorNamespace.emit('monitor:genre-override-changed', {
        roomId,
        override: result,
        timestamp: Date.now()
      })
      serverLogger.info('[GenreOverride] Override cleared', { roomId })
    } catch (serviceError) {
      socket.emit('monitor:override-status', {
        success: false,
        error: serviceError.message,
        context: { roomId }
      })
      serverLogger.error('[GenreOverride] Failed to clear override', {
        roomId,
        error: serviceError.message
      })
    }
  })

  /**
   * Get current override state for all active rooms
   */
  socket.on('monitor:get-override-states', () => {
    try {
      const states = backgroundService ? backgroundService.getAllOverrideStates() : {}
      socket.emit('monitor:all-override-states', { states, timestamp: Date.now() })
    } catch (error) {
      socket.emit('monitor:all-override-states', { error: error.message })
      serverLogger.error('Failed to get override states', { error: error.message })
    }
  })

  // =========================================================================
  // Recording command relay (monitor → landing page or specific jam room)
  // =========================================================================

  // Resolve the socket.io room name to broadcast a recording command into.
  // - target === 'landing' (or unset) → 'landing-room'
  // - target === 'room' with roomId    → that roomId
  // Returns null if the spec is invalid.
  const resolveRecordingTarget = (data) => {
    const target = data?.target || 'landing'
    if (target === 'landing') return 'landing-room'
    if (target === 'room') {
      const roomId = typeof data?.roomId === 'string' ? data.roomId.trim() : ''
      if (!roomId) return null
      return roomId
    }
    return null
  }

  socket.on('monitor:start-recording', (data) => {
    const allowedFormats = ['desktop', 'mobile', 'square']
    const format = allowedFormats.includes(data?.format) ? data.format : 'desktop'
    const targetRoom = resolveRecordingTarget(data)

    if (!targetRoom) {
      socket.emit('monitor:recording-status', {
        success: false,
        action: 'start',
        error: 'invalid-target'
      })
      return
    }

    io.to(targetRoom).emit('recording:command', {
      action: 'start',
      format,
      timestamp: Date.now()
    })

    serverLogger.info('[Recording] Start command relayed', { format, targetRoom })
    socket.emit('monitor:recording-status', {
      success: true,
      action: 'start',
      format,
      target: targetRoom
    })
  })

  socket.on('monitor:stop-recording', (data) => {
    const targetRoom = resolveRecordingTarget(data)

    if (!targetRoom) {
      socket.emit('monitor:recording-status', {
        success: false,
        action: 'stop',
        error: 'invalid-target'
      })
      return
    }

    io.to(targetRoom).emit('recording:command', {
      action: 'stop',
      timestamp: Date.now()
    })

    serverLogger.info('[Recording] Stop command relayed', { targetRoom })
    socket.emit('monitor:recording-status', {
      success: true,
      action: 'stop',
      target: targetRoom
    })
  })

  socket.on('disconnect', () => {
    serverLogger.info('Monitor dashboard disconnected', { socketId: socket.id })
    compositionMonitor.removeSubscriber(socket)
  })
})

// Entry #PERF: Dirty-flag broadcast optimization
// Only emit compositional-parameters when values actually change
// Reduces network traffic by ~80% during stable periods
const lastBroadcastState = new Map() // roomId -> { parameters, style, key, mode }

// Entry #PERF-FIX: Metrics for validating optimization effectiveness
const broadcastMetrics = {
  totalChecks: 0,
  broadcastsSent: 0,
  broadcastsSkipped: 0,
  lastResetTime: Date.now()
}

/**
 * Entry #PERF-FIX: Efficient shallow comparison for compositional parameters
 * Avoids JSON.stringify overhead and guarantees consistent key ordering
 * Compares only musically-relevant fields to detect meaningful changes
 * @param {Object} current - Current payload state
 * @param {Object} previous - Previous payload state
 * @returns {boolean} True if states are different (should broadcast)
 */
function hasCompositionalParamsChanged(current, previous) {
  if (!previous) return true

  const { parameters: cp, style: cs } = current
  const { parameters: pp, style: ps } = previous

  // Compare parameters (numeric fields with tolerance for floating point)
  const numericKeys = ['tempo', 'density', 'energy', 'complexity', 'userCount']
  for (const key of numericKeys) {
    if (Math.abs((cp?.[key] ?? 0) - (pp?.[key] ?? 0)) > 0.001) return true
  }

  // Compare string fields exactly
  if (cp?.key !== pp?.key || cp?.mode !== pp?.mode) return true

  // Compare style object (shallow comparison of top-level keys)
  const styleKeys = ['genre', 'tempo', 'energy', 'complexity']
  for (const key of styleKeys) {
    if (cs?.[key] !== ps?.[key]) return true
  }

  return false
}

// Entry #PERF-FIX: Store interval ID for graceful shutdown
let compositionalBroadcastInterval = setInterval(() => {
  roomManager.rooms.forEach((room, roomId) => {
    if (room.users.size > 0) {
      const parameters = roomManager.getCompositionalParameters(roomId)
      if (parameters) {
        // Entry #183: Include style for genre-aware voice parameters
        const style = backgroundService?.getCurrentStyleForRoom(roomId) || {}

        // Entry #HarmonicCoherence: Include key/mode from per-room HarmonicEngine for full mode support
        const harmonicEngine = backgroundService?.getHarmonicEngineForRoom(roomId)
        const harmonicContext = {
          key: harmonicEngine?.currentKey || 'C',
          mode: harmonicEngine?.currentMode || 'ionian'
        }

        const payload = {
          parameters: {
            ...parameters,
            key: harmonicContext.key,
            mode: harmonicContext.mode
          },
          style
        }

        // Entry #PERF-FIX: Use efficient shallow comparison instead of JSON.stringify
        // Compares only musically-relevant fields, avoids O(n) serialization
        const lastState = lastBroadcastState.get(roomId)
        broadcastMetrics.totalChecks++

        if (hasCompositionalParamsChanged(payload, lastState)) {
          // Store shallow copy of state for next comparison
          lastBroadcastState.set(roomId, {
            parameters: { ...payload.parameters },
            style: payload.style ? { ...payload.style } : null
          })
          io.to(roomId).emit('compositional-parameters', {
            ...payload,
            timestamp: Date.now()
          })
          broadcastMetrics.broadcastsSent++
        } else {
          broadcastMetrics.broadcastsSkipped++
        }
      }
    }
  })

  // Cleanup state for rooms that no longer exist
  for (const roomId of lastBroadcastState.keys()) {
    if (!roomManager.rooms.has(roomId)) {
      lastBroadcastState.delete(roomId)
    }
  }
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

  // Entry #PERF-FIX: Stop compositional parameters broadcast timer
  if (compositionalBroadcastInterval) {
    clearInterval(compositionalBroadcastInterval)
    compositionalBroadcastInterval = null
    lastBroadcastState.clear()
  }

  // Stop rate limiter cleanup
  RateLimiter.stopCleanup()

  // Shutdown composition monitor
  if (compositionMonitor) {
    compositionMonitor.shutdown()
  }

  // Stop all active services — individual try-catch to ensure each cleanup runs
  try {
    const audService = container.get('auditionGestureService')
    if (audService) {
      for (const socketId of [...audService.activeAuditions.keys()]) {
        audService.stopAudition(socketId)
      }
    }
  } catch (err) { serverLogger.error('Shutdown: audition cleanup error:', err.message) }

  try {
    const seqService = container.get('sequencerGestureService')
    if (seqService) {
      for (const socketId of [...seqService.activeSequencers.keys()]) {
        seqService.stopSequencer(socketId)
      }
    }
  } catch (err) { serverLogger.error('Shutdown: sequencer cleanup error:', err.message) }

  try {
    const vus = container.get('virtualUserService')
    if (vus) {
      for (const roomId of [...vus.activeRooms.keys()]) {
        vus.deactivateForRoom(roomId, false)
      }
    }
  } catch (err) { serverLogger.error('Shutdown: virtual user cleanup error:', err.message) }

  try {
    const bcs = container.get('backgroundCompositionService')
    if (bcs) {
      for (const roomId of [...roomManager.rooms.keys()]) {
        bcs.stopComposition(roomId)
      }
    }
  } catch (err) { serverLogger.error('Shutdown: composition cleanup error:', err.message) }

  try {
    const envMem = container.get('environmentalMemoryCoordinator')
    if (envMem) envMem.shutdown()
  } catch (err) { serverLogger.error('Shutdown: env memory cleanup error:', err.message) }

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