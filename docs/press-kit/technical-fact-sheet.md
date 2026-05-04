# Technical Fact Sheet — Webarmonium

For festival juries, technical curators, and writers who need precise specifications.

---

## Identification

| | |
|---|---|
| **Title** | Webarmonium |
| **Year** | 2026 |
| **Artist** | Paolo Quaranta |
| **Type** | Browser-based networked musical instrument / generative sonification / multi-user collaborative net art |
| **Medium** | Vanilla JavaScript, Web Audio API, WebSockets, HTML Canvas, WebGL (PixiJS) |
| **Duration** | Continuous, persistent (live since 2026) |
| **Edition** | Single, persistent, public artwork; not editioned, not packaged |
| **Location** | https://webarmonium.net |

---

## Runtime requirements

- Any modern browser with Web Audio API support (Chrome, Firefox, Safari, Edge, ≤2 years old)
- Internet connection
- Audio output device (speakers or headphones recommended)
- Mouse, touch, or gyroscope input (cross-platform input normalisation)
- No account, no installation, no admission fee

---

## Performance characteristics

| Metric | Target |
|---|---|
| Frame rate (canvas rendering) | 60 fps |
| WebSocket latency (gesture round-trip) | < 100 ms |
| API response time (p95) | < 200 ms |
| UI interaction response | < 100 ms |
| Concurrent users per room | Up to 4 performers + listeners |
| Memory footprint (per session) | < 100 MB baseline, < 500 MB peak |
| Environmental memory retention | 24-hour rolling window per room |

---

## Data sources (live, public)

| Source | API | Polling | What we use |
|---|---|---|---|
| Wikipedia | RecentChanges API (English) | every 5 s | Page title, edit type, byte delta |
| HackerNews | Firebase API (`newstories`) | every 10 s | Story title, author, score |
| GitHub | Public Events API | every 60 s | Repository name, event type, actor |

All data is public, anonymous in aggregate, and rate-limit-respecting. No personally identifying information is stored or transmitted.

---

## Sound generation

| Layer | Description |
|---|---|
| **Background composition** | Algorithmic generative engine driven by web data + room state. Models musical form (ABA, rondo, sonata-style), voice leading, key/mode management, and twenty genre profiles. |
| **Per-source virtual users** (landing) | Three virtual performers (Wikipedia / HN / GitHub) generate gestures and notes from data velocity. Each has a distinct tessitura and timbre. Cursor positions are reverse-mapped from generated frequencies. |
| **Per-user voices** (rooms) | Eight synth presets shaped through a per-user sound-design panel; gestural input maps to pitch, velocity, articulation. |
| **Drum machine** | Three fully synthesized drum kits (808, Acoustic, Electronic). No sample files — all sound is synthesized live. |
| **Step sequencer** | 3–16 step programmable rhythmic/melodic patterns, beat-quantised to room tempo. |
| **Audition mode** | Autonomous phrase generation using PHI (golden ratio) interval timing, so the instrument continues to perform when no human is touching it. |

---

## Mapping (deterministic)

The same input always produces the same output. There is no randomness anywhere in the system.

| Input axis | Musical parameter |
|---|---|
| Horizontal position | Frequency (220–880 Hz tessitura, source-dependent) |
| Vertical position | Harmonic content + amplitude |
| Data source / user identity | Timbre selection |
| Gesture velocity | Note velocity (loudness + articulation) |
| Gesture duration / type | Note duration + articulation (tap / hold / drag) |
| Network event rate | Phrase density |
| Network event acceleration | Tempo modulation cues |

---

## Software architecture

```
Frontend (browser)
  ├─ Vanilla JavaScript (no framework)
  ├─ Web Audio API + Tone.js v14.7.77        ← three-tier audio (background / remote / local)
  ├─ Socket.io client v4.7.5                 ← real-time bidirectional sync
  ├─ HTML Canvas + PixiJS                    ← visual rendering at 60fps
  └─ Cross-platform input (mouse / touch / gyroscope)

Backend (Node.js)
  ├─ Express.js                              ← REST endpoints + static
  ├─ Socket.io v4.7.5                        ← real-time event hub
  ├─ WebMetricsPoller                        ← Wikipedia / HN / GitHub polling
  ├─ BackgroundCompositionService            ← algorithmic composition engine
  ├─ HarmonicEngine, PhraseMorphology,
  │   StyleAnalyzer, MaterialLibrary         ← compositional subsystems
  ├─ RoomManager                             ← session lifecycle, capacity
  └─ EnvironmentalMemoryCoordinator          ← 24-hour rolling pattern memory
```

The work runs continuously on a single deployed server. There are no compiled binaries, no installer, no native dependencies on the client side.

---

## Open-source dependencies (acknowledgements)

- [Tone.js](https://tonejs.github.io/) — Web Audio synthesis framework
- [Socket.io](https://socket.io/) — real-time bidirectional communication
- [PixiJS](https://pixijs.com/) — WebGL rendering
- [Express.js](https://expressjs.com/) — Node HTTP framework
- [standardized-audio-context](https://github.com/chrisguttandin/standardized-audio-context) — cross-browser audio context

Full dependency manifest in `package.json` files in `frontend/` and `backend/` of the source repository.

---

## Authoring tooling (disclosure)

The codebase was developed entirely through iterative dialogue with a large language model (Claude). This is disclosed in the source comments and in the work's "How It Works" page. For art-world pitches: keep this as a technical footnote, not a headline — it has been observed that critics use the framing reductively.

---

## Documentation

- Public-facing technical explainer: https://webarmonium.net/how-it-works.html
- Source repository (open-source): https://github.com/PaoloQuaranta/Webarmonium
- Visible-causality feed (Strada A): live ticker on the landing page since v0.8.15 (2026-05-04), surfaces the specific web event that triggered each note
