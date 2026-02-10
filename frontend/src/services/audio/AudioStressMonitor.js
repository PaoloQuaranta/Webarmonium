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
    this.STRESS_RECOVERY_RATE = 0.03      // Per check (recovers ~1.8/minute at 1Hz checks)
    this.STRESS_PENALTY = 0.08            // Per underrun (gentler: 9 underruns to reach emergency)
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
    this.DRIFT_THRESHOLD_MS = 200         // >200ms late drift indicates stress (tolerates normal GC pauses)
    this.consecutiveHighDrift = 0         // Track consecutive high drift events
    this.CONSECUTIVE_DRIFT_TRIGGER = 5    // Require 5 consecutive high drifts before recording underrun

    // Callbacks
    this.onStressChange = null
    this.onUnderrun = null
    this.onModeChange = null

    // Audio mode
    this.currentMode = 'normal'  // 'normal' | 'degraded' | 'minimal' | 'emergency'

    // Timer references
    this._checkTimer = null
    this._underrunResetTimer = null

    // AUDIO PRIORITY: Long task monitoring
    this._longTaskObserver = null
    this._consecutiveLongTasks = 0
    this.LONG_TASK_THRESHOLD_MS = 150   // >150ms considered problematic (above normal GC)
    this.CONSECUTIVE_LONG_TASK_TRIGGER = 3 // Require 3 consecutive before recording underrun
  }

  /**
   * Start monitoring audio stress
   * @param {Object} toneContext - The Tone.context reference
   */
  start (toneContext) {
    if (this.isMonitoring) return

    this.isMonitoring = true
    this.toneContext = toneContext

    // Start periodic stress checks
    this._checkTimer = setInterval(() => this._checkStress(), this.CHECK_INTERVAL)

    // Reset underrun count periodically
    this._underrunResetTimer = setInterval(() => {
      if (this.underrunCount > 0) {
        this.underrunCount = 0
      }
    }, this.UNDERRUN_RESET_INTERVAL)

    // Try to hook into AudioContext events (limited browser support)
    this._setupAudioContextMonitoring()

    // AUDIO PRIORITY: Monitor main thread long tasks
    this._setupLongTaskMonitoring()
  }

  /**
   * Stop monitoring
   */
  stop () {
    if (!this.isMonitoring) return

    this.isMonitoring = false

    if (this._checkTimer) {
      clearInterval(this._checkTimer)
      this._checkTimer = null
    }

    if (this._underrunResetTimer) {
      clearInterval(this._underrunResetTimer)
      this._underrunResetTimer = null
    }

    // AUDIO PRIORITY: Stop long task observer
    if (this._longTaskObserver) {
      this._longTaskObserver.disconnect()
      this._longTaskObserver = null
    }
    this._consecutiveLongTasks = 0

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
          // Treat as underrun-like event
          this._recordUnderrun('context-state-change')
        }
      }
    }
  }

  /**
   * AUDIO PRIORITY: Set up PerformanceObserver for long task detection.
   * Detects main thread jank (>150ms) that can delay audio scheduling callbacks.
   * Requires 3 consecutive long tasks before recording underrun (prevents false positives from GC).
   * @private
   */
  _setupLongTaskMonitoring () {
    if (typeof PerformanceObserver === 'undefined') return

    // Feature detection: check if longtask is supported
    if (!PerformanceObserver.supportedEntryTypes ||
        !PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      return
    }

    try {
      this._consecutiveLongTasks = 0

      this._longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > this.LONG_TASK_THRESHOLD_MS) {
            this._consecutiveLongTasks++

            if (this._consecutiveLongTasks >= this.CONSECUTIVE_LONG_TASK_TRIGGER) {
              this._recordUnderrun('sustained-long-tasks')
              this._consecutiveLongTasks = 0
            }
          } else {
            this._consecutiveLongTasks = 0
          }
        }
      })

      // Use type-based observe (not entryTypes), no buffered flag (unsupported for longtask)
      this._longTaskObserver.observe({ type: 'longtask' })
    } catch (error) {
      // longtask not supported — fall back to existing drift detection
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

    // Only LATE callbacks indicate stress. Early firing is normal Tone.js look-ahead.
    // scheduledTime = audioTime (future), actualTime = Tone.now() (current)
    // Late: actualTime > scheduledTime → positive drift (real stress)
    // Early: actualTime < scheduledTime → negative → clamped to 0 (normal look-ahead)
    const drift = Math.max(0, (actualTime - scheduledTime)) * 1000 // Convert to ms

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


    // Apply stress penalty
    this.stressFactor = Math.max(
      this.MIN_STRESS_FACTOR,
      this.stressFactor - this.STRESS_PENALTY
    )

    // Check for emergency mode (5+ underruns in current window)
    if (this.underrunCount >= 5) {
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
    // Anti-oscillation: slower recovery when exiting emergency to prevent rapid degrade/recover cycles
    const timeSinceUnderrun = Date.now() - this.lastUnderrunTime
    if (timeSinceUnderrun > 3000 && avgDrift < this.DRIFT_THRESHOLD_MS / 2) {
      let effectiveRecovery = this.STRESS_RECOVERY_RATE
      if (this.currentMode === 'emergency') effectiveRecovery *= 0.5
      this.stressFactor = Math.min(
        this.MAX_STRESS_FACTOR,
        this.stressFactor + effectiveRecovery
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
      // Don't record as underrun, just note it
    }
  }

  /**
   * Update the audio mode based on current stress factor
   */
  _updateMode () {
    let newMode = 'normal'

    if (this.stressFactor < 0.3 || this.underrunCount >= 5) {
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
