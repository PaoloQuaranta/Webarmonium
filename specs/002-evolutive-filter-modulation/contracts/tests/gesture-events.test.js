/**
 * Contract Tests: Gesture Events API
 * Feature: Generative Multi-User Musical Composition System
 * These tests MUST fail initially - implementation should make them pass
 */

const request = require('supertest');
const app = require('../../../backend/src/server');

describe('Gesture Events API', () => {
  describe('POST /api/rooms/:id/gestures', () => {
    it('should accept valid gesture and return musical event', async () => {
      const gestureData = {
        userId: 'test-user-123',
        gesture: {
          startPosition: { x: 100, y: 200 },
          endPosition: { x: 300, y: 400 },
          speed: 150,
          direction: 'diagonal-up',
          timestamp: Date.now()
        }
      };

      const response = await request(app)
        .post('/api/rooms/test-room-123/gestures')
        .send(gestureData)
        .expect(200);

      expect(response.body).toHaveProperty('musicalEvent');
      expect(response.body.musicalEvent).toHaveProperty('eventId');
      expect(response.body.musicalEvent).toHaveProperty('pitch');
      expect(response.body.musicalEvent).toHaveProperty('duration');
      expect(response.body.musicalEvent).toHaveProperty('velocity');
      expect(response.body.musicalEvent).toHaveProperty('articulation');

      // Verify pitch is within MIDI range
      expect(response.body.musicalEvent.pitch).toBeGreaterThanOrEqual(0);
      expect(response.body.musicalEvent.pitch).toBeLessThanOrEqual(127);

      // Verify velocity is within valid range
      expect(response.body.musicalEvent.velocity).toBeGreaterThanOrEqual(0);
      expect(response.body.musicalEvent.velocity).toBeLessThanOrEqual(127);
    });

    it('should reject gesture with invalid coordinates', async () => {
      const invalidGesture = {
        userId: 'test-user-123',
        gesture: {
          startPosition: { x: -100, y: 200 }, // Invalid negative X
          endPosition: { x: 300, y: 400 },
          speed: 150,
          direction: 'diagonal-up',
          timestamp: Date.now()
        }
      };

      await request(app)
        .post('/api/rooms/test-room-123/gestures')
        .send(invalidGesture)
        .expect(400);
    });

    it('should reject gesture missing required fields', async () => {
      const incompleteGesture = {
        userId: 'test-user-123',
        gesture: {
          startPosition: { x: 100, y: 200 }
          // Missing endPosition, speed, direction, timestamp
        }
      };

      await request(app)
        .post('/api/rooms/test-room-123/gestures')
        .send(incompleteGesture)
        .expect(400);
    });

    it('should return 404 for non-existent room', async () => {
      const gestureData = {
        userId: 'test-user-123',
        gesture: {
          startPosition: { x: 100, y: 200 },
          endPosition: { x: 300, y: 400 },
          speed: 150,
          direction: 'diagonal-up',
          timestamp: Date.now()
        }
      };

      await request(app)
        .post('/api/rooms/non-existent-room/gestures')
        .send(gestureData)
        .expect(404);
    });
  });

  describe('GET /api/rooms/:id/musical-events', () => {
    it('should return recent musical events for room', async () => {
      const response = await request(app)
        .get('/api/rooms/test-room-123/musical-events')
        .expect(200);

      expect(response.body).toHaveProperty('events');
      expect(Array.isArray(response.body.events)).toBe(true);
      expect(response.body).toHaveProperty('roomId', 'test-room-123');

      // Each event should have required fields
      response.body.events.forEach(event => {
        expect(event).toHaveProperty('eventId');
        expect(event).toHaveProperty('userId');
        expect(event).toHaveProperty('pitch');
        expect(event).toHaveProperty('duration');
        expect(event).toHaveProperty('timestamp');
      });
    });

    it('should return empty array for room with no events', async () => {
      const response = await request(app)
        .get('/api/rooms/empty-room-456/musical-events')
        .expect(200);

      expect(response.body.events).toEqual([]);
    });
  });
});

describe('Pattern Recognition API', () => {
  describe('GET /api/rooms/:id/patterns', () => {
    it('should return detected patterns for room', async () => {
      const response = await request(app)
        .get('/api/rooms/test-room-123/patterns')
        .expect(200);

      expect(response.body).toHaveProperty('patterns');
      expect(Array.isArray(response.body.patterns)).toBe(true);
      expect(response.body).toHaveProperty('roomId', 'test-room-123');

      // Each pattern should have required fields
      response.body.patterns.forEach(pattern => {
        expect(pattern).toHaveProperty('signature');
        expect(pattern).toHaveProperty('frequency');
        expect(pattern).toHaveProperty('integrationLevel');
        expect(pattern).toHaveProperty('similarPhrases');
        expect(Array.isArray(pattern.similarPhrases)).toBe(true);
      });
    });
  });

  describe('POST /api/rooms/:id/patterns/analyze', () => {
    it('should trigger pattern analysis for room', async () => {
      const response = await request(app)
        .post('/api/rooms/test-room-123/patterns/analyze')
        .send({
          timeWindow: 120000, // 2 minutes in milliseconds
          similarityThreshold: 0.8
        })
        .expect(200);

      expect(response.body).toHaveProperty('analysisId');
      expect(response.body).toHaveProperty('status', 'initiated');
    });
  });
});

describe('Composition API', () => {
  describe('GET /api/rooms/:id/composition', () => {
    it('should return current background composition', async () => {
      const response = await request(app)
        .get('/api/rooms/test-room-123/composition')
        .expect(200);

      expect(response.body).toHaveProperty('composition');
      expect(response.body).toHaveProperty('roomId', 'test-room-123');

      const composition = response.body.composition;
      expect(composition).toHaveProperty('activityLevel');
      expect(composition).toHaveProperty('mood');
      expect(composition).toHaveProperty('elements');
      expect(composition).toHaveProperty('musicalClock');

      // Validate mood structure
      expect(composition.mood).toHaveProperty('energy');
      expect(composition.mood).toHaveProperty('complexity');
      expect(composition.mood).toHaveProperty('style');
      expect(composition.mood.style).toHaveProperty('classical');
      expect(composition.mood.style).toHaveProperty('ambient');
      expect(composition.mood.style).toHaveProperty('electronic');

      // Validate musical clock
      expect(composition.musicalClock).toHaveProperty('currentBeat');
      expect(composition.musicalClock).toHaveProperty('tempo');
      expect(composition.musicalClock).toHaveProperty('timeSignature');

      // All numeric values should be in valid ranges
      expect(composition.activityLevel).toBeGreaterThanOrEqual(0);
      expect(composition.activityLevel).toBeLessThanOrEqual(1);
      expect(composition.mood.energy).toBeGreaterThanOrEqual(0);
      expect(composition.mood.energy).toBeLessThanOrEqual(1);
      expect(composition.mood.complexity).toBeGreaterThanOrEqual(0);
      expect(composition.mood.complexity).toBeLessThanOrEqual(1);
    });
  });

  describe('PUT /api/rooms/:id/composition/mood', () => {
    it('should update composition mood parameters', async () => {
      const moodUpdate = {
        energy: 0.8,
        complexity: 0.6,
        style: {
          classical: 0.3,
          ambient: 0.4,
          electronic: 0.3
        }
      };

      const response = await request(app)
        .put('/api/rooms/test-room-123/composition/mood')
        .send(moodUpdate)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('updatedMood');
      expect(response.body.updatedMood).toMatchObject(moodUpdate);
    });

    it('should reject invalid mood values', async () => {
      const invalidMood = {
        energy: 1.5, // Invalid: > 1
        complexity: -0.1, // Invalid: < 0
        style: {
          classical: 0.3,
          ambient: 0.4,
          electronic: 0.5 // Invalid: sum > 1
        }
      };

      await request(app)
        .put('/api/rooms/test-room-123/composition/mood')
        .send(invalidMood)
        .expect(400);
    });
  });
});

describe('Voice Resource Management API', () => {
  describe('GET /api/rooms/:id/voices', () => {
    it('should return voice allocation status', async () => {
      const response = await request(app)
        .get('/api/rooms/test-room-123/voices')
        .expect(200);

      expect(response.body).toHaveProperty('voices');
      expect(response.body).toHaveProperty('allocation');
      expect(response.body).toHaveProperty('roomId', 'test-room-123');

      // Validate allocation structure
      expect(response.body.allocation).toHaveProperty('totalAvailable');
      expect(response.body.allocation).toHaveProperty('totalUsed');
      expect(response.body.allocation).toHaveProperty('gestureVoices');
      expect(response.body.allocation).toHaveProperty('backgroundVoices');

      // Each voice should have required fields
      response.body.voices.forEach(voice => {
        expect(voice).toHaveProperty('voiceId');
        expect(voice).toHaveProperty('type'); // 'gesture' or 'background'
        expect(voice).toHaveProperty('status'); // 'active', 'idle', 'reserved'
        expect(voice).toHaveProperty('instrument');
      });
    });
  });

  describe('POST /api/rooms/:id/voices/allocate', () => {
    it('should allocate voice for user gesture', async () => {
      const allocationRequest = {
        userId: 'test-user-123',
        type: 'gesture',
        deviceCapabilities: {
          maxVoices: 8,
          audioLatency: 50,
          platform: 'web'
        }
      };

      const response = await request(app)
        .post('/api/rooms/test-room-123/voices/allocate')
        .send(allocationRequest)
        .expect(200);

      expect(response.body).toHaveProperty('voiceId');
      expect(response.body).toHaveProperty('allocated', true);
      expect(response.body).toHaveProperty('instrument');
    });

    it('should reject allocation when no voices available', async () => {
      // Mock scenario with no available voices
      const allocationRequest = {
        userId: 'test-user-123',
        type: 'gesture',
        deviceCapabilities: {
          maxVoices: 1, // Very limited
          audioLatency: 100,
          platform: 'mobile'
        }
      };

      // This should fail if all voices are already allocated
      await request(app)
        .post('/api/rooms/full-room-789/voices/allocate')
        .send(allocationRequest)
        .expect(429); // Too Many Requests - resource exhausted
    });
  });
});

describe('Musical Clock API', () => {
  describe('GET /api/rooms/:id/clock', () => {
    it('should return current musical clock state', async () => {
      const response = await request(app)
        .get('/api/rooms/test-room-123/clock')
        .expect(200);

      expect(response.body).toHaveProperty('musicalClock');
      expect(response.body).toHaveProperty('roomId', 'test-room-123');

      const clock = response.body.musicalClock;
      expect(clock).toHaveProperty('currentBeat');
      expect(clock).toHaveProperty('tempo');
      expect(clock).toHaveProperty('timeSignature');
      expect(clock).toHaveProperty('isRunning');
      expect(clock).toHaveProperty('startTime');

      // Validate tempo is within musical bounds
      expect(clock.tempo).toBeGreaterThanOrEqual(40);
      expect(clock.tempo).toBeLessThanOrEqual(200);

      // Validate time signature
      expect(clock.timeSignature).toHaveProperty('numerator');
      expect(clock.timeSignature).toHaveProperty('denominator');
      expect(clock.timeSignature.numerator).toBeGreaterThan(0);
      expect(clock.timeSignature.denominator).toBeGreaterThan(0);
    });
  });

  describe('POST /api/rooms/:id/clock/sync', () => {
    it('should synchronize client with musical clock', async () => {
      const syncRequest = {
        clientTime: Date.now(),
        lastKnownBeat: 0,
        requestedTempo: 120
      };

      const response = await request(app)
        .post('/api/rooms/test-room-123/clock/sync')
        .send(syncRequest)
        .expect(200);

      expect(response.body).toHaveProperty('musicalClock');
      expect(response.body).toHaveProperty('syncOffset');
      expect(response.body).toHaveProperty('serverTime');

      // Sync offset should be reasonable (not too large)
      expect(Math.abs(response.body.syncOffset)).toBeLessThan(1000); // < 1 second
    });
  });
});