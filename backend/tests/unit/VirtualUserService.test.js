/**
 * Unit Test: VirtualUserService
 * Tests virtual user activation, deactivation, source selection, and gesture generation
 */

const VirtualUserService = require('../../src/services/VirtualUserService')

describe('VirtualUserService', () => {
  let service
  let mockIO
  let mockWebMetricsPoller

  beforeEach(() => {
    service = new VirtualUserService()

    // Mock Socket.IO
    mockIO = {
      to: jest.fn(() => ({
        emit: jest.fn()
      }))
    }
    service.setSocketIO(mockIO)

    // Mock WebMetricsPoller
    mockWebMetricsPoller = {
      getMostActiveSources: jest.fn(() => ['wikipedia', 'hackernews']),
      getMetrics: jest.fn(() => ({
        wikipedia: { editsPerMinute: 10 },
        hackernews: { postsPerMinute: 5 },
        github: { commitsPerMinute: 2 }
      })),
      getVelocity: jest.fn((source) => {
        const velocities = { wikipedia: 2.5, hackernews: 1.0, github: 0.5 }
        return velocities[source] || 0
      })
    }
    service.setWebMetricsPoller(mockWebMetricsPoller)
  })

  afterEach(() => {
    service.shutdown()
  })

  describe('Configuration', () => {
    test('should have virtual user configs for wikipedia, hackernews, github', () => {
      expect(service.virtualUserConfigs).toHaveProperty('wikipedia')
      expect(service.virtualUserConfigs).toHaveProperty('hackernews')
      expect(service.virtualUserConfigs).toHaveProperty('github')
    })

    test('each config should have required properties', () => {
      for (const [source, config] of Object.entries(service.virtualUserConfigs)) {
        expect(config).toHaveProperty('userId')
        expect(config).toHaveProperty('color')
        expect(config).toHaveProperty('tessitura')
        expect(config).toHaveProperty('frequencyRange')

        expect(config.userId).toMatch(/-metrics$/)
        expect(config.color).toMatch(/^#[0-9a-f]{6}$/)
        expect(config.frequencyRange).toHaveProperty('min')
        expect(config.frequencyRange).toHaveProperty('max')
      }
    })

    test('tessituras should have distinct frequency ranges', () => {
      const { wikipedia, hackernews, github } = service.virtualUserConfigs

      // Wikipedia (bass) should be lower than HackerNews (tenor)
      expect(wikipedia.frequencyRange.max).toBeLessThanOrEqual(hackernews.frequencyRange.max)
      // HackerNews (tenor) should be lower than GitHub (soprano)
      expect(hackernews.frequencyRange.max).toBeLessThanOrEqual(github.frequencyRange.max)
    })
  })

  describe('getMostActiveSources()', () => {
    test('should return sources from WebMetricsPoller', () => {
      const sources = service.getMostActiveSources()

      expect(mockWebMetricsPoller.getMostActiveSources).toHaveBeenCalled()
      expect(sources).toEqual(['wikipedia', 'hackernews'])
    })

    test('should return default sources if WebMetricsPoller is not set', () => {
      service.setWebMetricsPoller(null)

      const sources = service.getMostActiveSources()

      expect(sources).toEqual(['wikipedia', 'hackernews'])
    })

    test('should return default sources if getMostActiveSources is not a function', () => {
      service.setWebMetricsPoller({})

      const sources = service.getMostActiveSources()

      expect(sources).toEqual(['wikipedia', 'hackernews'])
    })
  })

  describe('activateForRoom()', () => {
    test('should activate virtual users for a room', () => {
      service.activateForRoom('room1', ['wikipedia', 'github'])

      expect(service.isActiveForRoom('room1')).toBe(true)
      expect(service.activeRooms.size).toBe(1)
    })

    test('should emit virtual-users-activated event', () => {
      const toSpy = jest.fn(() => ({
        emit: jest.fn()
      }))
      mockIO.to = toSpy

      service.activateForRoom('room1', ['wikipedia', 'github'])

      expect(toSpy).toHaveBeenCalledWith('room1')
    })

    test('should include correct virtual user info in activation event', () => {
      const emitSpy = jest.fn()
      mockIO.to = jest.fn(() => ({ emit: emitSpy }))

      service.activateForRoom('room1', ['wikipedia', 'github'])

      expect(emitSpy).toHaveBeenCalledWith('virtual-users-activated', expect.objectContaining({
        roomId: 'room1',
        sources: ['wikipedia', 'github'],
        virtualUsers: expect.arrayContaining([
          expect.objectContaining({
            userId: 'wikipedia-metrics',
            color: '#e41a1c',
            source: 'wikipedia'
          }),
          expect.objectContaining({
            userId: 'github-metrics',
            color: '#377eb8',
            source: 'github'
          })
        ])
      }))
    })

    test('should initialize room state with required properties', () => {
      service.activateForRoom('room1', ['wikipedia', 'hackernews'])

      const roomState = service.activeRooms.get('room1')

      // Room state should have basic properties (no cursor position tracking)
      expect(roomState).toHaveProperty('roomId', 'room1')
      expect(roomState).toHaveProperty('sources')
      expect(roomState.sources).toEqual(['wikipedia', 'hackernews'])
      expect(roomState).toHaveProperty('isActive', true)
      expect(roomState).toHaveProperty('musicalContext')
    })

    test('should update sources if room already active', () => {
      service.activateForRoom('room1', ['wikipedia', 'hackernews'])
      service.activateForRoom('room1', ['hackernews', 'github'])

      const roomState = service.activeRooms.get('room1')
      expect(roomState.sources).toEqual(['hackernews', 'github'])
    })

    test('should support multiple rooms simultaneously', () => {
      service.activateForRoom('room1', ['wikipedia', 'hackernews'])
      service.activateForRoom('room2', ['hackernews', 'github'])
      service.activateForRoom('room3', ['wikipedia', 'github'])

      expect(service.activeRooms.size).toBe(3)
      expect(service.isActiveForRoom('room1')).toBe(true)
      expect(service.isActiveForRoom('room2')).toBe(true)
      expect(service.isActiveForRoom('room3')).toBe(true)
    })
  })

  describe('deactivateForRoom()', () => {
    test('should deactivate virtual users for a room', () => {
      service.activateForRoom('room1', ['wikipedia', 'hackernews'])
      service.deactivateForRoom('room1')

      expect(service.isActiveForRoom('room1')).toBe(false)
      expect(service.activeRooms.size).toBe(0)
    })

    test('should emit virtual-users-deactivated event', () => {
      const emitSpy = jest.fn()
      mockIO.to = jest.fn(() => ({ emit: emitSpy }))

      service.activateForRoom('room1', ['wikipedia', 'hackernews'])
      emitSpy.mockClear()

      service.deactivateForRoom('room1')

      expect(emitSpy).toHaveBeenCalledWith('virtual-users-deactivated', expect.objectContaining({
        roomId: 'room1',
        sources: ['wikipedia', 'hackernews']
      }))
    })

    test('should not emit event if fadeOut is false', () => {
      const emitSpy = jest.fn()
      mockIO.to = jest.fn(() => ({ emit: emitSpy }))

      service.activateForRoom('room1', ['wikipedia', 'hackernews'])
      emitSpy.mockClear()

      service.deactivateForRoom('room1', false)

      expect(emitSpy).not.toHaveBeenCalled()
    })

    test('should handle deactivation of non-existent room gracefully', () => {
      expect(() => {
        service.deactivateForRoom('non-existent-room')
      }).not.toThrow()
    })

    test('should only deactivate specified room', () => {
      service.activateForRoom('room1', ['wikipedia', 'hackernews'])
      service.activateForRoom('room2', ['hackernews', 'github'])

      service.deactivateForRoom('room1')

      expect(service.isActiveForRoom('room1')).toBe(false)
      expect(service.isActiveForRoom('room2')).toBe(true)
    })
  })

  describe('isActiveForRoom()', () => {
    test('should return true for active room', () => {
      service.activateForRoom('room1', ['wikipedia', 'hackernews'])

      expect(service.isActiveForRoom('room1')).toBe(true)
    })

    test('should return false for inactive room', () => {
      expect(service.isActiveForRoom('room1')).toBe(false)
    })

    test('should return false after deactivation', () => {
      service.activateForRoom('room1', ['wikipedia', 'hackernews'])
      service.deactivateForRoom('room1')

      expect(service.isActiveForRoom('room1')).toBe(false)
    })
  })

  describe('updateMusicalContext()', () => {
    test('should update musical context for active room', () => {
      service.activateForRoom('room1', ['wikipedia', 'hackernews'], { key: 'C', mode: 'ionian', tempo: 120 })

      service.updateMusicalContext('room1', { key: 'G', tempo: 140 })

      const roomState = service.activeRooms.get('room1')
      expect(roomState.musicalContext).toEqual({
        key: 'G',
        mode: 'ionian',
        tempo: 140
      })
    })

    test('should not throw for non-existent room', () => {
      expect(() => {
        service.updateMusicalContext('non-existent', { key: 'G' })
      }).not.toThrow()
    })
  })

  describe('getVirtualUserConfigs()', () => {
    test('should return configs for specified sources', () => {
      const configs = service.getVirtualUserConfigs(['wikipedia', 'github'])

      expect(configs).toHaveLength(2)
      expect(configs[0].source).toBe('wikipedia')
      expect(configs[1].source).toBe('github')
    })

    test('configs should include source property', () => {
      const configs = service.getVirtualUserConfigs(['hackernews'])

      expect(configs[0]).toHaveProperty('source', 'hackernews')
      expect(configs[0]).toHaveProperty('userId', 'hackernews-metrics')
    })
  })

  describe('shutdown()', () => {
    test('should deactivate all rooms', () => {
      service.activateForRoom('room1', ['wikipedia', 'hackernews'])
      service.activateForRoom('room2', ['hackernews', 'github'])
      service.activateForRoom('room3', ['wikipedia', 'github'])

      service.shutdown()

      expect(service.activeRooms.size).toBe(0)
    })

    test('should not emit deactivation events on shutdown', () => {
      const emitSpy = jest.fn()
      mockIO.to = jest.fn(() => ({ emit: emitSpy }))

      service.activateForRoom('room1', ['wikipedia', 'hackernews'])
      emitSpy.mockClear()

      service.shutdown()

      // shutdown calls deactivateForRoom with fadeOut=false
      expect(emitSpy).not.toHaveBeenCalled()
    })
  })

  describe('Internal Methods', () => {
    describe('_updateStatistics()', () => {
      test('should track min/max values', () => {
        service._updateStatistics('wikipedia', 'velocity', 5)
        service._updateStatistics('wikipedia', 'velocity', 10)
        service._updateStatistics('wikipedia', 'velocity', 3)

        const stats = service.metricStatistics.wikipedia.velocity
        expect(stats.min).toBe(3)
        expect(stats.max).toBe(10)
      })

      test('should maintain sample buffer up to maxSamples', () => {
        // Add more samples than maxSamples (100) to test buffer limiting
        for (let i = 0; i < 120; i++) {
          service._updateStatistics('wikipedia', 'velocity', i)
        }

        const stats = service.metricStatistics.wikipedia.velocity
        expect(stats.samples.length).toBe(service.maxSamples)
      })
    })

    describe('_normalizeValue()', () => {
      test('should return 0.5 when no samples', () => {
        const normalized = service._normalizeValue('wikipedia', 'velocity', 5)
        expect(normalized).toBe(0.5)
      })

      test('should use min/max normalization during warm-up (< 5 samples)', () => {
        // Add only 3 samples (below MIN_SAMPLES_FOR_PERCENTILE = 5)
        service._updateStatistics('wikipedia', 'velocity', 0)
        service._updateStatistics('wikipedia', 'velocity', 10)
        service._updateStatistics('wikipedia', 'velocity', 5)

        // During warm-up, should use simple min/max normalization
        // min=0, max=10, value=5 → (5-0)/(10-0) = 0.5
        expect(service._normalizeValue('wikipedia', 'velocity', 5)).toBe(0.5)
        // value=2.5 → (2.5-0)/(10-0) = 0.25
        expect(service._normalizeValue('wikipedia', 'velocity', 2.5)).toBe(0.25)
      })

      test('should normalize using P10-P90 percentile with enough samples', () => {
        // Add 20 samples from 0 to 19 to have enough for percentile calculation
        for (let i = 0; i < 20; i++) {
          service._updateStatistics('wikipedia', 'velocity', i)
        }

        // P10 = 2, P90 = 18, range = 16
        // Value 2 should normalize to ~0, value 10 to ~0.5, value 18 to ~1
        const normalized10 = service._normalizeValue('wikipedia', 'velocity', 10)
        expect(normalized10).toBeGreaterThan(0.4)
        expect(normalized10).toBeLessThan(0.6)
      })

      test('should clamp values outside percentile range', () => {
        // Add 20 samples from 0 to 19
        for (let i = 0; i < 20; i++) {
          service._updateStatistics('wikipedia', 'velocity', i)
        }

        // Values outside P10-P90 range should be clamped to 0 or 1
        expect(service._normalizeValue('wikipedia', 'velocity', -10)).toBe(0)
        expect(service._normalizeValue('wikipedia', 'velocity', 100)).toBe(1)
      })
    })

    describe('_classifyGestureType()', () => {
      test('should return "tap" when stability metric is higher than density', () => {
        // Low velocity = high stability = tap
        mockWebMetricsPoller.getVelocity = jest.fn(() => 0.5)
        // Low density metric values
        mockWebMetricsPoller.getMetrics = jest.fn(() => ({
          wikipedia: { editsPerMinute: 0, avgEditSize: 0, newArticles: 0 }
        }))

        const type = service._classifyGestureType('wikipedia')
        expect(type).toBe('tap')
      })

      test('should return "drag" when density metric is higher than stability', () => {
        // High velocity = low stability
        mockWebMetricsPoller.getVelocity = jest.fn(() => 10)

        // First populate enough samples for both metrics
        for (let i = 0; i < 20; i++) {
          service._updateStatistics('wikipedia', 'velocity', i)
          service._updateStatistics('wikipedia', 'avgEditSize', i * 100)
        }

        // High density metric value (avgEditSize) relative to stability
        mockWebMetricsPoller.getMetrics = jest.fn(() => ({
          wikipedia: { editsPerMinute: 100, avgEditSize: 2000, newArticles: 50 }
        }))

        const type = service._classifyGestureType('wikipedia')
        expect(type).toBe('drag')
      })
    })

    describe('_selectDurationCategory() (Entry #174)', () => {
      test('should cycle through all categories using PHI-based stepping', () => {
        const categories = new Set()

        // Run 20 gestures to ensure all categories appear
        for (let i = 0; i < 20; i++) {
          service.gestureCounters.wikipedia = i
          const { category } = service._selectDurationCategory('wikipedia')
          categories.add(category)
        }

        expect(categories.size).toBe(4) // All 4 categories should appear
        expect(categories.has('tap')).toBe(true)
        expect(categories.has('short')).toBe(true)
        expect(categories.has('medium')).toBe(true)
        expect(categories.has('long')).toBe(true)
      })

      test('should return valid duration ranges for each category', () => {
        const expectedRanges = {
          tap: { min: 50, max: 300 },
          short: { min: 300, max: 1500 },
          medium: { min: 1500, max: 5000 },
          long: { min: 5000, max: 16000 }
        }

        for (let i = 0; i < 20; i++) {
          service.gestureCounters.wikipedia = i
          const { category, durationRange } = service._selectDurationCategory('wikipedia')

          expect(durationRange.min).toBe(expectedRanges[category].min)
          expect(durationRange.max).toBe(expectedRanges[category].max)
        }
      })

      test('should produce different patterns for different sources', () => {
        // Same gesture count but different sources should produce different categories
        service.gestureCounters.wikipedia = 0
        service.gestureCounters.hackernews = 0
        service.gestureCounters.github = 0

        const wikiCategory = service._selectDurationCategory('wikipedia')
        const hnCategory = service._selectDurationCategory('hackernews')
        const ghCategory = service._selectDurationCategory('github')

        // With gesture count 0, source offsets determine category
        // 0.17 < 0.20 = tap, 0.53 in [0.50, 0.80) = medium, 0.89 >= 0.80 = long
        expect(wikiCategory.category).toBe('tap')
        expect(hnCategory.category).toBe('medium')
        expect(ghCategory.category).toBe('long')
      })

      test('should produce balanced distribution over 100 gestures', () => {
        const counts = { tap: 0, short: 0, medium: 0, long: 0 }

        for (let i = 0; i < 100; i++) {
          service.gestureCounters.wikipedia = i
          const { category } = service._selectDurationCategory('wikipedia')
          counts[category]++
        }

        // Expected: 20% tap, 30% short, 30% medium, 20% long (±5%)
        expect(counts.tap).toBeGreaterThanOrEqual(15)
        expect(counts.tap).toBeLessThanOrEqual(25)
        expect(counts.short).toBeGreaterThanOrEqual(25)
        expect(counts.short).toBeLessThanOrEqual(35)
        expect(counts.medium).toBeGreaterThanOrEqual(25)
        expect(counts.medium).toBeLessThanOrEqual(35)
        expect(counts.long).toBeGreaterThanOrEqual(15)
        expect(counts.long).toBeLessThanOrEqual(25)
      })
    })
  })
})
