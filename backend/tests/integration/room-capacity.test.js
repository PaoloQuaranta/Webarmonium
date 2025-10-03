/**
 * Integration Test: Room Capacity Enforcement
 * Tests Scenario 6 from quickstart.md
 *
 * Validates:
 * - Max 10 users can join a room
 * - 11th user receives room-full error
 * - 11th user can join after one user leaves
 * - Color pool managed correctly at capacity
 */

const {
  launchBrowsers,
  closeBrowsers,
  loadApp,
  joinRoom,
  waitForEvent,
  getRoomState,
  disconnect,
  waitFor
} = require('../helpers/puppeteer-helpers')

describe('Room Capacity Enforcement', () => {
  let browsers
  let first10Users
  let user11

  beforeAll(async () => {
    // Launch 11 browsers
    browsers = await launchBrowsers(11)
    first10Users = browsers.slice(0, 10)
    user11 = browsers[10]

    // Load app in all browsers
    await Promise.all(browsers.map(b => loadApp(b)))
  }, 90000) // 90s timeout for 11 browsers

  afterAll(async () => {
    await closeBrowsers(browsers)
  }, 20000)

  test('First 10 users join successfully', async () => {
    // All 10 users join room
    const joinPromises = first10Users.map(u => joinRoom(u, 'main-room'))

    const roomStates = await Promise.all(joinPromises)

    console.log('All 10 users joined successfully')

    // Verify all users joined
    roomStates.forEach((roomState, idx) => {
      expect(roomState).toBeDefined()
      expect(roomState.room).toBeDefined()
      console.log(`User ${idx + 1} joined - Room has ${roomState.userCount || roomState.users?.length || '?'} users`)
    })

    // Check final room state
    const finalRoomState = await getRoomState(first10Users[0])
    expect(finalRoomState.users.length).toBe(10)
  }, 30000)

  test('11th user receives room-full error', async () => {
    const { page } = user11

    // Setup listener for room-full error
    const errorPromise = page.evaluate(() => {
      return new Promise(resolve => {
        window.webarmoniumApp.socketService.socket.once('room-full', (data) => {
          resolve(data)
        })
      })
    })

    // Attempt to join room manually (since joinRoom waits for room-joined)
    await page.evaluate(() => {
      // Manually emit join-room to trigger capacity check
      window.webarmoniumApp.socketService.socket.emit('join-room', {
        roomId: 'main-room',
        userData: { device: 'desktop', capabilities: {} }
      })
    })

    // Wait for room-full error
    const error = await errorPromise

    console.log('11th user received error:', error)

    expect(error).toBeDefined()
    expect(error.error).toMatch(/room.*full/i)

    // Verify 11th user NOT in room
    const roomState = await getRoomState(first10Users[0])
    expect(roomState.users.length).toBe(10)
  }, 15000)

  test('11th user can join after one user leaves', async () => {
    // User 1 disconnects
    await disconnect(first10Users[0])

    console.log('User 1 disconnected')

    // Wait for user-left event to propagate
    await waitFor(500)

    // Verify room now has 9 users
    const roomStateBefore = await getRoomState(first10Users[1])
    expect(roomStateBefore.users.length).toBe(9)

    // 11th user joins successfully now
    const { page } = user11

    const roomJoinedPromise = page.evaluate(() => {
      return new Promise(resolve => {
        window.webarmoniumApp.socketService.socket.once('room-joined', (data) => {
          resolve(data)
        })
      })
    })

    // Manually join room
    await page.evaluate(() => {
      window.webarmoniumApp.socketService.socket.emit('join-room', {
        roomId: 'main-room',
        userData: { device: 'desktop', capabilities: {} }
      })
    })

    const roomJoinedData = await roomJoinedPromise

    console.log('11th user joined successfully:', roomJoinedData)

    expect(roomJoinedData).toBeDefined()
    expect(roomJoinedData.room).toBeDefined()
    expect(roomJoinedData.assignedColor).toMatch(/^#[0-9a-f]{6}$/)

    // Verify room now has 10 users again
    const roomStateAfter = await getRoomState(user11)
    expect(roomStateAfter.users.length).toBe(10)
  }, 15000)

  test('All 10 users have unique colors', async () => {
    // Get colors from all active users (first10Users[1-9] + user11)
    const activeUsers = [...first10Users.slice(1), user11]

    const colors = await Promise.all(
      activeUsers.map(async (user) => {
        const { page } = user
        return await page.evaluate(() => {
          const currentUser = window.webarmoniumApp.currentRoom?.users?.find(
            u => u.userId === window.webarmoniumApp.socketService.socket.id
          )
          return currentUser?.assignedColor
        })
      })
    )

    console.log('User colors:', colors)

    // Verify all colors are unique
    const uniqueColors = new Set(colors.filter(c => c !== undefined))
    expect(uniqueColors.size).toBe(colors.filter(c => c !== undefined).length)

    // Verify all colors are valid hex
    colors.forEach(color => {
      if (color) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/)
      }
    })
  }, 15000)
})
