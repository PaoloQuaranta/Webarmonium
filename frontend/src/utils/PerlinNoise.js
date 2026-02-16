/**
 * PerlinNoise — Classic 3D Perlin noise (Ken Perlin's improved algorithm)
 * Returns values in [0, 1] — same as p5.js noise()
 *
 * Extracted from CanvasAdapter.js for standalone use.
 */
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

/**
 * HSB → RGB conversion
 * h, s, b each in [0, 1] → returns [r, g, b] in [0, 255]
 */
function hsbToRgb(h, s, b) {
  h = ((h % 1) + 1) % 1
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

/**
 * Convert RGB [0-255] to PixiJS hex number (0xRRGGBB)
 */
function rgbToPixiColor(r, g, b) {
  return (r << 16) | (g << 8) | b
}

/**
 * Convert HSB [0-1] directly to PixiJS hex number
 */
function hsbToPixiColor(h, s, b) {
  const [r, g, bl] = hsbToRgb(h, s, b)
  return rgbToPixiColor(r, g, bl)
}

/**
 * Convert hex string (#RRGGBB) to PixiJS hex number
 */
function hexStringToPixiColor(hex) {
  return parseInt(hex.replace('#', ''), 16)
}

// Exports
if (typeof window !== 'undefined') {
  window.PerlinNoise = PerlinNoise
  window.hsbToRgb = hsbToRgb
  window.rgbToPixiColor = rgbToPixiColor
  window.hsbToPixiColor = hsbToPixiColor
  window.hexStringToPixiColor = hexStringToPixiColor
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PerlinNoise, hsbToRgb, rgbToPixiColor, hsbToPixiColor, hexStringToPixiColor }
}
