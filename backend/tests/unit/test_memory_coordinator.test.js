/**
 * Unit Tests: Environmental Memory Coordinator (T042)
 * Tests memory state management and pattern evolution algorithms
 * Constitutional requirement: Anonymous learning, 24-hour lifecycle, pattern evolution
 */

const EnvironmentalMemoryCoordinator = require('../../src/services/EnvironmentalMemoryCoordinator')
const MemoryState = require('../../src/models/MemoryState')
const Gesture = require('../../src/models/Gesture')
const SoundPattern = require('../../src/models/SoundPattern')

describe('EnvironmentalMemoryCoordinator', () => {
  let coordinator
  let testRoomId

  beforeEach(() => {
    coordinator = new EnvironmentalMemoryCoordinator()
    testRoomId = 'test-room-' + Date.now()
  })

  afterEach(() => {
    coordinator.shutdown()
  })

  describe('Memory State Initialization', () => {
    test('initializes memory state for new room', () => {
      const memoryState = coordinator.initializeMemoryState(testRoomId)

      expect(memoryState).toBeInstanceOf(MemoryState)
      expect(memoryState.roomId).toBe(testRoomId)
      expect(coordinator.getMemoryState(testRoomId)).toBe(memoryState)
      expect(coordinator.getRoomPatterns(testRoomId)).toEqual([])
    })

    test('throws error for duplicate room initialization', () => {
      coordinator.initializeMemoryState(testRoomId)

      expect(() => {
        coordinator.initializeMemoryState(testRoomId)
      }).toThrow('Memory state already exists for room')
    })

    test('throws error for missing room ID', () => {
      expect(() => {
        coordinator.initializeMemoryState('')
      }).toThrow('Room ID is required')

      expect(() => {
        coordinator.initializeMemoryState(null)
      }).toThrow('Room ID is required')
    })
  })

  describe('Gesture Memory Processing', () => {
    let memoryState
    let testGesture

    beforeEach(() => {
      memoryState = coordinator.initializeMemoryState(testRoomId)

      testGesture = new Gesture('user123', testRoomId, {
        type: 'touch',
        coordinates: { x: 0.5, y: 0.7 },
        intensity: 0.8,
        timestamp: Date.now()
      })

      // Set sonic parameters
      testGesture.setSonicParams({
        frequency: 440,
        amplitude: 0.6,
        waveform: 'sine',
        envelope: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 }
      })
    })

    test('processes gesture memory successfully', () => {
      const roomContext = { activeUsers: 1 }

      const result = coordinator.processGestureMemory(testGesture, roomContext)

      expect(result.success).toBe(true)
      expect(result.memoryUpdated).toBe(true)
      expect(typeof result.adaptationStrength).toBe('number')
      expect(typeof result.memoryPhase).toBe('string')
    })

    test('rejects processing for expired memory', () => {
      // Manually expire the memory state
      memoryState.setExpiration(new Date(Date.now() - 1000))

      const roomContext = { activeUsers: 1 }
      const result = coordinator.processGestureMemory(testGesture, roomContext)

      expect(result.success).toBe(false)
      expect(result.reason).toBe('Memory state has expired')
      expect(result.memoryExpired).toBe(true)
    })

    test('throws error for non-existent room', () => {
      const invalidGesture = new Gesture('user123', 'non-existent-room', {
        type: 'mouse',
        coordinates: { x: 0.3, y: 0.4 },
        intensity: 0.5
      })

      expect(() => {
        coordinator.processGestureMemory(invalidGesture, { activeUsers: 1 })
      }).toThrow('No memory state found for room')
    })
  })

  describe('Pattern Evolution', () => {
    let memoryState

    beforeEach(() => {
      memoryState = coordinator.initializeMemoryState(testRoomId)
    })

    test('creates new patterns for empty room', () => {
      const gesture = new Gesture('user123', testRoomId, {
        type: 'touch',
        coordinates: { x: 0.6, y: 0.8 },
        intensity: 0.9
      })

      gesture.setSonicParams({
        frequency: 550,
        amplitude: 0.7,
        waveform: 'square'
      })

      const roomContext = { activeUsers: 1 }
      const result = coordinator.evolveRoomPatterns(gesture, roomContext)

      expect(result.newPatterns).toBeGreaterThan(0)
      expect(result.totalPatterns).toBeGreaterThan(0)

      const patterns = coordinator.getRoomPatterns(testRoomId)
      expect(patterns.length).toBeGreaterThan(0)
      expect(patterns[0]).toBeInstanceOf(SoundPattern)
    })

    test('evolves existing patterns with new gestures', () => {
      // Create initial pattern
      const initialGesture = new Gesture('user1', testRoomId, {
        type: 'mouse',
        coordinates: { x: 0.3, y: 0.4 },
        intensity: 0.6
      })
      initialGesture.setSonicParams({ frequency: 330, amplitude: 0.5, waveform: 'sine' })

      coordinator.evolveRoomPatterns(initialGesture, { activeUsers: 1 })

      // Evolve with new gesture
      const evolutionGesture = new Gesture('user2', testRoomId, {
        type: 'touch',
        coordinates: { x: 0.7, y: 0.8 },
        intensity: 0.9
      })
      evolutionGesture.setSonicParams({ frequency: 660, amplitude: 0.8, waveform: 'square' })

      const result = coordinator.evolveRoomPatterns(evolutionGesture, { activeUsers: 2 })

      expect(result.patternsModified).toBeGreaterThanOrEqual(0)
      expect(result.totalPatterns).toBeGreaterThan(0)
    })

    test('limits pattern count for performance', () => {
      // Create many patterns to test pruning
      for (let i = 0; i < 12; i++) {
        const gesture = new Gesture(`user${i}`, testRoomId, {
          type: 'gyroscope',
          coordinates: { x: Math.random(), y: Math.random(), z: Math.random() },
          intensity: 0.8
        })
        gesture.setSonicParams({ frequency: 440 + i * 10, amplitude: 0.6, waveform: 'triangle' })

        coordinator.evolveRoomPatterns(gesture, { activeUsers: 1 })
      }

      const patterns = coordinator.getRoomPatterns(testRoomId)
      expect(patterns.length).toBeLessThanOrEqual(8) // Should be pruned
    })
  })

  describe('Pattern Creation Logic', () => {
    let memoryState

    beforeEach(() => {
      memoryState = coordinator.initializeMemoryState(testRoomId)
    })

    test('creates patterns for high-intensity gestures', () => {
      const highIntensityGesture = new Gesture('user1', testRoomId, {
        type: 'touch',
        coordinates: { x: 0.5, y: 0.5 },
        intensity: 0.9 // High intensity
      })
      highIntensityGesture.setSonicParams({ frequency: 440, amplitude: 0.8, waveform: 'square' })

      const shouldCreate = coordinator.shouldCreateNewPattern(0, highIntensityGesture, memoryState)
      expect(shouldCreate).toBe(true)
    })

    test('limits patterns during initial phase', () => {
      // Set memory to initial phase
      memoryState.learningMetrics.totalGestures = 5 // Low count = initial phase

      const gesture = new Gesture('user1', testRoomId, {
        type: 'mouse',
        coordinates: { x: 0.3, y: 0.7 },
        intensity: 0.5
      })

      // Should not create too many patterns in initial phase
      const shouldCreate = coordinator.shouldCreateNewPattern(3, gesture, memoryState)
      expect(shouldCreate).toBe(false)
    })

    test('creates patterns for new gesture types', () => {
      // Create a mouse pattern first
      const mousePattern = SoundPattern.fromGesture(testRoomId, new Gesture('user1', testRoomId, {
        type: 'mouse',
        coordinates: { x: 0.3, y: 0.4 },
        intensity: 0.6
      }))

      coordinator.patternRegistry.set(testRoomId, new Set([mousePattern]))

      // Try to create pattern for touch gesture (different type)
      const touchGesture = new Gesture('user2', testRoomId, {
        type: 'touch',
        coordinates: { x: 0.6, y: 0.8 },
        intensity: 0.7
      })

      const shouldCreate = coordinator.shouldCreateNewPattern(1, touchGesture, memoryState)
      expect(shouldCreate).toBe(true) // New gesture type
    })
  })

  describe('Sonic Update Generation', () => {
    beforeEach(() => {
      coordinator.initializeMemoryState(testRoomId)
    })

    test('generates sonic update with active patterns', () => {
      // Create some patterns
      const gesture1 = new Gesture('user1', testRoomId, {
        type: 'touch',
        coordinates: { x: 0.3, y: 0.5 },
        intensity: 0.8
      })
      gesture1.setSonicParams({ frequency: 330, amplitude: 0.6, waveform: 'sine' })

      const gesture2 = new Gesture('user2', testRoomId, {
        type: 'mouse',
        coordinates: { x: 0.7, y: 0.4 },
        intensity: 0.6
      })
      gesture2.setSonicParams({ frequency: 550, amplitude: 0.5, waveform: 'square' })

      coordinator.evolveRoomPatterns(gesture1, { activeUsers: 2 })
      coordinator.evolveRoomPatterns(gesture2, { activeUsers: 2 })

      const sonicUpdate = coordinator.generateSonicUpdate(testRoomId)

      expect(sonicUpdate.roomId).toBe(testRoomId)
      expect(Array.isArray(sonicUpdate.patterns)).toBe(true)
      expect(typeof sonicUpdate.memoryInfluence).toBe('number')
      expect(typeof sonicUpdate.memoryPhase).toBe('string')
      expect(typeof sonicUpdate.timestamp).toBe('number')
    })

    test('returns empty update for expired memory', () => {
      const memoryState = coordinator.getMemoryState(testRoomId)
      memoryState.setExpiration(new Date(Date.now() - 1000))

      const sonicUpdate = coordinator.generateSonicUpdate(testRoomId)

      expect(sonicUpdate.roomId).toBe(testRoomId)
      expect(sonicUpdate.patterns).toEqual([])
      expect(sonicUpdate.memoryInfluence).toBe(0)
      expect(sonicUpdate.adaptationStrength).toBe(0)
    })

    test('returns empty update for non-existent room', () => {
      const sonicUpdate = coordinator.generateSonicUpdate('non-existent-room')

      expect(sonicUpdate.roomId).toBe('non-existent-room')
      expect(sonicUpdate.patterns).toEqual([])
      expect(sonicUpdate.memoryInfluence).toBe(0)
    })
  })

  describe('Memory Cleanup and Lifecycle', () => {
    test('sets memory expiration correctly', () => {
      coordinator.initializeMemoryState(testRoomId)

      const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      coordinator.setMemoryExpiration(testRoomId, expirationTime)

      const memoryState = coordinator.getMemoryState(testRoomId)
      expect(memoryState.expiresAt).toEqual(expirationTime)
    })

    test('performs memory cleanup correctly', () => {
      // Create multiple rooms
      const room1 = 'cleanup-room-1'
      const room2 = 'cleanup-room-2'
      const room3 = 'cleanup-room-3'

      coordinator.initializeMemoryState(room1)
      coordinator.initializeMemoryState(room2)
      coordinator.initializeMemoryState(room3)

      // Expire first two rooms
      const pastTime = new Date(Date.now() - 1000)
      coordinator.setMemoryExpiration(room1, pastTime)
      coordinator.setMemoryExpiration(room2, pastTime)

      // Add some patterns to rooms
      const gesture = new Gesture('user1', room1, {
        type: 'touch',
        coordinates: { x: 0.5, y: 0.5 },
        intensity: 0.7
      })
      gesture.setSonicParams({ frequency: 440, amplitude: 0.6, waveform: 'sine' })

      coordinator.evolveRoomPatterns(gesture, { activeUsers: 1 })

      const cleanupStats = coordinator.performMemoryCleanup()

      expect(cleanupStats.expiredMemories).toBe(2)
      expect(cleanupStats.cleanedRooms).toBe(2)
      expect(cleanupStats.activeMemories).toBe(1)

      // Verify cleanup
      expect(coordinator.getMemoryState(room1)).toBeNull()
      expect(coordinator.getMemoryState(room2)).toBeNull()
      expect(coordinator.getMemoryState(room3)).toBeDefined()
    })

    test('cleans up expired patterns in active rooms', () => {
      coordinator.initializeMemoryState(testRoomId)

      // Create patterns and make some expire
      const patterns = new Set()
      for (let i = 0; i < 5; i++) {
        const pattern = SoundPattern.fromGesture(testRoomId, new Gesture(`user${i}`, testRoomId, {
          type: 'mouse',
          coordinates: { x: Math.random(), y: Math.random() },
          intensity: 0.6
        }))

        // Make first 2 patterns expire
        if (i < 2) {
          pattern.lastModified = new Date(Date.now() - 6 * 60 * 1000) // 6 minutes ago
          pattern.state = 'dormant'
        }

        patterns.add(pattern)
      }

      coordinator.patternRegistry.set(testRoomId, patterns)

      const cleanupStats = coordinator.performMemoryCleanup()

      expect(cleanupStats.expiredPatterns).toBe(2)

      const remainingPatterns = coordinator.getRoomPatterns(testRoomId)
      expect(remainingPatterns.length).toBe(3)
    })
  })

  describe('Statistics and Monitoring', () => {
    test('generates coordinator statistics correctly', () => {
      // Create multiple rooms with different states
      const rooms = ['stats-room-1', 'stats-room-2', 'stats-room-3']

      rooms.forEach((roomId, index) => {
        coordinator.initializeMemoryState(roomId)

        // Add different amounts of activity
        for (let i = 0; i < (index + 1) * 10; i++) {
          const gesture = new Gesture(`user${i}`, roomId, {
            type: 'touch',
            coordinates: { x: Math.random(), y: Math.random() },
            intensity: Math.random()
          })
          gesture.setSonicParams({ frequency: 440 + i, amplitude: 0.5, waveform: 'sine' })

          coordinator.evolveRoomPatterns(gesture, { activeUsers: index + 1 })
        }
      })

      const stats = coordinator.getCoordinatorStats()

      expect(stats.totalMemoryStates).toBe(3)
      expect(stats.totalPatterns).toBeGreaterThan(0)
      expect(typeof stats.averageAdaptationStrength).toBe('number')
      expect(typeof stats.memoryPhaseDistribution).toBe('object')
    })

    test('calculates learning phase distribution correctly', () => {
      const rooms = ['phase-room-1', 'phase-room-2']

      rooms.forEach(roomId => {
        const memoryState = coordinator.initializeMemoryState(roomId)

        // Create different learning phases by manipulating gesture count
        if (roomId === 'phase-room-1') {
          memoryState.learningMetrics.totalGestures = 5 // Initial phase
        } else {
          memoryState.learningMetrics.totalGestures = 75 // Learning phase
        }
      })

      const stats = coordinator.getCoordinatorStats()
      const distribution = stats.memoryPhaseDistribution

      expect(distribution.initial).toBeGreaterThan(0)
      expect(distribution.learning).toBeGreaterThan(0)
    })
  })

  describe('State Validation', () => {
    test('validates coordinator state successfully', () => {
      coordinator.initializeMemoryState(testRoomId)

      // Add some patterns
      const gesture = new Gesture('user1', testRoomId, {
        type: 'touch',
        coordinates: { x: 0.5, y: 0.6 },
        intensity: 0.7
      })
      gesture.setSonicParams({ frequency: 440, amplitude: 0.6, waveform: 'sine' })

      coordinator.evolveRoomPatterns(gesture, { activeUsers: 1 })

      // Should not throw
      expect(() => {
        coordinator.validateCoordinatorState()
      }).not.toThrow()
    })

    test('detects memory state validation errors', () => {
      const memoryState = coordinator.initializeMemoryState(testRoomId)

      // Corrupt memory state
      memoryState.roomId = null

      expect(() => {
        coordinator.validateCoordinatorState()
      }).toThrow('Memory state validation failed')
    })

    test('detects pattern registry inconsistencies', () => {
      coordinator.initializeMemoryState(testRoomId)

      // Create pattern with wrong room ID
      const invalidPattern = new SoundPattern('wrong-room-id', 'ambient', {})
      coordinator.patternRegistry.set(testRoomId, new Set([invalidPattern]))

      expect(() => {
        coordinator.validateCoordinatorState()
      }).toThrow('Pattern room mismatch')
    })

    test('detects orphaned pattern registry', () => {
      // Create pattern registry without memory state
      const orphanPattern = new SoundPattern('orphan-room', 'ambient', {})
      coordinator.patternRegistry.set('orphan-room', new Set([orphanPattern]))

      expect(() => {
        coordinator.validateCoordinatorState()
      }).toThrow('Pattern registry exists for room orphan-room without memory state')
    })
  })

  describe('Performance Characteristics', () => {
    test('maintains performance under high pattern load', () => {
      coordinator.initializeMemoryState(testRoomId)

      const startTime = performance.now()

      // Create many patterns rapidly
      for (let i = 0; i < 100; i++) {
        const gesture = new Gesture(`user${i % 5}`, testRoomId, {
          type: ['mouse', 'touch', 'gyroscope'][i % 3],
          coordinates: { x: Math.random(), y: Math.random(), z: Math.random() },
          intensity: Math.random()
        })
        gesture.setSonicParams({
          frequency: 220 + Math.random() * 440,
          amplitude: Math.random() * 0.8,
          waveform: 'sine'
        })

        coordinator.evolveRoomPatterns(gesture, { activeUsers: Math.floor(Math.random() * 5) + 1 })
      }

      const processingTime = performance.now() - startTime

      expect(processingTime).toBeLessThan(1000) // Should complete within 1 second

      // Verify patterns were created but limited
      const patterns = coordinator.getRoomPatterns(testRoomId)
      expect(patterns.length).toBeLessThanOrEqual(8) // Pruning should have occurred
    })

    test('sonic update generation is efficient', () => {
      coordinator.initializeMemoryState(testRoomId)

      // Create several patterns
      for (let i = 0; i < 5; i++) {
        const gesture = new Gesture(`user${i}`, testRoomId, {
          type: 'touch',
          coordinates: { x: Math.random(), y: Math.random() },
          intensity: Math.random()
        })
        gesture.setSonicParams({ frequency: 440 + i * 50, amplitude: 0.6, waveform: 'sine' })

        coordinator.evolveRoomPatterns(gesture, { activeUsers: i + 1 })
      }

      const startTime = performance.now()

      // Generate multiple sonic updates
      for (let i = 0; i < 50; i++) {
        coordinator.generateSonicUpdate(testRoomId)
      }

      const processingTime = performance.now() - startTime

      expect(processingTime).toBeLessThan(100) // Should be very fast
    })
  })

  describe('Constitutional Compliance', () => {
    test('maintains 24-hour memory lifecycle requirement', () => {
      const memoryState = coordinator.initializeMemoryState(testRoomId)

      // Set expiration to 24 hours from now
      const twentyFourHours = 24 * 60 * 60 * 1000
      const expirationTime = new Date(Date.now() + twentyFourHours)

      coordinator.setMemoryExpiration(testRoomId, expirationTime)

      expect(memoryState.expiresAt).toEqual(expirationTime)
      expect(memoryState.isExpired()).toBe(false)

      // Test that memory expires after 24 hours
      memoryState.setExpiration(new Date(Date.now() - 1000))
      expect(memoryState.isExpired()).toBe(true)
    })

    test('ensures anonymous learning without personal data', () => {
      coordinator.initializeMemoryState(testRoomId)

      const gesture = new Gesture('anonymous-user-session-id', testRoomId, {
        type: 'touch',
        coordinates: { x: 0.5, y: 0.6 },
        intensity: 0.7
      })
      gesture.setSonicParams({ frequency: 440, amplitude: 0.6, waveform: 'sine' })

      coordinator.processGestureMemory(gesture, { activeUsers: 1 })

      const memoryState = coordinator.getMemoryState(testRoomId)
      const influence = memoryState.getInfluence()

      // Verify no personal data is stored
      expect(gesture.userId).toMatch(/^anonymous-user-session-id$/)
      expect(influence.patterns.length).toBeGreaterThan(0)

      // Memory should contain learning patterns but no personal identification
      influence.patterns.forEach(pattern => {
        expect(pattern).not.toHaveProperty('personalData')
        expect(pattern).not.toHaveProperty('userEmail')
        expect(pattern).not.toHaveProperty('userName')
      })
    })

    test('enforces performance requirements for memory operations', () => {
      coordinator.initializeMemoryState(testRoomId)

      const gesture = new Gesture('user1', testRoomId, {
        type: 'gyroscope',
        coordinates: { x: 0.4, y: 0.6, z: 0.8 },
        intensity: 0.9
      })
      gesture.setSonicParams({ frequency: 660, amplitude: 0.8, waveform: 'triangle' })

      const startTime = performance.now()

      const result = coordinator.processGestureMemory(gesture, { activeUsers: 1 })

      const processingTime = performance.now() - startTime

      expect(result.success).toBe(true)
      expect(processingTime).toBeLessThan(50) // Should be very fast for memory operations
    })
  })
})

module.exports = {
  testName: 'Environmental Memory Coordinator Unit Tests',
  description: 'Memory state management and pattern evolution algorithms',
  constitutionalRequirements: [
    'Anonymous learning without personal data storage',
    '24-hour memory lifecycle management',
    'Pattern evolution based on collaborative activity',
    'Performance-optimized memory operations',
    'Graceful memory cleanup and resource management'
  ]
}