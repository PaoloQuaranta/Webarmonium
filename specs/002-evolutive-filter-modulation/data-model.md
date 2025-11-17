# Data Model

**Feature**: Generative Multi-User Musical Composition System
**Date**: 2025-01-24
**Status**: Complete

## Core Entities

### MusicalEvent
Represents a discrete musical event generated from user gesture

**Fields**:
- `id`: string (UUID) - Unique identifier
- `userId`: string - User who generated the event
- `roomId`: string - Room where event occurred
- `timestamp`: number - Musical clock timestamp
- `pitch`: number - Musical pitch (MIDI note number)
- `duration`: number - Event duration in beats
- `velocity`: number - Note velocity/amplitude (0-127)
- `articulation`: string - Note articulation ("staccato", "legato", "accent")
- `phraseId`: string - Associated phrase identifier
- `eventType`: string - "melodic" or "rhythmic"

**Validation Rules**:
- Pitch must be between 0-127 (MIDI range)
- Duration must be positive
- Velocity must be between 0-127
- Articulation must be one of predefined values

### GesturePhrase
Complete musical phrase generated from a single user gesture

**Fields**:
- `id`: string (UUID) - Unique identifier
- `userId`: string - User who generated phrase
- `roomId`: string - Room where phrase created
- `startTime`: number - Phrase start time (musical clock)
- `events`: Array<MusicalEvent> - Events in the phrase
- `gestureData`: object - Original gesture characteristics
  - `startPosition`: {x, y}
  - `endPosition`: {x, y}
  - `speed`: number
  - `direction`: string
- `patternSignature`: string - Computed pattern signature for similarity matching
- `createdAt`: Date - Creation timestamp

**Validation Rules**:
- Events array must contain at least one event
- Pattern signature automatically computed from events
- Gesture data must include position, speed, direction

### PatternMemory
Storage of detected musical phrase similarities

**Fields**:
- `id`: string (UUID) - Unique identifier
- `roomId`: string - Room identifier
- `patternSignature`: string - Pattern identifier
- `similarPhrases`: Array<string> - IDs of similar phrases
- `frequency`: number - How often pattern detected
- `lastDetected`: number - Last detection timestamp
- `integrationLevel`: number - How integrated into composition (0-1)
- `createdAt`: Date - Creation timestamp

**Validation Rules**:
- Similar phrases array must contain at least 2 phrases
- Integration level must be between 0-1
- 2-minute rolling window enforced automatically

### BackgroundComposition
Evolving multi-timbral musical structure

**Fields**:
- `id`: string (UUID) - Unique identifier
- `roomId`: string - Room identifier
- `musicalElements`: Array<object> - Active musical elements
  - `type`: string - "harmony", "melody", "rhythm", "texture"
  - `voiceId`: string - Assigned voice resource
  - `pattern`: object - Musical pattern data
  - `intensity`: number - Element intensity (0-1)
  - `evolutionRate`: number - Rate of change
- `activityLevel`: number - Current user activity density
- `mood`: object - Current composition mood
  - `energy`: number (0-1)
  - `complexity`: number (0-1)
  - `style`: object - Style blend percentages
- `lastUpdate`: number - Last update timestamp
- `createdAt`: Date - Creation timestamp

**Validation Rules**:
- Musical elements array must respect voice allocation limits
- Activity level computed from recent user gestures
- Mood values must be between 0-1

### VoiceResource
Individual audio voice allocation

**Fields**:
- `id`: string (UUID) - Unique identifier
- `roomId`: string - Room identifier
- `userId`: string - User who owns voice (null for background)
- `type`: string - "gesture" or "background"
- `status`: string - "active", "idle", "reserved"
- `instrument`: object - Instrument configuration
  - `type`: string - "synth", "sampler", "generator"
  - `parameters`: object - Instrument-specific settings
- `lastUsed`: number - Last usage timestamp
- `deviceCapabilities`: object - Device performance constraints

**Validation Rules**:
- One user cannot exceed device voice limits
- Background voices balanced with gesture voices
- Automatic cleanup of idle voices

### MusicalClock
Unified timing reference across all clients

**Fields**:
- `roomId`: string - Room identifier
- `currentBeat`: number - Current beat position
- `tempo`: number - Current tempo (BPM)
- `timeSignature`: object - `{numerator: 4, denominator: 4}`
- `startTime`: number - Clock start timestamp
- `isRunning`: boolean - Clock state
- `syncOffset`: object - Per-client synchronization offsets

**Validation Rules**:
- Beat position must be monotonically increasing
- Tempo must be within musical bounds (40-200 BPM)
- Sync offsets automatically managed

## Entity Relationships

```
User (1) -> (*) GesturePhrase
GesturePhrase (1) -> (*) MusicalEvent
GesturePhrase (*) -> (1) PatternMemory
Room (1) -> (*) MusicalEvent
Room (1) -> (*) BackgroundComposition
Room (1) -> (*) VoiceResource
Room (1) -> (*) PatternMemory
Room (1) -> (1) MusicalClock
BackgroundComposition (1) -> (*) VoiceResource
```

## State Transitions

### VoiceResource States
- `idle` -> `reserved` -> `active` -> `idle`
- Automatic cleanup after inactivity timeout

### PatternMemory Integration
- Detected -> Increasing integration level -> Full integration
- Gradual "bleeding" into background composition

### Background Composition Evolution
- Activity changes -> Mood adjustment -> Musical element adaptation
- Continuous evolution based on user input patterns

## Data Constraints

### Performance Constraints
- Pattern memory: 2-minute rolling window
- Voice allocation: Dynamic based on device capabilities
- Musical events: Buffered for synchronization, max 100ms future scheduling

### Consistency Constraints
- All timestamps use unified musical clock
- Pattern signatures computed using deterministic algorithm
- Voice allocation prevents resource conflicts

### Constitutional Compliance
- Single responsibility: Each entity has clear purpose
- No duplication: Relationships avoid data redundancy
- Testable: All validation rules automatically enforced
- Performance: Optimized for real-time operation