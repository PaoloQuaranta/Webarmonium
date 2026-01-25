/**
 * Genre weight sharpening exponent.
 * Higher values create more extreme differentiation between genres.
 * - 1.0 = no sharpening (linear)
 * - 2.0 = quadratic (moderate differentiation, recommended)
 * - 2.5+ = aggressive differentiation
 *
 * With 8 genres normalized to sum=1.0, average weight is 0.125.
 * Sharpening amplifies leaders: e.g., 0.20 -> 0.28 (with exp 2.0)
 */
const GENRE_SHARPENING_EXPONENT = 2.0

/**
 * Minimum total after sharpening to avoid underflow.
 * If sharpened weights sum to less than this, return uniform distribution.
 */
const SHARPENING_UNDERFLOW_THRESHOLD = 1e-10

class StyleAnalyzer {
  constructor() {
    this.currentStyle = {
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

    this.styleHistory = []
    this.smoothingFactor = 0.3 // Reduced from 0.5 - allows 70% influence for initial gestures (weight=1.0)
  }

  analyzeGestureStyle(gestures, gestureWeight = 0.5) {
    if (!gestures || gestures.length === 0) {
      return this.currentStyle
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

    // Calculate genre weights
    const genreWeights = this.calculateGenreWeights(
      energy,
      tempo,
      rhythmicCharacter,
      melodicCharacter,
      harmonicComplexity
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
    this.currentStyle = this.evolveStyle(this.currentStyle, newStyle, gestureWeight)
    this.styleHistory.push(this.currentStyle)

    // Keep history manageable
    if (this.styleHistory.length > 100) {
      this.styleHistory.shift()
    }

    return this.currentStyle
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

  calculateGenreWeights(energy, tempo, rhythmicCharacter, melodicCharacter, harmonicComplexity) {
    const weights = {
      ambient: 0,
      rhythmic: 0,
      melodic: 0,
      experimental: 0,
      jazz: 0,
      classical: 0,
      electronic: 0,
      rock: 0
    }

    // Entry #166: Rebalanced genre weights - was melodic 19%, rock 22%, ambient 5%, jazz 7%
    // Problem: easy conditions for melodic/rock, hard conditions for ambient/jazz

    // Ambient: low energy, slow tempo, regular rhythm
    // Widened tempo range and added low syncopation path
    weights.ambient += (1 - energy) * 0.35
    weights.ambient += (tempo < 100 ? 0.25 : 0)  // Widened from <80
    weights.ambient += (1 - rhythmicCharacter.syncopation) * 0.2  // Low syncopation = ambient
    weights.ambient += rhythmicCharacter.regularity * 0.15

    // Rhythmic: high energy, regular rhythm, strong tempo
    weights.rhythmic += energy * 0.25
    weights.rhythmic += rhythmicCharacter.regularity * 0.25
    weights.rhythmic += (tempo > 110 ? 0.2 : 0)  // Lowered from 120
    weights.rhythmic += rhythmicCharacter.syncopation * 0.15

    // Melodic: clear contours, balanced intervals - REDUCED bias
    // Was getting 0.51 guaranteed, now more conditional
    weights.melodic += melodicCharacter.intervalProfile.step * 0.2  // Reduced from 0.3
    weights.melodic += (melodicCharacter.contourType === 'ascending' || melodicCharacter.contourType === 'descending' ? 0.25 : 0)  // Specific contours only
    weights.melodic += (1 - harmonicComplexity.chromaticism) * 0.15  // Diatonic = melodic

    // Experimental: high chromaticism, irregular rhythm, complex contours
    // Added more paths since chromaticism/dissonance are often low
    weights.experimental += harmonicComplexity.chromaticism * 0.25
    weights.experimental += (1 - rhythmicCharacter.regularity) * 0.2
    weights.experimental += harmonicComplexity.dissonance * 0.2
    weights.experimental += (melodicCharacter.contourType === 'complex' || melodicCharacter.contourType === 'wave' ? 0.2 : 0)  // Complex contours
    weights.experimental += melodicCharacter.intervalProfile.leap * 0.2  // Large intervals = experimental

    // Jazz: swing feel, moderate complexity - INCREASED paths
    // Added more ways to reach jazz
    weights.jazz += rhythmicCharacter.swing * 0.3  // Reduced from 0.4 but added other paths
    weights.jazz += harmonicComplexity.dissonance * 0.25  // Increased from 0.2
    weights.jazz += (tempo >= 90 && tempo <= 150 ? 0.2 : 0)  // Widened from 100-140
    weights.jazz += melodicCharacter.intervalProfile.skip * 0.15  // Skips = jazz

    // Classical: smooth contours, moderate tempo
    weights.classical += (melodicCharacter.contourType === 'arch' || melodicCharacter.contourType === 'wave' || melodicCharacter.contourType === 'static') * 0.25
    weights.classical += (tempo >= 50 && tempo <= 130 ? 0.25 : 0)  // Widened from 60-120
    weights.classical += (1 - rhythmicCharacter.syncopation) * 0.2
    weights.classical += melodicCharacter.intervalProfile.step * 0.15

    // Electronic: regular rhythm, syncopation, energy variety
    weights.electronic += rhythmicCharacter.regularity * 0.25
    weights.electronic += rhythmicCharacter.syncopation * 0.25  // Increased from 0.2
    weights.electronic += (energy > 0.4 ? 0.15 : 0)  // Lowered from 0.5
    weights.electronic += (tempo > 100 ? 0.15 : 0)

    // Rock: high energy, strong rhythm - REDUCED bias
    // Was getting easy 0.5+, now more conditional
    weights.rock += (energy > 0.5 ? energy * 0.3 : 0)  // Only high energy counts
    weights.rock += (tempo >= 110 && tempo <= 150 ? 0.2 : 0)  // Narrowed from 100-160
    weights.rock += rhythmicCharacter.regularity * 0.15
    weights.rock += (1 - rhythmicCharacter.swing) * 0.15  // Low swing = rock

    // Normalize weights to sum to 1
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0)
    if (total > 0) {
      Object.keys(weights).forEach(key => {
        weights[key] /= total
      })
    }

    // Apply distribution sharpening to create more differentiated weights
    const sharpened = this._sharpenDistribution(weights, GENRE_SHARPENING_EXPONENT)
    return sharpened
  }

  /**
   * Sharpens genre weight distribution using power function.
   * Higher weights get amplified more, creating clearer genre differentiation.
   *
   * Mathematical behavior:
   * - Values < 0.5 are reduced (e.g., 0.2^2 = 0.04)
   * - Values > 0.5 are reduced less (e.g., 0.8^2 = 0.64)
   * - Creates wider spread between dominant and weak genres
   *
   * Example with exponent 2.0:
   *   Input:  { jazz: 0.20, rock: 0.18, ambient: 0.15, ... }
   *   Output: { jazz: 0.28, rock: 0.23, ambient: 0.16, ... }
   *
   * @param {Object} weights - Normalized genre weights (sum to 1.0)
   * @param {number} exponent - Sharpening exponent (1.0 = no change, 2.0 = moderate)
   * @returns {Object} Sharpened weights (still sum to 1.0)
   */
  _sharpenDistribution(weights, exponent = GENRE_SHARPENING_EXPONENT) {
    const keys = Object.keys(weights)
    const sharpened = {}

    // Apply power function, ensuring non-negative values
    keys.forEach(key => {
      sharpened[key] = Math.pow(Math.max(0, weights[key]), exponent)
    })

    const total = Object.values(sharpened).reduce((sum, w) => sum + w, 0)

    // Underflow protection: if total is extremely small, return uniform distribution
    if (total < SHARPENING_UNDERFLOW_THRESHOLD) {
      const uniform = 1.0 / keys.length
      keys.forEach(key => {
        sharpened[key] = uniform
      })
      return sharpened
    }

    // Re-normalize to sum to 1.0
    keys.forEach(key => {
      sharpened[key] /= total
    })

    return sharpened
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

  getCurrentStyle() {
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
    return this.styleHistory
  }
}

module.exports = StyleAnalyzer