/**
 * GestureConstants.js
 * Centralized gesture and UI constants for Webarmonium
 * Phase 3 refactoring - Extract magic numbers
 */

// Default Positions
const DEFAULT_POSITION = { x: 0.5, y: 0.5 }
const DEFAULT_COORDINATES = [0.5, 0.5]

// Performance Targets
const TARGET_FPS = 60
const UPDATE_INTERVAL_MS = 1000 / TARGET_FPS  // ~16.67ms

// Gesture Classification Thresholds
const GESTURE_THRESHOLDS = {
  minGestureLength: 20,       // pixels - minimum path length for classification
  minGestureDuration: 100,    // ms - minimum duration for gesture
  directionThreshold: 0.3,    // confidence threshold for direction classification
  maxReasonableSpeed: 1000    // pixels/second - max expected gesture speed
}

// Speed Classification
const SPEED_THRESHOLDS = {
  slow: 0.2,
  medium: 0.5,
  fast: 0.8
}

// Hold Detection
const HOLD_CONFIG = {
  holdThreshold: 100,         // ms - distinguishes tap from hold
  overlapDuration: 200        // ms - overlap when transitioning hold to drag
}

// Drag Streaming
const DRAG_CONFIG = {
  minDistanceForDrag: 15,     // pixels - minimum movement to activate drag
  defaultNoteInterval: 200,   // ms - default interval between streaming notes
  minNoteInterval: 31.25,     // ms - minimum interval (64th note at 120 BPM)
  maxNoteInterval: 2000       // ms - maximum interval (whole note)
}

// Hover Configuration
const HOVER_CONFIG = {
  hoverThreshold: 100,        // ms - throttle between hover updates
  defaultIntensity: 0.5,
  defaultVelocity: 0
}

// Gesture History
const HISTORY_CONFIG = {
  maxHistorySize: 50,
  recentGestureWindow: 5000   // ms - window for recent gestures
}

// Canvas/Input Configuration
const INPUT_CONFIG = {
  normalizedMin: 0,
  normalizedMax: 1,
  touchPreventDefault: true
}

// Direction Angle Mappings (degrees)
const DIRECTION_ANGLES = {
  right: { min: -22.5, max: 22.5 },
  diagonalDownRight: { min: 22.5, max: 67.5 },
  down: { min: 67.5, max: 112.5 },
  diagonalDownLeft: { min: 112.5, max: 157.5 },
  left: { min: 157.5, max: 180, altMin: -180, altMax: -157.5 },
  diagonalUpLeft: { min: -157.5, max: -112.5 },
  up: { min: -112.5, max: -67.5 },
  diagonalUpRight: { min: -67.5, max: -22.5 }
}

// Velocity to Note Interval Mapping
const VELOCITY_NOTE_MAP = [
  { threshold: 2.0, interval: 31.25, noteValue: '64n' },
  { threshold: 1.2, interval: 62.5, noteValue: '32n' },
  { threshold: 0.7, interval: 125, noteValue: '16n' },
  { threshold: 0.4, interval: 250, noteValue: '8n' },
  { threshold: 0.2, interval: 500, noteValue: '4n' },
  { threshold: 0.1, interval: 1000, noteValue: '2n' },
  { threshold: 0, interval: 2000, noteValue: '1n' }
]

// Articulation Patterns for Drag Streaming
const ARTICULATION_PATTERNS = {
  default: ['legato', 'marcato', 'staccato', 'legato', 'marcato', 'legato', 'staccato', 'marcato']
}

// Movement Detection
const MOVEMENT_CONFIG = {
  minMovementThreshold: 0.001,  // normalized units - minimum detectable movement
  movementSensitivity: 0.02    // threshold for direction detection
}

// Latency Requirements (Constitutional)
const LATENCY_REQUIREMENTS = {
  gestureToSound: 200,         // ms - max gesture to sound latency
  uiInteraction: 100,          // ms - max UI response time
  webSocketLatency: 100,       // ms - max WebSocket latency
  apiResponse: 200             // ms - max API p95 response time
}

// Event Types
const EVENT_TYPES = {
  mouse: 'mouse',
  touch: 'touch',
  unknown: 'unknown'
}

// Gesture Actions
const GESTURE_ACTIONS = {
  potentialTap: 'potential-tap',
  tap: 'tap',
  drag: 'drag',
  sustainedHold: 'sustained-hold'
}

/**
 * Get interval from normalized speed
 * @param {number} normalizedSpeed - Speed value (0-3)
 * @returns {Object} { interval, noteValue }
 */
function getIntervalFromSpeed(normalizedSpeed) {
  for (const mapping of VELOCITY_NOTE_MAP) {
    if (normalizedSpeed > mapping.threshold) {
      return { interval: mapping.interval, noteValue: mapping.noteValue }
    }
  }
  return VELOCITY_NOTE_MAP[VELOCITY_NOTE_MAP.length - 1]
}

/**
 * Calculate velocity magnitude from components
 * @param {number} vx - X velocity
 * @param {number} vy - Y velocity
 * @returns {number} Velocity magnitude
 */
function calculateVelocityMagnitude(vx, vy) {
  return Math.sqrt(vx * vx + vy * vy)
}

/**
 * Normalize speed to 0-3 range
 * @param {number} speed - Raw speed
 * @returns {number} Normalized speed (0-3)
 */
function normalizeSpeed(speed) {
  return Math.min(speed / 1000, 3)
}

/**
 * Check if movement exceeds threshold
 * @param {number} distance - Movement distance
 * @returns {boolean} True if movement is significant
 */
function isSignificantMovement(distance) {
  return distance > MOVEMENT_CONFIG.minMovementThreshold
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.GestureConstants = {
    // Positions
    DEFAULT_POSITION,
    DEFAULT_COORDINATES,

    // Performance
    TARGET_FPS,
    UPDATE_INTERVAL_MS,

    // Thresholds
    GESTURE_THRESHOLDS,
    SPEED_THRESHOLDS,

    // Configuration
    HOLD_CONFIG,
    DRAG_CONFIG,
    HOVER_CONFIG,
    HISTORY_CONFIG,
    INPUT_CONFIG,
    MOVEMENT_CONFIG,

    // Mappings
    DIRECTION_ANGLES,
    VELOCITY_NOTE_MAP,
    ARTICULATION_PATTERNS,

    // Requirements
    LATENCY_REQUIREMENTS,

    // Types
    EVENT_TYPES,
    GESTURE_ACTIONS,

    // Functions
    getIntervalFromSpeed,
    calculateVelocityMagnitude,
    normalizeSpeed,
    isSignificantMovement
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_POSITION,
    DEFAULT_COORDINATES,
    TARGET_FPS,
    UPDATE_INTERVAL_MS,
    GESTURE_THRESHOLDS,
    SPEED_THRESHOLDS,
    HOLD_CONFIG,
    DRAG_CONFIG,
    HOVER_CONFIG,
    HISTORY_CONFIG,
    INPUT_CONFIG,
    DIRECTION_ANGLES,
    VELOCITY_NOTE_MAP,
    ARTICULATION_PATTERNS,
    MOVEMENT_CONFIG,
    LATENCY_REQUIREMENTS,
    EVENT_TYPES,
    GESTURE_ACTIONS,
    getIntervalFromSpeed,
    calculateVelocityMagnitude,
    normalizeSpeed,
    isSignificantMovement
  }
}
