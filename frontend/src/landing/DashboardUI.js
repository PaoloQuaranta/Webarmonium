/**
 * DashboardUI
 * Educational dashboard showing real-time metrics with compact horizontal bars
 *
 * Responsibilities:
 * - Update compact horizontal meters with live data from backend
 * - Flash meters when gestures are triggered
 * - Bind control button (toggle Start/Stop) and Volume slider
 * - Show room activity (users in rooms)
 *
 * Architecture (Backend-Driven):
 * - Receives metrics via socket.io from backend
 * - updateMetrics() method called from main.js on metrics-update event
 * - flashSource() method called when a gesture is triggered
 */

export class DashboardUI {
  constructor() {
    // DOM element references (cached on initialize)
    this.elements = {}

    // Playback state
    this.isPlaying = false

    // Callback references for control handlers
    this.onStart = null
    this.onStop = null

    // Normalization ranges for dynamic meter scaling
    // These adapt over time based on observed values
    this.normRanges = {
      wikipedia: {
        editsPerMinute: { min: 0, max: 100 }
      },
      hackernews: {
        postsPerMinute: { min: 0, max: 20 }
      },
      github: {
        pushesPerMinute: { min: 0, max: 50 }
      }
    }

    // Store current metrics for reference
    this.currentMetrics = {
      wikipedia: {},
      hackernews: {},
      github: {}
    }

    // Room activity polling interval
    this._roomActivityInterval = null
  }

  /**
   * Initialize dashboard UI
   * @param {Object} callbacks - Optional callbacks for controls: { onStart, onStop, onVolumeChange }
   */
  initialize(callbacks = {}) {
    this._cacheElements()
    this._bindControls(callbacks)
    this._startRoomActivityPolling()
    // console.log('📊 DashboardUI initialized (compact mode)')
  }

  /**
   * Update metrics from backend
   * @param {Object} metrics - Metrics object from backend
   */
  updateMetrics(metrics) {
    // Store current metrics
    this.currentMetrics = {
      wikipedia: metrics.wikipedia || {},
      hackernews: metrics.hackernews || {},
      github: metrics.github || {}
    }

    // Update each source's compact bar (single primary metric per source)
    this._updateCompactMeter('wikipedia', 'editsPerMinute', metrics.wikipedia?.editsPerMinute || 0)
    this._updateCompactMeter('hackernews', 'postsPerMinute', metrics.hackernews?.postsPerMinute || 0)
    this._updateCompactMeter('github', 'pushesPerMinute', metrics.github?.commitsPerMinute || 0)
  }

  /**
   * Flash a source's compact meter when a gesture is triggered
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @param {string} triggerMetric - Which metric triggered the gesture (optional)
   */
  flashSource(source, triggerMetric = null) {
    const card = this.elements.cards[source]
    if (!card) return

    // Flash the compact metric card
    card.classList.add('flash')
    setTimeout(() => card.classList.remove('flash'), 300)
  }

  /**
   * Cache DOM element references
   * @private
   */
  _cacheElements() {
    this.elements = {
      // Compact metric cards
      cards: {
        wikipedia: document.getElementById('wikipedia-metric'),
        hackernews: document.getElementById('hackernews-metric'),
        github: document.getElementById('github-metric')
      },
      // Control elements
      toggleBtn: document.getElementById('btn-toggle'),
      volumeSlider: document.getElementById('volume'),
      // Room activity label
      roomsActivity: document.getElementById('rooms-activity')
    }
  }

  /**
   * Update a compact horizontal meter
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @param {string} metric - Metric name
   * @param {number} value - Metric value
   * @private
   */
  _updateCompactMeter(source, metric, value) {
    const card = this.elements.cards[source]
    if (!card) return

    const bar = card.querySelector(`[data-metric="${metric}"]`)
    if (!bar) return

    // Update normalization range dynamically
    const range = this.normRanges[source]?.[metric]
    if (range) {
      if (value > range.max) range.max = value * 1.2
    }

    // Calculate normalized value (0-100%)
    const normalized = this._normalizeValue(value, range)

    // Update compact bar fill (horizontal - use width instead of height)
    const fill = bar.querySelector('.compact-fill')
    if (fill) {
      fill.style.width = `${normalized}%`
    }
  }

  /**
   * Normalize a value to 0-100 range
   * @param {number} value - Raw value
   * @param {Object} range - {min, max} range
   * @returns {number} Normalized value (0-100)
   * @private
   */
  _normalizeValue(value, range) {
    if (!range) return 50

    const span = range.max - range.min
    if (span === 0) return 50

    const normalized = ((value - range.min) / span) * 100
    return Math.max(0, Math.min(100, normalized))
  }

  /**
   * Start polling for room activity
   * @private
   */
  _startRoomActivityPolling() {
    // Initial fetch
    this._fetchRoomActivity()

    // Poll every 10 seconds
    this._roomActivityInterval = setInterval(() => {
      this._fetchRoomActivity()
    }, 10000)
  }

  /**
   * Fetch room activity from backend
   * @private
   */
  async _fetchRoomActivity() {
    try {
      const isDevelopment = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
      const baseUrl = isDevelopment
        ? 'http://localhost:3001'
        : `${window.location.protocol}//${window.location.host}`

      const response = await fetch(`${baseUrl}/api/rooms/stats`)
      if (!response.ok) return

      const data = await response.json()

      // Update room activity label
      this._updateRoomActivity(data.totalUsers || 0, data.activeRooms || 0)
    } catch (error) {
      // Silently fail - room activity is non-critical
    }
  }

  /**
   * Update room activity label
   * @param {number} totalUsers - Total users in rooms
   * @param {number} activeRooms - Number of active rooms
   * @private
   */
  _updateRoomActivity(totalUsers, activeRooms) {
    const { roomsActivity } = this.elements
    if (!roomsActivity) return

    if (totalUsers > 0 && activeRooms > 0) {
      const userText = totalUsers === 1 ? 'user' : 'users'
      const roomText = activeRooms === 1 ? 'room' : 'rooms'
      roomsActivity.textContent = `${totalUsers} ${userText} in ${activeRooms} ${roomText}`
      roomsActivity.classList.add('visible')
    } else {
      roomsActivity.classList.remove('visible')
    }
  }

  /**
   * Bind control elements
   * @param {Object} callbacks - Optional callbacks: { onStart, onStop, onVolumeChange }
   * @private
   */
  _bindControls(callbacks = {}) {
    this.onStart = callbacks.onStart || (() => {})
    this.onStop = callbacks.onStop || (() => {})
    this.onVolumeChange = callbacks.onVolumeChange || (() => {})

    const { toggleBtn, volumeSlider } = this.elements

    // Toggle button: Start/Stop experience
    toggleBtn?.addEventListener('click', () => {
      if (this.isPlaying) {
        this.onStop()
        this._updatePlaybackState(false)
      } else {
        this.onStart()
        this._updatePlaybackState(true)
      }
    })

    // Volume slider controls master audio volume
    volumeSlider?.addEventListener('input', (e) => {
      const volume = parseInt(e.target.value, 10) / 100
      this.onVolumeChange(volume)
    })

    // Apply initial volume on load
    if (volumeSlider) {
      const initialVolume = parseInt(volumeSlider.value, 10) / 100
      this.onVolumeChange(initialVolume)
    }
  }

  /**
   * Update playback state UI
   * @param {boolean} isPlaying
   * @private
   */
  _updatePlaybackState(isPlaying) {
    this.isPlaying = isPlaying
    const { toggleBtn } = this.elements

    if (toggleBtn) {
      toggleBtn.textContent = isPlaying ? '⏸ Stop' : '▶ Start'
      toggleBtn.classList.toggle('playing', isPlaying)
    }
  }

  /**
   * Show error message
   * @param {string} message
   */
  showError(message) {
    const errorContainer = document.getElementById('error-message')
    if (errorContainer) {
      errorContainer.textContent = message
      errorContainer.style.display = 'block'
      setTimeout(() => {
        errorContainer.style.display = 'none'
      }, 5000)
    }
  }

  /**
   * Show status message
   * @param {string} message
   */
  showStatus(message) {
    const statusContainer = document.getElementById('status-message')
    if (statusContainer) {
      statusContainer.textContent = message
      statusContainer.style.display = 'block'
      setTimeout(() => {
        statusContainer.style.display = 'none'
      }, 3000)
    }
  }

  /**
   * Cleanup
   */
  dispose() {
    if (this._roomActivityInterval) {
      clearInterval(this._roomActivityInterval)
      this._roomActivityInterval = null
    }
    // console.log('📊 DashboardUI disposed')
  }
}

export default DashboardUI
