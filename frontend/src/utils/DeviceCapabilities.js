/**
 * DeviceCapabilities.js
 *
 * Detects device hardware capabilities and determines performance tier
 * for adaptive audio/visual configuration.
 *
 * Entry #73: Device-Adaptive Audio Architecture
 */

class DeviceCapabilities {
  static _cache = null
  static _tierCache = null
  static _cacheTimestamp = null
  static CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes - allows re-detection on battery/performance changes

  /**
   * Check if cache is still valid
   * @returns {boolean} True if cache is valid
   */
  static _isCacheValid () {
    if (!this._cacheTimestamp) return false
    return (Date.now() - this._cacheTimestamp) < this.CACHE_TTL_MS
  }

  /**
   * Detect all device capabilities
   * @returns {Object} Device capability information
   */
  static detect () {
    // Return cached result if still valid
    if (this._cache && this._isCacheValid()) return this._cache

    const capabilities = {
      cpuCores: this._getCpuCores(),
      memoryGB: this._getMemoryGB(),
      isLowEndGPU: this._detectLowEndGPU(),
      isMobile: this._isMobile(),
      androidVersion: this._getAndroidVersion(),
      iosVersion: this._getIOSVersion(),
      connectionType: this._getConnectionType(),
      tier: null // Calculated after other properties
    }

    capabilities.tier = this._calculateTier(capabilities)
    this._cache = capabilities
    this._cacheTimestamp = Date.now()

    return capabilities
  }

  /**
   * Get the device tier for quick access
   * @returns {'high'|'medium'|'low'|'ultra-low'} Device tier
   */
  static getTier () {
    // Check cache validity - tier cache depends on main cache
    if (this._tierCache && this._isCacheValid()) return this._tierCache
    this._tierCache = this.detect().tier
    return this._tierCache
  }

  /**
   * Check if device is in low power category (low or ultra-low)
   * @returns {boolean}
   */
  static isLowPowerDevice () {
    const tier = this.getTier()
    return tier === 'low' || tier === 'ultra-low'
  }

  /**
   * Get number of logical CPU cores
   * @returns {number} CPU core count (defaults to 2 if unavailable)
   */
  static _getCpuCores () {
    return navigator.hardwareConcurrency || 2
  }

  /**
   * Get device memory in GB
   * @returns {number} Memory in GB (defaults to 2 if unavailable)
   */
  static _getMemoryGB () {
    // navigator.deviceMemory is only available in Chrome and some browsers
    // Returns approximate RAM in GB (0.25, 0.5, 1, 2, 4, 8)
    return navigator.deviceMemory || 2
  }

  /**
   * Detect if GPU is low-end based on WebGL capabilities
   * @returns {boolean} True if GPU appears to be low-end
   */
  static _detectLowEndGPU () {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')

      if (!gl) return true // No WebGL = definitely low-end

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      if (!debugInfo) return false // Can't determine, assume OK

      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase()

      // Known low-end GPU patterns
      const lowEndPatterns = [
        'mali-4', 'mali-t', 'mali t',
        'adreno 3', 'adreno 4',
        'powervr sgx',
        'intel hd graphics 4',
        'intel hd graphics 3',
        'swiftshader', // Software renderer
        'llvmpipe', // Software renderer
        'software'
      ]

      return lowEndPatterns.some(pattern => renderer.includes(pattern))
    } catch (e) {
      return false
    }
  }

  /**
   * Check if device is mobile
   * @returns {boolean}
   */
  static _isMobile () {
    const ua = navigator.userAgent || ''
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS
  }

  /**
   * Get Android version number
   * @returns {number|null} Android version or null if not Android
   */
  static _getAndroidVersion () {
    const ua = navigator.userAgent || ''
    const match = ua.match(/Android\s+([\d.]+)/)
    if (match) {
      return parseFloat(match[1])
    }
    return null
  }

  /**
   * Get iOS version number
   * @returns {number|null} iOS version or null if not iOS
   */
  static _getIOSVersion () {
    const ua = navigator.userAgent || ''
    const match = ua.match(/OS\s+([\d_]+)/)
    if (match && (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod'))) {
      return parseFloat(match[1].replace('_', '.'))
    }
    return null
  }

  /**
   * Get network connection type if available
   * @returns {string|null} Connection type (4g, 3g, 2g, slow-2g, etc.)
   */
  static _getConnectionType () {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (connection) {
      return connection.effectiveType || null
    }
    return null
  }

  /**
   * Calculate device tier based on capabilities
   * Entry #73 FIX: Adjusted thresholds to be less aggressive
   * - Modern phones often have 4-8 cores, <= 3 misclassified too many devices
   * - Android version < 10 was too aggressive (many Android 10+ phones are capable)
   * - Now uses combined scoring for better accuracy
   * @param {Object} capabilities - Device capabilities object
   * @returns {'high'|'medium'|'low'|'ultra-low'} Device tier
   */
  static _calculateTier (capabilities) {
    const { cpuCores, memoryGB, isLowEndGPU, isMobile, androidVersion, connectionType } = capabilities

    // Ultra-Low tier criteria (any of these) - truly old/limited devices
    if (
      cpuCores < 2 ||
      memoryGB < 2 ||
      (androidVersion !== null && androidVersion < 7) || // Android 7 or older
      connectionType === '2g' ||
      connectionType === 'slow-2g'
    ) {
      return 'ultra-low'
    }

    // Use scoring system for better classification
    let lowScore = 0

    // CPU scoring (most phones now have 4+ cores)
    if (cpuCores <= 2) lowScore += 2
    else if (cpuCores <= 4) lowScore += 1

    // Memory scoring
    if (memoryGB <= 2) lowScore += 2
    else if (memoryGB <= 4) lowScore += 1

    // GPU scoring
    if (isLowEndGPU) lowScore += 2

    // Old Android (but not ultra-old)
    if (androidVersion !== null && androidVersion < 9) lowScore += 1

    // Slow connection
    if (connectionType === '3g') lowScore += 1

    // Low tier: combined factors indicate limited device
    if (lowScore >= 3) {
      return 'low'
    }

    // High tier criteria - desktop with good specs
    if (
      cpuCores >= 8 &&
      memoryGB >= 8 &&
      !isLowEndGPU &&
      !isMobile
    ) {
      return 'high'
    }

    // Default to medium
    return 'medium'
  }

  /**
   * Get audio profile based on device tier
   * @returns {Object} Audio configuration profile
   */
  static getAudioProfile () {
    const tier = this.getTier()

    const profiles = {
      'high': {
        lookAhead: 0.1,           // 100ms
        updateInterval: 0.025,    // 25ms
        sampleRate: 48000,
        filterUpdateRate: 30,     // Hz
        maxPolyphony: 8,
        backgroundLayers: ['bass', 'pad', 'chords'],
        useAmbientFilters: true,
        synthComplexity: 'full'
      },
      'medium': {
        lookAhead: 0.2,           // 200ms
        updateInterval: 0.05,     // 50ms
        sampleRate: 44100,
        filterUpdateRate: 20,     // Hz
        maxPolyphony: 4,
        backgroundLayers: ['bass', 'pad'],
        useAmbientFilters: true,
        synthComplexity: 'simplified'
      },
      'low': {
        lookAhead: 0.3,           // 300ms
        updateInterval: 0.1,      // 100ms
        sampleRate: 44100,
        filterUpdateRate: 10,     // Hz
        maxPolyphony: 2,
        backgroundLayers: ['bass'],
        useAmbientFilters: false,
        synthComplexity: 'minimal'
      },
      'ultra-low': {
        lookAhead: 0.5,           // 500ms
        updateInterval: 0.2,      // 200ms
        sampleRate: 22050,
        filterUpdateRate: 5,      // Hz
        maxPolyphony: 1,
        backgroundLayers: [],     // No background
        useAmbientFilters: false,
        synthComplexity: 'mono-sine'
      }
    }

    return profiles[tier] || profiles['medium']
  }

  /**
   * Entry #90: Get graphics profile based on device tier
   * @returns {Object} Graphics configuration profile
   */
  static getGraphicsProfile () {
    const tier = this.getTier()

    const profiles = {
      'high': {
        shadowBlur: true,
        particleCount: 120,
        attractorPoints: 1200,
        pulseGlow: true,
        cascadeEnabled: true
      },
      'medium': {
        shadowBlur: true,
        particleCount: 80,
        attractorPoints: 800,
        pulseGlow: true,
        cascadeEnabled: true
      },
      'low': {
        shadowBlur: false,
        particleCount: 50,
        attractorPoints: 500,
        pulseGlow: false,
        cascadeEnabled: true
      },
      'ultra-low': {
        shadowBlur: false,
        particleCount: 30,
        attractorPoints: 300,
        pulseGlow: false,
        cascadeEnabled: false
      }
    }

    const profile = profiles[tier] || profiles['medium']
    return { ...profile, tier, source: 'device-capabilities' }
  }

  /**
   * Clear cached values (for testing or when device state changes)
   */
  static clearCache () {
    this._cache = null
    this._tierCache = null
    this._cacheTimestamp = null
  }

  /**
   * Set up visibility change listener to invalidate cache when page becomes visible
   * This handles cases where device capabilities might change while page is hidden
   * (e.g., battery saver mode activation)
   */
  static _setupVisibilityListener () {
    if (typeof document === 'undefined') return
    if (this._visibilityListenerAttached) return

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        // Clear cache when page becomes visible again
        // This forces re-detection which may pick up changed device state
        this.clearCache()
      }
    })
    this._visibilityListenerAttached = true
  }
}

// Set up visibility listener when module loads
DeviceCapabilities._setupVisibilityListener()

// Export for both module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeviceCapabilities
}
if (typeof window !== 'undefined') {
  window.DeviceCapabilities = DeviceCapabilities
}
