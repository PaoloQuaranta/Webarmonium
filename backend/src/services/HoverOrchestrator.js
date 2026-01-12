/**
 * HoverOrchestrator Service
 * Sistema centralizzato per l'analisi e orchestrazione di hover multi-utente
 * Constitutional requirement: <100ms processing latency, unified modulation synthesis
 */

// Issue C-03 Refactor: Removed smoothing imports - frontend now handles ramping via Tone.js
// const { applySmoothingInPlace, applySmoothing } = require('../utils/SmoothingCalculator')
const { DEFAULT_POSITION, DEFAULT_INTENSITY } = require('../constants/MusicConstants')

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
      averagePosition: { ...DEFAULT_POSITION },
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

    // Issue C-03 Refactor: Simplified metrics output (no LFO generation)
    // Frontend now handles 1:1 mapping from raw metrics to filter parameters
    this.rawMetrics = {
      density: 0,
      hoverCount: 0,
      spatialVariance: 0,
      uniqueUsers: 0,
      averagePosition: { x: 0.5, y: 0.5 },
      flowDirection: { x: 0, y: 0 },
      rhythmAnalysis: { period: 0, regularity: 0 },
      clusterCount: 0,
      hotspotCount: 0,
      intensity: { min: 0, avg: 0.5, max: 1 },
      timestamp: Date.now(),
      generation: 0
    }

    // Legacy: kept for backwards compatibility during transition
    this.unifiedModulation = {
      filterCutoff: 1000,
      filterResonance: 1.0,
      spatialPan: 0,
      timestamp: Date.now(),
      generation: 0
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

    // Issue C-03 Refactor: Simplified - no smoothing needed for raw metrics
    // Frontend handles ramping via Tone.js rampTo()
    this.previousMetrics = { ...this.rawMetrics }
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

// console.log(`🎛️ HoverOrchestrator started for room ${this.roomId}`)
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

// console.log(`🛑 HoverOrchestrator stopped for room ${this.roomId}`)
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

// console.log(`📥 Hover event added: userId=${hoverEvent.userId}, position=(${hoverEvent.position?.x?.toFixed(2)}, ${hoverEvent.position?.y?.toFixed(2)})`)
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
// console.warn(`⚠️ HoverOrchestrator processing time ${processingTime.toFixed(2)}ms exceeds 100ms constitutional requirement`)
      }

    } catch (error) {
// console.error('❌ HoverOrchestrator analysis error:', error)
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
    const positions = recentHovers.map(h => h.position || DEFAULT_POSITION)
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
    const positions = hovers.map(h => h.position || DEFAULT_POSITION)
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
      const prev = sortedHovers[i - 1].position || DEFAULT_POSITION
      const curr = sortedHovers[i].position || DEFAULT_POSITION

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
          const pos = h.position || DEFAULT_POSITION
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
   * Issue C-03 Refactor: Simplified metrics collection
   * Collects raw metrics from aggregate state - no LFO generation
   * Frontend handles 1:1 mapping from metrics to filter parameters
   */
  generateUnifiedModulation() {
    const state = this.aggregateState
    const patterns = state.patterns

    // Collect raw metrics for frontend 1:1 mapping
    this.rawMetrics = {
      // Core activity metrics
      density: state.density,
      hoverCount: state.hoverCount,
      spatialVariance: state.spatialVariance,
      uniqueUsers: state.uniqueUsers.size,
      averagePosition: { ...state.averagePosition },

      // Flow and rhythm analysis
      flowDirection: { ...patterns.flowDirection },
      rhythmAnalysis: { ...patterns.rhythmAnalysis },

      // Pattern counts
      clusterCount: patterns.clusterCenters.length,
      hotspotCount: patterns.hotspotZones.length,

      // Intensity distribution
      intensity: { ...state.intensityDistribution },

      // Metadata
      timestamp: Date.now(),
      generation: this.rawMetrics.generation + 1
    }

    // Legacy: minimal backwards compatibility (will be removed in future)
    this.unifiedModulation.filterCutoff = 200 + (state.averagePosition.y * 2000)
    this.unifiedModulation.filterResonance = 0.5 + (state.intensityDistribution.avg * 3)
    this.unifiedModulation.spatialPan = (state.averagePosition.x - 0.5) * 2
    this.unifiedModulation.timestamp = Date.now()
    this.unifiedModulation.generation = this.rawMetrics.generation

    this.previousMetrics = { ...this.rawMetrics }
  }

  /**
   * Issue C-03 Refactor: Broadcast raw metrics to all clients
   * Frontend handles 1:1 mapping from metrics to filter parameters
   */
  broadcastModulation() {
    const payload = {
      roomId: this.roomId,
      // NEW: Raw metrics for frontend 1:1 mapping
      metrics: { ...this.rawMetrics },
      // LEGACY: Keep modulation for backwards compatibility during transition
      modulation: { ...this.unifiedModulation },
      timestamp: Date.now()
    }

    // Broadcast to all clients in the room
    this.socketIo.to(this.roomId).emit('unified-modulation', payload)

    // Update metrics
    this.performanceMetrics.modulationsGenerated++
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
      // Issue C-03 Refactor: Return raw metrics instead of LFO parameters
      rawMetrics: { ...this.rawMetrics },
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

// console.log(`🔄 HoverOrchestrator reset for room ${this.roomId}`)
  }
}

module.exports = HoverOrchestrator