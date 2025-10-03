# Socket.io API Contracts

## Client → Server Events

### `join-room`
**Purpose**: User joins a collaborative room
**Payload**:
```json
{
  "roomId": "string|null", // null for auto-assignment
  "deviceType": "desktop|mobile"
}
```
**Response**: `room-joined` or `room-error`
**Validation**:
- Room must have <10 users
- Device type must be valid enum

### `leave-room`
**Purpose**: User explicitly leaves current room
**Payload**:
```json
{
  "userId": "string"
}
```
**Response**: `room-left`
**Validation**:
- User must be in a room

### `gesture`
**Purpose**: Send gesture data for sonic parameter translation
**Payload**:
```json
{
  "type": "mouse|touch|gyroscope",
  "coordinates": {
    "x": "number", // 0.0-1.0 normalized
    "y": "number", // 0.0-1.0 normalized
    "z": "number|null" // gyroscope only
  },
  "intensity": "number", // 0.0-1.0
  "timestamp": "number" // client timestamp
}
```
**Response**: `gesture-processed`
**Validation**:
- Coordinates must be 0.0-1.0 range
- Intensity must be 0.0-1.0 range
- Type must match device capability

### `heartbeat`
**Purpose**: Maintain active session status
**Payload**:
```json
{
  "timestamp": "number"
}
```
**Response**: `heartbeat-ack`
**Rate Limit**: Max 1 per second

## Server → Client Events

### `room-joined`
**Purpose**: Confirm successful room join
**Payload**:
```json
{
  "roomId": "string",
  "userId": "string",
  "userCount": "number",
  "memoryInfluence": "object" // current room personality
}
```

### `room-error`
**Purpose**: Report room join/operation errors
**Payload**:
```json
{
  "error": "ROOM_FULL|ROOM_NOT_FOUND|INVALID_REQUEST",
  "message": "string"
}
```

### `user-joined`
**Purpose**: Notify room of new user
**Payload**:
```json
{
  "userId": "string",
  "userCount": "number",
  "deviceType": "desktop|mobile"
}
```

### `user-left`
**Purpose**: Notify room of user departure
**Payload**:
```json
{
  "userId": "string",
  "userCount": "number"
}
```

### `sonic-update`
**Purpose**: Real-time sound pattern changes
**Payload**:
```json
{
  "patterns": [
    {
      "id": "string",
      "type": "ambient|rhythmic|harmonic|textural",
      "parameters": "object", // audio synthesis params
      "intensity": "number" // 0.0-1.0
    }
  ],
  "timestamp": "number"
}
```

### `gesture-echo`
**Purpose**: Broadcast processed gesture to room participants
**Payload**:
```json
{
  "userId": "string",
  "gestureId": "string",
  "sonicParams": "object",
  "visualFeedback": "object" // canvas rendering data
}
```

### `memory-evolution`
**Purpose**: Notify room of memory state changes
**Payload**:
```json
{
  "roomPersonality": "object",
  "adaptationStrength": "number", // 0.0-1.0
  "timestamp": "number"
}
```

## Error Responses

### Standard Error Format
```json
{
  "error": "string",
  "code": "string",
  "message": "string",
  "timestamp": "number"
}
```

### Error Codes
- `ROOM_FULL`: Room has reached 10 user limit
- `ROOM_NOT_FOUND`: Requested room doesn't exist
- `INVALID_GESTURE`: Gesture data validation failed
- `RATE_LIMITED`: Too many requests from client
- `SERVER_ERROR`: Internal server error
- `MEMORY_EXPIRED`: Room memory has expired

## Performance Requirements

- **Latency**: <100ms for all Socket.io communications
- **Rate Limits**:
  - Gestures: Max 60/second per user
  - Heartbeat: Max 1/second per user
  - Join/Leave: Max 10/minute per client
- **Connection**: Auto-reconnect with exponential backoff
- **Fallback**: Long-polling for older browsers

## WebSocket Connection Lifecycle

1. **Connect**: Client establishes Socket.io connection
2. **Join**: Client sends `join-room` event
3. **Active**: Client streams `gesture` events, receives `sonic-update`
4. **Heartbeat**: Periodic `heartbeat` to maintain session
5. **Leave**: Client sends `leave-room` or disconnects
6. **Cleanup**: Server removes user from room, notifies others

## Testing Contracts

Each endpoint requires:
- **Contract Test**: Validates request/response schema
- **Integration Test**: Tests full workflow with mock clients
- **Performance Test**: Validates <100ms latency requirement
- **Error Test**: Validates error handling and recovery