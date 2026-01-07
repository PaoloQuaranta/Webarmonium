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
 * Landing Page Configuration Constants
 * Centralized configuration for easy maintenance
 */
const LANDING_CONFIG = {
  // Visual initialization
  VISUAL_INIT_RETRY_MS: 100,

  // Socket connection
  SOCKET_MAX_RETRIES: 3,
  SOCKET_RETRY_DELAY_BASE_MS: 2000,

  // Error display
  ERROR_DISPLAY_MS: 5000,
  STATUS_DISPLAY_MS: 3000,

  // Audio
  AUDIO_FADE_IN_MS: 100,

  // Filter modulation ranges
  FILTER_FREQ_MIN: 200,
  FILTER_FREQ_MAX: 8000,
  FILTER_Q_MIN: 0.5,
  FILTER_Q_MAX: 10
}

/**
 * Socket data validators
 * Validates incoming WebSocket data to prevent crashes from malformed messages
 */
const SocketDataValidator = {
  /**
   * Validate hold:start event data
   */
  validateHoldStart(data) {
    return (
      data &&
      typeof data.userId === 'string' &&
      typeof data.frequency === 'number' &&
      !isNaN(data.frequency) &&
      data.frequency > 0 &&
      data.frequency < 20000 &&
      typeof data.velocity === 'number' &&
      data.velocity >= 0 &&
      data.velocity <= 1
    )
  },

  /**
   * Validate musical:event data
   */
  validateMusicalEvent(data) {
    return (
      data &&
      typeof data.type === 'string' &&
      ['tap', 'phrase'].includes(data.type) &&
      typeof data.userId === 'string'
    )
  },

  /**
   * Validate cursor data
   */
  validateCursor(cursor) {
    return (
      cursor &&
      typeof cursor.x === 'number' &&
      !isNaN(cursor.x) &&
      typeof cursor.y === 'number' &&
      !isNaN(cursor.y)
    )
  },

  /**
   * Validate metrics data
   */
  validateMetrics(metrics) {
    return (
      metrics &&
      typeof metrics === 'object' &&
      (metrics.wikipedia || metrics.hackernews || metrics.github)
    )
  }
}

/**
 * User-friendly error messages
 */
const ERROR_MESSAGES = {
  INIT_FAILED: 'Unable to initialize the experience. Please refresh the page.',
  AUDIO_INIT_FAILED: 'Audio system initialization failed. Check browser permissions.',
  SOCKET_FAILED: 'Connection to server failed. Please check your internet connection.',
  SOCKET_RETRY: (attempt, max, delay) => `Connection failed, retrying in ${delay}s... (${attempt}/${max})`,
  SOCKET_EXHAUSTED: 'Connection failed after multiple attempts. Please refresh the page.',
  START_FAILED: 'Unable to start the experience. Please try again.',
  STOP_FAILED: 'Unable to stop the experience. Please try again.'
}

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
    this.isAudioReady = false  // DRONE FIX: Track if audio is ready

    // Canvas container
    this.canvasContainer = null
    this._resizeHandlerAttached = false

    // Current cursors and metrics from backend
    this.currentCursors = {}
    this.currentMetrics = {}
    this.previousCursors = {} // For detecting cursor movement

    // Track active virtual notes for hold:end events
    this.virtualNotes = new Map()

    // DRONE FIX: Pending drone composition (arrives before audio ready)
    this.pendingDrone = null
  }

  /**
   * Check critical dependencies and return missing ones
   * @returns {string[]} Array of missing dependency names
   * @private
   */
  _checkDependencies() {
    const missing = []

    if (typeof GenerativeVisualService === 'undefined') {
      missing.push('Visual Service')
    }
    if (typeof AudioService === 'undefined') {
      missing.push('Audio Service')
    }
    if (typeof Tone === 'undefined') {
      missing.push('Tone.js Library')
    }
    if (typeof io === 'undefined') {
      missing.push('Socket.IO Library')
    }

    return missing
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
      // Check critical dependencies first
      const missingDeps = this._checkDependencies()
      if (missingDeps.length > 0) {
        const message = `Critical dependencies failed to load: ${missingDeps.join(', ')}. Please refresh the page.`
        console.error('❌ Missing dependencies:', missingDeps)
        this.dashboardUI.showError(message)
        // Continue with degraded functionality instead of throwing
      }

      // Cache canvas container
      this.canvasContainer = document.getElementById('canvas-container')
      if (!this.canvasContainer) {
        throw new Error('Canvas container not found')
      }

      // Create visual service instance (but don't initialize yet - defer until container visible)
      if (typeof GenerativeVisualService !== 'undefined') {
        this.visualService = new GenerativeVisualService()
        // DON'T initialize here - defer to after dashboard UI is ready
      } else {
        console.warn('⚠️ GenerativeVisualService not available - visuals disabled')
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

      // Defer visual service initialization until container has computed dimensions
      // This prevents flickering caused by p5.js initializing with zero dimensions
      requestAnimationFrame(() => {
        if (this.visualService && this.canvasContainer) {
          const rect = this.canvasContainer.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            this.visualService.initialize(this.canvasContainer)
            this._setupResizeHandler()
            // console.log('✅ GenerativeVisualService initialized with dimensions:', rect.width, rect.height)
          } else {
            // Retry if dimensions still not available
            setTimeout(() => {
              if (this.visualService && !this.visualService.p5Instance) {
                this.visualService.initialize(this.canvasContainer)
                this._setupResizeHandler()
              }
            }, LANDING_CONFIG.VISUAL_INIT_RETRY_MS)
          }
        }
      })

      // Setup socket connection immediately for metrics updates
      // (audio/visuals only start when user presses Start)
      this._setupSocketConnection()

      this.isInitialized = true
      // console.log('✅ Landing page initialized (waiting for Start)')

    } catch (error) {
      console.error('❌ Error during initialization:', error)
      this.dashboardUI.showError(ERROR_MESSAGES.INIT_FAILED)
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
   * Setup window resize handler to resize canvas with container
   * @private
   */
  _setupResizeHandler() {
    if (this._resizeHandlerAttached) return
    this._resizeHandlerAttached = true

    window.addEventListener('resize', () => {
      if (this.visualService && this.canvasContainer) {
        const rect = this.canvasContainer.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          this.visualService.resize(rect.width, rect.height)
        }
      }
    })
  }

  /**
   * Setup audio initialization on user interaction
   * Uses mutex flag to prevent race conditions from rapid clicks/keystrokes
   * @private
   */
  _setupAudioInitialization() {
    let isInitializing = false // Mutex to prevent race conditions

    const initAudio = async () => {
      // CRITICAL: Check both audioService AND isInitializing to prevent race conditions
      if (this.audioService || isInitializing) return

      isInitializing = true

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

          // Entry #27: CRITICAL - Unmute audio when starting (localStorage may have saved muted=true)
          this.audioService.setMuted(false)

          // DRONE FIX: Mark audio as ready and play pending drone
          this.isAudioReady = true
          if (this.pendingDrone) {
            // console.log('🎵 Playing pending drone')
            this.audioService.playComposition(this.pendingDrone, true)
            this.pendingDrone = null
          } else if (this.socket?.connected) {
            // Entry #27: No pending drone (consumed or never received), request from backend
            console.log('🎵 Requesting drone from backend (no pendingDrone)')
            this.socket.emit('request-drone')
          }
        }
      } catch (error) {
        console.error('❌ Error initializing audio:', error)
        this.dashboardUI.showError(ERROR_MESSAGES.AUDIO_INIT_FAILED)
        isInitializing = false // Reset on error to allow retry
        return
      }

      // Remove listeners only on success
      document.removeEventListener('click', initAudio)
      document.removeEventListener('keydown', initAudio)
    }

    document.addEventListener('click', initAudio)
    document.addEventListener('keydown', initAudio)
  }

  /**
   * Setup socket.io connection to backend with retry logic
   * @param {number} retryCount - Current retry attempt (default 0)
   * @private
   */
  _setupSocketConnection(retryCount = 0) {
    const { SOCKET_MAX_RETRIES, SOCKET_RETRY_DELAY_BASE_MS } = LANDING_CONFIG

    if (this.socket?.connected) {
      console.log('Socket already connected')
      return
    }

    // Clean up existing socket if retrying
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }

    try {
      // Dynamic URL: localhost dev uses port 3001, production uses same origin (nginx proxy)
      const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
      const socketUrl = isDevelopment
        ? 'http://localhost:3001'
        : `${window.location.protocol}//${window.location.host}`

      console.log(`🔌 Landing page connecting to: ${socketUrl}${retryCount > 0 ? ` (retry ${retryCount}/${SOCKET_MAX_RETRIES})` : ''}`)

      // Connect to backend
      this.socket = io(socketUrl)

      // Connection events
      this.socket.on('connect', () => {
        // console.log('✅ Socket connected to backend')

        // Join landing room
        this.socket.emit('join-landing', (response) => {
          // console.log('📡 join-landing response:', response?.success)
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

            // Entry #27: Request drone after joining (backup for stop/start case)
            // Wait 800ms to let backend's automatic drone emit arrive first
            setTimeout(() => {
              // Always request - if audio not ready, drone will be saved as pendingDrone
              this.socket.emit('request-drone')
            }, 800)
          }
        })
      })

      this.socket.on('disconnect', () => {
        // console.log('❌ Disconnected from backend')
      })

      this.socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error)

        // Retry logic with exponential backoff
        if (retryCount < SOCKET_MAX_RETRIES) {
          const delay = SOCKET_RETRY_DELAY_BASE_MS * Math.pow(2, retryCount)
          this.dashboardUI.showError(ERROR_MESSAGES.SOCKET_RETRY(retryCount + 1, SOCKET_MAX_RETRIES, delay / 1000))

          setTimeout(() => {
            if (this.isRunning) {
              this._setupSocketConnection(retryCount + 1)
            }
          }, delay)
        } else {
          this.dashboardUI.showError(ERROR_MESSAGES.SOCKET_EXHAUSTED)
        }
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
        //   compositionNumber: data.compositionNumber,
        //   isDrone: data.isDrone
        // })

        // DRONE FIX: Save drone if audio not ready yet
        if (!this.isAudioReady && data.isDrone && data.composition) {
          this.pendingDrone = data.composition
          // console.log('💾 Saved pending drone - will play when audio ready')
          return
        }

        // Play composition
        if (this.audioService && data.composition && this.isAudioReady) {
          if (typeof this.audioService.playComposition === 'function') {
            this.audioService.playComposition(data.composition, data.isDrone || false)
            // console.log('🎵 Background composition sent to AudioService')
          } else {
            console.warn('⚠️ playComposition not available on AudioService')
          }
        } else if (!this.isAudioReady) {
          // console.log('⏳ Audio not ready, composition discarded')
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
      // NOTE: Metrics update even before Start is pressed (dashboard always shows live data)
      this.socket.on('metrics-update', (data) => {
        if (data.metrics) {
          this.currentMetrics = data.metrics
          this.dashboardUI.updateMetrics(this.currentMetrics)

          // Apply delay modulation only when running
          if (this.isRunning) {
            this._applyDelayModulation()
          }
        }
      })

      // Listen for hold:start events from virtual users (for particles/pulses)
      this.socket.on('hold:start', (data) => {
        if (!this.isRunning) return
        if (!data.isRemote) return // Only handle virtual user events

        // Validate incoming data
        if (!SocketDataValidator.validateHoldStart(data)) {
          console.warn('⚠️ Invalid hold:start data received:', data)
          return
        }

        // Entry #28: Register activity for drone void detection
        if (this.audioService) {
          this.audioService.registerDroneActivity()
          this.audioService.registerDroneNoteStart(data.noteId || data.userId)
        }

        this._handleVirtualHoldStart(data)
      })

      // Listen for hold:end events from virtual users
      this.socket.on('hold:end', (data) => {
        if (!this.isRunning) return

        // Entry #28: Register note end for drone void detection
        if (this.audioService && (data.noteId || data.userId)) {
          this.audioService.registerDroneNoteEnd(data.noteId || data.userId)
        }

        this._handleVirtualHoldEnd(data)
      })

      // Listen for musical:event (tap notes) from virtual users
      this.socket.on('musical:event', (data) => {
        if (!this.isRunning) return
        if (!data.isRemote) return // Only handle virtual user events

        // Validate incoming data
        if (!SocketDataValidator.validateMusicalEvent(data)) {
          console.warn('⚠️ Invalid musical:event data received:', data)
          return
        }

        // Entry #28: Register activity for drone void detection (tap events)
        if (this.audioService && data.type === 'tap') {
          this.audioService.registerDroneActivity()
        }

        // CRITICAL: Only handle 'tap' events in _handleVirtualTapNote
        // 'phrase' events don't have frequency - they're just visual triggers
        if (data.type === 'tap') {
          this._handleVirtualTapNote(data)
        }

        // Forward ALL musical events to visual service for nebulas and attractors
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
      // CRITICAL: Null safety - validate cursor data before processing
      if (!cursor || typeof cursor.x !== 'number' || typeof cursor.y !== 'number') {
        console.warn(`⚠️ Invalid cursor data for ${source}:`, cursor)
        continue
      }

      const userId = cursor.userId || `${source}-metrics`
      // Clamp coordinates to valid range [0, 1]
      const x = Math.max(0, Math.min(1, cursor.x))
      const y = Math.max(0, Math.min(1, cursor.y))
      const color = cursor.color || '#888888' // Fallback color

      // Update cursor position
      this.visualService.updateCursorPosition(userId, x, y, color)

      // CRITICAL: Apply filter modulation based on cursor position to BOTH gesture AND background
      // X position → filter frequency, Y position → filter resonance
      if (this.isRunning && this.audioService) {
        const { FILTER_FREQ_MIN, FILTER_FREQ_MAX, FILTER_Q_MIN, FILTER_Q_MAX } = LANDING_CONFIG

        // Calculate base filter frequency from X position
        const baseFreq = FILTER_FREQ_MIN + (x * (FILTER_FREQ_MAX - FILTER_FREQ_MIN))

        // Calculate filter resonance from Y position
        const baseQ = FILTER_Q_MIN + (y * (FILTER_Q_MAX - FILTER_Q_MIN))

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

          // Pad: SKIP frequency modulation - drone LFO already modulates it
          // Only modulate Q if no drone filter LFO is connected
          if (this.audioService.ambientFilters.pad && !this.audioService.droneFilterLFO) {
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

    // CRITICAL: Use per-user synth for consistent timbre (same as _handleVirtualTapNote)
    let synth = null
    let actualFrequency = frequency

    console.log(`🔍 _handleVirtualHoldStart: userId=${userId}, userSynthManager=${!!this.audioService.userSynthManager}`)

    if (userId && this.audioService.userSynthManager) {
      const synthData = this.audioService.userSynthManager.getSynthForUser(userId)
      console.log(`🔍 getSynthForUser(HOLD):`, synthData ? `patch=${synthData.patch?.name}, disposed=${synthData.synth?.disposed}` : 'null')
      if (synthData && synthData.synth && !synthData.synth.disposed) {
        synth = synthData.synth
        actualFrequency = this.audioService.userSynthManager.constrainFrequencyToTessitura(frequency, userId)
        console.log(`🎵 Virtual HOLD: userId=${userId}, freq=${actualFrequency.toFixed(1)}Hz, patch=${synthData.patch?.name}`)
      }
    } else {
      console.warn(`⚠️ No userSynthManager or userId in HOLD - falling back`)
    }

    // Fallback to gestureSynth if no user synth available
    if (!synth) {
      console.warn(`⚠️ HOLD using gestureSynth fallback for userId=${userId}`)
      if (!this.audioService.gestureSynth) {
        console.warn('⚠️ No synth available - skipping note playback')
        return
      }
      synth = this.audioService.gestureSynth
    }

    if (synth) {
      if (typeof synth.triggerAttackRelease === 'function') {
        // CRITICAL: Use variable duration from backend (200-2000ms based on metric intensity)
        const noteDuration = duration || 1.0  // Fallback to 1s if not provided
        const now = window.Tone.now()

        synth.triggerAttackRelease(actualFrequency, noteDuration, now, velocity)
      } else if (typeof synth.triggerAttack === 'function') {
        // Fallback to triggerAttack + triggerRelease
        synth.triggerAttack(actualFrequency, window.Tone.now(), velocity)
        const fallbackDuration = (duration || 1.0) * 1000  // Convert to ms
        setTimeout(() => {
          if (synth && typeof synth.triggerRelease === 'function') {
            synth.triggerRelease(actualFrequency)
          }
        }, fallbackDuration)
      } else {
        console.warn('⚠️ synth has no trigger methods')
      }
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

    // CRITICAL: Use per-user synth if available for unique timbres
    let synth = null
    let actualFrequency = frequency
    const tapDuration = duration || 0.1  // Default 100ms for tap

    console.log(`🔍 _handleVirtualTapNote: userId=${userId}, userSynthManager=${!!this.audioService.userSynthManager}`)

    if (userId && this.audioService.userSynthManager) {
      const synthData = this.audioService.userSynthManager.getSynthForUser(userId)
      console.log(`🔍 getSynthForUser result:`, synthData ? `synth exists, disposed=${synthData.synth?.disposed}` : 'null')
      if (synthData && synthData.synth && !synthData.synth.disposed) {
        synth = synthData.synth
        actualFrequency = this.audioService.userSynthManager.constrainFrequencyToTessitura(frequency, userId)
        console.log(`🎵 Virtual TAP: userId=${userId}, freq=${actualFrequency.toFixed(1)}Hz, patch=${synthData.patch?.name}`)
      }
    } else {
      console.warn(`⚠️ No userSynthManager or userId - falling back to gestureSynth`)
    }

    // Fallback to gestureSynth if no user synth available
    if (!synth) {
      synth = this.audioService.gestureSynth
    }

    if (synth) {
      if (typeof synth.triggerAttackRelease === 'function') {
        const now = window.Tone.now()
        synth.triggerAttackRelease(actualFrequency, tapDuration, now, velocity)
      } else if (typeof synth.triggerAttack === 'function') {
        // Fallback
        synth.triggerAttack(actualFrequency, window.Tone.now(), velocity)
        const fallbackDuration = (tapDuration || 0.1) * 1000
        setTimeout(() => {
          if (synth && typeof synth.triggerRelease === 'function') {
            synth.triggerRelease(actualFrequency)
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

        // Entry #27: CRITICAL - Unmute audio when starting (localStorage may have saved muted=true)
        this.audioService.setMuted(false)

        // DRONE FIX: Mark audio as ready and play pending drone
        this.isAudioReady = true
        if (this.pendingDrone) {
          // console.log('🎵 Playing pending drone')
          this.audioService.playComposition(this.pendingDrone, true)
          this.pendingDrone = null
        }
      }

      // Socket is already connected from initialize() - just request drone if needed
      if (this.socket?.connected) {
        // Request drone for audio playback
        this.socket.emit('request-drone')
      } else {
        // Fallback: reconnect if socket was disconnected
        this._setupSocketConnection()
      }

      // Update state
      this.isRunning = true

      // console.log('✅ Landing page started (receiving from backend)')
      this.dashboardUI.showStatus('Experience started - Connected to backend')

    } catch (error) {
      console.error('❌ Error starting experience:', error)
      this.dashboardUI.showError(ERROR_MESSAGES.START_FAILED)
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
      // Entry #27: Stop audio service to clear drone and release voices
      if (this.audioService && typeof this.audioService.stop === 'function') {
        this.audioService.stop()
      }
      this.isAudioReady = false  // Reset audio state for proper restart
      this.pendingDrone = null   // Clear pending drone on stop

      // Keep socket connected for metrics updates (don't disconnect)
      // Only audio/visuals stop, metrics dashboard continues updating

      // Update state
      this.isRunning = false

      this.dashboardUI.showStatus('Experience stopped')

    } catch (error) {
      console.error('❌ Error stopping experience:', error)
      this.dashboardUI.showError(ERROR_MESSAGES.STOP_FAILED)
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
