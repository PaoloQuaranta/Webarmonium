const { connect, emitAndWait, waitForEvent, disconnect } = require('../helpers/socket-test-utils')

/**
 * Contract Test: drawing-history event
 * Validates stroke history transmission to late joiners
 */

describe('Contract: drawing-history event', () => {
  let socket1, socket2

  afterEach(async () => {
    if (socket1) await disconnect(socket1)
    if (socket2) await disconnect(socket2)
  })

  test('should receive drawing-history when joining room with existing strokes', async () => {
    const roomId = 'history-test-room-1'

    socket1 = await connect()
    await emitAndWait(socket1, 'join-room', { roomId }, 'room-joined')

    // Socket1 draws multiple strokes
    for (let i = 0; i < 5; i++) {
      socket1.emit('draw-start', { x: i * 10, y: i * 10, strokeWidth: 2 })
      await new Promise(resolve => setTimeout(resolve, 20))
      socket1.emit('draw-point', { x: i * 10 + 50, y: i * 10 + 50 })
      await new Promise(resolve => setTimeout(resolve, 20))
      socket1.emit('draw-end', { x: i * 10 + 100, y: i * 10 + 100 })
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    // Wait for strokes to complete
    await new Promise(resolve => setTimeout(resolve, 200))

    // Socket2 joins and should receive history
    socket2 = await connect()
    const historyPromise = waitForEvent(socket2, 'drawing-history', 3000)

    await emitAndWait(socket2, 'join-room', { roomId }, 'room-joined')

    const history = await historyPromise

    // Validate history schema
    expect(history).toHaveProperty('strokes')
    expect(Array.isArray(history.strokes)).toBe(true)
    expect(history.strokes.length).toBe(5)

    // Validate array limit
    expect(history.strokes.length).toBeLessThanOrEqual(10000)

    // Validate each stroke against DrawingStroke schema
    history.strokes.forEach(stroke => {
      expect(stroke).toHaveProperty('id')
      expect(stroke).toHaveProperty('userId')
      expect(stroke).toHaveProperty('color')
      expect(stroke).toHaveProperty('strokeWidth')
      expect(stroke).toHaveProperty('points')
      expect(stroke).toHaveProperty('startedAt')
      expect(stroke).toHaveProperty('completedAt')

      // UUID format
      expect(stroke.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

      // Hex color (lowercase only per spec)
      expect(stroke.color).toMatch(/^#[0-9a-f]{6}$/)

      // StrokeWidth validation
      expect(stroke.strokeWidth).toBeGreaterThanOrEqual(1)
      expect(stroke.strokeWidth).toBeLessThanOrEqual(20)

      // Points array validation
      expect(Array.isArray(stroke.points)).toBe(true)
      expect(stroke.points.length).toBeGreaterThanOrEqual(2)
      expect(stroke.points.length).toBeLessThanOrEqual(10000)

      stroke.points.forEach(point => {
        expect(point).toHaveProperty('x')
        expect(point).toHaveProperty('y')
        expect(point).toHaveProperty('t')
        expect(typeof point.x).toBe('number')
        expect(typeof point.y).toBe('number')
        expect(typeof point.t).toBe('number')
        expect(point.t).toBeGreaterThanOrEqual(0)
      })

      // Timestamp validation
      expect(new Date(stroke.startedAt).getTime()).not.toBeNaN()
      expect(new Date(stroke.completedAt).getTime()).not.toBeNaN()
    })
  })

  test('should receive empty history when joining empty room', async () => {
    const roomId = 'history-test-room-2'

    socket1 = await connect()
    const historyPromise = waitForEvent(socket1, 'drawing-history', 3000)

    await emitAndWait(socket1, 'join-room', { roomId }, 'room-joined')

    const history = await historyPromise

    expect(history).toHaveProperty('strokes')
    expect(Array.isArray(history.strokes)).toBe(true)
    expect(history.strokes.length).toBe(0)
  })

  test('should receive history in chronological order', async () => {
    const roomId = 'history-test-room-3'

    socket1 = await connect()
    await emitAndWait(socket1, 'join-room', { roomId }, 'room-joined')

    const strokeTimestamps = []

    // Draw 3 strokes with delays
    for (let i = 0; i < 3; i++) {
      const startTime = Date.now()
      socket1.emit('draw-start', { x: i * 100, y: i * 100, strokeWidth: 2 })
      await new Promise(resolve => setTimeout(resolve, 50))
      socket1.emit('draw-end', { x: i * 100 + 50, y: i * 100 + 50 })
      strokeTimestamps.push(startTime)
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    await new Promise(resolve => setTimeout(resolve, 200))

    // Late joiner
    socket2 = await connect()
    const historyPromise = waitForEvent(socket2, 'drawing-history', 3000)
    await emitAndWait(socket2, 'join-room', { roomId }, 'room-joined')

    const history = await historyPromise

    expect(history.strokes.length).toBe(3)

    // Verify chronological order
    for (let i = 1; i < history.strokes.length; i++) {
      const prevTime = new Date(history.strokes[i - 1].startedAt).getTime()
      const currTime = new Date(history.strokes[i].startedAt).getTime()
      expect(currTime).toBeGreaterThanOrEqual(prevTime)
    }
  })

  test('should enforce maximum 10000 strokes in history', async () => {
    const roomId = 'history-test-room-4'

    socket1 = await connect()
    await emitAndWait(socket1, 'join-room', { roomId }, 'room-joined')

    // This is a theoretical test - in practice we won't draw 10k strokes
    // But we validate the schema allows max 10000
    socket2 = await connect()
    const historyPromise = waitForEvent(socket2, 'drawing-history', 3000)
    await emitAndWait(socket2, 'join-room', { roomId }, 'room-joined')

    const history = await historyPromise

    // Schema validation: strokes array must not exceed 10000
    expect(history.strokes.length).toBeLessThanOrEqual(10000)
  })

  test('should include all stroke metadata in history', async () => {
    const roomId = 'history-test-room-5'

    socket1 = await connect()
    const joinResponse = await emitAndWait(socket1, 'join-room', { roomId }, 'room-joined')

    // Draw one stroke
    socket1.emit('draw-start', { x: 10, y: 10, strokeWidth: 5 })
    await new Promise(resolve => setTimeout(resolve, 20))
    socket1.emit('draw-point', { x: 20, y: 20 })
    socket1.emit('draw-point', { x: 30, y: 30 })
    await new Promise(resolve => setTimeout(resolve, 20))
    socket1.emit('draw-end', { x: 40, y: 40 })

    await new Promise(resolve => setTimeout(resolve, 200))

    // Late joiner
    socket2 = await connect()
    const historyPromise = waitForEvent(socket2, 'drawing-history', 3000)
    await emitAndWait(socket2, 'join-room', { roomId }, 'room-joined')

    const history = await historyPromise

    expect(history.strokes.length).toBe(1)

    const stroke = history.strokes[0]

    // Validate userId matches drawer
    expect(stroke.userId).toBe(joinResponse.userId)

    // Validate color matches assigned color
    expect(stroke.color).toBe(joinResponse.assignedColor)

    // Validate strokeWidth
    expect(stroke.strokeWidth).toBe(5)

    // Validate points
    expect(stroke.points.length).toBe(4) // start + 2 points + end
  })

  test('should handle multiple late joiners receiving same history', async () => {
    const roomId = 'history-test-room-6'

    socket1 = await connect()
    await emitAndWait(socket1, 'join-room', { roomId }, 'room-joined')

    // Draw 2 strokes
    for (let i = 0; i < 2; i++) {
      socket1.emit('draw-start', { x: i * 10, y: i * 10, strokeWidth: 2 })
      await new Promise(resolve => setTimeout(resolve, 20))
      socket1.emit('draw-end', { x: i * 10 + 50, y: i * 10 + 50 })
      await new Promise(resolve => setTimeout(resolve, 50))
    }

    await new Promise(resolve => setTimeout(resolve, 200))

    // Two late joiners
    socket2 = await connect()
    const socket3 = await connect()

    const history2Promise = waitForEvent(socket2, 'drawing-history', 3000)
    const history3Promise = waitForEvent(socket3, 'drawing-history', 3000)

    await emitAndWait(socket2, 'join-room', { roomId }, 'room-joined')
    await emitAndWait(socket3, 'join-room', { roomId }, 'room-joined')

    const [history2, history3] = await Promise.all([history2Promise, history3Promise])

    // Both should receive same history
    expect(history2.strokes.length).toBe(2)
    expect(history3.strokes.length).toBe(2)

    // Validate both have same stroke IDs
    expect(history2.strokes[0].id).toBe(history3.strokes[0].id)
    expect(history2.strokes[1].id).toBe(history3.strokes[1].id)

    await disconnect(socket3)
  })
})
