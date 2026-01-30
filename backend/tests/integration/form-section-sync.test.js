/**
 * Entry #224: Form/Section Synchronization Tests
 *
 * Tests for synchronization between CompositionEngine and SectionStateManager.
 * Ensures that form changes and section transitions are properly propagated.
 */

const { getSectionStateManager, resetSectionStateManager } = require('../../src/services/SectionStateManager')
const CompositionEngine = require('../../src/services/CompositionEngine')
const MaterialLibrary = require('../../src/services/MaterialLibrary')
const StyleAnalyzer = require('../../src/services/StyleAnalyzer')
const HarmonicEngine = require('../../src/services/HarmonicEngine')

describe('Entry #224: Form/Section Synchronization', () => {
  let ssm
  let engine
  let materialLib
  let styleAnalyzer
  let harmonicEngine

  beforeEach(() => {
    // Reset singleton and create fresh instances
    resetSectionStateManager()
    ssm = getSectionStateManager()
    materialLib = new MaterialLibrary()
    styleAnalyzer = new StyleAnalyzer()
    harmonicEngine = new HarmonicEngine()
    engine = new CompositionEngine(materialLib, styleAnalyzer, harmonicEngine)
  })

  afterEach(() => {
    // Clean up
    ssm.stopCleanup()
    resetSectionStateManager()
  })

  describe('formChanged flag', () => {
    test('should be true on first composition (form initialization)', () => {
      ssm.initializeState('test-room', 'ABA')

      const sectionContext = ssm.updateProgress('test-room')
      const composition = engine.compose({
        roomId: 'test-room',
        compositionCount: 1,
        sectionContext
      })

      expect(composition.structure).toBeDefined()
      expect(composition.structure.formChanged).toBe(true)
      expect(composition.structure.form).toBeDefined()
      expect(typeof composition.structure.form).toBe('string')
    })

    test('should be false on subsequent compositions (same form)', () => {
      ssm.initializeState('test-room', 'ABA')

      // First composition initializes form
      const context1 = ssm.updateProgress('test-room')
      engine.compose({
        roomId: 'test-room',
        compositionCount: 1,
        sectionContext: context1
      })

      // Second composition should not change form
      const context2 = ssm.updateProgress('test-room')
      const composition2 = engine.compose({
        roomId: 'test-room',
        compositionCount: 2,
        sectionContext: context2
      })

      expect(composition2.structure.formChanged).toBe(false)
    })

    test('should trigger SectionStateManager.changeForm when synced', () => {
      ssm.initializeState('test-room', 'ABA')

      const sectionContext = ssm.updateProgress('test-room')
      const composition = engine.compose({
        roomId: 'test-room',
        compositionCount: 1,
        sectionContext
      })

      // Simulate BackgroundCompositionService sync logic
      if (composition.structure.formChanged && composition.structure.form) {
        ssm.changeForm('test-room', composition.structure.form)
      }

      // Verify SSM now has the same form as CompositionEngine
      const ssmState = ssm.getState('test-room')
      expect(ssmState.formType).toBe(composition.structure.form)
    })
  })

  describe('sectionChanged flag', () => {
    test('should be false when section does not advance', () => {
      ssm.initializeState('test-room', 'ABA')

      // First composition
      const context1 = ssm.updateProgress('test-room')
      const composition1 = engine.compose({
        roomId: 'test-room',
        compositionCount: 1,
        sectionContext: context1
      })

      // sectionChanged should be false (only 1 composition, need 3 to advance)
      expect(composition1.structure.sectionChanged).toBe(false)
    })

    test('should be true after minCompositionsPerSection (3) compositions', () => {
      ssm.initializeState('test-room', 'ABA')

      let lastComposition
      for (let i = 1; i <= 3; i++) {
        const context = ssm.updateProgress('test-room')
        lastComposition = engine.compose({
          roomId: 'test-room',
          compositionCount: i,
          sectionContext: context
        })

        // Sync form if changed
        if (lastComposition.structure.formChanged && lastComposition.structure.form) {
          ssm.changeForm('test-room', lastComposition.structure.form)
        }
      }

      // Third composition should trigger section change
      expect(lastComposition.structure.sectionChanged).toBe(true)
    })

    test('should trigger SectionStateManager.transitionSection when synced', () => {
      ssm.initializeState('test-room', 'ABA')

      let lastComposition
      for (let i = 1; i <= 3; i++) {
        const context = ssm.updateProgress('test-room')
        lastComposition = engine.compose({
          roomId: 'test-room',
          compositionCount: i,
          sectionContext: context
        })

        // Simulate BackgroundCompositionService sync logic
        if (lastComposition.structure.formChanged && lastComposition.structure.form) {
          ssm.changeForm('test-room', lastComposition.structure.form)
        } else if (lastComposition.structure.sectionChanged) {
          ssm.transitionSection('test-room', {
            sectionType: lastComposition.structure.nextSection
          })
        }
      }

      // Verify SSM section matches CompositionEngine's nextSection
      const ssmState = ssm.getState('test-room')
      expect(ssmState.sectionType).toBe(lastComposition.structure.nextSection)
    })
  })

  describe('mutual exclusivity', () => {
    test('formChanged takes precedence over sectionChanged', () => {
      ssm.initializeState('test-room', 'ABA')

      // First composition has formChanged=true
      const context1 = ssm.updateProgress('test-room')
      const composition1 = engine.compose({
        roomId: 'test-room',
        compositionCount: 1,
        sectionContext: context1
      })

      expect(composition1.structure.formChanged).toBe(true)
      // When form changes, section is reset, so sectionChanged should be false
      expect(composition1.structure.sectionChanged).toBe(false)
    })

    test('sync logic handles form change first, ignores section change', () => {
      ssm.initializeState('test-room', 'ABA')

      // Mock a composition with both flags (edge case)
      const mockComposition = {
        structure: {
          formChanged: true,
          sectionChanged: true, // Should be ignored
          form: 'sonata',
          nextSection: 'verse' // Should be ignored
        }
      }

      // Simulate the sync logic priority
      let formSynced = false
      let sectionSynced = false

      if (mockComposition.structure.formChanged && mockComposition.structure.form) {
        ssm.changeForm('test-room', mockComposition.structure.form)
        formSynced = true
      } else if (mockComposition.structure.sectionChanged) {
        ssm.transitionSection('test-room', {
          sectionType: mockComposition.structure.nextSection
        })
        sectionSynced = true
      }

      expect(formSynced).toBe(true)
      expect(sectionSynced).toBe(false)
    })
  })

  describe('validation and error handling', () => {
    test('should handle invalid form values gracefully', () => {
      ssm.initializeState('test-room', 'ABA')

      const mockComposition = {
        structure: {
          formChanged: true,
          form: null // Invalid
        }
      }

      // Sync should not throw, should skip
      expect(() => {
        if (mockComposition.structure.formChanged) {
          const newForm = mockComposition.structure.form
          if (newForm && typeof newForm === 'string') {
            ssm.changeForm('test-room', newForm)
          }
          // Else: skip (invalid form)
        }
      }).not.toThrow()

      // SSM should still have original form
      const ssmState = ssm.getState('test-room')
      expect(ssmState.formType).toBe('ABA')
    })

    test('should handle invalid section values gracefully', () => {
      ssm.initializeState('test-room', 'ABA')

      const mockComposition = {
        structure: {
          formChanged: false,
          sectionChanged: true,
          nextSection: undefined // Invalid
        }
      }

      // Sync should not throw, should skip
      expect(() => {
        if (!mockComposition.structure.formChanged && mockComposition.structure.sectionChanged) {
          const nextSection = mockComposition.structure.nextSection
          if (nextSection && typeof nextSection === 'string') {
            ssm.transitionSection('test-room', { sectionType: nextSection })
          }
          // Else: skip (invalid section)
        }
      }).not.toThrow()

      // SSM should still have original section
      const ssmState = ssm.getState('test-room')
      expect(ssmState.sectionType).toBe('A')
    })

    test('should handle missing structure gracefully', () => {
      const mockComposition = {
        type: 'ambient',
        content: {},
        metadata: {}
        // structure is missing
      }

      // Should not throw when accessing optional structure
      expect(() => {
        const formChanged = mockComposition.structure?.formChanged
        const sectionChanged = mockComposition.structure?.sectionChanged
        expect(formChanged).toBeUndefined()
        expect(sectionChanged).toBeUndefined()
      }).not.toThrow()
    })
  })

  describe('synchronization across multiple compositions', () => {
    test('should maintain sync through full form cycle', () => {
      ssm.initializeState('test-room', 'ABA')

      const syncStates = []

      // Run 10 compositions to see form and section changes
      for (let i = 1; i <= 10; i++) {
        const context = ssm.updateProgress('test-room')
        const composition = engine.compose({
          roomId: 'test-room',
          compositionCount: i,
          sectionContext: context
        })

        // Simulate BackgroundCompositionService sync logic
        if (composition.structure.formChanged && composition.structure.form) {
          ssm.changeForm('test-room', composition.structure.form)
        } else if (composition.structure.sectionChanged) {
          ssm.transitionSection('test-room', {
            sectionType: composition.structure.nextSection
          })
        }

        const ssmState = ssm.getState('test-room')
        syncStates.push({
          comp: i,
          engineForm: composition.structure.form,
          engineSection: composition.structure.currentSection,
          ssmForm: ssmState.formType,
          ssmSection: ssmState.sectionType,
          formChanged: composition.structure.formChanged,
          sectionChanged: composition.structure.sectionChanged
        })
      }

      // Verify form is always in sync
      syncStates.forEach(state => {
        expect(state.ssmForm).toBe(state.engineForm)
      })

      // Verify at least one section change occurred
      const sectionChanges = syncStates.filter(s => s.sectionChanged)
      expect(sectionChanges.length).toBeGreaterThan(0)
    })

    test('should correctly sync sections after form change', () => {
      ssm.initializeState('test-room', 'ABA')

      // First composition triggers form change
      const context1 = ssm.updateProgress('test-room')
      const composition1 = engine.compose({
        roomId: 'test-room',
        compositionCount: 1,
        sectionContext: context1
      })

      expect(composition1.structure.formChanged).toBe(true)

      // Sync form
      ssm.changeForm('test-room', composition1.structure.form)

      // After form change, SSM section should match engine's first section
      const ssmState = ssm.getState('test-room')
      expect(ssmState.sectionType).toBe(composition1.structure.currentSection)
    })
  })

  describe('composition structure contract', () => {
    test('should always include required structure fields', () => {
      ssm.initializeState('test-room', 'ABA')

      const context = ssm.updateProgress('test-room')
      const composition = engine.compose({
        roomId: 'test-room',
        compositionCount: 1,
        sectionContext: context
      })

      // Required structure fields
      expect(composition.structure).toBeDefined()
      expect(composition.structure.form).toBeDefined()
      expect(composition.structure.currentSection).toBeDefined()
      expect(composition.structure.nextSection).toBeDefined()
      expect(composition.structure.compositionsInSection).toBeDefined()
      expect(composition.structure.sectionHistory).toBeDefined()
      expect(composition.structure.formChanged).toBeDefined()
      expect(composition.structure.sectionChanged).toBeDefined()

      // Type checks
      expect(typeof composition.structure.form).toBe('string')
      expect(typeof composition.structure.currentSection).toBe('string')
      expect(typeof composition.structure.nextSection).toBe('string')
      expect(typeof composition.structure.compositionsInSection).toBe('number')
      expect(Array.isArray(composition.structure.sectionHistory)).toBe(true)
      expect(typeof composition.structure.formChanged).toBe('boolean')
      expect(typeof composition.structure.sectionChanged).toBe('boolean')
    })
  })
})
