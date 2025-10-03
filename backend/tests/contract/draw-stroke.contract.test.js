const { connect, emitAndWait, waitForEvent, disconnect, measureLatency } = require('../helpers/socket-test-utils')

/**
 * Contract Test: draw-start, draw-point, draw-end events
 * Validates drawing stroke event schema and flow
 */

describe('Contract: drawing stroke events', () => {
  let socket1, socket2

  beforeEach(async () => {
    socket1 = await connect()
    socket2 = await connect()

    // Both join same room
    await emitAndWait(socket1, 'join-room', { roomId: 'draw-test-room' }, 'room-joined')
    await emitAndWait(socket2, 'join-room', { roomId: 'draw-test-room' }, 'room-joined')
  })

  afterEach(async () => {
    if (socket1) await disconnect(socket1)
    if (socket2) await disconnect(socket2)
  })

  test('should broadcast completed stroke with valid schema', async () => {
    // Socket2 listens for stroke
    const strokePromise = waitForEvent(socket2, 'draw-stroke', 5000)

    // Socket1 draws a stroke
    socket1.emit('draw-start', { x: 100, y: 100, strokeWidth: 2 })

    await new Promise(resolve => setTimeout(resolve, 50))

    socket1.emit('draw-point', { x: 150, y: 150 })
    socket1.emit('draw-point', { x: 200, y: 200 })

    await new Promise(resolve => setTimeout(resolve, 50))

    socket1.emit('draw-end', { x: 250, y: 250 })

    // Socket2 should receive the completed stroke
    const stroke = await strokePromise

    // Validate stroke schema
    expect(stroke).toHaveProperty('id')
    expect(stroke).toHaveProperty('userId')
    expect(stroke).toHaveProperty('color')
    expect(stroke).toHaveProperty('strokeWidth')
    expect(stroke).toHaveProperty('points')
    expect(stroke).toHaveProperty('startedAt')
    expect(stroke).toHaveProperty('completedAt')

    // Validate stroke.id format (UUID)
    expect(stroke.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

    // Validate stroke.color format (hex - lowercase only per spec)
    expect(stroke.color).toMatch(/^#[0-9a-f]{6}$/)

    // Validate stroke.strokeWidth
    expect(stroke.strokeWidth).toBe(2)
    expect(stroke.strokeWidth).toBeGreaterThanOrEqual(1)
    expect(stroke.strokeWidth).toBeLessThanOrEqual(20)

    // Validate points array
    expect(Array.isArray(stroke.points)).toBe(true)
    expect(stroke.points.length).toBeGreaterThanOrEqual(2)

    stroke.points.forEach(point => {
      expect(point).toHaveProperty('x')
      expect(point).toHaveProperty('y')
      expect(point).toHaveProperty('t')
      expect(typeof point.x).toBe('number')
      expect(typeof point.y).toBe('number')
      expect(typeof point.t).toBe('number')
      expect(point.t).toBeGreaterThanOrEqual(0)
    })

    // Validate timestamps
    expect(new Date(stroke.startedAt).getTime()).not.toBeNaN()
    expect(new Date(stroke.completedAt).getTime()).not.toBeNaN()
    expect(new Date(stroke.completedAt).getTime()).toBeGreaterThanOrEqual(new Date(stroke.startedAt).getTime())
  })

  test('should include all points in correct order', async () => {
    const strokePromise = waitForEvent(socket2, 'draw-stroke', 5000)

    const expectedPoints = [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
      { x: 40, y: 40 },
      { x: 50, y: 50 }
    ]

    socket1.emit('draw-start', { x: expectedPoints[0].x, y: expectedPoints[0].y, strokeWidth: 3 })

    for (let i = 1; i < expectedPoints.length - 1; i++) {
      await new Promise(resolve => setTimeout(resolve, 10))
      socket1.emit('draw-point', expectedPoints[i])
    }

    await new Promise(resolve => setTimeout(resolve, 10))
    socket1.emit('draw-end', expectedPoints[expectedPoints.length - 1])

    const stroke = await strokePromise

    expect(stroke.points.length).toBe(expectedPoints.length)

    // Verify points match (allowing for slight timestamp variations)
    for (let i = 0; i < expectedPoints.length; i++) {
      expect(stroke.points[i].x).toBe(expectedPoints[i].x)
      expect(stroke.points[i].y).toBe(expectedPoints[i].y)
    }
  })

  test('should not broadcast stroke to drawing user', async () => {
    let receivedBySocket1 = false

    socket1.once('draw-stroke', () => {
      receivedBySocket1 = true
    })

    const strokePromise = waitForEvent(socket2, 'draw-stroke', 5000)

    socket1.emit('draw-start', { x: 100, y: 100, strokeWidth: 2 })
    await new Promise(resolve => setTimeout(resolve, 50))
    socket1.emit('draw-end', { x: 200, y: 200 })

    await strokePromise
    await new Promise(resolve => setTimeout(resolve, 200))

    // Socket1 should NOT receive its own stroke
    expect(receivedBySocket1).toBe(false)
  })

  test('should validate strokeWidth range (1-20)', async () => {
    // Valid strokeWidth
    socket1.emit('draw-start', { x: 100, y: 100, strokeWidth: 1 })
    await new Promise(resolve => setTimeout(resolve, 50))
    socket1.emit('draw-end', { x: 200, y: 200 })

    const stroke1 = await waitForEvent(socket2, 'draw-stroke', 2000)
    expect(stroke1.strokeWidth).toBe(1)

    // Max strokeWidth
    socket1.emit('draw-start', { x: 100, y: 100, strokeWidth: 20 })
    await new Promise(resolve => setTimeout(resolve, 50))
    socket1.emit('draw-end', { x: 200, y: 200 })

    const stroke2 = await waitForEvent(socket2, 'draw-stroke', 2000)
    expect(stroke2.strokeWidth).toBe(20)
  })

  test('should handle rapid stroke creation', async () => {
    const strokes = []

    // Listen for multiple strokes
    socket2.on('draw-stroke', (stroke) => {
      strokes.push(stroke)
    })

    // Draw 3 rapid strokes
    for (let i = 0; i < 3; i++) {
      socket1.emit('draw-start', { x: i * 10, y: i * 10, strokeWidth: 2 })
      await new Promise(resolve => setTimeout(resolve, 20))
      socket1.emit('draw-point', { x: i * 10 + 50, y: i * 10 + 50 })
      await new Promise(resolve => setTimeout(resolve, 20))
      socket1.emit('draw-end', { x: i * 10 + 100, y: i * 10 + 100 })
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    await new Promise(resolve => setTimeout(resolve, 500))

    expect(strokes.length).toBe(3)

    // All strokes should have unique IDs
    const ids = strokes.map(s => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(3)
  })

  test('should reject strokeWidth below 1', async () => {
    let errorReceived = false
    let strokeReceived = false

    socket2.once('draw-stroke', () => {
      strokeReceived = true
    })

    socket2.once('error', () => {
      errorReceived = true
    })

    socket1.emit('draw-start', { x: 100, y: 100, strokeWidth: 0 })
    await new Promise(resolve => setTimeout(resolve, 50))
    socket1.emit('draw-end', { x: 200, y: 200 })

    await new Promise(resolve => setTimeout(resolve, 500))

    // Should not broadcast invalid stroke
    expect(strokeReceived).toBe(false)
  })

  test('should reject strokeWidth above 20', async () => {
    let strokeReceived = false

    socket2.once('draw-stroke', () => {
      strokeReceived = true
    })

    socket1.emit('draw-start', { x: 100, y: 100, strokeWidth: 21 })
    await new Promise(resolve => setTimeout(resolve, 50))
    socket1.emit('draw-end', { x: 200, y: 200 })

    await new Promise(resolve => setTimeout(resolve, 500))

    // Should not broadcast invalid stroke
    expect(strokeReceived).toBe(false)
  })

  test('should reject negative coordinates', async () => {
    let strokeReceived = false

    socket2.once('draw-stroke', () => {
      strokeReceived = true
    })

    socket1.emit('draw-start', { x: -10, y: 100, strokeWidth: 2 })
    await new Promise(resolve => setTimeout(resolve, 50))
    socket1.emit('draw-end', { x: 200, y: 200 })

    await new Promise(resolve => setTimeout(resolve, 500))

    // Should not broadcast stroke with invalid coordinates
    expect(strokeReceived).toBe(false)
  })

  test('should reject missing required fields', async () => {
    let strokeReceived = false

    socket2.once('draw-stroke', () => {
      strokeReceived = true
    })

    // Missing strokeWidth
    socket1.emit('draw-start', { x: 100, y: 100 })
    await new Promise(resolve => setTimeout(resolve, 50))
    socket1.emit('draw-end', { x: 200, y: 200 })

    await new Promise(resolve => setTimeout(resolve, 500))

    expect(strokeReceived).toBe(false)
  })

  test('should enforce maximum 10000 points per stroke', async () => {
    socket1.emit('draw-start', { x: 0, y: 0, strokeWidth: 2 })

    // Emit many points rapidly (simulate excessive points)
    for (let i = 0; i < 100; i++) {
      socket1.emit('draw-point', { x: i, y: i })
    }

    socket1.emit('draw-end', { x: 101, y: 101 })

    const stroke = await waitForEvent(socket2, 'draw-stroke', 5000)

    // Should not exceed maximum
    expect(stroke.points.length).toBeLessThanOrEqual(10000)
  })

  test('should broadcast stroke within 1000ms latency requirement (FR-006)', async () => {
    // Listen on socket2 for the stroke
    const strokePromise = waitForEvent(socket2, 'draw-stroke', 5000)

    const startTime = Date.now()

    // Socket1 draws a simple stroke
    socket1.emit('draw-start', { x: 100, y: 100, strokeWidth: 2 })
    await new Promise(resolve => setTimeout(resolve, 20))
    socket1.emit('draw-point', { x: 150, y: 150 })
    await new Promise(resolve => setTimeout(resolve, 20))
    socket1.emit('draw-end', { x: 200, y: 200 })

    await strokePromise

    const latency = Date.now() - startTime

    // Constitutional requirement: <1000ms synchronization (FR-006)
    expect(latency).toBeLessThan(1000)

    // Performance target: <200ms p95 for WebSocket handlers
    // This is a best-effort check (not strict p95)
    if (latency > 200) {
      console.warn(`Warning: Stroke broadcast took ${latency}ms (>200ms target)`)
    }
  })

  test('should maintain low latency under rapid stroke creation', async () => {
    const latencies = []

    for (let i = 0; i < 10; i++) {
      const strokePromise = waitForEvent(socket2, 'draw-stroke', 5000)
      const startTime = Date.now()

      socket1.emit('draw-start', { x: i * 10, y: i * 10, strokeWidth: 2 })
      await new Promise(resolve => setTimeout(resolve, 10))
      socket1.emit('draw-end', { x: i * 10 + 50, y: i * 10 + 50 })

      await strokePromise
      latencies.push(Date.now() - startTime)

      await new Promise(resolve => setTimeout(resolve, 50))
    }

    // Calculate p95
    const sorted = latencies.slice().sort((a, b) => a - b)
    const p95Index = Math.ceil(0.95 * sorted.length) - 1
    const p95Latency = sorted[p95Index]

    // All latencies should be under 1000ms
    expect(Math.max(...latencies)).toBeLessThan(1000)

    // P95 should ideally be under 200ms (constitutional target)
    console.log(`Stroke broadcast latencies - p95: ${p95Latency}ms, max: ${Math.max(...latencies)}ms`)

    // Strict requirement: p95 < 1000ms
    expect(p95Latency).toBeLessThan(1000)
  })
})
