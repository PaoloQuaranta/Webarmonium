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

    // PERFORMANCE: Object pool for pulse reuse
    const PulsePoolClass = (typeof window !== 'undefined' && window.PulsePool) || null
    this.pulsePool = PulsePoolClass ? new PulsePoolClass(30) : null

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

    // Cascade propagation parameters - now configurable via VisualConstants
    this.intensityDecayPerHop = pulseConfig.intensityDecayPerHop || 0.4  // Intensity multiplier per hop
    this.minIntensityThreshold = 0.12  // Stop propagating below this intensity
    this.maxHops = pulseConfig.maxHops || 2  // Maximum propagation depth

    // Entry #74: Glow control (user settings override)
    this._glowEnabled = true  // Default: enabled
    this._glowOverride = null  // null = use stressFactor, true/false = force

    // PixiJS rendering state
    this._pixiAdapter = null
    this._pixiGlowContainer = null   // ParticleContainer for glow sprites
    this._pixiCoreContainer = null   // ParticleContainer for core sprites
    this._pixiSpriteMap = new Map()  // pulseId -> { glow: PIXI.Particle, core: PIXI.Particle }
    this._pixiGlowPool = []         // available glow particles
    this._pixiCorePool = []         // available core particles
    this._glowTexSize = 64          // cached glow texture diameter
    this._coreTexSize = 16          // cached core texture diameter
    this._isLightMode = false
  }

  /**
   * Entry #74: Enable/disable pulse glow effect
   * @param {boolean} enabled - Whether glow is enabled
   */
  setGlowEnabled (enabled) {
    this._glowOverride = enabled
  }

  /**
   * Adjust rendering for light/dark theme
   * Light mode: reduce glow alpha, switch from additive to normal blending
   */
  setLightMode(isLight) {
    this._isLightMode = !!isLight
    if (this._pixiGlowContainer) {
      this._pixiGlowContainer.blendMode = isLight ? 'normal' : 'add'
    }
  }

  /**
   * Initialize PixiJS rendering for wave pulses
   * Pre-baked glow texture replaces shadowBlur entirely (zero-cost GPU glow)
   * @param {PixiAdapter} adapter - PixiAdapter instance
   */
  initPixi(adapter) {
    // Clean up previous PixiJS state (for context loss recovery)
    if (this._pixiGlowContainer) {
      if (this._pixiGlowContainer.parent) {
        this._pixiGlowContainer.parent.removeChild(this._pixiGlowContainer)
      }
      if (this._pixiCoreContainer && this._pixiCoreContainer.parent) {
        this._pixiCoreContainer.parent.removeChild(this._pixiCoreContainer)
      }
      this._pixiGlowContainer.destroy()
      this._pixiCoreContainer.destroy()
      this._pixiGlowContainer = null
      this._pixiCoreContainer = null
      this._pixiSpriteMap.clear()
      this._pixiGlowPool = []
      this._pixiCorePool = []
    }

    this._pixiAdapter = adapter
    const layer = adapter.getLayer('waveLayer')
    if (!layer) return

    // Glow layer — Container + Sprite (ParticleContainer + Particle has pool visibility bug)
    this._pixiGlowContainer = new PIXI.Container()
    this._pixiGlowContainer.blendMode = 'add'
    layer.addChild(this._pixiGlowContainer)

    // Core layer — Container + Sprite (on top of glow)
    this._pixiCoreContainer = new PIXI.Container()
    layer.addChild(this._pixiCoreContainer)

    // Pre-allocate sprite pairs for max pulse count
    const glowTexture = adapter.getTexture('glowCircle')
    const coreTexture = adapter.getTexture('pulseCore')
    this._glowTexSize = glowTexture?.width || 64
    this._coreTexSize = coreTexture?.width || 16
    console.log('[WavePacketSystem] Texture sizes — glow:', this._glowTexSize, 'core:', this._coreTexSize)

    for (let i = 0; i < this.maxPulses; i++) {
      const glow = new PIXI.Sprite(glowTexture)
      glow.anchor.set(0.5)
      glow.x = -9999
      glow.y = -9999
      glow.scale.set(0.001)
      glow.alpha = 0
      glow.visible = false
      this._pixiGlowPool.push(glow)
      this._pixiGlowContainer.addChild(glow)

      const core = new PIXI.Sprite(coreTexture)
      core.anchor.set(0.5)
      core.x = -9999
      core.y = -9999
      core.scale.set(0.001)
      core.alpha = 0
      core.tint = 0xFFFFFF
      core.visible = false
      this._pixiCorePool.push(core)
      this._pixiCoreContainer.addChild(core)
    }
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

    // Find all connected edges (bidirectional traversal)
    // Remote users may appear as targetId (not sourceId) on topology edges
    // due to Map iteration order in TopologyGenerator.generateCircuitPath()
    const connectedEdges = this.springMesh.edges.filter(
      edge => edge.sourceId === sourceUserId || edge.targetId === sourceUserId
    )

    // PERF: Apply stress factor to max pulses for graceful degradation
    const stressFactor = window.visualService?.stressFactor ?? 1.0
    const adjustedMaxPulses = Math.ceil(this.maxPulses * stressFactor)

    // Emit initial pulses on all connected edges
    // These pulses will CASCADE on arrival at their destinations
    for (const edge of connectedEdges) {
      if (this.activePulses.size >= adjustedMaxPulses) break

      // Determine direction: forward if user is sourceId, reverse if user is targetId
      const isForward = edge.sourceId === sourceUserId
      const destinationNodeId = isForward ? edge.targetId : edge.sourceId
      const pulse = this.createCascadePulseBidirectional(
        edge, color, this.baseIntensity, waveContext, 0, isForward, destinationNodeId
      )
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
    // PERF: Apply stress factor to max pulses
    const stressFactor = window.visualService?.stressFactor ?? 1.0
    const adjustedMaxPulses = Math.ceil(this.maxPulses * stressFactor)

    if (this.activePulses.size >= adjustedMaxPulses) return null
    if (intensity < this.minIntensityThreshold) return null
    if (hopCount > this.maxHops) return null

    const pulseId = `pulse-${this.pulseCounter++}`

    // PERFORMANCE: Use object pool if available
    let pulse
    if (this.pulsePool) {
      pulse = this.pulsePool.acquire()
      // FIX: Handle pool exhaustion (returns null when max size reached)
      if (!pulse) return null
      pulse.id = pulseId
      pulse.edge = edge
      pulse.progress = 0
      pulse.speed = this.baseSpeed + Math.random() * this.speedVariation
      pulse.intensity = intensity
      pulse.color = color
      pulse.width = this.pulseWidth * Math.sqrt(intensity)
      pulse.createdAt = Date.now()
      pulse.waveContext = waveContext
      pulse.hopCount = hopCount
      pulse.shouldCascade = true
      pulse.isReverse = false
      pulse.destinationNodeId = null
    } else {
      pulse = {
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

    // PERF: Apply stress factor to max pulses
    const stressFactor = window.visualService?.stressFactor ?? 1.0
    const adjustedMaxPulses = Math.ceil(this.maxPulses * stressFactor)

    // Spawn cascade pulses to unvisited nodes
    for (const edge of connectedEdges) {
      // Determine the "other" node - the one we'd travel TO
      const otherNodeId = edge.sourceId === arrivalNodeId ? edge.targetId : edge.sourceId

      // Skip if other node already visited (prevents cycles)
      if (waveContext.visitedNodes.has(otherNodeId)) continue
      if (this.activePulses.size >= adjustedMaxPulses) break

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
    // PERF: Apply stress factor to max pulses
    const stressFactor = window.visualService?.stressFactor ?? 1.0
    const adjustedMaxPulses = Math.ceil(this.maxPulses * stressFactor)

    if (this.activePulses.size >= adjustedMaxPulses) return null
    if (intensity < this.minIntensityThreshold) return null
    if (hopCount > this.maxHops) return null

    const pulseId = `pulse-${this.pulseCounter++}`

    // PERFORMANCE: Use object pool if available
    let pulse
    if (this.pulsePool) {
      pulse = this.pulsePool.acquire()
      // FIX: Handle pool exhaustion (returns null when max size reached)
      if (!pulse) return null
      pulse.id = pulseId
      pulse.edge = edge
      pulse.progress = isForward ? 0 : 1
      pulse.speed = this.baseSpeed + Math.random() * this.speedVariation
      pulse.intensity = intensity
      pulse.color = color
      pulse.width = this.pulseWidth * Math.sqrt(intensity)
      pulse.createdAt = Date.now()
      pulse.waveContext = waveContext
      pulse.hopCount = hopCount
      pulse.shouldCascade = true
      pulse.isReverse = !isForward
      pulse.destinationNodeId = destinationNodeId
    } else {
      pulse = {
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

    // FIX: Protect against NaN dt
    if (!isFinite(dt) || dt <= 0) {
      dt = 0.016  // Default to ~60fps frame time
    }

    // Update existing pulses
    for (const [pulseId, pulse] of this.activePulses) {
      // FIX: Check for pulses marked for removal during render
      if (pulse._markedForRemoval) {
        if (pulse.waveContext) pulse.waveContext.activePulseCount--
        pulsesToRemove.push(pulseId)
        continue
      }

      // FIX: Validate pulse has required properties
      if (!pulse.edge || !isFinite(pulse.progress) || !isFinite(pulse.speed)) {
        if (pulse.waveContext) pulse.waveContext.activePulseCount--
        pulsesToRemove.push(pulseId)
        continue
      }

      // Update progress along the edge (direction depends on isReverse)
      if (pulse.isReverse) {
        pulse.progress -= pulse.speed * dt  // Travel backwards along edge
      } else {
        pulse.progress += pulse.speed * dt  // Travel forwards along edge
      }

      // FIX: Check for NaN after progress update
      if (!isFinite(pulse.progress)) {
        if (pulse.waveContext) pulse.waveContext.activePulseCount--
        pulsesToRemove.push(pulseId)
        continue
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
        // v0.7.9 FIX: Decrement activePulseCount for fading pulses too.
        // Previously only arriving pulses decremented, causing waveContexts
        // to accumulate indefinitely (leak ~3 contexts/sec during sequencer).
        if (pulse.waveContext) {
          pulse.waveContext.activePulseCount--
        }
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

      // PERFORMANCE: Release pulse back to pool for reuse
      if (this.pulsePool) {
        this.pulsePool.release(pulse)
      }
    }
  }

  /**
   * Render all active pulses
   * PixiJS path: update sprite positions/colors — pre-baked glow replaces shadowBlur
   * @param {p5} p - p5.js instance
   */
  render(p) {
    if (this._pixiAdapter) {
      this._renderPixi()
      // Periodic cleanup still needed for orphaned pulses
      this._frameCounter = (this._frameCounter || 0) + 1
      if (this._frameCounter % 60 === 0) {
        this._cleanupOrphanedPulses()
      }
      return
    }

    for (const pulse of this.activePulses.values()) {
      this.renderPulse(p, pulse)
    }

    if (p.frameCount % 60 === 0) {
      this._cleanupOrphanedPulses()
    }
  }

  /**
   * PixiJS render: update glow + core sprite properties for each active pulse
   * Pre-baked glow texture replaces shadowBlur (from ~200 draw calls + shadowBlur to 2 batched calls)
   * @private
   */
  _renderPixi() {
    if (!this._pixiAdapter || !this._pixiGlowContainer) return
    const w = this._pixiAdapter.width
    const h = this._pixiAdapter.height
    const glowTexSize = this._glowTexSize
    const coreTexSize = this._coreTexSize

    for (const [pulseId, pulse] of this.activePulses) {
      // Lazy sprite assignment from pool
      let sprites = this._pixiSpriteMap.get(pulseId)
      if (!sprites) {
        if (this._pixiGlowPool.length === 0) continue
        sprites = {
          glow: this._pixiGlowPool.pop(),
          core: this._pixiCorePool.pop(),
        }
        this._pixiSpriteMap.set(pulseId, sprites)
      }

      const edge = pulse.edge
      if (!edge || !edge.controlPoint) {
        sprites.glow.visible = false
        sprites.core.visible = false
        continue
      }

      const nodeA = this.springMesh.getNodeOrIntermediate(edge.sourceId)
      const nodeB = this.springMesh.getNodeOrIntermediate(edge.targetId)
      if (!nodeA || !nodeB) {
        sprites.glow.visible = false
        sprites.core.visible = false
        continue
      }

      // Position on Bezier curve
      const pos = this.calculateBezierPosition(
        nodeA.x * w, nodeA.y * h,
        edge.controlPoint.x * w, edge.controlPoint.y * h,
        nodeB.x * w, nodeB.y * h,
        pulse.progress
      )

      if (!isFinite(pos.x) || !isFinite(pos.y)) {
        sprites.glow.visible = false
        sprites.core.visible = false
        continue
      }

      // Visual properties
      const size = pulse.width * pulse.intensity
      const alpha = pulse.intensity

      // Color tint
      const rgb = this.hexToRgbArray(pulse.color)
      const tint = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]

      // Glow sprite (pre-baked radial gradient, additive blending on container)
      const glowVisualSize = size * 7
      const glowScale = glowVisualSize / glowTexSize
      sprites.glow.x = pos.x
      sprites.glow.y = pos.y
      sprites.glow.tint = tint
      sprites.glow.alpha = alpha * (this._isLightMode ? 0.25 : 0.6)
      sprites.glow.scale.set(glowScale)
      sprites.glow.visible = true

      // Core sprite (bright white center — subtle highlight)
      const coreScale = (size * 0.6) / coreTexSize
      sprites.core.x = pos.x
      sprites.core.y = pos.y
      sprites.core.tint = 0xFFFFFF
      sprites.core.alpha = alpha * 0.9
      sprites.core.scale.set(coreScale)
      sprites.core.visible = true
    }

    // Reclaim sprites from removed pulses
    for (const [pulseId, sprites] of this._pixiSpriteMap) {
      if (!this.activePulses.has(pulseId)) {
        sprites.glow.visible = false
        sprites.core.visible = false
        this._pixiGlowPool.push(sprites.glow)
        this._pixiCorePool.push(sprites.core)
        this._pixiSpriteMap.delete(pulseId)
      }
    }
  }

  /**
   * FIX: Clean up orphaned pulses that were marked for removal
   * or have invalid state
   * @private
   */
  _cleanupOrphanedPulses() {
    const orphanedIds = []

    for (const [pulseId, pulse] of this.activePulses) {
      // Check for marked pulses
      if (pulse._markedForRemoval) {
        orphanedIds.push(pulseId)
        continue
      }

      // Check for invalid edge
      if (!pulse.edge) {
        orphanedIds.push(pulseId)
        continue
      }

      // Check if edge nodes still exist
      const nodeA = this.springMesh.getNodeOrIntermediate(pulse.edge.sourceId)
      const nodeB = this.springMesh.getNodeOrIntermediate(pulse.edge.targetId)
      if (!nodeA || !nodeB) {
        orphanedIds.push(pulseId)
      }
    }

    // Remove orphaned pulses
    for (const pulseId of orphanedIds) {
      this.removePulse(pulseId)
    }

    if (orphanedIds.length > 0) {
    }
  }

  /**
   * Render a single pulse as a glowing packet
   * @param {p5} p - p5.js instance
   * @param {Object} pulse - Pulse object
   */
  renderPulse(p, pulse) {
    const edge = pulse.edge

    // FIX: Validate edge exists and has required properties
    if (!edge || !edge.sourceId || !edge.targetId || !edge.controlPoint) {
      // Mark pulse for removal - edge is invalid
      pulse._markedForRemoval = true
      return
    }

    const nodeA = this.springMesh.getNodeOrIntermediate(edge.sourceId)
    const nodeB = this.springMesh.getNodeOrIntermediate(edge.targetId)

    if (!nodeA || !nodeB) {
      // FIX: Mark pulse for removal instead of just skipping render
      // This prevents orphaned pulses from accumulating
      pulse._markedForRemoval = true
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

    // FIX: Validate position is finite (prevents NaN rendering artifacts)
    if (!isFinite(pos.x) || !isFinite(pos.y)) {
      pulse._markedForRemoval = true
      return
    }

    // Calculate visual properties
    const alpha = Math.floor(pulse.intensity * 255)
    const size = pulse.width * pulse.intensity

    // FIX: Validate visual properties
    if (!isFinite(alpha) || !isFinite(size) || size <= 0) {
      pulse._markedForRemoval = true
      return
    }

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

    // PERFORMANCE: Conditional glow effect - disable under stress
    // shadowBlur is expensive especially on Chrome/Windows
    // Entry #74: Respect user override if set
    const stressFactor = window.visualService?.stressFactor ?? 1.0
    let useGlow = stressFactor > 0.7
    if (this._glowOverride !== null) {
      useGlow = this._glowOverride
    }

    // FIX: Always set/reset shadowBlur to avoid state bleeding if stressFactor changes mid-frame
    p.drawingContext.shadowBlur = useGlow ? 30 * pulse.intensity : 0
    p.drawingContext.shadowColor = useGlow ? pulse.color : ''
    p.circle(pos.x, pos.y, size * 2)

    // Draw inner bright core
    p.fill(255, 255, 255, alpha)
    p.circle(pos.x, pos.y, size * 0.5)

    // Always reset shadow after drawing
    p.drawingContext.shadowBlur = 0
    p.drawingContext.shadowColor = ''
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
    if (typeof hex !== 'string') return [255, 255, 255]
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

    // PixiJS cleanup
    if (this._pixiGlowContainer) {
      this._pixiGlowContainer.destroy({ children: true })
      this._pixiGlowContainer = null
    }
    if (this._pixiCoreContainer) {
      this._pixiCoreContainer.destroy({ children: true })
      this._pixiCoreContainer = null
    }
    this._pixiSpriteMap.clear()
    this._pixiGlowPool = []
    this._pixiCorePool = []
    this._pixiAdapter = null

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
