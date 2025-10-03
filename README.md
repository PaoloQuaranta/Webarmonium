# 🎵 Webarmonium

**Collaborative Generative Music Ecosystem**

Webarmonium is a real-time collaborative platform where users control generative music through intuitive gestures across devices. Built with constitutional principles ensuring performance, privacy, and musical innovation.

![Webarmonium Demo](docs/images/webarmonium-demo.gif)

## ✨ Features

### 🎹 **Generative Music Engine**
- **6 Algorithmic Composers**: Cellular Automata, Fractals, Markov Chains, Neural Networks, Fibonacci Sequences, Chaos Theory
- **Genre-Agnostic Generation**: Creates music spanning classical, electronic, ambient, and experimental styles
- **Real-Time Evolution**: Sound patterns adapt and evolve based on user interactions
- **Environmental Memory**: Rooms develop unique sonic personalities over 24 hours

### 🤝 **Collaborative Experience**
- **Anonymous Sessions**: No accounts required - instant participation
- **5-10 User Rooms**: Constitutional capacity limits for optimal collaboration
- **Cross-Platform Gestures**: Mouse, touch, and gyroscope input normalization
- **Real-Time Synchronization**: <100ms WebSocket latency for seamless interaction

### 🎨 **Intuitive Controls**
- **Visual Canvas**: 60fps gesture capture with multi-touch support
- **Gesture-to-Sound Mapping**: X/Y coordinates → frequency/amplitude, intensity → dynamics
- **Device Adaptation**: Automatic calibration for desktop, mobile, and tablet
- **Visual Feedback**: Real-time trail rendering for gesture visualization

### ⚡ **Performance Excellence**
- **<200ms Audio Latency**: Constitutional requirement for gesture-to-sound response
- **60fps Rendering**: Smooth visual feedback on all devices
- **<100ms WebSocket**: Real-time synchronization between collaborators
- **Memory Management**: Automatic cleanup with 24-hour retention limits

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+
- **NPM** 8+
- Modern browser with Web Audio API support

### Installation

```bash
# Clone repository
git clone https://github.com/your-org/webarmonium.git
cd webarmonium

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Development Setup

```bash
# Terminal 1: Start backend server
cd backend
npm run dev

# Terminal 2: Start frontend development server
cd frontend
npm start

# Open browser to http://localhost:3000
```

### Production Deployment

```bash
# Build frontend
cd frontend
npm run build

# Start production server
cd ../backend
npm run start
```

## 🏗️ Architecture

### **Frontend** (React + Canvas + Web Audio)
```
src/
├── components/
│   ├── GestureCanvas.js      # 60fps gesture capture + rendering
│   ├── AudioEngine.js        # Web Audio API + Tone.js synthesis
│   └── RoomInterface.js      # User management UI
└── services/
    ├── SocketService.js      # WebSocket client (<100ms latency)
    ├── GestureCapture.js     # Cross-platform input normalization
    └── AudioService.js       # Real-time audio parameter mapping
```

### **Backend** (Node.js + Socket.io + Express)
```
src/
├── models/
│   ├── User.js              # Anonymous session management
│   ├── Room.js              # 5-10 user collaborative spaces
│   ├── Gesture.js           # Input validation + processing
│   ├── SoundPattern.js      # Evolving musical elements
│   └── MemoryState.js       # 24-hour environmental learning
├── services/
│   ├── RoomManager.js       # Room lifecycle coordination
│   ├── GestureProcessor.js  # <200ms gesture → audio conversion
│   ├── EnvironmentalMemoryCoordinator.js  # Memory evolution
│   └── SoundPatternGenerator.js           # 6 generative algorithms
└── api/
    └── socketHandlers.js    # Real-time WebSocket API
```

## 🎵 Musical Algorithms

### **Cellular Automata**
Conway-inspired rules create rhythmic patterns from gesture density

### **Fractal Generation**
Golden ratio and self-similar structures for harmonic evolution

### **Markov Chains**
Learn from gesture sequences to predict musical continuations

### **Neural Networks**
Simple feed-forward networks map gestures to sonic parameters

### **Fibonacci Sequences**
Mathematical ratios create naturally pleasing harmonic intervals

### **Chaos Theory**
Lorenz attractors generate complex, unpredictable textures

## 🔧 API Reference

### WebSocket Events

#### **Join Room**
```javascript
socket.emit('join-room', {
  roomId: 'harmonic-space-42',
  userData: {
    device: 'mobile',
    capabilities: { touch: true, gyroscope: true }
  }
}, (response) => {
  console.log('Joined:', response.room)
})
```

#### **Send Gesture**
```javascript
socket.emit('gesture', {
  type: 'touch',
  coordinates: { x: 0.5, y: 0.7 },
  intensity: 0.8,
  timestamp: Date.now()
}, (response) => {
  console.log('Processed:', response.sonicParams)
})
```

#### **Receive Sonic Updates**
```javascript
socket.on('sonic-update', (update) => {
  console.log('New patterns:', update.patterns)
  audioEngine.updatePatterns(update.patterns)
})
```

### REST Endpoints

#### **Room Discovery**
```bash
GET /api/rooms?limit=10
```

#### **Health Check**
```bash
GET /health
```

#### **Performance Metrics**
```bash
GET /api/metrics
```

## 🧪 Testing

### Run All Tests
```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# Integration tests
npm run test:integration

# Performance tests
npm run test:performance
```

### Test Coverage
- **Unit Tests**: 90%+ coverage requirement
- **Integration Tests**: Cross-platform collaboration scenarios
- **Performance Tests**: Constitutional latency validation
- **Contract Tests**: Socket.io API compliance

## 📊 Performance Monitoring

### Constitutional Requirements
- ✅ **<200ms Gesture Processing**: Input → audio synthesis
- ✅ **<100ms WebSocket Latency**: Real-time collaboration
- ✅ **60fps Canvas Rendering**: Smooth visual feedback
- ✅ **Anonymous Sessions**: No personal data storage
- ✅ **24-hour Memory**: Automatic room cleanup

### Monitoring Endpoints
```bash
# Real-time metrics
curl http://localhost:3001/api/metrics

# Health status
curl http://localhost:3001/health
```

## 🌍 Deployment

### Docker Deployment
```dockerfile
# Backend container
FROM node:18-alpine
COPY backend/ /app
WORKDIR /app
RUN npm ci --production
EXPOSE 3001
CMD ["npm", "start"]
```

### Environment Variables
```bash
# Backend (.env)
NODE_ENV=production
PORT=3001
CORS_ORIGIN=https://webarmonium.app

# Frontend (.env)
REACT_APP_WEBSOCKET_URL=wss://api.webarmonium.app
```

### Production Checklist
- [ ] SSL/TLS certificates configured
- [ ] CORS origins restricted to production domains
- [ ] WebSocket security headers enabled
- [ ] Memory cleanup intervals optimized
- [ ] Performance monitoring enabled
- [ ] CDN configured for static assets

## 🛠️ Development

### Code Style
```bash
# ESLint + Prettier (both frontend & backend)
npm run lint
npm run format
```

### Constitutional Compliance
```bash
# Validate performance requirements
npm run test:constitutional

# Check memory management
npm run test:memory

# Validate latency requirements
npm run test:latency
```

### Adding New Algorithms
```javascript
// Create new algorithm in SoundPatternGenerator
class MyCustomAlgorithm extends GenerationAlgorithm {
  constructor() {
    super('mycustom')
  }

  generatePatterns(roomId, memoryState, strategy) {
    // Your algorithm implementation
    return patterns
  }
}

// Register in SoundPatternGenerator constructor
this.generationAlgorithms.set('mycustom', new MyCustomAlgorithm())
```

## 🤝 Contributing

### Getting Started
1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-algorithm`
3. Follow constitutional requirements (see `.specify/memory/constitution.md`)
4. Add tests with 90%+ coverage
5. Validate performance requirements
6. Submit pull request

### Constitutional Principles
1. **Code Quality First**: Zero duplication, clean architecture
2. **Test-Driven Development**: Tests before implementation (NON-NEGOTIABLE)
3. **User Experience Consistency**: Design systems, accessibility
4. **Performance By Design**: <200ms API, <100ms UI constitutional limits

## 📚 Documentation

### Architecture Documentation
- [System Architecture](docs/architecture.md)
- [Algorithm Details](docs/algorithms.md)
- [Performance Guide](docs/performance.md)
- [API Reference](docs/api.md)

### Deployment Guides
- [Local Development](docs/development.md)
- [Production Deployment](docs/deployment.md)
- [Monitoring Setup](docs/monitoring.md)
- [Troubleshooting](docs/troubleshooting.md)

## 🔐 Security

### Data Privacy
- **Anonymous Sessions**: No personal data collection
- **Session-Only IDs**: Temporary identifiers, no tracking
- **Memory Cleanup**: Automatic 24-hour data expiration
- **No Persistent Storage**: Gestures not permanently stored

### Network Security
- **CORS Configuration**: Production domain restrictions
- **Rate Limiting**: Gesture frequency limits
- **Input Validation**: All gesture data sanitized
- **WebSocket Security**: Secure headers and origin validation

## 📈 Roadmap

### v2.0 - Advanced Collaboration
- [ ] **Spatial Audio**: 3D positioning for multi-user sessions
- [ ] **Advanced Algorithms**: ML-based pattern recognition
- [ ] **Room Templates**: Pre-configured algorithmic personalities
- [ ] **Recording & Playback**: Session capture capabilities

### v2.1 - Enhanced Experience
- [ ] **Visual Modes**: Algorithm-specific visualization themes
- [ ] **Accessibility**: Screen reader support, keyboard navigation
- [ ] **Mobile Optimization**: PWA, offline capabilities
- [ ] **Advanced Gestures**: Multi-finger, pressure sensitivity

### v2.2 - Platform Integration
- [ ] **DAW Integration**: VST/AU plugin export
- [ ] **Streaming Support**: OBS integration for live performances
- [ ] **Social Features**: Room sharing, favorite algorithms
- [ ] **Analytics Dashboard**: Usage patterns, popular algorithms

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- **Tone.js**: Web Audio synthesis framework
- **Socket.io**: Real-time communication
- **React**: Frontend framework
- **Canvas API**: High-performance rendering
- **Constitutional Development**: Governance-driven code quality

---

**Built with ❤️ for musical collaboration and algorithmic exploration**

🌐 **Website**: [webarmonium.app](https://webarmonium.app)
📧 **Contact**: hello@webarmonium.app
🐛 **Issues**: [GitHub Issues](https://github.com/your-org/webarmonium/issues)
💬 **Discussions**: [GitHub Discussions](https://github.com/your-org/webarmonium/discussions)