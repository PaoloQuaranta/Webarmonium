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
   * Emit particles from a cursor through the trace network
   * Particles travel along edges from the source cursor
   * @param {string} sourceUserId - Source user ID
   * @param {number} count - Number of particles to emit per edge
   */
  emitParticles(sourceUserId, count = this.emitCount) {
    // Check particle count limit
    if (this.particles.size >= this.maxParticles) {
      // console.warn('⚠️ emitParticles: Max particles reached', this.particles.size, '/', this.maxParticles)
      return
    }

    const sourceNode = this.springMesh.nodes.get(sourceUserId)
    if (!sourceNode) {
      // console.warn('⚠️ emitParticles: Source node not found', sourceUserId.substring(0, 8))
      return
    }

    // Find all cursor-trace edges from this cursor
    // FIX: Also find edges where this user is the TARGET (for remote users)
    const sourceEdges = this.springMesh.edges.filter(
      edge => (edge.sourceId === sourceUserId || edge.targetId === sourceUserId) && edge.type === 'cursor-trace'
    )

    // console.log('✨ emitParticles:', {
//      userId: sourceUserId.substring(0, 8),
//      edgesFound: sourceEdges.length,
//      countPerEdge: count
////    })

    let created = 0
    // Emit particles along each edge
    for (const edge of sourceEdges) {
      // If user is the target, start particle from the end (backwards)
      const startFromEnd = (edge.targetId === sourceUserId)

      for (let i = 0; i < count; i++) {
        // Check limit before each particle
        if (this.particles.size >= this.maxParticles) {
          // console.warn('⚠️ emitParticles: Max particles reached during creation', this.particles.size, '/', this.maxParticles)
          return
        }

        const particle = this.createParticle(edge, sourceNode.color, startFromEnd ? 1 : 0)
        if (particle) created++
      }
    }

    // console.log('✅ Particles created:', created, 'activeParticles:', this.particles.size)
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
