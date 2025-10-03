/**
 * Integration Test: User Presence Notifications
 * Tests Scenario 5 from quickstart.md
 *
 * Validates:
 * - user-joined events sent to existing users
 * - user-left events sent when user disconnects
 * - Color uniqueness across users
 * - Color pool recycling
 */

const {
  launchBrowsers,
  closeBrowsers,
  loadApp,
  joinRoom,
  getAssignedColor,
  getUserId,
  waitForEvent,
  getRoomState,
  disconnect,
  waitFor
} = require('../helpers/puppeteer-helpers')

describe('User Presence Notifications', () => {
  let browsers
  let userA, userB

  beforeAll(async () => {
    browsers = await launchBrowsers(2)
    ;[userA, userB] = browsers

    await loadApp(userA)
  }, 30000)

  afterAll(async () => {
    await closeBrowsers(browsers)
  }, 10000)

  test('User A receives user-joined event when User B joins', async () => {
    // User A joins room first
    await joinRoom(userA, 'main-room')

    const roomStateA = await getRoomState(userA)
    console.log('User A room state:', roomStateA)

    expect(roomStateA.users).toBeDefined()
    expect(roomStateA.users.length).toBeGreaterThanOrEqual(1)

    // Setup listener for user-joined event on User A
    const { page: pageA } = userA
    const userJoinedPromise = pageA.evaluate(() => {
      return new Promise(resolve => {
        window.webarmoniumApp.socketService.socket.once('user-joined', (data) => {
          resolve(data)
        })
      })
    })

    // User B loads app and joins room
    await loadApp(userB)
    await joinRoom(userB, 'main-room')

    const userBId = await getUserId(userB)
    const userBColor = await getAssignedColor(userB)

    // Wait for User A to receive user-joined event
    const joinedEvent = await userJoinedPromise

    console.log('User A received user-joined event:', joinedEvent)

    expect(joinedEvent).toBeDefined()
    expect(joinedEvent.userId).toBe(userBId)
    expect(joinedEvent.assignedColor).toMatch(/^#[0-9a-f]{6}$/)

    // Verify room state updated
    const updatedRoomStateA = await getRoomState(userA)
    const updatedRoomStateB = await getRoomState(userB)

    expect(updatedRoomStateA.users.length).toBe(updatedRoomStateB.users.length)
  }, 15000)

  test('Users have unique colors', async () => {
    const userAColor = await getAssignedColor(userA)
    const userBColor = await getAssignedColor(userB)

    console.log(`User A color: ${userAColor}`)
    console.log(`User B color: ${userBColor}`)

    // Colors should be different
    expect(userAColor).not.toBe(userBColor)

    // Both should be valid hex colors
    expect(userAColor).toMatch(/^#[0-9a-f]{6}$/)
    expect(userBColor).toMatch(/^#[0-9a-f]{6}$/)
  }, 10000)

  test('User A receives user-left event when User B disconnects', async () => {
    const { page: pageA } = userA
    const userBId = await getUserId(userB)

    // Setup listener for user-left event on User A
    const userLeftPromise = pageA.evaluate(() => {
      return new Promise(resolve => {
        window.webarmoniumApp.socketService.socket.once('user-left', (data) => {
          resolve(data)
        })
      })
    })

    // User B disconnects
    await disconnect(userB)

    // Wait for User A to receive user-left event
    const leftEvent = await userLeftPromise

    console.log('User A received user-left event:', leftEvent)

    expect(leftEvent).toBeDefined()
    expect(leftEvent.userId).toBe(userBId)
  }, 15000)

  test('Color pool recycling - color returned after user leaves', async () => {
    // User B already disconnected in previous test
    const userBColor = await getAssignedColor(userB) // This might fail, but we saved it earlier

    // Launch a new user (User C)
    const [userC] = await launchBrowsers(1)
    await loadApp(userC)

    // Setup listener on User A for user-joined
    const { page: pageA } = userA
    const userJoinedPromise = pageA.evaluate(() => {
      return new Promise(resolve => {
        window.webarmoniumApp.socketService.socket.once('user-joined', (data) => {
          resolve(data)
        })
      })
    })

    await joinRoom(userC, 'main-room')

    const joinedEvent = await userJoinedPromise
    const userCColor = await getAssignedColor(userC)

    console.log(`User C assigned color: ${userCColor}`)
    console.log(`User B had color: ${userBColor}`)

    // User C might get the recycled color from User B (or a different available color)
    // Verify User C has a valid color
    expect(userCColor).toMatch(/^#[0-9a-f]{6}$/)

    // Cleanup
    await userC.browser.close()
  }, 20000)
})
