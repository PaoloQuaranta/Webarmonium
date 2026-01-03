/**
 * LandingCompositionService
 * Generates real-time musical compositions from web metrics using CompositionEngine
 *
 * Architecture (Identical to BackgroundCompositionService):
 * - Uses CompositionEngine with 6 generative algorithms
 * - Treats web metrics as "virtual gestures" that feed into the composition system
 * - Emits background-composition events for frontend playback
 * - Virtual cursors provide visual context
 *
 * Key Difference from BackgroundCompositionService:
 * - Instead of real user gestures, uses web metrics (Wikipedia, HN, GitHub) as input
 * - Continuously generates compositions (doesn't wait for user interaction)
 */

const MaterialLibrary = require('./MaterialLibrary')
const StyleAnalyzer = require('./StyleAnalyzer')
const HarmonicEngine = require('./HarmonicEngine')
const CompositionEngine = require('./CompositionEngine')
const PhraseMorphology = require('./PhraseMorphology')

class LandingCompositionService {
  constructor() {
    // Initialize musical components (same as BackgroundCompositionService)
    this.materialLibrary = new MaterialLibrary()
    this.styleAnalyzer = new StyleAnalyzer()
    this.harmonicEngine = new HarmonicEngine()
    this.phraseMorphology = new PhraseMorphology()
    this.compositionEngine = new CompositionEngine(
      this.materialLibrary,
      this.styleAnalyzer,
      this.harmonicEngine
    )

    // Landing room ID
    this.landingRoomId = 'landing-room'

    // Current metrics state
    this.metrics = {
      wikipedia: { editsPerMinute: 0, newArticles: 0, avgEditSize: 0 },
      hackernews: { postsPerMinute: 0, avgUpvotes: 0, commentCount: 0 },
      github: { commitsPerMinute: 0, openPRs: 0, newStars: 0 }
    }

    // Statistical tracking for DYNAMIC NORMALIZATION
    // Tracks historical min/max to achieve MAXIMUM musical variety
    this.metricStatistics = {
      wikipedia: {
        editsPerMinute: { min: Infinity, max: 0, samples: [] },
        newArticles: { min: Infinity, max: 0, samples: [] },
        avgEditSize: { min: Infinity, max: 0, samples: [] }
      },
      hackernews: {
        postsPerMinute: { min: Infinity, max: 0, samples: [] },
        avgUpvotes: { min: Infinity, max: 0, samples: [] },
        commentCount: { min: Infinity, max: 0, samples: [] }
      },
      github: {
        commitsPerMinute: { min: Infinity, max: 0, samples: [] },
        openPRs: { min: Infinity, max: 0, samples: [] },
        newStars: { min: Infinity, max: 0, samples: [] }
      }
    }
    this.maxSamples = 100 // Keep last 100 samples for dynamic range calculation

    // Service state
    this.isRunning = false
    this.compositionCount = 0
    this.compositionTimer = null

    // Clock for quantization (120 BPM, 16 ticks per measure)
    this.clockTick = 0
    this.ticksPerMeasure = 16

    // Virtual user definitions (for cursor display and material generation)
    this.virtualUsers = {
      wikipedia: {
        userId: 'wikipedia-metrics',
        color: '#e41a1c',
        region: { xMin: 0.0, xMax: 0.33 },
        baseFrequency: 261.63 // C4
      },
      hackernews: {
        userId: 'hackernews-metrics',
        color: '#ff7f00',
        region: { xMin: 0.33, xMax: 0.50 }, // Adjusted for expanded GitHub region
        baseFrequency: 329.63 // E4
      },
      github: {
        userId: 'github-metrics',
        color: '#377eb8',
        region: { xMin: 0.50, xMax: 0.95 }, // Reduced from 1.0 to keep cursor visible
        baseFrequency: 392.00 // G4
      }
    }

    // Current cursor positions for interpolation
    this.currentPositions = {
      wikipedia: { x: 0.16, y: 0.5 },
      hackernews: { x: 0.41, y: 0.5 }, // Adjusted (center of 0.33-0.50 region)
      github: { x: 0.75, y: 0.5 } // Adjusted (center of 0.50-1.0 region)
    }

    // Target positions (for interpolation)
    this.targetPositions = {
      wikipedia: { x: 0.16, y: 0.5 },
      hackernews: { x: 0.41, y: 0.5 }, // Adjusted (center of 0.33-0.50 region)
      github: { x: 0.75, y: 0.5 } // Adjusted (center of 0.50-1.0 region)
    }

    // Cursor interpolation timer
    this.cursorInterpolationTimer = null

    // Virtual gesture history for each source
    this.virtualGestureHistory = {
      wikipedia: [],
      hackernews: [],
      github: []
    }

    // Socket.io instance (set by server)
    this.io = null

    // WebMetricsPoller reference (set by server) for velocity/acceleration
    this.webMetricsPoller = null

    // Gesture generation config
    this.gestureConfig = {
      tapThreshold: 5,  // Velocity below this = tap, above = drag
      minNoteInterval: 200,  // ms
      maxNoteInterval: 2000,  // ms
      densityMultiplier: 0.3  // 30% of normal room density (more active)
    }

    console.log('🎵 LandingCompositionService initialized (CompositionEngine mode)')
  }

  /**
   * Set Socket.IO instance for broadcasting
   * @param {SocketIO} io - Socket.IO instance
   */
  setSocketIO(io) {
    this.io = io
    console.log('🎵 LandingCompositionService: Socket.IO connected')
  }

  /**
   * Set GestureToMusicService (for harmonic sync)
   * @param {GestureToMusicService} gestureService - GestureToMusicService instance
   */
  setGestureToMusicService(gestureService) {
    this.gestureToMusicService = gestureService
  }

  /**
   * Set WebMetricsPoller for velocity/acceleration data
   * @param {WebMetricsPoller} poller - WebMetricsPoller instance
   */
  setWebMetricsPoller(poller) {
    this.webMetricsPoller = poller
    console.log('🎵 LandingCompositionService: WebMetricsPoller connected')
  }

  /**
   * Set density multiplier for gesture generation tuning
   * @param {number} multiplier - Density multiplier (0.1 = sparse, 1.0 = normal room density)
   */
  setDensityMultiplier(multiplier) {
    this.gestureConfig.densityMultiplier = Math.max(0.1, Math.min(1.0, multiplier))
    console.log(`🎵 Gesture density multiplier set to ${this.gestureConfig.densityMultiplier}`)
  }

  /**
   * Update metric statistics for DYNAMIC NORMALIZATION
   * Tracks min/max values to achieve MAXIMUM musical variety
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @param {string} metricName - Metric name (editsPerMinute, postsPerMinute, etc.)
   * @param {number} value - Current metric value
   * @private
   */
  updateMetricStatistics(source, metricName, value) {
    const stats = this.metricStatistics[source]?.[metricName]
    if (!stats) return

    // Update min/max
    stats.min = Math.min(stats.min, value)
    stats.max = Math.max(stats.max, value)

    // Add to samples array (keep last N samples)
    stats.samples.push(value)
    if (stats.samples.length > this.maxSamples) {
      stats.samples.shift()
    }

    // Log when range expands (for debugging)
    if (stats.min === value || stats.max === value) {
      console.log(`📊 ${source}.${metricName} range expanded: [${stats.min.toFixed(2)}, ${stats.max.toFixed(2)}]`)
    }
  }

  /**
   * DYNAMIC NORMALIZATION based on HISTORICAL RANGE
   * Maps metric values to [0, 1] using ACTUAL observed min/max
   * This ensures MAXIMUM musical variety from metric variations
   * @param {string} source - Source name
   * @param {string} metricName - Metric name
   * @param {number} value - Current metric value
   * @returns {number} Normalized value [0, 1]
   * @private
   */
  normalizeMetricDynamic(source, metricName, value) {
    const stats = this.metricStatistics[source]?.[metricName]
    if (!stats) {
      console.log(`📊 No stats for ${source}.${metricName}, returning 0.5`)
      return 0.5 // Default if no stats
    }

    // If no range yet, return 0.5
    if (stats.min === Infinity || stats.max === 0) {
      console.log(`📊 No range yet for ${source}.${metricName} (min=${stats.min}, max=${stats.max}), returning 0.5`)
      return 0.5
    }

    // DYNAMIC normalization: (value - min) / (max - min)
    // As range expands, normalization adapts
    const range = stats.max - stats.min
    if (range === 0) {
      console.log(`📊 Zero range for ${source}.${metricName}, returning 0.5`)
      return 0.5
    }

    const normalized = (value - stats.min) / range

    // Clamp to [0, 1]
    const result = Math.max(0, Math.min(1, normalized))

    // Log when result is significantly different from 0.5
    if (result < 0.3 || result > 0.7) {
      console.log(`📊 ${source}.${metricName}: ${value.toFixed(1)} → ${result.toFixed(2)} (range: ${stats.min.toFixed(1)}-${stats.max.toFixed(1)})`)
    }

    return result
  }

  /**
   * Start landing composition service
   */
  start() {
    if (this.isRunning) return

    this.isRunning = true

    // Start cursor interpolation
    this.startCursorInterpolation()

    // Start composition cycle (generates gestures + background)
    this.scheduleNextComposition()

    console.log('🎵 LandingCompositionService started')
  }

  /**
   * Stop landing composition service
   */
  stop() {
    if (!this.isRunning) return

    this.isRunning = false

    // Clear composition timer
    if (this.compositionTimer) {
      clearTimeout(this.compositionTimer)
      this.compositionTimer = null
    }

    // Clear cursor interpolation timer
    if (this.cursorInterpolationTimer) {
      clearInterval(this.cursorInterpolationTimer)
      this.cursorInterpolationTimer = null
    }

    console.log('🎵 LandingCompositionService stopped')
  }

  /**
   * Calculate activity level for a source (0.0-1.0)
   * Uses DYNAMIC NORMALIZATION based on HISTORICAL min/max
   * This ensures MAXIMUM musical variety from metric variations
   * NO hardcoded thresholds - adapts to actual data range
   * @param {string} source - Source name
   * @returns {number} Activity level (0.0-1.0)
   * @private
   */
  calculateActivityLevel(source) {
    const metrics = this.metrics[source]
    switch (source) {
      case 'wikipedia':
        // DYNAMIC: Uses historical range of editsPerMinute
        return this.normalizeMetricDynamic(source, 'editsPerMinute', metrics.editsPerMinute)
      case 'hackernews':
        // DYNAMIC: Uses historical range of postsPerMinute
        return this.normalizeMetricDynamic(source, 'postsPerMinute', metrics.postsPerMinute)
      case 'github':
        // DYNAMIC: Uses historical range of commitsPerMinute
        return this.normalizeMetricDynamic(source, 'commitsPerMinute', metrics.commitsPerMinute)
      default:
        return 0
    }
  }

  /**
   * HYBRID normalization: Logarithmic scaling with soft sigmoid cap for extreme outliers
   * Preserves variation for normal range, prevents extreme values from dominating
   * @param {number} value - The value to normalize
   * @param {number} referencePoint - The "normal" value (maps to ~0.7)
   * @param {number} maxCap - The maximum expected value (maps to ~0.95)
   * @returns {number} Normalized value (0.0-1.0)
   * @private
   */
  softNormalize(value, referencePoint, maxCap) {
    // Logarithmic scaling for normal range (0 to referencePoint)
    const logNorm = Math.log1p(value) / Math.log1p(referencePoint)

    // Soft sigmoid cap for extreme values (> referencePoint)
    // Maps referencePoint → 0.7, maxCap → 0.95
    if (value <= referencePoint) {
      return logNorm * 0.7  // 0 to 0.7 range for normal values
    } else {
      const excessRatio = (value - referencePoint) / (maxCap - referencePoint)
      const sigmoidCap = 0.7 + (0.25 * (1 / (1 + Math.exp(-5 * (excessRatio - 0.5)))))
      return Math.min(0.95, sigmoidCap)
    }
  }

  /**
   * Calculate overall activity level (0.0-1.0)
   * @returns {number} Overall activity level
   * @private
   */
  calculateOverallActivity() {
    const wikiActivity = this.calculateActivityLevel('wikipedia')
    const hnActivity = this.calculateActivityLevel('hackernews')
    const ghActivity = this.calculateActivityLevel('github')
    return (wikiActivity + hnActivity + ghActivity) / 3
  }

  /**
   * Generate gesture for a SINGLE source
   * Each source gestures independently based on its own metrics
   * @param {string} source - Source name
   * @private
   */
  async generateGestureForSource(source) {
    if (!this.io || !this.isRunning) return

    const velocity = this.webMetricsPoller?.getVelocity(source) || 0
    const acceleration = this.webMetricsPoller?.getAcceleration(source) || 0
    const metrics = this.metrics[source]
    const activity = this.calculateActivityLevel(source)

    // Generate gesture
    const gesture = this.generateVirtualGesture(source, metrics, velocity, acceleration)

    // Emit notes for this gesture
    await this.emitVirtualGestureNotes(gesture)

    // Add material for composition engine
    this.addVirtualGestureMaterial(source)

    console.log(`🎵 Gesture from ${source} (activity: ${activity.toFixed(2)}, vel: ${velocity.toFixed(1)})`)
  }

  /**
   * Generate virtual gestures based on CURRENT metrics
   * Each source gestures based on its activity level
   * @returns {Array} Array of gestures
   * @private
   */
  generateMetricDrivenGestures() {
    const gestures = []
    const sources = Object.keys(this.virtualUsers)

    for (const source of sources) {
      const velocity = this.webMetricsPoller?.getVelocity(source) || 0
      const acceleration = this.webMetricsPoller?.getAcceleration(source) || 0
      const metrics = this.metrics[source]
      const activity = this.calculateActivityLevel(source)

      // Generate gesture for this source
      const gesture = this.generateVirtualGesture(source, metrics, velocity, acceleration)
      gestures.push(gesture)

      console.log(`🎵 Generated gesture from ${source} (activity: ${activity.toFixed(2)}, vel: ${velocity.toFixed(1)})`)
    }

    return gestures
  }

  /**
   * Generate virtual gesture using PhraseMorphology
   * Replaces generateVirtualTap() and generateVirtualDrag()
   * @param {string} source - Source name
   * @param {Object} metrics - Current metrics
   * @param {number} velocity - Current velocity
   * @param {number} acceleration - Current acceleration
   * @returns {Object} Gesture data for GestureToMusicService
   * @private
   */
  generateVirtualGesture(source, metrics, velocity, acceleration) {
    const user = this.virtualUsers[source]
    const cursor = this.targetPositions[source]

    return {
      type: 'drag',
      source: source,
      velocity: velocity,
      acceleration: acceleration,
      position: cursor
    }
  }

  /**
   * Map velocity to note interval using logarithmic scaling
   * @param {number} velocity - Velocity value
   * @returns {number} Note interval in milliseconds (200-2000ms)
   * @private
   */
  mapVelocityToInterval(velocity) {
    const absVelocity = Math.abs(velocity)
    const densityMultiplier = this.gestureConfig.densityMultiplier

    // Logarithmic mapping: velocity → interval
    // High velocity = low interval (fast notes), Low velocity = high interval (slow notes)
    const baseInterval = 200 * Math.pow(10, 1 - (1 / (1 + absVelocity * densityMultiplier)))
    return Math.min(this.gestureConfig.maxNoteInterval, Math.max(this.gestureConfig.minNoteInterval, baseInterval))
  }

  /**
   * Extract modulation parameters from virtual gestures
   * Gestures CONTROL the background composition (like normal rooms)
   * @param {Array} gestures - Array of virtual gestures
   * @returns {Object} Modulation parameters for CompositionEngine
   * @private
   */
  extractModulationParams(gestures) {
    if (!gestures || gestures.length === 0) {
      return {
        tempoMultiplier: 1.0,
        densityMultiplier: 0.5,
        registerShift: 0,
        hasTaps: false,
        hasDrags: false,
        articulation: 'legato'
      }
    }

    // Calculate average velocity and position
    const avgVelocity = gestures.reduce((sum, g) => sum + (g.velocity || 0), 0) / gestures.length
    const avgPosition = gestures.reduce((sum, g) => sum + (g.position?.y || 0.5), 0) / gestures.length

    // Count gesture types
    const hasTaps = gestures.some(g => g.type === 'tap')
    const hasDrags = gestures.some(g => g.type === 'drag')

    return {
      // Drag velocity → Tempo (faster gestures = faster composition)
      tempoMultiplier: 0.8 + Math.min(avgVelocity / 10, 0.4),  // 0.8x to 1.2x

      // Gesture density → Note density
      densityMultiplier: 0.5 + Math.min(gestures.length * 0.1, 0.5),  // 0.5x to 1.0x

      // Position Y → Register (higher = higher pitch range)
      registerShift: (avgPosition - 0.5) * 2,  // -1 to +1 octave

      // Gesture types → Texture
      hasTaps: hasTaps,
      hasDrags: hasDrags,

      // Velocity trend → Articulation
      articulation: avgVelocity > 5 ? 'staccato' : 'legato'
    }
  }

  /**
   * Add virtual gesture material from metrics (same pattern as BackgroundCompositionService.addMaterial)
   * @param {string} source - Source name
   * @private
   */
  addVirtualGestureMaterial(source) {
    const gesture = this.generateVirtualGesture(source)
    return this.addVirtualGestureMaterialFromGesture(gesture)
  }

  /**
   * Add virtual gesture material from an existing gesture object
   * Used when gesture is already generated (in composition cycle)
   * @param {Object} gesture - Gesture object with source, velocity, acceleration, position
   * @returns {string} Material ID
   * @private
   */
  addVirtualGestureMaterialFromGesture(gesture) {
    const source = gesture.source

    // Create virtualGesture structure compatible with material library
    const virtualGesture = {
      gesture: {
        ...gesture,
        duration: 1000, // Default duration for material
        intensity: gesture.acceleration || 0
      },
      notes: [], // No notes for simple gesture material
      timestamp: Date.now()
    }

    // Calculate gesture weight (all virtual gestures have moderate weight)
    const gestureWeight = 0.5

    // Convert to material format (same as BackgroundCompositionService)
    const material = {
      notes: virtualGesture.notes || [],
      duration: virtualGesture.gesture.duration || 1000,
      userId: this.virtualUsers[source].userId,
      gestureData: { userId: this.virtualUsers[source].userId, gesture: virtualGesture.gesture },
      weight: gestureWeight,
      timestamp: Date.now()
    }

    // Add to material library
    const materialId = this.materialLibrary.addMaterial(material)

    // Normalize gesture for StyleAnalyzer
    // Handle empty notes array
    let velocity
    if (virtualGesture.notes.length > 0) {
      const avgNoteVelocity = virtualGesture.notes.reduce((sum, note) => sum + note.velocity, 0) / virtualGesture.notes.length
      velocity = avgNoteVelocity * 100
    } else {
      // Use gesture velocity directly when no notes
      velocity = (gesture.velocity || 0) * 10
    }

    const acceleration = virtualGesture.gesture.intensity * 50

    let interOnsetInterval
    if (virtualGesture.notes.length >= 2) {
      interOnsetInterval = 150 // Average interval between generated notes
    }

    const normalizedGesture = {
      ...virtualGesture.gesture,
      velocity,
      acceleration,
      interOnsetInterval,
      timestamp: virtualGesture.timestamp
    }

    // Accumulate gestures for analysis
    this.virtualGestureHistory[source].push(normalizedGesture)
    if (this.virtualGestureHistory[source].length > 10) {
      this.virtualGestureHistory[source] = this.virtualGestureHistory[source].slice(-10)
    }

    // Update style analyzer with combined gesture history from all sources
    const allGestures = [
      ...this.virtualGestureHistory.wikipedia,
      ...this.virtualGestureHistory.hackernews,
      ...this.virtualGestureHistory.github
    ]

    if (allGestures.length > 0) {
      this.styleAnalyzer.analyzeGestureStyle(allGestures, gestureWeight)
      this.applyStyleToComposition()
    }

    return materialId
  }

  /**
   * Apply analyzed style to composition parameters (same as BackgroundCompositionService)
   * With tempo capping and reduced density for landing page
   * @private
   */
  applyStyleToComposition() {
    const style = this.styleAnalyzer.getCurrentStyle()

    // Map style to composition parameters - CAP TEMPO to reasonable range
    this.compositionEngine.tempo = Math.max(60, Math.min(140, Math.round(style.tempo)))

    const { keyCenter, mode } = this.selectKeyAndMode(style)
    if (keyCenter !== this.compositionEngine.keyCenter || mode !== this.compositionEngine.mode) {
      this.compositionEngine.keyCenter = keyCenter
      this.compositionEngine.mode = mode
      console.log(`🎵 Style influenced composition: ${keyCenter} ${mode}, tempo ${this.compositionEngine.tempo}`)
    }

    // REDUCE density to avoid polyphony issues (max 0.4 instead of 0.9)
    this.compositionEngine.complexityLevel = Math.min(0.5, Math.max(0.1, style.energy * 0.6))
    this.compositionEngine.density = Math.min(0.4, Math.max(0.1, style.energy * 0.6))
  }

  /**
   * Select key and mode based on style analysis (same as BackgroundCompositionService)
   * @private
   */
  selectKeyAndMode(style) {
    const modalFlavor = style.harmonicComplexity?.modalFlavor || 'major'

    const modeMap = {
      'major': 'ionian',
      'minor': 'aeolian',
      'dorian': 'dorian',
      'phrygian': 'phrygian',
      'lydian': 'lydian',
      'mixolydian': 'mixolydian',
      'locrian': 'locrian'
    }
    const mode = modeMap[modalFlavor] || 'ionian'

    const energy = style.energy || 0.5
    const keys = ['F', 'C', 'G', 'D', 'A', 'E']
    const keyIndex = Math.floor(energy * (keys.length - 1))
    const keyCenter = keys[keyIndex]

    return { keyCenter, mode }
  }

  /**
   * Schedule next composition
   * REDUCED interval from 8-15s to 2s for faster response to metrics
   * @private
   */
  scheduleNextComposition() {
    if (!this.isRunning) return

    // FIXED INTERVAL: 2 seconds for faster metric response
    const interval = 2000

    this.compositionTimer = setTimeout(() => {
      this.generateAndBroadcastComposition()
      this.scheduleNextComposition()
    }, interval)

    console.log(`🎵 Next composition in ${(interval / 1000).toFixed(1)}s`)
  }

  /**
   * Generate and broadcast composition using metric-driven virtual gestures
   * NEW ARCHITECTURE: Gestures CONTROL the background composition
   * @private
   */
  async generateAndBroadcastComposition() {
    try {
      console.log(`🎵 Generating composition cycle ${this.compositionCount} (gestures + background)`)

      // STEP 1: Generate metric-driven gestures for ALL sources
      const virtualGestures = this.generateMetricDrivenGestures()

      console.log(`🎵 Generated ${virtualGestures.length} gestures:`,
        virtualGestures.map(g => `${g.source}`).join(', '))

      // STEP 2: Emit gesture notes with QUANTIZED timing on the grid
      // Each gesture is scheduled at its quantized tick position
      const tickDuration = 250 // 250ms per tick (120 BPM, 16th notes)

      for (let i = 0; i < virtualGestures.length; i++) {
        const gesture = virtualGestures[i]
        // Assign tick based on source and gesture index (distribute on grid)
        // Wikipedia: ticks 0, 4, 8, 12 (beats)
        // HackerNews: ticks 2, 6, 10, 14 (off-beats)
        // GitHub: ticks 1, 5, 9, 13 (upbeats)
        let tick
        switch (gesture.source) {
          case 'wikipedia':
            tick = (this.clockTick + 0) % 16
            break
          case 'hackernews':
            tick = (this.clockTick + 2) % 16
            break
          case 'github':
            tick = (this.clockTick + 1) % 16
            break
        }

        // Schedule gesture emission at quantized tick
        const delay = tick * tickDuration
        setTimeout(async () => {
          await this.emitVirtualGestureNotes(gesture)
          this.addVirtualGestureMaterialFromGesture(gesture)
        }, delay)

        console.log(`🎵 Scheduled ${gesture.source} gesture at tick ${tick} (${delay}ms)`)
      }

      // STEP 3: Extract modulation params from gestures
      const modulationParams = this.extractModulationParams(virtualGestures)

      // STEP 4: Apply modulation to CompositionEngine
      const baseTempo = this.styleAnalyzer.getCurrentStyle()?.tempo || 120
      this.compositionEngine.tempo = Math.round(baseTempo * modulationParams.tempoMultiplier)
      this.compositionEngine.tempo = Math.max(60, Math.min(160, this.compositionEngine.tempo))

      this.compositionEngine.density = Math.max(0.1, Math.min(0.6, modulationParams.densityMultiplier))
      this.compositionEngine.complexityLevel = Math.max(0.1, Math.min(0.6, modulationParams.densityMultiplier))

      // STEP 5: Generate background composition
      this.compositionCount++
      const composition = this.compositionEngine.compose({
        roomId: this.landingRoomId,
        userCount: 3,
        activeUsers: [
          this.virtualUsers.wikipedia.userId,
          this.virtualUsers.hackernews.userId,
          this.virtualUsers.github.userId
        ],
        modulationParams: modulationParams
      })

      console.log(`🎵 Generated ${composition.type} composition #${this.compositionCount}`)

      // STEP 6: Broadcast background composition
      if (this.io) {
        this.io.to(this.landingRoomId).emit('background-composition', {
          roomId: this.landingRoomId,
          composition,
          compositionNumber: this.compositionCount,
          modulationParams: modulationParams,
          timestamp: Date.now()
        })
        console.log(`🎵 Broadcast composition #${this.compositionCount} to landing room`)
      }

      // Advance clock for next cycle
      this.clockTick = (this.clockTick + 4) % 16 // Advance by 1 beat (4 ticks)

      // Update material library lifecycle
      this.materialLibrary.updateMaterialLifecycle()

    } catch (error) {
      console.error(`🎵 Error generating composition:`, error)
    }
  }

  /**
   * Emit virtual gesture notes using DIRECT metric-to-music mapping
   * CRITICAL: Preserves REAL correspondence between metrics and music
   * Frequency calculated from cursor Y position
   * Duration calculated from metric activity
   * @param {Object} gesture - Virtual gesture data
   * @private
   */
  async emitVirtualGestureNotes(gesture) {
    if (!this.io || !this.isRunning) return

    const user = this.virtualUsers[gesture.source]
    const cursor = this.targetPositions[gesture.source]
    const activity = this.calculateActivityLevel(gesture.source)

    // CRITICAL: Calculate frequency DIRECTLY from cursor position (metric-based)
    // Y position maps to semitones, which map to frequency
    // This preserves REAL correspondence: higher cursor = higher pitch
    const semitones = Math.round((cursor.y - 0.5) * 24) // -12 to +12 semitones
    const frequency = user.baseFrequency * Math.pow(2, semitones / 12)

    // CRITICAL: Calculate duration DIRECTLY from metric activity
    // Higher activity = shorter, more frequent notes (real-time response)
    // Lower activity = longer, sustained notes (sparse events)
    const duration = 500 + (1 - activity) * 2500  // 500-3000ms (inverse relationship)

    // Velocity from gesture determines intensity
    const velocity = Math.min(Math.abs(gesture.velocity || 0) / 10, 1.0) // Normalize to 0-1

    // Generate phrase based on gesture characteristics (DETERMINISTIC, not random)
    // Higher velocity = more notes (drag phrase)
    // Lower velocity = single sustained note (tap)
    const absVelocity = Math.abs(gesture.velocity || 0)
    // DETERMINISTIC: note count based on velocity, no randomness
    const noteCount = Math.max(1, Math.min(5, Math.floor(1 + absVelocity / 5))) // 1-5 notes based on velocity

    console.log(`🎵 METRIC-DRIVEN NOTE from ${gesture.source}: freq=${frequency.toFixed(1)}Hz, dur=${duration.toFixed(0)}ms, count=${noteCount}, activity=${activity.toFixed(2)}`)

    // Emit note(s) with proper timing
    for (let i = 0; i < noteCount; i++) {
      const noteId = `virtual_${gesture.source}_${Date.now()}_${i}`

      // For phrase: add melodic variation (±1 semitone per note)
      const melodyOffset = i * (gesture.acceleration > 0 ? 1 : -1)
      const noteFreq = user.baseFrequency * Math.pow(2, (semitones + melodyOffset) / 12)

      // Delay for each note in phrase (staggered)
      const noteDelay = i * (duration / noteCount)

      setTimeout(() => {
        if (!this.io || !this.isRunning) return

        // Emit hold:start
        this.io.to(this.landingRoomId).emit('hold:start', {
          type: 'hold:start',
          userId: user.userId,
          noteId: noteId,
          frequency: noteFreq,
          velocity: 0.4 + velocity * 0.5, // 0.4-0.9
          duration: (duration / noteCount) / 1000,  // Convert to seconds
          position: cursor,
          userColor: user.color,
          isRemote: true,
          timestamp: Date.now()
        })

        // Schedule hold:end
        setTimeout(() => {
          if (this.io && this.isRunning) {
            this.io.to(this.landingRoomId).emit('hold:end', {
              type: 'hold:end',
              userId: user.userId,
              noteId: noteId,
              timestamp: Date.now()
            })
          }
        }, (duration / noteCount))

      }, noteDelay)
    }
  }

  /**
   * Start smooth cursor interpolation loop
   * @private
   */
  startCursorInterpolation() {
    if (this.cursorInterpolationTimer) return

    // Counter for periodic debug logging (no randomness)
    this.cursorIterationCount = 0

    // Update cursor positions every 50ms (20fps)
    this.cursorInterpolationTimer = setInterval(() => {
      if (!this.isRunning) return

      const cursors = {}

      for (const [source, user] of Object.entries(this.virtualUsers)) {
        const current = this.currentPositions[source]
        const target = this.targetPositions[source]

        // Faster interpolation (20% per frame) for more responsive movement
        const easing = 0.2
        const newX = current.x + (target.x - current.x) * easing
        const newY = current.y + (target.y - current.y) * easing

        this.currentPositions[source] = { x: newX, y: newY }

        cursors[source] = {
          userId: user.userId,
          x: newX,
          y: newY,
          color: user.color
        }
      }

      // Broadcast interpolated cursor positions
      if (this.io) {
        this.io.to(this.landingRoomId).emit('virtual-cursors', {
          cursors: cursors,
          timestamp: Date.now()
        })
        // Debug: Log cursor positions every second (every 20th iteration)
        // NO randomness - use counter-based periodic logging
        this.cursorIterationCount = (this.cursorIterationCount || 0) + 1
        if (this.cursorIterationCount % 20 === 0) {
          const cursorInfo = Object.entries(cursors).map(([s, c]) => `${s}:(${c.x.toFixed(2)},${c.y.toFixed(2)})`).join(' ')
          console.log(`🖱️ Virtual cursors: ${cursorInfo}`)
        }
      }
    }, 50)
  }

  /**
   * Update metrics from WebMetricsPoller
   * Called by WebMetricsPoller when new metrics are available
   * @param {Object} newMetrics - New metrics from WebMetricsPoller
   */
  updateMetrics(newMetrics) {
    this.metrics = newMetrics

    // Update statistical tracking for DYNAMIC NORMALIZATION
    // This builds historical min/max for MAXIMUM musical variety
    for (const [source, metrics] of Object.entries(newMetrics)) {
      for (const [metricName, value] of Object.entries(metrics)) {
        this.updateMetricStatistics(source, metricName, value)
      }
    }

    // Update target cursor positions based on new metrics
    for (const [source, user] of Object.entries(this.virtualUsers)) {
      this.targetPositions[source] = this.calculateCursorPosition(source, user, this.metrics[source])
    }

    // Broadcast metrics to landing room for dashboard display
    if (this.io && this.isRunning) {
      this.io.to(this.landingRoomId).emit('metrics-update', {
        metrics: this.metrics,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Calculate cursor position for a virtual user
   * Uses HYBRID normalization for X position (no hard thresholds)
   * @param {string} source - Source name
   * @param {Object} user - Virtual user definition
   * @param {Object} metrics - Current metrics
   * @returns {Object} Cursor position {x, y}
   * @private
   */
  calculateCursorPosition(source, user, metrics) {
    let x, y

    switch (source) {
      case 'wikipedia':
        // X: Within left third, based on edit rate (HYBRID normalization)
        const wikiNorm = this.softNormalize(metrics.editsPerMinute, 400, 2000)
        const wikiScaled = Math.pow(wikiNorm, 0.5)
        x = user.region.xMin + (wikiScaled * (user.region.xMax - user.region.xMin))
        // Y: Based on edit size (logarithmic scaling)
        y = 0.1 + Math.min(Math.log10(metrics.avgEditSize + 1) / 4, 0.8)
        break
      case 'hackernews':
        // X: Within center third, based on post rate (HYBRID normalization)
        const hnNorm = this.softNormalize(metrics.postsPerMinute, 60, 300)
        const hnScaled = Math.pow(hnNorm, 0.5)
        x = user.region.xMin + (hnScaled * (user.region.xMax - user.region.xMin))
        // Y: Based on avg upvotes (logarithmic scaling)
        y = 0.1 + Math.min(Math.log10(metrics.avgUpvotes + 1) / 3, 0.8)
        break
      case 'github':
        // X: Within right half, based on commit rate (HYBRID normalization)
        const ghNorm = this.softNormalize(metrics.commitsPerMinute, 5, 50)
        const ghScaled = Math.pow(ghNorm, 0.5)
        x = user.region.xMin + (ghScaled * (user.region.xMax - user.region.xMin))
        // SAFETY: Clamp to ensure cursor stays within bounds
        x = Math.max(user.region.xMin, Math.min(user.region.xMax, x))
        // Y: Based on new stars (logarithmic scaling)
        y = 0.1 + Math.min(Math.log10(metrics.newStars + 1) / 2, 0.8)
        // Debug logging - always log for monitoring
        console.log(`🖱️ GitHub cursor:`, {
          commitsPerMinute: metrics.commitsPerMinute,
          ghNorm: ghNorm.toFixed(3),
          calculatedX: x.toFixed(3),
          region: `${user.region.xMin}-${user.region.xMax}`
        })
        break
    }

    return { x, y }
  }

  /**
   * Get current metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      wikipedia: { ...this.metrics.wikipedia },
      hackernews: { ...this.metrics.hackernews },
      github: { ...this.metrics.github }
    }
  }

  /**
   * Get virtual cursor positions
   * @returns {Object} Virtual cursor positions
   */
  getVirtualCursors() {
    const cursors = {}
    for (const [source, user] of Object.entries(this.virtualUsers)) {
      const pos = this.currentPositions[source]
      cursors[source] = {
        userId: user.userId,
        x: pos.x,
        y: pos.y,
        color: user.color
      }
    }
    return cursors
  }
}

module.exports = LandingCompositionService
