/**
 * DashboardUI
 * Educational dashboard showing real-time metrics and their mapping to generative art
 *
 * Responsibilities:
 * - Update metric cards with live data
 * - Display calculated generative parameters
 * - Show virtual user cursor states
 * - Bind control buttons (Start/Stop, Volume, Intensity)
 *
 * Architecture:
 * - Subscribes to StateManager for reactive updates
 * - Provides clear visual feedback for metric-to-art relationships
 */

import { stateManager } from './StateManager.js'

export class DashboardUI {
  constructor() {
    // DOM element references (cached on initialize)
    this.elements = {}

    // Previous values for change detection
    this.previousValues = {}

    // Unsubscribe function
    this.unsubscribe = null

    // Callback references for control handlers
    this.onStart = null
    this.onStop = null
  }

  /**
   * Initialize dashboard UI
   * @param {Object} callbacks - Optional callbacks for controls: { onStart, onStop }
   */
  initialize(callbacks = {}) {
    this._cacheElements()
    this._bindControls(callbacks)
    this.unsubscribe = stateManager.subscribe(this._updateDisplay.bind(this))
    console.log('📊 DashboardUI initialized')
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
    this.onStart = callbacks.onStart || (() => stateManager.setPlayback(true))
    this.onStop = callbacks.onStop || (() => stateManager.setPlayback(false))

    const { startBtn, stopBtn, intensitySlider, volumeSlider } = this.elements

    startBtn?.addEventListener('click', () => {
      this.onStart()
      this._updatePlaybackState(true)
    })

    stopBtn?.addEventListener('click', () => {
      this.onStop()
      this._updatePlaybackState(false)
    })

    intensitySlider?.addEventListener('input', (e) => {
      stateManager.setIntensity(e.target.value / 100)
    })

    volumeSlider?.addEventListener('input', (e) => {
      stateManager.setVolume(e.target.value / 100)
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
   * Update display with current state
   * @param {Object} state - Current state from StateManager
   * @private
   */
  _updateDisplay(state) {
    const { metrics, parameters, playback } = state

    // Update metric cards
    this._updateMetricCard(
      this.elements.wikipedia,
      Math.round(metrics.wikipedia.editsPerMinute),
      'edits/min',
      '#e41a1c'
    )

    this._updateMetricCard(
      this.elements.hackernews,
      Math.round(metrics.hackernews.postsPerMinute),
      'posts/min',
      '#ff7f00'
    )

    this._updateMetricCard(
      this.elements.github,
      Math.round(metrics.github.commitsPerMinute),
      'commits/min',
      '#377eb8'
    )

    // Update complexity parameter
    this._updateMetricCard(
      this.elements.complexity,
      parameters.complexity.toFixed(2),
      'algorithm parameter',
      '#6366f1'
    )

    // Update slider values
    if (this.elements.intensitySlider) {
      this.elements.intensitySlider.value = playback.intensity * 100
    }
    if (this.elements.volumeSlider) {
      this.elements.volumeSlider.value = playback.volume * 100
    }

    // Update playback state
    this._updatePlaybackState(playback.isPlaying)
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
   * Cleanup: unsubscribe from state updates
   */
  dispose() {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
    console.log('📊 DashboardUI disposed')
  }
}

export default DashboardUI
