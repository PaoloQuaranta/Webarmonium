/**
 * GestureStateMachine.js
 * Manages gesture state transitions and tracking
 * Phase 3 refactoring - Decomposed from EnhancedGestureCapture.js
 */
class GestureStateMachine {
  constructor() {
    // Gesture tracker state
    this.gestureTracker = {
      startPosition: null,
      currentPosition: null,
      velocity: { x: 0, y: 0 },
      acceleration: { x: 0, y: 0 },
      path: [],
      startTime: null,
      lastUpdateTime: null
    }

    // Sustained hold state
    const holdConfig = window.GestureConstants?.HOLD_CONFIG || {
      holdThreshold: 100,
      overlapDuration: 200
    }

    this.sustainedHold = {
      isActive: false,
      startTime: 0,
      holdThreshold: holdConfig.holdThreshold,
      activeNoteId: null,
      startPosition: null,
      holdTimer: null,
      transitionTimer: null,
      overlapDuration: holdConfig.overlapDuration
    }

    // Musical context
    const defaultTempo = window.MusicalConstants?.DEFAULT_TEMPO || 120

    this.musicalContext = {
      lastGestureTime: 0,
      gestureFrequency: 0,
      currentTempo: defaultTempo,
      currentScale: 'pentatonic'
    }
  }

  /**
   * Reset gesture tracker for new gesture
   * @param {Object} coordinates - Starting coordinates
   */
  resetTracker(coordinates) {
    const now = Date.now()
    this.gestureTracker = {
      startPosition: coordinates,
      currentPosition: coordinates,
      velocity: { x: 0, y: 0 },
      acceleration: { x: 0, y: 0 },
      path: [coordinates],
      startTime: now,
      lastUpdateTime: now
    }
  }

  /**
   * Update tracker with new position
   * @param {Object} coordinates - Current coordinates
   * @returns {Object} Update data { deltaTime, velocity, acceleration, distance }
   */
  updateTracker(coordinates) {
    const now = Date.now()
    const deltaTime = now - this.gestureTracker.lastUpdateTime

    if (deltaTime <= 0) {
      return null
    }

    // Calculate deltas
    const deltaX = coordinates.x - this.gestureTracker.currentPosition.x
    const deltaY = coordinates.y - this.gestureTracker.currentPosition.y
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

    // Calculate velocity (normalized units per second)
    const newVelocity = {
      x: deltaX / deltaTime * 1000,
      y: deltaY / deltaTime * 1000
    }

    // Calculate acceleration
    const acceleration = {
      x: (newVelocity.x - this.gestureTracker.velocity.x) / deltaTime * 1000,
      y: (newVelocity.y - this.gestureTracker.velocity.y) / deltaTime * 1000
    }

    // Update tracker state
    this.gestureTracker.currentPosition = coordinates
    this.gestureTracker.velocity = newVelocity
    this.gestureTracker.acceleration = acceleration
    this.gestureTracker.path.push(coordinates)
    this.gestureTracker.lastUpdateTime = now

    return {
      deltaTime,
      velocity: newVelocity,
      acceleration,
      distance
    }
  }

  /**
   * Start sustained hold detection
   * @param {Object} coordinates - Hold position
   * @param {Function} onHoldStart - Callback when hold activates
   */
  startHoldDetection(coordinates, onHoldStart) {
    this.sustainedHold.holdTimer = setTimeout(() => {
      // Generate note ID for sustained hold
      this.sustainedHold.isActive = true
      this.sustainedHold.startTime = Date.now()
      this.sustainedHold.activeNoteId = `hold-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      this.sustainedHold.startPosition = coordinates

      if (onHoldStart) {
        onHoldStart({
          position: coordinates,
          noteId: this.sustainedHold.activeNoteId,
          timestamp: Date.now()
        })
      }

      // console.log(`GestureStateMachine: Sustained hold started: ${this.sustainedHold.activeNoteId}`)
    }, this.sustainedHold.holdThreshold)
  }

  /**
   * Cancel hold detection timer
   */
  cancelHoldDetection() {
    if (this.sustainedHold.holdTimer) {
      clearTimeout(this.sustainedHold.holdTimer)
      this.sustainedHold.holdTimer = null
      // console.log('GestureStateMachine: Hold timer cancelled')
    }
  }

  /**
   * End sustained hold
   * @param {Function} onHoldEnd - Callback when hold ends
   * @param {string} reason - Reason for ending ('release', 'interrupted-by-movement')
   */
  endSustainedHold(onHoldEnd, reason = 'release') {
    if (!this.sustainedHold.isActive) {
      return
    }

    const holdDuration = Date.now() - this.sustainedHold.startTime

    if (onHoldEnd) {
      onHoldEnd({
        noteId: this.sustainedHold.activeNoteId,
        duration: holdDuration,
        finalPosition: this.sustainedHold.startPosition,
        timestamp: Date.now(),
        reason
      })
    }

    // console.log(`GestureStateMachine: Sustained hold ended (${reason}): ${this.sustainedHold.activeNoteId} (${holdDuration}ms)`)

    // Clear transition timer if active
    if (this.sustainedHold.transitionTimer) {
      clearTimeout(this.sustainedHold.transitionTimer)
      this.sustainedHold.transitionTimer = null
    }

    // Reset sustained hold state
    this.sustainedHold.isActive = false
    this.sustainedHold.activeNoteId = null
    this.sustainedHold.startPosition = null
  }

  /**
   * Check if sustained hold is active
   * @returns {boolean}
   */
  isHoldActive() {
    return this.sustainedHold.isActive
  }

  /**
   * Get sustained hold data
   * @returns {Object} Sustained hold state
   */
  getSustainedHoldData() {
    return { ...this.sustainedHold }
  }

  /**
   * Update musical context from gesture
   * @param {Object} gesture - Classified gesture
   * @param {Object} gestureHistory - Gesture history array
   */
  updateMusicalContext(gesture, gestureHistory) {
    const now = Date.now()
    const recentWindow = window.GestureConstants?.HISTORY_CONFIG?.recentGestureWindow || 5000

    // Calculate gesture frequency
    const recentGestures = gestureHistory.filter(g => now - g.timestamp < recentWindow)
    this.musicalContext.gestureFrequency = recentGestures.length / (recentWindow / 1000)

    // Update tempo based on gesture rhythm
    if (gestureHistory.length > 2) {
      const recent = gestureHistory.slice(-5)
      const intervals = []

      for (let i = 1; i < recent.length; i++) {
        intervals.push(recent[i].timestamp - recent[i - 1].timestamp)
      }

      if (intervals.length > 0) {
        const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
        const gesturesPerMinute = (60000 / averageInterval) * 4 // Assume 4 gestures per beat

        const minTempo = window.MusicalConstants?.MIN_TEMPO || 60
        const maxTempo = window.MusicalConstants?.MAX_TEMPO || 200

        this.musicalContext.currentTempo = Math.max(minTempo, Math.min(maxTempo, gesturesPerMinute))
      }
    }

    // Update scale based on gesture characteristics
    if (gesture.musicalCharacteristics) {
      const { direction, intensity, speed } = gesture.musicalCharacteristics

      if (direction === 'up' && intensity > 0.7) {
        this.musicalContext.currentScale = 'major'
      } else if (direction === 'down' && intensity > 0.7) {
        this.musicalContext.currentScale = 'minor'
      } else if (speed > 0.8) {
        this.musicalContext.currentScale = 'chromatic'
      } else if (intensity < 0.3) {
        this.musicalContext.currentScale = 'pentatonic'
      }
    }

    this.musicalContext.lastGestureTime = now
  }

  /**
   * Get current musical context
   * @returns {Object} Musical context
   */
  getMusicalContext() {
    return { ...this.musicalContext }
  }

  /**
   * Get gesture tracker state
   * @returns {Object} Tracker state
   */
  getTrackerState() {
    return { ...this.gestureTracker }
  }

  /**
   * Reset all state
   */
  reset() {
    this.cancelHoldDetection()

    if (this.sustainedHold.transitionTimer) {
      clearTimeout(this.sustainedHold.transitionTimer)
    }

    this.sustainedHold = {
      isActive: false,
      startTime: 0,
      holdThreshold: this.sustainedHold.holdThreshold,
      activeNoteId: null,
      startPosition: null,
      holdTimer: null,
      transitionTimer: null,
      overlapDuration: this.sustainedHold.overlapDuration
    }

    // console.log('GestureStateMachine: State reset')
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.GestureStateMachine = GestureStateMachine
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GestureStateMachine
}
