/**
 * Webarmonium - Collaborative Generative Music Platform
 * Main application entry point
 */

class WebarmoniumApp {
  constructor() {
    this.gestureCapture = null
    this.socketService = null
    this.audioService = null
    this.canvas = null
    this.ctx = null
    this.isAudioStarted = false
    this.currentRoom = null
    this.userCount = 1

    // Multi-user canvas services
    this.cursorOverlayCanvas = null
    this.drawingRenderer = null
    this.cursorManager = null
    this.audioControls = null
    this.isDrawing = false
    this.currentStrokeWidth = 2

    // Performance tracking
    this.lastFrameTime = 0
    this.frameCount = 0
    this.fps = 60

    // Drag phrase throttling
    this.lastDragPhraseTime = 0

    // Click/drag discrimination timer
    this.gestureStartTime = 0
    this.gestureTimer = null
    this.pendingGesture = null

    // Bound event handlers for cleanup
    this.boundResizeHandler = null

    // Initialize the application
    this.init()
  }

  async init() {
    try {
      console.log('🎵 Initializing Webarmonium...')

      // Setup canvas
      this.setupCanvas()

      // Initialize services
      await this.initializeServices()

      // Setup event listeners
      this.setupEventListeners()

      // Connect to server
      await this.connectToServer()

      // Start render loop
      this.startRenderLoop()

      // Try to auto-start audio (may require user interaction)
      this.attemptAutoStartAudio()

      // Hide loading screen
      this.showApp()

      console.log('✅ Webarmonium initialized successfully')
    } catch (error) {
      console.error('❌ Failed to initialize Webarmonium:', error)
      this.showError('Failed to initialize application: ' + error.message)
    }
  }

  setupCanvas() {
    this.canvas = document.getElementById('gestureCanvas')
    this.ctx = this.canvas.getContext('2d')

    // Create cursor overlay canvas
    this.cursorOverlayCanvas = document.getElementById('cursorOverlay')
    if (!this.cursorOverlayCanvas) {
      this.cursorOverlayCanvas = document.createElement('canvas')
      this.cursorOverlayCanvas.id = 'cursorOverlay'
      this.cursorOverlayCanvas.style.position = 'absolute'
      this.cursorOverlayCanvas.style.top = '0'
      this.cursorOverlayCanvas.style.left = '0'
      this.cursorOverlayCanvas.style.pointerEvents = 'none'
      this.cursorOverlayCanvas.style.zIndex = '10'
      this.canvas.parentElement.appendChild(this.cursorOverlayCanvas)
    }

    // Set canvas size to match viewport
    this.resizeCanvas()

    // Handle window resize - store bound handler for cleanup
    this.boundResizeHandler = () => this.resizeCanvas()
    window.addEventListener('resize', this.boundResizeHandler)
  }

  resizeCanvas() {
    const devicePixelRatio = window.devicePixelRatio || 1

    // Resize main canvas
    this.canvas.width = window.innerWidth * devicePixelRatio
    this.canvas.height = window.innerHeight * devicePixelRatio
    this.canvas.style.width = window.innerWidth + 'px'
    this.canvas.style.height = window.innerHeight + 'px'
    this.ctx.scale(devicePixelRatio, devicePixelRatio)

    // Resize cursor overlay canvas
    if (this.cursorOverlayCanvas) {
      this.cursorOverlayCanvas.width = window.innerWidth * devicePixelRatio
      this.cursorOverlayCanvas.height = window.innerHeight * devicePixelRatio
      this.cursorOverlayCanvas.style.width = window.innerWidth + 'px'
      this.cursorOverlayCanvas.style.height = window.innerHeight + 'px'
    }

    // Update services with new canvas size
    if (this.drawingRenderer) {
      this.drawingRenderer.setCanvasSize(
        window.innerWidth * devicePixelRatio,
        window.innerHeight * devicePixelRatio
      )
    }
    if (this.cursorManager) {
      this.cursorManager.setCanvasSize(
        window.innerWidth * devicePixelRatio,
        window.innerHeight * devicePixelRatio
      )
    }
  }

  async initializeServices() {
    // Initialize audio service with proper ordering
    if (window.AudioService) {
      console.log('✅ AudioService class found, creating instance')
      this.audioService = new window.AudioService()
      window.AudioServicePromise = null // Clean up
    } else {
      console.log('⚠️ AudioService not found, creating new instance')
      this.audioService = new AudioService()
    }

    // Initialize socket service using SocketService (which uses socket.io)
    console.log('🔌 Initializing SocketService...')
    this.socketService = new SocketService()
    this.socketServicePromise = Promise.resolve(this.socketService.socket);

    // Create basic gesture to music mapper for EnhancedGestureCapture
    const basicGestureToMusicMapper = {
      gestureToMusicalEvent: (gesture) => {
        // Basic mapping: position to pitch, intensity to velocity
        const pitch = 60 + Math.floor((gesture.coordinates?.y || 0.5) * 24) // C4 to C6 range
        const velocity = Math.floor((gesture.intensity || 0.5) * 127)
        const duration = 0.2 + (1 - (gesture.speed || 0.5)) * 0.8 // Speed affects duration

        return {
          pitch,
          velocity,
          duration,
          articulation: gesture.speed > 0.7 ? 'staccato' : gesture.speed < 0.3 ? 'legato' : 'default',
          eventType: 'note'
        }
      },
      setTempo: (tempo) => {
        console.log('🎛️ Gesture mapper tempo set to:', tempo)
      },
      setScale: (scale) => {
        console.log('🎛️ Gesture mapper scale set to:', scale)
      }
    }

    // Initialize gesture capture with EnhancedGestureCapture for three-tier architecture
    console.log('🎯 Initializing EnhancedGestureCapture with canvas:', this.canvas)
    this.gestureCapture = new EnhancedGestureCapture(this.canvas, basicGestureToMusicMapper, this.socketService)
    console.log('🎯 EnhancedGestureCapture created:', this.gestureCapture)

    // Start EnhancedGestureCapture
    this.gestureCapture.start()
    console.log('🎯 EnhancedGestureCapture started')

    // Initialize multi-user canvas services
    this.drawingRenderer = new DrawingRenderer(this.canvas)
    this.cursorManager = new CursorManager(this.cursorOverlayCanvas)

    // Initialize audio controls
    const audioControlsContainer = document.getElementById('audio-controls')
    if (audioControlsContainer) {
      this.audioControls = new AudioControls(
        audioControlsContainer,
        (muted) => this.handleMuteChange(muted),
        (volume) => this.handleVolumeChange(volume)
      )
    }

    // Start cursor rendering loop (60fps)
    this.cursorManager.startRendering()

    // Track gesture time for optimized canvas clearing
    this.lastGestureRenderTime = 0

    // Setup hover modulation for three-tier architecture
    this.gestureCapture.setHoverModulationCallback((hoverData) => {
      console.log('🎛️ Hover modulation callback triggered:', hoverData)

      // Rimuoviamo l'indicatore visivo del tremolo
      // this.updateTremoloIndicator(hoverData)

      console.log('🔊 Audio state - started:', this.isAudioStarted, 'service exists:', !!this.audioService, 'method exists:', !!(this.audioService && this.audioService.handleHoverModulation))

      if (this.isAudioStarted && this.audioService && this.audioService.handleHoverModulation) {
        console.log('🎛️ Calling handleHoverModulation...')
        this.audioService.handleHoverModulation(hoverData)
      } else {
        console.warn('⚠️ Hover modulation blocked - Audio not ready')
      }
    })

    // Setup gesture handling
    this.gestureCapture.onGesture = (gesture) => {
      this.lastGestureRenderTime = performance.now()
      console.log('🎯 Gesture callback triggered:', gesture)
      console.log('🔊 Audio state when gesture received - started:', this.isAudioStarted, 'service exists:', !!this.audioService)

      // EnhancedGestureCapture doesn't provide action field, determine from gesture characteristics
      const gestureAction = this.determineGestureAction(gesture)
      const enhancedGesture = { ...gesture, action: gestureAction }

      console.log('🎯 Enhanced gesture action:', gestureAction, 'will call handleGesture')
      this.handleGesture(enhancedGesture)
    }

    // Setup gesture start/end for proper three-tier handling
    this.gestureCapture.onGestureStart = (gesture) => {
      console.log('👆 Gesture start callback:', gesture.id)
      // Handle initial gesture filtering
      if (this.audioService && this.audioService.updateFilterParams) {
        // Apply initial filter based on gesture start position
        const position = gesture.coordinates || gesture.startPosition || { x: 0.5, y: 0.5 }
        this.audioService.updateFilterParams({
          frequency: 200 + (position.y * 2000),
          resonance: 0.5 + (position.x * 3)
        })
      }
    }

    this.gestureCapture.onGestureEnd = (gesture, musicalEvent) => {
      console.log('👋 Gesture end callback:', gesture.id, musicalEvent)
      console.log('🔍 Gesture end details:', {
        gestureAction: gesture.action,
        willCalculate: this.determineGestureAction(gesture)
      })

      // CRITICAL FIX: Don't play automatic musical events for TAP gestures
      // We want only our custom click logic for taps
      const gestureAction = gesture.action || this.determineGestureAction(gesture)
      console.log('🔍 Final gesture action for end callback:', gestureAction)

      if (gestureAction === 'tap') {
        console.log('🚫 Skipping automatic musical event for TAP gesture')
        return
      }

      // Process completed gesture for musical phrase generation
      if (musicalEvent && this.audioService && this.audioService.playMusicalEvent) {
        this.audioService.playMusicalEvent(musicalEvent)
      }
    }

    console.log('🎯 All gesture callbacks set up including hover modulation')
  }

  setupEventListeners() {
    // Audio toggle button
    const audioToggle = document.getElementById('audioToggle')
    audioToggle.addEventListener('click', () => this.toggleAudio())

    
    // Canvas drawing interaction
    this.setupDrawingEvents()

    // Socket event listeners
    this.socketService.on('room-joined', (data) => {
      this.currentRoom = data.room
      this.updateRoomDisplay()
      console.log('🏠 Joined room:', data.room.id)
    })

    this.socketService.on('user-joined', (data) => {
      this.userCount = data.userCount
      this.updateRoomDisplay()
      console.log('👤 User joined, total users:', this.userCount)
    })

    this.socketService.on('user-left', (data) => {
      this.userCount = data.userCount
      this.updateRoomDisplay()
      console.log('👋 User left, total users:', this.userCount)

      // Remove user's cursor
      if (data.userId && this.cursorManager) {
        this.cursorManager.removeCursor(data.userId)
      }
    })

    // Multi-user canvas events
    this.socketService.on('draw-stroke', (stroke) => {
      if (this.drawingRenderer) {
        this.drawingRenderer.renderStroke(stroke)
      }

      // Play draw sound for remote user's stroke
      if (this.audioService && stroke.color) {
        this.audioService.playDrawSound(stroke.color)
      }
    })

    this.socketService.on('cursor-position', (data) => {
      console.log('👆 Cursor position received:', data.userId.substring(0, 8), `(${data.x.toFixed(2)}, ${data.y.toFixed(2)})`, data.color)
      if (this.cursorManager) {
        console.log('✅ Updating cursor in CursorManager')
        this.cursorManager.updateCursor(
          data.userId,
          data.x,
          data.y,
          data.color,
          data.isDrawing
        )
      } else {
        console.error('❌ CursorManager not initialized!')
      }
    })

    this.socketService.on('drawing-history', (data) => {
      if (this.drawingRenderer && data.strokes) {
        console.log(`📜 Received drawing history: ${data.strokes.length} strokes`)
        this.drawingRenderer.renderStrokeHistory(data.strokes)
      }
    })

    this.socketService.on('sonic-update', (update) => {
      if (this.isAudioStarted) {
        this.audioService.updatePatterns(update.patterns)
      }
    })

    this.socketService.on('gesture-processed', (response) => {
      // Use same logic as local gestures but for remote users
      if (this.isAudioStarted && response.sonicParams && response.gesture?.action !== 'hover') {
        const action = response.gesture?.action || 'generic'
        const sonicParams = response.sonicParams

        if (action === 'drag') {
          console.log('🎵 REMOTE DRAG - articulated phrase')
          const velocity = response.gesture?.velocity || 100
          const noteCount = Math.max(2, Math.min(5, Math.floor(velocity / 25))) // Same as local
          const baseFreq = 110 + (1 - sonicParams.y) * 440

          console.log(`🎵 REMOTE DRAG: Creating ${noteCount} note phrase with velocity ${velocity.toFixed(1)}`)

          for (let i = 0; i < noteCount; i++) {
            const delay = i * 180 + Math.random() * 60 // Same timing as local

            setTimeout(() => {
              const noteFreq = baseFreq + (Math.random() - 0.5) * 200 // Same variation as local
              const noteDuration = 0.15 + Math.random() * 0.25 // Same duration as local

              // Direct synth access like local gestures
              if (this.audioService.gestureSynth) {
                this.audioService.gestureSynth.triggerAttackRelease(
                  noteFreq,
                  noteDuration,
                  Tone.now() + 0.01,
                  0.3 + Math.random() * 0.4 // Same velocity as local
                )

                console.log(`🎵 REMOTE Note ${i+1}/${noteCount}: ${noteFreq.toFixed(1)}Hz, duration: ${(noteDuration*1000).toFixed(0)}ms`)
              }
            }, delay)
          }
        } else if (action === 'start') {
          console.log('🎵 REMOTE TAP/CLICK - single note')
          console.log('🔍 REMOTE TAP details:', {
            action: action,
            intensity: sonicParams.intensity,
            position: { x: sonicParams.x, y: sonicParams.y }
          })
          const frequency = 110 + (1 - sonicParams.y) * 660
          // Force cleanup for remote clicks
          if (this.audioService.gestureSynth) {
            this.audioService.gestureSynth.releaseAll()
            setTimeout(() => {
              this.audioService.playThreeTierNote(frequency, 'remote', 150, {
                volume: 0.5, // FIXED volume - remove intensity modulation
                duration: '8n' // Short duration for remote clicks
              })
            }, 10)
          }
        } else {
          console.log('🎵 REMOTE GENERIC action:', action, '- single note')
          console.log('🔍 REMOTE GENERIC details:', {
            action: action,
            intensity: sonicParams.intensity,
            position: { x: sonicParams.x, y: sonicParams.y }
          })
          const frequency = 110 + (1 - sonicParams.y) * 440
          this.audioService.playThreeTierNote(frequency, 'remote', response.gesture?.velocity || 100, {
            volume: 0.5, // FIXED volume - remove intensity modulation
          })
        }
      }
    })

    // Handle hover events from backend for cross-layer modulation
    this.socketService.on('hover-update', (data) => {
      console.log('🎛️ REMOTE HOVER UPDATE RECEIVED:', {
        isAudioStarted: this.isAudioStarted,
        hasAudioService: !!this.audioService,
        hasHandleHoverModulation: !!(this.audioService && this.audioService.handleHoverModulation),
        data: data,
        timestamp: Date.now()
      })

      if (this.isAudioStarted && this.audioService && this.audioService.handleHoverModulation) {
        console.log('🎛️ CALLING handleHoverModulation for remote hover...')
        this.audioService.handleHoverModulation({
          position: data.position,
          velocity: data.velocity,
          intensity: data.intensity,
          isRemote: true // Remote hover
        })
        console.log('✅ Remote hover modulation completed')
      } else {
        console.warn('⚠️ Remote hover blocked - audio not ready:', {
          isAudioStarted: this.isAudioStarted,
          hasAudioService: !!this.audioService,
          hasHandleHoverModulation: !!(this.audioService && this.audioService.handleHoverModulation)
        })
      }
    })

    // Handle musical events from backend (drag phrases, etc.)
    this.socketService.on('musical-event', (musicalEvent) => {
      if (this.isAudioStarted && musicalEvent) {
        console.log('🎵 Playing musical event:', musicalEvent)
        this.audioService.playMusicalEvent(musicalEvent)
      }
    })

    // Handle filter modulation events (hover) - LEGACY for backward compatibility
    this.socketService.on('filter-modulation', (filterParams) => {
      console.log('🎛️ Received filter-modulation event (legacy):', filterParams)
      if (this.isAudioStarted && filterParams) {
        console.log('🎛️ Applying filter modulation:', filterParams)
        this.audioService.updateFilterParams(filterParams)
      } else {
        console.log('🎛️ Audio not started or no filter params, skipping')
      }
    })

    // Handle unified modulation from HoverOrchestrator
    this.socketService.on('unified-modulation', (modulationData) => {
      console.log('🎛️ Received unified-modulation event:', modulationData)
      if (this.isAudioStarted && modulationData) {
        console.log('🎛️ Applying unified modulation:', modulationData)
        this.audioService.applyUnifiedModulation(modulationData)
      } else {
        console.log('🎛️ Audio not started or no modulation data, skipping')
      }
    })

    // Debug: handle raw hover events in development
    this.socketService.on('hover-update-raw', (hoverData) => {
      if (process.env.NODE_ENV === 'development' && this.isAudioStarted && hoverData) {
        console.log('🐛 Debug: Processing raw hover event:', hoverData)
        // Apply old-style hover modulation for comparison
        this.audioService.handleHoverModulation(hoverData)
      }
    })

    this.socketService.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error)
      this.showError('Unable to connect to server. Please ensure the backend is running on port 3001.')
    })

    this.socketService.on('room-full', (data) => {
      console.error('❌ Room is full:', data.error)
      this.showError(`Unable to join room: ${data.error}. The room has reached maximum capacity (10 users). Please try again later.`)
    })
  }

  setupDrawingEvents() {
    let isDrawing = false
    let currentStrokeId = null

    // Throttle cursor-move to 50ms (20fps) for performance (FR-006)
    let lastCursorEmit = 0
    const cursorThrottleMs = 50

    const getCanvasCoordinates = (e) => {
      const rect = this.canvas.getBoundingClientRect()
      let clientX, clientY

      // Handle both mouse and touch events
      if (e.touches && e.touches[0]) {
        clientX = e.touches[0].clientX
        clientY = e.touches[0].clientY
      } else {
        clientX = e.clientX
        clientY = e.clientY
      }

      const x = (clientX - rect.left) / rect.width
      const y = (clientY - rect.top) / rect.height

      return { x, y }
    }

    const emitCursorPosition = (x, y, isDrawingState) => {
      const now = Date.now()
      if (now - lastCursorEmit >= cursorThrottleMs) {
        console.log(`📍 Emitting cursor-move: (${x.toFixed(2)}, ${y.toFixed(2)}), drawing: ${isDrawingState}`)
        this.socketService.socket.emit('cursor-move', {
          x,
          y,
          isDrawing: isDrawingState,
          timestamp: now
        })
        lastCursorEmit = now
      }
    }

    const startDrawing = (e) => {
      e.preventDefault()
      isDrawing = true
      currentStrokeId = `stroke-${Date.now()}-${Math.random()}`

      const { x, y } = getCanvasCoordinates(e)

      // Emit draw-start event
      this.socketService.socket.emit('draw-start', {
        strokeId: currentStrokeId,
        x,
        y,
        strokeWidth: this.currentStrokeWidth,
        timestamp: Date.now()
      })

      console.log('✏️ Draw started:', currentStrokeId)
    }

    const draw = (e) => {
      const { x, y } = getCanvasCoordinates(e)

      if (!isDrawing) {
        // Emit cursor position with throttling (FR-006)
        emitCursorPosition(x, y, false)
        return
      }

      e.preventDefault()

      // Emit draw-point event
      this.socketService.socket.emit('draw-point', {
        strokeId: currentStrokeId,
        x,
        y,
        timestamp: Date.now()
      })

      // Also emit cursor-move with throttling
      emitCursorPosition(x, y, true)
    }

    const endDrawing = (e) => {
      if (!isDrawing) return

      e.preventDefault()
      isDrawing = false

      const { x, y } = getCanvasCoordinates(e)

      // Emit draw-end event with coordinates
      this.socketService.socket.emit('draw-end', {
        strokeId: currentStrokeId,
        x,
        y,
        timestamp: Date.now()
      })

      console.log('✏️ Draw ended:', currentStrokeId)
      currentStrokeId = null
    }

    // Mouse/Touch events - DISABLED to avoid conflicts with EnhancedGestureCapture
    // NOTE: EnhancedGestureCapture handles all gesture events including hover
    console.log('🚫 Mouse/Touch events disabled - using EnhancedGestureCapture instead')
  }

  async connectToServer() {
    try {
      await this.socketService.connect('http://localhost:3001')

      // Join a room
      const userData = {
        device: this.detectDevice(),
        capabilities: {
          touch: 'ontouchstart' in window,
          mouse: true,
          gyroscope: 'DeviceOrientationEvent' in window
        }
      }

      await this.socketService.joinRoom('main-room', userData)

    } catch (error) {
      throw new Error('Failed to connect to server: ' + error.message)
    }
  }

  detectDevice() {
    const userAgent = navigator.userAgent
    if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
      return 'mobile' // Backend expects only 'desktop' or 'mobile'
    }
    if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
      return 'mobile'
    }
    return 'desktop'
  }

  async toggleAudio() {
    const button = document.getElementById('audioToggle')

    if (!this.isAudioStarted) {
      try {
        console.log('🔊 Manual audio start requested...')
        // Start audio context (requires user interaction)
        const startResult = await this.audioService.start()
        console.log('🔊 AudioService.start() result:', startResult)

        if (startResult) {
          this.isAudioStarted = true
          button.textContent = '🔇 Stop Audio'
          button.classList.remove('disabled')
          console.log('🔊 Audio started successfully')
        } else {
          console.warn('⚠️ AudioService.start() returned false')
        }
      } catch (error) {
        console.error('❌ Failed to start audio:', error)
        this.showError('Failed to start audio: ' + error.message)
      }
    } else {
      console.log('🔇 Stopping audio...')
      this.audioService.stop()
      this.isAudioStarted = false
      button.textContent = '🔊 Start Audio'
      console.log('🔇 Audio stopped')
    }
  }

  /**
   * Attempt to auto-start audio context
   * Browser policies may require user interaction, but we try
   */
  async attemptAutoStartAudio() {
    try {
      // Try to start audio context automatically
      if (this.audioService && !this.isAudioStarted) {
        console.log('🔊 Attempting auto-start audio...')

        // Force manual interaction by creating a dummy click event
        const startResult = await this.audioService.start()
        console.log('🔊 AudioService.start() result:', startResult)

        if (startResult) {
          this.isAudioStarted = true

          // Update button state
          const button = document.getElementById('audioToggle')
          if (button) {
            button.textContent = '🔇 Stop Audio'
            button.classList.remove('disabled')
          }

          console.log('🔊 Audio auto-started successfully')
        } else {
          console.warn('⚠️ AudioService.start() returned false')
        }
      } else {
        console.log('🔊 Audio already started or service not available')
      }
    } catch (error) {
      console.error('❌ Auto-start audio failed:', error)
      console.warn('⚠️ User may need to click Start Audio button manually')
    }
  }

  handleGesture(gesture) {
    console.log('🚨 HANDLE GESTURE CALLED - action:', gesture.action, 'id:', gesture.id)

    // Send gesture to server with action field
    this.socketService.sendGesture(gesture)

    // Handle different gesture types for local audio
    if (!this.isAudioStarted) {
      console.log('🎵 Gesture captured but audio not started')
      this.drawGestureTrail(gesture)
      return
    }

    // CRITICAL FIX: Use timer to distinguish click from drag
    const gestureAction = gesture.action || this.determineGestureAction(gesture)
    console.log('🔍 Determined gesture action:', gestureAction, 'from gesture.action:', gesture.action)

    // Clear any existing timer
    if (this.gestureTimer) {
      clearTimeout(this.gestureTimer)
      this.gestureTimer = null
    }

    const sonicParams = {
      x: gesture.coordinates.x,
      y: gesture.coordinates.y,
      intensity: gesture.intensity,
      timestamp: gesture.timestamp,
      action: gestureAction,
      device: gesture.device
    }

    // Special handling for gesture discrimination
    if (gestureAction === 'tap') {
      // Immediate handling for tap/click
      console.log('🎯 TAP branch - calling processClickGesture')
      this.processClickGesture(gesture, sonicParams)
    } else if (gestureAction === 'drag') {
      // Delayed handling for drag to avoid false clicks
      console.log('🎯 DRAG branch - setting up 500ms timer')
      this.gestureStartTime = Date.now()
      this.pendingGesture = gesture

      this.gestureTimer = setTimeout(() => {
        if (this.pendingGesture && (Date.now() - this.gestureStartTime) > 500) {
          console.log('🎵 Confirmed DRAG after 500ms delay')
          this.processDragGesture(this.pendingGesture, sonicParams)
          this.pendingGesture = null
        }
      }, 500)
    } else {
      // Fallback to original logic
      console.log('🚯 ELSE branch - calling processGestureByAction for action:', gestureAction)
      this.processGestureByAction(gesture, sonicParams)
    }

    // Clear any pending gesture if we have a new definitive action
    if (this.pendingGesture) {
      this.pendingGesture = null
      if (this.gestureTimer) {
        clearTimeout(this.gestureTimer)
        this.gestureTimer = null
      }
    }
  }

  /**
   * Process click/tap gestures - single note
   */
  processClickGesture(gesture, sonicParams) {
    console.log('🎵 Processing TAP gesture - single note')
    console.log('🎵 TAP gesture ID:', gesture.id, 'call count:', (this.tapCallCount = (this.tapCallCount || 0) + 1))

    if (this.audioService && this.audioService.playThreeTierNote) {
      // Calculate frequency using BOTH X and Y for maximum variation
      // Y controls octave range, X controls frequency within octave
      const octaveBase = 110 + (1 - sonicParams.y) * 440 // 110-550Hz (A2 to C#5)
      const withinOctave = sonicParams.x * 660 // 0-660Hz variation within octave
      const frequency = octaveBase + withinOctave // 110Hz to 1210Hz total range

      const tier = sonicParams.x < 0.33 ? 'background' : sonicParams.x < 0.67 ? 'remote' : 'local'

      console.log(`🎵 Playing CLICK note: ${frequency.toFixed(1)}Hz (y=${sonicParams.y.toFixed(2)}, x=${sonicParams.x.toFixed(2)}), tier: ${tier}`)

      // Play single note directly - BYPASS three-tier system for TAP
      // This ensures our X/Y frequency calculation is respected
      console.log('🔍 TAP intensity check:', {
        gestureIntensity: gesture.intensity,
        sonicIntensity: sonicParams.intensity,
        positionX: sonicParams.x,
        positionY: sonicParams.y
      })
      const noteVolume = 0.5 // FIXED volume - remove intensity modulation from clicks
      const noteDuration = '8n' // Short duration for clicks

      // Direct synth access to bypass three-tier frequency mapping
      if (this.audioService.gestureSynth) {
        // Configure synth directly
        this.audioService.gestureSynth.set({
          oscillator: {
            type: tier === 'background' ? 'triangle' :
                   tier === 'remote' ? 'square' : 'sawtooth'
          },
          envelope: { attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.3 }
        })

        // Trigger note directly with our calculated frequency
        this.audioService.gestureSynth.triggerAttackRelease(
          frequency,
          noteDuration,
          Tone.now(),
          noteVolume
        )

        console.log(`🎵 DIRECT TAP note: ${frequency.toFixed(1)}Hz (y=${sonicParams.y.toFixed(2)}, x=${sonicParams.x.toFixed(2)}), tier: ${tier}`)
      }
    }
  }

  /**
   * Process drag gestures - musical phrase
   */
  processDragGesture(gesture, sonicParams) {
    console.log('🎵 Processing DRAG gesture - musical phrase')
    console.log('🎵 Drag details:', {
      velocity: gesture.velocity,
      dx: gesture.dx,
      dy: gesture.dy,
      position: gesture.coordinates
    })

    // CRITICAL FIX: Limit drag phrase generation to prevent polyphony overload
    const now = Date.now()
    if (this.lastDragPhraseTime && (now - this.lastDragPhraseTime) < 500) {
      console.log('🚫 Drag phrase throttled - too recent')
      return
    }
    this.lastDragPhraseTime = now

    // Drag should generate articulated phrases, NOT continuous sound
    if (this.audioService && this.audioService.gestureSynth) {
      // Create a short articulated phrase based on drag velocity
      const velocityCalc = Math.sqrt((gesture.dx || 0) ** 2 + (gesture.dy || 0) ** 2) * 10
      const velocity = gesture.velocity || velocityCalc || 100

      // Ensure velocity is a valid number
      const safeVelocity = typeof velocity === 'number' && !isNaN(velocity) ? velocity : 100
      const noteCount = Math.max(2, Math.min(5, Math.floor(safeVelocity / 25))) // 2-5 notes based on velocity

      console.log(`🎵 DRAG: velocity=${safeVelocity.toFixed(1)}, noteCount=${noteCount}, creating phrase`)

      // Calculate base frequency from position
      const baseFreq = 110 + (1 - sonicParams.y) * 440 // Y inverted for musical convention

      // Play phrase with rhythmic spacing
      for (let i = 0; i < noteCount; i++) {
        const delay = i * 180 + Math.random() * 60 // 180ms base + random variation

        setTimeout(() => {
          const noteFreq = baseFreq + (Math.random() - 0.5) * 200 // Larger frequency variation
          const tier = i % 2 === 0 ? 'local' : 'remote' // Simpler tier alternation
          const noteDuration = 0.15 + Math.random() * 0.25 // 150-400ms duration

          // Direct synth access for better control
          if (this.audioService.gestureSynth) {
            this.audioService.gestureSynth.triggerAttackRelease(
              noteFreq,
              noteDuration,
              Tone.now() + 0.01, // Slight future time for better timing
              0.3 + Math.random() * 0.4 // Velocity 0.3-0.7
            )

            console.log(`🎵 Note ${i+1}/${noteCount}: ${noteFreq.toFixed(1)}Hz, duration: ${(noteDuration*1000).toFixed(0)}ms`)
          }
        }, delay)
      }
    }
  }

  /**
   * Fallback gesture processing by action
   */
  processGestureByAction(gesture, sonicParams) {
    console.log('🚨 FALLBACK gesture processing for action:', sonicParams.action)
    console.log('🚨 This should not happen for tap/drag - check logic!')

    // Simple fallback - generate single note
    if (this.audioService && this.audioService.playThreeTierNote) {
      const frequency = 440 // Simple fallback frequency
      this.audioService.playThreeTierNote(frequency, 'local', 100, { volume: 0.5 })
    }
  }

  /**
   * Generate local musical phrase for drag gestures
   * FIX: Added local phrase generation for immediate feedback
   * @param {Object} gesture - Gesture data
   * @param {Object} sonicParams - Sonic parameters
   */
  generateLocalMusicalPhrase(gesture, sonicParams) {
    if (!this.audioService || !this.audioService.isInitialized) {
      console.log('🔇 AudioService not initialized for phrase generation')
      return
    }

    try {
      // Create musical phrase locally based on gesture characteristics
      const phrase = this.createLocalPhrase(gesture, sonicParams)

      console.log(`🎵 Generated local phrase with ${phrase.length} notes`)

      // Play each note in the phrase
      phrase.forEach((note, index) => {
        setTimeout(() => {
          try {
            const musicalEvent = {
              pitch: note.pitch,
              velocity: note.velocity,
              duration: note.duration,
              articulation: note.articulation,
              eventType: 'melodic'
            }

            this.audioService.playMusicalEvent(musicalEvent)
          } catch (e) {
            console.warn(`🔇 Error playing phrase note ${index}:`, e)
          }
        }, note.startTime * 1000) // Convert seconds to milliseconds
      })

    } catch (error) {
      console.error('🔇 Error generating local phrase:', error)
    }
  }

  /**
   * Create local musical phrase from gesture
   * @param {Object} gesture - Gesture data
   * @param {Object} sonicParams - Sonic parameters
   * @returns {Array} Musical phrase data
   */
  createLocalPhrase(gesture, sonicParams) {
    const phrase = []

    // Calculate gesture characteristics
    const gestureSpeed = this.calculateGestureSpeed(gesture)
    const gestureLength = this.calculateGestureLength(gesture)
    const pitchRange = this.calculatePitchRange(sonicParams)

    // Regular rhythm generation for better musical phrases
    let noteCount = 5 // FIX: Always 5 notes for consistent phrases
    let baseDuration

    if (gestureSpeed < 0.3) {
      // Slow gesture: longer notes
      baseDuration = 1.0 // 1 second base
    } else if (gestureSpeed < 0.7) {
      // Medium gesture: moderate notes
      baseDuration = 0.5 // 0.5 second base
    } else {
      // Fast gesture: shorter notes
      baseDuration = 0.25 // 0.25 second base
    }

    // Generate notes with regular rhythm patterns
    let currentTime = 0
    for (let i = 0; i < noteCount; i++) {
      // Create rhythmic variations based on note position
      let duration
      let articulation

      if (i === 0) {
        // First note: slightly longer for emphasis
        duration = baseDuration * 1.2
        articulation = 'accent'
      } else if (i === noteCount - 1) {
        // Last note: slightly longer for resolution
        duration = baseDuration * 1.1
        articulation = 'legato'
      } else if (i % 2 === 1) {
        // Odd positions: shorter for rhythmic interest
        duration = baseDuration * 0.8
        articulation = 'staccato'
      } else {
        // Even positions: base duration
        duration = baseDuration
        articulation = 'legato'
      }

      const pitch = this.calculateNoteFromGesture(sonicParams, i, noteCount, pitchRange)
      const velocity = 60 + Math.random() * 20 // 60-80 range (quieter than before)

      phrase.push({
        pitch,
        velocity,
        duration,
        articulation,
        startTime: currentTime
      })

      // FIX: Regular rhythmic spacing
      currentTime += duration * 0.9 // Notes overlap slightly for musical effect
    }

    return phrase
  }

  /**
   * Determine gesture action type from characteristics
   * @param {Object} gesture - Gesture data
   * @returns {string} Action type ('hover', 'drag', 'tap')
   */
  determineGestureAction(gesture) {
    // Use gesture characteristics to determine action type
    const duration = gesture.duration || 0
    const speed = gesture.speed || 0
    const intensity = gesture.intensity || 0.5
    const size = gesture.size || 0

    console.log('🔍 determineGestureAction inputs:', {
      duration: duration,
      speed: speed,
      intensity: intensity,
      size: size
    })

    // Click/tap = short, low speed gesture (more permissive thresholds)
    if (duration < 500 && speed <= 0.1) {
      console.log('🔍 Returning TAP - duration < 500 && speed <= 0.1')
      return 'tap'
    }

    // Quick, small gestures = hover (but only if intensity is very low)
    if (duration < 150 && size < 0.02 && intensity < 0.2) {
      console.log('🔍 Returning HOVER - duration < 150 && size < 0.02 && intensity < 0.2')
      return 'hover'
    }

    // Everything else = drag
    console.log('🔍 Returning DRAG - default case')
    return 'drag'
  }

  /**
   * Calculate gesture speed from movement data
   * @param {Object} gesture - Gesture data
   * @returns {number} Speed (0-1)
   */
  calculateGestureSpeed(gesture) {
    // Use actual speed from gesture if available
    return gesture.speed || Math.random() * 0.8 + 0.1
  }

  /**
   * Calculate gesture length/intensity
   * @param {Object} gesture - Gesture data
   * @returns {number} Length/intensity (0-1)
   */
  calculateGestureLength(gesture) {
    return gesture.intensity || 0.5
  }

  /**
   * Calculate pitch range from gesture position
   * @param {Object} sonicParams - Sonic parameters
   * @returns {Object} Pitch range
   */
  calculatePitchRange(sonicParams) {
    // Map Y position to pitch range (inverted: top = high notes)
    const normalizedY = 1 - (sonicParams.y || 0.5)
    return {
      min: 40 + normalizedY * 30,
      max: 60 + normalizedY * 40
    }
  }

  /**
   * Calculate note pitch from gesture position
   * @param {Object} sonicParams - Sonic parameters
   * @param {number} noteIndex - Note index in phrase
   * @param {number} totalNotes - Total notes in phrase
   * @param {Object} pitchRange - Pitch range
   * @returns {number} MIDI pitch
   */
  calculateNoteFromGesture(sonicParams, noteIndex, totalNotes, pitchRange) {
    const position = noteIndex / (totalNotes - 1 || 1)
    const pitch = pitchRange.min + (pitchRange.max - pitchRange.min) * position
    return Math.round(pitch)
  }

  /**
   * Select articulation based on gesture characteristics
   * @param {Object} gesture - Gesture data
   * @param {number} noteIndex - Note index
   * @param {number} totalNotes - Total notes
   * @returns {string} Articulation type
   */
  selectArticulationFromGesture(gesture, noteIndex, totalNotes) {
    // Use gesture intensity to determine articulation
    const intensity = gesture.intensity || 0.5

    if (noteIndex === 0) return 'accent' // First note accented
    if (noteIndex === totalNotes - 1) return 'legato' // Last note legato

    if (intensity > 0.7) {
      return Math.random() > 0.5 ? 'staccato' : 'accent'
    } else if (intensity < 0.3) {
      return 'legato'
    } else {
      return Math.random() > 0.6 ? 'staccato' : 'default'
    }
  }

  drawGestureTrail(gesture) {
    const { coordinates, intensity } = gesture
    const x = coordinates.x * window.innerWidth
    const y = coordinates.y * window.innerHeight

    // Create visual feedback
    this.ctx.save()

    // Set style based on intensity
    const alpha = Math.min(intensity, 1)
    const size = 5 + (intensity * 15)

    // Create gradient
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, size)
    gradient.addColorStop(0, `rgba(0, 212, 255, ${alpha})`)
    gradient.addColorStop(1, `rgba(0, 212, 255, 0)`)

    this.ctx.fillStyle = gradient
    this.ctx.beginPath()
    this.ctx.arc(x, y, size, 0, Math.PI * 2)
    this.ctx.fill()

    this.ctx.restore()
  }

  startRenderLoop() {
    const render = (timestamp) => {
      // Calculate FPS
      if (timestamp - this.lastFrameTime >= 1000) {
        this.fps = this.frameCount
        this.frameCount = 0
        this.lastFrameTime = timestamp
      }
      this.frameCount++

      // Only clear canvas with fade effect if there was a recent gesture (within 2 seconds)
      // This optimizes performance by avoiding unnecessary clearing when idle
      if (timestamp - this.lastGestureRenderTime < 2000) {
        this.ctx.save()
        this.ctx.globalCompositeOperation = 'source-over'
        this.ctx.fillStyle = 'rgba(26, 26, 46, 0.1)'
        this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
        this.ctx.restore()
      }

      requestAnimationFrame(render)
    }

    requestAnimationFrame(render)
  }

  updateRoomDisplay() {
    const userCountEl = document.getElementById('userCount')
    const roomIdEl = document.getElementById('roomId')

    if (userCountEl) {
      const userText = this.userCount === 1 ? 'user' : 'users'
      userCountEl.textContent = `👥 ${this.userCount} ${userText}`
    }

    if (roomIdEl && this.currentRoom) {
      const roomId = this.currentRoom.id || this.currentRoom.roomId
      roomIdEl.textContent = `Room: ${roomId}`
    }
  }

  showApp() {
    const loadingScreen = document.getElementById('loadingScreen')
    const appContent = document.getElementById('appContent')

    if (loadingScreen) {
      loadingScreen.style.display = 'none'
    }

    if (appContent) {
      appContent.classList.add('loaded')
    }
  }

  showError(message) {
    const errorDisplay = document.getElementById('errorDisplay')
    const errorMessage = document.getElementById('errorMessage')
    const loadingScreen = document.getElementById('loadingScreen')

    if (loadingScreen) {
      loadingScreen.style.display = 'none'
    }

    if (errorMessage) {
      errorMessage.textContent = message
    }

    if (errorDisplay) {
      errorDisplay.style.display = 'block'
    }
  }

  handleMuteChange(muted) {
    console.log(`🔇 handleMuteChange called with: ${muted}, audioService exists: ${!!this.audioService}`)
    if (this.audioService) {
      this.audioService.setMuted(muted)
      console.log(`🔇 Audio ${muted ? 'muted' : 'unmuted'}, audioService.muted is now: ${this.audioService.muted}`)
    }
  }

  /**
   * Update tremolo indicator on canvas
   * Shows visual feedback when tremolo is active in top 30% of canvas
   */
  updateTremoloIndicator(hoverData) {
    if (!this.canvas) return

    const position = hoverData?.position || { x: 0.5, y: 0.5 }
    const safeY = position?.y ?? 0.5

    // Check if in tremolo zone (top 30%)
    const isTremoloZone = safeY < 0.3
    const intensity = isTremoloZone ? (1 - safeY / 0.3) : 0

    // Create or update tremolo indicator
    let indicator = document.getElementById('tremoloIndicator')
    if (!indicator) {
      indicator = document.createElement('div')
      indicator.id = 'tremoloIndicator'
      indicator.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 30%;
        background: linear-gradient(to bottom,
          rgba(255, 0, 100, ${intensity * 0.3}),
          rgba(255, 0, 100, 0));
        border-bottom: 2px solid rgba(255, 0, 100, ${intensity * 0.8});
        pointer-events: none;
        z-index: 1000;
        transition: all 0.1s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 12px;
        font-weight: bold;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
      `
      this.canvas.parentElement.appendChild(indicator)
    }

    // Update indicator visibility and content
    if (isTremoloZone) {
      indicator.style.display = 'flex'
      indicator.style.opacity = intensity.toString()
      indicator.textContent = `🌊 TREMOLO ${Math.round(intensity * 100)}%`
      indicator.style.background = `linear-gradient(to bottom,
        rgba(255, 0, 100, ${intensity * 0.4}),
        rgba(255, 0, 100, 0))`
    } else {
      indicator.style.display = 'none'
    }
  }

  handleVolumeChange(volume) {
    console.log(`🔊 handleVolumeChange called with: ${volume}, audioService exists: ${!!this.audioService}`)
    if (this.audioService) {
      this.audioService.setVolume(volume / 100) // Convert 0-100 to 0-1
      console.log(`🔊 Volume set to ${volume}%, audioService.volume is now: ${this.audioService.volume}`)
    }
  }

  /**
   * Cleanup and destroy application
   * Prevents memory leaks by cleaning up all services
   */
  destroy() {
    console.log('🧹 Cleaning up Webarmonium app...')

    // Remove event listeners
    if (this.boundResizeHandler) {
      window.removeEventListener('resize', this.boundResizeHandler)
      this.boundResizeHandler = null
    }

    // Stop rendering loops
    if (this.cursorManager) {
      this.cursorManager.destroy()
    }

    if (this.drawingRenderer) {
      // DrawingRenderer doesn't have explicit destroy, but we can null it
      this.drawingRenderer = null
    }

    if (this.audioControls) {
      this.audioControls.destroy()
    }

    if (this.audioService) {
      this.audioService.cleanup()
    }

    // Disconnect socket
    if (this.socketService) {
      this.socketService.disconnect()
    }

    console.log('✅ Webarmonium cleanup complete')
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.webarmoniumApp = new WebarmoniumApp()
  })
} else {
  window.webarmoniumApp = new WebarmoniumApp()
}

// Cleanup on page unload to prevent memory leaks
window.addEventListener('beforeunload', () => {
  if (window.webarmoniumApp) {
    window.webarmoniumApp.destroy()
  }
})

// Make available globally for debugging
window.WebarmoniumApp = WebarmoniumApp

// Expose filter test method for debugging
window.testFilterModulation = () => {
  if (window.webarmoniumApp && window.webarmoniumApp.audioService) {
    window.webarmoniumApp.audioService.testFilterModulation()
  } else {
    console.warn('WebarmoniumApp or AudioService not available')
  }
}

console.log('🧪 Filter test method exposed: window.testFilterModulation()')