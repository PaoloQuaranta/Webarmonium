/**
 * SynthPanel.js - Entry #SynthUI: Synth Parameter Control Panel
 *
 * Modal panel for customizing local synth timbre with:
 * - Preset selection (free presets only)
 * - Oscillator-specific controls
 * - Filter controls
 * - ADSR envelope
 * - Effects (volume, pan, delay, reverb)
 * - Generate Gestures button for audition
 */

class SynthPanel {
  static ANIMATION_DURATION = 300

  constructor () {
    this.isOpen = false
    this.overlay = null
    this.panel = null

    // Service references (set by UIManager)
    this.audioService = null
    this.socketService = null

    // User color for UI theming
    this.userColor = '#2dd4bf' // Default accent

    // Current state
    this.currentPresetSlot = null
    this.params = this._getDefaultParams()

    // Generate gestures state
    this.generateGesturesActive = false
    this.gestureTimeout = null

    // Throttle params emission
    this.lastEmitTime = 0
    this.emitThrottleMs = 200 // Max 5Hz

    // Bind methods
    this.open = this.open.bind(this)
    this.close = this.close.bind(this)
    this._handleKeyDown = this._handleKeyDown.bind(this)
    this._handleOverlayClick = this._handleOverlayClick.bind(this)
  }

  _getDefaultParams () {
    return {
      filterType: 'lowpass',
      filterCutoff: 2000,
      filterQ: 1.0,
      attack: 0.05,
      decay: 0.3,
      sustain: 0.5,
      release: 0.5,
      volume: 0,
      pan: 0,
      delaySend: 0.2,
      reverbSend: 0.3,
      // Oscillator-specific (set based on preset)
      pulseWidth: 0.3,
      fatSpread: 25,
      modulationIndex: 4
    }
  }

  /**
   * Set service references
   */
  setServices (audioService, socketService) {
    this.audioService = audioService
    this.socketService = socketService

    // Get current params from audio service if available
    if (audioService) {
      const currentParams = audioService.getSynthParams?.()
      if (currentParams) {
        this.currentPresetSlot = currentParams.presetSlot
        Object.assign(this.params, currentParams)
      }
    }

    // Listen for slot changes - store handler reference for cleanup
    if (socketService) {
      // Remove previous listener if any
      if (this._slotsChangedHandler && this.socketService?.off) {
        this.socketService.off('synth:slots-changed', this._slotsChangedHandler)
      }

      this._slotsChangedHandler = () => {
        if (this.isOpen) {
          this._updatePresetSelector()
        }
      }
      socketService.on?.('synth:slots-changed', this._slotsChangedHandler)
    }
  }

  /**
   * Set user color for UI theming
   */
  setUserColor (color) {
    this.userColor = color
    if (this.panel) {
      this.panel.style.setProperty('--synth-accent', color)
    }
  }

  /**
   * Open the panel
   */
  open () {
    if (this.isOpen) return
    this.isOpen = true

    this._previouslyFocusedElement = document.activeElement
    this._createPanel()

    document.addEventListener('keydown', this._handleKeyDown)

    requestAnimationFrame(() => {
      this.overlay.classList.add('settings-visible')
      const closeBtn = this.panel.querySelector('.settings-close')
      if (closeBtn) closeBtn.focus()
    })
  }

  /**
   * Close the panel
   */
  close () {
    if (!this.isOpen) return
    this.isOpen = false

    // Stop gesture generation
    this._stopGestureGeneration()

    document.removeEventListener('keydown', this._handleKeyDown)

    // Entry #SynthUI: Clean up socket event listener to prevent memory leak
    if (this._slotsChangedHandler && this.socketService?.off) {
      this.socketService.off('synth:slots-changed', this._slotsChangedHandler)
    }

    if (this._previouslyFocusedElement?.focus) {
      this._previouslyFocusedElement.focus()
    }
    this._previouslyFocusedElement = null // Clear reference

    this.overlay.classList.remove('settings-visible')

    setTimeout(() => {
      if (this.overlay?.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay)
      }
      this.overlay = null
      this.panel = null
    }, SynthPanel.ANIMATION_DURATION)
  }

  /**
   * Create the panel DOM
   */
  _createPanel () {
    this.overlay = document.createElement('div')
    this.overlay.className = 'settings-overlay synth-overlay'
    this.overlay.addEventListener('click', this._handleOverlayClick)

    this.panel = document.createElement('div')
    this.panel.className = 'settings-panel synth-panel'
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-modal', 'true')
    this.panel.setAttribute('aria-labelledby', 'synth-title')
    this.panel.style.setProperty('--synth-accent', this.userColor)
    this.panel.innerHTML = this._getPanelHTML()

    this.overlay.appendChild(this.panel)
    document.body.appendChild(this.overlay)

    // Attach listeners
    this._attachListeners()
    this._updateOscillatorSection()
  }

  /**
   * Get panel HTML structure
   */
  _getPanelHTML () {
    const presetOptions = this._getPresetOptions()

    return `
      <div class="settings-header">
        <span class="settings-title" id="synth-title">Synth</span>
        <button class="settings-close" aria-label="Close">&times;</button>
      </div>
      <div class="settings-content">

        <!-- PRESET SELECTOR -->
        <div class="settings-group">
          <div class="settings-group-title">PRESET</div>
          <select id="synth-preset-select" class="synth-select">
            ${presetOptions}
          </select>
        </div>

        <!-- OSCILLATOR (context-sensitive) -->
        <div class="settings-group" id="synth-osc-group">
          <div class="settings-group-title">OSCILLATOR</div>
          <div id="synth-osc-controls"></div>
        </div>

        <!-- FILTER -->
        <div class="settings-group">
          <div class="settings-group-title">FILTER</div>
          <div class="synth-filter-type">
            <button class="synth-filter-btn ${this.params.filterType === 'lowpass' ? 'active' : ''}" data-filter="lowpass">LP</button>
            <button class="synth-filter-btn ${this.params.filterType === 'highpass' ? 'active' : ''}" data-filter="highpass">HP</button>
            <button class="synth-filter-btn ${this.params.filterType === 'bandpass' ? 'active' : ''}" data-filter="bandpass">BP</button>
          </div>
          ${this._getSliderHTML('filterCutoff', 'Cutoff', 200, 8000, this.params.filterCutoff, 'Hz')}
          ${this._getSliderHTML('filterQ', 'Resonance', 0.5, 4.0, this.params.filterQ, '')}
        </div>

        <!-- ENVELOPE (ADSR) -->
        <div class="settings-group">
          <div class="settings-group-title">ENVELOPE</div>
          ${this._getSliderHTML('attack', 'Attack', 0.002, 1.0, this.params.attack, 's')}
          ${this._getSliderHTML('decay', 'Decay', 0.05, 2.0, this.params.decay, 's')}
          ${this._getSliderHTML('sustain', 'Sustain', 0.1, 1.0, this.params.sustain, '')}
          ${this._getSliderHTML('release', 'Release', 0.05, 4.0, this.params.release, 's')}
        </div>

        <!-- EFFECTS -->
        <div class="settings-group">
          <div class="settings-group-title">EFFECTS</div>
          ${this._getSliderHTML('volume', 'Volume', -12, 12, this.params.volume, 'dB')}
          ${this._getSliderHTML('pan', 'Pan', -1.0, 1.0, this.params.pan, '')}
          ${this._getSliderHTML('delaySend', 'Delay', 0, 0.8, this.params.delaySend, '')}
          ${this._getSliderHTML('reverbSend', 'Reverb', 0, 0.8, this.params.reverbSend, '')}
        </div>

        <!-- GENERATE GESTURES -->
        <div class="settings-group">
          <div class="settings-group-title">AUDITION</div>
          <button id="synth-generate-btn" class="synth-generate-btn">
            Generate Gestures
          </button>
        </div>
      </div>
    `
  }

  /**
   * Get preset selector options HTML
   */
  _getPresetOptions () {
    const allPresets = [
      { slot: 0, name: 'Retro Square' },
      { slot: 1, name: 'Nasal Reed' },
      { slot: 2, name: 'Warm Chorus' },
      { slot: 3, name: 'Bell Chime' },
      { slot: 4, name: 'Soft Square' },
      { slot: 5, name: 'Wide Pulse' },
      { slot: 6, name: 'Bright Chorus' },
      { slot: 7, name: 'Deep Bell' }
    ]

    // Get occupied slots
    const occupiedSlots = this.socketService?.getOccupiedPresetSlots?.() || []

    return allPresets.map(preset => {
      const isOccupied = occupiedSlots.includes(preset.slot) &&
                        preset.slot !== this.currentPresetSlot
      const isSelected = preset.slot === this.currentPresetSlot

      return `<option value="${preset.slot}" ${isSelected ? 'selected' : ''} ${isOccupied ? 'disabled' : ''}>
        ${preset.name}${isOccupied ? ' (in use)' : ''}
      </option>`
    }).join('')
  }

  /**
   * Get slider HTML
   */
  _getSliderHTML (param, label, min, max, value, unit) {
    const step = (max - min) / 100
    const displayValue = this._formatValue(value, unit)

    return `
      <div class="synth-slider-row">
        <label>${label}</label>
        <input type="range"
               class="synth-slider"
               data-param="${param}"
               min="${min}"
               max="${max}"
               step="${step}"
               value="${value}">
        <span class="synth-value" data-value="${param}">${displayValue}</span>
      </div>
    `
  }

  /**
   * Format value for display
   */
  _formatValue (value, unit) {
    if (unit === 'Hz') {
      return Math.round(value) + unit
    } else if (unit === 's') {
      return value.toFixed(2) + unit
    } else if (unit === 'dB') {
      return (value >= 0 ? '+' : '') + value.toFixed(1) + unit
    } else {
      return value.toFixed(2)
    }
  }

  /**
   * Update preset selector when slots change
   */
  _updatePresetSelector () {
    const select = this.panel?.querySelector('#synth-preset-select')
    if (select) {
      select.innerHTML = this._getPresetOptions()
    }
  }

  /**
   * Update oscillator controls based on current preset
   */
  _updateOscillatorSection () {
    const container = this.panel?.querySelector('#synth-osc-controls')
    if (!container) return

    // Get current patch info
    const patch = window.PatchDefinitions?.REAL_USER_PATCHES?.[this.currentPresetSlot]
    const oscType = patch?.oscillator?.type || 'sawtooth'

    if (oscType === 'pulse') {
      container.innerHTML = this._getSliderHTML('pulseWidth', 'Width', 0.1, 0.9, this.params.pulseWidth, '')
    } else if (oscType?.startsWith('fat')) {
      container.innerHTML = this._getSliderHTML('fatSpread', 'Spread', 5, 50, this.params.fatSpread, '')
    } else if (oscType === 'fmsine') {
      container.innerHTML = this._getSliderHTML('modulationIndex', 'FM Index', 0.5, 12, this.params.modulationIndex, '')
    } else {
      container.innerHTML = '<p class="synth-note">No oscillator parameters</p>'
    }

    // Re-attach slider listeners
    this._attachSliderListeners()
  }

  /**
   * Attach all event listeners
   */
  _attachListeners () {
    // Close button
    const closeBtn = this.panel.querySelector('.settings-close')
    if (closeBtn) {
      closeBtn.addEventListener('click', this.close)
    }

    // Preset selector
    const presetSelect = this.panel.querySelector('#synth-preset-select')
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => this._onPresetChange(e))
    }

    // Filter type buttons
    const filterBtns = this.panel.querySelectorAll('.synth-filter-btn')
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => this._onFilterTypeChange(e))
    })

    // Generate gestures button
    const generateBtn = this.panel.querySelector('#synth-generate-btn')
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this._toggleGestureGeneration())
    }

    // Sliders
    this._attachSliderListeners()
  }

  /**
   * Attach slider listeners
   */
  _attachSliderListeners () {
    const sliders = this.panel?.querySelectorAll('.synth-slider')
    sliders?.forEach(slider => {
      slider.addEventListener('input', (e) => this._onSliderChange(e))
    })
  }

  /**
   * Handle preset change
   */
  async _onPresetChange (e) {
    const slot = parseInt(e.target.value, 10)

    // Request slot from server
    if (this.socketService) {
      const response = await this.socketService.requestPresetSlot(slot)
      if (!response.granted) {
        // Revert selection
        e.target.value = this.currentPresetSlot ?? ''
        this._showToast(`Preset "${response.takenBy}" is in use`)
        return
      }
    }

    // Apply preset locally
    this.currentPresetSlot = slot
    if (this.audioService?.selectPreset) {
      this.audioService.selectPreset(slot)
    }

    // Update oscillator controls for new preset type
    this._updateOscillatorSection()

    // Update params from new preset defaults
    const patch = window.PatchDefinitions?.REAL_USER_PATCHES?.[slot]
    if (patch) {
      this.params.filterType = patch.filter?.type || 'lowpass'
      this.params.filterCutoff = patch.filter?.frequency || 2000
      this.params.filterQ = patch.filter?.Q || 1.0
      this.params.attack = patch.envelope?.attack || 0.05
      this.params.decay = patch.envelope?.decay || 0.3
      this.params.sustain = patch.envelope?.sustain || 0.5
      this.params.release = patch.envelope?.release || 0.5
      this.params.delaySend = patch.effects?.delaySend || 0.2
      this.params.reverbSend = patch.effects?.reverbSend || 0.3

      if (patch.oscillator?.width !== undefined) {
        this.params.pulseWidth = patch.oscillator.width
      }
      if (patch.oscillator?.spread !== undefined) {
        this.params.fatSpread = patch.oscillator.spread
      }
      if (patch.oscillator?.modulationIndex !== undefined) {
        this.params.modulationIndex = patch.oscillator.modulationIndex
      }
    }

    // Update UI sliders
    this._updateSliderValues()

    // Emit to server
    this._emitParams()
  }

  /**
   * Handle filter type change
   */
  _onFilterTypeChange (e) {
    const filterType = e.target.dataset.filter

    // Update button states
    this.panel.querySelectorAll('.synth-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filterType)
    })

    this.params.filterType = filterType
    this._applyParams()
    this._emitParams()
  }

  /**
   * Handle slider change
   */
  _onSliderChange (e) {
    const param = e.target.dataset.param
    const value = parseFloat(e.target.value)

    this.params[param] = value

    // Update display value
    const valueDisplay = this.panel.querySelector(`[data-value="${param}"]`)
    if (valueDisplay) {
      const unit = this._getUnitForParam(param)
      valueDisplay.textContent = this._formatValue(value, unit)
    }

    this._applyParams()
    this._emitParamsThrottled()
  }

  /**
   * Get unit string for parameter
   */
  _getUnitForParam (param) {
    const units = {
      filterCutoff: 'Hz',
      attack: 's',
      decay: 's',
      release: 's',
      volume: 'dB'
    }
    return units[param] || ''
  }

  /**
   * Update slider values in UI
   */
  _updateSliderValues () {
    Object.entries(this.params).forEach(([param, value]) => {
      const slider = this.panel?.querySelector(`[data-param="${param}"]`)
      if (slider) {
        slider.value = value
      }
      const display = this.panel?.querySelector(`[data-value="${param}"]`)
      if (display) {
        const unit = this._getUnitForParam(param)
        display.textContent = this._formatValue(value, unit)
      }
    })

    // Update filter type buttons
    this.panel?.querySelectorAll('.synth-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === this.params.filterType)
    })
  }

  /**
   * Apply current params to audio service
   */
  _applyParams () {
    if (this.audioService?.setSynthParams) {
      this.audioService.setSynthParams(this.params)
    }
  }

  /**
   * Emit params to server (throttled)
   */
  _emitParamsThrottled () {
    const now = Date.now()
    if (now - this.lastEmitTime < this.emitThrottleMs) {
      return
    }
    this.lastEmitTime = now
    this._emitParams()
  }

  /**
   * Emit params to server
   */
  _emitParams () {
    if (this.socketService?.emitSynthParams) {
      this.socketService.emitSynthParams(this.currentPresetSlot, this.params)
    }
  }

  // ==========================================
  // Generate Gestures Feature
  // ==========================================

  /**
   * Toggle gesture generation
   */
  _toggleGestureGeneration () {
    this.generateGesturesActive = !this.generateGesturesActive

    const btn = this.panel?.querySelector('#synth-generate-btn')
    if (btn) {
      btn.classList.toggle('active', this.generateGesturesActive)
      btn.textContent = this.generateGesturesActive ? 'Stop Generating' : 'Generate Gestures'
    }

    if (this.generateGesturesActive) {
      this._startGestureGeneration()
    } else {
      this._stopGestureGeneration()
    }
  }

  /**
   * Start generating gestures
   */
  _startGestureGeneration () {
    this._scheduleNextGesture()
  }

  /**
   * Stop generating gestures
   */
  _stopGestureGeneration () {
    if (this.gestureTimeout) {
      clearTimeout(this.gestureTimeout)
      this.gestureTimeout = null
    }
    this.generateGesturesActive = false

    const btn = this.panel?.querySelector('#synth-generate-btn')
    if (btn) {
      btn.classList.remove('active')
      btn.textContent = 'Generate Gestures'
    }
  }

  /**
   * Schedule next gesture generation
   */
  _scheduleNextGesture () {
    if (!this.generateGesturesActive) return

    // Get combined metrics (or use random if not available)
    const metrics = this._getCombinedMetrics()
    const activityLevel = metrics.combined

    // Delay: 35s base, 15s min (matches virtual users)
    const baseDelay = 35000
    const minDelay = 15000
    const delay = baseDelay - (activityLevel * (baseDelay - minDelay))

    this.gestureTimeout = setTimeout(() => {
      this._generateGesture(metrics)
      this._scheduleNextGesture()
    }, delay)
  }

  /**
   * Get combined metrics from all 3 sources
   */
  _getCombinedMetrics () {
    // Try to access metrics from window (landing page pattern)
    const metricsData = window.metricsData || {}

    // Normalize each metric to 0-1
    const wikipedia = Math.min(1, (metricsData.wikipedia?.editsPerMinute || 0) / 500)
    const hackerNews = Math.min(1, (metricsData.hackerNews?.postsPerMinute || 0) / 100)
    const github = Math.min(1, (metricsData.github?.commitsPerMinute || 0) / 50)

    // If no real metrics, use random values
    const hasRealMetrics = metricsData.wikipedia || metricsData.hackerNews || metricsData.github

    return {
      wikipedia: hasRealMetrics ? wikipedia : Math.random() * 0.5 + 0.2,
      hackerNews: hasRealMetrics ? hackerNews : Math.random() * 0.5 + 0.2,
      github: hasRealMetrics ? github : Math.random() * 0.5 + 0.2,
      combined: hasRealMetrics
        ? (wikipedia + hackerNews + github) / 3
        : Math.random() * 0.5 + 0.25
    }
  }

  /**
   * Generate a gesture based on metrics
   */
  _generateGesture (metrics) {
    if (!this.audioService?.playSimpleNote) return

    // Position X: weighted average of regions
    const x = metrics.wikipedia * 0.17 +
              metrics.hackerNews * 0.5 +
              metrics.github * 0.83

    // Position Y: combined activity level
    const y = metrics.combined

    // Calculate frequency (higher y = lower pitch for musical effect)
    const baseFreq = 110  // A2
    const maxFreq = 880   // A5
    const frequency = baseFreq + (1 - y) * (maxFreq - baseFreq) + x * 110

    // Intensity based on variance
    const variance = Math.abs(metrics.wikipedia - metrics.hackerNews) +
                    Math.abs(metrics.hackerNews - metrics.github)
    const intensity = 0.3 + variance * 0.4

    // Duration: higher activity = shorter notes
    const duration = 0.2 + (1 - metrics.combined) * 0.5

    // Play the note
    this.audioService.playSimpleNote(frequency, duration, intensity)
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  /**
   * Handle keyboard events
   */
  _handleKeyDown (e) {
    if (e.key === 'Escape') {
      this.close()
    }
  }

  /**
   * Handle overlay click (close on click outside panel)
   */
  _handleOverlayClick (e) {
    if (e.target === this.overlay) {
      this.close()
    }
  }

  /**
   * Show toast notification
   */
  _showToast (message) {
    // Simple toast implementation
    const toast = document.createElement('div')
    toast.className = 'synth-toast'
    toast.textContent = message
    toast.style.cssText = `
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--ui-bg, rgba(10, 10, 20, 0.9));
      color: var(--bright, #e0e0f0);
      padding: 12px 24px;
      border-radius: 8px;
      z-index: 10001;
      font-family: var(--font-mono, monospace);
      font-size: 12px;
    `
    document.body.appendChild(toast)

    setTimeout(() => {
      toast.remove()
    }, 2000)
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.SynthPanel = SynthPanel
}
