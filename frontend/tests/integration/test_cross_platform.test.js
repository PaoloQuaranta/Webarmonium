/**
 * Integration Test: Cross-Platform Device Inputs
 * Based on quickstart.md Test Scenario 4
 */

const puppeteer = require('puppeteer')

describe('Cross-Platform Device Input Integration', () => {
  let browser, desktopPage, mobilePage

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: false,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required'
      ]
    })

    // Create desktop viewport
    desktopPage = await browser.newPage()
    await desktopPage.setViewport({ width: 1920, height: 1080 })

    // Create mobile viewport
    mobilePage = await browser.newPage()
    await mobilePage.setViewport({ width: 375, height: 667, isMobile: true })

    // Grant permissions for both pages
    const grantPermissions = async (page) => {
      await page.evaluateOnNewDocument(() => {
        navigator.permissions.query = () => Promise.resolve({ state: 'granted' })

        // Mock DeviceOrientationEvent for mobile testing
        window.DeviceOrientationEvent = class {
          static requestPermission() {
            return Promise.resolve('granted')
          }
        }

        // Mock device orientation data
        window.addEventListener('deviceorientation', () => {})
      })
    }

    await grantPermissions(desktopPage)
    await grantPermissions(mobilePage)
  })

  afterAll(async () => {
    await browser.close()
  })

  beforeEach(async () => {
    await desktopPage.goto('http://localhost:3000', { waitUntil: 'networkidle0' })
    await mobilePage.goto('http://localhost:3000', { waitUntil: 'networkidle0' })
  })

  describe('Desktop Gesture Capture', () => {
    test('should capture mouse movements with normalized coordinates', async () => {
      const canvas = await desktopPage.$('canvas')
      const boundingBox = await canvas.boundingBox()

      // Test different mouse movement patterns
      const mousePatterns = [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.9, y: 0.9 }
      ]

      for (const pattern of mousePatterns) {
        const screenX = boundingBox.x + boundingBox.width * pattern.x
        const screenY = boundingBox.y + boundingBox.height * pattern.y

        await desktopPage.mouse.move(screenX, screenY)

        // Verify gesture data is properly normalized
        const gestureData = await desktopPage.evaluate(() => window.lastGesture)

        expect(gestureData).toBeTruthy()
        expect(gestureData.type).toBe('mouse')
        expect(gestureData.coordinates.x).toBeCloseTo(pattern.x, 1)
        expect(gestureData.coordinates.y).toBeCloseTo(pattern.y, 1)
        expect(gestureData.coordinates.x).toBeGreaterThanOrEqual(0.0)
        expect(gestureData.coordinates.x).toBeLessThanOrEqual(1.0)
        expect(gestureData.coordinates.y).toBeGreaterThanOrEqual(0.0)
        expect(gestureData.coordinates.y).toBeLessThanOrEqual(1.0)
      }

      // This will fail until GestureCapture is implemented
      expect(true).toBe(false) // Intentional failure for TDD
    })

    test('should capture mouse clicks with intensity mapping', async () => {
      const canvas = await desktopPage.$('canvas')
      const boundingBox = await canvas.boundingBox()

      // Click at center with different button types
      await desktopPage.mouse.click(
        boundingBox.x + boundingBox.width * 0.5,
        boundingBox.y + boundingBox.height * 0.5,
        { button: 'left' }
      )

      const clickGesture = await desktopPage.evaluate(() => window.lastGesture)

      expect(clickGesture.type).toBe('mouse')
      expect(clickGesture.intensity).toBeGreaterThan(0)
      expect(clickGesture.intensity).toBeLessThanOrEqual(1.0)

      // This will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })

    test('should capture drag gestures with continuous streaming', async () => {
      const canvas = await desktopPage.$('canvas')
      const boundingBox = await canvas.boundingBox()

      // Perform drag gesture
      await desktopPage.mouse.move(
        boundingBox.x + boundingBox.width * 0.2,
        boundingBox.y + boundingBox.height * 0.2
      )
      await desktopPage.mouse.down()

      await desktopPage.mouse.move(
        boundingBox.x + boundingBox.width * 0.8,
        boundingBox.y + boundingBox.height * 0.8
      )

      await desktopPage.mouse.up()

      // Verify continuous gesture streaming during drag
      const dragGestures = await desktopPage.evaluate(() => window.gestureHistory || [])

      expect(dragGestures.length).toBeGreaterThan(1)
      expect(dragGestures.every(g => g.type === 'mouse')).toBe(true)

      // This will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })
  })

  describe('Mobile Touch Gestures', () => {
    test('should capture single finger taps', async () => {
      const canvas = await mobilePage.$('canvas')
      const boundingBox = await canvas.boundingBox()

      // Simulate touch tap
      await mobilePage.touchscreen.tap(
        boundingBox.x + boundingBox.width * 0.5,
        boundingBox.y + boundingBox.height * 0.5
      )

      const touchGesture = await mobilePage.evaluate(() => window.lastGesture)

      expect(touchGesture).toBeTruthy()
      expect(touchGesture.type).toBe('touch')
      expect(touchGesture.coordinates.x).toBeCloseTo(0.5, 1)
      expect(touchGesture.coordinates.y).toBeCloseTo(0.5, 1)
      expect(touchGesture.intensity).toBeGreaterThan(0)

      // This will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })

    test('should capture swipe gestures', async () => {
      const canvas = await mobilePage.$('canvas')
      const boundingBox = await canvas.boundingBox()

      // Simulate swipe gesture
      const startX = boundingBox.x + boundingBox.width * 0.1
      const startY = boundingBox.y + boundingBox.height * 0.5
      const endX = boundingBox.x + boundingBox.width * 0.9
      const endY = boundingBox.y + boundingBox.height * 0.5

      await mobilePage.evaluate((start, end) => {
        const canvas = document.querySelector('canvas')

        // Simulate touch start
        const touchStart = new TouchEvent('touchstart', {
          touches: [{ clientX: start.x, clientY: start.y }]
        })
        canvas.dispatchEvent(touchStart)

        // Simulate touch move
        const touchMove = new TouchEvent('touchmove', {
          touches: [{ clientX: end.x, clientY: end.y }]
        })
        canvas.dispatchEvent(touchMove)

        // Simulate touch end
        const touchEnd = new TouchEvent('touchend', { touches: [] })
        canvas.dispatchEvent(touchEnd)
      }, { x: startX, y: startY }, { x: endX, y: endY })

      const swipeGestures = await mobilePage.evaluate(() => window.gestureHistory || [])

      expect(swipeGestures.length).toBeGreaterThan(0)
      expect(swipeGestures.every(g => g.type === 'touch')).toBe(true)

      // This will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })
  })

  describe('Mobile Gyroscope Integration', () => {
    test('should capture device tilt with 3D coordinates', async () => {
      // Simulate device orientation change
      await mobilePage.evaluate(() => {
        const event = new DeviceOrientationEvent('deviceorientation', {
          alpha: 45,  // Z-axis rotation
          beta: 30,   // X-axis rotation
          gamma: 15   // Y-axis rotation
        })
        window.dispatchEvent(event)
      })

      const gyroGesture = await mobilePage.evaluate(() => window.lastGesture)

      expect(gyroGesture).toBeTruthy()
      expect(gyroGesture.type).toBe('gyroscope')
      expect(gyroGesture.coordinates).toHaveProperty('x')
      expect(gyroGesture.coordinates).toHaveProperty('y')
      expect(gyroGesture.coordinates).toHaveProperty('z')

      // Verify 3D coordinates are normalized
      expect(gyroGesture.coordinates.x).toBeGreaterThanOrEqual(0.0)
      expect(gyroGesture.coordinates.x).toBeLessThanOrEqual(1.0)
      expect(gyroGesture.coordinates.y).toBeGreaterThanOrEqual(0.0)
      expect(gyroGesture.coordinates.y).toBeLessThanOrEqual(1.0)
      expect(gyroGesture.coordinates.z).toBeGreaterThanOrEqual(0.0)
      expect(gyroGesture.coordinates.z).toBeLessThanOrEqual(1.0)

      // This will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })

    test('should map device rotation to sonic parameters', async () => {
      // Test different rotation patterns
      const rotationPatterns = [
        { alpha: 0, beta: 0, gamma: 0 },
        { alpha: 90, beta: 45, gamma: -30 },
        { alpha: 180, beta: -45, gamma: 60 }
      ]

      for (const rotation of rotationPatterns) {
        await mobilePage.evaluate((rot) => {
          const event = new DeviceOrientationEvent('deviceorientation', rot)
          window.dispatchEvent(event)
        }, rotation)

        const sonicParams = await mobilePage.evaluate(() => window.lastSonicParams)

        expect(sonicParams).toBeTruthy()
        expect(typeof sonicParams.frequency).toBe('number')
        expect(typeof sonicParams.amplitude).toBe('number')
        expect(sonicParams.frequency).toBeGreaterThan(0)
        expect(sonicParams.amplitude).toBeGreaterThanOrEqual(0)
        expect(sonicParams.amplitude).toBeLessThanOrEqual(1)
      }

      // This will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })
  })

  describe('Cross-Platform Collaboration', () => {
    test('should enable desktop and mobile users in same room', async () => {
      // Both pages join the same room
      const roomId = 'cross-platform-test'

      const desktopJoin = desktopPage.evaluate((id) => {
        return new Promise((resolve) => {
          window.socket.on('room-joined', resolve)
          window.socket.emit('join-room', { roomId: id, deviceType: 'desktop' })
        })
      }, roomId)

      const mobileJoin = mobilePage.evaluate((id) => {
        return new Promise((resolve) => {
          window.socket.on('room-joined', resolve)
          window.socket.emit('join-room', { roomId: id, deviceType: 'mobile' })
        })
      }, roomId)

      const [desktopResponse, mobileResponse] = await Promise.all([desktopJoin, mobileJoin])

      expect(desktopResponse.roomId).toBe(roomId)
      expect(mobileResponse.roomId).toBe(roomId)
      expect(mobileResponse.userCount).toBe(2) // Both users in room

      // This will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })

    test('should create complementary sonic layers from different input types', async () => {
      // Desktop user makes mouse gesture
      const desktopCanvas = await desktopPage.$('canvas')
      const desktopBox = await desktopCanvas.boundingBox()

      await desktopPage.mouse.click(
        desktopBox.x + desktopBox.width * 0.3,
        desktopBox.y + desktopBox.height * 0.7
      )

      // Mobile user makes gyroscope gesture
      await mobilePage.evaluate(() => {
        const event = new DeviceOrientationEvent('deviceorientation', {
          alpha: 120,
          beta: 45,
          gamma: -20
        })
        window.dispatchEvent(event)
      })

      // Verify both gestures create different sonic contributions
      const desktopSonic = await desktopPage.evaluate(() => window.lastSonicContribution)
      const mobileSonic = await mobilePage.evaluate(() => window.lastSonicContribution)

      expect(desktopSonic.inputType).toBe('mouse')
      expect(mobileSonic.inputType).toBe('gyroscope')
      expect(desktopSonic.layer).not.toEqual(mobileSonic.layer)

      // This will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })
  })

  describe('Performance Across Platforms', () => {
    test('should maintain performance on mobile devices', async () => {
      // Test mobile performance under gesture load
      const performanceMetrics = await mobilePage.evaluate(() => {
        let frameCount = 0
        const startTime = performance.now()

        return new Promise((resolve) => {
          const measurePerformance = () => {
            frameCount++
            const elapsed = performance.now() - startTime

            if (elapsed >= 2000) { // Measure over 2 seconds
              const fps = (frameCount * 1000) / elapsed
              resolve({ fps, elapsed })
            } else {
              requestAnimationFrame(measurePerformance)
            }
          }

          requestAnimationFrame(measurePerformance)
        })
      })

      // Mobile should maintain reasonable performance (may be lower than desktop)
      expect(performanceMetrics.fps).toBeGreaterThan(30) // Minimum 30fps on mobile

      // This will fail until implementation exists
      expect(true).toBe(false) // Intentional failure for TDD
    })
  })
})