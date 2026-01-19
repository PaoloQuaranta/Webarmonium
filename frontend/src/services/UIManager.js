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
    this.mobileMenuOpen = false
    this.mobileMenuBtn = null
    this.mobileBackdrop = null
    this.mobileSheet = null
    this.mobileRoomInfoOverlay = null

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

    // Sync mobile overlay if in mobile mode
    if (this.isMobile && this.mobileRoomInfoOverlay) {
      this._syncMobileOverlay()
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
   * Setup mobile UI with single bottom sheet menu
   */
  _setupMobileMenu() {
    // Hide original controls and instructions
    const roomInterface = document.querySelector('.room-interface')
    const instructions = document.querySelector('.instructions')

    if (roomInterface) roomInterface.classList.add('mobile-hidden')
    if (instructions) instructions.classList.add('mobile-hidden')

    // Create menu button
    this._createMobileMenuButton()

    // Create bottom sheet
    this._createMobileBottomSheet()

    // Create room info overlay (top-left)
    this._createMobileRoomInfoOverlay()

    // Create central start button always - it will hide itself if audio already started
    // This avoids race condition with attemptAutoStartAudio()
    this._createMobileCentralStartButton()

    // If audio already started (rare race condition), hide immediately
    if (window.webarmoniumApp?.isAudioStarted) {
      this.hideMobileCentralStartButton()
    }
  }

  /**
   * Create mobile menu button (hamburger)
   */
  _createMobileMenuButton() {
    this.mobileMenuBtn = document.createElement('button')
    this.mobileMenuBtn.className = 'mobile-menu-btn'
    // Force all styles inline for iPad (screen > 768px bypasses media query)
    // Unified style: transparent bg with accent border
    this.mobileMenuBtn.style.cssText = `
      display: flex;
      position: fixed;
      top: max(12px, env(safe-area-inset-top, 12px));
      right: max(12px, env(safe-area-inset-right, 12px));
      z-index: 1002;
      background: rgba(10, 10, 20, 0.55);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 2px solid #3a3a50;
      color: #9090a8;
      border-radius: 50%;
      width: 52px;
      height: 52px;
      cursor: pointer;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: bold;
      transition: border-color 0.2s, color 0.2s;
    `
    this.mobileMenuBtn.innerHTML = '&#9776;' // Hamburger icon (☰)
    this.mobileMenuBtn.setAttribute('aria-label', 'Open menu')
    this.mobileMenuBtn.onclick = () => this.toggleMobileMenu()

    // Hover/touch states - change to lighter gray (only when menu is closed)
    const setHoverState = () => {
      if (!this.mobileMenuOpen) {
        this.mobileMenuBtn.style.borderColor = '#5a5a70'
        this.mobileMenuBtn.style.color = '#b0b0c0'
      }
    }
    const resetState = () => {
      if (!this.mobileMenuOpen) {
        this.mobileMenuBtn.style.borderColor = '#3a3a50'
        this.mobileMenuBtn.style.color = '#9090a8'
      }
    }
    this.mobileMenuBtn.addEventListener('mouseenter', setHoverState)
    this.mobileMenuBtn.addEventListener('mouseleave', resetState)
    this.mobileMenuBtn.addEventListener('touchstart', setHoverState, { passive: true })
    this.mobileMenuBtn.addEventListener('touchend', resetState, { passive: true })

    document.body.appendChild(this.mobileMenuBtn)
  }

  /**
   * Create mobile room info overlay (top-left corner)
   * Shows user count and room ID directly on the scene
   */
  _createMobileRoomInfoOverlay() {
    this.mobileRoomInfoOverlay = document.createElement('div')
    this.mobileRoomInfoOverlay.className = 'mobile-room-info-overlay'
    // Unified style matching other UI elements
    this.mobileRoomInfoOverlay.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
      position: fixed;
      top: max(12px, env(safe-area-inset-top, 12px));
      left: max(12px, env(safe-area-inset-left, 12px));
      z-index: 1001;
      background: rgba(10, 10, 20, 0.55);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border-radius: 12px;
      padding: 8px 12px;
      border: 1px solid #3a3a50;
      color: #9090a8;
      font-family: var(--font-mono, 'JetBrains Mono', monospace);
      font-size: 12px;
    `
    this.mobileRoomInfoOverlay.innerHTML = `
      <span class="mobile-overlay-user-count" id="mobileOverlayUserCount">1 user</span>
      <span class="mobile-overlay-room-id" id="mobileOverlayRoomId">Room: connecting...</span>
    `

    // Accessibility attributes
    this.mobileRoomInfoOverlay.setAttribute('role', 'status')
    this.mobileRoomInfoOverlay.setAttribute('aria-live', 'polite')
    this.mobileRoomInfoOverlay.setAttribute('aria-label', 'Room information')

    document.body.appendChild(this.mobileRoomInfoOverlay)

    // Initial sync with main UI
    this._syncMobileOverlay()
  }

  /**
   * Sync mobile overlay with main UI state
   */
  _syncMobileOverlay() {
    const mobileUserCount = document.getElementById('mobileOverlayUserCount')
    const mobileRoomId = document.getElementById('mobileOverlayRoomId')
    const mainUserCount = document.getElementById('userCount')
    const mainRoomId = document.getElementById('roomId')

    if (mobileUserCount && mainUserCount) {
      mobileUserCount.textContent = mainUserCount.textContent
    }
    if (mobileRoomId && mainRoomId) {
      mobileRoomId.textContent = mainRoomId.textContent
    }
  }

  /**
   * Create mobile bottom sheet with all controls
   */
  _createMobileBottomSheet() {
    // Backdrop - force base styles for iPad (screen > 768px)
    this.mobileBackdrop = document.createElement('div')
    this.mobileBackdrop.className = 'mobile-menu-backdrop'
    this.mobileBackdrop.style.cssText = `
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `
    this.mobileBackdrop.onclick = () => this.closeMobileMenu()
    document.body.appendChild(this.mobileBackdrop)

    // Bottom sheet - force base styles for iPad (screen > 768px)
    // Unified style matching other UI elements
    this.mobileSheet = document.createElement('div')
    this.mobileSheet.className = 'mobile-bottom-sheet'
    this.mobileSheet.style.cssText = `
      display: block;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(10, 10, 20, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 20px 20px 0 0;
      border-top: 1px solid #3a3a50;
      padding: 20px;
      padding-bottom: max(20px, env(safe-area-inset-bottom, 20px));
      z-index: 1003;
      transform: translateY(100%);
      transition: transform 0.3s ease;
      max-height: 70vh;
      overflow-y: auto;
    `

    this.mobileSheet.innerHTML = `
      <div class="mobile-sheet-handle"></div>
      <div class="mobile-sheet-content">
        <div class="mobile-sheet-section">
          <a href="index.html" class="mobile-back-link">← Back to main page</a>
        </div>
        <div class="mobile-sheet-section" id="mobileAudioControls">
          <!-- Audio controls will be added here -->
        </div>
        <div class="mobile-sheet-section mobile-instructions">
          <div><strong>Tap</strong> for notes (hold longer for sustained tones)</div>
          <div><strong>Drag</strong> to create melodic phrases</div>
          <div><strong>Hover</strong> to modulate filters and effects</div>
        </div>
        <button class="mobile-close-btn" onclick="window.webarmoniumApp?.uiManager?.closeMobileMenu()">Close</button>
      </div>
    `

    document.body.appendChild(this.mobileSheet)

    // Create audio toggle button that directly calls app method
    const audioToggle = document.getElementById('audioToggle')
    if (audioToggle) {
      const mobileAudioBtn = document.createElement('button')
      mobileAudioBtn.id = 'mobileAudioToggle'
      mobileAudioBtn.className = audioToggle.className
      mobileAudioBtn.textContent = audioToggle.textContent
      // Directly call app method (clicking hidden elements unreliable)
      mobileAudioBtn.onclick = () => {
        if (window.webarmoniumApp?.toggleAudio) {
          window.webarmoniumApp.toggleAudio()
          // Update both buttons' text after toggle
          setTimeout(() => {
            mobileAudioBtn.textContent = audioToggle.textContent
          }, 100)
        }
      }
      document.getElementById('mobileAudioControls')?.appendChild(mobileAudioBtn)

      // Store reference for state sync
      this.mobileAudioBtn = mobileAudioBtn
      this.originalAudioToggle = audioToggle

      // Hide central start button if audio starts via menu or auto-start
      // Store observer reference for cleanup and use robust state check
      this.audioToggleObserver = new MutationObserver(() => {
        // Check actual audio state instead of relying on button text
        if (window.webarmoniumApp?.isAudioStarted) {
          this.hideMobileCentralStartButton()
          // Disconnect after triggering - no longer needed
          this.audioToggleObserver?.disconnect()
        }
      })
      this.audioToggleObserver.observe(audioToggle, { childList: true, characterData: true, subtree: true })
    }

    // Create volume slider that directly controls audio service
    const volumeContainer = document.createElement('div')
    volumeContainer.className = 'mobile-volume-control'
    volumeContainer.innerHTML = '<span class="mobile-volume-label">Volume</span>'

    const mobileVolumeSlider = document.createElement('input')
    mobileVolumeSlider.type = 'range'
    mobileVolumeSlider.id = 'mobileVolumeSlider'
    mobileVolumeSlider.min = '0'
    mobileVolumeSlider.max = '100'
    mobileVolumeSlider.step = '1'
    mobileVolumeSlider.value = '70' // Default 70%
    mobileVolumeSlider.className = 'mobile-volume-slider'

    // Directly control audio service volume
    mobileVolumeSlider.oninput = () => {
      const volume = parseInt(mobileVolumeSlider.value, 10) / 100 // Convert to 0-1
      if (window.webarmoniumApp?.audioService?.setVolume) {
        window.webarmoniumApp.audioService.setVolume(volume)
      }
    }

    volumeContainer.appendChild(mobileVolumeSlider)
    document.getElementById('mobileAudioControls')?.appendChild(volumeContainer)

    this.mobileVolumeSlider = mobileVolumeSlider

    // Entry #74: Create Settings button (replaces Low Power toggle)
    const settingsBtn = document.createElement('button')
    settingsBtn.id = 'mobileSettingsBtn'
    settingsBtn.className = 'mobile-settings-btn'
    settingsBtn.innerHTML = '&#9881; Settings' // Gear icon
    settingsBtn.onclick = () => this.openSettingsPanel()

    document.getElementById('mobileAudioControls')?.appendChild(settingsBtn)
    this.mobileSettingsBtn = settingsBtn
  }

  /**
   * Create central start button for mobile (visible until audio starts)
   * Button appears centered on screen and disappears when audio starts.
   * @private
   */
  _createMobileCentralStartButton() {
    // Prevent duplicate creation
    if (this.mobileCentralStartBtn || document.getElementById('mobileCentralStart')) {
      return
    }

    this.mobileCentralStartBtn = document.createElement('button')
    this.mobileCentralStartBtn.id = 'mobileCentralStart'
    this.mobileCentralStartBtn.className = 'mobile-central-start'
    // Unified style: transparent bg with gray border (like other UI elements)
    this.mobileCentralStartBtn.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1000;
      background: rgba(10, 10, 20, 0.55);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 2px solid #3a3a50;
      border-radius: 50%;
      width: 100px;
      height: 100px;
      font-size: 40px;
      color: #9090a8;
      cursor: pointer;
      transition: opacity 0.3s, transform 0.2s, border-color 0.2s, color 0.2s;
    `
    this.mobileCentralStartBtn.textContent = '▶'

    // Accessibility attributes
    this.mobileCentralStartBtn.setAttribute('aria-label', 'Start Audio')
    this.mobileCentralStartBtn.setAttribute('role', 'button')

    this.mobileCentralStartBtn.onclick = async () => {
      if (window.webarmoniumApp?.toggleAudio) {
        // Set loading state for accessibility
        this.mobileCentralStartBtn.setAttribute('aria-busy', 'true')
        this.mobileCentralStartBtn.style.pointerEvents = 'none'

        try {
          await window.webarmoniumApp.toggleAudio()
          this.hideMobileCentralStartButton()
        } catch (error) {
          // Reset button state on error so user can retry
          console.error('Failed to start audio:', error)
          this.mobileCentralStartBtn.setAttribute('aria-busy', 'false')
          this.mobileCentralStartBtn.style.pointerEvents = 'auto'
        }
      }
    }

    // Hover/touch states - change to lighter gray
    const setHoverState = () => {
      this.mobileCentralStartBtn.style.borderColor = '#5a5a70'
      this.mobileCentralStartBtn.style.color = '#b0b0c0'
    }
    const resetState = () => {
      this.mobileCentralStartBtn.style.borderColor = '#3a3a50'
      this.mobileCentralStartBtn.style.color = '#9090a8'
    }
    this.mobileCentralStartBtn.addEventListener('mouseenter', setHoverState)
    this.mobileCentralStartBtn.addEventListener('mouseleave', resetState)
    this.mobileCentralStartBtn.addEventListener('touchstart', setHoverState, { passive: true })
    this.mobileCentralStartBtn.addEventListener('touchend', resetState, { passive: true })

    document.body.appendChild(this.mobileCentralStartBtn)
  }

  /**
   * Hide and remove the central start button with fade animation
   * Safe to call multiple times - checks if button exists before removal
   * @public
   */
  hideMobileCentralStartButton() {
    if (this.mobileCentralStartBtn) {
      // Transfer focus to menu button before removing (accessibility)
      if (document.activeElement === this.mobileCentralStartBtn) {
        this.mobileMenuBtn?.focus()
      }

      this.mobileCentralStartBtn.style.opacity = '0'
      this.mobileCentralStartBtn.style.pointerEvents = 'none'

      // Store reference for cleanup in timeout
      const btnToRemove = this.mobileCentralStartBtn
      this.mobileCentralStartBtn = null

      setTimeout(() => {
        btnToRemove?.remove()
      }, 300)
    }

    // Disconnect observer if still active
    if (this.audioToggleObserver) {
      this.audioToggleObserver.disconnect()
      this.audioToggleObserver = null
    }

    // Sync mobile audio button text based on actual audio state
    if (this.mobileAudioBtn) {
      // Use audio state directly - more reliable than reading original toggle text
      const isPlaying = window.webarmoniumApp?.isAudioStarted
      this.mobileAudioBtn.textContent = isPlaying ? '⏸' : '▶'
      this.mobileAudioBtn.classList.toggle('playing', isPlaying)
    }
  }

  // ==========================================
  // Entry #74: Settings Panel Methods
  // ==========================================

  /**
   * Open the settings panel
   */
  openSettingsPanel () {
    // Close mobile menu if open
    if (this.mobileMenuOpen) {
      this.closeMobileMenu()
    }

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
   * Toggle mobile menu open/close
   */
  toggleMobileMenu() {
    if (this.mobileMenuOpen) {
      this.closeMobileMenu()
    } else {
      this.openMobileMenu()
    }
  }

  /**
   * Open mobile menu
   */
  openMobileMenu() {
    this.mobileMenuOpen = true
    this.mobileBackdrop?.classList.add('open')
    this.mobileSheet?.classList.add('open')
    this.mobileMenuBtn?.classList.add('open')
    // Set inline styles for iPad (CSS .open class inside media query doesn't apply)
    if (this.mobileBackdrop) {
      this.mobileBackdrop.style.opacity = '1'
      this.mobileBackdrop.style.pointerEvents = 'auto'
    }
    if (this.mobileSheet) {
      this.mobileSheet.style.transform = 'translateY(0)'
    }
    if (this.mobileMenuBtn) {
      // Accent border when open
      this.mobileMenuBtn.style.borderColor = '#2dd4bf'
      this.mobileMenuBtn.style.color = '#2dd4bf'
    }
    this.mobileMenuBtn.innerHTML = '&#10005;' // X icon
  }

  /**
   * Close mobile menu
   */
  closeMobileMenu() {
    this.mobileMenuOpen = false
    this.mobileBackdrop?.classList.remove('open')
    this.mobileSheet?.classList.remove('open')
    this.mobileMenuBtn?.classList.remove('open')
    // Reset inline styles
    if (this.mobileBackdrop) {
      this.mobileBackdrop.style.opacity = '0'
      this.mobileBackdrop.style.pointerEvents = 'none'
    }
    if (this.mobileSheet) {
      this.mobileSheet.style.transform = 'translateY(100%)'
    }
    if (this.mobileMenuBtn) {
      // Reset to default border color
      this.mobileMenuBtn.style.borderColor = '#3a3a50'
      this.mobileMenuBtn.style.color = '#9090a8'
    }
    this.mobileMenuBtn.innerHTML = '&#9776;' // Hamburger icon
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

    // Remove mobile elements
    if (this.mobileMenuBtn) {
      this.mobileMenuBtn.remove()
    }
    if (this.mobileBackdrop) {
      this.mobileBackdrop.remove()
    }
    if (this.mobileSheet) {
      this.mobileSheet.remove()
    }
    if (this.mobileRoomInfoOverlay) {
      this.mobileRoomInfoOverlay.remove()
      this.mobileRoomInfoOverlay = null
    }

    // Clean up mobile central start button
    if (this.mobileCentralStartBtn) {
      this.mobileCentralStartBtn.remove()
      this.mobileCentralStartBtn = null
    }

    // Disconnect MutationObserver
    if (this.audioToggleObserver) {
      this.audioToggleObserver.disconnect()
      this.audioToggleObserver = null
    }

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

    // Restore hidden elements
    const roomInterface = document.querySelector('.room-interface')
    const instructions = document.querySelector('.instructions')
    if (roomInterface) roomInterface.classList.remove('mobile-hidden')
    if (instructions) instructions.classList.remove('mobile-hidden')

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
