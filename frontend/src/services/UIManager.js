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
    this.controlsToggleBtn = null
    this.instructionsToggleBtn = null
    this.isInteractingWithControls = false

    // Constants
    this.AUTO_HIDE_DELAY = 5000 // 5 seconds
    this.EDGE_ZONE_SIZE = 80 // pixels from edge to trigger show (desktop only)

    // Mobile state
    this.isMobile = false
    this.mobileMenuOpen = false
    this.mobileMenuBtn = null
    this.mobileBackdrop = null
    this.mobileSheet = null
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
      let displayText = `👥 ${this.userCount} ${userText}`

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

    console.log(`✅ UIManager: Collapsible UI initialized (${this.isMobile ? 'mobile' : 'desktop'} mode)`)
  }

  /**
   * Setup desktop UI with edge detection and toggle buttons
   */
  _setupDesktopUI() {
    this._createDesktopToggleButtons()
    this._setupAutoHide()
    this._setupEdgeDetection()
    this._setupControlsInteraction()
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
  }

  /**
   * Create mobile menu button (hamburger)
   */
  _createMobileMenuButton() {
    this.mobileMenuBtn = document.createElement('button')
    this.mobileMenuBtn.className = 'mobile-menu-btn'
    this.mobileMenuBtn.innerHTML = '&#9776;' // Hamburger icon (☰)
    this.mobileMenuBtn.setAttribute('aria-label', 'Open menu')
    this.mobileMenuBtn.onclick = () => this.toggleMobileMenu()
    document.body.appendChild(this.mobileMenuBtn)
  }

  /**
   * Create mobile bottom sheet with all controls
   */
  _createMobileBottomSheet() {
    // Backdrop
    this.mobileBackdrop = document.createElement('div')
    this.mobileBackdrop.className = 'mobile-menu-backdrop'
    this.mobileBackdrop.onclick = () => this.closeMobileMenu()
    document.body.appendChild(this.mobileBackdrop)

    // Bottom sheet
    this.mobileSheet = document.createElement('div')
    this.mobileSheet.className = 'mobile-bottom-sheet'

    // Get content from original elements
    const roomInterface = document.querySelector('.room-interface')
    const instructions = document.querySelector('.instructions')

    this.mobileSheet.innerHTML = `
      <div class="mobile-sheet-handle"></div>
      <div class="mobile-sheet-content">
        <div class="mobile-sheet-section">
          <div class="mobile-sheet-row">
            <span class="mobile-user-count" id="mobileUserCount">👥 1 user</span>
            <span class="mobile-room-id" id="mobileRoomId">Room: connecting...</span>
          </div>
        </div>
        <div class="mobile-sheet-section">
          <a href="index.html" class="mobile-back-link">← Back to main page</a>
        </div>
        <div class="mobile-sheet-section" id="mobileAudioControls">
          <!-- Audio controls will be cloned here -->
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

    // Clone audio toggle button
    const audioToggle = document.getElementById('audioToggle')
    if (audioToggle) {
      const clone = audioToggle.cloneNode(true)
      clone.id = 'mobileAudioToggle'
      // Copy onclick handler
      clone.onclick = audioToggle.onclick
      document.getElementById('mobileAudioControls')?.appendChild(clone)
    }

    // Clone dynamic audio controls container
    const audioControls = document.getElementById('audio-controls')
    if (audioControls) {
      const clone = audioControls.cloneNode(true)
      clone.id = 'mobileAudioControlsContainer'
      document.getElementById('mobileAudioControls')?.appendChild(clone)
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
    this.mobileMenuBtn.innerHTML = '&#10005;' // X icon

    // Sync user count and room ID
    this._syncMobileDisplay()
  }

  /**
   * Close mobile menu
   */
  closeMobileMenu() {
    this.mobileMenuOpen = false
    this.mobileBackdrop?.classList.remove('open')
    this.mobileSheet?.classList.remove('open')
    this.mobileMenuBtn?.classList.remove('open')
    this.mobileMenuBtn.innerHTML = '&#9776;' // Hamburger icon
  }

  /**
   * Sync mobile display with main UI state
   */
  _syncMobileDisplay() {
    const mobileUserCount = document.getElementById('mobileUserCount')
    const mobileRoomId = document.getElementById('mobileRoomId')
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
   * Create desktop toggle buttons
   */
  _createDesktopToggleButtons() {
    // Controls toggle (top-right) - chevron
    this.controlsToggleBtn = document.createElement('button')
    this.controlsToggleBtn.className = 'ui-toggle-btn ui-toggle-controls expanded'
    this.controlsToggleBtn.innerHTML = '&#9660;' // Down chevron (▼) when expanded
    this.controlsToggleBtn.setAttribute('aria-label', 'Toggle controls')
    this.controlsToggleBtn.onclick = () => this.toggleControls()
    document.body.appendChild(this.controlsToggleBtn)

    // Instructions toggle (bottom-center) - info icon
    this.instructionsToggleBtn = document.createElement('button')
    this.instructionsToggleBtn.className = 'ui-toggle-btn ui-toggle-instructions'
    this.instructionsToggleBtn.innerHTML = 'i' // Info icon
    this.instructionsToggleBtn.setAttribute('aria-label', 'Toggle instructions')
    this.instructionsToggleBtn.onclick = () => this.toggleInstructions()
    document.body.appendChild(this.instructionsToggleBtn)
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
    this._updateToggleButton('controls')
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
    this._updateToggleButton('controls')
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
    this._updateToggleButton('instructions')
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
    this._updateToggleButton('instructions')
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
   * Update toggle button appearance based on state (desktop only)
   */
  _updateToggleButton(which) {
    if (which === 'controls' && this.controlsToggleBtn) {
      if (this.controlsVisible) {
        this.controlsToggleBtn.innerHTML = '&#9660;' // Down chevron
        this.controlsToggleBtn.classList.add('expanded')
      } else {
        this.controlsToggleBtn.innerHTML = '&#9650;' // Up chevron
        this.controlsToggleBtn.classList.remove('expanded')
      }
    }

    if (which === 'instructions' && this.instructionsToggleBtn) {
      if (this.instructionsVisible) {
        this.instructionsToggleBtn.innerHTML = '&#10005;' // X to close
      } else {
        this.instructionsToggleBtn.innerHTML = 'i' // Info icon
      }
    }
  }

  /**
   * Check if current device is mobile (screen size + touch)
   * More reliable than just touch detection (laptops have touch too)
   */
  _isMobileDevice() {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    const isSmallScreen = window.innerWidth <= 768
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

    return (hasTouch && isSmallScreen) || isMobileUA
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

    // Remove desktop toggle buttons
    if (this.controlsToggleBtn) {
      this.controlsToggleBtn.remove()
    }
    if (this.instructionsToggleBtn) {
      this.instructionsToggleBtn.remove()
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
