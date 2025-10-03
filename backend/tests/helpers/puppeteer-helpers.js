/**
 * Puppeteer Test Helpers
 * Utilities for multi-browser integration testing
 */

const puppeteer = require('puppeteer')

/**
 * Launch multiple Puppeteer browser instances
 * @param {number} count - Number of browsers to launch
 * @param {Object} [options={}] - Puppeteer launch options
 * @param {boolean} [options.headless] - Run in headless mode
 * @param {string[]} [options.args] - Additional Chrome args
 * @returns {Promise<Array<{browser: Browser, page: Page, id: number}>>} Array of browser instances with pages
 */
async function launchBrowsers (count, options = {}) {
  const defaultOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
  }

  const browsers = []

  for (let i = 0; i < count; i++) {
    const browser = await puppeteer.launch({ ...defaultOptions, ...options })
    const page = await browser.newPage()

    // Enable console logging from page
    page.on('console', msg => {
      const text = msg.text()
      if (!text.includes('A cookie') && !text.includes('Tone.js')) {
        console.log(`[Browser ${i + 1}]`, text)
      }
    })

    // Enable error logging
    page.on('pageerror', error => {
      console.error(`[Browser ${i + 1} Error]`, error.message)
    })

    browsers.push({ browser, page, id: i + 1 })
  }

  return browsers
}

/**
 * Close all browser instances
 * @param {Array} browsers - Array of browser instances
 */
async function closeBrowsers (browsers) {
  for (const { browser } of browsers) {
    await browser.close()
  }
}

/**
 * Navigate to app and wait for it to load
 * @param {Object} browserInstance - Browser instance from launchBrowsers
 * @param {string} url - URL to navigate to (default: http://localhost:3000)
 */
async function loadApp (browserInstance, url = 'http://localhost:3000') {
  const { page } = browserInstance
  await page.goto(url, { waitUntil: 'networkidle0' })

  // Wait for app to be loaded
  await page.waitForSelector('#gestureCanvas', { timeout: 5000 })
  await page.waitForFunction(() => window.webarmoniumApp !== undefined, { timeout: 5000 })
}

/**
 * Join a room
 * @param {Object} browserInstance - Browser instance
 * @param {string} roomId - Room ID to join
 * @returns {Promise<Object>} Room joined response
 */
async function joinRoom (browserInstance, roomId) {
  const { page } = browserInstance

  // Wait for socket connection
  await page.waitForFunction(
    () => window.webarmoniumApp && window.webarmoniumApp.socketService && window.webarmoniumApp.socketService.socket.connected,
    { timeout: 5000 }
  )

  // Get room-joined event
  const roomJoinedPromise = page.evaluate(() => {
    return new Promise(resolve => {
      window.webarmoniumApp.socketService.socket.once('room-joined', data => resolve(data))
    })
  })

  // Room is already joined automatically in main.js (joins 'main-room')
  // For tests, we can switch rooms if needed
  const roomData = await roomJoinedPromise
  return roomData
}

/**
 * Get user's assigned color
 * @param {Object} browserInstance - Browser instance
 * @returns {Promise<string>} Assigned color (hex)
 */
async function getAssignedColor (browserInstance) {
  const { page } = browserInstance
  return await page.evaluate(() => {
    return window.webarmoniumApp.currentRoom?.users?.find(u => u.userId === window.webarmoniumApp.socketService.socket.id)?.assignedColor
  })
}

/**
 * Get user ID
 * @param {Object} browserInstance - Browser instance
 * @returns {Promise<string>} User ID (socket ID)
 */
async function getUserId (browserInstance) {
  const { page } = browserInstance
  return await page.evaluate(() => {
    return window.webarmoniumApp.socketService.socket.id
  })
}

/**
 * Draw a stroke on the canvas
 * @param {{browser: Browser, page: Page, id: number}} browserInstance - Browser instance
 * @param {Array<{x: number, y: number}>} points - Array of {x, y} points (normalized 0-1)
 * @param {Object} [options={}] - Drawing options
 * @param {number} [options.strokeWidth=2] - Stroke width (1-20)
 * @param {number} [options.duration=500] - Duration in ms
 * @returns {Promise<string>} Stroke ID
 */
async function drawStroke (browserInstance, points, options = {}) {
  const { page } = browserInstance
  const { strokeWidth = 2, duration = 500 } = options

  const strokeId = await page.evaluate(async (points, strokeWidth, duration) => {
    const canvas = document.getElementById('gestureCanvas')
    const rect = canvas.getBoundingClientRect()
    const socketService = window.webarmoniumApp.socketService

    // Generate stroke ID
    const strokeId = `stroke-${Date.now()}-${Math.random()}`

    // Emit draw-start
    socketService.socket.emit('draw-start', {
      strokeId,
      x: points[0].x,
      y: points[0].y,
      strokeWidth,
      timestamp: Date.now()
    })

    // Emit draw-point for each point
    const pointDelay = duration / points.length
    for (let i = 0; i < points.length; i++) {
      await new Promise(resolve => setTimeout(resolve, pointDelay))
      socketService.socket.emit('draw-point', {
        strokeId,
        x: points[i].x,
        y: points[i].y,
        timestamp: Date.now()
      })
    }

    // Emit draw-end
    socketService.socket.emit('draw-end', {
      strokeId,
      timestamp: Date.now()
    })

    return strokeId
  }, points, strokeWidth, duration)

  return strokeId
}

/**
 * Draw a circle
 * @param {{browser: Browser, page: Page, id: number}} browserInstance - Browser instance
 * @param {{x: number, y: number, radius: number}} options - Circle parameters (pixels, will be normalized)
 * @returns {Promise<string>} Stroke ID
 */
async function drawCircle (browserInstance, options) {
  const { page } = browserInstance
  const { x, y, radius } = options

  // Generate circle points
  const points = []
  const numPoints = 60
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2
    const px = x + Math.cos(angle) * radius
    const py = y + Math.sin(angle) * radius

    // Normalize to 0-1 range (assuming 800x600 canvas)
    points.push({
      x: px / 800,
      y: py / 600
    })
  }

  return await drawStroke(browserInstance, points, { strokeWidth: 2, duration: 1000 })
}

/**
 * Wait for a draw-stroke event
 * @param {Object} browserInstance - Browser instance
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object>} Stroke data
 */
async function waitForStroke (browserInstance, timeout = 2000) {
  const { page } = browserInstance

  return await page.evaluate((timeout) => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Timeout waiting for stroke')), timeout)

      window.webarmoniumApp.socketService.socket.once('draw-stroke', (stroke) => {
        clearTimeout(timeoutId)
        resolve(stroke)
      })
    })
  }, timeout)
}

/**
 * Wait for a cursor-position event
 * @param {Object} browserInstance - Browser instance
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object>} Cursor data
 */
async function waitForCursorPosition (browserInstance, timeout = 2000) {
  const { page } = browserInstance

  return await page.evaluate((timeout) => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Timeout waiting for cursor')), timeout)

      window.webarmoniumApp.socketService.socket.once('cursor-position', (cursor) => {
        clearTimeout(timeoutId)
        resolve(cursor)
      })
    })
  }, timeout)
}

/**
 * Wait for any socket event
 * @param {Object} browserInstance - Browser instance
 * @param {string} eventName - Event name
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Object>} Event data
 */
async function waitForEvent (browserInstance, eventName, timeout = 2000) {
  const { page } = browserInstance

  return await page.evaluate((eventName, timeout) => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error(`Timeout waiting for ${eventName}`)), timeout)

      window.webarmoniumApp.socketService.socket.once(eventName, (data) => {
        clearTimeout(timeoutId)
        resolve(data)
      })
    })
  }, eventName, timeout)
}

/**
 * Get room state
 * @param {Object} browserInstance - Browser instance
 * @returns {Promise<Object>} Room state
 */
async function getRoomState (browserInstance) {
  const { page } = browserInstance
  return await page.evaluate(() => {
    return window.webarmoniumApp.currentRoom
  })
}

/**
 * Disconnect from room
 * @param {Object} browserInstance - Browser instance
 */
async function disconnect (browserInstance) {
  const { page } = browserInstance
  await page.evaluate(() => {
    window.webarmoniumApp.socketService.disconnect()
  })
}

/**
 * Wait for specified duration
 * @param {number} ms - Milliseconds to wait
 */
function waitFor (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Calculate average latency from timestamped events
 * @param {Array} events - Array of events with timestamp
 * @returns {number} Average latency in ms
 */
function calculateAvgLatency (events) {
  if (events.length === 0) return 0

  const latencies = []
  for (let i = 1; i < events.length; i++) {
    latencies.push(events[i].timestamp - events[i - 1].timestamp)
  }

  return latencies.reduce((a, b) => a + b, 0) / latencies.length
}

/**
 * Calculate percentile
 * @param {Array} values - Array of numbers
 * @param {number} p - Percentile (0-100)
 * @returns {number} Percentile value
 */
function percentile (values, p) {
  if (values.length === 0) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

module.exports = {
  launchBrowsers,
  closeBrowsers,
  loadApp,
  joinRoom,
  getAssignedColor,
  getUserId,
  drawStroke,
  drawCircle,
  waitForStroke,
  waitForCursorPosition,
  waitForEvent,
  getRoomState,
  disconnect,
  waitFor,
  calculateAvgLatency,
  percentile
}
