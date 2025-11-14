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

    // Sprint 2: Extracted components
    this.canvasManager = new CanvasManager()
    this.uiManager = new UIManager()

    // Sprint 4: GestureProcessor will be initialized in initializeServices()
    // (after audioService is available)
    this.gestureProcessor = null

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

    // Sprint 4: Gesture state moved to GestureProcessor

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
    // Sprint 2: Delegate to CanvasManager
    const canvasRefs = this.canvasManager.setup()

    // Store references for backward compatibility
    this.canvas = canvasRefs.canvas
    this.ctx = canvasRefs.ctx
    this.cursorOverlayCanvas = canvasRefs.cursorOverlayCanvas

    console.log('✅ Canvas setup delegated to CanvasManager')
  }

  // Sprint 2: resizeCanvas() removed - now handled by CanvasManager
  // Services register as resize listeners via canvasManager.addResizeListener()

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
        // DEBUG: Log what mapper receives
        console.log('🎵 MAPPER RECEIVED:', {
          hasCoordinates: !!gesture.coordinates,
          coordinates: gesture.coordinates,
          intensity: gesture.intensity,
          speed: gesture.speed
        })

        // Basic mapping: position to pitch, intensity to velocity
        const yValue = gesture.coordinates?.y || 0.5
        const pitch = 60 + Math.floor(yValue * 24) // C4 to C6 range
        const velocity = Math.floor((gesture.intensity || 0.5) * 127)
        const duration = 0.2 + (1 - (gesture.speed || 0.5)) * 0.8 // Speed affects duration

        console.log('🎵 MAPPER OUTPUT:', { yValue, pitch, velocity, duration })

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

    // Sprint 2: Register services as canvas resize listeners
    this.canvasManager.addResizeListener(this.drawingRenderer)
    this.canvasManager.addResizeListener(this.cursorManager)

    // Initialize audio controls
    const audioControlsContainer = document.getElementById('audio-controls')
    if (audioControlsContainer) {
      this.audioControls = new AudioControls(
        audioControlsContainer,
        (muted) => this.handleMuteChange(muted),
        (volume) => this.handleVolumeChange(volume)
      )
    }

    // Sprint 4: Initialize GestureProcessor with audioService and socketService
    this.gestureProcessor = new GestureProcessor(
      this.audioService,
      this.socketService,
      (gesture) => this.drawGestureTrail(gesture)
    )
    console.log('🎯 GestureProcessor initialized')

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

    // Setup drag streaming note callback for real-time feedback
    this.gestureCapture.setDragStreamingNoteCallback((noteData) => {
      if (!this.isAudioStarted || !this.audioService) {
        return
      }

      // CRITICAL: Use SAME pitch calculation as tap gestures for consistency
      // Calculate frequency using BOTH X and Y for maximum variation
      // Y controls octave range, X controls frequency within octave
      const x = noteData.position.x
      const y = noteData.position.y
      const octaveBase = 110 + (1 - y) * 440 // 110-550Hz (A2 to C#5)
      const withinOctave = x * 660 // 0-660Hz variation within octave
      const frequency = octaveBase + withinOctave // 110Hz to 1210Hz total range

      // CRITICAL FIX: Much shorter duration to avoid sustained overlap
      // Old: 0.2-0.6 seconds (too long, creates drone)
      // New: 0.05-0.15 seconds (percussive, clear articulation)
      const baseDuration = 0.1 // 100ms base
      const duration = baseDuration / (0.5 + noteData.velocity * 1.5) // 0.05-0.15 seconds

      // Play note directly with gestureSynth for consistent sound
      if (this.audioService.gestureSynth) {
        this.audioService.gestureSynth.triggerAttackRelease(
          frequency,
          duration,
          Tone.now(),
          0.4 + noteData.velocity * 0.2 // 0.4-0.6 volume
        )
      }

      console.log('🎸 Note #' + noteData.noteIndex + ':', {
        x: x.toFixed(2),
        y: y.toFixed(2),
        freq: frequency.toFixed(0) + 'Hz',
        dur: (duration * 1000).toFixed(0) + 'ms'
      })
    })

    // Setup gesture handling
    this.gestureCapture.onGesture = (gesture) => {
      this.lastGestureRenderTime = performance.now()
      console.log('🎯 Gesture callback triggered:', gesture)
      console.log('🔊 Audio state when gesture received - started:', this.isAudioStarted, 'service exists:', !!this.audioService)

      // Sprint 4: Delegate gesture action determination to GestureProcessor
      const gestureAction = this.gestureProcessor.determineGestureAction(gesture)
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
        willCalculate: this.gestureProcessor.determineGestureAction(gesture)
      })

      // CRITICAL FIX: Don't play automatic musical events for TAP and HOVER gestures
      // We want only our custom click logic for taps, and no auto-notes for hover
      // Sprint 4: Delegate to GestureProcessor
      const gestureAction = gesture.action || this.gestureProcessor.determineGestureAction(gesture)
      console.log('🔍 Final gesture action for end callback:', gestureAction)

      if (gestureAction === 'tap') {
        console.log('🚫 Skipping automatic musical event for TAP gesture')
        return
      }

      // Process drag gestures - check if timer is still pending
      if (gestureAction === 'drag') {
        console.log('🎵 DRAG gesture in onGestureEnd - checking timer status')

        // Sprint 4: Check GestureProcessor's pending gesture state
        // If timer is still pending, let it handle the phrase
        if (this.gestureProcessor.pendingGesture && this.gestureProcessor.pendingGesture.id === gesture.id) {
          console.log('🎵 DRAG timer will handle phrase - skipping musicalEvent')
          return
        }

        // If timer already fired or gesture is very quick, process immediately via GestureProcessor
        console.log('🎵 DRAG timer already fired - processing immediately')
        const sonicParams = {
          x: gesture.coordinates?.x || 0.5,
          y: gesture.coordinates?.y || 0.5,
          intensity: gesture.intensity || 0.5,
          timestamp: gesture.timestamp || Date.now(),
          action: 'drag',
          device: gesture.device || 'mouse'
        }
        // Sprint 4: Delegate to GestureProcessor
        this.gestureProcessor.processDragGesture(gesture, sonicParams)
        return
      }

      // Skip all other automatic musical events
      console.log('🚫 Skipping automatic musical event for non-drag gesture')
      return
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
      console.log('🏠 Joined room:', data.room.roomId)

      // CRITICAL FIX: Set room context in gesture capture so gestures include roomId
      // Without this, gestures have roomId: null and are never sent to backend
      if (this.gestureCapture && this.gestureCapture.setRoomContext) {
        this.gestureCapture.setRoomContext(data.room.roomId)
        console.log('🎯 Set gesture capture room context to:', data.room.roomId)
      }
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
      if (this.cursorManager) {
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

    // PHASE 5: Removed unused 'gesture-processed' listener (82 lines)
    // Backend never emits this event - it uses 'musical:event' instead
    // Logic for remote gestures now handled by 'musical:event' listener above

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
    // PHASE 4 FIX: Changed from 'musical-event' (dash) to 'musical:event' (colon) to match backend
    // PHASE 7 FIX: Extract actual event from wrapper (backend sends { event: {...} })
    this.socketService.on('musical:event', (musicalEventWrapper) => {
      if (this.isAudioStarted && musicalEventWrapper?.event) {
        const event = musicalEventWrapper.event

        // Minimal logging: only first note of phrase + critical info
        if (event.properties?.noteIndex === 0 || !event.properties?.noteIndex) {
          console.log(`🎵 Remote: ${event.properties?.gestureAction || 'unknown'} - freq=${event.properties?.frequency?.toFixed(0)}Hz, notes=${event.properties?.totalNotes || 1}`)
        }

        this.audioService.playMusicalEvent(event)
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
      // Determine backend URL based on environment
      // In production (tripitak.it), use the same origin (nginx proxy)
      // In development (localhost/127.0.0.1), use port 3001 directly
      const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
      const backendUrl = isDevelopment
        ? 'http://localhost:3001'
        : `${window.location.protocol}//${window.location.host}`

      console.log(`🔌 Connecting to backend at: ${backendUrl}`)
      await this.socketService.connect(backendUrl)

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

  // Sprint 4: Delegate to GestureProcessor
  handleGesture(gesture) {
    this.gestureProcessor.processGesture(gesture, this.isAudioStarted)
  }

  // Sprint 4: All gesture processing methods moved to GestureProcessor:
  // - processClickGesture()
  // - processDragGesture()
  // - processGestureByAction()
  // - generateLocalMusicalPhrase()
  // - createLocalPhrase()
  // - determineGestureAction()
  // - calculateGestureSpeed()
  // - calculateGestureLength()
  // - calculatePitchRange()
  // - calculateNoteFromGesture()
  // - selectArticulationFromGesture()

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

  // Sprint 2: UI methods delegated to UIManager
  updateRoomDisplay() {
    this.uiManager.updateRoomDisplay(this.currentRoom, this.userCount)
  }

  showApp() {
    this.uiManager.showApp()
  }

  showError(message) {
    this.uiManager.showError(message)
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

    // Sprint 2: Delegate cleanup to extracted components
    if (this.canvasManager) {
      this.canvasManager.destroy()
    }

    if (this.uiManager) {
      this.uiManager.destroy()
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