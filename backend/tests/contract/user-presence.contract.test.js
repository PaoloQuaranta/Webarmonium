const { connect, emitAndWait, waitForEvent, disconnect } = require('../helpers/socket-test-utils')

/**
 * Contract Test: user-joined and user-left events
 * Validates user presence notification schema and behavior
 */

describe('Contract: user presence events', () => {
  let socket1, socket2

  afterEach(async () => {
    if (socket1) await disconnect(socket1)
    if (socket2) await disconnect(socket2)
  })

  test('should broadcast user-joined when user joins room', async () => {
    socket1 = await connect()
    await emitAndWait(socket1, 'join-room', { roomId: 'presence-test-room' }, 'room-joined')

    socket2 = await connect()

    // Socket1 should receive user-joined event
    const joinedPromise = waitForEvent(socket1, 'user-joined', 2000)

    await emitAndWait(socket2, 'join-room', { roomId: 'presence-test-room' }, 'room-joined')

    const joinedEvent = await joinedPromise

    // Validate user-joined schema
    expect(joinedEvent).toHaveProperty('userId')
    expect(joinedEvent).toHaveProperty('color')

    // Validate userId format (UUID)
    expect(joinedEvent.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

    // Validate color format (hex)
    expect(joinedEvent.color).toMatch(/^#[0-9a-f]{6}$/i)
  })

  test('should broadcast user-left when user disconnects', async () => {
    socket1 = await connect()
    socket2 = await connect()

    const response1 = await emitAndWait(socket1, 'join-room', { roomId: 'presence-test-room-2' }, 'room-joined')
    await emitAndWait(socket2, 'join-room', { roomId: 'presence-test-room-2' }, 'room-joined')

    // Socket2 should receive user-left event
    const leftPromise = waitForEvent(socket2, 'user-left', 2000)

    await disconnect(socket1)
    socket1 = null

    const leftEvent = await leftPromise

    // Validate user-left schema
    expect(leftEvent).toHaveProperty('userId')

    // Validate userId matches the disconnected user
    expect(leftEvent.userId).toBe(response1.userId)
  })

  test('should not send user-joined to joining user', async () => {
    socket1 = await connect()
    await emitAndWait(socket1, 'join-room', { roomId: 'presence-test-room-3' }, 'room-joined')

    socket2 = await connect()

    let receivedJoinedEvent = false
    socket2.once('user-joined', () => {
      receivedJoinedEvent = true
    })

    await emitAndWait(socket2, 'join-room', { roomId: 'presence-test-room-3' }, 'room-joined')

    await new Promise(resolve => setTimeout(resolve, 300))

    // Socket2 should NOT receive its own user-joined event
    expect(receivedJoinedEvent).toBe(false)
  })

  test('should broadcast user-joined to all existing room members', async () => {
    const socket3 = await connect()

    socket1 = await connect()
    socket2 = await connect()

    await emitAndWait(socket1, 'join-room', { roomId: 'presence-test-room-4' }, 'room-joined')
    await emitAndWait(socket2, 'join-room', { roomId: 'presence-test-room-4' }, 'room-joined')

    // Both socket1 and socket2 should receive user-joined
    const joined1Promise = waitForEvent(socket1, 'user-joined', 2000)
    const joined2Promise = waitForEvent(socket2, 'user-joined', 2000)

    const response3 = await emitAndWait(socket3, 'join-room', { roomId: 'presence-test-room-4' }, 'room-joined')

    const [joined1, joined2] = await Promise.all([joined1Promise, joined2Promise])

    expect(joined1.userId).toBe(response3.userId)
    expect(joined2.userId).toBe(response3.userId)
    expect(joined1.color).toBe(response3.assignedColor)
    expect(joined2.color).toBe(response3.assignedColor)

    await disconnect(socket3)
  })

  test('should broadcast user-left to all remaining room members', async () => {
    const socket3 = await connect()

    socket1 = await connect()
    socket2 = await connect()

    await emitAndWait(socket1, 'join-room', { roomId: 'presence-test-room-5' }, 'room-joined')
    await emitAndWait(socket2, 'join-room', { roomId: 'presence-test-room-5' }, 'room-joined')
    const response3 = await emitAndWait(socket3, 'join-room', { roomId: 'presence-test-room-5' }, 'room-joined')

    // Both socket1 and socket2 should receive user-left
    const left1Promise = waitForEvent(socket1, 'user-left', 2000)
    const left2Promise = waitForEvent(socket2, 'user-left', 2000)

    await disconnect(socket3)

    const [left1, left2] = await Promise.all([left1Promise, left2Promise])

    expect(left1.userId).toBe(response3.userId)
    expect(left2.userId).toBe(response3.userId)
  })

  test('should handle rapid join/leave cycles', async () => {
    socket1 = await connect()
    await emitAndWait(socket1, 'join-room', { roomId: 'presence-test-room-6' }, 'room-joined')

    const joinEvents = []
    const leaveEvents = []

    socket1.on('user-joined', (event) => joinEvents.push(event))
    socket1.on('user-left', (event) => leaveEvents.push(event))

    // Rapid join/leave cycles
    for (let i = 0; i < 3; i++) {
      const tempSocket = await connect()
      await emitAndWait(tempSocket, 'join-room', { roomId: 'presence-test-room-6' }, 'room-joined')
      await new Promise(resolve => setTimeout(resolve, 100))
      await disconnect(tempSocket)
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    await new Promise(resolve => setTimeout(resolve, 500))

    expect(joinEvents.length).toBe(3)
    expect(leaveEvents.length).toBe(3)

    // Each join should have unique userId
    const userIds = joinEvents.map(e => e.userId)
    const uniqueIds = new Set(userIds)
    expect(uniqueIds.size).toBe(3)
  })

  test('should assign different colors to users joining sequentially', async () => {
    socket1 = await connect()
    socket2 = await connect()

    const response1 = await emitAndWait(socket1, 'join-room', { roomId: 'color-test-room' }, 'room-joined')

    const joinedPromise = waitForEvent(socket1, 'user-joined', 2000)
    const response2 = await emitAndWait(socket2, 'join-room', { roomId: 'color-test-room' }, 'room-joined')
    const joinedEvent = await joinedPromise

    // Colors should be different
    expect(response1.assignedColor).not.toBe(response2.assignedColor)
    expect(joinedEvent.color).toBe(response2.assignedColor)
  })

  test('should not send user-left to user who is leaving', async () => {
    socket1 = await connect()
    socket2 = await connect()

    await emitAndWait(socket1, 'join-room', { roomId: 'presence-test-room-7' }, 'room-joined')
    await emitAndWait(socket2, 'join-room', { roomId: 'presence-test-room-7' }, 'room-joined')

    let receivedLeftEvent = false
    socket1.once('user-left', () => {
      receivedLeftEvent = true
    })

    await disconnect(socket1)
    socket1 = null

    await new Promise(resolve => setTimeout(resolve, 300))

    // Socket1 should NOT receive its own user-left event
    expect(receivedLeftEvent).toBe(false)
  })
})
