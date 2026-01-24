/**
 * RawGestureData.js - Entry #169
 *
 * Stores raw gesture data before quantization.
 * Preserves the full kinematic information for later
 * section-aware musical generation.
 */

const PHI = 1.618033988749895

class RawGestureData {
  /**
   * Create a RawGestureData from gesture input
   * @param {Object} gestureData - Raw gesture from frontend
   * @param {Object} metadata - Additional metadata
   */
  constructor(gestureData, metadata = {}) {
    // Generate deterministic ID
    this.id = metadata.id || `raw_${Date.now()}_${Math.floor(Math.random() * 10000)}`

    // Raw kinematic data
    this.velocity = this._normalizeValue(gestureData.velocity, 0, 100) ?? 0.5
    this.curvature = gestureData.curvature ?? 0.5
    this.acceleration = gestureData.acceleration ?? 0
    this.pressure = gestureData.pressure ?? gestureData.intensity ?? 0.5

    // Position
    this.position = {
      x: gestureData.position?.x ?? gestureData.coordinates?.x ?? 0.5,
      y: gestureData.position?.y ?? gestureData.coordinates?.y ?? 0.5
    }

    // Trajectory (array of points over time)
    this.trajectory = this._normalizeTrajectory(gestureData.trajectory || gestureData.path || [])

    // Duration
    this.duration = gestureData.duration ?? 1000

    // Angle (direction of gesture)
    this.angle = gestureData.angle ?? this._calculateAngle()

    // Computed characteristics
    this.smoothness = this._computeSmoothness()
    this.directionality = this._computeDirectionality()
    this.gestalt = this._computeGestalt()

    // Melodic contour (0-1 pitch, 0-1 time, 0-1 intensity)
    this.contour = this._extractContour()

    // Metadata
    this.timestamp = metadata.timestamp || Date.now()
    this.userId = metadata.userId
    this.roomId = metadata.roomId
    this.weight = metadata.weight ?? 1.0
    this.gestureType = gestureData.type || gestureData.action || 'drag'

    // Musical classification (to be filled by MaterialLibrary)
    this.harmonicFunction = metadata.harmonicFunction || null
    this.character = metadata.character || null
  }

  /**
   * Normalize a value to 0-1 range
   */
  _normalizeValue(value, min = 0, max = 100) {
    if (value === undefined || value === null) return null
    return Math.max(0, Math.min(1, (value - min) / (max - min)))
  }

  /**
   * Normalize trajectory points
   */
  _normalizeTrajectory(trajectory) {
    if (!Array.isArray(trajectory) || trajectory.length === 0) {
      // Create minimal trajectory from position
      return [{
        x: this.position?.x ?? 0.5,
        y: this.position?.y ?? 0.5,
        t: 0,
        pressure: this.pressure
      }]
    }

    // Ensure all points have required properties
    return trajectory.map((point, i) => ({
      x: point.x ?? point.clientX ?? 0.5,
      y: point.y ?? point.clientY ?? 0.5,
      t: point.t ?? point.timestamp ?? i * 16, // Assume 60fps if no timestamp
      pressure: point.pressure ?? this.pressure
    }))
  }

  /**
   * Calculate angle from trajectory
   */
  _calculateAngle() {
    if (this.trajectory.length < 2) return 0

    const first = this.trajectory[0]
    const last = this.trajectory[this.trajectory.length - 1]

    return Math.atan2(last.y - first.y, last.x - first.x) * (180 / Math.PI)
  }

  /**
   * Compute smoothness from jerk (rate of acceleration change)
   * Lower jerk = smoother gesture = higher smoothness value
   */
  _computeSmoothness() {
    if (this.trajectory.length < 3) return 0.5

    let totalJerk = 0

    for (let i = 2; i < this.trajectory.length; i++) {
      const p0 = this.trajectory[i - 2]
      const p1 = this.trajectory[i - 1]
      const p2 = this.trajectory[i]

      const dt1 = Math.max(1, p1.t - p0.t)
      const dt2 = Math.max(1, p2.t - p1.t)

      // Velocity between points
      const v1 = Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2)) / dt1
      const v2 = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) / dt2

      // Acceleration change (jerk approximation)
      const acc1 = v1 / dt1
      const acc2 = v2 / dt2

      totalJerk += Math.abs(acc2 - acc1)
    }

    // Normalize jerk to 0-1 range (inverted: low jerk = high smoothness)
    const avgJerk = totalJerk / (this.trajectory.length - 2)
    return Math.max(0, Math.min(1, 1 - avgJerk * 1000))
  }

  /**
   * Compute directionality (how direct vs wandering the path is)
   * High directionality = straight line, Low = circular/random
   */
  _computeDirectionality() {
    if (this.trajectory.length < 2) return 0.5

    const start = this.trajectory[0]
    const end = this.trajectory[this.trajectory.length - 1]

    // Direct distance from start to end
    const directDistance = Math.sqrt(
      Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
    )

    // Total path length
    const totalDistance = this._getTotalPathLength()

    if (totalDistance === 0) return 0.5

    return Math.min(1, directDistance / totalDistance)
  }

  /**
   * Get total path length of trajectory
   */
  _getTotalPathLength() {
    let total = 0
    for (let i = 1; i < this.trajectory.length; i++) {
      const p1 = this.trajectory[i - 1]
      const p2 = this.trajectory[i]
      total += Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
    }
    return total
  }

  /**
   * Classify gesture shape (gestalt)
   */
  _computeGestalt() {
    const dir = this.directionality
    const smooth = this.smoothness

    if (dir > 0.8 && smooth > 0.6) return 'linear'
    if (dir < 0.3 && smooth > 0.6) return 'circular'
    if (smooth < 0.4) return 'angular'
    return 'organic'
  }

  /**
   * Extract melodic contour from trajectory
   * Y position maps to relative pitch (inverted: higher Y = lower pitch in canvas)
   * X position maps to time
   * Pressure/velocity maps to intensity
   */
  _extractContour() {
    if (this.trajectory.length === 0) {
      return [{
        pitch: 1 - this.position.y, // Invert Y for musical intuition
        time: 0,
        intensity: this.pressure
      }]
    }

    // Normalize time to 0-1
    const startTime = this.trajectory[0].t
    const endTime = this.trajectory[this.trajectory.length - 1].t
    const duration = Math.max(1, endTime - startTime)

    return this.trajectory.map(point => ({
      pitch: 1 - point.y, // Invert Y: top of screen = high pitch
      time: (point.t - startTime) / duration,
      intensity: point.pressure ?? this.pressure
    }))
  }

  /**
   * Get simplified contour with fewer points
   * @param {number} targetPoints - Target number of points
   * @returns {Array} Simplified contour
   */
  getSimplifiedContour(targetPoints = 8) {
    if (this.contour.length <= targetPoints) {
      return [...this.contour]
    }

    const step = this.contour.length / targetPoints
    const simplified = []

    for (let i = 0; i < targetPoints; i++) {
      const idx = Math.floor(i * step)
      simplified.push(this.contour[idx])
    }

    return simplified
  }

  /**
   * Get direction category
   * @returns {string} Direction (up, down, left, right, diagonal, center)
   */
  getDirection() {
    if (this.trajectory.length < 2) return 'center'

    const start = this.trajectory[0]
    const end = this.trajectory[this.trajectory.length - 1]
    const dx = end.x - start.x
    const dy = end.y - start.y

    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // If movement is small, it's centered
    if (absDx < 0.1 && absDy < 0.1) return 'center'

    // Determine primary direction
    if (absDx > absDy * 1.5) {
      return dx > 0 ? 'right' : 'left'
    } else if (absDy > absDx * 1.5) {
      return dy > 0 ? 'down' : 'up'
    } else {
      return 'diagonal'
    }
  }

  /**
   * Get energy level derived from velocity and acceleration
   * @returns {number} Energy 0-1
   */
  getEnergy() {
    return this.velocity * 0.6 + Math.abs(this.acceleration) * 0.2 + (1 - this.smoothness) * 0.2
  }

  /**
   * Get complexity derived from trajectory characteristics
   * @returns {number} Complexity 0-1
   */
  getComplexity() {
    const gestaltComplexity = {
      linear: 0.2,
      circular: 0.5,
      organic: 0.6,
      angular: 0.8
    }

    return (gestaltComplexity[this.gestalt] || 0.5) * 0.5 +
           (1 - this.directionality) * 0.3 +
           (this.contour.length / 100) * 0.2
  }

  /**
   * Check if gesture is suitable for melodic material
   * @returns {boolean}
   */
  isMelodicCandidate() {
    return this.contour.length >= 3 &&
           this.duration > 200 &&
           this.getComplexity() > 0.3
  }

  /**
   * Check if gesture is suitable for rhythmic material
   * @returns {boolean}
   */
  isRhythmicCandidate() {
    return this.velocity > 0.6 ||
           this.gestalt === 'angular' ||
           this.smoothness < 0.4
  }

  /**
   * Check if gesture is suitable for textural material
   * @returns {boolean}
   */
  isTexturalCandidate() {
    return this.smoothness > 0.7 &&
           this.velocity < 0.4 &&
           this.gestalt === 'circular'
  }

  /**
   * Get age in milliseconds
   * @returns {number}
   */
  getAge() {
    return Date.now() - this.timestamp
  }

  /**
   * Serialize to JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      velocity: this.velocity,
      curvature: this.curvature,
      acceleration: this.acceleration,
      pressure: this.pressure,
      position: this.position,
      trajectory: this.trajectory,
      duration: this.duration,
      angle: this.angle,
      smoothness: this.smoothness,
      directionality: this.directionality,
      gestalt: this.gestalt,
      contour: this.contour,
      timestamp: this.timestamp,
      userId: this.userId,
      roomId: this.roomId,
      weight: this.weight,
      gestureType: this.gestureType,
      harmonicFunction: this.harmonicFunction,
      character: this.character
    }
  }

  /**
   * Create from JSON
   * @param {Object} json
   * @returns {RawGestureData}
   */
  static fromJSON(json) {
    const gesture = new RawGestureData({
      velocity: json.velocity * 100, // Denormalize
      curvature: json.curvature,
      acceleration: json.acceleration,
      pressure: json.pressure,
      position: json.position,
      trajectory: json.trajectory,
      duration: json.duration,
      angle: json.angle,
      type: json.gestureType
    }, {
      id: json.id,
      timestamp: json.timestamp,
      userId: json.userId,
      roomId: json.roomId,
      weight: json.weight,
      harmonicFunction: json.harmonicFunction,
      character: json.character
    })

    // Override computed values with stored ones
    gesture.smoothness = json.smoothness
    gesture.directionality = json.directionality
    gesture.gestalt = json.gestalt
    gesture.contour = json.contour

    return gesture
  }

  /**
   * Human-readable description
   * @returns {string}
   */
  toString() {
    return `RawGesture[${this.id}]: ${this.gestalt} gesture, ` +
           `vel=${this.velocity.toFixed(2)}, ` +
           `smooth=${this.smoothness.toFixed(2)}, ` +
           `dir=${this.getDirection()}, ` +
           `pts=${this.contour.length}`
  }
}

module.exports = RawGestureData
