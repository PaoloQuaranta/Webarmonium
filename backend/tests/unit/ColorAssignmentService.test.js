const ColorAssignmentService = require('../../src/services/ColorAssignmentService')

/**
 * Unit Test: ColorAssignmentService
 * Tests color pool management, assignment, and release logic
 */

describe('ColorAssignmentService', () => {
  let service

  beforeEach(() => {
    service = new ColorAssignmentService()
  })

  describe('Initialization', () => {
    test('should initialize with 10 available colors', () => {
      expect(service.getAvailableColorCount()).toBe(10)
      expect(service.getAssignedColorCount()).toBe(0)
    })

    test('should have correct color pool', () => {
      const expectedColors = [
        '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
        '#ffff33', '#a65628', '#f781bf', '#999999', '#66c2a5'
      ]

      const state = service.getState()
      expect(state.availableColors).toEqual(expect.arrayContaining(expectedColors))
      expect(state.availableColors.length).toBe(10)
    })

    test('should not be full initially', () => {
      expect(service.isFull()).toBe(false)
    })

    test('should be empty initially', () => {
      expect(service.isEmpty()).toBe(true)
    })
  })

  describe('assignColor()', () => {
    test('should assign first available color to user', () => {
      const color = service.assignColor('user1')

      expect(color).toMatch(/^#[0-9a-f]{6}$/)
      expect(service.getAvailableColorCount()).toBe(9)
      expect(service.getAssignedColorCount()).toBe(1)
    })

    test('should assign different colors to different users', () => {
      const color1 = service.assignColor('user1')
      const color2 = service.assignColor('user2')
      const color3 = service.assignColor('user3')

      expect(color1).not.toBe(color2)
      expect(color1).not.toBe(color3)
      expect(color2).not.toBe(color3)

      expect(service.getAvailableColorCount()).toBe(7)
      expect(service.getAssignedColorCount()).toBe(3)
    })

    test('should track assigned color for user', () => {
      const color = service.assignColor('user1')

      expect(service.getAssignedColor('user1')).toBe(color)
      expect(service.hasAssignedColor('user1')).toBe(true)
    })

    test('should throw error if user already has color', () => {
      service.assignColor('user1')

      expect(() => {
        service.assignColor('user1')
      }).toThrow('User user1 already has an assigned color')
    })

    test('should throw error if userId is missing', () => {
      expect(() => {
        service.assignColor(null)
      }).toThrow('User ID is required')

      expect(() => {
        service.assignColor('')
      }).toThrow('User ID is required')
    })

    test('should throw error when pool is exhausted (10 users)', () => {
      // Assign all 10 colors
      for (let i = 1; i <= 10; i++) {
        service.assignColor(`user${i}`)
      }

      expect(service.isFull()).toBe(true)
      expect(service.getAvailableColorCount()).toBe(0)

      // 11th user should fail
      expect(() => {
        service.assignColor('user11')
      }).toThrow('No colors available in pool (max 10 users)')
    })

    test('should not be empty after assignment', () => {
      service.assignColor('user1')
      expect(service.isEmpty()).toBe(false)
    })
  })

  describe('releaseColor()', () => {
    test('should release color back to pool', () => {
      const color = service.assignColor('user1')

      expect(service.getAvailableColorCount()).toBe(9)

      const released = service.releaseColor('user1')

      expect(released).toBe(color)
      expect(service.getAvailableColorCount()).toBe(10)
      expect(service.getAssignedColorCount()).toBe(0)
      expect(service.hasAssignedColor('user1')).toBe(false)
    })

    test('should return null if user has no color', () => {
      const released = service.releaseColor('user1')
      expect(released).toBeNull()
    })

    test('should allow reassignment after release', () => {
      const color1 = service.assignColor('user1')
      service.releaseColor('user1')

      const color2 = service.assignColor('user2')

      // Color should be available again
      expect(color2).toMatch(/^#[0-9a-f]{6}$/)
      expect(service.getAvailableColorCount()).toBe(9)
    })

    test('should throw error if userId is missing', () => {
      expect(() => {
        service.releaseColor(null)
      }).toThrow('User ID is required')
    })
  })

  describe('Color pool recycling', () => {
    test('should allow 11th user after one leaves', () => {
      // Fill pool with 10 users
      const colors = []
      for (let i = 1; i <= 10; i++) {
        colors.push(service.assignColor(`user${i}`))
      }

      expect(service.isFull()).toBe(true)

      // 11th user fails
      expect(() => {
        service.assignColor('user11')
      }).toThrow('No colors available')

      // User 1 leaves
      service.releaseColor('user1')

      expect(service.isFull()).toBe(false)

      // 11th user can now join
      const color11 = service.assignColor('user11')
      expect(color11).toMatch(/^#[0-9a-f]{6}$/)
      expect(service.isFull()).toBe(true)
    })

    test('should cycle through all colors', () => {
      const assignedColors = new Set()

      // Assign and release 20 times
      for (let i = 1; i <= 20; i++) {
        const color = service.assignColor(`user${i}`)
        assignedColors.add(color)
        service.releaseColor(`user${i}`)
      }

      // Should have seen all 10 colors
      expect(assignedColors.size).toBe(10)
    })
  })

  describe('reset()', () => {
    test('should reset to initial state', () => {
      // Assign some colors
      service.assignColor('user1')
      service.assignColor('user2')
      service.assignColor('user3')

      expect(service.getAssignedColorCount()).toBe(3)
      expect(service.getAvailableColorCount()).toBe(7)

      // Reset
      service.reset()

      expect(service.getAssignedColorCount()).toBe(0)
      expect(service.getAvailableColorCount()).toBe(10)
      expect(service.isEmpty()).toBe(true)
      expect(service.isFull()).toBe(false)
    })
  })

  describe('getState()', () => {
    test('should return current state', () => {
      service.assignColor('user1')
      service.assignColor('user2')

      const state = service.getState()

      expect(state).toHaveProperty('totalColors', 10)
      expect(state).toHaveProperty('availableColors')
      expect(state).toHaveProperty('assignedColors')
      expect(state).toHaveProperty('availableCount', 8)
      expect(state).toHaveProperty('assignedCount', 2)

      expect(state.assignedColors).toHaveProperty('user1')
      expect(state.assignedColors).toHaveProperty('user2')
    })
  })

  describe('validateColor()', () => {
    test('should validate correct hex color format', () => {
      expect(ColorAssignmentService.validateColor('#e41a1c')).toBe(true)
      expect(ColorAssignmentService.validateColor('#000000')).toBe(true)
      expect(ColorAssignmentService.validateColor('#ffffff')).toBe(true)
    })

    test('should reject invalid hex color format', () => {
      expect(ColorAssignmentService.validateColor('#E41A1C')).toBe(false) // Uppercase
      expect(ColorAssignmentService.validateColor('#zzz')).toBe(false) // Invalid chars
      expect(ColorAssignmentService.validateColor('e41a1c')).toBe(false) // Missing #
      expect(ColorAssignmentService.validateColor('#e41a1')).toBe(false) // Too short
      expect(ColorAssignmentService.validateColor('#e41a1c1')).toBe(false) // Too long
    })
  })

  describe('isPoolColor()', () => {
    test('should identify colors from pool', () => {
      expect(service.isPoolColor('#e41a1c')).toBe(true)
      expect(service.isPoolColor('#377eb8')).toBe(true)
      expect(service.isPoolColor('#66c2a5')).toBe(true)
    })

    test('should reject colors not in pool', () => {
      expect(service.isPoolColor('#000000')).toBe(false)
      expect(service.isPoolColor('#ffffff')).toBe(false)
    })
  })

  describe('Edge cases', () => {
    test('should handle rapid assign/release cycles', () => {
      for (let i = 0; i < 100; i++) {
        const color = service.assignColor('user1')
        expect(color).toMatch(/^#[0-9a-f]{6}$/)
        service.releaseColor('user1')
      }

      expect(service.getAvailableColorCount()).toBe(10)
      expect(service.getAssignedColorCount()).toBe(0)
    })

    test('should handle multiple users with same prefix', () => {
      service.assignColor('user1')
      service.assignColor('user10')
      service.assignColor('user100')

      expect(service.getAssignedColorCount()).toBe(3)

      service.releaseColor('user1')
      expect(service.hasAssignedColor('user10')).toBe(true)
      expect(service.hasAssignedColor('user100')).toBe(true)
    })
  })
})
