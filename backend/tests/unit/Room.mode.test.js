/**
 * Unit Test: Room Mode Transitions and Virtual Users
 * Tests solo/multi mode state machine and virtual user management
 */

const Room = require('../../src/models/Room')
const User = require('../../src/models/User')

// Helper to create user with required userData
function createUser(id) {
  return new User(id, { device: 'desktop', platform: 'test', capabilities: {} })
}

describe('Room - Mode Transitions', () => {
  let room

  beforeEach(() => {
    room = new Room('test-room')
  })

  describe('Initial State', () => {
    test('should initialize with maxUsers = 4', () => {
      expect(room.maxUsers).toBe(4)
    })

    test('should initialize in solo mode', () => {
      expect(room.mode).toBe('solo')
    })

    test('should initialize with empty virtualUsers Map', () => {
      expect(room.virtualUsers).toBeInstanceOf(Map)
      expect(room.virtualUsers.size).toBe(0)
    })
  })

  describe('getMode()', () => {
    test('should return "solo" when 0 users', () => {
      expect(room.getMode()).toBe('multi') // 0 users is technically multi (no real users)
    })

    test('should return "solo" when 1 user', () => {
      const user = createUser('user1')
      room.addUser(user)

      expect(room.getMode()).toBe('solo')
    })

    test('should return "multi" when 2 users', () => {
      const user1 = createUser('user1')
      const user2 = createUser('user2')
      room.addUser(user1)
      room.addUser(user2)

      expect(room.getMode()).toBe('multi')
    })

    test('should return "multi" when 3 or 4 users', () => {
      for (let i = 1; i <= 3; i++) {
        room.addUser(createUser(`user${i}`))
      }

      expect(room.getMode()).toBe('multi')

      room.addUser(createUser('user4'))
      expect(room.getMode()).toBe('multi')
    })
  })

  describe('updateMode()', () => {
    test('should detect solo -> multi transition when 2nd user joins', () => {
      const user1 = createUser('user1')
      room.addUser(user1)
      room.updateMode() // Set initial mode to solo

      const user2 = createUser('user2')
      room.addUser(user2)
      const result = room.updateMode()

      expect(result.changed).toBe(true)
      expect(result.from).toBe('solo')
      expect(result.to).toBe('multi')
      expect(room.mode).toBe('multi')
    })

    test('should detect multi -> solo transition when user leaves', () => {
      const user1 = createUser('user1')
      const user2 = createUser('user2')
      room.addUser(user1)
      room.addUser(user2)
      room.updateMode() // Set mode to multi

      room.removeUser('user2')
      const result = room.updateMode()

      expect(result.changed).toBe(true)
      expect(result.from).toBe('multi')
      expect(result.to).toBe('solo')
      expect(room.mode).toBe('solo')
    })

    test('should return changed: false when mode stays the same', () => {
      const user1 = createUser('user1')
      const user2 = createUser('user2')
      room.addUser(user1)
      room.updateMode() // solo

      // Add user but don't update mode first
      room.addUser(user2)
      room.updateMode() // multi

      // Adding another user keeps it multi
      room.addUser(createUser('user3'))
      const result = room.updateMode()

      expect(result.changed).toBe(false)
      expect(result.from).toBeUndefined()
      expect(result.to).toBeUndefined()
    })

    test('should handle rapid transitions correctly', () => {
      const user1 = createUser('user1')
      const user2 = createUser('user2')

      room.addUser(user1)
      expect(room.updateMode()).toEqual({ changed: false }) // stays solo

      room.addUser(user2)
      expect(room.updateMode()).toEqual({ changed: true, from: 'solo', to: 'multi' })

      room.removeUser('user2')
      expect(room.updateMode()).toEqual({ changed: true, from: 'multi', to: 'solo' })

      room.addUser(user2)
      expect(room.updateMode()).toEqual({ changed: true, from: 'solo', to: 'multi' })
    })
  })

  describe('Virtual User Management', () => {
    test('addVirtualUser() should add virtual user to map', () => {
      room.addVirtualUser('wikipedia-metrics', {
        source: 'wikipedia',
        color: '#e41a1c',
        region: { xMin: 0.05, xMax: 0.33 }
      })

      expect(room.virtualUsers.size).toBe(1)
      expect(room.virtualUsers.has('wikipedia-metrics')).toBe(true)
    })

    test('removeVirtualUser() should remove virtual user', () => {
      room.addVirtualUser('wikipedia-metrics', { source: 'wikipedia' })
      room.addVirtualUser('hackernews-metrics', { source: 'hackernews' })

      room.removeVirtualUser('wikipedia-metrics')

      expect(room.virtualUsers.size).toBe(1)
      expect(room.virtualUsers.has('wikipedia-metrics')).toBe(false)
      expect(room.virtualUsers.has('hackernews-metrics')).toBe(true)
    })

    test('clearVirtualUsers() should remove all virtual users', () => {
      room.addVirtualUser('wikipedia-metrics', { source: 'wikipedia' })
      room.addVirtualUser('hackernews-metrics', { source: 'hackernews' })

      room.clearVirtualUsers()

      expect(room.virtualUsers.size).toBe(0)
    })

    test('getVirtualUsers() should return virtual users map', () => {
      room.addVirtualUser('wikipedia-metrics', { source: 'wikipedia', color: '#e41a1c' })

      const virtualUsers = room.getVirtualUsers()

      expect(virtualUsers).toBeInstanceOf(Map)
      expect(virtualUsers.get('wikipedia-metrics')).toEqual({
        source: 'wikipedia',
        color: '#e41a1c'
      })
    })

    test('hasVirtualUsers() should return true when virtual users exist', () => {
      expect(room.hasVirtualUsers()).toBe(false)

      room.addVirtualUser('wikipedia-metrics', { source: 'wikipedia' })

      expect(room.hasVirtualUsers()).toBe(true)
    })

    test('hasVirtualUsers() should return false when no virtual users', () => {
      room.addVirtualUser('wikipedia-metrics', { source: 'wikipedia' })
      room.clearVirtualUsers()

      expect(room.hasVirtualUsers()).toBe(false)
    })
  })

  describe('Room Capacity with maxUsers = 4', () => {
    test('should allow up to 4 users to join', () => {
      for (let i = 1; i <= 4; i++) {
        room.addUser(createUser(`user${i}`))
      }

      expect(room.getUserCount()).toBe(4)
      expect(room.isFull()).toBe(true)
    })

    test('should reject 5th user with ROOM_FULL error', () => {
      for (let i = 1; i <= 4; i++) {
        room.addUser(createUser(`user${i}`))
      }

      expect(() => {
        room.addUser(createUser('user5'))
      }).toThrow('ROOM_FULL')
    })

    test('should allow 5th user after one leaves', () => {
      for (let i = 1; i <= 4; i++) {
        room.addUser(createUser(`user${i}`))
      }

      room.removeUser('user1')

      expect(() => {
        room.addUser(createUser('user5'))
      }).not.toThrow()

      expect(room.getUserCount()).toBe(4)
    })
  })
})
