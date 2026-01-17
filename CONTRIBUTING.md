# Contributing to Webarmonium

Thank you for your interest in contributing to Webarmonium! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites
- Node.js 18+
- Modern browser with Web Audio API support

### Getting Started

1. Fork and clone the repository:
```bash
git clone https://github.com/YOUR-USERNAME/Webarmonium.git
cd Webarmonium
```

2. Start the backend (port 3001):
```bash
cd backend
npm install
npm run dev
```

3. Start the frontend (port 3000) in another terminal:
```bash
cd frontend
npm install
npm start
```

4. Open http://localhost:3000

## Code Quality Standards

### Test-Driven Development (TDD)
- Write tests before implementation
- Target 90%+ code coverage
- Run tests: `cd backend && npm test`

### Code Style
- Run linting before committing: `npm run lint`
- Fix lint issues: `npm run lint:fix`
- Follow existing code patterns and conventions

### Performance Requirements
- API endpoints: <200ms p95 response time
- UI interactions: <100ms response time
- WebSocket latency: <100ms
- Canvas rendering: 60fps target

## Pull Request Process

1. Create a feature branch:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes following the code quality standards

3. Write or update tests as needed

4. Ensure all tests pass:
```bash
cd backend && npm test
```

5. Commit your changes with clear, descriptive messages

6. Push to your fork and submit a pull request

## Reporting Issues

Please use GitHub Issues for:
- Bug reports (include steps to reproduce)
- Feature requests
- Questions about the codebase

## Code of Conduct

Be respectful and inclusive. We welcome contributors of all backgrounds and experience levels.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
