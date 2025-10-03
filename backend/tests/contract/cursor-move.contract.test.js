const { connect, emitAndWait, waitForEvent, disconnect, measureLatency } = require('../helpers/socket-test-utils')

/**
 * Contract Test: cursor-move event
 * Validates cursor position broadcast schema and behavior
 */

describe('Contract: cursor-move event', () => {
  let socket1, socket2

  beforeEach(async () => {
    socket1 = await connect()
    socket2 = await connect()

    // Both join same room
    await emitAndWait(socket1, 'join-room', { roomId: 'cursor-test-room' }, 'room-joined')
    await emitAndWait(socket2, 'join-room', { roomId: 'cursor-test-room' }, 'room-joined')
  })

  afterEach(async () => {
    if (socket1) await disconnect(socket1)
    if (socket2) await disconnect(socket2)
  })

  test('should broadcast cursor-position with valid schema', async () => {
    const cursorPromise = waitForEvent(socket2, 'cursor-position', 2000)

    socket1.emit('cursor-move', {
      x: 150,
      y: 200,
      isDrawing: false,
      timestamp: Date.now()
    })

    const cursor = await cursorPromise

    // Validate cursor schema
    expect(cursor).toHaveProperty('userId')
    expect(cursor).toHaveProperty('color')
    expect(cursor).toHaveProperty('x')
    expect(cursor).toHaveProperty('y')
    expect(cursor).toHaveProperty('isDrawing')
    expect(cursor).toHaveProperty('timestamp')

    // Validate userId format (UUID)
    expect(cursor.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

    // Validate color format (hex - lowercase only per spec)
    expect(cursor.color).toMatch(/^#[0-9a-f]{6}$/)

    // Validate coordinates
    expect(typeof cursor.x).toBe('number')
    expect(typeof cursor.y).toBe('number')
    expect(cursor.x).toBe(150)
    expect(cursor.y).toBe(200)

    // Validate isDrawing flag
    expect(typeof cursor.isDrawing).toBe('boolean')
    expect(cursor.isDrawing).toBe(false)

    // Validate timestamp
    expect(typeof cursor.timestamp).toBe('number')
    expect(cursor.timestamp).toBeGreaterThan(0)
  })

  test('should broadcast isDrawing=true when drawing', async () => {
    const cursorPromise = waitForEvent(socket2, 'cursor-position', 2000)

    socket1.emit('cursor-move', {
      x: 300,
      y: 400,
      isDrawing: true,
      timestamp: Date.now()
    })

    const cursor = await cursorPromise

    expect(cursor.isDrawing).toBe(true)
  })

  test('should handle rapid cursor updates (60Hz simulation)', async () => {
    const cursors = []

    socket2.on('cursor-position', (cursor) => {
      cursors.push(cursor)
    })

    // Simulate 60 cursor updates (1 second at 60Hz)
    for (let i = 0; i < 60; i++) {
      socket1.emit('cursor-move', {
        x: 100 + i,
        y: 100 + i,
        isDrawing: false,
        timestamp: Date.now()
      })
      await new Promise(resolve => setTimeout(resolve, 16)) // ~60fps
    }

    await new Promise(resolve => setTimeout(resolve, 200))

    // Should receive most updates (allow some drops)
    expect(cursors.length).toBeGreaterThan(50)
    expect(cursors.length).toBeLessThanOrEqual(60)

    // All cursors should have same userId
    const userIds = new Set(cursors.map(c => c.userId))
    expect(userIds.size).toBe(1)
  })

  test('should not broadcast cursor to moving user', async () => {
    let receivedBySocket1 = false

    socket1.once('cursor-position', () => {
      receivedBySocket1 = true
    })

    const cursorPromise = waitForEvent(socket2, 'cursor-position', 2000)

    socket1.emit('cursor-move', {
      x: 250,
      y: 350,
      isDrawing: false,
      timestamp: Date.now()
    })

    await cursorPromise
    await new Promise(resolve => setTimeout(resolve, 200))

    // Socket1 should NOT receive its own cursor update
    expect(receivedBySocket1).toBe(false)
  })

  test('should broadcast cursor to multiple room members', async () => {
    const socket3 = await connect()
    await emitAndWait(socket3, 'join-room', { roomId: 'cursor-test-room' }, 'room-joined')

    try {
      const cursor2Promise = waitForEvent(socket2, 'cursor-position', 2000)
      const cursor3Promise = waitForEvent(socket3, 'cursor-position', 2000)

      socket1.emit('cursor-move', {
        x: 500,
        y: 600,
        isDrawing: true,
        timestamp: Date.now()
      })

      const [cursor2, cursor3] = await Promise.all([cursor2Promise, cursor3Promise])

      // Both should receive same cursor data
      expect(cursor2.userId).toBe(cursor3.userId)
      expect(cursor2.x).toBe(500)
      expect(cursor3.x).toBe(500)
      expect(cursor2.isDrawing).toBe(true)
      expect(cursor3.isDrawing).toBe(true)
    } finally {
      await disconnect(socket3)
    }
  })

  test('should handle cursor coordinates at canvas boundaries', async () => {
    const cursorPromise = waitForEvent(socket2, 'cursor-position', 2000)

    socket1.emit('cursor-move', {
      x: 0,
      y: 0,
      isDrawing: false,
      timestamp: Date.now()
    })

    const cursor = await cursorPromise

    expect(cursor.x).toBe(0)
    expect(cursor.y).toBe(0)
  })

  test('should preserve timestamp from client', async () => {
    const clientTimestamp = Date.now()
    const cursorPromise = waitForEvent(socket2, 'cursor-position', 2000)

    socket1.emit('cursor-move', {
      x: 100,
      y: 100,
      isDrawing: false,
      timestamp: clientTimestamp
    })

    const cursor = await cursorPromise

    // Server may add its own timestamp, but should be close to client timestamp
    expect(Math.abs(cursor.timestamp - clientTimestamp)).toBeLessThan(1000)
  })

  test('should broadcast cursor within 100ms latency (UI target)', async () => {
    const cursorPromise = waitForEvent(socket2, 'cursor-position', 2000)
    const startTime = Date.now()

    socket1.emit('cursor-move', {
      x: 250,
      y: 350,
      isDrawing: false,
      timestamp: Date.now()
    })

    await cursorPromise
    const latency = Date.now() - startTime

    // Constitutional requirement: <100ms UI response time
    expect(latency).toBeLessThan(100)
  })

  test('should maintain low latency for 60Hz cursor updates', async () => {
    const latencies = []

    for (let i = 0; i < 60; i++) {
      const cursorPromise = waitForEvent(socket2, 'cursor-position', 2000)
      const startTime = Date.now()

      socket1.emit('cursor-move', {
        x: 100 + i,
        y: 100 + i,
        isDrawing: false,
        timestamp: Date.now()
      })

      await cursorPromise
      latencies.push(Date.now() - startTime)

      // Simulate 60Hz (16.67ms between updates)
      await new Promise(resolve => setTimeout(resolve, 16))
    }

    // Calculate p50 latency
    const sorted = latencies.slice().sort((a, b) => a - b)
    const p50Index = Math.floor(0.5 * sorted.length)
    const p50Latency = sorted[p50Index]

    console.log(`Cursor update latencies (60Hz) - p50: ${p50Latency}ms, max: ${Math.max(...latencies)}ms`)

    // All cursor updates should be under 100ms (UI target)
    expect(Math.max(...latencies)).toBeLessThan(100)

    // P50 should be very low for good UX
    expect(p50Latency).toBeLessThan(50)
  })
})
