/**
 * TopologyGenerator
 * Generates dynamic network topology with multiple connection paths
 *
 * Creates a web-like pattern with:
 * - Multiple curved paths between each cursor pair
 * - Intermediate nodes along paths (circuit aesthetic)
 * - Complex network resembling spiderweb/circuit board
 *
 * Edge Types:
 * - cursor-cursor: Physics-enabled, carries pulses/particles
 * - Multiple edges per cursor pair with different control points
 */

class TopologyGenerator {
  constructor() {
    // Get configuration from VisualConstants or use defaults
    const config = (typeof window !== 'undefined' && window.VisualConstants?.TOPOLOGY_CONFIG)
      ? window.VisualConstants.TOPOLOGY_CONFIG
      : {
          proximityThreshold: 0.4,
          radialRingCount: 3,
          nodesPerRing: 8,
          circuitNodeSpacing: 0.15,
          radialNodeSize: 4,
          circuitNodeSize: 3,
          enableRadialNodes: true,
          enableCircuitNodes: true
        }

    this.proximityThreshold = config.proximityThreshold
    this.radialRingCount = config.radialRingCount
    this.nodesPerRing = config.nodesPerRing
    this.circuitNodeSpacing = config.circuitNodeSpacing
    this.radialNodeSize = config.radialNodeSize
    this.circuitNodeSize = config.circuitNodeSize
    this.enableRadialNodes = false  // DISABLE radial nodes (user doesn't want them)
    this.enableCircuitNodes = config.enableCircuitNodes
    this.pathsPerPair = 3  // Number of different paths between each cursor pair

    // Generated node storage
    this.radialNodes = []
    this.circuitNodes = []
    this.webNodes = []  // New: intermediate nodes for web pattern

    // Initialize radial pattern (disabled but kept for compatibility)
    this.updateRadialNodes()
  }

  /**
   * Generate network topology based on cursor positions
   * Creates multiple curved paths between each cursor pair for web effect
   * @param {Map} cursorNodes - User cursor nodes (userId -> Node)
   * @returns {Object} { edges, intermediateNodes, edgeCircuitNodes }
   */
  generateTopology(cursorNodes) {
    // Generate multiple paths between each cursor pair
    const cursorEdges = this.generateMultiPathEdges(cursorNodes)

    // Generate intermediate nodes along each path
    const circuitData = this.enableCircuitNodes
      ? this.generateCircuitNodes(cursorEdges, cursorNodes)
      : { nodes: [], edgeMapping: new Map() }

    // No radial nodes (user doesn't want them)
    return {
      edges: cursorEdges,
      intermediateNodes: circuitData.nodes,
      edgeCircuitNodes: circuitData.edgeMapping
    }
  }

  /**
   * Update radial node positions (mandala pattern)
   * Creates concentric rings from screen center
   */
  updateRadialNodes() {
    this.radialNodes = []
    if (!this.enableRadialNodes) return

    const centerX = 0.5
    const centerY = 0.5

    for (let ring = 1; ring <= this.radialRingCount; ring++) {
      const radius = ring * 0.2  // 0.2, 0.4, 0.6 from center (stay within canvas)
      const nodeCount = this.nodesPerRing * ring  // More nodes in outer rings

      for (let i = 0; i < nodeCount; i++) {
        const angle = (Math.PI * 2 / nodeCount) * i

        // Add slight offset for organic feel
        const angleOffset = (ring % 2 === 0) ? (Math.PI / nodeCount) : 0

        this.radialNodes.push({
          id: `radial-${ring}-${i}`,
          type: 'radial',
          x: centerX + Math.cos(angle + angleOffset) * radius,
          y: centerY + Math.sin(angle + angleOffset) * radius,
          ring: ring,
          angle: angle + angleOffset,
          color: this.getRadialNodeColor(ring)
        })
      }
    }
  }

  /**
   * Generate multiple curved paths between ALL cursor pairs
   * Creates a web-like pattern with several different curves per pair
   * @param {Map} cursorNodes - User cursor nodes
   * @returns {Array} Array of edge objects
   */
  generateMultiPathEdges(cursorNodes) {
    const edges = []
    const cursorArray = Array.from(cursorNodes.values())

    for (let i = 0; i < cursorArray.length; i++) {
      for (let j = i + 1; j < cursorArray.length; j++) {
        const nodeA = cursorArray[i]
        const nodeB = cursorArray[j]

        // Create multiple paths between each cursor pair
        for (let pathIndex = 0; pathIndex < this.pathsPerPair; pathIndex++) {
          edges.push({
            sourceId: nodeA.userId,
            targetId: nodeB.userId,
            type: 'cursor-cursor',
            pathIndex: pathIndex,  // Which path of the pair
            strength: 1.0 - (pathIndex * 0.2),  // Slightly weaker for alternate paths
            controlPointOffset: (pathIndex - 1) * 0.15  // Different curve for each path
          })
        }
      }
    }

    return edges
  }

  /**
   * Generate edges between cursors and radial nodes
   * Creates spiderweb pattern
   * @param {Map} cursorNodes - User cursor nodes
   * @returns {Array} Array of edge objects
   */
  generateRadialEdges(cursorNodes) {
    const edges = []

    // Connect cursors to nearest radial nodes
    for (const cursor of cursorNodes.values()) {
      // Calculate distances to all radial nodes
      const radialDistances = this.radialNodes.map(radial => ({
        node: radial,
        distance: Math.sqrt(
          Math.pow(cursor.x - radial.x, 2) +
          Math.pow(cursor.y - radial.y, 2)
        )
      }))

      // Sort by distance and connect to nearest 3-5
      radialDistances.sort((a, b) => a.distance - b.distance)
      const connectionCount = Math.min(5, Math.max(3, Math.min(this.radialNodes.length, 8)))

      for (let i = 0; i < connectionCount; i++) {
        edges.push({
          sourceId: cursor.userId,
          targetId: radialDistances[i].node.id,
          type: 'cursor-radial',
          strength: 0.5
        })
      }
    }

    // Connect radial nodes in rings (mandala pattern)
    for (let ring = 1; ring <= this.radialRingCount; ring++) {
      const ringNodes = this.radialNodes.filter(n => n.ring === ring)
      for (let i = 0; i < ringNodes.length; i++) {
        const nextIndex = (i + 1) % ringNodes.length
        edges.push({
          sourceId: ringNodes[i].id,
          targetId: ringNodes[nextIndex].id,
          type: 'radial-ring',
          strength: 0.3
        })
      }
    }

    return edges
  }

  /**
   * Generate decorative circuit nodes along edges
   * Creates printed circuit board aesthetic
   * @param {Array} edges - Array of edge objects
   * @param {Map} cursorNodes - User cursor nodes for reference
   * @returns {Object} { nodes: [], edgeMapping: Map }
   */
  generateCircuitNodes(edges, cursorNodes) {
    const circuitNodes = []
    const edgeMapping = new Map()  // edgeId -> [circuitNodeIds]

    for (const edge of edges) {
      const edgeId = `${edge.sourceId}-${edge.targetId}`
      const nodeA = this.getNodeById(edge.sourceId, cursorNodes)
      const nodeB = this.getNodeById(edge.targetId, cursorNodes)

      if (!nodeA || !nodeB) continue

      // Calculate number of circuit nodes based on edge length
      const distance = Math.sqrt(
        Math.pow(nodeB.x - nodeA.x, 2) +
        Math.pow(nodeB.y - nodeA.y, 2)
      )

      const nodeCount = Math.floor(distance / this.circuitNodeSpacing)

      const edgeCircuitNodes = []

      for (let i = 1; i < nodeCount; i++) {
        const t = i / nodeCount
        const circuitNodeId = `circuit-${edgeId}-${i}`

        circuitNodes.push({
          id: circuitNodeId,
          type: 'circuit',
          x: nodeA.x + (nodeB.x - nodeA.x) * t,
          y: nodeA.y + (nodeB.y - nodeA.y) * t,
          edgeId: edgeId,
          t: t,
          color: this.getCircuitNodeColor()
        })

        edgeCircuitNodes.push(circuitNodeId)
      }

      edgeMapping.set(edgeId, edgeCircuitNodes)
    }

    return {
      nodes: circuitNodes,
      edgeMapping: edgeMapping
    }
  }

  /**
   * Get node by ID from cursor nodes or generated radial nodes
   * @param {string} id - Node ID
   * @param {Map} cursorNodes - User cursor nodes
   * @returns {Object|null} Node object or null
   */
  getNodeById(id, cursorNodes) {
    // Check if cursor node
    if (cursorNodes && cursorNodes.has(id)) return cursorNodes.get(id)

    // Check if radial node
    const radial = this.radialNodes.find(n => n.id === id)
    if (radial) return radial

    // Check if circuit node
    const circuit = this.circuitNodes.find(n => n.id === id)
    if (circuit) return circuit

    return null
  }

  /**
   * Get color for radial nodes (bright, visible)
   * @param {number} ring - Ring number
   * @returns {string} Hex color
   */
  getRadialNodeColor(ring) {
    // Bright cyan-teal colors for different rings - very visible
    const colors = ['#00ffff', '#00cccc', '#009999', '#00ffff']
    return colors[(ring - 1) % colors.length]
  }

  /**
   * Get color for circuit nodes (bright gold)
   * @returns {string} Hex color
   */
  getCircuitNodeColor() {
    return '#ffd700'  // Bright gold, very visible
  }

  /**
   * Get all intermediate nodes
   * @returns {Array} Array of intermediate node objects
   */
  getIntermediateNodes() {
    return [...this.radialNodes, ...this.circuitNodes]
  }

  /**
   * Clear generated nodes
   */
  clear() {
    this.radialNodes = []
    this.circuitNodes = []
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
  window.TopologyGenerator = TopologyGenerator
  console.log('✅ TopologyGenerator exported to window')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TopologyGenerator
}
