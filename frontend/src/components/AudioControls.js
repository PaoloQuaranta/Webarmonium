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
   * Render UI controls
   */
  render () {
    // Clear container
    this.container.innerHTML = ''

    // Create controls wrapper
    const wrapper = document.createElement('div')
    wrapper.className = 'audio-controls'
    wrapper.style.cssText = `
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 10px;
      background: rgba(0, 0, 0, 0.7);
      border-radius: 8px;
      color: white;
      font-family: 'Archivo', sans-serif;
      font-size: 14px;
    `

    // Mute button
    this.muteButton = document.createElement('button')
    this.muteButton.className = 'audio-mute-button'
    this.muteButton.textContent = this.muted ? '🔇' : '🔊'
    this.muteButton.title = this.muted ? 'Unmute' : 'Mute'
    this.muteButton.style.cssText = `
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 18px;
      transition: background 0.2s;
    `
    this.muteButton.addEventListener('mouseenter', () => {
      this.muteButton.style.background = 'rgba(255, 255, 255, 0.2)'
    })
    this.muteButton.addEventListener('mouseleave', () => {
      this.muteButton.style.background = 'rgba(255, 255, 255, 0.1)'
    })
    this.muteButton.addEventListener('click', () => {
      this.toggleMute()
    })

    // Volume label
    const volumeLabel = document.createElement('label')
    volumeLabel.textContent = 'Volume:'
    volumeLabel.style.cssText = 'margin-left: 5px;'

    // Volume slider
    this.volumeSlider = document.createElement('input')
    this.volumeSlider.type = 'range'
    this.volumeSlider.min = '0'
    this.volumeSlider.max = '100'
    this.volumeSlider.value = this.volume.toString()
    this.volumeSlider.className = 'audio-volume-slider'
    this.volumeSlider.style.cssText = `
      width: 150px;
      cursor: pointer;
    `
    this.volumeSlider.addEventListener('input', (e) => {
      this.setVolume(parseInt(e.target.value, 10))
    })

    // Volume display
    this.volumeDisplay = document.createElement('span')
    this.volumeDisplay.className = 'audio-volume-display'
    this.volumeDisplay.textContent = `${this.volume}%`
    this.volumeDisplay.style.cssText = `
      min-width: 40px;
      text-align: right;
    `

    // Assemble controls
    wrapper.appendChild(this.muteButton)
    wrapper.appendChild(volumeLabel)
    wrapper.appendChild(this.volumeSlider)
    wrapper.appendChild(this.volumeDisplay)

    // Entry #48: Low Power Mode toggle (for mobile battery saving)
    if (typeof MobileResourceManager !== 'undefined') {
      this.lowPowerToggle = document.createElement('button')
      this.lowPowerToggle.className = 'low-power-toggle'
      this.lowPowerToggle.textContent = 'Low Power'
      this.lowPowerToggle.title = 'Enable Low Power Mode to reduce battery usage'
      this.lowPowerToggle.style.cssText = `
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s;
        margin-left: 10px;
      `

      const updateToggleState = () => {
        const isLowPower = MobileResourceManager.getInstance().isLowPowerMode()
        this.lowPowerToggle.style.background = isLowPower
          ? 'rgba(52, 211, 153, 0.3)'
          : 'rgba(255, 255, 255, 0.1)'
        this.lowPowerToggle.style.borderColor = isLowPower
          ? 'rgba(52, 211, 153, 0.6)'
          : 'rgba(255, 255, 255, 0.3)'
        this.lowPowerToggle.textContent = isLowPower ? 'Low Power ON' : 'Low Power'
      }

      this.lowPowerToggle.addEventListener('click', () => {
        MobileResourceManager.getInstance().toggleLowPowerMode()
        updateToggleState()
      })

      this.lowPowerToggle.addEventListener('mouseenter', () => {
        if (!MobileResourceManager.getInstance().isLowPowerMode()) {
          this.lowPowerToggle.style.background = 'rgba(255, 255, 255, 0.2)'
        }
      })
      this.lowPowerToggle.addEventListener('mouseleave', () => {
        updateToggleState()
      })

      // Listen for automatic mode changes
      MobileResourceManager.getInstance().addListener(() => updateToggleState())

      updateToggleState()
      wrapper.appendChild(this.lowPowerToggle)
    }

    this.container.appendChild(wrapper)
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
   * Apply mute state to UI
   */
  applyMuteState () {
    if (this.muteButton) {
      this.muteButton.textContent = this.muted ? '🔇' : '🔊'
      this.muteButton.title = this.muted ? 'Unmute' : 'Mute'
    }
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
