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
        lastGestureTime: 0,
        // For smooth cursor interpolation
        currentPos: { x: 0.16, y: 0.5 },
        targetPos: { x: 0.16, y: 0.5 }
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
        lastGestureTime: 0,
        currentPos: { x: 0.5, y: 0.5 },
        targetPos: { x: 0.5, y: 0.5 }
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
        lastGestureTime: 0,
        currentPos: { x: 0.83, y: 0.5 },
        targetPos: { x: 0.83, y: 0.5 }
      }
    }

    // Cursor interpolation
    this.interpolationSpeed = 0.02 // Smooth interpolation factor
    this.interpolationFrame = null

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
    // console.log('🔄 MetricsToGestureAdapter initialized')
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
        user.currentPos.x,
        user.currentPos.y,
        user.color
      )
    }

    // Start smooth cursor interpolation loop
    this._startCursorInterpolation()

    // Start gesture scheduling for each virtual user
    this._scheduleNextGesture('wikipedia')
    this._scheduleNextGesture('hackernews')
    this._scheduleNextGesture('github')

    // Listen for metric updates
    window.addEventListener('metrics:updated', this._onMetricsUpdated)

    // console.log('🔄 MetricsToGestureAdapter started with 3 virtual users')
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

    // Cancel interpolation loop
    if (this.interpolationFrame) {
      cancelAnimationFrame(this.interpolationFrame)
      this.interpolationFrame = null
    }

    // End active gestures for all users
    for (const user of Object.values(this.virtualUsers)) {
      if (user.gesture.isActive) {
        this._emitGestureEnd(user)
      }
    }

    // Remove metric update listener
    window.removeEventListener('metrics:updated', this._onMetricsUpdated)

    // console.log('🔄 MetricsToGestureAdapter stopped')
  }

  /**
   * Handle incoming metric updates
   * @param {CustomEvent} event
   * @private
   */
  _onMetricsUpdated(event) {
    // console.log('🔄 MetricsToGestureAdapter received metrics:', event.detail)
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

    // Update gesture state with target position
    user.gesture.coordinates = { x, y }
    user.gesture.intensity = intensity
    user.targetPos = { x, y }

    // Visual service will be updated by interpolation loop
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

    // Update gesture state with target position
    user.gesture.coordinates = { x, y }
    user.gesture.intensity = intensity
    user.targetPos = { x, y }

    // Visual service will be updated by interpolation loop
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

    // Update gesture state with target position
    user.gesture.coordinates = { x, y }
    user.gesture.intensity = intensity
    user.targetPos = { x, y }

    // Visual service will be updated by interpolation loop
  }

  /**
   * Start smooth cursor interpolation loop
   * @private
   */
  _startCursorInterpolation() {
    const interpolate = () => {
      if (!this.isGenerating) return

      for (const user of Object.values(this.virtualUsers)) {
        // Linear interpolation (lerp) towards target
        const dx = user.targetPos.x - user.currentPos.x
        const dy = user.targetPos.y - user.currentPos.y

        // If distance is significant, interpolate
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
          user.currentPos.x += dx * this.interpolationSpeed
          user.currentPos.y += dy * this.interpolationSpeed

          // Update visual service with interpolated position
          this.visualService?.updateCursorPosition(
            user.userId,
            user.currentPos.x,
            user.currentPos.y,
            user.color
          )
        }
      }

      this.interpolationFrame = requestAnimationFrame(interpolate)
    }

    this.interpolationFrame = requestAnimationFrame(interpolate)
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

    // Reduce gesture frequency - use data frequency for gesture TIMING not gesture COUNT
    // High activity = more frequent gestures (but still sparse)
    // Low activity = very sparse gestures (ambient feel)
    const baseDelay = 20000 // 20 seconds max (very sparse)
    const minDelay = 8000 // 8 seconds min (when very active)
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

    // Determine gesture type - PREFER drag for high activity (longer, more musical)
    // Use tap only for low activity events (sparse, ambient notes)
    let gestureType
    let shouldGenerate = false

    switch (source) {
      case 'wikipedia':
        // Use drag for most activity (generates sustained notes)
        gestureType = metrics.editsPerMinute > 30 ? 'drag' : 'tap'
        // Very restrictive - only generate with significant activity spikes
        shouldGenerate = metrics.editsPerMinute > 80 || (metrics.editsPerMinute > 40 && Math.random() < 0.05)
        break
      case 'hackernews':
        // Prefer drag for high activity
        gestureType = metrics.postsPerMinute > 15 ? 'drag' : 'tap'
        // Very restrictive
        shouldGenerate = metrics.postsPerMinute > 30 || (metrics.postsPerMinute > 15 && Math.random() < 0.03)
        break
      case 'github':
        // Prefer drag for high activity
        gestureType = metrics.commitsPerMinute > 10 ? 'drag' : 'tap'
        // Very restrictive
        shouldGenerate = metrics.commitsPerMinute > 30 || (metrics.commitsPerMinute > 15 && Math.random() < 0.05)
        break
    }

    if (!shouldGenerate) return

    // Emit gesture start
    user.gesture.type = gestureType
    user.gesture.isActive = true
    user.gesture.holdStart = Date.now()

    this._emitGestureStart(user)

    // For tap gestures, end after moderate duration (not too short, more musical)
    if (gestureType === 'tap') {
      setTimeout(() => {
        if (user.gesture.isActive) {
          this._emitGestureEnd(user)
        }
      }, 500) // 500ms instead of 200ms (more musical)
    }
    // For drag gestures, end after longer duration (sustained notes)
    else if (gestureType === 'drag') {
      setTimeout(() => {
        if (user.gesture.isActive) {
          this._emitGestureEnd(user)
        }
      }, 2000) // 2 second drag for sustained musical notes
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
    if (!this.audioService) {
      console.warn('⚠️ No audio service available')
      return
    }

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

    // console.log('🔊 Generating audio:', user.userId, 'freq:', frequency.toFixed(0), 'Hz', 'intensity:', intensity.toFixed(2))

    // Trigger sound through AudioService
    // Entry #106: Using playSimpleNote (three-tier system removed)
    // Now uses the calculated frequency directly (was ignored before - bug fix!)
    if (typeof this.audioService.playSimpleNote === 'function') {
      const volume = intensity * 0.5
      this.audioService.playSimpleNote(frequency, 0.3, volume)
    } else if (typeof this.audioService.processGestureAudio === 'function') {
      this.audioService.processGestureAudio(audioParams)
    } else {
      console.warn('⚠️ No audio input method found on AudioService')
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
