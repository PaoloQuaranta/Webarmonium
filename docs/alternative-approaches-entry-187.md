# Entry #187: Alternative Approaches for Virtual User Gesture Balancing

This document describes alternative approaches considered for equalizing gesture distribution across virtual users (Wikipedia, HackerNews, GitHub). The implemented solution uses static source-specific balancing parameters.

## Problem Statement

Virtual users generate gestures based on real-time web metrics from three sources with fundamentally different characteristics:

| Source | Poll Interval | Typical Activity | Result |
|--------|--------------|------------------|--------|
| Wikipedia | 5s | 20-50 edits/min | Very prolific |
| HackerNews | 10s | 1-5 posts/min | Moderate |
| GitHub | 60s | 0-5 commits/min | Often silent |

This creates an imbalanced musical experience where Wikipedia dominates and GitHub is barely audible.

## Implemented Solution

**Static Source-Specific Balancing** with three parameters per source:
- `activityFloor`: Minimum activity level guarantee
- `gestureIntentMultiplier`: Adjusts gesture frequency threshold
- `durationBias`: Per-source duration distribution

See `VirtualUserService.js` lines 116-148 for implementation.

---

## Alternative Approaches

### 1. Data-Driven Tuning with Logging

**Concept:** Instead of hardcoded multipliers, add metrics logging to track actual gesture distribution, then tune based on real data.

**Implementation:**
```javascript
// Add to VirtualUserService
this.gestureMetrics = {
  wikipedia: { count: 0, durations: [], timestamps: [] },
  hackernews: { count: 0, durations: [], timestamps: [] },
  github: { count: 0, durations: [], timestamps: [] }
}

// Log each gesture
_logGestureMetric(source, duration) {
  const metrics = this.gestureMetrics[source]
  metrics.count++
  metrics.durations.push(duration)
  metrics.timestamps.push(Date.now())

  // Keep only last hour of data
  const oneHourAgo = Date.now() - 3600000
  while (metrics.timestamps[0] < oneHourAgo) {
    metrics.timestamps.shift()
    metrics.durations.shift()
  }
}

// Expose for monitoring
getGestureDistribution() {
  const now = Date.now()
  const window = 300000 // 5 minutes
  return Object.entries(this.gestureMetrics).map(([source, m]) => ({
    source,
    gesturesPerMinute: m.timestamps.filter(t => t > now - window).length / 5,
    avgDuration: m.durations.length ?
      m.durations.reduce((a,b) => a+b, 0) / m.durations.length : 0
  }))
}
```

**Pros:**
- Enables data-driven tuning decisions
- Exposes actual behavior for debugging
- Can power a tuning dashboard

**Cons:**
- Memory overhead for storing metrics
- Requires manual analysis to derive tuning values
- Doesn't auto-correct imbalances

**When to Use:** Good for initial calibration phase or when behavior needs debugging.

---

### 2. Configuration Externalization

**Concept:** Move `sourceBalancing` to an external JSON config file that can be hot-reloaded without code changes.

**Implementation:**
```javascript
// config/virtual-user-balancing.json
{
  "wikipedia": {
    "activityFloor": 0.2,
    "gestureIntentMultiplier": 1.5,
    "durationBias": { "tap": 0.35, "short": 0.40, "medium": 0.20, "long": 0.05 }
  },
  "hackernews": { ... },
  "github": { ... }
}

// VirtualUserService.js
const fs = require('fs')
const CONFIG_PATH = './config/virtual-user-balancing.json'

loadBalancingConfig() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
    this.sourceBalancing = config
    this._validateConfigurations()
  } catch (err) {
    console.warn('Failed to load balancing config, using defaults')
  }
}

// Hot reload on SIGHUP
process.on('SIGHUP', () => this.loadBalancingConfig())
```

**Pros:**
- Production tuning without deployments
- Easy A/B testing of different configurations
- Separates tuning from code

**Cons:**
- Adds file I/O dependency
- Configuration drift between environments
- Need to handle parse errors gracefully

**When to Use:** Production environments where rapid iteration is needed.

---

### 3. Adaptive Balancing with PID Controller

**Concept:** Use a feedback controller to automatically adjust multipliers based on observed gesture frequency, converging to equal distribution.

**Implementation:**
```javascript
class AdaptiveBalancer {
  constructor() {
    // PID gains (tune empirically)
    this.Kp = 0.1   // Proportional
    this.Ki = 0.01  // Integral
    this.Kd = 0.05  // Derivative

    // State per source
    this.state = {
      wikipedia: { integral: 0, lastError: 0, multiplier: 1.0 },
      hackernews: { integral: 0, lastError: 0, multiplier: 1.0 },
      github: { integral: 0, lastError: 0, multiplier: 1.0 }
    }

    // Target: equal gestures per minute
    this.targetGesturesPerMinute = 4
  }

  update(source, observedGesturesPerMinute) {
    const state = this.state[source]
    const error = this.targetGesturesPerMinute - observedGesturesPerMinute

    // PID calculation
    state.integral += error
    const derivative = error - state.lastError
    state.lastError = error

    const adjustment =
      this.Kp * error +
      this.Ki * state.integral +
      this.Kd * derivative

    // Apply adjustment to multiplier (invert: more gestures = higher multiplier to reduce)
    state.multiplier = Math.max(0.1, Math.min(5.0,
      state.multiplier - adjustment * 0.1
    ))

    return state.multiplier
  }
}
```

**Pros:**
- Self-tuning, no manual adjustment needed
- Adapts to changing API behavior
- Mathematically principled

**Cons:**
- Complex to tune PID gains correctly
- Can oscillate if gains are wrong
- Takes time to converge after startup

**When to Use:** Long-running systems where API characteristics change over time.

---

### 4. Fixed Time-Slot Allocation

**Concept:** Pre-allocate gesture "slots" per time window and distribute evenly across sources, regardless of actual metrics.

**Implementation:**
```javascript
class TimeSlotAllocator {
  constructor() {
    this.windowMs = 60000  // 1 minute window
    this.gesturesPerWindow = 12  // 4 per source
    this.sourceSlots = {
      wikipedia: [0, 3, 6, 9],   // Seconds 0, 15, 30, 45
      hackernews: [1, 4, 7, 10],
      github: [2, 5, 8, 11]
    }
    this.currentSlot = 0
  }

  tick() {
    this.currentSlot = (this.currentSlot + 1) % this.gesturesPerWindow
  }

  shouldGesture(source) {
    return this.sourceSlots[source].includes(this.currentSlot)
  }
}

// In _generateAndEmitGestures
if (!this.timeSlotAllocator.shouldGesture(source)) {
  continue  // Not this source's turn
}
```

**Pros:**
- Guaranteed equal distribution
- Predictable, deterministic timing
- Simple to understand and debug

**Cons:**
- Loses emergent behavior from real metrics
- Feels mechanical/robotic
- Metrics only affect gesture content, not timing

**When to Use:** When strict equality is more important than organic behavior.

---

### 5. Exponential Moving Average Adjustment

**Concept:** Track each source's gesture frequency with EMA and dynamically adjust thresholds to maintain target ratio.

**Implementation:**
```javascript
class EMABalancer {
  constructor(alpha = 0.1) {
    this.alpha = alpha  // Smoothing factor (0-1)
    this.ema = {
      wikipedia: 0,
      hackernews: 0,
      github: 0
    }
    this.targetRatio = 1.0  // Equal distribution
  }

  recordGesture(source) {
    this.ema[source] = this.alpha * 1 + (1 - this.alpha) * this.ema[source]

    // Decay others
    for (const s of Object.keys(this.ema)) {
      if (s !== source) {
        this.ema[s] = (1 - this.alpha) * this.ema[s]
      }
    }
  }

  getAdjustedThreshold(source, baseThreshold) {
    const total = Object.values(this.ema).reduce((a, b) => a + b, 0)
    if (total === 0) return baseThreshold

    const currentShare = this.ema[source] / total
    const targetShare = 1 / 3  // Equal for 3 sources

    // If this source has more than its share, increase threshold (fewer gestures)
    // If less than its share, decrease threshold (more gestures)
    const adjustment = currentShare / targetShare
    return baseThreshold * adjustment
  }
}
```

**Pros:**
- Smooth, gradual adjustments
- Responds to actual behavior
- Simpler than full PID controller

**Cons:**
- Alpha tuning affects responsiveness
- Can still create feedback loops
- Startup period with no data

**When to Use:** Balance between manual tuning and full automation.

---

## Comparison Matrix

| Approach | Complexity | Self-Tuning | Predictable | Config Changes |
|----------|------------|-------------|-------------|----------------|
| **Static (implemented)** | Low | No | Yes | Code deploy |
| Data-Driven Logging | Low | No | Yes | Manual analysis |
| External Config | Medium | No | Yes | File reload |
| PID Controller | High | Yes | Medium | Gain tuning |
| Time-Slot Allocation | Low | No | Yes | None |
| EMA Adjustment | Medium | Yes | Medium | Alpha tuning |

## Recommendation

The **implemented static solution** is appropriate for the current stage because:

1. The problem is well-understood (structural API differences)
2. Tuning values can be derived analytically (poll interval ratios)
3. Predictable behavior is valuable for debugging
4. Complexity is minimal

Consider **External Config** if frequent production tuning is needed without deploys.

Consider **EMA Adjustment** if API characteristics change unpredictably over time.

Consider **PID Controller** only if you have resources to properly tune gains and monitor convergence.

---

## Future Considerations

1. **Telemetry Integration:** Add gesture distribution metrics to monitoring dashboard
2. **A/B Testing Framework:** Test different balancing configurations with user groups
3. **Machine Learning:** Train model on gesture "quality" to optimize distribution
4. **User Preference:** Allow users to adjust source prominence in their room
