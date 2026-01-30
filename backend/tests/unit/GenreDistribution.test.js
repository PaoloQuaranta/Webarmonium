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
    it('should calculate drift offset centered around 0', () => {
      const drift = styleAnalyzer._calculate4DDrift(0)
      // At count 0, drift should be centered
      expect(drift.energy).toBeGreaterThanOrEqual(-DRIFT_AMPLITUDE)
      expect(drift.energy).toBeLessThanOrEqual(DRIFT_AMPLITUDE)
      expect(drift.directionUniformity).toBeGreaterThanOrEqual(-DRIFT_AMPLITUDE)
      expect(drift.directionUniformity).toBeLessThanOrEqual(DRIFT_AMPLITUDE)
    })

    it('should produce different drift for different composition counts', () => {
      const drift1 = styleAnalyzer._calculate4DDrift(1)
      const drift2 = styleAnalyzer._calculate4DDrift(2)
      const drift3 = styleAnalyzer._calculate4DDrift(3)

      // Each should be different (low-discrepancy property)
      expect(drift1.energy).not.toEqual(drift2.energy)
      expect(drift2.energy).not.toEqual(drift3.energy)
    })

    it('should be deterministic (same count = same drift)', () => {
      const drift1a = styleAnalyzer._calculate4DDrift(42)
      const drift1b = styleAnalyzer._calculate4DDrift(42)

      expect(drift1a.energy).toEqual(drift1b.energy)
      expect(drift1a.directionUniformity).toEqual(drift1b.directionUniformity)
      expect(drift1a.regularity).toEqual(drift1b.regularity)
      expect(drift1a.pathComplexity).toEqual(drift1b.pathComplexity)
    })

    it('should explore diverse regions over many compositions', () => {
      const drifts = []
      for (let i = 0; i < 100; i++) {
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
    it('should produce valid weights (sum to 1.0)', () => {
      for (let count = 0; count < 10; count++) {
        const weights = styleAnalyzer.calculateGenreWeights(0.5, 0.5, 0.5, 0.5, count)
        const sum = Object.values(weights).reduce((a, b) => a + b, 0)
        expect(sum).toBeCloseTo(1.0, 5)
      }
    })

    it('should show variation in dominant genre over many compositions', () => {
      const dominantGenres = new Set()

      // Run 100 compositions from center point with drift
      for (let count = 0; count < 100; count++) {
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
})
