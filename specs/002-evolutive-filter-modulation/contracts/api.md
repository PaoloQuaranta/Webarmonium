# API Contracts

**Feature**: Generative Multi-User Musical Composition System
**Date**: 2025-01-24
**Format**: Socket.IO Events + REST Endpoints

## Socket.IO Events

### Client → Server Events

#### gesture:record
User gesture input for musical event generation

```json
{
  "userId": "string",
  "roomId": "string",
  "gesture": {
    "startPosition": {"x": number, "y": number},
    "endPosition": {"x": number, "y": number},
    "speed": number,
    "direction": "string",
    "timestamp": number
  }
}
```

#### room:join
User joins a collaborative session

```json
{
  "userId": "string",
  "roomId": "string",
  "deviceCapabilities": {
    "maxVoices": number,
    "audioLatency": number,
    "platform": "string"
  }
}
```

#### room:leave
User leaves collaborative session

```json
{
  "userId": "string",
  "roomId": "string"
}
```

#### clock:sync
Request musical clock synchronization

```json
{
  "roomId": "string",
  "clientTime": number,
  "lastKnownBeat": number
}
```

### Server → Client Events

#### musical:event
Discrete musical event to be played

```json
{
  "eventId": "string",
  "userId": "string",
  "roomId": "string",
  "musicalClock": {
    "beat": number,
    "tempo": number,
    "timestamp": number
  },
  "event": {
    "type": "note" | "phrase",
    "pitch": number,
    "duration": number,
    "velocity": number,
    "articulation": "string",
    "instrument": {
      "type": "string",
      "parameters": "object"
    }
  },
  "scheduleTime": number
}
```

#### composition:update
Background composition state change

```json
{
  "roomId": "string",
  "composition": {
    "activityLevel": number,
    "mood": {
      "energy": number,
      "complexity": number,
      "style": {
        "classical": number,
        "ambient": number,
        "electronic": number
      }
    },
    "elements": [
      {
        "type": "harmony" | "melody" | "rhythm" | "texture",
        "intensity": number,
        "pattern": "object"
      }
    ]
  },
  "timestamp": number
}
```

#### clock:sync
Musical clock synchronization response

```json
{
  "roomId": "string",
  "musicalClock": {
    "currentBeat": number,
    "tempo": number,
    "timeSignature": {"numerator": 4, "denominator": 4},
    "startTime": number
  },
  "syncOffset": number,
  "serverTime": number
}
```

#### pattern:detected
Pattern similarity detected in user phrases

```json
{
  "roomId": "string",
  "pattern": {
    "signature": "string",
    "similarPhrases": ["string"],
    "frequency": number,
    "integrationLevel": number
  },
  "timestamp": number
}
```

#### room:state
Current room state for new participants

```json
{
  "roomId": "string",
  "users": [
    {
      "userId": "string",
      "joinedAt": number,
      "isActive": boolean
    }
  ],
  "musicalClock": {
    "currentBeat": number,
    "tempo": number,
    "isRunning": boolean
  },
  "composition": {
    "activityLevel": number,
    "mood": "object",
    "elements": "array"
  },
  "timestamp": number
}
```

#### voice:allocation
Voice resource allocation notification

```json
{
  "roomId": "string",
  "userId": "string",
  "allocation": {
    "voicesAvailable": number,
    "voicesUsed": number,
    "deviceLimits": {
      "maxGestureVoices": number,
      "maxBackgroundVoices": number
    }
  },
  "timestamp": number
}
```

## REST Endpoints

### GET /api/rooms/:id
Retrieve room information

**Response**:
```json
{
  "roomId": "string",
  "createdAt": "string",
  "activeUsers": number,
  "isActive": boolean,
  "currentComposition": {
    "activityLevel": number,
    "mood": "object",
    "elementCount": number
  }
}
```

### POST /api/rooms
Create new collaborative room

**Request**:
```json
{
  "name": "string",
  "settings": {
    "maxUsers": number,
    "defaultTempo": number,
    "style": "string"
  }
}
```

**Response**:
```json
{
  "roomId": "string",
  "name": "string",
  "createdAt": "string",
  "settings": "object"
}
```

### GET /api/rooms/:id/patterns
Retrieve detected patterns for room

**Response**:
```json
{
  "roomId": "string",
  "patterns": [
    {
      "signature": "string",
      "frequency": number,
      "integrationLevel": number,
      "lastDetected": number,
      "similarPhrases": ["string"]
    }
  ],
  "timestamp": number
}
```

### GET /api/rooms/:id/composition
Retrieve current background composition state

**Response**:
```json
{
  "roomId": "string",
  "composition": {
    "activityLevel": number,
    "mood": {
      "energy": number,
      "complexity": number,
      "style": {
        "classical": number,
        "ambient": number,
        "electronic": number
      }
    },
    "elements": [
      {
        "id": "string",
        "type": "string",
        "intensity": number,
        "pattern": "object",
        "voiceId": "string"
      }
    ]
  },
  "musicalClock": {
    "currentBeat": number,
    "tempo": number,
    "isRunning": boolean
  },
  "timestamp": number
}
```

## Error Handling

### Socket.IO Error Events

#### error
General error response

```json
{
  "type": "validation" | "room_not_found" | "permission_denied" | "resource_exhausted",
  "message": "string",
  "details": "object",
  "timestamp": number
}
```

### REST Error Responses

**400 Bad Request**:
```json
{
  "error": "validation_error",
  "message": "Invalid request parameters",
  "details": {
    "field": "string",
    "issue": "string"
  }
}
```

**404 Not Found**:
```json
{
  "error": "room_not_found",
  "message": "Room with specified ID not found"
}
```

**429 Too Many Requests**:
```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests",
  "retryAfter": number
}
```

## Rate Limiting

- **gesture:record**: 10 events/second per user
- **room:join**: 5 joins/minute per IP
- **REST endpoints**: 100 requests/minute per IP

## Authentication

Current implementation uses session-based identification:
- Users identified by UUID generated on client side
- No authentication required for collaborative sessions
- Room access controlled by room ID knowledge

## Data Validation

All inputs validated against schemas:
- Gesture coordinates within screen bounds
- Musical values within acceptable ranges
- Required fields present and correctly typed
- Room IDs follow UUID format validation

## Constitutional Compliance

- **Performance**: All events optimized for <200ms processing
- **Reliability**: Comprehensive error handling defined
- **Scalability**: Rate limits prevent resource exhaustion
- **Security**: Input validation prevents malicious data