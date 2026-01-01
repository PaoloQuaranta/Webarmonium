/**
 * Webarmonium Landing Page - Main Entry Point
 *
 * Architecture:
 * 1. StateManager - Central state for metrics, parameters, and playback
 * 2. MetricsCollectorService - Polls external APIs (Wikipedia, HN, GitHub)
 * 3. MetricsToGestureAdapter - Converts metrics to gesture format
 * 4. GenerativeVisualService (REUSED) - Renders spring-mesh visuals
 * 5. AudioService (REUSED) - Generates audio from gestures
 * 6. DashboardUI - Updates the educational dashboard
 * 7. BackgroundMusicGenerator - Generates ambient background music
 *
 * Key Design: REUSES existing AudioService and GenerativeVisualService
 * from the main application without any modifications.
 */

import { MetricsCollectorService, MockMetricsGenerator } from './MetricsCollectorService.js'
import { MetricsToGestureAdapter } from './MetricsToGestureAdapter.js'
import { DashboardUI } from './DashboardUI.js'
import { stateManager } from './StateManager.js'

/**
 * BackgroundMusicGenerator
 * Generates ambient background music to match room architecture
 * Similar to backend's background-composition events
 */
class BackgroundMusicGenerator {
  constructor(audioService) {
    this.audioService = audioService
    this.isPlaying = false
    this.compositionInterval = null
    this.currentSection = 0

    // Musical parameters for ambient generation
    this.scales = {
      pentatonic: [0, 2, 4, 7, 9],
      minor: [0, 2, 3, 5, 7, 8, 10],
      major: [0, 2, 4, 5, 7, 9, 11]
    }
    this.currentScale = 'pentatonic'
    this.rootNote = 48 // C3
  }

  start() {
    if (this.isPlaying) return
    this.isPlaying = true
    this._scheduleNextComposition()
    console.log('🎵 Background music generator started')
  }

  stop() {
    if (!this.isPlaying) return
    this.isPlaying = false
    if (this.compositionInterval) {
      clearTimeout(this.compositionInterval)
      this.compositionInterval = null
    }
    console.log('🎵 Background music generator stopped')
  }

  /**
   * Schedule next ambient composition
   * @private
   */
  _scheduleNextComposition() {
    if (!this.isPlaying) return

    // Generate and play composition
    const composition = this._generateAmbientComposition()
    if (this.audioService && typeof this.audioService.playComposition === 'function') {
      this.audioService.playComposition(composition, true) // isDrone = true for ambient
    }

    // Schedule next composition (every 8-16 seconds for ambient feel)
    const nextDelay = 8000 + Math.random() * 8000
    this.compositionInterval = setTimeout(() => {
      this._scheduleNextComposition()
    }, nextDelay)
  }

  /**
   * Generate ambient composition
   * @private
   */
  _generateAmbientComposition() {
    const scale = this.scales[this.currentScale]
    const voices = []

    // Generate 3-4 voices for ambient polyphony
    const voiceCount = 3 + Math.floor(Math.random() * 2)

    for (let i = 0; i < voiceCount; i++) {
      const voice = {
        notes: [],
        duration: 8 + Math.random() * 8, // 8-16 seconds
        velocity: 0.1 + Math.random() * 0.2, // Quiet for ambient (0.1-0.3)
        pan: -0.5 + Math.random() // Random pan position
      }

      // Generate 3-5 notes per voice
      const noteCount = 3 + Math.floor(Math.random() * 3)
      for (let j = 0; j < noteCount; j++) {
        const scaleDegree = scale[Math.floor(Math.random() * scale.length)]
        const octaveOffset = Math.floor(Math.random() * 2) // 0-1 octaves up
        const midiNote = this.rootNote + scaleDegree + (octaveOffset * 12)

        voice.notes.push({
          midi: midiNote,
          duration: 2 + Math.random() * 4, // 2-6 seconds per note
          startTime: j * (voice.duration / noteCount) // Spread across duration
        })
      }

      voices.push(voice)
    }

    return {
      type: 'polyphonic',
      content: { voices },
      metadata: {
        tempo: 60, // Slow tempo for ambient
        keyCenter: 'C'
      },
      structure: {
        form: 'ambient',
        currentSection: this.currentSection++ % 4
      }
    }
  }

  /**
   * Update musical parameters based on metrics
   * @param {Object} params - { complexity, rhythmicPreference, harmonicComplexity }
   */
  updateParameters(params) {
    // Change scale based on complexity
    if (params.complexity > 0.7) {
      this.currentScale = 'minor'
    } else if (params.complexity < 0.3) {
      this.currentScale = 'pentatonic'
    } else {
      this.currentScale = 'major'
    }
  }
}

/**
 * LandingApp
 * Main application class for the landing page
 */
class LandingApp {
  constructor() {
    // Services
    this.metricsCollector = new MetricsCollectorService()
    this.metricsAdapter = new MetricsToGestureAdapter()
    this.dashboardUI = new DashboardUI()

    // Reused services (loaded via global scripts)
    this.visualService = null
    this.audioService = null
    this.backgroundMusic = null

    // State
    this.isInitialized = false
    this.isRunning = false

    // Canvas container
    this.canvasContainer = null

    // Mock mode
    this.mockMode = false
  }

  /**
   * Initialize the landing page
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn('LandingApp already initialized')
      return
    }

    console.log('🚀 Initializing Webarmonium Landing Page...')

    try {
      // Cache canvas container
      this.canvasContainer = document.getElementById('canvas-container')
      if (!this.canvasContainer) {
        throw new Error('Canvas container not found')
      }

      // Initialize reused visual service
      if (typeof GenerativeVisualService !== 'undefined') {
        this.visualService = new GenerativeVisualService()
        this.visualService.initialize(this.canvasContainer)
        console.log('✅ GenerativeVisualService initialized')
      } else {
        console.error('❌ GenerativeVisualService not available')
      }

      // Wait for user interaction to initialize audio (browser policy)
      this._setupAudioInitialization()

      // Initialize dashboard UI
      this.dashboardUI.initialize({
        onStart: () => this.start(),
        onStop: () => this.stop()
      })

      // Setup mock mode toggle
      this._setupMockMode()

      // Update metrics collector when state changes
      window.addEventListener('metrics:updated', (event) => {
        stateManager.updateMetrics('wikipedia', event.detail.wikipedia)
        stateManager.updateMetrics('hackernews', event.detail.hackernews)
        stateManager.updateMetrics('github', event.detail.github)
      })

      this.isInitialized = true
      console.log('✅ Landing page initialized')

    } catch (error) {
      console.error('❌ Error during initialization:', error)
      this.dashboardUI.showError(`Initialization error: ${error.message}`)
    }
  }

  /**
   * Setup audio initialization on user interaction
   * @private
   */
  _setupAudioInitialization() {
    const initAudio = async () => {
      if (this.audioService) return

      try {
        // Start Tone.js context
        await Tone.start()

        // Initialize AudioService (from global scope)
        if (typeof AudioService !== 'undefined') {
          this.audioService = new AudioService()
          await this.audioService.initialize()
          console.log('✅ AudioService initialized')

          // Create the continuous generative system (same as rooms: background + tap + phrases)
          this.audioService.createContinuousGenerativeSystem()
          console.log('✅ Continuous generative system created')

          // Connect adapter to services
          this.metricsAdapter.initialize(this.visualService, this.audioService)

          // Create background music generator
          this.backgroundMusic = new BackgroundMusicGenerator(this.audioService)
          console.log('✅ Background music generator created')
        }
      } catch (error) {
        console.error('❌ Error initializing audio:', error)
        this.dashboardUI.showError('Audio initialization failed')
      }

      // Remove listeners
      document.removeEventListener('click', initAudio)
      document.removeEventListener('keydown', initAudio)
    }

    document.addEventListener('click', initAudio)
    document.addEventListener('keydown', initAudio)
  }

  /**
   * Setup mock mode toggle
   * @private
   */
  _setupMockMode() {
    const mockToggle = document.getElementById('mock-mode')
    if (!mockToggle) return

    mockToggle.addEventListener('change', (e) => {
      this.mockMode = e.target.checked

      if (this.mockMode) {
        const mockGenerator = new MockMetricsGenerator()
        this.metricsCollector.enableMockMode(mockGenerator)
        this.dashboardUI.showStatus('Demo mode enabled')
      } else {
        this.dashboardUI.showStatus('Live data enabled')
      }
    })
  }

  /**
   * Start the experience
   */
  async start() {
    if (this.isRunning) {
      console.warn('LandingApp already running')
      return
    }

    console.log('▶️ Starting Webarmonium Landing Page...')

    try {
      // Ensure audio is initialized
      if (!this.audioService && typeof AudioService !== 'undefined') {
        await Tone.start()
        this.audioService = new AudioService()
        await this.audioService.initialize()
        this.metricsAdapter.initialize(this.visualService, this.audioService)
        this.backgroundMusic = new BackgroundMusicGenerator(this.audioService)
      }

      // Start background music (ambient drone like in rooms)
      if (this.backgroundMusic) {
        this.backgroundMusic.start()
      }

      // Start metrics collection
      this.metricsCollector.start()

      // Start metrics to gesture adapter
      this.metricsAdapter.start()

      // Update state
      stateManager.setPlayback(true)
      this.isRunning = true

      console.log('✅ Landing page started')
      this.dashboardUI.showStatus('Experience started')

    } catch (error) {
      console.error('❌ Error starting experience:', error)
      this.dashboardUI.showError(`Start error: ${error.message}`)
    }
  }

  /**
   * Stop the experience
   */
  stop() {
    if (!this.isRunning) {
      console.warn('LandingApp not running')
      return
    }

    console.log('⏸ Stopping Webarmonium Landing Page...')

    try {
      // Stop background music
      if (this.backgroundMusic) {
        this.backgroundMusic.stop()
      }

      // Stop metrics collection
      this.metricsCollector.stop()

      // Stop metrics adapter
      this.metricsAdapter.stop()

      // Update state
      stateManager.setPlayback(false)
      this.isRunning = false

      console.log('✅ Landing page stopped')
      this.dashboardUI.showStatus('Experience stopped')

    } catch (error) {
      console.error('❌ Error stopping experience:', error)
      this.dashboardUI.showError(`Stop error: ${error.message}`)
    }
  }

  /**
   * Cleanup and dispose
   */
  dispose() {
    console.log('🧹 Cleaning up LandingApp...')

    this.stop()

    // Dispose dashboard
    this.dashboardUI.dispose()

    // Dispose visual service
    if (this.visualService) {
      this.visualService.dispose()
      this.visualService = null
    }

    // Dispose audio service
    if (this.audioService && typeof this.audioService.dispose === 'function') {
      this.audioService.dispose()
      this.audioService = null
    }

    this.isInitialized = false
    console.log('✅ LandingApp disposed')
  }
}

/**
 * Initialize on DOM ready
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.landingApp = new LandingApp()
    window.landingApp.initialize()
  })
} else {
  window.landingApp = new LandingApp()
  window.landingApp.initialize()
}

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
  if (window.landingApp) {
    window.landingApp.dispose()
  }
})

export default LandingApp
