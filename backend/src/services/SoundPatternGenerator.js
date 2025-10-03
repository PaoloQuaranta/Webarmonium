const SoundPattern = require('../models/SoundPattern')

/**
 * SoundPatternGenerator Service
 * Advanced algorithmic generation of evolving sound patterns
 * Constitutional requirement: Genre-agnostic, performance-optimized generative algorithms
 */
class SoundPatternGenerator {
  constructor() {
    this.generationAlgorithms = new Map()
    this.generationHistory = new Map() // roomId -> generation history
    this.performanceMetrics = {
      totalGenerated: 0,
      averageGenerationTime: 0,
      algorithmUsage: new Map()
    }
    this.initializeAlgorithms()
  }

  /**
   * Initialize available generation algorithms
   */
  initializeAlgorithms() {
    this.generationAlgorithms.set('cellular', new CellularAutomataGenerator())
    this.generationAlgorithms.set('fractal', new FractalPatternGenerator())
    this.generationAlgorithms.set('markov', new MarkovChainGenerator())
    this.generationAlgorithms.set('neural', new NeuralPatternGenerator())
    this.generationAlgorithms.set('fibonacci', new FibonacciSequenceGenerator())
    this.generationAlgorithms.set('chaos', new ChaosTheoryGenerator())
  }

  /**
   * Generate sound patterns based on memory state and room context
   * @param {string} roomId - Room ID
   * @param {MemoryState} memoryState - Room memory state
   * @param {Object} roomContext - Current room context
   * @returns {SoundPattern[]} Generated sound patterns
   */
  generatePatterns(roomId, memoryState, roomContext) {
    const startTime = Date.now()

    if (!roomId || !memoryState) {
      throw new Error('Room ID and memory state are required')
    }

    // Analyze memory state to determine generation strategy
    const generationStrategy = this.analyzeMemoryForGeneration(memoryState, roomContext)

    // Select appropriate algorithm
    const algorithm = this.selectGenerationAlgorithm(generationStrategy)

    // Generate patterns
    const patterns = algorithm.generatePatterns(roomId, memoryState, generationStrategy)

    // Update metrics
    this.updateGenerationMetrics(algorithm.name, Date.now() - startTime)

    // Track generation history
    this.trackGenerationHistory(roomId, patterns, generationStrategy)

    return patterns
  }

  /**
   * Analyze memory state to determine optimal generation strategy
   * @param {MemoryState} memoryState - Memory state to analyze
   * @param {Object} roomContext - Room context
   * @returns {Object} Generation strategy
   */
  analyzeMemoryForGeneration(memoryState, roomContext) {
    const influence = memoryState.getInfluence()
    const roomPersonality = influence.roomPersonality

    const strategy = {
      complexity: this.calculateComplexityLevel(memoryState),
      diversity: this.calculateDiversityFactor(roomPersonality),
      collaborativeIntensity: roomContext.activeUsers > 1 ?
        Math.min(1.0, roomContext.activeUsers / 5) : 0,
      temporalContext: this.analyzeTemporalContext(memoryState),
      harmonicPreference: this.analyzeHarmonicPreference(roomPersonality),
      rhythmicPreference: this.analyzeRhythmicPreference(roomPersonality),
      textualPreference: this.analyzeTextualPreference(roomPersonality)
    }

    strategy.dominantCharacteristic = this.determineDominantCharacteristic(strategy)

    return strategy
  }

  /**
   * Calculate complexity level based on memory patterns
   * @param {MemoryState} memoryState - Memory state
   * @returns {number} Complexity level (0.0-1.0)
   */
  calculateComplexityLevel(memoryState) {
    const patternCount = memoryState.gesturePatterns.length
    const userCount = memoryState.userInfluences.size
    const adaptationEvents = memoryState.learningMetrics.adaptationEvents

    // Base complexity from pattern accumulation
    let complexity = Math.min(0.8, patternCount / 200)

    // Boost from multi-user activity
    if (userCount > 1) {
      complexity += Math.min(0.2, userCount / 10)
    }

    // Boost from adaptation activity
    complexity += Math.min(0.1, adaptationEvents / 100)

    return Math.min(1.0, complexity)
  }

  /**
   * Calculate diversity factor from room personality
   * @param {Object} roomPersonality - Room personality data
   * @returns {number} Diversity factor (0.0-1.0)
   */
  calculateDiversityFactor(roomPersonality) {
    const gestureTypes = roomPersonality.dominantGestureTypes || []
    const harmonicRichness = roomPersonality.harmonicRichness || 0
    const rhythmComplexity = roomPersonality.rhythmComplexity || 0

    // Diversity from gesture type variety
    const typeVariety = gestureTypes.length / 3 // max 3 types

    // Diversity from musical complexity
    const musicalDiversity = (harmonicRichness + rhythmComplexity) / 200

    return Math.min(1.0, typeVariety + musicalDiversity)
  }

  /**
   * Analyze temporal context from memory patterns
   * @param {MemoryState} memoryState - Memory state
   * @returns {Object} Temporal context
   */
  analyzeTemporalContext(memoryState) {
    const recentPatterns = memoryState.gesturePatterns
      .filter(p => Date.now() - p.timestamp.getTime() < 60000) // Last minute

    const timingIntervals = []
    for (let i = 1; i < recentPatterns.length; i++) {
      const interval = recentPatterns[i].timestamp.getTime() -
                      recentPatterns[i-1].timestamp.getTime()
      timingIntervals.push(interval)
    }

    const avgInterval = timingIntervals.length > 0 ?
      timingIntervals.reduce((sum, interval) => sum + interval, 0) / timingIntervals.length : 1000

    return {
      recentActivity: recentPatterns.length,
      averageInterval: avgInterval,
      isRhythmic: avgInterval < 2000 && timingIntervals.length > 5,
      tempo: avgInterval > 0 ? 60000 / avgInterval : 60 // BPM
    }
  }

  /**
   * Analyze harmonic preferences
   * @param {Object} roomPersonality - Room personality
   * @returns {number} Harmonic preference (0.0-1.0)
   */
  analyzeHarmonicPreference(roomPersonality) {
    const harmonicRichness = roomPersonality.harmonicRichness || 0
    const frequencyRange = roomPersonality.preferredFrequencyRange || [440, 440]
    const frequencySpread = frequencyRange[1] - frequencyRange[0]

    return Math.min(1.0, (harmonicRichness / 100) + (frequencySpread / 1000))
  }

  /**
   * Analyze rhythmic preferences
   * @param {Object} roomPersonality - Room personality
   * @returns {number} Rhythmic preference (0.0-1.0)
   */
  analyzeRhythmicPreference(roomPersonality) {
    const rhythmComplexity = roomPersonality.rhythmComplexity || 0
    const dominantTypes = roomPersonality.dominantGestureTypes || []

    const touchGestures = dominantTypes.find(t => t.type === 'touch')
    const touchWeight = touchGestures ? touchGestures.count / 100 : 0

    return Math.min(1.0, (rhythmComplexity / 50) + touchWeight)
  }

  /**
   * Analyze textural preferences
   * @param {Object} roomPersonality - Room personality
   * @returns {number} Textural preference (0.0-1.0)
   */
  analyzeTextualPreference(roomPersonality) {
    const dominantTypes = roomPersonality.dominantGestureTypes || []

    const gyroscopeGestures = dominantTypes.find(t => t.type === 'gyroscope')
    const gyroscopeWeight = gyroscopeGestures ? gyroscopeGestures.count / 100 : 0

    const amplitudeRange = roomPersonality.preferredAmplitudeRange || [0.5, 0.5]
    const amplitudeVariation = amplitudeRange[1] - amplitudeRange[0]

    return Math.min(1.0, gyroscopeWeight + (amplitudeVariation * 2))
  }

  /**
   * Determine dominant characteristic for algorithm selection
   * @param {Object} strategy - Generation strategy
   * @returns {string} Dominant characteristic
   */
  determineDominantCharacteristic(strategy) {
    const characteristics = {
      harmonic: strategy.harmonicPreference,
      rhythmic: strategy.rhythmicPreference,
      textural: strategy.textualPreference,
      collaborative: strategy.collaborativeIntensity,
      complex: strategy.complexity
    }

    return Object.entries(characteristics)
      .sort(([,a], [,b]) => b - a)[0][0]
  }

  /**
   * Select generation algorithm based on strategy
   * @param {Object} strategy - Generation strategy
   * @returns {Object} Selected algorithm
   */
  selectGenerationAlgorithm(strategy) {
    const algorithmPreferences = {
      harmonic: ['fibonacci', 'neural', 'fractal'],
      rhythmic: ['cellular', 'markov', 'chaos'],
      textural: ['fractal', 'chaos', 'neural'],
      collaborative: ['markov', 'neural', 'cellular'],
      complex: ['neural', 'chaos', 'fractal']
    }

    const preferredAlgorithms = algorithmPreferences[strategy.dominantCharacteristic] || ['neural']

    // Select algorithm with some randomization for variety
    const algorithmIndex = Math.floor(Math.random() * preferredAlgorithms.length)
    const algorithmName = preferredAlgorithms[algorithmIndex]

    return this.generationAlgorithms.get(algorithmName)
  }

  /**
   * Generate ambient patterns for room initialization
   * @param {string} roomId - Room ID
   * @returns {SoundPattern[]} Initial ambient patterns
   */
  generateInitialAmbientPatterns(roomId) {
    const patterns = []

    // Generate base ambient drone
    const ambientDrone = new SoundPattern(roomId, 'ambient', {
      frequency: 220 + Math.random() * 220, // 220-440 Hz
      amplitude: 0.3 + Math.random() * 0.2, // 0.3-0.5
      waveform: 'sine',
      envelope: {
        attack: 2.0,
        decay: 1.0,
        sustain: 0.8,
        release: 3.0
      }
    })

    patterns.push(ambientDrone)

    // Generate harmonic overtone
    const harmonic = new SoundPattern(roomId, 'harmonic', {
      frequency: ambientDrone.parameters.frequency * 1.5, // Perfect fifth
      amplitude: 0.2,
      waveform: 'triangle',
      envelope: {
        attack: 1.5,
        decay: 0.8,
        sustain: 0.6,
        release: 2.0
      }
    })

    patterns.push(harmonic)

    return patterns
  }

  /**
   * Update generation metrics
   * @param {string} algorithmName - Algorithm name
   * @param {number} generationTime - Generation time in ms
   */
  updateGenerationMetrics(algorithmName, generationTime) {
    this.performanceMetrics.totalGenerated++

    // Update average generation time
    const prevAvg = this.performanceMetrics.averageGenerationTime
    const count = this.performanceMetrics.totalGenerated
    this.performanceMetrics.averageGenerationTime =
      ((prevAvg * (count - 1)) + generationTime) / count

    // Update algorithm usage
    const currentUsage = this.performanceMetrics.algorithmUsage.get(algorithmName) || 0
    this.performanceMetrics.algorithmUsage.set(algorithmName, currentUsage + 1)
  }

  /**
   * Track generation history for analysis
   * @param {string} roomId - Room ID
   * @param {SoundPattern[]} patterns - Generated patterns
   * @param {Object} strategy - Generation strategy
   */
  trackGenerationHistory(roomId, patterns, strategy) {
    const history = this.generationHistory.get(roomId) || []

    history.push({
      timestamp: Date.now(),
      patternCount: patterns.length,
      strategy: { ...strategy },
      patternTypes: patterns.map(p => p.type)
    })

    // Limit history size
    if (history.length > 50) {
      history.splice(0, 25)
    }

    this.generationHistory.set(roomId, history)
  }

  /**
   * Get generation statistics
   * @returns {Object} Generation statistics
   */
  getGenerationStats() {
    return {
      ...this.performanceMetrics,
      algorithmDistribution: Array.from(this.performanceMetrics.algorithmUsage.entries())
        .map(([algorithm, count]) => ({
          algorithm,
          count,
          percentage: (count / this.performanceMetrics.totalGenerated) * 100
        }))
    }
  }

  /**
   * Validate generator state
   * Constitutional requirement: Ensure generation quality
   * @throws {Error} If generator state is invalid
   */
  validateGeneratorState() {
    // Validate algorithms are available
    if (this.generationAlgorithms.size === 0) {
      throw new Error('No generation algorithms available')
    }

    // Validate performance within limits
    if (this.performanceMetrics.averageGenerationTime > 100) {
      throw new Error(`Average generation time ${this.performanceMetrics.averageGenerationTime}ms exceeds 100ms limit`)
    }
  }
}

/**
 * Base class for generation algorithms
 */
class GenerationAlgorithm {
  constructor(name) {
    this.name = name
  }

  generatePatterns(roomId, memoryState, strategy) {
    throw new Error('generatePatterns must be implemented by subclass')
  }
}

/**
 * Cellular Automata-based pattern generator
 */
class CellularAutomataGenerator extends GenerationAlgorithm {
  constructor() {
    super('cellular')
    this.gridSize = 16
  }

  generatePatterns(roomId, memoryState, strategy) {
    const patterns = []
    const grid = this.initializeGrid(memoryState)

    // Evolve grid based on memory patterns
    const evolvedGrid = this.evolveGrid(grid, strategy.complexity)

    // Convert grid to sound patterns
    for (let i = 0; i < this.gridSize; i += 4) {
      if (this.isCellActive(evolvedGrid, i)) {
        const pattern = this.gridCellToPattern(roomId, i, evolvedGrid, strategy)
        if (pattern) patterns.push(pattern)
      }
    }

    return patterns.slice(0, 4) // Limit to 4 patterns
  }

  initializeGrid(memoryState) {
    const grid = new Array(this.gridSize).fill(0)
    const patterns = memoryState.gesturePatterns.slice(-16)

    patterns.forEach((pattern, index) => {
      if (index < this.gridSize) {
        grid[index] = pattern.intensity > 0.5 ? 1 : 0
      }
    })

    return grid
  }

  evolveGrid(grid, complexity) {
    const generations = Math.floor(complexity * 10) + 1
    let currentGrid = [...grid]

    for (let gen = 0; gen < generations; gen++) {
      const nextGrid = [...currentGrid]

      for (let i = 0; i < this.gridSize; i++) {
        const neighbors = this.getNeighbors(currentGrid, i)
        const neighborSum = neighbors.reduce((sum, val) => sum + val, 0)

        // Conway-like rules adapted for sound
        if (currentGrid[i] === 1 && (neighborSum < 1 || neighborSum > 3)) {
          nextGrid[i] = 0
        } else if (currentGrid[i] === 0 && neighborSum === 2) {
          nextGrid[i] = 1
        }
      }

      currentGrid = nextGrid
    }

    return currentGrid
  }

  getNeighbors(grid, index) {
    const neighbors = []
    const left = (index - 1 + this.gridSize) % this.gridSize
    const right = (index + 1) % this.gridSize

    neighbors.push(grid[left], grid[right])

    return neighbors
  }

  isCellActive(grid, index) {
    return grid[index] === 1
  }

  gridCellToPattern(roomId, cellIndex, grid, strategy) {
    const frequency = 220 + (cellIndex * 55) // Spread across frequency range
    const amplitude = 0.3 + (strategy.complexity * 0.4)

    return new SoundPattern(roomId, 'rhythmic', {
      frequency,
      amplitude,
      waveform: 'square',
      envelope: {
        attack: 0.1,
        decay: 0.2,
        sustain: 0.6,
        release: 0.4
      }
    })
  }
}

/**
 * Fractal-based pattern generator
 */
class FractalPatternGenerator extends GenerationAlgorithm {
  constructor() {
    super('fractal')
    this.iterations = 6
    this.goldenRatio = 1.618033988749
  }

  generatePatterns(roomId, memoryState, strategy) {
    const patterns = []
    const baseFrequency = this.calculateBaseFrequency(memoryState)

    // Generate fractal frequency series
    const frequencies = this.generateFractalSeries(baseFrequency, strategy.complexity)

    frequencies.forEach((freq, index) => {
      if (index < 3) { // Limit to 3 patterns
        const pattern = new SoundPattern(roomId, 'textural', {
          frequency: freq,
          amplitude: 0.4 / (index + 1), // Diminishing amplitude
          waveform: 'sawtooth',
          envelope: {
            attack: 0.3 * this.goldenRatio ** index,
            decay: 0.4,
            sustain: 0.7,
            release: 0.8 * this.goldenRatio ** index
          }
        })
        patterns.push(pattern)
      }
    })

    return patterns
  }

  calculateBaseFrequency(memoryState) {
    const patterns = memoryState.gesturePatterns.slice(-10)
    if (patterns.length === 0) return 220

    const avgX = patterns.reduce((sum, p) => sum + p.coordinates.x, 0) / patterns.length
    return 220 + (avgX * 440) // 220-660 Hz range
  }

  generateFractalSeries(baseFreq, complexity) {
    const series = [baseFreq]
    const iterations = Math.floor(complexity * this.iterations) + 2

    for (let i = 1; i < iterations; i++) {
      const freq = baseFreq * (this.goldenRatio ** i) % 2000 + 220
      series.push(freq)
    }

    return series
  }
}

/**
 * Markov Chain-based pattern generator
 */
class MarkovChainGenerator extends GenerationAlgorithm {
  constructor() {
    super('markov')
    this.stateOrder = 2 // Second-order Markov chain
  }

  generatePatterns(roomId, memoryState, strategy) {
    const chain = this.buildMarkovChain(memoryState)
    const patterns = []

    const sequenceLength = Math.floor(strategy.complexity * 6) + 2
    const sequence = this.generateSequence(chain, sequenceLength)

    sequence.forEach((state, index) => {
      if (index < 4) { // Limit to 4 patterns
        const pattern = this.stateToPattern(roomId, state, index, strategy)
        if (pattern) patterns.push(pattern)
      }
    })

    return patterns
  }

  buildMarkovChain(memoryState) {
    const chain = new Map()
    const patterns = memoryState.gesturePatterns.slice(-50)

    for (let i = this.stateOrder; i < patterns.length; i++) {
      const states = patterns.slice(i - this.stateOrder, i).map(p => this.patternToState(p))
      const nextState = this.patternToState(patterns[i])
      const key = states.join(',')

      if (!chain.has(key)) {
        chain.set(key, [])
      }
      chain.get(key).push(nextState)
    }

    return chain
  }

  patternToState(pattern) {
    const x = Math.floor(pattern.coordinates.x * 4)
    const y = Math.floor(pattern.coordinates.y * 4)
    const intensity = Math.floor(pattern.intensity * 2)
    return `${x},${y},${intensity}`
  }

  generateSequence(chain, length) {
    if (chain.size === 0) return []

    const keys = Array.from(chain.keys())
    let currentKey = keys[Math.floor(Math.random() * keys.length)]
    const sequence = currentKey.split(',')

    for (let i = 0; i < length - this.stateOrder; i++) {
      const nextStates = chain.get(currentKey)
      if (!nextStates || nextStates.length === 0) break

      const nextState = nextStates[Math.floor(Math.random() * nextStates.length)]
      sequence.push(nextState)

      // Update current key for next iteration
      const keyStates = currentKey.split(',').slice(1)
      keyStates.push(nextState)
      currentKey = keyStates.join(',')
    }

    return sequence.slice(this.stateOrder)
  }

  stateToPattern(roomId, state, index, strategy) {
    const [x, y, intensity] = state.split(',').map(Number)

    return new SoundPattern(roomId, 'harmonic', {
      frequency: 220 + (x * 110) + (y * 55),
      amplitude: 0.3 + (intensity * 0.3),
      waveform: ['sine', 'triangle', 'sawtooth'][index % 3],
      envelope: {
        attack: 0.1 + (strategy.collaborativeIntensity * 0.2),
        decay: 0.2,
        sustain: 0.6 + (intensity * 0.2),
        release: 0.4 + (y * 0.1)
      }
    })
  }
}

/**
 * Simplified Neural Network-inspired pattern generator
 */
class NeuralPatternGenerator extends GenerationAlgorithm {
  constructor() {
    super('neural')
    this.weights = this.initializeWeights()
  }

  initializeWeights() {
    const weights = {
      frequency: Array.from({ length: 8 }, () => Math.random() * 2 - 1),
      amplitude: Array.from({ length: 8 }, () => Math.random() * 2 - 1),
      envelope: Array.from({ length: 8 }, () => Math.random() * 2 - 1)
    }
    return weights
  }

  generatePatterns(roomId, memoryState, strategy) {
    const patterns = []
    const inputs = this.extractInputs(memoryState, strategy)

    const patternCount = Math.floor(strategy.complexity * 3) + 1

    for (let i = 0; i < patternCount; i++) {
      const patternInputs = this.perturbInputs(inputs, i * 0.3)
      const outputs = this.processInputs(patternInputs)
      const pattern = this.outputsToPattern(roomId, outputs, i)
      patterns.push(pattern)
    }

    return patterns
  }

  extractInputs(memoryState, strategy) {
    const recentPatterns = memoryState.gesturePatterns.slice(-8)
    const inputs = Array(8).fill(0)

    recentPatterns.forEach((pattern, index) => {
      if (index < 8) {
        inputs[index] = (pattern.coordinates.x + pattern.coordinates.y + pattern.intensity) / 3
      }
    })

    return inputs
  }

  perturbInputs(inputs, perturbation) {
    return inputs.map(input => input + (Math.random() - 0.5) * perturbation)
  }

  processInputs(inputs) {
    const outputs = {
      frequency: this.activate(this.dotProduct(inputs, this.weights.frequency)),
      amplitude: this.activate(this.dotProduct(inputs, this.weights.amplitude)),
      envelope: this.activate(this.dotProduct(inputs, this.weights.envelope))
    }

    return outputs
  }

  dotProduct(a, b) {
    return a.reduce((sum, val, index) => sum + val * b[index], 0)
  }

  activate(x) {
    return 1 / (1 + Math.exp(-x)) // Sigmoid activation
  }

  outputsToPattern(roomId, outputs, index) {
    return new SoundPattern(roomId, ['ambient', 'harmonic', 'textural'][index % 3], {
      frequency: 220 + outputs.frequency * 660,
      amplitude: outputs.amplitude * 0.6,
      waveform: 'sine',
      envelope: {
        attack: 0.1 + outputs.envelope * 0.3,
        decay: 0.2,
        sustain: 0.7,
        release: 0.4 + outputs.envelope * 0.4
      }
    })
  }
}

/**
 * Fibonacci Sequence-based pattern generator
 */
class FibonacciSequenceGenerator extends GenerationAlgorithm {
  constructor() {
    super('fibonacci')
    this.sequence = this.generateFibonacci(20)
  }

  generateFibonacci(length) {
    const fib = [1, 1]
    for (let i = 2; i < length; i++) {
      fib[i] = fib[i-1] + fib[i-2]
    }
    return fib
  }

  generatePatterns(roomId, memoryState, strategy) {
    const patterns = []
    const baseFreq = 220

    const patternCount = Math.min(4, Math.floor(strategy.harmonicPreference * 6) + 1)

    for (let i = 0; i < patternCount; i++) {
      const fibRatio = this.sequence[i + 3] / this.sequence[i + 2]
      const frequency = baseFreq * fibRatio

      const pattern = new SoundPattern(roomId, 'harmonic', {
        frequency: frequency % 1760 + 220, // Keep in musical range
        amplitude: 0.4 / (i + 1), // Diminishing amplitude
        waveform: 'sine',
        envelope: {
          attack: 0.2 * fibRatio / 2,
          decay: 0.3,
          sustain: 0.8,
          release: 0.5 * fibRatio / 2
        }
      })

      patterns.push(pattern)
    }

    return patterns
  }
}

/**
 * Chaos Theory-based pattern generator
 */
class ChaosTheoryGenerator extends GenerationAlgorithm {
  constructor() {
    super('chaos')
    this.lorenzParams = { sigma: 10, rho: 28, beta: 8/3 }
  }

  generatePatterns(roomId, memoryState, strategy) {
    const patterns = []
    const chaosData = this.generateLorenzAttractor(strategy.complexity)

    const patternCount = Math.min(3, Math.floor(strategy.diversity * 4) + 1)

    for (let i = 0; i < patternCount; i++) {
      const point = chaosData[i % chaosData.length]
      const pattern = this.chaosPointToPattern(roomId, point, i, strategy)
      patterns.push(pattern)
    }

    return patterns
  }

  generateLorenzAttractor(complexity) {
    const points = []
    let x = 1, y = 1, z = 1
    const dt = 0.01
    const iterations = Math.floor(complexity * 100) + 20

    for (let i = 0; i < iterations; i++) {
      const dx = this.lorenzParams.sigma * (y - x)
      const dy = x * (this.lorenzParams.rho - z) - y
      const dz = x * y - this.lorenzParams.beta * z

      x += dx * dt
      y += dy * dt
      z += dz * dt

      if (i % 5 === 0) { // Sample every 5th point
        points.push({ x, y, z })
      }
    }

    return points
  }

  chaosPointToPattern(roomId, point, index, strategy) {
    // Normalize chaos coordinates to musical parameters
    const frequency = 220 + ((point.x + 20) / 40) * 660 // Normalize x to 220-880 Hz
    const amplitude = Math.max(0.1, Math.min(0.6, (point.y + 30) / 60))
    const envMod = (point.z + 50) / 100

    return new SoundPattern(roomId, 'textural', {
      frequency,
      amplitude,
      waveform: ['square', 'sawtooth', 'triangle'][index % 3],
      envelope: {
        attack: 0.1 + envMod * 0.3,
        decay: 0.2 + envMod * 0.2,
        sustain: 0.5 + envMod * 0.3,
        release: 0.3 + envMod * 0.4
      }
    })
  }
}

module.exports = SoundPatternGenerator