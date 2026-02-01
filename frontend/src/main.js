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

    // Pending drone composition (saved when audio not started yet)
    this.pendingDrone = null

    // Sprint 2: Extracted components
    this.canvasManager = new CanvasManager()
    this.uiManager = new UIManager()

    // Sprint 4: GestureProcessor will be initialized in initializeServices()
    // (after audioService is available)
    this.gestureProcessor = null

    // Entry #181: DragStreamingHandler for genre-aware melodic generation
    this.dragStreamingHandler = null

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

    // SUSTAINED HOLD: State tracking
    this.activeLocalHold = null  // { noteId, audioNoteId, frequency, startTime, position }
    this.activeRemoteHolds = new Map()  // noteId -> { noteId, audioNoteId, userId, frequency, startTime }
    this.pendingHoldNoteData = null  // { noteId, frequency, velocity, startTime } - for network sync when audio not ready

    // FIX: Track users who have left to prevent cursor race conditions
    // When user-left arrives, we add userId here. cursor-position events for these users are ignored.
    this.leftUsers = new Set()

    // Trail fade animation for gesture trails
    this._trailFadeFrameId = null
    this._trailFadeRate = 0.02  // Alpha reduction per frame (lower = slower fade)

    // FIX: Track if virtual users are currently active
    this.virtualUsersActive = false

    // SLEEP RECOVERY: Handler references for cleanup
    this._audioGestureRequiredHandler = null
    this._audioRecoveryClickHandler = null
    this._audioRecoveryTouchHandler = null

    // Initialize the application
    this.init()
  }

  async init() {
    try {
      // console.log('🎵 Initializing Webarmonium...')

      // Setup canvas
      this.setupCanvas()

      // Initialize services
      await this.initializeServices()

      // Setup event listeners
      this.setupEventListeners()

      // Hold indicator rendering REMOVED - SpringMeshNetwork handles hold visualization via node pulsing
      // this.startRenderLoop()  // DISABLED

      // Audio start REMOVED - must only start from explicit user click on Play button
      // this.attemptAutoStartAudio()  // DISABLED: violates audio-only-from-user-gesture principle

      // Hide loading screen FIRST
      this.showApp()

      // Entry #52: Initialize collapsible UI
      this.uiManager.initCollapsibleUI()

      // Initialize immersive mode
      this.immersiveManager = new ImmersiveManager(this)
      this.immersiveManager.initialize()

      // Entry #69: Initialize visual service BEFORE connecting to server
      // This ensures springMesh exists when virtual user events arrive
      // p5.js container is visible after showApp()
      const p5Container = document.getElementById('p5-container')
      if (p5Container && this.visualService) {
        this.visualService.initialize(p5Container)
        // Register visual service for resize notifications
        this.canvasManager.addResizeListener({
          setCanvasSize: (width, height) => {
            const dpr = window.devicePixelRatio || 1
            this.visualService.resize(width / dpr, height / dpr)
          }
        })

        // Hold indicator rendering REMOVED - SpringMeshNetwork handles hold visualization via node pulsing
      }

      // Entry #69: Connect to server AFTER visual service is initialized
      // This ensures springMesh exists when virtual user events arrive
      await this.connectToServer()

      // console.log('✅ Webarmonium initialized successfully')
    } catch (error) {
      // console.error('❌ Failed to initialize Webarmonium:', error)
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

    // Start trail fade animation loop
    this._startTrailFade()

    // console.log('✅ Canvas setup delegated to CanvasManager')
  }

  // Sprint 2: resizeCanvas() removed - now handled by CanvasManager
  // Services register as resize listeners via canvasManager.addResizeListener()

  async initializeServices() {
    // Initialize audio service with proper ordering
    if (window.AudioService) {
      // console.log('✅ AudioService class found, creating instance')
      this.audioService = new window.AudioService()
      window.AudioServicePromise = null // Clean up
    } else {
      // console.log('⚠️ AudioService not found, creating new instance')
      this.audioService = new AudioService()
    }

    // Initialize socket service using SocketService (which uses socket.io)
    // console.log('🔌 Initializing SocketService...')
    this.socketService = new SocketService()
    this.socketServicePromise = Promise.resolve(this.socketService.socket);

    // Connect AudioService to SocketService for slot lookup
    if (this.audioService && this.socketService) {
      this.audioService.setSocketService(this.socketService)
    }

    // Entry #181: Initialize DragStreamingHandler for genre-aware melodic generation
    if (window.DragStreamingHandler) {
      this.dragStreamingHandler = new window.DragStreamingHandler(this.audioService)
    }

    // Create basic gesture to music mapper for EnhancedGestureCapture
    const basicGestureToMusicMapper = {
      gestureToMusicalEvent: (gesture) => {
        // DEBUG: Log what mapper receives
        // console.log('🎵 MAPPER RECEIVED:', {
//          hasCoordinates: !!gesture.coordinates,
//          coordinates: gesture.coordinates,
//          intensity: gesture.intensity,
//          speed: gesture.speed
////        })

        // Basic mapping: position to pitch, intensity to velocity
        const yValue = gesture.coordinates?.y || 0.5
        const pitch = 60 + Math.floor(yValue * 24) // C4 to C6 range
        const velocity = Math.floor((gesture.intensity || 0.5) * 127)
        const duration = 0.2 + (1 - (gesture.speed || 0.5)) * 0.8 // Speed affects duration

        // console.log('🎵 MAPPER OUTPUT:', { yValue, pitch, velocity, duration })

        return {
          pitch,
          velocity,
          duration,
          articulation: gesture.speed > 0.7 ? 'staccato' : gesture.speed < 0.3 ? 'legato' : 'default',
          eventType: 'note'
        }
      },
      setTempo: (tempo) => {
        // console.log('🎛️ Gesture mapper tempo set to:', tempo)
      },
      setScale: (scale) => {
        // console.log('🎛️ Gesture mapper scale set to:', scale)
      }
    }

    // Initialize gesture capture with EnhancedGestureCapture for three-tier architecture
    // console.log('🎯 Initializing EnhancedGestureCapture with canvas:', this.canvas)
    this.gestureCapture = new EnhancedGestureCapture(this.canvas, basicGestureToMusicMapper, this.socketService)
    // console.log('🎯 EnhancedGestureCapture created:', this.gestureCapture)

    // Start EnhancedGestureCapture
    this.gestureCapture.start()
    // console.log('🎯 EnhancedGestureCapture started')

    // Initialize multi-user canvas services
    // DISABLED: DrawingRenderer replaced by p5.js generative graphics
    // this.drawingRenderer = new DrawingRenderer(this.canvas)
    this.cursorManager = new CursorManager(this.cursorOverlayCanvas)

    // Initialize generative visual service (p5.js) - BUT don't initialize yet!
    // Will be initialized AFTER showApp() so container has proper dimensions
    // console.log('🎨 Creating GenerativeVisualService instance...')
    this.visualService = new GenerativeVisualService()
    // NOTE: visualService.initialize(p5Container) will be called after showApp()

    // Sprint 2: Register services as canvas resize listeners
    // DISABLED: DrawingRenderer replaced by p5.js
    // this.canvasManager.addResizeListener(this.drawingRenderer)
    this.canvasManager.addResizeListener(this.cursorManager)
    if (this.visualService && this.visualService.p5Instance) {
      // Register visual service for resize notifications
      this.canvasManager.addResizeListener({
        setCanvasSize: (width, height) => {
          // Convert from device pixel ratio to logical pixels
          const dpr = window.devicePixelRatio || 1
          this.visualService.resize(width / dpr, height / dpr)
        }
      })
    }

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
    // console.log('🎯 GestureProcessor initialized')

    // NOTE: Cursor rendering is now handled by SpringMeshNetwork in p5.js
    // CursorManager is kept only for data tracking (positions, colors, virtual cursors)

    // Track gesture time for optimized canvas clearing
    this.lastGestureRenderTime = 0

    // Setup hover modulation for three-tier architecture
    // PERFORMANCE: Use rAF batching to defer audio updates
    this._pendingHoverUpdate = null
    this._hoverRafScheduled = false

    this.gestureCapture.setHoverModulationCallback((hoverData) => {
      // console.log('🎛️ Hover modulation callback triggered:', hoverData)

      // PERFORMANCE: Batch hover updates via requestAnimationFrame
      // Instead of calling audio directly on every hover event,
      // we queue the update and process it once per frame
      this._pendingHoverUpdate = hoverData

      if (!this._hoverRafScheduled) {
        this._hoverRafScheduled = true

        requestAnimationFrame(() => {
          this._hoverRafScheduled = false

          if (this._pendingHoverUpdate && this.isAudioStarted && this.audioService && this.audioService.handleHoverModulation) {
            this.audioService.handleHoverModulation(this._pendingHoverUpdate)
          }
          // Don't clear _pendingHoverUpdate - keep latest for next frame if needed
        })
      }
    })

    // Setup drag streaming note callback for real-time feedback
    // CRITICAL: Return note data for backend broadcast
    this.gestureCapture.setDragStreamingNoteCallback((noteData) => {
      if (!this.isAudioStarted || !this.audioService) {
        return null // No note played
      }

      const x = noteData.position.x
      const y = noteData.position.y

      // Entry #181: Use DragStreamingHandler for genre-aware melodic generation
      // Falls back to basic calculation if handler not available
      let frequency, midiNote, duration, envelope

      if (this.dragStreamingHandler) {
        // Genre-aware calculation via DragStreamingHandler
        const scale = this.cachedScale || window.MusicalScales.getScale('pentatonic')
        const calculated = this.dragStreamingHandler.calculateMelodicNote(noteData, scale)
        frequency = calculated.frequency
        midiNote = calculated.midiNote
        duration = calculated.duration
        envelope = calculated.envelope
      } else {
        // Fallback: Basic calculation without genre awareness
        const scale = this.cachedScale || window.MusicalScales.getScale('pentatonic')
        const baseOctave = window.MusicalConstants.getBaseOctaveFromY(y)

        // Simple scale index calculation
        const xIndex = Math.floor(x * scale.length)
        const scaleNote = scale[xIndex % scale.length]
        midiNote = 60 + (baseOctave - 4) * 12 + scaleNote
        frequency = 440 * Math.pow(2, (midiNote - 69) / 12)

        // Duration from noteData
        const durationMap = { '32n': 0.0625, '16n': 0.125, '8n': 0.25, '4n': 0.5 }
        duration = durationMap[noteData.duration] || 0.25

        // Basic envelope
        envelope = { attack: 0.005, decay: 0.02, sustain: 0.1, release: 0.05 }
      }

      // FIX: Use per-user synth via playMusicalEvent instead of gestureSynth directly
      // This ensures consistent timbre between sustained hold start and drag streaming
      const localUserId = this.socketService?.getUserId?.() || this.socketService?.socket?.id || null
      const eventVelocity = 0.8 + noteData.velocity * 0.2 // 0.8-1.0 range

      // Create musical event with userId for per-user synth routing
      const musicalEvent = {
        pitch: midiNote,
        velocity: eventVelocity * 100, // Convert to 0-100 range
        duration: duration,
        articulation: noteData.articulation,
        eventType: 'melodic',
        userId: localUserId,
        properties: {
          frequency: frequency,
          duration: duration,
          velocity: eventVelocity * 100,
          articulation: noteData.articulation,
          noteIndex: noteData.noteIndex,
          totalNotes: noteData.totalNotes || 1,
          gestureAction: 'drag-streaming'
        }
      }

      // console.log('🎵🎵 PLAYING LOCAL NOTE via playMusicalEvent:', {
      //   frequency: frequency.toFixed(1),
      //   userId: localUserId?.substring(0, 8),
      //   articulation: noteData.articulation
      // })

      // Entry #175b fix: Pass current style for genre-aware local playback
      const style = this.audioService.currentStyle || null
      this.audioService.playMusicalEvent(musicalEvent, style)

      // VISUAL P&P DURING DRAG: Emit particles/pulses periodically during drag
      // Throttled to 400ms (2.5 p&p/sec) for uniform visual feedback
      const visualNow = Date.now()
      const DRAG_VISUAL_INTERVAL = 400  // ms between visual emissions

      if (!this._lastDragVisualEmit || (visualNow - this._lastDragVisualEmit) >= DRAG_VISUAL_INTERVAL) {
        this._lastDragVisualEmit = visualNow

        if (this.visualService && this.socketService?.socket) {
          const userId = this.socketService.socket.id
          const color = this.currentUserColor || '#22c55e'
          this.visualService.updateCursorPosition(userId, x, y, color)
          this.visualService.updateGestureData(userId, {
            type: 'drag',
            velocity: noteData.velocity,
            isActive: true
          })
        }
      }

      // REAL-TIME STREAMING: Emit note to backend for remote users
      // Throttle: ~20 notes/second max (50ms minimum interval)
      const streamNow = Date.now()
      const MIN_STREAM_INTERVAL = 50

      if (!this._lastNoteStreamTime || (streamNow - this._lastNoteStreamTime) >= MIN_STREAM_INTERVAL) {
        this._lastNoteStreamTime = streamNow

        if (this.socketService?.socket && this.socketService.currentRoom) {
          this.socketService.socket.emit('note:stream', {
            frequency: frequency,
            duration: noteData.duration,
            articulation: noteData.articulation,
            position: { x, y },
            velocity: noteData.velocity,
            noteIndex: noteData.noteIndex,
            timestamp: streamNow
          })
        }
      }

      // CRITICAL: Return note data for collection in streamedNotes array
      return {
        frequency: frequency,
        duration: noteData.duration, // Keep Tone.js notation for backend
        articulation: noteData.articulation,
        position: { x, y },
        velocity: noteData.velocity,
        timestamp: Date.now() // When this note was played
      }
    })

    // SUSTAINED HOLD: Setup sustained hold callbacks for gate-based audio
    this.gestureCapture.onSustainedHoldStart = (holdData) => {
      // console.log('🎵 Sustained hold start callback:', holdData)

      // Calculate frequency from position (reuse existing logic from drag streaming)
      // CRITICAL: Calculate this regardless of audio state for network sync
      const x = holdData.position.x
      const y = holdData.position.y

      // Use same pitch calculation as drag gestures for consistency
      // PERFORMANCE: Use cached scale instead of looking up on every note
      const scale = this.cachedScale || window.MusicalScales.getScale('pentatonic')
      const baseOctave = window.MusicalConstants.getBaseOctaveFromY(y)

      // Map X position to scale degree
      const scaleIndex = Math.floor(x * scale.length)
      const scaleNote = scale[scaleIndex % scale.length]
      const octaveOffset = Math.floor(scaleIndex / scale.length)
      const midiNote = 60 + (baseOctave - 4) * 12 + scaleNote + octaveOffset * 12

      // Convert MIDI to frequency
      const frequency = 440 * Math.pow(2, (midiNote - 69) / 12)

      // Velocity based on Y position (higher = louder)
      const velocity = 0.6 + (1 - y) * 0.4 // 0.6-1.0 range

      // EMIT TO NETWORK: Always emit hold:start for remote sync, even if local audio not ready
      if (this.socketService && this.socketService.socket) {
        const emitData = {
          noteId: holdData.noteId,
          userId: this.socketService.socket.id,
          roomId: this.socketService.currentRoom?.roomId,
          position: holdData.position,
          frequency: frequency,
          velocity: velocity,
          timestamp: Date.now()
        }
        // console.log('📤 EMITTING hold:start to backend:', {
//          noteId: emitData.noteId,
//          userId: emitData.userId?.substring(0, 8),
//          roomId: emitData.roomId,
//          frequency: emitData.frequency.toFixed(1) + 'Hz',
//          velocity: emitData.velocity.toFixed(2)
////        })
        this.socketService.socket.emit('hold:start', emitData, (response) => {
          if (response && response.success) {
            // console.log(`✅ hold:start acknowledged by backend: ${response.latency}ms latency`)
          } else {
            // console.error('❌ hold:start failed:', response?.error)
          }
        })
        // console.log('✅ hold:start emit called successfully')
      } else {
        // console.error('❌ Cannot emit hold:start - socketService or socket not available', {
//          hasSocketService: !!this.socketService,
//          hasSocket: !!(this.socketService?.socket)
////        })
      }

      // Entry #28: Register activity for drone void detection
      if (this.audioService) {
        this.audioService.registerDroneActivity()
        this.audioService.registerDroneNoteStart(holdData.noteId)
      }

      // Store hold note data for network emission in onSustainedHoldEnd
      // CRITICAL: This must be set regardless of audio state for proper network sync
      this.pendingHoldNoteData = {
        noteId: holdData.noteId,
        frequency: frequency,
        velocity: velocity,
        startTime: Date.now()
      }

      // LOCAL AUDIO: Only play locally if audio is ready
      if (!this.isAudioStarted || !this.audioService) {
        // console.warn('⚠️ Audio not ready for local playback - hold:start still sent to network')
        return
      }

      // Trigger note attack (gate opens) - include local userId for per-user synth routing
      // FIX: Use backend-assigned userId, NOT socket.id (they are different!)
      const localUserId = this.socketService?.getUserId?.() || this.socketService?.socket?.id || null
      const result = this.audioService.triggerSustainedNoteAttack(frequency, velocity, holdData.position, localUserId, false)

      if (result) {
        // Store note data for updates and cleanup
        this.activeLocalHold = {
          noteId: holdData.noteId,
          audioNoteId: result.noteId, // AudioService's internal note ID
          frequency: frequency,
          startTime: result.startTime,
          position: holdData.position,
          visualStartTime: Date.now() // For pulsing circle animation
        }

        // console.log(`✅ Sustained hold started: ${frequency.toFixed(1)}Hz`)

        // Update visual service with hold gesture
        if (this.visualService && this.socketService && this.socketService.socket) {
          const userId = this.socketService.socket.id
          if (!userId) return // Skip if socket not ready (prevents ghost "local" cursor)
          const color = this.currentUserColor || '#22c55e'

          this.visualService.updateCursorPosition(userId, holdData.position.x, holdData.position.y, color)
          this.visualService.updateGestureData(userId, {
            type: 'hold',
            velocity: 0,
            holdStart: Date.now(),
            isActive: true
          })
        }
      }
    }

    this.gestureCapture.onSustainedHoldEnd = (endData) => {
      // console.log('🎵 Sustained hold end callback:', endData)

      // EMIT TO NETWORK: Always emit hold:end for remote sync
      // Use pendingHoldNoteData (set in onSustainedHoldStart) for network emission
      if (this.socketService && this.socketService.socket && this.pendingHoldNoteData) {
        const holdNoteId = this.pendingHoldNoteData.noteId
        this.socketService.socket.emit('hold:end', {
          noteId: holdNoteId,
          userId: this.socketService.socket.id,
          roomId: this.socketService.currentRoom?.roomId,
          duration: endData.duration,
          finalPosition: endData.finalPosition,
          timestamp: Date.now()
        }, (response) => {
          if (response && response.success) {
            // console.log(`✅ Hold end acknowledged: ${endData.duration}ms hold, ${response.latency}ms latency`)
          } else {
            // console.error('❌ Hold end failed:', response?.error)
          }
        })
      } else {
        // console.warn('⚠️ Cannot emit hold:end - missing socket or pendingHoldNoteData', {
//          hasSocketService: !!this.socketService,
//          hasSocket: !!(this.socketService?.socket),
//          hasPendingHoldData: !!this.pendingHoldNoteData
////        })
      }

      // Entry #28: Register note end for drone void detection
      if (this.audioService && this.pendingHoldNoteData?.noteId) {
        this.audioService.registerDroneNoteEnd(this.pendingHoldNoteData.noteId)
      }

      // LOCAL AUDIO: Only release local audio if it was started
      if (this.isAudioStarted && this.audioService && this.activeLocalHold) {
        // Trigger note release (gate closes)
        this.audioService.triggerSustainedNoteRelease(this.activeLocalHold.audioNoteId)
        // console.log(`✅ Local sustained hold ended: ${endData.duration}ms, reason: ${endData.reason}`)
      } else {
        // console.log(`📡 Network-only hold ended: ${endData.duration}ms, reason: ${endData.reason}`)
      }

      // Update visual service with hold end
      if (this.visualService && this.socketService && this.socketService.socket) {
        const userId = this.socketService.socket.id
        if (!userId) return // Skip if socket not ready (prevents ghost "local" cursor)

        this.visualService.updateGestureData(userId, {
          type: 'idle',
          velocity: 0,
          isActive: false
        })
      }

      // Clear tracking
      this.activeLocalHold = null
      this.pendingHoldNoteData = null
    }

    // Setup gesture handling
    this.gestureCapture.onGesture = (gesture) => {
      this.lastGestureRenderTime = performance.now()
      // console.log('🎯 Gesture callback triggered:', gesture)
      // console.log('🔊 Audio state when gesture received - started:', this.isAudioStarted, 'service exists:', !!this.audioService)

      // Track local cursor position for gradient metrics
      const pos = gesture.coordinates || gesture.currentPosition || gesture.startPosition
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        this._localCursorPosition = { x: pos.x, y: pos.y }
        this._updateGradientMetricsFromCursors()
      }

      // Sprint 4: Delegate gesture action determination to GestureProcessor
      const gestureAction = this.gestureProcessor.determineGestureAction(gesture)
      const enhancedGesture = { ...gesture, action: gestureAction }

      // console.log('🎯 Enhanced gesture action:', gestureAction, 'will call handleGesture')
      this.handleGesture(enhancedGesture)
    }

    // Setup gesture start/end for proper three-tier handling
    this.gestureCapture.onGestureStart = (gesture) => {
      // console.log('👆 Gesture start callback:', gesture.id)
      // Handle initial gesture filtering
      if (this.audioService && this.audioService.updateFilterParams) {
        // Apply initial filter based on gesture start position
        const position = gesture.coordinates || gesture.startPosition || { x: 0.5, y: 0.5 }
        this.audioService.updateFilterParams({
          frequency: 200 + (position.y * 2000),
          resonance: 0.5 + (position.x * 3)
        })
      }

      // Update visual service with local gesture start
      if (this.visualService && this.socketService && this.socketService.socket) {
        const userId = this.socketService.socket.id
        if (!userId) return // Skip if socket not ready (prevents ghost "local" cursor)
        const position = gesture.coordinates || gesture.startPosition || { x: 0.5, y: 0.5 }
        const color = this.currentUserColor || '#22c55e' // Default green for local user

        this.visualService.updateCursorPosition(userId, position.x, position.y, color)
        this.visualService.updateGestureData(userId, {
          type: 'drag', // Will be determined by gesture processing
          velocity: gesture.speed || 0,
          isActive: true
        })
      }
    }

    this.gestureCapture.onGestureEnd = (gesture, musicalEvent) => {
      // console.log('👋 Gesture end callback:', gesture.id, musicalEvent)
      // console.log('🔍 Gesture end details:', {
//        gestureAction: gesture.action,
//        willCalculate: this.gestureProcessor.determineGestureAction(gesture)
////      })

      // CRITICAL FIX: Don't play automatic musical events for TAP and HOVER gestures
      // We want only our custom click logic for taps, and no auto-notes for hover
      // Sprint 4: Delegate to GestureProcessor
      const gestureAction = gesture.action || this.gestureProcessor.determineGestureAction(gesture)
      // console.log('🔍 Final gesture action for end callback:', gestureAction)

      // REMOTE FIX: TAP gestures MUST send musical events for remote users
      // Don't skip - let it fall through to emit musical:event to backend
      if (gestureAction === 'tap') {
        // console.log('🎯 TAP gesture - sending musical event for remote sync')
        // Continue to musical event emission below
      }

      // Process drag gestures - SKIP: already handled by onGesture → processGesture
      // The phrase was already generated and played during the drag gesture
      // Calling processDragGesture again here would create a duplicate "slow arpeggio"
      if (gestureAction === 'drag') {
        // Entry #99: Trigger attractor morph when local user completes a drag (phrase)
        if (this.visualService && this.visualService.onMusicalEvent) {
          this.visualService.onMusicalEvent({
            type: 'phrase',
            velocity: gesture.velocity || 0.5
          })
        }
        return
      }

      // Skip all other automatic musical events
      // console.log('🚫 Skipping automatic musical event for non-drag gesture')

      // Update visual service with local gesture end
      if (this.visualService && this.socketService && this.socketService.socket) {
        const userId = this.socketService.socket.id
        if (!userId) return // Skip if socket not ready (prevents ghost "local" cursor)
        const position = gesture.coordinates || gesture.endPosition || { x: 0.5, y: 0.5 }

        this.visualService.updateGestureData(userId, {
          type: gestureAction || 'idle',
          velocity: 0,
          isActive: false
        })
      }

      return
    }

    // console.log('🎯 All gesture callbacks set up including hover modulation')
  }

  setupEventListeners() {
    // Audio toggle button
    const audioToggle = document.getElementById('audioToggle')
    audioToggle.addEventListener('click', () => this.toggleAudio())

    // SLEEP RECOVERY: Listen for tap-to-resume event (state machine approach)
    // This event is dispatched when audio needs user tap to resume (visibility/focus change)
    this._audioTapToResumeHandler = (event) => {
      if (this.isAudioStarted) {
        this._showAudioRecoveryPrompt()
        this._attachRecoveryClickHandlers()
      }
    }
    window.addEventListener('audio:tap-to-resume', this._audioTapToResumeHandler)

    // Entry #SynthUI: Listen for synth-generated cursor movements
    // Updates local cursor position for visual feedback during Generate Gestures
    window.addEventListener('synth:cursor-move', (event) => {
      const { x, y } = event.detail
      this._localCursorPosition = { x, y }
      this._updateGradientMetricsFromCursors()
    })

    // iOS Safari: Setup proactive check on any interaction (fallback for event failures)
    this._setupProactiveRecoveryCheck()

    // Canvas drawing interaction
    this.setupDrawingEvents()

    // Socket event listeners
    this.socketService.on('room-joined', (data) => {
      this.currentRoom = data.room
      this.updateRoomDisplay()
      // console.log('🏠 Joined room:', data.room.roomId)

      // FIX: Clear leftUsers set when joining a new room (prevents memory leak)
      // Previous room's userIds are no longer relevant
      this.leftUsers.clear()
      this.virtualUsersActive = false

      // CRITICAL FIX: Set room context in gesture capture so gestures include roomId
      // Without this, gestures have roomId: null and are never sent to backend
      if (this.gestureCapture && this.gestureCapture.setRoomContext) {
        this.gestureCapture.setRoomContext(data.room.roomId)
        // console.log('🎯 Set gesture capture room context to:', data.room.roomId)
      }

      // Note: setSocketService already called at init time (line 131)
    })

    this.socketService.on('user-joined', (data) => {
      this.userCount = data.userCount
      this.updateRoomDisplay()
      // console.log('👤 User joined, total users:', this.userCount)

      // FIX: Remove from leftUsers set if user rejoins (new session with same ID unlikely but safe)
      if (data.user?.id) {
        this.leftUsers.delete(data.user.id)
      }
    })

    this.socketService.on('user-left', (data) => {
      this.userCount = data.userCount
      this.updateRoomDisplay()
      // console.log('👋 User left, total users:', this.userCount)

      // FIX: Add to leftUsers set BEFORE removing cursor to prevent race condition
      // Late cursor-position events for this user will be ignored
      if (data.userId) {
        this.leftUsers.add(data.userId)
      }

      // Remove user's cursor
      if (data.userId && this.cursorManager) {
        this.cursorManager.removeCursor(data.userId)
      }
      if (data.userId && this.visualService) {
        this.visualService.removeUser(data.userId)
      }
    })

    // FIX: Handle user-disconnected for unexpected disconnects (e.g., browser close)
    this.socketService.on('user-disconnected', (data) => {
      // console.log('🔌 User disconnected unexpectedly:', data.userId)

      // FIX: Add to leftUsers set BEFORE removing cursor
      if (data.userId) {
        this.leftUsers.add(data.userId)
      }

      // Remove user's cursor from visualization
      if (data.userId && this.cursorManager) {
        this.cursorManager.removeCursor(data.userId)
      }
      if (data.userId && this.visualService) {
        this.visualService.removeUser(data.userId)
      }
    })

    // SUSTAINED HOLD: Handle remote user hold:start events
    this.socketService.on('hold:start', (data) => {
      // Only process if audio is started AND this is a remote hold
      if (!this.isAudioStarted) {
        return
      }

      if (!data.isRemote) {
        return
      }

      // Entry #28: Register activity for drone void detection (remote users/virtual users)
      if (this.audioService) {
        this.audioService.registerDroneActivity()
        this.audioService.registerDroneNoteStart(data.noteId)
      }

      // VIRTUAL USERS: Use triggerAttackRelease with duration (like landing page)
      // Entry #186b: Use safe trigger methods to avoid "Start time must be strictly greater" errors
      if (data.isVirtual) {
        const noteDuration = data.duration || 0.5
        const velocity = data.velocity * 0.6 // Quieter for virtual users

        // Try to use UserSynthManager's safe triggerAttackRelease
        if (data.userId && this.audioService?.userSynthManager) {
          const synthData = this.audioService.userSynthManager.getSynthForUser(data.userId)
          if (synthData && synthData.synth && !synthData.synth.disposed) {
            // Use UserSynthManager.triggerAttackRelease which has timing protection
            this.audioService.userSynthManager.triggerAttackRelease(
              data.userId,
              data.frequency,
              noteDuration,
              velocity,
              true  // isRemote = true for virtual users
            )
          } else if (this.audioService?.gestureSynth) {
            // Fallback to safe gestureSynth trigger
            this.audioService.safeGestureSynthTrigger(data.frequency, noteDuration, undefined, velocity)
          }
        } else if (this.audioService?.gestureSynth) {
          // Fallback to safe gestureSynth trigger
          this.audioService.safeGestureSynthTrigger(data.frequency, noteDuration, undefined, velocity)
        }

        // VISUAL: Update cursor position, but skip p&p if suppressVisual is set
        // When suppressVisual is true, p&p are handled by virtual:phrase-visual event
        if (this.visualService) {
          const color = data.userColor || '#fb923c'
          this.visualService.updateCursorPosition(data.userId, data.position.x, data.position.y, color)

          // Only trigger particles/pulses if NOT suppressed
          if (!data.suppressVisual) {
            this.visualService.updateGestureData(data.userId, {
              type: 'hold',
              velocity: data.velocity || 0.7,
              holdStart: Date.now(),
              isActive: true
            })
          }
        }

        return // Don't use sustained note mechanism for virtual users
      }

      // REAL REMOTE USERS: Use sustained note mechanism (gate open/close)
      // Include userId for per-user synth routing, isRemote=true for volume reduction
      const result = this.audioService.triggerSustainedNoteAttack(
        data.frequency,
        data.velocity,  // Pass full velocity - AudioService applies remote reduction
        data.position,
        data.userId,    // User ID for per-user synth routing
        true            // isRemote = true
      )

      if (result) {
        // Track remote hold for cleanup and visual feedback
        this.activeRemoteHolds.set(data.noteId, {
          noteId: data.noteId,
          audioNoteId: result.noteId,
          userId: data.userId,
          frequency: data.frequency,
          startTime: result.startTime,
          position: data.position,
          userColor: data.userColor || '#fb923c',
          visualStartTime: Date.now()
        })

        // Update visual service with remote hold gesture
        if (this.visualService) {
          const color = data.userColor || '#fb923c'
          this.visualService.updateCursorPosition(data.userId, data.position.x, data.position.y, color)
          this.visualService.updateGestureData(data.userId, {
            type: 'hold',
            velocity: 0,
            holdStart: Date.now(),
            isActive: true
          })
        }
      }
    })

    // SUSTAINED HOLD: Handle remote user hold:end events
    this.socketService.on('hold:end', (data) => {
      // Entry #28: Register note end for drone void detection (remote users/virtual users)
      if (this.audioService && data.noteId) {
        this.audioService.registerDroneNoteEnd(data.noteId)
      }

      // VIRTUAL USERS: Just update visual state (audio handled by triggerAttackRelease)
      if (data.isVirtual) {
        if (this.visualService) {
          this.visualService.updateGestureData(data.userId, {
            type: 'idle',
            velocity: 0,
            isActive: false
          })
        }

        // Entry #81: Draw trail halo for virtual user hold:end
        // CRITICAL FIX #1: Validate incoming socket data before rendering
        if (data.position && data.userColor &&
            typeof data.position.x === 'number' && typeof data.position.y === 'number' &&
            isFinite(data.position.x) && isFinite(data.position.y)) {
          // MEDIUM FIX #8: Use centralized intensity calculation
          const intensity = this._calculateTrailIntensityFromDuration(data.duration)
          const sanitizedColor = this._sanitizeColor(data.userColor) || '#2dd4bf'
          this._renderTrailHalo(data.position.x, data.position.y, intensity, sanitizedColor)
        }
        return
      }

      // REAL REMOTE USERS: Use sustained note mechanism
      if (!this.activeRemoteHolds) {
        return
      }

      const remoteHold = this.activeRemoteHolds.get(data.noteId)
      if (!remoteHold) {
        // console.warn(`⚠️ Received hold:end for unknown note: ${data.noteId}`)
        return
      }

      // Release remote note
      if (this.audioService) {
        this.audioService.triggerSustainedNoteRelease(remoteHold.audioNoteId)
      }

      // Update visual service with remote hold end
      if (this.visualService) {
        this.visualService.updateGestureData(data.userId, {
          type: 'idle',
          velocity: 0,
          isActive: false
        })
      }

      // Remove from tracking
      this.activeRemoteHolds.delete(data.noteId)

      // console.log(`🌐 Remote hold end: user ${data.userId.substring(0, 8)}, ${data.duration}ms hold${data.reason ? ' (' + data.reason + ')' : ''}`)
    })

    // VIRTUAL PHRASE VISUAL: Consolidated p&p emission for virtual user phrases
    // This replaces multiple individual hold:start visual triggers with a single emission
    // Entry #69: Bypass updateGestureData throttle - consolidation already limits rate
    this.socketService.on('virtual:phrase-visual', (data) => {
      // HIGH FIX #4: Removed debug console.log statements
      if (!this.visualService) {
        return
      }

      // SECURITY: Validate incoming socket data structure
      if (!data || typeof data !== 'object') return
      if (!data.userId || typeof data.userId !== 'string') return
      if (!data.position || typeof data.position.x !== 'number' || typeof data.position.y !== 'number') return

      const color = this._sanitizeColor(data.userColor) || '#fb923c'
      this.visualService.updateCursorPosition(data.userId, data.position.x, data.position.y, color)

      // Scale particle count by note count (capped at 4)
      const noteCount = typeof data.noteCount === 'number' ? data.noteCount : 1
      const velocity = typeof data.velocity === 'number' && isFinite(data.velocity) ? data.velocity : 0.7

      // BYPASS THROTTLE: Directly emit P&P to subsystems (like landing page)
      // The consolidation from backend already limits emission rate
      if (this.visualService.wavePackets) {
        this.visualService.wavePackets.emitPulse(data.userId, color)
      }

      if (this.visualService.particles) {
        // Scale particle count: 3-8 based on note count and velocity
        const baseCount = Math.min(noteCount, 4) + Math.round(velocity * 4)
        const particleCount = Math.max(3, Math.min(8, baseCount))
        this.visualService.particles.emitParticles(data.userId, particleCount)
      }
    })

    // console.log('✅ Sustained hold event listeners registered')

    // Compositional parameters from collective metrics
    // PERFORMANCE: Cache scale array to avoid lookup on every drag note
    this.compositionalParameters = null
    this.cachedScale = null  // Cached scale array for performance
    this.cachedScaleType = null  // Track which scale type is cached

    this.socketService.on('compositional-parameters', (data) => {
      this.compositionalParameters = data.parameters

      // Entry #HarmonicCoherence: Use full mode from backend, map to MusicalScales keys
      const newMode = data.parameters?.mode || data.parameters?.scaleType || 'pentatonic'
      const modeToScaleMap = {
        'ionian': 'major',
        'aeolian': 'minor',
        'dorian': 'dorian',
        'phrygian': 'phrygian',
        'lydian': 'lydian',
        'mixolydian': 'mixolydian',
        'locrian': 'locrian',
        'major': 'major',
        'minor': 'minor',
        'pentatonic': 'pentatonic',
        // Extended modes from backend HarmonicEngine
        'harmonicMinor': 'harmonicMinor',
        'melodicMinor': 'melodicMinor',
        'majorPentatonic': 'pentatonic',
        'minorPentatonic': 'minorPentatonic',
        'blues': 'blues',
        'wholeTone': 'wholeTone',
        'diminished': 'diminished'
      }

      const scaleType = modeToScaleMap[newMode] || 'pentatonic'
      if (this.cachedScaleType !== scaleType) {
        this.cachedScale = window.MusicalScales.getScale(scaleType)
        this.cachedScaleType = scaleType
      }

      // Entry #HarmonicCoherence: Update AudioService harmonic context for remote frequency quantization
      if (this.audioService && this.audioService.updateHarmonicContext) {
        this.audioService.updateHarmonicContext(data.parameters)
      }

      // Update AudioService with new parameters for background generation
      if (this.audioService && this.audioService.updateCompositionalParameters) {
        this.audioService.updateCompositionalParameters(this.compositionalParameters)
      }

      // Entry #130: Update GestureProcessor with new parameters for TAP and DRAG phrases
      if (this.gestureProcessor && this.gestureProcessor.updateCompositionalParameters) {
        this.gestureProcessor.updateCompositionalParameters(this.compositionalParameters)
      }

      // Forward interaction metrics to visual service for spatial gradient
      if (this.visualService && data.parameters) {
        const metrics = {
          userCount: data.parameters.activeUsers || data.parameters.harmonicDensity || 1,
          spatialDensity: data.parameters.rhythmicDensity || 0,
          dominantZone: data.parameters.dominantZone || { x: 0.5, y: 0.5 }
        }
        this.visualService.updateInteractionMetrics(metrics)
      }
    })

    // Entry #SynthUI: Handle remote synth parameter updates
    this.socketService.on('synth:params', (data) => {
      // Apply remote user's synth params to their audio representation
      if (data.userId && this.audioService && this.audioService.applyRemoteSynthParams) {
        this.audioService.applyRemoteSynthParams(data.userId, data.params, data.presetSlot)
      }
    })

    // Entry #SynthUI: Handle late joiner synth sync (existing users' synth params)
    this.socketService.on('synth:apply-remote', (data) => {
      if (data.userId && this.audioService && this.audioService.applyRemoteSynthParams) {
        this.audioService.applyRemoteSynthParams(data.userId, data.params, data.presetSlot)
      }
    })

    this.socketService.on('cursor-position', (data) => {
      // FIX: Ignore cursor updates for users who have left (race condition prevention)
      if (this.leftUsers.has(data.userId)) {
        return
      }

      if (this.cursorManager) {
        this.cursorManager.updateCursor(
          data.userId,
          data.x,
          data.y,
          data.color,
          data.isDrawing
        )
      } else {
        // console.error('❌ CursorManager not initialized!')
      }

      // Update visual service with cursor position
      if (this.visualService) {
        this.visualService.updateCursorPosition(
          data.userId,
          data.x,
          data.y,
          data.color
        )
      }

      // Update gradient metrics from cursor positions (throttled)
      this._updateGradientMetricsFromCursors()
    })

    this.socketService.on('sonic-update', (update) => {
      if (this.isAudioStarted) {
        this.audioService.updatePatterns(update.patterns)
      }
    })

    // Entry #175: Pass style to playComposition for genre-aware audio
    this.socketService.on('background-composition', (data) => {

      // Entry #175b: Propagate style to userSynthManager for remote user synths
      if (data.style && this.audioService?.userSynthManager) {
        this.audioService.userSynthManager.setCurrentStyle(data.style)
      }

      // Entry #181: Propagate genre to DragStreamingHandler for genre-aware melodic generation
      if (data.style?.dominantGenre && this.dragStreamingHandler) {
        this.dragStreamingHandler.updateGenre(data.style.dominantGenre)
      }

      if (this.isAudioStarted && data.composition) {
        this.audioService.playComposition(data.composition, data.isDrone, data.style)
      } else if (data.isDrone && data.composition) {
        // Save drone for later - will be played when audio starts
        this.pendingDrone = data.composition
        this.pendingDroneStyle = data.style // Entry #175: Save style for pending drone
      }
    })

    // PHASE 5: Removed unused 'gesture-processed' listener (82 lines)
    // Backend never emits this event - it uses 'musical:event' instead
    // Logic for remote gestures now handled by 'musical:event' listener above

    // Handle musical events from backend (drag phrases, etc.)
    // PHASE 4 FIX: Changed from 'musical-event' (dash) to 'musical:event' (colon) to match backend
    // PHASE 7 FIX: Extract actual event from wrapper (backend sends { event: {...} })
    // CRITICAL FIX: Schedule notes based on timestamp to avoid cluster playback
    // VISUAL FIX: Add visual feedback (pulses + particles) for remote gestures
    this.socketService.on('musical:event', (musicalEventWrapper) => {
      // Entry #99: Handle phrase events for attractor morphing
      // Backend sends phrase events directly: { type: 'phrase', userId, ... }
      // These trigger Lorenz↔Rossler attractor transitions
      if (musicalEventWrapper?.type === 'phrase') {
        if (this.visualService && this.visualService.onMusicalEvent) {
          this.visualService.onMusicalEvent({
            type: 'phrase',
            velocity: musicalEventWrapper.velocity || 0.5
          })
        }
        return // Phrase events don't contain note data
      }

      if (!this.isAudioStarted || !musicalEventWrapper?.event) {
        return
      }

      const event = musicalEventWrapper.event
      const remoteUserId = musicalEventWrapper.userId

      // CRITICAL: Ignore own musical events to prevent duplicate playback
      // When local gesture creates sound, backend broadcasts it back
      // We must ignore it to avoid playing it twice (strum effect)
      if (remoteUserId === this.socketService.socket.id) {
        return
      }

      // DEBUG: Log all event properties
      // console.log('🔍 Remote musical:event:', {
//        userId: remoteUserId?.substring(0, 8),
//        isOwn: remoteUserId === this.socketService.socket.id,
//        gestureAction: event.properties?.gestureAction,
//        isStreamed: event.properties?.isStreamed,
//        totalNotes: event.properties?.totalNotes,
//        noteIndex: event.properties?.noteIndex,
//        frequency: event.properties?.frequency?.toFixed(0)
////      })

      // CRITICAL FIX: Add visual feedback for remote gestures (pulses + particles)
      // Get gesture type: tap if single note, drag if streamed/phrase
      const isStreamed = event.properties?.isStreamed || false
      const totalNotes = event.properties?.totalNotes || 1
      const noteIndex = event.properties?.noteIndex || 0

      // Only trigger visual on first note to avoid duplicate effects
      const shouldTriggerVisual = (noteIndex === 0 || noteIndex === undefined)

      // Tap: single note (totalNotes=1, not streamed)
      // Drag: multiple notes (totalNotes>1) or streamed
      const gestureType = (totalNotes === 1 && !isStreamed) ? 'tap' : 'drag'

      // console.log('🎨 Visual trigger:', {
//        shouldTriggerVisual,
//        gestureType,
//        isStreamed,
//        totalNotes,
//        noteIndex
////      })

      // Get remote user's cursor position from cursor manager
      let remotePosition = { x: 0.5, y: 0.5 } // Default center
      let userColor = '#fb923c' // Default color
      let cursorFound = false

      if (this.cursorManager) {
        const remoteCursor = this.cursorManager.cursors.get(remoteUserId)
        if (remoteCursor) {
          remotePosition = { x: remoteCursor.x, y: remoteCursor.y }
          userColor = remoteCursor.color
          cursorFound = true
        }
      }

      // console.log('🖱️ Cursor info:', {
//        cursorFound,
//        remotePosition,
//        userColor
////      })

      // CRITICAL: First ensure node exists in visual service, then trigger gesture
      if (this.visualService && shouldTriggerVisual) {
        // console.log('✨ Calling updateCursorPosition for remote user:', remoteUserId.substring(0, 8))

        // Ensure node exists (creates if not present)
        this.visualService.updateCursorPosition(
          remoteUserId,
          remotePosition.x,
          remotePosition.y,
          userColor
        )

        // console.log('✨ Calling updateGestureData with:', gestureType, 'isActive=true')

        // Now trigger gesture effects (pulses + particles)
        this.visualService.updateGestureData(remoteUserId, {
          type: gestureType,
          velocity: event.properties?.velocity / 100 || 0.5,
          isActive: true
        })

        // Reset gesture state after short delay to prevent continuous emission
        setTimeout(() => {
          if (this.visualService) {
            this.visualService.updateGestureData(remoteUserId, {
              type: 'idle',
              isActive: false
            })
          }
        }, 100)

        // Entry #81: Draw trail halo for remote/virtual user tap
        // Only for taps (single note, not streamed) or last note of phrase
        // CRITICAL FIX #2: Validate position coordinates before rendering
        const isLastNote = (noteIndex === totalNotes - 1)
        if (gestureType === 'tap' || isLastNote) {
          if (isFinite(remotePosition.x) && isFinite(remotePosition.y)) {
            // Validate duration is numeric and finite
            const rawDuration = event.properties?.duration
            const duration = typeof rawDuration === 'number' && isFinite(rawDuration) ? rawDuration : 0.1
            const tapIntensity = gestureType === 'tap'
              ? Math.min(1, 0.3 + (duration * 0.7))
              : Math.min(1, 0.3 + (totalNotes * 0.1))  // More notes = higher intensity
            const sanitizedColor = this._sanitizeColor(userColor) || '#fb923c'
            this._renderTrailHalo(remotePosition.x, remotePosition.y, tapIntensity, sanitizedColor)
          }
        }
      } else {
        // console.log('⚠️ Visual NOT triggered:', { hasVisualService: !!this.visualService, shouldTriggerVisual })
      }

      // CRITICAL FIX: Schedule note playback based on relativeDelay
      // Backend now sends explicit relativeDelay for streamed notes
      let delay
      if (event.relativeDelay !== undefined) {
        // Use explicit relativeDelay from backend (most accurate)
        delay = Math.max(0, event.relativeDelay)
      } else {
        // Fallback: calculate from timestamp
        const now = Date.now()
        const eventTime = event.timestamp || now
        delay = Math.max(0, eventTime - now)
      }

      // CRITICAL: Include userId in event for per-user synth routing
      const eventWithUserId = { ...event, userId: remoteUserId }

      // Entry #175b fix: Extract style for genre-aware remote playback
      const style = musicalEventWrapper.style || this.audioService?.currentStyle || null

      if (delay > 0) {
        // Schedule note for future playback
        setTimeout(() => {
          if (this.isAudioStarted && this.audioService) {
            this.audioService.playMusicalEvent(eventWithUserId, style)
          }
        }, delay)
      } else {
        // Play immediately if timestamp is in the past
        this.audioService.playMusicalEvent(eventWithUserId, style)
      }
    })

    // Handle gesture trail halos from remote users
    this.socketService.on('gesture:trail', (data) => {
      if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') {
        return
      }

      // Ignore own trails (shouldn't happen, but safety check)
      if (data.userId === this.socketService?.socket?.id) {
        return
      }

      // Render remote user's trail halo
      this._renderTrailHalo(data.x, data.y, data.intensity || 0.5, data.color || '#2dd4bf')
    })

    // Handle real-time note streaming from remote users (drag notes)
    this.socketService.on('note:stream', (data) => {
      if (!this.isAudioStarted || !data?.event) {
        return
      }

      const event = data.event
      const remoteUserId = data.userId

      // Include userId for per-user synth routing
      const eventWithUserId = { ...event, userId: remoteUserId }

      // Entry #175b fix: Extract style for genre-aware remote playback
      const style = data.style || this.audioService?.currentStyle || null

      // Play immediately - no delay for real-time streaming
      if (this.audioService) {
        this.audioService.playMusicalEvent(eventWithUserId, style)
      }
    })

    this.socketService.on('connect_error', (error) => {
      // console.error('❌ Socket connection error:', error)
      this.showError('Unable to connect to server. Please ensure the backend is running on port 3001.')
    })

    this.socketService.on('room-full', (data) => {
      // console.error('❌ Room is full:', data.error)
      this.showError(`Unable to join room: ${data.error}. The room has reached maximum capacity (10 users). Please try again later.`)
    })

    // Virtual user events for solo mode
    this.socketService.on('virtual-users-activated', (data) => {
      // FIX: Track virtual users state to prevent race conditions
      this.virtualUsersActive = true

      if (this.cursorManager && data.virtualUsers) {
        // FIX: Enable virtual cursors before adding (unblock after previous deactivation)
        this.cursorManager.enableVirtualCursors()
        data.virtualUsers.forEach(user => {
          this.cursorManager.addVirtualCursor(user.userId, user.color, true) // fadeIn
        })
      }

      if (this.visualService && data.virtualUsers) {
        data.virtualUsers.forEach(user => {
          // Initialize cursor at center position so it appears immediately
          this.visualService.updateCursorPosition?.(user.userId, 0.5, 0.5, user.color)
        })
      }

      // Update UI to show web sources count
      if (this.uiManager && data.sources) {
        this.uiManager.setVirtualSourceCount(data.sources.length)
      }

      // Show notification
      if (window.NotificationService) {
        window.NotificationService.showVirtualUsersActivated(data.sources)
      }
    })

    this.socketService.on('virtual-users-deactivated', (data) => {
      // FIX: Track virtual users state BEFORE removing cursors to prevent race conditions
      this.virtualUsersActive = false

      if (this.cursorManager) {
        this.cursorManager.removeAllVirtualCursors(true) // fadeOut
      }

      if (this.visualService && data.sources) {
        data.sources.forEach(source => {
          const userId = `${source}-metrics`
          this.visualService.removeUser(userId) // FIX: was removeVirtualUser (doesn't exist)
        })
      }

      // Update UI to hide web sources count
      if (this.uiManager) {
        this.uiManager.setVirtualSourceCount(0)
      }
    })

    // Virtual cursor position updates
    this.socketService.on('virtual-cursors', (data) => {
      // FIX: Ignore virtual cursor updates if virtual users have been deactivated (race condition prevention)
      if (!this.virtualUsersActive) return
      if (!this.cursorManager || !data.cursors) return

      for (const [, cursor] of Object.entries(data.cursors)) {
        // Fallback: add cursor if it doesn't exist yet (handles race condition with virtual-users-activated)
        if (!this.cursorManager.isVirtualCursor(cursor.userId)) {
          this.cursorManager.addVirtualCursor(cursor.userId, cursor.color, true) // fadeIn
        }

        // Update cursor position
        this.cursorManager.updateVirtualCursor(cursor.userId, cursor.x, cursor.y)

        // Also update visual service
        if (this.visualService) {
          this.visualService.updateCursorPosition?.(
            cursor.userId,
            cursor.x,
            cursor.y,
            cursor.color
          )
        }
      }

      // Update gradient metrics from all cursor positions
      this._updateGradientMetricsFromCursors()
    })

    // Mode transition notification
    this.socketService.on('mode-transition', (data) => {
      if (window.NotificationService) {
        window.NotificationService.showModeTransition(data.message, data.duration || 3000)
      }
    })
  }

  setupDrawingEvents() {
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
        // Guard against null socket (can happen during page unload)
        if (!this.socketService || !this.socketService.socket) return
        // console.log(`📍 Emitting cursor-move: (${x.toFixed(2)}, ${y.toFixed(2)}), drawing: ${isDrawingState}`)
        this.socketService.socket.emit('cursor-move', {
          x,
          y,
          isDrawing: isDrawingState,
          timestamp: now
        })
        lastCursorEmit = now

        // Update local visual service with cursor position
        if (this.visualService && this.socketService && this.socketService.socket) {
          const userId = this.socketService.socket.id
          if (!userId) return // Skip if socket not ready (prevents ghost "local" cursor)
          const color = this.currentUserColor || '#22c55e'
          this.visualService.updateCursorPosition(userId, x, y, color)
        }
      }
    }

    // DISABLED: Drawing functions removed (DrawingRenderer replaced by p5.js)
    // Mouse/Touch events for continuous cursor tracking
    // NOTE: Drawing is disabled (DrawingRenderer replaced by p5.js)
    // But we need cursor tracking for the visualization graph
    const handleCursorMove = (e) => {
      const { x, y } = getCanvasCoordinates(e)
      emitCursorPosition(x, y, false)
    }

    // Add mouse/touch move listeners for cursor tracking
    this.canvas.addEventListener('mousemove', handleCursorMove)
    this.canvas.addEventListener('touchmove', handleCursorMove)

    // console.log('✅ Cursor tracking enabled for p5.js visualization')
  }

  async connectToServer() {
    try {
      // Determine backend URL based on environment
      // In production (webarmonium.net), use the same origin (nginx proxy)
      // In development (localhost/127.0.0.1), use port 3001 directly
      const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
      const backendUrl = isDevelopment
        ? 'http://localhost:3001'
        : `${window.location.protocol}//${window.location.host}`

      // console.log(`🔌 Connecting to backend at: ${backendUrl}`)
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

      const joinResponse = await this.socketService.joinRoom('main-room', userData)

      // Store assigned user color for p5.js visualization
      if (joinResponse && joinResponse.assignedColor) {
        this.currentUserColor = joinResponse.assignedColor
        // console.log('✅ User color assigned:', this.currentUserColor)
      }

      // Entry #SynthUI: Initialize synth panel with services and user color
      if (this.uiManager && this.audioService && this.socketService) {
        this.uiManager.setSynthPanelServices(
          this.audioService,
          this.socketService,
          this.currentUserColor
        )
      }

      // Handle redirect notification (overflow room)
      if (joinResponse && joinResponse.redirectedFrom) {
        if (window.NotificationService) {
          window.NotificationService.showModeTransition(joinResponse.redirectMessage, 5000)
        }
      }

      // Handle virtual users from join response (backup for socket event timing)
      if (joinResponse && joinResponse.virtualUsers && joinResponse.virtualUsers.length > 0) {
        // FIX: Set state and enable before adding
        this.virtualUsersActive = true
        if (this.cursorManager) {
          this.cursorManager.enableVirtualCursors()
          joinResponse.virtualUsers.forEach(user => {
            this.cursorManager.addVirtualCursor(user.userId, user.color, true)
          })
        }
        if (this.uiManager) {
          this.uiManager.setVirtualSourceCount(joinResponse.virtualUsers.length)
        }
      }

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
        // console.log('🔊 Manual audio start requested...')
        // Start audio context (requires user interaction)
        const startResult = await this.audioService.start()
        // console.log('🔊 AudioService.start() result:', startResult)

        if (startResult) {
          this.isAudioStarted = true
          button.innerHTML = '<svg width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5"/></svg>'
          button.classList.remove('disabled')
          button.classList.add('playing')

          // Update room label to "Stop"
          const roomLabel = document.querySelector('.room-controls .node-btn-wrapper:first-child .node-label')
          if (roomLabel) roomLabel.textContent = 'Stop'

          // Sync audio-playing class for immersive mode play/stop icon
          document.body.classList.add('audio-playing')
          const immersiveLabel = document.querySelector('#immersive-controls .node-btn-wrapper:first-child .node-label')
          if (immersiveLabel) immersiveLabel.textContent = 'Stop'

          // Entry #27: CRITICAL - Unmute audio when starting (localStorage may have saved muted=true)
          this.audioService.setMuted(false)
          if (this.audioControls) {
            this.audioControls.setMuted(false)
          }
          // console.log('🔊 Audio started and unmuted')

          // Entry #187: Start hold monitoring for gesture-based density modulation (diradamento)
          // Rule: if > 2 prolonged gestures, thin out background to let gesture sounds through
          if (!this.holdDensityMonitorInterval) {
            this.holdDensityMonitorInterval = setInterval(() => {
              if (this.audioService?.isInitialized) {
                const localCount = this.activeLocalHold ? 1 : 0
                const remoteCount = this.activeRemoteHolds?.size || 0
                const totalHolds = localCount + remoteCount
                this.audioService.applyGestureDensityModulation(totalHolds)
              }
            }, 250)  // Check every 250ms
          }

          // Play pending drone if saved
          // Entry #175: Pass saved style for genre-aware audio
          if (this.pendingDrone) {
            // console.log('🎵 Playing pending drone:', this.pendingDrone.type)
            this.audioService.playComposition(this.pendingDrone, true, this.pendingDroneStyle)
            this.pendingDrone = null
            this.pendingDroneStyle = null
          } else if (this.socketService?.socket?.connected) {
            // Entry #27: No pending drone (consumed or never received), request from backend
            this.socketService.socket.emit('request-drone')
          }
        } else {
          // AudioContext still suspended - ask user to click again
          this.showError('Audio context blocked. Please click ▶ again.')
        }
      } catch (error) {
        // console.error('❌ Failed to start audio:', error)
        this.showError('Failed to start audio: ' + error.message)
      }
    } else {
      // console.log('🔇 Stopping audio...')
      this.audioService.stop()
      this.isAudioStarted = false
      button.innerHTML = '<svg width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor"><polygon points="4,2 14,8 4,14"/></svg>'
      button.classList.remove('playing')

      // Entry #187: Clear hold density monitoring interval
      if (this.holdDensityMonitorInterval) {
        clearInterval(this.holdDensityMonitorInterval)
        this.holdDensityMonitorInterval = null
      }

      // Update room label to "Start"
      const roomLabel = document.querySelector('.room-controls .node-btn-wrapper:first-child .node-label')
      if (roomLabel) roomLabel.textContent = 'Start'

      // Sync audio-playing class for immersive mode play/stop icon
      document.body.classList.remove('audio-playing')
      const immersiveLabel = document.querySelector('#immersive-controls .node-btn-wrapper:first-child .node-label')
      if (immersiveLabel) immersiveLabel.textContent = 'Start'
      // console.log('🔇 Audio stopped')
    }
  }

  /**
   * Proactively check if audio needs recovery on any user interaction
   * This catches cases where the event-based system fails (iOS quirks)
   */
  _checkAudioNeedsRecovery() {
    if (!this.isAudioStarted || !this.audioService) return false

    const contextState = Tone.context?.state
    // Audio needs recovery if context is not running
    if (contextState !== 'running') {
      return true
    }

    // Also check if masterVolume is stuck at -Infinity (silent)
    if (this.audioService.masterVolume?.volume?.value === -Infinity) {
      return true
    }

    // iOS Safari: Transport can be stopped even if context reports "running"
    if (Tone.Transport?.state !== 'started') {
      return true
    }

    return false
  }

  /**
   * Setup proactive audio recovery check on user interaction
   * iOS Safari may not fire visibility/focus events correctly after sleep
   */
  _setupProactiveRecoveryCheck() {
    const checkAndRecover = async (e) => {
      if (this._checkAudioNeedsRecovery()) {
        this._showAudioRecoveryPrompt()
        this._attachRecoveryClickHandlers()
      }
    }

    document.addEventListener('touchstart', checkAndRecover, { passive: true })
    document.addEventListener('click', checkAndRecover)
  }

  /**
   * Show visual prompt for user to tap to recover audio
   * Called when AudioService dispatches 'audio:gesture-required' event
   */
  _showAudioRecoveryPrompt() {
    // Only show if audio was previously started
    if (!this.isAudioStarted) return

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
   * Attach click/touch handlers for audio recovery (only when prompt is shown)
   * Uses once: true to automatically remove after first interaction
   */
  _attachRecoveryClickHandlers() {
    // Don't attach if already attached
    if (this._audioRecoveryClickHandler) return

    this._audioRecoveryClickHandler = () => this._handleAudioRecoveryClick()
    this._audioRecoveryTouchHandler = (e) => {
      // Prevent default to ensure the event is captured on iOS Safari
      // and triggers proper user gesture context for audio unlock
      e.preventDefault()
      this._handleAudioRecoveryClick()
    }

    document.addEventListener('click', this._audioRecoveryClickHandler, { once: true })
    // iOS Safari requires passive: false to allow preventDefault() and ensure
    // the touchstart is treated as a user gesture for audio context unlock
    document.addEventListener('touchstart', this._audioRecoveryTouchHandler, { once: true, passive: false })
  }

  /**
   * Remove recovery click handlers (called after recovery or cleanup)
   */
  _removeRecoveryClickHandlers() {
    if (this._audioRecoveryClickHandler) {
      document.removeEventListener('click', this._audioRecoveryClickHandler)
      this._audioRecoveryClickHandler = null
    }
    if (this._audioRecoveryTouchHandler) {
      document.removeEventListener('touchstart', this._audioRecoveryTouchHandler)
      this._audioRecoveryTouchHandler = null
    }
  }

  /**
   * Handle click/touch for audio recovery
   * Removes prompt and triggers AudioService recovery via resumeFromTap()
   */
  async _handleAudioRecoveryClick() {
    const prompt = document.getElementById('audio-recovery-prompt')
    if (prompt) {
      prompt.remove()

      // Clear handler references (they auto-remove with once: true, but clear refs)
      this._audioRecoveryClickHandler = null
      this._audioRecoveryTouchHandler = null

      // Trigger audio recovery via AudioService state machine
      if (this.audioService && this.audioService.resumeFromTap) {
        await this.audioService.resumeFromTap()
      }
    }
  }

  /**
   * Cleanup audio recovery listeners (call on app teardown)
   */
  _cleanupAudioRecoveryListeners() {
    // Remove tap-to-resume listener (new state machine approach)
    if (this._audioTapToResumeHandler) {
      window.removeEventListener('audio:tap-to-resume', this._audioTapToResumeHandler)
      this._audioTapToResumeHandler = null
    }

    // Remove click/touch handlers
    this._removeRecoveryClickHandlers()

    // Remove prompt if visible
    const prompt = document.getElementById('audio-recovery-prompt')
    if (prompt) prompt.remove()
  }

  /**
   * DEPRECATED: Auto-start audio removed
   * Audio should ONLY start from explicit user click on Play button.
   * This method violated the principle that audio must start from user gesture.
   * Left as empty stub in case any code still references it.
   */
  async attemptAutoStartAudio() {
    // NO-OP: Audio auto-start disabled to fix bug where button showed "Stop" on page load
    // Use toggleAudio() via Play button click instead
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
    // HIGH FIX #4: Removed debug console.log statements
    const { coordinates, intensity, action, duration } = gesture
    if (!coordinates ||
        !isFinite(coordinates.x) || !isFinite(coordinates.y)) {
      return
    }

    const userColor = this.currentUserColor || '#2dd4bf'

    // Entry #81: For taps/holds, calculate intensity from duration (100ms→0.3, 2000ms→1.0)
    // For drags, use the gesture intensity based on movement
    // MEDIUM FIX #10: Consistent typeof + isFinite pattern
    let trailIntensity = typeof intensity === 'number' && isFinite(intensity) ? intensity : 0.3
    // Handle both 'tap' (quick) and 'hold' (sustained without movement) actions
    // MEDIUM FIX #8: Use centralized intensity calculation
    if (action === 'tap' || action === 'hold') {
      trailIntensity = this._calculateTrailIntensityFromDuration(duration)
    }

    // Draw locally (always, no throttling)
    this._renderTrailHalo(coordinates.x, coordinates.y, trailIntensity, userColor)

    // Entry #80: Throttle network broadcast (~60fps max)
    const now = Date.now()
    if (now - (this._lastTrailEmitTime || 0) < 16) {
      return
    }
    this._lastTrailEmitTime = now

    // Broadcast to other users in room (with error handling)
    try {
      if (this.socketService?.socket?.connected) {
        this.socketService.socket.emit('gesture:trail', {
          x: coordinates.x,
          y: coordinates.y,
          intensity: trailIntensity,
          color: userColor
        })
      }
    } catch (error) {
      // Silent fail - trail emission is not critical
    }
  }

  /**
   * Calculate gradient metrics from cursor positions (real-time, like landing page)
   * Throttled to avoid excessive computation
   * @private
   */
  _updateGradientMetricsFromCursors() {
    if (!this.visualService || !this.cursorManager) return

    // Throttle: max 30 updates per second (like landing page frame rate)
    const now = Date.now()
    if (this._lastGradientUpdate && now - this._lastGradientUpdate < 33) return
    this._lastGradientUpdate = now

    // Get all cursor positions from cursorManager (returns Map)
    const cursorsMap = this.cursorManager.getAllCursors ? this.cursorManager.getAllCursors() : new Map()

    // Convert Map to array of positions
    const allPositions = []
    cursorsMap.forEach((cursor, userId) => {
      if (cursor && typeof cursor.x === 'number' && typeof cursor.y === 'number') {
        allPositions.push({ x: cursor.x, y: cursor.y, userId })
      }
    })
    if (this.socketService?.socket?.id) {
      // Local user's last known position (from gesture or cursor tracking)
      if (this._localCursorPosition) {
        allPositions.push({
          x: this._localCursorPosition.x,
          y: this._localCursorPosition.y,
          userId: this.socketService.socket.id
        })
      }
    }

    if (allPositions.length === 0) return

    // Calculate centroid (dominant zone)
    let sumX = 0, sumY = 0
    for (const cursor of allPositions) {
      if (typeof cursor.x === 'number' && isFinite(cursor.x) &&
          typeof cursor.y === 'number' && isFinite(cursor.y)) {
        sumX += cursor.x
        sumY += cursor.y
      }
    }
    const dominantZone = {
      x: sumX / allPositions.length,
      y: sumY / allPositions.length
    }

    // Calculate spatial density from variance
    let variance = 0
    for (const cursor of allPositions) {
      if (typeof cursor.x === 'number' && typeof cursor.y === 'number') {
        variance += (cursor.x - dominantZone.x) ** 2 + (cursor.y - dominantZone.y) ** 2
      }
    }
    variance /= allPositions.length
    const spatialDensity = Math.max(0, Math.min(1, 1 - variance * 4))

    // Forward to visual service
    this.visualService.updateInteractionMetrics({
      userCount: allPositions.length,
      spatialDensity: isFinite(spatialDensity) ? spatialDensity : 0,
      dominantZone
    })
  }

  /**
   * MEDIUM FIX #8: Centralized intensity calculation from duration
   * Converts hold/tap duration to trail intensity (0.3 to 1.0 range)
   * @param {number} durationMs - Duration in milliseconds
   * @returns {number} Intensity value clamped to 0.3-1.0
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
   * Render a trail halo at the given position
   * Used for both local and remote trails
   * Entry #80: Optimized with cached RGB conversion and simpler compositing
   * @param {number} normX - Normalized X position (0-1)
   * @param {number} normY - Normalized Y position (0-1)
   * @param {number} intensity - Trail intensity (0-1)
   * @param {string} color - Hex color string
   */
  _renderTrailHalo(normX, normY, intensity, color) {
    // CRITICAL FIX #3: Validate all numeric inputs to prevent NaN propagation
    if (!this.ctx ||
        !isFinite(normX) || !isFinite(normY) || !isFinite(intensity)) {
      return
    }

    const x = normX * window.innerWidth
    const y = normY * window.innerHeight

    // Entry #80: Cache RGB conversion per color to avoid repeated parsing
    // MEDIUM FIX #7: Validate color before caching
    if (!this._trailColorCache) {
      this._trailColorCache = new Map()
    }

    // Only cache valid color strings
    // Default color #2dd4bf (teal) = RGB(45, 212, 191)
    const colorKey = typeof color === 'string' && color.length > 0 ? color : '#2dd4bf'
    let rgb = this._trailColorCache.get(colorKey)
    if (!rgb) {
      if (!window.VisualUtils) {
      }
      rgb = window.VisualUtils?.hexToRgb(colorKey) || { r: 45, g: 212, b: 191 }
      // Validate RGB values are finite
      if (!isFinite(rgb.r) || !isFinite(rgb.g) || !isFinite(rgb.b)) {
        rgb = { r: 45, g: 212, b: 191 }
      }
      this._trailColorCache.set(colorKey, rgb)
      // Keep cache size bounded (max 20 colors)
      if (this._trailColorCache.size > 20) {
        const firstKey = this._trailColorCache.keys().next().value
        this._trailColorCache.delete(firstKey)
      }
    }

    // HIGH FIX #5: Consistent fallback with clamp 0-1
    const alpha = Math.max(0, Math.min(1, intensity))
    const size = 5 + (alpha * 15)

    this.ctx.save()

    // Use globalAlpha + solid fill + shadowBlur for glow effect
    // More performant than creating gradient every frame
    this.ctx.globalAlpha = alpha * 0.8
    this.ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
    this.ctx.shadowColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
    this.ctx.shadowBlur = size * 0.6

    this.ctx.beginPath()
    this.ctx.arc(x, y, size * 0.5, 0, Math.PI * 2)
    this.ctx.fill()

    this.ctx.restore()
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
    if (!this.ctx || !this.canvas) {
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

      // Use logical (CSS) dimensions since context is scaled by DPR
      // canvas.width/height are scaled by devicePixelRatio, but ctx has scale(dpr,dpr)
      const logicalWidth = window.innerWidth
      const logicalHeight = window.innerHeight

      // Use destination-out composite to fade existing content
      this.ctx.save()
      this.ctx.globalCompositeOperation = 'destination-out'
      this.ctx.fillStyle = `rgba(0, 0, 0, ${scaledAlpha})`
      this.ctx.fillRect(0, 0, logicalWidth, logicalHeight)
      this.ctx.restore()
    } catch (error) {
      console.error('Trail fade error:', error)
      this._stopTrailFade()  // Stop on error to prevent runaway animation
    }
  }

  /**
   * @deprecated DISABLED - Hold indicator rendering removed
   * Hold visualization is now handled by SpringMeshNetwork node pulsing
   * This method is kept for reference but is no longer called.
   */
  startRenderLoop() {
    // DISABLED: Hold indicators removed - SpringMeshNetwork handles hold visualization via node pulsing
    return

    const render = (timestamp) => {
      // Calculate FPS
      if (timestamp - this.lastFrameTime >= 1000) {
        this.fps = this.frameCount
        this.frameCount = 0
        this.lastFrameTime = timestamp
      }
      this.frameCount++

      // SUSTAINED HOLD: Render local sustained hold indicator (pulsing circle)
      if (this.activeLocalHold && this.cursorOverlayCanvas) {
        const now = Date.now()
        if (!this.activeLocalHold.visualStartTime) {
          this.activeLocalHold.visualStartTime = now
        }
        const elapsed = now - this.activeLocalHold.visualStartTime
        const pulse = Math.sin(elapsed * 0.001 * Math.PI * 2) // 1Hz pulse (2π radians per second)
        const radius = 20 + pulse * 5 // 15-25px oscillation
        const opacity = 0.6 + pulse * 0.1 // 0.5-0.7 opacity oscillation

        const overlayCtx = this.cursorOverlayCanvas.getContext('2d')
        overlayCtx.save()
        overlayCtx.globalAlpha = opacity
        overlayCtx.strokeStyle = this.socketService?.userColor || '#2dd4bf'
        overlayCtx.lineWidth = 3
        overlayCtx.beginPath()
        overlayCtx.arc(
          this.activeLocalHold.position.x * this.canvas.width,
          this.activeLocalHold.position.y * this.canvas.height,
          radius,
          0,
          Math.PI * 2
        )
        overlayCtx.stroke()
        overlayCtx.restore()
      }

      // SUSTAINED HOLD: Render remote sustained hold indicators
      if (this.activeRemoteHolds && this.activeRemoteHolds.size > 0 && this.cursorOverlayCanvas) {
        const now = Date.now()
        const overlayCtx = this.cursorOverlayCanvas.getContext('2d')

        for (const [noteId, hold] of this.activeRemoteHolds.entries()) {
          if (!hold.visualStartTime) {
            hold.visualStartTime = now
          }
          const elapsed = now - hold.visualStartTime
          const pulse = Math.sin(elapsed * 0.001 * Math.PI * 2)
          const radius = 20 + pulse * 5
          const opacity = 0.6 + pulse * 0.1

          overlayCtx.save()
          overlayCtx.globalAlpha = opacity
          // Use a different color for remote holds (or get from hold.userColor if available)
          overlayCtx.strokeStyle = hold.userColor || '#fb923c'
          overlayCtx.lineWidth = 3
          overlayCtx.beginPath()
          overlayCtx.arc(
            hold.position.x * this.canvas.width,
            hold.position.y * this.canvas.height,
            radius,
            0,
            Math.PI * 2
          )
          overlayCtx.stroke()
          overlayCtx.restore()
        }
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
    // console.log(`🔇 handleMuteChange called with: ${muted}, audioService exists: ${!!this.audioService}`)
    if (this.audioService) {
      this.audioService.setMuted(muted)
      // console.log(`🔇 Audio ${muted ? 'muted' : 'unmuted'}, audioService.muted is now: ${this.audioService.muted}`)
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
    // console.log(`🔊 handleVolumeChange called with: ${volume}, audioService exists: ${!!this.audioService}`)
    if (this.audioService) {
      this.audioService.setVolume(volume / 100) // Convert 0-100 to 0-1
      // console.log(`🔊 Volume set to ${volume}%, audioService.volume is now: ${this.audioService.volume}`)
    }
  }

  /**
   * SECURITY: Sanitize color values from socket events
   * Prevents potential XSS through malicious color strings
   * @param {string} color - Color value to sanitize
   * @returns {string|null} Sanitized hex color or null if invalid
   */
  _sanitizeColor(color) {
    if (!color || typeof color !== 'string') return null
    // Only allow valid hex colors (3, 4, 6, or 8 hex digits with optional #)
    const hexPattern = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/
    if (!hexPattern.test(color)) return null
    return color.startsWith('#') ? color : `#${color}`
  }

  /**
   * Cleanup and destroy application
   * Prevents memory leaks by cleaning up all services
   */
  destroy() {
    // console.log('🧹 Cleaning up Webarmonium app...')

    // Stop trail fade animation
    this._stopTrailFade()

    // Sprint 2: Delegate cleanup to extracted components
    if (this.canvasManager) {
      this.canvasManager.destroy()
    }

    if (this.uiManager) {
      this.uiManager.destroy()
    }

    if (this.immersiveManager) {
      this.immersiveManager.cleanup()
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

    // console.log('✅ Webarmonium cleanup complete')
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

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeTheme()
    window.webarmoniumApp = new WebarmoniumApp()
  })
} else {
  initializeTheme()
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
    // console.warn('WebarmoniumApp or AudioService not available')
  }
}

// console.log('🧪 Filter test method exposed: window.testFilterModulation()')