/**
 * CircuitGridTopology
 * Generates a circuit-board style grid network
 *
 * Creates an interconnected web with:
 * - Grid of nodes at regular intervals
 * - 90° and 45° connections between grid nodes
 * - Cursors connect to nearest grid points
 * - Particles and pulses travel through the grid network
 */

class CircuitGridTopology {
  constructor() {
    // Get configuration from VisualConstants or use defaults
    const config = (typeof window !== 'undefined' && window.VisualConstants?.TOPOLOGY_CONFIG)
      ? window.VisualConstants.TOPOLOGY_CONFIG
      : {
          circuitNodeSpacing: 0.08,
          circuitNodeSize: 6,
          enableCircuitNodes: true
        }

    this.gridSpacing = config.circuitNodeSpacing || 0.08  // Grid cell size
    this.nodeSize = config.circuitNodeSize || 6
    this.enableCircuitNodes = config.enableCircuitNodes !== false

    // Generated grid nodes
    this.gridNodes = []
  }

  /**
   * Generate circuit board grid topology
   * @param {Map} cursorNodes - User cursor nodes (userId -> Node)
   * @returns {Object} { edges, intermediateNodes, edgeCircuitNodes }
   */
  generateTopology(cursorNodes) {
    // 1. Generate grid of nodes across the canvas
    this.generateGridNodes(cursorNodes)

    // 2. Generate grid connections (90° and 45°)
    const gridEdges = this.generateGridConnections()

    // 3. Connect cursors to nearest grid nodes
    const cursorEdges = this.connectCursorsToGrid(cursorNodes)

    // 4. Combine all edges
    const allEdges = [...gridEdges, ...cursorEdges]

    return {
      edges: allEdges,
      intermediateNodes: this.gridNodes,
      edgeCircuitNodes: new Map()  // Not needed for grid
    }
  }

  /**
   * Generate grid nodes at regular intervals
   * Creates a circuit board style layout
   */
  generateGridNodes(cursorNodes) {
    this.gridNodes = []

    // Calculate grid dimensions
    const cols = Math.floor(1 / this.gridSpacing)
    const rows = Math.floor(1 / this.gridSpacing)

    let nodeId = 0

    // Create grid nodes
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= cols; col++) {
        const x = col * this.gridSpacing
        const y = row * this.gridSpacing

        this.gridNodes.push({
          id: `grid-${nodeId++}`,
          type: 'grid',
          x: Math.min(1, Math.max(0, x)),
          y: Math.min(1, Math.max(0, y)),
          row: row,
          col: col,
          color: '#4a5568'  // Subtle gray-blue for grid
        })
      }
    }
  }

  /**
   * Generate connections between grid nodes
   * Creates 90° (adjacent) and 45° (diagonal) connections
   */
  generateGridConnections() {
    const edges = []

    // Create a map for quick node lookup
    const nodeMap = new Map()
    for (const node of this.gridNodes) {
      const key = `${node.row}-${node.col}`
      nodeMap.set(key, node)
    }

    // Connect adjacent and diagonal nodes
    for (const node of this.gridNodes) {
      // 90° connections (up, down, left, right)
      const adjacent = [
        { row: node.row - 1, col: node.col },     // up
        { row: node.row + 1, col: node.col },     // down
        { row: node.row, col: node.col - 1 },     // left
        { row: node.row, col: node.col + 1 }      // right
      ]

      for (const pos of adjacent) {
        const key = `${pos.row}-${pos.col}`
        const targetNode = nodeMap.get(key)
        if (targetNode) {
          edges.push({
            sourceId: node.id,
            targetId: targetNode.id,
            type: 'grid-connection',
            strength: 0.8
          })
        }
      }

      // 45° connections (diagonals) - only some of them for circuit pattern
      if ((node.row + node.col) % 2 === 0) {  // Every other node
        const diagonals = [
          { row: node.row - 1, col: node.col - 1 },  // up-left
          { row: node.row - 1, col: node.col + 1 },  // up-right
          { row: node.row + 1, col: node.col - 1 },  // down-left
          { row: node.row + 1, col: node.col + 1 }   // down-right
        ]

        for (const pos of diagonals) {
          const key = `${pos.row}-${pos.col}`
          const targetNode = nodeMap.get(key)
          if (targetNode && node.id < targetNode.id) {  // Avoid duplicates
            edges.push({
              sourceId: node.id,
              targetId: targetNode.id,
              type: 'grid-connection',
              strength: 0.6  // Slightly weaker for diagonals
            })
          }
        }
      }
    }

    return edges
  }

  /**
   * Connect cursors to nearest grid nodes
   * Creates multiple connections per cursor for web effect
   */
  connectCursorsToGrid(cursorNodes) {
    const edges = []

    for (const cursor of cursorNodes.values()) {
      // Find nearest grid nodes
      const distances = this.gridNodes.map(gridNode => ({
        node: gridNode,
        distance: Math.sqrt(
          Math.pow(cursor.x - gridNode.x, 2) +
          Math.pow(cursor.y - gridNode.y, 2)
        )
      }))

      // Sort by distance and connect to nearest 3-5 nodes
      distances.sort((a, b) => a.distance - b.distance)
      const connectionCount = Math.min(5, Math.max(3, distances.length))

      for (let i = 0; i < connectionCount; i++) {
        edges.push({
          sourceId: cursor.userId,
          targetId: distances[i].node.id,
          type: 'cursor-grid',
          strength: 1.0 - (i * 0.15)  // Stronger for closer nodes
        })
      }
    }

    return edges
  }

  /**
   * Get node by ID
   */
  getNodeById(id, cursorNodes) {
    // Check if cursor node
    if (cursorNodes && cursorNodes.has(id)) return cursorNodes.get(id)

    // Check if grid node
    const grid = this.gridNodes.find(n => n.id === id)
    if (grid) return grid

    return null
  }

  /**
   * Get color for grid nodes
   */
  getGridNodeColor() {
    return '#4a5568'  // Subtle gray-blue
  }

  /**
   * Clear generated nodes
   */
  clear() {
    this.gridNodes = []
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
    // Use CircuitGridTopology
    this.gridTopology = new CircuitGridTopology()
  }

  /**
   * Generate network topology based on cursor positions
   * @param {Map} cursorNodes - User cursor nodes (userId -> Node)
   * @returns {Object} { edges, intermediateNodes, edgeCircuitNodes }
   */
  generateTopology(cursorNodes) {
    return this.gridTopology.generateTopology(cursorNodes)
  }

  /**
   * Get node by ID (proxy to grid topology)
   */
  getNodeById(id, cursorNodes) {
    return this.gridTopology.getNodeById(id, cursorNodes)
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.gridTopology.dispose()
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
