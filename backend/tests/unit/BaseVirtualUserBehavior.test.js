/**
 * Unit Test: BaseVirtualUserBehavior
 * Tests shared virtual user behavior for landing and normal rooms
 *
 * Key test areas:
 * - Statistics management (per-context isolation)
 * - Percentile-based normalization (P10-P90)
 * - Activity level calculation with source-specific floors
 * - Hybrid position calculation
 * - PHI-based duration category selection
 * - Context isolation (landing vs rooms don't interfere)
 */

const BaseVirtualUserBehavior = require('../../src/services/BaseVirtualUserBehavior')
const { VIRTUAL_USER_CONFIGS, SOURCE_BALANCING, GESTURE_CONFIG } = require('../../src/constants/virtualUserConfig')

describe('BaseVirtualUserBehavior', () => {
  let behavior
  let mockWebMetricsPoller

  beforeEach(() => {
    mockWebMetricsPoller = {
      getMetrics: jest.fn(() => ({
        wikipedia: {
          editsPerMinute: 50,
          avgEditSize: 500,
          newArticles: 2
        },
        hackernews: {
          postsPerMinute: 10,
          avgUpvotes: 100,
          commentCount: 50
        },
        github: {
          commitsPerMinute: 5,
          createsPerMinute: 2,
          deletesPerMinute: 1
        }
      })),
      getVelocity: jest.fn((source) => {
        const velocities = { wikipedia: 2.5, hackernews: 1.0, github: 0.5 }
        return velocities[source] || 0
      }),
      getAcceleration: jest.fn(() => 0.1)
    }

    behavior = new BaseVirtualUserBehavior({
      context: 'test-room',
      sources: ['wikipedia', 'hackernews'],
      balancingProfile: 'rooms',
      webMetricsPoller: mockWebMetricsPoller
    })
  })

  describe('Construction', () => {
    test('should initialize with default values', () => {
      const defaultBehavior = new BaseVirtualUserBehavior()

      expect(defaultBehavior.context).toBe('default')
      expect(defaultBehavior.sources).toEqual(['wikipedia', 'hackernews'])
      expect(defaultBehavior.balancingProfile).toBe('rooms')
    })

    test('should accept custom context and sources', () => {
      const landingBehavior = new BaseVirtualUserBehavior({
        context: 'landing',
        sources: ['wikipedia', 'hackernews', 'github'],
        balancingProfile: 'landing'
      })

      expect(landingBehavior.context).toBe('landing')
      expect(landingBehavior.sources).toEqual(['wikipedia', 'hackernews', 'github'])
      expect(landingBehavior.balancingProfile).toBe('landing')
    })

    test('should use correct balancing profile for landing', () => {
      const landingBehavior = new BaseVirtualUserBehavior({
        balancingProfile: 'landing'
      })

      expect(landingBehavior.sourceBalancing).toBe(SOURCE_BALANCING.landing)
      expect(landingBehavior.gestureConfig).toBe(GESTURE_CONFIG.landing)
    })

    test('should use correct balancing profile for rooms', () => {
      const roomsBehavior = new BaseVirtualUserBehavior({
        balancingProfile: 'rooms'
      })

      expect(roomsBehavior.sourceBalancing).toBe(SOURCE_BALANCING.rooms)
      expect(roomsBehavior.gestureConfig).toBe(GESTURE_CONFIG.rooms)
    })

    test('should have virtual user configs for all sources', () => {
      expect(behavior.virtualUserConfigs).toHaveProperty('wikipedia')
      expect(behavior.virtualUserConfigs).toHaveProperty('hackernews')
      expect(behavior.virtualUserConfigs).toHaveProperty('github')
    })
  })

  describe('Statistics Management', () => {
    test('updateStatistics should add samples to history', () => {
      behavior.updateStatistics('wikipedia', 'editsPerMinute', 10)
      behavior.updateStatistics('wikipedia', 'editsPerMinute', 20)
      behavior.updateStatistics('wikipedia', 'editsPerMinute', 30)

      const stats = behavior.metricStatistics.wikipedia.editsPerMinute
      expect(stats.samples).toEqual([10, 20, 30])
      expect(stats.min).toBe(10)
      expect(stats.max).toBe(30)
    })

    test('updateStatistics should limit samples to maxSamples', () => {
      const maxSamples = behavior.maxSamples

      // Add more samples than maxSamples
      for (let i = 0; i < maxSamples + 50; i++) {
        behavior.updateStatistics('wikipedia', 'editsPerMinute', i)
      }

      const stats = behavior.metricStatistics.wikipedia.editsPerMinute
      expect(stats.samples.length).toBe(maxSamples)
      // Should keep the last maxSamples
      expect(stats.samples[0]).toBe(50)
    })

    test('resetStatistics should clear all samples', () => {
      behavior.updateStatistics('wikipedia', 'editsPerMinute', 100)
      behavior.updateStatistics('hackernews', 'postsPerMinute', 50)

      behavior.resetStatistics()

      expect(behavior.metricStatistics.wikipedia.editsPerMinute.samples).toEqual([])
      expect(behavior.metricStatistics.hackernews.postsPerMinute.samples).toEqual([])
    })
  })

  describe('Normalization', () => {
    test('normalizeValue should return 0.5 during warm-up period', () => {
      // No samples yet
      const result = behavior.normalizeValue('wikipedia', 'editsPerMinute', 50)
      expect(result).toBe(0.5)
    })

    test('normalizeValue should use min/max during early warm-up', () => {
      // Add a few samples (less than warmup threshold but more than 0)
      behavior.updateStatistics('wikipedia', 'editsPerMinute', 10)
      behavior.updateStatistics('wikipedia', 'editsPerMinute', 100)

      // Value at min should be 0
      expect(behavior.normalizeValue('wikipedia', 'editsPerMinute', 10)).toBe(0)
      // Value at max should be 1
      expect(behavior.normalizeValue('wikipedia', 'editsPerMinute', 100)).toBe(1)
      // Value in middle should be 0.5
      expect(behavior.normalizeValue('wikipedia', 'editsPerMinute', 55)).toBeCloseTo(0.5, 1)
    })

    test('normalizeValue should use P10-P90 after warm-up', () => {
      // Add enough samples for percentile calculation
      for (let i = 0; i < 20; i++) {
        behavior.updateStatistics('wikipedia', 'editsPerMinute', i * 10) // 0-190
      }

      // After warm-up, P10 ≈ 10-20, P90 ≈ 170-180
      const result = behavior.normalizeValue('wikipedia', 'editsPerMinute', 100)
      expect(result).toBeGreaterThan(0)
      expect(result).toBeLessThan(1)
    })

    test('normalizeValue should clamp to [0, 1]', () => {
      for (let i = 0; i < 20; i++) {
        behavior.updateStatistics('wikipedia', 'editsPerMinute', 50 + i)
      }

      // Very low value should be clamped to 0
      expect(behavior.normalizeValue('wikipedia', 'editsPerMinute', 0)).toBe(0)
      // Very high value should be clamped to 1
      expect(behavior.normalizeValue('wikipedia', 'editsPerMinute', 1000)).toBe(1)
    })
  })

  describe('Activity Level Calculation', () => {
    test('calculateActivityLevel should use webMetricsPoller', () => {
      const activity = behavior.calculateActivityLevel('wikipedia')

      expect(mockWebMetricsPoller.getMetrics).toHaveBeenCalled()
      expect(activity).toBeGreaterThanOrEqual(0)
      expect(activity).toBeLessThanOrEqual(1)
    })

    test('calculateActivityLevel should return 0.5 without metrics', () => {
      behavior.webMetricsPoller = null
      const activity = behavior.calculateActivityLevel('wikipedia')
      expect(activity).toBe(0.5)
    })

    test('calculateActivityLevel should apply source-specific floor', () => {
      // Set up mock to return very low activity
      mockWebMetricsPoller.getMetrics.mockReturnValue({
        wikipedia: { editsPerMinute: 0.001 },
        hackernews: { postsPerMinute: 0.001 },
        github: { commitsPerMinute: 0.001 }
      })

      const activity = behavior.calculateActivityLevel('wikipedia')
      const floor = behavior.sourceBalancing.wikipedia.activityFloor

      // Activity should never be below floor
      expect(activity).toBeGreaterThanOrEqual(floor)
    })

    test('calculateActivityLevel should work for all sources', () => {
      const sources = ['wikipedia', 'hackernews', 'github']

      for (const source of sources) {
        const activity = behavior.calculateActivityLevel(source)
        expect(activity).toBeGreaterThanOrEqual(0)
        expect(activity).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('Stability & Density Metrics', () => {
    test('calculateStabilityMetric should inverse normalize velocity', () => {
      // First, populate statistics to pass warm-up period (need 10+ samples)
      // Add varied velocity samples to establish a range
      const velocities = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      velocities.forEach(v => {
        mockWebMetricsPoller.getVelocity.mockReturnValue(v)
        behavior.calculateStabilityMetric('wikipedia')
      })

      // Now test: High velocity = low stability
      mockWebMetricsPoller.getVelocity.mockReturnValue(11) // Near max
      const lowStability = behavior.calculateStabilityMetric('wikipedia')

      // Low velocity = high stability
      mockWebMetricsPoller.getVelocity.mockReturnValue(2) // Near min
      const highStability = behavior.calculateStabilityMetric('wikipedia')

      // Stability is inverse of normalized velocity
      expect(highStability).toBeGreaterThan(lowStability)
    })

    test('calculateDensityMetric should use source-specific metrics', () => {
      const wikiDensity = behavior.calculateDensityMetric('wikipedia')
      const hnDensity = behavior.calculateDensityMetric('hackernews')
      const ghDensity = behavior.calculateDensityMetric('github')

      // All should be valid numbers in [0, 1]
      expect(wikiDensity).toBeGreaterThanOrEqual(0)
      expect(wikiDensity).toBeLessThanOrEqual(1)
      expect(hnDensity).toBeGreaterThanOrEqual(0)
      expect(hnDensity).toBeLessThanOrEqual(1)
      expect(ghDensity).toBeGreaterThanOrEqual(0)
      expect(ghDensity).toBeLessThanOrEqual(1)
    })
  })

  describe('Hybrid Position Calculation', () => {
    test('calculateHybridPosition should return valid position', () => {
      const pos = behavior.calculateHybridPosition('wikipedia', 150)

      expect(pos).toHaveProperty('x')
      expect(pos).toHaveProperty('y')
      expect(pos.x).toBeGreaterThanOrEqual(0.05)
      expect(pos.x).toBeLessThanOrEqual(0.95)
      expect(pos.y).toBeGreaterThanOrEqual(0.05)
      expect(pos.y).toBeLessThanOrEqual(0.95)
    })

    test('calculateHybridPosition should return initial position for invalid frequency', () => {
      const posNaN = behavior.calculateHybridPosition('wikipedia', NaN)
      const posNegative = behavior.calculateHybridPosition('wikipedia', -100)

      expect(posNaN).toEqual(behavior.initialPositions.wikipedia)
      expect(posNegative).toEqual(behavior.initialPositions.wikipedia)
    })

    test('calculateHybridPosition should vary with gesture counter', () => {
      const pos1 = behavior.calculateHybridPosition('wikipedia', 150, 0)
      behavior.incrementGestureCounter('wikipedia')
      const pos2 = behavior.calculateHybridPosition('wikipedia', 150, 0)

      // Position should change due to gesture counter increment
      expect(pos1.x).not.toBe(pos2.x)
    })

    test('calculateHybridPosition Y should inversely correlate with frequency', () => {
      // Higher frequency = lower Y (top of screen)
      const posLowFreq = behavior.calculateHybridPosition('wikipedia', 110)  // min freq
      const posHighFreq = behavior.calculateHybridPosition('wikipedia', 220) // max freq

      // High frequency should have lower Y (toward top)
      expect(posHighFreq.y).toBeLessThan(posLowFreq.y)
    })
  })

  describe('Duration Category Selection', () => {
    test('selectDurationCategory should return valid category', () => {
      const result = behavior.selectDurationCategory('wikipedia')

      expect(result).toHaveProperty('category')
      expect(result).toHaveProperty('durationRange')
      expect(['tap', 'short', 'medium', 'long']).toContain(result.category)
      expect(result.durationRange).toHaveProperty('min')
      expect(result.durationRange).toHaveProperty('max')
    })

    test('selectDurationCategory should distribute across categories over time', () => {
      const categories = { tap: 0, short: 0, medium: 0, long: 0 }

      // Run 100 iterations to get distribution
      for (let i = 0; i < 100; i++) {
        behavior.incrementGestureCounter('wikipedia')
        const result = behavior.selectDurationCategory('wikipedia')
        categories[result.category]++
      }

      // Each category should have some representation
      expect(categories.tap).toBeGreaterThan(0)
      expect(categories.short).toBeGreaterThan(0)
      expect(categories.medium).toBeGreaterThan(0)
      expect(categories.long).toBeGreaterThan(0)
    })

    test('selectDurationCategory should use source-specific bias', () => {
      const wikiCategories = { tap: 0, short: 0, medium: 0, long: 0 }
      const ghCategories = { tap: 0, short: 0, medium: 0, long: 0 }

      // Use landing profile which has different biases
      const landingBehavior = new BaseVirtualUserBehavior({
        balancingProfile: 'landing'
      })

      for (let i = 0; i < 100; i++) {
        landingBehavior.incrementGestureCounter('wikipedia')
        landingBehavior.incrementGestureCounter('github')
        wikiCategories[landingBehavior.selectDurationCategory('wikipedia').category]++
        ghCategories[landingBehavior.selectDurationCategory('github').category]++
      }

      // Wikipedia should have more taps (bias: 60% vs GitHub's 15%)
      // GitHub should have more long gestures (bias: 20% vs Wikipedia's 2%)
      expect(wikiCategories.tap).toBeGreaterThan(ghCategories.tap)
      expect(ghCategories.long).toBeGreaterThan(wikiCategories.long)
    })
  })

  describe('Gesture Classification', () => {
    test('classifyGestureType should return tap or drag', () => {
      const gestureType = behavior.classifyGestureType('wikipedia')
      expect(['tap', 'drag']).toContain(gestureType)
    })

    test('classifyGestureType should return tap when stability > density', () => {
      // Mock high stability (low velocity) and low density
      mockWebMetricsPoller.getVelocity.mockReturnValue(0.01)
      mockWebMetricsPoller.getMetrics.mockReturnValue({
        wikipedia: { editsPerMinute: 1, avgEditSize: 10 }
      })

      // Need to warm up statistics
      for (let i = 0; i < 15; i++) {
        behavior.updateStatistics('wikipedia', 'velocity', 0.01 + i * 0.001)
        behavior.updateStatistics('wikipedia', 'avgEditSize', 10 + i)
      }

      const gestureType = behavior.classifyGestureType('wikipedia')
      expect(gestureType).toBe('tap')
    })
  })

  describe('Context Isolation', () => {
    test('different contexts should have isolated statistics', () => {
      const landingBehavior = new BaseVirtualUserBehavior({
        context: 'landing',
        balancingProfile: 'landing',
        webMetricsPoller: mockWebMetricsPoller
      })

      const roomBehavior = new BaseVirtualUserBehavior({
        context: 'room-123',
        balancingProfile: 'rooms',
        webMetricsPoller: mockWebMetricsPoller
      })

      // Add samples to landing
      landingBehavior.updateStatistics('wikipedia', 'editsPerMinute', 100)
      landingBehavior.updateStatistics('wikipedia', 'editsPerMinute', 200)

      // Add different samples to room
      roomBehavior.updateStatistics('wikipedia', 'editsPerMinute', 10)
      roomBehavior.updateStatistics('wikipedia', 'editsPerMinute', 20)

      // Verify they're isolated
      expect(landingBehavior.metricStatistics.wikipedia.editsPerMinute.samples).toEqual([100, 200])
      expect(roomBehavior.metricStatistics.wikipedia.editsPerMinute.samples).toEqual([10, 20])

      // Verify normalization is different
      const landingNorm = landingBehavior.normalizeValue('wikipedia', 'editsPerMinute', 150)
      const roomNorm = roomBehavior.normalizeValue('wikipedia', 'editsPerMinute', 15)

      // Both should be valid but based on their respective ranges
      expect(landingNorm).toBeGreaterThanOrEqual(0)
      expect(landingNorm).toBeLessThanOrEqual(1)
      expect(roomNorm).toBeGreaterThanOrEqual(0)
      expect(roomNorm).toBeLessThanOrEqual(1)
    })

    test('gesture counters should be independent per source', () => {
      behavior.incrementGestureCounter('wikipedia')
      behavior.incrementGestureCounter('wikipedia')
      behavior.incrementGestureCounter('hackernews')

      expect(behavior.gestureCounters.wikipedia).toBe(2)
      expect(behavior.gestureCounters.hackernews).toBe(1)
      expect(behavior.gestureCounters.github).toBe(0)
    })
  })

  describe('Interpolation', () => {
    test('interpolatePosition should move toward target', () => {
      const current = { x: 0, y: 0 }
      const target = { x: 1, y: 1 }

      const newPos = behavior.interpolatePosition(current, target, 0.5)

      expect(newPos.x).toBe(0.5)
      expect(newPos.y).toBe(0.5)
    })

    test('interpolatePosition should use default speed from profile', () => {
      const current = { x: 0, y: 0 }
      const target = { x: 1, y: 1 }

      const newPos = behavior.interpolatePosition(current, target)

      expect(newPos.x).toBeGreaterThan(0)
      expect(newPos.x).toBeLessThan(1)
      expect(newPos.y).toBeGreaterThan(0)
      expect(newPos.y).toBeLessThan(1)
    })
  })

  describe('Web Metrics Normalization', () => {
    test('normalizeWebMetrics should return normalized values for all sources', () => {
      const result = behavior.normalizeWebMetrics()

      expect(result).toHaveProperty('wikipedia')
      expect(result).toHaveProperty('hackernews')
      expect(result).toHaveProperty('github')

      expect(result.wikipedia).toHaveProperty('normalized')
      expect(result.hackernews).toHaveProperty('normalized')
      expect(result.github).toHaveProperty('normalized')
    })

    test('normalizeWebMetrics should return 0.5 without poller', () => {
      behavior.webMetricsPoller = null
      const result = behavior.normalizeWebMetrics()

      expect(result.wikipedia.normalized).toBe(0.5)
      expect(result.hackernews.normalized).toBe(0.5)
      expect(result.github.normalized).toBe(0.5)
    })
  })

  describe('Gesture Intent Threshold', () => {
    test('calculateGestureIntentThreshold should return positive value', () => {
      const threshold = behavior.calculateGestureIntentThreshold('wikipedia', 0.5)

      expect(threshold).toBeGreaterThan(0)
      expect(threshold).toBeLessThan(1)
    })

    test('calculateGestureIntentThreshold should decrease with high activity', () => {
      const lowActivityThreshold = behavior.calculateGestureIntentThreshold('wikipedia', 0.1)
      const highActivityThreshold = behavior.calculateGestureIntentThreshold('wikipedia', 0.9)

      // High activity should lower the threshold (more gestures pass)
      expect(highActivityThreshold).toBeLessThan(lowActivityThreshold)
    })

    test('calculateGestureIntentThreshold should respect source multiplier', () => {
      // Landing profile has different multipliers
      const landingBehavior = new BaseVirtualUserBehavior({
        balancingProfile: 'landing',
        webMetricsPoller: mockWebMetricsPoller
      })

      const wikiThreshold = landingBehavior.calculateGestureIntentThreshold('wikipedia', 0.5)
      const ghThreshold = landingBehavior.calculateGestureIntentThreshold('github', 0.5)

      // Wikipedia has 4.0x multiplier, GitHub has 0.25x
      // So Wikipedia threshold should be much higher
      expect(wikiThreshold).toBeGreaterThan(ghThreshold)
    })
  })
})
