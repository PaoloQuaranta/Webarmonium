/**
 * AudioControls Component
 * UI controls for audio mute and volume
 * Saves settings to localStorage
 */
class AudioControls {
  /**
   * @param {HTMLElement} container - Container element for controls
   * @param {Function} onMuteChange - Callback when mute state changes (muted: boolean)
   * @param {Function} onVolumeChange - Callback when volume changes (volume: number 0-100)
   */
  constructor (container, onMuteChange, onVolumeChange) {
    if (!container || !(container instanceof HTMLElement)) {
      throw new Error('Valid HTMLElement container is required')
    }

    if (typeof onMuteChange !== 'function') {
      throw new Error('onMuteChange callback is required')
    }

    if (typeof onVolumeChange !== 'function') {
      throw new Error('onVolumeChange callback is required')
    }

    this.container = container
    this.onMuteChange = onMuteChange
    this.onVolumeChange = onVolumeChange

    // Load saved settings from localStorage
    this.muted = this.loadMutedState()
    this.volume = this.loadVolume()

    // DOM elements (created in render())
    this.muteButton = null
    this.volumeSlider = null
    this.volumeDisplay = null

    // Render UI
    this.render()

    // Apply initial state to UI
    this.applyMuteState()
    this.applyVolumeState()

    // Apply initial state to audio (important: apply saved settings on startup)
    this.onMuteChange(this.muted)
    this.onVolumeChange(this.volume)
  }

  /**
   * Load muted state from localStorage
   * @returns {boolean} Muted state (default: false)
   */
  loadMutedState () {
    const saved = localStorage.getItem('webarmonium:audio:muted')
    return saved === 'true'
  }

  /**
   * Load volume from localStorage
   * @returns {number} Volume 0-100 (default: 70)
   */
  loadVolume () {
    const saved = localStorage.getItem('webarmonium:audio:volume')
    const volume = parseInt(saved, 10)

    if (isNaN(volume) || volume < 0 || volume > 100) {
      return 70 // Default volume
    }

    return volume
  }

  /**
   * Save muted state to localStorage
   * @param {boolean} muted - Muted state
   */
  saveMutedState (muted) {
    localStorage.setItem('webarmonium:audio:muted', muted.toString())
  }

  /**
   * Save volume to localStorage
   * @param {number} volume - Volume 0-100
   */
  saveVolume (volume) {
    localStorage.setItem('webarmonium:audio:volume', volume.toString())
  }

  /**
   * Render UI controls (node-based design, no mute button)
   */
  render () {
    // Clear container
    this.container.innerHTML = ''

    // Create controls wrapper - node style (slider with label below)
    const wrapper = document.createElement('div')
    wrapper.className = 'slider-node'
    // No background - transparent, minimal style
    wrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      z-index: 1;
    `

    // Volume slider - uses global CSS styles
    this.volumeSlider = document.createElement('input')
    this.volumeSlider.type = 'range'
    this.volumeSlider.min = '0'
    this.volumeSlider.max = '100'
    this.volumeSlider.value = this.volume.toString()
    this.volumeSlider.id = 'roomVolumeSlider'
    // Slider uses global CSS from styles.css
    this.volumeSlider.addEventListener('input', (e) => {
      this.setVolume(parseInt(e.target.value, 10))
    })

    // Volume label - below slider (node style)
    const volumeLabel = document.createElement('label')
    volumeLabel.htmlFor = 'roomVolumeSlider'
    volumeLabel.textContent = 'Volume'
    volumeLabel.style.cssText = `
      margin-top: 0.4rem;
      font-family: 'Fira Code', monospace;
      font-size: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #5a5a70;
      white-space: nowrap;
    `

    // Assemble controls (slider first, then label)
    wrapper.appendChild(this.volumeSlider)
    wrapper.appendChild(volumeLabel)

    this.container.appendChild(wrapper)

    // No mute button - removed as per design
    this.muteButton = null
    this.volumeDisplay = null
  }

  /**
   * Toggle mute state
   */
  toggleMute () {
    this.muted = !this.muted
    this.saveMutedState(this.muted)
    this.applyMuteState()
    this.onMuteChange(this.muted)
  }

  /**
   * Set mute state
   * @param {boolean} muted - Muted state
   */
  setMuted (muted) {
    if (this.muted !== muted) {
      this.muted = muted
      this.saveMutedState(this.muted)
      this.applyMuteState()
      this.onMuteChange(this.muted)
    }
  }

  /**
   * Apply mute state to UI (no-op, mute button removed)
   */
  applyMuteState () {
    // Mute button removed - no UI update needed
  }

  /**
   * Set volume
   * @param {number} volume - Volume 0-100
   */
  setVolume (volume) {
    // Validate and constrain
    volume = Math.max(0, Math.min(100, volume))

    if (this.volume !== volume) {
      this.volume = volume
      this.saveVolume(this.volume)
      this.applyVolumeState()
      this.onVolumeChange(this.volume)
    }
  }

  /**
   * Apply volume state to UI
   */
  applyVolumeState () {
    if (this.volumeSlider) {
      this.volumeSlider.value = this.volume.toString()
    }

    if (this.volumeDisplay) {
      this.volumeDisplay.textContent = `${this.volume}%`
    }
  }

  /**
   * Get current mute state
   * @returns {boolean} Muted state
   */
  isMuted () {
    return this.muted
  }

  /**
   * Get current volume
   * @returns {number} Volume 0-100
   */
  getVolume () {
    return this.volume
  }

  /**
   * Get current settings
   * @returns {Object} {muted, volume}
   */
  getSettings () {
    return {
      muted: this.muted,
      volume: this.volume
    }
  }

  /**
   * Reset to defaults
   */
  reset () {
    this.setMuted(false)
    this.setVolume(70)
  }

  /**
   * Cleanup and destroy
   */
  destroy () {
    if (this.container) {
      this.container.innerHTML = ''
    }

    this.muteButton = null
    this.volumeSlider = null
    this.volumeDisplay = null
  }
}

// Export for use in browser and Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioControls
}
