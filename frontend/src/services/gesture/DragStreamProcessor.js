/**
 * DragStreamProcessor.js
 * Handles real-time drag note streaming during gesture movement
 * Phase 3 refactoring - Decomposed from EnhancedGestureCapture.js
 */
class DragStreamProcessor {
  constructor() {
    // Drag configuration
    const dragConfig = window.GestureConstants?.DRAG_CONFIG || {
      minDistanceForDrag: 15,
      defaultNoteInterval: 200,
      minNoteInterval: 31.25,
      maxNoteInterval: 2000
    }

    // Drag streaming state
    this.dragStreaming = {
      isActive: false,
      lastNoteTime: 0,
      noteInterval: dragConfig.defaultNoteInterval,
      noteCount: 0,
      totalDistance: 0,
      minDistanceForDrag: dragConfig.minDistanceForDrag,
      streamedNotes: [],
      firstNotePlayed: false
    }

    // Configuration
    this.config = {
      minNoteInterval: dragConfig.minNoteInterval,
      maxNoteInterval: dragConfig.maxNoteInterval,
      minDistanceForDrag: dragConfig.minDistanceForDrag
    }

    // Articulation patterns
    this.articulationPatterns = window.GestureConstants?.ARTICULATION_PATTERNS?.default ||
      ['legato', 'marcato', 'staccato', 'legato', 'marcato', 'legato', 'staccato', 'marcato']

    // Callback for streaming notes
    this.onDragStreamingNote = null
  }

  /**
   * Set drag streaming note callback
   * @param {Function} callback - Callback for streaming notes
   */
  setDragStreamingNoteCallback(callback) {
    this.onDragStreamingNote = callback
    // console.log('DragStreamProcessor: Drag streaming note callback set')
  }

  /**
   * Start drag streaming
   */
  start() {
    this.dragStreaming.isActive = true
    this.dragStreaming.totalDistance = 0
    this.dragStreaming.noteCount = 0
    this.dragStreaming.lastNoteTime = Date.now()
    this.dragStreaming.streamedNotes = []
    this.dragStreaming.firstNotePlayed = false

    // console.log('DragStreamProcessor: Started')
  }

  /**
   * Stop drag streaming
   * @returns {Object} Final streaming data
   */
  stop() {
    const finalData = {
      noteCount: this.dragStreaming.noteCount,
      totalDistance: this.dragStreaming.totalDistance,
      streamedNotes: [...this.dragStreaming.streamedNotes]
    }

    this.dragStreaming.isActive = false
    this.dragStreaming.totalDistance = 0
    this.dragStreaming.noteCount = 0
    this.dragStreaming.streamedNotes = []
    this.dragStreaming.firstNotePlayed = false

    // console.log('DragStreamProcessor: Stopped', finalData)
    return finalData
  }

  /**
   * Process movement during drag
   * @param {Object} coordinates - Current coordinates
   * @param {Object} velocity - Current velocity { x, y }
   * @param {number} distance - Distance moved
   * @returns {Object|null} Processed note data or null
   */
  processMovement(coordinates, velocity, distance) {
    if (!this.dragStreaming.isActive) {
      return null
    }

    // Accumulate distance
    this.dragStreaming.totalDistance += distance

    const now = Date.now()

    // Calculate note interval based on velocity
    const speed = this.calculateSpeed(velocity)
    const normalizedSpeed = this.normalizeSpeed(speed)
    const intervalData = this.getIntervalFromSpeed(normalizedSpeed)
    const adjustedInterval = intervalData.interval

    // Check if enough time has passed for next note
    if (now - this.dragStreaming.lastNoteTime >= adjustedInterval) {
      this.dragStreaming.noteCount++
      this.dragStreaming.lastNoteTime = now

      return this.playNote(coordinates, velocity, this.dragStreaming.noteCount)
    }

    return null
  }

  /**
   * Check if drag threshold is exceeded
   * @returns {boolean} True if total distance exceeds drag threshold
   */
  isDragThresholdExceeded() {
    return this.dragStreaming.totalDistance > this.config.minDistanceForDrag
  }

  /**
   * Check if first note was played
   * @returns {boolean}
   */
  isFirstNotePlayed() {
    return this.dragStreaming.firstNotePlayed
  }

  /**
   * Mark first note as played
   */
  markFirstNotePlayed() {
    this.dragStreaming.firstNotePlayed = true
  }

  /**
   * Play first note of drag
   * @param {Object} coordinates - Start coordinates
   * @returns {Object|null} Played note data or null
   */
  playFirstNote(coordinates) {
    if (this.dragStreaming.firstNotePlayed) {
      return null
    }

    this.dragStreaming.firstNotePlayed = true
    return this.playNote(coordinates, { x: 0, y: 0 }, 0)
  }

  /**
   * Play a streaming note
   * @param {Object} coordinates - Current position
   * @param {Object} velocity - Current velocity
   * @param {number} noteIndex - Index of note in stream
   * @returns {Object|null} Played note data or null
   */
  playNote(coordinates, velocity, noteIndex) {
    if (!this.onDragStreamingNote) {
      // console.warn('DragStreamProcessor: No drag streaming callback set')
      return null
    }

    // Calculate note properties
    const speed = this.calculateSpeed(velocity)
    const normalizedSpeed = Math.min(speed, 1)

    // Duration based on speed
    const duration = this.getDurationFromSpeed(normalizedSpeed)

    // Articulation from pattern
    const articulation = this.articulationPatterns[noteIndex % this.articulationPatterns.length]

    const noteData = {
      position: coordinates,
      velocity: normalizedSpeed,
      noteIndex: noteIndex,
      timestamp: Date.now(),
      duration: duration,
      articulation: articulation
    }

    // Trigger callback and collect played note
    const playedNote = this.onDragStreamingNote(noteData)

    // Store played note for backend broadcast
    if (playedNote) {
      this.dragStreaming.streamedNotes.push(playedNote)
    }

    return playedNote
  }

  /**
   * Calculate speed magnitude from velocity
   * @param {Object} velocity - Velocity { x, y }
   * @returns {number} Speed magnitude
   */
  calculateSpeed(velocity) {
    if (window.GestureConstants?.calculateVelocityMagnitude) {
      return window.GestureConstants.calculateVelocityMagnitude(velocity.x, velocity.y)
    }
    return Math.sqrt(velocity.x ** 2 + velocity.y ** 2)
  }

  /**
   * Normalize speed to 0-3 range
   * @param {number} speed - Raw speed
   * @returns {number} Normalized speed
   */
  normalizeSpeed(speed) {
    if (window.VelocityCalculator?.normalizeSpeed) {
      return window.VelocityCalculator.normalizeSpeed(speed)
    }
    if (window.GestureConstants?.normalizeSpeed) {
      return window.GestureConstants.normalizeSpeed(speed)
    }
    return Math.min(speed / 1000, 3)
  }

  /**
   * Get note interval from speed
   * @param {number} normalizedSpeed - Normalized speed (0-3)
   * @returns {Object} { interval, noteValue }
   */
  getIntervalFromSpeed(normalizedSpeed) {
    if (window.VelocityCalculator?.getIntervalFromSpeed) {
      return window.VelocityCalculator.getIntervalFromSpeed(normalizedSpeed)
    }
    if (window.GestureConstants?.getIntervalFromSpeed) {
      return window.GestureConstants.getIntervalFromSpeed(normalizedSpeed)
    }

    // Fallback mapping
    const velocityNoteMap = window.GestureConstants?.VELOCITY_NOTE_MAP || [
      { threshold: 2.0, interval: 31.25, noteValue: '64n' },
      { threshold: 1.2, interval: 62.5, noteValue: '32n' },
      { threshold: 0.7, interval: 125, noteValue: '16n' },
      { threshold: 0.4, interval: 250, noteValue: '8n' },
      { threshold: 0.2, interval: 500, noteValue: '4n' },
      { threshold: 0.1, interval: 1000, noteValue: '2n' },
      { threshold: 0, interval: 2000, noteValue: '1n' }
    ]

    for (const mapping of velocityNoteMap) {
      if (normalizedSpeed > mapping.threshold) {
        return { interval: mapping.interval, noteValue: mapping.noteValue }
      }
    }

    return velocityNoteMap[velocityNoteMap.length - 1]
  }

  /**
   * Get duration string from speed
   * @param {number} normalizedSpeed - Normalized speed (0-1)
   * @returns {string} Duration string
   */
  getDurationFromSpeed(normalizedSpeed) {
    if (normalizedSpeed > 0.6) {
      return '32n'
    } else if (normalizedSpeed > 0.3) {
      return '16n'
    }
    return '8n'
  }

  /**
   * Get streamed notes array
   * @returns {Array} Array of streamed notes
   */
  getStreamedNotes() {
    return [...this.dragStreaming.streamedNotes]
  }

  /**
   * Get note count
   * @returns {number} Number of notes played
   */
  getNoteCount() {
    return this.dragStreaming.noteCount
  }

  /**
   * Get total distance
   * @returns {number} Total distance moved
   */
  getTotalDistance() {
    return this.dragStreaming.totalDistance
  }

  /**
   * Check if streaming is active
   * @returns {boolean}
   */
  isActive() {
    return this.dragStreaming.isActive
  }

  /**
   * Reset state
   */
  reset() {
    this.dragStreaming = {
      isActive: false,
      lastNoteTime: 0,
      noteInterval: this.config.minDistanceForDrag,
      noteCount: 0,
      totalDistance: 0,
      minDistanceForDrag: this.config.minDistanceForDrag,
      streamedNotes: [],
      firstNotePlayed: false
    }

    // console.log('DragStreamProcessor: State reset')
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.DragStreamProcessor = DragStreamProcessor
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DragStreamProcessor
}
