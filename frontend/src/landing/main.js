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

    // Entry #123: Store initAudio listener reference for cleanup from multiple places
    this._initAudioListener = null

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

    // Entry #81: Trail overlay canvas for virtual user gesture halos
    this.trailCanvas = null
    this.trailCtx = null
    this._trailColorCache = new Map()

    // Trail fade animation
    this._trailFadeFrameId = null
    this._trailFadeRate = 0.02  // Alpha reduction per frame (lower = slower fade)

    // Entry #93: Sound-reactive UI state
    this._audioAnalyser = null
    this._audioAnalyserData = null
    this._soundReactiveAnimationId = null
    this._soundReactiveFrameCount = 0  // Throttle counter for 30fps updates

    // Entry #93: Immersive mode handlers (stored for cleanup)
    this._immersiveResizeHandler = null
    this._immersiveKeyHandler = null

    // Entry #134: Immersive controls auto-hide state
    this._immersiveMouseHandler = null
    this._immersiveAutoHideTimeout = null
    this._immersiveAutoHideDelay = 3000  // 3 seconds

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

      // Entry #81: Initialize trail overlay canvas
      this.trailCanvas = document.getElementById('trail-overlay')
      if (this.trailCanvas) {
        this.trailCtx = this.trailCanvas.getContext('2d')
        this._resizeTrailCanvas()
        this._startTrailFade()  // Start fade animation loop
      }

      // Create visual service instance (but don't initialize yet - defer until container visible)
      if (typeof GenerativeVisualService !== 'undefined') {
        this.visualService = new GenerativeVisualService()
        // DON'T initialize here - defer to after dashboard UI is ready
      } else {
        console.warn('⚠️ GenerativeVisualService not available - visuals disabled')
      }

      // CRITICAL FIX: Create AudioService EARLY (like normal rooms do)
      // This registers the visibility/focus/pageshow handlers early
      // Audio will only START on user click, but the service exists before
      if (typeof AudioService !== 'undefined' && !this.audioService) {
        this.audioService = new AudioService()
      }

      // Wait for user interaction to START audio (browser policy)
      this._setupAudioInitialization()

      // NOTE: iOS Safari sleep recovery is now handled automatically by AudioService
      // via visibility/focus/pageshow handlers (same as normal rooms).
      // The key fix was creating AudioService EARLY in initialize() (line 238-241).

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
            // Configure gradient for landing page (3 virtual cursors max)
            if (this.visualService.nebulas?.setMaxUsers) {
              this.visualService.nebulas.setMaxUsers(3)
            }
            // console.log('✅ GenerativeVisualService initialized with dimensions:', rect.width, rect.height)
          } else {
            // Retry if dimensions still not available
            setTimeout(() => {
              if (this.visualService && !this.visualService.p5Instance) {
                this.visualService.initialize(this.canvasContainer)
                this._setupResizeHandler()
                // Configure gradient for landing page (3 virtual cursors max)
                if (this.visualService.nebulas?.setMaxUsers) {
                  this.visualService.nebulas.setMaxUsers(3)
                }
              }
            }, LANDING_CONFIG.VISUAL_INIT_RETRY_MS)
          }
        }
      })

      // Setup socket connection immediately for metrics updates
      // (audio/visuals only start when user presses Start)
      this._setupSocketConnection()

      // Entry #93: Setup immersive mode toggle
      this._setupImmersiveMode()

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
      // Entry #81: Resize trail canvas on window resize
      this._resizeTrailCanvas()
    })
  }

  /**
   * Setup audio initialization on user interaction
   * Uses mutex flag to prevent race conditions from rapid clicks/keystrokes
   * Entry #123: Store listener reference for cleanup from start() as well
   * @private
   */
  _setupAudioInitialization() {
    let isInitializing = false // Mutex to prevent race conditions

    // Entry #123: Store as class property for cleanup from multiple places
    this._initAudioListener = async () => {
      // Entry #129: Only initialize audio if user has explicitly pressed Start
      // Without this check, any click on the page would start audio
      if (!this.isRunning) return

      // CRITICAL: Check if audio already started (not just if audioService exists)
      // AudioService is now created early in initialize(), so check isAudioReady instead
      if (this.isAudioReady || isInitializing) return

      // Entry #124: If user stopped via DashboardUI Stop button, don't auto-init audio
      // This prevents the race condition where Stop click bubbles to document and triggers this listener
      if (this.audioService?._userStoppedAudio) {
        console.log('🔇 Audio init blocked - user stopped audio')
        return
      }

      isInitializing = true

      try {
        // Start Tone.js context (requires user gesture)
        await Tone.start()

        // AudioService was created early in initialize()
        // Now we just need to initialize and start it
        if (this.audioService) {
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

          // Note: audio:gesture-required listener and proactive check are registered
          // during initialize() - before audio init - to ensure they're always available
        }
      } catch (error) {
        console.error('❌ Error initializing audio:', error)
        this.dashboardUI.showError(ERROR_MESSAGES.AUDIO_INIT_FAILED)
        isInitializing = false // Reset on error to allow retry
        return
      }

      // Remove listeners on success
      this._removeInitAudioListeners()
    }

    document.addEventListener('click', this._initAudioListener)
    document.addEventListener('keydown', this._initAudioListener)
  }

  /**
   * Remove initAudio event listeners (Entry #123)
   * Called from both initAudio success and start() to prevent race condition
   * @private
   */
  _removeInitAudioListeners() {
    if (this._initAudioListener) {
      document.removeEventListener('click', this._initAudioListener)
      document.removeEventListener('keydown', this._initAudioListener)
    }
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

        // Entry #109: gestureFilter removed

        // CRITICAL: Apply to ambientFilters (background composition) for AUDIBLE modulation
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

    // Calculate and forward synthetic interaction metrics for spatial gradient
    this._updateSyntheticMetrics()

    // Store current cursors for next comparison
    this.previousCursors = { ...this.currentCursors }
  }

  /**
   * Calculate synthetic interaction metrics from virtual cursor positions
   * for spatial gradient effect on landing page
   * @private
   */
  _updateSyntheticMetrics() {
    if (!this.visualService) return

    // Filter for valid cursors with finite coordinates (reject NaN, Infinity)
    const cursors = Object.values(this.currentCursors).filter(
      c => c &&
           typeof c.x === 'number' && isFinite(c.x) &&
           typeof c.y === 'number' && isFinite(c.y)
    )
    if (cursors.length === 0) return

    // User count: number of active virtual cursors
    const userCount = cursors.length

    // Dominant zone: centroid of cursor positions
    let sumX = 0, sumY = 0
    let validCount = 0
    for (const cursor of cursors) {
      sumX += cursor.x
      sumY += cursor.y
      validCount++
    }

    // Safety check: avoid division by zero
    if (validCount === 0) return

    const dominantZone = {
      x: sumX / validCount,
      y: sumY / validCount
    }

    // Spatial density: based on cursor clustering (inverse of variance)
    // Lower variance = higher density (cursors clustered together)
    let variance = 0
    for (const cursor of cursors) {
      const dx = cursor.x - dominantZone.x
      const dy = cursor.y - dominantZone.y
      variance += dx * dx + dy * dy
    }
    variance /= validCount

    // Normalize variance to 0-1 range for spatialDensity:
    // - When cursors at opposite corners: max variance ≈ 0.5 (diagonal spread)
    // - Multiplier 4 scales so variance 0.25 → spatialDensity 0
    // - Math.min(1, ...) handles edge case of very tight clustering
    const spatialDensity = Math.max(0, Math.min(1, 1 - variance * 4))

    // Forward to visual service
    this.visualService.updateInteractionMetrics({
      userCount,
      spatialDensity,
      dominantZone
    })
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

    // console.log(`🔍 _handleVirtualHoldStart: userId=${userId}, userSynthManager=${!!this.audioService.userSynthManager}`)

    if (userId && this.audioService.userSynthManager) {
      const synthData = this.audioService.userSynthManager.getSynthForUser(userId)
      // console.log(`🔍 getSynthForUser(HOLD):`, synthData ? `patch=${synthData.patch?.name}, disposed=${synthData.synth?.disposed}` : 'null')
      if (synthData && synthData.synth && !synthData.synth.disposed) {
        synth = synthData.synth
        actualFrequency = this.audioService.userSynthManager.constrainFrequencyToTessitura(frequency, userId)
        // console.log(`🎵 Virtual HOLD: userId=${userId}, freq=${actualFrequency.toFixed(1)}Hz, patch=${synthData.patch?.name}`)
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
   * Releases the sustained note and draws trail halo
   * @param {Object} data - hold:end data
   * @private
   */
  _handleVirtualHoldEnd(data) {
    if (!this.audioService) return

    const { noteId, userId, duration } = data
    const note = this.virtualNotes.get(noteId)

    if (note) {
      const synth = this.audioService.gestureSynth
      if (synth && typeof synth.triggerRelease === 'function') {
        synth.triggerRelease(note.frequency)
        // console.log(`🎵 Virtual note released: ${note.userId}`)
      }
      this.virtualNotes.delete(noteId)

      // Entry #81: Draw trail halo for virtual user drag end
      // FIX: Use helper to find cursor by userId (keys are 'wikipedia' not 'wikipedia-metrics')
      const cursorData = this._findCursorByUserId(userId || note.userId)
      if (cursorData) {
        // FIX #6: Use centralized intensity calculation helper
        const holdDuration = duration || 1000
        const intensity = this._calculateTrailIntensityFromDuration(holdDuration)
        this._renderTrailHalo(cursorData.x, cursorData.y, intensity, cursorData.color || '#00d4ff')
      }
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

    // console.log(`🔍 _handleVirtualTapNote: userId=${userId}, userSynthManager=${!!this.audioService.userSynthManager}`)

    if (userId && this.audioService.userSynthManager) {
      const synthData = this.audioService.userSynthManager.getSynthForUser(userId)
      // console.log(`🔍 getSynthForUser result:`, synthData ? `synth exists, disposed=${synthData.synth?.disposed}` : 'null')
      if (synthData && synthData.synth && !synthData.synth.disposed) {
        synth = synthData.synth
        actualFrequency = this.audioService.userSynthManager.constrainFrequencyToTessitura(frequency, userId)
        // console.log(`🎵 Virtual TAP: userId=${userId}, freq=${actualFrequency.toFixed(1)}Hz, patch=${synthData.patch?.name}`)
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

    // Entry #81: Draw trail halo for virtual user tap
    // FIX: Use helper to find cursor by userId (keys are 'wikipedia' not 'wikipedia-metrics')
    const cursorData = this._findCursorByUserId(userId)
    if (cursorData) {
      // Tap intensity based on duration (100ms = 0.3, 500ms = ~0.5)
      const intensity = Math.min(1, 0.3 + (tapDuration / 2) * 0.7)
      this._renderTrailHalo(cursorData.x, cursorData.y, intensity, userColor || cursorData.color || '#00d4ff')
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
   * Find cursor data by userId
   * Entry #81 FIX: Cursors are stored with source keys (wikipedia, hackernews, github)
   * but userId is 'wikipedia-metrics', 'hackernews-metrics', etc.
   * @param {string} userId - e.g., 'wikipedia-metrics'
   * @returns {Object|null} Cursor data or null
   * @private
   */
  _findCursorByUserId(userId) {
    if (!userId) return null

    // Direct key match first (unlikely but check anyway)
    if (this.currentCursors[userId]) {
      return this.currentCursors[userId]
    }

    // Search by cursor.userId property
    for (const cursor of Object.values(this.currentCursors)) {
      if (cursor && cursor.userId === userId) {
        return cursor
      }
    }

    // Extract source from userId and try that as key (e.g., 'wikipedia-metrics' → 'wikipedia')
    const source = this._extractSourceFromUserId(userId)
    if (source && this.currentCursors[source]) {
      return this.currentCursors[source]
    }

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

        // Entry #123: Remove global click listeners to prevent race condition
        // If initAudio and start() race, this ensures listeners are cleaned up
        this._removeInitAudioListeners()

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

      // Entry #93: Toggle canvas glow effect
      this.canvasContainer?.classList.add('active')

      // Entry #134: Add audio-playing class for immersive mode floating button
      document.body.classList.add('audio-playing')

      // Entry #93: Setup and start sound-reactive UI
      this._setupSoundReactiveUI()
      this._startSoundReactiveLoop()

      // console.log('✅ Landing page started (receiving from backend)')
      this.dashboardUI.showStatus('Experience started - Connected to backend')

      // Entry #134: Sync main play button state
      this.dashboardUI._updatePlaybackState(true)

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
      // Entry #124: Remove init audio listeners even if audio never started
      // This prevents clicks from triggering audio restart after user pressed Stop
      this._removeInitAudioListeners()

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

      // Entry #93: Remove canvas glow effect
      this.canvasContainer?.classList.remove('active')

      // Entry #134: Remove audio-playing class for immersive mode floating button
      document.body.classList.remove('audio-playing')

      // Entry #93: Stop sound-reactive UI
      this._stopSoundReactiveLoop()

      this.dashboardUI.showStatus('Experience stopped')

      // Entry #134: Sync main play button state
      this.dashboardUI._updatePlaybackState(false)

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

  // ============================================================
  // Entry #81: Trail rendering for virtual users
  // ============================================================

  /**
   * Resize trail canvas to match container
   * @private
   */
  _resizeTrailCanvas() {
    if (!this.trailCanvas || !this.canvasContainer) return
    const rect = this.canvasContainer.getBoundingClientRect()
    this.trailCanvas.width = rect.width
    this.trailCanvas.height = rect.height
  }

  /**
   * Render a trail halo for virtual users
   * Similar to room main.js _renderTrailHalo
   * @param {number} normX - Normalized X position (0-1)
   * @param {number} normY - Normalized Y position (0-1)
   * @param {number} intensity - Trail intensity (0-1)
   * @param {string} color - Hex color string
   * @private
   */
  _renderTrailHalo(normX, normY, intensity, color) {
    if (!this.trailCtx || !this.trailCanvas) {
      return
    }

    const x = normX * this.trailCanvas.width
    const y = normY * this.trailCanvas.height

    // Cache RGB conversion per color
    let rgb = this._trailColorCache.get(color)
    if (!rgb) {
      rgb = this._hexToRgb(color) || { r: 0, g: 212, b: 255 }
      this._trailColorCache.set(color, rgb)
      if (this._trailColorCache.size > 20) {
        const firstKey = this._trailColorCache.keys().next().value
        this._trailColorCache.delete(firstKey)
      }
    }

    const alpha = Math.min(intensity, 1)
    const size = 5 + (intensity * 15)

    this.trailCtx.save()

    // Use globalAlpha + solid fill + shadowBlur for glow effect
    this.trailCtx.globalAlpha = alpha * 0.8
    this.trailCtx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
    this.trailCtx.shadowColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
    this.trailCtx.shadowBlur = size * 0.6

    this.trailCtx.beginPath()
    this.trailCtx.arc(x, y, size * 0.5, 0, Math.PI * 2)
    this.trailCtx.fill()

    this.trailCtx.restore()
  }

  /**
   * FIX #6: Centralized intensity calculation from duration
   * Converts hold/tap duration to trail intensity (0.3 to 1.0 range)
   * Matches the formula in main.js _calculateTrailIntensityFromDuration()
   * @param {number} durationMs - Duration in milliseconds
   * @returns {number} Intensity value clamped to 0.3-1.0
   * @private
   */
  _calculateTrailIntensityFromDuration(durationMs) {
    // Validate input
    if (typeof durationMs !== 'number' || !isFinite(durationMs) || durationMs < 0) {
      return 0.3 // Minimum intensity for invalid input
    }
    // Duration-based intensity: 0ms = 0.3 (minimum), 2000ms = 1.0 (maximum)
    return Math.min(1, 0.3 + (durationMs / 2000) * 0.7)
  }

  /**
   * Convert hex color to RGB object
   * @param {string} hex - Hex color string
   * @returns {Object|null} RGB object or null
   * @private
   */
  _hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null
  }

  /**
   * Start the trail fade animation loop
   * Fades existing trails by drawing a semi-transparent overlay each frame
   * @private
   */
  _startTrailFade() {
    if (this._trailFadeFrameId) return  // Already running

    const fade = () => {
      this._fadeTrailCanvas()
      this._trailFadeFrameId = requestAnimationFrame(fade)
    }
    this._trailFadeFrameId = requestAnimationFrame(fade)
  }

  /**
   * Stop the trail fade animation loop
   * @private
   */
  _stopTrailFade() {
    if (this._trailFadeFrameId) {
      cancelAnimationFrame(this._trailFadeFrameId)
      this._trailFadeFrameId = null
    }
  }

  /**
   * Fade the trail canvas by drawing a semi-transparent black overlay
   * This creates a natural decay effect for trail halos
   * Uses delta time for frame-rate independent fading
   * @private
   */
  _fadeTrailCanvas() {
    // CRITICAL: Stop animation if canvas is gone
    if (!this.trailCtx || !this.trailCanvas) {
      this._stopTrailFade()
      return
    }

    try {
      // Frame-rate independent fading using delta time
      const now = performance.now()
      const deltaTime = now - (this._lastFadeTime || now)
      this._lastFadeTime = now

      // Target 60fps behavior: scale alpha by actual delta time
      const targetDelta = 16.67  // 60fps target
      const scaledAlpha = Math.min(1.0, this._trailFadeRate * (deltaTime / targetDelta))

      // Use destination-out composite to fade existing content
      this.trailCtx.save()
      this.trailCtx.globalCompositeOperation = 'destination-out'
      this.trailCtx.fillStyle = `rgba(0, 0, 0, ${scaledAlpha})`
      this.trailCtx.fillRect(0, 0, this.trailCanvas.width, this.trailCanvas.height)
      this.trailCtx.restore()
    } catch (error) {
      console.error('Trail fade error:', error)
      this._stopTrailFade()  // Stop on error to prevent runaway animation
    }
  }

  // ========================
  // DEBUG: Audio Debug Methods (commented out - kept for future debugging)
  // ========================
  // NOTE: These methods were used to debug iOS Safari sleep recovery.
  // The fix was creating AudioService EARLY in initialize() (Entry #112).
  // Uncomment these methods if you need to debug audio issues in the future.

  /*
  _captureAudioDebugState(label) {
    const as = this.audioService
    if (!this._initialContext && Tone.context) {
      this._initialContext = Tone.context
    }
    const sameContext = this._initialContext === Tone.context ? 'same' : 'DIFFERENT!'
    const masterConnected = as?.masterVolume?.context === Tone.context ? 'yes' : 'NO!'
    const bassDisposed = as?.ambientLayers?.bass?.disposed ? 'YES!' : 'no'
    const padDisposed = as?.ambientLayers?.pad?.disposed ? 'YES!' : 'no'
    const chordsDisposed = as?.ambientLayers?.chords?.disposed ? 'YES!' : 'no'
    const synthsOK = (bassDisposed === 'no' && padDisposed === 'no' && chordsDisposed === 'no') ? 'OK' : 'DISPOSED!'

    return {
      label,
      timestamp: new Date().toLocaleTimeString(),
      contextState: Tone.context?.state || 'N/A',
      transportState: Tone.Transport?.state || 'N/A',
      sameContext,
      masterConnected,
      synthsOK,
      isInitialized: as?.isInitialized ?? 'N/A',
      muted: as?.muted ?? 'N/A',
      _userStoppedAudio: as?._userStoppedAudio ?? 'N/A',
      evolvingGenerationActive: as?.evolvingGenerationActive ?? 'N/A',
      masterVolumeValue: as?.masterVolume?.volume?.value?.toFixed(1) ?? 'N/A',
      masterVolumeMute: as?.masterVolume?.mute ?? 'N/A',
      vcMuted: as?.volumeController?.muted ?? 'N/A',
      vcVolume: as?.volumeController?.volume?.toFixed(2) ?? 'N/A',
      isIOS: as?._isIOS ?? 'N/A',
    }
  }

  _showDebugOverlay3(before, afterUnlock, afterRecovery, testToneResult = 'N/A') {
    const existing = document.getElementById('audio-debug-overlay')
    if (existing) existing.remove()

    const overlay = document.createElement('div')
    overlay.id = 'audio-debug-overlay'
    overlay.style.cssText = `
      position: fixed; top: 10px; left: 10px; right: 10px;
      background: rgba(0,0,0,0.95); color: #0f0;
      font-family: monospace; font-size: 10px; padding: 10px;
      border-radius: 8px; z-index: 99999; max-height: 85vh;
      overflow-y: auto; border: 2px solid #0f0;
    `

    const formatState = (state) => {
      const highlight = (key, val) => {
        const bad =
          (key === 'contextState' && val !== 'running') ||
          (key === 'transportState' && val !== 'started') ||
          (key === 'muted' && val === true) ||
          (key === 'masterVolumeMute' && val === true) ||
          (key === 'sameContext' && val !== 'same') ||
          (key === 'masterConnected' && val !== 'yes') ||
          (key === 'synthsOK' && val !== 'OK')
        return bad ? `<span style="color:#f00">${val}</span>` : `<span style="color:#0f0">${val}</span>`
      }
      return `
        <div style="margin-bottom:6px;padding:6px;background:rgba(255,255,255,0.1);border-radius:4px">
          <div style="color:#ff0;font-weight:bold">${state.label} (${state.timestamp})</div>
          <div>ctx: ${highlight('contextState', state.contextState)} | trsp: ${highlight('transportState', state.transportState)}</div>
          <div>sameCtx: ${highlight('sameContext', state.sameContext)} | masterConn: ${highlight('masterConnected', state.masterConnected)}</div>
          <div>synths: ${highlight('synthsOK', state.synthsOK)} | muted: ${highlight('muted', state.muted)} | masterMute: ${highlight('masterVolumeMute', state.masterVolumeMute)}</div>
          <div>vol: ${state.masterVolumeValue}dB | evolving: ${state.evolvingGenerationActive}</div>
        </div>
      `
    }

    const toneColor = testToneResult === 'played' ? '#0f0' : '#f00'
    overlay.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="color:#ff0;font-weight:bold">🔊 DEBUG</span>
        <button onclick="this.parentElement.parentElement.remove()" style="background:#f00;color:#fff;border:none;padding:2px 8px;border-radius:4px">✕</button>
      </div>
      ${formatState(before)}
      ${formatState(afterUnlock)}
      ${formatState(afterRecovery)}
      <div style="margin-top:8px;padding:6px;background:rgba(255,255,0,0.2);border-radius:4px">
        <span style="color:#ff0">🔔 TEST TONE:</span> <span style="color:${toneColor};font-weight:bold">${testToneResult}</span>
      </div>
    `
    document.body.appendChild(overlay)
  }
  */

  // ============================================================
  // Entry #93: Sound-Reactive UI Methods
  // ============================================================

  /**
   * Setup sound-reactive UI analyser
   * Creates Web Audio API analyser node connected to Tone.js output
   * @private
   */
  _setupSoundReactiveUI() {
    // Check for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // Get or create analyser from Tone.js context
    if (typeof Tone !== 'undefined' && Tone.context) {
      try {
        this._audioAnalyser = Tone.context.createAnalyser()
        this._audioAnalyser.fftSize = 256
        this._audioAnalyser.smoothingTimeConstant = 0.8
        this._audioAnalyserData = new Uint8Array(this._audioAnalyser.frequencyBinCount)

        // Connect master output to analyser
        if (Tone.Destination) {
          Tone.Destination.connect(this._audioAnalyser)
        }
      } catch (e) {
        console.warn('Could not create audio analyser:', e)
      }
    }
  }

  /**
   * Start the sound-reactive animation loop
   * Reads audio frequency data and updates CSS custom properties
   * Throttled to ~30fps for performance
   * @private
   */
  _startSoundReactiveLoop() {
    if (this._soundReactiveAnimationId) return

    const cards = document.querySelectorAll('.metric-card')
    const playBtn = document.getElementById('btn-toggle')

    // Add audio-active class to body and sound-reactive to cards
    document.body.classList.add('audio-active')
    cards.forEach(card => card.classList.add('sound-reactive'))

    // Reset frame counter
    this._soundReactiveFrameCount = 0

    const update = () => {
      if (!this._audioAnalyser || !this._audioAnalyserData || !this.isRunning) {
        this._soundReactiveAnimationId = null
        return
      }

      // Throttle to ~30fps (skip every other frame)
      this._soundReactiveFrameCount++
      if (this._soundReactiveFrameCount % 2 !== 0) {
        this._soundReactiveAnimationId = requestAnimationFrame(update)
        return
      }

      // Get frequency data
      this._audioAnalyser.getByteFrequencyData(this._audioAnalyserData)

      // Calculate average amplitude (0-255 range)
      let sum = 0
      for (let i = 0; i < this._audioAnalyserData.length; i++) {
        sum += this._audioAnalyserData[i]
      }
      const average = sum / this._audioAnalyserData.length
      const intensity = Math.min(1, average / 100) // Normalize to 0-1 (boosted sensitivity)

      // Update CSS custom properties on metric cards
      cards.forEach(card => {
        card.style.setProperty('--audio-intensity', intensity.toFixed(3))
      })

      // Update play button glow
      if (playBtn) {
        playBtn.style.setProperty('--btn-glow', intensity.toFixed(3))
      }

      this._soundReactiveAnimationId = requestAnimationFrame(update)
    }

    this._soundReactiveAnimationId = requestAnimationFrame(update)
  }

  /**
   * Stop the sound-reactive animation loop
   * Resets CSS custom properties and removes classes
   * @private
   */
  _stopSoundReactiveLoop() {
    if (this._soundReactiveAnimationId) {
      cancelAnimationFrame(this._soundReactiveAnimationId)
      this._soundReactiveAnimationId = null
    }

    // Disconnect and cleanup analyser to prevent memory leak
    if (this._audioAnalyser) {
      try {
        this._audioAnalyser.disconnect()
      } catch (e) {
        // Ignore disconnect errors
      }
      this._audioAnalyser = null
      this._audioAnalyserData = null
    }

    // Remove classes and reset properties
    document.body.classList.remove('audio-active')
    document.querySelectorAll('.metric-card').forEach(card => {
      card.classList.remove('sound-reactive')
      card.style.setProperty('--audio-intensity', '0')
    })

    const playBtn = document.getElementById('btn-toggle')
    if (playBtn) {
      playBtn.style.setProperty('--btn-glow', '0')
    }
  }

  /**
   * Entry #93: Setup immersive mode toggle functionality
   * Allows users to enter full-screen canvas-only mode
   * @private
   */
  _setupImmersiveMode() {
    const toggleBtn = document.getElementById('immersive-toggle')
    const labelSpan = toggleBtn?.querySelector('.immersive-label')

    if (!toggleBtn) return

    // Create ARIA live region for mode announcements
    let ariaLive = document.getElementById('immersive-aria-live')
    if (!ariaLive) {
      ariaLive = document.createElement('div')
      ariaLive.id = 'immersive-aria-live'
      ariaLive.setAttribute('role', 'status')
      ariaLive.setAttribute('aria-live', 'polite')
      ariaLive.setAttribute('aria-atomic', 'true')
      ariaLive.className = 'sr-only'
      ariaLive.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;'
      document.body.appendChild(ariaLive)
    }

    // Toggle immersive mode on button click
    toggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('immersive-mode')
      const isImmersive = document.body.classList.contains('immersive-mode')

      // Update button label
      if (labelSpan) {
        labelSpan.textContent = isImmersive ? 'Exit' : 'Immersive'
      }

      // Announce mode change for screen readers
      if (ariaLive) {
        ariaLive.textContent = isImmersive
          ? 'Entered immersive mode. Press Escape to exit.'
          : 'Exited immersive mode.'
      }

      // Resize canvas to fill viewport or restore to container
      if (this.visualService && this.canvasContainer) {
        requestAnimationFrame(() => {
          if (isImmersive) {
            this.visualService.resize(window.innerWidth, window.innerHeight)
          } else {
            const rect = this.canvasContainer.getBoundingClientRect()
            this.visualService.resize(rect.width, rect.height)
          }
          // Also resize trail canvas
          this._resizeTrailCanvas()
        })
      }
    })

    // ESC key to exit immersive mode (store handler for cleanup)
    this._immersiveKeyHandler = (e) => {
      if (e.key === 'Escape' && document.body.classList.contains('immersive-mode')) {
        toggleBtn.click()
      }
    }
    document.addEventListener('keydown', this._immersiveKeyHandler)

    // Handle window resize in immersive mode (store handler for cleanup)
    this._immersiveResizeHandler = () => {
      if (document.body.classList.contains('immersive-mode') && this.visualService) {
        this.visualService.resize(window.innerWidth, window.innerHeight)
        this._resizeTrailCanvas()
      }
    }
    window.addEventListener('resize', this._immersiveResizeHandler)

    // Entry #134: Immersive mode mini control bar
    const immersiveControls = document.getElementById('immersive-controls')
    const immersivePlayBtn = document.getElementById('immersive-play-btn')
    const immersiveExitBtn = document.getElementById('immersive-exit-btn')

    // Play/Stop toggle button
    if (immersivePlayBtn) {
      immersivePlayBtn.addEventListener('click', () => {
        if (this.isRunning) {
          this.stop()
        } else {
          this.start()
        }
      })
    }

    // Exit button - exit immersive mode
    if (immersiveExitBtn) {
      immersiveExitBtn.addEventListener('click', () => {
        toggleBtn.click()
      })
    }

    // Auto-hide control bar behavior
    if (immersiveControls) {
      const showControls = () => {
        immersiveControls.classList.add('visible')
        // Clear existing timeout
        if (this._immersiveAutoHideTimeout) {
          clearTimeout(this._immersiveAutoHideTimeout)
        }
        // Set new timeout to hide
        this._immersiveAutoHideTimeout = setTimeout(() => {
          if (document.body.classList.contains('immersive-mode')) {
            immersiveControls.classList.remove('visible')
          }
        }, this._immersiveAutoHideDelay)
      }

      // Show controls on mouse move in immersive mode
      this._immersiveMouseHandler = () => {
        if (document.body.classList.contains('immersive-mode')) {
          showControls()
        }
      }
      document.addEventListener('mousemove', this._immersiveMouseHandler)

      // Also show on touch
      document.addEventListener('touchstart', this._immersiveMouseHandler, { passive: true })

      // Show controls initially when entering immersive mode
      const originalClick = toggleBtn.onclick
      toggleBtn.addEventListener('click', () => {
        if (document.body.classList.contains('immersive-mode')) {
          showControls()
        } else {
          // Clear timeout when exiting
          if (this._immersiveAutoHideTimeout) {
            clearTimeout(this._immersiveAutoHideTimeout)
            this._immersiveAutoHideTimeout = null
          }
          immersiveControls.classList.remove('visible')
        }
      })

      // Keep controls visible when hovering over them
      immersiveControls.addEventListener('mouseenter', () => {
        if (this._immersiveAutoHideTimeout) {
          clearTimeout(this._immersiveAutoHideTimeout)
          this._immersiveAutoHideTimeout = null
        }
        immersiveControls.classList.add('visible')
      })

      immersiveControls.addEventListener('mouseleave', () => {
        if (document.body.classList.contains('immersive-mode')) {
          this._immersiveAutoHideTimeout = setTimeout(() => {
            immersiveControls.classList.remove('visible')
          }, this._immersiveAutoHideDelay)
        }
      })
    }
  }

  /**
   * Cleanup and dispose
   */
  dispose() {
    // console.log('🧹 Cleaning up LandingApp...')

    this.stop()

    // Stop trail fade animation
    this._stopTrailFade()

    // Entry #93: Cleanup immersive mode handlers
    if (this._immersiveKeyHandler) {
      document.removeEventListener('keydown', this._immersiveKeyHandler)
      this._immersiveKeyHandler = null
    }
    if (this._immersiveResizeHandler) {
      window.removeEventListener('resize', this._immersiveResizeHandler)
      this._immersiveResizeHandler = null
    }

    // Entry #134: Cleanup immersive controls handlers
    if (this._immersiveMouseHandler) {
      document.removeEventListener('mousemove', this._immersiveMouseHandler)
      document.removeEventListener('touchstart', this._immersiveMouseHandler)
      this._immersiveMouseHandler = null
    }
    if (this._immersiveAutoHideTimeout) {
      clearTimeout(this._immersiveAutoHideTimeout)
      this._immersiveAutoHideTimeout = null
    }

    // Remove ARIA live region if created
    const ariaLive = document.getElementById('immersive-aria-live')
    if (ariaLive) {
      ariaLive.remove()
    }

    // Exit immersive mode if active
    document.body.classList.remove('immersive-mode')

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
