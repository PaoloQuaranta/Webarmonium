# Webarmonium

**Real-time generative music from internet activity**

Webarmonium transforms live data streams into music and enables collaborative music creation through gestures. No account needed, completely free.

**Live:** [webarmonium.net](https://webarmonium.net)

---

## What It Does

### Landing Page: The Internet Is Playing Music

The landing page connects to three real-time data sources:

| Source | Musical Role | Data Stream |
|--------|-------------|-------------|
| **Wikipedia** | Bass frequencies | Recent Changes API (EventSource) |
| **HackerNews** | Melodic phrases | New stories endpoint |
| **GitHub** | Percussive accents | Public events API |

Every event maps to musical parameters:
- **X position** → frequency (220-880 Hz)
- **Y position** → harmonics and amplitude
- **Source** → instrument timbre

The composition is fully deterministic—same input data produces the same music.

### Collaborative Rooms: Make Music Together

Up to 4 people can create music simultaneously through gestures:

| Gesture | Musical Result |
|---------|---------------|
| **Tap** | Percussive notes |
| **Hold** | Sustained tones |
| **Drag** | Melodic phrases |

Rooms develop **environmental memory**—they learn from interaction patterns and evolve their sonic personality over 24 hours.

---

## Tech Stack

### Frontend
- **Vanilla JavaScript** — no frameworks, no build step
- **Tone.js** v14.7.77 — Web Audio synthesis
- **Socket.io Client** v4.7.5 — real-time communication
- **p5.js** — physics-based visualizations
- **Canvas API** — 60fps gesture rendering

### Backend
- **Node.js** 18+ with Express
- **Socket.io** v4.7.5 — WebSocket server
- **UUID** v9.0.1 — anonymous session management

### Performance Targets
- **<200ms** gesture-to-sound latency
- **<100ms** WebSocket round-trip
- **60fps** canvas rendering
- **24-hour** memory retention with automatic cleanup

---

## Quick Start

### Prerequisites
- Node.js 18+
- Modern browser with Web Audio API support

### Development

```bash
# Clone repository
git clone https://github.com/PaoloQuaranta/Webarmonium.git
cd webarmonium

# Start backend (port 3001)
cd backend
npm install
npm run dev

# Start frontend (port 3000) - in another terminal
cd frontend
npm install
npm start

# Open http://localhost:3000
```

### Production

```bash
# Backend
cd backend
npm install --production
npm start

# Frontend (no build step needed)
cd frontend
npm start
```

---

## Architecture

```
webarmonium/
├── frontend/
│   └── src/
│       ├── main.js                    # Entry point (WebarmoniumApp class)
│       ├── services/
│       │   ├── audio/
│       │   │   ├── AudioService.js    # Three-tier audio system
│       │   │   ├── GenerativeMusicEngine.js
│       │   │   └── CompositionPlayer.js
│       │   ├── gesture/
│       │   │   └── EnhancedGestureCapture.js
│       │   ├── visual/
│       │   │   ├── SpringMeshNetwork.js   # Physics-based visualization
│       │   │   └── ParticleFlowManager.js
│       │   └── SocketService.js       # WebSocket client
│       └── landing/
│           ├── DashboardUI.js         # Metrics visualization
│           └── MetricsCollectorService.js
│
├── backend/
│   └── src/
│       ├── server.js                  # Express + Socket.io
│       ├── services/
│       │   ├── RoomManager.js         # Room lifecycle
│       │   ├── CompositionEngine.js   # Algorithmic composition
│       │   ├── HarmonicEngine.js      # Progressions, voice leading
│       │   ├── BackgroundCompositionService.js
│       │   ├── EnvironmentalMemoryCoordinator.js
│       │   ├── VirtualUserService.js  # Simulated users from web data
│       │   └── WebMetricsPoller.js    # Wikipedia/HN/GitHub polling
│       ├── models/
│       │   ├── Room.js, User.js, Gesture.js
│       │   └── SoundPattern.js, MemoryState.js
│       └── api/
│           └── handlers/              # Socket event handlers
│
└── docs/
    ├── deployment.md
    └── marketing-launch.md
```

### Three-Tier Audio System

1. **Background Layer** — ambient algorithmic music from CompositionEngine
2. **Remote Layer** — other users' musical contributions
3. **Local Layer** — your own gesture-generated sounds

### Composition Engine

The backend generates music using:
- **Form structures** — ABA, rondo, sonata, verse-chorus
- **13 scale types** — ionian, dorian, phrygian, lydian, mixolydian, etc.
- **Voice leading** — smooth transitions between chords
- **Material library** — organized by harmonic function and character
- **Phrase morphology** — gesture contours to melodic phrases

---

## API

### WebSocket Events

**Join Room**
```javascript
socket.emit('join-room', { roomId: 'my-room' }, (response) => {
  console.log('Joined:', response.room)
})
```

**Send Gesture**
```javascript
socket.emit('gesture', {
  type: 'touch',
  coordinates: { x: 0.5, y: 0.7 },
  intensity: 0.8,
  timestamp: Date.now()
})
```

**Receive Updates**
```javascript
socket.on('composition-update', (composition) => {
  // New algorithmic composition from backend
})

socket.on('cursor-position', (data) => {
  // Other user's cursor position
})
```

### REST Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/rooms` | List active rooms |
| `GET /api/metrics` | Performance metrics |

---

## Testing

```bash
cd backend

# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Test categories:
- **Unit tests** — individual services
- **Integration tests** — multi-user scenarios
- **Performance tests** — latency validation

---

## Deployment

See [docs/deployment.md](docs/deployment.md) for complete deployment guide.

### Quick Deploy (DigitalOcean)

```bash
# On server
git clone https://github.com/PaoloQuaranta/Webarmonium.git
cd webarmonium

# Backend with PM2
cd backend
npm install --production
pm2 start src/server.js --name webarmonium-backend

# Frontend with nginx
cd ../frontend
# Configure nginx to serve static files on port 80/443
```

### Environment Variables

**Backend**
```bash
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://webarmonium.net
```

---

## Privacy

- **Anonymous sessions** — no accounts, no personal data
- **Session-only IDs** — temporary, not tracked
- **24-hour cleanup** — all room data automatically expires
- **No persistent storage** — gestures are not permanently stored

---

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Write tests first (TDD required)
4. Ensure 90%+ code coverage
5. Submit pull request

### Code Quality

```bash
# Lint
npm run lint

# Fix lint issues
npm run lint:fix
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Credits

Built by Paolo and Patrick.

**Dependencies:**
- [Tone.js](https://tonejs.github.io/) — Web Audio synthesis
- [Socket.io](https://socket.io/) — real-time communication
- [p5.js](https://p5js.org/) — creative coding library

---

**Live at [webarmonium.net](https://webarmonium.net)**
