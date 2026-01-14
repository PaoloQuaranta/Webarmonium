# Piano: Modulazione Diretta 1:1 (Issue C-03 Refactor)

## Architettura Finale

### Separazione dei Domini

```
MODULAZIONE REAL-TIME (handleHoverModulation)
└── gestureFilter → gestureSynth
    └── Trigger: ogni hover event (20Hz max)
    └── Sorgenti: posizione diretta del singolo hover

MODULAZIONE AGGREGATA (applyUnifiedModulation)
└── ambientFilters.* → bass, pad, chords, backgroundHigh/Mid/Low
    └── Trigger: ogni 500ms da HoverOrchestrator
    └── Sorgenti: metriche aggregate (mapping 1:1)
```

---

## Mapping 1:1 Sorgenti → Target

### GESTURE (real-time, invariato)
Continua a usare `handleHoverModulation` con posizione diretta del singolo hover.

### AMBIENT + BACKGROUND (aggregato)

| Target | Sorgente | Range Sorgente | Range Target | Logica Musicale |
|--------|----------|----------------|--------------|-----------------|
| **bass.cutoff** | `density` | 0-10 | 80-400 Hz | Più attività = basso più aperto |
| **bass.Q** | `hoverCount` | 0-100 | 0.5-4.0 | Più hover = più punch |
| **pad.cutoff** | `spatialVariance` | 0-1 | 300-3000 Hz | Sparsi = pad più brillante |
| **pad.Q** | `uniqueUsers.size` | 1-10 | 0.5-5.0 | Più utenti = più risonanza (sociale) |
| **chords.cutoff** | `flowDirection.y` | -1 to 1 | 1000-10000 Hz | Flusso su = accordi brillanti |
| **chords.Q** | `flowDirection.x` | -1 to 1 | 0.5-4.0 | Flusso laterale = risonanza |
| **bgHigh.cutoff** | `rhythmAnalysis.regularity` | 0-1 | 1500-8000 Hz | Regolare = melodia cristallina |
| **bgHigh.Q** | `clusterCenters.length` | 0-3 | 0.5-5.0 | Più cluster = melodia enfatica |
| **bgMid.cutoff** | `intensityDistribution.max` | 0-1 | 800-6000 Hz | Picchi intensità = armonia aperta |
| **bgMid.Q** | `intensityDistribution.min` | 0-1 | 0.5-4.0 | Minimi = risonanza |
| **bgLow.cutoff** | `rhythmAnalysis.period` | 0-2000 ms | 200-3000 Hz | Periodo lungo = basso caldo |
| **bgLow.Q** | `hotspotZones.length` | 0-16 | 0.5-5.0 | Più hotspot = basso enfatico |

**Sorgente di riserva:** `averagePosition.x` (non usata, disponibile per espansioni)

---

## Range Sicuri per Filtri Lowpass

Tutti i filtri sono **lowpass**. Range minimi garantiscono che la voce resti udibile:

| Voce | Oscillatore | Min Sicuro | Max | Default |
|------|-------------|------------|-----|---------|
| **bass** | sawtooth | 80 Hz | 400 Hz | 150 Hz |
| **pad** | triangle | 300 Hz | 3000 Hz | 800 Hz |
| **chords** | FMSynth | 1000 Hz | 10000 Hz | 6000 Hz |
| **bgHigh** | pulse | 1500 Hz | 8000 Hz | 5000 Hz |
| **bgMid** | pwm | 800 Hz | 6000 Hz | 3000 Hz |
| **bgLow** | square | 200 Hz | 3000 Hz | 1500 Hz |

**Q Range sicuro:** 0.5 - 6.0 (evita self-oscillation e suono troppo piatto)

---

## Ramping e Smoothing

- **Update rate:** 500ms (da HoverOrchestrator)
- **Ramp time:** 300ms (completa prima del prossimo update, evita click)
- **Metodo:** `filter.frequency.rampTo(value, 0.3)`

---

## Formule di Conversione

```javascript
// Mapping con range sicuri e ramping
const RAMP_TIME = 0.3 // 300ms

// Range sicuri per cutoff (Hz)
const CUTOFF_RANGES = {
  bass:       { min: 80,   max: 400   },
  pad:        { min: 300,  max: 3000  },
  chords:     { min: 1000, max: 10000 },
  bgHigh:     { min: 1500, max: 8000  },
  bgMid:      { min: 800,  max: 6000  },
  bgLow:      { min: 200,  max: 3000  }
}

// Range sicuro per Q
const Q_RANGE = { min: 0.5, max: 6.0 }

// Normalizzazione lineare con clamp
function mapRange(value, inMin, inMax, outMin, outMax) {
  const normalized = (value - inMin) / (inMax - inMin)
  const clamped = Math.max(0, Math.min(1, normalized))
  return outMin + clamped * (outMax - outMin)
}

// Applicazione con ramping
function applyFilterMod(filter, cutoffValue, qValue, voiceName) {
  const range = CUTOFF_RANGES[voiceName]
  filter.frequency.rampTo(
    Math.max(range.min, Math.min(range.max, cutoffValue)),
    RAMP_TIME
  )
  filter.Q.rampTo(
    Math.max(Q_RANGE.min, Math.min(Q_RANGE.max, qValue)),
    RAMP_TIME
  )
}
```

---

## Modifiche Necessarie

### Backend: VirtualUserService.js
Rimuovere `emit('hover-update')` per virtual users - contribuiscono solo alle metriche aggregate:
```javascript
// RIMUOVERE questa linea (967):
// this.io.to(roomId).emit('hover-update', hoverData)

// MANTENERE solo questa (963):
hoverOrchestrator.addHoverEvent(hoverData)
```

### Backend: HoverOrchestrator.js
1. Semplificare `generateUnifiedModulation()` - rimuovere calcoli LFO
2. Inviare metriche raw invece di parametri pre-calcolati:
```javascript
broadcast('unified-modulation', {
  metrics: {
    density,
    hoverCount,
    spatialVariance,
    uniqueUsers: uniqueUsers.size,
    flowDirection: { x, y },
    rhythmAnalysis: { period, regularity },
    clusterCount: clusterCenters.length,
    hotspotCount: hotspotZones.length,
    intensity: { min, avg, max }
  }
})
```

### Frontend: AudioService.js
1. Rimuovere modulazione ambient da `handleHoverModulation()`
2. Riscrivere `applyUnifiedModulation()` con mapping 1:1:
```javascript
applyUnifiedModulation(data) {
  const m = data.metrics

  // Bass
  this.ambientFilters.bass.frequency.rampTo(mapRange(m.density, 0, 10, 80, 300), 0.5)
  this.ambientFilters.bass.Q.rampTo(mapRange(m.hoverCount, 0, 100, 0.5, 3.0), 0.5)

  // Pad
  this.ambientFilters.pad.frequency.rampTo(mapRange(m.spatialVariance, 0, 1, 400, 2000), 0.5)
  this.ambientFilters.pad.Q.rampTo(mapRange(m.uniqueUsers, 1, 10, 0.5, 4.0), 0.5)

  // ... etc per tutte le voci
}
```

### Frontend: SocketEventCoordinator.js
Nessuna modifica (già ascolta `unified-modulation`)

---

## Vantaggi

1. **Core concept rispettato**: ogni parametro audio deriva da una metrica di interazione specifica
2. **Niente LFO autonomi**: il suono emerge solo dalle azioni degli utenti
3. **Varietà timbrica**: ogni voce risponde a metriche diverse
4. **Debugging facile**: mapping 1:1 = facile capire cosa causa cosa
5. **Performance**: meno calcoli nel backend (no LFO generation)

---

## Test di Validazione

1. Con 1 utente fermo: tutti i filtri stabili sui valori base
2. Con movimento verticale: `chords.cutoff` cambia
3. Con movimento orizzontale: `chords.Q` cambia
4. Con più utenti: `pad.Q` e `uniqueUsers` aumentano
5. Con hover regolari: `bgHigh.cutoff` aumenta (melodia cristallina)
6. Con hover sparsi: `pad.cutoff` aumenta (pad brillante)
