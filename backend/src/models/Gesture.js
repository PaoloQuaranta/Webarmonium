const { v4: uuidv4 } = require('uuid')

/**
 * Gesture Model
 * User input action translated into sonic parameters
 * Constitutional requirement: <200ms processing latency
 */
class Gesture {
  constructor(userId, roomId, gestureData) {
    this.id = uuidv4()
    this.userId = userId
    this.roomId = roomId
    this.timestamp = new Date()
    this.clientTimestamp = gestureData.timestamp || Date.now()

    // Validate and normalize gesture data
    this.type = this.validateType(gestureData.type)
    this.coordinates = this.validateCoordinates(gestureData.coordinates)
    this.intensity = this.validateIntensity(gestureData.intensity)
    this.duration = gestureData.duration || 0

    // Sonic parameters (to be populated by GestureProcessor)
    this.sonicParams = null
  }

  /**
   * Validate gesture type enum
   * @param {string} type - Gesture type
   * @returns {string} Validated type
   */
  validateType(type) {
    const validTypes = ['mouse', 'touch', 'gyroscope']
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid gesture type: ${type}. Must be: ${validTypes.join(', ')}`)
    }
    return type
  }

  /**
   * Validate and normalize coordinates (0.0-1.0 range)
   * @param {Object} coordinates - Coordinate object
   * @returns {Object} Validated coordinates
   */
  validateCoordinates(coordinates) {
    if (!coordinates || typeof coordinates !== 'object') {
      throw new Error('Coordinates are required and must be an object')
    }

    const { x, y, z } = coordinates

    // Validate required x, y coordinates
    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new Error('Coordinates x and y must be numbers')
    }

    if (x < 0 || x > 1 || y < 0 || y > 1) {
      throw new Error('Coordinates x and y must be in range 0.0-1.0')
    }

    const validatedCoords = { x, y }

    // Z coordinate is optional (gyroscope only)
    if (z !== undefined) {
      if (typeof z !== 'number') {
        throw new Error('Coordinate z must be a number when provided')
      }
      if (z < 0 || z > 1) {
        throw new Error('Coordinate z must be in range 0.0-1.0')
      }
      validatedCoords.z = z
    }

    return validatedCoords
  }

  /**
   * Validate intensity (0.0-1.0 range)
   * @param {number} intensity - Gesture intensity
   * @returns {number} Validated intensity
   */
  validateIntensity(intensity) {
    if (typeof intensity !== 'number') {
      throw new Error('Intensity must be a number')
    }

    if (intensity < 0 || intensity > 1) {
      throw new Error('Intensity must be in range 0.0-1.0')
    }

    return intensity
  }

  /**
   * Set sonic parameters after processing
   * @param {Object} sonicParams - Processed sonic parameters
   */
  setSonicParams(sonicParams) {
    if (!sonicParams || typeof sonicParams !== 'object') {
      throw new Error('Sonic parameters must be an object')
    }

    this.sonicParams = {
      ...sonicParams,
      processedAt: new Date().toISOString()
    }
  }

  /**
   * Calculate processing latency
   * Constitutional requirement: <200ms processing time
   * @returns {number} Latency in milliseconds
   */
  getProcessingLatency() {
    if (!this.sonicParams || !this.sonicParams.processedAt) {
      return null
    }

    const processedTime = new Date(this.sonicParams.processedAt).getTime()
    return processedTime - this.timestamp.getTime()
  }

  /**
   * Check if gesture meets constitutional latency requirement
   * @returns {boolean} True if latency is within 200ms
   */
  meetsLatencyRequirement() {
    const latency = this.getProcessingLatency()
    return latency !== null && latency <= 200
  }

  /**
   * Get gesture data for gesture-processed response
   * @returns {Object} Response data
   */
  toProcessedResponse() {
    return {
      gestureId: this.id,
      sonicParams: this.sonicParams,
      timestamp: this.timestamp.getTime(),
      latency: this.getProcessingLatency()
    }
  }

  /**
   * Get gesture data for gesture-echo broadcast
   * @returns {Object} Echo broadcast data
   */
  toEchoBroadcast() {
    return {
      userId: this.userId,
      gestureId: this.id,
      sonicParams: this.sonicParams,
      visualFeedback: this.getVisualFeedback()
    }
  }

  /**
   * Generate visual feedback data for Canvas rendering
   * @returns {Object} Visual feedback parameters
   */
  getVisualFeedback() {
    return {
      x: this.coordinates.x,
      y: this.coordinates.y,
      z: this.coordinates.z,
      intensity: this.intensity,
      type: this.type,
      timestamp: this.timestamp.getTime()
    }
  }

  /**
   * Get gesture data for memory learning
   * @returns {Object} Memory learning data
   */
  toMemoryLearningData() {
    return {
      type: this.type,
      coordinates: this.coordinates,
      intensity: this.intensity,
      sonicParams: this.sonicParams,
      timestamp: this.timestamp.getTime(),
      userId: this.userId // Anonymous user tracking for patterns
    }
  }

  /**
   * Check if gesture is recent (within specified time)
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 5 seconds)
   * @returns {boolean} True if gesture is recent
   */
  isRecent(maxAgeMs = 5000) {
    const ageMs = Date.now() - this.timestamp.getTime()
    return ageMs <= maxAgeMs
  }

  /**
   * Get gesture type-specific properties
   * @returns {Object} Type-specific data
   */
  getTypeSpecificData() {
    const baseData = {
      coordinates: this.coordinates,
      intensity: this.intensity
    }

    switch (this.type) {
      case 'mouse':
        return {
          ...baseData,
          hasZ: false,
          inputMethod: 'pointer'
        }

      case 'touch':
        return {
          ...baseData,
          hasZ: false,
          inputMethod: 'touch',
          duration: this.duration
        }

      case 'gyroscope':
        return {
          ...baseData,
          hasZ: true,
          inputMethod: 'motion',
          orientation: this.coordinates
        }

      default:
        return baseData
    }
  }

  /**
   * Static method to create gesture from client data
   * @param {string} userId - User ID
   * @param {string} roomId - Room ID
   * @param {Object} clientData - Raw gesture data from client
   * @returns {Gesture} New gesture instance
   */
  static fromClientData(userId, roomId, clientData) {
    if (!userId || !roomId) {
      throw new Error('User ID and Room ID are required')
    }

    return new Gesture(userId, roomId, clientData)
  }

  /**
   * Validate gesture for processing
   * Constitutional requirement: Ensure gesture data integrity
   * @throws {Error} If gesture data is invalid
   */
  validateForProcessing() {
    if (!this.id || !this.userId || !this.roomId) {
      throw new Error('Gesture ID, User ID, and Room ID are required')
    }

    if (!this.type || !this.coordinates || this.intensity === undefined) {
      throw new Error('Gesture type, coordinates, and intensity are required')
    }

    if (!this.timestamp) {
      throw new Error('Gesture timestamp is required')
    }

    // Validate gesture is not too old (prevent replay attacks)
    const ageMs = Date.now() - this.timestamp.getTime()
    if (ageMs > 10000) { // 10 seconds max age
      throw new Error('Gesture is too old to process')
    }
  }
}

module.exports = Gesture