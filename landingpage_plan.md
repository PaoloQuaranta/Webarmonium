# Webarmonium Landing Page - Implementation Plan

## 📋 Project Overview

Create a landing page that generates music and animations using **real-time global web interaction metrics** instead of user gestures. The page will function as an **educational dashboard** showing how web activity translates into generative art and music.

### Core Concept
- **Input**: Real-time metrics from Wikipedia edits, HackerNews posts, and GitHub commits
- **Output**: Generative music (using Webarmonium's 6 algorithms) + Canvas animations
- **Experience**: Passive/observational with educational dashboard showing metric-to-art mappings

### Key Constraints
- Must work without user accounts/login
- Free/public APIs only
- Respect rate limits
- Real-time or near-real-time updates

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LANDING PAGE (Frontend)                          │
│  frontend/landing/                                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐│
│  │ MetricsCollector │───▶│ GenerativeEngine │───▶│ AudioService    ││
│  │ Service          │    │ Service          │    │ (Tone.js)       ││
│  └──────────────────┘    └──────────────────┘    └─────────────────┘│
│           │                       │                       │          │
│           │                       ▼                       │          │
│           │              ┌──────────────────┐             │          │
│           │              │ CanvasRenderer   │◀────────────┘          │
│           │              │ (60fps)          │                        │
│           │              └──────────────────┘                        │
│           │                       │                                  │
│           ▼                       ▼                                  │
│  ┌──────────────────┐    ┌──────────────────┐                        │
│  │ DashboardUI      │◀───│ StateManager     │                        │
│  │ (Educational)    │    │                  │                        │
│  └──────────────────┘    └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
                           ▲
                           │ HTTP Polling
                           │
┌──────────────────────────┴──────────────────────────────────────────┐
│                    EXTERNAL APIS                                     │
├──────────────┬──────────────┬────────────────────────────────────────┤
│ Wikipedia    │ HackerNews   │ GitHub Events API                      │
│ RecentChange │ Firebase     │ (REST polling)                         │
└──────────────┴──────────────┴────────────────────────────────────────┘
```

---

## 📊 API Specifications

### 1. Wikipedia RecentChanges API
- **Endpoint**: `https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcprop=title|type|sizes|timestamp|user&format=json&origin=*`
- **Rate Limit**: High (documented as 500 req/sec for bots)
- **Poll Interval**: 5 seconds
- **Metrics Collected**:
  - `editsPerMinute`: Count of edit events
  - `newArticles`: Count of 'new' type events
  - `avgEditSize`: Average bytes changed
  - `languageDistribution`: Count by article language

### 2. HackerNews Firebase API
- **Endpoint (Stories)**: `https://hacker-news.firebaseio.com/v0/newstories.json`
- **Endpoint (Item)**: `https://hacker-news.firebaseio.com/v0/item/{id}.json`
- **Rate Limit**: None documented
- **Poll Interval**: 10 seconds
- **Metrics Collected**:
  - `postsPerMinute`: New story IDs count
  - `avgUpvotes`: Average score of fetched items
  - `commentCount`: Total descendants count
  - `postTypes`: Count of 'story', 'ask_hn', 'show_hn'

### 3. GitHub Events API
- **Endpoint**: `https://api.github.com/events?per_page=30`
- **Rate Limit**: 60 req/hour (IP), 5000 req/hour (authenticated)
- **Poll Interval**: 60 seconds (unauthenticated), 15 seconds (authenticated)
- **Metrics Collected**:
  - `commitsPerMinute`: PushEvent count
  - `openPRs`: PullRequestEvent count
  - `newStars`: WatchEvent count
  - `languageDistribution`: From repository.language

---

## 🎵 Metric-to-Parameter Mapping

### Musical Parameters

| Web Metric | Webarmonium Parameter | Calculation | Range |
|------------|----------------------|-------------|-------|
| Wikipedia `editsPerMinute` | `complexity` | `Math.min(edits / 500, 1.0)` | 0-1 |
| HackerNews `postsPerMinute` | `rhythmicPreference` | `Math.min(posts / 100, 1.0)` | 0-1 |
| GitHub `commitsPerMinute` | `harmonicPreference` | `Math.min(commits / 50, 1.0)` | 0-1 |
| Wikipedia `avgEditSize / 1000` | `intensity` | `Math.min(size / 5000, 1.0)` | 0-1 |
| HN `avgUpvotes / 100` | `position.y` | `Math.min(upvotes / 200, 1.0)` | 0-1 |
| GitHub `languageDistribution` | `scaleType` | Map language to scale | - |
| Combined activity rate | `diversity` | `stdDev(allRates) / max` | 0-1 |

### Visual Parameters

| Web Metric | Canvas Parameter | Effect |
|------------|------------------|--------|
| Wikipedia `editsPerMinute` | `pulse.speed` | Faster pulses with more edits |
| HN `postsPerMinute` | `spring.stiffness` | Stiffer springs with more posts |
| GitHub `commitsPerMinute` | `node.size` | Larger nodes with more commits |
| All metrics `avg` | `edge.thickness` | Thicker edges with high activity |
| Wikipedia `languageDistribution` | `node.colors` | Different colors per language |

### Algorithm Selection

| Algorithm | Trigger Condition |
|-----------|-------------------|
| Cellular Automata | `editsPerMinute > 100` |
| Fractal | `commitsPerMinute < 20` (steady) |
| Markov Chain | Always running, trained on post types |
| Neural Network | When all metrics above baseline |
| Fibonacci | When `postsPerMinute % 34 === 0` |
| Chaos Theory | When volatility (stdDev) > 0.5 |

---

## 📁 File Structure

```
Webarmonium/
├── frontend/
│   ├── landing/                          # NEW - Landing page module
│   │   ├── index.html                    # Landing page HTML
│   │   ├── styles.css                    # Landing page styles
│   │   └── src/
│   │       ├── MetricsCollectorService.js    # Poll external APIs
│   │       ├── GenerativeEngineService.js    # Map metrics → parameters
│   │       ├── LandingAudioService.js        # Audio generation (Tone.js)
│   │       ├── LandingCanvasRenderer.js      # Visual rendering
│   │       ├── StateManager.js               # State management
│   │       └── DashboardUI.js                # Educational UI components
│   └── src/
│       └── main.js                        # Add landing route
├── backend/
│   └── src/
│       └── landing/                       # NEW - Optional backend
│           └── MetricsAggregator.js       # Cache and aggregate (future)
└── landingpage_plan.md                    # This file
```

---

## 🚀 Implementation Phases

### Phase 1: Foundation & Setup (Priority: CRITICAL)
**Duration**: Foundation setup
**Goal**: Basic structure working with mock data

#### Task 1.1: Create Landing Page HTML Structure
- [ ] Create `frontend/landing/index.html`
- [ ] Add responsive layout with canvas container
- [ ] Add metrics dashboard section
- [ ] Add control panel (Start/Stop, Volume, Intensity slider)
- [ ] Add mapping explainer section
- [ ] Include Tone.js and Canvas dependencies

**Instructions**:
```html
<!-- frontend/landing/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Webarmonium - Global Activity → Generative Music</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>WEBARMONIUM</h1>
    <p>Real-time web activity transformed into generative music and art</p>
  </header>

  <main>
    <!-- Metrics Dashboard -->
    <section id="metrics-dashboard">
      <div class="metric-card" id="wikipedia-metric">
        <h3>📝 Wikipedia</h3>
        <p class="metric-value">0</p>
        <p class="metric-label">edits/min</p>
      </div>
      <div class="metric-card" id="hackernews-metric">
        <h3>🧡 HackerNews</h3>
        <p class="metric-value">0</p>
        <p class="metric-label">posts/min</p>
      </div>
      <div class="metric-card" id="github-metric">
        <h3>💻 GitHub</h3>
        <p class="metric-value">0</p>
        <p class="metric-label">commits/min</p>
      </div>
      <div class="metric-card" id="complexity-metric">
        <h3>🎛️ Complexity</h3>
        <p class="metric-value">0.00</p>
        <p class="metric-label">algorithm parameter</p>
      </div>
    </section>

    <!-- Canvas Container -->
    <section id="canvas-container">
      <canvas id="generative-canvas"></canvas>
    </section>

    <!-- Controls -->
    <section id="controls">
      <button id="btn-start">▶ Start</button>
      <button id="btn-stop">⏸ Stop</button>
      <label>Intensity: <input type="range" id="intensity" min="0" max="100" value="50"></label>
      <label>Volume: <input type="range" id="volume" min="0" max="100" value="70"></label>
    </section>

    <!-- Mapping Explainer -->
    <section id="mapping-explainer">
      <h2>How It Works</h2>
      <ul>
        <li>📝 Wikipedia edits → Algorithm complexity</li>
        <li>🧡 HackerNews posts → Rhythm and tempo</li>
        <li>💻 GitHub commits → Harmony and scale</li>
      </ul>
    </section>
  </main>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js"></script>
  <script src="src/MetricsCollectorService.js" type="module"></script>
  <script src="src/GenerativeEngineService.js" type="module"></script>
  <script src="src/LandingAudioService.js" type="module"></script>
  <script src="src/LandingCanvasRenderer.js" type="module"></script>
  <script src="src/StateManager.js" type="module"></script>
  <script src="src/DashboardUI.js" type="module"></script>
</body>
</html>
```

#### Task 1.2: Create CSS Styling
- [ ] Create `frontend/landing/styles.css`
- [ ] Dark theme matching Webarmonium aesthetic
- [ ] Responsive grid layout for metrics cards
- [ ] Canvas fills available space
- [ ] Animated transitions for metric updates
- [ ] Typography hierarchy

**Instructions**:
```css
/* frontend/landing/styles.css */
:root {
  --bg-color: #0a0a0f;
  --card-bg: #1a1a2e;
  --accent: #6366f1;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', system-ui, sans-serif;
  background: var(--bg-color);
  color: var(--text-primary);
  min-height: 100vh;
}

header {
  text-align: center;
  padding: 2rem 1rem;
  border-bottom: 1px solid rgba(99, 102, 241, 0.2);
}

header h1 {
  font-size: 2.5rem;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* Metrics Dashboard */
#metrics-dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
}

.metric-card {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  border: 1px solid rgba(99, 102, 241, 0.1);
  transition: transform 0.2s, border-color 0.2s;
}

.metric-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
}

.metric-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--accent);
}

.metric-label {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-top: 0.5rem;
}

/* Canvas */
#canvas-container {
  width: 100%;
  height: 500px;
  position: relative;
}

#generative-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* Controls */
#controls {
  display: flex;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
  flex-wrap: wrap;
}

button {
  background: var(--accent);
  color: white;
  border: none;
  padding: 0.75rem 2rem;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: opacity 0.2s;
}

button:hover {
  opacity: 0.9;
}

input[type="range"] {
  width: 150px;
}

/* Mapping Explainer */
#mapping-explainer {
  max-width: 800px;
  margin: 2rem auto;
  padding: 2rem;
  background: var(--card-bg);
  border-radius: 12px;
}

#mapping-explainer ul {
  list-style: none;
  margin-top: 1rem;
}

#mapping-explainer li {
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
```

#### Task 1.3: Create StateManager
- [ ] Create `frontend/landing/src/StateManager.js`
- [ ] Implement singleton pattern for state
- [ ] Store metrics, parameters, playback state
- [ ] Event emission for state changes

**Instructions**:
```javascript
// frontend/landing/src/StateManager.js
export class StateManager {
  constructor() {
    if (StateManager.instance) {
      return StateManager.instance;
    }
    StateManager.instance = this;

    this.state = {
      playback: {
        isPlaying: false,
        volume: 0.7,
        intensity: 0.5
      },
      metrics: {
        wikipedia: { editsPerMinute: 0, newArticles: 0, avgEditSize: 0 },
        hackernews: { postsPerMinute: 0, avgUpvotes: 0, commentCount: 0 },
        github: { commitsPerMinute: 0, openPRs: 0, newStars: 0 }
      },
      parameters: {
        complexity: 0.5,
        rhythmicPreference: 0.5,
        harmonicPreference: 0.5,
        intensity: 0.5,
        position: { x: 0.5, y: 0.5 },
        diversity: 0.5
      },
      lastUpdate: Date.now()
    };

    this.listeners = new Set();
  }

  // Get current state
  getState() {
    return { ...this.state };
  }

  // Update metrics
  updateMetrics(source, data) {
    this.state.metrics[source] = { ...this.state.metrics[source], ...data };
    this.state.lastUpdate = Date.now();
    this._notify();
  }

  // Update generative parameters
  updateParameters(params) {
    this.state.parameters = { ...this.state.parameters, ...params };
    this._notify();
  }

  // Update playback state
  setPlayback(isPlaying) {
    this.state.playback.isPlaying = isPlaying;
    this._notify();
  }

  setVolume(volume) {
    this.state.playback.volume = volume;
    this._notify();
  }

  setIntensity(intensity) {
    this.state.playback.intensity = intensity;
    this._notify();
  }

  // Subscribe to state changes
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notify() {
    this.listeners.forEach(cb => cb(this.getState()));
  }

  // Calculate derived parameters from metrics
  recalculateParameters() {
    const m = this.state.metrics;
    const params = {
      complexity: Math.min(m.wikipedia.editsPerMinute / 500, 1.0),
      rhythmicPreference: Math.min(m.hackernews.postsPerMinute / 100, 1.0),
      harmonicPreference: Math.min(m.github.commitsPerMinute / 50, 1.0),
      intensity: Math.min(m.wikipedia.avgEditSize / 5000, 1.0),
      position: {
        x: 0.5,
        y: Math.min(m.hackernews.avgUpvotes / 200, 1.0)
      }
    };
    this.updateParameters(params);
  }
}

export const stateManager = new StateManager();
```

---

### Phase 2: Metrics Collection (Priority: HIGH)
**Duration**: Core functionality
**Goal**: Real-time data from external APIs

#### Task 2.1: Create MetricsCollectorService
- [ ] Create `frontend/landing/src/MetricsCollectorService.js`
- [ ] Implement Wikipedia API polling
- [ ] Implement HackerNews API polling
- [ ] Implement GitHub Events API polling
- [ ] Handle rate limiting and errors
- [ ] Calculate per-minute rates

**Instructions**:
```javascript
// frontend/landing/src/MetricsCollectorService.js
import { stateManager } from './StateManager.js';

export class MetricsCollectorService {
  constructor() {
    this.sources = {
      wikipedia: {
        url: 'https://en.wikipedia.org/w/api.php?action=query&list=recentchanges&rcprop=title|type|sizes|timestamp&rclimit=50&format=json&origin=*',
        interval: 5000,
        lastFetch: 0,
        history: []
      },
      hackernews: {
        storiesUrl: 'https://hacker-news.firebaseio.com/v0/newstories.json',
        itemUrl: (id) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        interval: 10000,
        lastFetch: 0,
        lastStoryIds: [],
        history: []
      },
      github: {
        url: 'https://api.github.com/events?per_page=30',
        interval: 60000, // 60 seconds - respect rate limit
        lastFetch: 0,
        history: []
      }
    };

    this.isRunning = false;
    this.intervalId = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._poll();
    this.intervalId = setInterval(() => this._poll(), 5000);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async _poll() {
    const now = Date.now();

    // Check each source
    if (now - this.sources.wikipedia.lastFetch >= this.sources.wikipedia.interval) {
      await this._fetchWikipedia();
      this.sources.wikipedia.lastFetch = now;
    }

    if (now - this.sources.hackernews.lastFetch >= this.sources.hackernews.interval) {
      await this._fetchHackerNews();
      this.sources.hackernews.lastFetch = now;
    }

    if (now - this.sources.github.lastFetch >= this.sources.github.interval) {
      await this._fetchGitHub();
      this.sources.github.lastFetch = now;
    }

    // Recalculate parameters
    stateManager.recalculateParameters();
  }

  async _fetchWikipedia() {
    try {
      const response = await fetch(this.sources.wikipedia.url);
      const data = await response.json();

      if (data.query && data.query.recentchanges) {
        const changes = data.query.recentchanges;
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        // Add to history with timestamp
        const timestampedChanges = changes.map(c => ({
          ...c,
          fetchedAt: now
        }));

        this.sources.wikipedia.history.push(...timestampedChanges);

        // Clean old history (keep last 2 minutes)
        this.sources.wikipedia.history = this.sources.wikipedia.history.filter(
          c => c.fetchedAt > now - 120000
        );

        // Calculate metrics
        const recentEdits = this.sources.wikipedia.history.filter(
          c => c.fetchedAt > oneMinuteAgo && c.type === 'edit'
        );
        const recentNew = this.sources.wikipedia.history.filter(
          c => c.fetchedAt > oneMinuteAgo && c.type === 'new'
        );

        const avgSize = recentEdits.length > 0
          ? recentEdits.reduce((sum, c) => sum + (c.newlen - c.oldlen || 0), 0) / recentEdits.length
          : 0;

        stateManager.updateMetrics('wikipedia', {
          editsPerMinute: recentEdits.length,
          newArticles: recentNew.length,
          avgEditSize: Math.abs(avgSize)
        });
      }
    } catch (error) {
      console.warn('Wikipedia fetch error:', error);
    }
  }

  async _fetchHackerNews() {
    try {
      // Get new story IDs
      const storiesResponse = await fetch(this.sources.hackernews.storiesUrl);
      const storyIds = await storiesResponse.json();

      // Find new stories (not in our last list)
      const newStoryIds = storyIds.filter(
        id => !this.sources.hackernews.lastStoryIds.includes(id)
      );

      if (newStoryIds.length > 0) {
        // Fetch details for first 10 new stories
        const detailedStories = await Promise.all(
          newStoryIds.slice(0, 10).map(id =>
            fetch(this.sources.hackernews.itemUrl(id))
              .then(r => r.json())
              .catch(() => null)
          )
        );

        const validStories = detailedStories.filter(s => s && s.time);

        // Add to history
        this.sources.hackernews.history.push(
          ...validStories.map(s => ({ ...s, fetchedAt: Date.now() }))
        );

        // Clean old history
        const now = Date.now();
        this.sources.hackernews.history = this.sources.hackernews.history.filter(
          s => s.fetchedAt > now - 120000
        );

        // Calculate metrics
        const oneMinuteAgo = now - 60000;
        const recentPosts = this.sources.hackernews.history.filter(
          s => s.fetchedAt > oneMinuteAgo
        );

        const avgUpvotes = recentPosts.length > 0
          ? recentPosts.reduce((sum, s) => sum + (s.score || 0), 0) / recentPosts.length
          : 0;

        const totalComments = recentPosts.reduce((sum, s) => sum + (s.descendants || 0), 0);

        stateManager.updateMetrics('hackernews', {
          postsPerMinute: recentPosts.length,
          avgUpvotes: avgUpvotes,
          commentCount: totalComments
        });
      }

      this.sources.hackernews.lastStoryIds = storyIds.slice(0, 100);
    } catch (error) {
      console.warn('HackerNews fetch error:', error);
    }
  }

  async _fetchGitHub() {
    try {
      const response = await fetch(this.sources.github.url, {
        headers: {
          'User-Agent': 'Webarmonium-Landing-Page',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      const events = await response.json();
      const now = Date.now();

      // Add to history
      this.sources.github.history.push(
        ...events.map(e => ({ ...e, fetchedAt: now }))
      );

      // Clean old history (keep last 5 minutes)
      this.sources.github.history = this.sources.github.history.filter(
        e => e.fetchedAt > now - 300000
      );

      // Calculate metrics
      const oneMinuteAgo = now - 60000;
      const recentEvents = this.sources.github.history.filter(
        e => e.fetchedAt > oneMinuteAgo
      );

      const commits = recentEvents.filter(e => e.type === 'PushEvent').length;
      const prs = recentEvents.filter(e => e.type === 'PullRequestEvent').length;
      const stars = recentEvents.filter(e => e.type === 'WatchEvent').length;

      stateManager.updateMetrics('github', {
        commitsPerMinute: commits,
        openPRs: prs,
        newStars: stars
      });
    } catch (error) {
      console.warn('GitHub fetch error:', error);
    }
  }
}
```

#### Task 2.2: Create Mock Data Mode
- [ ] Add mock data generator for testing
- [ ] Simulate realistic metric fluctuations
- [ ] Allow switching between real/mock data

**Instructions**:
```javascript
// Add to MetricsCollectorService.js

export class MockMetricsGenerator {
  constructor() {
    this.baseMetrics = {
      wikipedia: { editsPerMinute: 342, newArticles: 15, avgEditSize: 500 },
      hackernews: { postsPerMinute: 45, avgUpvotes: 25, commentCount: 150 },
      github: { commitsPerMinute: 123, openPRs: 8, newStars: 12 }
    };
  }

  generate() {
    // Add randomness to simulate natural fluctuation
    return {
      wikipedia: {
        editsPerMinute: Math.max(0, this.baseMetrics.wikipedia.editsPerMinute +
          (Math.random() - 0.5) * 100),
        newArticles: Math.max(0, this.baseMetrics.wikipedia.newArticles +
          Math.floor((Math.random() - 0.5) * 10)),
        avgEditSize: Math.max(0, this.baseMetrics.wikipedia.avgEditSize +
          (Math.random() - 0.5) * 200)
      },
      hackernews: {
        postsPerMinute: Math.max(0, this.baseMetrics.hackernews.postsPerMinute +
          (Math.random() - 0.5) * 20),
        avgUpvotes: Math.max(0, this.baseMetrics.hackernews.avgUpvotes +
          (Math.random() - 0.5) * 10),
        commentCount: Math.max(0, this.baseMetrics.hackernews.commentCount +
          Math.floor((Math.random() - 0.5) * 50))
      },
      github: {
        commitsPerMinute: Math.max(0, this.baseMetrics.github.commitsPerMinute +
          (Math.random() - 0.5) * 40),
        openPRs: Math.max(0, this.baseMetrics.github.openPRs +
          Math.floor((Math.random() - 0.5) * 5)),
        newStars: Math.max(0, this.baseMetrics.github.newStars +
          Math.floor((Math.random() - 0.5) * 8))
      }
    };
  }
}
```

---

### Phase 3: Generative Engine (Priority: HIGH)
**Duration**: Core logic
**Goal**: Map metrics to audio-visual parameters

#### Task 3.1: Create GenerativeEngineService
- [ ] Create `frontend/landing/src/GenerativeEngineService.js`
- [ ] Implement metric-to-parameter mapping
- [ ] Add algorithm selection logic
- [ ] Generate audio events based on parameters
- [ ] Emit events for audio and visual services

**Instructions**:
```javascript
// frontend/landing/src/GenerativeEngineService.js
import { stateManager } from './StateManager.js';

export class GenerativeEngineService {
  constructor() {
    this.isPlaying = false;
    this.eventInterval = null;
    this.lastEventTime = 0;

    // Subscribe to state changes
    stateManager.subscribe(this._onStateChange.bind(this));
  }

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this._scheduleNextEvent();
  }

  stop() {
    this.isPlaying = false;
    if (this.eventInterval) {
      clearTimeout(this.eventInterval);
      this.eventInterval = null;
    }
  }

  _onStateChange(state) {
    if (!state.playback.isPlaying) {
      this.stop();
    } else {
      if (!this.isPlaying) {
        this.start();
      }
    }
  }

  _scheduleNextEvent() {
    if (!this.isPlaying) return;

    const state = stateManager.getState();
    const params = state.parameters;

    // Calculate delay based on rhythmic preference (inverse relationship)
    // Higher rhythmicPreference = shorter delay = faster events
    const baseDelay = 2000; // 2 seconds max
    const minDelay = 250;   // 250ms min
    const delay = baseDelay - (params.rhythmicPreference * (baseDelay - minDelay));

    this.eventInterval = setTimeout(() => {
      this._generateEvent();
      this._scheduleNextEvent();
    }, delay);
  }

  _generateEvent() {
    const state = stateManager.getState();
    const params = state.parameters;
    const metrics = state.metrics;

    // Determine algorithm based on metrics
    const algorithm = this._selectAlgorithm(metrics);

    // Generate audio parameters
    const audioEvent = this._generateAudioEvent(params, algorithm);

    // Generate visual parameters
    const visualEvent = this._generateVisualEvent(params, metrics);

    // Emit events
    this._emitEvent('audio', audioEvent);
    this._emitEvent('visual', visualEvent);
  }

  _selectAlgorithm(metrics) {
    // Algorithm selection logic
    const edits = metrics.wikipedia.editsPerMinute;
    const commits = metrics.github.commitsPerMinute;
    const posts = metrics.hackernews.postsPerMinute;

    if (edits > 100) return 'cellular';
    if (commits < 20) return 'fractal';
    if (posts % 34 < 5) return 'fibonacci';

    // Default based on diversity
    const diversity = stateManager.getState().parameters.diversity;
    if (diversity > 0.7) return 'chaos';
    if (diversity > 0.4) return 'neural';
    return 'markov';
  }

  _generateAudioEvent(params, algorithm) {
    // Calculate frequency from position
    const baseFreq = 110 + (1 - params.position.y) * 440; // 110-550Hz
    const harmonic = params.position.x * 660; // 0-660Hz
    const frequency = baseFreq + harmonic;

    // Waveform based on algorithm
    const waveforms = {
      cellular: 'square',
      fractal: 'sine',
      markov: 'triangle',
      neural: 'sawtooth',
      fibonacci: 'sine',
      chaos: 'sawtooth'
    };

    // Duration based on rhythmic preference
    const durations = ['32n', '16n', '8n', '4n'];
    const durationIndex = Math.floor(params.rhythmicPreference * (durations.length - 1));
    const duration = durations[durationIndex];

    return {
      algorithm,
      frequency,
      duration,
      waveform: waveforms[algorithm] || 'sine',
      velocity: 0.3 + params.intensity * 0.7,
      attack: 0.01 + (1 - params.rhythmicPreference) * 0.1,
      decay: 0.1 + params.complexity * 0.3,
      sustain: params.intensity * 0.5,
      release: 0.1 + (1 - params.complexity) * 0.5
    };
  }

  _generateVisualEvent(params, metrics) {
    return {
      pulseIntensity: params.intensity,
      nodeSize: 6 + params.complexity * 16, // 6-22px
      springStiffness: 0.02 + params.rhythmicPreference * 0.08,
      edgeThickness: 1 + Math.floor(params.diversity * 2), // 1-3px
      pulseSpeed: 1 + params.rhythmicPreference * 2,
      colorShift: params.position.x * 360 // Hue rotation
    };
  }

  _emitEvent(type, data) {
    // Dispatch custom event
    const event = new CustomEvent(`generative:${type}`, { detail: data });
    window.dispatchEvent(event);
  }
}
```

---

### Phase 4: Audio Service (Priority: HIGH)
**Duration**: Audio implementation
**Goal**: Generate sound from generative events

#### Task 4.1: Create LandingAudioService
- [ ] Create `frontend/landing/src/LandingAudioService.js`
- [ ] Initialize Tone.js components
- [ ] Listen for generative:audio events
- [ ] Synthesize sounds based on event parameters
- [ ] Handle volume and intensity controls

**Instructions**:
```javascript
// frontend/landing/src/LandingAudioService.js
import * as Tone from 'tone';
import { stateManager } from './StateManager.js';

export class LandingAudioService {
  constructor() {
    this.isInitialized = false;
    this.synth = null;
    this.filter = null;
    this.reverb = null;
    this.limiter = null;

    this.audioHandler = this._handleAudioEvent.bind(this);
  }

  async initialize() {
    if (this.isInitialized) return;

    // Start Tone.js context (requires user interaction)
    await Tone.start();

    // Create effects chain
    this.reverb = new Tone.Reverb({
      decay: 2,
      wet: 0.3
    }).toDestination();

    this.filter = new Tone.Filter({
      frequency: 2000,
      type: 'lowpass',
      Q: 1
    }).connect(this.reverb);

    this.limiter = new Tone.Limiter(-6).toDestination();

    // Create polyphonic synth
    this.synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.3,
        release: 0.5
      }
    }).connect(this.filter);

    this.isInitialized = true;

    // Subscribe to volume changes
    stateManager.subscribe((state) => {
      if (this.synth) {
        this.synth.volume.value = Tone.gainToDb(state.playback.volume);
      }
    });
  }

  start() {
    window.addEventListener('generative:audio', this.audioHandler);
  }

  stop() {
    window.removeEventListener('generative:audio', this.audioHandler);
    if (this.synth) {
      this.synth.releaseAll();
    }
  }

  _handleAudioEvent(event) {
    if (!this.isInitialized || !this.synth) return;

    const params = event.detail;

    // Update synth settings based on algorithm
    this.synth.set({
      oscillator: { type: params.waveform },
      envelope: {
        attack: params.attack,
        decay: params.decay,
        sustain: params.sustain,
        release: params.release
      }
    });

    // Update filter based on complexity
    const filterFreq = 200 + params.complexity * 5000;
    this.filter.frequency.value = filterFreq;

    // Trigger note
    const velocity = params.velocity * stateManager.getState().playback.intensity;
    this.synth.triggerAttackRelease(
      Tone.Frequency(params.frequency, 'hz').toNote(),
      params.duration,
      undefined,
      velocity
    );
  }

  setVolume(value) {
    stateManager.setVolume(value);
  }
}
```

---

### Phase 5: Canvas Renderer (Priority: MEDIUM)
**Duration**: Visual implementation
**Goal**: Render generative visuals

#### Task 5.1: Create LandingCanvasRenderer
- [ ] Create `frontend/landing/src/LandingCanvasRenderer.js`
- [ ] Set up canvas with 60fps loop
- [ ] Implement spring-mesh network (similar to GenerativeVisualService)
- [ ] Listen for generative:visual events
- [ ] Render based on visual parameters

**Instructions**:
```javascript
// frontend/landing/src/LandingCanvasRenderer.js

export class LandingCanvasRenderer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      throw new Error(`Canvas ${canvasId} not found`);
    }

    this.ctx = this.canvas.getContext('2d');
    this._resize();

    this.nodes = [];
    this.edges = [];
    this.pulses = [];

    this.config = {
      nodeCount: 20,
      connectionRadius: 150,
      baseNodeSize: 6,
      springStiffness: 0.05,
      damping: 0.92
    };

    this.currentParams = {
      pulseIntensity: 0.5,
      nodeSize: 10,
      springStiffness: 0.05,
      edgeThickness: 1,
      pulseSpeed: 1,
      colorShift: 0
    };

    this.visualHandler = this._handleVisualEvent.bind(this);
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  initialize() {
    this._createNodes();
    this._createEdges();
    this._startRenderLoop();
    window.addEventListener('generative:visual', this.visualHandler);
  }

  _createNodes() {
    const margin = 50;
    for (let i = 0; i < this.config.nodeCount; i++) {
      this.nodes.push({
        x: margin + Math.random() * (this.canvas.width - margin * 2),
        y: margin + Math.random() * (this.canvas.height - margin * 2),
        vx: 0,
        vy: 0,
        baseX: 0,
        baseY: 0
      });
    }
    // Store base positions
    this.nodes.forEach(n => {
      n.baseX = n.x;
      n.baseY = n.y;
    });
  }

  _createEdges() {
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const dist = this._distance(this.nodes[i], this.nodes[j]);
        if (dist < this.config.connectionRadius) {
          this.edges.push({
            from: i,
            to: j,
            length: dist
          });
        }
      }
    }
  }

  _handleVisualEvent(event) {
    this.currentParams = { ...this.currentParams, ...event.detail };

    // Add pulse at random node
    const nodeIndex = Math.floor(Math.random() * this.nodes.length);
    this.pulses.push({
      nodeIndex,
      intensity: this.currentParams.pulseIntensity,
      age: 0
    });
  }

  _startRenderLoop() {
    const render = () => {
      this._update();
      this._draw();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  _update() {
    // Update node positions (spring physics)
    this.nodes.forEach(node => {
      // Spring force to base position
      const dx = node.baseX - node.x;
      const dy = node.baseY - node.y;
      node.vx += dx * this.currentParams.springStiffness;
      node.vy += dy * this.currentParams.springStiffness;

      // Damping
      node.vx *= this.config.damping;
      node.vy *= this.config.damping;

      // Update position
      node.x += node.vx;
      node.y += node.vy;
    });

    // Update pulses
    this.pulses = this.pulses.filter(pulse => {
      pulse.age += 0.02 * this.currentParams.pulseSpeed;
      return pulse.age < 1;
    });
  }

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw edges
    ctx.strokeStyle = `rgba(99, 102, 241, ${0.2})`;
    ctx.lineWidth = this.currentParams.edgeThickness;
    this.edges.forEach(edge => {
      const from = this.nodes[edge.from];
      const to = this.nodes[edge.to];
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });

    // Draw pulses
    this.pulses.forEach(pulse => {
      const node = this.nodes[pulse.nodeIndex];
      const alpha = (1 - pulse.age) * 0.5;
      const radius = pulse.age * 100 * pulse.intensity;

      const gradient = ctx.createRadialGradient(
        node.x, node.y, 0,
        node.x, node.y, radius
      );
      gradient.addColorStop(0, `rgba(99, 102, 241, ${alpha})`);
      gradient.addColorStop(1, `rgba(99, 102, 241, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw nodes
    this.nodes.forEach(node => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, this.currentParams.nodeSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${(240 + this.currentParams.colorShift) % 360}, 70%, 60%)`;
      ctx.fill();
    });
  }

  _distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  destroy() {
    window.removeEventListener('resize', () => this._resize());
    window.removeEventListener('generative:visual', this.visualHandler);
  }
}
```

---

### Phase 6: Dashboard UI (Priority: MEDIUM)
**Duration**: UI implementation
**Goal**: Educational dashboard display

#### Task 6.1: Create DashboardUI
- [ ] Create `frontend/landing/src/DashboardUI.js`
- [ ] Update metric cards in real-time
- [ ] Display current parameters
- [ ] Show algorithm being used
- [ ] Add animation for value changes

**Instructions**:
```javascript
// frontend/landing/src/DashboardUI.js
import { stateManager } from './StateManager.js';

export class DashboardUI {
  constructor() {
    this.elements = {
      wikipedia: {
        value: document.querySelector('#wikipedia-metric .metric-value'),
        label: document.querySelector('#wikipedia-metric .metric-label')
      },
      hackernews: {
        value: document.querySelector('#hackernews-metric .metric-value'),
        label: document.querySelector('#hackernews-metric .metric-label')
      },
      github: {
        value: document.querySelector('#github-metric .metric-value'),
        label: document.querySelector('#github-metric .metric-label')
      },
      complexity: {
        value: document.querySelector('#complexity-metric .metric-value'),
        label: document.querySelector('#complexity-metric .metric-label')
      }
    };

    this.previousValues = {};
  }

  initialize() {
    // Subscribe to state changes
    stateManager.subscribe(this._updateDisplay.bind(this));

    // Bind controls
    this._bindControls();
  }

  _bindControls() {
    const startBtn = document.getElementById('btn-start');
    const stopBtn = document.getElementById('btn-stop');
    const intensitySlider = document.getElementById('intensity');
    const volumeSlider = document.getElementById('volume');

    startBtn?.addEventListener('click', () => {
      stateManager.setPlayback(true);
      startBtn.disabled = true;
      stopBtn.disabled = false;
    });

    stopBtn?.addEventListener('click', () => {
      stateManager.setPlayback(false);
      startBtn.disabled = false;
      stopBtn.disabled = true;
    });

    intensitySlider?.addEventListener('input', (e) => {
      stateManager.setIntensity(e.target.value / 100);
    });

    volumeSlider?.addEventListener('input', (e) => {
      stateManager.setVolume(e.target.value / 100);
    });
  }

  _updateDisplay(state) {
    const metrics = state.metrics;
    const params = state.parameters;

    // Update Wikipedia metric
    this._updateMetricCard(
      this.elements.wikipedia,
      Math.round(metrics.wikipedia.editsPerMinute),
      'edits/min'
    );

    // Update HackerNews metric
    this._updateMetricCard(
      this.elements.hackernews,
      Math.round(metrics.hackernews.postsPerMinute),
      'posts/min'
    );

    // Update GitHub metric
    this._updateMetricCard(
      this.elements.github,
      Math.round(metrics.github.commitsPerMinute),
      'commits/min'
    );

    // Update complexity parameter
    this._updateMetricCard(
      this.elements.complexity,
      params.complexity.toFixed(2),
      'algorithm parameter'
    );
  }

  _updateMetricCard(element, value, label) {
    if (!element.value) return;

    const oldValue = this.previousValues[value];
    this.previousValues[value] = value;

    element.value.textContent = value;
    element.label.textContent = label;

    // Add animation class if value changed
    if (oldValue !== value) {
      element.value.classList.add('value-changed');
      setTimeout(() => {
        element.value.classList.remove('value-changed');
      }, 300);
    }
  }
}
```

Add to `styles.css`:
```css
@keyframes valueHighlight {
  0%, 100% { color: var(--accent); }
  50% { transform: scale(1.1); }
}

.value-changed {
  animation: valueHighlight 0.3s ease-out;
}
```

---

### Phase 7: Integration & Testing (Priority: HIGH)
**Duration**: Integration and bug fixes
**Goal**: Working end-to-end system

#### Task 7.1: Create Main Entry Point
- [ ] Create `frontend/landing/src/main.js`
- [ ] Initialize all services in correct order
- [ ] Handle browser autoplay policies
- [ ] Add error handling

**Instructions**:
```javascript
// frontend/landing/src/main.js

import { MetricsCollectorService } from './MetricsCollectorService.js';
import { GenerativeEngineService } from './GenerativeEngineService.js';
import { LandingAudioService } from './LandingAudioService.js';
import { LandingCanvasRenderer } from './LandingCanvasRenderer.js';
import { DashboardUI } from './DashboardUI.js';
import { stateManager } from './StateManager.js';

class LandingApp {
  constructor() {
    this.metricsCollector = new MetricsCollectorService();
    this.generativeEngine = new GenerativeEngineService();
    this.audioService = new LandingAudioService();
    this.canvasRenderer = new LandingCanvasRenderer('generative-canvas');
    this.dashboardUI = new DashboardUI();
  }

  async initialize() {
    console.log('Initializing Webarmonium Landing Page...');

    // Initialize canvas renderer
    this.canvasRenderer.initialize();

    // Initialize dashboard UI
    this.dashboardUI.initialize();

    // Wait for user interaction to start audio
    const startHandler = async () => {
      await this.audioService.initialize();
      document.removeEventListener('click', startHandler);
      document.removeEventListener('keydown', startHandler);
      console.log('Audio initialized');
    };

    document.addEventListener('click', startHandler);
    document.addEventListener('keydown', startHandler);

    console.log('Landing page initialized');
  }

  async start() {
    // Start metrics collection
    this.metricsCollector.start();

    // Start generative engine
    this.generativeEngine.start();

    // Start audio
    this.audioService.start();

    // Update state
    stateManager.setPlayback(true);

    console.log('Landing page started');
  }

  stop() {
    this.metricsCollector.stop();
    this.generativeEngine.stop();
    this.audioService.stop();
    stateManager.setPlayback(false);
    console.log('Landing page stopped');
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    window.landingApp = new LandingApp();
    await window.landingApp.initialize();
  });
} else {
  (async () => {
    window.landingApp = new LandingApp();
    await window.landingApp.initialize();
  })();
}
```

#### Task 7.2: Update Module Scripts in HTML
- [ ] Add type="module" to main.js script
- [ ] Ensure correct import paths
- [ ] Test in browser

#### Task 7.3: Test with Mock Data
- [ ] Create test mode with MockMetricsGenerator
- [ ] Verify all components receive data
- [ ] Test audio generation
- [ ] Test visual rendering
- [ ] Test parameter updates

#### Task 7.4: Test with Real APIs
- [ ] Enable Wikipedia API
- [ ] Enable HackerNews API
- [ ] Enable GitHub API
- [ ] Verify rate limiting
- [ ] Handle API errors gracefully

---

### Phase 8: Polish & Optimization (Priority: LOW)
**Duration**: Refinement
**Goal**: Production-ready experience

#### Task 8.1: Performance Optimization
- [ ] Implement connection pooling for API calls
- [ ] Add debouncing for parameter updates
- [ ] Optimize canvas rendering (reduce draw calls)
- [ ] Add memory cleanup for old data

#### Task 8.2: Visual Enhancements
- [ ] Add gradient backgrounds based on complexity
- [ ] Implement smooth transitions for color changes
- [ ] Add particle effects for high activity
- [ ] Responsive design improvements

#### Task 8.3: Error Handling
- [ ] Add retry logic for failed API calls
- [ ] Display error messages to user
- [ ] Graceful degradation if APIs unavailable
- [ ] Add logging for debugging

#### Task 8.4: Documentation
- [ ] Add README for landing page
- [ ] Document API dependencies
- [ ] Add browser compatibility notes
- [ ] Create troubleshooting guide

---

## 🧪 Testing Checklist

### Manual Testing

- [ ] Landing page loads without errors
- [ ] Metrics display updates with real data
- [ ] Start/Stop buttons work correctly
- [ ] Volume slider changes audio level
- [ ] Intensity slider affects generative output
- [ ] Canvas renders smoothly at 60fps
- [ ] Audio plays without lag or distortion
- [ ] Browser console has no errors
- [ ] API rate limits are respected
- [ ] Page works in Chrome, Firefox, Safari

### Automated Testing (Future)

- [ ] Unit tests for StateManager
- [ ] Unit tests for metric calculations
- [ ] Integration tests for API calls
- [ ] End-to-end tests with mock data

---

## 📝 Implementation Notes

### Key Decisions Made

1. **No Backend Required**: All API calls made from frontend to simplify deployment
2. **Polling over Webhooks**: Simpler for public APIs, no server needed
3. **Tone.js for Audio**: Reuses existing Webarmonium audio infrastructure
4. **Educational Dashboard**: Shows mapping between metrics and generative output

### Future Enhancements

1. **Backend Caching**: Add `backend/src/landing/MetricsAggregator.js` to cache API responses
2. **Additional Metrics**: Add Reddit API when rate limits improve
3. **User Customization**: Allow users to select which metrics to use
4. **Recording**: Allow users to save generative sessions
5. **Social Sharing**: Share generated music/visuals

### Deployment Considerations

1. **CORS**: All selected APIs support CORS
2. **Rate Limits**: Conservative polling intervals to avoid blocking
3. **Browser Support**: Modern browsers with ES6 module support
4. **HTTPS**: Required for Tone.js audio context

---

## 🎯 Success Criteria

✅ Landing page loads and displays metrics
✅ Real-time data from at least 2 APIs
✅ Audio generates based on metrics
✅ Canvas renders generative visuals
✅ Educational dashboard shows metric-to-art mapping
✅ Start/Stop controls work
✅ No browser console errors
✅ Smooth 60fps animation
✅ Audio plays without user interaction issues

---

## 📅 Timeline Estimate

- Phase 1 (Foundation): 2-3 hours
- Phase 2 (Metrics): 2-3 hours
- Phase 3 (Generative Engine): 2-3 hours
- Phase 4 (Audio): 2-3 hours
- Phase 5 (Canvas): 3-4 hours
- Phase 6 (Dashboard UI): 1-2 hours
- Phase 7 (Integration): 2-3 hours
- Phase 8 (Polish): 2-3 hours

**Total**: 16-23 hours of development

---

*Document version: 1.0*
*Last updated: 2025-12-31*
*Author: Claude Code (Webarmonium Project)*
