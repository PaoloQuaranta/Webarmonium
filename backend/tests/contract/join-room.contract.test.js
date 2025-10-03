const { connect, emitAndWait, disconnect } = require('../helpers/socket-test-utils')

/**
 * Contract Test: join-room event
 * Validates room-joined response schema and behavior
 */

describe('Contract: join-room event', () => {
  let socket

  afterEach(async () => {
    if (socket) {
      await disconnect(socket)
    }
  })

  test('should emit room-joined with valid schema when user joins room', async () => {
    socket = await connect()

    const response = await emitAndWait(
      socket,
      'join-room',
      { roomId: 'test-room-001' },
      'room-joined',
      5000
    )

    // Validate response schema
    expect(response).toHaveProperty('userId')
    expect(response).toHaveProperty('assignedColor')
    expect(response).toHaveProperty('users')

    // Validate userId format (UUID)
    expect(response.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

    // Validate assignedColor format (hex color - lowercase only per spec)
    expect(response.assignedColor).toMatch(/^#[0-9a-f]{6}$/)

    // Validate users array
    expect(Array.isArray(response.users)).toBe(true)
    expect(response.users.length).toBeGreaterThan(0)
    expect(response.users.length).toBeLessThanOrEqual(10)

    // Validate user object schema
    response.users.forEach(user => {
      expect(user).toHaveProperty('id')
      expect(user).toHaveProperty('color')
      expect(user.color).toMatch(/^#[0-9a-f]{6}$/)
    })

    // Validate current user is in users array
    const currentUser = response.users.find(u => u.id === response.userId)
    expect(currentUser).toBeDefined()
    expect(currentUser.color).toBe(response.assignedColor)
  })

  test('should assign unique colors to multiple users', async () => {
    const socket1 = await connect()
    const socket2 = await connect()
    const socket3 = await connect()

    try {
      const response1 = await emitAndWait(socket1, 'join-room', { roomId: 'test-room-002' }, 'room-joined')
      const response2 = await emitAndWait(socket2, 'join-room', { roomId: 'test-room-002' }, 'room-joined')
      const response3 = await emitAndWait(socket3, 'join-room', { roomId: 'test-room-002' }, 'room-joined')

      // All users should have different colors
      expect(response1.assignedColor).not.toBe(response2.assignedColor)
      expect(response1.assignedColor).not.toBe(response3.assignedColor)
      expect(response2.assignedColor).not.toBe(response3.assignedColor)

      // All users should see 3 users in the room
      expect(response3.users.length).toBe(3)
    } finally {
      await disconnect(socket1)
      await disconnect(socket2)
      await disconnect(socket3)
    }
  })

  test('should allow user to join different rooms', async () => {
    const socket1 = await connect()
    const socket2 = await connect()

    try {
      const response1 = await emitAndWait(socket1, 'join-room', { roomId: 'room-A' }, 'room-joined')
      const response2 = await emitAndWait(socket2, 'join-room', { roomId: 'room-B' }, 'room-joined')

      // Both should succeed
      expect(response1.userId).toBeDefined()
      expect(response2.userId).toBeDefined()

      // Each room should have only 1 user
      expect(response1.users.length).toBe(1)
      expect(response2.users.length).toBe(1)
    } finally {
      await disconnect(socket1)
      await disconnect(socket2)
    }
  })

  test('should handle room join with existing users', async () => {
    const socket1 = await connect()
    const socket2 = await connect()

    try {
      const response1 = await emitAndWait(socket1, 'join-room', { roomId: 'test-room-003' }, 'room-joined')

      // Wait a bit for room state to stabilize
      await new Promise(resolve => setTimeout(resolve, 100))

      const response2 = await emitAndWait(socket2, 'join-room', { roomId: 'test-room-003' }, 'room-joined')

      // Second user should see first user in room
      expect(response2.users.length).toBe(2)

      const firstUser = response2.users.find(u => u.id === response1.userId)
      expect(firstUser).toBeDefined()
      expect(firstUser.color).toBe(response1.assignedColor)
    } finally {
      await disconnect(socket1)
      await disconnect(socket2)
    }
  })
})
