/**
 * SettingsPanel.js - Entry #74: User Settings Modal
 *
 * Modal panel for configuring audio and graphics quality settings.
 * Accessible from both landing page and normal rooms.
 */

class SettingsPanel {
  // Fix #7: Animation timing constants
  static ANIMATION_DURATION = 300 // ms - panel fade in/out
  static TOAST_DISPLAY_DURATION = 2000 // ms - how long toast is visible
  static TOAST_WARNING_DURATION = 4000 // ms - warnings display longer
  static TOAST_DELAY_AFTER_CLOSE = 350 // ms - wait for panel close animation

  constructor () {
    this.isOpen = false
    this.overlay = null
    this.panel = null
    this.stressUpdateInterval = null

    // Fix #1: Notification tracking for cleanup
    this.activeNotification = null
    this.notificationTimeout = null
    this.notificationRemovalTimeout = null

    // Track original sample rate to detect changes requiring reload
    this._originalSampleRate = null

    // Focus trap: store previously focused element and cached focusable elements
    this._previouslyFocusedElement = null
    this._focusableElements = null

    // Bind methods
    this.open = this.open.bind(this)
    this.close = this.close.bind(this)
    this._handleKeyDown = this._handleKeyDown.bind(this)
    this._handleOverlayClick = this._handleOverlayClick.bind(this)
  }

  /**
   * Open the settings panel
   */
  open () {
    if (this.isOpen) return
    this.isOpen = true

    // Focus trap: save currently focused element
    this._previouslyFocusedElement = document.activeElement

    this._createPanel()
    this._startStressUpdates()

    // Add event listeners
    document.addEventListener('keydown', this._handleKeyDown)

    // Animate in and focus first element
    requestAnimationFrame(() => {
      this.overlay.classList.add('settings-visible')
      // Focus the close button (first focusable element)
      const closeBtn = this.panel.querySelector('.settings-close')
      if (closeBtn) {
        closeBtn.focus()
      }
    })
  }

  /**
   * Close the settings panel
   */
  close () {
    if (!this.isOpen) return
    this.isOpen = false

    this._stopStressUpdates()

    // Remove event listeners
    document.removeEventListener('keydown', this._handleKeyDown)

    // Focus trap: restore focus to previously focused element
    if (this._previouslyFocusedElement && typeof this._previouslyFocusedElement.focus === 'function') {
      this._previouslyFocusedElement.focus()
    }
    this._previouslyFocusedElement = null
    this._focusableElements = null

    // Fix #1: Clear notification timers on close
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout)
      this.notificationTimeout = null
    }
    if (this.notificationRemovalTimeout) {
      clearTimeout(this.notificationRemovalTimeout)
      this.notificationRemovalTimeout = null
    }

    // Animate out
    this.overlay.classList.remove('settings-visible')

    // Remove after animation (Fix #7: use constant)
    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay)
      }
      this.overlay = null
      this.panel = null
    }, SettingsPanel.ANIMATION_DURATION)
  }

  /**
   * Create the panel DOM structure
   */
  _createPanel () {
    // Create overlay
    this.overlay = document.createElement('div')
    this.overlay.className = 'settings-overlay'
    this.overlay.addEventListener('click', this._handleOverlayClick)

    // Create panel with ARIA attributes for accessibility
    this.panel = document.createElement('div')
    this.panel.className = 'settings-panel'
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-modal', 'true')
    this.panel.setAttribute('aria-labelledby', 'settings-title')
    this.panel.innerHTML = this._getPanelHTML()

    this.overlay.appendChild(this.panel)
    document.body.appendChild(this.overlay)

    // Add close button listener
    const closeBtn = this.panel.querySelector('.settings-close')
    if (closeBtn) {
      closeBtn.addEventListener('click', this.close)
    }

    // Add radio change listeners
    this._attachRadioListeners()

    // Add button listeners
    const applyBtn = this.panel.querySelector('.settings-apply')
    const resetBtn = this.panel.querySelector('.settings-reset')

    if (applyBtn) {
      applyBtn.addEventListener('click', () => this._applySettings())
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this._resetSettings())
    }

    // Add Low Power toggle listener with ARIA support
    const lowPowerToggle = this.panel.querySelector('#settings-lowPower')
    if (lowPowerToggle) {
      // Add accessibility attributes
      lowPowerToggle.setAttribute('role', 'switch')
      lowPowerToggle.setAttribute('aria-checked', lowPowerToggle.checked ? 'true' : 'false')

      if (typeof MobileResourceManager !== 'undefined') {
        lowPowerToggle.addEventListener('change', () => {
          // Update ARIA state
          lowPowerToggle.setAttribute('aria-checked', lowPowerToggle.checked ? 'true' : 'false')
          const manager = MobileResourceManager.getInstance()
          if (lowPowerToggle.checked !== manager.isLowPowerMode()) {
            manager.toggleLowPowerMode()
          }
        })
      } else {
        // Still update ARIA state even without MobileResourceManager
        lowPowerToggle.addEventListener('change', () => {
          lowPowerToggle.setAttribute('aria-checked', lowPowerToggle.checked ? 'true' : 'false')
        })
      }
    }

    // Add Theme toggle listener with ARIA support
    const themeToggle = this.panel.querySelector('#settings-theme')
    if (themeToggle) {
      themeToggle.setAttribute('role', 'switch')
      const currentTheme = UserSettings.getEffectiveTheme()
      themeToggle.checked = currentTheme === 'light'
      themeToggle.setAttribute('aria-checked', themeToggle.checked ? 'true' : 'false')

      themeToggle.addEventListener('change', () => {
        themeToggle.setAttribute('aria-checked', themeToggle.checked ? 'true' : 'false')
        const newTheme = themeToggle.checked ? 'light' : 'dark'
        UserSettings.set('theme', newTheme)
        UserSettings.applyTheme(newTheme)
      })
    }

    // Load current settings into form
    this._loadCurrentSettings()

    // Cache focusable elements for focus trap (performance optimization)
    this._focusableElements = Array.from(this.panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ))
  }

  /**
   * Get the panel HTML structure
   */
  _getPanelHTML () {
    return `
      <div class="settings-header">
        <span class="settings-title" id="settings-title">Settings</span>
        <button class="settings-close" aria-label="Close settings">×</button>
      </div>

      <div class="settings-content">
        <div class="settings-group">
          <div class="settings-group-title">APPEARANCE</div>
          <div class="settings-options">
            <label class="settings-toggle-label" for="settings-theme">
              <span class="settings-toggle-text">
                <span class="settings-radio-label-text">Light Mode</span>
                <span class="settings-radio-description">Switch to light color scheme</span>
              </span>
              <input type="checkbox" id="settings-theme" class="settings-toggle">
            </label>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-title" id="audio-quality-label">AUDIO QUALITY</div>
          <div class="settings-options" role="radiogroup" aria-labelledby="audio-quality-label">
            ${this._getRadioOption('audioQuality', 'auto', 'Auto', 'Use device detection')}
            ${this._getRadioOption('audioQuality', 'high', 'High', 'Best quality, more CPU')}
            ${this._getRadioOption('audioQuality', 'medium', 'Medium', 'Balanced')}
            ${this._getRadioOption('audioQuality', 'low', 'Low', 'Reduced quality')}
            ${this._getRadioOption('audioQuality', 'minimal', 'Minimal', 'Lowest CPU usage')}
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-title" id="audio-buffer-label">AUDIO BUFFER</div>
          <div class="settings-options" role="radiogroup" aria-labelledby="audio-buffer-label">
            ${this._getRadioOption('audioBuffer', 'auto', 'Auto', 'Use device detection')}
            ${this._getRadioOption('audioBuffer', '100', 'Small (100ms)', 'Low latency')}
            ${this._getRadioOption('audioBuffer', '200', 'Medium (200ms)', 'Balanced')}
            ${this._getRadioOption('audioBuffer', '300', 'Large (300ms)', 'Stable')}
            ${this._getRadioOption('audioBuffer', '500', 'Maximum (500ms)', 'Most stable')}
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-title" id="graphics-quality-label">GRAPHICS QUALITY</div>
          <div class="settings-options" role="radiogroup" aria-labelledby="graphics-quality-label">
            ${this._getRadioOption('graphicsQuality', 'auto', 'Auto', 'Use device detection')}
            ${this._getRadioOption('graphicsQuality', 'full', 'Full', 'All effects')}
            ${this._getRadioOption('graphicsQuality', 'reduced', 'Reduced', 'No glow/shadows')}
            ${this._getRadioOption('graphicsQuality', 'minimal', 'Minimal', 'Basic rendering')}
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-group-title">POWER MODE</div>
          <div class="settings-options">
            <label class="settings-toggle-label" for="settings-lowPower">
              <span class="settings-toggle-text">
                <span class="settings-radio-label-text">Low Power Mode</span>
                <span class="settings-radio-description">Reduce CPU usage for battery saving</span>
              </span>
              <input type="checkbox" id="settings-lowPower" class="settings-toggle">
            </label>
          </div>
        </div>

        <div class="settings-status">
          <div class="settings-status-line">
            <span>Device tier:</span>
            <span id="settingsDeviceTier">detecting...</span>
          </div>
          <div class="settings-status-line">
            <span>Stress:</span>
            <span id="settingsStress">-</span>
            <span> | Underruns:</span>
            <span id="settingsUnderruns">0</span>
          </div>
        </div>
      </div>

      <div class="settings-footer">
        <button class="settings-reset">Reset</button>
        <button class="settings-apply">Apply</button>
      </div>
    `
  }

  /**
   * Get HTML for a radio option
   */
  _getRadioOption (group, value, label, description) {
    const id = `settings-${group}-${value}`
    return `
      <label class="settings-radio-label" for="${id}">
        <input type="radio" id="${id}" name="${group}" value="${value}">
        <span class="settings-radio-text">
          <span class="settings-radio-label-text">${label}</span>
          <span class="settings-radio-description">${description}</span>
        </span>
      </label>
    `
  }

  /**
   * Attach listeners to all radio inputs
   */
  _attachRadioListeners () {
    const radios = this.panel.querySelectorAll('input[type="radio"]')
    radios.forEach(radio => {
      radio.addEventListener('change', () => {
        // Visual feedback - highlight changed option
        const label = radio.closest('.settings-radio-label')
        if (label) {
          label.classList.add('settings-changed')
          setTimeout(() => label.classList.remove('settings-changed'), 300)
        }
      })
    })
  }

  /**
   * Load current settings into the form
   */
  _loadCurrentSettings () {
    if (typeof UserSettings === 'undefined') {
      return
    }

    const settings = UserSettings.getAll()

    Object.entries(settings).forEach(([key, value]) => {
      const radio = this.panel.querySelector(`input[name="${key}"][value="${value}"]`)
      if (radio) {
        radio.checked = true
      }
    })

    // Load Low Power Mode state
    const lowPowerToggle = this.panel.querySelector('#settings-lowPower')
    if (lowPowerToggle && typeof MobileResourceManager !== 'undefined') {
      lowPowerToggle.checked = MobileResourceManager.getInstance().isLowPowerMode()
    }

    // Update device tier display
    this._updateDeviceTier()
  }

  /**
   * Update the device tier display
   */
  _updateDeviceTier () {
    const tierEl = this.panel?.querySelector('#settingsDeviceTier')
    if (!tierEl) return

    let tierText = 'unknown'

    // Try to get from DeviceCapabilities
    if (typeof DeviceCapabilities !== 'undefined') {
      try {
        const caps = DeviceCapabilities.detect()
        tierText = caps.tier || 'medium'
      } catch (e) {
      }
    } else if (typeof PlatformDetection !== 'undefined') {
      // Fallback to PlatformDetection
      try {
        const profile = PlatformDetection.getEffectiveAudioProfile?.()
        tierText = profile?.tier || 'medium'
      } catch (e) {
        tierText = 'medium'
      }
    }

    tierEl.textContent = tierText.charAt(0).toUpperCase() + tierText.slice(1)
  }

  /**
   * Start periodic stress updates
   */
  _startStressUpdates () {
    this._updateStressDisplay()
    this.stressUpdateInterval = setInterval(() => {
      this._updateStressDisplay()
    }, 1000)
  }

  /**
   * Stop periodic stress updates
   */
  _stopStressUpdates () {
    if (this.stressUpdateInterval) {
      clearInterval(this.stressUpdateInterval)
      this.stressUpdateInterval = null
    }
  }

  /**
   * Update the stress display
   */
  _updateStressDisplay () {
    const stressEl = this.panel?.querySelector('#settingsStress')
    const underrunsEl = this.panel?.querySelector('#settingsUnderruns')

    if (!stressEl || !underrunsEl) return

    // Try to get from AudioService stress monitor
    const audioService = window.webarmoniumApp?.audioService
    const stressMonitor = audioService?.stressMonitor

    if (stressMonitor) {
      const factor = stressMonitor.stressFactor || 1.0
      const underruns = stressMonitor.underrunCount || 0
      stressEl.textContent = factor.toFixed(2)
      underrunsEl.textContent = String(underruns)

      // Color code stress (semantic colors)
      if (factor < 0.5) {
        stressEl.style.color = '#ef4444' // Red - stressed
      } else if (factor < 0.8) {
        stressEl.style.color = '#f97316' // Orange - moderate
      } else {
        stressEl.style.color = '#22c55e' // Green - good
      }
    } else {
      stressEl.textContent = '-'
      underrunsEl.textContent = '0'
    }
  }

  /**
   * Apply settings from form
   */
  _applySettings () {
    if (typeof UserSettings === 'undefined') {
      return
    }

    const groups = ['audioQuality', 'audioBuffer', 'graphicsQuality']

    // Collect new settings values (but don't save yet)
    const newSettings = {}
    groups.forEach(group => {
      const checked = this.panel.querySelector(`input[name="${group}"]:checked`)
      if (checked) {
        newSettings[group] = checked.value
      }
    })

    // ROLLBACK FIX: Save settings to localStorage BEFORE attempting to apply
    // This ensures settings are persisted even if application fails
    // (User can fix the issue and retry, or settings will apply on next page load)
    groups.forEach(group => {
      if (newSettings[group]) {
        UserSettings.set(group, newSettings[group])
      }
    })

    // Try to apply audio settings
    // Support both rooms (webarmoniumApp) and landing page (landingApp)
    const audioService = window.webarmoniumApp?.audioService || window.landingApp?.audioService
    if (audioService?.reloadAudioProfile) {
      try {
        audioService.reloadAudioProfile()
      } catch (error) {
        console.error('Failed to reload audio profile:', error)
        // Don't return - continue to graphics, settings are already saved
        // They'll be applied correctly on next page load
        this._showCanvasNotification('Audio reload failed - will apply on refresh', true)
      }
    }

    // Try to apply graphics settings
    // Support both rooms (webarmoniumApp) and landing page (landingApp)
    const visualService = window.webarmoniumApp?.visualService || window.landingApp?.visualService
    if (visualService?.applyGraphicsQuality) {
      try {
        visualService.applyGraphicsQuality()
      } catch (error) {
        console.error('Failed to apply graphics quality:', error)
        // Don't return - settings are saved and will apply on next page load
        this._showCanvasNotification('Graphics update failed - will apply on refresh', true)
      }
    }

    // Close panel first
    this.close()

    // Delay notification until after panel close animation
    setTimeout(() => {
      this._showCanvasNotification('Settings applied')
    }, SettingsPanel.TOAST_DELAY_AFTER_CLOSE)
  }

  /**
   * Escape HTML entities to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  _escapeHtml (str) {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }
    return String(str).replace(/[&<>"']/g, char => escapeMap[char])
  }

  /**
   * Show a notification overlay on the canvas
   * @param {string} message - Message to display
   * @param {boolean} isWarning - If true, show as warning (longer display, different style)
   */
  _showCanvasNotification (message, isWarning = false) {
    // Security: Validate and sanitize input to prevent XSS
    if (typeof message !== 'string') {
      return
    }
    // Escape HTML entities and truncate to prevent abuse
    const sanitizedMessage = this._escapeHtml(message).slice(0, 200)

    // Fix #1: Clear any existing notification
    if (this.activeNotification && this.activeNotification.parentNode) {
      this.activeNotification.parentNode.removeChild(this.activeNotification)
    }
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout)
    }
    if (this.notificationRemovalTimeout) {
      clearTimeout(this.notificationRemovalTimeout)
    }

    const notification = document.createElement('div')
    notification.className = 'settings-canvas-notification' + (isWarning ? ' warning' : '')
    notification.textContent = sanitizedMessage

    // Fix #6: Add ARIA live region for screen readers
    notification.setAttribute('role', 'status')
    notification.setAttribute('aria-live', 'polite')
    notification.setAttribute('aria-atomic', 'true')

    // Fix #1: Track active notification
    this.activeNotification = notification

    document.body.appendChild(notification)

    // Animate in
    requestAnimationFrame(() => {
      notification.classList.add('visible')
    })

    // Remove after delay (Fix #7: use constants)
    const displayDuration = isWarning ? SettingsPanel.TOAST_WARNING_DURATION : SettingsPanel.TOAST_DISPLAY_DURATION
    this.notificationTimeout = setTimeout(() => {
      notification.classList.remove('visible')
      this.notificationRemovalTimeout = setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification)
        }
        // Fix #1: Clear reference
        if (this.activeNotification === notification) {
          this.activeNotification = null
        }
      }, SettingsPanel.ANIMATION_DURATION)
    }, displayDuration)
  }

  /**
   * Reset settings to defaults
   */
  _resetSettings () {
    if (typeof UserSettings === 'undefined') {
      return
    }

    UserSettings.resetAll()
    this._loadCurrentSettings()

    // Fix #4: Try-catch for audio reload
    // Support both rooms (webarmoniumApp) and landing page (landingApp)
    const audioService = window.webarmoniumApp?.audioService || window.landingApp?.audioService
    if (audioService?.reloadAudioProfile) {
      try {
        audioService.reloadAudioProfile()
      } catch (error) {
        console.error('Failed to reload audio profile:', error)
      }
    }

    // Fix #4: Try-catch for graphics reload
    // Support both rooms (webarmoniumApp) and landing page (landingApp)
    const visualService = window.webarmoniumApp?.visualService || window.landingApp?.visualService
    if (visualService?.applyGraphicsQuality) {
      try {
        visualService.applyGraphicsQuality()
      } catch (error) {
        console.error('Failed to apply graphics quality:', error)
      }
    }

    // Visual feedback
    const resetBtn = this.panel.querySelector('.settings-reset')
    if (resetBtn) {
      const originalText = resetBtn.textContent
      resetBtn.textContent = 'Reset!'
      setTimeout(() => {
        resetBtn.textContent = originalText
      }, 1000)
    }
  }

  /**
   * Handle escape key to close
   */
  _handleKeyDown (e) {
    if (e.key === 'Escape') {
      this.close()
      return
    }

    // Focus trap: trap Tab key within the panel (uses cached elements)
    if (e.key === 'Tab' && this._focusableElements && this._focusableElements.length > 0) {
      const firstElement = this._focusableElements[0]
      const lastElement = this._focusableElements[this._focusableElements.length - 1]

      if (e.shiftKey) {
        // Shift+Tab: if on first element, wrap to last
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement.focus()
        }
      } else {
        // Tab: if on last element, wrap to first
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement.focus()
        }
      }
    }
  }

  /**
   * Handle click on overlay (outside panel) to close
   */
  _handleOverlayClick (e) {
    if (e.target === this.overlay) {
      this.close()
    }
  }
}

// Add CSS styles (uses CSS variables from styles.css)
const settingsStyles = document.createElement('style')
settingsStyles.textContent = `
  /* ============================================ */
  /* Desktop: Right-side slide-in panel          */
  /* ============================================ */
  .settings-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: transparent;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.3s ease;
    /* Desktop: align panel to right */
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
  }

  .settings-overlay.settings-visible {
    opacity: 1;
  }

  .settings-panel {
    /* Unified semi-transparent background like other UI elements */
    background: var(--ui-bg, rgba(10, 10, 20, 0.55));
    width: 360px;
    height: 100%;
    max-height: 100vh;
    overflow-y: auto;
    border-left: 1px solid var(--line, #1e1e2d);
    border-radius: 0;
    /* Slide in from right */
    transform: translateX(100%);
    transition: transform 0.3s ease;
  }

  .settings-visible .settings-panel {
    transform: translateX(0);
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid var(--line, #1e1e2d);
    position: sticky;
    top: 0;
    background: var(--ui-bg, rgba(10, 10, 20, 0.55));
    z-index: 1;
  }

  .settings-title {
    font-family: var(--font-display, 'Space Grotesk', system-ui, sans-serif);
    font-size: 16px;
    font-weight: 600;
    color: var(--bright, #e0e0f0);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .settings-close {
    width: 36px;
    height: 36px;
    background: transparent;
    border: 2px solid var(--muted, #3a3a50);
    border-radius: 50%;
    color: var(--dim, #5a5a70);
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    transition: border-color 0.2s, color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .settings-close:hover {
    border-color: var(--light, #9090a8);
    color: var(--bright, #e0e0f0);
  }

  .settings-content {
    padding: 20px 24px;
  }

  .settings-group {
    margin-bottom: 24px;
  }

  .settings-group:last-of-type {
    margin-bottom: 0;
  }

  .settings-group-title {
    font-family: var(--font-mono, 'Fira Code', monospace);
    font-size: 10px;
    font-weight: 600;
    color: var(--dim, #5a5a70);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }

  .settings-options {
    background: transparent;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid var(--line, #1e1e2d);
  }

  .settings-radio-label {
    display: flex;
    align-items: center;
    padding: 12px 14px;
    cursor: pointer;
    transition: background 0.2s;
    border-bottom: 1px solid var(--line, #1e1e2d);
  }

  .settings-radio-label:last-child {
    border-bottom: none;
  }

  .settings-radio-label:hover {
    background: rgba(45, 212, 191, 0.05);
  }

  .settings-radio-label.settings-changed {
    background: rgba(45, 212, 191, 0.1);
  }

  .settings-radio-label input[type="radio"] {
    width: 18px;
    height: 18px;
    margin-right: 12px;
    accent-color: var(--accent, #2dd4bf);
    cursor: pointer;
  }

  .settings-radio-text {
    display: flex;
    flex-direction: column;
  }

  .settings-radio-label-text {
    color: var(--bright, #e0e0f0);
    font-size: 13px;
    font-weight: 500;
  }

  .settings-radio-description {
    color: var(--dim, #5a5a70);
    font-size: 11px;
    margin-top: 2px;
  }

  /* Toggle switch styles (for Low Power Mode) */
  .settings-toggle-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .settings-toggle-label:hover {
    background: rgba(45, 212, 191, 0.05);
  }

  .settings-toggle-text {
    display: flex;
    flex-direction: column;
  }

  .settings-toggle {
    -webkit-appearance: none;
    appearance: none;
    width: 44px;
    height: 24px;
    background: var(--muted, #3a3a50);
    border-radius: 12px;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
  }

  .settings-toggle::before {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    background: var(--bright, #e0e0f0);
    border-radius: 50%;
    transition: transform 0.2s;
  }

  .settings-toggle:checked {
    background: var(--accent, #2dd4bf);
  }

  .settings-toggle:checked::before {
    transform: translateX(20px);
  }

  .settings-status {
    margin-top: 24px;
    padding: 14px;
    background: transparent;
    border-radius: 12px;
    border: 1px solid var(--line, #1e1e2d);
    font-family: var(--font-mono, 'Fira Code', monospace);
    font-size: 11px;
    color: var(--dim, #5a5a70);
  }

  .settings-status-line {
    display: flex;
    gap: 8px;
  }

  .settings-status-line + .settings-status-line {
    margin-top: 6px;
  }

  .settings-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 20px 24px;
    border-top: 1px solid var(--line, #1e1e2d);
    position: sticky;
    bottom: 0;
    background: var(--ui-bg, rgba(10, 10, 20, 0.55));
  }

  .settings-reset,
  .settings-apply {
    padding: 10px 20px;
    border-radius: 25px;
    font-family: var(--font-mono, 'Fira Code', monospace);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .settings-reset {
    background: transparent;
    border: 2px solid var(--muted, #3a3a50);
    color: var(--dim, #5a5a70);
  }

  .settings-reset:hover {
    border-color: var(--light, #9090a8);
    color: var(--bright, #e0e0f0);
  }

  .settings-apply {
    background: transparent;
    border: 2px solid var(--accent, #2dd4bf);
    color: var(--accent, #2dd4bf);
  }

  .settings-apply:hover {
    background: rgba(45, 212, 191, 0.1);
    border-color: var(--accent-hover, #5eead4);
    color: var(--accent-hover, #5eead4);
  }

  /* Scrollbar styling */
  .settings-panel::-webkit-scrollbar {
    width: 6px;
  }

  .settings-panel::-webkit-scrollbar-track {
    background: transparent;
  }

  .settings-panel::-webkit-scrollbar-thumb {
    background: var(--muted, #3a3a50);
    border-radius: 3px;
  }

  /* ============================================ */
  /* Mobile: Bottom sheet modal                  */
  /* ============================================ */
  @media (max-width: 768px) {
    .settings-overlay {
      align-items: flex-end;
      justify-content: center;
    }

    .settings-panel {
      width: 100%;
      height: auto;
      max-height: 85vh;
      border-left: none;
      border-top: 1px solid var(--line, #1e1e2d);
      border-radius: 20px 20px 0 0;
      /* Slide up from bottom */
      transform: translateY(100%);
    }

    .settings-visible .settings-panel {
      transform: translateY(0);
    }

    .settings-header {
      padding: 16px 20px;
      border-radius: 20px 20px 0 0;
    }

    /* Mobile handle bar */
    .settings-header::before {
      content: '';
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      width: 40px;
      height: 4px;
      background: var(--muted, #3a3a50);
      border-radius: 2px;
    }

    .settings-title {
      margin-top: 8px;
    }

    .settings-content {
      padding: 16px 20px;
    }

    .settings-footer {
      padding: 16px 20px;
      padding-bottom: max(20px, env(safe-area-inset-bottom, 20px));
    }
  }

  /* Canvas notification toast */
  .settings-canvas-notification {
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: var(--accent, #2dd4bf);
    color: var(--void, #020208);
    padding: 12px 24px;
    border-radius: 25px;
    font-family: var(--font-mono, 'Fira Code', monospace);
    font-size: 12px;
    font-weight: 600;
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.3s ease, transform 0.3s ease;
    pointer-events: none;
  }

  .settings-canvas-notification.visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  .settings-canvas-notification.warning {
    background: var(--node-2, #00d4ff);
  }
`
document.head.appendChild(settingsStyles)

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SettingsPanel
}

// Make available globally
if (typeof window !== 'undefined') {
  window.SettingsPanel = SettingsPanel
}
