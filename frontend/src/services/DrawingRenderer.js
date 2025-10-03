/**
 * DrawingRenderer Service
 * Renders remote drawing strokes on the canvas
 * Constitutional requirement: <100ms UI response time
 */
class DrawingRenderer {
  /**
   * @param {HTMLCanvasElement} canvas - Canvas element to render on
   */
  constructor (canvas) {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Valid HTMLCanvasElement is required')
    }

    this.canvas = canvas
    this.ctx = canvas.getContext('2d')

    // Default rendering settings
    this.defaultStrokeWidth = 2
    this.lineCap = 'round'
    this.lineJoin = 'round'
  }

  /**
   * Render a single stroke on the canvas
   * @param {Object} stroke - Stroke data {id, userId, color, strokeWidth, points[]}
   */
  renderStroke (stroke) {
    if (!stroke || !stroke.points || stroke.points.length < 2) {
      console.warn('DrawingRenderer: Invalid stroke data', stroke)
      return
    }

    const startTime = performance.now()

    // Validate color format
    if (!this.isValidColor(stroke.color)) {
      console.warn('DrawingRenderer: Invalid color format', stroke.color)
      return
    }

    // Validate strokeWidth
    const strokeWidth = this.validateStrokeWidth(stroke.strokeWidth)

    // Validate and filter points
    const validPoints = stroke.points.filter(p => this.isValidPoint(p))
    if (validPoints.length < 2) {
      console.warn('DrawingRenderer: Insufficient valid points after filtering', {
        original: stroke.points.length,
        valid: validPoints.length
      })
      return
    }

    // Set drawing style
    this.ctx.strokeStyle = stroke.color
    this.ctx.lineWidth = strokeWidth
    this.ctx.lineCap = this.lineCap
    this.ctx.lineJoin = this.lineJoin

    // Begin path
    this.ctx.beginPath()

    // Move to start point
    const startPoint = validPoints[0]
    this.ctx.moveTo(startPoint.x, startPoint.y)

    // Draw lines through all valid points
    for (let i = 1; i < validPoints.length; i++) {
      const point = validPoints[i]
      this.ctx.lineTo(point.x, point.y)
    }

    // Render stroke
    this.ctx.stroke()

    // Performance logging (constitutional requirement: <100ms)
    const renderTime = performance.now() - startTime
    if (renderTime > 100) {
      console.warn(`DrawingRenderer: Stroke rendering took ${renderTime.toFixed(2)}ms (exceeds 100ms requirement)`)
    }
  }

  /**
   * Render multiple strokes (stroke history)
   * @param {Object[]} strokes - Array of stroke objects
   */
  renderStrokeHistory (strokes) {
    if (!Array.isArray(strokes)) {
      console.warn('DrawingRenderer: strokes must be an array')
      return
    }

    const startTime = performance.now()

    // Clear canvas before rendering history
    this.clearCanvas()

    // Render each stroke
    strokes.forEach(stroke => {
      this.renderStroke(stroke)
    })

    // Performance logging
    const renderTime = performance.now() - startTime
    console.log(`DrawingRenderer: Rendered ${strokes.length} strokes in ${renderTime.toFixed(2)}ms`)

    if (renderTime > 100 && strokes.length > 0) {
      console.warn(`DrawingRenderer: History rendering took ${renderTime.toFixed(2)}ms (exceeds 100ms requirement for ${strokes.length} strokes)`)
    }
  }

  /**
   * Clear the entire canvas
   */
  clearCanvas () {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
  }

  /**
   * Validate color format (hex: #rrggbb)
   * @param {string} color - Color string
   * @returns {boolean} True if valid
   */
  isValidColor (color) {
    return typeof color === 'string' && /^#[0-9a-f]{6}$/.test(color)
  }

  /**
   * Validate point coordinates
   * @param {Object} point - Point with x, y coordinates
   * @returns {boolean} True if valid
   */
  isValidPoint (point) {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
      return false
    }

    // Check if coordinates are within canvas bounds
    // Points should be in range [0, canvas dimensions]
    const { width, height } = this.getCanvasSize()

    return (
      point.x >= 0 && point.x <= width &&
      point.y >= 0 && point.y <= height &&
      isFinite(point.x) && isFinite(point.y)
    )
  }

  /**
   * Validate and constrain strokeWidth
   * @param {number} strokeWidth - Stroke width value
   * @returns {number} Valid stroke width (1-20)
   */
  validateStrokeWidth (strokeWidth) {
    if (typeof strokeWidth !== 'number' || strokeWidth < 1 || strokeWidth > 20) {
      console.warn(`DrawingRenderer: Invalid strokeWidth ${strokeWidth}, using default ${this.defaultStrokeWidth}`)
      return this.defaultStrokeWidth
    }
    return strokeWidth
  }

  /**
   * Set canvas size (for responsive resize)
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   */
  setCanvasSize (width, height) {
    this.canvas.width = width
    this.canvas.height = height
  }

  /**
   * Get canvas dimensions
   * @returns {Object} {width, height}
   */
  getCanvasSize () {
    return {
      width: this.canvas.width,
      height: this.canvas.height
    }
  }

  /**
   * Render stroke with animation (for smooth drawing)
   * @param {Object} stroke - Stroke data
   * @param {number} duration - Animation duration in ms (default: 300)
   */
  renderStrokeAnimated (stroke, duration = 300) {
    if (!stroke || !stroke.points || stroke.points.length < 2) {
      return
    }

    const strokeWidth = this.validateStrokeWidth(stroke.strokeWidth)

    // Set drawing style
    this.ctx.strokeStyle = stroke.color
    this.ctx.lineWidth = strokeWidth
    this.ctx.lineCap = this.lineCap
    this.ctx.lineJoin = this.lineJoin

    const totalPoints = stroke.points.length
    const pointsPerFrame = Math.max(1, Math.ceil(totalPoints / (duration / 16))) // 60fps

    let currentIndex = 0

    const animate = () => {
      if (currentIndex >= totalPoints) {
        return // Animation complete
      }

      this.ctx.beginPath()

      if (currentIndex === 0) {
        this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
        currentIndex++
      }

      const endIndex = Math.min(currentIndex + pointsPerFrame, totalPoints)

      for (let i = currentIndex; i < endIndex; i++) {
        this.ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
      }

      this.ctx.stroke()

      currentIndex = endIndex

      if (currentIndex < totalPoints) {
        requestAnimationFrame(animate)
      }
    }

    requestAnimationFrame(animate)
  }

  /**
   * Get rendering statistics
   * @returns {Object} Stats object
   */
  getStats () {
    return {
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      contextType: this.ctx ? '2d' : null,
      defaultStrokeWidth: this.defaultStrokeWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin
    }
  }
}

// Export for use in browser and Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DrawingRenderer
}
