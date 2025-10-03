# Tasks: Webarmonium - Algorithmic Improvisation Ecosystem

**Input**: Design documents from `/home/polde/Webarmonium/specs/001-webarmonium-project-un/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/, quickstart.md

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Found: Web application (frontend + backend) with Socket.io real-time communication
   → Tech stack: Canvas API, Web Audio API + Tone.js, Socket.io, Express, Node.js
2. Load optional design documents:
   → data-model.md: User, Room, Gesture, SoundPattern, MemoryState entities
   → contracts/: Socket.io API (join-room, leave-room, gesture, heartbeat endpoints)
   → research.md: Technical decisions for performance and architecture
   → quickstart.md: 5 integration test scenarios identified
3. Generate tasks by category:
   → Setup: Frontend/backend project init, dependencies, linting
   → Tests: Socket.io contract tests, integration test scenarios
   → Core: Model classes, service layers, Socket.io handlers
   → Integration: Real-time communication, memory persistence, audio engine
   → Polish: Unit tests, performance validation, documentation
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Generate dependency graph
7. Create parallel execution examples
8. Validate task completeness:
   → All Socket.io endpoints have contract tests ✓
   → All entities have model implementations ✓
   → All user scenarios have integration tests ✓
9. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Web app**: `backend/src/`, `frontend/src/`
- Paths are absolute from repository root: `/home/polde/Webarmonium/`

## Phase 3.1: Setup
- [x] T001 Create frontend and backend project structure with package.json files
- [x] T002 Initialize backend Node.js project with Express, Socket.io, ESLint dependencies
- [x] T003 Initialize frontend project with Canvas API, Web Audio API, Tone.js, Socket.io client dependencies
- [x] T004 [P] Configure ESLint and Prettier for backend in backend/.eslintrc.js
- [x] T005 [P] Configure ESLint and Prettier for frontend in frontend/.eslintrc.js

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CONSTITUTIONAL REQUIREMENT: Tests MUST be written and MUST FAIL before ANY implementation**
**Code coverage target: 90%+ - Contract, integration, and unit tests required**

### Socket.io Contract Tests
- [x] T006 [P] Contract test join-room event in backend/tests/contract/test_join_room.test.js
- [x] T007 [P] Contract test leave-room event in backend/tests/contract/test_leave_room.test.js
- [x] T008 [P] Contract test gesture event in backend/tests/contract/test_gesture.test.js
- [x] T009 [P] Contract test heartbeat event in backend/tests/contract/test_heartbeat.test.js
- [x] T010 [P] Contract test room-joined response in backend/tests/contract/test_room_responses.test.js
- [x] T011 [P] Contract test sonic-update broadcast in backend/tests/contract/test_sonic_broadcasts.test.js

### Integration Test Scenarios
- [x] T012 [P] Integration test single user room experience in frontend/tests/integration/test_single_user.test.js
- [ ] T013 [P] Integration test multi-user collaboration in frontend/tests/integration/test_multi_user.test.js
- [x] T014 [P] Integration test memory persistence lifecycle in backend/tests/integration/test_memory_lifecycle.test.js
- [x] T015 [P] Integration test cross-platform device inputs in frontend/tests/integration/test_cross_platform.test.js
- [ ] T016 [P] Integration test performance and error recovery in frontend/tests/integration/test_performance.test.js

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Backend Models
- [x] T017 [P] User model class in backend/src/models/User.js
- [x] T018 [P] Room model class in backend/src/models/Room.js
- [x] T019 [P] Gesture model class in backend/src/models/Gesture.js
- [x] T020 [P] SoundPattern model class in backend/src/models/SoundPattern.js
- [x] T021 [P] MemoryState model class in backend/src/models/MemoryState.js

### Backend Services
- [ ] T022 RoomManager service in backend/src/services/RoomManager.js
- [ ] T023 GestureProcessor service in backend/src/services/GestureProcessor.js
- [ ] T024 EnvironmentalMemoryCoordinator service in backend/src/services/EnvironmentalMemoryCoordinator.js
- [ ] T025 SoundPatternGenerator service in backend/src/services/SoundPatternGenerator.js

### Socket.io API Implementation
- [ ] T026 Socket.io server setup and room management in backend/src/server.js
- [ ] T027 join-room and leave-room handlers in backend/src/api/socketHandlers.js
- [ ] T028 gesture processing and sonic-update broadcasting in backend/src/api/socketHandlers.js
- [ ] T029 heartbeat and user session management in backend/src/api/socketHandlers.js

### Frontend Components
- [ ] T030 [P] GestureCanvas component with mouse/touch/gyroscope capture in frontend/src/components/GestureCanvas.js
- [ ] T031 [P] AudioEngine component with Web Audio API + Tone.js in frontend/src/components/AudioEngine.js
- [ ] T032 [P] RoomInterface component for user management in frontend/src/components/RoomInterface.js

### Frontend Services
- [ ] T033 SocketService for Socket.io client communication in frontend/src/services/SocketService.js
- [ ] T034 GestureCapture service for input normalization in frontend/src/services/GestureCapture.js
- [ ] T035 AudioService for real-time sound parameter mapping in frontend/src/services/AudioService.js

## Phase 3.4: Integration
- [ ] T036 Connect SocketService to AudioEngine for real-time sonic updates
- [ ] T037 Integrate GestureCapture with Canvas rendering and Socket.io streaming
- [ ] T038 Implement memory persistence with 24-hour expiration timers
- [ ] T039 Add error handling and graceful disconnection recovery
- [ ] T040 Configure CORS and security headers for production deployment

## Phase 3.5: Polish
- [ ] T041 [P] Unit tests for gesture normalization in frontend/tests/unit/test_gesture_capture.test.js
- [ ] T042 [P] Unit tests for memory state management in backend/tests/unit/test_memory_coordinator.test.js
- [ ] T043 [P] Unit tests for sound pattern generation in backend/tests/unit/test_sound_patterns.test.js
- [ ] T044 Performance tests validating <200ms audio latency and 60fps Canvas rendering
- [ ] T045 WebSocket latency monitoring with <100ms target validation
- [ ] T046 Code quality check: Remove duplication, eliminate dead code
- [ ] T047 Verify 90%+ code coverage requirement across all test suites
- [ ] T048 Performance regression testing setup with automated alerts
- [ ] T049 [P] Update README.md with setup and development instructions
- [ ] T050 [P] Create deployment documentation for frontend and backend

## Dependencies
- Setup (T001-T005) before all other tasks
- Contract tests (T006-T011) before backend implementation (T017-T029)
- Integration tests (T012-T016) before frontend implementation (T030-T035)
- Models (T017-T021) before services (T022-T025)
- Services (T022-T025) before API handlers (T026-T029)
- Components (T030-T032) before service integration (T033-T035)
- Core implementation (T017-T035) before integration (T036-T040)
- Integration (T036-T040) before polish (T041-T050)

## Parallel Example
```bash
# Launch contract tests together (all independent files):
Task: "Contract test join-room event in backend/tests/contract/test_join_room.test.js"
Task: "Contract test leave-room event in backend/tests/contract/test_leave_room.test.js"
Task: "Contract test gesture event in backend/tests/contract/test_gesture.test.js"
Task: "Contract test heartbeat event in backend/tests/contract/test_heartbeat.test.js"

# Launch model creation together (all independent files):
Task: "User model class in backend/src/models/User.js"
Task: "Room model class in backend/src/models/Room.js"
Task: "Gesture model class in backend/src/models/Gesture.js"
Task: "SoundPattern model class in backend/src/models/SoundPattern.js"
Task: "MemoryState model class in backend/src/models/MemoryState.js"

# Launch frontend components together (all independent files):
Task: "GestureCanvas component with mouse/touch/gyroscope capture in frontend/src/components/GestureCanvas.js"
Task: "AudioEngine component with Web Audio API + Tone.js in frontend/src/components/AudioEngine.js"
Task: "RoomInterface component for user management in frontend/src/components/RoomInterface.js"
```

## Notes
- [P] tasks = different files, no dependencies
- Verify tests fail before implementing
- All Socket.io communication must meet <100ms latency requirement
- Canvas rendering must maintain 60fps performance target
- Audio synthesis must achieve <200ms gesture-to-sound latency
- Memory state persistence limited to 24 hours per constitutional requirements

## Task Generation Rules
*Applied during main() execution*

1. **From Contracts**:
   - Each Socket.io event → contract test task [P]
   - Each event handler → implementation task

2. **From Data Model**:
   - Each entity → model creation task [P]
   - Service relationships → service layer tasks

3. **From User Stories**:
   - Each quickstart scenario → integration test [P]
   - Performance requirements → validation tasks

4. **Ordering**:
   - Setup → Tests → Models → Services → API → Frontend → Integration → Polish
   - Dependencies block parallel execution

## Validation Checklist
*GATE: Checked by main() before returning*

- [x] All Socket.io contracts have corresponding tests
- [x] All entities have model creation tasks
- [x] All tests come before implementation (TDD enforced)
- [x] Parallel tasks truly independent ([P] marking verified)
- [x] Each task specifies exact file path
- [x] No task modifies same file as another [P] task
- [x] Performance targets integrated (60fps, <200ms audio, <100ms WebSocket)
- [x] Constitutional requirements embedded (90% coverage, clean architecture)