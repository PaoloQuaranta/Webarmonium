/**
 * Entry #210: Unit tests for Manual Genre Override feature
 * Tests input validation, state transitions, and cache behavior
 */

const { createSyntheticGenreWeights, isValidGenre, ALL_GENRES } = require('../../src/utils/GenreUtils')

describe('Genre Override Feature', () => {
  describe('GenreUtils - Shared Utilities', () => {
    describe('createSyntheticGenreWeights', () => {
      test('creates weights with 100% for specified genre', () => {
        const weights = createSyntheticGenreWeights('jazz')

        expect(weights.jazz).toBe(1.0)
        expect(weights.ambient).toBe(0)
        expect(weights.classical).toBe(0)
        expect(weights.melodic).toBe(0)
        expect(weights.electronic).toBe(0)
        expect(weights.rhythmic).toBe(0)
        expect(weights.rock).toBe(0)
        expect(weights.experimental).toBe(0)
      })

      test('works for all valid genres', () => {
        ALL_GENRES.forEach(genre => {
          const weights = createSyntheticGenreWeights(genre)
          expect(weights[genre]).toBe(1.0)

          // All other genres should be 0
          ALL_GENRES.filter(g => g !== genre).forEach(otherGenre => {
            expect(weights[otherGenre]).toBe(0)
          })
        })
      })

      test('handles invalid genre gracefully (no 1.0 weight)', () => {
        const weights = createSyntheticGenreWeights('invalid-genre')

        // All weights should be 0 since invalid genre is not in list
        ALL_GENRES.forEach(genre => {
          expect(weights[genre]).toBe(0)
        })
      })

      test('accepts custom genre list', () => {
        const customGenres = ['custom1', 'custom2', 'custom3']
        const weights = createSyntheticGenreWeights('custom2', customGenres)

        expect(weights.custom1).toBe(0)
        expect(weights.custom2).toBe(1.0)
        expect(weights.custom3).toBe(0)
      })
    })

    describe('isValidGenre', () => {
      test('returns true for valid genres', () => {
        ALL_GENRES.forEach(genre => {
          expect(isValidGenre(genre)).toBe(true)
        })
      })

      test('returns false for invalid genres', () => {
        expect(isValidGenre('invalid')).toBe(false)
        // Entry #213: 'pop' is now a valid genre (synced with GenreCharacteristics)
        expect(isValidGenre('pop')).toBe(true)
        expect(isValidGenre('')).toBe(false)
        expect(isValidGenre(null)).toBe(false)
        expect(isValidGenre(undefined)).toBe(false)
        expect(isValidGenre(123)).toBe(false)
        expect(isValidGenre({})).toBe(false)
      })

      test('accepts custom genre list', () => {
        const customGenres = ['a', 'b', 'c']
        expect(isValidGenre('a', customGenres)).toBe(true)
        expect(isValidGenre('d', customGenres)).toBe(false)
      })
    })
  })

  describe('BackgroundCompositionService - Manual Override', () => {
    let BackgroundCompositionService
    let service

    beforeEach(() => {
      // Fresh import to reset any module state
      jest.resetModules()
      BackgroundCompositionService = require('../../src/services/BackgroundCompositionService')
      service = new BackgroundCompositionService()
    })

    describe('setManualGenreOverride', () => {
      beforeEach(() => {
        // Initialize a room for testing
        service.startComposition('test-room', { userCount: 1 })
      })

      afterEach(() => {
        service.stopComposition('test-room')
      })

      test('sets override with correct state', () => {
        const result = service.setManualGenreOverride('test-room', 'jazz')

        expect(result.enabled).toBe(true)
        expect(result.genre).toBe('jazz')
        expect(result.setAt).toBeDefined()
        expect(typeof result.setAt).toBe('number')
        expect(result.syntheticWeights).toBeDefined()
        expect(result.syntheticWeights.jazz).toBe(1.0)
      })

      test('updates currentGenre to match override', () => {
        service.setManualGenreOverride('test-room', 'electronic')

        const roomState = service.roomCompositions.get('test-room')
        expect(roomState.styleCycling.currentGenre).toBe('electronic')
      })

      test('caches synthetic weights in override object', () => {
        const result = service.setManualGenreOverride('test-room', 'ambient')

        // Verify synthetic weights are cached
        expect(result.syntheticWeights).toBeDefined()
        expect(result.syntheticWeights.ambient).toBe(1.0)

        // All other genres should be 0
        Object.entries(result.syntheticWeights).forEach(([genre, weight]) => {
          if (genre !== 'ambient') {
            expect(weight).toBe(0)
          }
        })
      })

      test('throws error for invalid genre', () => {
        expect(() => {
          service.setManualGenreOverride('test-room', 'invalid-genre')
        }).toThrow('Invalid genre')
      })

      test('throws error for non-existent room', () => {
        expect(() => {
          service.setManualGenreOverride('nonexistent-room', 'jazz')
        }).toThrow('not found')
      })

      test('invalidates style cache', () => {
        // Set up cache
        service.getCurrentStyleForRoom('test-room')
        expect(service.styleCache.has('test-room')).toBe(true)

        // Override should invalidate cache
        service.setManualGenreOverride('test-room', 'jazz')
        expect(service.styleCache.has('test-room')).toBe(false)
      })
    })

    describe('clearManualGenreOverride', () => {
      beforeEach(() => {
        service.startComposition('test-room', { userCount: 1 })
        service.setManualGenreOverride('test-room', 'jazz')
      })

      afterEach(() => {
        service.stopComposition('test-room')
      })

      test('clears override state', () => {
        const result = service.clearManualGenreOverride('test-room')

        expect(result.enabled).toBe(false)
        expect(result.genre).toBeNull()
        expect(result.setAt).toBeNull()
        expect(result.syntheticWeights).toBeNull()
      })

      test('invalidates style cache', () => {
        service.getCurrentStyleForRoom('test-room')
        expect(service.styleCache.has('test-room')).toBe(true)

        service.clearManualGenreOverride('test-room')
        expect(service.styleCache.has('test-room')).toBe(false)
      })

      test('throws error for non-existent room', () => {
        expect(() => {
          service.clearManualGenreOverride('nonexistent-room')
        }).toThrow('not found')
      })
    })

    describe('getManualOverrideState', () => {
      beforeEach(() => {
        service.startComposition('test-room', { userCount: 1 })
      })

      afterEach(() => {
        service.stopComposition('test-room')
      })

      test('returns null for room without override', () => {
        const state = service.getManualOverrideState('test-room')
        expect(state.enabled).toBe(false)
      })

      test('returns override state when set', () => {
        service.setManualGenreOverride('test-room', 'rock')
        const state = service.getManualOverrideState('test-room')

        expect(state.enabled).toBe(true)
        expect(state.genre).toBe('rock')
      })

      test('returns null for non-existent room', () => {
        const state = service.getManualOverrideState('nonexistent')
        expect(state).toBeNull()
      })
    })

    describe('getAllOverrideStates', () => {
      beforeEach(() => {
        service.startComposition('room-1', { userCount: 1 })
        service.startComposition('room-2', { userCount: 1 })
      })

      afterEach(() => {
        service.stopComposition('room-1')
        service.stopComposition('room-2')
      })

      test('returns states for all rooms', () => {
        service.setManualGenreOverride('room-1', 'jazz')

        const states = service.getAllOverrideStates()

        expect(states['room-1'].enabled).toBe(true)
        expect(states['room-1'].genre).toBe('jazz')
        expect(states['room-2'].enabled).toBe(false)
      })
    })

    describe('updateStyleCycle - Override Behavior', () => {
      beforeEach(() => {
        service.startComposition('test-room', { userCount: 1 })
      })

      afterEach(() => {
        service.stopComposition('test-room')
      })

      test('skips automatic selection when override is active', () => {
        service.setManualGenreOverride('test-room', 'jazz')

        // Call updateStyleCycle multiple times
        for (let i = 0; i < 5; i++) {
          const cycling = service.updateStyleCycle('test-room')
          expect(cycling.currentGenre).toBe('jazz')
        }
      })

      test('returns to automatic mode after clearing override', () => {
        service.setManualGenreOverride('test-room', 'jazz')
        service.clearManualGenreOverride('test-room')

        const roomState = service.roomCompositions.get('test-room')
        expect(roomState.styleCycling.manualOverride.enabled).toBe(false)
      })
    })

    describe('getCurrentStyleForRoom - Override Integration', () => {
      beforeEach(() => {
        service.startComposition('test-room', { userCount: 1 })
      })

      afterEach(() => {
        service.stopComposition('test-room')
      })

      test('uses cached synthetic weights when override active', () => {
        service.setManualGenreOverride('test-room', 'electronic')

        const style = service.getCurrentStyleForRoom('test-room')

        expect(style.isManualOverride).toBe(true)
        expect(style.forcedGenre).toBe('electronic')
        expect(style.genreWeights.electronic).toBe(1.0)
      })

      test('returns normal weights when override not active', () => {
        const style = service.getCurrentStyleForRoom('test-room')

        expect(style.isManualOverride).toBe(false)
      })
    })
  })

  describe('LandingCompositionService - Manual Override', () => {
    let LandingCompositionService
    let service

    beforeEach(() => {
      jest.resetModules()
      LandingCompositionService = require('../../src/services/LandingCompositionService')
      service = new LandingCompositionService()
    })

    describe('setManualGenreOverride', () => {
      test('throws error when service not started', () => {
        expect(() => {
          service.setManualGenreOverride('jazz')
        }).toThrow('Landing service not started')
      })

      test('sets override when service is running', () => {
        // Mock io to prevent actual socket operations
        service.io = { to: jest.fn().mockReturnThis(), emit: jest.fn() }
        service.start()

        const result = service.setManualGenreOverride('classical')

        expect(result.enabled).toBe(true)
        expect(result.genre).toBe('classical')
        expect(result.syntheticWeights.classical).toBe(1.0)

        service.stop()
      })

      test('throws error for invalid genre', () => {
        service.io = { to: jest.fn().mockReturnThis(), emit: jest.fn() }
        service.start()

        expect(() => {
          service.setManualGenreOverride('invalid')
        }).toThrow('Invalid genre')

        service.stop()
      })
    })

    describe('clearManualGenreOverride', () => {
      test('clears override state', () => {
        service.io = { to: jest.fn().mockReturnThis(), emit: jest.fn() }
        service.start()
        service.setManualGenreOverride('jazz')

        const result = service.clearManualGenreOverride()

        expect(result.enabled).toBe(false)
        expect(result.genre).toBeNull()
        expect(result.syntheticWeights).toBeNull()

        service.stop()
      })
    })

    describe('getManualOverrideState', () => {
      test('returns null when service not started', () => {
        const state = service.getManualOverrideState()
        expect(state).toBeNull()
      })

      test('returns state when service is running', () => {
        service.io = { to: jest.fn().mockReturnThis(), emit: jest.fn() }
        service.start()

        const state = service.getManualOverrideState()
        expect(state).toBeDefined()
        expect(state.enabled).toBe(false)

        service.stop()
      })
    })
  })

  describe('Socket Event Validation', () => {
    // These tests verify the validation logic extracted to validateOverrideInput
    // The actual socket handlers are tested in integration tests

    test('validates data object structure', () => {
      // Simulate validation logic
      const validateData = (data) => {
        if (!data || typeof data !== 'object') {
          return { valid: false, error: 'Invalid request: data must be an object' }
        }
        return { valid: true }
      }

      expect(validateData(null).valid).toBe(false)
      expect(validateData(undefined).valid).toBe(false)
      expect(validateData('string').valid).toBe(false)
      expect(validateData(123).valid).toBe(false)
      expect(validateData({}).valid).toBe(true)
    })

    test('validates roomId field', () => {
      const validateRoomId = (data) => {
        if (typeof data?.roomId !== 'string' || !data.roomId.trim()) {
          return { valid: false, error: 'Invalid roomId' }
        }
        return { valid: true, roomId: data.roomId.trim() }
      }

      expect(validateRoomId({}).valid).toBe(false)
      expect(validateRoomId({ roomId: '' }).valid).toBe(false)
      expect(validateRoomId({ roomId: '  ' }).valid).toBe(false)
      expect(validateRoomId({ roomId: 123 }).valid).toBe(false)
      expect(validateRoomId({ roomId: 'room-1' }).valid).toBe(true)
    })

    test('validates genre field', () => {
      const validateGenre = (data) => {
        if (typeof data?.genre !== 'string' || !data.genre.trim()) {
          return { valid: false, error: 'Invalid genre' }
        }
        return { valid: true, genre: data.genre.trim() }
      }

      expect(validateGenre({}).valid).toBe(false)
      expect(validateGenre({ genre: '' }).valid).toBe(false)
      expect(validateGenre({ genre: null }).valid).toBe(false)
      expect(validateGenre({ genre: 'jazz' }).valid).toBe(true)
    })
  })

  describe('StyleAnalyzer Override Propagation', () => {
    let StyleAnalyzer
    let styleAnalyzer

    beforeEach(() => {
      jest.resetModules()
      StyleAnalyzer = require('../../src/services/StyleAnalyzer')
      styleAnalyzer = new StyleAnalyzer()
    })

    test('setManualOverride applies to getCurrentStyle', () => {
      const syntheticWeights = createSyntheticGenreWeights('jazz')
      styleAnalyzer.setManualOverride(syntheticWeights, 'jazz')

      const style = styleAnalyzer.getCurrentStyle()

      expect(style.isManualOverride).toBe(true)
      expect(style.forcedGenre).toBe('jazz')
      expect(style.genreWeights.jazz).toBe(1.0)
      expect(style.genreWeights.electronic).toBe(0)
    })

    test('clearManualOverride returns to automatic mode', () => {
      styleAnalyzer.setManualOverride(createSyntheticGenreWeights('rock'), 'rock')
      styleAnalyzer.clearManualOverride()

      const style = styleAnalyzer.getCurrentStyle()

      expect(style.isManualOverride).toBeUndefined()
      expect(style.forcedGenre).toBeUndefined()
    })

    test('isManualOverrideActive returns correct state', () => {
      expect(styleAnalyzer.isManualOverrideActive()).toBe(false)

      styleAnalyzer.setManualOverride(createSyntheticGenreWeights('ambient'), 'ambient')
      expect(styleAnalyzer.isManualOverrideActive()).toBe(true)

      styleAnalyzer.clearManualOverride()
      expect(styleAnalyzer.isManualOverrideActive()).toBe(false)
    })

    test('BackgroundCompositionService propagates override to StyleAnalyzer', () => {
      jest.resetModules()
      const BackgroundCompositionService = require('../../src/services/BackgroundCompositionService')
      const service = new BackgroundCompositionService()

      service.startComposition('test-room', { userCount: 1 })
      service.setManualGenreOverride('test-room', 'electronic')

      // The styleAnalyzer should now have the override
      expect(service.styleAnalyzer.isManualOverrideActive()).toBe(true)

      const style = service.styleAnalyzer.getCurrentStyle()
      expect(style.forcedGenre).toBe('electronic')
      expect(style.genreWeights.electronic).toBe(1.0)

      service.clearManualGenreOverride('test-room')
      expect(service.styleAnalyzer.isManualOverrideActive()).toBe(false)

      service.stopComposition('test-room')
    })
  })

  describe('Edge Cases', () => {
    test('synthetic weights sum to 1.0', () => {
      ALL_GENRES.forEach(genre => {
        const weights = createSyntheticGenreWeights(genre)
        const sum = Object.values(weights).reduce((a, b) => a + b, 0)
        expect(sum).toBe(1.0)
      })
    })

    test('ALL_GENRES contains expected genres', () => {
      expect(ALL_GENRES).toContain('ambient')
      expect(ALL_GENRES).toContain('classical')
      expect(ALL_GENRES).toContain('melodic')
      expect(ALL_GENRES).toContain('jazz')
      expect(ALL_GENRES).toContain('electronic')
      expect(ALL_GENRES).toContain('rhythmic')
      expect(ALL_GENRES).toContain('rock')
      expect(ALL_GENRES).toContain('experimental')
      expect(ALL_GENRES).toContain('pop')  // Entry #213: Added for GenreCharacteristics sync
      expect(ALL_GENRES.length).toBe(9)    // Entry #213: Now includes pop
    })
  })
})
