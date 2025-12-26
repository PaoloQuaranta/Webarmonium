# Webarmonium Backend Refactoring Plan

**Obiettivo**: Ottimizzare il backend mantenendo COMPLETAMENTE INVARIATO il feature set, rendendo il codice più accessibile e mantenibile.

---

## Grade Complessivo: C (Funzionale ma a punto critico)

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
| `backend/src/api/socketHandlers.js` | 1,795 | God object (6x soglia) |
| `backend/src/server.js` | 1,000 | ~600 linee dead code Phase 3.3 |
| `backend/src/services/HoverOrchestrator.js` | 853 | 4x duplicate LFO |
| `backend/src/services/SoundPatternGenerator.js` | 819 | 6 algoritmi embedded |
| `backend/src/services/CompositionEngine.js` | 774 | Mixed concerns |
| `backend/src/services/RoomManager.js` | 724 | Multiple responsabilità |

---

## Issue da Risolvere

### 1. CRITICAL: socketHandlers.js Monolitico (1,795 linee - 6x soglia!)
**Problema**: God object che gestisce 15+ tipi eventi socket, mixing validation/business logic/broadcasting
**Impatto**: 40+ console.log in produzione, deep nesting (5-6 livelli)
**Azione**: Dividere in 7 moduli domain-specific:
- `handlers/authHandler.js`
- `handlers/gestureHandler.js`
- `handlers/drawingHandler.js`
- `handlers/cursorHandler.js`
- `handlers/musicalHandler.js`
- `handlers/validationHandler.js`
- `handlers/broadcastHandler.js`

### 2. CRITICAL: server.js Dead Code (~600 linee)
**Problema**: Implementazione Phase 3.3 abbandonata ma commentata
**Include**:
- Import servizi commentati (PatternRecognitionService, CompositionEngine, VoiceAllocationManager, MusicalClockService)
- Import modelli commentati (MusicalEvent, BackgroundComposition, VoiceResource, PatternMemory)
- 10+ REST API endpoints riferenti servizi inesistenti
**Linee**: server.js 21-31, 88-109, 232-906
**Azione**: ELIMINARE immediatamente

### 3. HIGH: Performance - Console Logging in Hot Paths (184 occorrenze)
**Problema**: 8 console.log nel path gesture processing (<100ms requirement)
**Impatto**: 5-15ms latenza aggiunta per gesture
**Azione**: Rimuovere o implementare logging strutturato con livelli

### 4. HIGH: Duplicazione Pattern Validazione (15+ occorrenze)
```javascript
// Ripetuto ovunque
if (!socket.userId || !socket.roomId) {
  return this.sendError(callback, 'NO_ACTIVE_SESSION', 'No active room session')
}
const room = socket.services.roomManager.getRoom(socket.roomId)
if (!room) { return }
```
**Azione**: Estrarre `validateSession()`, `getRoomOrFail()` utilities

### 5. HIGH: Duplicazione LFO Smoothing (15+ occorrenze in HoverOrchestrator.js)
**Problema**: Pattern identico ripetuto per lfoFrequency, lfo2Frequency, lfo3Frequency, lfo4Frequency...
**Linee**: 659-778
**Azione**: Consolidare in `applySmoothing(param, prev, curr, factor)` helper

### 6. MEDIUM: Buffer Cleanup Inefficiente (HoverOrchestrator.js:186-189)
**Problema**: Operazione O(n) filter su OGNI hover event (potenzialmente 60fps)
**Azione**: Usare circular buffer o cleanup periodico

### 7. MEDIUM: Altri File Monolitici
- `SoundPatternGenerator.js` (819 linee) - 6 classi algoritmo embedded → file separati
- `CompositionEngine.js` (774 linee) - Mixed elaboration techniques e form management
- `RoomManager.js` (724 linee) - Rooms, drawing, colors, metrics, hover

### 8. LOW: Magic Numbers
**Esempi**: Timeout hardcoded (4000), valori MIDI (127), scaling factors (50, 200)
**Azione**: Estrarre in file constants

### 9. LOW: Error Handling Inconsistente
**Problema**: Mix di throw vs return null vs return `{success: false}` vs log-and-continue
**Azione**: Standardizzare pattern error handling

---

## Roadmap Backend

### Fase 1: Critical (8-10 ore)
1. ELIMINARE 600+ linee dead code Phase 3.3
2. Estrarre utilities validation/broadcast
3. Fix performance hot paths (logging, circular buffer)

### Fase 2: High Priority (16-20 ore)
4. Dividere `socketHandlers.js` in 7 moduli
5. Refactor `server.js` routes/controllers
6. Consolidare duplicazione LFO smoothing

### Fase 3: Medium Priority (12-15 ore)
7. Decompose remaining monolithic services
8. Estrarre magic numbers in constants
9. Implementare structured logging

### Fase 4: Low Priority (8-10 ore)
10. Aggiungere dependency injection
11. Standardizzare error handling
12. Fix naming inconsistencies

---

## Metriche Target Backend

| Metrica | Prima | Dopo |
|---------|-------|------|
| Dead code | ~600 | 0 |
| File > 300 linee | 6 | 2 |
| Console.log | 184 | 0 (structured logging) |
| Duplicazioni | ~200 | <30 |

---

# DEAD CODE - BACKEND

## CRITICAL: REST API Endpoints Rotti (676 linee)
**File**: `backend/src/server.js` linee 232-907

Questi endpoint sono ATTIVI ma ROTTI - referenziano servizi commentati e crasheranno a runtime:

| Endpoint | Linee | Servizio Mancante |
|----------|-------|-------------------|
| POST /api/rooms/:roomId/gestures | 235-380 (146 linee) | MusicalEvent |
| GET /api/rooms/:id/musical-events | 382-454 (73 linee) | patternRecognitionService |
| GET /api/rooms/:id/patterns | 456-527 (72 linee) | patternRecognitionService |
| GET /api/rooms/:id/composition | 529-574 (46 linee) | compositionEngine, musicalClockService |
| POST /api/rooms/:id/composition | 576-648 (73 linee) | patternRecognitionService, compositionEngine |
| GET /api/rooms/:id/voices | 650-682 (33 linee) | voiceAllocationManager |
| POST /api/rooms/:id/voices/request | 684-766 (83 linee) | voiceAllocationManager |
| POST /api/rooms/:id/clock/sync | 768-838 (71 linee) | musicalClockService |
| GET /api/rooms/:id/clock/status | 840-872 (33 linee) | musicalClockService |
| DELETE /api/rooms/:id | 875-907 (33 linee) | Multiple services |

**Azione**: ELIMINARE TUTTI (676 linee) - rappresentano Phase 3.3 abbandonata

## Import/Istanze Commentati (33 linee)
| Tipo | Linee | Descrizione |
|------|-------|-------------|
| Service imports commentati | 22-25 | PatternRecognitionService, CompositionEngine, VoiceAllocationManager, MusicalClockService |
| Model imports commentati | 27-31 | MusicalEvent, BackgroundComposition, VoiceResource, PatternMemory |
| Service instantiations | 87-92 | Istanze servizi commentate |
| Services object | 105-109 | Aggiunte a services object commentate |

**Azione**: ELIMINARE TUTTI

---

## RIEPILOGO DEAD CODE BACKEND

| Categoria | Linee | Rischio Eliminazione |
|-----------|-------|---------------------|
| REST API Phase 3.3 | 676 | SAFE (rotto comunque) |
| Import/instantiation commentati | 33 | SAFE |
| **TOTALE ELIMINABILE** | **~709** | |

---

# DUPLICAZIONI - BACKEND

## 1. Validazione Session Socket (28+ linee in 7+ handler)

**Pattern duplicato:**
```javascript
if (!socket.userId || !socket.roomId) {
  return this.sendError(callback, 'NO_ACTIVE_SESSION', 'No active room session')
}
```

| Handler | File | Linea |
|---------|------|-------|
| gesture | socketHandlers.js | 291 |
| hold:start | socketHandlers.js | 649 |
| hold:end | socketHandlers.js | 731 |
| draw:start | socketHandlers.js | 785 |
| draw:point | socketHandlers.js | 839 |
| draw:end | socketHandlers.js | 872 |
| cursor:move | socketHandlers.js | 924 |

**Soluzione**: Creare `backend/src/utils/SocketValidation.js`
```javascript
export const validateSession = (socket) => {
  if (!socket.userId || !socket.roomId) {
    return { valid: false, error: 'NO_ACTIVE_SESSION' }
  }
  return { valid: true }
}
```

## 2. Room Lookup Pattern (18+ linee in 6 location)

**Pattern duplicato:**
```javascript
const room = socket.services.roomManager.getRoom(socket.roomId)
if (!room) {
  return this.sendError(callback, 'ROOM_NOT_FOUND', 'Room not found')
}
```

| Location | File | Linea |
|----------|------|-------|
| 1 | socketHandlers.js | 217 |
| 2 | socketHandlers.js | 454 |
| 3 | socketHandlers.js | 659 |
| 4 | socketHandlers.js | 740 |
| 5 | socketHandlers.js | 1669 |
| 6 | socketHandlers.js | 1757 |

**Soluzione**: Creare `backend/src/utils/RoomHelper.js`
```javascript
export const getRoomOrFail = (roomManager, roomId) => {
  const room = roomManager.getRoom(roomId)
  return room ? { success: true, room } : { success: false, error: 'ROOM_NOT_FOUND' }
}
```

## 3. LFO Smoothing Pattern (66+ linee in 22 istanze) - CRITICAL

**Pattern duplicato:**
```javascript
this.unifiedModulation.propertyName =
  prev.propertyName * smoothingFactor +
  curr.propertyName * (1 - smoothingFactor)
```

**File**: `HoverOrchestrator.js` linee 665-777

| Parametro | Linee | Smoothing Factor |
|-----------|-------|------------------|
| lfoFrequency | 665-667 | sp.lfoFrequencySmoothing |
| lfoAmplitude | 669-671 | sp.lfoAmplitudeSmoothing |
| lfo2Frequency | 675-677 | sp.lfoFrequencySmoothing |
| lfo2Amplitude | 679-681 | sp.lfoAmplitudeSmoothing |
| lfo3Frequency | 686-688 | sp.lfoFrequencySmoothing |
| lfo3Amplitude | 690-692 | sp.lfoAmplitudeSmoothing |
| lfo4Frequency | 697-699 | sp.lfoFrequencySmoothing |
| lfo4Amplitude | 701-703 | sp.lfoAmplitudeSmoothing |
| filterCutoff | 707-709 | sp.filterCutoffSmoothing |
| filterResonance | 711-713 | sp.filterResonanceSmoothing |
| spatialPan | 716-718 | sp.spatialPanSmoothing |
| spatialWidth | 720-722 | sp.spatialWidthSmoothing |
| reverbMix | 725-727 | sp.reverbMixSmoothing |
| delayTime | 729-731 | sp.delayTimeSmoothing |
| filterFreqMod | 735-737 | sp.filterFrequencyModulation |
| filterResMod | 739-741 | sp.filterResonanceModulation |
| spatialRotation | 746-748 | sp.spatialRotationSmoothing |
| modulationDepth | 754-755 | **HARDCODED 0.9** ⚠️ |
| modulationRate | 758-759 | sp.lfoFrequencySmoothing |
| vibratoDepth | 762-763 | **HARDCODED 0.95** ⚠️ |
| tremoloDepth | 766-767 | **HARDCODED 0.97** ⚠️ |
| evolutionSpeed | 772-773 | **HARDCODED 0.9** ⚠️ |
| complexity | 776-777 | **HARDCODED 0.85** ⚠️ |

**NOTA**: 5 istanze usano valori hardcoded invece di smoothingParams - BUG!

**Soluzione**: Creare `backend/src/utils/SmoothingCalculator.js`
```javascript
export const applySmoothing = (prev, curr, factor) =>
  prev * factor + curr * (1 - factor)

export const smoothObject = (prev, curr, params) => {
  const result = {}
  for (const [key, factor] of Object.entries(params)) {
    if (key in prev && key in curr) {
      result[key] = applySmoothing(prev[key], curr[key], factor)
    }
  }
  return result
}
```

## 4. Default Position Fallback (7 istanze BE)

**Pattern duplicato:** `{ x: 0.5, y: 0.5 }`

| Location | File | Linea |
|----------|------|-------|
| 1 | HoverOrchestrator.js | 21 |
| 2 | HoverOrchestrator.js | 242 |
| 3 | HoverOrchestrator.js | 256 |
| 4 | HoverOrchestrator.js | 306 |
| 5 | HoverOrchestrator.js | 350 |
| 6 | HoverOrchestrator.js | 351 |
| 7 | HoverOrchestrator.js | 418 |

**Soluzione**: Creare costante in `backend/src/constants/MusicConstants.js`
```javascript
export const DEFAULT_POSITION = { x: 0.5, y: 0.5 }
export const DEFAULT_INTENSITY = 0.5
```

---

## RIEPILOGO DUPLICAZIONI BACKEND

| Pattern | Location | Linee Totali | Utility da Creare |
|---------|----------|--------------|-------------------|
| Validazione Session | 7+ handlers | 28+ | `SocketValidation.js` |
| Room Lookup | 6 loc | 18+ | `RoomHelper.js` |
| LFO Smoothing | 22 istanze | 66+ | `SmoothingCalculator.js` |
| Default Position | 7 loc | 7 | `MusicConstants.js` |
| **TOTALE** | | **~119+** | **4 nuove utility** |

---

## NUOVA STRUTTURA FILE BACKEND

```
backend/src/utils/
├── SmoothingCalculator.js    (NEW - ~50 linee)
├── SocketValidation.js       (NEW - ~40 linee)
├── RoomHelper.js             (NEW - ~30 linee)
└── index.js                  (re-export)

backend/src/constants/
├── MusicConstants.js         (NEW - ~20 linee)
└── index.js                  (re-export)
```

## PRIORITÀ CONSOLIDAMENTO

1. **Alta** (Impact maggiore):
   - LFO Smoothing (66 linee + fix 5 bug hardcoded)
   - Session Validation (28 linee, 7 handler)

2. **Media**:
   - Room Helper (18 linee, 6 location)

3. **Bassa** (Code quality):
   - Default Constants (7 istanze)

---

# PIANO SPLIT SOCKETHANDLERS.JS

## Statistiche File Originale
- **Linee Totali**: 1,795
- **Socket Events**: 17 handler + 1 wildcard
- **Helper Methods**: 10+ utility methods
- **Service Dependencies**: 8+ servizi

## Eventi Socket Identificati

| Evento | Linee | Tipo |
|--------|-------|------|
| `join-room` | 59-195 | Room Mgmt |
| `leave-room` | 202-265 | Room Mgmt |
| `gesture` | 272-585 | Gesture |
| `heartbeat` | 592-637 | Session |
| `hold:start` | 644-719 | Musical |
| `hold:end` | 726-775 | Musical |
| `draw-start` | 782-829 | Drawing |
| `draw-point` | 836-860 | Drawing |
| `draw-end` | 867-912 | Drawing |
| `cursor-move` | 919-982 | Cursor |
| `cursor-position` | 1747-1792 | Cursor |
| `disconnect` | 989-992 | Session |
| `gesture:record` | 1153-1265 | Gesture |
| `musical:event` | 1272-1321 | Musical |
| `composition:update` | 1328-1374 | Musical |
| `clock:sync` | 1381-1449 | Musical |
| `hover-update` | 1655-1702 | Musical |

## Moduli Proposti (7 moduli)

### 1. AuthHandler.js (~410 linee)
**Scopo**: Session management, user join/leave, autenticazione

**Eventi gestiti**: `join-room`, `leave-room`, `heartbeat`, `disconnect`

**Metodi**:
```javascript
registerJoinRoomHandler(socket)      // 59-195
registerLeaveRoomHandler(socket)     // 202-265
registerHeartbeatHandler(socket)     // 592-637
registerDisconnectionHandler(socket) // 989-1059
handleDisconnection(socket, roomManager)
generateUserId()                     // 1065-1067
validateUserData(userData)           // 1074-1112
```

**Dipendenze servizi**:
- `roomManager` (joinRoom, leaveRoom, getRoom, handleHeartbeat)
- `environmentalMemoryCoordinator` (getMemoryState, initializeMemoryState)
- `backgroundCompositionService` (startComposition, stopComposition)

**Broadcasts**: `user-joined`, `user-left`, `room-joined`, `drawing-history`

---

### 2. GestureHandler.js (~330 linee)
**Scopo**: Gesture processing, recording, validation

**Eventi gestiti**: `gesture`, `gesture:record`

**Metodi**:
```javascript
registerGestureHandler(socket)       // 272-585
registerGestureRecordHandler(socket) // 1153-1265
validateGestureData(gesture)         // 1456-1486
validatePosition(position)
storeGestureForMultiUserSync(...)    // 1608-1647
```

**Dipendenze servizi**:
- `gestureProcessor` (processGesture)
- `gestureToMusicService` (processGesture)
- `roomManager` (recordGesture, addGestureToRoom)
- `environmentalMemoryCoordinator` (processGestureMemory, generateSonicUpdate)
- `backgroundCompositionService` (addMaterial)

**Broadcasts**: `musical:event`, `gesture-echo`, `sonic-update`, `gesture-broadcast`

**Note**: Timeout safety 4s, StreamedNotes processing path

---

### 3. DrawingHandler.js (~120 linee)
**Scopo**: Collaborative drawing, stroke management

**Eventi gestiti**: `draw-start`, `draw-point`, `draw-end`

**Metodi**:
```javascript
registerDrawStartHandler(socket)  // 782-829
registerDrawPointHandler(socket)  // 836-860
registerDrawEndHandler(socket)    // 867-912
```

**Dipendenze servizi**:
- `roomManager` (getUserRoom, getDrawingService, addStrokeToHistory)
- `DrawingService` (createStroke, addPoint, completeStroke, broadcastStroke)

**Broadcasts**: `draw-stroke`

---

### 4. CursorHandler.js (~140 linee)
**Scopo**: Multi-user cursor tracking

**Eventi gestiti**: `cursor-move`, `cursor-position`

**Metodi**:
```javascript
registerCursorMoveHandler(socket)     // 919-982
registerCursorPositionHandler(socket) // 1747-1792
```

**Dipendenze servizi**:
- `roomManager` (getUserRoom, updateCursorPosition)
- `CursorPosition` model

**Broadcasts**: `cursor-position`, `hover-update`

---

### 5. MusicalHandler.js (~420 linee)
**Scopo**: Musical events, sustain holds, hover orchestration, clock sync

**Eventi gestiti**: `hold:start`, `hold:end`, `musical:event`, `composition:update`, `clock:sync`, `hover-update`

**Metodi**:
```javascript
registerHoldStartHandler(socket)         // 644-719
registerHoldEndHandler(socket)           // 726-775
registerMusicalEventHandler(socket)      // 1272-1321
registerCompositionUpdateHandler(socket) // 1328-1374
registerClockSyncHandler(socket)         // 1381-1449
registerHoverUpdateHandler(socket)       // 1655-1702
sendToHoverOrchestrator(socket, data)    // 1709-1740
validateMusicalEventData(event)          // 1493-1524
validateClockData(data)                  // 1531-1555
calculateSpatialAudio(userId, event)     // 1563-1583
calculateTimingOffset(socket, data)      // 1591-1599
```

**Dipendenze servizi**:
- `roomManager` (getRoom)
- `HoverOrchestrator` (addHoverEvent)
- `patternRecognitionService` (processEvent, updateIntegrationLevel)
- `compositionEngine` (getComposition, processMusicalEvent)
- `musicalClockService` (getOrCreateClock, updateClock, getSynchronizedClock)

**Broadcasts**: `hold:start`, `hold:end`, `musical:event`, `composition:update`, `clock:sync`, `hover-update`

---

### 6. ValidationHandler.js (~110 linee)
**Scopo**: Shared validation utilities

**Metodi**:
```javascript
sendResponse(callback, data)            // 1119-1123
sendError(callback, code, message, extra) // 1132-1146
validateGestureData(gesture)            // 1456-1486
validateMusicalEventData(event)         // 1493-1524
validateClockData(data)                 // 1531-1555
validatePosition(position)
validateSession(socket)                 // NEW - extracted pattern
```

**Usato da**: Tutti gli altri moduli

**Pattern validazione**:
- Callback-based response (ACK/NACK)
- Error code + message structure
- Field presence validation
- Range validation (MIDI, tempo, etc.)

---

### 7. BroadcastHandler.js (~60 linee)
**Scopo**: Shared broadcasting utilities

**Metodi**:
```javascript
initializeSocket(socket, services)
registerAllHandlers(socket)  // Orchestrator
broadcastToRoom(io, roomId, event, data)
broadcastToRoomExcludingSender(socket, roomId, event, data)
broadcastToAllIncludingSender(io, roomId, event, data)
```

**Pattern broadcasting**:
- `socket.to(roomId).emit()` - to others in room
- `socket.broadcast.to(roomId).emit()` - to others
- `io.to(roomId).emit()` - to all including sender
- `socket.emit()` - to sender only

---

## Mappa Dipendenze Servizi

| Servizio | Auth | Gesture | Draw | Cursor | Musical |
|----------|------|---------|------|--------|---------|
| roomManager | ✓ | ✓ | ✓ | ✓ | ✓ |
| gestureProcessor | | ✓ | | | |
| gestureToMusicService | | ✓ | | | |
| backgroundCompositionService | ✓ | ✓ | | | |
| environmentalMemoryCoordinator | ✓ | ✓ | | | |
| HoverOrchestrator | | | | | ✓ |
| patternRecognitionService | | | | | ✓ |
| compositionEngine | | | | | ✓ |
| musicalClockService | | | | | ✓ |

## Riepilogo Linee

| Modulo | Linee | % Totale |
|--------|-------|----------|
| AuthHandler | ~410 | 23% |
| MusicalHandler | ~420 | 23% |
| GestureHandler | ~330 | 18% |
| CursorHandler | ~140 | 8% |
| DrawingHandler | ~120 | 7% |
| ValidationHandler | ~110 | 6% |
| BroadcastHandler | ~60 | 3% |
| **TOTALE** | **~1,590** | **89%** |

**Riduzione**: ~200 linee risparmiate consolidando duplicazioni (validation, session check)

## Struttura File Proposta

```
backend/src/api/
├── socketHandlers.js         (REFACTORED - ~100 linee, solo orchestrazione)
└── handlers/
    ├── AuthHandler.js        (~410 linee)
    ├── GestureHandler.js     (~330 linee)
    ├── DrawingHandler.js     (~120 linee)
    ├── CursorHandler.js      (~140 linee)
    ├── MusicalHandler.js     (~420 linee)
    ├── ValidationHandler.js  (~110 linee)
    ├── BroadcastHandler.js   (~60 linee)
    └── index.js              (re-export)
```

## Entry Point Refactored

```javascript
// socketHandlers.js (nuovo - ~100 linee)
const authHandler = require('./handlers/AuthHandler')
const gestureHandler = require('./handlers/GestureHandler')
const drawingHandler = require('./handlers/DrawingHandler')
const cursorHandler = require('./handlers/CursorHandler')
const musicalHandler = require('./handlers/MusicalHandler')

module.exports = {
  registerHandlers(socket, services) {
    authHandler.initialize(socket, services)
    gestureHandler.initialize(socket, services)
    drawingHandler.initialize(socket, services)
    cursorHandler.initialize(socket, services)
    musicalHandler.initialize(socket, services)
  }
}
```

## Constitutional Requirements

| Requirement | Modulo | Evento | Threshold |
|-------------|--------|--------|-----------|
| WebSocket latency | AuthHandler | join-room | <100ms |
| Gesture processing | GestureHandler | gesture | <200ms |
| Stroke broadcast | DrawingHandler | draw-end | <1000ms |
| Hold latency | MusicalHandler | hold:start/end | <100ms |
