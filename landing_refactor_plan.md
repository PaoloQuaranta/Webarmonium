# Landing Page Refactoring Plan
## Align with Normal Room Architecture

**Date:** 2026-01-02
**Status:** Planning
**Estimated Effort:** 4-6 hours

---

## Executive Summary

The landing page currently implements parallel systems for gesture handling and filter modulation instead of reusing existing architecture. This refactoring will eliminate ~150 lines of duplicated code and ensure absolute coherence between landing page and normal room behavior.

**Key Principle:** Landing page should be a "thin skin" that converts web metrics → virtual gestures, then passes them through EXISTING services (GestureToMusicService, HoverOrchestrator, PhraseMorphology).

---

## Critical Issues to Fix

### Issue 1: Manual Socket Emissions vs GestureToMusicService
**Severity:** CRITICAL - Constitutional Violation (No Duplication)
**Impact:** Lost harmonic coherence, inconsistent musical behavior
**Lines to Remove:** `LandingCompositionService.js:712-837` (~125 lines)

### Issue 2: Manual Filter Modulation vs HoverOrchestrator
**Severity:** CRITICAL - Architectural Inconsistency
**Impact:** Lost multi-user coherence, no 4-LFO system
**Lines to Remove:** `frontend/src/landing/main.js:293-299` (~7 lines)

### Issue 3: Artificial Tap/Drag Classification
**Severity:** CRITICAL - Metric-to-Music Correspondence Violation
**Impact:** Thresholds discard data, synthetic gesture types
**Lines to Modify:** `LandingCompositionService.js:303-358`

---

## Refactoring Tasks

### Task 1: Replace emitVirtualGestureNotes() with GestureToMusicService

**File:** `backend/src/services/LandingCompositionService.js`

**Current Code (Lines 712-837) - TO BE REMOVED:**
```javascript
async emitVirtualGestureNotes(gesture) {
  // 125+ lines of manual hold:start/hold:end emission
  // This duplicates GestureToMusicService functionality
}
```

**New Implementation:**

```javascript
/**
 * Emit virtual gesture notes using GestureToMusicService
 * Uses EXISTING architecture - no duplication
 * @param {Object} gesture - Virtual gesture data
 * @private
 */
async emitVirtualGestureNotes(gesture) {
  if (!this.gestureToMusicService) {
    console.warn('⚠️ GestureToMusicService not available - skipping gesture emission')
    return
  }

  const user = this.virtualUsers[gesture.source]
  const cursor = this.targetPositions[gesture.source]

  // Construct gestureData in NORMAL ROOM FORMAT
  // See: backend/src/api/handlers/GestureHandler.js:96-120
  const gestureData = {
    userId: user.userId,
    roomId: this.landingRoomId,
    gesture: {
      action: gesture.type,  // 'tap' or 'drag' (will be unified to 'drag')
      type: gesture.type,
      coordinates: {
        x: cursor.x,
        y: cursor.y
      },
      position: {
        x: cursor.x,
        y: cursor.y
      },
      intensity: gesture.velocity || 0.5,
      velocity: Math.abs(gesture.velocity || 0) * 100,  // Scale to 0-100 range
      acceleration: gesture.acceleration || 0,
      curvature: 0.5,  // Default for virtual gestures
      duration: gesture.duration || 1000,
      speed: Math.abs(gesture.velocity || 0) / 10,
      direction: gesture.acceleration > 0 ? 'up' : 'down'
    }
  }

  console.log(`🎵 Processing ${gesture.type} from ${gesture.source} through GestureToMusicService`)

  // Call GestureToMusicService - EXISTING ARCHITECTURE
  const musicalResult = this.gestureToMusicService.processGesture(gestureData)

  // Broadcast musical events to landing room
  // See: backend/src/api/handlers/GestureHandler.js:212-237
  const musicalEvents = Array.isArray(musicalResult)
    ? musicalResult.filter(e => e != null)
    : (musicalResult ? [musicalResult] : [])

  musicalEvents.forEach((musicalEvent) => {
    const eventType = musicalEvent.eventType || 'musical'

    const musicalEventBroadcast = {
      id: musicalEvent.id,
      userId: user.userId,
      roomId: this.landingRoomId,
      event: musicalEvent.toJSON ? musicalEvent.toJSON() : musicalEvent,
      timestamp: Date.now()
    }

    // Broadcast to landing room
    this.io.to(this.landingRoomId).emit('musical:event', musicalEventBroadcast)
  })

  console.log(`🎵 Emitted ${musicalEvents.length} musical events for ${gesture.source}`)
}
```

**Changes Required:**
1. Remove entire `emitVirtualGestureNotes()` method (lines 712-837)
2. Replace with new implementation above
3. Update `generateVirtualTap()` and `generateVirtualDrag()` to return proper gesture structure
4. Ensure `GestureToMusicService` is injected via ServiceContainer

---

### Task 2: Remove Manual Filter Modulation, Integrate HoverOrchestrator

**File:** `frontend/src/landing/main.js`

**Current Code (Lines 293-299) - TO BE REMOVED:**
```javascript
// ALWAYS modulate filter based on cursor position
// Filter adds richness on top of virtual notes (not blocking them)
if (this.audioService?.gestureFilter) {
  const filterFreq = 200 + (x * 7800) // 200Hz - 8000Hz
  const filterQ = 0.5 + (y * 3) // 0.5 - 3.5
  this.audioService.gestureFilter.frequency.set({ value: filterFreq })
  this.audioService.gestureFilter.Q.set({ value: filterQ })
}
```

**New Implementation:**

**Step 2A: Emit hover-update events from frontend**

Add method to `LandingApp` class:

```javascript
/**
 * Emit virtual hover events to backend for HoverOrchestrator processing
 * Sends hover events for all virtual cursors
 * @private
 */
_emitVirtualHoverEvents() {
  if (!this.socket || !this.socket.connected) return

  for (const [source, cursor] of Object.entries(this.currentCursors)) {
    const userId = cursor.userId || `${source}-metrics`

    // Calculate velocity from cursor movement
    const prevCursor = this.previousCursors?.[source]
    let velocity = 50  // Default velocity
    let intensity = 0.5  // Default intensity

    if (prevCursor) {
      const dx = cursor.x - prevCursor.x
      const dy = cursor.y - prevCursor.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      velocity = Math.min(distance * 1000, 100)  // Scale to 0-100
      intensity = Math.min(distance, 1.0)
    }

    // Emit hover-update event (NORMAL ROOM FORMAT)
    // See: frontend/src/services/gesture/HoverProcessor.js:169-184
    this.socket.emit('hover-update', {
      userId: userId,
      roomId: 'landing-room',
      position: {
        x: cursor.x,
        y: cursor.y
      },
      velocity: velocity,
      intensity: intensity,
      timestamp: Date.now()
    })
  }
}
```

**Step 2B: Call from _updateVisualCursors()**

Modify `_updateVisualCursors()` method:

```javascript
_updateVisualCursors() {
  if (!this.visualService) return

  for (const [source, cursor] of Object.entries(this.currentCursors)) {
    const userId = cursor.userId || `${source}-metrics`
    const x = cursor.x
    const y = cursor.y
    const color = cursor.color

    // Update cursor position
    this.visualService.updateCursorPosition(userId, x, y, color)

    // Trigger effects on cursor movement
    if (this.isRunning) {
      // Emit particles based on movement distance
      const prevCursor = this.previousCursors?.[source]
      let movementDistance = 0

      if (prevCursor) {
        const dx = x - prevCursor.x
        const dy = y - prevCursor.y
        movementDistance = Math.sqrt(dx * dx + dy * dy)
      }

      if (movementDistance > 0.005 && this.visualService.particles) {
        const particleCount = Math.min(Math.round(movementDistance * 100), 8)
        this.visualService.particles.emitParticles(userId, Math.max(particleCount, 1))
      }

      // Trigger pulse on larger movements
      if (movementDistance > 0.02 && this.visualService.wavePackets) {
        this.visualService.wavePackets.emitPulse(userId, color)
      }
    }
  }

  // EMIT VIRTUAL HOVER EVENTS for HoverOrchestrator
  this._emitVirtualHoverEvents()

  // Store current cursors for next comparison
  this.previousCursors = { ...this.currentCursors }
}
```

**Step 2C: Listen for unified-modulation events**

Add to `_setupSocketConnection()` method:

```javascript
// Listen for unified modulation from HoverOrchestrator
this.socket.on('unified-modulation', (modulationData) => {
  if (!this.isRunning) return

  console.log('🎵 Received unified modulation:', modulationData.modulation)

  // Apply modulation to AudioService
  // See: frontend/src/handlers/SocketEventCoordinator.js:238-242
  if (this.audioService && this.audioService.applyUnifiedModulation) {
    this.audioService.applyUnifiedModulation(modulationData)
  }
})
```

**Changes Required:**
1. Remove manual filter modulation (lines 293-299)
2. Add `_emitVirtualHoverEvents()` method
3. Modify `_updateVisualCursors()` to call `_emitVirtualHoverEvents()`
4. Add `unified-modulation` event listener

---

### Task 3: Unify Gesture Type - Remove Artificial Tap/Drag Classification

**File:** `backend/src/services/LandingCompositionService.js`

**Current Code (Lines 303-358) - TO BE SIMPLIFIED:**

Uses velocity threshold to classify tap vs drag, creating artificial distinction.

**New Implementation:**

```javascript
/**
 * Generate metric-driven virtual gestures
 * ALL gestures use drag-style streaming (no artificial tap/drag split)
 * This preserves metric-to-music correspondence without thresholds
 * @returns {Array} Array of virtual gestures (always 1 gesture)
 * @private
 */
generateMetricDrivenGestures() {
  const gestures = []

  // Select source with HIGHEST combined score (activity + normalized velocity)
  const sources = Object.keys(this.virtualUsers)

  let highestScore = -1
  let selectedSource = sources[0]

  for (const source of sources) {
    const activity = this.calculateActivityLevel(source)

    // Get velocity and normalize relative to each source's baseline
    const velocity = this.webMetricsPoller?.getVelocity(source) || 0
    let referencePoint = 0
    switch (source) {
      case 'wikipedia': referencePoint = 400; break
      case 'hackernews': referencePoint = 60; break
      case 'github': referencePoint = 5; break
    }

    // Normalize velocity as percentage of reference
    const normalizedVelocity = Math.abs(velocity) / referencePoint

    // Combined score: activity (70%) + normalized velocity (30%)
    const score = (activity * 0.7) + (normalizedVelocity * 0.3)

    console.log(`🎵 ${source}: activity=${activity.toFixed(2)}, vel=${velocity.toFixed(1)}, normVel=${normalizedVelocity.toFixed(3)}, score=${score.toFixed(3)}`)

    if (score > highestScore) {
      highestScore = score
      selectedSource = source
    }
  }

  console.log(`🎵 Selected source: ${selectedSource} (score: ${highestScore.toFixed(3)})`)

  const velocity = this.webMetricsPoller?.getVelocity(selectedSource) || 0
  const acceleration = this.webMetricsPoller?.getAcceleration(selectedSource) || 0
  const metrics = this.metrics[selectedSource]

  // ALWAYS use drag-style gesture (no tap/drag split)
  // PhraseMorphology will handle note count based on gesture characteristics
  gestures.push(this.generateVirtualGesture(selectedSource, metrics, velocity, acceleration))

  return gestures
}

/**
 * Generate virtual gesture using PhraseMorphology
 * Replaces generateVirtualTap() and generateVirtualDrag()
 * @param {string} source - Source name
 * @param {Object} metrics - Current metrics
 * @param {number} velocity - Current velocity
 * @param {number} acceleration - Current acceleration
 * @returns {Object} Gesture data for GestureToMusicService
 * @private
 */
generateVirtualGesture(source, metrics, velocity, acceleration) {
  const user = this.virtualUsers[source]
  const cursor = this.targetPositions[source]
  const activity = this.calculateActivityLevel(source)

  // Map metric characteristics to gesture properties
  // Duration based on activity (inverse: higher activity = shorter duration)
  const duration = 200 + (1 - activity) * 1800  // 200-2000ms

  // Intensity based on activity
  const intensity = 0.3 + activity * 0.7  // 0.3-1.0

  // Trajectory based on acceleration
  const direction = acceleration > 0 ? 'up' : 'down'
  const angle = acceleration > 0 ? -45 : 45  // Ascending or descending

  return {
    type: 'drag',  // Always use drag (PhraseMorphology handles phrase length)
    source: source,
    frequency: 0,  // Will be calculated by GestureToMusicService
    velocity: velocity,
    acceleration: acceleration,
    duration: duration,
    intensity: intensity,
    position: cursor,
    gestureData: {
      // GestureToMusicService format
      action: 'drag',
      type: 'drag',
      coordinates: cursor,
      position: cursor,
      intensity: intensity,
      velocity: Math.abs(velocity) * 100,  // Scale to 0-100
      acceleration: acceleration,
      curvature: 0.5,
      duration: duration,
      speed: Math.abs(velocity) / 10,
      direction: direction,
      trajectory: {
        angle: angle,
        direction: direction
      }
    }
  }
}
```

**Changes Required:**
1. Remove `generateVirtualTap()` method (lines ~335-380)
2. Remove `generateVirtualDrag()` method (lines ~382-450)
3. Replace `generateMetricDrivenGestures()` with unified implementation
4. Add new `generateVirtualGesture()` method
5. Update `emitVirtualGestureNotes()` to use unified gesture structure

---

### Task 4: Remove Unused PhraseMorphology Initialization

**File:** `backend/src/services/LandingCompositionService.js`

**Current Code (Line 28):**
```javascript
this.phraseMorphology = new PhraseMorphology()  // Initialized but never used
```

**Action:**
This is now used by `GestureToMusicService.processGesture()`, so the initialization is correct but we're not calling it directly. The service is passed through ServiceContainer.

**Verify ServiceContainer Injection:**

File: `backend/src/services/ServiceContainer.js`

```javascript
// Line ~208-211
container.register('landingCompositionService', (gestureToMusicService, backgroundCompositionService) => {
  const LandingCompositionService = require('./LandingCompositionService')
  const service = new LandingCompositionService()
  service.setGestureToMusicService(gestureToMusicService)  // ✅ This is correct
  service.setBackgroundCompositionService(backgroundCompositionService)
  return service
}, { dependencies: ['gestureToMusicService', 'backgroundCompositionService'] })
```

**No changes needed** - PhraseMorphology is injected through GestureToMusicService.

---

### Task 5: Fix Velocity Normalization

**File:** `backend/src/services/LandingCompositionService.js`

**Current Code (Lines 318-329):**
```javascript
let referencePoint = 0
switch (source) {
  case 'wikipedia': referencePoint = 400; break
  case 'hackernews': referencePoint = 60; break
  case 'github': referencePoint = 5; break
}
const normalizedVelocity = Math.abs(velocity) / referencePoint
```

**Issue:** Arbitrary reference points lose dynamic range.

**New Implementation:**

```javascript
// Use logarithmic scaling (like softNormalize already does for activity)
// This preserves relative differences without hard caps
const normalizeVelocity = (vel, ref) => {
  if (ref === 0) return 0
  return Math.log1p(Math.abs(vel)) / Math.log1p(ref)
}

let referencePoint = 0
switch (source) {
  case 'wikipedia': referencePoint = 400; break
  case 'hackernews': referencePoint = 60; break
  case 'github': referencePoint = 5; break
}

// Logarithmic normalization preserves dynamic range
const normalizedVelocity = normalizeVelocity(velocity, referencePoint)
```

**Changes Required:**
1. Add helper function or inline logarithmic normalization
2. Replace linear division with logarithmic scaling

---

### Task 6: Update Frontend musical:event Handler

**File:** `frontend/src/landing/main.js`

**Current State:** Frontend may not properly handle `musical:event` from GestureToMusicService.

**Add/Verify Handler:**

```javascript
// In _setupSocketConnection() method
this.socket.on('musical:event', (data) => {
  if (!this.isRunning) return

  const event = data.event
  if (!event) return

  console.log('🎵 Received musical event:', event.eventType, event.properties)

  // Handle note events from GestureToMusicService
  if (event.eventType === 'note' && this.audioService) {
    const { frequency, duration, velocity, pitch } = event.properties

    if (this.audioService.gestureSynth && frequency) {
      const noteDuration = duration || 1.0
      const now = window.Tone.now()

      this.audioService.gestureSynth.triggerAttackRelease(
        frequency,
        noteDuration,
        now,
        (velocity || 80) / 127  // Convert MIDI velocity to 0-1
      )

      console.log(`🎵 Played note from musical event: ${frequency.toFixed(1)}Hz - ${(noteDuration * 1000).toFixed(0)}ms`)
    }
  }

  // Handle filter modulation events
  if (event.eventType === 'filter_modulation' && this.audioService?.gestureFilter) {
    // Apply filter parameters
    if (event.properties.cutoff) {
      this.audioService.gestureFilter.frequency.value = event.properties.cutoff
    }
    if (event.properties.resonance) {
      this.audioService.gestureFilter.Q.value = event.properties.resonance
    }
  }
})
```

**Changes Required:**
1. Add `musical:event` handler if not present
2. Handle both note and filter_modulation events

---

## Testing Checklist

After implementing all tasks, verify:

### Architectural Coherence Tests
- [ ] Virtual gestures from landing page use same musical scale as normal room
- [ ] Phrase morphology generates coherent melodies
- [ ] Harmonic constraints are applied (no out-of-scale notes)

### Modulation Tests
- [ ] HoverOrchestrator receives virtual hover events
- [ ] Unified modulation is broadcast to landing room
- [ ] Filter modulation uses 4-LFO system (not manual)

### Metric-to-Music Correspondence Tests
- [ ] Higher metric activity produces more musical output
- [ ] Velocity changes affect note density/timbre
- [ ] No thresholds discard data (verify with extreme values)

### Integration Tests
- [ ] Landing page emits `hover-update` events
- [ ] Landing page receives `unified-modulation` events
- [ ] Landing page emits `musical:event` through GestureToMusicService
- [ ] Frontend handles all event types correctly

---

## File Summary

### Files to Modify

1. **backend/src/services/LandingCompositionService.js**
   - Remove: `emitVirtualGestureNotes()` (125 lines)
   - Remove: `generateVirtualTap()` (~45 lines)
   - Remove: `generateVirtualDrag()` (~70 lines)
   - Modify: `generateMetricDrivenGestures()` (~60 lines)
   - Add: `generateVirtualGesture()` (~50 lines)
   - Add: New `emitVirtualGestureNotes()` (~60 lines)
   - **Net change:** ~-240 lines eliminated

2. **frontend/src/landing/main.js**
   - Remove: Manual filter modulation (~7 lines)
   - Add: `_emitVirtualHoverEvents()` (~30 lines)
   - Modify: `_updateVisualCursors()` (~5 lines changed)
   - Add: `unified-modulation` listener (~10 lines)
   - Add/Verify: `musical:event` handler (~30 lines)
   - **Net change:** ~+60 lines added (but removes duplication)

3. **backend/src/services/ServiceContainer.js**
   - No changes needed (dependency injection already correct)

4. **frontend/index.html**
   - Update cache buster version

---

## Rollback Plan

If issues arise, rollback using:
```bash
git revert HEAD  # Revert the refactoring commit
```

Keep current implementation as backup branch:
```bash
git branch landing-page-before-refactor
```

---

## Success Criteria

1. ✅ No duplicate gesture emission code
2. ✅ HoverOrchestrator used for filter modulation
3. ✅ GestureToMusicService processes all virtual gestures
4. ✅ PhraseMorphology generates all drag phrases
5. ✅ Harmonic coherence maintained (scale constraints)
6. ✅ Metric-to-music correspondence preserved (no data loss)
7. ✅ All tests pass
8. ✅ Landing page sounds musical and coherent

---

## Next Steps After Refactoring

1. Run integration tests
2. Test landing page with real web metrics
3. Compare musical output with normal room
4. Tune velocity normalization if needed
5. Update documentation
6. Update development_log.md with Entry #11
