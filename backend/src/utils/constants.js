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

module.exports = { PHI }
