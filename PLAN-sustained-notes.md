# Sustained Note on Click-and-Hold Implementation Plan

## Overview

Add sustained note functionality where single-tap/click gestures maintain an open note gate for as long as the user keeps the mouse button pressed or finger on the spot. When the user then moves (>15px), the system transitions to the existing drag phrase behavior with a brief overlap period.

## User Requirements

- **Click and hold stationary**: Single sustained note at original pitch
- **Click, hold, then move >15px**: Sustained note continues briefly, then existing drag phrase behavior takes over (overlap transition)
- **Quick tap (<300ms)**: Existing tap behavior (unchanged)
- **Multi-user sync**: Yes - other users hear sustained holds in real-time
- **Visual feedback**: Yes - visual indicator for active holds
- **Hold threshold**: 300ms

## Key Design Decisions

### 1. Gesture State Machine

```
MOUSE DOWN → potential-tap (t=0ms)
            ↓
            ├─ Hold >300ms && Movement ≤15px → sustained-hold
            │                                   ├─ Note gate OPENS
            │                                   └─ Visual indicator appears
            │
            ├─ Movement >15px (before 300ms) → drag (existing behavior)
            │
            └─ Movement >15px (after 300ms sustained-hold) → transition to drag
                                                              ├─ Sustained note continues 200ms (overlap)
                                                              ├─ Drag phrase starts
                                                              └─ Sustained note releases after overlap
```

**Hold threshold**: 300ms distinguishes quick tap from deliberate hold
**Movement threshold**: 15px (existing, preserves tap/drag discrimination)
**Overlap duration**: 200ms for smooth transition from sustained hold to drag phrase

### 2. Audio Architecture

**Gate-based approach** using Tone.js `triggerAttack()`/`triggerRelease()`:
- **Hold start**: `gestureSynth.triggerAttack(frequency, time, velocity)` - gate opens
- **Hold end**: `gestureSynth.triggerRelease(frequency, time)` - gate closes
- **No pitch gliding**: Note stays at original frequency (no modulation during hold)

**Envelope configuration for sustained notes**:
- Attack: 0.005s (5ms - instant response)
- Decay: 0.01s (10ms - quick to sustain)
- Sustain: 1.0 (full amplitude, no decay)
- Release: 0.05s (50ms - smooth tail, prevents clicks)

**Audio layer**: Use existing `gestureSynth` on local layer (consistent with tap/drag gestures)

### 3. Transition Behavior (Hold → Drag)

When user moves >15px after sustained hold is active:

1. **t=0ms**: Movement threshold exceeded
   - Keep sustained note playing (gate still open)
   - Start drag phrase (existing drag streaming logic)
   - Set transition timer for 200ms

2. **t=0-200ms**: Overlap period
   - Both sustained note AND drag phrase play simultaneously
   - Creates smooth musical transition

3. **t=200ms**: Transition complete
   - Release sustained note (`triggerRelease()`)
   - Continue drag phrase normally
   - Clear sustained hold state

### 4. Visual Feedback

**Active hold indicator**:
- Pulsing circle at hold position
- Color: User's assigned color (from multi-user color pool)
- Size: Oscillates between 20-30px radius (1Hz pulse)
- Opacity: 0.6-0.8 (semi-transparent)
- Rendered on cursor overlay canvas

**Implementation**: Add to DrawingRenderer or create simple hold indicator in main render loop

### 5. Multi-User Synchronization

**WebSocket protocol** - 3 new events:

**Event 1: `hold:start`** (note gate opens)
- Client → Server: `{ gestureId, userId, roomId, position, frequency, velocity, noteId, timestamp }`
- Server → Other clients: `{ type: 'hold:start', userId, noteId, frequency, velocity, position, isRemote: true, timestamp }`
- Acknowledgment: Yes (callback confirms receipt)

**Event 2: `hold:end`** (note gate closes)
- Client → Server: `{ noteId, userId, roomId, duration, finalPosition, timestamp }`
- Server → Other clients: `{ type: 'hold:end', userId, noteId, duration, timestamp }`
- Acknowledgment: Yes

**Event 3: Disconnect cleanup**
- On user disconnect, server broadcasts `hold:end` for all active holds from that user
- Prevents orphaned notes

**Performance**: Fire-and-forget for updates, acknowledgment for start/end (latency <100ms target)

## Implementation Phases

### Phase 1: Frontend Gesture Classification (2-3 hours)

**Goal**: Detect sustained holds and trigger local audio (single-user only)

**Files**:
- [EnhancedGestureCapture.js](frontend/src/services/EnhancedGestureCapture.js)

**Changes**:
1. Add `sustainedHold` state object to constructor:
   ```javascript
   this.sustainedHold = {
     isActive: false,
     startTime: 0,
     holdThreshold: 300,      // ms - distinguishes tap from hold
     activeNoteId: null,
     startPosition: null,
     holdTimer: null,         // setTimeout reference
     transitionTimer: null,   // For hold → drag overlap
     overlapDuration: 200     // ms - overlap when transitioning to drag
   }
   ```

2. Modify `handleGestureStart()`:
   - Start hold detection timer (300ms)
   - Timer callback: if still `potential-tap` → transition to `sustained-hold`, trigger callback

3. Modify `handleGestureMove()`:
   - Priority 1: If `sustainedHold.isActive` and movement >15px → start transition to drag
   - Set transition timer (200ms) to release sustained note
   - Start existing drag streaming logic
   - Priority 2: Normal drag logic (if not in sustained hold)

4. Modify `handleGestureEnd()`:
   - Clear hold timer if active
   - If `sustainedHold.isActive` → trigger release callback
   - Clear transition timer if active
   - Reset sustained hold state

5. Add callbacks:
   ```javascript
   this.onSustainedHoldStart = null  // Called when hold timer fires
   this.onSustainedHoldEnd = null    // Called on mouseup or transition complete
   ```

**Testing checkpoint**:
- [ ] Hold >300ms triggers sustained-hold
- [ ] Quick tap <300ms remains 'tap'
- [ ] Movement >15px before 300ms triggers 'drag'
- [ ] Movement >15px after sustained-hold starts transition with overlap
- [ ] Console logs show state transitions

### Phase 2: Audio Gate Implementation (2 hours)

**Goal**: Gate-based audio for sustained notes

**Files**:
- [AudioService.js](frontend/src/services/AudioService.js)
- [main.js](frontend/src/main.js)

**Changes to AudioService.js**:

1. Add state tracking:
   ```javascript
   this.activeSustainedNotes = new Map() // noteId -> { noteId, frequency, startTime, position, velocity, synth }
   ```

2. Add method `triggerSustainedNoteAttack(frequency, velocity, position)`:
   - Configure envelope for sustained notes
   - Call `gestureSynth.triggerAttack(frequency, Tone.now(), velocity)`
   - Track in `activeSustainedNotes` Map
   - Return `{ noteId, frequency, startTime }`

3. Add method `triggerSustainedNoteRelease(noteId)`:
   - Get note data from Map
   - Call `gestureSynth.triggerRelease(frequency, Tone.now())`
   - Remove from Map
   - Log duration

4. Add cleanup in `stop()` method:
   - Release all active sustained notes before stopping

**Changes to main.js**:

1. Add state tracking:
   ```javascript
   this.activeLocalHold = null  // { noteId, audioNoteId, frequency, startTime, position }
   this.activeRemoteHolds = new Map()  // noteId -> { noteId, audioNoteId, userId, frequency, startTime }
   ```

2. Wire up callback `onSustainedHoldStart`:
   - Calculate frequency from position (reuse existing pitch calculation logic)
   - Call `audioService.triggerSustainedNoteAttack()`
   - Store in `activeLocalHold`

3. Wire up callback `onSustainedHoldEnd`:
   - Call `audioService.triggerSustainedNoteRelease()`
   - Clear `activeLocalHold`

**Testing checkpoint**:
- [ ] Note starts on hold (after 300ms)
- [ ] Note sustains indefinitely until release
- [ ] No audio clicks/pops
- [ ] Transition to drag has 200ms overlap
- [ ] Multiple holds don't cause glitches

### Phase 3: Visual Feedback (1 hour)

**Goal**: Pulsing circle indicator for active holds

**Files**:
- [main.js](frontend/src/main.js) - render loop

**Changes**:

1. In `onSustainedHoldStart` callback:
   - Set `activeLocalHold.visualStartTime = Date.now()`

2. In render loop (after drawing rendering):
   ```javascript
   // Render local sustained hold indicator
   if (this.activeLocalHold) {
     const elapsed = Date.now() - this.activeLocalHold.visualStartTime
     const pulse = Math.sin(elapsed * 0.001 * Math.PI * 2) // 1Hz pulse
     const radius = 20 + pulse * 5 // 15-25px
     const opacity = 0.6 + pulse * 0.1 // 0.5-0.7

     const ctx = this.cursorOverlayCanvas.getContext('2d')
     ctx.save()
     ctx.globalAlpha = opacity
     ctx.strokeStyle = this.socketService.userColor || '#6bcf7f'
     ctx.lineWidth = 3
     ctx.beginPath()
     ctx.arc(
       this.activeLocalHold.position.x * this.canvas.width,
       this.activeLocalHold.position.y * this.canvas.height,
       radius,
       0,
       Math.PI * 2
     )
     ctx.stroke()
     ctx.restore()
   }

   // Render remote sustained hold indicators
   for (const [noteId, hold] of this.activeRemoteHolds.entries()) {
     // Similar rendering with hold.position and hold.userId color
   }
   ```

**Testing checkpoint**:
- [ ] Pulsing circle appears on hold
- [ ] Circle uses user's color
- [ ] Circle disappears on release
- [ ] Remote holds show circles for other users

### Phase 4: WebSocket Protocol (3 hours)

**Goal**: Multi-user synchronization

**Backend files**:
- [socketHandlers.js](backend/src/api/socketHandlers.js)
- [Room.js](backend/src/models/Room.js)

**Backend changes**:

1. Add to Room.js constructor:
   ```javascript
   this.activeHolds = new Map() // noteId -> { userId, startTime, noteId, frequency, position }
   ```

2. In socketHandlers.js, register handlers in `initializeSocket()`:
   ```javascript
   this.registerHoldStartHandler(socket)
   this.registerHoldEndHandler(socket)
   ```

3. Add `registerHoldStartHandler()`:
   - Validate session and data
   - Track in `room.activeHolds`
   - Broadcast to room: `socket.to(roomId).emit('hold:start', ...)`
   - Send acknowledgment callback
   - Log latency (warn if >100ms)

4. Add `registerHoldEndHandler()`:
   - Validate session
   - Remove from `room.activeHolds`
   - Broadcast to room: `socket.to(roomId).emit('hold:end', ...)`
   - Send acknowledgment

5. Add disconnect cleanup in `handleDisconnection()`:
   - Iterate `room.activeHolds` for disconnected user
   - Broadcast `hold:end` with `reason: 'disconnect'`
   - Clean up Map

**Frontend changes (main.js)**:

1. In `onSustainedHoldStart` callback:
   - Emit `hold:start` to server with callback

2. In `onSustainedHoldEnd` callback:
   - Emit `hold:end` to server with callback

3. Add socket listener for `'hold:start'` (remote holds):
   - Call `audioService.triggerSustainedNoteAttack()` with 0.7x velocity (quieter)
   - Track in `activeRemoteHolds` Map

4. Add socket listener for `'hold:end'` (remote holds):
   - Call `audioService.triggerSustainedNoteRelease()`
   - Remove from `activeRemoteHolds`

**Testing checkpoint**:
- [ ] Two users see/hear each other's holds
- [ ] Visual indicators sync across users
- [ ] Disconnecting user's holds cleaned up
- [ ] No WebSocket errors
- [ ] Latency <100ms for hold:start/end

### Phase 5: Edge Cases & Polish (2 hours)

**Edge cases**:

1. **Browser tab backgrounding**:
   - Add `visibilitychange` listener
   - If tab hidden and hold active → force-end hold

2. **Audio context suspended** (mobile):
   - Check `Tone.context.state` before `triggerAttack()`
   - Return null and log warning if suspended

3. **Multiple rapid holds**:
   - Ensure proper cleanup in `handleGestureEnd()`
   - Test: rapid tap-hold-release cycles

4. **Hold → Drag transition timing**:
   - Verify 200ms overlap feels smooth
   - Adjust if needed (150-300ms range)

5. **Memory leaks**:
   - Check Map cleanup with Chrome DevTools
   - Ensure timers cleared (holdTimer, transitionTimer)

**Testing checkpoint**:
- [ ] All edge cases handled gracefully
- [ ] No orphaned notes
- [ ] No memory leaks (10 min session test)
- [ ] Smooth transitions

### Phase 6: Performance Validation (1 hour)

**Metrics**:
- Gesture-to-sound latency: <100ms (mousedown → audio output)
- WebSocket roundtrip: <100ms (emit → callback)
- Rendering: 60fps during holds
- Memory: No leaks over extended session

**Tools**:
- `performance.now()` for latency
- Chrome DevTools Performance tab
- Chrome DevTools Memory tab

**Testing checkpoint**:
- [ ] All performance requirements met
- [ ] Constitutional compliance verified

## Critical Files

1. **[EnhancedGestureCapture.js](frontend/src/services/EnhancedGestureCapture.js)** - Gesture state machine, hold detection
2. **[AudioService.js](frontend/src/services/AudioService.js)** - Gate-based audio methods
3. **[main.js](frontend/src/main.js)** - Callback wiring, WebSocket, visual feedback
4. **[socketHandlers.js](backend/src/api/socketHandlers.js)** - WebSocket handlers
5. **[Room.js](backend/src/models/Room.js)** - State tracking

## Summary

**Total effort**: ~10-12 hours
- Phase 1: 2-3 hours (gesture classification)
- Phase 2: 2 hours (audio gate)
- Phase 3: 1 hour (visual feedback)
- Phase 4: 3 hours (WebSocket)
- Phase 5: 2 hours (edge cases)
- Phase 6: 1 hour (validation)

**Key features**:
- 300ms hold threshold
- Gate-based audio (clean attack/release)
- 200ms overlap for hold → drag transition
- Pulsing visual indicator
- Multi-user synchronization
- <100ms latency target
- No pitch gliding (note stays at original frequency)

**Preserves existing behavior**:
- Quick taps (<300ms) unchanged
- Drag phrases (movement >15px) unchanged
- Movement threshold (15px) unchanged
