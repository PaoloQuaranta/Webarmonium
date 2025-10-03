/**
 * MemoryState Model
 * Accumulated learning data that influences room's sonic evolution
 * Constitutional requirement: 24-hour retention, anonymous learning
 */
class MemoryState {
  constructor(roomId) {
    this.roomId = roomId
    this.gesturePatterns = []
    this.sonicEvolution = {
      preferredFrequencies: [],
      preferredAmplitudes: [],
      dominantTypes: new Map(), // gesture type -> count
      rhythmPatterns: [],
      harmonicPreferences: []
    }
    this.userInfluences = new Map() // anonymous user tracking
    this.adaptationWeights = {
      gestureInfluence: 0.3,
      temporalDecay: 0.1,
      collaborativeBoost: 0.2,
      diversityFactor: 0.4
    }
    this.createdAt = new Date()
    this.lastUpdate = new Date()
    this.expiresAt = null // Set when room becomes empty
    this.learningMetrics = {
      totalGestures: 0,
      uniqueUsers: 0,
      adaptationEvents: 0,
      evolutionPhases: []
    }
  }

  /**
   * Learn from a gesture and update memory patterns
   * @param {Gesture} gesture - Gesture to learn from
   */
  learnFromGesture(gesture) {
    if (!gesture || !gesture.sonicParams) {
      throw new Error('Gesture with sonic parameters required for learning')
    }

    // Update learning metrics
    this.learningMetrics.totalGestures++
    this.trackAnonymousUser(gesture.userId)

    // Extract patterns from gesture
    const pattern = this.extractGesturePattern(gesture)
    this.gesturePatterns.push(pattern)

    // Update sonic evolution preferences
    this.updateSonicEvolution(gesture)

    // Apply temporal decay to older patterns
    this.applyTemporalDecay()

    // Update adaptation weights based on activity
    this.updateAdaptationWeights()

    this.lastUpdate = new Date()
    this.learningMetrics.adaptationEvents++

    // Limit pattern history size for performance
    if (this.gesturePatterns.length > 1000) {
      this.gesturePatterns = this.gesturePatterns.slice(-500)
    }
  }

  /**
   * Track anonymous user activity for collaborative patterns
   * Constitutional requirement: No personal identification data
   * @param {string} userId - Session-only user ID
   */
  trackAnonymousUser(userId) {
    if (!this.userInfluences.has(userId)) {
      this.userInfluences.set(userId, {
        gestureCount: 0,
        firstSeen: new Date(),
        lastSeen: new Date(),
        preferredTypes: new Map(),
        contributionWeight: 0
      })
      this.learningMetrics.uniqueUsers++
    }

    const userData = this.userInfluences.get(userId)
    userData.gestureCount++
    userData.lastSeen = new Date()

    // Calculate contribution weight (more active users have higher weight)
    userData.contributionWeight = Math.min(1.0, userData.gestureCount / 100)

    // Clean up old user data (older than 1 hour)
    this.cleanupOldUserData()
  }

  /**
   * Extract learnable patterns from gesture
   * @param {Gesture} gesture - Source gesture
   * @returns {Object} Extracted pattern data
   */
  extractGesturePattern(gesture) {
    const pattern = {
      timestamp: gesture.timestamp,
      type: gesture.type,
      coordinates: { ...gesture.coordinates },
      intensity: gesture.intensity,
      sonicParams: { ...gesture.sonicParams },
      userId: gesture.userId, // Anonymous session ID
      sequenceContext: this.getSequenceContext(gesture)
    }

    // Add collaborative context if multiple users active
    if (this.userInfluences.size > 1) {
      pattern.collaborativeContext = {
        activeUsers: this.userInfluences.size,
        isCollaborative: true
      }
    }

    return pattern
  }

  /**
   * Get sequence context for pattern recognition
   * @param {Gesture} gesture - Current gesture
   * @returns {Object} Sequence context data
   */
  getSequenceContext(gesture) {
    const recentPatterns = this.gesturePatterns.slice(-10) // Last 10 gestures

    if (recentPatterns.length === 0) {
      return { position: 'initial', precedingTypes: [] }
    }

    const precedingTypes = recentPatterns.map(p => p.type)
    const timeSinceLastGesture = gesture.timestamp.getTime() -
                                recentPatterns[recentPatterns.length - 1].timestamp.getTime()

    return {
      position: timeSinceLastGesture < 1000 ? 'sequence' : 'isolated',
      precedingTypes,
      timeSinceLastGesture,
      isRapidSequence: timeSinceLastGesture < 500
    }
  }

  /**
   * Update sonic evolution preferences based on gesture
   * @param {Gesture} gesture - Learning gesture
   */
  updateSonicEvolution(gesture) {
    const params = gesture.sonicParams

    // Track frequency preferences
    this.sonicEvolution.preferredFrequencies.push({
      frequency: params.frequency || 440,
      intensity: gesture.intensity,
      timestamp: gesture.timestamp
    })

    // Track amplitude preferences
    this.sonicEvolution.preferredAmplitudes.push({
      amplitude: params.amplitude || 0.5,
      gestureType: gesture.type,
      timestamp: gesture.timestamp
    })

    // Update dominant gesture types
    const currentCount = this.sonicEvolution.dominantTypes.get(gesture.type) || 0
    this.sonicEvolution.dominantTypes.set(gesture.type, currentCount + 1)

    // Detect rhythm patterns for rhythmic gestures
    if (gesture.type === 'touch' || gesture.intensity > 0.7) {
      this.updateRhythmPatterns(gesture)
    }

    // Detect harmonic preferences
    if (params.frequency) {
      this.updateHarmonicPreferences(params.frequency, gesture.intensity)
    }

    // Limit evolution data size
    this.limitEvolutionDataSize()
  }

  /**
   * Update rhythm pattern detection
   * @param {Gesture} gesture - Rhythmic gesture
   */
  updateRhythmPatterns(gesture) {
    const recentRhythmic = this.gesturePatterns
      .filter(p => p.timestamp.getTime() > Date.now() - 10000) // Last 10 seconds
      .filter(p => p.type === 'touch' || p.intensity > 0.7)

    if (recentRhythmic.length >= 3) {
      // Calculate intervals between rhythmic gestures
      const intervals = []
      for (let i = 1; i < recentRhythmic.length; i++) {
        intervals.push(
          recentRhythmic[i].timestamp.getTime() -
          recentRhythmic[i-1].timestamp.getTime()
        )
      }

      // Detect regular patterns
      const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length
      const variance = intervals.reduce((acc, interval) =>
        acc + Math.pow(interval - avgInterval, 2), 0) / intervals.length

      if (variance < 50000) { // Low variance indicates regular rhythm
        this.sonicEvolution.rhythmPatterns.push({
          interval: avgInterval,
          confidence: 1 - (variance / 100000),
          detectedAt: new Date(),
          gestureCount: recentRhythmic.length
        })
      }
    }
  }

  /**
   * Update harmonic preference detection
   * @param {number} frequency - Gesture frequency
   * @param {number} intensity - Gesture intensity
   */
  updateHarmonicPreferences(frequency, intensity) {
    // Find nearest musical note for harmonic analysis
    const A4 = 440
    const semitoneRatio = Math.pow(2, 1/12)
    const semitonesFromA4 = Math.round(12 * Math.log2(frequency / A4))
    const nearestNote = A4 * Math.pow(semitoneRatio, semitonesFromA4)

    this.sonicEvolution.harmonicPreferences.push({
      frequency,
      nearestNote,
      semitonesFromA4,
      intensity,
      timestamp: new Date()
    })
  }

  /**
   * Apply temporal decay to reduce influence of old patterns
   */
  applyTemporalDecay() {
    const decayRate = this.adaptationWeights.temporalDecay
    const now = Date.now()

    this.gesturePatterns.forEach(pattern => {
      const ageHours = (now - pattern.timestamp.getTime()) / (1000 * 60 * 60)
      pattern.weight = Math.exp(-decayRate * ageHours)
    })

    // Remove heavily decayed patterns
    this.gesturePatterns = this.gesturePatterns.filter(p => p.weight > 0.01)
  }

  /**
   * Update adaptation weights based on current activity
   */
  updateAdaptationWeights() {
    const recentActivity = this.gesturePatterns.filter(p => {
      const ageMs = Date.now() - p.timestamp.getTime()
      return ageMs < 60000 // Last minute
    }).length

    // Increase responsiveness during high activity
    if (recentActivity > 10) {
      this.adaptationWeights.gestureInfluence = Math.min(0.5,
        this.adaptationWeights.gestureInfluence * 1.1)
    } else {
      this.adaptationWeights.gestureInfluence = Math.max(0.1,
        this.adaptationWeights.gestureInfluence * 0.95)
    }

    // Boost collaborative adaptation when multiple users active
    if (this.userInfluences.size > 1) {
      this.adaptationWeights.collaborativeBoost = Math.min(0.4,
        0.1 * this.userInfluences.size)
    }
  }

  /**
   * Clean up old anonymous user data
   */
  cleanupOldUserData() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000)

    for (const [userId, userData] of this.userInfluences.entries()) {
      if (userData.lastSeen.getTime() < oneHourAgo) {
        this.userInfluences.delete(userId)
      }
    }
  }

  /**
   * Limit evolution data size for performance
   */
  limitEvolutionDataSize() {
    const maxSize = 500

    if (this.sonicEvolution.preferredFrequencies.length > maxSize) {
      this.sonicEvolution.preferredFrequencies =
        this.sonicEvolution.preferredFrequencies.slice(-maxSize/2)
    }

    if (this.sonicEvolution.preferredAmplitudes.length > maxSize) {
      this.sonicEvolution.preferredAmplitudes =
        this.sonicEvolution.preferredAmplitudes.slice(-maxSize/2)
    }

    if (this.sonicEvolution.rhythmPatterns.length > 100) {
      this.sonicEvolution.rhythmPatterns =
        this.sonicEvolution.rhythmPatterns.slice(-50)
    }

    if (this.sonicEvolution.harmonicPreferences.length > maxSize) {
      this.sonicEvolution.harmonicPreferences =
        this.sonicEvolution.harmonicPreferences.slice(-maxSize/2)
    }
  }

  /**
   * Set expiration timestamp
   * Constitutional requirement: 24-hour retention after room empty
   * @param {Date} expirationTime - When memory should expire
   */
  setExpiration(expirationTime) {
    if (!(expirationTime instanceof Date)) {
      throw new Error('Expiration time must be a Date object')
    }

    this.expiresAt = expirationTime
  }

  /**
   * Check if memory state is expired
   * @returns {boolean} True if memory has expired
   */
  isExpired() {
    if (!this.expiresAt) {
      return false
    }

    return Date.now() > this.expiresAt.getTime()
  }

  /**
   * Get memory influence for new users
   * @returns {Object} Memory influence data
   */
  getInfluence() {
    if (this.isExpired()) {
      return {
        patterns: [],
        adaptationStrength: 0.0,
        roomPersonality: {}
      }
    }

    const roomPersonality = this.generateRoomPersonality()
    const adaptationStrength = this.calculateAdaptationStrength()

    return {
      patterns: this.getInfluentialPatterns(),
      adaptationStrength,
      roomPersonality
    }
  }

  /**
   * Generate room personality summary
   * @returns {Object} Room personality data
   */
  generateRoomPersonality() {
    const dominantTypes = Array.from(this.sonicEvolution.dominantTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)

    const avgFrequency = this.sonicEvolution.preferredFrequencies.length > 0 ?
      this.sonicEvolution.preferredFrequencies.reduce((sum, f) => sum + f.frequency, 0) /
      this.sonicEvolution.preferredFrequencies.length : 440

    const avgAmplitude = this.sonicEvolution.preferredAmplitudes.length > 0 ?
      this.sonicEvolution.preferredAmplitudes.reduce((sum, a) => sum + a.amplitude, 0) /
      this.sonicEvolution.preferredAmplitudes.length : 0.5

    return {
      dominantGestureTypes: dominantTypes.map(([type, count]) => ({ type, count })),
      preferredFrequencyRange: [avgFrequency * 0.8, avgFrequency * 1.2],
      preferredAmplitudeRange: [avgAmplitude * 0.7, avgAmplitude * 1.3],
      collaborativeActivity: this.userInfluences.size,
      rhythmComplexity: this.sonicEvolution.rhythmPatterns.length,
      harmonicRichness: this.sonicEvolution.harmonicPreferences.length,
      memoryAge: Date.now() - this.createdAt.getTime(),
      learningPhase: this.determineLearningPhase()
    }
  }

  /**
   * Calculate current adaptation strength
   * @returns {number} Adaptation strength (0.0-1.0)
   */
  calculateAdaptationStrength() {
    const patternCount = this.gesturePatterns.length
    const userCount = this.userInfluences.size
    const recentActivity = this.gesturePatterns.filter(p => {
      const ageMs = Date.now() - p.timestamp.getTime()
      return ageMs < 300000 // Last 5 minutes
    }).length

    // Base strength from pattern accumulation
    let strength = Math.min(0.8, patternCount / 100)

    // Boost from collaborative activity
    if (userCount > 1) {
      strength += this.adaptationWeights.collaborativeBoost
    }

    // Boost from recent activity
    strength += Math.min(0.2, recentActivity / 20)

    return Math.min(1.0, strength)
  }

  /**
   * Get influential patterns for sonic generation
   * @returns {Array} Array of influential patterns
   */
  getInfluentialPatterns() {
    return this.gesturePatterns
      .filter(p => (p.weight || 1) > 0.1)
      .sort((a, b) => (b.weight || 1) - (a.weight || 1))
      .slice(0, 20)
      .map(p => ({
        type: p.type,
        sonicParams: p.sonicParams,
        weight: p.weight || 1,
        isCollaborative: p.collaborativeContext?.isCollaborative || false
      }))
  }

  /**
   * Determine current learning phase
   * @returns {string} Learning phase
   */
  determineLearningPhase() {
    const patternCount = this.gesturePatterns.length
    const userCount = this.userInfluences.size

    if (patternCount < 10) return 'initial'
    if (patternCount < 50) return 'learning'
    if (userCount > 2) return 'collaborative'
    if (patternCount > 200) return 'mature'
    return 'developing'
  }

  /**
   * Get memory state summary for debugging
   * @returns {Object} Memory state summary
   */
  getSummary() {
    return {
      roomId: this.roomId,
      patternCount: this.gesturePatterns.length,
      userCount: this.userInfluences.size,
      adaptationStrength: this.calculateAdaptationStrength(),
      learningPhase: this.determineLearningPhase(),
      createdAt: this.createdAt.toISOString(),
      lastUpdate: this.lastUpdate.toISOString(),
      expiresAt: this.expiresAt?.toISOString() || null,
      isExpired: this.isExpired(),
      metrics: this.learningMetrics
    }
  }

  /**
   * Validate memory state for processing
   * Constitutional requirement: Ensure memory state integrity
   * @throws {Error} If memory state is invalid
   */
  validateState() {
    if (!this.roomId) {
      throw new Error('Room ID is required')
    }

    if (!this.createdAt) {
      throw new Error('Creation timestamp is required')
    }

    if (this.gesturePatterns.some(p => !p.timestamp || !p.type)) {
      throw new Error('All gesture patterns must have timestamp and type')
    }

    if (this.adaptationWeights.gestureInfluence < 0 || this.adaptationWeights.gestureInfluence > 1) {
      throw new Error('Adaptation weights must be in range 0.0-1.0')
    }

    // Validate expiration if set
    if (this.expiresAt && this.expiresAt <= this.createdAt) {
      throw new Error('Expiration time must be after creation time')
    }
  }
}

module.exports = MemoryState