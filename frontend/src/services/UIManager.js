/**
 * UIManager
 * Single-responsibility component for UI state management
 * Extracted from WebarmoniumApp (main.js) as part of Sprint 2 modularization
 *
 * Responsibilities:
 * - Loading screen management
 * - Error display management
 * - Room information display
 * - User count display
 * - App visibility state transitions
 */

class UIManager {
  /**
   * @param {Object} elementIds - DOM element IDs for UI components
   */
  constructor(elementIds = {}) {
    this.elementIds = {
      loadingScreen: elementIds.loadingScreen || 'loadingScreen',
      appContent: elementIds.appContent || 'appContent',
      errorDisplay: elementIds.errorDisplay || 'errorDisplay',
      errorMessage: elementIds.errorMessage || 'errorMessage',
      userCount: elementIds.userCount || 'userCount',
      roomId: elementIds.roomId || 'roomId'
    }

    // Current state
    this.currentRoom = null
    this.userCount = 1
    this.virtualSourceCount = 0 // Number of active web sources (virtual users)

    // Entry #52: Collapsible UI state
    this.controlsVisible = true
    this.instructionsVisible = true
    this.autoHideTimeout = null
    this.isInteractingWithControls = false

    // Constants
    this.AUTO_HIDE_DELAY = 5000 // 5 seconds
    this.EDGE_ZONE_SIZE = 80 // pixels from edge to trigger show (desktop only)

    // Audio mode indicator state (Entry #73)
    this.audioModeIndicator = null
    this.currentAudioMode = 'normal'
    this.audioStressFactor = 1.0

    // Mobile state
    this.isMobile = false

    // Entry #74: Settings panel
    this.settingsPanel = null
  }

  /**
   * Update room display with current room and user count
   * @param {Object} roomData - Room data {id, roomId}
   * @param {number} userCount - Number of users in room
   */
  updateRoomDisplay(roomData = null, userCount = null) {
    // Update stored values if provided
    if (roomData !== null) {
      this.currentRoom = roomData
    }
    if (userCount !== null) {
      this.userCount = userCount
    }

    // Update user count display
    const userCountEl = document.getElementById(this.elementIds.userCount)
    if (userCountEl) {
      const userText = this.userCount === 1 ? 'user' : 'users'
      let displayText = `${this.userCount} ${userText}`

      // Add web sources info when virtual users are active
      if (this.virtualSourceCount > 0) {
        const sourceText = this.virtualSourceCount === 1 ? 'web source' : 'web sources'
        displayText += ` + ${this.virtualSourceCount} ${sourceText}`
      }

      userCountEl.textContent = displayText
    }

    // Update room ID display
    const roomIdEl = document.getElementById(this.elementIds.roomId)
    if (roomIdEl && this.currentRoom) {
      const roomId = this.currentRoom.id || this.currentRoom.roomId
      roomIdEl.textContent = `Room: ${roomId}`
    }
  }

  /**
   * Show the main application (hide loading screen)
   */
  showApp() {
    const loadingScreen = document.getElementById(this.elementIds.loadingScreen)
    const appContent = document.getElementById(this.elementIds.appContent)

    if (loadingScreen) {
      loadingScreen.style.display = 'none'
    }

    if (appContent) {
      appContent.classList.add('loaded')
    }

    // console.log('✅ UIManager: App displayed, loading screen hidden')
  }

  /**
   * Show error message (hide loading screen and app content)
   * @param {string} message - Error message to display
   */
  showError(message) {
    const errorDisplay = document.getElementById(this.elementIds.errorDisplay)
    const errorMessage = document.getElementById(this.elementIds.errorMessage)
    const loadingScreen = document.getElementById(this.elementIds.loadingScreen)

    if (loadingScreen) {
      loadingScreen.style.display = 'none'
    }

    if (errorMessage) {
      errorMessage.textContent = message
    }

    if (errorDisplay) {
      errorDisplay.style.display = 'block'
    }

    // console.error('❌ UIManager: Error displayed:', message)
  }

  /**
   * Hide error display
   */
  hideError() {
    const errorDisplay = document.getElementById(this.elementIds.errorDisplay)
    if (errorDisplay) {
      errorDisplay.style.display = 'none'
    }
  }

  /**
   * Show loading screen
   */
  showLoading() {
    const loadingScreen = document.getElementById(this.elementIds.loadingScreen)
    if (loadingScreen) {
      loadingScreen.style.display = 'block'
    }
  }

  /**
   * Get current room data
   * @returns {Object|null} Current room data
   */
  getCurrentRoom() {
    return this.currentRoom
  }

  /**
   * Get current user count
   * @returns {number} User count
   */
  getUserCount() {
    return this.userCount
  }

  /**
   * Set room data
   * @param {Object} roomData - Room data
   */
  setCurrentRoom(roomData) {
    this.currentRoom = roomData
    this.updateRoomDisplay()
  }

  /**
   * Set user count
   * @param {number} count - User count
   */
  setUserCount(count) {
    this.userCount = count
    this.updateRoomDisplay()
  }

  /**
   * Set virtual source count (web sources like Wikipedia, HackerNews)
   * @param {number} count - Number of active web sources
   */
  setVirtualSourceCount(count) {
    this.virtualSourceCount = count
    this.updateRoomDisplay()
  }

  // ==========================================
  // Entry #52: Collapsible UI Methods (v2 - Mobile Bottom Sheet)
  // ==========================================

  /**
   * Initialize collapsible UI system
   * Should be called after DOM is ready
   */
  initCollapsibleUI() {
    this.isMobile = this._isMobileDevice()

    if (this.isMobile) {
      this._setupMobileMenu()
    } else {
      this._setupDesktopUI()
    }

    // Initialize audio mode indicator (Entry #73)
    this.initAudioModeIndicator()

  }

  /**
   * Setup desktop UI with edge detection (no toggle buttons)
   */
  _setupDesktopUI() {
    this._setupAutoHide()
    this._setupEdgeDetection()
    this._setupControlsInteraction()

    // Entry #74: Add Settings button to desktop UI
    this._createDesktopSettingsButton()
  }

  /**
   * Entry #74: Create Settings button for desktop UI (icon only, in right section)
   */
  _createDesktopSettingsButton () {
    // Check if button already exists
    if (document.getElementById('desktopSettingsBtn')) return

    // Find the room-right container for settings button
    const roomRight = document.getElementById('roomRight')
    if (!roomRight) {
      return
    }

    const settingsBtn = document.createElement('button')
    settingsBtn.id = 'desktopSettingsBtn'
    settingsBtn.className = 'desktop-settings-btn'
    settingsBtn.innerHTML = '&#9881;' // Gear icon only
    settingsBtn.title = 'Settings'
    settingsBtn.setAttribute('aria-label', 'Open settings')

    settingsBtn.onclick = () => this.openSettingsPanel()

    // Insert in right section
    roomRight.appendChild(settingsBtn)
    this.desktopSettingsBtn = settingsBtn
  }

  /**
   * Setup mobile UI - same UI bar as desktop, just smaller buttons
   */
  _setupMobileMenu() {
    // Add settings button to mobile UI (same as desktop)
    this._createDesktopSettingsButton()

    // Hide instructions by default on mobile, show via info button
    const instructions = document.querySelector('.instructions')
    if (instructions) instructions.style.display = 'none'

    // Create info button to toggle instructions
    this._createMobileInfoButton()
  }

  /**
   * Create mobile info button (bottom-left, toggles instructions)
   */
  _createMobileInfoButton() {
    this.mobileInfoBtn = document.createElement('button')
    this.mobileInfoBtn.className = 'mobile-info-btn'
    this.mobileInfoBtn.style.cssText = `
      display: flex;
      position: fixed;
      bottom: max(12px, env(safe-area-inset-bottom, 12px));
      left: max(12px, env(safe-area-inset-left, 12px));
      z-index: 1002;
      background: rgba(10, 10, 20, 0.55);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 2px solid #3a3a50;
      color: #9090a8;
      border-radius: 50%;
      width: 44px;
      height: 44px;
      cursor: pointer;
      align-items: center;
      justify-content: center;
      font-family: var(--font-display, 'Space Grotesk', system-ui, sans-serif);
      font-size: 20px;
      font-weight: 500;
      transition: border-color 0.2s, color 0.2s;
    `
    this.mobileInfoBtn.textContent = '?'
    this.mobileInfoBtn.setAttribute('aria-label', 'Show instructions')
    this.mobileInfoBtn.setAttribute('aria-expanded', 'false')

    this.mobileInfoPopupOpen = false
    this.mobileInfoBtn.onclick = () => this._toggleMobileInfoPopup()

    // Hover/touch states
    const setHoverState = () => {
      if (!this.mobileInfoPopupOpen) {
        this.mobileInfoBtn.style.borderColor = '#5a5a70'
        this.mobileInfoBtn.style.color = '#b0b0c0'
      }
    }
    const resetState = () => {
      if (!this.mobileInfoPopupOpen) {
        this.mobileInfoBtn.style.borderColor = '#3a3a50'
        this.mobileInfoBtn.style.color = '#9090a8'
      }
    }
    this.mobileInfoBtn.addEventListener('mouseenter', setHoverState)
    this.mobileInfoBtn.addEventListener('mouseleave', resetState)
    this.mobileInfoBtn.addEventListener('touchstart', setHoverState, { passive: true })
    this.mobileInfoBtn.addEventListener('touchend', resetState, { passive: true })

    document.body.appendChild(this.mobileInfoBtn)

    // Create the popup (hidden by default)
    this._createMobileInfoPopup()
  }

  /**
   * Create mobile info popup
   */
  _createMobileInfoPopup() {
    this.mobileInfoPopup = document.createElement('div')
    this.mobileInfoPopup.className = 'mobile-info-popup'
    this.mobileInfoPopup.style.cssText = `
      display: none;
      position: fixed;
      bottom: max(68px, calc(env(safe-area-inset-bottom, 12px) + 56px));
      left: max(12px, env(safe-area-inset-left, 12px));
      z-index: 1001;
      background: rgba(10, 10, 20, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid #3a3a50;
      border-radius: 12px;
      padding: 12px 16px;
      max-width: 280px;
      color: #9090a8;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 12px;
      line-height: 1.5;
    `
    this.mobileInfoPopup.innerHTML = `
      <div style="margin-bottom: 8px;"><strong>Tap</strong> for notes (hold longer for sustained tones)</div>
      <div><strong>Drag</strong> to create melodic phrases</div>
    `

    document.body.appendChild(this.mobileInfoPopup)
  }

  /**
   * Toggle mobile info popup
   */
  _toggleMobileInfoPopup() {
    this.mobileInfoPopupOpen = !this.mobileInfoPopupOpen

    if (this.mobileInfoPopupOpen) {
      this.mobileInfoPopup.style.display = 'block'
      this.mobileInfoBtn.style.borderColor = '#2dd4bf'
      this.mobileInfoBtn.style.color = '#2dd4bf'
      this.mobileInfoBtn.setAttribute('aria-expanded', 'true')

      // Auto-hide after 5 seconds
      this._mobileInfoAutoHide = setTimeout(() => {
        this._closeMobileInfoPopup()
      }, 5000)
    } else {
      this._closeMobileInfoPopup()
    }
  }

  /**
   * Close mobile info popup
   */
  _closeMobileInfoPopup() {
    this.mobileInfoPopupOpen = false
    if (this.mobileInfoPopup) {
      this.mobileInfoPopup.style.display = 'none'
    }
    if (this.mobileInfoBtn) {
      this.mobileInfoBtn.style.borderColor = '#3a3a50'
      this.mobileInfoBtn.style.color = '#9090a8'
      this.mobileInfoBtn.setAttribute('aria-expanded', 'false')
    }

    if (this._mobileInfoAutoHide) {
      clearTimeout(this._mobileInfoAutoHide)
      this._mobileInfoAutoHide = null
    }
  }

  // ==========================================
  // Entry #74: Settings Panel Methods
  // ==========================================

  /**
   * Open the settings panel
   */
  openSettingsPanel () {
    // Create panel instance if needed
    if (!this.settingsPanel && typeof SettingsPanel !== 'undefined') {
      this.settingsPanel = new SettingsPanel()
    }

    if (this.settingsPanel) {
      this.settingsPanel.open()
    } else {
    }
  }

  /**
   * Close the settings panel
   */
  closeSettingsPanel () {
    if (this.settingsPanel) {
      this.settingsPanel.close()
    }
  }

  // ==========================================
  // Entry #73: Audio Mode Indicator Methods
  // ==========================================

  /**
   * Initialize audio mode indicator
   * Now positioned as bottom-left overlay (not in UI bar)
   * Call after DOM is ready (typically in initCollapsibleUI)
   */
  initAudioModeIndicator() {
    // Create indicator element if it doesn't exist
    if (!document.getElementById('audioModeIndicator')) {
      this.audioModeIndicator = document.createElement('span')
      this.audioModeIndicator.id = 'audioModeIndicator'
      this.audioModeIndicator.className = 'audio-mode-indicator hidden'
      this.audioModeIndicator.title = 'Audio is running in power-saving mode'

      // Append to body - CSS handles fixed bottom-left positioning
      document.body.appendChild(this.audioModeIndicator)
    } else {
      this.audioModeIndicator = document.getElementById('audioModeIndicator')
    }

    // Set up event listeners for audio stress changes
    this._setupAudioStressListeners()

  }

  /**
   * Set up listeners for audio stress events from AudioService
   */
  _setupAudioStressListeners() {
    // Listen for custom audio stress events (dispatched by AudioService)
    window.addEventListener('audio-mode-change', (e) => {
      this.currentAudioMode = e.detail?.mode || 'normal'
      this.audioStressFactor = e.detail?.stressFactor ?? 1.0
      this._updateAudioModeIndicator()
    })

    window.addEventListener('audio-stress-change', (e) => {
      this.audioStressFactor = e.detail?.stressFactor ?? 1.0
      this.currentAudioMode = e.detail?.mode || this.currentAudioMode
      this._updateAudioModeIndicator()
    })
  }

  /**
   * Update audio mode indicator based on current state
   */
  _updateAudioModeIndicator() {
    if (!this.audioModeIndicator) return

    // Check if Low Power mode is enabled
    const isLowPowerEnabled = window.PlatformDetection?.isLowPowerModeEnabled() || false
    const isDegraded = this.currentAudioMode !== 'normal' || this.audioStressFactor < 0.8

    // Determine icon and visibility
    if (isLowPowerEnabled) {
      this.audioModeIndicator.innerHTML = '🔋'
      this.audioModeIndicator.title = 'Low Power Audio mode enabled'
      this.audioModeIndicator.classList.remove('hidden')
      this.audioModeIndicator.classList.add('low-power')
      this.audioModeIndicator.classList.remove('degraded', 'minimal', 'emergency')
    } else if (isDegraded) {
      // Show degraded indicator based on mode
      const modeIcons = {
        'degraded': '⚡',
        'minimal': '📉',
        'emergency': '⚠️'
      }
      const modeDescriptions = {
        'degraded': 'Audio quality reduced for performance',
        'minimal': 'Minimal audio mode active',
        'emergency': 'Audio under stress - emergency mode'
      }
      const icon = modeIcons[this.currentAudioMode] || '⚡'
      const desc = modeDescriptions[this.currentAudioMode] || 'Audio quality adjusted'

      this.audioModeIndicator.innerHTML = icon
      this.audioModeIndicator.title = desc
      this.audioModeIndicator.classList.remove('hidden', 'low-power')
      this.audioModeIndicator.classList.add(this.currentAudioMode)
    } else {
      // Normal mode - hide indicator
      this.audioModeIndicator.classList.add('hidden')
      this.audioModeIndicator.classList.remove('low-power', 'degraded', 'minimal', 'emergency')
    }
  }

  /**
   * Manually set audio mode (called by AudioService)
   * @param {string} mode - 'normal' | 'degraded' | 'minimal' | 'emergency'
   * @param {number} stressFactor - Stress factor 0.3-1.0
   */
  setAudioMode(mode, stressFactor = 1.0) {
    this.currentAudioMode = mode
    this.audioStressFactor = stressFactor
    this._updateAudioModeIndicator()
  }

  /**
   * Get current audio mode for external access
   * @returns {Object} { mode, stressFactor }
   */
  getAudioMode() {
    return {
      mode: this.currentAudioMode,
      stressFactor: this.audioStressFactor
    }
  }

  /**
   * Setup auto-hide timer
   */
  _setupAutoHide() {
    this.resetAutoHideTimer()
  }

  /**
   * Setup edge zone detection for desktop hover
   */
  _setupEdgeDetection() {
    // Bound handler for cleanup
    this._boundEdgeHandler = (e) => this._handleEdgeDetection(e)
    document.addEventListener('mousemove', this._boundEdgeHandler)
  }

  /**
   * Handle mouse position for edge zone detection
   */
  _handleEdgeDetection(e) {
    const y = e.clientY

    // Top edge zone - show controls (only top 80px)
    if (y < this.EDGE_ZONE_SIZE) {
      if (!this.controlsVisible) {
        this.showControls()
        this.resetAutoHideTimer()
      }
    }

    // Bottom edge zone - show instructions (only bottom 80px)
    if (y > window.innerHeight - this.EDGE_ZONE_SIZE) {
      if (!this.instructionsVisible) {
        this.showInstructions()
        this.resetAutoHideTimer()
      }
    }
  }

  /**
   * Setup interaction detection on controls (desktop only)
   * Prevents auto-hide while user is interacting
   */
  _setupControlsInteraction() {
    const roomInterface = document.querySelector('.room-interface')
    if (roomInterface) {
      roomInterface.addEventListener('mouseenter', () => {
        this.isInteractingWithControls = true
        clearTimeout(this.autoHideTimeout)
      })
      roomInterface.addEventListener('mouseleave', () => {
        this.isInteractingWithControls = false
        this.resetAutoHideTimer()
      })
    }

    const instructions = document.querySelector('.instructions')
    if (instructions) {
      instructions.addEventListener('mouseenter', () => {
        this.isInteractingWithControls = true
        clearTimeout(this.autoHideTimeout)
      })
      instructions.addEventListener('mouseleave', () => {
        this.isInteractingWithControls = false
        this.resetAutoHideTimer()
      })
    }
  }

  /**
   * Show controls (room interface)
   */
  showControls() {
    const el = document.querySelector('.room-interface')
    if (el) {
      el.classList.remove('collapsed')
    }
    this.controlsVisible = true
  }

  /**
   * Hide controls (room interface)
   */
  hideControls() {
    const el = document.querySelector('.room-interface')
    if (el) {
      el.classList.add('collapsed')
    }
    this.controlsVisible = false
  }

  /**
   * Toggle controls visibility
   */
  toggleControls() {
    if (this.controlsVisible) {
      this.hideControls()
    } else {
      this.showControls()
      this.resetAutoHideTimer()
    }
  }

  /**
   * Show instructions
   */
  showInstructions() {
    const el = document.querySelector('.instructions')
    if (el) {
      el.classList.remove('collapsed')
    }
    this.instructionsVisible = true
  }

  /**
   * Hide instructions
   */
  hideInstructions() {
    const el = document.querySelector('.instructions')
    if (el) {
      el.classList.add('collapsed')
    }
    this.instructionsVisible = false
  }

  /**
   * Toggle instructions visibility
   */
  toggleInstructions() {
    if (this.instructionsVisible) {
      this.hideInstructions()
    } else {
      this.showInstructions()
      this.resetAutoHideTimer()
    }
  }

  /**
   * Show all UI (controls and instructions)
   * Useful for tap-to-show on mobile
   */
  showAllUI() {
    this.showControls()
    this.showInstructions()
  }

  /**
   * Hide all UI (controls and instructions)
   */
  hideAllUI() {
    if (!this.isInteractingWithControls) {
      this.hideControls()
      this.hideInstructions()
    }
  }

  /**
   * Reset auto-hide timer
   * Called when user interacts with UI
   */
  resetAutoHideTimer() {
    clearTimeout(this.autoHideTimeout)
    this.autoHideTimeout = setTimeout(() => {
      this.hideAllUI()
    }, this.AUTO_HIDE_DELAY)
  }

  /**
   * Check if current device is mobile/tablet (should use mobile menu, not edge hover)
   * Includes phones, tablets (iPad, Android), but excludes laptops with touchscreens
   */
  _isMobileDevice() {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const isSmallScreen = window.innerWidth <= 768
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

    // Tablet detection: multi-touch with 5+ touch points (iPad/Android tablets)
    // Laptops with touchscreen typically have 1-2 touch points
    const isTablet = navigator.maxTouchPoints >= 5

    // Mobile UI for:
    // - Small screens with touch (phones)
    // - Mobile user agents (older iOS/Android)
    // - Tablets with multi-touch (iPad, Android tablets regardless of screen size)
    return (hasTouch && isSmallScreen) || isMobileUA || isTablet
  }

  /**
   * Cleanup
   */
  destroy() {
    // Clear timers
    clearTimeout(this.autoHideTimeout)

    // Remove event listeners
    if (this._boundEdgeHandler) {
      document.removeEventListener('mousemove', this._boundEdgeHandler)
    }

    // Remove mobile info button and popup
    if (this.mobileInfoBtn) {
      this.mobileInfoBtn.remove()
      this.mobileInfoBtn = null
    }
    if (this.mobileInfoPopup) {
      this.mobileInfoPopup.remove()
      this.mobileInfoPopup = null
    }
    if (this._mobileInfoAutoHide) {
      clearTimeout(this._mobileInfoAutoHide)
    }

    // Restore instructions visibility
    const instructions = document.querySelector('.instructions')
    if (instructions) instructions.style.display = ''

    // Remove audio mode indicator (Entry #73)
    if (this.audioModeIndicator) {
      this.audioModeIndicator.remove()
      this.audioModeIndicator = null
    }

    // Entry #74: Remove settings elements
    if (this.desktopSettingsBtn) {
      this.desktopSettingsBtn.remove()
      this.desktopSettingsBtn = null
    }
    if (this.settingsPanel) {
      this.settingsPanel.close()
      this.settingsPanel = null
    }

    this.currentRoom = null
    this.userCount = 1
  }
}

// Make UIManager available globally
if (typeof window !== 'undefined') {
  window.UIManager = UIManager
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIManager
}
