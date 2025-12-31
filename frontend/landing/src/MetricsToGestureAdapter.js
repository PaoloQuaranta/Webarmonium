/**
 * MetricsToGestureAdapter
 * Converts web activity metrics into gesture data compatible with existing Webarmonium services
 *
 * Architecture:
 * - Creates 3 VIRTUAL USERS representing different web activity sources
 * - Each virtual user has its own cursor position and generates gestures independently
 * - Reuses GenerativeVisualService and AudioService APIs without modification
 *
 * Virtual Users:
 * - 'wikipedia-metrics' (Red 🔴): Left region, moves based on edit rate and size
 * - 'hackernews-metrics' (Orange 🟠): Center region, moves based on posts and upvotes
 * - 'github-metrics' (Blue 🔵): Right region, moves based on commits and stars
 *
 * API Compatibility:
 * - updateCursorPosition(userId, x, y, color) -> GenerativeVisualService
 * - updateGestureData(userId, gestureData) -> GenerativeVisualService
 * - handleGestureInput(audioParams) -> AudioService (if available)
 */

export class MetricsToGestureAdapter {
  constructor() {
    // Virtual user definitions
    this.virtualUsers = {
      wikipedia: {
        userId: 'wikipedia-metrics',
        color: '#e41a1c', // Red
        region: { xMin: 0.0, xMax: 0.33 },
        gesture: {
          type: 'idle',
          coordinates: { x: 0.16, y: 0.5 },
          velocity: { x: 0, y: 0 },
          intensity: 0,
          isActive: false
        },
        lastGestureTime: 0
      },
      hackernews: {
        userId: 'hackernews-metrics',
        color: '#ff7f00', // Orange
        region: { xMin: 0.33, xMax: 0.66 },
        gesture: {
          type: 'idle',
          coordinates: { x: 0.5, y: 0.5 },
          velocity: { x: 0, y: 0 },
          intensity: 0,
          isActive: false
        },
        lastGestureTime: 0
      },
      github: {
        userId: 'github-metrics',
        color: '#377eb8', // Blue
        region: { xMin: 0.66, xMax: 1.0 },
        gesture: {
          type: 'idle',
          coordinates: { x: 0.83, y: 0.5 },
          velocity: { x: 0, y: 0 },
          intensity: 0,
          isActive: false
        },
        lastGestureTime: 0
      }
    }

    // Current metrics state
    this.metrics = {
      wikipedia: { editsPerMinute: 0, newArticles: 0, avgEditSize: 0 },
      hackernews: { postsPerMinute: 0, avgUpvotes: 0, commentCount: 0 },
      github: { commitsPerMinute: 0, openPRs: 0, newStars: 0 }
    }

    // Service references (injected via initialize)
    this.visualService = null
    this.audioService = null

    // Gesture scheduling timers
    this.eventTimers = {
      wikipedia: null,
      hackernews: null,
      github: null
    }

    // Event listener bound to this instance
    this._onMetricsUpdated = this._onMetricsUpdated.bind(this)

    // Flag for gesture generation
    this.isGenerating = false
  }

  /**
   * Initialize with service references
   * @param {GenerativeVisualService} visualService
   * @param {AudioService} audioService
   */
  initialize(visualService, audioService) {
    this.visualService = visualService
    this.audioService = audioService
    console.log('🔄 MetricsToGestureAdapter initialized')
  }

  /**
   * Start generating gestures from metrics
   */
  start() {
    if (this.isGenerating) return

    this.isGenerating = true

    // Initialize all virtual users in the visual service
    for (const user of Object.values(this.virtualUsers)) {
      this.visualService?.updateCursorPosition(
        user.userId,
        user.gesture.coordinates.x,
        user.gesture.coordinates.y,
        user.color
      )
    }

    // Start gesture scheduling for each virtual user
    this._scheduleNextGesture('wikipedia')
    this._scheduleNextGesture('hackernews')
    this._scheduleNextGesture('github')

    // Listen for metric updates
    window.addEventListener('metrics:updated', this._onMetricsUpdated)

    console.log('🔄 MetricsToGestureAdapter started with 3 virtual users')
  }

  /**
   * Stop generating gestures
   */
  stop() {
    if (!this.isGenerating) return

    this.isGenerating = false

    // Clear all timers
    for (const timer of Object.values(this.eventTimers)) {
      if (timer) clearTimeout(timer)
    }

    // End active gestures for all users
    for (const user of Object.values(this.virtualUsers)) {
      if (user.gesture.isActive) {
        this._emitGestureEnd(user)
      }
    }

    // Remove metric update listener
    window.removeEventListener('metrics:updated', this._onMetricsUpdated)

    console.log('🔄 MetricsToGestureAdapter stopped')
  }

  /**
   * Handle incoming metric updates
   * @param {CustomEvent} event
   * @private
   */
  _onMetricsUpdated(event) {
    this.metrics = event.detail
    this._updateCursorPositions()
  }

  /**
   * Update cursor positions for all virtual users based on their metrics
   * @private
   */
  _updateCursorPositions() {
    this._updateWikipediaCursor()
    this._updateHackerNewsCursor()
    this._updateGitHubCursor()
  }

  /**
   * Update Wikipedia cursor position
   * - Region: Left side (0.0 - 0.33)
   * - X: Based on edit rate (more edits = more right within region)
   * - Y: Based on edit size (larger edits = higher)
   * @private
   */
  _updateWikipediaCursor() {
    const user = this.virtualUsers.wikipedia
    const metrics = this.metrics.wikipedia

    // X: Within left third, based on edit rate
    const editRate = Math.min(metrics.editsPerMinute / 500, 1.0)
    const x = user.region.xMin + (editRate * (user.region.xMax - user.region.xMin))

    // Y: Based on edit size (logarithmic scale for smooth mapping)
    const y = Math.min(Math.log10(metrics.avgEditSize + 1) / 4, 1.0)

    // Intensity: Based on edit rate
    const intensity = Math.min(metrics.editsPerMinute / 500, 1.0)

    // Update gesture state
    user.gesture.coordinates = { x, y }
    user.gesture.intensity = intensity

    // Update visual service
    this.visualService?.updateCursorPosition(user.userId, x, y, user.color)
  }

  /**
   * Update HackerNews cursor position
   * - Region: Center (0.33 - 0.66)
   * - X: Based on post rate (more posts = more right within region)
   * - Y: Based on upvotes (more upvotes = higher)
   * @private
   */
  _updateHackerNewsCursor() {
    const user = this.virtualUsers.hackernews
    const metrics = this.metrics.hackernews

    // X: Within center third, based on post rate
    const postRate = Math.min(metrics.postsPerMinute / 100, 1.0)
    const x = user.region.xMin + (postRate * (user.region.xMax - user.region.xMin))

    // Y: Based on avg upvotes
    const y = Math.min(metrics.avgUpvotes / 100, 1.0)

    // Intensity: Based on post rate
    const intensity = Math.min(metrics.postsPerMinute / 100, 1.0)

    // Update gesture state
    user.gesture.coordinates = { x, y }
    user.gesture.intensity = intensity

    // Update visual service
    this.visualService?.updateCursorPosition(user.userId, x, y, user.color)
  }

  /**
   * Update GitHub cursor position
   * - Region: Right side (0.66 - 1.0)
   * - X: Based on commit rate (more commits = more right within region)
   * - Y: Based on new stars (more stars = higher)
   * @private
   */
  _updateGitHubCursor() {
    const user = this.virtualUsers.github
    const metrics = this.metrics.github

    // X: Within right third, based on commit rate
    const commitRate = Math.min(metrics.commitsPerMinute / 50, 1.0)
    const x = user.region.xMin + (commitRate * (user.region.xMax - user.region.xMin))

    // Y: Based on new stars
    const y = Math.min(metrics.newStars / 20, 1.0)

    // Intensity: Based on commit rate
    const intensity = Math.min(metrics.commitsPerMinute / 50, 1.0)

    // Update gesture state
    user.gesture.coordinates = { x, y }
    user.gesture.intensity = intensity

    // Update visual service
    this.visualService?.updateCursorPosition(user.userId, x, y, user.color)
  }

  /**
   * Schedule next gesture event for a specific virtual user
   * @param {string} source - 'wikipedia' | 'hackernews' | 'github'
   * @private
   */
  _scheduleNextGesture(source) {
    const user = this.virtualUsers[source]
    const metrics = this.metrics[source]

    // Calculate gesture interval based on activity level
    // Higher activity = faster gestures (shorter interval)
    let activityLevel
    switch (source) {
      case 'wikipedia':
        activityLevel = metrics.editsPerMinute / 500
        break
      case 'hackernews':
        activityLevel = metrics.postsPerMinute / 100
        break
      case 'github':
        activityLevel = metrics.commitsPerMinute / 50
        break
    }

    const baseDelay = 2000 // 2 seconds max
    const minDelay = 250 // 250ms min
    const delay = baseDelay - (Math.min(activityLevel, 1.0) * (baseDelay - minDelay))

    this.eventTimers[source] = setTimeout(() => {
      if (this.isGenerating) {
        this._generateGesture(source)
        this._scheduleNextGesture(source)
      }
    }, delay)
  }

  /**
   * Generate a gesture event for a specific virtual user
   * @param {string} source - 'wikipedia' | 'hackernews' | 'github'
   * @private
   */
  _generateGesture(source) {
    const user = this.virtualUsers[source]
    const metrics = this.metrics[source]
    const intensity = user.gesture.intensity

    // Determine gesture type and whether to generate
    let gestureType
    let shouldGenerate = false

    switch (source) {
      case 'wikipedia':
        // High edit rate = drag (continuous), low = tap
        gestureType = metrics.editsPerMinute > 100 ? 'drag' : 'tap'
        shouldGenerate = metrics.editsPerMinute > 10 || Math.random() < 0.3
        break
      case 'hackernews':
        // High post rate = tap (discrete events)
        gestureType = 'tap'
        shouldGenerate = metrics.postsPerMinute > 5 || Math.random() < 0.2
        break
      case 'github':
        // Commits = tap, PRs = drag
        gestureType = metrics.openPRs > 2 ? 'drag' : 'tap'
        shouldGenerate = metrics.commitsPerMinute > 5 || metrics.newStars > 0
        break
    }

    if (!shouldGenerate) return

    // Emit gesture start
    user.gesture.type = gestureType
    user.gesture.isActive = true
    user.gesture.holdStart = Date.now()

    this._emitGestureStart(user)

    // For tap gestures, automatically end after short duration
    if (gestureType === 'tap') {
      setTimeout(() => {
        if (user.gesture.isActive) {
          this._emitGestureEnd(user)
        }
      }, 200)
    }
  }

  /**
   * Emit gesture start event for a virtual user
   * @param {Object} user - Virtual user object
   * @private
   */
  _emitGestureStart(user) {
    const gestureData = {
      type: user.gesture.type,
      velocity: { x: 0, y: 0 }, // Simplified for metric-driven gestures
      holdStart: user.gesture.holdStart,
      isActive: true,
      intensity: user.gesture.intensity
    }

    // Update visual service (triggers pulses/particles)
    this.visualService?.updateGestureData(user.userId, gestureData)

    // Generate audio event through AudioService
    this._generateAudioFromGesture(user, gestureData)
  }

  /**
   * Emit gesture end event for a virtual user
   * @param {Object} user - Virtual user object
   * @private
   */
  _emitGestureEnd(user) {
    user.gesture.isActive = false
    user.gesture.holdStart = null

    const gestureData = {
      type: user.gesture.type,
      velocity: { x: 0, y: 0 },
      isActive: false
    }

    this.visualService?.updateGestureData(user.userId, gestureData)
  }

  /**
   * Generate audio event from gesture data for a virtual user
   * @param {Object} user - Virtual user object
   * @param {Object} gestureData - Gesture data
   * @private
   */
  _generateAudioFromGesture(user, gestureData) {
    if (!this.audioService) return

    const { x, y } = user.gesture.coordinates
    const intensity = user.gesture.intensity

    // Map position to frequency (using existing Webarmonium logic)
    const baseFreq = 110 + (1 - y) * 440 // 110-550Hz
    const harmonic = x * 660 // 0-660Hz
    const frequency = baseFreq + harmonic

    // Create audio parameters compatible with AudioService
    const audioParams = {
      frequency,
      intensity,
      tier: 'remote', // Use remote tier for metric-driven gestures
      velocity: intensity * 200, // Simplified velocity
      envelope: {
        attack: 0.01,
        decay: 0.1 + intensity * 0.2,
        sustain: intensity * 0.5,
        release: 0.2 + intensity * 0.3
      },
      spatialParams: {
        pan: (x - 0.5) * 2, // -1 to 1
        distance: 1 - intensity,
        reverbAmount: 0.2
      }
    }

    // Trigger sound through existing AudioService API
    if (typeof this.audioService.processGestureInput === 'function') {
      this.audioService.processGestureInput(audioParams)
    } else if (typeof this.audioService.handleGestureInput === 'function') {
      this.audioService.handleGestureInput(audioParams)
    }
  }

  /**
   * Get current virtual user states
   * @returns {Object} Virtual user states
   */
  getVirtualUserStates() {
    return {
      wikipedia: {
        userId: this.virtualUsers.wikipedia.userId,
        color: this.virtualUsers.wikipedia.color,
        coordinates: { ...this.virtualUsers.wikipedia.gesture.coordinates },
        intensity: this.virtualUsers.wikipedia.gesture.intensity,
        isActive: this.virtualUsers.wikipedia.gesture.isActive
      },
      hackernews: {
        userId: this.virtualUsers.hackernews.userId,
        color: this.virtualUsers.hackernews.color,
        coordinates: { ...this.virtualUsers.hackernews.gesture.coordinates },
        intensity: this.virtualUsers.hackernews.gesture.intensity,
        isActive: this.virtualUsers.hackernews.gesture.isActive
      },
      github: {
        userId: this.virtualUsers.github.userId,
        color: this.virtualUsers.github.color,
        coordinates: { ...this.virtualUsers.github.gesture.coordinates },
        intensity: this.virtualUsers.github.gesture.intensity,
        isActive: this.virtualUsers.github.gesture.isActive
      }
    }
  }
}

export default MetricsToGestureAdapter
