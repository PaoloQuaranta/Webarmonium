const ColorAssignmentService = require('../../src/services/ColorAssignmentService')
const { REAL_USER_COLOR_POOL } = require('../../src/constants/colors')

/**
 * Unit Test: ColorAssignmentService
 * Tests color pool management, assignment, and release logic
 *
 * UPDATED: Now uses 7-color pool for real users only
 * Virtual user colors (red, orange, blue) are excluded
 */

describe('ColorAssignmentService', () => {
  let service

  beforeEach(() => {
    service = new ColorAssignmentService()
  })

  describe('Initialization', () => {
    test('should initialize with 7 available colors (real users only)', () => {
      expect(service.getAvailableColorCount()).toBe(7)
      expect(service.getAssignedColorCount()).toBe(0)
    })

    test('should have correct color pool (excludes virtual user colors)', () => {
      // Real user colors only - excludes red (#e41a1c), orange (#ff7f00), blue (#377eb8)
      const expectedColors = REAL_USER_COLOR_POOL

      const state = service.getState()
      expect(state.availableColors).toEqual(expect.arrayContaining(expectedColors))
      expect(state.availableColors.length).toBe(7)
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
      expect(service.getAvailableColorCount()).toBe(6)
      expect(service.getAssignedColorCount()).toBe(1)
    })

    test('should assign different colors to different users', () => {
      const color1 = service.assignColor('user1')
      const color2 = service.assignColor('user2')
      const color3 = service.assignColor('user3')

      expect(color1).not.toBe(color2)
      expect(color1).not.toBe(color3)
      expect(color2).not.toBe(color3)

      expect(service.getAvailableColorCount()).toBe(4)
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

    test('should throw error when pool is exhausted (7 users)', () => {
      // Assign all 7 colors
      for (let i = 1; i <= 7; i++) {
        service.assignColor(`user${i}`)
      }

      expect(service.isFull()).toBe(true)
      expect(service.getAvailableColorCount()).toBe(0)

      // 8th user should fail
      expect(() => {
        service.assignColor('user8')
      }).toThrow('No colors available in pool (max 7 real users)')
    })

    test('should not be empty after assignment', () => {
      service.assignColor('user1')
      expect(service.isEmpty()).toBe(false)
    })
  })

  describe('releaseColor()', () => {
    test('should release color back to pool', () => {
      const color = service.assignColor('user1')

      expect(service.getAvailableColorCount()).toBe(6)

      const released = service.releaseColor('user1')

      expect(released).toBe(color)
      expect(service.getAvailableColorCount()).toBe(7)
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
      expect(service.getAvailableColorCount()).toBe(6)
    })

    test('should throw error if userId is missing', () => {
      expect(() => {
        service.releaseColor(null)
      }).toThrow('User ID is required')
    })
  })

  describe('Color pool recycling', () => {
    test('should allow 8th user after one leaves', () => {
      // Fill pool with 7 users
      const colors = []
      for (let i = 1; i <= 7; i++) {
        colors.push(service.assignColor(`user${i}`))
      }

      expect(service.isFull()).toBe(true)

      // 8th user fails
      expect(() => {
        service.assignColor('user8')
      }).toThrow('No colors available')

      // User 1 leaves
      service.releaseColor('user1')

      expect(service.isFull()).toBe(false)

      // 8th user can now join
      const color8 = service.assignColor('user8')
      expect(color8).toMatch(/^#[0-9a-f]{6}$/)
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

      // Should have seen all 7 colors
      expect(assignedColors.size).toBe(7)
    })
  })

  describe('reset()', () => {
    test('should reset to initial state', () => {
      // Assign some colors
      service.assignColor('user1')
      service.assignColor('user2')
      service.assignColor('user3')

      expect(service.getAssignedColorCount()).toBe(3)
      expect(service.getAvailableColorCount()).toBe(4)

      // Reset
      service.reset()

      expect(service.getAssignedColorCount()).toBe(0)
      expect(service.getAvailableColorCount()).toBe(7)
      expect(service.isEmpty()).toBe(true)
      expect(service.isFull()).toBe(false)
    })
  })

  describe('getState()', () => {
    test('should return current state', () => {
      service.assignColor('user1')
      service.assignColor('user2')

      const state = service.getState()

      expect(state).toHaveProperty('totalColors', 7)
      expect(state).toHaveProperty('availableColors')
      expect(state).toHaveProperty('assignedColors')
      expect(state).toHaveProperty('availableCount', 5)
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
    test('should identify colors from real user pool', () => {
      // Real user colors (in pool)
      expect(service.isPoolColor('#4daf4a')).toBe(true) // Green
      expect(service.isPoolColor('#984ea3')).toBe(true) // Purple
      expect(service.isPoolColor('#66c2a5')).toBe(true) // Teal
    })

    test('should reject virtual user colors (not in pool)', () => {
      // Virtual user colors are excluded from real user pool
      expect(service.isPoolColor('#e41a1c')).toBe(false) // Red (Wikipedia)
      expect(service.isPoolColor('#ff7f00')).toBe(false) // Orange (HackerNews)
      expect(service.isPoolColor('#377eb8')).toBe(false) // Blue (GitHub)
    })

    test('should reject colors not in any pool', () => {
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

      expect(service.getAvailableColorCount()).toBe(7)
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
