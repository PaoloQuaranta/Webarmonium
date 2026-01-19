/**
 * Color Constants
 * Single source of truth for all color assignments
 *
 * CRITICAL: Virtual user colors and real user colors must NEVER overlap
 * Electric Triad palette: metrics at 330°/195°/270°, users at intermediate hues
 */

// Virtual user colors - Electric Triad (magenta/cyan/viola)
const VIRTUAL_USER_COLORS = {
  wikipedia: '#ff2d92', // Magenta (330°)
  hackernews: '#00d4ff', // Cyan (195°)
  github: '#a855f7' // Viola (270°)
}

// Real user color pool - hue intermedi (~30° gap from metrics)
// 7 colors for max 4 real users (buffer for race condition during refresh)
const REAL_USER_COLOR_POOL = [
  '#a3e635', // Verde lime (80°)
  '#fb923c', // Arancio (30°)
  '#2dd4bf', // Teal (165°)
  '#facc15', // Giallo (50°)
  '#f472b6', // Rosa soft (350°)
  '#38bdf8', // Azzurro (200°)
  '#22c55e' // Verde neon (140°)
]

module.exports = {
  VIRTUAL_USER_COLORS,
  REAL_USER_COLOR_POOL
}
