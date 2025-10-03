/**
 * Integration Test: Single User Room Experience
 * Based on quickstart.md Test Scenario 1
 */

const puppeteer = require('puppeteer')

describe('Single User Room Experience Integration', () => {
  let browser, page

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: false, // Set to true for CI/CD
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required'
      ]
    })
    page = await browser.newPage()

    // Grant permissions for audio and device motion
    await page.evaluateOnNewDocument(() => {
      navigator.permissions.query = () => Promise.resolve({ state: 'granted' })
    })
  })

  afterAll(async () => {
    await browser.close()
  })

  beforeEach(async () => {
    // Navigate to frontend (assumes frontend server running on port 3000)
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' })
  })

  describe('Room Join and Audio Initialization', () => {
    test('should auto-assign to available room with ambient music', async () => {
      // Expected: Room ID displayed, ambient music begins playing
      const roomId = await page.waitForSelector('#room-id', { timeout: 5000 })
      expect(roomId).toBeTruthy()

      const roomIdText = await page.$eval('#room-id', el => el.textContent)
      expect(roomIdText).toMatch(/^room-\d+$/)

      // Verify audio context is activated
      const audioContextState = await page.evaluate(() => {
        return window.Tone && window.Tone.context && window.Tone.context.state
      })
      expect(audioContextState).toBe('running')

      // Verify Canvas is initialized
      const canvas = await page.$('canvas')
      expect(canvas).toBeTruthy()

      // This test will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })

    test('should verify Web Audio API and Canvas support', async () => {
      const features = await page.evaluate(() => ({
        audioContext: !!(window.AudioContext || window.webkitAudioContext),
        canvas: !!document.createElement('canvas').getContext,
        deviceOrientation: 'DeviceOrientationEvent' in window
      }))

      expect(features.audioContext).toBe(true)
      expect(features.canvas).toBe(true)
      expect(features.deviceOrientation).toBe(true)
    })
  })

  describe('Gesture Response and Audio Feedback', () => {
    test('should respond to mouse gestures within 200ms', async () => {
      // Move mouse across canvas
      const canvas = await page.$('canvas')
      const boundingBox = await canvas.boundingBox()

      const startTime = Date.now()

      // Simulate mouse movement
      await page.mouse.move(
        boundingBox.x + boundingBox.width * 0.3,
        boundingBox.y + boundingBox.height * 0.5
      )

      await page.mouse.move(
        boundingBox.x + boundingBox.width * 0.7,
        boundingBox.y + boundingBox.height * 0.3
      )

      // Wait for audio response
      await page.waitForFunction(() => {
        return window.lastGestureResponse &&
               Date.now() - window.lastGestureResponse < 200
      }, { timeout: 300 })

      const responseTime = await page.evaluate(() => window.lastGestureResponse)
      expect(responseTime - startTime).toBeLessThan(200)

      // This test will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })

    test('should provide visual feedback synchronized with audio', async () => {
      const canvas = await page.$('canvas')
      const boundingBox = await canvas.boundingBox()

      // Click on canvas
      await page.mouse.click(
        boundingBox.x + boundingBox.width * 0.5,
        boundingBox.y + boundingBox.height * 0.5
      )

      // Verify visual feedback appears
      const visualFeedback = await page.evaluate(() => {
        const canvas = document.querySelector('canvas')
        const ctx = canvas.getContext('2d')
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

        // Check if any non-zero pixels exist (indicating visual content)
        for (let i = 0; i < imageData.data.length; i += 4) {
          if (imageData.data[i] > 0 || imageData.data[i + 1] > 0 || imageData.data[i + 2] > 0) {
            return true
          }
        }
        return false
      })

      expect(visualFeedback).toBe(true)

      // This test will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })
  })

  describe('Memory Development and Adaptation', () => {
    test('should develop room personality over 60 seconds', async () => {
      const canvas = await page.$('canvas')
      const boundingBox = await canvas.boundingBox()

      // Generate varied gesture patterns for 60 seconds
      const gestureInterval = setInterval(async () => {
        const x = Math.random()
        const y = Math.random()

        await page.mouse.click(
          boundingBox.x + boundingBox.width * x,
          boundingBox.y + boundingBox.height * y
        )
      }, 500) // 2 gestures per second

      // Wait for memory evolution events
      await page.evaluate(() => {
        return new Promise((resolve) => {
          let evolutionCount = 0
          window.socket.on('memory-evolution', () => {
            evolutionCount++
            if (evolutionCount >= 3) { // Expect multiple evolution events
              resolve()
            }
          })

          // Timeout after 65 seconds
          setTimeout(resolve, 65000)
        })
      })

      clearInterval(gestureInterval)

      // Verify room memory has developed
      const memoryState = await page.evaluate(() => window.currentRoomMemory)
      expect(memoryState).toBeTruthy()
      expect(memoryState.adaptationStrength).toBeGreaterThan(0)

      // This test will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })

    test('should continue ambient music during idle state', async () => {
      // Stop all gestures for 30 seconds
      await page.evaluate(() => {
        window.stopAllGestures = true
      })

      await page.waitForTimeout(30000) // Wait 30 seconds

      // Verify user marked as inactive but music continues
      const userStatus = await page.evaluate(() => window.userStatus)
      expect(userStatus).toBe('inactive')

      const audioIsPlaying = await page.evaluate(() => {
        return window.Tone && window.Tone.Transport && window.Tone.Transport.state === 'started'
      })
      expect(audioIsPlaying).toBe(true)

      // This test will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })
  })

  describe('Performance Requirements Validation', () => {
    test('should maintain 60fps Canvas rendering during gestures', async () => {
      const performanceMetrics = await page.evaluate(() => {
        let frameCount = 0
        let startTime = performance.now()

        const measureFPS = () => {
          frameCount++
          const elapsed = performance.now() - startTime

          if (elapsed >= 1000) { // Measure over 1 second
            const fps = (frameCount * 1000) / elapsed
            return fps
          }

          requestAnimationFrame(measureFPS)
          return null
        }

        return new Promise((resolve) => {
          const checkFPS = () => {
            const fps = measureFPS()
            if (fps !== null) {
              resolve(fps)
            } else {
              requestAnimationFrame(checkFPS)
            }
          }
          requestAnimationFrame(checkFPS)
        })
      })

      expect(performanceMetrics).toBeGreaterThanOrEqual(60)

      // This test will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })
  })
})