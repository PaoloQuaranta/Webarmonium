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
    this.BRIEF_SHOW_DELAY = 3000 // 3 seconds for tap-to-show
    this.EDGE_ZONE_SIZE = 100 // pixels from edge to trigger show
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
  // Entry #52: Collapsible UI Methods
  // ==========================================

  /**
   * Initialize collapsible UI system
   * Should be called after DOM is ready
   */
  initCollapsibleUI() {
    this._createToggleButtons()
    this._setupAutoHide()
    this._setupEdgeDetection()
    this._setupControlsInteraction()
    this._setupCanvasTapHandler()
    console.log('✅ UIManager: Collapsible UI initialized')
  }

  /**
   * Create toggle buttons for controls and instructions
   */
  _createToggleButtons() {
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
    // Only setup for non-touch devices
    if (this._isTouchDevice()) return

    // Bound handler for cleanup
    this._boundEdgeHandler = (e) => this._handleEdgeDetection(e)
    document.addEventListener('mousemove', this._boundEdgeHandler)
  }

  /**
   * Handle mouse position for edge zone detection
   */
  _handleEdgeDetection(e) {
    const y = e.clientY

    // Top edge zone - show controls
    if (y < this.EDGE_ZONE_SIZE) {
      if (!this.controlsVisible) {
        this.showControls()
        this.resetAutoHideTimer()
      }
    }

    // Bottom edge zone - show instructions
    if (y > window.innerHeight - this.EDGE_ZONE_SIZE) {
      if (!this.instructionsVisible) {
        this.showInstructions()
        this.resetAutoHideTimer()
      }
    }
  }

  /**
   * Setup interaction detection on controls
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
      // Touch equivalent
      roomInterface.addEventListener('touchstart', () => {
        this.isInteractingWithControls = true
        clearTimeout(this.autoHideTimeout)
      })
      roomInterface.addEventListener('touchend', () => {
        // Small delay before allowing auto-hide again
        setTimeout(() => {
          this.isInteractingWithControls = false
          this.resetAutoHideTimer()
        }, 500)
      })
    }
  }

  /**
   * Setup canvas tap handler for mobile
   * Tapping the canvas briefly shows UI
   */
  _setupCanvasTapHandler() {
    // Only for touch devices
    if (!this._isTouchDevice()) return

    const canvas = document.getElementById('gestureCanvas')
    if (!canvas) return

    // Bound handler for cleanup
    this._boundCanvasTapHandler = (e) => {
      // Only trigger if UI is hidden and tap is not on toggle buttons
      if (!this.controlsVisible || !this.instructionsVisible) {
        // Don't trigger if touching controls or toggle buttons
        const target = e.target
        if (target.closest('.room-interface') ||
            target.closest('.instructions') ||
            target.closest('.ui-toggle-btn')) {
          return
        }

        this.brieflyShowUI()
      }
    }

    canvas.addEventListener('touchstart', this._boundCanvasTapHandler, { passive: true })
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
   * Briefly show UI (for tap-to-show on mobile)
   * Shows for BRIEF_SHOW_DELAY then hides
   */
  brieflyShowUI() {
    this.showAllUI()
    clearTimeout(this.autoHideTimeout)
    this.autoHideTimeout = setTimeout(() => {
      this.hideAllUI()
    }, this.BRIEF_SHOW_DELAY)
  }

  /**
   * Update toggle button appearance based on state
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
   * Check if current device is touch-enabled
   */
  _isTouchDevice() {
    return 'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0
  }

  /**
   * Cleanup (no-op for now, but provided for consistency)
   */
  destroy() {
    // Clear timers
    clearTimeout(this.autoHideTimeout)

    // Remove event listeners
    if (this._boundEdgeHandler) {
      document.removeEventListener('mousemove', this._boundEdgeHandler)
    }

    // Remove canvas tap handler
    if (this._boundCanvasTapHandler) {
      const canvas = document.getElementById('gestureCanvas')
      if (canvas) {
        canvas.removeEventListener('touchstart', this._boundCanvasTapHandler)
      }
    }

    // Remove toggle buttons
    if (this.controlsToggleBtn) {
      this.controlsToggleBtn.remove()
    }
    if (this.instructionsToggleBtn) {
      this.instructionsToggleBtn.remove()
    }

    this.currentRoom = null
    this.userCount = 1
    // console.log('✅ UIManager: Cleaned up')
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
