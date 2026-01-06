# Webarmonium Development Log

> **Note:** Older entries (1-15) have been moved to [log_archive.md](log_archive.md)

---

## Entry #16 - Attractor Visibility & Noise Resolution Fix (RESOLVED)

**Date**: 2026-01-05
**Time**: ~Current Session
**Author**: Claude Code (AI Assistant)
**Status**: RESOLVED - Attractors visible with correct shapes, noise smooth

### Problem Statement

Following Entry #15, two critical visual issues remained:

1. **Attractors not visible** - User reported seeing only a "gray bean shape" instead of the classic strange attractor shapes
2. **Perlin noise resolution too low** - User reported "noise ha una risoluzione bassissima" - blocky appearance

---

### Root Cause Analysis

#### Issue 1: Attractors Appearing as Gray Blob

**Multiple cascading issues:**

1. **Color desaturation**: `baseColor.sat` being corrupted by nebula sync
   - Fix: Forced `sat = 100` directly in render loop, bypassing calculations

2. **All points clustered together (MAIN ISSUE)**:
   - OLD: 500 points all initialized at nearly identical positions (±0.05 variation)
   - After settling, points moved together as a single "blob"
   - Result: Bean-shaped cluster instead of butterfly/spiral shape

3. **Scale too small**: `scale = 0.85` made attractor too compact
   - Fix: Increased to `scale = 2.0` for full scene coverage

#### Issue 2: Blocky Noise Texture

- `cellSize = 70` created only ~405 cells on 1920x1080 (27×15)
- Each cell was 70×70 pixels = very blocky appearance
- Fix: Reduced to `cellSize = 12` for ~14,400 cells (160×90) = smooth appearance

---

### Solution: Trajectory-Based Attractor Rendering

**Algorithm Change:**

```
BEFORE: 500 independent particles → evolve together → cluster/blob
AFTER:  1 long trajectory (24,000 points) → sample 1200 points → classic shape
```

**Implementation:**

```javascript
// 1. Compute ONE long trajectory
const trajectoryLength = this.pointCount * 20  // 24,000 points
const trajectory = []
let x = 1, y = 1, z = 20

// Let system settle onto attractor
for (let settle = 0; settle < 2000; settle++) { /* evolve */ }

// Record trajectory
for (let i = 0; i < trajectoryLength; i++) {
  trajectory.push({ x, y, z })
  // evolve differential equations
}

// 2. Sample points distributed along trajectory with sliding window
const windowSize = this.pointCount  // 1200 points visible at once
for (let f = 0; f < this.frameCount; f++) {
  const startIdx = f * stepPerFrame
  // Sample windowSize points from trajectory starting at startIdx
}
```

**Fuzzy Blur Effect:**

User requested "distribuzione più fuzzy" - achieved by adding deterministic noise offset during rendering:

```javascript
// Stable blur using sin/cos based on point index
const fuzzyX = (Math.sin(i * 0.1 + this.time * 2) + Math.cos(i * 0.17)) * this.fuzzyOffset
const fuzzyY = (Math.cos(i * 0.13 + this.time * 2) + Math.sin(i * 0.19)) * this.fuzzyOffset
const screenX = centerX + (point.x - 0.5) * displaySize + fuzzyX
const screenY = centerY + (point.y - 0.5) * displaySize + fuzzyY
```

---

### Configuration Changes

#### PrecomputedAttractorSystem.js

| Parameter | Before | After | Reason |
|-----------|--------|-------|--------|
| `pointCount` | 500 | 1200 | Denser cloud |
| `pointSize` | 3 | 1.5 | Smaller points for trajectory look |
| `glowSize` | 14 | 3 | Minimal glow |
| `scale` | 0.85 | 2.0 | Full scene coverage |
| `fuzzyOffset` | N/A | 8px | Blur effect |
| `sat` | calculated | 100 (forced) | Maximum saturation |
| `alpha` | 55-90 | 60-85 | Slightly lower for blur |

#### NoiseTextureNebulaSystem.js

| Parameter | Before | After | Reason |
|-----------|--------|-------|--------|
| `cellSize` | 70 | 12 | Smooth appearance (~14,400 cells) |
| `cellSize (degraded)` | 100 | 20 | Better quality in degraded mode |
| Palette saturation | 25-70 | 60-85 | More vivid colors |
| Palette brightness | 18-32 | 50-70 | Visible on dark background |
| Palette alpha | 25-42 | 55-75 | More visible |

---

### Files Modified

1. **`frontend/src/services/visual/PrecomputedAttractorSystem.js`** (v4 → v7)
   - Rewrote `_computeLorenzFrames()`: single trajectory approach
   - Rewrote `_computeRosslerFrames()`: single trajectory approach
   - Added `fuzzyOffset` property and fuzzy rendering logic
   - Increased `pointCount` to 1200, `scale` to 2.0
   - Reduced `pointSize` to 1.5, `glowSize` to 3
   - Forced `sat = 100` in render to bypass color corruption

2. **`frontend/src/services/visual/NoiseTextureNebulaSystem.js`** (v3 → v4)
   - Reduced `cellSize` from 70 to 12
   - Updated `setPerformanceMode()` degraded cellSize from 100 to 20
   - Updated all 5 palettes with higher saturation/brightness/alpha

3. **`frontend/index.html`**
   - Updated script version: PrecomputedAttractorSystem.js?v=7

4. **`frontend/rooms.html`**
   - Updated script version: PrecomputedAttractorSystem.js?v=7

---

### Visual Result

**Lorenz Attractor:**
- Classic "butterfly" double-lobe shape
- 1200 cyan points distributed along trajectory
- Fuzzy blur effect (±8px) for ethereal appearance
- Full scene coverage

**Rossler Attractor:**
- Classic spiral funnel shape
- Same point count and blur effect

**Nebula Background:**
- Smooth gradients (no visible cell boundaries)
- Vibrant colors visible against dark background
- Musical reactivity preserved

---

### User Feedback

"ok ora è molto bello" - Confirmation that both issues are resolved.

---

## Entry #17 - Landing Page UI Fixes: Volume, Controls, and Metric Meters

**Date**: 2026-01-05
**Time**: ~21:00 UTC
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed multiple UI issues on the landing page including non-functional sliders, redundant controls, and uninteresting metric displays. Replaced simple metric cards with engaging vertical meters showing real-time parameter variations that directly correlate with music generation.

---

### Issues Fixed

#### Issue 1: Non-functional Intensity Slider
**Problem:** Intensity slider existed in UI but did nothing (placeholder code).
**Solution:** Removed intensity slider entirely.

#### Issue 2: Volume Slider Not Working
**Problem:** Volume slider only updated UI, didn't control actual audio.
**Solution:** Connected volume slider to `AudioService.setVolume()` via `handleVolumeChange()` method.

#### Issue 3: Separate Start/Stop Buttons
**Problem:** UI had two separate buttons instead of a toggle.
**Solution:** Converted to single toggle button with state tracking (`isPlaying`).

#### Issue 4: Complexity Card Always Zero
**Problem:** "Complexity" metric card showed 0 - leftover from old architecture.
**Solution:** Removed Complexity card entirely.

#### Issue 5: Uninteresting Metric Display
**Problem:** Simple metric cards showing just "edits/min" not engaging.
**Solution:** Replaced with vertical meters (4 per source) showing all monitored parameters with flash animation on gesture triggers.

#### Issue 6: GitHub Metrics Stuck at Zero
**Problem:** PRs and Stars meters were always zero (rare events in GitHub API).
**Root Cause:** PullRequestEvent and WatchEvent are very rare in GitHub's public events stream.
**Solution:**
1. Increased `per_page` from 30 to 100 (3x more events per sample)
2. Changed to more frequent events:
   - `forksPerMinute` → `createsPerMinute` (CreateEvent ~15-20% of events)
   - `issuesPerMinute` → `deletesPerMinute` (DeleteEvent ~5-10% of events)

---

### Files Modified

**Frontend:**

1. **`frontend/index.html`**
   - Removed intensity slider and Stop button
   - Added toggle button (`btn-toggle`)
   - Moved "Join a Room" link to controls section
   - Replaced metric cards with vertical meters (4 meters per source)
   - Updated meter labels: commits, velocity, creates, deletes

2. **`frontend/src/landing/DashboardUI.js`**
   - Complete rewrite for vertical meter system
   - Added dynamic normalization ranges per metric
   - Added `updateMetrics()` method for real-time meter updates
   - Added `flashSource()` method for gesture-triggered animations
   - Added `_normalizeValue()` with special handling for velocity (negative values)
   - Added toggle button state management (`_updatePlaybackState()`)

3. **`frontend/src/landing/main.js`**
   - Added `handleVolumeChange()` method
   - Added `_extractSourceFromUserId()` helper
   - Added `flashSource()` calls in gesture handlers

4. **`frontend/src/components/AudioControls.js`**
   - Fixed initial volume not being applied on startup
   - Added `onVolumeChange(this.volume)` after render

5. **`frontend/styles.css`**
   - Added meter styles with CSS custom properties
   - Added flash animations for meter fills
   - Added source-specific colors via `--meter-color` variables

**Backend:**

1. **`backend/src/services/WebMetricsPoller.js`**
   - Changed `per_page` from 30 to 100
   - Changed tracked events:
     - `PullRequestEvent` → `CreateEvent`
     - `WatchEvent` → `DeleteEvent`
   - Updated metrics structure: `forksPerMinute` → `createsPerMinute`, `issuesPerMinute` → `deletesPerMinute`

2. **`backend/src/services/LandingCompositionService.js`**
   - Updated metrics structure to match WebMetricsPoller
   - Updated `metricStatistics` tracking for new metrics
   - Updated `calculateDensityMetric()`: uses `createsPerMinute` for GitHub
   - Updated `calculatePeriodicityMetric()`: uses `deletesPerMinute` for GitHub

---

### Metric-to-Music Mapping

All displayed metrics are used for music generation:

| Source | Metric | Musical Use |
|--------|--------|-------------|
| Wikipedia | editsPerMinute | Activity level → gesture frequency |
| Wikipedia | velocity | Gesture trigger threshold |
| Wikipedia | avgEditSize | Density metric → phrase duration |
| Wikipedia | newArticles | Periodicity metric → filter modulation |
| HackerNews | postsPerMinute | Activity level → gesture frequency |
| HackerNews | velocity | Gesture trigger threshold |
| HackerNews | avgUpvotes | Density metric → phrase duration |
| HackerNews | commentCount | Periodicity metric → filter modulation |
| GitHub | commitsPerMinute | Activity level → gesture frequency |
| GitHub | velocity | Gesture trigger threshold |
| GitHub | createsPerMinute | Density metric → phrase duration |
| GitHub | deletesPerMinute | Periodicity metric → filter modulation |

---

### GitHub Event Frequency Analysis

With 100 events per sample from GitHub's public events API:
- **PushEvent**: ~60-70 events (commits)
- **CreateEvent**: ~15-25 events (branch/tag/repo creation)
- **DeleteEvent**: ~5-15 events (branch deletion after merge)
- **WatchEvent**: ~3-8 events (stars) - too rare
- **ForkEvent**: ~2-5 events - too rare
- **PullRequestEvent**: ~2-5 events - too rare
- **IssuesEvent**: ~1-3 events - too rare

CreateEvent and DeleteEvent provide meaningful activity visualization while being frequent enough to show real-time variations.

---

### UI Layout After Changes

```
┌─────────────────────────────────────────────────────────────┐
│ ▶ Start Experience │ Volume [====----] │ Join a Room →     │
├─────────────────────────────────────────────────────────────┤
│ Wikipedia (red)    │ HackerNews (orange) │ GitHub (blue)   │
│ ┌──┬──┬──┬──┐     │ ┌──┬──┬──┬──┐      │ ┌──┬──┬──┬──┐   │
│ │▓▓│▓ │▓▓│  │     │ │▓ │▓▓│▓ │▓▓│      │ │▓▓│▓ │▓▓│▓ │   │
│ │▓▓│▓ │▓▓│  │     │ │▓ │▓▓│▓ │▓▓│      │ │▓▓│▓ │▓▓│▓ │   │
│ │▓▓│▓ │▓▓│  │     │ │▓ │▓▓│▓ │▓▓│      │ │▓▓│▓ │▓▓│▓ │   │
│ └──┴──┴──┴──┘     │ └──┴──┴──┴──┘      │ └──┴──┴──┴──┘   │
│ ed ve sz nw       │ po ve up cm        │ co ve cr de      │
└─────────────────────────────────────────────────────────────┘
```

---

### User Feedback

"molto meglio" - Confirmed meters now show activity.

---

## Entry #18 - Landing Page Audio Fixes & UI Updates

**Date**: 2026-01-05
**Time**: ~21:00 UTC
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed multiple audio issues on the landing page (invalid frequency warnings, max polyphony exceeded) and updated UI content for both landing page and normal rooms.

---

### Issues Fixed

#### Issue 1: Invalid Frequency Warnings

**Symptoms:**
```
⚠️ Invalid frequency in musical:event: Object
```

**Root Cause:**
The `musical:event` handler in `main.js` was calling `_handleVirtualTapNote()` for ALL event types, but only `tap` events have a `frequency` field. `phrase` events don't have frequency - they're just visual triggers for nebulas and attractors.

**Fix Applied** (`frontend/src/landing/main.js:276-294`):
```javascript
// CRITICAL: Only handle 'tap' events in _handleVirtualTapNote
// 'phrase' events don't have frequency - they're just visual triggers
if (data.type === 'tap') {
  this._handleVirtualTapNote(data)
}

// Forward ALL musical events to visual service for nebulas and attractors
if (this.visualService && this.visualService.onMusicalEvent) {
  this.visualService.onMusicalEvent({...})
}
```

---

#### Issue 2: Max Polyphony Exceeded (Audio Stuttering)

**Symptoms:**
```
Debug.ts:62 Max polyphony exceeded. Note dropped.
```
Audio was choppy/stuttering due to dropped notes.

**Root Cause:**
The `releaseAll()` calls in `playLayer()` were starting the envelope release phase, but with the pad's 4-second release time, voices remained "in use" and couldn't be reused for new notes. Tone.js PolySynth counts voices as "in use" during the entire release envelope.

**Fix Applied** (`frontend/src/services/AudioService.js:1021-1065`):
```javascript
// BEFORE: synth.releaseAll()  // Starts 4-second release, voice still "in use"

// AFTER: Explicit short release times to immediately free voices
// Bass:
synth.releaseAll(0.05)  // 50ms release

// Pad:
synth.releaseAll(0.1)   // 100ms release (slightly longer for smooth transition)

// Chords:
synth.releaseAll(0.05)  // 50ms release
```

---

#### Issue 3: Background Music Volume Too Low

**Symptoms:**
User reported background music was too quiet compared to gesture sounds.

**Fix Applied** (`frontend/src/services/AudioService.js:707-715`):

| Layer | Before | After | Change |
|-------|--------|-------|--------|
| bass | -5dB | 0dB | +5dB |
| pad | -8dB | -3dB | +5dB |
| chords | -20dB | -12dB | +8dB |
| backgroundHigh | -3dB | +3dB | +6dB |
| backgroundMid | -3dB | +3dB | +6dB |
| backgroundLow | -3dB | +3dB | +6dB |

---

### UI Updates

#### Landing Page: "How It Works" Section Rewritten

**Problem:** Previous content was inaccurate and didn't explain the actual system architecture.

**Solution:** Replaced with technical but accessible content explaining:
1. Data sources and polling intervals (Wikipedia 5s, HackerNews 10s, GitHub 60s)
2. Dynamic normalization using historical min/max (no fixed thresholds)
3. Monitored parameters (edit rate, velocity, edit size, etc.)
4. Virtual gestures feeding into CompositionEngine with 6 algorithms
5. Velocity-based triggering (only significant changes trigger events)
6. Spatial and timbral mapping:
   - Wikipedia → left region, bass (65-130Hz)
   - HackerNews → center, tenor (196-392Hz)
   - GitHub → right region, soprano (523-1047Hz)

**Files Modified:**
- `frontend/index.html` - New "How It Works" content
- `frontend/styles.css` - New `.explainer-intro` and `.explainer-detail` classes

---

#### Normal Rooms: Instructions Updated

**Problem:** Old instructions were incorrect and included obsolete version number.

**Before:**
```
Move your mouse or touch to create music
X-axis controls frequency • Y-axis controls amplitude • Intensity affects dynamics
Ver.0.0.8-alpha: cursors positions graph
```

**After:**
```
Tap for notes (hold longer for sustained tones)
Drag to create melodic phrases
Hover to modulate filters and effects
```

**File Modified:** `frontend/rooms.html:270-275`

---

#### Normal Rooms: Back Button Added

Added "← Back to main page" button to return to landing page from rooms.

**Files Modified:**
- `frontend/rooms.html` - Added `.back-link` CSS and `<a>` element

---

### Files Modified

**Frontend (4 files):**
1. `frontend/src/landing/main.js`
   - Added type check for `tap` events before processing frequency

2. `frontend/src/services/AudioService.js`
   - Changed `releaseAll()` to `releaseAll(0.05)` or `releaseAll(0.1)`
   - Increased ambient volumes (+5dB to +8dB per layer)

3. `frontend/index.html`
   - Replaced "How It Works" section with accurate technical content

4. `frontend/styles.css`
   - Added `.explainer-intro` and `.explainer-detail` classes

5. `frontend/rooms.html`
   - Updated instructions (tap/drag/hover)
   - Added back button to landing page

---

### Testing Results

- ✅ No more "Invalid frequency" warnings
- ✅ No more "Max polyphony exceeded" warnings
- ✅ Audio no longer stuttering
- ✅ Background music more audible
- ✅ "How It Works" content accurate
- ✅ Room instructions correct
- ✅ Back button functional

---

## Entry #19 - Bidirectional Cascade Propagation Fix (RESOLVED)
**Date:** 2026-01-06
**Status:** ✅ RESOLVED
**User Feedback:** "perfetto" (perfect)

---

### Problem Statement

After implementing arrival-based cascade propagation for pulses and particles (replacing time-based depth emission), the wave propagation worked correctly in the landing room but NOT in normal rooms. In normal rooms, particles were still being triggered simultaneously from all nodes instead of propagating sequentially like convoys from the cursor through the network.

**User Report:** "nella landing room propagazione è ok, nelle room normali ci sono ancora particles triggerate contemporaneamente da tutti i nodi"

---

### Root Cause Analysis

The issue was in how TERTIARY edges (background-to-background connections) are created in `SpringMeshNetwork.js`:

```javascript
// Lines 293-304 - Edge creation loop
for (let i = 0; i < bgArray.length; i++) {
  for (let j = i + 1; j < bgArray.length; j++) {
    // Creates edge: sourceId = nodeA.id (from i), targetId = nodeB.id (from j)
  }
}
```

This creates edges only in ONE direction: node[i] → node[j] where i < j.

**Impact on cascade:** When `onPulseArrival()` or `onParticleArrival()` looked for outgoing edges with `edge.sourceId === arrivalNodeId`, it only found edges for nodes with lower indices. Nodes with higher indices (always TARGET, never SOURCE) had no outgoing edges, so the cascade died at those nodes.

**Why landing page worked:** Landing page likely has fewer background nodes or different topology where this wasn't as noticeable.

---

### Solution: Bidirectional Cascade

Made cascade propagation **bidirectional** - when a pulse/particle arrives at a node, it now looks for ALL connected edges (where node is SOURCE **or** TARGET) and spawns children traveling in the appropriate direction.

#### Key Changes

**1. WaveContext Class** (simplified from WaveState):
```javascript
class WaveContext {
  constructor(id, sourceNodeId, color) {
    this.id = id
    this.sourceNodeId = sourceNodeId
    this.color = color
    this.visitedNodes = new Set([sourceNodeId])
    this.activePulseCount = 0
  }
}
```

**2. Bidirectional Edge Discovery** (`onPulseArrival`):
```javascript
// Find ALL connected edges (bidirectional traversal)
const connectedEdges = this.springMesh.edges.filter(
  edge => edge.sourceId === arrivalNodeId || edge.targetId === arrivalNodeId
)

for (const edge of connectedEdges) {
  const otherNodeId = edge.sourceId === arrivalNodeId ? edge.targetId : edge.sourceId
  if (waveContext.visitedNodes.has(otherNodeId)) continue

  const isForward = edge.sourceId === arrivalNodeId
  const cascadePulse = this.createCascadePulseBidirectional(
    edge, pulse.color, cascadeIntensity, waveContext, nextHop, isForward, otherNodeId
  )
}
```

**3. Reverse Direction Support**:
- Added `isReverse` flag to pulse/particle objects
- Added `destinationNodeId` to track actual destination (since edge direction may be reversed)
- Updated `update()` to handle reverse travel (progress 1→0 instead of 0→1)

```javascript
// In update() method
if (pulse.isReverse) {
  pulse.progress -= pulse.speed * dt  // Travel backwards
} else {
  pulse.progress += pulse.speed * dt  // Travel forwards
}

const hasArrived = pulse.isReverse ? (pulse.progress <= 0) : (pulse.progress >= 1)
```

---

### Additional Fix: TERTIARY Edge Hysteresis

Also added hysteresis to TERTIARY edge creation to prevent remaining flickering:

```javascript
// SpringMeshNetwork.js lines ~293-320
const tertiaryAddThreshold = 0.2     // Distance to ADD new TERTIARY edge
const tertiaryKeepThreshold = 0.3    // Distance to KEEP existing TERTIARY edge

const shouldHaveEdge = existingData
  ? dist < tertiaryKeepThreshold   // Existing: keep until farther away
  : dist < tertiaryAddThreshold    // New: only add if very close
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/visual/WavePacketSystem.js` | Bidirectional cascade for pulses, WaveContext class, reverse direction support |
| `frontend/src/services/visual/ParticleFlowManager.js` | Bidirectional cascade for particles, ParticleWaveContext class, reverse direction support |
| `frontend/src/services/visual/SpringMeshNetwork.js` | Added hysteresis to TERTIARY edges (tertiaryAddThreshold/tertiaryKeepThreshold) |

---

### Algorithmic Philosophy

This implementation follows the "Cascading Network Consciousness" philosophy documented in `.claude/skills/algorithmic-art/output/cascading-network-consciousness.md`:

> *"Arrival-based cascade propagation: the fundamental principle that energy must travel before it can spread. A pulse emitted from the source cursor begins its journey along the first edge. Only when it arrives at the destination node does that node awaken and spawn new pulses along its own outgoing edges."*

---

### Testing Results

- ✅ Flickering resolved (hysteresis working)
- ✅ Landing room propagation correct
- ✅ Normal room propagation correct (previously broken)
- ✅ Pulses travel as convoys through network topology
- ✅ Particles follow same cascading pattern
- ✅ No cycle explosions (visited node tracking working)
- ✅ Intensity decay working (0.65x per hop)

---

## Entry #20 - Virtual Users in Normal Rooms (COMPLETED)

**Date**: 2026-01-06
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Integrated virtual users (from web metrics) into normal rooms. When a room has only 1 real user (solo mode), 2 virtual users provide musical accompaniment. When 2+ real users join (multi mode), virtual users fade out. Also implemented overflow room support for capacity management.

---

### Features Implemented

1. **Solo Mode**: 1 real user → 2 virtual users active (dynamically selected from most active web sources in last 5 minutes)
2. **Multi Mode Transition**: 2nd user joins → notification auto-hide 3s, virtual cursors fade out
3. **Solo Mode Return**: Room drops to 1 user → virtual users restored
4. **Room Capacity**: maxUsers increased from 3 to 4
5. **Overflow Rooms**: When room is full, creates incremental rooms (room-2, room-3...)
6. **User Count Display**: Shows "👥 1 user + 2 web sources" when virtual users active

---

### Issues Fixed During Implementation

#### Issue 1: Socket Events Not Forwarded

**Problem**: Backend emitted virtual user events but frontend didn't receive them.

**Root Cause**: `SocketService.js` was missing handlers for:
- `virtual-users-activated`
- `virtual-users-deactivated`
- `virtual-cursors`
- `mode-transition`

**Fix**: Added socket.on handlers that forward events via `this.emit()`.

---

#### Issue 2: User Count Not Updating on Disconnect

**Problem**: When a user left, other users' UI didn't update the user count.

**Root Cause**: `user-left` event in disconnect handler was missing `userCount`.

**Fix**: Added `userCount` to the emit in `AuthHandler.js` disconnect handler.

---

#### Issue 3: Virtual Cursors Not Appearing (Main Room)

**Problem**: Backend logs showed virtual users activated, but frontend never received the event.

**Root Cause**: `socket.join(roomId)` was called AFTER `roomManager.joinRoom()`. When VirtualUserService emitted `virtual-users-activated`, the socket wasn't in the room yet.

**Fix**: Moved `socket.join(roomId)` BEFORE `roomManager.joinRoom()` call.

```javascript
// BEFORE (broken):
const result = await roomManager.joinRoom(...)
socket.join(roomId)  // Too late! Event already emitted

// AFTER (fixed):
socket.join(roomId)  // Join first
const result = await roomManager.joinRoom(...)  // Now socket receives event
```

---

#### Issue 4: Virtual Cursors Not Appearing (Overflow Rooms)

**Problem**: Main room worked correctly, but overflow rooms (main-room-2, etc.) didn't show virtual users.

**Root Cause**: When user is redirected to overflow room:
1. Socket joins original room first
2. `roomManager.joinRoom()` recursively creates and joins overflow room
3. VirtualUserService emits to overflow room
4. But socket is still in original room → misses event
5. Socket then moves to overflow room → too late

**Fix**: After moving socket to overflow room, re-emit `virtual-users-activated`:

```javascript
if (actualRoomId !== roomId) {
  socket.leave(roomId)
  socket.join(actualRoomId)

  // Re-emit virtual-users-activated to this socket
  if (overflowRoom.hasVirtualUsers()) {
    socket.emit('virtual-users-activated', {...})
  }
}
```

Also fixed all broadcasts to use `actualRoomId` instead of `roomId`:
- `user-joined` broadcast
- `room-joined` event
- `getDrawingHistory()`
- `backgroundCompositionService.startComposition()`

---

#### Issue 5: Virtual Cursor Size

**Problem**: User reported cursors were "enormous".

**Fix**: Halved cursor sizes in `CursorManager.js` from 20 to 10 base pixels.

---

### Files Modified

#### Backend

| File | Changes |
|------|---------|
| `backend/src/models/Room.js` | Added `mode` state (solo/multi), increased `maxUsers` to 4, added `virtualUsers` Map |
| `backend/src/services/RoomManager.js` | Mode detection, virtual user lifecycle, overflow room creation |
| `backend/src/services/VirtualUserService.js` | NEW - Shared logic for virtual gesture generation |
| `backend/src/services/WebMetricsPoller.js` | Activity tracking for dynamic source selection |
| `backend/src/services/ServiceContainer.js` | Register VirtualUserService |
| `backend/src/api/handlers/AuthHandler.js` | Socket join timing fix, overflow room event re-emission, actualRoomId usage |

#### Frontend

| File | Changes |
|------|---------|
| `frontend/src/services/SocketService.js` | Added virtual user event handlers |
| `frontend/src/services/CursorManager.js` | Virtual cursor support with fade animations, halved cursor sizes |
| `frontend/src/services/UIManager.js` | Added `virtualSourceCount` for web sources display |
| `frontend/src/handlers/SocketEventCoordinator.js` | Handle virtual user events, mode transitions |
| `frontend/src/main.js` | Handle redirect notification, virtualUsers from joinResponse |

#### Tests

| File | Purpose |
|------|---------|
| `backend/tests/unit/Room.mode.test.js` | Mode transitions, virtual user management |
| `backend/tests/unit/VirtualUserService.test.js` | Virtual user activation/deactivation |
| `backend/tests/unit/WebMetricsPoller.activity.test.js` | Activity tracking for source selection |
| `backend/tests/integration/virtual-user-lifecycle.test.js` | Full lifecycle integration tests |

---

### Socket Event Flow

```
Solo Mode (1 user joins):
  socket.join(roomId)
  → roomManager.joinRoom()
  → room.getUserCount() === 1
  → virtualUserService.activateForRoom()
  → emit 'virtual-users-activated'
  → Frontend: fade-in virtual cursors, show "1 user + 2 web sources"

Multi Mode (2nd user joins):
  → room.updateMode() returns {changed: true, to: 'multi'}
  → virtualUserService.deactivateForRoom()
  → emit 'virtual-users-deactivated'
  → emit 'mode-transition'
  → Frontend: fade-out cursors, show notification 3s

Overflow (5th user joins full room):
  socket.join('main-room')
  → roomManager.joinRoom() sees room full
  → creates 'main-room-2', recursively joins
  → virtualUserService activates for 'main-room-2'
  → event emitted to 'main-room-2' (socket still in 'main-room')
  → socket.leave('main-room'), socket.join('main-room-2')
  → RE-EMIT 'virtual-users-activated' to this socket
  → Frontend receives event, shows virtual users
```

---

### Test Results

All 19 integration tests pass:
```
✓ first user joining should activate virtual users
✓ room should be in solo mode with 1 user
✓ virtual users should be registered in room
✓ second user joining should deactivate virtual users
✓ mode-transition event should be emitted
✓ room should be in multi mode with 2 users
✓ virtual users should be cleared from room
✓ user leaving should reactivate virtual users when only 1 remains
✓ room should return to solo mode
✓ virtual users should be restored in room
✓ last user leaving should deactivate virtual users
✓ room should be inactive when empty
✓ should handle rapid join/leave cycles
✓ room mode should be correct after multiple transitions
✓ virtual users should be managed independently per room
✓ events should be scoped to correct rooms
✓ should create overflow room when main room is full
✓ overflow room should have its own virtual users in solo mode
✓ should create multiple overflow rooms
```

---

### User Feedback

"ok funziona" - Confirmed virtual users working in both main room and overflow rooms.

---
