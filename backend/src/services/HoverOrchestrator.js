/**
 * HoverOrchestrator Service
 * Sistema centralizzato per l'analisi e orchestrazione di hover multi-utente
 * Constitutional requirement: <100ms processing latency, unified modulation synthesis
 */

class HoverOrchestrator {
  constructor(roomId, socketIo) {
    this.roomId = roomId
    this.socketIo = socketIo

    // Buffer hover per analisi
    this.hoverBuffer = []
    this.maxBufferSize = 100 // keep last 100 hover events
    this.bufferWindowMs = 5000 // analyze last 5 seconds

    // Stato analisi aggregato
    this.aggregateState = {
      hoverCount: 0,
      uniqueUsers: new Set(),
      averagePosition: { x: 0.5, y: 0.5 },
      density: 0, // hover al secondo
      spatialVariance: 0, // varianza spaziale
      intensityDistribution: { min: 0, max: 0, avg: 0 },
      lastUpdate: Date.now(),

      // Pattern detection
      patterns: {
        clusterCenters: [], // centri di aggregazione hover
        flowDirection: { x: 0, y: 0 }, // direzione movimento dominante
        rhythmAnalysis: { period: 0, regularity: 0 }, // analisi ritmica
        hotspotZones: [] // aree ad alta attività
      }
    }

    // Modulazione unificata output
    this.unifiedModulation = {
      // PRIMARY LFO - ULTRA LENTO per modulazione principale
      lfoFrequency: 0.01,     // range 0.001-0.15Hz (6-1000 secondi!)
      lfoAmplitude: 0.3,      // ampiezza ridotta per effetto molto subtle
      lfoShape: 'sine',       // forma d'onda smooth

      // SECONDARY LFO - Molto lento per texture profonda
      lfo2Frequency: 0.005,   // range 0.002-0.05Hz (20-500 secondi!)
      lfo2Amplitude: 0.15,    // ampiezza molto ridotta
      lfo2Shape: 'triangle',  // forma d'onda lineare

      // TERTIARY LFO - Ultra lento per evoluzione strutturale
      lfo3Frequency: 0.001,   // range 0.0005-0.02Hz (50-2000 secondi!)
      lfo3Amplitude: 0.1,     // ampiezza minima per cambiamenti strutturali
      lfo3Shape: 'sine',      // evoluzione organica

      // QUATERNARY LFO - Micro-modulazioni quasi impercettibili
      lfo4Frequency: 0.002,   // range 0.001-0.01Hz (100-1000 secondi!)
      lfo4Amplitude: 0.05,    // micro-variazioni
      lfo4Shape: 'sawtooth',  // cambiamenti direzionali molto lenti

      // Filter parameters
      filterCutoff: 1000,     // cutoff frequenza filtro (Hz)
      filterResonance: 1.0,   // risonanza filtro (Q)
      filterSlope: 12,        // pendenza filtro (dB/octave)

      // Filter modulation depth parameters
      filterFreqModDepth: 0.3,  // profondità modulazione frequenza (0-1)
      filterResModDepth: 0.2,   // profondità modulazione risonanza (0-1)

      // Spatial parameters
      spatialPan: 0,          // pan spaziale (-1 a 1)
      spatialWidth: 0.5,      // larghezza stereo (0-1)
      spatialRotateSpeed: 0.05, // velocità rotazione spaziale (Hz)

      // Effect parameters
      reverbMix: 0.2,         // mix riverbero
      delayTime: 0,          // tempo delay (ms)
      distortionAmount: 0,    // quantità distorsione

      // Modulation character parameters
      modulationDepth: 0.4,    // profondità generale modulazione (0-1)
      modulationRate: 0.3,     // velocità generale modulazione (0-1)
      vibratoDepth: 0.1,       // profondità vibrato (0-1)
      tremoloDepth: 0.05,      // profondità tremolo (0-1) - molto ridotta

      // Evolution parameters
      evolutionSpeed: 0.5,    // velocità evoluzione parametri
      complexity: 0.5,        // complessità modulazione

      timestamp: Date.now(),
      generation: 0           // versione modulazione
    }

    // Intervallo aggiornamento - RIDOTTO per prevenire tremolo
    this.updateInterval = 500 // ms (2Hz update rate - molto più lento)
    this.lastAnalysisTime = 0
    this.isActive = false

    // Performance tracking
    this.performanceMetrics = {
      analysisTime: 0,
      hoverProcessed: 0,
      modulationsGenerated: 0,
      averageLatency: 0
    }

    // Smoothing parameters for gradual transitions - ULTRA CONSERVATIVE
    this.smoothingParams = {
      lfoFrequencySmoothing: 0.95,    // smoothing factor (0.95-0.99) - MOLTO conservativo
      lfoAmplitudeSmoothing: 0.97,    // very smooth amplitude changes
      lfo2FrequencySmoothing: 0.98,   // ultra-smooth secondary LFO
      lfo3FrequencySmoothing: 0.99,   // estremamente smooth tertiary LFO
      lfo4FrequencySmoothing: 0.995,  // quasi impercettibile per micro LFO
      filterSmoothing: 0.96,          // very gradual filter changes
      spatialSmoothing: 0.94,         // very smooth spatial movement
      effectsSmoothing: 0.92          // slow effect transitions
    }

    // Previous values for smoothing calculation
    this.previousModulation = { ...this.unifiedModulation }
    this.isFirstModulation = true
  }

  /**
   * Avvia l'orchestratore per la room
   */
  start() {
    if (this.isActive) return

    this.isActive = true
    this.lastAnalysisTime = Date.now()

    // Avvia ciclo di analisi e broadcast
    this.analysisLoop = setInterval(() => {
      if (this.isActive) {
        this.analyzeAndBroadcast()
      }
    }, this.updateInterval)

    console.log(`🎛️ HoverOrchestrator started for room ${this.roomId}`)
  }

  /**
   * Ferma l'orchestratore
   */
  stop() {
    this.isActive = false

    if (this.analysisLoop) {
      clearInterval(this.analysisLoop)
      this.analysisLoop = null
    }

    console.log(`🛑 HoverOrchestrator stopped for room ${this.roomId}`)
  }

  /**
   * Aggiunge hover event al buffer per analisi
   * @param {Object} hoverEvent - Evento hover ricevuto
   */
  addHoverEvent(hoverEvent) {
    const enrichedEvent = {
      ...hoverEvent,
      timestamp: Date.now(),
      roomId: this.roomId,
      id: `hover_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    // Aggiungi al buffer
    this.hoverBuffer.push(enrichedEvent)

    // Mantieni buffer size limitato
    if (this.hoverBuffer.length > this.maxBufferSize) {
      this.hoverBuffer.shift()
    }

    // Cleanup vecchi eventi
    this.cleanupOldEvents()

    // Update performance metrics
    this.performanceMetrics.hoverProcessed++

    console.log(`📥 Hover event added: userId=${hoverEvent.userId}, position=(${hoverEvent.position?.x?.toFixed(2)}, ${hoverEvent.position?.y?.toFixed(2)})`)
  }

  /**
   * Rimuove eventi vecchi dal buffer
   */
  cleanupOldEvents() {
    const cutoffTime = Date.now() - this.bufferWindowMs
    this.hoverBuffer = this.hoverBuffer.filter(event => event.timestamp > cutoffTime)
  }

  /**
   * Ciclo principale di analisi e broadcast
   */
  analyzeAndBroadcast() {
    const startTime = performance.now()

    try {
      // Pulisci buffer vecchi
      this.cleanupOldEvents()

      if (this.hoverBuffer.length === 0) {
        return // Nessun hover da analizzare
      }

      // Analizza aggregato
      this.updateAggregateAnalysis()

      // Genera modulazione unificata
      this.generateUnifiedModulation()

      // Broadcast a tutti i client
      this.broadcastModulation()

      // Update performance metrics
      const processingTime = performance.now() - startTime
      this.updatePerformanceMetrics(processingTime)

      // Verifica requisito costituzionale
      if (processingTime > 100) {
        console.warn(`⚠️ HoverOrchestrator processing time ${processingTime.toFixed(2)}ms exceeds 100ms constitutional requirement`)
      }

    } catch (error) {
      console.error('❌ HoverOrchestrator analysis error:', error)
    }
  }

  /**
   * Aggiorna analisi aggregata degli hover
   */
  updateAggregateAnalysis() {
    const now = Date.now()
    const recentHovers = this.hoverBuffer

    if (recentHovers.length === 0) return

    // Calcola metriche base
    this.aggregateState.hoverCount = recentHovers.length
    this.aggregateState.uniqueUsers = new Set(recentHovers.map(h => h.userId))

    // Posizione media e varianza spaziale
    const positions = recentHovers.map(h => h.position || { x: 0.5, y: 0.5 })
    this.aggregateState.averagePosition = {
      x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
      y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length
    }

    // Calcola varianza spaziale
    this.aggregateState.spatialVariance = this.calculateSpatialVariance(positions)

    // Calcola densità (hover al secondo)
    const timeWindow = this.bufferWindowMs / 1000 // converti in secondi
    this.aggregateState.density = recentHovers.length / timeWindow

    // Analisi distribuzione intensità
    const intensities = recentHovers.map(h => h.intensity || 0.5)
    this.aggregateState.intensityDistribution = {
      min: Math.min(...intensities),
      max: Math.max(...intensities),
      avg: intensities.reduce((sum, i) => sum + i, 0) / intensities.length
    }

    // Pattern detection avanzata
    this.detectPatterns(recentHovers)

    this.aggregateState.lastUpdate = now
  }

  /**
   * Calcola varianza spaziale delle posizioni hover
   */
  calculateSpatialVariance(positions) {
    if (positions.length < 2) return 0

    const mean = this.aggregateState.averagePosition
    const variance = positions.reduce((sum, pos) => {
      const dx = pos.x - mean.x
      const dy = pos.y - mean.y
      return sum + (dx * dx + dy * dy)
    }, 0) / positions.length

    return Math.sqrt(variance)
  }

  /**
   * Rileva pattern nei dati hover
   */
  detectPatterns(hovers) {
    // Cluster detection (centri di aggregazione)
    this.aggregateState.patterns.clusterCenters = this.detectClusters(hovers)

    // Flow direction (direzione movimento dominante)
    this.aggregateState.patterns.flowDirection = this.calculateFlowDirection(hovers)

    // Rhythm analysis (analisi ritmica)
    this.aggregateState.patterns.rhythmAnalysis = this.analyzeRhythm(hovers)

    // Hotspot zones (aree ad alta attività)
    this.aggregateState.patterns.hotspotZones = this.detectHotspots(hovers)
  }

  /**
   * Rileva cluster di hover
   */
  detectClusters(hovers) {
    const positions = hovers.map(h => h.position || { x: 0.5, y: 0.5 })
    const clusters = []

    // Simple k-means clustering con k=3
    const k = Math.min(3, Math.ceil(positions.length / 2))

    for (let i = 0; i < k; i++) {
      const center = {
        x: Math.random(),
        y: Math.random(),
        weight: 0
      }

      // Assegna punti al cluster più vicino
      positions.forEach(pos => {
        const dist = Math.sqrt(
          Math.pow(pos.x - center.x, 2) +
          Math.pow(pos.y - center.y, 2)
        )
        if (dist < 0.3) { // threshold
          center.weight++
        }
      })

      clusters.push(center)
    }

    return clusters.filter(c => c.weight > 0)
  }

  /**
   * Calcola direzione del flusso di movimento
   */
  calculateFlowDirection(hovers) {
    if (hovers.length < 2) return { x: 0, y: 0 }

    // Ordina per timestamp
    const sortedHovers = [...hovers].sort((a, b) => a.timestamp - b.timestamp)

    let totalDx = 0
    let totalDy = 0
    let count = 0

    for (let i = 1; i < sortedHovers.length; i++) {
      const prev = sortedHovers[i - 1].position || { x: 0.5, y: 0.5 }
      const curr = sortedHovers[i].position || { x: 0.5, y: 0.5 }

      const timeDiff = sortedHovers[i].timestamp - sortedHovers[i - 1].timestamp

      if (timeDiff < 1000) { // solo movimenti recenti
        totalDx += curr.x - prev.x
        totalDy += curr.y - prev.y
        count++
      }
    }

    if (count === 0) return { x: 0, y: 0 }

    return {
      x: totalDx / count,
      y: totalDy / count
    }
  }

  /**
   * Analizza ritmo degli hover
   */
  analyzeRhythm(hovers) {
    if (hovers.length < 3) return { period: 0, regularity: 0 }

    const timestamps = hovers.map(h => h.timestamp).sort()
    const intervals = []

    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1])
    }

    if (intervals.length === 0) return { period: 0, regularity: 0 }

    // Calcola intervallo medio
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length

    // Calcola regolarità (deviazione standard normalizzata)
    const variance = intervals.reduce((sum, interval) => {
      return sum + Math.pow(interval - avgInterval, 2)
    }, 0) / intervals.length

    const standardDeviation = Math.sqrt(variance)
    const regularity = Math.max(0, 1 - (standardDeviation / avgInterval))

    return {
      period: avgInterval,        // periodo in ms
      regularity: regularity      // regolarità 0-1
    }
  }

  /**
   * Rileva hotspot di attività
   */
  detectHotspots(hovers) {
    const gridSize = 4 // 4x4 grid
    const hotspots = []

    // Dividi spazio in griglia e conta hover per cella
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const xMin = i / gridSize
        const xMax = (i + 1) / gridSize
        const yMin = j / gridSize
        const yMax = (j + 1) / gridSize

        const count = hovers.filter(h => {
          const pos = h.position || { x: 0.5, y: 0.5 }
          return pos.x >= xMin && pos.x < xMax && pos.y >= yMin && pos.y < yMax
        }).length

        if (count > 0) {
          hotspots.push({
            x: (xMin + xMax) / 2,
            y: (yMin + yMax) / 2,
            intensity: count / hovers.length,
            count
          })
        }
      }
    }

    return hotspots.filter(hs => hs.intensity > 0.1) // solo hotspot significativi
  }

  /**
   * Genera modulazione unificata basata su analisi aggregata
   */
  generateUnifiedModulation() {
    const state = this.aggregateState
    const patterns = state.patterns

    // LFO Frequency - FIXED: Strictly sub-audible range to prevent tremolo
    // CRITICAL: Keep ALL LFO frequencies below 20Hz to prevent audible tremolo
    // OPTIMAL: Use 0.1-5Hz range for musical modulation without tremolo
    const baseFrequency = 0.2 + (state.density / 50) // 0.2-0.4Hz base (2.5-5 secondi!)

    // Range selection strictly sub-audible
    let frequencyRange, frequencyMultiplier

    if (state.uniqueUsers.size >= 4) {
      // Molto utenti: modulazioni lente e profonde
      frequencyRange = 'very-slow'
      frequencyMultiplier = 0.5 // range 0.1-0.2Hz (5-10 secondi)
    } else if (state.uniqueUsers.size >= 2) {
      // Pochi utenti: modulazioni percepibili ma senza tremolo
      frequencyRange = 'slow-musical'
      frequencyMultiplier = 0.75 // range 0.15-0.3Hz (3.3-6.6 secondi)
    } else {
      // Un solo utente: modulazioni più veloci ma sempre sotto 5Hz
      frequencyRange = 'medium-slow'
      frequencyMultiplier = 1.0 // range 0.2-0.4Hz (2.5-5 secondi)
    }

    // Applica pattern rhythmical con range STRETTAMENTE sub-audibile
    const rhythmModifier = patterns.rhythmAnalysis.period > 0 ?
      Math.min(0.3, 50 / patterns.rhythmAnalysis.period) : 0.05 // max 0.3Hz (3.3 secondi)

    // Calcolo finale con range ASSOLUTAMENTE sicuro (0.1-5Hz per evitare tremolo)
    this.unifiedModulation.lfoFrequency = Math.max(0.1, Math.min(5.0, // range 0.1-5Hz (0.2-10 secondi!)
      baseFrequency * frequencyMultiplier + rhythmModifier * 0.1
    ))

    // Log range selection
    console.log(`🎛️ LFO Range: ${frequencyRange}, freq=${this.unifiedModulation.lfoFrequency.toFixed(4)}Hz (${(1/this.unifiedModulation.lfoFrequency).toFixed(0)}s period)`)

    // LFO Amplitude basata su varianza spaziale e intensità
    this.unifiedModulation.lfoAmplitude = Math.max(0.1, Math.min(1.0,
      (state.spatialVariance * 2) * 0.5 + (state.intensityDistribution.avg * 0.5)
    ))

    // LFO Shape basata su regolarità ritmica
    if (patterns.rhythmAnalysis.regularity > 0.7) {
      this.unifiedModulation.lfoShape = 'sine' // molto regolare
      this.unifiedModulation.lfo2Shape = 'sine' // anche LFO2 regolare
    } else if (patterns.rhythmAnalysis.regularity > 0.4) {
      this.unifiedModulation.lfoShape = 'triangle' // moderatamente regolare
      this.unifiedModulation.lfo2Shape = 'triangle' // LFO2 moderatamente regolare
    } else {
      this.unifiedModulation.lfoShape = 'sawtooth' // irregolare
      this.unifiedModulation.lfo2Shape = 'sine' // LFO2 rimane smooth per contrasto
    }

    // SECONDARY LFO parameters - texture profonda ma SEMPRE sub-audibile
    this.unifiedModulation.lfo2Frequency = Math.max(0.05, Math.min(1.0, // 0.05-1.0Hz (1-20 secondi)
      this.unifiedModulation.lfoFrequency * 0.25 // LFO2 è ~25% della frequenza primaria
    ))
    this.unifiedModulation.lfo2Amplitude = Math.max(0.03, Math.min(0.2,
      this.unifiedModulation.lfoAmplitude * 0.5 // LFO2 ha ampiezza ulteriormente ridotta
    ))

    // TERTIARY LFO parameters - evoluzione strutturale molto lenta ma safe
    const evolutionFactor = state.uniqueUsers.size / 10 + state.density / 100
    this.unifiedModulation.lfo3Frequency = Math.max(0.01, Math.min(0.5, // 0.01-0.5Hz (2-100 secondi)
      0.02 + evolutionFactor * 0.005 // range molto lento ma sempre sopra 0.01Hz
    ))
    this.unifiedModulation.lfo3Amplitude = Math.max(0.02, Math.min(0.15,
      evolutionFactor * 0.1 // ampiezza minima per evoluzione percepibile solo a lungo termine
    ))

    // QUATERNARY LFO parameters - micro-modulazioni impercettibili e sicure
    const spatialActivity = patterns.flowDirection.x ** 2 + patterns.flowDirection.y ** 2
    this.unifiedModulation.lfo4Frequency = Math.max(0.02, Math.min(0.2, // 0.02-0.2Hz (5-50 secondi)
      0.05 + spatialActivity * 0.01 // micro-variazioni basate su attività spaziale
    ))
    this.unifiedModulation.lfo4Amplitude = Math.max(0.01, Math.min(0.08,
      0.02 + patterns.hotspotZones.length * 0.02 // variazioni minime basate su hotspot
    ))

    // Shape assignment basata su regolarità ritmica per tutti gli LFO
    if (patterns.rhythmAnalysis.regularity > 0.8) {
      this.unifiedModulation.lfo2Shape = 'sine'      // molto regolare
      this.unifiedModulation.lfo3Shape = 'sine'      // evoluzione organica
      this.unifiedModulation.lfo4Shape = 'triangle'  // micro-variazioni lineari
    } else if (patterns.rhythmAnalysis.regularity > 0.5) {
      this.unifiedModulation.lfo2Shape = 'triangle'  // moderatamente regolare
      this.unifiedModulation.lfo3Shape = 'sine'      // evoluzione comunque fluida
      this.unifiedModulation.lfo4Shape = 'sine'      // micro-variazioni smooth
    } else {
      this.unifiedModulation.lfo2Shape = 'sine'      // texture rimane fluida
      this.unifiedModulation.lfo3Shape = 'sawtooth'  // evoluzione direzionale lenta
      this.unifiedModulation.lfo4Shape = 'sine'      // micro-variazioni sempre gentili
    }

    // Filter Cutoff basato su posizione media e cluster
    const positionInfluence = (1 - state.averagePosition.y) // posizione Y influisce su cutoff
    const clusterInfluence = patterns.clusterCenters.length > 0 ?
      patterns.clusterCenters.length / 3 : 0

    this.unifiedModulation.filterCutoff = Math.max(200, Math.min(4000,
      200 + (positionInfluence * 2000) + (clusterInfluence * 1000)
    ))

    // Filter Resonance basata su intensità e flusso
    const flowMagnitude = Math.sqrt(
      patterns.flowDirection.x ** 2 + patterns.flowDirection.y ** 2
    )

    this.unifiedModulation.filterResonance = Math.max(0.5, Math.min(8.0,
      1 + (state.intensityDistribution.avg * 3) + (flowMagnitude * 2)
    ))

    // Spatial Pan basato su posizione media
    this.unifiedModulation.spatialPan = Math.max(-1, Math.min(1,
      (state.averagePosition.x - 0.5) * 2
    ))

    // Spatial Width basato su numero di utenti e varianza
    this.unifiedModulation.spatialWidth = Math.max(0, Math.min(1,
      Math.min(state.uniqueUsers.size / 5, 1) * 0.5 +
      (state.spatialVariance * 0.5)
    ))

    // Effect parameters basati su hotspot e complessità
    const hotspotIntensity = patterns.hotspotZones.reduce((sum, hs) => sum + hs.intensity, 0)
    this.unifiedModulation.reverbMix = Math.max(0, Math.min(0.8, hotspotIntensity * 0.3))

    // Delay basato su ritmo
    this.unifiedModulation.delayTime = patterns.rhythmAnalysis.period > 0 ?
      Math.min(500, patterns.rhythmAnalysis.period / 4) : 0

    // Evolution parameters
    this.unifiedModulation.evolutionSpeed = Math.max(0.1, Math.min(1.0,
      state.density / 5 // più densità = più evoluzione
    ))

    this.unifiedModulation.complexity = Math.max(0.1, Math.min(1.0,
      (state.uniqueUsers.size / 10) * 0.6 + (patterns.clusterCenters.length / 3) * 0.4
    ))

    // NUOVI: Filter modulation depth parameters
    this.unifiedModulation.filterFreqModDepth = Math.max(0.1, Math.min(0.6,
      state.spatialVariance * 1.5 // più varianza = più modulazione frequenza
    ))
    this.unifiedModulation.filterResModDepth = Math.max(0.05, Math.min(0.4,
      state.intensityDistribution.avg * 0.8 // più intensità = più modulazione risonanza
    ))

    // NUOVI: Spatial rotation speed
    this.unifiedModulation.spatialRotateSpeed = Math.max(0.01, Math.min(0.2,
      patterns.flowDirection.x !== 0 || patterns.flowDirection.y !== 0 ?
        Math.sqrt(patterns.flowDirection.x ** 2 + patterns.flowDirection.y ** 2) * 0.1 : 0.02
    ))

    // NUOVI: Modulation character parameters
    this.unifiedModulation.modulationDepth = Math.max(0.1, Math.min(0.8,
      (state.uniqueUsers.size / 5) * 0.6 + (state.spatialVariance * 0.4)
    ))
    this.unifiedModulation.modulationRate = Math.max(0.1, Math.min(0.6,
      this.unifiedModulation.lfoFrequency / 3.0 // rate basato su LFO primario
    ))
    this.unifiedModulation.vibratoDepth = Math.max(0.02, Math.min(0.15,
      patterns.rhythmAnalysis.regularity * this.unifiedModulation.modulationDepth * 0.3
    ))
    this.unifiedModulation.tremoloDepth = Math.max(0.01, Math.min(0.08,
      this.unifiedModulation.modulationDepth * 0.1 // tremolo molto ridotto
    ))

    // Apply smoothing for gradual transitions
    if (!this.isFirstModulation) {
      this.applySmoothing()
    } else {
      this.isFirstModulation = false
    }

    // Update timestamp e generation
    this.unifiedModulation.timestamp = Date.now()
    this.unifiedModulation.generation++

    // Store current values for next smoothing iteration
    this.previousModulation = { ...this.unifiedModulation }

    // Log dettagliato con tutti gli LFO ultra-lenti
    console.log(`🎛️ ULTRA-SLOW modulation generated (${frequencyRange}):`, {
      roomId: this.roomId,
      generation: this.unifiedModulation.generation,
      // PRIMARY LFO
      lfo1Freq: this.unifiedModulation.lfoFrequency.toFixed(4),
      lfo1Period: `${(1/this.unifiedModulation.lfoFrequency).toFixed(0)}s`,
      lfo1Amp: this.unifiedModulation.lfoAmplitude.toFixed(3),
      lfo1Shape: this.unifiedModulation.lfoShape,
      // SECONDARY LFO
      lfo2Freq: this.unifiedModulation.lfo2Frequency?.toFixed(5) || 'N/A',
      lfo2Period: this.unifiedModulation.lfo2Frequency ? `${(1/this.unifiedModulation.lfo2Frequency).toFixed(0)}s` : 'N/A',
      lfo2Amp: this.unifiedModulation.lfo2Amplitude?.toFixed(4) || 'N/A',
      lfo2Shape: this.unifiedModulation.lfo2Shape,
      // TERTIARY LFO
      lfo3Freq: this.unifiedModulation.lfo3Frequency?.toFixed(5) || 'N/A',
      lfo3Period: this.unifiedModulation.lfo3Frequency ? `${(1/this.unifiedModulation.lfo3Frequency).toFixed(0)}s` : 'N/A',
      lfo3Amp: this.unifiedModulation.lfo3Amplitude?.toFixed(4) || 'N/A',
      lfo3Shape: this.unifiedModulation.lfo3Shape,
      // QUATERNARY LFO
      lfo4Freq: this.unifiedModulation.lfo4Frequency?.toFixed(5) || 'N/A',
      lfo4Period: this.unifiedModulation.lfo4Frequency ? `${(1/this.unifiedModulation.lfo4Frequency).toFixed(0)}s` : 'N/A',
      lfo4Amp: this.unifiedModulation.lfo4Amplitude?.toFixed(4) || 'N/A',
      lfo4Shape: this.unifiedModulation.lfo4Shape,
      // Context info
      range: frequencyRange,
      users: state.uniqueUsers.size,
      density: state.density.toFixed(1),
      smoothed: !this.isFirstModulation
    })
  }

  /**
   * Apply smoothing to gradual parameter transitions
   * Uses exponential moving average for smooth changes
   */
  applySmoothing() {
    const sp = this.smoothingParams
    const prev = this.previousModulation
    const curr = this.unifiedModulation

    // LFO parameters smoothing
    this.unifiedModulation.lfoFrequency =
      prev.lfoFrequency * sp.lfoFrequencySmoothing +
      curr.lfoFrequency * (1 - sp.lfoFrequencySmoothing)

    this.unifiedModulation.lfoAmplitude =
      prev.lfoAmplitude * sp.lfoAmplitudeSmoothing +
      curr.lfoAmplitude * (1 - sp.lfoAmplitudeSmoothing)

    // Secondary LFO smoothing - ULTRA SMOOTH
    if (prev.lfo2Frequency !== undefined && curr.lfo2Frequency !== undefined) {
      this.unifiedModulation.lfo2Frequency =
        prev.lfo2Frequency * sp.lfo2FrequencySmoothing +
        curr.lfo2Frequency * (1 - sp.lfo2FrequencySmoothing)

      this.unifiedModulation.lfo2Amplitude =
        prev.lfo2Amplitude * sp.lfoAmplitudeSmoothing +
        curr.lfo2Amplitude * (1 - sp.lfoAmplitudeSmoothing)
    }

    // Tertiary LFO smoothing - ESTREMAMENTE GRADUALE
    if (prev.lfo3Frequency !== undefined && curr.lfo3Frequency !== undefined) {
      this.unifiedModulation.lfo3Frequency =
        prev.lfo3Frequency * sp.lfo3FrequencySmoothing +
        curr.lfo3Frequency * (1 - sp.lfo3FrequencySmoothing)

      this.unifiedModulation.lfo3Amplitude =
        prev.lfo3Amplitude * sp.lfoAmplitudeSmoothing +
        curr.lfo3Amplitude * (1 - sp.lfoAmplitudeSmoothing)
    }

    // Quaternary LFO smoothing - QUASI IMPERCEettibile
    if (prev.lfo4Frequency !== undefined && curr.lfo4Frequency !== undefined) {
      this.unifiedModulation.lfo4Frequency =
        prev.lfo4Frequency * sp.lfo4FrequencySmoothing +
        curr.lfo4Frequency * (1 - sp.lfo4FrequencySmoothing)

      this.unifiedModulation.lfo4Amplitude =
        prev.lfo4Amplitude * sp.lfoAmplitudeSmoothing +
        curr.lfo4Amplitude * (1 - sp.lfoAmplitudeSmoothing)
    }

    // Filter parameters smoothing (more gradual)
    this.unifiedModulation.filterCutoff =
      prev.filterCutoff * sp.filterSmoothing +
      curr.filterCutoff * (1 - sp.filterSmoothing)

    this.unifiedModulation.filterResonance =
      prev.filterResonance * sp.filterSmoothing +
      curr.filterResonance * (1 - sp.filterSmoothing)

    // Spatial parameters smoothing
    this.unifiedModulation.spatialPan =
      prev.spatialPan * sp.spatialSmoothing +
      curr.spatialPan * (1 - sp.spatialSmoothing)

    this.unifiedModulation.spatialWidth =
      prev.spatialWidth * sp.spatialSmoothing +
      curr.spatialWidth * (1 - sp.spatialSmoothing)

    // Effects parameters smoothing (slow transitions)
    this.unifiedModulation.reverbMix =
      prev.reverbMix * sp.effectsSmoothing +
      curr.reverbMix * (1 - sp.effectsSmoothing)

    this.unifiedModulation.delayTime =
      prev.delayTime * sp.effectsSmoothing +
      curr.delayTime * (1 - sp.effectsSmoothing)

    // NUOVI: Filter modulation depth smoothing
    if (prev.filterFreqModDepth !== undefined && curr.filterFreqModDepth !== undefined) {
      this.unifiedModulation.filterFreqModDepth =
        prev.filterFreqModDepth * sp.filterSmoothing +
        curr.filterFreqModDepth * (1 - sp.filterSmoothing)

      this.unifiedModulation.filterResModDepth =
        prev.filterResModDepth * sp.filterSmoothing +
        curr.filterResModDepth * (1 - sp.filterSmoothing)
    }

    // NUOVI: Spatial rotation smoothing
    if (prev.spatialRotateSpeed !== undefined && curr.spatialRotateSpeed !== undefined) {
      this.unifiedModulation.spatialRotateSpeed =
        prev.spatialRotateSpeed * sp.spatialSmoothing +
        curr.spatialRotateSpeed * (1 - sp.spatialSmoothing)
    }

    // NUOVI: Modulation character parameters smoothing
    if (prev.modulationDepth !== undefined && curr.modulationDepth !== undefined) {
      this.unifiedModulation.modulationDepth =
        prev.modulationDepth * 0.9 +
        curr.modulationDepth * 0.1

      this.unifiedModulation.modulationRate =
        prev.modulationRate * sp.lfoFrequencySmoothing +
        curr.modulationRate * (1 - sp.lfoFrequencySmoothing)

      this.unifiedModulation.vibratoDepth =
        prev.vibratoDepth * 0.95 +
        curr.vibratoDepth * 0.05 // molto graduale

      this.unifiedModulation.tremoloDepth =
        prev.tremoloDepth * 0.97 +
        curr.tremoloDepth * 0.03 // estremamente graduale
    }

    // Evolution and complexity parameters
    this.unifiedModulation.evolutionSpeed =
      prev.evolutionSpeed * 0.9 +
      curr.evolutionSpeed * 0.1

    this.unifiedModulation.complexity =
      prev.complexity * 0.85 +
      curr.complexity * 0.15
  }

  /**
   * Broadcast modulazione unificata a tutti i client nella room
   */
  broadcastModulation() {
    const payload = {
      roomId: this.roomId,
      modulation: { ...this.unifiedModulation },
      analysis: {
        hoverCount: this.aggregateState.hoverCount,
        uniqueUsers: this.aggregateState.uniqueUsers.size,
        density: this.aggregateState.density,
        spatialVariance: this.aggregateState.spatialVariance,
        patterns: this.aggregateState.patterns
      },
      timestamp: Date.now()
    }

    // Broadcast a tutti i client nella room
    this.socketIo.to(this.roomId).emit('unified-modulation', payload)

    // Update metrics
    this.performanceMetrics.modulationsGenerated++

    console.log(`📡 Broadcast unified modulation to room ${this.roomId}:`, {
      generation: this.unifiedModulation.generation,
      lfoFreq: this.unifiedModulation.lfoFrequency.toFixed(2),
      lfoAmp: this.unifiedModulation.lfoAmplitude.toFixed(2)
    })
  }

  /**
   * Aggiorna metriche performance
   */
  updatePerformanceMetrics(processingTime) {
    this.performanceMetrics.analysisTime = processingTime
    this.performanceMetrics.averageLatency =
      (this.performanceMetrics.averageLatency * 0.9) + (processingTime * 0.1)
  }

  /**
   * Ottieni stato completo dell'orchestratore
   */
  getOrchestratorState() {
    return {
      roomId: this.roomId,
      isActive: this.isActive,
      bufferSize: this.hoverBuffer.length,
      aggregateState: {
        ...this.aggregateState,
        uniqueUsers: this.aggregateState.uniqueUsers.size
      },
      unifiedModulation: { ...this.unifiedModulation },
      performanceMetrics: { ...this.performanceMetrics }
    }
  }

  /**
   * Resetta stato dell'orchestratore
   */
  reset() {
    this.hoverBuffer = []
    this.aggregateState.uniqueUsers.clear()
    this.unifiedModulation.generation = 0
    this.performanceMetrics = {
      analysisTime: 0,
      hoverProcessed: 0,
      modulationsGenerated: 0,
      averageLatency: 0
    }

    console.log(`🔄 HoverOrchestrator reset for room ${this.roomId}`)
  }
}

module.exports = HoverOrchestrator