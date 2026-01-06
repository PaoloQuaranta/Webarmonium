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
        expect(config).toHaveProperty('region')
        expect(config).toHaveProperty('tessitura')
        expect(config).toHaveProperty('frequencyRange')

        expect(config.userId).toMatch(/-metrics$/)
        expect(config.color).toMatch(/^#[0-9a-f]{6}$/)
        expect(config.region).toHaveProperty('xMin')
        expect(config.region).toHaveProperty('xMax')
      }
    })

    test('regions should not overlap', () => {
      const { wikipedia, hackernews, github } = service.virtualUserConfigs

      expect(wikipedia.region.xMax).toBeLessThanOrEqual(hackernews.region.xMin)
      expect(hackernews.region.xMax).toBeLessThanOrEqual(github.region.xMin)
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

    test('should initialize cursor positions within source regions', () => {
      service.activateForRoom('room1', ['wikipedia', 'hackernews'])

      const roomState = service.activeRooms.get('room1')
      const { wikipedia, hackernews } = service.virtualUserConfigs

      // Check wikipedia cursor is within its region
      expect(roomState.currentPositions.wikipedia.x).toBeGreaterThanOrEqual(wikipedia.region.xMin)
      expect(roomState.currentPositions.wikipedia.x).toBeLessThanOrEqual(wikipedia.region.xMax)

      // Check hackernews cursor is within its region
      expect(roomState.currentPositions.hackernews.x).toBeGreaterThanOrEqual(hackernews.region.xMin)
      expect(roomState.currentPositions.hackernews.x).toBeLessThanOrEqual(hackernews.region.xMax)
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
        for (let i = 0; i < 60; i++) {
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

      test('should normalize within 0-1 range', () => {
        service._updateStatistics('wikipedia', 'velocity', 0)
        service._updateStatistics('wikipedia', 'velocity', 10)

        expect(service._normalizeValue('wikipedia', 'velocity', 0)).toBe(0)
        expect(service._normalizeValue('wikipedia', 'velocity', 5)).toBe(0.5)
        expect(service._normalizeValue('wikipedia', 'velocity', 10)).toBe(1)
      })

      test('should clamp values outside range', () => {
        service._updateStatistics('wikipedia', 'velocity', 0)
        service._updateStatistics('wikipedia', 'velocity', 10)

        expect(service._normalizeValue('wikipedia', 'velocity', -5)).toBe(0)
        expect(service._normalizeValue('wikipedia', 'velocity', 15)).toBe(1)
      })
    })

    describe('_classifyGestureType()', () => {
      test('should return "tap" for low velocity', () => {
        mockWebMetricsPoller.getVelocity = jest.fn(() => 1)

        const type = service._classifyGestureType('wikipedia', {})
        expect(type).toBe('tap')
      })

      test('should return "drag" for high velocity', () => {
        mockWebMetricsPoller.getVelocity = jest.fn(() => 5)

        const type = service._classifyGestureType('wikipedia', {})
        expect(type).toBe('drag')
      })
    })
  })
})
