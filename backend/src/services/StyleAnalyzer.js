const CircularBuffer = require('../utils/CircularBuffer')
const { PHI_4D, DRIFT_AMPLITUDE } = require('../utils/constants')

/**
 * Genre profiles for continuous parameter space calculation.
 * Each genre is a point in 4D space (energy, directionUniformity, regularity, pathComplexity).
 * Genre weights are calculated as inverse distance from gesture parameters to each profile.
 *
 * Entry #172: Replaced additive threshold-based calculation with distance-based approach
 * for more natural genre emergence from gesture metrics.
 */
const GENRE_PROFILES = {
  // Entry #220: Repositioned for maximum separation in 4D space
  // Corners - maximally separated genres
  ambient:      { energy: 0.10, directionUniformity: 0.90, regularity: 0.90, pathComplexity: 0.10 },  // quiet, uniform, regular, simple
  experimental: { energy: 0.40, directionUniformity: 0.20, regularity: 0.20, pathComplexity: 0.90 },  // varied, irregular, complex
  rock:         { energy: 0.90, directionUniformity: 0.40, regularity: 0.50, pathComplexity: 0.40 },  // powerful, varied, moderate
  electronic:   { energy: 0.75, directionUniformity: 0.85, regularity: 0.90, pathComplexity: 0.15 },  // beat-driven, mechanical

  // Edges - distinct from corners
  classical:    { energy: 0.20, directionUniformity: 0.85, regularity: 0.95, pathComplexity: 0.20 },  // structured, refined
  jazz:         { energy: 0.55, directionUniformity: 0.40, regularity: 0.30, pathComplexity: 0.70 },  // improvisational
  rhythmic:     { energy: 0.80, directionUniformity: 0.55, regularity: 0.75, pathComplexity: 0.30 },  // groove-driven

  // Center - neutral/default
  melodic:      { energy: 0.50, directionUniformity: 0.60, regularity: 0.60, pathComplexity: 0.40 }   // balanced
}

/**
 * Gaussian falloff parameters for genre weight calculation.
 * sigma controls how quickly weights drop off as distance from profile increases.
 * Lower sigma = sharper falloff (more genre differentiation)
 * Higher sigma = gentler falloff (more genre blending)
 */
const GENRE_DISTANCE_SIGMA = 0.15
const GAUSSIAN_FACTOR = 1 / (2 * GENRE_DISTANCE_SIGMA * GENRE_DISTANCE_SIGMA)  // = 22.22

class StyleAnalyzer {
  constructor() {
    // Entry #210: Manual override state - when enabled, overrides genreWeights and forcedGenre
    this._manualOverride = {
      enabled: false,
      genreWeights: null,
      forcedGenre: null
    }

    // Default style template
    this._defaultStyle = {
      energy: 0.5,
      tempo: 120,
      timeSignature: '4/4',
      rhythmicCharacter: {
        swing: 0,
        syncopation: 0,
        regularity: 0.5
      },
      melodicCharacter: {
        intervalProfile: { step: 0.7, skip: 0.2, leap: 0.1 },
        contourType: 'neutral',
        range: 12 // in semitones
      },
      harmonicComplexity: {
        chromaticism: 0,
        dissonance: 0.2,
        modalFlavor: 'ionian'  // Entry #164: Use church mode name (matches detectModalFlavor output)
      },
      genreWeights: {
        ambient: 0,
        rhythmic: 0,
        melodic: 0,
        experimental: 0,
        jazz: 0,
        classical: 0,
        electronic: 0,
        rock: 0
      }
    }

    // Context-based state isolation: Each service gets its own style state
    // Prevents race conditions when multiple services call analyzeGestureStyle
    // Context IDs: 'background', 'gesture', 'landing', 'default'
    this._contextStyles = new Map()
    this._contextHistories = new Map()

    // Legacy: currentStyle for backwards compatibility (uses 'default' context)
    this.currentStyle = { ...this._defaultStyle }

    this.styleHistory = new CircularBuffer(100)  // O(1) push, no shift() (was causing O(n) operations)
    this.smoothingFactor = 0.3 // Reduced from 0.5 - allows 70% influence for initial gestures (weight=1.0)

    // Entry #220: MetricStatistics for percentile-based normalization of 4D parameters
    // Tracks rolling window of samples for each dimension to adapt normalization to actual data
    // Uses CircularBuffer for O(1) push instead of Array.shift() which is O(n)
    this._metricStatisticsWindowSize = 100  // Rolling window for percentile calculation
    this._metricStatistics = {
      energy: { samples: new CircularBuffer(this._metricStatisticsWindowSize), min: Infinity, max: 0 },
      directionUniformity: { samples: new CircularBuffer(this._metricStatisticsWindowSize), min: Infinity, max: 0 },
      regularity: { samples: new CircularBuffer(this._metricStatisticsWindowSize), min: Infinity, max: 0 },
      pathComplexity: { samples: new CircularBuffer(this._metricStatisticsWindowSize), min: Infinity, max: 0 }
    }
  }

  /**
   * Get or create style state for a specific context
   * @param {string} contextId - Context identifier (e.g., 'background', 'gesture', 'landing')
   * @returns {Object} Style state for the context
   * @private
   */
  _getContextStyle(contextId) {
    if (!this._contextStyles.has(contextId)) {
      this._contextStyles.set(contextId, { ...this._defaultStyle })
    }
    return this._contextStyles.get(contextId)
  }

  /**
   * Get style for a specific context
   * @param {string} contextId - Context identifier
   * @returns {Object} Current style for the context
   */
  getCurrentStyleForContext(contextId) {
    return this._getContextStyle(contextId)
  }

  /**
   * Analyze gesture style with optional context isolation
   * @param {Array} gestures - Gesture data to analyze
   * @param {number} gestureWeight - Weight for style evolution (0-1)
   * @param {string} contextId - Optional context ID for state isolation
   * @param {number} compositionCount - Optional composition count for PHI-based drift (Entry #220)
   * @returns {Object} Computed style
   */
  analyzeGestureStyle(gestures, gestureWeight = 0.5, contextId = 'default', compositionCount = 0) {
    // Get context-specific state (or create new one)
    const contextStyle = this._getContextStyle(contextId)

    if (!gestures || gestures.length === 0) {
      return contextStyle
    }

    const gestureArray = Array.isArray(gestures) ? gestures : [gestures]

    // console.log(`🎨 StyleAnalyzer analyzing ${gestureArray.length} gesture(s):`, {
    //   gestureCount: gestureArray.length,
    //   weight: gestureWeight.toFixed(2)
    // })

    // Analyze energy from gesture density and velocity
    const energy = this.calculateEnergy(gestureArray)

    // Analyze tempo and meter from timing
    const tempo = this.estimateTempo(gestureArray)
    const timeSignature = this.detectMeter(gestureArray)

    // console.log(`🎨 Calculated from gestures:`, {
    //   energy: energy.toFixed(2),
    //   tempo,
    //   timeSignature,
    //   gesturesNeededForTempo: gestureArray.length < 2 ? `Need ${2 - gestureArray.length} more` : 'OK'
    // })

    // Analyze rhythmic character
    const rhythmicCharacter = {
      swing: this.detectSwing(gestureArray),
      syncopation: this.detectSyncopation(gestureArray),
      regularity: this.detectRhythmicRegularity(gestureArray)
    }

    // Analyze melodic character
    const melodicCharacter = {
      intervalProfile: this.analyzeIntervals(gestureArray),
      contourType: this.detectContour(gestureArray),
      range: this.calculateRange(gestureArray)
    }

    // Analyze harmonic complexity
    const harmonicComplexity = {
      chromaticism: this.detectChromaticism(gestureArray),
      dissonance: this.calculateDissonance(gestureArray),
      modalFlavor: this.detectModalFlavor(gestureArray)
    }

    // Entry #172: Calculate direction uniformity from gesture directions
    const directionUniformity = this.calculateDirectionUniformity(gestureArray)

    // Entry #172: Calculate genre weights using continuous parameter space
    // Uses 4 gestural parameters: energy, directionUniformity, regularity, pathComplexity
    // Entry #220: compositionCount enables PHI-based drift for parameter space exploration
    const genreWeights = this.calculateGenreWeights(
      energy,
      directionUniformity,
      rhythmicCharacter.regularity,
      harmonicComplexity.chromaticism,  // pathComplexity derived from gesture chromaticism
      compositionCount
    )

    const newStyle = {
      energy,
      tempo,
      timeSignature,
      rhythmicCharacter,
      melodicCharacter,
      harmonicComplexity,
      genreWeights,
      timestamp: Date.now()
    }

    // Smooth style evolution WITH GESTURE WEIGHT
    // High weight (initial gestures) = strong influence
    // Low weight (later gestures) = weak influence
    const evolvedStyle = this.evolveStyle(contextStyle, newStyle, gestureWeight)

    // Store in context-specific state
    this._contextStyles.set(contextId, evolvedStyle)

    // Also update legacy currentStyle for 'default' context (backwards compatibility)
    if (contextId === 'default') {
      this.currentStyle = evolvedStyle
    }

    this.styleHistory.push(evolvedStyle)  // CircularBuffer handles max size automatically

    return evolvedStyle
  }

  calculateEnergy(gestures) {
    // Energy based on velocity, density, and acceleration
    let totalVelocity = 0
    let totalAcceleration = 0
    let gestureDensity = gestures.length / 10 // Normalize by expected window

    gestures.forEach(gesture => {
      const velocity = gesture.velocity || gesture.properties?.velocity || 50
      const acceleration = gesture.acceleration || gesture.properties?.acceleration || 0

      totalVelocity += velocity
      totalAcceleration += Math.abs(acceleration)
    })

    const avgVelocity = totalVelocity / gestures.length
    const avgAcceleration = totalAcceleration / gestures.length

    // Combine factors (normalize to 0-1)
    const velocityFactor = Math.min(1, avgVelocity / 100)
    const accelerationFactor = Math.min(1, avgAcceleration / 50)
    const densityFactor = Math.min(1, gestureDensity / 5)

    // Entry #165: Clamp to [0, 1] to prevent negative values (was returning -0.07)
    return Math.max(0, Math.min(1, velocityFactor * 0.5 + accelerationFactor * 0.3 + densityFactor * 0.2))
  }

  estimateTempo(gestures) {
    if (gestures.length < 2) {
      return this.currentStyle.tempo // Keep current tempo
    }

    const allIntervals = []

    // Collect intervals between gestures (macro rhythm)
    for (let i = 1; i < gestures.length; i++) {
      const prevTime = gestures[i - 1].timestamp || Date.now() - 1000
      const currTime = gestures[i].timestamp || Date.now()
      const interval = currTime - prevTime

      // Only include reasonable intervals (50ms - 5000ms)
      if (interval >= 50 && interval <= 5000) {
        allIntervals.push(interval)
      }
    }

    // ALSO collect inter-onset intervals from DRAG gestures (micro rhythm)
    // These are the intervals between notes WITHIN a single drag gesture
    for (const gesture of gestures) {
      if (gesture.interOnsetInterval && gesture.interOnsetInterval > 0) {
        // Inter-onset intervals represent subdivision rhythm (faster than beat)
        // Weight them slightly less than gesture-to-gesture intervals
        allIntervals.push(gesture.interOnsetInterval)

        // console.log(`🎵 Using inter-onset interval from drag: ${gesture.interOnsetInterval.toFixed(1)}ms`)
      }
    }

    if (allIntervals.length === 0) {
      return this.currentStyle.tempo
    }

    // Find the most common interval (tempo indication)
    const avgInterval = allIntervals.reduce((sum, interval) => sum + interval, 0) / allIntervals.length

    // Convert interval to BPM (beats per minute)
    const bpm = Math.round(60000 / avgInterval)

    // console.log(`🎼 Tempo calculated from ${allIntervals.length} intervals: ${bpm} BPM (avg interval: ${avgInterval.toFixed(1)}ms)`)

    // Clamp to wide musical tempo range (30-300 BPM)
    return Math.max(30, Math.min(300, bpm))
  }

  detectMeter(gestures) {
    if (gestures.length < 3) {
      return this.currentStyle.timeSignature
    }

    // Analyze timing patterns to detect meter
    const intervals = []
    for (let i = 1; i < gestures.length; i++) {
      const prevTime = gestures[i - 1].timestamp || Date.now() - 1000
      const currTime = gestures[i].timestamp || Date.now()
      intervals.push(currTime - prevTime)
    }

    // Look for periodic groupings
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
    const variations = intervals.map(interval => interval / avgInterval)

    // Detect grouping patterns
    const groupings = this.findPeriodicGroupings(variations)

    // Classify meter based on grouping patterns
    return this.classifyMeter(groupings)
  }

  findPeriodicGroupings(variations) {
    // Entry #162: Find repeating patterns with increased tolerance (40%)
    const groupings = []

    for (let groupSize = 2; groupSize <= 8; groupSize++) {
      let matches = 0
      const total = Math.floor(variations.length / groupSize)

      for (let group = 0; group < total - 1; group++) {
        let groupMatch = true
        for (let i = 0; i < groupSize && (group * groupSize + i + groupSize) < variations.length; i++) {
          const diff = Math.abs(variations[group * groupSize + i] - variations[group * groupSize + i + groupSize])
          if (diff > 0.4) { // Increased tolerance from 20% to 40%
            groupMatch = false
            break
          }
        }
        if (groupMatch) matches++
      }

      if (matches > 0) {
        groupings.push({ size: groupSize, strength: matches / Math.max(1, total) })
      }
    }

    return groupings.sort((a, b) => b.strength - a.strength)
  }

  classifyMeter(groupings) {
    // Entry #164: Lowered thresholds for more meter variety
    const swing = this.currentStyle.rhythmicCharacter?.swing || 0
    const energy = this.currentStyle.energy || 0.5
    const syncopation = this.currentStyle.rhythmicCharacter?.syncopation || 0
    const regularity = this.currentStyle.rhythmicCharacter?.regularity || 0.5

    // If no clear grouping, use swing/energy/syncopation to suggest meter
    if (groupings.length === 0 || groupings[0].strength < 0.2) {
      // Entry #164: Lowered thresholds significantly for more variation
      // Swing suggests compound meters (6/8, 12/8)
      if (swing > 0.25) return energy > 0.5 ? '6/8' : '12/8'
      // Syncopation suggests odd meters
      if (syncopation > 0.35) return energy > 0.5 ? '5/4' : '7/8'
      // Low energy + high regularity → waltz feel
      if (energy < 0.4 && regularity > 0.5) return '3/4'
      // Low regularity → asymmetric meters
      if (regularity < 0.35) return syncopation > 0.2 ? '7/8' : '5/4'
      // High energy + low swing → driving 4/4 or 2/4
      if (energy > 0.6 && swing < 0.15) return regularity > 0.6 ? '2/4' : '4/4'
      // Moderate everything → pick based on energy band
      if (energy < 0.35) return '3/4'
      if (energy > 0.55) return '4/4'
      // Default for mid-energy
      return '6/8'
    }

    const strongest = groupings[0]

    // Map grouping sizes to meters
    const meterMap = {
      2: ['2/4', '6/8'],
      3: ['3/4', '6/8'],
      4: ['4/4', '12/8'],
      5: ['5/4', '5/8'],
      6: ['6/8', '3/4'],
      7: ['7/8', '7/4'],
      8: ['4/4', '8/8']
    }

    const possibleMeters = meterMap[strongest.size] || ['4/4']

    // Choose based on swing and energy
    if (swing > 0.2) {
      // Swing feel → compound meters (x/8)
      return possibleMeters.find(m => m.includes('8')) || possibleMeters[0]
    } else if (energy > 0.55) {
      // Higher energy → faster subdivisions
      return possibleMeters.find(m => m.includes('8')) || possibleMeters[0]
    } else {
      return possibleMeters.find(m => m.includes('4')) || possibleMeters[0]
    }
  }

  detectSwing(gestures) {
    // Swing detection: look for triplet-based timing patterns
    if (gestures.length < 4) return 0

    const intervals = []
    for (let i = 1; i < gestures.length; i++) {
      const prevTime = gestures[i - 1].timestamp || Date.now() - 500
      const currTime = gestures[i].timestamp || Date.now()
      const interval = currTime - prevTime
      // Filter out unreasonable intervals (network jitter)
      if (interval > 30 && interval < 3000) {
        intervals.push(interval)
      }
    }

    if (intervals.length < 3) return 0

    // Look for long-short OR short-long patterns
    // Widened ratio range: 1.2-4.0 (was 1.5-3.5)
    let swingPairs = 0
    let totalPairs = 0

    for (let i = 0; i < intervals.length - 1; i++) {
      const first = intervals[i]
      const second = intervals[i + 1]
      // Check both directions (long-short or short-long)
      const ratio = Math.max(first, second) / Math.min(first, second)

      // Swing is 1.2-4.0 ratio (widened from 1.5-3.5)
      if (ratio >= 1.2 && ratio <= 4.0) {
        swingPairs++
      }
      totalPairs++
    }

    return totalPairs > 0 ? swingPairs / totalPairs : 0
  }

  detectSyncopation(gestures) {
    // Syncopation: accents on weak beats and velocity contrast
    if (gestures.length < 3) return 0

    // Get velocities, normalize to 0-1 range
    const velocities = gestures.map(g => {
      const v = g.velocity || g.properties?.velocity || 0.5
      // Handle both 0-1 and 0-127 MIDI ranges
      return v > 1 ? v / 127 : v
    })

    const avgVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length
    if (avgVelocity === 0) return 0

    // Calculate velocity variance (contrast)
    const variance = velocities.reduce((sum, v) => sum + Math.pow(v - avgVelocity, 2), 0) / velocities.length
    const velocityContrast = Math.min(1, Math.sqrt(variance) * 3) // Scale up for visibility

    // Count accents (velocities above average) on unexpected positions
    let syncopatedAccents = 0
    let totalAccents = 0

    velocities.forEach((v, i) => {
      const isAccent = v > avgVelocity * 1.15 // Lowered threshold from 1.2
      if (isAccent) {
        totalAccents++
        // Off-beat positions (odd indices, or after a weak note)
        const prevWeak = i > 0 && velocities[i - 1] < avgVelocity
        if (i % 2 === 1 || prevWeak) {
          syncopatedAccents++
        }
      }
    })

    // Combine position-based syncopation with velocity contrast
    const positionSyncopation = totalAccents > 0 ? syncopatedAccents / totalAccents : 0
    return (positionSyncopation * 0.6 + velocityContrast * 0.4)
  }

  detectRhythmicRegularity(gestures) {
    // How regular are the timing patterns?
    if (gestures.length < 3) return 0.5

    let intervals = []
    for (let i = 1; i < gestures.length; i++) {
      const prevTime = gestures[i - 1].timestamp || Date.now() - 500
      const currTime = gestures[i].timestamp || Date.now()
      const interval = currTime - prevTime
      // Filter reasonable intervals (50ms - 3000ms)
      if (interval > 50 && interval < 3000) {
        intervals.push(interval)
      }
    }

    if (intervals.length < 2) return 0.5

    // Remove outliers using IQR method
    const sorted = [...intervals].sort((a, b) => a - b)
    const q1 = sorted[Math.floor(sorted.length * 0.25)]
    const q3 = sorted[Math.floor(sorted.length * 0.75)]
    const iqr = q3 - q1
    const lowerBound = q1 - 1.5 * iqr
    const upperBound = q3 + 1.5 * iqr

    intervals = intervals.filter(i => i >= lowerBound && i <= upperBound)

    if (intervals.length < 2) return 0.5

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length
    const standardDeviation = Math.sqrt(variance)

    // Regularity is inverse of coefficient of variation
    // Clamp CV to max 2.0 to avoid extreme negative values
    const coefficientOfVariation = Math.min(2, standardDeviation / avgInterval)
    // Scale to 0-1 range where CV=0 -> 1.0, CV=1 -> 0.5, CV=2 -> 0
    return Math.max(0, 1 - coefficientOfVariation * 0.5)
  }

  analyzeIntervals(gestures) {
    // Convert gesture trajectories to melodic intervals
    if (gestures.length < 2) {
      return { step: 0.7, skip: 0.2, leap: 0.1 } // Default distribution
    }

    const intervals = []
    for (let i = 1; i < gestures.length; i++) {
      const prevY = gestures[i - 1].position?.y || 0.5
      const currY = gestures[i].position?.y || 0.5

      // Convert Y position to pitch (invert Y axis: higher up = higher pitch)
      const prevPitch = (1 - prevY) * 24 // 2 octaves range
      const currPitch = (1 - currY) * 24

      const interval = Math.abs(currPitch - prevPitch)
      intervals.push(interval)
    }

    // Classify intervals
    let steps = 0, skips = 0, leaps = 0

    intervals.forEach(interval => {
      if (interval <= 2) steps++      // Whole step or less
      else if (interval <= 4) skips++ // Third or fourth
      else leaps++                     // Fifth or more
    })

    const total = intervals.length
    return {
      step: total > 0 ? steps / total : 0.7,
      skip: total > 0 ? skips / total : 0.2,
      leap: total > 0 ? leaps / total : 0.1
    }
  }

  detectContour(gestures) {
    if (gestures.length < 3) return 'neutral'

    const yPositions = gestures.map(g => g.position?.y || 0.5)

    // Calculate overall direction (inverted: higher Y = lower pitch)
    const start = yPositions[0]
    const end = yPositions[yPositions.length - 1]
    const overallDirection = start - end // Invert for pitch direction

    // Calculate contour shape
    let peaks = 0, valleys = 0

    for (let i = 1; i < yPositions.length - 1; i++) {
      const prev = yPositions[i - 1]
      const curr = yPositions[i]
      const next = yPositions[i + 1]

      if (curr < prev && curr < next) peaks++  // Lower Y = higher pitch
      if (curr > prev && curr > next) valleys++ // Higher Y = lower pitch
    }

    // Classify contour
    if (Math.abs(overallDirection) < 0.15) {
      if (peaks > valleys) return 'wave'
      if (valleys > peaks) return 'inverted_wave'
      return 'static'
    }

    // Entry #165: Raised threshold from 0.2 to 0.35 to reduce ascending bias
    if (overallDirection > 0.35) return 'ascending' // Going up in pitch
    if (overallDirection < -0.35) return 'descending' // Going down in pitch

    if (peaks === 1 && valleys === 0) return 'arch'
    if (valleys === 1 && peaks === 0) return 'inverted_arch'

    return 'complex'
  }

  calculateRange(gestures) {
    if (gestures.length < 2) return 12 // Default octave

    const yPositions = gestures.map(g => g.position?.y || 0.5)
    const minY = Math.min(...yPositions)
    const maxY = Math.max(...yPositions)

    // Convert Y range to semitone range
    const yRange = maxY - minY
    return Math.round(yRange * 24) // 2 octaves max
  }

  detectChromaticism(gestures) {
    // Entry #162: Enhanced chromaticism detection with multiple factors
    if (gestures.length < 2) return 0

    // Method 1: Path complexity (turn angles) - lowered threshold to 15°
    let turnScore = 0
    let turnCount = 0
    for (let i = 1; i < gestures.length - 1; i++) {
      const prev = gestures[i - 1].position || { x: 0.5, y: 0.5 }
      const curr = gestures[i].position || { x: 0.5, y: 0.5 }
      const next = gestures[i + 1].position || { x: 0.5, y: 0.5 }

      // Skip if positions are identical (no movement)
      if (prev.x === curr.x && prev.y === curr.y) continue
      if (curr.x === next.x && curr.y === next.y) continue

      const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x)
      const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x)
      let turnAngle = Math.abs(angle2 - angle1)
      if (turnAngle > Math.PI) turnAngle = 2 * Math.PI - turnAngle

      // Lowered to 15° (PI/12) and give partial credit for any turn
      if (turnAngle > Math.PI / 12) {
        turnScore += Math.min(1, turnAngle / (Math.PI / 3)) // Scale by sharpness
        turnCount++
      }
    }
    const pathComplexity = gestures.length > 2 ? Math.min(1, turnScore / (gestures.length - 2)) : 0

    // Method 2: Y-position variance (pitch irregularity)
    const yPositions = gestures.map(g => g.position?.y || 0.5)
    const avgY = yPositions.reduce((sum, y) => sum + y, 0) / yPositions.length
    const yVariance = yPositions.reduce((sum, y) => sum + Math.pow(y - avgY, 2), 0) / yPositions.length
    const pitchComplexity = Math.min(1, Math.sqrt(yVariance) * 5) // Increased scaling

    // Method 3: Velocity variance (new)
    const velocities = gestures.map(g => {
      const v = g.velocity || g.properties?.velocity || 0.5
      return v > 1 ? v / 127 : v
    })
    const avgVel = velocities.reduce((sum, v) => sum + v, 0) / velocities.length
    const velVariance = velocities.reduce((sum, v) => sum + Math.pow(v - avgVel, 2), 0) / velocities.length
    const velocityComplexity = Math.min(1, Math.sqrt(velVariance) * 4)

    // Combine all methods
    return (pathComplexity * 0.35 + pitchComplexity * 0.35 + velocityComplexity * 0.3)
  }

  calculateDissonance(gestures) {
    // Dissonance based on gesture irregularity and tension
    if (gestures.length < 2) return 0.2

    // Normalize velocities to 0-1 range first
    const velocities = gestures.map(g => {
      const v = g.velocity || g.properties?.velocity || 0.5
      return v > 1 ? v / 127 : v // Handle MIDI range
    })

    const avgVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length
    // Guard against division by zero or very small values
    if (avgVelocity < 0.01) return 0.2

    // Calculate coefficient of variation (normalized measure of variance)
    const variance = velocities.reduce((sum, v) => sum + Math.pow(v - avgVelocity, 2), 0) / velocities.length
    const stdDev = Math.sqrt(variance)
    // Clamp CV to prevent extreme values from very small avgVelocity
    const coeffOfVariation = Math.min(2, stdDev / Math.max(0.01, avgVelocity))
    // CV of 0.5 is moderate irregularity, scale to 0-1
    const velocityIrregularity = Math.min(1, coeffOfVariation * 2)

    // Calculate acceleration changes (use relative acceleration)
    const accelerations = gestures.map(g => {
      const a = Math.abs(g.acceleration || g.properties?.acceleration || 0)
      return a > 1 ? a / 100 : a // Normalize if needed
    })
    const avgAcceleration = accelerations.reduce((sum, a) => sum + a, 0) / accelerations.length
    // High acceleration = tension, scale appropriately
    const accelerationTension = Math.min(1, avgAcceleration * 2)

    // Also factor in timing irregularity
    let timingTension = 0
    if (gestures.length > 2) {
      const intervals = []
      for (let i = 1; i < gestures.length; i++) {
        const interval = (gestures[i].timestamp || 0) - (gestures[i-1].timestamp || 0)
        if (interval > 0 && interval < 3000) intervals.push(interval)
      }
      if (intervals.length > 1) {
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
        const intervalVariance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length
        const intervalCV = Math.sqrt(intervalVariance) / avgInterval
        timingTension = Math.min(1, intervalCV)
      }
    }

    // Combine factors with balanced weights
    return (velocityIrregularity * 0.4 + accelerationTension * 0.3 + timingTension * 0.3)
  }

  detectModalFlavor(gestures) {
    // Entry #165: Rebalanced modal detection to reduce ionian dominance (was 44%)
    if (!gestures || gestures.length < 2) return 'dorian'  // Changed from ionian

    const energy = this.calculateEnergy(gestures)
    const contour = this.detectContour(gestures)
    const swing = this.detectSwing(gestures)

    // Calculate Y position variance (higher = darker modes)
    const yPositions = gestures.map(g => g.position?.y || 0.5)
    const avgY = yPositions.reduce((sum, y) => sum + y, 0) / yPositions.length
    const yVariance = yPositions.reduce((sum, y) => sum + Math.pow(y - avgY, 2), 0) / yPositions.length
    const ySpread = Math.min(1, Math.sqrt(yVariance) * 4)

    // Calculate velocity trend (increasing = brighter, decreasing = darker)
    const velocities = gestures.map(g => g.velocity || g.properties?.velocity || 0.5)
    let velocityTrend = 0
    if (velocities.length > 2) {
      const firstHalf = velocities.slice(0, Math.floor(velocities.length / 2))
      const secondHalf = velocities.slice(Math.floor(velocities.length / 2))
      const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
      const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
      velocityTrend = (avgSecond - avgFirst) / Math.max(0.1, avgFirst)
    }

    // Calculate syncopation for additional differentiation
    const syncopation = this.detectSyncopation(gestures)

    // Entry #165: Lowered thresholds and diversified paths
    // High energy branch
    if (energy > 0.6) {
      if (swing > 0.25) return 'mixolydian'  // Lowered from 0.4
      if (ySpread > 0.3) return 'lydian'     // New path
      if (contour === 'ascending' && velocityTrend > 0.05) return 'lydian'  // Lowered from 0.1
      if (contour === 'ascending') return ySpread > 0.2 ? 'mixolydian' : 'ionian'  // Split path
      if (syncopation > 0.3) return 'mixolydian'  // New path
      return 'lydian'  // Changed from mixolydian for variety
    }

    // Low energy branch
    if (energy < 0.4) {
      if (contour === 'descending' && ySpread > 0.25) return 'phrygian'  // Lowered from 0.3
      if (contour === 'descending') return 'aeolian'
      if (ySpread > 0.35) return 'locrian'
      if (swing > 0.2) return 'phrygian'  // New path
      if (syncopation > 0.25) return 'locrian'  // New path
      return 'aeolian'
    }

    // Moderate energy branch - most selections fall here
    if (swing > 0.2) return 'dorian'  // Lowered from 0.3
    if (ySpread > 0.25) return 'dorian'  // Lowered from 0.35
    if (velocityTrend > 0.1) return 'lydian'  // Lowered from 0.15
    if (velocityTrend < -0.1) return 'aeolian'  // Lowered from -0.15
    if (syncopation > 0.3) return 'mixolydian'  // New path
    if (contour === 'ascending') return ySpread > 0.15 ? 'lydian' : 'ionian'  // Split path
    if (contour === 'descending') return ySpread > 0.15 ? 'phrygian' : 'aeolian'  // Split path
    if (contour === 'wave' || contour === 'complex') return 'dorian'  // New path
    return 'mixolydian'  // Changed from dorian for variety
  }

  /**
   * Entry #172: Calculate genre weights using continuous parameter space.
   * Each genre is a point in 4D space. Weight = inverse distance from gesture point.
   * Uses gaussian falloff for smooth transitions between genres.
   *
   * @param {number} energy - Gesture energy (0-1)
   * @param {number} directionUniformity - How uniform gesture directions are (0-1)
   * @param {number} regularity - Timing consistency (0-1)
   * @param {number} pathComplexity - Gesture path complexity / chromaticism (0-1)
   * @returns {Object} Genre weights (sum to 1.0)
   */
  calculateGenreWeights(energy, directionUniformity, regularity, pathComplexity, compositionCount = 0) {
    // Clamp input values
    const rawValues = {
      energy: Math.max(0, Math.min(1, energy || 0.5)),
      directionUniformity: Math.max(0, Math.min(1, directionUniformity || 0.5)),
      regularity: Math.max(0, Math.min(1, regularity || 0.5)),
      pathComplexity: Math.max(0, Math.min(1, pathComplexity || 0.5))
    }

    // Entry #220: Track statistics and apply percentile normalization
    const normalizedValues = this._updateAndNormalize4DMetrics(rawValues)

    // Entry #220: Apply PHI-based low-discrepancy drift for parameter space exploration
    // This ensures all genres are reachable over time while preserving metric emergence
    const driftOffset = this._calculate4DDrift(compositionCount)

    const gesturePoint = {
      energy: Math.max(0, Math.min(1, normalizedValues.energy + driftOffset.energy)),
      directionUniformity: Math.max(0, Math.min(1, normalizedValues.directionUniformity + driftOffset.directionUniformity)),
      regularity: Math.max(0, Math.min(1, normalizedValues.regularity + driftOffset.regularity)),
      pathComplexity: Math.max(0, Math.min(1, normalizedValues.pathComplexity + driftOffset.pathComplexity))
    }

    const weights = {}

    // Calculate weight for each genre based on distance from profile
    Object.entries(GENRE_PROFILES).forEach(([genre, profile]) => {
      const distance = this._euclideanDistance(gesturePoint, profile)
      // Gaussian falloff: closer = higher weight
      weights[genre] = Math.exp(-distance * distance * GAUSSIAN_FACTOR)
    })

    // Normalize to sum to 1.0
    const total = Object.values(weights).reduce((sum, w) => sum + w, 0)
    // Note: total should never be 0 since gaussian is always > 0, but kept for defensive programming
    if (total > 0) {
      Object.keys(weights).forEach(key => {
        weights[key] /= total
      })
    } else {
      // Fallback to uniform distribution (mathematically unreachable but defensive)
      const uniform = 1.0 / Object.keys(GENRE_PROFILES).length
      Object.keys(weights).forEach(key => {
        weights[key] = uniform
      })
    }

    return weights
  }

  /**
   * Entry #220: Calculate PHI-based 4D drift offset for parameter space exploration.
   * Uses low-discrepancy sequence (Kronecker additive recurrence) with different
   * irrational multipliers per dimension to ensure independence.
   *
   * @param {number} compositionCount - Current composition count for temporal variation
   * @returns {Object} Drift offset for each dimension (centered around 0)
   * @private
   */
  _calculate4DDrift(compositionCount) {
    return {
      // ((n * irrational) % 1) gives value in [0, 1), subtract 0.5 to center at 0
      // Then multiply by 2 * DRIFT_AMPLITUDE to get range [-DRIFT_AMPLITUDE, +DRIFT_AMPLITUDE]
      energy: ((compositionCount * PHI_4D[0]) % 1 - 0.5) * DRIFT_AMPLITUDE * 2,
      directionUniformity: ((compositionCount * PHI_4D[1]) % 1 - 0.5) * DRIFT_AMPLITUDE * 2,
      regularity: ((compositionCount * PHI_4D[2]) % 1 - 0.5) * DRIFT_AMPLITUDE * 2,
      pathComplexity: ((compositionCount * PHI_4D[3]) % 1 - 0.5) * DRIFT_AMPLITUDE * 2
    }
  }

  /**
   * Entry #220: Update metric statistics and apply percentile-based normalization.
   * Tracks rolling window of samples for each dimension, uses P10-P90 range for
   * robust normalization that adapts to actual data distribution.
   *
   * @param {Object} rawValues - Raw metric values {energy, directionUniformity, regularity, pathComplexity}
   * @returns {Object} Normalized values using percentile-based scaling
   * @private
   */
  _updateAndNormalize4DMetrics(rawValues) {
    const normalized = {}
    const MIN_SAMPLES_FOR_PERCENTILE = 10

    for (const [key, value] of Object.entries(rawValues)) {
      const stats = this._metricStatistics[key]

      // Update statistics - CircularBuffer handles window size automatically with O(1) push
      stats.samples.push(value)
      stats.min = Math.min(stats.min, value)
      stats.max = Math.max(stats.max, value)

      // Apply normalization based on available data
      if (stats.samples.length < MIN_SAMPLES_FOR_PERCENTILE) {
        // During warm-up, use simple pass-through (values already 0-1)
        normalized[key] = value
      } else {
        // Use P10-P90 percentile normalization for robustness against outliers
        // Convert CircularBuffer to array for sorting
        const sortedSamples = stats.samples.toArray().sort((a, b) => a - b)
        const p10Index = Math.max(0, Math.min(sortedSamples.length - 1, Math.floor(sortedSamples.length * 0.1)))
        const p90Index = Math.max(0, Math.min(sortedSamples.length - 1, Math.floor(sortedSamples.length * 0.9)))
        const p10 = sortedSamples[p10Index]
        const p90 = sortedSamples[p90Index]

        const stabilizedRange = p90 - p10
        if (stabilizedRange > 0.01) {  // Avoid division by near-zero
          normalized[key] = Math.max(0, Math.min(1, (value - p10) / stabilizedRange))
        } else {
          // Fallback if range is too small
          normalized[key] = value
        }
      }
    }

    return normalized
  }

  /**
   * Entry #172: Calculate euclidean distance between two points in 4D parameter space.
   * Used for genre weight calculation based on proximity to genre profiles.
   *
   * @param {Object} point1 - First point {energy, directionUniformity, regularity, pathComplexity}
   * @param {Object} point2 - Second point (genre profile)
   * @returns {number} Euclidean distance
   */
  _euclideanDistance(point1, point2) {
    return Math.sqrt(
      Math.pow(point1.energy - point2.energy, 2) +
      Math.pow(point1.directionUniformity - point2.directionUniformity, 2) +
      Math.pow(point1.regularity - point2.regularity, 2) +
      Math.pow(point1.pathComplexity - point2.pathComplexity, 2)
    )
  }

  /**
   * Entry #172: Calculate direction uniformity from gesture array.
   * Uses circular mean resultant length (R-bar) to measure angular concentration.
   * Vectors pointing the same direction sum constructively (R-bar → 1),
   * uniformly distributed directions cancel out (R-bar → 0).
   *
   * @param {Array} gestures - Array of gesture objects
   * @returns {number} Direction uniformity (0 = diverse directions, 1 = same direction)
   */
  calculateDirectionUniformity(gestures) {
    if (!gestures || gestures.length < 2) {
      return 0.5 // Default neutral value
    }

    // Extract directions from gestures (angle in radians)
    const directions = gestures.map(g => {
      // Try to get direction from trajectory (with validation)
      if (g.trajectory && g.trajectory.length >= 2) {
        const start = g.trajectory[0]
        const end = g.trajectory[g.trajectory.length - 1]
        // Validate that start and end have required x,y properties
        if (start?.x !== undefined && start?.y !== undefined &&
            end?.x !== undefined && end?.y !== undefined) {
          return Math.atan2(end.y - start.y, end.x - start.x)
        }
      }
      // Try to get direction from position changes (with validation)
      if (g.position && g.startPosition) {
        if (g.position?.x !== undefined && g.position?.y !== undefined &&
            g.startPosition?.x !== undefined && g.startPosition?.y !== undefined) {
          return Math.atan2(g.position.y - g.startPosition.y, g.position.x - g.startPosition.x)
        }
      }
      // Try to parse string direction
      if (g.direction) {
        return this._directionToAngle(g.direction)
      }
      // Default to 0
      return 0
    })

    // Calculate circular mean resultant length using vector averaging
    const sinSum = directions.reduce((sum, d) => sum + Math.sin(d), 0)
    const cosSum = directions.reduce((sum, d) => sum + Math.cos(d), 0)
    const meanResultant = Math.sqrt(sinSum * sinSum + cosSum * cosSum) / directions.length

    // meanResultant: 1 = all same direction, 0 = uniformly distributed
    return meanResultant
  }

  /**
   * Convert string direction to angle in radians.
   * @param {string} direction - Direction string (up, down, left, right, diagonal-*)
   * @returns {number} Angle in radians
   */
  _directionToAngle(direction) {
    const directionMap = {
      'up': -Math.PI / 2,
      'down': Math.PI / 2,
      'left': Math.PI,
      'right': 0,
      'diagonal-up-right': -Math.PI / 4,
      'diagonal-up-left': -3 * Math.PI / 4,
      'diagonal-down-right': Math.PI / 4,
      'diagonal-down-left': 3 * Math.PI / 4
    }
    return directionMap[direction] || 0
  }

  evolveStyle(currentStyle, newAnalysis, gestureWeight = 0.5) {
    // ADAPTIVE SMOOTHING based on gesture weight
    // High weight (initial gestures) = strong influence
    // Low weight (later gestures) = weak influence
    const baseAlpha = 1 - this.smoothingFactor
    const alpha = Math.max(0.15, baseAlpha * gestureWeight) // Scale by gesture weight, minimum 15% influence

    // console.log(`🎨 Style evolution: weight=${gestureWeight.toFixed(2)}, alpha=${alpha.toFixed(2)} (${gestureWeight >= 0.8 ? 'STRONG' : gestureWeight >= 0.5 ? 'MODERATE' : 'WEAK'} influence)`)

    const evolved = {}

    Object.keys(newAnalysis).forEach(key => {
      // TEMPO: Use calculated BPM directly without smoothing
      if (key === 'tempo') {
        evolved[key] = newAnalysis[key]
        return
      }

      // Entry #164: STRING VALUES cannot be smoothed - pass through directly
      // timeSignature is a string like '4/4', '3/4', etc.
      if (key === 'timeSignature') {
        // Use new value if weight is significant (>0.3), otherwise keep current
        evolved[key] = gestureWeight > 0.3 ? newAnalysis[key] : (currentStyle[key] || newAnalysis[key])
        return
      }

      // Other properties: Apply weighted smoothing
      if (typeof newAnalysis[key] === 'object' && !Array.isArray(newAnalysis[key])) {
        evolved[key] = {}
        Object.keys(newAnalysis[key]).forEach(subKey => {
          const newValue = newAnalysis[key][subKey]
          const current = currentStyle[key]?.[subKey]

          // Entry #164: STRING VALUES cannot be smoothed mathematically
          // modalFlavor is a string like 'ionian', 'dorian', etc.
          if (typeof newValue === 'string') {
            // Use new value if weight is significant, otherwise keep current
            evolved[key][subKey] = gestureWeight > 0.3 ? newValue : (current || newValue)
            return
          }

          // Numeric values: Apply weighted smoothing
          const currentNum = current !== undefined ? current : newValue
          evolved[key][subKey] = currentNum * (1 - alpha) + newValue * alpha
        })
      } else {
        const newValue = newAnalysis[key]
        const current = currentStyle[key]

        // Entry #164: Handle string values at top level too
        if (typeof newValue === 'string') {
          evolved[key] = gestureWeight > 0.3 ? newValue : (current || newValue)
          return
        }

        const currentNum = current !== undefined ? current : newValue
        // Apply weighted smoothing
        evolved[key] = currentNum * (1 - alpha) + newValue * alpha
      }
    })

    return evolved
  }

  /**
   * Entry #210: Set manual genre override - applies to ALL getCurrentStyle() calls
   * This ensures consistent genre throughout the entire composition pipeline
   * @param {Object} genreWeights - Synthetic weights with 100% for forced genre
   * @param {string} forcedGenre - The genre being forced
   */
  setManualOverride(genreWeights, forcedGenre) {
    this._manualOverride = {
      enabled: true,
      genreWeights,
      forcedGenre
    }
  }

  /**
   * Entry #210: Clear manual genre override - returns to automatic genre detection
   */
  clearManualOverride() {
    this._manualOverride = {
      enabled: false,
      genreWeights: null,
      forcedGenre: null
    }
  }

  /**
   * Entry #210: Check if manual override is currently active
   * @returns {boolean} True if override is active
   */
  isManualOverrideActive() {
    return this._manualOverride?.enabled === true
  }

  /**
   * Entry #218b: Export override state for backup/restoration
   * @returns {Object|null} Clone of override state, or null if not active
   */
  exportOverrideState() {
    if (!this._manualOverride?.enabled) {
      return null
    }
    return {
      enabled: true,
      genreWeights: { ...this._manualOverride.genreWeights },
      forcedGenre: this._manualOverride.forcedGenre
    }
  }

  /**
   * Entry #218b: Restore override state from backup
   * @param {Object} state - Previously exported override state
   */
  restoreOverrideState(state) {
    if (state?.enabled && state.forcedGenre && state.genreWeights) {
      this.setManualOverride(state.genreWeights, state.forcedGenre)
    }
  }

  getCurrentStyle() {
    // Entry #210: Apply manual override if active
    if (this._manualOverride?.enabled) {
      return {
        ...this.currentStyle,
        genreWeights: this._manualOverride.genreWeights,
        forcedGenre: this._manualOverride.forcedGenre,
        isManualOverride: true
      }
    }
    return this.currentStyle
  }

  calculateMoodCompatibility(material, targetMood) {
    // Calculate how well material matches target mood
    const materialValence = material.metadata?.emotionalValence || 0.5
    const targetValence = this.moodToValence(targetMood)

    return 1 - Math.abs(materialValence - targetValence)
  }

  moodToValence(mood) {
    const moodMap = {
      'happy': 0.8, 'bright': 0.7, 'energetic': 0.6,
      'neutral': 0.5, 'contemplative': 0.4,
      'sad': 0.2, 'dark': 0.3, 'tense': 0.1
    }
    return moodMap[mood] || 0.5
  }

  getStyleHistory() {
    return this.styleHistory.toArray()
  }
}


module.exports = StyleAnalyzer