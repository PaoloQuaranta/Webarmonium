const Gesture = require('../models/Gesture')

/**
 * GestureProcessor Service
 * Transforms raw gesture data into sonic parameters with real-time processing
 * Constitutional requirement: <200ms processing latency, cross-device normalization
 */
class GestureProcessor {
  constructor() {
    this.processingStats = {
      totalProcessed: 0,
      averageLatency: 0,
      maxLatency: 0,
      latencyViolations: 0,
      typeDistribution: new Map()
    }
  }

  /**
   * Process raw gesture data into sonic parameters
   * @param {string} userId - User ID
   * @param {string} roomId - Room ID
   * @param {Object} gestureData - Raw gesture data from client
   * @returns {Gesture} Processed gesture with sonic parameters
   */
  processGesture(userId, roomId, gestureData) {
    const startTime = Date.now()

    // Validate inputs
    if (!userId || !roomId || !gestureData) {
      throw new Error('User ID, Room ID, and gesture data are required')
    }

    // Create gesture instance with validation
    const gesture = Gesture.fromClientData(userId, roomId, gestureData)
    gesture.validateForProcessing()

    // Process sonic parameters based on gesture type
    const sonicParams = this.generateSonicParameters(gesture)
    gesture.setSonicParams(sonicParams)

    // Calculate and validate processing latency
    const processingTime = Date.now() - startTime
    this.updateProcessingStats(gesture, processingTime)

    // Constitutional requirement: <200ms processing time
    if (processingTime > 200) {
      console.warn(`Gesture processing exceeded 200ms: ${processingTime}ms for gesture ${gesture.id}`)
    }

    return gesture
  }

  /**
   * Generate sonic parameters from gesture data
   * @param {Gesture} gesture - Validated gesture instance
   * @returns {Object} Sonic parameters
   */
  generateSonicParameters(gesture) {
    const params = {
      frequency: this.calculateFrequency(gesture),
      amplitude: this.calculateAmplitude(gesture),
      waveform: this.determineWaveform(gesture),
      filter: this.determineFilter(gesture),
      envelope: this.generateEnvelope(gesture),
      spatialParams: this.calculateSpatialParameters(gesture)
    }

    // Add processing metadata
    params.processedAt = new Date().toISOString()
    params.processingVersion = '1.0.0'
    params.inputDevice = this.detectInputDevice(gesture)

    return params
  }

  /**
   * Calculate frequency from gesture coordinates
   * Maps X coordinate to frequency range (220Hz - 880Hz)
   * @param {Gesture} gesture - Gesture instance
   * @returns {number} Frequency in Hz
   */
  calculateFrequency(gesture) {
    const { x, y, z } = gesture.coordinates
    const baseFrequency = 220 // A3

    // Primary frequency mapping from X coordinate
    let frequency = baseFrequency + (x * 660) // 220-880 Hz range

    // Y coordinate adds harmonic modulation
    if (y > 0.7) {
      frequency *= 1.5 // Perfect fifth up
    } else if (y < 0.3) {
      frequency *= 0.75 // Perfect fourth down
    }

    // Z coordinate (gyroscope) adds octave shifts
    if (z !== undefined) {
      if (z > 0.8) {
        frequency *= 2 // Octave up
      } else if (z < 0.2) {
        frequency *= 0.5 // Octave down
      }
    }

    // Intensity affects micro-tuning
    const intensityModulation = (gesture.intensity - 0.5) * 10 // ±5Hz
    frequency += intensityModulation

    // Ensure frequency stays within audible range
    return Math.max(20, Math.min(20000, frequency))
  }

  /**
   * Calculate amplitude from gesture intensity and coordinates
   * @param {Gesture} gesture - Gesture instance
   * @returns {number} Amplitude (0.0-1.0)
   */
  calculateAmplitude(gesture) {
    const { y } = gesture.coordinates
    const baseAmplitude = gesture.intensity * 0.8 // Max 80% base volume

    // Y coordinate affects amplitude curve
    let amplitudeMultiplier = 1.0
    if (y > 0.8) {
      amplitudeMultiplier = 1.2 // Boost for top area
    } else if (y < 0.2) {
      amplitudeMultiplier = 0.6 // Reduce for bottom area
    }

    const finalAmplitude = baseAmplitude * amplitudeMultiplier

    // Constitutional requirement: Ensure safe amplitude levels
    return Math.max(0, Math.min(1, finalAmplitude))
  }

  /**
   * Determine waveform based on gesture characteristics
   * @param {Gesture} gesture - Gesture instance
   * @returns {string} Waveform type
   */
  determineWaveform(gesture) {
    const { type, coordinates, intensity } = gesture

    // Device-specific waveform mapping
    switch (type) {
      case 'mouse':
        return coordinates.x > 0.5 ? 'sawtooth' : 'square'

      case 'touch':
        return intensity > 0.7 ? 'square' : 'triangle'

      case 'gyroscope':
        if (coordinates.z > 0.6) return 'triangle'
        if (coordinates.z < 0.4) return 'sawtooth'
        return 'sine'

      default:
        return 'sine'
    }
  }

  /**
   * Determine filter type and parameters
   * @param {Gesture} gesture - Gesture instance
   * @returns {Object} Filter parameters
   */
  determineFilter(gesture) {
    const { coordinates, intensity } = gesture

    let filterType = 'none'
    let cutoffFrequency = 1000
    let resonance = 0

    // Filter selection based on gesture position
    if (coordinates.y < 0.3) {
      filterType = 'lowpass'
      cutoffFrequency = 200 + (coordinates.x * 800) // 200-1000 Hz
      resonance = intensity * 10 // 0-10 resonance
    } else if (coordinates.y > 0.7) {
      filterType = 'highpass'
      cutoffFrequency = 100 + (coordinates.x * 400) // 100-500 Hz
      resonance = intensity * 5 // 0-5 resonance
    } else if (coordinates.x > 0.4 && coordinates.x < 0.6) {
      filterType = 'bandpass'
      cutoffFrequency = 300 + (coordinates.y * 1000) // 300-1300 Hz
      resonance = intensity * 8 // 0-8 resonance
    }

    return {
      type: filterType,
      cutoffFrequency,
      resonance: Math.max(0, Math.min(20, resonance))
    }
  }

  /**
   * Generate envelope parameters based on gesture characteristics
   * @param {Gesture} gesture - Gesture instance
   * @returns {Object} ADSR envelope parameters
   */
  generateEnvelope(gesture) {
    const { type, intensity, duration } = gesture

    let attack = 0.1
    let decay = 0.2
    let sustain = 0.7
    let release = 0.5

    // Gesture type affects envelope shape
    switch (type) {
      case 'touch':
        // Touch gestures have quick attack, sustain based on duration
        attack = 0.05
        decay = 0.1
        sustain = Math.max(0.5, intensity)
        release = duration ? Math.min(1.0, duration / 1000) : 0.3
        break

      case 'mouse':
        // Mouse gestures have smooth envelope
        attack = 0.1 + (intensity * 0.2) // 0.1-0.3s
        decay = 0.15
        sustain = 0.6 + (intensity * 0.3) // 0.6-0.9
        release = 0.4 + ((1 - intensity) * 0.4) // 0.4-0.8s
        break

      case 'gyroscope':
        // Gyroscope gestures have longer, smoother envelopes
        attack = 0.2
        decay = 0.3
        sustain = 0.8
        release = 0.6 + (intensity * 0.4) // 0.6-1.0s
        break
    }

    return {
      attack: Math.max(0.01, Math.min(2.0, attack)),
      decay: Math.max(0.01, Math.min(2.0, decay)),
      sustain: Math.max(0.0, Math.min(1.0, sustain)),
      release: Math.max(0.01, Math.min(3.0, release))
    }
  }

  /**
   * Calculate spatial audio parameters
   * @param {Gesture} gesture - Gesture instance
   * @returns {Object} Spatial parameters
   */
  calculateSpatialParameters(gesture) {
    const { coordinates } = gesture

    // Pan based on X coordinate (-1 to +1)
    const pan = (coordinates.x * 2) - 1

    // Distance/reverb based on Y coordinate
    const distance = coordinates.y // 0 = near, 1 = far
    const reverbAmount = Math.max(0, Math.min(1, distance * 0.8))

    // Elevation based on Z coordinate (if available)
    const elevation = coordinates.z !== undefined ?
      (coordinates.z * 2) - 1 : 0 // -1 to +1

    return {
      pan: Math.max(-1, Math.min(1, pan)),
      distance,
      reverbAmount,
      elevation
    }
  }

  /**
   * Detect input device characteristics for optimization
   * @param {Gesture} gesture - Gesture instance
   * @returns {Object} Device characteristics
   */
  detectInputDevice(gesture) {
    const characteristics = {
      type: gesture.type,
      hasZ: gesture.coordinates.z !== undefined,
      precision: 'medium'
    }

    // Estimate precision based on coordinate values
    const coordPrecision = Math.max(
      this.getPrecision(gesture.coordinates.x),
      this.getPrecision(gesture.coordinates.y)
    )

    if (coordPrecision > 3) {
      characteristics.precision = 'high'
    } else if (coordPrecision < 2) {
      characteristics.precision = 'low'
    }

    // Device-specific optimizations
    switch (gesture.type) {
      case 'touch':
        characteristics.multitouch = false // Would need additional data
        characteristics.pressureSensitive = gesture.intensity !== undefined
        break

      case 'mouse':
        characteristics.hasWheel = false // Would need additional data
        characteristics.highDPI = characteristics.precision === 'high'
        break

      case 'gyroscope':
        characteristics.motionSensitive = true
        characteristics.orientationTracking = true
        break
    }

    return characteristics
  }

  /**
   * Estimate coordinate precision (decimal places)
   * @param {number} value - Coordinate value
   * @returns {number} Estimated decimal places
   */
  getPrecision(value) {
    if (!value || !isFinite(value)) return 0

    const str = value.toString()
    const decimalIndex = str.indexOf('.')

    return decimalIndex === -1 ? 0 : str.length - decimalIndex - 1
  }

  /**
   * Update processing statistics
   * @param {Gesture} gesture - Processed gesture
   * @param {number} processingTime - Processing time in milliseconds
   */
  updateProcessingStats(gesture, processingTime) {
    this.processingStats.totalProcessed++

    // Update average latency (rolling average)
    const previousAvg = this.processingStats.averageLatency
    const count = this.processingStats.totalProcessed
    this.processingStats.averageLatency =
      ((previousAvg * (count - 1)) + processingTime) / count

    // Update max latency
    if (processingTime > this.processingStats.maxLatency) {
      this.processingStats.maxLatency = processingTime
    }

    // Count latency violations (>200ms)
    if (processingTime > 200) {
      this.processingStats.latencyViolations++
    }

    // Update type distribution
    const currentCount = this.processingStats.typeDistribution.get(gesture.type) || 0
    this.processingStats.typeDistribution.set(gesture.type, currentCount + 1)
  }

  /**
   * Get processing performance statistics
   * @returns {Object} Performance statistics
   */
  getProcessingStats() {
    const stats = { ...this.processingStats }

    // Calculate additional metrics
    stats.latencyViolationRate = stats.totalProcessed > 0 ?
      stats.latencyViolations / stats.totalProcessed : 0

    stats.typeDistributionPercent = {}
    this.processingStats.typeDistribution.forEach((count, type) => {
      stats.typeDistributionPercent[type] =
        (count / stats.totalProcessed) * 100
    })

    return stats
  }

  /**
   * Reset processing statistics
   */
  resetStats() {
    this.processingStats = {
      totalProcessed: 0,
      averageLatency: 0,
      maxLatency: 0,
      latencyViolations: 0,
      typeDistribution: new Map()
    }
  }

  /**
   * Batch process multiple gestures
   * @param {Array} gestureDataArray - Array of gesture data objects
   * @returns {Array} Array of processed gestures
   */
  batchProcessGestures(gestureDataArray) {
    if (!Array.isArray(gestureDataArray)) {
      throw new Error('Gesture data must be an array')
    }

    const results = []
    const batchStartTime = Date.now()

    gestureDataArray.forEach(({ userId, roomId, gestureData }) => {
      try {
        const processedGesture = this.processGesture(userId, roomId, gestureData)
        results.push({
          success: true,
          gesture: processedGesture
        })
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          originalData: { userId, roomId, gestureData }
        })
      }
    })

    const batchProcessingTime = Date.now() - batchStartTime

    return {
      results,
      batchStats: {
        totalGestures: gestureDataArray.length,
        successfulGestures: results.filter(r => r.success).length,
        failedGestures: results.filter(r => !r.success).length,
        batchProcessingTime,
        averageTimePerGesture: batchProcessingTime / gestureDataArray.length
      }
    }
  }

  /**
   * Validate processor state and performance
   * Constitutional requirement: Ensure processing quality
   * @throws {Error} If processor state is invalid
   */
  validateProcessorState() {
    const stats = this.getProcessingStats()

    // Validate constitutional latency requirement
    if (stats.averageLatency > 200) {
      throw new Error(`Average processing latency ${stats.averageLatency}ms exceeds 200ms requirement`)
    }

    if (stats.latencyViolationRate > 0.05) { // 5% tolerance
      throw new Error(`Latency violation rate ${stats.latencyViolationRate * 100}% exceeds 5% tolerance`)
    }

    // Validate processing consistency
    if (stats.totalProcessed > 100 && stats.maxLatency > 1000) {
      throw new Error(`Maximum latency ${stats.maxLatency}ms indicates processing issues`)
    }
  }
}

module.exports = GestureProcessor