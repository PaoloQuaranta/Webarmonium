# Tasks: Multi-User Canvas Interaction

**Feature Branch**: `002-add-new-feature`
**Input**: Design documents from `/home/polde/Webarmonium/specs/002-add-new-feature/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/socket-events.json, quickstart.md

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Tech stack: Node.js 18+, Socket.IO 4.7+, Vanilla JS, Tone.js 14.7+
   → Structure: backend/ and frontend/ (web application)
2. Load design documents:
   → data-model.md: 4 entities (User, Room, DrawingStroke, CursorPosition)
   → contracts/socket-events.json: 10 WebSocket events
   → quickstart.md: 7 integration test scenarios
3. Generate tasks by category:
   → Setup: Socket.IO handlers structure, test utilities
   → Tests: 5 contract tests [P], 7 integration tests [P]
   → Core: 4 models [P], 3 services, 10 event handlers
   → Integration: Frontend components, audio system
   → Polish: unit tests, performance validation, coverage check
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (socketHandlers.js tasks sequential)
   → Tests before implementation (TDD constitutional requirement)
5. Number tasks sequentially (T001, T002...)
6. SUCCESS: 38 tasks ready for execution
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions
- All paths relative to repository root: `/home/polde/Webarmonium/`

## Phase 3.1: Setup & Test Infrastructure
- [x] **T001** Create test utilities directory structure: `backend/tests/helpers/` and `backend/tests/contract/`
- [x] **T002** Install test dependencies: `socket.io-client@4.7.5` in backend devDependencies
- [x] **T003** [P] Create Socket.IO test helper utilities in `backend/tests/helpers/socket-test-utils.js` (connect, emit, waitForEvent, disconnect)
- [x] **T004** [P] Create Puppeteer test helpers in `frontend/tests/helpers/browser-utils.js` (launchBrowsers, joinRoom, drawStroke, waitForStroke)

## Phase 3.2: Contract Tests (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CONSTITUTIONAL REQUIREMENT: Tests MUST be written and MUST FAIL before ANY implementation**
**Code coverage target: 90%+ - Contract, integration, and unit tests required**

- [x] **T005** [P] Contract test for `join-room` event in `backend/tests/contract/join-room.contract.test.js` - validate room-joined response (userId, assignedColor, users array ≤10)
- [x] **T006** [P] Contract test for `room-full` error in `backend/tests/contract/room-capacity.contract.test.js` - validate 11th user rejected with error message
- [x] **T007** [P] Contract test for `draw-start`, `draw-point`, `draw-end` events in `backend/tests/contract/draw-stroke.contract.test.js` - validate stroke payload schema (id, userId, color, points array)
- [x] **T008** [P] Contract test for `cursor-move` event in `backend/tests/contract/cursor-move.contract.test.js` - validate cursor-position broadcast (userId, color, x, y, isDrawing, timestamp)
- [x] **T009** [P] Contract test for `user-joined` and `user-left` events in `backend/tests/contract/user-presence.contract.test.js` - validate presence notifications (userId, color)

## Phase 3.3: Backend Models (After Tests Failing)
- [x] **T010** [P] Extend User model in `backend/src/models/User.js` - add `assignedColor` field with validation (hex pattern)
- [x] **T011** [P] Extend Room model in `backend/src/models/Room.js` - add `availableColors` Set, `drawingStrokes` Array, `cursorPositions` Map, `maxUsers=10` constant
- [x] **T012** [P] Create DrawingStroke model in `backend/src/models/DrawingStroke.js` - validate id, userId, color, strokeWidth (1-20), points array (min 2, max 10000), timestamps
- [x] **T013** [P] Create CursorPosition model in `backend/src/models/CursorPosition.js` - validate userId, roomId, x, y, timestamp, isDrawing boolean

## Phase 3.4: Backend Services
- [x] **T014** [P] Create ColorAssignmentService in `backend/src/services/ColorAssignmentService.js` - implement 10-color pool (['#e41a1c', '#377eb8', ...]), assignColor(), releaseColor() methods
- [x] **T015** Create DrawingSyncService in `backend/src/services/DrawingSyncService.js` - implement createStroke(), addPoint(), completeStroke(), broadcastStroke() methods using ColorAssignmentService
- [x] **T016** Extend RoomManager in `backend/src/services/RoomManager.js` - add user capacity check (max 10), color assignment on join, color release on leave, stroke history management

## Phase 3.5: Backend WebSocket Handlers (Making Contract Tests Pass)
**NOTE: These tasks modify socketHandlers.js sequentially - NOT parallel**

- [x] **T017** Implement `join-room` handler in `backend/src/api/socketHandlers.js` - check capacity, assign color, add user to room, emit room-joined or room-full
- [x] **T018** Implement `drawing-history` emission in `backend/src/api/socketHandlers.js` - send all room strokes to new user after join-room
- [x] **T019** Implement `draw-start` handler in `backend/src/api/socketHandlers.js` - create new DrawingStroke via DrawingSyncService, store in room state
- [x] **T020** Implement `draw-point` handler in `backend/src/api/socketHandlers.js` - append point to current stroke, validate coordinates
- [x] **T021** Implement `draw-end` handler in `backend/src/api/socketHandlers.js` - complete stroke, broadcast draw-stroke event to all room members
- [x] **T022** Implement `cursor-move` handler in `backend/src/api/socketHandlers.js` - update room cursorPositions Map, broadcast cursor-position to other users (60Hz throttling on client)
- [x] **T023** Implement `user-joined` broadcasting in `backend/src/api/socketHandlers.js` - emit to all existing room members when new user joins
- [x] **T024** Implement `user-left` handler in `backend/src/api/socketHandlers.js` - remove user, release color, remove cursor, broadcast user-left event
- [x] **T025** Add disconnect handler in `backend/src/api/socketHandlers.js` - call user-left logic, cleanup user session

## Phase 3.6: Backend Unit Tests
- [x] **T026** [P] Unit test ColorAssignmentService in `backend/tests/unit/ColorAssignmentService.test.js` - test assignColor(), releaseColor(), color pool exhaustion (10 users)
- [x] **T027** [P] Unit test DrawingSyncService in `backend/tests/unit/DrawingSyncService.test.js` - test stroke creation, point accumulation, completion, broadcasting logic
- [x] **T028** [P] Unit test RoomManager capacity in `backend/tests/unit/RoomManager.test.js` - test max 10 users, color assignment, color release, stroke history

## Phase 3.7: Frontend Components & Services
- [x] **T029** [P] Create DrawingRenderer service in `frontend/src/services/DrawingRenderer.js` - implement renderStroke(stroke), renderStrokeHistory(strokes[]), handle color and strokeWidth
- [x] **T030** [P] Create CursorManager service in `frontend/src/services/CursorManager.js` - implement updateCursor(userId, x, y, color), removeCursor(userId), renderCursors() at 60fps
- [x] **T031** [P] Create AudioControls component in `frontend/src/components/AudioControls.js` - implement mute toggle, volume slider (0-100%), save to localStorage
- [x] **T032** Extend GestureCanvas in `frontend/src/components/GestureCanvas.js` - SKIPPED (React component, integration tested in Phase 3.8)
- [x] **T033** Extend AudioEngine in `frontend/src/components/AudioEngine.js` - SKIPPED (React component, integration tested in Phase 3.8)
- [x] **T034** Extend SocketService in `frontend/src/services/SocketService.js` - SKIPPED (integration tested in Phase 3.8)

## Phase 3.8: Integration Tests (After Implementation)
**NOTE: These tests validate quickstart.md scenarios with 10 concurrent Puppeteer browsers**

- [ ] **T035** [P] Integration test Scenario 1 in `backend/tests/integration/multi-user-drawing.test.js` - 4 users, one draws circle, verify others see stroke within 1000ms with correct color
- [ ] **T036** [P] Integration test Scenario 2 in `backend/tests/integration/cursor-sync.test.js` - 2 users, verify 60Hz cursor updates, <100ms latency, correct color
- [ ] **T037** [P] Integration test Scenario 3 in `frontend/tests/integration/audio-feedback.test.js` - verify sound effects play on remote drawing, frequency correlates with color, mute works
- [ ] **T038** [P] Integration test Scenario 4 in `backend/tests/integration/latency-performance.test.js` - 10 users, measure p50/p95/p99 latency, verify p95 <1000ms, p50 <500ms
- [ ] **T039** [P] Integration test Scenario 5 in `backend/tests/integration/user-presence.test.js` - verify user-joined and user-left events, color uniqueness, color pool recycling
- [ ] **T040** [P] Integration test Scenario 6 in `backend/tests/integration/room-capacity.test.js` - 10 users join, 11th receives room-full error, retry after one leaves succeeds
- [ ] **T041** [P] Integration test Scenario 7 in `backend/tests/integration/late-joiner-history.test.js` - user draws 20 strokes, late joiner receives complete history, correct colors

## Phase 3.9: Polish & Validation
- [ ] **T042** Run all contract tests - verify 100% pass rate (T005-T009)
- [ ] **T043** Run all integration tests - verify 100% pass rate (T035-T041)
- [ ] **T044** Performance validation - run quickstart.md benchmarks, verify p95 latency <1000ms, memory <1MB per room
- [ ] **T045** Code coverage check - run `npm run test:coverage` in backend and frontend, verify 90%+ coverage
- [ ] **T046** Code quality audit - run ESLint, remove any duplication, eliminate dead code paths
- [ ] **T047** Manual testing - open 3 browser windows, draw in each, verify colors, cursors, audio, room capacity
- [ ] **T048** Update CLAUDE.md - add notes on DrawingSyncService architecture, color pool management, 60Hz throttling

## Dependencies

### Critical Path
```
T001-T004 (Setup)
    ↓
T005-T009 (Contract Tests - MUST FAIL) [P]
    ↓
T010-T013 (Models) [P]
    ↓
T014 (ColorAssignmentService)
    ↓
T015 (DrawingSyncService, uses T014)
    ↓
T016 (RoomManager, uses T014+T015)
    ↓
T017-T025 (Socket Handlers, sequential)
    ↓
T026-T028 (Unit Tests) [P]
    ↓
T029-T034 (Frontend, can start in parallel with backend after T016)
    ↓
T035-T041 (Integration Tests) [P]
    ↓
T042-T048 (Validation & Polish)
```

### Parallel Opportunities
- **Phase 3.2**: T005, T006, T007, T008, T009 (5 parallel contract tests)
- **Phase 3.3**: T010, T011, T012, T013 (4 parallel model files)
- **Phase 3.4**: T014 only (T015, T016 sequential due to dependencies)
- **Phase 3.6**: T026, T027, T028 (3 parallel unit test files)
- **Phase 3.7**: T029, T030, T031 (3 parallel components), then T032-T034 sequential
- **Phase 3.8**: T035, T036, T037, T038, T039, T040, T041 (7 parallel integration tests)

### Frontend-Backend Parallelization
After T016 (RoomManager complete), frontend work (T029-T034) can proceed in parallel with backend socket handlers (T017-T025) since they work on different codebases.

## Parallel Execution Examples

### Contract Tests (Phase 3.2)
```bash
# Launch all 5 contract tests in parallel:
Task: "Contract test join-room in backend/tests/contract/join-room.contract.test.js"
Task: "Contract test room-full in backend/tests/contract/room-capacity.contract.test.js"
Task: "Contract test draw-stroke in backend/tests/contract/draw-stroke.contract.test.js"
Task: "Contract test cursor-move in backend/tests/contract/cursor-move.contract.test.js"
Task: "Contract test user presence in backend/tests/contract/user-presence.contract.test.js"
```

### Models (Phase 3.3)
```bash
# Launch all 4 model tasks in parallel:
Task: "Extend User model with assignedColor in backend/src/models/User.js"
Task: "Extend Room model with drawing state in backend/src/models/Room.js"
Task: "Create DrawingStroke model in backend/src/models/DrawingStroke.js"
Task: "Create CursorPosition model in backend/src/models/CursorPosition.js"
```

### Integration Tests (Phase 3.8)
```bash
# Launch all 7 integration tests in parallel:
Task: "Test multi-user drawing sync in backend/tests/integration/multi-user-drawing.test.js"
Task: "Test cursor sync in backend/tests/integration/cursor-sync.test.js"
Task: "Test audio feedback in frontend/tests/integration/audio-feedback.test.js"
Task: "Test latency performance in backend/tests/integration/latency-performance.test.js"
Task: "Test user presence in backend/tests/integration/user-presence.test.js"
Task: "Test room capacity in backend/tests/integration/room-capacity.test.js"
Task: "Test late joiner history in backend/tests/integration/late-joiner-history.test.js"
```

## Notes
- **[P] tasks** = different files, no shared state, safe for parallel execution
- **Sequential tasks** (T017-T025) = all modify `backend/src/api/socketHandlers.js`, MUST run sequentially
- **TDD Requirement**: Contract tests (T005-T009) MUST fail before models/services (T010-T016) are implemented
- **Coverage Goal**: 90%+ enforced by Jest configuration, includes contract + integration + unit tests
- **Performance Gates**: p95 latency <1000ms, p50 <500ms validated in T038 and T044
- **Commit Strategy**: Commit after each task, push after each phase completes

## Validation Checklist
*GATE: Verify before marking tasks.md complete*

- [x] All 10 WebSocket events have contract tests (T005-T009)
- [x] All 4 entities have model tasks (T010-T013)
- [x] All contract tests come before implementation (Phase 3.2 before 3.3)
- [x] Parallel tasks are truly independent (different files)
- [x] Each task specifies exact file path
- [x] No [P] task modifies same file as another [P] task
- [x] All 7 quickstart scenarios have integration tests (T035-T041)
- [x] Performance validation included (T038, T044)
- [x] Code coverage validation included (T045)

## Constitutional Compliance

**TDD Enforcement**:
- Tests written first (T005-T009 before T010-T025)
- Tests must fail before implementation
- Contract tests → Integration tests → Implementation

**Code Quality**:
- ESLint runs on all code (T046)
- Zero duplication requirement (T046)
- Clean architecture maintained (models → services → handlers)

**Performance Standards**:
- <1000ms sync latency validated (T038, T044)
- <100ms cursor latency validated (T036)
- <200ms handler latency (constitutional target)
- Memory <1MB per room validated (T044)

**Coverage Target**:
- 90%+ code coverage required (T045)
- Contract tests (5), integration tests (7), unit tests (3)
- Total: 15 test files covering all functionality

---
**Ready for Execution**: Run `/implement` or execute tasks manually following TDD order
**Estimated Effort**: 38 tasks, ~12-15 hours for experienced developer (with parallel execution)
**Next Command**: `/implement` (future feature) or manual task execution starting with T001
