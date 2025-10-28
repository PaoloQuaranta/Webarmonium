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
        modalFlavor: 'major'
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
    this.smoothingFactor = 0.9 // Exponential smoothing
  }

  analyzeGestureStyle(gestures) {
    if (!gestures || gestures.length === 0) {
      return this.currentStyle
    }

    const gestureArray = Array.isArray(gestures) ? gestures : [gestures]

    // Analyze energy from gesture density and velocity
    const energy = this.calculateEnergy(gestureArray)

    // Analyze tempo and meter from timing
    const tempo = this.estimateTempo(gestureArray)
    const timeSignature = this.detectMeter(gestureArray)

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

    // Smooth style evolution
    this.currentStyle = this.evolveStyle(this.currentStyle, newStyle)
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

    return (velocityFactor * 0.5 + accelerationFactor * 0.3 + densityFactor * 0.2)
  }

  estimateTempo(gestures) {
    if (gestures.length < 2) {
      return this.currentStyle.tempo // Keep current tempo
    }

    // Calculate intervals between gestures
    const intervals = []
    for (let i = 1; i < gestures.length; i++) {
      const prevTime = gestures[i - 1].timestamp || Date.now() - 1000
      const currTime = gestures[i].timestamp || Date.now()
      intervals.push(currTime - prevTime)
    }

    // Find the most common interval (tempo indication)
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length

    // Convert interval to BPM (beats per minute)
    // Assuming each gesture could represent a beat
    const bpm = Math.round(60000 / avgInterval)

    // Clamp to reasonable musical tempo range
    return Math.max(40, Math.min(200, bpm))
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
    // Find repeating patterns in timing variations
    const groupings = []

    for (let groupSize = 2; groupSize <= 8; groupSize++) {
      let matches = 0
      const total = Math.floor(variations.length / groupSize)

      for (let group = 0; group < total - 1; group++) {
        let groupMatch = true
        for (let i = 0; i < groupSize && (group * groupSize + i + groupSize) < variations.length; i++) {
          const diff = Math.abs(variations[group * groupSize + i] - variations[group * groupSize + i + groupSize])
          if (diff > 0.2) { // Allow 20% variation
            groupMatch = false
            break
          }
        }
        if (groupMatch) matches++
      }

      if (matches > 0) {
        groupings.push({ size: groupSize, strength: matches / total })
      }
    }

    return groupings.sort((a, b) => b.strength - a.strength)
  }

  classifyMeter(groupings) {
    if (groupings.length === 0) {
      return '4/4' // Default
    }

    const strongest = groupings[0]

    // Map grouping sizes to meters
    const meterMap = {
      2: ['2/4', '6/8'],
      3: ['3/4', '3/8'],
      4: ['4/4'],
      5: ['5/4'],
      6: ['6/8', '12/8'],
      7: ['7/8', '7/4']
    }

    const possibleMeters = meterMap[strongest.size] || ['4/4']

    // Choose based on energy (faster for high energy)
    if (this.currentStyle.energy > 0.7) {
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
      intervals.push(currTime - prevTime)
    }

    // Look for long-short patterns (2:1 ratio indicates swing)
    let swingPairs = 0
    let totalPairs = 0

    for (let i = 0; i < intervals.length - 1; i += 2) {
      if (i + 1 < intervals.length) {
        const long = intervals[i]
        const short = intervals[i + 1]
        const ratio = long / short

        // Swing is typically around 2:1 or 3:1 ratio
        if (ratio >= 1.5 && ratio <= 3.5) {
          swingPairs++
        }
        totalPairs++
      }
    }

    return totalPairs > 0 ? swingPairs / totalPairs : 0
  }

  detectSyncopation(gestures) {
    // Syncopation: accents on weak beats
    if (gestures.length < 4) return 0

    // Simple syncopation detection based on velocity variations
    const velocities = gestures.map(g => g.velocity || g.properties?.velocity || 50)
    const avgVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length

    // Count accents (velocities above average)
    const accents = velocities.map((v, i) => ({
      index: i,
      velocity: v,
      isAccent: v > avgVelocity * 1.2
    }))

    // Check if accents fall on "off-beats" (odd indices in 4/4)
    let syncopatedAccents = 0
    let totalAccents = accents.filter(a => a.isAccent).length

    accents.forEach((accent, i) => {
      if (accent.isAccent && i % 2 === 1) { // Off-beat
        syncopatedAccents++
      }
    })

    return totalAccents > 0 ? syncopatedAccents / totalAccents : 0
  }

  detectRhythmicRegularity(gestures) {
    // How regular are the timing patterns?
    if (gestures.length < 3) return 0.5

    const intervals = []
    for (let i = 1; i < gestures.length; i++) {
      const prevTime = gestures[i - 1].timestamp || Date.now() - 500
      const currTime = gestures[i].timestamp || Date.now()
      intervals.push(currTime - prevTime)
    }

    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length
    const standardDeviation = Math.sqrt(variance)

    // Regularity is inverse of coefficient of variation
    const coefficientOfVariation = standardDeviation / avgInterval
    return Math.max(0, 1 - coefficientOfVariation)
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
    if (Math.abs(overallDirection) < 0.1) {
      if (peaks > valleys) return 'wave'
      if (valleys > peaks) return 'inverted_wave'
      return 'static'
    }

    if (overallDirection > 0.2) return 'ascending' // Going up in pitch
    if (overallDirection < -0.2) return 'descending' // Going down in pitch

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
    // Chromaticism based on complex gesture paths
    if (gestures.length < 3) return 0

    // Calculate path complexity
    let totalTurns = 0
    for (let i = 1; i < gestures.length - 1; i++) {
      const prev = gestures[i - 1].position || { x: 0, y: 0 }
      const curr = gestures[i].position || { x: 0, y: 0 }
      const next = gestures[i + 1].position || { x: 0, y: 0 }

      // Calculate turn angle
      const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x)
      const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x)
      const turnAngle = Math.abs(angle2 - angle1)

      if (turnAngle > Math.PI / 4) { // 45 degree turn
        totalTurns++
      }
    }

    return Math.min(1, totalTurns / gestures.length)
  }

  calculateDissonance(gestures) {
    // Dissonance based on gesture irregularity and tension
    if (gestures.length < 2) return 0.2

    // Calculate velocity irregularity
    const velocities = gestures.map(g => g.velocity || g.properties?.velocity || 50)
    const avgVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length
    const velocityVariance = velocities.reduce((sum, v) => sum + Math.pow(v - avgVelocity, 2), 0) / velocities.length

    // Calculate acceleration changes
    const accelerations = gestures.map(g => Math.abs(g.acceleration || g.properties?.acceleration || 0))
    const avgAcceleration = accelerations.reduce((sum, a) => sum + a, 0) / accelerations.length

    // Combine factors
    const velocityIrregularity = Math.min(1, velocityVariance / 1000)
    const accelerationTension = Math.min(1, avgAcceleration / 50)

    return (velocityIrregularity * 0.6 + accelerationTension * 0.4)
  }

  detectModalFlavor(gestures) {
    // Simple modal detection based on gesture character
    const energy = this.calculateEnergy(gestures)
    const contour = this.detectContour(gestures)

    // Map gesture character to modal flavor
    if (energy > 0.7) {
      return contour === 'ascending' ? 'major' : 'mixolydian'
    } else if (energy < 0.3) {
      return contour === 'descending' ? 'aeolian' : 'phrygian'
    } else {
      return 'dorian'
    }
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

    // Ambient: low energy, slow tempo, regular rhythm
    weights.ambient += (1 - energy) * 0.3
    weights.ambient += (tempo < 80 ? 0.3 : 0)
    weights.ambient += rhythmicCharacter.regularity * 0.2

    // Rhythmic: high energy, regular rhythm, strong tempo
    weights.rhythmic += energy * 0.3
    weights.rhythmic += rhythmicCharacter.regularity * 0.3
    weights.rhythmic += (tempo > 120 ? 0.2 : 0)

    // Melodic: clear contours, balanced intervals
    weights.melodic += melodicCharacter.intervalProfile.step * 0.3
    weights.melodic += (melodicCharacter.contourType !== 'complex' ? 0.3 : 0)

    // Experimental: high chromaticism, irregular rhythm
    weights.experimental += harmonicComplexity.chromaticism * 0.4
    weights.experimental += (1 - rhythmicCharacter.regularity) * 0.3

    // Jazz: swing feel, moderate complexity
    weights.jazz += rhythmicCharacter.swing * 0.4
    weights.jazz += harmonicComplexity.dissonance * 0.2
    weights.jazz += (tempo >= 100 && tempo <= 140 ? 0.2 : 0)

    // Classical: smooth contours, moderate tempo
    weights.classical += (melodicCharacter.contourType === 'arch' || melodicCharacter.contourType === 'wave') * 0.3
    weights.classical += (tempo >= 60 && tempo <= 120 ? 0.3 : 0)
    weights.classical += (1 - rhythmicCharacter.syncopation) * 0.2

    // Electronic: regular rhythm, moderate to high energy
    weights.electronic += rhythmicCharacter.regularity * 0.3
    weights.electronic += (energy > 0.5 ? 0.2 : 0)
    weights.electronic += rhythmicCharacter.syncopation * 0.2

    // Rock: high energy, strong rhythm
    weights.rock += energy * 0.4
    weights.rock += (tempo >= 100 && tempo <= 160 ? 0.3 : 0)
    weights.rock += rhythmicCharacter.regularity * 0.2

    // Normalize weights to sum to 1
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0)
    if (total > 0) {
      Object.keys(weights).forEach(key => {
        weights[key] /= total
      })
    }

    return weights
  }

  evolveStyle(currentStyle, newAnalysis) {
    // Smooth evolution to avoid abrupt style changes
    const evolved = {}

    Object.keys(newAnalysis).forEach(key => {
      if (typeof newAnalysis[key] === 'object' && !Array.isArray(newAnalysis[key])) {
        evolved[key] = {}
        Object.keys(newAnalysis[key]).forEach(subKey => {
          const current = currentStyle[key]?.[subKey] || newAnalysis[key][subKey]
          evolved[key][subKey] = current * this.smoothingFactor + newAnalysis[key][subKey] * (1 - this.smoothingFactor)
        })
      } else {
        const current = currentStyle[key] || newAnalysis[key]
        evolved[key] = current * this.smoothingFactor + newAnalysis[key] * (1 - this.smoothingFactor)
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