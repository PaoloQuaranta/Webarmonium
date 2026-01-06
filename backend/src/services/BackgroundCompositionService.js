/**
 * BackgroundCompositionService
 * Continuous background composition generation
 * Generates articulated musical compositions using CompositionEngine
 * Develops user-generated material with variations, inversions, arpeggios, etc.
 *
 * Features:
 * - Riffs, phrases, and arpeggios
 * - Complex structural forms (ABA, rondo, sonata, etc.)
 * - Material development (variations, inversions, retrograde, etc.)
 * - Harmonic progressions
 * - Multi-user counterpoint
 */

const MaterialLibrary = require('./MaterialLibrary')
const StyleAnalyzer = require('./StyleAnalyzer')
const HarmonicEngine = require('./HarmonicEngine')
const CompositionEngine = require('./CompositionEngine')
const PhraseMorphology = require('./PhraseMorphology')

class BackgroundCompositionService {
  constructor() {
    // Initialize musical components
    this.materialLibrary = new MaterialLibrary()
    this.styleAnalyzer = new StyleAnalyzer()
    this.harmonicEngine = new HarmonicEngine()
    this.phraseMorphology = new PhraseMorphology()
    this.compositionEngine = new CompositionEngine(
      this.materialLibrary,
      this.styleAnalyzer,
      this.harmonicEngine
    )

    // Composition state per room
    this.roomCompositions = new Map() // roomId -> composition state

    // Composition intervals (in milliseconds)
    // FREQUENT compositions for continuous musical flow
    this.minCompositionInterval = 3000  // 3 seconds minimum between compositions
    this.maxCompositionInterval = 6000  // 6 seconds maximum between compositions

    // Active composition timers
    this.compositionTimers = new Map() // roomId -> timer

    // Socket.io instance (set by server)
    this.io = null

    // Reference to GestureToMusicService for harmonic synchronization
    this.gestureToMusicService = null

// console.log('🎼 BackgroundCompositionService initialized')
  }

  /**
   * Set Socket.IO instance for broadcasting
   * @param {SocketIO} io - Socket.IO instance
   */
  setSocketIO(io) {
    this.io = io
// console.log('🎼 BackgroundCompositionService: Socket.IO connected')
  }

  /**
   * Set GestureToMusicService reference for harmonic synchronization
   * @param {GestureToMusicService} gestureService - GestureToMusicService instance
   */
  setGestureToMusicService(gestureService) {
    this.gestureToMusicService = gestureService
    // Initial sync
    this.syncHarmonicContext()
// console.log('🎼 BackgroundCompositionService: GestureToMusicService linked for harmonic sync')
  }

  /**
   * Sync harmonic context to GestureToMusicService
   */
  syncHarmonicContext() {
    if (this.gestureToMusicService) {
      this.gestureToMusicService.currentKey = this.compositionEngine.keyCenter
      this.gestureToMusicService.currentMode = this.compositionEngine.mode
      this.gestureToMusicService.harmonicEngine.currentKey = this.compositionEngine.keyCenter
      this.gestureToMusicService.harmonicEngine.currentMode = this.compositionEngine.mode
// console.log(`🎵 Synced harmonic context: ${this.compositionEngine.keyCenter} ${this.compositionEngine.mode}`)
    }
  }

  /**
   * Start continuous composition for a room
   * @param {string} roomId - Room ID
   * @param {Object} roomContext - Room context (userCount, etc.)
   */
  startComposition(roomId, roomContext = {}) {
    if (this.compositionTimers.has(roomId)) {
// console.log(`🎼 Composition already running for room ${roomId}`)
      return
    }

// console.log(`🎼 Starting with DRONE (waiting for gestures to define composition)`)

    // Initialize room composition state with SESSION PROFILING
    this.roomCompositions.set(roomId, {
      roomId,
      roomContext,
      compositionCount: 0,
      gestureCount: 0,           // Track gestures in this session
      initialGestureWindow: 5,    // First N gestures are highly influential
      compositionStarted: false,  // Start with drone, transition to composition after gestures
      gestureHistory: [],        // Accumulate gestures for tempo calculation (StyleAnalyzer needs 2+)
      startTime: Date.now(),
      lastCompositionTime: Date.now()
    })

    // Start with DRONE only (atmospheric pad)
    // Add 500ms delay to ensure socket has fully joined room before broadcasting
    setTimeout(() => {
      this.generateAndBroadcastDrone(roomId)
    }, 500)

    // DON'T schedule continuous compositions yet - wait for gestures
    // Compositions will start automatically after 2+ gestures (see addMaterial)
  }

  /**
   * Generate and broadcast DRONE (atmospheric pad) for initial state
   * @param {string} roomId - Room ID
   */
  generateAndBroadcastDrone(roomId) {
// console.log(`🎵 Generating initial DRONE for room ${roomId}`)

    // Simple drone: single sustained note in root key
    const droneComposition = {
      type: 'ambient',
      metadata: {
        tempo: 60,
        keyCenter: this.compositionEngine.keyCenter,
        mode: this.compositionEngine.mode,
        timeSignature: '4/4'
      },
      structure: {
        form: 'drone',
        currentSection: 'ambient'
      },
      content: {
        texture: [{
          type: 'drone',
          note: 'C3',  // Root note
          duration: 8000,  // 8 seconds
          velocity: 0.5,  // INCREASED from 0.2 - must be audible with pad's slow attack
          articulation: 'legato'
        }]
      }
    }

    // Broadcast drone to room
    if (this.io) {
      // Get sockets in room for verification
      const socketsInRoom = this.io.sockets.adapter.rooms.get(roomId)
      const socketCount = socketsInRoom ? socketsInRoom.size : 0

// console.log(`🎵 Broadcasting DRONE to room ${roomId} (${socketCount} sockets in room)`)

      this.io.to(roomId).emit('background-composition', {
        roomId,
        composition: droneComposition,
        compositionNumber: 0,
        isDrone: true,  // Mark as drone for frontend
        timestamp: Date.now()
      })

// console.log(`✅ DRONE broadcast complete for room ${roomId}`)
    } else {
// console.error(`❌ Cannot broadcast DRONE - io not initialized`)
    }
  }

  /**
   * Stop composition for a room
   * @param {string} roomId - Room ID
   */
  stopComposition(roomId) {
    const timer = this.compositionTimers.get(roomId)
    if (timer) {
      clearTimeout(timer)
      this.compositionTimers.delete(roomId)
      this.roomCompositions.delete(roomId)
// console.log(`🎼 Stopped composition for room ${roomId}`)
    }
  }

  /**
   * Add material from user gesture
   * @param {string} roomId - Room ID
   * @param {Object} gestureData - Gesture data
   * @param {Object} musicalPhrase - Musical phrase generated from gesture
   */
  addMaterial(roomId, gestureData, musicalPhrase) {
    const roomState = this.roomCompositions.get(roomId)
    if (!roomState) {
// console.warn(`🎼 No room state for ${roomId}, creating...`)
      this.startComposition(roomId, {})
      return
    }

    // INCREMENT GESTURE COUNT for session profiling
    roomState.gestureCount++

    // CALCULATE GESTURE WEIGHT: First gestures have maximum influence
    const gestureWeight = this.calculateGestureWeight(roomState.gestureCount, roomState.initialGestureWindow)

// console.log(`🎵 Gesture #${roomState.gestureCount} - Weight: ${gestureWeight.toFixed(2)} (${gestureWeight >= 0.8 ? 'HIGH' : gestureWeight >= 0.5 ? 'MEDIUM' : 'LOW'} influence)`)

    // Convert musical phrase to material format
    const material = {
      notes: musicalPhrase.notes || [],
      duration: musicalPhrase.duration || 1000,
      userId: gestureData.userId,
      gestureData: gestureData,
      weight: gestureWeight,  // Store weight with material
      timestamp: Date.now()
    }

    // Add to material library
    const materialId = this.materialLibrary.addMaterial(material)

    // NORMALIZE gesture properties for StyleAnalyzer
    // StyleAnalyzer expects: velocity (0-100), acceleration (0-50), timestamp
    // Gesture has: speed (unreliable), intensity (0-1), duration (ms), startTime/endTime

    let velocity, acceleration, interOnsetInterval

    // FOR DRAG GESTURES: Analyze individual notes for accurate velocity and rhythm
    if (musicalPhrase.notes && musicalPhrase.notes.length > 0) {
      // Calculate average velocity from notes (0-1 → 0-100)
      const avgNoteVelocity = musicalPhrase.notes.reduce((sum, note) => sum + (note.velocity || 0), 0) / musicalPhrase.notes.length
      velocity = avgNoteVelocity * 100

      // Calculate inter-onset intervals (rhythm between notes)
      if (musicalPhrase.notes.length >= 2) {
        const intervals = []
        for (let i = 1; i < musicalPhrase.notes.length; i++) {
          const interval = musicalPhrase.notes[i].timestamp - musicalPhrase.notes[i - 1].timestamp
          if (interval > 0) intervals.push(interval)
        }

        if (intervals.length > 0) {
          interOnsetInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length
        }
      }

      // Calculate acceleration from velocity variance (dynamic range)
      const velocities = musicalPhrase.notes.map(n => n.velocity || 0)
      const velocityVariance = Math.sqrt(
        velocities.reduce((sum, v) => sum + Math.pow(v - avgNoteVelocity, 2), 0) / velocities.length
      )
      acceleration = velocityVariance * 100  // Higher variance = more dynamic = higher acceleration

// console.log('🎹 Analyzed DRAG notes:', {
//        noteCount: musicalPhrase.notes.length,
//        avgVelocity: velocity.toFixed(1),
//        interOnsetInterval: interOnsetInterval ? interOnsetInterval.toFixed(1) + 'ms' : 'N/A',
//        velocityVariance: velocityVariance.toFixed(3),
//        acceleration: acceleration.toFixed(1)
////      })
    }
    // FOR TAP GESTURES: Use gesture duration as proxy (fallback)
    else {
      const duration = gestureData.gesture.duration || 500
      velocity = Math.max(10, Math.min(100, 100 - (duration / 20)))

      const rawIntensity = gestureData.gesture.intensity || 0.5
      acceleration = rawIntensity * 50

// console.log('👆 Analyzed TAP gesture:', {
//        duration: duration.toFixed(0) + 'ms',
//        velocity: velocity.toFixed(1),
//        acceleration: acceleration.toFixed(1)
////      })
    }

    const normalizedGesture = {
      ...gestureData.gesture,
      velocity,
      acceleration,
      interOnsetInterval,  // Add rhythm information
      timestamp: gestureData.gesture.startTime || Date.now()
    }

// console.log('🔍 Normalized gesture for StyleAnalyzer:', {
//      type: normalizedGesture.type,
//      velocity: normalizedGesture.velocity.toFixed(1),
//      acceleration: normalizedGesture.acceleration.toFixed(1),
//      interOnsetInterval: normalizedGesture.interOnsetInterval ? normalizedGesture.interOnsetInterval.toFixed(1) + 'ms' : 'N/A',
//      timestamp: normalizedGesture.timestamp
////    })

    // ACCUMULATE gestures for tempo calculation (StyleAnalyzer needs 2+ for tempo)
    roomState.gestureHistory.push(normalizedGesture)
    // Keep only recent 10 gestures for analysis window
    if (roomState.gestureHistory.length > 10) {
      roomState.gestureHistory = roomState.gestureHistory.slice(-10)
    }

// console.log(`🔍 Gesture history size: ${roomState.gestureHistory.length} gestures`)

    // Update style analyzer WITH ACCUMULATED GESTURES
    this.styleAnalyzer.analyzeGestureStyle(roomState.gestureHistory, gestureWeight)

    // APPLY STYLE TO COMPOSITION ENGINE
    this.applyStyleToComposition(roomId)

    // TRANSITION from DRONE to FULL COMPOSITION after initial gestures
    if (roomState.gestureCount >= 2 && !roomState.compositionStarted) {
// console.log('🎼 Transitioning from drone to full composition (2+ gestures collected)')
      roomState.compositionStarted = true

      // Generate first real composition
      this.generateAndBroadcastComposition(roomId, roomState.roomContext)

      // Schedule continuous compositions
      this.scheduleNextComposition(roomId, roomState.roomContext)
    }

// console.log(`🎼 Added material ${materialId} (gesture #${roomState.gestureCount}):`, {
//      notesCount: material.notes.length,
//      weight: gestureWeight.toFixed(2),
//      phraseType: musicalPhrase.type || 'unknown'
////    })

    return materialId
  }

  /**
   * Calculate gesture weight based on position in session
   * First gestures have high weight, later gestures require repetition
   */
  calculateGestureWeight(gestureCount, initialWindow) {
    if (gestureCount <= initialWindow) {
      // First N gestures: MAXIMUM influence (weight 1.0)
      return 1.0
    } else {
      // After initial window: exponentially decreasing weight
      // Requires repetition to influence composition
      const excessGestures = gestureCount - initialWindow
      return Math.max(0.1, 1.0 / Math.pow(1.5, excessGestures / 5))
    }
  }

  /**
   * Apply analyzed style to composition parameters
   */
  applyStyleToComposition(roomId) {
    const style = this.styleAnalyzer.getCurrentStyle()

    // MAP STYLE TO COMPOSITION PARAMETERS
    // Tempo from style
    this.compositionEngine.tempo = Math.round(style.tempo)

    // Key and mode from harmonic complexity
    const { keyCenter, mode } = this.selectKeyAndMode(style)
    if (keyCenter !== this.compositionEngine.keyCenter || mode !== this.compositionEngine.mode) {
      this.compositionEngine.keyCenter = keyCenter
      this.compositionEngine.mode = mode
// console.log(`🎼 Style influenced composition: ${keyCenter} ${mode}, tempo ${this.compositionEngine.tempo}`)
      // Sync to gestures
      this.syncHarmonicContext()
    }

    // Complexity and density from energy
    this.compositionEngine.complexityLevel = Math.min(0.9, Math.max(0.1, style.energy))
    this.compositionEngine.density = Math.min(0.9, Math.max(0.1, style.energy * 1.2))

// console.log(`🎼 Applied style: energy=${style.energy.toFixed(2)}, tempo=${this.compositionEngine.tempo}, complexity=${this.compositionEngine.complexityLevel.toFixed(2)}`)
  }

  /**
   * Select key and mode based on style analysis
   */
  selectKeyAndMode(style) {
    const modalFlavor = style.harmonicComplexity?.modalFlavor || 'major'

    // Map modalFlavor to mode
    const modeMap = {
      'major': 'ionian',
      'minor': 'aeolian',
      'dorian': 'dorian',
      'phrygian': 'phrygian',
      'lydian': 'lydian',
      'mixolydian': 'mixolydian',
      'locrian': 'locrian'
    }
    const mode = modeMap[modalFlavor] || 'ionian'

    // Select key based on energy (low energy = flat keys, high energy = sharp keys)
    const energy = style.energy || 0.5
    const keys = ['F', 'C', 'G', 'D', 'A', 'E']
    const keyIndex = Math.floor(energy * (keys.length - 1))
    const keyCenter = keys[keyIndex]

    return { keyCenter, mode }
  }

  /**
   * Schedule next composition
   * @param {string} roomId - Room ID
   * @param {Object} roomContext - Room context
   */
  scheduleNextComposition(roomId, roomContext) {
    // Calculate next composition interval BASED ON CURRENT TEMPO
    // Generate compositions at a fixed number of beats, not fixed time
    const currentStyle = this.styleAnalyzer.getCurrentStyle()
    const tempo = currentStyle.tempo || 120

    // Generate new composition every 8-16 beats (musically natural phrase length)
    const beatsPerComposition = 8 + Math.random() * 8  // 8-16 beats
    const beatDuration = 60000 / tempo  // milliseconds per beat
    const interval = beatsPerComposition * beatDuration

    // Clamp to reasonable bounds (don't go crazy)
    const clampedInterval = Math.max(1000, Math.min(20000, interval))

    const timer = setTimeout(() => {
      this.generateAndBroadcastComposition(roomId, roomContext)
      this.scheduleNextComposition(roomId, roomContext)
    }, clampedInterval)

    this.compositionTimers.set(roomId, timer)

// console.log(`🎼 Next composition for room ${roomId} in ${(clampedInterval/1000).toFixed(1)}s (${beatsPerComposition.toFixed(0)} beats @ ${tempo} BPM)`)
  }

  /**
   * Generate and broadcast composition
   * @param {string} roomId - Room ID
   * @param {Object} roomContext - Room context
   */
  async generateAndBroadcastComposition(roomId, roomContext) {
    try {
// console.log(`🎼 Generating composition for room ${roomId}`)

      // Get room state
      const roomState = this.roomCompositions.get(roomId)
      if (!roomState) {
// console.log(`🎼 No room state for ${roomId}, skipping composition`)
        return
      }

      // Update room context
      roomState.roomContext = roomContext
      roomState.compositionCount++
      roomState.lastCompositionTime = Date.now()

      // Generate composition using CompositionEngine
      const composition = this.compositionEngine.compose({
        roomId,
        userCount: roomContext.userCount || 1,
        activeUsers: roomContext.activeUsers || []
      })

// console.log(`🎼 Generated ${composition.type} composition:`, {
//        form: composition.structure.form,
//        section: composition.structure.currentSection,
//        tempo: composition.metadata.tempo,
//        keyCenter: composition.metadata.keyCenter
////      })

      // Log composition details
      // // if (composition.content.voices) {
      // // console.log(`🎼   ${composition.content.voices.length} voices (polyphonic)`)
      // // } else if (composition.content.melody) {
      // // console.log(`🎼   Melody + accompaniment (homophonic)`)
      // //   if (composition.content.accompaniment) {
      // // console.log(`🎼   Accompaniment type: ${composition.content.accompaniment.type}`)
      // //   }
      // // } else if (composition.content.texture) {
      // // console.log(`🎼   Ambient texture`)
      // // }

      // Broadcast composition to room
      if (this.io) {
        this.io.to(roomId).emit('background-composition', {
          roomId,
          composition,
          compositionNumber: roomState.compositionCount,
          timestamp: Date.now()
        })

// console.log(`🎼 Broadcast composition #${roomState.compositionCount} to room ${roomId}`)
      } else {
// console.log(`🎼 No Socket.IO instance, composition not broadcast`)
      }

      // Update material library lifecycle
      this.materialLibrary.updateMaterialLifecycle()

    } catch (error) {
// console.error(`🎼 Error generating composition for room ${roomId}:`, error)
    }
  }

  /**
   * Update room context (user count, etc.)
   * @param {string} roomId - Room ID
   * @param {Object} roomContext - Updated room context
   */
  updateRoomContext(roomId, roomContext) {
    const roomState = this.roomCompositions.get(roomId)
    if (roomState) {
      roomState.roomContext = { ...roomState.roomContext, ...roomContext }
// console.log(`🎼 Updated room context for ${roomId}:`, roomContext)
    }
  }

  /**
   * Get current composition state for a room
   * @param {string} roomId - Room ID
   * @returns {Object} Composition state
   */
  getCompositionState(roomId) {
    return this.roomCompositions.get(roomId) || null
  }

  /**
   * Get material library stats
   * @returns {Object} Stats
   */
  getMaterialStats() {
    return this.materialLibrary.getStats()
  }

  /**
   * Set musical key for a room
   * @param {string} roomId - Room ID
   * @param {string} key - Key (e.g., 'C', 'Am')
   * @param {string} mode - Mode (e.g., 'ionian', 'dorian')
   */
  setKey(roomId, key, mode = 'ionian') {
    this.materialLibrary.setKeyCenter(key, mode)
    this.harmonicEngine.setKeyCenter(key, mode)
    this.compositionEngine.keyCenter = key
    this.compositionEngine.mode = mode

    // SYNC: Update GestureToMusicService harmonic context
    this.syncHarmonicContext()

// console.log(`🎼 Set key for room ${roomId}: ${key} ${mode} (synced to gestures)`)
  }

  /**
   * Set tempo for a room
   * @param {string} roomId - Room ID
   * @param {number} tempo - Tempo in BPM
   */
  setTempo(roomId, tempo) {
    this.materialLibrary.setTempo(tempo)
    this.compositionEngine.tempo = tempo

// console.log(`🎼 Set tempo for room ${roomId}: ${tempo} BPM`)
  }

  /**
   * Get active room count
   * @returns {number} Number of active rooms
   */
  getActiveRoomCount() {
    return this.roomCompositions.size
  }

  /**
   * Cleanup inactive rooms
   * @param {number} inactivityThreshold - Inactivity threshold in milliseconds (default: 5 minutes)
   */
  cleanupInactiveRooms(inactivityThreshold = 300000) {
    const now = Date.now()

    for (const [roomId, roomState] of this.roomCompositions.entries()) {
      const inactiveTime = now - roomState.lastCompositionTime

      if (inactiveTime > inactivityThreshold) {
// console.log(`🎼 Cleaning up inactive room ${roomId} (inactive for ${(inactiveTime/1000).toFixed(0)}s)`)
        this.stopComposition(roomId)
      }
    }
  }
}

module.exports = BackgroundCompositionService
