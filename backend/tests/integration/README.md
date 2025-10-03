# Integration Tests

End-to-end integration tests for Multi-User Canvas Interaction feature using Puppeteer.

## Prerequisites

- **Node.js 18+**
- **Puppeteer 21+** (auto-installs Chromium)
- **Backend server** running on port 3001
- **Frontend server** running on port 3000

## Setup

```bash
# Install dependencies
cd backend && npm install
cd frontend && npm install

# Puppeteer will auto-download Chromium on first install
```

## Running Tests

### Start Servers

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev
```

### Run Integration Tests

```bash
# Terminal 3: Run all integration tests
cd backend
npm run test:integration

# Run specific test file
npm run test:integration -- multi-user-drawing.test.js

# Run specific test by name
npm run test:integration -- --testNamePattern="Multi-user drawing"

# Run with verbose output
npm run test:integration -- --verbose

# Run with coverage
npm run test:coverage
```

## Test Suites

### 1. Multi-User Drawing Synchronization
**File:** `multi-user-drawing.test.js`
**Validates:**
- 4 users can draw simultaneously
- Strokes sync across all users within 1000ms
- Colors match assigned user colors
- Stroke coordinates are accurate

### 2. Cursor Position Synchronization
**File:** `cursor-sync.test.js`
**Validates:**
- Cursor positions sync between users
- 60Hz update rate (~60 updates per second)
- <100ms latency for cursor updates
- isDrawing state updates correctly

### 3. Audio Feedback
**File:** `audio-feedback.test.js`
**Validates:**
- Sound effects play on remote drawing
- Frequency correlates with user color (200-800Hz)
- Mute/volume controls work correctly

### 4. Latency and Performance
**File:** `latency-performance.test.js`
**Validates:**
- p95 latency <1500ms with 10 concurrent users (end-to-end)
- p50 latency <800ms (includes Puppeteer overhead)
- No dropped events under normal load
- Concurrent drawing from multiple users

### 5. User Presence Notifications
**File:** `user-presence.test.js`
**Validates:**
- user-joined/user-left events
- Color uniqueness across users
- Color pool recycling when users leave

### 6. Room Capacity Enforcement
**File:** `room-capacity.test.js`
**Validates:**
- Max 10 users per room
- 11th user receives room-full error
- User can join after one leaves

### 7. Late Joiner History
**File:** `late-joiner-history.test.js`
**Validates:**
- Late joiners receive complete drawing history
- History contains all previous strokes
- Strokes rendered with correct colors
- History ordered by timestamp

## Debugging

### View Browser Windows

Edit `puppeteer-helpers.js` line 16:

```javascript
const defaultOptions = {
  headless: false, // Change to false to see browser windows
  // ...
}
```

### Enable Verbose Logging

```bash
DEBUG=puppeteer:* npm run test:integration
```

### Check Browser Console

Test output includes browser console logs:
```
[Browser 1] 🏠 Joined room: main-room
[Browser 2] ✏️ Draw started: stroke-123
```

### Adjust Timeouts

If tests fail due to timing issues (CI environments), increase timeouts in test files:

```javascript
// Increase test timeout from 15s to 30s
test('My test', async () => {
  // ...
}, 30000) // 30 seconds
```

## Troubleshooting

### Error: "Cannot find module 'puppeteer'"

```bash
cd backend
npm install puppeteer --save-dev
```

### Error: "connect ECONNREFUSED localhost:3001"

Backend server not running. Start with:
```bash
cd backend && npm run dev
```

### Error: "Navigation timeout of 30000 ms exceeded"

Frontend server not running. Start with:
```bash
cd frontend && npm run dev
```

### Tests are Flaky

Common causes:
1. **Network latency**: Increase `waitFor()` timeouts
2. **Slow CI**: Use `headless: 'new'` mode (faster than headed)
3. **Race conditions**: Add explicit waits for events

Example fix:
```javascript
// Before (flaky)
await drawStroke(user, points)
const stroke = await waitForStroke(otherUser, 1000) // Too tight!

// After (stable)
await drawStroke(user, points)
const stroke = await waitForStroke(otherUser, 2000) // More buffer
```

## Performance Benchmarks

| Metric | Target | Measured In |
|--------|--------|-------------|
| Stroke sync latency (p95) | <1500ms | End-to-end (Puppeteer + network + render) |
| Cursor update latency (p50) | <100ms | Timestamp diff between emit/receive |
| Room join latency | <500ms | Time from connect to room-joined |
| Canvas render FPS | 60fps | requestAnimationFrame timing |

**Note:** End-to-end latency includes Puppeteer overhead (~300-500ms), so targets are relaxed from constitutional <200ms API handler requirement.

## CI/CD Integration

### GitHub Actions Example

```yaml
# .github/workflows/integration-tests.yml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: |
          cd backend && npm ci
          cd ../frontend && npm ci

      - name: Start backend
        run: cd backend && npm run dev &

      - name: Start frontend
        run: cd frontend && npm run dev &

      - name: Wait for servers
        run: sleep 5

      - name: Run integration tests
        run: cd backend && npm run test:integration
```

## Writing New Tests

### Template

```javascript
const {
  launchBrowsers,
  closeBrowsers,
  loadApp,
  joinRoom,
  // ... other helpers
} = require('../helpers/puppeteer-helpers')

describe('My Feature Test', () => {
  let browsers
  let user1, user2

  beforeAll(async () => {
    browsers = await launchBrowsers(2)
    ;[user1, user2] = browsers
    await Promise.all(browsers.map(b => loadApp(b)))
  }, 30000)

  afterAll(async () => {
    await closeBrowsers(browsers)
  }, 10000)

  test('My test case', async () => {
    await joinRoom(user1, 'test-room')
    await joinRoom(user2, 'test-room')

    // Your test logic here

    expect(something).toBe(expected)
  }, 15000)
})
```

## Helper Functions

See `puppeteer-helpers.js` for available utilities:

- `launchBrowsers(count)` - Launch N Puppeteer instances
- `loadApp(browser)` - Navigate to app and wait for load
- `joinRoom(browser, roomId)` - Join a room
- `drawStroke(browser, points, options)` - Draw a stroke
- `drawCircle(browser, {x, y, radius})` - Draw a circle
- `waitForStroke(browser)` - Wait for draw-stroke event
- `waitForEvent(browser, eventName)` - Wait for any socket event
- `getAssignedColor(browser)` - Get user's assigned color
- `getUserId(browser)` - Get user's socket ID
- `percentile(values, p)` - Calculate percentile

## Support

For issues or questions:
1. Check this README
2. Review test output and browser console logs
3. Enable headless: false to see browser UI
4. Check backend/frontend server logs
5. Open issue on GitHub
