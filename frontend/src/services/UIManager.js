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
      userCountEl.textContent = `👥 ${this.userCount} ${userText}`
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

    console.log('✅ UIManager: App displayed, loading screen hidden')
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

    console.error('❌ UIManager: Error displayed:', message)
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
   * Cleanup (no-op for now, but provided for consistency)
   */
  destroy() {
    this.currentRoom = null
    this.userCount = 1
    console.log('✅ UIManager: Cleaned up')
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
