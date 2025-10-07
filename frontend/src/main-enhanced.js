/**
 * Enhanced Webarmonium - Collaborative Generative Music Platform
 * Main application entry point with generative music features
 */

class EnhancedWebarmoniumApp {
  constructor() {
    // Core services
    this.socketService = null
    this.canvas = null
    this.ctx = null
    this.isAudioStarted = false
    this.currentRoom = null
    this.userCount = 1

    // Enhanced generative music services
    this.gestureToMusicMapper = null
    this.enhancedAudioService = null
    this.enhancedGestureCapture = null
    this.compositionVisualizer = null

    // Legacy services (for backward compatibility)
    this.audioService = null
    this.gestureCapture = null
    this.cursorManager = null
    this.drawingRenderer = null

    // Multi-user canvas services
    this.cursorOverlayCanvas = null
    this.audioControls = null
    this.isDrawing = false
    this.currentStrokeWidth = 2

    // Musical state
    this.musicalClock = { bpm: 120, currentBeat: 0, isRunning: false }
    this.compositionData = {
      mood: { energy: 0.1, complexity: 0.2, style: { classical: 0.4, ambient: 0.3, electronic: 0.3 } },
      activityLevel: 0.1,
      musicalElements: [],
      backgroundEvents: [],
      userPatterns: [] // Add userPatterns array for activity tracking
    }

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
      console.log('🎵 Initializing Enhanced Webarmonium...')

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

      console.log('✅ Enhanced Webarmonium initialized successfully')
    } catch (error) {
      console.error('❌ Failed to initialize Enhanced Webarmonium:', error)
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
    if (this.compositionVisualizer) {
      this.compositionVisualizer.resizeCanvas()
    }
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
    try {
      // Initialize socket service
      const serverHost = window.location.hostname || 'localhost'
      const serverUrl = `ws://${serverHost}:3001`
      console.log(`🔌 Connecting to WebSocket server: ${serverUrl}`)
      this.socketService = new SocketService(serverUrl)

      // Initialize enhanced generative music services
      console.log('🎵 Initializing enhanced generative music services...')

      // Initialize enhanced audio service
      this.enhancedAudioService = new EnhancedAudioService(this.socketService)
      await this.enhancedAudioService.initialize()

      // Initialize gesture-to-music mapper
      this.gestureToMusicMapper = new GestureToMusicMapper(this.enhancedAudioService)

      // Initialize enhanced gesture capture
      this.enhancedGestureCapture = new EnhancedGestureCapture(
        this.canvas,
        this.gestureToMusicMapper,
        this.socketService
      )

      // Initialize composition visualizer
      const visualizerContainer = this.canvas.parentElement
      this.compositionVisualizer = new CompositionVisualizer(visualizerContainer)

      // Initialize legacy services for backward compatibility
      this.audioService = new AudioService()
      this.gestureCapture = new GestureCapture(this.canvas)

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

      // Setup enhanced gesture handling
      this.setupEnhancedGestureHandling()

      console.log('✅ Enhanced services initialized successfully')

    } catch (error) {
      console.error('❌ Failed to initialize enhanced services:', error)
      throw error
    }
  }

  setupEnhancedGestureHandling() {
    // Handle local gestures
    this.enhancedGestureCapture.onGesture = (gesture) => {
      console.log('🎯 Enhanced gesture captured:', gesture.direction, gesture.intensity.toFixed(2))
      this.handleEnhancedGesture(gesture)
    }

    this.enhancedGestureCapture.onGestureStart = (gesture) => {
      console.log('👆 Enhanced gesture started:', gesture.id)
    }

    this.enhancedGestureCapture.onGestureEnd = (gesture, musicalEvent) => {
      console.log('👋 Enhanced gesture ended:', gesture.id)
      if (musicalEvent) {
        this.playMusicalEvent(musicalEvent)
      }
    }

    this.enhancedGestureCapture.onMultiUserGesture = (data) => {
      console.log('👥 Multi-user gesture received:', data.userId.substring(0, 8))
      this.handleMultiUserGesture(data)
    }

    console.log('🎯 Enhanced gesture handling setup complete')
  }

  setupEventListeners() {
    // Audio toggle button
    const audioToggle = document.getElementById('audioToggle')
    audioToggle.addEventListener('click', () => this.toggleAudio())

    // Canvas drawing interaction (legacy)
    this.setupDrawingEvents()

    // Socket event listeners
    this.socketService.on('room-joined', (data) => {
      this.currentRoom = data.room
      this.updateRoomDisplay()
      this.enhancedGestureCapture.setRoomContext(data.room.roomId)
      this.enhancedAudioService.setRoomContext(data.room.roomId)
      console.log('🏠 Joined room:', data.room.roomId)
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

    // Musical clock events
    this.socketService.on('musical-clock', (data) => {
      this.updateMusicalClock(data.musicalClock)
    })

    // Background composition events
    this.socketService.on('composition-update', (data) => {
      this.updateCompositionData(data)
    })

    // Background musical events
    this.socketService.on('background-events', (data) => {
      this.handleBackgroundEvents(data.events)
    })

    // Multi-user canvas events (legacy)
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

    // Throttle cursor-move to 50ms (20fps) for performance
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
        emitCursorPosition(x, y, false)
        return
      }

      e.preventDefault()

      this.socketService.socket.emit('draw-point', {
        strokeId: currentStrokeId,
        x,
        y,
        timestamp: Date.now()
      })

      emitCursorPosition(x, y, true)
    }

    const endDrawing = (e) => {
      if (!isDrawing) return

      e.preventDefault()
      isDrawing = false

      const { x, y } = getCanvasCoordinates(e)

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
      return 'mobile'
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
        // Start enhanced audio service
        await this.enhancedAudioService.start()
        this.enhancedGestureCapture.start()
        this.compositionVisualizer.start()

        // Start legacy audio service for compatibility
        await this.audioService.start()

        this.isAudioStarted = true
        button.textContent = '🔇 Stop Audio'
        button.classList.remove('disabled')
        console.log('🔊 Enhanced audio started')

        // Request musical clock sync
        this.requestMusicalClockSync()

      } catch (error) {
        console.error('❌ Failed to start audio:', error)
        this.showError('Failed to start audio: ' + error.message)
      }
    } else {
      this.enhancedAudioService.stop()
      this.enhancedGestureCapture.stop()
      this.compositionVisualizer.stop()

      // Stop legacy audio service
      this.audioService.stop()

      this.isAudioStarted = false
      button.textContent = '🔊 Start Audio'
      console.log('🔇 Enhanced audio stopped')
    }
  }

  handleEnhancedGesture(gesture) {
    // Send enhanced gesture to server
    if (this.socketService && this.socketService.socket) {
      this.socketService.socket.emit('enhanced-gesture', {
        gestureId: gesture.id,
        userId: gesture.userId,
        roomId: gesture.roomId,
        coordinates: gesture.currentPosition,
        direction: gesture.direction,
        intensity: gesture.intensity,
        speed: gesture.speed,
        musicalCharacteristics: gesture.musicalCharacteristics,
        timestamp: Date.now()
      })
    }

    // Update composition data with user activity
    this.updateUserActivity(gesture)
  }

  handleMultiUserGesture(data) {
    const { userId, gesture, musicalEvent } = data

    // Play remote user's musical event
    if (musicalEvent && this.enhancedAudioService) {
      this.enhancedAudioService.playMusicalEvent(musicalEvent)
    }

    // Update composition visualizer
    if (this.compositionVisualizer) {
      this.compositionVisualizer.updateCompositionData({
        userPatterns: [...this.compositionVisualizer.compositionData.userPatterns, gesture]
      })
    }
  }

  playMusicalEvent(musicalEvent) {
    if (this.enhancedAudioService) {
      this.enhancedAudioService.playMusicalEvent(musicalEvent)
    }

    // Also play through legacy audio service for compatibility
    if (this.audioService && this.isAudioStarted) {
      const sonicParams = {
        x: musicalEvent.pitch / 127, // Map pitch to x coordinate
        y: 1 - (musicalEvent.velocity / 127), // Map velocity to y coordinate
        intensity: musicalEvent.duration / 2000, // Map duration to intensity
        timestamp: musicalEvent.timestamp
      }
      this.audioService.updateSonicParams(sonicParams)
    }
  }

  updateMusicalClock(musicalClock) {
    this.musicalClock = musicalClock

    if (this.enhancedAudioService) {
      this.enhancedAudioService.syncWithClock({ musicalClock })
    }

    if (this.compositionVisualizer) {
      this.compositionVisualizer.updateCompositionData({
        musicalClock
      })
    }
  }

  updateCompositionData(data) {
    this.compositionData = { ...this.compositionData, ...data }

    if (this.compositionVisualizer) {
      this.compositionVisualizer.updateCompositionData(this.compositionData)
    }

    // Update gesture-to-music mapper with new musical context
    if (data.mood && this.gestureToMusicMapper) {
      // Adjust scale based on mood energy
      if (data.mood.energy > 0.7) {
        this.gestureToMusicMapper.setScale('chromatic')
      } else if (data.mood.energy < 0.3) {
        this.gestureToMusicMapper.setScale('pentatonic')
      } else {
        this.gestureToMusicMapper.setScale('major')
      }
    }
  }

  handleBackgroundEvents(events) {
    if (!events || !this.enhancedAudioService) return

    for (const event of events) {
      this.enhancedAudioService.playBackgroundEvent(event)
    }

    // Update visualizer
    if (this.compositionVisualizer) {
      this.compositionVisualizer.updateCompositionData({
        backgroundEvents: events
      })
    }
  }

  updateUserActivity(gesture) {
    const now = Date.now()

    // Add current gesture to patterns
    this.compositionData.userPatterns.push({
      timestamp: now,
      userId: gesture.userId || 'local-user',
      direction: gesture.direction || 'unknown',
      intensity: gesture.intensity || 0.5,
      coordinates: gesture.coordinates || { x: 0.5, y: 0.5 }
    })

    // Keep only recent patterns (last 20)
    this.compositionData.userPatterns = this.compositionData.userPatterns.slice(-20)

    const recentActivity = this.compositionData.userPatterns.filter(
      p => now - p.timestamp < 5000 // Last 5 seconds
    )

    // Calculate activity level
    this.compositionData.activityLevel = Math.min(1, recentActivity.length / 10)

    // Update visualizer
    if (this.compositionVisualizer) {
      this.compositionVisualizer.updateCompositionData(this.compositionData)
    }
  }

  requestMusicalClockSync() {
    if (this.socketService && this.socketService.socket) {
      this.socketService.socket.emit('request-musical-clock', {
        roomId: this.currentRoom?.id,
        timestamp: Date.now()
      })
    }
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

      // Clear canvas with fade effect
      this.ctx.save()
      this.ctx.globalCompositeOperation = 'source-over'
      this.ctx.fillStyle = 'rgba(26, 26, 46, 0.05)'
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
      roomIdEl.textContent = `Room: ${this.currentRoom.roomId}`
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
    console.log(`🔇 Enhanced audio ${muted ? 'muted' : 'unmuted'}`)
    if (this.enhancedAudioService) {
      this.enhancedAudioService.setMasterVolume(muted ? 0 : 1)
    }
    if (this.audioService) {
      this.audioService.setMuted(muted)
    }
  }

  handleVolumeChange(volume) {
    console.log(`🔊 Enhanced volume set to ${volume}%`)
    if (this.enhancedAudioService) {
      this.enhancedAudioService.setMasterVolume(volume / 100)
    }
    if (this.audioService) {
      this.audioService.setVolume(volume / 100)
    }
  }

  /**
   * Get application statistics
   * @returns {Object} Application statistics
   */
  getStatistics() {
    return {
      fps: this.fps,
      isAudioStarted: this.isAudioStarted,
      userCount: this.userCount,
      currentRoom: this.currentRoom?.id,
      musicalClock: this.musicalClock,
      compositionData: {
        activityLevel: this.compositionData.activityLevel,
        userPatterns: this.compositionData.userPatterns.length,
        backgroundEvents: this.compositionData.backgroundEvents.length
      },
      services: {
        enhancedAudio: this.enhancedAudioService?.getPerformanceStats(),
        gestureCapture: this.enhancedGestureCapture?.getGestureStatistics(),
        visualizer: this.compositionVisualizer?.getStats()
      }
    }
  }

  /**
   * Cleanup and destroy application
   */
  destroy() {
    console.log('🧹 Cleaning up Enhanced Webarmonium app...')

    // Remove event listeners
    if (this.boundResizeHandler) {
      window.removeEventListener('resize', this.boundResizeHandler)
      this.boundResizeHandler = null
    }

    // Stop enhanced services
    if (this.enhancedGestureCapture) {
      this.enhancedGestureCapture.destroy()
    }

    if (this.enhancedAudioService) {
      this.enhancedAudioService.cleanup()
    }

    if (this.compositionVisualizer) {
      this.compositionVisualizer.destroy()
    }

    // Stop legacy services
    if (this.cursorManager) {
      this.cursorManager.destroy()
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

    console.log('✅ Enhanced Webarmonium cleanup complete')
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.webarmoniumApp = new EnhancedWebarmoniumApp()
  })
} else {
  window.webarmoniumApp = new EnhancedWebarmoniumApp()
}

// Cleanup on page unload to prevent memory leaks
window.addEventListener('beforeunload', () => {
  if (window.webarmoniumApp) {
    window.webarmoniumApp.destroy()
  }
})

// Make available globally for debugging
window.EnhancedWebarmoniumApp = EnhancedWebarmoniumApp