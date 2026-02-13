/**
 * PlatformDetection - Shared utility for platform detection
 * Entry #46 FIX: Centralized platform detection to eliminate code duplication
 * Entry #48 FIX: Extended for mobile/Android/iOS detection and audio optimization
 * Entry #73 FIX: Integrated with DeviceCapabilities for tier-based audio profiles
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
  static _lowPowerModeEnabled = false  // Manual Low Power mode toggle

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
   * Detect if running on Windows with Chrome (not Edge, not Opera)
   * Chrome on Windows is the MOST problematic for audio
   * @returns {boolean} True if Windows Chrome (pure Chrome, not Chromium variants)
   */
  static isWindowsChromePure() {
    const ua = navigator.userAgent || ''
    const isWindows = ua.includes('Windows') || (navigator.platform?.includes('Win') ?? false)
    // Pure Chrome: has 'Chrome' but NOT Edge, NOT Opera
    const isPureChrome = ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR') && !ua.includes('Opera')
    return isWindows && isPureChrome
  }

  /**
   * Detect if running on Windows with Opera
   * @returns {boolean} True if Windows Opera
   */
  static isWindowsOpera() {
    const ua = navigator.userAgent || ''
    const isWindows = ua.includes('Windows') || (navigator.platform?.includes('Win') ?? false)
    const isOpera = ua.includes('OPR') || ua.includes('Opera')
    return isWindows && isOpera
  }

  /**
   * Detect if running on Windows with Chrome or Opera (most problematic for audio)
   * Entry #59 FIX: Both Chrome and Opera on Windows have audio issues
   * Edge performs better and is excluded
   * @returns {boolean} True if Windows Chrome or Opera
   */
  static isWindowsChromeOrOpera() {
    return PlatformDetection.isWindowsChromePure() || PlatformDetection.isWindowsOpera()
  }

  /**
   * Get recommended Tone.context.updateInterval based on platform
   * Entry #59 FIX: Chrome on Windows needs VERY high updateInterval
   * Default Tone.js updateInterval is 0.025s (25ms)
   * @returns {number} updateInterval in seconds
   */
  static getAudioUpdateInterval() {
    if (PlatformDetection.isWindowsChromePure()) {
      return 0.1 // 100ms for Windows Chrome (4x default) - MOST aggressive
    }
    if (PlatformDetection.isWindowsOpera()) {
      return 0.05 // 50ms for Windows Opera (2x default)
    }
    if (PlatformDetection.isAndroidChrome()) {
      return 0.04 // 40ms for Android Chrome
    }
    return 0.025 // 25ms default (Tone.js default)
  }

  /**
   * Get recommended filter/parameter update rate based on platform
   * Entry #59 FIX: Chrome on Windows needs very low update rate
   * @returns {number} updates per second (Hz)
   */
  static getFilterUpdateRate() {
    if (PlatformDetection.isWindowsChromePure()) {
      return 15 // 15Hz for Windows Chrome (very aggressive)
    }
    if (PlatformDetection.isWindowsOpera()) {
      return 20 // 20Hz for Windows Opera
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
   * Get recommended Tone.js lookAhead based on platform
   * Chrome on Windows needs extra lookAhead
   * @returns {number} lookAhead in seconds
   */
  static getAudioLookAheadChrome() {
    if (PlatformDetection.isWindowsChromePure()) {
      return 0.25 // 250ms for Windows Chrome (very aggressive)
    }
    return null // Use default from getAudioLookAhead()
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

  // =========================================================================
  // Entry #73: Device-Adaptive Audio Architecture
  // =========================================================================

  /**
   * Enable/disable manual Low Power mode
   * @param {boolean} enabled - Whether Low Power mode is enabled
   */
  static setLowPowerMode(enabled) {
    PlatformDetection._lowPowerModeEnabled = enabled
  }

  /**
   * Check if Low Power mode is enabled (manual setting)
   * @returns {boolean}
   */
  static isLowPowerModeEnabled() {
    return PlatformDetection._lowPowerModeEnabled
  }

  /**
   * Get the effective audio profile combining device tier + platform + manual settings
   * Entry #73: Comprehensive audio configuration
   * @returns {Object} Complete audio configuration profile
   */
  static getEffectiveAudioProfile() {
    // Get base profile from DeviceCapabilities if available
    const DeviceCaps = typeof DeviceCapabilities !== 'undefined' ? DeviceCapabilities : null
    let baseProfile = null

    if (DeviceCaps) {
      baseProfile = DeviceCaps.getAudioProfile()
    }

    // If Low Power mode is manually enabled, force ultra-low profile
    if (PlatformDetection._lowPowerModeEnabled) {
      return {
        lookAhead: 0.5,           // 500ms
        updateInterval: 0.2,      // 200ms
        filterUpdateRate: 5,      // Hz
        maxPolyphony: 1,
        backgroundLayers: [],     // No background
        useAmbientFilters: false,
        synthComplexity: 'mono-sine',
        tier: 'ultra-low',
        source: 'manual-low-power'
      }
    }

    // If DeviceCapabilities detected a tier, use its profile
    if (baseProfile) {
      const tier = DeviceCaps.getTier()

      // Apply platform-specific overrides for problematic browsers
      // Even on a high-end device, Windows Chrome needs special handling
      if (PlatformDetection.isWindowsChromePure() && tier !== 'ultra-low') {
        return {
          ...baseProfile,
          lookAhead: Math.max(baseProfile.lookAhead, 0.25),      // At least 250ms
          updateInterval: Math.max(baseProfile.updateInterval, 0.1), // At least 100ms
          filterUpdateRate: Math.min(baseProfile.filterUpdateRate, 15), // Max 15Hz
          tier: tier,
          source: 'device-tier-with-windows-chrome-override'
        }
      }

      if (PlatformDetection.isWindowsOpera() && tier !== 'ultra-low') {
        return {
          ...baseProfile,
          lookAhead: Math.max(baseProfile.lookAhead, 0.2),       // At least 200ms
          updateInterval: Math.max(baseProfile.updateInterval, 0.05), // At least 50ms
          filterUpdateRate: Math.min(baseProfile.filterUpdateRate, 20), // Max 20Hz
          tier: tier,
          source: 'device-tier-with-windows-opera-override'
        }
      }

      return {
        ...baseProfile,
        tier: tier,
        source: 'device-tier'
      }
    }

    // Fallback: Use original platform-based detection
    return {
      lookAhead: PlatformDetection.getAudioLookAhead(),
      updateInterval: PlatformDetection.getAudioUpdateInterval(),
      filterUpdateRate: PlatformDetection.getFilterUpdateRate(),
      maxPolyphony: PlatformDetection.isMobile() ? 4 : 12,
      backgroundLayers: ['bass', 'pad', 'chords'],
      useAmbientFilters: true,
      synthComplexity: 'full',
      tier: 'unknown',
      source: 'platform-fallback'
    }
  }

  /**
   * Get the current device tier (from DeviceCapabilities or inferred)
   * @returns {'high'|'medium'|'low'|'ultra-low'|'unknown'}
   */
  static getDeviceTier() {
    if (PlatformDetection._lowPowerModeEnabled) {
      return 'ultra-low'
    }

    const DeviceCaps = typeof DeviceCapabilities !== 'undefined' ? DeviceCapabilities : null
    if (DeviceCaps) {
      return DeviceCaps.getTier()
    }

    // Infer tier from platform if DeviceCapabilities not available
    if (PlatformDetection.isWindowsChromePure()) return 'low'
    if (PlatformDetection.isAndroidChrome()) return 'low'
    if (PlatformDetection.isMobile()) return 'medium'
    return 'medium'
  }

  /**
   * Check if current device/settings suggest using simplified audio
   * @returns {boolean} True if should use simplified audio
   */
  static shouldUseSimplifiedAudio() {
    const tier = PlatformDetection.getDeviceTier()
    return tier === 'low' || tier === 'ultra-low'
  }

  /**
   * Get maximum polyphony for current device/settings
   * @returns {number} Max simultaneous voices
   */
  static getMaxPolyphony() {
    const profile = PlatformDetection.getEffectiveAudioProfile()
    return profile.maxPolyphony
  }

  /**
   * Get enabled background layers for current device/settings
   * @returns {string[]} Array of layer names ('bass', 'pad', 'chords')
   */
  static getEnabledBackgroundLayers() {
    const profile = PlatformDetection.getEffectiveAudioProfile()
    return profile.backgroundLayers
  }

  /**
   * Check if ambient filters should be used
   * @returns {boolean}
   */
  static shouldUseAmbientFilters() {
    const profile = PlatformDetection.getEffectiveAudioProfile()
    return profile.useAmbientFilters
  }

  /**
   * Get synth complexity setting
   * @returns {'full'|'simplified'|'minimal'|'mono-sine'}
   */
  static getSynthComplexity() {
    const profile = PlatformDetection.getEffectiveAudioProfile()
    return profile.synthComplexity
  }
}

// Export for ES modules and expose on window for script tag usage
if (typeof window !== 'undefined') {
  window.PlatformDetection = PlatformDetection
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlatformDetection
}
