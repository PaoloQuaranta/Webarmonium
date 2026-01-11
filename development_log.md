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
