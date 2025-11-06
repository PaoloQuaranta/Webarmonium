/**
 * Unit Tests for UIManager
 * Sprint 3: Testing extracted component from Sprint 2
 * Target Coverage: 90%+
 */

const UIManager = require('../../src/services/UIManager.js')

describe('UIManager', () => {
  let manager
  let mockElements

  // Helper to create mock DOM elements
  const createMockElement = (id) => ({
    id: id,
    style: {
      display: ''
    },
    textContent: '',
    classList: {
      add: jest.fn(),
      remove: jest.fn(),
      contains: jest.fn()
    }
  })

  beforeEach(() => {
    // Create mock elements
    mockElements = {
      loadingScreen: createMockElement('loadingScreen'),
      appContent: createMockElement('appContent'),
      errorDisplay: createMockElement('errorDisplay'),
      errorMessage: createMockElement('errorMessage'),
      userCount: createMockElement('userCount'),
      roomId: createMockElement('roomId')
    }

    // Mock document.getElementById
    document.getElementById = jest.fn((id) => mockElements[id] || null)

    manager = new UIManager()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Constructor', () => {
    test('should initialize with default element IDs', () => {
      expect(manager.elementIds).toEqual({
        loadingScreen: 'loadingScreen',
        appContent: 'appContent',
        errorDisplay: 'errorDisplay',
        errorMessage: 'errorMessage',
        userCount: 'userCount',
        roomId: 'roomId'
      })
    })

    test('should accept custom element IDs', () => {
      const customManager = new UIManager({
        loadingScreen: 'customLoading',
        appContent: 'customApp'
      })

      expect(customManager.elementIds.loadingScreen).toBe('customLoading')
      expect(customManager.elementIds.appContent).toBe('customApp')
      expect(customManager.elementIds.errorDisplay).toBe('errorDisplay') // Default
    })

    test('should initialize with default state', () => {
      expect(manager.currentRoom).toBeNull()
      expect(manager.userCount).toBe(1)
    })
  })

  describe('updateRoomDisplay()', () => {
    test('should update user count display', () => {
      manager.updateRoomDisplay(null, 5)

      expect(mockElements.userCount.textContent).toBe('👥 5 users')
    })

    test('should use singular "user" for count of 1', () => {
      manager.updateRoomDisplay(null, 1)

      expect(mockElements.userCount.textContent).toBe('👥 1 user')
    })

    test('should use plural "users" for count > 1', () => {
      manager.updateRoomDisplay(null, 2)
      expect(mockElements.userCount.textContent).toBe('👥 2 users')

      manager.updateRoomDisplay(null, 10)
      expect(mockElements.userCount.textContent).toBe('👥 10 users')
    })

    test('should update room ID display with room.id', () => {
      const roomData = { id: 'room-123' }
      manager.updateRoomDisplay(roomData, null)

      expect(mockElements.roomId.textContent).toBe('Room: room-123')
    })

    test('should update room ID display with room.roomId', () => {
      const roomData = { roomId: 'room-456' }
      manager.updateRoomDisplay(roomData, null)

      expect(mockElements.roomId.textContent).toBe('Room: room-456')
    })

    test('should prefer room.id over room.roomId', () => {
      const roomData = { id: 'primary-id', roomId: 'secondary-id' }
      manager.updateRoomDisplay(roomData, null)

      expect(mockElements.roomId.textContent).toBe('Room: primary-id')
    })

    test('should store room data', () => {
      const roomData = { id: 'room-789' }
      manager.updateRoomDisplay(roomData, null)

      expect(manager.currentRoom).toBe(roomData)
    })

    test('should store user count', () => {
      manager.updateRoomDisplay(null, 7)

      expect(manager.userCount).toBe(7)
    })

    test('should handle both room and user count updates', () => {
      const roomData = { id: 'room-abc' }
      manager.updateRoomDisplay(roomData, 3)

      expect(manager.currentRoom).toBe(roomData)
      expect(manager.userCount).toBe(3)
      expect(mockElements.userCount.textContent).toBe('👥 3 users')
      expect(mockElements.roomId.textContent).toBe('Room: room-abc')
    })

    test('should handle missing userCount element gracefully', () => {
      document.getElementById = jest.fn((id) => {
        if (id === 'userCount') return null
        return mockElements[id]
      })

      expect(() => manager.updateRoomDisplay(null, 5)).not.toThrow()
    })

    test('should handle missing roomId element gracefully', () => {
      document.getElementById = jest.fn((id) => {
        if (id === 'roomId') return null
        return mockElements[id]
      })

      const roomData = { id: 'room-123' }
      expect(() => manager.updateRoomDisplay(roomData, null)).not.toThrow()
    })

    test('should not update display if both params are null', () => {
      const initialRoom = manager.currentRoom
      const initialCount = manager.userCount

      manager.updateRoomDisplay(null, null)

      expect(manager.currentRoom).toBe(initialRoom)
      expect(manager.userCount).toBe(initialCount)
    })

    test('should update display with existing state when called without params', () => {
      manager.currentRoom = { id: 'existing-room' }
      manager.userCount = 5

      manager.updateRoomDisplay()

      expect(mockElements.userCount.textContent).toBe('👥 5 users')
      expect(mockElements.roomId.textContent).toBe('Room: existing-room')
    })
  })

  describe('showApp()', () => {
    test('should hide loading screen', () => {
      manager.showApp()

      expect(mockElements.loadingScreen.style.display).toBe('none')
    })

    test('should add "loaded" class to app content', () => {
      manager.showApp()

      expect(mockElements.appContent.classList.add).toHaveBeenCalledWith('loaded')
    })

    test('should handle missing loading screen gracefully', () => {
      document.getElementById = jest.fn((id) => {
        if (id === 'loadingScreen') return null
        return mockElements[id]
      })

      expect(() => manager.showApp()).not.toThrow()
    })

    test('should handle missing app content gracefully', () => {
      document.getElementById = jest.fn((id) => {
        if (id === 'appContent') return null
        return mockElements[id]
      })

      expect(() => manager.showApp()).not.toThrow()
    })
  })

  describe('showError()', () => {
    test('should hide loading screen', () => {
      manager.showError('Test error')

      expect(mockElements.loadingScreen.style.display).toBe('none')
    })

    test('should set error message text', () => {
      const errorMsg = 'Connection failed'
      manager.showError(errorMsg)

      expect(mockElements.errorMessage.textContent).toBe(errorMsg)
    })

    test('should show error display', () => {
      manager.showError('Test error')

      expect(mockElements.errorDisplay.style.display).toBe('block')
    })

    test('should handle missing loading screen gracefully', () => {
      document.getElementById = jest.fn((id) => {
        if (id === 'loadingScreen') return null
        return mockElements[id]
      })

      expect(() => manager.showError('Test')).not.toThrow()
    })

    test('should handle missing error message element gracefully', () => {
      document.getElementById = jest.fn((id) => {
        if (id === 'errorMessage') return null
        return mockElements[id]
      })

      expect(() => manager.showError('Test')).not.toThrow()
    })

    test('should handle missing error display element gracefully', () => {
      document.getElementById = jest.fn((id) => {
        if (id === 'errorDisplay') return null
        return mockElements[id]
      })

      expect(() => manager.showError('Test')).not.toThrow()
    })

    test('should handle empty error message', () => {
      manager.showError('')

      expect(mockElements.errorMessage.textContent).toBe('')
    })
  })

  describe('hideError()', () => {
    test('should hide error display', () => {
      manager.hideError()

      expect(mockElements.errorDisplay.style.display).toBe('none')
    })

    test('should handle missing error display element gracefully', () => {
      document.getElementById = jest.fn(() => null)

      expect(() => manager.hideError()).not.toThrow()
    })
  })

  describe('showLoading()', () => {
    test('should show loading screen', () => {
      manager.showLoading()

      expect(mockElements.loadingScreen.style.display).toBe('block')
    })

    test('should handle missing loading screen gracefully', () => {
      document.getElementById = jest.fn(() => null)

      expect(() => manager.showLoading()).not.toThrow()
    })
  })

  describe('getCurrentRoom()', () => {
    test('should return current room', () => {
      const roomData = { id: 'room-123' }
      manager.currentRoom = roomData

      expect(manager.getCurrentRoom()).toBe(roomData)
    })

    test('should return null if no room set', () => {
      expect(manager.getCurrentRoom()).toBeNull()
    })
  })

  describe('getUserCount()', () => {
    test('should return current user count', () => {
      manager.userCount = 5

      expect(manager.getUserCount()).toBe(5)
    })

    test('should return default count of 1', () => {
      expect(manager.getUserCount()).toBe(1)
    })
  })

  describe('setCurrentRoom()', () => {
    test('should set room and update display', () => {
      const roomData = { id: 'new-room' }
      manager.setCurrentRoom(roomData)

      expect(manager.currentRoom).toBe(roomData)
      expect(mockElements.roomId.textContent).toBe('Room: new-room')
    })

    test('should call updateRoomDisplay', () => {
      const updateSpy = jest.spyOn(manager, 'updateRoomDisplay')
      const roomData = { id: 'test-room' }

      manager.setCurrentRoom(roomData)

      expect(updateSpy).toHaveBeenCalled()
    })
  })

  describe('setUserCount()', () => {
    test('should set user count and update display', () => {
      manager.setUserCount(10)

      expect(manager.userCount).toBe(10)
      expect(mockElements.userCount.textContent).toBe('👥 10 users')
    })

    test('should call updateRoomDisplay', () => {
      const updateSpy = jest.spyOn(manager, 'updateRoomDisplay')

      manager.setUserCount(5)

      expect(updateSpy).toHaveBeenCalled()
    })
  })

  describe('destroy()', () => {
    test('should reset room to null', () => {
      manager.currentRoom = { id: 'test' }
      manager.destroy()

      expect(manager.currentRoom).toBeNull()
    })

    test('should reset user count to 1', () => {
      manager.userCount = 10
      manager.destroy()

      expect(manager.userCount).toBe(1)
    })

    test('should not throw if called multiple times', () => {
      manager.destroy()

      expect(() => manager.destroy()).not.toThrow()
    })
  })

  describe('State Management Integration', () => {
    test('should maintain consistent state across operations', () => {
      // Set initial state
      const room1 = { id: 'room-1' }
      manager.setCurrentRoom(room1)
      manager.setUserCount(3)

      expect(manager.getCurrentRoom()).toBe(room1)
      expect(manager.getUserCount()).toBe(3)

      // Update state
      const room2 = { id: 'room-2' }
      manager.updateRoomDisplay(room2, 5)

      expect(manager.getCurrentRoom()).toBe(room2)
      expect(manager.getUserCount()).toBe(5)

      // Reset state
      manager.destroy()

      expect(manager.getCurrentRoom()).toBeNull()
      expect(manager.getUserCount()).toBe(1)
    })

    test('should handle rapid state changes', () => {
      for (let i = 1; i <= 10; i++) {
        manager.setUserCount(i)
        expect(manager.getUserCount()).toBe(i)
      }
    })
  })

  describe('UI State Transitions', () => {
    test('should transition from loading to app', () => {
      manager.showLoading()
      expect(mockElements.loadingScreen.style.display).toBe('block')

      manager.showApp()
      expect(mockElements.loadingScreen.style.display).toBe('none')
      expect(mockElements.appContent.classList.add).toHaveBeenCalledWith('loaded')
    })

    test('should transition from loading to error', () => {
      manager.showLoading()
      expect(mockElements.loadingScreen.style.display).toBe('block')

      manager.showError('Failed to connect')
      expect(mockElements.loadingScreen.style.display).toBe('none')
      expect(mockElements.errorDisplay.style.display).toBe('block')
    })

    test('should hide error and show loading again', () => {
      manager.showError('Test error')
      expect(mockElements.errorDisplay.style.display).toBe('block')

      manager.hideError()
      expect(mockElements.errorDisplay.style.display).toBe('none')

      manager.showLoading()
      expect(mockElements.loadingScreen.style.display).toBe('block')
    })
  })

  describe('Edge Cases', () => {
    test('should handle userCount = 0', () => {
      manager.updateRoomDisplay(null, 0)

      expect(mockElements.userCount.textContent).toBe('👥 0 users')
    })

    test('should handle very large user count', () => {
      manager.updateRoomDisplay(null, 9999)

      expect(mockElements.userCount.textContent).toBe('👥 9999 users')
    })

    test('should handle room with no id or roomId', () => {
      const invalidRoom = { name: 'No ID Room' }

      expect(() => manager.updateRoomDisplay(invalidRoom, null)).not.toThrow()
    })

    test('should handle very long error messages', () => {
      const longMessage = 'A'.repeat(1000)
      manager.showError(longMessage)

      expect(mockElements.errorMessage.textContent).toBe(longMessage)
    })

    test('should handle special characters in room ID', () => {
      const room = { id: 'room-<script>alert("xss")</script>' }
      manager.updateRoomDisplay(room, null)

      // textContent automatically escapes HTML, so this should be safe
      expect(mockElements.roomId.textContent).toContain('script')
    })
  })

  describe('Module Exports', () => {
    test('should be available as CommonJS module', () => {
      expect(UIManager).toBeDefined()
      expect(typeof UIManager).toBe('function')
    })

    test('should create instance without errors', () => {
      const instance = new UIManager()
      expect(instance).toBeInstanceOf(UIManager)
    })
  })
})
