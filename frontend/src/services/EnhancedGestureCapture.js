/**
 * EnhancedGestureCapture
 * Advanced gesture capture system for generative multi-user musical composition
 * Constitutional requirement: Multi-user gesture support with musical event generation
 */

class EnhancedGestureCapture {
  constructor(canvas, gestureToMusicMapper, socketService) {
    this.canvas = canvas
    this.gestureToMusicMapper = gestureToMusicMapper
    this.socketService = socketService

    // Gesture capture state
    this.isActive = false
    this.isCapturing = false
    this.currentGesture = null
    this.gestureHistory = []
    this.maxHistorySize = 50

    // Multi-user state
    this.localUserId = this.generateUserId()
    this.currentRoom = null
    this.participantGestures = new Map() // userId -> gesture data

    // Hover state for cross-layer modulation
    this.hoverState = {
      isHovering: false,
      position: { x: 0.5, y: 0.5 },
      lastHoverTime: 0,
      hoverThreshold: 100, // ms between hover updates
      hoverIntensity: 0.5,
      hoverVelocity: 0
    }

    // Real-time drag note streaming state
    this.dragStreaming = {
      isActive: false,
      lastNoteTime: 0,
      noteInterval: 200, // ms between notes (adjustable based on velocity)
      noteCount: 0,
      totalDistance: 0,
      minDistanceForDrag: 15, // pixels - min movement to activate drag streaming
      streamedNotes: [] // CRITICAL: Array of all notes played during streaming
    }

    // Sustained hold state for note gate control
    this.sustainedHold = {
      isActive: false,
      wasActive: false,        // CRITICAL: Tracks if hold system was used at any point (even after transition to drag)
      startTime: 0,
      holdThreshold: 100,      // ms - distinguishes tap from hold (reduced for faster response)
      activeNoteId: null,
      startPosition: null,
      holdTimer: null,         // setTimeout reference for cleanup
      transitionTimer: null,   // For hold → drag overlap
      overlapDuration: 200     // ms - overlap when transitioning to drag
    }

    // Enhanced gesture tracking
    this.gestureTracker = {
      startPosition: null,
      currentPosition: null,
      velocity: { x: 0, y: 0 },
      acceleration: { x: 0, y: 0 },
      path: [],
      startTime: null,
      lastUpdateTime: null
    }

    // Gesture classification
    this.gestureClassifier = {
      minGestureLength: 20, // pixels
      minGestureDuration: 100, // milliseconds
      directionThreshold: 0.3, // Minimum confidence for direction
      speedThresholds: { slow: 0.2, medium: 0.5, fast: 0.8 }
    }

    // Musical context
    this.musicalContext = {
      lastGestureTime: 0,
      gestureFrequency: 0,
      currentTempo: 120,
      currentScale: 'pentatonic'
    }

    // Performance tracking
    this.performanceMetrics = {
      gesturesCaptured: 0,
      gesturesClassified: 0,
      averageProcessingTime: 0,
      classificationAccuracy: 0
    }

    // Event handlers
    this.onGesture = null
    this.onGestureStart = null
    this.onGestureEnd = null
    this.onMultiUserGesture = null
    this.onHoverModulation = null
    this.onDragStreamingNote = null // Real-time drag note streaming callback
    this.onSustainedHoldStart = null  // Called when hold timer fires (gate opens)
    this.onSustainedHoldEnd = null    // Called on mouseup or transition complete (gate closes)

    // Initialize
    this.setupEventListeners()

    console.log('EnhancedGestureCapture initialized')
  }

  /**
   * Generate unique user ID
   * @returns {string} User ID
   */
  generateUserId() {
    return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Setup event listeners for gesture capture
   */
  setupEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.handleGestureStart(e))
    this.canvas.addEventListener('mousemove', (e) => this.handleGestureMove(e))
    this.canvas.addEventListener('mouseup', (e) => this.handleGestureEnd(e))
    this.canvas.addEventListener('mouseleave', (e) => this.handleGestureEnd(e))

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => this.handleGestureStart(e))
    this.canvas.addEventListener('touchmove', (e) => this.handleGestureMove(e))
    this.canvas.addEventListener('touchend', (e) => this.handleGestureEnd(e))
    this.canvas.addEventListener('touchcancel', (e) => this.handleGestureEnd(e))

    // Hover events for cross-layer modulation
    this.canvas.addEventListener('mousemove', (e) => this.handleHover(e))
    this.canvas.addEventListener('mouseenter', (e) => this.handleHoverStart(e))
    this.canvas.addEventListener('mouseleave', (e) => this.handleHoverEnd(e))

    // Prevent default touch behaviors
    this.canvas.addEventListener('touchstart', (e) => e.preventDefault())
    this.canvas.addEventListener('touchmove', (e) => e.preventDefault())

    console.log('👆 Enhanced gesture event listeners setup complete')
  }

  /**
   * Start gesture capture
   */
  start() {
    this.isActive = true
    console.log('▶️ EnhancedGestureCapture started')
  }

  /**
   * Stop gesture capture
   */
  stop() {
    this.isActive = false
    this.isCapturing = false
    this.currentGesture = null
    console.log('⏸️ EnhancedGestureCapture stopped')
  }

  /**
   * Handle gesture start
   * @param {Event} event - Mouse or touch event
   */
  handleGestureStart(event) {
    console.log('🎯 GESTURE START TRIGGERED - button pressed')
    if (!this.isActive) return

    event.preventDefault()

    const coordinates = this.getEventCoordinates(event)
    if (!coordinates) return

    // Start new gesture
    this.isCapturing = true
    this.currentGesture = {
      id: `gesture-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: this.localUserId,
      roomId: this.currentRoom,
      startTime: Date.now(),
      startPosition: coordinates,
      currentPosition: coordinates,
      path: [coordinates],
      type: this.getEventType(event),
      action: 'potential-tap' // CRITICAL: Start as potential tap, becomes 'drag' if movement detected
    }

    // Reset tracker
    this.gestureTracker = {
      startPosition: coordinates,
      currentPosition: coordinates,
      velocity: { x: 0, y: 0 },
      acceleration: { x: 0, y: 0 },
      path: [coordinates],
      startTime: Date.now(),
      lastUpdateTime: Date.now()
    }

    // Initialize drag streaming state (will activate on movement)
    this.dragStreaming.isActive = false  // Start inactive, activate on movement
    this.dragStreaming.totalDistance = 0
    this.dragStreaming.noteCount = 0
    this.dragStreaming.lastNoteTime = Date.now()
    this.dragStreaming.streamedNotes = [] // Reset notes array for new gesture

    // Reset wasActive for new gesture (will be set to true when hold activates)
    this.sustainedHold.wasActive = false

    // SUSTAINED NOTE: Start immediately on mousedown
    // If user moves, we'll transition to drag streaming
    // If user releases without moving, this is a tap with duration
    this.sustainedHold.isActive = true
    this.sustainedHold.wasActive = true  // CRITICAL: Mark that hold system was used
    this.sustainedHold.startTime = Date.now()
    this.sustainedHold.activeNoteId = `hold-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    this.sustainedHold.startPosition = coordinates

    // Trigger sustained note callback (gate opens)
    if (this.onSustainedHoldStart) {
      this.onSustainedHoldStart({
        position: coordinates,
        noteId: this.sustainedHold.activeNoteId,
        timestamp: Date.now()
      })
    }

    console.log(`🎵 Sustained note started: ${this.sustainedHold.activeNoteId}`)

    // Emit gesture start to server
    this.emitGestureStart(this.currentGesture)

    // Trigger local callback
    if (this.onGestureStart) {
      this.onGestureStart(this.currentGesture)
    }

    console.log('👆 Gesture started:', this.currentGesture.id)
  }

  /**
   * Handle gesture move
   * @param {Event} event - Mouse or touch event
   */
  handleGestureMove(event) {
    if (!this.isActive || !this.isCapturing || !this.currentGesture) return

    event.preventDefault()

    const coordinates = this.getEventCoordinates(event)
    if (!coordinates) return

    const now = Date.now()
    const deltaTime = now - this.gestureTracker.lastUpdateTime

    if (deltaTime > 0) {
      // Calculate velocity
      const deltaX = coordinates.x - this.gestureTracker.currentPosition.x
      const deltaY = coordinates.y - this.gestureTracker.currentPosition.y
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

      const newVelocity = {
        x: deltaX / deltaTime * 1000, // pixels per second
        y: deltaY / deltaTime * 1000
      }

      // Calculate acceleration
      const acceleration = {
        x: (newVelocity.x - this.gestureTracker.velocity.x) / deltaTime * 1000,
        y: (newVelocity.y - this.gestureTracker.velocity.y) / deltaTime * 1000
      }

      // Update tracker
      this.gestureTracker.currentPosition = coordinates
      this.gestureTracker.velocity = newVelocity
      this.gestureTracker.acceleration = acceleration
      this.gestureTracker.path.push(coordinates)
      this.gestureTracker.lastUpdateTime = now

      // REAL-TIME DRAG NOTE STREAMING
      // Calculate total distance moved from start position
      this.dragStreaming.totalDistance += distance

      // TRANSITION: If sustained note active AND movement detected → switch to drag
      if (this.sustainedHold.isActive && distance > 0.001) {
        console.log('🎛️ Movement detected - transitioning from sustained note to drag')

        // End the sustained note
        if (this.onSustainedHoldEnd) {
          const holdDuration = Date.now() - this.sustainedHold.startTime
          this.onSustainedHoldEnd({
            noteId: this.sustainedHold.activeNoteId,
            duration: holdDuration,
            finalPosition: this.sustainedHold.startPosition,
            timestamp: Date.now(),
            reason: 'transition-to-drag'
          })
          console.log(`🎵 Sustained note ended (→drag): ${holdDuration}ms`)
        }

        // Clear sustained hold state
        this.sustainedHold.isActive = false
        this.sustainedHold.activeNoteId = null
        this.sustainedHold.startPosition = null

        // Activate drag streaming and play first drag note
        this.dragStreaming.isActive = true
        this.currentGesture.action = 'drag'
        this.playDragStreamingNote(coordinates, newVelocity, 0)
        this.dragStreaming.noteCount = 1
        this.dragStreaming.lastNoteTime = Date.now()
      }

      // CRITICAL: Discriminate tap vs drag based on MOVEMENT (not time!)
      // If movement exceeds threshold, mark as 'drag'
      if (this.currentGesture.action === 'potential-tap' && this.dragStreaming.totalDistance > this.dragStreaming.minDistanceForDrag) {
        this.currentGesture.action = 'drag'
      }

      // CONTINUE streaming notes (only if drag streaming is active)
      // RHYTHM VARIATION: Adjust note interval based on velocity
      // Fast drag = rapid notes (64n), slow drag = sparse notes (1n)
      const speed = Math.sqrt(newVelocity.x ** 2 + newVelocity.y ** 2)
      const normalizedSpeed = Math.min(speed, 3) // Allow up to 3x for very fast movements

      // Map velocity to musical note intervals (120 BPM)
      let adjustedInterval
      if (normalizedSpeed > 2.0) {
        // Very fast: 64th notes (31.25ms at 120 BPM)
        adjustedInterval = 31.25
      } else if (normalizedSpeed > 1.2) {
        // Fast: 32nd notes (62.5ms)
        adjustedInterval = 62.5
      } else if (normalizedSpeed > 0.7) {
        // Medium-fast: 16th notes (125ms)
        adjustedInterval = 125
      } else if (normalizedSpeed > 0.4) {
        // Medium: 8th notes (250ms)
        adjustedInterval = 250
      } else if (normalizedSpeed > 0.2) {
        // Slow: quarter notes (500ms)
        adjustedInterval = 500
      } else if (normalizedSpeed > 0.1) {
        // Very slow: half notes (1000ms)
        adjustedInterval = 1000
      } else {
        // Extremely slow: whole notes (2000ms)
        adjustedInterval = 2000
      }

      console.log('🎸 Interval calculation:', {
        rawSpeed: speed.toFixed(3),
        normalizedSpeed: normalizedSpeed.toFixed(3),
        intervalMs: adjustedInterval,
        noteValue: adjustedInterval <= 62.5 ? '32n-64n' :
                   adjustedInterval <= 125 ? '16n' :
                   adjustedInterval <= 250 ? '8n' :
                   adjustedInterval <= 500 ? '4n' :
                   adjustedInterval <= 1000 ? '2n' : '1n'
      })

      // Play next note if enough time has passed (only if drag streaming active)
      if (this.dragStreaming.isActive && now - this.dragStreaming.lastNoteTime >= adjustedInterval) {
        this.dragStreaming.noteCount++
        this.dragStreaming.lastNoteTime = now
        this.playDragStreamingNote(coordinates, newVelocity, this.dragStreaming.noteCount)
      }

      // Update current gesture
      this.currentGesture.currentPosition = coordinates
      this.currentGesture.path = this.gestureTracker.path.slice()
      this.currentGesture.velocity = newVelocity
      this.currentGesture.acceleration = acceleration

      // Send real-time position updates
      this.emitGestureUpdate(this.currentGesture)
    }
  }

  /**
   * Handle gesture end
   * @param {Event} event - Mouse or touch event
   */
  handleGestureEnd(event) {
    console.log('🎯 GESTURE END TRIGGERED - button released')
    if (!this.isActive || !this.isCapturing || !this.currentGesture) {
      console.log('🎯 GESTURE END - not capturing or no current gesture')
      return
    }

    event.preventDefault()

    const endTime = Date.now()
    const duration = endTime - this.currentGesture.startTime

    // SUSTAINED HOLD: Clear hold timer if active
    if (this.sustainedHold.holdTimer) {
      clearTimeout(this.sustainedHold.holdTimer)
      this.sustainedHold.holdTimer = null
    }

    // SUSTAINED HOLD: If in sustained hold, trigger release callback
    if (this.sustainedHold.isActive) {
      const holdDuration = Date.now() - this.sustainedHold.startTime

      if (this.onSustainedHoldEnd) {
        this.onSustainedHoldEnd({
          noteId: this.sustainedHold.activeNoteId,
          duration: holdDuration,
          finalPosition: this.sustainedHold.startPosition,
          timestamp: Date.now(),
          reason: 'release'
        })
      }

      console.log(`🎵 Sustained hold ended (release): ${this.sustainedHold.activeNoteId} (${holdDuration}ms)`)

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

    // CRITICAL: Mark that hold system was used for this gesture
    // Backend should NOT generate additional notes via gestureToMusicService
    // Use wasActive instead of isActive (isActive may be false after transition to drag)
    if (this.sustainedHold.wasActive) {
      this.currentGesture.holdWasActive = true
    }

    // CRITICAL: Finalize gesture action based on movement
    // If still 'potential-tap', no significant movement occurred → it's a tap
    if (this.currentGesture.action === 'potential-tap') {
      this.currentGesture.action = 'tap'
    }

    // STOP DRAG NOTE STREAMING (always active since mousedown)
    // CRITICAL: Mark that streaming was active so GestureProcessor knows to skip note generation
    // This is ALWAYS true now since we play first note on mousedown
    this.currentGesture.streamingWasActive = true
    this.currentGesture.streamingNoteCount = this.dragStreaming.noteCount

    // CRITICAL: Include streamedNotes array for backend broadcast (exact replication)
    this.currentGesture.streamedNotes = [...this.dragStreaming.streamedNotes] // Clone array

    this.dragStreaming.isActive = false

    // Reset drag streaming state for next gesture
    this.dragStreaming.totalDistance = 0
    this.dragStreaming.noteCount = 0
    this.dragStreaming.streamedNotes = [] // Clear notes array

    // Complete gesture data
    this.currentGesture.endTime = endTime
    this.currentGesture.duration = duration

    // Classify gesture
    const classifiedGesture = this.classifyGesture(this.currentGesture)

    // Convert to musical event
    const musicalEvent = this.gestureToMusicMapper.gestureToMusicalEvent(classifiedGesture)

    // Add to history
    this.addToGestureHistory(classifiedGesture)

    // Update performance metrics
    this.updatePerformanceMetrics(classifiedGesture)

    // Emit completed gesture
    this.emitGestureComplete(classifiedGesture, musicalEvent)

    // Trigger local callbacks
    if (this.onGesture) {
      this.onGesture(classifiedGesture)
    }

    if (this.onGestureEnd) {
      this.onGestureEnd(classifiedGesture, musicalEvent)
    }

    // Update musical context
    this.updateMusicalContext(classifiedGesture)

    // Reset capture state
    this.isCapturing = false
    this.currentGesture = null

    console.log('👋 Gesture completed:', classifiedGesture.id, 'duration:', duration + 'ms')
  }

  /**
   * Get coordinates from event
   * @param {Event} event - Mouse or touch event
   * @returns {Object|null} Normalized coordinates or null
   */
  getEventCoordinates(event) {
    const rect = this.canvas.getBoundingClientRect()

    let clientX, clientY

    if (event.touches && event.touches.length > 0) {
      clientX = event.touches[0].clientX
      clientY = event.touches[0].clientY
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      clientX = event.changedTouches[0].clientX
      clientY = event.changedTouches[0].clientY
    } else {
      clientX = event.clientX
      clientY = event.clientY
    }

    // Convert to normalized coordinates (0-1)
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    }
  }

  /**
   * Get event type (mouse, touch, etc.)
   * @param {Event} event - Input event
   * @returns {string} Event type
   */
  getEventType(event) {
    if (event.touches) return 'touch'
    if (event.type.includes('mouse')) return 'mouse'
    return 'unknown'
  }

  /**
   * Classify gesture with musical properties
   * @param {Object} gesture - Raw gesture data
   * @returns {Object} Classified gesture
   */
  classifyGesture(gesture) {
    const startTime = performance.now()
    const classified = { ...gesture }

    // DEBUG: Log gesture data before coordinate assignment
    console.log('🔍 CLASSIFY GESTURE - Input data:', {
      hasCurrentPosition: !!gesture.currentPosition,
      currentPosition: gesture.currentPosition,
      pathLength: gesture.path?.length || 0,
      firstPathPoint: gesture.path?.[0],
      lastPathPoint: gesture.path?.[gesture.path?.length - 1]
    })

    // Add coordinates for compatibility with GestureToMusicMapper
    if (gesture.currentPosition) {
      classified.coordinates = {
        x: gesture.currentPosition.x,
        y: gesture.currentPosition.y
      }
      console.log('🔍 Using currentPosition for coordinates:', classified.coordinates)
    } else if (gesture.path && gesture.path.length > 0) {
      // Use last position from path
      const lastPos = gesture.path[gesture.path.length - 1]
      classified.coordinates = {
        x: lastPos.x,
        y: lastPos.y
      }
      console.log('🔍 Using last path point for coordinates:', classified.coordinates)
    } else {
      // Default coordinates
      classified.coordinates = { x: 0.5, y: 0.5 }
      console.log('🔍 Using DEFAULT coordinates (0.5, 0.5) - NO POSITION DATA!')
    }

    // Calculate gesture properties
    const path = gesture.path || []
    const duration = gesture.duration || 0

    if (path.length < 2 || duration < this.gestureClassifier.minGestureDuration) {
      // Insufficient data for classification
      classified.direction = 'unknown'
      classified.intensity = 0.1
      classified.speed = 0.1
      classified.size = 0
      return classified
    }

    // Calculate size (total path length)
    let totalDistance = 0
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x
      const dy = path[i].y - path[i - 1].y
      totalDistance += Math.sqrt(dx * dx + dy * dy)
    }

    // Calculate direction
    const start = path[0]
    const end = path[path.length - 1]
    const deltaX = end.x - start.x
    const deltaY = end.y - start.y

    classified.direction = this.classifyDirection(deltaX, deltaY)

    // Calculate intensity (based on acceleration and size)
    const maxAcceleration = Math.max(
      Math.abs(gesture.acceleration?.x || 0),
      Math.abs(gesture.acceleration?.y || 0)
    )
    const normalizedSize = Math.min(totalDistance / 0.5, 1) // Normalize to 0-1
    const normalizedAcceleration = Math.min(maxAcceleration / 10000, 1) // Normalize acceleration

    classified.intensity = Math.min(1, (normalizedSize * 0.6) + (normalizedAcceleration * 0.4))

    // Calculate speed
    const averageSpeed = totalDistance / (duration / 1000) // pixels per second
    const maxReasonableSpeed = 1000 // pixels per second
    classified.speed = Math.min(averageSpeed / maxReasonableSpeed, 1)

    // Calculate size
    classified.size = totalDistance

    // Add musical characteristics
    classified.musicalCharacteristics = {
      direction: classified.direction,
      intensity: classified.intensity,
      speed: classified.speed,
      duration: duration,
      size: classified.size,
      curvature: this.calculatePathCurvature(path),
      acceleration: maxAcceleration
    }

    // Update performance metrics
    const processingTime = performance.now() - startTime
    this.performanceMetrics.averageProcessingTime =
      (this.performanceMetrics.averageProcessingTime + processingTime) / 2

    this.performanceMetrics.gesturesClassified++

    return classified
  }

  /**
   * Classify gesture direction
   * @param {number} deltaX - X distance
   * @param {number} deltaY - Y distance
   * @returns {string} Direction classification
   */
  classifyDirection(deltaX, deltaY) {
    const threshold = this.gestureClassifier.directionThreshold
    const angle = Math.atan2(deltaY, deltaX)

    // Convert angle to degrees
    const degrees = angle * (180 / Math.PI)

    // Classify based on angle
    if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
      return 'tap'
    } else if (degrees >= -22.5 && degrees < 22.5) {
      return 'right'
    } else if (degrees >= 22.5 && degrees < 67.5) {
      return 'diagonal-down-right'
    } else if (degrees >= 67.5 && degrees < 112.5) {
      return 'down'
    } else if (degrees >= 112.5 && degrees < 157.5) {
      return 'diagonal-down-left'
    } else if (degrees >= 157.5 || degrees < -157.5) {
      return 'left'
    } else if (degrees >= -157.5 && degrees < -112.5) {
      return 'diagonal-up-left'
    } else if (degrees >= -112.5 && degrees < -67.5) {
      return 'up'
    } else if (degrees >= -67.5 && degrees < -22.5) {
      return 'diagonal-up-right'
    }

    return 'unknown'
  }

  /**
   * Calculate path curvature
   * @param {Array} path - Array of coordinates
   * @returns {number} Curvature value (0-1)
   */
  calculatePathCurvature(path) {
    if (path.length < 3) return 0

    let totalAngleChange = 0

    for (let i = 2; i < path.length; i++) {
      const p1 = path[i - 2]
      const p2 = path[i - 1]
      const p3 = path[i]

      // Calculate angles
      const angle1 = Math.atan2(p2.y - p1.y, p2.x - p1.x)
      const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x)

      // Calculate angle difference
      let angleDiff = angle2 - angle1
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI

      totalAngleChange += Math.abs(angleDiff)
    }

    // Normalize curvature
    const maxPossibleCurvature = Math.PI * (path.length - 2)
    return Math.min(totalAngleChange / maxPossibleCurvature, 1)
  }

  /**
   * Add gesture to history
   * @param {Object} gesture - Gesture data
   */
  addToGestureHistory(gesture) {
    this.gestureHistory.push({
      ...gesture,
      timestamp: Date.now()
    })

    // Limit history size
    if (this.gestureHistory.length > this.maxHistorySize) {
      this.gestureHistory.shift()
    }

    this.performanceMetrics.gesturesCaptured++
  }

  /**
   * Update performance metrics
   * @param {Object} gesture - Classified gesture
   */
  updatePerformanceMetrics(gesture) {
    // Calculate gesture frequency
    const now = Date.now()
    const recentGestures = this.gestureHistory.filter(
      g => now - g.timestamp < 5000 // Last 5 seconds
    )

    this.musicalContext.gestureFrequency = recentGestures.length / 5

    // Update tempo based on gesture rhythm
    if (this.gestureHistory.length > 2) {
      const recent = this.gestureHistory.slice(-5)
      const intervals = []

      for (let i = 1; i < recent.length; i++) {
        intervals.push(recent[i].timestamp - recent[i - 1].timestamp)
      }

      if (intervals.length > 0) {
        const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
        const gesturesPerMinute = (60000 / averageInterval) * 4 // Assume 4 gestures per beat
        this.musicalContext.currentTempo = Math.max(60, Math.min(200, gesturesPerMinute))
      }
    }

    this.musicalContext.lastGestureTime = now
  }

  /**
   * Update musical context
   * @param {Object} gesture - Gesture data
   */
  updateMusicalContext(gesture) {
    // Update scale based on gesture characteristics
    if (gesture.musicalCharacteristics) {
      const { direction, intensity, speed } = gesture.musicalCharacteristics

      // Change scale based on gesture patterns
      if (direction === 'up' && intensity > 0.7) {
        this.musicalContext.currentScale = 'major'
      } else if (direction === 'down' && intensity > 0.7) {
        this.musicalContext.currentScale = 'minor'
      } else if (speed > 0.8) {
        this.musicalContext.currentScale = 'chromatic'
      } else if (intensity < 0.3) {
        this.musicalContext.currentScale = 'pentatonic'
      }

      // Update mapper context
      if (this.gestureToMusicMapper) {
        this.gestureToMusicMapper.setTempo(this.musicalContext.currentTempo)
        this.gestureToMusicMapper.setScale(this.musicalContext.currentScale)
      }
    }
  }

  /**
   * Emit gesture start to server
   * @param {Object} gesture - Gesture data
   */
  emitGestureStart(gesture) {
    if (this.socketService && this.socketService.socket) {
      this.socketService.socket.emit('gesture-start', {
        gestureId: gesture.id,
        userId: gesture.userId,
        roomId: gesture.roomId,
        startPosition: gesture.startPosition,
        timestamp: gesture.startTime
      })
    }
  }

  /**
   * Emit gesture update to server
   * @param {Object} gesture - Gesture data
   */
  emitGestureUpdate(gesture) {
    if (this.socketService && this.socketService.socket) {
      this.socketService.socket.emit('gesture-update', {
        gestureId: gesture.id,
        userId: gesture.userId,
        roomId: gesture.roomId,
        currentPosition: gesture.currentPosition,
        velocity: gesture.velocity,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Emit completed gesture to server
   * @param {Object} gesture - Gesture data
   * @param {Object} musicalEvent - Musical event data
   */
  emitGestureComplete(gesture, musicalEvent) {
    if (this.socketService && this.socketService.socket) {
      // CRITICAL FIX: Include position/coordinates for backend pitch calculation
      // Backend expects gesture.position { x, y } or gesture.coordinates [x, y]
      // Without this, backend uses default position { x: 0.5, y: 0.5 } causing all taps to have same pitch
      this.socketService.socket.emit('gesture-complete', {
        gesture: {
          id: gesture.id,
          userId: gesture.userId,
          roomId: gesture.roomId,
          action: gesture.action, // CRITICAL: Include action so backend knows if it's tap/drag/hover
          path: gesture.path,
          position: gesture.coordinates || gesture.currentPosition || { x: 0.5, y: 0.5 }, // Object format
          coordinates: gesture.coordinates || gesture.currentPosition, // Also include for compatibility
          duration: gesture.duration,
          direction: gesture.direction,
          intensity: gesture.intensity,
          speed: gesture.speed,
          musicalCharacteristics: gesture.musicalCharacteristics,
          // CRITICAL: Include streamedNotes for exact remote replication
          // Each note has: frequency, duration, articulation, position, velocity, timestamp
          streamedNotes: gesture.streamedNotes || [],
          streamingWasActive: gesture.streamingWasActive || false,
          streamingNoteCount: gesture.streamingNoteCount || 0,
          // CRITICAL: holdWasActive indicates if gesture was handled by hold:start/hold:end system
          // When true, backend should NOT generate additional notes via gestureToMusicService
          holdWasActive: gesture.holdWasActive || false
        },
        musicalEvent,
        timestamp: Date.now()
      })

      // DEBUG: Log what was sent
      console.log('📤 gesture-complete emitted:', {
        action: gesture.action,
        holdWasActive: gesture.holdWasActive,
        streamedNotes: gesture.streamedNotes?.length || 0,
        duration: gesture.duration
      })
    }
  }

  /**
   * Handle multi-user gesture from server
   * @param {Object} data - Multi-user gesture data
   */
  handleMultiUserGesture(data) {
    const { userId, gesture, musicalEvent } = data

    // Store participant gesture
    this.participantGestures.set(userId, {
      gesture,
      musicalEvent,
      timestamp: Date.now()
    })

    // Trigger callback
    if (this.onMultiUserGesture) {
      this.onMultiUserGesture(data)
    }

    console.log('👥 Received multi-user gesture from:', userId)
  }

  /**
   * Set room context
   * @param {string} roomId - Room ID
   */
  setRoomContext(roomId) {
    this.currentRoom = roomId
    console.log('🏠 EnhancedGestureCapture room context set to:', roomId)
  }

  /**
   * Get local user ID
   * @returns {string} Local user ID
   */
  getLocalUserId() {
    return this.localUserId
  }

  /**
   * Get gesture statistics
   * @returns {Object} Gesture statistics
   */
  getGestureStatistics() {
    return {
      totalGestures: this.performanceMetrics.gesturesCaptured,
      classifiedGestures: this.performanceMetrics.gesturesClassified,
      averageProcessingTime: Math.round(this.performanceMetrics.averageProcessingTime * 100) / 100,
      gestureFrequency: Math.round(this.musicalContext.gestureFrequency * 100) / 100,
      currentTempo: Math.round(this.musicalContext.currentTempo),
      currentScale: this.musicalContext.currentScale,
      activeParticipants: this.participantGestures.size,
      recentGestures: this.gestureHistory.slice(-10)
    }
  }

  /**
   * Clear gesture history
   */
  clearHistory() {
    this.gestureHistory = []
    this.participantGestures.clear()
    console.log('🧹 EnhancedGestureCapture history cleared')
  }

  /**
   * Handle hover start
   * @param {Event} event - Mouse event
   */
  handleHoverStart(event) {
    if (!this.isActive) return

    this.hoverState.isHovering = true
    const coordinates = this.getEventCoordinates(event)
    if (coordinates) {
      this.hoverState.position = coordinates
    }

    console.log('🎯 Hover started at:', this.hoverState.position)
  }

  /**
   * Handle hover movement with cross-layer modulation
   * @param {Event} event - Mouse event
   */
  handleHover(event) {
    if (!this.isActive) return

    // CRITICAL FIX: Don't process hover when we're capturing a gesture (drag)
    if (this.isCapturing) {
      return
    }

    // Auto-activate hover state when mouse moves over canvas
    if (!this.hoverState.isHovering) {
      this.hoverState.isHovering = true
    }

    const coordinates = this.getEventCoordinates(event)
    if (!coordinates) return

    const now = Date.now()
    const deltaTime = now - this.hoverState.lastHoverTime

    // Throttle hover updates - reduced threshold for better responsiveness
    if (deltaTime < this.hoverState.hoverThreshold) {
      return
    }

    // Calculate hover velocity and intensity
    const deltaX = coordinates.x - this.hoverState.position.x
    const deltaY = coordinates.y - this.hoverState.position.y
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

    this.hoverState.hoverVelocity = distance / (deltaTime / 1000) // pixels per second
    this.hoverState.hoverIntensity = Math.min(distance * 2, 1) // Normalize to 0-1

    this.hoverState.position = coordinates
    this.hoverState.lastHoverTime = now

    console.log(`🎛️ Hover: pos=(${coordinates.x.toFixed(2)}, ${coordinates.y.toFixed(2)}), intensity=${this.hoverState.hoverIntensity.toFixed(2)}`)

    // Trigger cross-layer modulation
    if (this.onHoverModulation) {
      this.onHoverModulation({
        position: this.hoverState.position,
        velocity: this.hoverState.hoverVelocity,
        intensity: this.hoverState.hoverIntensity,
        isRemote: false // Local hover
      })
    }

    // Emit hover state to server for multi-user synchronization
    this.emitHoverUpdate()

    // Emit cursor position for multi-user cursors
    this.emitCursorPosition()
  }

  /**
   * Handle hover end
   * @param {Event} event - Mouse event
   */
  handleHoverEnd(event) {
    if (!this.isActive) return

    this.hoverState.isHovering = false
    this.hoverState.hoverVelocity = 0
    this.hoverState.hoverIntensity = 0

    // Reset modulation with safety check
    if (this.onHoverModulation && this.hoverState.position) {
      this.onHoverModulation({
        position: this.hoverState.position,
        velocity: 0,
        intensity: 0,
        isRemote: false
      })
    }

    console.log('🎯 Hover ended')
  }

  /**
   * Handle remote hover from multi-user
   * @param {Object} data - Remote hover data
   */
  handleRemoteHover(data) {
    if (!this.isActive) return

    const { userId, position, velocity, intensity } = data

    // Trigger cross-layer modulation for remote user
    if (this.onHoverModulation) {
      this.onHoverModulation({
        position,
        velocity,
        intensity,
        isRemote: true
      })
    }

    console.log('🌐 Remote hover from user:', userId)
  }

  /**
   * Emit hover update to server
   */
  emitHoverUpdate() {
    console.log('🛸 emitHoverUpdate called:', {
      hasSocketService: !!this.socketService,
      hasSocket: !!(this.socketService && this.socketService.socket),
      isHovering: this.hoverState.isHovering,
      currentRoom: this.currentRoom,
      localUserId: this.localUserId,
      hoverState: this.hoverState
    })

    if (this.socketService && this.socketService.socket && this.hoverState.isHovering) {
      const hoverData = {
        userId: this.localUserId,
        roomId: this.currentRoom,
        position: this.hoverState.position,
        velocity: this.hoverState.hoverVelocity,
        intensity: this.hoverState.hoverIntensity,
        timestamp: Date.now()
      }

      console.log('🛸 Emitting hover-update:', hoverData)
      this.socketService.socket.emit('hover-update', hoverData)
    } else {
      console.log('❌ emitHoverUpdate blocked - conditions not met')
    }
  }

  /**
   * Emit cursor position for multi-user cursors
   */
  emitCursorPosition() {
    if (!this.socketService || !this.socketService.socket) {
      console.log('❌ emitCursorPosition blocked - no socket service')
      return
    }

    const position = this.hoverState.position || { x: 0.5, y: 0.5 }
    console.log('🎯 Emitting cursor position:', {
      x: position.x,
      y: position.y,
      isDrawing: this.isCapturing,
      hasHoverState: !!this.hoverState.position,
      userId: this.localUserId
    })

    this.socketService.socket.emit('cursor-move', {
      x: position.x,
      y: position.y,
      isDrawing: this.isCapturing,
      timestamp: Date.now(),
      userId: this.localUserId  // Use same user ID as hover-update events
    })

    console.log('👆 Cursor position emitted successfully')
  }

  /**
   * Set hover modulation callback
   * @param {Function} callback - Hover modulation callback
   */
  setHoverModulationCallback(callback) {
    this.onHoverModulation = callback
    console.log('🎛️ Hover modulation callback set')
  }

  /**
   * Set drag streaming note callback for real-time feedback
   * @param {Function} callback - Drag streaming note callback
   */
  setDragStreamingNoteCallback(callback) {
    this.onDragStreamingNote = callback
    console.log('🎸 Drag streaming note callback set')
  }

  /**
   * Play drag streaming note during real-time drag
   * @param {Object} coordinates - Current position
   * @param {Object} velocity - Current velocity
   * @param {number} noteIndex - Index of note in stream
   */
  playDragStreamingNote(coordinates, velocity, noteIndex) {
    if (!this.onDragStreamingNote) {
      console.warn('🎸 No drag streaming callback set')
      return
    }

    // Calculate note properties from position and movement
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2)
    const normalizedSpeed = Math.min(speed, 1) // Clamp to max 1.0

    // DURATION based on speed (rhythm variation)
    let duration
    if (normalizedSpeed > 0.6) {
      duration = '32n'  // Very short for fast movement
    } else if (normalizedSpeed > 0.3) {
      duration = '16n'  // Short for medium movement
    } else {
      duration = '8n'   // Longer for slow movement
    }

    // ARTICULATION: Independent compositional parameter
    // Use pattern for variation (will be influenced by collective metrics later)
    const articulationPattern = ['legato', 'marcato', 'staccato', 'legato', 'marcato', 'legato', 'staccato', 'marcato']
    const articulation = articulationPattern[noteIndex % articulationPattern.length]

    const noteData = {
      position: coordinates,
      velocity: normalizedSpeed,
      noteIndex: noteIndex,
      timestamp: Date.now(),
      // Musical parameters
      duration: duration,
      articulation: articulation
    }

    // Trigger callback to play note and collect note data
    const playedNote = this.onDragStreamingNote(noteData)

    // CRITICAL: Add played note to streamedNotes array for backend broadcast
    if (playedNote) {
      this.dragStreaming.streamedNotes.push(playedNote)
    }
  }

  /**
   * Get hover state
   * @returns {Object} Current hover state
   */
  getHoverState() {
    return {
      ...this.hoverState,
      isActive: this.hoverState.isHovering
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stop()
    this.clearHistory()

    // Remove event listeners
    this.canvas.removeEventListener('mousedown', this.handleGestureStart)
    this.canvas.removeEventListener('mousemove', this.handleGestureMove)
    this.canvas.removeEventListener('mouseup', this.handleGestureEnd)
    this.canvas.removeEventListener('mouseleave', this.handleGestureEnd)
    this.canvas.removeEventListener('touchstart', this.handleGestureStart)
    this.canvas.removeEventListener('touchmove', this.handleGestureMove)
    this.canvas.removeEventListener('touchend', this.handleGestureEnd)
    this.canvas.removeEventListener('touchcancel', this.handleGestureEnd)

    // Remove hover event listeners
    this.canvas.removeEventListener('mousemove', this.handleHover)
    this.canvas.removeEventListener('mouseenter', this.handleHoverStart)
    this.canvas.removeEventListener('mouseleave', this.handleHoverEnd)

    console.log('🧹 EnhancedGestureCapture destroyed')
  }
}

// Export class
window.EnhancedGestureCapture = EnhancedGestureCapture