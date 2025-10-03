/**
 * Integration Test: Multi-User Drawing Synchronization
 * Tests Scenario 1 from quickstart.md
 *
 * Validates:
 * - 4 users can draw simultaneously
 * - Strokes sync across all users within 1000ms
 * - Colors match assigned user colors
 * - Stroke coordinates are accurate
 */

const {
  launchBrowsers,
  closeBrowsers,
  loadApp,
  joinRoom,
  getAssignedColor,
  getUserId,
  drawCircle,
  waitForStroke
} = require('../helpers/puppeteer-helpers')

describe('Multi-User Drawing Synchronization', () => {
  let browsers
  let userA, userB, userC, userD

  beforeAll(async () => {
    // Launch 4 browser instances
    browsers = await launchBrowsers(4)
    ;[userA, userB, userC, userD] = browsers

    // Load app in all browsers
    await Promise.all(browsers.map(b => loadApp(b)))
  }, 30000) // 30s timeout for browser launch

  afterAll(async () => {
    await closeBrowsers(browsers)
  }, 10000)

  test('Multi-user drawing synchronization - 4 users, circle stroke', async () => {
    // All users join room (automatically joined to 'main-room' in main.js)
    const [roomA, roomB, roomC, roomD] = await Promise.all([
      joinRoom(userA, 'main-room'),
      joinRoom(userB, 'main-room'),
      joinRoom(userC, 'main-room'),
      joinRoom(userD, 'main-room')
    ])

    // Verify all users joined
    expect(roomA).toBeDefined()
    expect(roomB).toBeDefined()
    expect(roomC).toBeDefined()
    expect(roomD).toBeDefined()

    // Get User A's color and ID
    const userAColor = await getAssignedColor(userA)
    const userAId = await getUserId(userA)

    expect(userAColor).toMatch(/^#[0-9a-f]{6}$/)
    expect(userAId).toBeDefined()

    // Setup stroke listeners for Users B, C, D
    const startTime = Date.now()
    const strokePromises = [
      waitForStroke(userB, 2000),
      waitForStroke(userC, 2000),
      waitForStroke(userD, 2000)
    ]

    // User A draws a circle
    const strokeId = await drawCircle(userA, { x: 200, y: 200, radius: 50 })
    expect(strokeId).toBeDefined()

    // Wait for all users to receive the stroke
    const [strokeB, strokeC, strokeD] = await Promise.all(strokePromises)

    const latency = Date.now() - startTime
    console.log(`Stroke sync latency: ${latency}ms`)

    // Validate latency requirement (<1000ms)
    expect(latency).toBeLessThan(1000)

    // Validate stroke data for User B
    expect(strokeB).toBeDefined()
    expect(strokeB.color).toBe(userAColor)
    expect(strokeB.userId).toBe(userAId)
    expect(strokeB.points).toBeDefined()
    expect(strokeB.points.length).toBeGreaterThan(10) // Circle should have many points

    // Validate stroke data for User C
    expect(strokeC).toBeDefined()
    expect(strokeC.color).toBe(userAColor)
    expect(strokeC.userId).toBe(userAId)
    expect(strokeC.points.length).toBe(strokeB.points.length) // Same stroke

    // Validate stroke data for User D
    expect(strokeD).toBeDefined()
    expect(strokeD.color).toBe(userAColor)
    expect(strokeD.userId).toBe(userAId)
    expect(strokeD.points.length).toBe(strokeB.points.length) // Same stroke

    // Validate stroke coordinates (first and last point)
    const firstPoint = strokeB.points[0]
    const lastPoint = strokeB.points[strokeB.points.length - 1]

    expect(firstPoint.x).toBeGreaterThan(0)
    expect(firstPoint.x).toBeLessThan(1)
    expect(firstPoint.y).toBeGreaterThan(0)
    expect(firstPoint.y).toBeLessThan(1)

    expect(lastPoint.x).toBeGreaterThan(0)
    expect(lastPoint.x).toBeLessThan(1)
    expect(lastPoint.y).toBeGreaterThan(0)
    expect(lastPoint.y).toBeLessThan(1)

    // Verify no stroke duplication
    expect(strokeB.id).toBe(strokeC.id)
    expect(strokeC.id).toBe(strokeD.id)
  }, 15000) // 15s timeout for test

  test('Multiple sequential strokes sync correctly', async () => {
    const userAColor = await getAssignedColor(userA)

    // Draw 3 strokes sequentially
    for (let i = 0; i < 3; i++) {
      const strokePromises = [
        waitForStroke(userB, 2000),
        waitForStroke(userC, 2000),
        waitForStroke(userD, 2000)
      ]

      await drawCircle(userA, { x: 100 + i * 100, y: 100, radius: 30 })

      const [strokeB, strokeC, strokeD] = await Promise.all(strokePromises)

      expect(strokeB.color).toBe(userAColor)
      expect(strokeC.color).toBe(userAColor)
      expect(strokeD.color).toBe(userAColor)
    }
  }, 20000)
})
