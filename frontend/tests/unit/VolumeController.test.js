/**
 * Unit Tests for VolumeController
 * Sprint 3: Testing extracted component from Sprint 2
 * Target Coverage: 90%+
 */

const VolumeController = require('../../src/services/VolumeController.js')

describe('VolumeController', () => {
  let controller
  let mockMasterVolume

  // Helper to create a mock Tone.js Volume node
  const createMockVolumeNode = () => ({
    mute: false,
    volume: {
      value: 0,
      rampTo: jest.fn()
    }
  })

  beforeEach(() => {
    // Reset mocks before each test
    mockMasterVolume = createMockVolumeNode()
    controller = new VolumeController()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Constructor', () => {
    test('should initialize with default values', () => {
      expect(controller.volume).toBe(0.7) // Default 70%
      expect(controller.muted).toBe(false)
      expect(controller.masterVolume).toBeNull()
    })

    test('should accept masterVolume in constructor', () => {
      const controllerWithVolume = new VolumeController(mockMasterVolume)
      expect(controllerWithVolume.masterVolume).toBe(mockMasterVolume)
    })
  })

  describe('setMasterVolumeNode()', () => {
    test('should set the master volume node', () => {
      controller.setMasterVolumeNode(mockMasterVolume)
      expect(controller.masterVolume).toBe(mockMasterVolume)
    })

    test('should apply current settings when node is set', () => {
      controller.volume = 0.5
      controller.muted = true
      controller.setMasterVolumeNode(mockMasterVolume)

      // Should apply mute state
      expect(mockMasterVolume.mute).toBe(true)

      // Should apply volume (0.5 → -30dB)
      expect(mockMasterVolume.volume.rampTo).toHaveBeenCalledWith(-30, 0.1)
    })

    test('should handle null master volume gracefully', () => {
      controller.setMasterVolumeNode(null)
      expect(controller.masterVolume).toBeNull()
    })
  })

  describe('setMuted()', () => {
    beforeEach(() => {
      controller.setMasterVolumeNode(mockMasterVolume)
    })

    test('should set muted to true', () => {
      controller.setMuted(true)
      expect(controller.muted).toBe(true)
      expect(mockMasterVolume.mute).toBe(true)
    })

    test('should set muted to false', () => {
      controller.muted = true
      controller.setMuted(false)
      expect(controller.muted).toBe(false)
      expect(mockMasterVolume.mute).toBe(false)
    })

    test('should coerce truthy values to boolean', () => {
      controller.setMuted('yes')
      expect(controller.muted).toBe(true)

      controller.setMuted(1)
      expect(controller.muted).toBe(true)

      controller.setMuted(0)
      expect(controller.muted).toBe(false)
    })

    test('should work even without master volume node', () => {
      const noNodeController = new VolumeController()
      expect(() => noNodeController.setMuted(true)).not.toThrow()
      expect(noNodeController.muted).toBe(true)
    })
  })

  describe('setVolume()', () => {
    beforeEach(() => {
      controller.setMasterVolumeNode(mockMasterVolume)
    })

    test('should set volume to valid value', () => {
      controller.setVolume(0.5)
      expect(controller.volume).toBe(0.5)
    })

    test('should convert volume to dB correctly', () => {
      // Volume 1.0 → 0dB
      controller.setVolume(1.0)
      expect(mockMasterVolume.volume.rampTo).toHaveBeenCalledWith(0, 0.1)

      // Volume 0.5 → -30dB
      controller.setVolume(0.5)
      expect(mockMasterVolume.volume.rampTo).toHaveBeenCalledWith(-30, 0.1)

      // Volume 0.0 → -Infinity
      controller.setVolume(0.0)
      expect(mockMasterVolume.volume.rampTo).toHaveBeenCalledWith(-Infinity, 0.1)
    })

    test('should clamp volume to 0-1 range', () => {
      // Above 1.0 clamped to 1.0
      controller.setVolume(1.5)
      expect(controller.volume).toBe(1.0)

      // Below 0.0 clamped to 0.0
      controller.setVolume(-0.5)
      expect(controller.volume).toBe(0.0)
    })

    test('should handle invalid input gracefully', () => {
      controller.setVolume('invalid')
      expect(controller.volume).toBe(0) // Defaults to 0

      controller.setVolume(undefined)
      expect(controller.volume).toBe(0)

      controller.setVolume(null)
      expect(controller.volume).toBe(0)
    })

    test('should work even without master volume node', () => {
      const noNodeController = new VolumeController()
      expect(() => noNodeController.setVolume(0.5)).not.toThrow()
      expect(noNodeController.volume).toBe(0.5)
    })

    test('should apply smooth ramp transition (100ms)', () => {
      controller.setVolume(0.8)
      expect(mockMasterVolume.volume.rampTo).toHaveBeenCalledWith(
        expect.any(Number),
        0.1 // 100ms ramp time
      )
    })
  })

  describe('isMuted()', () => {
    test('should return current mute state', () => {
      expect(controller.isMuted()).toBe(false)

      controller.muted = true
      expect(controller.isMuted()).toBe(true)
    })
  })

  describe('getVolume()', () => {
    test('should return current volume', () => {
      expect(controller.getVolume()).toBe(0.7) // Default

      controller.volume = 0.5
      expect(controller.getVolume()).toBe(0.5)
    })
  })

  describe('getState()', () => {
    test('should return complete state object', () => {
      controller.volume = 0.5
      controller.muted = true

      const state = controller.getState()

      expect(state).toEqual({
        volume: 0.5,
        muted: true,
        volumePercent: 50,
        volumeDb: -30
      })
    })

    test('should calculate volumePercent correctly', () => {
      controller.volume = 0.75
      expect(controller.getState().volumePercent).toBe(75)

      controller.volume = 1.0
      expect(controller.getState().volumePercent).toBe(100)

      controller.volume = 0.0
      expect(controller.getState().volumePercent).toBe(0)
    })

    test('should calculate volumeDb correctly', () => {
      controller.volume = 1.0
      expect(controller.getState().volumeDb).toBe(0)

      controller.volume = 0.5
      expect(controller.getState().volumeDb).toBe(-30)

      controller.volume = 0.0
      expect(controller.getState().volumeDb).toBe(-Infinity)
    })
  })

  describe('Edge Cases', () => {
    test('should handle rapid volume changes', () => {
      controller.setMasterVolumeNode(mockMasterVolume)

      controller.setVolume(0.1)
      controller.setVolume(0.9)
      controller.setVolume(0.5)

      expect(controller.volume).toBe(0.5)
      expect(mockMasterVolume.volume.rampTo).toHaveBeenCalledTimes(3)
    })

    test('should handle rapid mute toggles', () => {
      controller.setMasterVolumeNode(mockMasterVolume)

      controller.setMuted(true)
      controller.setMuted(false)
      controller.setMuted(true)

      expect(controller.muted).toBe(true)
      expect(mockMasterVolume.mute).toBe(true)
    })

    test('should maintain state consistency when master volume is set late', () => {
      // Set volume and mute BEFORE master volume node
      controller.setVolume(0.3)
      controller.setMuted(true)

      // Now set master volume node
      controller.setMasterVolumeNode(mockMasterVolume)

      // Should have applied the pre-set values
      expect(mockMasterVolume.mute).toBe(true)
      expect(mockMasterVolume.volume.rampTo).toHaveBeenCalled()
    })

    test('should handle volume=0 edge case correctly', () => {
      controller.setMasterVolumeNode(mockMasterVolume)
      controller.setVolume(0)

      // Volume 0 should result in -Infinity dB
      expect(mockMasterVolume.volume.rampTo).toHaveBeenCalledWith(-Infinity, 0.1)

      const state = controller.getState()
      expect(state.volumeDb).toBe(-Infinity)
      expect(state.volumePercent).toBe(0)
    })

    test('should handle volume=1 edge case correctly', () => {
      controller.setMasterVolumeNode(mockMasterVolume)
      controller.setVolume(1)

      // Volume 1 should result in 0dB (maximum)
      expect(mockMasterVolume.volume.rampTo).toHaveBeenCalledWith(0, 0.1)

      const state = controller.getState()
      expect(state.volumeDb).toBe(0)
      expect(state.volumePercent).toBe(100)
    })
  })

  describe('Integration with Tone.js', () => {
    test('should work with real Tone.js-like volume node', () => {
      const realisticVolume = {
        mute: false,
        volume: {
          value: -10,
          rampTo: jest.fn()
        }
      }

      controller.setMasterVolumeNode(realisticVolume)
      controller.setVolume(0.7)
      controller.setMuted(false)

      expect(realisticVolume.mute).toBe(false)
      expect(realisticVolume.volume.rampTo).toHaveBeenCalled()
    })
  })

  describe('Module Exports', () => {
    test('should be available as CommonJS module', () => {
      expect(VolumeController).toBeDefined()
      expect(typeof VolumeController).toBe('function')
    })

    test('should create instance without errors', () => {
      const instance = new VolumeController()
      expect(instance).toBeInstanceOf(VolumeController)
    })
  })
})
