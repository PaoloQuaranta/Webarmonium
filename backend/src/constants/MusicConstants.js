/**
 * Music Constants
 * Centralized constants for musical and audio-related values
 */

// Default position for canvas interactions (center of normalized canvas)
const DEFAULT_POSITION = { x: 0.5, y: 0.5 }

// Default intensity for interactions
const DEFAULT_INTENSITY = 0.5

// MIDI value ranges
const MIDI = {
  MIN_VELOCITY: 0,
  MAX_VELOCITY: 127,
  MIN_NOTE: 0,
  MAX_NOTE: 127,
  MIDDLE_C: 60
}

// Tempo constraints
const TEMPO = {
  MIN_BPM: 60,
  MAX_BPM: 200,
  DEFAULT_BPM: 120
}

// Time signature
const TIME_SIGNATURE = {
  DEFAULT: '4/4'
}

// Gesture timeouts (in milliseconds)
const TIMEOUTS = {
  GESTURE_SAFETY: 4000,
  HEARTBEAT_INTERVAL: 30000,
  SESSION_TIMEOUT: 60000,
  BUFFER_CLEANUP: 10000
}

// Audio buffer sizes
const BUFFER = {
  MAX_HOVERS: 100,
  MAX_GESTURES: 50,
  MAX_PATTERN_MEMORY: 1000
}

// Canvas/position constraints
const CANVAS = {
  MIN_COORDINATE: 0,
  MAX_COORDINATE: 1
}

// Scaling factors commonly used in audio mapping
const SCALING = {
  PITCH_RANGE: 48,    // Semitones for pitch mapping
  PITCH_OFFSET: 36,   // Base MIDI note for pitch mapping
  VELOCITY_SCALE: 127 // Max MIDI velocity
}

// Constitutional latency requirements (milliseconds)
const LATENCY = {
  WEBSOCKET_MAX: 100,   // <100ms WebSocket latency requirement
  API_P95: 200,         // <200ms p95 API response time
  STROKE_BROADCAST: 1000 // Max stroke broadcast time
}

module.exports = {
  DEFAULT_POSITION,
  DEFAULT_INTENSITY,
  MIDI,
  TEMPO,
  TIME_SIGNATURE,
  TIMEOUTS,
  BUFFER,
  CANVAS,
  SCALING,
  LATENCY
}
