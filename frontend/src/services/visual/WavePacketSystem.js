/**
 * WavePacketSystem
 * Manages wave pulse emission and propagation along curved network edges
 *
 * Behavior:
 * - Pulses emit from source node to all connected nodes on gestures
 * - Propagate along Bezier curve paths
 * - Fade intensity over time
 * - Remove when complete or faded
 */

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
  }

  /**
   * Emit pulse from a cursor to the grid network
   * Pulses travel through cursor-grid and grid-connection edges
   * @param {string} sourceUserId - Source user ID
   * @param {string} color - Pulse color (hex)
   */
  emitPulse(sourceUserId, color) {
    const sourceNode = this.springMesh.nodes.get(sourceUserId)
    if (!sourceNode) return

    // Update node's last pulse time
    sourceNode.lastPulseTime = Date.now()

    // Find all cursor-trace edges from this cursor
    const connectedEdges = this.springMesh.edges.filter(
      edge => edge.sourceId === sourceUserId && edge.type === 'cursor-trace'
    )

    // Don't exceed maximum pulse count
    if (this.activePulses.size >= this.maxPulses) {
      return
    }

    // Emit pulse along each cursor-grid edge
    for (const edge of connectedEdges) {
      const pulseId = `pulse-${this.pulseCounter++}`

      const pulse = {
        id: pulseId,
        edge: edge,
        progress: 0,
        speed: this.baseSpeed + Math.random() * this.speedVariation,
        intensity: this.baseIntensity,
        color: color,
        width: this.pulseWidth,
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
   * Update all active pulses
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    const now = Date.now()
    const pulsesToRemove = []

    // Cap dt to prevent huge jumps
    dt = Math.min(dt, 0.1)

    for (const [pulseId, pulse] of this.activePulses) {
      // Update progress along the edge
      pulse.progress += pulse.speed * dt

      // Calculate age-based intensity decay
      const age = (now - pulse.createdAt) / 1000 // seconds
      pulse.intensity = Math.max(0, this.baseIntensity - age * this.decayRate)

      // Mark for removal if complete or faded
      if (pulse.progress >= 1 || pulse.intensity <= 0) {
        pulsesToRemove.push(pulseId)
      }
    }

    // Remove completed/faded pulses
    for (const pulseId of pulsesToRemove) {
      this.removePulse(pulseId)
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
    const nodeA = this.springMesh.nodes.get(edge.sourceId)
    const nodeB = this.springMesh.nodes.get(edge.targetId)

    if (!nodeA || !nodeB) return

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
   * Clear all pulses
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
  console.log('✅ WavePacketSystem exported to window')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WavePacketSystem
}
