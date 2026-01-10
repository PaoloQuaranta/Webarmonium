/**
 * UltraLowPowerAudio.js
 *
 * Ultra-minimal audio engine for very low-end devices (old Android, etc.)
 * Uses a single oscillator with no effects chain for minimum CPU usage.
 *
 * Entry #73: Device-Adaptive Audio Architecture
 *
 * Features DISABLED:
 * - No three-tier architecture
 * - No background composition
 * - No ambient filters
 * - No delay/reverb effects
 * - No polyphony
 *
 * Features ENABLED:
 * - Single sine wave oscillator
 * - Basic envelope (attack/release)
 * - Volume control
 */

class UltraLowPowerAudio {
  constructor () {
    this.isInitialized = false
    this.isPlaying = false
    this.oscillator = null
    this.gainNode = null
    this.audioContext = null

    // Configuration for ultra-low power
    this.config = {
      attackTime: 0.02,    // 20ms attack
      releaseTime: 0.1,    // 100ms release
      maxGain: 0.5,        // 50% max volume
      waveform: 'sine'     // Simplest waveform
    }

    // Current state
    this.currentFrequency = 440
    this.currentVelocity = 0.5
    this.noteActive = false

    // Queue for note scheduling (simple FIFO)
    this.noteQueue = []
    this.isProcessingQueue = false
  }

  /**
   * Initialize the minimal audio system
   * @returns {Promise<boolean>} Success status
   */
  async initialize () {
    if (this.isInitialized) return true

    try {
      // Create AudioContext with conservative settings
      const contextOptions = {
        latencyHint: 'playback',
        sampleRate: 22050  // Very low sample rate for minimal CPU
      }

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)(contextOptions)

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain()
      this.gainNode.gain.value = 0
      this.gainNode.connect(this.audioContext.destination)

      // Create oscillator (always running, gain controls sound)
      this.oscillator = this.audioContext.createOscillator()
      this.oscillator.type = this.config.waveform
      this.oscillator.frequency.value = this.currentFrequency
      this.oscillator.connect(this.gainNode)
      this.oscillator.start()

      this.isInitialized = true
      console.log('🔋 UltraLowPowerAudio: Initialized (sampleRate=' + this.audioContext.sampleRate + ')')

      return true
    } catch (error) {
      console.error('🔋 UltraLowPowerAudio: Failed to initialize', error)
      return false
    }
  }

  /**
   * Resume audio context (required after user interaction)
   * @returns {Promise<boolean>}
   */
  async resume () {
    if (!this.audioContext) return false

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
      console.log('🔋 UltraLowPowerAudio: Resumed')
    }
    return this.audioContext.state === 'running'
  }

  /**
   * Play a single note
   * @param {number} frequency - Frequency in Hz
   * @param {number} duration - Duration in seconds
   * @param {number} velocity - Velocity 0-1
   */
  playNote (frequency, duration = 0.3, velocity = 0.5) {
    if (!this.isInitialized || !this.audioContext) return

    // Queue the note if we're busy
    if (this.noteActive) {
      this.noteQueue.push({ frequency, duration, velocity })
      if (this.noteQueue.length > 3) {
        this.noteQueue.shift() // Keep queue small
      }
      return
    }

    this._playNoteImmediate(frequency, duration, velocity)
  }

  /**
   * Internal: Play note immediately
   * Entry #73 FIX: Added error recovery if oscillator fails
   */
  _playNoteImmediate (frequency, duration, velocity) {
    try {
      // Entry #73 FIX: Verify oscillator is still valid
      if (!this.oscillator || !this.gainNode) {
        console.warn('🔋 UltraLowPowerAudio: Oscillator missing, attempting recovery')
        this._recreateOscillator()
        if (!this.oscillator) {
          console.error('🔋 UltraLowPowerAudio: Recovery failed')
          return
        }
      }

      const now = this.audioContext.currentTime
      const gain = Math.min(velocity, 1) * this.config.maxGain

      // Set frequency
      this.oscillator.frequency.setValueAtTime(frequency, now)

      // Envelope: attack
      this.gainNode.gain.cancelScheduledValues(now)
      this.gainNode.gain.setValueAtTime(0, now)
      this.gainNode.gain.linearRampToValueAtTime(gain, now + this.config.attackTime)

      // Envelope: sustain then release
      const sustainEnd = now + duration
      this.gainNode.gain.setValueAtTime(gain, sustainEnd)
      this.gainNode.gain.linearRampToValueAtTime(0, sustainEnd + this.config.releaseTime)

      this.noteActive = true
      this.currentFrequency = frequency
      this.currentVelocity = velocity

      // Schedule note end and queue processing
      const totalDuration = (duration + this.config.releaseTime) * 1000
      setTimeout(() => {
        this.noteActive = false
        this._processQueue()
      }, totalDuration)
    } catch (error) {
      // Entry #73 FIX: Attempt recovery on error
      console.warn('🔋 UltraLowPowerAudio: playNote error, attempting recovery', error.message)
      this._recreateOscillator()
      this.noteActive = false
    }
  }

  /**
   * Entry #73 FIX: Recreate oscillator if it fails
   * Called when oscillator gets in a bad state
   */
  _recreateOscillator () {
    try {
      // Clean up old oscillator
      if (this.oscillator) {
        try {
          this.oscillator.stop()
          this.oscillator.disconnect()
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      // Recreate gain node if needed
      if (!this.gainNode || !this.audioContext) {
        console.error('🔋 UltraLowPowerAudio: Cannot recreate - missing context or gain')
        return
      }

      // Create new oscillator
      this.oscillator = this.audioContext.createOscillator()
      this.oscillator.type = this.config.waveform
      this.oscillator.frequency.value = this.currentFrequency
      this.oscillator.connect(this.gainNode)
      this.oscillator.start()

      console.log('🔋 UltraLowPowerAudio: Oscillator recreated successfully')
    } catch (error) {
      console.error('🔋 UltraLowPowerAudio: Failed to recreate oscillator', error)
      this.oscillator = null
    }
  }

  /**
   * Process queued notes
   */
  _processQueue () {
    if (this.noteQueue.length > 0 && !this.noteActive) {
      const note = this.noteQueue.shift()
      this._playNoteImmediate(note.frequency, note.duration, note.velocity)
    }
  }

  /**
   * Play a musical event (compatibility with AudioService API)
   * @param {Object} event - Musical event with frequency, duration, velocity
   */
  playMusicalEvent (event) {
    if (!event) return

    const frequency = event.frequency || event.freq || 440
    const duration = event.duration || event.dur || 0.3
    const velocity = event.velocity || event.vel || 0.5

    this.playNote(frequency, duration, velocity)
  }

  /**
   * Set master volume
   * @param {number} volume - Volume 0-1
   */
  setVolume (volume) {
    this.config.maxGain = Math.max(0, Math.min(1, volume))
  }

  /**
   * Stop all audio
   */
  stop () {
    if (!this.audioContext) return

    const now = this.audioContext.currentTime
    this.gainNode.gain.cancelScheduledValues(now)
    this.gainNode.gain.setValueAtTime(0, now)
    this.noteActive = false
    this.noteQueue = []
  }

  /**
   * Dispose of audio resources
   */
  dispose () {
    this.stop()

    if (this.oscillator) {
      this.oscillator.stop()
      this.oscillator.disconnect()
      this.oscillator = null
    }

    if (this.gainNode) {
      this.gainNode.disconnect()
      this.gainNode = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.isInitialized = false
    console.log('🔋 UltraLowPowerAudio: Disposed')
  }

  /**
   * Get current status
   * @returns {Object}
   */
  getStatus () {
    return {
      isInitialized: this.isInitialized,
      isPlaying: this.noteActive,
      queueLength: this.noteQueue.length,
      currentFrequency: this.currentFrequency,
      sampleRate: this.audioContext?.sampleRate || 0,
      state: this.audioContext?.state || 'closed'
    }
  }

  // =========================================================================
  // Stub methods for AudioService compatibility
  // These do nothing in ultra-low power mode
  // =========================================================================

  handleHoverModulation () { /* No-op in low power mode */ }
  startBackground () { /* No background in low power mode */ }
  stopBackground () { /* No background in low power mode */ }
  playBackgroundComposition () { /* No background in low power mode */ }
  updateAmbientFilter () { /* No filters in low power mode */ }
  setFilterParameters () { /* No filters in low power mode */ }
  addDownbeatEmphasis () { /* No emphasis in low power mode */ }
}

// Export for both module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UltraLowPowerAudio
}
if (typeof window !== 'undefined') {
  window.UltraLowPowerAudio = UltraLowPowerAudio
}
