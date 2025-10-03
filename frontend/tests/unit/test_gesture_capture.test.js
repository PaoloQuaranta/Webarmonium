/**
 * Unit Tests: Gesture Capture Service (T041)
 * Tests gesture normalization and cross-platform input processing
 * Constitutional requirement: <200ms processing, device-agnostic input
 */

const GestureCapture = require('../../src/services/GestureCapture')

describe('GestureCapture Service', () => {
  let gestureCapture

  beforeEach(() => {
    // Create fresh instance for each test
    gestureCapture = new (require('../../src/services/GestureCapture').constructor)()
  })

  afterEach(() => {
    gestureCapture.cleanup()
  })

  describe('Initialization and Capabilities', () => {
    test('initializes with correct default capabilities', () => {
      const stats = gestureCapture.getStatistics()

      expect(stats.capabilities.mouse).toBe(true)
      expect(typeof stats.capabilities.touch).toBe('boolean')
      expect(typeof stats.capabilities.gyroscope).toBe('boolean')
      expect(stats.isCapturing).toBe(false)
    })

    test('starts and stops capture correctly', () => {
      expect(gestureCapture.getStatistics().isCapturing).toBe(false)

      gestureCapture.startCapture()
      expect(gestureCapture.getStatistics().isCapturing).toBe(true)

      gestureCapture.stopCapture()
      expect(gestureCapture.getStatistics().isCapturing).toBe(false)
    })
  })

  describe('Mouse Input Processing', () => {
    beforeEach(() => {
      gestureCapture.startCapture()
    })

    test('processes mouse input correctly', () => {
      const mockMouseData = {
        clientX: 400,
        clientY: 300,
        movementX: 5,
        movementY: -3,
        buttons: 1,
        target: {
          getBoundingClientRect: () => ({
            left: 0,
            top: 0,
            width: 800,
            height: 600
          })
        }
      }

      const gesture = gestureCapture.processInput('mouse', mockMouseData)

      expect(gesture).toBeDefined()
      expect(gesture.type).toBe('mouse')
      expect(gesture.coordinates.x).toBeCloseTo(0.5, 2) // 400/800
      expect(gesture.coordinates.y).toBeCloseTo(0.5, 2) // 300/600
      expect(gesture.intensity).toBeGreaterThan(0)
      expect(gesture.timestamp).toBeInstanceOf(Date)
      expect(gesture.metadata.isPressed).toBe(true)
    })

    test('normalizes coordinates to 0-1 range', () => {
      const testCases = [
        { clientX: 0, clientY: 0, expectedX: 0, expectedY: 0 },
        { clientX: 800, clientY: 600, expectedX: 1, expectedY: 1 },
        { clientX: 400, clientY: 300, expectedX: 0.5, expectedY: 0.5 },
        { clientX: -100, clientY: -50, expectedX: 0, expectedY: 0 }, // Clamped
        { clientX: 1000, clientY: 800, expectedX: 1, expectedY: 1 }  // Clamped
      ]

      testCases.forEach(testCase => {
        const mockData = {
          clientX: testCase.clientX,
          clientY: testCase.clientY,
          movementX: 0,
          movementY: 0,
          buttons: 0,
          target: {
            getBoundingClientRect: () => ({
              left: 0,
              top: 0,
              width: 800,
              height: 600
            })
          }
        }

        const gesture = gestureCapture.processInput('mouse', mockData)

        expect(gesture.coordinates.x).toBeCloseTo(testCase.expectedX, 2)
        expect(gesture.coordinates.y).toBeCloseTo(testCase.expectedY, 2)
      })
    })

    test('calculates intensity from movement velocity', () => {
      const testCases = [
        { movementX: 0, movementY: 0, expectedIntensity: 0 },
        { movementX: 10, movementY: 0, expectedIntensity: 0.5 },
        { movementX: 0, movementY: 20, expectedIntensity: 1 },
        { movementX: 15, movementY: 15, expectedIntensity: 1 } // Clamped to 1
      ]

      testCases.forEach(testCase => {
        const mockData = {
          clientX: 400,
          clientY: 300,
          movementX: testCase.movementX,
          movementY: testCase.movementY,
          buttons: 0,
          target: {
            getBoundingClientRect: () => ({
              left: 0,
              top: 0,
              width: 800,
              height: 600
            })
          }
        }

        const gesture = gestureCapture.processInput('mouse', mockData)

        expect(gesture.intensity).toBeCloseTo(testCase.expectedIntensity, 1)
      })
    })
  })

  describe('Touch Input Processing', () => {
    beforeEach(() => {
      gestureCapture.startCapture()
    })

    test('processes touch input correctly', () => {
      const mockTouchData = {
        touches: [{
          clientX: 200,
          clientY: 150,
          identifier: 1,
          force: 0.8
        }],
        changedTouches: [{
          clientX: 200,
          clientY: 150,
          identifier: 1,
          force: 0.8
        }],
        type: 'touchstart',
        target: {
          getBoundingClientRect: () => ({
            left: 0,
            top: 0,
            width: 400,
            height: 300
          })
        }
      }

      const gesture = gestureCapture.processInput('touch', mockTouchData)

      expect(gesture).toBeDefined()
      expect(gesture.type).toBe('touch')
      expect(gesture.coordinates.x).toBeCloseTo(0.5, 2) // 200/400
      expect(gesture.coordinates.y).toBeCloseTo(0.5, 2) // 150/300
      expect(gesture.intensity).toBeGreaterThan(0.5) // High force
      expect(gesture.metadata.touchId).toBe(1)
      expect(gesture.metadata.touchType).toBe('touchstart')
    })

    test('handles pressure-sensitive touch', () => {
      const testCases = [
        { force: 0.0, expectedIntensity: 0.0 },
        { force: 0.5, expectedIntensity: 1.0 },
        { force: 1.0, expectedIntensity: 1.0 } // Clamped
      ]

      testCases.forEach(testCase => {
        const mockData = {
          touches: [{
            clientX: 200,
            clientY: 150,
            identifier: 1,
            force: testCase.force
          }],
          changedTouches: [{
            clientX: 200,
            clientY: 150,
            identifier: 1,
            force: testCase.force
          }],
          type: 'touchmove',
          target: {
            getBoundingClientRect: () => ({
              left: 0,
              top: 0,
              width: 400,
              height: 300
            })
          }
        }

        const gesture = gestureCapture.processInput('touch', mockData)

        expect(gesture.intensity).toBeCloseTo(testCase.expectedIntensity, 1)
      })
    })
  })

  describe('Gyroscope Input Processing', () => {
    beforeEach(() => {
      gestureCapture.startCapture()
      // Simulate calibration
      gestureCapture.calibration.gyroscope.calibrated = true
      gestureCapture.calibration.gyroscope.baseline = { x: 0, y: 0, z: 0 }
    })

    test('processes gyroscope input correctly', () => {
      const mockGyroData = {
        gamma: 45,  // -90 to 90 degrees
        beta: 90,   // -180 to 180 degrees
        alpha: 180  // 0 to 360 degrees
      }

      const gesture = gestureCapture.processInput('gyroscope', mockGyroData)

      expect(gesture).toBeDefined()
      expect(gesture.type).toBe('gyroscope')
      expect(gesture.coordinates.x).toBeCloseTo(0.75, 2) // (45+90)/180
      expect(gesture.coordinates.y).toBeCloseTo(0.75, 2) // (90+180)/360
      expect(gesture.coordinates.z).toBeCloseTo(0.5, 2)  // 180/360
      expect(gesture.metadata.rawValues).toEqual(mockGyroData)
    })

    test('applies calibration offset correctly', () => {
      // Set calibration baseline
      gestureCapture.calibration.gyroscope.baseline = { x: 10, y: -20, z: 30 }

      const mockData = {
        gamma: 55,  // 55 - 10 = 45 calibrated
        beta: 70,   // 70 - (-20) = 90 calibrated
        alpha: 210  // 210 - 30 = 180 calibrated
      }

      const gesture = gestureCapture.processInput('gyroscope', mockData)

      expect(gesture.coordinates.x).toBeCloseTo(0.75, 2) // (45+90)/180
      expect(gesture.coordinates.y).toBeCloseTo(0.75, 2) // (90+180)/360
      expect(gesture.coordinates.z).toBeCloseTo(0.5, 2)  // 180/360
    })

    test('applies deadzone to reduce noise', () => {
      const deadzone = 0.1
      gestureCapture.calibration.gyroscope.deadzone = deadzone

      const smallMovementData = {
        gamma: 5,   // Small movement
        beta: -10,  // Small movement
        alpha: 180
      }

      const gesture = gestureCapture.processInput('gyroscope', smallMovementData)

      // Small movements should be filtered to center (0.5)
      expect(gesture.coordinates.x).toBeCloseTo(0.5, 1)
      expect(gesture.coordinates.y).toBeCloseTo(0.5, 1)
    })
  })

  describe('Performance and Latency', () => {
    beforeEach(() => {
      gestureCapture.startCapture()
    })

    test('processes gestures within constitutional latency limit', () => {
      const testGestures = [
        {
          type: 'mouse',
          data: {
            clientX: 400, clientY: 300, movementX: 5, movementY: 3, buttons: 0,
            target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }
          }
        },
        {
          type: 'touch',
          data: {
            touches: [{ clientX: 200, clientY: 150, identifier: 1, force: 0.5 }],
            changedTouches: [{ clientX: 200, clientY: 150, identifier: 1, force: 0.5 }],
            type: 'touchmove',
            target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }) }
          }
        },
        {
          type: 'gyroscope',
          data: { gamma: 30, beta: 60, alpha: 90 }
        }
      ]

      // Set gyroscope as calibrated
      gestureCapture.calibration.gyroscope.calibrated = true

      testGestures.forEach(testGesture => {
        const gesture = gestureCapture.processInput(testGesture.type, testGesture.data)

        expect(gesture).toBeDefined()
        expect(gesture.processingTime).toBeLessThan(200) // Constitutional requirement
      })
    })

    test('maintains performance under high frequency input', () => {
      const highFrequencyTest = 100 // 100 gestures
      const processingTimes = []

      for (let i = 0; i < highFrequencyTest; i++) {
        const mockData = {
          clientX: Math.random() * 800,
          clientY: Math.random() * 600,
          movementX: (Math.random() - 0.5) * 10,
          movementY: (Math.random() - 0.5) * 10,
          buttons: 0,
          target: {
            getBoundingClientRect: () => ({
              left: 0, top: 0, width: 800, height: 600
            })
          }
        }

        const gesture = gestureCapture.processInput('mouse', mockData)
        processingTimes.push(gesture.processingTime)
      }

      const avgProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
      const maxProcessingTime = Math.max(...processingTimes)

      expect(avgProcessingTime).toBeLessThan(50) // Should be much faster than limit
      expect(maxProcessingTime).toBeLessThan(200) // No single gesture exceeds limit

      // Check statistics
      const stats = gestureCapture.getStatistics()
      expect(stats.totalGestures).toBe(highFrequencyTest)
      expect(stats.averageProcessingTime).toBeLessThan(50)
    })
  })

  describe('Gesture History and Queue Management', () => {
    beforeEach(() => {
      gestureCapture.startCapture()
    })

    test('maintains gesture history within size limits', () => {
      const maxHistorySize = gestureCapture.maxHistorySize
      const gestureCount = maxHistorySize + 50 // Exceed limit

      for (let i = 0; i < gestureCount; i++) {
        const mockData = {
          clientX: i % 800,
          clientY: i % 600,
          movementX: 1,
          movementY: 1,
          buttons: 0,
          target: {
            getBoundingClientRect: () => ({
              left: 0, top: 0, width: 800, height: 600
            })
          }
        }

        gestureCapture.processInput('mouse', mockData)
      }

      const stats = gestureCapture.getStatistics()
      expect(stats.historySize).toBeLessThanOrEqual(maxHistorySize)
    })

    test('manages gesture queue correctly', () => {
      // Add gestures to queue
      for (let i = 0; i < 10; i++) {
        const mockData = {
          clientX: i * 80,
          clientY: i * 60,
          movementX: 1,
          movementY: 1,
          buttons: 0,
          target: {
            getBoundingClientRect: () => ({
              left: 0, top: 0, width: 800, height: 600
            })
          }
        }

        gestureCapture.processInput('mouse', mockData)
      }

      // Get queued gestures
      const queuedGestures = gestureCapture.getQueuedGestures()

      expect(queuedGestures.length).toBe(10)
      expect(gestureCapture.getStatistics().queueSize).toBe(0) // Queue cleared after getting
    })
  })

  describe('Calibration and Configuration', () => {
    test('updates calibration settings correctly', () => {
      const newMouseSettings = {
        sensitivity: 1.5,
        smoothing: 0.2
      }

      gestureCapture.updateCalibration('mouse', newMouseSettings)

      expect(gestureCapture.calibration.mouse.sensitivity).toBe(1.5)
      expect(gestureCapture.calibration.mouse.smoothing).toBe(0.2)
    })

    test('applies smoothing correctly', () => {
      gestureCapture.startCapture()

      // First gesture
      const gesture1 = gestureCapture.processInput('mouse', {
        clientX: 400, clientY: 300, movementX: 10, movementY: 0, buttons: 0,
        target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }
      })

      // Second gesture (should be smoothed)
      const gesture2 = gestureCapture.processInput('mouse', {
        clientX: 500, clientY: 300, movementX: 20, movementY: 0, buttons: 0,
        target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }
      })

      // Second gesture intensity should be influenced by first
      expect(gesture2.intensity).toBeLessThan(1.0) // Should be smoothed down from raw calculation
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('handles invalid input gracefully', () => {
      gestureCapture.startCapture()

      // Invalid input types
      expect(gestureCapture.processInput('invalid', {})).toBeNull()
      expect(gestureCapture.processInput(null, {})).toBeNull()
      expect(gestureCapture.processInput('mouse', null)).toBeNull()

      // Missing required data
      expect(() => {
        gestureCapture.processInput('mouse', {
          // Missing clientX, clientY
          target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }
        })
      }).toThrow()
    })

    test('handles capture state correctly', () => {
      // Processing when not capturing should return null
      expect(gestureCapture.processInput('mouse', {
        clientX: 400, clientY: 300, movementX: 5, movementY: 3, buttons: 0,
        target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }
      })).toBeNull()
    })

    test('handles gyroscope when not calibrated', () => {
      gestureCapture.startCapture()
      gestureCapture.calibration.gyroscope.calibrated = false

      const gesture = gestureCapture.processInput('gyroscope', {
        gamma: 45, beta: 90, alpha: 180
      })

      expect(gesture).toBeNull() // Should not process until calibrated
    })
  })

  describe('Statistics and Monitoring', () => {
    test('tracks device type distribution correctly', () => {
      gestureCapture.startCapture()

      // Process different device types
      const deviceInputs = [
        { type: 'mouse', count: 5 },
        { type: 'touch', count: 3 },
        { type: 'gyroscope', count: 2 }
      ]

      // Set gyroscope as calibrated
      gestureCapture.calibration.gyroscope.calibrated = true

      deviceInputs.forEach(device => {
        for (let i = 0; i < device.count; i++) {
          let mockData
          switch (device.type) {
            case 'mouse':
              mockData = {
                clientX: 400, clientY: 300, movementX: 1, movementY: 1, buttons: 0,
                target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }
              }
              break
            case 'touch':
              mockData = {
                touches: [{ clientX: 200, clientY: 150, identifier: 1, force: 0.5 }],
                changedTouches: [{ clientX: 200, clientY: 150, identifier: 1, force: 0.5 }],
                type: 'touchmove',
                target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }) }
              }
              break
            case 'gyroscope':
              mockData = { gamma: 30, beta: 60, alpha: 90 }
              break
          }

          gestureCapture.processInput(device.type, mockData)
        }
      })

      const stats = gestureCapture.getStatistics()
      expect(stats.totalGestures).toBe(10)

      const distribution = Array.from(stats.deviceTypeDistribution.entries())
      expect(distribution.find(([type]) => type === 'mouse')[1]).toBe(5)
      expect(distribution.find(([type]) => type === 'touch')[1]).toBe(3)
      expect(distribution.find(([type]) => type === 'gyroscope')[1]).toBe(2)
    })

    test('resets statistics correctly', () => {
      gestureCapture.startCapture()

      // Generate some activity
      for (let i = 0; i < 5; i++) {
        gestureCapture.processInput('mouse', {
          clientX: 400, clientY: 300, movementX: 1, movementY: 1, buttons: 0,
          target: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }
        })
      }

      let stats = gestureCapture.getStatistics()
      expect(stats.totalGestures).toBe(5)

      // Reset statistics
      gestureCapture.resetStatistics()

      stats = gestureCapture.getStatistics()
      expect(stats.totalGestures).toBe(0)
      expect(stats.historySize).toBe(0)
      expect(stats.queueSize).toBe(0)
    })
  })
})

module.exports = {
  testName: 'GestureCapture Unit Tests',
  description: 'Cross-platform gesture normalization and processing',
  constitutionalRequirements: [
    '<200ms gesture processing latency',
    'Device-agnostic input normalization',
    'Cross-platform compatibility',
    'Performance under high-frequency input'
  ]
}