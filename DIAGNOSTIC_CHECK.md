# DIAGNOSTIC CHECK - Background Music Evolution

## Test da fare nella console del browser (F12):

### 1. Verifica che il sistema parta
Cerca questi log all'avvio:
```
🎵 Starting bass + pad + chords composition system
🎵 Simplified generative system initialized
```

### 2. Verifica che gli accordi cambino
Ogni 8 secondi dovresti vedere:
```
🎵 Harmony: I-V-vi-IV chord 0/4 (root: 0)
🎵 Harmony: I-V-vi-IV chord 1/4 (root: 4)
🎵 Harmony: I-V-vi-IV chord 2/4 (root: 5)
🎵 Harmony: I-V-vi-IV chord 3/4 (root: 3)
```

### 3. Verifica che le progressioni cambino
Dopo 3-6 cicli (96-192 secondi) dovresti vedere:
```
🎼 PROGRESSION CHANGE: I-IV-V-IV (driving) complexity=0.XX
```

### 4. Verifica che le note suonino
Ogni volta che un layer suona dovresti vedere:
```
🎵 bass: 110.0Hz (octave=-2, tonic=440Hz, chord=0)
🎵 pad: 164.8Hz, 246.9Hz (octave=0, tonic=440Hz, chord=0)
🎵 chords: 440.0Hz, 554.4Hz, 659.3Hz (octave=1, tonic=440Hz, chord=0)
```

## DIAGNOSI:

### Se NON vedi i log "Harmony":
→ Il loop non sta chiamando advanceHarmony()
→ C'è un problema col timing

### Se vedi i log "Harmony" ma SEMPRE stesso chord/root:
→ chordProgression non cambia
→ currentChord non avanza

### Se vedi log diversi ma suono uguale:
→ Le frequenze sono calcolate male
→ I synth non suonano correttamente

### Se NON vedi alcun log:
→ Il sistema generativo non parte
→ evolvingGenerationActive è false
