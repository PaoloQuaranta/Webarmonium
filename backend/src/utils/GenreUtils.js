/**
 * GenreUtils - Shared utility functions for genre-based calculations
 * Entry #175: Extracted from duplicate implementations across services
 */

/**
 * Genre-based velocity multipliers
 * Lower values for calm genres, higher for energetic
 */
const GENRE_VELOCITY_MULTIPLIERS = {
  ambient: 0.6,
  classical: 0.8,
  jazz: 1.0,
  melodic: 1.0,
  electronic: 1.2,
  rhythmic: 1.2,
  rock: 1.4,
  experimental: 1.1,
  pop: 1.0  // Entry #213: Sync with GenreCharacteristics
}

/**
 * Genre-based density multipliers for note generation
 */
const GENRE_DENSITY_MULTIPLIERS = {
  ambient: 0.7,
  classical: 0.9,
  jazz: 1.1,
  melodic: 1.0,
  electronic: 1.2,
  rhythmic: 1.3,
  rock: 1.3,
  experimental: 1.0,
  pop: 1.0  // Entry #213: Sync with GenreCharacteristics
}

/**
 * Entry #179: Genre-based BPM ranges for style cycling
 * Each genre has a characteristic tempo range
 */
const GENRE_BPM_RANGES = {
  ambient:      { min: 60,  max: 90,  default: 75 },
  classical:    { min: 70,  max: 110, default: 90 },
  melodic:      { min: 80,  max: 120, default: 100 },
  jazz:         { min: 90,  max: 150, default: 120 },
  electronic:   { min: 115, max: 150, default: 130 },
  rhythmic:     { min: 110, max: 160, default: 135 },
  rock:         { min: 100, max: 150, default: 125 },
  experimental: { min: 60,  max: 180, default: 100 },
  pop:          { min: 90,  max: 130, default: 110 }
}

/**
 * Get velocity multiplier based on style's dominant genre
 * @param {Object} style - Style object with dominantGenre property
 * @returns {number} Velocity multiplier (0.6-1.4)
 */
function getGenreVelocityMultiplier(style) {
  const genre = style?.dominantGenre
  return GENRE_VELOCITY_MULTIPLIERS[genre] || 1.0
}

/**
 * Get density multiplier based on style's dominant genre
 * @param {Object} style - Style object with dominantGenre property
 * @returns {number} Density multiplier (0.7-1.3)
 */
function getGenreDensityMultiplier(style) {
  const genre = style?.dominantGenre
  return GENRE_DENSITY_MULTIPLIERS[genre] || 1.0
}

/**
 * Entry #210/#213: All valid genres (must match GENRE_BPM_RANGES keys and GenreCharacteristics)
 * Used for validation and synthetic weight generation
 */
const ALL_GENRES = ['ambient', 'classical', 'melodic', 'jazz', 'electronic', 'rhythmic', 'rock', 'experimental', 'pop']

/**
 * Entry #210: Create synthetic genre weights with 100% for a single genre
 * Used for manual override to bypass all weight-based decisions
 * @param {string} genre - Genre to set at 100% weight
 * @param {string[]} [genreList] - Optional list of genres (defaults to ALL_GENRES)
 * @returns {Object} Synthetic weights object with all genres at 0 except specified at 1.0
 * @example
 * createSyntheticGenreWeights('jazz')
 * // Returns: { ambient: 0, classical: 0, melodic: 0, jazz: 1.0, electronic: 0, ... }
 */
function createSyntheticGenreWeights(genre, genreList = ALL_GENRES) {
  const weights = {}
  genreList.forEach(g => { weights[g] = 0 })
  if (genreList.includes(genre)) {
    weights[genre] = 1.0
  }
  return weights
}

/**
 * Entry #210: Validate if a genre is valid
 * @param {string} genre - Genre to validate
 * @param {string[]} [genreList] - Optional list of valid genres
 * @returns {boolean} True if genre is valid
 */
function isValidGenre(genre, genreList = ALL_GENRES) {
  return typeof genre === 'string' && genreList.includes(genre)
}

module.exports = {
  GENRE_VELOCITY_MULTIPLIERS,
  GENRE_DENSITY_MULTIPLIERS,
  GENRE_BPM_RANGES,
  ALL_GENRES,
  getGenreVelocityMultiplier,
  getGenreDensityMultiplier,
  createSyntheticGenreWeights,
  isValidGenre
}
