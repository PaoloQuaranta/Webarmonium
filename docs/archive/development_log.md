# Webarmonium Development Log

> **Note:** Older entries (1-161) have been moved to [log_archive.md](log_archive.md)

---




## Entry #162 - Compositional Parameter Tuning ("Accordare lo Strumento")

**Date**: 2026-01-23
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Comprehensive tuning of compositional algorithm parameters to ensure user input triggers the full range of musical parameters. Fixed multiple issues where parameters were either constant (always 0 or null) or had limited ranges. Additionally fixed autodeploy script that was failing silently when local changes blocked git pull.

---

### Problem Statement

After implementing the composition monitoring system (Entry #160), analysis revealed several parameter issues:

**Category A: Values Always Constant**
| Parameter | Value | Cause |
|-----------|-------|-------|
| `chromaticism` | 0 | Required turn angles >45° (rare in fluid gestures) |
| `modalFlavor` | null | Not extracted in snapshot |
| `intervalProfile` | null | Not extracted in snapshot |
| `contourType` | null | Not extracted in snapshot |
| `styleShifts` | 0 | Counter never incremented |

**Category B: Range Too Limited**
| Parameter | Actual Range | Theoretical | Cause |
|-----------|--------------|-------------|-------|
| `timeSignature` | "4/4" | 3/4,6/8,5/4... | Never updated by StyleAnalyzer |
| `formStructure` | 2 forms | 5+ forms | Genre threshold >0.7 too strict |
| `keyCenter` | Almost always C | All 12 keys | No initialization from external seed |

**Category C: Modulations Too Infrequent**
| Parameter | Frequency | Ideal | Cause |
|-----------|-----------|-------|-------|
| `keyCenter` | ~1/day | 1/30min | Threshold 0.92 too high |

---

### Solution

#### 1. Enhanced StyleAnalyzer Detection Methods

**File:** `backend/src/services/StyleAnalyzer.js`

**detectModalFlavor()** - Now uses multiple factors:
- Energy level (high → lydian/mixolydian, low → aeolian/phrygian)
- Contour direction (ascending → brighter, descending → darker)
- Swing amount (high swing → mixolydian/dorian)
- Y-position variance (high spread → dorian)
- Velocity trend (increasing → brighter, decreasing → darker)

```javascript
if (energy > 0.65) {
  if (swing > 0.4) return 'mixolydian'
  if (contour === 'ascending' && velocityTrend > 0.1) return 'lydian'
  if (contour === 'ascending') return 'ionian'
  return 'mixolydian'
} else if (energy < 0.35) {
  if (contour === 'descending' && ySpread > 0.3) return 'phrygian'
  // ...
}
```

**detectChromaticism()** - Lowered threshold, added multiple methods:
- Path complexity: Turn angle threshold 45° → 15°, partial credit for any turn
- Y-position variance: Pitch irregularity scoring
- Velocity variance: New factor for expressive variation

**classifyMeter()** - Added swing/energy/syncopation fallback:
- High swing → compound meters (6/8, 12/8)
- High syncopation + moderate energy → 5/4
- Low energy → 3/4
- High energy → 7/8 or 4/4

#### 2. HarmonicEngine Key Modulation & Initialization

**File:** `backend/src/services/HarmonicEngine.js`

**Lowered key change threshold** from 0.92 to 0.85:
```javascript
const keySelector = (compositionCount * PHI) % 1
if (keySelector > 0.85) {  // Was 0.92
  // Move by fifths (more musical than random jumps)
  const direction = keySelector > 0.925 ? 1 : -1
  // ...
}
```

**Added initializeKeyFromMetrics()** - Uses WebMetricsPoller data as seed:
```javascript
initializeKeyFromMetrics(metrics) {
  if (this.keyInitialized) return

  const wikiEdits = metrics?.wikipedia?.editsPerMinute || 0
  const hnPosts = metrics?.hackernews?.postsPerMinute || 0
  const ghCommits = metrics?.github?.commitsPerMinute || 0
  const totalActivity = wikiEdits + hnPosts * 10 + ghCommits

  // Key from total activity
  const keyIndex = Math.floor((totalActivity * PHI) % 1 * 12)
  this.currentKey = circleOfFifths[keyIndex]

  // Mode based on dominant source
  const modeBySource = {
    wikipedia: ['ionian', 'lydian'],      // informational
    hackernews: ['dorian', 'mixolydian'], // discussion
    github: ['aeolian', 'phrygian']       // technical
  }
  // ...
  this.keyInitialized = true
}
```

#### 3. CompositionEngine Form Selection

**File:** `backend/src/services/CompositionEngine.js`

Improved form selection to use multiple factors:
```javascript
const historyVariation = (historyLength * PHI) % 1
const combinedIndex = energy * 0.4 + temporalOffset * 0.4 + historyVariation * 0.2
const index = Math.max(0, Math.min(Math.floor(combinedIndex * forms.length), forms.length - 1))
```

#### 4. CompositionMonitor Snapshot Enhancement

**File:** `backend/src/services/CompositionMonitor.js`

- Extract `modalFlavor` from `style.harmonicComplexity.modalFlavor`
- Extract `intervalProfile` from `style.melodicCharacter.intervalProfile`
- Extract `contourType` from `style.melodicCharacter.contourType`
- Track `styleShifts` (dominant genre changes)
- Added `_getDominantGenre()` helper

#### 5. BackgroundCompositionService Gesture Window

**File:** `backend/src/services/BackgroundCompositionService.js`

Increased gesture analysis window from 10 to 25 for more stable readings.

#### 6. LandingCompositionService Integration

**File:** `backend/src/services/LandingCompositionService.js`

Added call to initialize HarmonicEngine from web metrics on first data arrival:
```javascript
updateMetrics(newMetrics) {
  this.metrics = newMetrics
  if (this.harmonicEngine && !this.harmonicEngine.keyInitialized) {
    this.harmonicEngine.initializeKeyFromMetrics(newMetrics)
  }
}
```

---

### Autodeploy Fix

**Problem:** The autodeploy script (`/home/polden/auto-deploy.sh`) used `set -euo pipefail`, causing silent exit when `git pull` failed due to local changes. Logs showed a gap from 22:17 to 23:22 where the script ran but failed silently.

**Solution:** Rewrote script to:
1. Check for local changes before pulling
2. Auto-reset local changes with logging
3. Capture git pull exit code and log errors explicitly

```bash
# Check for local changes that would block pull
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    log "=== ERROR: Local changes detected - resetting to allow pull ==="
    git checkout -- . 2>&1 | while read line; do log "  $line"; done
fi

# Try git pull and capture output + exit code
PULL_OUTPUT=$(git pull origin prod 2>&1)
PULL_EXIT=$?

if [ $PULL_EXIT -ne 0 ]; then
    log "=== ERROR: git pull failed (exit $PULL_EXIT) ==="
    log "Git error: $PULL_OUTPUT"
    exit 1
fi
```

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/StyleAnalyzer.js` | Enhanced detectModalFlavor(), detectChromaticism(), classifyMeter() |
| `backend/src/services/HarmonicEngine.js` | Key threshold 0.92→0.85, initializeKeyFromMetrics() |
| `backend/src/services/CompositionEngine.js` | Multi-factor form selection |
| `backend/src/services/CompositionMonitor.js` | Extract modalFlavor/intervalProfile/contourType, styleShifts tracking |
| `backend/src/services/BackgroundCompositionService.js` | Gesture window 10→25 |
| `backend/src/services/LandingCompositionService.js` | Initialize key from web metrics |
| `/home/polden/auto-deploy.sh` (production) | Error handling for local changes |

---

### Commits

- `9f7c101` - fix(composition): Tune algorithmic parameters for full range coverage
- `04399a7` - fix(harmony): Dynamic starting key and improved parameter sensitivity
- `6dd3a8f` - fix(harmony): Initialize starting key from web metrics

---

### Expected Results

After these changes:
- **Starting key**: Varies based on web metrics activity at startup
- **Key changes**: ~15% of compositions (vs ~8% before)
- **Modal flavor**: Now varies based on gesture characteristics
- **chromaticism**: Non-zero when gestures have turns or velocity variation
- **timeSignature**: Can be 3/4, 5/4, 6/8, 7/8, 12/8 based on swing/energy
- **styleShifts**: Tracked and reported in monitoring

---

### Version

v0.1.6

---

## Entry #163 - Form Cycle Completion Constraint

**Date**: 2026-01-24
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed issue where musical forms were changing too quickly before completing a full cycle through all their sections. A form (ABA, rondo, sonata, etc.) must now complete at least one full cycle through all its sections before it can change to a different form.

---

### Problem Statement

During compositional algorithm tuning, forms were observed to change frequently (with ~12% probability per composition) regardless of whether they had played through all their sections. For example:
- An ABA form might change after only playing A→B, never reaching the final A
- A rondo (ABACA) might change after A→B→A, never playing the C section
- A verse_chorus form might change mid-song, creating incoherent structure

This violated basic musical form principles where a form should complete its statement before transitioning.

---

### Solution

#### 1. Added `formCycleLength` Property

Added new property to track how many sections constitute one complete cycle for each form type:

| Form | Cycle Length | Sequence |
|------|--------------|----------|
| ABA | 3 | A → B → A |
| rondo | 5 | A → B → A → C → A |
| AABA | 4 | A → A → B → A |
| verse_chorus | 8 | intro → verse → chorus → verse → chorus → bridge → chorus → outro |
| sonata | 3 | exposition → development → recapitulation |
| theme_and_variations | 4 | theme → var1 → var2 → var3 |
| build_drop | 3 | build → drop → breakdown |
| blues | 1 | 12-bar cycle |
| strophic | 3 | 3 strophes minimum |
| through_composed | 3 | A → B → C |
| modal | 4 | A → A → B → A |
| rhythm_changes | 4 | A → A → B → A |
| intro_verse_chorus_bridge_outro | 5 | full song |
| default | 3 | 3 sections minimum |

#### 2. Updated Form Reset Logic

Changed `shouldResetForm` condition to require cycle completion:

```javascript
// Before: Could change at any time
const shouldResetForm = !this.formStructure ||
  (this.compositionCount > 0 && ((this.compositionCount * PHI) % 1) < 0.12)

// After: Must complete cycle first
const hasCompletedCycle = this.sectionHistory.length >= this.formCycleLength
const wantsToReset = this.compositionCount > 0 && ((this.compositionCount * PHI) % 1) < 0.12
const shouldResetForm = !this.formStructure || (hasCompletedCycle && wantsToReset)
```

#### 3. Updated `getNextSection()` for All Form Types

Added proper section sequences for all form types including new ones:
- `theme_and_variations`, `through_composed`, `strophic`, `build_drop`, `modal`, `rhythm_changes`, `intro_verse_chorus_bridge_outro`, `blues`

Fixed AABA to use correct 4-section sequence instead of conditional logic.

#### 4. Added Monitoring Fields

CompositionMonitor now tracks:
- `formCycleLength`: Sections needed for complete cycle
- `formCycleProgress`: Current progress (e.g., "2/5")
- `hasCompletedCycle`: Boolean indicating if form can change

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/CompositionEngine.js` | Added `formCycleLength` property, updated `shouldResetForm` logic, expanded `initializeFormStructure()` and `getNextSection()` |
| `backend/src/services/CompositionMonitor.js` | Added `formCycleLength`, `formCycleProgress`, `hasCompletedCycle` to snapshots |

---

### Expected Behavior

| Form | Min Compositions Before Change |
|------|-------------------------------|
| ABA | 3 |
| rondo | 5 |
| verse_chorus | 8 |
| sonata | 3 |
| AABA | 4 |
| blues | 1 (shortest) |

Forms with longer cycles (verse_chorus, rondo) will remain stable longer, creating more coherent musical structures.

---

### Version

v0.1.7

---

## Entry #169 - Section-Aware Compositional Architecture (Code Review Fixes)

**Date**: 2026-01-24
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Completed code review fixes for the section-aware compositional architecture. This entry implements rich musical section parameters based on classical form theory, replacing simple "mood" values with comprehensive musical context that influences all composition layers.

---

### Problem Statement

Code review of the Entry #169 implementation identified 14 issues across new and modified files:

| # | Priority | Issue | File |
|---|----------|-------|------|
| 1 | Critical | Division by zero in `evolve()` | SectionContext.js |
| 2 | Critical | Memory leak - no cleanup of inactive rooms | SectionStateManager.js |
| 3 | Critical | Race condition in `updateProgress()` | SectionStateManager.js |
| 4 | High | Return value indicates valid contour on invalid input | DevelopmentTechniques.js |
| 5 | High | Raw gesture retrieval never called in composition flow | CompositionEngine.js |
| 6 | High | Missing unified technique application in PhraseMorphology | PhraseMorphology.js |
| 7 | High | Need fallback indicator when material missing | MaterialLibrary.js |
| 8 | Medium | Unused PHI constant | RawGestureData.js |
| 9 | Medium | Magic numbers | SectionStateManager.js |
| 10 | Medium | Missing JSDoc parameter types | FormDefinitions.js |
| 11 | Medium | Array bounds issue in `resampleContour()` | DevelopmentTechniques.js |
| 12 | Low | Inconsistent semicolons | - (already consistent) |
| 13 | Low | Naming convention inconsistency | SectionStateManager.js |
| 14 | Low | Complex conditionals | DevelopmentTechniques.js |

---

### Fixes Applied

#### Critical Fixes

**Fix #1 - Division by Zero Protection**
```javascript
// Before
const stepDelta = Math.floor((this.sectionIndex / (this.totalSections - 1)) * 12)

// After
const denominator = Math.max(1, this.totalSections - 1)
const stepDelta = Math.floor((this.sectionIndex / denominator) * 12)
```

**Fix #2 - Memory Leak Prevention**
Added activity tracking and periodic cleanup for inactive rooms:
- `_lastActivityTime` Map to track per-room activity
- `_cleanupInactiveRooms()` method running every 60 seconds
- Rooms inactive for 5+ minutes are automatically cleaned up

**Fix #3 - Race Condition Prevention**
Added locking mechanism to `updateProgress()`:
```javascript
if (this._updateLocks.get(roomId)) {
  return this.getState(roomId)  // Another update in progress
}
this._updateLocks.set(roomId, true)
try {
  // ... update logic
} finally {
  this._updateLocks.set(roomId, false)
}
```

#### High Priority Fixes

**Fix #4 - Invalid Input Handling**
`applyTechnique()` and `resampleContour()` now return `null` for invalid input instead of default contours.

**Fix #5 - Raw Gesture Retrieval Integration**
Added `_convertRawGesturesToMaterial()` to CompositionEngine that:
- Retrieves raw gestures via `materialLibrary.getRawGesturesForSection()`
- Converts them to usable material using PhraseMorphology
- Integrates with `getAvailableMaterial()` and `composeAmbient()`

**Fix #6 - Unified Technique Application**
PhraseMorphology now applies development techniques via `DevelopmentTechniques.applyTechnique()`.

**Fix #7 - Fallback Indicator**
`getRawGesturesForSection()` returns `{ gestures, usedFallback }` to indicate when category fallback was used.

#### Medium Priority Fixes

**Fix #8** - Removed unused PHI constant from RawGestureData.js
**Fix #9** - Extracted magic numbers to named constants (CLEANUP_INTERVAL_MS, ROOM_INACTIVITY_THRESHOLD_MS)
**Fix #10** - Added JSDoc @param and @returns types to FormDefinitions.js
**Fix #11** - Added array bounds protection with `maxIdx` and clamped interpolation

#### Low Priority Fixes

**Fix #13** - Renamed `lastActivityTime` to `_lastActivityTime` for naming convention consistency
**Fix #14** - Refactored `getTechniqueForRole()` to use lookup table structure

---

### New Files Created

| File | Purpose |
|------|---------|
| `backend/src/composition/SectionContext.js` | 20+ musical parameters per section (thematic role, dynamics, harmonic tension, etc.) |
| `backend/src/composition/FormDefinitions.js` | Mappings from form types to section parameters |
| `backend/src/composition/DevelopmentTechniques.js` | Classical thematic transformations (statement, variation, sequence, fragmentation, etc.) |
| `backend/src/composition/RawGestureData.js` | Raw gesture storage before quantization ("late binding") |
| `backend/src/services/SectionStateManager.js` | Singleton pub/sub manager for section state broadcasting |

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/CompositionEngine.js` | Integrated PhraseMorphology, added `_convertRawGesturesToMaterial()` |
| `backend/src/services/PhraseMorphology.js` | Uses DevelopmentTechniques, section-aware phrase generation |
| `backend/src/services/MaterialLibrary.js` | Raw gesture storage/retrieval with fallback indicator |

---

### Architecture

```
User Gesture → RawGestureData → MaterialLibrary (raw storage)
                                       │
                                       ▼
                         SectionStateManager ←── CompositionEngine
                                │                 (section transitions)
               ┌────────────────┼────────────────┐
               ▼                ▼                ▼
   GestureToMusicService  CounterpointEngine  VirtualUserService
               │                │                │
               └────────────────┼────────────────┘
                                ▼
                     PhraseMorphology.gestureToPhrase()
                                │
               ┌────────────────┼────────────────┐
               ▼                ▼                ▼
       applyDevelopment   selectScale      generateRhythm
               │                │                │
               └────────────────┼────────────────┘
                                ▼
                    QUANTIZED NOTES (late binding)
```

---

### Version

v0.1.8

---

## Entry #170: CompositionMonitor 5-Minute History Graphs

**Date:** 2026-01-24

### Summary

Added 5-minute history linear graphs for all numeric fields in the CompositionMonitor dashboard. Implemented comprehensive history buffer system with real-time Chart.js visualization.

---

### Implementation

#### History Buffer System
- Added `historyBuffer` tracking 15 numeric fields:
  - Core: tempo, compositionsInSection, complexityLevel, density, tensionLevel, compositionCount
  - Harmony: progressionLength
  - Style: energy, tempo, harmonicComplexity.chromaticism, harmonicComplexity.dissonance
  - Materials: total, activeCount
  - Room: gestureCount, sessionDuration
- `_updateHistoryBuffer()`: Extracts numeric values from snapshots with nested object support
- `_pruneHistoryBuffer()`: Removes entries older than 5 minutes (optimized to skip if oldest entry is valid)
- `getNumericHistory()` / `getFieldHistory()`: API methods for history retrieval

#### WebSocket Optimization
- Separated history broadcasts from snapshot broadcasts
- History updates throttled to every 5 seconds via `_startHistoryBroadcastInterval()`
- Added `maxHistoryEntriesPerField` (600) safeguard against memory leaks

#### REST API Endpoints
- `GET /api/admin/monitor/history/numeric`: All numeric fields history
- `GET /api/admin/monitor/history/:fieldPath`: Specific field history

#### Dashboard Visualization
- Added 14 Chart.js mini-graphs with field-specific colors, units, and scales
- Pinned Chart.js to v4.4.1 with SRI hash for security
- `requestAnimationFrame` throttling for smooth chart updates
- Accessibility labels (role="img", aria-label) on all canvas elements
- XSS prevention: simplified `updateElement()` to always use `textContent`

---

### Testing

Created `/backend/tests/unit/CompositionMonitor.history.test.js` with 18 unit tests:
- `_updateHistoryBuffer()`: numeric values, undefined/null/NaN handling, nested objects, max size limit
- `_pruneHistoryBuffer()`: time-based removal, retention of valid entries, optimization skip
- `getNumericHistory()`: relative time calculation, disabled state
- `getFieldHistory()`: specific field retrieval, unknown field error, available fields list
- `_getCompactHistory()`: formatting, empty buffer handling
- Integration: recordSnapshot with history
- Configuration: environment variable support, default 5-minute duration

All 18 tests pass.

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/CompositionMonitor.js` | History buffer, pruning, API methods, throttled broadcasts |
| `backend/src/api/monitorRoutes.js` | REST endpoints for history data |
| `backend/public/monitor/index.html` | Chart.js graphs, accessibility, security fixes |

### Files Created

| File | Purpose |
|------|---------|
| `backend/tests/unit/CompositionMonitor.history.test.js` | 18 unit tests for history buffer system |

---

### Version

v0.1.9

---

## Entry #171 - Deterministic Musical Variety via Web Metrics

**Date**: 2026-01-24
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Implemented comprehensive musical variety system that uses web metrics (Wikipedia edits, HackerNews posts, GitHub commits) as deterministic sources of variation. Expanded chord progressions from 15 to 52, added web metrics-driven key/mode modulation, and gesture variation layer. No randomness used - all variation is reproducible given identical inputs.

---

### Problem Statement

Musical output was repetitive despite gesture variation:
- Only 15 chord progressions (3 per genre × 5 genres)
- Key changes triggered only ~8% of compositions
- Mode changes infrequent
- Gesture-to-music mapping was static (same gesture → same output)

The system needed more variety while preserving:
- **Determinism** - identical inputs must produce identical outputs
- **Harmonic coherence** - all pitches constrained to current scale
- **Form persistence** - ~8 compositions per form cycle

---

### Solution

#### 1. Expanded Chord Progressions (52 total)

**File**: `backend/src/services/HarmonicEngine.js`

Each genre now has 10-12 progressions ordered by complexity (0.1 → 0.95):

| Genre | Count | Examples |
|-------|-------|----------|
| Jazz | 12 | Dorian vamp, ii-V-I, tritone sub, Coltrane changes |
| Classical | 10 | Plagal, Romanesca, Neapolitan, chromatic mediants |
| Electronic | 10 | Drone, Phrygian, Lydian float, whole tone |
| Rock | 10 | Power chords, Andalusian, borrowed iv, tritone |
| Pop | 10 | Axis progression, doo-wop, modal mixture |

#### 2. Web Metrics-Driven Progression Selection

```javascript
_selectProgressionByComplexity(progressions, complexity, bars, compositionCount, webMetrics) {
  // Weights sum to 0.95 max to prevent edge case
  const complexityWeight = safeComplexity * 0.38

  // PHI power scaling normalizes different metric ranges:
  // Wikipedia (high volume) → PHI^1, HN (medium) → PHI^2, GitHub (variable) → PHI^3
  metricsOffset = ((wiki * PHI + hn * PHI * PHI + gh * PHI * PHI * PHI) % 1) * 0.38

  const temporalOffset = ((compositionCount * PHI) % 1) * 0.19

  const combinedIndex = complexityWeight + metricsOffset + temporalOffset
  return progressions[Math.floor(combinedIndex * progressions.length)]
}
```

#### 3. Key/Mode Modulation Based on Metrics

**Dynamic Key Threshold**: High activity → more key changes
```javascript
const keyThreshold = 0.92 - (combinedActivity * 0.22) // Range: 0.70-0.92
```

**Modulation Type by Metric Dominance**:
| Dominant Metric | Modulation Type | Semitones |
|-----------------|-----------------|-----------|
| Wikipedia | Mediant (chromatic third) | ±4 |
| GitHub | Whole step | ±2 |
| HackerNews | Circle of Fifths | ±7 |
| None | Relative key | ±3 |

**Mode Brightness Mapping**:
```javascript
const modesByBrightness = ['locrian', 'phrygian', 'aeolian', 'dorian', 'mixolydian', 'ionian', 'lydian']
// High combined activity → brighter modes (lydian)
// Low combined activity → darker modes (locrian)
```

#### 4. Gesture Variation Layer

**File**: `backend/src/services/GestureToMusicService.js`

Web metrics now influence gesture-generated phrases:

| Parameter | Metric Influence | Range |
|-----------|------------------|-------|
| Pitch offset | wiki + hn | ±3 semitones |
| Velocity | GitHub activity | 75-105 |
| Duration | HackerNews activity | 0.08-0.15s |
| Articulation | Wikipedia activity | staccato/legato |

All pitch modifications pass through `constrainToScale()` for harmonic coherence.

#### 5. Helper Method for Metrics Normalization

**File**: `backend/src/services/BackgroundCompositionService.js`

Extracted normalization to `_normalizeWebMetrics()`:
```javascript
_normalizeWebMetrics() {
  // Divisors based on typical peak activity levels
  return {
    wikipedia: { normalized: Math.min(1, editsPerMinute / 50) },
    hackernews: { normalized: Math.min(1, postsPerMinute / 5) },
    github: { normalized: Math.min(1, commitsPerMinute / 30) }
  }
}
```

---

### Code Review Fixes Applied

| Issue | Fix |
|-------|-----|
| Edge case: combinedIndex = 1.0 | Reduced weights from 1.0 to 0.95 max |
| Chromatic modulation too harsh (±1) | Changed to whole step (±2) |
| Code duplication | Extracted `_normalizeWebMetrics()` helper |
| PHI power scaling undocumented | Added detailed comments explaining rationale |

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/HarmonicEngine.js` | 52 progressions, `_selectProgressionByComplexity()` with webMetrics, `_transposeKey()`, `_getRelativeKey()`, metrics-driven key/mode selection |
| `backend/src/services/CompositionEngine.js` | Store and propagate webMetrics |
| `backend/src/services/BackgroundCompositionService.js` | `_normalizeWebMetrics()` helper, webMetrics in roomContext and syncHarmonicContext |
| `backend/src/services/GestureToMusicService.js` | webMetrics property, gesture variation in tap/hover/basic phrases |

---

### Music Theory Rationale

**Why PHI power scaling?**
Different sources have vastly different activity volumes. PHI powers (1.618, 2.618, 4.236) create a multiplicative spread that normalizes influence when combined with modulo-1 wrapping.

**Why these modulation types?**
- Mediant (±4): Dramatic but consonant (shares common tones)
- Whole step (±2): Smooth parallel movement
- Circle of Fifths (±7): Most natural tonal modulation
- Relative key (±3): Always safe, same key signature

**Why brightness mapping?**
Modes have inherent "brightness" based on raised/lowered scale degrees. High activity correlates with bright, energetic music (lydian), while low activity suggests darker, introspective moods (locrian, phrygian).

---

### Version

v0.2.0

---

## Entry #171 Addendum: Code Review Fixes

**Date**: 2026-01-24
**Focus**: Fixes for issues identified during code review of Entry #171

---

### Issues Fixed

#### High Priority

1. **Inconsistent Normalization** (BackgroundCompositionService.js)
   - **Problem**: PhraseMorphology was doing its own normalization, duplicating logic and risking inconsistency
   - **Fix**: Centralized ALL normalization in `_normalizeWebMetrics()` - now returns pre-normalized values with `*Norm` suffix fields (avgEditSizeNorm, avgUpvotesNorm, velocityNorm, etc.)

2. **Zero-Velocity Edge Case** (PhraseMorphology.js)
   - **Problem**: When all sources have near-zero velocity, `effectiveVelocity` dominated by noise
   - **Fix**: Added fallback to acceleration when `|combinedVelocity| < 0.1`:
   ```javascript
   const effectiveVelocity = Math.abs(combinedVelocity) < 0.1
     ? ((wiki.accelerationNorm ?? 0.5) - 0.5) * 2
     : combinedVelocity
   ```

3. **Array Bounds Safety** (PhraseMorphology.js)
   - **Problem**: contourScore could theoretically exceed 1.0 from floating-point accumulation
   - **Fix**: Explicit clamp: `Math.min(1, Math.max(0, contourScore))`

#### Medium Priority

4. **Magic Numbers in Ornamentation** (PhraseMorphology.js)
   - **Problem**: Used raw values (5, 3, 2) instead of normalized thresholds
   - **Fix**: Now uses pre-normalized createsNorm/deletesNorm with thresholds 0.5, 0.3, 0.6

5. **commentCount Ceiling Too Low** (BackgroundCompositionService.js)
   - **Problem**: Ceiling of 50 caused saturation on active threads
   - **Fix**: Increased ceiling to 100 for better dynamic range

6. **Asymmetric Amplitude Clamping** (PhraseMorphology.js)
   - **Problem**: Fixed bounds [0.05, 0.25] didn't scale with curvature
   - **Fix**: Symmetric clamping around base amplitude (±50% of base):
   ```javascript
   const minAmplitude = Math.max(0.02, baseAmplitude * 0.5)
   const maxAmplitude = Math.min(0.3, baseAmplitude * 1.5)
   ```

7. **WebMetrics Sync Timing** (BackgroundCompositionService.js)
   - **Problem**: Metrics only synced on composition cycle, gestures got stale data
   - **Fix**: Added `this._syncWebMetrics()` call at start of `addMaterial()` for fresh data on every gesture

8. **Italian Comments** (PhraseMorphology.js)
   - **Problem**: Mixed Italian/English comments reduced readability
   - **Fix**: Translated all Italian comments to English

#### Low Priority

9. **Null-Safety Patterns** (PhraseMorphology.js)
   - **Problem**: Inconsistent use of || vs ?? for defaults
   - **Fix**: Standardized to ?? operator for cleaner null/undefined handling

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/BackgroundCompositionService.js` | Centralized normalization with *Norm fields, commentCount ceiling 100, sync in addMaterial() |
| `backend/src/services/PhraseMorphology.js` | Uses pre-normalized values, velocity fallback, symmetric clamping, English comments, ?? operator |

---

### Verification

Tested with LOW activity metrics (all 0.1) vs HIGH activity metrics (all 0.9):
- LOW: 2 notes, level contour, minimal amplitude
- HIGH: 7 notes, ascending_descending contour, wide amplitude

All normalized values confirmed in 0-1 range.

---

### Version

v0.2.1

---
