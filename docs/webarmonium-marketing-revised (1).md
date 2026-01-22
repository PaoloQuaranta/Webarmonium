# Webarmonium Marketing Launch Guide — Revised

**Data creazione:** 2026-01-17
**URL:** https://webarmonium.net

---

## Product Hunt

### Informazioni Base

- **Name:** Webarmonium
- **Tagline:** A musical instrument played by network traffic and distributed gestures
- **URL:** https://webarmonium.net
- **Topics:** Music, Web Apps, Creative Tools, Developer Tools

### Description

```
Webarmonium is a new instrument.

Traditional instruments translate a performer's physical gestures into sound. Webarmonium replaces the individual gesture with two forms of distributed interaction:

1. Network activity as unconscious performance
The landing page connects to three real-time data streams—Wikipedia edits, HackerNews posts, and GitHub commits. Each event becomes a note: position determines frequency, source determines timbre. The resulting composition emerges from collective human activity, with no single author.

2. Remote motor gestures as collaborative performance
In private rooms, up to 4 users become performers. Tap, hold, and drag gestures generate musical phrases. The room develops "environmental memory"—interaction patterns shape its tonal character over 24 hours.

The system is fully deterministic: identical input produces identical output. There is no randomness, only the structured translation of human activity into sound.

Built with Web Audio API, Tone.js, Socket.io, and p5.js. No account required.
```

### First Comment (Maker's Comment)

```when
Webarmonium in an instrument where the performer's gesture is replaced by distributed interactions.

Traditional instruments require co-presence—a musician's hand on strings, breath through a reed. Digital instruments have expanded the gesture vocabulary, but the paradigm remains: one performer, one instrument, one moment.

Webarmonium proposes two alternatives:

The landing page treats network traffic as an unconscious, collective performance. Wikipedia editors, HN posters, and GitHub developers aren't trying to make music—but their activity, mapped to frequency and timbre, producesis turned in coherent sonic output. The composition has no author; it emerges from the aggregate behavior of thousands of users who will never hear it.

The collaborative rooms restore intentionality but distribute it. Up to 4 remote users perform together through simple motor gestures. The room accumulates an "environmental memory" that shapes its response over time—a kind of learned instrument personality.

The technical implementation is deliberately simple: vanilla JS, Tone.js for synthesis, Socket.io for synchronization. The complexity lies in the mapping algorithms and the real-time data architecture.

A note on methodology: Webarmonium is entirely vibe coded. The codebase was developed through iterative dialogue with Claude, from architecture decisions to implementation details.


https://webarmonium.net
```

---

## Hacker News

### Show HN Post

**Title:**
```
Show HN: Webarmonium – A musical instrument played by network traffic and remote gestures
```

**Comment:**

```
Webarmonium is an instrument that is played by remote gestural interactions.
It is played by two alternative input sources:

1. Aggregate network activity (landing page)
Three real-time streams—Wikipedia Recent Changes, HackerNews newstories, GitHub public events—feed into a synthesis engine. Each event maps to musical parameters: horizontal position determines frequency (220-880 Hz), vertical position modulates harmonics and amplitude, source determines instrument timbre. The output is deterministic: given identical input data, the system produces identical audio.

2. Distributed motor gestures (collaborative rooms)
Up to 4 remote users perform together through tap, hold, and drag interactions. The room maintains "environmental memory"—a 24-hour rolling model of interaction patterns that influences tonal response.

The first mode produces music without performers (or rather, with performers who don't know they're performing). The second distributes performance across space and, through environmental memory, across time.

Stack: Vanilla JS, Tone.js, Socket.io, p5.js, Node.js. Runs on a $6 DigitalOcean droplet.

Development note: the entire codebase is vibe coded—built through iterative dialogue with Claude, from system architecture to implementation.



```

---

## Reddit

### r/InternetIsBeautiful

**Title:**
```
Webarmonium: A musical instrument that uses Wikipedia edits, HackerNews posts, and GitHub commits as its input mechanism
```

**Post:**
```
Webarmonium treats network traffic as a form of distributed, unconscious performance.

The landing page connects to three real-time data streams. Each event—an edit, a post, a commit—becomes a musical note. The mapping is deterministic: position determines pitch, source determines timbre.

The result is a continuous composition with no single author, emerging from the aggregate activity of thousands of users who will never hear it.

In collaborative rooms, the input shifts to intentional gesture: up to 4 remote users perform together through tap and drag movements.

https://webarmonium.net

No account needed.
```

---

### r/WebDev

**Title:**
```
I built a real-time instrument that treats network traffic and distributed gestures as musical input
```

**Post:**
```
Just launched Webarmonium—an experiment in data sonification.

The landing page sonifies three data streams (Wikipedia, HN, GitHub). Collaborative rooms let remote users perform together through motor gestures, with the room developing "environmental memory" over 24 hours.

Technical stack:
- Frontend: Vanilla JS, p5.js for visualization
- Audio: Tone.js + Web Audio API
- Real-time sync: Socket.io
- Backend: Node.js + Express
- Infrastructure: DigitalOcean + nginx + Let's Encrypt

Architectural challenges worth noting:
- Deterministic data-to-audio mapping (identical input → identical output)
- Environmental memory model (24-hour rolling interaction pattern analysis)
- Cross-browser audio context management
- 60fps canvas rendering synchronized with WebSocket state

Development methodology: entirely vibe coded with Claude. No traditional IDE, no manual debugging sessions—just iterative dialogue from architecture to deployment. 

Live: https://webarmonium.net
Technical docs: https://webarmonium.net/technical-appendix.html


```

---

### r/WeAreTheMusicMakers

**Title:**
```
Webarmonium: an instrument where the input is network traffic and distributed gestures instead of individual performance
```

**Post:**
```
I've been working on Webarmonium—a project that replaces performer's gesture with distributed interactions.

The landing page connects to Wikipedia, HackerNews, and GitHub in real-time. Each event becomes a note: edits produce bass frequencies, posts generate melodic content, commits add percussive accents. The composition emerges from collective activity—thousands of people making music without knowing it.

The collaborative rooms restore performer intentionality but distribute it across space. Up to 4 remote users generate sound through tap and drag gestures. The room develops "environmental memory," learning from interaction patterns over 24 hours.

https://webarmonium.net

Built with Tone.js and Web Audio API. 
```

---

## Twitter/X

### Tweet di Lancio (09:00 IT)

```
Webarmonium: a musical instrument with an unconventional input mechanism.

Instead of a performer's gesture, it uses:
— Network traffic (Wikipedia, HN, GitHub)
— Distributed motor gestures from remote users

The composition emerges from collective activity.

→ https://webarmonium.net
```

### Tweet Reminder (15:00 IT)

```
Right now, Wikipedia editors are generating bass frequencies.

HackerNews posters are producing melodic phrases.

GitHub developers are adding percussive accents.

None of them know they're performing.

→ https://webarmonium.net
```

### Tweet Alternativo (Concettuale)

```
Traditional instruments: one performer, one gesture, one sound.

Webarmonium: thousands of performers who don't know they're performing, producing a composition with no single author.

→ https://webarmonium.net
```

### Tweet Minimalista

```
A musical instrument played by network traffic.

→ https://webarmonium.net
```

### Tweet per Developer

```
Data sonification experiment:

Wikipedia edits → bass synthesis
HN posts → melodic generation  
GitHub commits → percussive accents

Deterministic mapping. No randomness.

Vanilla JS, Tone.js, Socket.io, p5.js.

Entirely vibe coded with Claude.

https://webarmonium.net
```

### Tweet Vibe Coding

```
Webarmonium is 100% vibe coded.

Architecture, implementation, deployment—all through iterative dialogue with Claude.

An instrument that redefines performance input, built through a process that redefines development input.

→ https://webarmonium.net
```

### Tweet con Video/GIF

```
30 seconds of network traffic as musical performance.

Each event is real data:
🔴 Wikipedia edit
🟠 HackerNews post
🔵 GitHub commit

Thousands of unconscious performers, one emergent composition.

[VIDEO/GIF]

→ https://webarmonium.net
```

### Thread Tecnico

```
🧵 Webarmonium: designing a musical instrument with distributed input

1/ The premise: what if the performer's gesture was replaced by aggregate network activity?

2/ Input sources:
- Wikipedia Recent Changes (EventSource stream)
- HackerNews API (polling)
- GitHub Events API (polling)

3/ Mapping logic:
- X position → frequency (220-880 Hz)
- Y position → harmonic content + amplitude
- Source → instrument timbre

4/ Key constraint: deterministic output. Identical input must produce identical audio. No randomness in the synthesis chain.

5/ Collaborative rooms add a second input mode: intentional gesture from remote users, with environmental memory that shapes room behavior over 24 hours.

6/ Stack: Vanilla JS, Tone.js, Socket.io, p5.js. No framework, no build step.

7/ Development: 100% vibe coded with Claude. Architecture to deployment through iterative dialogue. 

→ https://webarmonium.net
Technical docs: https://webarmonium.net/technical-appendix.html
```

---

## Instagram

### Bio Suggerita

```
Webarmonium
A musical instrument played by network traffic
and distributed gestures
↓ 
webarmonium.net
```

### Post Feed - Lancio Principale

**Immagine:** og-image.png o screenshot della landing page

**Caption:**
```
Webarmonium is a musical instrument with an unconventional input mechanism.

Traditional instruments translate a performer's physical gesture into sound. Webarmonium replaces the individual gesture with distributed interactions:

🔴 Wikipedia edits generate bass frequencies
🟠 HackerNews posts produce melodic phrases
🔵 GitHub commits add percussive accents

The composition has no single author. It emerges from the aggregate activity of thousands of users who will never hear it—an unconscious, collective performance.

In collaborative rooms, up to 4 remote users can perform together through tap and drag gestures. The room develops "environmental memory," learning from interaction patterns over time.

Link in bio → webarmonium.net

#generativemusic #creativecoding #datasonification #experimentalmusic #soundart #newmediaart #webaudio #musictech #digitalinstrument #networkedmusic #collaborativemusic #tonejs #javascript #creativetechnology
```

### Post Feed - Behind the Scenes

**Immagine:** Screenshot del codice o architettura

**Caption:**
```
The architecture of distributed performance.

Webarmonium connects to three real-time data streams:

1. Wikipedia Recent Changes API — edits from editors worldwide
2. HackerNews — new posts as they appear
3. GitHub public events — commits, pull requests, stars

Each event maps to synthesis parameters:
• Position → frequency (pitch)
• Source → instrument timbre
• Timing → rhythmic structure

The mapping is deterministic: identical input produces identical output. The apparent musicality emerges from the structure of human activity, not from randomness.

Technical stack: vanilla JavaScript, Tone.js, Socket.io, p5.js. No frameworks.

Development: entirely vibe coded with Claude—architecture, implementation, deployment through iterative dialogue. An instrument that redefines input, built by redefining how code gets written.

→ link in bio

#sounddesign #datasonification #creativecoding #javascript #webdevelopment #musicproduction #generativeart #algorithmiccomposition #webaudio
```

### Post Feed - Collaborative Rooms

**Immagine:** Screenshot di una room con più cursori

**Caption:**
```
Distributed performance across space and time.

In Webarmonium's collaborative rooms, up to 4 remote users become performers:

👆 Tap → percussive attack
✋ Hold → sustained tone
👉 Drag → melodic phrase

The room maintains "environmental memory"—a model of interaction patterns that evolves over 24 hours. How users play today shapes how the room responds tomorrow.

This creates a temporal distribution of authorship: the current performance is influenced by past performers who have already left.

→ webarmonium.net (link in bio)

#collaborativemusic #networkmusic #distributedperformance #experimentalmusic #soundart #newmedia #creativetechnology #realtimemusic
```

### Reel / Video Post

**Durata:** 30-60 secondi
**Contenuto:** Screen recording della landing page con audio

**Caption:**
```
Network traffic as musical performance.

Every sound you hear corresponds to a real event:
🔴 Wikipedia edit
🟠 HackerNews post
🔵 GitHub commit

Thousands of people generating music without knowing it.

The composition has no author—it emerges from collective activity.

→ link in bio

#generativemusic #datasonification #ambientmusic #experimentalmusic #soundart #creativecoding #newmediaart
```

### Stories Ideas

**Story 1 - Hook:**
```
[Video 5 sec della landing page]
Testo: "A musical instrument with no performer"
Sticker: Link
```

**Story 2 - Explanation:**
```
[Screenshot con annotazioni]
Testo: "Input: network traffic"
🔴 Wikipedia edits
🟠 HN posts  
🔵 GitHub commits
"Output: emergent composition"
```

**Story 3 - CTA:**
```
[Video della room collaborativa]
Testo: "Or perform with remote users"
Sticker: Link + Poll "Instrument or installation?"
```

---

## Checklist e Monitoraggio

*(Invariati rispetto alla versione originale)*
