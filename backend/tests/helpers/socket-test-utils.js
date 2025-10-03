const { io } = require('socket.io-client')

/**
 * Socket.IO Test Utilities
 * Helper functions for contract and integration testing
 */

/**
 * Connect a test client to the Socket.IO server
 * @param {string} serverUrl - Server URL (e.g., 'http://localhost:3001')
 * @param {object} options - Socket.IO client options
 * @returns {Promise<Socket>} - Connected socket instance
 */
function connect (serverUrl = 'http://localhost:3001', options = {}) {
  return new Promise((resolve, reject) => {
    const socket = io(serverUrl, {
      transports: ['websocket'],
      forceNew: true,
      ...options
    })

    socket.on('connect', () => {
      resolve(socket)
    })

    socket.on('connect_error', (error) => {
      reject(error)
    })

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!socket.connected) {
        socket.close()
        reject(new Error('Connection timeout'))
      }
    }, 5000)
  })
}

/**
 * Emit an event and wait for a response event
 * @param {Socket} socket - Socket.IO client instance
 * @param {string} emitEvent - Event name to emit
 * @param {object} emitData - Data to emit
 * @param {string} waitEvent - Event name to wait for
 * @param {number} timeout - Timeout in milliseconds (default: 5000)
 * @returns {Promise<any>} - Response data
 */
function emitAndWait (socket, emitEvent, emitData, waitEvent, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(waitEvent, responseHandler)
      reject(new Error(`Timeout waiting for ${waitEvent}`))
    }, timeout)

    const responseHandler = (data) => {
      clearTimeout(timer)
      resolve(data)
    }

    socket.once(waitEvent, responseHandler)
    socket.emit(emitEvent, emitData)
  })
}

/**
 * Wait for a specific event
 * @param {Socket} socket - Socket.IO client instance
 * @param {string} eventName - Event name to wait for
 * @param {number} timeout - Timeout in milliseconds (default: 5000)
 * @returns {Promise<any>} - Event data
 */
function waitForEvent (socket, eventName, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, eventHandler)
      reject(new Error(`Timeout waiting for ${eventName}`))
    }, timeout)

    const eventHandler = (data) => {
      clearTimeout(timer)
      resolve(data)
    }

    socket.once(eventName, eventHandler)
  })
}

/**
 * Disconnect a socket client
 * @param {Socket} socket - Socket.IO client instance
 * @returns {Promise<void>}
 */
function disconnect (socket) {
  return new Promise((resolve) => {
    if (socket.connected) {
      socket.on('disconnect', () => {
        resolve()
      })
      socket.disconnect()
    } else {
      resolve()
    }
  })
}

/**
 * Disconnect multiple sockets
 * @param {Socket[]} sockets - Array of socket instances
 * @returns {Promise<void>}
 */
async function disconnectAll (sockets) {
  await Promise.all(sockets.map(socket => disconnect(socket)))
}

/**
 * Helper to measure latency between emit and receive
 * @param {Socket} socket - Socket.IO client instance
 * @param {string} emitEvent - Event name to emit
 * @param {object} emitData - Data to emit
 * @param {string} waitEvent - Event name to wait for
 * @returns {Promise<{data: any, latency: number}>} - Response data and latency in ms
 */
async function measureLatency (socket, emitEvent, emitData, waitEvent) {
  const startTime = Date.now()
  const data = await emitAndWait(socket, emitEvent, emitData, waitEvent)
  const latency = Date.now() - startTime
  return { data, latency }
}

module.exports = {
  connect,
  emitAndWait,
  waitForEvent,
  disconnect,
  disconnectAll,
  measureLatency
}
