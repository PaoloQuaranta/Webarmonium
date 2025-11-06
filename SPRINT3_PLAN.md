# Sprint 3 Plan: Test Coverage + Dead Code Removal + Continued Modularization

**Date:** 2025-11-06
**Branch:** `claude/project-assessment-dev-011CUoLie3Btw4Vh41TCPmyU`
**Estimated Duration:** 3-5 hours
**Prerequisites:** Sprint 2 completed (AudioService + main.js refactoring)

---

## EXECUTIVE SUMMARY

Sprint 3 focuses on **establishing test safety** before removing dead code and continuing modularization. This sprint follows the pragmatic principle: **increase test coverage → remove dead code → continue extraction**.

**Primary Goals:**
1. ✅ Write unit tests for Sprint 2 extracted components (VolumeController, CanvasManager, UIManager)
2. ✅ Increase overall test coverage from ~20% to 50%+
3. ✅ Remove ~500 lines of dead code from AudioService (now safe with tests)
4. ✅ Extract 1-2 additional components from main.js

**Risk Mitigation:**
- Tests written BEFORE dead code removal
- Constitutional 90% coverage target deferred to later sprints
- Focus on critical path coverage (components we're refactoring)

---

## SPRINT 3 OBJECTIVES

### OBJECTIVE 1: Unit Test Sprint 2 Components ⏱️ 1-2 hours

**Goal:** Write comprehensive unit tests for all extracted components to establish safety baseline

**Tasks:**

#### 1.1 VolumeController Unit Tests
**File:** `frontend/tests/unit/VolumeController.test.js` (NEW)

**Test Cases:**
- ✅ Constructor initialization
- ✅ `setMasterVolumeNode()` - Tone.js integration
- ✅ `setVolume(volume)` - 0-1 to dB conversion (-60dB to 0dB)
- ✅ `setMuted(true/false)` - mute/unmute functionality
- ✅ `getVolume()` - returns correct volume
- ✅ `isMuted()` - returns correct mute state
- ✅ `getState()` - complete state snapshot
- ✅ Edge cases: volume=0, volume=1, rapid changes
- ✅ Error handling: null master volume node

**Target Coverage:** 90%+ for VolumeController

#### 1.2 CanvasManager Unit Tests
**File:** `frontend/tests/unit/CanvasManager.test.js` (NEW)

**Test Cases:**
- ✅ Constructor initialization
- ✅ `setup()` - canvas initialization, overlay creation
- ✅ `resize()` - window resize handling, device pixel ratio
- ✅ `addResizeListener()` - listener registration
- ✅ `notifyResizeListeners()` - listener notification
- ✅ `getDimensions()` - returns correct dimensions
- ✅ `destroy()` - cleanup event listeners
- ✅ Error handling: canvas element not found
- ✅ Multiple resize event handling

**Target Coverage:** 85%+ for CanvasManager

#### 1.3 UIManager Unit Tests
**File:** `frontend/tests/unit/UIManager.test.js` (NEW)

**Test Cases:**
- ✅ Constructor initialization
- ✅ `updateRoomDisplay()` - room info update
- ✅ `showApp()` - loading screen hide, app show
- ✅ `showError()` - error display
- ✅ `hideError()` - error hide
- ✅ `showLoading()` - loading screen show
- ✅ `setCurrentRoom()` - room state update
- ✅ `setUserCount()` - user count update
- ✅ `destroy()` - cleanup
- ✅ Error handling: missing DOM elements
- ✅ State consistency after multiple operations

**Target Coverage:** 90%+ for UIManager

#### Test Infrastructure Setup

**Create:** `frontend/tests/unit/` directory
**Create:** `frontend/jest.config.js` for frontend testing
**Install:** Jest + Testing Library (if not present)

**Jest Configuration:**
```javascript
module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/unit/**/*.test.js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/services/**/*.js',
    '!src/services/**/*.test.js'
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  }
}
```

---

### OBJECTIVE 2: Increase Overall Test Coverage ⏱️ 1 hour

**Goal:** Bring overall project test coverage from ~20% to 50%+

**Current State:**
- Backend: ~54 test files (contract + integration + unit)
- Frontend: ~5 integration tests, 0 unit tests for services
- Many tests are TDD placeholders (intentional failures)

**Strategy:**

#### 2.1 Frontend Service Coverage (Priority)
- ✅ VolumeController (90%+ target)
- ✅ CanvasManager (85%+ target)
- ✅ UIManager (90%+ target)
- ⏭️ AudioService - defer to Sprint 4 (too large)
- ⏭️ SocketService - defer to Sprint 4 (integration focused)

#### 2.2 Backend Service Coverage (Existing)
- ✅ RoomManager (existing tests)
- ✅ ColorAssignmentService (existing tests)
- ✅ DrawingSyncService (existing tests)
- ⏭️ Add tests for recently modified components

#### 2.3 Coverage Metrics Tracking
- Run `npm run test:coverage` for both frontend and backend
- Document coverage in Sprint 3 results
- Establish baseline for future sprints

**Target Coverage:**
- **Frontend services:** 60%+ (from ~0%)
- **Backend services:** Maintain 50%+ (already exists)
- **Overall project:** 50%+ (constitutional target: 90%)

---

### OBJECTIVE 3: Remove Dead Code from AudioService ⏱️ 30-45 minutes

**Goal:** Remove ~500 lines of disabled/dead code NOW THAT TESTS PROVIDE SAFETY

**Pre-Condition:** ✅ Tests written and passing

**Dead Code Identified (Sprint 2 Analysis):**

#### 3.1 Methods with Early Returns (Disabled)
**Lines to Remove:**
1. `handleHoverModulation()` - early return at start (~80 lines)
2. `performParameterUpdate()` - early return (~40 lines)
3. `startContinuousFilterUpdates()` - early return (~35 lines)
4. `applyContinuousLFOModulation()` - early return (~60 lines)
5. `applyUnifiedModulation()` - early return (~50 lines)
6. `setupRemoteFilterLFO()` - early return (~45 lines)
7. `stopRemoteFilterLFO()` - early return (~20 lines)
8. `applyTremolo()` - early return (~40 lines)

**Total:** ~370 lines

#### 3.2 Commented Out Blocks
**Lines to Remove:**
- Multiple `if (false && ...)` blocks (~50 lines)
- Dead initialization code (~30 lines)
- Unused event listeners (~20 lines)

**Total:** ~100 lines

#### 3.3 Unused Properties/Variables
- Dead state variables (~30 lines)

**Grand Total:** ~500 lines

**Removal Strategy:**
1. ✅ Verify tests pass before removal
2. ✅ Remove one method at a time
3. ✅ Run tests after each removal
4. ✅ Commit incrementally (not one large commit)
5. ✅ Document what was removed and why

**Safety Check:**
- Run all backend tests before each commit
- Verify no breaking changes in integration tests
- Check for any hidden dependencies (grep for method names)

**Expected Result:**
- AudioService: 3,870 → ~3,370 lines (-500, -12.9%)
- Zero functionality loss (all dead code)
- Improved readability and maintainability

---

### OBJECTIVE 4: Extract GestureProcessor from main.js ⏱️ 1-1.5 hours

**Goal:** Continue main.js modularization by extracting gesture processing logic

**Current State:**
- main.js: 1,293 lines after Sprint 2
- Gesture processing logic scattered across multiple methods

**GestureProcessor Responsibilities:**
```
GestureProcessor
├── Gesture action determination (tap vs drag vs hover)
├── Click gesture processing (single note)
├── Drag gesture processing (musical phrase)
├── Local phrase generation
├── Gesture speed/length calculations
├── Note calculation from gesture position
├── Articulation selection
```

**Methods to Extract (from main.js):**
1. `handleGesture(gesture)` - main entry point
2. `determineGestureAction(gesture)` - tap/drag discrimination
3. `processClickGesture(gesture, sonicParams)` - single note
4. `processDragGesture(gesture, sonicParams)` - phrase generation
5. `processGestureByAction(gesture, sonicParams)` - fallback
6. `generateLocalMusicalPhrase(gesture, sonicParams)`
7. `createLocalPhrase(gesture, sonicParams)`
8. `calculateGestureSpeed(gesture)`
9. `calculateGestureLength(gesture)`
10. `calculatePitchRange(sonicParams)`
11. `calculateNoteFromGesture(...)`
12. `selectArticulationFromGesture(...)`

**Estimated:** ~400 lines → GestureProcessor.js

**Integration Pattern:**
```javascript
// main.js constructor
this.gestureProcessor = new GestureProcessor(this.audioService)

// main.js delegation
handleGesture(gesture) {
  this.gestureProcessor.processGesture(gesture)
}
```

**Benefits:**
- Isolates complex gesture→music mapping logic
- Makes gesture logic testable independently
- Reduces main.js to ~900 lines
- Follows established delegation pattern

**Unit Tests:**
- Create `frontend/tests/unit/GestureProcessor.test.js`
- Test tap detection, drag detection, phrase generation
- Test musical mapping algorithms
- Target 80%+ coverage

---

## SPRINT 3 EXECUTION PLAN

### Phase 1: Test Infrastructure (30 min)
1. ✅ Create `frontend/tests/unit/` directory
2. ✅ Create `frontend/jest.config.js`
3. ✅ Install testing dependencies if needed
4. ✅ Create test helper utilities

### Phase 2: Component Unit Tests (1.5 hours)
1. ✅ Write VolumeController.test.js (30 min)
2. ✅ Write CanvasManager.test.js (30 min)
3. ✅ Write UIManager.test.js (30 min)
4. ✅ Run tests, fix issues, achieve 90%+ coverage (30 min)

### Phase 3: Dead Code Removal (45 min)
1. ✅ Verify all tests passing
2. ✅ Remove disabled methods one by one (30 min)
3. ✅ Run tests after each removal
4. ✅ Commit incrementally with descriptive messages (15 min)

### Phase 4: GestureProcessor Extraction (1.5 hours)
1. ✅ Create GestureProcessor.js with extracted methods (45 min)
2. ✅ Integrate into main.js with delegation (15 min)
3. ✅ Write GestureProcessor.test.js (30 min)
4. ✅ Update index.html, test, commit (15 min)

### Phase 5: Validation & Documentation (30 min)
1. ✅ Run full test suite
2. ✅ Generate coverage reports
3. ✅ Update SPRINT3_RESULTS.md
4. ✅ Push all commits to remote

**Total Estimated Time:** 4-5 hours

---

## SUCCESS CRITERIA

### Must-Have (Sprint 3 Complete):
- ✅ Unit tests for VolumeController (90%+ coverage)
- ✅ Unit tests for CanvasManager (85%+ coverage)
- ✅ Unit tests for UIManager (90%+ coverage)
- ✅ Overall frontend service coverage: 60%+
- ✅ Dead code removed from AudioService (~500 lines)
- ✅ GestureProcessor extracted from main.js
- ✅ Zero breaking changes
- ✅ All tests passing

### Nice-to-Have (Stretch Goals):
- ⏭️ Extract MusicalPhraseGenerator (if time permits)
- ⏭️ Additional AudioService tests
- ⏭️ Integration tests for extracted components

---

## RISKS & MITIGATION

### Risk 1: Dead Code Has Hidden Dependencies
**Mitigation:**
- Grep for method names before removal
- Run full test suite after each removal
- Incremental commits allow easy rollback

### Risk 2: Frontend Testing Infrastructure Missing
**Mitigation:**
- Use Jest with jsdom (lightweight setup)
- Mock Tone.js dependencies if needed
- Focus on logic, not rendering

### Risk 3: GestureProcessor Extraction Too Complex
**Mitigation:**
- Extract methods methodically
- Maintain backward compatibility
- If too complex, defer to Sprint 4

### Risk 4: Test Coverage Target Ambitious
**Mitigation:**
- Focus on critical path (extracted components)
- Defer AudioService tests to Sprint 4
- 50% overall coverage is realistic

---

## DEFERRED TO SPRINT 4

### Components to Extract Later:
- MusicalPhraseGenerator (~100 lines from main.js)
- EventCoordinator (~300 lines from main.js)
- RenderLoopController (~100 lines from main.js)
- AudioService sub-components (need more planning)

### Test Coverage Expansion:
- AudioService unit tests (complex, needs dedicated sprint)
- SocketService integration tests
- End-to-end multi-user scenarios

### Code Quality Improvements:
- ESLint rule enforcement
- Additional dead code in other files
- Documentation improvements

---

## METRICS TO TRACK

### Before Sprint 3:
- AudioService: 3,870 lines
- main.js: 1,293 lines
- **Total monolith:** 5,163 lines
- Frontend service coverage: ~0%
- Overall project coverage: ~20%

### After Sprint 3 (Targets):
- AudioService: ~3,370 lines (-500, -12.9%)
- main.js: ~900 lines (-393, -30.4%)
- **Total monolith:** ~4,270 lines (-893, -17.3%)
- GestureProcessor: 400 lines (NEW)
- Frontend service coverage: 60%+
- Overall project coverage: 50%+

---

## COMMIT STRATEGY

### Commit Pattern:
```
Sprint 3: [Component] - [Action]

Examples:
- Sprint 3: Add VolumeController unit tests (90% coverage)
- Sprint 3: Add CanvasManager unit tests (85% coverage)
- Sprint 3: Add UIManager unit tests (90% coverage)
- Sprint 3: Remove disabled handleHoverModulation method
- Sprint 3: Remove dead filter modulation code
- Sprint 3: Extract GestureProcessor from main.js
- Sprint 3: Add GestureProcessor unit tests
- Sprint 3: Results and metrics documentation
```

### Commit Frequency:
- One commit per component test suite
- One commit per dead code removal batch
- One commit for GestureProcessor extraction
- One commit for GestureProcessor tests
- One commit for documentation

**Total Expected Commits:** 8-12

---

## NEXT STEPS AFTER SPRINT 3

### Sprint 4 (Future):
1. **AudioService Deep Testing:** Write comprehensive unit tests for remaining AudioService methods
2. **More Component Extraction:** MusicalPhraseGenerator, EventCoordinator, RenderLoopController
3. **AudioService Modularization:** Begin extracting sub-components (LFOSystem, FilterSystem, etc.)
4. **Coverage Push:** Increase from 50% → 70%

### Sprint 5-10 (Long-term):
- Follow 15-week refactoring roadmap
- Extract remaining 11 components from AudioService
- Resolve circular dependencies
- Unify overlapping LFO systems
- Achieve 90%+ test coverage (constitutional requirement)

---

**Sprint 3 Status:** 🚀 **READY TO EXECUTE**
**Risk Level:** 🟡 **Medium** (safe with incremental approach)
**Expected Value:** 🟢 **High** (testing foundation + continued refactoring)

---

*Generated: 2025-11-06*
*Branch: claude/project-assessment-dev-011CUoLie3Btw4Vh41TCPmyU*
*Author: Claude (Sprint 3 Planning)*
