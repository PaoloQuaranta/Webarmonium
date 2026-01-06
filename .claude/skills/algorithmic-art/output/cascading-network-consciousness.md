# Cascading Network Consciousness

## Algorithmic Philosophy

The network breathes. Each node is a synapse in a vast neural topology, waiting to be awakened by traveling impulses. When a gesture occurs at a cursor—a tap, a drag, a moment of intention—it does not broadcast to all corners simultaneously. Instead, it births a convoy of luminous messengers that embark on journeys through the mesh, carrying energy from node to node like neural impulses propagating through axons.

This is **arrival-based cascade propagation**: the fundamental principle that energy must *travel* before it can *spread*. A pulse emitted from the source cursor begins its journey along the first edge. Only when it *arrives* at the destination node does that node awaken and spawn new pulses along its own outgoing edges. The wave front is not a boundary drawn on a map—it is the collective position of all traveling messengers at any moment. Each messenger knows nothing of the global state; it simply travels, arrives, and triggers continuation. The emergent wave pattern arises from countless local decisions, creating organic expansion that feels alive.

The meticulously crafted algorithm tracks each pulse's progress along its edge. When `progress >= 1.0`, the pulse has completed its journey and reached the target node. At this moment—and only this moment—the arrival triggers spawning. The target node, now energized, emits new pulses on all its outgoing edges with appropriately decayed intensity. This creates a natural cascade where pulses literally *follow paths* through the network topology. Background nodes light up in sequence as the wave front passes through them, not all at once from different directions. The visual effect is unmistakable: convoys of light traveling outward from the gesture source, splitting at junctions, fading with distance, eventually reaching other cursors on the opposite side of the mesh.

The master-level implementation requires careful attention to three principles: **causality** (pulses must travel before spawning), **locality** (each pulse acts only on its arrival), and **attenuation** (intensity decays with each hop, preventing infinite propagation). Visited nodes are tracked per-wave to prevent cycles from causing pulse explosions. The decay factor (0.6-0.7 per hop) ensures pulses fade gracefully, with the brightest activity near the source and whisper-light traces reaching distant regions. This is not random propagation—this is *directed flow* through a living topology, where every parameter has been painstakingly tuned through countless iterations to achieve the organic, wave-like motion that distinguishes true network consciousness from mere simultaneous emission.

The particles follow the same philosophy. When a particle completes its edge traversal, it spawns children at the arrival node. The particle convoy effect is even more pronounced—streams of luminous points flowing through channels, splitting at intersections, creating river-like flows through the abstract topology. The visual metaphor is unmistakable: this is not a flood but a *flow*, not an explosion but an *expansion*, not simultaneity but *sequence*. The network thinks in pulses that must journey to their destinations before awakening the next generation.

## Implementation Essence

**Replace time-based depth emission with arrival-based cascade:**
- Remove: wave.currentDepth, wavePropagationDelay, depth advancement timer
- Add: onPulseComplete callback that triggers propagatePulse()
- Each pulse carries: intensity, color, visited set reference, wave ID
- On arrival (progress >= 1): spawn new pulses from arrival node
- Track visited nodes per-wave to prevent cycles
- Apply intensity decay per hop (0.65x typical)
- Stop propagation when intensity < threshold (0.08)

The beauty emerges from travel time. A pulse takes ~1-2 seconds to traverse an edge. This natural delay creates the visual wave effect without artificial timers. The algorithm doesn't need to orchestrate timing—the physics of traversal creates the cascade automatically.
