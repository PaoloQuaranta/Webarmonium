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
  experimental: 1.1
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
  experimental: 1.0
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

module.exports = {
  GENRE_VELOCITY_MULTIPLIERS,
  GENRE_DENSITY_MULTIPLIERS,
  GENRE_BPM_RANGES,
  getGenreVelocityMultiplier,
  getGenreDensityMultiplier
}
