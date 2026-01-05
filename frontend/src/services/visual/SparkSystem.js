/**
 * SparkSystem
 * Distributed sparks that travel along network edges toward cursors
 *
 * Creates spark particles that:
 * - Distributed across the network
 * - Follow network edge paths toward cursors
 * - Use pathfinding (Dijkstra) to route through network
 * - Sync color with musical events
 */

class SparkSystem {
  /**
   * @param {SpringMeshNetwork} springMesh - Reference to mesh network
   */
  constructor(springMesh) {
    this.springMesh = springMesh

    // Configuration
    const config = (typeof window !== 'undefined' && window.VisualConstants?.SPARK_CONFIG)
      ? window.VisualConstants.SPARK_CONFIG
      : {
          count: 75,
          baseSpeed: 0.3,
          speedVariation: 0.2,
          minSize: 2,
          maxSize: 5,
          phaseSpeed: 0.05,
          lifetime: 18000, // 18 seconds
          pathUpdateInterval: 3000 // Recalculate path every 3 seconds
        }

    this.sparks = new Map() // sparkId -> Spark object
    this.sparkCounter = 0

    this.count = config.count || 75
    this.baseSpeed = config.baseSpeed || 0.3
    this.speedVariation = config.speedVariation || 0.2
    this.minSize = config.minSize || 2
    this.maxSize = config.maxSize || 5
    this.phaseSpeed = config.phaseSpeed || 0.05
    this.lifetime = config.lifetime || 18000
    this.pathUpdateInterval = config.pathUpdateInterval || 3000

    // Color distribution
    this.colorPalette = ['#06b6d4', '#fbbf24', '#ec4899', '#8b5cf6'] // Cyan, Gold, Pink, Purple

    // Musical event sync
    this.targetHue = 0
    this.currentHue = 0
    this.colorLerpSpeed = 0.02

    // Initialize sparks
    this.initializeSparks()
  }

  /**
   * Initialize sparks distributed across network
   */
  initializeSparks() {
    // Need to wait for network to have edges
    // Sparks will be created on first update if network is ready
  }

  /**
   * Create a new spark
   * @param {string} edgeId - Edge to start on (optional, random if not specified)
   * @returns {Object} Spark object
   */
  createSpark(edgeId = null) {
    const sparkId = `spark-${this.sparkCounter++}`

    // Select random edge if not specified
    let startEdge = null
    if (edgeId) {
      startEdge = this.springMesh.edges.find(e => `${e.sourceId}-${e.targetId}` === edgeId)
    }

    if (!startEdge && this.springMesh.edges.length > 0) {
      startEdge = this.springMesh.edges[Math.floor(Math.random() * this.springMesh.edges.length)]
    }

    if (!startEdge) return null

    // Select color from palette
    const colorIndex = Math.floor(Math.random() * this.colorPalette.length)
    const baseColor = this.colorPalette[colorIndex]

    const spark = {
      id: sparkId,
      // Current position
      currentEdge: startEdge,
      progress: Math.random(), // Start at random position on edge

      // Movement
      speed: this.baseSpeed + Math.random() * this.speedVariation,

      // Appearance
      baseSize: this.minSize + Math.random() * (this.maxSize - this.minSize),
      baseColor: baseColor,
      color: baseColor,

      // Oscillation
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: this.phaseSpeed * (0.8 + Math.random() * 0.4),

      // Pathfinding
      targetCursor: null,
      path: [], // Array of edges to follow
      pathIndex: 0,
      lastPathUpdate: 0,

      // Lifecycle
      createdAt: Date.now(),
      lifetime: this.lifetime * (0.8 + Math.random() * 0.4) // Vary lifetime
    }

    // Calculate initial path
    this.updateSparkPath(spark)

    return spark
  }

  /**
   * Update spark's path toward nearest cursor using Dijkstra
   * @param {Object} spark - Spark object
   */
  updateSparkPath(spark) {
    const now = Date.now()

    // Don't update too frequently
    if (now - spark.lastPathUpdate < this.pathUpdateInterval) {
      return
    }
    spark.lastPathUpdate = now

    // Find current position (node ID)
    const currentNodeId = spark.progress < 0.5
      ? spark.currentEdge.sourceId
      : spark.currentEdge.targetId

    // Get all cursor nodes
    const cursorNodes = Array.from(this.springMesh.nodes.values())

    if (cursorNodes.length === 0) {
      spark.targetCursor = null
      spark.path = []
      return
    }

    // Find nearest cursor (by network distance, not Euclidean)
    const nearestCursor = this.findNearestCursor(currentNodeId, cursorNodes)
    if (!nearestCursor) {
      spark.targetCursor = null
      spark.path = []
      return
    }

    spark.targetCursor = nearestCursor.userId

    // Calculate path using Dijkstra
    spark.path = this.findPath(currentNodeId, spark.targetCursor)

    // If we're on an edge, add it to the start of the path if needed
    if (spark.progress > 0.1 && spark.progress < 0.9) {
      // Complete current edge first
    }
  }

  /**
   * Find nearest cursor using Dijkstra distances
   * @param {string} startNodeId - Starting node ID
   * @param {Array} cursorNodes - Array of cursor nodes
   * @returns {Object|null} Nearest cursor node or null
   */
  findNearestCursor(startNodeId, cursorNodes) {
    // For simplicity, use Euclidean distance to cursors
    // This is faster than full Dijkstra for all cursors
    const startNode = this.springMesh.getNodeOrIntermediate(startNodeId)
    if (!startNode) return null

    let nearestCursor = null
    let nearestDist = Infinity

    for (const cursor of cursorNodes) {
      const dx = cursor.x - startNode.x
      const dy = cursor.y - startNode.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < nearestDist) {
        nearestDist = dist
        nearestCursor = cursor
      }
    }

    return nearestCursor
  }

  /**
   * Find path from start to target using Dijkstra's algorithm
   * @param {string} startNodeId - Starting node ID
   * @param {string} targetUserId - Target cursor user ID
   * @returns {Array} Array of edges forming the path
   */
  findPath(startNodeId, targetUserId) {
    // Build adjacency list
    const adj = new Map()
    for (const edge of this.springMesh.edges) {
      if (!adj.has(edge.sourceId)) adj.set(edge.sourceId, [])
      if (!adj.has(edge.targetId)) adj.set(edge.targetId, [])
      adj.get(edge.sourceId).push({ node: edge.targetId, edge })
      adj.get(edge.targetId).push({ node: edge.sourceId, edge })
    }

    // Dijkstra
    const dist = new Map()
    const prev = new Map()
    const visited = new Set()

    // Initialize distances
    for (const nodeId of adj.keys()) {
      dist.set(nodeId, Infinity)
    }
    dist.set(startNodeId, 0)

    // Priority queue (simple array for now)
    const pq = [{ node: startNodeId, dist: 0 }]

    while (pq.length > 0) {
      // Find minimum
      pq.sort((a, b) => a.dist - b.dist)
      const { node: current } = pq.shift()

      if (current === targetUserId) break
      if (visited.has(current)) continue
      visited.add(current)

      // Check neighbors
      const neighbors = adj.get(current) || []
      for (const { node: next, edge } of neighbors) {
        if (visited.has(next)) continue

        // Calculate edge weight (Euclidean distance)
        const nodeA = this.springMesh.getNodeOrIntermediate(edge.sourceId)
        const nodeB = this.springMesh.getNodeOrIntermediate(edge.targetId)
        const weight = nodeA && nodeB ? Math.sqrt(
          Math.pow(nodeA.x - nodeB.x, 2) + Math.pow(nodeA.y - nodeB.y, 2)
        ) : 1

        const newDist = dist.get(current) + weight
        if (newDist < dist.get(next)) {
          dist.set(next, newDist)
          prev.set(next, { node: current, edge })
          pq.push({ node: next, dist: newDist })
        }
      }
    }

    // Reconstruct path
    const path = []
    let current = targetUserId
    while (prev.has(current)) {
      const { edge } = prev.get(current)
      // Add edge in correct direction
      if (edge.sourceId === prev.get(current).node) {
        path.unshift(edge)
      } else {
        // Reverse edge
        path.unshift({
          ...edge,
          reversed: true
        })
      }
      current = prev.get(current).node
    }

    return path
  }

  /**
   * Update all sparks
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    const now = Date.now()
    const sparksToRemove = []

    // Ensure we have the right number of sparks
    while (this.sparks.size < this.count && this.springMesh.edges.length > 0) {
      const spark = this.createSpark()
      if (spark) {
        this.sparks.set(spark.id, spark)
      } else {
        break
      }
    }

    // Remove excess sparks
    while (this.sparks.size > this.count) {
      const firstKey = this.sparks.keys().next().value
      this.sparks.delete(firstKey)
    }

    // Update each spark
    for (const [sparkId, spark] of this.sparks) {
      // Update phase
      spark.phase += spark.phaseSpeed

      // Update color toward target hue
      // Convert base color to HSL, modify hue, convert back
      const hsl = this.hexToHSL(spark.baseColor)
      hsl.h = (hsl.h + this.currentHue) % 360
      spark.color = this.hslToHex(hsl.h, hsl.s, hsl.l)

      // Move along edge
      if (spark.currentEdge) {
        const direction = spark.currentEdge.reversed ? -1 : 1
        spark.progress += spark.speed * dt * direction

        // Check if completed edge
        const completed = direction > 0 ? spark.progress >= 1 : spark.progress <= 0
        if (completed) {
          // Move to next edge in path
          spark.pathIndex++
          if (spark.pathIndex < spark.path.length) {
            spark.currentEdge = spark.path[spark.pathIndex]
            spark.progress = direction > 0 ? 0 : 1
          } else {
            // Path complete, recalculate
            this.updateSparkPath(spark)
            // Start from beginning of new path
            if (spark.path.length > 0) {
              spark.currentEdge = spark.path[0]
              spark.pathIndex = 0
              spark.progress = 0
            }
          }
        }
      }

      // Check lifetime
      if (now - spark.createdAt > spark.lifetime) {
        sparksToRemove.push(sparkId)
      }
    }

    // Remove dead sparks and recreate
    for (const sparkId of sparksToRemove) {
      this.sparks.delete(sparkId)
    }
  }

  /**
   * Render all sparks
   * @param {p5} p - p5.js instance
   */
  render(p) {
    for (const spark of this.sparks.values()) {
      this.renderSpark(p, spark)
    }
  }

  /**
   * Render a single spark
   * @param {p5} p - p5.js instance
   * @param {Object} spark - Spark object
   */
  renderSpark(p, spark) {
    if (!spark.currentEdge) return

    const edge = spark.currentEdge
    const nodeA = this.springMesh.getNodeOrIntermediate(edge.sourceId)
    const nodeB = this.springMesh.getNodeOrIntermediate(edge.targetId)

    if (!nodeA || !nodeB) return

    // Calculate position on Bezier curve
    const t = edge.reversed ? 1 - spark.progress : spark.progress
    const pos = this.calculateBezierPosition(
      nodeA.x * p.width,
      nodeA.y * p.height,
      edge.controlPoint.x * p.width,
      edge.controlPoint.y * p.height,
      nodeB.x * p.width,
      nodeB.y * p.height,
      t
    )

    // Add perpendicular noise offset for organic feel
    const dx = nodeB.x - nodeA.x
    const dy = nodeB.y - nodeA.y
    const perpX = -dy
    const perpY = dx
    const perpLen = Math.sqrt(perpX * perpX + perpY * perpY)
    const noiseVal = p.noise(spark.id.length * spark.phase, spark.phase * 0.1)
    const offsetX = (perpX / perpLen) * noiseVal * 5
    const offsetY = (perpY / perpLen) * noiseVal * 5

    // Calculate size with oscillation
    const size = spark.baseSize * (1 + Math.sin(spark.phase) * 0.3)

    // Calculate alpha based on lifetime
    const age = Date.now() - spark.createdAt
    const lifePercent = 1 - (age / spark.lifetime)
    const alpha = Math.floor(180 * lifePercent * (0.7 + Math.sin(spark.phase) * 0.3))

    // Parse color
    const rgb = this.hexToRgbArray(spark.color)

    // Draw glow
    p.noStroke()
    p.fill(rgb[0], rgb[1], rgb[2], alpha * 0.3)
    p.drawingContext.shadowBlur = 10
    p.drawingContext.shadowColor = spark.color
    p.circle(pos.x + offsetX, pos.y + offsetY, size * 2)

    // Draw core
    p.fill(255, 255, 255, alpha)
    p.circle(pos.x + offsetX, pos.y + offsetY, size * 0.5)

    p.drawingContext.shadowBlur = 0
  }

  /**
   * Handle musical events - update target hue
   * @param {Object} event - Musical event {type, velocity, pitch}
   */
  onMusicalEvent(event) {
    const hueOffsets = {
      tap: 0,
      chord: 60,
      phrase: 120
    }
    if (event.type && hueOffsets[event.type] !== undefined) {
      this.targetHue = hueOffsets[event.type]
    }
  }

  /**
   * Calculate position on quadratic Bezier curve
   */
  calculateBezierPosition(x1, y1, cx, cy, x2, y2, t) {
    const mt = 1 - t
    const x = mt * mt * x1 + 2 * mt * t * cx + t * t * x2
    const y = mt * mt * y1 + 2 * mt * t * cy + t * t * y2
    return { x, y }
  }

  /**
   * Convert hex to HSL
   */
  hexToHSL(hex) {
    const rgb = this.hexToRgbArray(hex)
    let r = rgb[0] / 255
    let g = rgb[1] / 255
    let b = rgb[2] / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h, s, l = (max + min) / 2

    if (max === min) {
      h = s = 0
    } else {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
        case g: h = ((b - r) / d + 2) / 6; break
        case b: h = ((r - g) / d + 4) / 6; break
      }
    }

    return { h: h * 360, s: s * 100, l: l * 100 }
  }

  /**
   * Convert HSL to hex
   */
  hslToHex(h, s, l) {
    h /= 360
    s /= 100
    l /= 100

    let r, g, b
    if (s === 0) {
      r = g = b = l
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1/6) return p + (q - p) * 6 * t
        if (t < 1/2) return q
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
        return p
      }
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      r = hue2rgb(p, q, h + 1/3)
      g = hue2rgb(p, q, h)
      b = hue2rgb(p, q, h - 1/3)
    }

    const toHex = x => {
      const hex = Math.round(x * 255).toString(16)
      return hex.length === 1 ? '0' + hex : hex
    }

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  /**
   * Convert hex color to RGB array
   */
  hexToRgbArray(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [
      parseInt(result[1], 16),
      parseInt(result[2], 16),
      parseInt(result[3], 16)
    ] : [255, 255, 255]
  }

  /**
   * Get spark count
   */
  getCount() {
    return this.sparks.size
  }

  /**
   * Clear all sparks
   */
  clear() {
    this.sparks.clear()
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.clear()
    this.springMesh = null
  }
}

// Export for different module systems
if (typeof window !== 'undefined') {
  window.SparkSystem = SparkSystem
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SparkSystem
}
