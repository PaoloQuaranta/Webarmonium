# Root Cause Analysis - Audio Issues

**Date**: 2025-11-07
**Session**: Sprint 6 - Post-refactoring audio debugging
**Test Results**: User tested locally, found multiple audio issues persist after Phase 1-3 fixes

---

## Executive Summary

The 3-phase fix (commit bf90ede) **did not resolve** the reported audio issues. Deep investigation revealed fundamental architecture problems:

1. **Event Name Mismatch**: Frontend and backend use incompatible event names
2. **Unused Code Path**: Main.js has a `gesture-processed` listener that never fires
3. **Oversimplified Logic**: Local phrases don't use gesture characteristics (velocity, duration, position)
4. **Compositional Architecture Not Integrated**: Backend engines exist but aren't connected to audio generation

---

## Issue 1: Remote Tap Mute ❌

### User Report
"tap remoto non funziona"

### Root Cause
**EVENT NAME MISMATCH** between backend and frontend:

#### Backend (socketHandlers.js:409)
```javascript
socket.to(socket.roomId).emit('musical:event', musicalEventBroadcast)
```
Emits: **`musical:event`** (with colon)

#### SocketService.js:190-192
```javascript
this.socket.on('musical:event', (data) => {
  console.log('🎵 SocketService received musical:event:', data)
  this.emit('musical:event', data)  // Re-emits with colon
})
```
Receives correctly, re-emits: **`musical:event`** (with colon)

#### main.js:455
```javascript
this.socketService.on('musical-event', (musicalEvent) => {
  // This NEVER fires because event name has dash, not colon!
  if (this.isAudioStarted && musicalEvent) {
    console.log('🎵 Playing musical event:', musicalEvent)
    this.audioService.playMusicalEvent(musicalEvent)
  }
})
```
Listens for: **`musical-event`** (with **dash**, not colon) → **NEVER FIRES**

#### Additional Problem: Unused Listener
main.js:343-424 has a `gesture-processed` listener that:
- Is NEVER emitted by backend (backend uses `musical:event` instead)
- Has explicit hover filter: `response.gesture?.action !== 'hover'`
- Duplicates logic that should be in the `musical:event` handler

### Impact
- Remote tap events are emitted by backend
- SocketService receives them correctly
- main.js NEVER processes them due to event name mismatch
- User hears nothing for remote taps

---

## Issue 2: Remote Hover Mute ❌

### User Report
"hover remoto non funziona"

### Root Cause
**TWO PROBLEMS**:

#### Problem 2A: Event Flow Works But Maybe LFOManager Not Connected
Backend correctly emits `hover-update` events:
- socketHandlers.js:693: Broadcasts from cursor-move
- main.js:427-452: Receives and calls `audioService.handleHoverModulation()`
- AudioService.js:3298: Re-enabled in Phase 1 fix

**BUT**: LFOManager might not be properly instantiated or connected

#### Problem 2B: gesture-processed Filter
The unused `gesture-processed` listener (main.js:345) explicitly filters out hover:
```javascript
if (this.isAudioStarted && response.sonicParams && response.gesture?.action !== 'hover') {
  // Hover events EXPLICITLY EXCLUDED
}
```

This suggests hover was intentionally separated from gesture processing, but the separation might be incomplete.

### Impact
- Backend sends hover-update correctly
- Frontend receives it
- But modulation might not be audible due to LFOManager not being active

---

## Issue 3: Remote Drag Fast Cluster ❌

### User Report
"drag remoto genera strum/grappolo di note"

### Root Cause
**SAME EVENT NAME MISMATCH** as Issue 1

#### How It Should Work
1. User A drags → frontend sends gesture to backend
2. Backend processes → emits `musical:event` with action='drag'
3. User B's frontend should receive and play articulated phrase

#### What Actually Happens
1. Backend emits `musical:event` correctly
2. SocketService receives it as `musical:event`
3. main.js listens for `musical-event` (dash) → MISMATCH
4. Event never processed by main.js listener

#### But Wait - There's Another Code Path!
main.js:343-424 has the unused `gesture-processed` listener that handles drag:
```javascript
if (action === 'drag') {
  console.log('🎵 REMOTE DRAG - articulated phrase')
  const velocity = response.gesture?.velocity || 100
  const noteCount = Math.max(2, Math.min(5, Math.floor(velocity / 25)))
  // ...generates phrase
}
```

This code path:
- Is NEVER executed (wrong event name)
- Uses velocity but doesn't validate it
- Would likely work if event name was fixed

### Impact
- Remote drag events never processed
- Users might see console errors or silent failures
- No audio feedback for remote drags

---

## Issue 4: Local Phrases All Identical ❌

### User Report
"le frasi locali sono tutte simili tra loro. dovrebbero variare articolazione ritmica, velocità e tessitura in base a velocità, durata e posizione del mouse durante il drag"

### Root Cause
**OVERSIMPLIFIED PHRASE GENERATION** in GestureProcessor.js

#### Current Logic (processDragGesture, lines 200-228)
```javascript
const noteCount = Math.max(2, Math.min(5, Math.floor(safeVelocity / 25))) // 2-5 notes

for (let i = 0; i < noteCount; i++) {
  const delay = i * 180 + Math.random() * 60 // FIXED 180ms spacing + small random

  setTimeout(() => {
    const noteFreq = baseFreq + (Math.random() - 0.5) * 200 // FIXED ±100Hz variation
    const tier = i % 2 === 0 ? 'local' : 'remote' // Simple alternation
    const noteDuration = 0.15 + Math.random() * 0.25 // FIXED 150-400ms

    // Direct synth access - no articulation, no gesture-based variation
    this.audioService.gestureSynth.triggerAttackRelease(
      noteFreq,
      noteDuration,
      Tone.now() + 0.01,
      0.3 + Math.random() * 0.4 // FIXED velocity range
    )
  }, delay)
}
```

#### Problems
1. **Rhythm**: Always 180ms ± 30ms (random), ignores gesture duration
2. **Pitch**: Always ±100Hz random variation, ignores gesture velocity/shape
3. **Duration**: Always 150-400ms random, ignores gesture speed
4. **Articulation**: None - all notes sound the same
5. **Velocity**: Random 0.3-0.7, ignores gesture intensity

#### Better Code Exists But Not Used!
GestureProcessor.js:296-359 has `createLocalPhrase()` that:
- Calculates gesture speed, length, pitch range
- Generates rhythmic variations (accent, legato, staccato)
- Varies note duration based on gesture speed
- BUT: noteCount is hardcoded to 5 (line 305)
- AND: This method is NEVER called for drag gestures!

### Impact
- All local drag phrases sound nearly identical
- User frustration - gesture nuances don't affect music
- Violates design spec: "algorithmic music generation" should be gesture-responsive

---

## Issue 5: Background Composition Static 🔴

### User Report
"composizione background è sempre uguale, genera solo accordi con ritmo lento e costante. dovrebbe generare struttura musicale complessa che si evolve a partire dalle frasi e tap generati dagli users"

### Root Cause
**COMPOSITIONAL ARCHITECTURE NOT INTEGRATED**

#### What Exists (from commit a3c12b9)

**Backend Engines** (in backend/src/services/):
1. CompositionEngine.js - High-level musical structure
2. CounterpointEngine.js - Voice leading and harmony
3. HarmonicEngine.js - Chord progressions
4. MaterialLibrary.js - Musical motif storage
5. PhraseMorphology.js - Phrase transformation
6. StyleAnalyzer.js - User gesture pattern analysis

**Frontend Components** (in frontend/src/services/):
1. MusicalScheduler.js - Tone.js Transport integration
2. LFOManager.js - Modulation management

#### What's Not Connected

**Phase 2 Fix** (commit bf90ede) loaded MusicalScheduler and LFOManager scripts, BUT:

1. **AudioService.js** doesn't instantiate them:
   ```javascript
   // No lines like:
   // this.musicalScheduler = new MusicalScheduler()
   // this.lfoManager = new LFOManager()
   ```

2. **Backend engines** aren't called during gesture processing:
   - socketHandlers.js processes gestures
   - Calls GestureProcessor → SoundPatternGenerator
   - SoundPatternGenerator uses simple algorithms
   - CompositionEngine, CounterpointEngine, etc. NEVER CALLED

3. **EnvironmentalMemoryCoordinator** exists but:
   - Stores gesture patterns
   - Doesn't feed them to compositional engines
   - Background music generation is disconnected

#### Current Background Music System
Looking for where background music is generated:

**AudioService.js** has `playBackgroundTier()` but it's likely simple:
- Probably just plays chords or drones
- Doesn't evolve based on user gestures
- Not connected to compositional engines

### Impact
- Background music is static and boring
- Rich compositional architecture (8 files!) sits unused
- User gestures don't influence ambient sound evolution
- Violates core design vision: "environmental memory for pattern learning"

---

## Fix Strategy

### Phase 4: Fix Event Name Mismatch (CRITICAL)
**Files**: frontend/src/main.js
**Change**: Update listener from `musical-event` to `musical:event`
**Impact**: Fixes Issues 1 & 3 (remote tap, remote drag)

### Phase 5: Remove Unused gesture-processed Listener
**Files**: frontend/src/main.js
**Change**: Delete lines 343-424 (unused listener with wrong event)
**Impact**: Code cleanup, reduces confusion

### Phase 6: Enhanced Local Phrase Generation
**Files**: frontend/src/services/GestureProcessor.js
**Changes**:
1. Make `processDragGesture` use gesture parameters:
   - Rhythm from gesture duration
   - Pitch range from gesture velocity
   - Note articulation from gesture shape
2. OR: Replace with call to `createLocalPhrase()` (but fix hardcoded noteCount)

**Impact**: Fixes Issue 4 (local phrases all identical)

### Phase 7: Debug Remote Drag Velocity
**Files**: backend/src/api/socketHandlers.js, backend/src/services/GestureProcessor.js
**Changes**:
1. Add logging to see what velocity backend sends
2. Verify frontend receives correct velocity
3. Adjust velocity scaling if needed

**Impact**: Final fix for Issue 3

### Phase 8: Integrate Compositional Architecture (MAJOR)
**Files**: Multiple
**Changes**:
1. **AudioService.js**: Instantiate MusicalScheduler and LFOManager
2. **socketHandlers.js**: Call compositional engines during gesture processing
3. **EnvironmentalMemoryCoordinator**: Feed patterns to CompositionEngine
4. **CompositionEngine**: Generate evolving background structure
5. **AudioService.js**: Replace simple background with compositional output

**Impact**: Fixes Issue 5 (background composition static)

---

## Testing Plan

After each phase:
1. Start backend and frontend servers
2. Test with multiple browser windows (multi-user)
3. Verify console logs show expected events
4. Confirm audio output matches expectations

### Specific Tests

**Phase 4 Test** (Event mismatch fix):
- Open 2 browser windows
- Window 1: Tap → Window 2 should hear it
- Window 1: Drag → Window 2 should hear phrase

**Phase 6 Test** (Local phrase enhancement):
- Single window
- Slow drag → longer notes, slower rhythm
- Fast drag → shorter notes, faster rhythm
- Different Y positions → different pitch ranges

**Phase 8 Test** (Compositional integration):
- Multiple windows, multiple users making gestures
- Background music should evolve over time
- Patterns from user gestures should be incorporated
- Complexity should increase with more user input

---

## Priority Order

### IMMEDIATE (Blocks all testing)
- ✅ Phase 4: Fix event name mismatch

### HIGH (Core functionality broken)
- ✅ Phase 5: Remove unused code
- ✅ Phase 6: Fix local phrase generation
- ✅ Phase 7: Debug remote drag velocity

### MEDIUM (Enhancement, not blocking)
- ⏳ Phase 8: Integrate compositional architecture (large task)

---

## Notes

### Why Did Phase 1-3 Fixes Not Work?

**Phase 1** (Re-enable hover):
- ✅ Correctly removed early return
- ❌ But didn't verify LFOManager is instantiated
- Result: Code executes but no audible effect

**Phase 2** (Load scripts):
- ✅ Correctly added script tags
- ❌ But didn't instantiate classes in AudioService
- Result: Classes available but not used

**Phase 3** (Fix remote tap):
- ✅ Correct logic for direct synth access
- ❌ But code is in unused gesture-processed listener
- Result: Code never executes due to event name mismatch

### Lesson Learned
Always verify the **full event flow** from backend emit → frontend listener → actual code execution. Script loading and code fixes are useless if events don't reach the handler.

---

**Analysis Complete**
Ready for Phase 4-8 implementation.
