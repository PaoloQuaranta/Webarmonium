/**
 * Unit tests for SoundPatternGenerator deterministic hash functions
 * Tests hashString() and deterministicSelect() methods
 */

const SoundPatternGenerator = require('../../src/services/SoundPatternGenerator')

describe('SoundPatternGenerator Hash Functions', () => {
  let generator

  beforeEach(() => {
    generator = new SoundPatternGenerator()
  })

  describe('hashString()', () => {
    test('should produce stable output for same input', () => {
      const hash1 = generator.hashString('room-123')
      const hash2 = generator.hashString('room-123')
      expect(hash1).toBe(hash2)
    })

    test('should produce different output for different inputs', () => {
      const hash1 = generator.hashString('room-123')
      const hash2 = generator.hashString('room-456')
      expect(hash1).not.toBe(hash2)
    })

    test('should return non-negative integer', () => {
      const testStrings = [
        'room-123',
        'test-room-abc-123',
        'a'.repeat(100),
        '',
        'special-chars-!@#$%^&*()',
        '日本語テスト',
        'emoji-🎵🎶'
      ]

      testStrings.forEach(str => {
        const hash = generator.hashString(str)
        expect(hash).toBeGreaterThanOrEqual(0)
        expect(Number.isInteger(hash)).toBe(true)
      })
    })

    test('should handle empty string', () => {
      expect(() => generator.hashString('')).not.toThrow()
      const hash = generator.hashString('')
      expect(hash).toBe(5381) // djb2 initial value
    })

    test('should handle very long strings without overflow', () => {
      const longString = 'a'.repeat(10000)
      const hash = generator.hashString(longString)
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThanOrEqual(0xFFFFFFFF) // 32-bit unsigned max
    })

    test('should use cache on repeated calls', () => {
      const roomId = 'cached-room-test'

      // First call - should compute and cache
      const hash1 = generator.hashString(roomId)
      expect(generator.roomHashCache.has(roomId)).toBe(true)

      // Second call - should use cache
      const hash2 = generator.hashString(roomId)
      expect(hash1).toBe(hash2)

      // Verify cache contains correct value
      expect(generator.roomHashCache.get(roomId)).toBe(hash1)
    })

    test('should produce good distribution for similar inputs', () => {
      // Test that similar strings produce different hashes
      const hashes = new Set()
      for (let i = 0; i < 100; i++) {
        const hash = generator.hashString(`room-${i}`)
        hashes.add(hash)
      }
      // Should have high uniqueness (at least 95%)
      expect(hashes.size).toBeGreaterThanOrEqual(95)
    })
  })

  describe('deterministicSelect()', () => {
    test('should return consistent index for same inputs', () => {
      const idx1 = generator.deterministicSelect('room-123', 0.5, 6)
      const idx2 = generator.deterministicSelect('room-123', 0.5, 6)
      expect(idx1).toBe(idx2)
    })

    test('should return index within bounds', () => {
      const maxIndices = [3, 6, 10, 100]
      const complexities = [0, 0.25, 0.5, 0.75, 1.0]

      maxIndices.forEach(maxIndex => {
        complexities.forEach(complexity => {
          const idx = generator.deterministicSelect('test-room', complexity, maxIndex)
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(maxIndex)
        })
      })
    })

    test('should vary with different complexity values', () => {
      const roomId = 'variation-test-room'
      const indices = new Set()

      // Test with different complexity values
      for (let c = 0; c <= 1; c += 0.1) {
        indices.add(generator.deterministicSelect(roomId, c, 10))
      }

      // Should produce some variation (not all same index)
      expect(indices.size).toBeGreaterThan(1)
    })

    test('should vary with different room IDs', () => {
      const indices = new Set()

      for (let i = 0; i < 20; i++) {
        indices.add(generator.deterministicSelect(`room-${i}`, 0.5, 6))
      }

      // Should use multiple indices across different rooms
      expect(indices.size).toBeGreaterThan(1)
    })

    test('should handle edge case complexity values', () => {
      expect(() => generator.deterministicSelect('room', 0, 3)).not.toThrow()
      expect(() => generator.deterministicSelect('room', 1, 3)).not.toThrow()
      expect(() => generator.deterministicSelect('room', 0.999, 3)).not.toThrow()
    })
  })

  describe('generateInitialAmbientPatterns() determinism', () => {
    test('should produce same patterns for same roomId', () => {
      const roomId = 'determinism-test-room'

      const patterns1 = generator.generateInitialAmbientPatterns(roomId)
      const patterns2 = generator.generateInitialAmbientPatterns(roomId)

      expect(patterns1[0].parameters.frequency).toBe(patterns2[0].parameters.frequency)
      expect(patterns1[0].parameters.amplitude).toBe(patterns2[0].parameters.amplitude)
    })

    test('should produce different patterns for different roomIds', () => {
      const patterns1 = generator.generateInitialAmbientPatterns('room-alpha')
      const patterns2 = generator.generateInitialAmbientPatterns('room-beta')

      // At least one parameter should differ
      const freqDiff = patterns1[0].parameters.frequency !== patterns2[0].parameters.frequency
      const ampDiff = patterns1[0].parameters.amplitude !== patterns2[0].parameters.amplitude

      expect(freqDiff || ampDiff).toBe(true)
    })

    test('should produce frequency within valid range (220-440Hz)', () => {
      const testRooms = ['room-1', 'room-2', 'room-3', 'test-abc', 'xyz-123']

      testRooms.forEach(roomId => {
        const patterns = generator.generateInitialAmbientPatterns(roomId)
        const freq = patterns[0].parameters.frequency
        expect(freq).toBeGreaterThanOrEqual(220)
        expect(freq).toBeLessThan(440)
      })
    })

    test('should produce amplitude within valid range (0.3-0.5)', () => {
      const testRooms = ['room-1', 'room-2', 'room-3', 'test-abc', 'xyz-123']

      testRooms.forEach(roomId => {
        const patterns = generator.generateInitialAmbientPatterns(roomId)
        const amp = patterns[0].parameters.amplitude
        expect(amp).toBeGreaterThanOrEqual(0.3)
        expect(amp).toBeLessThanOrEqual(0.5)
      })
    })
  })
})
