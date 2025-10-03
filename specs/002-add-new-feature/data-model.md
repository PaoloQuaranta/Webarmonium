# Data Model: Multi-User Canvas Interaction

**Feature**: Multi-User Canvas Interaction
**Date**: 2025-10-01
**Source**: Extracted from spec.md requirements

## Core Entities

### 1. User Session (Extended)

**Purpose**: Represents an active user connection to a canvas/room

**Attributes**:
```javascript
{
  id: string,              // UUID v4
  roomId: string,          // Room identifier
  assignedColor: string,   // Hex color from pool (#e41a1c, etc.)
  connectionStatus: enum,  // 'connected' | 'disconnected'
  joinedAt: timestamp,     // ISO 8601
  lastActivity: timestamp, // ISO 8601 (for timeout detection)
  socketId: string        // Socket.IO connection ID
}
```

**Validation Rules**:
- `id`: Required, unique, UUID format
- `assignedColor`: Required, must be from 10-color pool
- `connectionStatus`: Required, defaults to 'connected'
- `roomId`: Required, references Room.id

**State Transitions**:
```
null → connected (join-room event)
connected → disconnected (disconnect/timeout)
disconnected → null (cleanup after 30s)
```

**Relationships**:
- Belongs to one Room (1:N)
- Has many DrawingStrokes (1:N)
- Has one CursorPosition (1:1)

### 2. Room (Extended)

**Purpose**: Represents a collaborative canvas workspace

**Attributes**:
```javascript
{
  id: string,                    // UUID v4 or room code
  users: Map<userId, UserSession>, // Active users
  drawingStrokes: Array<DrawingStroke>, // All strokes in room
  cursorPositions: Map<userId, CursorPosition>, // Live cursor positions
  availableColors: Set<string>,  // Unused colors from pool
  createdAt: timestamp,          // ISO 8601
  lastActivity: timestamp,       // ISO 8601
  maxUsers: number               // Hard limit: 10
}
```

**Validation Rules**:
- `id`: Required, unique
- `users.size`: Must be ≤ maxUsers (10)
- `availableColors`: Must contain colors not assigned to active users
- `drawingStrokes.length`: Soft limit 10,000 strokes (memory constraint)

**State Transitions**:
```
empty → active (first user joins)
active → empty (last user leaves, cleanup after 10min)
```

**Relationships**:
- Has many UserSessions (1:N, max 10)
- Has many DrawingStrokes (1:N)
- Has many CursorPositions (1:N)

**Business Rules**:
- Reject new users when `users.size >= maxUsers`
- Return `assignedColor` to `availableColors` when user disconnects
- Persist drawing strokes until room cleanup (in-memory only)

### 3. DrawingStroke (NEW)

**Purpose**: Represents a pen/brush stroke on the canvas

**Attributes**:
```javascript
{
  id: string,                     // UUID v4
  userId: string,                 // User who created stroke
  roomId: string,                 // Room containing stroke
  color: string,                  // User's assigned color (hex)
  strokeWidth: number,            // Pixels (1-20 range)
  points: Array<{x, y, t}>,       // Drawing path
  startedAt: timestamp,           // ISO 8601
  completedAt: timestamp          // ISO 8601
}
```

**Point Structure**:
```javascript
{
  x: number,      // Canvas X coordinate (0-canvas.width)
  y: number,      // Canvas Y coordinate (0-canvas.height)
  t: timestamp    // Milliseconds since stroke start (for replay)
}
```

**Validation Rules**:
- `id`: Required, unique, UUID format
- `userId`: Required, references User.id
- `roomId`: Required, references Room.id
- `color`: Required, must match user's assigned color
- `strokeWidth`: Required, integer 1-20
- `points`: Required, min 2 points, max 10,000 points
- `points[].x`: Required, number 0 ≤ x ≤ canvasWidth
- `points[].y`: Required, number 0 ≤ y ≤ canvasHeight
- `completedAt`: Must be ≥ startedAt

**State Transitions**:
```
null → in-progress (draw-start event)
in-progress → completed (draw-end event)
completed → persisted (stored in Room.drawingStrokes)
```

**Relationships**:
- Belongs to one User (N:1)
- Belongs to one Room (N:1)

**Performance Characteristics**:
- Average size: ~100 bytes per stroke (20 points × 4 bytes + metadata)
- Memory per room: 10k strokes × 100 bytes = ~1MB
- Serialization: JSON over WebSocket (~120 bytes compressed)

### 4. CursorPosition (NEW)

**Purpose**: Represents real-time cursor location for a user

**Attributes**:
```javascript
{
  userId: string,     // User who owns cursor
  roomId: string,     // Room containing cursor
  x: number,          // Canvas X coordinate
  y: number,          // Canvas Y coordinate
  timestamp: number,  // Unix timestamp milliseconds
  isDrawing: boolean  // True during active stroke
}
```

**Validation Rules**:
- `userId`: Required, references User.id
- `roomId`: Required, references Room.id
- `x`: Required, number 0 ≤ x ≤ canvasWidth
- `y`: Required, number 0 ≤ y ≤ canvasHeight
- `timestamp`: Required, must be recent (within 5 seconds)
- `isDrawing`: Required, boolean

**State Transitions**:
```
null → active (user joins room)
active → active (position updates at 60Hz)
active → null (user disconnects)
```

**Relationships**:
- Belongs to one User (1:1)
- Belongs to one Room (N:1)

**Performance Characteristics**:
- Update frequency: 60Hz (throttled)
- Message size: ~40 bytes per update
- Bandwidth per room: 10 users × 60 updates/sec × 40 bytes = 24KB/sec

### 5. Sound Effect (Configuration)

**Purpose**: Client-side audio configuration for drawing events

**Attributes**:
```javascript
{
  eventType: enum,        // 'draw-start' | 'draw-end'
  frequency: number,      // Hz (derived from user color index)
  duration: number,       // Milliseconds (50ms or 30ms)
  volume: number,         // 0.0 - 1.0 (user-controlled)
  isMuted: boolean        // User preference
}
```

**Validation Rules**:
- `eventType`: Required, one of ['draw-start', 'draw-end']
- `frequency`: Required, 200-800Hz range
- `duration`: Required, positive integer
- `volume`: Required, 0.0 ≤ volume ≤ 1.0
- `isMuted`: Required, boolean

**Note**: This is client-side configuration only, not persisted server-side.

## Relationships Diagram

```
Room (1) ──────────────── (N) UserSession
  │                            │
  │ (1)                        │ (1)
  │                            │
  ↓ (N)                        ↓ (1)
DrawingStroke              CursorPosition
```

## Data Flow Patterns

### User Join Flow
1. Client emits `join-room` with `roomId`
2. Server validates room capacity (< 10 users)
3. Server assigns color from `Room.availableColors`
4. Server creates `UserSession` with `assignedColor`
5. Server broadcasts `user-joined` to all room members
6. Server emits `drawing-history` (all strokes) to new user

### Drawing Flow
1. Client detects mousedown → emits `draw-start`
2. Server creates `DrawingStroke` (in-progress state)
3. Client tracks mousemove → throttles to 60Hz → emits `draw-point`
4. Server appends points to `DrawingStroke.points[]`
5. Client detects mouseup → emits `draw-end`
6. Server marks `DrawingStroke` as completed
7. Server broadcasts completed stroke to all room members
8. Client plays sound effect locally (Tone.js)

### Cursor Movement Flow
1. Client tracks mousemove → throttles to 60Hz
2. Client emits `cursor-move` with {x, y, timestamp}
3. Server updates `Room.cursorPositions[userId]`
4. Server broadcasts cursor position to other room members
5. Clients render remote cursors with user's assigned color

### User Leave Flow
1. Client disconnects (explicit or timeout)
2. Server detects disconnect event
3. Server returns `assignedColor` to `Room.availableColors`
4. Server removes `UserSession` from `Room.users`
5. Server broadcasts `user-left` to remaining members
6. Server cleans up `CursorPosition` for user

## Memory Management

**Per-Room Constraints**:
- 10 users × 200 bytes = 2KB
- 10,000 strokes × 100 bytes = 1MB
- 10 cursor positions × 40 bytes = 400 bytes
- **Total**: ~1MB per room (within <100MB baseline for 100 rooms)

**Cleanup Strategy**:
- Remove rooms with 0 users after 10 minutes inactivity
- Limit strokes to 10,000 per room (oldest strokes pruned if exceeded)
- Cursor positions deleted immediately on user disconnect

## Indexing Strategy

**In-Memory Indexes** (for performance):
- `Room.users`: Map<userId, UserSession> (O(1) lookup)
- `Room.cursorPositions`: Map<userId, CursorPosition> (O(1) lookup)
- `Room.drawingStrokes`: Array (O(1) append, O(n) full history retrieval)

No database indexes needed (in-memory only for MVP).

## Serialization Formats

**WebSocket Event Payloads**:
```javascript
// draw-stroke event
{
  type: 'draw-stroke',
  payload: {
    strokeId: 'uuid',
    userId: 'uuid',
    color: '#e41a1c',
    strokeWidth: 2,
    points: [{x: 100, y: 200, t: 0}, ...],
    timestamp: 1696262400000
  }
}

// cursor-move event
{
  type: 'cursor-move',
  payload: {
    userId: 'uuid',
    x: 150,
    y: 250,
    timestamp: 1696262400000,
    isDrawing: false
  }
}
```

## Constitutional Compliance

- **Single Responsibility**: Each entity has one clear purpose
- **Zero Duplication**: Reusing existing User/Room models, extending cleanly
- **Type Safety**: ESLint configured, JSDoc type annotations added
- **Test Coverage**: All entities have unit tests validating rules
- **Performance**: Memory constraints defined and enforced
