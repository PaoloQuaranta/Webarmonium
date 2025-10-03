<!--
Sync Impact Report:
- Version change: new → 1.0.0
- Modified principles: Initial creation with 4 core principles
- Added sections: Performance Standards, Development Workflow
- Removed sections: None (initial creation)
- Templates requiring updates: ✅ updated plan-template.md, spec-template.md, tasks-template.md
- Follow-up TODOs: None
-->

# Webarmonium Constitution

## Core Principles

### I. Code Quality First
Clean code architecture MUST be maintained at all times. Every piece of code MUST follow established patterns with zero duplication or dead branches. Code MUST be readable, maintainable, and follow single responsibility principles. Legacy code from previous solutions is FORBIDDEN - we are prototyping for optimal architecture, not maintaining backward compatibility. All code MUST pass linting and type checking before commit.

### II. Test-Driven Development (NON-NEGOTIABLE)
All functionality MUST be test-driven. Tests MUST be written before implementation and MUST fail initially. Red-Green-Refactor cycle is strictly enforced. Contract tests are REQUIRED for all API endpoints, integration tests for all user workflows, and unit tests for all business logic. Code coverage below 90% is unacceptable.

### III. User Experience Consistency
User interface and interaction patterns MUST be consistent across all components. Design systems and reusable components are MANDATORY. User feedback and error handling MUST be predictable and helpful. Accessibility standards (WCAG 2.1 AA) MUST be met. All user-facing changes MUST be validated through user scenarios defined in specifications.

### IV. Performance By Design
Performance requirements MUST be defined upfront and validated continuously. All code MUST meet specified performance benchmarks before deployment. Optimization is NOT deferred - it's built-in from the start. Performance regression testing is REQUIRED. Resource usage MUST be monitored and stay within defined constraints.

## Performance Standards

All code MUST meet these non-negotiable performance requirements:
- API endpoints: <200ms p95 response time
- UI interactions: <100ms response time
- Memory usage: <100MB baseline, <500MB peak
- Build times: <30 seconds for incremental builds
- Test suite: <60 seconds total execution time

Performance testing MUST be automated and run on every commit. Any performance regression blocks deployment.

## Development Workflow

Code quality gates are MANDATORY and MUST pass before merge:
- All tests passing (contract, integration, unit)
- Linting and type checking with zero errors
- Code review approval from at least one other developer
- Performance benchmarks met
- Documentation updated for user-facing changes

No exceptions to TDD workflow: Tests → Approval → Red → Green → Refactor → Review → Merge.

Prototype mentality MUST be maintained: refactor aggressively, eliminate technical debt immediately, prioritize clean architecture over quick fixes.

## Governance

This constitution supersedes all other development practices. All pull requests and code reviews MUST verify constitutional compliance. Any complexity that violates these principles MUST be justified in writing or the approach MUST be simplified.

Amendments require documented rationale, technical review, and update of all dependent templates and workflows. Constitutional violations during development trigger immediate refactoring requirements.

Use `.claude/commands/*.md` for runtime development guidance that aligns with these principles.

**Version**: 1.0.0 | **Ratified**: 2025-09-29 | **Last Amended**: 2025-09-29