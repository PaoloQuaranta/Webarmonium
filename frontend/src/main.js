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
    // Initialize audio service
    this.audioService = new AudioService()

    // Initialize socket service
    // Use current hostname for LAN access (e.g., if accessing via 192.168.x.x, connect to 192.168.x.x:3001)
    const serverHost = window.location.hostname || 'localhost'
    const serverUrl = `ws://${serverHost}:3001`
    console.log(`🔌 Connecting to WebSocket server: ${serverUrl}`)
    this.socketService = new SocketService(serverUrl)

    // Initialize gesture capture
    console.log('🎯 Initializing GestureCapture with canvas:', this.canvas)
    this.gestureCapture = new GestureCapture(this.canvas)
    console.log('🎯 GestureCapture created:', this.gestureCapture)

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

    // Setup gesture handling
    this.gestureCapture.onGesture = (gesture) => {
      this.lastGestureRenderTime = performance.now()
      console.log('🎯 Gesture callback triggered:', gesture)
      this.handleGesture(gesture)
    }
    console.log('🎯 Gesture callback set up')
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
      // Only process non-hover gestures for theremin-style audio
      if (this.isAudioStarted && response.sonicParams && response.gesture?.action !== 'hover') {
        this.audioService.updateSonicParams(response.sonicParams)
      }
    })

    // Handle musical events from backend (drag phrases, etc.)
    this.socketService.on('musical-event', (musicalEvent) => {
      if (this.isAudioStarted && musicalEvent) {
        console.log('🎵 Playing musical event:', musicalEvent)
        this.audioService.playMusicalEvent(musicalEvent)
      }
    })

    // Handle filter modulation events (hover)
    this.socketService.on('filter-modulation', (filterParams) => {
      console.log('🎛️ Received filter-modulation event:', filterParams)
      if (this.isAudioStarted && filterParams) {
        console.log('🎛️ Applying filter modulation:', filterParams)
        this.audioService.updateFilterParams(filterParams)
      } else {
        console.log('🎛️ Audio not started or no filter params, skipping')
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

    // Mouse events
    this.canvas.addEventListener('mousedown', startDrawing)
    this.canvas.addEventListener('mousemove', draw)
    this.canvas.addEventListener('mouseup', endDrawing)
    this.canvas.addEventListener('mouseleave', endDrawing)

    // Touch events
    this.canvas.addEventListener('touchstart', startDrawing)
    this.canvas.addEventListener('touchmove', draw)
    this.canvas.addEventListener('touchend', endDrawing)
    this.canvas.addEventListener('touchcancel', endDrawing)
  }

  async connectToServer() {
    try {
      await this.socketService.connect()

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
        // Start audio context (requires user interaction)
        await this.audioService.start()
        this.isAudioStarted = true
        button.textContent = '🔇 Stop Audio'
        button.classList.remove('disabled')
        console.log('🔊 Audio started')
      } catch (error) {
        console.error('❌ Failed to start audio:', error)
        this.showError('Failed to start audio: ' + error.message)
      }
    } else {
      this.audioService.stop()
      this.isAudioStarted = false
      button.textContent = '🔊 Start Audio'
      console.log('🔇 Audio stopped')
    }
  }

  handleGesture(gesture) {
    // Send gesture to server
    this.socketService.sendGesture(gesture)

    // Handle different gesture types for local audio
    if (!this.isAudioStarted) {
      console.log('🎵 Gesture captured but audio not started')
      this.drawGestureTrail(gesture)
      return
    }

    const sonicParams = {
      x: gesture.coordinates.x,
      y: gesture.coordinates.y,
      intensity: gesture.intensity,
      timestamp: gesture.timestamp,
      action: gesture.action,
      device: gesture.device
    }

    if (gesture.action === 'hover') {
      console.log('🎛️ Hover gesture - only filter modulation, no notes')
      this.audioService.updateFilterParams({
        frequency: 200 + ((1 - sonicParams.y) * 3800), // Y inverted for musical convention
        resonance: 0.5 + (sonicParams.x * 4.5)
      })
    } else if (gesture.action === 'drag') {
      console.log('🎵 DRAG gesture - generating musical phrase locally')
      // FIX: Generate local musical phrase for drag gestures
      this.generateLocalMusicalPhrase(gesture, sonicParams)
    } else if (gesture.action === 'start') {
      console.log('🎵 START gesture - generating single note')
      this.audioService.updateSonicParams(sonicParams)
    } else {
      console.log('🎵 Processing generic gesture for audio:', sonicParams)
      this.audioService.updateSonicParams(sonicParams)
    }

    // Draw gesture trail on canvas
    this.drawGestureTrail(gesture)
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
   * Calculate gesture speed from movement data
   * @param {Object} gesture - Gesture data
   * @returns {number} Speed (0-1)
   */
  calculateGestureSpeed(gesture) {
    // Simple speed calculation based on timestamp and position
    // In a real implementation, you'd track position over time
    return Math.random() * 0.8 + 0.1 // Placeholder: 0.1-0.9 range
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