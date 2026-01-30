/**
 * Mathematical constants for deterministic variation
 */

/**
 * Golden Ratio (φ)
 * Mathematical constant ≈ 1.618033988749894848
 *
 * Used for generating low-discrepancy sequences via the formula:
 * index = floor((n * φ) mod 1 * arrayLength)
 *
 * This creates quasi-random but deterministic selection patterns that:
 * - Never repeat in short cycles
 * - Eventually cover all array indices
 * - Avoid clustering of nearby values
 * - Remain deterministic for the same input sequence
 *
 * @constant {number}
 * @see https://en.wikipedia.org/wiki/Golden_ratio
 * @see https://en.wikipedia.org/wiki/Low-discrepancy_sequence
 */
const PHI = 1.618033988749894848

/**
 * 4D Low-Discrepancy Sequence Multipliers
 *
 * Entry #220: Used for PHI-based parameter space exploration in genre weight calculation.
 * Each dimension uses a different irrational number to ensure independence:
 * - energy: PHI (golden ratio)
 * - directionUniformity: PHI² (golden ratio squared)
 * - regularity: √2 (Pythagoras' constant)
 * - pathComplexity: √3 (Theodorus' constant)
 *
 * Using different irrationals prevents correlation between dimensions,
 * creating a true low-discrepancy sequence in 4D space (similar to Halton sequences
 * but simpler to compute).
 *
 * @constant {number[]}
 * @see https://en.wikipedia.org/wiki/Low-discrepancy_sequence
 */
const PHI_4D = [
  1.618033988749894,   // PHI for energy
  2.618033988749894,   // PHI² for directionUniformity
  1.414213562373095,   // √2 for regularity
  1.732050807568877    // √3 for pathComplexity
]

/**
 * Amplitude of PHI-based drift in 4D parameter space.
 * Controls balance between metric emergence (larger = less) and coverage (larger = more).
 *
 * Entry #220: 0.15 = 15% drift, preserving 85% metric-driven emergence.
 * Can tune to 0.20-0.25 if genre coverage still insufficient.
 *
 * @constant {number}
 */
const DRIFT_AMPLITUDE = 0.15

/**
 * Entry #222: Percentile normalization constants
 *
 * PERCENTILE_WARMUP_SAMPLES: Minimum samples needed before switching from
 * fallback divisors to percentile-based normalization. 10 samples provides
 * enough data for stable P10-P90 calculation while keeping warm-up period short.
 *
 * PERCENTILE_LOWER_BOUND (P10): Filters bottom 10% outliers
 * PERCENTILE_UPPER_BOUND (P90): Filters top 10% outliers
 *
 * Using P10-P90 instead of min/max prevents extreme outliers from skewing
 * the normalization range, resulting in more stable 0-1 output distribution.
 *
 * @constant {number}
 */
const PERCENTILE_WARMUP_SAMPLES = 10
const PERCENTILE_LOWER_BOUND = 0.1  // P10
const PERCENTILE_UPPER_BOUND = 0.9  // P90

module.exports = {
  PHI,
  PHI_4D,
  DRIFT_AMPLITUDE,
  PERCENTILE_WARMUP_SAMPLES,
  PERCENTILE_LOWER_BOUND,
  PERCENTILE_UPPER_BOUND
}
