/**
 * FilterModulationSystem.js
 * Handles filter modulation, LFO management, and hover effects
 * Extracted from AudioService.js for Phase 2 refactoring
 */
class FilterModulationSystem {
  constructor() {
    // References to filters (set by AudioService)
    this.ambientFilters = null
    this.gestureFilter = null
    this.gestureSynth = null

    // Remote LFO for filter cutoff modulation
    this.remoteFilterLFO = null
    this.remoteLFOTargetFilters = new Set()

    // Track active remote users for dynamic scaling
    this.activeRemoteUsers = new Set()
    this.lastUserCountUpdate = Date.now()

    // Hover tracking
    this.lastHoverTime = 0
    this.hoverTimeoutDuration = 500
    this.hoverTimeoutTimer = null

    // Filter modulation throttling
    this.lastFilterUpdateTime = 0
    this.filterUpdateInterval = 50
    this.lastFilterLogTime = 0

    // Current user ID for local/remote detection
    this.currentUserId = null

    // Initialized state
    this.isInitialized = false

    // LFO system (disabled by default)
    this.lfoSystem = {
      localResonance: 1.0,
      localCutoff: 1000,
      remoteAmplitude: 0.5,
      remoteSpeed: 1.0,
      lfoPhase: 0,
      lastLfoUpdate: Date.now(),
      currentLFOValue: 0,
      isActive: false,
      updateInterval: null,

      start: () => {
        if (this.lfoSystem.isActive) return
        this.lfoSystem.isActive = true
        this.lfoSystem.lastLfoUpdate = Date.now()

        this.lfoSystem.updateInterval = setInterval(() => {
          if (!this.lfoSystem.isActive) return

          const now = Date.now()
          const deltaTime = (now - this.lfoSystem.lastLfoUpdate) / 1000
          this.lfoSystem.lastLfoUpdate = now

          this.lfoSystem.lfoPhase += deltaTime * this.lfoSystem.remoteSpeed * 2 * Math.PI

          if (this.lfoSystem.lfoPhase > 2 * Math.PI) {
            this.lfoSystem.lfoPhase -= 2 * Math.PI
          }

          this.lfoSystem.currentLFOValue = Math.sin(this.lfoSystem.lfoPhase)
        }, 1000 / 30)
      },

      stop: () => {
        this.lfoSystem.isActive = false
        if (this.lfoSystem.updateInterval) {
          clearInterval(this.lfoSystem.updateInterval)
          this.lfoSystem.updateInterval = null
        }
      },

      getModulatedCutoff: () => {
        const lfoValue = this.lfoSystem.currentLFOValue
        const modulationRange = this.lfoSystem.localCutoff * this.lfoSystem.remoteAmplitude * 0.8
        const modulatedCutoff = this.lfoSystem.localCutoff + (lfoValue * modulationRange)
        return Math.max(50, Math.min(8000, modulatedCutoff))
      }
    }
  }

  /**
   * Set filter references
   * @param {Object} ambientFilters - Ambient layer filters
   * @param {Object} gestureFilter - Gesture synth filter
   * @param {Object} gestureSynth - Gesture synth
   */
  setFilters(ambientFilters, gestureFilter, gestureSynth) {
    this.ambientFilters = ambientFilters
    this.gestureFilter = gestureFilter
    this.gestureSynth = gestureSynth
    this.isInitialized = true
  }

  /**
   * Set current user ID
   * @param {string} userId - Current user ID
   */
  setCurrentUserId(userId) {
    this.currentUserId = userId
  }

  /**
   * Update background filters with gesture-based modulation
   * @param {Object} sonicParams - Sonic parameters from gesture
   */
  updateBackgroundFilters(sonicParams) {
    if (!this.ambientFilters) return

    const filterFreq = this.calculateFilterFrequency(sonicParams)
    const filterQ = this.calculateFilterResonance(sonicParams)
    const currentTime = typeof Tone !== 'undefined' ? Tone.context.currentTime : 0

    if (this.ambientFilters.chords) {
      const chordsFreq = filterFreq * 2.5
      this.ambientFilters.chords.frequency.linearRampToValueAtTime(
        Math.min(8000, Math.max(100, chordsFreq)),
        currentTime + 0.05
      )
      this.ambientFilters.chords.Q.setValueAtTime(filterQ * 2, currentTime)
    }

    if (this.ambientFilters.pad) {
      const padFreq = filterFreq * 1.8
      this.ambientFilters.pad.frequency.linearRampToValueAtTime(
        Math.min(4000, Math.max(100, padFreq)),
        currentTime + 0.08
      )
      this.ambientFilters.pad.Q.setValueAtTime(filterQ * 1.5, currentTime)
    }

    if (this.ambientFilters.bass) {
      const bassFreq = filterFreq * 0.6
      this.ambientFilters.bass.frequency.linearRampToValueAtTime(
        Math.min(1000, Math.max(30, bassFreq)),
        currentTime + 0.1
      )
      this.ambientFilters.bass.Q.setValueAtTime(filterQ * 1.2, currentTime)
    }
  }

  /**
   * Calculate filter frequency from gesture parameters
   * @param {Object} sonicParams - Sonic parameters
   * @returns {number} Filter frequency
   */
  calculateFilterFrequency(sonicParams) {
    const y = sonicParams.y || 0.5
    return 200 + ((1 - y) * 3800)
  }

  /**
   * Calculate filter resonance from gesture parameters
   * @param {Object} sonicParams - Sonic parameters
   * @returns {number} Filter resonance (Q)
   */
  calculateFilterResonance(sonicParams) {
    const x = sonicParams.x || 0.5
    return 0.5 + (x * 4.5)
  }

  /**
   * Trigger background filter response to user input
   * @param {number} frequency - User input frequency
   * @param {number} duration - User input duration
   */
  triggerBackgroundFilterResponse(frequency, duration) {
    if (!this.ambientFilters) return

    const currentTime = typeof Tone !== 'undefined' ? Tone.context.currentTime : 0
    const normalizedFreq = Math.max(100, Math.min(8000, frequency))
    const modulationIntensity = Math.min(1.0, duration * 2)

    if (this.ambientFilters.bass) {
      const bassFreq = normalizedFreq * 0.3
      this.ambientFilters.bass.frequency.linearRampToValueAtTime(
        Math.max(50, Math.min(500, bassFreq)),
        currentTime + 0.2
      )
      this.ambientFilters.bass.Q.linearRampToValueAtTime(
        1 + modulationIntensity * 3,
        currentTime + 0.2
      )
    }

    if (this.ambientFilters.pad) {
      const padFreq = normalizedFreq * 0.8
      this.ambientFilters.pad.frequency.linearRampToValueAtTime(
        Math.max(150, Math.min(2000, padFreq)),
        currentTime + 0.15
      )
      this.ambientFilters.pad.Q.linearRampToValueAtTime(
        2 + modulationIntensity * 4,
        currentTime + 0.15
      )
    }

    if (this.ambientFilters.chords) {
      const chordsFreq = normalizedFreq * 1.5
      this.ambientFilters.chords.frequency.linearRampToValueAtTime(
        Math.max(200, Math.min(4000, chordsFreq)),
        currentTime + 0.1
      )
      this.ambientFilters.chords.Q.linearRampToValueAtTime(
        3 + modulationIntensity * 5,
        currentTime + 0.1
      )
    }
  }

  /**
   * Handle hover modulation for cross-layer effects
   * @param {Object} hoverData - Hover data with position, velocity, intensity, and isRemote
   */
  handleHoverModulation(hoverData) {
    if (!this.isInitialized) return

    const position = hoverData?.position || hoverData || { x: 0.5, y: 0.5 }
    const userId = hoverData?.userId || 'unknown'
    const isRemote = hoverData?.isRemote || false
    const intensity = hoverData?.intensity || 0.5

    if (intensity === 0) {
      this.resetFiltersToSafeValues()
      return
    }

    // Validate coordinates
    const originalX = position?.x
    const originalY = position?.y

    if (typeof originalX !== 'number' || typeof originalY !== 'number' ||
        isNaN(originalX) || isNaN(originalY) || !isFinite(originalX) || !isFinite(originalY) ||
        originalX < 0 || originalX > 1 || originalY < 0 || originalY > 1) {
      this.stopRemoteFilterLFO()
      this.resetFiltersToSafeValues()
      return
    }

    if (isRemote && userId !== 'unknown') {
      this.updateActiveRemoteUser(userId, true)
    }

    this.lastHoverTime = Date.now()
    this.setupHoverTimeout()

    const sonicParams = {
      x: originalX,
      y: originalY,
      intensity: intensity,
      tier: isRemote ? 'remote' : 'local'
    }

    const filterParams = this.mapGestureToFilter(sonicParams)
    const currentTime = typeof Tone !== 'undefined' ? Tone.context.currentTime : 0

    if (filterParams.isRemoteLFO) {
      // Remote hover: setup LFO
      this.setupRemoteFilterLFO(filterParams.lfoSpeed, filterParams.lfoAmplitude)
    } else {
      // Local hover: direct filter modulation
      this.stopRemoteFilterLFO()
      this.applyLocalFilterModulation(filterParams, currentTime)
    }
  }

  /**
   * Map gesture to filter parameters
   * @param {Object} sonicParams - Sonic parameters
   * @returns {Object} Filter parameters
   */
  mapGestureToFilter(sonicParams) {
    const tier = sonicParams.tier || 'local'

    if (tier === 'local') {
      const y = sonicParams.y || 0.5
      const x = sonicParams.x || 0.5

      return {
        cutoffFrequency: 200 + ((1 - y) * 3800),
        resonance: 0.5 + (x * 4.5),
        tremoloAmount: 0
      }
    } else if (tier === 'remote') {
      const y = sonicParams.y || 0.5
      const x = sonicParams.x || 0.5

      return {
        lfoSpeed: 0.05 + (x * 9.95),
        lfoAmplitude: y,
        isRemoteLFO: true
      }
    } else {
      const movement = sonicParams?.z ?? sonicParams?.y ?? 0.5
      return {
        cutoffFrequency: 200 + (movement * 2000),
        resonance: 1.0,
        tremoloAmount: 0
      }
    }
  }

  /**
   * Apply local filter modulation
   * @param {Object} filterParams - Filter parameters
   * @param {number} currentTime - Current audio time
   */
  applyLocalFilterModulation(filterParams, currentTime) {
    if (this.gestureFilter && this.gestureFilter.frequency && this.gestureFilter.Q) {
      if (filterParams.cutoffFrequency) {
        const clampedFreq = Math.max(100, Math.min(8000, filterParams.cutoffFrequency))
        this.gestureFilter.frequency.linearRampToValueAtTime(clampedFreq, currentTime + 0.05)
      }

      if (filterParams.resonance) {
        const clampedQ = Math.max(0.1, Math.min(10, filterParams.resonance))
        this.gestureFilter.Q.linearRampToValueAtTime(clampedQ, currentTime + 0.05)
      }
    }

    if (this.ambientFilters) {
      Object.keys(this.ambientFilters).forEach(layerName => {
        const filter = this.ambientFilters[layerName]
        if (filter && filter.frequency && filter.Q) {
          const layerMultiplier = {
            bass: 0.5,
            pad: 0.8,
            chords: 1.2
          }[layerName] || 1.0

          const clampedFreq = Math.max(100, Math.min(8000, filterParams.cutoffFrequency * layerMultiplier))
          filter.frequency.linearRampToValueAtTime(clampedFreq, currentTime + 0.05)

          const clampedQ = Math.max(0.1, Math.min(10, filterParams.resonance))
          filter.Q.linearRampToValueAtTime(clampedQ, currentTime + 0.05)
        }
      })
    }
  }

  /**
   * Setup remote LFO for filter cutoff modulation (stub - disabled)
   * @param {number} speed - LFO frequency in Hz
   * @param {number} amplitude - LFO amplitude
   */
  setupRemoteFilterLFO(speed, amplitude) {
    // DISABLED: Remote filter LFO functionality removed - stub for backward compatibility
  }

  /**
   * Stop remote filter LFO (stub - disabled)
   */
  stopRemoteFilterLFO() {
    // DISABLED: Remote filter LFO functionality removed - stub for backward compatibility
  }

  /**
   * Apply filter modulation with proper validation
   * @param {Object} filterParams - Filter modulation parameters
   */
  applyFilterModulation(filterParams) {
    const now = Date.now()
    if (now - this.lastFilterUpdateTime < this.filterUpdateInterval) {
      return
    }
    this.lastFilterUpdateTime = now

    try {
      const cutoffFrequency = filterParams.frequency || filterParams.cutoffFrequency
      const resonance = filterParams.resonance

      if (cutoffFrequency === null || cutoffFrequency === undefined) {
        return
      }

      const currentTime = typeof Tone !== 'undefined' ? Tone.context.currentTime : 0

      if (this.ambientFilters) {
        Object.keys(this.ambientFilters).forEach(layerName => {
          const filter = this.ambientFilters[layerName]
          if (filter && filter.frequency) {
            let targetFrequency = cutoffFrequency
            if (layerName === 'bass') {
              targetFrequency = Math.max(50, Math.min(500, cutoffFrequency * 0.3))
            } else if (layerName === 'pad') {
              targetFrequency = Math.max(150, Math.min(2000, cutoffFrequency * 0.8))
            } else if (layerName === 'chords') {
              targetFrequency = Math.max(200, Math.min(4000, cutoffFrequency * 1.5))
            }

            filter.frequency.linearRampToValueAtTime(targetFrequency, currentTime + 0.1)

            if (filter.Q && resonance) {
              const clampedResonance = Math.max(0.1, Math.min(10, resonance))
              filter.Q.linearRampToValueAtTime(clampedResonance, currentTime + 0.1)
            }
          }
        })
      }

      if (this.gestureFilter && this.gestureFilter.frequency) {
        const cutoffRange = cutoffFrequency * 80 + 200
        this.gestureFilter.frequency.setValueAtTime(cutoffRange, currentTime)
      }

    } catch (error) {
      console.error('❌ Filter modulation failed:', error)
    }
  }

  /**
   * Setup hover timeout
   */
  setupHoverTimeout() {
    if (this.hoverTimeoutTimer) {
      clearTimeout(this.hoverTimeoutTimer)
    }

    this.hoverTimeoutTimer = setTimeout(() => {
      const timeSinceLastHover = Date.now() - this.lastHoverTime
      if (timeSinceLastHover >= this.hoverTimeoutDuration) {
        this.stopRemoteFilterLFO()
        this.hoverTimeoutTimer = null
      }
    }, this.hoverTimeoutDuration)
  }

  /**
   * Update active remote users tracking
   * @param {string} userId - User ID
   * @param {boolean} isActive - Whether user is active
   */
  updateActiveRemoteUser(userId, isActive = true) {
    if (isActive) {
      this.activeRemoteUsers.add(userId)
    } else {
      this.activeRemoteUsers.delete(userId)
    }
    this.lastUserCountUpdate = Date.now()
  }

  /**
   * Stop hover modulation
   * @param {string} userId - User ID to stop tracking
   */
  stopHoverModulation(userId) {
    this.updateActiveRemoteUser(userId, false)

    if (this.activeRemoteUsers.size === 0) {
      this.stopRemoteFilterLFO()
    }
  }

  /**
   * Reset filters to safe values
   */
  resetFiltersToSafeValues() {
    if (!this.ambientFilters) return

    const currentTime = typeof Tone !== 'undefined' ? Tone.context.currentTime : 0

    this.lfoSystem.stop()

    if (this.ambientFilters.bass) {
      this.ambientFilters.bass.frequency.linearRampToValueAtTime(150, currentTime + 0.1)
      this.ambientFilters.bass.Q.linearRampToValueAtTime(1, currentTime + 0.1)
    }

    if (this.ambientFilters.pad) {
      this.ambientFilters.pad.frequency.linearRampToValueAtTime(800, currentTime + 0.1)
      this.ambientFilters.pad.Q.linearRampToValueAtTime(1.5, currentTime + 0.1)
    }

    if (this.ambientFilters.chords) {
      this.ambientFilters.chords.frequency.linearRampToValueAtTime(2000, currentTime + 0.1)
      this.ambientFilters.chords.Q.linearRampToValueAtTime(2, currentTime + 0.1)
    }

    if (this.gestureFilter) {
      this.gestureFilter.frequency.linearRampToValueAtTime(2000, currentTime + 0.1)
      this.gestureFilter.Q.linearRampToValueAtTime(3, currentTime + 0.1)
    }
  }

  /**
   * Modulate background filters
   * @param {Object} position - Position {x, y}
   * @param {number} intensity - Modulation intensity
   */
  modulateBackgroundFilters(position, intensity) {
    if (!this.ambientFilters) return

    const currentTime = typeof Tone !== 'undefined' ? Tone.context.currentTime : 0
    const bassFilter = this.ambientFilters.bass

    const baseFreq = 250
    const modFreq = baseFreq + (position.y || 0.5) * 150 * intensity

    if (bassFilter) {
      bassFilter.frequency.linearRampToValueAtTime(modFreq, currentTime + 0.1)
      bassFilter.Q.linearRampToValueAtTime(2 + intensity * 3, currentTime + 0.1)
    }
  }

  /**
   * Modulate remote gesture filters
   * @param {Object} position - Position {x, y}
   * @param {number} intensity - Modulation intensity
   */
  modulateRemoteGestureFilters(position, intensity) {
    if (!this.ambientFilters || !this.ambientFilters.pad) return

    const currentTime = typeof Tone !== 'undefined' ? Tone.context.currentTime : 0
    const padFilter = this.ambientFilters.pad

    const baseFreq = 800
    const modFreq = baseFreq + (position.x || 0.5) * 400 * intensity

    padFilter.frequency.linearRampToValueAtTime(modFreq, currentTime + 0.08)
    padFilter.Q.linearRampToValueAtTime(3 + intensity * 4, currentTime + 0.08)
  }

  /**
   * Modulate local gesture filters
   * @param {Object} position - Position {x, y}
   * @param {number} intensity - Modulation intensity
   */
  modulateLocalGestureFilters(position, intensity) {
    if (!this.ambientFilters || !this.ambientFilters.chords) return

    const currentTime = typeof Tone !== 'undefined' ? Tone.context.currentTime : 0
    const chordsFilter = this.ambientFilters.chords

    const baseFreq = 1400
    const modFreq = baseFreq + (position.x || 0.5) * 600 * intensity

    chordsFilter.frequency.linearRampToValueAtTime(modFreq, currentTime + 0.05)
    chordsFilter.Q.linearRampToValueAtTime(5 + intensity * 8, currentTime + 0.05)
  }

  /**
   * Force stop all LFO systems
   */
  forceStopAllLFO() {
    this.stopRemoteFilterLFO()
    this.lfoSystem.stop()

    if (this.hoverTimeoutTimer) {
      clearTimeout(this.hoverTimeoutTimer)
      this.hoverTimeoutTimer = null
    }
  }

  /**
   * Calculate modulation scaling based on user count
   * @param {number} userCount - Number of active users
   * @returns {number} Scaling multiplier
   */
  calculateModulationScaling(userCount) {
    if (userCount === 1) return 3.0
    if (userCount === 2) return 2.0
    if (userCount <= 4) return 1.5
    if (userCount <= 8) return 1.2
    return 1.0
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.forceStopAllLFO()
    this.ambientFilters = null
    this.gestureFilter = null
    this.gestureSynth = null
    this.activeRemoteUsers.clear()
    this.isInitialized = false
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.FilterModulationSystem = FilterModulationSystem
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FilterModulationSystem
}
