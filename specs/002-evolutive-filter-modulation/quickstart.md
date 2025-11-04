# Quickstart Guide

**Feature**: Generative Multi-User Musical Composition System
**Date**: 2025-01-24
**Purpose**: Integration test scenarios and validation steps

## Prerequisites

- Node.js 18+ installed
- Modern web browser with Web Audio API support
- Local development environment set up
- Existing Webarmonium codebase

## Setup Instructions

### 1. Backend Setup
```bash
cd backend
npm install
npm run dev
```
Server should start on `http://localhost:3000`

### 2. Frontend Setup
```bash
# Serve frontend directory (any static server)
cd frontend
python -m http.server 8080
# OR
npx serve .
```
Frontend available at `http://localhost:8080`

## Integration Test Scenarios

### Test 1: Single User Gesture to Musical Event
**Objective**: Verify gesture generates discrete musical event

**Steps**:
1. Open `http://localhost:8080` in browser
2. Create or join a room
3. Make a gesture on the screen
4. Verify musical event plays within 100ms
5. Check that sound is discrete (not continuous theremin)

**Expected Results**:
- Single musical phrase plays
- Event synchronized to musical clock
- Sound clearly audible and musical
- Position mapped to pitch correctly

**Test Commands**:
```bash
# Run backend tests
npm test -- --testNamePattern="gesture to musical event"

# Check browser console for:
console.log("Musical event played:", event.pitch, event.duration)
```

### Test 2: Multi-User Synchronization
**Objective**: Verify cross-client musical coherence

**Steps**:
1. Open browser tab A and join room "test-sync"
2. Open browser tab B and join same room
3. User A makes gesture
4. Verify User B hears the same musical event
5. Check timing synchronization within acceptable limits

**Expected Results**:
- Both users hear identical musical events
- Events synchronized to unified musical clock
- No noticeable timing drift between clients
- Musical coherence maintained

**Validation**:
```javascript
// In browser console of both tabs:
socket.on('musical:event', (event) => {
  console.log("Received event:", event.eventId, event.scheduleTime);
  // Verify same eventId and timing across tabs
});
```

### Test 3: Pattern Detection and Integration
**Objective**: Verify pattern recognition works

**Steps**:
1. Two users in same room
2. Both users make similar gestures (similar pitch ranges, rhythms)
3. Repeat similar gestures 3-4 times over 30 seconds
4. Verify pattern detection notification
5. Check that background composition incorporates detected patterns

**Expected Results**:
- System detects pattern similarity
- Pattern integration notification appears
- Background composition evolves to include pattern elements
- Integration is gradual and musical

**Monitoring**:
```javascript
// Listen for pattern detection
socket.on('pattern:detected', (pattern) => {
  console.log("Pattern detected:", pattern.signature);
});

// Monitor composition changes
socket.on('composition:update', (composition) => {
  console.log("Composition mood:", composition.mood);
});
```

### Test 4: Density-Driven Composition Evolution
**Objective**: Verify activity level affects composition

**Steps**:
1. Start with single user making occasional gestures
2. Gradually increase gesture frequency (more users or faster gestures)
3. Verify composition mood shifts to reflect activity
4. Reduce activity and verify composition calms down
5. Check that transitions are smooth and musical

**Expected Results**:
- Composition energy increases with gesture density
- Mood evolves smoothly (no jarring changes)
- Style blend adjusts based on activity patterns
- Musical coherence maintained throughout

**Metrics to Monitor**:
```javascript
socket.on('composition:update', (composition) => {
  console.log("Activity level:", composition.activityLevel);
  console.log("Mood energy:", composition.mood.energy);
  console.log("Style blend:", composition.mood.style);
});
```

### Test 5: Voice Resource Management
**Objective**: Verify dynamic voice allocation works

**Steps**:
1. Join room with simulated low-end device capabilities
2. Verify limited voice allocation
3. Join with high-end device capabilities
4. Verify increased voice allocation
5. Test with 10+ simultaneous users
6. Verify graceful degradation when limits reached

**Expected Results**:
- Voice allocation adapts to device capabilities
- Musical quality maintained within limits
- No audio dropouts or glitches
- System remains responsive under load

**Testing Voice Limits**:
```javascript
// Simulate different device capabilities
socket.emit('room:join', {
  userId: "test-user",
  roomId: "test-room",
  deviceCapabilities: {
    maxVoices: 4, // Try different values
    audioLatency: 50,
    platform: "web"
  }
});

socket.on('voice:allocation', (allocation) => {
  console.log("Voice allocation:", allocation);
});
```

### Test 6: Network Latency Handling
**Objective**: Verify synchronization across network conditions

**Steps**:
1. Use browser dev tools to simulate slow network (3G)
2. Make gestures in degraded network conditions
3. Verify musical events still play coherently
4. Check that remote gestures are properly buffered
5. Verify musical clock remains synchronized

**Expected Results**:
- Musical coherence maintained despite network issues
- Remote gestures buffered and scheduled correctly
- No timing conflicts or double playback
- User experience remains musical

## Performance Validation

### Latency Testing
```javascript
// Measure gesture-to-audio latency
const gestureStart = performance.now();
// ... make gesture ...
socket.on('musical:event', (event) => {
  const audioLatency = performance.now() - gestureStart;
  console.log("Gesture to audio latency:", audioLatency);
  // Should be <100ms for optimal experience
});
```

### Memory Usage Monitoring
```javascript
// Monitor memory usage during extended session
setInterval(() => {
  if (performance.memory) {
    console.log("Memory usage:", {
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit
    });
  }
}, 10000);
```

### Pattern Memory Validation
```javascript
// Verify 2-minute rolling window
socket.emit('room:join', {userId: "test", roomId: "test-room"});

// Make pattern, wait 2 minutes, make different pattern
// Verify old pattern is no longer detected
```

## Constitutional Compliance Checks

### Code Quality Validation
```bash
# Run linting
npm run lint

# Run type checking
npm run type-check

# Run tests with coverage
npm run test:coverage
# Should achieve 90%+ coverage
```

### Performance Benchmarks
```bash
# Load testing with simulated users
npm run test:performance

# Should maintain <200ms API response times
# Should handle 10+ concurrent users
# Memory usage should remain <100MB baseline
```

### UX Consistency Validation
- Verify error messages are user-friendly
- Check loading states are handled gracefully
- Ensure interface remains responsive
- Test accessibility features

## Troubleshooting

### Common Issues

**No audio playback**:
- Check browser Web Audio API support
- Verify user interaction required for audio context
- Check console for audio context errors

**Synchronization issues**:
- Verify Socket.IO connection status
- Check musical clock sync events
- Monitor network latency

**Pattern detection not working**:
- Ensure sufficient similar gestures made
- Check pattern memory window (2 minutes)
- Verify similarity threshold settings

**Performance issues**:
- Monitor voice allocation limits
- Check for memory leaks in extended sessions
- Verify gesture rate limiting compliance

### Debug Commands
```javascript
// Enable debug logging
socket.emit('debug:enable', {level: "verbose"});

// Check current room state
socket.emit('room:state', {roomId: "test-room"});

// Force pattern detection test
socket.emit('pattern:test', {type: "similar-gestures"});
```

## Success Criteria

All integration tests pass with:
- ✅ Musical events generated from gestures
- ✅ Cross-client synchronization working
- ✅ Pattern detection and integration functional
- ✅ Density-driven composition evolution
- ✅ Voice resource management effective
- ✅ Network latency handling robust
- ✅ Performance requirements met
- ✅ Constitutional compliance achieved

Ready for production deployment when all tests pass and performance benchmarks are met.