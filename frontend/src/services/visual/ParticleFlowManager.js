/**
 * ParticleFlowManager
 * Manages particle emission and flow along curved network edges
 *
 * Behavior:
 * - Particles emit from source node on drag gestures
 * - Flow along Bezier curve paths
 * - Life decay over time
 * - Max particle count for performance
 */

class ParticleFlowManager {
  /**
   * @param {SpringMeshNetwork} springMesh - Reference to the mesh network
   */
  constructor(springMesh) {
    // Get configuration from VisualConstants or use defaults
    const particleConfig = (typeof window !== 'undefined' && window.VisualConstants?.PARTICLE_CONFIG)
      ? window.VisualConstants.PARTICLE_CONFIG
      : {
          speed: 0.3,
          speedVariation: 0.5,
          minSize: 2,
          maxSize: 5,
          lifeDecay: 0.3,
          emitCount: 5,
          maxParticles: 200,
          cleanupInterval: 5000,
          maxAge: 10000
        }

    this.springMesh = springMesh

    // Active particles storage
    this.particles = new Map() // particleId -> Particle object

    // Particle ID counter
    this.particleCounter = 0

    // Configuration
    this.baseSpeed = particleConfig.speed
    this.speedVariation = particleConfig.speedVariation
    this.minSize = particleConfig.minSize
    this.maxSize = particleConfig.maxSize
    this.lifeDecay = particleConfig.lifeDecay
    this.emitCount = particleConfig.emitCount
    this.maxParticles = particleConfig.maxParticles
    this.maxAge = particleConfig.maxAge

    // Auto-cleanup interval
    this.cleanupIntervalMs = particleConfig.cleanupInterval
    this.setupAutoCleanup()
  }

  /**
   * Setup periodic cleanup of old particles
   */
  setupAutoCleanup() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      const particlesToRemove = []

      for (const [particleId, particle] of this.particles) {
        if (now - particle.createdAt > this.maxAge) {
          particlesToRemove.push(particleId)
        }
      }

      for (const particleId of particlesToRemove) {
        this.removeParticle(particleId)
      }
    }, this.cleanupIntervalMs)
  }

  /**
   * Emit particles from a cursor through the entire network using BFS flood
   * Particles travel through ALL edge types with life decay based on hop distance
   * @param {string} sourceUserId - Source user ID
   * @param {number} count - Number of particles to emit per edge
   */
  emitParticles(sourceUserId, count = this.emitCount) {
    // Check particle count limit
    if (this.particles.size >= this.maxParticles) {
      return
    }

    const sourceNode = this.springMesh.nodes.get(sourceUserId)
    if (!sourceNode) {
      return
    }

    // BFS flood propagation parameters
    const maxDepth = 8  // Max hops for particles
    const decayFactor = 0.8  // Life decay per hop

    // Use BFS to flood the network with particles
    this.floodPropagate(sourceUserId, sourceNode.color, count, maxDepth, decayFactor)
  }

  /**
   * BFS flood propagation through the network for particles
   * @param {string} sourceNodeId - Starting node ID
   * @param {string} color - Particle color
   * @param {number} countPerEdge - Particles per edge
   * @param {number} maxDepth - Maximum hop depth
   * @param {number} decayFactor - Life decay per hop
   */
  floodPropagate(sourceNodeId, color, countPerEdge, maxDepth, decayFactor) {
    // BFS queue: { nodeId, depth, life }
    const queue = [{ nodeId: sourceNodeId, depth: 0, life: 1.0 }]
    const visited = new Set()
    const edgesToEmit = []

    while (queue.length > 0 && edgesToEmit.length < 50) {  // Limit edges for performance
      const { nodeId, depth, life } = queue.shift()

      if (depth > maxDepth || life < 0.2) continue
      if (visited.has(nodeId)) continue
      visited.add(nodeId)

      // Find all edges from this node
      const outgoingEdges = this.springMesh.edges.filter(
        edge => edge.sourceId === nodeId
      )

      for (const edge of outgoingEdges) {
        // Create particles on this edge
        const edgeLife = life * decayFactor
        edgesToEmit.push({
          edge,
          startProgress: 0,
          life: edgeLife,
          depth: depth + 1
        })

        // Add target node to queue for further propagation
        queue.push({
          nodeId: edge.targetId,
          depth: depth + 1,
          life: edgeLife
        })
      }
    }

    // Emit particles (respect max limit)
    for (const { edge, startProgress, life } of edgesToEmit) {
      if (this.particles.size >= this.maxParticles) break

      // Create fewer particles on deeper edges
      const particleCount = Math.max(1, Math.floor(countPerEdge * life))
      for (let i = 0; i < particleCount; i++) {
        if (this.particles.size >= this.maxParticles) break
        this.createParticleWithLife(edge, color, startProgress, life)
      }
    }
  }

  /**
   * Create a single particle on an edge
   * @param {Object} edge - Edge object
   * @param {string} color - Particle color (hex)
   * @param {number} startProgress - Starting progress (0-1)
   * @param {number} initialLife - Initial life value (default 1.0)
   * @param {number} initialSize - Initial size (optional, random if not provided)
   * @returns {Object} The created particle or null if limit reached
   */
  createParticle(edge, color, startProgress = 0, initialLife = 1.0, initialSize = null) {
    // Check particle count limit
    if (this.particles.size >= this.maxParticles) {
      return null
    }

    const particleId = `particle-${this.particleCounter++}`

    const particle = {
      id: particleId,
      edge: edge,
      progress: startProgress,
      speed: this.baseSpeed + Math.random() * this.speedVariation,
      size: initialSize || (this.minSize + Math.random() * (this.maxSize - this.minSize)),
      color: color,
      life: initialLife,
      reverse: startProgress === 1,  // Flag for backward travel
      createdAt: Date.now()
    }

    // Add to edge's particle array
    if (!edge.particles) {
      edge.particles = []
    }
    edge.particles.push(particle)

    // Track in active particles
    this.particles.set(particleId, particle)

    return particle
  }

  /**
   * Create a single particle on an edge with life, and increase background node energy
   * @param {Object} edge - Edge object
   * @param {string} color - Particle color (hex)
   * @param {number} startProgress - Starting progress (0-1)
   * @param {number} life - Life value
   * @returns {Object} The created particle or null if limit reached
   */
  createParticleWithLife(edge, color, startProgress = 0, life = 1.0) {
    const particle = this.createParticle(edge, color, startProgress, life)
    if (particle) {
      // Increase energy level of background nodes
      const sourceNode = this.springMesh.backgroundNodes.get(edge.sourceId)
      const targetNode = this.springMesh.backgroundNodes.get(edge.targetId)
      if (sourceNode && sourceNode.energyLevel !== undefined) {
        sourceNode.energyLevel = Math.min(1, sourceNode.energyLevel + 0.15)
      }
      if (targetNode && targetNode.energyLevel !== undefined) {
        targetNode.energyLevel = Math.min(1, targetNode.energyLevel + 0.15)
      }
    }
    return particle
  }

  /**
   * Update all active particles
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    // Cap dt to prevent huge jumps
    dt = Math.min(dt, 0.1)

    const particlesToRemove = []
    const particlesToPropagate = []

    for (const [particleId, particle] of this.particles) {
      // Update progress along the edge (forward or backward)
      if (particle.reverse) {
        particle.progress -= particle.speed * dt
      } else {
        particle.progress += particle.speed * dt
      }

      // Decay life
      particle.life -= this.lifeDecay * dt

      // Check if particle completed its current edge
      const completed = particle.reverse ? (particle.progress <= 0) : (particle.progress >= 1)
      if (completed) {
        particlesToRemove.push(particleId)
      } else if (particle.life <= 0) {
        particlesToRemove.push(particleId)
      }
    }

    // Remove dead particles
    for (const particleId of particlesToRemove) {
      this.removeParticle(particleId)
    }

    // Propagate particles to connected edges (cascade effect)
    for (const propagate of particlesToPropagate) {
      this.propagateParticle(propagate.edge, propagate.life, propagate.color, propagate.size)
    }
  }

  /**
   * Propagate particle to connected edges from the target node
   * @param {Object} sourceEdge - Edge that particle just completed
   * @param {number} life - Propagated life (reduced)
   * @param {string} color - Particle color
   * @param {number} size - Particle size
   */
  propagateParticle(sourceEdge, life, color, size) {
    const targetNodeId = sourceEdge.targetId

    // Find all edges from the target node (cascade to connected edges)
    const connectedEdges = this.springMesh.edges.filter(
      edge => edge.sourceId === targetNodeId
    )

    // Don't exceed particle count limit
    if (this.particles.size >= this.maxParticles) {
      return
    }

    // Emit particle on each connected edge with reduced life
    for (const edge of connectedEdges) {
      this.createParticle(edge, color, 0, life, size)
    }
  }

  /**
   * Remove a particle from tracking
   * @param {string} particleId - Particle identifier
   */
  removeParticle(particleId) {
    const particle = this.particles.get(particleId)
    if (particle) {
      // Remove from edge's particle array
      const edge = particle.edge
      if (edge && edge.particles) {
        const edgeIndex = edge.particles.indexOf(particle)
        if (edgeIndex > -1) {
          edge.particles.splice(edgeIndex, 1)
        }
      }

      // Remove from active particles map
      this.particles.delete(particleId)
    }
  }

  /**
   * Render all active particles
   * @param {p5} p - p5.js instance
   */
  render(p) {
    // DEBUG: Log particle count occasionally
    if (p.frameCount % 60 === 0 && this.particles.size > 0) {
      // console.log('✨ Rendering', this.particles.size, 'particles')
    }

    for (const particle of this.particles.values()) {
      this.renderParticle(p, particle)
    }
  }

  /**
   * Render a single particle
   * @param {p5} p - p5.js instance
   * @param {Object} particle - Particle object
   */
  renderParticle(p, particle) {
    const edge = particle.edge
    const nodeA = this.springMesh.getNodeOrIntermediate(edge.sourceId)
    const nodeB = this.springMesh.getNodeOrIntermediate(edge.targetId)

    if (!nodeA || !nodeB) {
      // console.warn('⚠️ Particle render: Missing nodes for edge', edge.sourceId.substring(0, 8), '->', edge.targetId.substring(0, 8))
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
      particle.progress
    )

    // Calculate alpha based on life
    const alpha = Math.floor(particle.life * 180) // Max 180/255

    // DEBUG: Log first few renders
    if (this.particles.size <= 5 && p.frameCount % 10 === 0) {
      // console.log('✨ Rendering particle:', {
//        pos: `(${Math.round(pos.x)}, ${Math.round(pos.y)})`,
//        progress: particle.progress.toFixed(2),
//        life: particle.life.toFixed(2),
//        size: particle.size.toFixed(1),
//        alpha: alpha,
//        color: particle.color
////      })
    }

    // Parse color
    const rgb = this.hexToRgbArray(particle.color)

    // Draw particle
    p.noStroke()
    p.fill(rgb[0], rgb[1], rgb[2], alpha)
    p.circle(pos.x, pos.y, particle.size)
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
   * Clear all particles
   */
  clear() {
    // Clear all edge particle arrays
    for (const particle of this.particles.values()) {
      const edge = particle.edge
      if (edge && edge.particles) {
        const edgeIndex = edge.particles.indexOf(particle)
        if (edgeIndex > -1) {
          edge.particles.splice(edgeIndex, 1)
        }
      }
    }

    // Clear active particles map
    this.particles.clear()
  }

  /**
   * Get particle count
   * @returns {number} Number of active particles
   */
  getParticleCount() {
    return this.particles.size
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
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    this.clear()
    this.springMesh = null
  }
}

// Export for different module systems
if (typeof window !== 'undefined') {
  window.ParticleFlowManager = ParticleFlowManager
  // console.log('✅ ParticleFlowManager exported to window')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParticleFlowManager
}
