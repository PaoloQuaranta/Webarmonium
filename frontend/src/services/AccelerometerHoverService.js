/**
 * AccelerometerHoverService
 * Entry #48: Converts device orientation (tilt) to hover position for mobile devices
 *
 * When NOT touching the screen, device tilt maps to cursor/hover position
 * Beta (forward/backward tilt) maps to Y axis
 * Gamma (left/right tilt) maps to X axis
 */
class AccelerometerHoverService {
  constructor() {
    this.isActive = false
    this.hasPermission = false
    this.isCalibrated = false

    // Calibration baseline (device orientation when user starts)
    this.baseline = { alpha: 0, beta: 0, gamma: 0 }

    // Current orientation
    this.orientation = { alpha: 0, beta: 0, gamma: 0 }

    // Mapped hover position (normalized 0-1)
    this.hoverPosition = { x: 0.5, y: 0.5 }

    // Configuration
    this.config = {
      // Tilt range in degrees (maps to 0-1)
      betaRange: 60,   // Forward/backward tilt (-30 to +30 degrees)
      gammaRange: 60,  // Left/right tilt (-30 to +30 degrees)

      // Smoothing factor (0 = no smoothing, 1 = full smoothing)
      smoothing: 0.3,

      // Dead zone in center (degrees)
      deadZone: 3,

      // Update rate throttling (ms)
      updateInterval: 50  // 20Hz, matches hover throttle
    }

    // Callback for hover updates
    this.onHoverUpdate = null

    // State tracking
    this.isTouching = false
    this.lastUpdateTime = 0

    // Bound event handler for proper removal
    this._boundOrientationHandler = this._handleOrientation.bind(this)
  }

  /**
   * Request permission and prepare for listening (iOS 13+ requires user gesture)
   * @returns {Promise<boolean>} Success
   */
  async requestPermission() {
    // Defensive check for PlatformDetection dependency
    if (typeof PlatformDetection === 'undefined') {
      console.warn('AccelerometerHover: PlatformDetection not loaded')
      return false
    }

    if (!PlatformDetection.hasDeviceOrientation()) {
      console.warn('AccelerometerHover: DeviceOrientation not supported')
      return false
    }

    // iOS 13+ requires explicit permission request
    if (PlatformDetection.requiresOrientationPermission()) {
      try {
        const permission = await DeviceOrientationEvent.requestPermission()
        if (permission !== 'granted') {
          console.warn('AccelerometerHover: Permission denied')
          return false
        }
        this.hasPermission = true
        console.log('AccelerometerHover: Permission granted (iOS)')
      } catch (e) {
        console.error('AccelerometerHover: Failed to request permission:', e)
        return false
      }
    } else {
      // Android and older iOS don't require permission
      this.hasPermission = true
      console.log('AccelerometerHover: No permission required (Android/other)')
    }

    return true
  }

  /**
   * Start accelerometer hover tracking
   */
  start() {
    if (!this.hasPermission) {
      console.warn('AccelerometerHover: No permission, call requestPermission() first')
      return
    }

    if (this.isActive) {
      return
    }

    window.addEventListener('deviceorientation', this._boundOrientationHandler)
    this.isActive = true
    this.isCalibrated = false

    console.log('AccelerometerHover: Started')
  }

  /**
   * Stop accelerometer hover tracking
   */
  stop() {
    if (!this.isActive) {
      return
    }

    window.removeEventListener('deviceorientation', this._boundOrientationHandler)
    this.isActive = false

    console.log('AccelerometerHover: Stopped')
  }

  /**
   * Calibrate baseline (call when user wants current position to be center)
   */
  calibrate() {
    this.baseline = { ...this.orientation }
    this.isCalibrated = true
    console.log('AccelerometerHover: Calibrated at', this.baseline)
  }

  /**
   * Set touch state (accelerometer hover only active when NOT touching)
   * @param {boolean} touching - Is user touching screen
   */
  setTouchState(touching) {
    this.isTouching = touching
  }

  /**
   * Update configuration
   * @param {Object} newConfig - Partial config to merge
   */
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Handle device orientation event
   * @private
   */
  _handleOrientation(event) {
    if (!this.isActive || this.isTouching) {
      return
    }

    // Throttle updates
    const now = Date.now()
    if (now - this.lastUpdateTime < this.config.updateInterval) {
      return
    }
    this.lastUpdateTime = now

    // Store raw orientation
    this.orientation = {
      alpha: event.alpha || 0,  // Compass direction (0-360)
      beta: event.beta || 0,    // Front-back tilt (-180 to 180)
      gamma: event.gamma || 0   // Left-right tilt (-90 to 90)
    }

    // Auto-calibrate on first reading
    if (!this.isCalibrated) {
      this.calibrate()
    }

    // Calculate relative tilt from baseline
    let relativeBeta = this.orientation.beta - this.baseline.beta
    let relativeGamma = this.orientation.gamma - this.baseline.gamma

    // Apply dead zone
    if (Math.abs(relativeBeta) < this.config.deadZone) {
      relativeBeta = 0
    }
    if (Math.abs(relativeGamma) < this.config.deadZone) {
      relativeGamma = 0
    }

    // Map to normalized position (0-1)
    // Beta (front-back) maps to Y: tilt forward = up (0), tilt back = down (1)
    // Gamma (left-right) maps to X: tilt left = left (0), tilt right = right (1)
    let targetX = 0.5 + (relativeGamma / this.config.gammaRange)
    let targetY = 0.5 + (relativeBeta / this.config.betaRange)

    // Clamp to 0-1
    targetX = Math.max(0, Math.min(1, targetX))
    targetY = Math.max(0, Math.min(1, targetY))

    // Apply smoothing (lerp towards target)
    this.hoverPosition.x = this.hoverPosition.x * this.config.smoothing +
                           targetX * (1 - this.config.smoothing)
    this.hoverPosition.y = this.hoverPosition.y * this.config.smoothing +
                           targetY * (1 - this.config.smoothing)

    // Calculate intensity based on tilt magnitude
    const intensity = Math.sqrt(
      Math.pow(relativeBeta / this.config.betaRange, 2) +
      Math.pow(relativeGamma / this.config.gammaRange, 2)
    ) / Math.sqrt(2)  // Normalize to 0-1

    // Trigger callback
    if (this.onHoverUpdate) {
      this.onHoverUpdate({
        position: { ...this.hoverPosition },
        velocity: 0,  // Could calculate from change rate if needed
        intensity: Math.min(1, intensity),
        isRemote: false,
        source: 'accelerometer'
      })
    }
  }

  /**
   * Get current hover position
   * @returns {{x: number, y: number}} Position normalized 0-1
   */
  getPosition() {
    return { ...this.hoverPosition }
  }

  /**
   * Check if accelerometer hover is active and usable
   * @returns {boolean}
   */
  isReady() {
    return this.hasPermission && this.isActive && !this.isTouching
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stop()
    this.onHoverUpdate = null
  }
}

// Export for ES modules and expose on window for script tag usage
if (typeof window !== 'undefined') {
  window.AccelerometerHoverService = AccelerometerHoverService
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AccelerometerHoverService
}
