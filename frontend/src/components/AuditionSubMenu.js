/**
 * AuditionSubMenu
 *
 * Sub-menu UI component for the Audition feature in SynthPanel.
 * Provides controls for:
 * - Source: random vs metrics
 * - Frequency: event frequency (faster/slower)
 * - Regularity: timing distribution regularity
 * - Uniformity: event uniformity/difformity
 * - Gesture Type: tap vs drag mix
 * - Range: note range (minor 3rd to full octave)
 */

class AuditionSubMenu {
  static MOBILE_BREAKPOINT = '(max-width: 500px)'
  static SWIPE_DISMISS_THRESHOLD = 80 // pixels
  static DRAG_HANDLE_HEIGHT = 40 // pixels from top

  /**
   * @param {Object} synthPanel - Parent SynthPanel instance
   */
  constructor (synthPanel) {
    this.synthPanel = synthPanel
    this.element = null
    this.isVisible = false
    this.isGenerating = false

    // Default parameters
    this.params = {
      source: 'random', // 'random' | 'metrics'
      frequency: 0.5, // 0-1 (500ms-4000ms interval)
      regularity: 0.5, // 0-1 (jitter: 0=varied, 1=regular)
      uniformity: 0.5, // 0-1 (0=varied events, 1=similar events)
      gestureType: 0.5, // 0=all taps, 1=all drags
      range: 0.5 // 0=minor 3rd, 1=full octave
    }

    // Callback for parameter changes
    this.onParamsChange = null
    // Callback for start/stop
    this.onStartStop = null

    // Issue #1 fix: Store handler reference for cleanup
    this._clickOutsideHandler = null

    // Issue #6 fix: Throttle parameter updates
    this._throttleTimeout = null
    this._throttleDelayMs = 150 // Max ~6.7 updates/sec
  }

  /**
   * Create and return the sub-menu HTML element
   * @returns {HTMLElement}
   */
  create () {
    this.element = document.createElement('div')
    this.element.className = 'audition-submenu'
    this.element.innerHTML = this._getHTML()
    this._attachEventListeners()
    return this.element
  }

  /**
   * Show the sub-menu
   */
  show () {
    if (this.element) {
      this.isVisible = true
      this.element.classList.add('visible')
    }
  }

  /**
   * Hide the sub-menu
   */
  hide () {
    if (this.element) {
      this.isVisible = false
      this.element.classList.remove('visible')
    }
  }

  /**
   * Toggle visibility
   */
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
    const btn = this.element?.querySelector('.audition-start-btn')
    if (btn) {
      btn.textContent = isGenerating ? 'Stop' : 'Start'
      btn.classList.toggle('active', isGenerating)
    }
  }

  /**
   * Get current parameters
   * @returns {Object}
   */
  getParams () {
    return { ...this.params }
  }

  /**
   * Update parameters
   * @param {Object} params - Partial parameters to update
   */
  setParams (params) {
    this.params = { ...this.params, ...params }
    this._updateUI()
  }

  /**
   * Destroy the component
   * Issue #1 fix: Clean up document-level event listeners to prevent memory leaks
   */
  destroy () {
    // Remove document click listener to prevent memory leak
    if (this._clickOutsideHandler) {
      document.removeEventListener('click', this._clickOutsideHandler)
      this._clickOutsideHandler = null
    }

    // Clean up swipe handlers
    if (this._swipeHandlers && this.element) {
      this.element.removeEventListener('touchstart', this._swipeHandlers.touchStart)
      this.element.removeEventListener('touchmove', this._swipeHandlers.touchMove)
      this.element.removeEventListener('touchend', this._swipeHandlers.touchEnd)
      this.element.removeEventListener('touchcancel', this._swipeHandlers.touchEnd)
      this._swipeHandlers = null
    }

    // Clear any pending throttle timeout
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
  // PRIVATE: HTML Generation
  // ============================================================

  _getHTML () {
    return `
      <div class="audition-submenu-content">
        <!-- Source Toggle -->
        <div class="audition-row">
          <label>Source</label>
          <div class="audition-toggle">
            <button class="audition-toggle-btn active" data-value="random">Random</button>
            <button class="audition-toggle-btn" data-value="metrics">Metrics</button>
          </div>
        </div>

        <!-- Frequency Slider -->
        <div class="audition-row">
          <label>Frequency</label>
          <input type="range" class="audition-slider" data-param="frequency"
                 min="0" max="1" step="0.01" value="${this.params.frequency}">
          <span class="audition-value" data-value="frequency">${this._formatValue('frequency', this.params.frequency)}</span>
        </div>

        <!-- Regularity Slider -->
        <div class="audition-row">
          <label>Regularity</label>
          <input type="range" class="audition-slider" data-param="regularity"
                 min="0" max="1" step="0.01" value="${this.params.regularity}">
          <span class="audition-value" data-value="regularity">${this._formatValue('regularity', this.params.regularity)}</span>
        </div>

        <!-- Uniformity Slider -->
        <div class="audition-row">
          <label>Uniformity</label>
          <input type="range" class="audition-slider" data-param="uniformity"
                 min="0" max="1" step="0.01" value="${this.params.uniformity}">
          <span class="audition-value" data-value="uniformity">${this._formatValue('uniformity', this.params.uniformity)}</span>
        </div>

        <!-- Gesture Type Slider -->
        <div class="audition-row">
          <label>Gesture</label>
          <input type="range" class="audition-slider" data-param="gestureType"
                 min="0" max="1" step="0.01" value="${this.params.gestureType}">
          <span class="audition-value" data-value="gestureType">${this._formatValue('gestureType', this.params.gestureType)}</span>
        </div>

        <!-- Range Slider -->
        <div class="audition-row">
          <label>Range</label>
          <input type="range" class="audition-slider" data-param="range"
                 min="0" max="1" step="0.01" value="${this.params.range}">
          <span class="audition-value" data-value="range">${this._formatValue('range', this.params.range)}</span>
        </div>
      </div>
      <div class="audition-submenu-footer">
        <button class="audition-start-btn">Start</button>
      </div>
    `
  }

  // ============================================================
  // PRIVATE: Event Listeners
  // ============================================================

  _attachEventListeners () {
    if (!this.element) return

    // Source toggle buttons
    const toggleBtns = this.element.querySelectorAll('.audition-toggle-btn')
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        toggleBtns.forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        this.params.source = btn.dataset.value
        this._notifyParamsChange()
      })
    })

    // Sliders
    const sliders = this.element.querySelectorAll('.audition-slider')
    sliders.forEach(slider => {
      slider.addEventListener('input', (e) => {
        const param = slider.dataset.param
        const value = parseFloat(e.target.value)
        this.params[param] = value

        // Update value display
        const valueEl = this.element.querySelector(`.audition-value[data-value="${param}"]`)
        if (valueEl) {
          valueEl.textContent = this._formatValue(param, value)
        }

        this._notifyParamsChange()
      })
    })

    // Start/Stop button
    const startBtn = this.element.querySelector('.audition-start-btn')
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (this.onStartStop) {
          this.onStartStop(!this.isGenerating)
        }
      })
    }

    // Close on click outside
    // Issue #1 fix: Store handler reference for cleanup in destroy()
    this._clickOutsideHandler = (e) => {
      if (this.isVisible && this.element && !this.element.contains(e.target)) {
        // Check if click is on the audition button itself
        const auditionBtn = document.querySelector('#synth-generate-btn')
        if (auditionBtn && auditionBtn.contains(e.target)) {
          return // Don't close if clicking the audition button
        }
        // Don't close if clicking sequencer button or its submenu
        const seqBtn = document.querySelector('#synth-sequencer-btn')
        if (seqBtn && seqBtn.contains(e.target)) return
        const seqSubmenu = document.querySelector('.sequencer-submenu')
        if (seqSubmenu && seqSubmenu.contains(e.target)) return
        this.hide()
      }
    }
    document.addEventListener('click', this._clickOutsideHandler)

    // Mobile: swipe-to-dismiss for bottom sheet
    this._attachSwipeHandler()
  }

  /**
   * Attach swipe-to-dismiss handler for mobile bottom sheet
   */
  _attachSwipeHandler () {
    if (!this.element) return

    let startY = 0
    let currentY = 0
    let isDragging = false

    const onTouchStart = (e) => {
      // Only activate on mobile using matchMedia for CSS consistency
      if (!window.matchMedia(AuditionSubMenu.MOBILE_BREAKPOINT).matches) return

      // Don't swipe if touching an interactive element
      if (e.target.closest('.audition-slider, .audition-toggle-btn, .audition-start-btn')) {
        return
      }

      // Only start drag if touching the drag handle area
      const rect = this.element.getBoundingClientRect()
      const touchY = e.touches[0].clientY
      if (touchY - rect.top > AuditionSubMenu.DRAG_HANDLE_HEIGHT) return

      startY = e.touches[0].clientY
      currentY = startY
      isDragging = true
      this.element.style.transition = 'none'
    }

    const onTouchMove = (e) => {
      if (!isDragging) return

      currentY = e.touches[0].clientY
      const deltaY = currentY - startY

      // Only allow dragging down
      if (deltaY > 0) {
        this.element.style.transform = `translateY(${deltaY}px)`
        // Visual feedback: fade opacity as approaching dismiss threshold
        const dismissProgress = Math.min(deltaY / AuditionSubMenu.SWIPE_DISMISS_THRESHOLD, 1)
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

      // Dismiss if dragged more than threshold
      if (deltaY > AuditionSubMenu.SWIPE_DISMISS_THRESHOLD) {
        this.hide()
      }
    }

    // Store handler references for cleanup
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
  // PRIVATE: UI Updates
  // ============================================================

  _updateUI () {
    if (!this.element) return

    // Update source toggle
    const toggleBtns = this.element.querySelectorAll('.audition-toggle-btn')
    toggleBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === this.params.source)
    })

    // Update sliders and values
    const paramNames = ['frequency', 'regularity', 'uniformity', 'gestureType', 'range']
    paramNames.forEach(param => {
      const slider = this.element.querySelector(`.audition-slider[data-param="${param}"]`)
      if (slider) {
        slider.value = this.params[param]
      }
      const valueEl = this.element.querySelector(`.audition-value[data-value="${param}"]`)
      if (valueEl) {
        valueEl.textContent = this._formatValue(param, this.params[param])
      }
    })
  }

  /**
   * Format value for display
   * @param {string} param - Parameter name
   * @param {number} value - Value (0-1)
   * @returns {string} Formatted display string
   */
  _formatValue (param, value) {
    switch (param) {
      case 'frequency':
        // Show as events per second (faster at higher values)
        const eventsPerSec = (0.25 + value * 1.75).toFixed(1)
        return `${eventsPerSec}/s`
      case 'regularity':
        if (value < 0.33) return 'Varied'
        if (value < 0.67) return 'Mixed'
        return 'Regular'
      case 'uniformity':
        if (value < 0.33) return 'Diverse'
        if (value < 0.67) return 'Mixed'
        return 'Similar'
      case 'gestureType':
        if (value < 0.33) return 'Taps'
        if (value < 0.67) return 'Mixed'
        return 'Drags'
      case 'range':
        // Show as octaves (3 semitones to 60 semitones = 5 octaves)
        const semitones = Math.round(3 + value * 57)
        if (semitones >= 12) {
          const octaves = (semitones / 12).toFixed(1)
          return `${octaves} oct`
        }
        return `${semitones} st`
      default:
        return value.toFixed(2)
    }
  }

  /**
   * Notify params change with throttling
   * Issue #6 fix: Throttle to prevent 60 events/sec during slider drag
   * @private
   */
  _notifyParamsChange () {
    if (!this.onParamsChange) return

    // Clear any pending throttled call
    if (this._throttleTimeout) {
      clearTimeout(this._throttleTimeout)
    }

    // Throttle: schedule callback after delay
    this._throttleTimeout = setTimeout(() => {
      this._throttleTimeout = null
      if (this.onParamsChange) {
        this.onParamsChange(this.params)
      }
    }, this._throttleDelayMs)
  }
}

// Export for use in SynthPanel
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuditionSubMenu
}
