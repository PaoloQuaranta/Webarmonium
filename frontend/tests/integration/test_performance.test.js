/**
 * Integration Test: Performance and Error Recovery (T016)
 * Tests system performance under stress and error recovery mechanisms
 * Constitutional requirement: <200ms audio, <100ms WebSocket, 60fps rendering, graceful degradation
 */

const { expect } = require('@jest/globals')
const io = require('socket.io-client')
const WebarmoniumServer = require('../../backend/src/server')

describe('Performance and Error Recovery Integration', () => {
  let server
  let serverUrl
  let testClients = []

  beforeAll(async () => {
    // Start test server
    server = new WebarmoniumServer({ port: 0 })
    await server.start()

    const port = server.getServer().address().port
    serverUrl = `http://localhost:${port}`

    console.log(`Performance test server started on ${serverUrl}`)
  })

  afterAll(async () => {
    // Cleanup
    testClients.forEach(client => {
      if (client.socket && client.socket.connected) {
        client.socket.disconnect()
      }
    })

    if (server) {
      await server.shutdown()
    }
  })

  beforeEach(() => {
    testClients = []
  })

  afterEach(() => {
    testClients.forEach(client => {
      if (client.socket && client.socket.connected) {
        client.socket.disconnect()
      }
    })
    testClients = []
  })

  /**
   * Create performance test client
   */
  async function createPerformanceClient(clientId) {
    return new Promise((resolve, reject) => {
      const socket = io(serverUrl, {
        transports: ['websocket'],
        timeout: 5000
      })

      const client = {
        id: clientId,
        socket,
        metrics: {
          latencies: [],
          errors: [],
          messagesReceived: 0,
          messagesSent: 0,
          connectionDrops: 0,
          reconnections: 0
        },
        startTime: performance.now()
      }

      socket.on('connect', () => {
        console.log(`Performance client ${clientId} connected`)
        resolve(client)
      })

      socket.on('disconnect', () => {
        client.metrics.connectionDrops++
      })

      socket.on('reconnect', () => {
        client.metrics.reconnections++
      })

      socket.on('error', (error) => {
        client.metrics.errors.push({
          error: error.message,
          timestamp: Date.now()
        })
      })

      // Track all received messages
      const originalOn = socket.on.bind(socket)
      socket.on = (event, callback) => {
        return originalOn(event, (...args) => {
          client.metrics.messagesReceived++
          callback(...args)
        })
      }

      // Track all sent messages
      const originalEmit = socket.emit.bind(socket)
      socket.emit = (...args) => {
        client.metrics.messagesSent++
        return originalEmit(...args)
      }

      socket.on('connect_error', reject)
      testClients.push(client)
    })
  }

  /**
   * Measure operation latency
   */
  async function measureLatency(client, operation, ...args) {
    const startTime = performance.now()

    return new Promise((resolve, reject) => {
      client.socket.emit(operation, ...args, (response) => {
        const latency = performance.now() - startTime
        client.metrics.latencies.push({
          operation,
          latency,
          timestamp: Date.now()
        })

        if (response.success) {
          resolve({ response, latency })
        } else {
          reject(new Error(response.error?.message || 'Operation failed'))
        }
      })
    })
  }

  /**
   * Generate high-frequency gesture stream
   */
  async function generateGestureStream(client, durationMs, frequencyHz) {
    const interval = 1000 / frequencyHz
    const endTime = Date.now() + durationMs
    const gestures = []

    while (Date.now() < endTime) {
      const gesture = {
        type: ['mouse', 'touch', 'gyroscope'][Math.floor(Math.random() * 3)],
        coordinates: {
          x: Math.random(),
          y: Math.random(),
          z: Math.random()
        },
        intensity: Math.random(),
        timestamp: Date.now()
      }

      try {
        const result = await measureLatency(client, 'gesture', gesture)
        gestures.push(result)
      } catch (error) {
        client.metrics.errors.push({
          error: error.message,
          timestamp: Date.now(),
          operation: 'gesture'
        })
      }

      await new Promise(resolve => setTimeout(resolve, interval))
    }

    return gestures
  }

  test('WebSocket latency under normal load', async () => {
    const client = await createPerformanceClient('latency-test-1')
    const roomId = 'latency-test-room'

    // Join room and measure latency
    const { latency: joinLatency } = await measureLatency(client, 'join-room', {
      roomId,
      userData: { device: 'test', platform: 'jest', capabilities: { mouse: true, touch: false, gyroscope: false } }
    })

    // Send heartbeats and measure latency
    const heartbeatLatencies = []
    for (let i = 0; i < 10; i++) {
      const { latency } = await measureLatency(client, 'heartbeat', {})
      heartbeatLatencies.push(latency)
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Send gestures and measure latency
    const gestureLatencies = []
    for (let i = 0; i < 20; i++) {
      const gesture = {
        type: 'mouse',
        coordinates: { x: Math.random(), y: Math.random() },
        intensity: Math.random(),
        timestamp: Date.now()
      }

      const { latency } = await measureLatency(client, 'gesture', gesture)
      gestureLatencies.push(latency)
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    // Analyze latencies
    const allLatencies = [joinLatency, ...heartbeatLatencies, ...gestureLatencies]
    const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
    const maxLatency = Math.max(...allLatencies)
    const p95Latency = allLatencies.sort((a, b) => a - b)[Math.floor(allLatencies.length * 0.95)]

    console.log(`Latency metrics: avg=${avgLatency.toFixed(2)}ms, max=${maxLatency.toFixed(2)}ms, p95=${p95Latency.toFixed(2)}ms`)

    // Constitutional requirements
    expect(avgLatency).toBeLessThan(100) // <100ms average
    expect(p95Latency).toBeLessThan(150) // <150ms p95
    expect(maxLatency).toBeLessThan(200) // <200ms maximum
  })

  test('High-frequency gesture processing performance', async () => {
    const client = await createPerformanceClient('high-freq-test')
    const roomId = 'high-freq-room'

    await measureLatency(client, 'join-room', {
      roomId,
      userData: { device: 'test', platform: 'jest', capabilities: { mouse: true, touch: true, gyroscope: true } }
    })

    // Generate high-frequency gesture stream (30fps = 30Hz)
    const streamDuration = 3000 // 3 seconds
    const gestureFrequency = 30 // 30 Hz (gestures per second)

    console.log(`Generating ${gestureFrequency}Hz gesture stream for ${streamDuration}ms`)

    const gestureResults = await generateGestureStream(client, streamDuration, gestureFrequency)

    // Analyze performance
    const expectedGestures = Math.floor((streamDuration / 1000) * gestureFrequency)
    const actualGestures = gestureResults.length
    const successRate = actualGestures / expectedGestures

    const gestureLatencies = gestureResults.map(r => r.latency)
    const avgGestureLatency = gestureLatencies.reduce((a, b) => a + b, 0) / gestureLatencies.length
    const maxGestureLatency = Math.max(...gestureLatencies)

    console.log(`High-frequency performance:`, {
      expectedGestures,
      actualGestures,
      successRate: (successRate * 100).toFixed(1) + '%',
      avgLatency: avgGestureLatency.toFixed(2) + 'ms',
      maxLatency: maxGestureLatency.toFixed(2) + 'ms',
      errors: client.metrics.errors.length
    })

    // Performance requirements
    expect(successRate).toBeGreaterThan(0.9) // 90% success rate minimum
    expect(avgGestureLatency).toBeLessThan(200) // <200ms constitutional requirement
    expect(client.metrics.errors.length).toBeLessThan(5) // Minimal errors
  })

  test('Concurrent user load stress test', async () => {
    const concurrentUsers = 8
    const gesturesPerUser = 15
    const roomId = 'stress-test-room'

    console.log(`Starting stress test: ${concurrentUsers} concurrent users, ${gesturesPerUser} gestures each`)

    // Create concurrent clients
    const clientPromises = Array.from({ length: concurrentUsers }, (_, i) =>
      createPerformanceClient(`stress-client-${i}`)
    )
    const clients = await Promise.all(clientPromises)

    // All clients join the same room concurrently
    const joinPromises = clients.map(client =>
      measureLatency(client, 'join-room', {
        roomId,
        userData: { device: 'test', platform: 'jest', capabilities: { mouse: true, touch: false, gyroscope: false } }
      })
    )

    const joinResults = await Promise.allSettled(joinPromises)
    const successfulJoins = joinResults.filter(r => r.status === 'fulfilled').length

    expect(successfulJoins).toBe(concurrentUsers) // All should join successfully

    // Generate concurrent gesture load
    const gesturePromises = []
    for (let gestureIndex = 0; gestureIndex < gesturesPerUser; gestureIndex++) {
      clients.forEach((client, clientIndex) => {
        const gesturePromise = measureLatency(client, 'gesture', {
          type: 'mouse',
          coordinates: {
            x: (clientIndex + gestureIndex) / (concurrentUsers + gesturesPerUser),
            y: Math.random()
          },
          intensity: Math.random(),
          timestamp: Date.now()
        })
        gesturePromises.push(gesturePromise)
      })

      // Stagger gesture sends slightly
      if (gestureIndex < gesturesPerUser - 1) {
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }

    // Wait for all gestures to complete
    const gestureResults = await Promise.allSettled(gesturePromises)
    const successfulGestures = gestureResults.filter(r => r.status === 'fulfilled').length
    const totalGestures = concurrentUsers * gesturesPerUser
    const gestureSuccessRate = successfulGestures / totalGestures

    // Analyze latencies from successful gestures
    const latencies = gestureResults
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value.latency)

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length
    const maxLatency = Math.max(...latencies)
    const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]

    console.log(`Stress test results:`, {
      totalGestures,
      successfulGestures,
      successRate: (gestureSuccessRate * 100).toFixed(1) + '%',
      avgLatency: avgLatency.toFixed(2) + 'ms',
      maxLatency: maxLatency.toFixed(2) + 'ms',
      p95Latency: p95Latency.toFixed(2) + 'ms'
    })

    // Performance under stress requirements
    expect(gestureSuccessRate).toBeGreaterThan(0.85) // 85% success rate under stress
    expect(avgLatency).toBeLessThan(200) // Average still under constitutional limit
    expect(p95Latency).toBeLessThan(300) // P95 reasonable under stress

    // Check server health after stress test
    const healthResponse = await fetch(`${serverUrl.replace('ws:', 'http:')}/health`)
    const healthData = await healthResponse.json()

    expect(healthData.status).toBe('healthy')
    expect(healthData.memory.used).toBeLessThan(500) // Memory usage reasonable
  })

  test('Connection drop and reconnection handling', async () => {
    const client = await createPerformanceClient('reconnection-test')
    const roomId = 'reconnection-room'

    // Join room initially
    await measureLatency(client, 'join-room', {
      roomId,
      userData: { device: 'test', platform: 'jest', capabilities: { mouse: true, touch: false, gyroscope: false } }
    })

    // Force disconnect
    client.socket.disconnect()

    // Wait for disconnection to register
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(client.metrics.connectionDrops).toBe(1)

    // Reconnect manually (simulating auto-reconnect)
    await new Promise((resolve) => {
      client.socket.connect()
      client.socket.on('connect', resolve)
    })

    // Wait for reconnection to stabilize
    await new Promise(resolve => setTimeout(resolve, 200))

    // Try to rejoin room after reconnection
    const rejoinResult = await measureLatency(client, 'join-room', {
      roomId,
      userData: { device: 'test', platform: 'jest', capabilities: { mouse: true, touch: false, gyroscope: false } }
    })

    expect(rejoinResult.response.success).toBe(true)

    // Send gesture to verify functionality restored
    const gestureResult = await measureLatency(client, 'gesture', {
      type: 'mouse',
      coordinates: { x: 0.5, y: 0.5 },
      intensity: 0.7,
      timestamp: Date.now()
    })

    expect(gestureResult.response.success).toBe(true)
    expect(gestureResult.latency).toBeLessThan(200)
  })

  test('Memory pressure and cleanup performance', async () => {
    const roomId = 'memory-pressure-room'
    const client = await createPerformanceClient('memory-test')

    await measureLatency(client, 'join-room', {
      roomId,
      userData: { device: 'test', platform: 'jest', capabilities: { mouse: true, touch: true, gyroscope: true } }
    })

    // Get initial memory state
    const initialHealthResponse = await fetch(`${serverUrl.replace('ws:', 'http:')}/health`)
    const initialHealth = await initialHealthResponse.json()
    const initialMemory = initialHealth.memory.used

    console.log(`Initial memory usage: ${initialMemory}MB`)

    // Generate large number of gestures to pressure memory
    const memoryPressureGestures = 500
    const batchSize = 50

    for (let batch = 0; batch < memoryPressureGestures / batchSize; batch++) {
      const batchPromises = []

      for (let i = 0; i < batchSize; i++) {
        const gesturePromise = measureLatency(client, 'gesture', {
          type: ['mouse', 'touch', 'gyroscope'][i % 3],
          coordinates: {
            x: Math.random(),
            y: Math.random(),
            z: Math.random()
          },
          intensity: Math.random(),
          timestamp: Date.now()
        })
        batchPromises.push(gesturePromise)
      }

      await Promise.allSettled(batchPromises)

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    // Wait for memory cleanup cycles
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Check final memory state
    const finalHealthResponse = await fetch(`${serverUrl.replace('ws:', 'http:')}/health`)
    const finalHealth = await finalHealthResponse.json()
    const finalMemory = finalHealth.memory.used

    console.log(`Final memory usage: ${finalMemory}MB (change: ${finalMemory - initialMemory}MB)`)

    // Memory should not have grown excessively
    const memoryGrowth = finalMemory - initialMemory
    expect(memoryGrowth).toBeLessThan(100) // <100MB growth for 500 gestures

    // System should still be healthy
    expect(finalHealth.status).toBe('healthy')

    // Latency should not have degraded significantly
    const recentLatencies = client.metrics.latencies.slice(-10).map(l => l.latency)
    const avgRecentLatency = recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length

    expect(avgRecentLatency).toBeLessThan(250) // Reasonable under memory pressure
  })

  test('Error handling and graceful degradation', async () => {
    const client = await createPerformanceClient('error-test')

    // Test invalid operations
    const invalidOperations = [
      // Invalid room join
      { operation: 'join-room', data: { roomId: '', userData: {} } },
      { operation: 'join-room', data: { roomId: 'invalid-chars-!@#$%', userData: {} } },

      // Invalid gesture data
      { operation: 'gesture', data: { type: 'invalid', coordinates: {}, intensity: -1 } },
      { operation: 'gesture', data: { coordinates: { x: 2, y: -1 }, intensity: 'invalid' } },

      // Operations without room
      { operation: 'gesture', data: { type: 'mouse', coordinates: { x: 0.5, y: 0.5 }, intensity: 0.5 } },
      { operation: 'leave-room', data: {} }
    ]

    const errorResults = []

    for (const op of invalidOperations) {
      try {
        await measureLatency(client, op.operation, op.data)
        errorResults.push({ operation: op.operation, result: 'unexpected_success' })
      } catch (error) {
        errorResults.push({
          operation: op.operation,
          result: 'expected_error',
          error: error.message
        })
      }
    }

    // All invalid operations should fail gracefully
    const expectedErrors = errorResults.filter(r => r.result === 'expected_error')
    expect(expectedErrors.length).toBe(invalidOperations.length)

    // System should still be responsive after errors
    const roomId = 'recovery-test-room'
    const validJoin = await measureLatency(client, 'join-room', {
      roomId,
      userData: { device: 'test', platform: 'jest', capabilities: { mouse: true, touch: false, gyroscope: false } }
    })

    expect(validJoin.response.success).toBe(true)
    expect(validJoin.latency).toBeLessThan(200)
  })

  test('Resource cleanup and limits', async () => {
    const roomId = 'cleanup-test-room'

    // Create multiple clients to test resource management
    const clients = []
    for (let i = 0; i < 5; i++) {
      const client = await createPerformanceClient(`cleanup-client-${i}`)
      clients.push(client)
    }

    // All clients join and generate activity
    for (const client of clients) {
      await measureLatency(client, 'join-room', {
        roomId,
        userData: { device: 'test', platform: 'jest', capabilities: { mouse: true, touch: false, gyroscope: false } }
      })

      // Generate some gestures
      for (let i = 0; i < 10; i++) {
        await measureLatency(client, 'gesture', {
          type: 'mouse',
          coordinates: { x: Math.random(), y: Math.random() },
          intensity: Math.random(),
          timestamp: Date.now()
        })
      }
    }

    // Get initial server metrics
    const initialMetricsResponse = await fetch(`${serverUrl.replace('ws:', 'http:')}/api/metrics`)
    const initialMetrics = await initialMetricsResponse.json()

    // Disconnect all clients
    clients.forEach(client => client.socket.disconnect())

    // Wait for cleanup cycles
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Check that resources were cleaned up
    const finalMetricsResponse = await fetch(`${serverUrl.replace('ws:', 'http:')}/api/metrics`)
    const finalMetrics = await finalMetricsResponse.json()

    console.log('Resource cleanup metrics:', {
      initial: {
        rooms: initialMetrics.rooms.totalRooms,
        patterns: initialMetrics.patterns.totalPatterns
      },
      final: {
        rooms: finalMetrics.rooms.totalRooms,
        patterns: finalMetrics.patterns.totalPatterns
      }
    })

    // Resources should be cleaned up
    expect(finalMetrics.rooms.totalRooms).toBeLessThanOrEqual(initialMetrics.rooms.totalRooms)
    expect(finalMetrics.server.connections).toBe(0)
  })

  test('Constitutional performance requirements validation', async () => {
    const client = await createPerformanceClient('constitutional-test')
    const roomId = 'constitutional-room'

    await measureLatency(client, 'join-room', {
      roomId,
      userData: { device: 'test', platform: 'jest', capabilities: { mouse: true, touch: true, gyroscope: true } }
    })

    // Test all constitutional requirements in sequence
    const constitutionalTests = []

    // 1. WebSocket latency <100ms
    for (let i = 0; i < 20; i++) {
      const { latency } = await measureLatency(client, 'heartbeat', {})
      constitutionalTests.push({ requirement: 'websocket_latency', value: latency, limit: 100 })
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    // 2. Gesture processing <200ms
    for (let i = 0; i < 20; i++) {
      const { latency } = await measureLatency(client, 'gesture', {
        type: ['mouse', 'touch', 'gyroscope'][i % 3],
        coordinates: { x: Math.random(), y: Math.random(), z: Math.random() },
        intensity: Math.random(),
        timestamp: Date.now()
      })
      constitutionalTests.push({ requirement: 'gesture_processing', value: latency, limit: 200 })
      await new Promise(resolve => setTimeout(resolve, 30))
    }

    // Analyze constitutional compliance
    const compliance = {}
    constitutionalTests.forEach(test => {
      if (!compliance[test.requirement]) {
        compliance[test.requirement] = { values: [], violations: 0 }
      }
      compliance[test.requirement].values.push(test.value)
      if (test.value > test.limit) {
        compliance[test.requirement].violations++
      }
    })

    // Calculate compliance statistics
    Object.keys(compliance).forEach(requirement => {
      const data = compliance[requirement]
      data.average = data.values.reduce((a, b) => a + b, 0) / data.values.length
      data.max = Math.max(...data.values)
      data.complianceRate = 1 - (data.violations / data.values.length)
    })

    console.log('Constitutional compliance report:', compliance)

    // Constitutional requirements must be met
    expect(compliance.websocket_latency.complianceRate).toBeGreaterThan(0.95) // 95% compliance
    expect(compliance.gesture_processing.complianceRate).toBeGreaterThan(0.95) // 95% compliance
    expect(compliance.websocket_latency.average).toBeLessThan(100)
    expect(compliance.gesture_processing.average).toBeLessThan(200)
  })
})

module.exports = {
  testName: 'Performance and Error Recovery Integration',
  description: 'System performance under stress and error recovery mechanisms',
  constitutionalRequirements: [
    '<200ms gesture-to-audio latency',
    '<100ms WebSocket latency',
    '60fps rendering capability',
    'Graceful error handling',
    'Memory cleanup and resource limits',
    'Connection recovery mechanisms'
  ]
}