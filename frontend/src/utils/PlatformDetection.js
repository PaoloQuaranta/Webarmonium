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
  static _windowsBrowserCache = null

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
   * Detect if running on Windows with ANY Chromium-based browser (Chrome, Edge, Opera, Brave)
   * Entry #56 FIX: Windows audio drivers (WASAPI) have high baseline latency across all browsers
   * Edge was previously excluded, causing audio dropouts for Edge users
   * @returns {boolean} True if running on Windows with a Chromium-based browser
   */
  static isWindowsBrowser() {
    if (PlatformDetection._windowsBrowserCache !== null) {
      return PlatformDetection._windowsBrowserCache
    }

    try {
      const ua = navigator.userAgent || ''
      const isWindows = ua.includes('Windows') || (navigator.platform?.includes('Win') ?? false)
      // Include all Chromium-based browsers: Chrome, Edge (Edg), Opera (OPR), Brave, etc.
      // Note: All Chromium browsers include 'Chrome' in UA, Edge adds 'Edg', Opera adds 'OPR'
      const isChromiumBased = ua.includes('Chrome') || ua.includes('Edg')
      PlatformDetection._windowsBrowserCache = isWindows && isChromiumBased
    } catch (e) {
      console.warn('PlatformDetection: Unable to detect Windows browser, defaulting to false')
      PlatformDetection._windowsBrowserCache = false
    }

    return PlatformDetection._windowsBrowserCache
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
   * Entry #56 FIX: Use isWindowsBrowser() to cover Edge and other Chromium browsers
   * @returns {string} 'playback' | 'balanced' | 'interactive'
   */
  static getAudioLatencyHint() {
    if (PlatformDetection.isAndroidChrome()) {
      return 'playback' // Most conservative for Android Chrome
    }
    if (PlatformDetection.isWindowsBrowser()) {
      return 'playback' // Entry #56: All Windows Chromium browsers need larger buffers
    }
    if (PlatformDetection.isMobile()) {
      return 'balanced' // Reasonable for other mobile
    }
    return 'interactive' // Best responsiveness on desktop
  }

  /**
   * Get recommended Tone.js lookAhead based on platform
   * Entry #56 FIX: Increased Windows lookAhead to match Android (0.2s)
   * @returns {number} lookAhead in seconds
   */
  static getAudioLookAhead() {
    if (PlatformDetection.isAndroidChrome()) {
      return 0.2 // 200ms for Android Chrome
    }
    if (PlatformDetection.isWindowsBrowser()) {
      return 0.2 // Entry #56: 200ms for Windows (was 150ms, now matches Android)
    }
    if (PlatformDetection.isMobile()) {
      return 0.12 // 120ms for other mobile
    }
    return 0.1 // 100ms default
  }

  /**
   * Detect if running on Windows with Chrome or Opera (most problematic for audio)
   * Entry #59 FIX: Both Chrome and Opera on Windows have audio issues
   * Edge performs better and is excluded
   * @returns {boolean} True if Windows Chrome or Opera
   */
  static isWindowsChromeOrOpera() {
    const ua = navigator.userAgent || ''
    const isWindows = ua.includes('Windows') || (navigator.platform?.includes('Win') ?? false)
    // Chrome (not Edge) OR Opera
    const isChrome = ua.includes('Chrome') && !ua.includes('Edg')
    const isOpera = ua.includes('OPR') || ua.includes('Opera')
    return isWindows && (isChrome || isOpera)
  }

  /**
   * Get recommended Tone.context.updateInterval based on platform
   * Entry #59 FIX: Chrome/Opera on Windows need higher updateInterval to reduce scheduler overhead
   * Default Tone.js updateInterval is 0.025s (25ms)
   * @returns {number} updateInterval in seconds
   */
  static getAudioUpdateInterval() {
    if (PlatformDetection.isWindowsChromeOrOpera()) {
      return 0.05 // 50ms for Windows Chrome/Opera (2x default) - reduces scheduler CPU load
    }
    if (PlatformDetection.isAndroidChrome()) {
      return 0.04 // 40ms for Android Chrome
    }
    return 0.025 // 25ms default (Tone.js default)
  }

  /**
   * Get recommended filter/parameter update rate based on platform
   * Entry #59 FIX: Chrome/Opera on Windows need lower update rate to reduce main thread load
   * @returns {number} updates per second (Hz)
   */
  static getFilterUpdateRate() {
    if (PlatformDetection.isWindowsChromeOrOpera()) {
      return 20 // 20Hz for Windows Chrome/Opera (was 30Hz)
    }
    if (PlatformDetection.isAndroidChrome()) {
      return 20 // 20Hz for Android Chrome
    }
    if (PlatformDetection.isMobile()) {
      return 24 // 24Hz for other mobile
    }
    return 30 // 30Hz default
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
    PlatformDetection._windowsBrowserCache = null
  }
}

// Export for ES modules and expose on window for script tag usage
if (typeof window !== 'undefined') {
  window.PlatformDetection = PlatformDetection
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlatformDetection
}
