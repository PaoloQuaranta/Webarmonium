/**
 * Integration Test: Multi-User Collaboration (T013)
 * Tests real-time collaborative interaction between multiple users
 * Constitutional requirement: 5-10 users, <100ms sync latency, anonymous sessions
 */

const { expect } = require('@jest/globals')
const io = require('socket.io-client')
const WebarmoniumServer = require('../../backend/src/server')

describe('Multi-User Collaboration Integration', () => {
  let server
  let serverUrl
  let users = []
  const maxUsers = 5

  beforeAll(async () => {
    // Start test server
    server = new WebarmoniumServer({ port: 0 }) // Random port
    await server.start()

    const port = server.getServer().address().port
    serverUrl = `http://localhost:${port}`

    console.log(`Test server started on ${serverUrl}`)
  })

  afterAll(async () => {
    // Cleanup all users
    users.forEach(user => {
      if (user.socket && user.socket.connected) {
        user.socket.disconnect()
      }
    })

    // Shutdown server
    if (server) {
      await server.shutdown()
    }
  })

  beforeEach(() => {
    users = []
  })

  afterEach(() => {
    // Disconnect users after each test
    users.forEach(user => {
      if (user.socket && user.socket.connected) {
        user.socket.disconnect()
      }
    })
    users = []
  })

  /**
   * Create a test user and connect to server
   */
  async function createUser(userId) {
    return new Promise((resolve, reject) => {
      const socket = io(serverUrl, {
        transports: ['websocket'],
        timeout: 5000
      })

      const user = {
        id: userId,
        socket,
        receivedEvents: [],
        latencyMeasurements: []
      }

      socket.on('connect', () => {
        console.log(`User ${userId} connected`)

        // Track all received events
        const originalOn = socket.on.bind(socket)
        socket.on = (event, callback) => {
          return originalOn(event, (...args) => {
            user.receivedEvents.push({
              event,
              timestamp: Date.now(),
              data: args[0]
            })
            callback(...args)
          })
        }

        resolve(user)
      })

      socket.on('connect_error', reject)

      users.push(user)
    })
  }

  /**
   * Join room with latency measurement
   */
  async function joinRoom(user, roomId) {
    const startTime = performance.now()

    return new Promise((resolve, reject) => {
      user.socket.emit('join-room', {
        roomId,
        userData: {
          device: 'test',
          platform: 'jest',
          capabilities: {
            mouse: true,
            touch: false,
            gyroscope: false
          }
        }
      }, (response) => {
        const latency = performance.now() - startTime
        user.latencyMeasurements.push(latency)

        if (response.success) {
          user.roomId = roomId
          user.userId = response.userId
          console.log(`User ${user.id} joined room ${roomId} (${latency.toFixed(2)}ms)`)
          resolve(response)
        } else {
          reject(new Error(response.error?.message || 'Join failed'))
        }
      })
    })
  }

  /**
   * Send gesture with latency measurement
   */
  async function sendGesture(user, gestureData) {
    const startTime = performance.now()

    return new Promise((resolve, reject) => {
      user.socket.emit('gesture', gestureData, (response) => {
        const latency = performance.now() - startTime
        user.latencyMeasurements.push(latency)

        if (response.success) {
          resolve({ response, latency })
        } else {
          reject(new Error(response.error?.message || 'Gesture failed'))
        }
      })
    })
  }

  test('Multiple users can join the same room simultaneously', async () => {
    const roomId = 'test-multi-room-1'
    const userCount = 3

    // Create multiple users
    for (let i = 0; i < userCount; i++) {
      const user = await createUser(`user-${i}`)
      expect(user.socket.connected).toBe(true)
    }

    // All users join the same room
    const joinPromises = users.map(user => joinRoom(user, roomId))
    const joinResponses = await Promise.all(joinPromises)

    // Verify all joins successful
    joinResponses.forEach((response, index) => {
      expect(response.success).toBe(true)
      expect(response.room.roomId).toBe(roomId)
      expect(response.room.userCount).toBe(index + 1) // Progressive count
    })

    // Wait for user-joined events to propagate
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify other users received user-joined events
    users.forEach((user, userIndex) => {
      const userJoinedEvents = user.receivedEvents.filter(e => e.event === 'user-joined')

      // Each user should receive join events for users who joined after them
      expect(userJoinedEvents.length).toBe(userCount - userIndex - 1)
    })

    // Test constitutional latency requirement (<100ms)
    users.forEach(user => {
      const avgLatency = user.latencyMeasurements.reduce((a, b) => a + b, 0) / user.latencyMeasurements.length
      expect(avgLatency).toBeLessThan(100)
    })
  })

  test('Gesture echoes are synchronized between all users', async () => {
    const roomId = 'test-sync-room'
    const userCount = 4

    // Create and join users
    for (let i = 0; i < userCount; i++) {
      const user = await createUser(`sync-user-${i}`)
      await joinRoom(user, roomId)
    }

    // First user sends a gesture
    const gestureData = {
      type: 'mouse',
      coordinates: { x: 0.5, y: 0.7 },
      intensity: 0.8,
      timestamp: Date.now()
    }

    const gestureUser = users[0]
    const { latency } = await sendGesture(gestureUser, gestureData)

    // Wait for gesture echoes to propagate
    await new Promise(resolve => setTimeout(resolve, 150))

    // Verify other users received gesture-echo
    const otherUsers = users.slice(1)
    otherUsers.forEach(user => {
      const gestureEchoes = user.receivedEvents.filter(e => e.event === 'gesture-echo')
      expect(gestureEchoes.length).toBeGreaterThanOrEqual(1)

      const echo = gestureEchoes[0]
      expect(echo.data.userId).toBe(gestureUser.userId)
      expect(echo.data.visualFeedback.x).toBeCloseTo(0.5, 1)
      expect(echo.data.visualFeedback.y).toBeCloseTo(0.7, 1)
      expect(echo.data.visualFeedback.intensity).toBeCloseTo(0.8, 1)
    })

    // Test gesture processing latency (<200ms constitutional requirement)
    expect(latency).toBeLessThan(200)
  })

  test('Sonic updates are broadcast to all room participants', async () => {
    const roomId = 'test-sonic-room'
    const userCount = 3

    // Create and join users
    for (let i = 0; i < userCount; i++) {
      const user = await createUser(`sonic-user-${i}`)
      await joinRoom(user, roomId)
    }

    // Send multiple gestures to trigger sonic evolution
    const gestureSequence = [
      { type: 'touch', coordinates: { x: 0.2, y: 0.3 }, intensity: 0.9 },
      { type: 'mouse', coordinates: { x: 0.8, y: 0.6 }, intensity: 0.7 },
      { type: 'gyroscope', coordinates: { x: 0.5, y: 0.5, z: 0.8 }, intensity: 0.6 }
    ]

    // Send gestures from different users
    for (let i = 0; i < gestureSequence.length; i++) {
      const user = users[i % users.length]
      await sendGesture(user, gestureSequence[i])
      await new Promise(resolve => setTimeout(resolve, 50)) // Small delay between gestures
    }

    // Wait for sonic updates to be generated and broadcast
    await new Promise(resolve => setTimeout(resolve, 300))

    // Verify all users received sonic-update events
    users.forEach((user, userIndex) => {
      const sonicUpdates = user.receivedEvents.filter(e => e.event === 'sonic-update')

      expect(sonicUpdates.length).toBeGreaterThan(0)

      // Verify sonic update structure
      const update = sonicUpdates[0]
      expect(update.data.roomId).toBe(roomId)
      expect(update.data.patterns).toBeDefined()
      expect(Array.isArray(update.data.patterns)).toBe(true)
      expect(update.data.memoryInfluence).toBeDefined()
      expect(typeof update.data.memoryInfluence).toBe('number')
    })
  })

  test('Room capacity limits are enforced', async () => {
    const roomId = 'test-capacity-room'
    const maxCapacity = 10 // Constitutional limit

    // Create users up to capacity
    for (let i = 0; i < maxCapacity; i++) {
      const user = await createUser(`capacity-user-${i}`)
      const response = await joinRoom(user, roomId)
      expect(response.success).toBe(true)
      expect(response.room.userCount).toBe(i + 1)
    }

    // Try to add one more user (should fail)
    const overflowUser = await createUser('overflow-user')

    await expect(joinRoom(overflowUser, roomId)).rejects.toThrow('ROOM_FULL')
  })

  test('User disconnection is handled gracefully', async () => {
    const roomId = 'test-disconnect-room'
    const userCount = 4

    // Create and join users
    for (let i = 0; i < userCount; i++) {
      const user = await createUser(`disconnect-user-${i}`)
      await joinRoom(user, roomId)
    }

    // Disconnect middle user
    const disconnectingUser = users[1]
    const disconnectUserId = disconnectingUser.userId

    disconnectingUser.socket.disconnect()

    // Wait for disconnection to propagate
    await new Promise(resolve => setTimeout(resolve, 200))

    // Verify remaining users received user-left event (backend emits user-left on disconnect)
    const remainingUsers = users.filter(u => u !== disconnectingUser)
    remainingUsers.forEach(user => {
      const leftEvents = user.receivedEvents.filter(e => e.event === 'user-left')

      expect(leftEvents.length).toBe(1)
      expect(leftEvents[0].data.userId).toBe(disconnectUserId)
    })
  })

  test('Memory state evolves with collaborative activity', async () => {
    const roomId = 'test-memory-room'
    const userCount = 3

    // Create and join users
    for (let i = 0; i < userCount; i++) {
      const user = await createUser(`memory-user-${i}`)
      await joinRoom(user, roomId)
    }

    // Send collaborative gesture sequence
    const collaborativeGestures = [
      { type: 'touch', coordinates: { x: 0.1, y: 0.2 }, intensity: 0.8 },
      { type: 'touch', coordinates: { x: 0.3, y: 0.4 }, intensity: 0.7 },
      { type: 'mouse', coordinates: { x: 0.5, y: 0.6 }, intensity: 0.9 },
      { type: 'gyroscope', coordinates: { x: 0.7, y: 0.8, z: 0.5 }, intensity: 0.6 }
    ]

    let memoryPhaseProgression = []

    // Send gestures and track memory evolution
    for (let i = 0; i < collaborativeGestures.length; i++) {
      const user = users[i % users.length]
      const response = await sendGesture(user, collaborativeGestures[i])

      expect(response.response.success).toBe(true)

      if (response.response.memoryUpdated) {
        memoryPhaseProgression.push(response.response.memoryPhase)
      }

      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // Wait for final sonic updates
    await new Promise(resolve => setTimeout(resolve, 200))

    // Verify memory evolution occurred
    const sonicUpdates = users[0].receivedEvents.filter(e => e.event === 'sonic-update')
    expect(sonicUpdates.length).toBeGreaterThan(0)

    const finalUpdate = sonicUpdates[sonicUpdates.length - 1]
    expect(finalUpdate.data.roomPersonality).toBeDefined()
    expect(finalUpdate.data.roomPersonality.collaborativeActivity).toBeGreaterThan(1)
  })

  test('Cross-platform input synchronization', async () => {
    const roomId = 'test-crossplatform-room'

    // Create users with different device capabilities
    const deviceUsers = [
      {
        id: 'desktop-user',
        userData: {
          device: 'desktop',
          platform: 'Win32',
          capabilities: { mouse: true, touch: false, gyroscope: false }
        }
      },
      {
        id: 'mobile-user',
        userData: {
          device: 'mobile',
          platform: 'iPhone',
          capabilities: { mouse: false, touch: true, gyroscope: true }
        }
      },
      {
        id: 'tablet-user',
        userData: {
          device: 'tablet',
          platform: 'iPad',
          capabilities: { mouse: false, touch: true, gyroscope: false }
        }
      }
    ]

    // Create and join all device users
    for (const deviceUser of deviceUsers) {
      const user = await createUser(deviceUser.id)
      await joinRoom(user, roomId)
    }

    // Send device-specific gestures
    const deviceGestures = [
      { type: 'mouse', coordinates: { x: 0.3, y: 0.4 }, intensity: 0.7 },    // Desktop
      { type: 'gyroscope', coordinates: { x: 0.6, y: 0.7, z: 0.8 }, intensity: 0.5 }, // Mobile
      { type: 'touch', coordinates: { x: 0.8, y: 0.2 }, intensity: 0.9 }     // Tablet
    ]

    // Send gestures from each device type
    for (let i = 0; i < deviceGestures.length; i++) {
      const user = users[i]
      await sendGesture(user, deviceGestures[i])
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    // Wait for cross-platform synchronization
    await new Promise(resolve => setTimeout(resolve, 200))

    // Verify all users received echoes from all device types
    users.forEach(user => {
      const gestureEchoes = user.receivedEvents.filter(e => e.event === 'gesture-echo')

      // Each user should receive echoes from the other 2 users
      expect(gestureEchoes.length).toBe(2)

      // Verify different gesture types were received
      const gestureTypes = new Set(gestureEchoes.map(echo => echo.data.visualFeedback.type))
      expect(gestureTypes.size).toBe(2) // Should have received 2 different types
    })
  })

  test('Performance under concurrent user load', async () => {
    const roomId = 'test-performance-room'
    const concurrentUsers = 5
    const gesturesPerUser = 10

    // Create concurrent users
    const userPromises = Array.from({ length: concurrentUsers }, (_, i) =>
      createUser(`perf-user-${i}`)
    )
    const createdUsers = await Promise.all(userPromises)

    // Join room concurrently
    const joinPromises = createdUsers.map(user => joinRoom(user, roomId))
    await Promise.all(joinPromises)

    // Send concurrent gestures
    const gesturePromises = []
    for (let i = 0; i < gesturesPerUser; i++) {
      createdUsers.forEach(user => {
        const gesturePromise = sendGesture(user, {
          type: 'mouse',
          coordinates: {
            x: Math.random(),
            y: Math.random()
          },
          intensity: Math.random(),
          timestamp: Date.now()
        })
        gesturePromises.push(gesturePromise)
      })

      // Small delay to simulate realistic timing
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    // Wait for all gestures to complete
    const gestureResults = await Promise.allSettled(gesturePromises)

    // Analyze performance
    const successful = gestureResults.filter(r => r.status === 'fulfilled').length
    const failed = gestureResults.filter(r => r.status === 'rejected').length
    const successRate = successful / gestureResults.length

    console.log(`Performance test: ${successful}/${gestureResults.length} gestures successful (${(successRate * 100).toFixed(1)}%)`)

    // Constitutional performance requirements
    expect(successRate).toBeGreaterThan(0.95) // 95% success rate minimum

    // Check average latency across all users
    const allLatencies = createdUsers.flatMap(user => user.latencyMeasurements)
    const avgLatency = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length

    expect(avgLatency).toBeLessThan(100) // <100ms constitutional requirement
  })
})

module.exports = {
  testName: 'Multi-User Collaboration Integration',
  description: 'Real-time collaborative interaction between multiple users',
  constitutionalRequirements: [
    '5-10 users maximum capacity',
    '<100ms WebSocket synchronization',
    'Anonymous session management',
    'Cross-platform input normalization',
    'Memory state collaborative evolution'
  ]
}