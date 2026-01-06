/**
 * WavePacketSystem
 * Manages wave pulse emission and propagation along curved network edges
 *
 * Behavior:
 * - Pulses emit from source node and ARRIVE at destination before spawning new pulses
 * - ARRIVAL-BASED CASCADE: when a pulse completes its edge, it triggers new pulses from arrival node
 * - Creates organic, convoy-like wave propagation - pulses travel along paths, not flood simultaneously
 * - Propagate along Bezier curve paths
 * - Fade intensity with each hop
 * - Remove when complete or intensity faded
 */

/**
 * WaveContext - Tracks visited nodes for a single wave to prevent cycles
 * Shared across all pulses that belong to the same wave origin
 */
class WaveContext {
  constructor(id, sourceNodeId, color) {
    this.id = id
    this.sourceNodeId = sourceNodeId
    this.color = color
    this.visitedNodes = new Set([sourceNodeId])
    this.activePulseCount = 0  // Track how many pulses are still traveling
  }
}

class WavePacketSystem {
  /**
   * @param {SpringMeshNetwork} springMesh - Reference to the mesh network
   */
  constructor(springMesh) {
    // Get configuration from VisualConstants or use defaults
    const pulseConfig = (typeof window !== 'undefined' && window.VisualConstants?.PULSE_CONFIG)
      ? window.VisualConstants.PULSE_CONFIG
      : {
          speed: 0.8,
          speedVariation: 0.4,
          intensity: 1.0,
          decayRate: 2.0,
          width: 8,
          maxPulses: 50
        }

    this.springMesh = springMesh

    // Active pulses storage
    this.activePulses = new Map() // pulseId -> Pulse object

    // Pulse ID counter
    this.pulseCounter = 0

    // Configuration
    this.baseSpeed = pulseConfig.speed
    this.speedVariation = pulseConfig.speedVariation
    this.baseIntensity = pulseConfig.intensity
    this.decayRate = pulseConfig.decayRate
    this.pulseWidth = pulseConfig.width
    this.maxPulses = pulseConfig.maxPulses

    // Wave context tracking for arrival-based cascade propagation
    this.waveContexts = new Map()  // waveId -> WaveContext
    this.waveCounter = 0

    // Cascade propagation parameters
    this.intensityDecayPerHop = 0.55  // Intensity multiplier per hop - faster decay to reduce spread
    this.minIntensityThreshold = 0.12  // Stop propagating below this intensity - higher threshold
    this.maxHops = 4  // Maximum propagation depth - reduced to prevent storms
  }

  /**
   * Emit pulse from a cursor using ARRIVAL-BASED CASCADE propagation
   * Pulses travel along edges; when they ARRIVE at a node, they spawn new pulses
   * This creates convoy-like wave propagation through the network
   * @param {string} sourceUserId - Source user ID
   * @param {string} color - Pulse color (hex)
   */
  emitPulse(sourceUserId, color) {
    const sourceNode = this.springMesh.nodes.get(sourceUserId)
    if (!sourceNode) {
      return
    }

    // Update node's last pulse time
    sourceNode.lastPulseTime = Date.now()

    // Create wave context for tracking this cascade
    const waveId = `wave-${this.waveCounter++}`
    const waveContext = new WaveContext(waveId, sourceUserId, color)
    this.waveContexts.set(waveId, waveContext)

    // Find all edges from the source cursor
    const outgoingEdges = this.springMesh.edges.filter(
      edge => edge.sourceId === sourceUserId
    )

    // Emit initial pulses ONLY on edges from the source cursor
    // These pulses will CASCADE on arrival at their destinations
    for (const edge of outgoingEdges) {
      if (this.activePulses.size >= this.maxPulses) break

      const pulse = this.createCascadePulse(edge, color, this.baseIntensity, waveContext, 0)
      if (pulse) {
        waveContext.activePulseCount++
      }
    }
  }

  /**
   * Create a pulse that will CASCADE on arrival
   * @param {Object} edge - Edge to travel along
   * @param {string} color - Pulse color
   * @param {number} intensity - Pulse intensity
   * @param {WaveContext} waveContext - Wave context for cycle prevention
   * @param {number} hopCount - Current hop depth
   * @returns {Object} Created pulse or null
   */
  createCascadePulse(edge, color, intensity, waveContext, hopCount) {
    if (this.activePulses.size >= this.maxPulses) return null
    if (intensity < this.minIntensityThreshold) return null
    if (hopCount > this.maxHops) return null

    const pulseId = `pulse-${this.pulseCounter++}`

    const pulse = {
      id: pulseId,
      edge: edge,
      progress: 0,
      speed: this.baseSpeed + Math.random() * this.speedVariation,
      intensity: intensity,
      color: color,
      width: this.pulseWidth * Math.sqrt(intensity),  // Width scales with intensity
      createdAt: Date.now(),
      // CASCADE PROPAGATION properties
      waveContext: waveContext,
      hopCount: hopCount,
      shouldCascade: true  // Flag for arrival-based propagation
    }

    // Add to edge's pulse array
    if (!edge.pulses) {
      edge.pulses = []
    }
    edge.pulses.push(pulse)

    // Track in active pulses
    this.activePulses.set(pulseId, pulse)

    // Increase energy level of nodes
    const sourceNode = this.springMesh.backgroundNodes.get(edge.sourceId)
    const targetNode = this.springMesh.backgroundNodes.get(edge.targetId)
    if (sourceNode && sourceNode.energyLevel !== undefined) {
      sourceNode.energyLevel = Math.min(1, sourceNode.energyLevel + 0.3 * intensity)
    }
    if (targetNode && targetNode.energyLevel !== undefined) {
      targetNode.energyLevel = Math.min(1, targetNode.energyLevel + 0.2 * intensity)
    }

    return pulse
  }

  /**
   * Handle pulse arrival - CASCADE to connected edges (BIDIRECTIONAL)
   * Called when a pulse completes its edge traversal
   * Looks for edges where arrival node is SOURCE or TARGET (for undirected graph traversal)
   * @param {Object} pulse - The pulse that just arrived
   */
  onPulseArrival(pulse) {
    if (!pulse.shouldCascade || !pulse.waveContext) return

    const waveContext = pulse.waveContext
    // For bidirectional pulses, use destinationNodeId; otherwise use edge.targetId
    const arrivalNodeId = pulse.destinationNodeId || pulse.edge.targetId

    // Mark arrival node as visited
    waveContext.visitedNodes.add(arrivalNodeId)

    // Calculate cascaded intensity
    const cascadeIntensity = pulse.intensity * this.intensityDecayPerHop
    if (cascadeIntensity < this.minIntensityThreshold) return

    const nextHop = pulse.hopCount + 1
    if (nextHop > this.maxHops) return

    // Find ALL connected edges (bidirectional traversal)
    // This is critical because TERTIARY edges are created only in one direction
    const connectedEdges = this.springMesh.edges.filter(
      edge => edge.sourceId === arrivalNodeId || edge.targetId === arrivalNodeId
    )

    // Spawn cascade pulses to unvisited nodes
    for (const edge of connectedEdges) {
      // Determine the "other" node - the one we'd travel TO
      const otherNodeId = edge.sourceId === arrivalNodeId ? edge.targetId : edge.sourceId

      // Skip if other node already visited (prevents cycles)
      if (waveContext.visitedNodes.has(otherNodeId)) continue
      if (this.activePulses.size >= this.maxPulses) break

      // Create pulse that travels TO the other node
      const isForward = edge.sourceId === arrivalNodeId
      const cascadePulse = this.createCascadePulseBidirectional(
        edge,
        pulse.color,
        cascadeIntensity,
        waveContext,
        nextHop,
        isForward,
        otherNodeId
      )
      if (cascadePulse) {
        waveContext.activePulseCount++
      }
    }
  }

  /**
   * Create a cascade pulse that can travel in either direction
   * @param {Object} edge - Edge to travel along
   * @param {string} color - Pulse color
   * @param {number} intensity - Pulse intensity
   * @param {WaveContext} waveContext - Wave context
   * @param {number} hopCount - Current hop depth
   * @param {boolean} isForward - True if traveling source→target, false if target→source
   * @param {string} destinationNodeId - The node we're traveling TO
   * @returns {Object} Created pulse or null
   */
  createCascadePulseBidirectional(edge, color, intensity, waveContext, hopCount, isForward, destinationNodeId) {
    if (this.activePulses.size >= this.maxPulses) return null
    if (intensity < this.minIntensityThreshold) return null
    if (hopCount > this.maxHops) return null

    const pulseId = `pulse-${this.pulseCounter++}`

    const pulse = {
      id: pulseId,
      edge: edge,
      progress: isForward ? 0 : 1,  // Start at beginning or end depending on direction
      speed: this.baseSpeed + Math.random() * this.speedVariation,
      intensity: intensity,
      color: color,
      width: this.pulseWidth * Math.sqrt(intensity),
      createdAt: Date.now(),
      // CASCADE PROPAGATION properties
      waveContext: waveContext,
      hopCount: hopCount,
      shouldCascade: true,
      // BIDIRECTIONAL properties
      isReverse: !isForward,  // True if traveling target→source
      destinationNodeId: destinationNodeId
    }

    // Add to edge's pulse array
    if (!edge.pulses) {
      edge.pulses = []
    }
    edge.pulses.push(pulse)

    // Track in active pulses
    this.activePulses.set(pulseId, pulse)

    // Increase energy level of nodes
    const sourceNode = this.springMesh.backgroundNodes.get(edge.sourceId)
    const targetNode = this.springMesh.backgroundNodes.get(edge.targetId)
    if (sourceNode && sourceNode.energyLevel !== undefined) {
      sourceNode.energyLevel = Math.min(1, sourceNode.energyLevel + 0.3 * intensity)
    }
    if (targetNode && targetNode.energyLevel !== undefined) {
      targetNode.energyLevel = Math.min(1, targetNode.energyLevel + 0.2 * intensity)
    }

    return pulse
  }

  /**
   * Emit pulse along a specific edge
   * @param {Object} edge - Edge object
   * @param {string} color - Pulse color (hex)
   * @param {number} startProgress - Starting progress (0-1)
   */
  emitPulseOnEdge(edge, color, startProgress = 0) {
    // Check pulse count limit
    if (this.activePulses.size >= this.maxPulses) {
      return null
    }

    const pulseId = `pulse-${this.pulseCounter++}`

    const pulse = {
      id: pulseId,
      edge: edge,
      progress: startProgress,
      speed: this.baseSpeed + Math.random() * this.speedVariation,
      intensity: this.baseIntensity,
      color: color,
      width: this.pulseWidth,
      reverse: startProgress === 1,  // Flag for backward travel
      createdAt: Date.now()
    }

    // Add to edge's pulse array
    if (!edge.pulses) {
      edge.pulses = []
    }
    edge.pulses.push(pulse)

    // Track in active pulses
    this.activePulses.set(pulseId, pulse)

    return pulse
  }

  /**
   * Emit pulse along a specific edge with custom intensity
   * @param {Object} edge - Edge object
   * @param {string} color - Pulse color (hex)
   * @param {number} startProgress - Starting progress (0-1)
   * @param {number} intensity - Pulse intensity (default baseIntensity)
   */
  emitPulseOnEdgeWithIntensity(edge, color, startProgress = 0, intensity = null) {
    // Check pulse count limit
    if (this.activePulses.size >= this.maxPulses) {
      return null
    }

    const pulseId = `pulse-${this.pulseCounter++}`

    const pulse = {
      id: pulseId,
      edge: edge,
      progress: startProgress,
      speed: this.baseSpeed + Math.random() * this.speedVariation,
      intensity: intensity !== null ? intensity : this.baseIntensity,
      color: color,
      width: this.pulseWidth,
      reverse: startProgress === 1,
      createdAt: Date.now()
    }

    // Add to edge's pulse array
    if (!edge.pulses) {
      edge.pulses = []
    }
    edge.pulses.push(pulse)

    // Track in active pulses
    this.activePulses.set(pulseId, pulse)

    // Increase energy level of background nodes
    const sourceNode = this.springMesh.backgroundNodes.get(edge.sourceId)
    const targetNode = this.springMesh.backgroundNodes.get(edge.targetId)
    if (sourceNode && sourceNode.energyLevel !== undefined) {
      sourceNode.energyLevel = Math.min(1, sourceNode.energyLevel + 0.3)
    }
    if (targetNode && targetNode.energyLevel !== undefined) {
      targetNode.energyLevel = Math.min(1, targetNode.energyLevel + 0.3)
    }

    return pulse
  }

  /**
   * Update all active pulses - ARRIVAL-BASED CASCADE (BIDIRECTIONAL)
   * When pulses complete their edge, they trigger cascade propagation
   * Handles both forward (progress 0→1) and reverse (progress 1→0) pulses
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    const now = Date.now()
    const pulsesToRemove = []
    const arrivingPulses = []

    // Cap dt to prevent huge jumps
    dt = Math.min(dt, 0.1)

    // Update existing pulses
    for (const [pulseId, pulse] of this.activePulses) {
      // Update progress along the edge (direction depends on isReverse)
      if (pulse.isReverse) {
        pulse.progress -= pulse.speed * dt  // Travel backwards along edge
      } else {
        pulse.progress += pulse.speed * dt  // Travel forwards along edge
      }

      // Gentle intensity fade over time (but cascade determines main decay)
      const age = (now - pulse.createdAt) / 1000
      const ageFade = Math.max(0, 1 - age * 0.3)  // Gentle fade over ~3 seconds
      const displayIntensity = pulse.intensity * ageFade

      // Check if pulse ARRIVED at destination (completed edge traversal)
      // For reverse pulses, arrival is at progress <= 0
      // For forward pulses, arrival is at progress >= 1
      const hasArrived = pulse.isReverse ? (pulse.progress <= 0) : (pulse.progress >= 1)

      if (hasArrived) {
        // Pulse has ARRIVED - queue for cascade propagation
        arrivingPulses.push(pulse)
        pulsesToRemove.push(pulseId)
      } else if (displayIntensity <= 0.01) {
        pulsesToRemove.push(pulseId)
      }
    }

    // CRITICAL: Handle arrivals BEFORE removing pulses
    // This triggers the cascade propagation
    for (const pulse of arrivingPulses) {
      this.onPulseArrival(pulse)

      // Decrement active pulse count in wave context
      if (pulse.waveContext) {
        pulse.waveContext.activePulseCount--
      }
    }

    // Remove completed pulses
    for (const pulseId of pulsesToRemove) {
      this.removePulse(pulseId)
    }

    // Clean up wave contexts with no active pulses
    for (const [waveId, context] of this.waveContexts) {
      if (context.activePulseCount <= 0) {
        this.waveContexts.delete(waveId)
      }
    }
  }

  /**
   * Propagate pulse to connected edges from the target node
   * @param {Object} sourceEdge - Edge that pulse just completed
   * @param {number} intensity - Propagated intensity (reduced)
   * @param {string} color - Pulse color
   */
  propagatePulse(sourceEdge, intensity, color) {
    const targetNodeId = sourceEdge.targetId

    // Find all edges from the target node (cascade to connected edges)
    const connectedEdges = this.springMesh.edges.filter(
      edge => edge.sourceId === targetNodeId
    )

    // Don't exceed maximum pulse count
    if (this.activePulses.size >= this.maxPulses) {
      return
    }

    // Emit pulse on each connected edge with reduced intensity
    for (const edge of connectedEdges) {
      const pulseId = `pulse-${this.pulseCounter++}`

      const pulse = {
        id: pulseId,
        edge: edge,
        progress: 0,
        speed: this.baseSpeed + Math.random() * this.speedVariation,
        intensity: intensity,  // Use reduced intensity from propagation
        color: color,
        width: this.pulseWidth * intensity,  // Scale width by intensity
        createdAt: Date.now()
      }

      // Add to edge's pulse array
      if (!edge.pulses) {
        edge.pulses = []
      }
      edge.pulses.push(pulse)

      // Track in active pulses
      this.activePulses.set(pulseId, pulse)
    }
  }

  /**
   * Remove a pulse from tracking
   * @param {string} pulseId - Pulse identifier
   */
  removePulse(pulseId) {
    const pulse = this.activePulses.get(pulseId)
    if (pulse) {
      // Remove from edge's pulse array
      const edge = pulse.edge
      if (edge && edge.pulses) {
        const edgeIndex = edge.pulses.indexOf(pulse)
        if (edgeIndex > -1) {
          edge.pulses.splice(edgeIndex, 1)
        }
      }

      // Remove from active pulses map
      this.activePulses.delete(pulseId)
    }
  }

  /**
   * Render all active pulses
   * @param {p5} p - p5.js instance
   */
  render(p) {
    // DEBUG: Log pulse count occasionally
    if (p.frameCount % 60 === 0 && this.activePulses.size > 0) {
      // console.log('🌊 Rendering', this.activePulses.size, 'pulses')
    }

    for (const pulse of this.activePulses.values()) {
      this.renderPulse(p, pulse)
    }
  }

  /**
   * Render a single pulse as a glowing packet
   * @param {p5} p - p5.js instance
   * @param {Object} pulse - Pulse object
   */
  renderPulse(p, pulse) {
    const edge = pulse.edge
    const nodeA = this.springMesh.getNodeOrIntermediate(edge.sourceId)
    const nodeB = this.springMesh.getNodeOrIntermediate(edge.targetId)

    if (!nodeA || !nodeB) {
      // console.warn('⚠️ Pulse render: Missing nodes for edge', edge.sourceId.substring(0, 8), '->', edge.targetId.substring(0, 8))
      return
    }

    // Calculate position on Bezier curve
    const pos = this.calculateBezierPosition(
      nodeA.x * p.width,
      nodeA.y * p.height,
      edge.controlPoint.x * p.width,
      edge.controlPoint.y * p.height,
      nodeB.x * p.width,
      nodeB.y * p.height,
      pulse.progress
    )

    // Calculate visual properties
    const alpha = Math.floor(pulse.intensity * 255)
    const size = pulse.width * pulse.intensity

    // DEBUG: Log first few renders
    if (this.activePulses.size <= 3 && p.frameCount % 10 === 0) {
      // console.log('🌊 Rendering pulse:', {
//        pos: `(${Math.round(pos.x)}, ${Math.round(pos.y)})`,
//        progress: pulse.progress.toFixed(2),
//        intensity: pulse.intensity.toFixed(2),
//        size: size.toFixed(1),
//        alpha: alpha,
//        color: pulse.color
////      })
    }

    // Draw outer glow
    p.noStroke()
    const glowAlpha = Math.floor(alpha * 0.3)

    // Parse color and add alpha
    const rgb = this.hexToRgbArray(pulse.color)
    p.fill(rgb[0], rgb[1], rgb[2], glowAlpha)

    // Add glow effect using shadow blur
    p.drawingContext.shadowBlur = 30 * pulse.intensity
    p.drawingContext.shadowColor = pulse.color
    p.circle(pos.x, pos.y, size * 2)

    // Draw inner bright core
    p.fill(255, 255, 255, alpha)
    p.circle(pos.x, pos.y, size * 0.5)

    // Reset shadow
    p.drawingContext.shadowBlur = 0
  }

  /**
   * Calculate position on quadratic Bezier curve
   * @param {number} x1 - Start point X
   * @param {number} y1 - Start point Y
   * @param {number} cx - Control point X
   * @param {number} cy - Control point Y
   * @param {number} x2 - End point X
   * @param {number} y2 - End point Y
   * @param {number} t - Parameter (0-1)
   * @returns {Object} {x, y} position on curve
   */
  calculateBezierPosition(x1, y1, cx, cy, x2, y2, t) {
    const mt = 1 - t
    const x = mt * mt * x1 + 2 * mt * t * cx + t * t * x2
    const y = mt * mt * y1 + 2 * mt * t * cy + t * t * y2
    return { x, y }
  }

  /**
   * Clear all pulses and wave contexts
   */
  clear() {
    // Clear all edge pulse arrays
    for (const pulse of this.activePulses.values()) {
      const edge = pulse.edge
      if (edge && edge.pulses) {
        const edgeIndex = edge.pulses.indexOf(pulse)
        if (edgeIndex > -1) {
          edge.pulses.splice(edgeIndex, 1)
        }
      }
    }

    // Clear active pulses map
    this.activePulses.clear()

    // Clear wave contexts
    this.waveContexts.clear()
  }

  /**
   * Get pulse count
   * @returns {number} Number of active pulses
   */
  getPulseCount() {
    return this.activePulses.size
  }

  /**
   * Helper: Convert hex color to RGB array
   * @param {string} hex - Hex color string
   * @returns {Array} [r, g, b] values
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
   * Dispose of resources
   */
  dispose() {
    this.clear()
    this.springMesh = null
  }
}

// Export for different module systems
if (typeof window !== 'undefined') {
  window.WavePacketSystem = WavePacketSystem
  // console.log('✅ WavePacketSystem exported to window')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WavePacketSystem
}
