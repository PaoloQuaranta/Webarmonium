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
          tapSize: 14,
          dragSize: 18,
          holdPulseMin: 15,
          holdPulseMax: 22,
          holdPulseSpeed: 0.005,
          glowBlur: 20
        }

    // OPTIMIZATION: Detect mobile once for all performance adaptations (DRY fix)
    this.isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent)

    // Node storage: userId -> Node object
    this.nodes = new Map()

    // Blocked user IDs -> timestamp: prevents ghost node recreation from late socket events
    this.blockedUserIds = new Map()
    this.BLOCKED_USER_TTL_MS = 30000

    // Periodic cleanup of expired blocks (every 60 seconds)
    this._blockCleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [userId, blockTime] of this.blockedUserIds.entries()) {
        if (now - blockTime >= this.BLOCKED_USER_TTL_MS) {
          this.blockedUserIds.delete(userId)
        }
      }
    }, 60000)

    // Background nodes: Static nodes distributed across canvas to fill space
    this.backgroundNodes = new Map()
    // OPTIMIZATION: Mobile devices use fewer nodes for better performance
    this.backgroundNodeCount = this.isMobile ? 20 : 30  // Number of background nodes (20 mobile, 30 desktop)
    this.backgroundNodesInitialized = false

    // Edge storage: Array of Edge objects
    this.edges = []

    // Topology generation
    this.topologyGenerator = new TopologyGenerator()
    this.intermediateNodes = new Map()  // Non-cursor nodes (radial, circuit)
    this.edgeCircuitNodes = new Map()    // edgeId -> [circuitNodeIds]

    // Physics state
    this.physicsEnabled = true
    this.lastUpdateTime = 0

    // Edge type categorization for visual hierarchy
    this.EDGE_TYPES = {
      PRIMARY: 'cursor-cursor',   // Cursor to cursor (bright, thick, alpha 0.6-0.8)
      SECONDARY: 'cursor-background',  // Cursor to background (medium, alpha 0.3-0.5)
      TERTIARY: 'background-background',  // Background to background (faint, alpha 0.1-0.2)
      CURSOR_TRACE: 'cursor-trace',  // Original cursor to trace
      TRACE_TRACE: 'trace-trace'  // Original trace to trace
    }

    // OPTIMIZATION: Topology rebuild throttling (Phase 2)
    // Reduced frequency from 10/sec to 3.33/sec (70% reduction in CPU)
    // Mobile devices use 500ms for better battery life
    this.lastTopologyRebuildTime = 0
    this.topologyRebuildInterval = this.isMobile ? 500 : 300  // ms between rebuilds (100ms → 300ms desktop, 500ms mobile)

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
    // OPTIMIZATION: Mobile devices use fewer curve segments for better performance
    this.curveSegments = this.isMobile ? 10 : Math.min(14, edgeConfig.segments)  // 10 mobile, 14 desktop (reduced from 20 for audio priority)

    // Store configs for use in methods
    this.EDGE_CONFIG = edgeConfig
    this.NODE_CONFIG = nodeConfig

    // OPTIMIZATION: Precompute Bezier basis functions to eliminate Math.pow calls
    this.bezierBasisCache = this._precomputeBezierBasis(this.curveSegments)

    // OPTIMIZATION: Spatial hash grid for efficient collision detection (O(n²) → O(n))
    // Cell size matches repulsionRange for optimal performance
    this.spatialGrid = new SpatialHashGrid(this.repulsionRange)

    // Entry #74: Shadow blur control for graphics quality settings
    this._shadowBlurEnabled = true

    // AUDIO PRIORITY: Pre-allocated RGB buffers to eliminate GC pressure
    // drawGradientCurve() was creating ~17,400 array allocations/frame (522,000/sec)
    this._rgbBuffer1 = [0, 0, 0]
    this._rgbBuffer2 = [0, 0, 0]
    this._rgbBufferTemp = [0, 0, 0]  // For intermediate/background node rendering
  }

  /**
   * AUDIO PRIORITY: Dynamically adjust curve segments at runtime
   * Called by GenerativeVisualService when audio stress changes
   * @param {number} count - Number of segments (5-20)
   */
  setCurveSegments(count) {
    const clamped = Math.max(5, Math.min(20, Math.round(count)))
    if (clamped === this.curveSegments) return
    this.curveSegments = clamped
    this.bezierBasisCache = this._precomputeBezierBasis(clamped)
  }

  /**
   * OPTIMIZATION: Precompute Bezier basis functions
   * Eliminates 80 Math.pow operations per edge (4 per segment × 20 segments)
   * @param {number} segments - Number of segments to precompute
   * @returns {Array} Array of basis function values for each segment endpoint
   * @private
   */
  _precomputeBezierBasis(segments) {
    // DEFENSIVE FIX: Validate segments to prevent empty cache
    if (!segments || segments <= 0) {
      console.error('⚠️ Invalid segments count for Bezier cache:', segments, '- using default 10')
      segments = 10  // Safe fallback
    }

    const cache = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const oneMinusT = 1 - t
      cache.push({
        b0: oneMinusT * oneMinusT,     // (1-t)²
        b1: 2 * oneMinusT * t,         // 2(1-t)t
        b2: t * t,                     // t²
        colorT: t                      // For color interpolation
      })
    }
    return cache
  }

  /**
   * Entry #74: Enable/disable shadow blur effect on nodes
   * @param {boolean} enabled - Whether shadow blur is enabled
   */
  setShadowBlurEnabled (enabled) {
    // Coerce to boolean for defensive programming
    this._shadowBlurEnabled = Boolean(enabled)
  }

  /**
   * Initialize background nodes distributed across canvas
   * Uses Poisson disk sampling for uniform distribution
   */
  initializeBackgroundNodes() {
    if (this.backgroundNodesInitialized) return

    this.backgroundNodes.clear()

    // Simple uniform distribution with minimum spacing
    const minSpacing = 0.15
    const positions = []

    for (let i = 0; i < this.backgroundNodeCount; i++) {
      let attempts = 0
      let x, y, valid

      // Try to find a position with minimum spacing
      do {
        x = 0.1 + Math.random() * 0.8  // Keep away from edges
        y = 0.1 + Math.random() * 0.8

        valid = true
        for (const pos of positions) {
          const dx = x - pos.x
          const dy = y - pos.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < minSpacing) {
            valid = false
            break
          }
        }
        attempts++
      } while (!valid && attempts < 50)

      if (valid) {
        positions.push({ x, y })
        const nodeId = `bg-${i}`
        this.backgroundNodes.set(nodeId, {
          id: nodeId,
          x,
          y,
          color: 'rgba(100, 100, 120, 0.25)',  // More visible gray-blue
          isBackground: true,
          energyLevel: 0  // Increases when pulses/particles pass through
        })
      }
    }

    this.backgroundNodesInitialized = true
  }

  /**
   * Update physics simulation
   * @param {number} dt - Delta time in seconds
   */
  updatePhysics(dt) {
    if (!this.physicsEnabled) return

    // Cap dt to prevent instability on lag spikes
    dt = Math.min(dt, 0.1)

    // Apply spring forces only for cursor-trace edges
    // Trace-trace edges are static (no physics)
    for (const edge of this.edges) {
      if (edge.type === 'cursor-trace') {
        this.applySpringForce(edge)
      }
    }

    // PERF: Skip O(n²) repulsion probabilistically under stress
    // When stress factor is low, we randomly skip some repulsion calculations
    // to reduce CPU load while maintaining visual coherence
    const stressFactor = window.visualService?.stressFactor ?? 1.0
    if (stressFactor > 0.5 || Math.random() < stressFactor) {
      this.applyRepulsionForces()
    }

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
   * OPTIMIZATION: Apply repulsion forces using spatial hash grid
   * Reduces complexity from O(n²) to O(n) with 5-8x speedup for 10 nodes
   */
  applyRepulsionForces() {
    // Clear and populate spatial grid
    this.spatialGrid.clear()
    for (const node of this.nodes.values()) {
      this.spatialGrid.insert(node)
    }

    // Only check nodes in same/adjacent cells (3×3 search for boundary safety)
    for (const node of this.nodes.values()) {
      const nearby = this.spatialGrid.getNearby(node.x, node.y)

      for (const other of nearby) {
        if (node === other) continue

        const dx = other.x - node.x
        const dy = other.y - node.y
        const distSq = dx * dx + dy * dy  // Avoid sqrt initially

        // OPTIMIZATION: Check squared distance first, only sqrt if needed
        const repulsionRangeSq = this.repulsionRange * this.repulsionRange
        if (distSq < repulsionRangeSq && distSq > 0.000001) {
          const distance = Math.sqrt(distSq)  // Only sqrt when needed
          const force = this.repulsionStrength * (1 - distance / this.repulsionRange)
          const fx = -(dx / distance) * force
          const fy = -(dy / distance) * force

          node.vx += fx / node.mass
          node.vy += fy / node.mass
        }
      }
    }
  }

  /**
   * Update node position using semi-implicit Euler integration
   * Cursor nodes use target interpolation; other nodes use physics
   * @param {Object} node - Node object
   * @param {number} dt - Delta time
   */
  updateNodePosition(node, dt) {
    // Cursor nodes (with userId) use smooth target interpolation instead of physics
    // This avoids conflict between physics velocity and interpolation
    if (node.userId && node.targetX != null && node.targetY != null) {
      // Calculate distance to target
      const dx = node.targetX - node.x
      const dy = node.targetY - node.y
      const distSquared = dx * dx + dy * dy

      // Skip interpolation if already within sub-pixel distance (0.001 normalized ≈ 1px)
      if (distSquared > 0.000001) {
        // Frame-rate-independent interpolation using linear approximation
        // lerpSpeed = 12 gives ~32% at 30fps, ~19% at 60fps
        // Higher = more responsive, lower = smoother
        const lerpSpeed = 12
        const factor = Math.min(lerpSpeed * dt, 1.0)  // Linear approx, clamped

        node.x += dx * factor
        node.y += dy * factor
      } else {
        // Snap to target when very close
        node.x = node.targetX
        node.y = node.targetY
      }
      return  // Skip physics for cursor nodes
    }

    // Non-cursor nodes (intermediate, trace, background) use physics simulation
    // Apply damping
    node.vx *= this.damping
    node.vy *= this.damping

    // Clamp velocity
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
    if (speed > this.maxVelocity) {
      node.vx = (node.vx / speed) * this.maxVelocity
      node.vy = (node.vy / speed) * this.maxVelocity
    }

    // Update position from physics velocity
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
    // Reject updates for blocked users (ghost node prevention after user-left)
    if (this.blockedUserIds.has(userId)) {
      const blockTime = this.blockedUserIds.get(userId)
      if (Date.now() - blockTime < this.BLOCKED_USER_TTL_MS) {
        return false
      }
      this.blockedUserIds.delete(userId)
    }

    const existing = this.nodes.get(userId)
    let wasNew = false

    if (existing) {
      // Smooth target positions using exponential moving average (EMA)
      // This prevents jitter from rapid gesture sequences in nearby positions
      // Lower smoothFactor = more smoothing (slower response to rapid changes)
      const targetSmoothFactor = 0.25
      existing.targetX = existing.targetX * (1 - targetSmoothFactor) + x * targetSmoothFactor
      existing.targetY = existing.targetY * (1 - targetSmoothFactor) + y * targetSmoothFactor
      existing.color = color
      existing.gestureType = gestureData.type || 'idle'
      existing.isActive = gestureData.isActive || false

      // Rebuild topology when cursor moves (throttled for dynamic trace nodes)
      const now = Date.now()
      if (now - this.lastTopologyRebuildTime > this.topologyRebuildInterval) {
        this.rebuildEdges()
        this.lastTopologyRebuildTime = now
      }
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
      wasNew = true

      // Rebuild edges when node count changes
      this.rebuildEdges()
      this.lastTopologyRebuildTime = Date.now()
    }

    return wasNew
  }

  /**
   * Rebuild edge list based on current nodes using topology generation
   * Generates circuit grid topology with background nodes
   */
  rebuildEdges() {
    // Initialize background nodes on first rebuild
    if (!this.backgroundNodesInitialized) {
      this.initializeBackgroundNodes()
    }

    // Store existing pulses and particles for migration
    const edgeData = new Map()
    for (const edge of this.edges) {
      const key = `${edge.sourceId}-${edge.targetId}`
      edgeData.set(key, {
        pulses: edge.pulses || [],
        particles: edge.particles || []
      })
    }

    // Generate new topology using TopologyGenerator (for cursor-to-cursor connections)
    const topology = this.topologyGenerator.generateTopology(this.nodes)

    // Update intermediate nodes
    this.intermediateNodes.clear()
    for (const node of topology.intermediateNodes) {
      this.intermediateNodes.set(node.id, node)
    }

    // Build edge array
    this.edges = []

    // 1. Add topology edges (cursor-cursor via traces)
    for (const edgeDef of topology.edges) {
      const nodeA = this.getNodeOrIntermediate(edgeDef.sourceId)
      const nodeB = this.getNodeOrIntermediate(edgeDef.targetId)

      if (!nodeA || !nodeB) continue

      // Calculate Bezier control point
      const dx = nodeB.x - nodeA.x
      const dy = nodeB.y - nodeA.y
      const midX = (nodeA.x + nodeB.x) / 2
      const midY = (nodeA.y + nodeB.y) / 2

      // Different curve amounts for different edge types
      let offset = this.controlPointOffset
      if (edgeDef.type === 'trace-trace') {
        offset = this.controlPointOffset * 0.2
      } else if (edgeDef.type === 'cursor-trace') {
        offset = this.controlPointOffset * 0.5
      }

      const controlPoint = {
        x: midX - dy * offset,
        y: midY + dx * offset
      }

      // Restore existing data if available
      const key = `${edgeDef.sourceId}-${edgeDef.targetId}`
      const existingData = edgeData.get(key)

      this.edges.push({
        sourceId: edgeDef.sourceId,
        targetId: edgeDef.targetId,
        type: edgeDef.type,
        strength: edgeDef.strength,
        controlPoint: controlPoint,
        restLength: this.springRestLength * edgeDef.strength,
        stiffness: this.springStiffness * edgeDef.strength,
        pulses: existingData?.pulses || [],
        particles: existingData?.particles || []
      })
    }

    // 2. Add edges connecting cursors to nearby background nodes
    // Use hysteresis to prevent flickering: add at 0.35, keep until 0.5
    const cursorNodes = Array.from(this.nodes.values())
    const addThreshold = 0.35    // Distance to ADD new edge
    const keepThreshold = 0.5   // Distance to KEEP existing edge

    for (const cursor of cursorNodes) {
      for (const [bgId, bgNode] of this.backgroundNodes) {
        const dx = bgNode.x - cursor.x
        const dy = bgNode.y - cursor.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        const key = `${cursor.userId}-${bgId}`
        const existingData = edgeData.get(key)

        // Hysteresis: use different thresholds for adding vs keeping edges
        const shouldHaveEdge = existingData
          ? dist < keepThreshold   // Existing edge: keep until farther away
          : dist < addThreshold    // New edge: only add if very close

        if (shouldHaveEdge) {
          const midX = (cursor.x + bgNode.x) / 2
          const midY = (cursor.y + bgNode.y) / 2

          this.edges.push({
            sourceId: cursor.userId,
            targetId: bgId,
            type: this.EDGE_TYPES.SECONDARY,
            strength: 0.6,
            controlPoint: {
              x: midX - dy * this.controlPointOffset * 0.3,
              y: midY + dx * this.controlPointOffset * 0.3
            },
            restLength: this.springRestLength * 0.6,
            stiffness: this.springStiffness * 0.6,
            pulses: existingData?.pulses || [],
            particles: existingData?.particles || []
          })
        }
      }
    }

    // 3. Add edges between nearby background nodes (with hysteresis)
    const bgArray = Array.from(this.backgroundNodes.values())
    const tertiaryAddThreshold = 0.2     // Distance to ADD new TERTIARY edge
    const tertiaryKeepThreshold = 0.3    // Distance to KEEP existing TERTIARY edge

    for (let i = 0; i < bgArray.length; i++) {
      for (let j = i + 1; j < bgArray.length; j++) {
        const nodeA = bgArray[i]
        const nodeB = bgArray[j]
        const dx = nodeB.x - nodeA.x
        const dy = nodeB.y - nodeA.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        const key = `${nodeA.id}-${nodeB.id}`
        const existingData = edgeData.get(key)

        // Hysteresis: use different thresholds for adding vs keeping TERTIARY edges
        const shouldHaveEdge = existingData
          ? dist < tertiaryKeepThreshold   // Existing edge: keep until farther away
          : dist < tertiaryAddThreshold    // New edge: only add if very close

        if (shouldHaveEdge) {
          const midX = (nodeA.x + nodeB.x) / 2
          const midY = (nodeA.y + nodeB.y) / 2

          this.edges.push({
            sourceId: nodeA.id,
            targetId: nodeB.id,
            type: this.EDGE_TYPES.TERTIARY,
            strength: 0.4,
            controlPoint: {
              x: midX - dy * this.controlPointOffset * 0.1,
              y: midY + dx * this.controlPointOffset * 0.1
            },
            restLength: this.springRestLength * 0.4,
            stiffness: 0,
            pulses: existingData?.pulses || [],
            particles: existingData?.particles || []
          })
        }
      }
    }

    // DEBUG: Log final edge state
    const cursorTraceEdges = this.edges.filter(e => e.type === 'cursor-trace')
    // console.log('🕸️ Final edges:', {
//      totalEdges: this.edges.length,
//      cursorTraceEdges: cursorTraceEdges.length,
//      cursorTraceSources: cursorTraceEdges.map(e => e.sourceId.substring(0, 8))
////    })
  }

  /**
   * Remove a node and rebuild edges
   * @param {string} userId - User identifier to remove
   */
  removeNode(userId) {
    this.blockedUserIds.set(userId, Date.now())
    this.nodes.delete(userId)
    this.rebuildEdges()
  }

  /**
   * Unblock a user, allowing their node to be recreated (e.g., when they rejoin)
   * @param {string} userId - User identifier to unblock
   */
  unblockUser(userId) {
    this.blockedUserIds.delete(userId)
  }

  /**
   * Clear all blocked users (e.g., on room transition)
   */
  clearBlockedUsers() {
    this.blockedUserIds.clear()
  }

  /**
   * Get node from cursor nodes, intermediate nodes, or background nodes
   * @param {string} id - Node identifier
   * @returns {Object|null} Node object or null
   */
  getNodeOrIntermediate(id) {
    if (this.nodes.has(id)) return this.nodes.get(id)
    if (this.intermediateNodes.has(id)) return this.intermediateNodes.get(id)
    if (this.backgroundNodes.has(id)) return this.backgroundNodes.get(id)
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
    // AUDIO PRIORITY: Simplify or skip TERTIARY edges under stress
    const stressFactor = window.visualService?.stressFactor ?? 1.0

    // Draw edges first (behind nodes)
    for (const edge of this.edges) {
      if (edge.type === this.EDGE_TYPES.TERTIARY) {
        if (stressFactor < 0.5) continue  // Skip entirely under high stress
        if (stressFactor < 0.7) {
          this.renderSimpleLine(p, edge)  // Single line instead of gradient Bezier
          continue
        }
      }
      this.renderEdge(p, edge)
    }

    // Draw background nodes (subtle)
    for (const node of this.backgroundNodes.values()) {
      this.renderBackgroundNode(p, node)
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
    const nodeA = this.getNodeOrIntermediate(edge.sourceId)
    const nodeB = this.getNodeOrIntermediate(edge.targetId)

    if (!nodeA || !nodeB) return

    // OPTIMIZATION: Viewport culling - skip if BOTH endpoints are off-screen (Phase 2)
    // Normalized coordinates [0,1], margin in normalized space
    const margin = 50 / Math.max(p.width, p.height)
    const aOffScreen = nodeA.x < -margin || nodeA.x > 1 + margin ||
                       nodeA.y < -margin || nodeA.y > 1 + margin
    const bOffScreen = nodeB.x < -margin || nodeB.x > 1 + margin ||
                       nodeB.y < -margin || nodeB.y > 1 + margin

    // Skip only if BOTH endpoints are off-screen (edge might still be visible if one is on-screen)
    if (aOffScreen && bOffScreen) {
      return
    }

    // Convert normalized coordinates to canvas pixels
    const x1 = nodeA.x * p.width
    const y1 = nodeA.y * p.height
    const cx = edge.controlPoint.x * p.width
    const cy = edge.controlPoint.y * p.height
    const x2 = nodeB.x * p.width
    const y2 = nodeB.y * p.height

    // Determine visual properties based on edge type
    let thickness, alphaMultiplier, baseColor

    // Check if edge has energy (pulses or particles)
    const hasEnergy = (edge.pulses && edge.pulses.length > 0) ||
                      (edge.particles && edge.particles.length > 0) ||
                      (nodeA.energyLevel && nodeA.energyLevel > 0) ||
                      (nodeB.energyLevel && nodeB.energyLevel > 0)

    if (edge.type === this.EDGE_TYPES.PRIMARY) {
      // Cursor-to-cursor: bright and thick
      thickness = this.EDGE_CONFIG.activeThickness
      alphaMultiplier = 0.7
    } else if (edge.type === this.EDGE_TYPES.SECONDARY) {
      // Cursor-to-background: medium visibility, glow when energy flows
      thickness = hasEnergy ? 2.5 : 1.5
      alphaMultiplier = hasEnergy ? 0.6 : 0.3
    } else if (edge.type === this.EDGE_TYPES.TERTIARY) {
      // Background-to-background: subtle but visible, brighter with energy
      thickness = hasEnergy ? 2 : 1
      alphaMultiplier = hasEnergy ? 0.4 : 0.12
    } else {
      // Original edge types (cursor-trace, trace-trace)
      thickness = (nodeA.isActive || nodeB.isActive)
        ? this.EDGE_CONFIG.activeThickness
        : this.EDGE_CONFIG.idleThickness
      alphaMultiplier = 1.0
    }

    p.strokeWeight(thickness)
    p.noFill()

    // Use gray color for background edges, node colors for cursor edges
    if (edge.type === this.EDGE_TYPES.SECONDARY || edge.type === this.EDGE_TYPES.TERTIARY) {
      // Subtle gray-blue for background edges
      this.drawGradientCurve(p, x1, y1, cx, cy, x2, y2, '#808090', '#808090', alphaMultiplier)
    } else {
      this.drawGradientCurve(p, x1, y1, cx, cy, x2, y2, nodeA.color, nodeB.color, alphaMultiplier)
    }
  }

  /**
   * AUDIO PRIORITY: Render edge as a single straight line (1 canvas call instead of 14)
   * Used for TERTIARY edges under moderate stress to preserve audio scheduling headroom
   * @param {p5} p - p5.js instance
   * @param {Object} edge - Edge object
   */
  renderSimpleLine(p, edge) {
    const nodeA = this.getNodeOrIntermediate(edge.sourceId)
    const nodeB = this.getNodeOrIntermediate(edge.targetId)
    if (!nodeA || !nodeB) return

    // Viewport culling (same as renderEdge)
    const margin = 50 / Math.max(p.width, p.height)
    if ((nodeA.x < -margin || nodeA.x > 1 + margin || nodeA.y < -margin || nodeA.y > 1 + margin) &&
        (nodeB.x < -margin || nodeB.x > 1 + margin || nodeB.y < -margin || nodeB.y > 1 + margin)) {
      return
    }

    p.stroke(128, 128, 144, 25)
    p.strokeWeight(1)
    p.line(nodeA.x * p.width, nodeA.y * p.height, nodeB.x * p.width, nodeB.y * p.height)
  }

  /**
   * Draw gradient curve using segmented approach
   * @param {p5} p - p5.js instance
   * @param {number} x1, y1 - Start point
   * @param {number} cx, cy - Control point
   * @param {number} x2, y2 - End point
   * @param {string} color1, color2 - Gradient colors
   * @param {number} alphaMultiplier - Alpha multiplier (default 1.0)
   */
  drawGradientCurve(p, x1, y1, cx, cy, x2, y2, color1, color2, alphaMultiplier = 1.0) {
    const segments = this.curveSegments
    const rgb1 = this.hexToRgbArray(color1, this._rgbBuffer1)
    const rgb2 = this.hexToRgbArray(color2, this._rgbBuffer2)

    // OPTIMIZATION: Use precomputed Bezier basis functions (eliminates 80 Math.pow calls per edge)
    const basis = this.bezierBasisCache

    for (let i = 0; i < segments; i++) {
      const curr = basis[i]
      const next = basis[i + 1]

      // OPTIMIZATION: Direct multiplication using cached basis functions (NO Math.pow)
      const px1 = curr.b0 * x1 + curr.b1 * cx + curr.b2 * x2
      const py1 = curr.b0 * y1 + curr.b1 * cy + curr.b2 * y2
      const px2 = next.b0 * x1 + next.b1 * cx + next.b2 * x2
      const py2 = next.b0 * y1 + next.b1 * cy + next.b2 * y2

      // OPTIMIZATION: Use cached t value and bitwise OR for fast integer conversion
      const t = curr.colorT
      const r = (lerp(rgb1[0], rgb2[0], t) + 0.5) | 0  // Round then bitwise
      const g = (lerp(rgb1[1], rgb2[1], t) + 0.5) | 0
      const b = (lerp(rgb1[2], rgb2[2], t) + 0.5) | 0
      const alpha = (lerp(this.EDGE_CONFIG.minAlpha, this.EDGE_CONFIG.maxAlpha, t) * alphaMultiplier + 0.5) | 0

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
    } else if (node.gestureType === 'hold' || node.gestureType === 'sequencer') {
      // Pulsing animation for holds and sequencer activity (sine wave)
      const pulse = Math.sin(p.millis() * this.NODE_CONFIG.holdPulseSpeed) * 5
      size = (this.NODE_CONFIG.holdPulseMin + this.NODE_CONFIG.holdPulseMax) / 2 + pulse
    }

    // Draw glow for active nodes (respects graphics quality setting)
    if (node.isActive && this._shadowBlurEnabled) {
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

    // User label below the node
    if (node.userId) {
      const label = node.userId.substring(0, 8)
      p.fill(node.color)
      p.textAlign(p.CENTER, p.TOP)
      p.textSize(10)
      p.text(label, x, y + size / 2 + 4)
    }
  }

  /**
   * Render intermediate node (trace nodes)
   * @param {p5} p - p5.js instance
   * @param {Object} node - Node object
   */
  renderIntermediateNode(p, node) {
    const x = node.x * p.width
    const y = node.y * p.height

    // Trace nodes: subtle, smaller with reduced opacity
    const baseSize = this.topologyGenerator.traceTopology?.nodeSize || 6
    const size = baseSize * 0.5  // Halved size

    // Parse hex color and apply half opacity
    const rgb = this.hexToRgbArray(node.color, this._rgbBufferTemp)
    const alpha = 127  // Half opacity (255 / 2)

    p.noStroke()
    p.fill(rgb[0], rgb[1], rgb[2], alpha)
    p.circle(x, y, size)

    // Pad ring - subtle
    p.stroke(rgb[0], rgb[1], rgb[2], alpha * 0.6)
    p.strokeWeight(0.5)
    p.noFill()
    p.circle(x, y, size * 2.5)
  }

  /**
   * Render background node (subtle, only visible when energy flows)
   * OPTIMIZATION: Viewport culling to skip off-screen nodes (Phase 2)
   * @param {p5} p - p5.js instance
   * @param {Object} node - Background node object
   */
  renderBackgroundNode(p, node) {
    // OPTIMIZATION: Viewport culling with 50px margin
    // Normalized coordinates [0,1], so convert margin to normalized space
    const margin = 50 / Math.max(p.width, p.height)
    if (node.x < -margin || node.x > 1 + margin ||
        node.y < -margin || node.y > 1 + margin) {
      return  // Skip off-screen nodes
    }

    const x = node.x * p.width
    const y = node.y * p.height

    // Decay energy level
    if (node.energyLevel > 0) {
      node.energyLevel *= 0.98
      if (node.energyLevel < 0.01) node.energyLevel = 0
    }

    // Background nodes visible by default, brighter with energy
    const size = 5 + node.energyLevel * 8
    const alpha = 40 + node.energyLevel * 180

    p.noStroke()
    p.fill(100, 100, 120, alpha)
    p.circle(x, y, size)
  }

  /**
   * Helper: Linear interpolation
   */
  lerp(a, b, t) {
    return a + (b - a) * t
  }

  /**
   * Helper: Convert hex to RGB array
   * AUDIO PRIORITY: Accepts optional pre-allocated buffer to eliminate GC pressure
   * @param {string} hex - Hex color string
   * @param {Array} [buffer] - Optional pre-allocated [r,g,b] array to reuse
   * @returns {Array} RGB array [r, g, b]
   */
  hexToRgbArray(hex, buffer) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (result) {
      const target = buffer || [0, 0, 0]
      target[0] = parseInt(result[1], 16)
      target[1] = parseInt(result[2], 16)
      target[2] = parseInt(result[3], 16)
      return target
    }
    if (buffer) {
      buffer[0] = 255; buffer[1] = 255; buffer[2] = 255
      return buffer
    }
    return [255, 255, 255]
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
    this.blockedUserIds.clear()
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.clear()
    if (this._blockCleanupInterval) {
      clearInterval(this._blockCleanupInterval)
      this._blockCleanupInterval = null
    }
  }
}

/**
 * OPTIMIZATION: Spatial Hash Grid for efficient collision detection
 * Reduces O(n²) brute-force checks to O(n) by partitioning space
 * Uses 3×3 cell search to safely handle nodes at grid boundaries
 */
class SpatialHashGrid {
  constructor(cellSize = 0.25) {
    this.cellSize = cellSize
    this.grid = new Map()  // Key: "x,y", Value: [node1, node2, ...]
  }

  /**
   * Get grid cell key for normalized coordinates
   * @param {number} x - Normalized x coordinate [0, 1]
   * @param {number} y - Normalized y coordinate [0, 1]
   * @returns {string} Cell key
   */
  getCellKey(x, y) {
    // Floor to handle boundaries consistently
    const cx = Math.floor(x / this.cellSize)
    const cy = Math.floor(y / this.cellSize)
    return `${cx},${cy}`
  }

  /**
   * Insert a node into the grid
   * @param {Object} node - Node with x, y properties
   */
  insert(node) {
    // DEFENSIVE FIX: Clamp coordinates to [0,1] to prevent negative cell indices
    const x = Math.max(0, Math.min(1, node.x))
    const y = Math.max(0, Math.min(1, node.y))
    const key = this.getCellKey(x, y)
    if (!this.grid.has(key)) {
      this.grid.set(key, [])
    }
    this.grid.get(key).push(node)
  }

  /**
   * Get all nearby nodes within search radius
   * CRITICAL: Uses 3×3 cell search to handle boundary cases (x/y = 0.0, 0.5, 1.0)
   * @param {number} x - Normalized x coordinate
   * @param {number} y - Normalized y coordinate
   * @returns {Array} Array of nearby nodes
   */
  getNearby(x, y) {
    // DEFENSIVE FIX: Clamp coordinates to [0,1] to prevent negative cell indices
    const clampedX = Math.max(0, Math.min(1, x))
    const clampedY = Math.max(0, Math.min(1, y))
    const cx = Math.floor(clampedX / this.cellSize)
    const cy = Math.floor(clampedY / this.cellSize)
    const nearby = []

    // Check 3×3 grid around cell (includes all adjacent cells + diagonals)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cx + dx},${cy + dy}`
        const cell = this.grid.get(key)
        if (cell) nearby.push(...cell)
      }
    }
    return nearby
  }

  /**
   * Clear the grid
   */
  clear() {
    this.grid.clear()
  }
}

// Export for different module systems
if (typeof window !== 'undefined') {
  window.SpringMeshNetwork = SpringMeshNetwork
  window.SpatialHashGrid = SpatialHashGrid
  // console.log('✅ SpringMeshNetwork exported to window')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpringMeshNetwork
}
