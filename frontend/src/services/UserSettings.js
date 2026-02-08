/**
 * UserSettings.js - Entry #74: User-configurable audio and graphics settings
 *
 * Manages persistent user preferences for audio and graphics quality.
 * Settings are stored in localStorage and override auto-detected values.
 */

class UserSettings {
  static STORAGE_PREFIX = 'webarmonium:settings:'

  static DEFAULTS = {
    audioQuality: 'auto',     // auto, high, medium, low, minimal
    audioBuffer: 'auto',      // auto, 100, 200, 300, 500 (ms)
    graphicsQuality: 'auto',  // auto, full, reduced, minimal
    theme: 'dark'             // dark, light
  }

  // Audio quality tier mappings (matches DeviceCapabilities tiers)
  static AUDIO_QUALITY_PROFILES = {
    high: {
      lookAhead: 0.1,
      updateInterval: 0.025,
      filterUpdateRate: 30,
      maxPolyphony: 8,
      compositionLayers: ['backgroundHigh', 'backgroundMid', 'backgroundLow'],
      backgroundLayers: ['bass', 'pad', 'chords'],
      useAmbientFilters: true,
      synthComplexity: 'full'
    },
    medium: {
      lookAhead: 0.2,
      updateInterval: 0.05,
      filterUpdateRate: 20,
      maxPolyphony: 4,
      compositionLayers: ['backgroundHigh', 'backgroundMid'],
      backgroundLayers: ['bass', 'pad', 'chords'],
      useAmbientFilters: true,
      synthComplexity: 'simplified'
    },
    low: {
      lookAhead: 0.3,
      updateInterval: 0.1,
      filterUpdateRate: 15,
      maxPolyphony: 2,
      compositionLayers: ['backgroundHigh'],
      backgroundLayers: ['bass', 'pad'],
      useAmbientFilters: false,
      synthComplexity: 'minimal'
    },
    minimal: {
      lookAhead: 0.5,
      updateInterval: 0.2,
      filterUpdateRate: 5,
      maxPolyphony: 1,
      compositionLayers: [],
      backgroundLayers: [],
      useAmbientFilters: false,
      synthComplexity: 'mono-sine'
    }
  }

  // Buffer size options (ms)
  static BUFFER_OPTIONS = {
    100: { label: 'Small (100ms)', description: 'Low latency' },
    200: { label: 'Medium (200ms)', description: 'Balanced' },
    300: { label: 'Large (300ms)', description: 'Stable' },
    500: { label: 'Maximum (500ms)', description: 'Most stable' }
  }

  // Graphics quality options
  static GRAPHICS_QUALITY_PROFILES = {
    full: {
      shadowBlur: true,
      particleCount: 120,
      attractorPoints: 900,
      pulseGlow: true,
      cascadeEnabled: true
    },
    reduced: {
      shadowBlur: false,
      particleCount: 80,
      attractorPoints: 600,
      pulseGlow: false,
      cascadeEnabled: true
    },
    minimal: {
      shadowBlur: false,
      particleCount: 40,
      attractorPoints: 300,
      pulseGlow: false,
      cascadeEnabled: false
    }
  }

  // Synth complexity configurations for all 6 audio layers
  // Maps synthComplexity levels to concrete synth parameters
  static SYNTH_COMPLEXITY_CONFIG = {
    full: {
      // Ambient layers (user-local background)
      pad: { maxPolyphony: 6, oscillatorType: 'fattriangle', oscillatorCount: 2, spread: 15 },
      chords: { maxPolyphony: 8, synthType: 'FMSynth', harmonicity: 1.5, modulationIndex: 2.5 },
      bass: { synthType: 'FMSynth', harmonicity: 0.5, modulationIndex: 2 },
      // Composition layers (server-driven)
      backgroundHigh: { oscillatorType: 'pulse', width: 0.3 },
      backgroundMid: { oscillatorType: 'pwm', modulationFrequency: 0.5 },
      backgroundLow: { oscillatorType: 'square' }
    },
    simplified: {
      // Reduced complexity - fewer oscillators, simpler waveforms
      pad: { maxPolyphony: 3, oscillatorType: 'triangle', oscillatorCount: 1, spread: 0 },
      chords: { maxPolyphony: 4, synthType: 'Synth', oscillatorType: 'triangle' },
      bass: { synthType: 'Synth', oscillatorType: 'sine' },
      backgroundHigh: { oscillatorType: 'triangle' },
      backgroundMid: { oscillatorType: 'triangle' },
      backgroundLow: { oscillatorType: 'sine' }
    },
    minimal: {
      // Minimum CPU - pure sine waves, minimal polyphony
      pad: { maxPolyphony: 2, oscillatorType: 'sine', oscillatorCount: 1, spread: 0 },
      chords: { maxPolyphony: 2, synthType: 'Synth', oscillatorType: 'sine' },
      bass: { synthType: 'Synth', oscillatorType: 'sine' },
      backgroundHigh: { oscillatorType: 'sine' },
      backgroundMid: { oscillatorType: 'sine' },
      backgroundLow: { oscillatorType: 'sine' }
    },
    'mono-sine': {
      // Ultra-low power mode - already handled separately
      pad: { maxPolyphony: 1, oscillatorType: 'sine', oscillatorCount: 1, spread: 0 },
      chords: { maxPolyphony: 1, synthType: 'Synth', oscillatorType: 'sine' },
      bass: { synthType: 'Synth', oscillatorType: 'sine' },
      backgroundHigh: { oscillatorType: 'sine' },
      backgroundMid: { oscillatorType: 'sine' },
      backgroundLow: { oscillatorType: 'sine' }
    }
  }

  /**
   * Get synth complexity config for current audio quality setting
   * @returns {Object} Synth configuration for all layers
   */
  static getSynthComplexityConfig () {
    const audioQuality = this.get('audioQuality')
    if (audioQuality === 'auto') {
      return this.SYNTH_COMPLEXITY_CONFIG.full // Default to full for auto
    }
    const profile = this.AUDIO_QUALITY_PROFILES[audioQuality]
    const complexity = profile?.synthComplexity || 'full'
    return this.SYNTH_COMPLEXITY_CONFIG[complexity] || this.SYNTH_COMPLEXITY_CONFIG.full
  }

  /**
   * Get a setting value from localStorage
   * @param {string} key - Setting key (audioQuality, audioBuffer, graphicsQuality, theme)
   * @returns {string|number} Setting value or default
   */
  static get (key) {
    if (typeof localStorage === 'undefined') {
      return this.DEFAULTS[key]
    }

    const stored = localStorage.getItem(this.STORAGE_PREFIX + key)
    if (stored === null) {
      return this.DEFAULTS[key]
    }

    // Parse numeric values
    if (key === 'audioBuffer') {
      if (stored === 'auto') return 'auto'
      const num = parseInt(stored, 10)
      return isNaN(num) ? this.DEFAULTS[key] : num
    }

    return stored
  }

  /**
   * Set a setting value to localStorage
   * @param {string} key - Setting key
   * @param {string|number} value - Setting value
   */
  static set (key, value) {
    if (typeof localStorage === 'undefined') {
      return
    }

    localStorage.setItem(this.STORAGE_PREFIX + key, String(value))

    // Dispatch event for live updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('user-settings-change', {
        detail: { key, value, allSettings: this.getAll() }
      }))
    }
  }

  /**
   * Get all settings as an object
   * @returns {Object} All settings
   */
  static getAll () {
    return {
      audioQuality: this.get('audioQuality'),
      audioBuffer: this.get('audioBuffer'),
      graphicsQuality: this.get('graphicsQuality'),
      theme: this.get('theme')
    }
  }

  /**
   * Get effective theme (resolves 'dark' or 'light')
   * @returns {string} 'dark' or 'light'
   */
  static getEffectiveTheme () {
    const setting = this.get('theme')
    return setting === 'light' ? 'light' : 'dark'
  }

  /**
   * Apply theme to document
   * @param {string} theme - 'dark' or 'light'
   */
  static applyTheme (theme) {
    if (typeof document !== 'undefined') {
      const root = document.documentElement

      // Dark mode: remove attribute (CSS uses absence of attribute for dark)
      // Light mode: set attribute to 'light'
      if (theme === 'light') {
        root.setAttribute('data-theme', 'light')
      } else {
        root.removeAttribute('data-theme')
      }

      // Force Chrome to re-evaluate ALL CSS by toggling disabled on stylesheets
      // This is a workaround for Chrome not updating CSS variables in some cases
      const styleSheets = document.querySelectorAll('style, link[rel="stylesheet"]')
      styleSheets.forEach(sheet => { sheet.disabled = true })
      // Use setTimeout(0) to ensure disabled state is applied before re-enabling
      setTimeout(() => {
        styleSheets.forEach(sheet => { sheet.disabled = false })
      }, 0)

      window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme } }))
    }
  }

  /**
   * Reset all settings to defaults (auto)
   */
  static resetAll () {
    Object.keys(this.DEFAULTS).forEach(key => {
      this.set(key, this.DEFAULTS[key])
    })
  }

  /**
   * Check if any setting is manually overridden (not auto)
   * @returns {boolean}
   */
  static hasManualOverrides () {
    return Object.keys(this.DEFAULTS).some(key => this.get(key) !== 'auto')
  }

  /**
   * Get effective audio profile merging user settings with auto-detection
   * @param {Object} autoDetectedProfile - Profile from DeviceCapabilities/PlatformDetection
   * @returns {Object} Merged audio profile
   */
  static getEffectiveAudioProfile (autoDetectedProfile = {}) {
    const settings = this.getAll()
    const result = { ...autoDetectedProfile }

    // Audio quality override
    if (settings.audioQuality !== 'auto') {
      const qualityProfile = this.AUDIO_QUALITY_PROFILES[settings.audioQuality]
      if (qualityProfile) {
        Object.assign(result, qualityProfile)
        result.tier = settings.audioQuality
        result.source = 'user-settings'
      }
    }

    // Audio buffer (lookAhead) override
    if (settings.audioBuffer !== 'auto') {
      result.lookAhead = settings.audioBuffer / 1000 // Convert ms to seconds
      result.source = result.source || 'user-settings'
    }

    return result
  }

  /**
   * Get effective graphics profile merging user settings with auto-detection
   * @param {Object} autoDetectedProfile - Profile from device detection
   * @returns {Object} Merged graphics profile
   */
  static getEffectiveGraphicsProfile (autoDetectedProfile = {}) {
    const graphicsQuality = this.get('graphicsQuality')

    if (graphicsQuality === 'auto') {
      return autoDetectedProfile
    }

    const qualityProfile = this.GRAPHICS_QUALITY_PROFILES[graphicsQuality]
    if (qualityProfile) {
      return {
        ...autoDetectedProfile,
        ...qualityProfile,
        source: 'user-settings'
      }
    }

    return autoDetectedProfile
  }

  /**
   * Get human-readable description of current settings
   * @returns {Object} Settings with labels
   */
  static getSettingsWithLabels () {
    const settings = this.getAll()
    return {
      audioQuality: {
        value: settings.audioQuality,
        label: settings.audioQuality === 'auto' ? 'Auto' : settings.audioQuality.charAt(0).toUpperCase() + settings.audioQuality.slice(1)
      },
      audioBuffer: {
        value: settings.audioBuffer,
        label: settings.audioBuffer === 'auto' ? 'Auto' : this.BUFFER_OPTIONS[settings.audioBuffer]?.label || `${settings.audioBuffer}ms`
      },
      graphicsQuality: {
        value: settings.graphicsQuality,
        label: settings.graphicsQuality === 'auto' ? 'Auto' : settings.graphicsQuality.charAt(0).toUpperCase() + settings.graphicsQuality.slice(1)
      }
    }
  }
}

// Clean up deprecated settings from localStorage
// sampleRate was removed because browsers ignore it
if (typeof localStorage !== 'undefined') {
  localStorage.removeItem('webarmonium:settings:sampleRate')
}

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UserSettings
}

// Make available globally
if (typeof window !== 'undefined') {
  window.UserSettings = UserSettings
}
