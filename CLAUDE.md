# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

This is a **Specify Framework** project that follows a structured feature development workflow with constitutional principles governing code quality, testing, and performance.

### Core Framework Structure
```
.specify/
├── memory/constitution.md          # Project constitution (v1.0.0)
├── templates/                      # Feature development templates
│   ├── spec-template.md           # Feature specification template
│   ├── plan-template.md           # Implementation planning template
│   ├── tasks-template.md          # Task generation template
│   └── agent-file-template.md     # Auto-generated developer guidance
└── scripts/bash/                   # Utility scripts
    ├── update-agent-context.sh    # Updates agent-specific files
    ├── create-new-feature.sh      # Creates new feature branches
    └── check-prerequisites.sh     # Validates environment

.claude/commands/                   # Slash command definitions
├── /specify                       # Create feature specifications
├── /plan                         # Generate implementation plans
├── /tasks                        # Create task breakdowns
├── /implement                    # Execute implementation
├── /clarify                      # Resolve specification ambiguities
├── /analyze                      # Cross-artifact consistency analysis
└── /constitution                 # Update project constitution
```

## Development Workflow Commands

The Specify framework uses slash commands for structured development:

```bash
# Core workflow (execute in order)
/specify "feature description"     # Create feature specification
/clarify                          # Resolve any ambiguities
/plan                            # Generate implementation plan
/tasks                           # Create actionable task list
/implement                       # Execute tasks
/analyze                         # Validate consistency

# Constitution management
/constitution                    # Update project principles
```

### Manual Script Execution
```bash
# Create new feature branch and directory structure
./.specify/scripts/bash/create-new-feature.sh [feature-name]

# Update agent context files (run during Phase 1 of /plan)
./.specify/scripts/bash/update-agent-context.sh claude

# Check development environment prerequisites
./.specify/scripts/bash/check-prerequisites.sh
```

## Constitutional Requirements

This project enforces strict constitutional principles (see `.specify/memory/constitution.md`):

### Code Quality Gates (NON-NEGOTIABLE)
- Zero duplication or dead code paths
- Clean architecture with single responsibility
- No legacy code patterns (prototype mindset)
- All code must pass linting and type checking

### Test-Driven Development
- Tests MUST be written before implementation
- 90%+ code coverage requirement
- Contract tests for all API endpoints
- Integration tests for all user workflows
- Red-Green-Refactor cycle strictly enforced

### Performance Standards
- API endpoints: <200ms p95 response time
- UI interactions: <100ms response time
- Memory usage: <100MB baseline, <500MB peak
- Performance regression testing on every commit

## Feature Development Pattern

Each feature follows this structure under `specs/[###-feature-name]/`:
```
specs/001-example-feature/
├── spec.md              # Feature specification (/specify output)
├── plan.md              # Implementation plan (/plan output)
├── research.md          # Technical research (Phase 0)
├── data-model.md        # Entity definitions (Phase 1)
├── quickstart.md        # Integration test scenarios (Phase 1)
├── contracts/           # API contract definitions (Phase 1)
└── tasks.md             # Actionable task breakdown (/tasks output)
```

## Key Template Integration Points

- **Constitution Check**: All plans must pass constitutional gates before proceeding
- **Agent Context**: Auto-updated during Phase 1 via `update-agent-context.sh claude`
- **TDD Enforcement**: Tasks template enforces test-first development
- **Performance Gates**: Integrated into plan and task validation
- **Dependency Management**: Task ordering respects constitutional principles

## Project State

Currently initialized with:
- Constitution v1.0.0 (code quality, TDD, UX consistency, performance)
- Complete slash command workflow
- Template synchronization completed
- No active features (clean prototype state)
