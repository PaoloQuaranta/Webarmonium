/**
 * LandingCompositionService
 * Generates real-time musical compositions from web metrics using CompositionEngine
 *
 * Architecture (Identical to BackgroundCompositionService):
 * - Uses CompositionEngine with 6 generative algorithms
 * - Treats web metrics as "virtual gestures" that feed into the composition system
 * - Emits background-composition events for frontend playback
 * - Virtual cursors derived from generated frequencies (reverse mapping)
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
const FrequencyPositionMapper = require('../utils/FrequencyPositionMapper')
const { VIRTUAL_USER_COLORS } = require('../constants/colors')

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
      github: { commitsPerMinute: 0, createsPerMinute: 0, deletesPerMinute: 0 }
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
        createsPerMinute: { min: Infinity, max: 0, samples: [] },
        deletesPerMinute: { min: Infinity, max: 0, samples: [] },
        velocity: { min: Infinity, max: 0, samples: [] }
      }
    }
    this.maxSamples = 100 // Keep last 100 samples for dynamic range calculation

    // Service state
    this.isRunning = false
    // Entry #117: Deterministic offset based on timestamp (not random!)
    // PHI-based offset from startup time ensures variation without true randomness
    const PHI = 1.618033988749894848
    this.compositionCount = Math.floor(((Date.now() / 1000) * PHI) % 100)
    this.compositionTimer = null

    // Clock for quantization (120 BPM, 16 ticks per measure)
    this.clockTick = 0
    this.ticksPerMeasure = 16

    // Frequency-to-position mapper for reverse mapping (cursor follows notes)
    this.frequencyMapper = new FrequencyPositionMapper()

    // Virtual user definitions (for cursor display and material generation)
    // Note: regions removed - cursor positions derived from generated frequencies
    // Colors from VIRTUAL_USER_COLORS - exclusive, never overlap with real user colors
    this.virtualUsers = {
      wikipedia: {
        userId: 'wikipedia-metrics',
        color: VIRTUAL_USER_COLORS.wikipedia,
        baseFrequency: 130.81,
        tessitura: 'bass',
        frequencyRange: { min: 110, max: 220 }  // A2-A3
      },
      hackernews: {
        userId: 'hackernews-metrics',
        color: VIRTUAL_USER_COLORS.hackernews,
        baseFrequency: 293.66,
        tessitura: 'tenor',
        frequencyRange: { min: 196, max: 392 }  // G3-G4
      },
      github: {
        userId: 'github-metrics',
        color: VIRTUAL_USER_COLORS.github,
        baseFrequency: 659.25,
        tessitura: 'soprano',
        frequencyRange: { min: 523, max: 1047 }  // C5-C6
      }
    }

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

    // Composition monitor (injected by server)
    this.compositionMonitor = null

    // Gesture generation config - UNIFIED with VirtualUserService
    // Inverse modulation with SMALL amplitude (0.05 swing, matching gestureIntent swing)
    // This provides light correction without dominating the raw activity signal
    this.gestureConfig = {
      baseDensityMultiplier: 0.65, // 65% pass at HIGH activity (slightly fewer)
      minDensity: 0.15,            // Minimum for sparse compositions (unused in current formula)
      maxDensity: 0.70             // 70% pass at LOW activity (slightly more)
    }

    // Track pending timeouts for cleanup (prevents memory leaks)
    this.pendingTimeouts = new Set()

    // Gesture counter per source for golden ratio position variation
    // Increments with each gesture, creates optimal spacing in cursor positions
    this.gestureCounters = {
      wikipedia: 0,
      hackernews: 0,
      github: 0
    }

    // Current cursor positions for smooth interpolation
    // Distributed initial positions across the canvas (left, center, right)
    this.currentPositions = {
      wikipedia: { x: 0.15, y: 0.75 },   // Bottom-left area (bass)
      hackernews: { x: 0.50, y: 0.50 },  // Center (tenor)
      github: { x: 0.85, y: 0.25 }       // Top-right area (soprano)
    }

    // Target positions for interpolation
    this.targetPositions = {
      wikipedia: { x: 0.15, y: 0.75 },
      hackernews: { x: 0.50, y: 0.50 },
      github: { x: 0.85, y: 0.25 }
    }

    // Interpolation timer for smooth cursor movement
    this.cursorInterpolationTimer = null
    this.interpolationInterval = 50  // 20fps for smooth movement
    this.interpolationSpeed = 0.08   // How fast to approach target (lower = smoother/slower)

    // console.log('🎵 LandingCompositionService initialized (CompositionEngine mode)')
  }

  /**
   * Set Socket.IO instance for broadcasting
   * @param {SocketIO} io - Socket.IO instance
   */
  setSocketIO(io) {
    this.io = io
  }

  /**
   * Set GestureToMusicService (for harmonic sync)
   * @param {GestureToMusicService} gestureService - GestureToMusicService instance
   */
  setGestureToMusicService(gestureService) {
    this.gestureToMusicService = gestureService
  }

  /**
   * Normalize web metrics to 0-1 range for use by HarmonicEngine
   * Entry #171: Centralized normalization to eliminate code duplication
   * Uses fixed reference ranges for deterministic output
   * @returns {Object|null} Normalized metrics or null if poller not available
   * @private
   */
  _normalizeWebMetrics() {
    if (!this.webMetricsPoller) return null
    const raw = this.webMetricsPoller.getMetrics()
    if (!raw) return null

    return {
      wikipedia: { normalized: Math.min(1, (raw.wikipedia?.editsPerMinute || 0) / 50) },
      hackernews: { normalized: Math.min(1, (raw.hackernews?.postsPerMinute || 0) / 5) },
      github: { normalized: Math.min(1, (raw.github?.commitsPerMinute || 0) / 30) }
    }
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
   * Set target cursor position for a virtual user
   * The interpolation timer will smoothly move the cursor to this target
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @param {Object} user - Virtual user config (unused, kept for API compatibility)
   * @param {Object} position - {x, y} target position (0-1 range)
   * @private
   */
  _emitCursorAtPosition(source, user, position) {
    // Set target position - interpolation timer will smoothly move there
    if (this.targetPositions[source]) {
      this.targetPositions[source].x = position.x
      this.targetPositions[source].y = position.y
    }
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
    // CRITICAL: Use slice to guarantee size bounds (prevents memory leak from rapid calls)
    if (stats.samples.length > this.maxSamples) {
      stats.samples = stats.samples.slice(-this.maxSamples)
    }

    // // Log when range expands (for debugging)
    // if (stats.min === value || stats.max === value) {
    //   console.log(`📊 ${source}.${metricName} range expanded: [${stats.min.toFixed(2)}, ${stats.max.toFixed(2)}]`)
    // }
  }

  /**
   * DYNAMIC NORMALIZATION based on HISTORICAL RANGE with PERCENTILE STABILIZATION
   * Maps metric values to [0, 1] using observed percentiles (P10-P90)
   * This ensures MAXIMUM musical variety while preventing outlier skewing
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

    // Wait for warm-up period before normalizing (need enough samples)
    const MIN_SAMPLES_FOR_PERCENTILE = 10
    if (stats.samples.length < MIN_SAMPLES_FOR_PERCENTILE) {
      // console.log(`📊 Warm-up period for ${source}.${metricName} (${stats.samples.length}/${MIN_SAMPLES_FOR_PERCENTILE}), returning 0.5`)
      return 0.5
    }

    // If no range yet, return 0.5
    if (stats.min === Infinity || stats.max === 0) {
      // console.log(`📊 No range yet for ${source}.${metricName} (min=${stats.min}, max=${stats.max}), returning 0.5`)
      return 0.5
    }

    // PERCENTILE-BASED normalization for stability
    // Uses P10-P90 range to prevent outliers from skewing normalization
    const sortedSamples = [...stats.samples].sort((a, b) => a - b)
    const p10Index = Math.floor(sortedSamples.length * 0.1)
    const p90Index = Math.floor(sortedSamples.length * 0.9)
    const p10 = sortedSamples[p10Index]
    const p90 = sortedSamples[p90Index]

    const stabilizedRange = p90 - p10
    if (stabilizedRange === 0) {
      // console.log(`📊 Zero stabilized range for ${source}.${metricName}, returning 0.5`)
      return 0.5
    }

    // Normalize using percentile range
    const normalized = (value - p10) / stabilizedRange

    // Clamp to [0, 1]
    const result = Math.max(0, Math.min(1, normalized))

    // // Log when result is significantly different from 0.5
    // if (result < 0.3 || result > 0.7) {
    //   console.log(`📊 ${source}.${metricName}: ${value.toFixed(1)} → ${result.toFixed(2)} (P10-P90: ${p10.toFixed(1)}-${p90.toFixed(1)})`)
    // }

    return result
  }

  /**
   * Start landing composition service
   */
  start() {
    if (this.isRunning) return

    this.isRunning = true

    // Emit initial cursor positions (distributed across canvas)
    this._emitAllCursors()

    // Start cursor interpolation for smooth movement
    this._startCursorInterpolation()

    // Broadcast initial drone (fills silence while metrics load)
    setTimeout(() => {
      this.generateAndBroadcastDrone()
    }, 500)

    // Start composition cycle (generates gestures + background)
    this.scheduleNextComposition()

    // console.log('🎵 LandingCompositionService started')
  }

  /**
   * Emit all cursor positions at once
   * @private
   */
  _emitAllCursors() {
    if (!this.io) return

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

    this.io.to(this.landingRoomId).emit('virtual-cursors', {
      cursors,
      timestamp: Date.now()
    })
  }

  /**
   * Start cursor interpolation timer for smooth movement
   * @private
   */
  _startCursorInterpolation() {
    if (this.cursorInterpolationTimer) {
      clearInterval(this.cursorInterpolationTimer)
    }

    this.cursorInterpolationTimer = setInterval(() => {
      this._interpolateCursors()
    }, this.interpolationInterval)
  }

  /**
   * Interpolate cursors toward their target positions
   * Uses linear interpolation for smooth movement
   * @private
   */
  _interpolateCursors() {
    if (!this.io || !this.isRunning) return

    let anyMoved = false
    const threshold = 0.001  // Minimum movement threshold

    for (const source of Object.keys(this.virtualUsers)) {
      const current = this.currentPositions[source]
      const target = this.targetPositions[source]

      const dx = target.x - current.x
      const dy = target.y - current.y

      // Only interpolate if there's meaningful distance to cover
      if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
        current.x += dx * this.interpolationSpeed
        current.y += dy * this.interpolationSpeed
        anyMoved = true
      }
    }

    // Only emit if any cursor actually moved
    if (anyMoved) {
      this._emitAllCursors()
    }
  }

  /**
   * Generate and broadcast DRONE (atmospheric pad) for landing page
   * Same functionality as BackgroundCompositionService
   */
  generateAndBroadcastDrone() {
    // Get current harmonic context from composition engine
    const keyCenter = this.compositionEngine.keyCenter || 'C'
    const mode = this.compositionEngine.mode || 'ionian'

    // Drone note follows the current key center (bass register)
    const droneNote = `${keyCenter}3`

    // Add fifth for richer drone texture
    const fifthMap = { 'C': 'G', 'D': 'A', 'E': 'B', 'F': 'C', 'G': 'D', 'A': 'E', 'B': 'F#' }
    const fifthNote = `${fifthMap[keyCenter] || 'G'}3`

    const droneComposition = {
      type: 'ambient',
      metadata: {
        tempo: 60,
        keyCenter: keyCenter,
        mode: mode,
        timeSignature: '4/4'
      },
      structure: {
        form: 'drone',
        currentSection: 'ambient'
      },
      content: {
        texture: [
          {
            type: 'drone',
            note: droneNote,
            duration: 10000,
            velocity: 0.8,
            articulation: 'legato'
          },
          {
            type: 'drone',
            note: fifthNote,
            duration: 10000,
            velocity: 0.5,
            articulation: 'legato'
          }
        ]
      }
    }

    // Broadcast drone to landing room
    if (this.io) {
      this.io.to(this.landingRoomId).emit('background-composition', {
        roomId: this.landingRoomId,
        composition: droneComposition,
        compositionNumber: 0,
        isDrone: true,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Emit drone to a specific socket (Entry #27: for audio restart)
   * @param {Socket} socket - Target socket
   */
  emitDroneToSocket(socket) {
    const keyCenter = this.compositionEngine.keyCenter || 'C'
    const mode = this.compositionEngine.mode || 'ionian'
    const droneNote = `${keyCenter}3`
    const fifthMap = { 'C': 'G', 'D': 'A', 'E': 'B', 'F': 'C', 'G': 'D', 'A': 'E', 'B': 'F#' }
    const fifthNote = `${fifthMap[keyCenter] || 'G'}3`

    const droneComposition = {
      type: 'ambient',
      metadata: { tempo: 60, keyCenter, mode, timeSignature: '4/4' },
      structure: { form: 'drone', currentSection: 'ambient' },
      content: {
        texture: [
          { type: 'drone', note: droneNote, duration: 10000, velocity: 0.8, articulation: 'legato' },
          { type: 'drone', note: fifthNote, duration: 10000, velocity: 0.5, articulation: 'legato' }
        ]
      }
    }

    socket.emit('background-composition', {
      roomId: this.landingRoomId,
      composition: droneComposition,
      compositionNumber: 0,
      isDrone: true,
      timestamp: Date.now()
    })
    // console.log('🎵 Drone emitted to socket (request-drone)')
  }

  /**
   * Check if keyCenter changed and broadcast updated drone
   * Entry #115: Drone updates dynamically when keyCenter changes
   * @param {string} previousKeyCenter - KeyCenter before composition
   */
  updateDroneIfKeyChanged(previousKeyCenter) {
    const currentKeyCenter = this.compositionEngine.keyCenter
    if (currentKeyCenter !== previousKeyCenter) {
      // KeyCenter changed - broadcast new drone to landing room
      this.generateAndBroadcastDrone()
    }
  }

  /**
   * Stop landing composition service
   */
  stop() {
    if (!this.isRunning) return

    this.isRunning = false

    // Clear cursor interpolation timer
    if (this.cursorInterpolationTimer) {
      clearInterval(this.cursorInterpolationTimer)
      this.cursorInterpolationTimer = null
    }

    // Clear composition timer
    if (this.compositionTimer) {
      clearTimeout(this.compositionTimer)
      this.compositionTimer = null
    }

    // CRITICAL: Clear all pending timeouts to prevent memory leaks
    for (const timeoutId of this.pendingTimeouts) {
      clearTimeout(timeoutId)
    }
    this.pendingTimeouts.clear()

    // Clear accumulated history to free memory
    this.clearHistory()

    // console.log('🎵 LandingCompositionService stopped')
  }

  /**
   * Clear accumulated history to free memory
   * Called when service stops to prevent memory leaks
   */
  clearHistory() {
    // Clear virtual gesture history
    this.virtualGestureHistory = {
      wikipedia: [],
      hackernews: [],
      github: []
    }

    // Reset metric statistics (keeps structure, clears samples)
    for (const source of Object.keys(this.metricStatistics)) {
      for (const metric of Object.keys(this.metricStatistics[source])) {
        this.metricStatistics[source][metric] = {
          min: Infinity,
          max: 0,
          samples: []
        }
      }
    }

    // Clear material library
    if (this.materialLibrary && typeof this.materialLibrary.clearAllMaterials === 'function') {
      this.materialLibrary.clearAllMaterials()
    }

    // Reset composition count with deterministic offset (Entry #117)
    const PHI = 1.618033988749894848
    this.compositionCount = Math.floor(((Date.now() / 1000) * PHI) % 100)
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
   * Generate virtual gestures based on CURRENT metrics
   * CRITICAL: Sources only gesture when there's SIGNIFICANT metric activity
   * This mimics real user behavior - users gesture sporadically, not continuously
   * Prevents polyphony issues by not having all sources gesture every cycle
   * Uses normalized velocity (0-1) as "gesture intent" threshold
   * @returns {Array} Array of gestures (tap or drag)
   * @private
   */
  generateMetricDrivenGestures() {
    const gestures = []
    const sources = Object.keys(this.virtualUsers)

    for (const source of sources) {
      const velocity = this.webMetricsPoller?.getVelocity(source) || 0
      const acceleration = this.webMetricsPoller?.getAcceleration(source) || 0

      // CRITICAL: Gesture generation based on BOTH velocity AND absolute activity
      // This ensures highly active sources (like Wikipedia) still gesture even when stable
      const normalizedVelocity = this.normalizeMetricDynamic(source, 'velocity', Math.abs(velocity))
      const activityLevel = this.calculateActivityLevel(source)

      // Gesture intent: combine velocity (change) with activity (absolute level)
      // High activity sources gesture more frequently, even when stable
      // Formula: effectiveGestureIntent = baseIntent * (1 - activityLevel * 0.5)
      // - activityLevel 0 → gestureIntent = 0.1 (base threshold)
      // - activityLevel 1 → gestureIntent = 0.05 (lower threshold = more gestures)
      const baseGestureIntent = 0.1
      const gestureIntent = baseGestureIntent * (1 - activityLevel * 0.5)

      // Check if source should gesture this cycle
      if (normalizedVelocity < gestureIntent) {
        // No significant metric activity - skip this source this cycle
        // Cursor will interpolate to last position, creating visual continuity
        continue
      }

      // DENSITY FILTER: Probabilistic gesture emission with INVERSE activity modulation
      // Low activity → higher density (more gestures pass, prevents silence)
      // High activity → lower density (fewer gestures pass, prevents chaos)
      // density varies from 0.5 (low activity) to 0.3 (high activity)
      const density = this.gestureConfig.maxDensity -
        (activityLevel * (this.gestureConfig.maxDensity - this.gestureConfig.baseDensityMultiplier))

      if (Math.random() > density) {
        // Skip this gesture probabilistically based on density
        continue
      }

      // Classify gesture type based on metrics
      const gestureType = this.classifyGestureType(source)

      // Generate gesture based on type (tap or drag only - hover removed)
      if (gestureType === 'tap') {
        gestures.push(this.generateVirtualTap(source, velocity))
      } else if (gestureType === 'drag') {
        gestures.push(this.generateVirtualDrag(source, velocity, acceleration))
      }

      // console.log(`🎵 Generated ${gestureType} from ${source} (vel: ${velocity.toFixed(1)}, normVel: ${normalizedVelocity.toFixed(2)})`)
    }

    return gestures
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

    // Note: Position is now calculated via REVERSE MAPPING in emitTapNote()
    // Cursor position is derived FROM the generated frequency, not from metrics directly

    // ORGANIC DURATION: Correlate tap duration to stability metric
    // Stability already derives from velocity (1 - velocity/10)
    // Higher stability (slower) = longer note with perceptible delay echo
    // Lower stability (faster) = shorter percussive note
    const stability = this.calculateStabilityMetric(source)
    const tapDurationMs = 50 + (stability * 250)  // 50-300ms organic range

    return {
      type: 'tap',
      source: source,
      velocity: velocity,
      duration: tapDurationMs,
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

    // Note: Position is now calculated via REVERSE MAPPING in emitDragPhrase()
    // Cursor trajectory is derived FROM generated note frequencies, not from metrics directly

    // ORGANIC DURATION: Correlate phrase duration to density metric
    // Density represents magnitude of real metrics (avgEditSize, avgUpvotes, newStars)
    // Higher density = more content magnitude = longer phrase
    const density = this.calculateDensityMetric(source)
    const dragDurationMs = 300 + (density * 2700)  // 300-3000ms organic range

    return {
      type: 'drag',
      source: source,
      velocity: velocity,
      acceleration: acceleration,
      duration: dragDurationMs,
      intensity: activity
    }
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
      // Density emerges naturally from gesture count (no artificial cap)
      // Selective gesture generation prevents polyphony issues
      densityMultiplier: 0.7 + Math.min(gestures.length * 0.1, 0.5),  // 0.7x to 1.2x (slightly denser for landing)

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
    // Entry #161: Increased analysis window from 10 to 25 gestures per source
    this.virtualGestureHistory[source].push(normalizedGesture)
    if (this.virtualGestureHistory[source].length > 25) {
      this.virtualGestureHistory[source] = this.virtualGestureHistory[source].slice(-25)
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
   * Uses SAME tempo-based interval as normal rooms (BackgroundCompositionService)
   * Composition frequency emerges from metric activity (not random)
   * @private
   */
  scheduleNextComposition() {
    if (!this.isRunning) return

    // Calculate next composition interval BASED ON CURRENT TEMPO (same as normal rooms)
    // Generate compositions at a fixed number of beats, not fixed time
    const currentStyle = this.styleAnalyzer.getCurrentStyle()
    const tempo = currentStyle?.tempo || 120

    // UNIFIED: Composition frequency emerges from TOTAL metric activity (no random)
    // High activity = more frequent compositions (fewer beats between)
    // Low activity = less frequent compositions (more beats between)
    const wikipediaActivity = this.calculateActivityLevel('wikipedia')
    const hackernewsActivity = this.calculateActivityLevel('hackernews')
    const githubActivity = this.calculateActivityLevel('github')
    const totalActivity = (wikipediaActivity + hackernewsActivity + githubActivity) / 3  // Average 0-1

    // Map activity to beats: activity 0 → 16 beats, activity 1 → 10 beats
    // High activity = more frequent (10 beats), Low activity = sparse (16 beats)
    // Slowed down from 6-12 to 10-16 beats to reduce chaos
    const beatsPerComposition = 16 - (totalActivity * 6)  // 10-16 beats, emerges from activity

    const beatDuration = 60000 / tempo  // milliseconds per beat
    const interval = beatsPerComposition * beatDuration

    // Clamp to reasonable bounds (4-15 seconds) - increased from 2-12s
    const clampedInterval = Math.max(4000, Math.min(15000, interval))

    this.compositionTimer = setTimeout(() => {
      this.generateAndBroadcastComposition()
      this.scheduleNextComposition()
    }, clampedInterval)

    // console.log(`🎵 Next composition in ${(clampedInterval/1000).toFixed(1)}s (${beatsPerComposition.toFixed(0)} beats @ ${tempo} BPM, activity=${totalActivity.toFixed(2)})`)
  }

  /**
   * Generate and broadcast composition using metric-driven virtual gestures
   * NEW ARCHITECTURE: Gestures CONTROL the background composition
   * @private
   */
  async generateAndBroadcastComposition() {
    try {
      // console.log(`🎵 Generating composition cycle ${this.compositionCount}`)

      // STEP 1: Generate metric-driven gestures for ALL sources
      const virtualGestures = this.generateMetricDrivenGestures()

      // STEP 2: CRITICAL - Add ALL gesture materials SYNCHRONOUSLY BEFORE generating background
      // This ensures CompositionEngine has access to the materials when generating background
      // Same pattern as normal rooms: gestures → materials → StyleAnalyzer → CompositionEngine → Background
      for (const gesture of virtualGestures) {
        this.addVirtualGestureMaterialFromGesture(gesture)
      }

      // STEP 3: Extract modulation params from gestures
      const modulationParams = this.extractModulationParams(virtualGestures)

      // STEP 4: CRITICAL - Apply style from gesture materials to CompositionEngine
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

      // STEP 5: Generate background composition from gesture materials
      this.compositionCount++
      // Entry #115: Save keyCenter before composition to detect changes
      const previousKeyCenter = this.compositionEngine.keyCenter
      // Pass compositionCount for temporal variation (Entry #114)
      // Entry #171: Pass webMetrics for deterministic progression selection
      const composition = this.compositionEngine.compose({
        roomId: this.landingRoomId,
        userCount: 3,
        activeUsers: [
          this.virtualUsers.wikipedia.userId,
          this.virtualUsers.hackernews.userId,
          this.virtualUsers.github.userId
        ],
        compositionCount: this.compositionCount,
        webMetrics: this._normalizeWebMetrics()
      })

      // DEBUG Entry #117: Log melody pitches and material source to verify variation
      if (composition.content?.voices) {
        const melodyVoice = composition.content.voices.find(v => v.voiceRole === 'melody')
        if (melodyVoice) {
        }
      } else if (composition.content?.melody) {
      } else {
      }
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

      // Entry #115: Update drone if keyCenter changed during composition
      this.updateDroneIfKeyChanged(previousKeyCenter)

      // Record snapshot for monitoring (non-blocking)
      if (this.compositionMonitor && this.compositionMonitor.enabled) {
        setImmediate(() => {
          try {
            const snapshot = this.compositionMonitor.createSnapshot(
              this.landingRoomId,
              this.compositionEngine,
              this.harmonicEngine,
              this.styleAnalyzer,
              this.materialLibrary,
              { gestureCount: virtualGestures.length, compositionStarted: true },
              'landing'
            )
            if (snapshot) {
              this.compositionMonitor.recordSnapshot(this.landingRoomId, snapshot)
            }
          } catch (err) {
            // Silent fail - monitoring should not impact main flow
          }
        })
      }

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

    const user = this.virtualUsers[gesture.source]
    const musicalContext = {
      key: this.compositionEngine.keyCenter,
      mode: this.compositionEngine.mode,
      tempo: this.compositionEngine.tempo
    }

    if (gesture.type === 'tap') {
      // TAP: Single short percussive note
      await this.emitTapNote(gesture, user, musicalContext)
    } else if (gesture.type === 'drag') {
      // DRAG: Phrase with multiple notes using PhraseMorphology
      await this.emitDragPhrase(gesture, user, musicalContext)
    }
  }

  /**
   * Emit a single tap note (short percussive note)
   * Uses REVERSE MAPPING: frequency determines cursor position
   * @param {Object} gesture - Tap gesture data
   * @param {Object} user - Virtual user data
   * @param {Object} musicalContext - Musical context (key, mode, tempo)
   * @private
   */
  async emitTapNote(gesture, user, musicalContext) {
    // Increment gesture counter for golden ratio position variation
    this.gestureCounters[gesture.source] = (this.gestureCounters[gesture.source] || 0) + 1

    // 1. Calculate AUDIO frequency (constrained to tessitura)
    const activityLevel = this.calculateActivityLevel(gesture.source)
    const { min: freqMin, max: freqMax } = user.frequencyRange

    // Map activity level to frequency within tessitura for AUDIO
    let rawFreq = freqMin + (activityLevel * (freqMax - freqMin))

    // Convert to MIDI pitch for scale constraint
    const rawPitch = Math.round(12 * Math.log2(rawFreq / 440) + 69)
    const pitch = this.harmonicEngine.constrainToScale(rawPitch, musicalContext.key, musicalContext.mode)
    let frequency = 440 * Math.pow(2, (pitch - 69) / 12)

    // Ensure audio frequency stays within tessitura using octave wrapping
    frequency = this.frequencyMapper.enforceTessitura(frequency, freqMin, freqMax)

    // 2. Calculate HYBRID position: golden ratio + metric modulation
    // Cursor uses golden ratio distribution for variety across canvas
    const fullCanvasFreq = 110 + (activityLevel * 1100) // Full range: 110-1210Hz
    const position = this._calculateHybridPosition(gesture.source, fullCanvasFreq)

    // 3. Emit cursor position synchronized with note
    this._emitCursorAtPosition(gesture.source, user, position)

    // Duration from stability metric
    const stability = this.calculateStabilityMetric(gesture.source)
    const tapDurationMs = 50 + (stability * 250)
    const tempo = musicalContext.tempo || 120
    const quantizedBeats = this.phraseMorphology.quantizeGestureDuration(tapDurationMs, tempo)
    const beatDuration = 60 / tempo
    const tapDuration = quantizedBeats * beatDuration

    // 4. Emit musical event with reverse-mapped position
    this.io.to(this.landingRoomId).emit('musical:event', {
      type: 'tap',
      userId: user.userId,
      frequency: frequency,
      velocity: 0.9,
      duration: tapDuration,
      position: position,
      userColor: user.color,
      isRemote: true,
      timestamp: Date.now()
    })
  }

  /**
   * Emit a drag phrase (multi-note melody using PhraseMorphology)
   * Uses REVERSE MAPPING: cursor trajectory derived from note frequencies
   * @param {Object} gesture - Drag gesture data
   * @param {Object} user - Virtual user data
   * @param {Object} musicalContext - Musical context (key, mode, tempo)
   * @private
   */
  async emitDragPhrase(gesture, user, musicalContext) {
    // Increment gesture counter for golden ratio position variation
    this.gestureCounters[gesture.source] = (this.gestureCounters[gesture.source] || 0) + 1

    // Calculate metrics for gesture generation
    const absVelocity = Math.abs(gesture.velocity || 0)
    const normalizedVelocity = this.normalizeMetricDynamic(gesture.source, 'velocity', absVelocity)
    const density = this.calculateDensityMetric(gesture.source)
    const phraseDurationMs = 300 + (density * 2700)
    const gestureVelocity = normalizedVelocity * 100

    const absAccel = Math.abs(gesture.acceleration || 0)
    const normalizedAccel = this.normalizeMetricDynamic(gesture.source, 'acceleration', absAccel)
    const velocityVariance = normalizedVelocity
    const accelerationVariance = normalizedAccel
    const curvature = accelerationVariance / (velocityVariance + accelerationVariance + 0.1)
    const clampedCurvature = Math.max(0, Math.min(1, curvature))

    // Create gestureData for PhraseMorphology
    const gestureData = {
      velocity: gestureVelocity,
      curvature: clampedCurvature,
      acceleration: gesture.acceleration || 0,
      intensity: this.calculateActivityLevel(gesture.source),
      duration: phraseDurationMs
    }

    // 1. Generate phrase FIRST (musical content)
    const phrase = this.phraseMorphology.generatePhrase(gestureData, musicalContext)

    if (!phrase?.notes || !Array.isArray(phrase.notes)) {
      return
    }

    // HARMONIC COHERENCE: Constrain all phrase notes to room's scale/mode
    // PhraseMorphology uses mood-based scale selection; this ensures room coherence
    const { key, mode } = musicalContext
    phrase.notes = phrase.notes.map(note => ({
      ...note,
      pitch: this.harmonicEngine.constrainToScale(note.pitch, key, mode)
    }))

    const beatDurationMs = (60 / musicalContext.tempo) * 1000
    const { min: freqMin, max: freqMax } = user.frequencyRange

    // 2. Calculate frequencies for each note
    // - audioFreq: constrained to tessitura (for sound)
    // - positionFreq: unconstrained (for cursor position on full canvas)
    const noteData = phrase.notes.map((note, i) => {
      if (!note || typeof note.pitch !== 'number' || isNaN(note.pitch) ||
          note.pitch < 0 || note.pitch > 127 ||
          typeof note.duration !== 'number' || note.duration <= 0) {
        return null
      }

      const rawFreq = 440 * Math.pow(2, (note.pitch - 69) / 12)
      if (!isFinite(rawFreq) || rawFreq <= 0) return null

      // Tessitura enforcement for AUDIO only
      const audioFreq = this.frequencyMapper.enforceTessitura(rawFreq, freqMin, freqMax)

      return {
        noteId: `virtual_${gesture.source}_${Date.now()}_${i}`,
        audioFreq: audioFreq,       // For sound (tessitura-constrained)
        positionFreq: rawFreq,      // For cursor (full canvas)
        velocity: Math.max(0, Math.min(1, (note.velocity || 80) / 127)),
        startDelayMs: note.startBeat * beatDurationMs,
        durationMs: note.duration * beatDurationMs
      }
    }).filter(Boolean)

    if (noteData.length === 0) return

    // 3. Calculate HYBRID positions for trajectory
    const startFreq = noteData[0].positionFreq
    const endFreq = noteData[noteData.length - 1].positionFreq
    const startPosition = this._calculateHybridPosition(gesture.source, startFreq)

    // Emit phrase event for visual system
    this.io.to(this.landingRoomId).emit('musical:event', {
      type: 'phrase',
      userId: user.userId,
      velocity: Math.min(1, normalizedVelocity),
      noteCount: noteData.length,
      isRemote: true,
      timestamp: Date.now()
    })

    // 4. Generate HYBRID trajectory (golden ratio + metric modulation)
    const trajectory = this._generateHybridTrajectory(gesture.source, startFreq, endFreq, phraseDurationMs)

    // 5. Emit cursor positions along trajectory (synchronized with phrase duration)
    trajectory.forEach((pos) => {
      const timeoutId = setTimeout(() => {
        this.pendingTimeouts.delete(timeoutId)
        if (!this.io || !this.isRunning) return
        this._emitCursorAtPosition(gesture.source, user, pos)
      }, pos.timeOffset)
      this.pendingTimeouts.add(timeoutId)
    })

    // 6. Emit notes with HYBRID positions
    // - audioFreq for sound (tessitura-constrained)
    // - positionFreq + golden ratio stepIndex for cursor variation
    noteData.forEach((note, noteIndex) => {
      const noteTimeoutId = setTimeout(() => {
        this.pendingTimeouts.delete(noteTimeoutId)
        if (!this.io || !this.isRunning) return

        // Get HYBRID position with noteIndex for golden ratio spacing
        // Uses different step offset than trajectory for additional variation
        const notePosition = this._calculateHybridPosition(gesture.source, note.positionFreq, noteIndex + 100)

        this.io.to(this.landingRoomId).emit('hold:start', {
          type: 'hold:start',
          userId: user.userId,
          noteId: note.noteId,
          frequency: note.audioFreq,  // Tessitura-constrained for sound
          velocity: note.velocity,
          duration: note.durationMs / 1000,
          position: notePosition,     // Full canvas position
          userColor: user.color,
          isRemote: true,
          timestamp: Date.now()
        })

        // Schedule hold:end
        const holdEndTimeoutId = setTimeout(() => {
          this.pendingTimeouts.delete(holdEndTimeoutId)
          if (this.io && this.isRunning) {
            this.io.to(this.landingRoomId).emit('hold:end', {
              type: 'hold:end',
              userId: user.userId,
              noteId: note.noteId,
              timestamp: Date.now()
            })
          }
        }, note.durationMs)
        this.pendingTimeouts.add(holdEndTimeoutId)
      }, note.startDelayMs)
      this.pendingTimeouts.add(noteTimeoutId)
    })
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

    // Entry #162: Initialize HarmonicEngine key from web metrics (once, on first data)
    if (this.harmonicEngine && !this.harmonicEngine.keyInitialized) {
      this.harmonicEngine.initializeKeyFromMetrics(newMetrics)
    }

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
    // Return current interpolated positions
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
    // UNIFIED: Use dynamic normalization (same as VirtualUserService)
    // Normalizes velocity against historical P10-P90 percentiles
    // This ensures fair competition between stability/density/periodicity metrics
    const normalizedVelocity = this.normalizeMetricDynamic(source, 'velocity', velocity)
    // Higher velocity = lower stability
    return Math.max(0, 1 - normalizedVelocity)
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
        return this.normalizeMetricDynamic(source, 'createsPerMinute', metrics.createsPerMinute)
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
        return this.normalizeMetricDynamic(source, 'deletesPerMinute', metrics.deletesPerMinute)
      default:
        return 0
    }
  }

  /**
   * Classify gesture type based on metric characteristics
   * Uses PURE relative comparison: whichever metric is highest determines gesture type
   * NO thresholds - gestures emerge naturally from metric variations
   * @param {string} source - Source name
   * @returns {string} Gesture type: 'tap' or 'drag'
   * @private
   */
  classifyGestureType(source) {
    const stability = this.calculateStabilityMetric(source)
    const density = this.calculateDensityMetric(source)

    // Pure relative comparison: stability vs density determines gesture type
    // Higher stability = single notes (tap), higher density = phrases (drag)
    return stability > density ? 'tap' : 'drag'
  }

  /**
   * Golden ratio constant for optimal distribution
   * φ = (1 + √5) / 2 ≈ 1.618033988749895
   * Consecutive values n*φ mod 1 are maximally spread across [0,1]
   * @private
   */
  static PHI = 1.618033988749895
  static PHI_SQ = 2.618033988749895  // φ² for Y axis (different sequence)

  /**
   * Calculate cursor position using GOLDEN RATIO distribution:
   * - Uses golden ratio for optimal spacing between consecutive positions
   * - stepIndex adds variation within trajectories (different for each point)
   * - Still data-derived: position emerges from gestureCount + metrics + step
   *
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @param {number} baseFrequency - Audio frequency (encodes primary metric)
   * @param {number} stepIndex - Optional step index within trajectory (default 0)
   * @returns {{x: number, y: number}} Canvas position (always within 0.05-0.95)
   * @private
   */
  _calculateHybridPosition(source, baseFrequency, stepIndex = 0) {
    const MIN_BOUND = 0.05
    const MAX_BOUND = 0.95
    const RANGE = MAX_BOUND - MIN_BOUND  // 0.9

    // Get gesture counter
    const gestureCount = this.gestureCounters[source] || 0

    // Source-specific offset to differentiate patterns (prime numbers)
    const sourceOffset = source === 'wikipedia' ? 17 : source === 'hackernews' ? 53 : 97

    // Get metrics for influence
    const normalizedFreq = Math.max(0, Math.min(1, (baseFrequency - 110) / 1100))
    let secondaryMetric = 0.5

    const sourceMetrics = this.metrics[source]
    if (sourceMetrics) {
      switch (source) {
        case 'wikipedia':
          secondaryMetric = this.normalizeMetricDynamic(source, 'avgEditSize', sourceMetrics.avgEditSize || 0)
          break
        case 'hackernews':
          secondaryMetric = this.normalizeMetricDynamic(source, 'avgUpvotes', sourceMetrics.avgUpvotes || 0)
          break
        case 'github':
          secondaryMetric = this.normalizeMetricDynamic(source, 'createsPerMinute', sourceMetrics.createsPerMinute || 0)
          break
      }
    }

    // GOLDEN RATIO DISTRIBUTION
    // Each axis uses different φ power for independent sequences
    // stepIndex ensures trajectory points don't cluster
    const combinedSeed = gestureCount + sourceOffset + stepIndex

    // X: golden ratio sequence modulated by frequency
    // Adding normalizedFreq shifts the sequence based on pitch
    const xGolden = (combinedSeed * LandingCompositionService.PHI + normalizedFreq * 3.7) % 1

    // Y: golden ratio squared sequence modulated by secondary metric
    // Different multiplier (φ²) ensures X and Y are uncorrelated
    const yGolden = (combinedSeed * LandingCompositionService.PHI_SQ + secondaryMetric * 5.3) % 1

    // Map to canvas range
    const x = MIN_BOUND + xGolden * RANGE
    const y = MIN_BOUND + yGolden * RANGE

    return { x, y }
  }

  /**
   * Generate trajectory for drag gesture using GOLDEN RATIO distribution:
   * - Interpolate frequency between start and end
   * - Each step gets unique stepIndex for optimal position spacing
   * - Reduced emission rate (100ms) to avoid trail spam
   *
   * @param {string} source - Source name
   * @param {number} startFreq - Starting frequency
   * @param {number} endFreq - Ending frequency
   * @param {number} durationMs - Gesture duration
   * @param {number} intervalMs - Update interval (default 100ms for reduced trail density)
   * @returns {Array<{x: number, y: number, timeOffset: number}>} Trajectory positions
   * @private
   */
  _generateHybridTrajectory(source, startFreq, endFreq, durationMs, intervalMs = 100) {
    const steps = Math.max(1, Math.ceil(durationMs / intervalMs))
    const positions = []

    for (let i = 0; i <= steps; i++) {
      const t = steps > 0 ? i / steps : 0
      // Ease-in-out for natural feel
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

      // Interpolate frequency
      const currentFreq = startFreq + (endFreq - startFreq) * eased

      // Pass stepIndex (i) for golden ratio variation within trajectory
      const pos = this._calculateHybridPosition(source, currentFreq, i)

      positions.push({
        x: pos.x,
        y: pos.y,
        timeOffset: i * intervalMs
      })
    }

    return positions
  }
}

module.exports = LandingCompositionService
