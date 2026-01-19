/**
 * Color Constants
 * Single source of truth for all color assignments in frontend
 * Mirrors backend/src/constants/colors.js for consistency
 *
 * CRITICAL: Virtual user colors and real user colors must NEVER overlap
 * Electric Triad palette: metrics at 330°/195°/270°, users at intermediate hues
 */

// Virtual user colors - Electric Triad (magenta/cyan/viola)
export const VIRTUAL_USER_COLORS = {
  wikipedia: '#ff2d92', // Magenta (330°)
  hackernews: '#00d4ff', // Cyan (195°)
  github: '#a855f7' // Viola (270°)
}

// Real user color pool - intermediate hues (~30° gap from metrics)
// 7 colors for max 4 real users (buffer for race condition during refresh)
export const REAL_USER_COLOR_POOL = [
  '#a3e635', // Verde lime (80°)
  '#fb923c', // Arancio (30°)
  '#2dd4bf', // Teal (165°) - also used as accent/default
  '#facc15', // Giallo (50°)
  '#f472b6', // Rosa soft (350°)
  '#38bdf8', // Azzurro (200°)
  '#22c55e' // Verde neon (140°)
]

// UI Colors
export const UI_COLORS = {
  accent: '#2dd4bf', // Teal - primary accent color
  accentRgb: { r: 45, g: 212, b: 191 }, // Pre-computed RGB for performance
  background: '#020208', // Deep void black
  localUserDefault: '#22c55e' // Green for local user
}

// Default colors for various components
export const DEFAULT_COLORS = {
  trail: '#2dd4bf', // Teal
  trailRgb: { r: 45, g: 212, b: 191 },
  cursor: '#22c55e', // Green
  cursorRgb: { r: 34, g: 197, b: 94 }
}

// Export all as single object for convenience
export const COLORS = {
  VIRTUAL_USERS: VIRTUAL_USER_COLORS,
  REAL_USERS: {
    pool: REAL_USER_COLOR_POOL,
    default: UI_COLORS.localUserDefault
  },
  UI: UI_COLORS,
  DEFAULTS: DEFAULT_COLORS
}

// Also expose on window for non-module scripts
if (typeof window !== 'undefined') {
  window.ColorConstants = COLORS
}

export default COLORS
