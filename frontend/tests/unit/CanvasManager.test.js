/**
 * Unit Tests for CanvasManager
 * Sprint 3: Testing extracted component from Sprint 2
 * Target Coverage: 85%+
 */

const CanvasManager = require('../../src/services/CanvasManager.js')

describe('CanvasManager', () => {
  let manager
  let mockCanvas
  let mockContext
  let mockOverlay

  // Helper to create a mock canvas element
  const createMockCanvas = (id) => {
    const canvas = {
      id: id,
      width: 0,
      height: 0,
      style: {},
      parentElement: {
        appendChild: jest.fn()
      },
      getContext: jest.fn(() => mockContext)
    }
    return canvas
  }

  // Helper to create a mock 2D context
  const createMock2DContext = () => ({
    scale: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn()
  })

  beforeEach(() => {
    // Reset mocks before each test
    mockContext = createMock2DContext()
    mockCanvas = createMockCanvas('gestureCanvas')
    mockOverlay = createMockCanvas('cursorOverlay')

    // Mock document.getElementById
    document.getElementById = jest.fn((id) => {
      if (id === 'gestureCanvas') return mockCanvas
      if (id === 'cursorOverlay') return mockOverlay
      return null
    })

    // Mock document.createElement
    document.createElement = jest.fn((tag) => {
      if (tag === 'canvas') {
        return createMockCanvas('created-overlay')
      }
      return null
    })

    // Reset window dimensions
    window.innerWidth = 1024
    window.innerHeight = 768
    window.devicePixelRatio = 1

    manager = new CanvasManager()
  })

  afterEach(() => {
    jest.clearAllMocks()
    // Clean up event listeners
    if (manager && manager.boundResizeHandler) {
      window.removeEventListener('resize', manager.boundResizeHandler)
    }
  })

  describe('Constructor', () => {
    test('should initialize with default canvas IDs', () => {
      expect(manager.canvasId).toBe('gestureCanvas')
      expect(manager.overlayId).toBe('cursorOverlay')
    })

    test('should accept custom canvas IDs', () => {
      const customManager = new CanvasManager('myCanvas', 'myOverlay')
      expect(customManager.canvasId).toBe('myCanvas')
      expect(customManager.overlayId).toBe('myOverlay')
    })

    test('should initialize with null references', () => {
      expect(manager.canvas).toBeNull()
      expect(manager.ctx).toBeNull()
      expect(manager.cursorOverlayCanvas).toBeNull()
      expect(manager.boundResizeHandler).toBeNull()
    })

    test('should initialize empty resize listeners array', () => {
      expect(manager.resizeListeners).toEqual([])
    })
  })

  describe('setup()', () => {
    test('should find and initialize main canvas', () => {
      manager.setup()

      expect(document.getElementById).toHaveBeenCalledWith('gestureCanvas')
      expect(manager.canvas).toBe(mockCanvas)
      expect(manager.ctx).toBe(mockContext)
    })

    test('should throw error if main canvas not found', () => {
      document.getElementById = jest.fn(() => null)

      expect(() => manager.setup()).toThrow('Canvas element #gestureCanvas not found')
    })

    test('should use existing overlay canvas if present', () => {
      manager.setup()

      expect(document.getElementById).toHaveBeenCalledWith('cursorOverlay')
      expect(manager.cursorOverlayCanvas).toBe(mockOverlay)
    })

    test('should create overlay canvas if not present', () => {
      document.getElementById = jest.fn((id) => {
        if (id === 'gestureCanvas') return mockCanvas
        return null // No overlay found
      })

      manager.setup()

      expect(document.createElement).toHaveBeenCalledWith('canvas')
      expect(mockCanvas.parentElement.appendChild).toHaveBeenCalled()
    })

    test('should perform initial resize', () => {
      const resizeSpy = jest.spyOn(manager, 'resize')

      manager.setup()

      expect(resizeSpy).toHaveBeenCalled()
    })

    test('should setup window resize listener', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener')

      manager.setup()

      expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
      expect(manager.boundResizeHandler).not.toBeNull()
    })

    test('should return canvas references', () => {
      const refs = manager.setup()

      expect(refs).toEqual({
        canvas: mockCanvas,
        ctx: mockContext,
        cursorOverlayCanvas: expect.any(Object)
      })
    })
  })

  describe('createOverlayCanvas()', () => {
    beforeEach(() => {
      // Setup main canvas first
      manager.canvas = mockCanvas
    })

    test('should create canvas element', () => {
      const overlay = manager.createOverlayCanvas()

      expect(document.createElement).toHaveBeenCalledWith('canvas')
      expect(overlay).toBeDefined()
    })

    test('should set overlay canvas ID', () => {
      const overlay = manager.createOverlayCanvas()

      expect(overlay.id).toBe('cursorOverlay')
    })

    test('should set correct CSS styles', () => {
      const overlay = manager.createOverlayCanvas()

      expect(overlay.style.position).toBe('absolute')
      expect(overlay.style.top).toBe('0')
      expect(overlay.style.left).toBe('0')
      expect(overlay.style.pointerEvents).toBe('none')
      expect(overlay.style.zIndex).toBe('10')
    })

    test('should append overlay to canvas parent', () => {
      manager.createOverlayCanvas()

      expect(mockCanvas.parentElement.appendChild).toHaveBeenCalled()
    })
  })

  describe('resize()', () => {
    beforeEach(() => {
      manager.setup()
    })

    test('should do nothing if canvas is null', () => {
      manager.canvas = null

      expect(() => manager.resize()).not.toThrow()
    })

    test('should resize main canvas with device pixel ratio', () => {
      window.devicePixelRatio = 2
      window.innerWidth = 800
      window.innerHeight = 600

      manager.resize()

      expect(manager.canvas.width).toBe(1600) // 800 * 2
      expect(manager.canvas.height).toBe(1200) // 600 * 2
      expect(manager.canvas.style.width).toBe('800px')
      expect(manager.canvas.style.height).toBe('600px')
    })

    test('should scale context by device pixel ratio', () => {
      window.devicePixelRatio = 2

      manager.resize()

      expect(mockContext.scale).toHaveBeenCalledWith(2, 2)
    })

    test('should resize overlay canvas', () => {
      window.devicePixelRatio = 2
      window.innerWidth = 800
      window.innerHeight = 600

      manager.resize()

      expect(manager.cursorOverlayCanvas.width).toBe(1600)
      expect(manager.cursorOverlayCanvas.height).toBe(1200)
      expect(manager.cursorOverlayCanvas.style.width).toBe('800px')
      expect(manager.cursorOverlayCanvas.style.height).toBe('600px')
    })

    test('should handle missing overlay canvas gracefully', () => {
      manager.cursorOverlayCanvas = null

      expect(() => manager.resize()).not.toThrow()
    })

    test('should notify resize listeners', () => {
      const notifySpy = jest.spyOn(manager, 'notifyResizeListeners')

      manager.resize()

      expect(notifySpy).toHaveBeenCalled()
    })

    test('should handle devicePixelRatio = 1', () => {
      window.devicePixelRatio = 1
      window.innerWidth = 1024
      window.innerHeight = 768

      manager.resize()

      expect(manager.canvas.width).toBe(1024)
      expect(manager.canvas.height).toBe(768)
    })

    test('should use default devicePixelRatio if not available', () => {
      window.devicePixelRatio = undefined

      manager.resize()

      // Should default to 1
      expect(mockContext.scale).toHaveBeenCalledWith(1, 1)
    })
  })

  describe('addResizeListener()', () => {
    test('should add service with setCanvasSize method', () => {
      const mockService = {
        setCanvasSize: jest.fn()
      }

      manager.addResizeListener(mockService)

      expect(manager.resizeListeners).toContain(mockService)
    })

    test('should not add service without setCanvasSize method', () => {
      const invalidService = {
        someOtherMethod: jest.fn()
      }

      manager.addResizeListener(invalidService)

      expect(manager.resizeListeners).not.toContain(invalidService)
    })

    test('should not add null service', () => {
      manager.addResizeListener(null)

      expect(manager.resizeListeners).toHaveLength(0)
    })

    test('should not add undefined service', () => {
      manager.addResizeListener(undefined)

      expect(manager.resizeListeners).toHaveLength(0)
    })

    test('should add multiple services', () => {
      const service1 = { setCanvasSize: jest.fn() }
      const service2 = { setCanvasSize: jest.fn() }

      manager.addResizeListener(service1)
      manager.addResizeListener(service2)

      expect(manager.resizeListeners).toHaveLength(2)
    })
  })

  describe('notifyResizeListeners()', () => {
    test('should call setCanvasSize on all registered listeners', () => {
      const service1 = { setCanvasSize: jest.fn() }
      const service2 = { setCanvasSize: jest.fn() }

      manager.addResizeListener(service1)
      manager.addResizeListener(service2)

      manager.notifyResizeListeners(1024, 768)

      expect(service1.setCanvasSize).toHaveBeenCalledWith(1024, 768)
      expect(service2.setCanvasSize).toHaveBeenCalledWith(1024, 768)
    })

    test('should handle listener errors gracefully', () => {
      const faultyService = {
        setCanvasSize: jest.fn(() => {
          throw new Error('Service error')
        })
      }
      const goodService = { setCanvasSize: jest.fn() }

      manager.addResizeListener(faultyService)
      manager.addResizeListener(goodService)

      // Should not throw, should continue to notify other services
      expect(() => manager.notifyResizeListeners(1024, 768)).not.toThrow()
      expect(goodService.setCanvasSize).toHaveBeenCalled()
    })

    test('should work with no listeners', () => {
      expect(() => manager.notifyResizeListeners(1024, 768)).not.toThrow()
    })
  })

  describe('getCanvasRefs()', () => {
    test('should return canvas references', () => {
      manager.canvas = mockCanvas
      manager.ctx = mockContext
      manager.cursorOverlayCanvas = mockOverlay

      const refs = manager.getCanvasRefs()

      expect(refs).toEqual({
        canvas: mockCanvas,
        ctx: mockContext,
        cursorOverlayCanvas: mockOverlay
      })
    })

    test('should return null references if not initialized', () => {
      const refs = manager.getCanvasRefs()

      expect(refs.canvas).toBeNull()
      expect(refs.ctx).toBeNull()
      expect(refs.cursorOverlayCanvas).toBeNull()
    })
  })

  describe('getDimensions()', () => {
    test('should return current dimensions', () => {
      window.innerWidth = 1920
      window.innerHeight = 1080
      window.devicePixelRatio = 2

      const dims = manager.getDimensions()

      expect(dims).toEqual({
        width: 3840, // 1920 * 2
        height: 2160, // 1080 * 2
        devicePixelRatio: 2,
        logicalWidth: 1920,
        logicalHeight: 1080
      })
    })

    test('should handle devicePixelRatio = 1', () => {
      window.innerWidth = 1024
      window.innerHeight = 768
      window.devicePixelRatio = 1

      const dims = manager.getDimensions()

      expect(dims.width).toBe(1024)
      expect(dims.height).toBe(768)
      expect(dims.devicePixelRatio).toBe(1)
    })

    test('should use default devicePixelRatio if undefined', () => {
      window.devicePixelRatio = undefined

      const dims = manager.getDimensions()

      expect(dims.devicePixelRatio).toBe(1)
    })
  })

  describe('destroy()', () => {
    beforeEach(() => {
      manager.setup()
    })

    test('should remove resize event listener', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener')

      manager.destroy()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    })

    test('should clear boundResizeHandler', () => {
      manager.destroy()

      expect(manager.boundResizeHandler).toBeNull()
    })

    test('should clear resize listeners array', () => {
      const service = { setCanvasSize: jest.fn() }
      manager.addResizeListener(service)

      manager.destroy()

      expect(manager.resizeListeners).toEqual([])
    })

    test('should clear canvas references', () => {
      manager.destroy()

      expect(manager.canvas).toBeNull()
      expect(manager.ctx).toBeNull()
      expect(manager.cursorOverlayCanvas).toBeNull()
    })

    test('should not throw if called multiple times', () => {
      manager.destroy()

      expect(() => manager.destroy()).not.toThrow()
    })

    test('should not throw if never initialized', () => {
      const uninitializedManager = new CanvasManager()

      expect(() => uninitializedManager.destroy()).not.toThrow()
    })
  })

  describe('Integration Tests', () => {
    test('should handle full lifecycle: setup -> resize -> destroy', () => {
      manager.setup()
      window.simulateResize(800, 600)
      manager.destroy()

      expect(manager.canvas).toBeNull()
    })

    test('should notify listeners on window resize', (done) => {
      manager.setup()

      const mockService = { setCanvasSize: jest.fn() }
      manager.addResizeListener(mockService)

      // Trigger window resize event
      window.dispatchEvent(new Event('resize'))

      // Give event loop time to process
      setTimeout(() => {
        expect(mockService.setCanvasSize).toHaveBeenCalled()
        done()
      }, 10)
    })

    test('should handle high DPI displays correctly', () => {
      window.devicePixelRatio = 3 // Retina or high DPI
      window.innerWidth = 1440
      window.innerHeight = 900

      manager.setup()

      expect(manager.canvas.width).toBe(4320) // 1440 * 3
      expect(manager.canvas.height).toBe(2700) // 900 * 3
      expect(mockContext.scale).toHaveBeenCalledWith(3, 3)
    })
  })

  describe('Module Exports', () => {
    test('should be available as CommonJS module', () => {
      expect(CanvasManager).toBeDefined()
      expect(typeof CanvasManager).toBe('function')
    })

    test('should create instance without errors', () => {
      const instance = new CanvasManager()
      expect(instance).toBeInstanceOf(CanvasManager)
    })
  })
})
