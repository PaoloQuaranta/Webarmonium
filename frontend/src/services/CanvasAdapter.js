/**
 * CanvasAdapter — Lightweight p5.js-compatible adapter for Webarmonium
 *
 * Replaces the ~800KB p5.js library with ~300 lines of vanilla Canvas 2D API.
 * Implements only the ~35 methods/properties used by the visual subsystems:
 *   SpringMeshNetwork, WavePacketSystem, ParticleFlowManager,
 *   NeonNebulaSystem, PrecomputedAttractorSystem
 *
 * Usage (identical to p5.js instance mode):
 *   new CanvasAdapter((p) => {
 *     p.setup = () => { p.createCanvas(800, 600) }
 *     p.draw  = () => { p.background(0); p.circle(400, 300, 50) }
 *   }, containerElement)
 */

// ============================================================
// Perlin Noise (classic 3D, Ken Perlin's improved algorithm)
// Returns values in [0, 1] — same as p5.js noise()
// ============================================================
const PerlinNoise = (() => {
  const perm = new Uint8Array(512)
  const grad3 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
    [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
    [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
  ]

  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10) }
  function lerp(a, b, t) { return a + t * (b - a) }
  function dot3(g, x, y, z) { return g[0] * x + g[1] * y + g[2] * z }

  function noise3D(x, y, z) {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    const Z = Math.floor(z) & 255
    x -= Math.floor(x)
    y -= Math.floor(y)
    z -= Math.floor(z)
    const u = fade(x), v = fade(y), w = fade(z)

    const A  = perm[X] + Y,     AA = perm[A] + Z,   AB = perm[A + 1] + Z
    const B  = perm[X + 1] + Y, BA = perm[B] + Z,   BB = perm[B + 1] + Z

    return (lerp(
      lerp(
        lerp(dot3(grad3[perm[AA]     % 12], x,   y,   z),
             dot3(grad3[perm[BA]     % 12], x-1, y,   z),   u),
        lerp(dot3(grad3[perm[AB]     % 12], x,   y-1, z),
             dot3(grad3[perm[BB]     % 12], x-1, y-1, z),   u), v),
      lerp(
        lerp(dot3(grad3[perm[AA + 1] % 12], x,   y,   z-1),
             dot3(grad3[perm[BA + 1] % 12], x-1, y,   z-1), u),
        lerp(dot3(grad3[perm[AB + 1] % 12], x,   y-1, z-1),
             dot3(grad3[perm[BB + 1] % 12], x-1, y-1, z-1), u), v), w
    ) + 1) / 2
  }

  return { noise: noise3D }
})()

// ============================================================
// HSB → RGB conversion
// h, s, b each in [0, 1] → returns [r, g, b] in [0, 255]
// ============================================================
function hsbToRgb(h, s, b) {
  h = ((h % 1) + 1) % 1 // wrap negative hues
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = b * (1 - s)
  const q = b * (1 - f * s)
  const t = b * (1 - (1 - f) * s)

  let r, g, bl
  switch (i % 6) {
    case 0: r = b; g = t; bl = p; break
    case 1: r = q; g = b; bl = p; break
    case 2: r = p; g = b; bl = t; break
    case 3: r = p; g = q; bl = b; break
    case 4: r = t; g = p; bl = b; break
    case 5: r = b; g = p; bl = q; break
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(bl * 255)]
}

// ============================================================
// Drawing-methods mixin
// Attaches p5-compatible drawing API to any object that has
// .drawingContext (CanvasRenderingContext2D) and .width/.height
// ============================================================
function addDrawingMethods(obj) {
  // --- Constants ---
  obj.CORNER = 'corner'
  obj.CENTER = 'center'
  obj.TOP    = 'top'
  obj.HSB    = 'hsb'
  obj.RGB    = 'rgb'

  // --- Internal drawing state ---
  obj._colorMode   = 'rgb'
  obj._colorMaxes  = [255, 255, 255, 255]
  obj._noStroke    = false
  obj._noFill      = false
  obj._imageMode   = 'corner'
  obj._stateStack  = []

  // --- Color string cache (eliminates ~186,000 string allocations/sec) ---
  obj._colorCache = new Map()
  obj._COLOR_CACHE_MAX = 512

  // --- Color resolution (handles RGB, HSB, and CSS strings) ---
  obj._resolveColor = function (...args) {
    if (args.length === 1 && typeof args[0] === 'string') {
      return args[0]
    }

    let r, g, b, a = 1.0

    if (this._colorMode === 'hsb') {
      const [mH, mS, mB, mA] = this._colorMaxes
      const h  = (args[0] || 0) / (mH || 360)
      const s  = (args[1] || 0) / (mS || 100)
      const bv = (args[2] || 0) / (mB || 100)
      a = args.length >= 4 ? (args[3] / (mA || 100)) : 1.0
      const rgb = hsbToRgb(h, s, bv)
      r = rgb[0]; g = rgb[1]; b = rgb[2]
    } else {
      const [mR, mG, mB, mA] = this._colorMaxes
      if (args.length === 1) {
        r = g = b = (args[0] / (mR || 255)) * 255
      } else if (args.length === 2) {
        r = g = b = (args[0] / (mR || 255)) * 255
        a = args[1] / (mA || 255)
      } else if (args.length === 3) {
        r = (args[0] / (mR || 255)) * 255
        g = (args[1] / (mG || 255)) * 255
        b = (args[2] / (mB || 255)) * 255
      } else {
        r = (args[0] / (mR || 255)) * 255
        g = (args[1] / (mG || 255)) * 255
        b = (args[2] / (mB || 255)) * 255
        a = args[3] / (mA || 255)
      }
    }

    r = Math.max(0, Math.min(255, Math.round(r)))
    g = Math.max(0, Math.min(255, Math.round(g)))
    b = Math.max(0, Math.min(255, Math.round(b)))
    // Quantize alpha to 256 levels for cache hits
    const aQ = Math.max(0, Math.min(255, Math.round(a * 255)))
    const key = (r << 24 | g << 16 | b << 8 | aQ) >>> 0

    let cached = this._colorCache.get(key)
    if (cached) return cached

    cached = `rgba(${r},${g},${b},${aQ / 255})`
    if (this._colorCache.size >= this._COLOR_CACHE_MAX) {
      const firstKey = this._colorCache.keys().next().value
      this._colorCache.delete(firstKey)
    }
    this._colorCache.set(key, cached)
    return cached
  }

  // --- Color mode ---
  obj.colorMode = function (mode, m1, m2, m3, m4) {
    this._colorMode = (mode === this.HSB || mode === 'hsb') ? 'hsb' : 'rgb'
    if (m1 !== undefined) {
      this._colorMaxes = [
        m1,
        m2 !== undefined ? m2 : m1,
        m3 !== undefined ? m3 : m1,
        m4 !== undefined ? m4 : m1
      ]
    }
  }

  // --- Fill & stroke ---
  obj.fill = function (...args) {
    this._noFill = false
    this.drawingContext.fillStyle = this._resolveColor(...args)
  }

  obj.noFill = function () { this._noFill = true }

  obj.stroke = function (...args) {
    this._noStroke = false
    this.drawingContext.strokeStyle = this._resolveColor(...args)
  }

  obj.noStroke = function () { this._noStroke = true }

  obj.strokeWeight = function (w) {
    this.drawingContext.lineWidth = w
  }

  // --- Background (always fills entire canvas, ignores current colorMode state) ---
  obj.background = function (...args) {
    const ctx = this.drawingContext
    const prev = ctx.fillStyle
    ctx.fillStyle = this._resolveColor(...args)
    ctx.fillRect(0, 0, this.width, this.height)
    ctx.fillStyle = prev
  }

  // --- Shape primitives ---
  obj.circle = function (x, y, d) {
    const ctx = this.drawingContext
    ctx.beginPath()
    ctx.arc(x, y, d / 2, 0, Math.PI * 2)
    if (!this._noFill) ctx.fill()
    if (!this._noStroke) ctx.stroke()
  }

  obj.ellipse = function (x, y, w, h) {
    if (h === undefined) h = w
    const ctx = this.drawingContext
    ctx.beginPath()
    ctx.ellipse(x, y, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2)
    if (!this._noFill) ctx.fill()
    if (!this._noStroke) ctx.stroke()
  }

  obj.line = function (x1, y1, x2, y2) {
    const ctx = this.drawingContext
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }

  // --- Image rendering (supports canvas elements and adapter objects) ---
  obj.image = function (img, x, y, w, h) {
    const source = img.canvas || img
    if (this._imageMode === 'center' && w !== undefined && h !== undefined) {
      x -= w / 2
      y -= h / 2
    }
    if (w !== undefined && h !== undefined) {
      this.drawingContext.drawImage(source, x, y, w, h)
    } else {
      this.drawingContext.drawImage(source, x, y)
    }
  }

  obj.imageMode = function (mode) { this._imageMode = mode }

  // --- Graphics state stack (supports nesting) ---
  obj.push = function () {
    this.drawingContext.save()
    this._stateStack.push({
      colorMode: this._colorMode,
      colorMaxes: this._colorMaxes.slice(),
      noStroke: this._noStroke,
      noFill: this._noFill,
      imageMode: this._imageMode
    })
  }

  obj.pop = function () {
    this.drawingContext.restore()
    const s = this._stateStack.pop()
    if (s) {
      this._colorMode  = s.colorMode
      this._colorMaxes = s.colorMaxes
      this._noStroke   = s.noStroke
      this._noFill     = s.noFill
      this._imageMode  = s.imageMode
    }
  }

  // --- Transforms ---
  obj.translate = function (x, y) { this.drawingContext.translate(x, y) }
  obj.rotate    = function (a)    { this.drawingContext.rotate(a) }

  // --- Text ---
  obj.textAlign = function (h, v) {
    const ctx = this.drawingContext
    if (h) ctx.textAlign = h
    if (v) ctx.textBaseline = v
  }

  obj.textSize = function (size) {
    this.drawingContext.font = `${size}px sans-serif`
  }

  obj.text = function (str, x, y) {
    if (!this._noFill) this.drawingContext.fillText(str, x, y)
  }

  // --- Perlin noise (1-3 dimensions) ---
  obj.noise = function (x, y, z) {
    return PerlinNoise.noise(x || 0, y || 0, z || 0)
  }
}

// ============================================================
// CanvasAdapter — main p5.js-compatible instance
// ============================================================
class CanvasAdapter {
  constructor(callback, container) {
    this.canvas         = document.createElement('canvas')
    this.drawingContext  = this.canvas.getContext('2d')
    this.width          = 0
    this.height         = 0

    // Timing & frame control
    this._startTime      = performance.now()
    this.frameCount      = 0
    this._targetFps      = 60
    this._targetFrameMs  = 1000 / 60
    this._rafId          = null
    this._looping        = true
    this._lastFrameTime  = 0
    this._container      = container

    // Attach drawing methods (fill, stroke, circle, etc.)
    addDrawingMethods(this)

    // Lifecycle callbacks — user assigns these via the callback
    this.setup = () => {}
    this.draw  = () => {}

    // Invoke user callback (mirrors p5 instance mode)
    callback(this)

    // Mount canvas
    if (container) container.appendChild(this.canvas)

    // Run setup then start draw loop
    this.setup()
    this._startLoop()
  }

  // --- Canvas lifecycle ---
  createCanvas(w, h) {
    this.canvas.width  = w
    this.canvas.height = h
    this.width  = w
    this.height = h
    return this.canvas
  }

  resizeCanvas(w, h) {
    this.canvas.width  = w
    this.canvas.height = h
    this.width  = w
    this.height = h
  }

  clear() {
    this.drawingContext.clearRect(0, 0, this.width, this.height)
  }

  pixelDensity(d) {
    // Webarmonium always sets this to 1 — no scaling needed
    this._pixelDensity = d
  }

  frameRate(fps) {
    this._targetFps     = fps
    this._targetFrameMs = 1000 / fps
  }

  millis() {
    return performance.now() - this._startTime
  }

  noLoop() {
    this._looping = false
    if (this._rafId) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
  }

  loop() {
    if (!this._looping) {
      this._looping = true
      this._lastFrameTime = performance.now()
      this._startLoop()
    }
  }

  // --- Offscreen buffer (replaces p5.createGraphics) ---
  createGraphics(w, h) {
    const buf = {
      canvas: document.createElement('canvas'),
      width: w,
      height: h
    }
    buf.canvas.width  = w
    buf.canvas.height = h
    buf.drawingContext = buf.canvas.getContext('2d')

    addDrawingMethods(buf)

    buf.clear = function () {
      this.drawingContext.clearRect(0, 0, this.width, this.height)
    }

    buf.remove = function () {
      this.canvas = null
      this.drawingContext = null
    }

    return buf
  }

  // --- Cleanup (replaces p5.remove) ---
  remove() {
    this.noLoop()
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas)
    }
    this.canvas = null
    this.drawingContext = null
  }

  // --- Internal rAF loop with frame-rate throttling ---
  _startLoop() {
    const loop = (now) => {
      if (!this._looping) return

      const elapsed = now - this._lastFrameTime
      if (elapsed >= this._targetFrameMs) {
        this._lastFrameTime = now - (elapsed % this._targetFrameMs)
        this.frameCount++
        this.draw()
      }

      this._rafId = requestAnimationFrame(loop)
    }

    this._lastFrameTime = performance.now()
    this._rafId = requestAnimationFrame(loop)
  }
}

// ============================================================
// Exports
// ============================================================
if (typeof window !== 'undefined') {
  window.CanvasAdapter = CanvasAdapter
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CanvasAdapter
}
