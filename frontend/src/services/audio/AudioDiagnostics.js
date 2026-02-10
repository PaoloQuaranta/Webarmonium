/**
 * AudioDiagnostics.js — Temporary diagnostic tool for audio dropout investigation
 *
 * Passively collects data from 6 channels and correlates them when dropouts occur.
 * Exposed on window.audioDiagnostics for console investigation.
 * Overhead: <0.05ms/frame (~0.3% of frame budget).
 *
 * Console API:
 *   window.audioDiagnostics.getReport()   — Full report
 *   window.audioDiagnostics.getSummary()  — Natural language assessment
 *   window.audioDiagnostics.getDropouts() — Dropout snapshots only
 *   window.audioDiagnostics.start()       — Start collection
 *   window.audioDiagnostics.stop()        — Stop collection
 *   window.audioDiagnostics.reset()       — Clear all buffers
 *
 * Removal: delete this file + remove script tag from rooms.html. Zero residual impact.
 */

class AudioDiagnostics {
  constructor () {
    this._isRunning = false
    this._startTimestamp = 0

    // Channel 1: Long Tasks (PerformanceObserver)
    this._longTasks = []          // ring buffer, max 200
    this._longTaskObserver = null

    // Channel 2: Frame Timing (requestAnimationFrame)
    this._frameTimes = []         // ring buffer, max 120
    this._rafId = null
    this._lastRafTime = 0

    // Channel 3: AudioContext Health (setInterval 500ms)
    this._audioHealth = []        // ring buffer, max 60
    this._audioHealthTimer = null

    // Channel 4: Event Throughput (setInterval 1s)
    this._eventRates = []         // ring buffer, max 120
    this._socketEventCount = 0
    this._socketEventTypes = {}
    this._domEventCount = 0
    this._eventRateTimer = null
    this._socketEventHandler = null  // stored for cleanup
    this._hookedSocket = null        // stored for cleanup (survives reconnection)
    this._domHandlers = []           // stored for cleanup

    // Channel 5: Memory (Chrome-only, setInterval 2s)
    this._memorySnapshots = []    // ring buffer, max 60
    this._memoryTimer = null
    this._lastHeapUsed = 0

    // Channel 6: Dropout Correlation Snapshots
    this._dropouts = []           // ring buffer, max 50
    this._originalOnUnderrun = null
    this._stressMonitorHooked = false
    this._stressMonitorPollTimer = null
    this._audioModeChangeHandler = null

    // Independent dropout detection
    this._independentDropoutCooldown = 0
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  start () {
    if (this._isRunning) return
    this._isRunning = true
    this._startTimestamp = Date.now()

    this._startLongTaskObserver()    // Ch1
    this._startFrameTiming()         // Ch2
    this._startAudioHealthCheck()    // Ch3
    this._startEventThroughput()     // Ch4
    this._startMemoryTracking()      // Ch5
    this._startStressMonitorHook()   // Ch6

    console.log('[AudioDiagnostics] Started — use window.audioDiagnostics.getReport() or .getSummary()')
  }

  stop () {
    if (!this._isRunning) return
    this._isRunning = false

    // Ch1: Long Tasks
    if (this._longTaskObserver) {
      this._longTaskObserver.disconnect()
      this._longTaskObserver = null
    }

    // Ch2: Frame Timing
    if (this._rafId) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }

    // Ch3: Audio Health
    if (this._audioHealthTimer) {
      clearInterval(this._audioHealthTimer)
      this._audioHealthTimer = null
    }

    // Ch4: Event Throughput
    if (this._eventRateTimer) {
      clearInterval(this._eventRateTimer)
      this._eventRateTimer = null
    }
    this._cleanupEventListeners()

    // Ch5: Memory
    if (this._memoryTimer) {
      clearInterval(this._memoryTimer)
      this._memoryTimer = null
    }

    // Ch6: Stress monitor hook
    if (this._stressMonitorPollTimer) {
      clearInterval(this._stressMonitorPollTimer)
      this._stressMonitorPollTimer = null
    }
    this._unhookStressMonitor()

    // audio-mode-change listener
    if (this._audioModeChangeHandler) {
      window.removeEventListener('audio-mode-change', this._audioModeChangeHandler)
      this._audioModeChangeHandler = null
    }

    console.log('[AudioDiagnostics] Stopped')
  }

  reset () {
    this._longTasks = []
    this._frameTimes = []
    this._audioHealth = []
    this._eventRates = []
    this._memorySnapshots = []
    this._dropouts = []
    this._socketEventCount = 0
    this._socketEventTypes = {}
    this._domEventCount = 0
    this._lastHeapUsed = 0
    this._startTimestamp = Date.now()
    console.log('[AudioDiagnostics] Buffers cleared')
  }

  // =========================================================================
  // Channel 1: Long Tasks (PerformanceObserver)
  // =========================================================================

  _startLongTaskObserver () {
    if (typeof PerformanceObserver === 'undefined') return

    try {
      this._longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this._pushRing(this._longTasks, {
            time: Date.now(),
            duration: entry.duration,
            name: entry.name
          }, 200)

          // Independent dropout detection: long task >80ms
          if (entry.duration > 80) {
            this._autoDetectDropout('long-task', { durationMs: entry.duration })
          }
        }
      })
      this._longTaskObserver.observe({ type: 'longtask' })
    } catch (e) {
      // longtask not supported in this browser
    }
  }

  // =========================================================================
  // Channel 2: Frame Timing (requestAnimationFrame)
  // =========================================================================

  _startFrameTiming () {
    this._lastRafTime = performance.now()

    const measure = (now) => {
      if (!this._isRunning) return

      const delta = now - this._lastRafTime
      this._lastRafTime = now

      if (delta > 0 && delta < 2000) {
        this._pushRing(this._frameTimes, {
          time: Date.now(),
          deltaMs: delta
        }, 120)

        // Independent dropout detection: frame >50ms
        if (delta > 50) {
          this._autoDetectDropout('frame-gap', { deltaMs: delta })
        }
      }

      this._rafId = requestAnimationFrame(measure)
    }

    this._rafId = requestAnimationFrame(measure)
  }

  // =========================================================================
  // Channel 3: AudioContext Health (500ms interval)
  // =========================================================================

  _startAudioHealthCheck () {
    this._audioHealthTimer = setInterval(() => {
      if (!this._isRunning) return

      const snap = { time: Date.now() }

      try {
        if (typeof Tone !== 'undefined' && Tone.context) {
          const raw = Tone.context.rawContext
          if (raw) {
            snap.baseLatency = raw.baseLatency || null
            snap.outputLatency = raw.outputLatency || null
            snap.sampleRate = raw.sampleRate || null
            snap.state = raw.state || null
          }
          snap.lookAhead = Tone.context.lookAhead || null
          snap.updateInterval = Tone.context.updateInterval || null
        }
      } catch (e) { /* Tone not ready */ }

      this._pushRing(this._audioHealth, snap, 60)
    }, 500)
  }

  // =========================================================================
  // Channel 4: Event Throughput (1s interval)
  // =========================================================================

  _startEventThroughput () {
    // Socket event counting via onAny
    this._hookSocketEvents()

    // DOM event counting via passive listeners
    this._hookDomEvents()

    // Sample every second
    this._eventRateTimer = setInterval(() => {
      if (!this._isRunning) return

      // Find top 3 socket event types
      const topTypes = Object.entries(this._socketEventTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, v]) => `${k}:${v}`)

      this._pushRing(this._eventRates, {
        time: Date.now(),
        socketPerSec: this._socketEventCount,
        domPerSec: this._domEventCount,
        topSocketTypes: topTypes
      }, 120)

      this._socketEventCount = 0
      this._socketEventTypes = {}
      this._domEventCount = 0
    }, 1000)
  }

  _hookSocketEvents () {
    try {
      const app = window.webarmoniumApp
      const socket = app && app.socketService && app.socketService.socket
      if (!socket || !socket.onAny) return

      this._socketEventHandler = (eventName) => {
        this._socketEventCount++
        this._socketEventTypes[eventName] = (this._socketEventTypes[eventName] || 0) + 1
      }
      this._hookedSocket = socket
      socket.onAny(this._socketEventHandler)
    } catch (e) { /* socket not ready */ }
  }

  _hookDomEvents () {
    const handler = () => { this._domEventCount++ }
    const events = ['mousemove', 'touchmove', 'pointermove', 'wheel', 'keydown']

    for (const evt of events) {
      window.addEventListener(evt, handler, { passive: true })
      this._domHandlers.push({ event: evt, handler })
    }
  }

  _cleanupEventListeners () {
    // Socket — use stored reference (survives reconnection)
    try {
      if (this._hookedSocket && this._hookedSocket.offAny && this._socketEventHandler) {
        this._hookedSocket.offAny(this._socketEventHandler)
      }
    } catch (e) { /* ignore */ }
    this._socketEventHandler = null
    this._hookedSocket = null

    // DOM
    for (const { event, handler } of this._domHandlers) {
      window.removeEventListener(event, handler)
    }
    this._domHandlers = []
  }

  // =========================================================================
  // Channel 5: Memory (Chrome-only, 2s interval)
  // =========================================================================

  _startMemoryTracking () {
    if (!performance.memory) return

    this._lastHeapUsed = performance.memory.usedJSHeapSize

    this._memoryTimer = setInterval(() => {
      if (!this._isRunning) return

      const used = performance.memory.usedJSHeapSize
      const total = performance.memory.totalJSHeapSize
      const delta = used - this._lastHeapUsed
      const allocRateMBs = (delta / (1024 * 1024)) / 2 // per second (2s interval)

      // Detect probable GC: heap dropped by >1MB
      const probableGC = delta < -1024 * 1024

      this._pushRing(this._memorySnapshots, {
        time: Date.now(),
        usedMB: used / (1024 * 1024),
        totalMB: total / (1024 * 1024),
        allocRateMBs,
        probableGC
      }, 60)

      this._lastHeapUsed = used
    }, 2000)
  }

  // =========================================================================
  // Channel 6: Dropout Correlation Snapshots
  // =========================================================================

  _startStressMonitorHook () {
    // Deferred polling: AudioStressMonitor may not exist yet
    if (this._stressMonitorPollTimer) {
      clearInterval(this._stressMonitorPollTimer)
    }

    let attempts = 0
    this._stressMonitorPollTimer = setInterval(() => {
      attempts++
      if (!this._isRunning || this._stressMonitorHooked || attempts > 60) {
        clearInterval(this._stressMonitorPollTimer)
        this._stressMonitorPollTimer = null
        return
      }

      try {
        const monitor = window.webarmoniumApp &&
          window.webarmoniumApp.audioService &&
          window.webarmoniumApp.audioService.stressMonitor

        if (monitor) {
          this._hookStressMonitor(monitor)
        }
      } catch (e) { /* not ready yet */ }
    }, 1000)

    // Backup: listen for audio-mode-change events
    this._audioModeChangeHandler = (event) => {
      const detail = event && event.detail
      if (detail && (detail.to === 'emergency' || detail.to === 'minimal' || detail.to === 'degraded')) {
        this._recordDropout('audio-mode-change:' + detail.to)
      }
    }
    window.addEventListener('audio-mode-change', this._audioModeChangeHandler)
  }

  _hookStressMonitor (monitor) {
    if (this._stressMonitorHooked) return
    this._stressMonitorHooked = true

    // Chain onto existing onUnderrun (don't replace)
    this._originalOnUnderrun = monitor.onUnderrun
    monitor.onUnderrun = (data) => {
      if (this._originalOnUnderrun) this._originalOnUnderrun(data)
      this._recordDropout('stress-monitor-underrun')
    }
  }

  _unhookStressMonitor () {
    if (!this._stressMonitorHooked) return

    try {
      const monitor = window.webarmoniumApp &&
        window.webarmoniumApp.audioService &&
        window.webarmoniumApp.audioService.stressMonitor

      if (monitor && this._originalOnUnderrun !== null) {
        monitor.onUnderrun = this._originalOnUnderrun
      }
    } catch (e) { /* ignore */ }

    this._stressMonitorHooked = false
    this._originalOnUnderrun = null
  }

  // =========================================================================
  // Independent dropout detection
  // =========================================================================

  _autoDetectDropout (source, extra) {
    const now = Date.now()
    // Cooldown: max 1 independent detection per 2s
    if (now - this._independentDropoutCooldown < 2000) return
    this._independentDropoutCooldown = now

    this._recordDropout('auto:' + source, extra)
  }

  // =========================================================================
  // Dropout snapshot creation
  // =========================================================================

  _recordDropout (source, extra) {
    const now = Date.now()
    const window2s = now - 2000

    // Long tasks in last 2s
    const recentLongTasks = this._longTasks.filter(t => t.time > window2s)
    const longTaskTotalMs = recentLongTasks.reduce((s, t) => s + t.duration, 0)

    // Frame times in last 2s
    const recentFrames = this._frameTimes.filter(f => f.time > window2s)
    const maxFrameTime = recentFrames.length > 0
      ? Math.max(...recentFrames.map(f => f.deltaMs))
      : 0
    const avgFrameTime = recentFrames.length > 0
      ? recentFrames.reduce((s, f) => s + f.deltaMs, 0) / recentFrames.length
      : 0

    // Latest audio health
    const latestAudio = this._audioHealth.length > 0
      ? this._audioHealth[this._audioHealth.length - 1]
      : {}

    // Latest event rate
    const latestEvents = this._eventRates.length > 0
      ? this._eventRates[this._eventRates.length - 1]
      : {}

    // Latest memory
    const latestMemory = this._memorySnapshots.length > 0
      ? this._memorySnapshots[this._memorySnapshots.length - 1]
      : {}

    // Visual service state
    const vs = window.visualService
    const visualState = vs ? {
      fps: Math.round(vs.fps),
      performanceMode: vs.performanceMode,
      stressFactor: vs.stressFactor,
      isPaused: vs.isPaused
    } : {}

    const snapshot = {
      time: now,
      timeStr: new Date(now).toLocaleTimeString(),
      source,
      longTasksInWindow: recentLongTasks.length,
      longTaskTotalMs: Math.round(longTaskTotalMs),
      maxFrameTime: Math.round(maxFrameTime * 10) / 10,
      avgFrameTime: Math.round(avgFrameTime * 10) / 10,
      audioState: latestAudio,
      socketPerSec: latestEvents.socketPerSec || 0,
      domPerSec: latestEvents.domPerSec || 0,
      memory: latestMemory,
      visual: visualState,
      extra: extra || null
    }

    this._pushRing(this._dropouts, snapshot, 50)

    console.log(
      `[AudioDiagnostics] Dropout recorded: ${snapshot.timeStr} | ` +
      `src: ${source} | longTasks: ${snapshot.longTasksInWindow} | ` +
      `maxFrame: ${snapshot.maxFrameTime}ms | socket/s: ${snapshot.socketPerSec}`
    )
  }

  // =========================================================================
  // Pattern Analysis
  // =========================================================================

  _detectPatterns () {
    if (this._dropouts.length === 0) {
      return 'No dropouts recorded yet. Keep playing and check again.'
    }

    const total = this._dropouts.length
    const lines = []

    // % with long tasks
    const withLongTasks = this._dropouts.filter(d => d.longTasksInWindow > 0).length
    const longTaskPct = Math.round((withLongTasks / total) * 100)
    if (longTaskPct >= 50) {
      const avgLongTaskMs = this._dropouts
        .filter(d => d.longTasksInWindow > 0)
        .reduce((s, d) => s + d.longTaskTotalMs, 0) / (withLongTasks || 1)
      lines.push(`MAIN THREAD BLOCKING: ${longTaskPct}% of dropouts coincide with long tasks (avg ${Math.round(avgLongTaskMs)}ms)`)
    }

    // % with high frame time
    const withHighFrame = this._dropouts.filter(d => d.maxFrameTime > 50).length
    const highFramePct = Math.round((withHighFrame / total) * 100)
    if (highFramePct >= 50) {
      const avgPeak = this._dropouts
        .filter(d => d.maxFrameTime > 50)
        .reduce((s, d) => s + d.maxFrameTime, 0) / (withHighFrame || 1)
      lines.push(`CANVAS RENDERING: ${highFramePct}% of dropouts had frame times >50ms (avg peak ${Math.round(avgPeak)}ms)`)
    }

    // % with high event throughput
    const withHighEvents = this._dropouts.filter(d => d.socketPerSec > 50 || d.domPerSec > 100).length
    const highEventPct = Math.round((withHighEvents / total) * 100)
    if (highEventPct >= 30) {
      lines.push(`EVENT STORMS: ${highEventPct}% of dropouts had high event throughput`)
    }

    // GC correlation
    const withGC = this._dropouts.filter(d => d.memory && d.memory.probableGC).length
    const gcPct = Math.round((withGC / total) * 100)
    if (withGC > 0) {
      lines.push(`GC PAUSES: ${withGC} dropouts coincided with probable garbage collection events`)
    }

    // Periodicity check (intervals between dropouts)
    if (this._dropouts.length >= 3) {
      const intervals = []
      for (let i = 1; i < this._dropouts.length; i++) {
        intervals.push(this._dropouts[i].time - this._dropouts[i - 1].time)
      }
      const avgInterval = intervals.length > 0
        ? intervals.reduce((a, b) => a + b, 0) / intervals.length
        : 0
      const variance = intervals.length > 1
        ? intervals.reduce((s, v) => s + Math.pow(v - avgInterval, 2), 0) / intervals.length
        : 0
      const cv = avgInterval > 0 ? Math.sqrt(variance) / avgInterval : 999

      if (cv < 0.3 && avgInterval < 60000) {
        lines.push(`PERIODIC: Dropouts occur every ~${Math.round(avgInterval / 1000)}s (CV=${cv.toFixed(2)}) — suggests periodic cause (GC? timer?)`)
      }
    }

    // Audio pipeline health
    const highLatency = this._audioHealth.filter(h => h.outputLatency && h.outputLatency > 0.05)
    if (highLatency.length > this._audioHealth.length * 0.3) {
      lines.push(`AUDIO PIPELINE: High outputLatency detected in ${highLatency.length}/${this._audioHealth.length} samples`)
    }

    // LookAhead adequacy
    const latestAudio = this._audioHealth.length > 0
      ? this._audioHealth[this._audioHealth.length - 1]
      : null
    if (latestAudio && latestAudio.lookAhead && latestAudio.lookAhead < 0.1) {
      lines.push(`LOW LOOKAHEAD: Tone.js lookAhead is ${latestAudio.lookAhead}s — consider increasing for this device`)
    }

    if (lines.length === 0) {
      lines.push(`${total} dropouts recorded but no dominant pattern detected. Check getReport() for details.`)
    }

    return lines.join('\n')
  }

  // =========================================================================
  // Public API
  // =========================================================================

  getSummary () {
    const summary = this._detectPatterns()
    console.log('\n=== AudioDiagnostics Summary ===')
    console.log(summary)
    console.log('================================\n')
    return summary
  }

  getDropouts () {
    return this._dropouts.slice()
  }

  getReport () {
    const uptimeSec = Math.round((Date.now() - this._startTimestamp) / 1000)

    // Event rate stats
    const socketRates = this._eventRates.map(e => e.socketPerSec)
    const domRates = this._eventRates.map(e => e.domPerSec)

    const report = {
      uptime: `${uptimeSec}s`,
      isRunning: this._isRunning,
      summary: this._detectPatterns(),

      dropoutCount: this._dropouts.length,
      dropouts: this._dropouts.map(d => ({
        time: d.timeStr,
        source: d.source,
        longTasksInWindow: d.longTasksInWindow,
        longTaskTotalMs: d.longTaskTotalMs,
        maxFrameTime: `${d.maxFrameTime}ms`,
        avgFrameTime: `${d.avgFrameTime}ms`,
        socketPerSec: d.socketPerSec,
        domPerSec: d.domPerSec,
        visual: d.visual,
        memory: d.memory ? {
          usedMB: d.memory.usedMB ? Math.round(d.memory.usedMB * 10) / 10 : null,
          allocRateMBs: d.memory.allocRateMBs ? Math.round(d.memory.allocRateMBs * 100) / 100 : null,
          probableGC: d.memory.probableGC
        } : null
      })),

      audioContext: this._audioHealth.length > 0
        ? this._audioHealth[this._audioHealth.length - 1]
        : null,

      eventRates: {
        avgSocket: socketRates.length > 0 ? Math.round(socketRates.reduce((a, b) => a + b, 0) / socketRates.length * 10) / 10 : 0,
        avgDom: domRates.length > 0 ? Math.round(domRates.reduce((a, b) => a + b, 0) / domRates.length * 10) / 10 : 0,
        peakSocket: socketRates.length > 0 ? Math.max(...socketRates) : 0,
        peakDom: domRates.length > 0 ? Math.max(...domRates) : 0
      },

      memory: this._memorySnapshots.length > 0
        ? {
            current: this._memorySnapshots[this._memorySnapshots.length - 1],
            suspectedGCs: this._memorySnapshots.filter(m => m.probableGC).length
          }
        : null,

      longTaskStats: {
        total: this._longTasks.length,
        avgDurationMs: this._longTasks.length > 0
          ? Math.round(this._longTasks.reduce((s, t) => s + t.duration, 0) / this._longTasks.length)
          : 0
      },

      frameStats: {
        samples: this._frameTimes.length,
        avgMs: this._frameTimes.length > 0
          ? Math.round(this._frameTimes.reduce((s, f) => s + f.deltaMs, 0) / this._frameTimes.length * 10) / 10
          : 0,
        maxMs: this._frameTimes.length > 0
          ? Math.round(Math.max(...this._frameTimes.map(f => f.deltaMs)) * 10) / 10
          : 0
      }
    }

    console.log('\n=== AudioDiagnostics Report ===')
    console.log(JSON.stringify(report, null, 2))
    console.log('===============================\n')
    return report
  }

  // =========================================================================
  // Utils
  // =========================================================================

  _pushRing (arr, item, maxSize) {
    arr.push(item)
    if (arr.length > maxSize) arr.shift()
  }
}

// ============================================================
// Auto-start and expose on window
// ============================================================
if (typeof window !== 'undefined') {
  window.audioDiagnostics = new AudioDiagnostics()
  window.audioDiagnostics.start()
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioDiagnostics
}
