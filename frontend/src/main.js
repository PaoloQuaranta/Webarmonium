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

    // Handle window resize
    window.addEventListener('resize', () => this.resizeCanvas())
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
    this.socketService = new SocketService('ws://localhost:3001')

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

    // Setup gesture handling
    this.gestureCapture.onGesture = (gesture) => {
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
      if (this.cursorManager) {
        this.cursorManager.updateCursor(
          data.userId,
          data.x,
          data.y,
          data.color,
          data.isDrawing
        )
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
      if (this.isAudioStarted && response.sonicParams) {
        this.audioService.updateSonicParams(response.sonicParams)
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
      if (!isDrawing) {
        // Still emit cursor position even when not drawing
        const { x, y } = getCanvasCoordinates(e)
        this.socketService.socket.emit('cursor-move', {
          x,
          y,
          isDrawing: false,
          timestamp: Date.now()
        })
        return
      }

      e.preventDefault()
      const { x, y } = getCanvasCoordinates(e)

      // Emit draw-point event
      this.socketService.socket.emit('draw-point', {
        strokeId: currentStrokeId,
        x,
        y,
        timestamp: Date.now()
      })

      // Also emit cursor-move with isDrawing=true
      this.socketService.socket.emit('cursor-move', {
        x,
        y,
        isDrawing: true,
        timestamp: Date.now()
      })
    }

    const endDrawing = (e) => {
      if (!isDrawing) return

      e.preventDefault()
      isDrawing = false

      const { x, y } = getCanvasCoordinates(e)

      // Emit draw-end event
      this.socketService.socket.emit('draw-end', {
        strokeId: currentStrokeId,
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

    // Immediate local audio feedback per FR-006 (<200ms latency)
    if (this.isAudioStarted) {
      const sonicParams = {
        x: gesture.coordinates.x,
        y: gesture.coordinates.y,
        intensity: gesture.intensity,
        timestamp: gesture.timestamp
      }
      console.log('🎵 Processing gesture for audio:', sonicParams)
      this.audioService.updateSonicParams(sonicParams)
    } else {
      console.log('🎵 Gesture captured but audio not started')
    }

    // Draw gesture trail on canvas
    this.drawGestureTrail(gesture)
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

      // Clear canvas with fade effect for trails
      this.ctx.save()
      this.ctx.globalCompositeOperation = 'source-over'
      this.ctx.fillStyle = 'rgba(26, 26, 46, 0.1)'
      this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
      this.ctx.restore()

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
      roomIdEl.textContent = `Room: ${this.currentRoom.id}`
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
    if (this.audioService) {
      this.audioService.setMuted(muted)
      console.log(`🔇 Audio ${muted ? 'muted' : 'unmuted'}`)
    }
  }

  handleVolumeChange(volume) {
    if (this.audioService) {
      this.audioService.setVolume(volume / 100) // Convert 0-100 to 0-1
      console.log(`🔊 Volume set to ${volume}%`)
    }
  }

  /**
   * Cleanup and destroy application
   * Prevents memory leaks by cleaning up all services
   */
  destroy() {
    console.log('🧹 Cleaning up Webarmonium app...')

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