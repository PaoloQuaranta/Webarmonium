/**
 * MobileResourceManager
 * Entry #48: Automatic and manual resource management for mobile devices
 *
 * Extends the Windows Chrome pattern to all mobile platforms.
 * Provides four performance modes:
 * - full: Desktop, high-end devices
 * - balanced: Default for mobile
 * - lowPower: Manual user override
 * - critical: Battery saver active or thermal throttling
 */
class MobileResourceManager {
  static instance = null

  /**
   * Get singleton instance
   * @returns {MobileResourceManager}
   */
  static getInstance() {
    if (!MobileResourceManager.instance) {
      MobileResourceManager.instance = new MobileResourceManager()
    }
    return MobileResourceManager.instance
  }

  constructor() {
    // Performance modes
    this.modes = {
      FULL: 'full',           // Desktop, high-end devices
      BALANCED: 'balanced',   // Default mobile
      LOW_POWER: 'lowPower',  // Manual override or low battery
      CRITICAL: 'critical'    // Battery saver active or thermal throttling
    }

    // Current mode
    this.currentMode = this.modes.FULL
    this.manualOverride = false  // True if user manually set low power mode

    // Configuration per mode
    this.modeConfigs = {
      full: {
        targetFps: 30,
        particlesEnabled: true,
        nebulasEnabled: true,
        attractorsEnabled: true,
        maxPolyphony: 8,
        audioBufferSize: 'interactive',
        gestureThrottle: 16.67,  // 60fps input
        hoverThrottle: 50
      },
      balanced: {
        targetFps: 24,
        particlesEnabled: true,
        nebulasEnabled: true,
        attractorsEnabled: false,  // Disable expensive attractor system
        maxPolyphony: 6,
        audioBufferSize: 'balanced',
        gestureThrottle: 33,  // 30fps input
        hoverThrottle: 100
      },
      lowPower: {
        targetFps: 20,
        particlesEnabled: false,
        nebulasEnabled: true,  // Keep nebulas (less CPU than particles)
        attractorsEnabled: false,
        maxPolyphony: 4,
        audioBufferSize: 'playback',
        gestureThrottle: 50,  // 20fps input
        hoverThrottle: 150
      },
      critical: {
        targetFps: 15,
        particlesEnabled: false,
        nebulasEnabled: false,
        attractorsEnabled: false,
        maxPolyphony: 2,
        audioBufferSize: 'playback',
        gestureThrottle: 100,  // 10fps input
        hoverThrottle: 200
      }
    }

    // Callbacks for mode changes
    this.listeners = new Set()

    // Battery monitoring
    this.battery = null
    this.lowBatteryThreshold = 0.15  // 15%

    // FPS monitoring for adaptive degradation
    this.fpsHistory = []
    this.fpsCheckInterval = null

    // Bound handlers for proper cleanup
    this._boundCheckBattery = this._checkBattery.bind(this)
    this._boundVisibilityChange = this._handleVisibilityChange.bind(this)

    // Initialize
    this._initialize()
  }

  /**
   * Initialize the resource manager
   * @private
   */
  async _initialize() {
    // Determine initial mode based on platform
    if (!PlatformDetection.isMobile()) {
      this.currentMode = this.modes.FULL
    } else if (PlatformDetection.isAndroidChrome()) {
      // Android Chrome starts in balanced mode by default
      this.currentMode = this.modes.BALANCED
    } else {
      this.currentMode = this.modes.BALANCED
    }

    // Setup battery monitoring
    await this._setupBatteryMonitoring()

    // Setup FPS monitoring for adaptive degradation
    this._setupFpsMonitoring()

    // Apply initial mode
    this._applyMode()

  }

  /**
   * Setup battery level monitoring
   * @private
   */
  async _setupBatteryMonitoring() {
    if (!('getBattery' in navigator)) {
      return
    }

    try {
      this.battery = await navigator.getBattery()

      // Use bound handlers for proper cleanup in destroy()
      this.battery.addEventListener('levelchange', this._boundCheckBattery)
      this.battery.addEventListener('chargingchange', this._boundCheckBattery)

      this._checkBattery()
    } catch (e) {
    }
  }

  /**
   * Check battery level and adjust mode if needed
   * @private
   */
  _checkBattery() {
    if (!this.battery || this.manualOverride) {
      return
    }

    const isLow = this.battery.level < this.lowBatteryThreshold && !this.battery.charging

    if (isLow && this.currentMode !== this.modes.CRITICAL) {
      this.setMode(this.modes.CRITICAL)
    } else if (!isLow && this.currentMode === this.modes.CRITICAL) {
      // Recover from critical if battery is ok now
      this.setMode(PlatformDetection.isMobile() ? this.modes.BALANCED : this.modes.FULL)
    }
  }

  /**
   * Setup FPS monitoring for adaptive performance degradation
   * @private
   */
  _setupFpsMonitoring() {
    // Check FPS every 5 seconds
    this.fpsCheckInterval = setInterval(() => {
      this._checkFps()
    }, 5000)

    // Pause monitoring when page is hidden (battery saving)
    document.addEventListener('visibilitychange', this._boundVisibilityChange)
  }

  /**
   * Handle page visibility change - pause/resume FPS monitoring
   * @private
   */
  _handleVisibilityChange() {
    if (document.hidden) {
      // Page is hidden - pause FPS monitoring
      if (this.fpsCheckInterval) {
        clearInterval(this.fpsCheckInterval)
        this.fpsCheckInterval = null
      }
    } else {
      // Page is visible - resume FPS monitoring
      if (!this.fpsCheckInterval) {
        this.fpsCheckInterval = setInterval(() => {
          this._checkFps()
        }, 5000)
      }
    }
  }

  /**
   * Check current FPS and adapt mode if needed
   * @private
   */
  _checkFps() {
    if (this.manualOverride) {
      return
    }

    // Get FPS from visual service or unified update loop
    const currentFps = window.visualService?.fps ||
                       (typeof UnifiedUpdateLoop !== 'undefined' ? UnifiedUpdateLoop.getInstance().getFps() : null) ||
                       30

    this.fpsHistory.push(currentFps)
    if (this.fpsHistory.length > 6) {
      this.fpsHistory.shift()  // Keep 30s of data
    }

    const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length

    // Adaptive degradation
    const config = this.modeConfigs[this.currentMode]

    if (avgFps < config.targetFps * 0.6) {
      // Significant frame drops - degrade
      if (this.currentMode === this.modes.FULL) {
        this.setMode(this.modes.BALANCED)
      } else if (this.currentMode === this.modes.BALANCED) {
        this.setMode(this.modes.LOW_POWER)
      }
    } else if (avgFps > config.targetFps * 0.9 && !PlatformDetection.isMobile()) {
      // Good performance on desktop - try to upgrade
      if (this.currentMode === this.modes.LOW_POWER) {
        this.setMode(this.modes.BALANCED)
      } else if (this.currentMode === this.modes.BALANCED) {
        this.setMode(this.modes.FULL)
      }
    }
  }

  /**
   * Set performance mode
   * @param {string} mode - Mode from this.modes
   * @param {boolean} manual - True if user manually set this
   */
  setMode(mode, manual = false) {
    if (!this.modeConfigs[mode]) {
      return
    }

    const previousMode = this.currentMode
    this.currentMode = mode
    this.manualOverride = manual

    this._applyMode()
    this._notifyListeners()

  }

  /**
   * Toggle Low Power Mode (for UI button)
   * @returns {boolean} Whether low power mode is now active
   */
  toggleLowPowerMode() {
    if (this.manualOverride && this.currentMode === this.modes.LOW_POWER) {
      // Turn off low power mode
      this.setMode(PlatformDetection.isMobile() ? this.modes.BALANCED : this.modes.FULL, false)
    } else {
      // Turn on low power mode
      this.setMode(this.modes.LOW_POWER, true)
    }

    return this.currentMode === this.modes.LOW_POWER
  }

  /**
   * Apply current mode configuration to services
   * @private
   */
  _applyMode() {
    const config = this.modeConfigs[this.currentMode]

    // Apply to visual service if available
    if (window.visualService) {
      window.visualService.targetFps = config.targetFps

      // Control subsystem rendering
      if (window.visualService.particles) {
        window.visualService.particles.enabled = config.particlesEnabled
      }
      if (window.visualService.nebulas) {
        window.visualService.nebulas.enabled = config.nebulasEnabled
        // Disable gradient in lowPower and critical modes (same threshold as particles)
        if (window.visualService.nebulas.setGradientEnabled) {
          window.visualService.nebulas.setGradientEnabled(config.particlesEnabled)
        }
      }
      if (window.visualService.attractors) {
        window.visualService.attractors.enabled = config.attractorsEnabled
      }

      // Set performance mode string for compatibility with existing code
      window.visualService.performanceMode =
        config.particlesEnabled ? 'normal' :
        config.nebulasEnabled ? 'degraded' : 'disabled'
    }

    // Store current config for other services to query
    this.gestureThrottle = config.gestureThrottle
    this.hoverThrottle = config.hoverThrottle
    this.maxPolyphony = config.maxPolyphony
  }

  /**
   * Notify all listeners of mode change
   * @private
   */
  _notifyListeners() {
    const config = this.modeConfigs[this.currentMode]
    this.listeners.forEach(cb => {
      try {
        cb(this.currentMode, config)
      } catch (e) {
        console.error('MobileResourceManager: Listener error:', e)
      }
    })
  }

  /**
   * Add mode change listener
   * @param {Function} callback - Called with (mode, config)
   */
  addListener(callback) {
    this.listeners.add(callback)
  }

  /**
   * Remove mode change listener
   * @param {Function} callback
   */
  removeListener(callback) {
    this.listeners.delete(callback)
  }

  /**
   * Get current mode configuration
   * @returns {Object} Current mode config
   */
  getConfig() {
    return { ...this.modeConfigs[this.currentMode] }
  }

  /**
   * Get current mode name
   * @returns {string}
   */
  getMode() {
    return this.currentMode
  }

  /**
   * Check if in low power mode (either lowPower or critical)
   * @returns {boolean}
   */
  isLowPowerMode() {
    return this.currentMode === this.modes.LOW_POWER ||
           this.currentMode === this.modes.CRITICAL
  }

  /**
   * Check if manual override is active
   * @returns {boolean}
   */
  isManualOverride() {
    return this.manualOverride
  }

  /**
   * Cleanup
   */
  destroy() {
    // Clear FPS monitoring interval
    if (this.fpsCheckInterval) {
      clearInterval(this.fpsCheckInterval)
      this.fpsCheckInterval = null
    }

    // Remove visibility change listener
    document.removeEventListener('visibilitychange', this._boundVisibilityChange)

    // Remove battery event listeners
    if (this.battery) {
      this.battery.removeEventListener('levelchange', this._boundCheckBattery)
      this.battery.removeEventListener('chargingchange', this._boundCheckBattery)
      this.battery = null
    }

    // Clear mode change listeners
    this.listeners.clear()

    // Reset singleton
    MobileResourceManager.instance = null
  }
}

// Export for ES modules and expose on window for script tag usage
if (typeof window !== 'undefined') {
  window.MobileResourceManager = MobileResourceManager
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MobileResourceManager
}
