# Research: Webarmonium Technical Decisions

## Frontend Technologies

### Canvas API for Visual Rendering
**Decision**: Use Canvas API for 60fps gesture visualization and real-time visual feedback
**Rationale**:
- Direct pixel manipulation for smooth gesture trails and visual effects
- High performance rendering without DOM overhead
- Essential for 60fps target performance requirement
- Native browser support across desktop and mobile
**Alternatives considered**:
- SVG (rejected: performance limitations at 60fps)
- WebGL (rejected: complexity overhead for 2D gesture visualization)

### Web Audio API + Tone.js for Sound Synthesis
**Decision**: Web Audio API as core with Tone.js library for higher-level audio synthesis
**Rationale**:
- Web Audio API provides <20ms latency capabilities (well under 200ms requirement)
- Tone.js simplifies oscillator management and effect chains
- Genre-agnostic synthesis supports algorithmic composition requirements
- Real-time parameter modulation essential for gesture-to-sound translation
**Alternatives considered**:
- Pure Web Audio API (rejected: development complexity for synthesis features)
- Howler.js (rejected: focused on playback, not real-time synthesis)

### Socket.io for Real-time Communication
**Decision**: Socket.io for bidirectional WebSocket communication
**Rationale**:
- Automatic fallback to long-polling for older browsers
- Built-in room management for collaborative features
- Event-based architecture matches gesture streaming requirements
- Proven reliability for sub-100ms latency targets
**Alternatives considered**:
- Native WebSockets (rejected: lacks room management and fallbacks)
- Server-Sent Events (rejected: unidirectional, doesn't support gesture input)

### Vanilla JavaScript for Performance
**Decision**: Vanilla ES2020+ JavaScript without heavy frameworks
**Rationale**:
- Maximum performance for 60fps Canvas rendering
- Minimal overhead for real-time audio processing
- Direct control over gesture event handling latency
- Avoids framework complexity for prototype-focused architecture
**Alternatives considered**:
- React (rejected: virtual DOM overhead conflicts with 60fps requirement)
- Vue.js (rejected: unnecessary abstraction for audio-visual performance application)

## Backend Technologies

### Node.js + Express Server
**Decision**: Node.js runtime with Express.js framework
**Rationale**:
- JavaScript consistency across frontend and backend
- Excellent WebSocket performance with Socket.io integration
- Non-blocking I/O ideal for real-time multi-user coordination
- Rich ecosystem for audio processing and memory management
**Alternatives considered**:
- Python + FastAPI (rejected: GIL limitations for concurrent audio processing)
- Go (rejected: JavaScript expertise and ecosystem advantages outweigh performance gains)

### Environmental Memory Architecture
**Decision**: Custom EnvironmentalMemoryCoordinator.js for pattern recognition and persistence
**Rationale**:
- Specialized for musical pattern learning and room personality development
- 24-hour memory retention requirement needs custom lifecycle management
- Real-time pattern influence on generative composition requires low-latency access
- Anonymous user model simplifies memory attribution without personal data
**Alternatives considered**:
- Redis (rejected: over-engineering for 24h memory with simple key-value needs)
- Database storage (rejected: unnecessary persistence complexity for temporary memory)

### Room Management System
**Decision**: Sequential room assignment with in-memory user tracking
**Rationale**:
- 5-10 user limit per room enables simple in-memory state management
- Anonymous access model eliminates user authentication complexity
- Real-time performance prioritized over persistent user data
- Room lifecycle (24h memory retention) matches memory management needs
**Alternatives considered**:
- Database-backed rooms (rejected: unnecessary persistence for anonymous temporary rooms)
- Hash-based room IDs (rejected: sequential assignment simpler for prototype phase)

## Testing Strategy

### Puppeteer for Multi-Browser Automation
**Decision**: Puppeteer for automated cross-browser testing
**Rationale**:
- Essential for testing gesture input across desktop and mobile browsers
- Can simulate multi-user scenarios for collaborative testing
- Performance timing validation for <200ms audio latency requirements
- Canvas and Web Audio API testing capabilities
**Alternatives considered**:
- Selenium (rejected: Puppeteer has better modern browser API support)
- Playwright (rejected: Puppeteer sufficient for Chrome/Firefox testing requirements)

### Manual Testing Protocols
**Decision**: Structured manual testing for user experience validation
**Rationale**:
- Audio quality and latency subjective validation requires human testing
- Gesture responsiveness and "feel" cannot be fully automated
- Multi-device testing (desktop mouse + mobile touch/gyroscope) needs manual coordination
- Collaborative interaction testing requires multiple simultaneous human users
**Alternatives considered**:
- Pure automated testing (rejected: audio and gesture UX requires human validation)

## Performance Validation

### WebSocket Latency Monitoring
**Decision**: Built-in latency measurement for <100ms WebSocket target
**Rationale**:
- Critical for maintaining <200ms audio feedback requirement
- Real-time monitoring enables performance regression detection
- Essential for collaborative experience quality assurance
- Automated alerts for constitutional performance violations
**Alternatives considered**:
- External monitoring tools (rejected: built-in measurement provides more accurate real-time data)

All research findings support constitutional requirements for clean architecture, TDD approach, performance-by-design, and user experience consistency.