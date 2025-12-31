/**
 * VisualUtils.js
 * Shared utility functions for visualization
 */

/**
 * Linear interpolation
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * Clamp value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum bound
 * @param {number} max - Maximum bound
 * @returns {number} Clamped value
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

/**
 * Map value from one range to another
 * @param {number} value - Input value
 * @param {number} inMin - Input range minimum
 * @param {number} inMax - Input range maximum
 * @param {number} outMin - Output range minimum
 * @param {number} outMax - Output range maximum
 * @returns {number} Mapped value
 */
function mapRange(value, inMin, inMax, outMin, outMax) {
  return (value - inMin) * (outMax - outMin) / (inMax - inMin) + outMin
}

/**
 * Convert hex color to RGB object
 * @param {string} hex - Hex color string (with or without #)
 * @returns {Object} {r, g, b} values (0-255)
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 }
}

/**
 * Convert RGB to hex color
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @returns {string} Hex color string
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

/**
 * Convert hex to RGB array
 * @param {string} hex - Hex color string
 * @returns {Array} [r, g, b] values
 */
function hexToRgbArray(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [255, 255, 255]
}

/**
 * Calculate distance between two points
 * @param {number} x1 - First point X
 * @param {number} y1 - First point Y
 * @param {number} x2 - Second point X
 * @param {number} y2 - Second point Y
 * @returns {number} Euclidean distance
 */
function distance(x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Calculate angle between two points
 * @param {number} x1 - First point X
 * @param {number} y1 - First point Y
 * @param {number} x2 - Second point X
 * @param {number} y2 - Second point Y
 * @returns {number} Angle in radians
 */
function angle(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1)
}

/**
 * Calculate point on quadratic Bezier curve
 * @param {number} x0 - Start point X
 * @param {number} y0 - Start point Y
 * @param {number} x1 - Control point X
 * @param {number} y1 - Control point Y
 * @param {number} x2 - End point X
 * @param {number} y2 - End point Y
 * @param {number} t - Parameter (0-1)
 * @returns {Object} {x, y} position on curve
 */
function quadraticBezier(x0, y0, x1, y1, x2, y2, t) {
  const mt = 1 - t
  const x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2
  const y = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2
  return { x, y }
}

/**
 * Calculate point on cubic Bezier curve
 * @param {number} x0 - Start point X
 * @param {number} y0 - Start point Y
 * @param {number} x1 - First control point X
 * @param {number} y1 - First control point Y
 * @param {number} x2 - Second control point X
 * @param {number} y2 - Second control point Y
 * @param {number} x3 - End point X
 * @param {number} y3 - End point Y
 * @param {number} t - Parameter (0-1)
 * @returns {Object} {x, y} position on curve
 */
function cubicBezier(x0, y0, x1, y1, x2, y2, x3, y3, t) {
  const mt = 1 - t
  const x = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3
  const y = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3
  return { x, y }
}

/**
 * Ease in-out function
 * @param {number} t - Input value (0-1)
 * @returns {number} Eased value
 */
function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}

/**
 * Smooth step function
 * @param {number} edge0 - Lower edge
 * @param {number} edge1 - Upper edge
 * @param {number} x - Input value
 * @returns {number} Smoothed value
 */
function smoothStep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Generate unique ID
 * @param {string} prefix - ID prefix
 * @returns {string} Unique identifier
 */
function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Format color with alpha
 * @param {string} hexColor - Hex color string
 * @param {number} alpha - Alpha value (0-1)
 * @returns {string} RGBA color string
 */
function colorWithAlpha(hexColor, alpha) {
  const rgb = hexToRgb(hexColor)
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

/**
 * Calculate perpendicular offset point
 * @param {number} x1 - Start point X
 * @param {number} y1 - Start point Y
 * @param {number} x2 - End point X
 * @param {number} y2 - End point Y
 * @param {number} offset - Offset distance
 * @returns {Object} {x, y} perpendicular offset point
 */
function perpendicularOffset(x1, y1, x2, y2, offset) {
  const dx = x2 - x1
  const dy = y2 - y1
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  return {
    x: midX - dy * offset,
    y: midY + dx * offset
  }
}

/**
 * Calculate midpoint between two points
 * @param {number} x1 - First point X
 * @param {number} y1 - First point Y
 * @param {number} x2 - Second point X
 * @param {number} y2 - Second point Y
 * @returns {Object} {x, y} midpoint
 */
function midpoint(x1, y1, x2, y2) {
  return {
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2
  }
}

/**
 * Normalize a vector
 * @param {number} x - X component
 * @param {number} y - Y component
 * @returns {Object} Normalized {x, y}
 */
function normalize(x, y) {
  const len = Math.sqrt(x * x + y * y)
  if (len === 0) return { x: 0, y: 0 }
  return { x: x / len, y: y / len }
}

// Export functions
if (typeof window !== 'undefined') {
  window.VisualUtils = {
    lerp,
    clamp,
    mapRange,
    hexToRgb,
    rgbToHex,
    hexToRgbArray,
    distance,
    angle,
    quadraticBezier,
    cubicBezier,
    easeInOut,
    smoothStep,
    generateId,
    colorWithAlpha,
    perpendicularOffset,
    midpoint,
    normalize
  }
  // console.log('✅ VisualUtils exported to window')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    lerp,
    clamp,
    mapRange,
    hexToRgb,
    rgbToHex,
    hexToRgbArray,
    distance,
    angle,
    quadraticBezier,
    cubicBezier,
    easeInOut,
    smoothStep,
    generateId,
    colorWithAlpha,
    perpendicularOffset,
    midpoint,
    normalize
  }
}
