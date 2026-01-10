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
    sampleRate: 'auto',       // auto, 48000, 44100, 22050
    audioBuffer: 'auto',      // auto, 100, 200, 300, 500 (ms)
    graphicsQuality: 'auto'   // auto, full, reduced, minimal
  }

  // Audio quality tier mappings (matches DeviceCapabilities tiers)
  static AUDIO_QUALITY_PROFILES = {
    high: {
      lookAhead: 0.1,
      updateInterval: 0.025,
      sampleRate: 48000,
      filterUpdateRate: 30,
      maxPolyphony: 8,
      backgroundLayers: ['bass', 'pad', 'chords'],
      useAmbientFilters: true,
      synthComplexity: 'full'
    },
    medium: {
      lookAhead: 0.2,
      updateInterval: 0.05,
      sampleRate: 44100,
      filterUpdateRate: 20,
      maxPolyphony: 4,
      backgroundLayers: ['bass', 'pad'],
      useAmbientFilters: true,
      synthComplexity: 'simplified'
    },
    low: {
      lookAhead: 0.3,
      updateInterval: 0.1,
      sampleRate: 44100,
      filterUpdateRate: 15,
      maxPolyphony: 2,
      backgroundLayers: ['bass'],
      useAmbientFilters: false,
      synthComplexity: 'minimal'
    },
    minimal: {
      lookAhead: 0.5,
      updateInterval: 0.2,
      sampleRate: 22050,
      filterUpdateRate: 5,
      maxPolyphony: 1,
      backgroundLayers: [],
      useAmbientFilters: false,
      synthComplexity: 'mono-sine'
    }
  }

  // Sample rate options
  static SAMPLE_RATE_OPTIONS = {
    48000: { label: '48 kHz', description: 'High fidelity' },
    44100: { label: '44.1 kHz', description: 'Standard (CD quality)' },
    22050: { label: '22 kHz', description: 'Low CPU' }
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
      attractorPoints: 1200,
      pulseGlow: true,
      cascadeEnabled: true
    },
    reduced: {
      shadowBlur: false,
      particleCount: 80,
      attractorPoints: 800,
      pulseGlow: false,
      cascadeEnabled: true
    },
    minimal: {
      shadowBlur: false,
      particleCount: 40,
      attractorPoints: 400,
      pulseGlow: false,
      cascadeEnabled: false
    }
  }

  /**
   * Get a setting value from localStorage
   * @param {string} key - Setting key (audioQuality, sampleRate, audioBuffer, graphicsQuality)
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
    if (key === 'sampleRate' || key === 'audioBuffer') {
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
      console.warn('localStorage not available')
      return
    }

    localStorage.setItem(this.STORAGE_PREFIX + key, String(value))
    console.log(`Settings: ${key} = ${value}`)

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
      sampleRate: this.get('sampleRate'),
      audioBuffer: this.get('audioBuffer'),
      graphicsQuality: this.get('graphicsQuality')
    }
  }

  /**
   * Reset all settings to defaults (auto)
   */
  static resetAll () {
    Object.keys(this.DEFAULTS).forEach(key => {
      this.set(key, this.DEFAULTS[key])
    })
    console.log('Settings: Reset to defaults (auto)')
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

    // Sample rate override
    if (settings.sampleRate !== 'auto') {
      result.sampleRate = settings.sampleRate
      result.source = result.source || 'user-settings'
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
      sampleRate: {
        value: settings.sampleRate,
        label: settings.sampleRate === 'auto' ? 'Auto' : this.SAMPLE_RATE_OPTIONS[settings.sampleRate]?.label || String(settings.sampleRate)
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

// Export for ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UserSettings
}

// Make available globally
if (typeof window !== 'undefined') {
  window.UserSettings = UserSettings
}
