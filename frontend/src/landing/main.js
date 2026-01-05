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

    // console.log('🚀 Initializing Webarmonium Landing Page (Backend-Driven)...')

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
        // console.log('✅ GenerativeVisualService initialized')
      } else {
        console.error('❌ GenerativeVisualService not available')
      }

      // Wait for user interaction to initialize audio (browser policy)
      this._setupAudioInitialization()

      // Initialize dashboard UI
      this.dashboardUI.initialize({
        onStart: () => this.start(),
        onStop: () => this.stop(),
        onVolumeChange: (volume) => this.handleVolumeChange(volume)
      })

      // Remove mock mode toggle (no longer needed - backend handles metrics)
      this._removeMockModeToggle()

      this.isInitialized = true
      // console.log('✅ Landing page initialized (waiting for Start)')

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
      // console.log('🗑️ Mock mode toggle removed (backend handles metrics)')
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
          // console.log('✅ AudioService initialized')

          // Create the continuous generative system (same as rooms)
          this.audioService.createContinuousGenerativeSystem()
          // console.log('✅ Continuous generative system created')

          // CRITICAL: Start the audio service to activate Transport and effects
          await this.audioService.start()
          // console.log('✅ AudioService started - Transport and effects activated')
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
      // Dynamic URL: localhost dev uses port 3001, production uses same origin (nginx proxy)
      const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
      const socketUrl = isDevelopment
        ? 'http://localhost:3001'
        : `${window.location.protocol}//${window.location.host}`

      console.log(`🔌 Landing page connecting to: ${socketUrl}`)

      // Connect to backend
      this.socket = io(socketUrl)

      // Connection events
      this.socket.on('connect', () => {
        // console.log('✅ Connected to backend')

        // Join landing room
        this.socket.emit('join-landing', (response) => {
          // console.log('📡 join-landing response:', response)
          if (response && response.success) {
            // console.log('✅ Joined landing room:', response.roomId)

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
        // console.log('❌ Disconnected from backend')
      })

      this.socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error)
        this.dashboardUI.showError('Backend connection failed')
      })

      // Listen for landing-joined event
      this.socket.on('landing-joined', (data) => {
        // console.log('✅ Landing joined:', data.roomId)
      })

      // Listen for background compositions from backend
      this.socket.on('background-composition', (data) => {
        if (!this.isRunning) return

        // console.log('🎵 Received background composition:', {
        //   type: data.composition?.type,
        //   form: data.composition?.structure?.form,
        //   tempo: data.composition?.metadata?.tempo,
        //   key: data.composition?.metadata?.keyCenter,
        //   compositionNumber: data.compositionNumber
        // })

        // Play composition
        if (this.audioService && data.composition) {
          if (typeof this.audioService.playComposition === 'function') {
            this.audioService.playComposition(data.composition, data.isDrone || false)
            // console.log('🎵 Background composition sent to AudioService')
          } else {
            console.warn('⚠️ playComposition not available on AudioService')
          }
        } else {
          console.warn('⚠️ AudioService not available or no composition data')
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

          // Apply delay modulation based on metrics (same as normal rooms)
          this._applyDelayModulation()
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

      // Listen for musical:event (tap notes) from virtual users
      this.socket.on('musical:event', (data) => {
        if (!this.isRunning) return
        if (!data.isRemote) return // Only handle virtual user events

        this._handleVirtualTapNote(data)

        // Forward musical events to visual service for nebulas and attractors
        if (this.visualService && this.visualService.onMusicalEvent) {
          this.visualService.onMusicalEvent({
            type: data.type || 'tap',
            velocity: data.velocity || 0.5,
            pitch: data.pitch
          })
        }
      })

      // Listen for unified modulation from HoverOrchestrator
      this.socket.on('unified-modulation', (modulationData) => {
        if (!this.isRunning) return

        // console.log('🎵 Received unified modulation:', modulationData.modulation)

        // Apply modulation to AudioService
        if (this.audioService && this.audioService.applyUnifiedModulation) {
          this.audioService.applyUnifiedModulation(modulationData)
        }
      })

    } catch (error) {
      console.error('❌ Error setting up socket connection:', error)
      this.dashboardUI.showError('Socket setup failed')
    }
  }

  /**
   * Update visual cursors from backend data
   * Also triggers particles/pulses on cursor movement
   * Applies filter modulation based on cursor position
   * @private
   */
  _updateVisualCursors() {
    if (!this.visualService) return

    for (const [source, cursor] of Object.entries(this.currentCursors)) {
      const userId = cursor.userId || `${source}-metrics`
      const x = cursor.x
      const y = cursor.y
      const color = cursor.color

      // Update cursor position
      this.visualService.updateCursorPosition(userId, x, y, color)

      // CRITICAL: Apply filter modulation based on cursor position to BOTH gesture AND background
      // X position → filter frequency (200-8000Hz range)
      // Y position → filter resonance (0.5-10 range)
      if (this.isRunning && this.audioService) {
        // Calculate base filter frequency from X position (normalized 0-1 → 200-8000Hz)
        const minFreq = 200
        const maxFreq = 8000
        const baseFreq = minFreq + (x * (maxFreq - minFreq))

        // Calculate filter resonance from Y position (normalized 0-1 → 0.5-10)
        const minQ = 0.5
        const maxQ = 10
        const baseQ = minQ + (y * (maxQ - minQ))

        // Apply to gestureFilter (virtual gesture notes)
        if (this.audioService.gestureFilter) {
          this.audioService.gestureFilter.frequency.rampTo(baseFreq, 0.2)
          this.audioService.gestureFilter.Q.rampTo(baseQ, 0.2)
        }

        // CRITICAL: Also apply to ambientFilters (background composition) for AUDIBLE modulation
        if (this.audioService.ambientFilters) {
          // Bass: lower frequency range
          if (this.audioService.ambientFilters.bass) {
            const bassFreq = baseFreq * 0.15 // 30-1200Hz range for bass
            const bassQ = baseQ * 0.8
            this.audioService.ambientFilters.bass.frequency.rampTo(Math.max(30, Math.min(1200, bassFreq)), 0.2)
            this.audioService.ambientFilters.bass.Q.rampTo(Math.max(0.5, Math.min(5, bassQ)), 0.2)
          }

          // Pad: mid frequency range
          if (this.audioService.ambientFilters.pad) {
            const padFreq = baseFreq * 0.4 // 80-3200Hz range for pad
            const padQ = baseQ * 1.2
            this.audioService.ambientFilters.pad.frequency.rampTo(Math.max(80, Math.min(3200, padFreq)), 0.2)
            this.audioService.ambientFilters.pad.Q.rampTo(Math.max(0.5, Math.min(8, padQ)), 0.2)
          }

          // Chords: upper-mid frequency range
          if (this.audioService.ambientFilters.chords) {
            const chordsFreq = baseFreq * 0.8 // 160-6400Hz range for chords
            const chordsQ = baseQ * 1.5
            this.audioService.ambientFilters.chords.frequency.rampTo(Math.max(160, Math.min(6400, chordsFreq)), 0.2)
            this.audioService.ambientFilters.chords.Q.rampTo(Math.max(0.5, Math.min(10, chordsQ)), 0.2)
          }
        }
      }
    }

    // EMIT VIRTUAL HOVER EVENTS for HoverOrchestrator
    this._emitVirtualHoverEvents()

    // Store current cursors for next comparison
    this.previousCursors = { ...this.currentCursors }
  }

  /**
   * Emit virtual hover events to backend for HoverOrchestrator processing
   * Sends hover events for all virtual cursors
   * @private
   */
  _emitVirtualHoverEvents() {
    if (!this.socket || !this.socket.connected) return

    for (const [source, cursor] of Object.entries(this.currentCursors)) {
      const userId = cursor.userId || `${source}-metrics`

      // Calculate velocity from cursor movement
      const prevCursor = this.previousCursors?.[source]
      let velocity = 50  // Default velocity
      let intensity = 0.5  // Default intensity

      if (prevCursor) {
        const dx = cursor.x - prevCursor.x
        const dy = cursor.y - prevCursor.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        velocity = Math.min(distance * 1000, 100)  // Scale to 0-100
        intensity = Math.min(distance, 1.0)
      }

      // Emit hover-update event (NORMAL ROOM FORMAT)
      // See: frontend/src/services/gesture/HoverProcessor.js:169-184
      this.socket.emit('hover-update', {
        userId: userId,
        roomId: 'landing-room',
        position: {
          x: cursor.x,
          y: cursor.y
        },
        velocity: velocity,
        intensity: intensity,
        timestamp: Date.now()
      })
    }
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

    const { userId, frequency, velocity, duration, userColor } = data

    // CRITICAL: Validate frequency before processing
    if (frequency === null || frequency === undefined || isNaN(frequency)) {
      console.warn('⚠️ Invalid frequency in hold:start event:', { frequency, userId, data })
      return
    }

    // CRITICAL: Validate velocity before processing
    if (velocity === null || velocity === undefined || isNaN(velocity)) {
      console.warn('⚠️ Invalid velocity in hold:start event:', { velocity, userId, data })
      return
    }

    // Check if Tone.js is available
    if (typeof window.Tone === 'undefined') {
      console.error('❌ Tone.js not loaded')
      return
    }

    // Play note using gestureSynth (sawtooth waves) with delay/reverb
    const synth = this.audioService.gestureSynth
    if (synth) {
      if (typeof synth.triggerAttackRelease === 'function') {
        // CRITICAL: Use variable duration from backend (200-2000ms based on metric intensity)
        const noteDuration = duration || 1.0  // Fallback to 1s if not provided
        const now = window.Tone.now()

        // Create the note with full FX chain (sawtooth → filter → delay → reverb)
        synth.triggerAttackRelease(frequency, noteDuration, now, velocity)

        // console.log(`🎵 Virtual TAP [sawtooth+FX]: ${userId} - ${frequency.toFixed(1)}Hz - vel ${velocity.toFixed(2)} - dur ${(noteDuration * 1000).toFixed(0)}ms`)
      } else if (typeof synth.triggerAttack === 'function') {
        // Fallback to triggerAttack + triggerRelease
        synth.triggerAttack(frequency, window.Tone.now(), velocity)
        const fallbackDuration = (duration || 1.0) * 1000  // Convert to ms
        setTimeout(() => {
          if (synth && typeof synth.triggerRelease === 'function') {
            synth.triggerRelease(frequency)
          }
        }, fallbackDuration)
        // console.log(`🎵 Virtual TAP (fallback): ${userId} - ${frequency.toFixed(1)}Hz - ${fallbackDuration.toFixed(0)}ms`)
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

    // Flash the corresponding meter
    const source = this._extractSourceFromUserId(userId)
    if (source) {
      this.dashboardUI.flashSource(source, 'velocity')
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
        // console.log(`🎵 Virtual note released: ${note.userId}`)
      }
      this.virtualNotes.delete(noteId)
    }
  }

  /**
   * Handle virtual tap note (musical:event) from backend
   * Plays short percussive note and triggers particles/pulses
   * @param {Object} data - musical:event data
   * @private
   */
  _handleVirtualTapNote(data) {
    if (!this.audioService || !this.visualService) return

    // CRITICAL: Verify gestureSynth exists before proceeding
    if (!this.audioService.gestureSynth) {
      console.warn('⚠️ gestureSynth not initialized - skipping tap note playback')
      return
    }

    const { userId, frequency, velocity, duration, userColor } = data

    // CRITICAL: Validate frequency before processing
    if (frequency === null || frequency === undefined || isNaN(frequency)) {
      console.warn('⚠️ Invalid frequency in musical:event:', { frequency, userId, data })
      return
    }

    // CRITICAL: Validate velocity before processing
    if (velocity === null || velocity === undefined || isNaN(velocity)) {
      console.warn('⚠️ Invalid velocity in musical:event:', { velocity, userId, data })
      return
    }

    // Check if Tone.js is available
    if (typeof window.Tone === 'undefined') {
      console.error('❌ Tone.js not loaded')
      return
    }

    // Play tap note using gestureSynth (short percussive)
    const synth = this.audioService.gestureSynth
    const tapDuration = duration || 0.1  // Default 100ms for tap

    if (synth) {
      if (typeof synth.triggerAttackRelease === 'function') {
        const now = window.Tone.now()
        synth.triggerAttackRelease(frequency, tapDuration, now, velocity)

        // console.log(`🎵 Virtual TAP: ${userId} - ${frequency.toFixed(1)}Hz - vel ${velocity.toFixed(2)} - dur ${(tapDuration * 1000).toFixed(0)}ms`)
      } else if (typeof synth.triggerAttack === 'function') {
        // Fallback
        synth.triggerAttack(frequency, window.Tone.now(), velocity)
        const fallbackDuration = (tapDuration || 0.1) * 1000
        setTimeout(() => {
          if (synth && typeof synth.triggerRelease === 'function') {
            synth.triggerRelease(frequency)
          }
        }, fallbackDuration)
      }
    }

    // CRITICAL: Trigger particles/pulses ONLY when note is actually played
    // This fixes the issue where particles appeared without corresponding notes
    if (this.visualService.particles) {
      const particleCount = Math.round(2 + velocity * 5) // 2-7 particles for tap
      this.visualService.particles.emitParticles(userId, particleCount)
    }

    if (this.visualService.wavePackets) {
      this.visualService.wavePackets.emitPulse(userId, userColor)
    }

    // Flash the corresponding meter
    const source = this._extractSourceFromUserId(userId)
    if (source) {
      this.dashboardUI.flashSource(source, 'velocity')
    }
  }

  /**
   * Extract source name from userId
   * @param {string} userId - e.g., 'wikipedia-metrics'
   * @returns {string|null} Source name (wikipedia, hackernews, github) or null
   * @private
   */
  _extractSourceFromUserId(userId) {
    if (!userId) return null
    if (userId.includes('wikipedia')) return 'wikipedia'
    if (userId.includes('hackernews')) return 'hackernews'
    if (userId.includes('github')) return 'github'
    return null
  }

  /**
   * Start the experience
   */
  async start() {
    if (this.isRunning) {
      console.warn('LandingApp already running')
      return
    }

    // console.log('▶️ Starting Webarmonium Landing Page...')
    // console.log('🔌 Connecting to backend and joining landing room...')

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
        // console.log('✅ AudioService started - Transport and volume activated')
      }

      // Setup socket connection
      this._setupSocketConnection()

      // Update state
      this.isRunning = true

      // console.log('✅ Landing page started (receiving from backend)')
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

    // console.log('⏸ Stopping Webarmonium Landing Page...')

    try {
      // Disconnect socket
      if (this.socket) {
        this.socket.disconnect()
        this.socket = null
      }

      // Update state
      this.isRunning = false

      // console.log('✅ Landing page stopped')
      this.dashboardUI.showStatus('Experience stopped')

    } catch (error) {
      console.error('❌ Error stopping experience:', error)
      this.dashboardUI.showError(`Stop error: ${error.message}`)
    }
  }

  /**
   * Handle volume change from UI slider
   * Controls master volume via AudioService
   * @param {number} volume - Volume level (0-1)
   */
  handleVolumeChange(volume) {
    if (this.audioService && typeof this.audioService.setVolume === 'function') {
      this.audioService.setVolume(volume)
    }
  }

  /**
   * Apply delay modulation based on metrics (same as normal rooms)
   * Calculates rhythmicDensity and harmonicDensity from web metrics
   * @private
   */
  _applyDelayModulation() {
    if (!this.audioService || !this.currentMetrics) return

    // Calculate rhythmic density from total activity across all sources
    // Use the same primary metrics as gesture generation
    const wikipediaActivity = this.currentMetrics.wikipedia?.editsPerMinute || 0
    const hnActivity = this.currentMetrics.hackernews?.postsPerMinute || 0
    const githubActivity = this.currentMetrics.github?.commitsPerMinute || 0

    const totalActivity = wikipediaActivity + hnActivity + githubActivity

    // Normalize to 0-1 range (typical range 0-20 for landing page)
    const rhythmicDensity = Math.min(1.0, totalActivity / 20)

    // Calculate harmonic density from variety across different metric types
    // Measures how "spread out" the activity is across sources
    const activities = [wikipediaActivity, hnActivity, githubActivity]
    const meanActivity = activities.reduce((a, b) => a + b, 0) / 3
    const variance = activities.reduce((sum, val) => sum + Math.pow(val - meanActivity, 2), 0) / 3
    const stdDev = Math.sqrt(variance)

    // Normalize to 0-1 range (typical stdDev range 0-10)
    const harmonicDensity = Math.min(1.0, stdDev / 10)

    // Apply modulation using same method as normal rooms
    // See: AudioService.js:4646-4659
    if (this.audioService.applyGenerative && typeof this.audioService.applyGenerative === 'function') {
      this.audioService.applyGenerative({
        rhythmicDensity,
        harmonicDensity
      })
    }
  }

  /**
   * Cleanup and dispose
   */
  dispose() {
    // console.log('🧹 Cleaning up LandingApp...')

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
    // console.log('✅ LandingApp disposed')
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
