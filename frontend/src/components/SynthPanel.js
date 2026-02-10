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
    this._auditionStarting = false

    // Sequencer sub-menu and state
    this.sequencerSubMenu = null
    this.sequencerActive = false
    this._sequencerStarting = false

    // External synth button reference (always in DOM, set by UIManager)
    this._externalBtn = null

    // Saved audition/sequencer params for persistence across close/reopen
    this._savedAuditionParams = null
    this._savedSequencerParams = null

    // Throttle params emission
    this.lastEmitTime = 0
    this.emitThrottleMs = 200 // Max 5Hz

    // Bind methods
    this.open = this.open.bind(this)
    this.close = this.close.bind(this)
    this._handleKeyDown = this._handleKeyDown.bind(this)
    this._handleOverlayClick = this._handleOverlayClick.bind(this)
    this._onAuditionHoldStart = this._onAuditionHoldStart.bind(this)
    this._onSequencerHoldStart = this._onSequencerHoldStart.bind(this)
    this._onAuditionForceStopped = () => { this._stopAudition(false) }
    this._onSequencerForceStopped = () => { this._stopSequencer(false) }
  }

  /**
   * Check if audition is currently active
   * Used by main.js to control gesture interaction
   * @returns {boolean}
   */
  isAuditionActive () {
    return this.auditionActive
  }

  /**
   * Check if sequencer is currently active
   * Used by main.js to control gesture interaction
   * @returns {boolean}
   */
  isSequencerActive () {
    return this.sequencerActive
  }

  /**
   * Stop all active playback (audition and sequencer)
   * Called by main.js when user presses Stop
   */
  stopAllPlayback () {
    if (this.auditionActive || this._auditionStarting) this._stopAudition()
    if (this.sequencerActive || this._sequencerStarting) this._stopSequencer()
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

      // Listen for sequencer events from backend
      this._setupSequencerSocketListeners()
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

    // Add listeners for audition events (audio only - cursor handled by main.js)
    // Note: hold:end not needed — notes are self-releasing via playSimpleNote (triggerAttackRelease)
    socket.on('hold:start', this._onAuditionHoldStart)

    // Listen for backend force-stop (mutual exclusion: sequencer started, so audition was killed)
    socket.off('audition:stopped', this._onAuditionForceStopped)
    socket.on('audition:stopped', this._onAuditionForceStopped)

    // Issue #5 fix: Re-establish listeners on socket reconnection
    // Store handler reference for cleanup
    if (!this._reconnectHandler) {
      this._reconnectHandler = () => {
        this._setupAuditionSocketListeners()
        // Backend already cleaned up on disconnect — reset local state (idempotent)
        this._stopAudition(false)
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

    // Only play through local gestureSynth for local user's own audition notes
    // Remote users' audition notes are routed through UserSynthManager in main.js
    const localUserId = this.socketService?.currentUserId || this.socketService?.socket?.id
    if (!localUserId) return // Socket not ready — skip audio playback
    if (data.userId === localUserId) {
      if (data.isDrum && data.drumInstrument && this.audioService?.playDrumHit) {
        this.audioService.playDrumHit(data.drumInstrument, data.velocity)
      } else if (this.audioService?.playSimpleNote) {
        this.audioService.playSimpleNote(data.frequency, data.duration, data.velocity)
      }
    }

    // Pulse the audition button for visual feedback
    this._pulseButton('#synth-generate-btn')
    this._pulseExternalButton()
  }

  /**
   * Set up socket listeners for sequencer events
   */
  _setupSequencerSocketListeners () {
    if (!this.socketService?.socket) return
    const socket = this.socketService.socket

    // Sequencer step LED indicator
    if (this._onSequencerStep) {
      socket.off('sequencer:step', this._onSequencerStep)
    }
    this._onSequencerStep = (data) => {
      const localUserId = this.socketService?.currentUserId
      if (data.userId === localUserId && this.sequencerSubMenu) {
        this.sequencerSubMenu.setActiveStep(data.stepIndex)
      }
    }
    socket.on('sequencer:step', this._onSequencerStep)

    // Sequencer note playback (via hold:start)
    socket.off('hold:start', this._onSequencerHoldStart)
    socket.on('hold:start', this._onSequencerHoldStart)

    // Listen for backend force-stop (mutual exclusion: audition started, so sequencer was killed)
    socket.off('sequencer:stopped', this._onSequencerForceStopped)
    socket.on('sequencer:stopped', this._onSequencerForceStopped)

    // Reconnection handling: reset sequencer state
    if (!this._sequencerReconnectHandler) {
      this._sequencerReconnectHandler = () => {
        this._setupSequencerSocketListeners()
        // Backend already cleaned up on disconnect — reset local state (idempotent)
        this._stopSequencer(false)
      }
    }
    socket.off('connect', this._sequencerReconnectHandler)
    socket.on('connect', this._sequencerReconnectHandler)
  }

  /**
   * Handle sequencer hold:start events
   */
  _onSequencerHoldStart (data) {
    if (!data.isSequencer) return

    // Only play through local gestureSynth for local user's own sequencer notes
    // Remote users' sequencer notes are routed through UserSynthManager in main.js
    const localUserId = this.socketService?.currentUserId || this.socketService?.socket?.id
    if (!localUserId) return // Socket not ready — skip audio playback
    if (data.userId === localUserId) {
      if (data.isDrum && data.drumInstrument && this.audioService?.playDrumHit) {
        this.audioService.playDrumHit(data.drumInstrument, data.velocity)
      } else if (this.audioService?.playSimpleNote) {
        this.audioService.playSimpleNote(data.frequency, data.duration, data.velocity)
      }
    }

    this._pulseButton('#synth-sequencer-btn')
    this._pulseExternalButton()
  }

  /**
   * Trigger pulse animation on a button
   * @param {string} selector - CSS selector for the button
   * @private
   */
  _pulseButton (selector) {
    const btn = this.panel?.querySelector(selector)
    if (!btn) return
    btn.classList.remove('pulse')
    void btn.offsetWidth // Force reflow to restart animation
    btn.classList.add('pulse')
  }

  /**
   * Set reference to the external synth button for pulse/color effects
   * @param {HTMLElement} btn - The #desktopSynthBtn element
   */
  setExternalButton (btn) {
    this._externalBtn = btn
    this._updateExternalButtonState()
  }

  /**
   * Update external synth button active state (color + class)
   * @private
   */
  _updateExternalButtonState () {
    const btn = this._externalBtn
    if (!btn) return
    if (this.auditionActive || this.sequencerActive) {
      btn.classList.add('synth-active')
      btn.style.setProperty('--synth-btn-color', this.userColor)
    } else {
      btn.classList.remove('synth-active')
      btn.style.removeProperty('--synth-btn-color')
    }
  }

  /**
   * Trigger parallax depth-pulse on the external synth button
   * @private
   */
  _pulseExternalButton () {
    const btn = this._externalBtn
    if (!btn) return
    btn.classList.remove('synth-parallax-pulse')
    void btn.offsetWidth
    btn.classList.add('synth-parallax-pulse')
  }

  /**
   * Set user color for UI theming
   */
  setUserColor (color) {
    this.userColor = color
    if (this.panel) {
      this.panel.style.setProperty('--synth-accent', color)
    }
    this._updateExternalButtonState()
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

    // Restore active button states if audition/sequencer are still running
    if (this.auditionActive) {
      const btn = this.panel?.querySelector('#synth-generate-btn')
      if (btn) btn.classList.add('active')
    }
    if (this.sequencerActive) {
      const btn = this.panel?.querySelector('#synth-sequencer-btn')
      if (btn) btn.classList.add('active')
    }

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

    // Save submenu params before destroying (persist across close/reopen)
    if (this.auditionSubMenu) {
      this._savedAuditionParams = this.auditionSubMenu.getParams()
    }
    if (this.sequencerSubMenu) {
      this._savedSequencerParams = this.sequencerSubMenu.getParams()
    }

    // Destroy sub-menus (UI only — do NOT stop backend generation)
    if (this.auditionSubMenu) {
      this.auditionSubMenu.destroy()
      this.auditionSubMenu = null
    }
    if (this.sequencerSubMenu) {
      this.sequencerSubMenu.destroy()
      this.sequencerSubMenu = null
    }

    // Clean up slider touch listeners to prevent memory leak
    this._cleanupSliderListeners()

    document.removeEventListener('keydown', this._handleKeyDown)

    // Socket listeners (hold:start, connect, sequencer:step, synth:slots-changed)
    // are NOT cleaned up here — they persist safely:
    // - Registered once in setServices() with stable bound references
    // - All handlers are null-safe when panel/submenus don't exist
    // - They read this.panel/this.sequencerSubMenu dynamically,
    //   so they pick up new instances when panel reopens

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

    // Create and attach sequencer sub-menu
    this._createSequencerSubMenu()

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

      // Restore saved params and active state from previous session
      if (this._savedAuditionParams) {
        this.auditionSubMenu.setParams(this._savedAuditionParams)
      }
      if (this.auditionActive) {
        this.auditionSubMenu.setGenerating(true)
      }

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
   * Create the sequencer sub-menu
   */
  _createSequencerSubMenu () {
    if (typeof SequencerSubMenu !== 'undefined') {
      this.sequencerSubMenu = new SequencerSubMenu(this)

      this.sequencerSubMenu.onParamsChange = (params) => {
        this._onSequencerParamsChange(params)
      }

      this.sequencerSubMenu.onStartStop = (shouldStart) => {
        if (shouldStart) {
          this._startSequencer()
        } else {
          this._stopSequencer()
        }
      }

      const subMenuElement = this.sequencerSubMenu.create()

      // Restore saved params and active state from previous session
      if (this._savedSequencerParams) {
        this.sequencerSubMenu.setParams(this._savedSequencerParams)
      }
      if (this.sequencerActive) {
        this.sequencerSubMenu.setGenerating(true)
      }

      const sequencerBtn = this.panel.querySelector('#synth-sequencer-btn')
      if (sequencerBtn) {
        const wrapper = document.createElement('div')
        wrapper.style.position = 'relative'
        wrapper.style.display = 'inline-block'
        sequencerBtn.parentNode.insertBefore(wrapper, sequencerBtn)
        wrapper.appendChild(sequencerBtn)
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
        <button id="synth-sequencer-btn" class="synth-generate-btn">Sequencer</button>
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
      { slot: 7, name: 'Deep Bell' },
      { slot: 8, name: '808 Kit' },
      { slot: 9, name: 'Acoustic Kit' },
      { slot: 10, name: 'Electronic Kit' }
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
   * Get drum slider HTML (uses data-drum-instrument + data-drum-param attributes)
   */
  _getDrumSliderHTML (instrument, param, label, value) {
    return `
      <div class="synth-slider-row">
        <label>${label}</label>
        <input type="range"
               class="synth-slider"
               data-drum-instrument="${instrument}"
               data-drum-param="${param}"
               min="0"
               max="1"
               step="0.01"
               value="${value}">
        <span class="synth-value" data-drum-value="${instrument}-${param}">${value.toFixed(2)}</span>
      </div>
    `
  }

  /**
   * Load drum instrument defaults into this.params
   */
  _loadDrumParams (patch) {
    if (!patch?.instruments) return
    const inst = patch.instruments

    // Save current synth params so they can be restored when switching back
    if (!this.params.isDrum) {
      this._savedSynthParams = { ...this.params }
    }

    this.params = {
      isDrum: true,
      bd: { pitch: inst.bd.pitch, decay: inst.bd.decay, tone: inst.bd.tone },
      sn: { pitch: inst.sn.pitch, decay: inst.sn.decay, tone: inst.sn.tone, delay: inst.sn.delay || 0 },
      hh: { pitch: inst.hh.pitch, decay: inst.hh.decay, tone: inst.hh.tone, delay: inst.hh.delay || 0 },
      reverb: patch.reverb || 0,
      volume: 0.5
    }
  }

  /**
   * Render drum content into synth-content div
   */
  _renderDrumContent () {
    const content = this.panel?.querySelector('.synth-content')
    if (!content) return

    const bd = this.params.bd || { pitch: 0.5, decay: 0.5, tone: 0.5 }
    const sn = this.params.sn || { pitch: 0.5, decay: 0.5, tone: 0.5, delay: 0.15 }
    const hh = this.params.hh || { pitch: 0.5, decay: 0.5, tone: 0.5, delay: 0 }

    content.innerHTML = `
      <!-- BASS DRUM -->
      <div class="synth-group">
        <div class="settings-group-title">BASS DRUM</div>
        <div class="synth-sliders-row">
          ${this._getDrumSliderHTML('bd', 'pitch', 'Pitch', bd.pitch)}
          ${this._getDrumSliderHTML('bd', 'decay', 'Decay', bd.decay)}
          ${this._getDrumSliderHTML('bd', 'tone', 'Tone', bd.tone)}
        </div>
      </div>
      <!-- SNARE -->
      <div class="synth-group">
        <div class="settings-group-title">SNARE</div>
        <div class="synth-sliders-row">
          ${this._getDrumSliderHTML('sn', 'pitch', 'Pitch', sn.pitch)}
          ${this._getDrumSliderHTML('sn', 'decay', 'Decay', sn.decay)}
          ${this._getDrumSliderHTML('sn', 'tone', 'Tone', sn.tone)}
          ${this._getDrumSliderHTML('sn', 'delay', 'Delay', sn.delay)}
        </div>
      </div>
      <!-- HI-HAT -->
      <div class="synth-group">
        <div class="settings-group-title">HI-HAT</div>
        <div class="synth-sliders-row">
          ${this._getDrumSliderHTML('hh', 'pitch', 'Pitch', hh.pitch)}
          ${this._getDrumSliderHTML('hh', 'decay', 'Decay', hh.decay)}
          ${this._getDrumSliderHTML('hh', 'tone', 'Tone', hh.tone)}
          ${this._getDrumSliderHTML('hh', 'delay', 'Delay', hh.delay)}
        </div>
      </div>
      <!-- VOLUME -->
      <div class="synth-group">
        <div class="settings-group-title">VOLUME</div>
        <div class="synth-sliders-row">
          ${this._getDrumSliderHTML('global', 'volume', 'Volume', this.params.volume ?? 0.5)}
        </div>
      </div>
      <!-- REVERB -->
      <div class="synth-group">
        <div class="settings-group-title">REVERB</div>
        <div class="synth-sliders-row">
          ${this._getDrumSliderHTML('global', 'reverb', 'Reverb', this.params.reverb || 0)}
        </div>
      </div>
    `
  }

  /**
   * Get synth content inner HTML (for restoring after drum mode)
   */
  _getSynthContentHTML () {
    return `
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
          ${this._getSliderHTML('pan', 'Pan', -1.0, 1.0, this.params.pan || 0, '')}
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
    `
  }

  /**
   * Restore synth content (when switching from drum back to synth mode)
   */
  _renderSynthContent () {
    const content = this.panel?.querySelector('.synth-content')
    if (!content) return

    // Restore params BEFORE generating HTML (HTML reads this.params for slider values)
    const patch = window.PatchDefinitions?.REAL_USER_PATCHES?.[this.currentPresetSlot]
    if (patch) {
      this.params = {
        filterType: patch.filter?.type || 'lowpass',
        filterCutoff: patch.filter?.frequency || 2000,
        filterQ: patch.filter?.Q || 1.0,
        attack: patch.envelope?.attack || 0.05,
        decay: patch.envelope?.decay || 0.3,
        sustain: patch.envelope?.sustain || 0.5,
        release: patch.envelope?.release || 0.5,
        volume: patch.volume ?? 0,
        pan: 0,
        delaySend: patch.effects?.delaySend || 0.2,
        reverbSend: patch.effects?.reverbSend || 0.3,
        pulseWidth: patch.oscillator?.width || 0.3,
        fatSpread: patch.oscillator?.spread || 25,
        modulationIndex: patch.oscillator?.modulationIndex || 4
      }
    }

    // Re-render the full synth content from _getSynthContentHTML
    content.innerHTML = this._getSynthContentHTML()

    // Re-bind slider events and update values
    this._updateSliderValues()
    this._updateOscillatorSection()
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
    if (value == null || typeof value !== 'number') return '—'
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
    // Adaptive panel focus — click on a panel area to give it focus
    this.panel.addEventListener('click', (e) => {
      const target = e.target
      if (target.closest('.audition-submenu')) {
        this.panel.classList.add('gesture-audition')
        this.panel.classList.remove('gesture-sequencer')
      } else if (target.closest('.sequencer-submenu')) {
        this.panel.classList.add('gesture-sequencer')
        this.panel.classList.remove('gesture-audition')
      } else {
        this.panel.classList.remove('gesture-audition', 'gesture-sequencer')
      }
    })

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

    // Sequencer button
    const sequencerBtn = this.panel.querySelector('#synth-sequencer-btn')
    if (sequencerBtn) {
      sequencerBtn.addEventListener('click', () => this._toggleSequencer())
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

    // Check if switching to/from drum mode
    const patch = window.PatchDefinitions?.REAL_USER_PATCHES?.[slot]
    const wasDrumMode = this._isDrumMode
    this._isDrumMode = patch?.type === 'drum'

    // Update title
    const title = this.panel?.querySelector('#synth-title')
    if (title) title.textContent = this._isDrumMode ? 'Drums' : 'Synth'

    if (this._isDrumMode) {
      // Load drum instrument defaults into params
      this._loadDrumParams(patch)
      // Replace synth content with drum UI
      this._renderDrumContent()
      // Re-attach slider listeners to new drum slider elements
      this._attachSliderListeners()
    } else {
      // Restore synth UI if switching from drums
      if (wasDrumMode) {
        this._renderSynthContent()
        // Re-attach slider listeners to restored synth slider elements
        this._attachSliderListeners()

        // Restore saved synth params if available
        if (this._savedSynthParams) {
          this.params = { ...this._savedSynthParams }
          this._savedSynthParams = null
        }
      }

      // Update oscillator controls for new preset type
      this._updateOscillatorSection()

      // Update params from new preset defaults (only if not restoring saved params)
      if (patch && !wasDrumMode) {
        this.params.filterType = patch.filter?.type || 'lowpass'
        this.params.filterCutoff = patch.filter?.frequency || 2000
        this.params.filterQ = patch.filter?.Q || 1.0
        this.params.attack = patch.envelope?.attack || 0.05
        this.params.decay = patch.envelope?.decay || 0.3
        this.params.sustain = patch.envelope?.sustain || 0.5
        this.params.release = patch.envelope?.release || 0.5
        this.params.volume = patch.volume ?? 0
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
    }

    // Apply params to local audio engine
    this._applyParams()

    // Switch submenu mode if changed
    if (wasDrumMode !== this._isDrumMode) {
      if (this.auditionSubMenu) this.auditionSubMenu.setDrumMode(this._isDrumMode)
      if (this.sequencerSubMenu) this.sequencerSubMenu.setDrumMode(this._isDrumMode)
    }

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
    // Handle drum instrument sliders
    const drumInst = e.target.dataset.drumInstrument
    const drumParam = e.target.dataset.drumParam
    if (drumInst && drumParam) {
      const value = parseFloat(e.target.value)
      if (drumInst === 'global') {
        if (drumParam === 'reverb') this.params.reverb = value
        else if (drumParam === 'volume') this.params.volume = value
      } else {
        if (!this.params[drumInst]) this.params[drumInst] = {}
        this.params[drumInst][drumParam] = value
      }
      // Update display
      const display = this.panel?.querySelector(`[data-drum-value="${drumInst}-${drumParam}"]`)
      if (display) display.textContent = value.toFixed(2)
      // Apply drum params + emit
      if (this.audioService?.setDrumParams) this.audioService.setDrumParams(this.params)
      this._emitParamsThrottled()
      return
    }

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
    if (this._isDrumMode) {
      if (this.audioService?.setDrumParams) {
        this.audioService.setDrumParams(this.params)
      }
    } else {
      if (this.audioService?.setSynthParams) {
        this.audioService.setSynthParams(this.params)
      }
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
    // Play gate: only allow audition when main audio is started
    if (!this.socketService?.isPlaying) return

    // Concurrency lock: prevent double-click during await Tone.start()
    if (this._auditionStarting) return
    this._auditionStarting = true

    try {
      // Mutual exclusion: stop sequencer if active
      if (this.sequencerActive) {
        this._stopSequencer()
      }

      // Ensure audio context is started (requires user interaction)
      if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
        await Tone.start()
      }

      // Re-check play gate after await (user may have pressed Stop during Tone.start())
      if (!this.socketService?.isPlaying) return

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
      this._updateExternalButtonState()

      // Update UI state
      const btn = this.panel?.querySelector('#synth-generate-btn')
      if (btn) {
        btn.classList.add('active')
      }

      if (this.auditionSubMenu) {
        this.auditionSubMenu.setGenerating(true)
      }
    } finally {
      this._auditionStarting = false
    }
  }

  /**
   * Stop audition gesture generation
   */
  _stopAudition (emitToBackend = true) {
    if (emitToBackend && this.socketService?.socket) {
      this.socketService.socket.emit('audition:stop')
    }

    this.auditionActive = false
    this._auditionStarting = false
    this._updateExternalButtonState()

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
  // Sequencer Feature (Step Sequencer)
  // ==========================================

  /**
   * Toggle sequencer sub-menu visibility
   */
  _toggleSequencer () {
    if (this.sequencerSubMenu) {
      this.sequencerSubMenu.toggle()
    }
  }

  /**
   * Start sequencer on backend
   */
  async _startSequencer () {
    // Play gate: only allow sequencer when main audio is started
    if (!this.socketService?.isPlaying) return

    // Concurrency lock: prevent double-click during await Tone.start()
    if (this._sequencerStarting) return
    this._sequencerStarting = true

    try {
      // Mutual exclusion: stop audition if active
      if (this.auditionActive) {
        this._stopAudition()
      }

      // Ensure audio context is started
      if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
        await Tone.start()
      }

      // Re-check play gate after await (user may have pressed Stop during Tone.start())
      if (!this.socketService?.isPlaying) return

      // Ensure a preset is selected
      if (this.audioService?.selectPreset && this.currentPresetSlot !== null) {
        const currentSlot = this.audioService.getCurrentPresetSlot?.()
        if (currentSlot === null || currentSlot === undefined) {
          this.audioService.selectPreset(this.currentPresetSlot)
        }
      }

      if (this.socketService?.socket) {
        const params = this.sequencerSubMenu?.getParams() || {}
        this.socketService.socket.emit('sequencer:start', params)
      }

      this.sequencerActive = true
      this._updateExternalButtonState()

      const btn = this.panel?.querySelector('#synth-sequencer-btn')
      if (btn) btn.classList.add('active')

      if (this.sequencerSubMenu) {
        this.sequencerSubMenu.setGenerating(true)
      }
    } finally {
      this._sequencerStarting = false
    }
  }

  /**
   * Stop sequencer
   */
  _stopSequencer (emitToBackend = true) {
    if (emitToBackend && this.socketService?.socket) {
      this.socketService.socket.emit('sequencer:stop')
    }

    this.sequencerActive = false
    this._sequencerStarting = false
    this._updateExternalButtonState()

    const btn = this.panel?.querySelector('#synth-sequencer-btn')
    if (btn) btn.classList.remove('active')

    if (this.sequencerSubMenu) {
      this.sequencerSubMenu.setGenerating(false)
      this.sequencerSubMenu.setActiveStep(-1)
    }
  }

  /**
   * Handle sequencer parameter changes from sub-menu
   */
  _onSequencerParamsChange (params) {
    if (this.sequencerActive && this.socketService?.socket) {
      this.socketService.socket.emit('sequencer:config', params)
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
