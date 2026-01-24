/**
 * CompositionMonitor
 * Real-time monitoring of compositional algorithm parameters
 * Collects snapshots, provides statistics, and streams to dashboard
 *
 * Features:
 * - Real-time parameter collection from all composition engines
 * - In-memory buffer for fast access (last 100 snapshots)
 * - File-based persistence for 24-hour statistics (JSON Lines format)
 * - WebSocket streaming to monitoring dashboard
 * - REST API for historical stats and reports
 */

const fs = require('fs')
const path = require('path')

class CompositionMonitor {
  constructor() {
    // Enable/disable via environment variable
    this.enabled = process.env.COMPOSITION_MONITOR === 'true'

    // In-memory buffer for real-time access
    this.buffer = []
    this.maxBufferSize = 100

    // Write buffer for batched file writes
    this.writeBuffer = []
    this.flushInterval = null

    // WebSocket subscribers
    this.subscribers = new Set()

    // 5-minute history buffer for numeric fields (for linear graphs)
    // Each entry: { timestamp, value }
    this.historyDuration = parseInt(process.env.HISTORY_DURATION_MS) || (5 * 60 * 1000) // 5 minutes default
    this.maxHistoryEntriesPerField = 600 // Safety limit: ~1 entry/sec for 10 minutes
    this.historyBuffer = {
      // Core metrics
      'core.tempo': [],
      'core.compositionsInSection': [],
      'core.complexityLevel': [],
      'core.density': [],
      'core.tensionLevel': [],
      'core.compositionCount': [],
      // Harmony metrics
      'harmony.progressionLength': [],
      // Style metrics
      'style.energy': [],
      'style.tempo': [],
      'style.harmonicComplexity.chromaticism': [],
      'style.harmonicComplexity.dissonance': [],
      // Materials metrics
      'materials.total': [],
      'materials.activeCount': [],
      // Room metrics
      'room.gestureCount': [],
      'room.sessionDuration': []
    }

    // Statistics aggregator
    this.stats = {
      hourly: new Map(), // hour -> aggregated stats
      eventCounts: {
        compositions: 0,
        keyChanges: 0,
        modeChanges: 0,
        formChanges: 0,
        styleShifts: 0
      },
      lastKeyCenter: null,
      lastMode: null,
      lastForm: null,
      lastDominantGenre: null, // Track dominant genre for style shifts
      startTime: Date.now()
    }

    // Log file configuration
    this.logsDir = path.join(__dirname, '../../logs/composition-metrics')
    this.currentLogFile = null
    this.currentLogDate = null

    // History broadcast throttling (reduce WebSocket payload)
    this.historyBroadcastInterval = 5000 // Send history every 5 seconds max
    this.lastHistoryBroadcast = 0
    this.historyBroadcastTimer = null

    // Initialize if enabled
    if (this.enabled) {
      this._ensureLogsDirectory()
      this._startFlushInterval()
      this._startHistoryBroadcastInterval()
      console.log('CompositionMonitor: Enabled and initialized')
    } else {
      console.log('CompositionMonitor: Disabled (set COMPOSITION_MONITOR=true to enable)')
    }
  }

  /**
   * Record a composition snapshot
   * @param {string} roomId - Room identifier
   * @param {Object} data - Snapshot data from composition engines
   */
  recordSnapshot(roomId, data) {
    if (!this.enabled) return

    const snapshot = {
      timestamp: Date.now(),
      roomId,
      ...data
    }

    // Add to in-memory buffer
    this.buffer.push(snapshot)
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift()
    }

    // Update 5-minute history buffer for numeric fields
    this._updateHistoryBuffer(snapshot)

    // Track event counts and changes
    this._trackChanges(snapshot)

    // Update hourly aggregates
    this._updateHourlyStats(snapshot)

    // Add to write buffer for persistence
    this.writeBuffer.push(snapshot)

    // Broadcast to subscribers (throttled internally)
    this._broadcastSnapshot(snapshot)
  }

  /**
   * Create a snapshot from composition state
   * @param {string} roomId - Room identifier
   * @param {Object} compositionEngine - CompositionEngine instance
   * @param {Object} harmonicEngine - HarmonicEngine instance
   * @param {Object} styleAnalyzer - StyleAnalyzer instance
   * @param {Object} materialLibrary - MaterialLibrary instance
   * @param {Object} roomState - Room composition state
   * @param {string} source - Source of composition ('landing' or 'room')
   * @returns {Object} Complete snapshot
   */
  createSnapshot(roomId, compositionEngine, harmonicEngine, styleAnalyzer, materialLibrary, roomState, source = 'room') {
    if (!this.enabled) return null

    const style = styleAnalyzer.getCurrentStyle()
    const materialStats = materialLibrary.getStats()

    return {
      // Source indicator (landing or room)
      source,

      // Core composition parameters
      core: {
        keyCenter: compositionEngine.keyCenter,
        mode: compositionEngine.mode,
        tempo: compositionEngine.tempo,
        timeSignature: compositionEngine.timeSignature || '4/4',
        formStructure: compositionEngine.formStructure,
        // Entry #163: Use lastComposedSection (what was actually composed) not currentSection (next to compose)
        currentSection: compositionEngine.lastComposedSection || compositionEngine.currentSection,
        nextSection: compositionEngine.currentSection,
        compositionsInSection: compositionEngine.compositionsInSection || 0,
        sectionHistory: compositionEngine.sectionHistory?.slice(-5) || [],
        // Entry #163: Track form cycle completion
        formCycleLength: compositionEngine.formCycleLength || 1,
        formCycleProgress: `${compositionEngine.sectionHistory?.length || 0}/${compositionEngine.formCycleLength || 1}`,
        hasCompletedCycle: (compositionEngine.sectionHistory?.length || 0) >= (compositionEngine.formCycleLength || 1),
        complexityLevel: compositionEngine.complexityLevel,
        density: compositionEngine.density,
        tensionLevel: compositionEngine.tensionLevel,
        compositionCount: roomState?.compositionCount || 0
      },

      // Harmonic engine state
      harmony: {
        currentKey: harmonicEngine.currentKey,
        currentMode: harmonicEngine.currentMode,
        currentChord: harmonicEngine.currentChord,
        progressionLength: harmonicEngine.progressionHistory?.length || 0
      },

      // Style analysis
      style: {
        energy: style.energy,
        tempo: style.tempo,
        timeSignature: style.timeSignature,
        rhythmicCharacter: style.rhythmicCharacter,
        // Explicitly extract melodicCharacter with nested properties
        melodicCharacter: {
          ...(style.melodicCharacter || {}),
          intervalProfile: style.melodicCharacter?.intervalProfile || null,
          contourType: style.melodicCharacter?.contourType || null
        },
        // Explicitly extract harmonicComplexity with nested properties
        harmonicComplexity: {
          chromaticism: style.harmonicComplexity?.chromaticism ?? 0,
          dissonance: style.harmonicComplexity?.dissonance ?? 0,
          modalFlavor: style.harmonicComplexity?.modalFlavor || null
        },
        genreWeights: style.genreWeights
      },

      // Material library state
      materials: {
        total: materialStats.totalMaterials || 0,
        byFunction: materialStats.byFunction || {},
        byCharacter: materialStats.byCharacter || {},
        activeCount: materialStats.activeMaterials || 0
      },

      // Room state
      room: {
        gestureCount: roomState?.gestureCount || 0,
        compositionStarted: roomState?.compositionStarted || false,
        sessionDuration: roomState?.startTime ? Date.now() - roomState.startTime : 0
      }
    }
  }

  /**
   * Get real-time state (current + recent snapshots)
   */
  getRealtimeState() {
    if (!this.enabled) {
      return { enabled: false }
    }

    // Prune history buffer before returning
    this._pruneHistoryBuffer()

    return {
      enabled: true,
      currentSnapshot: this.buffer[this.buffer.length - 1] || null,
      recentSnapshots: this.buffer.slice(-20),
      eventCounts: { ...this.stats.eventCounts },
      uptime: Date.now() - this.stats.startTime,
      subscriberCount: this.subscribers.size,
      // Include 5-minute history for numeric fields
      numericHistory: this._getCompactHistory()
    }
  }

  /**
   * Get compact history format for WebSocket transmission
   * @returns {Object} Compact history data
   */
  _getCompactHistory() {
    const history = {}
    const now = Date.now()

    for (const [field, entries] of Object.entries(this.historyBuffer)) {
      if (entries.length > 0) {
        history[field] = entries.map(e => [
          Math.round((now - e.timestamp) / 1000), // relative seconds ago
          Math.round(e.value * 1000) / 1000 // rounded value
        ])
      }
    }

    return history
  }

  /**
   * Get 24-hour daily statistics
   */
  getDailyStats() {
    if (!this.enabled) {
      return { enabled: false }
    }

    const now = Date.now()
    const oneDayAgo = now - 24 * 60 * 60 * 1000

    // Collect all snapshots from last 24 hours
    const recentSnapshots = this.buffer.filter(s => s.timestamp > oneDayAgo)

    // Also load from file if available
    const fileSnapshots = this._loadSnapshotsFromFile(oneDayAgo)
    const allSnapshots = [...fileSnapshots, ...recentSnapshots]

    if (allSnapshots.length === 0) {
      return {
        enabled: true,
        timeRange: { start: oneDayAgo, end: now },
        distributions: {},
        counts: this.stats.eventCounts,
        message: 'No data available yet'
      }
    }

    return {
      enabled: true,
      timeRange: { start: oneDayAgo, end: now },
      snapshotCount: allSnapshots.length,
      distributions: this._calculateDistributions(allSnapshots),
      metrics: this._calculateMetrics(allSnapshots),
      trends: this._calculateTrends(allSnapshots),
      counts: { ...this.stats.eventCounts }
    }
  }

  /**
   * Get hourly breakdown
   * @param {number} hours - Number of hours to include
   */
  getHourlyStats(hours = 24) {
    if (!this.enabled) {
      return { enabled: false }
    }

    const hourlyData = []
    const now = new Date()

    for (let i = 0; i < hours; i++) {
      const hourDate = new Date(now.getTime() - i * 60 * 60 * 1000)
      const hourKey = this._getHourKey(hourDate)
      const hourStats = this.stats.hourly.get(hourKey)

      if (hourStats) {
        hourlyData.unshift({
          hour: hourDate.toISOString().slice(0, 13) + ':00:00Z',
          ...hourStats
        })
      }
    }

    return {
      enabled: true,
      hourly: hourlyData
    }
  }

  /**
   * Get room-specific history
   * @param {string} roomId - Room identifier
   * @param {number} limit - Max snapshots to return
   */
  getRoomHistory(roomId, limit = 50) {
    if (!this.enabled) {
      return { enabled: false }
    }

    const roomSnapshots = this.buffer
      .filter(s => s.roomId === roomId)
      .slice(-limit)

    return {
      enabled: true,
      roomId,
      snapshots: roomSnapshots,
      count: roomSnapshots.length
    }
  }

  /**
   * Add a WebSocket subscriber
   * @param {Socket} socket - Socket.io socket
   */
  addSubscriber(socket) {
    if (!this.enabled) return

    this.subscribers.add(socket)

    // Send initial state
    socket.emit('monitor:init', this.getRealtimeState())

    socket.on('disconnect', () => {
      this.subscribers.delete(socket)
    })
  }

  /**
   * Remove a WebSocket subscriber
   * @param {Socket} socket - Socket.io socket
   */
  removeSubscriber(socket) {
    this.subscribers.delete(socket)
  }

  /**
   * Get 5-minute history for all numeric fields (for linear graphs)
   * @returns {Object} History data for each numeric field
   */
  getNumericHistory() {
    if (!this.enabled) {
      return { enabled: false }
    }

    // Prune old entries first
    this._pruneHistoryBuffer()

    const history = {}
    for (const [field, entries] of Object.entries(this.historyBuffer)) {
      history[field] = entries.map(e => ({
        timestamp: e.timestamp,
        value: e.value,
        // Relative time in seconds for easier graphing
        relativeTime: Math.round((Date.now() - e.timestamp) / 1000)
      }))
    }

    return {
      enabled: true,
      duration: this.historyDuration,
      durationSeconds: this.historyDuration / 1000,
      timestamp: Date.now(),
      fields: history
    }
  }

  /**
   * Get 5-minute history for a specific field
   * @param {string} fieldPath - Field path (e.g., 'core.tempo')
   * @returns {Object} History data for the field
   */
  getFieldHistory(fieldPath) {
    if (!this.enabled) {
      return { enabled: false }
    }

    if (!this.historyBuffer[fieldPath]) {
      return {
        enabled: true,
        error: `Unknown field: ${fieldPath}`,
        availableFields: Object.keys(this.historyBuffer)
      }
    }

    // Prune old entries first
    this._pruneHistoryBuffer()

    const entries = this.historyBuffer[fieldPath]
    return {
      enabled: true,
      field: fieldPath,
      duration: this.historyDuration,
      timestamp: Date.now(),
      data: entries.map(e => ({
        timestamp: e.timestamp,
        value: e.value,
        relativeTime: Math.round((Date.now() - e.timestamp) / 1000)
      }))
    }
  }

  // --- Private methods ---

  /**
   * Update the 5-minute history buffer with numeric values from snapshot
   * @param {Object} snapshot - Composition snapshot
   */
  _updateHistoryBuffer(snapshot) {
    const timestamp = snapshot.timestamp
    const core = snapshot.core || {}
    const harmony = snapshot.harmony || {}
    const style = snapshot.style || {}
    const materials = snapshot.materials || {}
    const room = snapshot.room || {}

    // Helper to add value to history if defined (with max size safeguard)
    const addToHistory = (field, value) => {
      if (value !== undefined && value !== null && !isNaN(value)) {
        const buffer = this.historyBuffer[field]
        buffer.push({ timestamp, value })
        // Safety guard: prevent unbounded growth
        if (buffer.length > this.maxHistoryEntriesPerField) {
          buffer.shift()
        }
      }
    }

    // Core metrics
    addToHistory('core.tempo', core.tempo)
    addToHistory('core.compositionsInSection', core.compositionsInSection)
    addToHistory('core.complexityLevel', core.complexityLevel)
    addToHistory('core.density', core.density)
    addToHistory('core.tensionLevel', core.tensionLevel)
    addToHistory('core.compositionCount', core.compositionCount)

    // Harmony metrics
    addToHistory('harmony.progressionLength', harmony.progressionLength)

    // Style metrics
    addToHistory('style.energy', style.energy)
    addToHistory('style.tempo', style.tempo)
    addToHistory('style.harmonicComplexity.chromaticism', style.harmonicComplexity?.chromaticism)
    addToHistory('style.harmonicComplexity.dissonance', style.harmonicComplexity?.dissonance)

    // Materials metrics
    addToHistory('materials.total', materials.total)
    addToHistory('materials.activeCount', materials.activeCount)

    // Room metrics
    addToHistory('room.gestureCount', room.gestureCount)
    addToHistory('room.sessionDuration', room.sessionDuration)

    // Prune entries older than 5 minutes
    this._pruneHistoryBuffer()
  }

  /**
   * Remove entries older than 5 minutes from history buffer
   * Optimized to avoid unnecessary array allocations
   */
  _pruneHistoryBuffer() {
    const cutoff = Date.now() - this.historyDuration

    for (const field of Object.keys(this.historyBuffer)) {
      const buffer = this.historyBuffer[field]

      // Skip if buffer is empty
      if (buffer.length === 0) continue

      // Check if oldest entry is still valid (common case: no pruning needed)
      if (buffer[0].timestamp > cutoff) continue

      // Find first valid index
      let firstValidIndex = 0
      while (firstValidIndex < buffer.length && buffer[firstValidIndex].timestamp <= cutoff) {
        firstValidIndex++
      }

      // Only create new array if we actually need to prune
      if (firstValidIndex > 0) {
        this.historyBuffer[field] = buffer.slice(firstValidIndex)
      }
    }
  }

  _trackChanges(snapshot) {
    this.stats.eventCounts.compositions++

    const core = snapshot.core || {}

    // Track key changes
    if (this.stats.lastKeyCenter && core.keyCenter !== this.stats.lastKeyCenter) {
      this.stats.eventCounts.keyChanges++
      this._emitEvent('monitor:key_change', {
        from: this.stats.lastKeyCenter,
        to: core.keyCenter,
        timestamp: snapshot.timestamp
      })
    }
    this.stats.lastKeyCenter = core.keyCenter

    // Track mode changes
    if (this.stats.lastMode && core.mode !== this.stats.lastMode) {
      this.stats.eventCounts.modeChanges++
      this._emitEvent('monitor:mode_change', {
        from: this.stats.lastMode,
        to: core.mode,
        timestamp: snapshot.timestamp
      })
    }
    this.stats.lastMode = core.mode

    // Track form changes
    if (this.stats.lastForm && core.formStructure !== this.stats.lastForm) {
      this.stats.eventCounts.formChanges++
      this._emitEvent('monitor:form_change', {
        from: this.stats.lastForm,
        to: core.formStructure,
        timestamp: snapshot.timestamp
      })
    }
    this.stats.lastForm = core.formStructure

    // Track style shifts (dominant genre changes)
    const style = snapshot.style || {}
    if (style.genreWeights) {
      const dominantGenre = this._getDominantGenre(style.genreWeights)
      if (this.stats.lastDominantGenre && dominantGenre !== this.stats.lastDominantGenre) {
        this.stats.eventCounts.styleShifts++
        this._emitEvent('monitor:style_shift', {
          from: this.stats.lastDominantGenre,
          to: dominantGenre,
          timestamp: snapshot.timestamp
        })
      }
      this.stats.lastDominantGenre = dominantGenre
    }
  }

  /**
   * Get the dominant genre from genre weights
   * @param {Object} genreWeights - Genre weights object
   * @returns {string} Name of dominant genre
   */
  _getDominantGenre(genreWeights) {
    let maxWeight = 0
    let dominantGenre = 'none'
    for (const [genre, weight] of Object.entries(genreWeights)) {
      if (weight > maxWeight) {
        maxWeight = weight
        dominantGenre = genre
      }
    }
    return dominantGenre
  }

  _updateHourlyStats(snapshot) {
    const hourKey = this._getHourKey(new Date(snapshot.timestamp))

    if (!this.stats.hourly.has(hourKey)) {
      this.stats.hourly.set(hourKey, {
        compositions: 0,
        avgTempo: 0,
        avgEnergy: 0,
        avgComplexity: 0,
        keyChanges: 0,
        modeChanges: 0,
        _tempoSum: 0,
        _energySum: 0,
        _complexitySum: 0
      })
    }

    const hourStats = this.stats.hourly.get(hourKey)
    hourStats.compositions++

    const core = snapshot.core || {}
    const style = snapshot.style || {}

    hourStats._tempoSum += core.tempo || 120
    hourStats._energySum += style.energy || 0.5
    hourStats._complexitySum += core.complexityLevel || 0.5

    hourStats.avgTempo = Math.round(hourStats._tempoSum / hourStats.compositions)
    hourStats.avgEnergy = hourStats._energySum / hourStats.compositions
    hourStats.avgComplexity = hourStats._complexitySum / hourStats.compositions

    // Cleanup old hours (keep last 48 hours)
    this._cleanupOldHours()
  }

  _cleanupOldHours() {
    const cutoff = Date.now() - 48 * 60 * 60 * 1000
    const cutoffHour = this._getHourKey(new Date(cutoff))

    for (const [hourKey] of this.stats.hourly) {
      if (hourKey < cutoffHour) {
        this.stats.hourly.delete(hourKey)
      }
    }
  }

  _getHourKey(date) {
    return date.toISOString().slice(0, 13) // YYYY-MM-DDTHH
  }

  _broadcastSnapshot(snapshot) {
    if (this.subscribers.size === 0) return

    // Don't include history on every snapshot - it's sent separately via throttled interval
    const event = {
      type: 'snapshot',
      data: snapshot,
      eventCounts: { ...this.stats.eventCounts },
      timestamp: Date.now()
    }

    // Collect sockets to remove after iteration (avoid modifying during iteration)
    const toRemove = []
    for (const socket of this.subscribers) {
      try {
        socket.emit('monitor:snapshot', event)
      } catch (err) {
        toRemove.push(socket)
      }
    }
    toRemove.forEach(s => this.subscribers.delete(s))
  }

  /**
   * Start periodic history broadcast interval
   */
  _startHistoryBroadcastInterval() {
    this.historyBroadcastTimer = setInterval(() => {
      this._broadcastHistoryUpdate()
    }, this.historyBroadcastInterval)
  }

  /**
   * Broadcast history update to all subscribers (throttled)
   */
  _broadcastHistoryUpdate() {
    if (this.subscribers.size === 0) return

    const historyEvent = {
      type: 'history_update',
      numericHistory: this._getCompactHistory(),
      timestamp: Date.now()
    }

    const toRemove = []
    for (const socket of this.subscribers) {
      try {
        socket.emit('monitor:history_update', historyEvent)
      } catch (err) {
        toRemove.push(socket)
      }
    }
    toRemove.forEach(s => this.subscribers.delete(s))
    this.lastHistoryBroadcast = Date.now()
  }

  _emitEvent(eventName, data) {
    // Collect sockets to remove after iteration
    const toRemove = []
    for (const socket of this.subscribers) {
      try {
        socket.emit(eventName, data)
      } catch (err) {
        toRemove.push(socket)
      }
    }
    toRemove.forEach(s => this.subscribers.delete(s))
  }

  _ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true })
    }
    // Cleanup old logs on startup
    this._cleanupOldLogs()
  }

  _cleanupOldLogs() {
    try {
      const files = fs.readdirSync(this.logsDir)
        .filter(f => f.startsWith('metrics-') && f.endsWith('.jsonl'))

      // Keep only last 3 days
      const cutoffDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      const cutoffStr = cutoffDate.toISOString().slice(0, 10)

      for (const file of files) {
        const fileDate = file.slice(8, 18) // Extract YYYY-MM-DD from metrics-YYYY-MM-DD.jsonl
        if (fileDate < cutoffStr) {
          fs.unlinkSync(path.join(this.logsDir, file))
          console.log(`CompositionMonitor: Cleaned up old log file ${file}`)
        }
      }
    } catch (err) {
      console.error('CompositionMonitor: Cleanup error:', err.message)
    }
  }

  _getLogFilePath() {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    if (today !== this.currentLogDate) {
      this.currentLogDate = today
      this.currentLogFile = path.join(this.logsDir, `metrics-${today}.jsonl`)
    }

    return this.currentLogFile
  }

  _startFlushInterval() {
    // Flush write buffer every 5 seconds
    this.flushInterval = setInterval(() => {
      this._flushToFile()
    }, 5000)
  }

  _flushToFile() {
    if (this.writeBuffer.length === 0) return

    // Copy and clear buffer immediately (non-blocking)
    const linesToFlush = this.writeBuffer
    this.writeBuffer = []

    // Write asynchronously to avoid blocking event loop
    setImmediate(() => {
      try {
        const logFile = this._getLogFilePath()
        const content = linesToFlush.map(s => JSON.stringify(s)).join('\n') + '\n'

        fs.appendFile(logFile, content, (err) => {
          if (err) {
            console.error('CompositionMonitor: Error writing to log file:', err.message)
          }
        })
      } catch (err) {
        console.error('CompositionMonitor: Error preparing log write:', err.message)
      }
    })
  }

  _loadSnapshotsFromFile(sinceTimestamp) {
    const snapshots = []

    try {
      const files = fs.readdirSync(this.logsDir)
        .filter(f => f.startsWith('metrics-') && f.endsWith('.jsonl'))
        .sort()
        .slice(-2) // Last 2 days

      for (const file of files) {
        const filePath = path.join(this.logsDir, file)
        const content = fs.readFileSync(filePath, 'utf8')
        const lines = content.split('\n').filter(l => l.trim())

        for (const line of lines) {
          try {
            const snapshot = JSON.parse(line)
            if (snapshot.timestamp >= sinceTimestamp) {
              snapshots.push(snapshot)
            }
          } catch (e) {
            // Skip malformed lines
          }
        }
      }
    } catch (err) {
      // No files available yet
    }

    return snapshots
  }

  _calculateDistributions(snapshots) {
    const distributions = {
      keyCenter: {},
      mode: {},
      formStructure: {},
      timeSignature: {},  // Entry #165: Added timeSignature tracking
      genreWeights: {
        ambient: 0, rhythmic: 0, melodic: 0, experimental: 0,
        jazz: 0, classical: 0, electronic: 0, rock: 0
      }
    }

    let genreCount = 0

    for (const snapshot of snapshots) {
      const core = snapshot.core || {}
      const style = snapshot.style || {}

      // Count key centers
      if (core.keyCenter) {
        distributions.keyCenter[core.keyCenter] = (distributions.keyCenter[core.keyCenter] || 0) + 1
      }

      // Count modes
      if (core.mode) {
        distributions.mode[core.mode] = (distributions.mode[core.mode] || 0) + 1
      }

      // Count form structures
      if (core.formStructure) {
        distributions.formStructure[core.formStructure] = (distributions.formStructure[core.formStructure] || 0) + 1
      }

      // Entry #165: Count time signatures
      if (core.timeSignature) {
        distributions.timeSignature[core.timeSignature] = (distributions.timeSignature[core.timeSignature] || 0) + 1
      }

      // Accumulate genre weights
      if (style.genreWeights) {
        for (const [genre, weight] of Object.entries(style.genreWeights)) {
          if (distributions.genreWeights[genre] !== undefined) {
            distributions.genreWeights[genre] += weight
          }
        }
        genreCount++
      }
    }

    // Convert counts to percentages
    const total = snapshots.length
    for (const key of ['keyCenter', 'mode', 'formStructure', 'timeSignature']) {  // Entry #165: Added timeSignature
      for (const [value, count] of Object.entries(distributions[key])) {
        distributions[key][value] = Math.round((count / total) * 100)
      }
    }

    // Average genre weights
    if (genreCount > 0) {
      for (const genre of Object.keys(distributions.genreWeights)) {
        distributions.genreWeights[genre] = distributions.genreWeights[genre] / genreCount
      }
    }

    return distributions
  }

  _calculateMetrics(snapshots) {
    if (snapshots.length === 0) return {}

    const tempos = []
    const energies = []
    const complexities = []
    const densities = []

    for (const snapshot of snapshots) {
      const core = snapshot.core || {}
      const style = snapshot.style || {}

      if (core.tempo) tempos.push(core.tempo)
      if (style.energy !== undefined) energies.push(style.energy)
      if (core.complexityLevel !== undefined) complexities.push(core.complexityLevel)
      if (core.density !== undefined) densities.push(core.density)
    }

    return {
      tempo: this._calcStats(tempos),
      energy: this._calcStats(energies),
      complexity: this._calcStats(complexities),
      density: this._calcStats(densities)
    }
  }

  _calcStats(values) {
    if (values.length === 0) return null

    const sorted = [...values].sort((a, b) => a - b)
    const sum = values.reduce((a, b) => a + b, 0)
    const mean = sum / values.length

    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)

    return {
      min: Math.round(sorted[0] * 100) / 100,
      max: Math.round(sorted[sorted.length - 1] * 100) / 100,
      avg: Math.round(mean * 100) / 100,
      median: Math.round(sorted[Math.floor(sorted.length / 2)] * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100
    }
  }

  _calculateTrends(snapshots) {
    if (snapshots.length < 10) return {}

    // Split into first half and second half
    const mid = Math.floor(snapshots.length / 2)
    const firstHalf = snapshots.slice(0, mid)
    const secondHalf = snapshots.slice(mid)

    const trends = {}

    for (const key of ['tempo', 'energy', 'complexity']) {
      const firstAvg = this._getAverage(firstHalf, key)
      const secondAvg = this._getAverage(secondHalf, key)

      const diff = secondAvg - firstAvg
      const threshold = key === 'tempo' ? 5 : 0.05

      if (diff > threshold) {
        trends[key] = 'increasing'
      } else if (diff < -threshold) {
        trends[key] = 'decreasing'
      } else {
        trends[key] = 'stable'
      }
    }

    return trends
  }

  _getAverage(snapshots, key) {
    let sum = 0
    let count = 0

    for (const s of snapshots) {
      let value
      if (key === 'tempo') {
        value = s.core?.tempo
      } else if (key === 'energy') {
        value = s.style?.energy
      } else if (key === 'complexity') {
        value = s.core?.complexityLevel
      }

      if (value !== undefined) {
        sum += value
        count++
      }
    }

    return count > 0 ? sum / count : 0
  }

  /**
   * Cleanup resources
   */
  shutdown() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }

    if (this.historyBroadcastTimer) {
      clearInterval(this.historyBroadcastTimer)
    }

    // Final flush
    this._flushToFile()

    // Clear subscribers
    this.subscribers.clear()
  }
}

module.exports = CompositionMonitor
