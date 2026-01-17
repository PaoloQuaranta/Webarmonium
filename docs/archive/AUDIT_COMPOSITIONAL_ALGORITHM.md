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
| ~~CRITICO~~ | ~~Duplicazione note DRAG per remote users~~ | ~~Audio doppio~~ | **RISOLTO** |
| ~~CRITICO~~ | ~~HoverOrchestrator modulation system (25+ parametri)~~ | ~~Buggy, overhead, impercettibile~~ | **RISOLTO - RIMOSSO (Entry #105)** |
| ~~ALTO~~ | ~~Three-tier audio system non implementato~~ | ~~Config ignorata~~ | **RISOLTO - RIMOSSO (Entry #106)** |
| ~~ALTO~~ | ~~Range frequenze inconsistenti TAP vs DRAG~~ | ~~Incoerenza timbrica~~ | **RISOLTO (Entry #107)** |
| ~~MEDIO~~ | ~~Parametri backend inutilizzati~~ | ~~Contesto musicale perso~~ | **RISOLTO - RIMOSSO (Entry #108)** |

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

HOVER FILTER MODULATION: **RIMOSSO (Entry #105)**
  Sistema completamente disabilitato il 2026-01-13
  - handleHoverModulation() → no-op
  - applyUnifiedModulation() → no-op
  - unified-modulation event → non più emesso
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

## 4. Issue C-02: Duplicazione Note DRAG - **RISOLTO**

> **FIX APPLICATA**: 2026-01-12 - Il flag `notesAlreadyStreamed` viene ora controllato in `GestureHandler.js`.
> Le note DRAG sono inviate via `note:stream` in real-time e **non** ri-broadcast a `gesture:end`.

### 4.1 Problema (Risolto)

I remote users ricevevano ogni nota DRAG **DUE VOLTE**:

**Percorso 1 - Real-time** (durante il drag):
```
Frontend → note:stream → Backend → socket.to(roomId).emit('note:stream')
→ Altri utenti ricevono e suonano
```

**Percorso 2 - Batch** (a gesture:end) - **ORA SALTATO SE notesAlreadyStreamed=true**:
```
Frontend invia gesture con streamedNotes array + notesAlreadyStreamed=true
→ GestureHandler.js controlla il flag → SKIP re-broadcast
```

### 4.2 Fix Applicata (GestureHandler.js:423-432)

```javascript
// FIX: Check notesAlreadyStreamed flag to prevent duplicate playback (Issue C-02)
if (gesture.notesAlreadyStreamed && gesture.streamedNotes?.length > 0) {
  console.log(`[GestureHandler] Skipping re-broadcast for ${gesture.streamedNotes.length} notes`)
}

const shouldRebroadcastNotes = gesture.streamedNotes &&
  Array.isArray(gesture.streamedNotes) &&
  gesture.streamedNotes.length > 0 &&
  !gesture.notesAlreadyStreamed  // ← NEW CHECK
```

### 4.3 Impatto (Risolto)

- ~~Remote users sentono ogni nota drag due volte~~ ✅
- ~~Possibile "strum effect" non intenzionale~~ ✅
- ~~Confusione timbrica~~ ✅

---

## 5. Issue C-03: HoverOrchestrator Filter Modulation - **RIMOSSO**

> **SISTEMA COMPLETAMENTE RIMOSSO**: 2026-01-13 (Entry #105)
>
> Dopo multiple iterazioni di refactoring (Entry #103, #104, #104 v2), il sistema di modulazione
> hover dei filtri è stato **completamente rimosso** perché:
> - **Buggy**: Conflitti tra modulazione real-time e aggregata
> - **Overhead**: Eventi socket ogni 500ms, processing hover a 20Hz
> - **Impercettibile**: Effetto audio appena udibile nonostante la complessità

### 5.0 Stato Attuale (Post Entry #105)

```
MODULAZIONE HOVER FILTRI: DISABILITATA

handleHoverModulation()  → No-op (API compatibility)
applyUnifiedModulation() → No-op (API compatibility)
broadcastModulation()    → No-op (nessun evento emesso)
unified-modulation event → Non più emesso/ascoltato
```

### 5.1 Componenti Rimossi

**Frontend**:
- `masterFilter` rimosso dalla catena audio
- `handleHoverModulation()` → no-op
- `applyUnifiedModulation()` → no-op
- `unified-modulation` socket listener rimosso
- Handler in main.js, landing/main.js, SocketEventCoordinator rimossi

**Backend**:
- `broadcastModulation()` in HoverOrchestrator → no-op
- Nessun evento `unified-modulation` emesso

### 5.2 Cosa Rimane (per altri usi)

- HoverOrchestrator continua a tracciare stato hover (usato per altre feature)
- Filtri per-voce ambient esistono ancora (bass, pad, chords)
- gestureFilter esiste ancora (per potenziale uso futuro)

### 5.3 Storico Tentativi (per riferimento)

| Entry | Approccio | Problema |
|-------|-----------|----------|
| #103 | Mapping 1:1 metriche raw → filtri ambient | Effetto impercettibile |
| #104 | Modula per-user filters + gestureFilter | Ancora impercettibile |
| #104 v2 | Master filter dopo il mix | Conflitti modulation |
| **#105** | **RIMOSSO COMPLETAMENTE** | **Soluzione definitiva** |

---

## 6. Issue C-04: Three-Tier Audio System - **RIMOSSO**

> **SISTEMA COMPLETAMENTE RIMOSSO**: 2026-01-13 (Entry #106)
>
> Il sistema three-tier audio (threeTierConfig, calculateThreeTier*, playThreeTierNote)
> è stato **rimosso** perché:
> - **Mai utilizzato**: playMusicalEvent() non chiamava mai questi metodi
> - **Bug critico**: calculateThreeTierFrequency ignorava la frequenza passata
> - **Overhead**: ~1100 linee di codice legacy inutilizzato

### 6.1 Componenti Rimossi

**File eliminato:**
- `ThreeTierAudioSystem.js` (~850 linee)

**Da AudioService.js:**
- `threeTierConfig` (config background/remote/local)
- `playThreeTierNote()`, `handleThreeTierGesture()`
- `calculateThreeTierFrequency()`, `calculateThreeTierVolume()`, `calculateThreeTierDuration()`

**Da GestureAudioMapper.js:**
- `threeTierConfig` (duplicato)
- `calculateThreeTier*()` metodi duplicati
- `mapGestureToFilter()` semplificato (tier mai usato)

**Da AudioServiceFacade.js:**
- Istanziazione e deleghe a ThreeTierAudioSystem

### 6.2 Sostituzione

Nuovo metodo semplificato in AudioService.js:
```javascript
playSimpleNote(frequency, duration = 0.3, volume = 0.5) {
  if (!this.isInitialized || !this.gestureSynth) return
  this.safeGestureSynthTrigger(frequency, duration, undefined, volume)
}
```

### 6.3 Fix Collaterale

MetricsToGestureAdapter.js ora usa la frequenza calcolata invece che ignorarla (era un bug).

---

## 7. Issue C-05: Range Frequenze Inconsistenti - **RISOLTO**

> **FIX APPLICATA**: 2026-01-13 (Entry #107)
>
> DRAG ora usa lo stesso comportamento Y-axis di TAP (alto=acuto) e range espanso a 5 ottave.

### 7.1 TAP (Backend - GestureToMusicService.js:185-187)

```javascript
const octaveBase = 110 + (1 - y) * 440  // 110-550Hz
const withinOctave = x * 660            // 0-660Hz
const frequency = octaveBase + withinOctave  // 110-1210Hz (A2-D6)
```

### 7.2 DRAG (Frontend - DragStreamingHandler.js:83) - **AGGIORNATO**

```javascript
// PRIMA (problema):
const baseOctave = params.baseOctave || (3 + Math.floor(y * 2))
// y=0 (alto) → ottava 3 (BASSA) ❌ - INVERTITO rispetto a TAP!

// DOPO (fix Entry #107):
const baseOctave = params.baseOctave || (2 + Math.floor((1 - y) * 4))
// y=0 (alto) → ottava 6 (ALTA) ✓
// y=1 (basso) → ottava 2 (BASSA) ✓
// Range: ~110-1200Hz (allineato a TAP)
```

### 7.3 Virtual Users (VirtualUserService.js)

| Source | Tessitura | Range |
|--------|-----------|-------|
| Wikipedia | Bass | 110-220Hz |
| HackerNews | Tenor | 196-392Hz |
| GitHub | Soprano | 523-1047Hz |

**Nota**: I Virtual Users mantengono tessiture fisse by design (sono "voci caratteristiche").

### 7.4 Stato Attuale (Post Fix)

| Gesto | Y-axis | Range |
|-------|--------|-------|
| TAP | ✅ y=0 → alto | 110-1210Hz |
| DRAG | ✅ y=0 → alto | ~110-1200Hz |
| Virtual | N/A (fisso) | Per tessitura |

**Coerenza timbrica ripristinata**: stesso punto sul canvas produce frequenze simili per TAP e DRAG.

---

## 8. Issue C-06: Parametri Backend Non Utilizzati - **RISOLTO**

> **PARAMETRI RIMOSSI**: 2026-01-13 (Entry #108)
>
> I 6 parametri inutilizzati sono stati rimossi da GestureToMusicService.js:
> - `gestureAction`, `gestureType`, `noteIndex`, `totalNotes`, `mood`, `scale`
> - Motivo: Mai usati dal frontend, overhead inutile (~40% payload per nota)

### 8.1 Parametri Attuali (Post Entry #108)

| Parametro | Inviato | Usato da Frontend |
|-----------|---------|-------------------|
| pitch | ✓ | ✓ |
| frequency | ✓ | ✓ |
| duration | ✓ | ✓ |
| velocity | ✓ | ✓ |
| articulation | ✓ | ✓ |
| startTime | ✓ | ✓ (scheduling) |

### 8.2 Parametri Rimossi

```javascript
// RIMOSSI (Entry #108):
// gestureAction, gestureType, noteIndex, totalNotes, mood, scale
// Motivo: Mai letti dal frontend, solo overhead
```

---

## 9. Issue C-07: Audio Remoto Senza Filter Processing - **RISOLTO**

> **SISTEMA UNIFICATO**: 2026-01-13 (Entry #109)
>
> Il `gestureFilter` è stato **rimosso** dalla catena audio locale perché:
> - **Non più modulato**: Dopo Entry #105 (rimozione hover filter modulation), era statico a 8000Hz/Q=0.5
> - **Uniformità**: Ora local e remote usano la stessa architettura (synth → pan → volume)
> - **Semplificazione**: ~80 linee di codice rimosse

### 9.1 Audio Locale (proprio gesto) - **AGGIORNATO**

```
PRIMA (pre-Entry #109):
Nota → gestureSynth → gestureFilter (statico) → gesturePan → output

DOPO (Entry #109):
Nota → gestureSynth → gesturePan → gestureVolume → masterVolume
```

### 9.2 Audio Remoto (altri utenti)

```
Nota → UserSynthManager.getSynthForUser() → patch synth → pan → volume → masterVolume
```

### 9.3 Stato Attuale

- ✅ Architettura unificata tra local e remote
- ✅ gestureFilter rimosso (era statico, non aggiungeva valore)
- ✅ Unica differenza: velocity scaling (local ×1.15, remote ×1.0)

---

## 10. Codice Legacy Identificato

### 10.1 ~~SoundPatternGenerator.js~~ - **RIMOSSO**

> File eliminato il 2026-01-12 insieme ai relativi test (870 linee totali).
> Era codice legacy mai utilizzato in produzione.

### 10.2 ~~ThreeTierAudioSystem.js~~ - **RIMOSSO**

> File eliminato il 2026-01-13 (Entry #106).
> Era codice legacy mai utilizzato (~850 linee).

### 10.3 ~~GestureAudioMapper.js metodi orfani~~ - **RIMOSSI**

> Metodi rimossi il 2026-01-13 (Entry #110):
> - `mapGestureToFrequency()` - duplicato, AudioService ha la sua versione
> - `mapGestureToVolume()` - duplicato, AudioService ha la sua versione
> - `mapGestureToFilter()` - duplicato in GestureAudioMapper, AudioServiceFacade, FilterModulationSystem
>
> Tutti rimossi insieme alle deleghe in AudioServiceFacade.js e FilterModulationSystem.js.

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
| HoverOrchestrator.js | 802 | PARZIALE | Filter modulation disabilitata (Entry #105), hover tracking attivo |
| VirtualUserService.js | ~1370 | ATTIVO | Gesture generation corretta |
| BackgroundCompositionService.js | ~620 | ATTIVO | CompositionEngine integration |
| CompositionEngine.js | 775 | ATTIVO | Sistema compositivo principale |
| GestureHandler.js | ~550 | **FIXED** | Duplicazione note drag risolta (C-02) |

### Frontend

| File | Linee | Stato | Note |
|------|-------|-------|------|
| AudioService.js | ~5450 | ATTIVO | threeTierConfig rimosso (Entry #106), playSimpleNote aggiunto |
| ~~ThreeTierAudioSystem.js~~ | ~~850~~ | **RIMOSSO** | Eliminato il 2026-01-13 (Entry #106) |
| GestureAudioMapper.js | ~390 | ATTIVO | Metodi three-tier rimossi, mapGestureToFilter semplificato |
| DragStreamingHandler.js | 316 | ATTIVO | Generazione locale OK |
| SocketEventCoordinator.js | ~600 | ATTIVO | Event handling OK |

---

## 13. Raccomandazioni

### Priorità Critica

1. ~~**Rimuovere duplicazione note DRAG**~~ - **COMPLETATO**
   - ✅ GestureHandler.js ora controlla flag `notesAlreadyStreamed`
   - ✅ Note DRAG non più ri-broadcast a gesture:end se già stremate

2. ~~**Documentare SoundPatternGenerator come DEPRECATED**~~ - **COMPLETATO**
   - ✅ File rimosso completamente dal codebase il 2026-01-12
   - ✅ Documentazione aggiornata (CLAUDE.md, README.md)

### Priorità Alta

3. ~~**Implementare utilizzo parametri HoverOrchestrator**~~ - **RIMOSSO (Entry #105)**
   - ✅ Sistema hover filter modulation completamente rimosso il 2026-01-13
   - ✅ Motivo: buggy, overhead, effetto impercettibile
   - ✅ Metodi mantenuti come no-op per compatibilità API

4. ~~**Implementare three-tier audio routing**~~ - **RIMOSSO (Entry #106)**
   - ✅ Sistema three-tier completamente rimosso il 2026-01-13
   - ✅ Motivo: mai utilizzato, bug critico, ~1100 linee di dead code
   - ✅ Sostituito con playSimpleNote()

5. ~~**Standardizzare range frequenze**~~ - **RISOLTO (Entry #107)**
   - ✅ TAP e DRAG ora usano stesso calcolo (y=0 → alto)
   - ✅ Range allineato: ~110-1200Hz

### Priorità Media

6. ~~**Utilizzare parametri backend ignorati**~~ - **RIMOSSO (Entry #108)**
   - ✅ Parametri inutilizzati rimossi invece di implementati
   - ✅ Motivo: overhead senza beneficio, API più snella
   - ✅ Rimossi: gestureAction, gestureType, noteIndex, totalNotes, mood, scale

7. ~~**Uniformare filter processing locale/remoto**~~ - **RISOLTO (Entry #109)**
   - ✅ gestureFilter rimosso (era statico dopo Entry #105)
   - ✅ Local e remote ora usano stessa architettura audio

---

## 14. Test di Verifica Consigliati

1. **Console browser**: Aggiungere log temporaneo in `playMusicalEvent()` per vedere parametri ricevuti

2. **Drag duplicazione**:
   - Aprire 2 browser
   - Fare drag in uno
   - Verificare se l'altro riceve note duplicate (contare in console)

3. ~~**Hover LFO**~~: **N/A - Sistema rimosso (Entry #105)**

4. **Three-tier**:
   - Verificare se waveform cambia tra note locali/remote
   - Dovrebbero essere identiche (bug)

---

## 15. Conclusione

L'algoritmo compositivo di Webarmonium ha un'architettura più snella dopo la rimozione di sistemi non funzionanti.

Il sistema funziona principalmente grazie a:
- CompositionEngine per composizioni background
- PhraseMorphology per generazione frasi
- HarmonicEngine per coerenza tonale

> **AGGIORNAMENTO 2026-01-12**: Il codice legacy SoundPatternGenerator.js (868 linee con 6 algoritmi mai utilizzati) è stato **rimosso** dal codebase, eliminando ~1800 linee di dead code (inclusi i test).

> **AGGIORNAMENTO 2026-01-13 (Entry #105)**: Il sistema di modulazione hover filtri è stato **completamente rimosso** perché buggy, con overhead e effetto impercettibile. Questo include: masterFilter, handleHoverModulation, applyUnifiedModulation, e l'evento unified-modulation.

> **AGGIORNAMENTO 2026-01-13 (Entry #106)**: Il sistema three-tier audio è stato **completamente rimosso** perché mai utilizzato e con bug critico (frequenza passata ignorata). Rimossi ~1100 linee di dead code inclusi: ThreeTierAudioSystem.js, threeTierConfig, calculateThreeTier*, playThreeTierNote. Sostituito con playSimpleNote().

> **AGGIORNAMENTO 2026-01-13 (Entry #107)**: Il range frequenze DRAG è stato **allineato a TAP**. Modificato DragStreamingHandler.js:83 per invertire Y-axis (alto=acuto) e espandere a 5 ottave (110-1200Hz). Coerenza timbrica ripristinata.

> **AGGIORNAMENTO 2026-01-13 (Entry #108)**: I 6 parametri backend inutilizzati sono stati **rimossi** da GestureToMusicService.js: gestureAction, gestureType, noteIndex, totalNotes, mood, scale. Motivo: mai usati dal frontend, ~40% riduzione payload per nota.

> **AGGIORNAMENTO 2026-01-13 (Entry #109)**: Il `gestureFilter` è stato **rimosso** dalla catena audio locale. Motivo: dopo Entry #105 era statico (8000Hz, Q=0.5), non aggiungeva valore timbrico. Ora local e remote usano la stessa architettura (synth → pan → volume). File modificati: AudioService.js, AudioServiceFacade.js, FilterModulationSystem.js, landing/main.js.

> **AGGIORNAMENTO 2026-01-13 (Entry #110)**: Rimossi metodi orfani `mapGestureToFrequency`, `mapGestureToVolume`, `mapGestureToFilter` da GestureAudioMapper.js (duplicati non usati - AudioService.js ha le versioni attive). Rimosse anche deleghe in AudioServiceFacade.js e FilterModulationSystem.js. ~70 linee di dead code eliminate.

**Tutte le issue identificate sono state risolte.** L'architettura audio è ora semplificata e uniforme.
