/**
 * BaseVirtualUserBehavior
 * Shared behavior for virtual user management in both landing and normal rooms
 *
 * This class provides common functionality for virtual users:
 * - Landing page (3 sources: wikipedia, hackernews, github) via activateForLanding()
 * - Normal rooms solo mode (2 sources: wikipedia, hackernews) via activateForRoom()
 *
 * Key features:
 * - Per-context statistics isolation (landing vs each room)
 * - Percentile-based metric normalization (P10-P90)
 * - Activity level calculation with source-specific floors
 * - Hybrid position calculation (frequency + metrics)
 * - PHI-based duration category selection
 */

const {
  VIRTUAL_USER_CONFIGS,
  SOURCE_BALANCING,
  GESTURE_CONFIG,
  INTERPOLATION_CONFIG,
  INITIAL_POSITIONS,
  STATISTICS_CONFIG
} = require('../constants/virtualUserConfig')

// Golden ratio constants for optimal distribution
const PHI = 1.618033988749895
const PHI_SQ = 2.618033988749895  // φ² for Y axis (different sequence)

class BaseVirtualUserBehavior {
  /**
   * @param {Object} options
   * @param {string} options.context - Context identifier ('landing' or roomId)
   * @param {string[]} options.sources - Active sources for this context
   * @param {string} options.balancingProfile - 'landing' or 'rooms'
   * @param {Object} options.webMetricsPoller - Reference to WebMetricsPoller
   */
  constructor(options = {}) {
    this.context = options.context || 'default'
    this.sources = options.sources || ['wikipedia', 'hackernews']
    this.balancingProfile = options.balancingProfile || 'rooms'
    this.webMetricsPoller = options.webMetricsPoller || null

    // Get configuration based on profile
    this.sourceBalancing = SOURCE_BALANCING[this.balancingProfile] || SOURCE_BALANCING.rooms
    this.gestureConfig = GESTURE_CONFIG[this.balancingProfile] || GESTURE_CONFIG.rooms
    this.interpolationSpeed = INTERPOLATION_CONFIG[this.balancingProfile]?.speed || 0.15

    // Virtual user configurations (shared)
    this.virtualUserConfigs = VIRTUAL_USER_CONFIGS

    // Initial positions (shared)
    this.initialPositions = INITIAL_POSITIONS

    // Per-context metric statistics for DYNAMIC NORMALIZATION
    // Isolated per context to prevent cross-contamination
    this.metricStatistics = this._initializeMetricStatistics()
    this.maxSamples = STATISTICS_CONFIG.maxSamples

    // Gesture counters per source for position variation
    this.gestureCounters = {}
    for (const source of Object.keys(VIRTUAL_USER_CONFIGS)) {
      this.gestureCounters[source] = 0
    }

    // Gesture parameter statistics for adaptive normalization
    this._gestureStats = {
      intervalTiming: { samples: [] },
      gestureDuration: { samples: [] },
      gestureVelocity: { samples: [] },
      gestureDensity: { samples: [] },
      intentThreshold: { samples: [] }
    }
    this._gestureStatsMaxSamples = STATISTICS_CONFIG.maxSamples

    // Fallback values for warm-up period
    this._gestureFallbacks = {
      intervalTiming: 8000,
      gestureDuration: 1000,
      gestureVelocity: 0.75,
      gestureDensity: 0.5,
      intentThreshold: 0.1
    }
  }

  /**
   * Initialize metric statistics structure for all sources
   * @returns {Object} Initialized statistics object
   * @private
   */
  _initializeMetricStatistics() {
    return {
      wikipedia: {
        velocity: { min: Infinity, max: 0, samples: [] },
        editsPerMinute: { min: Infinity, max: 0, samples: [] },
        avgEditSize: { min: Infinity, max: 0, samples: [] },
        newArticles: { min: Infinity, max: 0, samples: [] }
      },
      hackernews: {
        velocity: { min: Infinity, max: 0, samples: [] },
        postsPerMinute: { min: Infinity, max: 0, samples: [] },
        avgUpvotes: { min: Infinity, max: 0, samples: [] },
        commentCount: { min: Infinity, max: 0, samples: [] }
      },
      github: {
        velocity: { min: Infinity, max: 0, samples: [] },
        commitsPerMinute: { min: Infinity, max: 0, samples: [] },
        createsPerMinute: { min: Infinity, max: 0, samples: [] },
        deletesPerMinute: { min: Infinity, max: 0, samples: [] },
        pushesPerMinute: { min: Infinity, max: 0, samples: [] }
      }
    }
  }

  /**
   * Reset metric statistics (useful when context changes)
   */
  resetStatistics() {
    this.metricStatistics = this._initializeMetricStatistics()
    this._gestureStats = {
      intervalTiming: { samples: [] },
      gestureDuration: { samples: [] },
      gestureVelocity: { samples: [] },
      gestureDensity: { samples: [] },
      intentThreshold: { samples: [] }
    }
  }

  // ============================================================
  // STATISTICS & NORMALIZATION
  // ============================================================

  /**
   * Update statistics for dynamic normalization
   * Builds historical data for percentile calculation
   * @param {string} source - Source name (wikipedia, hackernews, github)
   * @param {string} metricName - Metric name
   * @param {number} value - Current metric value
   */
  updateStatistics(source, metricName, value) {
    const stats = this.metricStatistics[source]?.[metricName]
    if (!stats) return

    stats.min = Math.min(stats.min, value)
    stats.max = Math.max(stats.max, value)

    stats.samples.push(value)
    // CRITICAL: Use slice to guarantee size bounds (prevents memory leak)
    if (stats.samples.length > this.maxSamples) {
      stats.samples = stats.samples.slice(-this.maxSamples)
    }
  }

  /**
   * DYNAMIC NORMALIZATION based on HISTORICAL RANGE with PERCENTILE STABILIZATION
   * Uses P10-P90 to prevent outlier skewing
   * Maps metric values to [0, 1] using observed percentiles
   * @param {string} source - Source name
   * @param {string} metricName - Metric name
   * @param {number} value - Current metric value
   * @returns {number} Normalized value [0, 1]
   */
  normalizeValue(source, metricName, value) {
    const stats = this.metricStatistics[source]?.[metricName]
    if (!stats) return 0.5

    // Wait for warm-up period (need enough samples for percentile)
    const MIN_SAMPLES = STATISTICS_CONFIG.percentileWarmupSamples || 10
    if (stats.samples.length < MIN_SAMPLES) {
      // During warm-up, use simple min/max normalization
      const range = stats.max - stats.min
      if (range > 0) {
        return Math.max(0, Math.min(1, (value - stats.min) / range))
      }
      return 0.5
    }

    // If no range yet, return 0.5
    if (stats.min === Infinity || stats.max === 0) {
      return 0.5
    }

    // PERCENTILE-BASED normalization for stability
    // Uses P10-P90 range to prevent outliers from skewing normalization
    const sortedSamples = [...stats.samples].sort((a, b) => a - b)
    const p10Index = Math.floor(sortedSamples.length * (STATISTICS_CONFIG.percentileLowerBound || 0.1))
    const p90Index = Math.floor(sortedSamples.length * (STATISTICS_CONFIG.percentileUpperBound || 0.9))
    const p10 = sortedSamples[p10Index]
    const p90 = sortedSamples[p90Index]

    const stabilizedRange = p90 - p10
    if (stabilizedRange === 0) {
      return 0.5
    }

    // Normalize using percentile range
    const normalized = (value - p10) / stabilizedRange

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, normalized))
  }

  /**
   * Normalize gesture parameters using P10-P90 percentile normalization
   * @param {string} paramName - Parameter name
   * @param {number} value - Raw value to normalize
   * @returns {number} Normalized value in 0-1 range
   */
  normalizeGestureParam(paramName, value) {
    if (typeof value !== 'number' || !isFinite(value)) {
      return 0.5
    }

    const stats = this._gestureStats[paramName]
    if (!stats) {
      return Math.max(0, Math.min(1, value))
    }

    // Add sample to history
    stats.samples.push(value)
    if (stats.samples.length > this._gestureStatsMaxSamples) {
      stats.samples.shift()
    }

    const warmupSamples = STATISTICS_CONFIG.percentileWarmupSamples || 10
    if (stats.samples.length < warmupSamples) {
      // Warm-up: use fallback divisors
      const fallback = this._gestureFallbacks[paramName] || 1
      return Math.max(0, Math.min(1, value / fallback))
    }

    // Percentile normalization (P10-P90)
    const sorted = [...stats.samples].sort((a, b) => a - b)
    if (sorted.length < 2) return 0.5

    const p10Index = Math.floor(sorted.length * (STATISTICS_CONFIG.percentileLowerBound || 0.1))
    const p90Index = Math.floor(sorted.length * (STATISTICS_CONFIG.percentileUpperBound || 0.9))
    const p10 = sorted[p10Index]
    const p90 = sorted[p90Index]
    const range = p90 - p10

    if (range < 0.001) return 0.5

    return Math.max(0, Math.min(1, (value - p10) / range))
  }

  /**
   * Map normalized gesture parameter to output range
   * @param {string} paramName - Parameter name for stats tracking
   * @param {number} rawValue - Raw input value to track
   * @param {number} minOutput - Minimum output value
   * @param {number} maxOutput - Maximum output value
   * @returns {number} Value in [minOutput, maxOutput] range
   */
  adaptiveGestureValue(paramName, rawValue, minOutput, maxOutput) {
    const normalized = this.normalizeGestureParam(paramName, rawValue)
    return minOutput + normalized * (maxOutput - minOutput)
  }

  // ============================================================
  // ACTIVITY & METRICS CALCULATION
  // ============================================================

  /**
   * Get balancing configuration for a source
   * Allows subclasses to override with context-specific balancing
   * @param {string} source - Source name
   * @param {Object} overrideBalancing - Optional override balancing (e.g., from roomState)
   * @returns {Object} Balancing configuration for the source
   */
  getBalancing(source, overrideBalancing = null) {
    if (overrideBalancing && overrideBalancing[source]) {
      return overrideBalancing[source]
    }
    return this.sourceBalancing[source] || BaseVirtualUserBehavior.DEFAULT_BALANCING
  }

  /**
   * Calculate activity level for a source (0.0-1.0)
   * Uses DYNAMIC NORMALIZATION based on HISTORICAL min/max
   * Applies source-specific activityFloor for balanced gesture distribution
   * @param {string} source - Source name
   * @param {Object} overrideBalancing - Optional override balancing (e.g., from roomState)
   * @returns {number} Activity level (0.0-1.0)
   */
  calculateActivityLevel(source, overrideBalancing = null) {
    const metrics = this.webMetricsPoller?.getMetrics()
    if (!metrics || !metrics[source]) return 0.5

    let rawActivity
    let metricName
    let metricValue
    switch (source) {
      case 'wikipedia':
        metricName = 'editsPerMinute'
        metricValue = metrics[source].editsPerMinute || 0
        break
      case 'hackernews':
        metricName = 'postsPerMinute'
        metricValue = metrics[source].postsPerMinute || 0
        break
      case 'github':
        metricName = 'commitsPerMinute'
        metricValue = metrics[source].commitsPerMinute || 0
        break
      default:
        return 0.5
    }

    // Update statistics before normalizing (required for dynamic normalization)
    this.updateStatistics(source, metricName, metricValue)
    rawActivity = this.normalizeValue(source, metricName, metricValue)

    // Apply source-specific floor to ensure minimum activity
    const balancing = this.getBalancing(source, overrideBalancing)
    return Math.max(balancing.activityFloor, rawActivity)
  }

  /**
   * Calculate stability metric for gesture classification
   * Lower velocity = higher stability = tap gesture
   * @param {string} source - Source name
   * @returns {number} Stability value (0.0-1.0)
   */
  calculateStabilityMetric(source) {
    const velocity = Math.abs(this.webMetricsPoller?.getVelocity(source) || 0)
    // Update statistics before normalizing (required for dynamic normalization)
    this.updateStatistics(source, 'velocity', velocity)
    const normalizedVelocity = this.normalizeValue(source, 'velocity', velocity)
    // Higher velocity = lower stability
    return Math.max(0, 1 - normalizedVelocity)
  }

  /**
   * Calculate density metric for gesture classification
   * Higher metric values = higher density = phrase gesture
   * @param {string} source - Source name
   * @returns {number} Density value (0.0-1.0)
   */
  calculateDensityMetric(source) {
    const metrics = this.webMetricsPoller?.getMetrics()
    if (!metrics || !metrics[source]) return 0.5

    let metricName
    let metricValue
    switch (source) {
      case 'wikipedia':
        metricName = 'avgEditSize'
        metricValue = metrics[source].avgEditSize || 0
        break
      case 'hackernews':
        metricName = 'avgUpvotes'
        metricValue = metrics[source].avgUpvotes || 0
        break
      case 'github':
        metricName = 'createsPerMinute'
        metricValue = metrics[source].createsPerMinute || 0
        break
      default:
        return 0.5
    }

    // Update statistics before normalizing (required for dynamic normalization)
    this.updateStatistics(source, metricName, metricValue)
    return this.normalizeValue(source, metricName, metricValue)
  }

  /**
   * Normalize web metrics to 0-1 range
   * @returns {Object} Normalized metrics {wikipedia, hackernews, github}
   */
  normalizeWebMetrics() {
    const raw = this.webMetricsPoller?.getMetrics()
    if (!raw) {
      return {
        wikipedia: { normalized: 0.5 },
        hackernews: { normalized: 0.5 },
        github: { normalized: 0.5 }
      }
    }

    return {
      wikipedia: { normalized: this.normalizeValue('wikipedia', 'editsPerMinute', raw.wikipedia?.editsPerMinute || 0) },
      hackernews: { normalized: this.normalizeValue('hackernews', 'postsPerMinute', raw.hackernews?.postsPerMinute || 0) },
      github: { normalized: this.normalizeValue('github', 'commitsPerMinute', raw.github?.commitsPerMinute || 0) }
    }
  }

  /**
   * Calculate gesture intent threshold for a source
   * Lower threshold = more gestures pass
   * @param {string} source - Source name
   * @param {number} activityLevel - Activity level (0-1)
   * @param {Object} overrideBalancing - Optional override balancing (e.g., from roomState)
   * @returns {number} Threshold value (0-1)
   */
  calculateGestureIntentThreshold(source, activityLevel, overrideBalancing = null) {
    const balancing = this.getBalancing(source, overrideBalancing)
    const rawThreshold = 0.1 * balancing.gestureIntentMultiplier
    const adaptiveBase = this.adaptiveGestureValue('intentThreshold', rawThreshold, 0.05, 0.2)
    const ACTIVITY_MODULATION = 0.5
    return adaptiveBase * (1 - activityLevel * ACTIVITY_MODULATION)
  }

  // ============================================================
  // POSITION CALCULATION
  // ============================================================

  /**
   * Calculate cursor position using GOLDEN RATIO distribution
   * Y = frequency within tessitura, X = secondary metrics + golden ratio variation
   * @param {string} source - Source name
   * @param {number} baseFrequency - Audio frequency
   * @param {number} stepIndex - Optional step index within trajectory
   * @returns {{x: number, y: number}} Canvas position (0.05-0.95)
   */
  calculateHybridPosition(source, baseFrequency, stepIndex = 0) {
    const MIN_BOUND = 0.05
    const MAX_BOUND = 0.95
    const RANGE = MAX_BOUND - MIN_BOUND

    // Validate input frequency
    if (!Number.isFinite(baseFrequency) || baseFrequency < 0) {
      return this.initialPositions[source] || { x: 0.5, y: 0.5 }
    }

    const gestureCount = this.gestureCounters[source] || 0
    const sourceOffset = source === 'wikipedia' ? 17 : source === 'hackernews' ? 53 : 97

    // X bias per source (Y bias removed to prevent edge clamping)
    const quadrantBias = {
      wikipedia: { x: -0.15, y: 0 },
      hackernews: { x: 0.15, y: 0 },
      github: { x: -0.05, y: 0 }
    }
    const bias = quadrantBias[source] || { x: 0, y: 0 }

    // Y = frequency within source's tessitura range (inverted: high freq = top)
    const sourceConfig = this.virtualUserConfigs[source]
    const freqMin = sourceConfig?.frequencyRange?.min || 110
    const freqMax = sourceConfig?.frequencyRange?.max || 880
    const freqRange = freqMax - freqMin
    const normalizedFreq = freqRange > 0
      ? Math.max(0, Math.min(1, (baseFrequency - freqMin) / freqRange))
      : 0.5
    const yFromFreq = 1 - normalizedFreq

    // X position from secondary metrics
    const metrics = this.webMetricsPoller?.getMetrics()
    let xMetric = 0.5

    if (metrics && metrics[source]) {
      const m = metrics[source]
      switch (source) {
        case 'wikipedia':
          xMetric = this.normalizeValue(source, 'avgEditSize', m.avgEditSize || 0)
          break
        case 'hackernews':
          xMetric = this.normalizeValue(source, 'avgUpvotes', m.avgUpvotes || 0)
          break
        case 'github':
          xMetric = this.normalizeValue(source, 'createsPerMinute', m.createsPerMinute || 0)
          break
      }
    }

    if (!Number.isFinite(xMetric)) xMetric = 0.5

    // GOLDEN RATIO DISTRIBUTION for variation
    const combinedSeed = gestureCount + sourceOffset + stepIndex
    const xGolden = (combinedSeed * PHI) % 1
    const yGolden = (combinedSeed * PHI_SQ) % 1

    // X variation with frequency influence
    const freqInfluenceOnX = (normalizedFreq - 0.5) * 0.2
    const xBase = xMetric + (xGolden - 0.5) * 0.7 + freqInfluenceOnX

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
   * Calculate curve amount based on source metrics
   * Used for generating curved trajectories
   * @param {string} source - Source name
   * @returns {number} Curve amount (-0.2 to +0.2)
   */
  calculateCurveAmount(source) {
    const metrics = this.webMetricsPoller?.getMetrics()
    if (!metrics) return 0

    const wikiVel = metrics.wikipedia?.velocityNorm ?? 0.5
    const hnVel = metrics.hackernews?.velocityNorm ?? 0.5
    const ghVel = metrics.github?.velocityNorm ?? 0.5

    switch (source) {
      case 'wikipedia': return (wikiVel - 0.5) * 0.4
      case 'hackernews': return (hnVel - 0.5) * 0.4
      case 'github': return (ghVel - 0.5) * 0.4
      default: return ((wikiVel + hnVel + ghVel) / 3 - 0.5) * 0.4
    }
  }

  // ============================================================
  // GESTURE CLASSIFICATION
  // ============================================================

  /**
   * Select duration category using PHI-based cycling
   * Guarantees balanced distribution based on source-specific bias
   * @param {string} source - Source name
   * @param {Object} overrideBalancing - Optional override balancing (e.g., from roomState)
   * @returns {{category: string, durationRange: {min: number, max: number}}}
   */
  selectDurationCategory(source, overrideBalancing = null) {
    const gestureCount = this.gestureCounters[source] || 0

    // Source-specific offset to prevent synchronization
    const sourceOffset = source === 'wikipedia' ? 0.17
                       : source === 'hackernews' ? 0.53
                       : 0.89

    // PHI-based selector creates low-discrepancy sequence
    const selector = ((gestureCount * PHI) + sourceOffset) % 1

    // Get source-specific duration weights
    const balancing = this.getBalancing(source, overrideBalancing)
    const bias = balancing.durationBias

    // Category boundaries from bias weights
    const tapEnd = bias.tap
    const shortEnd = tapEnd + bias.short
    const mediumEnd = shortEnd + bias.medium

    if (selector < tapEnd) {
      return { category: 'tap', durationRange: { min: 50, max: 300 } }
    }
    if (selector < shortEnd) {
      return { category: 'short', durationRange: { min: 300, max: 1000 } }
    }
    if (selector < mediumEnd) {
      return { category: 'medium', durationRange: { min: 1000, max: 3000 } }
    }
    return { category: 'long', durationRange: { min: 3000, max: 8000 } }
  }

  /**
   * Classify gesture type based on metric characteristics
   * Pure relative comparison: stability vs density
   * @param {string} source - Source name
   * @returns {string} Gesture type: 'tap' or 'drag'
   */
  classifyGestureType(source) {
    const stability = this.calculateStabilityMetric(source)
    const density = this.calculateDensityMetric(source)
    return stability > density ? 'tap' : 'drag'
  }

  /**
   * Increment gesture counter for a source
   * Uses modulo to prevent overflow
   * @param {string} source - Source name
   */
  incrementGestureCounter(source) {
    this.gestureCounters[source] = ((this.gestureCounters[source] || 0) + 1) % Number.MAX_SAFE_INTEGER
  }

  // ============================================================
  // INTERPOLATION
  // ============================================================

  /**
   * Interpolate cursor position toward target
   * @param {Object} current - Current position {x, y}
   * @param {Object} target - Target position {x, y}
   * @param {number} speed - Interpolation speed (0-1)
   * @returns {Object} New position {x, y}
   */
  interpolatePosition(current, target, speed = null) {
    const s = speed ?? this.interpolationSpeed
    return {
      x: current.x + (target.x - current.x) * s,
      y: current.y + (target.y - current.y) * s
    }
  }

  // ============================================================
  // STATIC CONSTANTS
  // ============================================================

  static PHI = PHI
  static PHI_SQ = PHI_SQ

  static DEFAULT_BALANCING = {
    activityFloor: 0.3,
    gestureIntentMultiplier: 1.0,
    durationBias: { tap: 0.25, short: 0.40, medium: 0.25, long: 0.10 }
  }
}

module.exports = BaseVirtualUserBehavior
