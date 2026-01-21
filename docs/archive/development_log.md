# Webarmonium Development Log

> **Note:** Older entries (1-130) have been moved to [log_archive.md](log_archive.md)

---



## Entry #131 - Octave Formula Refactoring & Code Review Fixes

**Date**: 2026-01-17
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Refactored the 6-octave formula from Entry #130 to use the centralized `getBaseOctaveFromY()` function, eliminating code duplication across 5 locations. Also removed obsolete `params.baseOctave` fallback and standardized scale fallbacks.

---

### Problem Statement

Code review of Entry #130 identified several issues:

| Issue | Priority | Description |
|-------|----------|-------------|
| Code duplication | Medium | Formula `(1 + Math.floor((1 - y) * 6))` repeated in 5 locations |
| Unused utility | Medium | `getBaseOctaveFromY()` created but never used |
| Obsolete fallback | Medium | `params.baseOctave ||` check no longer needed since backend removed it |
| Inconsistent fallback | Low | Scale fallback differed between handlers (`[0,2,4,7,9]` vs `[0,2,4,5,7,9,11]`) |

---

### Solution

#### 1. Use centralized `getBaseOctaveFromY()`

Replaced all inline formulas with the centralized function:

```javascript
// Before (5 locations)
const baseOctave = params.baseOctave || (1 + Math.floor((1 - y) * 6))

// After (5 locations)
const baseOctave = window.MusicalConstants.getBaseOctaveFromY(y)
```

#### 2. Remove obsolete fallback

Since backend `CollectiveMetricsAnalyzer.js` no longer sends `baseOctave` in compositional parameters (removed in Entry #130), the `params.baseOctave ||` fallback is unnecessary.

#### 3. Standardize scale fallback

DragStreamingHandler.js used `[0, 2, 4, 5, 7, 9, 11]` (major scale) as fallback, while others used `[0, 2, 4, 7, 9]` (pentatonic). Standardized to pentatonic for consistency.

---

### Files Modified

| File | Line | Change |
|------|------|--------|
| `frontend/src/handlers/SustainedHoldHandler.js` | 72 | Use `window.MusicalConstants.getBaseOctaveFromY(y)` |
| `frontend/src/handlers/DragStreamingHandler.js` | 52 | Standardize scale fallback to `[0, 2, 4, 7, 9]` |
| `frontend/src/handlers/DragStreamingHandler.js` | 82 | Use `window.MusicalConstants.getBaseOctaveFromY(y)` |
| `frontend/src/services/GestureProcessor.js` | 221 | Use `window.MusicalConstants.getBaseOctaveFromY(sonicParams.y)` |
| `frontend/src/main.js` | 315 | Use `window.MusicalConstants.getBaseOctaveFromY(y)` |
| `frontend/src/main.js` | 560 | Use `window.MusicalConstants.getBaseOctaveFromY(y)` |

---

### Benefits

1. **Single source of truth**: Formula changes only need to be made in `MusicalConstants.js`
2. **Cleaner code**: Removed unused parameters (`params`) from 4 locations
3. **Consistency**: All handlers now use identical pentatonic fallback scale
4. **Maintainability**: Reduced code duplication from 5 copies to 1

---

### Version

v1.0.160

---

## Entry #132 - WavePacketSystem Orphaned Pulse Bug Fix

**Date**: 2026-01-17
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed a rare visual bug where a large yellow "globe" with rays would appear and persist on the canvas until page reload. The bug was caused by orphaned pulses that weren't properly cleaned up when their associated edge nodes were removed.

---

### Problem Statement

User reported a rare bug where a large yellow glowing sphere with lines emanating from it would appear on the canvas and remain frozen until the page was reloaded. The artifact looked like a cursor node but was much larger, and the "rays" were actually edge connections.

---

### Root Cause Analysis

Multiple issues in `WavePacketSystem.js` could cause pulses to become orphaned:

1. **Early return without cleanup**: When `renderPulse()` returned early due to missing nodes, the pulse wasn't marked for removal
2. **NaN propagation**: If `dt`, `progress`, or `speed` became `NaN`, the pulse would never complete its traversal
3. **Invalid edge references**: When edges were rebuilt, pulses could retain references to stale edge objects
4. **No periodic cleanup**: Orphaned pulses could accumulate without any mechanism to detect and remove them

---

### Solution

#### 1. Mark pulses for removal on invalid state

```javascript
// Validate edge exists and has required properties
if (!edge || !edge.sourceId || !edge.targetId || !edge.controlPoint) {
  pulse._markedForRemoval = true
  return
}

// Validate nodes exist
if (!nodeA || !nodeB) {
  pulse._markedForRemoval = true
  return
}

// Validate position is finite
if (!isFinite(pos.x) || !isFinite(pos.y)) {
  pulse._markedForRemoval = true
  return
}

// Validate visual properties
if (!isFinite(alpha) || !isFinite(size) || size <= 0) {
  pulse._markedForRemoval = true
  return
}
```

#### 2. NaN protection in update loop

```javascript
// Protect against NaN dt
if (!isFinite(dt) || dt <= 0) {
  dt = 0.016  // Default to ~60fps frame time
}

// Check for pulses marked for removal during render
if (pulse._markedForRemoval) {
  pulsesToRemove.push(pulseId)
  continue
}

// Validate pulse has required properties
if (!pulse.edge || !isFinite(pulse.progress) || !isFinite(pulse.speed)) {
  pulsesToRemove.push(pulseId)
  continue
}

// Check for NaN after progress update
if (!isFinite(pulse.progress)) {
  pulsesToRemove.push(pulseId)
  continue
}
```

#### 3. Periodic orphan cleanup

```javascript
// In render() - every 60 frames
if (p.frameCount % 60 === 0) {
  this._cleanupOrphanedPulses()
}

_cleanupOrphanedPulses() {
  const orphanedIds = []

  for (const [pulseId, pulse] of this.activePulses) {
    if (pulse._markedForRemoval) {
      orphanedIds.push(pulseId)
      continue
    }
    if (!pulse.edge) {
      orphanedIds.push(pulseId)
      continue
    }
    // Check if edge nodes still exist
    const nodeA = this.springMesh.getNodeOrIntermediate(pulse.edge.sourceId)
    const nodeB = this.springMesh.getNodeOrIntermediate(pulse.edge.targetId)
    if (!nodeA || !nodeB) {
      orphanedIds.push(pulseId)
    }
  }

  for (const pulseId of orphanedIds) {
    this.removePulse(pulseId)
  }

  if (orphanedIds.length > 0) {
    console.log(`🌊 Cleaned up ${orphanedIds.length} orphaned pulses`)
  }
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/visual/WavePacketSystem.js` | Added `_markedForRemoval` flag handling, NaN protection, `_cleanupOrphanedPulses()` method, validation in `renderPulse()` and `update()` |

---

### Version

v1.0.161

---

## Entry #138 - Audio Auto-Restart Bug Fix (Complete)

**Date**: 2026-01-17 (Updated: 2026-01-18)
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Comprehensive fix for the audio auto-restart bug, addressing multiple issues:
1. Audio restarting after visibility/focus changes even when user had pressed Stop
2. Audio starting automatically on any click, even without pressing Start button
3. Audio recovery only restarting chords, not drone (incomplete recovery)
4. iOS sleep recovery regression

---

### Problem Statement

1. Audio restarted when switching tabs after pressing Stop
2. Audio would start on pages where user never pressed Start
3. When audio DID recover (after sleep), only chords restarted - drone was missing
4. iOS sleep recovery stopped working after initial fixes

---

### Root Causes Identified

**Bug 1: _userStoppedAudio not set when isInitialized is false**

In `AudioService.stop()`, the flag was inside `if (this.isInitialized)` block.

**Bug 2: _initAudioListener missing isRunning check**

In `main.js`, any click/keydown would trigger audio initialization.

**Bug 3: Recovery missing _userExplicitlyStartedAudio check**

Recovery would run even if user never pressed Start, because it only checked `isInitialized` and `_userStoppedAudio`.

**Bug 4: DroneVoidController not restarted in recovery**

`_performAudioRecovery()` only called `startEvolvingGeneration()` (chords), not `droneVoidController.start()`.

---

### Solution

**Fix 1: Move _userStoppedAudio outside conditional**

```javascript
stop() {
  this._userStoppedAudio = true
  this._userExplicitlyStartedAudio = false
  // ...
}
```

**Fix 2: Add isRunning check in _initAudioListener**

```javascript
this._initAudioListener = async () => {
  if (!this.isRunning) return
  // ...
}
```

**Fix 3: Add _userExplicitlyStartedAudio flag**

New flag tracks if user explicitly pressed Start:

```javascript
// In constructor
this._userExplicitlyStartedAudio = false

// In start()
this._userExplicitlyStartedAudio = true

// In stop()
this._userExplicitlyStartedAudio = false

// In _performAudioRecovery()
if (!this._userExplicitlyStartedAudio) {
  console.log('🔊 User never started audio, skipping recovery')
  return
}
```

**Fix 4: Restart DroneVoidController in recovery**

```javascript
// In _performAudioRecovery() STEP 5
if (this.droneVoidController) {
  console.log('🔊 Restarting DroneVoidController after recovery...')
  this.droneVoidController.reset()
  this.droneVoidController.start()
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/AudioService.js` | Added `_userExplicitlyStartedAudio` flag, moved `_userStoppedAudio` outside conditional, added DroneVoidController restart in recovery, added flag check in `_performAudioRecovery()` |
| `frontend/src/landing/main.js` | Added `if (!this.isRunning) return` check in `_initAudioListener` |
| `frontend/index.html` | Version bump to v1.0.165 |

---

### Expected Behavior

| Scenario | Behavior |
|----------|----------|
| User never pressed Start | No audio plays, no recovery |
| User pressed Start, then Stop | Audio stops, no recovery after tab switch |
| User pressed Start, iOS sleeps | Full recovery (chords + drone) after wake |
| User pressed Start, then Stop, iOS sleeps | No recovery after wake |

---

### Verification

**Test 1: No audio without Start**
1. Load page fresh, click anywhere (not Start)
2. **Expected**: No audio plays

**Test 2: Stop respected after tab switch**
1. Press Start, then Stop
2. Switch tabs and return
3. **Expected**: Audio remains stopped

**Test 3: iOS sleep recovery works**
1. Press Start, let audio play
2. Let iOS sleep, then wake
3. **Expected**: Full audio recovery (chords AND drone)

---

### Version

v1.0.165

---

## Entry #133 - Harmonic Quantization for Drag Gestures

**Date**: 2026-01-18
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Ensured that virtual users respect the same harmonic quantization as real users for drag gestures. Previously, drag gestures used mood-based scale selection from PhraseMorphology, which could produce notes outside the room's current key/mode.

---

### Problem Statement

Real users and virtual users were not consistently harmonically quantized for drag gestures:

- **TAP gestures**: Both used `harmonicEngine.constrainToScale()` correctly
- **DRAG gestures**: Used `PhraseMorphology.generatePhrase()` which selects scales based on gesture "mood" (bright→major, sad→minor, jazzy→dorian) instead of the room's musical context

This meant a room in C dorian could have drag gestures producing C major notes if the gesture was classified as "bright".

---

### Solution

Added `harmonicEngine.constrainToScale()` after phrase generation in all three services that generate drag gestures:

**1. GestureToMusicService.js** (real users in normal rooms)
```javascript
case 'drag': {
  const dragPhrase = this.phraseMorphology.generatePhrase(gestureData, musicalContext)
  if (dragPhrase && dragPhrase.notes) {
    dragPhrase.notes = dragPhrase.notes.map(note => ({
      ...note,
      pitch: this.harmonicEngine.constrainToScale(note.pitch, this.currentKey, this.currentMode)
    }))
  }
  return dragPhrase
}
```

**2. VirtualUserService.js** (virtual users in normal rooms when solo)
```javascript
const { key, mode } = roomState.musicalContext
phrase.notes = phrase.notes.map(note => ({
  ...note,
  pitch: this.harmonicEngine.constrainToScale(note.pitch, key, mode)
}))
```

**3. LandingCompositionService.js** (virtual users in landing room)
```javascript
const { key, mode } = musicalContext
phrase.notes = phrase.notes.map(note => ({
  ...note,
  pitch: this.harmonicEngine.constrainToScale(note.pitch, key, mode)
}))
```

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/GestureToMusicService.js` | Added harmonic quantization after drag phrase generation (lines 168-175) |
| `backend/src/services/VirtualUserService.js` | Added harmonic quantization after drag phrase generation (lines 805-811) |
| `backend/src/services/LandingCompositionService.js` | Added harmonic quantization after drag phrase generation (lines 1195-1201) |
| `frontend/index.html` | Version bump to v1.0.164 |

---

### Version

v1.0.164

---

## Entry #134 - Entry #93 Code Review Fixes

**Date**: 2026-01-18
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Applied 5 fixes identified by code-reviewer agent after Entry #93 visual/UX improvements. Addresses security concerns (SVG injection), memory leaks, race conditions, performance issues, and accessibility gaps.

---

### Issues Fixed

| # | Issue | Priority | Fix |
|---|-------|----------|-----|
| 1 | SVG data URI in CSS | Critical | Moved inline SVG to external file `/assets/noise-texture.svg` |
| 2 | Memory leak in sound-reactive loop | High | Added null checks for `_audioAnalyserData`, disconnect cleanup in `_stopSoundReactiveLoop()` |
| 3 | Race condition: immersive resize handler | High | Stored handlers in instance properties, cleanup in `dispose()` |
| 4 | Performance: CSS updates at 60fps | High | Added frame counter to throttle to ~30fps (skip every other frame) |
| 5 | Missing ARIA announcements | Medium | Added `aria-live` region that announces immersive mode changes |

---

### Detailed Fixes

#### 1. External SVG Noise Texture (Critical)

**Problem**: Inline SVG data URI in CSS could be a security/maintenance concern.

**Solution**: Created external file and updated CSS reference.

**File:** `frontend/assets/noise-texture.svg` (NEW)
```xml
<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <filter id="n">
    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch"/>
  </filter>
  <rect width="100%" height="100%" filter="url(#n)"/>
</svg>
```

**File:** `frontend/styles.css`
```css
/* Before */
background-image: url("data:image/svg+xml,%3Csvg...");

/* After */
background-image: url("/assets/noise-texture.svg");
```

#### 2. Sound-Reactive Memory Leak Fix (High)

**Problem**: Animation loop didn't check `_audioAnalyserData` before accessing, and analyser wasn't disconnected on stop.

**Solution**: Added validation and cleanup.

**File:** `frontend/src/landing/main.js`
```javascript
// In update loop - added null check
if (!this._audioAnalyser || !this._audioAnalyserData || !this.isRunning) {
  this._soundReactiveAnimationId = null
  return
}

// In _stopSoundReactiveLoop() - added disconnect
if (this._audioAnalyser) {
  try {
    this._audioAnalyser.disconnect()
  } catch (e) {
    // Ignore disconnect errors
  }
  this._audioAnalyser = null
  this._audioAnalyserData = null
}
```

#### 3. Immersive Mode Handler Cleanup (High)

**Problem**: Resize and keydown handlers weren't removed in `dispose()`, causing potential memory leaks.

**Solution**: Store handler references and remove in cleanup.

**File:** `frontend/src/landing/main.js`
```javascript
// Constructor
this._immersiveResizeHandler = null
this._immersiveKeyHandler = null

// In _setupImmersiveMode() - store references
this._immersiveKeyHandler = (e) => { ... }
document.addEventListener('keydown', this._immersiveKeyHandler)

this._immersiveResizeHandler = () => { ... }
window.addEventListener('resize', this._immersiveResizeHandler)

// In dispose() - cleanup
if (this._immersiveKeyHandler) {
  document.removeEventListener('keydown', this._immersiveKeyHandler)
  this._immersiveKeyHandler = null
}
if (this._immersiveResizeHandler) {
  window.removeEventListener('resize', this._immersiveResizeHandler)
  this._immersiveResizeHandler = null
}
```

#### 4. 30fps Throttle for Sound-Reactive UI (High)

**Problem**: CSS custom property updates at 60fps unnecessary, wastes CPU.

**Solution**: Skip every other frame using frame counter.

**File:** `frontend/src/landing/main.js`
```javascript
// Constructor
this._soundReactiveFrameCount = 0

// In _startSoundReactiveLoop()
this._soundReactiveFrameCount = 0  // Reset

const update = () => {
  // Throttle to ~30fps (skip every other frame)
  this._soundReactiveFrameCount++
  if (this._soundReactiveFrameCount % 2 !== 0) {
    this._soundReactiveAnimationId = requestAnimationFrame(update)
    return
  }
  // ... actual work
}
```

#### 5. ARIA Announcements for Immersive Mode (Medium)

**Problem**: Screen reader users weren't informed when entering/exiting immersive mode.

**Solution**: Create aria-live region and announce mode changes.

**File:** `frontend/src/landing/main.js`
```javascript
// Create ARIA live region
let ariaLive = document.getElementById('immersive-aria-live')
if (!ariaLive) {
  ariaLive = document.createElement('div')
  ariaLive.id = 'immersive-aria-live'
  ariaLive.setAttribute('role', 'status')
  ariaLive.setAttribute('aria-live', 'polite')
  ariaLive.setAttribute('aria-atomic', 'true')
  ariaLive.className = 'sr-only'
  ariaLive.style.cssText = 'position:absolute;width:1px;height:1px;...'
  document.body.appendChild(ariaLive)
}

// Announce mode change
if (ariaLive) {
  ariaLive.textContent = isImmersive
    ? 'Entered immersive mode. Press Escape to exit.'
    : 'Exited immersive mode.'
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/assets/noise-texture.svg` | **NEW** - External SVG noise texture |
| `frontend/styles.css` | Changed inline SVG to external file reference |
| `frontend/src/landing/main.js` | Throttling, cleanup handlers, ARIA announcements, memory leak fixes |

---

### Version

v1.0.167

---

## Entry #135 - UI Skills Stylistic Assessment & Implementation

**Date**: 2026-01-18
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Conducted comprehensive stylistic assessment of Webarmonium based on three design guideline sources (rams.ai, interfaces.rauno.me, uiskills.dev) and implemented all critical, medium, and low priority fixes. Changed brand accent color from purple gradient to solid blue (#3b82f6).

---

### Assessment Sources

| Source | Focus Area |
|--------|------------|
| rams.ai | Accessibility WCAG 2.1, visual consistency, semantic code |
| interfaces.rauno.me | Interactivity, typography, motion, touch handling, performance |
| uiskills.dev | Opinionated constraints (no gradients, no letter-spacing, animations ≤200ms) |

---

### Critical Violations Fixed (UI Skills)

#### 1. Purple Gradients Removed

Replaced all purple/multicolor gradients with solid blue `#3b82f6`:

| Location | Before | After |
|----------|--------|-------|
| CSS variables | `--accent: #6366f1` | `--accent: #3b82f6` |
| header h1 | `linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)` | `color: var(--accent)` |
| .primary-btn | `linear-gradient(135deg, #6366f1, #8b5cf6)` | `background: var(--accent)` |
| #mapping-explainer h2 | gradient | `color: var(--accent)` |
| webarmonium-logo.svg | `stroke="url(#purpleGrad)"` | `stroke="#3b82f6"` |

#### 2. Letter-Spacing Removed

Removed all `letter-spacing` declarations per UI Skills guidelines:

- `styles.css`: Lines 64, 187, 249
- `SettingsPanel.js`: Embedded `.settings-group-title` style

#### 3. Animations Reduced to ≤200ms

Changed UI transition durations from 0.3s to 0.15s:

| Element | Before | After |
|---------|--------|-------|
| .meter-fill transition | 0.3s | 0.15s |
| .settings-btn transition | 0.3s | 0.15s |
| .audio-mode-indicator transition | 0.3s | 0.15s |
| .corner-logo-link transition | 0.2s | 0.15s |

#### 4. Glow Effects Replaced

Replaced `box-shadow` glow effects with `filter: brightness()` and `transform: scale()`:

```css
/* Before */
.metric-card.flash {
  box-shadow: 0 0 15px var(--flash-color);
}

/* After */
.metric-card.flash {
  transform: scale(1.02);
  border-color: var(--flash-color, var(--accent));
}
```

#### 5. Text Wrapping Added

```css
h1, h2, h3 { text-wrap: balance; }
p, .explainer-intro, .explainer-detail { text-wrap: pretty; }
```

---

### Typography Improvements

Added to `body`:

```css
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
text-rendering: optimizeLegibility;
-webkit-text-size-adjust: 100%;
```

Added iOS zoom prevention:

```css
input, select, textarea { font-size: 16px; }
```

---

### Accessibility Improvements

#### Focus Rings (box-shadow instead of outline)

```css
button:focus-visible,
.primary-btn:focus-visible,
/* ... */
[tabindex]:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent), 0 0 0 5px rgba(59, 130, 246, 0.3);
}
```

#### Selection Styling

```css
::selection {
  background: var(--accent);
  color: var(--bg-color);
}
```

#### ARIA Improvements

- Added `aria-label` to all icon-only buttons
- Added `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to SettingsPanel
- Added `role="radiogroup"` with `aria-labelledby` to option groups
- Added canvas accessibility: `role="img"` with descriptive `aria-label`

#### Focus Trapping in SettingsPanel

- Implemented Tab/Shift+Tab focus trap within modal
- Cache focusable elements on panel open (performance optimization)
- Restore focus to previously focused element on close

---

### Touch Device Optimizations

#### Hover Effect Hiding

```css
@media (hover: none) {
  button:hover:not(:disabled),
  .primary-btn:hover,
  .settings-btn:hover,
  .room-link:hover,
  .metric-card:hover,
  .corner-logo-link:hover {
    transform: none;
    opacity: 1;
  }
}
```

#### User Selection Prevention

```css
button, .primary-btn, .secondary-btn, .settings-btn,
.room-link, input[type="range"] {
  user-select: none;
  -webkit-user-select: none;
}
```

---

### Performance Improvements

#### Animation Pause Utility

```css
.animation-paused,
[data-animation-paused="true"] {
  animation-play-state: paused !important;
}
```

Added Intersection Observer in `index.html` to pause off-screen animations.

---

### Asset Updates

#### SVG Files

- `webarmonium-logo.svg`: Solid blue #3b82f6, English comments
- `favicon.svg`: Adaptive favicon with `prefers-color-scheme` support

#### PNG Files

User manually updated (ImageMagick not available):
- `apple-touch-icon.png`
- `favicon-32x32.png`
- `webarmonium-logo-512.png`

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/styles.css` | CSS variables, gradients removed, letter-spacing removed, transitions reduced, typography, focus rings, selection, touch media query |
| `frontend/webarmonium-logo.svg` | Purple gradient → solid blue, Italian → English comments |
| `frontend/favicon.svg` | New adaptive favicon with dark mode support |
| `frontend/rooms.html` | All purple rgba() → blue rgba() |
| `frontend/index.html` | SVG favicon link, ARIA labels, Intersection Observer |
| `frontend/how-it-works.html` | ARIA labels for icon buttons |
| `frontend/technical-appendix.html` | ARIA labels for icon buttons |
| `frontend/src/main.js` | Audio recovery button colors updated |
| `frontend/src/components/SettingsPanel.js` | Focus trapping, cached focusable elements, letter-spacing removed, ARIA attributes |

---

### Code Review Results

**Overall Grade: A-**

| Priority | Issues Found | Status |
|----------|--------------|--------|
| Critical | 0 | N/A |
| High | 1 (color pool - intentional) | Skipped |
| Medium | 2 | Fixed |
| Low | 2 | Fixed |

The purple `#984ea3` in the user color pool was intentionally kept as it's for real user assignments, not branding.

---

### Version

Updated to v1.0.166

---

## Entry #136 - UI Restyling Fixes: Sliders, Connection Line, Immersive Button

**Date**: 2026-01-18
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed multiple UI issues from the mockup 9/12 hybrid restyling: sliders positioned below connection line, connection line z-index below UI elements, immersive button click interference with explainer, and reduced collapsible trigger area sensitivity.

---

### Problem Statement

User reported 4 issues after the initial UI restyling:

1. **Sliders too close to connection line** - Sliders were placed above the line, should be below
2. **Connection line z-index wrong** - In rooms, the line passed over buttons instead of behind them
3. **Immersive button unclickable** - Collapsible explainer was interfering with the immersive mode button
4. **Collapsible too responsive** - Edge detection trigger area (80px) was too large

---

### Solution

#### 1. Sliders Below Connection Line

Changed `padding-top` from `0.9rem` to `1.5rem` for `.slider-node` in both landing page and rooms:

**File:** `frontend/styles.css`
```css
.slider-group,
.slider-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 1;
  /* Place slider BELOW the connection line */
  padding-top: 1.5rem;
}
```

**File:** `frontend/rooms.html`
```css
.slider-node {
  padding-top: 1.5rem;
}
```

#### 2. Connection Line z-index Fix

Changed `z-index` from `0` to `-1` for the `::before` pseudo-element to ensure it's truly behind all UI elements:

**File:** `frontend/styles.css`
```css
#controls-bar::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 10%;
  right: 10%;
  height: 2px;
  background: var(--line);
  z-index: -1;  /* Changed from 0 */
  transform: translateY(-50%);
}
```

**File:** `frontend/rooms.html`
```css
.room-interface::before {
  z-index: -1;  /* Changed from 0 */
}
```

#### 3. Immersive Button Click Fix

Moved the immersive toggle button from inside `#canvas-container` to the body level, and changed positioning from `absolute` to `fixed`:

**File:** `frontend/index.html`
```html
<!-- Before: Inside canvas-container -->
<section id="canvas-container">
  <canvas id="trail-overlay">...</canvas>
  <button class="immersive-toggle">...</button>
</section>

<!-- After: Outside canvas-container -->
<section id="canvas-container">
  <canvas id="trail-overlay">...</canvas>
</section>
<button class="immersive-toggle">...</button>
```

**File:** `frontend/styles.css`
```css
.immersive-toggle {
  position: fixed;  /* Changed from absolute */
  bottom: 1rem;
  right: 1rem;
  z-index: 150; /* Above explainer (z-index: 100) */
}
```

Updated hover behavior CSS since the button is no longer a child of canvas-container:
```css
body:not(.immersive-mode) .immersive-toggle:hover {
  opacity: 1;
  pointer-events: auto;
}

body:not(.immersive-mode):has(#canvas-container:hover) .immersive-toggle {
  opacity: 1;
  pointer-events: auto;
}
```

#### 4. Reduced Collapsible Trigger Area

Changed edge detection trigger area from 80px to 30px to avoid interference with the immersive button:

**File:** `frontend/src/landing/main.js`
```javascript
// Edge detection: show when mouse near bottom 30px
// (reduced from 80px to avoid interference with immersive button)
document.addEventListener('mousemove', (e) => {
  const nearBottom = window.innerHeight - e.clientY < 30
  // ...
})
```

---

### Technical Details

| Issue | Before | After |
|-------|--------|-------|
| Slider padding | `padding-top: 0.9rem` | `padding-top: 1.5rem` |
| Connection line z-index | `z-index: 0` | `z-index: -1` |
| Immersive button position | `position: absolute` (inside canvas) | `position: fixed` (body level) |
| Immersive button z-index | `z-index: 20` | `z-index: 150` |
| Edge detection trigger | 80px from bottom | 30px from bottom |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/styles.css` | Slider padding, connection line z-index, immersive button position and z-index, hover CSS |
| `frontend/rooms.html` | Slider padding, connection line z-index |
| `frontend/index.html` | Moved immersive toggle button outside canvas-container |
| `frontend/src/landing/main.js` | Reduced edge detection trigger area |

---

### Version

v1.0.177

---

## Entry #137 - Collapsible UI: Separate Trigger Zones for Explainer & Immersive Button

**Date**: 2026-01-19
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Implemented separate collapsible trigger zones for the explainer panel and immersive mode button. Increased UI background transparency and fixed z-index layering issues.

---

### Problem Statement

User reported multiple UX issues:

1. **UI background too opaque** - Alpha value of 0.7 was too dark
2. **Explainer interfered with immersive button** - Trigger areas overlapped
3. **Immersive button disappeared** - Old CSS rules hid button unless hovering over canvas
4. **Z-index issues** - Button not accessible when explainer was open

---

### Solution

#### 1. Increased UI Transparency

Changed `--ui-bg` alpha from 0.7 to 0.4:

**File:** `frontend/styles.css`
```css
--ui-bg: rgba(10, 10, 20, 0.4);  /* Was 0.7 */
```

**File:** `frontend/rooms.html`
```css
--ui-bg: rgba(10, 10, 20, 0.4);  /* Was 0.7 */
```

#### 2. Separate Trigger Zones

Created distinct trigger areas for each collapsible element:

| Element | Trigger Zone | Area |
|---------|-------------|------|
| Explainer | Bottom edge (excluding right corner) | 30px from bottom, excludes right 80px |
| Immersive button | Bottom-right corner | 80px × 30px |

**File:** `frontend/src/landing/main.js` (Explainer trigger)
```javascript
document.addEventListener('mousemove', (e) => {
  const nearBottom = window.innerHeight - e.clientY < 30
  const inImmersiveButtonArea = window.innerWidth - e.clientX < 80

  if (nearBottom && !inImmersiveButtonArea && explainer.classList.contains('collapsed')) {
    // Show explainer
  }
})
```

**File:** `frontend/src/landing/main.js` (Immersive button trigger)
```javascript
document.addEventListener('mousemove', (e) => {
  if (document.body.classList.contains('immersive-mode')) return

  const nearBottom = window.innerHeight - e.clientY < 30
  const nearRightEdge = window.innerWidth - e.clientX < 80

  if (nearBottom && nearRightEdge) {
    toggleBtn.classList.add('visible')
    // Auto-hide after 3 seconds
  }
})
```

#### 3. Removed Obsolete Canvas-Hover Rules

Removed CSS that hid immersive button unless hovering over canvas:

```css
/* REMOVED - was causing button to disappear */
body:not(.immersive-mode) .immersive-toggle {
  opacity: 0;
  pointer-events: none;
}
body:not(.immersive-mode):has(#canvas-container:hover) .immersive-toggle {
  opacity: 1;
  pointer-events: auto;
}
```

Replaced with JavaScript-controlled visibility via `.visible` class.

#### 4. Z-Index Fix

Increased immersive button z-index to ensure it's always accessible:

**File:** `frontend/styles.css`
```css
.immersive-toggle {
  z-index: 200;  /* Was 150 - now above explainer (z-index: 100) */
}
```

---

### Behavior Summary

| State | Explainer | Immersive Button |
|-------|-----------|------------------|
| Mouse at bottom-left/center | Shows (3s auto-hide) | Hidden |
| Mouse at bottom-right corner | Hidden | Shows (3s auto-hide) |
| Hovering on element | Stays visible | Stays visible |
| Mouse leaves | Auto-hides after 3s | Auto-hides after 3s |
| Explainer open | Visible | Visible (higher z-index) |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/styles.css` | `--ui-bg` alpha 0.4, z-index 200, `.visible` class for collapsible button |
| `frontend/rooms.html` | `--ui-bg` alpha 0.4 |
| `frontend/src/landing/main.js` | Explainer trigger excludes right 80px, immersive button corner detection with auto-hide |
| `frontend/index.html` | Version v1.0.184, cache-bust v=53 |

---

### Version

v1.0.184

---

## Entry #139 - UI Consistency Fixes: Unified Gray, Notifications, Immersive Minibar

**Date**: 2026-01-19
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Multiple UI consistency fixes: unified gray color across UI, repositioned and translated notifications, added line-based layout to immersive minibar, and removed user count icon.

---

### Changes

#### 1. Unified Gray Color

With the new black p5.js canvas background, the dark gray (`#1e1e2d`) in the UI was no longer visible. Unified all UI gray to match button border color:

**Files:** `frontend/styles.css`, `frontend/rooms.html`
```css
--line: #3a3a50;  /* Unified gray - same as --muted and button borders */
```

#### 2. Slider Positioning

Lowered sliders further from the connection line for better visual separation:

**Files:** `frontend/styles.css`, `frontend/rooms.html`
```css
.controls-left .slider-node,
.room-controls .slider-node {
  padding-top: 52px;  /* Was 45px */
}
```

#### 3. Immersive Mode Minibar Layout

Added line-based layout to immersive minibar to match other control bars:

**File:** `frontend/index.html`
```html
<div class="immersive-controls" id="immersive-controls">
  <div class="node-btn-wrapper">
    <button class="immersive-ctrl-btn" id="immersive-play-btn">
      <span class="ctrl-icon play-icon">▶</span>
      <span class="ctrl-icon stop-icon">■</span>
    </button>
    <span class="node-label">Start</span>
  </div>
  <div class="node-btn-wrapper">
    <button class="immersive-ctrl-btn" id="immersive-exit-btn">✕</button>
    <span class="node-label">Exit</span>
  </div>
</div>
```

**File:** `frontend/styles.css`
```css
.immersive-controls {
  height: 70px;
  gap: 1.5rem;
}

.immersive-controls .node-btn-wrapper {
  height: 70px;
  padding-top: 11px;
}

/* Connection line segments */
.immersive-controls::before,
.immersive-controls::after,
.immersive-controls .node-btn-wrapper:first-child::after {
  top: 33px;
  height: 1px;
  background: var(--line);
}
```

**File:** `frontend/src/landing/main.js`
- Added label update: "Start" ↔ "Stop" based on play state

#### 4. Notification Service Fixes

Repositioned notifications to center of page and unified styling:

**File:** `frontend/src/services/NotificationService.js`
```css
/* Container positioning */
position: fixed;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);

/* Unified styling */
background: var(--ui-bg, rgba(10, 10, 20, 0.4));
backdrop-filter: blur(12px);
border: 1px solid var(--line, #3a3a50);
```

#### 5. Italian to English Translations

Translated all notification messages from Italian to English:

| File | Italian | English |
|------|---------|---------|
| `backend/src/services/RoomManager.js` | "Un altro utente si è unito - le voci virtuali vengono sostituite" | "Another user joined - virtual voices are being replaced" |
| `backend/src/api/handlers/AuthHandler.js` | "La stanza X era piena. Sei stato reindirizzato a Y" | "Room X was full. You have been redirected to Y" |
| `frontend/src/services/NotificationService.js` | "Utenti virtuali attivati" | "Virtual users activated" |

#### 6. User Count Icon Removal

Removed the 👥 emoji from user count display:

**File:** `frontend/src/services/UIManager.js`
```javascript
// Before
let displayText = `👥 ${this.userCount} ${userText}`

// After
let displayText = `${this.userCount} ${userText}`
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/styles.css` | `--line: #3a3a50`, slider padding 52px, immersive minibar line layout |
| `frontend/rooms.html` | `--line: #3a3a50`, slider padding 52px |
| `frontend/index.html` | Immersive controls with node-btn-wrapper structure |
| `frontend/src/landing/main.js` | Immersive minibar Start/Stop label updates |
| `frontend/src/services/NotificationService.js` | Centered positioning, unified background, English translation |
| `frontend/src/services/UIManager.js` | Removed 👥 emoji from user count |
| `backend/src/services/RoomManager.js` | English translation for user join message |
| `backend/src/api/handlers/AuthHandler.js` | English translation for redirect message |

---

## Entry #140 - Virtual Cursor Visibility Fix & Visual Enhancements

**Date**: 2026-01-19
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed virtual user cursors not appearing immediately when Play is pressed, refined NeonNebulaSystem parameters (density, lifecycle), and enhanced trail rendering for visibility on dark background.

---

### Problem Statement

1. **Virtual cursors not visible on Play**: Cursors only appeared after virtual users made a gesture, not immediately when activating
2. **Nebula density/lifecycle tuning**: User requested sparser nebulas with faster, variable lifecycles
3. **Trails not visible**: Trail halos were too faint on the new dark canvas background

---

### Root Cause Analysis

#### Virtual Cursor Issue

The `virtual-users-activated` handler called `visualService.addVirtualUser?.(userId, color)` but this method doesn't exist in GenerativeVisualService. The cursors were added to CursorManager (which no longer renders) but never to SpringMeshNetwork (which does render).

```javascript
// Before - method doesn't exist
this.visualService.addVirtualUser?.(user.userId, user.color)

// Cursors only appeared when virtual-cursors event fired with position updates
```

---

### Solution

#### 1. Virtual Cursor Immediate Visibility

Replaced non-existent `addVirtualUser` with `updateCursorPosition` using initial center position (0.5, 0.5):

**Files:** `frontend/src/main.js`, `frontend/src/handlers/SocketEventCoordinator.js`
```javascript
// After - initializes cursor at center position
this.visualService.updateCursorPosition?.(user.userId, 0.5, 0.5, user.color)
```

#### 2. NeonNebulaSystem Parameter Refinements

**File:** `frontend/src/services/visual/NeonNebulaSystem.js`

| Parameter | Before | After |
|-----------|--------|-------|
| `blobCount` | 3 | 2 |
| `cycleDuration` | Fixed 5.4s | Variable 2-4s per blob |
| `fadeInDuration` | 1.2s | Variable (cycleDuration - 0.2s) / 2 |
| `aliveDuration` | 3s | 0.2s (brief peak) |
| `fadeOutDuration` | 1.2s | Variable (cycleDuration - 0.2s) / 2 |

Each blob now has independent random lifecycle duration between 2-4 seconds, with a brief 0.2s peak visibility at full opacity.

```javascript
// Random lifecycle per blob
const cycleDuration = this.minCycleDuration + Math.random() * (this.maxCycleDuration - this.minCycleDuration)
const fadeDuration = (cycleDuration - this.aliveDuration) / 2

return {
  cycleDuration,
  fadeInDuration: fadeDuration,
  fadeOutDuration: fadeDuration,
  // ...
}
```

#### 3. Enhanced Trail Rendering

**File:** `frontend/src/landing/main.js`

| Property | Before | After |
|----------|--------|-------|
| Size | 5-20px | 8-28px |
| Alpha | `alpha * 0.8` | `alpha * 1.2` (outer), `alpha * 1.5` (core) |
| Shadow blur | `size * 0.6` | `size * 1.5` (outer), `size * 0.5` (core) |
| Layers | Single | Double (outer glow + inner bright core) |

```javascript
// Neon glow effect - brighter for dark background
this.trailCtx.globalAlpha = Math.min(1, alpha * 1.2)
this.trailCtx.shadowBlur = size * 1.5

// Outer glow layer
this.trailCtx.arc(x, y, size * 0.8, 0, Math.PI * 2)
this.trailCtx.fill()

// Inner bright core
this.trailCtx.globalAlpha = Math.min(1, alpha * 1.5)
this.trailCtx.shadowBlur = size * 0.5
this.trailCtx.arc(x, y, size * 0.3, 0, Math.PI * 2)
this.trailCtx.fill()
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/main.js` | Fixed `virtual-users-activated` to use `updateCursorPosition(0.5, 0.5)` |
| `frontend/src/handlers/SocketEventCoordinator.js` | Same fix for `virtual-users-activated` handler |
| `frontend/src/services/visual/NeonNebulaSystem.js` | Reduced blobCount to 2, variable 2-4s lifecycle per blob, 0.2s peak |
| `frontend/src/landing/main.js` | Enhanced trail rendering with double-layer neon glow effect |

---

### Version

v1.0.185

---

## Entry #141 - UI Skills Assessment Follow-up (Post-Restyling)

**Date**: 2026-01-19
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Re-ran UI Skills assessment after the deep restyling (dark mode minimal with canvas as page background). Fixed remaining violations: letter-spacing, 100vh→100dvh, interaction transitions, and slider thumb glow.

---

### Assessment Sources

| Source | Focus Area |
|--------|------------|
| rams.ai | Accessibility WCAG 2.1, visual consistency |
| interfaces.rauno.me | Typography, motion, touch handling, performance |
| uiskills.dev | Opinionated constraints (no gradients, no letter-spacing, animations ≤200ms) |

---

### Compliance After Restyling (Already OK)

- [x] NO purple gradients (uses #69b3ff blue)
- [x] NO multicolor gradients
- [x] Accent color limited (blue + node colors)
- [x] text-wrap: balance for headings
- [x] text-wrap: pretty for body
- [x] -webkit-font-smoothing: antialiased
- [x] text-rendering: optimizeLegibility
- [x] Box-shadow focus rings
- [x] Safe-area-inset handling
- [x] @media (hover: hover) patterns
- [x] Input font-size 16px (iOS zoom prevention)
- [x] font-variant-numeric: tabular-nums on metric values
- [x] prefers-reduced-motion disables particle animations

---

### Violations Fixed

#### 1. Letter-Spacing Removed (UI Skills: "NEVER modify letter-spacing")

Removed all 7 occurrences:

| File | Line | Value | Context |
|------|------|-------|---------|
| styles.css | 251 | 0.08em | Uppercase headings |
| styles.css | 263 | 0.05em | Subtext |
| styles.css | 475 | 0.1em | Monospace labels |
| styles.css | 555 | 0.1em | Monospace labels |
| styles.css | 854 | 0.1em | Monospace labels |
| styles.css | 973 | 0.1em | Monospace labels |
| styles.css | 1118 | 0.1em | Monospace labels |

#### 2. Viewport Units (UI Skills: "NEVER use h-screen, use h-dvh")

Replaced `100vh` with `100dvh` for layout heights:

| File | Line | Change |
|------|------|--------|
| styles.css | 77 | `min-height: 100vh` → `min-height: 100dvh` |
| styles.css | 645 | `height: 100vh` → `height: 100dvh` |
| rooms.html | 98 | `height: 100vh` → `height: 100dvh` |

Note: `translateY(100vh)` in particle animations kept as-is (animation, not layout).

#### 3. Interaction Feedback Timing (UI Skills: "NEVER exceed 200ms")

Reduced transitions for interaction feedback:

| Element | Before | After |
|---------|--------|-------|
| .remote-cursor (left, top) | 0.5s | 0.15s |
| .remote-cursor (opacity) | 0.3s | 0.2s |
| .metric-card box-shadow | 0.3s | 0.2s |
| #mapping-explainer | 0.3s | 0.2s |
| .handle-icon | 0.3s | 0.2s |
| .landing-overlay | 0.3s | 0.2s |
| .immersive-toggle | 0.3s | 0.2s |
| .immersive-controls | 0.3s | 0.2s |
| immersive #status-message | 0.3s | 0.2s |

Note: Decorative `.point-orbit` transform kept at 0.3s (ambient animation, not interaction).

#### 4. Slider Thumb Glow Removed (UI Skills: "NEVER use glow effects as primary affordances")

Removed `box-shadow: 0 0 6px var(--accent)` from interactive slider thumbs:

| Selector | Line |
|----------|------|
| `input[type="range"]::-webkit-slider-thumb` | 1005 |
| `input[type="range"]::-moz-range-thumb` | 1020 |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/styles.css` | Letter-spacing (7x), 100dvh (2x), transitions (8x), slider glow (2x) |
| `frontend/rooms.html` | 100dvh (1x) |

---

### Verification Commands

```bash
# Letter-spacing (should return 0)
grep -c "letter-spacing" frontend/styles.css

# 100vh remaining (only animation translateY)
grep -n "100vh" frontend/styles.css

# Slider glow (should return 0)
grep -n "0 0 6px" frontend/styles.css
```

---

### Version

v1.0.186

---

## Entry #142 - Electric Triad Color Palette & Attractor Hue Animation

**Date**: 2026-01-19
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Implemented neon sci-fi color palette "Electric Triad" (magenta/cyan/viola) across the entire codebase. Ensured metric colors are exclusive and never overlap with real user colors using hue-based separation. Added interaction-driven hue animation to strange attractors using the existing `spatialDensity` metric.

---

### Color Palette: Electric Triad

#### Metric Colors (EXCLUSIVE - Virtual Users)
| Source | Color | Hex | Hue |
|--------|-------|-----|-----|
| Wikipedia | Magenta | `#ff2d92` | 330° |
| HackerNews | Cyan | `#00d4ff` | 195° |
| GitHub | Viola | `#a855f7` | 270° |

#### Real User Colors (Intermediate Hues ~30° gap from metrics)
| Color | Hex | Hue |
|-------|-----|-----|
| Verde lime | `#a3e635` | 80° |
| Arancio | `#fb923c` | 30° |
| Teal | `#2dd4bf` | 165° |
| Giallo | `#facc15` | 50° |
| Rosa soft | `#f472b6` | 350° |
| Azzurro | `#38bdf8` | 200° |
| Verde neon | `#22c55e` | 140° |

#### UI Accent (Non-metric)
| Element | Hex | Usage |
|---------|-----|-------|
| Accent | `#2dd4bf` | Links, sliders, focus rings |
| Accent hover | `#5eead4` | Hover states |

#### Logo
| Mode | Color | Hex |
|------|-------|-----|
| Light | Indigo | `#6366f1` |
| Dark | Indigo chiaro | `#818cf8` |

---

### Attractor Hue Animation

Added interaction-driven color animation to `PrecomputedAttractorSystem` using the existing `spatialDensity` metric (0-1):

| spatialDensity | Hue | Color | Meaning |
|----------------|-----|-------|---------|
| 0 (spread) | 195° | Cyan | Cursors dispersi |
| 0.5 | 262° | Viola | Moderatamente raggruppati |
| 1 (clustered) | 330° | Magenta | Cursors tutti insieme |

**Implementation:**
- Zero additional computation - reuses existing metric
- Smooth hue transition with wraparound handling (350°→30° passes through 0°)
- `hueTransitionSpeed: 0.015` for gradual color shifts

---

### Files Modified

#### Backend
| File | Changes |
|------|---------|
| `backend/src/constants/colors.js` | Single source of truth for all colors |

#### Frontend - CSS/HTML
| File | Changes |
|------|---------|
| `frontend/styles.css` | `--node-1/2/3`, `--accent`, glow rgba values, link styles |
| `frontend/rooms.html` | Inline CSS variables, spinner, sliders |
| `frontend/index.html` | Link styles |
| `frontend/how-it-works.html` | Link styles, borders |
| `frontend/technical-appendix.html` | Link styles, borders |

#### Frontend - JavaScript
| File | Changes |
|------|---------|
| `frontend/src/main.js` | Fallback colors |
| `frontend/src/landing/main.js` | Fallback colors, trail halo |
| `frontend/src/components/SettingsPanel.js` | Fallback colors, rgba values |
| `frontend/src/services/NotificationService.js` | Fallback colors |
| `frontend/src/landing/MetricsToGestureAdapter.js` | Virtual user colors |
| `frontend/src/services/AudioService.js` | Color pools |
| `frontend/src/services/audio/GestureAudioMapper.js` | Color pools |

#### Frontend - Visual Systems
| File | Changes |
|------|---------|
| `frontend/src/services/visual/NeonNebulaSystem.js` | Full 0-360° spectrum, compositionBias |
| `frontend/src/services/visual/PrecomputedAttractorSystem.js` | Hue animation via spatialDensity |
| `frontend/src/services/GenerativeVisualService.js` | Forward metrics to attractors |

#### Frontend - Assets
| File | Changes |
|------|---------|
| `frontend/webarmonium-logo.svg` | Indigo W, Electric Triad waves |
| `frontend/favicon.svg` | Adaptive indigo with prefers-color-scheme |
| `frontend/apple-touch-icon.png` | Regenerated from SVG |
| `frontend/favicon-32x32.png` | Regenerated from SVG |
| `frontend/webarmonium-logo-512.png` | Regenerated from SVG |

---

### Key Design Decisions

1. **Metric/User Color Separation**: Metrics occupy specific hues (330°/195°/270°), users occupy intermediate hues with ~30° minimum gap. This prevents confusion between system indicators and user cursors.

2. **Teal Accent**: Changed from viola (`#a855f7`) to teal (`#2dd4bf`) to avoid overlap with GitHub metric color.

3. **Full Spectrum Nebula**: `noiseToHue()` now returns 0-360° instead of excluding purple range, enabling warm colors (red, orange, yellow) in addition to cool colors.

4. **Attractor Color Source**: Uses `spatialDensity` (room interaction metric) rather than composition type, creating visual feedback for user clustering behavior.

5. **Logo Adaptive Colors**: Favicon uses CSS `prefers-color-scheme` for light/dark browser themes.

---

### Version

v1.0.187

---

## Entry #143 - SVG Circular Meters & Parallax Flash Effect

**Date**: 2026-01-19
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Converted metric card circular meters from CSS conic-gradient to SVG for better antialiasing, fixed animation issues, removed all glow effects, and implemented 3D parallax pop-out effect for gesture triggers.

---

### Problem Statement

After UI restyling, circular meters in metric cards were not animated:
1. **Animation not working**: `--rotation` CSS property was set on wrong element (`.orbit` instead of `.point-node`)
2. **Pixelated rendering**: CSS conic-gradient has poor antialiasing
3. **Wrong start position**: Meters started at 3 o'clock instead of 6 o'clock (bottom)
4. **Glow effects**: User requested removal of all glow effects
5. **Flash not visible**: Card parallax animation conflicted with fade-in animation

---

### Solution

#### 1. SVG-Based Meters (Antialiasing Fix)

Replaced CSS conic-gradient with SVG circles using `stroke-dasharray`/`stroke-dashoffset`:

**File:** `frontend/index.html`
```html
<!-- Before -->
<div class="point-node"><div class="orbit"></div><div class="point-core"></div></div>

<!-- After -->
<svg class="meter-svg" viewBox="0 0 52 52">
  <circle class="meter-bg" cx="26" cy="26" r="20"/>
  <circle class="meter-progress" cx="26" cy="26" r="20"/>
</svg>
```

**File:** `frontend/styles.css`
```css
.meter-svg {
  width: 52px;
  height: 52px;
  transform: rotate(90deg); /* Start at 6 o'clock (bottom) */
}

.meter-progress {
  fill: none;
  stroke: var(--cluster-color, var(--accent));
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 125.66; /* 2 * PI * 20 */
  stroke-dashoffset: 125.66;
  transition: stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
```

**File:** `frontend/src/landing/DashboardUI.js`
```javascript
// circumference = 2 * PI * radius (20) = 125.66
const circumference = 125.66
const offset = circumference * (1 - normalized / 100)
progressCircle.style.strokeDashoffset = offset
```

#### 2. Glow Effects Removed

Removed all glow/box-shadow effects:
- `.metric-card.flash` box-shadow
- `.cluster-node` box-shadow
- `.data-point.flash .meter-svg` drop-shadow
- `--cluster-glow` CSS variables

#### 3. Parallax 3D Pop-Out Effect

Replaced glow with 3D transform on gesture trigger:

**File:** `frontend/styles.css`
```css
.metric-card.flash {
  transform: perspective(800px) translateZ(25px) scale(1.02) !important;
}

.data-point.flash {
  transform: perspective(500px) translateZ(15px) scale(1.1) !important;
}
```

Note: `!important` required to override `animation: metric-fade-in ... forwards` which locks the final transform state.

#### 4. Hover Border Color Removed

Removed `.metric-card:hover` border color change per user request.

---

### Technical Details

| Aspect | Before | After |
|--------|--------|-------|
| Meter rendering | CSS conic-gradient | SVG stroke-dashoffset |
| Antialiasing | Poor (pixelated) | Native vector AA |
| Start position | Variable | 6 o'clock (bottom) |
| Flash effect | box-shadow glow | 3D parallax transform |
| Animation conflict | fade-in overrides flash | `!important` fix |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/index.html` | Replaced div meters with SVG circles (12 meters total) |
| `frontend/styles.css` | SVG meter styles, removed glow effects, parallax transforms, removed hover border |
| `frontend/src/landing/DashboardUI.js` | Changed to animate `strokeDashoffset` instead of CSS custom property |

---

### Version

v1.0.188

---

## Entry #144 - NeonNebulaSystem Resolution Improvement

**Date**: 2026-01-19
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Improved the visual quality of NeonNebulaSystem nebulas which appeared blocky/pixelated due to the 16px cell grid, without significant performance impact. Implemented low-resolution buffer rendering with scale-up for efficient blur effect.

---

### Problem Statement

The NeonNebulaSystem rendered nebulas using a cell-based approach with `cellSize=16px`, creating a visible blocky/pixelated appearance. The grid pattern was especially noticeable in the nebula gradients.

| Issue | Description |
|-------|-------------|
| Blocky appearance | 16px cell grid created visible square artifacts |
| Grid pattern | Regular spacing made nebulas look artificial |
| Hard edges | `rect()` calls produced harsh pixel boundaries |

---

### Solution

#### 1. Low-Resolution Buffer Rendering

Instead of expensive per-cell blur operations, render the entire nebula layer to a 1/4 resolution offscreen buffer, then scale up to full canvas size. Bilinear interpolation during scale-up provides natural blur effect "for free".

**Constructor additions:**
```javascript
// Offscreen buffer for low-res rendering
this.buffer = null
this.bufferScale = 0.25  // Render at 1/4 resolution for blur effect
this.lastBufferWidth = 0
this.lastBufferHeight = 0
```

**Render method:**
```javascript
render(p) {
  if (this.performanceMode === 'disabled') return

  const scale = this.performanceMode === 'degraded' ? 0.2 : this.bufferScale
  const bufferWidth = Math.floor(p.width * scale)
  const bufferHeight = Math.floor(p.height * scale)

  // Create or resize buffer if needed
  if (!this.buffer || this.lastBufferWidth !== bufferWidth || ...) {
    this.buffer = p.createGraphics(bufferWidth, bufferHeight)
    ...
  }

  // Render blobs to low-res buffer
  this.buffer.clear()
  for (const blob of this.blobs) {
    this.renderBlobToBuffer(this.buffer, blob, scale)
  }

  // Scale up with bilinear interpolation = free blur
  p.image(this.buffer, 0, 0, p.width, p.height)
}
```

#### 2. Jitter to Break Grid Pattern

Added noise-based position jitter to each cell to eliminate the regular grid appearance:

```javascript
const jitterX = (p.noise(noiseX * 2, noiseY * 2) - 0.5) * cellSize * 0.8
const jitterY = (p.noise(noiseX * 2 + 100, noiseY * 2 + 100) - 0.5) * cellSize * 0.8
const jitteredX = x + jitterX
const jitteredY = y + jitterY
```

#### 3. Performance Optimizations

- **40% cell skip**: Randomly skip ~40% of cells based on noise threshold
- **2-layer rendering**: Simplified from 4 layers to 2 for buffer rendering
- **Ellipse instead of rect**: Better antialiasing with `ellipse()` calls

```javascript
// Skip ~40% of cells for performance
if (skipNoise < 0.4) continue

// 2 ellipse layers per cell (simplified from 4)
for (let layer = 0; layer < 2; layer++) {
  const layerAlpha = alpha * (1 - layer * 0.4)
  const layerSize = size * (1 + layer * 0.3)
  p.fill(hue, sat, light, layerAlpha)
  p.ellipse(jitteredX, jitteredY, layerSize, layerSize)
}
```

#### 4. Softer Color Settings

Adjusted color parameters for more ethereal appearance:

```javascript
this.baseSaturation = 80  // Reduced for softer colors
this.baseLightness = 60   // Slightly dimmer
this.baseAlpha = 35       // Ethereal but visible
```

---

### Technical Details

| Aspect | Before | After |
|--------|--------|-------|
| Rendering | Direct to canvas | 1/4 resolution buffer + scale-up |
| Cell shape | `rect()` (hard edges) | `ellipse()` (antialiased) |
| Grid pattern | Visible | Broken by noise jitter |
| Layers per cell | 4 | 2 (buffer provides additional blur) |
| Cell skip | None | ~40% random skip |
| Blur method | None / CSS filter | Bilinear interpolation (free) |

**Performance comparison:**
- CSS `filter: blur(8px)` - expensive GPU operation every frame
- Buffer scale-up - single `p.image()` call with built-in interpolation

---

### Approaches Tried and Rejected

1. **Concentric gradient rings** - Looked artificial, not organic
2. **Scattered soft spheres** - Appeared as offset circles, not cohesive blobs
3. **Cluster of noise-distorted spheres** - Too complex, performance issues
4. **CSS blur filter** - Worked visually but too expensive for resources

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/visual/NeonNebulaSystem.js` | Buffer system, jitter, cell skip, 2-layer rendering, color settings |

---

### Version

v1.0.189

---

## Entry #145 - Room Audio Auto-Start & Label Fix

**Date**: 2026-01-19
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed two issues in rooms: audio auto-starting without user interaction, and play/stop button label not updating.

---

### Problems

1. **Audio auto-start**: When joining a room (via button or tech appendix link), audio would start automatically even without pressing play
2. **Label not updating**: The "Start"/"Stop" label under the play button in rooms didn't update based on state (unlike index page)

---

### Solution

#### 1. Disabled Audio Auto-Start

Commented out `attemptAutoStartAudio()` call in `init()`:

**File:** `frontend/src/main.js` (line 85)
```javascript
// Audio auto-start REMOVED - user must explicitly click play button
// this.attemptAutoStartAudio()
```

#### 2. Added Label Update to toggleAudio()

Added label update logic matching the landing page behavior:

**File:** `frontend/src/main.js` (toggleAudio method)
```javascript
// When starting audio
const wrapper = button.closest('.node-btn-wrapper')
const label = wrapper?.querySelector('.node-label')
if (label) label.textContent = 'Stop'

// When stopping audio
const wrapper = button.closest('.node-btn-wrapper')
const label = wrapper?.querySelector('.node-label')
if (label) label.textContent = 'Start'
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/main.js` | Commented out `attemptAutoStartAudio()`, added label updates in `toggleAudio()` |

---

### Version

v1.0.190

---

## Entry #146 - Mobile Navigation & Explainer Toggle Button

**Date**: 2026-01-19
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Added always-visible explainer toggle button with hover-to-expand behavior on desktop and tap on mobile. Fixed mobile responsive issues to ensure all UI elements are accessible on small screens.

---

### Problem Statement

After recent UI restyling, mobile navigation needed improvements:

1. **Explainer not easily accessible**: Edge-hover behavior didn't work well on mobile
2. **UI elements inaccessible on mobile**: Transparent backgrounds caused overlap issues
3. **Immersive toggle hidden on touch devices**: Relied on hover which doesn't work on touch

---

### Solution

#### 1. Explainer Toggle Button - Always Visible

Changed the explainer handle from a hidden element to a floating pill button at bottom-left:

**File:** `frontend/styles.css`
```css
.explainer-handle {
  display: flex; /* Visible on all screen sizes */
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  z-index: 200;
  padding: 0.75rem 1.25rem;
  border: 2px solid var(--muted);
  border-radius: 25px;
}
```

#### 2. Hover-to-Expand Behavior (Desktop)

Added hover interaction for non-touch devices:

**File:** `frontend/src/landing/main.js`
```javascript
if (!isTouchDevice) {
  handle.addEventListener('mouseenter', () => {
    clearAutoHide()
    showExplainer()
  })

  handle.addEventListener('mouseleave', () => {
    if (!isPinned) {
      startAutoHide()
    }
  })
}
```

#### 3. Click/Tap to Pin Panel Open

Clicking the button toggles a "pinned" state that keeps the panel open:

```javascript
handle.addEventListener('click', (e) => {
  e.stopPropagation()
  isPinned = !isPinned
  clearAutoHide()

  if (isPinned) {
    showExplainer()
  } else {
    hideExplainer()
  }
})
```

#### 4. Mobile Backdrop Overlay

On mobile, when explainer is open, a dark backdrop hides the rest of the UI:

**File:** `frontend/styles.css`
```css
@media (max-width: 768px) {
  #mapping-explainer::before,
  .landing-explainer::before {
    content: '';
    position: fixed;
    inset: 0;
    background: rgba(2, 2, 8, 0.9);
    z-index: -1;
  }
}
```

#### 5. Explainer Panel as Floating Popup

Changed from full-width bottom bar to floating popup panel:

```css
#mapping-explainer,
.landing-explainer {
  position: fixed;
  bottom: 4rem; /* Above the floating button */
  left: 1rem;
  max-width: 400px;
  border-radius: 16px;
  backdrop-filter: blur(20px);
}
```

#### 6. Mobile Responsive Fixes

- Made landing overlay scrollable on mobile
- Added padding at bottom for floating buttons
- Made immersive toggle always visible on touch devices
- Made controls bar horizontally scrollable on small screens
- Added 44px minimum touch targets per iOS guidelines

**File:** `frontend/styles.css`
```css
@media (max-width: 768px) {
  .landing-overlay {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .landing-overlay main {
    padding-bottom: 5rem;
  }
}

@media (hover: none), (max-width: 768px) {
  body:not(.immersive-mode) .immersive-toggle {
    opacity: 1;
    pointer-events: auto;
  }
}
```

---

### Behavior Summary

| Platform | Explainer Behavior |
|----------|-------------------|
| Desktop (mouse) | Hover to preview, click to pin open |
| Touch device | Tap to toggle open/closed |
| Mobile | Dark backdrop hides UI when open |
| Both | Click outside or ESC to close |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/styles.css` | Floating button style, popup panel, mobile backdrop, touch target sizes, immersive toggle visibility |
| `frontend/src/landing/main.js` | Rewrote `_setupCollapsibleExplainer()` with hover/click/pin logic |

---

### Version

v1.0.191

---

## Entry #147 - Unified Button Styles & Mobile User Count Fix

**Date**: 2026-01-19
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed two UI inconsistencies from previous session: unified all play button styles to match `.node-btn.primary`, and removed verbose mobile overlay in favor of the pill-shaped user count.

---

### Changes

#### 1. Unified Play Button Styles

All play buttons now match `.node-btn.primary` style from index.html:

| State | Color |
|-------|-------|
| Default | `--muted` (#3a3a50) border, `--dim` (#5a5a70) text |
| Hover | `--light` (#9090a8) |
| Playing | `--node-1` (#ff2d92) magenta |

**Files modified:**
- `frontend/styles.css`: Changed `.audio-toggle` from teal accent to gray
- `frontend/src/services/UIManager.js`: Changed mobile central button from teal to gray

#### 2. Mobile User Count Simplified

Removed the verbose `mobileRoomInfoOverlay` (which showed both user count AND room ID) in favor of keeping the pill-shaped `.user-count` visible on mobile.

| Before | After |
|--------|-------|
| Overlay with "1 user" + "Room: xxx" | Pill badge with "1 user" only |
| 12px border-radius | 20px border-radius (pill) |
| Two elements on mobile | Single element, same as desktop |

**Files modified:**
- `frontend/styles.css`: Removed CSS that hid `.user-count` on mobile
- `frontend/src/services/UIManager.js`: Removed `_createMobileRoomInfoOverlay()`, `_syncMobileOverlay()`, and related code

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/styles.css` | `.audio-toggle` gray style, removed mobile `.user-count` hide rule |
| `frontend/src/services/UIManager.js` | Mobile central button gray, removed mobileRoomInfoOverlay |
| `frontend/rooms.html` | Cache version bumps (v14, v15) |

---

### Version

v1.0.192

---

## Entry #148 - Rooms Cleanup & Mobile Theme Unification

**Date**: 2026-01-19
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed corrupted rooms.html file, resolved explainer overlap issue on desktop, and unified mobile button themes from old blue style to the new gray/accent design system.

---

### Changes

#### 1. Fixed Corrupted rooms.html

The rooms.html file contained ~870 lines of duplicate/leftover CSS and HTML from lines 251-1123. This was residual content from a previous style unification effort.

**Before:** 1292 lines with duplicate `<style>` blocks and corrupted markup
**After:** 419 lines of clean HTML

**Commit:** `f5d840d`

---

#### 2. Fixed Explainer Overlapping Metric Cards (Desktop)

User reported the explainer box was expanding vertically and overlapping the metric cards on desktop. The issue was on the Y-axis, not Z-axis.

**Solution:** Added `top: 60%` constraint to prevent the explainer from expanding above the metric cards area:

**File:** `frontend/styles.css`
```css
#mapping-explainer,
.landing-explainer {
  top: 60%; /* Limit top edge to not overlap with metrics cards */
}

@media (max-width: 768px) {
  #mapping-explainer,
  .landing-explainer {
    top: auto; /* Override desktop top constraint */
  }
}
```

**Commit:** `38e1832`

---

#### 3. Updated Mobile Room Buttons to Unified Theme

The hamburger menu button and mobile bottom sheet were still using the old blue theme (`rgba(0, 212, 255, 0.9)`). Updated to match the unified design system:

| Element | Old Style | New Style |
|---------|-----------|-----------|
| Hamburger button bg | Blue accent | `rgba(10, 10, 20, 0.55)` transparent |
| Hamburger border | None | `2px solid #3a3a50` |
| Hamburger (open) | Blue bg | Gray bg + `#2dd4bf` accent border |
| Bottom sheet | Blue tint | Unified gray with blur backdrop |

**File:** `frontend/src/services/UIManager.js`
- Updated `_createMobileMenuButton()`
- Updated `openMobileMenu()` / `closeMobileMenu()`
- Updated `_createMobileBottomSheet()` styling

**Commit:** `c67d02a`

---

#### 4. Updated Settings Apply Button Style

The Apply button in settings panel was using filled accent background, inconsistent with other buttons. Changed to transparent style with accent border:

**File:** `frontend/src/components/SettingsPanel.js`
```css
.settings-apply {
  background: transparent;
  border: 2px solid var(--accent, #2dd4bf);
  color: var(--accent, #2dd4bf);
}
.settings-apply:hover {
  background: rgba(45, 212, 191, 0.1);
  border-color: var(--accent-hover, #5eead4);
}
```

**Commit:** `0f46235`

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/rooms.html` | Removed ~870 lines of corrupted content |
| `frontend/styles.css` | Added `top: 60%` constraint for desktop explainer |
| `frontend/src/services/UIManager.js` | Unified mobile hamburger and bottom sheet theme |
| `frontend/src/components/SettingsPanel.js` | Transparent Apply button style |

---

### Version

v1.0.193

---

## Entry #149 - Mobile UI Unification & Stop Icon Redesign

**Date**: 2026-01-20
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Unified mobile UI across index and rooms pages. Replaced ugly Unicode stop icon with consistent SVG. Removed redundant hamburger menu system from rooms (~450 lines), using same UI bar as index. Fixed various mobile layout issues.

---

### Changes

#### 1. SVG Stop Icon Replacement

Replaced the ugly Unicode `■` stop icon with a consistent SVG that matches the UI style across all pages (index, rooms) and modes (desktop, mobile, immersive).

**SVG Icon:**
```html
<svg width="1em" height="1em" viewBox="0 0 16 16" fill="currentColor">
  <rect x="3" y="3" width="10" height="10" rx="1.5"/>
</svg>
```

**Files modified:**
- `frontend/index.html`: Mobile UI bar stop icon
- `frontend/src/main.js`: Immersive mode minibar stop icon
- `frontend/src/services/UIManager.js`: Rooms UI bar stop icon
- `frontend/src/landing/DashboardUI.js`: Landing page stop icon

---

#### 2. Removed Mobile Hamburger Menu from Rooms

The hamburger menu in rooms was redundant. Removed ~450 lines of code and now rooms uses the same UI bar as index on mobile.

**Removed methods from UIManager.js:**
- `_createMobileMenuButton()`
- `_createMobileBottomSheet()`
- `_createMobileCentralStartButton()`
- `toggleMobileMenu()`, `openMobileMenu()`, `closeMobileMenu()`

**Result:** Clean mobile UI with play/volume/settings buttons in a centered row below the logo.

---

#### 3. Restored Info Button for Instructions Toggle

Re-added the "?" info button that was accidentally removed. Simplified implementation with 44px round button positioned bottom-left, toggles popup with 5s auto-hide.

**New methods in UIManager.js:**
- `_createMobileInfoButton()`
- `_createMobileInfoPopup()`
- `_toggleMobileInfoPopup()`
- `_closeMobileInfoPopup()`

---

#### 4. Mobile Layout Fixes

| Issue | Fix |
|-------|-----|
| Room controls on same row as logo | Added `padding-top: 3rem` to room-interface |
| Logo/usercount overlap | Kept absolute positioning for logo and usercount |
| About/Immersive misaligned | Set both to `bottom: 1rem` |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/index.html` | SVG stop icon, cache version bump |
| `frontend/src/main.js` | SVG stop icon for immersive minibar |
| `frontend/src/services/UIManager.js` | Removed hamburger menu (~450 lines), SVG stop icon, restored info button |
| `frontend/src/landing/DashboardUI.js` | SVG stop icon |
| `frontend/styles.css` | Mobile room controls, layout fixes, About button alignment |

---

### Version

v1.0.194

---

## Entry #150 - Immersive Mode for Rooms

**Date**: 2026-01-20
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Added immersive/fullscreen mode to rooms page, matching the index page behavior but with browser Fullscreen API on desktop.

---

### Changes

#### 1. New ImmersiveManager Service

Created `frontend/src/services/ImmersiveManager.js` to handle immersive mode:
- Desktop: Browser Fullscreen API with vendor prefixes (Safari/webkit support)
- Mobile: Hides UI only (no fullscreen API)
- Auto-hide minibar after 3 seconds
- ESC key to exit
- Proper cleanup of all event listeners

#### 2. HTML Elements Added to rooms.html

- `.immersive-toggle` button (bottom-right corner)
- `.immersive-controls` minibar with Play/Stop and Exit buttons
- `.fullscreen-esc-notice` notification (desktop only)

#### 3. CSS Rules Added to styles.css

- Room elements hidden in immersive mode (`.room-interface`, `.instructions`, `.mobile-info-btn`)
- Fullscreen ESC notice styling

#### 4. main.js Integration

- ImmersiveManager initialization after UIManager
- `body.audio-playing` class sync in `toggleAudio()` for play/stop icon
- Cleanup call in `destroy()` method

---

### Behavior

| | Desktop | Mobile |
|---|---|---|
| Trigger | Hover bottom-right corner | Always visible |
| Fullscreen | Browser API (vendor-prefixed) | No |
| ESC Notice | Shows 3 sec | No |
| Minibar | Auto-hide 3 sec | Auto-hide 3 sec |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/ImmersiveManager.js` | **NEW** - Immersive mode service |
| `frontend/rooms.html` | HTML elements, script include |
| `frontend/styles.css` | Room immersive hiding rules, ESC notice |
| `frontend/src/main.js` | Initialize ImmersiveManager, audio-playing sync, cleanup |

---

### Version

v1.0.195

---

## Entry #151 - Fullscreen API for Index & Mobile Minibar Corner Tap

**Date**: 2026-01-20
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Added browser Fullscreen API to index page immersive mode (matching rooms behavior). Changed mobile immersive minibar to only appear on bottom-right corner tap instead of any touch.

---

### Changes

#### 1. Index Page Fullscreen API

Added same fullscreen behavior as rooms to `frontend/src/landing/main.js`:

- Request fullscreen with vendor prefixes (webkit/moz/ms) on enter
- Exit fullscreen on exit
- Fullscreen change handler to sync immersive state when user exits via browser ESC
- Show ESC notice for 3 seconds on desktop
- Added `fullscreen-esc-notice` HTML element to `index.html`

#### 2. Mobile Minibar Corner Tap

Changed touch behavior for immersive mode minibar:

| Platform | Before | After |
|----------|--------|-------|
| Desktop | Any mouse movement shows minibar | Same |
| Mobile | Any touch shows minibar | Only tap in bottom-right corner (100x100px) |

This prevents accidental minibar display when interacting with the canvas on mobile.

**Files:** `frontend/src/services/ImmersiveManager.js`, `frontend/src/landing/main.js`

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/index.html` | Added fullscreen-esc-notice element |
| `frontend/src/landing/main.js` | Fullscreen API, ESC notice, corner tap for mobile |
| `frontend/src/services/ImmersiveManager.js` | Corner tap for mobile touch handler |

---

### Version

v1.0.196

---

## Entry #152 - Light Mode Theme Support

**Date**: 2026-01-20
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Added comprehensive light mode theme support across all pages using CSS custom properties. The light mode uses the original dark mode colors reassigned to different elements (inverted approach), not new color values. Node colors and accent remain unchanged.

---

### Color Palette: Inverted Assignment

| Variable | Dark Mode | Light Mode |
|----------|-----------|------------|
| `--void` | `#020208` | `#e0e0f0` (was --bright) |
| `--deep` | `#0a0a14` | `#9090a8` (was --light) |
| `--surface` | `#14141f` | `#5a5a70` (was --dim) |
| `--dim` | `#5a5a70` | `#14141f` (was --surface) |
| `--light` | `#9090a8` | `#0a0a14` (was --deep) |
| `--bright` | `#020208` | `#020208` (was --void) |
| `--ui-bg` | `rgba(10, 10, 20, 0.55)` | `rgba(144, 144, 168, 0.85)` |
| `--success` | `#22c55e` | `#059669` (darker for contrast) |

**Unchanged colors (both themes):**
- `--accent`: `#2dd4bf`
- `--node-1`: `#ff2d92` (Wikipedia/Magenta)
- `--node-2`: `#00d4ff` (HackerNews/Cyan)
- `--node-3`: `#a855f7` (GitHub/Viola)

---

### Changes

#### 1. CSS Variables for Light Mode

Added `:root[data-theme="light"]` block in `styles.css` with inverted color assignments.

#### 2. UserSettings Theme Support

- Added `theme: 'dark'` to `DEFAULTS`
- Added `getEffectiveTheme()` method
- Added `applyTheme()` method with `theme-change` custom event

#### 3. Settings Panel Toggle

Added APPEARANCE group as first settings group with Light Mode toggle switch.

#### 4. Canvas Background Adaptation

Updated `GenerativeVisualService.js` to listen for `theme-change` events and switch p5.js background between `[2, 2, 8]` (dark) and `[224, 224, 240]` (light).

#### 5. Inline Theme Initialization

Added early inline script to all HTML pages to prevent flash of wrong theme:
- `index.html`
- `rooms.html`
- `how-it-works.html`
- `technical-appendix.html`

#### 6. Secondary Pages CSS Variables

Updated `technical-appendix.html` to use CSS variables instead of hardcoded colors for full theme support.

#### 7. Button Hover Fix

Added light mode specific hover rule using `--surface` for lighter hover effect (instead of `--bright` which is darker in light mode).

#### 8. Success Color Adaptation

Added `--success` CSS variable for green notification/indicator colors that adapts to theme for proper contrast.

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/styles.css` | `:root[data-theme="light"]` block, `--success` variable, button hover rule |
| `frontend/src/services/UserSettings.js` | Theme setting, `getEffectiveTheme()`, `applyTheme()` |
| `frontend/src/components/SettingsPanel.js` | APPEARANCE group with Light Mode toggle |
| `frontend/src/services/GenerativeVisualService.js` | Dynamic background color based on theme |
| `frontend/src/services/NotificationService.js` | Use `var(--success)` for success border |
| `frontend/index.html` | Inline theme initialization |
| `frontend/rooms.html` | Inline theme initialization |
| `frontend/how-it-works.html` | Inline theme initialization, footer border variable |
| `frontend/technical-appendix.html` | Full CSS variable conversion, inline theme initialization |

---

### Version

v1.1.01

---

## Entry #153 - NeonNebulaSystem Vibrant Multicolor Enhancement

**Date**: 2026-01-20
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Enhanced the NeonNebulaSystem to produce more varied and vibrant nebula colors. Previously, nebulas appeared mostly green-gray due to constrained color parameters. Now nebulas display full spectrum colors including warm tones (reds, oranges, pinks, magentas) with dynamic internal variation.

---

### Problem Statement

The nebula system was producing colors too similar (green-gray tones) due to:

1. **High bias weight (0.3)** - Pushed 30% of color toward fixed centers
2. **Fixed saturation/lightness** - No spatial variation within blobs
3. **Limited hue variation (±25°)** - Too narrow color spread
4. **Cool-tone bias clustering** - Centers at blue (200°) and green (120°)
5. **Reducing multipliers** - `sat * 0.8`, `light * 0.7` muted vibrancy

---

### Solution

Combined approach: **noise-based variation + revised parameters** with near-zero computational cost by reusing existing noise calculations.

---

### Changes

#### 1. Updated CONFIG Constants

| Parameter | Before | After |
|-----------|--------|-------|
| `BASE_SATURATION` | 80 | 90 |
| `BASE_LIGHTNESS` | 60 | 65 |
| `BASE_ALPHA` | 35 | 40 |
| `SATURATION_VARIATION` | - | 25 (new) |
| `LIGHTNESS_VARIATION` | - | 20 (new) |
| `HUE_VARIATION_RANGE` | 50 (hardcoded) | 80 |

#### 2. Redistributed Composition Bias

| Type | Before | After |
|------|--------|-------|
| ambient | 200°, 0.3 | 195°, 0.15 |
| riff | 30°, 0.3 | 20°, 0.15 |
| phrase | 280°, 0.3 | 310°, 0.15 |
| arpeggio | 120°, 0.3 | 85°, 0.15 |
| drone | 330°, 0.3 | 260°, 0.15 |

Weight reduced to 0.15 → 85% of color driven by noise for maximum variety.

#### 3. Per-Blob Hue Offset

Added `hueOffset` property (±30°) to `createBlob()` and `respawnBlob()` for inter-blob color diversity.

#### 4. Noise-Based Saturation/Lightness Variation

Reuses existing `texNoise` value to vary saturation and lightness spatially within each blob:

```javascript
const satVariation = (texNoise - 0.5) * C.SATURATION_VARIATION * 2
const lightVariation = (texNoise - 0.5) * C.LIGHTNESS_VARIATION * 2
const sat = Math.max(50, Math.min(100, this.baseSaturation + satVariation))
const light = Math.max(40, Math.min(80, this.baseLightness + lightVariation))
```

#### 5. Less Aggressive Multipliers

Changed rendering multipliers from 0.8/0.7 to 0.92/0.88 for more vibrant output.

---

### Resource Cost

| Change | Cost |
|--------|------|
| New CONFIG parameters | Zero |
| Bias redistribution | Zero |
| Per-blob hueOffset | 1 random() at respawn |
| Sat/light variation | 4 ops/cell (reuses texNoise) |
| Multiplier changes | Zero |

**Total: Near-zero** - No new noise calculations, no additional render passes.

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/visual/NeonNebulaSystem.js` | CONFIG constants, compositionBias, currentBias/targetBias, hueOffset in createBlob/respawnBlob, noise-based sat/light variation in renderBlobToBuffer |

---

### Version

v1.1.02

---

## Entry #154 - Theme Switching Bug Fix

**Date**: 2026-01-20
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed intermittent bug where switching from light mode back to dark mode would not always update the page, requiring a reload.

---

### Problem Statement

When switching themes (dark → light → dark), pages would sometimes not update correctly and required a page reload. The issue was intermittent.

---

### Root Cause

The CSS uses `:root[data-theme="light"]` for light mode overrides, with default `:root` styles (no attribute) for dark mode. However, `applyTheme('dark')` was setting `data-theme="dark"` instead of removing the attribute entirely.

This created an inconsistent state:
- Initial dark mode: no `data-theme` attribute
- After light→dark switch: `data-theme="dark"` attribute present

While CSS didn't have a `:root[data-theme="dark"]` selector (so light styles wouldn't apply), some components reading the attribute could behave inconsistently.

---

### Solution

Modified `UserSettings.applyTheme()` to remove the attribute for dark mode instead of setting it:

```javascript
static applyTheme (theme) {
  if (typeof document !== 'undefined') {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme } }))
  }
}
```

Also updated `initializeTheme()` functions in both `main.js` files to use `UserSettings.applyTheme()` instead of direct `setAttribute()`.

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/UserSettings.js` | `applyTheme()` now removes attribute for dark mode |
| `frontend/src/main.js` | `initializeTheme()` uses `UserSettings.applyTheme()` |
| `frontend/src/landing/main.js` | `initializeTheme()` uses `UserSettings.applyTheme()` |

---

### Version

v1.1.03

---

## Entry #155 - Theme Switching Complete Fix (p5.js Canvas)

**Date**: 2026-01-20
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Completed the theme switching fix by addressing Chrome CSS update issues and p5.js canvas idle state.

---

### Problem Statement

After Entry #154, theme switching still didn't work reliably. Some UI elements and the p5.js canvas wouldn't update when switching themes multiple times.

---

### Root Causes

1. **Chrome CSS Variable Updates**: Chrome doesn't always re-evaluate CSS variables when the `data-theme` attribute changes on dynamically styled elements.

2. **p5.js Canvas Idle State**: GenerativeVisualService pauses its draw loop when inactive (`isPaused = true`). When paused, the canvas wouldn't redraw with the new background color on theme change.

---

### Solution

1. **Stylesheet Toggle Hack**: Force Chrome to re-parse all CSS by toggling the `disabled` property on stylesheets:

```javascript
const styleSheets = document.querySelectorAll('style, link[rel="stylesheet"]')
styleSheets.forEach(sheet => { sheet.disabled = true })
setTimeout(() => {
  styleSheets.forEach(sheet => { sheet.disabled = false })
}, 0)
```

2. **Wake Canvas from Idle**: In GenerativeVisualService `_handleThemeChange()`, set `isPaused = false` and update `lastActivityTime` to wake the canvas from idle state.

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/UserSettings.js` | Added stylesheet toggle hack in `applyTheme()` |
| `frontend/src/services/GenerativeVisualService.js` | Wake canvas from idle in `_handleThemeChange()` |

---

### Version

v1.1.04

---

## Entry #156 - Audio State Machine Public API & Recovery Overlay Redesign

**Date**: 2026-01-21
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Added public API methods for AudioService state machine, improved error recovery, added conditional debug logging, and completely redesigned the audio recovery overlay to match the application UI style with dark/light mode support.

---

### Problem Statement

1. **Encapsulation violation**: External code directly accessed `_audioState` private property
2. **Stuck RESUMING state**: `resumeFromTap()` could leave audio in RESUMING state indefinitely if recovery failed
3. **Console spam**: 16+ `[AudioState]` log statements in production
4. **Inconsistent UI**: Recovery overlay used deprecated green button that didn't match app style
5. **Button state bug**: Navigating from index to rooms without pressing play showed "Stop" instead of "Start"

---

### Solution

**1. Public API for State Checks (AudioService.js)**
```javascript
isAudioStopped() { return this._audioState === 'STOPPED' }
isAudioPlaying() { return this._audioState === 'PLAYING' }
getAudioState() { return this._audioState }
```

**2. Error Recovery in resumeFromTap()**
- Transition to STOPPED on failure instead of leaving in RESUMING
- Try/catch with proper state transition on error

**3. Conditional Debug Logging**
```javascript
const DEBUG_AUDIO_STATE = typeof window !== 'undefined' &&
  (window.location?.search?.includes('debug=audio') || false)
```

**4. Disabled attemptAutoStartAudio()**
- Removed auto-start logic that violated user-gesture principle
- Audio only starts from explicit Play button click

**5. Recovery Overlay Redesign**
- Card-based design with `var(--ui-bg)` background
- Teal border/accent matching UI bar buttons
- Full dark/light mode support via CSS variables
- Proper backdrop blur and rounded corners

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/AudioService.js` | Added public API, error recovery, DEBUG flag |
| `frontend/src/main.js` | Disabled attemptAutoStartAudio(), redesigned overlay |
| `frontend/src/landing/main.js` | Updated to use public API, redesigned overlay |

---

### Version

v0.1.3

---
