
# Implementation Plan: Generative Multi-User Musical Composition System

**Branch**: `004-generative-multi-user` | **Date**: 2025-01-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/004-generative-multi-user/spec.md`

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
Transform Webarmonium from continuous theremin-like sounds to a sophisticated generative multi-user musical composition system. Each user gesture will trigger discrete musical events synchronized across all participants, while an emergent background composition evolves from collective activity patterns. The system will use Web Audio API for real-time synthesis, Socket.IO for cross-client synchronization, and pattern recognition algorithms to integrate user-generated phrases into the evolving composition.

## Technical Context
**Language/Version**: Node.js 18+, JavaScript (ES2022)
**Primary Dependencies**: Express.js, Socket.IO, Tone.js (Web Audio API)
**Storage**: In-memory with session-based persistence (ephemeral)
**Testing**: Jest, Supertest, ESLint, Prettier
**Target Platform**: Web browser (WASM compatible), Node.js server
**Project Type**: Web application (real-time collaborative audio)
**Performance Goals**: Musical coherence prioritized over absolute latency, <200ms API response, <100ms UI interaction
**Constraints**: Dynamic voice allocation based on device capabilities, 2-minute pattern memory window, 10+ simultaneous users
**Scale/Scope**: Multi-user real-time sessions, emergent composition generation, gesture-to-music mapping

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Code Quality Gates
- [x] Architecture follows single responsibility and zero duplication principles
- [x] No legacy code patterns from previous solutions
- [x] All code paths have linting and type checking configured

### Testing Requirements
- [x] TDD approach planned (tests before implementation)
- [x] Contract tests planned for all API endpoints
- [x] Integration tests planned for all user workflows
- [x] 90%+ code coverage target established

### Performance Standards
- [x] Performance requirements defined upfront
- [x] API endpoints target <200ms p95 response time
- [x] UI interactions target <100ms response time
- [x] Memory constraints defined (<100MB baseline, <500MB peak)
- [x] Performance testing approach planned

### User Experience Consistency
- [x] Design system approach defined (extends existing Webarmonium)
- [x] Accessibility standards (WCAG 2.1 AA) considered
- [x] User feedback and error handling patterns planned

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
│   │   ├── Gesture.js
│   │   ├── MemoryState.js
│   │   ├── Room.js
│   │   └── [NEW] MusicalEvent.js
│   │   └── [NEW] PatternMemory.js
│   ├── services/
│   │   ├── GestureProcessor.js
│   │   ├── EnvironmentalMemoryCoordinator.js
│   │   ├── SoundPatternGenerator.js
│   │   └── [NEW] CompositionEngine.js
│   │   └── [NEW] SynchronizationService.js
│   └── server.js
└── tests/
    ├── contract/
    ├── integration/
    └── unit/

frontend/
├── index.html
├── js/
│   ├── audio.js
│   ├── ui.js
│   ├── network.js
│   └── [NEW] gestureToMusic.js
│   └── [NEW] compositionVisualizer.js
└── tests/
```

**Structure Decision**: Web application with existing backend/frontend structure. Extends current Webarmonium architecture with new generative music components while maintaining real-time Socket.IO communication.

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
- Load `.specify/templates/tasks-template.md` as base
- Generate tasks from Phase 1 design docs (contracts, data model, quickstart)
- Each contract endpoint → contract test task [P]
- Each data entity → model creation task [P]
- Each user story → integration test task
- Core service implementation tasks to make tests pass

**Core Task Categories**:
1. **Data Models** (5 tasks): MusicalEvent, GesturePhrase, PatternMemory, BackgroundComposition, VoiceResource
2. **Contract Tests** (6 tasks): Gesture events, Pattern recognition, Composition API, Voice management, Musical clock, Room management
3. **Core Services** (8 tasks): Gesture-to-music mapping, Pattern detection, Composition engine, Synchronization, Voice allocation, Musical clock, Audio synthesis, Network communication
4. **Integration Tests** (4 tasks): Multi-user sync, Pattern integration, Density evolution, Performance validation
5. **Frontend Components** (3 tasks): Gesture capture, Audio playback, Composition visualization
6. **End-to-End Validation** (2 tasks): Quickstart scenarios, Constitutional compliance

**Ordering Strategy**:
- TDD order: Tests before implementation
- Dependency order: Models → Services → API → UI → Integration
- Parallel execution: Independent models and tests can be developed concurrently [P]
- Critical path: Core gesture-to-music pipeline completed first

**Estimated Output**: 28 numbered, ordered tasks in tasks.md

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented

---
*Based on Constitution v1.0.0 - See `.specify/memory/constitution.md`*
