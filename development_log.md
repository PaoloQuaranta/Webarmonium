# Webarmonium Development Log

> **Note:** Older entries (1-56)have been moved to [log_archive.md](log_archive.md)

---


## Entry #57 - Slot Lookup Race Condition Fix

**Date**: 2026-01-09
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed console warnings "No backend slot for [userId], falling back to hash" that appeared during audio playback. The issue was a race condition where audio events used the user's ID before the backend-assigned slot was fully synchronized.

---

### Problem Statement

Console showed repeated warnings:
```
⚠️ No backend slot for b5a25d20, falling back to hash
```

Audio still worked (fell back to hash-based slot), but the warnings were noisy and indicated a timing issue.

---

### Root Cause Analysis

Three issues combined:

1. **ID mismatch in lookup**: `getSlotForUser()` only checked `currentUserId`, but audio events could use `socket.id` before `currentUserId` was set

2. **Missing slot in `handleRoomJoined`**: The `room-joined` socket event saved `currentUserId` but NOT `currentSlot`

3. **Backend not sending slot**: The `room-joined` event emission didn't include `assignedSlot`

---

### Solution

#### 1. Frontend: Extended ID matching in getSlotForUser()

**File:** `frontend/src/services/SocketService.js`

```javascript
// Check both backend userId AND socket.id
if (userId === this.currentUserId || userId === this.socket?.id) {
  return this.currentSlot
}
```

#### 2. Frontend: Save slot in handleRoomJoined()

**File:** `frontend/src/services/SocketService.js`

```javascript
handleRoomJoined(data) {
  // ... save userId ...

  // Also save slot if provided
  if (data.assignedSlot !== undefined && data.assignedSlot !== null) {
    this.currentSlot = data.assignedSlot
    if (data.userId) {
      this.userSlots.set(data.userId, data.assignedSlot)
    }
  }
}
```

#### 3. Frontend: Add self to userSlots in joinRoom()

**File:** `frontend/src/services/SocketService.js`

```javascript
// After setting currentSlot, add self to map
if (this.currentUserId && this.currentSlot !== null) {
  this.userSlots.set(this.currentUserId, this.currentSlot)
}
```

#### 4. Backend: Include assignedSlot in room-joined event

**File:** `backend/src/api/handlers/AuthHandler.js`

```javascript
socket.emit('room-joined', {
  roomId: actualRoomId,
  userId: socket.userId,
  assignedSlot: result.assignedSlot,  // ADDED
  users: result.users,
  room: result.room,
  timestamp: Date.now()
})
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/SocketService.js` | Extended `getSlotForUser()` to match `socket.id`, added slot saving in `handleRoomJoined()`, add self to `userSlots` in `joinRoom()` |
| `backend/src/api/handlers/AuthHandler.js` | Added `assignedSlot` to `room-joined` event |

---

### Version

Updated to v1.0.30

---

## Entry #58 - Windows Audio Dropout Fix (All Browsers)

**Date**: 2026-01-10
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed audio dropouts and crackles on Windows that affected both Chrome and Edge browsers. The root cause was that Edge was explicitly excluded from audio optimizations, and Windows browsers had insufficient buffer settings compared to Android.

**User Report**: "abbiamo ancora audio dropout e crackles in chrome su windows... ho testato anche con edge su win e abbiamo lo stesso problema audio. il problema non esiste su ipad e iphone"

---

### Root Cause Analysis

#### Issue 1: Edge Browser Explicitly Excluded

In `PlatformDetection.isWindowsChrome()`:
```javascript
const isChrome = ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')
```

Edge was explicitly excluded from Windows Chrome detection, so Edge users got `latencyHint: 'balanced'` (fallback) instead of `latencyHint: 'playback'`.

#### Issue 2: Windows lookAhead Lower Than Android

| Platform | lookAhead |
|----------|-----------|
| Android Chrome | 200ms |
| Windows Chrome | 150ms |

Windows has notoriously problematic audio drivers (WASAPI), yet got a **smaller** buffer than Android.

#### Issue 3: Sample Rate Not Reduced for Windows

Only Android Chrome got sample rate reduction (44100Hz). Windows ran at the default 48000Hz, meaning more CPU processing work.

---

### Solution

#### 1. New `isWindowsBrowser()` Method

Detects ANY Chromium-based browser on Windows (Chrome, Edge, Opera, Brave):

```javascript
static isWindowsBrowser() {
  const ua = navigator.userAgent || ''
  const isWindows = ua.includes('Windows') || (navigator.platform?.includes('Win') ?? false)
  const isChromiumBased = ua.includes('Chrome') || ua.includes('Edg')
  return isWindows && isChromiumBased
}
```

#### 2. Updated `getAudioLatencyHint()`

Changed from `isWindowsChrome()` to `isWindowsBrowser()` so Edge and other browsers get `'playback'` mode.

#### 3. Increased Windows lookAhead to Match Android

Changed from 150ms to 200ms:
```javascript
if (PlatformDetection.isWindowsBrowser()) {
  return 0.2 // Entry #58: 200ms (was 150ms, now matches Android)
}
```

#### 4. Added Sample Rate Reduction for Windows

```javascript
const isWindowsBrowser = typeof PlatformDetection !== 'undefined' && PlatformDetection.isWindowsBrowser()

if (isAndroidChrome || isWindowsBrowser) {
  contextOptions.sampleRate = 44100
}
```

---

### Configuration Comparison

| Setting | Windows Chrome (Before) | Windows Edge (Before) | All Windows (After) |
|---------|------------------------|----------------------|---------------------|
| latencyHint | 'playback' | 'balanced' (fallback) | 'playback' |
| lookAhead | 150ms | 100ms (fallback) | 200ms |
| sampleRate | 48000 (default) | 48000 (default) | 44100 |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/utils/PlatformDetection.js` | Added `isWindowsBrowser()` method, updated `getAudioLatencyHint()` and `getAudioLookAhead()` to use it, added `_windowsBrowserCache` |
| `frontend/src/services/AudioService.js` | Updated `_configureAudioContext()` to apply 44100Hz sample rate for Windows browsers |

---

### Verification

Open browser console and check for:
```
🔊 AudioContext configured: latencyHint=playback, sampleRate=44100, isWindowsBrowser=true, isAndroidChrome=false
🔊 Tone.context.lookAhead set to 0.2s
```

---

## Entry #59 - Chrome/Opera Windows Audio Optimizations

**Date**: 2026-01-10
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Additional audio optimizations specifically for Chrome and Opera on Windows, which showed worse audio dropout behavior than Edge after Entry #58 fixes. Based on web research, increased Tone.js scheduler interval and reduced filter update rate.

**User Report**: "edge va molto meglio, opera solo qualche click, chrome ancora audio dropout e crackles"

---

### Research Findings

Web search revealed Chrome on Windows is a known problematic configuration:

1. **Chromium Bug #161307** (2012+): Chrome has audio issues on Windows since Chrome 23
2. **Tone.js Performance Wiki**: Recommends adjusting `updateInterval` and scheduling in advance
3. **Web Audio Performance Notes**: "context.updateInterval + context.lookAhead gives total latency"
4. **Chrome DevTools WebAudio**: Monitor "render capacity" - near 100% causes glitches

---

### Solution

Added Chrome/Opera-specific optimizations that don't affect Edge (which works well):

#### 1. New Detection Method
```javascript
static isWindowsChromeOrOpera() {
  const ua = navigator.userAgent
  const isWindows = ua.includes('Windows')
  const isChrome = ua.includes('Chrome') && !ua.includes('Edg')
  const isOpera = ua.includes('OPR') || ua.includes('Opera')
  return isWindows && (isChrome || isOpera)
}
```

#### 2. Increased Tone.context.updateInterval
- Default: 25ms (0.025s)
- Chrome/Opera Windows: 50ms (0.05s)
- Reduces scheduler CPU overhead

#### 3. Reduced Filter Update Rate
- Default: 30Hz
- Chrome/Opera Windows: 20Hz
- Reduces main thread load

---

### Configuration Summary

| Browser | latencyHint | lookAhead | sampleRate | updateInterval | filterRate |
|---------|-------------|-----------|------------|----------------|------------|
| Chrome Windows | playback | 200ms | 44100 | **50ms** | **20Hz** |
| Opera Windows | playback | 200ms | 44100 | **50ms** | **20Hz** |
| Edge Windows | playback | 200ms | 44100 | 25ms | 30Hz |
| iOS/Mac | interactive | 100ms | default | 25ms | 30Hz |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/utils/PlatformDetection.js` | Added `isWindowsChromeOrOpera()`, `getAudioUpdateInterval()`, `getFilterUpdateRate()` |
| `frontend/src/services/AudioService.js` | Set `Tone.context.updateInterval`, use platform-specific filter rate |

---

### Verification

Open browser console and check for:
```
🔊 Tone.context.updateInterval set to 0.05s
```

Filter update rate is logged during audio system creation.

---

## Entry #60 - Audio Modulation Simplification (Universal)

**Date**: 2026-01-10
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

After Entry #58 and #59 optimizations still left Chrome on Windows with audio issues, performed deep analysis of all audio modulations. Found that rapid filter updates (20-30Hz with 50ms ramps) were causing unnecessary audio thread load without audible benefit. Simplified audio modulations universally for all platforms.

**User Insight**: "mi sembra che non servisse a niente e fosse inaudibile" - User correctly identified that rapid modulations weren't perceptible.

---

### Root Cause Analysis

Detailed audit of AudioService.js revealed ~10 automation events every 33-50ms during hover:

| Filter | Parameters | Ramp Time |
|--------|------------|-----------|
| gestureFilter | frequency, Q | 50ms |
| ambientFilters.chords | frequency, Q | 50ms |
| ambientFilters.pad | frequency, Q | 50ms |
| ambientFilters.bass | frequency, Q | 50ms |

**Key Insight**: Ambient background filters don't need rapid updates. The 20-30Hz update rate was creating CPU load without audible musical benefit. Slower, smoother transitions are actually more musical.

---

### Solution: Universal Simplification

Instead of adding more platform-specific workarounds, simplified the audio architecture for ALL platforms:

#### 1. Removed Downbeat Emphasis
```javascript
// BEFORE: 5% gain boost for 50ms every beat
addDownbeatEmphasis() {
  this.masterVolume.gain.rampTo(currentGain * 1.05, 0.05)
  setTimeout(() => {
    this.masterVolume.gain.rampTo(currentGain, 0.05)
  }, 50)
}

// AFTER: Removed entirely - effect was imperceptible
addDownbeatEmphasis() {
  // Entry #60: Disabled - was imperceptible, just wasted CPU
}
```

#### 2. Separate Slower Throttle for Ambient Filters
```javascript
// BEFORE: Shared 50ms throttle with gesture filter
this.filterUpdateInterval = 50 // 20Hz shared

// AFTER: Separate 200ms throttle for ambient filters
this.ambientFilterUpdateInterval = 200 // 5Hz - slow is more musical
```

#### 3. Longer Ramp Times for Ambient Filters
```javascript
// BEFORE: 50-100ms ramps (too short, caused glitches)
Tone.context.currentTime + 0.05

// AFTER: 300ms ramps (smooth, musical transitions)
const rampTime = 0.3
Tone.context.currentTime + rampTime
```

#### 4. Changed Q Updates from Immediate to Ramp
```javascript
// BEFORE: Instant Q changes (jarring)
filter.Q.setValueAtTime(filterQ * 2, Tone.context.currentTime)

// AFTER: Smooth Q ramps
filter.Q.linearRampToValueAtTime(filterQ * 2, Tone.context.currentTime + rampTime)
```

---

### Result

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Automation events during hover | ~10 every 33-50ms | ~6 every 200ms | **90%** |
| Downbeat emphasis calls | Every beat | None | **100%** |
| Ambient filter update rate | 20-30Hz | 5Hz | **75-83%** |
| Filter ramp time | 50ms | 300ms | +500% (smoother) |

---

### Dead Code Removed

Removed `addDownbeatEmphasis()` function entirely and cleaned up `onMusicalBeat()`:

```javascript
// BEFORE: 35 lines of code
// AFTER: 7 lines (net deletion)

// 2 files changed, 7 insertions(+), 35 deletions(-)
```

---

### Cache Version Fix

iPad showed error: `PlatformDetection.isWindowsChromePure is not a function`

**Root Cause**: Old cached PlatformDetection.js (v=2) didn't have new methods.

**Fix**: Bumped cache version from `?v=2` to `?v=3` in:
- `frontend/index.html`
- `frontend/rooms.html`

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/AudioService.js` | Removed addDownbeatEmphasis, added ambientFilterUpdateInterval, increased ramp times |
| `frontend/index.html` | Cache version v=3, version tag v1.0.34 |
| `frontend/rooms.html` | Cache version v=3 |

---

### Commits

1. `9d1a698a` - perf: Simplify audio modulations for Chrome/Opera (v1.0.33)
2. `b411add5` - refactor: Remove dead audio modulation code (v1.0.34)
3. `43af5052` - fix: Bump PlatformDetection.js cache version to v=3

---

### User Feedback

"finalmente! va molto meglio anche chrome" - Chrome audio working well after simplification.

---

## Entry #61 - Real User Gestures Not Triggering Background Composition

**Date**: 2026-01-10
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed a regression where real user gestures were no longer triggering background composition. The background music only started after virtual users had played. The original design was that gestures from both real and virtual users (especially early gestures) should influence background composition (BPM, style, etc.).

---

### Problem Statement

User reported: "i gesti di real users non stanno più innescando la composizione del background. il background ora inizia solo dopo che hanno suonato virtual user."

The background composition system requires `gestureCount >= 2` to transition from drone to full composition. This count was only being incremented by virtual users, not real users.

---

### Root Cause Analysis

The `registerGestureCompleteHandler` in `GestureHandler.js` **never called `backgroundCompositionService.addMaterial()`**.

**Code Flow Comparison:**

| User Type | Handler | Calls addMaterial() |
|-----------|---------|---------------------|
| Virtual Users | VirtualUserService.js:684,795 | ✅ Yes |
| Real Users | GestureHandler.registerGestureCompleteHandler | ❌ No (BUG) |

The `gesture-complete` handler:
1. Broadcast `musical:event` to other users ✅
2. Updated room activity ✅
3. **Never called `addMaterial()`** ❌

Without `addMaterial()`, `gestureCount` never incremented and the transition from drone to full composition never occurred.

---

### Solution

Added `addMaterial()` call to `registerGestureCompleteHandler`, building a `musicalPhrase` from the gesture data:

```javascript
// ADD MATERIAL TO BACKGROUND COMPOSITION SERVICE
if (socket.services.backgroundCompositionService) {
  try {
    let musicalPhrase

    if (gesture.streamedNotes && gesture.streamedNotes.length > 0) {
      // Build phrase from streamed notes (drag gestures)
      musicalPhrase = {
        notes: gesture.streamedNotes.map(note => ({
          pitch: note.frequency,
          duration: toneDurationToMs(note.duration),
          velocity: note.velocity || 0.5,
          articulation: note.articulation || 'staccato',
          timestamp: note.timestamp
        })),
        duration: gesture.streamedNotes.reduce((sum, note) =>
          sum + toneDurationToMs(note.duration), 0)
      }
    } else {
      // Tap gesture - minimal phrase
      musicalPhrase = {
        notes: [{ pitch: 440, duration: 250, velocity: gesture.intensity || 0.5 }],
        duration: 250
      }
    }

    socket.services.backgroundCompositionService.addMaterial(
      socket.roomId,
      gestureData,
      musicalPhrase
    )
  } catch (error) {
    // Silent fail - don't break gesture handling
  }
}
```

---

### Files Modified

| File | Changes |
|------|---------|
| `backend/src/api/handlers/GestureHandler.js` | Added `addMaterial()` call in `registerGestureCompleteHandler` (lines 518-580) |
| `frontend/index.html` | Version tag updated to v1.0.35 |

---

### Verification

1. Join a room in the browser
2. Make 2+ gestures (taps or drags)
3. Background composition should start (not just the drone)
4. In backend console, look for `🎼 Transitioning from drone to full composition` log

---

### Commit

`b85ba611` - fix: Real user gestures now trigger background composition (v1.0.35)

---

## Entry #62 - Cursor Race Condition Fix

**Date**: 2026-01-10
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Fixed a bug where remote user cursors would remain on the canvas after users left the room. The issue also affected virtual users—their cursors sometimes persisted after deactivation.

**User Report**: "i cursori sul canvas di normal room non si aggiornano correttamente. spesso quando un user abbandona la room il cursore resta sulla scena."

---

### Root Cause Analysis

**Race Condition**: The `cursor-position` events could arrive AFTER the `user-left` event, causing the cursor to be recreated immediately after removal.

```
Timeline:
1. User A leaves room
2. Backend emits 'user-left' → Frontend removes cursor ✓
3. Late 'cursor-position' arrives (network delay) → Frontend recreates cursor ✗
4. Cursor orphaned on screen
```

Same issue with virtual users:
```
1. 'virtual-users-deactivated' → Frontend removes cursors ✓
2. Late 'virtual-cursors' arrives → Frontend recreates cursors ✗
```

---

### Solution

Added tracking mechanisms to prevent late events from recreating cursors:

#### 1. Track Left Users (constructor)
```javascript
this.leftUsers = new Set()        // UserIds who have left
this.virtualUsersActive = false   // Virtual user state
```

#### 2. Add to Set Before Removing Cursor
```javascript
// In user-left handler
if (data.userId) {
  this.leftUsers.add(data.userId)  // Mark as left FIRST
}
this.cursorManager.removeCursor(data.userId)  // Then remove
```

#### 3. Ignore Late cursor-position Events
```javascript
this.socketService.on('cursor-position', (data) => {
  if (this.leftUsers.has(data.userId)) {
    return  // Ignore events for users who left
  }
  // ... update cursor
})
```

#### 4. Track Virtual User State
```javascript
// In virtual-users-activated
this.virtualUsersActive = true

// In virtual-users-deactivated
this.virtualUsersActive = false  // Set BEFORE removing

// In virtual-cursors handler
if (!this.virtualUsersActive) return  // Ignore late updates
```

#### 5. Memory Cleanup
```javascript
// In room-joined handler
this.leftUsers.clear()           // Clear old room's users
this.virtualUsersActive = false  // Reset state
```

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/main.js` | Added `leftUsers` Set and `virtualUsersActive` flag, updated event handlers to check state before updating cursors |

---

### Version

Updated to v1.0.36

---

## Entry #63 - Virtual Cursor Race Condition Fix (Part 2)

**Date**: 2026-01-10
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Entry #62 fix was insufficient - virtual cursors still persisted after deactivation. Root cause was that the `virtualUsersActive` flag in main.js didn't prevent CursorManager from accepting late events. Added a blocking mechanism directly in CursorManager.

---

### Root Cause Analysis

The previous fix only blocked at the event handler level. But:
1. Late `virtual-cursors` events could still update cursors during fade-out
2. The fade-out animation (500ms) kept cursors in the Map, allowing updates
3. Join response could add virtual cursors without checking state

---

### Solution

Added a `virtualCursorsBlocked` flag directly in CursorManager:

#### 1. New Flag in Constructor
```javascript
this.virtualCursorsBlocked = false
```

#### 2. Block Operations in addVirtualCursor/updateVirtualCursor
```javascript
addVirtualCursor (userId, color, fadeIn = true) {
  if (this.virtualCursorsBlocked) return
  // ...
}

updateVirtualCursor (userId, x, y) {
  if (this.virtualCursorsBlocked) return
  // ...
}
```

#### 3. Immediate Removal (No Fade) in removeAllVirtualCursors
```javascript
removeAllVirtualCursors (fadeOut = true) {
  this.virtualCursorsBlocked = true  // Block future operations

  // Remove immediately (no fade) to prevent race conditions
  for (const userId of this.virtualCursors) {
    this.cursors.delete(userId)
    this.fadeAnimations.delete(userId)
  }
  this.virtualCursors.clear()
}
```

#### 4. New enableVirtualCursors() Method
```javascript
enableVirtualCursors () {
  this.virtualCursorsBlocked = false
}
```

#### 5. Call enableVirtualCursors Before Adding
In `virtual-users-activated` and join response handlers:
```javascript
this.cursorManager.enableVirtualCursors()
// Then add cursors...
```

---

### Key Changes

| Change | Reason |
|--------|--------|
| Removed fade-out animation | Eliminates 500ms vulnerability window |
| Block flag in CursorManager | Prevents any late updates regardless of source |
| enableVirtualCursors() method | Explicit unblock before adding new cursors |
| Reset flag in clearAll() | Ensures clean state on room change |

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/services/CursorManager.js` | Added `virtualCursorsBlocked` flag, modified `addVirtualCursor`, `updateVirtualCursor`, `removeAllVirtualCursors`, added `enableVirtualCursors()` |
| `frontend/src/main.js` | Call `enableVirtualCursors()` in `virtual-users-activated` and join response |

---

### Version

Updated to v1.0.37

---

## Entry #64 - Virtual Cursor Ghost Fix (Part 3)

**Date**: 2026-01-10
**Author**: Claude Code (AI Assistant)
**Status**: COMPLETED

### Summary

Entries #62 and #63 fixed CursorManager but virtual cursors still persisted. Root cause: the `visualService` (GenerativeVisualService + SpringMeshNetwork) maintains its own node tracking **separate** from CursorManager. The deactivation code called a non-existent method.

---

### Root Cause

In `virtual-users-deactivated` handler:
```javascript
this.visualService.removeVirtualUser?.(userId)  // ← Method doesn't exist!
```

The `?.` optional chaining silently failed. The correct method is `removeUser()`.

---

### Solution

Changed:
```javascript
// BEFORE (broken)
this.visualService.removeVirtualUser?.(userId)

// AFTER (fixed)
this.visualService.removeUser(userId)
```

---

### Architecture Note

Two separate cursor systems exist:
1. **CursorManager** - Renders cursor circles on overlay canvas
2. **GenerativeVisualService.springMesh** - Renders network nodes with edges

Both must be updated when users join/leave.

---

### Files Modified

| File | Changes |
|------|---------|
| `frontend/src/main.js` | Fixed `removeVirtualUser` → `removeUser` in deactivation handler |

---

### Version

Updated to v1.0.38

---
