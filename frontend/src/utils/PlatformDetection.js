/**
 * PlatformDetection - Shared utility for platform detection
 * Entry #46 FIX: Centralized platform detection to eliminate code duplication
 * Entry #48 FIX: Extended for mobile/Android/iOS detection and audio optimization
 *
 * Used by AudioService and EnhancedGestureCapture for performance optimizations
 */
class PlatformDetection {
  static _cache = null
  static _mobileCache = null
  static _androidCache = null
  static _iosCache = null
  static _androidVersionCache = null

  /**
   * Detect if running on Windows Chrome
   * Windows Chrome has higher audio latency and needs larger buffers to prevent glitches
   * @returns {boolean} True if running on Windows Chrome
   */
  static isWindowsChrome() {
    // Cache the result since UA doesn't change during session
    if (PlatformDetection._cache !== null) {
      return PlatformDetection._cache
    }

    try {
      const ua = navigator.userAgent || ''
      const isWindows = ua.includes('Windows') || (navigator.platform?.includes('Win') ?? false)
      // Exclude Edge (Edg) and Opera (OPR) which are Chromium-based but have different audio characteristics
      const isChrome = ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')
      PlatformDetection._cache = isWindows && isChrome
    } catch (e) {
      // Fallback to false if detection fails (e.g., in test environments)
      console.warn('PlatformDetection: Unable to detect platform, defaulting to non-Windows-Chrome')
      PlatformDetection._cache = false
    }

    return PlatformDetection._cache
  }

  /**
   * Detect if running on a touch device
   * @returns {boolean} True if touch device
   */
  static isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  }

  /**
   * Get device pixel ratio (for DPI-aware calculations)
   * @returns {number} Device pixel ratio (minimum 1)
   */
  static getDevicePixelRatio() {
    return Math.max(1, window.devicePixelRatio || 1)
  }

  /**
   * Detect if running on a mobile device
   * @returns {boolean} True if mobile device
   */
  static isMobile() {
    if (PlatformDetection._mobileCache !== null) {
      return PlatformDetection._mobileCache
    }

    try {
      const ua = navigator.userAgent || ''
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const smallScreen = window.innerWidth <= 768
      PlatformDetection._mobileCache = isMobileUA || (hasTouch && smallScreen)
    } catch (e) {
      PlatformDetection._mobileCache = false
    }

    return PlatformDetection._mobileCache
  }

  /**
   * Detect if running on Android
   * @returns {boolean} True if Android
   */
  static isAndroid() {
    if (PlatformDetection._androidCache !== null) {
      return PlatformDetection._androidCache
    }

    try {
      PlatformDetection._androidCache = /Android/i.test(navigator.userAgent || '')
    } catch (e) {
      PlatformDetection._androidCache = false
    }

    return PlatformDetection._androidCache
  }

  /**
   * Detect if running on Android Chrome (most problematic for audio)
   * @returns {boolean} True if Android Chrome
   */
  static isAndroidChrome() {
    return PlatformDetection.isAndroid() && /Chrome/i.test(navigator.userAgent || '')
  }

  /**
   * Detect if running on iOS
   * @returns {boolean} True if iOS
   */
  static isIOS() {
    if (PlatformDetection._iosCache !== null) {
      return PlatformDetection._iosCache
    }

    try {
      const ua = navigator.userAgent || ''
      // Also check for iPadOS 13+ which reports as Mac
      PlatformDetection._iosCache = /iPhone|iPad|iPod/i.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    } catch (e) {
      PlatformDetection._iosCache = false
    }

    return PlatformDetection._iosCache
  }

  /**
   * Get Android version (e.g., 13 for Android 13)
   * @returns {number|null} Android version or null if not Android
   */
  static getAndroidVersion() {
    if (PlatformDetection._androidVersionCache !== null) {
      return PlatformDetection._androidVersionCache
    }

    if (!PlatformDetection.isAndroid()) {
      PlatformDetection._androidVersionCache = null
      return null
    }

    try {
      const match = navigator.userAgent.match(/Android\s+(\d+(\.\d+)?)/i)
      PlatformDetection._androidVersionCache = match ? parseFloat(match[1]) : null
    } catch (e) {
      PlatformDetection._androidVersionCache = null
    }

    return PlatformDetection._androidVersionCache
  }

  /**
   * Check if device has gyroscope/accelerometer support
   * @returns {boolean} True if DeviceOrientationEvent is available
   */
  static hasDeviceOrientation() {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window
  }

  /**
   * Check if DeviceOrientationEvent requires permission (iOS 13+)
   * @returns {boolean} True if permission request is needed
   */
  static requiresOrientationPermission() {
    return typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
  }

  /**
   * Get recommended audio latency hint based on platform
   * @returns {string} 'playback' | 'balanced' | 'interactive'
   */
  static getAudioLatencyHint() {
    if (PlatformDetection.isAndroidChrome()) {
      return 'playback' // Most conservative for Android Chrome
    }
    if (PlatformDetection.isWindowsChrome()) {
      return 'playback' // Already implemented
    }
    if (PlatformDetection.isMobile()) {
      return 'balanced' // Reasonable for other mobile
    }
    return 'interactive' // Best responsiveness on desktop
  }

  /**
   * Get recommended Tone.js lookAhead based on platform
   * @returns {number} lookAhead in seconds
   */
  static getAudioLookAhead() {
    if (PlatformDetection.isAndroidChrome()) {
      return 0.2 // 200ms for Android Chrome
    }
    if (PlatformDetection.isWindowsChrome()) {
      return 0.15 // 150ms already set
    }
    if (PlatformDetection.isMobile()) {
      return 0.12 // 120ms for other mobile
    }
    return 0.1 // 100ms default
  }

  /**
   * Clear all cached values (useful for testing)
   */
  static clearCache() {
    PlatformDetection._cache = null
    PlatformDetection._mobileCache = null
    PlatformDetection._androidCache = null
    PlatformDetection._iosCache = null
    PlatformDetection._androidVersionCache = null
  }
}

// Export for ES modules and expose on window for script tag usage
if (typeof window !== 'undefined') {
  window.PlatformDetection = PlatformDetection
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlatformDetection
}
