/**
 * DevelopmentTechniques.js - Entry #169
 *
 * Implements classical thematic development techniques:
 * - Statement: Original theme (no transformation)
 * - Repetition: Exact or near-exact repeat
 * - Variation: Rhythmic/melodic changes while preserving contour
 * - Sequence: Transposition at interval
 * - Fragmentation: Using parts of theme
 * - Augmentation: Double durations (slower)
 * - Diminution: Halve durations (faster)
 * - Inversion: Melodic direction reversed
 * - Retrograde: Theme backwards
 *
 * These techniques transform raw gesture contours before quantization.
 */

const PHI = 1.618033988749895

/**
 * Apply a development technique to a contour
 * Fix #4: Returns null for invalid input instead of default contour
 * @param {Array} contour - Array of {pitch, time, intensity} points (0-1 range)
 * @param {string} technique - Development technique name
 * @param {Object} options - Additional options
 * @returns {Array|null} Transformed contour, or null if input is invalid
 */
function applyTechnique(contour, technique, options = {}) {
  // Fix #4: Return null for invalid input to signal missing data explicitly
  if (!contour || !Array.isArray(contour) || contour.length === 0) {
    return null
  }

  switch (technique) {
    case 'statement':
      return statement(contour, options)
    case 'repetition':
      return repetition(contour, options)
    case 'variation':
      return variation(contour, options)
    case 'sequence':
      return sequence(contour, options)
    case 'fragmentation':
      return fragmentation(contour, options)
    case 'augmentation':
      return augmentation(contour, options)
    case 'diminution':
      return diminution(contour, options)
    case 'inversion':
      return inversion(contour, options)
    case 'retrograde':
      return retrograde(contour, options)
    case 'retrograde_inversion':
      return retrogradeInversion(contour, options)
    default:
      return statement(contour, options)
  }
}

/**
 * Statement - Original theme without transformation
 */
function statement(contour, options = {}) {
  return contour.map(point => ({ ...point }))
}

/**
 * Repetition - Exact or near-exact repeat
 * Can have slight variations in intensity
 */
function repetition(contour, options = {}) {
  const variation = options.variation ?? 0.05

  return contour.map(point => ({
    ...point,
    intensity: point.intensity + (Math.random() - 0.5) * variation * 2
  }))
}

/**
 * Variation - Modify rhythm and melody while preserving contour shape
 * Adds neighbor tones, passing tones, ornaments
 */
function variation(contour, options = {}) {
  const complexity = options.complexity ?? 0.5
  const result = []

  for (let i = 0; i < contour.length; i++) {
    const point = contour[i]

    // Decide whether to add ornamentation
    const addOrnament = Math.random() < complexity * 0.4

    if (addOrnament && i > 0) {
      // Add neighbor tone or passing tone
      const prevPitch = contour[i - 1].pitch
      const currentPitch = point.pitch
      const ornamentType = Math.random()

      if (ornamentType < 0.3) {
        // Upper neighbor
        result.push({
          pitch: Math.min(1, currentPitch + 0.05),
          time: point.time - 0.02,
          intensity: point.intensity * 0.8
        })
      } else if (ornamentType < 0.6) {
        // Lower neighbor
        result.push({
          pitch: Math.max(0, currentPitch - 0.05),
          time: point.time - 0.02,
          intensity: point.intensity * 0.8
        })
      } else {
        // Passing tone
        result.push({
          pitch: (prevPitch + currentPitch) / 2,
          time: (contour[i - 1].time + point.time) / 2,
          intensity: point.intensity * 0.7
        })
      }
    }

    // Add the main note with slight pitch variation
    result.push({
      pitch: point.pitch + (Math.random() - 0.5) * 0.03,
      time: point.time,
      intensity: point.intensity * (0.9 + Math.random() * 0.2)
    })
  }

  return normalizeTime(result)
}

/**
 * Sequence - Transpose the contour by an interval
 * Can repeat at different pitch levels
 */
function sequence(contour, options = {}) {
  const interval = options.interval ?? 0.1 // Default: roughly a major second
  const repetitions = options.repetitions ?? 2
  const direction = options.direction ?? 'up' // 'up' or 'down'

  const result = []

  for (let rep = 0; rep < repetitions; rep++) {
    const offset = direction === 'up' ? interval * rep : -interval * rep
    const timeOffset = rep / repetitions

    contour.forEach(point => {
      result.push({
        pitch: clamp(point.pitch + offset, 0, 1),
        time: (point.time / repetitions) + timeOffset,
        intensity: point.intensity * (1 - rep * 0.1) // Slightly softer each rep
      })
    })
  }

  return normalizeTime(result)
}

/**
 * Fragmentation - Use only part of the theme
 * Can take beginning, end, or middle fragment
 */
function fragmentation(contour, options = {}) {
  const fragmentType = options.fragmentType ?? 'beginning' // 'beginning', 'end', 'middle', 'motive'
  const fragmentSize = options.fragmentSize ?? 0.5 // Proportion of original

  const len = contour.length
  const fragLen = Math.max(2, Math.ceil(len * fragmentSize))

  let fragment

  switch (fragmentType) {
    case 'beginning':
      fragment = contour.slice(0, fragLen)
      break
    case 'end':
      fragment = contour.slice(-fragLen)
      break
    case 'middle':
      const start = Math.floor((len - fragLen) / 2)
      fragment = contour.slice(start, start + fragLen)
      break
    case 'motive':
      // Find the most distinctive part (highest pitch variance)
      let maxVariance = 0
      let motiveStart = 0

      for (let i = 0; i <= len - fragLen; i++) {
        const segment = contour.slice(i, i + fragLen)
        const variance = calculateVariance(segment.map(p => p.pitch))
        if (variance > maxVariance) {
          maxVariance = variance
          motiveStart = i
        }
      }
      fragment = contour.slice(motiveStart, motiveStart + fragLen)
      break
    default:
      fragment = contour.slice(0, fragLen)
  }

  // Optionally repeat the fragment
  if (options.repeat) {
    const repeated = []
    const reps = options.repeatCount ?? 2

    for (let i = 0; i < reps; i++) {
      fragment.forEach((point, idx) => {
        repeated.push({
          ...point,
          time: (point.time / reps) + (i / reps),
          intensity: point.intensity * (1 - i * 0.05)
        })
      })
    }
    return normalizeTime(repeated)
  }

  return normalizeTime(fragment)
}

/**
 * Augmentation - Double the duration (make it slower)
 * Notes are sustained longer
 */
function augmentation(contour, options = {}) {
  const factor = options.factor ?? 2.0

  // Simply stretch the time values
  // The actual duration will be determined later in phrase generation
  return contour.map(point => ({
    ...point,
    time: point.time, // Time stays 0-1, but fewer notes will fit
    intensity: point.intensity * 1.1 // Slightly louder for emphasis
  }))
}

/**
 * Diminution - Halve the duration (make it faster)
 * More notes in the same time
 */
function diminution(contour, options = {}) {
  const factor = options.factor ?? 0.5

  // Add interpolated notes to increase density
  const result = []

  for (let i = 0; i < contour.length - 1; i++) {
    const current = contour[i]
    const next = contour[i + 1]

    result.push({ ...current })

    // Add midpoint
    result.push({
      pitch: (current.pitch + next.pitch) / 2,
      time: (current.time + next.time) / 2,
      intensity: (current.intensity + next.intensity) / 2 * 0.9
    })
  }

  // Add last point
  result.push({ ...contour[contour.length - 1] })

  return normalizeTime(result)
}

/**
 * Inversion - Flip the melodic direction
 * What went up now goes down, and vice versa
 */
function inversion(contour, options = {}) {
  // Find the axis of inversion (can be first note, middle, or specified)
  const axis = options.axis ?? contour[0].pitch

  return contour.map(point => ({
    ...point,
    pitch: clamp(2 * axis - point.pitch, 0, 1)
  }))
}

/**
 * Retrograde - Play the theme backwards
 */
function retrograde(contour, options = {}) {
  const reversed = [...contour].reverse()

  // Adjust time values to maintain proper ordering
  return reversed.map((point, i) => ({
    ...point,
    time: i / (reversed.length - 1 || 1)
  }))
}

/**
 * Retrograde Inversion - Both backwards and inverted
 */
function retrogradeInversion(contour, options = {}) {
  const inverted = inversion(contour, options)
  return retrograde(inverted, options)
}

// ============================================================================
// Combined/Advanced Techniques
// ============================================================================

/**
 * Apply multiple techniques in sequence
 * @param {Array} contour
 * @param {Array} techniques - Array of {technique, options}
 * @returns {Array}
 */
function applyMultipleTechniques(contour, techniques) {
  let result = contour

  for (const { technique, options } of techniques) {
    result = applyTechnique(result, technique, options)
  }

  return result
}

// Fix #14: Refactored to use cleaner lookup table structure
// Each entry is [threshold, technique] sorted by threshold descending
const ROLE_TECHNIQUE_PROGRESSIONS = {
  exposition: [
    [0.8, 'statement'],
    [0.5, 'repetition'],
    [0.0, 'statement']
  ],
  development: [
    [0.9, 'inversion'],
    [0.66, 'sequence'],
    [0.33, 'fragmentation'],
    [0.0, 'variation']
  ],
  recapitulation: [
    [0.9, 'augmentation'],
    [0.5, 'statement'],
    [0.0, 'variation']
  ],
  transition: [
    [0.8, 'diminution'],
    [0.5, 'sequence'],
    [0.0, 'fragmentation']
  ],
  coda: [
    [0.8, 'statement'],
    [0.5, 'augmentation'],
    [0.0, 'fragmentation']
  ]
}

/**
 * Get a technique progression for a thematic role
 * Fix #14: Refactored for clarity using lookup table
 * @param {string} role - Thematic role (exposition, development, etc.)
 * @param {number} progress - Progress within section (0-1)
 * @returns {string} Recommended technique
 */
function getTechniqueForRole(role, progress) {
  const progressions = ROLE_TECHNIQUE_PROGRESSIONS[role] || ROLE_TECHNIQUE_PROGRESSIONS.exposition

  for (const [threshold, technique] of progressions) {
    if (progress >= threshold) {
      return technique
    }
  }

  return 'statement'
}

/**
 * Get technique complexity score
 * Higher = more elaborate transformation
 * @param {string} technique
 * @returns {number} 0-1
 */
function getTechniqueComplexity(technique) {
  const complexityMap = {
    statement: 0.1,
    repetition: 0.2,
    variation: 0.5,
    sequence: 0.6,
    fragmentation: 0.4,
    augmentation: 0.3,
    diminution: 0.4,
    inversion: 0.7,
    retrograde: 0.8,
    retrograde_inversion: 0.9
  }

  return complexityMap[technique] ?? 0.5
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize time values to 0-1 range
 */
function normalizeTime(contour) {
  if (contour.length === 0) return contour
  if (contour.length === 1) {
    return [{ ...contour[0], time: 0 }]
  }

  const times = contour.map(p => p.time)
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const range = maxTime - minTime || 1

  return contour.map(point => ({
    ...point,
    time: (point.time - minTime) / range
  }))
}

/**
 * Clamp value between min and max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/**
 * Calculate variance of an array of numbers
 */
function calculateVariance(values) {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
}

/**
 * Smooth a contour to reduce jaggedness
 */
function smoothContour(contour, windowSize = 3) {
  if (contour.length <= windowSize) return contour

  const result = []
  const half = Math.floor(windowSize / 2)

  for (let i = 0; i < contour.length; i++) {
    let sumPitch = 0
    let sumIntensity = 0
    let count = 0

    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < contour.length) {
        sumPitch += contour[j].pitch
        sumIntensity += contour[j].intensity
        count++
      }
    }

    result.push({
      pitch: sumPitch / count,
      time: contour[i].time,
      intensity: sumIntensity / count
    })
  }

  return result
}

/**
 * Resample contour to specific number of points
 * Fix #4: Handle null/empty input
 * Fix #11: Added array bounds protection
 */
function resampleContour(contour, targetLength) {
  // Fix #4: Handle null/invalid input
  if (!contour || !Array.isArray(contour) || contour.length === 0) return []
  if (targetLength < 1) return []
  if (contour.length === targetLength) return contour.map(p => ({ ...p }))
  if (targetLength === 1) return [{ ...contour[0], time: 0 }]

  const result = []
  // Fix #11: Ensure safe access to contour array
  const maxIdx = contour.length - 1

  for (let i = 0; i < targetLength; i++) {
    const t = i / (targetLength - 1)

    // Find surrounding points
    let p1, p2
    for (let j = 0; j < maxIdx; j++) {
      if (contour[j].time <= t && contour[j + 1].time >= t) {
        p1 = contour[j]
        p2 = contour[j + 1]
        break
      }
    }

    // Fix #11: Safe fallback with bounds checking
    if (!p1) p1 = contour[0]
    if (!p2) p2 = contour[Math.min(maxIdx, contour.length - 1)]

    // Interpolate
    const localT = p2.time === p1.time ? 0 : (t - p1.time) / (p2.time - p1.time)
    // Fix #11: Clamp localT to prevent extrapolation
    const clampedT = Math.max(0, Math.min(1, localT))

    result.push({
      pitch: p1.pitch + (p2.pitch - p1.pitch) * clampedT,
      time: t,
      intensity: p1.intensity + (p2.intensity - p1.intensity) * clampedT
    })
  }

  return result
}

module.exports = {
  applyTechnique,
  applyMultipleTechniques,
  getTechniqueForRole,
  getTechniqueComplexity,
  statement,
  repetition,
  variation,
  sequence,
  fragmentation,
  augmentation,
  diminution,
  inversion,
  retrograde,
  retrogradeInversion,
  smoothContour,
  resampleContour,
  normalizeTime
}
