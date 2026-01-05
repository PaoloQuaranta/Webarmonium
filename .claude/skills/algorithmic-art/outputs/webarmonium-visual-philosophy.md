# Ethereal Resonance: A Dual-Layer Visual Philosophy for Webarmonium

## The Philosophy

**"Music is the space between the notes."** — Claude Debussy

Webarmonium's visual system embodies this principle through two complementary layers: the **Atmospheric Field** and the **Chaotic Tracery**. Together, they create a visual meditation on the relationship between continuous ambient states and discrete musical events—the breath and the heartbeat of collaborative music-making.

### Layer 1: The Atmospheric Field (Perlin Noise Nebulae)

The first layer is a living canvas of fog—not clouds with edges, but pure atmospheric *presence*. This field breathes with the music's compositional state: ambient passages summon cool, oceanic depths; riffs ignite warm currents; phrases invoke violet mysteries; arpeggios crystallize into cyan clarity; drones settle into indigo meditation.

The implementation philosophy: **no geometry, only gradients of intensity**. Multi-octave Perlin noise creates a field where density varies continuously across space. Cells of noise blend seamlessly into their neighbors, producing an effect like looking through stained glass at shifting northern lights. The field should feel *meteorological*—not decorative shapes, but actual weather happening on the canvas.

This layer must be **visible yet humble**—atmospheric presence without visual intrusion. On a dark stage (the canvas background), these colors must glow softly like bioluminescence, present enough to establish mood but never competing with the human activity of cursors and particles. The painstaking calibration of alpha, lightness, and saturation values represents hours of careful adjustment by a master colorist who understands that restraint is the hardest discipline.

### Layer 2: The Chaotic Tracery (Precomputed Strange Attractors)

The second layer introduces mathematical destiny—the strange attractors of Lorenz and Rossler, those beautiful expressions of deterministic chaos where simple equations generate infinite complexity. But here we embrace a profound optimization: **the chaos is precomputed**.

Rather than calculating differential equations 72,000 times per frame (computationally violent), we precalculate the attractor's evolution across 90 keyframes, storing ~500 point positions per frame. At runtime, we merely *replay* this recorded chaos, interpolating smoothly between keyframes. The result is identical visual complexity at a fraction of the computational cost—a testament to the elegance of separating computation from presentation.

The Lorenz attractor (butterfly wings) and Rossler attractor (spiral ribbon) represent two flavors of chaos—the first more explosive and symmetric, the second more gentle and unwinding. Musical events trigger transitions between them: a phrase change might morph from Lorenz to Rossler over 2 seconds, the points smoothly transitioning through mathematical liminal space.

This layer replaces the SparkSystem because sparks merely followed paths—these points *are* the path, the frozen trajectory of a deterministic system that appears random but is profoundly ordered. The conceptual DNA here is the philosophy that **chaos is just order we haven't understood yet**.

### The Interaction Between Layers

The two layers exist in complementary relationship:
- **Nebulae** respond to *compositional state* (what kind of music is playing)
- **Attractors** respond to *musical events* (when things happen)

The nebulae provide continuous mood; the attractors provide punctuation. The nebulae are breath; the attractors are pulse. Together they create a visual experience that is both ambient and responsive, both passive and alive.

Color coherence binds them: when nebulae shift to warm riff colors, the attractor points inherit a corresponding warmth. They share the same palette but express it differently—nebulae as diffuse gradients, attractors as discrete point clouds. This meticulously crafted color coordination ensures visual unity while maintaining distinct roles.

---

## Technical Specifications

### HSB Color System (0-360 hue, 0-100 sat/light/alpha)

**Background reference**: RGB(26, 26, 46) ≈ HSB(240, 43, 18)

### Nebula Palettes (Layer 1)

These values are calibrated for visibility on the dark background while maintaining atmospheric subtlety:

```javascript
const nebulaPalettes = {
  ambient: [
    { hue: 210, sat: 45, light: 45, alpha: 55 },  // Deep sky blue
    { hue: 220, sat: 50, light: 40, alpha: 50 },  // Ocean blue
    { hue: 195, sat: 40, light: 50, alpha: 45 },  // Soft cyan
    { hue: 230, sat: 35, light: 42, alpha: 48 }   // Twilight
  ],
  riff: [
    { hue: 25, sat: 60, light: 55, alpha: 60 },   // Warm amber
    { hue: 15, sat: 55, light: 50, alpha: 55 },   // Soft orange
    { hue: 35, sat: 50, light: 52, alpha: 50 },   // Golden
    { hue: 10, sat: 45, light: 48, alpha: 52 }    // Rust glow
  ],
  phrase: [
    { hue: 280, sat: 50, light: 48, alpha: 55 },  // Royal purple
    { hue: 290, sat: 45, light: 45, alpha: 50 },  // Violet
    { hue: 270, sat: 40, light: 50, alpha: 48 },  // Lavender
    { hue: 300, sat: 35, light: 46, alpha: 52 }   // Magenta hint
  ],
  arpeggio: [
    { hue: 175, sat: 55, light: 52, alpha: 58 },  // Bright cyan
    { hue: 185, sat: 50, light: 48, alpha: 52 },  // Teal
    { hue: 165, sat: 45, light: 55, alpha: 50 },  // Aquamarine
    { hue: 190, sat: 40, light: 50, alpha: 55 }   // Steel cyan
  ],
  drone: [
    { hue: 240, sat: 40, light: 38, alpha: 50 },  // Deep indigo
    { hue: 250, sat: 35, light: 35, alpha: 45 },  // Night blue
    { hue: 235, sat: 30, light: 40, alpha: 48 },  // Muted navy
    { hue: 255, sat: 25, light: 36, alpha: 42 }   // Subtle violet
  ]
};
```

**Key calibration notes:**
- Alpha 45-60 (was 25-42): Now visible but not overwhelming
- Lightness 35-55 (was 18-32): Lifted to glow on dark background
- Saturation 30-60 (was 25-70): Tightened range for coherence

### Attractor System (Layer 2)

**Precomputation structure:**

```javascript
const attractorData = {
  lorenz: {
    name: 'Lorenz',
    params: { sigma: 10, rho: 28, beta: 8/3 },
    frames: [], // Array of 90 frames
    // Each frame: array of ~500 {x, y, z} points normalized to [0,1]
  },
  rossler: {
    name: 'Rossler',
    params: { a: 0.2, b: 0.2, c: 5.7 },
    frames: [],
  }
};

// Each frame structure:
// attractorData.lorenz.frames[frameIndex] = [
//   { x: 0.45, y: 0.52, z: 0.38 },  // normalized coordinates
//   { x: 0.47, y: 0.51, z: 0.40 },
//   ... ~500 points
// ]
```

**Runtime interpolation:**

```javascript
function getInterpolatedPoints(attractorType, t) {
  // t is normalized time [0, 1] for the loop
  const data = attractorData[attractorType];
  const frameCount = data.frames.length;

  // Find surrounding frames
  const floatIndex = t * (frameCount - 1);
  const frame0 = Math.floor(floatIndex);
  const frame1 = (frame0 + 1) % frameCount;
  const blend = floatIndex - frame0;

  // Interpolate each point
  return data.frames[frame0].map((p0, i) => {
    const p1 = data.frames[frame1][i];
    return {
      x: p0.x + (p1.x - p0.x) * blend,
      y: p0.y + (p1.y - p0.y) * blend,
      z: p0.z + (p1.z - p0.z) * blend
    };
  });
}
```

**Performance comparison:**
| Approach | Calculations/Frame | Memory |
|----------|-------------------|--------|
| Real-time attractor | ~72,000 | Minimal |
| Precomputed (500 pts × 90 frames) | ~500 interpolations | ~135KB |

### Musical Event → Visual Response Mapping

```javascript
const visualResponses = {
  // Nebula responses (continuous state)
  'composition:ambient':  { palette: 'ambient', transitionTime: 2000 },
  'composition:riff':     { palette: 'riff', transitionTime: 1500 },
  'composition:phrase':   { palette: 'phrase', transitionTime: 1500 },
  'composition:arpeggio': { palette: 'arpeggio', transitionTime: 1000 },
  'composition:drone':    { palette: 'drone', transitionTime: 3000 },

  // Attractor responses (discrete events)
  'phrase:change': {
    action: 'switchAttractor',  // Lorenz ↔ Rossler
    morphDuration: 2000
  },
  'beat:strong': {
    action: 'pulseSpeed',       // Momentarily speed up loop
    speedMultiplier: 1.5,
    duration: 200
  },
  'velocity:high': {
    action: 'brightenPoints',   // Increase point alpha
    alphaBoost: 20,
    duration: 300
  },
  'section:climax': {
    action: 'expandAttractor',  // Scale up attractor size
    scaleFactor: 1.3,
    duration: 1000
  }
};
```

### Rendering Order & Layer Interaction

```
1. Background clear (RGB 26, 26, 46)
2. Nebula field (NoiseTextureNebulaSystem)
   - Renders full-canvas noise texture
   - Uses current palette based on composition state
3. Network/Particles (existing systems)
4. Attractor points (PrecomputedAttractorSystem)
   - Renders ~500 points with slight glow
   - Color inherits from current nebula palette
   - Size: 2-4px with 0.3 alpha halo at 2x size
5. Cursors (topmost)
```

### Attractor Color Integration

```javascript
function getAttractorColor(baseNebulaColor, pointZ) {
  // Inherit nebula palette but shift toward white based on z-depth
  // Higher z = closer to viewer = brighter
  const depthFactor = map(pointZ, 0, 1, 0.8, 1.2);
  return {
    hue: baseNebulaColor.hue,
    sat: baseNebulaColor.sat * 0.7,  // Less saturated than nebula
    light: constrain(baseNebulaColor.light * depthFactor, 30, 70),
    alpha: map(pointZ, 0, 1, 35, 65)  // Depth-based alpha
  };
}
```

---

## Implementation Checklist

1. **NoiseTextureNebulaSystem.js**
   - [ ] Update palettes with new HSB values
   - [ ] Verify visibility on dark background
   - [ ] Test all 5 composition types

2. **PrecomputedAttractorSystem.js** (NEW)
   - [ ] Generate Lorenz precomputed frames at init
   - [ ] Generate Rossler precomputed frames at init
   - [ ] Implement frame interpolation
   - [ ] Add attractor morphing (Lorenz ↔ Rossler blend)
   - [ ] Musical event handlers

3. **Integration**
   - [ ] Remove SparkSystem references
   - [ ] Add PrecomputedAttractorSystem to render pipeline
   - [ ] Wire up musical events
   - [ ] Test in both landing page and rooms
