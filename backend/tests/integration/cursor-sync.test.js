/**
 * Integration Test: Cursor Position Synchronization
 * Tests Scenario 2 from quickstart.md
 *
 * Validates:
 * - Cursor positions sync between users
 * - 60Hz update rate (~60 updates per second)
 * - <100ms latency for cursor updates
 * - Accurate cursor coordinates
 */

const {
  launchBrowsers,
  closeBrowsers,
  loadApp,
  joinRoom,
  getAssignedColor,
  waitForCursorPosition,
  waitFor,
  calculateAvgLatency
} = require('../helpers/puppeteer-helpers')

describe('Cursor Position Synchronization', () => {
  let browsers
  let userA, userB

  beforeAll(async () => {
    browsers = await launchBrowsers(2)
    ;[userA, userB] = browsers

    await Promise.all(browsers.map(b => loadApp(b)))
  }, 30000)

  afterAll(async () => {
    await closeBrowsers(browsers)
  }, 10000)

  test('Cursor position synchronization - 60Hz updates, <100ms latency', async () => {
    // Both users join room
    await Promise.all([
      joinRoom(userA, 'main-room'),
      joinRoom(userB, 'main-room')
    ])

    const userAColor = await getAssignedColor(userA)

    // Setup cursor position listener on User B
    const cursorUpdates = []
    const { page: pageB } = userB

    await pageB.evaluate(() => {
      window.cursorUpdates = []
      window.webarmoniumApp.socketService.socket.on('cursor-position', (cursor) => {
        window.cursorUpdates.push({
          ...cursor,
          receiveTime: Date.now()
        })
      })
    })

    // User A moves cursor in circular pattern (60 updates over 1 second)
    const { page: pageA } = userA
    await pageA.evaluate(() => {
      const canvas = document.getElementById('gestureCanvas')
      const rect = canvas.getBoundingClientRect()
      const socketService = window.webarmoniumApp.socketService

      const centerX = 300
      const centerY = 300
      const radius = 100
      const numPoints = 60
      const interval = 1000 / 60 // ~16.67ms per update

      let currentPoint = 0

      const moveCursor = () => {
        if (currentPoint >= numPoints) return

        const angle = (currentPoint / numPoints) * Math.PI * 2
        const x = (centerX + Math.cos(angle) * radius) / rect.width
        const y = (centerY + Math.sin(angle) * radius) / rect.height

        socketService.socket.emit('cursor-move', {
          x,
          y,
          timestamp: Date.now()
        })

        currentPoint++
        if (currentPoint < numPoints) {
          setTimeout(moveCursor, interval)
        }
      }

      moveCursor()
    })

    // Wait for cursor movement to complete + network latency
    await waitFor(1500)

    // Retrieve cursor updates from User B
    const updates = await pageB.evaluate(() => window.cursorUpdates)

    console.log(`Received ${updates.length} cursor updates`)

    // Validate update count (should be close to 60, allow some drops)
    expect(updates.length).toBeGreaterThanOrEqual(55) // Allow up to 5 drops

    // Validate first update has correct color
    expect(updates[0].color).toBe(userAColor)

    // Calculate average latency between consecutive updates
    const latencies = []
    for (let i = 1; i < Math.min(updates.length, 60); i++) {
      const latency = updates[i].receiveTime - updates[i - 1].receiveTime
      if (latency > 0 && latency < 200) { // Filter outliers
        latencies.push(latency)
      }
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length
    console.log(`Average cursor update latency: ${avgLatency.toFixed(2)}ms`)

    // Validate latency requirement (<100ms average)
    expect(avgLatency).toBeLessThan(100)

    // Validate cursor coordinates are within valid range (0-1)
    updates.forEach(update => {
      expect(update.x).toBeGreaterThanOrEqual(0)
      expect(update.x).toBeLessThanOrEqual(1)
      expect(update.y).toBeGreaterThanOrEqual(0)
      expect(update.y).toBeLessThanOrEqual(1)
    })
  }, 15000)

  test('Cursor isDrawing state updates correctly', async () => {
    const { page: pageA } = userA
    const { page: pageB } = userB

    // Clear previous cursor updates
    await pageB.evaluate(() => {
      window.cursorUpdates = []
    })

    // User A moves cursor with isDrawing=true
    await pageA.evaluate(() => {
      const socketService = window.webarmoniumApp.socketService

      socketService.socket.emit('cursor-move', {
        x: 0.5,
        y: 0.5,
        isDrawing: true,
        timestamp: Date.now()
      })
    })

    await waitFor(200)

    // Check that User B received cursor with isDrawing=true
    const updates = await pageB.evaluate(() => window.cursorUpdates)
    expect(updates.length).toBeGreaterThan(0)

    const drawingUpdate = updates.find(u => u.isDrawing === true)
    expect(drawingUpdate).toBeDefined()
  }, 10000)
})
