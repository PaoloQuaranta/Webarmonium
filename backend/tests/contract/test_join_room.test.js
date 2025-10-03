const { createServer } = require('http')
const { Server } = require('socket.io')
const Client = require('socket.io-client')

describe('Socket.io Contract: join-room event', () => {
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

  describe('join-room request validation', () => {
    test('should accept valid join-room request with null roomId', (done) => {
      const payload = {
        roomId: null,
        deviceType: 'desktop'
      }

      serverSocket.on('join-room', (data) => {
        expect(data).toEqual(payload)
        expect(data.roomId).toBeNull()
        expect(data.deviceType).toBe('desktop')
        done()
      })

      clientSocket.emit('join-room', payload)
    })

    test('should accept valid join-room request with specific roomId', (done) => {
      const payload = {
        roomId: 'room-001',
        deviceType: 'mobile'
      }

      serverSocket.on('join-room', (data) => {
        expect(data).toEqual(payload)
        expect(data.roomId).toBe('room-001')
        expect(data.deviceType).toBe('mobile')
        done()
      })

      clientSocket.emit('join-room', payload)
    })

    test('should validate deviceType enum values', (done) => {
      const validDeviceTypes = ['desktop', 'mobile']

      validDeviceTypes.forEach((deviceType) => {
        const payload = { roomId: null, deviceType }

        serverSocket.on('join-room', (data) => {
          expect(['desktop', 'mobile']).toContain(data.deviceType)
          if (deviceType === 'mobile') done()
        })

        clientSocket.emit('join-room', payload)
      })
    })
  })

  describe('join-room response contract', () => {
    test('should expect room-joined response on success', (done) => {
      clientSocket.on('room-joined', (response) => {
        expect(response).toHaveProperty('roomId')
        expect(response).toHaveProperty('userId')
        expect(response).toHaveProperty('userCount')
        expect(response).toHaveProperty('memoryInfluence')

        expect(typeof response.roomId).toBe('string')
        expect(typeof response.userId).toBe('string')
        expect(typeof response.userCount).toBe('number')
        expect(typeof response.memoryInfluence).toBe('object')

        done()
      })

      // This should fail until implementation exists
      clientSocket.emit('join-room', { roomId: null, deviceType: 'desktop' })
    })

    test('should expect room-error response on failure', (done) => {
      clientSocket.on('room-error', (error) => {
        expect(error).toHaveProperty('error')
        expect(error).toHaveProperty('message')

        expect(typeof error.error).toBe('string')
        expect(typeof error.message).toBe('string')
        expect(['ROOM_FULL', 'ROOM_NOT_FOUND', 'INVALID_REQUEST']).toContain(error.error)

        done()
      })

      // This should trigger error handling
      clientSocket.emit('join-room', { roomId: 'invalid-room', deviceType: 'invalid' })
    })
  })

  describe('room capacity validation', () => {
    test('should enforce 10 user limit per room', () => {
      // This test will fail until RoomManager is implemented
      // Expected behavior: room with 10 users should reject 11th user
      expect(true).toBe(false) // Intentional failure for TDD
    })
  })
})