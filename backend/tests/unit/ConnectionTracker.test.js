/**
 * Unit Test: ConnectionTracker
 * Tests connection tracking, lifecycle callbacks, and activity monitoring
 */

const ConnectionTracker = require('../../src/services/ConnectionTracker')

describe('ConnectionTracker', () => {
  let tracker

  beforeEach(() => {
    tracker = new ConnectionTracker()
  })

  describe('Initial State', () => {
    test('should initialize with empty connections Map', () => {
      expect(tracker.connections).toBeInstanceOf(Map)
      expect(tracker.connections.size).toBe(0)
    })

    test('should initialize with current timestamp as lastActivityTime', () => {
      const now = Date.now()
      expect(tracker.lastActivityTime).toBeGreaterThanOrEqual(now - 100)
      expect(tracker.lastActivityTime).toBeLessThanOrEqual(now + 100)
    })

    test('should initialize with null callbacks', () => {
      expect(tracker.onEmptyCallback).toBeNull()
      expect(tracker.onFirstUserCallback).toBeNull()
    })

    test('should initialize with null io', () => {
      expect(tracker.io).toBeNull()
    })
  })

  describe('setIO()', () => {
    test('should accept valid Socket.IO instance', () => {
      const mockIO = {
        to: jest.fn(),
        emit: jest.fn()
      }
      tracker.setIO(mockIO)
      expect(tracker.io).toBe(mockIO)
    })

    test('should reject null io with warning', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation()
      tracker.setIO(null)
      expect(tracker.io).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('null/undefined'))
      warnSpy.mockRestore()
    })

    test('should reject undefined io with warning', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation()
      tracker.setIO(undefined)
      expect(tracker.io).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('null/undefined'))
      warnSpy.mockRestore()
    })

    test('should reject io without required methods', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation()
      tracker.setIO({ emit: jest.fn() }) // Missing 'to' method
      expect(tracker.io).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing required'))
      warnSpy.mockRestore()
    })

    test('should reject io with non-function methods', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation()
      tracker.setIO({ to: 'not a function', emit: jest.fn() })
      expect(tracker.io).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing required'))
      warnSpy.mockRestore()
    })
  })

  describe('onUserConnected()', () => {
    test('should track new connection', () => {
      tracker.onUserConnected('socket1', 'room1')
      expect(tracker.connections.size).toBe(1)
      expect(tracker.connections.get('socket1')).toMatchObject({
        roomId: 'room1'
      })
    })

    test('should include connectedAt timestamp', () => {
      const before = Date.now()
      tracker.onUserConnected('socket1', 'room1')
      const after = Date.now()

      const connection = tracker.connections.get('socket1')
      expect(connection.connectedAt).toBeGreaterThanOrEqual(before)
      expect(connection.connectedAt).toBeLessThanOrEqual(after)
    })

    test('should update activity on connection', () => {
      const before = tracker.lastActivityTime
      // Small delay to ensure different timestamp
      const originalTime = tracker.lastActivityTime
      tracker.lastActivityTime = originalTime - 1000 // Set to past

      tracker.onUserConnected('socket1', 'room1')
      expect(tracker.lastActivityTime).toBeGreaterThan(originalTime - 1000)
    })

    test('should trigger onFirstUserCallback when first user connects', () => {
      const callback = jest.fn()
      tracker.setOnFirstUserCallback(callback)

      tracker.onUserConnected('socket1', 'room1')
      expect(callback).toHaveBeenCalledTimes(1)
    })

    test('should NOT trigger onFirstUserCallback for subsequent users', () => {
      const callback = jest.fn()
      tracker.setOnFirstUserCallback(callback)

      tracker.onUserConnected('socket1', 'room1')
      tracker.onUserConnected('socket2', 'room1')
      tracker.onUserConnected('socket3', 'room2')

      expect(callback).toHaveBeenCalledTimes(1)
    })

    test('should handle multiple connections in same room', () => {
      tracker.onUserConnected('socket1', 'room1')
      tracker.onUserConnected('socket2', 'room1')

      expect(tracker.connections.size).toBe(2)
      expect(tracker.connections.get('socket1').roomId).toBe('room1')
      expect(tracker.connections.get('socket2').roomId).toBe('room1')
    })

    test('should handle connections in different rooms', () => {
      tracker.onUserConnected('socket1', 'room1')
      tracker.onUserConnected('socket2', 'room2')
      tracker.onUserConnected('socket3', 'landing-room')

      expect(tracker.connections.size).toBe(3)
    })
  })

  describe('onUserDisconnected()', () => {
    test('should remove tracked connection', () => {
      tracker.onUserConnected('socket1', 'room1')
      tracker.onUserDisconnected('socket1')

      expect(tracker.connections.size).toBe(0)
      expect(tracker.connections.has('socket1')).toBe(false)
    })

    test('should trigger onEmptyCallback when last user disconnects', () => {
      const callback = jest.fn()
      tracker.setOnEmptyCallback(callback)

      tracker.onUserConnected('socket1', 'room1')
      tracker.onUserDisconnected('socket1')

      expect(callback).toHaveBeenCalledTimes(1)
    })

    test('should NOT trigger onEmptyCallback when users remain', () => {
      const callback = jest.fn()
      tracker.setOnEmptyCallback(callback)

      tracker.onUserConnected('socket1', 'room1')
      tracker.onUserConnected('socket2', 'room1')
      tracker.onUserDisconnected('socket1')

      expect(callback).not.toHaveBeenCalled()
    })

    test('should NOT trigger onEmptyCallback for untracked socket', () => {
      const callback = jest.fn()
      tracker.setOnEmptyCallback(callback)

      tracker.onUserDisconnected('unknown-socket')
      expect(callback).not.toHaveBeenCalled()
    })

    test('should handle idempotent disconnect calls', () => {
      tracker.onUserConnected('socket1', 'room1')
      tracker.onUserDisconnected('socket1')
      tracker.onUserDisconnected('socket1') // Second call should not error

      expect(tracker.connections.size).toBe(0)
    })
  })

  describe('updateActivity()', () => {
    test('should update lastActivityTime', () => {
      const original = tracker.lastActivityTime
      tracker.lastActivityTime = original - 10000 // Set to past

      tracker.updateActivity()
      expect(tracker.lastActivityTime).toBeGreaterThan(original - 10000)
    })
  })

  describe('getLastActivityTime()', () => {
    test('should return lastActivityTime', () => {
      const time = tracker.getLastActivityTime()
      expect(time).toBe(tracker.lastActivityTime)
    })
  })

  describe('getTotalUserCount()', () => {
    test('should return 0 when no connections', () => {
      expect(tracker.getTotalUserCount()).toBe(0)
    })

    test('should return correct count', () => {
      tracker.onUserConnected('socket1', 'room1')
      tracker.onUserConnected('socket2', 'room2')
      tracker.onUserConnected('socket3', 'landing-room')

      expect(tracker.getTotalUserCount()).toBe(3)
    })
  })

  describe('getLandingRoomUserCount()', () => {
    test('should return 0 when no landing room users', () => {
      tracker.onUserConnected('socket1', 'room1')
      expect(tracker.getLandingRoomUserCount()).toBe(0)
    })

    test('should count only landing-room users', () => {
      tracker.onUserConnected('socket1', 'landing-room')
      tracker.onUserConnected('socket2', 'landing-room')
      tracker.onUserConnected('socket3', 'room1')

      expect(tracker.getLandingRoomUserCount()).toBe(2)
    })
  })

  describe('getRegularRoomUserCount()', () => {
    test('should return 0 when no regular room users', () => {
      tracker.onUserConnected('socket1', 'landing-room')
      expect(tracker.getRegularRoomUserCount()).toBe(0)
    })

    test('should count only non-landing-room users', () => {
      tracker.onUserConnected('socket1', 'landing-room')
      tracker.onUserConnected('socket2', 'room1')
      tracker.onUserConnected('socket3', 'room2')

      expect(tracker.getRegularRoomUserCount()).toBe(2)
    })
  })

  describe('hasConnections()', () => {
    test('should return false when no connections', () => {
      expect(tracker.hasConnections()).toBe(false)
    })

    test('should return true when connections exist', () => {
      tracker.onUserConnected('socket1', 'room1')
      expect(tracker.hasConnections()).toBe(true)
    })
  })

  describe('getStats()', () => {
    test('should return comprehensive stats', () => {
      tracker.onUserConnected('socket1', 'landing-room')
      tracker.onUserConnected('socket2', 'room1')

      const stats = tracker.getStats()

      expect(stats).toMatchObject({
        totalConnections: 2,
        landingRoomUsers: 1,
        regularRoomUsers: 1
      })
      expect(stats.lastActivityTime).toBeDefined()
      expect(stats.inactivityDuration).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Lifecycle Callback Edge Cases', () => {
    test('should handle rapid connect/disconnect cycles', () => {
      const firstUserCallback = jest.fn()
      const emptyCallback = jest.fn()

      tracker.setOnFirstUserCallback(firstUserCallback)
      tracker.setOnEmptyCallback(emptyCallback)

      // Rapid cycle
      for (let i = 0; i < 5; i++) {
        tracker.onUserConnected('socket1', 'room1')
        tracker.onUserDisconnected('socket1')
      }

      // First user callback fires on each first connection after empty
      expect(firstUserCallback).toHaveBeenCalledTimes(5)
      // Empty callback fires on each last disconnection
      expect(emptyCallback).toHaveBeenCalledTimes(5)
    })

    test('should handle callback that throws error', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error')
      })

      tracker.setOnFirstUserCallback(errorCallback)

      // Should not throw, but callback error should propagate
      expect(() => {
        tracker.onUserConnected('socket1', 'room1')
      }).toThrow('Callback error')
    })
  })
})
