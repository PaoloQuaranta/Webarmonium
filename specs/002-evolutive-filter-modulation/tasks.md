# Tasks: Generative Multi-User Musical Composition System

**Input**: Design documents from `/specs/004-generative-multi-user/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/, quickstart.md
**Tech Stack**: Node.js 18+, Express.js, Socket.IO, Tone.js, Jest, ESLint
**Architecture**: Web application with backend/frontend separation

## Execution Flow (main)
```
1. Load plan.md → Extract tech stack, libraries, structure
2. Load design documents:
   → data-model.md: 5 entities → model tasks
   → contracts/api.md: Socket.IO + REST endpoints → test tasks
   → research.md: Technical decisions → setup tasks
   → quickstart.md: Test scenarios → integration tasks
3. Generate 28 tasks by category:
   → Setup: Project structure, dependencies, linting
   → Tests: Contract tests (failing first), integration tests
   → Core: Models, services, gesture-to-music pipeline
   → Integration: Socket.IO, audio synthesis, synchronization
   → Frontend: Gesture capture, audio playback, visualization
   → Polish: Performance, docs, constitutional compliance
4. Apply task rules:
   → Different files = [P] for parallel execution
   → Same file = sequential
   → Tests before implementation (TDD constitutional requirement)
5. Number tasks sequentially (T001-T028)
6. Generate dependency graph and parallel examples
7. Validate completeness: All entities modeled, all contracts tested
8. Return: SUCCESS (tasks ready for execution)
```

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- All paths use absolute paths from repository root
- Tests MUST be written and MUST FAIL before implementation (constitutional requirement)

## Phase 3.1: Setup
- [x] T001 Create new service directories in backend/src/services/ for generative music components
- [x] T002 Install new dependencies: Tone.js, additional Socket.IO adapters, pattern matching libraries
- [x] T003 [P] Configure ESLint rules for Web Audio API and real-time audio code patterns

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CONSTITUTIONAL REQUIREMENT: Tests MUST be written and MUST FAIL before ANY implementation**
**Code coverage target: 90%+ - Contract, integration, and unit tests required**

### Contract Tests [Parallel - Different Test Files]
- [x] T004 [P] Contract test: POST /api/rooms/:id/gestures in tests/contract/gestures-post.contract.test.js
- [x] T005 [P] Contract test: GET /api/rooms/:id/musical-events in tests/contract/musical-events-get.contract.test.js
- [x] T006 [P] Contract test: GET /api/rooms/:id/patterns in tests/contract/patterns-get.contract.test.js
- [x] T007 [P] Contract test: POST /api/rooms/:id/patterns/analyze in tests/contract/patterns-analyze.contract.test.js
- [x] T008 [P] Contract test: GET /api/rooms/:id/composition in tests/contract/composition-get.contract.test.js
- [x] T009 [P] Contract test: PUT /api/rooms/:id/composition/mood in tests/contract/composition-mood-put.contract.test.js

### Integration Tests [Parallel - Different Test Files]
- [ ] T010 [P] Integration test: Multi-user synchronization in tests/integration/test_multiuser_sync.js
- [ ] T011 [P] Integration test: Pattern detection and integration in tests/integration/test_pattern_integration.js
- [ ] T012 [P] Integration test: Density-driven composition evolution in tests/integration/test_density_evolution.js
- [ ] T013 [P] Integration test: Voice resource management in tests/integration/test_voice_management.js

### Socket.IO Event Tests [Parallel - Different Test Files]
- [ ] T014 [P] Socket.IO test: gesture:record event in tests/contract/test_socket_gestures.js
- [ ] T015 [P] Socket.IO test: musical:event broadcast in tests/contract/test_socket_musical_events.js
- [ ] T016 [P] Socket.IO test: composition:update events in tests/contract/test_socket_composition.js
- [ ] T017 [P] Socket.IO test: clock:sync events in tests/contract/test_socket_clock.js

## Phase 3.3: Core Implementation (ONLY after tests are failing)

### Data Models [Parallel - Different Model Files]
- [ ] T018 [P] MusicalEvent model in backend/src/models/MusicalEvent.js
- [ ] T019 [P] GesturePhrase model in backend/src/models/GesturePhrase.js
- [ ] T020 [P] PatternMemory model in backend/src/models/PatternMemory.js
- [ ] T021 [P] BackgroundComposition model in backend/src/models/BackgroundComposition.js
- [ ] T022 [P] VoiceResource model in backend/src/models/VoiceResource.js

### Core Services [Sequential - Shared Dependencies]
- [ ] T023 Gesture-to-music mapping service in backend/src/services/GestureToMusicService.js
- [ ] T024 Pattern recognition service in backend/src/services/PatternRecognitionService.js
- [ ] T025 Composition engine service in backend/src/services/CompositionEngine.js
- [ ] T026 Voice allocation manager in backend/src/services/VoiceAllocationManager.js
- [ ] T027 Musical clock synchronization service in backend/src/services/MusicalClockService.js

### REST API Endpoints [Sequential - Shared Router Files]
- [ ] T028 POST /api/rooms/:id/gestures endpoint in backend/src/routes/gestures.js
- [ ] T029 GET /api/rooms/:id/musical-events endpoint in backend/src/routes/musical-events.js
- [ ] T030 GET /api/rooms/:id/patterns endpoint in backend/src/routes/patterns.js
- [ ] T031 POST /api/rooms/:id/patterns/analyze endpoint in backend/src/routes/patterns.js
- [ ] T032 GET /api/rooms/:id/composition endpoint in backend/src/routes/composition.js
- [ ] T033 PUT /api/rooms/:id/composition/mood endpoint in backend/src/routes/composition.js
- [ ] T034 GET /api/rooms/:id/voices endpoint in backend/src/routes/voices.js
- [ ] T035 POST /api/rooms/:id/voices/allocate endpoint in backend/src/routes/voices.js

### Socket.IO Event Handlers [Sequential - Shared Socket.IO Instance]
- [ ] T036 gesture:record event handler in backend/src/services/SocketEventHandler.js
- [ ] T037 room:join/room:leave event handlers in backend/src/services/SocketEventHandler.js
- [ ] T038 clock:sync event handler in backend/src/services/SocketEventHandler.js
- [ ] T039 musical:event broadcast logic in backend/src/services/SocketEventHandler.js
- [ ] T040 composition:update broadcast logic in backend/src/services/SocketEventHandler.js

## Phase 3.4: Frontend Components
- [ ] T041 [P] Gesture capture module in frontend/js/gestureToMusic.js
- [ ] T042 [P] Audio playback system using Tone.js in frontend/js/audio.js (extend existing)
- [ ] T043 [P] Composition visualization component in frontend/js/compositionVisualizer.js
- [ ] T044 Musical clock client synchronization in frontend/js/network.js (extend existing)

## Phase 3.5: Integration and Polish
- [ ] T045 Connect GestureToMusicService to PatternRecognitionService
- [ ] T046 Connect CompositionEngine to VoiceAllocationManager
- [ ] T047 Connect MusicalClockService to all Socket.IO event handlers
- [ ] T048 Add performance monitoring and metrics collection
- [ ] T049 [P] Unit tests for gesture-to-music mapping algorithms in tests/unit/test_gesture_mapping.js
- [ ] T050 [P] Unit tests for pattern recognition algorithms in tests/unit/test_pattern_recognition.js
- [ ] T051 [P] Unit tests for composition generation in tests/unit/test_composition_generation.js
- [ ] T052 Performance validation: <200ms API response times
- [ ] T053 Performance validation: <100ms UI interaction response
- [ ] T054 Memory usage validation: <100MB baseline, <500MB peak
- [ ] T055 Load testing with 10+ simultaneous users
- [ ] T056 Update API documentation in backend/docs/api.md
- [ ] T057 Code quality check: Remove duplication, eliminate dead code paths
- [ ] T058 Execute quickstart.md integration test scenarios
- [ ] T059 Verify 90%+ code coverage requirement met
- [ ] T060 Performance regression testing setup
- [ ] T061 Constitutional compliance validation (all principles met)

## Dependency Graph

### Phase 1 (Setup) → Phase 2 (Tests)
```
T001-T003 → T004-T017
```

### Phase 2 (Tests) → Phase 3 (Core Models)
```
T004-T017 → T018-T022
```

### Phase 3 (Models) → Phase 4 (Services)
```
T018-T022 → T023-T027
```

### Phase 4 (Services) → Phase 5 (API + Socket.IO)
```
T023-T027 → T028-T040
```

### Phase 5 (Backend) → Phase 6 (Frontend)
```
T028-T040 → T041-T044
```

### Phase 6 (All Implementation) → Phase 7 (Integration + Polish)
```
T041-T044 → T045-T061
```

## Parallel Execution Examples

### Parallel Task Groups (Can run simultaneously):
**Group A - Model Creation** (after tests written):
```bash
Task T018: MusicalEvent model &
Task T019: GesturePhrase model &
Task T020: PatternMemory model &
Task T021: BackgroundComposition model &
Task T022: VoiceResource model &
wait
```

**Group B - Contract Tests** (before implementation):
```bash
Task T004: Gesture POST contract test &
Task T005: Musical events GET contract test &
Task T006: Patterns GET contract test &
Task T007: Pattern analysis POST contract test &
Task T008: Composition GET contract test &
Task T009: Composition mood PUT contract test &
wait
```

**Group C - Integration Tests** (before implementation):
```bash
Task T010: Multi-user sync test &
Task T011: Pattern integration test &
Task T012: Density evolution test &
Task T013: Voice management test &
wait
```

**Group D - Socket.IO Tests** (before implementation):
```bash
Task T014: Gesture record event test &
Task T015: Musical event broadcast test &
Task T016: Composition update test &
Task T017: Clock sync test &
wait
```

**Group E - Frontend Components** (after backend services):
```bash
Task T041: Gesture capture module &
Task T042: Audio playback system &
Task T043: Composition visualization &
wait
```

**Group F - Unit Tests** (during implementation):
```bash
Task T049: Gesture mapping unit tests &
Task T050: Pattern recognition unit tests &
Task T051: Composition generation unit tests &
wait
```

### Sequential Dependencies (Cannot run in parallel):
- T023 → T024 → T025 → T026 → T027 (Services have dependencies)
- T028 → T029 → T030 → T031 → T032 → T033 → T034 → T035 (API endpoints share router)
- T036 → T037 → T038 → T039 → T040 (Socket.IO handlers share instance)
- T045 → T046 → T047 (Service integration has dependencies)

## Critical Path
1. **T001-T003** (Setup) → **T004-T017** (All Tests Written and Failing)
2. **T018-T022** (Models) → **T023** (Gesture-to-Music Service)
3. **T023 → T024** (Pattern Recognition) → **T025** (Composition Engine)
4. **T025 → T036** (Socket.IO Handler) → **T041** (Frontend Gesture Module)
5. **T041 → T045** (Integration) → **T058** (Quickstart Validation)

## Constitutional Requirements
- ✅ **TDD Enforcement**: All tests (T004-T017) written before implementation (T018+)
- ✅ **Code Quality**: Clean architecture with single responsibility (T018-T027)
- ✅ **Performance**: <200ms API, <100ms UI targets (T052-T053)
- ✅ **Coverage**: 90%+ requirement validated (T059)
- ✅ **No Legacy**: Prototype mindset, clean architecture (T060)

## Success Criteria
All tasks complete with:
- All contract tests passing
- All integration tests passing
- Quickstart scenarios validated
- Performance benchmarks met
- Constitutional compliance achieved
- 90%+ code coverage
- Ready for production deployment

**Total Tasks**: 61 tasks
**Estimated Timeline**: 3-4 weeks with parallel execution
**Team Size**: 2-3 developers optimal (backend, frontend, audio specialist)