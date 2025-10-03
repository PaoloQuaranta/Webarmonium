# Quickstart: Multi-User Canvas Integration Tests

**Feature**: Multi-User Canvas Interaction
**Purpose**: End-to-end validation of user stories from spec.md
**Test Environment**: Puppeteer E2E tests (10 concurrent browser instances)

## Prerequisites

```bash
# Install dependencies (if not already installed)
cd backend && npm install
cd frontend && npm install

# Start backend server
cd backend && npm run dev  # Port 3001

# Start frontend server
cd frontend && npm run dev  # Port 3000

# Run tests
npm run test:integration
```

## Test Scenarios

### Scenario 1: Multi-User Drawing Synchronization

**Maps to**: Acceptance Scenario #1 from spec.md
> Given a user opens a canvas with 3 other active users, When another user draws a stroke, Then the first user sees the stroke appear in real-time with the drawing user's assigned color

**Test Steps**:
1. Open 4 browser instances (User A, B, C, D)
2. All users join same room (`test-room-001`)
3. User A draws a circle (red stroke, strokeWidth=2)
4. Verify User B, C, D see circle appear within 1000ms
5. Verify stroke color matches User A's assigned color
6. Verify stroke rendered at correct coordinates

**Expected Behavior**:
- User A assigned color #1 (red)
- Users B, C, D assigned colors #2, #3, #4
- All users receive `draw-stroke` event within 1000ms
- Canvas renders stroke with correct color and path
- No stroke duplication or missing points

**Test Code**:
```javascript
// backend/tests/integration/multi-user-drawing.test.js
test('Multi-user drawing synchronization', async () => {
  const browsers = await launchBrowsers(4);
  const [userA, userB, userC, userD] = browsers;

  await joinRoom(userA, 'test-room-001');
  await joinRoom(userB, 'test-room-001');
  await joinRoom(userC, 'test-room-001');
  await joinRoom(userD, 'test-room-001');

  const startTime = Date.now();
  await drawCircle(userA, {x: 200, y: 200, radius: 50});

  const [strokeB, strokeC, strokeD] = await Promise.all([
    waitForStroke(userB),
    waitForStroke(userC),
    waitForStroke(userD)
  ]);

  const latency = Date.now() - startTime;
  expect(latency).toBeLessThan(1000);

  expect(strokeB.color).toBe(await getAssignedColor(userA));
  expect(strokeC.points.length).toBeGreaterThan(10);
  expect(strokeD.userId).toBe(await getUserId(userA));
});
```

### Scenario 2: Cursor Position Synchronization

**Maps to**: Acceptance Scenario #2 from spec.md
> Given two users are on the same canvas, When User A moves their cursor, Then User B sees User A's colored cursor position update in real-time

**Test Steps**:
1. Open 2 browser instances (User A, User B)
2. Both join same room (`test-room-002`)
3. User A moves cursor in circular motion (60 updates)
4. Verify User B receives cursor-position events at ~60Hz
5. Verify cursor color matches User A's assigned color
6. Verify cursor coordinates accurate within ±5 pixels

**Expected Behavior**:
- User B receives 60 cursor updates in ~1 second
- Cursor rendered with User A's assigned color
- Latency <100ms for cursor updates
- Smooth cursor trail (no jitter or large gaps)

**Test Code**:
```javascript
test('Cursor position synchronization', async () => {
  const [userA, userB] = await launchBrowsers(2);

  await joinRoom(userA, 'test-room-002');
  await joinRoom(userB, 'test-room-002');

  const cursorUpdates = [];
  await listenForCursors(userB, (cursor) => cursorUpdates.push(cursor));

  const path = generateCirclePath({x: 300, y: 300, radius: 100, points: 60});
  await moveCursor(userA, path, {duration: 1000});

  await waitFor(1100); // Allow for network latency

  expect(cursorUpdates.length).toBeGreaterThanOrEqual(55); // Allow 5 drops
  expect(cursorUpdates[0].color).toBe(await getAssignedColor(userA));

  const avgLatency = calculateAvgLatency(cursorUpdates);
  expect(avgLatency).toBeLessThan(100);
});
```

### Scenario 3: Audio Feedback on Drawing

**Maps to**: Acceptance Scenario #3 from spec.md
> Given a user joins a canvas session, When they join, Then they can hear sound effects from other users' drawing actions

**Test Steps**:
1. User A joins room and starts drawing
2. User B joins room (receives drawing-history)
3. User A continues drawing (new strokes)
4. Verify User B's audio context plays sound effects
5. Verify sound frequency correlates with User A's color
6. Verify mute/volume controls work

**Expected Behavior**:
- User B hears "draw-start" sound when User A begins stroke
- Sound frequency based on color index (200-800Hz range)
- User B can mute audio without affecting visual rendering
- Volume control adjusts playback level (0-100%)

**Test Code**:
```javascript
test('Audio feedback for remote drawing', async () => {
  const [userA, userB] = await launchBrowsers(2);

  await joinRoom(userA, 'test-room-003');
  await joinRoom(userB, 'test-room-003');

  const audioEvents = [];
  await interceptAudio(userB, (event) => audioEvents.push(event));

  await drawStroke(userA, [{x: 100, y: 100}, {x: 200, y: 200}]);
  await waitFor(200);

  expect(audioEvents).toContainEqual(
    expect.objectContaining({
      type: 'draw-start',
      frequency: expect.any(Number),
      duration: 50
    })
  );

  await setMute(userB, true);
  await drawStroke(userA, [{x: 300, y: 300}, {x: 400, y: 400}]);
  await waitFor(200);

  expect(audioEvents.length).toBe(1); // No new sounds when muted
});
```

### Scenario 4: Latency Performance Validation

**Maps to**: Acceptance Scenario #4 from spec.md
> Given multiple users are drawing on the canvas, When a user makes a drawing stroke, Then other users see the stroke and hear sound effects within 1 second

**Test Steps**:
1. Open 10 browser instances (max capacity)
2. All join same room
3. User 1 draws stroke
4. Measure time until all 9 other users receive stroke
5. Verify p95 latency <1000ms
6. Verify no dropped events

**Expected Behavior**:
- All 9 users receive `draw-stroke` event
- p95 latency <1000ms (95th percentile)
- p50 latency <500ms (median)
- Zero packet loss under normal conditions

**Test Code**:
```javascript
test('Latency under max load (10 users)', async () => {
  const browsers = await launchBrowsers(10);
  const users = browsers.map((b, i) => ({browser: b, id: i}));

  await Promise.all(users.map(u => joinRoom(u.browser, 'test-room-004')));

  const latencies = [];

  for (let i = 0; i < 100; i++) {
    const drawingUser = users[i % 10];
    const startTime = Date.now();

    await drawStroke(drawingUser.browser, randomPath());

    const receiveTimes = await Promise.all(
      users.filter(u => u.id !== drawingUser.id)
        .map(u => waitForStroke(u.browser).then(() => Date.now()))
    );

    receiveTimes.forEach(t => latencies.push(t - startTime));
  }

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);

  expect(p50).toBeLessThan(500);
  expect(p95).toBeLessThan(1000);

  console.log({p50, p95, p99, count: latencies.length});
});
```

### Scenario 5: User Presence Notifications

**Maps to**: Acceptance Scenario #5 from spec.md
> Given a user is alone on a canvas, When another user joins, Then both users are notified of each other's presence

**Test Steps**:
1. User A joins room (receives empty user list)
2. User B joins room
3. Verify User A receives `user-joined` event
4. Verify User B receives user list with User A
5. Verify both users have unique colors
6. User B leaves room
7. Verify User A receives `user-left` event

**Expected Behavior**:
- User A receives `user-joined` with User B's color
- User B receives `room-joined` with User A in list
- Colors are unique (no duplicates)
- `user-left` event sent when User B disconnects
- User B's color returned to pool

**Test Code**:
```javascript
test('User presence notifications', async () => {
  const [userA, userB] = await launchBrowsers(2);

  await joinRoom(userA, 'test-room-005');
  const joinedA = await getRoomState(userA);
  expect(joinedA.users).toHaveLength(1);

  const presencePromise = waitForEvent(userA, 'user-joined');
  await joinRoom(userB, 'test-room-005');

  const joinedEvent = await presencePromise;
  expect(joinedEvent.userId).toBe(await getUserId(userB));
  expect(joinedEvent.color).toMatch(/^#[0-9a-f]{6}$/);

  const roomStateA = await getRoomState(userA);
  const roomStateB = await getRoomState(userB);

  expect(roomStateA.users).toHaveLength(2);
  expect(roomStateB.users).toHaveLength(2);
  expect(roomStateA.users[0].color).not.toBe(roomStateA.users[1].color);

  const leftPromise = waitForEvent(userA, 'user-left');
  await disconnect(userB);

  const leftEvent = await leftPromise;
  expect(leftEvent.userId).toBe(await getUserId(userB));
});
```

### Scenario 6: Room Capacity Enforcement

**Maps to**: Edge Case from spec.md
> What happens when an 11th user attempts to join a canvas with 10 active users?

**Test Steps**:
1. Open 10 browser instances
2. All join same room (fills capacity)
3. Open 11th browser instance
4. Attempt to join same room
5. Verify 11th user receives `room-full` error
6. Verify 11th user not added to room
7. One user leaves, 11th user retries → success

**Expected Behavior**:
- First 10 users join successfully
- 11th user receives `room-full` error event
- Error message: "Room is full (max 10 users)"
- After one user leaves, 11th user can join
- Color pool managed correctly

**Test Code**:
```javascript
test('Room capacity enforcement', async () => {
  const browsers = await launchBrowsers(11);
  const first10 = browsers.slice(0, 10);
  const user11 = browsers[10];

  await Promise.all(first10.map(b => joinRoom(b, 'test-room-006')));

  const errorPromise = waitForEvent(user11, 'room-full');
  await attemptJoinRoom(user11, 'test-room-006');

  const error = await errorPromise;
  expect(error.error).toBe('Room is full (max 10 users)');

  await disconnect(first10[0]);
  await waitFor(100);

  await joinRoom(user11, 'test-room-006'); // Should succeed
  const roomState = await getRoomState(user11);
  expect(roomState.users).toHaveLength(10);
});
```

### Scenario 7: Late Joiner Receives History

**Maps to**: Edge Case from spec.md
> How are historical drawing strokes handled (do late joiners see previous drawings)?

**Test Steps**:
1. User A joins room, draws 20 strokes
2. User B joins room
3. Verify User B receives `drawing-history` event
4. Verify history contains all 20 strokes
5. Verify User B's canvas renders historical strokes
6. Verify strokes colored by original user's color

**Expected Behavior**:
- User B receives complete stroke history on join
- History contains correct stroke order (by timestamp)
- All 20 strokes rendered with original colors
- New strokes append to history (not replace)

**Test Code**:
```javascript
test('Late joiner receives stroke history', async () => {
  const [userA, userB] = await launchBrowsers(2);

  await joinRoom(userA, 'test-room-007');

  const strokes = [];
  for (let i = 0; i < 20; i++) {
    strokes.push(await drawStroke(userA, randomPath()));
  }

  const historyPromise = waitForEvent(userB, 'drawing-history');
  await joinRoom(userB, 'test-room-007');

  const history = await historyPromise;
  expect(history.strokes).toHaveLength(20);

  const canvasState = await getCanvasStrokes(userB);
  expect(canvasState).toHaveLength(20);

  expect(history.strokes[0].id).toBe(strokes[0].id);
  expect(history.strokes[19].color).toBe(await getAssignedColor(userA));
});
```

## Performance Benchmarks

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Stroke sync latency (p95) | <1000ms | Timestamp diff between emit/receive |
| Cursor update latency (p50) | <100ms | Timestamp diff between emit/receive |
| Room join latency | <500ms | Time from connect to room-joined |
| Memory per room | <1MB | Node.js heap snapshot |
| Concurrent users | 10 | Successful connection count |
| Canvas render FPS | 60fps | requestAnimationFrame timing |
| Audio playback latency | <50ms | Web Audio Context timing |

## Test Utilities

**Helper Functions** (located in `tests/helpers/`):
- `launchBrowsers(count)`: Launch N Puppeteer instances
- `joinRoom(browser, roomId)`: Connect to Socket.IO and join room
- `drawStroke(browser, points)`: Simulate drawing stroke
- `waitForStroke(browser)`: Wait for `draw-stroke` event
- `getAssignedColor(browser)`: Get user's assigned color
- `moveCursor(browser, path, opts)`: Simulate cursor movement
- `setMute(browser, muted)`: Toggle audio mute
- `waitForEvent(browser, eventName)`: Promise-based event listener
- `calculateAvgLatency(events)`: Compute average latency
- `percentile(values, p)`: Calculate percentile

## Running Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific scenario
npm run test:integration -- --testNamePattern="Multi-user drawing"

# Run with performance profiling
npm run test:integration -- --verbose --detectOpenHandles

# Generate coverage report
npm run test:coverage
```

## Success Criteria

All 7 scenarios must pass with:
- Zero test failures
- p95 latency <1000ms
- p50 cursor latency <100ms
- 90%+ code coverage
- No memory leaks (heap stable after 1000 strokes)

## Constitutional Compliance

- **TDD**: Integration tests written before implementation
- **90%+ Coverage**: Jest coverage enforced
- **Performance**: Latency validated against constitution (<200ms API, <100ms UI)
- **User Scenarios**: All acceptance scenarios from spec.md validated
