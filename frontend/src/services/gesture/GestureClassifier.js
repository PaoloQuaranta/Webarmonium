/**
 * GestureClassifier.js
 * Classifies gestures with direction, intensity, speed, and musical properties
 * Phase 3 refactoring - Decomposed from EnhancedGestureCapture.js
 */
class GestureClassifier {
  constructor() {
    // Classification thresholds
    const thresholds = window.GestureConstants?.GESTURE_THRESHOLDS || {
      minGestureLength: 20,
      minGestureDuration: 100,
      directionThreshold: 0.3,
      maxReasonableSpeed: 1000
    }

    this.config = {
      minGestureLength: thresholds.minGestureLength,
      minGestureDuration: thresholds.minGestureDuration,
      directionThreshold: thresholds.directionThreshold,
      maxReasonableSpeed: thresholds.maxReasonableSpeed
    }

    // Speed thresholds
    this.speedThresholds = window.GestureConstants?.SPEED_THRESHOLDS || {
      slow: 0.2,
      medium: 0.5,
      fast: 0.8
    }
  }

  /**
   * Classify gesture with musical properties
   * @param {Object} gesture - Raw gesture data
   * @returns {Object} Classified gesture
   */
  classifyGesture(gesture) {
    const startTime = performance.now()
    const classified = { ...gesture }

    // Add coordinates for compatibility
    classified.coordinates = this.extractCoordinates(gesture)

    // Calculate gesture properties
    const path = gesture.path || []
    const duration = gesture.duration || 0

    if (path.length < 2 || duration < this.config.minGestureDuration) {
      // Insufficient data for classification
      classified.direction = 'unknown'
      classified.intensity = 0.1
      classified.speed = 0.1
      classified.size = 0
      return classified
    }

    // Calculate size (total path length)
    const totalDistance = this.calculatePathLength(path)

    // Calculate direction
    const start = path[0]
    const end = path[path.length - 1]
    const deltaX = end.x - start.x
    const deltaY = end.y - start.y

    classified.direction = this.classifyDirection(deltaX, deltaY)

    // Calculate intensity (based on acceleration and size)
    classified.intensity = this.calculateIntensity(gesture, totalDistance)

    // Calculate speed
    const averageSpeed = totalDistance / (duration / 1000)
    classified.speed = Math.min(averageSpeed / this.config.maxReasonableSpeed, 1)

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
      acceleration: this.getMaxAcceleration(gesture)
    }

    // Calculate processing time
    const processingTime = performance.now() - startTime
    classified.processingTime = processingTime

    return classified
  }

  /**
   * Extract coordinates from gesture
   * @param {Object} gesture - Gesture data
   * @returns {Object} Coordinates { x, y }
   */
  extractCoordinates(gesture) {
    const defaultPosition = window.GestureConstants?.DEFAULT_POSITION || { x: 0.5, y: 0.5 }

    if (gesture.currentPosition) {
      return {
        x: gesture.currentPosition.x,
        y: gesture.currentPosition.y
      }
    } else if (gesture.path && gesture.path.length > 0) {
      const lastPos = gesture.path[gesture.path.length - 1]
      return {
        x: lastPos.x,
        y: lastPos.y
      }
    }

    return defaultPosition
  }

  /**
   * Calculate total path length
   * @param {Array} path - Array of coordinates
   * @returns {number} Total distance
   */
  calculatePathLength(path) {
    let totalDistance = 0

    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x
      const dy = path[i].y - path[i - 1].y
      totalDistance += Math.sqrt(dx * dx + dy * dy)
    }

    return totalDistance
  }

  /**
   * Classify gesture direction
   * @param {number} deltaX - X distance
   * @param {number} deltaY - Y distance
   * @returns {string} Direction classification
   */
  classifyDirection(deltaX, deltaY) {
    const threshold = this.config.directionThreshold
    const angle = Math.atan2(deltaY, deltaX)
    const degrees = angle * (180 / Math.PI)

    // Check for tap (minimal movement)
    if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
      return 'tap'
    }

    // Classify based on angle
    if (degrees >= -22.5 && degrees < 22.5) {
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
   * Calculate gesture intensity
   * @param {Object} gesture - Gesture data
   * @param {number} totalDistance - Total path length
   * @returns {number} Intensity (0-1)
   */
  calculateIntensity(gesture, totalDistance) {
    const maxAcceleration = this.getMaxAcceleration(gesture)

    // Normalize values
    const normalizedSize = Math.min(totalDistance / 0.5, 1)
    const normalizedAcceleration = Math.min(maxAcceleration / 10000, 1)

    // Combine size and acceleration
    return Math.min(1, (normalizedSize * 0.6) + (normalizedAcceleration * 0.4))
  }

  /**
   * Get maximum acceleration from gesture
   * @param {Object} gesture - Gesture data
   * @returns {number} Maximum acceleration
   */
  getMaxAcceleration(gesture) {
    return Math.max(
      Math.abs(gesture.acceleration?.x || 0),
      Math.abs(gesture.acceleration?.y || 0)
    )
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
   * Classify speed category
   * @param {number} speed - Normalized speed (0-1)
   * @returns {string} Speed category ('slow', 'medium', 'fast')
   */
  classifySpeed(speed) {
    if (speed >= this.speedThresholds.fast) return 'fast'
    if (speed >= this.speedThresholds.medium) return 'medium'
    return 'slow'
  }

  /**
   * Check if gesture is a tap
   * @param {Object} gesture - Gesture data
   * @returns {boolean} True if gesture is a tap
   */
  isTap(gesture) {
    const path = gesture.path || []
    const duration = gesture.duration || 0

    if (path.length < 2) return true
    if (duration < this.config.minGestureDuration) return true

    const totalDistance = this.calculatePathLength(path)
    return totalDistance < this.config.minGestureLength / 100 // Convert to normalized units
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.GestureClassifier = GestureClassifier
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GestureClassifier
}
