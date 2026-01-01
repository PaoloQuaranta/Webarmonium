/**
 * StateManager
 * Centralized state management for the landing page
 *
 * Responsibilities:
 * - Maintain single source of truth for metrics, parameters, and playback state
 * - Provide subscription-based state updates
 * - Calculate derived parameters from raw metrics
 *
 * Architecture Note:
 * - Uses singleton pattern for global state consistency
 * - State mutations happen through methods (not direct property access)
 * - Subscribers are notified on any state change
 */

export class StateManager {
  constructor() {
    if (StateManager.instance) {
      return StateManager.instance
    }
    StateManager.instance = this

    this.state = {
      playback: {
        isPlaying: false,
        volume: 0.7,
        intensity: 0.5
      },
      metrics: {
        wikipedia: { editsPerMinute: 0, newArticles: 0, avgEditSize: 0 },
        hackernews: { postsPerMinute: 0, avgUpvotes: 0, commentCount: 0 },
        github: { commitsPerMinute: 0, openPRs: 0, newStars: 0 }
      },
      parameters: {
        complexity: 0.5,
        rhythmicPreference: 0.5,
        harmonicPreference: 0.5,
        intensity: 0.5,
        position: { x: 0.5, y: 0.5 },
        diversity: 0.5
      },
      lastUpdate: Date.now()
    }

    this.listeners = new Set()
  }

  /**
   * Get current state (immutable copy)
   * @returns {Object} Current state snapshot
   */
  getState() {
    return {
      playback: { ...this.state.playback },
      metrics: {
        wikipedia: { ...this.state.metrics.wikipedia },
        hackernews: { ...this.state.metrics.hackernews },
        github: { ...this.state.metrics.github }
      },
      parameters: {
        ...this.state.parameters,
        position: { ...this.state.parameters.position }
      },
      lastUpdate: this.state.lastUpdate
    }
  }

  /**
   * Update metrics from a specific source
   * @param {string} source - 'wikipedia' | 'hackernews' | 'github'
   * @param {Object} data - Metric data to merge
   */
  updateMetrics(source, data) {
    if (!this.state.metrics[source]) {
      console.warn(`StateManager: Unknown metric source '${source}'`)
      return
    }

    this.state.metrics[source] = { ...this.state.metrics[source], ...data }
    this.state.lastUpdate = Date.now()

    // Auto-recalculate derived parameters
    this.recalculateParameters()

    this._notify()
  }

  /**
   * Update generative parameters directly
   * @param {Object} params - Parameters to merge
   */
  updateParameters(params) {
    this.state.parameters = {
      ...this.state.parameters,
      ...params,
      position: params.position
        ? { ...this.state.parameters.position, ...params.position }
        : this.state.parameters.position
    }
    this.state.lastUpdate = Date.now()
    this._notify()
  }

  /**
   * Update playback state
   * @param {boolean} isPlaying - Whether playback is active
   */
  setPlayback(isPlaying) {
    this.state.playback.isPlaying = isPlaying
    this._notify()
  }

  /**
   * Update volume level
   * @param {number} volume - Volume level (0-1)
   */
  setVolume(volume) {
    this.state.playback.volume = Math.max(0, Math.min(1, volume))
    this._notify()
  }

  /**
   * Update intensity level
   * @param {number} intensity - Intensity level (0-1)
   */
  setIntensity(intensity) {
    this.state.playback.intensity = Math.max(0, Math.min(1, intensity))
    this._notify()
  }

  /**
   * Subscribe to state changes
   * @param {Function} callback - Function to call on state update
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback)

    // Immediately call with current state
    callback(this.getState())

    return () => this.listeners.delete(callback)
  }

  /**
   * Notify all subscribers of state change
   * @private
   */
  _notify() {
    const stateSnapshot = this.getState()
    this.listeners.forEach(cb => {
      try {
        cb(stateSnapshot)
      } catch (error) {
        console.error('StateManager: Error in subscriber callback:', error)
      }
    })
  }

  /**
   * Calculate derived parameters from raw metrics
   * This bridges web metrics to Webarmonium's generative parameters
   * @private
   */
  recalculateParameters() {
    const m = this.state.metrics

    // Complexity: driven by Wikipedia edit rate
    // Higher edit rate = more complex algorithmic patterns
    const complexity = Math.min(m.wikipedia.editsPerMinute / 500, 1.0)

    // Rhythmic Preference: driven by HackerNews post rate
    // More posts = faster rhythmic patterns
    const rhythmicPreference = Math.min(m.hackernews.postsPerMinute / 100, 1.0)

    // Harmonic Preference: driven by GitHub commit rate
    // More commits = richer harmonies
    const harmonicPreference = Math.min(m.github.commitsPerMinute / 50, 1.0)

    // Intensity: driven by Wikipedia edit size (larger edits = more intensity)
    const intensity = Math.min(m.wikipedia.avgEditSize / 5000, 1.0)

    // Position Y: driven by HackerNews upvotes (more upvotes = higher pitch)
    const positionY = Math.min(m.hackernews.avgUpvotes / 100, 1.0)

    // Diversity: variance across all activity rates
    const rates = [
      m.wikipedia.editsPerMinute / 500,
      m.hackernews.postsPerMinute / 100,
      m.github.commitsPerMinute / 50
    ]
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length
    const variance = rates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rates.length
    const diversity = Math.min(Math.sqrt(variance) * 2, 1.0)

    this.state.parameters = {
      complexity,
      rhythmicPreference,
      harmonicPreference,
      intensity,
      position: { x: 0.5, y: positionY },
      diversity
    }
  }

  /**
   * Reset all metrics to zero
   */
  resetMetrics() {
    this.state.metrics = {
      wikipedia: { editsPerMinute: 0, newArticles: 0, avgEditSize: 0 },
      hackernews: { postsPerMinute: 0, avgUpvotes: 0, commentCount: 0 },
      github: { commitsPerMinute: 0, openPRs: 0, newStars: 0 }
    }
    this.recalculateParameters()
    this._notify()
  }

  /**
   * Get metrics for a specific source
   * @param {string} source - 'wikipedia' | 'hackernews' | 'github'
   * @returns {Object} Metrics for the source
   */
  getMetrics(source) {
    return { ...this.state.metrics[source] }
  }

  /**
   * Get all current metrics
   * @returns {Object} All metrics
   */
  getAllMetrics() {
    return {
      wikipedia: { ...this.state.metrics.wikipedia },
      hackernews: { ...this.state.metrics.hackernews },
      github: { ...this.state.metrics.github }
    }
  }

  /**
   * Get current parameters
   * @returns {Object} Current generative parameters
   */
  getParameters() {
    return {
      ...this.state.parameters,
      position: { ...this.state.parameters.position }
    }
  }

  /**
   * Check if playback is active
   * @returns {boolean}
   */
  isPlaying() {
    return this.state.playback.isPlaying
  }

  /**
   * Get current volume
   * @returns {number} Volume (0-1)
   */
  getVolume() {
    return this.state.playback.volume
  }

  /**
   * Get current intensity
   * @returns {number} Intensity (0-1)
   */
  getIntensity() {
    return this.state.playback.intensity
  }
}

// Export singleton instance
export const stateManager = new StateManager()

// Also export class for testing
export default StateManager
