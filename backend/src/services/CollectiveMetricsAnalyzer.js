/**
 * Collective Metrics Analyzer
 *
 * Analyzes collective user interaction patterns to influence compositional parameters:
 * - Average gesture velocity across room
 * - Spatial density (canvas heat map)
 * - Gesture type distribution (tap vs drag ratio)
 * - User activity density
 *
 * These metrics drive musical parameters like articulation, scale, register, etc.
 */

class CollectiveMetricsAnalyzer {
  constructor() {
    // Track recent gestures for analysis (last 30 seconds)
    this.gestureHistory = []
    this.maxHistoryDuration = 30000 // 30 seconds

    // Spatial heat map (divide canvas into grid)
    this.heatMapResolution = 10 // 10x10 grid
    this.heatMap = this.initializeHeatMap()

    // Current metrics
    this.metrics = {
      averageVelocity: 0.5,
      spatialDensity: 0,
      tapDragRatio: 0.5,
      activeUsers: 0,
      dominantZone: { x: 0.5, y: 0.5 },
      activityLevel: 0.5
    }

    // Update interval
    this.updateInterval = null
  }

  /**
   * Initialize heat map grid
   */
  initializeHeatMap() {
    const grid = []
    for (let y = 0; y < this.heatMapResolution; y++) {
      grid[y] = []
      for (let x = 0; x < this.heatMapResolution; x++) {
        grid[y][x] = {
          count: 0,
          lastActivity: 0,
          decay: 0.95 // Decay factor per update cycle
        }
      }
    }
    return grid
  }

  /**
   * Start periodic metric updates
   */
  start() {
    // Update metrics every 2 seconds
    this.updateInterval = setInterval(() => {
      this.updateMetrics()
      this.decayHeatMap()
    }, 2000)
  }

  /**
   * Stop periodic updates
   */
  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
  }

  /**
   * Record a gesture for analysis
   */
  recordGesture(gesture) {
    const now = Date.now()

    // Calculate gesture velocity if available
    const velocity = gesture.velocity || this.estimateVelocity(gesture)

    // Add to history
    this.gestureHistory.push({
      timestamp: now,
      type: gesture.action, // 'tap' or 'drag'
      position: gesture.coordinates || gesture.currentPosition || { x: 0.5, y: 0.5 },
      velocity: velocity,
      userId: gesture.userId
    })

    // Update heat map
    this.updateHeatMap(gesture.coordinates || gesture.currentPosition || { x: 0.5, y: 0.5 })

    // Clean old history
    this.cleanHistory(now)
  }

  /**
   * Estimate velocity from gesture data
   */
  estimateVelocity(gesture) {
    if (gesture.speed) {
      return Math.min(gesture.speed, 1)
    }
    if (gesture.path && gesture.path.length > 1) {
      const totalDistance = this.calculatePathLength(gesture.path)
      const duration = (gesture.endTime || Date.now()) - gesture.startTime
      return Math.min(totalDistance / duration * 1000, 1)
    }
    return 0.5 // Default medium velocity
  }

  /**
   * Calculate path length
   */
  calculatePathLength(path) {
    let length = 0
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i-1].x
      const dy = path[i].y - path[i-1].y
      length += Math.sqrt(dx * dx + dy * dy)
    }
    return length
  }

  /**
   * Update heat map with gesture position
   */
  updateHeatMap(position) {
    const gridX = Math.floor(position.x * this.heatMapResolution)
    const gridY = Math.floor(position.y * this.heatMapResolution)

    if (gridX >= 0 && gridX < this.heatMapResolution &&
        gridY >= 0 && gridY < this.heatMapResolution) {
      this.heatMap[gridY][gridX].count++
      this.heatMap[gridY][gridX].lastActivity = Date.now()
    }
  }

  /**
   * Decay heat map over time
   */
  decayHeatMap() {
    for (let y = 0; y < this.heatMapResolution; y++) {
      for (let x = 0; x < this.heatMapResolution; x++) {
        this.heatMap[y][x].count *= this.heatMap[y][x].decay
      }
    }
  }

  /**
   * Clean old gesture history
   */
  cleanHistory(now) {
    const cutoff = now - this.maxHistoryDuration
    this.gestureHistory = this.gestureHistory.filter(g => g.timestamp > cutoff)
  }

  /**
   * Update all metrics based on current data
   */
  updateMetrics() {
    if (this.gestureHistory.length === 0) {
      // Reset to defaults when no activity
      this.metrics.averageVelocity = 0.5
      this.metrics.spatialDensity = 0
      this.metrics.tapDragRatio = 0.5
      this.metrics.activeUsers = 0
      this.metrics.activityLevel = 0
      return
    }

    // Average velocity
    const velocities = this.gestureHistory.map(g => g.velocity || 0.5)
    this.metrics.averageVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length

    // Tap/Drag ratio
    const tapCount = this.gestureHistory.filter(g => g.type === 'tap').length
    const dragCount = this.gestureHistory.filter(g => g.type === 'drag').length
    const total = tapCount + dragCount
    this.metrics.tapDragRatio = total > 0 ? tapCount / total : 0.5

    // Active users (unique user IDs in recent history)
    const uniqueUsers = new Set(this.gestureHistory.map(g => g.userId))
    this.metrics.activeUsers = uniqueUsers.size

    // Spatial density (find hottest zone)
    let maxCount = 0
    let hotX = 0.5
    let hotY = 0.5
    let totalActivity = 0

    for (let y = 0; y < this.heatMapResolution; y++) {
      for (let x = 0; x < this.heatMapResolution; x++) {
        const count = this.heatMap[y][x].count
        totalActivity += count
        if (count > maxCount) {
          maxCount = count
          hotX = (x + 0.5) / this.heatMapResolution
          hotY = (y + 0.5) / this.heatMapResolution
        }
      }
    }

    this.metrics.dominantZone = { x: hotX, y: hotY }
    this.metrics.spatialDensity = Math.min(totalActivity / 100, 1) // Normalize

    // Activity level (gestures per second)
    const recentWindow = 10000 // Last 10 seconds
    const cutoff = Date.now() - recentWindow
    const recentGestures = this.gestureHistory.filter(g => g.timestamp > cutoff)
    this.metrics.activityLevel = Math.min(recentGestures.length / 10, 1) // Normalize to 0-1
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return { ...this.metrics }
  }

  /**
   * Get compositional parameters derived from metrics
   */
  getCompositionalParameters() {
    const m = this.metrics

    // Map metrics to musical parameters
    return {
      // Articulation pattern influenced by activity density
      articulationBias: m.activityLevel > 0.7 ? 'staccato' :
                        m.activityLevel > 0.3 ? 'marcato' : 'legato',

      // Scale choice based on velocity
      scaleType: m.averageVelocity > 0.6 ? 'pentatonic' :
                 m.averageVelocity > 0.3 ? 'major' : 'minor',

      // Base octave from dominant zone Y
      baseOctave: 3 + Math.floor(m.dominantZone.y * 2),

      // Harmonic density based on active users
      harmonicDensity: Math.min(m.activeUsers, 4), // 1-4 voices

      // Rhythmic density from spatial density
      rhythmicDensity: m.spatialDensity,

      // Mode from tap/drag ratio
      mode: m.tapDragRatio > 0.6 ? 'major' :
            m.tapDragRatio > 0.4 ? 'dorian' : 'minor',

      // Spatial gradient data for visual effects
      dominantZone: m.dominantZone,
      activityLevel: m.activityLevel,
      activeUsers: m.activeUsers  // Raw user count for gradient calculation
    }
  }
}

module.exports = CollectiveMetricsAnalyzer
