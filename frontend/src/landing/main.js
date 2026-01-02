/**
 * Webarmonium Landing Page - Main Entry Point (Backend-Driven)
 *
 * Architecture:
 * 1. Socket.io client - Connects to backend for compositions and metrics
 * 2. GenerativeVisualService (REUSED) - Renders spring-mesh visuals for virtual users
 * 3. AudioService (REUSED) - Plays compositions from backend
 * 4. DashboardUI - Displays real-time metrics from backend
 *
 * Backend-driven:
 * - WebMetricsPoller (backend) polls Wikipedia/HN/GitHub APIs
 * - LandingCompositionService (backend) generates compositions
 * - Frontend receives compositions + cursors + metrics via socket.io
 */

import { DashboardUI } from './DashboardUI.js'

/**
 * LandingApp
 * Main application class for the landing page
 * Socket.io client that receives compositions from backend
 */
class LandingApp {
  constructor() {
    // Services
    this.dashboardUI = new DashboardUI()

    // Reused services (loaded via global scripts)
    this.visualService = null
    this.audioService = null

    // Socket.io connection
    this.socket = null
    this.socketUrl = 'http://localhost:3001'

    // State
    this.isInitialized = false
    this.isRunning = false

    // Canvas container
    this.canvasContainer = null

    // Current cursors and metrics from backend
    this.currentCursors = {}
    this.currentMetrics = {}
    this.previousCursors = {} // For detecting cursor movement

    // Track active virtual notes for hold:end events
    this.virtualNotes = new Map()
  }

  /**
   * Initialize the landing page
   */
  async initialize() {
    if (this.isInitialized) {
      console.warn('LandingApp already initialized')
      return
    }

    console.log('🚀 Initializing Webarmonium Landing Page (Backend-Driven)...')

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

      // Remove mock mode toggle (no longer needed - backend handles metrics)
      this._removeMockModeToggle()

      this.isInitialized = true
      console.log('✅ Landing page initialized (waiting for Start)')

    } catch (error) {
      console.error('❌ Error during initialization:', error)
      this.dashboardUI.showError(`Initialization error: ${error.message}`)
    }
  }

  /**
   * Remove mock mode toggle from UI (no longer needed)
   * @private
   */
  _removeMockModeToggle() {
    const mockToggle = document.getElementById('mock-mode')
    if (mockToggle && mockToggle.parentElement) {
      mockToggle.parentElement.remove()
      console.log('🗑️ Mock mode toggle removed (backend handles metrics)')
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

          // Create the continuous generative system (same as rooms)
          this.audioService.createContinuousGenerativeSystem()
          console.log('✅ Continuous generative system created')

          // CRITICAL: Start the audio service to activate Transport and effects
          await this.audioService.start()
          console.log('✅ AudioService started - Transport and effects activated')
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
   * Setup socket.io connection to backend
   * @private
   */
  _setupSocketConnection() {
    if (this.socket) {
      console.log('Socket already connected')
      return
    }

    try {
      // Connect to backend
      this.socket = io(this.socketUrl)

      // Connection events
      this.socket.on('connect', () => {
        console.log('✅ Connected to backend')

        // Join landing room
        this.socket.emit('join-landing', (response) => {
          console.log('📡 join-landing response:', response)
          if (response && response.success) {
            console.log('✅ Joined landing room:', response.roomId)

            // Initialize cursors and metrics from backend
            if (response.cursors) {
              this.currentCursors = response.cursors
              this._updateVisualCursors()
            }

            if (response.metrics) {
              this.currentMetrics = response.metrics
              this.dashboardUI.updateMetrics(this.currentMetrics)
            }
          }
        })
      })

      this.socket.on('disconnect', () => {
        console.log('❌ Disconnected from backend')
      })

      this.socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error)
        this.dashboardUI.showError('Backend connection failed')
      })

      // Listen for landing-joined event
      this.socket.on('landing-joined', (data) => {
        console.log('✅ Landing joined:', data.roomId)
      })

      // Listen for background compositions from backend
      this.socket.on('background-composition', (data) => {
        if (!this.isRunning) return

        console.log('🎵 Received composition from backend:', data.composition?.type)

        // Play composition
        if (this.audioService && data.composition) {
          if (typeof this.audioService.playComposition === 'function') {
            this.audioService.playComposition(data.composition, data.isDrone || false)
          } else {
            console.warn('⚠️ playComposition not available on AudioService')
          }
        }
      })

      // Listen for virtual cursor updates from backend
      this.socket.on('virtual-cursors', (data) => {
        if (!this.isRunning) return

        if (data.cursors) {
          this.currentCursors = data.cursors
          this._updateVisualCursors()
        }
      })

      // Listen for metrics updates from backend
      this.socket.on('metrics-update', (data) => {
        if (!this.isRunning) return

        if (data.metrics) {
          this.currentMetrics = data.metrics
          this.dashboardUI.updateMetrics(this.currentMetrics)
        }
      })

      // Listen for hold:start events from virtual users (for particles/pulses)
      this.socket.on('hold:start', (data) => {
        if (!this.isRunning) return
        if (!data.isRemote) return // Only handle virtual user events

        this._handleVirtualHoldStart(data)
      })

      // Listen for hold:end events from virtual users
      this.socket.on('hold:end', (data) => {
        if (!this.isRunning) return

        this._handleVirtualHoldEnd(data)
      })

    } catch (error) {
      console.error('❌ Error setting up socket connection:', error)
      this.dashboardUI.showError('Socket setup failed')
    }
  }

  /**
   * Update visual cursors from backend data
   * Also triggers particles/pulses and filter modulations on cursor movement
   * @private
   */
  _updateVisualCursors() {
    if (!this.visualService) return

    for (const [source, cursor] of Object.entries(this.currentCursors)) {
      const userId = cursor.userId || `${source}-metrics`
      const x = cursor.x
      const y = cursor.y
      const color = cursor.color

      // Check if cursor moved significantly (to trigger effects)
      const prevCursor = this.previousCursors?.[source]
      let hasMoved = false
      let movementDistance = 0

      if (prevCursor) {
        const dx = x - prevCursor.x
        const dy = y - prevCursor.y
        movementDistance = Math.sqrt(dx * dx + dy * dy)
        hasMoved = movementDistance > 0.005 // Lower threshold for more responsive effects
      }

      // Update cursor position
      this.visualService.updateCursorPosition(userId, x, y, color)

      // Trigger effects on cursor movement
      if (this.isRunning) {
        // ALWAYS modulate filter based on cursor position
        // Filter adds richness on top of virtual notes (not blocking them)
        if (this.audioService?.gestureFilter) {
          const filterFreq = 200 + (x * 7800) // 200Hz - 8000Hz
          const filterQ = 0.5 + (y * 3) // 0.5 - 3.5
          this.audioService.gestureFilter.frequency.set({ value: filterFreq })
          this.audioService.gestureFilter.Q.set({ value: filterQ })
        }

        // Emit particles based on movement distance
        if (hasMoved && this.visualService.particles) {
          const particleCount = Math.min(Math.round(movementDistance * 100), 8) // Up to 8 particles
          this.visualService.particles.emitParticles(userId, Math.max(particleCount, 1))
        }

        // Trigger pulse on larger movements
        if (hasMoved && movementDistance > 0.02 && this.visualService.wavePackets) {
          this.visualService.wavePackets.emitPulse(userId, color)
        }
      }
    }

    // Store current cursors for next comparison
    this.previousCursors = { ...this.currentCursors }
  }

  /**
   * Handle virtual hold:start event from backend
   * Plays note and triggers particles/pulses
   * @param {Object} data - hold:start data
   * @private
   */
  _handleVirtualHoldStart(data) {
    if (!this.audioService || !this.visualService) return

    // CRITICAL: Verify gestureSynth exists before proceeding
    if (!this.audioService.gestureSynth) {
      console.warn('⚠️ gestureSynth not initialized - skipping note playback')
      return
    }

    const { userId, noteId, frequency, velocity, position, userColor } = data

    // Check if Tone.js is available
    if (typeof window.Tone === 'undefined') {
      console.error('❌ Tone.js not loaded')
      return
    }

    // CRITICAL: Open filter wide for rich sawtooth harmonics
    if (this.audioService.gestureFilter) {
      this.audioService.gestureFilter.frequency.value = 12000 // Open filter for harmonics
      this.audioService.gestureFilter.Q.value = 0.1 // Low resonance for open sound
    }

    // Play note using gestureSynth (sawtooth waves) with delay/reverb
    const synth = this.audioService.gestureSynth
    if (synth) {
      if (typeof synth.triggerAttackRelease === 'function') {
        // CRITICAL: Longer duration for delay/reverb tail to be audible
        const duration = 1.0 // 1 second for delay/reverb tail
        const now = window.Tone.now()

        // Create the note with full FX chain (sawtooth → filter → delay → reverb)
        synth.triggerAttackRelease(frequency, duration, now, velocity)

        console.log(`🎵 Virtual TAP [sawtooth+FX]: ${userId} - ${frequency.toFixed(1)}Hz - vel ${velocity.toFixed(2)}`)
      } else if (typeof synth.triggerAttack === 'function') {
        // Fallback to triggerAttack + triggerRelease
        synth.triggerAttack(frequency, window.Tone.now(), velocity)
        setTimeout(() => {
          if (synth && typeof synth.triggerRelease === 'function') {
            synth.triggerRelease(frequency)
          }
        }, 1000) // Longer duration for delay/reverb
        console.log(`🎵 Virtual TAP (fallback): ${userId} - ${frequency.toFixed(1)}Hz`)
      } else {
        console.warn('⚠️ gestureSynth has no trigger methods')
      }
    } else {
      console.warn('⚠️ gestureSynth not available - audioService may not be initialized')
    }

    // Trigger particles based on velocity
    if (this.visualService.particles) {
      const particleCount = Math.round(3 + velocity * 8) // 3-11 particles
      this.visualService.particles.emitParticles(userId, particleCount)
    }

    // Trigger pulse
    if (this.visualService.wavePackets) {
      this.visualService.wavePackets.emitPulse(userId, userColor)
    }
  }

  /**
   * Handle virtual hold:end event from backend
   * Releases the sustained note
   * @param {Object} data - hold:end data
   * @private
   */
  _handleVirtualHoldEnd(data) {
    if (!this.audioService) return

    const { noteId } = data
    const note = this.virtualNotes.get(noteId)

    if (note) {
      const synth = this.audioService.gestureSynth
      if (synth && typeof synth.triggerRelease === 'function') {
        synth.triggerRelease(note.frequency)
        console.log(`🎵 Virtual note released: ${note.userId}`)
      }
      this.virtualNotes.delete(noteId)
    }
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
    console.log('🔌 Connecting to backend and joining landing room...')

    try {
      // Ensure audio is initialized
      if (!this.audioService && typeof AudioService !== 'undefined') {
        await Tone.start()
        this.audioService = new AudioService()
        await this.audioService.initialize()
        this.audioService.createContinuousGenerativeSystem()
      }

      // CRITICAL: Start the audio service to activate Transport and restore volume
      if (this.audioService && typeof this.audioService.start === 'function') {
        await this.audioService.start()
        console.log('✅ AudioService started - Transport and volume activated')
      }

      // Setup socket connection
      this._setupSocketConnection()

      // Update state
      this.isRunning = true

      console.log('✅ Landing page started (receiving from backend)')
      this.dashboardUI.showStatus('Experience started - Connected to backend')

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
      // Disconnect socket
      if (this.socket) {
        this.socket.disconnect()
        this.socket = null
      }

      // Update state
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
