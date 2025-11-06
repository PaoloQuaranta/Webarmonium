/**
 * VolumeController
 * Single-responsibility component for audio volume and mute control
 * Extracted from AudioService.js as part of Sprint 2 refactoring
 *
 * Constitutional requirement: FR-011 (Volume control)
 */

class VolumeController {
  /**
   * @param {Object} masterVolume - Tone.js Volume node
   */
  constructor(masterVolume = null) {
    this.masterVolume = masterVolume
    this.volume = 0.7 // Default volume 70%
    this.muted = false
  }

  /**
   * Set the master volume node (called after Tone.js initialization)
   * @param {Object} masterVolume - Tone.js Volume node
   */
  setMasterVolumeNode(masterVolume) {
    this.masterVolume = masterVolume
    // Apply current settings to the new node
    if (this.masterVolume) {
      this.applyCurrentSettings()
    }
  }

  /**
   * Apply current volume and mute settings to the master volume node
   * @private
   */
  applyCurrentSettings() {
    if (!this.masterVolume) return

    // Apply mute state
    this.masterVolume.mute = this.muted

    // Apply volume level
    if (this.volume === 0) {
      this.masterVolume.volume.value = -Infinity
    } else {
      const db = (this.volume - 1) * 60
      this.masterVolume.volume.rampTo(db, 0.1)
    }
  }

  /**
   * Set mute state (FR-011)
   * Controls master volume node in real-time
   * @param {boolean} muted - True to mute, false to unmute
   */
  setMuted(muted) {
    this.muted = Boolean(muted)

    // Apply to master volume node if initialized
    if (this.masterVolume) {
      this.masterVolume.mute = this.muted
      console.log(`🔇 Master volume ${this.muted ? 'MUTED' : 'UNMUTED'}`)
    }
  }

  /**
   * Set volume level (FR-011)
   * Controls master volume node in real-time
   * @param {number} volume - Volume level (0-1)
   */
  setVolume(volume) {
    // Validate and clamp volume
    this.volume = Math.max(0, Math.min(1, Number(volume) || 0))

    // Apply to master volume node if initialized
    if (this.masterVolume) {
      // Convert 0-1 to dB range (-60dB to 0dB)
      // At volume=0 → -Infinity (silent)
      // At volume=0.5 → -30dB
      // At volume=1 → 0dB
      const db = this.volume === 0 ? -Infinity : (this.volume - 1) * 60
      this.masterVolume.volume.rampTo(db, 0.1) // Smooth 100ms ramp
      console.log(`🔊 Master volume set to ${(this.volume * 100).toFixed(0)}% (${db === -Infinity ? '-∞' : db.toFixed(1)}dB)`)
    }
  }

  /**
   * Get current mute state
   * @returns {boolean} True if muted
   */
  isMuted() {
    return this.muted
  }

  /**
   * Get current volume level
   * @returns {number} Volume (0-1)
   */
  getVolume() {
    return this.volume
  }

  /**
   * Get current state as object
   * @returns {Object} Current volume controller state
   */
  getState() {
    return {
      volume: this.volume,
      muted: this.muted,
      volumePercent: Math.round(this.volume * 100),
      volumeDb: this.volume === 0 ? -Infinity : (this.volume - 1) * 60
    }
  }
}

// Make VolumeController available globally (for backward compatibility)
if (typeof window !== 'undefined') {
  window.VolumeController = VolumeController
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VolumeController
}
