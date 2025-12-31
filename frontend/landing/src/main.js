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
 *
 * Key Design: REUSES existing AudioService and GenerativeVisualService
 * from the main application without any modifications.
 */

import { MetricsCollectorService, MockMetricsGenerator } from './MetricsCollectorService.js'
import { MetricsToGestureAdapter } from './MetricsToGestureAdapter.js'
import { DashboardUI } from './DashboardUI.js'
import { stateManager } from './StateManager.js'

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

          // Connect adapter to services
          this.metricsAdapter.initialize(this.visualService, this.audioService)
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
