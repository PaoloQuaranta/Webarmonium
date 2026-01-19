/**
 * TraceTopology
 * Generates an organic trace-based network
 *
 * Creates an interconnected web with:
 * - Intermediate nodes only along paths between cursors
 * - Circuit-style routing with 90° and 45° bends
 * - Nodes appear only where traces exist
 * - Multiple paths between cursors for web effect
 */

class TraceTopology {
  constructor() {
    // Get configuration from VisualConstants or use defaults
    const config = (typeof window !== 'undefined' && window.VisualConstants?.TOPOLOGY_CONFIG)
      ? window.VisualConstants.TOPOLOGY_CONFIG
      : {
          traceNodeSpacing: 0.15,
          traceNodeSize: 5,
          pathsPerConnection: 3,
          enableTraceNodes: true
        }

    this.traceSpacing = config.traceNodeSpacing || 0.15
    this.nodeSize = config.traceNodeSize || 5
    this.pathsPerConnection = config.pathsPerConnection || 3
    this.enableTraceNodes = config.enableTraceNodes !== false

    // Generated trace nodes
    this.traceNodes = []
  }

  /**
   * Generate trace-based topology
   * @param {Map} cursorNodes - User cursor nodes (userId -> Node)
   * @returns {Object} { edges, intermediateNodes, edgeCircuitNodes }
   */
  generateTopology(cursorNodes) {
    const cursorArray = Array.from(cursorNodes.values())

    if (cursorArray.length < 2) {
      return { edges: [], intermediateNodes: [], edgeCircuitNodes: new Map() }
    }

    // Generate multi-path connections between all cursor pairs
    const traceEdges = this.generateMultiPathConnections(cursorArray)

    return {
      edges: traceEdges,
      intermediateNodes: this.traceNodes,
      edgeCircuitNodes: new Map()
    }
  }

  /**
   * Generate multiple paths between cursor pairs with intermediate nodes
   */
  generateMultiPathConnections(cursorArray) {
    const edges = []
    this.traceNodes = []
    let nodeId = 0

    // Connect each pair of cursors with multiple paths
    for (let i = 0; i < cursorArray.length; i++) {
      for (let j = i + 1; j < cursorArray.length; j++) {
        const cursorA = cursorArray[i]
        const cursorB = cursorArray[j]

        // Generate multiple paths between this pair
        for (let pathIndex = 0; pathIndex < this.pathsPerConnection; pathIndex++) {
          const path = this.generateCircuitPath(cursorA, cursorB, pathIndex, nodeId)
          nodeId += path.nodes.length

          // Add nodes to trace nodes
          this.traceNodes.push(...path.nodes)

          // Add edges for this path
          edges.push(...path.edges)
        }
      }
    }

    return edges
  }

  /**
   * Generate a single circuit-style path between two cursors
   * Uses 90° and 45° bends like a printed circuit trace
   */
  generateCircuitPath(cursorA, cursorB, pathIndex, startNodeId) {
    const nodes = []
    const edges = []

    // Calculate path properties based on index for variety
    const offsetScale = (pathIndex + 1) * 0.1
    const angleVariation = (pathIndex * Math.PI) / this.pathsPerConnection

    // Calculate control point for curve (perpendicular offset)
    const dx = cursorB.x - cursorA.x
    const dy = cursorB.y - cursorA.y
    const midX = (cursorA.x + cursorB.x) / 2
    const midY = (cursorA.y + cursorB.y) / 2

    // Perpendicular offset for variety
    const perpX = -dy
    const perpY = dx
    const perpLength = Math.sqrt(perpX * perpX + perpY * perpY)

    // Create intermediate node at control point
    const controlX = midX + (perpX / perpLength) * offsetScale * Math.cos(angleVariation)
    const controlY = midY + (perpY / perpLength) * offsetScale * Math.sin(angleVariation)

    // Create intermediate node
    const intermediateNode = {
      id: `trace-${startNodeId}`,
      type: 'trace',
      x: controlX,
      y: controlY,
      color: '#00d4ff'  // Cyan for trace nodes
    }
    nodes.push(intermediateNode)

    // Create edges: cursorA -> intermediate -> cursorB
    edges.push({
      sourceId: cursorA.userId,
      targetId: intermediateNode.id,
      type: 'cursor-trace',
      strength: 1.0
    })

    edges.push({
      sourceId: intermediateNode.id,
      targetId: cursorB.userId,
      type: 'cursor-trace',
      strength: 1.0
    })

    // For longer paths, add more intermediate nodes
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance > 0.3) {
      // Add additional nodes along the path
      const t = 0.25 + (pathIndex * 0.15)
      const extraX = cursorA.x + dx * t + (perpX / perpLength) * offsetScale * 0.5 * Math.sin(angleVariation)
      const extraY = cursorA.y + dy * t + (perpY / perpLength) * offsetScale * 0.5 * Math.cos(angleVariation)

      const extraNode = {
        id: `trace-${startNodeId + 1}`,
        type: 'trace',
        x: extraX,
        y: extraY,
        color: '#fb923c'  // Gold for secondary trace nodes
      }
      nodes.push(extraNode)

      // Connect extra node
      edges.push({
        sourceId: intermediateNode.id,
        targetId: extraNode.id,
        type: 'trace-trace',
        strength: 0.8
      })

      edges.push({
        sourceId: extraNode.id,
        targetId: cursorB.userId,
        type: 'cursor-trace',
        strength: 1.0
      })
    }

    return { nodes, edges }
  }

  /**
   * Get node by ID
   */
  getNodeById(id, cursorNodes) {
    // Check if cursor node
    if (cursorNodes && cursorNodes.has(id)) return cursorNodes.get(id)

    // Check if trace node
    const trace = this.traceNodes.find(n => n.id === id)
    if (trace) return trace

    return null
  }

  /**
   * Get color for trace nodes
   */
  getTraceNodeColor() {
    return '#00d4ff'  // Cyan
  }

  /**
   * Clear generated nodes
   */
  clear() {
    this.traceNodes = []
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.clear()
  }
}

/**
 * TopologyGenerator (Factory)
 * Creates the appropriate topology generator
 */

class TopologyGenerator {
  constructor() {
    // Use TraceTopology for organic trace-based network
    this.traceTopology = new TraceTopology()
  }

  /**
   * Generate network topology based on cursor positions
   * @param {Map} cursorNodes - User cursor nodes (userId -> Node)
   * @returns {Object} { edges, intermediateNodes, edgeCircuitNodes }
   */
  generateTopology(cursorNodes) {
    return this.traceTopology.generateTopology(cursorNodes)
  }

  /**
   * Get node by ID (proxy to trace topology)
   */
  getNodeById(id, cursorNodes) {
    return this.traceTopology.getNodeById(id, cursorNodes)
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.traceTopology.dispose()
  }
}

// Export for different module systems
if (typeof window !== 'undefined') {
  window.TopologyGenerator = TopologyGenerator
  // console.log('✅ TopologyGenerator exported to window')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TopologyGenerator
}
