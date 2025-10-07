/**
 * Webarmonium Server - Complete Unified Implementation
 * Includes all original features plus Phase 3.3 REST API endpoints
 * Fixed socketHandlers integration and proper Express route ordering
 */

const express = require('express')
const http = require('http')
const socketIo = require('socket.io')
const cors = require('cors')
const rateLimit = require('express-rate-limit')

// Import services and models
const RoomManager = require('./services/RoomManager')
const GestureProcessor = require('./services/GestureProcessor')
const SoundPatternGenerator = require('./services/SoundPatternGenerator')
const EnvironmentalMemoryCoordinator = require('./services/EnvironmentalMemoryCoordinator')
const socketHandlers = require('./api/socketHandlers')

// Phase 3.3 REST API services
const PatternRecognitionService = require('./services/PatternRecognitionService')
const CompositionEngine = require('./services/CompositionEngine')
const VoiceAllocationManager = require('./services/VoiceAllocationManager')
const MusicalClockService = require('./services/MusicalClockService')

// Phase 3.3 models
const MusicalEvent = require('./models/MusicalEvent')
const BackgroundComposition = require('./models/BackgroundComposition')
const VoiceResource = require('./models/VoiceResource')
const PatternMemory = require('./models/PatternMemory')

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

// Initialize core services
const roomManager = new RoomManager()
const gestureProcessor = new GestureProcessor(roomManager)
const soundPatternGenerator = new SoundPatternGenerator()
const environmentalMemoryCoordinator = new EnvironmentalMemoryCoordinator(roomManager)

// Initialize Phase 3.3 services
const patternRecognitionService = new PatternRecognitionService()
const compositionEngine = new CompositionEngine()
const voiceAllocationManager = new VoiceAllocationManager()
const musicalClockService = new MusicalClockService()

// Note: EnvironmentalMemoryCoordinator doesn't need explicit service initialization
// Services are directly passed to socket handlers as needed

// Global services object for socket handlers
const services = {
  roomManager,
  gestureProcessor,
  soundPatternGenerator,
  environmentalMemoryCoordinator,
  patternRecognitionService,
  compositionEngine,
  voiceAllocationManager,
  musicalClockService
}

// Health check endpoint
app.get('/health', (req, res) => {
  const rooms = Array.from(roomManager.rooms.values())
  const totalUsers = rooms.reduce((sum, room) => sum + room.users.size, 0)

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0-unified',
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

// Phase 3.3 REST API Endpoints

// POST /api/rooms/:roomId/gestures - Process gestures with musical pattern recognition
app.post('/api/rooms/:roomId/gestures', async (req, res) => {
  try {
    const { roomId } = req.params
    const gestureData = req.body

    // Validate room exists
    const room = roomManager.rooms.get(roomId)
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'room_not_found',
        message: `Room ${roomId} not found`
      })
    }

    // Validate gesture data
    if (!gestureData || typeof gestureData !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'invalid_gesture_data',
        message: 'Gesture data is required and must be an object'
      })
    }

    // Required gesture fields
    const requiredFields = ['userId', 'coordinates', 'intensity', 'timestamp', 'direction']
    for (const field of requiredFields) {
      if (gestureData[field] === undefined || gestureData[field] === null) {
        return res.status(400).json({
          success: false,
          error: 'missing_gesture_field',
          message: `Missing required field: ${field}`
        })
      }
    }

    // Validate coordinates
    if (!Array.isArray(gestureData.coordinates) || gestureData.coordinates.length !== 2) {
      return res.status(400).json({
        success: false,
        error: 'invalid_coordinates',
        message: 'Coordinates must be an array of [x, y] values'
      })
    }

    const [x, y] = gestureData.coordinates
    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || x > 1 || y < 0 || y > 1) {
      return res.status(400).json({
        success: false,
        error: 'invalid_coordinate_range',
        message: 'Coordinates must be numbers between 0 and 1'
      })
    }

    // Validate intensity
    if (typeof gestureData.intensity !== 'number' || gestureData.intensity < 0 || gestureData.intensity > 1) {
      return res.status(400).json({
        success: false,
        error: 'invalid_intensity',
        message: 'Intensity must be a number between 0 and 1'
      })
    }

    // Validate timestamp
    if (typeof gestureData.timestamp !== 'number' || gestureData.timestamp <= 0) {
      return res.status(400).json({
        success: false,
        error: 'invalid_timestamp',
        message: 'Timestamp must be a positive number'
      })
    }

    // Validate direction
    const validDirections = ['horizontal', 'vertical', 'diagonal-up-right', 'diagonal-up-left', 'diagonal-down-right', 'diagonal-down-left', 'circular-clockwise', 'circular-counter-clockwise', 'random', 'static']
    if (!validDirections.includes(gestureData.direction)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_direction',
        message: `Direction must be one of: ${validDirections.join(', ')}`
      })
    }

    // Validate user exists in room
    if (!room.users.has(gestureData.userId)) {
      return res.status(404).json({
        success: false,
        error: 'user_not_in_room',
        message: `User ${gestureData.userId} is not in room ${roomId}`
      })
    }

    // Process gesture through gesture processor
    const gesture = {
      userId: gestureData.userId,
      coordinates: { x, y },
      intensity: gestureData.intensity,
      timestamp: gestureData.timestamp,
      direction: gestureData.direction,
      roomId: roomId
    }

    const processedGesture = gestureProcessor.processGesture(gesture)

    // Create enhanced musical event from gesture
    const musicalEvent = new MusicalEvent({
      roomId: roomId,
      userId: gestureData.userId,
      timestamp: Date.now(),
      type: 'pitch',
      pitch: Math.floor(36 + (1 - y) * 48), // Map Y to pitch (MIDI 36-84)
      velocity: Math.floor(gestureData.intensity * 127),
      duration: 200 + (1 - gestureData.intensity) * 800, // 200ms-1s based on intensity
      pan: (x * 2) - 1, // Map X to pan (-1 to 1)
      articulation: gestureData.direction.includes('staccato') ? 'staccato' :
                   gestureData.direction.includes('legato') ? 'legato' : 'normal',
      eventType: 'melodic'
    })

    // Store event in room's pattern memory
    if (!room.patternMemory) {
      room.patternMemory = []
    }
    room.patternMemory.push(musicalEvent)

    // Broadcast to room for real-time audio
    io.to(roomId).emit('sonic-update', {
      type: 'musical_event',
      event: musicalEvent,
      userId: gestureData.userId,
      timestamp: Date.now()
    })

    res.json({
      success: true,
      processedGesture: processedGesture,
      musicalEvent: musicalEvent
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'gesture_processing_failed',
      message: error.message
    })
  }
})

// GET /api/rooms/:id/musical-events - Retrieve musical events with pattern analysis
app.get('/api/rooms/:id/musical-events', async (req, res) => {
  try {
    const roomId = req.params.id

    // Validate room exists
    const room = roomManager.rooms.get(roomId)
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'room_not_found',
        message: `Room ${roomId} not found`
      })
    }

    // Validate timeWindow parameter if provided
    let timeWindow = 60000 // Default 1 minute
    if (req.query.timeWindow !== undefined) {
      const parsedTimeWindow = parseInt(req.query.timeWindow)
      if (isNaN(parsedTimeWindow) || parsedTimeWindow < 1000 || parsedTimeWindow > 300000) { // 1 second to 5 minutes
        return res.status(400).json({
          success: false,
          error: 'validation_error',
          message: 'timeWindow must be between 1000ms and 300000ms (5 minutes)'
        })
      }
      timeWindow = parsedTimeWindow
    }

    // Validate similarityThreshold parameter if provided
    let similarityThreshold = 0.7 // Default
    if (req.query.similarityThreshold !== undefined) {
      const parsedSimilarityThreshold = parseFloat(req.query.similarityThreshold)
      if (isNaN(parsedSimilarityThreshold) || parsedSimilarityThreshold < 0 || parsedSimilarityThreshold > 1) {
        return res.status(400).json({
          success: false,
          error: 'validation_error',
          message: 'similarityThreshold must be between 0 and 1'
        })
      }
      similarityThreshold = parsedSimilarityThreshold
    }

    // Get recent events from room's pattern memory
    const now = Date.now()
    const recentEvents = (room.patternMemory || []).filter(event =>
      now - event.timestamp <= timeWindow
    )

    // Analyze patterns using PatternRecognitionService
    const patternAnalysis = patternRecognitionService.analyzePatterns(
      recentEvents,
      timeWindow,
      similarityThreshold
    )

    res.json({
      success: true,
      events: recentEvents,
      count: recentEvents.length,
      timeWindow: timeWindow,
      similarityThreshold: similarityThreshold,
      patternAnalysis: patternAnalysis
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'pattern_analysis_failed',
      message: error.message
    })
  }
})

// GET /api/rooms/:id/patterns - Analyze musical patterns in the room
app.get('/api/rooms/:id/patterns', async (req, res) => {
  try {
    const roomId = req.params.id
    const timeWindow = parseInt(req.query.timeWindow) || 120000 // Default 2 minutes
    const minSimilarity = parseFloat(req.query.minSimilarity) || 0.6

    // Validate room exists
    const room = roomManager.rooms.get(roomId)
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'room_not_found',
        message: `Room ${roomId} not found`
      })
    }

    // Validate timeWindow
    if (isNaN(timeWindow) || timeWindow < 10000 || timeWindow > 600000) { // 10 seconds to 10 minutes
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'timeWindow must be between 10000ms and 600000ms (10 minutes)'
      })
    }

    // Validate minSimilarity
    if (isNaN(minSimilarity) || minSimilarity < 0 || minSimilarity > 1) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'minSimilarity must be between 0 and 1'
      })
    }

    // Get events from room's pattern memory
    const now = Date.now()
    const recentEvents = (room.patternMemory || []).filter(event =>
      now - event.timestamp <= timeWindow
    )

    // Use PatternRecognitionService to analyze patterns
    const patterns = patternRecognitionService.analyzePatterns(
      recentEvents,
      timeWindow,
      minSimilarity
    )

    res.json({
      success: true,
      roomId: roomId,
      timeWindow: timeWindow,
      minSimilarity: minSimilarity,
      totalEvents: recentEvents.length,
      patterns: patterns || { phrases: [], relationships: [], motifs: [] },
      analysis: {
        patternDensity: patterns ? Object.keys(patterns).length : 0,
        timeRange: {
          start: Math.min(...recentEvents.map(e => e.timestamp), now),
          end: Math.max(...recentEvents.map(e => e.timestamp), now)
        }
      }
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'pattern_analysis_failed',
      message: error.message
    })
  }
})

// GET /api/rooms/:id/composition - Get current background composition state
app.get('/api/rooms/:id/composition', async (req, res) => {
  try {
    const roomId = req.params.id

    // Auto-create room if it doesn't exist (user-friendly behavior)
    let room = roomManager.rooms.get(roomId)
    if (!room) {
      // Create room automatically like RoomManager does
      const Room = require('./models/Room')
      room = new Room(roomId)
      roomManager.rooms.set(roomId, room)
      console.log(`Auto-created room ${roomId} for composition request`)
    }

    // Get current composition from engine
    const composition = compositionEngine.getComposition(roomId)

    // Get musical clock state
    const musicalClock = musicalClockService.getOrCreateClock(roomId)

    res.status(200).json({
      success: true,
      roomId,
      composition: {
        ...composition.toJSON(),
        musicalClock: {
          id: musicalClock.id,
          isRunning: musicalClock.isRunning,
          currentBeat: musicalClock.currentBeat,
          tempo: musicalClock.tempo,
          timeSignature: musicalClock.timeSignature
        }
      },
      timestamp: Date.now()
    })

  } catch (error) {
    console.error('Get composition error:', error)
    res.status(500).json({
      success: false,
      error: 'internal_error',
      message: 'Failed to get composition'
    })
  }
})

// POST /api/rooms/:id/composition - Evolve background composition based on patterns
app.post('/api/rooms/:id/composition', async (req, res) => {
  try {
    const roomId = req.params.id
    const { stylePreferences, targetMood } = req.body

    // Validate room exists
    const room = roomManager.rooms.get(roomId)
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'room_not_found',
        message: `Room ${roomId} not found`
      })
    }

    // Validate stylePreferences
    if (stylePreferences && typeof stylePreferences !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'stylePreferences must be an object'
      })
    }

    // Validate targetMood
    if (targetMood && typeof targetMood !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'targetMood must be an object'
      })
    }

    // Get recent patterns from room's pattern memory
    const recentEvents = (room.patternMemory || []).slice(-50) // Last 50 events
    const userPatterns = patternRecognitionService.analyzePatterns(
      recentEvents,
      120000, // 2 minutes
      0.6 // Default similarity
    )

    // Use CompositionEngine to evolve composition
    const evolvedComposition = compositionEngine.evolveComposition(
      roomId,
      userPatterns,
      stylePreferences,
      targetMood
    )

    // Store composition in room
    room.backgroundComposition = evolvedComposition

    // Broadcast composition update to room
    io.to(roomId).emit('composition-update', {
      composition: evolvedComposition,
      timestamp: Date.now()
    })

    res.json({
      success: true,
      composition: evolvedComposition,
      basedOnPatterns: userPatterns ? Object.keys(userPatterns).length : 0
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'composition_evolution_failed',
      message: error.message
    })
  }
})

// GET /api/rooms/:id/voices - Get voice allocation status for the room
app.get('/api/rooms/:id/voices', async (req, res) => {
  try {
    const roomId = req.params.id

    // Validate room exists
    const room = roomManager.rooms.get(roomId)
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'room_not_found',
        message: `Room ${roomId} not found`
      })
    }

    // Get voice allocation from VoiceAllocationManager
    const voiceStatus = voiceAllocationManager.getVoiceStatus(roomId)

    res.json({
      success: true,
      roomId: roomId,
      voices: voiceStatus,
      timestamp: Date.now()
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'voice_status_failed',
      message: error.message
    })
  }
})

// POST /api/rooms/:id/voices/request - Request voice allocation
app.post('/api/rooms/:id/voices/request', async (req, res) => {
  try {
    const roomId = req.params.id
    const { userId, type, deviceCapabilities } = req.body

    // Validate room exists
    const room = roomManager.rooms.get(roomId)
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'room_not_found',
        message: `Room ${roomId} not found`
      })
    }

    // Validate userId
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'userId is required and must be a string'
      })
    }

    // Validate user exists in room
    if (!room.users.has(userId)) {
      return res.status(404).json({
        success: false,
        error: 'user_not_in_room',
        message: `User ${userId} is not in room ${roomId}`
      })
    }

    // Validate type
    const validTypes = ['gesture', 'background']
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: `type must be one of: ${validTypes.join(', ')}`
      })
    }

    // Validate deviceCapabilities
    if (deviceCapabilities && typeof deviceCapabilities !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'deviceCapabilities must be an object'
      })
    }

    // Use VoiceAllocationManager to allocate voice
    const allocatedVoice = voiceAllocationManager.allocateVoice(
      roomId,
      userId,
      type,
      deviceCapabilities || {}
    )

    if (!allocatedVoice) {
      return res.status(409).json({
        success: false,
        error: 'no_available_voices',
        message: 'No available voices for allocation'
      })
    }

    res.json({
      success: true,
      voice: allocatedVoice,
      timestamp: Date.now()
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'voice_allocation_failed',
      message: error.message
    })
  }
})

// POST /api/rooms/:id/clock/sync - Synchronize musical clock
app.post('/api/rooms/:id/clock/sync', async (req, res) => {
  try {
    const roomId = req.params.id
    const { clientTimestamp, bpm, timeSignature } = req.body

    // Validate room exists
    const room = roomManager.rooms.get(roomId)
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'room_not_found',
        message: `Room ${roomId} not found`
      })
    }

    // Validate clientTimestamp
    if (!clientTimestamp || typeof clientTimestamp !== 'number' || clientTimestamp <= 0) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'clientTimestamp is required and must be a positive number'
      })
    }

    // Validate bpm
    if (bpm && (typeof bpm !== 'number' || bpm < 60 || bpm > 200)) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'bpm must be a number between 60 and 200'
      })
    }

    // Validate timeSignature
    if (timeSignature && typeof timeSignature !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'timeSignature must be a string'
      })
    }

    // Use MusicalClockService to synchronize
    const syncData = {
      clientTimestamp,
      serverTimestamp: Date.now(),
      roomId,
      bpm: bpm || 120,
      timeSignature: timeSignature || '4/4'
    }

    const clockSync = musicalClockService.synchronizeClock(roomId, syncData)

    // Broadcast clock sync to room
    io.to(roomId).emit('clock-sync', clockSync)

    res.json({
      success: true,
      sync: clockSync,
      timestamp: Date.now()
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'clock_sync_failed',
      message: error.message
    })
  }
})

// GET /api/rooms/:id/clock/status - Get musical clock status
app.get('/api/rooms/:id/clock/status', async (req, res) => {
  try {
    const roomId = req.params.id

    // Validate room exists
    const room = roomManager.rooms.get(roomId)
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'room_not_found',
        message: `Room ${roomId} not found`
      })
    }

    // Get clock status from MusicalClockService
    const clockStatus = musicalClockService.getClockStatus(roomId)

    res.json({
      success: true,
      roomId: roomId,
      clock: clockStatus,
      timestamp: Date.now()
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'clock_status_failed',
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

    // Clean up Phase 3.3 services
    patternRecognitionService.clearRoomMemory(id)
    compositionEngine.clearComposition(id)
    voiceAllocationManager.clearRoomVoices(id)
    musicalClockService.clearRoomClock(id)

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
    console.log(`🚀 Webarmonium unified server running on port ${PORT}`)
    console.log(`📊 Health check: http://localhost:${PORT}/health`)
    console.log(`🎵 Phase 3.3 REST API endpoints available`)
    console.log(`🔌 WebSocket server ready for real-time collaboration`)
  })
}

module.exports = app