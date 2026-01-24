/**
 * Unit Test: CompositionMonitor History Buffer
 * Tests 5-minute history tracking for numeric fields
 */

const CompositionMonitor = require('../../src/services/CompositionMonitor')

describe('CompositionMonitor - History Buffer', () => {
  let monitor

  beforeEach(() => {
    // Create a fresh instance with monitoring enabled
    process.env.COMPOSITION_MONITOR = 'true'
    monitor = new CompositionMonitor()
    monitor.enabled = true
  })

  afterEach(() => {
    if (monitor) {
      monitor.shutdown()
    }
    delete process.env.COMPOSITION_MONITOR
  })

  describe('_updateHistoryBuffer()', () => {
    test('should add numeric values to history buffer', () => {
      const snapshot = {
        timestamp: Date.now(),
        core: { tempo: 120, complexityLevel: 0.5, density: 0.7 }
      }

      monitor._updateHistoryBuffer(snapshot)

      expect(monitor.historyBuffer['core.tempo']).toHaveLength(1)
      expect(monitor.historyBuffer['core.tempo'][0].value).toBe(120)
      expect(monitor.historyBuffer['core.complexityLevel']).toHaveLength(1)
      expect(monitor.historyBuffer['core.complexityLevel'][0].value).toBe(0.5)
    })

    test('should skip undefined/null/NaN values', () => {
      const snapshot = {
        timestamp: Date.now(),
        core: { tempo: undefined, complexityLevel: null, density: NaN, tensionLevel: 0.5 }
      }

      monitor._updateHistoryBuffer(snapshot)

      expect(monitor.historyBuffer['core.tempo']).toHaveLength(0)
      expect(monitor.historyBuffer['core.complexityLevel']).toHaveLength(0)
      expect(monitor.historyBuffer['core.density']).toHaveLength(0)
      expect(monitor.historyBuffer['core.tensionLevel']).toHaveLength(1)
    })

    test('should track nested style.harmonicComplexity values', () => {
      const snapshot = {
        timestamp: Date.now(),
        style: {
          energy: 0.8,
          harmonicComplexity: {
            chromaticism: 0.3,
            dissonance: 0.4
          }
        }
      }

      monitor._updateHistoryBuffer(snapshot)

      expect(monitor.historyBuffer['style.energy']).toHaveLength(1)
      expect(monitor.historyBuffer['style.harmonicComplexity.chromaticism']).toHaveLength(1)
      expect(monitor.historyBuffer['style.harmonicComplexity.dissonance']).toHaveLength(1)
      expect(monitor.historyBuffer['style.harmonicComplexity.chromaticism'][0].value).toBe(0.3)
    })

    test('should enforce max size limit to prevent unbounded growth', () => {
      // Override max size for testing
      monitor.maxHistoryEntriesPerField = 5

      // Add more entries than the limit
      for (let i = 0; i < 10; i++) {
        monitor._updateHistoryBuffer({
          timestamp: Date.now() + i,
          core: { tempo: 100 + i }
        })
      }

      expect(monitor.historyBuffer['core.tempo']).toHaveLength(5)
      // Should keep the most recent entries
      expect(monitor.historyBuffer['core.tempo'][0].value).toBe(105)
      expect(monitor.historyBuffer['core.tempo'][4].value).toBe(109)
    })
  })

  describe('_pruneHistoryBuffer()', () => {
    test('should remove entries older than historyDuration', () => {
      const now = Date.now()
      const sixMinutesAgo = now - (6 * 60 * 1000)
      const twoMinutesAgo = now - (2 * 60 * 1000)

      monitor.historyBuffer['core.tempo'] = [
        { timestamp: sixMinutesAgo, value: 100 },
        { timestamp: twoMinutesAgo, value: 120 }
      ]

      monitor._pruneHistoryBuffer()

      expect(monitor.historyBuffer['core.tempo']).toHaveLength(1)
      expect(monitor.historyBuffer['core.tempo'][0].value).toBe(120)
    })

    test('should keep all entries within historyDuration', () => {
      const now = Date.now()
      const oneMinuteAgo = now - (1 * 60 * 1000)
      const twoMinutesAgo = now - (2 * 60 * 1000)

      monitor.historyBuffer['core.tempo'] = [
        { timestamp: twoMinutesAgo, value: 100 },
        { timestamp: oneMinuteAgo, value: 110 },
        { timestamp: now, value: 120 }
      ]

      monitor._pruneHistoryBuffer()

      expect(monitor.historyBuffer['core.tempo']).toHaveLength(3)
    })

    test('should handle empty buffers gracefully', () => {
      // All buffers start empty
      expect(() => monitor._pruneHistoryBuffer()).not.toThrow()
    })

    test('should skip pruning if oldest entry is still valid (optimization)', () => {
      const now = Date.now()
      monitor.historyBuffer['core.tempo'] = [
        { timestamp: now - 1000, value: 100 },
        { timestamp: now, value: 120 }
      ]

      // Should not create new array if no pruning needed
      const originalArray = monitor.historyBuffer['core.tempo']
      monitor._pruneHistoryBuffer()

      // Array reference should be the same (no allocation)
      expect(monitor.historyBuffer['core.tempo']).toBe(originalArray)
    })
  })

  describe('getNumericHistory()', () => {
    test('should return all history with relative times', () => {
      const now = Date.now()
      monitor.historyBuffer['core.tempo'] = [
        { timestamp: now - 10000, value: 100 },
        { timestamp: now - 5000, value: 120 }
      ]

      const result = monitor.getNumericHistory()

      expect(result.enabled).toBe(true)
      expect(result.durationSeconds).toBe(300) // 5 minutes
      expect(result.fields['core.tempo']).toHaveLength(2)
      expect(result.fields['core.tempo'][0].relativeTime).toBeGreaterThanOrEqual(10)
      expect(result.fields['core.tempo'][1].relativeTime).toBeGreaterThanOrEqual(5)
    })

    test('should return enabled: false when monitor is disabled', () => {
      monitor.enabled = false

      const result = monitor.getNumericHistory()

      expect(result.enabled).toBe(false)
    })
  })

  describe('getFieldHistory()', () => {
    test('should return history for specific field', () => {
      const now = Date.now()
      monitor.historyBuffer['core.tempo'] = [
        { timestamp: now - 5000, value: 120 }
      ]

      const result = monitor.getFieldHistory('core.tempo')

      expect(result.enabled).toBe(true)
      expect(result.field).toBe('core.tempo')
      expect(result.data).toHaveLength(1)
      expect(result.data[0].value).toBe(120)
    })

    test('should return error for unknown field', () => {
      const result = monitor.getFieldHistory('unknown.field')

      expect(result.enabled).toBe(true)
      expect(result.error).toContain('Unknown field')
      expect(result.availableFields).toBeDefined()
    })

    test('should return enabled: false when monitor is disabled', () => {
      monitor.enabled = false

      const result = monitor.getFieldHistory('core.tempo')

      expect(result.enabled).toBe(false)
    })
  })

  describe('_getCompactHistory()', () => {
    test('should format history with relative seconds and rounded values', () => {
      const now = Date.now()
      monitor.historyBuffer['core.tempo'] = [
        { timestamp: now - 10000, value: 120.567 },
        { timestamp: now - 5000, value: 125.123 }
      ]

      const compact = monitor._getCompactHistory()

      expect(compact['core.tempo']).toBeDefined()
      expect(compact['core.tempo']).toHaveLength(2)
      // Format: [relativeSeconds, roundedValue]
      expect(compact['core.tempo'][0][0]).toBeGreaterThanOrEqual(10)
      expect(compact['core.tempo'][0][1]).toBe(120.567)
      expect(compact['core.tempo'][1][0]).toBeGreaterThanOrEqual(5)
      expect(compact['core.tempo'][1][1]).toBe(125.123)
    })

    test('should skip empty buffers', () => {
      // All buffers are empty
      const compact = monitor._getCompactHistory()

      expect(compact['core.tempo']).toBeUndefined()
    })
  })

  describe('Integration: recordSnapshot with history', () => {
    test('should update history buffer when recording snapshot', () => {
      const snapshot = {
        core: { tempo: 120, complexityLevel: 0.5 },
        style: { energy: 0.8 },
        materials: { total: 10 },
        room: { gestureCount: 5 }
      }

      monitor.recordSnapshot('test-room', snapshot)

      expect(monitor.historyBuffer['core.tempo']).toHaveLength(1)
      expect(monitor.historyBuffer['style.energy']).toHaveLength(1)
      expect(monitor.historyBuffer['materials.total']).toHaveLength(1)
      expect(monitor.historyBuffer['room.gestureCount']).toHaveLength(1)
    })
  })

  describe('Configuration', () => {
    test('should use environment variable for history duration', () => {
      process.env.HISTORY_DURATION_MS = '60000' // 1 minute
      const customMonitor = new CompositionMonitor()
      customMonitor.enabled = true

      expect(customMonitor.historyDuration).toBe(60000)

      customMonitor.shutdown()
      delete process.env.HISTORY_DURATION_MS
    })

    test('should default to 5 minutes if env var not set', () => {
      delete process.env.HISTORY_DURATION_MS
      const defaultMonitor = new CompositionMonitor()
      defaultMonitor.enabled = true

      expect(defaultMonitor.historyDuration).toBe(5 * 60 * 1000)

      defaultMonitor.shutdown()
    })
  })
})
