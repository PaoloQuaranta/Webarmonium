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

    // Activity history for source ranking (timestamps of significant activity)
    // Used by VirtualUserService to select the 2 most active sources
    this.activityHistory = {
      wikipedia: [],
      hackernews: [],
      github: []
    }
    this.activityWindowMs = 5 * 60 * 1000 // 5 minutes
    this.activityThreshold = 0.1 // Minimum normalized velocity to count as activity

    // Event callbacks
    this.onMetricsUpdate = null

    // ConnectionTracker reference for inactivity detection
    this.connectionTracker = null

    // GitHub rate limit backoff
    this.githubBackoff = {
      active: false,
      currentDelay: 60000,    // Start at normal (60s)
      maxDelay: 3600000,      // Max 1 hour between attempts
      multiplier: 2,
      lastAttempt: 0,
      consecutiveFailures: 0
    }

    // Inactivity backoff (after 30 min of no user activity)
    this.inactivityBackoff = {
      threshold: 30 * 60 * 1000,  // 30 minutes
      currentMultiplier: 1,
      maxMultiplier: 12           // Wikipedia 5s->60s, GitHub 60s->720s
    }
  }

  /**
   * Set ConnectionTracker for inactivity detection
   * @param {ConnectionTracker} tracker - ConnectionTracker instance
   */
  setConnectionTracker (tracker) {
    this.connectionTracker = tracker
  }

  /**
   * Start polling all sources
   */
  start() {
    if (this.isRunning) return

    this.isRunning = true
    this._poll()
    this.intervalId = setInterval(() => this._poll(), 5000)

    // console.log('📊 WebMetricsPoller started')
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

    // console.log('📊 WebMetricsPoller stopped')
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

    // Calculate inactivity backoff multiplier
    this._updateInactivityMultiplier(now)
    const multiplier = this.inactivityBackoff.currentMultiplier

    // Poll each source if its adjusted interval has elapsed
    if (now - this.sources.wikipedia.lastFetch >= this.sources.wikipedia.interval * multiplier) {
      await this._fetchWikipedia()
      this.sources.wikipedia.lastFetch = now
    }

    if (now - this.sources.hackernews.lastFetch >= this.sources.hackernews.interval * multiplier) {
      await this._fetchHackerNews()
      this.sources.hackernews.lastFetch = now
    }

    // GitHub uses its own backoff logic (rate limit aware)
    const githubInterval = this._getGitHubInterval() * multiplier
    if (now - this.sources.github.lastFetch >= githubInterval) {
      await this._fetchGitHub()
      this.sources.github.lastFetch = now
    }

    // Emit metrics update
    this._emitMetricsUpdate()
  }

  /**
   * Update inactivity backoff multiplier based on user activity
   * @param {number} now - Current timestamp
   * @private
   */
  _updateInactivityMultiplier(now) {
    if (!this.connectionTracker) {
      this.inactivityBackoff.currentMultiplier = 1
      return
    }

    const lastActivity = this.connectionTracker.getLastActivityTime()
    const inactivityDuration = now - lastActivity

    if (inactivityDuration > this.inactivityBackoff.threshold) {
      // Calculate multiplier: doubles every 30 min of inactivity
      const periods = Math.floor(inactivityDuration / this.inactivityBackoff.threshold)

      // CRITICAL: Ensure periods >= 1 to prevent 2^(-1) = 0.5 edge case
      // Formula: period 1 (30-60min) = 1x, period 2 (60-90min) = 2x, etc.
      const safePeriods = Math.max(1, periods)
      this.inactivityBackoff.currentMultiplier = Math.min(
        Math.max(1, Math.pow(2, safePeriods - 1)), // Ensure multiplier >= 1
        this.inactivityBackoff.maxMultiplier
      )
    } else {
      this.inactivityBackoff.currentMultiplier = 1
    }
  }

  /**
   * Get GitHub polling interval (rate limit aware)
   * @returns {number} Interval in milliseconds
   * @private
   */
  _getGitHubInterval() {
    if (this.githubBackoff.active) {
      return this.githubBackoff.currentDelay
    }
    return this.sources.github.interval
  }

  /**
   * Fetch Wikipedia RecentChanges
   * @private
   */
  async _fetchWikipedia() {
    try {
      const response = await fetch(this.sources.wikipedia.url)

      if (!response.ok) {
        console.warn(`Wikipedia fetch error: HTTP ${response.status}`)
        return
      }

      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`Wikipedia fetch error: unexpected content-type ${contentType}`)
        return
      }

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

      if (!storiesResponse.ok) {
        console.warn(`HackerNews fetch error: HTTP ${storiesResponse.status}`)
        return
      }

      const storyIds = await storiesResponse.json()

      if (!Array.isArray(storyIds)) {
        console.warn('HackerNews fetch error: unexpected response format')
        return
      }

      // Find new stories (not in our last list)
      const newStoryIds = storyIds.filter(
        id => !this.sources.hackernews.lastStoryIds.includes(id)
      )

      if (newStoryIds.length > 0) {
        // Fetch details for first 10 new stories
        const detailedStories = await Promise.all(
          newStoryIds.slice(0, 10).map(id =>
            fetch(this.sources.hackernews.itemUrl(id))
              .then(r => r.ok ? r.json() : null)
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
    this.githubBackoff.lastAttempt = Date.now()

    try {
      const response = await fetch(this.sources.github.url, {
        headers: {
          'User-Agent': 'Webarmonium-Backend',
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (!response.ok) {
        if (response.status === 403) {
          this._handleGitHubRateLimit(response)
        } else if (response.status >= 500) {
          // Server errors also trigger backoff (but less aggressively than rate limits)
          this.githubBackoff.consecutiveFailures++
          if (this.githubBackoff.consecutiveFailures >= 3) {
            this.githubBackoff.active = true
            this.githubBackoff.currentDelay = Math.min(
              this.githubBackoff.currentDelay * this.githubBackoff.multiplier,
              this.githubBackoff.maxDelay
            )
            console.warn(`GitHub server error (${response.status}): backing off for ${Math.round(this.githubBackoff.currentDelay / 1000)}s`)
          }
        }
        return
      }

      // Success - reset backoff (resets consecutiveFailures for both rate limit and network errors)
      this._resetGitHubBackoff()

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
      // Network errors also trigger backoff
      this.githubBackoff.consecutiveFailures++
      if (this.githubBackoff.consecutiveFailures >= 3) {
        this.githubBackoff.active = true
        this.githubBackoff.currentDelay = Math.min(
          this.githubBackoff.currentDelay * this.githubBackoff.multiplier,
          this.githubBackoff.maxDelay
        )
      }
    }
  }

  /**
   * Handle GitHub rate limit response
   * @param {Response} response - Fetch response
   * @private
   */
  _handleGitHubRateLimit(response) {
    this.githubBackoff.active = true
    this.githubBackoff.consecutiveFailures++

    // Try to get precise reset time from headers
    const resetHeader = response.headers.get('X-RateLimit-Reset')
    if (resetHeader) {
      const resetTimestamp = parseInt(resetHeader, 10)

      // CRITICAL: Validate resetTimestamp to prevent integer overflow
      // Unix timestamps should be reasonable (between 2020 and 2100)
      const MIN_VALID_TIMESTAMP = 1577836800 // 2020-01-01
      const MAX_VALID_TIMESTAMP = 4102444800 // 2100-01-01

      if (!isNaN(resetTimestamp) && resetTimestamp >= MIN_VALID_TIMESTAMP && resetTimestamp <= MAX_VALID_TIMESTAMP) {
        const resetTime = resetTimestamp * 1000 // Convert to ms
        const waitTime = resetTime - Date.now()

        // Only use header value if wait time is positive and reasonable (< 2 hours)
        if (waitTime > 0 && waitTime < 7200000) {
          this.githubBackoff.currentDelay = Math.min(waitTime + 5000, this.githubBackoff.maxDelay) // +5s buffer
          console.warn(`GitHub rate limit: waiting until reset (${Math.round(waitTime / 1000)}s)`)
          return
        }
      } else {
        console.warn(`GitHub rate limit: invalid X-RateLimit-Reset header value: ${resetHeader}`)
      }
    }

    // Exponential backoff fallback
    this.githubBackoff.currentDelay = Math.min(
      this.githubBackoff.currentDelay * this.githubBackoff.multiplier,
      this.githubBackoff.maxDelay
    )
    console.warn(`GitHub rate limit: backing off for ${Math.round(this.githubBackoff.currentDelay / 1000)}s`)
  }

  /**
   * Reset GitHub backoff after successful request
   * @private
   */
  _resetGitHubBackoff() {
    this.githubBackoff.active = false
    this.githubBackoff.currentDelay = this.sources.github.interval
    this.githubBackoff.consecutiveFailures = 0
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

      // Track activity for source ranking
      this._trackActivity(enrichedMetrics, now)

      const metricsSnapshot = {
        wikipedia: { ...enrichedMetrics.wikipedia },
        hackernews: { ...enrichedMetrics.hackernews },
        github: { ...enrichedMetrics.github }
      }

      // console.log('📊 Metrics update:', {
      //   wikipedia: `${metricsSnapshot.wikipedia.editsPerMinute} edits/min (vel: ${metricsSnapshot.wikipedia.velocity?.toFixed(2)})`,
      //   hackernews: `${metricsSnapshot.hackernews.postsPerMinute} posts/min (vel: ${metricsSnapshot.hackernews.velocity?.toFixed(2)})`,
      //   github: `${metricsSnapshot.github.commitsPerMinute} commits/min (vel: ${metricsSnapshot.github.velocity?.toFixed(2)})`
      // })

      this.onMetricsUpdate(metricsSnapshot)
    }
  }

  /**
   * Track activity events for source ranking
   * Records timestamps when sources show significant activity
   * @param {Object} enrichedMetrics - Metrics with velocity
   * @param {number} now - Current timestamp
   * @private
   */
  _trackActivity(enrichedMetrics, now) {
    // Memory limit: max entries per source (prevents unbounded growth)
    const MAX_ACTIVITY_ENTRIES = 200

    // Prune old activity records (older than 10 minutes for safety margin)
    const pruneTime = now - 10 * 60 * 1000
    for (const source of Object.keys(this.activityHistory)) {
      this.activityHistory[source] = this.activityHistory[source].filter(t => t > pruneTime)

      // Hard limit: if still over limit after time-based pruning, remove oldest entries
      while (this.activityHistory[source].length > MAX_ACTIVITY_ENTRIES) {
        this.activityHistory[source].shift()
      }
    }

    // Record activity based on velocity (any non-zero activity counts)
    // We use raw metrics values since velocity can be negative
    if (this.metrics.wikipedia.editsPerMinute > 0) {
      this.activityHistory.wikipedia.push(now)
    }
    if (this.metrics.hackernews.postsPerMinute > 0) {
      this.activityHistory.hackernews.push(now)
    }
    if (this.metrics.github.commitsPerMinute > 0) {
      this.activityHistory.github.push(now)
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

  /**
   * Get activity history for source ranking
   * @returns {Object} Activity history with timestamps per source
   */
  getActivityHistory() {
    return {
      wikipedia: [...this.activityHistory.wikipedia],
      hackernews: [...this.activityHistory.hackernews],
      github: [...this.activityHistory.github]
    }
  }

  /**
   * Get the 2 most active sources in the last 5 minutes
   * Used by VirtualUserService to select which virtual users to activate
   * @returns {string[]} Array of 2 source names, sorted by activity (most active first)
   */
  getMostActiveSources() {
    const now = Date.now()
    const windowStart = now - this.activityWindowMs

    // Count activity events in the window for each source
    const sourceScores = Object.entries(this.activityHistory).map(([source, history]) => {
      const recentActivity = history.filter(t => t > windowStart).length
      return { source, score: recentActivity }
    })

    // Sort by score descending and return top 2
    sourceScores.sort((a, b) => b.score - a.score)

    // If scores are tied or zero, use a default order based on typical activity
    if (sourceScores[0].score === 0) {
      // No activity recorded yet, use default order
      return ['wikipedia', 'hackernews']
    }

    return sourceScores.slice(0, 2).map(s => s.source)
  }
}

module.exports = WebMetricsPoller
