/**
 * Smoothing Calculator Utilities
 * Provides exponential moving average smoothing for audio parameters
 * Extracted from HoverOrchestrator.js
 */

/**
 * Apply exponential moving average smoothing to a single value
 * @param {number} previous - Previous value
 * @param {number} current - Current value
 * @param {number} factor - Smoothing factor (0-1, higher = smoother/slower)
 * @returns {number} Smoothed value
 */
function applySmoothing (previous, current, factor) {
  return previous * factor + current * (1 - factor)
}

/**
 * Apply smoothing to an object of values using a parameter mapping
 * @param {Object} previous - Object with previous values
 * @param {Object} current - Object with current values
 * @param {Object} factorMap - Object mapping parameter names to smoothing factors
 * @returns {Object} New object with smoothed values
 */
function smoothObject (previous, current, factorMap) {
  const result = {}

  for (const [key, factor] of Object.entries(factorMap)) {
    if (previous[key] !== undefined && current[key] !== undefined) {
      result[key] = applySmoothing(previous[key], current[key], factor)
    }
  }

  return result
}

/**
 * Apply smoothing to multiple parameters in place
 * @param {Object} target - Target object to update
 * @param {Object} previous - Object with previous values
 * @param {Object} current - Object with current values
 * @param {Object} factorMap - Object mapping parameter names to smoothing factors
 */
function applySmoothingInPlace (target, previous, current, factorMap) {
  for (const [key, factor] of Object.entries(factorMap)) {
    if (previous[key] !== undefined && current[key] !== undefined) {
      target[key] = applySmoothing(previous[key], current[key], factor)
    }
  }
}

/**
 * Default smoothing parameters for common audio modulation
 * These values provide smooth transitions without noticeable stepping
 */
const DEFAULT_SMOOTHING_PARAMS = {
  lfoFrequencySmoothing: 0.95,
  lfoAmplitudeSmoothing: 0.97,
  lfo2FrequencySmoothing: 0.98,
  lfo3FrequencySmoothing: 0.99,
  lfo4FrequencySmoothing: 0.995,
  filterSmoothing: 0.96,
  spatialSmoothing: 0.94,
  effectsSmoothing: 0.92
}

/**
 * Smoothing factors for specific parameter types
 * Use these for consistent smoothing across the codebase
 */
const SMOOTHING_FACTORS = {
  ULTRA_SLOW: 0.995,
  VERY_SLOW: 0.99,
  SLOW: 0.97,
  MEDIUM: 0.95,
  FAST: 0.92,
  VERY_FAST: 0.85
}

module.exports = {
  applySmoothing,
  smoothObject,
  applySmoothingInPlace,
  DEFAULT_SMOOTHING_PARAMS,
  SMOOTHING_FACTORS
}
