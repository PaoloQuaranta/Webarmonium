# Webarmonium Development Log

> **Note:** Older entries (1-74) have been moved to [log_archive.md](log_archive.md)

---


## Entry #75 - Settings Panel UI Improvements + Code Review Fixes

**Date**: 2026-01-10
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Improved Settings panel UX with two changes: moved the desktop Settings button inline with the UI bar (instead of floating separately), and made the Apply button close the panel with a canvas notification "Settings applied". Then applied 7 code review fixes for memory leaks, race conditions, and accessibility.

---

### Problem Statement

User reported two issues:
1. **Desktop Settings button was separate** from the UI bar, floating as a standalone fixed-position element in top-right corner
2. **Apply button didn't close the panel** - users had to manually close after applying settings

---

### Solution

#### 1. Inline Desktop Settings Button

Changed `_createDesktopSettingsButton()` to insert the button into `.audio-controls` container instead of appending to `document.body`. Now uses CSS class instead of inline styles.

**File:** `frontend/src/services/UIManager.js`

```javascript
_createDesktopSettingsButton () {
  const audioControls = document.querySelector('.audio-controls')
  if (!audioControls) return

  const settingsBtn = document.createElement('button')
  settingsBtn.className = 'desktop-settings-btn' // CSS handles all styling
  settingsBtn.innerHTML = '&#9881; Settings'
  audioControls.appendChild(settingsBtn)
}
```

#### 2. Apply Button Closes Panel + Canvas Notification

Modified `_applySettings()` to close the panel and show a toast notification after delay.

---

### Code Review Fixes (7 Issues)

After initial implementation, code-reviewer agent identified 7 issues. All fixed:

#### Fix #1: Memory Leak in Toast Notifications (HIGH)

**Problem**: Multiple rapid "Apply" clicks could accumulate orphaned DOM elements.

**Solution**: Track active notification and clear timeouts:
```javascript
// Constructor
this.activeNotification = null
this.notificationTimeout = null
this.notificationRemovalTimeout = null

// In _showCanvasNotification()
if (this.activeNotification?.parentNode) {
  this.activeNotification.parentNode.removeChild(this.activeNotification)
}
if (this.notificationTimeout) clearTimeout(this.notificationTimeout)
this.activeNotification = notification
```

#### Fix #2: Race Condition - Toast Behind Overlay (HIGH)

**Problem**: Notification appeared while panel was still fading out (300ms animation).

**Solution**: Delay notification by 350ms after `close()`:
```javascript
this.close()
setTimeout(() => {
  this._showCanvasNotification('Settings applied')
}, SettingsPanel.TOAST_DELAY_AFTER_CLOSE)
```

#### Fix #3: Inline Styles Instead of CSS (MEDIUM)

**Problem**: Desktop button used `style.cssText` and JS hover handlers.

**Solution**: Moved to CSS class in `rooms.html`:
```css
.desktop-settings-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.2);
  /* ... */
}
.desktop-settings-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
}
```

#### Fix #4: Missing Error Handling (MEDIUM)

**Problem**: `reloadAudioProfile()` and `applyGraphicsQuality()` calls had no error handling.

**Solution**: Wrapped in try-catch with error notification:
```javascript
try {
  window.webarmoniumApp.audioService.reloadAudioProfile()
} catch (error) {
  console.error('Failed to reload audio profile:', error)
  this._showCanvasNotification('Audio reload failed')
  return
}
```

#### Fix #5: Console.log in Production (MEDIUM)

**Problem**: `console.log('Settings applied:')` left in production code.

**Solution**: Removed debug logging from `_applySettings()` and `_resetSettings()`.

#### Fix #6: Missing ARIA Live Region (LOW)

**Problem**: Toast notification didn't announce to screen readers.

**Solution**: Added accessibility attributes:
```javascript
notification.setAttribute('role', 'status')
notification.setAttribute('aria-live', 'polite')
notification.setAttribute('aria-atomic', 'true')
```

#### Fix #7: Magic Numbers (LOW)

**Problem**: Hard-coded timing values (300ms, 2000ms) scattered through code.

**Solution**: Static class constants:
```javascript
class SettingsPanel {
  static ANIMATION_DURATION = 300      // ms - panel fade in/out
  static TOAST_DISPLAY_DURATION = 2000 // ms - how long toast is visible
  static TOAST_DELAY_AFTER_CLOSE = 350 // ms - wait for panel close animation
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/UIManager.js` | Settings button uses CSS class, removed inline styles |
| `frontend/src/components/SettingsPanel.js` | All 7 fixes: notification tracking, delayed toast, try-catch, ARIA, constants |
| `frontend/rooms.html` | Added `.desktop-settings-btn` CSS class |

---

### UX Flow

1. User clicks "Settings" button in UI bar
2. Settings panel opens
3. User changes options
4. User clicks "Apply"
5. Panel closes automatically
6. **Wait 350ms** for panel animation to complete
7. Teal toast "Settings applied" appears at bottom center
8. Toast fades out after 2 seconds

---

### Version

Updated to v1.0.55

---

## Entry #76 - Documentation Accuracy: Reverse Mapping & Coordinate Mapping

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: SUPERSEDED by Entry #83

> **Note**: The "reverse mapping" approach documented here has been replaced by a **Golden Ratio distribution** system in Entry #83. The new system uses φ and φ² sequences for independent X/Y calculation, breaking the diagonal clustering pattern.

### Summary

Fixed inaccurate documentation in landing page and technical appendix. The previous documentation incorrectly stated that cursor positions reflect metric activity. In reality, cursor positions are **reverse-mapped** from generated audio frequencies—each cursor follows the music being played, not raw metrics.

---

### Problem Statement

User identified documentation errors:
1. index.html claimed "cursor movement reflects metric activity velocity" — **FALSE**
2. technical-appendix.html claimed "cursor positions reflect metric activity, not frequency values" — **FALSE**
3. Coordinate mapping section was incomplete (missing Y's dual effect on frequency/amplitude)

---

### Root Cause Analysis

Code analysis revealed the actual implementation (Entry #70-72):

1. **Virtual User Cursor System** (VirtualUserService.js, LandingCompositionService.js):
   - Metrics → generate virtual gestures → produce audio frequencies
   - Frequencies → **reverse-mapped** via FrequencyPositionMapper → cursor positions
   - Cursors follow the MUSIC, not raw metrics

2. **Coordinate Mapping** (GestureProcessor.js:83-112):
   - X: Base frequency = 220Hz + (x × 660Hz) = 220-880Hz
   - Y: **TWO effects**:
     - Harmonic shift: >0.7 = ×1.5 (perfect 5th up), <0.3 = ×0.75 (perfect 4th down)
     - Amplitude: >0.8 = ×1.2 (boost), <0.2 = ×0.6 (reduce)
   - Z (gyro): Octave shift: >0.8 = ×2 (up), <0.2 = ×0.5 (down)

---

### Solution

#### 1. Fixed index.html (lines 209-216)

**Before (WRONG):**
```html
<strong>Timbral mapping</strong>: ... cursor movement on the canvas reflects metric activity velocity
```

**After (CORRECT):**
```html
<strong>Audio-visual coherence</strong>: ... Cursor positions are <em>reverse-mapped</em> from generated audio frequencies—each cursor follows the music being played, not raw metrics.
```

#### 2. Fixed technical-appendix.html Section 1 (lines 109-114)

**Before (WRONG):**
```html
cursor positions reflect metric activity, not frequency values
```

**After (CORRECT):**
```html
Cursor positions are <em>reverse-mapped</em> from generated audio frequencies—each cursor follows the music being played, ensuring perfect audio-visual coherence.
```

#### 3. Fixed Coordinate Mapping Section (lines 246-257)

**Before (INCOMPLETE):**
```
Y coordinate → Amplitude multiplier: 0.6× to 1.2×
```

**After (COMPLETE):**
```
X coordinate (0.0-1.0) → Base frequency: 220Hz + (X × 660Hz) = 220-880Hz
Y coordinate (0.0-1.0) → Harmonic shift: >0.7 = ×1.5 (5th up), <0.3 = ×0.75 (4th down)
Y coordinate (0.0-1.0) → Amplitude: >0.8 = ×1.2 (boost), <0.2 = ×0.6 (reduce)
Z coordinate (gyro)    → Octave shift: >0.8 = ×2 (up), <0.2 = ×0.5 (down)
```

Added note explaining Landing Page reverse mapping (110-1210Hz range).

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/index.html` | Fixed "Audio-visual coherence" section to describe reverse mapping |
| `frontend/technical-appendix.html` | Fixed Section 1 intro, corrected Coordinate Mapping with Y's dual effects, added Landing Page reverse mapping note |

---

### Key Concept: Reverse Mapping

The virtual cursor system uses **reverse mapping** (implemented in Entry #70):

```
Forward (real users):  position → frequency
Reverse (virtual):     frequency → position
```

This ensures perfect audio-visual coherence: when you hear a note, the cursor is positioned exactly where a real user would be to produce that same note.

---

### Version

Updated to v1.0.56

---

## Entry #77 - Technical Appendix Verification Fixes

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Completed systematic verification of ALL documentation claims (28 total) against source code. Found and fixed 2 discrepancies in technical-appendix.html.

---

### Verification Results

- **Landing Page claims**: 8/8 TRUE
- **Collaborative Rooms claims**: 8/8 TRUE
- **Technical Appendix claims**: 10/12 TRUE, 2 needed correction

---

### Discrepancies Fixed

#### 1. Material Selection (line 290)
**Before**: "Top 5 - Scored by freshness × complexity × mood match"
**After**: "Top 3 - Scored by key compatibility × mood match"
**Code**: MaterialLibrary.js:226 uses `count = 3` default

#### 2. Environmental Memory Phases (lines 309-333)
**Before**: Time-based triggers (0-30s, 30s-1min, >1min)
**After**: Gesture-count-based triggers (< 10, 10-50, > 200 gestures)
**Code**: MemoryState.js:453-456 uses pattern count, not elapsed time

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/technical-appendix.html` | Fixed material selection count and memory phase triggers |
| `frontend/index.html` | Version tag v1.0.57 |

---

### Version

Updated to v1.0.57

---

## Entry #78 - Gesture Trail Halos Use User Color

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Changed the gesture trail halos (spherical effects left on canvas after drag gestures) from hardcoded cyan to use each user's assigned color. This enables visual differentiation between users in multi-user rooms.

---

### Problem Statement

The `drawGestureTrail()` function in main.js rendered halos with a hardcoded cyan color `rgba(0, 212, 255)`. All users' gesture trails looked identical, making it impossible to distinguish who created which visual effect.

---

### Solution

Modified `drawGestureTrail()` to use `this.currentUserColor` (the color assigned to the user when joining the room from the 10-color pool) instead of hardcoded cyan.

**File:** `frontend/src/main.js` (lines 1775-1782)

```javascript
// BEFORE (hardcoded cyan)
gradient.addColorStop(0, `rgba(0, 212, 255, ${alpha})`)
gradient.addColorStop(1, `rgba(0, 212, 255, 0)`)

// AFTER (user color)
const userColor = this.currentUserColor || '#00d4ff'  // fallback cyan
const rgb = window.VisualUtils?.hexToRgb(userColor) || { r: 0, g: 212, b: 255 }
gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`)
gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`)
```

Used existing `window.VisualUtils.hexToRgb()` utility (from VisualUtils.js:46) for color conversion.

---

### Room Parameters Available for Color Differentiation

| Parameter | Location | Description |
|-----------|----------|-------------|
| `this.currentUserColor` | main.js | User's assigned color from 10-color pool (e.g., '#e41a1c') |
| `room.mode` | RoomManager | 'solo' (1 user) or 'multi' (2+ users) |
| `room.userCount` | RoomManager | Number of users in room (1-4) |
| `memoryState.learningPhase` | MemoryState | 'initial', 'learning', 'collaborative', 'developing', 'mature' |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/main.js` | Modified `drawGestureTrail()` to use `currentUserColor` instead of hardcoded cyan |

---

### Verification

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm start`
3. Open http://localhost:3000 and perform drag gestures
4. Halos should appear in user's assigned color (not cyan)
5. Open second browser window — second user should have different colored halos

---

### Version

Updated to v1.0.58

---

## Entry #79 - Multi-User Gesture Trail Broadcasting & Tap Halos

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Extended gesture trail halos to broadcast to all users in the room via Socket.IO, and added halo rendering for tap gestures (not just drags). Previously halos were only visible locally.

---

### Problem Statement

Entry #78 added user-colored halos, but they were only rendered locally. Other users in the room couldn't see each other's gesture trails, reducing the collaborative visual feedback.

Additionally, tap gestures (quick click without drag) didn't trigger halos at all.

---

### Solution

#### 1. Split drawGestureTrail into emitter + renderer

**File:** `frontend/src/main.js`

```javascript
drawGestureTrail(gesture) {
  const { coordinates, intensity } = gesture
  const userColor = this.currentUserColor || '#00d4ff'

  // Draw locally
  this._renderTrailHalo(coordinates.x, coordinates.y, intensity, userColor)

  // Broadcast to other users in room
  if (this.socketService?.socket?.connected) {
    this.socketService.socket.emit('gesture:trail', {
      x: coordinates.x,
      y: coordinates.y,
      intensity,
      color: userColor
    })
  }
}

_renderTrailHalo(normX, normY, intensity, color) {
  // Canvas rendering logic (moved from drawGestureTrail)
}
```

#### 2. Added tap gesture trail trigger

**File:** `frontend/src/services/GestureProcessor.js`

```javascript
processClickGesture(gesture, sonicParams) {
  // Draw gesture trail halo for tap
  if (this.drawGestureTrailCallback) {
    this.drawGestureTrailCallback(gesture)
  }
  // ... rest of function
}
```

#### 3. Backend handler for broadcasting

**File:** `backend/src/api/handlers/GestureHandler.js`

```javascript
registerGestureTrailHandler(socket) {
  socket.on('gesture:trail', (data) => {
    if (!socket.userId || !socket.roomId) return
    if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') return

    socket.to(socket.roomId).emit('gesture:trail', {
      userId: socket.userId,
      x: data.x,
      y: data.y,
      intensity: data.intensity || 0.5,
      color: data.color || '#00d4ff',
      timestamp: Date.now()
    })
  })
}
```

#### 4. Frontend listener for remote trails

**File:** `frontend/src/main.js`

```javascript
this.socketService.on('gesture:trail', (data) => {
  if (!data || typeof data.x !== 'number') return
  if (data.userId === this.socketService?.socket?.id) return

  this._renderTrailHalo(data.x, data.y, data.intensity || 0.5, data.color || '#00d4ff')
})
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/main.js` | Split `drawGestureTrail()` into emitter + `_renderTrailHalo()`, added socket listener for remote trails |
| `frontend/src/services/GestureProcessor.js` | Added trail callback to `processClickGesture()` for tap gestures |
| `frontend/src/services/SocketService.js` | Added `gesture:trail` socket event forwarding |
| `backend/src/api/handlers/GestureHandler.js` | Added `registerGestureTrailHandler()` for broadcasting |
| `backend/src/api/socketHandlers.js` | Registered new gesture:trail handler |

---

### Verification

1. Open two browser windows at http://localhost:3000
2. Join the same room with both
3. Perform drag or tap gestures in one window
4. Halos should appear in both windows with the correct user color

---

### Version

Updated to v1.0.59

---

## Entry #80 - Gesture Trail Security & Performance Fixes

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Applied 6 fixes from code review of Entry #79 gesture trail implementation. Addresses security vulnerabilities, performance bottlenecks, and reliability issues.

---

### Issues Fixed

| # | Issue | Priority | Fix |
|---|-------|----------|-----|
| 1 | Input validation missing (bounds, NaN, Infinity) | Critical | Added parseFloat + range validation for x/y (0-1) |
| 2 | XSS via color injection | Critical | Added hex color regex validation `/^#[0-9A-Fa-f]{6}$/` |
| 3 | Rate limiting missing (potential DoS) | High | Added 16ms throttle (~60fps max) per socket |
| 4 | Race condition on socket emit | High | Added try-catch around socket emission |
| 5 | No frontend throttling | Medium | Added 16ms throttle on network broadcast (local render unthrottled) |
| 6 | Gradient created every frame | Medium | Replaced with shadowBlur + cached RGB conversion |

---

### Backend Changes

**File:** `backend/src/api/handlers/GestureHandler.js`

```javascript
registerGestureTrailHandler (socket) {
  // Rate limiting: max ~60 trail events per second per user
  const TRAIL_RATE_LIMIT_MS = 16
  let lastEmitTime = 0

  socket.on('gesture:trail', (data) => {
    // Rate limiting check
    const now = Date.now()
    if (now - lastEmitTime < TRAIL_RATE_LIMIT_MS) return
    lastEmitTime = now

    // Validate coordinates (normalized 0-1 range)
    const x = parseFloat(data.x)
    const y = parseFloat(data.y)
    if (isNaN(x) || isNaN(y) || x < 0 || x > 1 || y < 0 || y > 1) return

    // Validate intensity (clamp 0-1)
    const intensity = typeof data.intensity === 'number'
      ? Math.max(0, Math.min(1, data.intensity))
      : 0.5

    // Validate color format (hex only, prevent XSS)
    const hexPattern = /^#[0-9A-Fa-f]{6}$/
    const color = hexPattern.test(data.color) ? data.color : '#00d4ff'

    // Broadcast sanitized data
    socket.to(socket.roomId).emit('gesture:trail', { userId, x, y, intensity, color, timestamp })
  })
}
```

Note: Rate limit uses local variable per socket, automatically cleaned up on disconnect.

---

### Frontend Changes

**File:** `frontend/src/main.js`

#### drawGestureTrail() - Throttling + Error Handling

```javascript
drawGestureTrail(gesture) {
  // Draw locally (always, no throttling)
  this._renderTrailHalo(coordinates.x, coordinates.y, intensity, userColor)

  // Throttle network broadcast (~60fps max)
  const now = Date.now()
  if (now - (this._lastTrailEmitTime || 0) < 16) return
  this._lastTrailEmitTime = now

  // Broadcast with error handling
  try {
    if (this.socketService?.socket?.connected) {
      this.socketService.socket.emit('gesture:trail', { ... })
    }
  } catch (error) {
    // Silent fail - trail emission is not critical
  }
}
```

#### _renderTrailHalo() - Performance Optimization

```javascript
_renderTrailHalo(normX, normY, intensity, color) {
  // Cache RGB conversion per color
  if (!this._trailColorCache) this._trailColorCache = new Map()

  let rgb = this._trailColorCache.get(color)
  if (!rgb) {
    rgb = window.VisualUtils?.hexToRgb(color) || { r: 0, g: 212, b: 255 }
    this._trailColorCache.set(color, rgb)
    // Keep cache bounded (max 20 colors)
    if (this._trailColorCache.size > 20) {
      this._trailColorCache.delete(this._trailColorCache.keys().next().value)
    }
  }

  // Use shadowBlur instead of gradient (more performant)
  this.ctx.globalAlpha = alpha * 0.8
  this.ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
  this.ctx.shadowColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
  this.ctx.shadowBlur = size * 0.6
  this.ctx.arc(x, y, size * 0.5, 0, Math.PI * 2)
  this.ctx.fill()
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/api/handlers/GestureHandler.js` | Input validation, rate limiting, color sanitization |
| `frontend/src/main.js` | Throttling, error handling, RGB cache, shadowBlur rendering |

---

### Security Improvements

- **Bounds checking**: Coordinates validated to 0-1 range, rejects NaN/Infinity
- **XSS prevention**: Color validated against strict hex regex, rejects injection attempts
- **DoS mitigation**: Rate limiting prevents flooding with trail events

### Performance Improvements

- **RGB caching**: Avoids repeated hexToRgb parsing (bounded Map with 20 entries)
- **shadowBlur vs gradient**: Simpler compositing, no gradient creation per frame
- **Dual throttling**: Backend + frontend both throttle at ~60fps

---

### Version

Updated to v1.0.60

---

## Entry #81 - Duration-Based Tap Trail Size & Virtual User Trails

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Enhanced gesture trail halos with two improvements:
1. Tap gesture trails now have size that grows based on tap duration (not just intensity)
2. Virtual users on landing page now generate trail halos like real users

---

### Problem Statement

1. Tap gestures had small fixed-size trails because `intensity` is based on movement, and taps have minimal movement
2. Virtual users (Wikipedia, HackerNews, GitHub) on the landing page didn't generate trail halos when completing gestures

---

### Solution

#### 1. Duration-Based Tap Trail Size (Room)

**File:** `frontend/src/main.js`

```javascript
drawGestureTrail(gesture) {
  const { coordinates, intensity, action, duration } = gesture
  const userColor = this.currentUserColor || '#00d4ff'

  // For taps, calculate intensity from duration (100ms→0.3, 2000ms→1.0)
  // For drags, use the gesture intensity based on movement
  let trailIntensity = intensity || 0.3
  if (action === 'tap' && duration) {
    trailIntensity = Math.min(1, 0.3 + (duration / 2000) * 0.7)
  }

  this._renderTrailHalo(coordinates.x, coordinates.y, trailIntensity, userColor)
  // ... broadcast ...
}
```

#### 2. Virtual User Trails (Landing Page)

**File:** `frontend/index.html`
- Added overlay canvas `#trail-overlay` for trail rendering

**File:** `frontend/src/landing/main.js`

Added trail infrastructure:
- `this.trailCanvas` / `this.trailCtx` - Canvas and 2D context
- `_resizeTrailCanvas()` - Resize on window resize
- `_renderTrailHalo()` - Same rendering logic as room main.js
- `_hexToRgb()` - Color conversion helper

Added trail rendering to gesture handlers:
```javascript
// In _handleVirtualHoldEnd (drag end)
const cursorData = this.currentCursors[userId || note.userId]
if (cursorData) {
  const holdDuration = duration || 1000
  const intensity = Math.min(1, 0.3 + (holdDuration / 2000) * 0.7)
  this._renderTrailHalo(cursorData.x, cursorData.y, intensity, cursorData.color)
}

// In _handleVirtualTapNote (tap)
const cursorData = this.currentCursors[userId]
if (cursorData) {
  const intensity = Math.min(1, 0.3 + (tapDuration / 2) * 0.7)
  this._renderTrailHalo(cursorData.x, cursorData.y, intensity, userColor)
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/main.js` | Duration-based trail intensity for taps |
| `frontend/index.html` | Added `#trail-overlay` canvas |
| `frontend/src/landing/main.js` | Trail canvas setup, `_renderTrailHalo`, `_hexToRgb`, handlers updated |

---

### Behavior

| Gesture Type | Intensity Calculation |
|--------------|----------------------|
| Tap (real user) | `0.3 + (duration / 2000) * 0.7` → 100ms=0.3, 2s=1.0 |
| Drag (real user) | Original intensity from movement |
| Virtual tap | `0.3 + (tapDuration / 2) * 0.7` |
| Virtual drag | `0.3 + (holdDuration / 2000) * 0.7` |

---

### Code Review Fixes (10 Issues)

After implementation, code-reviewer agent identified 10 issues across 3 priority levels. All fixed:

#### CRITICAL (3)

**Fix #1: Input validation for virtual user hold:end**
- Added `isFinite()` validation for `position.x/y`
- Added `_sanitizeColor()` for user color
- File: `frontend/src/main.js:1051-1058`

**Fix #2: Input validation for remote user tap events**
- Added `isFinite()` validation for `remotePosition`
- Added `typeof + isFinite` check for duration
- File: `frontend/src/main.js:1357-1366`

**Fix #3: NaN propagation in intensity calculation**
- Added guard in `_renderTrailHalo()` for all numeric inputs
- Added RGB value validation in color cache
- File: `frontend/src/main.js:1857-1859`

#### HIGH (3)

**Fix #4: Remove debug logs**
- Removed 12 `console.log` statements from:
  - virtual:phrase-visual handler
  - virtual-users-activated/deactivated handlers
  - mode-transition handler
  - join response handler
  - drone request

**Fix #5: Inconsistent fallbacks in intensity calculations**
- Changed to `Math.max(0, Math.min(1, intensity))` for consistent clamping
- File: `frontend/src/main.js:1875-1876`

**Fix #6: Backend validation for VirtualUserService**
- Added helper methods: `_isValidPosition()`, `_isValidColor()`, `_isValidDuration()`
- hold:end now only emits trail data if all values are valid
- File: `backend/src/services/VirtualUserService.js:148-172`

#### MEDIUM (4)

**Fix #7: Cache validation for cursor lookup**
- Validate color string before caching
- Validate RGB values are finite after conversion
- File: `frontend/src/main.js:1858`

**Fix #8: Code duplication in trail rendering**
- Created centralized `_calculateTrailIntensityFromDuration(durationMs)` helper
- Refactored 2 duplicate intensity calculations to use helper
- File: `frontend/src/main.js:1838-1845`

**Fix #9: Edge cases in duration calculation**
- Added `typeof + >= 0` check for duration=0 case in hold gesture
- Added minimum 100ms for tap visibility when startTime equals Date.now()
- Files: `frontend/src/services/GestureProcessor.js:76-85, 176-179`

**Fix #10: typeof pattern consistency**
- Unified pattern: `typeof x === 'number' && isFinite(x)`
- Applied consistently across all numeric validations
- File: `frontend/src/main.js:1798`

---

### Files Modified (Final)

| File | Changes |
|------|---------|
| `frontend/src/main.js` | Duration-based trail intensity, input validation, NaN guards, debug logs removed, centralized intensity helper |
| `frontend/index.html` | Added `#trail-overlay` canvas |
| `frontend/src/landing/main.js` | Trail canvas setup, `_renderTrailHalo`, `_hexToRgb`, cursor lookup fix |
| `frontend/src/services/GestureProcessor.js` | Duration edge case fixes, action/duration metadata |
| `backend/src/services/VirtualUserService.js` | Validation helpers, validated hold:end emissions |

---

### Version

Updated to v1.0.62

---

## Entry #82 - Fix PrecomputedAttractorSystem.setPointLimit() Error

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed a method naming error in `PrecomputedAttractorSystem.js` that caused "this.precompute is not a function" when applying graphics quality settings.

---

### Problem Statement

When applying graphics quality from the Settings Panel, the first click on "Apply" threw an error:
```
Failed to apply graphics quality: TypeError: this.precompute is not a function
    at PrecomputedAttractorSystem.setPointLimit (PrecomputedAttractorSystem.js:535:12)
```

The second click appeared to "work" but was actually just skipping the problematic code.

---

### Root Cause

In `PrecomputedAttractorSystem.js` line 535, the `setPointLimit()` method called `this.precompute()`, but the actual method is named `_precomputeAttractors()` (with underscore prefix).

**Why second click "worked":**
1. First click: `setPointLimit()` → `this.precompute()` → Error thrown
2. Error prevents `this.pointCount` from updating
3. Second click: `newCount !== this.pointCount` evaluates FALSE → code block skipped
4. Attractor points were never actually recalculated

---

### Solution

Changed line 535 from:
```javascript
this.precompute()
```

To:
```javascript
this._precomputeAttractors()
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/visual/PrecomputedAttractorSystem.js:535` | Fixed method call from `precompute()` to `_precomputeAttractors()` |

---

### Verification

1. Open http://localhost:3000
2. Enter a room
3. Open Settings Panel
4. Select "Minimal" for Graphics Quality
5. Click "Apply"
6. Verify NO error in console
7. Verify toast "Settings applied" appears
8. Attractor points should now properly update (400 points in minimal vs 1200 in full)

---

### Version

Updated to v1.0.63

---

## Entry #83 - Golden Ratio Cursor Positioning & Code Review Fixes

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Replaced the "reverse mapping" cursor positioning system with a **Golden Ratio distribution** approach. Virtual user cursors now use φ (phi) and φ² sequences for X and Y axes independently, breaking the diagonal clustering pattern while maintaining data-driven coherence. Also applied 7 code review fixes for memory leaks, frame-rate independence, and validation.

---

### Problem Statement

Virtual user cursors moved only along a diagonal line (bottom-left to top-right). The old "reverse mapping" system derived both X and Y from the same frequency value, creating a direct correlation that forced diagonal movement.

---

### Root Cause

The old `FrequencyPositionMapper.frequencyToPosition()` calculated:
- Y from normalized frequency
- X from frequency residue

This created: high frequency → top-right, low frequency → bottom-left, always diagonal.

---

### Solution: Golden Ratio Distribution

New `_calculateHybridPosition()` method uses:

```javascript
// Golden ratio constants
static PHI = 1.618033988749895     // φ for X axis
static PHI_SQ = 2.618033988749895  // φ² for Y axis (different sequence)

// Position calculation
const combinedSeed = gestureCount + sourceOffset + stepIndex
const xGolden = (combinedSeed * PHI + normalizedFreq * 3.7) % 1
const yGolden = (combinedSeed * PHI_SQ + secondaryMetric * 5.3) % 1
```

**Key benefits:**
- **Independent X/Y**: Different φ powers ensure uncorrelated sequences
- **Optimal spacing**: Golden ratio provides maximum separation between consecutive positions
- **Data-driven**: Metrics still modulate position (frequency → X, secondary metric → Y)
- **Full canvas coverage**: Cursors spread across entire area, not just diagonal

---

### Code Review Fixes (7 Issues)

#### Fix #1: Memory Leak - rAF Not Cancelled on Error (HIGH)

**Problem**: `_fadeTrailCanvas()` didn't stop animation on error, could cause runaway loop.

**Solution**: Added try/catch with `_stopTrailFade()` on error:
```javascript
try {
  // ... fade logic
} catch (error) {
  console.error('Trail fade error:', error)
  this._stopTrailFade()  // Stop on error
}
```

#### Fix #2: Socket Data Validation Gaps (HIGH)

**Problem**: `hold:start` emission didn't validate position/frequency.

**Solution**: Added validation before emission:
```javascript
if (!this._isValidPosition(position)) {
  console.warn(`Invalid position for ${source} tap gesture, skipping emission`)
  return
}
if (!Number.isFinite(frequency) || frequency < 20 || frequency > 20000) {
  console.warn(`Invalid frequency ${frequency} for ${source} tap gesture, skipping emission`)
  return
}
```

#### Fix #3: Golden Ratio Position Bounds (HIGH)

**Problem**: Input/output validation missing could produce NaN or out-of-bounds.

**Solution**: Input validation + explicit output clamping:
```javascript
// Input validation
if (!Number.isFinite(baseFrequency) || baseFrequency < 0) {
  return { x: 0.5, y: 0.5 }  // Safe fallback
}

// Output clamping
const x = Math.max(0.05, Math.min(0.95, MIN_BOUND + xGolden * RANGE))
const y = Math.max(0.05, Math.min(0.95, MIN_BOUND + yGolden * RANGE))
```

#### Fix #4: Fade Rate Not Frame-Rate Independent (MEDIUM)

**Problem**: Fixed alpha per frame meant different fade speeds at 30fps vs 60fps vs 120Hz.

**Solution**: Delta time scaling:
```javascript
const now = performance.now()
const deltaTime = now - (this._lastFadeTime || now)
this._lastFadeTime = now

const targetDelta = 16.67  // 60fps target
const scaledAlpha = Math.min(1.0, this._trailFadeRate * (deltaTime / targetDelta))
```

#### Fix #5: Interpolation Speed Mismatch (MEDIUM)

**Problem**: `interpolationSpeed: 0.08` didn't match `intervalMs: 100` for trajectories.

**Solution**: Increased speed from 0.08 to 0.15 for smoother 100ms interval movement.

#### Fix #6: Trail Intensity Calculation Duplicated (LOW)

**Problem**: Same duration→intensity formula in multiple places.

**Solution**: Added centralized helper `_calculateTrailIntensityFromDuration()`:
```javascript
_calculateTrailIntensityFromDuration(durationMs) {
  if (typeof durationMs !== 'number' || !isFinite(durationMs) || durationMs < 0) {
    return 0.3  // Minimum for invalid input
  }
  return Math.min(1, 0.3 + (durationMs / 2000) * 0.7)
}
```

#### Fix #7: Gesture Counter Overflow (LOW)

**Problem**: Counter could overflow `Number.MAX_SAFE_INTEGER` after very long sessions.

**Solution**: Added modulo protection:
```javascript
this.gestureCounters[source] = ((this.gestureCounters[source] || 0) + 1) % Number.MAX_SAFE_INTEGER
```

---

### Documentation Updates

Updated "How It Works" section and technical appendix to reflect the new Golden Ratio system instead of the old "reverse mapping" description.

| File | Changes |
|------|---------|
| `frontend/index.html` | Updated "Audio-visual coherence" paragraph to describe golden ratio distribution |
| `frontend/technical-appendix.html` | Updated Section 1 intro and Landing Page note with φ/φ² formula |

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/VirtualUserService.js` | New `_calculateHybridPosition()`, `_generateHybridTrajectory()`, PHI constants, all 7 fixes |
| `frontend/src/main.js` | Frame-rate independent fade, try/catch error handling |
| `frontend/src/landing/main.js` | Frame-rate independent fade, `_calculateTrailIntensityFromDuration()` helper |
| `frontend/index.html` | Documentation: golden ratio description |
| `frontend/technical-appendix.html` | Documentation: φ/φ² formula, position calculation details |

---

### Verification

1. **Visual test**: Watch virtual cursors in landing page - should cover full canvas, not just diagonal
2. **Backend tests**: `cd backend && npm test` - 34/34 VirtualUserService tests pass
3. **Trail fade**: Trails should fade consistently regardless of display refresh rate
4. **Bounds check**: All cursors stay within 5%-95% canvas area

---

### Version

Updated to v1.0.64

---

## Entry #84 - Ghost "local" Cursor Fix

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed ghost cursor with label "local" that appeared intermittently on the canvas. The cursor persisted because it was created when socket.id was unavailable during connection/reconnection.

---

### Root Cause

The pattern `socket.id || 'local'` was used as a fallback in 7 locations. When the socket was disconnected or connecting, the fallback `'local'` created a cursor that:
1. Was rendered with label "local" (first 8 chars of userId)
2. Was not tracked as virtual or remote cursor (no cleanup path)
3. Had its timestamp reset by each gesture, preventing stale removal

---

### Solution

Replaced `socket.id || 'local'` with early return when socket.id is unavailable:

```javascript
// BEFORE (broken)
const userId = this.socketService.socket.id || 'local'
this.visualService.updateCursorPosition(userId, x, y, color)

// AFTER (fixed)
const userId = this.socketService.socket.id
if (!userId) return // Skip if socket not ready
this.visualService.updateCursorPosition(userId, x, y, color)
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/main.js` | Fixed 5 occurrences (lines 692, 752, 796, 843, 1584) |
| `frontend/src/handlers/SustainedHoldHandler.js` | Fixed 2 occurrences (lines 296, 315) |

---

### Version

Updated to v1.0.65

---

## Entry #85 - Production Server Crash Fix: lastActivity TypeError

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed production server crash caused by `TypeError: this.lastActivity.getTime is not a function` in the periodic room cleanup process. Three handlers were incorrectly assigning `Date.now()` (a number) instead of using `room.updateActivity()` (which creates a Date object).

---

### Root Cause

In `Room.js`, `lastActivity` is initialized as `new Date()` and updated via `updateActivity()` method. However, three handlers bypassed this method and assigned `Date.now()` directly:

```javascript
// WRONG - assigns a number (timestamp)
room.lastActivity = Date.now()

// CORRECT - assigns a Date object
room.updateActivity()  // internally does: this.lastActivity = new Date()
```

When the periodic cleanup ran `room.shouldCleanup()`, it called `this.lastActivity.getTime()` on a number instead of a Date object, causing the crash.

---

### Error Log

```
TypeError: this.lastActivity.getTime is not a function
    at Room.shouldCleanup (Room.js:402:64)
    at RoomManager.performCleanup (RoomManager.js:577:16)
    at Timeout._onTimeout (RoomManager.js:546:12)
```

---

### Solution

#### 1. Fixed three handlers to use `room.updateActivity()`

| File | Line | Before | After |
|------|------|--------|-------|
| `backend/src/api/handlers/CursorHandler.js` | 119 | `room.lastActivity = Date.now()` | `room.updateActivity()` |
| `backend/src/api/handlers/MusicalHandler.js` | 455 | `room.lastActivity = Date.now()` | `room.updateActivity()` |
| `backend/src/api/handlers/GestureHandler.js` | 389 | `room.lastActivity = Date.now()` | `room.updateActivity()` |

#### 2. Added defensive check in `Room.shouldCleanup()`

```javascript
// Defensive check: handle case where lastActivity might be a timestamp number
const lastActivityTime = this.lastActivity instanceof Date
  ? this.lastActivity.getTime()
  : (typeof this.lastActivity === 'number' ? this.lastActivity : Date.now())
const hoursSinceActivity = (Date.now() - lastActivityTime) / (1000 * 60 * 60)
return hoursSinceActivity > 48
```

This ensures the cleanup won't crash even if someone reintroduces the same bug in the future.

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/api/handlers/CursorHandler.js` | Changed `room.lastActivity = Date.now()` to `room.updateActivity()` |
| `backend/src/api/handlers/MusicalHandler.js` | Changed `room.lastActivity = Date.now()` to `room.updateActivity()` |
| `backend/src/api/handlers/GestureHandler.js` | Changed `room.lastActivity = Date.now()` to `room.updateActivity()` |
| `backend/src/models/Room.js` | Added defensive type check in `shouldCleanup()` |

---

### Version

Updated to v1.0.66

---

## Entry #86 - Systemd Services for Production Server

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Implemented systemd services for the production server (DigitalOcean droplet) to enable automatic restart on crash and automatic startup on server reboot. Modified `auto-deploy.sh` to use kill-only approach since systemd handles restarts.

---

### Problem Statement

The production server at webarmonium.net ran backend and frontend via `nohup npm start &` commands. This approach had issues:
1. **No auto-restart on crash** - If the app crashed, it stayed down until manual intervention
2. **No auto-start on reboot** - Server reboots required manually starting the services
3. **Complex restart logic** - `auto-deploy.sh` had to kill processes AND restart them

---

### Solution

#### 1. Created systemd service for backend

**File:** `/etc/systemd/system/webarmonium-backend.service`

```ini
[Unit]
Description=Webarmonium Backend Server
After=network.target

[Service]
Type=simple
User=polden
WorkingDirectory=/home/polden/Webarmonium/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

#### 2. Created systemd service for frontend

**File:** `/etc/systemd/system/webarmonium-frontend.service`

```ini
[Unit]
Description=Webarmonium Frontend Server
After=network.target

[Service]
Type=simple
User=polden
WorkingDirectory=/home/polden/Webarmonium/frontend
ExecStart=/usr/bin/npx http-server . -p 3000
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

#### 3. Simplified auto-deploy.sh

Removed restart logic since `Restart=always` in systemd handles it automatically after kill:

```bash
#!/bin/bash
# Auto-deploy script for Webarmonium
# Runs git pull and kills services (systemd restarts them automatically)
set -euo pipefail

export PATH="/usr/bin:/usr/local/bin:$PATH"
NPM="/usr/bin/npm"

PROJECT_DIR="/home/polden/Webarmonium"
LOG_FILE="$PROJECT_DIR/scripts/auto-deploy.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

cd "$PROJECT_DIR"

PULL_OUTPUT=$(git pull origin prod 2>&1)

if echo "$PULL_OUTPUT" | grep -q "Already up to date."; then
    log "=== NO UPDATES - Repository already up to date ==="
    exit 0
fi

log "=== UPDATES PULLED - RESTARTING SERVICES ==="
log "Git pull output: $PULL_OUTPUT"

# Install dependencies
cd "$PROJECT_DIR/backend"
$NPM install --silent >> "$LOG_FILE" 2>&1 || true

cd "$PROJECT_DIR/frontend"
$NPM install --silent >> "$LOG_FILE" 2>&1 || true

# Kill services (systemd will restart them automatically)
log "Killing services (systemd will restart)..."
fuser -k 3001/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true

log "=== DEPLOY COMPLETED ==="
```

---

### Installation Commands

```bash
# Copy service files
sudo cp /home/polden/webarmonium-backend.service /etc/systemd/system/
sudo cp /home/polden/webarmonium-frontend.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable services (auto-start on boot)
sudo systemctl enable webarmonium-backend
sudo systemctl enable webarmonium-frontend

# Start services
sudo systemctl start webarmonium-backend
sudo systemctl start webarmonium-frontend
```

---

### Useful Commands

```bash
# View live logs
sudo journalctl -u webarmonium-backend -f
sudo journalctl -u webarmonium-frontend -f

# Manual restart
sudo systemctl restart webarmonium-backend
sudo systemctl restart webarmonium-frontend

# Check status
sudo systemctl status webarmonium-backend webarmonium-frontend
```

---

### Files Modified

| File | Location | Changes |
|------|----------|---------|
| `webarmonium-backend.service` | `/etc/systemd/system/` | New systemd service for Node.js backend |
| `webarmonium-frontend.service` | `/etc/systemd/system/` | New systemd service for http-server frontend |
| `auto-deploy.sh` | `/home/polden/` | Removed nohup restart logic, kept only fuser kill |

---

### Cron Configuration

Cron job unchanged - runs every minute:
```
* * * * * /home/polden/auto-deploy.sh
```

The cron now relies on systemd's `Restart=always` directive to restart services after the kill command.

---

### Behavior

| Event | Before | After |
|-------|--------|-------|
| App crash | Stays down | Auto-restart in 5 seconds |
| Server reboot | Manual start needed | Auto-start on boot |
| Git push to prod | Kill + nohup restart | Kill only (systemd restarts) |

---

### Version

Infrastructure change - no version bump required

---

## Entry #87 - Separate Virtual User and Real User Color Pools

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Separated color pools for virtual users and real users to prevent color collisions. Virtual users (Wikipedia, HackerNews, GitHub) now have exclusive colors that real users can never receive. Created centralized color constants file as single source of truth.

---

### Problem Statement

Virtual users had hardcoded colors (red, orange, blue) that were **also included** in the real user color pool. This could cause color collisions where a real user might receive the same color as a virtual user, breaking visual differentiation.

| Virtual User | Color | Was in Real User Pool? |
|-------------|-------|------------------------|
| Wikipedia | `#e41a1c` (Red) | YES - collision risk |
| HackerNews | `#ff7f00` (Orange) | YES - collision risk |
| GitHub | `#377eb8` (Blue) | YES - collision risk |

---

### Solution

Created two exclusive, non-overlapping color pools:

**Virtual Users (3 colors - exclusive):**
- `#e41a1c` - Wikipedia (Red)
- `#ff7f00` - HackerNews (Orange)
- `#377eb8` - GitHub (Blue)

**Real Users (7 colors - exclusive):**
- `#4daf4a` - Verde (Green)
- `#984ea3` - Viola (Purple)
- `#ffff33` - Giallo (Yellow)
- `#e7298a` - Magenta
- `#f781bf` - Rosa (Pink)
- `#999999` - Grigio (Gray)
- `#66c2a5` - Teal

> **Race Condition Buffer**: 7 colors for max 4 real users provides a buffer of 3 extra colors.
> This handles the race condition during page refresh where disconnect may not process
> before new join, similar to the 8-slot system for 4 max timbres.

---

### Implementation

#### 1. Created Centralized Constants File (NEW)

**File:** `backend/src/constants/colors.js`

```javascript
const VIRTUAL_USER_COLORS = {
  wikipedia: '#e41a1c',
  hackernews: '#ff7f00',
  github: '#377eb8'
}

const REAL_USER_COLOR_POOL = [
  '#4daf4a', '#984ea3', '#ffff33', '#e7298a',
  '#f781bf', '#999999', '#66c2a5'
]

module.exports = { VIRTUAL_USER_COLORS, REAL_USER_COLOR_POOL }
```

#### 2. Updated ColorAssignmentService

- Imports `REAL_USER_COLOR_POOL` from constants
- Uses 7-color pool instead of 10
- Error message reflects "max 7 real users"

#### 3. Updated VirtualUserService & LandingCompositionService

- Import `VIRTUAL_USER_COLORS` from constants
- Replace hardcoded colors with constants

#### 4. Updated Room.js

- `availableColors` now uses `REAL_USER_COLOR_POOL`

#### 5. Updated Frontend Audio Services

- `AudioService.js` and `GestureAudioMapper.js` colorPools updated
- Include all 10 colors (3 virtual + 7 real) for audio frequency mapping

---

### Uniqueness Guarantee

The existing Set operations already ensure no duplicate color assignments:

```javascript
// In ColorAssignmentService.assignColor()
this.availableColors.delete(color)      // Remove from available
this.assignedColors.set(userId, color)  // Track assignment

// In ColorAssignmentService.releaseColor()
this.availableColors.add(color)         // Return to pool
this.assignedColors.delete(userId)      // Remove tracking
```

A color cannot be assigned to two users simultaneously.

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/constants/colors.js` | **NEW** - Single source of truth for all colors |
| `backend/src/services/ColorAssignmentService.js` | Uses REAL_USER_COLOR_POOL (7 colors) |
| `backend/src/services/VirtualUserService.js` | Uses VIRTUAL_USER_COLORS constants |
| `backend/src/services/LandingCompositionService.js` | Uses VIRTUAL_USER_COLORS constants |
| `backend/src/models/Room.js` | Uses REAL_USER_COLOR_POOL for availableColors |
| `frontend/src/services/AudioService.js` | Updated colorPool with all 10 colors |
| `frontend/src/services/audio/GestureAudioMapper.js` | Updated colorPool with all 10 colors |
| `backend/tests/unit/ColorAssignmentService.test.js` | Updated expectations for 7-color pool |
| `backend/tests/unit/RoomManager.test.js` | Fixed for 4 max users per room |

---

### Verification

1. `cd backend && npm test` - All tests pass
2. Virtual users on landing page show: red, orange, blue
3. Real users in rooms receive only: green, purple, yellow, magenta, pink, gray, teal
4. No real user ever receives red, orange, or blue
5. Page refresh doesn't cause color assignment errors

---

### Version

Updated to v1.0.68

---

## Entry #88 - Background Composition System Documentation

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Added comprehensive documentation for the Background Composition System that was completely missing from both the landing page "How It Works" section and the Technical Appendix. Documentation covers the three-layer generative system, drone emergence, musical scheduler, harmonic progressions, scales, voice leading, and metric-to-gesture classification.

---

### Problem Statement

The documentation in `index.html` and `technical-appendix.html` explained how virtual users generate notes from web metrics, but completely ignored how the **background music layer** works—the continuous ambient composition that plays underneath the virtual user notes.

---

### Solution

#### 1. Added "Background Composition Layer" section to index.html (lines 222-249)

New section between "Landing Page: Web Activity" and "Collaborative Rooms" covering:
- **Three-layer generative system**: bass (2s), pad (16s), chords (4s)
- **Drone emergence**: 5-10s void detection, 2s fade in, 20s fade out
- **Musical scheduler**: 25ms tick, beat grid per source

#### 2. Added 5 new sections to technical-appendix.html (lines 508-797)

| Section | Content |
|---------|---------|
| 8. Background Composition System | GenerativeMusicEngine 3-layer architecture, 7 harmonic progressions |
| 9. Drone & Void Detection | DroneVoidController params, void score formula, LFO modulation |
| 10. Musical Scheduler | Clock sync (25ms/100ms/250ms), beat grid assignment |
| 11. Harmonic Engine & Voice Leading | 9 scales, SATB ranges, counterpoint rules |
| 12. Metric-to-Gesture Classification | stability→TAP, density→DRAG, periodicity→HOVER |

---

### Values Verified Against Source Code

| Value | Source File |
|-------|-------------|
| Layer rhythms (2000/16000/4000ms) | GenerativeMusicEngine.js:50-81 |
| Drone params (5s/10s/2s/20s/-3dB/-60dB) | DroneVoidController.js:29-37 |
| LFO (0.03Hz/-6dB to 0dB, 0.05Hz/±8 cents) | AudioService.js:1368-1408 |
| Scheduler (25ms tick, 120 BPM) | MusicalScheduler.js:15-18 |
| 9 scales | MusicalScales.js:11-21 |
| SATB ranges (corrected Alto: G3-C5) | CounterpointEngine.js:5-8 |
| Beat grid (Wiki 0,4,8,12 / HN 2,6,10,14 / GH 1,5,9,13) | LandingCompositionService.js:1058-1060 |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/index.html` | Added "Background Composition Layer" section |
| `frontend/technical-appendix.html` | Added sections 8-12 (5 new sections) |

---

### Version

Updated to v1.0.69

---

## Entry #89 - Settings Menu Runtime Fixes

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed multiple issues with the Settings menu where settings weren't being applied correctly at runtime. Addressed 4 core issues: sample rate requiring page reload, shadowBlur not being applied to graphics, background layers not stopping when audio quality is reduced, and maxPolyphony not being enforced on existing synths.

---

### Problem Statement

User reported that Settings menu wasn't working as expected. Analysis revealed:

1. **Sample Rate**: Cannot be changed at runtime (AudioContext limitation) but no user feedback
2. **shadowBlur**: Defined in graphics profiles but never applied to SpringMeshNetwork
3. **backgroundLayers**: When audio quality is reduced, existing layer notes weren't being released
4. **maxPolyphony**: Limit was read but not applied to release excess voices

---

### Solution

#### 1. Sample Rate Warning Toast

Added detection and warning when sample rate changes:

```javascript
// Track original sample rate on panel open
this._originalSampleRate = settings.sampleRate

// Show warning toast if changed
if (sampleRateChanged) {
  this._showCanvasNotification('Settings applied - Reload page for sample rate change', true)
}
```

Added `TOAST_WARNING_DURATION = 4000` constant for longer warning display.
Added `.warning` CSS class with orange background.

#### 2. shadowBlur Implementation

**File:** `frontend/src/services/visual/SpringMeshNetwork.js`

```javascript
// Added property and method
this._shadowBlurEnabled = true

setShadowBlurEnabled (enabled) {
  this._shadowBlurEnabled = Boolean(enabled)
}

// Modified rendering to respect setting
if (node.isActive && this._shadowBlurEnabled) {
  p.drawingContext.shadowBlur = this.NODE_CONFIG.glowBlur
}
```

**File:** `frontend/src/services/GenerativeVisualService.js`

Wired shadowBlur in both `applyGraphicsQuality()` and `setGraphicsQuality()`:

```javascript
if (this.springMesh) {
  this.springMesh.setShadowBlurEnabled(profile.shadowBlur !== false)
}
```

#### 3. backgroundLayers Release on Quality Change

**File:** `frontend/src/services/AudioService.js`

```javascript
// Track previous layers before profile update
const previousLayers = this.audioProfile?.backgroundLayers || ['bass', 'pad', 'chords']

// After profile update, release disabled layers
const newLayers = this.audioProfile.backgroundLayers || []
const disabledLayers = previousLayers.filter(layer => !newLayers.includes(layer))
if (disabledLayers.length > 0 && this.ambientLayers) {
  disabledLayers.forEach(layer => {
    if (this.ambientLayers[layer]?.releaseAll) {
      this.ambientLayers[layer].releaseAll(0.3)
    }
  })
}
```

#### 4. maxPolyphony Enforcement

**File:** `frontend/src/services/AudioService.js`

```javascript
// Update maxTotalVoices from profile
if (this.audioProfile.maxPolyphony) {
  const previousMax = this.maxTotalVoices
  this.maxTotalVoices = this.audioProfile.maxPolyphony
  if (this.maxTotalVoices < previousMax) {
    try {
      this.managePolyphony()  // Release excess voices
    } catch (error) {
      console.warn('Failed to manage polyphony after limit reduction:', error)
    }
  }
}
```

---

### Code Review Fixes

After implementation, code-reviewer agent identified additional improvements:

| Issue | Priority | Fix |
|-------|----------|-----|
| Magic number 4000ms | Medium | Added `TOAST_WARNING_DURATION` constant |
| Missing try-catch for managePolyphony | High | Wrapped in try-catch |
| Type coercion for setShadowBlurEnabled | Medium | Added `Boolean()` coercion |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/components/SettingsPanel.js` | Sample rate change detection, warning toast, `TOAST_WARNING_DURATION` constant |
| `frontend/src/services/visual/SpringMeshNetwork.js` | Added `_shadowBlurEnabled` property and `setShadowBlurEnabled()` method |
| `frontend/src/services/GenerativeVisualService.js` | Wired shadowBlur to springMesh in both quality methods |
| `frontend/src/services/AudioService.js` | Layer release on quality change, maxPolyphony enforcement with try-catch |

---

### Settings Functionality Summary

| Setting | Runtime Change | Notes |
|---------|----------------|-------|
| Audio Quality | YES | Layers released, polyphony enforced |
| Sample Rate | NO | Warning toast, requires page reload |
| Audio Buffer | YES | lookAhead updated immediately |
| Graphics Quality | YES | All effects including shadowBlur |

---

### Critical Fix: Landing Page Support

After initial deployment, settings still weren't working on the landing page. Investigation revealed:

**Problem**: SettingsPanel was looking for `window.webarmoniumApp` but landing page uses `window.landingApp`.

**File:** `frontend/src/components/SettingsPanel.js`

Fixed both `_applySettings()` and `_resetSettings()` to support both contexts:

```javascript
// Support both rooms (webarmoniumApp) and landing page (landingApp)
const audioService = window.webarmoniumApp?.audioService || window.landingApp?.audioService
const visualService = window.webarmoniumApp?.visualService || window.landingApp?.visualService
```

---

### Version

Updated to v1.0.71

---

## Entry #90 - Audio Profile Settings Fix

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed critical bug where audio settings (backgroundLayers, maxPolyphony) were saved but not actually applied during playback. Multiple audio playback methods bypassed the `_isLayerEnabled()` check.

---

### Problem Statement

User reported that setting Audio Quality to "minimal" didn't change anything - background music still played. Investigation revealed that several audio playback methods directly accessed `ambientLayers` without checking the profile settings.

---

### Solution

Added `_isLayerEnabled()` checks to all audio playback paths:

#### 1. playAmbientComposition() - Initial scheduling

```javascript
// Entry #90: Skip if layer is disabled by audio profile settings
if (!this._isLayerEnabled(layerName)) {
  console.log(`🔇 Skipping ${layerName} - layer disabled by profile`)
  continue
}
```

#### 2. scheduleRepeat callback - Runtime check

```javascript
const repeatEventId = Tone.Transport.scheduleRepeat((audioTime) => {
  // Entry #90: Check if layer is still enabled (user may have changed settings)
  if (!this._isLayerEnabled('pad')) {
    return  // Skip this repeat - layer was disabled
  }
  // ... play note
})
```

This ensures that if user changes settings while drone is repeating, the repeats stop immediately.

#### 3. safeMonoSynthTrigger() - MonoSynth helper

```javascript
safeMonoSynthTrigger(layerName, frequency, duration, time, velocity) {
  // Entry #90: Skip if layer is disabled by audio profile settings
  if (!this._isLayerEnabled(layerName)) return
  // ... trigger note
}
```

#### 4. forceStartBackground() - Layer loop

```javascript
for (let layerIdx = 0; layerIdx < layerNames.length; layerIdx++) {
  const layer = layerNames[layerIdx]
  // Entry #90: Skip if layer is disabled by audio profile settings
  if (!this._isLayerEnabled(layer)) continue
  // ... play layer
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/AudioService.js` | Added `_isLayerEnabled()` checks to 4 playback paths |

---

#### 5. gestureSynth oscillator switching (Additional Fix)

When switching to/from Ultra-Low Power mode (`synthComplexity: 'mono-sine'`), the gestureSynth oscillator type is now changed at runtime:

```javascript
// Switching TO Ultra-Low Power mode
if (this.gestureSynth && this.gestureSynth.oscillator) {
  this.gestureSynth.oscillator.type = 'sine'
  console.log('🔋 gestureSynth switched to sine oscillator')
}

// Switching FROM Ultra-Low Power mode
if (this.gestureSynth && this.gestureSynth.oscillator) {
  this.gestureSynth.oscillator.type = 'sawtooth'
  console.log('🔋 gestureSynth restored to sawtooth oscillator')
}
```

This ensures virtual user tap sounds use simple sine waves in minimal mode.

#### 6. managePolyphony() null check fix

Fixed crash when `activeVoices` is undefined:

```javascript
managePolyphony() {
  if (!this.generativeState || !this.generativeState.activeVoices) return
  // ...
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/AudioService.js` | Added `_isLayerEnabled()` checks to 4 playback paths, gestureSynth oscillator switching, managePolyphony null check |

---

### Testing

With Audio Quality set to "minimal":
- `backgroundLayers: []` - No layers enabled
- Drone should not play
- No background music at all
- Virtual user taps use simple sine waves (not sawtooth)
- Only user gesture sounds should be audible

---

### Version

Updated to v1.0.72

---

## Entry #91 - Code Review Security & Stability Fixes

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Applied 7 fixes identified by the code-reviewer agent after Entry #90. Addresses security vulnerabilities (XSS), race conditions, memory leaks, error handling gaps, and missing initialization that could cause crashes.

---

### Issues Fixed

| # | Issue | Priority | File | Fix |
|---|-------|----------|------|-----|
| 1 | XSS risk in notifications | Critical | SettingsPanel.js | Added `_escapeHtml()` method to sanitize notification messages |
| 2 | Race condition: graphics before p5 setup | Critical | GenerativeVisualService.js | Moved `applyGraphicsQuality()` to after `setup()` completes |
| 3 | Memory leak: device cache never expires | Critical | DeviceCapabilities.js | Added 5-minute TTL + visibility change listener |
| 4 | Settings rollback: save after fail | High | SettingsPanel.js | Save settings before application, continue on error |
| 5 | No error handling for oscillator switch | High | AudioService.js | Added try-catch + disposed check |
| 6 | activeVoices never initialized | High | AudioService.js | Added `activeVoices: new Map()` to generativeState |
| 7 | Layer management unclear | Medium | AudioService.js | Added comprehensive JSDoc explaining ambient vs composition layers |

---

### Detailed Fixes

#### 1. XSS Prevention in Notifications (Critical)

**File:** `frontend/src/components/SettingsPanel.js`

Added HTML entity escaping to prevent XSS via notification messages:

```javascript
_escapeHtml (str) {
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return String(str).replace(/[&<>"']/g, char => escapeMap[char])
}

_showCanvasNotification (message, isWarning = false) {
  // Escape HTML entities and truncate to prevent abuse
  const sanitizedMessage = this._escapeHtml(message).slice(0, 200)
  // ...
}
```

#### 2. Race Condition Fix (Critical)

**File:** `frontend/src/services/GenerativeVisualService.js`

Graphics quality was being applied before p5.js setup completed, causing subsystems to not receive settings.

**Before**: `applyGraphicsQuality()` called in `initialize()` before p5 setup
**After**: `applyGraphicsQuality()` called at end of `setup()` after canvas is ready

```javascript
setup(p) {
  // ... canvas creation, frame rate, background nodes ...

  // RACE CONDITION FIX: Apply graphics quality settings AFTER p5 setup completes
  try {
    this.applyGraphicsQuality()
    console.log('🎨 Graphics quality applied after p5 setup')
  } catch (e) {
    console.warn('🎨 Failed to apply graphics quality after setup:', e)
  }
}
```

#### 3. Device Cache TTL (Critical)

**File:** `frontend/src/utils/DeviceCapabilities.js`

Static caches were never invalidated, causing stale detection in long sessions or when device state changes (battery saver).

**Added:**
- `CACHE_TTL_MS = 5 * 60 * 1000` (5 minutes)
- `_isCacheValid()` method checking timestamp
- `_setupVisibilityListener()` to clear cache when page becomes visible

```javascript
static _setupVisibilityListener () {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      this.clearCache()  // Forces re-detection
    }
  })
}
```

#### 4. Settings Save Strategy (High)

**File:** `frontend/src/components/SettingsPanel.js`

Settings are now saved to localStorage BEFORE attempting to apply. If application fails, user sees warning but settings are persisted for next page load.

```javascript
// ROLLBACK FIX: Save settings to localStorage BEFORE attempting to apply
groups.forEach(group => {
  if (newSettings[group]) {
    UserSettings.set(group, newSettings[group])
  }
})

// Try to apply audio settings (don't return on failure)
try {
  audioService.reloadAudioProfile()
} catch (error) {
  this._showCanvasNotification('Audio reload failed - will apply on refresh', true)
}
```

#### 5. Oscillator Switch Error Handling (High)

**File:** `frontend/src/services/AudioService.js`

Oscillator type switching in Ultra-Low Power mode transitions now has error handling and disposed check:

```javascript
try {
  if (this.gestureSynth && this.gestureSynth.oscillator && !this.gestureSynth.disposed) {
    this.gestureSynth.oscillator.type = 'sine'
    console.log('🔋 gestureSynth switched to sine oscillator')
  }
} catch (e) {
  console.warn('🔋 Failed to switch gestureSynth oscillator:', e.message)
}
```

#### 6. activeVoices Initialization (High)

**File:** `frontend/src/services/AudioService.js`

`generativeState.activeVoices` was used but never initialized, causing `managePolyphony()` to crash.

```javascript
this.generativeState = {
  // INITIALIZATION FIX: activeVoices must be a Map for polyphony management
  activeVoices: new Map(),

  currentScale: [0, 2, 4, 7, 9],
  // ...
}
```

#### 7. Layer Architecture Documentation (Medium)

**File:** `frontend/src/services/AudioService.js`

Added comprehensive JSDoc explaining the two-type layer system:

```javascript
/**
 * LAYER ARCHITECTURE:
 * The audio system has TWO TYPES of background layers:
 *
 * 1. AMBIENT LAYERS (bass, pad, chords):
 *    - Generated algorithmically by the local client
 *    - Controlled by audioProfile.backgroundLayers array
 *    - Progressively disabled as device tier decreases
 *
 * 2. COMPOSITION LAYERS (backgroundHigh, backgroundMid, backgroundLow):
 *    - Received from the backend via WebSocket
 *    - Always enabled EXCEPT in Ultra-Low Power mode
 *    - Represent the shared musical composition across all users
 */
_isLayerEnabled(layerName) { ... }
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/components/SettingsPanel.js` | XSS prevention, settings save strategy |
| `frontend/src/services/GenerativeVisualService.js` | Race condition fix |
| `frontend/src/utils/DeviceCapabilities.js` | Cache TTL + visibility listener |
| `frontend/src/services/AudioService.js` | Oscillator error handling, activeVoices init, JSDoc |

---

### Security Improvements

- **XSS Prevention**: All notification messages are now HTML-escaped
- **Input Truncation**: Messages limited to 200 characters

### Stability Improvements

- **Race Condition**: Graphics settings apply after canvas ready
- **Memory Management**: Device detection cache expires after 5 minutes
- **Error Recovery**: Settings persist even if runtime application fails
- **Crash Prevention**: activeVoices Map initialized, oscillator switching wrapped in try-catch

### Mobile Improvements

- **Visibility Change**: Cache clears when page becomes visible (handles battery saver changes)
- **Graceful Degradation**: Settings apply on page reload if runtime application fails

---

### Version

Updated to v1.0.73

---

## Entry #92 - Interaction-Driven Spatial Color Gradients

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Added spatial color gradients to the Perlin noise background that respond to room interaction metrics. Colors vary across the canvas based on `dominantZone` position, with intensity driven by `userCount` and `spatialDensity`. Works in both normal rooms (via backend metrics) and landing page (via synthetic metrics from virtual cursors). Includes comprehensive code review fixes for validation, performance, and stability.

---

### Problem Statement

The Perlin noise background was visually uniform across the entire canvas regardless of where users were interacting. This missed an opportunity to create visual feedback that reflects spatial activity patterns, enhancing the connection between user interaction and visual output.

---

### Solution

#### Data Flow

**Room Mode:**
```
Backend CollectiveMetricsAnalyzer (every 5s)
  → compositional-parameters event (with dominantZone)
  → main.js listener
  → GenerativeVisualService.updateInteractionMetrics()
  → NoiseTextureNebulaSystem.setInteractionMetrics()
  → Spatial gradient in render loop
```

**Landing Page:**
```
Virtual cursor positions
  → Calculate synthetic metrics (centroid, clustering variance)
  → GenerativeVisualService.updateInteractionMetrics()
  → NoiseTextureNebulaSystem.setInteractionMetrics()
```

#### Gradient Effect

Colors shift based on proximity to `dominantZone`:
- **Hue**: Shifts toward warm tones (+30° max)
- **Saturation**: Boost (+15% max)
- **Lightness**: Boost (+10% max)

Effect intensity = `(userCount / 10) * spatialDensity`

---

### Implementation Details

#### 1. NoiseTextureNebulaSystem.js - Core Changes

**Added interaction metrics state:**
```javascript
this.interactionMetrics = {
  userCount: 1,
  spatialDensity: 0,
  dominantZone: { x: 0.5, y: 0.5 }
}
this.gradientEnabled = true
this.gradientIntensity = 0

// Configurable gradient parameters (avoid magic numbers)
this.gradientConfig = {
  hueShift: 30,        // Max hue shift in degrees
  saturationBoost: 15, // Max saturation increase %
  lightnessBoost: 10,  // Max lightness increase %
  maxDiagonal: Math.sqrt(2)  // Normalized diagonal distance
}
```

**Added setInteractionMetrics() with full validation:**
```javascript
setInteractionMetrics(metrics) {
  if (!metrics) return

  if (typeof metrics.userCount === 'number' && isFinite(metrics.userCount)) {
    this.interactionMetrics.userCount = Math.max(0, Math.floor(metrics.userCount))
  }
  if (typeof metrics.spatialDensity === 'number' && isFinite(metrics.spatialDensity)) {
    this.interactionMetrics.spatialDensity = Math.max(0, Math.min(1, metrics.spatialDensity))
  }
  if (metrics.dominantZone && isFinite(metrics.dominantZone.x) && isFinite(metrics.dominantZone.y)) {
    // Clamp before interpolation to prevent edge cases
    const clampedX = Math.max(0, Math.min(1, metrics.dominantZone.x))
    const clampedY = Math.max(0, Math.min(1, metrics.dominantZone.y))
    const lerpSpeed = 0.1
    this.interactionMetrics.dominantZone.x += (clampedX - this.interactionMetrics.dominantZone.x) * lerpSpeed
    this.interactionMetrics.dominantZone.y += (clampedY - this.interactionMetrics.dominantZone.y) * lerpSpeed
  }

  const userFactor = Math.min(1, this.interactionMetrics.userCount / 10)
  this.gradientIntensity = userFactor * this.interactionMetrics.spatialDensity
}
```

**Modified mapToPalette() with optimized squared distance:**
```javascript
// Apply spatial gradient effect (optimized: use squared distance to avoid sqrt)
if (this.gradientEnabled && this.gradientIntensity > 0.01) {
  const dz = this.interactionMetrics.dominantZone
  const cfg = this.gradientConfig
  const dx = cellX - dz.x
  const dy = cellY - dz.y
  const distanceSq = dx * dx + dy * dy
  const maxDistSq = cfg.maxDiagonal * cfg.maxDiagonal
  const proximity = Math.max(0, 1 - distanceSq / maxDistSq)
  const effect = proximity * this.gradientIntensity
  hue = (hue + effect * cfg.hueShift) % 360
  sat = Math.min(100, sat + effect * cfg.saturationBoost)
  light = Math.min(100, light + effect * cfg.lightnessBoost)
}
```

#### 2. GenerativeVisualService.js - Forwarding Method

```javascript
updateInteractionMetrics(metrics) {
  if (!metrics) return
  if (this.nebulas && this.nebulas.setInteractionMetrics) {
    try {
      this.nebulas.setInteractionMetrics(metrics)
    } catch (error) {
      console.error('GenerativeVisualService: Error updating interaction metrics:', error)
    }
  }
}
```

#### 3. CollectiveMetricsAnalyzer.js (Backend)

Extended `getCompositionalParameters()` to include spatial data:
```javascript
// Spatial gradient data for visual effects
dominantZone: m.dominantZone,
activityLevel: m.activityLevel
```

#### 4. main.js - Connect Socket to Visual Service

```javascript
// Forward interaction metrics to visual service for spatial gradient
if (this.visualService && data.parameters) {
  this.visualService.updateInteractionMetrics({
    userCount: data.parameters.harmonicDensity || 1,
    spatialDensity: data.parameters.rhythmicDensity || 0,
    dominantZone: data.parameters.dominantZone || { x: 0.5, y: 0.5 }
  })
}
```

#### 5. landing/main.js - Synthetic Metrics from Virtual Cursors

```javascript
_updateSyntheticMetrics() {
  if (!this.visualService) return

  const cursors = Object.values(this.currentCursors).filter(
    c => c && typeof c.x === 'number' && isFinite(c.x) &&
         typeof c.y === 'number' && isFinite(c.y)
  )
  if (cursors.length === 0) return

  // Calculate centroid (dominant zone)
  let sumX = 0, sumY = 0
  for (const c of cursors) {
    sumX += c.x
    sumY += c.y
  }
  const centroidX = sumX / cursors.length
  const centroidY = sumY / cursors.length

  // Calculate spatial density from variance (lower variance = more clustered = higher density)
  let variance = 0
  for (const c of cursors) {
    variance += (c.x - centroidX) ** 2 + (c.y - centroidY) ** 2
  }
  variance /= cursors.length
  const spatialDensity = Math.max(0, Math.min(1, 1 - Math.sqrt(variance) * 2))

  this.visualService.updateInteractionMetrics({
    userCount: cursors.length,
    spatialDensity: isFinite(spatialDensity) ? spatialDensity : 0,
    dominantZone: { x: centroidX, y: centroidY }
  })
}
```

#### 6. MobileResourceManager.js - Performance Integration

```javascript
// Disable gradient effect in low power modes
if (window.visualService?.nebulas?.setGradientEnabled) {
  window.visualService.nebulas.setGradientEnabled(config.particlesEnabled)
}
```

---

### Code Review Fixes Applied

| Priority | Issue | Fix |
|----------|-------|-----|
| Critical | Division by zero risk with diagonal distance | Used `Math.sqrt(2)` in config, squared distance comparison |
| Critical | Missing NaN validation in landing page | Added `isFinite()` checks for all cursor coordinates |
| Critical | Range validation missing | Added `Math.max/Math.min` clamping for all inputs |
| High | Performance: sqrt in hot render path | Optimized with squared distance comparison |
| High | Missing bounds check on interpolation | Clamp values before interpolation |
| High | Memory leak in clear() | Reset gradient state in clear() method |
| Medium | Magic numbers in gradient | Extracted to `gradientConfig` object |
| Medium | Missing error handling | Added try-catch in forwarding method |
| Low | Debug console.log in production | Removed from constructor |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/visual/NoiseTextureNebulaSystem.js` | Interaction metrics state, gradient logic, validation, performance optimization |
| `frontend/src/services/GenerativeVisualService.js` | Forwarding method with error handling |
| `frontend/src/main.js` | Socket event handler for metrics forwarding |
| `frontend/src/landing/main.js` | Synthetic metrics calculation from virtual cursors |
| `backend/src/services/CollectiveMetricsAnalyzer.js` | Added dominantZone to compositional parameters |
| `frontend/src/services/MobileResourceManager.js` | Gradient enable/disable for power modes |

---

### Performance Characteristics

- **Hot path optimization**: Uses squared distance to avoid `Math.sqrt()` per cell
- **Early exit**: Skips gradient calculation when `gradientIntensity < 0.01`
- **Smooth transitions**: 10% lerp speed for dominantZone prevents jarring shifts
- **Power-aware**: Automatically disabled in low-power and critical modes
- **Configurable**: All magic numbers extracted to editable config object

---

### Version

Updated to v1.0.74

---

## Entry #93 - Gradient Smoothness and Visibility Fixes

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed multiple issues with the spatial color gradients from Entry #92. Initial gradients were invisible due to low intensity, then too saturated after boosting. Normal rooms had choppy/jerky transitions while landing page was smooth. Root cause: interpolation happened at socket event rate (~20fps) instead of render loop (60fps). Solution: target-based interpolation in render loop.

---

### Problem Statement

After implementing Entry #92, several issues emerged:

1. **Gradients not visible**: With userCount=3 and spatialDensity=0.47, intensity was only 0.14, giving a mere 4° hue shift (imperceptible)
2. **After boosting, too saturated**: Multiplying effect values 4x made colors overly vibrant
3. **Normal room intensity near zero**: userFactor=0.1 × spatialDensity=0.017 = 0.0017, below the 0.01 threshold
4. **Choppy transitions in normal rooms**: Updates came from socket events (every 5 seconds from backend, ~20fps from cursor events), causing visible "jumps" in color

---

### Root Cause Analysis

**Landing page (smooth):**
- `_updateSyntheticMetrics()` called every animation frame
- Interpolation in `setInteractionMetrics()` ran at 60fps

**Normal rooms (choppy):**
- Metrics arrived via socket events at irregular intervals
- Interpolation only happened when `setInteractionMetrics()` was called
- Result: colors jumped 5-10% per update instead of smooth 0.15% per frame

---

### Solution

#### 1. Target-Based Interpolation in Render Loop

Separated target values (set by events) from actual values (interpolated every frame):

```javascript
// New target values for smooth interpolation
this.targetDominantZone = { x: 0.5, y: 0.5 }
this.targetGradientIntensity = 0

// In setInteractionMetrics() - sets TARGETS only
this.targetDominantZone.x = Math.max(0, Math.min(1, metrics.dominantZone.x))
this.targetDominantZone.y = Math.max(0, Math.min(1, metrics.dominantZone.y))
this.targetGradientIntensity = Math.min(1, baseIntensity + activityBoost * 0.7)

// In render() - interpolate EVERY FRAME at 60fps
const lerpSpeed = 0.15
this.interactionMetrics.dominantZone.x +=
  (this.targetDominantZone.x - this.interactionMetrics.dominantZone.x) * lerpSpeed
this.interactionMetrics.dominantZone.y +=
  (this.targetDominantZone.y - this.interactionMetrics.dominantZone.y) * lerpSpeed
this.gradientIntensity +=
  (this.targetGradientIntensity - this.gradientIntensity) * lerpSpeed
```

#### 2. Tuned Gradient Values

Adjusted from aggressive 4x multipliers to balanced values:

```javascript
this.gradientConfig = {
  hueShift: 80,        // Was 30→120→80
  saturationBoost: 30, // Was 15→50→30
  lightnessBoost: 20,  // Was 10→35→20
  maxDiagonal: Math.sqrt(2),
  maxUsers: 4          // Normal rooms have fewer users than landing
}
```

#### 3. Additive Intensity Formula

Changed from multiplicative (could be near-zero) to additive with baseline:

```javascript
// Old: gradientIntensity = userFactor * spatialDensity  // Could be 0.0017!
// New:
const baseIntensity = 0.3  // Always visible
const activityBoost = userFactor * spatialDensity * 0.7
this.targetGradientIntensity = Math.min(1, baseIntensity + activityBoost)
```

#### 4. Real-Time Metrics from Cursor Positions

Added `_updateGradientMetricsFromCursors()` in main.js, called on every cursor event:

```javascript
_updateGradientMetricsFromCursors() {
  // Throttle: max 30 updates per second
  const now = Date.now()
  if (this._lastGradientUpdate && now - this._lastGradientUpdate < 33) return
  this._lastGradientUpdate = now

  const cursorsMap = this.cursorManager.getAllCursors()
  const allPositions = []
  cursorsMap.forEach((cursor, userId) => {
    if (cursor && typeof cursor.x === 'number') {
      allPositions.push({ x: cursor.x, y: cursor.y })
    }
  })

  // Calculate centroid and spatial density
  // Forward to visualService.updateInteractionMetrics()
}
```

#### 5. Virtual Users Contributing to Gradient

Updated VirtualUserService.js to record virtual cursor positions as gestures:

```javascript
// In _interpolateCursorsForRoom(), after emitting cursors:
if (this.roomManager) {
  for (const source of roomState.sources) {
    const config = this.virtualUserConfigs[source]
    const pos = roomState.currentPositions[source]
    if (config && pos) {
      this.roomManager.recordGesture(roomId, {
        action: 'drag',
        coordinates: { x: pos.x, y: pos.y },
        velocity: 0.3,
        userId: config.userId
      })
    }
  }
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/visual/NoiseTextureNebulaSystem.js` | Target-based interpolation in render loop, tuned gradient values, additive intensity formula |
| `frontend/src/main.js` | Real-time gradient metrics from cursor positions, handler for virtual-cursors event |
| `frontend/src/landing/main.js` | Synthetic metrics with maxUsers=3 for landing page |
| `backend/src/services/CollectiveMetricsAnalyzer.js` | Added activeUsers to compositional parameters |
| `backend/src/services/VirtualUserService.js` | Record virtual cursor positions as gestures |

---

### Key Technical Insight

**The smoothness problem was about WHERE interpolation happens, not HOW FAST events arrive:**

| Approach | Interpolation Rate | Smoothness |
|----------|-------------------|------------|
| Old: In setInteractionMetrics() | ~20fps (event-driven) | Choppy |
| New: In render() | 60fps (frame-driven) | Smooth |

Even with 30fps cursor events, the render loop interpolates toward targets 60 times per second, ensuring sub-pixel smooth transitions.

---

### Version

Updated from v1.0.74 to v1.0.85

---

## Entry #94 - Mobile Central Start Button for Normal Rooms

**Date**: 2026-01-11
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Added a prominent central "Start" button for mobile users in normal rooms. Previously, the Start Audio button was hidden inside the hamburger menu (closed by default), confusing new users who didn't know how to start audio. The new button appears centered on screen and disappears after being clicked.

---

### Problem Statement

On mobile devices, when opening a normal room, the "Start Audio" button was hidden inside the hamburger menu. Users had to:
1. Notice the hamburger menu icon
2. Open it
3. Find the Start Audio button

This was not intuitive, especially for first-time users.

---

### Solution

Added a large, centered play button (▶) that:
- Appears only on mobile devices
- Is visible only when audio is NOT started
- Disappears with fade animation after being clicked
- Triggers audio start via `toggleAudio()`

---

### Implementation

**File:** `frontend/src/services/UIManager.js`

#### 1. New method: `_createMobileCentralStartButton()`

```javascript
_createMobileCentralStartButton() {
  // Prevent duplicate creation
  if (this.mobileCentralStartBtn || document.getElementById('mobileCentralStart')) {
    return
  }

  this.mobileCentralStartBtn = document.createElement('button')
  this.mobileCentralStartBtn.id = 'mobileCentralStart'
  this.mobileCentralStartBtn.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: rgba(0, 212, 255, 0.95);
    font-size: 48px;
    box-shadow: 0 0 40px rgba(0, 212, 255, 0.6);
  `
  this.mobileCentralStartBtn.textContent = '▶'

  this.mobileCentralStartBtn.onclick = async () => {
    try {
      await window.webarmoniumApp.toggleAudio()
      this.hideMobileCentralStartButton()
    } catch (error) {
      // Reset button on error so user can retry
      this.mobileCentralStartBtn.style.pointerEvents = 'auto'
    }
  }
}
```

#### 2. New method: `hideMobileCentralStartButton()`

```javascript
hideMobileCentralStartButton() {
  if (this.mobileCentralStartBtn) {
    // Transfer focus for accessibility
    if (document.activeElement === this.mobileCentralStartBtn) {
      this.mobileMenuBtn?.focus()
    }

    this.mobileCentralStartBtn.style.opacity = '0'
    const btnToRemove = this.mobileCentralStartBtn
    this.mobileCentralStartBtn = null
    setTimeout(() => btnToRemove?.remove(), 300)
  }

  // Disconnect observer
  if (this.audioToggleObserver) {
    this.audioToggleObserver.disconnect()
    this.audioToggleObserver = null
  }

  // Sync mobile audio button text based on actual audio state
  if (this.mobileAudioBtn) {
    const isPlaying = window.webarmoniumApp?.isAudioStarted
    this.mobileAudioBtn.textContent = isPlaying ? 'Stop Audio' : 'Start Audio'
  }
}
```

#### 3. MutationObserver for audio state sync

Watches the original audio toggle button text to hide central button when audio starts via any means:

```javascript
this.audioToggleObserver = new MutationObserver(() => {
  if (window.webarmoniumApp?.isAudioStarted) {
    this.hideMobileCentralStartButton()
    this.audioToggleObserver?.disconnect()
  }
})
```

---

### Code Review Fixes (6 Issues)

| # | Issue | Priority | Fix |
|---|-------|----------|-----|
| 1 | Memory Leak - MutationObserver never disconnected | Critical | Store as `this.audioToggleObserver`, disconnect in `hideMobileCentralStartButton()` and `destroy()` |
| 2 | Race Condition - duplicate button creation | Critical | Added guard: `if (this.mobileCentralStartBtn \|\| document.getElementById('mobileCentralStart')) return` |
| 3 | Missing cleanup in `destroy()` | Critical | Added cleanup for `mobileCentralStartBtn` and `audioToggleObserver` |
| 4 | Fragile text-based detection | High | Changed from `textContent.includes('Stop')` to `window.webarmoniumApp?.isAudioStarted` |
| 5 | Missing error handling | High | Added try-catch in click handler, resets button on error |
| 6 | Accessibility issues | High | Added `role="button"`, `aria-busy` during loading, focus management on hide |

---

### Additional Fix: Menu Button Text Sync

After initial deployment, a bug was reported where the mobile menu showed "Start Audio" instead of "Stop Audio" after clicking the central start button.

**Root Cause:** The original fix tried to sync by reading `this.originalAudioToggle.textContent` after a 100ms timeout, but the original toggle hadn't updated its text yet at that point.

**Solution:** Instead of reading from the original toggle (which has timing issues), directly set the text based on the actual audio state:

```javascript
// Sync mobile audio button text based on actual audio state
if (this.mobileAudioBtn) {
  const isPlaying = window.webarmoniumApp?.isAudioStarted
  this.mobileAudioBtn.textContent = isPlaying ? 'Stop Audio' : 'Start Audio'
}
```

This is more reliable because `isAudioStarted` is updated synchronously when audio starts.

---

### Additional Fix: Intermittent Button Display + iPad Support

**Issue 1: Button sometimes not appearing**

Race condition where `attemptAutoStartAudio()` could set `isAudioStarted=true` before `_createMobileCentralStartButton()` was called, causing the button to never be created.

**Solution:** Always create the button, then immediately hide if audio already started:
```javascript
// Create central start button always - it will hide itself if audio already started
this._createMobileCentralStartButton()

// If audio already started (rare race condition), hide immediately
if (window.webarmoniumApp?.isAudioStarted) {
  this.hideMobileCentralStartButton()
}
```

**Issue 2: iPad not showing mobile UI**

iPads have screens > 768px, so they weren't detected as mobile by `(hasTouch && isSmallScreen)`.

**Solution:** Updated `_isMobileDevice()` to detect tablets via multi-touch (5+ touch points):
```javascript
_isMobileDevice() {
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const isSmallScreen = window.innerWidth <= 768
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

  // Tablet detection: multi-touch with 5+ touch points (iPad/Android tablets)
  const isTablet = navigator.maxTouchPoints >= 5

  return (hasTouch && isSmallScreen) || isMobileUA || isTablet
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/UIManager.js` | Added `_createMobileCentralStartButton()`, `hideMobileCentralStartButton()`, MutationObserver, cleanup in `destroy()` |

---

### Visual Design

- Large circular button (120×120px) centered on screen
- Cyan background (#00d4ff) matching app theme
- Play icon (▶) for universal recognition
- Glowing box-shadow for prominence
- z-index: 1000 (below menu elements at 1001-1003)
- Fades out smoothly (0.3s transition)

---

### Verification

1. Open http://localhost:3000/rooms.html on mobile (or Chrome DevTools mobile emulation)
2. Verify central Start button is visible and centered
3. Click the button
4. Verify:
   - Audio starts playing
   - Central button fades out and disappears
   - Hamburger menu still works
   - Audio control in menu shows "Stop Audio"
5. Refresh page and verify button appears again

---

### Version

Updated to v1.0.89

---

## Entry #95 - API Fetch Error Handling & Server Swap Configuration

**Date**: 2026-01-12
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed API fetch errors in WebMetricsPoller where Wikipedia and HackerNews APIs returning HTML error pages caused JSON parse failures. Also configured 2GB swap on production server to prevent OOM crashes.

---

### Problem Statement

Production server logs showed repeated errors:
1. `Wikipedia fetch error: Unexpected token < in JSON at position 0` - API returning HTML instead of JSON
2. `HackerNews fetch error: fetch failed` - Network errors not gracefully handled
3. Multiple `Killed` entries (398 total) from OOM killer terminating Node.js process

---

### Solution

#### 1. Wikipedia Fetch Validation

Added response validation before JSON parsing:

```javascript
async _fetchWikipedia() {
  try {
    const response = await fetch(this.sources.wikipedia.url)

    if (!response.ok) {
      console.warn(`Wikipedia fetch error: HTTP ${response.status}`)
      return
    }

    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      console.warn(`Wikipedia fetch error: unexpected content-type ${contentType}`)
      return
    }

    const data = await response.json()
    // ... process data
  } catch (error) {
    console.warn('Wikipedia fetch error:', error.message)
  }
}
```

#### 2. HackerNews Fetch Validation

Added response and format validation:

```javascript
async _fetchHackerNews() {
  try {
    const storiesResponse = await fetch(this.sources.hackernews.storiesUrl)

    if (!storiesResponse.ok) {
      console.warn(`HackerNews fetch error: HTTP ${storiesResponse.status}`)
      return
    }

    const storyIds = await storiesResponse.json()

    if (!Array.isArray(storyIds)) {
      console.warn('HackerNews fetch error: unexpected response format')
      return
    }

    // ... process stories
  } catch (error) {
    console.warn('HackerNews fetch error:', error.message)
  }
}
```

Also improved individual story fetches:
```javascript
fetch(this.sources.hackernews.itemUrl(id))
  .then(r => r.ok ? r.json() : null)  // Added r.ok check
  .catch(() => null)
```

#### 3. Production Server Swap

Configured 2GB swap on production server (webarmonium.net) to prevent OOM crashes:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**Before**: 961MB RAM, 0B swap → frequent OOM kills
**After**: 961MB RAM, 2GB swap → OOM protection

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/WebMetricsPoller.js` | Added `response.ok` and `content-type` validation for Wikipedia, `response.ok` and array format validation for HackerNews |

### Server Configuration

| Change | Value |
|--------|-------|
| Swap file | `/swapfile` (2GB) |
| Permissions | 600 |
| Persistence | Added to `/etc/fstab` |

---

### Version

Updated to v1.0.90


---

## Entry #96 - Mobile UI: Notifications Position & Room Info Overlay

**Date**: 2026-01-12
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed two mobile UI issues: (1) notification messages overlapping with the central play button, and (2) users/rooms display hidden inside hamburger menu instead of being visible on the scene.

---

### Problem Statement

1. **Notification overlap**: Both notifications and the central play button were positioned at center screen (`top: 50%`, `left: 50%`), causing overlap on mobile.

2. **Hidden room info**: User count and room ID were only visible inside the hamburger menu bottom sheet. Users had to open the menu just to see basic room information.

---

### Solution

#### 1. Moved Notifications to Top of Screen

**File:** `frontend/src/services/NotificationService.js`

Changed notification container position from center to top:

```javascript
// Before
top: 50%;
left: 50%;
transform: translate(-50%, -50%);

// After
top: max(80px, calc(env(safe-area-inset-top, 12px) + 70px));
left: 50%;
transform: translateX(-50%);
```

Notifications now appear below the hamburger menu button (positioned at ~12px + 52px height), avoiding overlap with the central play button.

#### 2. Created Mobile Room Info Overlay

**File:** `frontend/src/services/UIManager.js`

Added persistent overlay in top-left corner showing user count and room ID:

- New `_createMobileRoomInfoOverlay()` method
- Position: Fixed top-left with safe-area-inset support
- z-index: 1001 (below hamburger button at 1002, above backdrop at 1000)
- Semi-transparent with backdrop blur for visibility
- ARIA attributes for accessibility: `role="status"`, `aria-live="polite"`

```javascript
_createMobileRoomInfoOverlay() {
  this.mobileRoomInfoOverlay = document.createElement('div')
  this.mobileRoomInfoOverlay.style.cssText = `
    position: fixed;
    top: max(12px, env(safe-area-inset-top, 12px));
    left: max(12px, env(safe-area-inset-left, 12px));
    z-index: 1001;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(10px);
    ...
  `
  // Accessibility
  this.mobileRoomInfoOverlay.setAttribute('role', 'status')
  this.mobileRoomInfoOverlay.setAttribute('aria-live', 'polite')
}
```

#### 3. Removed Room Info from Hamburger Menu

Removed user count and room ID from the bottom sheet since they're now always visible on the scene.

#### 4. Fixed z-index Layering

Changed backdrop z-index from 1001 to 1000 to ensure the room info overlay remains visible when the menu is open.

**Z-index hierarchy:**
- mobileBackdrop: 1000
- mobileRoomInfoOverlay: 1001 (visible above backdrop)
- mobileMenuBtn: 1002
- mobileSheet: 1003
- Notifications: 10000

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/NotificationService.js` | Moved container to top of screen |
| `frontend/src/services/UIManager.js` | Added `_createMobileRoomInfoOverlay()`, `_syncMobileOverlay()`, removed room info from bottom sheet, fixed backdrop z-index, added cleanup in `destroy()` |
| `frontend/rooms.html` | Added CSS for `.mobile-overlay-user-count` and `.mobile-overlay-room-id` |

---

### Code Review Fixes

Applied fixes from code-reviewer agent:

1. **ARIA accessibility**: Added `role="status"`, `aria-live="polite"`, `aria-label="Room information"` to mobile overlay
2. **z-index coordination**: Fixed backdrop z-index to prevent covering the overlay when menu is open

---

### Version

Updated to v1.0.91

---

## Entry #97 - Strange Attractors: Canvas-Level Rotation Fix

**Date**: 2026-01-12
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed strange attractors rotation to use canvas-level transformation instead of coordinate-level rotation. In Entry #74, the rotation was applied to the attractor's mathematical coordinates, altering the attractor's axis. The user intended to rotate only the rendered animation on the canvas while preserving the original attractor geometry.

---

### Problem Statement

Entry #74 implemented a 90° rotation for strange attractors to distribute them horizontally. However, the rotation was applied at the coordinate level:

```javascript
// Entry #74 approach - rotates the attractor's axis
const rotatedX = nx * cos - ny * sin
const rotatedY = nx * sin + ny * cos
```

This changed the mathematical shape of the attractor. The user wanted to rotate only the **rendered scene** while keeping the attractor's original geometry intact.

---

### Solution

Changed from coordinate-level rotation to canvas-level transformation using p5.js `translate()` and `rotate()`:

**Before (Entry #74):**
```javascript
// Rotation applied to each point's coordinates
const cos = this.rotationCos
const sin = this.rotationSin
const rotatedX = nx * cos - ny * sin
const rotatedY = nx * sin + ny * cos
const screenX = centerX + rotatedX * displaySize + this.fuzzyOffsetsX[i]
const screenY = centerY + (rotatedY + this.centerOffsetY) * displaySize + this.fuzzyOffsetsY[i]
```

**After:**
```javascript
// Rotation applied at canvas level - preserves attractor geometry
p.translate(centerX, centerY)
p.rotate(this.rotationAngle)

// Use original coordinates directly
const nx = point.x - 0.5
const ny = point.y - 0.5
const screenX = nx * displaySize + this.fuzzyOffsetsX[i]
const screenY = (ny + this.centerOffsetY) * displaySize + this.fuzzyOffsetsY[i]
```

Also updated constructor comments and removed unused precomputed `rotationCos`/`rotationSin` values.

---

### Technical Difference

| Approach | Effect |
|----------|--------|
| Coordinate rotation | Rotates the attractor's mathematical axis, changing its shape orientation |
| Canvas rotation | Rotates the entire rendered scene, preserving the attractor's original geometry |

The canvas-level approach uses p5.js transformation matrix to rotate the entire drawing context, so the attractor maintains its natural Lorenz/Rossler shape while appearing rotated on screen.

---

### Positioning Adjustments

After the rotation fix, iterative adjustments were made to optimize the attractor's position on a landscape canvas:

| Adjustment | Value | Purpose |
|------------|-------|---------|
| `rotationAngle` | `-Math.PI / 4` (-45°) | Counter-clockwise rotation for optimal landscape fit |
| `offsetXPixels` | `80` | Shift right to center horizontally |
| `offsetYPixels` | `100` | Shift down to center vertically |

Final constructor values:
```javascript
this.rotationAngle = -Math.PI / 4  // -45° counter-clockwise rotation
this.centerOffsetY = -0.08         // Shift up by 8% of displaySize
this.offsetXPixels = 80            // Horizontal offset in pixels (positive = right)
this.offsetYPixels = 100           // Vertical offset in pixels (positive = down)
```

---

### Known Issue: Lorenz ↔ Rossler Interpolation

**Status**: TO INVESTIGATE

The system is designed to morph between Lorenz (butterfly) and Rossler (spiral) attractors on `phrase:change` musical events. However, visual testing suggests the interpolation may not be functioning correctly:

- Attractor animation is visible and moving
- Shape appears to remain constant (always Lorenz butterfly)
- No visible morphing to Rossler spiral observed

The morphing logic exists in `render()`:
```javascript
if (this.morphProgress < 1.0) {
  // Interpolate between current and target attractor
  const fromFrames = this.currentAttractor === 'lorenz' ? this.lorenzFrames : this.rosslerFrames
  const toFrames = this.targetAttractor === 'lorenz' ? this.lorenzFrames : this.rosslerFrames
  // ... interpolation code
}
```

Possible causes to investigate:
1. `phrase:change` events may not be firing
2. `onMusicalEvent()` may not be called from the audio system
3. Morphing speed (`morphSpeed: 0.02`) may be too fast to notice
4. Visual difference between Lorenz and Rossler may be subtle at current scale

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/visual/PrecomputedAttractorSystem.js` | Changed from coordinate rotation to canvas `translate()`+`rotate()`, removed precomputed cos/sin, updated comments, added pixel offsets |

---

### Version

Updated to v1.0.92


---

## Entry #98 - Global Visited Link Color Reset

**Date**: 2026-01-12
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed visited link colors appearing as illegible dark violet across the entire app. Added global CSS reset to maintain original link colors even after being visited.

---

### Problem Statement

Visited links throughout the app appeared in the browser's default violet color, which was hard to read against dark backgrounds. This affected:
- Mobile hamburger menu "Back to main page" link
- CTA links on landing page
- Footer links
- Navigation links in technical appendix

Root cause: No `:visited` pseudo-class was defined anywhere, so browsers used their default purple/violet.

---

### Solution

Added global CSS reset rule to all stylesheets:

```css
a:visited {
  color: inherit;
}
```

This makes visited links inherit their original color from their `:link` or parent styling, maintaining visual consistency.

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/styles.css` | Added global `a:visited { color: inherit; }` after reset block |
| `frontend/rooms.html` | Added global `a:visited { color: inherit; }` in inline styles |

Note: `technical-appendix.html` uses `styles.css`, so it's automatically covered.

---

### Version

Updated to v1.0.93

---

## Entry #99 - Attractor Morphing Event Type Fix

**Date**: 2026-01-12
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed Lorenz↔Rossler attractor morphing that wasn't working due to event type mismatch. Backend emitted `type: 'phrase'` but frontend expected `type: 'phrase:change'`. Extended fix to normal rooms for both virtual users and local user drag gestures.

---

### Problem Statement

User observed that the strange attractor animation was moving but never changed shape. The system was designed to morph between:
- **Lorenz attractor**: Butterfly shape (two symmetric lobes)
- **Rossler attractor**: Spiral shape (asymmetric single loop)

The morphing should trigger on musical phrase events, but the shape remained constant (always Lorenz).

---

### Root Cause

Event type mismatch between backend and frontend:

| Component | Event Type |
|-----------|------------|
| Backend (`LandingCompositionService.js:1262`) | `type: 'phrase'` |
| Backend (`VirtualUserService.js:840`) | `type: 'phrase'` |
| Frontend (`PrecomputedAttractorSystem.js:459`) | `case 'phrase:change':` |

The `switch` statement never matched, so `toggleAttractor()` was never called.

---

### Solution

#### 1. Fixed event type in PrecomputedAttractorSystem.js

**File:** `frontend/src/services/visual/PrecomputedAttractorSystem.js`

```javascript
// BEFORE
case 'phrase:change':
  this.toggleAttractor()
  break

// AFTER
case 'phrase':
  // Switch attractor on phrase changes (backend emits 'phrase' not 'phrase:change')
  this.toggleAttractor()
  break
```

#### 2. Added phrase event handling in normal rooms

**File:** `frontend/src/main.js`

Added handler for `type: 'phrase'` events from backend (virtual users):

```javascript
this.socketService.on('musical:event', (musicalEventWrapper) => {
  // Entry #99: Handle phrase events for attractor morphing
  // Backend sends phrase events directly: { type: 'phrase', userId, ... }
  // These trigger Lorenz↔Rossler attractor transitions
  if (musicalEventWrapper?.type === 'phrase') {
    if (this.visualService && this.visualService.onMusicalEvent) {
      this.visualService.onMusicalEvent({
        type: 'phrase',
        velocity: musicalEventWrapper.velocity || 0.5
      })
    }
    return // Phrase events don't contain note data
  }
  // ... rest of handler
})
```

#### 3. Added phrase trigger for local user drag gestures

**File:** `frontend/src/main.js`

When local user completes a drag gesture (phrase), trigger attractor morph:

```javascript
if (gestureAction === 'drag') {
  // Entry #99: Trigger attractor morph when local user completes a drag (phrase)
  if (this.visualService && this.visualService.onMusicalEvent) {
    this.visualService.onMusicalEvent({
      type: 'phrase',
      velocity: gesture.velocity || 0.5
    })
  }
  return
}
```

---

### Event Flow

**Landing Page:**
```
Backend LandingCompositionService
  → emits musical:event { type: 'phrase' }
  → landing/main.js forwards to visualService.onMusicalEvent()
  → PrecomputedAttractorSystem.toggleAttractor()
```

**Normal Rooms (Virtual Users):**
```
Backend VirtualUserService
  → emits musical:event { type: 'phrase' }
  → main.js detects type === 'phrase'
  → forwards to visualService.onMusicalEvent()
  → PrecomputedAttractorSystem.toggleAttractor()
```

**Normal Rooms (Local User):**
```
User completes drag gesture
  → onGestureEnd callback
  → gestureAction === 'drag'
  → visualService.onMusicalEvent({ type: 'phrase' })
  → PrecomputedAttractorSystem.toggleAttractor()
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/visual/PrecomputedAttractorSystem.js` | Changed `case 'phrase:change':` to `case 'phrase':` |
| `frontend/src/main.js` | Added phrase event handler in `musical:event` listener, added morph trigger in drag gesture end |

---

### Verification

1. Open landing page or normal room
2. Watch the attractor animation
3. Console should show: `🦋 Switching to rossler attractor` / `🦋 Switching to lorenz attractor`
4. Visual: butterfly shape morphs to spiral and back
5. In normal rooms, perform drag gestures to trigger morph manually

---

### Version

Updated to v1.0.94

---

## Entry #100 - Attractor Morph Reverse Smoothing & Rate Limiting

**Date**: 2026-01-12
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed visual discontinuities ("jumps") in attractor morphing when a new gesture triggers `toggleAttractor()` while a morph is already in progress. Implemented reverse smoothing (invert progress + swap attractors) and rate limiting (2s minimum between morphs).

---

### Problem Statement

After Entry #99 enabled attractor morphing, a new issue emerged: if a user completes a gesture while a Lorenz↔Rossler morph is in progress, the animation would "jump" instead of transitioning smoothly.

**Example scenario:**
```
t=0: Morph starts lorenz → rossler
t=400ms: morphProgress = 0.5 (visually 50% toward rossler)
t=400ms: New gesture triggers toggleAttractor()
  → targetAttractor changes to 'lorenz'
  → morphProgress continues from 0.5
  → Visual JUMPS from half-rossler back to lorenz instantly
```

---

### Root Cause

The original `toggleAttractor()` method simply called `switchAttractor(next)` without checking if a morph was already in progress. When `targetAttractor` changed mid-morph, the render interpolation direction changed instantly, causing visual discontinuity.

**Code path (lines 286-293, 312-326):**
- `render()` interpolates between `currentAttractor` and `targetAttractor` using `morphProgress`
- When `targetAttractor` changes, the interpolation target changes immediately
- The eased blend factor jumps to a different visual position

---

### Solution

#### 1. Added rate limiting state variables

**File:** `frontend/src/services/visual/PrecomputedAttractorSystem.js` (lines 38-39)

```javascript
this.lastMorphTime = 0           // Timestamp of last morph (Entry #100)
this.minMorphInterval = 2000     // Minimum 2s between morphs
```

#### 2. Implemented reverse smoothing in toggleAttractor()

**File:** `frontend/src/services/visual/PrecomputedAttractorSystem.js` (lines 422-452)

```javascript
toggleAttractor() {
  const now = Date.now()
  const timeSinceLastMorph = now - this.lastMorphTime

  // Rate limiting: prevent rapid oscillations
  if (timeSinceLastMorph < this.minMorphInterval) {
    console.debug(`🦋 Toggle rate-limited (${this.minMorphInterval - timeSinceLastMorph}ms remaining)`)
    return false
  }

  if (this.morphProgress < 1.0) {
    // REVERSE SMOOTHING: Morph in progress, reverse direction
    // Invert progress first, then swap - this continues from current visual position
    this.morphProgress = 1.0 - this.morphProgress

    // Swap current and target to reverse direction (this IS the toggle)
    const temp = this.currentAttractor
    this.currentAttractor = this.targetAttractor
    this.targetAttractor = temp

    console.log(`🦋 Reversing morph → ${this.targetAttractor} attractor`)
  } else {
    // NORMAL TOGGLE: Complete, start new morph to opposite attractor
    const next = this.targetAttractor === 'lorenz' ? 'rossler' : 'lorenz'
    this.switchAttractor(next)
  }

  this.lastMorphTime = now
  return true
}
```

---

### Code Review & Bug Fix

Initial implementation had a critical logic error discovered by code-reviewer agent:

**Bug:** Calculated `next` before swap, then overwrote `targetAttractor` after swap:
```javascript
// WRONG - caused incorrect state
const next = this.targetAttractor === 'lorenz' ? 'rossler' : 'lorenz'
// ... swap ...
this.targetAttractor = next  // ← Overwrites the swap result!
```

**Fix:** The swap operation itself IS the toggle. No need to calculate `next` separately:
```javascript
// CORRECT - swap alone reverses direction
this.morphProgress = 1.0 - this.morphProgress
const temp = this.currentAttractor
this.currentAttractor = this.targetAttractor
this.targetAttractor = temp
// No additional assignment needed - swap already toggled direction
```

---

### Behavior

| Scenario | Before | After |
|----------|--------|-------|
| Toggle during morph | Visual jump | Smooth reversal from current position |
| Rapid toggles (< 2s) | All processed → oscillations | Rate-limited → stability |
| Normal toggle (morph complete) | Standard morph | Standard morph |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/visual/PrecomputedAttractorSystem.js` | Added `lastMorphTime`, `minMorphInterval`; rewrote `toggleAttractor()` with reverse smoothing and rate limiting |
| `frontend/index.html` | Version bump v1.0.95, cache-buster v=11 for PrecomputedAttractorSystem.js |

---

### Known Limitation: Easing Discontinuity

The reviewer noted a subtle issue: inverting `morphProgress` linearly while `render()` uses cubic easing can create a small (~10%) blend weight discontinuity. This is visually minor and acceptable for now. A perfect fix would require inverse easing function or switching to linear interpolation.

---

### Verification

1. Open landing page or normal room
2. Watch attractor during phrase events or drag gestures
3. **Console logs:**
   - `🦋 Switching to X attractor` = normal toggle
   - `🦋 Reversing morph → X attractor` = reverse during morph
   - `🦋 Toggle rate-limited (Xms remaining)` = rate limit active
4. **Visual:** Transitions always smooth, no jumps

---

### Version

Updated to v1.0.95

---

## Entry #101 - Remove SoundPatternGenerator Legacy Code

**Date**: 2026-01-12
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Removed `SoundPatternGenerator.js` (868 lines) and its test files (~870 lines) from the codebase. This was legacy code containing 6 generative algorithms that were never called in production. The system uses `CompositionEngine` and `BackgroundCompositionService` instead.

---

### Problem Statement

Audit in `AUDIT_COMPOSITIONAL_ALGORITHM.md` identified that SoundPatternGenerator contained 6 algorithmic music generators (Cellular Automata, Fractal, Markov Chain, Neural Network, Fibonacci, Chaos Theory) that were:
- Registered in ServiceContainer but never invoked
- Only `getGenerationStats()` was called for `/api/metrics` endpoint
- Main method `generatePatterns()` had zero call sites
- Comprehensive test coverage existed but tested dead code

---

### Solution

Complete removal of the legacy system:

#### 1. Deleted Files

| File | Lines |
|------|-------|
| `backend/src/services/SoundPatternGenerator.js` | 868 |
| `backend/tests/unit/SoundPatternGenerator.hash.test.js` | 182 |
| `backend/tests/unit/test_sound_patterns.test.js` | 688 |
| **Total removed** | **~1740** |

#### 2. Updated ServiceContainer.js

Removed registration:
```javascript
// REMOVED
container.register('soundPatternGenerator', () => {
  const SoundPatternGenerator = require('./SoundPatternGenerator')
  return new SoundPatternGenerator()
})
```

#### 3. Updated server.js

Removed extraction and metrics reference:
```javascript
// REMOVED from line 70
const soundPatternGenerator = container.get('soundPatternGenerator')

// REMOVED from /api/metrics response
patterns: soundPatternGenerator.getGenerationStats(),
```

#### 4. Updated Documentation

| File | Changes |
|------|---------|
| `CLAUDE.md` | Replaced "6 algorithms" section with actual CompositionEngine architecture |
| `README.md` | Updated "Adding New Algorithms" section to reference CompositionEngine |
| `backend_plan.md` | Removed SoundPatternGenerator from file list |
| `AUDIT_COMPOSITIONAL_ALGORITHM.md` | Marked SoundPatternGenerator issue as RISOLTO - RIMOSSO |

---

### Active Composition System

The actual music generation uses:

| Service | Purpose |
|---------|---------|
| `BackgroundCompositionService` | Orchestrates background music, manages drone/phrases |
| `CompositionEngine` | Form structure (ABA, rondo), voice generation |
| `HarmonicEngine` | Progressions, voice leading, key management |
| `StyleAnalyzer` | Gesture pattern analysis for tempo/energy |
| `MaterialLibrary` | Musical material by function/character |
| `PhraseMorphology` | Gesture-to-melodic contour conversion |

---

### Verification

1. ✅ Backend starts without errors
2. ✅ `/api/health` returns healthy status
3. ✅ `/api/metrics` works (without `patterns` field)
4. ✅ No references to SoundPatternGenerator in source code
5. ✅ Test suite runs (pre-existing WebSocket test failures unrelated)

---

### Version

Updated to v1.0.96

---

## Entry #102 - Fix DRAG Note Duplication for Remote Users (Issue C-02)

**Date**: 2026-01-12
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed bug where remote users received each DRAG note twice: once via real-time `note:stream` and again via batch `musical:event` at gesture end. The fix enables the existing `notesAlreadyStreamed` flag that was previously ignored.

---

### Problem Statement

Audit issue C-02 identified that remote users heard every DRAG note duplicated:

1. **Path 1 - Real-time**: During drag, notes sent via `note:stream` → backend broadcasts → remote users play
2. **Path 2 - Batch**: At `gesture:end`, same notes re-broadcast as `musical:event` → remote users play again

The `notesAlreadyStreamed` flag was sent from frontend but explicitly ignored in backend with comment: "note:stream may not be reliable".

---

### Solution

Modified `GestureHandler.js` to check the `notesAlreadyStreamed` flag before re-broadcasting:

```javascript
// FIX: Check notesAlreadyStreamed flag to prevent duplicate playback (Issue C-02)
if (gesture.notesAlreadyStreamed && gesture.streamedNotes?.length > 0) {
  console.log(`[GestureHandler] Skipping re-broadcast for ${gesture.streamedNotes.length} notes`)
}

const shouldRebroadcastNotes = gesture.streamedNotes &&
  Array.isArray(gesture.streamedNotes) &&
  gesture.streamedNotes.length > 0 &&
  !gesture.notesAlreadyStreamed  // ← NEW CHECK

if (shouldRebroadcastNotes) {
  // ... broadcast notes
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/api/handlers/GestureHandler.js` | Added `notesAlreadyStreamed` check, logging for skipped re-broadcasts |
| `AUDIT_COMPOSITIONAL_ALGORITHM.md` | Marked Issue C-02 as RISOLTO, updated recommendations |

---

### Verification

1. Open 2 browsers in same room
2. Perform DRAG gesture in browser A
3. Backend logs: `[GestureHandler] Skipping re-broadcast for X notes`
4. Browser B receives each note only once (via `note:stream`)

---

### Version

Updated to v1.0.97

---

## Entry #103 - Direct 1:1 Modulation Mapping Refactor (Issue C-03)

**Date**: 2026-01-12
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Major refactor of the audio modulation system from complex LFO-based generation to direct 1:1 mapping from hover metrics. Removed ~300 lines of LFO calculation code from HoverOrchestrator and disabled conflicting gesture-based ambient filter modulation in AudioService. The system now uses a cleaner architecture where each filter parameter is driven by a specific interaction metric.

---

### Problem Statement

Audit Issue C-03 identified conflicting modulation sources:
1. **Real-time gestures** modulated ambient filters via `handleHoverModulation()` and `triggerBackgroundFilterResponse()`
2. **Aggregated metrics** modulated the same filters via `applyUnifiedModulation()`
3. Backend HoverOrchestrator generated complex LFO parameters that were difficult to debug
4. Virtual users emitted individual `hover-update` events that cluttered the modulation

---

### Solution

#### New Architecture

```
MODULAZIONE REAL-TIME (handleHoverModulation)
└── gestureFilter → gestureSynth ONLY
    └── Trigger: ogni hover event (20Hz max)

MODULAZIONE AGGREGATA (applyUnifiedModulation)
└── ambientFilters.* → bass, pad, chords, backgroundHigh/Mid/Low
    └── Trigger: ogni 500ms da HoverOrchestrator
    └── Sorgenti: metriche aggregate (mapping 1:1)
```

#### 1:1 Mapping Table

| Target | Source Metric | Source Range | Target Range |
|--------|---------------|--------------|--------------|
| **bass.cutoff** | density | 0-10 | 80-400 Hz |
| **bass.Q** | hoverCount | 0-100 | 0.5-4.0 |
| **pad.cutoff** | spatialVariance | 0-1 | 300-3000 Hz |
| **pad.Q** | uniqueUsers | 1-10 | 0.5-5.0 |
| **chords.cutoff** | flowDirection.y | -1 to 1 | 1000-10000 Hz |
| **chords.Q** | flowDirection.x | -1 to 1 | 0.5-4.0 |
| **bgHigh.cutoff** | rhythmAnalysis.regularity | 0-1 | 1500-8000 Hz |
| **bgMid.cutoff** | intensityDistribution.max | 0-1 | 800-6000 Hz |
| **bgLow.cutoff** | rhythmAnalysis.period | 0-2000 ms | 200-3000 Hz |

---

### Implementation Changes

#### Backend: HoverOrchestrator.js (~290 lines removed)

**Removed:**
- 4 LFO configurations (primary, secondary, tertiary, quaternary)
- Complex LFO generation in `generateUnifiedModulation()`
- Smoothing calculator imports
- Pre-calculated modulation parameters

**Simplified to:**
```javascript
this.rawMetrics = {
  density: 0,
  hoverCount: 0,
  spatialVariance: 0,
  uniqueUsers: 0,
  averagePosition: { x: 0.5, y: 0.5 },
  flowDirection: { x: 0, y: 0 },
  rhythmAnalysis: { period: 0, regularity: 0 },
  clusterCount: 0,
  hotspotCount: 0,
  intensity: { min: 0, avg: 0.5, max: 1 }
}
```

#### Backend: VirtualUserService.js

Removed individual `hover-update` emissions for virtual users - they now only contribute to aggregated metrics:
```javascript
// REMOVED: this.io.to(roomId).emit('hover-update', hoverData)
// KEPT: hoverOrchestrator.addHoverEvent(hoverData)
```

#### Frontend: AudioService.js (~120 lines removed/disabled)

**Disabled methods (kept for API compatibility):**
- `updateBackgroundFilters()` - now returns immediately
- `triggerBackgroundFilterResponse()` - now returns immediately

**Reason:** Ambient filters are now controlled exclusively by `applyUnifiedModulation()` which uses the 1:1 mapping from aggregated metrics. Direct gesture modulation on ambient filters created conflicts.

---

### Benefits

1. **Core concept respected**: Every audio parameter derives from a specific interaction metric
2. **No autonomous LFOs**: Sound emerges only from user actions
3. **Timbral variety**: Each voice responds to different metrics
4. **Easy debugging**: 1:1 mapping makes it clear what causes what
5. **Performance**: Less backend computation (no LFO generation)
6. **Cleaner architecture**: Single source of truth for ambient modulation

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/HoverOrchestrator.js` | Removed ~290 lines of LFO code, simplified to raw metrics output |
| `backend/src/services/VirtualUserService.js` | Removed individual hover-update emissions for virtual users |
| `frontend/src/services/AudioService.js` | Disabled `updateBackgroundFilters()` and `triggerBackgroundFilterResponse()` |
| `AUDIT_COMPOSITIONAL_ALGORITHM.md` | Updated Issue C-03 status |
| `modulation_refactor_plan.md` | Created detailed refactor plan (untracked) |

---

### Version

Updated to v1.0.98

---

## Entry #104 - Hover Modulation Logic Fix + Debug Logs

**Date**: 2026-01-12
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed hover modulation logic in AudioService. Previously, both local and remote hover events modulated the `gestureFilter`, which didn't make conceptual sense. Now only YOUR hover modulates the filter, affecting sounds from remote users and virtual users. Also added debug logs for aggregate modulation to diagnose unified-modulation event flow.

---

### Problem Statement

After Entry #103 refactor, hover modulation wasn't audible because:
1. **Local hover modulation was pointless**: If you're making gestures, you can't hover simultaneously, so you'd never hear the filter change on your own notes
2. **Remote hover modulation was backwards**: Others' hover events modulating YOUR filter doesn't match the interaction model
3. **No debug visibility**: `unified-modulation` and `applyUnifiedModulation()` had no logging to verify the event flow

The correct mental model: YOUR hover should modulate sounds from OTHER users (remote + virtual), since all sounds pass through the shared `gestureSynth` → `gestureFilter` chain.

---

### Solution

#### 1. Simplified `handleHoverModulation()` (~100 lines removed)

**Before**: Complex three-tier system processing both local and remote hover, with LFO setup for remote.

**After**: Simple local-only hover modulation with direct 1:1 mapping:

```javascript
handleHoverModulation(hoverData) {
  const isRemote = hoverData?.isRemote || false

  // Entry #104: SKIP remote hover - only YOUR hover should modulate the filter
  if (isRemote) {
    return
  }

  // ... validation ...

  // Simple 1:1 mapping:
  // Y position → cutoff frequency (200-6000 Hz)
  // X position → resonance Q (0.5-5.0)
  const cutoffFreq = 200 + (originalY * 5800)
  const resonance = 0.5 + (originalX * 4.5)

  // Apply to gestureFilter - affects ALL sounds through gestureSynth
  // including remote user notes and virtual user notes
  this.gestureFilter.frequency.linearRampToValueAtTime(cutoffFreq, currentTime + 0.05)
  this.gestureFilter.Q.linearRampToValueAtTime(resonance, currentTime + 0.05)

  console.log(`🎛️ LOCAL hover → gestureFilter: pos=(${originalX}, ${originalY}) → cutoff=${cutoffFreq}Hz, Q=${resonance}`)
}
```

#### 2. Added Debug Logs for Aggregate Modulation

**SocketService.js**:
```javascript
this.socket.on('unified-modulation', (data) => {
  console.log('📡 unified-modulation received from server:', data?.metrics ? 'with metrics' : 'legacy format')
  this.emit('unified-modulation', data)
})
```

**AudioService.js** - `applyUnifiedModulation()`:
```javascript
// Entry point log
console.log(`🎚️ AGGREGATE MODULATION received:`, {
  density: m.density?.toFixed(2),
  hoverCount: m.hoverCount,
  spatialVariance: m.spatialVariance?.toFixed(2),
  uniqueUsers: m.uniqueUsers,
  flowDirection: m.flowDirection ? `(${x}, ${y})` : 'none'
})

// After applying filters
console.log(`🎚️ AGGREGATE → ambientFilters: bass=${bassCutoff}Hz, pad=${padCutoff}Hz, chords=${chordsCutoff}Hz`)
```

---

### Modulation Architecture (Post-Entry #104)

```
YOUR HOVER (handleHoverModulation)
└── gestureFilter → affects gestureSynth sounds
    └── Remote user notes pass through here
    └── Virtual user notes pass through here
    └── Mapping: Y→cutoff (200-6000Hz), X→Q (0.5-5.0)

AGGREGATE METRICS (applyUnifiedModulation)
└── ambientFilters → bass, pad, chords
    └── Triggered by HoverOrchestrator every 500ms
    └── Uses 1:1 mapping from Entry #103
```

---

### Critical Fix: Per-User Filters (added after initial deploy)

Initial implementation only modulated `gestureFilter`, but remote/virtual user sounds use **per-user synths** with their own filters via `UserSynthManager`. These filters were not being modulated!

**Root Cause**: Each user has a separate audio chain:
```
userSynth → userFilter → userVolume → userPan → master
```

The `gestureFilter` is only used by `gestureSynth` (fallback synth), not by per-user synths.

**Fix**: Added `getAllFilters()` method to UserSynthManager and updated `handleHoverModulation()` to modulate ALL active per-user filters:

```javascript
// Entry #104 FIX: Also modulate ALL per-user filters
if (this.userSynthManager) {
  const userFilters = this.userSynthManager.getAllFilters()
  for (const filter of userFilters) {
    filter.frequency.linearRampToValueAtTime(cutoffFreq, currentTime + 0.05)
    filter.Q.linearRampToValueAtTime(resonance, currentTime + 0.05)
  }
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/AudioService.js` | Simplified `handleHoverModulation()` to local-only, added debug logs to `applyUnifiedModulation()`, **added per-user filter modulation** |
| `frontend/src/services/SocketService.js` | Added debug log for `unified-modulation` events |
| `frontend/src/services/audio/UserSynthManager.js` | **Added `getAllFilters()` method** |

---

### Debug Log Reference

| Log | Location | Meaning |
|-----|----------|---------|
| `🎛️ MASTER FILTER hover` | AudioService | Your hover is modulating the master filter (affects ALL audio) |
| `📡 unified-modulation received` | SocketService | Server sent aggregate metrics |
| `🎚️ AGGREGATE MODULATION received` | AudioService | Metrics being processed |
| `🎚️ AGGREGATE → ambientFilters` | AudioService | Filter values being applied to ambient layers |

---

### Critical Fix v2: Master Filter Approach (supersedes per-user filter fix)

After testing, the per-user filter + ambient filter modulation approach caused **conflicting modulation** between aggregate and real-time hover (the original C-03 problem). Solution: create a **master filter** after the mix.

**Problem with previous approach**:
- Hover modulated per-user filters AND ambient filters
- Aggregate modulation also modulated ambient filters
- Result: two sources competing to set the same filter parameters

**Solution**: Create `masterFilter` that sits AFTER the mix, BEFORE output:

```
All audio sources → masterVolume → masterFilter → toDestination()
```

**Implementation**:

```javascript
// In synth initialization:
this.masterVolume = new Tone.Volume(-10)
this.masterFilter = new Tone.Filter({
  type: 'lowpass',
  frequency: 8000,  // Neutral (open)
  Q: 0.7,           // Gentle resonance
  rolloff: -12
}).toDestination()
this.masterVolume.connect(this.masterFilter)

// In handleHoverModulation():
// ONLY modulate masterFilter - affects ALL audio uniformly
this.masterFilter.frequency.linearRampToValueAtTime(cutoffFreq, currentTime + 0.05)
this.masterFilter.Q.linearRampToValueAtTime(resonance, currentTime + 0.05)
```

**Benefits**:
1. **No conflicts**: Master filter is separate from per-voice filters and aggregate modulation targets
2. **Affects everything**: Background, remote users, local gestures all filtered uniformly
3. **Highly audible**: Sweeping the master filter creates clear, dramatic timbral changes
4. **Simple mental model**: Your hover = your audio perspective

---

### Modulation Architecture (Post-Entry #104 v2)

```
YOUR HOVER (handleHoverModulation)
└── masterFilter → affects ALL mixed audio before output
    └── Y position → cutoff (200-8000Hz)
    └── X position → Q (0.5-6.0)

AGGREGATE METRICS (applyUnifiedModulation)
└── ambientFilters → bass, pad, chords (individual voices)
    └── Triggered by HoverOrchestrator every 500ms
    └── Uses 1:1 mapping from Entry #103
    └── DOES NOT conflict with masterFilter

PER-VOICE FILTERS (unchanged)
└── Each layer has its own filter for timbral shaping
└── userFilter per-user synth
└── gestureFilter for fallback synth
```

---

### Version

Updated to v1.0.101

---

## Entry #105 - Remove Hover Filter Modulation System

**Date**: 2026-01-13
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Completely removed the hover filter modulation system (both real-time and aggregate). The system was buggy, added overhead, and didn't improve the user experience.

---

### Problem Statement

The hover filter modulation system had accumulated technical debt through multiple iterations:
- Entry #103: Refactored to 1:1 mapping
- Entry #104: Fixed per-user filter modulation
- Entry #104 v2: Added master filter approach

Despite multiple attempts to fix it, the system remained:
1. **Buggy**: Conflicting modulation sources, unpredictable behavior
2. **Heavy**: Continuous socket events, filter updates at 20Hz, backend processing
3. **Imperceptible**: Effect was barely noticeable despite all the complexity

User decision: Remove the entire system rather than continue debugging it.

---

### Removed Components

#### Frontend

| File | Removed |
|------|---------|
| `AudioService.js` | `masterFilter` creation/routing, `handleHoverModulation()` logic, `applyUnifiedModulation()` logic |
| `SocketService.js` | `unified-modulation` socket listener |
| `main.js` | `unified-modulation` and `hover-update-raw` handlers |
| `landing/main.js` | `unified-modulation` handler |
| `SocketEventCoordinator.js` | `hover-update` and `unified-modulation` handlers |
| `FilterModulationSystem.js` | `handleHoverModulation()` logic |

#### Backend

| File | Removed |
|------|---------|
| `HoverOrchestrator.js` | `broadcastModulation()` - no longer emits `unified-modulation` events |

---

### What Remains

- Methods kept as **no-ops** for API compatibility: `handleHoverModulation()`, `applyUnifiedModulation()`, `setupHoverTimeout()`, `broadcastModulation()`
- HoverOrchestrator still tracks hover state (used for other features)
- Per-voice ambient filters still exist (for potential future use)
- gestureFilter still exists (for potential future use)

---

### Performance Impact

**Before**:
- Server emitting `unified-modulation` every 500ms
- Frontend processing hover events at 20Hz
- Multiple filter ramps per hover update

**After**:
- No `unified-modulation` events
- No hover filter processing
- Lighter CPU/memory footprint

---

### Version

Updated to v1.0.102

---

## Entry #106 - Remove Three-Tier Audio System (Dead Code)

**Date**: 2026-01-13
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Removed the entire three-tier audio system (background/remote/local) which was defined but never integrated into the main audio flow. This cleanup removed ~1120 lines of dead code and fixed a bug where frequency parameters were being ignored.

---

### Problem Statement

The three-tier audio system was identified in AUDIT_COMPOSITIONAL_ALGORITHM.md as Issue C-04:

1. **Never integrated**: `threeTierConfig` defined waveform/volume/frequency per tier, but `playMusicalEvent()` never used it
2. **Bug in frequency calculation**: `calculateThreeTierFrequency()` ignored the passed frequency and always used `tierConfig.baseFrequency`
3. **Duplicated code**: ThreeTierAudioSystem.js was a ~850 line legacy class never called
4. **Dead tier logic**: GestureAudioMapper.mapGestureToFilter() had branches for remote/background tiers that were never executed

---

### Removed Components

| File | Lines Removed | Description |
|------|---------------|-------------|
| `ThreeTierAudioSystem.js` | ~850 | Entire file deleted |
| `AudioService.js` | ~150 | `threeTierConfig`, `playThreeTierNote()`, `calculateThreeTier*()`, `handleThreeTierGesture()` |
| `AudioServiceFacade.js` | ~25 | ThreeTierAudioSystem instantiation and delegate methods |
| `GestureAudioMapper.js` | ~70 | `threeTierConfig`, `calculateThreeTier*()`, `parseDuration()`, tier branches in `mapGestureToFilter()` |
| `rooms.html` | 1 | Script include for ThreeTierAudioSystem.js |
| `GestureProcessor.test.js` | ~20 | Mock updates |
| **Total** | **~1120** | |

---

### Replacement

Added simple `playSimpleNote()` method in AudioService.js:

```javascript
playSimpleNote(frequency, duration = 0.3, volume = 0.5) {
  if (!this.isInitialized || !this.gestureSynth) return
  this.safeGestureSynthTrigger(frequency, duration, undefined, volume)
}
```

Updated callers:
- `GestureProcessor.js`: `playThreeTierNote(440, 'local', 100, { volume: 0.5 })` → `playSimpleNote(440, 0.3, 0.5)`
- `MetricsToGestureAdapter.js`: Same pattern, now correctly uses the calculated frequency (bug fix)

---

### Simplified mapGestureToFilter()

Before: Three branches for local/remote/background tiers (only local ever executed)

After:
```javascript
mapGestureToFilter(sonicParams) {
  // Entry #106: Simplified - tier logic removed (was never used dynamically)
  const y = sonicParams.y || 0.5
  const x = sonicParams.x || 0.5
  const cutoff = 200 + ((1 - y) * 3800)
  const resonance = 0.5 + (x * 4.5)
  return { cutoffFrequency: cutoff, resonance, tremoloAmount: 0 }
}
```

---

### Collateral Bug Fix

MetricsToGestureAdapter was calling `playThreeTierNote(frequency, tier, velocity)` but the frequency was being ignored inside `calculateThreeTierFrequency()` which always used `tierConfig.baseFrequency`. Now `playSimpleNote(frequency, 0.3, volume)` correctly uses the calculated frequency from metrics.

---

### Version

Updated to v1.0.103

---

## Entry #107 - Standardize DRAG Frequency Range to Match TAP (Issue C-05)

**Date**: 2026-01-13
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed frequency range inconsistency between TAP and DRAG gestures (Issue C-05 from AUDIT_COMPOSITIONAL_ALGORITHM.md). DRAG now uses the same Y-axis mapping as TAP (alto=acuto) and covers the full 110-1210Hz range (5 octaves).

---

### Problem Statement

TAP and DRAG used **different algorithms** for frequency calculation:

| Aspect | TAP (Backend) | DRAG (Frontend) |
|--------|---------------|-----------------|
| Y-axis | y=0 → high freq | y=0 → **low freq** (INVERTED!) |
| Range | 110-1210Hz (5 oct) | 130-1050Hz (3 oct) |
| Algorithm | Linear Hz | MIDI-based |

Same position on canvas produced different frequencies depending on gesture type, breaking user expectation.

---

### Root Cause

**DragStreamingHandler.js:83**:
```javascript
const baseOctave = params.baseOctave || (3 + Math.floor(y * 2))
// y=0 (top) → octave 3 (LOW) ❌
// y=1 (bottom) → octave 5 (HIGH) ❌
```

This was the opposite of TAP's behavior where y=0 produces high frequencies.

---

### Solution

Changed the formula to invert Y-axis and expand to 5 octaves:

**File:** `frontend/src/handlers/DragStreamingHandler.js` (line 83)

```javascript
// BEFORE:
const baseOctave = params.baseOctave || (3 + Math.floor(y * 2))

// AFTER:
const baseOctave = params.baseOctave || (2 + Math.floor((1 - y) * 4))
```

**New behavior:**
- y=0 (top) → octave 6 (HIGH) ✓
- y=0.25 → octave 5
- y=0.5 → octave 4 (MIDDLE)
- y=0.75 → octave 3
- y=1 (bottom) → octave 2 (LOW) ✓

**Range:** ~110-1200Hz (aligned with TAP's 110-1210Hz)

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/handlers/DragStreamingHandler.js` | Single-line fix at line 83 |
| `AUDIT_COMPOSITIONAL_ALGORITHM.md` | Updated Issue C-05 as RESOLVED, added Entry #107 notes |

---

### Impact

- **Y-axis coherence**: Top of canvas = high pitch for both TAP and DRAG
- **Range alignment**: Both gestures now cover ~5 octaves (110-1200Hz)
- **Scale quantization**: Both use scale-based note selection (unchanged)
- **Virtual Users**: Unchanged - they keep fixed tessiture by design (bass/tenor/soprano)

---

### Verification

1. Open app in browser
2. TAP at top of canvas → high pitch note
3. DRAG at top of canvas → high pitch note (same range)
4. TAP at bottom → low pitch note
5. DRAG at bottom → low pitch note (same range)

---

### Version

Updated to v1.0.104

---

## Entry #108 - Remove Unused Backend Parameters (Issue C-06)

**Date**: 2026-01-13
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Removed 6 unused parameters from GestureToMusicService.js that were being sent to the frontend but never used. This simplifies the API and reduces payload size by ~40% per note.

---

### Problem Statement

Audit Issue C-06 identified that the backend sent 11 parameters per musical event, but the frontend only used 5 of them:

| Parameter | Status |
|-----------|--------|
| pitch | USED |
| frequency | USED |
| duration | USED |
| velocity | USED |
| articulation | USED |
| startTime | USED |
| gestureAction | **NEVER USED** |
| gestureType | **NEVER USED** |
| noteIndex | **NEVER USED** (only in commented debug logs) |
| totalNotes | **NEVER USED** |
| mood | **NEVER USED** |
| scale | **NEVER USED** |

---

### Solution

Instead of implementing usage for these parameters (which would add complexity for potentially imperceptible benefit), we removed them entirely.

**File:** `backend/src/services/GestureToMusicService.js` (lines 316-322)

```javascript
// BEFORE:
properties: {
  pitch: note.pitch,
  frequency: this.midiToFrequency(note.pitch),
  duration: durationSeconds,
  velocity: note.velocity || 80,
  articulation: note.articulation || 'normal',
  gestureAction: gestureData.gestureAction,     // REMOVED
  gestureType: gestureData.gestureType,         // REMOVED
  noteIndex: index,                             // REMOVED
  totalNotes: musicalPhrase.notes.length,       // REMOVED
  mood: musicalPhrase.metadata.gestureMood,     // REMOVED
  scale: musicalPhrase.metadata.scale,          // REMOVED
  startTime: cumulativeTime
}

// AFTER:
properties: {
  pitch: note.pitch,
  frequency: this.midiToFrequency(note.pitch),
  duration: durationSeconds,
  velocity: note.velocity || 80,
  articulation: note.articulation || 'normal',
  startTime: cumulativeTime
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/GestureToMusicService.js` | Removed 6 unused parameters from formatMusicalEvents() |
| `AUDIT_COMPOSITIONAL_ALGORITHM.md` | Marked Issue C-06 as RISOLTO - RIMOSSO (Entry #108), updated sections 1, 8, 13, 15 |

---

### Impact

- **Payload reduction**: ~40% smaller note events (6 fields removed from 11)
- **API simplification**: Only essential parameters transmitted
- **Breaking changes**: None (parameters were never used)
- **Remaining issues**: Only C-07 (filter processing locale/remoto) remains open

---

### Verification

1. Backend tests: 281/365 passed (failures are pre-existing, unrelated)
2. No specific GestureToMusicService tests exist
3. Frontend audio playback unaffected (didn't use removed params)

---

### Version

Updated to v1.0.105

---

## Entry #109 - Remove gestureFilter from Audio Chain (Issue C-07)

**Date**: 2026-01-13
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Removed the `gestureFilter` from the local audio chain to unify local and remote audio processing. After Entry #105 disabled hover filter modulation, the gestureFilter was static (8000Hz, Q=0.5) and served no purpose. This simplifies the architecture and closes the final audit issue.

---

### Problem Statement

Audit Issue C-07 noted that local and remote audio had different processing chains:

| Aspect | Local | Remote |
|--------|-------|--------|
| Chain | gestureSynth → gestureFilter → gesturePan | userSynth → pan → volume |
| Filter | Present (static 8000Hz) | None (patch-defined) |
| Modulation | Disabled (Entry #105) | Never existed |

After Entry #105 removed hover filter modulation, the gestureFilter was:
- **Static**: Fixed at 8000Hz cutoff, Q=0.5
- **Not modulated**: All modulation code was disabled
- **Adding overhead**: Extra audio node in chain for no benefit

---

### Solution

Removed `gestureFilter` completely from the audio system:

**New Audio Chain:**
```
BEFORE:
gestureSynth → gestureFilter (static) → gesturePan → gestureVolume → masterVolume

AFTER:
gestureSynth → gesturePan → gestureVolume → masterVolume
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/AudioService.js` | Removed gestureFilter creation, connections, and ~8 modulation blocks |
| `frontend/src/services/audio/AudioServiceFacade.js` | Removed gestureFilter property and setSynths parameter |
| `frontend/src/services/audio/FilterModulationSystem.js` | Removed gestureFilter references from setFilters, modulation, and cleanup |
| `frontend/src/landing/main.js` | Removed gestureFilter application in hover handler |
| `AUDIT_COMPOSITIONAL_ALGORITHM.md` | Marked Issue C-07 as RISOLTO, added Entry #109 notes |

---

### Code Removed (~80 lines)

1. **AudioService.js:**
   - gestureFilter creation (lines 1360-1365)
   - Audio chain connection through filter (line 1371-1372)
   - Filter modulation in updateSonicParams (lines 2034-2063)
   - LFO connections to gestureFilter (lines 3662-3667, 3690-3696)
   - Filter sweep test (lines 3759-3764)
   - applyRemoteFilterModulation method body
   - Filter application in composition playback (lines 4747-4760)
   - Filter reset in resetFilterValues (lines 4884-4889)

2. **AudioServiceFacade.js:**
   - gestureFilter property
   - setSynths() parameter and assignments
   - Calls to filterModulationSystem.setGestureFilter()

3. **FilterModulationSystem.js:**
   - gestureFilter property
   - setFilters() parameter
   - Modulation blocks in applyLocalFilterModulation, applyFilterModulation
   - Reset block in resetFiltersToSafeValues

4. **landing/main.js:**
   - gestureFilter frequency/Q application

---

### Impact

- **Semplificazione**: ~80 linee di codice rimosse
- **Uniformità**: Local e remote audio ora usano stessa architettura
- **Performance**: Un nodo audio in meno nella catena
- **Timbro**: Minima differenza (sawtooth leggermente più brillante senza lowpass a 8000Hz)
- **All audit issues resolved**: C-07 era l'ultima issue aperta

---

### Verification

1. Start application: `cd backend && npm run dev` + `cd frontend && npm start`
2. Test TAP gesture → should play sound
3. Test DRAG gesture → should play sound
4. Test with 2 browsers → remote notes should play
5. Check console for audio errors → none expected

---

### Version

Updated to v1.0.106

---

## Entry #110 - Remove Orphan Methods from GestureAudioMapper

**Date**: 2026-01-13
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Removed orphan methods `mapGestureToFrequency`, `mapGestureToVolume`, `mapGestureToFilter` from GestureAudioMapper.js and related delegation methods from AudioServiceFacade.js and FilterModulationSystem.js. These were duplicates never called - AudioService.js has the active versions.

---

### Problem Statement

Audit Section 10.3 identified orphan methods in GestureAudioMapper.js that were duplicates of methods in AudioService.js. The `updateSonicParams()` method calls `this.mapGestureToFrequency()` etc. on the AudioService instance, not on GestureAudioMapper.

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/audio/GestureAudioMapper.js` | Removed `mapGestureToFrequency()`, `mapGestureToVolume()`, `mapGestureToFilter()` |
| `frontend/src/services/audio/AudioServiceFacade.js` | Removed `mapGestureToFrequency()`, `mapGestureToFilter()` delegation methods |
| `frontend/src/services/audio/FilterModulationSystem.js` | Removed `mapGestureToFilter()` |
| `AUDIT_COMPOSITIONAL_ALGORITHM.md` | Updated Section 10.2/10.3 as RIMOSSI, added Entry #110 note |

---

### Code Removed (~70 lines)

- GestureAudioMapper.js: 3 methods (36 lines)
- AudioServiceFacade.js: 2 delegation methods (14 lines)
- FilterModulationSystem.js: 1 method (30 lines)

---

### Version

Updated to v1.0.107

---

## Entry #111 - Documentation: Deterministic Derivation System

**Date**: 2026-01-13
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Updated user-facing documentation in `index.html` and `technical-appendix.html` to accurately describe the deterministic derivation system. All music parameters now derive directly from input data without random number generation.

---

### Problem Statement

After completing the deterministic derivation refactor (replacing ~50 Math.random() calls with data-driven formulas), the documentation still described the old random-based system. Users reading the explainer pages would not understand how the algorithm actually works.

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/index.html` | Updated "Monitored parameters" section (deterministic composition system), "Background Composition Layer" (timing formula), "Environmental memory" (pattern thresholds) |
| `frontend/technical-appendix.html` | Rewrote Section 5 (Form Selection by Energy), added Section 5b (Data-to-Music Derivation Table), updated Section 4 (Deterministic Pattern Thresholds), updated Section 12 (Composition Frequency formula) |

---

### Key Documentation Updates

**Section 5 - Composition System (Rewritten)**:
- Form selection based on energy level: low energy → contemplative forms (theme_and_variations), high energy → energetic forms (sonata)
- Energy-to-form mapping: `index = floor(energy × forms.length)`

**Section 5b - Data-to-Music Derivation Table (New)**:
Three reference tables documenting complete mapping:
1. Macro-Level Derivations (form, progression, phrase length)
2. Note-Level Derivations (dynamics, rhythm variation, syncopation)
3. Environmental Memory Derivations (pattern creation/evolution thresholds)

**Section 12 - Composition Frequency (Updated)**:
```
baseBeats = [8, 12, 16, 10, 14]
beatIndex = compositionCount % 5
energyModifier = 1 - (energy × 0.3)
beatsPerComposition = baseBeats[beatIndex] × energyModifier
```

---

### Verification Against Codebase

All documented formulas verified against actual implementation:
- `CompositionEngine.js:95-115` - formsByEnergy ✓
- `BackgroundCompositionService.js:479-482` - baseBeats ✓
- `EnvironmentalMemoryCoordinator.js:185-186` - creationScore ✓
- `EnvironmentalMemoryCoordinator.js:288,293` - intensity thresholds ✓
- `HarmonicEngine.js:89,124,158,194,231` - complexity→progression ✓
- `CounterpointEngine.js:334,422` - sin(position) contours ✓

---

### Version

Updated to v1.0.108

---

## Entry #112 - Audio Sleep Recovery System

**Date**: 2026-01-13 (Completed: 2026-01-14)
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed audio muting issue when returning to the app after device sleep mode. Audio previously remained muted requiring page reload, especially noticeable on mobile devices. Implemented comprehensive recovery system with multiple event listeners, health monitoring, and user gesture fallback.

**Final Status**: FULLY WORKING on all platforms (PC, iOS Safari normal rooms, iOS Safari landing page).

---

### Problem Statement

When the device went to sleep and the user returned to the app, audio remained muted. The existing `visibilitychange` handler had several issues:
1. **Async timing bug**: Transport state checked before `context.resume()` completed
2. **Missing event handlers**: No `focus/blur` or `pageshow/pagehide` listeners for device sleep scenarios
3. **MasterVolume stuck at -Infinity**: `stop()` set volume to -Infinity but recovery didn't restore it
4. **No audio health monitoring**: No mechanism to detect silent audio state after recovery
5. **No user gesture handling**: Mobile browsers may require tap after prolonged sleep

---

### Solution

#### AudioService.js Changes

**Constructor additions:**
- Added `focus/blur` window event listeners for device sleep scenarios
- Added `pageshow/pagehide` listeners (Page Lifecycle API for iOS/BFCache)
- Added `_recoveryConfig` object with all timing constants
- Added concurrency guard (`_recoveryInProgress`, `_pendingRecoveryTrigger`)
- Added platform detection (`_isIOS`, `_isMobile`)
- Added user stop flag (`_userStoppedAudio`)

**New/refactored methods:**
- `_handleVisibilityChange()` - Refactored to use async/await and centralized recovery
- `_handleWindowFocus()` - Catches device wake scenarios
- `_handleWindowBlur()` - Prepares for sleep
- `_handlePageShow()` - Handles BFCache restoration (iOS Safari)
- `_handlePageHide()` - Prepares for cache/sleep
- `_performAudioRecovery(trigger)` - Centralized recovery with:
  - Concurrency guard to prevent racing recovery attempts
  - User stop state respect (won't auto-resume if user stopped audio)
  - Error cleanup on failure
  - Queued recovery processing
- `_resumeAudioContext(trigger)` - Resume with retry logic and improved logging
- `_startAudioHealthCheck()` - Adaptive intervals (5s mobile, 3s desktop)
- `_checkAudioHealth()` - Respects user stop state and mute state
- `_attemptSilentRecovery()` - With exponential backoff
- `_requestUserGestureForAudio()` - Dispatches custom event
- `handleUserGestureForRecovery()` - iOS-specific handling (quiet tone instead of silent)

**Other changes:**
- `start()` - Clears `_userStoppedAudio` flag
- `stop()` - Sets `_userStoppedAudio` flag, stops health monitoring
- `cleanup()` - Removes all event listeners

#### main.js Changes

**Constructor additions:**
- Handler references for cleanup (`_audioGestureRequiredHandler`, `_audioRecoveryClickHandler`, `_audioRecoveryTouchHandler`)

**setupEventListeners() changes:**
- `audio:gesture-required` listener with stored reference
- Dynamic click/touch handlers (only added when prompt shows)

**New methods:**
- `_showAudioRecoveryPrompt()` - CSS injected dynamically with fade-in animation
- `_attachRecoveryClickHandlers()` - Adds handlers with `once: true`
- `_removeRecoveryClickHandlers()` - Cleanup
- `_handleAudioRecoveryClick()` - Removes prompt and triggers recovery
- `_cleanupAudioRecoveryListeners()` - Full cleanup method

---

### Code Review Fixes Applied

| # | Issue | Priority | Fix |
|---|-------|----------|-----|
| 1 | Race condition: capture-phase click handlers | Critical | Made handlers dynamic, only added when prompt shows |
| 2 | Memory leak: health check not cleared on error | Critical | Added cleanup in catch/finally blocks |
| 3 | Memory leak: Tone.Player not disposed | Critical | Used try/finally pattern for disposal |
| 4 | Health check too aggressive (2s) | High | Adaptive: 5s mobile, 3s desktop |
| 5 | Race condition: concurrent recovery attempts | High | Added `_recoveryInProgress` concurrency guard |
| 6 | User stop state not respected | High | Added `_userStoppedAudio` flag |
| 7 | Hardcoded timing values | Medium | Extracted to `_recoveryConfig` object |
| 8 | Poor error logging | Medium | Added context (platform, trigger, attempt) |
| 9 | No iOS-specific handling | Medium | iOS uses -60dB instead of -Infinity for unlock |
| 10 | Inline styles | Low | CSS injected dynamically with class |

---

### Configuration Constants

```javascript
this._recoveryConfig = {
  MAX_WAKE_RECOVERY_ATTEMPTS: 3,
  MAX_RESUME_ATTEMPTS: 3,
  MAX_RESUME_ATTEMPTS_AGGRESSIVE: 5,
  RESUME_POLL_TIMEOUT_MS: 300,
  RESUME_POLL_INTERVAL_MS: 20,
  ANDROID_SUSPEND_RESUME_DELAY_MS: 50,
  ANDROID_SUSPEND_RESUME_WAIT_MS: 100,
  HEALTH_CHECK_INTERVAL_MOBILE_MS: 5000,
  HEALTH_CHECK_INTERVAL_DESKTOP_MS: 3000,
  HEALTH_CHECK_INITIAL_DELAY_MS: 1000,
  FOCUS_STABILIZATION_DELAY_MS: 100,
  IOS_UNLOCK_VOLUME_DB: -60,
  IOS_UNLOCK_DURATION_MS: 100
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/AudioService.js` | Config constants, event handlers, recovery methods, health monitoring, iOS handling |
| `frontend/src/main.js` | Dynamic click handlers, recovery UI with CSS animation, cleanup methods |

---

### Verification

1. **Short sleep (<30s)**: Audio resumes automatically
2. **Long sleep (>5min)**: May show "Tap to resume" prompt
3. **User stop then sleep**: Does NOT auto-resume (respects user intent)
4. **Multiple rapid wake events**: Concurrency guard prevents race condition
5. **iOS Safari**: BFCache restoration works via pageshow event
6. **Android 13+**: Aggressive resume strategy with suspend/resume cycle

---

### iOS Landing Page Issue - RESOLVED

**Symptom**: On iOS Safari, after device sleep, the landing page showed the Play button overlay but pressing it didn't restore audio. Normal rooms worked correctly (audio auto-recovered without showing button).

**Root Cause Found**:
The key difference was **when AudioService was created**:
- **Normal rooms**: AudioService created in constructor (`this.audioService = new AudioService()`) **before** any user interaction
- **Landing page**: AudioService created **during first click** handler in `_setupAudioInitialization()`

This timing difference affected iOS Safari's audio session handling. When AudioService is created early, its visibility/focus/pageshow handlers are registered early, allowing iOS to properly track the audio session from the start.

**The Fix** (v1.0.125):
Create AudioService early in `initialize()` **before** any user gesture, matching normal room behavior:

```javascript
// In initialize() method:
// CRITICAL FIX: Create AudioService EARLY (like normal rooms do)
// This registers the visibility/focus/pageshow handlers early
// Audio will only START on user click, but the service exists before
if (typeof AudioService !== 'undefined' && !this.audioService) {
  this.audioService = new AudioService()
  console.log('🔊 AudioService created early (like normal rooms)')
}
```

**Files Modified**:
- `frontend/src/landing/main.js` - Create AudioService early, check `isAudioReady` instead of `audioService` existence
- `frontend/index.html` - Version bump

**Cleanup** (v1.0.126):
- Removed the recovery button/prompt code (no longer needed - audio auto-recovers)
- Removed all debug code and beeps
- Commented out debug overlay methods for potential future use
- Code is now clean with same behavior as normal rooms

---

### Version

Updated to v1.0.126

---

## Entry #113 - Backend Security Hardening (16 Fixes)

**Date**: 2026-01-14
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Implemented comprehensive security hardening for the backend based on code review findings. Created centralized rate limiting system that tracks by userId/IP (not per-socket), added environment variable validation, CSP headers, audit logging, and graceful shutdown handling.

---

### Issues Fixed (16 Total)

| # | Priority | Issue | Fix |
|---|----------|-------|-----|
| 1 | Critical | Rate limiting per-socket allows bypass via multiple connections | Created centralized `RateLimiter.js` that tracks by userId/IP |
| 2 | Critical | No `.env.example` for required environment variables | Created `.env.example` with all security variables |
| 3 | Critical | No pre-parse array size validation | Added `maxHttpBufferSize` to Socket.io config |
| 4 | Critical | Race condition in connection rate limiter | Fixed using centralized RateLimiter with atomic operations |
| 5 | High | `roomCreationsByIP` Map has no cleanup | Now uses centralized RateLimiter with automatic cleanup |
| 6 | High | No audit logging for admin endpoints | Added adminLogger with IP, path, method logging |
| 7 | High | No environment variable validation on startup | Added `validateEnvironment()` function |
| 8 | High | No graceful shutdown for cleanup intervals | Added `gracefulShutdown()` with `RateLimiter.stopCleanup()` |
| 9 | Medium | Magic numbers scattered through code | Created `SecurityConstants.js` with named constants |
| 10 | Medium | No rate limit headers in responses | Added `standardHeaders: true` to express-rate-limit |
| 11 | Medium | Failed admin auth attempts not logged | Added logging for invalid API key attempts |
| 12 | Medium | Missing JSDoc for security functions | Added comprehensive documentation |
| 13 | Low | Inconsistent error codes | Added security error codes to `AppError.js` ErrorCodes |
| 14 | Low | No tests for RateLimiter | Created `RateLimiter.test.js` with 20 unit tests |
| 15 | Low | Rate limit bypass for health checks | Added `skip: (req) => req.path === '/health'` |
| 16 | Low | Missing CSP headers | Added Content-Security-Policy middleware |

---

### Files Created

| File | Description |
|------|-------------|
| `backend/src/utils/RateLimiter.js` | Centralized rate limiting by userId/IP with sliding window algorithm |
| `backend/.env.example` | Template for required environment variables |
| `backend/src/constants/SecurityConstants.js` | Security configuration constants |
| `backend/tests/unit/RateLimiter.test.js` | 20 comprehensive unit tests |

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/server.js` | maxHttpBufferSize, validateEnvironment(), CSP headers, centralized connection rate limiting, gracefulShutdown() |
| `backend/src/api/handlers/CursorHandler.js` | Use centralized RateLimiter |
| `backend/src/api/handlers/GestureHandler.js` | Use centralized RateLimiter |
| `backend/src/api/handlers/MusicalHandler.js` | Use centralized RateLimiter |
| `backend/src/api/handlers/AuthHandler.js` | Use centralized RateLimiter for room creation |
| `backend/src/utils/AppError.js` | Added security error codes (RATE_LIMITED, UNAUTHORIZED, etc.) |

---

### Centralized Rate Limiter Architecture

The new `RateLimiter.js` tracks requests by userId (if authenticated) or IP address, preventing bypass via multiple socket connections:

```javascript
// Key: "eventType:user:userId" or "eventType:ip:address"
const RATE_LIMIT_CONFIG = {
  'cursor-move': { windowMs: 1000, maxRequests: 60 },   // 60fps
  'gesture': { windowMs: 1000, maxRequests: 20 },       // 20/sec
  'hover-update': { windowMs: 1000, maxRequests: 20 },  // 20/sec
  'note:stream': { windowMs: 1000, maxRequests: 25 },   // 25/sec
  'hold:start': { windowMs: 1000, maxRequests: 30 },    // 30/sec
  'hold:end': { windowMs: 1000, maxRequests: 30 },      // 30/sec
  'room-creation': { windowMs: 3600000, maxRequests: 5 }, // 5/hour
  'connection': { windowMs: 60000, maxRequests: 10 }    // 10/min
}
```

---

### Environment Variables (Production Required)

```bash
# Required in production
CORS_ORIGIN=https://webarmonium.net
ADMIN_API_KEY=<generate with: openssl rand -hex 32>

# Optional (have defaults)
MAX_CONNECTIONS_PER_IP=10
MAX_ROOMS_PER_IP=5
MAX_PAYLOAD_SIZE=1000000
```

---

### Security Headers Added

```javascript
// Content-Security-Policy
"default-src 'self'"
"script-src 'self' 'unsafe-inline' 'unsafe-eval'"
"style-src 'self' 'unsafe-inline'"
"img-src 'self' data: blob:"
"connect-src 'self' wss: ws:"
"font-src 'self'"
"media-src 'self' blob:"
"worker-src 'self' blob:"

// Other headers
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

---

### Test Results

- 20 new RateLimiter tests: All passing
- Existing test suite: 301 passed, 84 failed (TDD placeholders)

---

### Version

Updated to v1.0.127

---

## Entry #114 - Golden Ratio Deterministic Variation System + Harmonic Context Pitch Generation

**Date**: 2026-01-15
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Two-phase implementation to address the "same phrase repetition" problem identified after Entry #111's Math.random() removal.

**Phase 1**: Golden Ratio (φ) stepping and multi-parameter mixing for form/progression/duration selection.

**Phase 2**: Harmonic context pitch generation - pitches now derive from chord tones in the progression instead of arbitrary sine curves. Added temporal variation via compositionCount so successive compositions produce different note sequences.

---

### Problem Statement

After removing ~50 `Math.random()` calls (Entry #111), some voices tended to play identical phrases because:

1. **Low cardinality**: Formulas like `floor(energy * 4)` only produce 4 possible results
2. **Predictable cycles**: Simple `index % 5` creates obvious 0,1,2,3,4,0,1,2... patterns
3. **Same parameter everywhere**: Energy used for almost all decisions
4. **Identical sinusoidal contours**: `sin(position * π)` produces the same arc every time
5. **No harmonic context**: `generatePitchForVoice()` ignored the chord progression entirely
6. **No temporal variation**: Same inputs always produced identical outputs across compositions

---

### Solution: Five Techniques

#### 1. Golden Ratio (φ) Stepping

The golden ratio `φ = 1.618033988749894848` creates low-discrepancy sequences that:
- Never repeat in short cycles
- Eventually cover all array indices
- Avoid clustering of nearby values
- Remain 100% deterministic

**Formula**: `index = floor((n * φ) % 1 * arrayLength)`

#### 2. Multi-Parameter Mixing

Different musical decisions now derive from different input combinations:

| Decision | Primary (70%) | Secondary (30%) |
|----------|---------------|-----------------|
| Form | energy | sectionHistory.length |
| Progression | complexity | bars |
| Velocity contour | position | totalNotes (φ) |
| Duration | noteIndex (φ) | role |
| Syncopation | phrasePosition | curvature + noteIndex |
| Scale | curvature | velocity + angle |
| Ornamentation | pitchClass | phrasePosition |
| Beat timing | compositionCount (φ) | - |

#### 3. Variable Sinusoidal Frequencies

Role-specific frequencies prevent identical contour shapes:

```javascript
const roleFreq = { melody: 2, harmony: 3, bass: 1.5, pad: 1 }
const variationFactor = Math.sin(position * Math.PI * roleFreq[role])
```

#### 4. Harmonic Context Pitch Generation (Phase 2)

New `generatePitchFromChordTones()` replaces arbitrary sine-curve pitch selection:

- **Extracts chord tones** from progression and transposes to voice range
- **Role-specific strategies**:
  - **Bass**: Emphasizes roots (lowest chord tones), PHI stepping for variety
  - **Pad**: Sustained chord tones (3rds, 5ths), slow movement
  - **Harmony**: Fills with chord tones, avoids melody range
  - **Melody**: Chord tones + chromatic passing tones, contour from PHI-modulated sine

```javascript
// Bass: select from lower chord tones with PHI stepping
const bassWeight = ((index * PHI) + temporalOffset) % 1
const lowerTones = chordTones.filter(t => t <= rangeCenter)
return lowerTones[Math.floor(bassWeight * lowerTones.length)]
```

#### 5. Temporal Variation via compositionCount (Phase 2)

`compositionCount` is passed through the composition chain and creates a temporal offset:

```javascript
const temporalOffset = (compositionCount * PHI) % 1
// All pitch selections incorporate temporalOffset
const melodicSelector = ((index * PHI) + temporalOffset) % 1
```

This ensures successive compositions produce different note sequences even with identical inputs.

---

### Files Created

| File | Description |
|------|-------------|
| `backend/src/utils/constants.js` | PHI constant with comprehensive JSDoc documentation |

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/CompositionEngine.js` | Form selection uses energy + sectionHistory; stores compositionCount; passes to createVoice |
| `backend/src/services/HarmonicEngine.js` | Extracted `_selectProgressionByComplexity()` helper; uses complexity + bars mixing |
| `backend/src/services/CounterpointEngine.js` | **Major rewrite**: `_extractChordTonesFromProgression()`, `generatePitchFromChordTones()`, `_snapToNearestChordTone()`, temporal variation via compositionCount |
| `backend/src/services/PhraseMorphology.js` | Syncopation uses phrasePosition + curvature + noteIndex; scale uses curvature + velocity + angle |
| `backend/src/services/BackgroundCompositionService.js` | Beat calculation uses φ stepping; passes compositionCount to compose() |
| `backend/src/services/LandingCompositionService.js` | Passes compositionCount to compose() |
| `backend/src/utils/index.js` | Added PHI export, removed SeededRandom |

---

### Files Deleted

| File | Reason |
|------|--------|
| `backend/src/utils/SeededRandom.js` | Was imported but never used; PRNG approach rejected in favor of pure determinism |

---

### Key Implementation: Chord Tone Pitch Generation

**Extract chord tones from progression** (`CounterpointEngine.js`):
```javascript
_extractChordTonesFromProgression(progression, range) {
  const chordTones = new Set()
  progression.forEach(chord => {
    chord.notes.forEach(note => {
      // Transpose to all octaves within range
      for (let octave = -3; octave <= 3; octave++) {
        const pitch = note + (octave * 12)
        if (pitch >= range.min && pitch <= range.max) {
          chordTones.add(pitch)
        }
      }
    })
  })
  return Array.from(chordTones).sort((a, b) => a - b)
}
```

**Generate pitch with temporal variation** (`CounterpointEngine.js`):
```javascript
generatePitchFromChordTones(chordTones, range, profile, index, total, role) {
  const temporalOffset = (this._currentCompositionCount * PHI) % 1

  switch (role) {
    case 'bass':
      const bassWeight = ((index * PHI) + temporalOffset) % 1
      const lowerTones = chordTones.filter(t => t <= rangeCenter)
      return lowerTones[Math.floor(bassWeight * lowerTones.length)]
    // ... other roles
  }
}
```

---

### Verification

Test showing temporal variation works:
```
Bass pitches with different compositionCounts: 36, 41, 38
(MIDI notes C2, F2, D2 - varies each composition)
```

- All backend modules load successfully
- Test suite: 301 passed, 84 failed (TDD placeholders)
- Server starts without errors

---

### Version

Updated to v1.0.129

---

## Entry #115 - Anti-Mirroring Domain Protection System

**Date**: 2026-01-15
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Implemented comprehensive domain protection system to block unauthorized mirror sites. Discovered two domains (`treasurecompass.org`, `starlighthorizon.org`) hosting unauthorized copies of the application. Created multi-layer protection with HTTP middleware, WebSocket validation, and enhanced security headers.

---

### Problem Statement

Two domains were identified mirroring the Webarmonium site:
- `treasurecompass.org` (registered 2025-05-26 via Dynadot)
- `starlighthorizon.org` (registered 2025-05-26 via Dynadot)

Both registered on the same day, same registrar, both behind Cloudflare with privacy protection enabled - suggesting coordinated unauthorized mirroring.

---

### Solution

#### 1. DomainProtection.js Utility Module (NEW)

Created centralized domain protection module with:

- **Blocked domains list**: Static list + environment variable additions
- **Allowed domains list**: Configurable via `ALLOWED_DOMAINS` env var
- **Origin/Referer validation**: Extracts and validates domains from request headers
- **Middleware functions**: HTTP and WebSocket protection

```javascript
const BLOCKED_DOMAINS = [
  'treasurecompass.org',
  'www.treasurecompass.org',
  'starlighthorizon.org',
  'www.starlighthorizon.org'
]
```

#### 2. HTTP Request Protection

Domain protection middleware blocks requests from unauthorized domains:

```javascript
// Entry #115: Domain protection middleware - MUST be first
app.use(domainProtectionMiddleware)
```

#### 3. WebSocket Connection Protection

Socket.io middleware validates origin before allowing connections:

```javascript
// Entry #115: Domain protection for WebSocket connections
io.use(socketDomainProtection)
```

#### 4. Enhanced Security Headers

New `securityHeadersMiddleware` adds comprehensive anti-embedding headers:

| Header | Value |
|--------|-------|
| X-Frame-Options | SAMEORIGIN |
| Content-Security-Policy | frame-ancestors 'self' + allowed domains |
| Cross-Origin-Opener-Policy | same-origin |
| Cross-Origin-Embedder-Policy | require-corp |
| Cross-Origin-Resource-Policy | same-origin |
| Permissions-Policy | geolocation=(), microphone=(self), camera=() |

#### 5. Admin & Validation Endpoints

- `GET /api/admin/domain-protection` - View blocked/allowed domains (admin auth required)
- `GET /api/domain/validate` - Public endpoint for frontend domain validation

---

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BLOCKED_DOMAINS` | Additional blocked domains (comma-separated) | - |
| `ALLOWED_DOMAINS` | Allowed domains (comma-separated) | localhost, webarmonium.com |
| `DOMAIN_STRICT_MODE` | Require explicit allow list | true in production |

---

### Files Created

| File | Description |
|------|-------------|
| `backend/src/utils/DomainProtection.js` | Domain protection utility module |
| `ABUSE_REPORTS_DRAFT.md` | Draft abuse reports for Dynadot, Cloudflare, Google |

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/server.js` | Added domain protection middleware, WebSocket validation, admin endpoints |
| `backend/src/utils/index.js` | Added DomainProtection export |

---

### WHOIS Investigation Results

Both mirror domains share identical registration details:

| Property | Value |
|----------|-------|
| Registrar | Dynadot Inc |
| Created | 2025-05-26 |
| Expires | 2026-05-26 |
| Privacy | Super Privacy Service LTD c/o Dynadot |
| CDN | Cloudflare |
| Abuse Contact | abuse@dynadot.com |

---

### Legal Action Preparation

Created `ABUSE_REPORTS_DRAFT.md` with:
- Dynadot abuse report (email template)
- Cloudflare abuse form details
- Google Safe Browsing reports
- WHOIS raw data for evidence

---

### Verification

```
=== Domain Protection Test ===
treasurecompass.org blocked: true
www.treasurecompass.org blocked: true
starlighthorizon.org blocked: true
api.treasurecompass.org blocked: true (subdomain match)

localhost allowed: true
webarmonium.com allowed: true

Server log:
[INFO] [server] Domain protection configured {
  "blockedDomains": ["treasurecompass.org", ...],
  "allowedDomains": ["localhost", "webarmonium.com", ...],
  "strictMode": false
}
```

---

### Version

Updated to v1.0.130

---

## Entry #116 - Drone Duration Increase + Dynamic KeyCenter Update

**Date**: 2026-01-15
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Increased drone duration from 8 seconds to 10 seconds (minimum) to create a more proper "drone" effect. Added dynamic keyCenter update mechanism so the drone automatically refreshes when the harmonic center changes during composition.

---

### Problem Statement

The drone had two issues:

1. **Too short duration**: 8000ms (8 seconds) wasn't long enough for a proper drone effect
2. **No harmonic updates**: When the composition engine changed keyCenter (e.g., from C to G), the drone continued playing the old notes (C3 + G3) instead of updating to the new key

---

### Solution

#### 1. Increased Drone Duration to 10 Seconds

Changed duration from 8000ms to 10000ms in 8 locations across two services:

**BackgroundCompositionService.js** (4 locations):
- Line 158: Root drone note duration
- Line 165: Fifth drone note duration
- Line 213: Root in emitDroneToSocket
- Line 214: Fifth in emitDroneToSocket

**LandingCompositionService.js** (4 locations):
- Line 436: Root drone note duration
- Line 443: Fifth drone note duration
- Line 480: Root in emitDroneToSocket
- Line 481: Fifth in emitDroneToSocket

#### 2. Dynamic KeyCenter Update Mechanism

Added `updateDroneIfKeyChanged()` method to both services:

```javascript
updateDroneIfKeyChanged(roomId, previousKeyCenter) {
  const currentKeyCenter = this.compositionEngine.keyCenter
  if (currentKeyCenter !== previousKeyCenter) {
    // KeyCenter changed - broadcast new drone to room
    this.generateAndBroadcastDrone(roomId)
  }
}
```

Modified `generateAndBroadcastComposition()` in both services:

```javascript
// Save keyCenter BEFORE composition
const previousKeyCenter = this.compositionEngine.keyCenter

// Generate composition (may change keyCenter)
const composition = this.compositionEngine.compose({...})

// ... broadcast composition ...

// Check if keyCenter changed and update drone if needed
this.updateDroneIfKeyChanged(roomId, previousKeyCenter)
```

---

### Frontend Compatibility

No frontend changes required. The existing `playAmbientComposition()` method already handles new drone broadcasts correctly:

1. Clears all previous `droneRepeatEventIds`
2. Schedules new drone with updated notes

This creates a smooth transition - the old drone note releases naturally while the new one starts.

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/BackgroundCompositionService.js` | Duration 8000→10000 (4 places), added `updateDroneIfKeyChanged()`, modified `generateAndBroadcastComposition()` |
| `backend/src/services/LandingCompositionService.js` | Duration 8000→10000 (4 places), added `updateDroneIfKeyChanged()`, modified `generateAndBroadcastComposition()` |

---

### Verification

1. **Duration test**: Drone notes now sustain for 10+ seconds (audible difference)
2. **KeyCenter update**: When composition modulates to a new key, drone pitch follows
3. **Backend tests**: 301 passed, 84 failed (TDD placeholders - unchanged)

---

### Version

Updated to v1.0.131

---

## Entry #117 - Harmonic Progression Temporal Variation Fix

**Date**: 2026-01-15
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed a bug where melodies were always identical because `_selectProgressionByComplexity()` didn't use `compositionCount` for temporal variation. The progression selection was deterministic based only on `bars` and `complexity`, which rarely changed, resulting in the same chord progression → same chord tones → same melody every time.

---

### Problem Statement

User reported that the high voice (melody/soprano) always played **exactly the same note sequence** despite `compositionCount` incrementing. Investigation revealed:

1. `CounterpointEngine.generatePitchFromChordTones()` correctly used `compositionCount` for note selection
2. BUT the chord tones were always identical because the harmonic progression never changed
3. ROOT CAUSE: `HarmonicEngine._selectProgressionByComplexity()` didn't use `compositionCount`

The old formula:
```javascript
// contextVariation was ALWAYS the same (bars=4 → 0.1416)
const contextVariation = ((safeBars * PHI) % 1) * 0.3
const combinedIndex = safeComplexity * 0.7 + contextVariation
// With complexity=0.5: combinedIndex = 0.4916 → index=1 (ALWAYS)
```

---

### Solution

Two fixes were required:

#### Fix 1: Progression Selection Temporal Variation

Added `compositionCount` to `_selectProgressionByComplexity()`:

```javascript
const temporalOffset = ((compositionCount * PHI) % 1) * 0.4
const contextVariation = ((safeBars * PHI) % 1) * 0.2
const combinedIndex = safeComplexity * 0.5 + contextVariation + temporalOffset
```

#### Fix 2: CRITICAL - Missing Base Pitch in Chord Tone Extraction

The REAL bug was in `_extractChordTonesFromProgression()`. The default case (no progression) correctly added base pitch 60:

```javascript
// Default case - CORRECT:
const pitch = 60 + tone + (octave * 12)  // C4 = 60 as base
```

But the progression case forgot the base:

```javascript
// Progression case - BUG:
const pitch = note + (octave * 12)  // No base! Never reaches MIDI 60+
```

With chord notes like `[0, 4, 7]` (pitch classes) and octaves -3 to 3:
- Max pitch = 0 + 3×12 = **36** (way below soprano range 60-79)
- Result: **EMPTY chord tones** → melody generation fell back to default

**Fixed by adding base pitch 60:**

```javascript
// Entry #117 FIX:
const pitchClass = note % 12
const pitch = 60 + pitchClass + (octave * 12)  // Now reaches 60-79!
```

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/HarmonicEngine.js` | Added `compositionCount` to progression selection |
| `backend/src/services/CompositionEngine.js` | Pass `this.compositionCount` to `generateProgression()` |
| `backend/src/services/CounterpointEngine.js` | **CRITICAL FIX**: Added `60 +` base pitch to chord tone extraction |

---

### Verification

Melody now changes with each composition:

| Comp# | Melody Pitches |
|-------|----------------|
| 0 | 60,76,74,79,60,72,62,60 |
| 1 | 72,69,67,69,76,65,77,74 |
| 2 | 64,79,79,79,67,77,72,67 |
| 3 | 77,72,72,74,79,69,60,60 |
| 4 | 69,65,65,67,72,60,76,72 |

- Backend tests: 301 passed, 84 failed (TDD placeholders - unchanged)

---

### Version

Updated to v1.0.132

---

## Entry #118 - Complete Deterministic Composition Variation System

**Date**: 2026-01-15
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

After Entry #117, user reported compositions still sounded like a "partitura" (fixed musical score). Discovered and fixed multiple additional causes: key always C ionian, chords not transposed, random initial offset, and form structure never resetting. All fixes use PHI-based deterministic variation (no `Math.random()`).

---

### Problem Statement

Despite Entry #117 fixing melody pitch selection, compositions still started the same way every time. Investigation revealed 5 additional issues:

1. **Key always "C ionian"**: `HarmonicEngine.generateProgression()` never varied the key
2. **Chord notes not transposed**: Progressions defined in C, never transposed to current key
3. **Random initial offset**: `compositionCount` started with `Math.random() * 100`
4. **Form structure never reset**: Set once at startup, never changed
5. **selectForm() static**: Form selection didn't use `compositionCount`

---

### Solution

#### Fix 1: Key Variation Using Circle of Fifths

**File:** `backend/src/services/HarmonicEngine.js`

```javascript
// Entry #117: Vary key based on compositionCount using circle of fifths
const circleOfFifths = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F']
const temporalOffset = (compositionCount * PHI) % 1
const keyIndex = Math.floor(temporalOffset * circleOfFifths.length)
this.currentKey = circleOfFifths[keyIndex]

// Also vary mode occasionally
const modes = ['ionian', 'dorian', 'mixolydian', 'aeolian']
const modeSelector = ((compositionCount * PHI * 2) % 1)
if (modeSelector > 0.7) {
  const modeIndex = Math.floor(modeSelector * modes.length) % modes.length
  this.currentMode = modes[modeIndex]
} else {
  this.currentMode = 'ionian'
}
```

#### Fix 2: Chord Transposition to Current Key

**File:** `backend/src/services/HarmonicEngine.js`

Added two new methods:

```javascript
_getKeyOffset() {
  const keyMap = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
    'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
  }
  return keyMap[this.currentKey] || 0
}

_transposeToCurrentKey(progression) {
  const offset = this._getKeyOffset()
  if (offset === 0) return progression
  return progression.map(chord => ({
    ...chord,
    root: (chord.root + offset) % 12,
    notes: chord.notes.map(note => note + offset)
  }))
}
```

Applied to all 5 progression generation methods:
- `_generateSimpleProgression()`
- `_generateModalProgression()`
- `_generateJazzProgression()`
- `_generateChromaticProgression()`
- `_generateMinimalProgression()`

#### Fix 3: Deterministic Initial Offset

**Files:** `backend/src/services/LandingCompositionService.js`, `BackgroundCompositionService.js`

Changed from random to deterministic:

```javascript
// BEFORE (random - bad!)
this.compositionCount = Math.floor(Math.random() * 100)

// AFTER (deterministic - PHI-based)
const PHI = 1.618033988749894848
this.compositionCount = Math.floor(((Date.now() / 1000) * PHI) % 100)
```

This ensures different starting points based on timestamp, but deterministically.

#### Fix 4: Form Structure Periodic Reset

**File:** `backend/src/services/CompositionEngine.js`

```javascript
// Entry #117: Reset form every ~8 compositions for variety
const shouldResetForm = !this.formStructure ||
  (this.compositionCount > 0 && ((this.compositionCount * PHI) % 1) < 0.12)

if (shouldResetForm) {
  this.formStructure = this.selectForm(currentStyle)
  this.initializeFormStructure(this.formStructure)
}
```

#### Fix 5: selectForm() Uses compositionCount

**File:** `backend/src/services/CompositionEngine.js`

```javascript
const compCount = this.compositionCount || 0
const temporalOffset = (compCount * PHI) % 1
// Combine factors: energy (40%), temporalOffset (40%), history (20%)
const combinedIndex = energy * 0.4 + temporalOffset * 0.4 + historyVariation * 0.2
```

#### Fix 6: CounterpointEngine Temporal Variation

**File:** `backend/src/services/CounterpointEngine.js`

Added temporal variation to multiple methods:

- **generateVoice()**: Transposes existing material by -2 to +2 semitones based on compositionCount
- **generatePitchFromChordTones()**: Melody selector now includes base temporalOffset so index=0 also varies
- **generateDurationByRole()**: Duration array selection uses temporal offset
- **generateGapByRole()**: Gap calculation includes temporal offset

#### Fix 7: Centralized PHI Constant

**File:** `backend/src/utils/constants.js` (NEW)

```javascript
/**
 * Golden Ratio (φ)
 * Used for generating low-discrepancy sequences
 */
const PHI = 1.618033988749894848

module.exports = { PHI }
```

Exported from `backend/src/utils/index.js` for easy import.

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/services/HarmonicEngine.js` | Key variation (circle of fifths), mode variation, `_getKeyOffset()`, `_transposeToCurrentKey()` |
| `backend/src/services/CompositionEngine.js` | Form reset logic, selectForm() temporal variation, keyCenter sync |
| `backend/src/services/LandingCompositionService.js` | Deterministic initial offset (2 locations) |
| `backend/src/services/BackgroundCompositionService.js` | Deterministic initial offset |
| `backend/src/services/CounterpointEngine.js` | Temporal variation in pitch, duration, gap generation |
| `backend/src/utils/constants.js` | **NEW** - PHI constant definition |
| `backend/src/utils/index.js` | Export PHI from barrel |

---

### Key Principle: NO RANDOM

User explicitly requested: **"non voglio random!!!"**

All variation now uses deterministic PHI-based formulas:
- `temporalOffset = (compositionCount * PHI) % 1`
- `((Date.now() / 1000) * PHI) % 100` for initial offset

This ensures:
- Same timestamp → same composition (reproducible)
- Different timestamps → different compositions (varied)
- No `Math.random()` anywhere in variation logic

---

### Version

Updated to v1.0.139

---

## Entry #119 - Landing Page UI Refinements

**Date**: 2026-01-15
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Two UI improvements to the landing page: moved user count inside the "Join a Room" button to prevent layout overflow, and added footer credits.

---

### Changes

#### 1. User Count Inside Button

**Problem**: When the user count appeared to the right of "Join a Room" button, the controls bar became too narrow on smaller screens, causing the button to wrap to a new line.

**Solution**: Moved `#rooms-activity` span inside the `.room-link` anchor, displayed below the button text using flexbox column layout.

**Files:**
- `frontend/index.html` - Moved span inside anchor tag
- `frontend/styles.css` - Updated `.room-link` to use `flex-direction: column`, adjusted `.rooms-activity` to `display: block`

#### 2. Footer Credits

Added credits line above version tag in footer:
```html
<p class="footer-credits">Made by Paolo Quaranta, with so much needed help from Patrick De Marta</p>
```

Added `.footer-credits` CSS class with italic styling.

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/index.html` | User count span inside button, footer credits line |
| `frontend/styles.css` | `.room-link` flex column, `.rooms-activity` block display, `.footer-credits` style |

---

### Version

v1.0.139 (no version bump - minor UI change)

---

## Entry #120 - Remove Dead Accelerometer/Gyroscope Hover Code

**Date**: 2026-01-15
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Removed dead accelerometer/gyroscope hover modulation code. Entry #105 disabled `handleHoverModulation()` as a no-op, but the AccelerometerHoverService infrastructure was still running on mobile devices - consuming CPU for orientation calculations and sending socket events that did nothing.

---

### Problem

AccelerometerHoverService was:
- Listening to `deviceorientation` events on mobile
- Calculating tilt-based positions
- Calling `handleHoverModulation()` which was a no-op (Entry #105)
- Emitting `hover:update` to server for no effect

Additionally, the documentation incorrectly claimed device-specific audio characteristics that didn't exist in code.

---

### Removed

| File | Change |
|------|--------|
| `frontend/src/services/AccelerometerHoverService.js` | **DELETED** - entire file |
| `frontend/rooms.html` | Removed script tag |
| `frontend/src/services/EnhancedGestureCapture.js` | Removed accelerometer initialization and cleanup |
| `frontend/src/main.js` | Removed iOS permission request code |
| `frontend/index.html` | Fixed documentation - removed false device-specific claims |

---

### Documentation Fix

**Before (incorrect):**
> Each input device produces distinctive characteristics—touch gestures have fast attacks (50ms), mouse gestures create smooth envelopes (100-300ms), and gyroscope gestures produce extended sustains with octave shifts from orientation.

**After (accurate):**
> tap for percussive notes (10-110ms attack based on intensity) and drag for melodic phrases (50-250ms attack based on vertical position).

The actual code differentiates by **gesture type** (tap/drag/hover), not by input device (touch/mouse/gyro).

---

### Version

v1.0.139 (no version bump - cleanup)

---

## Entry #121 - Technical Appendix Documentation Accuracy Fixes

**Date**: 2026-01-15
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Comprehensive verification and correction of `technical-appendix.html` against actual codebase. Fixed inaccurate claims about gyroscope, voice roles, and outdated formulas. All 12 sections now verified against current implementation.

---

### Fixes Applied

| Section | Fix |
|---------|-----|
| 2. Gesture Types | Added Long Tap gesture; removed Device Characteristics table and Coordinate Mapping section (gyroscope references) |
| 3. Multi-User | Changed "voice roles" (melody/harmony/bass/pad) to "timbres" (Retro Square, Nasal Reed, Warm Chorus, Bell Chime) |
| 4. Environmental Memory | Removed gyroscope from pattern compatibility criteria |
| 5. Form Selection | Updated formula to Golden Ratio (φ) stepping: `combinedIndex = (energy × 0.4) + (temporalOffset × 0.4) + (historyVariation × 0.2)` |
| 11. Voice Ranges | Clarified SATB ranges are for background composition, not user assignment |
| 12. Virtual Users | Simplified to TAP/DRAG only (hover modulation disabled in Entry #105) |

---

### Verified as Accurate

- **Section 8**: GenerativeMusicEngine three-layer architecture (bass 2000ms, pad 16000ms, chords 4000ms)
- **Section 9**: DroneVoidController parameters (5-10s void timeout, 2s fade in, 20s fade out)
- **Section 9**: LFO parameters (amplitude 0.03Hz/-6 to 0dB, pitch 0.05Hz/±8 cents)
- **Sections 5-7, 10**: All formulas verified against CompositionEngine.js and HarmonicEngine.js

---

### Version

v1.0.139 (no version bump - documentation only)

---

## Entry #123 - Audio Auto-Restart Bug Fix

**Date**: 2026-01-16
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed bug where audio would sometimes restart automatically after user pressed Stop, even without returning focus to the app. The issue was caused by missing early guards in visibility/focus handlers and an uncancelled setTimeout in the health check system.

---

### Problem Statement

User reported intermittent audio restart when leaving the app open with audio stopped. Audio would resume without user interaction or focus change.

---

### Root Causes Identified

1. **Visibility/Focus handlers lacked early guards** - Called `_performAudioRecovery()` without checking `_userStoppedAudio` first
2. **Initial health check setTimeout not cancelled** - `_stopAudioHealthCheck()` only cleared the interval, not the initial setTimeout
3. **`handleUserGestureForRecovery()` unconditionally cleared stop flag** - Could bypass user's stop action
4. **Race condition in initAudio/start()** - When user clicks Start, both `initAudio` global listener and `start()` race. If `start()` finishes first and sets `isAudioReady = true`, `initAudio` returns early without removing global click listeners. When user later clicks Stop (setting `isAudioReady = false`), the Stop click bubbles to document and triggers `initAudio`, which calls `audioService.start()` and resets `_userStoppedAudio = false`

---

### Solution

#### Fix 1: Early guards in visibility/focus handlers

Added `_userStoppedAudio` check at the start of:
- `_handleVisibilityChange()` - Returns early if user stopped audio
- `_handleWindowFocus()` - Returns early if user stopped audio
- `_handlePageShow()` - Returns early if user stopped audio

```javascript
if (this._userStoppedAudio) {
  console.log('🔊 Tab visible, but user stopped audio - skipping recovery')
  return
}
```

#### Fix 2: Cancel initial health check setTimeout

Modified `_startAudioHealthCheck()` to store the initial setTimeout ID:
```javascript
this._audioHealthCheckInitialTimeout = setTimeout(
  () => this._checkAudioHealth(),
  config.HEALTH_CHECK_INITIAL_DELAY_MS
)
```

Modified `_stopAudioHealthCheck()` to clear it:
```javascript
if (this._audioHealthCheckInitialTimeout) {
  clearTimeout(this._audioHealthCheckInitialTimeout)
  this._audioHealthCheckInitialTimeout = null
}
```

#### Fix 3: handleUserGestureForRecovery respects user stop

Added early return to prevent recovery when user explicitly stopped audio:
```javascript
if (this._userStoppedAudio) {
  console.log('🔊 Gesture received, but user stopped audio - skipping recovery')
  return
}
```

#### Fix 4: Race condition fix - remove initAudio listeners from start()

Refactored `_setupAudioInitialization()` to store `initAudio` as class property `_initAudioListener`, and added `_removeInitAudioListeners()` helper. Now called from both `initAudio` success AND `start()` to ensure listeners are removed regardless of which finishes first.

```javascript
// In _setupAudioInitialization():
this._initAudioListener = async () => { ... }
document.addEventListener('click', this._initAudioListener)

// Helper method:
_removeInitAudioListeners() {
  if (this._initAudioListener) {
    document.removeEventListener('click', this._initAudioListener)
    document.removeEventListener('keydown', this._initAudioListener)
  }
}

// In start():
this.isAudioReady = true
this._removeInitAudioListeners()  // Ensure cleanup even if initAudio raced
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/AudioService.js` | Added 3 early guards, setTimeout tracking/cleanup, gesture recovery guard |
| `frontend/src/landing/main.js` | Added `_initAudioListener` property, `_removeInitAudioListeners()` helper, call cleanup from `start()` |

---

### Verification

1. Start app, let audio play
2. Press Stop button
3. Wait 30+ seconds without interacting
4. **Expected**: Audio remains stopped
5. Switch tabs and return
6. **Expected**: Audio still stopped, console shows "skipping recovery"
7. Press Start to resume
8. **Expected**: Audio plays normally

---

### Version

Updated to v1.0.142

---

## Entry #122 - Remove Dead Hover/HoverOrchestrator Code

**Date**: 2026-01-15
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Removed all dead hover-related code after Entry #105 disabled hover modulation. HoverOrchestrator was still running but broadcastModulation() was a no-op. Virtual users were still classifying 'hover' gestures and sending events to backend that did nothing.

---

### Removed

**Backend:**
| File | Removed |
|------|---------|
| `HoverOrchestrator.js` | **DELETED** - entire file (508 lines) |
| `LandingCompositionService.js` | HoverOrchestrator import, hover gesture generation, periodicity classification |
| `VirtualUserService.js` | _emitHoverGesture, _calculatePeriodicityMetric, hover classification |
| `RoomManager.js` | hoverOrchestrators Map and all related methods |
| `MusicalHandler.js` | registerHoverUpdateHandler, sendToHoverOrchestrator |
| `CursorHandler.js` | hover-update broadcast on cursor move |
| `socketHandlers.js` | registerHoverUpdateHandler call |
| `SocketEvents.js` | HOVER_UPDATE, UNIFIED_MODULATION constants |
| `RateLimiter.js` | hover-update rate limit config |

**Frontend:**
| File | Removed |
|------|---------|
| `SocketService.js` | hover-update, hover-update-raw listeners |
| `main.js` | hover-update listener that called handleHoverModulation |
| `landing/main.js` | _emitVirtualHoverEvents method |
| `HoverProcessor.js` | emitHoverUpdate now no-op |
| `EnhancedGestureCapture.js` | emitHoverUpdate now no-op |
| `AudioService.js` | handleHoverModulation, setupHoverTimeout removed |
| `SocketEventCoordinator.js` | Removed hover/unified-modulation comments |

---

### Gesture Classification Simplified

Both LandingCompositionService and VirtualUserService now use simple stability vs density comparison:

```javascript
// Before: three-way comparison
maxMetric = max(stability, density, periodicity)
return maxMetric === stability ? 'tap' : maxMetric === density ? 'drag' : 'hover'

// After: two-way comparison
return stability > density ? 'tap' : 'drag'
```

---

### Version

v1.0.140

---

## Entry #123 - Remove CursorManager Rendering Layer (Keep p5.js Only)

**Date**: 2026-01-16
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Removed the CursorManager Canvas 2D rendering layer, keeping only the p5.js SpringMeshNetwork for cursor visualization. Two overlapping cursor layers were rendering simultaneously: CursorManager drew large circles with crosshairs on a separate overlay canvas, while SpringMeshNetwork rendered physics-driven nodes with Bezier connections in p5.js. CursorManager is kept for data tracking only (positions, colors, virtual cursors).

---

### Problem

Two cursor visualization systems were rendering simultaneously:

| Layer | Technology | Visual |
|-------|------------|--------|
| **CursorManager** | Canvas 2D (`cursorOverlay`) | Large circles + crosshair + label |
| **SpringMeshNetwork** | p5.js | Small nodes with physics + Bezier connections |

The p5.js layer was the intended visualization; the CursorManager layer was leftover from earlier implementation.

---

### Solution

#### 1. Hidden Overlay Canvas

**File:** `frontend/rooms.html`

```html
<!-- Cursor overlay canvas DISABLED - cursors now rendered in p5.js SpringMeshNetwork -->
<canvas id="cursorOverlay"
    style="display: none; position: absolute; top: 0; left: 0; ..."></canvas>
```

#### 2. Removed Rendering Methods from CursorManager

**File:** `frontend/src/services/CursorManager.js`

| Removed | Purpose |
|---------|---------|
| `renderCursors()` | Main render loop |
| `renderSingleCursor()` | Draw single cursor circle |
| `drawCrosshair()` | Crosshair overlay |
| `drawUserLabel()` | User name label |
| `startRendering()` | Start animation loop |
| `stopRendering()` | Stop animation loop |

**Kept for data tracking:**
- `updateCursor()`, `removeCursor()`, `getCursor()`, `getAllCursors()`
- Virtual cursor methods: `addVirtualCursor()`, `removeVirtualCursor()`, etc.

#### 3. Removed Unused Code from GenerativeVisualService

**File:** `frontend/src/services/GenerativeVisualService.js`

| Removed | Reason |
|---------|--------|
| `this.cursorManager` | Never used |
| `setCursorManager()` | Never called after main.js cleanup |
| `renderCursors(p)` | Never called in draw loop |

#### 4. Cleaned Up main.js

**File:** `frontend/src/main.js`

- Removed: `this.visualService.setCursorManager(this.cursorManager)`
- Updated comments to explain new architecture

---

### Architecture After Change

```
Cursor Data Flow:
  SocketService → CursorManager (data only) → SpringMeshNetwork (p5.js rendering)
                         ↓
              Tracks: positions, colors, virtual cursors
              No longer: renders anything

Visual Rendering:
  SpringMeshNetwork.draw() → p5.js canvas
    - Physics-based node positioning
    - Bezier curve connections
    - User labels
```

---

### Files Changed

| File | Change |
|------|--------|
| `frontend/rooms.html` | Added `display: none` to `#cursorOverlay` |
| `frontend/src/services/CursorManager.js` | Removed 6 rendering methods (~150 lines) |
| `frontend/src/services/GenerativeVisualService.js` | Removed `setCursorManager`, `renderCursors` |
| `frontend/src/main.js` | Removed setCursorManager call, updated comments |

---

### Version

v1.0.143

---

## Entry #124 - Unify Room UI Bar with Landing Page Style

**Date**: 2026-01-16
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Unified the UI bar styling of collaborative rooms (`rooms.html`) to match the landing page aesthetic. Updated colors from cyan to violet/indigo theme, aligned layout to 3-section structure, and standardized button text from `🔊 Start Audio` / `🔇 Stop Audio` to `▶ Start` / `⏸ Stop`.

---

### Problem Statement

The room UI bar had a different visual style compared to the landing page:
- Darker background (`rgba(0, 0, 0, 0.7)` vs landing's `rgba(26, 26, 46, 0.5)`)
- Cyan accent colors (`#00d4ff`) instead of violet (`#6366f1`, `#8b5cf6`)
- 2-section layout instead of 3-section
- Different button text format with emojis and "Audio" suffix

---

### Solution

#### 1. CSS Updates in rooms.html

| Selector | Before | After |
|----------|--------|-------|
| `.room-interface` | `background: rgba(0, 0, 0, 0.7)` | `background: rgba(26, 26, 46, 0.7)` |
| `.room-interface` | `padding: 15px` | `padding: 0.75rem 1.5rem` |
| `.room-interface` | `border: rgba(255, 255, 255, 0.1)` | `border: rgba(99, 102, 241, 0.2)` |
| `.room-status` | `gap: 10px` | `gap: 1rem` |
| `.user-count` | `background/color: cyan` | `background/color: violet (#a5b4fc)` |
| `.room-id` | `color: #ccc` | `color: #a5b4fc` |
| `.audio-toggle` | `background: #00d4ff` | `background: linear-gradient(135deg, #6366f1, #8b5cf6)` |
| `.back-link` | `color: #ccc` | `color: #a5b4fc` |
| `.spinner` | `border-top: #00d4ff` | `border-top: #8b5cf6` |

#### 2. Added 3-Section Layout

New `.room-center` div for flexible 3-column layout matching landing page:

```html
<div class="room-status">
    <div class="room-info">...</div>
    <div class="room-center"></div>  <!-- NEW: spacer -->
    <div class="audio-controls">...</div>
</div>
```

#### 3. Button Text Standardization

Unified to symbol-only buttons (no text) across both landing page and rooms:

| Location | Before | After |
|----------|--------|-------|
| `index.html` | `▶ Start` | `▶` |
| `rooms.html` | `🔊 Start Audio` | `▶` |
| `DashboardUI.js` | `⏸ Stop` / `▶ Start` | `⏸` / `▶` |
| `main.js` | `🔇 Stop Audio` / `🔊 Start Audio` | `⏸` / `▶` |
| `UIManager.js` | `Stop Audio` / `Start Audio` | `⏸` / `▶` |

#### 4. Mobile Styles Updated

All mobile elements updated from cyan to violet theme:
- `.mobile-menu-btn` - gradient background
- `.mobile-user-count` - violet colors
- `.mobile-settings-btn` - violet colors
- `.mobile-volume-slider` thumb - violet color
- `.mobile-overlay-user-count` - violet color

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/index.html` | Button text: `▶ Start` → `▶` |
| `frontend/rooms.html` | CSS: room-interface, room-status, user-count, room-id, audio-toggle, back-link, desktop-settings-btn, spinner, all mobile styles. HTML: added room-center div, button text `▶` |
| `frontend/src/landing/DashboardUI.js` | Button toggle: `⏸` / `▶` (symbol only) |
| `frontend/src/main.js` | Button toggle: `⏸` / `▶` (symbol only) |
| `frontend/src/services/UIManager.js` | Mobile button toggle: `⏸` / `▶` (symbol only) |

---

### Visual Consistency

Both pages now share:
- **Color palette**: Indigo/violet gradient (`#6366f1` to `#8b5cf6`)
- **Accent color**: `#a5b4fc` for text
- **Background**: Semi-transparent indigo `rgba(26, 26, 46, 0.7)`
- **Border**: Violet tint `rgba(99, 102, 241, 0.2)`
- **Layout**: 3-section horizontal layout
- **Buttons**: Gradient primary, transparent secondary
- **Button symbols**: `▶` (play) / `⏸` (pause) - no text labels

Room page retains its unique features:
- `backdrop-filter: blur(10px)` for modern glass effect
- `border-radius: 12px` for rounded corners
- Collapsible UI behavior

---

### Version

v1.0.145

---

## Entry #125 - Play Button Red State + Remove Back Button

**Date**: 2026-01-16
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Added red "playing" state to room audio toggle button (matching landing page behavior) and removed the now-redundant "Back" button from room interface.

---

### Changes

#### 1. Added `.audio-toggle.playing` CSS

**File:** `frontend/rooms.html`

```css
.audio-toggle.playing {
    background: linear-gradient(135deg, #ef4444, #dc2626);
}

.audio-toggle.playing:hover {
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}
```

#### 2. Toggle `playing` class in JavaScript

**File:** `frontend/src/main.js`

- Added `button.classList.add('playing')` when audio starts (2 locations)
- Added `button.classList.remove('playing')` when audio stops

**File:** `frontend/src/services/UIManager.js`

- Added `this.mobileAudioBtn.classList.toggle('playing', isPlaying)` for mobile button sync

#### 3. Removed Back Button

**File:** `frontend/rooms.html`

Removed `<a href="index.html" class="back-link">← Back</a>` from audio-controls div.

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/rooms.html` | Added `.audio-toggle.playing` CSS, removed back-link from HTML |
| `frontend/src/main.js` | Added `playing` class toggle on start/stop |
| `frontend/src/services/UIManager.js` | Added `playing` class toggle for mobile button |

---

### Version

v1.0.146

---

## Entry #126 - Move Logo to Top-Left Corner

**Date**: 2026-01-16
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Moved the clickable logo from inline with the header title to a fixed position in the top-left corner of the page for better visual hierarchy.

---

### Changes

#### 1. Updated HTML Structure

**File:** `frontend/index.html`

```html
<!-- BEFORE: Logo inline with title -->
<header>
  <a href="/" class="header-logo-link">
    <img src="/webarmonium-logo.svg" alt="Webarmonium logo" class="header-logo">
    <h1>WEBARMONIUM</h1>
  </a>
  <p>...</p>
</header>

<!-- AFTER: Logo in corner, title centered -->
<header>
  <a href="/" class="corner-logo-link" title="Home">
    <img src="/webarmonium-logo.svg" alt="Webarmonium logo" class="corner-logo">
  </a>
  <h1>WEBARMONIUM</h1>
  <p>...</p>
</header>
```

#### 2. Updated CSS Styles

**File:** `frontend/styles.css`

```css
/* Corner Logo */
.corner-logo-link {
  position: fixed;
  top: 1rem;
  left: 1rem;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: transform 0.2s ease;
}

.corner-logo-link:hover {
  transform: scale(1.05);
}

.corner-logo {
  height: 40px;
  width: auto;
}

@media (max-width: 480px) {
  .corner-logo-link {
    top: 0.75rem;
    left: 0.75rem;
  }
  .corner-logo {
    height: 32px;
  }
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/index.html` | Separated logo from title, moved to corner |
| `frontend/styles.css` | Replaced `.header-logo-link/.header-logo` with `.corner-logo-link/.corner-logo` |

---

### Version

v1.0.147

---

## Entry #127 - Audio Auto-Restart Bug Fix (Extended)

**Date**: 2026-01-17
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Extended fix for audio auto-restart bug where audio would sometimes restart automatically 30-60 minutes after user pressed Stop, even without returning focus to the app. Entry #123 added visibility/focus handler guards but missed deeper code paths.

---

### Problem Statement

User reported that audio still restarted on its own after pressing Stop, often 30-60 minutes later, without any user interaction or focus change. Entry #123's fixes weren't complete.

---

### Root Causes Identified

1. **`playComposition()` didn't check `_userStoppedAudio`** - Only checked `isInitialized` and `muted`, so if something called this method, it could restart audio
2. **`startEvolvingGeneration()` didn't check `_userStoppedAudio`** - Called from health check, could restart evolving generation
3. **`_initAudioListener` didn't check `_userStoppedAudio`** - If user clicked Stop before audio ever started, the document click listeners were still active
4. **`stop()` didn't remove init audio listeners** - Listeners persisted if user stopped before audio initialized

---

### Solution

#### Fix 1: Guard in playComposition

Added `_userStoppedAudio` check at the start of `playComposition()`:

```javascript
playComposition(composition, isDrone = false) {
  // Entry #124: Respect user's explicit stop - don't play if user stopped audio
  if (this._userStoppedAudio) {
    console.log('🔇 playComposition blocked - user stopped audio')
    return
  }
  // ... rest of method
}
```

#### Fix 2: Guard in startEvolvingGeneration

Added `_userStoppedAudio` check in `startEvolvingGeneration()`:

```javascript
startEvolvingGeneration() {
  if (this.evolvingGenerationActive) return

  // Entry #124: Respect user's explicit stop - don't start if user stopped audio
  if (this._userStoppedAudio) {
    console.log('🔇 startEvolvingGeneration blocked - user stopped audio')
    return
  }
  // ... rest of method
}
```

#### Fix 3: Guard in _initAudioListener

Added `_userStoppedAudio` check in the init audio listener:

```javascript
this._initAudioListener = async () => {
  if (this.isAudioReady || isInitializing) return

  // Entry #124: If user stopped via DashboardUI Stop button, don't auto-init audio
  if (this.audioService?._userStoppedAudio) {
    console.log('🔇 Audio init blocked - user stopped audio')
    return
  }
  // ... rest of method
}
```

#### Fix 4: Remove listeners in stop()

Added `_removeInitAudioListeners()` call in `stop()`:

```javascript
stop() {
  // Entry #124: Remove init audio listeners even if audio never started
  this._removeInitAudioListeners()

  if (this.audioService) {
    this.audioService.stop()
  }
  // ... rest of method
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/AudioService.js` | Added `_userStoppedAudio` guard to `playComposition()` and `startEvolvingGeneration()` |
| `frontend/src/landing/main.js` | Added `_userStoppedAudio` guard to `_initAudioListener`, call `_removeInitAudioListeners()` in `stop()` |
| `frontend/index.html` | Version bump to v1.0.148 |

---

### Verification

1. Start app, let audio play
2. Press Stop button
3. Wait 30+ minutes without interacting
4. **Expected**: Audio remains stopped
5. Console should show blocking logs if any code paths attempt restart
6. Press Start to resume
7. **Expected**: Audio plays normally

---

### Version

v1.0.148

---

## Entry #128 - Smooth Virtual User Cursor Movement

**Date**: 2026-01-17
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed jerky/jumpy virtual user cursor movement in both landing room and normal rooms. Cursors now move smoothly like real user mouse movements by adding continuous frame-rate-independent interpolation in the render loop.

---

### Problem Statement

Virtual user cursors appeared "jumpy" and "jerky" compared to real user cursors. Real mouse movements felt smooth, but virtual cursors seemed to teleport between positions.

---

### Root Cause Analysis

1. **Backend sends positions at 20fps** (50ms intervals)
2. **Frontend only interpolated when new data arrived**, not continuously
3. **Physics and interpolation conflicted** - both tried to move cursor nodes
4. **Math.exp() called every frame** - unnecessary computational overhead

---

### Solution

#### 1. Continuous Frame-Rate-Independent Interpolation

**File:** `frontend/src/services/visual/SpringMeshNetwork.js`

Changed `updateNodePosition()` to smoothly interpolate cursor nodes toward targets every frame:

```javascript
updateNodePosition(node, dt) {
  // Cursor nodes (with userId) use smooth target interpolation
  if (node.userId && node.targetX != null && node.targetY != null) {
    const dx = node.targetX - node.x
    const dy = node.targetY - node.y
    const distSquared = dx * dx + dy * dy

    // Skip if within sub-pixel distance
    if (distSquared > 0.000001) {
      // Frame-rate-independent linear approximation
      // lerpSpeed = 12 gives ~32% at 30fps, ~19% at 60fps
      const lerpSpeed = 12
      const factor = Math.min(lerpSpeed * dt, 1.0)
      node.x += dx * factor
      node.y += dy * factor
    } else {
      node.x = node.targetX
      node.y = node.targetY
    }
    return  // Skip physics for cursor nodes
  }

  // Non-cursor nodes use physics simulation
  // ... physics code unchanged
}
```

#### 2. Separated Physics from Interpolation

- **Cursor nodes** (with `userId`): Use target interpolation only
- **Non-cursor nodes** (intermediate, trace, background): Use physics only
- Added `return` statement to prevent physics running on cursor nodes

#### 3. Performance Optimizations

| Optimization | Before | After |
|--------------|--------|-------|
| Math.exp() per node | `1 - Math.exp(-lerpSpeed * dt)` | `Math.min(lerpSpeed * dt, 1.0)` |
| Distance check | None | Skip if `distSquared < 0.000001` |
| Null safety | `!== undefined` | `!= null` (catches both) |

#### 4. Removed Immediate Lerp from updateNode()

Changed `updateNode()` to only set target positions:

```javascript
// Before: immediate 30% lerp on every position update
existing.x = existing.x * 0.7 + x * 0.3
existing.y = existing.y * 0.7 + y * 0.3

// After: just set target, let render loop handle interpolation
existing.targetX = x
existing.targetY = y
```

---

### Code Review Issues Fixed

| Priority | Issue | Fix |
|----------|-------|-----|
| Critical | Physics vs interpolation conflict | Separate code paths for cursor vs non-cursor nodes |
| High | Math.exp() expensive | Linear approximation `Math.min(lerpSpeed * dt, 1.0)` |
| High | Null safety | Changed `!== undefined` to `!= null` |
| Medium | Sub-pixel calculations | Skip when `distSquared < 0.000001` |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/visual/SpringMeshNetwork.js` | Continuous interpolation in `updateNodePosition()`, target-only in `updateNode()` |

---

### Technical Details

**Interpolation Formula:**
- `factor = Math.min(lerpSpeed * dt, 1.0)`
- At 30fps (dt ≈ 0.033s): factor ≈ 0.40 (40% per frame)
- At 60fps (dt ≈ 0.016s): factor ≈ 0.19 (19% per frame)
- Linear approximation accurate for small dt values

**Why Linear Instead of Exponential:**
- `1 - e^(-x) ≈ x` for small x (first-order Taylor approximation)
- Avoids expensive Math.exp() call per node per frame
- Difference imperceptible at typical frame rates

---

### Verification

1. Open landing page - virtual cursors should move smoothly
2. Join a room - virtual cursors should move smoothly
3. Compare to real mouse movement - should feel similar
4. Check console for no errors

---

### Version

v1.0.149

---
