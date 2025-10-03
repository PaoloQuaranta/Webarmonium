const MemoryState = require('../models/MemoryState')
const SoundPattern = require('../models/SoundPattern')

/**
 * EnvironmentalMemoryCoordinator Service
 * Orchestrates memory persistence, pattern evolution, and environmental adaptation
 * Constitutional requirement: Anonymous learning, 24-hour lifecycle management
 */
class EnvironmentalMemoryCoordinator {
  constructor() {
    this.memoryStates = new Map() // roomId -> MemoryState
    this.patternRegistry = new Map() // roomId -> Set<SoundPattern>
    this.adaptationEngine = new AdaptationEngine()
    this.memoryCleanupInterval = null
    this.startMemoryCleanup()
  }

  /**
   * Initialize memory state for a room
   * @param {string} roomId - Room ID
   * @returns {MemoryState} New memory state instance
   */
  initializeMemoryState(roomId) {
    if (!roomId) {
      throw new Error('Room ID is required')
    }

    if (this.memoryStates.has(roomId)) {
      throw new Error(`Memory state already exists for room ${roomId}`)
    }

    const memoryState = new MemoryState(roomId)
    this.memoryStates.set(roomId, memoryState)
    this.patternRegistry.set(roomId, new Set())

    return memoryState
  }

  /**
   * Get memory state for a room
   * @param {string} roomId - Room ID
   * @returns {MemoryState|null} Memory state or null if not found
   */
  getMemoryState(roomId) {
    return this.memoryStates.get(roomId) || null
  }

  /**
   * Process gesture and update environmental memory
   * @param {Gesture} gesture - Processed gesture with sonic parameters
   * @param {Object} roomContext - Current room context
   * @returns {Object} Memory update result
   */
  processGestureMemory(gesture, roomContext) {
    const memoryState = this.getMemoryState(gesture.roomId)
    if (!memoryState) {
      throw new Error(`No memory state found for room ${gesture.roomId}`)
    }

    if (memoryState.isExpired()) {
      return {
        success: false,
        reason: 'Memory state has expired',
        memoryExpired: true
      }
    }

    // Learn from gesture
    memoryState.learnFromGesture(gesture)

    // Generate or evolve sound patterns based on gesture
    const patternEvolution = this.evolveRoomPatterns(gesture, roomContext)

    // Update adaptation weights based on collaborative context
    if (roomContext.activeUsers > 1) {
      this.adaptationEngine.updateCollaborativeWeights(
        gesture.roomId,
        roomContext.activeUsers
      )
    }

    return {
      success: true,
      memoryUpdated: true,
      patternsEvolved: patternEvolution.patternsModified,
      newPatterns: patternEvolution.newPatterns,
      memoryPhase: memoryState.determineLearningPhase(),
      adaptationStrength: memoryState.calculateAdaptationStrength()
    }
  }

  /**
   * Evolve room sound patterns based on gesture input
   * @param {Gesture} gesture - Input gesture
   * @param {Object} roomContext - Room context data
   * @returns {Object} Pattern evolution result
   */
  evolveRoomPatterns(gesture, roomContext) {
    const roomPatterns = this.patternRegistry.get(gesture.roomId) || new Set()
    const memoryState = this.getMemoryState(gesture.roomId)

    let patternsModified = 0
    let newPatterns = 0

    // Determine if we should create new patterns or evolve existing ones
    const shouldCreateNewPattern = this.shouldCreateNewPattern(
      roomPatterns.size,
      gesture,
      memoryState
    )

    if (shouldCreateNewPattern) {
      // Create new pattern from gesture
      const newPattern = SoundPattern.fromGesture(gesture.roomId, gesture)
      roomPatterns.add(newPattern)
      newPatterns++

      // Limit pattern count for performance
      if (roomPatterns.size > 8) {
        this.pruneOldPatterns(roomPatterns)
      }
    }

    // Evolve existing patterns
    const influenceStrength = this.calculateInfluenceStrength(
      memoryState,
      roomContext
    )

    roomPatterns.forEach(pattern => {
      if (this.shouldPatternEvolve(pattern, gesture)) {
        pattern.evolveFromGesture(gesture, influenceStrength)
        patternsModified++
      }
    })

    // Update pattern registry
    this.patternRegistry.set(gesture.roomId, roomPatterns)

    return {
      patternsModified,
      newPatterns,
      totalPatterns: roomPatterns.size
    }
  }

  /**
   * Determine if new pattern should be created
   * @param {number} currentPatternCount - Current pattern count
   * @param {Gesture} gesture - Input gesture
   * @param {MemoryState} memoryState - Room memory state
   * @returns {boolean} True if new pattern should be created
   */
  shouldCreateNewPattern(currentPatternCount, gesture, memoryState) {
    // Always create first pattern
    if (currentPatternCount === 0) {
      return true
    }

    // Limit patterns during initial phase
    if (memoryState.determineLearningPhase() === 'initial' && currentPatternCount >= 2) {
      return false
    }

    // Create patterns for high-intensity gestures
    if (gesture.intensity > 0.8 && currentPatternCount < 4) {
      return true
    }

    // Create patterns for new gesture types
    const existingPatterns = this.patternRegistry.get(gesture.roomId)
    const hasPatternForType = Array.from(existingPatterns).some(pattern =>
      this.isPatternCompatibleWithGesture(pattern, gesture)
    )

    if (!hasPatternForType && currentPatternCount < 6) {
      return true
    }

    // Probabilistic creation for mature memory states
    if (memoryState.determineLearningPhase() === 'mature') {
      return Math.random() < 0.1 // 10% chance
    }

    return false
  }

  /**
   * Check if pattern is compatible with gesture type
   * @param {SoundPattern} pattern - Sound pattern
   * @param {Gesture} gesture - Input gesture
   * @returns {boolean} True if compatible
   */
  isPatternCompatibleWithGesture(pattern, gesture) {
    const gestureCharacteristics = this.analyzeGestureCharacteristics(gesture)

    // Ambient patterns work with slow, smooth gestures
    if (pattern.type === 'ambient' && gestureCharacteristics.smooth) {
      return true
    }

    // Rhythmic patterns work with quick, intense gestures
    if (pattern.type === 'rhythmic' && gestureCharacteristics.rhythmic) {
      return true
    }

    // Harmonic patterns work with melodic gestures
    if (pattern.type === 'harmonic' && gestureCharacteristics.melodic) {
      return true
    }

    // Textural patterns work with gyroscope input
    if (pattern.type === 'textural' && gesture.type === 'gyroscope') {
      return true
    }

    return false
  }

  /**
   * Analyze gesture characteristics for pattern matching
   * @param {Gesture} gesture - Input gesture
   * @returns {Object} Gesture characteristics
   */
  analyzeGestureCharacteristics(gesture) {
    return {
      smooth: gesture.intensity < 0.5 && gesture.type !== 'touch',
      rhythmic: gesture.intensity > 0.7 || gesture.type === 'touch',
      melodic: gesture.coordinates.x > 0.3 && gesture.coordinates.x < 0.7,
      intense: gesture.intensity > 0.8,
      spatial: gesture.coordinates.z !== undefined
    }
  }

  /**
   * Calculate influence strength for pattern evolution
   * @param {MemoryState} memoryState - Room memory state
   * @param {Object} roomContext - Room context
   * @returns {number} Influence strength (0.0-1.0)
   */
  calculateInfluenceStrength(memoryState, roomContext) {
    let baseStrength = memoryState.adaptationWeights.gestureInfluence

    // Boost for collaborative sessions
    if (roomContext.activeUsers > 1) {
      baseStrength += memoryState.adaptationWeights.collaborativeBoost
    }

    // Adjust based on learning phase
    const learningPhase = memoryState.determineLearningPhase()
    switch (learningPhase) {
      case 'initial':
        baseStrength *= 1.5 // Learn quickly initially
        break
      case 'mature':
        baseStrength *= 0.8 // Slower adaptation when mature
        break
    }

    return Math.min(1.0, baseStrength)
  }

  /**
   * Determine if pattern should evolve from gesture
   * @param {SoundPattern} pattern - Sound pattern
   * @param {Gesture} gesture - Input gesture
   * @returns {boolean} True if pattern should evolve
   */
  shouldPatternEvolve(pattern, gesture) {
    // Don't evolve expired patterns
    if (pattern.shouldExpire()) {
      return false
    }

    // Always evolve active and evolving patterns
    if (pattern.state === 'active' || pattern.state === 'evolving') {
      return true
    }

    // Evolve dormant patterns occasionally
    if (pattern.state === 'dormant') {
      return Math.random() < 0.3 // 30% chance
    }

    // Emerging patterns evolve based on gesture intensity
    if (pattern.state === 'emerging') {
      return gesture.intensity > 0.3
    }

    return false
  }

  /**
   * Prune old or expired patterns
   * @param {Set} patterns - Set of sound patterns
   */
  pruneOldPatterns(patterns) {
    const patternArray = Array.from(patterns)
    const expiredPatterns = patternArray.filter(p => p.shouldExpire())

    // Remove expired patterns first
    expiredPatterns.forEach(pattern => patterns.delete(pattern))

    // If still too many patterns, remove oldest dormant patterns
    if (patterns.size > 8) {
      const dormantPatterns = patternArray
        .filter(p => p.state === 'dormant')
        .sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime())

      const toRemove = patterns.size - 6 // Keep 6 patterns
      for (let i = 0; i < toRemove && i < dormantPatterns.length; i++) {
        patterns.delete(dormantPatterns[i])
      }
    }
  }

  /**
   * Generate sonic update for room
   * @param {string} roomId - Room ID
   * @returns {Object} Sonic update data
   */
  generateSonicUpdate(roomId) {
    const memoryState = this.getMemoryState(roomId)
    const patterns = Array.from(this.patternRegistry.get(roomId) || [])

    if (!memoryState || memoryState.isExpired()) {
      return {
        roomId,
        patterns: [],
        memoryInfluence: 0,
        adaptationStrength: 0,
        timestamp: Date.now()
      }
    }

    // Filter active patterns only
    const activePatterns = patterns.filter(p =>
      p.state === 'active' || p.state === 'evolving'
    )

    const memoryInfluence = memoryState.getInfluence()

    return {
      roomId,
      patterns: activePatterns.map(p => p.toSonicUpdate()),
      memoryInfluence: memoryInfluence.adaptationStrength,
      roomPersonality: memoryInfluence.roomPersonality,
      patternCount: activePatterns.length,
      memoryPhase: memoryState.determineLearningPhase(),
      timestamp: Date.now()
    }
  }

  /**
   * Set memory expiration for room
   * @param {string} roomId - Room ID
   * @param {Date} expirationTime - Expiration timestamp
   */
  setMemoryExpiration(roomId, expirationTime) {
    const memoryState = this.getMemoryState(roomId)
    if (memoryState) {
      memoryState.setExpiration(expirationTime)
    }
  }

  /**
   * Get room patterns for analysis
   * @param {string} roomId - Room ID
   * @returns {SoundPattern[]} Array of room patterns
   */
  getRoomPatterns(roomId) {
    const patterns = this.patternRegistry.get(roomId)
    return patterns ? Array.from(patterns) : []
  }

  /**
   * Start periodic memory cleanup process
   */
  startMemoryCleanup() {
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval)
    }

    // Run cleanup every 10 minutes
    this.memoryCleanupInterval = setInterval(() => {
      this.performMemoryCleanup()
    }, 10 * 60 * 1000)
  }

  /**
   * Perform memory cleanup
   * @returns {Object} Cleanup statistics
   */
  performMemoryCleanup() {
    let expiredMemories = 0
    let expiredPatterns = 0
    let cleanedRooms = 0

    const roomsToDelete = []

    this.memoryStates.forEach((memoryState, roomId) => {
      if (memoryState.isExpired()) {
        roomsToDelete.push(roomId)
        expiredMemories++

        // Clean up patterns for expired memory
        const patterns = this.patternRegistry.get(roomId)
        if (patterns) {
          expiredPatterns += patterns.size
        }
      } else {
        // Clean up expired patterns in active rooms
        const patterns = this.patternRegistry.get(roomId)
        if (patterns) {
          const expiredRoomPatterns = Array.from(patterns)
            .filter(p => p.shouldExpire())

          expiredRoomPatterns.forEach(pattern => {
            patterns.delete(pattern)
            expiredPatterns++
          })
        }
      }
    })

    // Delete expired memory states and patterns
    roomsToDelete.forEach(roomId => {
      this.memoryStates.delete(roomId)
      this.patternRegistry.delete(roomId)
      cleanedRooms++
    })

    return {
      expiredMemories,
      expiredPatterns,
      cleanedRooms,
      activeMemories: this.memoryStates.size
    }
  }

  /**
   * Stop memory cleanup process
   */
  stopMemoryCleanup() {
    if (this.memoryCleanupInterval) {
      clearInterval(this.memoryCleanupInterval)
      this.memoryCleanupInterval = null
    }
  }

  /**
   * Get memory coordinator statistics
   * @returns {Object} Coordinator statistics
   */
  getCoordinatorStats() {
    const memoryStats = Array.from(this.memoryStates.values()).map(ms => ({
      patternCount: ms.gesturePatterns.length,
      userCount: ms.userInfluences.size,
      adaptationStrength: ms.calculateAdaptationStrength(),
      learningPhase: ms.determineLearningPhase()
    }))

    const totalPatterns = Array.from(this.patternRegistry.values())
      .reduce((sum, patterns) => sum + patterns.size, 0)

    return {
      totalMemoryStates: this.memoryStates.size,
      totalPatterns,
      memoryPhaseDistribution: this.calculatePhaseDistribution(memoryStats),
      averageAdaptationStrength: memoryStats.length > 0 ?
        memoryStats.reduce((sum, ms) => sum + ms.adaptationStrength, 0) / memoryStats.length : 0
    }
  }

  /**
   * Calculate learning phase distribution
   * @param {Array} memoryStats - Array of memory statistics
   * @returns {Object} Phase distribution
   */
  calculatePhaseDistribution(memoryStats) {
    const distribution = {
      initial: 0,
      learning: 0,
      developing: 0,
      collaborative: 0,
      mature: 0
    }

    memoryStats.forEach(stats => {
      if (distribution[stats.learningPhase] !== undefined) {
        distribution[stats.learningPhase]++
      }
    })

    return distribution
  }

  /**
   * Validate coordinator state
   * Constitutional requirement: Ensure memory integrity
   * @throws {Error} If coordinator state is invalid
   */
  validateCoordinatorState() {
    // Validate memory states
    this.memoryStates.forEach((memoryState, roomId) => {
      try {
        memoryState.validateState()
      } catch (error) {
        throw new Error(`Memory state validation failed for room ${roomId}: ${error.message}`)
      }
    })

    // Validate pattern registry consistency
    this.patternRegistry.forEach((patterns, roomId) => {
      if (!this.memoryStates.has(roomId)) {
        throw new Error(`Pattern registry exists for room ${roomId} without memory state`)
      }

      patterns.forEach(pattern => {
        if (pattern.roomId !== roomId) {
          throw new Error(`Pattern room mismatch: expected ${roomId}, got ${pattern.roomId}`)
        }

        try {
          pattern.validateForSonicProcessing()
        } catch (error) {
          throw new Error(`Pattern validation failed: ${error.message}`)
        }
      })
    })
  }

  /**
   * Shutdown coordinator gracefully
   */
  shutdown() {
    this.stopMemoryCleanup()
    this.memoryStates.clear()
    this.patternRegistry.clear()
  }
}

/**
 * Adaptation Engine for managing environmental adaptation algorithms
 */
class AdaptationEngine {
  constructor() {
    this.collaborativeWeights = new Map() // roomId -> weight
    this.adaptationHistory = new Map() // roomId -> history array
  }

  /**
   * Update collaborative weights for a room
   * @param {string} roomId - Room ID
   * @param {number} userCount - Active user count
   */
  updateCollaborativeWeights(roomId, userCount) {
    const baseWeight = 0.2
    const collaborativeWeight = Math.min(0.6, baseWeight * userCount)

    this.collaborativeWeights.set(roomId, collaborativeWeight)

    // Track adaptation history
    const history = this.adaptationHistory.get(roomId) || []
    history.push({
      timestamp: Date.now(),
      userCount,
      weight: collaborativeWeight
    })

    // Limit history size
    if (history.length > 100) {
      history.splice(0, 50)
    }

    this.adaptationHistory.set(roomId, history)
  }

  /**
   * Get collaborative weight for room
   * @param {string} roomId - Room ID
   * @returns {number} Collaborative weight
   */
  getCollaborativeWeight(roomId) {
    return this.collaborativeWeights.get(roomId) || 0.2
  }

  /**
   * Clean up adaptation data for expired rooms
   * @param {string[]} expiredRoomIds - Array of expired room IDs
   */
  cleanup(expiredRoomIds) {
    expiredRoomIds.forEach(roomId => {
      this.collaborativeWeights.delete(roomId)
      this.adaptationHistory.delete(roomId)
    })
  }
}

module.exports = EnvironmentalMemoryCoordinator