/**
 * SpringMeshNetwork
 * Manages spring-mesh physics and curved Bezier connections between user cursors
 *
 * Physics Model:
 * - Hooke's Law for springs: F = -k * (currentLength - restLength)
 * - Node-node repulsion for spacing
 * - Semi-implicit Euler integration
 * - Velocity damping for stability
 *
 * Network Topology:
 * - Dynamic proximity-based connections (TopologyGenerator)
 * - Radial nodes (mandala pattern)
 * - Circuit nodes (decorative along edges)
 *
 * Visual Style:
 * - Quadratic Bezier curves for organic web appearance
 * - Control points offset perpendicular to edge direction
 * - Gradient colors along curves
 */

class SpringMeshNetwork {
  constructor() {
    // Get configuration from VisualConstants or use defaults
    const springConfig = (typeof window !== 'undefined' && window.VisualConstants?.SPRING_CONFIG)
      ? window.VisualConstants.SPRING_CONFIG
      : {
          stiffness: 0.05,
          restLength: 0.3,
          damping: 0.92,
          repulsionStrength: 0.02,
          maxVelocity: 2.0,
          repulsionRange: 0.25,
          margin: 0.05
        }

    const edgeConfig = (typeof window !== 'undefined' && window.VisualConstants?.EDGE_CONFIG)
      ? window.VisualConstants.EDGE_CONFIG
      : {
          idleThickness: 1,
          activeThickness: 3,
          segments: 20,
          controlPointOffset: 0.05,
          minAlpha: 100,
          maxAlpha: 150
        }

    const nodeConfig = (typeof window !== 'undefined' && window.VisualConstants?.NODE_CONFIG)
      ? window.VisualConstants.NODE_CONFIG
      : {
          idleSize: 10,
          tapSize: 15,
          dragSize: 20,
          holdPulseMin: 20,
          holdPulseMax: 30,
          holdPulseSpeed: 0.005,
          glowBlur: 20
        }

    // Node storage: userId -> Node object
    this.nodes = new Map()

    // Edge storage: Array of Edge objects
    this.edges = []

    // Topology generation
    this.topologyGenerator = new TopologyGenerator()
    this.intermediateNodes = new Map()  // Non-cursor nodes (radial, circuit)
    this.edgeCircuitNodes = new Map()    // edgeId -> [circuitNodeIds]

    // Physics state
    this.physicsEnabled = true
    this.lastUpdateTime = 0

    // Configuration
    this.springStiffness = springConfig.stiffness
    this.springRestLength = springConfig.restLength
    this.damping = springConfig.damping
    this.repulsionStrength = springConfig.repulsionStrength
    this.maxVelocity = springConfig.maxVelocity
    this.repulsionRange = springConfig.repulsionRange
    this.margin = springConfig.margin

    // Visual configuration
    this.controlPointOffset = edgeConfig.controlPointOffset
    this.curveSegments = edgeConfig.segments

    // Store configs for use in methods
    this.EDGE_CONFIG = edgeConfig
    this.NODE_CONFIG = nodeConfig
  }

  /**
   * Update physics simulation
   * @param {number} dt - Delta time in seconds
   */
  updatePhysics(dt) {
    if (!this.physicsEnabled) return

    // Cap dt to prevent instability on lag spikes
    dt = Math.min(dt, 0.1)

    // Apply spring forces (only for cursor-cursor edges)
    for (const edge of this.edges) {
      if (edge.type === 'cursor-cursor') {
        this.applySpringForce(edge)
      }
      // Radial and circuit nodes are static decoration, no physics
    }

    // Apply repulsion between all node pairs
    this.applyRepulsionForces()

    // Update node velocities and positions
    for (const node of this.nodes.values()) {
      this.updateNodePosition(node, dt)
    }

    // Constrain nodes to canvas bounds
    this.constrainToBounds()
  }

  /**
   * Apply spring force between connected nodes (Hooke's Law)
   * @param {Object} edge - Edge object with sourceId and targetId
   */
  applySpringForce(edge) {
    const nodeA = this.nodes.get(edge.sourceId)
    const nodeB = this.nodes.get(edge.targetId)

    if (!nodeA || !nodeB) return

    const dx = nodeB.x - nodeA.x
    const dy = nodeB.y - nodeA.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    // Prevent division by zero
    if (distance < 0.001) return

    // Hooke's Law: F = -k * (currentLength - restLength)
    const displacement = distance - this.springRestLength
    const force = this.springStiffness * displacement

    const fx = (dx / distance) * force
    const fy = (dy / distance) * force

    // Apply equal and opposite forces (F = ma, assuming mass = 1)
    nodeA.vx += fx / nodeA.mass
    nodeA.vy += fy / nodeA.mass
    nodeB.vx -= fx / nodeB.mass
    nodeB.vy -= fy / nodeB.mass
  }

  /**
   * Apply repulsion forces between nearby nodes
   */
  applyRepulsionForces() {
    const nodeArray = Array.from(this.nodes.values())

    for (let i = 0; i < nodeArray.length; i++) {
      for (let j = i + 1; j < nodeArray.length; j++) {
        const nodeA = nodeArray[i]
        const nodeB = nodeArray[j]

        const dx = nodeB.x - nodeA.x
        const dy = nodeB.y - nodeA.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        // Only apply repulsion if nodes are close
        if (distance < this.repulsionRange && distance > 0.001) {
          const force = this.repulsionStrength * (1 - distance / this.repulsionRange)
          const fx = -(dx / distance) * force
          const fy = -(dy / distance) * force

          nodeA.vx += fx / nodeA.mass
          nodeA.vy += fy / nodeA.mass
          nodeB.vx -= fx / nodeB.mass
          nodeB.vy -= fy / nodeB.mass
        }
      }
    }
  }

  /**
   * Update node position using semi-implicit Euler integration
   * @param {Object} node - Node object
   * @param {number} dt - Delta time
   */
  updateNodePosition(node, dt) {
    // Apply damping
    node.vx *= this.damping
    node.vy *= this.damping

    // Clamp velocity
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
    if (speed > this.maxVelocity) {
      node.vx = (node.vx / speed) * this.maxVelocity
      node.vy = (node.vy / speed) * this.maxVelocity
    }

    // Update position
    node.x += node.vx * dt
    node.y += node.vy * dt
  }

  /**
   * Keep nodes within canvas bounds (0-1 normalized)
   */
  constrainToBounds() {
    for (const node of this.nodes.values()) {
      // Left bound
      if (node.x < this.margin) {
        node.x = this.margin
        node.vx *= -0.5 // Bounce with energy loss
      }
      // Right bound
      if (node.x > 1 - this.margin) {
        node.x = 1 - this.margin
        node.vx *= -0.5
      }
      // Top bound
      if (node.y < this.margin) {
        node.y = this.margin
        node.vy *= -0.5
      }
      // Bottom bound
      if (node.y > 1 - this.margin) {
        node.y = 1 - this.margin
        node.vy *= -0.5
      }
    }
  }

  /**
   * Add or update a node
   * @param {string} userId - User identifier
   * @param {number} x - Normalized X position (0-1)
   * @param {number} y - Normalized Y position (0-1)
   * @param {string} color - Hex color string
   * @param {Object} gestureData - Gesture state info
   */
  updateNode(userId, x, y, color, gestureData) {
    const existing = this.nodes.get(userId)

    if (existing) {
      // Smoothly interpolate towards target position
      // This creates the "spring" feel when user moves cursor
      const lerpFactor = 0.3
      existing.targetX = x
      existing.targetY = y
      existing.x = existing.x * (1 - lerpFactor) + x * lerpFactor
      existing.y = existing.y * (1 - lerpFactor) + y * lerpFactor
      existing.color = color
      existing.gestureType = gestureData.type || 'idle'
      existing.isActive = gestureData.isActive || false
    } else {
      // Create new node
      this.nodes.set(userId, {
        userId,
        x,
        y,
        targetX: x,
        targetY: y,
        vx: 0,
        vy: 0,
        mass: 1.0,
        color,
        gestureType: gestureData.type || 'idle',
        isActive: gestureData.isActive || false,
        connections: new Set(),
        lastPulseTime: 0
      })

      // Rebuild edges when node count changes
      this.rebuildEdges()
    }
  }

  /**
   * Rebuild edge list based on current nodes using topology generation
   * Generates multiple paths between cursors with radial and circuit nodes
   */
  rebuildEdges() {
    // Store existing pulses and particles for migration (include pathIndex)
    const edgeData = new Map()
    for (const edge of this.edges) {
      const key = `${edge.sourceId}-${edge.targetId}-${edge.pathIndex || 0}`
      edgeData.set(key, {
        pulses: edge.pulses || [],
        particles: edge.particles || []
      })
    }

    // Generate new topology using TopologyGenerator
    const topology = this.topologyGenerator.generateTopology(this.nodes)

    // Update intermediate nodes
    this.intermediateNodes.clear()
    for (const node of topology.intermediateNodes) {
      this.intermediateNodes.set(node.id, node)
    }

    // Update edge circuit node mapping
    this.edgeCircuitNodes = topology.edgeCircuitNodes

    // Build edge array with proper Bezier control points
    this.edges = []
    for (const edgeDef of topology.edges) {
      const nodeA = this.getNodeOrIntermediate(edgeDef.sourceId)
      const nodeB = this.getNodeOrIntermediate(edgeDef.targetId)

      if (!nodeA || !nodeB) continue

      // Calculate Bezier control point - use edge-specific offset for multiple paths
      const dx = nodeB.x - nodeA.x
      const dy = nodeB.y - nodeA.y
      const midX = (nodeA.x + nodeB.x) / 2
      const midY = (nodeA.y + nodeB.y) / 2

      // Use edge-specific offset if provided, otherwise use default
      const offset = edgeDef.controlPointOffset !== undefined
        ? edgeDef.controlPointOffset
        : this.controlPointOffset

      const controlPoint = {
        x: midX - dy * offset,
        y: midY + dx * offset
      }

      // Restore existing data if available
      const key = `${edgeDef.sourceId}-${edgeDef.targetId}-${edgeDef.pathIndex || 0}`
      const existingData = edgeData.get(key)

      this.edges.push({
        sourceId: edgeDef.sourceId,
        targetId: edgeDef.targetId,
        type: edgeDef.type,
        pathIndex: edgeDef.pathIndex || 0,
        strength: edgeDef.strength,
        controlPoint,
        restLength: this.springRestLength * edgeDef.strength,
        stiffness: this.springStiffness * edgeDef.strength,
        pulses: existingData?.pulses || [],
        particles: existingData?.particles || []
      })
    }
  }

  /**
   * Remove a node and rebuild edges
   * @param {string} userId - User identifier to remove
   */
  removeNode(userId) {
    this.nodes.delete(userId)
    this.rebuildEdges()
  }

  /**
   * Get node from cursor nodes or intermediate nodes
   * @param {string} id - Node identifier
   * @returns {Object|null} Node object or null
   */
  getNodeOrIntermediate(id) {
    if (this.nodes.has(id)) return this.nodes.get(id)
    if (this.intermediateNodes.has(id)) return this.intermediateNodes.get(id)
    return null
  }

  /**
   * Get all edges connected to a user
   * @param {string} userId - User identifier
   * @returns {Array} Array of connected edges
   */
  getConnectedEdges(userId) {
    return this.edges.filter(
      edge => edge.sourceId === userId || edge.targetId === userId
    )
  }

  /**
   * Render the network with curved Bezier edges
   * @param {p5} p - p5.js instance
   */
  render(p) {
    // Draw edges first (behind nodes)
    for (const edge of this.edges) {
      this.renderEdge(p, edge)
    }

    // Draw intermediate nodes (circuit and radial)
    for (const node of this.intermediateNodes.values()) {
      this.renderIntermediateNode(p, node)
    }

    // Draw cursor nodes on top
    for (const node of this.nodes.values()) {
      this.renderNode(p, node)
    }
  }

  /**
   * Render curved edge using quadratic Bezier with gradient
   * @param {p5} p - p5.js instance
   * @param {Object} edge - Edge object
   */
  renderEdge(p, edge) {
    const nodeA = this.nodes.get(edge.sourceId)
    const nodeB = this.nodes.get(edge.targetId)

    if (!nodeA || !nodeB) return

    // Convert normalized coordinates to canvas pixels
    const x1 = nodeA.x * p.width
    const y1 = nodeA.y * p.height
    const cx = edge.controlPoint.x * p.width
    const cy = edge.controlPoint.y * p.height
    const x2 = nodeB.x * p.width
    const y2 = nodeB.y * p.height

    // Determine thickness based on activity
    const thickness = (nodeA.isActive || nodeB.isActive)
      ? this.EDGE_CONFIG.activeThickness
      : this.EDGE_CONFIG.idleThickness

    p.strokeWeight(thickness)
    p.noFill()

    // Always render gradient curve (wave pulses provide active visual effects)
    this.drawGradientCurve(p, x1, y1, cx, cy, x2, y2, nodeA.color, nodeB.color)
  }

  /**
   * Draw gradient curve using segmented approach
   * @param {p5} p - p5.js instance
   */
  drawGradientCurve(p, x1, y1, cx, cy, x2, y2, color1, color2) {
    const segments = this.curveSegments
    const rgb1 = this.hexToRgbArray(color1)
    const rgb2 = this.hexToRgbArray(color2)

    for (let i = 0; i < segments; i++) {
      const t1 = i / segments
      const t2 = (i + 1) / segments

      // Calculate curve points
      const px1 = Math.pow(1 - t1, 2) * x1 + 2 * (1 - t1) * t1 * cx + Math.pow(t1, 2) * x2
      const py1 = Math.pow(1 - t1, 2) * y1 + 2 * (1 - t1) * t1 * cy + Math.pow(t1, 2) * y2
      const px2 = Math.pow(1 - t2, 2) * x1 + 2 * (1 - t2) * t2 * cx + Math.pow(t2, 2) * x2
      const py2 = Math.pow(1 - t2, 2) * y1 + 2 * (1 - t2) * t2 * cy + Math.pow(t2, 2) * y2

      // Interpolate color
      const r = Math.round(lerp(rgb1[0], rgb2[0], t1))
      const g = Math.round(lerp(rgb1[1], rgb2[1], t1))
      const b = Math.round(lerp(rgb1[2], rgb2[2], t1))
      const alpha = Math.round(lerp(this.EDGE_CONFIG.minAlpha, this.EDGE_CONFIG.maxAlpha, t1))

      p.stroke(r, g, b, alpha)
      p.line(px1, py1, px2, py2)
    }
  }

  /**
   * Render node with dynamic sizing and glow effects
   * @param {p5} p - p5.js instance
   * @param {Object} node - Node object
   */
  renderNode(p, node) {
    const x = node.x * p.width
    const y = node.y * p.height

    // Calculate size based on gesture type
    let size = this.NODE_CONFIG.idleSize

    if (node.gestureType === 'tap') {
      size = this.NODE_CONFIG.tapSize
    } else if (node.gestureType === 'drag') {
      size = this.NODE_CONFIG.dragSize
    } else if (node.gestureType === 'hold') {
      // Pulsing animation for holds (sine wave)
      const pulse = Math.sin(p.millis() * this.NODE_CONFIG.holdPulseSpeed) * 5
      size = (this.NODE_CONFIG.holdPulseMin + this.NODE_CONFIG.holdPulseMax) / 2 + pulse
    }

    // Draw glow for active nodes
    if (node.isActive) {
      p.fill(node.color)
      p.drawingContext.shadowBlur = this.NODE_CONFIG.glowBlur
      p.drawingContext.shadowColor = node.color
    } else {
      p.fill(node.color)
      p.drawingContext.shadowBlur = 0
    }

    // Draw main node circle
    p.noStroke()
    p.circle(x, y, size)

    // Reset shadow
    p.drawingContext.shadowBlur = 0
  }

  /**
   * Render intermediate node (radial or circuit)
   * @param {p5} p - p5.js instance
   * @param {Object} node - Node object
   */
  renderIntermediateNode(p, node) {
    const x = node.x * p.width
    const y = node.y * p.height

    // Different styles for different intermediate node types
    if (node.type === 'radial') {
      // Radial nodes: small diamond shapes, rotated by angle
      p.push()
      p.translate(x, y)
      p.rotate(node.angle || 0)
      p.noStroke()
      p.fill(node.color)

      // Draw small diamond
      p.beginShape()
      const size = this.topologyGenerator.radialNodeSize || 4
      p.vertex(size, 0)
      p.vertex(0, size)
      p.vertex(-size, 0)
      p.vertex(0, -size)
      p.endShape(p.CLOSE)

      p.pop()
    } else if (node.type === 'circuit') {
      // Circuit nodes: small circles with pad effect
      p.noStroke()
      p.fill(node.color)
      p.circle(x, y, this.topologyGenerator.circuitNodeSize || 3)

      // Small pad ring
      p.stroke(node.color)
      p.strokeWeight(0.5)
      p.noFill()
      p.circle(x, y, (this.topologyGenerator.circuitNodeSize || 3) * 2)
    }
  }

  /**
   * Helper: Linear interpolation
   */
  lerp(a, b, t) {
    return a + (b - a) * t
  }

  /**
   * Helper: Convert hex to RGB array
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
   * Get node count
   * @returns {number} Number of nodes
   */
  getNodeCount() {
    return this.nodes.size
  }

  /**
   * Get edge count
   * @returns {number} Number of edges
   */
  getEdgeCount() {
    return this.edges.length
  }

  /**
   * Clear all nodes and edges
   */
  clear() {
    this.nodes.clear()
    this.edges = []
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.clear()
  }
}

// Export for different module systems
if (typeof window !== 'undefined') {
  window.SpringMeshNetwork = SpringMeshNetwork
  console.log('✅ SpringMeshNetwork exported to window')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpringMeshNetwork
}
