/**
 * Integration Test: Virtual User Lifecycle
 * Tests solo/multi mode transitions with virtual user activation/deactivation
 */

const RoomManager = require('../../src/services/RoomManager')
const VirtualUserService = require('../../src/services/VirtualUserService')
const WebMetricsPoller = require('../../src/services/WebMetricsPoller')

// Use fake timers to avoid hanging tests from VirtualUserService timers
jest.useFakeTimers()

describe('Virtual User Lifecycle Integration', () => {
  let roomManager
  let virtualUserService
  let webMetricsPoller
  let mockIO
  let emittedEvents

  beforeEach(() => {
    // Track emitted events
    emittedEvents = []

    // Create mock Socket.IO
    mockIO = {
      to: jest.fn((roomId) => ({
        emit: jest.fn((event, data) => {
          emittedEvents.push({ roomId, event, data })
        })
      }))
    }

    // Create services
    webMetricsPoller = new WebMetricsPoller()
    virtualUserService = new VirtualUserService()
    virtualUserService.setWebMetricsPoller(webMetricsPoller)
    virtualUserService.setSocketIO(mockIO)

    roomManager = new RoomManager()
    roomManager.setVirtualUserService(virtualUserService)
    roomManager.setSocketIO(mockIO)
  })

  afterEach(() => {
    // Clear all timers
    jest.clearAllTimers()
    virtualUserService.shutdown()
    roomManager.shutdown()
    webMetricsPoller.stop()
  })

  describe('Solo Mode Activation', () => {
    test('first user joining should activate virtual users', async () => {
      const result = await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })

      expect(result.success).toBe(true)
      expect(virtualUserService.isActiveForRoom('test-room')).toBe(true)

      // Check virtual-users-activated event was emitted
      const activationEvent = emittedEvents.find(e =>
        e.event === 'virtual-users-activated' && e.roomId === 'test-room'
      )
      expect(activationEvent).toBeDefined()
      expect(activationEvent.data.virtualUsers).toHaveLength(2)
    })

    test('room should be in solo mode with 1 user', async () => {
      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })

      const room = roomManager.getRoom('test-room')
      expect(room.mode).toBe('solo')
      expect(room.getUserCount()).toBe(1)
    })

    test('virtual users should be registered in room', async () => {
      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })

      const room = roomManager.getRoom('test-room')
      expect(room.hasVirtualUsers()).toBe(true)
      expect(room.getVirtualUsers().size).toBe(2)
    })
  })

  describe('Solo → Multi Transition', () => {
    test('second user joining should deactivate virtual users', async () => {
      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })
      emittedEvents = [] // Clear events from first join

      await roomManager.joinRoom('user2', 'test-room', { device: 'desktop' })

      expect(virtualUserService.isActiveForRoom('test-room')).toBe(false)

      // Check virtual-users-deactivated event was emitted
      const deactivationEvent = emittedEvents.find(e =>
        e.event === 'virtual-users-deactivated' && e.roomId === 'test-room'
      )
      expect(deactivationEvent).toBeDefined()
    })

    test('mode-transition event should be emitted', async () => {
      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })
      emittedEvents = []

      await roomManager.joinRoom('user2', 'test-room', { device: 'desktop' })

      const transitionEvent = emittedEvents.find(e =>
        e.event === 'mode-transition' && e.roomId === 'test-room'
      )
      expect(transitionEvent).toBeDefined()
      expect(transitionEvent.data.message).toBeDefined()
      expect(transitionEvent.data.duration).toBe(3000)
    })

    test('room should be in multi mode with 2 users', async () => {
      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })
      await roomManager.joinRoom('user2', 'test-room', { device: 'desktop' })

      const room = roomManager.getRoom('test-room')
      expect(room.mode).toBe('multi')
      expect(room.getUserCount()).toBe(2)
    })

    test('virtual users should be cleared from room', async () => {
      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })
      await roomManager.joinRoom('user2', 'test-room', { device: 'desktop' })

      const room = roomManager.getRoom('test-room')
      expect(room.hasVirtualUsers()).toBe(false)
      expect(room.getVirtualUsers().size).toBe(0)
    })
  })

  describe('Multi → Solo Transition', () => {
    test('user leaving should reactivate virtual users when only 1 remains', async () => {
      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })
      await roomManager.joinRoom('user2', 'test-room', { device: 'desktop' })
      emittedEvents = []

      await roomManager.leaveRoom('user2')

      expect(virtualUserService.isActiveForRoom('test-room')).toBe(true)

      // Check virtual-users-activated event was emitted
      const activationEvent = emittedEvents.find(e =>
        e.event === 'virtual-users-activated' && e.roomId === 'test-room'
      )
      expect(activationEvent).toBeDefined()
    })

    test('room should return to solo mode', async () => {
      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })
      await roomManager.joinRoom('user2', 'test-room', { device: 'desktop' })
      await roomManager.leaveRoom('user2')

      const room = roomManager.getRoom('test-room')
      expect(room.mode).toBe('solo')
    })

    test('virtual users should be restored in room', async () => {
      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })
      await roomManager.joinRoom('user2', 'test-room', { device: 'desktop' })
      await roomManager.leaveRoom('user2')

      const room = roomManager.getRoom('test-room')
      expect(room.hasVirtualUsers()).toBe(true)
    })
  })

  describe('Room Empty Transition', () => {
    test('last user leaving should deactivate virtual users', async () => {
      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })
      emittedEvents = []

      await roomManager.leaveRoom('user1')

      expect(virtualUserService.isActiveForRoom('test-room')).toBe(false)
    })

    test('room should be inactive when empty', async () => {
      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })
      await roomManager.leaveRoom('user1')

      const room = roomManager.getRoom('test-room')
      expect(room.isActive).toBe(false)
      expect(room.getUserCount()).toBe(0)
    })
  })

  describe('Multiple Transitions', () => {
    test('should handle rapid join/leave cycles', async () => {
      // User 1 joins (solo, virtual activated)
      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })
      expect(virtualUserService.isActiveForRoom('test-room')).toBe(true)

      // User 2 joins (multi, virtual deactivated)
      await roomManager.joinRoom('user2', 'test-room', { device: 'desktop' })
      expect(virtualUserService.isActiveForRoom('test-room')).toBe(false)

      // User 3 joins (multi, stays multi)
      await roomManager.joinRoom('user3', 'test-room', { device: 'desktop' })
      expect(virtualUserService.isActiveForRoom('test-room')).toBe(false)

      // User 2 leaves (multi, stays multi)
      await roomManager.leaveRoom('user2')
      expect(virtualUserService.isActiveForRoom('test-room')).toBe(false)

      // User 3 leaves (solo, virtual reactivated)
      await roomManager.leaveRoom('user3')
      expect(virtualUserService.isActiveForRoom('test-room')).toBe(true)

      // User 1 leaves (empty, virtual deactivated)
      await roomManager.leaveRoom('user1')
      expect(virtualUserService.isActiveForRoom('test-room')).toBe(false)
    })

    test('room mode should be correct after multiple transitions', async () => {
      const room = roomManager.getRoom('test-room') || (() => {
        roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })
        return roomManager.getRoom('test-room')
      })()

      await roomManager.joinRoom('user1', 'test-room', { device: 'desktop' })
      const roomAfterJoin = roomManager.getRoom('test-room')
      expect(roomAfterJoin.mode).toBe('solo')

      await roomManager.joinRoom('user2', 'test-room', { device: 'desktop' })
      expect(roomAfterJoin.mode).toBe('multi')

      await roomManager.joinRoom('user3', 'test-room', { device: 'desktop' })
      expect(roomAfterJoin.mode).toBe('multi')

      await roomManager.leaveRoom('user3')
      expect(roomAfterJoin.mode).toBe('multi')

      await roomManager.leaveRoom('user2')
      expect(roomAfterJoin.mode).toBe('solo')
    })
  })

  describe('Multiple Rooms', () => {
    test('virtual users should be managed independently per room', async () => {
      // Room 1: solo mode
      await roomManager.joinRoom('user1', 'room1', { device: 'desktop' })
      expect(virtualUserService.isActiveForRoom('room1')).toBe(true)

      // Room 2: solo mode
      await roomManager.joinRoom('user2', 'room2', { device: 'desktop' })
      expect(virtualUserService.isActiveForRoom('room2')).toBe(true)

      // Room 2 transitions to multi
      await roomManager.joinRoom('user3', 'room2', { device: 'desktop' })
      expect(virtualUserService.isActiveForRoom('room2')).toBe(false)
      expect(virtualUserService.isActiveForRoom('room1')).toBe(true) // Room 1 unaffected
    })

    test('events should be scoped to correct rooms', async () => {
      await roomManager.joinRoom('user1', 'room1', { device: 'desktop' })
      await roomManager.joinRoom('user2', 'room2', { device: 'desktop' })

      // Check each room got its own activation event
      const room1Activation = emittedEvents.find(e =>
        e.event === 'virtual-users-activated' && e.roomId === 'room1'
      )
      const room2Activation = emittedEvents.find(e =>
        e.event === 'virtual-users-activated' && e.roomId === 'room2'
      )

      expect(room1Activation).toBeDefined()
      expect(room2Activation).toBeDefined()
      expect(room1Activation.data.roomId).toBe('room1')
      expect(room2Activation.data.roomId).toBe('room2')
    })
  })

  describe('Overflow Room Creation', () => {
    test('should create overflow room when main room is full', async () => {
      // Fill room to capacity (4 users)
      for (let i = 1; i <= 4; i++) {
        await roomManager.joinRoom(`user${i}`, 'main-room', { device: 'desktop' })
      }

      const mainRoom = roomManager.getRoom('main-room')
      expect(mainRoom.isFull()).toBe(true)

      // 5th user should be redirected to overflow room
      const result = await roomManager.joinRoom('user5', 'main-room', { device: 'desktop' })

      expect(result.success).toBe(true)
      expect(result.room.roomId).toBe('main-room-2')
    })

    test('overflow room should have its own virtual users in solo mode', async () => {
      // Fill main room
      for (let i = 1; i <= 4; i++) {
        await roomManager.joinRoom(`user${i}`, 'main-room', { device: 'desktop' })
      }

      // Join overflow room (should be solo initially)
      await roomManager.joinRoom('user5', 'main-room', { device: 'desktop' })

      expect(virtualUserService.isActiveForRoom('main-room-2')).toBe(true)
    })

    test('should create multiple overflow rooms', async () => {
      // Fill main room and first overflow
      for (let i = 1; i <= 4; i++) {
        await roomManager.joinRoom(`user${i}`, 'main-room', { device: 'desktop' })
      }
      for (let i = 5; i <= 8; i++) {
        await roomManager.joinRoom(`user${i}`, 'main-room', { device: 'desktop' })
      }

      // 9th user should go to main-room-3
      const result = await roomManager.joinRoom('user9', 'main-room', { device: 'desktop' })

      expect(result.room.roomId).toBe('main-room-3')
    })
  })
})
