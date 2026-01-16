# Webarmonium Marketing Launch Guide

**Data creazione:** 2026-01-16
**URL:** https://webarmonium.net

---

## Timing Ottimale (Fuso Orario Italiano)

| Piattaforma | Giorno | Ora IT | Note |
|-------------|--------|--------|------|
| **Product Hunt** | Martedì/Mercoledì/Giovedì | 09:01 | Reset giornaliero alle 09:00 IT |
| **Hacker News** | 1-2 giorni dopo PH | 15:00-17:00 | Mattina US, massima attività |
| **Reddit** | Stesso giorno di HN | 18:00-20:00 | Pomeriggio US |
| **Twitter/X** | Giorno di PH | 09:00 + 15:00 | Due post: lancio + reminder |

**Strategia:** Product Hunt prima, poi HN dopo 1-2 giorni per non dividere l'attenzione.

---

## Product Hunt

### Informazioni Base

- **Name:** Webarmonium
- **Tagline:** Real-time generative music from Wikipedia, HackerNews & GitHub
- **URL:** https://webarmonium.net
- **Topics:** Music, Web Apps, Creative Tools, Developer Tools

### Description

```
Webarmonium transforms internet activity into real-time generative music.

The landing page monitors three public data sources:
• Wikipedia - Every edit becomes a bass note
• HackerNews - Every new post becomes a melody
• GitHub - Every commit becomes an accent

The music is fully deterministic—same activity, same composition. No randomness, just pure data-to-sound mapping.

In collaborative rooms, up to 4 people can create music together through gestures:
• Tap for percussive notes
• Drag for melodic phrases

The room develops "environmental memory"—your gestures shape its personality over 24 hours.

Built with Web Audio API, Tone.js, Socket.io, and p5.js. No account needed, completely free.
```

### First Comment (Maker's Comment)

```
Hey Product Hunt! 👋

I'm Paolo, and I built Webarmonium with Patrick.

The idea started with a simple question: what does the internet sound like?

Not metaphorically—literally. If every data event was a musical note, what would emerge?

So I connected to Wikipedia's recent changes stream, HackerNews' API, and GitHub's public events. Each source maps to different instruments and frequency ranges.

The result is surprisingly musical. The constant flow of human activity creates rhythms and melodies that feel organic, even though every note is deterministically derived from the data.

The collaborative rooms take it further—you can jam with strangers through simple gestures. The room "learns" from how people play and develops its own character over time.

Tech stack: Vanilla JS, Tone.js for audio, Socket.io for real-time sync, p5.js for visuals. All running on a simple Node.js backend.

Try it: https://webarmonium.net

Would love your feedback—especially on the audio experience and mobile usability!
```

### Assets da Caricare

1. `webarmonium-logo-512.png` - Logo principale (thumbnail)
2. `og-image.png` - Screenshot landing page (gallery)
3. Screenshot room collaborativa (gallery)
4. Video demo se disponibile (gallery)

---

## Hacker News

### Show HN Post

**Title:**
```
Show HN: Webarmonium – Listen to Wikipedia, HackerNews, and GitHub in real-time
```

**Comment (postare subito dopo il link):**

```
I built Webarmonium to answer a question: what does the internet sound like?

The landing page connects to three real-time data streams:
- Wikipedia Recent Changes API
- HackerNews newstories endpoint
- GitHub public events

Each event maps to musical parameters:
- X position → frequency (220-880 Hz)
- Y position → harmonic shift and amplitude
- Source → instrument timbre

The composition is fully deterministic. Given the same input data, you'd hear the exact same music.

The collaborative rooms let up to 4 people create music through tap and drag gestures. The room develops "environmental memory" based on interaction patterns over 24 hours.

Stack: Vanilla JS, Tone.js, Socket.io, p5.js, Node.js on a $6 DigitalOcean droplet.

Technical deep-dive: https://webarmonium.net/technical-appendix.html

Happy to answer questions about the audio synthesis, the data mapping algorithms, or the real-time sync architecture.
```

---

## Reddit

### r/InternetIsBeautiful

**Title:**
```
Webarmonium: A website that turns Wikipedia edits, HackerNews posts, and GitHub commits into real-time generative music
```

**Post:**
```
I built this as an experiment in data sonification.

The landing page monitors three public data streams and converts each event into musical notes. Wikipedia edits become bass, HN posts become melodies, GitHub commits become accents.

You can also join collaborative rooms where up to 4 people create music together through gestures.

https://webarmonium.net

No account needed, works on mobile too.
```

---

### r/WebDev

**Title:**
```
I built a real-time collaborative music app with vanilla JS, Tone.js, and Socket.io
```

**Post:**
```
Just launched Webarmonium - a generative music platform that sonifies internet activity.

Tech stack:
- Frontend: Vanilla JS (no React/Vue), p5.js for visuals
- Audio: Tone.js + Web Audio API
- Real-time: Socket.io for multi-user sync
- Backend: Node.js + Express
- Hosting: DigitalOcean + nginx + Let's Encrypt

Some interesting challenges I solved:
- Audio context resumption across browser tabs
- 60fps canvas rendering with WebSocket sync
- Gesture-to-music mapping with deterministic output
- Environmental memory that persists user patterns

Live: https://webarmonium.net
Technical docs: https://webarmonium.net/technical-appendix.html

Happy to discuss the architecture!
```

---

### r/WeAreTheMusicMakers

**Title:**
```
I made a generative music tool that turns internet activity into ambient compositions
```

**Post:**
```
Webarmonium converts real-time web data into music:

- Wikipedia edits → bass frequencies
- HackerNews posts → melodic phrases
- GitHub commits → percussive accents

The result is surprisingly listenable ambient music that changes based on global internet activity.

You can also join rooms and create music collaboratively through gestures - tap for percussive sounds, drag for melodic phrases.

https://webarmonium.net

Built with Tone.js and Web Audio API. Completely free, no account needed.
```

---

## Twitter/X

### Tweet di Lancio (09:00 IT)

```
🎵 Just launched Webarmonium

The internet is playing music.

Every Wikipedia edit, HackerNews post, and GitHub commit becomes a note in a real-time generative composition.

Join collaborative rooms and create music with strangers through gestures.

Try it → https://webarmonium.net

#GenerativeMusic #WebAudio
```

### Tweet Reminder (15:00 IT)

```
Wikipedia editors are composing bass lines right now.

HackerNews posters are creating melodies.

GitHub developers are adding percussion.

All happening live on Webarmonium → https://webarmonium.net
```

### Thread Tecnico (opzionale)

```
🧵 How I built Webarmonium - a real-time music platform that sonifies the internet

1/ The idea: What if every internet event was a musical note?

2/ Data sources:
- Wikipedia Recent Changes (EventSource)
- HackerNews API (polling)
- GitHub Events (polling)

3/ Audio mapping:
- X position → frequency (220-880 Hz)
- Y position → harmonics + amplitude
- Source → instrument timbre

4/ Stack:
- Vanilla JS (no framework)
- Tone.js for synthesis
- Socket.io for multi-user sync
- p5.js for visuals

5/ Try it: https://webarmonium.net

Technical docs: https://webarmonium.net/technical-appendix.html
```

---

## Checklist Lancio

### Giorno Prima
- [ ] Verificare che il sito funzioni (HTTPS, audio, rooms)
- [ ] Testare su mobile
- [ ] Preparare Product Hunt draft
- [ ] Avvisare amici/network per supporto iniziale

### Giorno del Lancio (Product Hunt)
- [ ] 09:00 IT - Submit su Product Hunt
- [ ] 09:05 IT - Postare First Comment
- [ ] 09:10 IT - Tweet di lancio
- [ ] 15:00 IT - Tweet reminder
- [ ] Monitorare commenti PH e rispondere

### Giorno 2-3 (Hacker News + Reddit)
- [ ] 15:00 IT - Post su Hacker News
- [ ] 18:00 IT - Post su Reddit (r/InternetIsBeautiful)
- [ ] 18:30 IT - Post su Reddit (r/WebDev)
- [ ] Monitorare e rispondere ai commenti

---

## Monitoraggio

### Endpoint da controllare
- `https://webarmonium.net/health`
- `https://webarmonium.net/api/metrics`

### Metriche da tracciare
- Utenti concorrenti (picco durante lancio)
- Rooms attive
- Errori nel log del server

### Comandi utili (sul server)
```bash
# Connessioni attive
curl https://webarmonium.net/api/metrics

# Log in tempo reale
sudo journalctl -u webarmonium-backend -f

# Stato servizi
sudo systemctl status webarmonium-backend webarmonium-frontend
```
