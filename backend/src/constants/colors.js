/**
 * Color Constants
 * Single source of truth for all color assignments
 *
 * CRITICAL: Virtual user colors and real user colors must NEVER overlap
 */

// Virtual user colors - semantically tied to data sources
const VIRTUAL_USER_COLORS = {
  wikipedia: '#e41a1c', // Red (Wikipedia brand association)
  hackernews: '#ff7f00', // Orange (HN brand color)
  github: '#377eb8' // Blue (GitHub brand association)
}

// Real user color pool - completely separate from virtual users
// 7 colors for max 4 real users (buffer for race condition during refresh)
// Similar pattern to 8 slots for 4 max users in Room.js
const REAL_USER_COLOR_POOL = [
  '#4daf4a', // Verde
  '#984ea3', // Viola
  '#ffff33', // Giallo
  '#e7298a', // Magenta
  '#f781bf', // Rosa
  '#999999', // Grigio
  '#66c2a5' // Teal
]

module.exports = {
  VIRTUAL_USER_COLORS,
  REAL_USER_COLOR_POOL
}
