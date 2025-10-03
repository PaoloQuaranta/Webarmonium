const puppeteer = require('puppeteer')

/**
 * Puppeteer Test Utilities
 * Helper functions for E2E and integration testing with multiple browsers
 */

/**
 * Launch multiple browser instances
 * @param {number} count - Number of browsers to launch
 * @param {object} options - Puppeteer launch options
 * @returns {Promise<Browser[]>} - Array of browser instances
 */
async function launchBrowsers (count, options = {}) {
  const browsers = []
  const defaultOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-capture'],
    ...options
  }

  for (let i = 0; i < count; i++) {
    const browser = await puppeteer.launch(defaultOptions)
    browsers.push(browser)
  }

  return browsers
}

/**
 * Join a room with a browser instance
 * @param {Browser} browser - Puppeteer browser instance
 * @param {string} roomId - Room ID to join
 * @param {string} url - Frontend URL (default: http://localhost:3000)
 * @returns {Promise<Page>} - Puppeteer page instance
 */
async function joinRoom (browser, roomId, url = 'http://localhost:3000') {
  const page = await browser.newPage()

  // Navigate to frontend
  await page.goto(url, { waitUntil: 'networkidle2' })

  // Wait for room input and join
  await page.waitForSelector('#room-input', { timeout: 5000 })
  await page.type('#room-input', roomId)
  await page.click('#join-button')

  // Wait for canvas to be ready
  await page.waitForSelector('canvas', { timeout: 5000 })

  return page
}

/**
 * Draw a stroke on the canvas
 * @param {Page} page - Puppeteer page instance
 * @param {Array<{x: number, y: number}>} points - Array of points to draw
 * @returns {Promise<void>}
 */
async function drawStroke (page, points) {
  const canvas = await page.$('canvas')
  const box = await canvas.boundingBox()

  // Move to first point and mouse down
  await page.mouse.move(box.x + points[0].x, box.y + points[0].y)
  await page.mouse.down()

  // Draw through all points
  for (let i = 1; i < points.length; i++) {
    await page.mouse.move(box.x + points[i].x, box.y + points[i].y)
    await page.waitForTimeout(16) // ~60fps
  }

  // Mouse up to complete stroke
  await page.mouse.up()
}

/**
 * Draw a circle on the canvas
 * @param {Page} page - Puppeteer page instance
 * @param {object} options - Circle options {x, y, radius, points}
 * @returns {Promise<void>}
 */
async function drawCircle (page, { x = 200, y = 200, radius = 50, pointCount = 36 } = {}) {
  const points = []
  for (let i = 0; i <= pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2
    points.push({
      x: x + Math.cos(angle) * radius,
      y: y + Math.sin(angle) * radius
    })
  }
  await drawStroke(page, points)
}

/**
 * Wait for a stroke to appear on the canvas
 * @param {Page} page - Puppeteer page instance
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<{color: string, timestamp: number}>} - Stroke info
 */
async function waitForStroke (page, timeout = 5000) {
  return page.evaluate((timeoutMs) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()

      // Listen for custom stroke event (assumes frontend emits this)
      const handler = (event) => {
        window.removeEventListener('stroke-received', handler)
        resolve({
          color: event.detail.color,
          timestamp: Date.now()
        })
      }

      window.addEventListener('stroke-received', handler)

      setTimeout(() => {
        window.removeEventListener('stroke-received', handler)
        reject(new Error('Timeout waiting for stroke'))
      }, timeoutMs)
    })
  }, timeout)
}

/**
 * Get user's assigned color from the page
 * @param {Page} page - Puppeteer page instance
 * @returns {Promise<string>} - Assigned color (hex)
 */
async function getAssignedColor (page) {
  return page.evaluate(() => {
    // Assumes color is stored in a global variable or data attribute
    return window.userColor || document.body.dataset.userColor || '#000000'
  })
}

/**
 * Get user's ID from the page
 * @param {Page} page - Puppeteer page instance
 * @returns {Promise<string>} - User ID
 */
async function getUserId (page) {
  return page.evaluate(() => {
    return window.userId || document.body.dataset.userId || null
  })
}

/**
 * Move cursor in a path
 * @param {Page} page - Puppeteer page instance
 * @param {Array<{x: number, y: number}>} path - Path to follow
 * @param {object} options - Options {duration: milliseconds}
 * @returns {Promise<void>}
 */
async function moveCursor (page, path, { duration = 1000 } = {}) {
  const canvas = await page.$('canvas')
  const box = await canvas.boundingBox()
  const delayPerPoint = duration / path.length

  for (const point of path) {
    await page.mouse.move(box.x + point.x, box.y + point.y)
    await page.waitForTimeout(delayPerPoint)
  }
}

/**
 * Generate a circular path
 * @param {object} options - Path options {x, y, radius, points}
 * @returns {Array<{x: number, y: number}>} - Array of points
 */
function generateCirclePath ({ x = 300, y = 300, radius = 100, points = 60 } = {}) {
  const path = []
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2
    path.push({
      x: x + Math.cos(angle) * radius,
      y: y + Math.sin(angle) * radius
    })
  }
  return path
}

/**
 * Generate a random path
 * @param {number} points - Number of points
 * @param {object} bounds - Bounds {minX, maxX, minY, maxY}
 * @returns {Array<{x: number, y: number}>} - Array of points
 */
function randomPath (points = 20, { minX = 50, maxX = 750, minY = 50, maxY = 550 } = {}) {
  const path = []
  for (let i = 0; i < points; i++) {
    path.push({
      x: Math.random() * (maxX - minX) + minX,
      y: Math.random() * (maxY - minY) + minY
    })
  }
  return path
}

/**
 * Set mute status
 * @param {Page} page - Puppeteer page instance
 * @param {boolean} muted - Mute status
 * @returns {Promise<void>}
 */
async function setMute (page, muted) {
  await page.evaluate((isMuted) => {
    const muteButton = document.querySelector('#mute-toggle')
    if (muteButton && muteButton.checked !== isMuted) {
      muteButton.click()
    }
  }, muted)
}

/**
 * Close all browsers
 * @param {Browser[]} browsers - Array of browser instances
 * @returns {Promise<void>}
 */
async function closeAllBrowsers (browsers) {
  await Promise.all(browsers.map(browser => browser.close()))
}

/**
 * Calculate percentile from array of values
 * @param {number[]} values - Array of numbers
 * @param {number} p - Percentile (0-100)
 * @returns {number} - Percentile value
 */
function percentile (values, p) {
  const sorted = values.slice().sort((a, b) => a - b)
  const index = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

/**
 * Calculate average latency from events
 * @param {Array<{timestamp: number}>} events - Array of events with timestamps
 * @returns {number} - Average latency in milliseconds
 */
function calculateAvgLatency (events) {
  if (events.length === 0) return 0
  const latencies = events.map((e, i) => {
    if (i === 0) return 0
    return e.timestamp - events[i - 1].timestamp
  }).slice(1)
  return latencies.reduce((sum, l) => sum + l, 0) / latencies.length
}

/**
 * Wait for a specific amount of time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function waitFor (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = {
  launchBrowsers,
  joinRoom,
  drawStroke,
  drawCircle,
  waitForStroke,
  getAssignedColor,
  getUserId,
  moveCursor,
  generateCirclePath,
  randomPath,
  setMute,
  closeAllBrowsers,
  percentile,
  calculateAvgLatency,
  waitFor
}
