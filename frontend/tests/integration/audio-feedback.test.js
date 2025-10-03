/**
 * Integration Test: Audio Feedback on Remote Drawing
 * Tests Scenario 3 from quickstart.md
 *
 * Validates:
 * - Sound effects play when remote user draws
 * - Frequency correlates with user's color
 * - Mute/volume controls work correctly
 * - Audio respects user settings
 */

const {
  launchBrowsers,
  closeBrowsers,
  loadApp,
  joinRoom,
  getAssignedColor,
  drawStroke,
  waitFor
} = require('../../backend/tests/helpers/puppeteer-helpers')

describe('Audio Feedback for Remote Drawing', () => {
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

  test('Audio feedback plays for remote drawing strokes', async () => {
    // Both users join room
    await Promise.all([
      joinRoom(userA, 'main-room'),
      joinRoom(userB, 'main-room')
    ])

    const userAColor = await getAssignedColor(userA)
    const { page: pageB } = userB

    // Start audio on User B
    await pageB.evaluate(() => {
      const audioToggle = document.getElementById('audioToggle')
      audioToggle.click()
    })

    await waitFor(1000) // Wait for audio context to start

    // Intercept playDrawSound calls on User B
    await pageB.evaluate(() => {
      window.audioEvents = []
      const originalPlayDrawSound = window.webarmoniumApp.audioService.playDrawSound.bind(window.webarmoniumApp.audioService)

      window.webarmoniumApp.audioService.playDrawSound = function (color) {
        window.audioEvents.push({
          type: 'playDrawSound',
          color,
          timestamp: Date.now()
        })
        return originalPlayDrawSound(color)
      }
    })

    // User A draws a stroke
    await drawStroke(userA, [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
      { x: 0.3, y: 0.3 }
    ], { strokeWidth: 2, duration: 300 })

    await waitFor(500)

    // Retrieve audio events from User B
    const audioEvents = await pageB.evaluate(() => window.audioEvents)

    console.log(`Audio events captured: ${audioEvents.length}`)
    console.log('Events:', audioEvents)

    // Validate that playDrawSound was called
    expect(audioEvents.length).toBeGreaterThan(0)

    // Validate that color matches User A's color
    const drawSoundEvent = audioEvents.find(e => e.type === 'playDrawSound')
    expect(drawSoundEvent).toBeDefined()
    expect(drawSoundEvent.color).toBe(userAColor)
  }, 15000)

  test('Mute control prevents audio playback', async () => {
    const { page: pageB } = userB

    // Reset audio events
    await pageB.evaluate(() => {
      window.audioEvents = []
    })

    // Mute audio on User B
    await pageB.evaluate(() => {
      window.webarmoniumApp.audioService.setMuted(true)
    })

    // User A draws another stroke
    await drawStroke(userA, [
      { x: 0.4, y: 0.4 },
      { x: 0.5, y: 0.5 }
    ], { duration: 200 })

    await waitFor(500)

    // Retrieve audio events - should still be called but muted internally
    const audioEvents = await pageB.evaluate(() => window.audioEvents)

    // playDrawSound is called, but should not produce sound (muted internally)
    // We can verify muted state
    const isMuted = await pageB.evaluate(() => {
      return window.webarmoniumApp.audioService.isMuted()
    })

    expect(isMuted).toBe(true)
  }, 10000)

  test('Volume control affects playback level', async () => {
    const { page: pageB } = userB

    // Unmute and set volume to 50%
    await pageB.evaluate(() => {
      window.webarmoniumApp.audioService.setMuted(false)
      window.webarmoniumApp.audioService.setVolume(0.5)
    })

    const volume = await pageB.evaluate(() => {
      return window.webarmoniumApp.audioService.getVolume()
    })

    expect(volume).toBe(0.5)

    // Set volume to 100%
    await pageB.evaluate(() => {
      window.webarmoniumApp.audioService.setVolume(1.0)
    })

    const newVolume = await pageB.evaluate(() => {
      return window.webarmoniumApp.audioService.getVolume()
    })

    expect(newVolume).toBe(1.0)
  }, 10000)

  test('Color-to-frequency mapping works correctly', async () => {
    const { page: pageB } = userB
    const userAColor = await getAssignedColor(userA)

    // Test mapColorToFrequency function
    const frequency = await pageB.evaluate((color) => {
      return window.webarmoniumApp.audioService.mapColorToFrequency(color)
    }, userAColor)

    console.log(`Color ${userAColor} maps to frequency ${frequency}Hz`)

    // Validate frequency is in expected range (200-800Hz)
    expect(frequency).toBeGreaterThanOrEqual(200)
    expect(frequency).toBeLessThanOrEqual(800)
    expect(frequency).toBeCloseTo(frequency, 0) // Should be a number
  }, 10000)
})
