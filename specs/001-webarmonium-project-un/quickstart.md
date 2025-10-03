# Quickstart Integration Tests

## Test Scenario 1: Single User Room Experience

**Objective**: Validate individual user interaction with generative music system

### Setup
1. Start backend server (`npm run start:backend`)
2. Open frontend in browser (`http://localhost:3000`)
3. Verify Web Audio API and Canvas support

### Test Steps
1. **Initial Room Join**
   - Page loads, auto-assigns to available room
   - **Expected**: Room ID displayed, ambient music begins playing
   - **Verify**: Audio context activated, Canvas initialized

2. **First Gesture Response**
   - Move mouse across canvas OR tap screen on mobile
   - **Expected**: Music parameters change within 200ms
   - **Verify**: Visual feedback on canvas, audio synthesis responds

3. **Gesture Type Validation**
   - Desktop: Test mouse movement, clicks, drag
   - Mobile: Test touch gestures, gyroscope tilt
   - **Expected**: Each input type generates different sonic parameters
   - **Verify**: Socket events show correct gesture types

4. **Memory Development**
   - Continue gestures for 60 seconds with varied patterns
   - **Expected**: Room personality emerges, sounds evolve
   - **Verify**: `memory-evolution` events received

5. **Idle State**
   - Stop all gestures for 30 seconds
   - **Expected**: Ambient generation continues based on memory
   - **Verify**: User marked as inactive, sounds persist

### Success Criteria
- [ ] Room joins successfully with audio playback
- [ ] <200ms gesture-to-audio latency maintained
- [ ] Visual feedback synchronized with audio changes
- [ ] Memory adaptation observable over time
- [ ] Ambient music continues without user input

## Test Scenario 2: Multi-User Collaboration

**Objective**: Validate collaborative sonic ecosystem with 2-5 users

### Setup
1. Backend server running with room capacity monitoring
2. Multiple browser sessions (different devices recommended)
3. Network latency monitoring tools

### Test Steps
1. **Sequential User Joins**
   - First user joins, establishes baseline
   - Second user joins same room
   - **Expected**: `user-joined` events, room user count updates
   - **Verify**: Both users receive sonic updates from each other

2. **Simultaneous Gesture Interaction**
   - Both users make gestures simultaneously
   - **Expected**: Harmonic or rhythmic interactions emerge
   - **Verify**: `gesture-echo` events show both users' contributions

3. **Collaborative Memory Building**
   - Users maintain interaction for 2+ minutes
   - Vary gesture patterns between users
   - **Expected**: Room develops unique collaborative personality
   - **Verify**: Memory state reflects multi-user influences

4. **User Departure and Return**
   - One user leaves room (`leave-room` or disconnect)
   - **Expected**: `user-left` event, remaining user(s) notified
   - **Verify**: Room memory maintains contributions from departed user
   - User rejoins same room
   - **Expected**: Room memory influences new user's experience

5. **Room Capacity Limits**
   - Add users until 10 concurrent participants
   - Attempt 11th user join
   - **Expected**: `ROOM_FULL` error for 11th user
   - **Verify**: 10 users can interact simultaneously with stable performance

### Success Criteria
- [ ] Multiple users join and interact successfully
- [ ] <100ms WebSocket latency between users
- [ ] Collaborative sonic interactions emerge
- [ ] Room memory persists through user changes
- [ ] 10-user capacity limit enforced correctly

## Test Scenario 3: Memory Persistence and Lifecycle

**Objective**: Validate 24-hour room memory retention policy

### Setup
1. Backend server with memory state logging
2. Room with established memory state
3. Time acceleration capability for testing (or staged test environment)

### Test Steps
1. **Memory State Establishment**
   - Create room with 5+ minutes of multi-user activity
   - **Expected**: Rich memory state with diverse patterns
   - **Verify**: Memory state objects contain substantial learning data

2. **Room Empty State**
   - All users leave room
   - **Expected**: Room transitions to empty, memory preserved
   - **Verify**: 24-hour expiration timer activated

3. **Memory Influence on Return**
   - New user joins empty room within 24 hours
   - **Expected**: Ambient music reflects previous room personality
   - **Verify**: Memory state influences sound generation parameters

4. **Memory Expiration**
   - Wait 24 hours after room becomes empty (or simulate)
   - **Expected**: Memory state purged, room resets to default
   - **Verify**: New users experience fresh room without historical influence

### Success Criteria
- [ ] Room memory persists exactly 24 hours after becoming empty
- [ ] Memory influences ambient generation for returning users
- [ ] Memory automatically purges after expiration
- [ ] Room resets to clean state after memory expiration

## Test Scenario 4: Cross-Platform Device Testing

**Objective**: Validate gesture input across desktop and mobile devices

### Setup
1. Desktop browser (Chrome/Firefox) with mouse input
2. Mobile browser (iOS Safari/Android Chrome) with touch + gyroscope
3. Network conditions: WiFi and mobile data

### Test Steps
1. **Desktop Gesture Capture**
   - Mouse movements, clicks, drag gestures
   - **Expected**: Smooth gesture streaming with coordinates
   - **Verify**: `gesture` events with type: 'mouse'

2. **Mobile Touch Gestures**
   - Single finger taps, multi-finger touches, swipes
   - **Expected**: Touch coordinates translated to sonic parameters
   - **Verify**: `gesture` events with type: 'touch'

3. **Mobile Gyroscope Integration**
   - Device tilt and rotation gestures
   - **Expected**: 3D coordinates (x, y, z) influence sound
   - **Verify**: `gesture` events with type: 'gyroscope'

4. **Cross-Platform Collaboration**
   - Desktop and mobile users in same room
   - **Expected**: Different gesture types create complementary sonic layers
   - **Verify**: Gesture echoes show device type differences

### Success Criteria
- [ ] All input methods work reliably across platforms
- [ ] Gesture data properly normalized (0.0-1.0 range)
- [ ] Cross-platform users can collaborate effectively
- [ ] Performance maintained on mobile devices

## Test Scenario 5: Performance and Error Recovery

**Objective**: Validate system performance under stress and error conditions

### Setup
1. Performance monitoring tools (browser dev tools, server metrics)
2. Network simulation tools for latency/packet loss
3. Load testing capability for concurrent users

### Test Steps
1. **Latency Validation**
   - Measure gesture-to-audio response time
   - **Expected**: <200ms end-to-end latency
   - **Verify**: Performance monitoring confirms targets

2. **High Gesture Rate Testing**
   - Stream maximum gesture rate (60/second limit)
   - **Expected**: System handles rate without degradation
   - **Verify**: Rate limiting prevents server overload

3. **Network Interruption Recovery**
   - Simulate network disconnection and reconnection
   - **Expected**: Socket.io auto-reconnect with room state recovery
   - **Verify**: User rejoins room seamlessly

4. **Memory Constraint Testing**
   - Create multiple rooms with complex memory states
   - **Expected**: System maintains performance within memory limits
   - **Verify**: Room memory doesn't exceed allocated resources

### Success Criteria
- [ ] All constitutional performance targets met consistently
- [ ] Graceful degradation under network stress
- [ ] Automatic recovery from common error conditions
- [ ] Resource usage stays within defined constraints

## Automated Test Execution

### Puppeteer Integration Tests
```bash
# Run full integration test suite
npm run test:integration

# Run specific test scenarios
npm run test:integration -- --scenario=single-user
npm run test:integration -- --scenario=multi-user
npm run test:integration -- --scenario=memory-lifecycle
npm run test:integration -- --scenario=cross-platform
npm run test:integration -- --scenario=performance
```

### Manual Test Checklist
- [ ] All 5 test scenarios completed successfully
- [ ] Performance targets validated
- [ ] Error recovery confirmed
- [ ] Cross-platform compatibility verified
- [ ] Constitutional requirements met