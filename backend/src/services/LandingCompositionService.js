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
const HoverOrchestrator = require('./HoverOrchestrator')

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
        avgEditSize: { min: Infinity, max: 0, samples: [] },
        velocity: { min: Infinity, max: 0, samples: [] }  // Track velocity for phrase generation
      },
      hackernews: {
        postsPerMinute: { min: Infinity, max: 0, samples: [] },
        avgUpvotes: { min: Infinity, max: 0, samples: [] },
        commentCount: { min: Infinity, max: 0, samples: [] },
        velocity: { min: Infinity, max: 0, samples: [] }
      },
      github: {
        commitsPerMinute: { min: Infinity, max: 0, samples: [] },
        openPRs: { min: Infinity, max: 0, samples: [] },
        newStars: { min: Infinity, max: 0, samples: [] },
        velocity: { min: Infinity, max: 0, samples: [] }
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
    // DISTRIBUTED regions for cursor coverage across the scene
    // Each source gets its own horizontal third to maximize spatial distribution
    // DIFFERENT TESSITURAS for timbral differentiation
    this.virtualUsers = {
      wikipedia: {
        userId: 'wikipedia-metrics',
        color: '#e41a1c',
        region: { xMin: 0.05, xMax: 0.33 }, // Left third
        baseFrequency: 98.00, // G2 - BASS tessitura
        tessitura: 'bass',
        frequencyRange: { min: 65, max: 130 } // C2-C3
      },
      hackernews: {
        userId: 'hackernews-metrics',
        color: '#ff7f00',
        region: { xMin: 0.33, xMax: 0.66 }, // Center third
        baseFrequency: 293.66, // D4 - TENOR tessitura
        tessitura: 'tenor',
        frequencyRange: { min: 196, max: 392 } // G3-G4
      },
      github: {
        userId: 'github-metrics',
        color: '#377eb8',
        region: { xMin: 0.66, xMax: 0.95 }, // Right third
        baseFrequency: 659.25, // E5 - SOPRANO tessitura
        tessitura: 'soprano',
        frequencyRange: { min: 523, max: 1047 } // C5-C6
      }
    }

    // Current cursor positions for interpolation
    this.currentPositions = {
      wikipedia: { x: 0.5, y: 0.5 },
      hackernews: { x: 0.5, y: 0.5 },
      github: { x: 0.5, y: 0.5 }
    }

    // Target positions (for interpolation)
    this.targetPositions = {
      wikipedia: { x: 0.5, y: 0.5 },
      hackernews: { x: 0.5, y: 0.5 },
      github: { x: 0.5, y: 0.5 }
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
      densityMultiplier: 0.2  // 20% of normal room density - REDUCED to prevent polyphony issues
    }

    // console.log('🎵 LandingCompositionService initialized (CompositionEngine mode)')
  }

  /**
   * Set Socket.IO instance for broadcasting
   * @param {SocketIO} io - Socket.IO instance
   */
  setSocketIO(io) {
    this.io = io
    // Initialize HoverOrchestrator for modulation support
    this.hoverOrchestrator = new HoverOrchestrator(this.landingRoomId, io)
    // console.log('🎵 LandingCompositionService: Socket.IO connected, HoverOrchestrator initialized')
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
    // console.log('🎵 LandingCompositionService: WebMetricsPoller connected')
  }

  /**
   * Set density multiplier for gesture generation tuning
   * @param {number} multiplier - Density multiplier (0.1 = sparse, 1.0 = normal room density)
   */
  setDensityMultiplier(multiplier) {
    this.gestureConfig.densityMultiplier = Math.max(0.1, Math.min(1.0, multiplier))
    // console.log(`🎵 Gesture density multiplier set to ${this.gestureConfig.densityMultiplier}`)
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

    // // Log when range expands (for debugging)
    // if (stats.min === value || stats.max === value) {
    //   console.log(`📊 ${source}.${metricName} range expanded: [${stats.min.toFixed(2)}, ${stats.max.toFixed(2)}]`)
    // }
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
      // console.log(`📊 No stats for ${source}.${metricName}, returning 0.5`)
      return 0.5 // Default if no stats
    }

    // If no range yet, return 0.5
    if (stats.min === Infinity || stats.max === 0) {
      // console.log(`📊 No range yet for ${source}.${metricName} (min=${stats.min}, max=${stats.max}), returning 0.5`)
      return 0.5
    }

    // DYNAMIC normalization: (value - min) / (max - min)
    // As range expands, normalization adapts
    const range = stats.max - stats.min
    if (range === 0) {
      // console.log(`📊 Zero range for ${source}.${metricName}, returning 0.5`)
      return 0.5
    }

    const normalized = (value - stats.min) / range

    // Clamp to [0, 1]
    const result = Math.max(0, Math.min(1, normalized))

    // // Log when result is significantly different from 0.5
    // if (result < 0.3 || result > 0.7) {
    //   console.log(`📊 ${source}.${metricName}: ${value.toFixed(1)} → ${result.toFixed(2)} (range: ${stats.min.toFixed(1)}-${stats.max.toFixed(1)})`)
    // }

    return result
  }

  /**
   * Start landing composition service
   */
  start() {
    if (this.isRunning) return

    this.isRunning = true

    // Start hover orchestrator for modulation support
    if (this.hoverOrchestrator) {
      this.hoverOrchestrator.start()
    }

    // Start cursor interpolation
    this.startCursorInterpolation()

    // Start composition cycle (generates gestures + background)
    this.scheduleNextComposition()

    // console.log('🎵 LandingCompositionService started')
  }

  /**
   * Stop landing composition service
   */
  stop() {
    if (!this.isRunning) return

    this.isRunning = false

    // Stop hover orchestrator
    if (this.hoverOrchestrator) {
      this.hoverOrchestrator.stop()
    }

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

    // console.log('🎵 LandingCompositionService stopped')
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
   * Uses classification to determine gesture type
   * @param {string} source - Source name
   * @private
   */
  async generateGestureForSource(source) {
    if (!this.io || !this.isRunning) return

    const velocity = this.webMetricsPoller?.getVelocity(source) || 0
    const acceleration = this.webMetricsPoller?.getAcceleration(source) || 0

    // Classify gesture type based on metrics
    const gestureType = this.classifyGestureType(source)

    let gesture
    if (gestureType === 'tap') {
      gesture = this.generateVirtualTap(source, velocity)
    } else if (gestureType === 'drag') {
      gesture = this.generateVirtualDrag(source, velocity, acceleration)
    } else if (gestureType === 'hover') {
      gesture = this.generateVirtualHover(source)
      // Hovers go to orchestrator, not direct note emission
      this.hoverOrchestrator?.addHoverEvent({
        userId: this.virtualUsers[source].userId,
        position: gesture.position,
        intensity: gesture.intensity,
        timestamp: Date.now()
      })
      return  // Don't emit notes for hovers
    }

    // Emit notes for this gesture
    await this.emitVirtualGestureNotes(gesture)

    // Add material for composition engine
    this.addVirtualGestureMaterial(source)

    // console.log(`🎵 ${gestureType} from ${source} (vel: ${velocity.toFixed(1)})`)
  }

  /**
   * Generate virtual gestures based on CURRENT metrics
   * Each source gestures based on its activity level
   * Uses classification to determine gesture type (tap/drag/hover)
   * @returns {Object} Object with gestures array and hovers array
   * @private
   */
  generateMetricDrivenGestures() {
    const gestures = []
    const hovers = []
    const sources = Object.keys(this.virtualUsers)

    for (const source of sources) {
      const velocity = this.webMetricsPoller?.getVelocity(source) || 0
      const acceleration = this.webMetricsPoller?.getAcceleration(source) || 0

      // Classify gesture type based on metrics
      const gestureType = this.classifyGestureType(source)

      let gesture
      if (gestureType === 'tap') {
        gesture = this.generateVirtualTap(source, velocity)
        gestures.push(gesture)
      } else if (gestureType === 'drag') {
        gesture = this.generateVirtualDrag(source, velocity, acceleration)
        gestures.push(gesture)
      } else if (gestureType === 'hover') {
        gesture = this.generateVirtualHover(source)
        hovers.push(gesture)
      }

      // console.log(`🎵 Generated ${gestureType} from ${source} (vel: ${velocity.toFixed(1)})`)
    }

    return { gestures, hovers }
  }

  /**
   * Generate virtual tap gesture (stability metric)
   * Short percussive note (0.1s)
   * CRITICAL: Generates gesture position that will drive cursor movement
   * Position represents WHERE the tap occurs in the scene
   * @param {string} source - Source name
   * @param {number} velocity - Current velocity
   * @returns {Object} Tap gesture data
   * @private
   */
  generateVirtualTap(source, velocity) {
    const activity = this.calculateActivityLevel(source)
    const user = this.virtualUsers[source]

    // Generate tap position based on metrics (where tap occurs in the scene)
    // X position: based on activity level (distributed across source's region)
    const x = user.region.xMin + (activity * (user.region.xMax - user.region.xMin))

    // Y position: based on velocity (higher velocity = higher in scene)
    const normalizedVelocity = this.normalizeMetricDynamic(source, 'velocity', Math.abs(velocity))
    const y = 0.1 + (normalizedVelocity * 0.8) // Full vertical range

    const gesturePosition = { x, y }

    // Update target position so cursor moves to where tap occurred
    this.targetPositions[source] = {
      x: Math.max(user.region.xMin, Math.min(user.region.xMax, x)),
      y: Math.max(0.05, Math.min(0.95, y))
    }

    return {
      type: 'tap',
      source: source,
      velocity: velocity,
      position: gesturePosition,
      duration: 100,  // 0.1s percussive
      intensity: activity
    }
  }

  /**
   * Generate virtual drag/phrase gesture (density metric)
   * Continuous note streaming (2-5 notes)
   * CRITICAL: Generates gesture trajectory that will drive cursor movement
   * Position represents start of drag movement
   * @param {string} source - Source name
   * @param {number} velocity - Current velocity
   * @param {number} acceleration - Current acceleration
   * @returns {Object} Drag gesture data
   * @private
   */
  generateVirtualDrag(source, velocity, acceleration) {
    const activity = this.calculateActivityLevel(source)
    const user = this.virtualUsers[source]

    // Generate drag start position based on metrics
    // X position: based on density metric (where drag starts)
    const density = this.calculateDensityMetric(source)
    const x = user.region.xMin + (density * (user.region.xMax - user.region.xMin))

    // Y position: based on acceleration (higher acceleration = higher in scene)
    const absAccel = Math.abs(acceleration)
    const y = 0.1 + (absAccel * 0.8) // Full vertical range

    const gesturePosition = { x, y }

    // Update target position so cursor moves to drag start
    this.targetPositions[source] = {
      x: Math.max(user.region.xMin, Math.min(user.region.xMax, x)),
      y: Math.max(0.05, Math.min(0.95, y))
    }

    return {
      type: 'drag',
      source: source,
      velocity: velocity,
      acceleration: acceleration,
      position: gesturePosition,
      duration: 500 + (1 - activity) * 2500,  // 500-3000ms
      intensity: activity
    }
  }

  /**
   * Generate virtual hover gesture (periodicity metric)
   * No direct sound, only filter modulation
   * CRITICAL: Generates hover position that will drive cursor movement
   * @param {string} source - Source name
   * @returns {Object} Hover gesture data
   * @private
   */
  generateVirtualHover(source) {
    const periodicity = this.calculatePeriodicityMetric(source)
    const user = this.virtualUsers[source]

    // Generate hover position based on periodicity metric
    // X position: based on periodicity (where hover occurs)
    const x = user.region.xMin + (periodicity * (user.region.xMax - user.region.xMin))

    // Y position: hovers tend to be in middle-upper region (for filter modulation)
    const y = 0.2 + (periodicity * 0.6) // 0.2-0.8 range

    const gesturePosition = { x, y }

    // Update target position so cursor moves to hover position
    this.targetPositions[source] = {
      x: Math.max(user.region.xMin, Math.min(user.region.xMax, x)),
      y: Math.max(0.05, Math.min(0.95, y))
    }

    // This doesn't emit sound directly, only modulation
    return {
      type: 'hover',
      source: source,
      position: gesturePosition,
      intensity: periodicity,
      velocity: 0  // hovers have no velocity
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

      // Gesture density → Note density (FURTHER REDUCED to prevent polyphony issues)
      densityMultiplier: 0.2 + Math.min(gestures.length * 0.05, 0.2),  // 0.2x to 0.4x

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
   * Creates a default drag gesture for material purposes
   * @param {string} source - Source name
   * @private
   */
  addVirtualGestureMaterial(source) {
    const velocity = this.webMetricsPoller?.getVelocity(source) || 0
    const acceleration = this.webMetricsPoller?.getAcceleration(source) || 0
    const gesture = this.generateVirtualDrag(source, velocity, acceleration)
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
   * CRITICAL: Density emerges naturally from gesture activity, NOT hardcoded
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
      // console.log(`🎵 Style influenced composition: ${keyCenter} ${mode}, tempo ${this.compositionEngine.tempo}`)
    }

    // CRITICAL: Use same formula as normal rooms (BackgroundCompositionService line 370)
    // Density emerges naturally from gesture activity: energy * 1.2
    // LOW metrics → fewer gestures → lower energy → lower density → sparse background
    // HIGH metrics → more gestures → higher energy → higher density → denser background
    const energy = style.energy || 0.5
    this.compositionEngine.complexityLevel = Math.min(0.9, Math.max(0.1, energy))
    this.compositionEngine.density = Math.min(0.9, Math.max(0.1, energy * 1.2))
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

    // console.log(`🎵 Next composition in ${(interval / 1000).toFixed(1)}s`)
  }

  /**
   * Generate and broadcast composition using metric-driven virtual gestures
   * NEW ARCHITECTURE: Gestures CONTROL the background composition
   * Separates sound-producing gestures (tap/drag) from modulation gestures (hover)
   * @private
   */
  async generateAndBroadcastComposition() {
    try {
      // console.log(`🎵 Generating composition cycle ${this.compositionCount} (gestures + hovers + background)`)

      // STEP 1: Generate metric-driven gestures for ALL sources
      // Returns { gestures: [tap/drag], hovers: [hover] }
      const { gestures: virtualGestures, hovers: virtualHovers } = this.generateMetricDrivenGestures()

      // STEP 2: CRITICAL - Add ALL gesture materials SYNCHRONOUSLY BEFORE generating background
      // This ensures CompositionEngine has access to the materials when generating background
      // Same pattern as normal rooms: gestures → materials → StyleAnalyzer → CompositionEngine → Background
      for (const gesture of virtualGestures) {
        this.addVirtualGestureMaterialFromGesture(gesture)
      }

      // STEP 3: Process hover events for modulation (no direct sound)
      for (const hover of virtualHovers) {
        if (this.hoverOrchestrator) {
          this.hoverOrchestrator.addHoverEvent({
            userId: this.virtualUsers[hover.source].userId,
            position: hover.position,
            intensity: hover.intensity,
            timestamp: Date.now()
          })
        }
      }

      // STEP 4: Extract modulation params from gestures (only sound-producing ones)
      const modulationParams = this.extractModulationParams(virtualGestures)

      // STEP 5: CRITICAL - Apply style from gesture materials to CompositionEngine
      // This is done AFTER adding materials, so style.energy reflects actual gesture activity
      // Density emerges naturally from metric-driven gesture count (NO hardcoded values)
      const style = this.styleAnalyzer.getCurrentStyle()
      const baseTempo = style?.tempo || 120

      this.compositionEngine.tempo = Math.round(baseTempo * modulationParams.tempoMultiplier)
      this.compositionEngine.tempo = Math.max(60, Math.min(160, this.compositionEngine.tempo))

      // CRITICAL: Use style.energy for density (same as normal rooms - BackgroundCompositionService line 370)
      // Density emerges naturally: LOW metrics → fewer gestures → lower energy → lower density → sparse background
      //                          HIGH metrics → more gestures → higher energy → higher density → denser background
      const energy = style?.energy || 0.5
      this.compositionEngine.density = Math.min(0.9, Math.max(0.1, energy * 1.2))
      this.compositionEngine.complexityLevel = Math.min(0.9, Math.max(0.1, energy))

      // STEP 6: Generate background composition from gesture materials
      this.compositionCount++
      const composition = this.compositionEngine.compose({
        roomId: this.landingRoomId,
        userCount: 3,
        activeUsers: [
          this.virtualUsers.wikipedia.userId,
          this.virtualUsers.hackernews.userId,
          this.virtualUsers.github.userId
        ]
      })

      // console.log(`🎵 Generated ${composition.type} composition #${this.compositionCount} (density=${this.compositionEngine.density.toFixed(2)}, energy=${energy.toFixed(2)})`)

      // STEP 7: Broadcast background composition
      if (this.io) {
        this.io.to(this.landingRoomId).emit('background-composition', {
          roomId: this.landingRoomId,
          composition,
          compositionNumber: this.compositionCount,
          timestamp: Date.now()
        })
        // console.log(`🎵 Broadcast composition #${this.compositionCount} to landing room`)
      }

      // STEP 8: Emit gesture notes with QUANTIZED timing on the grid (after background is ready)
      // Only processes sound-producing gestures (tap/drag)
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
        }, delay)

        // console.log(`🎵 Scheduled ${gesture.type} from ${gesture.source} at tick ${tick} (${delay}ms)`)
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
   * Routes to appropriate emission method based on gesture type
   * @param {Object} gesture - Virtual gesture data
   * @private
   */
  async emitVirtualGestureNotes(gesture) {
    if (!this.io || !this.isRunning) return

    // Handle hover (no sound, only modulation)
    if (gesture.type === 'hover') {
      return  // Hovers only generate modulation via HoverOrchestrator
    }

    const user = this.virtualUsers[gesture.source]
    const cursor = this.targetPositions[gesture.source]
    const musicalContext = {
      key: this.compositionEngine.keyCenter,
      mode: this.compositionEngine.mode,
      tempo: this.compositionEngine.tempo
    }

    if (gesture.type === 'tap') {
      // TAP: Single short percussive note
      await this.emitTapNote(gesture, user, cursor, musicalContext)
    } else if (gesture.type === 'drag') {
      // DRAG: Phrase with multiple notes using PhraseMorphology
      await this.emitDragPhrase(gesture, user, cursor, musicalContext)
    }
  }

  /**
   * Emit a single tap note (short, percussive)
   * CRITICAL: Generates frequency from metric variance, then derives position FROM frequency
   * This ensures different notes = different positions (same as normal rooms)
   * @param {Object} gesture - Tap gesture data
   * @param {Object} user - Virtual user data
   * @param {Object} cursor - Initial cursor position (from gesture generation)
   * @param {Object} musicalContext - Musical context (key, mode, tempo)
   * @private
   */
  async emitTapNote(gesture, user, cursor, musicalContext) {
    // CRITICAL: Generate frequency BASED ON METRIC VARIANCE (not position)
    // This ensures different metrics = different frequencies = different positions
    const velocity = gesture.velocity || 0
    const normalizedVelocity = this.normalizeMetricDynamic(gesture.source, 'velocity', Math.abs(velocity))

    // Calculate variance within tessitura based on velocity
    // Higher velocity = higher pitch within tessitura
    const tessitura = user.frequencyRange // { min, max }
    const tessituraRange = tessitura.max - tessitura.min

    // CRITICAL: Use velocity to determine frequency within tessitura (NO randomness)
    // Low velocity → lower end of tessitura
    // High velocity → higher end of tessitura
    // This preserves METRIC-TO-MUSIC correspondence
    const baseFreq = user.baseFrequency
    const freqOffset = normalizedVelocity * tessituraRange * 0.4  // Up to 40% of range (stays within tessitura)
    const targetFreq = baseFreq + freqOffset  // Higher velocity = higher pitch

    // Clamp to tessitura
    targetFreq = Math.max(tessitura.min, Math.min(tessitura.max, targetFreq))

    // Constrain to scale
    const constrainedFreq = this.harmonicEngine.constrainToScale(
      targetFreq,
      musicalContext.key,
      musicalContext.mode
    )

    // CRITICAL: Derive position FROM frequency (inverse of normal room formula)
    // Formula: frequency = 550 - 440*y + 660*x
    // We need to distribute this across x and y within the source's region

    // Calculate normalized position within tessitura (0-1)
    const normalizedFreq = (constrainedFreq - tessitura.min) / tessituraRange

    // Map to position within source's region
    // X varies across full region width, Y varies based on frequency
    const regionWidth = user.region.xMax - user.region.xMin
    const targetX = user.region.xMin + (normalizedFreq * regionWidth)

    // Y based on frequency (higher freq = higher position)
    const targetY = 0.1 + (normalizedFreq * 0.8) // 0.1-0.9 range

    const notePosition = { x: targetX, y: targetY }

    // CRITICAL: Update target position so cursor moves to note position
    this.targetPositions[gesture.source] = {
      x: Math.max(user.region.xMin, Math.min(user.region.xMax, targetX)),
      y: Math.max(0.05, Math.min(0.95, targetY))
    }

    // Emit single short percussive note (0.1s duration, same as normal rooms)
    this.io.to(this.landingRoomId).emit('musical:event', {
      type: 'tap',
      userId: user.userId,
      frequency: constrainedFreq,
      velocity: 0.9,  // Strong tap (same as normal rooms)
      duration: 0.1,  // 100ms - percussive (same as normal rooms)
      position: notePosition,
      userColor: user.color,
      isRemote: true,
      timestamp: Date.now()
    })

    // console.log(`🎵 TAP from ${gesture.source}: freq=${constrainedFreq.toFixed(1)}Hz, pos=(${targetX.toFixed(2)},${targetY.toFixed(2)})`)
  }

  /**
   * Emit a drag phrase (multi-note melody using PhraseMorphology)
   * CRITICAL: Each note is emitted at a different position along a trajectory
   * This replicates normal room behavior where cursor moves during drag
   * @param {Object} gesture - Drag gesture data
   * @param {Object} user - Virtual user data
   * @param {Object} cursor - Starting cursor position
   * @param {Object} musicalContext - Musical context (key, mode, tempo)
   * @private
   */
  async emitDragPhrase(gesture, user, cursor, musicalContext) {
    const activity = this.calculateActivityLevel(gesture.source)

    // Velocity from gesture determines intensity
    const absVelocity = Math.abs(gesture.velocity || 0)

    // DYNAMIC NORMALIZATION: Normalize velocity based on HISTORICAL range
    const normalizedVelocity = this.normalizeMetricDynamic(gesture.source, 'velocity', absVelocity)

    // Calculate phrase duration based on activity (inverse: higher activity = shorter phrase)
    const phraseDurationMs = 500 + (1 - activity) * 2500  // 500-3000ms

    // SCALE velocity to gesture velocity (0-100) for PhraseMorphology
    const gestureVelocity = normalizedVelocity * 100  // 0-100 range

    // CRITICAL: Generate trajectory from gesture metrics (NO randomness)
    // Acceleration determines direction and distance of trajectory
    const absAccel = Math.abs(gesture.acceleration || 0)
    const normalizedAccel = this.normalizeMetricDynamic(gesture.source, 'acceleration', absAccel)

    // Trajectory based on acceleration (higher acceleration = longer trajectory)
    const regionWidth = user.region.xMax - user.region.xMin
    const regionHeight = 0.9  // Full height is 0.05-0.95

    // Direction based on acceleration sign (positive = right/up, negative = left/down)
    const accelDirection = gesture.acceleration >= 0 ? 1 : -1

    // Trajectory length based on normalized acceleration (up to 30% of region)
    const trajectoryLength = 0.1 + (normalizedAccel * 0.2)  // 0.1-0.3 range

    // Calculate end position
    const startX = cursor.x
    const startY = cursor.y

    // End position moves in direction based on acceleration
    const endX = Math.max(user.region.xMin, Math.min(user.region.xMax, startX + (accelDirection * trajectoryLength * regionWidth)))
    const endY = Math.max(0.05, Math.min(0.95, startY + (accelDirection * trajectoryLength * regionHeight * 0.5)))

    // Create gestureData for PhraseMorphology with trajectory
    const gestureData = {
      velocity: gestureVelocity,
      trajectory: {
        startX: startX,
        startY: startY,
        endX: endX,
        endY: endY
      },
      curvature: 0.5,  // Moderate curvature
      acceleration: gesture.acceleration || 0,
      intensity: activity,
      duration: phraseDurationMs
    }

    // Generate phrase using PhraseMorphology (SAME LOGIC AS NORMAL ROOMS)
    const phrase = this.phraseMorphology.generatePhrase(gestureData, musicalContext)

    // console.log(`🎵 PHRASE from ${gesture.source}: ${phrase.notes.length} notes, trajectory=(${startX.toFixed(2)},${startY.toFixed(2)})→(${endX.toFixed(2)},${endY.toFixed(2)})`)

    // Convert beats to milliseconds
    const beatDurationMs = (60 / musicalContext.tempo) * 1000

    // Emit each note with correct timing and position along trajectory
    phrase.notes.forEach((note, i) => {
      // CRITICAL: Validate note.pitch before processing
      if (typeof note.pitch !== 'number' || isNaN(note.pitch)) {
        console.warn(`⚠️ Invalid note.pitch in phrase:`, { note, index: i, source: gesture.source })
        return  // Skip this note
      }

      const noteId = `virtual_${gesture.source}_${Date.now()}_${i}`

      // Convert MIDI pitch to frequency
      // Formula: f = 440 * 2^((midi - 69) / 12)
      const noteFreq = 440 * Math.pow(2, (note.pitch - 69) / 12)

      // Validate calculated frequency
      if (isNaN(noteFreq) || !isFinite(noteFreq)) {
        console.warn(`⚠️ Invalid calculated frequency:`, { noteFreq, notePitch: note.pitch, index: i })
        return  // Skip this note
      }

      // CRITICAL: Calculate position along trajectory for this note
      // Each note gets a position based on its index in the phrase
      const noteProgress = i / Math.max(1, phrase.notes.length - 1)  // 0 to 1

      // Linear interpolation from start to end position
      const noteX = startX + (endX - startX) * noteProgress
      const noteY = startY + (endY - startY) * noteProgress

      const notePosition = { x: noteX, y: noteY }

      // Calculate start time in milliseconds
      const startDelayMs = note.startBeat * beatDurationMs

      // Calculate note duration in milliseconds
      const noteDurationMs = note.duration * beatDurationMs

      // Schedule note emission
      setTimeout(() => {
        if (!this.io || !this.isRunning) return

        // CRITICAL: Update target position so cursor moves to this note's position
        this.targetPositions[gesture.source] = {
          x: Math.max(user.region.xMin, Math.min(user.region.xMax, noteX)),
          y: Math.max(0.05, Math.min(0.95, noteY))
        }

        // Emit hold:start with note's position along trajectory
        const noteVelocity = note.velocity || 80  // Default to 80 if undefined
        this.io.to(this.landingRoomId).emit('hold:start', {
          type: 'hold:start',
          userId: user.userId,
          noteId: noteId,
          frequency: noteFreq,
          velocity: Math.max(0, Math.min(1, noteVelocity / 127)),  // Convert 0-127 to 0-1, with defaults
          duration: noteDurationMs / 1000,  // Convert to seconds
          position: notePosition,  // CRITICAL: Each note has its own position along trajectory
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
        }, noteDurationMs)

      }, startDelayMs)
    })
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
        let newX = current.x + (target.x - current.x) * easing
        let newY = current.y + (target.y - current.y) * easing

        // CLAMP to valid scene bounds (0.05-0.95) - prevents cursor drift outside scene
        newX = Math.max(0.05, Math.min(0.95, newX))
        newY = Math.max(0.05, Math.min(0.95, newY))

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
        // // Debug: Log cursor positions every second (every 20th iteration)
        // // NO randomness - use counter-based periodic logging
        // this.cursorIterationCount = (this.cursorIterationCount || 0) + 1
        // if (this.cursorIterationCount % 20 === 0) {
        //   const cursorInfo = Object.entries(cursors).map(([s, c]) => `${s}:(${c.x.toFixed(2)},${c.y.toFixed(2)})`).join(' ')
        //   console.log(`🖱️ Virtual cursors: ${cursorInfo}`)
        // }
      }
    }, 50)
  }

  /**
   * Update metrics from WebMetricsPoller
   * Called by WebMetricsPoller when new metrics are available
   * CRITICAL: Cursor positions are now driven ONLY by gestures, not directly by metrics
   * This ensures visual-audio coherence: cursor moves only when gesture occurs
   * @param {Object} newMetrics - New metrics from WebMetricsPoller (includes velocity/acceleration)
   */
  updateMetrics(newMetrics) {
    this.metrics = newMetrics

    // Update statistical tracking for DYNAMIC NORMALIZATION
    // This builds historical min/max for MAXIMUM musical variety
    for (const [source, metrics] of Object.entries(newMetrics)) {
      for (const [metricName, value] of Object.entries(metrics)) {
        // Track ALL metrics including velocity for phrase generation
        this.updateMetricStatistics(source, metricName, value)
      }
    }

    // CRITICAL: DO NOT update cursor positions directly from metrics
    // Cursor positions are now driven ONLY by virtual gestures
    // This ensures coherence: cursor moves only when gesture occurs

    // Broadcast metrics to landing room for dashboard display
    if (this.io && this.isRunning) {
      this.io.to(this.landingRoomId).emit('metrics-update', {
        metrics: this.metrics,
        timestamp: Date.now()
      })
    }
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

  /**
   * Calculate stability metric for gesture classification
   * Lower velocity = higher stability = tap gesture
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @returns {number} Stability value (0.0-1.0)
   * @private
   */
  calculateStabilityMetric(source) {
    const velocity = Math.abs(this.webMetricsPoller?.getVelocity(source) || 0)
    // Lower velocity = more stable = tap gesture
    // Normalize: velocity 0-10 maps to stability 1-0
    return Math.max(0, 1 - (velocity / 10))
  }

  /**
   * Calculate density metric for gesture classification
   * Higher metric values = higher density = phrase gesture
   * @param {string} source - Source name
   * @returns {number} Density value (0.0-1.0)
   * @private
   */
  calculateDensityMetric(source) {
    const metrics = this.metrics[source]
    switch (source) {
      case 'wikipedia':
        return this.normalizeMetricDynamic(source, 'avgEditSize', metrics.avgEditSize)
      case 'hackernews':
        return this.normalizeMetricDynamic(source, 'avgUpvotes', metrics.avgUpvotes)
      case 'github':
        return this.normalizeMetricDynamic(source, 'newStars', metrics.newStars)
      default:
        return 0
    }
  }

  /**
   * Calculate periodicity metric for gesture classification
   * Higher periodic values = more periodic = modulation gesture
   * @param {string} source - Source name
   * @returns {number} Periodicity value (0.0-1.0)
   * @private
   */
  calculatePeriodicityMetric(source) {
    const metrics = this.metrics[source]
    switch (source) {
      case 'wikipedia':
        return this.normalizeMetricDynamic(source, 'newArticles', metrics.newArticles)
      case 'hackernews':
        return this.normalizeMetricDynamic(source, 'commentCount', metrics.commentCount)
      case 'github':
        return this.normalizeMetricDynamic(source, 'openPRs', metrics.openPRs)
      default:
        return 0
    }
  }

  /**
   * Classify gesture type based on metric characteristics
   * Uses relative comparison: whichever metric is highest determines gesture type
   * REDUCED threshold from 0.3 to 0.15 for more frequent gesture variety
   * @param {string} source - Source name
   * @returns {string} Gesture type: 'tap', 'drag', or 'hover'
   * @private
   */
  classifyGestureType(source) {
    const stability = this.calculateStabilityMetric(source)
    const density = this.calculateDensityMetric(source)
    const periodicity = this.calculatePeriodicityMetric(source)

    // Relative comparison: whichever metric is highest determines gesture type
    const maxMetric = Math.max(stability, density, periodicity)

    if (maxMetric === stability && stability > 0.15) {
      return 'tap'
    } else if (maxMetric === density && density > 0.15) {
      return 'drag'  // phrase
    } else if (maxMetric === periodicity && periodicity > 0.15) {
      return 'hover'  // modulation (no sound, only modulation)
    }
    // Default to drag if all metrics are low
    return 'drag'
  }
}

module.exports = LandingCompositionService
