/**
 * AudioServiceFacade.js
 * Coordinates all extracted audio modules and provides a unified interface
 * Phase 2 refactoring: Facade pattern for modular audio architecture
 */
class AudioServiceFacade {
  constructor() {
    // Module instances
    this.gestureAudioMapper = null
    this.polyphonyManager = null
    this.compositionPlayer = null
    this.generativeMusicEngine = null
    this.filterModulationSystem = null
    this.parameterController = null
    this.threeTierAudioSystem = null

    // Core audio references (set by AudioService)
    this.gestureSynth = null
    this.gestureFilter = null
    this.ambientLayers = null
    this.ambientFilters = null
    this.masterVolume = null

    // State
    this.isInitialized = false
    this.modulesInitialized = false
  }

  /**
   * Initialize all audio modules
   * @param {Object} config - Configuration with audio references
   */
  initializeModules(config = {}) {
    try {
      // console.log('🔧 Initializing AudioServiceFacade modules...')

      // Create module instances
      this.gestureAudioMapper = new (window.GestureAudioMapper || GestureAudioMapper)()
      this.polyphonyManager = new (window.PolyphonyManager || PolyphonyManager)()
      this.compositionPlayer = new (window.CompositionPlayer || CompositionPlayer)()
      this.generativeMusicEngine = new (window.GenerativeMusicEngine || GenerativeMusicEngine)()
      this.filterModulationSystem = new (window.FilterModulationSystem || FilterModulationSystem)()
      this.parameterController = new (window.ParameterController || ParameterController)(this.gestureAudioMapper)

      this.modulesInitialized = true
      // console.log('✅ AudioServiceFacade modules initialized')

      return true
    } catch (error) {
      // console.error('❌ Failed to initialize AudioServiceFacade modules:', error)
      return false
    }
  }

  /**
   * Set synth references for all modules
   * @param {Object} gestureSynth - Gesture synth instance
   * @param {Object} gestureFilter - Gesture filter instance
   */
  setSynths(gestureSynth, gestureFilter) {
    this.gestureSynth = gestureSynth
    this.gestureFilter = gestureFilter

    if (this.polyphonyManager) {
      this.polyphonyManager.setSynth(gestureSynth)
    }

    if (this.compositionPlayer) {
      this.compositionPlayer.setGestureSynth(gestureSynth)
    }

    if (this.filterModulationSystem) {
      this.filterModulationSystem.setGestureFilter(gestureFilter)
    }

    if (this.threeTierAudioSystem) {
      this.threeTierAudioSystem.setSynths(gestureSynth, gestureFilter)
    }

    if (this.parameterController) {
      this.parameterController.setAudioEngine({ gestureSynth, gestureFilter })
    }
  }

  /**
   * Set ambient layers and filters
   * @param {Object} ambientLayers - Ambient synth layers
   * @param {Object} ambientFilters - Ambient filters
   */
  setAmbientLayers(ambientLayers, ambientFilters) {
    this.ambientLayers = ambientLayers
    this.ambientFilters = ambientFilters

    if (this.compositionPlayer) {
      this.compositionPlayer.setAmbientLayers(ambientLayers)
    }

    if (this.generativeMusicEngine) {
      this.generativeMusicEngine.setAmbientLayers(ambientLayers)
      this.generativeMusicEngine.setAmbientFilters(ambientFilters)
    }

    if (this.filterModulationSystem) {
      this.filterModulationSystem.setAmbientFilters(ambientFilters)
    }

    if (this.threeTierAudioSystem) {
      this.threeTierAudioSystem.setAmbientFilters(ambientFilters)
    }
  }

  /**
   * Set master volume reference
   * @param {Object} masterVolume - Master volume node
   */
  setMasterVolume(masterVolume) {
    this.masterVolume = masterVolume

    if (this.generativeMusicEngine) {
      this.generativeMusicEngine.setMasterVolume(masterVolume)
    }

    if (this.threeTierAudioSystem) {
      this.threeTierAudioSystem.setMasterVolume(masterVolume)
    }
  }

  /**
   * Set generative state reference
   * @param {Object} generativeState - Generative state object
   */
  setGenerativeState(generativeState) {
    if (this.generativeMusicEngine) {
      this.generativeMusicEngine.setGenerativeState(generativeState)
    }

    if (this.threeTierAudioSystem) {
      this.threeTierAudioSystem.setGenerativeState(generativeState)
    }
  }

  /**
   * Set initialization state
   * @param {boolean} isInitialized - Whether audio is initialized
   */
  setInitialized(isInitialized) {
    this.isInitialized = isInitialized

    if (this.threeTierAudioSystem) {
      this.threeTierAudioSystem.setInitialized(isInitialized)
    }

    if (this.generativeMusicEngine) {
      this.generativeMusicEngine.setInitialized(isInitialized)
    }
  }

  /**
   * Set volume state
   * @param {number} volume - Volume level
   * @param {boolean} muted - Mute state
   */
  setVolumeState(volume, muted) {
    if (this.threeTierAudioSystem) {
      this.threeTierAudioSystem.setVolumeState(volume, muted)
    }

    if (this.generativeMusicEngine) {
      this.generativeMusicEngine.setVolumeState(volume, muted)
    }
  }

  // =============================================
  // GESTURE AUDIO MAPPING (delegates to GestureAudioMapper)
  // =============================================

  /**
   * Map gesture to audio parameters
   * @param {Object} gestureData - Gesture data
   * @returns {Object} Audio parameters
   */
  mapGestureToAudio(gestureData) {
    if (!this.gestureAudioMapper) return null
    return this.gestureAudioMapper.mapGestureToAudio(gestureData)
  }

  /**
   * Map gesture to frequency
   * @param {Object} sonicParams - Sonic parameters
   * @returns {number} Frequency in Hz
   */
  mapGestureToFrequency(sonicParams) {
    if (!this.gestureAudioMapper) return 440
    return this.gestureAudioMapper.mapGestureToFrequency(sonicParams)
  }

  /**
   * Map gesture to filter
   * @param {Object} sonicParams - Sonic parameters
   * @returns {Object} Filter parameters
   */
  mapGestureToFilter(sonicParams) {
    if (!this.gestureAudioMapper) return { cutoffFrequency: 1000, resonance: 1 }
    return this.gestureAudioMapper.mapGestureToFilter(sonicParams)
  }

  /**
   * Convert color to frequency
   * @param {string} color - Hex color string
   * @returns {number} Frequency in Hz
   */
  colorToFrequency(color) {
    if (!this.gestureAudioMapper) return 440
    return this.gestureAudioMapper.colorToFrequency(color)
  }

  // =============================================
  // POLYPHONY MANAGEMENT (delegates to PolyphonyManager)
  // =============================================

  /**
   * Trigger sustained note attack
   * @param {number} frequency - Note frequency
   * @param {number} velocity - Note velocity
   * @param {Object} position - Canvas position
   * @returns {Object} Note tracking data
   */
  triggerSustainedNoteAttack(frequency, velocity, position) {
    if (!this.polyphonyManager) return null
    return this.polyphonyManager.triggerSustainedNoteAttack(frequency, velocity, position)
  }

  /**
   * Trigger sustained note release
   * @param {string} noteId - Note ID
   */
  triggerSustainedNoteRelease(noteId) {
    if (this.polyphonyManager) {
      this.polyphonyManager.triggerSustainedNoteRelease(noteId)
    }
  }

  /**
   * Release all sustained notes
   */
  releaseAllSustainedNotes() {
    if (this.polyphonyManager) {
      this.polyphonyManager.releaseAllSustainedNotes()
    }
  }

  /**
   * Get active sustained notes count
   * @returns {number} Count of active sustained notes
   */
  getActiveSustainedNotesCount() {
    if (!this.polyphonyManager) return 0
    return this.polyphonyManager.getActiveSustainedNotesCount()
  }

  /**
   * Check if sustained note is active
   * @param {string} noteId - Note ID
   * @returns {boolean} True if active
   */
  isSustainedNoteActive(noteId) {
    if (!this.polyphonyManager) return false
    return this.polyphonyManager.isSustainedNoteActive(noteId)
  }

  /**
   * Release all voices
   */
  releaseAllVoices() {
    if (this.polyphonyManager) {
      this.polyphonyManager.releaseAll()
    }
  }

  // =============================================
  // COMPOSITION PLAYBACK (delegates to CompositionPlayer)
  // =============================================

  /**
   * Play a composition
   * @param {Object} composition - Composition data
   */
  playComposition(composition) {
    if (this.compositionPlayer) {
      this.compositionPlayer.playComposition(composition)
    }
  }

  /**
   * Play polyphonic composition
   * @param {Object} composition - Composition data
   */
  playPolyphonicComposition(composition) {
    if (this.compositionPlayer) {
      this.compositionPlayer.playPolyphonicComposition(composition)
    }
  }

  /**
   * Play a single musical event
   * @param {Object} event - Musical event data
   */
  playMusicalEvent(event) {
    if (this.compositionPlayer) {
      this.compositionPlayer.playMusicalEvent(event)
    }
  }

  /**
   * Stop composition playback
   */
  stopComposition() {
    if (this.compositionPlayer) {
      this.compositionPlayer.stopPlayback()
    }
  }

  // =============================================
  // GENERATIVE MUSIC (delegates to GenerativeMusicEngine)
  // =============================================

  /**
   * Start evolving generation
   */
  startEvolvingGeneration() {
    if (this.generativeMusicEngine) {
      this.generativeMusicEngine.startEvolvingGeneration()
    }
  }

  /**
   * Stop evolving generation
   */
  stopEvolvingGeneration() {
    if (this.generativeMusicEngine) {
      this.generativeMusicEngine.stopEvolvingGeneration()
    }
  }

  /**
   * Play a layer
   * @param {string} layerName - Layer name
   */
  playLayer(layerName) {
    if (this.generativeMusicEngine) {
      this.generativeMusicEngine.playLayer(layerName)
    }
  }

  /**
   * Advance harmony
   */
  advanceHarmony() {
    if (this.generativeMusicEngine) {
      this.generativeMusicEngine.advanceHarmony()
    }
  }

  /**
   * Update generative state
   */
  updateGenerativeState() {
    if (this.generativeMusicEngine) {
      this.generativeMusicEngine.updateGenerativeState()
    }
  }

  // =============================================
  // FILTER MODULATION (delegates to FilterModulationSystem)
  // =============================================

  /**
   * Handle hover modulation
   * @param {Object} hoverData - Hover data
   */
  handleHoverModulation(hoverData) {
    if (this.filterModulationSystem) {
      this.filterModulationSystem.handleHoverModulation(hoverData)
    }
  }

  /**
   * Update background filters
   * @param {Object} position - Position data
   */
  updateBackgroundFilters(position) {
    if (this.filterModulationSystem) {
      this.filterModulationSystem.updateBackgroundFilters(position)
    }
  }

  /**
   * Apply filter modulation
   * @param {Object} modulationData - Modulation data
   */
  applyFilterModulation(modulationData) {
    if (this.filterModulationSystem) {
      this.filterModulationSystem.applyFilterModulation(modulationData)
    }
  }

  /**
   * Reset filters to safe values
   */
  resetFiltersToSafeValues() {
    if (this.filterModulationSystem) {
      this.filterModulationSystem.resetFiltersToSafeValues()
    }
  }

  /**
   * Setup remote filter LFO
   * @param {number} lfoSpeed - LFO speed
   * @param {number} lfoAmplitude - LFO amplitude
   */
  setupRemoteFilterLFO(lfoSpeed, lfoAmplitude) {
    if (this.filterModulationSystem) {
      this.filterModulationSystem.setupRemoteFilterLFO(lfoSpeed, lfoAmplitude)
    }
  }

  /**
   * Stop remote filter LFO
   */
  stopRemoteFilterLFO() {
    if (this.filterModulationSystem) {
      this.filterModulationSystem.stopRemoteFilterLFO()
    }
  }

  // =============================================
  // PARAMETER CONTROL (delegates to ParameterController)
  // =============================================

  /**
   * Process gesture audio
   * @param {Object} gestureData - Gesture data
   * @returns {Object} Audio parameters
   */
  processGestureAudio(gestureData) {
    if (!this.parameterController) return null
    return this.parameterController.processGestureAudio(gestureData)
  }

  /**
   * Start update loop
   */
  startUpdateLoop() {
    if (this.parameterController) {
      this.parameterController.startUpdateLoop()
    }
  }

  /**
   * Stop update loop
   */
  stopUpdateLoop() {
    if (this.parameterController) {
      this.parameterController.stopUpdateLoop()
    }
  }

  /**
   * Get current parameters
   * @returns {Object} Current parameters
   */
  getCurrentParameters() {
    if (!this.parameterController) return {}
    return this.parameterController.getCurrentParameters()
  }

  /**
   * Get performance stats
   * @returns {Object} Performance metrics
   */
  getPerformanceStats() {
    if (!this.parameterController) return {}
    return this.parameterController.getPerformanceStats()
  }

  // =============================================
  // CLEANUP
  // =============================================

  /**
   * Cleanup all modules
   */
  cleanup() {
    // console.log('🧹 Cleaning up AudioServiceFacade modules...')

    if (this.parameterController) {
      this.parameterController.cleanup()
    }

    if (this.polyphonyManager) {
      this.polyphonyManager.releaseAll()
    }

    if (this.compositionPlayer) {
      this.compositionPlayer.cleanup()
    }

    if (this.generativeMusicEngine) {
      this.generativeMusicEngine.cleanup()
    }

    if (this.filterModulationSystem) {
      this.filterModulationSystem.cleanup()
    }

    this.isInitialized = false
    // console.log('✅ AudioServiceFacade cleanup completed')
  }

  /**
   * Get module status
   * @returns {Object} Module status
   */
  getModuleStatus() {
    return {
      modulesInitialized: this.modulesInitialized,
      gestureAudioMapper: !!this.gestureAudioMapper,
      polyphonyManager: !!this.polyphonyManager,
      compositionPlayer: !!this.compositionPlayer,
      generativeMusicEngine: !!this.generativeMusicEngine,
      filterModulationSystem: !!this.filterModulationSystem,
      parameterController: !!this.parameterController,
      threeTierAudioSystem: !!this.threeTierAudioSystem,
      performanceStats: this.getPerformanceStats(),
      activeSustainedNotes: this.getActiveSustainedNotesCount()
    }
  }
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.AudioServiceFacade = AudioServiceFacade
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioServiceFacade
}
