/**
 * SynthPanel.js - Entry #SynthUI: Synth Parameter Control Panel
 *
 * Modal panel for customizing local synth timbre with:
 * - Preset selection (free presets only)
 * - Oscillator-specific controls
 * - Filter controls
 * - ADSR envelope
 * - Effects (volume, pan, delay, reverb)
 * - Audition button with sub-menu for virtual gesture generation
 */

class SynthPanel {
  static ANIMATION_DURATION = 300
  static MOBILE_BREAKPOINT = '(max-width: 500px)'
  static TOUCH_DRAG_DISTANCE = 200 // pixels for full slider range

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

    // Audition sub-menu and state
    this.auditionSubMenu = null
    this.auditionActive = false

    // Throttle params emission
    this.lastEmitTime = 0
    this.emitThrottleMs = 200 // Max 5Hz

    // Bind methods
    this.open = this.open.bind(this)
    this.close = this.close.bind(this)
    this._handleKeyDown = this._handleKeyDown.bind(this)
    this._handleOverlayClick = this._handleOverlayClick.bind(this)
    this._onAuditionHoldStart = this._onAuditionHoldStart.bind(this)
    this._onAuditionHoldEnd = this._onAuditionHoldEnd.bind(this)
  }

  /**
   * Check if audition is currently active
   * Used by main.js to control gesture interaction
   * @returns {boolean}
   */
  isAuditionActive () {
    return this.auditionActive
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
      if (currentParams && currentParams.presetSlot !== undefined && currentParams.presetSlot !== null) {
        this.currentPresetSlot = currentParams.presetSlot
        Object.assign(this.params, currentParams)
      } else {
        // Store the assigned slot - preset will be selected when panel opens
        // (AudioService nodes may not be ready yet during app init)
        const assignedSlot = socketService?.currentSlot
        this.currentPresetSlot = (assignedSlot !== undefined && assignedSlot !== null) ? assignedSlot : 0
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

      // Listen for audition events from backend
      this._setupAuditionSocketListeners()
    }
  }

  /**
   * Set up socket listeners for audition gesture events
   * Issue #5 fix: Also listen for reconnection to re-establish listeners
   * Note: Cursor events now use standard cursor:move (handled by main.js)
   */
  _setupAuditionSocketListeners () {
    if (!this.socketService?.socket) return

    const socket = this.socketService.socket

    // Remove previous listeners if any
    socket.off('hold:start', this._onAuditionHoldStart)
    socket.off('hold:end', this._onAuditionHoldEnd)

    // Add listeners for audition events (audio only - cursor handled by main.js)
    socket.on('hold:start', this._onAuditionHoldStart)
    socket.on('hold:end', this._onAuditionHoldEnd)

    // Issue #5 fix: Re-establish listeners on socket reconnection
    // Store handler reference for cleanup
    if (!this._reconnectHandler) {
      this._reconnectHandler = () => {
        this._setupAuditionSocketListeners()

        // If audition was active before disconnect, it's now stopped server-side
        // Reset local state to match
        if (this.auditionActive) {
          this.auditionActive = false
          const btn = this.panel?.querySelector('#synth-generate-btn')
          if (btn) btn.classList.remove('active')
          if (this.auditionSubMenu) this.auditionSubMenu.setGenerating(false)
        }
      }
    }
    socket.off('connect', this._reconnectHandler)
    socket.on('connect', this._reconnectHandler)
  }

  /**
   * Handle audition hold:start events
   */
  _onAuditionHoldStart (data) {
    // Only handle audition events
    if (!data.isAudition) return

    // Play the note locally using gestureSynth
    if (this.audioService?.playSimpleNote) {
      this.audioService.playSimpleNote(data.frequency, data.duration, data.velocity)
    }

    // Pulse the audition button for visual feedback
    this._pulseAuditionButton()
  }

  /**
   * Trigger pulse animation on audition button
   * @private
   */
  _pulseAuditionButton () {
    const btn = this.panel?.querySelector('#synth-generate-btn')
    if (!btn) return

    // Remove class to reset animation, then re-add
    btn.classList.remove('pulse')
    // Force reflow to restart animation
    void btn.offsetWidth
    btn.classList.add('pulse')
  }

  /**
   * Handle audition hold:end events
   */
  _onAuditionHoldEnd (data) {
    // Currently no action needed for hold:end
    // The note duration is handled in playSimpleNote
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

    // Ensure preset is selected in AudioService (audio nodes are ready now)
    if (this.audioService?.selectPreset && this.currentPresetSlot !== null) {
      // Only select if not already selected
      const currentSlot = this.audioService.getCurrentPresetSlot?.()
      if (currentSlot === null || currentSlot === undefined) {
        this.audioService.selectPreset(this.currentPresetSlot)
      }
    }

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

    // Stop audition if running
    this._stopAudition()

    // Destroy sub-menu
    if (this.auditionSubMenu) {
      this.auditionSubMenu.destroy()
      this.auditionSubMenu = null
    }

    // Clean up slider touch listeners to prevent memory leak
    this._cleanupSliderListeners()

    document.removeEventListener('keydown', this._handleKeyDown)

    // Entry #SynthUI: Clean up socket event listener to prevent memory leak
    if (this._slotsChangedHandler && this.socketService?.off) {
      this.socketService.off('synth:slots-changed', this._slotsChangedHandler)
    }

    // Issue #5 fix: Clean up reconnect handler
    if (this._reconnectHandler && this.socketService?.socket) {
      this.socketService.socket.off('connect', this._reconnectHandler)
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
    this.overlay.className = 'synth-overlay'
    // No overlay click handler - panel stays open while user interacts with canvas

    this.panel = document.createElement('div')
    this.panel.className = 'synth-panel'
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-modal', 'true')
    this.panel.setAttribute('aria-labelledby', 'synth-title')
    this.panel.style.setProperty('--synth-accent', this.userColor)
    this.panel.innerHTML = this._getPanelHTML()

    this.overlay.appendChild(this.panel)
    document.body.appendChild(this.overlay)

    // Create and attach audition sub-menu
    this._createAuditionSubMenu()

    // Attach listeners
    this._attachListeners()
    this._updateOscillatorSection()
  }

  /**
   * Create the audition sub-menu
   */
  _createAuditionSubMenu () {
    // Create sub-menu instance
    if (typeof AuditionSubMenu !== 'undefined') {
      this.auditionSubMenu = new AuditionSubMenu(this)

      // Set up callbacks
      this.auditionSubMenu.onParamsChange = (params) => {
        this._onAuditionParamsChange(params)
      }

      this.auditionSubMenu.onStartStop = (shouldStart) => {
        if (shouldStart) {
          this._startAudition()
        } else {
          this._stopAudition()
        }
      }

      // Create and attach to panel
      const subMenuElement = this.auditionSubMenu.create()

      // Position relative to audition button
      const auditionBtn = this.panel.querySelector('#synth-generate-btn')
      if (auditionBtn) {
        // Wrap button in a container for positioning
        const wrapper = document.createElement('div')
        wrapper.style.position = 'relative'
        wrapper.style.display = 'inline-block'
        auditionBtn.parentNode.insertBefore(wrapper, auditionBtn)
        wrapper.appendChild(auditionBtn)
        wrapper.appendChild(subMenuElement)
      }
    }
  }

  /**
   * Get panel HTML structure
   */
  _getPanelHTML () {
    const presetOptions = this._getPresetOptions()

    return `
      <div class="synth-header">
        <span class="settings-title" id="synth-title">Synth</span>
        <select id="synth-preset-select" class="synth-header-select">
          ${presetOptions}
        </select>
        <button id="synth-generate-btn" class="synth-generate-btn">Audition</button>
        <button class="settings-close" aria-label="Close">&times;</button>
      </div>
      <div class="synth-content">
        <!-- OSCILLATOR -->
        <div class="synth-group" id="synth-osc-group">
          <div class="settings-group-title">OSC</div>
          <div id="synth-osc-controls"></div>
        </div>

        <!-- FILTER -->
        <div class="synth-group synth-group-filter">
          <div class="settings-group-title">Filter</div>
          <div class="synth-filter-row">
            <div class="synth-filter-type">
              <button class="synth-filter-btn ${this.params.filterType === 'lowpass' ? 'active' : ''}" data-filter="lowpass">LP</button>
              <button class="synth-filter-btn ${this.params.filterType === 'highpass' ? 'active' : ''}" data-filter="highpass">HP</button>
              <button class="synth-filter-btn ${this.params.filterType === 'bandpass' ? 'active' : ''}" data-filter="bandpass">BP</button>
            </div>
            <div class="synth-sliders-row">
              ${this._getFilterCutoffSliderHTML()}
              ${this._getFilterQSliderHTML()}
            </div>
          </div>
        </div>

        <!-- ENVELOPE -->
        <div class="synth-group">
          <div class="settings-group-title">Envelope</div>
          <div class="synth-sliders-row">
            ${this._getSliderHTML('attack', 'A', 0.001, 4.0, this.params.attack, 's')}
            ${this._getSliderHTML('decay', 'D', 0.001, 8.0, this.params.decay, 's')}
            ${this._getSliderHTML('sustain', 'S', 0.0, 1.0, this.params.sustain, '')}
            ${this._getSliderHTML('release', 'R', 0.001, 10.0, this.params.release, 's')}
          </div>
        </div>

        <!-- OUTPUT -->
        <div class="synth-group">
          <div class="settings-group-title">OUT</div>
          <div class="synth-sliders-row">
            ${this._getSliderHTML('volume', 'Vol', -12, 12, this.params.volume, 'dB')}
            ${this._getSliderHTML('pan', 'Pan', -1.0, 1.0, this.params.pan, '')}
          </div>
        </div>

        <!-- EFFECTS -->
        <div class="synth-group">
          <div class="settings-group-title">FX</div>
          <div class="synth-sliders-row">
            ${this._getSliderHTML('delaySend', 'Delay', 0, 1.0, this.params.delaySend, '')}
            ${this._getSliderHTML('reverbSend', 'Reverb', 0, 1.0, this.params.reverbSend, '')}
          </div>
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
   * Get filter cutoff slider HTML with type-aware limits and logarithmic scaling
   * Uses normalized 0-100 range internally, displays actual frequency
   */
  _getFilterCutoffSliderHTML () {
    const limits = this._getCutoffLimits(this.params.filterType)
    const clampedFreq = Math.max(limits.min, Math.min(limits.max, this.params.filterCutoff))
    const sliderValue = this._frequencyToSlider(clampedFreq, limits.min, limits.max)
    const displayValue = this._formatValue(clampedFreq, 'Hz')

    return `
      <div class="synth-slider-row">
        <label>Cutoff</label>
        <input type="range"
               class="synth-slider"
               data-param="filterCutoff"
               data-log-min="${limits.min}"
               data-log-max="${limits.max}"
               min="0"
               max="100"
               step="0.5"
               value="${sliderValue}">
        <span class="synth-value" data-value="filterCutoff">${displayValue}</span>
      </div>
    `
  }

  /**
   * Get filter Q slider HTML with type-aware limits
   * BP uses lower Q max to maintain audible bandwidth
   */
  _getFilterQSliderHTML () {
    const qLimits = this._getQLimits(this.params.filterType)
    const value = Math.max(qLimits.min, Math.min(qLimits.max, this.params.filterQ))
    return this._getSliderHTML('filterQ', 'Resonance', qLimits.min, qLimits.max, value, '')
  }

  /**
   * Get Q limits based on filter type
   * BP needs lower max Q to maintain audible bandwidth
   */
  _getQLimits (filterType) {
    if (filterType === 'bandpass') {
      return { min: 0.1, max: 8.0 }  // BP: lower Q for wider bandwidth
    }
    return { min: 0.1, max: 20.0 }   // LP/HP: full range for self-oscillation
  }

  /**
   * Convert normalized slider value (0-100) to frequency using logarithmic scale
   * Human hearing perceives pitch logarithmically - an octave is always a doubling
   */
  _sliderToFrequency (sliderValue, minFreq, maxFreq) {
    const logMin = Math.log(minFreq)
    const logMax = Math.log(maxFreq)
    const normalizedValue = sliderValue / 100
    return Math.exp(logMin + normalizedValue * (logMax - logMin))
  }

  /**
   * Convert frequency to normalized slider value (0-100) using logarithmic scale
   */
  _frequencyToSlider (frequency, minFreq, maxFreq) {
    const logMin = Math.log(minFreq)
    const logMax = Math.log(maxFreq)
    const logFreq = Math.log(Math.max(minFreq, Math.min(maxFreq, frequency)))
    return ((logFreq - logMin) / (logMax - logMin)) * 100
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
    const group = this.panel?.querySelector('#synth-osc-group')
    if (!container || !group) return

    // Get current patch info
    const patch = window.PatchDefinitions?.REAL_USER_PATCHES?.[this.currentPresetSlot]
    const oscType = patch?.oscillator?.type || 'sawtooth'

    if (oscType === 'pulse') {
      group.style.display = ''
      container.innerHTML = this._getSliderHTML('pulseWidth', 'Width', 0.1, 0.9, this.params.pulseWidth, '')
    } else if (oscType?.startsWith('fat')) {
      group.style.display = ''
      container.innerHTML = this._getSliderHTML('fatSpread', 'Spread', 5, 50, this.params.fatSpread, '')
    } else if (oscType === 'fmsine') {
      group.style.display = ''
      container.innerHTML = this._getSliderHTML('modulationIndex', 'FM Index', 0.5, 12, this.params.modulationIndex, '')
    } else {
      // Hide entire OSC section when no params
      group.style.display = 'none'
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
    // Clean up previous listeners if re-attaching
    this._cleanupSliderListeners()

    // Initialize storage for handler references
    this._sliderListeners = []

    const sliders = this.panel?.querySelectorAll('.synth-slider')
    sliders?.forEach(slider => {
      slider.addEventListener('input', (e) => this._onSliderChange(e))

      // Touch handling for rotated sliders
      this._attachTouchHandler(slider)
    })
  }

  /**
   * Clean up slider touch listeners to prevent memory leaks
   */
  _cleanupSliderListeners () {
    if (this._sliderListeners) {
      this._sliderListeners.forEach(({ slider, handlers }) => {
        slider.removeEventListener('touchstart', handlers.touchStart)
        slider.removeEventListener('touchmove', handlers.touchMove)
        slider.removeEventListener('touchend', handlers.touchEnd)
        slider.removeEventListener('touchcancel', handlers.touchEnd)
      })
      this._sliderListeners = null
    }
  }

  /**
   * Check if we're in mobile layout mode using matchMedia for consistency with CSS
   */
  _isMobileLayout () {
    return window.matchMedia(SynthPanel.MOBILE_BREAKPOINT).matches
  }

  /**
   * Attach touch handler for sliders
   * Supports both horizontal (mobile) and vertical rotated (desktop) modes
   */
  _attachTouchHandler (slider) {
    let startPos = 0
    let startValue = 0
    const min = parseFloat(slider.min)
    const max = parseFloat(slider.max)
    const range = max - min

    const onTouchStart = (e) => {
      const touch = e.touches[0]
      // Use X for horizontal (mobile), Y for vertical (desktop)
      startPos = this._isMobileLayout() ? touch.clientX : touch.clientY
      startValue = parseFloat(slider.value)
      slider.classList.add('touch-active')
      e.preventDefault()
    }

    const onTouchMove = (e) => {
      const touch = e.touches[0]
      let delta

      if (this._isMobileLayout()) {
        // Horizontal: right = increase
        delta = touch.clientX - startPos
      } else {
        // Vertical (rotated): up = increase
        delta = startPos - touch.clientY
      }

      // Full drag distance for complete slider range
      const sensitivity = range / SynthPanel.TOUCH_DRAG_DISTANCE
      const newValue = Math.min(max, Math.max(min, startValue + delta * sensitivity))

      slider.value = newValue
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      e.preventDefault()
    }

    const onTouchEnd = () => {
      slider.classList.remove('touch-active')
    }

    // Store handler references for cleanup
    this._sliderListeners.push({
      slider,
      handlers: { touchStart: onTouchStart, touchMove: onTouchMove, touchEnd: onTouchEnd }
    })

    slider.addEventListener('touchstart', onTouchStart, { passive: false })
    slider.addEventListener('touchmove', onTouchMove, { passive: false })
    slider.addEventListener('touchend', onTouchEnd)
    slider.addEventListener('touchcancel', onTouchEnd)
  }

  /**
   * Handle preset change
   */
  async _onPresetChange (e) {
    const slot = parseInt(e.target.value, 10)

    // Request slot from server (if connected)
    if (this.socketService?.requestPresetSlot) {
      try {
        const response = await this.socketService.requestPresetSlot(slot)
        if (response && !response.granted) {
          // Revert selection
          e.target.value = this.currentPresetSlot ?? ''
          this._showToast(`Preset "${response.takenBy}" is in use`)
          return
        }
      } catch (err) {
        // Continue locally if server request fails
        console.warn('[SynthPanel] Preset request failed, applying locally:', err.message)
      }
    }

    // Ensure audio context is started
    if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
      await Tone.start()
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
   * Get safe cutoff range based on filter type
   * Prevents silencing oscillators with extreme cutoff values
   */
  _getCutoffLimits (filterType) {
    switch (filterType) {
      case 'lowpass':
        return { min: 80, max: 20000 }   // LP min 80Hz to preserve bass
      case 'highpass':
        return { min: 20, max: 12000 }   // HP max 12kHz to preserve signal
      case 'bandpass':
        return { min: 80, max: 12000 }   // BP safe middle range
      default:
        return { min: 20, max: 20000 }
    }
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

    // Clamp cutoff to safe range for new filter type
    const limits = this._getCutoffLimits(filterType)
    if (this.params.filterCutoff < limits.min) {
      this.params.filterCutoff = limits.min
    } else if (this.params.filterCutoff > limits.max) {
      this.params.filterCutoff = limits.max
    }

    // Update cutoff slider UI (logarithmic)
    const cutoffSlider = this.panel?.querySelector('[data-param="filterCutoff"]')
    if (cutoffSlider) {
      // Update data attributes for new frequency range
      cutoffSlider.dataset.logMin = limits.min
      cutoffSlider.dataset.logMax = limits.max
      // Convert frequency to slider position
      cutoffSlider.value = this._frequencyToSlider(this.params.filterCutoff, limits.min, limits.max)
    }
    const cutoffDisplay = this.panel?.querySelector('[data-value="filterCutoff"]')
    if (cutoffDisplay) {
      cutoffDisplay.textContent = this._formatValue(this.params.filterCutoff, 'Hz')
    }

    // Clamp Q to safe range for new filter type (BP has lower max)
    const qLimits = this._getQLimits(filterType)
    if (this.params.filterQ < qLimits.min) {
      this.params.filterQ = qLimits.min
    } else if (this.params.filterQ > qLimits.max) {
      this.params.filterQ = qLimits.max
    }

    // Update Q slider UI
    const qSlider = this.panel?.querySelector('[data-param="filterQ"]')
    if (qSlider) {
      qSlider.min = qLimits.min
      qSlider.max = qLimits.max
      qSlider.step = (qLimits.max - qLimits.min) / 100
      qSlider.value = this.params.filterQ
    }
    const qDisplay = this.panel?.querySelector('[data-value="filterQ"]')
    if (qDisplay) {
      qDisplay.textContent = this._formatValue(this.params.filterQ, '')
    }

    this._applyParams()
    this._emitParams()
  }

  /**
   * Handle slider change
   */
  _onSliderChange (e) {
    const param = e.target.dataset.param
    let value = parseFloat(e.target.value)

    // Handle logarithmic cutoff slider
    if (param === 'filterCutoff') {
      const logMin = parseFloat(e.target.dataset.logMin)
      const logMax = parseFloat(e.target.dataset.logMax)
      value = this._sliderToFrequency(value, logMin, logMax)
    }

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
        // Handle logarithmic cutoff slider
        if (param === 'filterCutoff') {
          const logMin = parseFloat(slider.dataset.logMin)
          const logMax = parseFloat(slider.dataset.logMax)
          slider.value = this._frequencyToSlider(value, logMin, logMax)
        } else {
          slider.value = value
        }
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
  // Audition Feature (Virtual Gesture Generation)
  // ==========================================

  /**
   * Toggle audition sub-menu visibility
   */
  _toggleGestureGeneration () {
    if (this.auditionSubMenu) {
      this.auditionSubMenu.toggle()
    }
  }

  /**
   * Start audition gesture generation on backend
   */
  async _startAudition () {
    // Ensure audio context is started (requires user interaction)
    if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
      await Tone.start()
    }

    // Ensure a preset is selected (creates the gestureSynth if needed)
    if (this.audioService?.selectPreset && this.currentPresetSlot !== null) {
      const currentSlot = this.audioService.getCurrentPresetSlot?.()
      if (currentSlot === null || currentSlot === undefined) {
        this.audioService.selectPreset(this.currentPresetSlot)
      }
    }

    // Send start command to backend
    if (this.socketService?.socket) {
      const params = this.auditionSubMenu?.getParams() || {}
      this.socketService.socket.emit('audition:start', params)
    }

    this.auditionActive = true

    // Update UI state
    const btn = this.panel?.querySelector('#synth-generate-btn')
    if (btn) {
      btn.classList.add('active')
    }

    if (this.auditionSubMenu) {
      this.auditionSubMenu.setGenerating(true)
    }
  }

  /**
   * Stop audition gesture generation
   */
  _stopAudition () {
    if (!this.auditionActive) return

    // Send stop command to backend
    if (this.socketService?.socket) {
      this.socketService.socket.emit('audition:stop')
    }

    this.auditionActive = false

    // Update UI state
    const btn = this.panel?.querySelector('#synth-generate-btn')
    if (btn) {
      btn.classList.remove('active')
    }

    if (this.auditionSubMenu) {
      this.auditionSubMenu.setGenerating(false)
    }
  }

  /**
   * Handle audition parameter changes from sub-menu
   */
  _onAuditionParamsChange (params) {
    // Send updated params to backend if audition is active
    if (this.auditionActive && this.socketService?.socket) {
      this.socketService.socket.emit('audition:config', params)
    }
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
