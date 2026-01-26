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
const { getGenreVelocityMultiplier, GENRE_BPM_RANGES } = require('../utils/GenreUtils')
const { getSynthParams, getAllGenres } = require('../utils/GenreCharacteristics')
const { VIRTUAL_USER_COLORS } = require('../constants/colors')

// Entry #182: Metric-driven genre selection with starvation prevention (same as BackgroundCompositionService)
const GENRE_CHECK_INTERVAL = 30 * 1000      // Controllo cambio genere ogni 30s
const MIN_GENRE_PLAY_TIME = 3 * 60 * 1000   // Minimo 3 minuti prima di cambiare
const MAX_STARVATION_TIME = 7 * 60 * 1000   // Max 7 minuti senza suonare un genere
const STARVATION_BOOST_EXPONENT = 2         // Curva quadratica (gentile all'inizio)
const MAX_BOOST_MULTIPLIER = 3.0            // Boost massimo 3x
const BPM_CHANGE_INTERVAL = 60 * 1000       // 1 minuto
const BPM_SMOOTHING_STEPS = 30              // transizione graduale
const ALL_GENRES = getAllGenres()

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
    // Entry #174 addendum: Reduced from 0.65-0.70 to 0.45-0.55 to make virtual users less prolific
    this.gestureConfig = {
      baseDensityMultiplier: 0.45, // 45% pass at HIGH activity (reduced from 65%)
      minDensity: 0.15,            // Minimum for sparse compositions (unused in current formula)
      maxDensity: 0.55             // 55% pass at LOW activity (reduced from 70%)
    }

    // Entry #187: Source-specific balancing to equalize gesture distribution
    // Problem: Wikipedia polls every 5s with high activity, GitHub every 60s with low activity
    // Solution: Per-source parameters to compensate for structural differences
    //
    // Tuning methodology for gestureIntentMultiplier:
    // - Base threshold is 0.1 (10% of normalized velocity required to gesture)
    // - Multiplier adjusts this threshold: higher = stricter = fewer gestures
    // - Wikipedia (1.5x): threshold 0.15 → reduces gesture rate by ~33% (naturally prolific)
    // - HackerNews (1.0x): threshold 0.10 → neutral baseline (moderate activity)
    // - GitHub (0.5x): threshold 0.05 → doubles gesture rate (compensates for 60s poll)
    //
    // Activity floor rationale:
    // - Wikipedia (0.2): low floor, relies on natural high activity
    // - HackerNews (0.3): moderate floor for moderate polling
    // - GitHub (0.4): high floor ensures presence despite 60s poll interval
    this.sourceBalancing = {
      wikipedia: {
        activityFloor: 0.2,           // Low floor - Wikipedia is naturally active
        gestureIntentMultiplier: 1.5, // 1.5x threshold → ~33% fewer gestures
        durationBias: { tap: 0.35, short: 0.40, medium: 0.20, long: 0.05 }  // Quick edits → quick gestures
      },
      hackernews: {
        activityFloor: 0.3,           // Moderate floor for 10s poll interval
        gestureIntentMultiplier: 1.0, // Neutral baseline (no adjustment)
        durationBias: { tap: 0.25, short: 0.40, medium: 0.25, long: 0.10 }  // Balanced distribution
      },
      github: {
        activityFloor: 0.4,           // High floor compensates for 60s poll
        gestureIntentMultiplier: 0.5, // 0.5x threshold → ~2x more gestures
        durationBias: { tap: 0.20, short: 0.35, medium: 0.30, long: 0.15 }  // Commits → substantial gestures
      }
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
    // Entry #183: Better tessellation to avoid center clustering
    this.currentPositions = {
      wikipedia: { x: 0.20, y: 0.80 },   // Bottom-left area (bass)
      hackernews: { x: 0.80, y: 0.50 },  // Right-center (tenor) - moved from center
      github: { x: 0.30, y: 0.20 }       // Top-left area (soprano)
    }

    // Target positions for interpolation
    this.targetPositions = {
      wikipedia: { x: 0.20, y: 0.80 },
      hackernews: { x: 0.80, y: 0.50 },
      github: { x: 0.30, y: 0.20 }
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

    // Entry #182: Initialize style cycling (same as BackgroundCompositionService)
    const now = Date.now()
    this.styleCycling = {
      currentGenre: 'melodic',                           // genere iniziale (neutro)
      genreHistory: this._initializeGenreHistory(now),   // storia per ogni genere
      genreStartTime: now,                               // quando il genere corrente è iniziato
      lastGenreCheckTime: now,                           // ultimo controllo cambio genere
      lastBPMChangeTime: now,                            // timestamp ultimo cambio BPM
      targetBPM: 100,                                    // BPM target corrente
      currentBPM: 100                                    // BPM attuale (per smoothing)
    }

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

    // Broadcast drone to landing room (Entry #182: include style)
    if (this.io) {
      const currentStyle = this._getCurrentStyle()
      this.io.to(this.landingRoomId).emit('background-composition', {
        roomId: this.landingRoomId,
        composition: droneComposition,
        compositionNumber: 0,
        isDrone: true,
        timestamp: Date.now(),
        style: {
          genreWeights: currentStyle.genreWeights,
          dominantGenre: currentStyle.forcedGenre,
          forcedGenre: currentStyle.forcedGenre,
          energy: currentStyle.energy,
          synthParams: currentStyle.synthParams,
          currentBPM: currentStyle.currentBPM
        }
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

    // Entry #182: Include style with forcedGenre
    const currentStyle = this._getCurrentStyle()
    socket.emit('background-composition', {
      roomId: this.landingRoomId,
      composition: droneComposition,
      compositionNumber: 0,
      isDrone: true,
      timestamp: Date.now(),
      style: {
        genreWeights: currentStyle.genreWeights,
        dominantGenre: currentStyle.forcedGenre,
        forcedGenre: currentStyle.forcedGenre,
        energy: currentStyle.energy,
        synthParams: currentStyle.synthParams,
        currentBPM: currentStyle.currentBPM
      }
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
   * Entry #187: Applies source-specific activityFloor for balanced gesture distribution
   * @param {string} source - Source name
   * @returns {number} Activity level (0.0-1.0)
   * @private
   */
  calculateActivityLevel(source) {
    const metrics = this.metrics[source]
    let rawActivity

    switch (source) {
      case 'wikipedia':
        // DYNAMIC: Uses historical range of editsPerMinute
        rawActivity = this.normalizeMetricDynamic(source, 'editsPerMinute', metrics.editsPerMinute)
        break
      case 'hackernews':
        // DYNAMIC: Uses historical range of postsPerMinute
        rawActivity = this.normalizeMetricDynamic(source, 'postsPerMinute', metrics.postsPerMinute)
        break
      case 'github':
        // DYNAMIC: Uses historical range of commitsPerMinute
        rawActivity = this.normalizeMetricDynamic(source, 'commitsPerMinute', metrics.commitsPerMinute)
        break
      default:
        rawActivity = 0.5
    }

    // Entry #187: Apply source-specific floor to ensure minimum activity
    // Floor is a HARD MINIMUM - even if normalized activity is 0, return the floor
    // Example: GitHub floor=0.4 means it will gesture as if at least 40% active
    const balancing = this.sourceBalancing[source] || LandingCompositionService.DEFAULT_BALANCING
    return Math.max(balancing.activityFloor, rawActivity)
  }

  /**
   * Entry #187: Calculate gesture intent threshold for a source
   * Extracted for clarity and testability. Lower threshold = more gestures pass.
   *
   * Formula: BASE_THRESHOLD × sourceMultiplier × (1 - activityLevel × ACTIVITY_MODULATION)
   * - BASE_THRESHOLD (0.1): 10% of normalized velocity required to gesture
   * - sourceMultiplier: per-source adjustment (1.5 = stricter, 0.5 = more permissive)
   * - ACTIVITY_MODULATION (0.5): high activity reduces threshold by up to 50%
   *
   * @param {string} source - Source name
   * @param {number} activityLevel - Activity level (0-1)
   * @returns {number} Threshold value (0-1)
   * @private
   */
  _calculateGestureIntentThreshold(source, activityLevel) {
    const balancing = this.sourceBalancing[source] || LandingCompositionService.DEFAULT_BALANCING
    const BASE_THRESHOLD = 0.1
    const ACTIVITY_MODULATION = 0.5  // 50% reduction at max activity

    return BASE_THRESHOLD * balancing.gestureIntentMultiplier * (1 - activityLevel * ACTIVITY_MODULATION)
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

      // Entry #187: Calculate gesture intent threshold using source-specific multiplier
      // Higher multiplier = stricter threshold = fewer gestures (Wikipedia)
      // Lower multiplier = looser threshold = more gestures (GitHub)
      const gestureIntent = this._calculateGestureIntentThreshold(source, activityLevel)

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

      // Entry #174: Select duration category using PHI-based cycling
      // Guarantees balanced distribution: 20% taps, 30% short, 30% medium, 20% long
      const { category, durationRange } = this._selectDurationCategory(source)

      // Generate gesture based on category
      if (category === 'tap') {
        gestures.push(this.generateVirtualTap(source, velocity))
      } else {
        // Short, medium, and long all use drag with different duration ranges
        gestures.push(this.generateVirtualDrag(source, velocity, acceleration, durationRange))
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
  generateVirtualDrag(source, velocity, acceleration, durationRange) {
    const activity = this.calculateActivityLevel(source)

    // Note: Position is now calculated via REVERSE MAPPING in emitDragPhrase()
    // Cursor trajectory is derived FROM generated note frequencies, not from metrics directly

    // Entry #174: Duration within category range, modulated by density for musical coherence
    // Category ranges: short (300-1500ms), medium (1500-5000ms), long (5000-16000ms)
    const density = this.calculateDensityMetric(source)
    const { min: rangeMin, max: rangeMax } = durationRange
    // Validate density is finite and in expected range (defensive against NaN/Infinity)
    const safeDensity = Number.isFinite(density) ? Math.max(0, Math.min(1, density)) : 0.5
    const dragDurationMs = rangeMin + (safeDensity * (rangeMax - rangeMin))

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
   * Entry #175b + #182: Get current style for socket emissions (landing room)
   * Returns style object compatible with frontend genre-aware playback
   * Entry #182: Uses forcedGenre from styleCycling instead of calculated dominantGenre
   * @returns {Object} Style object with genreWeights, dominantGenre, forcedGenre, energy, synthParams
   * @private
   */
  _getCurrentStyle() {
    // Entry #182: Update style cycling to get current forced genre
    const cycling = this.updateStyleCycle()
    const forcedGenre = cycling?.currentGenre || 'melodic'

    const defaultStyle = {
      genreWeights: {},
      dominantGenre: forcedGenre,
      forcedGenre: forcedGenre,
      energy: 0.5,
      synthParams: getSynthParams(forcedGenre)
    }

    if (!this.styleAnalyzer) {
      return defaultStyle
    }

    try {
      const style = this.styleAnalyzer.getCurrentStyle()
      const genreWeights = style?.genreWeights || {}

      // Entry #182: Use forcedGenre from styleCycling instead of calculated dominant
      return {
        genreWeights: genreWeights,
        dominantGenre: forcedGenre,
        forcedGenre: forcedGenre,
        energy: style?.energy || 0.5,
        synthParams: getSynthParams(forcedGenre),
        currentBPM: cycling?.currentBPM
      }
    } catch (error) {
      console.error('Error getting style for landing room:', error.message)
      return defaultStyle
    }
  }

  /**
   * Entry #182: Initialize genre history for landing room
   * All genres start with lastPlayedTime = startTime to avoid false starvation
   * @param {number} startTime - Service start timestamp
   * @returns {Object} genreHistory object
   */
  _initializeGenreHistory(startTime) {
    const history = {}
    // Safeguard against empty ALL_GENRES
    if (!ALL_GENRES || ALL_GENRES.length === 0) {
      return { melodic: { lastPlayedTime: startTime, totalPlayTime: 0, playCount: 1 } }
    }
    ALL_GENRES.forEach((genre) => {
      history[genre] = {
        lastPlayedTime: startTime,
        totalPlayTime: 0,
        playCount: genre === 'melodic' ? 1 : 0
      }
    })
    return history
  }

  /**
   * Entry #182: Calculate adjusted weight with starvation boost
   * @param {string} genre - Genre name
   * @param {number} metricWeight - Weight from StyleAnalyzer (0-1)
   * @param {Object} history - Genre history object
   * @param {number} now - Current timestamp
   * @returns {number} Adjusted weight
   */
  _calculateAdjustedWeight(genre, metricWeight, history, now) {
    if (!history || typeof history !== 'object') {
      return metricWeight
    }
    const genreHistory = history[genre]
    if (!genreHistory || typeof genreHistory.lastPlayedTime !== 'number') {
      return metricWeight
    }

    const timeSinceLastPlayed = Math.max(0, now - genreHistory.lastPlayedTime)
    const starvationRatio = Math.min(1, timeSinceLastPlayed / MAX_STARVATION_TIME)
    const boostMultiplier = 1 + (MAX_BOOST_MULTIPLIER - 1) * Math.pow(starvationRatio, STARVATION_BOOST_EXPONENT)

    return metricWeight * boostMultiplier
  }

  /**
   * Entry #182: Select next genre based on metrics + starvation
   * @param {Object} styleWeights - Genre weights from StyleAnalyzer
   * @param {Object} history - Genre history object
   * @param {number} now - Current timestamp
   * @param {string} currentGenre - Currently playing genre
   * @param {number} genreStartTime - When current genre started
   * @returns {string} Selected genre name
   */
  _selectNextGenre(styleWeights, history, now, currentGenre, genreStartTime) {
    if (!ALL_GENRES || ALL_GENRES.length === 0) {
      return currentGenre || 'melodic'
    }
    if (!history || typeof history !== 'object') {
      return currentGenre || ALL_GENRES[0]
    }

    // 1. Check MIN_GENRE_PLAY_TIME first
    const currentPlayTime = Math.max(0, now - genreStartTime)
    if (currentPlayTime < MIN_GENRE_PLAY_TIME) {
      return currentGenre
    }

    // 2. Calculate adjusted weights and find critically starved genre
    const adjustedWeights = {}
    let criticallyStarvedGenre = null
    let criticalStarvationTime = 0
    const defaultWeight = 1 / ALL_GENRES.length

    for (const genre of ALL_GENRES) {
      const metricWeight = styleWeights[genre] || defaultWeight
      adjustedWeights[genre] = this._calculateAdjustedWeight(genre, metricWeight, history, now)

      const genreHistory = history[genre]
      if (genreHistory && typeof genreHistory.lastPlayedTime === 'number') {
        const timeSince = Math.max(0, now - genreHistory.lastPlayedTime)
        if (timeSince >= MAX_STARVATION_TIME && timeSince > criticalStarvationTime) {
          criticallyStarvedGenre = genre
          criticalStarvationTime = timeSince
        }
      }
    }

    // 3. Force critically starved genre
    if (criticallyStarvedGenre) {
      return criticallyStarvedGenre
    }

    // 4. Select genre with highest adjusted weight
    let bestGenre = currentGenre
    let bestWeight = adjustedWeights[currentGenre] || 0

    for (const [genre, weight] of Object.entries(adjustedWeights)) {
      if (weight > bestWeight) {
        bestWeight = weight
        bestGenre = genre
      }
    }

    return bestGenre
  }

  /**
   * Entry #182: Update style cycling - metric-driven genre selection with starvation prevention
   * @returns {Object} cycling state with currentGenre and currentBPM
   */
  updateStyleCycle() {
    const now = Date.now()
    if (!this.styleCycling) {
      return { currentGenre: 'melodic', currentBPM: 100 }
    }

    const cycling = this.styleCycling
    const style = this.styleAnalyzer.getCurrentStyle()

    // --- SELEZIONE GENERE BASATA SU METRICHE + STARVATION ---
    if (now - cycling.lastGenreCheckTime >= GENRE_CHECK_INTERVAL) {
      const prevGenre = cycling.currentGenre

      const nextGenre = this._selectNextGenre(
        style.genreWeights || {},
        cycling.genreHistory,
        now,
        cycling.currentGenre,
        cycling.genreStartTime
      )

      if (nextGenre !== prevGenre) {
        const playTime = Math.max(0, now - cycling.genreStartTime)
        if (cycling.genreHistory[prevGenre]) {
          cycling.genreHistory[prevGenre].totalPlayTime += playTime
        }

        cycling.currentGenre = nextGenre
        cycling.genreStartTime = now

        if (cycling.genreHistory[nextGenre]) {
          cycling.genreHistory[nextGenre].lastPlayedTime = now
          cycling.genreHistory[nextGenre].playCount++
        } else {
          cycling.genreHistory[nextGenre] = { lastPlayedTime: now, totalPlayTime: 0, playCount: 1 }
        }

        const bpmRange = GENRE_BPM_RANGES[nextGenre] || GENRE_BPM_RANGES.melodic
        cycling.targetBPM = bpmRange.default
      }

      cycling.lastGenreCheckTime = now
    }

    // --- BPM MODULATION (ogni minuto) ---
    if (now - cycling.lastBPMChangeTime >= BPM_CHANGE_INTERVAL) {
      const bpmRange = GENRE_BPM_RANGES[cycling.currentGenre] || GENRE_BPM_RANGES.melodic
      const variation = (Math.random() - 0.5) * (bpmRange.max - bpmRange.min) * 0.3
      cycling.targetBPM = Math.round(
        Math.max(bpmRange.min, Math.min(bpmRange.max, bpmRange.default + variation))
      )
      cycling.lastBPMChangeTime = now
    }

    // --- BPM SMOOTHING ---
    const bpmDiff = cycling.targetBPM - cycling.currentBPM
    if (Math.abs(bpmDiff) > 1) {
      cycling.currentBPM += bpmDiff / BPM_SMOOTHING_STEPS
    }

    return cycling
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

    // Entry #174 addendum: Increased from 10-16 to 16-24 beats to reduce prolixity
    // High activity = more frequent (16 beats), Low activity = sparse (24 beats)
    const beatsPerComposition = 24 - (totalActivity * 8)  // 16-24 beats, emerges from activity

    const beatDuration = 60000 / tempo  // milliseconds per beat
    const interval = beatsPerComposition * beatDuration

    // Clamp to reasonable bounds (8-20 seconds) - increased from 4-15s
    const clampedInterval = Math.max(8000, Math.min(20000, interval))

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
      // Entry #182: Use _getCurrentStyle() which includes forcedGenre from styleCycling
      const currentStyle = this._getCurrentStyle()
      const style = this.styleAnalyzer.getCurrentStyle()
      const baseTempo = currentStyle?.currentBPM || style?.tempo || 120

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

      // STEP 7: Broadcast background composition with style (Entry #182)
      if (this.io) {
        this.io.to(this.landingRoomId).emit('background-composition', {
          roomId: this.landingRoomId,
          composition,
          compositionNumber: this.compositionCount,
          timestamp: Date.now(),
          // Entry #182: Include style with forcedGenre for frontend genre-aware playback
          style: {
            genreWeights: currentStyle.genreWeights,
            dominantGenre: currentStyle.forcedGenre,
            forcedGenre: currentStyle.forcedGenre,
            energy: currentStyle.energy,
            synthParams: currentStyle.synthParams,
            currentBPM: currentStyle.currentBPM
          }
        })
        // console.log(`🎵 Broadcast composition #${this.compositionCount} to landing room (genre: ${currentStyle.forcedGenre})`)
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
      // Entry #182: Include styleCycling for genre display in monitor
      if (this.compositionMonitor && this.compositionMonitor.enabled) {
        setImmediate(() => {
          try {
            const snapshot = this.compositionMonitor.createSnapshot(
              this.landingRoomId,
              this.compositionEngine,
              this.harmonicEngine,
              this.styleAnalyzer,
              this.materialLibrary,
              {
                gestureCount: virtualGestures.length,
                compositionStarted: true,
                styleCycling: this.styleCycling  // Entry #182: Include for genre monitoring
              },
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

    // Entry #171: Web metrics-driven variation (deterministic, no randomness)
    const webMetrics = this._normalizeWebMetrics() || {
      wikipedia: { normalized: 0.5 },
      hackernews: { normalized: 0.5 },
      github: { normalized: 0.5 }
    }
    const wiki = webMetrics.wikipedia.normalized
    const hn = webMetrics.hackernews.normalized
    const gh = webMetrics.github.normalized

    // Convert to MIDI pitch with metrics offset
    let rawPitch = Math.round(12 * Math.log2(rawFreq / 440) + 69)

    // Entry #171: Pitch variation ±3 semitones based on combined metrics
    const pitchOffset = Math.floor((wiki + hn - 1) * 3)
    rawPitch = rawPitch + pitchOffset

    // Constrain to scale AFTER adding variation (preserves harmonic coherence)
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

    // Entry #175b: Get style for genre-aware playback (landing room) - moved before velocity calc
    const style = this._getCurrentStyle()

    // Entry #171: Velocity variation 0.75-1.0 based on GitHub activity
    // Entry #NEW: Apply genre velocity multiplier for consistency with rooms
    const baseVelocity = 0.75 + (gh * 0.25)
    const genreMultiplier = getGenreVelocityMultiplier(style)
    const tapVelocity = baseVelocity * genreMultiplier

    // 4. Emit musical event with reverse-mapped position
    this.io.to(this.landingRoomId).emit('musical:event', {
      type: 'tap',
      userId: user.userId,
      frequency: frequency,
      velocity: tapVelocity,
      duration: tapDuration,
      position: position,
      userColor: user.color,
      isRemote: true,
      timestamp: Date.now(),
      style: style  // Entry #175b
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
    // Entry #172: Extended from 300-3000ms for longer phrases
    // Entry #173 fix: Extended to 300-16000ms to match PhraseMorphology max 32 beats
    const phraseDurationMs = 300 + (density * 15700)  // 300-16000ms
    const gestureVelocity = normalizedVelocity * 100

    const absAccel = Math.abs(gesture.acceleration || 0)
    const normalizedAccel = this.normalizeMetricDynamic(gesture.source, 'acceleration', absAccel)
    const velocityVariance = normalizedVelocity
    const accelerationVariance = normalizedAccel
    const curvature = accelerationVariance / (velocityVariance + accelerationVariance + 0.1)
    const clampedCurvature = Math.max(0, Math.min(1, curvature))

    // Entry #183: Create gestureData for PhraseMorphology with boosted metrics
    // CRITICAL #2 fix: Defensive clamping for acceleration (can be NaN/Infinity)
    const rawAcceleration = gesture.acceleration || 0
    const safeAcceleration = Number.isFinite(rawAcceleration) ? rawAcceleration : 0
    const clampedAcceleration = Math.max(-10, Math.min(10, safeAcceleration))
    //
    // MEDIUM #2 fix: Quadratic velocity preserves quiet moments
    // MEDIUM #4 fix: Full curvature range with boost multiplier
    const gestureData = {
      velocity: normalizedVelocity * normalizedVelocity * 100,  // Quadratic: 0.3→9, 0.5→25, 0.7→49, 1.0→100
      curvature: Math.min(1, clampedCurvature * 1.5),           // 0-1 boosted (0.5→0.75, 0.7→1.0)
      acceleration: clampedAcceleration * 30 + 20,              // -280 to 320 range, safe
      intensity: this.calculateActivityLevel(gesture.source),
      duration: phraseDurationMs
    }

    // 1. Generate phrase FIRST (musical content)
    const phrase = this.phraseMorphology.generatePhrase(gestureData, musicalContext)

    if (!phrase?.notes || !Array.isArray(phrase.notes)) {
      return
    }

    // Entry #171: Web metrics-driven variation for drag phrases
    const webMetrics = this._normalizeWebMetrics() || {
      wikipedia: { normalized: 0.5 },
      hackernews: { normalized: 0.5 },
      github: { normalized: 0.5 }
    }
    const wiki = webMetrics.wikipedia.normalized
    const hn = webMetrics.hackernews.normalized
    const gh = webMetrics.github.normalized

    // Entry #171: Pitch offset ±3 semitones based on combined metrics
    const pitchOffset = Math.floor((wiki + hn - 1) * 3)

    // Entry #175b: Get style for genre-aware playback (moved before velocity calc)
    const style = this._getCurrentStyle()

    // Entry #171: Velocity multiplier based on GitHub activity (0.75-1.0)
    // Entry #NEW: Apply genre velocity multiplier for consistency with rooms
    const baseVelocityMultiplier = 0.75 + (gh * 0.25)
    const genreMultiplier = getGenreVelocityMultiplier(style)
    const velocityMultiplier = baseVelocityMultiplier * genreMultiplier

    // HARMONIC COHERENCE: Constrain all phrase notes to room's scale/mode
    // PhraseMorphology uses mood-based scale selection; this ensures room coherence
    const { key, mode } = musicalContext
    phrase.notes = phrase.notes.map(note => ({
      ...note,
      // Add pitch offset BEFORE constraining to scale
      pitch: this.harmonicEngine.constrainToScale(note.pitch + pitchOffset, key, mode),
      // Modulate velocity while preserving relative dynamics
      velocity: Math.min(127, Math.max(1, Math.round((note.velocity || 80) * velocityMultiplier)))
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

    // Entry #175b: style already retrieved above for genre velocity calculation

    // Emit phrase event for visual system
    this.io.to(this.landingRoomId).emit('musical:event', {
      type: 'phrase',
      userId: user.userId,
      velocity: Math.min(1, normalizedVelocity),
      noteCount: noteData.length,
      isRemote: true,
      timestamp: Date.now(),
      style: style  // Entry #175b
    })

    // Entry #185c: Cursor position derived from note frequency, synchronized with audio
    noteData.forEach((note, noteIndex) => {
      const noteTimeoutId = setTimeout(() => {
        this.pendingTimeouts.delete(noteTimeoutId)
        if (!this.io || !this.isRunning) return

        // Calculate cursor position from note frequency
        // Y based on pitch: high freq = top, low freq = bottom
        const notePosition = this._calculateHybridPosition(gesture.source, note.audioFreq, noteIndex)

        // Move cursor to note position (synchronized with audio)
        this._emitCursorAtPosition(gesture.source, user, notePosition)

        // Emit note with matching position
        this.io.to(this.landingRoomId).emit('hold:start', {
          type: 'hold:start',
          userId: user.userId,
          noteId: note.noteId,
          frequency: note.audioFreq,  // From PhraseMorphology (in scale)
          velocity: note.velocity,
          duration: note.durationMs / 1000,
          position: notePosition,
          userColor: user.color,
          isRemote: true,
          timestamp: Date.now(),
          style: style
        })

        // Schedule hold:end
        const holdEndTimeoutId = setTimeout(() => {
          this.pendingTimeouts.delete(holdEndTimeoutId)
          if (this.io && this.isRunning) {
            this.io.to(this.landingRoomId).emit('hold:end', {
              type: 'hold:end',
              userId: user.userId,
              noteId: note.noteId,
              timestamp: Date.now(),
              style: this._getCurrentStyle() || style  // Entry #183: Include style for consistent propagation
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
   * Entry #187: Default balancing configuration for sources without explicit config
   * Used as fallback to ensure consistent behavior across all methods
   * @static
   */
  static DEFAULT_BALANCING = {
    activityFloor: 0.3,           // Neutral floor
    gestureIntentMultiplier: 1.0, // No adjustment
    durationBias: { tap: 0.25, short: 0.40, medium: 0.25, long: 0.10 }
  }

  /**
   * Entry #174: Select duration category using PHI-based cycling
   * Entry #187: Source-specific duration bias for balanced gesture character
   * - Wikipedia: more taps/shorts (quick edits → quick gestures)
   * - GitHub: more medium/long (commits → substantial gestures)
   *
   * PHI stepping creates a low-discrepancy sequence that cycles through all categories
   * naturally without repeating patterns. Source offsets prevent synchronization.
   *
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @returns {{category: string, durationRange: {min: number, max: number}}}
   * @private
   */
  _selectDurationCategory(source) {
    const gestureCount = this.gestureCounters[source] || 0

    // Source-specific offset to prevent synchronization between sources
    // Uses irrational fractions for maximum distribution
    const sourceOffset = source === 'wikipedia' ? 0.17
                       : source === 'hackernews' ? 0.53
                       : 0.89

    // PHI-based selector creates low-discrepancy sequence
    const selector = ((gestureCount * LandingCompositionService.PHI) + sourceOffset) % 1

    // Entry #187: Get source-specific duration weights (use DEFAULT_BALANCING as fallback)
    const balancing = this.sourceBalancing[source] || LandingCompositionService.DEFAULT_BALANCING
    const bias = balancing.durationBias

    // Category boundaries from bias weights
    const tapEnd = bias.tap
    const shortEnd = tapEnd + bias.short
    const mediumEnd = shortEnd + bias.medium

    if (selector < tapEnd) {
      return { category: 'tap', durationRange: { min: 50, max: 300 } }
    }
    if (selector < shortEnd) {
      return { category: 'short', durationRange: { min: 300, max: 1500 } }
    }
    if (selector < mediumEnd) {
      return { category: 'medium', durationRange: { min: 1500, max: 5000 } }
    }
    return { category: 'long', durationRange: { min: 5000, max: 16000 } }
  }

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

    // Validate input frequency - return initial position if invalid
    if (!Number.isFinite(baseFrequency) || baseFrequency < 0) {
      return this.currentPositions[source] || { x: 0.5, y: 0.5 }
    }

    // Get gesture counter
    const gestureCount = this.gestureCounters[source] || 0

    // Source-specific offset to differentiate patterns (prime numbers)
    const sourceOffset = source === 'wikipedia' ? 17 : source === 'hackernews' ? 53 : 97

    // Entry #185: Quadrant biases - Y-oriented since Y=frequency
    const quadrantBias = {
      wikipedia: { x: -0.15, y: 0.10 },    // Left side, mid-low
      hackernews: { x: 0.15, y: 0 },       // Right side, middle
      github: { x: -0.05, y: -0.15 }       // Center-left, higher
    }
    const bias = quadrantBias[source] || { x: 0, y: 0 }

    // Entry #185c: Y = frequency within source's tessitura range
    // Each source has its own frequency range - normalize within that range
    // Inverted: Y=0 (top) = high freq, Y=1 (bottom) = low freq
    const sourceConfig = this.virtualUsers[source]
    const freqMin = sourceConfig?.frequencyRange?.min || 110
    const freqMax = sourceConfig?.frequencyRange?.max || 880
    const freqRange = freqMax - freqMin
    const normalizedFreq = freqRange > 0
      ? Math.max(0, Math.min(1, (baseFrequency - freqMin) / freqRange))
      : 0.5
    const yFromFreq = 1 - normalizedFreq  // Invert: high freq = low Y (top)

    // X position from secondary metrics
    let xMetric = 0.5
    const sourceMetrics = this.metrics[source]
    if (sourceMetrics) {
      switch (source) {
        case 'wikipedia':
          xMetric = this.normalizeMetricDynamic(source, 'avgEditSize', sourceMetrics.avgEditSize || 0)
          break
        case 'hackernews':
          xMetric = this.normalizeMetricDynamic(source, 'avgUpvotes', sourceMetrics.avgUpvotes || 0)
          break
        case 'github':
          xMetric = this.normalizeMetricDynamic(source, 'createsPerMinute', sourceMetrics.createsPerMinute || 0)
          break
      }
    }

    if (!Number.isFinite(xMetric)) {
      xMetric = 0.5
    }

    // GOLDEN RATIO DISTRIBUTION for variation
    const combinedSeed = gestureCount + sourceOffset + stepIndex
    const xGolden = (combinedSeed * LandingCompositionService.PHI) % 1
    const yGolden = (combinedSeed * LandingCompositionService.PHI_SQ) % 1

    // X position: metric-based with ±15% golden ratio variation
    const xBase = xMetric + (xGolden - 0.5) * 0.3

    // Y position: frequency-based with ±10% golden ratio variation
    const yBase = yFromFreq + (yGolden - 0.5) * 0.2

    // Apply bias and clamp
    const xBiased = Math.max(0, Math.min(1, xBase + bias.x))
    const yBiased = Math.max(0, Math.min(1, yBase + bias.y))

    const x = MIN_BOUND + xBiased * RANGE
    const y = MIN_BOUND + yBiased * RANGE

    return { x, y }
  }

  /**
   * Convert Y position to frequency (inverse of position calculation)
   * Entry #185: Y=0 (top) = high freq, Y=1 (bottom) = low freq
   * @param {number} y - Y position (0.05-0.95)
   * @returns {number} Frequency in Hz
   * @private
   */
  _yToFrequency(y) {
    const normalizedY = Math.max(0, Math.min(1, (y - 0.05) / 0.9))
    const normalizedFreq = 1 - normalizedY
    return 110 + normalizedFreq * 770
  }

  /**
   * Generate trajectory for drag gesture:
   * - Entry #185: Y = frequency (like real users)
   * - Fast notes = wider movements
   * - Smooth geometric path with arc curvature
   *
   * @param {string} source - Source name
   * @param {number} startFreq - Starting frequency
   * @param {number} endFreq - Ending frequency
   * @param {number} durationMs - Gesture duration
   * @param {number} noteCount - Number of notes in phrase (for amplitude scaling)
   * @param {number} intervalMs - Update interval (default 100ms)
   * @returns {Array<{x: number, y: number, timeOffset: number}>} Trajectory positions
   * @private
   */
  _generateHybridTrajectory(source, startFreq, endFreq, durationMs, noteCount = 4, intervalMs = 100) {
    const steps = Math.max(1, Math.ceil(durationMs / intervalMs))
    const positions = []

    // Entry #185: Calculate start and end positions from frequencies
    const startPos = this._calculateHybridPosition(source, startFreq, 0)
    const endPos = this._calculateHybridPosition(source, endFreq, steps)

    // Entry #185: Scale movement amplitude by note density (notes per second)
    const notesPerSecond = noteCount / (durationMs / 1000)
    const densityFactor = Math.min(2, Math.max(0.5, notesPerSecond / 2))
    const minDist = 0.12 * densityFactor  // 6% to 24% of canvas

    const dx = endPos.x - startPos.x
    const dy = endPos.y - startPos.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    let actualEndPos = endPos
    if (dist < minDist && dist > 0) {
      const scale = minDist / dist
      actualEndPos = {
        x: Math.max(0.05, Math.min(0.95, startPos.x + dx * scale)),
        y: Math.max(0.05, Math.min(0.95, startPos.y + dy * scale))
      }
    } else if (dist === 0) {
      const gestureCount = this.gestureCounters[source] || 0
      const angle = gestureCount * 0.7
      actualEndPos = {
        x: Math.max(0.05, Math.min(0.95, startPos.x + Math.cos(angle) * minDist)),
        y: Math.max(0.05, Math.min(0.95, startPos.y + Math.sin(angle) * minDist))
      }
    }

    // Recalculate direction vector
    const actualDx = actualEndPos.x - startPos.x
    const actualDy = actualEndPos.y - startPos.y
    const actualLen = Math.sqrt(actualDx * actualDx + actualDy * actualDy) || 1

    // Perpendicular direction for curve offset
    const perpX = -actualDy / actualLen
    const perpY = actualDx / actualLen

    // Entry #185: Curve amount scales with density
    const baseCurveAmounts = { wikipedia: 0.08, hackernews: -0.06, github: 0.1 }
    const baseCurve = baseCurveAmounts[source] || 0.05
    const curveAmount = baseCurve * densityFactor

    for (let i = 0; i <= steps; i++) {
      const t = steps > 0 ? i / steps : 0
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

      const x = startPos.x + (actualEndPos.x - startPos.x) * eased
      const y = startPos.y + (actualEndPos.y - startPos.y) * eased

      const curveOffset = Math.sin(t * Math.PI) * curveAmount

      positions.push({
        x: Math.max(0.05, Math.min(0.95, x + perpX * curveOffset)),
        y: Math.max(0.05, Math.min(0.95, y + perpY * curveOffset)),
        timeOffset: i * intervalMs
      })
    }

    return positions
  }
}

module.exports = LandingCompositionService
