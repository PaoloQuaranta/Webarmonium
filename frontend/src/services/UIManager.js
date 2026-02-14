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

    // Listen mode state
    this.isListenMode = false
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

    // Entry #SynthUI: Add Synth button to desktop UI (before Settings)
    this._createDesktopSynthButton()

    // Entry #74: Add Settings button to desktop UI
    this._createDesktopSettingsButton()
  }

  /**
   * Entry #74: Create Settings button for desktop UI (with label, in right section)
   */
  _createDesktopSettingsButton () {
    // Check if button already exists
    if (document.getElementById('desktopSettingsBtn')) return

    // Find the room-right container for settings button
    const roomRight = document.getElementById('roomRight')
    if (!roomRight) {
      return
    }

    // Create wrapper (like index.html structure)
    const wrapper = document.createElement('div')
    wrapper.className = 'node-btn-wrapper'

    // Create button
    const settingsBtn = document.createElement('button')
    settingsBtn.id = 'desktopSettingsBtn'
    settingsBtn.className = 'desktop-settings-btn'
    settingsBtn.innerHTML = '<svg width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/></svg>'
    settingsBtn.title = 'Settings'
    settingsBtn.setAttribute('aria-label', 'Open settings')
    settingsBtn.onclick = () => this.openSettingsPanel()

    // Create label
    const label = document.createElement('span')
    label.className = 'node-label'
    label.textContent = 'Settings'

    // Assemble structure
    wrapper.appendChild(settingsBtn)
    wrapper.appendChild(label)
    roomRight.appendChild(wrapper)

    this.desktopSettingsBtn = settingsBtn
  }

  /**
   * Entry #SynthUI: Create Synth button for desktop UI (with label, left of Settings)
   */
  _createDesktopSynthButton () {
    // Check if button already exists
    if (document.getElementById('desktopSynthBtn')) return

    // Find the room-right container
    const roomRight = document.getElementById('roomRight')
    if (!roomRight) {
      return
    }

    // Create wrapper (same structure as Settings button)
    const wrapper = document.createElement('div')
    wrapper.className = 'node-btn-wrapper'

    // Create button with sliders/equalizer icon
    const synthBtn = document.createElement('button')
    synthBtn.id = 'desktopSynthBtn'
    synthBtn.className = 'desktop-settings-btn'
    // Sliders icon (equalizer style)
    synthBtn.innerHTML = '<svg width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><path d="M11.5 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM9.05 3a2.5 2.5 0 0 1 4.9 0H16v1h-2.05a2.5 2.5 0 0 1-4.9 0H0V3h9.05zM4.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM2.05 8a2.5 2.5 0 0 1 4.9 0H16v1H6.95a2.5 2.5 0 0 1-4.9 0H0V8h2.05zm9.45 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-2.45 1a2.5 2.5 0 0 1 4.9 0H16v1h-2.05a2.5 2.5 0 0 1-4.9 0H0v-1h9.05z"/></svg>'
    synthBtn.title = 'Synth'
    synthBtn.setAttribute('aria-label', 'Toggle synth settings')
    synthBtn.onclick = () => this.toggleSynthPanel()

    // Create label
    const label = document.createElement('span')
    label.className = 'node-label'
    label.textContent = 'Synth'

    // Assemble structure
    wrapper.appendChild(synthBtn)
    wrapper.appendChild(label)

    // Insert at beginning (left of Settings)
    roomRight.insertBefore(wrapper, roomRight.firstChild)

    this.desktopSynthBtn = synthBtn
  }

  /**
   * Setup mobile UI - same UI bar as desktop, just smaller buttons
   */
  _setupMobileMenu() {
    // Entry #SynthUI: Add synth button to mobile UI
    this._createDesktopSynthButton()

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
      border-radius: 12px;
      padding: 12px 16px;
      max-width: 280px;
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
      this.mobileInfoBtn.classList.add('active')
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
      this.mobileInfoBtn.classList.remove('active')
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

  /**
   * Entry #SynthUI: Open the synth panel
   */
  openSynthPanel () {
    // Create panel instance if needed
    if (!this.synthPanel && typeof SynthPanel !== 'undefined') {
      this.synthPanel = new SynthPanel()
      if (this.desktopSynthBtn) {
        this.synthPanel.setExternalButton(this.desktopSynthBtn)
      }
    }

    // Set services if available
    if (this.synthPanel && this._synthPanelServices) {
      this.synthPanel.setServices(
        this._synthPanelServices.audioService,
        this._synthPanelServices.socketService
      )
      if (this._synthPanelServices.userColor) {
        this.synthPanel.setUserColor(this._synthPanelServices.userColor)
      }
    }

    if (this.synthPanel) {
      this.synthPanel.open()
    }
  }

  /**
   * Entry #SynthUI: Close the synth panel
   */
  closeSynthPanel () {
    if (this.synthPanel) {
      this.synthPanel.close()
    }
  }

  /**
   * Entry #SynthUI: Toggle the synth panel open/closed
   */
  toggleSynthPanel () {
    if (this.synthPanel && this.synthPanel.isOpen) {
      this.closeSynthPanel()
    } else {
      this.openSynthPanel()
    }
  }

  /**
   * Entry #SynthUI: Set services for SynthPanel
   * @param {Object} audioService - AudioService instance
   * @param {Object} socketService - SocketService instance
   * @param {string} userColor - User's assigned color
   */
  setSynthPanelServices (audioService, socketService, userColor) {
    this._synthPanelServices = { audioService, socketService, userColor }

    // If panel already exists, update it
    if (this.synthPanel) {
      this.synthPanel.setServices(audioService, socketService)
      if (userColor) {
        this.synthPanel.setUserColor(userColor)
      }
      if (this.desktopSynthBtn) {
        this.synthPanel.setExternalButton(this.desktopSynthBtn)
      }
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
    // Mobile: UI bar is always visible, never auto-hide
    if (this.isMobile) return

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

  // ============================================================
  // Listen Mode UI
  // ============================================================

  /**
   * Initialize listen mode UI — hide synth button, show jam button + listening indicator
   * @param {boolean} canPromote - Whether user can promote to jammer
   */
  initListenMode(canPromote) {
    this.isListenMode = true

    // Remove synth button (listeners don't get synth controls)
    const synthBtnWrapper = document.getElementById('desktopSynthBtn')?.parentElement
    if (synthBtnWrapper) synthBtnWrapper.remove()
    this.desktopSynthBtn = null

    // Hide instructions (listeners can't interact)
    const instructions = document.querySelector('.instructions')
    if (instructions) instructions.style.display = 'none'

    // Hide mobile "?" info button (not relevant for listeners)
    if (this.mobileInfoBtn) this.mobileInfoBtn.style.display = 'none'
    if (this.mobileInfoPopup) this.mobileInfoPopup.style.display = 'none'

    // Add jam button if room has space
    if (canPromote) {
      this._createJamButton()
    }

    // Add room selector button
    this._createRoomSelector()

    // Add listening indicator
    this._createListeningIndicator()
  }

  /**
   * Create Jam button for listen mode
   * @private
   */
  _createJamButton() {
    if (document.getElementById('listenModeJamBtn')) return

    const roomRight = document.getElementById('roomRight')
    if (!roomRight) return

    // Create wrapper (same structure as Synth/Settings buttons for connecting line)
    const wrapper = document.createElement('div')
    wrapper.className = 'node-btn-wrapper'
    wrapper.id = 'listenModeJamBtn'

    const btn = document.createElement('button')
    btn.className = 'desktop-settings-btn listen-mode-jam'
    btn.innerHTML = '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
    btn.title = 'Switch to jam mode'
    btn.setAttribute('aria-label', 'Switch to jam mode')
    btn.addEventListener('click', async () => {
      btn.disabled = true
      try {
        const app = window.webarmoniumApp
        if (app?.socketService) {
          await app.socketService.promoteToJammer()
        }
      } catch (error) {
        btn.disabled = false
        if (window.NotificationService) {
          window.NotificationService.showModeTransition('Room is full', 3000)
        }
      }
    })

    const label = document.createElement('span')
    label.className = 'node-label'
    label.textContent = 'Jam'

    wrapper.appendChild(btn)
    wrapper.appendChild(label)

    // Insert before settings button
    const settingsWrapper = document.getElementById('desktopSettingsBtn')?.parentElement
    if (settingsWrapper) {
      roomRight.insertBefore(wrapper, settingsWrapper)
    } else {
      roomRight.appendChild(wrapper)
    }
  }

  /**
   * Create room selector button for listen mode
   * @private
   */
  _createRoomSelector() {
    if (document.getElementById('listenModeRoomSelector')) return

    const roomRight = document.getElementById('roomRight')
    if (!roomRight) return

    // Create wrapper (same structure as other buttons for connecting line)
    const wrapper = document.createElement('div')
    wrapper.className = 'node-btn-wrapper'
    wrapper.id = 'listenModeRoomSelector'

    const btn = document.createElement('button')
    btn.className = 'desktop-settings-btn'
    btn.innerHTML = '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
    btn.title = 'Switch room'
    btn.setAttribute('aria-label', 'Switch listening room')

    let dropdownVisible = false
    let dropdown = null

    btn.addEventListener('click', async () => {
      if (dropdownVisible && dropdown) {
        dropdown.remove()
        dropdown = null
        dropdownVisible = false
        return
      }

      try {
        const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
        const baseUrl = isDevelopment
          ? 'http://localhost:3001'
          : `${window.location.protocol}//${window.location.host}`

        const response = await fetch(`${baseUrl}/api/rooms/lobby`)
        const data = await response.json()
        const rooms = (data.rooms || []).filter(r => r.userCount > 0)

        if (rooms.length < 2) {
          if (window.NotificationService) {
            window.NotificationService.showModeTransition('No other rooms available', 2000)
          }
          return
        }

        // Create dropdown
        dropdown = document.createElement('div')
        dropdown.className = 'room-dropdown'

        const currentRoom = new URLSearchParams(window.location.search).get('room') || 'main-room'

        for (const room of rooms) {
          const item = document.createElement('button')
          item.className = 'room-dropdown-item' + (room.roomId === currentRoom ? ' current' : '')
          const count = parseInt(room.userCount, 10) || 0
          item.innerHTML = `
            <span>${this._escapeHtml(room.roomId)}</span>
            <span class="room-dropdown-count">${count} jammer${count !== 1 ? 's' : ''}</span>
          `
          if (room.roomId !== currentRoom) {
            item.addEventListener('click', () => {
              window.location.href = `rooms.html?room=${encodeURIComponent(room.roomId)}&mode=listen`
            })
          }
          dropdown.appendChild(item)
        }

        wrapper.appendChild(dropdown)
        dropdownVisible = true

        // Close on outside click
        const closeDropdown = (e) => {
          if (!wrapper.contains(e.target)) {
            if (dropdown) dropdown.remove()
            dropdown = null
            dropdownVisible = false
            document.removeEventListener('click', closeDropdown)
          }
        }
        setTimeout(() => document.addEventListener('click', closeDropdown), 0)
      } catch (error) {
        // Silently fail — room selector is optional
      }
    })

    const label = document.createElement('span')
    label.className = 'node-label'
    label.textContent = 'Rooms'

    wrapper.appendChild(btn)
    wrapper.appendChild(label)

    // Insert after jam button or at start
    const jamBtn = document.getElementById('listenModeJamBtn')
    const settingsWrapper = document.getElementById('desktopSettingsBtn')?.parentElement
    if (jamBtn) {
      jamBtn.after(wrapper)
    } else if (settingsWrapper) {
      roomRight.insertBefore(wrapper, settingsWrapper)
    } else {
      roomRight.appendChild(wrapper)
    }
  }

  /**
   * Escape HTML for safe rendering
   * @param {string} str
   * @returns {string}
   * @private
   */
  _escapeHtml(str) {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  /**
   * Create listening indicator pill (bottom-left)
   * @private
   */
  _createListeningIndicator() {
    if (document.getElementById('listeningIndicator')) return

    const indicator = document.createElement('div')
    indicator.id = 'listeningIndicator'
    indicator.className = 'listening-indicator'
    indicator.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5z"/>
        <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z"/>
      </svg>
      Listening
    `
    document.body.appendChild(indicator)
  }

  /**
   * Switch from listen mode to jam mode (after successful promotion)
   */
  switchToJamMode() {
    this.isListenMode = false

    // Remove listen mode UI elements
    const jamBtn = document.getElementById('listenModeJamBtn')
    if (jamBtn) jamBtn.remove()

    const roomSelector = document.getElementById('listenModeRoomSelector')
    if (roomSelector) roomSelector.remove()

    const indicator = document.getElementById('listeningIndicator')
    if (indicator) indicator.remove()

    // Create synth button (now we're a jammer)
    this._createDesktopSynthButton()

    // Restore instructions/help for jammers
    if (this.isMobile) {
      // Mobile: restore "?" button (instructions remain behind toggle)
      if (this.mobileInfoBtn) this.mobileInfoBtn.style.display = 'flex'
    } else {
      // Desktop: show instructions directly
      const instructions = document.querySelector('.instructions')
      if (instructions) instructions.style.display = ''
    }
  }

  /**
   * Update jam button visibility based on room capacity
   * @param {boolean} canPromote - Whether promotion is possible
   */
  updateJamButtonVisibility(canPromote) {
    if (!this.isListenMode) return

    const jamWrapper = document.getElementById('listenModeJamBtn')
    if (canPromote && !jamWrapper) {
      this._createJamButton()
    } else if (!canPromote && jamWrapper) {
      jamWrapper.remove()
    } else if (canPromote && jamWrapper) {
      // Re-enable the button inside the wrapper if it was disabled
      const btn = jamWrapper.querySelector('button')
      if (btn) btn.disabled = false
    }
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
