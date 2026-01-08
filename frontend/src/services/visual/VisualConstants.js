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
  speed: 1.2,             // Base speed (units per second) - increased for better travel visibility
  speedVariation: 0.3,    // Random speed variation
  intensity: 1.0,         // Initial intensity
  decayRate: 1.5,         // Intensity decay per second - slower for longer travel
  width: 10,              // Pulse width in pixels - increased for better visibility
  maxPulses: 40           // Maximum active pulses - reduced to prevent storms
}

// Particle Configuration
const PARTICLE_CONFIG = {
  speed: 0.5,             // Base speed - increased for better travel
  speedVariation: 0.3,    // Random speed variation
  minSize: 3,             // Minimum particle size - increased for visibility
  maxSize: 6,             // Maximum particle size - increased for visibility
  lifeDecay: 0.2,         // Life decay per second - slower for longer travel
  emitCount: 3,           // Particles per emission - reduced to prevent storms
  maxParticles: 120,      // Maximum active particles - reduced to prevent storms
  cleanupInterval: 5000,  // Cleanup interval (ms)
  maxAge: 10000           // Maximum particle age (ms)
}

// Network Topology Configuration
const TOPOLOGY_CONFIG = {
  traceNodeSpacing: 0.15,      // Base spacing for trace node placement
  traceNodeSize: 6,            // Size of trace nodes
  pathsPerConnection: 3,       // Number of paths between each cursor pair
  enableTraceNodes: true       // Show trace nodes along paths
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
  idleSize: 20,           // Increased for visibility (was 4)
  tapSize: 28,            // Increased for visibility (was 6)
  dragSize: 36,           // Increased for visibility (was 8)
  holdPulseMin: 30,       // Increased for visibility (was 12)
  holdPulseMax: 45,       // Increased for visibility (was 18)
  holdPulseSpeed: 0.005,
  glowBlur: 25,
  glowActiveOnly: true
}

// Edge Visualization Configuration
const EDGE_CONFIG = {
  idleThickness: 1,
  activeThickness: 3,
  segments: 20,           // Curve segments for gradient
  controlPointOffset: 0.05, // Normalized offset for Bezier control
  minAlpha: 30,           // Increased from 5 for better visibility
  maxAlpha: 60            // Increased from 10 for better visibility
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
  // console.log('✅ VisualConstants exported to window')
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
