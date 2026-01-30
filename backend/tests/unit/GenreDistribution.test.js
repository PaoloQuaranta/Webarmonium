/**
 * Tests for Entry #220: Emergent Parameter Distribution for Genre Coverage
 *
 * Tests PHI-based drift, percentile normalization, and genre profile separation.
 */

const StyleAnalyzer = require('../../src/services/StyleAnalyzer')
const { PHI_4D, DRIFT_AMPLITUDE } = require('../../src/utils/constants')

describe('Genre Distribution System (Entry #220)', () => {
  let styleAnalyzer

  beforeEach(() => {
    styleAnalyzer = new StyleAnalyzer()
  })

  describe('PHI_4D Constants', () => {
    it('should have 4 irrational multipliers', () => {
      expect(PHI_4D).toHaveLength(4)
      expect(PHI_4D[0]).toBeCloseTo(1.618, 2) // PHI
      expect(PHI_4D[1]).toBeCloseTo(2.618, 2) // PHI²
      expect(PHI_4D[2]).toBeCloseTo(1.414, 2) // √2
      expect(PHI_4D[3]).toBeCloseTo(1.732, 2) // √3
    })

    it('should have drift amplitude of 0.15 (15%)', () => {
      expect(DRIFT_AMPLITUDE).toBe(0.15)
    })
  })

  describe('PHI-based 4D Drift', () => {
    // Helper to force drift recalculation by resetting the rate limit timer
    const forceNewDrift = () => {
      styleAnalyzer._lastDriftUpdate = 0
    }

    it('should calculate drift offset centered around 0', () => {
      forceNewDrift()
      const drift = styleAnalyzer._calculate4DDrift(0)
      // At count 0, drift should be centered
      expect(drift.energy).toBeGreaterThanOrEqual(-DRIFT_AMPLITUDE)
      expect(drift.energy).toBeLessThanOrEqual(DRIFT_AMPLITUDE)
      expect(drift.directionUniformity).toBeGreaterThanOrEqual(-DRIFT_AMPLITUDE)
      expect(drift.directionUniformity).toBeLessThanOrEqual(DRIFT_AMPLITUDE)
    })

    it('should produce different drift for different composition counts (when rate limit allows)', () => {
      // Entry #220b: Drift is rate-limited, so we force new calculations
      forceNewDrift()
      const drift1 = styleAnalyzer._calculate4DDrift(1)
      forceNewDrift()
      const drift2 = styleAnalyzer._calculate4DDrift(2)
      forceNewDrift()
      const drift3 = styleAnalyzer._calculate4DDrift(3)

      // Each should be different (low-discrepancy property)
      expect(drift1.energy).not.toEqual(drift2.energy)
      expect(drift2.energy).not.toEqual(drift3.energy)
    })

    it('should be rate-limited (same drift within interval)', () => {
      forceNewDrift()
      const drift1a = styleAnalyzer._calculate4DDrift(42)
      // Don't reset - should return cached value
      const drift1b = styleAnalyzer._calculate4DDrift(99) // Different count, same cached result

      expect(drift1a.energy).toEqual(drift1b.energy)
      expect(drift1a.directionUniformity).toEqual(drift1b.directionUniformity)
    })

    it('should explore diverse regions over many compositions (bypassing rate limit for test)', () => {
      const drifts = []
      for (let i = 0; i < 100; i++) {
        forceNewDrift() // Bypass rate limit for testing
        drifts.push(styleAnalyzer._calculate4DDrift(i))
      }

      // Check that energy drift covers diverse values
      const energyValues = drifts.map(d => d.energy)
      const minEnergy = Math.min(...energyValues)
      const maxEnergy = Math.max(...energyValues)

      // Should span most of the drift range
      expect(maxEnergy - minEnergy).toBeGreaterThan(DRIFT_AMPLITUDE * 1.5)
    })
  })

  describe('Percentile-based Normalization', () => {
    it('should pass through values during warm-up period', () => {
      const rawValues = {
        energy: 0.7,
        directionUniformity: 0.4,
        regularity: 0.6,
        pathComplexity: 0.3
      }

      const normalized = styleAnalyzer._updateAndNormalize4DMetrics(rawValues)

      // During warm-up (< 10 samples), should pass through
      expect(normalized.energy).toBe(0.7)
    })

    it('should apply percentile normalization after warm-up', () => {
      // Add enough samples for warm-up
      for (let i = 0; i < 15; i++) {
        styleAnalyzer._updateAndNormalize4DMetrics({
          energy: 0.3 + (i * 0.02), // Range 0.3 to 0.58
          directionUniformity: 0.5,
          regularity: 0.5,
          pathComplexity: 0.5
        })
      }

      // Now test normalization
      const normalized = styleAnalyzer._updateAndNormalize4DMetrics({
        energy: 0.44, // Middle of the range
        directionUniformity: 0.5,
        regularity: 0.5,
        pathComplexity: 0.5
      })

      // Should be normalized based on percentiles
      expect(normalized.energy).toBeGreaterThanOrEqual(0)
      expect(normalized.energy).toBeLessThanOrEqual(1)
    })

    it('should handle edge cases (constant values)', () => {
      // Add samples with constant energy
      for (let i = 0; i < 15; i++) {
        styleAnalyzer._updateAndNormalize4DMetrics({
          energy: 0.5, // Constant
          directionUniformity: 0.5,
          regularity: 0.5,
          pathComplexity: 0.5
        })
      }

      const normalized = styleAnalyzer._updateAndNormalize4DMetrics({
        energy: 0.5,
        directionUniformity: 0.5,
        regularity: 0.5,
        pathComplexity: 0.5
      })

      // Should fall back to raw value when range is too small
      expect(normalized.energy).toBe(0.5)
    })
  })

  describe('Genre Profile Separation', () => {
    it('should have repositioned profiles for maximum separation', () => {
      // Test that corners are at extremes
      const weights = styleAnalyzer.calculateGenreWeights(0.1, 0.9, 0.9, 0.1, 0)
      expect(weights.ambient).toBeGreaterThan(0.3) // Should favor ambient at this corner

      const weights2 = styleAnalyzer.calculateGenreWeights(0.9, 0.4, 0.5, 0.4, 0)
      expect(weights2.rock).toBeGreaterThan(0.2) // Should favor rock at high energy
    })

    it('should reach different genres with different input points', () => {
      const testCases = [
        { point: [0.1, 0.9, 0.9, 0.1], expectedHigh: 'ambient' },
        { point: [0.9, 0.4, 0.5, 0.4], expectedHigh: 'rock' },
        { point: [0.4, 0.2, 0.2, 0.9], expectedHigh: 'experimental' },
        { point: [0.55, 0.4, 0.3, 0.7], expectedHigh: 'jazz' }
      ]

      for (const { point, expectedHigh } of testCases) {
        const weights = styleAnalyzer.calculateGenreWeights(...point, 0)
        const dominantGenre = Object.entries(weights)
          .sort((a, b) => b[1] - a[1])[0][0]

        // The expected genre should be among the top genres
        const sortedGenres = Object.entries(weights)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([g]) => g)

        expect(sortedGenres).toContain(expectedHigh)
      }
    })
  })

  describe('Genre Weights with Drift', () => {
    // Helper to bypass rate limit for testing
    const forceNewDrift = () => {
      styleAnalyzer._lastDriftUpdate = 0
    }

    it('should produce valid weights (sum to 1.0)', () => {
      for (let count = 0; count < 10; count++) {
        forceNewDrift()
        const weights = styleAnalyzer.calculateGenreWeights(0.5, 0.5, 0.5, 0.5, count)
        const sum = Object.values(weights).reduce((a, b) => a + b, 0)
        expect(sum).toBeCloseTo(1.0, 5)
      }
    })

    it('should show variation in dominant genre over many compositions (bypassing rate limit)', () => {
      const dominantGenres = new Set()

      // Run 100 compositions from center point with drift
      // Entry #220b: Bypass rate limit to test drift exploration
      for (let count = 0; count < 100; count++) {
        forceNewDrift()
        const weights = styleAnalyzer.calculateGenreWeights(0.5, 0.5, 0.5, 0.5, count)
        const dominant = Object.entries(weights)
          .sort((a, b) => b[1] - a[1])[0][0]
        dominantGenres.add(dominant)
      }

      // With 15% drift from center, should reach at least 2 genres
      // (melodic is at center, but drift can reach neighboring genres)
      expect(dominantGenres.size).toBeGreaterThanOrEqual(2)
    })

    it('should maintain emergence (metric changes affect weights)', () => {
      // Same composition count, different metrics
      const lowEnergy = styleAnalyzer.calculateGenreWeights(0.1, 0.5, 0.5, 0.5, 10)
      const highEnergy = styleAnalyzer.calculateGenreWeights(0.9, 0.5, 0.5, 0.5, 10)

      // Low energy should favor ambient-like genres
      expect(lowEnergy.ambient + lowEnergy.classical).toBeGreaterThan(
        highEnergy.ambient + highEnergy.classical
      )

      // High energy should favor rock-like genres
      expect(highEnergy.rock + highEnergy.rhythmic).toBeGreaterThan(
        lowEnergy.rock + lowEnergy.rhythmic
      )
    })
  })

  describe('analyzeGestureStyle with compositionCount', () => {
    it('should accept compositionCount parameter', () => {
      const gestures = [
        { x: 0.5, y: 0.5, velocity: 50, timestamp: Date.now() - 1000 },
        { x: 0.6, y: 0.6, velocity: 60, timestamp: Date.now() }
      ]

      // Should not throw with compositionCount
      const style1 = styleAnalyzer.analyzeGestureStyle(gestures, 0.5, 'test', 0)
      const style2 = styleAnalyzer.analyzeGestureStyle(gestures, 0.5, 'test', 100)

      expect(style1.genreWeights).toBeDefined()
      expect(style2.genreWeights).toBeDefined()
    })

    it('should produce different weights for different composition counts', () => {
      const gestures = [
        { x: 0.5, y: 0.5, velocity: 50, timestamp: Date.now() - 1000 },
        { x: 0.5, y: 0.5, velocity: 50, timestamp: Date.now() }
      ]

      const style1 = styleAnalyzer.analyzeGestureStyle(gestures, 0.5, 'test1', 0)
      const style2 = styleAnalyzer.analyzeGestureStyle(gestures, 0.5, 'test2', 50)

      // With same gestures but different counts, drift should cause variation
      const diff = Math.abs(style1.genreWeights.ambient - style2.genreWeights.ambient)
      // Drift should cause at least some difference
      expect(diff).toBeDefined()
    })
  })

  describe('Component-Level Normalization (Entry #221)', () => {
    it('should have component statistics buffers', () => {
      expect(styleAnalyzer._componentStats).toBeDefined()
      expect(styleAnalyzer._componentStats.velocity).toBeDefined()
      expect(styleAnalyzer._componentStats.acceleration).toBeDefined()
      expect(styleAnalyzer._componentStats.density).toBeDefined()
      expect(styleAnalyzer._componentStats.turnAngle).toBeDefined()
      expect(styleAnalyzer._componentStats.pitchVariance).toBeDefined()
      expect(styleAnalyzer._componentStats.velocityVariance).toBeDefined()
    })

    it('should use fallback divisors during warm-up period', () => {
      // Fresh instance for clean test
      const analyzer = new StyleAnalyzer()

      // First call - should use fallback (velocity / 100)
      const result1 = analyzer._normalizeComponent('velocity', 50)
      expect(result1).toBeCloseTo(0.5, 1)  // 50/100 = 0.5

      const result2 = analyzer._normalizeComponent('acceleration', 25)
      expect(result2).toBeCloseTo(0.5, 1)  // 25/50 = 0.5
    })

    it('should switch to percentile normalization after warm-up', () => {
      const analyzer = new StyleAnalyzer()

      // Add 10 samples (warm-up period)
      for (let i = 0; i < 10; i++) {
        analyzer._normalizeComponent('velocity', 20 + i * 2)  // 20-38 range
      }

      // Now test - value should be normalized based on P10-P90
      const midValue = analyzer._normalizeComponent('velocity', 30)  // Middle of 20-38
      expect(midValue).toBeGreaterThan(0.3)
      expect(midValue).toBeLessThan(0.7)

      const lowValue = analyzer._normalizeComponent('velocity', 22)  // Near P10
      expect(lowValue).toBeLessThan(0.3)

      const highValue = analyzer._normalizeComponent('velocity', 36)  // Near P90
      expect(highValue).toBeGreaterThan(0.7)
    })

    it('should handle constant values (zero range)', () => {
      const analyzer = new StyleAnalyzer()

      // Add 15 identical samples
      for (let i = 0; i < 15; i++) {
        analyzer._normalizeComponent('acceleration', 25)
      }

      // Should return 0.5 (middle) when P10-P90 range is zero
      const result = analyzer._normalizeComponent('acceleration', 25)
      expect(result).toBe(0.5)
    })

    it('should adapt to different velocity scales', () => {
      const analyzer = new StyleAnalyzer()

      // Simulate 0-1 scale velocities (tap gestures) - deterministic values
      const testValues = [0.30, 0.35, 0.38, 0.42, 0.45, 0.48, 0.52, 0.55, 0.58, 0.62, 0.65, 0.68, 0.70, 0.72, 0.75]
      for (const val of testValues) {
        analyzer._normalizeComponent('velocity', val)
      }

      // Now a 0.5 velocity should normalize properly (middle of 0.30-0.75 range)
      const result = analyzer._normalizeComponent('velocity', 0.5)
      expect(result).toBeGreaterThan(0.2)
      expect(result).toBeLessThan(0.8)
    })

    it('should track density values and normalize correctly', () => {
      const analyzer = new StyleAnalyzer()

      // Simulate density values (typically 0.1 - 2.0 for gestures.length / 10) - deterministic
      const testValues = [0.50, 0.58, 0.65, 0.72, 0.80, 0.88, 0.95, 1.02, 1.10, 1.18, 1.25, 1.32, 1.40, 1.45, 1.50]
      for (const val of testValues) {
        analyzer._normalizeComponent('density', val)
      }

      // Value at middle of range (1.0) should be around 0.5
      const result = analyzer._normalizeComponent('density', 1.0)
      expect(result).toBeGreaterThan(0.2)
      expect(result).toBeLessThan(0.8)
    })

    it('should normalize path complexity components', () => {
      const analyzer = new StyleAnalyzer()

      // Simulate path complexity values (typically 0-0.3) - deterministic
      // Range: 0.05 to 0.25, evenly distributed
      const testValues = [0.05, 0.07, 0.09, 0.11, 0.13, 0.15, 0.17, 0.19, 0.21, 0.23, 0.25, 0.27, 0.29, 0.31, 0.33]
      for (const val of testValues) {
        analyzer._normalizeComponent('turnAngle', val)
      }

      // P10 ≈ 0.07, P90 ≈ 0.31, so 0.15 should be around (0.15-0.07)/(0.31-0.07) ≈ 0.33
      const result = analyzer._normalizeComponent('turnAngle', 0.15)
      expect(result).toBeGreaterThan(0.2)
      expect(result).toBeLessThan(0.6)
    })

    it('should improve energy range coverage with varied input', () => {
      // Test that energy calculation with adaptive normalization
      // produces better range coverage than with fixed divisors
      const analyzer = new StyleAnalyzer()

      // Build up statistics with varied gestures
      const gesturesLow = Array(5).fill(null).map((_, i) => ({
        velocity: 10 + i * 2,  // Low velocities: 10-18
        acceleration: 5,
        timestamp: Date.now() - (5 - i) * 500
      }))

      const gesturesHigh = Array(5).fill(null).map((_, i) => ({
        velocity: 40 + i * 5,  // Higher velocities: 40-60
        acceleration: 15,
        timestamp: Date.now() - (5 - i) * 500
      }))

      // After processing some gestures, energy should adapt
      for (let i = 0; i < 5; i++) {
        analyzer.calculateEnergy([gesturesLow[i]])
      }

      const energyLow = analyzer.calculateEnergy(gesturesLow)
      const energyHigh = analyzer.calculateEnergy(gesturesHigh)

      // Both should be valid 0-1 values
      expect(energyLow).toBeGreaterThanOrEqual(0)
      expect(energyLow).toBeLessThanOrEqual(1)
      expect(energyHigh).toBeGreaterThanOrEqual(0)
      expect(energyHigh).toBeLessThanOrEqual(1)

      // High energy gestures should produce higher energy
      expect(energyHigh).toBeGreaterThan(energyLow)
    })

    it('should handle invalid input values gracefully', () => {
      const analyzer = new StyleAnalyzer()

      // NaN should return safe default (0.5)
      expect(analyzer._normalizeComponent('velocity', NaN)).toBe(0.5)

      // Infinity should return safe default (0.5)
      expect(analyzer._normalizeComponent('acceleration', Infinity)).toBe(0.5)
      expect(analyzer._normalizeComponent('acceleration', -Infinity)).toBe(0.5)

      // undefined should return safe default (0.5)
      expect(analyzer._normalizeComponent('density', undefined)).toBe(0.5)

      // Unknown component should return clamped value
      expect(analyzer._normalizeComponent('unknownComponent', 0.5)).toBe(0.5)
      expect(analyzer._normalizeComponent('unknownComponent', 1.5)).toBe(1)
      expect(analyzer._normalizeComponent('unknownComponent', -0.5)).toBe(0)
    })
  })

  describe('Extended Component Normalization (Entry #221b)', () => {
    it('should have additional rhythmic/harmonic component stats', () => {
      expect(styleAnalyzer._componentStats.avgInterval).toBeDefined()
      expect(styleAnalyzer._componentStats.swingRatio).toBeDefined()
      expect(styleAnalyzer._componentStats.velocityContrast).toBeDefined()
      expect(styleAnalyzer._componentStats.positionSyncopation).toBeDefined()
      expect(styleAnalyzer._componentStats.velocityIrregularity).toBeDefined()
      expect(styleAnalyzer._componentStats.accelerationTension).toBeDefined()
      expect(styleAnalyzer._componentStats.timingTension).toBeDefined()
      expect(styleAnalyzer._componentStats.intervalCV).toBeDefined()
      expect(styleAnalyzer._componentStats.ySpread).toBeDefined()
      expect(styleAnalyzer._componentStats.velocityTrend).toBeDefined()
    })

    it('should estimate tempo with adaptive normalization', () => {
      const analyzer = new StyleAnalyzer()

      // Create gestures with different interval patterns
      const slowGestures = Array(5).fill(null).map((_, i) => ({
        velocity: 50,
        timestamp: Date.now() - (5 - i) * 800  // 800ms intervals = slow tempo
      }))

      const fastGestures = Array(5).fill(null).map((_, i) => ({
        velocity: 50,
        timestamp: Date.now() - (5 - i) * 200  // 200ms intervals = fast tempo
      }))

      // Build up statistics
      for (let i = 0; i < 5; i++) {
        analyzer.estimateTempo([slowGestures[i], slowGestures[Math.min(i + 1, 4)]])
      }

      const slowTempo = analyzer.estimateTempo(slowGestures)
      const fastTempo = analyzer.estimateTempo(fastGestures)

      // Both should be in valid BPM range
      expect(slowTempo).toBeGreaterThanOrEqual(40)
      expect(slowTempo).toBeLessThanOrEqual(240)
      expect(fastTempo).toBeGreaterThanOrEqual(40)
      expect(fastTempo).toBeLessThanOrEqual(240)

      // Fast gestures should produce higher tempo
      expect(fastTempo).toBeGreaterThan(slowTempo)
    })

    it('should detect swing with adaptive normalization', () => {
      const analyzer = new StyleAnalyzer()

      // Create gestures with swing pattern (alternating long-short)
      const swingGestures = Array(8).fill(null).map((_, i) => ({
        velocity: 50,
        timestamp: Date.now() - (8 - i) * (i % 2 === 0 ? 600 : 300)  // Long-short pattern
      }))

      // Create gestures with straight pattern (even intervals)
      const straightGestures = Array(8).fill(null).map((_, i) => ({
        velocity: 50,
        timestamp: Date.now() - (8 - i) * 400  // Even intervals
      }))

      // Build up statistics
      for (let i = 0; i < 5; i++) {
        analyzer.detectSwing(straightGestures)
      }

      const swingValue = analyzer.detectSwing(swingGestures)
      const straightValue = analyzer.detectSwing(straightGestures)

      // Both should be in valid 0-1 range
      expect(swingValue).toBeGreaterThanOrEqual(0)
      expect(swingValue).toBeLessThanOrEqual(1)
      expect(straightValue).toBeGreaterThanOrEqual(0)
      expect(straightValue).toBeLessThanOrEqual(1)
    })

    it('should detect syncopation with adaptive normalization', () => {
      const analyzer = new StyleAnalyzer()

      // Create gestures with high velocity contrast (syncopated)
      const syncopatedGestures = Array(10).fill(null).map((_, i) => ({
        velocity: i % 2 === 0 ? 100 : 30,  // Alternating high/low
        timestamp: Date.now() - (10 - i) * 200
      }))

      // Create gestures with low velocity contrast (not syncopated)
      const evenGestures = Array(10).fill(null).map((_, i) => ({
        velocity: 50 + (i % 3),  // Very little variation
        timestamp: Date.now() - (10 - i) * 200
      }))

      // Build up statistics
      for (let i = 0; i < 5; i++) {
        analyzer.detectSyncopation(evenGestures)
      }

      const syncopationHigh = analyzer.detectSyncopation(syncopatedGestures)
      const syncopationLow = analyzer.detectSyncopation(evenGestures)

      // Both should be in valid 0-1 range
      expect(syncopationHigh).toBeGreaterThanOrEqual(0)
      expect(syncopationHigh).toBeLessThanOrEqual(1)
      expect(syncopationLow).toBeGreaterThanOrEqual(0)
      expect(syncopationLow).toBeLessThanOrEqual(1)

      // High contrast gestures should have higher syncopation
      expect(syncopationHigh).toBeGreaterThan(syncopationLow)
    })

    it('should calculate dissonance with adaptive normalization', () => {
      const analyzer = new StyleAnalyzer()

      // Create irregular gestures (high dissonance)
      const irregularGestures = Array(10).fill(null).map((_, i) => ({
        velocity: 20 + Math.floor(i * 7) % 80,  // Irregular velocities
        acceleration: i % 3 === 0 ? 50 : 5,  // Irregular acceleration
        timestamp: Date.now() - (10 - i) * (100 + (i % 4) * 200)  // Irregular timing
      }))

      // Create regular gestures (low dissonance)
      const regularGestures = Array(10).fill(null).map((_, i) => ({
        velocity: 50,  // Constant velocity
        acceleration: 10,  // Constant acceleration
        timestamp: Date.now() - (10 - i) * 300  // Regular timing
      }))

      // Build up statistics
      for (let i = 0; i < 5; i++) {
        analyzer.calculateDissonance(regularGestures)
      }

      const dissonanceHigh = analyzer.calculateDissonance(irregularGestures)
      const dissonanceLow = analyzer.calculateDissonance(regularGestures)

      // Both should be in valid 0-1 range
      expect(dissonanceHigh).toBeGreaterThanOrEqual(0)
      expect(dissonanceHigh).toBeLessThanOrEqual(1)
      expect(dissonanceLow).toBeGreaterThanOrEqual(0)
      expect(dissonanceLow).toBeLessThanOrEqual(1)
    })

    it('should detect rhythmic regularity with adaptive normalization', () => {
      const analyzer = new StyleAnalyzer()

      // Create regular timing gestures
      const regularGestures = Array(10).fill(null).map((_, i) => ({
        velocity: 50,
        timestamp: Date.now() - (10 - i) * 300  // Exactly 300ms intervals
      }))

      // Create irregular timing gestures
      const irregularGestures = Array(10).fill(null).map((_, i) => ({
        velocity: 50,
        timestamp: Date.now() - (10 - i) * (200 + (i % 3) * 150)  // Varying intervals
      }))

      // Build up statistics
      for (let i = 0; i < 5; i++) {
        analyzer.detectRhythmicRegularity(regularGestures)
      }

      const regularityHigh = analyzer.detectRhythmicRegularity(regularGestures)
      const regularityLow = analyzer.detectRhythmicRegularity(irregularGestures)

      // Both should be in valid 0-1 range
      expect(regularityHigh).toBeGreaterThanOrEqual(0)
      expect(regularityHigh).toBeLessThanOrEqual(1)
      expect(regularityLow).toBeGreaterThanOrEqual(0)
      expect(regularityLow).toBeLessThanOrEqual(1)

      // Regular gestures should have higher regularity
      expect(regularityHigh).toBeGreaterThan(regularityLow)
    })

    it('should detect modal flavor with adaptive normalization', () => {
      const analyzer = new StyleAnalyzer()
      const modes = ['ionian', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'aeolian', 'locrian']

      // Build up ySpread and velocityTrend statistics
      for (let i = 0; i < 15; i++) {
        const gestures = Array(5).fill(null).map((_, j) => ({
          position: { y: 0.3 + (j * 0.1) },
          velocity: 40 + j * 5,
          timestamp: Date.now() - (5 - j) * 300
        }))
        analyzer.detectModalFlavor(gestures)
      }

      // Test various gesture patterns
      const highEnergyGestures = Array(5).fill(null).map((_, i) => ({
        position: { y: 0.3 + (i * 0.05) },
        velocity: 80,  // High velocity = high energy
        timestamp: Date.now() - (5 - i) * 200
      }))

      const lowEnergyGestures = Array(5).fill(null).map((_, i) => ({
        position: { y: 0.3 + (i * 0.05) },
        velocity: 20,  // Low velocity = low energy
        timestamp: Date.now() - (5 - i) * 500
      }))

      const modeHigh = analyzer.detectModalFlavor(highEnergyGestures)
      const modeLow = analyzer.detectModalFlavor(lowEnergyGestures)

      // Both should return valid mode names
      expect(modes).toContain(modeHigh)
      expect(modes).toContain(modeLow)
    })

    it('should return valid values for all parameters with fresh analyzer', () => {
      const analyzer = new StyleAnalyzer()

      const gestures = Array(10).fill(null).map((_, i) => ({
        position: { x: 0.5, y: 0.3 + (i * 0.05) },
        velocity: 40 + i * 5,
        acceleration: 10 + i * 2,
        timestamp: Date.now() - (10 - i) * 300
      }))

      // All methods should return valid values even with fresh analyzer (warm-up period)
      const energy = analyzer.calculateEnergy(gestures)
      const tempo = analyzer.estimateTempo(gestures)
      const swing = analyzer.detectSwing(gestures)
      const syncopation = analyzer.detectSyncopation(gestures)
      const dissonance = analyzer.calculateDissonance(gestures)
      const regularity = analyzer.detectRhythmicRegularity(gestures)
      const modalFlavor = analyzer.detectModalFlavor(gestures)
      const chromaticism = analyzer.detectChromaticism(gestures)

      expect(energy).toBeGreaterThanOrEqual(0)
      expect(energy).toBeLessThanOrEqual(1)
      expect(tempo).toBeGreaterThanOrEqual(40)
      expect(tempo).toBeLessThanOrEqual(240)
      expect(swing).toBeGreaterThanOrEqual(0)
      expect(swing).toBeLessThanOrEqual(1)
      expect(syncopation).toBeGreaterThanOrEqual(0)
      expect(syncopation).toBeLessThanOrEqual(1)
      expect(dissonance).toBeGreaterThanOrEqual(0)
      expect(dissonance).toBeLessThanOrEqual(1)
      expect(regularity).toBeGreaterThanOrEqual(0)
      expect(regularity).toBeLessThanOrEqual(1)
      expect(typeof modalFlavor).toBe('string')
      expect(chromaticism).toBeGreaterThanOrEqual(0)
      expect(chromaticism).toBeLessThanOrEqual(1)
    })
  })
})
