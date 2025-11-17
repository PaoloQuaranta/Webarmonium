# AudioService Sprint 2: Pragmatic Refactoring Plan

**Context**: AudioService is 4,014 lines with 109 methods. Full refactoring requires 15 weeks (per comprehensive analysis).

**Sprint 2 Goal (3-5 days)**: Critical cleanup + foundation for future refactoring

---

## SPRINT 2 PRIORITIES

### ✅ PRIORITY 1: Remove Duplicates & Dead Code (Day 1)

**Duplicate Methods to Merge:**
1. `updateFilterParams()` at lines 929 + 2976 (keep better version)
2. `applyFilterModulation()` at lines 969 + 3005 (keep better version)
3. `testFilterModulation()` at lines 1951 + 1994 (keep one, remove other)

**Dead Code to Remove (~500 lines):**
- `handleHoverModulation()` disabled at line 3444
- `performParameterUpdate()` disabled at line 2859
- Sections wrapped in `if (false && ...)`
- Commented-out initialization code

**Expected Result:** -~650 lines (4,014 → 3,364)

### ⚠️ PRIORITY 2: Document Component Boundaries (Day 2)

Instead of extracting components NOW, add clear comments marking future extraction boundaries:

```javascript
// ========================================
// COMPONENT BOUNDARY: VolumeController
// Lines 2146-2197 (~50 lines)
// Dependencies: this.masterGain
// Ready for extraction: HIGH PRIORITY
// ========================================
```

Mark all 12 proposed components with clear boundaries.

### 📊 PRIORITY 3: Add Component Dependency Map (Day 2)

Create `/frontend/src/services/AUDIOSERVICE_COMPONENTS_MAP.md`:
- List all 12 proposed components
- Document dependencies between them
- Mark extraction priority (Easy/Medium/Hard)
- Provide extraction order

### 🧪 PRIORITY 4: Add Integration Tests (Day 3)

Before any extraction, ensure current functionality is tested:
- Test audio initialization
- Test filter modulation pipeline
- Test volume controls
- Test musical event processing

**Goal**: Establish test baseline before refactoring

---

## DEFERRED TO FUTURE SPRINTS

### Sprint 3-4: Extract Simple Components
- VolumeController (~50 lines)
- PerformanceMonitor (~150 lines)
- UtilityHelpers (~200 lines)

### Sprint 5-7: Extract Core Components
- GestureParameterMapper (~450 lines)
- ThreeTierAudioCalculator (~150 lines)

### Sprint 8-12: Extract Complex Components
- FilterModulationEngine (~800 lines)
- LFOSystemManager (~600 lines)
- GenerativeAudioSystem (~700 lines)

---

## RATIONALE FOR PRAGMATIC APPROACH

**Why not extract components now?**

1. **Risk Management**: AudioService is critical, live, production code
2. **Test Coverage**: Current test coverage is ~20%, need 90% before major refactor
3. **Circular Dependencies**: 3 circular dependencies need careful resolution
4. **LFO Chaos**: 4 overlapping LFO systems must be unified first
5. **Time Constraint**: Sprint 2 is 3-5 days, not 15 weeks

**Pragmatic Sprint 2 delivers:**
- ✅ Immediate value: -650 lines of duplicate/dead code
- ✅ Foundation: Clear component boundaries documented
- ✅ Safety: Integration tests established
- ✅ Roadmap: Extraction plan for future sprints
- ✅ Risk mitigation: No breaking changes

---

## SUCCESS METRICS

| Metric | Before | Sprint 2 Target |
|--------|--------|-----------------|
| Lines of Code | 4,014 | 3,364 (-16%) |
| Duplicate Methods | 3 pairs | 0 (-100%) |
| Dead Code | ~500 lines | 0 (-100%) |
| Component Boundaries | 0 documented | 12 documented |
| Test Coverage | ~20% | ~35% (baseline) |
| Breaking Changes | N/A | 0 (safe refactor) |

---

## IMPLEMENTATION STEPS

### Day 1: Cleanup
1. Identify which version of duplicate methods is better
2. Remove inferior versions
3. Remove dead code sections
4. Test thoroughly
5. Commit: "Remove duplicate methods and dead code from AudioService"

### Day 2: Documentation
1. Add component boundary comments
2. Create AUDIOSERVICE_COMPONENTS_MAP.md
3. Document dependencies
4. Commit: "Document AudioService component boundaries for future extraction"

### Day 3: Testing
1. Add integration tests for critical paths
2. Establish test baseline
3. Commit: "Add AudioService integration tests baseline"

### Day 4-5: Buffer & Documentation
1. Update PROJECT_ASSESSMENT.md with Sprint 2 results
2. Update CLAUDE.md if needed
3. Prepare Sprint 3 plan

---

## NEXT STEPS AFTER SPRINT 2

**Sprint 3 Focus**: Extract VolumeController + PerformanceMonitor (easy, low-risk)

**Long-term**: Follow 15-week migration plan from comprehensive analysis

This pragmatic approach balances:
- ✅ Immediate value (cleanup)
- ✅ Risk management (no breaking changes)
- ✅ Future readiness (documentation + tests)
- ✅ Time constraints (3-5 days realistic)
