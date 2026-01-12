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

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/visual/PrecomputedAttractorSystem.js` | Changed from coordinate rotation to canvas `translate()`+`rotate()`, removed precomputed cos/sin, updated comments |

---

### Version

Updated to v1.0.92

