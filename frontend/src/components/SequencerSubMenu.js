/**
 * SequencerSubMenu
 *
 * Sub-menu UI component for the Sequencer feature in SynthPanel.
 * Provides a mini step sequencer with:
 * - Step count: 3-16 steps (select dropdown)
 * - Speed: 0.25x, 0.5x, 1x, 2x, 4x, 8x system BPM (select dropdown)
 * - Per-step vertical slider: scale degree + octave (28 positions: 7 degrees x 4 octaves)
 * - Per-step tri-state LED button: Normal / Mute / Random
 * - Active step LED highlight
 * - Start/Stop button
 *
 * Follows AuditionSubMenu patterns: throttled param changes, mobile bottom sheet,
 * click-outside dismiss, swipe-to-dismiss.
 */

class SequencerSubMenu {
  static MOBILE_BREAKPOINT = '(max-width: 500px)'
  static SWIPE_DISMISS_THRESHOLD = 80
  static DRAG_HANDLE_HEIGHT = 40
  static SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 8]
  static ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

  /**
   * @param {Object} synthPanel - Parent SynthPanel instance
   */
  constructor (synthPanel) {
    this.synthPanel = synthPanel
    this.element = null
    this.isVisible = false
    this.isGenerating = false

    // Drum mode flag (set by SynthPanel on preset change)
    this.isDrumMode = false

    // Default parameters
    this.params = {
      stepCount: 8,
      speedMultiplier: 1,
      steps: Array(16).fill(null).map(() => ({
        degree: 1,
        octave: 3,
        state: 'normal'
      }))
    }

    // Drum sequencer layers (4 instruments, 4-state velocity per step)
    // Default: basic 4/4 pattern — kick on 1/3, snare on 2/4, hat eighths, open hat off-beats
    this.drumLayers = {
      bd: { muted: false, steps: Array(16).fill(null).map((_, i) => ({ state: i % 4 === 0 ? 'normal' : 'off' })) },
      sn: { muted: false, steps: Array(16).fill(null).map((_, i) => ({ state: (i === 4 || i === 12) ? 'normal' : 'off' })) },
      hh: { muted: false, steps: Array(16).fill(null).map((_, i) => ({ state: i % 2 === 0 ? 'ghost' : 'off' })) },
      oh: { muted: false, steps: Array(16).fill(null).map((_, i) => ({ state: (i === 6 || i === 14) ? 'normal' : 'off' })) }
    }

    this.activeStep = -1
    this._lastScrollPosition = 0

    // Callbacks
    this.onParamsChange = null
    this.onStartStop = null

    // Cleanup refs
    this._clickOutsideHandler = null
    this._swipeHandlers = null
    this._throttleTimeout = null
    this._throttleDelayMs = 150
    this._stepListenersCleanup = null
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  /**
   * Create and return the sub-menu HTML element
   * @returns {HTMLElement}
   */
  create () {
    this.element = document.createElement('div')
    this.element.className = 'sequencer-submenu'
    this.element.innerHTML = this._getHTML()
    this._attachEventListeners()
    return this.element
  }

  show () {
    if (this.element) {
      this.isVisible = true
      this.element.classList.add('visible')
      // Restore scroll position
      const container = this.element.querySelector('.sequencer-steps-container')
      if (container) {
        container.scrollLeft = this._lastScrollPosition
      }
    }
  }

  hide () {
    if (this.element) {
      // Save scroll position
      const container = this.element.querySelector('.sequencer-steps-container')
      if (container) {
        this._lastScrollPosition = container.scrollLeft
      }
      this.isVisible = false
      this.element.classList.remove('visible')
    }
  }

  toggle () {
    if (this.isVisible) {
      this.hide()
    } else {
      this.show()
    }
  }

  /**
   * Set generating state (updates button text)
   * @param {boolean} isGenerating
   */
  setGenerating (isGenerating) {
    this.isGenerating = isGenerating
    const btn = this.element?.querySelector('.sequencer-start-btn')
    if (btn) {
      btn.textContent = isGenerating ? 'Stop' : 'Start'
      btn.classList.toggle('active', isGenerating)
    }
  }

  /**
   * Switch between melodic and drum mode
   * @param {boolean} isDrum
   */
  setDrumMode (isDrum) {
    this.isDrumMode = isDrum
    if (this.element) {
      this._rebuildSteps()
    }
    // If sequencer is running, notify backend of mode change
    if (this.isGenerating) {
      this._notifyParamsChange()
    }
  }

  /**
   * Set active step index for LED highlight
   * v0.7.9: Cache cell elements and toggle only changed steps to eliminate
   * querySelectorAll + 24 classList.toggle calls at 10/sec (240 DOM ops/sec → 4)
   * @param {number} index - Step index, or -1 to clear all
   */
  setActiveStep (index) {
    if (!this.element) return
    const prevStep = this.activeStep
    this.activeStep = index

    if (prevStep === index) return // No change

    if (this.isDrumMode) {
      // Build cache on first call or after grid rebuild
      if (!this._drumStepCache) this._buildDrumStepCache()

      // Remove LED from previous step cells
      if (prevStep >= 0 && this._drumStepCache[prevStep]) {
        for (const cell of this._drumStepCache[prevStep]) {
          cell.classList.remove('active-led')
        }
      }
      // Add LED to current step cells
      if (index >= 0 && this._drumStepCache[index]) {
        for (const cell of this._drumStepCache[index]) {
          cell.classList.add('active-led')
        }
      }
    } else {
      // Build cache on first call
      if (!this._tonalStepCache) {
        this._tonalStepCache = Array.from(this.element.querySelectorAll('.sequencer-step-btn'))
      }
      // Toggle only changed steps
      if (prevStep >= 0 && this._tonalStepCache[prevStep]) {
        this._tonalStepCache[prevStep].classList.remove('active-led')
      }
      if (index >= 0 && this._tonalStepCache[index]) {
        this._tonalStepCache[index].classList.add('active-led')
      }
    }
  }

  /**
   * Build cache of drum step cells indexed by step number
   * @private
   */
  _buildDrumStepCache () {
    this._drumStepCache = {}
    this.element.querySelectorAll('.drum-seq-cell').forEach(cell => {
      const stepIdx = parseInt(cell.dataset.step, 10)
      if (!this._drumStepCache[stepIdx]) this._drumStepCache[stepIdx] = []
      this._drumStepCache[stepIdx].push(cell)
    })
  }

  getParams () {
    if (this.isDrumMode) {
      return {
        stepCount: this.params.stepCount,
        speedMultiplier: this.params.speedMultiplier,
        isDrumMode: true,
        layers: JSON.parse(JSON.stringify(this.drumLayers))
      }
    }
    return {
      stepCount: this.params.stepCount,
      speedMultiplier: this.params.speedMultiplier,
      isDrumMode: false,
      steps: this.params.steps.map(s => ({ ...s }))
    }
  }

  setParams (params) {
    if (typeof params.stepCount === 'number') this.params.stepCount = params.stepCount
    if (typeof params.speedMultiplier === 'number') this.params.speedMultiplier = params.speedMultiplier
    if (Array.isArray(params.steps)) {
      this.params.steps = params.steps.map(s => ({ ...s }))
    }
    this._updateUI()
  }

  destroy () {
    if (this._stepListenersCleanup) {
      this._stepListenersCleanup()
      this._stepListenersCleanup = null
    }
    if (this._clickOutsideHandler) {
      document.removeEventListener('click', this._clickOutsideHandler)
      this._clickOutsideHandler = null
    }
    if (this._swipeHandlers && this.element) {
      this.element.removeEventListener('touchstart', this._swipeHandlers.touchStart)
      this.element.removeEventListener('touchmove', this._swipeHandlers.touchMove)
      this.element.removeEventListener('touchend', this._swipeHandlers.touchEnd)
      this.element.removeEventListener('touchcancel', this._swipeHandlers.touchEnd)
      this._swipeHandlers = null
    }
    if (this._throttleTimeout) {
      clearTimeout(this._throttleTimeout)
      this._throttleTimeout = null
    }
    if (this.element) {
      this.element.remove()
      this.element = null
    }
  }

  // ============================================================
  // PRIVATE: HELPERS
  // ============================================================

  /**
   * Convert slider value (0-27) to degree + octave
   * @param {number} value - Slider value 0-27
   * @returns {{degree: number, octave: number}}
   */
  _sliderValueToDegreeOctave (value) {
    const degree = (value % 7) + 1 // 0-6 → 1-7
    const octave = Math.floor(value / 7) + 2 // 0-3 → 2-5
    return { degree, octave }
  }

  /**
   * Convert degree + octave to slider value
   * @param {number} degree - 1-7
   * @param {number} octave - 2-5
   * @returns {number} Slider value 0-27
   */
  _degreeOctaveToSliderValue (degree, octave) {
    return (octave - 2) * 7 + (degree - 1)
  }

  /**
   * Format degree label (e.g. "III·4")
   * @param {number} degree - 1-7
   * @param {number} octave - 2-5
   * @returns {string}
   */
  _formatDegreeLabel (degree, octave) {
    return `${SequencerSubMenu.ROMAN[degree - 1]}\u00B7${octave}`
  }

  // ============================================================
  // PRIVATE: HTML GENERATION
  // ============================================================

  _getHTML () {
    const stepCountOptions = []
    for (let i = 3; i <= 16; i++) {
      const selected = i === this.params.stepCount ? 'selected' : ''
      stepCountOptions.push(`<option value="${i}" ${selected}>${i}</option>`)
    }

    const stepsHTML = this._getStepsHTML()

    return `
      <div class="sequencer-submenu-content">
        <div class="sequencer-header-row">
          <div class="sequencer-header-left">
            <label>Steps</label>
            <select class="sequencer-step-count-select">${stepCountOptions.join('')}</select>
          </div>
          <div class="sequencer-header-right">
            <label>Speed</label>
            <select class="sequencer-speed-select">${SequencerSubMenu.SPEED_OPTIONS.map(s => `<option value="${s}" ${s === this.params.speedMultiplier ? 'selected' : ''}>${s}x</option>`).join('')}</select>
          </div>
        </div>
        <div class="sequencer-steps-container">
          ${stepsHTML}
        </div>
      </div>
      <div class="sequencer-submenu-footer">
        <button class="sequencer-start-btn">Start</button>
      </div>
    `
  }

  _getStepsHTML () {
    if (this.isDrumMode) {
      return this._getDrumStepsHTML()
    }
    return this._getMelodicStepsHTML()
  }

  _getMelodicStepsHTML () {
    let html = ''
    for (let i = 0; i < this.params.stepCount; i++) {
      const step = this.params.steps[i]
      const sliderValue = this._degreeOctaveToSliderValue(step.degree, step.octave)
      const label = this._formatDegreeLabel(step.degree, step.octave)
      const stateClass = step.state === 'mute' ? 'muted' : step.state === 'random' ? 'random' : ''
      const activeLed = i === this.activeStep ? 'active-led' : ''

      const stateLabel = step.state === 'mute' ? 'M' : step.state === 'random' ? 'R' : 'N'

      html += `
        <div class="sequencer-step" data-step="${i}">
          <span class="sequencer-step-label">${label}</span>
          <div class="sequencer-slider-wrap">
            <input type="range" class="sequencer-step-slider" data-step="${i}"
                   min="0" max="27" step="1" value="${sliderValue}">
          </div>
          <button class="sequencer-step-btn ${stateClass} ${activeLed}" data-step="${i}">${stateLabel}</button>
        </div>
      `
    }
    return html
  }

  _getDrumStepsHTML () {
    const DRUM_LABELS = { bd: 'BD', sn: 'SN', hh: 'HH', oh: 'OH' }
    let html = '<div class="drum-seq-grid">'

    for (const inst of ['bd', 'sn', 'hh', 'oh']) {
      const layer = this.drumLayers[inst]
      const mutedClass = layer.muted ? 'muted' : ''

      html += `<div class="drum-seq-layer ${mutedClass}" data-layer="${inst}">`
      html += `<span class="drum-seq-label">${DRUM_LABELS[inst]}</span>`
      html += '<div class="drum-seq-steps">'

      for (let i = 0; i < this.params.stepCount; i++) {
        const step = layer.steps[i] || { state: 'off' }
        const activeLed = i === this.activeStep ? 'active-led' : ''
        html += `<div class="drum-seq-cell ${step.state} ${activeLed}" data-layer="${inst}" data-step="${i}"></div>`
      }

      html += '</div>'
      html += `<button class="drum-seq-mute ${layer.muted ? 'muted' : ''}" data-layer="${inst}">M</button>`
      html += '</div>'
    }

    html += '</div>'
    return html
  }

  // ============================================================
  // PRIVATE: EVENT LISTENERS
  // ============================================================

  _attachEventListeners () {
    if (!this.element) return

    // Step count select
    const stepCountSelect = this.element.querySelector('.sequencer-step-count-select')
    if (stepCountSelect) {
      stepCountSelect.addEventListener('change', (e) => {
        this.params.stepCount = parseInt(e.target.value, 10)
        this._rebuildSteps()
        this._notifyParamsChange()
      })
    }

    // Speed select
    const speedSelect = this.element.querySelector('.sequencer-speed-select')
    if (speedSelect) {
      speedSelect.addEventListener('change', (e) => {
        this.params.speedMultiplier = parseFloat(e.target.value)
        this._notifyParamsChange()
      })
    }

    // Step sliders and buttons (delegated)
    this._attachStepListeners()

    // Start/Stop button
    const startBtn = this.element.querySelector('.sequencer-start-btn')
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (this.onStartStop) {
          this.onStartStop(!this.isGenerating)
        }
      })
    }

    // Click outside dismiss
    this._clickOutsideHandler = (e) => {
      if (this.isVisible && this.element && !this.element.contains(e.target)) {
        // Don't close if clicking anywhere inside the synth panel
        if (e.target.closest('.synth-panel')) return
        this.hide()
      }
    }
    document.addEventListener('click', this._clickOutsideHandler)

    // Mobile swipe-to-dismiss
    this._attachSwipeHandler()
  }

  _attachStepListeners () {
    if (!this.element) return

    // Clean up previous delegated listeners before re-attaching
    if (this._stepListenersCleanup) {
      this._stepListenersCleanup()
      this._stepListenersCleanup = null
    }

    const container = this.element.querySelector('.sequencer-steps-container')
    if (!container) return

    if (this.isDrumMode) {
      this._attachDrumStepListeners(container)
    } else {
      this._attachMelodicStepListeners(container)
    }
  }

  _attachMelodicStepListeners (container) {
    // Slider input (delegated)
    const inputHandler = (e) => {
      if (!e.target.classList.contains('sequencer-step-slider')) return
      const stepIndex = parseInt(e.target.dataset.step, 10)
      const value = parseInt(e.target.value, 10)
      const { degree, octave } = this._sliderValueToDegreeOctave(value)

      this.params.steps[stepIndex].degree = degree
      this.params.steps[stepIndex].octave = octave

      // Update label
      const stepEl = e.target.closest('.sequencer-step')
      const label = stepEl?.querySelector('.sequencer-step-label')
      if (label) {
        label.textContent = this._formatDegreeLabel(degree, octave)
      }

      this._notifyParamsChange()
    }

    // Tri-state button click (delegated)
    const clickHandler = (e) => {
      const btn = e.target.closest('.sequencer-step-btn')
      if (!btn) return
      const stepIndex = parseInt(btn.dataset.step, 10)
      const step = this.params.steps[stepIndex]

      // Cycle: normal → mute → random → normal
      if (step.state === 'normal') {
        step.state = 'mute'
      } else if (step.state === 'mute') {
        step.state = 'random'
      } else {
        step.state = 'normal'
      }

      // Update button classes and label
      btn.classList.remove('muted', 'random')
      if (step.state === 'mute') btn.classList.add('muted')
      if (step.state === 'random') btn.classList.add('random')
      btn.textContent = step.state === 'mute' ? 'M' : step.state === 'random' ? 'R' : 'N'

      this._notifyParamsChange()
    }

    container.addEventListener('input', inputHandler)
    container.addEventListener('click', clickHandler)

    this._stepListenersCleanup = () => {
      container.removeEventListener('input', inputHandler)
      container.removeEventListener('click', clickHandler)
    }
  }

  static DRUM_STATES = ['off', 'ghost', 'normal', 'accent']

  _attachDrumStepListeners (container) {
    // Drum cell click: cycle 4 states (off → ghost → normal → accent → off)
    const clickHandler = (e) => {
      // Cell click
      const cell = e.target.closest('.drum-seq-cell')
      if (cell) {
        const layerName = cell.dataset.layer
        const stepIndex = parseInt(cell.dataset.step, 10)
        const layer = this.drumLayers[layerName]
        if (!layer) return

        const step = layer.steps[stepIndex]
        if (!step) return

        const currentIdx = SequencerSubMenu.DRUM_STATES.indexOf(step.state)
        step.state = SequencerSubMenu.DRUM_STATES[(currentIdx + 1) % 4]

        // Update cell classes
        cell.className = `drum-seq-cell ${step.state}`
        if (stepIndex === this.activeStep) cell.classList.add('active-led')

        this._notifyParamsChange()
        return
      }

      // Mute button click
      const muteBtn = e.target.closest('.drum-seq-mute')
      if (muteBtn) {
        const layerName = muteBtn.dataset.layer
        const layer = this.drumLayers[layerName]
        if (!layer) return

        layer.muted = !layer.muted
        muteBtn.classList.toggle('muted', layer.muted)

        // Dim the entire row
        const layerRow = muteBtn.closest('.drum-seq-layer')
        if (layerRow) layerRow.classList.toggle('muted', layer.muted)

        this._notifyParamsChange()
      }
    }

    container.addEventListener('click', clickHandler)

    this._stepListenersCleanup = () => {
      container.removeEventListener('click', clickHandler)
    }
  }

  _attachSwipeHandler () {
    if (!this.element) return

    let startY = 0
    let currentY = 0
    let isDragging = false

    const onTouchStart = (e) => {
      if (!window.matchMedia(SequencerSubMenu.MOBILE_BREAKPOINT).matches) return
      if (e.target.closest('.sequencer-step-slider, .sequencer-step-btn, .sequencer-start-btn, .sequencer-speed-select, .sequencer-step-count-select, .drum-seq-cell, .drum-seq-mute')) return

      const rect = this.element.getBoundingClientRect()
      const touchY = e.touches[0].clientY
      if (touchY - rect.top > SequencerSubMenu.DRAG_HANDLE_HEIGHT) return

      startY = e.touches[0].clientY
      currentY = startY
      isDragging = true
      this.element.style.transition = 'none'
    }

    const onTouchMove = (e) => {
      if (!isDragging) return
      currentY = e.touches[0].clientY
      const deltaY = currentY - startY
      if (deltaY > 0) {
        this.element.style.transform = `translateY(${deltaY}px)`
        const dismissProgress = Math.min(deltaY / SequencerSubMenu.SWIPE_DISMISS_THRESHOLD, 1)
        this.element.style.opacity = 1 - (dismissProgress * 0.3)
      }
    }

    const onTouchEnd = () => {
      if (!isDragging) return
      isDragging = false
      const deltaY = currentY - startY
      this.element.style.transition = ''
      this.element.style.transform = ''
      this.element.style.opacity = ''
      if (deltaY > SequencerSubMenu.SWIPE_DISMISS_THRESHOLD) {
        this.hide()
      }
    }

    this._swipeHandlers = {
      touchStart: onTouchStart,
      touchMove: onTouchMove,
      touchEnd: onTouchEnd
    }

    this.element.addEventListener('touchstart', onTouchStart, { passive: true })
    this.element.addEventListener('touchmove', onTouchMove, { passive: true })
    this.element.addEventListener('touchend', onTouchEnd, { passive: true })
    this.element.addEventListener('touchcancel', onTouchEnd, { passive: true })
  }

  // ============================================================
  // PRIVATE: UI UPDATES
  // ============================================================

  /**
   * Rebuild steps HTML when step count changes
   */
  _rebuildSteps () {
    const container = this.element?.querySelector('.sequencer-steps-container')
    if (!container) return
    container.innerHTML = this._getStepsHTML()
    this._attachStepListeners()
    // v0.7.9: Invalidate cached step elements after grid rebuild
    this._drumStepCache = null
    this._tonalStepCache = null
  }

  _updateUI () {
    if (!this.element) return

    // Update step count select
    const select = this.element.querySelector('.sequencer-step-count-select')
    if (select) select.value = this.params.stepCount

    // Update speed select
    const speedSelect = this.element.querySelector('.sequencer-speed-select')
    if (speedSelect) speedSelect.value = this.params.speedMultiplier

    // Rebuild steps area
    this._rebuildSteps()
  }

  /**
   * Notify params change with throttling (150ms)
   * @private
   */
  _notifyParamsChange () {
    if (!this.onParamsChange) return

    if (this._throttleTimeout) {
      clearTimeout(this._throttleTimeout)
    }

    this._throttleTimeout = setTimeout(() => {
      this._throttleTimeout = null
      if (this.onParamsChange) {
        this.onParamsChange(this.getParams())
      }
    }, this._throttleDelayMs)
  }
}

// Export for use in SynthPanel
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SequencerSubMenu
}
