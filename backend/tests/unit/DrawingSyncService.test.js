const DrawingSyncService = require('../../src/services/DrawingSyncService')
const DrawingStroke = require('../../src/models/DrawingStroke')

/**
 * Unit Test: DrawingSyncService
 * Tests stroke lifecycle management and synchronization logic
 */

describe('DrawingSyncService', () => {
  let service

  beforeEach(() => {
    service = new DrawingSyncService()
  })

  describe('Initialization', () => {
    test('should initialize with no active strokes', () => {
      expect(service.getActiveStrokeCount()).toBe(0)
      expect(service.getActiveUserIds()).toEqual([])
    })

    test('should have empty state initially', () => {
      const state = service.getState()
      expect(state.activeStrokeCount).toBe(0)
      expect(state.activeUserIds).toEqual([])
      expect(state.activeStrokes).toEqual([])
    })
  })

  describe('createStroke()', () => {
    test('should create new stroke with valid data', () => {
      const stroke = service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 150,
        strokeWidth: 3
      })

      expect(stroke).toBeInstanceOf(DrawingStroke)
      expect(stroke.userId).toBe('user1')
      expect(stroke.roomId).toBe('room1')
      expect(stroke.color).toBe('#e41a1c')
      expect(stroke.strokeWidth).toBe(3)
      expect(stroke.points.length).toBe(1)
      expect(stroke.points[0].x).toBe(100)
      expect(stroke.points[0].y).toBe(150)
    })

    test('should track active stroke for user', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 150,
        strokeWidth: 2
      })

      expect(service.hasActiveStroke('user1')).toBe(true)
      expect(service.getActiveStrokeCount()).toBe(1)
      expect(service.getActiveUserIds()).toEqual(['user1'])
    })

    test('should create strokes for multiple users', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 100,
        strokeWidth: 2
      })

      service.createStroke('user2', 'room1', '#377eb8', {
        x: 200,
        y: 200,
        strokeWidth: 3
      })

      expect(service.getActiveStrokeCount()).toBe(2)
      expect(service.getActiveUserIds()).toEqual(['user1', 'user2'])
    })

    test('should throw error if userId is missing', () => {
      expect(() => {
        service.createStroke(null, 'room1', '#e41a1c', {
          x: 100,
          y: 100,
          strokeWidth: 2
        })
      }).toThrow('userId, roomId, and color are required')

      expect(() => {
        service.createStroke('', 'room1', '#e41a1c', {
          x: 100,
          y: 100,
          strokeWidth: 2
        })
      }).toThrow('userId, roomId, and color are required')
    })

    test('should throw error if roomId is missing', () => {
      expect(() => {
        service.createStroke('user1', null, '#e41a1c', {
          x: 100,
          y: 100,
          strokeWidth: 2
        })
      }).toThrow('userId, roomId, and color are required')
    })

    test('should throw error if color is missing', () => {
      expect(() => {
        service.createStroke('user1', 'room1', null, {
          x: 100,
          y: 100,
          strokeWidth: 2
        })
      }).toThrow('userId, roomId, and color are required')
    })

    test('should throw error if start point is missing', () => {
      expect(() => {
        service.createStroke('user1', 'room1', '#e41a1c', {
          strokeWidth: 2
        })
      }).toThrow('Start point (x, y) is required')

      expect(() => {
        service.createStroke('user1', 'room1', '#e41a1c', {
          x: 100,
          strokeWidth: 2
        })
      }).toThrow('Start point (x, y) is required')
    })

    test('should throw error if strokeWidth is missing', () => {
      expect(() => {
        service.createStroke('user1', 'room1', '#e41a1c', {
          x: 100,
          y: 100
        })
      }).toThrow('strokeWidth is required')
    })

    test('should throw error if strokeWidth is out of range', () => {
      expect(() => {
        service.createStroke('user1', 'room1', '#e41a1c', {
          x: 100,
          y: 100,
          strokeWidth: 0
        })
      }).toThrow('strokeWidth must be between 1 and 20')

      expect(() => {
        service.createStroke('user1', 'room1', '#e41a1c', {
          x: 100,
          y: 100,
          strokeWidth: 21
        })
      }).toThrow('strokeWidth must be between 1 and 20')

      expect(() => {
        service.createStroke('user1', 'room1', '#e41a1c', {
          x: 100,
          y: 100,
          strokeWidth: -5
        })
      }).toThrow('strokeWidth must be between 1 and 20')
    })

    test('should throw error if user already has active stroke', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 100,
        strokeWidth: 2
      })

      expect(() => {
        service.createStroke('user1', 'room1', '#e41a1c', {
          x: 200,
          y: 200,
          strokeWidth: 3
        })
      }).toThrow('User user1 already has an active stroke')
    })
  })

  describe('addPoint()', () => {
    beforeEach(() => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 100,
        strokeWidth: 2
      })
    })

    test('should add point to active stroke', () => {
      const stroke = service.addPoint('user1', { x: 150, y: 150 })

      expect(stroke.points.length).toBe(2)
      expect(stroke.points[1].x).toBe(150)
      expect(stroke.points[1].y).toBe(150)
      expect(stroke.points[1].timestamp).toBeGreaterThanOrEqual(0)
    })

    test('should add multiple points to stroke', () => {
      service.addPoint('user1', { x: 150, y: 150 })
      service.addPoint('user1', { x: 200, y: 200 })
      const stroke = service.addPoint('user1', { x: 250, y: 250 })

      expect(stroke.points.length).toBe(4) // Start + 3 added
      expect(stroke.points[3].x).toBe(250)
      expect(stroke.points[3].y).toBe(250)
    })

    test('should calculate correct timestamps', () => {
      const stroke1 = service.addPoint('user1', { x: 150, y: 150 })
      const timestamp1 = stroke1.points[1].timestamp

      // Wait a bit
      const delay = new Promise(resolve => setTimeout(resolve, 50))
      return delay.then(() => {
        const stroke2 = service.addPoint('user1', { x: 200, y: 200 })
        const timestamp2 = stroke2.points[2].timestamp

        expect(timestamp2).toBeGreaterThan(timestamp1)
      })
    })

    test('should throw error if userId is missing', () => {
      expect(() => {
        service.addPoint(null, { x: 150, y: 150 })
      }).toThrow('userId is required')

      expect(() => {
        service.addPoint('', { x: 150, y: 150 })
      }).toThrow('userId is required')
    })

    test('should throw error if coordinates are missing', () => {
      expect(() => {
        service.addPoint('user1', {})
      }).toThrow('Point coordinates (x, y) are required')

      expect(() => {
        service.addPoint('user1', { x: 150 })
      }).toThrow('Point coordinates (x, y) are required')

      expect(() => {
        service.addPoint('user1', { y: 150 })
      }).toThrow('Point coordinates (x, y) are required')
    })

    test('should throw error if user has no active stroke', () => {
      expect(() => {
        service.addPoint('user2', { x: 150, y: 150 })
      }).toThrow('User user2 has no active stroke')
    })
  })

  describe('completeStroke()', () => {
    beforeEach(() => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 100,
        strokeWidth: 2
      })
    })

    test('should complete stroke with final point', () => {
      const stroke = service.completeStroke('user1', { x: 200, y: 200 })

      expect(stroke.isCompleted()).toBe(true)
      expect(stroke.points.length).toBe(2) // Start + end
      expect(stroke.points[1].x).toBe(200)
      expect(stroke.points[1].y).toBe(200)
    })

    test('should remove stroke from active strokes', () => {
      expect(service.hasActiveStroke('user1')).toBe(true)

      service.completeStroke('user1', { x: 200, y: 200 })

      expect(service.hasActiveStroke('user1')).toBe(false)
      expect(service.getActiveStrokeCount()).toBe(0)
    })

    test('should validate completed stroke', () => {
      // Valid stroke should not throw
      expect(() => {
        service.completeStroke('user1', { x: 200, y: 200 })
      }).not.toThrow()
    })

    test('should throw error if userId is missing', () => {
      expect(() => {
        service.completeStroke(null, { x: 200, y: 200 })
      }).toThrow('userId is required')
    })

    test('should throw error if end point is missing', () => {
      expect(() => {
        service.completeStroke('user1', {})
      }).toThrow('End point coordinates (x, y) are required')

      expect(() => {
        service.completeStroke('user1', { x: 200 })
      }).toThrow('End point coordinates (x, y) are required')
    })

    test('should throw error if user has no active stroke', () => {
      expect(() => {
        service.completeStroke('user2', { x: 200, y: 200 })
      }).toThrow('User user2 has no active stroke')
    })

    test('should allow starting new stroke after completion', () => {
      service.completeStroke('user1', { x: 200, y: 200 })

      expect(() => {
        service.createStroke('user1', 'room1', '#e41a1c', {
          x: 300,
          y: 300,
          strokeWidth: 2
        })
      }).not.toThrow()

      expect(service.hasActiveStroke('user1')).toBe(true)
    })
  })

  describe('getActiveStroke()', () => {
    test('should return active stroke for user', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 100,
        strokeWidth: 2
      })

      const stroke = service.getActiveStroke('user1')

      expect(stroke).toBeInstanceOf(DrawingStroke)
      expect(stroke.userId).toBe('user1')
    })

    test('should return null if user has no active stroke', () => {
      const stroke = service.getActiveStroke('user1')
      expect(stroke).toBeNull()
    })
  })

  describe('hasActiveStroke()', () => {
    test('should return true if user has active stroke', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 100,
        strokeWidth: 2
      })

      expect(service.hasActiveStroke('user1')).toBe(true)
    })

    test('should return false if user has no active stroke', () => {
      expect(service.hasActiveStroke('user1')).toBe(false)
    })
  })

  describe('cancelStroke()', () => {
    test('should cancel active stroke', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 100,
        strokeWidth: 2
      })

      expect(service.hasActiveStroke('user1')).toBe(true)

      const cancelled = service.cancelStroke('user1')

      expect(cancelled).toBeInstanceOf(DrawingStroke)
      expect(service.hasActiveStroke('user1')).toBe(false)
      expect(service.getActiveStrokeCount()).toBe(0)
    })

    test('should return null if user has no active stroke', () => {
      const cancelled = service.cancelStroke('user1')
      expect(cancelled).toBeNull()
    })

    test('should allow creating new stroke after cancel', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 100,
        strokeWidth: 2
      })

      service.cancelStroke('user1')

      expect(() => {
        service.createStroke('user1', 'room1', '#e41a1c', {
          x: 200,
          y: 200,
          strokeWidth: 2
        })
      }).not.toThrow()
    })
  })

  describe('broadcastStroke()', () => {
    test('should prepare completed stroke for broadcasting', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 100,
        strokeWidth: 2
      })

      service.addPoint('user1', { x: 150, y: 150 })
      const stroke = service.completeStroke('user1', { x: 200, y: 200 })

      const payload = service.broadcastStroke(stroke)

      expect(payload).toHaveProperty('id')
      expect(payload).toHaveProperty('userId', 'user1')
      expect(payload).toHaveProperty('color', '#e41a1c')
      expect(payload).toHaveProperty('strokeWidth', 2)
      expect(payload).toHaveProperty('points')
      expect(payload.points.length).toBe(3)
    })

    test('should throw error if stroke is null', () => {
      expect(() => {
        service.broadcastStroke(null)
      }).toThrow('Cannot broadcast incomplete stroke')
    })

    test('should throw error if stroke is not completed', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 100,
        strokeWidth: 2
      })

      const stroke = service.getActiveStroke('user1')

      expect(() => {
        service.broadcastStroke(stroke)
      }).toThrow('Cannot broadcast incomplete stroke')
    })
  })

  describe('reset()', () => {
    test('should clear all active strokes', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 100,
        strokeWidth: 2
      })

      service.createStroke('user2', 'room1', '#377eb8', {
        x: 200,
        y: 200,
        strokeWidth: 3
      })

      expect(service.getActiveStrokeCount()).toBe(2)

      service.reset()

      expect(service.getActiveStrokeCount()).toBe(0)
      expect(service.getActiveUserIds()).toEqual([])
    })
  })

  describe('getState()', () => {
    test('should return current state', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 100,
        y: 100,
        strokeWidth: 2
      })

      service.addPoint('user1', { x: 150, y: 150 })

      const state = service.getState()

      expect(state).toHaveProperty('activeStrokeCount', 1)
      expect(state).toHaveProperty('activeUserIds', ['user1'])
      expect(state.activeStrokes.length).toBe(1)
      expect(state.activeStrokes[0].userId).toBe('user1')
      expect(state.activeStrokes[0].pointCount).toBe(2)
      expect(state.activeStrokes[0].isCompleted).toBe(false)
    })

    test('should return empty state when no active strokes', () => {
      const state = service.getState()

      expect(state.activeStrokeCount).toBe(0)
      expect(state.activeUserIds).toEqual([])
      expect(state.activeStrokes).toEqual([])
    })
  })

  describe('Edge cases', () => {
    test('should handle rapid stroke creation and completion', () => {
      for (let i = 0; i < 100; i++) {
        service.createStroke('user1', 'room1', '#e41a1c', {
          x: i,
          y: i,
          strokeWidth: 2
        })

        service.completeStroke('user1', { x: i + 100, y: i + 100 })
      }

      expect(service.getActiveStrokeCount()).toBe(0)
    })

    test('should handle multiple users drawing simultaneously', () => {
      for (let i = 1; i <= 10; i++) {
        service.createStroke(`user${i}`, 'room1', '#e41a1c', {
          x: i * 10,
          y: i * 10,
          strokeWidth: 2
        })
      }

      expect(service.getActiveStrokeCount()).toBe(10)
      expect(service.getActiveUserIds().length).toBe(10)
    })

    test('should handle strokes with many points', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 0,
        y: 0,
        strokeWidth: 2
      })

      // Add 1000 points
      for (let i = 1; i <= 1000; i++) {
        service.addPoint('user1', { x: i, y: i })
      }

      const stroke = service.completeStroke('user1', { x: 1001, y: 1001 })

      expect(stroke.points.length).toBe(1002) // Start + 1000 + end
      expect(stroke.isCompleted()).toBe(true)
    })

    test('should handle cancel during multi-point stroke', () => {
      service.createStroke('user1', 'room1', '#e41a1c', {
        x: 0,
        y: 0,
        strokeWidth: 2
      })

      for (let i = 1; i <= 50; i++) {
        service.addPoint('user1', { x: i, y: i })
      }

      const cancelled = service.cancelStroke('user1')

      expect(cancelled).toBeInstanceOf(DrawingStroke)
      expect(cancelled.points.length).toBe(51)
      expect(cancelled.isCompleted()).toBe(false)
      expect(service.hasActiveStroke('user1')).toBe(false)
    })
  })
})
