/**
 * LandingCompositionService
 * Generates compositions from web metrics (Wikipedia, HackerNews, GitHub)
 * for the landing page experience
 *
 * Architecture:
 * 1. WebMetricsPoller provides metrics (editsPerMinute, postsPerMinute, commitsPerMinute)
 * 2. Converts metrics to virtual gestures (3 virtual users)
 * 3. Uses BackgroundCompositionService to generate compositions
 * 4. Broadcasts compositions + cursors + metrics to landing room clients
 *
 * Virtual Users:
 * - 'wikipedia-metrics' (Red): Left region, based on edit rate and size
 * - 'hackernews-metrics' (Orange): Center region, based on posts and upvotes
 * - 'github-metrics' (Blue): Right region, based on commits and stars
 */

const BackgroundCompositionService = require('./BackgroundCompositionService')

class LandingCompositionService {
  constructor() {
    // Use BackgroundCompositionService for composition generation
    this.backgroundCompositionService = new BackgroundCompositionService()

    // Virtual user definitions (same as frontend MetricsToGestureAdapter)
    this.virtualUsers = {
      wikipedia: {
        userId: 'wikipedia-metrics',
        color: '#e41a1c',
        region: { xMin: 0.0, xMax: 0.33 },
        gestureType: 'drag' // Prefer drag for sustained notes
      },
      hackernews: {
        userId: 'hackernews-metrics',
        color: '#ff7f00',
        region: { xMin: 0.33, xMax: 0.66 },
        gestureType: 'drag'
      },
      github: {
        userId: 'github-metrics',
        color: '#377eb8',
        region: { xMin: 0.66, xMax: 1.0 },
        gestureType: 'drag'
      }
    }

    // Current metrics state
    this.metrics = {
      wikipedia: { editsPerMinute: 0, newArticles: 0, avgEditSize: 0 },
      hackernews: { postsPerMinute: 0, avgUpvotes: 0, commentCount: 0 },
      github: { commitsPerMinute: 0, openPRs: 0, newStars: 0 }
    }

    // Service state
    this.isRunning = false
    this.landingRoomId = 'landing-room'
    this.compositionInterval = 10000 // Generate composition every 10 seconds
    this.compositionTimer = null

    // Metrics callback
    this.onMetricsUpdate = null

    // Socket.io instance (set by server)
    this.io = null

    // GestureToMusicService (set by server) for generating musical phrases
    this.gestureToMusicService = null

// console.log('🎵 LandingCompositionService initialized')
  }

  /**
   * Set Socket.IO instance for broadcasting
   * @param {SocketIO} io - Socket.IO instance
   */
  setSocketIO(io) {
    this.io = io
    this.backgroundCompositionService.setSocketIO(io)
// console.log('🎵 LandingCompositionService: Socket.IO connected')
  }

  /**
   * Set GestureToMusicService for generating musical phrases from virtual gestures
   * @param {GestureToMusicService} gestureService - GestureToMusicService instance
   */
  setGestureToMusicService(gestureService) {
    this.gestureToMusicService = gestureService
    this.backgroundCompositionService.setGestureToMusicService(gestureService)
// console.log('🎵 LandingCompositionService: GestureToMusicService linked')
  }

  /**
   * Start landing composition service
   */
  start() {
    if (this.isRunning) {
// console.log('🎵 LandingCompositionService already running')
      return
    }

    this.isRunning = true

    // Start composition for landing room
    this.backgroundCompositionService.startComposition(this.landingRoomId, {
      userCount: 0, // No real users, only virtual
      activeUsers: [],
      isLandingRoom: true
    })

    // Generate initial virtual gestures to kickstart composition
    setTimeout(() => {
      this.generateVirtualGestures()
    }, 2000)

    // Start continuous virtual gesture generation
    this.scheduleNextVirtualGestures()

// console.log('🎵 LandingCompositionService started')
  }

  /**
   * Stop landing composition service
   */
  stop() {
    if (!this.isRunning) return

    this.isRunning = false

    // Clear virtual gesture timer
    if (this.compositionTimer) {
      clearTimeout(this.compositionTimer)
      this.compositionTimer = null
    }

    // Stop background composition
    this.backgroundCompositionService.stopComposition(this.landingRoomId)

// console.log('🎵 LandingCompositionService stopped')
  }

  /**
   * Schedule next virtual gesture generation
   * @private
   */
  scheduleNextVirtualGestures() {
    if (!this.isRunning) return

    // Generate virtual gestures every 8-16 seconds (similar to frontend BackgroundMusicGenerator)
    const nextDelay = 8000 + Math.random() * 8000

    this.compositionTimer = setTimeout(() => {
      this.generateVirtualGestures()
      this.scheduleNextVirtualGestures()
    }, nextDelay)

// console.log(`🎵 Next virtual gestures in ${(nextDelay/1000).toFixed(1)}s`)
  }

  /**
   * Generate virtual gestures from current metrics
   * @private
   */
  async generateVirtualGestures() {
    if (!this.isRunning) return

    // Generate gestures for each source based on metrics
    for (const [source, user] of Object.entries(this.virtualUsers)) {
      const metrics = this.metrics[source]
      const activityLevel = this.calculateActivityLevel(source, metrics)

      // Only generate gesture if activity is significant
      if (activityLevel > 0.1) {
        await this.generateVirtualGesture(source, user, metrics, activityLevel)
      }
    }
  }

  /**
   * Calculate activity level for a source (0.0-1.0)
   * @param {string} source - 'wikipedia' | 'hackernews' | 'github'
   * @param {Object} metrics - Metrics for this source
   * @returns {number} Activity level
   * @private
   */
  calculateActivityLevel(source, metrics) {
    switch (source) {
      case 'wikipedia':
        // High activity = 500+ edits/min
        return Math.min(1.0, metrics.editsPerMinute / 500)
      case 'hackernews':
        // High activity = 100+ posts/min
        return Math.min(1.0, metrics.postsPerMinute / 100)
      case 'github':
        // High activity = 50+ commits/min
        return Math.min(1.0, metrics.commitsPerMinute / 50)
      default:
        return 0
    }
  }

  /**
   * Generate a single virtual gesture
   * @param {string} source - Source name
   * @param {Object} user - Virtual user definition
   * @param {Object} metrics - Current metrics
   * @param {number} activityLevel - Activity level (0.0-1.0)
   * @private
   */
  async generateVirtualGesture(source, user, metrics, activityLevel) {
    // Calculate cursor position from metrics
    const cursor = this.calculateCursorPosition(source, user, metrics)

    // Create virtual gesture data
    const gestureData = {
      userId: user.userId,
      gesture: {
        type: 'drag', // Use drag for sustained musical notes
        coordinates: cursor,
        velocity: { x: 0, y: 0 }, // Virtual gestures have no velocity
        intensity: activityLevel,
        startTime: Date.now(),
        endTime: Date.now() + 2000, // 2 second drag
        duration: 2000,
        holdStart: Date.now(),
        isActive: true
      },
      timestamp: Date.now()
    }

    // Generate musical phrase from gesture
    let musicalPhrase = null
    if (this.gestureToMusicService) {
      try {
        musicalPhrase = await this.gestureToMusicService.generatePhraseFromGesture(
          gestureData.gesture,
          { tier: 'remote' }
        )
      } catch (error) {
// console.error('❌ Error generating phrase from virtual gesture:', error)
      }
    }

    // Add material to background composition service
    if (musicalPhrase) {
      this.backgroundCompositionService.addMaterial(
        this.landingRoomId,
        gestureData,
        musicalPhrase
      )
    }

    // Broadcast cursor position
    this.broadcastCursorPositions()
  }

  /**
   * Calculate cursor position for a virtual user
   * @param {string} source - Source name
   * @param {Object} user - Virtual user definition
   * @param {Object} metrics - Current metrics
   * @returns {Object} Cursor position {x, y}
   * @private
   */
  calculateCursorPosition(source, user, metrics) {
    let x, y

    switch (source) {
      case 'wikipedia':
        // X: Within left third, based on edit rate
        x = user.region.xMin + (Math.min(metrics.editsPerMinute / 500, 1.0) * (user.region.xMax - user.region.xMin))
        // Y: Based on edit size (logarithmic scale)
        y = Math.min(Math.log10(metrics.avgEditSize + 1) / 4, 1.0)
        break
      case 'hackernews':
        // X: Within center third, based on post rate
        x = user.region.xMin + (Math.min(metrics.postsPerMinute / 100, 1.0) * (user.region.xMax - user.region.xMin))
        // Y: Based on avg upvotes
        y = Math.min(metrics.avgUpvotes / 100, 1.0)
        break
      case 'github':
        // X: Within right third, based on commit rate
        x = user.region.xMin + (Math.min(metrics.commitsPerMinute / 50, 1.0) * (user.region.xMax - user.region.xMin))
        // Y: Based on new stars
        y = Math.min(metrics.newStars / 20, 1.0)
        break
    }

    return { x, y }
  }

  /**
   * Broadcast cursor positions to landing room
   * @private
   */
  broadcastCursorPositions() {
    if (!this.io || !this.isRunning) return

    const cursors = {}
    for (const [source, user] of Object.entries(this.virtualUsers)) {
      const cursor = this.calculateCursorPosition(source, user, this.metrics[source])
      cursors[source] = {
        userId: user.userId,
        x: cursor.x,
        y: cursor.y,
        color: user.color
      }
    }

    this.io.to(this.landingRoomId).emit('virtual-cursors', {
      cursors,
      timestamp: Date.now()
    })
  }

  /**
   * Update metrics from WebMetricsPoller
   * Called by WebMetricsPoller when new metrics are available
   * @param {Object} newMetrics - New metrics from WebMetricsPoller
   */
  updateMetrics(newMetrics) {
    this.metrics = newMetrics

    // Broadcast metrics to landing room for dashboard display
    if (this.io && this.isRunning) {
      this.io.to(this.landingRoomId).emit('metrics-update', {
        metrics: this.metrics,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Get current metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return this.metrics
  }

  /**
   * Get virtual cursor positions
   * @returns {Object} Virtual cursor positions
   */
  getVirtualCursors() {
    const cursors = {}
    for (const [source, user] of Object.entries(this.virtualUsers)) {
      const cursor = this.calculateCursorPosition(source, user, this.metrics[source])
      cursors[source] = {
        userId: user.userId,
        x: cursor.x,
        y: cursor.y,
        color: user.color
      }
    }
    return cursors
  }
}

module.exports = LandingCompositionService
