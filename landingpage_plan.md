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
│  ┌──────────────────┐    ┌──────────────────┐                        │
│  │ MetricsCollector │───▶│ MetricsToGesture │                        │
│  │ Service          │    │ Adapter          │                        │
│  │ (NEW)            │    │ (NEW)            │                        │
│  └──────────────────┘    └──────────────────┘                        │
│           │                       │                                  │
│           │                       ▼                                  │
│           │              ┌──────────────────┐                        │
│           │              │  StateManager    │                        │
│           │              │  (NEW)           │                        │
│           │              └──────────────────┘                        │
│           │                       │                                  │
│           ▼                       ▼                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              REUSED FROM ROOMS (No changes!)                 │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  ┌─────────────────────┐    ┌─────────────────────────────┐  │   │
│  │  │ GenerativeVisual    │    │ AudioService                │  │   │
│  │  │ Service             │    │ (Three-tier: bg/remote/local)│  │   │
│  │  │                     │    │                             │  │   │
│  │  │ • SpringMeshNetwork │    │ • MusicalScheduler          │  │   │
│  │  │ • WavePacketSystem  │    │ • LFOManager                │  │   │
│  │  │ • ParticleFlowMgr   │    │ • 6 Algorithmic Generators   │  │   │
│  │  └─────────────────────┘    └─────────────────────────────┘  │   │
│  │                                                               │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────┐                                              │
│  │ DashboardUI      │                                              │
│  │ (Educational)    │                                              │
│  └──────────────────┘                                              │
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

### Key Design Decision: **REUSE EXISTING CODE**

The landing page will **reuse the existing audio and visual systems** from the rooms to ensure consistency:

- **Visual**: Reuse `GenerativeVisualService.js` (SpringMeshNetwork, WavePacketSystem, ParticleFlowManager)
- **Audio**: Reuse `AudioService.js` (Three-tier architecture, 6 algorithmic generators, LFOManager)
- **NEW**: Only the input layer changes - `MetricsCollectorService` + `MetricsToGestureAdapter`

This ensures:
- ✅ Same visual aesthetic (spring-mesh networks with pulses and particles)
- ✅ Same musical experience (single notes, phrases, background layers)
- ✅ Less code to maintain
- ✅ Consistent user experience across landing page and rooms

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
│   │       ├── MetricsCollectorService.js    # NEW - Poll external APIs
│   │       ├── MetricsToGestureAdapter.js    # NEW - Convert metrics → gesture format
│   │       ├── StateManager.js               # NEW - State management
│   │       └── DashboardUI.js                # NEW - Educational UI components
│   └── src/
│       └── services/
│           ├── GenerativeVisualService.js  # REUSED - No changes!
│           ├── AudioService.js             # REUSED - No changes!
│           ├── SocketService.js            # REUSED - Not used on landing
│           └── ...                         # Other services reused as-is
├── backend/
│   └── (no changes needed - landing page is frontend-only)
└── landingpage_plan.md                    # This file
```

### New Files to Create: **Only 4 files!**
1. `frontend/landing/index.html` - Page structure
2. `frontend/landing/styles.css` - Styling
3. `frontend/landing/src/MetricsCollectorService.js` - API polling
4. `frontend/landing/src/MetricsToGestureAdapter.js` - Metrics → Gesture conversion
5. `frontend/landing/src/StateManager.js` - State management
6. `frontend/landing/src/DashboardUI.js` - UI updates

### Reused from Rooms (No Changes):
- `GenerativeVisualService.js` - Spring-mesh, pulses, particles
- `AudioService.js` - Three-tier audio, algorithmic generators

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
- [ ] Emit metric update events

**Instructions**:
```javascript
// frontend/landing/src/MetricsCollectorService.js

/**
 * MetricsCollectorService
 * Polls external APIs (Wikipedia, HackerNews, GitHub) for real-time web activity metrics
 * Emits 'metrics:updated' events with collected data
 */
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

    // Current metrics state
    this.metrics = {
      wikipedia: { editsPerMinute: 0, newArticles: 0, avgEditSize: 0 },
      hackernews: { postsPerMinute: 0, avgUpvotes: 0, commentCount: 0 },
      github: { commitsPerMinute: 0, openPRs: 0, newStars: 0 }
    };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._poll();
    this.intervalId = setInterval(() => this._poll(), 5000);
    console.log('📊 MetricsCollectorService started');
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('📊 MetricsCollectorService stopped');
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

    // Emit metrics update event
    this._emitMetricsUpdate();
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

        this.metrics.wikipedia = {
          editsPerMinute: recentEdits.length,
          newArticles: recentNew.length,
          avgEditSize: Math.abs(avgSize)
        };
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

        this.metrics.hackernews = {
          postsPerMinute: recentPosts.length,
          avgUpvotes: avgUpvotes,
          commentCount: totalComments
        };
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

      this.metrics.github = {
        commitsPerMinute: commits,
        openPRs: prs,
        newStars: stars
      };
    } catch (error) {
      console.warn('GitHub fetch error:', error);
    }
  }

  _emitMetricsUpdate() {
    const event = new CustomEvent('metrics:updated', {
      detail: { ...this.metrics }
    });
    window.dispatchEvent(event);
  }

  getMetrics() {
    return { ...this.metrics };
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

### Phase 3: Metrics-to-Gesture Adapter (Priority: HIGH)
**Duration**: Core logic
**Goal**: Convert web metrics into gesture data format for existing services

#### Task 3.1: Create MetricsToGestureAdapter
- [ ] Create `frontend/landing/src/MetricsToGestureAdapter.js`
- [ ] Implement metric-to-gesture mapping
- [ ] Generate synthetic cursor positions from metrics
- [ ] Create virtual "user" for landing page
- [ ] Emit gesture events compatible with existing services

**Key Concept**: Instead of creating new audio/visual systems, we **convert web metrics into gesture data** that the existing `GenerativeVisualService` and `AudioService` already understand. This ensures perfect consistency with room experience.

**Instructions**:
```javascript
// frontend/landing/src/MetricsToGestureAdapter.js

/**
 * MetricsToGestureAdapter
 * Converts web activity metrics into gesture data compatible with existing Webarmonium services
 *
 * This adapter creates a virtual "user" representing global web activity.
 * The virtual user's position and gestures are derived from Wikipedia, HN, and GitHub metrics.
 */
export class MetricsToGestureAdapter {
  constructor() {
    // Virtual user ID for landing page
    this.userId = 'landing-page-global-activity';

    // Current metrics state
    this.metrics = {
      wikipedia: { editsPerMinute: 0, newArticles: 0, avgEditSize: 0 },
      hackernews: { postsPerMinute: 0, avgUpvotes: 0, commentCount: 0 },
      github: { commitsPerMinute: 0, openPRs: 0, newStars: 0 }
    };

    // Current gesture state
    this.currentGesture = {
      type: 'idle',
      coordinates: { x: 0.5, y: 0.5 },
      velocity: { x: 0, y: 0 },
      intensity: 0.5,
      isActive: false,
      holdStart: null
    };

    // References to existing services (injected)
    this.visualService = null;
    this.audioService = null;

    // Event timing
    this.lastGestureTime = 0;
    this.gestureInterval = 2000; // Base interval in ms
    this.eventTimer = null;

    // Listen for metric updates
    window.addEventListener('metrics:updated', this._onMetricsUpdated.bind(this));
  }

  /**
   * Initialize with references to existing services
   * @param {GenerativeVisualService} visualService
   * @param {AudioService} audioService
   */
  initialize(visualService, audioService) {
    this.visualService = visualService;
    this.audioService = audioService;
    console.log('🔄 MetricsToGestureAdapter initialized');
  }

  /**
   * Start generating gestures from metrics
   */
  start() {
    this._scheduleNextGesture();
    console.log('🔄 MetricsToGestureAdapter started');
  }

  /**
   * Stop generating gestures
   */
  stop() {
    if (this.eventTimer) {
      clearTimeout(this.eventTimer);
      this.eventTimer = null;
    }

    // End active gesture
    if (this.currentGesture.isActive) {
      this._emitGestureEnd();
    }
  }

  /**
   * Handle incoming metric updates
   */
  _onMetricsUpdated(event) {
    this.metrics = event.detail;
    this._updateCursorPosition();
  }

  /**
   * Update virtual cursor position based on metrics
   * Maps web activity to 2D space for visual/audio rendering
   */
  _updateCursorPosition() {
    const { wikipedia, hackernews, github } = this.metrics;

    // X position: Balance between Wikipedia edits and GitHub commits
    // Left (0) = Wikipedia-dominant, Right (1) = GitHub-dominant
    const totalActivity = wikipedia.editsPerMinute + github.commitsPerMinute + 1;
    const x = github.commitsPerMinute / totalActivity;

    // Y position: Based on HackerNews upvotes (normalized)
    // Bottom (0) = low engagement, Top (1) = high engagement
    const y = Math.min(hackernews.avgUpvotes / 100, 1.0);

    // Calculate intensity from combined activity
    const rawIntensity = (
      (wikipedia.editsPerMinute / 500) +
      (hackernews.postsPerMinute / 100) +
      (github.commitsPerMinute / 50)
    ) / 3;
    const intensity = Math.min(rawIntensity, 1.0);

    // Update current gesture
    this.currentGesture.coordinates = { x, y };
    this.currentGesture.intensity = intensity;

    // Calculate velocity (for rhythm/timing)
    const prevX = this.currentGesture.coordinates._prevX || x;
    const prevY = this.currentGesture.coordinates._prevY || y;
    this.currentGesture.velocity = {
      x: (x - prevX),
      y: (y - prevY)
    };

    // Store previous position
    this.currentGesture.coordinates._prevX = x;
    this.currentGesture.coordinates._prevY = y;

    // Update visual service with new position
    if (this.visualService) {
      const color = this._getColorForActivity(intensity);
      this.visualService.updateCursorPosition(this.userId, x, y, color);
    }
  }

  /**
   * Schedule next gesture event
   * Timing based on rhythmic preference (activity level)
   */
  _scheduleNextGesture() {
    const { wikipedia, hackernews, github } = this.metrics;

    // Calculate rhythmic preference from post rate
    const rhythmicPreference = Math.min(hackernews.postsPerMinute / 100, 1.0);

    // Calculate delay: higher activity = faster gestures
    const baseDelay = 2000; // 2 seconds max
    const minDelay = 250;   // 250ms min
    const delay = baseDelay - (rhythmicPreference * (baseDelay - minDelay));

    this.eventTimer = setTimeout(() => {
      this._generateGesture();
      this._scheduleNextGesture();
    }, delay);
  }

  /**
   * Generate a gesture event based on current metrics
   */
  _generateGesture() {
    const { wikipedia, github } = this.metrics;
    const intensity = this.currentGesture.intensity;

    // Determine gesture type based on metrics
    let gestureType;
    if (wikipedia.editsPerMinute > 100) {
      gestureType = 'drag'; // Continuous activity
    } else if (github.commitsPerMinute > 20) {
      gestureType = 'tap'; // Discrete events
    } else {
      gestureType = Math.random() > 0.5 ? 'tap' : 'drag';
    }

    // Emit gesture start
    this.currentGesture.type = gestureType;
    this.currentGesture.isActive = true;
    this.currentGesture.holdStart = Date.now();

    this._emitGestureStart();

    // For tap gestures, automatically end after short duration
    if (gestureType === 'tap') {
      setTimeout(() => {
        if (this.currentGesture.isActive) {
          this._emitGestureEnd();
        }
      }, 200);
    }
  }

  /**
   * Emit gesture start event
   * Creates audio event and visual pulse
   */
  _emitGestureStart() {
    const gestureData = {
      type: this.currentGesture.type,
      velocity: this.currentGesture.velocity,
      holdStart: this.currentGesture.holdStart,
      isActive: true,
      intensity: this.currentGesture.intensity
    };

    // Update visual service (triggers pulses/particles)
    if (this.visualService) {
      this.visualService.updateGestureData(this.userId, gestureData);
    }

    // Generate audio event through AudioService
    if (this.audioService) {
      this._generateAudioFromGesture(gestureData);
    }
  }

  /**
   * Emit gesture end event
   */
  _emitGestureEnd() {
    this.currentGesture.isActive = false;
    this.currentGesture.holdStart = null;

    const gestureData = {
      type: this.currentGesture.type,
      velocity: this.currentGesture.velocity,
      isActive: false
    };

    if (this.visualService) {
      this.visualService.updateGestureData(this.userId, gestureData);
    }
  }

  /**
   * Generate audio event from gesture data
   * This uses the existing AudioService API
   */
  _generateAudioFromGesture(gestureData) {
    const { x, y } = this.currentGesture.coordinates;
    const intensity = this.currentGesture.intensity;

    // Map position to frequency (using existing AudioService logic)
    const baseFreq = 110 + (1 - y) * 440; // 110-550Hz
    const harmonic = x * 660; // 0-660Hz
    const frequency = baseFreq + harmonic;

    // Create audio parameters compatible with AudioService
    const audioParams = {
      frequency,
      intensity,
      tier: 'local',
      velocity: Math.sqrt(gestureData.velocity.x ** 2 + gestureData.velocity.y ** 2) * 100,
      envelope: {
        attack: 0.01,
        decay: 0.1 + intensity * 0.2,
        sustain: intensity * 0.5,
        release: 0.2 + intensity * 0.3
      },
      spatialParams: {
        pan: (x - 0.5) * 2, // -1 to 1
        distance: 1 - intensity,
        reverbAmount: 0.2
      }
    };

    // Trigger sound through existing AudioService
    // Note: This uses the public API of AudioService
    if (this.audioService && this.audioService.handleGestureInput) {
      this.audioService.handleGestureInput(audioParams);
    }
  }

  /**
   * Get color based on activity intensity
   * Maps to existing Webarmonium color pool
   */
  _getColorForActivity(intensity) {
    const colorPool = [
      '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
      '#ffff33', '#a65628', '#f781bf', '#999999', '#66c2a5'
    ];
    const index = Math.floor(intensity * (colorPool.length - 1));
    return colorPool[index];
  }
}
```

---

### Phase 4: Audio Integration (Priority: HIGH)
**Duration**: Audio setup
**Goal**: Reuse existing AudioService

#### Task 4.1: Integrate AudioService
- [ ] Reuse `frontend/src/services/AudioService.js` (NO changes needed!)
- [ ] Initialize AudioService in landing page
- [ ] Connect MetricsToGestureAdapter to AudioService
- [ ] Verify three-tier audio works
- [ ] Test algorithmic generators receive gesture input

**Instructions**:
The AudioService is already complete! Just instantiate it and pass gestures from the adapter:

```javascript
// In landing page main.js
import { AudioService } from '../../src/services/AudioService.js';

// Initialize
const audioService = new AudioService();
await audioService.initialize();

// Pass to adapter
metricsAdapter.initialize(visualService, audioService);
```

---

### Phase 5: Visual Integration (Priority: HIGH)
**Duration**: Visual setup
**Goal**: Reuse existing GenerativeVisualService

#### Task 5.1: Integrate GenerativeVisualService
- [ ] Reuse `frontend/src/services/GenerativeVisualService.js` (NO changes needed!)
- [ ] Initialize GenerativeVisualService in landing page
- [ ] Connect MetricsToGestureAdapter to visual service
- [ ] Verify spring-mesh network renders
- [ ] Test pulses and particles on metric updates

**Instructions**:
The GenerativeVisualService is already complete! Just instantiate it:

```javascript
// In landing page main.js
import { GenerativeVisualService } from '../../src/services/GenerativeVisualService.js';

// Get canvas container
const canvasContainer = document.getElementById('canvas-container');

// Initialize
const visualService = new GenerativeVisualService();
visualService.initialize(canvasContainer);

// Pass to adapter
metricsAdapter.initialize(visualService, audioService);
```

**Note**: GenerativeVisualService includes:
- ✅ SpringMeshNetwork for physics simulation
- ✅ WavePacketSystem for pulse propagation
- ✅ ParticleFlowManager for particle effects
- ✅ 60fps rendering with performance monitoring

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
