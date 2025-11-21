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

    console.log('🎼 BackgroundCompositionService initialized')
  }

  /**
   * Set Socket.IO instance for broadcasting
   * @param {SocketIO} io - Socket.IO instance
   */
  setSocketIO(io) {
    this.io = io
    console.log('🎼 BackgroundCompositionService: Socket.IO connected')
  }

  /**
   * Start continuous composition for a room
   * @param {string} roomId - Room ID
   * @param {Object} roomContext - Room context (userCount, etc.)
   */
  startComposition(roomId, roomContext = {}) {
    if (this.compositionTimers.has(roomId)) {
      console.log(`🎼 Composition already running for room ${roomId}`)
      return
    }

    console.log(`🎼 Starting continuous composition for room ${roomId}`)

    // Initialize room composition state
    this.roomCompositions.set(roomId, {
      roomId,
      roomContext,
      compositionCount: 0,
      startTime: Date.now(),
      lastCompositionTime: Date.now()
    })

    // Start immediate composition
    this.generateAndBroadcastComposition(roomId, roomContext)

    // Schedule continuous compositions
    this.scheduleNextComposition(roomId, roomContext)
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
      console.log(`🎼 Stopped composition for room ${roomId}`)
    }
  }

  /**
   * Add material from user gesture
   * @param {string} roomId - Room ID
   * @param {Object} gestureData - Gesture data
   * @param {Object} musicalPhrase - Musical phrase generated from gesture
   */
  addMaterial(roomId, gestureData, musicalPhrase) {
    // Convert musical phrase to material format
    const material = {
      notes: musicalPhrase.notes || [],
      duration: musicalPhrase.duration || 1000,
      userId: gestureData.userId,
      gestureData: gestureData,
      timestamp: Date.now()
    }

    // Add to material library
    const materialId = this.materialLibrary.addMaterial(material)

    // Update style analyzer
    this.styleAnalyzer.analyzeGestureStyle([gestureData])

    console.log(`🎼 Added material ${materialId} from user ${gestureData.userId}:`, {
      notesCount: material.notes.length,
      hasPhraseNotes: !!musicalPhrase.notes,
      phraseType: musicalPhrase.type || 'unknown'
    })

    return materialId
  }

  /**
   * Schedule next composition
   * @param {string} roomId - Room ID
   * @param {Object} roomContext - Room context
   */
  scheduleNextComposition(roomId, roomContext) {
    // Calculate next composition interval
    // Use shorter intervals with more users (more activity)
    const userCount = roomContext.userCount || 1
    const baseInterval = this.minCompositionInterval
    const maxInterval = this.maxCompositionInterval

    // More users = shorter intervals (more frequent compositions)
    const intervalRange = maxInterval - baseInterval
    const userFactor = Math.max(0, 1 - (userCount - 1) * 0.2) // Decrease by 20% per additional user
    const interval = baseInterval + (intervalRange * userFactor)

    const timer = setTimeout(() => {
      this.generateAndBroadcastComposition(roomId, roomContext)
      this.scheduleNextComposition(roomId, roomContext)
    }, interval)

    this.compositionTimers.set(roomId, timer)

    console.log(`🎼 Next composition for room ${roomId} scheduled in ${(interval/1000).toFixed(1)}s`)
  }

  /**
   * Generate and broadcast composition
   * @param {string} roomId - Room ID
   * @param {Object} roomContext - Room context
   */
  async generateAndBroadcastComposition(roomId, roomContext) {
    try {
      console.log(`🎼 Generating composition for room ${roomId}`)

      // Get room state
      const roomState = this.roomCompositions.get(roomId)
      if (!roomState) {
        console.log(`🎼 No room state for ${roomId}, skipping composition`)
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

      console.log(`🎼 Generated ${composition.type} composition:`, {
        form: composition.structure.form,
        section: composition.structure.currentSection,
        tempo: composition.metadata.tempo,
        keyCenter: composition.metadata.keyCenter
      })

      // Log composition details
      if (composition.content.voices) {
        console.log(`🎼   ${composition.content.voices.length} voices (polyphonic)`)
      } else if (composition.content.melody) {
        console.log(`🎼   Melody + accompaniment (homophonic)`)
        if (composition.content.accompaniment) {
          console.log(`🎼   Accompaniment type: ${composition.content.accompaniment.type}`)
        }
      } else if (composition.content.texture) {
        console.log(`🎼   Ambient texture`)
      }

      // Broadcast composition to room
      if (this.io) {
        this.io.to(roomId).emit('background-composition', {
          roomId,
          composition,
          compositionNumber: roomState.compositionCount,
          timestamp: Date.now()
        })

        console.log(`🎼 Broadcast composition #${roomState.compositionCount} to room ${roomId}`)
      } else {
        console.log(`🎼 No Socket.IO instance, composition not broadcast`)
      }

      // Update material library lifecycle
      this.materialLibrary.updateMaterialLifecycle()

    } catch (error) {
      console.error(`🎼 Error generating composition for room ${roomId}:`, error)
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
      console.log(`🎼 Updated room context for ${roomId}:`, roomContext)
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

    console.log(`🎼 Set key for room ${roomId}: ${key} ${mode}`)
  }

  /**
   * Set tempo for a room
   * @param {string} roomId - Room ID
   * @param {number} tempo - Tempo in BPM
   */
  setTempo(roomId, tempo) {
    this.materialLibrary.setTempo(tempo)
    this.compositionEngine.tempo = tempo

    console.log(`🎼 Set tempo for room ${roomId}: ${tempo} BPM`)
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
        console.log(`🎼 Cleaning up inactive room ${roomId} (inactive for ${(inactiveTime/1000).toFixed(0)}s)`)
        this.stopComposition(roomId)
      }
    }
  }
}

module.exports = BackgroundCompositionService
