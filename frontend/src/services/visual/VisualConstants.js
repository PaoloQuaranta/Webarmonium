/**
 * VisualConstants.js
 * Configuration for enhanced generative visualization
 */

// Spring Physics Configuration
const SPRING_CONFIG = {
  stiffness: 0.05,        // Spring constant (k) - Hooke's Law
  restLength: 0.3,        // Normalized rest length (0-1)
  damping: 0.92,          // Velocity damping factor
  repulsionStrength: 0.02, // Node-node repulsion force
  maxVelocity: 2.0,       // Maximum velocity cap
  repulsionRange: 0.25,   // Range for repulsion forces
  margin: 0.05            // Canvas boundary margin
}

// Wave Packet Pulse Configuration
const PULSE_CONFIG = {
  speed: 0.8,             // Base speed (units per second)
  speedVariation: 0.4,    // Random speed variation
  intensity: 1.0,         // Initial intensity
  decayRate: 2.0,         // Intensity decay per second
  width: 8,               // Pulse width in pixels
  maxPulses: 50           // Maximum active pulses
}

// Particle Configuration
const PARTICLE_CONFIG = {
  speed: 0.3,             // Base speed
  speedVariation: 0.5,    // Random speed variation
  minSize: 2,             // Minimum particle size
  maxSize: 5,             // Maximum particle size
  lifeDecay: 0.3,         // Life decay per second
  emitCount: 5,           // Particles per emission
  maxParticles: 200,      // Maximum active particles
  cleanupInterval: 5000,  // Cleanup interval (ms)
  maxAge: 10000           // Maximum particle age (ms)
}

// Network Topology Configuration
const TOPOLOGY_CONFIG = {
  proximityThreshold: 0.4,     // Max distance for cursor connections (not used, complete graph)
  radialRingCount: 3,          // Number of concentric rings
  nodesPerRing: 12,            // Base nodes per ring (increased for more visible mandala)
  circuitNodeSpacing: 0.08,    // Spacing for circuit nodes along edges (more nodes)
  radialNodeSize: 8,           // Size of radial nodes (increased for visibility)
  circuitNodeSize: 6,          // Size of circuit nodes (increased for visibility)
  enableRadialNodes: true,     // Show radial mandala pattern
  enableCircuitNodes: true     // Show circuit decoration
}

// Performance Configuration
const PERFORMANCE_CONFIG = {
  targetFps: 30,
  degradeThreshold: 20,   // FPS below this triggers degraded mode
  disableThreshold: 15,   // FPS below this disables effects
  recoveryThreshold: 28,  // FPS above this recovers to normal mode
  idleTimeout: 10000,     // Idle timeout before pause (ms)
  frameSampleInterval: 60 // Frames between performance checks
}

// Node Visualization Configuration
const NODE_CONFIG = {
  idleSize: 10,
  tapSize: 15,
  dragSize: 20,
  holdPulseMin: 20,
  holdPulseMax: 30,
  holdPulseSpeed: 0.005,
  glowBlur: 20,
  glowActiveOnly: true
}

// Edge Visualization Configuration
const EDGE_CONFIG = {
  idleThickness: 1,
  activeThickness: 3,
  segments: 20,           // Curve segments for gradient
  controlPointOffset: 0.05, // Normalized offset for Bezier control
  minAlpha: 100,
  maxAlpha: 150
}

// Export all configurations
if (typeof window !== 'undefined') {
  window.VisualConstants = {
    SPRING_CONFIG,
    PULSE_CONFIG,
    PARTICLE_CONFIG,
    TOPOLOGY_CONFIG,
    PERFORMANCE_CONFIG,
    NODE_CONFIG,
    EDGE_CONFIG
  }
  console.log('✅ VisualConstants exported to window')
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SPRING_CONFIG,
    PULSE_CONFIG,
    PARTICLE_CONFIG,
    TOPOLOGY_CONFIG,
    PERFORMANCE_CONFIG,
    NODE_CONFIG,
    EDGE_CONFIG
  }
}
