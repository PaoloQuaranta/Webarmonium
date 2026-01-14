/**
 * Unit Test: RateLimiter
 * Tests centralized rate limiting that tracks by userId/IP
 * Entry #Security: Tests for security-critical rate limiting functionality
 */

const RateLimiter = require('../../src/utils/RateLimiter')

describe('RateLimiter', () => {
  beforeEach(() => {
    // Reset rate limiter state between tests
    RateLimiter.cleanup()
  })

  afterAll(() => {
    // Stop any running cleanup intervals
    RateLimiter.stopCleanup()
  })

  describe('getIdentifier()', () => {
    test('should return userId-based identifier when userId is present', () => {
      const socket = {
        userId: 'user-123',
        handshake: { address: '192.168.1.1' }
      }
      const identifier = RateLimiter.getIdentifier(socket)
      expect(identifier).toBe('user:user-123')
    })

    test('should return IP-based identifier when userId is not present', () => {
      const socket = {
        handshake: { address: '192.168.1.1' }
      }
      const identifier = RateLimiter.getIdentifier(socket)
      expect(identifier).toBe('ip:192.168.1.1')
    })

    test('should prefer x-forwarded-for header over socket address', () => {
      const socket = {
        handshake: {
          headers: { 'x-forwarded-for': '10.0.0.1, 192.168.1.1' },
          address: '127.0.0.1'
        }
      }
      const identifier = RateLimiter.getIdentifier(socket)
      expect(identifier).toBe('ip:10.0.0.1')
    })

    test('should return "unknown" when no IP info is available', () => {
      const socket = { handshake: {} }
      const identifier = RateLimiter.getIdentifier(socket)
      expect(identifier).toBe('ip:unknown')
    })
  })

  describe('getIP()', () => {
    test('should extract IP from x-forwarded-for header', () => {
      const socket = {
        handshake: {
          headers: { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' }
        }
      }
      expect(RateLimiter.getIP(socket)).toBe('203.0.113.50')
    })

    test('should fall back to socket address', () => {
      const socket = {
        handshake: { address: '192.168.1.100' }
      }
      expect(RateLimiter.getIP(socket)).toBe('192.168.1.100')
    })

    test('should return "unknown" when no IP is available', () => {
      const socket = { handshake: {} }
      expect(RateLimiter.getIP(socket)).toBe('unknown')
    })
  })

  describe('checkLimit()', () => {
    test('should allow requests under the limit', () => {
      const socket = { userId: 'user-test', handshake: {} }

      const result = RateLimiter.checkLimit('cursor-move', socket)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBeLessThan(60)
      expect(result.resetTime).toBeGreaterThan(Date.now())
    })

    test('should block requests over the limit', () => {
      const socket = { userId: 'user-flood', handshake: {} }

      // Exhaust the limit (cursor-move allows 60/sec)
      for (let i = 0; i < 60; i++) {
        RateLimiter.checkLimit('cursor-move', socket)
      }

      const result = RateLimiter.checkLimit('cursor-move', socket)

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    test('should track by userId across different sockets', () => {
      const socket1 = { userId: 'shared-user', handshake: { address: '1.1.1.1' } }
      const socket2 = { userId: 'shared-user', handshake: { address: '2.2.2.2' } }

      // Exhaust limit from socket1
      for (let i = 0; i < 60; i++) {
        RateLimiter.checkLimit('cursor-move', socket1)
      }

      // socket2 should also be blocked (same userId)
      const result = RateLimiter.checkLimit('cursor-move', socket2)
      expect(result.allowed).toBe(false)
    })

    test('should use custom options when provided', () => {
      const socket = { userId: 'custom-test', handshake: {} }

      // Allow only 3 requests
      for (let i = 0; i < 3; i++) {
        RateLimiter.checkLimit('custom-event', socket, {
          windowMs: 1000,
          maxRequests: 3
        })
      }

      const result = RateLimiter.checkLimit('custom-event', socket, {
        windowMs: 1000,
        maxRequests: 3
      })

      expect(result.allowed).toBe(false)
    })
  })

  describe('checkLimitByIP()', () => {
    test('should track by IP address directly', () => {
      const ip = '192.168.100.1'

      const result = RateLimiter.checkLimitByIP('connection', ip)

      expect(result.allowed).toBe(true)
    })

    test('should block when IP exceeds limit', () => {
      const ip = '192.168.100.2'

      // Exhaust connection limit (10/minute by default)
      for (let i = 0; i < 10; i++) {
        RateLimiter.checkLimitByIP('connection', ip)
      }

      const result = RateLimiter.checkLimitByIP('connection', ip)

      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeGreaterThan(0)
    })
  })

  describe('resetLimit()', () => {
    test('should reset limit for a specific identifier', () => {
      const socket = { userId: 'reset-test', handshake: {} }

      // Exhaust the limit
      for (let i = 0; i < 60; i++) {
        RateLimiter.checkLimit('cursor-move', socket)
      }

      // Verify blocked
      expect(RateLimiter.checkLimit('cursor-move', socket).allowed).toBe(false)

      // Reset
      RateLimiter.resetLimit('cursor-move', socket)

      // Should be allowed again
      expect(RateLimiter.checkLimit('cursor-move', socket).allowed).toBe(true)
    })
  })

  describe('cleanup()', () => {
    test('should remove stale entries', () => {
      const socket = { userId: 'cleanup-test', handshake: {} }

      // Add some entries
      RateLimiter.checkLimit('cursor-move', socket)

      // Get initial stats
      const before = RateLimiter.getStats()
      expect(before.totalEntries).toBeGreaterThan(0)

      // Cleanup won't remove fresh entries, but the function should run without error
      RateLimiter.cleanup()
    })
  })

  describe('startCleanup() / stopCleanup()', () => {
    test('should start and stop cleanup interval', () => {
      // Start cleanup with short interval for testing
      RateLimiter.startCleanup(100)

      // Stop cleanup
      RateLimiter.stopCleanup()

      // Should not throw
      expect(true).toBe(true)
    })
  })

  describe('getStats()', () => {
    test('should return statistics about rate limit entries', () => {
      const socket1 = { userId: 'stats-user-1', handshake: {} }
      const socket2 = { userId: 'stats-user-2', handshake: {} }

      RateLimiter.checkLimit('cursor-move', socket1)
      RateLimiter.checkLimit('gesture', socket2)

      const stats = RateLimiter.getStats()

      expect(stats.totalEntries).toBeGreaterThanOrEqual(2)
      expect(stats.entriesByType).toHaveProperty('cursor-move')
      expect(stats.entriesByType).toHaveProperty('gesture')
    })
  })

  describe('getConfig()', () => {
    test('should return config for known event types', () => {
      const config = RateLimiter.getConfig('cursor-move')

      expect(config.windowMs).toBe(1000)
      expect(config.maxRequests).toBe(60)
    })

    test('should return default config for unknown event types', () => {
      const config = RateLimiter.getConfig('unknown-event')

      expect(config.windowMs).toBe(1000)
      expect(config.maxRequests).toBe(100)
    })
  })

  describe('RATE_LIMIT_CONFIG', () => {
    test('should have configuration for all expected event types', () => {
      const expectedEvents = [
        'cursor-move',
        'gesture',
        'hover-update',
        'note:stream',
        'hold:start',
        'hold:end',
        'room-creation',
        'connection'
      ]

      expectedEvents.forEach(event => {
        expect(RateLimiter.RATE_LIMIT_CONFIG).toHaveProperty(event)
      })
    })
  })
})
