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

## Entry #171 Addendum 2: Real User WebMetrics Fix

**Date**: 2026-01-24
**Focus**: Fix webMetrics for real user gestures (not just virtual users)

---

### Problem Identified

Real users' gesture processing followed a different code path than virtual users:
- Virtual users: LandingCompositionService/VirtualUserService → have direct WebMetricsPoller access
- Real users: GestureToMusicService → relied on stale webMetrics synced from BackgroundCompositionService

The sync timing was wrong:
1. `gestureToMusicService.processGesture()` generates phrase with STALE webMetrics
2. `backgroundCompositionService.addMaterial()` syncs fresh metrics (TOO LATE)

---

### Fix Applied

**GestureToMusicService.js:**
```javascript
// Added WebMetricsPoller reference
this.webMetricsPoller = null

setWebMetricsPoller(poller) {
  this.webMetricsPoller = poller
}

_normalizeWebMetrics() {
  if (!this.webMetricsPoller) return this.webMetrics // Fallback to synced metrics
  const raw = this.webMetricsPoller.getMetrics()
  if (!raw) return this.webMetrics
  // Returns same normalized format as BackgroundCompositionService
  return { wikipedia: { normalized, avgEditSizeNorm, ... }, ... }
}

processGesture(gestureData) {
  // Entry #171 fix: Sync fresh metrics BEFORE processing gesture
  this.webMetrics = this._normalizeWebMetrics()
  // ... rest of processing
}
```

**ServiceContainer.js:**
```javascript
gestureToMusicService: (service, c) => {
  // Entry #171 fix: Link WebMetricsPoller for fresh metrics on real user gestures
  const webMetricsPoller = c.get('webMetricsPoller')
  service.setWebMetricsPoller(webMetricsPoller)
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/GestureToMusicService.js` | Added webMetricsPoller, setWebMetricsPoller(), _normalizeWebMetrics(), sync at processGesture start |
| `backend/src/services/ServiceContainer.js` | Wire WebMetricsPoller to GestureToMusicService |

---

### Version

v0.2.2

---

## Entry #171 Addendum 3: Duration Passthrough Fix

**Date**: 2026-01-24
**Focus**: Fix missing duration in real user gesture normalization

---

### Problem Identified

Real user drag gestures always produced the same phrase pattern because:
- `normalizeGestureData()` didn't extract `duration` from the gesture
- PhraseMorphology.generatePhrase() always defaulted to 1000ms
- Same duration → same phrase length → same pattern

Frontend DOES send duration (in ms) with gesture data, but backend wasn't extracting it.

---

### Fix Applied

**GestureToMusicService.js - normalizeGestureData():**
```javascript
// Entry #171 fix: Extract duration for phrase length calculation
// Frontend sends duration in ms - critical for webMetrics-driven phrase generation
const duration = gesture.duration || gestureData.duration || 1000

// Added to return object:
return {
  // ... other fields ...
  duration,  // Entry #171 fix: Include duration for phrase length variation
  trajectory,
  timestamp: Date.now()
}
```

---

### Impact on Phrase Generation

With duration now passing through:
1. **calculatePhraseLengthFromDuration()** uses actual gesture duration
2. **Longer drags** → more notes (up to 12)
3. **Shorter drags** → fewer notes (min 2)
4. **webMetrics.commentCountNorm** modulates density on top of duration

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/GestureToMusicService.js` | Extract and return `duration` in normalizeGestureData() |

---

### Version

v0.2.3

---

## Entry #171 Addendum 4: Separate Note Durations from Phrase Structure

**Date**: 2026-01-24
**Focus**: WebMetrics should affect phrase STRUCTURE, not note durations

---

### Problem Identified

User feedback: "i drag di real users avevano durate delle note variabili rispetto alla velocità del drag. ora non funziona più. le metriche dovrebbero variare la struttura della frase (non sempre arpeggio/scala) non le durate delle note."

Two issues discovered:

1. **Note durations affected by webMetrics** - `calculatePhraseLengthFromDuration()` used `commentCountNorm` to modify `baseDuration`, but note durations should only come from gesture velocity (faster drag = shorter notes)

2. **Contour always 'arch' with default metrics** - `generateMelodicContour()` would override the gesture-based contour even when all webMetrics values were defaults (0.5). This caused phrases to always have the same structure regardless of gesture.

---

### Design Principle

**Separation of concerns:**
- **Note durations** → from GESTURE (velocity, duration)
- **Phrase structure** (contour type) → from WEB METRICS (when meaningful)

---

### Fixes Applied

**1. PhraseMorphology.js - calculatePhraseLengthFromDuration():**
```javascript
// Entry #171 Addendum 4: Note durations are ONLY from gesture velocity
// WebMetrics affect phrase STRUCTURE (contour), not note durations
// REMOVED: commentCountNorm influence on baseDuration
let baseDuration
if (velocity > 80) baseDuration = 0.25   // Fast = 16th notes
else if (velocity > 60) baseDuration = 0.5  // Medium-fast = 8th notes
// ... velocity-only mapping
```

**2. PhraseMorphology.js - generateMelodicContour():**
```javascript
// Entry #171 Addendum 4: Only override gesture contour when metrics deviate from defaults
const editDeviation = Math.abs(editSizeNorm - 0.5)
const upvotesDeviation = Math.abs(upvotesNorm - 0.5)
const createsDeviation = Math.abs(createsNorm - 0.5)
const maxDeviation = Math.max(editDeviation, upvotesDeviation, createsDeviation)

// Only apply webMetrics override if there's meaningful signal (>0.1 deviation)
if (maxDeviation > 0.1) {
  // Apply webMetrics-based contour selection
}
// Else: keep gesture-based contourType
```

---

### Behavior Summary

| Condition | Note Durations | Phrase Structure |
|-----------|----------------|------------------|
| Fast drag | Short (16th notes) | From gesture trajectory/curvature |
| Slow drag | Long (half notes) | From gesture trajectory/curvature |
| High webMetrics variation | Velocity-based | WebMetrics-driven contour |
| Default webMetrics (all 0.5) | Velocity-based | Gesture-driven contour |

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/PhraseMorphology.js` | Remove webMetrics from duration calc, add deviation check for contour override |

---

### Version

v0.2.4

---

## Entry #171 Addendum 5: Frontend Drag Audio - Duration & Pitch Variety

**Date**: 2026-01-25
**Focus**: Fix local drag audio to have varied note durations and dynamic intervals

---

### Problem Identified

User feedback: "le durate delle note nella frase sembrano ancora tutte uguali" and "drag lunghi generano ancora sequenze ripetute di poche note in loop"

After all backend fixes (Addendum 1-4), local drag audio still had:
1. **Equal note durations** - all notes same length regardless of drag speed
2. **Repeating arpeggio patterns** - same few notes in a loop during long drags

**Root Cause Discovery**: Backend PhraseMorphology.js fixes only affect REMOTE user audio. LOCAL user drag audio goes through a completely different frontend code path:

```
LOCAL drag → EnhancedGestureCapture.playDragStreamingNote()
           → DragStreamProcessor (calculates when to play)
           → DragStreamingHandler (plays audio with Tone.js)
```

The actual entry point `EnhancedGestureCapture.playDragStreamingNote()` had **hardcoded duration** with only 3 options ('32n', '16n', '8n'), completely overriding any duration variation from DragStreamProcessor.

---

### Fixes Applied (v0.2.5 → v0.2.9)

#### v0.2.5 - Backend PhraseMorphology Rhythm Fixes
**File**: `backend/src/services/PhraseMorphology.js`
- Added three sources of duration variation: acceleration, phrase shape, curvature
- Made voice leading less restrictive (stepwise motion only 50% of time)

#### v0.2.6 - Frontend Duration & Pitch Handlers
**File**: `frontend/src/services/gesture/DragStreamProcessor.js`
- Added PHI-based duration variation in `getDurationFromSpeed()`

**File**: `frontend/src/handlers/DragStreamingHandler.js`
- Expanded `durationMap` from 5 to 7 values ('64n' through '1n')
- Added `historySum` to pitch calculation for non-repeating variety:
```javascript
const historySum = this.melodicMemory.lastNotes.reduce((a, b) => a + b, 0)
const varietyFactor = (noteIndex * PHI + historySum * 0.1 + x * 3) % 1
```
- Fixed envelope to scale with duration:
```javascript
getEnvelopeForArticulation(articulation, duration) {
  const safeDuration = Math.max(0.05, duration)
  // All envelope cases now use safeDuration for ADSR values
}
```

#### v0.2.7 - Duration Variation More Aggressive
**File**: `frontend/src/handlers/DragStreamingHandler.js`
- Made duration pattern based primarily on note position (PHI stepping)

#### v0.2.8 - Speed-Primary Duration
**File**: `frontend/src/services/gesture/DragStreamProcessor.js`
- Inverted duration logic: slow drag → long notes, fast drag → short notes
- Added 6 duration options including '1n' (whole note)

#### v0.2.9 - ROOT CAUSE FIX
**File**: `frontend/src/services/EnhancedGestureCapture.js`

The actual entry point was hardcoding duration with only 3 options. Fixed `playDragStreamingNote()`:

```javascript
// BEFORE (hardcoded, only 3 options)
let duration
if (normalizedSpeed > 0.6) duration = '32n'
else if (normalizedSpeed > 0.3) duration = '16n'
else duration = '8n'

// AFTER (speed-primary with 6 options)
const durations = ['32n', '16n', '8n', '4n', '2n', '1n']
const PHI = 1.618033988749895

let baseDurationIndex
if (normalizedSpeed > 0.8) baseDurationIndex = 0      // Very fast → 32n
else if (normalizedSpeed > 0.6) baseDurationIndex = 1 // Fast → 16n
else if (normalizedSpeed > 0.4) baseDurationIndex = 2 // Medium → 8n
else if (normalizedSpeed > 0.2) baseDurationIndex = 3 // Slow → 4n
else if (normalizedSpeed > 0.1) baseDurationIndex = 4 // Very slow → 2n
else baseDurationIndex = 5                             // Extremely slow → 1n

// Position adds SUBTLE variation (±1 index max)
const positionPhase = (noteIndex * PHI) % 1
const positionVariation = Math.floor(positionPhase * 3) - 1
const finalDurationIndex = Math.max(0, Math.min(durations.length - 1,
  baseDurationIndex + positionVariation))
```

---

### Design Principle

**Speed is the PRIMARY factor for duration:**
- Slow drag → long notes (quarter, half, whole)
- Fast drag → short notes (32nd, 16th)

**Position adds SUBTLE variation:**
- PHI-based stepping prevents predictable patterns
- ±1 index variation keeps notes related but not identical

**Melodic variety through accumulated history:**
- `historySum` grows throughout drag, ensuring later notes differ from earlier ones
- No random functions - purely deterministic based on gesture metrics

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/PhraseMorphology.js` | (v0.2.5) Rhythm variation, less restrictive voice leading |
| `frontend/src/services/gesture/DragStreamProcessor.js` | (v0.2.6-0.2.8) PHI duration, speed-primary logic |
| `frontend/src/handlers/DragStreamingHandler.js` | (v0.2.6-0.2.7) Expanded durations, historySum variety, envelope scaling |
| `frontend/src/services/EnhancedGestureCapture.js` | (v0.2.9) **ROOT FIX**: Speed-primary duration at actual entry point |

---

### Behavior Summary

| Drag Type | Expected Duration | Expected Intervals |
|-----------|-------------------|-------------------|
| Very slow | Half/whole notes | Varied (historySum accumulates) |
| Slow | Quarter notes | Dynamic (not always stepwise) |
| Medium | Eighth notes | Mix of steps and leaps |
| Fast | Sixteenth notes | Dynamic arpeggios |
| Very fast | 32nd notes | Rapid varied patterns |

| Long drag | Not repeating - historySum ensures variety |
| Short drag | Brief phrase, coherent interval choices |

---

### Version

v0.2.9

---

## Entry #172 - Genre Weight Balance and Differentiation

**Date**: 2026-01-25
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Improved genre weight calculation to produce more differentiated weights and enable genre-specific music generation. Previously, genre weights clustered in the 0.10-0.20 range due to normalization across 8 genres, making the 0.7 threshold for genre-specific progressions unreachable.

---

### Problem Statement

Monitoring the composition system revealed:
1. **Genre weights too similar** - All 8 genres hovering around 0.12-0.18
2. **Genre-specific music never triggered** - 0.7 threshold was unreachable
3. **Slow style evolution** - 50% smoothing factor made changes too gradual
4. **Low gesture influence** - Weak gestures had almost no effect on style

| Metric | Before | Issue |
|--------|--------|-------|
| Typical leader weight | 0.15-0.20 | Too low for 0.7 threshold |
| Genre activation rate | ~0% | Threshold never reached |
| Style responsiveness | 25% influence | Too slow to react |

---

### Solution

#### 1. Distribution Sharpening

**File**: `backend/src/services/StyleAnalyzer.js`

Added power function to amplify weight differences after normalization:

```javascript
const GENRE_SHARPENING_EXPONENT = 2.0
const SHARPENING_UNDERFLOW_THRESHOLD = 1e-10

_sharpenDistribution(weights, exponent = GENRE_SHARPENING_EXPONENT) {
  const keys = Object.keys(weights)
  const sharpened = {}

  // Apply power function, ensuring non-negative values
  keys.forEach(key => {
    sharpened[key] = Math.pow(Math.max(0, weights[key]), exponent)
  })

  const total = Object.values(sharpened).reduce((sum, w) => sum + w, 0)

  // Underflow protection
  if (total < SHARPENING_UNDERFLOW_THRESHOLD) {
    const uniform = 1.0 / keys.length
    keys.forEach(key => sharpened[key] = uniform)
    return sharpened
  }

  // Re-normalize
  keys.forEach(key => sharpened[key] /= total)
  return sharpened
}
```

**Mathematical Effect**:
- Input: `[0.20, 0.18, 0.15, 0.12, ...]`
- Output: `[0.28, 0.23, 0.16, 0.10, ...]`
- Leader advantage amplified from 1.11x to 1.23x

#### 2. Reduced Smoothing Factor

Changed `smoothingFactor` from 0.5 to 0.3:
- Before: 50% new influence for initial gestures
- After: 70% new influence for initial gestures

#### 3. Minimum Alpha Floor

Added floor to ensure weak gestures still have effect:

```javascript
const alpha = Math.max(0.15, baseAlpha * gestureWeight)
```

#### 4. Lowered Genre Thresholds

**Files**: `HarmonicEngine.js`, `CounterpointEngine.js`

Changed all genre activation thresholds from 0.7 to 0.35:

```javascript
// Before
if (genreWeights.jazz > 0.7) { ... }

// After
if (genreWeights.jazz > 0.35) { ... }
```

This enables genre-specific progressions and timbres when a genre has clear dominance.

---

### Code Review Improvements

Based on code review feedback, added:

1. **Named constants** with documentation
2. **Underflow protection** for edge cases
3. **Comprehensive tests** for sharpening behavior

#### Tests Added

**File**: `backend/tests/unit/test_musical_components.test.js`

- `should sharpen distribution to create clearer genre differentiation`
- `should amplify differences when sharpening non-uniform weights`
- `should handle edge case of very small weights without underflow`
- `should produce weights that can trigger genre-specific thresholds`

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/StyleAnalyzer.js` | Added constants, `_sharpenDistribution()`, reduced smoothing, alpha floor |
| `backend/src/services/HarmonicEngine.js` | Lowered thresholds 0.7 → 0.35 (lines 257-267, 363-373) |
| `backend/src/services/CounterpointEngine.js` | Lowered thresholds 0.7 → 0.35 (lines 1092-1100) |
| `backend/tests/unit/test_musical_components.test.js` | Added 5 new tests for sharpening |

---

### Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Typical leader weight | 0.15-0.20 | 0.28-0.40 |
| Genre-specific activation | ~0% | ~30-40% |
| Style responsiveness | 25% influence | 50-70% influence |

**Example**: Ambient-like gestures now produce 44% ambient weight, triggering ambient-specific progressions.

---

### Version

v0.2.11

---

## Entry #173 - Free Phrase Generation for Long Drags

**Date**: 2026-01-25
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Implemented comprehensive improvements to phrase generation allowing freer, non-repeating melodies during long drags. Extended note limits from fixed 12 to progressive 16/32/48/64 based on duration, expanded melodic memory from 5 to 8+24 notes, broke PHI periodicity with multi-factor variety, and added octave traversal for extended phrases.

---

### Problem Statement

User feedback: "12 note sono troppo poche. nei drag lunghi si ripetono."

Issues identified:
1. **Backend (PhraseMorphology.js)**: Hard 12-note limit regardless of drag duration
2. **Backend (VirtualUserService/LandingCompositionService)**: Duration capped at 300-3000ms
3. **Frontend (DragStreamingHandler.js)**:
   - Melodic memory only 5 notes → 5-6 note cycling
   - Interval range limited to 1-4 semitones
   - PHI + modulo created quasi-periodic patterns

---

### Solution

#### 1. Backend: Progressive Note Limits (PhraseMorphology.js)

**quantizeGestureDuration()**: Extended max from 16 to 32 beats

**calculatePhraseLengthFromDuration()**: Progressive limits based on duration:
```javascript
const maxNotesForDuration = (beats) => {
  if (beats <= 4) return 16    // Short phrases
  if (beats <= 8) return 32    // Medium phrases
  if (beats <= 16) return 48   // Long phrases
  return 64                     // Very long phrases
}
```

#### 2. Backend: Extended Virtual User Duration

**VirtualUserService.js** and **LandingCompositionService.js**:
```javascript
// Before: 300-3000ms
const phraseDurationMs = 300 + (density * 2700)

// After: 300-6000ms (~12 beats at 120 BPM)
const phraseDurationMs = 300 + (density * 5700)
```

#### 3. Frontend: Two-Tier Melodic Memory (DragStreamingHandler.js)

```javascript
this.melodicMemory = {
  lastNotes: [],         // Short-term: 8 notes (was 5)
  extendedHistory: [],   // Long-term: 24 notes (NEW)
  currentDirection: 0,
  phrasePosition: 0,
  phaseAccumulator: 0    // NEW: Breaks PHI periodicity
}
```

#### 4. Frontend: Multi-Factor Variety Calculation

Replaced simple PHI formula with uncorrelated multi-factor approach:
```javascript
const varietyFactor = (
  (noteIndex * PHI) % 1 * 0.25 +           // PHI sequence
  (noteIndex * PHI_SQ) % 1 * 0.2 +         // PHI² (uncorrelated)
  (shortSum * 0.15 + longSum * 0.05) % 1 + // History influence
  (directionChanges * 0.7) % 1 * 0.15 +    // Direction variety
  (x * 2.3) % 1 * 0.1 +                    // Position influence
  (phaseOffset / 7) * 0.15                 // Phase offset (prime modulo)
) % 1
```

#### 5. Frontend: Expanded Interval Ranges

| Velocity | Before | After |
|----------|--------|-------|
| Fast (>0.7) | 1-4 | 1-7 |
| Medium (0.4-0.7) | 1-4 | 1-5 |
| Slow (<0.4) | 1-4 | 1-6 |

#### 6. Frontend: Octave Traversal for Extended Phrases

New `calculateOctaveTraversal()` method:
- Only activates after 12+ notes
- Y position biases direction (top = up, bottom = down)
- PHI-based phase with decreasing threshold (0.85 → 0.55 over 100 notes)
- Returns octave offset (-1, 0, +1)

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/PhraseMorphology.js` | Progressive note limits (16/32/48/64), duration cap 32 beats |
| `backend/src/services/VirtualUserService.js` | Duration range 300-16000ms (Entry #173 fix) |
| `backend/src/services/LandingCompositionService.js` | Duration range 300-16000ms (2 locations, Entry #173 fix) |
| `frontend/src/handlers/DragStreamingHandler.js` | Two-tier memory, multi-factor variety, expanded intervals, octave traversal |

---

### Architecture

```
                    PhraseMorphology.js (progressive limits)
                              ↑
           ┌──────────────────┼──────────────────┐
           │                  │                  │
   GestureToMusicService  VirtualUserService  LandingCompositionService
   (real users in rooms)  (virtual in rooms)  (virtual in index)
           │                  │                  │
           │           300-16000ms         300-16000ms
           │           (32 beats max)      (32 beats max)
           ↓                  ↓                  ↓
      PhraseMorphology.generatePhrase() → limits 16/32/48/64

Frontend (local audio):
  DragStreamingHandler → 8+24 memory → multi-factor variety → octave traversal
```

---

### Parameter Summary

| Parameter | Before | After |
|-----------|--------|-------|
| Max notes (≤4 beats) | 12 | 16 |
| Max notes (4-8 beats) | 12 | 32 |
| Max notes (8-16 beats) | 12 | 48 |
| Max notes (>16 beats) | 12 | 64 |
| Max phrase duration | 16 beats | 32 beats |
| Virtual user duration | 300-3000ms | 300-16000ms (~32 beats) |
| Short-term memory | 5 notes | 8 notes |
| Long-term memory | N/A | 24 notes |
| Fast intervals | 1-4 | 1-7 |
| Medium intervals | 1-4 | 1-5 |
| Slow intervals | 1-4 | 1-6 |

---

### Code Review Fixes (Entry #173 Addendum)

Code review identified 7 issues, all fixed:

**Critical:**
1. **Octave shift rate limiting** - Added `lastOctaveShift` tracking and MIN_NOTES_BETWEEN (6) to prevent consecutive shifts. Reduced THRESHOLD_DECAY from 0.3 to 0.15 (final threshold 0.70 instead of 0.55).

2. **Absolute note count ceiling** - Added ABSOLUTE_MAX_NOTES = 64 constant in PhraseMorphology.js as constitutional limit.

**High Priority:**
3. **Duration consistency** - Extended virtual user duration from 300-6000ms to 300-16000ms to match PhraseMorphology's 32-beat max.

4. **Memory array optimization** - Changed from O(n) `shift()` to O(1) `slice(-N)` operations.

5. **Magic numbers extraction** - Added MELODIC_CONFIG constant with all configuration:
```javascript
const MELODIC_CONFIG = {
  SHORT_MEMORY_SIZE: 8,
  LONG_MEMORY_SIZE: 24,
  INTERVAL_RANGES: { FAST: 7, MEDIUM: 5, SLOW: 6 },
  OCTAVE_TRAVERSAL: { START_THRESHOLD: 12, MIN_NOTES_BETWEEN: 6, ... },
  VELOCITY_THRESHOLDS: { FAST: 0.7, MEDIUM: 0.4 }
}
```

**Medium Priority:**
6. **Reset phaseAccumulator** - Updated `resetMelodicMemory()` to reset all fields including `extendedHistory`, `phaseAccumulator`, `lastOctaveShift`.

7. **Variable naming** - Renamed `idealNoteCount` to `theoreticalNoteCount` in PhraseMorphology.js.

---

### Version

v0.2.12

---

## Entry #174 - Virtual User Gesture Duration Variety

**Date**: 2026-01-25
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Implemented PHI-based duration category cycling for virtual users to ensure balanced variety in gesture types. Virtual users now generate a balanced mix of taps (20%), short phrases (30%), medium phrases (30%), and long phrases (20%) instead of almost exclusively long phrases.

---

### Problem Statement

After Entry #173 extended virtual user durations to 300-16000ms, virtual users generated almost exclusively long phrases:

1. **Linear duration formula** - `300 + (density * 15700)` mapped density directly to duration
   - Even moderate density (0.3) produced 5010ms phrases
   - No mechanism for variety within same activity level

2. **Tap classification rarely triggered** - `stability > density` comparison used correlated metrics
   - Both metrics derived from similar web metrics, often correlated
   - Stability rarely exceeded density

3. **No forced rotation** between gesture types

---

### Solution: PHI-Based Duration Category Cycling

Replaced linear duration mapping with a category system that cycles through tap/short/medium/long using PHI-based stepping (deterministic, non-random).

#### New `_selectDurationCategory()` Method

```javascript
_selectDurationCategory(source) {
  const gestureCount = this.gestureCounters[source] || 0
  const sourceOffset = source === 'wikipedia' ? 0.17
                     : source === 'hackernews' ? 0.53
                     : 0.89

  const selector = ((gestureCount * PHI) + sourceOffset) % 1

  if (selector < 0.20) return { category: 'tap', durationRange: { min: 50, max: 300 } }
  if (selector < 0.50) return { category: 'short', durationRange: { min: 300, max: 1500 } }
  if (selector < 0.80) return { category: 'medium', durationRange: { min: 1500, max: 5000 } }
  return { category: 'long', durationRange: { min: 5000, max: 16000 } }
}
```

#### Duration Within Category Range

Density still modulates duration WITHIN each category for musical coherence:

```javascript
const { min: rangeMin, max: rangeMax } = durationRange
const phraseDurationMs = rangeMin + (density * (rangeMax - rangeMin))
```

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/VirtualUserService.js` | Added `_selectDurationCategory()`, updated gesture generation to use categories, modified `_emitDragGesture()` to accept durationRange |
| `backend/src/services/LandingCompositionService.js` | Same changes for landing page virtual users |

---

### Expected Distribution

| Category | Duration Range | Frequency | Musical Result |
|----------|---------------|-----------|----------------|
| Tap | 50-300ms | ~20% | Single sustained note |
| Short | 300-1500ms | ~30% | 2-4 note motif |
| Medium | 1500-5000ms | ~30% | 6-12 note phrase |
| Long | 5000-16000ms | ~20% | Extended melodic line |

---

### Design Rationale

**Why PHI-based cycling?**
- PHI stepping creates a low-discrepancy sequence that maximally spreads consecutive values across [0,1]
- Guarantees all categories get triggered without predictable patterns
- Deterministic (reproducible) unlike Math.random()
- Already used throughout the codebase for position distribution

**Why source-specific offsets?**
- Uses irrational fractions (0.17, 0.53, 0.89) to prevent synchronization between sources
- Different sources generate different category sequences
- Ensures musical variety when multiple sources are active

**Why density still modulates within categories?**
- Preserves musical coherence: higher activity = slightly longer phrases within a category
- Maintains the existing relationship between web metrics and musical output
- Provides micro-variation even within category boundaries

---

### Version

v0.2.13

---

## Entry #174 Addendum - Reduce Virtual User Prolixity

**Date**: 2026-01-25
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

After Entry #174, virtual users were generating beautiful but excessively prolific output. This addendum reduces gesture frequency and shifts category distribution to favor shorter phrases.

---

### Problem Statement

User feedback: "virtual users fanno cose bellissime, ma sono diventati eccessivamente prolissi"

Issues identified:
1. **Too frequent gestures** - 10-16 beats between gestures was too dense
2. **Too many long phrases** - 20% long phrases was too common
3. **High density filter pass rate** - 65-70% let too many gestures through

---

### Solution

#### 1. Increased Gesture Interval

```javascript
// Before: 10-16 beats (4-15 seconds)
const beatsPerComposition = 16 - (avgActivity * 6)
const clampedInterval = Math.max(4000, Math.min(15000, interval))

// After: 16-24 beats (8-20 seconds)
const beatsPerComposition = 24 - (avgActivity * 8)
const clampedInterval = Math.max(8000, Math.min(20000, interval))
```

#### 2. Reduced Density Filter Pass Rate

```javascript
// Before: 65-70% pass rate
baseDensityMultiplier: 0.65
maxDensity: 0.70

// After: 45-55% pass rate
baseDensityMultiplier: 0.45
maxDensity: 0.55
```

#### 3. Rebalanced Category Distribution

| Category | Before | After | Duration Range |
|----------|--------|-------|----------------|
| Tap | 20% | 25% | 50-300ms |
| Short | 30% | 40% | 300-1500ms |
| Medium | 30% | 25% | 1500-5000ms |
| Long | 20% | 10% | 5000-16000ms |

Long phrases are now rare (10%), short phrases most common (40%).

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/VirtualUserService.js` | Updated gestureConfig, beatsPerComposition, _selectDurationCategory boundaries |
| `backend/src/services/LandingCompositionService.js` | Same changes |
| `backend/tests/unit/VirtualUserService.test.js` | Updated test expectations for new distribution |

---

### Expected Behavior

| Parameter | Before | After |
|-----------|--------|-------|
| Gesture interval | 4-15 seconds | 8-20 seconds |
| Density filter pass rate | 65-70% | 45-55% |
| Long phrase frequency | 20% | 10% |
| Short phrase frequency | 30% | 40% |

Virtual users should now be more contemplative, with longer pauses between gestures and shorter, more punctual phrases.

---

### Version

v0.2.14

---
