# Audit Algoritmo Compositivo Webarmonium

**Data**: 2026-01-12
**Autore**: Claude Code (AI Assistant)
**Tipo**: Audit Completo Documentato (senza modifiche al codice)

---

## 1. Sintesi Esecutiva

Questo audit analizza l'algoritmo compositivo di Webarmonium, verificando l'architettura documentata vs l'implementazione reale, identificando codice legacy, parametri non utilizzati e inconsistenze musicali.

### Scoperte Principali

| Severita | Issue | Impatto | Stato |
|----------|-------|---------|-------|
| ~~CRITICO~~ | ~~SoundPatternGenerator (868 linee, 6 algoritmi) mai usato~~ | ~~Codice legacy~~ | **RISOLTO - RIMOSSO** |
| CRITICO | Duplicazione note DRAG per remote users | Audio doppio | APERTO |
| CRITICO | HoverOrchestrator genera 25+ parametri, frontend ne usa 3 | Sistema LFO inutilizzato | APERTO |
| ALTO | Three-tier audio system non implementato | Config ignorata |
| ALTO | Range frequenze inconsistenti TAP vs DRAG | Incoerenza timbrica |
| MEDIO | Parametri backend inutilizzati | Contesto musicale perso |

---

## 2. Architettura Algoritmo Compositivo

### 2.1 Sistema DOCUMENTATO (CLAUDE.md)

```
Gesture → EnhancedGestureCapture → Classification
    ↓
GestureToMusicService → BackgroundCompositionService + CompositionEngine
    ↓
Three-Tier Audio:
  - Background Layer (ambient)
  - Remote Layer (altri utenti)
  - Local Layer (utente locale)
```

### 2.2 Sistema REALE (implementazione verificata)

```
LOCAL DRAG:
  Frontend DragStreamingHandler.processDragStreamingNote()
  → gestureSynth.triggerAttackRelease() [SUONA LOCALMENTE]
  → socket.emit('note:stream') [INVIA A BACKEND]

  Backend MusicalHandler.registerNoteStreamHandler()
  → socket.to(roomId).emit('note:stream') [BROADCAST ALTRI UTENTI]

  INOLTRE a gesture:end:
  → GestureHandler ri-broadcast come musical:event [DUPLICAZIONE!]

TAP:
  Backend GestureToMusicService.generateTapPhrase()
  → socket.emit('musical:event')

  Frontend SocketEventCoordinator → playMusicalEvent()

BACKGROUND:
  BackgroundCompositionService → CompositionEngine.compose()
  → socket.emit('background-composition')

  Frontend → CompositionPlayer

HOVER:
  Backend HoverOrchestrator (802 linee)
  → genera 25+ parametri modulazione
  → socket.emit('unified-modulation')

  Frontend applyUnifiedModulation()
  → USA SOLO: filterCutoff, filterResonance, spatialPan
```

---

## 3. Sistema Compositivo Attivo

> **NOTA**: SoundPatternGenerator.js (868 linee, 6 algoritmi legacy) è stato **RIMOSSO** dal codebase il 2026-01-12.
> Il sistema utilizza ora esclusivamente CompositionEngine e i suoi motori associati.

### 3.1 Sistema Attivo: CompositionEngine

| Servizio | Chiamate | File |
|----------|----------|------|
| CompositionEngine.compose() | ~50 call sites | BackgroundCompositionService, LandingCompositionService, GestureToMusicService |
| PhraseMorphology | ATTIVO | GestureToMusicService, VirtualUserService |
| HarmonicEngine | ATTIVO | Tutti i servizi musicali |
| CounterpointEngine | ATTIVO | CompositionEngine |
| StyleAnalyzer | ATTIVO | BackgroundCompositionService |

---

## 4. Issue C-02: Duplicazione Note DRAG

### 4.1 Problema Verificato

I remote users ricevono ogni nota DRAG **DUE VOLTE**:

**Percorso 1 - Real-time** (durante il drag):
```
Frontend → note:stream → Backend → socket.to(roomId).emit('note:stream')
→ Altri utenti ricevono e suonano
```

**Percorso 2 - Batch** (a gesture:end):
```
Frontend invia gesture con streamedNotes array
→ GestureHandler.js:426-460 ri-broadcast come musical:event
→ Altri utenti ricevono e suonano DI NUOVO
```

### 4.2 Evidenza dal Codice (GestureHandler.js:424-425)

```javascript
// NOTE: notesAlreadyStreamed flag is currently ignored - note:stream may not be reliable
// This ensures remote users always receive notes, even if duplicated
```

### 4.3 Impatto

- Remote users sentono ogni nota drag due volte
- Possibile "strum effect" non intenzionale
- Confusione timbrica

---

## 5. Issue C-03: HoverOrchestrator Parametri Ignorati

### 5.1 Parametri Generati dal Backend (HoverOrchestrator.js)

**4 LFO Layers** (linee 41-92):
```javascript
// PRIMARY LFO
lfoFrequency: 0.01,     // 0.001-0.15Hz
lfoAmplitude: 0.3,
lfoShape: 'sine',

// SECONDARY LFO
lfo2Frequency: 0.005,   // 0.002-0.05Hz
lfo2Amplitude: 0.15,
lfo2Shape: 'triangle',

// TERTIARY LFO
lfo3Frequency: 0.001,   // 0.0005-0.02Hz
lfo3Amplitude: 0.1,
lfo3Shape: 'sine',

// QUATERNARY LFO
lfo4Frequency: 0.002,   // 0.001-0.01Hz
lfo4Amplitude: 0.05,
lfo4Shape: 'sawtooth',
```

**Parametri Filtro Avanzati**:
- filterCutoff, filterResonance, filterSlope
- filterFreqModDepth, filterResModDepth

**Parametri Spaziali**:
- spatialPan, spatialWidth, spatialRotateSpeed

**Parametri Effetti**:
- reverbMix, delayTime, distortionAmount

**Modulazione Carattere**:
- modulationDepth, modulationRate, vibratoDepth, tremoloDepth

**Evoluzione**:
- evolutionSpeed, complexity

### 5.2 Parametri USATI dal Frontend (AudioService.js:5464-5499)

```javascript
applyUnifiedModulation(modulationData) {
  const mod = modulationData.modulation

  // SOLO QUESTI 3:
  this.gestureFilter.frequency.value = mod.filterCutoff
  this.gestureFilter.Q.value = mod.filterResonance
  this.gesturePan.pan.value = mod.spatialPan

  // reverbMix - codice presente ma non funziona
}
```

### 5.3 Parametri COMPLETAMENTE IGNORATI (25+)

- lfoFrequency, lfoAmplitude, lfoShape
- lfo2Frequency, lfo2Amplitude, lfo2Shape
- lfo3Frequency, lfo3Amplitude, lfo3Shape
- lfo4Frequency, lfo4Amplitude, lfo4Shape
- filterSlope
- filterFreqModDepth, filterResModDepth
- spatialWidth, spatialRotateSpeed
- delayTime, distortionAmount
- modulationDepth, modulationRate
- vibratoDepth, tremoloDepth
- evolutionSpeed, complexity
- analysis.patterns (clusters, flow, ritmo, hotspots)

---

## 6. Issue C-04: Three-Tier Audio System Non Implementato

### 6.1 Configurazione Definita (AudioService.js:86-107)

```javascript
this.threeTierConfig = {
  background: {
    waveform: 'triangle',
    volumeMultiplier: 0.7,
    baseFrequency: 110
  },
  remote: {
    waveform: 'square',
    volumeMultiplier: 1.5,
    baseFrequency: 440
  },
  local: {
    waveform: 'sawtooth',
    volumeMultiplier: 2.0,
    baseFrequency: 880
  }
}
```

### 6.2 Metodi Definiti ma Non Usati

```javascript
// AudioService.js:5009
calculateThreeTierFrequency(baseFrequency, tier, velocity)

// AudioService.js:5034
calculateThreeTierVolume(tier, baseVolume)
```

### 6.3 Evidenza Non-Utilizzo

`playMusicalEvent()` (linee 3248-3500) **non chiama mai** questi metodi.
Le note vengono suonate tutte con lo stesso synth indipendentemente dal tier.

---

## 7. Issue C-05: Range Frequenze Inconsistenti

### 7.1 TAP (Backend - GestureToMusicService.js:185-187)

```javascript
const octaveBase = 110 + (1 - y) * 440  // 110-550Hz
const withinOctave = x * 660            // 0-660Hz
const frequency = octaveBase + withinOctave  // 110-1210Hz (A2-D6)
```

### 7.2 DRAG (Frontend - DragStreamingHandler.js:102-106)

```javascript
const baseOctave = params.baseOctave || (3 + Math.floor(y * 2))  // 3-5
const midiNote = 60 + (baseOctave - 4) * 12 + scaleNote + octaveOffset * 12
const frequency = 440 * Math.pow(2, (midiNote - 69) / 12)
// Range effettivo: ~130-1050Hz (C3-C6)
```

### 7.3 Virtual Users (VirtualUserService.js)

| Source | Tessitura | Range |
|--------|-----------|-------|
| Wikipedia | Bass | 110-220Hz |
| HackerNews | Tenor | 196-392Hz |
| GitHub | Soprano | 523-1047Hz |

### 7.4 Impatto

- TAP real user: 110-1210Hz
- DRAG real user: 130-1050Hz
- Virtual users: range fissi per tessitura

Gesti simili producono range diversi, compromettendo coerenza timbrica.

---

## 8. Issue C-06: Parametri Backend Non Utilizzati

### 8.1 Parametri Inviati da GestureToMusicService

| Parametro | Inviato | Usato da Frontend |
|-----------|---------|-------------------|
| frequency | ✓ | ✓ |
| duration | ✓ | ✓ |
| velocity | ✓ | ✓ |
| articulation | ✓ | ✓ |
| gestureAction | ✓ | **NO** |
| gestureType | ✓ | **NO** |
| noteIndex | ✓ | Solo logging |
| totalNotes | ✓ | **NO** |
| mood | ✓ | **NO** |
| scale | ✓ | **NO** |

### 8.2 Evidenza (AudioService.js:3264-3302)

```javascript
// Backend format - use properties directly
frequency = musicalEvent.properties.frequency     // USATO
duration = musicalEvent.properties.duration       // USATO
velocity = musicalEvent.properties.velocity       // USATO
articulation = musicalEvent.properties.articulation // USATO

// IGNORATI:
// gestureAction, gestureType, noteIndex, totalNotes, mood, scale
```

---

## 9. Issue C-07: Audio Remoto Senza Filter Processing

### 9.1 Audio Locale (proprio gesto)

```
Nota → gestureSynth → gestureFilter (cutoff, Q) → gesturePan → LFO modulation → output
```

### 9.2 Audio Remoto (altri utenti)

```
Nota → UserSynthManager.getSynthForUser() → patch synth → output
```

**Manca**: gestureFilter, LFO modulation

### 9.3 Impatto

Note locali e remote suonano con timbri diversi anche per stessi parametri musicali.

---

## 10. Codice Legacy Identificato

### 10.1 ~~SoundPatternGenerator.js~~ - **RIMOSSO**

> File eliminato il 2026-01-12 insieme ai relativi test (870 linee totali).
> Era codice legacy mai utilizzato in produzione.

### 10.2 ThreeTierAudioSystem.js

- **Stato**: Classe definita, config presente, mai usata
- **Metodi orfani**: `setSynths()`, `setAmbientFilters()`, `setMasterVolume()`

### 10.3 GestureAudioMapper.js

- **Metodi orfani**:
  - `mapGestureToFrequency()`
  - `mapGestureToVolume()`
  - `mapGestureToFilter()`
- **Stato**: playMusicalEvent() usa math diretto invece

### 10.4 HoverOrchestrator LFO System (linee 41-92)

- **Stato**: 4 LFO layers generati, nessuno renderizzato
- **Complessità**: Analisi cluster, flow, ritmo, hotspots - tutto ignorato

---

## 11. Voci Audio - Architettura Verificata

### 11.1 Background Voices (documentate come "6 voci")

**Implementazione reale**:
- CompositionEngine genera composizioni polifoniche
- **Massimo 4 voci** per composizione (melody, harmony, bass, pad)
- Composizioni ambient hanno **3 texture layers** (drone, pad, texture)
- Non hardcoded 6 voci

### 11.2 Virtual Users (3)

| Source | UserId | Color | Tessitura | Stato |
|--------|--------|-------|-----------|-------|
| Wikipedia | `wikipedia-metrics` | #e41a1c (RED) | Bass 110-220Hz | ATTIVO |
| HackerNews | `hackernews-metrics` | #ff7f00 (ORANGE) | Tenor 196-392Hz | ATTIVO |
| GitHub | `github-metrics` | #377eb8 (BLUE) | Soprano 523-1047Hz | ATTIVO |

- Usano PhraseMorphology e HarmonicEngine (stessi dei real users)
- Contribuiscono a BackgroundCompositionService.addMaterial()
- Attivi solo in solo mode (1 real user)
- Si disattivano in multi-user mode (2+ real users)

### 11.3 Real Users (max 4 per room)

- Colors: green, purple, yellow, magenta, pink, gray, teal
- In multi-user mode (2+ utenti), virtual users disattivati
- Usano stesso pipeline di gesture processing
- Audio locale vs remoto trattato diversamente (issue C-07)

---

## 12. Files Critici Analizzati

### Backend

| File | Linee | Stato | Note |
|------|-------|-------|------|
| ~~SoundPatternGenerator.js~~ | ~~868~~ | **RIMOSSO** | Eliminato il 2026-01-12 |
| GestureToMusicService.js | ~500 | ATTIVO | Genera TAP, parametri extra ignorati |
| HoverOrchestrator.js | 802 | PARZIALE | 25+ parametri generati, 3 usati |
| VirtualUserService.js | ~1370 | ATTIVO | Gesture generation corretta |
| BackgroundCompositionService.js | ~620 | ATTIVO | CompositionEngine integration |
| CompositionEngine.js | 775 | ATTIVO | Sistema compositivo principale |
| GestureHandler.js | ~550 | BUG | Duplicazione note drag |

### Frontend

| File | Linee | Stato | Note |
|------|-------|-------|------|
| AudioService.js | ~5600 | PARZIALE | threeTierConfig ignorata, parametri ignorati |
| ThreeTierAudioSystem.js | ~200 | LEGACY | Mai usato |
| GestureAudioMapper.js | ~150 | LEGACY | Metodi orfani |
| DragStreamingHandler.js | 316 | ATTIVO | Generazione locale OK |
| SocketEventCoordinator.js | ~600 | ATTIVO | Event handling OK |

---

## 13. Raccomandazioni

### Priorità Critica

1. **Rimuovere duplicazione note DRAG**
   - Modificare GestureHandler.js per non ri-broadcast streamedNotes come musical:event
   - Oppure implementare flag `notesAlreadyStreamed` correttamente

2. ~~**Documentare SoundPatternGenerator come DEPRECATED**~~ - **COMPLETATO**
   - ✅ File rimosso completamente dal codebase il 2026-01-12
   - ✅ Documentazione aggiornata (CLAUDE.md, README.md)

### Priorità Alta

3. **Implementare utilizzo parametri HoverOrchestrator**
   - Frontend deve applicare LFO layers a background audio
   - O rimuovere generazione parametri non usati

4. **Standardizzare range frequenze**
   - TAP e DRAG dovrebbero usare stesso calcolo
   - Allineare con virtual users

5. **Implementare three-tier audio routing**
   - playMusicalEvent() deve chiamare calculateThreeTierFrequency/Volume
   - O rimuovere config non usata

### Priorità Media

6. **Utilizzare parametri backend ignorati**
   - gestureAction, gestureType per differenziare timbri
   - mood, scale per contesto armonico

7. **Uniformare filter processing locale/remoto**
   - Remote audio dovrebbe passare per gestureFilter

### Priorità Bassa

8. **Cleanup codice legacy**
   - Rimuovere metodi orfani GestureAudioMapper
   - Consolidare ThreeTierAudioSystem

---

## 14. Test di Verifica Consigliati

1. **Console browser**: Aggiungere log temporaneo in `playMusicalEvent()` per vedere parametri ricevuti

2. **Drag duplicazione**:
   - Aprire 2 browser
   - Fare drag in uno
   - Verificare se l'altro riceve note duplicate (contare in console)

3. **Hover LFO**:
   - Log in `applyUnifiedModulation()` per vedere tutti i parametri ricevuti
   - Verificare che lfoFrequency etc. sono presenti ma ignorati

4. **Three-tier**:
   - Verificare se waveform cambia tra note locali/remote
   - Dovrebbero essere identiche (bug)

---

## 15. Conclusione

L'algoritmo compositivo di Webarmonium ha un'architettura sofisticata con sistemi avanzati (4 LFO layers, three-tier audio) che **non sono attualmente utilizzati** o sono **parzialmente implementati**.

Il sistema funziona principalmente grazie a:
- CompositionEngine per composizioni background
- PhraseMorphology per generazione frasi
- HarmonicEngine per coerenza tonale

> **AGGIORNAMENTO 2026-01-12**: Il codice legacy SoundPatternGenerator.js (868 linee con 6 algoritmi mai utilizzati) è stato **rimosso** dal codebase, eliminando ~1800 linee di dead code (inclusi i test).

La duplicazione note DRAG e i 25+ parametri hover ignorati rappresentano le inconsistenze più significative che impattano l'esperienza musicale.
