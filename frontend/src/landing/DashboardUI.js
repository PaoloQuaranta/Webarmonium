/**
 * DashboardUI
 * Educational dashboard showing real-time metrics with vertical meter visualizations
 *
 * Responsibilities:
 * - Update vertical meters with live data from backend
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
        editsPerMinute: { min: 0, max: 100 },
        velocity: { min: -10, max: 10 },
        avgEditSize: { min: 0, max: 5000 },
        newArticles: { min: 0, max: 10 }
      },
      hackernews: {
        postsPerMinute: { min: 0, max: 20 },
        velocity: { min: -5, max: 5 },
        avgUpvotes: { min: 0, max: 500 },
        commentCount: { min: 0, max: 100 }
      },
      github: {
        pushesPerMinute: { min: 0, max: 50 },
        velocity: { min: -10, max: 10 },
        createsPerMinute: { min: 0, max: 30 },
        deletesPerMinute: { min: 0, max: 20 }
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
    this._setupCardParallax()  // Entry #93: Hover parallax effect
    // console.log('📊 DashboardUI initialized (meter-based mode)')
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

    // Update each source's meters
    this._updateSourceMeters('wikipedia', {
      editsPerMinute: metrics.wikipedia?.editsPerMinute || 0,
      velocity: metrics.wikipedia?.velocity || 0,
      avgEditSize: metrics.wikipedia?.avgEditSize || 0,
      newArticles: metrics.wikipedia?.newArticles || 0
    })

    this._updateSourceMeters('hackernews', {
      postsPerMinute: metrics.hackernews?.postsPerMinute || 0,
      velocity: metrics.hackernews?.velocity || 0,
      avgUpvotes: metrics.hackernews?.avgUpvotes || 0,
      commentCount: metrics.hackernews?.commentCount || 0
    })

    this._updateSourceMeters('github', {
      pushesPerMinute: metrics.github?.commitsPerMinute || 0,
      velocity: metrics.github?.velocity || 0,
      createsPerMinute: metrics.github?.createsPerMinute || 0,
      deletesPerMinute: metrics.github?.deletesPerMinute || 0
    })
  }

  /**
   * Flash a source's meters when a gesture is triggered
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @param {string} triggerMetric - Which metric triggered the gesture (optional)
   */
  flashSource(source, triggerMetric = null) {
    const card = this.elements.cards[source]
    if (!card) return

    // Flash the entire card
    card.classList.add('flash')
    setTimeout(() => card.classList.remove('flash'), 300)

    // If a specific metric triggered, flash that meter
    if (triggerMetric) {
      const meter = card.querySelector(`[data-metric="${triggerMetric}"]`)
      if (meter) {
        meter.classList.add('flash')
        setTimeout(() => meter.classList.remove('flash'), 300)
      }
    } else {
      // Flash the velocity meter (usually the trigger)
      const velocityMeter = card.querySelector('[data-metric="velocity"]')
      if (velocityMeter) {
        velocityMeter.classList.add('flash')
        setTimeout(() => velocityMeter.classList.remove('flash'), 300)
      }
    }
  }

  /**
   * Cache DOM element references
   * @private
   */
  _cacheElements() {
    this.elements = {
      // Metric cards
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
   * Update meters for a single source
   * @param {string} source - Source name
   * @param {Object} values - Metric values
   * @private
   */
  _updateSourceMeters(source, values) {
    const card = this.elements.cards[source]
    if (!card) return

    const ranges = this.normRanges[source]

    Object.entries(values).forEach(([metric, value]) => {
      const meter = card.querySelector(`[data-metric="${metric}"]`)
      if (!meter) return

      // Update normalization range dynamically
      const range = ranges[metric]
      if (range) {
        // Expand range if value exceeds current bounds
        if (value > range.max) range.max = value * 1.2
        if (value < range.min && metric !== 'velocity') range.min = Math.max(0, value * 0.8)
      }

      // Calculate normalized value (0-100%)
      const normalized = this._normalizeValue(value, range)

      // Update meter fill
      const fill = meter.querySelector('.meter-fill')
      if (fill) {
        fill.style.height = `${normalized}%`
      }

      // Update meter value display
      const valueEl = meter.querySelector('.meter-value')
      if (valueEl) {
        // Format based on metric type
        if (metric === 'velocity') {
          const sign = value > 0 ? '+' : ''
          valueEl.textContent = `${sign}${value.toFixed(1)}`
        } else if (metric === 'avgEditSize' || metric === 'avgUpvotes') {
          valueEl.textContent = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value)
        } else {
          valueEl.textContent = Math.round(value)
        }
      }
    })
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

    // Handle velocity specially (can be negative)
    if (range.min < 0) {
      // Map negative-to-positive range to 0-100
      const absMax = Math.max(Math.abs(range.min), Math.abs(range.max))
      const normalized = ((value + absMax) / (absMax * 2)) * 100
      return Math.max(0, Math.min(100, normalized))
    }

    // Normal 0-max normalization
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
      toggleBtn.textContent = isPlaying ? '⏸' : '▶'
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
   * Entry #93: Setup hover parallax effect on metric cards
   * Creates a subtle 3D tilt effect on mouse movement
   * @private
   */
  _setupCardParallax() {
    // Skip on touch devices (no hover)
    if (window.matchMedia('(hover: none)').matches) return

    const cards = Object.values(this.elements.cards).filter(Boolean)

    cards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect()
        const x = (e.clientX - rect.left) / rect.width   // 0 to 1
        const y = (e.clientY - rect.top) / rect.height   // 0 to 1

        // Convert to -1 to 1 range, then scale for subtle effect
        const rotateX = (y - 0.5) * -8   // Max 4 degrees
        const rotateY = (x - 0.5) * 8    // Max 4 degrees

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`
      })

      card.addEventListener('mouseleave', () => {
        card.style.transform = ''
      })
    })
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
