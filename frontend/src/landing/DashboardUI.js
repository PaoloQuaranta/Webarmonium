/**
 * DashboardUI
 * Educational dashboard showing real-time metrics and their mapping to generative art
 *
 * Responsibilities:
 * - Update metric cards with live data from backend
 * - Display calculated generative parameters
 * - Show virtual user cursor states
 * - Bind control buttons (Start/Stop, Volume, Intensity)
 *
 * Architecture (Backend-Driven):
 * - Receives metrics via socket.io from backend
 * - updateMetrics() method called from main.js on metrics-update event
 * - Provides clear visual feedback for metric-to-art relationships
 */

// StateManager is no longer used - backend drives metrics via socket
// import { stateManager } from './StateManager.js'

export class DashboardUI {
  constructor() {
    // DOM element references (cached on initialize)
    this.elements = {}

    // Previous values for change detection
    this.previousValues = {}

    // Callback references for control handlers
    this.onStart = null
    this.onStop = null

    // Local state (replaces StateManager)
    this.currentMetrics = {
      wikipedia: { editsPerMinute: 0 },
      hackernews: { postsPerMinute: 0 },
      github: { commitsPerMinute: 0 }
    }
  }

  /**
   * Initialize dashboard UI
   * @param {Object} callbacks - Optional callbacks for controls: { onStart, onStop }
   */
  initialize(callbacks = {}) {
    this._cacheElements()
    this._bindControls(callbacks)
    console.log('📊 DashboardUI initialized (backend-driven mode)')
  }

  /**
   * Update metrics from backend (new architecture)
   * @param {Object} metrics - Metrics object from backend
   * @param {Object} metrics.wikipedia - Wikipedia metrics
   * @param {Object} metrics.hackernews - HackerNews metrics
   * @param {Object} metrics.github - GitHub metrics
   */
  updateMetrics(metrics) {
    // Store current metrics
    this.currentMetrics = {
      wikipedia: metrics.wikipedia || { editsPerMinute: 0 },
      hackernews: metrics.hackernews || { postsPerMinute: 0 },
      github: metrics.github || { commitsPerMinute: 0 }
    }

    // Update metric cards
    this._updateMetricCard(
      this.elements.wikipedia,
      Math.round(this.currentMetrics.wikipedia.editsPerMinute),
      'edits/min',
      '#e41a1c'
    )

    this._updateMetricCard(
      this.elements.hackernews,
      Math.round(this.currentMetrics.hackernews.postsPerMinute),
      'posts/min',
      '#ff7f00'
    )

    this._updateMetricCard(
      this.elements.github,
      Math.round(this.currentMetrics.github.commitsPerMinute),
      'commits/min',
      '#377eb8'
    )
  }

  /**
   * Cache DOM element references
   * @private
   */
  _cacheElements() {
    this.elements = {
      wikipedia: {
        value: document.querySelector('#wikipedia-metric .metric-value'),
        label: document.querySelector('#wikipedia-metric .metric-label')
      },
      hackernews: {
        value: document.querySelector('#hackernews-metric .metric-value'),
        label: document.querySelector('#hackernews-metric .metric-label')
      },
      github: {
        value: document.querySelector('#github-metric .metric-value'),
        label: document.querySelector('#github-metric .metric-label')
      },
      complexity: {
        value: document.querySelector('#complexity-metric .metric-value'),
        label: document.querySelector('#complexity-metric .metric-label')
      },
      // Control elements
      startBtn: document.getElementById('btn-start'),
      stopBtn: document.getElementById('btn-stop'),
      intensitySlider: document.getElementById('intensity'),
      volumeSlider: document.getElementById('volume'),
      // Virtual user indicators
      wikipediaCursor: document.getElementById('wikipedia-cursor-indicator'),
      hackernewsCursor: document.getElementById('hackernews-cursor-indicator'),
      githubCursor: document.getElementById('github-cursor-indicator')
    }
  }

  /**
   * Bind control elements
   * @param {Object} callbacks - Optional callbacks: { onStart, onStop }
   * @private
   */
  _bindControls(callbacks = {}) {
    // Use provided callbacks (main.js provides start/stop)
    this.onStart = callbacks.onStart || (() => {})
    this.onStop = callbacks.onStop || (() => {})

    const { startBtn, stopBtn, intensitySlider, volumeSlider } = this.elements

    startBtn?.addEventListener('click', () => {
      this.onStart()
      this._updatePlaybackState(true)
    })

    stopBtn?.addEventListener('click', () => {
      this.onStop()
      this._updatePlaybackState(false)
    })

    // Intensity and volume controls are now handled by main.js callbacks
    // These sliders can be used for future enhancements
    intensitySlider?.addEventListener('input', (e) => {
      // Future: could emit to backend to control composition intensity
    })

    volumeSlider?.addEventListener('input', (e) => {
      // Future: could control audio volume
    })
  }

  /**
   * Update playback state UI
   * @param {boolean} isPlaying
   * @private
   */
  _updatePlaybackState(isPlaying) {
    const { startBtn, stopBtn } = this.elements

    if (startBtn) startBtn.disabled = isPlaying
    if (stopBtn) stopBtn.disabled = !isPlaying
  }

  /**
   * Update a single metric card
   * @param {Object} element - Element object with value and label
   * @param {string|number} value - New value
   * @param {string} label - Metric label
   * @param {string} color - Accent color for value
   * @private
   */
  _updateMetricCard(element, value, label, color = '#6366f1') {
    if (!element.value) return

    const valueKey = `${element.value.textContent}-${label}`
    const oldValue = this.previousValues[valueKey]
    this.previousValues[valueKey] = value

    element.value.textContent = value
    element.label.textContent = label
    element.value.style.color = color

    // Add animation class if value changed significantly
    if (oldValue !== undefined && Math.abs(parseFloat(value) - parseFloat(oldValue)) > 0.01) {
      element.value.classList.remove('value-changed')
      // Force reflow
      void element.value.offsetWidth
      element.value.classList.add('value-changed')
    }
  }

  /**
   * Update virtual user cursor indicators
   * @param {Object} virtualUsers - Virtual user states from MetricsToGestureAdapter
   */
  updateVirtualUsers(virtualUsers) {
    const { wikipediaCursor, hackernewsCursor, githubCursor } = this.elements

    this._updateCursorIndicator(wikipediaCursor, virtualUsers.wikipedia)
    this._updateCursorIndicator(hackernewsCursor, virtualUsers.hackernews)
    this._updateCursorIndicator(githubCursor, virtualUsers.github)
  }

  /**
   * Update a single cursor indicator
   * @param {HTMLElement} element - Cursor indicator element
   * @param {Object} user - Virtual user state
   * @private
   */
  _updateCursorIndicator(element, user) {
    if (!element) return

    const { coordinates, intensity, isActive } = user

    // Update position (percentage)
    element.style.left = `${coordinates.x * 100}%`
    element.style.top = `${coordinates.y * 100}%`

    // Update appearance based on activity
    element.style.opacity = 0.3 + (intensity * 0.7)
    element.style.transform = `scale(${isActive ? 1.5 : 1})`
    element.style.boxShadow = isActive
      ? `0 0 ${10 + intensity * 20}px ${user.color}`
      : 'none'
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
    // No StateManager to unsubscribe from
    console.log('📊 DashboardUI disposed')
  }
}

export default DashboardUI
