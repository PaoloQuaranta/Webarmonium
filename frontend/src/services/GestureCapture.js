/**
 * GestureCapture Service
 * Cross-platform input normalization and gesture processing
 * Constitutional requirement: Device-agnostic input, <200ms processing
 */
class GestureCapture {
  constructor(canvas) {
    this.canvas = canvas
    this.isCapturing = false
    this.gestureQueue = []
    this.processingStats = {
      totalGestures: 0,
      averageProcessingTime: 0,
      deviceTypeDistribution: new Map(),
      lastProcessingTime: 0
    }

    // Input calibration
    this.calibration = {
      mouse: {
        sensitivity: 1.0,
        smoothing: 0.1
      },
      touch: {
        sensitivity: 1.2,
        pressureSupport: false
      },
      gyroscope: {
        sensitivity: 0.8,
        deadzone: 0.05,
        calibrated: false,
        baseline: { x: 0, y: 0, z: 0 }
      }
    }

    // Device capabilities
    this.capabilities = {
      mouse: true,
      touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      gyroscope: 'DeviceOrientationEvent' in window,
      pressure: false // Will be detected during touch events
    }

    // Gesture history for pattern recognition
    this.gestureHistory = []
    this.maxHistorySize = 100

    // Performance tracking
    this.performanceTimer = null

    this.init()
  }

  /**
   * Initialize gesture capture system
   */
  async init() {
    console.log('Initializing GestureCapture with capabilities:', this.capabilities)

    // Request gyroscope permissions on iOS
    if (this.capabilities.gyroscope && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission()
        this.capabilities.gyroscope = permission === 'granted'
      } catch (error) {
        console.warn('Gyroscope permission denied:', error)
        this.capabilities.gyroscope = false
      }
    }

    // Calibrate gyroscope if available
    if (this.capabilities.gyroscope) {
      this.calibrateGyroscope()
    }

    // Start performance monitoring
    this.startPerformanceMonitoring()

    // Bind canvas events for gesture capture
    this.bindCanvasEvents()
  }

  /**
   * Bind canvas events for gesture capture
   */
  bindCanvasEvents() {
    if (!this.canvas) {
      console.error('❌ No canvas provided to GestureCapture')
      return
    }

    console.log('🎯 Binding canvas events for gesture capture')

    // Mouse events
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e))
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e))
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e))

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e))
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e))
    this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e))

    console.log('🎯 Canvas events bound successfully')
  }

  /**
   * Handle mouse move events
   */
  handleMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height

    const gesture = {
      type: 'mouse',
      coordinates: { x, y },
      intensity: event.buttons > 0 ? 0.8 : 0.3, // Higher intensity when clicking
      timestamp: Date.now(),
      device: 'desktop'
    }

    console.log('🎯 Mouse gesture captured:', gesture)
    this.processGesture(gesture)
  }

  /**
   * Handle mouse down events
   */
  handleMouseDown(event) {
    const rect = this.canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.height

    const gesture = {
      type: 'mouse',
      coordinates: { x, y },
      intensity: 0.9,
      timestamp: Date.now(),
      device: 'desktop',
      action: 'press'
    }

    console.log('🎯 Mouse press gesture captured:', gesture)
    this.processGesture(gesture)
  }

  /**
   * Handle mouse up events
   */
  handleMouseUp(event) {
    // Optional: handle mouse up if needed for gesture completion
  }

  /**
   * Handle touch start events
   */
  handleTouchStart(event) {
    event.preventDefault()
    const touch = event.touches[0]
    const rect = this.canvas.getBoundingClientRect()
    const x = (touch.clientX - rect.left) / rect.width
    const y = (touch.clientY - rect.top) / rect.height

    const gesture = {
      type: 'touch',
      coordinates: { x, y },
      intensity: 0.8,
      timestamp: Date.now(),
      device: 'mobile',
      action: 'start'
    }

    console.log('🎯 Touch gesture captured:', gesture)
    this.processGesture(gesture)
  }

  /**
   * Handle touch move events
   */
  handleTouchMove(event) {
    event.preventDefault()
    const touch = event.touches[0]
    const rect = this.canvas.getBoundingClientRect()
    const x = (touch.clientX - rect.left) / rect.width
    const y = (touch.clientY - rect.top) / rect.height

    const gesture = {
      type: 'touch',
      coordinates: { x, y },
      intensity: 0.7,
      timestamp: Date.now(),
      device: 'mobile'
    }

    console.log('🎯 Touch move gesture captured:', gesture)
    this.processGesture(gesture)
  }

  /**
   * Handle touch end events
   */
  handleTouchEnd(event) {
    event.preventDefault()
    // Optional: handle touch end if needed
  }

  /**
   * Process captured gesture and trigger callback
   */
  processGesture(gesture) {
    console.log('🎯 Processing gesture:', gesture)

    if (this.onGesture && typeof this.onGesture === 'function') {
      console.log('🎯 Calling onGesture callback')
      this.onGesture(gesture)
    } else {
      console.warn('🎯 No onGesture callback set')
    }
  }

  /**
   * Calibrate gyroscope baseline
   */
  calibrateGyroscope() {
    console.log('Calibrating gyroscope...')

    const samples = []
    const sampleCount = 20
    let sampleIndex = 0

    const handleCalibrationData = (event) => {
      samples.push({
        x: event.gamma || 0,
        y: event.beta || 0,
        z: event.alpha || 0
      })

      sampleIndex++

      if (sampleIndex >= sampleCount) {
        // Calculate baseline averages
        this.calibration.gyroscope.baseline = {
          x: samples.reduce((sum, s) => sum + s.x, 0) / samples.length,
          y: samples.reduce((sum, s) => sum + s.y, 0) / samples.length,
          z: samples.reduce((sum, s) => sum + s.z, 0) / samples.length
        }

        this.calibration.gyroscope.calibrated = true
        window.removeEventListener('deviceorientation', handleCalibrationData)

        console.log('Gyroscope calibrated:', this.calibration.gyroscope.baseline)
      }
    }

    window.addEventListener('deviceorientation', handleCalibrationData)

    // Fallback: mark as calibrated after 2 seconds even if no data
    setTimeout(() => {
      if (!this.calibration.gyroscope.calibrated) {
        this.calibration.gyroscope.calibrated = true
        window.removeEventListener('deviceorientation', handleCalibrationData)
        console.log('Gyroscope calibration timed out, using defaults')
      }
    }, 2000)
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    this.performanceTimer = setInterval(() => {
      // Log performance stats periodically
      if (this.processingStats.totalGestures > 0) {
        console.log('GestureCapture Performance:', {
          totalGestures: this.processingStats.totalGestures,
          avgProcessingTime: this.processingStats.averageProcessingTime.toFixed(2) + 'ms',
          deviceDistribution: Array.from(this.processingStats.deviceTypeDistribution.entries())
        })
      }
    }, 30000) // Every 30 seconds
  }

  /**
   * Process raw input event into normalized gesture
   * @param {string} inputType - 'mouse', 'touch', or 'gyroscope'
   * @param {Object} rawData - Raw input event data
   * @returns {Object|null} Normalized gesture data
   */
  processInput(inputType, rawData) {
    if (!this.isCapturing) return null

    const startTime = performance.now()

    let gesture = null

    try {
      switch (inputType) {
        case 'mouse':
          gesture = this.processMouseInput(rawData)
          break
        case 'touch':
          gesture = this.processTouchInput(rawData)
          break
        case 'gyroscope':
          gesture = this.processGyroscopeInput(rawData)
          break
        default:
          console.warn('Unknown input type:', inputType)
          return null
      }

      if (gesture) {
        // Add processing metadata
        gesture.processedAt = Date.now()
        gesture.processingTime = performance.now() - startTime

        // Update statistics
        this.updateProcessingStats(inputType, gesture.processingTime)

        // Add to history
        this.addToHistory(gesture)

        // Queue for batch processing if needed
        this.queueGesture(gesture)

        // Constitutional requirement check
        if (gesture.processingTime > 200) {
          console.warn(`Gesture processing time ${gesture.processingTime}ms exceeds 200ms constitutional requirement`)
        }
      }

      return gesture

    } catch (error) {
      console.error('Error processing input:', error)
      return null
    }
  }

  /**
   * Process mouse input events
   * @param {Object} mouseData - Mouse event data
   * @returns {Object} Normalized gesture
   */
  processMouseInput(mouseData) {
    const { clientX, clientY, movementX = 0, movementY = 0, buttons = 0, target } = mouseData

    // Get normalized coordinates relative to target element
    const rect = target.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))

    // Calculate intensity from movement velocity
    const movement = Math.sqrt(movementX ** 2 + movementY ** 2)
    const intensity = Math.min(1, movement / 20) * this.calibration.mouse.sensitivity

    // Apply smoothing to reduce jitter
    const smoothedIntensity = this.applySmoothing(
      intensity,
      this.getLastIntensity('mouse'),
      this.calibration.mouse.smoothing
    )

    return {
      type: 'mouse',
      coordinates: { x, y },
      intensity: smoothedIntensity,
      timestamp: new Date(),
      metadata: {
        movement: { x: movementX, y: movementY },
        buttons,
        isPressed: buttons > 0
      }
    }
  }

  /**
   * Process touch input events
   * @param {Object} touchData - Touch event data
   * @returns {Object} Normalized gesture
   */
  processTouchInput(touchData) {
    const { touches, changedTouches, type, target } = touchData

    // Use first touch for primary gesture
    const touch = changedTouches[0] || touches[0]
    if (!touch) return null

    // Get normalized coordinates
    const rect = target.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height))

    // Calculate intensity from touch pressure or force
    let intensity = 0.7 // Default intensity

    if (touch.force !== undefined) {
      // Pressure-sensitive touch (newer devices)
      intensity = Math.min(1, touch.force * 2)
      this.capabilities.pressure = true
    } else if (touch.radiusX && touch.radiusY) {
      // Estimate pressure from touch area
      const area = Math.PI * touch.radiusX * touch.radiusY
      intensity = Math.min(1, area / 500) // Normalize based on typical finger size
    } else {
      // Use touch event type to estimate intensity
      switch (type) {
        case 'touchstart':
          intensity = 0.8
          break
        case 'touchmove':
          intensity = 0.6
          break
        case 'touchend':
          intensity = 0.3
          break
      }
    }

    // Apply touch sensitivity calibration
    intensity *= this.calibration.touch.sensitivity

    return {
      type: 'touch',
      coordinates: { x, y },
      intensity: Math.min(1, intensity),
      timestamp: new Date(),
      metadata: {
        touchId: touch.identifier,
        touchCount: touches.length,
        touchType: type,
        force: touch.force,
        area: touch.radiusX && touch.radiusY ?
          Math.PI * touch.radiusX * touch.radiusY : undefined
      }
    }
  }

  /**
   * Process gyroscope/device orientation input
   * @param {Object} orientationData - Device orientation event data
   * @returns {Object} Normalized gesture
   */
  processGyroscopeInput(orientationData) {
    if (!this.calibration.gyroscope.calibrated) {
      return null // Wait for calibration
    }

    const { gamma = 0, beta = 0, alpha = 0 } = orientationData

    // Apply calibration offset
    const calibratedGamma = gamma - this.calibration.gyroscope.baseline.x
    const calibratedBeta = beta - this.calibration.gyroscope.baseline.y
    const calibratedAlpha = alpha - this.calibration.gyroscope.baseline.z

    // Normalize to 0-1 range
    // Gamma: -90 to 90 degrees (left/right tilt)
    // Beta: -180 to 180 degrees (front/back tilt)
    // Alpha: 0 to 360 degrees (compass direction)
    let x = (calibratedGamma + 90) / 180
    let y = (calibratedBeta + 180) / 360
    let z = calibratedAlpha / 360

    // Clamp to 0-1 range
    x = Math.max(0, Math.min(1, x))
    y = Math.max(0, Math.min(1, y))
    z = Math.max(0, Math.min(1, z))

    // Apply deadzone to reduce noise
    const deadzone = this.calibration.gyroscope.deadzone
    if (Math.abs(x - 0.5) < deadzone) x = 0.5
    if (Math.abs(y - 0.5) < deadzone) y = 0.5

    // Calculate intensity from total rotation magnitude
    const rotationMagnitude = Math.sqrt(
      calibratedGamma ** 2 + calibratedBeta ** 2
    ) / 90 // Normalize by max rotation

    const intensity = Math.min(1, rotationMagnitude * this.calibration.gyroscope.sensitivity)

    return {
      type: 'gyroscope',
      coordinates: { x, y, z },
      intensity,
      timestamp: new Date(),
      metadata: {
        rawValues: { gamma, beta, alpha },
        calibratedValues: {
          gamma: calibratedGamma,
          beta: calibratedBeta,
          alpha: calibratedAlpha
        },
        rotationMagnitude
      }
    }
  }

  /**
   * Apply smoothing to reduce input jitter
   * @param {number} current - Current value
   * @param {number} previous - Previous value
   * @param {number} factor - Smoothing factor (0-1)
   * @returns {number} Smoothed value
   */
  applySmoothing(current, previous, factor) {
    if (previous === undefined) return current
    return previous + (current - previous) * factor
  }

  /**
   * Get last intensity value for smoothing
   * @param {string} inputType - Input type
   * @returns {number|undefined} Last intensity
   */
  getLastIntensity(inputType) {
    const lastGesture = this.gestureHistory
      .slice()
      .reverse()
      .find(g => g.type === inputType)

    return lastGesture?.intensity
  }

  /**
   * Add gesture to history
   * @param {Object} gesture - Processed gesture
   */
  addToHistory(gesture) {
    this.gestureHistory.push(gesture)

    // Limit history size for performance
    if (this.gestureHistory.length > this.maxHistorySize) {
      this.gestureHistory.shift()
    }
  }

  /**
   * Queue gesture for batch processing
   * @param {Object} gesture - Processed gesture
   */
  queueGesture(gesture) {
    this.gestureQueue.push(gesture)

    // Limit queue size to prevent memory buildup
    if (this.gestureQueue.length > 50) {
      this.gestureQueue.shift()
    }
  }

  /**
   * Update processing statistics
   * @param {string} inputType - Input type
   * @param {number} processingTime - Processing time in ms
   */
  updateProcessingStats(inputType, processingTime) {
    this.processingStats.totalGestures++

    // Update average processing time
    const prevAvg = this.processingStats.averageProcessingTime
    const count = this.processingStats.totalGestures
    this.processingStats.averageProcessingTime =
      ((prevAvg * (count - 1)) + processingTime) / count

    // Update device type distribution
    const currentCount = this.processingStats.deviceTypeDistribution.get(inputType) || 0
    this.processingStats.deviceTypeDistribution.set(inputType, currentCount + 1)

    this.processingStats.lastProcessingTime = processingTime
  }

  /**
   * Start gesture capture
   */
  startCapture() {
    this.isCapturing = true
    console.log('Gesture capture started')
  }

  /**
   * Stop gesture capture
   */
  stopCapture() {
    this.isCapturing = false
    console.log('Gesture capture stopped')
  }

  /**
   * Get and clear gesture queue
   * @returns {Array} Queued gestures
   */
  getQueuedGestures() {
    const gestures = [...this.gestureQueue]
    this.gestureQueue = []
    return gestures
  }

  /**
   * Update calibration settings
   * @param {string} inputType - Input type to calibrate
   * @param {Object} settings - Calibration settings
   */
  updateCalibration(inputType, settings) {
    if (this.calibration[inputType]) {
      Object.assign(this.calibration[inputType], settings)
      console.log(`Updated ${inputType} calibration:`, this.calibration[inputType])
    }
  }

  /**
   * Get gesture statistics for debugging
   * @returns {Object} Gesture statistics
   */
  getStatistics() {
    return {
      ...this.processingStats,
      capabilities: this.capabilities,
      calibration: this.calibration,
      isCapturing: this.isCapturing,
      historySize: this.gestureHistory.length,
      queueSize: this.gestureQueue.length
    }
  }

  /**
   * Reset all statistics
   */
  resetStatistics() {
    this.processingStats = {
      totalGestures: 0,
      averageProcessingTime: 0,
      deviceTypeDistribution: new Map(),
      lastProcessingTime: 0
    }

    this.gestureHistory = []
    this.gestureQueue = []

    console.log('Gesture capture statistics reset')
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopCapture()

    if (this.performanceTimer) {
      clearInterval(this.performanceTimer)
      this.performanceTimer = null
    }

    this.gestureHistory = []
    this.gestureQueue = []

    console.log('GestureCapture cleanup completed')
  }

  /**
   * Test input responsiveness
   * @param {string} inputType - Input type to test
   * @returns {Promise<Object>} Test results
   */
  async testInputResponsiveness(inputType) {
    const testDuration = 5000 // 5 seconds
    const testGestures = []

    console.log(`Starting ${inputType} responsiveness test for ${testDuration}ms`)

    const originalCapture = this.isCapturing
    this.startCapture()

    // Simulate test gestures
    const testInterval = setInterval(() => {
      const testGesture = this.processInput(inputType, this.generateTestData(inputType))
      if (testGesture) {
        testGestures.push(testGesture)
      }
    }, 100) // Every 100ms

    // Wait for test duration
    await new Promise(resolve => setTimeout(resolve, testDuration))

    clearInterval(testInterval)
    this.isCapturing = originalCapture

    // Analyze results
    const avgProcessingTime = testGestures.length > 0 ?
      testGestures.reduce((sum, g) => sum + g.processingTime, 0) / testGestures.length : 0

    const maxProcessingTime = testGestures.length > 0 ?
      Math.max(...testGestures.map(g => g.processingTime)) : 0

    const testResults = {
      inputType,
      testDuration,
      gesturesProcessed: testGestures.length,
      averageProcessingTime: avgProcessingTime,
      maxProcessingTime: maxProcessingTime,
      passesConstitutionalRequirement: maxProcessingTime <= 200,
      gesturesPerSecond: testGestures.length / (testDuration / 1000)
    }

    console.log('Input responsiveness test results:', testResults)
    return testResults
  }

  /**
   * Generate test data for input testing
   * @param {string} inputType - Input type
   * @returns {Object} Test data
   */
  generateTestData(inputType) {
    switch (inputType) {
      case 'mouse':
        return {
          clientX: Math.random() * 800,
          clientY: Math.random() * 600,
          movementX: (Math.random() - 0.5) * 10,
          movementY: (Math.random() - 0.5) * 10,
          buttons: Math.random() > 0.5 ? 1 : 0,
          target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }
        }

      case 'touch':
        return {
          touches: [{
            clientX: Math.random() * 800,
            clientY: Math.random() * 600,
            identifier: 1,
            force: Math.random()
          }],
          changedTouches: [{
            clientX: Math.random() * 800,
            clientY: Math.random() * 600,
            identifier: 1,
            force: Math.random()
          }],
          type: 'touchmove',
          target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }
        }

      case 'gyroscope':
        return {
          gamma: (Math.random() - 0.5) * 180,
          beta: (Math.random() - 0.5) * 360,
          alpha: Math.random() * 360
        }

      default:
        return {}
    }
  }
}

// Export singleton instance
// Make GestureCapture available globally
window.GestureCapture = GestureCapture