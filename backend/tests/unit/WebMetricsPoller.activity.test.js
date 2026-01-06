/**
 * Unit Test: WebMetricsPoller Activity Tracking
 * Tests getMostActiveSources() and activity history management
 */

const WebMetricsPoller = require('../../src/services/WebMetricsPoller')

describe('WebMetricsPoller - Activity Tracking', () => {
  let poller

  beforeEach(() => {
    poller = new WebMetricsPoller()
  })

  afterEach(() => {
    poller.stop()
  })

  describe('Activity History Initialization', () => {
    test('should initialize with empty activity history', () => {
      expect(poller.activityHistory).toHaveProperty('wikipedia')
      expect(poller.activityHistory).toHaveProperty('hackernews')
      expect(poller.activityHistory).toHaveProperty('github')

      expect(poller.activityHistory.wikipedia).toEqual([])
      expect(poller.activityHistory.hackernews).toEqual([])
      expect(poller.activityHistory.github).toEqual([])
    })

    test('should have 5-minute activity window', () => {
      expect(poller.activityWindowMs).toBe(5 * 60 * 1000) // 300000ms
    })
  })

  describe('getMostActiveSources()', () => {
    test('should return default sources when no activity recorded', () => {
      const sources = poller.getMostActiveSources()

      expect(sources).toEqual(['wikipedia', 'hackernews'])
    })

    test('should return top 2 sources by activity count', () => {
      const now = Date.now()

      // Add activity events (more recent = within window)
      poller.activityHistory.wikipedia = [now - 1000, now - 2000] // 2 events
      poller.activityHistory.hackernews = [now - 1000] // 1 event
      poller.activityHistory.github = [now - 1000, now - 2000, now - 3000] // 3 events

      const sources = poller.getMostActiveSources()

      expect(sources[0]).toBe('github') // 3 events
      expect(sources[1]).toBe('wikipedia') // 2 events
    })

    test('should only count activity within 5-minute window', () => {
      const now = Date.now()
      const sixMinutesAgo = now - 6 * 60 * 1000

      // Add old activity outside window
      poller.activityHistory.wikipedia = [sixMinutesAgo, sixMinutesAgo - 1000]
      // Add recent activity within window
      poller.activityHistory.hackernews = [now - 1000]
      poller.activityHistory.github = [now - 1000, now - 2000]

      const sources = poller.getMostActiveSources()

      // Wikipedia has 0 recent, hackernews has 1, github has 2
      expect(sources[0]).toBe('github')
      expect(sources[1]).toBe('hackernews')
    })

    test('should return default order when all scores are zero', () => {
      // Empty history means all zeros
      const sources = poller.getMostActiveSources()

      expect(sources).toEqual(['wikipedia', 'hackernews'])
    })

    test('should handle mixed old and new activity', () => {
      const now = Date.now()
      const oneMinuteAgo = now - 60 * 1000
      const tenMinutesAgo = now - 10 * 60 * 1000

      poller.activityHistory.wikipedia = [
        oneMinuteAgo,
        tenMinutesAgo, // outside window
        tenMinutesAgo
      ]
      poller.activityHistory.hackernews = [
        oneMinuteAgo,
        oneMinuteAgo,
        tenMinutesAgo
      ]
      poller.activityHistory.github = [oneMinuteAgo]

      const sources = poller.getMostActiveSources()

      // hackernews: 2 recent, wikipedia: 1 recent, github: 1 recent
      expect(sources[0]).toBe('hackernews')
      // wikipedia and github tied at 1, but order depends on original object order
      expect(sources[1]).toBe('wikipedia')
    })

    test('should always return exactly 2 sources', () => {
      const now = Date.now()

      // Only one source has activity
      poller.activityHistory.github = [now - 1000, now - 2000, now - 3000]

      const sources = poller.getMostActiveSources()

      expect(sources).toHaveLength(2)
    })
  })

  describe('Activity Recording (Integration with Velocity)', () => {
    test('getVelocity should be available', () => {
      expect(typeof poller.getVelocity).toBe('function')
    })

    test('getAcceleration should be available', () => {
      expect(typeof poller.getAcceleration).toBe('function')
    })
  })

  describe('Edge Cases', () => {
    test('should throw when activity history is corrupted (null)', () => {
      // Manually corrupt activity history
      poller.activityHistory.wikipedia = null

      // Current implementation throws - this documents expected behavior
      // In production, activityHistory is always properly initialized
      expect(() => {
        poller.getMostActiveSources()
      }).toThrow()
    })

    test('should handle Date edge cases at window boundary', () => {
      const now = Date.now()
      const exactlyFiveMinutesAgo = now - 5 * 60 * 1000

      // Event exactly at boundary
      poller.activityHistory.wikipedia = [exactlyFiveMinutesAgo]
      poller.activityHistory.hackernews = [exactlyFiveMinutesAgo + 1] // Just inside

      const sources = poller.getMostActiveSources()

      // wikipedia should be excluded (>=), hackernews included
      expect(sources[0]).toBe('hackernews')
    })
  })
})
