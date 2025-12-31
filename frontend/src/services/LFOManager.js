/**
 * LFOManager - Low Frequency Oscillation Manager for Webarmonium
 *
 * Manages local and remote hover-based modulation effects.
 * Handles multiple simultaneous LFOs with parameter control and
 * remote synchronization capabilities.
 */

// Use Tone.js from global window object

class LFOManager {
  constructor(audioService) {
    this.audioService = audioService;

    // LFO storage
    this.localLFOs = new Map(); // User's own hover LFOs
    this.remoteLFOs = new Map(); // Remote users' hover LFOs
    this.globalLFOs = new Map(); // Ambient/modulation LFOs

    // LFO parameters and settings
    this.lfoSettings = {
      local: {
        frequency: { min: 0.1, max: 8, default: 2 },
        depth: { min: 0, max: 1, default: 0.3 },
        waveform: ['sine', 'square', 'sawtooth', 'triangle'],
        target: ['frequency', 'filter', 'volume', 'pan']
      },
      remote: {
        frequency: { min: 0.05, max: 4, default: 1 },
        depth: { min: 0, max: 0.8, default: 0.2 },
        waveform: ['sine', 'triangle'],
        target: ['filter', 'volume', 'pan']
      },
      global: {
        frequency: { min: 0.01, max: 2, default: 0.5 },
        depth: { min: 0, max: 0.4, default: 0.15 },
        waveform: ['sine', 'triangle'],
        target: ['filter', 'volume', 'reverb']
      }
    };

    // State tracking
    this.isInitialized = false;
    this.activeLFOSources = new Map(); // Track which gestures are modulating

    // Mixers and routing
    this.localLFOGain = (window.Tone && window.Tone.Gain) ? new window.Tone.Gain(0.5) : { gain: { value: 0.5 }, connect: () => {}, dispose: () => {} };
    this.remoteLFOGain = (window.Tone && window.Tone.Gain) ? new window.Tone.Gain(0.3) : { gain: { value: 0.3 }, connect: () => {}, dispose: () => {} };
    this.globalLFOGain = (window.Tone && window.Tone.Gain) ? new window.Tone.Gain(0.25) : { gain: { value: 0.25 }, connect: () => {}, dispose: () => {} };

    // Event listeners
    this.eventListeners = {
      'lfo:created': [],
      'lfo:updated': [],
      'lfo:removed': [],
      'lfo:remote-sync': []
    };

    this._initialize();
  }

  /**
   * Initialize the LFO system
   */
  _initialize() {
    if (this.isInitialized) return;

    try {
      // Connect LFO mixers to main audio routing
      this._connectToAudioSystem();

      this.isInitialized = true;
      // console.log('[LFOManager] Initialized with multi-source modulation support');
    } catch (error) {
      // console.error('[LFOManager] Initialization failed:', error);
    }
  }

  /**
   * Connect LFO outputs to the audio system
   */
  _connectToAudioSystem() {
    // This would connect to the main audio routing in AudioService
    // The actual implementation would depend on AudioService architecture
    if (this.audioService && this.audioService.addModulationSource) {
      this.audioService.addModulationSource('localLFO', this.localLFOGain);
      this.audioService.addModulationSource('remoteLFO', this.remoteLFOGain);
      this.audioService.addModulationSource('globalLFO', this.globalLFOGain);
    }
  }

  /**
   * Create a new LFO
   */
  createLFO(config = {}) {
    const lfoId = this._generateLFOId();
    const type = config.type || 'local';

    try {
      // Create LFO with specified parameters
      const LFOClass = (window.Tone && window.Tone.LFO) ? window.Tone.LFO : class MockLFO {
        constructor(config) {
          this.frequency = { rampTo: () => {}, value: config.frequency || 2 };
          this.type = config.type || 'sine';
        }
        start() {}
        stop() {}
        dispose() {}
        connect(target) {}
      };

      const lfo = new LFOClass({
        frequency: config.frequency || this.lfoSettings[type].frequency.default,
        type: config.waveform || 'sine',
        min: -1,
        max: 1
      });

      if (lfo.start) lfo.start();

      // Create depth control
      const GainClass = (window.Tone && window.Tone.Gain) ? window.Tone.Gain : class MockGain {
        constructor(value) {
          this.gain = { value: value, rampTo: () => {} };
        }
        connect(target) {}
        dispose() {}
      };

      const depthGain = new GainClass(config.depth || this.lfoSettings[type].depth.default);

      // Connect LFO -> depth control -> appropriate mixer
      lfo.connect(depthGain);

      switch (type) {
        case 'local':
          depthGain.connect(this.localLFOGain);
          break;
        case 'remote':
          depthGain.connect(this.remoteLFOGain);
          break;
        case 'global':
          depthGain.connect(this.globalLFOGain);
          break;
      }

      // Store LFO with full configuration
      const lfoData = {
        id: lfoId,
        type: type,
        lfo: lfo,
        depthGain: depthGain,
        config: {
          frequency: config.frequency || this.lfoSettings[type].frequency.default,
          depth: config.depth || this.lfoSettings[type].depth.default,
          waveform: config.waveform || 'sine',
          target: config.target || this.lfoSettings[type].target[0],
          source: config.source || null,
          userId: config.userId || null
        },
        createdAt: Date.now(),
        lastActivity: Date.now()
      };

      // Store in appropriate collection
      this._storeLFO(lfoData, type);

      // Emit creation event
      this._emit('lfo:created', lfoData);

      // console.log(`[LFOManager] Created ${type} LFO: ${lfoId}`);
      return lfoId;

    } catch (error) {
      // console.error('[LFOManager] Failed to create LFO:', error);
      return null;
    }
  }

  /**
   * Store LFO in appropriate collection
   */
  _storeLFO(lfoData, type) {
    switch (type) {
      case 'local':
        this.localLFOs.set(lfoData.id, lfoData);
        break;
      case 'remote':
        this.remoteLFOs.set(lfoData.id, lfoData);
        break;
      case 'global':
        this.globalLFOs.set(lfoData.id, lfoData);
        break;
    }
  }

  /**
   * Handle local hover start - create responsive LFO
   */
  handleLocalHoverStart(gestureData, targetInstrument) {
    const sourceId = `local_${gestureData.gestureId}`;

    // Check if LFO already exists for this source
    if (this.activeLFOSources.has(sourceId)) {
      return this.activeLFOSources.get(sourceId);
    }

    // Create LFO based on gesture properties
    const lfoConfig = {
      type: 'local',
      frequency: this._gestureToFrequency(gestureData),
      depth: this._gestureToDepth(gestureData),
      waveform: this._gestureToWaveform(gestureData),
      target: targetInstrument || 'filter',
      source: sourceId
    };

    const lfoId = this.createLFO(lfoConfig);

    if (lfoId) {
      this.activeLFOSources.set(sourceId, lfoId);

      // Auto-fade out after gesture ends (handled by hover end)
      this._scheduleLFORemoval(lfoId, 3000); // 3 second auto-fade
    }

    return lfoId;
  }

  /**
   * Handle local hover update - modify existing LFO
   */
  handleLocalHoverUpdate(gestureData, lfoId) {
    if (!lfoId) return;

    const lfoData = this.localLFOs.get(lfoId);
    if (!lfoData) return;

    // Update LFO parameters based on new gesture data
    const newFrequency = this._gestureToFrequency(gestureData);
    const newDepth = this._gestureToDepth(gestureData);

    // Smooth parameter updates
    lfoData.lfo.frequency.rampTo(newFrequency, 0.1);
    lfoData.depthGain.gain.rampTo(newDepth, 0.1);

    // Update last activity timestamp
    lfoData.lastActivity = Date.now();

    // Emit update event
    this._emit('lfo:updated', {
      id: lfoId,
      frequency: newFrequency,
      depth: newDepth,
      source: lfoData.config.source
    });
  }

  /**
   * Handle local hover end - fade out and remove LFO
   */
  handleLocalHoverEnd(sourceId) {
    const lfoId = this.activeLFOSources.get(sourceId);
    if (!lfoId) return;

    this._scheduleLFORemoval(lfoId, 500); // Quick 500ms fade out
    this.activeLFOSources.delete(sourceId);
  }

  /**
   * Handle remote hover data - create synchronized LFO
   */
  handleRemoteHoverData(remoteData) {
    const sourceId = `remote_${remoteData.userId}_${remoteData.gestureId}`;

    // Check if we already have this remote LFO
    if (this.activeLFOSources.has(sourceId)) {
      return this.updateRemoteLFO(sourceId, remoteData);
    }

    // Create new remote LFO
    const lfoConfig = {
      type: 'remote',
      frequency: remoteData.modulation?.frequency || 1,
      depth: remoteData.modulation?.depth || 0.2,
      waveform: remoteData.modulation?.waveform || 'sine',
      target: remoteData.modulation?.target || 'filter',
      userId: remoteData.userId,
      source: sourceId
    };

    const lfoId = this.createLFO(lfoConfig);

    if (lfoId) {
      this.activeLFOSources.set(sourceId, lfoId);

      // Remote LFOs have longer lifetime
      this._scheduleLFORemoval(lfoId, 5000);

      this._emit('lfo:remote-sync', {
        lfoId: lfoId,
        sourceId: sourceId,
        userId: remoteData.userId,
        data: remoteData
      });
    }

    return lfoId;
  }

  /**
   * Update existing remote LFO
   */
  updateRemoteLFO(sourceId, remoteData) {
    const lfoId = this.activeLFOSources.get(sourceId);
    if (!lfoId) return;

    const lfoData = this.remoteLFOs.get(lfoId);
    if (!lfoData) return;

    // Update parameters with smooth transitions
    if (remoteData.modulation?.frequency) {
      lfoData.lfo.frequency.rampTo(remoteData.modulation.frequency, 0.2);
    }

    if (remoteData.modulation?.depth) {
      lfoData.depthGain.gain.rampTo(remoteData.modulation.depth, 0.2);
    }

    lfoData.lastActivity = Date.now();
  }

  /**
   * Create global ambient LFO
   */
  createGlobalLFO(config = {}) {
    const lfoConfig = {
      type: 'global',
      frequency: config.frequency || 0.5,
      depth: config.depth || 0.15,
      waveform: config.waveform || 'sine',
      target: config.target || 'filter',
      name: config.name || 'ambient'
    };

    return this.createLFO(lfoConfig);
  }

  /**
   * Schedule LFO removal with fade out
   */
  _scheduleLFORemoval(lfoId, fadeTime) {
    const lfoData = this._getLFOById(lfoId);
    if (!lfoData) return;

    // Fade out the LFO depth
    lfoData.depthGain.gain.rampTo(0, fadeTime / 1000);

    // Schedule actual removal
    setTimeout(() => {
      this.removeLFO(lfoId);
    }, fadeTime);
  }

  /**
   * Remove LFO and clean up resources
   */
  removeLFO(lfoId) {
    const lfoData = this._getLFOById(lfoId);
    if (!lfoData) return;

    try {
      // Stop and dispose LFO
      lfoData.lfo.stop();
      lfoData.lfo.dispose();
      lfoData.depthGain.dispose();

      // Remove from storage
      switch (lfoData.type) {
        case 'local':
          this.localLFOs.delete(lfoId);
          break;
        case 'remote':
          this.remoteLFOs.delete(lfoId);
          break;
        case 'global':
          this.globalLFOs.delete(lfoId);
          break;
      }

      // Remove from active sources
      if (lfoData.config.source) {
        this.activeLFOSources.delete(lfoData.config.source);
      }

      this._emit('lfo:removed', {
        id: lfoId,
        type: lfoData.type
      });

      // console.log(`[LFOManager] Removed LFO: ${lfoId}`);

    } catch (error) {
      // console.error('[LFOManager] Error removing LFO:', error);
    }
  }

  /**
   * Convert gesture data to LFO frequency
   */
  _gestureToFrequency(gestureData) {
    const settings = this.lfoSettings.local.frequency;

    // Map gesture velocity/intensity to frequency range
    let frequency = settings.default;

    if (gestureData.velocity !== undefined) {
      frequency = settings.min + (gestureData.velocity * (settings.max - settings.min));
    }

    // Add some variation based on gesture position
    if (gestureData.x !== undefined && gestureData.y !== undefined) {
      const positionFactor = (gestureData.x + gestureData.y) / 2;
      frequency *= (0.8 + positionFactor * 0.4); // ±20% variation
    }

    // Clamp to valid range
    return Math.max(settings.min, Math.min(settings.max, frequency));
  }

  /**
   * Convert gesture data to LFO depth
   */
  _gestureToDepth(gestureData) {
    const settings = this.lfoSettings.local.depth;

    // Map gesture pressure/intensity to depth
    let depth = settings.default;

    if (gestureData.pressure !== undefined) {
      depth = settings.min + (gestureData.pressure * (settings.max - settings.min));
    } else if (gestureData.intensity !== undefined) {
      depth = settings.min + (gestureData.intensity * (settings.max - settings.min));
    }

    return Math.max(settings.min, Math.min(settings.max, depth));
  }

  /**
   * Convert gesture data to LFO waveform
   */
  _gestureToWaveform(gestureData) {
    // Select waveform based on gesture characteristics
    const waveforms = this.lfoSettings.local.waveform;

    // Simple mapping based on gesture type
    if (gestureData.gestureType === 'circular') {
      return 'sine'; // Smooth for circular
    } else if (gestureData.gestureType === 'sharp') {
      return 'square'; // Abrupt for sharp
    } else if (gestureData.gestureType === 'linear') {
      return 'sawtooth'; // Progressive for linear
    }

    return waveforms[0]; // Default to sine
  }

  /**
   * Get LFO by ID from any collection
   */
  _getLFOById(lfoId) {
    return this.localLFOs.get(lfoId) ||
           this.remoteLFOs.get(lfoId) ||
           this.globalLFOs.get(lfoId);
  }

  /**
   * Update LFO parameters
   */
  updateLFO(lfoId, parameters) {
    const lfoData = this._getLFOById(lfoId);
    if (!lfoData) return false;

    try {
      // Update frequency
      if (parameters.frequency !== undefined) {
        lfoData.lfo.frequency.rampTo(parameters.frequency, 0.1);
        lfoData.config.frequency = parameters.frequency;
      }

      // Update depth
      if (parameters.depth !== undefined) {
        lfoData.depthGain.gain.rampTo(parameters.depth, 0.1);
        lfoData.config.depth = parameters.depth;
      }

      // Update waveform (requires recreation for Tone.js)
      if (parameters.waveform && parameters.waveform !== lfoData.config.waveform) {
        lfoData.lfo.type = parameters.waveform;
        lfoData.config.waveform = parameters.waveform;
      }

      lfoData.lastActivity = Date.now();

      this._emit('lfo:updated', {
        id: lfoId,
        ...parameters
      });

      return true;
    } catch (error) {
      // console.error('[LFOManager] Failed to update LFO:', error);
      return false;
    }
  }

  /**
   * Get LFO status and statistics
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      totalLFOs: this.localLFOs.size + this.remoteLFOs.size + this.globalLFOs.size,
      lfoCounts: {
        local: this.localLFOs.size,
        remote: this.remoteLFOs.size,
        global: this.globalLFOs.size
      },
      activeSources: this.activeLFOSources.size,
      mixerLevels: {
        local: this.localLFOGain.gain.value,
        remote: this.remoteLFOGain.gain.value,
        global: this.globalLFOGain.gain.value
      }
    };
  }

  /**
   * Set mixer levels for different LFO types
   */
  setMixerLevels(levels = {}) {
    if (levels.local !== undefined) {
      this.localLFOGain.gain.rampTo(levels.local, 0.1);
    }
    if (levels.remote !== undefined) {
      this.remoteLFOGain.gain.rampTo(levels.remote, 0.1);
    }
    if (levels.global !== undefined) {
      this.globalLFOGain.gain.rampTo(levels.global, 0.1);
    }
  }

  /**
   * Clean up old inactive LFOs
   */
  cleanup(maxAge = 30000) { // 30 seconds default
    const now = Date.now();
    const toRemove = [];

    // Check all LFO collections
    [this.localLFOs, this.remoteLFOs, this.globalLFOs].forEach(collection => {
      collection.forEach((lfoData, lfoId) => {
        if (now - lfoData.lastActivity > maxAge) {
          toRemove.push(lfoId);
        }
      });
    });

    // Remove old LFOs
    toRemove.forEach(lfoId => {
      this.removeLFO(lfoId);
    });

    if (toRemove.length > 0) {
      // console.log(`[LFOManager] Cleaned up ${toRemove.length} inactive LFOs`);
    }

    return toRemove.length;
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event]
        .filter(cb => cb !== callback);
    }
  }

  /**
   * Emit event to listeners
   */
  _emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          // console.error(`[LFOManager] Event listener error for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Generate unique LFO ID
   */
  _generateLFOId() {
    return `lfo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Dispose of all LFOs and clean up
   */
  dispose() {
    // Remove all LFOs
    [...this.localLFOs.keys()].forEach(id => this.removeLFO(id));
    [...this.remoteLFOs.keys()].forEach(id => this.removeLFO(id));
    [...this.globalLFOs.keys()].forEach(id => this.removeLFO(id));

    // Dispose mixers
    this.localLFOGain.dispose();
    this.remoteLFOGain.dispose();
    this.globalLFOGain.dispose();

    // Clear all references
    this.activeLFOSources.clear();
    this.eventListeners = {};

    this.isInitialized = false;
    // console.log('[LFOManager] Disposed');
  }
}

// Make available globally
window.LFOManager = LFOManager;