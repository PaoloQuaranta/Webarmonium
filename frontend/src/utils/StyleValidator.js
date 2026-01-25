/**
 * StyleValidator.js - Frontend style object validation
 * Entry #183: Validate style objects before applying to audio services
 */

/**
 * Validate that a style object has required fields for audio playback
 * @param {Object} style - Style object to validate
 * @returns {boolean} True if style is valid and usable
 */
export function isValidStyle(style) {
  return style &&
         typeof style === 'object' &&
         (style.dominantGenre || style.forcedGenre) &&
         Object.keys(style).length > 0
}

/**
 * Get a safe genre from style object with fallback
 * @param {Object} style - Style object
 * @param {string} [fallback='ambient'] - Fallback genre if none found
 * @returns {string} Genre name
 */
export function getGenreFromStyle(style, fallback = 'ambient') {
  if (!style || typeof style !== 'object') return fallback
  return style.forcedGenre || style.dominantGenre || fallback
}

/**
 * Normalize a style object to ensure all expected fields exist
 * @param {Object} style - Style object to normalize
 * @returns {Object} Normalized style object with defaults
 */
export function normalizeStyle(style) {
  if (!style || typeof style !== 'object') {
    return {
      genreWeights: {},
      dominantGenre: 'ambient',
      forcedGenre: 'ambient',
      energy: 0.5,
      currentBPM: undefined,
      synthParams: {}
    }
  }

  const genre = style.forcedGenre || style.dominantGenre || 'ambient'

  return {
    genreWeights: style.genreWeights || {},
    dominantGenre: genre,
    forcedGenre: genre,
    energy: typeof style.energy === 'number' ? style.energy : 0.5,
    currentBPM: style.currentBPM,
    synthParams: style.synthParams || {}
  }
}
