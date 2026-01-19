/**
 * MetricsCollectorService
 * Polls external APIs for real-time web activity metrics
 *
 * Data Sources:
 * - Wikipedia RecentChanges API: Edit rate, new articles, edit size
 * - HackerNews Firebase API: Post rate, upvotes, comments
 * - GitHub Events API: Commits, PRs, stars
 *
 * Architecture:
 * - Uses polling with configurable intervals per source
 * - Maintains history buffer for rate calculations
 * - Emits CustomEvent on each update cycle
 * - Respects rate limits with conservative intervals
 */

export class MetricsCollectorService {
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
        url: 'https://api.github.com/events?per_page=30',
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
      github: { commitsPerMinute: 0, openPRs: 0, newStars: 0 }
    }

    // Mock mode for testing
    this.mockMode = false
    this.mockGenerator = null
  }

  /**
   * Start polling all sources
   */
  start() {
    if (this.isRunning) return

    this.isRunning = true

    if (this.mockMode) {
      this._startMockMode()
    } else {
      this._poll()
      this.intervalId = setInterval(() => this._poll(), 5000)
    }

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

    if (this.mockIntervalId) {
      clearInterval(this.mockIntervalId)
      this.mockIntervalId = null
    }

  }

  /**
   * Enable mock mode for testing
   * @param {Object} generator - MockMetricsGenerator instance
   */
  enableMockMode(generator) {
    this.mockMode = true
    this.mockGenerator = generator
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

    // Emit metrics update event
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
          'User-Agent': 'Webarmonium-Landing-Page',
          'Accept': 'application/vnd.github.v3+json'
        }
      })

      if (!response.ok) {
        if (response.status === 403) {
          // Rate limited
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
      const prs = recentEvents.filter(e => e.type === 'PullRequestEvent').length
      const stars = recentEvents.filter(e => e.type === 'WatchEvent').length

      this.metrics.github = {
        commitsPerMinute: commits,
        openPRs: prs,
        newStars: stars
      }
    } catch (error) {
    }
  }

  /**
   * Start mock mode for testing
   * @private
   */
  _startMockMode() {
    this.mockIntervalId = setInterval(() => {
      if (this.mockGenerator) {
        this.metrics = this.mockGenerator.generate()
        this._emitMetricsUpdate()
      }
    }, 2000)
  }

  /**
   * Emit metrics update event
   * @private
   */
  _emitMetricsUpdate() {
    const event = new CustomEvent('metrics:updated', {
      detail: { ...this.metrics }
    })
    window.dispatchEvent(event)
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
}

/**
 * MockMetricsGenerator
 * Generates realistic mock metrics for testing without API calls
 */
export class MockMetricsGenerator {
  constructor() {
    this.baseMetrics = {
      wikipedia: { editsPerMinute: 342, newArticles: 15, avgEditSize: 500 },
      hackernews: { postsPerMinute: 45, avgUpvotes: 25, commentCount: 150 },
      github: { commitsPerMinute: 123, openPRs: 8, newStars: 12 }
    }
  }

  /**
   * Generate metrics with natural fluctuation
   * @returns {Object} Mock metrics
   */
  generate() {
    return {
      wikipedia: {
        editsPerMinute: Math.max(0, this.baseMetrics.wikipedia.editsPerMinute +
          (Math.random() - 0.5) * 100),
        newArticles: Math.max(0, this.baseMetrics.wikipedia.newArticles +
          Math.floor((Math.random() - 0.5) * 10)),
        avgEditSize: Math.max(0, this.baseMetrics.wikipedia.avgEditSize +
          (Math.random() - 0.5) * 200)
      },
      hackernews: {
        postsPerMinute: Math.max(0, this.baseMetrics.hackernews.postsPerMinute +
          (Math.random() - 0.5) * 20),
        avgUpvotes: Math.max(0, this.baseMetrics.hackernews.avgUpvotes +
          (Math.random() - 0.5) * 10),
        commentCount: Math.max(0, this.baseMetrics.hackernews.commentCount +
          Math.floor((Math.random() - 0.5) * 50))
      },
      github: {
        commitsPerMinute: Math.max(0, this.baseMetrics.github.commitsPerMinute +
          (Math.random() - 0.5) * 40),
        openPRs: Math.max(0, this.baseMetrics.github.openPRs +
          Math.floor((Math.random() - 0.5) * 5)),
        newStars: Math.max(0, this.baseMetrics.github.newStars +
          Math.floor((Math.random() - 0.5) * 8))
      }
    }
  }
}

export default MetricsCollectorService
