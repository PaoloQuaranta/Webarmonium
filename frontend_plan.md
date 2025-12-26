# Webarmonium Frontend Refactoring Plan

**Obiettivo**: Ottimizzare il frontend mantenendo COMPLETAMENTE INVARIATO il feature set, rendendo il codice più accessibile e mantenibile.

---

## Grade Complessivo: C+ (Funzionale ma necessita refactoring significativo)

## Vincoli
- **FEATURE SET INVARIATO**: Nessuna modifica funzionale
- **Test esistenti devono passare**: Validazione continua durante refactoring
- **Constitutional requirements**: Latency <100ms, 60fps, memory limits

## Ordine Consigliato
1. Dead code removal (zero rischio)
2. Utility extraction (basso rischio)
3. Performance fixes (medio rischio)
4. File splitting (alto rischio - richiede attenzione)

---

## File Critici da Modificare

| File | Linee | Problema Principale |
|------|-------|---------------------|
| `frontend/src/services/AudioService.js` | 4,731 | Monolitico (8+ responsabilità) |
| `frontend/src/main.js` | 1,445 | Orchestrator bloated + business logic |
| `frontend/src/services/EnhancedGestureCapture.js` | 1,227 | Multiple responsabilità |
| `frontend/src/services/DrawingRenderer.js` | 264 | COMPLETAMENTE MORTO - DA ELIMINARE |

---

## Issue da Risolvere

### 1. CRITICAL: AudioService.js Monolitico (4,731 linee)
**Problema**: Contiene 41% di tutto il codice services, gestisce 8+ responsabilità diverse
**Impatto**: Impossibile testare, conflitti merge, debugging difficile
**Azione**: Dividere in 7-8 servizi focalizzati:
- `AudioEngineManager.js` - Gestione Web Audio context
- `ThreeTierSynthesizer.js` - Sistema audio a tre livelli
- `GestureSynthesizer.js` - Sintesi da gesture
- `BackgroundGenerationService.js` - Audio ambientale
- `PatternGeneratorService.js` - Generatori algoritmici
- `CompositionService.js` - Composizione musicale
- `AudioEffectsChain.js` - Catena effetti

### 2. CRITICAL: Performance - Ricalcolo Scale in Real-time
**Problema**: Ogni drag note (60+/secondo) ricalcola le stesse scale musicali
**Impatto**: ~80% cicli CPU sprecati, pressione garbage collector
**File**: `main.js` linee 228-439
**Azione**: Cache calcoli scale quando cambiano parametri composizionali

### 3. HIGH: Duplicazione Scale Musicali (~120 linee)
**Problema**: Stessi array scale (`pentatonic: [0,2,4,7,9]`, etc.) in 3 location
**Location**: `main.js` (2 posti), `GestureProcessor.js`
**Azione**: Creare `MusicalScaleLibrary.js` utility class

### 4. HIGH: DrawingRenderer.js - DEAD CODE (264 linee)
**Problema**: Servizio intero sostituito da p5.js ma mai eliminato
**Azione**: ELIMINARE immediatamente

### 5. HIGH: main.js Bloated (1,445 linee)
**Problema**: Mixing orchestrazione con business logic (callback drag streaming = 211 linee inline)
**Azione**: Estrarre:
- `DragStreamingHandler.js`
- `SustainedHoldHandler.js`
- `SocketEventCoordinator.js`

### 6. MEDIUM: Duplicazione Calcoli Velocity (4 posti, ~60 linee)
**Location**: `EnhancedGestureCapture.js`, `main.js` (2 posti), `GestureProcessor.js`
**Azione**: Creare `GestureVelocityCalculator.js` utility

### 7. MEDIUM: EnhancedGestureCapture.js (1,227 linee)
**Problema**: Gestisce input capture, state machine, classification, hover, drag streaming
**Azione**: Dividere in:
- `GestureCaptureCore.js`
- `GestureStateMachine.js`
- `GestureClassifier.js`
- `HoverProcessor.js`
- `DragStreamProcessor.js`

### 8. LOW: Magic Numbers
**Esempi**: `baseOctave = 3 + Math.floor(y * 2)`, `frequency = 440 * Math.pow(2, (midiNote - 69) / 12)`
**Azione**: Creare `constants/MusicalConstants.js` e `constants/GestureConstants.js`

### 9. LOW: Canvas Context Fetching Inefficiente
**Problema**: `getContext('2d')` chiamato 120 volte/secondo nel render loop
**Azione**: Cache context durante inizializzazione

---

## Roadmap Frontend

### Fase 1: Quick Wins (4-6 ore)
1. ELIMINARE `DrawingRenderer.js` (~320 linee risparmiate)
2. Creare `MusicalScaleLibrary.js` (~120 linee deduplicate)
3. Cache calcoli scale nel drag callback (~80% perf improvement)
4. Cache canvas context references

### Fase 2: Major Refactoring (16-20 ore)
5. Refactor `AudioService.js` in 7-8 moduli (4,731 → ~3,800 linee)
6. Estrarre handlers da `main.js` (1,445 → ~600 linee)

### Fase 3: Cleanup (8-10 ore)
7. Estrarre tutti magic numbers in constants
8. Standardizzare error handling
9. Decompose `EnhancedGestureCapture.js`

---

## Metriche Target Frontend

| Metrica | Prima | Dopo |
|---------|-------|------|
| Totale linee | ~11,400 | ~10,500 |
| File più grande | 4,731 | ~600 |
| Codice duplicato | ~200 | <20 |
| Dead code | ~320 | 0 |

---

# DEAD CODE - FRONTEND

## DrawingRenderer.js - COMPLETAMENTE INUTILIZZATO (265 linee)
**File**: `frontend/src/services/DrawingRenderer.js`

- Sostituito da p5.js GenerativeVisualService
- Evidenza in main.js:
  - Linea 157: `// DISABLED: DrawingRenderer replaced by p5.js`
  - Linea 172: `// DISABLED`
  - Linee 820-829: Handler commentato
  - Linee 856-861: Handler commentato

**Azione**: ELIMINARE FILE INTERO

## main.js.backup - FILE BACKUP (41,500 linee)
**File**: `frontend/src/main.js.backup`

- Versione precedente di main.js
- Contiene codice obsoleto

**Azione**: ELIMINARE FILE INTERO (usare git per recovery se necessario)

## AudioService.js - Metodi Disabilitati (89 linee)
**File**: `frontend/src/services/AudioService.js`

| Metodo | Linee | Stato |
|--------|-------|-------|
| setupRemoteFilterLFO() | 2632-2679 (48 linee) | Early return, unreachable code |
| stopRemoteFilterLFO() | 2787-2797 (11 linee) | Early return |
| applyTremolo() | 2804-2828 (25 linee) | Early return |
| applyUnifiedModulation() | 4580-4584 (5 linee) | Early return |

**Azione**: ELIMINARE TUTTI (mantengono solo signature per backward compat - rimuovere anche chiamate)

## main.js - Handler Commentati (28 linee)
| Descrizione | Linee |
|-------------|-------|
| draw-stroke handler | 819-829 (11 linee) |
| drawing-history handler | 855-861 (7 linee) |
| Gesture trail rendering | 1212-1221 (10 linee) |

**Azione**: ELIMINARE TUTTI

## AudioService.js - LFO Init Commentato (1 linea)
**Linea 243**: `// this.lfoSystem.init() // Vecchio LFO system rimosso`

**Azione**: ELIMINARE

## Variabili Deprecate (ANCORA IN USO) - NEEDS VERIFICATION
**File**: `frontend/src/services/AudioService.js` linee 27-28

```javascript
this.muted = false  // DEPRECATED
this.volume = 1.0   // DEPRECATED
```

- Marcate DEPRECATED con commento "use volumeController instead"
- MA ancora usate in 12+ location (linee 977, 1708-1709, 1853-1854, 2182-2185, 2214-2215, 2880, 2992, 3005)

**Azione**: NON eliminare ancora - richiede refactoring per usare volumeController

---

## RIEPILOGO DEAD CODE FRONTEND

| Categoria | Linee | Rischio Eliminazione |
|-----------|-------|---------------------|
| DrawingRenderer.js | 265 | SAFE |
| main.js.backup | 41,500 | SAFE |
| AudioService metodi disabilitati | 89 | SAFE |
| main.js handler commentati | 28 | SAFE |
| LFO init | 1 | SAFE |
| **TOTALE ELIMINABILE** | **~41,883** | |
| Variabili deprecate (ancora usate) | 3 | NEEDS REFACTORING |

---

# DUPLICAZIONI - FRONTEND

## 1. Definizioni Scale Musicali (20+ linee in 4+ location)

**Pattern duplicato:**
```javascript
pentatonic: [0, 2, 4, 7, 9]
major: [0, 2, 4, 5, 7, 9, 11]
minor: [0, 2, 3, 5, 7, 8, 10]
dorian: [0, 2, 3, 5, 7, 9, 10]
```

| Location | File | Linee |
|----------|------|-------|
| 1 | main.js | 248-254 (drag streaming callback) |
| 2 | main.js | 455-459 (sustained hold callback) |
| 3 | GestureProcessor.js | 446-458 (getScaleIntervals) |
| 4 | AudioService.js | embedded scales |
| 5 | EnhancedGestureCapture.js | scale context tracking |

**Soluzione**: Creare `frontend/src/utils/MusicalScales.js`
```javascript
export const SCALES = {
  pentatonic: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  blues: [0, 3, 5, 6, 7, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11]
}
export const getScale = (type = 'pentatonic') => SCALES[type] || SCALES.pentatonic
```

## 2. Calcolo Intervallo da Velocità (15+ linee in 2 location)

**Pattern duplicato:**
```javascript
if (normalizedSpeed > 2.0) adjustedInterval = 31.25    // 64th
else if (normalizedSpeed > 1.2) adjustedInterval = 62.5  // 32nd
else if (normalizedSpeed > 0.7) adjustedInterval = 125   // 16th
// ... continua
```

| Location | File | Linee |
|----------|------|-------|
| 1 | EnhancedGestureCapture.js | 354-380 |
| 2 | main.js | 281-295 |

**Soluzione**: Creare `frontend/src/utils/VelocityCalculator.js`
```javascript
const SPEED_INTERVALS = [
  { threshold: 2.0, interval: 31.25, note: '64n' },
  { threshold: 1.2, interval: 62.5, note: '32n' },
  { threshold: 0.7, interval: 125, note: '16n' },
  { threshold: 0.4, interval: 250, note: '8n' },
  { threshold: 0.2, interval: 500, note: '4n' },
  { threshold: 0.1, interval: 1000, note: '2n' },
  { threshold: 0, interval: 2000, note: '1n' }
]
export const getIntervalFromSpeed = (speed) =>
  SPEED_INTERVALS.find(s => speed > s.threshold) || SPEED_INTERVALS.at(-1)
```

## 3. Default Position Fallback (1 istanza FE)
**Pattern duplicato:** `{ x: 0.5, y: 0.5 }`
**Location**: main.js linea 1101

**Soluzione**: Usare costante condivisa

---

## RIEPILOGO DUPLICAZIONI FRONTEND

| Pattern | Location | Linee Totali | Utility da Creare |
|---------|----------|--------------|-------------------|
| Scale Musicali | 4+ loc | 20+ | `MusicalScales.js` |
| Calcolo Velocità | 2 loc | 15+ | `VelocityCalculator.js` |
| Default Position | 1 loc | 1 | costante condivisa |
| **TOTALE** | | **~36+** | **2 nuove utility** |

---

## NUOVA STRUTTURA FILE FRONTEND

```
frontend/src/utils/
├── MusicalScales.js          (NEW - ~40 linee)
├── VelocityCalculator.js     (NEW - ~35 linee)
└── index.js                  (re-export)
```

---

# PIANO SPLIT AUDIOSERVICE.JS

## Statistiche File Originale
- **Linee Totali**: 4,731
- **Classe Principale**: AudioService
- **Dipendenze**: Tone.js, VolumeController, MusicalScheduler, LFOManager
- **Export**: Singleton globale su window.AudioService

## Moduli Proposti (8 moduli)

### 1. AudioServiceCore.js (~280 linee)
**Scopo**: Inizializzazione, audio context, lifecycle management

**Linee da estrarre**: 10-420 (constructor + initialize + start)

**Metodi**:
```javascript
constructor()                    // 11-248
initialize(audioEngine, gc)      // 328-346
async start()                    // 352-420
cleanup()                        // 4586-4625
initializeThreeTierAudio()       // 290-321
disableAllLFOSystems()           // 254-285
```

**Proprietà gestite**:
- `isInitialized`, `audioEngine`, `gestureCapture`
- `scheduledTimeouts`, `musicalScheduler`, `lfoManager`
- `volumeController`, `currentParameters`, `parameterMappings`
- `threeTierConfig`, `lfoSystem`, colorPool, frequency mappings

---

### 2. GenerativeMusicEngine.js (~420 linee)
**Scopo**: Generazione musica di background, progressioni armoniche, composizione pattern

**Linee da estrarre**: 428-1175

**Metodi**:
```javascript
createContinuousGenerativeSystem()  // 428-793
startEvolvingGeneration()           // 799-886
updateGenerativeState()             // 891-920
mutateHarmonicContext()             // 922-968
playLayer(layerName)                // 970-1111
advanceHarmony()                    // 1112-1140
changeProgression()                 // 1141-1175
```

**Stato interno**:
```javascript
generativeState = {
  currentScale, currentTonic, harmonicProgression,
  evolutionCycle, userInfluence, complexity,
  rhythmPatterns, layers, availableProgressions,
  currentProgressionIndex, chordProgression
}
```

---

### 3. GestureAudioMapper.js (~280 linee)
**Scopo**: Mapping gesture-to-audio real-time

**Linee da estrarre**: 1628-1707, 2959-3200

**Metodi**:
```javascript
mapGestureToFrequency(sonicParams)     // 1628-1636
mapGestureToVolume(sonicParams)        // 1637-1646
mapGestureToFilter(sonicParams)        // 1647-1706
mapCoordinateToParameter(name, val)    // 3105-3133
mapIntensityToParameter(name, int)     // 3134-3150
selectWaveformFromGesture(data)        // 3151-3180
generateFilterFromCoordinates(coords)  // 3182-3220
generateEnvelopeFromGesture(data)      // 3221-3270
generateSpatialParameters(coords)      // 3271-3287
mapGestureToAudio(gestureData)         // 3077-3104
mapColorToFrequency(color)             // 2959-2985
midiNoteToFrequency(midiNote)          // 2950-2958
```

---

### 4. PolyphonyManager.js (~180 linee)
**Scopo**: Gestione note sustained, lifecycle note, limiti polifonia

**Linee da estrarre**: 1490-1627, 2156-2180

**Metodi**:
```javascript
triggerSustainedNoteAttack(freq, vel, pos)  // 1490-1542
triggerSustainedNoteRelease(noteId)         // 1543-1569
managePolyphony()                           // 1570-1603
trackVoice(voiceId, synth, duration)        // 1605-1627
cleanupHangingNotes()                       // 2156-2180
```

**Stato**:
```javascript
activeSustainedNotes = Map<noteId, {frequency, velocity, startTime, synth}>
activeVoices = Set<voiceId>
maxTotalVoices = 16
```

---

### 5. FilterModulationSystem.js (~380 linee)
**Scopo**: Modulazione filtri avanzata, LFO management, effetti hover

**Linee da estrarre**: 1276-1467, 2576-2874, 3807-3945, 4177-4436

**Metodi**:
```javascript
updateSonicParams(sonicParams)              // 1276-1376
updateFilterParams(filterParams)            // 1378-1418
updateBackgroundFilters(sonicParams)        // 1420-1465
calculateFilterFrequency(sonicParams)       // 1467-1475
calculateFilterResonance(sonicParams)       // 1477-1488
triggerBackgroundFilterResponse(freq, dur)  // 2576-2631
setupRemoteFilterLFO(speed, amplitude)      // 2632-2686
stopRemoteFilterLFO()                       // 2787-2834
applyFilterModulation(filterParams)         // 3807-3944
handleHoverModulation(hoverData)            // 4248-4436
modulateBackgroundFilters(pos, intensity)   // 4177-4198
modulateRemoteGestureFilters(pos, int)      // 4199-4222
modulateLocalGestureFilters(pos, intensity) // 4223-4247
connectLFOToFiltersDirect()                 // 2727-2757
connectLFOToFilters()                       // 2758-2786
```

---

### 6. CompositionPlayer.js (~380 linee)
**Scopo**: Playback composizioni, eventi musicali, suoni drawing

**Linee da estrarre**: 1852-2103, 2213-2517, 2104-2211

**Metodi**:
```javascript
playComposition(composition, isDrone)      // 1852-1900
playPolyphonicComposition(content, tempo)  // 1902-1965
playHomophonicComposition(content, tempo)  // 1967-1997
playAccompaniment(accompaniment, tempo)    // 1999-2045
playAmbientComposition(content, tempo)     // 2047-2103
playDrawSound(color)                       // 2181-2211
playMusicalEvent(musicalEvent)             // 2213-2450
integrateUserPhraseIntoBackground(...)     // 2451-2516
noteNameToMidi(noteName)                   // 2104-2113
midiToFrequency(midiNote)                  // 2124-2129
buildChordFromName(chordName)              // 2131-2154
parseDuration(duration)                    // 4064-4077
```

---

### 7. ParameterController.js (~240 linee)
**Scopo**: Aggiornamenti parametri real-time, gesture buffering, performance monitoring

**Linee da estrarre**: 3031-3415, 3717-3801

**Metodi**:
```javascript
processGestureAudio(gestureData)           // 3031-3075
addGestureToBuffer(gestureData)            // 3338-3353
updateCurrentParameters(newParams)         // 3354-3376
startUpdateLoop()                          // 3377-3413
stopUpdateLoop()                           // 3415-3420
interpolateParametersFromBuffer()          // 3717-3730
performParameterUpdate()                   // 3689-3715
updatePerformanceMetrics(latency)          // 3731-3754
getCurrentParameters()                     // 3755-3763
updateParameterMapping(parameter, mapping) // 3764-3776
getPerformanceStats()                      // 3778-3788
resetPerformanceStats()                    // 3790-3806
applyDeviceSpecificMappings(params, dev)   // 3288-3315
applySmoothingToParameters(audioParams)    // 3317-3337
```

**Stato performance**:
```javascript
performanceMetrics = {
  gestureToSoundLatency: [],
  averageLatency, maxLatency,
  parameterUpdatesPerSecond,
  droppedUpdates, totalUpdates
}
```

---

### 8. ThreeTierAudioSystem.js (~320 linee)
**Scopo**: Gestione three-tier, scheduling musicale, hover management, modulazione avanzata

**Linee da estrarre**: 1772-1851, 2541-2706, 3423-3673, 4009-4122, 4441-4569, 4632-4727

**Metodi principali**:
```javascript
updatePatterns(patterns)                    // 1707-1851
triggerImmediateBackgroundEvolution()       // 2541-2575
updateActiveRemoteUser(userId, isActive)    // 2706-2725
calculateModulationScaling(userCount)       // 2687-2705
handleThreeTierGesture(gestureData)         // 4079-4121
playThreeTierNote(freq, tier, vel, opts)    // 3970-4007
calculateThreeTierFrequency(base, tier)     // 4009-4032
initializeNewMusicalArchitecture()          // 3423-3455
setupMusicalArchitectureEvents()            // 3457-3477
onMusicalTick/Beat(data)                    // 3479-3501
evolveParametersOnBeat(data)                // 3511-3521
scheduleMusicalEvent(cb, data, remote, ts)  // 3558-3573
handleHoverStart/Update/End(gestureData)    // 3575-3605
applyCrossLayerHoverModulation(hoverData)   // 4122-4176
updateCompositionalParameters(parameters)   // 4632-4727
setMuted/setVolume/isMuted/getVolume        // 2987-3029
```

---

## Mappa Dipendenze

```
AudioServiceCore (inizializzazione)
  │
  ├── GenerativeMusicEngine (sintesi)
  │   └── GestureAudioMapper (mapping parametri)
  │       └── PolyphonyManager (lifecycle note)
  │
  ├── FilterModulationSystem (effetti)
  ├── CompositionPlayer (playback)
  ├── ParameterController (updates/monitoring)
  └── ThreeTierAudioSystem (orchestrazione)
```

## API Esterna Preservata

Questi metodi restano INVARIATI sull'oggetto AudioService:
```javascript
initialize(audioEngine, gestureCapture)
start()
stop()
setMuted(muted)
setVolume(volume)
isMuted()
getVolume()
updatePatterns(patterns)
playMusicalEvent(musicalEvent)
updateCompositionalParameters(parameters)
updateSonicParams(sonicParams)
handleHoverModulation(hoverData)
```

## Linee Stimate Post-Split

| Modulo | Linee |
|--------|-------|
| AudioServiceCore | 280 |
| GenerativeMusicEngine | 420 |
| GestureAudioMapper | 280 |
| PolyphonyManager | 180 |
| FilterModulationSystem | 380 |
| CompositionPlayer | 380 |
| ParameterController | 240 |
| ThreeTierAudioSystem | 320 |
| **TOTALE** | **~2,460** |

**Riduzione**: da 4,731 a ~2,460 linee (-48%) grazie a:
- Eliminazione dead code (metodi disabilitati)
- Consolidamento duplicazioni
- Rimozione codice obsoleto
