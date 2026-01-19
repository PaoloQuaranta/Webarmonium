/**
 * ParticleFlowManager
 * Manages particle emission and flow along curved network edges
 *
 * Behavior:
 * - Particles emit from source node and ARRIVE at destination before spawning new particles
 * - ARRIVAL-BASED CASCADE: when a particle completes its edge, it triggers new particles from arrival node
 * - Creates organic, convoy-like particle flow - particles travel along paths, not flood simultaneously
 * - Flow along Bezier curve paths
 * - Life decay with each hop
 * - Max particle count for performance
 */

/**
 * ParticleWaveContext - Tracks visited nodes for a single particle wave to prevent cycles
 * Shared across all particles that belong to the same wave origin
 */
class ParticleWaveContext {
  constructor(id, sourceNodeId, color, countPerEdge) {
    this.id = id
    this.sourceNodeId = sourceNodeId
    this.color = color
    this.countPerEdge = countPerEdge
    this.visitedNodes = new Set([sourceNodeId])
    this.activeParticleCount = 0  // Track how many particles are still traveling
  }
}

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

    // PERFORMANCE: Object pool for particle reuse
    const ParticlePoolClass = (typeof window !== 'undefined' && window.ParticlePool) || null
    this.particlePool = ParticlePoolClass ? new ParticlePoolClass(80) : null

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

    // Wave context tracking for arrival-based cascade propagation
    this.waveContexts = new Map()  // waveId -> ParticleWaveContext
    this.waveCounter = 0

    // Cascade propagation parameters - now configurable via VisualConstants
    this.lifeDecayPerHop = particleConfig.lifeDecayPerHop || 0.45  // Life multiplier per hop
    this.minLifeThreshold = 0.2  // Stop propagating below this life
    this.maxHops = particleConfig.maxHops || 3  // Maximum propagation depth

    // Entry #74: Graphics quality controls
    this._cascadeEnabled = true
  }

  /**
   * Entry #74: Enable/disable cascade propagation
   * @param {boolean} enabled - Whether cascade is enabled
   */
  setCascadeEnabled (enabled) {
    this._cascadeEnabled = enabled
  }

  /**
   * Entry #74: Set maximum particle count
   * @param {number} count - Maximum particles
   */
  setMaxParticles (count) {
    this.maxParticles = count

    // If we have more particles than new max, remove oldest
    if (this.particles.size > count) {
      const toRemove = this.particles.size - count
      const particleIds = Array.from(this.particles.keys()).slice(0, toRemove)
      for (const id of particleIds) {
        this.removeParticle(id)
      }
    }
  }

  /**
   * Setup periodic cleanup of old particles
   * PERFORMANCE: Uses UnifiedUpdateLoop to reduce timer competition
   */
  setupAutoCleanup() {
    // PERFORMANCE FIX: Use UnifiedUpdateLoop instead of setInterval
    const updateLoop = window.UnifiedUpdateLoop?.getInstance()
    if (updateLoop) {
      // Register at 0.2Hz (5000ms interval) for cleanup
      updateLoop.register('particleCleanup', () => {
        this._performCleanup()
      }, 0.2)

      // Ensure loop is started
      if (!updateLoop.isRunning) {
        updateLoop.start()
      }
    } else {
      // Fallback to setInterval if UnifiedUpdateLoop not available
      this.cleanupTimer = setInterval(() => {
        this._performCleanup()
      }, this.cleanupIntervalMs)
    }
  }

  /**
   * Perform particle cleanup (extracted for reuse)
   */
  _performCleanup() {
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
  }

  /**
   * Emit particles from a cursor using ARRIVAL-BASED CASCADE propagation
   * Particles travel along edges; when they ARRIVE at a node, they spawn new particles
   * This creates convoy-like particle flow through the network
   * @param {string} sourceUserId - Source user ID
   * @param {number} count - Number of particles to emit per edge
   */
  emitParticles(sourceUserId, count = this.emitCount) {
    // PERF: Apply stress factor to max particles for graceful degradation
    const stressFactor = window.visualService?.stressFactor ?? 1.0
    const adjustedMaxParticles = Math.ceil(this.maxParticles * stressFactor)

    // Check particle count limit (adjusted by stress)
    if (this.particles.size >= adjustedMaxParticles) {
      return
    }

    const sourceNode = this.springMesh.nodes.get(sourceUserId)
    if (!sourceNode) {
      return
    }

    // Create wave context for tracking this cascade
    const waveId = `pwave-${this.waveCounter++}`
    const waveContext = new ParticleWaveContext(waveId, sourceUserId, sourceNode.color, count)
    this.waveContexts.set(waveId, waveContext)

    // Find all edges from the source cursor
    const outgoingEdges = this.springMesh.edges.filter(
      edge => edge.sourceId === sourceUserId
    )

    // Emit initial particles ONLY on edges from the source cursor
    // These particles will CASCADE on arrival at their destinations
    for (const edge of outgoingEdges) {
      // Create multiple particles per edge for visual density
      const particleCount = Math.min(count, 3)  // Cap initial burst
      for (let i = 0; i < particleCount; i++) {
        if (this.particles.size >= adjustedMaxParticles) break

        const particle = this.createCascadeParticle(edge, sourceNode.color, 1.0, waveContext, 0)
        if (particle) {
          waveContext.activeParticleCount++
        }
      }
    }
  }

  /**
   * Create a particle that will CASCADE on arrival
   * @param {Object} edge - Edge to travel along
   * @param {string} color - Particle color
   * @param {number} life - Particle life (affects visual and cascade)
   * @param {ParticleWaveContext} waveContext - Wave context for cycle prevention
   * @param {number} hopCount - Current hop depth
   * @returns {Object} Created particle or null
   */
  createCascadeParticle(edge, color, life, waveContext, hopCount) {
    // PERF: Apply stress factor to max particles
    const stressFactor = window.visualService?.stressFactor ?? 1.0
    const adjustedMaxParticles = Math.ceil(this.maxParticles * stressFactor)

    if (this.particles.size >= adjustedMaxParticles) return null
    if (life < this.minLifeThreshold) return null
    if (hopCount > this.maxHops) return null

    const particleId = `particle-${this.particleCounter++}`

    // PERFORMANCE: Use object pool if available
    let particle
    if (this.particlePool) {
      particle = this.particlePool.acquire()
      // FIX: Handle pool exhaustion (returns null when max size reached)
      if (!particle) return null
      particle.id = particleId
      particle.edge = edge
      particle.progress = Math.random() * 0.1
      particle.speed = this.baseSpeed + Math.random() * this.speedVariation
      particle.size = (this.minSize + Math.random() * (this.maxSize - this.minSize)) * Math.sqrt(life)
      particle.color = color
      particle.life = life
      particle.createdAt = Date.now()
      particle.waveContext = waveContext
      particle.hopCount = hopCount
      particle.shouldCascade = true
      particle.isReverse = false
      particle.destinationNodeId = null
    } else {
      particle = {
        id: particleId,
        edge: edge,
        progress: Math.random() * 0.1,  // Slight stagger in starting position
        speed: this.baseSpeed + Math.random() * this.speedVariation,
        size: (this.minSize + Math.random() * (this.maxSize - this.minSize)) * Math.sqrt(life),
        color: color,
        life: life,
        createdAt: Date.now(),
        // CASCADE PROPAGATION properties
        waveContext: waveContext,
        hopCount: hopCount,
        shouldCascade: true  // Flag for arrival-based propagation
      }
    }

    // Add to edge's particle array
    if (!edge.particles) {
      edge.particles = []
    }
    edge.particles.push(particle)

    // Track in active particles
    this.particles.set(particleId, particle)

    // Increase energy level of nodes
    const sourceNode = this.springMesh.backgroundNodes.get(edge.sourceId)
    const targetNode = this.springMesh.backgroundNodes.get(edge.targetId)
    if (sourceNode && sourceNode.energyLevel !== undefined) {
      sourceNode.energyLevel = Math.min(1, sourceNode.energyLevel + 0.15 * life)
    }
    if (targetNode && targetNode.energyLevel !== undefined) {
      targetNode.energyLevel = Math.min(1, targetNode.energyLevel + 0.1 * life)
    }

    return particle
  }

  /**
   * Handle particle arrival - CASCADE to connected edges (BIDIRECTIONAL)
   * Called when a particle completes its edge traversal (progress >= 1)
   * Looks for edges where arrival node is SOURCE or TARGET (for undirected graph traversal)
   * @param {Object} particle - The particle that just arrived
   */
  onParticleArrival(particle) {
    if (!particle.shouldCascade || !particle.waveContext) return

    // Entry #74: Skip cascade if disabled by user settings
    if (!this._cascadeEnabled) return

    const waveContext = particle.waveContext
    // For bidirectional particles, use destinationNodeId; otherwise use edge.targetId
    const arrivalNodeId = particle.destinationNodeId || particle.edge.targetId

    // Mark arrival node as visited
    waveContext.visitedNodes.add(arrivalNodeId)

    // PERF: Get stress factor for cascade adjustments
    const stressFactor = window.visualService?.stressFactor ?? 1.0

    // PERF: Reduce cascade under stress (particles retain less life when FPS drops)
    // Normal stress (1.0): decay = 0.45 (45% retained per hop)
    // High stress (0.3): decay = 0.135 (13.5% retained - faster death, less propagation)
    const adjustedDecay = this.lifeDecayPerHop * stressFactor

    // Calculate cascaded life with adjusted decay
    const cascadeLife = particle.life * adjustedDecay
    if (cascadeLife < this.minLifeThreshold) return

    const nextHop = particle.hopCount + 1
    if (nextHop > this.maxHops) return

    // Find ALL connected edges (bidirectional traversal)
    // This is critical because TERTIARY edges are created only in one direction
    const connectedEdges = this.springMesh.edges.filter(
      edge => edge.sourceId === arrivalNodeId || edge.targetId === arrivalNodeId
    )

    // PERF: Apply stress factor to max particles
    const adjustedMaxParticles = Math.ceil(this.maxParticles * stressFactor)

    // Spawn cascade particles to unvisited nodes
    // Fewer particles per edge on deeper hops
    const particlesPerEdge = Math.max(1, Math.floor(waveContext.countPerEdge * cascadeLife))

    for (const edge of connectedEdges) {
      // Determine the "other" node - the one we'd travel TO
      const otherNodeId = edge.sourceId === arrivalNodeId ? edge.targetId : edge.sourceId

      // Skip if other node already visited (prevents cycles)
      if (waveContext.visitedNodes.has(otherNodeId)) continue
      if (this.particles.size >= adjustedMaxParticles) break

      for (let i = 0; i < particlesPerEdge; i++) {
        if (this.particles.size >= adjustedMaxParticles) break

        // Create particle that travels TO the other node
        // We need to handle edge direction - if we're traveling "backwards", start at progress=1
        const isForward = edge.sourceId === arrivalNodeId
        const cascadeParticle = this.createCascadeParticleBidirectional(
          edge,
          particle.color,
          cascadeLife,
          waveContext,
          nextHop,
          isForward,
          otherNodeId
        )
        if (cascadeParticle) {
          waveContext.activeParticleCount++
        }
      }
    }
  }

  /**
   * Create a cascade particle that can travel in either direction
   * @param {Object} edge - Edge to travel along
   * @param {string} color - Particle color
   * @param {number} life - Particle life
   * @param {ParticleWaveContext} waveContext - Wave context
   * @param {number} hopCount - Current hop depth
   * @param {boolean} isForward - True if traveling source→target, false if target→source
   * @param {string} destinationNodeId - The node we're traveling TO
   * @returns {Object} Created particle or null
   */
  createCascadeParticleBidirectional(edge, color, life, waveContext, hopCount, isForward, destinationNodeId) {
    // PERF: Apply stress factor to max particles
    const stressFactor = window.visualService?.stressFactor ?? 1.0
    const adjustedMaxParticles = Math.ceil(this.maxParticles * stressFactor)

    if (this.particles.size >= adjustedMaxParticles) return null
    if (life < this.minLifeThreshold) return null
    if (hopCount > this.maxHops) return null

    const particleId = `particle-${this.particleCounter++}`

    // PERFORMANCE: Use object pool if available
    let particle
    if (this.particlePool) {
      particle = this.particlePool.acquire()
      // FIX: Handle pool exhaustion (returns null when max size reached)
      if (!particle) return null
      particle.id = particleId
      particle.edge = edge
      particle.progress = isForward ? (Math.random() * 0.1) : (1 - Math.random() * 0.1)
      particle.speed = this.baseSpeed + Math.random() * this.speedVariation
      particle.size = (this.minSize + Math.random() * (this.maxSize - this.minSize)) * Math.sqrt(life)
      particle.color = color
      particle.life = life
      particle.createdAt = Date.now()
      particle.waveContext = waveContext
      particle.hopCount = hopCount
      particle.shouldCascade = true
      particle.isReverse = !isForward
      particle.destinationNodeId = destinationNodeId
    } else {
      particle = {
        id: particleId,
        edge: edge,
        progress: isForward ? (Math.random() * 0.1) : (1 - Math.random() * 0.1),
        speed: this.baseSpeed + Math.random() * this.speedVariation,
        size: (this.minSize + Math.random() * (this.maxSize - this.minSize)) * Math.sqrt(life),
        color: color,
        life: life,
        createdAt: Date.now(),
        // CASCADE PROPAGATION properties
        waveContext: waveContext,
        hopCount: hopCount,
        shouldCascade: true,
        // BIDIRECTIONAL properties
        isReverse: !isForward,  // True if traveling target→source
        destinationNodeId: destinationNodeId
      }
    }

    // Add to edge's particle array
    if (!edge.particles) {
      edge.particles = []
    }
    edge.particles.push(particle)

    // Track in active particles
    this.particles.set(particleId, particle)

    // Increase energy level of nodes
    const sourceNode = this.springMesh.backgroundNodes.get(edge.sourceId)
    const targetNode = this.springMesh.backgroundNodes.get(edge.targetId)
    if (sourceNode && sourceNode.energyLevel !== undefined) {
      sourceNode.energyLevel = Math.min(1, sourceNode.energyLevel + 0.15 * life)
    }
    if (targetNode && targetNode.energyLevel !== undefined) {
      targetNode.energyLevel = Math.min(1, targetNode.energyLevel + 0.1 * life)
    }

    return particle
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
   * Update all active particles - ARRIVAL-BASED CASCADE (BIDIRECTIONAL)
   * When particles complete their edge, they trigger cascade propagation
   * Handles both forward (progress 0→1) and reverse (progress 1→0) particles
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    // Cap dt to prevent huge jumps
    dt = Math.min(dt, 0.1)

    const particlesToRemove = []
    const arrivingParticles = []

    // Update existing particles
    for (const [particleId, particle] of this.particles) {
      // Update progress along the edge (direction depends on isReverse)
      if (particle.isReverse) {
        particle.progress -= particle.speed * dt  // Travel backwards along edge
      } else {
        particle.progress += particle.speed * dt  // Travel forwards along edge
      }

      // Gentle life decay over time
      particle.life -= this.lifeDecay * dt * 0.5  // Slower decay for cascade particles

      // Check if particle ARRIVED at destination (completed edge traversal)
      // For reverse particles, arrival is at progress <= 0
      // For forward particles, arrival is at progress >= 1
      const hasArrived = particle.isReverse ? (particle.progress <= 0) : (particle.progress >= 1)

      if (hasArrived) {
        // Particle has ARRIVED - queue for cascade propagation
        arrivingParticles.push(particle)
        particlesToRemove.push(particleId)
      } else if (particle.life <= 0) {
        particlesToRemove.push(particleId)
      }
    }

    // CRITICAL: Handle arrivals BEFORE removing particles
    // This triggers the cascade propagation
    for (const particle of arrivingParticles) {
      this.onParticleArrival(particle)

      // Decrement active particle count in wave context
      if (particle.waveContext) {
        particle.waveContext.activeParticleCount--
      }
    }

    // Remove completed particles
    for (const particleId of particlesToRemove) {
      this.removeParticle(particleId)
    }

    // Clean up wave contexts with no active particles
    for (const [waveId, context] of this.waveContexts) {
      if (context.activeParticleCount <= 0) {
        this.waveContexts.delete(waveId)
      }
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

      // PERFORMANCE: Release particle back to pool for reuse
      if (this.particlePool) {
        this.particlePool.release(particle)
      }
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
   * Clear all particles and wave contexts
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

    // Clear wave contexts
    this.waveContexts.clear()
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
    // Unregister from UnifiedUpdateLoop if used
    const updateLoop = window.UnifiedUpdateLoop?.getInstance()
    if (updateLoop) {
      updateLoop.unregister('particleCleanup')
    }

    // Also clear setInterval fallback if used
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
