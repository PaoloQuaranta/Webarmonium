
# Implementation Plan: Multi-User Canvas Interaction

**Branch**: `002-add-new-feature` | **Date**: 2025-10-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/home/polde/Webarmonium/specs/002-add-new-feature/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from file system structure or context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, `GEMINI.md` for Gemini CLI, `QWEN.md` for Qwen Code or `AGENTS.md` for opencode).
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
9. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
Enable real-time collaborative drawing on canvas where up to 10 users can see each other's colored cursors and drawing strokes, with sound effects for drawing actions. Synchronization must occur within 1 second across all connected users. Users can control audio (mute/unmute, volume) and each user is identified by a unique color.

## Technical Context
**Language/Version**: Node.js 18+ (backend), Vanilla JavaScript ES6+ (frontend)
**Primary Dependencies**: Socket.IO 4.7+ (real-time), Express 4.18+ (backend), Tone.js 14.7+ (audio), HTML5 Canvas API
**Storage**: In-memory (Room state, user sessions, drawing strokes) - No persistent storage required for MVP
**Testing**: Jest 29+ (unit/integration), Supertest 6+ (API), Puppeteer 21+ (E2E), Socket.IO-client (contract tests)
**Target Platform**: Modern web browsers (Chrome, Firefox, Safari, Edge - last 2 versions), Node.js server on Linux
**Project Type**: Web application (frontend + backend)
**Performance Goals**: <1000ms synchronization latency p95, support 10 concurrent users per room, 60fps canvas rendering
**Constraints**: <200ms p95 WebSocket event handling, <100MB memory per room, real-time audio feedback <100ms
**Scale/Scope**: 10 concurrent users per canvas/room, unlimited drawing strokes (in-memory limit ~10k strokes per room), basic drawing tools (pen/brush)

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Code Quality Gates
- [x] Architecture follows single responsibility and zero duplication principles (existing clean architecture: models, services, API layers)
- [x] No legacy code patterns from previous solutions (building on existing clean Socket.IO architecture)
- [x] All code paths have linting and type checking configured (ESLint configured in both frontend/backend)

### Testing Requirements
- [x] TDD approach planned (tests before implementation - contract tests → integration tests → implementation)
- [x] Contract tests planned for all API endpoints (WebSocket events: draw-stroke, cursor-move, user-join, user-leave)
- [x] Integration tests planned for all user workflows (multi-user drawing, audio feedback, color assignment)
- [x] 90%+ code coverage target established (Jest with coverage configured)

### Performance Standards
- [x] Performance requirements defined upfront (<1000ms sync latency, 10 concurrent users, 60fps rendering)
- [x] API endpoints target <200ms p95 response time (WebSocket event handlers <200ms)
- [x] UI interactions target <100ms response time (canvas drawing, audio feedback)
- [x] Memory constraints defined (<100MB per room, ~10k stroke limit)
- [x] Performance testing approach planned (WebSocket latency tests, load testing with 10 concurrent clients)

### User Experience Consistency
- [x] Design system approach defined (extending existing canvas/audio components with color-coded cursors)
- [x] Accessibility standards (WCAG 2.1 AA) considered (audio mute controls, visual feedback for all audio events)
- [x] User feedback and error handling patterns planned (connection status, room full errors, sync failures)

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
backend/
├── src/
│   ├── models/
│   │   ├── User.js (existing - extend with color assignment)
│   │   ├── Room.js (existing - extend with drawing state)
│   │   ├── DrawingStroke.js (NEW)
│   │   └── CursorPosition.js (NEW)
│   ├── services/
│   │   ├── RoomManager.js (existing - extend with user limit)
│   │   ├── DrawingSyncService.js (NEW)
│   │   └── ColorAssignmentService.js (NEW)
│   └── api/
│       └── socketHandlers.js (existing - extend with draw events)
└── tests/
    ├── contract/
    │   ├── draw-stroke.contract.test.js (NEW)
    │   ├── cursor-move.contract.test.js (NEW)
    │   └── user-color.contract.test.js (NEW)
    ├── integration/
    │   ├── multi-user-drawing.test.js (NEW)
    │   └── audio-sync.test.js (NEW)
    └── unit/
        ├── DrawingSyncService.test.js (NEW)
        └── ColorAssignmentService.test.js (NEW)

frontend/
├── src/
│   ├── components/
│   │   ├── GestureCanvas.js (existing - extend with multi-cursor/strokes)
│   │   ├── AudioEngine.js (existing - extend with draw sound effects)
│   │   └── AudioControls.js (NEW)
│   ├── services/
│   │   ├── SocketService.js (existing - extend with draw events)
│   │   ├── DrawingRenderer.js (NEW)
│   │   └── CursorManager.js (NEW)
│   └── main.js (existing - integrate new features)
└── tests/
    ├── integration/
    │   ├── drawing-sync.test.js (NEW)
    │   └── multi-user-canvas.test.js (NEW)
    └── unit/
        ├── DrawingRenderer.test.js (NEW)
        └── CursorManager.test.js (NEW)
```

**Structure Decision**: Web application structure (Option 2) selected based on existing `frontend/` and `backend/` directories. The codebase already has clean separation with models, services, and API layers. This feature extends existing Room/User models and adds new drawing-specific models and services. Socket.IO infrastructure is already in place for real-time communication.

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `.specify/scripts/bash/update-agent-context.sh claude`
     **IMPORTANT**: Execute it exactly as specified above. Do not add or remove any arguments.
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
1. **Contract Test Tasks** (from contracts/socket-events.json):
   - Task: Write contract test for `join-room` / `room-joined` / `room-full` [P]
   - Task: Write contract test for `draw-start` / `draw-point` / `draw-end` [P]
   - Task: Write contract test for `cursor-move` / `cursor-position` [P]
   - Task: Write contract test for `user-joined` / `user-left` [P]
   - Task: Write contract test for `drawing-history` event [P]

2. **Model Tasks** (from data-model.md):
   - Task: Extend User model with `assignedColor` field [P]
   - Task: Extend Room model with `availableColors`, `drawingStrokes`, `cursorPositions` [P]
   - Task: Create DrawingStroke model with validation rules [P]
   - Task: Create CursorPosition model [P]

3. **Service Tasks** (from data-model.md + research.md):
   - Task: Implement ColorAssignmentService (10-color pool, round-robin) [P]
   - Task: Implement DrawingSyncService (stroke broadcasting, history management)
   - Task: Extend RoomManager with capacity enforcement (max 10 users)

4. **API Tasks** (making contract tests pass):
   - Task: Implement `join-room` handler with color assignment
   - Task: Implement `draw-start`/`draw-point`/`draw-end` handlers
   - Task: Implement `cursor-move` handler with 60Hz throttling
   - Task: Implement `drawing-history` emission on room join
   - Task: Implement `user-joined`/`user-left` broadcasting

5. **Frontend Component Tasks**:
   - Task: Extend GestureCanvas with multi-cursor rendering [P]
   - Task: Create DrawingRenderer service for remote strokes [P]
   - Task: Create CursorManager service for cursor tracking [P]
   - Task: Create AudioControls component (mute/volume) [P]
   - Task: Extend AudioEngine with draw sound effects (Tone.js)

6. **Frontend Integration Tasks**:
   - Task: Extend SocketService with draw event handlers
   - Task: Integrate DrawingRenderer into main canvas loop
   - Task: Integrate CursorManager with SocketService
   - Task: Wire AudioControls to AudioEngine

7. **Integration Test Tasks** (from quickstart.md):
   - Task: Implement Scenario 1 - Multi-user drawing sync test
   - Task: Implement Scenario 2 - Cursor position sync test
   - Task: Implement Scenario 3 - Audio feedback test
   - Task: Implement Scenario 4 - Latency performance test (10 users)
   - Task: Implement Scenario 5 - User presence notifications test
   - Task: Implement Scenario 6 - Room capacity enforcement test
   - Task: Implement Scenario 7 - Late joiner history test

**Ordering Strategy**:
- **Phase 1**: Contract tests [P] (parallel, independent)
- **Phase 2**: Models [P] (parallel, no dependencies)
- **Phase 3**: Services (ColorAssignment first, then DrawingSync, then RoomManager)
- **Phase 4**: Backend API handlers (make contract tests pass)
- **Phase 5**: Frontend components [P] (parallel, independent)
- **Phase 6**: Frontend integration (services → components → main)
- **Phase 7**: Integration tests (after implementation complete)
- **Phase 8**: Performance validation and cleanup

**Estimated Output**: ~35 numbered, dependency-ordered tasks in tasks.md

**Dependencies**:
- Backend models must exist before services
- Services must exist before API handlers
- Contract tests must pass before moving to integration tests
- Frontend components independent of backend (can develop in parallel)
- Integration tests require both frontend + backend complete

**Parallel Execution Markers**:
- [P] = Can be executed in parallel with other [P] tasks in same phase
- No marker = Must execute sequentially (has dependencies)

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

No constitutional violations identified. Design adheres to all principles:
- Clean architecture with single responsibility (models, services, API layers)
- Zero duplication (extending existing infrastructure)
- TDD approach (contract tests → implementation)
- Performance requirements met (<1000ms sync, <100ms UI)
- 90%+ test coverage target

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command) - research.md generated
- [x] Phase 1: Design complete (/plan command) - data-model.md, contracts/, quickstart.md generated
- [x] Phase 2: Task planning complete (/plan command - describe approach only) - 8 phases, ~35 tasks planned
- [x] Phase 3: Tasks generated (/tasks command) - tasks.md created with 48 tasks across 9 phases
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS (all 12 checks passed)
- [x] Post-Design Constitution Check: PASS (no violations introduced)
- [x] All NEEDS CLARIFICATION resolved (5 clarifications answered in spec.md)
- [x] Complexity deviations documented (none required)

**Artifacts Generated**:
- [x] plan.md (this file)
- [x] research.md (Phase 0 technical decisions)
- [x] data-model.md (Phase 1 entity definitions)
- [x] contracts/socket-events.json (Phase 1 API contracts)
- [x] quickstart.md (Phase 1 integration test scenarios)
- [x] CLAUDE.md updated (Phase 1 agent context)
- [x] tasks.md (Phase 3 executable task list - 48 tasks)

**Next Steps**: Begin implementation following TDD order in tasks.md (T001-T048)

---
*Based on Constitution v1.0.0 - See `.specify/memory/constitution.md`*
