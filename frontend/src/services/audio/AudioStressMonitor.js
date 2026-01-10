/**
 * AudioStressMonitor.js
 *
 * Runtime audio stress detection and graceful degradation.
 * Monitors for audio underruns and adjusts audio complexity dynamically.
 *
 * Entry #73: Device-Adaptive Audio Architecture
 */

class AudioStressMonitor {
  constructor () {
    // Stress factor: 1.0 = healthy, 0.3 = minimal (matches visual system)
    this.stressFactor = 1.0
    this.underrunCount = 0
    this.totalUnderruns = 0
    this.lastUnderrunTime = 0
    this.isMonitoring = false

    // Configuration
    this.STRESS_RECOVERY_RATE = 0.01      // Per check (recovers ~0.6/minute at 1Hz checks)
    this.STRESS_PENALTY = 0.15            // Per underrun
    this.MIN_STRESS_FACTOR = 0.3          // Floor (matches visual system)
    this.MAX_STRESS_FACTOR = 1.0
    this.UNDERRUN_RESET_INTERVAL = 30000  // Reset underrun count every 30s
    this.CHECK_INTERVAL = 1000            // Check every 1s

    // Timing drift detection
    // Entry #73 FIX: Increased threshold and added consecutive event tracking
    this.lastScheduledTime = null
    this.lastActualTime = null
    this.driftSamples = []
    this.MAX_DRIFT_SAMPLES = 10
    this.DRIFT_THRESHOLD_MS = 100         // >100ms drift indicates stress (was 50ms - too sensitive)
    this.consecutiveHighDrift = 0         // Track consecutive high drift events
    this.CONSECUTIVE_DRIFT_TRIGGER = 3    // Require 3 consecutive high drifts before recording underrun

    // Callbacks
    this.onStressChange = null
    this.onUnderrun = null
    this.onModeChange = null

    // Audio mode
    this.currentMode = 'normal'  // 'normal' | 'degraded' | 'minimal' | 'emergency'

    // Timer references
    this._checkTimer = null
    this._underrunResetTimer = null
  }

  /**
   * Start monitoring audio stress
   * @param {Object} toneContext - The Tone.context reference
   */
  start (toneContext) {
    if (this.isMonitoring) return

    this.isMonitoring = true
    this.toneContext = toneContext
    console.log('🎧 AudioStressMonitor: Starting')

    // Start periodic stress checks
    this._checkTimer = setInterval(() => this._checkStress(), this.CHECK_INTERVAL)

    // Reset underrun count periodically
    this._underrunResetTimer = setInterval(() => {
      if (this.underrunCount > 0) {
        console.log(`🎧 AudioStressMonitor: Resetting underrun count (was ${this.underrunCount})`)
        this.underrunCount = 0
      }
    }, this.UNDERRUN_RESET_INTERVAL)

    // Try to hook into AudioContext events (limited browser support)
    this._setupAudioContextMonitoring()
  }

  /**
   * Stop monitoring
   */
  stop () {
    if (!this.isMonitoring) return

    this.isMonitoring = false
    console.log('🎧 AudioStressMonitor: Stopping')

    if (this._checkTimer) {
      clearInterval(this._checkTimer)
      this._checkTimer = null
    }

    if (this._underrunResetTimer) {
      clearInterval(this._underrunResetTimer)
      this._underrunResetTimer = null
    }

    this.stressFactor = 1.0
    this.underrunCount = 0
    this.driftSamples = []
    this.currentMode = 'normal'
  }

  /**
   * Set up AudioContext state monitoring
   * Note: Browser support for audio underrun detection is limited
   */
  _setupAudioContextMonitoring () {
    if (!this.toneContext) return

    const rawContext = this.toneContext.rawContext

    // Listen for state changes
    if (rawContext && rawContext.onstatechange !== undefined) {
      const originalHandler = rawContext.onstatechange
      rawContext.onstatechange = (event) => {
        if (originalHandler) originalHandler(event)

        if (rawContext.state === 'interrupted' || rawContext.state === 'suspended') {
          console.warn('🎧 AudioContext state changed:', rawContext.state)
          // Treat as underrun-like event
          this._recordUnderrun('context-state-change')
        }
      }
    }
  }

  /**
   * Record a timing sample for drift detection
   * Call this when scheduling audio events
   * Entry #73 FIX: Now requires consecutive high drifts before triggering underrun
   * @param {number} scheduledTime - When the event was scheduled for
   * @param {number} actualTime - When the event actually fired
   */
  recordTiming (scheduledTime, actualTime) {
    if (!this.isMonitoring) return

    const drift = Math.abs(actualTime - scheduledTime) * 1000 // Convert to ms

    this.driftSamples.push(drift)
    if (this.driftSamples.length > this.MAX_DRIFT_SAMPLES) {
      this.driftSamples.shift()
    }

    // Check for high drift with consecutive event tracking
    if (drift > this.DRIFT_THRESHOLD_MS) {
      this.consecutiveHighDrift++

      // Only trigger underrun after N consecutive high drift events
      // This prevents false positives from normal GC pauses
      if (this.consecutiveHighDrift >= this.CONSECUTIVE_DRIFT_TRIGGER) {
        console.warn(`🎧 Sustained timing drift detected: ${drift.toFixed(1)}ms (${this.consecutiveHighDrift} consecutive)`)
        this._recordUnderrun('sustained-timing-drift')
        this.consecutiveHighDrift = 0 // Reset after recording
      }
    } else {
      // Reset consecutive count on normal drift
      this.consecutiveHighDrift = 0
    }
  }

  /**
   * Record an underrun event
   * @param {string} source - What triggered the underrun detection
   */
  _recordUnderrun (source) {
    const now = Date.now()

    // Debounce rapid underruns
    if (now - this.lastUnderrunTime < 500) return

    this.underrunCount++
    this.totalUnderruns++
    this.lastUnderrunTime = now

    console.warn(`🎧 Audio underrun detected (${source}): count=${this.underrunCount}, total=${this.totalUnderruns}`)

    // Apply stress penalty
    this.stressFactor = Math.max(
      this.MIN_STRESS_FACTOR,
      this.stressFactor - this.STRESS_PENALTY
    )

    // Check for emergency mode (3+ underruns in current window)
    if (this.underrunCount >= 3) {
      this._setMode('emergency')
    }

    // Notify listeners
    if (this.onUnderrun) {
      this.onUnderrun({
        source,
        underrunCount: this.underrunCount,
        totalUnderruns: this.totalUnderruns,
        stressFactor: this.stressFactor
      })
    }

    this._emitStressChange()
    this._updateMode()
  }

  /**
   * Periodic stress check - handles gradual recovery
   */
  _checkStress () {
    if (!this.isMonitoring) return

    // Calculate average drift
    const avgDrift = this.driftSamples.length > 0
      ? this.driftSamples.reduce((a, b) => a + b, 0) / this.driftSamples.length
      : 0

    // If no recent underruns and drift is low, gradually recover
    const timeSinceUnderrun = Date.now() - this.lastUnderrunTime
    if (timeSinceUnderrun > 5000 && avgDrift < this.DRIFT_THRESHOLD_MS / 2) {
      this.stressFactor = Math.min(
        this.MAX_STRESS_FACTOR,
        this.stressFactor + this.STRESS_RECOVERY_RATE
      )
      this._updateMode()
    }

    // Check AudioContext baseLatency if available (Chrome/Firefox)
    this._checkBaseLatency()
  }

  /**
   * Check AudioContext baseLatency for signs of stress
   */
  _checkBaseLatency () {
    if (!this.toneContext) return

    const rawContext = this.toneContext.rawContext
    if (!rawContext || typeof rawContext.baseLatency !== 'number') return

    // baseLatency > 0.1s (100ms) indicates audio system under pressure
    if (rawContext.baseLatency > 0.1) {
      console.warn(`🎧 High base latency: ${(rawContext.baseLatency * 1000).toFixed(0)}ms`)
      // Don't record as underrun, just note it
    }
  }

  /**
   * Update the audio mode based on current stress factor
   */
  _updateMode () {
    let newMode = 'normal'

    if (this.stressFactor < 0.3 || this.underrunCount >= 3) {
      newMode = 'emergency'
    } else if (this.stressFactor < 0.5) {
      newMode = 'minimal'
    } else if (this.stressFactor < 0.8) {
      newMode = 'degraded'
    }

    this._setMode(newMode)
  }

  /**
   * Set the audio mode with notification
   * @param {'normal'|'degraded'|'minimal'|'emergency'} mode
   */
  _setMode (mode) {
    if (mode === this.currentMode) return

    const oldMode = this.currentMode
    this.currentMode = mode

    console.log(`🎧 Audio mode change: ${oldMode} → ${mode} (stressFactor=${this.stressFactor.toFixed(2)})`)

    if (this.onModeChange) {
      this.onModeChange({
        from: oldMode,
        to: mode,
        stressFactor: this.stressFactor,
        underrunCount: this.underrunCount
      })
    }
  }

  /**
   * Emit stress change event
   */
  _emitStressChange () {
    if (this.onStressChange) {
      this.onStressChange({
        stressFactor: this.stressFactor,
        mode: this.currentMode,
        underrunCount: this.underrunCount
      })
    }
  }

  /**
   * Get current stress factor (for external use)
   * @returns {number} Stress factor between 0.3 and 1.0
   */
  getStressFactor () {
    return this.stressFactor
  }

  /**
   * Get current audio mode
   * @returns {'normal'|'degraded'|'minimal'|'emergency'}
   */
  getMode () {
    return this.currentMode
  }

  /**
   * Check if audio is in degraded state
   * @returns {boolean}
   */
  isDegraded () {
    return this.currentMode !== 'normal'
  }

  /**
   * Force a specific stress level (for testing)
   * @param {number} factor - Stress factor (0.3 to 1.0)
   */
  forceStressFactor (factor) {
    this.stressFactor = Math.max(this.MIN_STRESS_FACTOR, Math.min(this.MAX_STRESS_FACTOR, factor))
    this._updateMode()
    this._emitStressChange()
  }

  /**
   * Get status for UI display
   * @returns {Object} Status info
   */
  getStatus () {
    return {
      stressFactor: this.stressFactor,
      mode: this.currentMode,
      underrunCount: this.underrunCount,
      totalUnderruns: this.totalUnderruns,
      isMonitoring: this.isMonitoring,
      avgDrift: this.driftSamples.length > 0
        ? this.driftSamples.reduce((a, b) => a + b, 0) / this.driftSamples.length
        : 0
    }
  }
}

// Export for both module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioStressMonitor
}
if (typeof window !== 'undefined') {
  window.AudioStressMonitor = AudioStressMonitor
}
