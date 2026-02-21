/**
 * Webarmonium Landing Page - Main Entry Point (Backend-Driven)
 *
 * Architecture:
 * 1. Socket.io client - Connects to backend for compositions and metrics
 * 2. GenerativeVisualService (REUSED) - Renders spring-mesh visuals for virtual users
 * 3. AudioService (REUSED) - Plays compositions from backend
 * 4. DashboardUI - Displays real-time metrics from backend
 *
 * Backend-driven (Unified Services):
 * - WebMetricsPoller polls Wikipedia/HN/GitHub APIs
 * - BackgroundCompositionService generates compositions (same as rooms, with SectionStateManager)
 * - VirtualUserService manages 3 virtual users (wikipedia, hackernews, github)
 * - Frontend receives compositions + cursors + metrics via socket.io
 */

import { DashboardUI } from './DashboardUI.js'
import { LandingPageRecorder } from './LandingPageRecorder.js'
import { isValidStyle } from '../utils/StyleValidator.js'

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
    this._fullscreenChangeHandler = null

    // Entry #134: Immersive controls auto-hide state
    this._immersiveMouseHandler = null
    this._immersiveTouchHandler = null
    this._immersiveAutoHideTimeout = null
    this._immersiveAutoHideDelay = 3000  // 3 seconds

    // In-page recorder (triggered from composition monitor)
    this.recorder = null

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
      }

      // CRITICAL FIX: Create AudioService EARLY (like normal rooms do)
      // This registers the visibility/focus/pageshow handlers early
      // Audio will only START on user click, but the service exists before
      if (typeof AudioService !== 'undefined' && !this.audioService) {
        this.audioService = new AudioService()
      }

      // Initialize in-page recorder (triggered from composition monitor)
      if (this.visualService && this.audioService) {
        this.recorder = new LandingPageRecorder({
          visualService: this.visualService,
          audioService: this.audioService
        })
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

      // Defer visual service initialization until container has FULL computed dimensions
      // Entry #189: Race condition fix - container must have reasonable height (not just > 0)
      // On hard refresh, container may initially have partial height (e.g., 105px instead of viewport)
      const initVisualService = (attempt = 0) => {
        if (!this.visualService || !this.canvasContainer) return

        const rect = this.canvasContainer.getBoundingClientRect()
        const minHeight = Math.min(400, window.innerHeight * 0.5) // At least 400px or 50% viewport

        if (rect.width > 0 && rect.height >= minHeight) {
          this.visualService.initialize(this.canvasContainer)
          this._setupResizeHandler()
          if (this.visualService.nebulas?.setMaxUsers) {
            this.visualService.nebulas.setMaxUsers(3)
          }
          // console.log('✅ GenerativeVisualService initialized with dimensions:', rect.width, rect.height)
        } else if (attempt < 10) {
          // Retry with increasing delay (50ms, 100ms, 150ms...)
          setTimeout(() => initVisualService(attempt + 1), 50 * (attempt + 1))
        } else {
          // Fallback: initialize anyway after max retries
          console.warn('⚠️ Canvas container height still low after retries:', rect.height)
          this.visualService.initialize(this.canvasContainer)
          this._setupResizeHandler()
        }
      }

      requestAnimationFrame(() => initVisualService(0))

      // Setup join modal (listen/jam choice)
      this._setupJoinModal()

      // Setup socket connection immediately for metrics updates
      // (audio/visuals only start when user presses Start)
      this._setupSocketConnection()

      // Entry #93: Setup immersive mode toggle
      this._setupImmersiveMode()

      // Entry #92: Setup collapsible explainer section
      this._setupCollapsibleExplainer()

      // SLEEP RECOVERY: Listen for tap-to-resume event (state machine approach)
      this._audioTapToResumeHandler = () => {
        if (this.isRunning) {
          this._showAudioRecoveryPrompt()
          this._attachRecoveryClickHandlers()
        }
      }
      window.addEventListener('audio:tap-to-resume', this._audioTapToResumeHandler)

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
   * Setup join modal — Listen or Jam choice
   * Fetches room lobby to determine if listeners can join
   * @private
   */
  _setupJoinModal() {
    const joinBtn = document.getElementById('join-btn')
    const modal = document.getElementById('join-modal')
    const backdrop = modal?.querySelector('.join-modal-backdrop')
    const closeBtn = modal?.querySelector('.join-modal-close')
    const listenBtn = document.getElementById('join-choice-listen')
    const jamBtn = document.getElementById('join-choice-jam')
    const roomsSection = document.getElementById('join-modal-rooms')
    const roomsList = document.getElementById('join-modal-rooms-list')

    if (!joinBtn || !modal) return

    const showModal = () => {
      modal.hidden = false
      requestAnimationFrame(() => modal.classList.add('visible'))
    }

    const hideModal = () => {
      modal.classList.remove('visible')
      setTimeout(() => { modal.hidden = true }, 250)
    }

    // Close modal on backdrop click or close button
    backdrop?.addEventListener('click', hideModal)
    closeBtn?.addEventListener('click', hideModal)

    // Join button click — fetch lobby, decide what to show
    joinBtn.addEventListener('click', async () => {
      try {
        const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
        const baseUrl = isDevelopment
          ? 'http://localhost:3001'
          : `${window.location.protocol}//${window.location.host}`

        const response = await fetch(`${baseUrl}/api/rooms/lobby`)
        const data = await response.json()

        // Filter rooms that have active jammers
        const occupiedRooms = (data.rooms || []).filter(r => r.userCount > 0)

        if (occupiedRooms.length === 0) {
          // No active rooms — go directly to jam mode (current behavior)
          window.location.href = 'rooms.html'
          return
        }

        // Rooms have jammers — show modal with Listen/Jam choice
        // Store lobby data for listen choice
        this._lobbyRooms = occupiedRooms

        // Reset room section visibility
        if (roomsSection) roomsSection.hidden = true

        showModal()
      } catch (error) {
        // Fetch failed — fallback to direct navigation (current behavior)
        console.error('Lobby fetch failed:', error)
        window.location.href = 'rooms.html'
      }
    })

    // Jam button — go directly to rooms.html as jammer
    jamBtn?.addEventListener('click', () => {
      hideModal()
      window.location.href = 'rooms.html?mode=jam'
    })

    // Listen button — show room selector or navigate directly
    listenBtn?.addEventListener('click', () => {
      const rooms = this._lobbyRooms || []

      if (rooms.length === 1) {
        // Single room — navigate directly
        hideModal()
        window.location.href = `rooms.html?room=${encodeURIComponent(rooms[0].roomId)}&mode=listen`
        return
      }

      // Multiple rooms — show room selector
      if (roomsSection && roomsList) {
        roomsList.innerHTML = ''
        for (const room of rooms) {
          const card = document.createElement('button')
          card.className = 'join-modal-room-card'
          const count = parseInt(room.userCount, 10) || 0
          const hasSpace = room.hasSpace === true
          card.innerHTML = `
            <span class="room-card-name">${this._escapeHtml(room.roomId)}</span>
            <span class="room-card-info">
              <span class="room-card-jammers">${count} jammer${count !== 1 ? 's' : ''}</span>
              <span class="room-card-badge ${hasSpace ? 'available' : 'full'}">${hasSpace ? 'Available' : 'Full'}</span>
            </span>
          `
          card.addEventListener('click', () => {
            hideModal()
            window.location.href = `rooms.html?room=${encodeURIComponent(room.roomId)}&mode=listen`
          })
          roomsList.appendChild(card)
        }
        roomsSection.hidden = false
      }
    })
  }

  /**
   * Escape HTML to prevent XSS in dynamic content
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   * @private
   */
  _escapeHtml(str) {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  /**
   * Setup window resize handler to resize canvas with container
   * @private
   */
  _setupResizeHandler() {
    if (this._resizeHandlerAttached) return
    this._resizeHandlerAttached = true

    window.addEventListener('resize', () => {
      // Skip resize during recording (recorder controls canvas dimensions)
      if (this.recorder?._isRecording) return
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

      // STATE MACHINE: If user stopped via DashboardUI Stop button, don't auto-init audio
      // This prevents the race condition where Stop click bubbles to document and triggers this listener
      if (this.audioService?.isAudioStopped()) {
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


      // Connect to backend
      this.socket = io(socketUrl)

      // Connection events
      this.socket.on('connect', () => {
        // console.log('✅ Socket connected to backend')

        // Join landing room (pass empty data so server handler receives callback correctly)
        this.socket.emit('join-landing', {}, (response) => {
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

            // Initialize rooms activity (users in rooms count)
            if (response.roomsActivity) {
              this.dashboardUI.updateRoomsActivity(response.roomsActivity)
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
        // Stop any in-progress recording to prevent orphaned audio connections
        if (this.recorder?._isRecording) {
          this.recorder.stopRecording().catch(() => {})
        }
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

      // Recording commands from composition monitor (via backend relay)
      this.socket.on('recording:command', async (data) => {
        if (!this.recorder || !data || typeof data !== 'object') return

        let result
        if (data.action === 'start') {
          // Set up periodic status reporting via socket
          this.recorder.setStatusCallback((status) => {
            if (this.socket?.connected) {
              this.socket.emit('recording:status', { state: 'recording', ...status })
            }
          })
          result = await this.recorder.startRecording(data.format || 'desktop')
          if (this.socket?.connected) {
            this.socket.emit('recording:status', {
              state: result.success ? 'started' : 'error',
              ...result
            })
          }
        } else if (data.action === 'stop') {
          result = await this.recorder.stopRecording()
          if (this.socket?.connected) {
            this.socket.emit('recording:status', {
              state: result.success ? 'stopped' : 'error',
              ...result
            })
          }
        }
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
            // Entry #183: Pass style for genre-aware voice parameters
            this.audioService.playComposition(data.composition, data.isDrone || false, data.style || {})
            // console.log('🎵 Background composition sent to AudioService')
          } else {
          }
        } else if (!this.isAudioReady) {
          // console.log('⏳ Audio not ready, composition discarded')
        } else {
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

      // Listen for rooms-activity updates (users in rooms count)
      this.socket.on('rooms-activity', (data) => {
        this.dashboardUI.updateRoomsActivity(data)
      })

      // Listen for hold:start events from virtual users (for particles/pulses)
      this.socket.on('hold:start', (data) => {
        if (!this.isRunning) return
        if (!data.isRemote) return // Only handle virtual user events

        // Validate incoming data
        if (!SocketDataValidator.validateHoldStart(data)) {
          return
        }

        // Entry #183: Apply style to audioService for genre-aware voice parameters
        // Entry #183 fix: Use validation and apply to userSynthManager too
        if (isValidStyle(data.style) && this.audioService) {
          this.audioService.currentStyle = data.style
          if (this.audioService.userSynthManager) {
            this.audioService.userSynthManager.setCurrentStyle(data.style)
          }
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
          return
        }

        // Entry #183: Apply style to audioService for genre-aware voice parameters
        // Entry #183 fix: Use validation and apply to userSynthManager too
        if (isValidStyle(data.style) && this.audioService) {
          this.audioService.currentStyle = data.style
          if (this.audioService.userSynthManager) {
            this.audioService.userSynthManager.setCurrentStyle(data.style)
          }
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
      return
    }

    // CRITICAL: Validate velocity before processing
    if (velocity === null || velocity === undefined || isNaN(velocity)) {
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
    }

    // Fallback to gestureSynth if no user synth available
    if (!synth) {
      if (!this.audioService.gestureSynth) {
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
        this._renderTrailHalo(cursorData.x, cursorData.y, intensity, cursorData.color || '#2dd4bf')
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
      return
    }

    const { userId, frequency, velocity, duration, userColor } = data

    // CRITICAL: Validate frequency before processing
    if (frequency === null || frequency === undefined || isNaN(frequency)) {
      return
    }

    // CRITICAL: Validate velocity before processing
    if (velocity === null || velocity === undefined || isNaN(velocity)) {
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
      this._renderTrailHalo(cursorData.x, cursorData.y, intensity, userColor || cursorData.color || '#2dd4bf')
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

        // Entry #187: Start hold monitoring for gesture-based density modulation (diradamento)
        // On landing page, virtualNotes tracks active holds from virtual users
        // Rule: if > 2 prolonged gestures, thin out background
        if (!this.holdDensityMonitorInterval) {
          this.holdDensityMonitorInterval = setInterval(() => {
            if (this.audioService?.isInitialized) {
              const activeHolds = this.virtualNotes?.size || 0
              this.audioService.applyGestureDensityModulation(activeHolds)
            }
          }, 250)  // Check every 250ms
        }

        // Entry #123: Remove global click listeners to prevent race condition
        // If initAudio and start() race, this ensures listeners are cleaned up
        this._removeInitAudioListeners()

        if (this.pendingDrone) {
          // console.log('🎵 Playing pending drone')
          this.audioService.playComposition(this.pendingDrone, true)
          this.pendingDrone = null
        }
      }

      // Update state BEFORE requesting drone - otherwise background-composition handler ignores the response
      // Entry #214: Fix bug where isRunning was set AFTER request-drone, causing drone to be dropped
      this.isRunning = true

      // Socket is already connected from initialize() - just request drone if needed
      if (this.socket?.connected) {
        // Request drone for audio playback
        this.socket.emit('request-drone')
      } else {
        // Fallback: reconnect if socket was disconnected
        this._setupSocketConnection()
      }

      // Entry #93: Toggle canvas glow effect
      this.canvasContainer?.classList.add('active')

      // Entry #134: Add audio-playing class for immersive mode floating button
      document.body.classList.add('audio-playing')

      // Update immersive mode label
      const immersiveLabel = document.querySelector('#immersive-controls .node-btn-wrapper:first-child .node-label')
      if (immersiveLabel) immersiveLabel.textContent = 'Stop'

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

      // Entry #187: Clear hold density monitoring interval
      if (this.holdDensityMonitorInterval) {
        clearInterval(this.holdDensityMonitorInterval)
        this.holdDensityMonitorInterval = null
      }

      // Keep socket connected for metrics updates (don't disconnect)
      // Only audio/visuals stop, metrics dashboard continues updating

      // Update state
      this.isRunning = false

      // Entry #93: Remove canvas glow effect
      this.canvasContainer?.classList.remove('active')

      // Entry #134: Remove audio-playing class for immersive mode floating button
      document.body.classList.remove('audio-playing')

      // Update immersive mode label
      const immersiveLabel = document.querySelector('#immersive-controls .node-btn-wrapper:first-child .node-label')
      if (immersiveLabel) immersiveLabel.textContent = 'Start'

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
   * Handles devicePixelRatio for crisp rendering on high-DPI displays
   * @private
   */
  _resizeTrailCanvas() {
    if (!this.trailCanvas || !this.canvasContainer) return
    const rect = this.canvasContainer.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    // Set internal canvas dimensions with DPR scaling
    this.trailCanvas.width = rect.width * dpr
    this.trailCanvas.height = rect.height * dpr

    // Set CSS dimensions to match container (overrides inline 100% styles)
    this.trailCanvas.style.width = rect.width + 'px'
    this.trailCanvas.style.height = rect.height + 'px'

    // Scale context to handle DPR - all drawing coordinates stay in logical pixels
    if (this.trailCtx) {
      this.trailCtx.setTransform(1, 0, 0, 1, 0, 0) // Reset any existing transform
      this.trailCtx.scale(dpr, dpr)
    }
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

    // Use logical (CSS) dimensions, not canvas internal dimensions (which are scaled by DPR)
    const rect = this.canvasContainer?.getBoundingClientRect()
    const logicalWidth = rect?.width || this.trailCanvas.width
    const logicalHeight = rect?.height || this.trailCanvas.height
    const x = normX * logicalWidth
    const y = normY * logicalHeight

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
    const size = 8 + (intensity * 20)  // Larger trails

    this.trailCtx.save()

    // Neon glow effect - brighter for dark background
    this.trailCtx.globalAlpha = Math.min(1, alpha * 1.2)  // Higher alpha
    this.trailCtx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
    this.trailCtx.shadowColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
    this.trailCtx.shadowBlur = size * 1.5  // More glow

    // Outer glow layer
    this.trailCtx.beginPath()
    this.trailCtx.arc(x, y, size * 0.8, 0, Math.PI * 2)
    this.trailCtx.fill()

    // Inner bright core
    this.trailCtx.globalAlpha = Math.min(1, alpha * 1.5)
    this.trailCtx.shadowBlur = size * 0.5
    this.trailCtx.beginPath()
    this.trailCtx.arc(x, y, size * 0.3, 0, Math.PI * 2)
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

      // Use logical dimensions (CSS) since context is scaled by DPR
      const rect = this.canvasContainer?.getBoundingClientRect()
      const logicalWidth = rect?.width || this.trailCanvas.width
      const logicalHeight = rect?.height || this.trailCanvas.height

      // Use destination-out composite to fade existing content
      this.trailCtx.save()
      this.trailCtx.globalCompositeOperation = 'destination-out'
      this.trailCtx.fillStyle = `rgba(0, 0, 0, ${scaledAlpha})`
      this.trailCtx.fillRect(0, 0, logicalWidth, logicalHeight)
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

  /**
   * Entry #92: Setup collapsible explainer section
   * Allows users to collapse/expand the bottom explainer text
   * Shows on edge hover, auto-hides after 5 seconds
   * @private
   */
  _setupCollapsibleExplainer() {
    const explainer = document.getElementById('mapping-explainer')
    // Button is now OUTSIDE explainer (for visibility when collapsed)
    const handle = document.getElementById('explainer-toggle')

    if (!explainer || !handle) return

    // State
    let autoHideTimeout = null
    const AUTO_HIDE_DELAY = 5000  // 5 seconds

    // Toggle collapsed state on handle click
    handle.addEventListener('click', () => {
      const isCollapsed = explainer.classList.toggle('collapsed')
      handle.setAttribute('aria-expanded', !isCollapsed)

      // Clear auto-hide on manual toggle
      if (autoHideTimeout) {
        clearTimeout(autoHideTimeout)
        autoHideTimeout = null
      }

      // Start auto-hide timer if expanded
      if (!isCollapsed) {
        autoHideTimeout = setTimeout(() => {
          explainer.classList.add('collapsed')
          handle.setAttribute('aria-expanded', 'false')
        }, AUTO_HIDE_DELAY)
      }
    })

    // Desktop only: Edge detection - show when mouse near bottom 30px
    // Exclude right corner where immersive button is (right 5rem = ~80px)
    // Skip on mobile (button handles it there)
    document.addEventListener('mousemove', (e) => {
      // Skip edge detection on mobile - use button instead
      if (window.innerWidth <= 768) return

      const nearBottom = window.innerHeight - e.clientY < 30
      const inImmersiveButtonArea = window.innerWidth - e.clientX < 80

      if (nearBottom && !inImmersiveButtonArea && explainer.classList.contains('collapsed')) {
        // Show explainer
        explainer.classList.remove('collapsed')
        handle.setAttribute('aria-expanded', 'true')

        // Clear existing timer and start new auto-hide
        if (autoHideTimeout) {
          clearTimeout(autoHideTimeout)
        }
        autoHideTimeout = setTimeout(() => {
          explainer.classList.add('collapsed')
          handle.setAttribute('aria-expanded', 'false')
        }, AUTO_HIDE_DELAY)
      }
    })

    // Desktop only: Keep visible while hovering over explainer
    explainer.addEventListener('mouseenter', () => {
      if (window.innerWidth <= 768) return // Skip on mobile
      if (autoHideTimeout) {
        clearTimeout(autoHideTimeout)
        autoHideTimeout = null
      }
    })

    explainer.addEventListener('mouseleave', () => {
      if (window.innerWidth <= 768) return // Skip on mobile
      if (!explainer.classList.contains('collapsed')) {
        autoHideTimeout = setTimeout(() => {
          explainer.classList.add('collapsed')
          handle.setAttribute('aria-expanded', 'false')
        }, AUTO_HIDE_DELAY)
      }
    })

    // Mobile only: Click outside to close
    document.addEventListener('click', (e) => {
      if (window.innerWidth > 768) return // Skip on desktop
      if (!explainer.classList.contains('collapsed') &&
          !explainer.contains(e.target) &&
          !handle.contains(e.target)) {
        explainer.classList.add('collapsed')
        handle.setAttribute('aria-expanded', 'false')
      }
    })

    // Start collapsed
    explainer.classList.add('collapsed')
    handle.setAttribute('aria-expanded', 'false')
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
    toggleBtn.addEventListener('click', async () => {
      const wasImmersive = document.body.classList.contains('immersive-mode')
      const isImmersive = !wasImmersive

      document.body.classList.toggle('immersive-mode')

      // Desktop: Use Fullscreen API (must be called synchronously from user gesture)
      const isMobile = window.PlatformDetection?.isMobile?.() || false
      if (!isMobile) {
        if (isImmersive) {
          // Enter fullscreen
          try {
            const docEl = document.documentElement
            const requestFullscreen = docEl.requestFullscreen ||
              docEl.webkitRequestFullscreen ||
              docEl.mozRequestFullScreen ||
              docEl.msRequestFullscreen
            if (requestFullscreen) {
              await requestFullscreen.call(docEl)
              this._showFullscreenEscNotice()
            }
          } catch (err) {
            // Fullscreen denied, continue without
          }
        } else {
          // Exit fullscreen
          const fullscreenElement = document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement
          if (fullscreenElement) {
            const exitFullscreen = document.exitFullscreen ||
              document.webkitExitFullscreen ||
              document.mozCancelFullScreen ||
              document.msExitFullscreen
            if (exitFullscreen) {
              exitFullscreen.call(document).catch(() => {})
            }
          }
        }
      }

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

    // Fullscreen change handler - sync immersive mode with fullscreen state
    this._fullscreenChangeHandler = () => {
      const fullscreenElement = document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      // If user exits fullscreen (via browser ESC) while in immersive mode, exit immersive too
      if (!fullscreenElement && document.body.classList.contains('immersive-mode')) {
        document.body.classList.remove('immersive-mode')
        if (labelSpan) labelSpan.textContent = 'Immersive'
        if (ariaLive) ariaLive.textContent = 'Exited immersive mode.'
        // Restore canvas size
        if (this.visualService && this.canvasContainer) {
          requestAnimationFrame(() => {
            const rect = this.canvasContainer.getBoundingClientRect()
            this.visualService.resize(rect.width, rect.height)
            this._resizeTrailCanvas()
          })
        }
        // Hide controls
        const controls = document.getElementById('immersive-controls')
        if (controls) controls.classList.remove('visible')
      }
    }
    document.addEventListener('fullscreenchange', this._fullscreenChangeHandler)
    document.addEventListener('webkitfullscreenchange', this._fullscreenChangeHandler)
    document.addEventListener('mozfullscreenchange', this._fullscreenChangeHandler)
    document.addEventListener('MSFullscreenChange', this._fullscreenChangeHandler)

    // Entry #136: Show immersive toggle when mouse enters bottom-right corner
    // This is the opposite corner from explainer (which uses left side of bottom edge)
    let immersiveHideTimeout = null
    const IMMERSIVE_AUTO_HIDE_DELAY = 3000

    document.addEventListener('mousemove', (e) => {
      // Skip if already in immersive mode (button always visible there)
      if (document.body.classList.contains('immersive-mode')) return

      const nearBottom = window.innerHeight - e.clientY < 30
      const nearRightEdge = window.innerWidth - e.clientX < 80

      if (nearBottom && nearRightEdge) {
        // Show button
        toggleBtn.classList.add('visible')

        // Reset auto-hide timer
        if (immersiveHideTimeout) {
          clearTimeout(immersiveHideTimeout)
        }
        immersiveHideTimeout = setTimeout(() => {
          toggleBtn.classList.remove('visible')
        }, IMMERSIVE_AUTO_HIDE_DELAY)
      }
    })

    // Keep visible while hovering over button
    toggleBtn.addEventListener('mouseenter', () => {
      if (immersiveHideTimeout) {
        clearTimeout(immersiveHideTimeout)
        immersiveHideTimeout = null
      }
    })

    toggleBtn.addEventListener('mouseleave', () => {
      if (!document.body.classList.contains('immersive-mode')) {
        immersiveHideTimeout = setTimeout(() => {
          toggleBtn.classList.remove('visible')
        }, IMMERSIVE_AUTO_HIDE_DELAY)
      }
    })

    // Handle window resize in immersive mode (store handler for cleanup)
    this._immersiveResizeHandler = () => {
      // Skip resize during recording (recorder controls canvas dimensions)
      if (this.recorder?._isRecording) return
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

      // Show controls on mouse move in immersive mode (desktop only)
      const isMobile = window.PlatformDetection?.isMobile?.() || false
      this._immersiveMouseHandler = () => {
        if (document.body.classList.contains('immersive-mode') && !isMobile) {
          showControls()
        }
      }
      document.addEventListener('mousemove', this._immersiveMouseHandler)

      // Touch in bottom-right corner shows controls (mobile only)
      this._immersiveTouchHandler = (e) => {
        if (!document.body.classList.contains('immersive-mode')) return
        if (!isMobile) return
        const touch = e.touches[0]
        if (!touch) return
        const TOUCH_THRESHOLD = 100  // Larger touch target for mobile
        const nearBottom = window.innerHeight - touch.clientY < TOUCH_THRESHOLD
        const nearRight = window.innerWidth - touch.clientX < TOUCH_THRESHOLD
        if (nearBottom && nearRight) {
          showControls()
        }
      }
      document.addEventListener('touchstart', this._immersiveTouchHandler, { passive: true })

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
   * Show ESC notice when entering fullscreen (desktop only)
   * @private
   */
  _showFullscreenEscNotice() {
    const notice = document.getElementById('fullscreen-esc-notice')
    if (notice) {
      notice.classList.add('visible')
      setTimeout(() => notice.classList.remove('visible'), 3000)
    }
  }

  // ========================
  // Audio Recovery Overlay (Tap to Resume)
  // ========================

  /**
   * Show audio recovery prompt overlay
   * Matches styling from main.js for consistency
   */
  _showAudioRecoveryPrompt() {
    // Only show if audio was previously started
    if (!this.isRunning) return

    // Check if prompt already exists
    if (document.getElementById('audio-recovery-prompt')) return

    // Inject CSS if not already present
    if (!document.getElementById('audio-recovery-styles')) {
      const style = document.createElement('style')
      style.id = 'audio-recovery-styles'
      style.textContent = `
        .audio-recovery-card {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 9999;
          background: var(--ui-bg, rgba(10, 10, 20, 0.55));
          border: 1px solid var(--line, rgba(42, 42, 56, 0.8));
          border-radius: 12px;
          padding: 1rem 1.5rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          animation: audio-recovery-fade-in 0.3s ease-out;
        }
        @keyframes audio-recovery-fade-in {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        .audio-recovery-text {
          color: var(--bright, #e0e0f0);
          font-family: var(--font-body, 'Space Grotesk', system-ui, -apple-system, sans-serif);
          font-size: 0.9rem;
          font-weight: 500;
          margin: 0;
        }
        .audio-recovery-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.5rem 1rem;
          background: transparent;
          border: 1.5px solid var(--accent, #2dd4bf);
          border-radius: 6px;
          color: var(--accent, #2dd4bf);
          font-family: var(--font-body, 'Space Grotesk', system-ui, -apple-system, sans-serif);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
        }
        .audio-recovery-btn:hover {
          background: rgba(45, 212, 191, 0.15);
        }
        :root[data-theme="light"] .audio-recovery-btn:hover {
          background: rgba(45, 212, 191, 0.25);
        }
        .audio-recovery-btn:active {
          transform: scale(0.97);
        }
        .audio-recovery-btn svg {
          width: 1em;
          height: 1em;
          fill: currentColor;
        }
      `
      document.head.appendChild(style)
    }

    const card = document.createElement('div')
    card.id = 'audio-recovery-prompt'
    card.className = 'audio-recovery-card'
    card.innerHTML = `
      <p class="audio-recovery-text">Audio paused</p>
      <button class="audio-recovery-btn" aria-label="Resume audio">
        <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
          <polygon points="4,2 14,8 4,14"/>
        </svg>
        Resume
      </button>
    `
    document.body.appendChild(card)
  }

  /**
   * Attach click/touch handlers for audio recovery
   */
  _attachRecoveryClickHandlers() {
    if (this._audioRecoveryClickHandler) return

    this._audioRecoveryClickHandler = () => this._handleAudioRecoveryClick()
    this._audioRecoveryTouchHandler = (e) => {
      e.preventDefault()
      this._handleAudioRecoveryClick()
    }

    document.addEventListener('click', this._audioRecoveryClickHandler, { once: true })
    document.addEventListener('touchstart', this._audioRecoveryTouchHandler, { once: true, passive: false })
  }

  /**
   * Handle click/touch for audio recovery
   */
  async _handleAudioRecoveryClick() {
    const prompt = document.getElementById('audio-recovery-prompt')
    if (prompt) {
      prompt.remove()

      this._audioRecoveryClickHandler = null
      this._audioRecoveryTouchHandler = null

      // Trigger audio recovery via AudioService state machine
      if (this.audioService && this.audioService.resumeFromTap) {
        await this.audioService.resumeFromTap()
      }
    }
  }

  /**
   * Cleanup audio recovery listeners
   */
  _cleanupAudioRecoveryListeners() {
    if (this._audioTapToResumeHandler) {
      window.removeEventListener('audio:tap-to-resume', this._audioTapToResumeHandler)
      this._audioTapToResumeHandler = null
    }
    if (this._audioRecoveryClickHandler) {
      document.removeEventListener('click', this._audioRecoveryClickHandler)
      this._audioRecoveryClickHandler = null
    }
    if (this._audioRecoveryTouchHandler) {
      document.removeEventListener('touchstart', this._audioRecoveryTouchHandler)
      this._audioRecoveryTouchHandler = null
    }
    const prompt = document.getElementById('audio-recovery-prompt')
    if (prompt) prompt.remove()
  }

  /**
   * Cleanup and dispose
   */
  dispose() {
    // console.log('🧹 Cleaning up LandingApp...')

    this.stop()

    // Cleanup audio recovery listeners
    this._cleanupAudioRecoveryListeners()

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
    if (this._fullscreenChangeHandler) {
      document.removeEventListener('fullscreenchange', this._fullscreenChangeHandler)
      document.removeEventListener('webkitfullscreenchange', this._fullscreenChangeHandler)
      document.removeEventListener('mozfullscreenchange', this._fullscreenChangeHandler)
      document.removeEventListener('MSFullscreenChange', this._fullscreenChangeHandler)
      this._fullscreenChangeHandler = null
    }

    // Entry #134: Cleanup immersive controls handlers
    if (this._immersiveMouseHandler) {
      document.removeEventListener('mousemove', this._immersiveMouseHandler)
      this._immersiveMouseHandler = null
    }
    if (this._immersiveTouchHandler) {
      document.removeEventListener('touchstart', this._immersiveTouchHandler)
      this._immersiveTouchHandler = null
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
 * Apply saved theme on startup
 */
function initializeTheme() {
  if (typeof UserSettings !== 'undefined') {
    const theme = UserSettings.getEffectiveTheme()
    UserSettings.applyTheme(theme)
  }
}

/**
 * Initialize on DOM ready
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeTheme()
    window.landingApp = new LandingApp()
    window.landingApp.initialize()
  })
} else {
  initializeTheme()
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
