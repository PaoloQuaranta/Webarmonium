/**
 * PlatformDetection - Shared utility for platform detection
 * Entry #46 FIX: Centralized platform detection to eliminate code duplication
 *
 * Used by AudioService and EnhancedGestureCapture for performance optimizations
 */
class PlatformDetection {
  static _cache = null

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
   * Clear cached values (useful for testing)
   */
  static clearCache() {
    PlatformDetection._cache = null
  }
}

// Export for ES modules and expose on window for script tag usage
if (typeof window !== 'undefined') {
  window.PlatformDetection = PlatformDetection
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PlatformDetection
}
