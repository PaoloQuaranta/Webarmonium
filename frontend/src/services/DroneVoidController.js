/**
 * DroneVoidController
 *
 * Controls drone volume based on activity voids.
 * Monitors activity from all sources (local gestures, remote users, virtual users).
 * Makes drone emerge during silence and disappear during activity.
 *
 * Entry #28 - Drone Emergence from Activity Voids
 *
 * Behavior:
 * - Drone starts SILENT on startup
 * - After 5-10 seconds of inactivity, drone fades IN (2 seconds)
 * - During activity, drone fades OUT (20 seconds) to complete silence
 * - Identical behavior in landing page and normal rooms
 */
class DroneVoidController {
  /**
   * @param {Object} audioService - The AudioService instance (required)
   * @throws {Error} If audioService is not provided
   */
  constructor(audioService) {
    // Critical #5: Input validation
    if (!audioService) {
      throw new Error('DroneVoidController: audioService is required')
    }
    this.audioService = audioService

    // Configuration
    this.config = {
      voidTimeoutMin: 5000,     // 5 seconds minimum quiet before drone emerges
      voidTimeoutMax: 10000,    // 10 seconds for full emergence (voidScore = 1.0)
      fadeInTime: 2.0,          // 2 seconds fade in (quick to fill voids)
      fadeOutTime: 20.0,        // 20 seconds fade out (gradual, extended from 5s)
      droneNominalDb: -3,       // Full drone level (same as Entry #27)
      droneSilentDb: -60,       // Effectively silent
      updateInterval: 100       // Check every 100ms for smooth transitions
    }

    // State
    this.lastActivityTime = Date.now()
    this.activeNotes = new Set()  // Track active note IDs
    this.userInfluence = 0        // 0-1 value from generativeState
    this.currentVoidScore = 0
    this.currentTargetDb = this.config.droneSilentDb
    this.updateTimer = null
    this.isRunning = false

    // Debug
    this.debugEnabled = false
  }

  /**
   * Start the void controller - begins monitoring and controlling drone volume
   */
  start() {
    if (this.isRunning) return

    // Reset state before starting
    this.lastActivityTime = Date.now()
    this.activeNotes.clear()
    this.currentVoidScore = 0

    // Set drone to silent initially
    this._setDroneVolumeImmediate(this.config.droneSilentDb)

    // Critical #4: Wrap setInterval in try/catch to prevent memory leaks
    try {
      this.updateTimer = setInterval(() => {
        this._updateVoidScore()
      }, this.config.updateInterval)

      // Only mark as running after successful timer creation
      this.isRunning = true
      console.log('DroneVoidController: Started - drone silent until activity void detected')
    } catch (error) {
      console.error('DroneVoidController: Failed to start update timer:', error)
      this.updateTimer = null
      throw error
    }
  }

  /**
   * Stop the void controller
   */
  stop() {
    if (!this.isRunning) return

    this.isRunning = false

    // Critical: Wrap cleanup in try/catch to ensure cleanup completes
    try {
      if (this.updateTimer) {
        clearInterval(this.updateTimer)
        this.updateTimer = null
      }

      // Fade drone out on stop
      this._setDroneVolumeImmediate(this.config.droneSilentDb)
    } catch (error) {
      console.error('DroneVoidController: Error during stop:', error)
    } finally {
      console.log('DroneVoidController: Stopped')
    }
  }

  /**
   * Reset state (e.g., on audio restart)
   */
  reset() {
    this.lastActivityTime = Date.now()
    this.activeNotes.clear()
    this.userInfluence = 0
    this.currentVoidScore = 0
    this.currentTargetDb = this.config.droneSilentDb

    this._setDroneVolumeImmediate(this.config.droneSilentDb)

    console.log('DroneVoidController: Reset - drone silent')
  }

  // ==================== Activity Registration Methods ====================

  /**
   * Register any activity (gesture start, movement, etc.)
   * Call this when any musical activity occurs
   */
  registerActivity() {
    this.lastActivityTime = Date.now()

    if (this.debugEnabled) {
      console.log('DroneVoidController: Activity registered')
    }
  }

  /**
   * Register a note/sound starting
   * @param {string} noteId - Unique identifier for the note (e.g., "user123-hold")
   */
  registerNoteStart(noteId) {
    this.activeNotes.add(noteId)
    this.lastActivityTime = Date.now()

    if (this.debugEnabled) {
      console.log(`DroneVoidController: Note start - ${noteId}, active: ${this.activeNotes.size}`)
    }
  }

  /**
   * Register a note/sound ending
   * @param {string} noteId - Unique identifier for the note
   */
  registerNoteEnd(noteId) {
    this.activeNotes.delete(noteId)
    // Note: We don't update lastActivityTime on note end
    // Activity time is updated on note START, not end

    if (this.debugEnabled) {
      console.log(`DroneVoidController: Note end - ${noteId}, active: ${this.activeNotes.size}`)
    }
  }

  /**
   * Update the user influence value from generativeState
   * @param {number} influence - 0-1 value representing user activity level
   */
  updateUserInfluence(influence) {
    this.userInfluence = Math.max(0, Math.min(1, influence))
  }

  /**
   * Enable/disable debug logging
   */
  setDebug(enabled) {
    this.debugEnabled = enabled
  }

  // ==================== Internal Methods ====================

  /**
   * Calculate void score and apply drone volume
   * Called every updateInterval ms
   */
  _updateVoidScore() {
    if (!this.isRunning) return

    const now = Date.now()
    const timeSinceLastActivity = now - this.lastActivityTime

    // Time-based void score: 0 at voidTimeoutMin, 1 at voidTimeoutMax
    const timeScore = this._clamp(
      (timeSinceLastActivity - this.config.voidTimeoutMin) /
      (this.config.voidTimeoutMax - this.config.voidTimeoutMin),
      0, 1
    )

    // Influence-based: high userInfluence = low void (activity happening)
    const influenceVoidScore = 1 - this.userInfluence

    // Active notes completely suppress void
    // If any note is playing, voidScore is 0
    const noteVoidScore = this.activeNotes.size > 0 ? 0 : 1

    // Combined void score: all conditions must indicate "void" for drone to emerge
    // Multiplication means any single factor can suppress the drone
    this.currentVoidScore = timeScore * influenceVoidScore * noteVoidScore

    // Calculate target drone volume from void score
    // voidScore 0 = silent, voidScore 1 = nominal volume
    const targetDb = this.config.droneSilentDb +
      (this.currentVoidScore * (this.config.droneNominalDb - this.config.droneSilentDb))

    // Apply volume change if target changed significantly (avoid constant small adjustments)
    if (Math.abs(targetDb - this.currentTargetDb) > 0.5) {
      this._applyDroneVolume(targetDb)
      this.currentTargetDb = targetDb

      if (this.debugEnabled) {
        console.log(`DroneVoidController: voidScore=${this.currentVoidScore.toFixed(2)}, ` +
          `timeScore=${timeScore.toFixed(2)}, influenceVoid=${influenceVoidScore.toFixed(2)}, ` +
          `noteVoid=${noteVoidScore}, targetDb=${targetDb.toFixed(1)}`)
      }
    }
  }

  /**
   * Apply drone volume with appropriate fade time
   * Uses droneAmplitudeGain (linear 0-1) if available, falls back to pad volume
   *
   * Note: We use droneAmplitudeGain because the existing droneAmplitudeLFO modulates
   * ambientVolumes.pad.volume. Using the gain node allows both to coexist:
   * - DroneVoidController: overall presence (0-1)
   * - droneAmplitudeLFO: subtle organic breathing (-6dB to 0dB)
   *
   * @param {number} targetDb - Target volume in dB (converted to gain 0-1)
   */
  _applyDroneVolume(targetDb) {
    // Convert dB to linear gain for droneAmplitudeGain
    // -60dB = 0.001 (effectively 0), -3dB = 0.708, 0dB = 1.0
    const targetGain = this._dbToGain(targetDb)

    // Prefer droneAmplitudeGain (works with existing LFO modulation)
    // Critical #1: Explicit check for droneAmplitudeGain existence
    const gainNode = this.audioService.droneAmplitudeGain
    if (gainNode && gainNode.gain) {
      try {
        const currentGain = gainNode.gain.value
        const isIncreasing = targetGain > currentGain
        const fadeTime = isIncreasing ? this.config.fadeInTime : this.config.fadeOutTime

        // Use linear ramp for gain (more natural for amplitude)
        gainNode.gain.linearRampTo(targetGain, fadeTime)

        if (this.debugEnabled || Math.abs(targetGain - currentGain) > 0.3) {
          console.log(`DroneVoidController: Gain ${isIncreasing ? 'fade in' : 'fade out'} ` +
            `to ${targetGain.toFixed(3)} over ${fadeTime}s`)
        }
        return
      } catch (e) {
        // Critical #2: Log error before fallback
        console.warn('DroneVoidController: Failed to apply gain modulation, using fallback:', e.message)
      }
    }

    // Fallback: control ambientVolumes.pad directly (may conflict with LFO)
    if (this.audioService?.ambientVolumes?.pad) {
      try {
        const currentDb = this.audioService.ambientVolumes.pad.volume.value
        const isIncreasing = targetDb > currentDb
        const fadeTime = isIncreasing ? this.config.fadeInTime : this.config.fadeOutTime

        this.audioService.ambientVolumes.pad.volume.rampTo(targetDb, fadeTime)

        if (this.debugEnabled || Math.abs(targetDb - currentDb) > 10) {
          console.log(`DroneVoidController: Volume ${isIncreasing ? 'fade in' : 'fade out'} ` +
            `to ${targetDb.toFixed(1)}dB over ${fadeTime}s`)
        }
      } catch (e) {
        console.warn('DroneVoidController: Failed to set volume:', e.message)
      }
    }
  }

  /**
   * Set drone volume immediately (no fade)
   * @param {number} db - Volume in dB
   */
  _setDroneVolumeImmediate(db) {
    const targetGain = this._dbToGain(db)

    // Prefer droneAmplitudeGain
    // Critical #1: Explicit check for droneAmplitudeGain existence
    const gainNode = this.audioService.droneAmplitudeGain
    if (gainNode && gainNode.gain) {
      try {
        gainNode.gain.value = targetGain
        this.currentTargetDb = db
        return
      } catch (e) {
        // Critical #2: Log error before fallback
        console.warn('DroneVoidController: Failed to set immediate gain, using fallback:', e.message)
      }
    }

    // Fallback: pad volume
    if (this.audioService?.ambientVolumes?.pad) {
      try {
        this.audioService.ambientVolumes.pad.volume.value = db
        this.currentTargetDb = db
      } catch (e) {
        console.warn('DroneVoidController: Failed to set immediate volume:', e.message)
      }
    }
  }

  /**
   * Convert dB to linear gain
   * @param {number} db - Value in decibels
   * @returns {number} Linear gain (0-1+)
   */
  _dbToGain(db) {
    if (db <= -60) return 0
    return Math.pow(10, db / 20)
  }

  /**
   * Clamp value between min and max
   */
  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
  }

  // ==================== Getters for debugging ====================

  get voidScore() {
    return this.currentVoidScore
  }

  get activeNoteCount() {
    return this.activeNotes.size
  }

  get timeSinceActivity() {
    return Date.now() - this.lastActivityTime
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DroneVoidController
}
