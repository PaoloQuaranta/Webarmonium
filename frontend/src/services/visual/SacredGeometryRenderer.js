/**
 * SacredGeometryRenderer
 * Renders sacred geometry overlays (flower of life, hexagonal grid)
 *
 * Visual Elements:
 * - Flower of Life pattern around active nodes
 * - Hexagonal grid across the canvas
 * - Subtle, low-opacity overlay
 */

class SacredGeometryRenderer {
  constructor() {
    // Get configuration from VisualConstants or use defaults
    const config = (typeof window !== 'undefined' && window.VisualConstants?.GEOMETRY_CONFIG)
      ? window.VisualConstants.GEOMETRY_CONFIG
      : {
          enabled: true,
          opacity: 0.15,
          scale: 100,
          flowerOfLifeRings: 7,
          hexagonalGrid: true,
          gridOpacity: 50
        }

    // Configuration
    this.enabled = config.enabled
    this.opacity = config.opacity
    this.scale = config.scale
    this.flowerOfLifeRings = config.flowerOfLifeRings
    this.hexagonalGrid = config.hexagonalGrid
    this.gridOpacity = config.gridOpacity
  }

  /**
   * Render sacred geometry overlays
   * @param {p5} p - p5.js instance
   * @param {Map} nodes - Map of nodes (userId -> Node)
   */
  render(p, nodes) {
    if (!this.enabled) return

    // Render hexagonal grid (background layer)
    if (this.hexagonalGrid) {
      this.renderHexagonalGrid(p)
    }

    // Render flower of life around active nodes
    for (const node of nodes.values()) {
      if (node.isActive) {
        this.renderFlowerOfLife(p, node)
      }
    }
  }

  /**
   * Render flower of life pattern around a node
   * @param {p5} p - p5.js instance
   * @param {Object} node - Node object
   */
  renderFlowerOfLife(p, node) {
    const cx = node.x * p.width
    const cy = node.y * p.height
    const radius = this.scale

    p.push()
    p.translate(cx, cy)

    // Set drawing style
    p.noFill()

    // Draw overlapping circles in flower of life pattern
    for (let ring = 0; ring < this.flowerOfLifeRings; ring++) {
      const ringRadius = radius * ring

      // Central circle (ring 0)
      if (ring === 0) {
        const alpha = Math.floor(this.opacity * 255)
        const rgb = this.hexToRgbArray(node.color)
        p.stroke(rgb[0], rgb[1], rgb[2], alpha)
        p.circle(0, 0, radius)
        continue
      }

      // Surrounding circles
      const circleCount = ring * 6
      for (let i = 0; i < circleCount; i++) {
        const angle = (Math.PI * 2 / circleCount) * i
        const x = Math.cos(angle) * ringRadius
        const y = Math.sin(angle) * ringRadius

        // Fade alpha with ring distance
        const fadeFactor = 1 - (ring / this.flowerOfLifeRings)
        const alpha = Math.floor(this.opacity * 255 * fadeFactor)
        const rgb = this.hexToRgbArray(node.color)
        p.stroke(rgb[0], rgb[1], rgb[2], alpha)

        p.circle(x, y, radius)
      }
    }

    p.pop()
  }

  /**
   * Render subtle hexagonal grid across canvas
   * @param {p5} p - p5.js instance
   */
  renderHexagonalGrid(p) {
    const hexSize = this.scale * 2
    const hexHeight = hexSize * Math.sqrt(3) / 2
    const hexWidth = hexSize * 2

    // Calculate grid dimensions
    const cols = Math.ceil(p.width / hexWidth) + 1
    const rows = Math.ceil(p.height / hexHeight) + 1

    // Set drawing style
    p.stroke(255, 255, 255, this.gridOpacity)
    p.strokeWeight(1)
    p.noFill()

    // Draw hexagonal grid
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Offset every other row for hexagonal pattern
        const offset = (row % 2) * (hexWidth / 2)
        const x = col * hexWidth + offset
        const y = row * hexHeight

        this.drawHexagon(p, x, y, hexSize / 2)
      }
    }
  }

  /**
   * Draw a hexagon
   * @param {p5} p - p5.js instance
   * @param {number} x - Center X
   * @param {number} y - Center Y
   * @param {number} radius - Radius
   */
  drawHexagon(p, x, y, radius) {
    p.beginShape()
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 / 6) * i
      const px = x + Math.cos(angle) * radius
      const py = y + Math.sin(angle) * radius
      p.vertex(px, py)
    }
    p.endShape(p.CLOSE)
  }

  /**
   * Set opacity for geometry
   * @param {number} value - Opacity value (0-1)
   */
  setOpacity(value) {
    this.opacity = Math.max(0, Math.min(1, value))
  }

  /**
   * Toggle geometry visibility
   */
  toggle() {
    this.enabled = !this.enabled
  }

  /**
   * Enable geometry rendering
   */
  enable() {
    this.enabled = true
  }

  /**
   * Disable geometry rendering
   */
  disable() {
    this.enabled = false
  }

  /**
   * Set scale for geometry patterns
   * @param {number} value - Scale in pixels
   */
  setScale(value) {
    this.scale = Math.max(20, Math.min(500, value))
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
    // Nothing to clean up for this renderer
  }
}

// Export for different module systems
if (typeof window !== 'undefined') {
  window.SacredGeometryRenderer = SacredGeometryRenderer
  console.log('✅ SacredGeometryRenderer exported to window')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SacredGeometryRenderer
}
