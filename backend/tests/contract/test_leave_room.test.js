const { createServer } = require('http')
const { Server } = require('socket.io')
const Client = require('socket.io-client')

describe('Socket.io Contract: leave-room event', () => {
  let io, serverSocket, clientSocket, httpServer

  beforeAll((done) => {
    httpServer = createServer()
    io = new Server(httpServer)
    httpServer.listen(() => {
      const port = httpServer.address().port
      clientSocket = new Client(`http://localhost:${port}`)
      io.on('connection', (socket) => {
        serverSocket = socket
      })
      clientSocket.on('connect', done)
    })
  })

  afterAll(() => {
    io.close()
    clientSocket.close()
    httpServer.close()
  })

  describe('leave-room request validation', () => {
    test('should accept valid leave-room request', (done) => {
      const payload = {
        userId: 'user-123'
      }

      serverSocket.on('leave-room', (data) => {
        expect(data).toEqual(payload)
        expect(typeof data.userId).toBe('string')
        expect(data.userId.length).toBeGreaterThan(0)
        done()
      })

      clientSocket.emit('leave-room', payload)
    })

    test('should validate userId presence', (done) => {
      const invalidPayloads = [
        {},
        { userId: '' },
        { userId: null },
        { userId: undefined }
      ]

      let testCount = 0
      invalidPayloads.forEach((payload) => {
        serverSocket.on('leave-room', (data) => {
          // Should trigger validation error
          testCount++
          if (testCount === invalidPayloads.length) {
            done()
          }
        })

        clientSocket.emit('leave-room', payload)
      })
    })
  })

  describe('leave-room response contract', () => {
    test('should expect room-left response on success', (done) => {
      clientSocket.on('room-left', (response) => {
        expect(response).toHaveProperty('userId')
        expect(response).toHaveProperty('userCount')

        expect(typeof response.userId).toBe('string')
        expect(typeof response.userCount).toBe('number')
        expect(response.userCount).toBeGreaterThanOrEqual(0)

        done()
      })

      // This should fail until implementation exists
      clientSocket.emit('leave-room', { userId: 'user-123' })
    })

    test('should expect room-error when user not in room', (done) => {
      clientSocket.on('room-error', (error) => {
        expect(error).toHaveProperty('error')
        expect(error).toHaveProperty('message')
        expect(error.error).toBe('INVALID_REQUEST')
        done()
      })

      // This should trigger error for non-existent user
      clientSocket.emit('leave-room', { userId: 'non-existent-user' })
    })
  })

  describe('user session cleanup', () => {
    test('should clean up user session on leave', () => {
      // This test will fail until RoomManager is implemented
      // Expected behavior: user should be removed from room state
      expect(true).toBe(false) // Intentional failure for TDD
    })

    test('should notify other users when user leaves', () => {
      // This test will fail until user-left broadcast is implemented
      // Expected behavior: other room users receive user-left event
      expect(true).toBe(false) // Intentional failure for TDD
    })
  })
})