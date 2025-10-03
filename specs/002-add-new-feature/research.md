# Phase 0: Research & Technical Decisions

**Feature**: Multi-User Canvas Interaction
**Date**: 2025-10-01

## Research Areas

### 1. Real-Time Drawing Synchronization Strategies

**Decision**: Event-driven broadcasting with last-write-wins conflict resolution

**Rationale**:
- Socket.IO already in place for real-time communication
- Drawing strokes are independent events (pen strokes don't modify existing objects)
- Last-write-wins is sufficient for drawing operations (no complex CRDT needed)
- Event-driven approach minimizes latency (<1000ms requirement achievable)
- Simple conflict model: overlapping strokes coexist, no merging needed

**Alternatives Considered**:
- **Operational Transformation (OT)**: Overly complex for independent drawing strokes, adds latency
- **CRDT (Conflict-free Replicated Data Types)**: Unnecessary overhead for append-only drawing events
- **Full canvas state synchronization**: Too bandwidth-intensive, fails to meet latency requirements

**Implementation Approach**:
- Broadcast drawing stroke events to all room members via Socket.IO
- Each stroke is immutable once created (append-only model)
- Client-side prediction for immediate local feedback
- Server acts as authoritative broadcaster with timestamp ordering

### 2. Canvas Drawing Data Structure

**Decision**: Stroke-based model with point arrays

**Rationale**:
- Matches HTML5 Canvas drawing paradigm (moveTo, lineTo sequences)
- Memory efficient: ~100 bytes per stroke (vs. pixel-level tracking)
- Supports smooth rendering with requestAnimationFrame
- Easy serialization for WebSocket transmission
- Scales to ~10k strokes per room within memory constraints

**Alternatives Considered**:
- **Pixel-based tracking**: Excessive memory usage, poor network efficiency
- **Vector graphics (SVG)**: Unnecessary complexity, slower rendering for real-time strokes
- **Bitmap snapshots**: Poor granularity, loses per-user attribution

**Data Structure**:
```javascript
DrawingStroke {
  id: uuid,
  userId: string,
  color: string,
  points: [{x, y, timestamp}],
  strokeWidth: number,
  timestamp: number
}
```

### 3. User Color Assignment Strategy

**Decision**: Pool of 10 distinct colors with round-robin assignment

**Rationale**:
- Maximum 10 concurrent users matches color pool size (no conflicts)
- Predefined palette ensures good contrast and visibility
- Colors returned to pool when user disconnects (reusable)
- Color-blind friendly palette (using ColorBrewer qualitative schemes)

**Alternatives Considered**:
- **Random color generation**: Risk of poor contrast, not color-blind friendly
- **User-selected colors**: Risk of duplicates, requires conflict resolution UI
- **Hashing user IDs to colors**: No guarantee of good contrast/visibility

**Color Pool** (WCAG AA compliant):
```javascript
['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
 '#ffff33', '#a65628', '#f781bf', '#999999', '#00ffff']
```

### 4. Cursor Position Synchronization

**Decision**: Throttled cursor position events (60Hz max)

**Rationale**:
- 60fps matches canvas rendering rate (synchronized updates)
- Throttling reduces network bandwidth (vs. every mousemove event)
- <100ms latency target achievable with 16ms throttle interval
- Balances responsiveness with performance

**Alternatives Considered**:
- **No throttling**: Excessive WebSocket traffic, server overload
- **30Hz throttling**: Noticeable lag in cursor movement
- **Position interpolation**: Adds complexity, unnecessary for 60Hz

**Implementation**:
- Client: throttle cursor events to 60Hz using requestAnimationFrame
- Server: broadcast without additional throttling (already throttled at source)
- Cursor data: `{userId, x, y, timestamp}` (~40 bytes)

### 5. Audio Feedback Strategy

**Decision**: Client-side synthesis using Tone.js for drawing events

**Rationale**:
- Tone.js already integrated in frontend
- Low latency (<50ms) for immediate feedback
- No audio streaming overhead (synthesize locally)
- Simple sound mapping: stroke start → short pluck/click sound
- User-controllable (mute/volume) without server-side changes

**Alternatives Considered**:
- **Streaming audio from server**: High latency, bandwidth intensive
- **Pre-recorded samples**: Larger payload, less flexible
- **Web Audio API directly**: More complex, Tone.js provides abstractions

**Audio Events**:
- `draw-start`: Short pluck sound (50ms, frequency varies by user color)
- `draw-end`: Soft release sound (30ms)
- User controls: mute toggle, volume slider (0-100%)

### 6. Room Capacity Management

**Decision**: Hard limit of 10 users with "room full" rejection

**Rationale**:
- Matches performance testing scope (10 concurrent users)
- Memory constraint: 10 users × ~1k strokes each × ~100 bytes = ~1MB per room
- Color pool size matches user limit (1:1 mapping)
- Simple enforcement: reject WebSocket connection at room join

**Alternatives Considered**:
- **Waiting queue**: Adds complexity, uncertain wait times
- **Dynamic scaling**: Requires performance profiling beyond MVP scope
- **Unlimited users**: Violates memory and performance constraints

**Implementation**:
- RoomManager tracks user count per room
- Emit `room-full` error event when 11th user attempts join
- Client displays friendly error message

### 7. Historical Stroke Handling (Late Joiners)

**Decision**: Transmit full stroke history on room join

**Rationale**:
- Ensures late joiners see complete canvas state
- ~10k strokes × ~100 bytes = ~1MB payload (acceptable one-time cost)
- Simpler than incremental synchronization
- Matches user expectation: "see previous work"

**Alternatives Considered**:
- **No history**: Poor UX, confusing for late joiners
- **Incremental sync**: Complex, unnecessary for in-memory state
- **Persistent storage**: Out of MVP scope, adds infrastructure

**Implementation**:
- On `join-room`: emit `drawing-history` event with all strokes
- Client renders history before enabling live drawing
- Optimized: batch strokes by user, render in requestAnimationFrame loop

### 8. Performance Monitoring Strategy

**Decision**: Client-side latency tracking, server-side event timing

**Rationale**:
- Client tracks round-trip time for draw events (timestamp diff)
- Server logs event processing time per WebSocket handler
- Meets <1000ms sync requirement validation
- Simple instrumentation, no external monitoring tools needed for MVP

**Implementation**:
- Client: `performance.now()` timestamps on emit/receive
- Server: log event duration for >200ms handlers (breach detection)
- Metrics exposed via console for manual testing phase

## Technology Stack Summary

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| Backend Runtime | Node.js | 18+ | WebSocket server, room management |
| Backend Framework | Express | 4.18+ | HTTP server (health checks) |
| Real-Time Communication | Socket.IO | 4.7+ | Bi-directional event streaming |
| Frontend Canvas | HTML5 Canvas API | Native | Drawing rendering |
| Audio Synthesis | Tone.js | 14.7+ | Client-side sound effects |
| Testing (Unit/Integration) | Jest | 29+ | Backend/frontend tests |
| Testing (E2E) | Puppeteer | 21+ | Multi-user browser scenarios |
| Testing (Contract) | Socket.IO-client | 4.7+ | WebSocket event validation |

## Open Questions Resolved

1. **Conflict resolution for overlapping strokes**: Last-write-wins (strokes are independent, no merging)
2. **Privacy controls**: Deferred to post-MVP (no cursor hiding in initial release)
3. **Audio format**: Client-side synthesis (no voice chat)
4. **Performance validation**: Manual testing with 10 concurrent Puppeteer clients

## Constitutional Compliance

- **TDD**: Contract tests written before socket handlers
- **Performance**: <1000ms sync validated via timestamp logging
- **Code Quality**: Extends existing clean architecture (no duplication)
- **Testing**: 90%+ coverage via Jest unit + integration + contract tests
- **UX Consistency**: Color-blind friendly palette, accessible audio controls

## Next Phase

Phase 1 will generate:
- `data-model.md`: Entity definitions (User, Room, DrawingStroke, CursorPosition)
- `contracts/*.json`: Socket.IO event schemas (draw-stroke, cursor-move, etc.)
- `quickstart.md`: Integration test scenarios
- Update `CLAUDE.md`: Add drawing sync, color assignment context
