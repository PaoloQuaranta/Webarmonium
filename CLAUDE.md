# CLAUDE.md

Webarmonium is a real-time collaborative music platform that transforms gestures into algorithmic music. This file provides essential orientation for working with the codebase.

## Project Overview

Webarmonium enables multiple users to create music together through intuitive gestures on a shared canvas. The platform uses advanced gesture recognition, algorithmic music generation, and real-time synchronization to create an immersive collaborative experience.

### Core Architecture

**Three-Tier System:**
- **Frontend**: Vanilla JavaScript + Canvas + Web Audio API
- **Backend**: Node.js + Express + Socket.io
- **Audio Engine**: Tone.js + Web Audio API integration

**Key Features:**
- Real-time multi-user collaboration (5-10 users per room)
- Gesture-to-music transformation with 6 generative algorithms
- 60fps canvas rendering with cursor synchronization
- Environmental memory for pattern learning (24-hour retention)
- Cross-platform support (mouse, touch, gyroscope)

## Development Environment Setup

### Prerequisites
- **Node.js 18+** (use Node 20 for MCP support)
- Modern browser with Web Audio API support

### Quick Start
```bash
# Backend (port 3001)
cd backend
npm install
npm run dev  # Development with nodemon
# or
npm start    # Production

# Frontend (port 3000)
cd frontend
npm install
npm start    # HTTP server for development

# Access application
http://localhost:3000
```

### Testing
```bash
# Run all tests
cd backend && npm test

# Coverage report
cd backend && npm run test:coverage

# Integration tests (specific scenarios)
NODE_ENV=test npm test -- tests/integration/multiuser-sync.test.js
```

## Codebase Structure

### Frontend (`/frontend/src/`)

**Entry Point:** `main.js` → `WebarmoniumApp` class

**Core Services:**
- `AudioService.js` - Web Audio API + Tone.js integration, three-tier audio system
- `EnhancedGestureCapture.js` - Advanced gesture classification and musical mapping
- `SocketService.js` - WebSocket client communication with retry logic
- `CursorManager.js` - Multi-user cursor rendering and position tracking
- `DrawingRenderer.js` - Collaborative drawing canvas with stroke synchronization

**Key Patterns:**
- Canvas-based 60fps rendering loop
- Event-driven architecture with service communication
- Modular service design with dependency injection
- Cross-platform input normalization

### Backend (`/backend/src/`)

**Entry Point:** `server.js` → Express server + Socket.io

**Core Services:**
- `RoomManager.js` - Room lifecycle, user capacity, and session management
- `GestureProcessor.js` - Gesture validation and classification
- `SoundPatternGenerator.js` - Algorithmic music generation (6 algorithms)
- `EnvironmentalMemoryCoordinator.js` - Pattern learning and evolution
- `HoverOrchestrator.js` - Cross-layer audio modulation
- `DrawingSyncService.js` - Real-time drawing synchronization
- `ColorAssignmentService.js` - Multi-user color assignment

**Data Models:**
- `Room.js` - Room state and capacity management
- `User.js` - Anonymous user sessions
- `Gesture.js` - Gesture validation and processing
- `SoundPattern.js` - Musical pattern definitions
- `MemoryState.js` - Environmental learning memory
- `CursorPosition.js` - Multi-user cursor tracking
- `DrawingStroke.js` - Collaborative drawing data

### API Architecture

**WebSocket Events** (see `api/socketHandlers.js`):
- `user:join` / `user:leave` - Room management
- `gesture:start` / `gesture:end` - Gesture processing
- `cursor:move` - Cursor synchronization
- `drawing:start` / `drawing:stroke` / `drawing:end` - Canvas drawing
- `room:state` - Room state synchronization

**Performance Requirements:**
- API endpoints: <200ms p95 response time
- UI interactions: <100ms response time
- WebSocket latency: <100ms
- Memory usage: <100MB baseline, <500MB peak

## Key Technologies

### Frontend Stack
- **Web Audio API** - Low-level audio synthesis
- **Tone.js v14.7.77** - Music synthesis framework
- **Socket.io Client v4.7.5** - Real-time communication
- **Canvas API** - High-performance rendering
- **Vanilla JavaScript** - No framework dependencies

### Backend Stack
- **Node.js 18+** - Runtime environment
- **Express.js** - REST API framework
- **Socket.io v4.7.5** - Real-time bidirectional communication
- **UUID v4** - Anonymous session management
- **Rate Limiting** - Security and performance protection

## Development Patterns

### Audio System
The three-tier audio architecture handles:
1. **Background Layer** - Ambient algorithmic music
2. **Remote Layer** - Other users' musical contributions
3. **Local Layer** - User's own gesture-generated audio

### Gesture Processing Pipeline
```
Input (Mouse/Touch/Gyro) → EnhancedGestureCapture →
Classification → Musical Mapping → SocketService →
Backend Processing → Sound Generation → Audio Output
```

### Multi-user Synchronization
- Real-time cursor position sharing
- Collaborative drawing with stroke synchronization
- Color-based user identification
- Room state management with capacity limits

### Algorithmic Music Generation
Six generative algorithms:
1. **Cellular Automata** - Rule-based pattern evolution
2. **Fractals** - Recursive geometric patterns
3. **Markov Chains** - Probabilistic sequence generation
4. **Neural Networks** - Learned pattern recognition
5. **Fibonacci Sequences** - Mathematical proportion patterns
6. **Chaos Theory** - Deterministic chaos patterns

## Common Development Tasks

### Adding New Gesture Types
1. Extend `EnhancedGestureCapture.js` classification logic
2. Update `Gesture.js` model with new gesture properties
3. Add musical mapping in `GestureToMusicService.js`
4. Update frontend gesture event handlers

### Implementing New Audio Features
1. Modify `AudioService.js` three-tier system
2. Update backend sound generation algorithms
3. Add WebSocket events for new audio parameters
4. Test audio latency and performance

### Adding Multi-user Features
1. Extend room management in `RoomManager.js`
2. Add synchronization events in `socketHandlers.js`
3. Update frontend state management for new features
4. Test multi-user scenarios and performance

### Performance Optimization
- Monitor WebSocket latency (<100ms requirement)
- Track canvas rendering performance (60fps target)
- Profile memory usage (24-hour data retention)
- Test concurrent user capacity (5-10 users per room)

## Testing Strategy

### Test Categories
- **Unit Tests**: Individual service and component testing
- **Integration Tests**: Multi-user collaboration scenarios
- **Performance Tests**: Latency and throughput validation
- **Contract Tests**: WebSocket API compliance

### Key Test Files
- `tests/integration/multiuser-sync.test.js` - Multi-user collaboration
- `tests/contract/socket-*.test.js` - WebSocket API contracts
- `tests/integration/pattern-integration.test.js` - Algorithm performance

### Running Tests
```bash
# All tests
npm test

# Specific integration scenarios
NODE_ENV=test npm test -- tests/integration/multiuser-sync.test.js

# Performance testing
NODE_ENV=test npm test -- tests/integration/test_performance.test.js
```

## Code Quality Standards

### Constitutional Requirements
- **Test-Driven Development**: Tests written before implementation
- **90%+ Code Coverage**: Comprehensive test coverage required
- **Clean Architecture**: Single responsibility, no duplication
- **Performance Gates**: Latency and memory requirements enforced

### ESLint Configuration
- Standard JavaScript style guide
- No console.log in production code
- Prefer const/let over var
- Consistent error handling patterns

## Debugging & Monitoring

### Common Issues
- **Audio Context**: Requires user interaction for browser autoplay
- **WebSocket Connection**: Check CORS configuration and port availability
- **Canvas Performance**: Monitor 60fps rendering under load
- **Memory Management**: 24-hour automatic cleanup processes

### Debug Tools
- Chrome DevTools for audio context and Web Audio API
- WebSocket debugging in browser Network tab
- Performance profiling for canvas rendering
- Backend logging for room and gesture processing

## Environment Configuration

### Development Ports
- Frontend: 3000 (HTTP server)
- Backend: 3001 (Express + Socket.io)

### Production Considerations
- Rate limiting enabled
- CORS properly configured
- Error handling and logging
- Memory cleanup processes
- Performance monitoring

This file provides the essential information needed to understand and work with the Webarmonium codebase effectively.