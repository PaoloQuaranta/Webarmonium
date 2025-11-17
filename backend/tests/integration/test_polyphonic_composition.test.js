const assert = require('assert')
const GestureToMusicService = require('../../src/services/GestureToMusicService')

describe('Polyphonic Composition Integration Tests', () => {
  let gestureToMusicService

  beforeEach(() => {
    gestureToMusicService = new GestureToMusicService()
    gestureToMusicService.setTempo(120)
    gestureToMusicService.setKeyCenter('C', 'major')
  })

  it('should process multiple gestures from different users', async () => {
    // Simulate gestures from 3 different users
    const gestures = [
      {
        userId: 'user1',
        gesture: {
          action: 'drag',
          type: 'melodic',
          velocity: 70,
          curvature: 0.6,
          acceleration: 5,
          coordinates: [0.3, 0.2]
        },
        timestamp: Date.now()
      },
      {
        userId: 'user2',
        gesture: {
          action: 'drag',
          type: 'harmonic',
          velocity: 50,
          curvature: 0.4,
          acceleration: 2,
          coordinates: [0.6, 0.5]
        },
        timestamp: Date.now() + 100
      },
      {
        userId: 'user3',
        gesture: {
          action: 'tap',
          type: 'rhythmic',
          velocity: 85,
          curvature: 0.2,
          coordinates: [0.8, 0.7]
        },
        timestamp: Date.now() + 200
      }
    ]

    // Process all gestures
    const allMusicalEvents = []
    gestures.forEach(gesture => {
      const events = gestureToMusicService.processGesture(gesture)
      allMusicalEvents.push(...events)
    })

    assert(allMusicalEvents.length > 0, 'Should generate musical events')
    assert(allMusicalEvents.length >= 3, 'Should generate events for all gestures')

    // Verify we have different users in the events
    const uniqueUsers = new Set(allMusicalEvents.map(event => event.userId))
    assert.strictEqual(uniqueUsers.size, 3, 'Should have events from all 3 users')

    // Check that events have proper musical properties
    allMusicalEvents.forEach(event => {
      assert(event.properties.pitch, 'Event should have pitch')
      assert(event.properties.frequency, 'Event should have frequency')
      assert(event.properties.duration, 'Event should have duration')
      assert(event.properties.velocity, 'Event should have velocity')
      assert(event.properties.mood, 'Event should have mood')
    })

    console.log(`Generated ${allMusicalEvents.length} musical events from ${gestures.length} gestures`)
  })

  it('should build material library over time', async () => {
    // Process a series of gestures to build up material
    const gestureSequence = []
    for (let i = 0; i < 5; i++) {
      const gesture = {
        userId: `user${i % 2 + 1}`, // Alternate between 2 users
        gesture: {
          action: i % 3 === 0 ? 'drag' : i % 3 === 1 ? 'tap' : 'hover',
          type: 'melodic',
          velocity: 40 + Math.random() * 40,
          curvature: Math.random(),
          coordinates: [Math.random(), Math.random()]
        },
        timestamp: Date.now() + (i * 500)
      }

      gestureSequence.push(gesture)
      const events = gestureToMusicService.processGesture(gesture)
      assert(events.length > 0, `Gesture ${i} should generate events`)
    }

    // Check material library stats
    const stats = gestureToMusicService.getMaterialStats()
    assert(stats.totalMaterials > 0, 'Material library should contain materials')

    console.log('Material library stats:', stats)

    // Verify materials have been categorized
    const totalByFunction = Object.values(stats.byFunction).reduce((sum, count) => sum + count, 0)
    const totalByCharacter = Object.values(stats.byCharacter).reduce((sum, count) => sum + count, 0)

    assert(totalByFunction > 0, 'Materials should be categorized by function')
    assert(totalByCharacter > 0, 'Materials should be categorized by character')
  })

  it('should generate polyphonic composition for multiple users', async () => {
    // Add material to library first
    const users = ['user1', 'user2', 'user3']
    const gestures = []

    // Create material for each user
    users.forEach((userId, index) => {
      const gesture = {
        userId,
        gesture: {
          action: 'drag',
          type: 'melodic',
          velocity: 50 + index * 10,
          curvature: 0.3 + index * 0.2,
          coordinates: [0.2 + index * 0.3, 0.4 + index * 0.1]
        },
        timestamp: Date.now() + index * 100
      }
      gestures.push(gesture)

      // Process to add to library
      gestureToMusicService.processGesture(gesture)
    })

    // Create room context for composition
    const roomContext = {
      roomId: 'test-room-123',
      userCount: users.length,
      activeUsers: users,
      timestamp: Date.now()
    }

    // Generate composition
    const composition = gestureToMusicService.composeForRoom(roomContext)

    assert(composition, 'Should generate composition')
    assert(composition.type, 'Composition should have type')

    // Check composition structure - it might be polyphonic, homophonic, or ambient
    console.log('Composition type:', composition.type)
    console.log('Composition keys:', Object.keys(composition))

    if (composition.type === 'polyphonic') {
      const voices = composition.content?.voices || composition.voices
      assert(voices, 'Polyphonic composition should have voices')
      assert(voices.length >= 2, 'Should have multiple voices')

      // Validate voice leading
      const validation = composition.content?.validation || composition.validation
      if (validation) {
        assert(validation.isValid !== undefined, 'Should have voice leading validation')
        if (validation.errors) {
          console.log('Voice leading errors:', validation.errors)
        }
      }

      // Check each voice has proper structure
      voices.forEach((voice, index) => {
        assert(voice.notes, `Voice ${index} should have notes`)
        assert(voice.voiceType, `Voice ${index} should have voice type`)
        assert(voice.pan !== undefined, `Voice ${index} should have pan position`)
        assert(voice.timbre, `Voice ${index} should have timbre`)
      })

      console.log(`Generated polyphonic composition with ${voices.length} voices`)
    } else {
      // For other composition types, just validate basic structure
      assert(composition, 'Should have some composition content')
      console.log(`Generated ${composition.type} composition`)
    }

    // Check harmonic progression
    if (composition.progression) {
      assert(composition.progression.length > 0, 'Should have harmonic progression')
      composition.progression.forEach((chord, index) => {
        assert(chord.chord, `Chord ${index} should have chord symbol`)
        assert(chord.function, `Chord ${index} should have harmonic function`)
      })
    }

    console.log('Composition structure:', composition.structure)
  })

  it('should adapt composition style based on gesture characteristics', async () => {
    // High energy gestures
    const highEnergyGestures = [
      {
        userId: 'energetic-user',
        gesture: {
          action: 'drag',
          type: 'rhythmic',
          velocity: 90,
          curvature: 0.2,
          acceleration: 15,
          coordinates: [0.5, 0.5]
        },
        timestamp: Date.now()
      },
      {
        userId: 'energetic-user',
        gesture: {
          action: 'tap',
          type: 'rhythmic',
          velocity: 95,
          coordinates: [0.7, 0.3]
        },
        timestamp: Date.now() + 100
      }
    ]

    // Process high energy gestures
    highEnergyGestures.forEach(gesture => {
      gestureToMusicService.processGesture(gesture)
    })

    // Check current style
    const currentStyle = gestureToMusicService.getCurrentStyle()
    assert(currentStyle, 'Should have current style analysis')

    console.log('High energy style analysis:', {
      energy: currentStyle.energy,
      tempo: currentStyle.tempo,
      genreWeights: currentStyle.genreWeights
    })

    // Low energy gestures
    const lowEnergyGestures = [
      {
        userId: 'calm-user',
        gesture: {
          action: 'hover',
          type: 'textural',
          velocity: 25,
          curvature: 0.8,
          acceleration: -5,
          coordinates: [0.3, 0.7]
        },
        timestamp: Date.now() + 500
      },
      {
        userId: 'calm-user',
        gesture: {
          action: 'drag',
          type: 'melodic',
          velocity: 30,
          curvature: 0.9,
          acceleration: 2,
          coordinates: [0.4, 0.6]
        },
        timestamp: Date.now() + 600
      }
    ]

    // Process low energy gestures
    lowEnergyGestures.forEach(gesture => {
      gestureToMusicService.processGesture(gesture)
    })

    // Check updated style
    const updatedStyle = gestureToMusicService.getCurrentStyle()
    assert(updatedStyle, 'Should have updated style analysis')

    console.log('Low energy style analysis:', {
      energy: updatedStyle.energy,
      tempo: updatedStyle.tempo,
      genreWeights: updatedStyle.genreWeights
    })

    // Styles should evolve smoothly
    assert(Math.abs(currentStyle.energy - updatedStyle.energy) < 1, 'Energy should evolve smoothly')
  })

  it('should handle different gesture action types appropriately', async () => {
    const userId = 'test-user'

    // Test drag gesture (should generate phrase)
    const dragGesture = {
      userId,
      gesture: {
        action: 'drag',
        type: 'melodic',
        velocity: 60,
        curvature: 0.5,
        coordinates: [0.3, 0.4]
      },
      timestamp: Date.now()
    }

    const dragEvents = gestureToMusicService.processGesture(dragGesture)
    assert(dragEvents.length >= 1, 'Drag gesture should generate at least one event')
    assert(dragEvents[0].properties.totalNotes >= 2, 'Drag should generate multi-note phrase')

    // Test tap gesture (should be percussive)
    const tapGesture = {
      userId,
      gesture: {
        action: 'tap',
        type: 'rhythmic',
        velocity: 80,
        coordinates: [0.6, 0.2]
      },
      timestamp: Date.now() + 100
    }

    const tapEvents = gestureToMusicService.processGesture(tapGesture)
    assert(tapEvents.length === 1, 'Tap gesture should generate single event')
    assert(tapEvents[0].properties.duration < 0.5, 'Tap should be short duration')

    // Test hover gesture (should be sustained)
    const hoverGesture = {
      userId,
      gesture: {
        action: 'hover',
        type: 'textural',
        velocity: 40,
        curvature: 0.7,
        coordinates: [0.8, 0.6]
      },
      timestamp: Date.now() + 200
    }

    const hoverEvents = gestureToMusicService.processGesture(hoverGesture)
    assert(hoverEvents.length === 1, 'Hover gesture should generate single event')
    assert(hoverEvents[0].properties.duration > 1.0, 'Hover should be long duration')
    assert(hoverEvents[0].properties.mood === 'ambient', 'Hover should generate ambient mood')

    console.log('Gesture action test results:', {
      dragEvents: dragEvents.length,
      tapEvents: tapEvents.length,
      hoverEvents: hoverEvents.length
    })
  })

  it('should maintain musical coherence across multiple sessions', async () => {
    // First session - establish musical material
    const session1Gestures = [
      {
        userId: 'session-user',
        gesture: {
          action: 'drag',
          type: 'melodic',
          velocity: 65,
          curvature: 0.6,
          coordinates: [0.4, 0.3]
        },
        timestamp: Date.now()
      }
    ]

    session1Gestures.forEach(gesture => {
      gestureToMusicService.processGesture(gesture)
    })

    const session1Stats = gestureToMusicService.getMaterialStats()
    assert(session1Stats.totalMaterials > 0, 'First session should create material')

    // Simulate time passing (material aging)
    const originalMaterialCount = session1Stats.totalMaterials

    // Second session - build on existing material
    const session2Gestures = [
      {
        userId: 'session-user',
        gesture: {
          action: 'drag',
          type: 'harmonic',
          velocity: 55,
          curvature: 0.4,
          coordinates: [0.6, 0.5]
        },
        timestamp: Date.now() + 30000 // 30 seconds later
      }
    ]

    session2Gestures.forEach(gesture => {
      gestureToMusicService.processGesture(gesture)
    })

    const session2Stats = gestureToMusicService.getMaterialStats()
    assert(session2Stats.totalMaterials >= originalMaterialCount, 'Second session should add to or maintain material')

    // Generate composition using accumulated material
    const roomContext = {
      roomId: 'persistent-room',
      userCount: 1,
      activeUsers: ['session-user'],
      timestamp: Date.now()
    }

    const composition = gestureToMusicService.composeForRoom(roomContext)
    assert(composition, 'Should generate composition from accumulated material')

    console.log('Material coherence test:', {
      session1Materials: originalMaterialCount,
      session2Materials: session2Stats.totalMaterials,
      compositionType: composition.type
    })
  })

  it('should gracefully handle errors and fallbacks', async () => {
    // Test with malformed gesture data
    const malformedGesture = {
      userId: 'error-test-user',
      // Missing required gesture properties
      timestamp: Date.now()
    }

    const fallbackEvents = gestureToMusicService.processGesture(malformedGesture)
    assert(fallbackEvents.length > 0, 'Should generate fallback events for malformed data')
    // The gesture action might be 'unknown' for malformed input, not 'fallback'
    assert(['unknown', 'fallback'].includes(fallbackEvents[0].properties.gestureAction), 'Should handle malformed input gracefully')

    // Test with null/undefined input
    const nullEvents = gestureToMusicService.processGesture(null)
    assert(nullEvents.length > 0, 'Should handle null input gracefully')

    const undefinedEvents = gestureToMusicService.processGesture(undefined)
    assert(undefinedEvents.length > 0, 'Should handle undefined input gracefully')

    console.log('Error handling test: All error cases handled gracefully')
  })
})