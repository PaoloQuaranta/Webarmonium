# Data Model: Webarmonium

## Core Entities

### User
**Purpose**: Represents an individual participant in a room
**Fields**:
- `id`: String - Unique session identifier (UUID)
- `roomId`: String - Current room identifier
- `isActive`: Boolean - Currently sending gestures
- `joinedAt`: Date - Session start time
- `lastActivity`: Date - Most recent gesture timestamp

**Relationships**:
- User belongs to one Room
- User generates multiple Gestures
- User contributes to Room's MemoryState

**State Transitions**:
- `inactive` → `active` (first gesture)
- `active` → `inactive` (no gestures for 30 seconds)
- `active` → `disconnected` (leaves room)

**Validation Rules**:
- User ID must be unique within room
- Room must exist before user joins
- Maximum 10 users per room (constitutional limit)

### Room
**Purpose**: Virtual collaborative space with unique sonic personality
**Fields**:
- `id`: String - Sequential room identifier (room-001, room-002, etc.)
- `createdAt`: Date - Room creation timestamp
- `lastActivity`: Date - Most recent user activity
- `userCount`: Number - Current active users (0-10)
- `memoryState`: MemoryState - Accumulated learning data
- `isActive`: Boolean - Has users or recent activity

**Relationships**:
- Room contains multiple Users (0-10)
- Room owns one MemoryState
- Room processes multiple Gestures

**State Transitions**:
- `empty` → `active` (first user joins)
- `active` → `empty` (last user leaves)
- `empty` → `expired` (24 hours after last activity)

**Validation Rules**:
- Room ID must be unique globally
- User count cannot exceed 10
- Memory state persists for exactly 24 hours after becoming empty

### Gesture
**Purpose**: User input action translated into sonic parameters
**Fields**:
- `id`: String - Unique gesture identifier
- `userId`: String - Originating user
- `roomId`: String - Target room
- `timestamp`: Date - Gesture occurrence time
- `type`: String - Input method ('mouse', 'touch', 'gyroscope')
- `coordinates`: Object - Position data {x, y, z?}
- `intensity`: Number - Gesture strength/pressure (0.0-1.0)
- `duration`: Number - Gesture length in milliseconds
- `sonicParams`: Object - Translated audio parameters

**Relationships**:
- Gesture belongs to one User
- Gesture affects one Room's MemoryState
- Gesture generates SoundPattern modifications

**Validation Rules**:
- Coordinates must be normalized (0.0-1.0 range)
- Intensity must be between 0.0 and 1.0
- Duration must be positive integer
- Sonic parameters must be valid audio ranges

### SoundPattern
**Purpose**: Generative musical elements that evolve from interactions
**Fields**:
- `id`: String - Pattern identifier
- `roomId`: String - Associated room
- `type`: String - Pattern category ('ambient', 'rhythmic', 'harmonic', 'textural')
- `parameters`: Object - Current audio synthesis parameters
- `evolutionState`: Object - Pattern development history
- `influenceWeight`: Number - Impact on overall room sound (0.0-1.0)
- `createdAt`: Date - Pattern emergence time
- `lastModified`: Date - Most recent evolution

**Relationships**:
- SoundPattern belongs to one Room
- SoundPattern influenced by multiple Gestures
- SoundPattern contributes to MemoryState

**State Transitions**:
- `emerging` → `active` (gains sufficient gesture influence)
- `active` → `evolving` (continuous gesture modification)
- `evolving` → `dormant` (no recent gesture influence)
- `dormant` → `expired` (removed after memory cleanup)

**Validation Rules**:
- Parameters must be within valid audio synthesis ranges
- Influence weight must sum to ≤1.0 per room
- Evolution state must maintain pattern continuity

### MemoryState
**Purpose**: Accumulated learning data that influences room's sonic evolution
**Fields**:
- `roomId`: String - Associated room identifier
- `gesturePatterns`: Array - Learned user interaction patterns
- `sonicEvolution`: Object - Room's musical development history
- `userInfluences`: Map - Anonymous contribution tracking
- `adaptationWeights`: Object - Learning algorithm parameters
- `createdAt`: Date - Memory initialization
- `lastUpdate`: Date - Most recent learning update
- `expiresAt`: Date - Memory expiration (24 hours after room empty)

**Relationships**:
- MemoryState belongs to one Room
- MemoryState learns from multiple Gestures
- MemoryState influences SoundPattern generation

**Lifecycle**:
- Created when room first becomes active
- Continuously updated during user activity
- Preserved for 24 hours after room becomes empty
- Automatically purged after expiration

**Validation Rules**:
- Room ID must be unique (one memory per room)
- Expiration must be exactly 24 hours from last user activity
- User influences must remain anonymous (no personal data)
- Adaptation weights must maintain algorithmic balance

## Data Relationships

```
Room (1) ←→ (0-10) User
Room (1) ←→ (1) MemoryState
Room (1) ←→ (*) SoundPattern
User (1) ←→ (*) Gesture
Gesture (*) → (1) MemoryState [influences]
SoundPattern (*) ← (1) MemoryState [generates]
```

## Memory Management

- **User Sessions**: In-memory only, purged on disconnect
- **Room State**: In-memory with 24-hour persistence timer
- **Gesture History**: Processed immediately, not stored permanently
- **Sound Patterns**: Active in-memory, archived in MemoryState
- **Memory State**: Persisted for exactly 24 hours, then purged

## Anonymous Privacy Model

- User IDs are session-only UUIDs (no personal identification)
- Gesture data processed in real-time (no permanent storage)
- Memory state preserves patterns but not individual attribution
- No authentication or personal data collection required