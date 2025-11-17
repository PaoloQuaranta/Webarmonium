# Sprint 5 Plan: GestureProcessor Testing

**Sprint Goal:** Write comprehensive unit tests for GestureProcessor component
**Target Duration:** 2-3 hours
**Coverage Target:** 80%+ code coverage
**Test Count Target:** 60+ test cases

---

## Overview

Sprint 5 focuses on writing comprehensive unit tests for the GestureProcessor component extracted in Sprint 4. This will ensure the gesture processing logic is robust, well-tested, and maintainable.

### Success Criteria

- ✅ 60+ test cases covering all GestureProcessor methods
- ✅ 80%+ code coverage for GestureProcessor.js
- ✅ All tests passing
- ✅ No regressions in existing test suites
- ✅ Clear test documentation and organization

---

## Phase 1: Test Infrastructure (15 minutes)

### Task 1.1: Create Test File
Create `frontend/tests/unit/GestureProcessor.test.js` with proper structure.

**Template:**
```javascript
/**
 * GestureProcessor Unit Tests
 * Tests for gesture-to-music processing component
 */

const GestureProcessor = require('../../src/services/GestureProcessor')

describe('GestureProcessor', () => {
  // Test suites organized by method
})
```

### Task 1.2: Create Test Helpers
Create mock factories for:
- Mock AudioService with gestureSynth
- Mock SocketService with sendGesture
- Mock gesture data (tap, drag, hover)
- Mock sonic parameters

**Mock Factories:**
```javascript
const createMockAudioService = () => ({
  playThreeTierNote: jest.fn(),
  playMusicalEvent: jest.fn(),
  gestureSynth: {
    set: jest.fn(),
    triggerAttackRelease: jest.fn(),
    releaseAll: jest.fn()
  },
  isInitialized: true
})

const createMockSocketService = () => ({
  sendGesture: jest.fn()
})

const createTapGesture = (overrides = {}) => ({
  id: 'tap-123',
  coordinates: { x: 0.5, y: 0.5 },
  intensity: 0.7,
  timestamp: Date.now(),
  duration: 100,
  size: 0.02,
  device: 'mouse',
  ...overrides
})

const createDragGesture = (overrides = {}) => ({
  id: 'drag-456',
  coordinates: { x: 0.6, y: 0.4 },
  intensity: 0.8,
  timestamp: Date.now(),
  duration: 500,
  size: 0.15,
  velocity: 150,
  dx: 0.2,
  dy: 0.1,
  device: 'mouse',
  ...overrides
})
```

---

## Phase 2: Core Method Tests (60 minutes)

### Test Suite 2.1: Constructor Tests (5 tests)
```javascript
describe('Constructor', () => {
  test('should initialize with required dependencies')
  test('should initialize state properties to defaults')
  test('should set lastDragPhraseTime to 0')
  test('should set gestureTimer to null')
  test('should set pendingGesture to null')
})
```

### Test Suite 2.2: processGesture() Tests (12 tests)
```javascript
describe('processGesture()', () => {
  test('should send gesture to server via socketService')
  test('should draw gesture trail when audio not started')
  test('should return early when audio not started')
  test('should delegate to processClickGesture for tap gestures')
  test('should delegate to processDragGesture for drag gestures')
  test('should use gesture.action if provided')
  test('should determine action if gesture.action is missing')
  test('should clear existing timer before new gesture')
  test('should create 500ms timer for drag gestures')
  test('should handle processGestureByAction for unknown actions')
  test('should clear pending gesture after processing')
  test('should handle missing coordinates gracefully')
})
```

### Test Suite 2.3: determineGestureAction() Tests (8 tests)
```javascript
describe('determineGestureAction()', () => {
  test('should identify tap for duration < 200ms and size < 0.05')
  test('should identify drag for duration >= 200ms')
  test('should identify drag for size >= 0.05')
  test('should handle missing duration property')
  test('should handle missing size property')
  test('should handle zero duration')
  test('should handle edge case: duration = 199ms, size = 0.049')
  test('should handle edge case: duration = 200ms, size = 0.05')
})
```

### Test Suite 2.4: processClickGesture() Tests (10 tests)
```javascript
describe('processClickGesture()', () => {
  test('should calculate frequency from Y position (octave base)')
  test('should calculate frequency from X position (within octave)')
  test('should generate frequencies in range 110Hz-1210Hz')
  test('should use fixed volume of 0.5')
  test('should use 32n duration for clicks')
  test('should configure synth with oscillator type based on tier')
  test('should set envelope for percussive notes')
  test('should trigger note with gestureSynth')
  test('should increment tapCallCount')
  test('should handle missing audioService gracefully')
})
```

### Test Suite 2.5: processDragGesture() Tests (12 tests)
```javascript
describe('processDragGesture()', () => {
  test('should throttle drag phrases (500ms minimum)')
  test('should allow drag after throttle period')
  test('should calculate velocity from dx/dy if not provided')
  test('should generate 2-5 notes based on velocity')
  test('should generate 2 notes for low velocity (< 50)')
  test('should generate 5 notes for high velocity (>= 125)')
  test('should calculate base frequency from Y position')
  test('should create rhythmic spacing (180ms + random)')
  test('should add frequency variation to each note')
  test('should use duration range 150-400ms')
  test('should handle invalid velocity gracefully')
  test('should schedule notes via setTimeout')
})
```

---

## Phase 3: Helper Method Tests (30 minutes)

### Test Suite 3.1: Calculation Helpers (10 tests)
```javascript
describe('calculateGestureSpeed()', () => {
  test('should return gesture.speed if available')
  test('should return fallback value if speed missing')
  test('should return value in range 0-1')
})

describe('calculateGestureLength()', () => {
  test('should return gesture.intensity if available')
  test('should return 0.5 if intensity missing')
})

describe('calculatePitchRange()', () => {
  test('should map Y position to MIDI range')
  test('should invert Y coordinate (top = high notes)')
  test('should handle Y = 0 (bottom, low notes)')
  test('should handle Y = 1 (top, high notes)')
  test('should handle missing Y coordinate')
})
```

### Test Suite 3.2: Musical Helpers (8 tests)
```javascript
describe('calculateNoteFromGesture()', () => {
  test('should calculate MIDI pitch from position')
  test('should respect pitch range min/max')
  test('should round to nearest integer')
  test('should handle noteIndex = 0 (first note)')
  test('should handle noteIndex = totalNotes - 1 (last note)')
})

describe('selectArticulationFromGesture()', () => {
  test('should return "accent" for first note')
  test('should return "legato" for last note')
  test('should vary articulation based on intensity')
})
```

---

## Phase 4: Complex Method Tests (30 minutes)

### Test Suite 4.1: Musical Phrase Generation (8 tests)
```javascript
describe('generateLocalMusicalPhrase()', () => {
  test('should create phrase via createLocalPhrase')
  test('should schedule notes with setTimeout')
  test('should play each note via audioService.playMusicalEvent')
  test('should handle audioService not initialized')
  test('should log errors for failed note playback')
  test('should convert startTime from seconds to milliseconds')
  test('should create phrase with correct length')
  test('should handle errors gracefully')
})

describe('createLocalPhrase()', () => {
  test('should always generate 5 notes')
  test('should adjust base duration for slow gestures')
  test('should adjust base duration for medium gestures')
  test('should adjust base duration for fast gestures')
  test('should apply rhythmic variations (accent/legato/staccato)')
  test('should create first note with accent')
  test('should create last note with legato')
  test('should calculate pitch for each note')
  test('should set velocity in range 60-80')
  test('should create overlapping notes (0.9 spacing)')
})
```

### Test Suite 4.2: Fallback Processing (3 tests)
```javascript
describe('processGestureByAction()', () => {
  test('should play fallback note at 440Hz')
  test('should use local tier')
  test('should use volume 0.5')
})
```

---

## Phase 5: Integration & Edge Cases (30 minutes)

### Test Suite 5.1: Integration Tests (6 tests)
```javascript
describe('Integration', () => {
  test('should work with real Tone.js AudioService mock')
  test('should send gestures via SocketService')
  test('should call drawGestureTrailCallback when audio not started')
  test('should handle rapid tap sequences')
  test('should handle rapid drag sequences')
  test('should handle tap-drag-tap sequence')
})
```

### Test Suite 5.2: Edge Cases (10 tests)
```javascript
describe('Edge Cases', () => {
  test('should handle gesture with missing coordinates')
  test('should handle gesture with null coordinates')
  test('should handle gesture with invalid intensity')
  test('should handle gesture with NaN velocity')
  test('should handle gesture with negative values')
  test('should handle very high velocity (> 1000)')
  test('should handle timer race conditions')
  test('should handle multiple pending gestures')
  test('should handle audioService.gestureSynth missing')
  test('should handle socketService.sendGesture missing')
})
```

---

## Phase 6: Test Execution & Coverage (15 minutes)

### Task 6.1: Run Test Suite
```bash
cd frontend
npm test -- tests/unit/GestureProcessor.test.js
```

### Task 6.2: Check Coverage
```bash
npm test -- tests/unit/GestureProcessor.test.js --coverage
```

**Coverage Targets:**
- Statements: 80%+
- Branches: 75%+
- Functions: 85%+
- Lines: 80%+

### Task 6.3: Verify No Regressions
```bash
npm test
```

All existing tests should continue to pass.

---

## Test Organization

### File Structure
```
frontend/tests/unit/GestureProcessor.test.js
├── Test Helpers (Mock Factories)
├── Constructor Tests (5 tests)
├── processGesture() Tests (12 tests)
├── determineGestureAction() Tests (8 tests)
├── processClickGesture() Tests (10 tests)
├── processDragGesture() Tests (12 tests)
├── calculateGestureSpeed() Tests (3 tests)
├── calculateGestureLength() Tests (2 tests)
├── calculatePitchRange() Tests (5 tests)
├── calculateNoteFromGesture() Tests (5 tests)
├── selectArticulationFromGesture() Tests (3 tests)
├── generateLocalMusicalPhrase() Tests (8 tests)
├── createLocalPhrase() Tests (10 tests)
├── processGestureByAction() Tests (3 tests)
├── Integration Tests (6 tests)
└── Edge Cases Tests (10 tests)
```

**Total Test Cases:** 102 tests (exceeds 60+ target)

---

## Coverage Strategy

### High Priority (Must Cover)
- ✅ processGesture() - Main entry point
- ✅ determineGestureAction() - Critical for tap/drag discrimination
- ✅ processClickGesture() - Tap note generation
- ✅ processDragGesture() - Phrase generation
- ✅ createLocalPhrase() - Musical logic

### Medium Priority (Should Cover)
- ✅ Calculation helpers (speed, pitch, articulation)
- ✅ Musical phrase generation
- ✅ Throttling and timer logic

### Low Priority (Nice to Have)
- ✅ Fallback processing
- ✅ Edge cases with invalid data

---

## Risk Mitigation

### Known Challenges

**1. Async Timer Testing**
- **Challenge:** processDragGesture uses setTimeout
- **Solution:** Use Jest fake timers
```javascript
jest.useFakeTimers()
processor.processDragGesture(gesture, sonicParams)
jest.advanceTimersByTime(500)
expect(/* timer executed */)
jest.useRealTimers()
```

**2. Tone.js Mocking**
- **Challenge:** GestureProcessor expects Tone.now()
- **Solution:** Mock global Tone object
```javascript
global.Tone = {
  now: jest.fn(() => 0)
}
```

**3. Random Values**
- **Challenge:** Some calculations use Math.random()
- **Solution:** Mock Math.random for deterministic tests
```javascript
const mockRandom = jest.spyOn(Math, 'random')
mockRandom.mockReturnValue(0.5)
// ... test
mockRandom.mockRestore()
```

**4. State Management**
- **Challenge:** Tests may affect each other via shared state
- **Solution:** Create fresh instance for each test
```javascript
let processor
beforeEach(() => {
  processor = new GestureProcessor(mockAudio, mockSocket, mockCallback)
})
```

---

## Success Metrics

### Quantitative
- ✅ 102 test cases (exceeds 60+ target)
- ✅ 80%+ code coverage
- ✅ All tests passing
- ✅ < 5 second test execution time

### Qualitative
- ✅ Tests are readable and well-documented
- ✅ Tests cover real-world scenarios
- ✅ Tests catch regressions
- ✅ Tests serve as documentation

---

## Deliverables

1. **GestureProcessor.test.js** - 102 comprehensive test cases
2. **Coverage Report** - 80%+ coverage achieved
3. **Test Execution Report** - All tests passing
4. **Sprint 5 Results Document** - Comprehensive documentation

---

## Timeline Estimate

| Phase | Task | Duration |
|-------|------|----------|
| 1 | Test Infrastructure | 15 min |
| 2 | Core Method Tests | 60 min |
| 3 | Helper Method Tests | 30 min |
| 4 | Complex Method Tests | 30 min |
| 5 | Integration & Edge Cases | 30 min |
| 6 | Test Execution & Coverage | 15 min |
| **Total** | | **3 hours** |

---

## Next Steps After Sprint 5

1. **Sprint 6**: Integration tests for multi-user gesture synchronization
2. **Sprint 7**: Performance testing and optimization
3. **Sprint 8**: E2E tests with Puppeteer
4. **Sprint 9**: AudioService continued refactoring (still 3,680 lines)

---

**Sprint 5 Status:** 🚀 READY TO START
**Target Completion:** 2-3 hours
**Primary Goal:** 80%+ test coverage for GestureProcessor
