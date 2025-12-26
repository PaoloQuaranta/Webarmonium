/**
 * ParameterController.js
 * Handles real-time parameter updates, gesture buffering, and performance monitoring
 * Extracted from AudioService.js for Phase 2 refactoring
 */
class ParameterController {
  constructor(gestureAudioMapper = null) {
    // Gesture audio mapper for parameter generation
    this.gestureAudioMapper = gestureAudioMapper

    // Update loop management
    this.updateLoopActive = false
    this.targetFPS = 60
    this.updateTimeSlice = 1000 / this.targetFPS

    // Gesture buffer for smooth interpolation
    this.gestureBuffer = []
    this.maxBufferSize = 10

    // Current parameter state
    this.currentParameters = {
      frequency: 440,
      amplitude: 0.5,
      waveform: 'sawtooth',
      filter: {
        type: 'none',
        cutoffFrequency: 1000,
        resonance: 1
      },
      envelope: {
        attack: 0.1,
        decay: 0.2,
        sustain: 0.7,
        release: 0.5
      },
      spatialParams: {
        pan: 0,
        distance: 0.5,
        reverbAmount: 0.2,
        elevation: 0
      },
      tier: 'local',
      velocity: 200,
      hysteresisThreshold: 0.15
    }

    // Performance metrics
    this.performanceMetrics = {
      gestureToSoundLatency: [],
      averageLatency: 0,
      maxLatency: 0,
      parameterUpdatesPerSecond: 0,
      droppedUpdates: 0,
      totalUpdates: 0
    }

    // Audio context state
    this.audioContextState = 'not-initialized'

    // Reference to audio engine (set by AudioService)
    this.audioEngine = null
  }

  /**
   * Set gesture audio mapper
   * @param {GestureAudioMapper} mapper - Gesture audio mapper instance
   */
  setGestureAudioMapper(mapper) {
    this.gestureAudioMapper = mapper
  }

  /**
   * Set audio engine reference
   * @param {Object} audioEngine - Audio engine instance
   */
  setAudioEngine(audioEngine) {
    this.audioEngine = audioEngine
  }

  /**
   * Process gesture and generate real-time audio parameters
   * @param {Object} gestureData - Normalized gesture data
   * @returns {Object} Audio parameters for immediate feedback
   */
  processGestureAudio(gestureData) {
    const startTime = performance.now()

    try {
      // Add gesture to buffer for interpolation
      this.addGestureToBuffer(gestureData)

      // Generate audio parameters from gesture
      let audioParams
      if (this.gestureAudioMapper) {
        audioParams = this.gestureAudioMapper.mapGestureToAudio(gestureData)
      } else {
        audioParams = this.mapGestureToAudioFallback(gestureData)
      }

      // Update current parameter state
      this.updateCurrentParameters(audioParams)

      // Calculate processing latency
      const processingLatency = performance.now() - startTime

      // Track performance metrics
      this.updatePerformanceMetrics(processingLatency)

      // Constitutional requirement check
      if (processingLatency > 200) {
        console.warn(`Gesture-to-audio latency ${processingLatency}ms exceeds 200ms constitutional requirement`)
      }

      return {
        ...audioParams,
        processingLatency,
        timestamp: Date.now()
      }

    } catch (error) {
      console.error('Error processing gesture audio:', error)
      return null
    }
  }

  /**
   * Fallback gesture-to-audio mapping if no mapper is set
   * @param {Object} gestureData - Gesture data
   * @returns {Object} Audio parameters
   */
  mapGestureToAudioFallback(gestureData) {
    const { type, coordinates, intensity } = gestureData

    return {
      frequency: 220 + (coordinates?.x || 0.5) * 660,
      amplitude: 0.1 + (intensity || 0.5) * 0.7,
      waveform: 'sine',
      filter: {
        type: 'lowpass',
        cutoffFrequency: 1000,
        resonance: 1
      },
      envelope: {
        attack: 0.1,
        decay: 0.2,
        sustain: 0.7,
        release: 0.5
      },
      spatialParams: {
        pan: ((coordinates?.x || 0.5) * 2) - 1,
        distance: coordinates?.y || 0.5,
        reverbAmount: 0.2,
        elevation: 0
      }
    }
  }

  /**
   * Add gesture to buffer for interpolation
   * @param {Object} gestureData - Gesture data
   */
  addGestureToBuffer(gestureData) {
    this.gestureBuffer.push({
      ...gestureData,
      bufferTimestamp: performance.now()
    })

    // Limit buffer size
    if (this.gestureBuffer.length > this.maxBufferSize) {
      this.gestureBuffer.shift()
    }
  }

  /**
   * Update current parameter state
   * @param {Object} newParams - New parameter values
   */
  updateCurrentParameters(newParams) {
    this.currentParameters = {
      ...this.currentParameters,
      ...newParams,
      filter: {
        ...this.currentParameters.filter,
        ...newParams.filter
      },
      envelope: {
        ...this.currentParameters.envelope,
        ...newParams.envelope
      },
      spatialParams: {
        ...this.currentParameters.spatialParams,
        ...newParams.spatialParams
      }
    }

    // Update mapper's current parameters if available
    if (this.gestureAudioMapper) {
      this.gestureAudioMapper.updateCurrentParameters(newParams)
    }
  }

  /**
   * Start 60fps parameter update loop
   */
  startUpdateLoop() {
    if (this.updateLoopActive) return

    this.updateLoopActive = true
    let lastFrameTime = 0
    let frameCount = 0

    const updateLoop = (currentTime) => {
      if (!this.updateLoopActive) return

      const deltaTime = currentTime - lastFrameTime

      if (deltaTime >= this.updateTimeSlice) {
        this.performParameterUpdate()

        frameCount++
        lastFrameTime = currentTime

        if (frameCount % 60 === 0) {
          this.performanceMetrics.parameterUpdatesPerSecond = 60
        }
      }

      requestAnimationFrame(updateLoop)
    }

    requestAnimationFrame(updateLoop)

    console.log('ParameterController update loop started at 60fps')
  }

  /**
   * Stop parameter update loop
   */
  stopUpdateLoop() {
    this.updateLoopActive = false
    console.log('ParameterController update loop stopped')
  }

  /**
   * Perform parameter update for current frame
   */
  performParameterUpdate() {
    // DISABLED: Update loop could cause unnecessary tremolo
    return

    // Original implementation (disabled):
    // if (!this.audioEngine || this.gestureBuffer.length === 0) return
    // try {
    //   const interpolatedParams = this.interpolateParametersFromBuffer()
    //   if (this.audioEngine.updateSonicParameters) {
    //     this.audioEngine.updateSonicParameters(interpolatedParams)
    //   }
    //   this.performanceMetrics.totalUpdates++
    // } catch (error) {
    //   console.error('Parameter update failed:', error)
    //   this.performanceMetrics.droppedUpdates++
    // }
  }

  /**
   * Interpolate parameters from gesture buffer
   * @returns {Object} Interpolated parameters
   */
  interpolateParametersFromBuffer() {
    if (this.gestureBuffer.length === 0) {
      return this.currentParameters
    }

    const recentGesture = this.gestureBuffer[this.gestureBuffer.length - 1]

    if (this.gestureAudioMapper) {
      return this.gestureAudioMapper.mapGestureToAudio(recentGesture)
    }

    return this.mapGestureToAudioFallback(recentGesture)
  }

  /**
   * Update performance metrics
   * @param {number} latency - Processing latency
   */
  updatePerformanceMetrics(latency) {
    this.performanceMetrics.gestureToSoundLatency.push(latency)

    // Keep only recent measurements
    if (this.performanceMetrics.gestureToSoundLatency.length > 100) {
      this.performanceMetrics.gestureToSoundLatency.shift()
    }

    // Calculate average latency
    this.performanceMetrics.averageLatency =
      this.performanceMetrics.gestureToSoundLatency.reduce((a, b) => a + b, 0) /
      this.performanceMetrics.gestureToSoundLatency.length

    // Track maximum latency
    this.performanceMetrics.maxLatency = Math.max(
      this.performanceMetrics.maxLatency,
      latency
    )
  }

  /**
   * Get current parameter state
   * @returns {Object} Current parameters
   */
  getCurrentParameters() {
    return { ...this.currentParameters }
  }

  /**
   * Update parameter mapping configuration
   * @param {string} parameter - Parameter name
   * @param {Object} mapping - Mapping configuration
   */
  updateParameterMapping(parameter, mapping) {
    if (this.gestureAudioMapper && this.gestureAudioMapper.parameterMappings[parameter]) {
      this.gestureAudioMapper.parameterMappings[parameter] = {
        ...this.gestureAudioMapper.parameterMappings[parameter],
        ...mapping
      }
      console.log(`Updated ${parameter} mapping`)
    }
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance metrics
   */
  getPerformanceStats() {
    return {
      ...this.performanceMetrics,
      updateLoopActive: this.updateLoopActive,
      bufferSize: this.gestureBuffer.length,
      audioContextState: this.audioContextState
    }
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceStats() {
    this.performanceMetrics = {
      gestureToSoundLatency: [],
      averageLatency: 0,
      maxLatency: 0,
      parameterUpdatesPerSecond: 0,
      droppedUpdates: 0,
      totalUpdates: 0
    }
    console.log('ParameterController performance metrics reset')
  }

  /**
   * Set audio context state
   * @param {string} state - Audio context state
   */
  setAudioContextState(state) {
    this.audioContextState = state
  }

  /**
   * Clear gesture buffer
   */
  clearGestureBuffer() {
    this.gestureBuffer = []
  }

  /**
   * Get buffer size
   * @returns {number} Current buffer size
   */
  getBufferSize() {
    return this.gestureBuffer.length
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopUpdateLoop()
    this.clearGestureBuffer()
    this.audioEngine = null
    this.audioContextState = 'not-initialized'
    console.log('ParameterController cleanup completed')
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.ParameterController = ParameterController
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParameterController
}
