/**
 * WebMetricsPoller
 * Polls external APIs for real-time web activity metrics
 *
 * Moved from frontend to backend for single API connection architecture
 *
 * Data Sources:
 * - Wikipedia RecentChanges API: Edit rate, new articles, edit size
 * - HackerNews Firebase API: Post rate, upvotes, comments
 * - GitHub Events API: Commits, PRs, stars
 *
 * Architecture:
 * - Uses polling with configurable intervals per source
 * - Maintains history buffer for rate calculations
 * - Emits events on each update cycle
 * - Respects rate limits with conservative intervals
 */

class WebMetricsPoller {
  constructor() {
    // API configuration for each source
    this.sources = {
      wikipedia: {
        url: 'https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcprop=title|type|sizes|timestamp&rclimit=50&format=json&origin=*',
        interval: 5000, // 5 seconds
        lastFetch: 0,
        history: [] // Timestamped change history
      },
      hackernews: {
        storiesUrl: 'https://hacker-news.firebaseio.com/v0/newstories.json',
        itemUrl: (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        interval: 10000, // 10 seconds
        lastFetch: 0,
        lastStoryIds: [],
        history: []
      },
      github: {
        url: 'https://api.github.com/events?per_page=100',
        interval: 60000, // 60 seconds (respects rate limit)
        lastFetch: 0,
        history: []
      }
    }

    // Service state
    this.isRunning = false
    this.intervalId = null

    // Current calculated metrics (per-minute rates)
    this.metrics = {
      wikipedia: { editsPerMinute: 0, newArticles: 0, avgEditSize: 0 },
      hackernews: { postsPerMinute: 0, avgUpvotes: 0, commentCount: 0 },
      github: { commitsPerMinute: 0, createsPerMinute: 0, deletesPerMinute: 0 }
    }

    // Metrics history for velocity/acceleration calculation (last 20 snapshots)
    this.metricsHistory = []
    this.maxHistoryLength = 20

    // Event callbacks
    this.onMetricsUpdate = null
  }

  /**
   * Start polling all sources
   */
  start() {
    if (this.isRunning) return

    this.isRunning = true
    this._poll()
    this.intervalId = setInterval(() => this._poll(), 5000)

    console.log('📊 WebMetricsPoller started')
  }

  /**
   * Stop polling all sources
   */
  stop() {
    this.isRunning = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    console.log('📊 WebMetricsPoller stopped')
  }

  /**
   * Set callback for metrics updates
   * @param {Function} callback - Function to call when metrics update
   */
  onMetricsUpdate(callback) {
    this.onMetricsUpdate = callback
  }

  /**
   * Main polling loop - checks each source based on its interval
   * @private
   */
  async _poll() {
    if (!this.isRunning) return

    const now = Date.now()

    // Poll each source if its interval has elapsed
    if (now - this.sources.wikipedia.lastFetch >= this.sources.wikipedia.interval) {
      await this._fetchWikipedia()
      this.sources.wikipedia.lastFetch = now
    }

    if (now - this.sources.hackernews.lastFetch >= this.sources.hackernews.interval) {
      await this._fetchHackerNews()
      this.sources.hackernews.lastFetch = now
    }

    if (now - this.sources.github.lastFetch >= this.sources.github.interval) {
      await this._fetchGitHub()
      this.sources.github.lastFetch = now
    }

    // Emit metrics update
    this._emitMetricsUpdate()
  }

  /**
   * Fetch Wikipedia RecentChanges
   * @private
   */
  async _fetchWikipedia() {
    try {
      const response = await fetch(this.sources.wikipedia.url)
      const data = await response.json()

      if (data.query?.recentchanges) {
        const changes = data.query.recentchanges
        const now = Date.now()
        const oneMinuteAgo = now - 60000

        // Add to history with timestamp
        const timestampedChanges = changes.map(c => ({
          ...c,
          fetchedAt: now
        }))

        this.sources.wikipedia.history.push(...timestampedChanges)

        // Clean old history (keep last 2 minutes)
        this.sources.wikipedia.history = this.sources.wikipedia.history.filter(
          c => c.fetchedAt > now - 120000
        )

        // Calculate per-minute metrics
        const recentEdits = this.sources.wikipedia.history.filter(
          c => c.fetchedAt > oneMinuteAgo && c.type === 'edit'
        )
        const recentNew = this.sources.wikipedia.history.filter(
          c => c.fetchedAt > oneMinuteAgo && c.type === 'new'
        )

        const avgSize = recentEdits.length > 0
          ? recentEdits.reduce((sum, c) => sum + (c.newlen - c.oldlen || 0), 0) / recentEdits.length
          : 0

        this.metrics.wikipedia = {
          editsPerMinute: recentEdits.length,
          newArticles: recentNew.length,
          avgEditSize: Math.abs(avgSize)
        }
      }
    } catch (error) {
      console.warn('Wikipedia fetch error:', error.message)
    }
  }

  /**
   * Fetch HackerNews new stories
   * @private
   */
  async _fetchHackerNews() {
    try {
      const storiesResponse = await fetch(this.sources.hackernews.storiesUrl)
      const storyIds = await storiesResponse.json()

      // Find new stories (not in our last list)
      const newStoryIds = storyIds.filter(
        id => !this.sources.hackernews.lastStoryIds.includes(id)
      )

      if (newStoryIds.length > 0) {
        // Fetch details for first 10 new stories
        const detailedStories = await Promise.all(
          newStoryIds.slice(0, 10).map(id =>
            fetch(this.sources.hackernews.itemUrl(id))
              .then(r => r.json())
              .catch(() => null)
          )
        )

        const validStories = detailedStories.filter(s => s && s.time)

        // Add to history
        this.sources.hackernews.history.push(
          ...validStories.map(s => ({ ...s, fetchedAt: Date.now() }))
        )

        // Clean old history (keep last 2 minutes)
        const now = Date.now()
        this.sources.hackernews.history = this.sources.hackernews.history.filter(
          s => s.fetchedAt > now - 120000
        )

        // Calculate metrics
        const oneMinuteAgo = now - 60000
        const recentPosts = this.sources.hackernews.history.filter(
          s => s.fetchedAt > oneMinuteAgo
        )

        const avgUpvotes = recentPosts.length > 0
          ? recentPosts.reduce((sum, s) => sum + (s.score || 0), 0) / recentPosts.length
          : 0

        const totalComments = recentPosts.reduce((sum, s) => sum + (s.descendants || 0), 0)

        this.metrics.hackernews = {
          postsPerMinute: recentPosts.length,
          avgUpvotes,
          commentCount: totalComments
        }
      }

      // Update last seen IDs (keep last 100)
      this.sources.hackernews.lastStoryIds = storyIds.slice(0, 100)
    } catch (error) {
      console.warn('HackerNews fetch error:', error.message)
    }
  }

  /**
   * Fetch GitHub public events
   * @private
   */
  async _fetchGitHub() {
    try {
      const response = await fetch(this.sources.github.url, {
        headers: {
          'User-Agent': 'Webarmonium-Backend',
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (!response.ok) {
        if (response.status === 403) {
          // Rate limited
          console.warn('GitHub API rate limit reached')
        }
        return
      }

      const events = await response.json()
      const now = Date.now()

      // Add to history
      this.sources.github.history.push(
        ...events.map(e => ({ ...e, fetchedAt: now }))
      )

      // Clean old history (keep last 5 minutes)
      this.sources.github.history = this.sources.github.history.filter(
        e => e.fetchedAt > now - 300000
      )

      // Calculate metrics
      const oneMinuteAgo = now - 60000
      const recentEvents = this.sources.github.history.filter(
        e => e.fetchedAt > oneMinuteAgo
      )

      const commits = recentEvents.filter(e => e.type === 'PushEvent').length
      const creates = recentEvents.filter(e => e.type === 'CreateEvent').length
      const deletes = recentEvents.filter(e => e.type === 'DeleteEvent').length

      this.metrics.github = {
        commitsPerMinute: commits,
        createsPerMinute: creates,
        deletesPerMinute: deletes
      }
    } catch (error) {
      console.warn('GitHub fetch error:', error.message)
    }
  }

  /**
   * Emit metrics update event with velocity/acceleration
   * @private
   */
  _emitMetricsUpdate() {
    if (this.onMetricsUpdate) {
      const now = Date.now()

      // Calculate velocity and acceleration from history
      const enrichedMetrics = this._calculateVelocityAndAcceleration(this.metrics)

      // Store enriched metrics in history (velocity/acceleration are part of each source)
      const historyEntry = {
        timestamp: now,
        wikipedia: { ...enrichedMetrics.wikipedia },
        hackernews: { ...enrichedMetrics.hackernews },
        github: { ...enrichedMetrics.github }
      }

      this.metricsHistory.unshift(historyEntry)

      // Keep only last maxHistoryLength entries
      if (this.metricsHistory.length > this.maxHistoryLength) {
        this.metricsHistory = this.metricsHistory.slice(0, this.maxHistoryLength)
      }

      const metricsSnapshot = {
        wikipedia: { ...enrichedMetrics.wikipedia },
        hackernews: { ...enrichedMetrics.hackernews },
        github: { ...enrichedMetrics.github }
      }

      console.log('📊 Metrics update:', {
        wikipedia: `${metricsSnapshot.wikipedia.editsPerMinute} edits/min (vel: ${metricsSnapshot.wikipedia.velocity?.toFixed(2)})`,
        hackernews: `${metricsSnapshot.hackernews.postsPerMinute} posts/min (vel: ${metricsSnapshot.hackernews.velocity?.toFixed(2)})`,
        github: `${metricsSnapshot.github.commitsPerMinute} commits/min (vel: ${metricsSnapshot.github.velocity?.toFixed(2)})`
      })

      this.onMetricsUpdate(metricsSnapshot)
    }
  }

  /**
   * Calculate velocity and acceleration for all metrics
   * @param {Object} currentMetrics - Current metrics snapshot
   * @returns {Object} Enriched metrics with velocity/acceleration
   * @private
   */
  _calculateVelocityAndAcceleration(currentMetrics) {
    const enriched = {
      wikipedia: { ...currentMetrics.wikipedia },
      hackernews: { ...currentMetrics.hackernews },
      github: { ...currentMetrics.github }
    }

    // Calculate velocity (rate of change) from previous snapshot
    if (this.metricsHistory.length > 0) {
      const previous = this.metricsHistory[0]

      // Wikipedia velocity
      enriched.wikipedia.velocity = currentMetrics.wikipedia.editsPerMinute - previous.wikipedia.editsPerMinute

      // HackerNews velocity
      enriched.hackernews.velocity = currentMetrics.hackernews.postsPerMinute - previous.hackernews.postsPerMinute

      // GitHub velocity
      enriched.github.velocity = currentMetrics.github.commitsPerMinute - previous.github.commitsPerMinute

      // Calculate acceleration (velocity change) if we have 2+ snapshots
      if (this.metricsHistory.length > 1) {
        const previousVelocity = this.metricsHistory[1]

        enriched.wikipedia.acceleration = enriched.wikipedia.velocity - previousVelocity.wikipedia.velocity
        enriched.hackernews.acceleration = enriched.hackernews.velocity - previousVelocity.hackernews.velocity
        enriched.github.acceleration = enriched.github.velocity - previousVelocity.github.velocity
      } else {
        enriched.wikipedia.acceleration = 0
        enriched.hackernews.acceleration = 0
        enriched.github.acceleration = 0
      }
    } else {
      // No history yet
      enriched.wikipedia.velocity = 0
      enriched.hackernews.velocity = 0
      enriched.github.velocity = 0
      enriched.wikipedia.acceleration = 0
      enriched.hackernews.acceleration = 0
      enriched.github.acceleration = 0
    }

    return enriched
  }

  /**
   * Get current metrics snapshot
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      wikipedia: { ...this.metrics.wikipedia },
      hackernews: { ...this.metrics.hackernews },
      github: { ...this.metrics.github }
    }
  }

  /**
   * Get metrics history for velocity/acceleration analysis
   * @returns {Array} History entries with timestamp and enriched metrics
   */
  getMetricsHistory() {
    return this.metricsHistory
  }

  /**
   * Get velocity for a specific source
   * @param {string} source - 'wikipedia', 'hackernews', or 'github'
   * @returns {number} Current velocity value
   */
  getVelocity(source) {
    if (this.metricsHistory.length > 0) {
      const latest = this.metricsHistory[0]
      return latest[source]?.velocity || 0
    }
    return 0
  }

  /**
   * Get acceleration for a specific source
   * @param {string} source - 'wikipedia', 'hackernews', or 'github'
   * @returns {number} Current acceleration value
   */
  getAcceleration(source) {
    if (this.metricsHistory.length > 0) {
      const latest = this.metricsHistory[0]
      return latest[source]?.acceleration || 0
    }
    return 0
  }
}

module.exports = WebMetricsPoller
