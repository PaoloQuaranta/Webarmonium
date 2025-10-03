const { connect, emitAndWait, waitForEvent, disconnect, disconnectAll } = require('../helpers/socket-test-utils')

/**
 * Contract Test: room-full error
 * Validates room capacity enforcement (max 10 users)
 */

describe('Contract: room capacity enforcement', () => {
  let sockets = []

  afterEach(async () => {
    await disconnectAll(sockets)
    sockets = []
  })

  test('should emit room-full error when 11th user tries to join', async () => {
    const roomId = 'capacity-test-room'

    // Connect 10 users successfully
    for (let i = 0; i < 10; i++) {
      const socket = await connect()
      sockets.push(socket)

      const response = await emitAndWait(socket, 'join-room', { roomId }, 'room-joined')
      expect(response.userId).toBeDefined()
      expect(response.assignedColor).toBeDefined()
    }

    // 11th user should be rejected
    const socket11 = await connect()
    sockets.push(socket11)

    const errorResponse = await emitAndWait(
      socket11,
      'join-room',
      { roomId },
      'room-full',
      5000
    )

    // Validate error schema
    expect(errorResponse).toHaveProperty('error')
    expect(errorResponse.error).toBe('Room is full (max 10 users)')
  })

  test('should allow 11th user to join after one user leaves', async () => {
    const roomId = 'capacity-test-room-2'

    // Connect 10 users
    for (let i = 0; i < 10; i++) {
      const socket = await connect()
      sockets.push(socket)
      await emitAndWait(socket, 'join-room', { roomId }, 'room-joined')
    }

    // Disconnect first user
    await disconnect(sockets[0])
    sockets.shift()

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 200))

    // 11th user should now be able to join
    const socket11 = await connect()
    sockets.push(socket11)

    const response = await emitAndWait(socket11, 'join-room', { roomId }, 'room-joined')

    expect(response.userId).toBeDefined()
    expect(response.assignedColor).toBeDefined()
    expect(response.users.length).toBe(10) // Back to 10 users
  })

  test('should enforce capacity per room independently', async () => {
    // Fill room A with 10 users
    for (let i = 0; i < 10; i++) {
      const socket = await connect()
      sockets.push(socket)
      await emitAndWait(socket, 'join-room', { roomId: 'room-A' }, 'room-joined')
    }

    // User should still be able to join room B
    const socketB = await connect()
    sockets.push(socketB)

    const response = await emitAndWait(socketB, 'join-room', { roomId: 'room-B' }, 'room-joined')

    expect(response.userId).toBeDefined()
    expect(response.users.length).toBe(1)
  })

  test('should return correct user count in room-joined response', async () => {
    const roomId = 'count-test-room'

    for (let i = 1; i <= 5; i++) {
      const socket = await connect()
      sockets.push(socket)

      const response = await emitAndWait(socket, 'join-room', { roomId }, 'room-joined')

      expect(response.users.length).toBe(i)
    }
  })
})
