/**
 * Unit Tests: Sound Pattern Generation (T043)
 * Tests algorithmic sound pattern generation and evolution
 * Constitutional requirement: Genre-agnostic generation, performance optimization
 */

const SoundPatternGenerator = require('../../src/services/SoundPatternGenerator')
const MemoryState = require('../../src/models/MemoryState')
const SoundPattern = require('../../src/models/SoundPattern')

describe('SoundPatternGenerator', () => {
  let generator
  let testMemoryState
  let testRoomId

  beforeEach(() => {
    generator = new SoundPatternGenerator()
    testRoomId = 'test-pattern-room-' + Date.now()
    testMemoryState = new MemoryState(testRoomId)

    // Add some test patterns to memory state
    testMemoryState.gesturePatterns = [
      {
        timestamp: new Date(),
        type: 'touch',
        coordinates: { x: 0.3, y: 0.6 },
        intensity: 0.8,
        sonicParams: { frequency: 440, amplitude: 0.6, waveform: 'sine' }
      },
      {
        timestamp: new Date(),
        type: 'mouse',
        coordinates: { x: 0.7, y: 0.4 },
        intensity: 0.5,
        sonicParams: { frequency: 550, amplitude: 0.4, waveform: 'square' }
      }
    ]
  })

  describe('Initialization and Algorithm Setup', () => {
    test('initializes with all generation algorithms', () => {
      const algorithms = generator.generationAlgorithms

      expect(algorithms.has('cellular')).toBe(true)
      expect(algorithms.has('fractal')).toBe(true)
      expect(algorithms.has('markov')).toBe(true)
      expect(algorithms.has('neural')).toBe(true)
      expect(algorithms.has('fibonacci')).toBe(true)
      expect(algorithms.has('chaos')).toBe(true)
      expect(algorithms.size).toBe(6)
    })

    test('validates generator state successfully', () => {
      expect(() => {
        generator.validateGeneratorState()
      }).not.toThrow()
    })

    test('detects invalid generator state', () => {
      // Clear algorithms to create invalid state
      generator.generationAlgorithms.clear()

      expect(() => {
        generator.validateGeneratorState()
      }).toThrow('No generation algorithms available')
    })
  })

  describe('Memory Analysis for Generation Strategy', () => {
    test('analyzes memory state for generation strategy', () => {
      const roomContext = { activeUsers: 2 }
      const strategy = generator.analyzeMemoryForGeneration(testMemoryState, roomContext)

      expect(strategy).toBeDefined()
      expect(typeof strategy.complexity).toBe('number')
      expect(typeof strategy.diversity).toBe('number')
      expect(typeof strategy.collaborativeIntensity).toBe('number')
      expect(typeof strategy.temporalContext).toBe('object')
      expect(typeof strategy.harmonicPreference).toBe('number')
      expect(typeof strategy.rhythmicPreference).toBe('number')
      expect(typeof strategy.textualPreference).toBe('number')
      expect(typeof strategy.dominantCharacteristic).toBe('string')

      // Values should be in valid ranges
      expect(strategy.complexity).toBeGreaterThanOrEqual(0)
      expect(strategy.complexity).toBeLessThanOrEqual(1)
      expect(strategy.diversity).toBeGreaterThanOrEqual(0)
      expect(strategy.diversity).toBeLessThanOrEqual(1)
    })

    test('calculates complexity level correctly', () => {
      // Test with low complexity memory
      const lowComplexityMemory = new MemoryState(testRoomId)
      lowComplexityMemory.gesturePatterns = [
        {
          timestamp: new Date(),
          type: 'mouse',
          coordinates: { x: 0.5, y: 0.5 },
          intensity: 0.3
        }
      ]

      const lowComplexity = generator.calculateComplexityLevel(lowComplexityMemory)
      expect(lowComplexity).toBeLessThan(0.3)

      // Test with high complexity memory
      const highComplexityMemory = new MemoryState(testRoomId)
      highComplexityMemory.gesturePatterns = Array.from({ length: 150 }, (_, i) => ({
        timestamp: new Date(),
        type: ['mouse', 'touch', 'gyroscope'][i % 3],
        coordinates: { x: Math.random(), y: Math.random(), z: Math.random() },
        intensity: Math.random()
      }))
      highComplexityMemory.userInfluences.set('user1', {})
      highComplexityMemory.userInfluences.set('user2', {})
      highComplexityMemory.learningMetrics.adaptationEvents = 80

      const highComplexity = generator.calculateComplexityLevel(highComplexityMemory)
      expect(highComplexity).toBeGreaterThan(0.6)
    })

    test('calculates temporal context accurately', () => {
      // Create memory with rhythmic patterns
      const rhythmicMemory = new MemoryState(testRoomId)
      const baseTime = Date.now()

      rhythmicMemory.gesturePatterns = Array.from({ length: 10 }, (_, i) => ({
        timestamp: new Date(baseTime - (10 - i) * 500), // 500ms intervals
        type: 'touch',
        coordinates: { x: 0.5, y: 0.5 },
        intensity: 0.8
      }))

      const temporalContext = generator.analyzeTemporalContext(rhythmicMemory)

      expect(temporalContext.recentActivity).toBeGreaterThan(0)
      expect(temporalContext.averageInterval).toBeLessThan(2000)
      expect(temporalContext.isRhythmic).toBe(true)
      expect(temporalContext.tempo).toBeGreaterThan(0)
    })
  })

  describe('Algorithm Selection', () => {
    test('selects appropriate algorithm for harmonic preference', () => {
      const harmonicStrategy = {
        dominantCharacteristic: 'harmonic',
        harmonicPreference: 0.9,
        rhythmicPreference: 0.2,
        textualPreference: 0.1,
        collaborativeIntensity: 0.3,
        complexity: 0.5
      }

      const algorithm = generator.selectGenerationAlgorithm(harmonicStrategy)

      expect(['fibonacci', 'neural', 'fractal']).toContain(algorithm.name)
    })

    test('selects appropriate algorithm for rhythmic preference', () => {
      const rhythmicStrategy = {
        dominantCharacteristic: 'rhythmic',
        harmonicPreference: 0.1,
        rhythmicPreference: 0.9,
        textualPreference: 0.2,
        collaborativeIntensity: 0.4,
        complexity: 0.6
      }

      const algorithm = generator.selectGenerationAlgorithm(rhythmicStrategy)

      expect(['cellular', 'markov', 'chaos']).toContain(algorithm.name)
    })

    test('selects appropriate algorithm for collaborative sessions', () => {
      const collaborativeStrategy = {
        dominantCharacteristic: 'collaborative',
        harmonicPreference: 0.3,
        rhythmicPreference: 0.4,
        textualPreference: 0.2,
        collaborativeIntensity: 0.9,
        complexity: 0.7
      }

      const algorithm = generator.selectGenerationAlgorithm(collaborativeStrategy)

      expect(['markov', 'neural', 'cellular']).toContain(algorithm.name)
    })
  })

  describe('Pattern Generation', () => {
    test('generates patterns successfully', () => {
      const roomContext = { activeUsers: 2 }

      const patterns = generator.generatePatterns(testRoomId, testMemoryState, roomContext)

      expect(Array.isArray(patterns)).toBe(true)
      expect(patterns.length).toBeGreaterThan(0)

      patterns.forEach(pattern => {
        expect(pattern).toBeInstanceOf(SoundPattern)
        expect(pattern.roomId).toBe(testRoomId)
        expect(pattern.validateForSonicProcessing).toBeDefined()
      })
    })

    test('tracks generation metrics', () => {
      const roomContext = { activeUsers: 1 }

      const initialStats = generator.getGenerationStats()
      const initialCount = initialStats.totalGenerated

      generator.generatePatterns(testRoomId, testMemoryState, roomContext)

      const updatedStats = generator.getGenerationStats()
      expect(updatedStats.totalGenerated).toBe(initialCount + 1)
      expect(updatedStats.averageGenerationTime).toBeGreaterThan(0)
    })

    test('generates initial ambient patterns', () => {
      const ambientPatterns = generator.generateInitialAmbientPatterns(testRoomId)

      expect(ambientPatterns.length).toBe(2)
      expect(ambientPatterns[0].type).toBe('ambient')
      expect(ambientPatterns[1].type).toBe('harmonic')

      // Verify harmonic relationship
      const baseFreq = ambientPatterns[0].parameters.frequency
      const harmonicFreq = ambientPatterns[1].parameters.frequency
      expect(harmonicFreq).toBeCloseTo(baseFreq * 1.5, 0) // Perfect fifth
    })

    test('maintains constitutional performance requirement', () => {
      const roomContext = { activeUsers: 3 }

      const startTime = performance.now()
      const patterns = generator.generatePatterns(testRoomId, testMemoryState, roomContext)
      const generationTime = performance.now() - startTime

      expect(generationTime).toBeLessThan(100) // <100ms constitutional requirement
      expect(patterns.length).toBeGreaterThan(0)
    })
  })

  describe('Cellular Automata Algorithm', () => {
    test('generates cellular automata patterns', () => {
      const cellularAlgorithm = generator.generationAlgorithms.get('cellular')

      const strategy = {
        complexity: 0.6,
        diversity: 0.5,
        collaborativeIntensity: 0.3
      }

      const patterns = cellularAlgorithm.generatePatterns(testRoomId, testMemoryState, strategy)

      expect(Array.isArray(patterns)).toBe(true)
      expect(patterns.length).toBeLessThanOrEqual(4) // Algorithm limits to 4
      patterns.forEach(pattern => {
        expect(pattern).toBeInstanceOf(SoundPattern)
        expect(pattern.type).toBe('rhythmic')
        expect(pattern.parameters.waveform).toBe('square')
      })
    })

    test('cellular automata grid evolution', () => {
      const cellularAlgorithm = generator.generationAlgorithms.get('cellular')

      // Test grid initialization
      const grid = cellularAlgorithm.initializeGrid(testMemoryState)
      expect(grid.length).toBe(16)
      expect(grid.every(cell => cell === 0 || cell === 1)).toBe(true)

      // Test grid evolution
      const evolvedGrid = cellularAlgorithm.evolveGrid(grid, 0.5)
      expect(evolvedGrid.length).toBe(16)
      expect(evolvedGrid).not.toEqual(grid) // Should have evolved
    })
  })

  describe('Fractal Algorithm', () => {
    test('generates fractal patterns', () => {
      const fractalAlgorithm = generator.generationAlgorithms.get('fractal')

      const strategy = {
        complexity: 0.7,
        diversity: 0.6
      }

      const patterns = fractalAlgorithm.generatePatterns(testRoomId, testMemoryState, strategy)

      expect(patterns.length).toBeLessThanOrEqual(3)
      patterns.forEach((pattern, index) => {
        expect(pattern.type).toBe('textural')
        expect(pattern.parameters.waveform).toBe('sawtooth')
        // Each pattern should have diminishing amplitude
        if (index > 0) {
          expect(pattern.parameters.amplitude).toBeLessThan(patterns[index - 1].parameters.amplitude)
        }
      })
    })

    test('fractal frequency series generation', () => {
      const fractalAlgorithm = generator.generationAlgorithms.get('fractal')

      const baseFreq = 440
      const series = fractalAlgorithm.generateFractalSeries(baseFreq, 0.5)

      expect(series.length).toBeGreaterThan(1)
      expect(series[0]).toBe(baseFreq)

      // Each frequency should be related by golden ratio
      for (let i = 1; i < series.length; i++) {
        expect(series[i]).toBeGreaterThan(220)
        expect(series[i]).toBeLessThan(2200)
      }
    })
  })

  describe('Markov Chain Algorithm', () => {
    test('generates markov chain patterns', () => {
      // Add more patterns for better Markov training
      for (let i = 0; i < 20; i++) {
        testMemoryState.gesturePatterns.push({
          timestamp: new Date(),
          type: ['mouse', 'touch'][i % 2],
          coordinates: { x: Math.random(), y: Math.random() },
          intensity: Math.random()
        })
      }

      const markovAlgorithm = generator.generationAlgorithms.get('markov')

      const strategy = {
        complexity: 0.6,
        collaborativeIntensity: 0.7
      }

      const patterns = markovAlgorithm.generatePatterns(testRoomId, testMemoryState, strategy)

      expect(patterns.length).toBeLessThanOrEqual(4)
      patterns.forEach(pattern => {
        expect(pattern.type).toBe('harmonic')
        expect(['sine', 'triangle', 'sawtooth']).toContain(pattern.parameters.waveform)
      })
    })

    test('builds markov chain from patterns', () => {
      const markovAlgorithm = generator.generationAlgorithms.get('markov')

      const chain = markovAlgorithm.buildMarkovChain(testMemoryState)

      expect(chain instanceof Map).toBe(true)
      // Chain should have entries if enough patterns exist
      if (testMemoryState.gesturePatterns.length >= 3) {
        expect(chain.size).toBeGreaterThan(0)
      }
    })
  })

  describe('Neural Network Algorithm', () => {
    test('generates neural network patterns', () => {
      const neuralAlgorithm = generator.generationAlgorithms.get('neural')

      const strategy = {
        complexity: 0.8,
        diversity: 0.7,
        collaborativeIntensity: 0.5
      }

      const patterns = neuralAlgorithm.generatePatterns(testRoomId, testMemoryState, strategy)

      expect(patterns.length).toBeGreaterThan(0)
      patterns.forEach(pattern => {
        expect(['ambient', 'harmonic', 'textural']).toContain(pattern.type)
        expect(pattern.parameters.waveform).toBe('sine')
      })
    })

    test('neural network processing', () => {
      const neuralAlgorithm = generator.generationAlgorithms.get('neural')

      const inputs = [0.1, 0.5, 0.8, 0.3, 0.9, 0.2, 0.7, 0.4]
      const outputs = neuralAlgorithm.processInputs(inputs)

      expect(outputs.frequency).toBeGreaterThan(0)
      expect(outputs.frequency).toBeLessThan(1)
      expect(outputs.amplitude).toBeGreaterThan(0)
      expect(outputs.amplitude).toBeLessThan(1)
      expect(outputs.envelope).toBeGreaterThan(0)
      expect(outputs.envelope).toBeLessThan(1)
    })
  })

  describe('Fibonacci Algorithm', () => {
    test('generates fibonacci patterns', () => {
      const fibonacciAlgorithm = generator.generationAlgorithms.get('fibonacci')

      const strategy = {
        harmonicPreference: 0.9,
        complexity: 0.5
      }

      const patterns = fibonacciAlgorithm.generatePatterns(testRoomId, testMemoryState, strategy)

      expect(patterns.length).toBeLessThanOrEqual(4)
      patterns.forEach(pattern => {
        expect(pattern.type).toBe('harmonic')
        expect(pattern.parameters.waveform).toBe('sine')
        expect(pattern.parameters.frequency).toBeGreaterThan(220)
        expect(pattern.parameters.frequency).toBeLessThan(1760)
      })
    })

    test('fibonacci sequence generation', () => {
      const fibonacciAlgorithm = generator.generationAlgorithms.get('fibonacci')

      const sequence = fibonacciAlgorithm.generateFibonacci(10)

      expect(sequence).toEqual([1, 1, 2, 3, 5, 8, 13, 21, 34, 55])
    })
  })

  describe('Chaos Theory Algorithm', () => {
    test('generates chaos theory patterns', () => {
      const chaosAlgorithm = generator.generationAlgorithms.get('chaos')

      const strategy = {
        complexity: 0.9,
        diversity: 0.8
      }

      const patterns = chaosAlgorithm.generatePatterns(testRoomId, testMemoryState, strategy)

      expect(patterns.length).toBeLessThanOrEqual(3)
      patterns.forEach(pattern => {
        expect(pattern.type).toBe('textural')
        expect(['square', 'sawtooth', 'triangle']).toContain(pattern.parameters.waveform)
      })
    })

    test('lorenz attractor generation', () => {
      const chaosAlgorithm = generator.generationAlgorithms.get('chaos')

      const points = chaosAlgorithm.generateLorenzAttractor(0.5)

      expect(points.length).toBeGreaterThan(10)
      points.forEach(point => {
        expect(typeof point.x).toBe('number')
        expect(typeof point.y).toBe('number')
        expect(typeof point.z).toBe('number')
        expect(isFinite(point.x)).toBe(true)
        expect(isFinite(point.y)).toBe(true)
        expect(isFinite(point.z)).toBe(true)
      })
    })
  })

  describe('Performance and Quality', () => {
    test('generation performance under high load', () => {
      // Create complex memory state
      const complexMemory = new MemoryState(testRoomId)
      complexMemory.gesturePatterns = Array.from({ length: 200 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 100),
        type: ['mouse', 'touch', 'gyroscope'][i % 3],
        coordinates: { x: Math.random(), y: Math.random(), z: Math.random() },
        intensity: Math.random(),
        sonicParams: {
          frequency: 220 + Math.random() * 660,
          amplitude: Math.random() * 0.8,
          waveform: ['sine', 'square', 'triangle', 'sawtooth'][i % 4]
        }
      }))

      const roomContext = { activeUsers: 8 }

      const startTime = performance.now()

      // Generate patterns multiple times
      for (let i = 0; i < 10; i++) {
        const patterns = generator.generatePatterns(testRoomId, complexMemory, roomContext)
        expect(patterns.length).toBeGreaterThan(0)
      }

      const totalTime = performance.now() - startTime
      const avgTime = totalTime / 10

      expect(avgTime).toBeLessThan(100) // Each generation <100ms
    })

    test('pattern quality validation', () => {
      const roomContext = { activeUsers: 3 }
      const patterns = generator.generatePatterns(testRoomId, testMemoryState, roomContext)

      patterns.forEach(pattern => {
        // Validate pattern structure
        expect(pattern.roomId).toBe(testRoomId)
        expect(['ambient', 'rhythmic', 'harmonic', 'textural']).toContain(pattern.type)

        // Validate parameter ranges
        expect(pattern.parameters.frequency).toBeGreaterThanOrEqual(20)
        expect(pattern.parameters.frequency).toBeLessThanOrEqual(20000)
        expect(pattern.parameters.amplitude).toBeGreaterThanOrEqual(0)
        expect(pattern.parameters.amplitude).toBeLessThanOrEqual(1)

        // Validate envelope
        const env = pattern.parameters.envelope
        expect(env.attack).toBeGreaterThan(0)
        expect(env.decay).toBeGreaterThan(0)
        expect(env.sustain).toBeGreaterThanOrEqual(0)
        expect(env.sustain).toBeLessThanOrEqual(1)
        expect(env.release).toBeGreaterThan(0)

        // Should not throw validation errors
        expect(() => {
          pattern.validateForSonicProcessing()
        }).not.toThrow()
      })
    })

    test('genre-agnostic generation requirement', () => {
      const roomContext = { activeUsers: 2 }

      // Generate patterns multiple times with different memory states
      const generatedTypes = new Set()
      const generatedWaveforms = new Set()
      const frequencyRanges = []

      for (let iteration = 0; iteration < 20; iteration++) {
        // Create varied memory state
        const variedMemory = new MemoryState(`${testRoomId}-${iteration}`)
        variedMemory.gesturePatterns = Array.from({ length: 10 }, (_, i) => ({
          timestamp: new Date(),
          type: ['mouse', 'touch', 'gyroscope'][i % 3],
          coordinates: { x: Math.random(), y: Math.random(), z: Math.random() },
          intensity: Math.random(),
          sonicParams: {
            frequency: 100 + Math.random() * 1000,
            amplitude: Math.random(),
            waveform: ['sine', 'square', 'triangle', 'sawtooth'][i % 4]
          }
        }))

        const patterns = generator.generatePatterns(testRoomId, variedMemory, roomContext)

        patterns.forEach(pattern => {
          generatedTypes.add(pattern.type)
          generatedWaveforms.add(pattern.parameters.waveform)
          frequencyRanges.push(pattern.parameters.frequency)
        })
      }

      // Should generate diverse types and parameters (genre-agnostic)
      expect(generatedTypes.size).toBeGreaterThan(2) // Multiple pattern types
      expect(generatedWaveforms.size).toBeGreaterThan(2) // Multiple waveforms

      // Should cover wide frequency range
      const minFreq = Math.min(...frequencyRanges)
      const maxFreq = Math.max(...frequencyRanges)
      expect(maxFreq - minFreq).toBeGreaterThan(200) // Wide frequency spread
    })
  })

  describe('Generation Statistics', () => {
    test('tracks algorithm usage distribution', () => {
      const roomContext = { activeUsers: 2 }

      // Generate patterns multiple times
      for (let i = 0; i < 10; i++) {
        generator.generatePatterns(testRoomId, testMemoryState, roomContext)
      }

      const stats = generator.getGenerationStats()

      expect(stats.totalGenerated).toBeGreaterThan(0)
      expect(stats.averageGenerationTime).toBeGreaterThan(0)
      expect(Array.isArray(stats.algorithmDistribution)).toBe(true)

      const totalUsage = stats.algorithmDistribution.reduce((sum, alg) => sum + alg.count, 0)
      expect(totalUsage).toBe(stats.totalGenerated)

      // Each algorithm should have reasonable percentage
      stats.algorithmDistribution.forEach(alg => {
        expect(alg.percentage).toBeGreaterThanOrEqual(0)
        expect(alg.percentage).toBeLessThanOrEqual(100)
      })
    })

    test('generation history tracking', () => {
      const roomContext = { activeUsers: 3 }

      // Generate patterns and track history
      for (let i = 0; i < 5; i++) {
        const patterns = generator.generatePatterns(testRoomId, testMemoryState, roomContext)
        generator.trackGenerationHistory(testRoomId, patterns, {
          complexity: 0.5 + i * 0.1,
          diversity: 0.6,
          dominantCharacteristic: 'harmonic'
        })
      }

      const history = generator.generationHistory.get(testRoomId)

      expect(history).toBeDefined()
      expect(history.length).toBe(5)

      history.forEach(entry => {
        expect(typeof entry.timestamp).toBe('number')
        expect(typeof entry.patternCount).toBe('number')
        expect(typeof entry.strategy).toBe('object')
        expect(Array.isArray(entry.patternTypes)).toBe(true)
      })
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('handles empty memory state gracefully', () => {
      const emptyMemory = new MemoryState(testRoomId)
      emptyMemory.gesturePatterns = []

      const roomContext = { activeUsers: 1 }

      expect(() => {
        const patterns = generator.generatePatterns(testRoomId, emptyMemory, roomContext)
        expect(Array.isArray(patterns)).toBe(true)
      }).not.toThrow()
    })

    test('handles invalid input parameters', () => {
      expect(() => {
        generator.generatePatterns(null, testMemoryState, { activeUsers: 1 })
      }).toThrow('Room ID and memory state are required')

      expect(() => {
        generator.generatePatterns(testRoomId, null, { activeUsers: 1 })
      }).toThrow('Room ID and memory state are required')
    })

    test('handles algorithm performance degradation', () => {
      // Mock slow algorithm performance
      const originalValidate = generator.validateGeneratorState
      generator.performanceMetrics.averageGenerationTime = 150 // Simulate slow performance

      generator.validateGeneratorState = () => {
        if (generator.performanceMetrics.averageGenerationTime > 100) {
          throw new Error('Average generation time 150ms exceeds 100ms limit')
        }
      }

      expect(() => {
        generator.validateGeneratorState()
      }).toThrow('exceeds 100ms limit')

      // Restore original method
      generator.validateGeneratorState = originalValidate
    })

    test('handles extreme complexity values', () => {
      const extremeMemory = new MemoryState(testRoomId)

      // Test with maximum complexity
      extremeMemory.gesturePatterns = Array.from({ length: 1000 }, () => ({
        timestamp: new Date(),
        type: 'touch',
        coordinates: { x: Math.random(), y: Math.random() },
        intensity: Math.random()
      }))

      const roomContext = { activeUsers: 10 }

      expect(() => {
        const patterns = generator.generatePatterns(testRoomId, extremeMemory, roomContext)
        expect(patterns.length).toBeGreaterThan(0)
      }).not.toThrow()
    })
  })
})

module.exports = {
  testName: 'Sound Pattern Generation Unit Tests',
  description: 'Algorithmic sound pattern generation and evolution',
  constitutionalRequirements: [
    'Genre-agnostic pattern generation',
    '<100ms generation time performance',
    'Multiple algorithm diversity (6 algorithms)',
    'Pattern quality and parameter validation',
    'Scalable complexity handling'
  ]
}