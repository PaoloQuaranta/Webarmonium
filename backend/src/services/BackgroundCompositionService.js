/**
 * BackgroundCompositionService
 * Continuous background composition generation
 * Generates articulated musical compositions using CompositionEngine
 * Develops user-generated material with variations, inversions, arpeggios, etc.
 *
 * Features:
 * - Riffs, phrases, and arpeggios
 * - Complex structural forms (ABA, rondo, sonata, etc.)
 * - Material development (variations, inversions, retrograde, etc.)
 * - Harmonic progressions
 * - Multi-user counterpoint
 */

const MaterialLibrary = require('./MaterialLibrary')
const StyleAnalyzer = require('./StyleAnalyzer')
const HarmonicEngine = require('./HarmonicEngine')
const CircularBuffer = require('../utils/CircularBuffer')
const CompositionEngine = require('./CompositionEngine')
const PhraseMorphology = require('./PhraseMorphology')
const { getSectionStateManager } = require('./SectionStateManager')
const RawGestureData = require('../composition/RawGestureData')
const { PHI } = require('../utils/constants')
const { GENRE_BPM_RANGES, createSyntheticGenreWeights, isValidGenre } = require('../utils/GenreUtils')
const { getSynthParams, getAllGenres, createStyleObject, DEFAULT_GENRE } = require('../utils/GenreCharacteristics')

// Entry #182: Metric-driven genre selection with starvation prevention
const GENRE_CHECK_INTERVAL = 30 * 1000      // Controllo cambio genere ogni 30s
const MIN_GENRE_PLAY_TIME = 3 * 60 * 1000   // Minimo 3 minuti prima di cambiare
const MAX_STARVATION_TIME = 7 * 60 * 1000   // Max 7 minuti senza suonare un genere
const STARVATION_BOOST_EXPONENT = 2         // Curva quadratica (gentile all'inizio)
const MAX_BOOST_MULTIPLIER = 3.0            // Boost massimo 3x
const BPM_CHANGE_INTERVAL = 60 * 1000       // 1 minuto
const BPM_SMOOTHING_STEPS = 30              // transizione graduale
// Entry #180b: Use getAllGenres from GenreCharacteristics to stay in sync
const ALL_GENRES = getAllGenres()

class BackgroundCompositionService {
  constructor() {
    // Initialize musical components
    this.materialLibrary = new MaterialLibrary()
    this.styleAnalyzer = new StyleAnalyzer()
    this.harmonicEngine = new HarmonicEngine()
    this.phraseMorphology = new PhraseMorphology()
    this.compositionEngine = new CompositionEngine(
      this.materialLibrary,
      this.styleAnalyzer,
      this.harmonicEngine
    )

    // Entry #169: Section state manager for centralized section broadcast (singleton)
    this.sectionStateManager = getSectionStateManager()

    // Composition state per room
    this.roomCompositions = new Map() // roomId -> composition state

    // Composition intervals (in milliseconds)
    // Slowed down for less chaotic modulation
    this.minCompositionInterval = 5000  // 5 seconds minimum between compositions
    this.maxCompositionInterval = 12000 // 12 seconds maximum between compositions

    // Active composition timers
    this.compositionTimers = new Map() // roomId -> timer

    // Socket.io instance (set by server)
    this.io = null

    // Reference to GestureToMusicService for harmonic synchronization
    this.gestureToMusicService = null

    // Composition monitor (injected by server)
    this.compositionMonitor = null

    // WebMetricsPoller reference (set by ServiceContainer)
    // Entry #163: Used to initialize key from web metrics (same as LandingCompositionService)
    this.webMetricsPoller = null

    // Entry #183: Style cache for performance optimization
    this.styleCache = new Map() // roomId -> { style, timestamp }
    this.STYLE_CACHE_TTL = 5000 // 5 seconds cache TTL

    // Entry #183: Error tracking for styleAnalyzer recovery
    this.styleAnalyzerErrorCount = 0
    this.MAX_STYLE_ANALYZER_ERRORS = 5

    // Performance optimization: Adaptive throttle for style analysis
    // Faster analysis (1s) during rapid input, slower (2s) during normal activity
    this.lastStyleAnalysisTime = new Map()  // roomId -> timestamp
    this.STYLE_ANALYSIS_INTERVAL_FAST = 1000  // 1 second during rapid gestures
    this.STYLE_ANALYSIS_INTERVAL_NORMAL = 2000  // 2 seconds during normal activity
    this.GESTURE_RATE_THRESHOLD = 3  // gestures/second to trigger fast mode

    // Performance optimization: Throttle MaterialLibrary lifecycle updates
    // Hybrid: Quick cleanup on every composition, full cleanup every 10s
    this.lastFullMaterialCleanup = 0
    this.MATERIAL_FULL_CLEANUP_INTERVAL = 10000  // 10 seconds for full cleanup

    // Entry #220: Genre coverage tracking for monitoring parameter distribution
    // Tracks genre usage over rolling 1-hour window to detect underrepresented genres
    // Uses CircularBuffer for weights to avoid O(n) Array.shift() operations
    this.genreCoverage = {}
    for (const genre of ALL_GENRES) {
      this.genreCoverage[genre] = { count: 0, lastPlayed: 0, weights: new CircularBuffer(100) }
    }
    this.GENRE_COVERAGE_WINDOW = 60 * 60 * 1000  // 1 hour rolling window
    this.GENRE_COVERAGE_MIN_COMPOSITIONS = 50    // Minimum compositions before checking coverage
    this.GENRE_COVERAGE_THRESHOLD = 0.05         // Warn if any genre < 5% of compositions

    // Entry #222: Statistical tracking for percentile-based normalization
    // Replaces hardcoded divisors (50, 5, 30) with adaptive normalization
    this._metricStatistics = {
      wikipedia: {
        editsPerMinute: { samples: new CircularBuffer(100) },
        avgEditSize: { samples: new CircularBuffer(100) },
        velocity: { samples: new CircularBuffer(100) },
        acceleration: { samples: new CircularBuffer(100) }
      },
      hackernews: {
        postsPerMinute: { samples: new CircularBuffer(100) },
        avgUpvotes: { samples: new CircularBuffer(100) },
        commentCount: { samples: new CircularBuffer(100) },
        velocity: { samples: new CircularBuffer(100) },
        acceleration: { samples: new CircularBuffer(100) }
      },
      github: {
        commitsPerMinute: { samples: new CircularBuffer(100) },
        createsPerMinute: { samples: new CircularBuffer(100) },
        deletesPerMinute: { samples: new CircularBuffer(100) },
        velocity: { samples: new CircularBuffer(100) },
        acceleration: { samples: new CircularBuffer(100) }
      }
    }

// console.log('🎼 BackgroundCompositionService initialized')
  }

  /**
   * Entry #220: Track genre usage for coverage monitoring.
   * Records dominant genre and all weights for each composition.
   * Logs warning if any genre is significantly underrepresented.
   *
   * @param {string} dominantGenre - The dominant genre of the composition
   * @param {Object} genreWeights - All genre weights for this composition
   * @private
   */
  _trackGenreCoverage(dominantGenre, genreWeights) {
    const now = Date.now()

    // Update dominant genre count
    if (this.genreCoverage[dominantGenre]) {
      this.genreCoverage[dominantGenre].count++
      this.genreCoverage[dominantGenre].lastPlayed = now
    }

    // Track weights for all genres - CircularBuffer handles window size automatically with O(1) push
    for (const [genre, weight] of Object.entries(genreWeights || {})) {
      if (this.genreCoverage[genre]) {
        this.genreCoverage[genre].weights.push(weight)
      }
    }

    // Calculate total compositions
    const totalCompositions = Object.values(this.genreCoverage)
      .reduce((sum, g) => sum + g.count, 0)

    // Only check coverage after minimum compositions
    if (totalCompositions >= this.GENRE_COVERAGE_MIN_COMPOSITIONS) {
      const underrepresented = []
      for (const [genre, data] of Object.entries(this.genreCoverage)) {
        const share = data.count / totalCompositions
        if (share < this.GENRE_COVERAGE_THRESHOLD) {
          underrepresented.push({ genre, share: (share * 100).toFixed(1) + '%' })
        }
      }

      // Log warning if any genres underrepresented (throttled to avoid spam)
      if (underrepresented.length > 0 && totalCompositions % 50 === 0) {
        console.warn(`⚠️ Entry #220: Underrepresented genres after ${totalCompositions} compositions:`,
          underrepresented.map(g => `${g.genre}(${g.share})`).join(', '))
      }
    }
  }

  /**
   * Entry #220: Get genre coverage statistics for monitoring/debugging.
   * @returns {Object} Coverage statistics for each genre
   */
  getGenreCoverageStats() {
    const totalCompositions = Object.values(this.genreCoverage)
      .reduce((sum, g) => sum + g.count, 0)

    const stats = {}
    for (const [genre, data] of Object.entries(this.genreCoverage)) {
      // Convert CircularBuffer to array for reduce operation
      const weightsArray = data.weights.toArray()
      const avgWeight = weightsArray.length > 0
        ? weightsArray.reduce((a, b) => a + b, 0) / weightsArray.length
        : 0
      stats[genre] = {
        count: data.count,
        share: totalCompositions > 0 ? (data.count / totalCompositions * 100).toFixed(1) + '%' : '0%',
        avgWeight: avgWeight.toFixed(3),
        lastPlayed: data.lastPlayed ? new Date(data.lastPlayed).toISOString() : 'never'
      }
    }
    stats._totalCompositions = totalCompositions
    return stats
  }

  /**
   * Set Socket.IO instance for broadcasting
   * @param {SocketIO} io - Socket.IO instance
   */
  setSocketIO(io) {
    this.io = io
// console.log('🎼 BackgroundCompositionService: Socket.IO connected')
  }

  /**
   * Set GestureToMusicService reference for harmonic synchronization
   * @param {GestureToMusicService} gestureService - GestureToMusicService instance
   */
  setGestureToMusicService(gestureService) {
    this.gestureToMusicService = gestureService
    // Initial sync
    this.syncHarmonicContext()
// console.log('🎼 BackgroundCompositionService: GestureToMusicService linked for harmonic sync')
  }

  /**
   * Set WebMetricsPoller reference for key initialization
   * Entry #163: Initialize starting key from web metrics (same as LandingCompositionService)
   * @param {WebMetricsPoller} poller - WebMetricsPoller instance
   */
  setWebMetricsPoller(poller) {
    this.webMetricsPoller = poller
// console.log('🎼 BackgroundCompositionService: WebMetricsPoller connected')
  }

  /**
   * Set VirtualUserService reference for harmonic context sync
   * Entry #213: Virtual users must receive harmonic updates when key/mode changes
   * @param {VirtualUserService} virtualUserService - VirtualUserService instance
   */
  setVirtualUserService(virtualUserService) {
    this.virtualUserService = virtualUserService
    // Initial sync to ensure virtual users start with current harmonic context
    // (mirrors setGestureToMusicService behavior for consistency)
    this.syncHarmonicContext()
  }

  /**
   * Set shared StyleAnalyzer singleton to eliminate redundant computation
   * When 3 services each had their own instance, every gesture triggered
   * analyzeGestureStyle() 3 times. Now all services share one instance.
   * @param {StyleAnalyzer} sharedAnalyzer - Shared StyleAnalyzer instance
   */
  setSharedStyleAnalyzer(sharedAnalyzer) {
    if (sharedAnalyzer && typeof sharedAnalyzer.analyzeGestureStyle === 'function') {
      this.styleAnalyzer = sharedAnalyzer
      // Also update CompositionEngine reference
      if (this.compositionEngine) {
        this.compositionEngine.styleAnalyzer = sharedAnalyzer
      }
    }
  }

  /**
   * Entry #222: Normalize a metric value using percentile-based normalization.
   * Tracks historical values and uses P10-P90 range for robust normalization.
   *
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @param {string} metricName - Metric name
   * @param {number} value - Raw value to normalize
   * @returns {number} Normalized value in 0-1 range
   * @private
   */
  _normalizeMetricValue(source, metricName, value) {
    // Input validation
    if (typeof value !== 'number' || !isFinite(value)) {
      return 0.5
    }

    const stats = this._metricStatistics[source]?.[metricName]
    if (!stats) {
      return 0.5
    }

    // Add sample to history
    stats.samples.push(value)

    const samples = stats.samples.toArray()
    const WARMUP_THRESHOLD = 10
    if (samples.length < WARMUP_THRESHOLD) {
      // Warm-up: use fallback divisors
      const fallbacks = {
        editsPerMinute: 50, postsPerMinute: 5, commitsPerMinute: 30,
        avgEditSize: 2000, avgUpvotes: 100, commentCount: 100,
        createsPerMinute: 10, deletesPerMinute: 5,
        velocity: 30, acceleration: 15
      }
      const fallback = fallbacks[metricName] || 1
      return Math.max(0, Math.min(1, value / fallback))
    }

    // Percentile normalization (P10-P90)
    const sorted = [...samples].sort((a, b) => a - b)
    const p10Index = Math.floor(sorted.length * 0.1)
    const p90Index = Math.floor(sorted.length * 0.9)
    const p10 = sorted[p10Index]
    const p90 = sorted[p90Index]
    const range = p90 - p10

    if (range < 0.001) {
      return 0.5  // Constant values map to middle
    }

    return Math.max(0, Math.min(1, (value - p10) / range))
  }

  /**
   * Entry #171: Normalize raw web metrics to 0-1 range
   * Entry #222: Uses percentile-based normalization instead of hardcoded divisors
   * @returns {Object|null} Normalized web metrics or null if unavailable
   */
  _normalizeWebMetrics() {
    if (!this.webMetricsPoller) return null
    const raw = this.webMetricsPoller.getMetrics()
    if (!raw) return null

    // Entry #222: Use percentile normalization instead of hardcoded divisors
    // This ensures full 0-1 range coverage based on actual data distribution
    return {
      wikipedia: {
        normalized: this._normalizeMetricValue('wikipedia', 'editsPerMinute', raw.wikipedia?.editsPerMinute || 0),
        avgEditSizeNorm: this._normalizeMetricValue('wikipedia', 'avgEditSize', raw.wikipedia?.avgEditSize || 0),
        velocityNorm: this._normalizeMetricValue('wikipedia', 'velocity', Math.abs(raw.wikipedia?.velocity || 0)),
        accelerationNorm: this._normalizeMetricValue('wikipedia', 'acceleration', Math.abs(raw.wikipedia?.acceleration || 0))
      },
      hackernews: {
        normalized: this._normalizeMetricValue('hackernews', 'postsPerMinute', raw.hackernews?.postsPerMinute || 0),
        avgUpvotesNorm: this._normalizeMetricValue('hackernews', 'avgUpvotes', raw.hackernews?.avgUpvotes || 0),
        commentCountNorm: this._normalizeMetricValue('hackernews', 'commentCount', raw.hackernews?.commentCount || 0),
        velocityNorm: this._normalizeMetricValue('hackernews', 'velocity', Math.abs(raw.hackernews?.velocity || 0)),
        accelerationNorm: this._normalizeMetricValue('hackernews', 'acceleration', Math.abs(raw.hackernews?.acceleration || 0))
      },
      github: {
        normalized: this._normalizeMetricValue('github', 'commitsPerMinute', raw.github?.commitsPerMinute || 0),
        createsNorm: this._normalizeMetricValue('github', 'createsPerMinute', raw.github?.createsPerMinute || 0),
        deletesNorm: this._normalizeMetricValue('github', 'deletesPerMinute', raw.github?.deletesPerMinute || 0),
        velocityNorm: this._normalizeMetricValue('github', 'velocity', Math.abs(raw.github?.velocity || 0)),
        accelerationNorm: this._normalizeMetricValue('github', 'acceleration', Math.abs(raw.github?.acceleration || 0))
      }
    }
  }

  /**
   * Entry #175: Extract dominant genre from genre weights
   * @param {Object} genreWeights - Genre weights object
   * @returns {string} Name of dominant genre or 'ambient' as default
   */
  _getDominantGenre(genreWeights) {
    if (!genreWeights) return 'ambient'
    let maxWeight = 0
    let dominantGenre = 'ambient'
    for (const [genre, weight] of Object.entries(genreWeights)) {
      if (weight > maxWeight) {
        maxWeight = weight
        dominantGenre = genre
      }
    }
    return dominantGenre
  }

  /**
   * Entry #175b: Get current style for a room (public method for other handlers)
   * Entry #183: Uses factory function, caching, and enhanced error handling
   * @param {string} roomId - Room ID
   * @returns {Object} Standardized style object
   */
  getCurrentStyleForRoom(roomId) {
    // Entry #183: Check cache first for performance optimization
    const now = Date.now()
    const cached = this.styleCache.get(roomId)
    if (cached && (now - cached.timestamp) < this.STYLE_CACHE_TTL) {
      return cached.style
    }

    // Get room state for styleCycling data
    const roomState = this.roomCompositions.get(roomId)
    const cycling = roomState?.styleCycling
    const manualOverride = cycling?.manualOverride
    const forcedGenre = cycling?.currentGenre || DEFAULT_GENRE

    // Entry #210: Check for manual override - use cached synthetic weights to bypass all escape points
    // Fix #6: Use cached syntheticWeights from override object for performance
    const isManualOverride = manualOverride?.enabled === true
    const overrideWeights = isManualOverride ? manualOverride.syntheticWeights : null

    // Default style using factory if styleAnalyzer unavailable
    if (!this.styleAnalyzer) {
      const style = createStyleObject({
        forcedGenre,
        currentBPM: cycling?.currentBPM,
        // Entry #210: Override genreWeights if manual override active
        genreWeights: overrideWeights
      })
      style.isManualOverride = isManualOverride
      this.styleCache.set(roomId, { style, timestamp: now })
      return style
    }

    try {
      // Use 'background' context for state isolation from other services
      const styleAnalyzerOutput = this.styleAnalyzer.getCurrentStyleForContext
        ? this.styleAnalyzer.getCurrentStyleForContext('background')
        : this.styleAnalyzer.getCurrentStyle()

      // Entry #210: If manual override active, replace genreWeights with synthetic weights
      if (isManualOverride && styleAnalyzerOutput) {
        styleAnalyzerOutput.genreWeights = overrideWeights
      }

      const style = createStyleObject({
        forcedGenre,
        currentBPM: cycling?.currentBPM,
        styleAnalyzerOutput
      })

      // Entry #210: Mark style as having manual override
      style.isManualOverride = isManualOverride

      // Reset error count on success
      this.styleAnalyzerErrorCount = 0

      // Cache the result
      this.styleCache.set(roomId, { style, timestamp: now })
      return style
    } catch (error) {
      // Entry #183: Enhanced error handling with recovery
      console.error('Error getting style for room:', error.message, error.stack)
      this.styleAnalyzerErrorCount++

      // Attempt to reinitialize styleAnalyzer on repeated failures
      if (this.styleAnalyzerErrorCount >= this.MAX_STYLE_ANALYZER_ERRORS) {
        console.warn(`StyleAnalyzer failed ${this.styleAnalyzerErrorCount} times, attempting reinitialization`)
        try {
          // Entry #218b: Use public API to preserve manual override state
          const savedOverride = this.styleAnalyzer?.exportOverrideState()
          this.styleAnalyzer = new StyleAnalyzer()
          this.styleAnalyzerErrorCount = 0
          // Entry #218b: Restore manual override using public API
          if (savedOverride) {
            this.styleAnalyzer.restoreOverrideState(savedOverride)
            console.log('StyleAnalyzer reinitialized with preserved manual override:', savedOverride.forcedGenre)
          } else {
            console.log('StyleAnalyzer reinitialized successfully')
          }
        } catch (reinitError) {
          console.error('Failed to reinitialize StyleAnalyzer:', reinitError.message)
        }
      }

      const style = createStyleObject({
        forcedGenre,
        currentBPM: cycling?.currentBPM,
        genreWeights: overrideWeights
      })
      style.isManualOverride = isManualOverride
      this.styleCache.set(roomId, { style, timestamp: now })
      return style
    }
  }

  /**
   * Entry #183: Invalidate style cache for a room (call when style actually changes)
   * @param {string} roomId - Room ID
   */
  invalidateStyleCache(roomId) {
    this.styleCache.delete(roomId)
  }

  // ========== Entry #210: Manual Genre Override for Testing ==========

  /**
   * Set manual genre override for a room (bypasses automatic genre cycling)
   * @param {string} roomId - Room ID (must be active)
   * @param {string} genre - Genre to force (must be in ALL_GENRES)
   * @returns {Object} Updated override state with { enabled, genre, setAt, syntheticWeights }
   * @throws {Error} If genre is invalid or room not found
   * @example
   * service.setManualGenreOverride('room-123', 'jazz')
   * // Returns: { enabled: true, genre: 'jazz', setAt: 1234567890, syntheticWeights: {...} }
   */
  setManualGenreOverride(roomId, genre) {
    // Validate genre using shared utility (Fix #4)
    if (!isValidGenre(genre, ALL_GENRES)) {
      throw new Error(`Invalid genre: ${genre}. Valid genres: ${ALL_GENRES.join(', ')}`)
    }

    const roomState = this.roomCompositions.get(roomId)
    if (!roomState?.styleCycling) {
      throw new Error(`Room ${roomId} not found or not active`)
    }

    // Fix #6: Cache synthetic weights in override object for performance
    const syntheticWeights = createSyntheticGenreWeights(genre, ALL_GENRES)
    roomState.styleCycling.manualOverride = {
      enabled: true,
      genre: genre,
      setAt: Date.now(),
      syntheticWeights
    }

    // Also update currentGenre to match
    roomState.styleCycling.currentGenre = genre

    // Entry #210 Fix: Propagate override to StyleAnalyzer so ALL getCurrentStyle() calls see it
    // This fixes the escape point where CompositionEngine gets style directly from StyleAnalyzer
    if (this.styleAnalyzer) {
      this.styleAnalyzer.setManualOverride(syntheticWeights, genre)
    }

    // Invalidate style cache to force immediate update
    this.invalidateStyleCache(roomId)

    console.log(`[GenreOverride] Manual override set for room ${roomId}: ${genre}`)
    return roomState.styleCycling.manualOverride
  }

  /**
   * Clear manual genre override and return to automatic mode
   * @param {string} roomId - Room ID
   * @returns {Object} Updated override state
   * @throws {Error} If room not found
   */
  clearManualGenreOverride(roomId) {
    const roomState = this.roomCompositions.get(roomId)
    if (!roomState?.styleCycling) {
      throw new Error(`Room ${roomId} not found`)
    }

    roomState.styleCycling.manualOverride = {
      enabled: false,
      genre: null,
      setAt: null,
      syntheticWeights: null
    }

    // Entry #210 Fix: Clear override from StyleAnalyzer
    if (this.styleAnalyzer) {
      this.styleAnalyzer.clearManualOverride()
    }

    // Invalidate style cache to trigger fresh style calculation
    this.invalidateStyleCache(roomId)

    console.log(`[GenreOverride] Manual override cleared for room ${roomId}, returning to automatic`)
    return roomState.styleCycling.manualOverride
  }

  /**
   * Get current override state for a room
   * @param {string} roomId - Room ID
   * @returns {Object|null} Override state or null if room not found
   */
  getManualOverrideState(roomId) {
    const roomState = this.roomCompositions.get(roomId)
    return roomState?.styleCycling?.manualOverride || null
  }

  /**
   * Get all active rooms with their override states
   * @returns {Object} Map of roomId -> override state
   */
  getAllOverrideStates() {
    const states = {}
    for (const [roomId, roomState] of this.roomCompositions) {
      states[roomId] = roomState?.styleCycling?.manualOverride || { enabled: false }
    }
    return states
  }

  /**
   * Create synthetic genre weights with 100% for forced genre
   * Uses shared utility from GenreUtils (Fix #4)
   * @param {string} genre - Genre to force
   * @returns {Object} Synthetic weights object
   * @private
   * @deprecated Use cached syntheticWeights from manualOverride object instead
   */
  _createOverrideWeights(genre) {
    return createSyntheticGenreWeights(genre, ALL_GENRES)
  }

  // ========== End Entry #210 ==========

  /**
   * Sync harmonic context and web metrics to GestureToMusicService
   * Entry #209: HarmonicEngine is now shared (see ServiceContainer wiring),
   * so we only need to sync GestureToMusicService's local key/mode properties.
   * Entry #213: Also sync to VirtualUserService so virtual users follow key/mode changes.
   */
  syncHarmonicContext() {
    if (this.gestureToMusicService) {
      // Sync local key/mode properties used by GestureToMusicService
      this.gestureToMusicService.currentKey = this.compositionEngine.keyCenter
      this.gestureToMusicService.currentMode = this.compositionEngine.mode

      // Entry #171: Sync web metrics for deterministic gesture variation
      this.gestureToMusicService.webMetrics = this._normalizeWebMetrics()
// console.log(`🎵 Synced harmonic context: ${this.compositionEngine.keyCenter} ${this.compositionEngine.mode}`)
    }

    // Entry #213: Sync harmonic context to virtual users
    // Virtual users must follow the same key/mode/tempo as background composition
    if (this.virtualUserService) {
      // Snapshot room IDs to avoid issues if map changes during iteration
      const activeRoomIds = Array.from(this.compositionTimers.keys())
      for (const roomId of activeRoomIds) {
        try {
          // Only sync if virtual users are actually active for this room
          if (this.virtualUserService.isActiveForRoom(roomId)) {
            this.virtualUserService.updateMusicalContext(roomId, {
              key: this.compositionEngine.keyCenter,
              mode: this.compositionEngine.mode,
              tempo: this.compositionEngine.tempo
            })
          }
        } catch (error) {
          console.error(`Entry #213: Failed to sync harmonic context for room ${roomId}:`, error.message)
        }
      }
    }
  }

  /**
   * Start continuous composition for a room
   * @param {string} roomId - Room ID
   * @param {Object} roomContext - Room context (userCount, etc.)
   */
  startComposition(roomId, roomContext = {}) {
    if (this.compositionTimers.has(roomId)) {
// console.log(`🎼 Composition already running for room ${roomId}`)
      return
    }

// console.log(`🎼 Starting with DRONE (waiting for gestures to define composition)`)

    // Entry #163: Initialize HarmonicEngine key from web metrics (same as LandingCompositionService)
    // This ensures rooms start with varied keys based on current web activity
    if (this.webMetricsPoller && !this.harmonicEngine.keyInitialized) {
      const metrics = this.webMetricsPoller.getMetrics()
      if (metrics) {
        this.harmonicEngine.initializeKeyFromMetrics(metrics)
        // Sync to CompositionEngine
        this.compositionEngine.keyCenter = this.harmonicEngine.currentKey
        this.compositionEngine.mode = this.harmonicEngine.currentMode
        // Sync to GestureToMusicService
        this.syncHarmonicContext()
      }
    }

    // Initialize room composition state with SESSION PROFILING
    // Entry #117: Deterministic offset based on timestamp (not random!)
    const PHI = 1.618033988749894848
    const initialCompositionCount = Math.floor(((Date.now() / 1000) * PHI) % 100)

    // Entry #169: Initialize section state for room
    const formType = roomContext.formType || 'ABA'
    this.sectionStateManager.initializeState(roomId, formType)

    this.roomCompositions.set(roomId, {
      roomId,
      roomContext,
      compositionCount: initialCompositionCount,
      gestureCount: 0,           // Track gestures in this session
      initialGestureWindow: 5,    // First N gestures are highly influential
      compositionStarted: false,  // Start with drone, transition to composition after gestures
      gestureHistory: new CircularBuffer(25),  // O(1) push, no array slicing (was causing GC pressure)
      startTime: Date.now(),
      lastCompositionTime: Date.now(),

      // Entry #182: Metric-driven genre selection with starvation prevention
      styleCycling: {
        currentGenre: 'melodic',                           // genere iniziale (neutro)
        genreHistory: this._initializeGenreHistory(Date.now()), // storia per ogni genere
        genreStartTime: Date.now(),                        // quando il genere corrente è iniziato
        lastGenreCheckTime: Date.now(),                    // ultimo controllo cambio genere
        lastBPMChangeTime: Date.now(),                     // timestamp ultimo cambio BPM
        targetBPM: 100,                                    // BPM target corrente
        currentBPM: 100,                                   // BPM attuale (per smoothing)
        // Entry #210: Manual genre override for testing via composition monitor
        manualOverride: {
          enabled: false,
          genre: null,
          setAt: null,
          syntheticWeights: null  // Entry #213: Must match structure in setManualGenreOverride
        }
      }
    })

    // Start with DRONE only (atmospheric pad)
    // Add 500ms delay to ensure socket has fully joined room before broadcasting
    setTimeout(() => {
      this.generateAndBroadcastDrone(roomId)
    }, 500)

    // DON'T schedule continuous compositions yet - wait for gestures
    // Compositions will start automatically after 2+ gestures (see addMaterial)
  }

  /**
   * Generate and broadcast DRONE (atmospheric pad)
   * Called initially and updated as composition evolves
   * @param {string} roomId - Room ID
   */
  generateAndBroadcastDrone(roomId) {
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
            note: droneNote,  // Root note - follows key center
            duration: 10000,
            velocity: 0.8,
            articulation: 'legato'
          },
          {
            type: 'drone',
            note: fifthNote,  // Fifth for richness
            duration: 10000,
            velocity: 0.5,  // Quieter than root
            articulation: 'legato'
          }
        ]
      }
    }

    // Broadcast drone to room
    if (this.io) {
      // Get sockets in room for verification
      const socketsInRoom = this.io.sockets.adapter.rooms.get(roomId)
      const socketCount = socketsInRoom ? socketsInRoom.size : 0

// console.log(`🎵 Broadcasting DRONE to room ${roomId} (${socketCount} sockets in room)`)

      // Get current style for genre-aware velocity in frontend
      const style = this.getCurrentStyleForRoom(roomId)

      this.io.to(roomId).emit('background-composition', {
        roomId,
        composition: droneComposition,
        compositionNumber: 0,
        isDrone: true,  // Mark as drone for frontend
        timestamp: Date.now(),
        style  // Include style for genre-aware velocity
      })

// console.log(`✅ DRONE broadcast complete for room ${roomId}`)
    } else {
// console.error(`❌ Cannot broadcast DRONE - io not initialized`)
    }
  }

  /**
   * Emit drone to a specific socket (Entry #27: for audio restart)
   * @param {Socket} socket - Target socket
   * @param {string} roomId - Room ID
   */
  emitDroneToSocket(socket, roomId) {
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

    // Get current style for genre-aware velocity in frontend
    const style = this.getCurrentStyleForRoom(roomId)

    socket.emit('background-composition', {
      roomId,
      composition: droneComposition,
      compositionNumber: 0,
      isDrone: true,
      timestamp: Date.now(),
      style  // Include style for genre-aware velocity
    })
    // console.log(`🎵 Drone emitted to socket for room ${roomId} (request-drone)`)
  }

  /**
   * Check if keyCenter changed and broadcast updated drone
   * Entry #115: Drone updates dynamically when keyCenter changes
   * @param {string} roomId - Room ID
   * @param {string} previousKeyCenter - KeyCenter before composition
   */
  updateDroneIfKeyChanged(roomId, previousKeyCenter) {
    const currentKeyCenter = this.compositionEngine.keyCenter
    if (currentKeyCenter !== previousKeyCenter) {
      // KeyCenter changed - broadcast new drone to room
      this.generateAndBroadcastDrone(roomId)
    }
  }

  /**
   * Stop composition for a room
   * @param {string} roomId - Room ID
   */
  stopComposition(roomId) {
    const timer = this.compositionTimers.get(roomId)
    if (timer) {
      clearTimeout(timer)
      this.compositionTimers.delete(roomId)
      this.roomCompositions.delete(roomId)
      // Entry #218b: Clean up style cache to prevent memory leaks
      this.styleCache.delete(roomId)
      // Entry #169: Clean up section state
      this.sectionStateManager.cleanupRoom(roomId)
// console.log(`🎼 Stopped composition for room ${roomId}`)
    }
  }

  /**
   * Get section state manager for external access
   * Entry #169: Allows other services to subscribe to section changes
   * @returns {SectionStateManager}
   */
  getSectionStateManager() {
    return this.sectionStateManager
  }

  /**
   * Get current section context for a room
   * Entry #169
   * @param {string} roomId - Room ID
   * @returns {Object|null} Current SectionContext or null
   */
  getSectionContext(roomId) {
    return this.sectionStateManager.getState(roomId)
  }

  /**
   * Add material from user gesture
   * @param {string} roomId - Room ID
   * @param {Object} gestureData - Gesture data
   * @param {Object} musicalPhrase - Musical phrase generated from gesture
   */
  addMaterial(roomId, gestureData, musicalPhrase) {
    let roomState = this.roomCompositions.get(roomId)
    if (!roomState) {
      // Entry #64: Don't lose the gesture! Create state and continue processing
      // This fixes race condition during page reload where disconnect arrives after join
      this.startComposition(roomId, {})
      roomState = this.roomCompositions.get(roomId)
      if (!roomState) {
        console.error(`🎼 Failed to create room state for ${roomId}`)
        return
      }
    }

    // Entry #171: Sync webMetrics before processing gesture for freshness
    // This ensures gestures use current metrics, not stale ones from last composition
    this.syncHarmonicContext()

    // INCREMENT GESTURE COUNT for session profiling
    roomState.gestureCount++

    // Entry #163: Initialize key from web metrics if not done yet
    // Fallback for cases where metrics weren't available at startComposition
    if (this.webMetricsPoller && !this.harmonicEngine.keyInitialized) {
      const metrics = this.webMetricsPoller.getMetrics()
      if (metrics) {
        this.harmonicEngine.initializeKeyFromMetrics(metrics)
        // Sync to CompositionEngine
        this.compositionEngine.keyCenter = this.harmonicEngine.currentKey
        this.compositionEngine.mode = this.harmonicEngine.currentMode
        // Sync to GestureToMusicService
        this.syncHarmonicContext()
      }
    }

    // CALCULATE GESTURE WEIGHT: First gestures have maximum influence
    const gestureWeight = this.calculateGestureWeight(roomState.gestureCount, roomState.initialGestureWindow)
    // Entry #NEW: Store gestureWeight for CompositionEngine use
    roomState.lastGestureWeight = gestureWeight

// console.log(`🎵 Gesture #${roomState.gestureCount} - Weight: ${gestureWeight.toFixed(2)} (${gestureWeight >= 0.8 ? 'HIGH' : gestureWeight >= 0.5 ? 'MEDIUM' : 'LOW'} influence)`)

    // Convert musical phrase to material format
    const material = {
      notes: musicalPhrase.notes || [],
      duration: musicalPhrase.duration || 1000,
      userId: gestureData.userId,
      gestureData: gestureData,
      weight: gestureWeight,  // Store weight with material
      timestamp: Date.now()
    }

    // Add to material library
    const materialId = this.materialLibrary.addMaterial(material)

    // Entry #169: Also store raw gesture data for section-aware phrase generation
    const rawGesture = new RawGestureData(gestureData.gesture, {
      userId: gestureData.userId,
      roomId: roomId,
      weight: gestureWeight
    })
    this.materialLibrary.addRawGesture(gestureData.gesture, {
      userId: gestureData.userId,
      roomId: roomId,
      weight: gestureWeight
    })

    // NORMALIZE gesture properties for StyleAnalyzer
    // StyleAnalyzer expects: velocity (0-100), acceleration (0-50), timestamp
    // Gesture has: speed (unreliable), intensity (0-1), duration (ms), startTime/endTime

    let velocity, acceleration, interOnsetInterval

    // FOR DRAG GESTURES: Analyze individual notes for accurate velocity and rhythm
    if (musicalPhrase.notes && musicalPhrase.notes.length > 0) {
      // Calculate average velocity from notes (0-1 → 0-100)
      const avgNoteVelocity = musicalPhrase.notes.reduce((sum, note) => sum + (note.velocity || 0), 0) / musicalPhrase.notes.length
      velocity = avgNoteVelocity * 100

      // Calculate inter-onset intervals (rhythm between notes)
      if (musicalPhrase.notes.length >= 2) {
        const intervals = []
        for (let i = 1; i < musicalPhrase.notes.length; i++) {
          const interval = musicalPhrase.notes[i].timestamp - musicalPhrase.notes[i - 1].timestamp
          if (interval > 0) intervals.push(interval)
        }

        if (intervals.length > 0) {
          interOnsetInterval = intervals.reduce((sum, i) => sum + i, 0) / intervals.length
        }
      }

      // Calculate acceleration from velocity variance (dynamic range)
      const velocities = musicalPhrase.notes.map(n => n.velocity || 0)
      const velocityVariance = Math.sqrt(
        velocities.reduce((sum, v) => sum + Math.pow(v - avgNoteVelocity, 2), 0) / velocities.length
      )
      acceleration = velocityVariance * 100  // Higher variance = more dynamic = higher acceleration

// console.log('🎹 Analyzed DRAG notes:', {
//        noteCount: musicalPhrase.notes.length,
//        avgVelocity: velocity.toFixed(1),
//        interOnsetInterval: interOnsetInterval ? interOnsetInterval.toFixed(1) + 'ms' : 'N/A',
//        velocityVariance: velocityVariance.toFixed(3),
//        acceleration: acceleration.toFixed(1)
////      })
    }
    // FOR TAP GESTURES: Use gesture duration as proxy (fallback)
    else {
      const duration = gestureData.gesture.duration || 500
      velocity = Math.max(10, Math.min(100, 100 - (duration / 20)))

      const rawIntensity = gestureData.gesture.intensity || 0.5
      acceleration = rawIntensity * 50

// console.log('👆 Analyzed TAP gesture:', {
//        duration: duration.toFixed(0) + 'ms',
//        velocity: velocity.toFixed(1),
//        acceleration: acceleration.toFixed(1)
////      })
    }

    const normalizedGesture = {
      ...gestureData.gesture,
      velocity,
      acceleration,
      interOnsetInterval,  // Add rhythm information
      timestamp: gestureData.gesture.startTime || Date.now()
    }

// console.log('🔍 Normalized gesture for StyleAnalyzer:', {
//      type: normalizedGesture.type,
//      velocity: normalizedGesture.velocity.toFixed(1),
//      acceleration: normalizedGesture.acceleration.toFixed(1),
//      interOnsetInterval: normalizedGesture.interOnsetInterval ? normalizedGesture.interOnsetInterval.toFixed(1) + 'ms' : 'N/A',
//      timestamp: normalizedGesture.timestamp
////    })

    // ACCUMULATE gestures for tempo calculation (StyleAnalyzer needs 2+ for tempo)
    // CircularBuffer handles max size automatically with O(1) push (no array slicing)
    roomState.gestureHistory.push(normalizedGesture)

// console.log(`🔍 Gesture history size: ${roomState.gestureHistory.length} gestures`)

    // Update style analyzer WITH ACCUMULATED GESTURES
    // ADAPTIVE THROTTLING: Faster analysis during rapid input, slower otherwise
    // This maintains responsiveness during gesture bursts while saving CPU during calm periods
    const now = Date.now()
    const lastAnalysis = this.lastStyleAnalysisTime.get(roomId) || 0
    const sessionDuration = (now - roomState.startTime) / 1000  // seconds
    const gestureRate = sessionDuration > 0 ? roomState.gestureCount / sessionDuration : 0

    // Use faster interval during rapid gesture input
    const adaptiveInterval = gestureRate > this.GESTURE_RATE_THRESHOLD
      ? this.STYLE_ANALYSIS_INTERVAL_FAST
      : this.STYLE_ANALYSIS_INTERVAL_NORMAL

    const shouldRunFullAnalysis =
      roomState.gestureCount < 5 ||  // Always analyze initial influential gestures
      (now - lastAnalysis) >= adaptiveInterval

    if (shouldRunFullAnalysis) {
      // Use 'background' context for state isolation from other services
      // Entry #220: Pass compositionCount for PHI-based genre drift exploration
      this.styleAnalyzer.analyzeGestureStyle(
        roomState.gestureHistory.toArray(),
        gestureWeight,
        'background',
        roomState.compositionCount || 0
      )
      this.lastStyleAnalysisTime.set(roomId, now)
    }

    // APPLY STYLE TO COMPOSITION ENGINE
    this.applyStyleToComposition(roomId)

    // TRANSITION from DRONE to FULL COMPOSITION after initial gestures
    if (roomState.gestureCount >= 2 && !roomState.compositionStarted) {
// console.log('🎼 Transitioning from drone to full composition (2+ gestures collected)')
      roomState.compositionStarted = true

      // Entry #192: Generate first real composition, then schedule continuous compositions
      // Use .then() to ensure composition completes before scheduling next
      this.generateAndBroadcastComposition(roomId, roomState.roomContext)
        .then(() => {
          // Check if room still active before scheduling
          if (this.compositionTimers.has(roomId) || this.roomCompositions.has(roomId)) {
            this.scheduleNextComposition(roomId, roomState.roomContext)
          }
        })
        .catch((error) => {
          console.error(`Failed to generate initial composition for room ${roomId}:`, error.message)
          // Entry #194: Reduced recovery delay from 5s to 1s
          if (this.roomCompositions.has(roomId)) {
            const recoveryTimer = setTimeout(() => {
              if (this.roomCompositions.has(roomId)) {
                this.scheduleNextComposition(roomId, roomState.roomContext)
              }
            }, 1000)
            this.compositionTimers.set(roomId, recoveryTimer)
          }
        })
    }

// console.log(`🎼 Added material ${materialId} (gesture #${roomState.gestureCount}):`, {
//      notesCount: material.notes.length,
//      weight: gestureWeight.toFixed(2),
//      phraseType: musicalPhrase.type || 'unknown'
////    })

    return materialId
  }

  /**
   * Calculate gesture weight based on position in session
   * First gestures have high weight, later gestures require repetition
   */
  calculateGestureWeight(gestureCount, initialWindow) {
    if (gestureCount <= initialWindow) {
      // First N gestures: MAXIMUM influence (weight 1.0)
      return 1.0
    } else {
      // After initial window: exponentially decreasing weight
      // Requires repetition to influence composition
      const excessGestures = gestureCount - initialWindow
      return Math.max(0.1, 1.0 / Math.pow(1.5, excessGestures / 5))
    }
  }

  /**
   * Entry #182: Initialize genre history for a new room
   * All genres start with lastPlayedTime = startTime to avoid false starvation
   * The initial genre ('melodic') is marked as currently playing
   * @param {number} startTime - Room start timestamp
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
        // All genres start "fresh" - no artificial starvation
        lastPlayedTime: startTime,
        totalPlayTime: 0,
        playCount: genre === 'melodic' ? 1 : 0 // melodic is the initial genre
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
    // Guard: if history is missing or genre not in history, return neutral weight
    if (!history || typeof history !== 'object') {
      return metricWeight
    }
    const genreHistory = history[genre]
    if (!genreHistory || typeof genreHistory.lastPlayedTime !== 'number') {
      // Genre never played or invalid data - no boost (avoid false starvation)
      return metricWeight
    }

    const timeSinceLastPlayed = Math.max(0, now - genreHistory.lastPlayedTime)

    // Starvation factor: 0 at t=0, 1 at t=MAX_STARVATION_TIME
    const starvationRatio = Math.min(1, timeSinceLastPlayed / MAX_STARVATION_TIME)

    // Quadratic boost: gentle at first, aggressive near deadline
    // At 50%: boost = 1.5x, At 80%: boost = 2.28x, At 100%: boost = 3x
    const boostMultiplier = 1 + (MAX_BOOST_MULTIPLIER - 1) * Math.pow(starvationRatio, STARVATION_BOOST_EXPONENT)

    return metricWeight * boostMultiplier
  }

  /**
   * Entry #182: Select next genre based on metrics + starvation
   * Respects MIN_GENRE_PLAY_TIME before any genre switch (including critical starvation)
   * @param {Object} styleWeights - Genre weights from StyleAnalyzer
   * @param {Object} history - Genre history object
   * @param {number} now - Current timestamp
   * @param {string} currentGenre - Currently playing genre
   * @param {number} genreStartTime - When current genre started
   * @returns {string} Selected genre name
   */
  _selectNextGenre(styleWeights, history, now, currentGenre, genreStartTime) {
    // Guard: validate inputs
    if (!ALL_GENRES || ALL_GENRES.length === 0) {
      return currentGenre || 'melodic'
    }
    if (!history || typeof history !== 'object') {
      return currentGenre || ALL_GENRES[0]
    }

    // 1. Check MIN_GENRE_PLAY_TIME first - respect minimum play time always
    const currentPlayTime = Math.max(0, now - genreStartTime)
    if (currentPlayTime < MIN_GENRE_PLAY_TIME) {
      return currentGenre // Keep current genre until min time reached
    }

    // 2. FIRST PASS: Check for critical starvation ONLY (cheap timestamp comparison)
    // Starvation is rare (only after 7 minutes), so we skip expensive weight calculations
    // in the common case by checking starvation first
    for (const genre of ALL_GENRES) {
      const genreHistory = history[genre]
      if (genreHistory && typeof genreHistory.lastPlayedTime === 'number') {
        const timeSince = Math.max(0, now - genreHistory.lastPlayedTime)
        if (timeSince >= MAX_STARVATION_TIME) {
          // console.log(`[GenreSelection] CRITICAL: ${genre} starved for ${Math.round(timeSince / 1000)}s, forcing`)
          return genre  // Early exit - no need to calculate weights
        }
      }
    }

    // 3. SECOND PASS: Calculate weights and find best genre
    // Only runs if no critical starvation found (common case)
    let bestGenre = currentGenre
    let bestWeight = 0
    const defaultWeight = 1 / ALL_GENRES.length

    for (const genre of ALL_GENRES) {
      const metricWeight = styleWeights[genre] || defaultWeight
      const adjustedWeight = this._calculateAdjustedWeight(genre, metricWeight, history, now)

      if (adjustedWeight > bestWeight) {
        bestWeight = adjustedWeight
        bestGenre = genre
      }
    }

    return bestGenre
  }

  /**
   * Entry #182: Update style cycling - metric-driven genre selection with starvation prevention
   * Also handles BPM modulation (changes at least every minute)
   * @param {string} roomId - Room ID
   * @returns {Object} cycling state with currentGenre and currentBPM
   */
  updateStyleCycle(roomId) {
    const now = Date.now()
    const roomState = this.roomCompositions.get(roomId)
    if (!roomState?.styleCycling) {
      return { currentGenre: 'melodic', currentBPM: 100 }
    }

    const cycling = roomState.styleCycling

    // Entry #218: Diagnostic logging for override debugging (conditional)
    if (process.env.DEBUG_GENRE_OVERRIDE === 'true') {
      console.log(`[GenreCycle] roomId=${roomId}, override.enabled=${cycling.manualOverride?.enabled}, override.genre=${cycling.manualOverride?.genre}, currentGenre=${cycling.currentGenre}`)
    }

    // Entry #210: Skip automatic genre selection when manual override is active
    if (cycling.manualOverride?.enabled === true) {
      const overrideGenre = cycling.manualOverride?.genre

      // Entry #218b: Check for state corruption (genre null when override enabled)
      // NOTE: No genre validation here - that's done in setManualGenreOverride()
      // Repeating validation every 30 seconds was causing the 5-second alternation bug
      if (!overrideGenre) {
        console.error('[GenreOverride] FATAL: Override enabled but genre is null. Disabling override.')
        cycling.manualOverride.enabled = false
        this.invalidateStyleCache(roomId)
        // Fall through to automatic selection below
      } else {
        // Genre is fixed by override, just do BPM smoothing
        const bpmRange = GENRE_BPM_RANGES[overrideGenre] || GENRE_BPM_RANGES.melodic

        // Ensure BPM is within range for forced genre
        if (cycling.targetBPM < bpmRange.min || cycling.targetBPM > bpmRange.max) {
          cycling.targetBPM = bpmRange.default
        }

        // BPM smoothing
        const bpmDiff = cycling.targetBPM - cycling.currentBPM
        if (Math.abs(bpmDiff) > 1) {
          cycling.currentBPM += bpmDiff / BPM_SMOOTHING_STEPS
        }

        return cycling
      }
    }

    // Entry #218: Use getCurrentStyleForRoom for consistent override handling
    // This is in the automatic selection path (override not active),
    // but using the same method ensures consistent behavior
    const style = this.getCurrentStyleForRoom(roomId)

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
        // Update history for previous genre (with guard)
        const playTime = Math.max(0, now - cycling.genreStartTime)
        if (cycling.genreHistory[prevGenre]) {
          cycling.genreHistory[prevGenre].totalPlayTime += playTime
        }

        // Set new genre
        cycling.currentGenre = nextGenre
        cycling.genreStartTime = now

        // Entry #183: Invalidate style cache when genre changes
        this.invalidateStyleCache(roomId)

        // Update history for new genre (with guard)
        if (cycling.genreHistory[nextGenre]) {
          cycling.genreHistory[nextGenre].lastPlayedTime = now
          cycling.genreHistory[nextGenre].playCount++
        } else {
          // Create entry if missing (shouldn't happen, but defensive)
          cycling.genreHistory[nextGenre] = { lastPlayedTime: now, totalPlayTime: 0, playCount: 1 }
        }

        // Set target BPM for new genre
        const bpmRange = GENRE_BPM_RANGES[nextGenre] || GENRE_BPM_RANGES.melodic
        cycling.targetBPM = bpmRange.default

// console.log(`[GenreSelection] ${prevGenre} -> ${nextGenre}, metric weight: ${(style.genreWeights?.[nextGenre] || 0).toFixed(3)}`)
      }

      cycling.lastGenreCheckTime = now
    }

    // --- BPM MODULATION (ogni minuto) - INVARIATO ---
    if (now - cycling.lastBPMChangeTime >= BPM_CHANGE_INTERVAL) {
      const bpmRange = GENRE_BPM_RANGES[cycling.currentGenre] || GENRE_BPM_RANGES.melodic

      // Variazione casuale entro il range del genere
      const variation = (Math.random() - 0.5) * (bpmRange.max - bpmRange.min) * 0.3
      cycling.targetBPM = Math.round(
        Math.max(bpmRange.min, Math.min(bpmRange.max, bpmRange.default + variation))
      )
      cycling.lastBPMChangeTime = now
    }

    // --- BPM SMOOTHING (ogni composizione) - INVARIATO ---
    const bpmDiff = cycling.targetBPM - cycling.currentBPM
    if (Math.abs(bpmDiff) > 1) {
      cycling.currentBPM += bpmDiff / BPM_SMOOTHING_STEPS
    }

    return cycling
  }

  /**
   * Apply analyzed style to composition parameters
   * Entry #179: Now uses style cycling for automatic genre rotation
   * Entry #218: Use getCurrentStyleForRoom for consistent override handling
   */
  applyStyleToComposition(roomId) {
    // Entry #218: Use getCurrentStyleForRoom which properly handles manual override
    // This ensures genreWeights are correct even when override is active
    const style = this.getCurrentStyleForRoom(roomId)

    // Entry #179: Update style cycling and get current genre/BPM
    const cycling = this.updateStyleCycle(roomId)

    // MAP STYLE TO COMPOSITION PARAMETERS
    // Entry #179: Tempo from cycling (genre-biased) instead of gesture-derived
    this.compositionEngine.tempo = Math.round(cycling.currentBPM)

    // Entry #179: Set forced genre for HarmonicEngine to use
    style.forcedGenre = cycling.currentGenre

    // Entry #215: DO NOT reset key/mode here - let HarmonicEngine manage key changes organically
    // Previously, applyStyleToComposition was called multiple times (per gesture and per composition),
    // causing the key to flip between energy-based key and HarmonicEngine key,
    // which triggered excessive drone emissions and stuttering background audio.
    // The HarmonicEngine.generateProgression() handles key modulation based on
    // compositionCount and web metrics, providing smooth musical transitions.

    // Complexity and density from energy
    this.compositionEngine.complexityLevel = Math.min(0.9, Math.max(0.1, style.energy))

    // Entry #186: Use forcedGenre for density calculation to match actual composition genre
    // Previously used style.genreWeights which could mismatch with cycling.currentGenre
    const forcedGenreWeights = { [cycling.currentGenre]: 1.0 }
    const genreDensityMultiplier = this.compositionEngine.getGenreDensityMultiplier(forcedGenreWeights)
    const baseDensity = style.energy * 1.2
    this.compositionEngine.density = Math.min(0.9, Math.max(0.1, baseDensity * genreDensityMultiplier))

// console.log(`🎼 Applied style: genre=${cycling.currentGenre}, tempo=${this.compositionEngine.tempo}, energy=${style.energy.toFixed(2)}`)
  }

  /**
   * Select key and mode based on style analysis
   */
  selectKeyAndMode(style) {
    const modalFlavor = style.harmonicComplexity?.modalFlavor || 'major'

    // Map modalFlavor to mode
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

    // Select key based on energy (low energy = flat keys, high energy = sharp keys)
    const energy = style.energy || 0.5
    const keys = ['F', 'C', 'G', 'D', 'A', 'E']
    const keyIndex = Math.floor(energy * (keys.length - 1))
    const keyCenter = keys[keyIndex]

    return { keyCenter, mode }
  }

  /**
   * Schedule next composition
   * @param {string} roomId - Room ID
   * @param {Object} roomContext - Room context
   */
  scheduleNextComposition(roomId, roomContext) {
    // Calculate next composition interval BASED ON CURRENT TEMPO
    // Generate compositions at a fixed number of beats, not fixed time
    // Use 'background' context for state isolation from other services
    const currentStyle = this.styleAnalyzer.getCurrentStyleForContext
      ? this.styleAnalyzer.getCurrentStyleForContext('background')
      : this.styleAnalyzer.getCurrentStyle()

    // Get room state for deterministic calculation
    const roomState = this.roomCompositions.get(roomId)
    const compositionCount = roomState?.compositionCount || 0

    // Entry #193: Use cycling.currentBPM (genre-based) instead of gesture-derived tempo
    // This ensures interval matches actual composition tempo, preventing gaps after genre changes
    const tempo = roomState?.styleCycling?.currentBPM || currentStyle.tempo || 120

    // Entry #205: Reduced from 8 to 4 bars (16 beats) to reduce gaps between phrases
    const sectionLengthBars = 4  // Must match CompositionEngine.sectionLengths
    const beatsPerComposition = sectionLengthBars * 4  // 16 beats for 4 bars in 4/4

    const beatDuration = 60000 / tempo  // milliseconds per beat
    const compositionDuration = beatsPerComposition * beatDuration  // ~8000ms at 120 BPM

    // Entry #204: Apply overlap factor (0.85) to ensure next composition arrives
    // BEFORE the current one finishes playing. This prevents gaps when queue is empty.
    const overlapFactor = 0.85
    const interval = compositionDuration * overlapFactor

    // Entry #205: Adjusted clamp bounds for shorter 4-bar compositions - min 3s, max 15s
    const clampedInterval = Math.max(3000, Math.min(15000, interval))

    // Entry #192: Use async callback to await composition before scheduling next
    // This prevents composition accumulation when generation takes longer than interval
    const timer = setTimeout(async () => {
      // Check if room is still active before processing (race condition fix)
      if (!this.compositionTimers.has(roomId)) {
        return // Room was stopped, abort
      }

      try {
        await this.generateAndBroadcastComposition(roomId, roomContext)

        // Check again before rescheduling (room could have stopped during composition)
        if (this.compositionTimers.has(roomId)) {
          this.scheduleNextComposition(roomId, roomContext)
        }
      } catch (error) {
        console.error(`Composition generation failed for room ${roomId}:`, error.message)

        // Entry #194: Reduced recovery delay from 5s to 1s to prevent "inert" background
        // The shorter delay ensures continuous music even when occasional errors occur
        if (this.compositionTimers.has(roomId)) {
          const recoveryTimer = setTimeout(() => {
            if (this.compositionTimers.has(roomId)) {
              this.scheduleNextComposition(roomId, roomContext)
            }
          }, 1000)
          this.compositionTimers.set(roomId, recoveryTimer)
        }
      }
    }, clampedInterval)

    this.compositionTimers.set(roomId, timer)

// console.log(`🎼 Next composition for room ${roomId} in ${(clampedInterval/1000).toFixed(1)}s (${barsPerComposition.toFixed(0)} bars = ${beatsPerComposition.toFixed(0)} beats @ ${tempo} BPM)`)
  }

  /**
   * Generate and broadcast composition
   * @param {string} roomId - Room ID
   * @param {Object} roomContext - Room context
   */
  async generateAndBroadcastComposition(roomId, roomContext) {
    try {
// console.log(`🎼 Generating composition for room ${roomId}`)

      // Get room state
      const roomState = this.roomCompositions.get(roomId)
      if (!roomState) {
// console.log(`🎼 No room state for ${roomId}, skipping composition`)
        return
      }

      // Update room context
      roomState.roomContext = roomContext
      roomState.compositionCount++
      roomState.lastCompositionTime = Date.now()

      // Entry #179: Update style cycling BEFORE generating composition
      // This ensures forcedGenre and BPM are updated even without gestures
      this.applyStyleToComposition(roomId)

      // Entry #115: Save keyCenter before composition to detect changes
      const previousKeyCenter = this.compositionEngine.keyCenter

      // Entry #169: Get current section context and update progress
      const sectionContext = this.sectionStateManager.updateProgress(roomId)

      // Generate composition using CompositionEngine with section context
      // Pass compositionCount for temporal variation (Entry #114)
      const composition = this.compositionEngine.compose({
        roomId,
        userCount: roomContext.userCount || 1,
        activeUsers: roomContext.activeUsers || [],
        compositionCount: roomState.compositionCount,
        sectionContext: sectionContext, // Entry #169: Add section context
        webMetrics: this._normalizeWebMetrics(), // Entry #171: Add web metrics for harmonic variety
        gestureWeight: roomState.lastGestureWeight || 0.5 // Entry #NEW: Pass gestureWeight for tensionLevel
      })

      // Entry #169: Check if we should transition to next section
      if (sectionContext && sectionContext.shouldTransition(3)) {
        this.sectionStateManager.transitionSection(roomId)
      }

// console.log(`🎼 Generated ${composition.type} composition:`, {
//        form: composition.structure.form,
//        section: composition.structure.currentSection,
//        tempo: composition.metadata.tempo,
//        keyCenter: composition.metadata.keyCenter
////      })

      // Log composition details
      // // if (composition.content.voices) {
      // // console.log(`🎼   ${composition.content.voices.length} voices (polyphonic)`)
      // // } else if (composition.content.melody) {
      // // console.log(`🎼   Melody + accompaniment (homophonic)`)
      // //   if (composition.content.accompaniment) {
      // // console.log(`🎼   Accompaniment type: ${composition.content.accompaniment.type}`)
      // //   }
      // // } else if (composition.content.texture) {
      // // console.log(`🎼   Ambient texture`)
      // // }

      // Broadcast composition to room
      // Entry #175: Include style info for genre-aware audio playback
      // Entry #179: Use forcedGenre from cycling
      // Use 'background' context for state isolation from other services
      const currentStyle = this.styleAnalyzer.getCurrentStyleForContext
        ? this.styleAnalyzer.getCurrentStyleForContext('background')
        : this.styleAnalyzer.getCurrentStyle()
      const forcedGenre = roomState.styleCycling?.currentGenre
      if (this.io) {
        // Entry #180: Include synthParams for frontend filter/envelope modulation
        const synthParams = getSynthParams(forcedGenre || 'melodic')

        const dominantGenre = forcedGenre || this._getDominantGenre(currentStyle?.genreWeights)
        this.io.to(roomId).emit('background-composition', {
          roomId,
          composition,
          compositionNumber: roomState.compositionCount,
          timestamp: Date.now(),
          style: {
            genreWeights: currentStyle?.genreWeights || {},
            dominantGenre: dominantGenre,
            forcedGenre: forcedGenre,
            currentBPM: roomState.styleCycling?.currentBPM,
            energy: currentStyle?.energy || 0.5,
            synthParams: synthParams // Entry #180: Pass synth params for genre-aware audio
          }
        })

        // Entry #220: Track genre coverage for distribution monitoring
        this._trackGenreCoverage(dominantGenre, currentStyle?.genreWeights)

// console.log(`🎼 Broadcast composition #${roomState.compositionCount} to room ${roomId}`)
      } else {
// console.log(`🎼 No Socket.IO instance, composition not broadcast`)
      }

      // Update material library lifecycle (THROTTLED)
      // Full cleanup every 10 seconds to balance memory vs CPU
      const lifecycleNow = Date.now()
      if ((lifecycleNow - this.lastFullMaterialCleanup) >= this.MATERIAL_FULL_CLEANUP_INTERVAL) {
        this.materialLibrary.updateMaterialLifecycle()
        this.lastFullMaterialCleanup = lifecycleNow
      }

      // Entry #115: Update drone if keyCenter changed during composition
      this.updateDroneIfKeyChanged(roomId, previousKeyCenter)

      // Record snapshot for monitoring (non-blocking)
      if (this.compositionMonitor && this.compositionMonitor.enabled) {
        setImmediate(() => {
          try {
            const snapshot = this.compositionMonitor.createSnapshot(
              roomId,
              this.compositionEngine,
              this.harmonicEngine,
              this.styleAnalyzer,
              this.materialLibrary,
              roomState,
              'room'
            )
            if (snapshot) {
              this.compositionMonitor.recordSnapshot(roomId, snapshot)
            }
          } catch (err) {
            // Silent fail - monitoring should not impact main flow
          }
        })
      }

    } catch (error) {
      // Entry #194: Log error but DON'T re-throw
      // Re-throwing caused 5-second recovery delays that made background feel "inert"
      // Instead, fail gracefully - scheduling will continue in the caller
      console.error(`Error generating composition for room ${roomId}:`, error.message)
      // Don't throw - let caller proceed normally
    }
  }

  /**
   * Update room context (user count, etc.)
   * @param {string} roomId - Room ID
   * @param {Object} roomContext - Updated room context
   */
  updateRoomContext(roomId, roomContext) {
    const roomState = this.roomCompositions.get(roomId)
    if (roomState) {
      roomState.roomContext = { ...roomState.roomContext, ...roomContext }
// console.log(`🎼 Updated room context for ${roomId}:`, roomContext)
    }
  }

  /**
   * Get current composition state for a room
   * @param {string} roomId - Room ID
   * @returns {Object} Composition state
   */
  getCompositionState(roomId) {
    return this.roomCompositions.get(roomId) || null
  }

  /**
   * Get material library stats
   * @returns {Object} Stats
   */
  getMaterialStats() {
    return this.materialLibrary.getStats()
  }

  /**
   * Set musical key for a room
   * @param {string} roomId - Room ID
   * @param {string} key - Key (e.g., 'C', 'Am')
   * @param {string} mode - Mode (e.g., 'ionian', 'dorian')
   */
  setKey(roomId, key, mode = 'ionian') {
    this.materialLibrary.setKeyCenter(key, mode)
    this.harmonicEngine.setKeyCenter(key, mode)
    this.compositionEngine.keyCenter = key
    this.compositionEngine.mode = mode

    // SYNC: Update GestureToMusicService harmonic context
    this.syncHarmonicContext()

// console.log(`🎼 Set key for room ${roomId}: ${key} ${mode} (synced to gestures)`)
  }

  /**
   * Set tempo for a room
   * @param {string} roomId - Room ID
   * @param {number} tempo - Tempo in BPM
   */
  setTempo(roomId, tempo) {
    this.materialLibrary.setTempo(tempo)
    this.compositionEngine.tempo = tempo

// console.log(`🎼 Set tempo for room ${roomId}: ${tempo} BPM`)
  }

  /**
   * Get active room count
   * @returns {number} Number of active rooms
   */
  getActiveRoomCount() {
    return this.roomCompositions.size
  }

  /**
   * Cleanup inactive rooms
   * @param {number} inactivityThreshold - Inactivity threshold in milliseconds (default: 5 minutes)
   */
  cleanupInactiveRooms(inactivityThreshold = 300000) {
    const now = Date.now()

    for (const [roomId, roomState] of this.roomCompositions.entries()) {
      const inactiveTime = now - roomState.lastCompositionTime

      if (inactiveTime > inactivityThreshold) {
// console.log(`🎼 Cleaning up inactive room ${roomId} (inactive for ${(inactiveTime/1000).toFixed(0)}s)`)
        this.stopComposition(roomId)
      }
    }
  }
}

module.exports = BackgroundCompositionService
