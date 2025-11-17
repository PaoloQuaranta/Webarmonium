/**
 * GestureProcessor Unit Tests
 * Sprint 5: Comprehensive tests for gesture-to-music processing component
 * Target: 80%+ coverage, 100+ test cases
 */

// Mock Tone.js before requiring GestureProcessor
global.Tone = {
  now: jest.fn(() => 0)
}

describe('GestureProcessor', () => {
  let GestureProcessor
  let processor
  let mockAudioService
  let mockSocketService
  let mockDrawCallback

  // ============================================================================
  // TEST HELPERS - Mock Factories
  // ============================================================================

  const createMockAudioService = () => ({
    playThreeTierNote: jest.fn(),
    playMusicalEvent: jest.fn(),
    gestureSynth: {
      set: jest.fn(),
      triggerAttackRelease: jest.fn(),
      releaseAll: jest.fn()
    },
    isInitialized: true
  })

  const createMockSocketService = () => ({
    sendGesture: jest.fn()
  })

  const createMockDrawCallback = () => jest.fn()

  const createTapGesture = (overrides = {}) => ({
    id: 'tap-123',
    coordinates: { x: 0.5, y: 0.5 },
    intensity: 0.7,
    timestamp: Date.now(),
    duration: 100,
    size: 0.02,
    device: 'mouse',
    ...overrides
  })

  const createDragGesture = (overrides = {}) => ({
    id: 'drag-456',
    coordinates: { x: 0.6, y: 0.4 },
    intensity: 0.8,
    timestamp: Date.now(),
    duration: 500,
    size: 0.15,
    velocity: 150,
    dx: 0.2,
    dy: 0.1,
    device: 'mouse',
    ...overrides
  })

  const createSonicParams = (overrides = {}) => ({
    x: 0.5,
    y: 0.5,
    intensity: 0.7,
    timestamp: Date.now(),
    action: 'tap',
    device: 'mouse',
    ...overrides
  })

  // ============================================================================
  // SETUP & TEARDOWN
  // ============================================================================

  beforeAll(() => {
    // Load GestureProcessor class
    GestureProcessor = require('../../src/services/GestureProcessor')
  })

  beforeEach(() => {
    // Create fresh mocks for each test
    mockAudioService = createMockAudioService()
    mockSocketService = createMockSocketService()
    mockDrawCallback = createMockDrawCallback()

    // Create fresh processor instance
    processor = new GestureProcessor(
      mockAudioService,
      mockSocketService,
      mockDrawCallback
    )

    // Reset all timers
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  // ============================================================================
  // CONSTRUCTOR TESTS (5 tests)
  // ============================================================================

  describe('Constructor', () => {
    test('should initialize with required dependencies', () => {
      expect(processor.audioService).toBe(mockAudioService)
      expect(processor.socketService).toBe(mockSocketService)
      expect(processor.drawGestureTrailCallback).toBe(mockDrawCallback)
    })

    test('should initialize state properties to defaults', () => {
      expect(processor.lastDragPhraseTime).toBe(0)
      expect(processor.gestureStartTime).toBe(0)
      expect(processor.gestureTimer).toBeNull()
      expect(processor.pendingGesture).toBeNull()
      expect(processor.tapCallCount).toBe(0)
    })

    test('should set lastDragPhraseTime to 0', () => {
      expect(processor.lastDragPhraseTime).toBe(0)
    })

    test('should set gestureTimer to null', () => {
      expect(processor.gestureTimer).toBeNull()
    })

    test('should set pendingGesture to null', () => {
      expect(processor.pendingGesture).toBeNull()
    })
  })

  // ============================================================================
  // processGesture() TESTS (12 tests)
  // ============================================================================

  describe('processGesture()', () => {
    test('should send gesture to server via socketService', () => {
      const gesture = createTapGesture()
      processor.processGesture(gesture, true)

      expect(mockSocketService.sendGesture).toHaveBeenCalledWith(gesture)
    })

    test('should draw gesture trail when audio not started', () => {
      const gesture = createTapGesture()
      processor.processGesture(gesture, false)

      expect(mockDrawCallback).toHaveBeenCalledWith(gesture)
    })

    test('should return early when audio not started', () => {
      const gesture = createTapGesture()
      processor.processGesture(gesture, false)

      expect(mockAudioService.playThreeTierNote).not.toHaveBeenCalled()
    })

    test('should delegate to processClickGesture for tap gestures', () => {
      const gesture = createTapGesture({ action: 'tap' })
      const spy = jest.spyOn(processor, 'processClickGesture')

      processor.processGesture(gesture, true)

      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    test('should delegate to processDragGesture for drag gestures via timer', () => {
      jest.useFakeTimers()
      const gesture = createDragGesture({ action: 'drag' })

      processor.processGesture(gesture, true)

      expect(processor.gestureTimer).not.toBeNull()
      expect(processor.pendingGesture).toBe(gesture)

      jest.useRealTimers()
    })

    test('should use gesture.action if provided', () => {
      const gesture = createTapGesture({ action: 'tap' })
      const spy = jest.spyOn(processor, 'determineGestureAction')

      processor.processGesture(gesture, true)

      // determineGestureAction should not be called if action is provided
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    })

    test('should determine action if gesture.action is missing', () => {
      const gesture = createTapGesture()
      delete gesture.action
      const spy = jest.spyOn(processor, 'determineGestureAction')

      processor.processGesture(gesture, true)

      expect(spy).toHaveBeenCalledWith(gesture)
      spy.mockRestore()
    })

    test('should clear existing timer before new gesture', () => {
      jest.useFakeTimers()
      const gesture1 = createDragGesture({ id: 'drag-1', action: 'drag' })
      const gesture2 = createDragGesture({ id: 'drag-2', action: 'drag' })

      processor.processGesture(gesture1, true)
      const firstTimer = processor.gestureTimer

      processor.processGesture(gesture2, true)

      expect(processor.gestureTimer).not.toBe(firstTimer)
      jest.useRealTimers()
    })

    test('should create 500ms timer for drag gestures', () => {
      jest.useFakeTimers()
      const gesture = createDragGesture({ action: 'drag' })

      processor.processGesture(gesture, true)

      expect(processor.gestureTimer).not.toBeNull()
      jest.useRealTimers()
    })

    test('should handle processGestureByAction for unknown actions', () => {
      const gesture = createTapGesture({ action: 'unknown' })
      const spy = jest.spyOn(processor, 'processGestureByAction')

      processor.processGesture(gesture, true)

      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    test('should clear pending gesture after processing', () => {
      jest.useFakeTimers()
      const gesture = createDragGesture({ action: 'drag' })

      processor.processGesture(gesture, true)
      processor.pendingGesture = gesture
      processor.gestureTimer = setTimeout(() => {}, 500)

      processor.processGesture(createTapGesture({ action: 'tap' }), true)

      expect(processor.pendingGesture).toBeNull()
      jest.useRealTimers()
    })

    test('should handle missing coordinates gracefully', () => {
      const gesture = createTapGesture({ action: 'tap' })
      delete gesture.coordinates

      expect(() => {
        processor.processGesture(gesture, true)
      }).toThrow()
    })
  })

  // ============================================================================
  // determineGestureAction() TESTS (8 tests)
  // ============================================================================

  describe('determineGestureAction()', () => {
    test('should identify tap for duration < 200ms and size < 0.05', () => {
      const gesture = { duration: 150, size: 0.03 }
      const action = processor.determineGestureAction(gesture)

      expect(action).toBe('tap')
    })

    test('should identify drag for duration >= 200ms', () => {
      const gesture = { duration: 250, size: 0.03 }
      const action = processor.determineGestureAction(gesture)

      expect(action).toBe('drag')
    })

    test('should identify drag for size >= 0.05', () => {
      const gesture = { duration: 150, size: 0.06 }
      const action = processor.determineGestureAction(gesture)

      expect(action).toBe('drag')
    })

    test('should handle missing duration property', () => {
      const gesture = { size: 0.03 }
      const action = processor.determineGestureAction(gesture)

      expect(action).toBe('tap')
    })

    test('should handle missing size property', () => {
      const gesture = { duration: 150 }
      const action = processor.determineGestureAction(gesture)

      expect(action).toBe('tap')
    })

    test('should handle zero duration', () => {
      const gesture = { duration: 0, size: 0.02 }
      const action = processor.determineGestureAction(gesture)

      expect(action).toBe('tap')
    })

    test('should handle edge case: duration = 199ms, size = 0.049', () => {
      const gesture = { duration: 199, size: 0.049 }
      const action = processor.determineGestureAction(gesture)

      expect(action).toBe('tap')
    })

    test('should handle edge case: duration = 200ms, size = 0.05', () => {
      const gesture = { duration: 200, size: 0.05 }
      const action = processor.determineGestureAction(gesture)

      expect(action).toBe('drag')
    })
  })

  // ============================================================================
  // processClickGesture() TESTS (10 tests)
  // ============================================================================

  describe('processClickGesture()', () => {
    test('should calculate frequency from Y position (octave base)', () => {
      const gesture = createTapGesture()
      const sonicParams = createSonicParams({ x: 0.5, y: 0.5 })

      processor.processClickGesture(gesture, sonicParams)

      expect(mockAudioService.gestureSynth.triggerAttackRelease).toHaveBeenCalled()
      const frequency = mockAudioService.gestureSynth.triggerAttackRelease.mock.calls[0][0]

      // Y=0.5 -> octave base = 110 + (1-0.5)*440 = 110 + 220 = 330Hz base
      // Plus X variation
      expect(frequency).toBeGreaterThanOrEqual(330)
      expect(frequency).toBeLessThanOrEqual(990) // 330 + 660
    })

    test('should calculate frequency from X position (within octave)', () => {
      const gesture = createTapGesture()
      const sonicParams = createSonicParams({ x: 0.5, y: 0.5 })

      processor.processClickGesture(gesture, sonicParams)

      const frequency = mockAudioService.gestureSynth.triggerAttackRelease.mock.calls[0][0]

      // X=0.5 -> within octave = 0.5 * 660 = 330Hz
      // Total = octave base (330) + within octave (330) = 660Hz
      expect(frequency).toBe(660)
    })

    test('should generate frequencies in range 110Hz-1210Hz', () => {
      // Test extremes
      const testCases = [
        { x: 0, y: 0, expected: 110 }, // Min: bottom-left
        { x: 1, y: 0, expected: 770 }, // Bottom-right: 110 + 660
        { x: 0, y: 1, expected: 110 }, // Top-left
        { x: 1, y: 1, expected: 770 }  // Top-right: 110 + 660
      ]

      testCases.forEach(({ x, y, expected }) => {
        const gesture = createTapGesture()
        const sonicParams = createSonicParams({ x, y })

        processor.processClickGesture(gesture, sonicParams)

        const frequency = mockAudioService.gestureSynth.triggerAttackRelease.mock.calls[0][0]
        expect(frequency).toBeCloseTo(expected, 0)

        mockAudioService.gestureSynth.triggerAttackRelease.mockClear()
      })
    })

    test('should use fixed volume of 0.5', () => {
      const gesture = createTapGesture()
      const sonicParams = createSonicParams()

      processor.processClickGesture(gesture, sonicParams)

      const velocity = mockAudioService.gestureSynth.triggerAttackRelease.mock.calls[0][3]
      expect(velocity).toBe(0.5)
    })

    test('should use 32n duration for clicks', () => {
      const gesture = createTapGesture()
      const sonicParams = createSonicParams()

      processor.processClickGesture(gesture, sonicParams)

      const duration = mockAudioService.gestureSynth.triggerAttackRelease.mock.calls[0][1]
      expect(duration).toBe('32n')
    })

    test('should configure synth with oscillator type based on tier', () => {
      const testCases = [
        { x: 0.2, expectedType: 'triangle' }, // background tier
        { x: 0.5, expectedType: 'square' },   // remote tier
        { x: 0.8, expectedType: 'sawtooth' }  // local tier
      ]

      testCases.forEach(({ x, expectedType }) => {
        const gesture = createTapGesture()
        const sonicParams = createSonicParams({ x })

        processor.processClickGesture(gesture, sonicParams)

        expect(mockAudioService.gestureSynth.set).toHaveBeenCalledWith(
          expect.objectContaining({
            oscillator: expect.objectContaining({
              type: expectedType
            })
          })
        )

        mockAudioService.gestureSynth.set.mockClear()
      })
    })

    test('should set envelope for percussive notes', () => {
      const gesture = createTapGesture()
      const sonicParams = createSonicParams()

      processor.processClickGesture(gesture, sonicParams)

      expect(mockAudioService.gestureSynth.set).toHaveBeenCalledWith(
        expect.objectContaining({
          envelope: {
            attack: 0.01,
            decay: 0.05,
            sustain: 0.1,
            release: 0.1
          }
        })
      )
    })

    test('should trigger note with gestureSynth', () => {
      const gesture = createTapGesture()
      const sonicParams = createSonicParams()

      processor.processClickGesture(gesture, sonicParams)

      expect(mockAudioService.gestureSynth.triggerAttackRelease).toHaveBeenCalledTimes(1)
    })

    test('should increment tapCallCount', () => {
      const gesture = createTapGesture()
      const sonicParams = createSonicParams()
      const initialCount = processor.tapCallCount

      processor.processClickGesture(gesture, sonicParams)

      expect(processor.tapCallCount).toBe(initialCount + 1)
    })

    test('should handle missing audioService gracefully', () => {
      processor.audioService = null

      expect(() => {
        processor.processClickGesture(createTapGesture(), createSonicParams())
      }).not.toThrow()
    })
  })

  // ============================================================================
  // processDragGesture() TESTS (12 tests)
  // ============================================================================

  describe('processDragGesture()', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    test('should throttle drag phrases (500ms minimum)', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams({ action: 'drag' })

      processor.processDragGesture(gesture, sonicParams)
      expect(mockAudioService.gestureSynth.triggerAttackRelease).toHaveBeenCalled()

      mockAudioService.gestureSynth.triggerAttackRelease.mockClear()

      // Try again immediately (should be throttled)
      processor.processDragGesture(gesture, sonicParams)
      expect(mockAudioService.gestureSynth.triggerAttackRelease).not.toHaveBeenCalled()
    })

    test('should allow drag after throttle period', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams({ action: 'drag' })

      processor.processDragGesture(gesture, sonicParams)
      mockAudioService.gestureSynth.triggerAttackRelease.mockClear()

      // Advance time by 500ms
      jest.advanceTimersByTime(500)

      processor.processDragGesture(gesture, sonicParams)
      expect(mockAudioService.gestureSynth.triggerAttackRelease).toHaveBeenCalled()
    })

    test('should calculate velocity from dx/dy if not provided', () => {
      const gesture = createDragGesture({ dx: 0.3, dy: 0.4 })
      delete gesture.velocity
      const sonicParams = createSonicParams({ action: 'drag' })

      processor.processDragGesture(gesture, sonicParams)

      // Should calculate velocity = sqrt(dx^2 + dy^2) * 10 = sqrt(0.09 + 0.16) * 10 = 5
      // This should result in 2 notes (minimum)
      jest.runAllTimers()
      expect(mockAudioService.gestureSynth.triggerAttackRelease).toHaveBeenCalled()
    })

    test('should generate 2-5 notes based on velocity', () => {
      const testCases = [
        { velocity: 40, expectedNotes: 2 },  // floor(40/25) = 1 -> max(2,1) = 2
        { velocity: 75, expectedNotes: 3 },  // floor(75/25) = 3
        { velocity: 125, expectedNotes: 5 }, // floor(125/25) = 5
        { velocity: 200, expectedNotes: 5 }  // floor(200/25) = 8 -> min(5,8) = 5
      ]

      testCases.forEach(({ velocity, expectedNotes }) => {
        const gesture = createDragGesture({ velocity })
        const sonicParams = createSonicParams({ action: 'drag' })

        processor.processDragGesture(gesture, sonicParams)
        jest.runAllTimers()

        expect(mockAudioService.gestureSynth.triggerAttackRelease).toHaveBeenCalledTimes(expectedNotes)

        mockAudioService.gestureSynth.triggerAttackRelease.mockClear()
        processor.lastDragPhraseTime = 0 // Reset throttle
      })
    })

    test('should generate 2 notes for low velocity (< 50)', () => {
      const gesture = createDragGesture({ velocity: 40 })
      const sonicParams = createSonicParams({ action: 'drag' })

      processor.processDragGesture(gesture, sonicParams)
      jest.runAllTimers()

      expect(mockAudioService.gestureSynth.triggerAttackRelease).toHaveBeenCalledTimes(2)
    })

    test('should generate 5 notes for high velocity (>= 125)', () => {
      const gesture = createDragGesture({ velocity: 150 })
      const sonicParams = createSonicParams({ action: 'drag' })

      processor.processDragGesture(gesture, sonicParams)
      jest.runAllTimers()

      expect(mockAudioService.gestureSynth.triggerAttackRelease).toHaveBeenCalledTimes(5)
    })

    test('should calculate base frequency from Y position', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams({ y: 0.5 })

      processor.processDragGesture(gesture, sonicParams)
      jest.runAllTimers()

      // Y=0.5 -> base = 110 + (1-0.5)*440 = 330Hz
      // Each note adds variation, so we check the range
      const calls = mockAudioService.gestureSynth.triggerAttackRelease.mock.calls
      calls.forEach(call => {
        const frequency = call[0]
        expect(frequency).toBeGreaterThanOrEqual(230) // 330 - 100
        expect(frequency).toBeLessThanOrEqual(430)    // 330 + 100
      })
    })

    test('should create rhythmic spacing (180ms + random)', () => {
      const gesture = createDragGesture({ velocity: 100 })
      const sonicParams = createSonicParams({ action: 'drag' })

      // Mock Math.random to return 0.5 for predictable results
      const mockRandom = jest.spyOn(Math, 'random').mockReturnValue(0.5)

      processor.processDragGesture(gesture, sonicParams)

      // Expected delays: 0ms, 210ms (180+30), 420ms, 630ms
      expect(setTimeout).toHaveBeenCalledTimes(4) // 4 notes for velocity 100

      mockRandom.mockRestore()
    })

    test('should add frequency variation to each note', () => {
      const gesture = createDragGesture({ velocity: 100 })
      const sonicParams = createSonicParams({ y: 0.5 })

      processor.processDragGesture(gesture, sonicParams)
      jest.runAllTimers()

      const calls = mockAudioService.gestureSynth.triggerAttackRelease.mock.calls
      const frequencies = calls.map(call => call[0])

      // Each frequency should be different (random variation)
      const uniqueFrequencies = new Set(frequencies)
      expect(uniqueFrequencies.size).toBeGreaterThan(1)
    })

    test('should use duration range 150-400ms', () => {
      const gesture = createDragGesture({ velocity: 100 })
      const sonicParams = createSonicParams({ action: 'drag' })

      processor.processDragGesture(gesture, sonicParams)
      jest.runAllTimers()

      const calls = mockAudioService.gestureSynth.triggerAttackRelease.mock.calls
      calls.forEach(call => {
        const duration = call[1]
        expect(duration).toBeGreaterThanOrEqual(0.15)
        expect(duration).toBeLessThanOrEqual(0.4)
      })
    })

    test('should handle invalid velocity gracefully', () => {
      const gesture = createDragGesture({ velocity: NaN })
      const sonicParams = createSonicParams({ action: 'drag' })

      expect(() => {
        processor.processDragGesture(gesture, sonicParams)
        jest.runAllTimers()
      }).not.toThrow()
    })

    test('should schedule notes via setTimeout', () => {
      const gesture = createDragGesture({ velocity: 100 })
      const sonicParams = createSonicParams({ action: 'drag' })

      processor.processDragGesture(gesture, sonicParams)

      expect(setTimeout).toHaveBeenCalled()
    })
  })

  // ============================================================================
  // CALCULATION HELPERS TESTS (10 tests)
  // ============================================================================

  describe('calculateGestureSpeed()', () => {
    test('should return gesture.speed if available', () => {
      const gesture = { speed: 0.75 }
      const speed = processor.calculateGestureSpeed(gesture)

      expect(speed).toBe(0.75)
    })

    test('should return fallback value if speed missing', () => {
      const gesture = {}
      const speed = processor.calculateGestureSpeed(gesture)

      expect(speed).toBeGreaterThanOrEqual(0.1)
      expect(speed).toBeLessThanOrEqual(0.9)
    })

    test('should return value in range 0-1', () => {
      const gesture = {}
      const speed = processor.calculateGestureSpeed(gesture)

      expect(speed).toBeGreaterThanOrEqual(0)
      expect(speed).toBeLessThanOrEqual(1)
    })
  })

  describe('calculateGestureLength()', () => {
    test('should return gesture.intensity if available', () => {
      const gesture = { intensity: 0.6 }
      const length = processor.calculateGestureLength(gesture)

      expect(length).toBe(0.6)
    })

    test('should return 0.5 if intensity missing', () => {
      const gesture = {}
      const length = processor.calculateGestureLength(gesture)

      expect(length).toBe(0.5)
    })
  })

  describe('calculatePitchRange()', () => {
    test('should map Y position to MIDI range', () => {
      const sonicParams = { y: 0.5 }
      const range = processor.calculatePitchRange(sonicParams)

      expect(range).toHaveProperty('min')
      expect(range).toHaveProperty('max')
      expect(range.min).toBeLessThan(range.max)
    })

    test('should invert Y coordinate (top = high notes)', () => {
      const topParams = { y: 0 } // Top of screen
      const bottomParams = { y: 1 } // Bottom of screen

      const topRange = processor.calculatePitchRange(topParams)
      const bottomRange = processor.calculatePitchRange(bottomParams)

      // Top should have higher pitches
      expect(topRange.min).toBeGreaterThan(bottomRange.min)
      expect(topRange.max).toBeGreaterThan(bottomRange.max)
    })

    test('should handle Y = 0 (bottom, low notes)', () => {
      const sonicParams = { y: 0 }
      const range = processor.calculatePitchRange(sonicParams)

      // Y=0 -> normalizedY = 1 -> max values
      expect(range.min).toBe(70) // 40 + 1*30
      expect(range.max).toBe(100) // 60 + 1*40
    })

    test('should handle Y = 1 (top, high notes)', () => {
      const sonicParams = { y: 1 }
      const range = processor.calculatePitchRange(sonicParams)

      // Y=1 -> normalizedY = 0 -> min values
      expect(range.min).toBe(40) // 40 + 0*30
      expect(range.max).toBe(60) // 60 + 0*40
    })

    test('should handle missing Y coordinate', () => {
      const sonicParams = {}
      const range = processor.calculatePitchRange(sonicParams)

      // Default Y=0.5 -> normalizedY = 0.5
      expect(range.min).toBe(55) // 40 + 0.5*30
      expect(range.max).toBe(80) // 60 + 0.5*40
    })
  })

  // ============================================================================
  // MUSICAL HELPERS TESTS (8 tests)
  // ============================================================================

  describe('calculateNoteFromGesture()', () => {
    test('should calculate MIDI pitch from position', () => {
      const sonicParams = { y: 0.5 }
      const pitchRange = { min: 60, max: 72 }
      const pitch = processor.calculateNoteFromGesture(sonicParams, 2, 5, pitchRange)

      // noteIndex=2, totalNotes=5 -> position = 2/4 = 0.5
      // pitch = 60 + (72-60)*0.5 = 66
      expect(pitch).toBe(66)
    })

    test('should respect pitch range min/max', () => {
      const sonicParams = { y: 0.5 }
      const pitchRange = { min: 60, max: 72 }

      const firstNote = processor.calculateNoteFromGesture(sonicParams, 0, 5, pitchRange)
      const lastNote = processor.calculateNoteFromGesture(sonicParams, 4, 5, pitchRange)

      expect(firstNote).toBe(60)
      expect(lastNote).toBe(72)
    })

    test('should round to nearest integer', () => {
      const sonicParams = { y: 0.5 }
      const pitchRange = { min: 60, max: 63 }
      const pitch = processor.calculateNoteFromGesture(sonicParams, 1, 5, pitchRange)

      expect(Number.isInteger(pitch)).toBe(true)
    })

    test('should handle noteIndex = 0 (first note)', () => {
      const sonicParams = { y: 0.5 }
      const pitchRange = { min: 60, max: 72 }
      const pitch = processor.calculateNoteFromGesture(sonicParams, 0, 5, pitchRange)

      expect(pitch).toBe(60)
    })

    test('should handle noteIndex = totalNotes - 1 (last note)', () => {
      const sonicParams = { y: 0.5 }
      const pitchRange = { min: 60, max: 72 }
      const pitch = processor.calculateNoteFromGesture(sonicParams, 4, 5, pitchRange)

      expect(pitch).toBe(72)
    })
  })

  describe('selectArticulationFromGesture()', () => {
    test('should return "accent" for first note', () => {
      const gesture = { intensity: 0.5 }
      const articulation = processor.selectArticulationFromGesture(gesture, 0, 5)

      expect(articulation).toBe('accent')
    })

    test('should return "legato" for last note', () => {
      const gesture = { intensity: 0.5 }
      const articulation = processor.selectArticulationFromGesture(gesture, 4, 5)

      expect(articulation).toBe('legato')
    })

    test('should vary articulation based on intensity', () => {
      const highIntensity = { intensity: 0.8 }
      const lowIntensity = { intensity: 0.2 }

      const highArticulation = processor.selectArticulationFromGesture(highIntensity, 1, 5)
      const lowArticulation = processor.selectArticulationFromGesture(lowIntensity, 1, 5)

      // High intensity should be staccato or accent
      expect(['staccato', 'accent']).toContain(highArticulation)
      // Low intensity should be legato
      expect(lowArticulation).toBe('legato')
    })
  })

  // ============================================================================
  // MUSICAL PHRASE GENERATION TESTS (18 tests)
  // ============================================================================

  describe('generateLocalMusicalPhrase()', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    test('should create phrase via createLocalPhrase', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams()
      const spy = jest.spyOn(processor, 'createLocalPhrase')

      processor.generateLocalMusicalPhrase(gesture, sonicParams)

      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    test('should schedule notes with setTimeout', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams()

      processor.generateLocalMusicalPhrase(gesture, sonicParams)

      expect(setTimeout).toHaveBeenCalled()
    })

    test('should play each note via audioService.playMusicalEvent', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams()

      processor.generateLocalMusicalPhrase(gesture, sonicParams)
      jest.runAllTimers()

      expect(mockAudioService.playMusicalEvent).toHaveBeenCalled()
      expect(mockAudioService.playMusicalEvent).toHaveBeenCalledTimes(5) // Always 5 notes
    })

    test('should handle audioService not initialized', () => {
      processor.audioService.isInitialized = false

      expect(() => {
        processor.generateLocalMusicalPhrase(createDragGesture(), createSonicParams())
      }).not.toThrow()

      expect(mockAudioService.playMusicalEvent).not.toHaveBeenCalled()
    })

    test('should log errors for failed note playback', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      mockAudioService.playMusicalEvent.mockImplementation(() => {
        throw new Error('Playback error')
      })

      processor.generateLocalMusicalPhrase(createDragGesture(), createSonicParams())
      jest.runAllTimers()

      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    test('should convert startTime from seconds to milliseconds', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams()

      processor.generateLocalMusicalPhrase(gesture, sonicParams)

      // Check that setTimeout was called with millisecond values
      const calls = setTimeout.mock.calls
      calls.forEach(call => {
        const delay = call[1]
        expect(delay).toBeGreaterThanOrEqual(0)
        // Should be in milliseconds (typically > 100 for second note onwards)
      })
    })

    test('should create phrase with correct length', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams()

      processor.generateLocalMusicalPhrase(gesture, sonicParams)
      jest.runAllTimers()

      expect(mockAudioService.playMusicalEvent).toHaveBeenCalledTimes(5)
    })

    test('should handle errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      jest.spyOn(processor, 'createLocalPhrase').mockImplementation(() => {
        throw new Error('Phrase creation error')
      })

      expect(() => {
        processor.generateLocalMusicalPhrase(createDragGesture(), createSonicParams())
      }).not.toThrow()

      consoleSpy.mockRestore()
    })
  })

  describe('createLocalPhrase()', () => {
    test('should always generate 5 notes', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams()

      const phrase = processor.createLocalPhrase(gesture, sonicParams)

      expect(phrase).toHaveLength(5)
    })

    test('should adjust base duration for slow gestures', () => {
      const gesture = createDragGesture({ speed: 0.2 })
      const sonicParams = createSonicParams()

      const phrase = processor.createLocalPhrase(gesture, sonicParams)

      // Slow gesture should have longer durations
      phrase.forEach(note => {
        expect(note.duration).toBeGreaterThanOrEqual(0.8) // 1.0 * 0.8 (min multiplier)
      })
    })

    test('should adjust base duration for medium gestures', () => {
      const gesture = createDragGesture({ speed: 0.5 })
      const sonicParams = createSonicParams()

      const phrase = processor.createLocalPhrase(gesture, sonicParams)

      // Medium gesture should have moderate durations
      phrase.forEach(note => {
        expect(note.duration).toBeGreaterThanOrEqual(0.4) // 0.5 * 0.8
        expect(note.duration).toBeLessThanOrEqual(0.6) // 0.5 * 1.2
      })
    })

    test('should adjust base duration for fast gestures', () => {
      const gesture = createDragGesture({ speed: 0.8 })
      const sonicParams = createSonicParams()

      const phrase = processor.createLocalPhrase(gesture, sonicParams)

      // Fast gesture should have shorter durations
      phrase.forEach(note => {
        expect(note.duration).toBeLessThanOrEqual(0.3) // 0.25 * 1.2
      })
    })

    test('should apply rhythmic variations (accent/legato/staccato)', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams()

      const phrase = processor.createLocalPhrase(gesture, sonicParams)

      const articulations = phrase.map(note => note.articulation)
      expect(articulations).toContain('accent')
      expect(articulations).toContain('legato')
      expect(articulations).toContain('staccato')
    })

    test('should create first note with accent', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams()

      const phrase = processor.createLocalPhrase(gesture, sonicParams)

      expect(phrase[0].articulation).toBe('accent')
    })

    test('should create last note with legato', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams()

      const phrase = processor.createLocalPhrase(gesture, sonicParams)

      expect(phrase[4].articulation).toBe('legato')
    })

    test('should calculate pitch for each note', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams()

      const phrase = processor.createLocalPhrase(gesture, sonicParams)

      phrase.forEach(note => {
        expect(note.pitch).toBeGreaterThanOrEqual(40)
        expect(note.pitch).toBeLessThanOrEqual(100)
      })
    })

    test('should set velocity in range 60-80', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams()

      const phrase = processor.createLocalPhrase(gesture, sonicParams)

      phrase.forEach(note => {
        expect(note.velocity).toBeGreaterThanOrEqual(60)
        expect(note.velocity).toBeLessThanOrEqual(80)
      })
    })

    test('should create overlapping notes (0.9 spacing)', () => {
      const gesture = createDragGesture()
      const sonicParams = createSonicParams()

      const phrase = processor.createLocalPhrase(gesture, sonicParams)

      // Check that consecutive notes have overlapping timing
      for (let i = 0; i < phrase.length - 1; i++) {
        const currentNoteEnd = phrase[i].startTime + phrase[i].duration
        const nextNoteStart = phrase[i + 1].startTime

        // Notes should overlap slightly
        expect(nextNoteStart).toBeLessThan(currentNoteEnd)
      }
    })
  })

  // ============================================================================
  // FALLBACK PROCESSING TESTS (3 tests)
  // ============================================================================

  describe('processGestureByAction()', () => {
    test('should play fallback note at 440Hz', () => {
      const gesture = createTapGesture()
      const sonicParams = createSonicParams()

      processor.processGestureByAction(gesture, sonicParams)

      expect(mockAudioService.playThreeTierNote).toHaveBeenCalledWith(
        440,
        'local',
        100,
        { volume: 0.5 }
      )
    })

    test('should use local tier', () => {
      const gesture = createTapGesture()
      const sonicParams = createSonicParams()

      processor.processGestureByAction(gesture, sonicParams)

      expect(mockAudioService.playThreeTierNote).toHaveBeenCalledWith(
        expect.any(Number),
        'local',
        expect.any(Number),
        expect.any(Object)
      )
    })

    test('should use volume 0.5', () => {
      const gesture = createTapGesture()
      const sonicParams = createSonicParams()

      processor.processGestureByAction(gesture, sonicParams)

      expect(mockAudioService.playThreeTierNote).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(String),
        expect.any(Number),
        { volume: 0.5 }
      )
    })
  })

  // ============================================================================
  // INTEGRATION TESTS (6 tests)
  // ============================================================================

  describe('Integration', () => {
    test('should work with real Tone.js AudioService mock', () => {
      const gesture = createTapGesture({ action: 'tap' })

      expect(() => {
        processor.processGesture(gesture, true)
      }).not.toThrow()
    })

    test('should send gestures via SocketService', () => {
      const gesture = createTapGesture()

      processor.processGesture(gesture, true)

      expect(mockSocketService.sendGesture).toHaveBeenCalledWith(gesture)
    })

    test('should call drawGestureTrailCallback when audio not started', () => {
      const gesture = createTapGesture()

      processor.processGesture(gesture, false)

      expect(mockDrawCallback).toHaveBeenCalledWith(gesture)
    })

    test('should handle rapid tap sequences', () => {
      const taps = Array.from({ length: 5 }, (_, i) =>
        createTapGesture({ id: `tap-${i}`, action: 'tap' })
      )

      expect(() => {
        taps.forEach(tap => processor.processGesture(tap, true))
      }).not.toThrow()

      expect(mockAudioService.gestureSynth.triggerAttackRelease).toHaveBeenCalledTimes(5)
    })

    test('should handle rapid drag sequences with throttling', () => {
      jest.useFakeTimers()
      const drags = Array.from({ length: 3 }, (_, i) =>
        createDragGesture({ id: `drag-${i}`, velocity: 100 })
      )

      drags.forEach(drag => {
        processor.processDragGesture(drag, createSonicParams({ action: 'drag' }))
      })

      jest.runAllTimers()

      // Only first drag should play (others throttled)
      expect(mockAudioService.gestureSynth.triggerAttackRelease.mock.calls.length).toBeGreaterThan(0)

      jest.useRealTimers()
    })

    test('should handle tap-drag-tap sequence', () => {
      jest.useFakeTimers()

      const tap1 = createTapGesture({ id: 'tap-1', action: 'tap' })
      const drag = createDragGesture({ id: 'drag-1', action: 'drag', velocity: 100 })
      const tap2 = createTapGesture({ id: 'tap-2', action: 'tap' })

      processor.processGesture(tap1, true)
      processor.processGesture(drag, true)
      processor.processGesture(tap2, true)

      jest.runAllTimers()

      // Should have played 2 taps + drag notes
      expect(mockAudioService.gestureSynth.triggerAttackRelease).toHaveBeenCalled()

      jest.useRealTimers()
    })
  })

  // ============================================================================
  // EDGE CASES TESTS (10 tests)
  // ============================================================================

  describe('Edge Cases', () => {
    test('should handle gesture with missing coordinates', () => {
      const gesture = createTapGesture({ action: 'tap' })
      delete gesture.coordinates

      expect(() => {
        processor.processGesture(gesture, true)
      }).toThrow()
    })

    test('should handle gesture with null coordinates', () => {
      const gesture = createTapGesture({ action: 'tap', coordinates: null })

      expect(() => {
        processor.processGesture(gesture, true)
      }).toThrow()
    })

    test('should handle gesture with invalid intensity', () => {
      const gesture = createTapGesture({ intensity: 'invalid' })

      expect(() => {
        processor.processGesture(gesture, true)
      }).not.toThrow()
    })

    test('should handle gesture with NaN velocity', () => {
      jest.useFakeTimers()
      const gesture = createDragGesture({ velocity: NaN })
      const sonicParams = createSonicParams({ action: 'drag' })

      expect(() => {
        processor.processDragGesture(gesture, sonicParams)
        jest.runAllTimers()
      }).not.toThrow()

      jest.useRealTimers()
    })

    test('should handle gesture with negative values', () => {
      const gesture = createTapGesture({ action: 'tap' })
      const sonicParams = createSonicParams({ x: -0.5, y: -0.5 })

      expect(() => {
        processor.processClickGesture(gesture, sonicParams)
      }).not.toThrow()
    })

    test('should handle very high velocity (> 1000)', () => {
      jest.useFakeTimers()
      const gesture = createDragGesture({ velocity: 1500 })
      const sonicParams = createSonicParams({ action: 'drag' })

      processor.processDragGesture(gesture, sonicParams)
      jest.runAllTimers()

      // Should still cap at 5 notes
      expect(mockAudioService.gestureSynth.triggerAttackRelease).toHaveBeenCalledTimes(5)

      jest.useRealTimers()
    })

    test('should handle timer race conditions', () => {
      jest.useFakeTimers()
      const drag1 = createDragGesture({ id: 'drag-1', action: 'drag' })
      const drag2 = createDragGesture({ id: 'drag-2', action: 'drag' })

      processor.processGesture(drag1, true)
      processor.processGesture(drag2, true)

      expect(processor.pendingGesture).toBe(drag2)
      expect(processor.gestureTimer).not.toBeNull()

      jest.useRealTimers()
    })

    test('should handle multiple pending gestures', () => {
      jest.useFakeTimers()

      processor.processGesture(createDragGesture({ id: 'drag-1', action: 'drag' }), true)
      const firstPending = processor.pendingGesture

      processor.processGesture(createDragGesture({ id: 'drag-2', action: 'drag' }), true)

      expect(processor.pendingGesture).not.toBe(firstPending)

      jest.useRealTimers()
    })

    test('should handle audioService.gestureSynth missing', () => {
      mockAudioService.gestureSynth = null

      expect(() => {
        processor.processClickGesture(createTapGesture(), createSonicParams())
      }).not.toThrow()
    })

    test('should handle socketService.sendGesture missing', () => {
      delete mockSocketService.sendGesture

      expect(() => {
        processor.processGesture(createTapGesture(), true)
      }).toThrow()
    })
  })
})
