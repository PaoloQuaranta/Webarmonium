/**
 * Virtual User Configuration
 * Centralized configuration for virtual users in both landing and normal rooms
 *
 * This file consolidates all virtual user configurations used by VirtualUserService
 * for both landing page and normal rooms.
 *
 * Key differences between contexts:
 * - Landing: 3 sources (wikipedia, hackernews, github), always active
 * - Rooms: 2 sources (wikipedia, hackernews), active only in solo mode
 */

const { VIRTUAL_USER_COLORS } = require('./colors')

// Landing room identifier
const LANDING_ROOM_ID = 'landing-room'

// Virtual user configurations (shared between landing and rooms)
// Colors from VIRTUAL_USER_COLORS - exclusive, never overlap with real user colors
const VIRTUAL_USER_CONFIGS = {
  wikipedia: {
    userId: 'wikipedia-metrics',
    color: VIRTUAL_USER_COLORS.wikipedia,
    tessitura: 'bass',
    frequencyRange: { min: 110, max: 220 }  // A2-A3
  },
  hackernews: {
    userId: 'hackernews-metrics',
    color: VIRTUAL_USER_COLORS.hackernews,
    tessitura: 'tenor',
    frequencyRange: { min: 196, max: 392 }  // G3-G4
  },
  github: {
    userId: 'github-metrics',
    color: VIRTUAL_USER_COLORS.github,
    tessitura: 'soprano',
    frequencyRange: { min: 523, max: 1047 }  // C5-C6
  }
}

/**
 * Source-specific balancing to equalize gesture distribution
 *
 * Problem: Wikipedia polls every 5s with high activity, GitHub every 60s with low activity
 * Solution: Per-source parameters to compensate for structural differences
 *
 * Entry #187: Tuning methodology for gestureIntentMultiplier:
 * - Base threshold is 0.1 (10% of normalized velocity required to gesture)
 * - Multiplier adjusts this threshold: higher = stricter = fewer gestures
 *
 * Activity floor rationale:
 * - Lower floor = can be quieter when actually quiet
 * - Higher floor = ensures presence despite infrequent polling
 *
 * Duration bias rationale:
 * - tap/short = quick gestures, good for frequent polling
 * - medium/long = substantial gestures, good for infrequent polling
 */
const SOURCE_BALANCING = {
  // LANDING: 3 sources with aggressive tuning
  // Wikipedia has 12x more poll opportunities than GitHub, needs much stricter threshold
  landing: {
    wikipedia: {
      activityFloor: 0.15,          // Very low floor - can be quiet
      gestureIntentMultiplier: 4.0, // 4x threshold -> ~75% fewer gestures
      durationBias: { tap: 0.60, short: 0.30, medium: 0.08, long: 0.02 }  // Mostly taps
    },
    hackernews: {
      activityFloor: 0.25,          // Moderate floor for 10s poll interval
      gestureIntentMultiplier: 1.2, // Slightly stricter baseline
      durationBias: { tap: 0.25, short: 0.40, medium: 0.25, long: 0.10 }  // Balanced
    },
    github: {
      activityFloor: 0.5,           // High floor ensures presence
      gestureIntentMultiplier: 0.25, // 0.25x threshold -> ~4x more gestures
      durationBias: { tap: 0.15, short: 0.30, medium: 0.35, long: 0.20 }  // Substantial
    }
  },

  // ROOMS: 2 sources (no GitHub), more permissive thresholds
  // Entry #187d: Without GitHub's 0.25x multiplier, need more permissive for Wiki/HN
  rooms: {
    wikipedia: {
      activityFloor: 0.2,           // Moderate floor
      gestureIntentMultiplier: 2.0, // 2x threshold -> ~50% fewer gestures
      durationBias: { tap: 0.50, short: 0.35, medium: 0.12, long: 0.03 }  // Mostly quick
    },
    hackernews: {
      activityFloor: 0.3,           // Moderate floor for 10s poll interval
      gestureIntentMultiplier: 0.8, // Slightly permissive (no GitHub to compensate)
      durationBias: { tap: 0.25, short: 0.40, medium: 0.25, long: 0.10 }  // Balanced
    },
    github: {
      activityFloor: 0.5,           // High floor ensures presence if selected
      gestureIntentMultiplier: 0.3, // 0.3x threshold -> permissive
      durationBias: { tap: 0.20, short: 0.35, medium: 0.30, long: 0.15 }  // Substantial
    }
  }
}

/**
 * Gesture generation config
 *
 * Entry #174: Reduced density to make virtual users less prolific
 * Entry #187g: Rooms need higher density because only 2 sources vs Landing's 3
 */
const GESTURE_CONFIG = {
  // LANDING: Lower density (3 sources generate enough activity)
  landing: {
    baseDensityMultiplier: 0.45, // 45% pass at HIGH activity
    minDensity: 0.15,            // Minimum for sparse compositions
    maxDensity: 0.55             // 55% pass at LOW activity
  },

  // ROOMS: Higher density (only 2 sources)
  rooms: {
    baseDensityMultiplier: 0.60, // 60% pass at HIGH activity
    minDensity: 0.15,            // Minimum for sparse compositions
    maxDensity: 0.75             // 75% pass at LOW activity
  }
}

/**
 * Cursor interpolation settings for smooth movement
 *
 * FIX #5: Rooms use higher speed to match 100ms trajectory interval
 */
const INTERPOLATION_CONFIG = {
  interval: 50,  // 20fps for smooth movement (shared)

  // Landing: slower, smoother movement
  landing: {
    speed: 0.08  // Lower = smoother/slower
  },

  // Rooms: faster to match 100ms trajectory intervals
  rooms: {
    speed: 0.15  // Higher = faster, matches 100ms intervals
  }
}

/**
 * Initial cursor positions for better tessellation
 * Entry #183: Avoid center clustering
 */
const INITIAL_POSITIONS = {
  wikipedia: { x: 0.20, y: 0.80 },   // Bottom-left area (bass)
  hackernews: { x: 0.80, y: 0.50 },  // Right-center (tenor)
  github: { x: 0.30, y: 0.20 }       // Top-left area (soprano)
}

/**
 * Statistical tracking configuration
 */
const STATISTICS_CONFIG = {
  maxSamples: 100,  // Keep last 100 samples for percentile calculation
  percentileWarmupSamples: 10,  // Minimum samples before using percentile normalization
  percentileLowerBound: 0.1,    // P10 for normalization
  percentileUpperBound: 0.9     // P90 for normalization
}

/**
 * Timer-based composition intervals for landing
 * Landing generates compositions every 5-15s (no real users to trigger gestures)
 */
const COMPOSITION_TIMING = {
  baseInterval: 8000,     // 8s base
  variationRange: 7000,   // 0-7s variation (PHI-based)
  minInterval: 5000,      // Effective minimum: 5s
  maxInterval: 15000      // Effective maximum: 15s
}

module.exports = {
  LANDING_ROOM_ID,
  VIRTUAL_USER_CONFIGS,
  SOURCE_BALANCING,
  GESTURE_CONFIG,
  INTERPOLATION_CONFIG,
  INITIAL_POSITIONS,
  STATISTICS_CONFIG,
  COMPOSITION_TIMING
}
