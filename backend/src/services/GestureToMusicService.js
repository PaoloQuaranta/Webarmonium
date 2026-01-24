const StyleAnalyzer = require('./StyleAnalyzer')
const PhraseMorphology = require('./PhraseMorphology')
const MaterialLibrary = require('./MaterialLibrary')
const HarmonicEngine = require('./HarmonicEngine')
const CompositionEngine = require('./CompositionEngine')

class GestureToMusicService {
  constructor() {
    this.lastGestureTime = {}
    this.gestureCount = {}

    // Deterministic ID counters
    this.materialIdCounter = 0
    this.musicalIdCounter = 0

    // Initialize musical components
    this.styleAnalyzer = new StyleAnalyzer()
    this.phraseMorphology = new PhraseMorphology()
    this.materialLibrary = new MaterialLibrary()
    this.harmonicEngine = new HarmonicEngine()
    this.compositionEngine = new CompositionEngine(
      this.materialLibrary,
      this.styleAnalyzer,
      this.harmonicEngine
    )

    // Musical context
    this.currentKey = 'C'
    this.currentMode = 'major'
    this.currentTempo = 120

    // Entry #171: Web metrics for deterministic gesture variation
    this.webMetrics = null
    this.webMetricsPoller = null
  }

  /**
   * Set WebMetricsPoller for fresh metrics on every gesture
   * Entry #171 fix: Ensures real user gestures get current metrics, not stale ones
   * @param {WebMetricsPoller} poller - WebMetricsPoller instance
   */
  setWebMetricsPoller(poller) {
    this.webMetricsPoller = poller
  }

  /**
   * Normalize web metrics to 0-1 range with *Norm suffix fields
   * Entry #171: Matches BackgroundCompositionService normalization for consistency
   * @returns {Object|null} Normalized metrics or null if poller not available
   * @private
   */
  _normalizeWebMetrics() {
    if (!this.webMetricsPoller) return this.webMetrics // Fallback to synced metrics
    const raw = this.webMetricsPoller.getMetrics()
    if (!raw) return this.webMetrics

    return {
      wikipedia: {
        normalized: Math.min(1, Math.max(0, (raw.wikipedia?.editsPerMinute || 0) / 50)),
        avgEditSizeNorm: Math.min(1, Math.max(0, (raw.wikipedia?.avgEditSize || 0) / 2000)),
        velocityNorm: Math.min(1, Math.max(0, ((raw.wikipedia?.velocity || 0) + 30) / 60)),
        accelerationNorm: Math.min(1, Math.max(0, ((raw.wikipedia?.acceleration || 0) + 15) / 30))
      },
      hackernews: {
        normalized: Math.min(1, Math.max(0, (raw.hackernews?.postsPerMinute || 0) / 5)),
        avgUpvotesNorm: Math.min(1, Math.max(0, (raw.hackernews?.avgUpvotes || 0) / 100)),
        commentCountNorm: Math.min(1, Math.max(0, (raw.hackernews?.commentCount || 0) / 100)),
        velocityNorm: Math.min(1, Math.max(0, ((raw.hackernews?.velocity || 0) + 5) / 10)),
        accelerationNorm: Math.min(1, Math.max(0, ((raw.hackernews?.acceleration || 0) + 5) / 10))
      },
      github: {
        normalized: Math.min(1, Math.max(0, (raw.github?.commitsPerMinute || 0) / 30)),
        createsNorm: Math.min(1, Math.max(0, (raw.github?.createsPerMinute || 0) / 10)),
        deletesNorm: Math.min(1, Math.max(0, (raw.github?.deletesPerMinute || 0) / 5)),
        velocityNorm: Math.min(1, Math.max(0, ((raw.github?.velocity || 0) + 10) / 20)),
        accelerationNorm: Math.min(1, Math.max(0, ((raw.github?.acceleration || 0) + 10) / 20))
      }
    }
  }

  processGesture(gestureData) {
    // Entry #171 fix: Sync fresh metrics BEFORE processing gesture
    // This ensures real user gestures use current web metrics, not stale ones
    this.webMetrics = this._normalizeWebMetrics()
    try {
// console.log('🎵 GestureToMusicService processing gesture:', gestureData)

      // Extract and normalize gesture data
      const normalizedGesture = this.normalizeGestureData(gestureData)

      // Analyze gesture style
      const gestureStyle = this.styleAnalyzer.analyzeGestureStyle([normalizedGesture])

      // Generate musical phrase from gesture
      const musicalPhrase = this.generateMusicalPhrase(normalizedGesture, gestureStyle)

      // Store material in library for future compositions
      this.storeMaterial(normalizedGesture, musicalPhrase)

// console.log(`🎵 Generated musical phrase: ${musicalPhrase.notes.length} notes, mood: ${musicalPhrase.metadata.gestureMood}`)

      // Return musical events in the expected format
      return this.formatMusicalEvents(musicalPhrase, normalizedGesture)

    } catch (error) {
// console.error('Error processing gesture:', error)
      return this.createFallbackEvents(gestureData)
    }
  }

  normalizeGestureData(gestureData) {
    // Extract and normalize gesture data with better fallbacks
    const userId = gestureData.userId || 'unknown'
    const gesture = gestureData.gesture || {}
    const gestureAction = gesture.action || gestureData.gestureAction || 'unknown'
    const gestureType = gesture.type || gestureData.gestureType || 'unknown'

    // DEBUG: Log what we receive to identify format issue
// console.log('🔍 BACKEND RECEIVED gesture data:', {
//      hasGestureCoordinates: !!gesture.coordinates,
//      gestureCoordinates: gesture.coordinates,
//      coordinatesType: typeof gesture.coordinates,
//      isArray: Array.isArray(gesture.coordinates),
//      hasGesturePosition: !!gesture.position,
//      gesturePosition: gesture.position,
//      hasGestureDataPosition: !!gestureData.position,
//      gestureDataPosition: gestureData.position
////    })

    // Handle different position formats
    // CRITICAL FIX: Frontend sends coordinates as object { x, y }, not array [x, y]
    let position
    if (gesture.coordinates) {
      // Check if coordinates is object or array
      if (Array.isArray(gesture.coordinates)) {
        position = { x: gesture.coordinates[0] || 0.5, y: gesture.coordinates[1] || 0.5 }
      } else if (typeof gesture.coordinates === 'object') {
        // Frontend sends object format
        position = { x: gesture.coordinates.x || 0.5, y: gesture.coordinates.y || 0.5 }
      } else {
        position = { x: 0.5, y: 0.5 }
      }
    } else {
      position = gesture.position || gestureData.position || { x: 0.5, y: 0.5 }
    }

    const velocity = gesture.velocity || gestureData.velocity || 50
    const acceleration = gesture.acceleration || gestureData.acceleration || 0
    const intensity = gesture.intensity || gestureData.intensity || (velocity / 100)
    const curvature = gesture.curvature || gestureData.curvature || 0.5

    // Entry #171 fix: Extract duration for phrase length calculation
    // Frontend sends duration in ms - critical for webMetrics-driven phrase generation
    const duration = gesture.duration || gestureData.duration || 1000

    // Create trajectory data
    const trajectory = gesture.trajectory || {
      angle: this.calculateTrajectoryAngle(position),
      direction: this.calculateTrajectoryDirection(position)
    }

// console.log('🎵 Normalized gesture data:', {
//      userId,
//      gestureAction,
//      gestureType,
//      position,
//      velocity,
//      acceleration,
//      intensity,
//      curvature
////    })

    return {
      userId,
      gestureAction,
      gestureType,
      position,
      velocity,
      acceleration,
      intensity,
      curvature,
      duration,  // Entry #171 fix: Include duration for phrase length variation
      trajectory,
      timestamp: Date.now()
    }
  }

  calculateTrajectoryAngle(position) {
    // Calculate angle from center (0,0) to position
    const dx = (position.x - 0.5) * 2
    const dy = (position.y - 0.5) * 2
    return Math.atan2(dy, dx) * (180 / Math.PI)
  }

  calculateTrajectoryDirection(position) {
    const x = position.x || 0.5
    const y = position.y || 0.5

    if (Math.abs(x - 0.5) < 0.1 && Math.abs(y - 0.5) < 0.1) return 'center'
    if (y < 0.3) return 'up'
    if (y > 0.7) return 'down'
    if (x < 0.3) return 'left'
    if (x > 0.7) return 'right'
    return 'diagonal'
  }

  generateMusicalPhrase(gestureData, gestureStyle) {
    // Determine musical context
    const musicalContext = {
      key: this.currentKey,
      mode: this.currentMode,
      tempo: this.currentTempo,
      currentHarmony: {
        chord: 'C',
        function: 'tonic'
      }
    }

    // Generate phrase based on gesture action
    switch (gestureData.gestureAction) {
      case 'drag': {
// console.log('🎵 DRAG: Generating musical phrase')
        // Entry #171: Pass webMetrics to PhraseMorphology for contour/rhythm/ornamentation variation
        const dragPhrase = this.phraseMorphology.generatePhrase(gestureData, musicalContext, null, this.webMetrics)

        // Entry #171: Web metrics-driven variation for drag phrases
        const wiki = this.webMetrics?.wikipedia?.normalized || 0.5
        const hn = this.webMetrics?.hackernews?.normalized || 0.5
        const gh = this.webMetrics?.github?.normalized || 0.5

        // Pitch offset ±3 semitones based on combined metrics
        const pitchOffset = Math.floor((wiki + hn - 1) * 3)

        // Velocity multiplier based on GitHub activity (0.75-1.0)
        const velocityMultiplier = 0.75 + (gh * 0.25)

        // HARMONIC COHERENCE: Constrain all phrase notes to room's scale/mode
        // PhraseMorphology uses mood-based scale selection; this ensures room coherence
        if (dragPhrase && dragPhrase.notes) {
          dragPhrase.notes = dragPhrase.notes.map(note => ({
            ...note,
            // Add pitch offset BEFORE constraining to scale
            pitch: this.harmonicEngine.constrainToScale(note.pitch + pitchOffset, this.currentKey, this.currentMode),
            // Modulate velocity while preserving relative dynamics
            velocity: Math.min(127, Math.max(1, Math.round((note.velocity || 80) * velocityMultiplier)))
          }))
        }
        return dragPhrase
      }

      case 'tap':
// console.log('🎵 TAP: Generating short phrase')
        return this.generateTapPhrase(gestureData, musicalContext)

      case 'hover':
// console.log('🎵 HOVER: NO SOUND - only filter modulation (cutoff/resonance)')
        return null // Hover doesn't generate sound, only modulates filters

      default:
// console.log('🎵 DEFAULT: Generating basic phrase')
        return this.generateBasicPhrase(gestureData, musicalContext)
    }
  }

  generateTapPhrase(gestureData, musicalContext) {
    // Short, percussive phrase for tap gestures
    // CRITICAL: Use SAME X+Y pitch calculation as frontend for consistency
    // Y controls octave range, X controls frequency within octave
    const x = gestureData.position.x
    const y = gestureData.position.y
    const octaveBase = 110 + (1 - y) * 440 // 110-550Hz (A2 to C#5)
    const withinOctave = x * 660 // 0-660Hz variation within octave
    const frequency = octaveBase + withinOctave // 110Hz to 1210Hz total range

    // Convert frequency to MIDI pitch for backend processing
    let rawPitch = Math.round(12 * Math.log2(frequency / 440) + 69)

    // Entry #171: Web metrics-driven variation (deterministic, no randomness)
    const wiki = this.webMetrics?.wikipedia?.normalized || 0.5
    const hn = this.webMetrics?.hackernews?.normalized || 0.5
    const gh = this.webMetrics?.github?.normalized || 0.5

    // Pitch variation: ±3 semitones based on combined metrics offset
    // (wiki + hn - 1) ranges from -1 to +1, scaled to -3 to +3 semitones
    const pitchOffset = Math.floor((wiki + hn - 1) * 3)
    rawPitch = rawPitch + pitchOffset

    // HARMONIC COHERENCE: Constrain pitch to current scale
    const pitch = this.harmonicEngine.constrainToScale(rawPitch, this.currentKey, this.currentMode)

    // Velocity variation: 75-105 based on GitHub activity (code intensity → musical intensity)
    const velocity = 75 + Math.floor(gh * 30)

    // Duration variation: 0.08-0.15s based on HackerNews activity (discussion → longer sustain)
    const duration = 0.08 + (hn * 0.07)

    // Articulation: Wikipedia activity determines staccato (high) vs legato (low)
    const articulation = wiki > 0.5 ? 'staccato' : 'legato'

// console.log('🎯 TAP (HARMONIC COHERENCE):', {
//      key: this.currentKey,
//      mode: this.currentMode,
//      rawPitch,
//      constrainedPitch: pitch,
//      adjusted: rawPitch !== pitch
////    })

// console.log('🎯 REMOTE TAP:', {
//      userId: gestureData.userId.substring(0, 8),
//      x: x.toFixed(2),
//      y: y.toFixed(2),
//      freq: frequency.toFixed(0) + 'Hz',
//      rawPitch: rawPitch,
//      constrainedPitch: pitch,
//      key: this.currentKey,
//      mode: this.currentMode
////    })

    return {
      notes: [{
        pitch: pitch,
        duration: duration, // Entry #171: Variable duration from web metrics
        velocity: velocity, // Entry #171: Variable velocity from web metrics
        articulation: articulation, // Entry #171: Variable articulation from web metrics
        position: 0,
        startBeat: 0
      }],
      metadata: {
        scale: this.harmonicEngine.getCurrentScale(this.currentKey, this.currentMode),
        key: musicalContext.key,
        length: 1,
        tempo: musicalContext.tempo,
        gestureMood: 'percussive'
      }
    }
  }

  generateHoverPhrase(gestureData, musicalContext) {
    // Long, sustained notes for hover gestures
    // Entry #171: Web metrics-driven variation
    const wiki = this.webMetrics?.wikipedia?.normalized || 0.5
    const hn = this.webMetrics?.hackernews?.normalized || 0.5
    const gh = this.webMetrics?.github?.normalized || 0.5

    // Pitch with metrics offset
    const pitchOffset = Math.floor((wiki + hn - 1) * 3)
    const rawPitch = 48 + Math.round(gestureData.position.y * 24) + pitchOffset

    // HARMONIC COHERENCE: Constrain pitch to current scale
    const pitch = this.harmonicEngine.constrainToScale(rawPitch, this.currentKey, this.currentMode)

    // Duration: base + curvature + HN influence (longer discussion → longer sustain)
    const duration = 2.0 + gestureData.curvature + (hn * 0.5)

    // Velocity: base + intensity + GitHub influence (code activity → dynamic range)
    const velocity = 50 + (gestureData.intensity * 20) + Math.floor(gh * 20)

    return {
      notes: [{
        pitch: pitch,
        duration: duration,
        velocity: Math.min(velocity, 110), // Cap at 110
        articulation: 'legato',
        position: 0,
        startBeat: 0
      }],
      metadata: {
        scale: this.harmonicEngine.getCurrentScale(this.currentKey, this.currentMode),
        key: musicalContext.key,
        length: 1,
        tempo: musicalContext.tempo,
        gestureMood: 'ambient'
      }
    }
  }

  generateBasicPhrase(gestureData, musicalContext) {
    // Simple melodic contour for unknown gestures
    // Entry #171: Web metrics-driven variation
    const wiki = this.webMetrics?.wikipedia?.normalized || 0.5
    const hn = this.webMetrics?.hackernews?.normalized || 0.5
    const gh = this.webMetrics?.github?.normalized || 0.5

    // Pitch with metrics offset
    const pitchOffset = Math.floor((wiki + hn - 1) * 3)
    const rawPitch = 60 + Math.round(gestureData.position.x * 12) + pitchOffset

    // HARMONIC COHERENCE: Constrain pitch to current scale
    const pitch = this.harmonicEngine.constrainToScale(rawPitch, this.currentKey, this.currentMode)

    // Velocity: 60-90 based on GitHub activity
    const velocity = 60 + Math.floor(gh * 30)

    // Duration: 0.4-0.6s based on HN activity
    const duration = 0.4 + (hn * 0.2)

    return {
      notes: [{
        pitch: pitch, // Diatonic pitch in current scale
        duration: duration,
        velocity: velocity,
        articulation: 'normal',
        position: 0,
        startBeat: 0
      }],
      metadata: {
        scale: this.phraseMorphology.scales.major,
        key: musicalContext.key,
        length: 1,
        tempo: musicalContext.tempo,
        gestureMood: 'neutral'
      }
    }
  }

  storeMaterial(gestureData, musicalPhrase) {
    // Store the generated musical material for future composition
    // DERIVATION: use counter-based ID instead of random
    this.materialIdCounter++
    const material = {
      id: `material_${this.materialIdCounter}_${Date.now()}`,
      userId: gestureData.userId,
      gestureData: gestureData,
      content: musicalPhrase,
      timestamp: Date.now()
    }

    this.materialLibrary.addMaterial(material)
  }

  formatMusicalEvents(musicalPhrase, gestureData) {
    // Convert musical phrase to the expected event format
    // CRITICAL: Convert beats to seconds using tempo
    const tempo = musicalPhrase.metadata.tempo || 120
    const beatDuration = 60 / tempo  // seconds per beat (e.g., 120 BPM = 0.5 sec/beat)

    let cumulativeTime = 0 // Track cumulative time in seconds

    return musicalPhrase.notes.map((note, index) => {
      // Convert note duration from beats to seconds
      const durationSeconds = (note.duration || 0.25) * beatDuration

      // DERIVATION: use counter-based ID instead of random
      this.musicalIdCounter++
      const event = {
        id: `musical_${this.musicalIdCounter}_${Date.now()}_${index}`,
        eventType: 'note',
        userId: gestureData.userId,
        timestamp: Date.now() + (cumulativeTime * 1000), // Convert seconds to ms
        position: gestureData.position,
        properties: {
          pitch: note.pitch,
          frequency: this.midiToFrequency(note.pitch),
          duration: durationSeconds,  // CRITICAL: Duration in SECONDS for Tone.js
          velocity: note.velocity || 80,
          articulation: note.articulation || 'normal',
          startTime: cumulativeTime
        }
      }

      // Advance cumulative time by note duration (slight overlap for musical effect)
      cumulativeTime += durationSeconds * 0.9

      return event
    })
  }

  midiToFrequency(midiNote) {
    // Convert MIDI note number to frequency
    return 440 * Math.pow(2, (midiNote - 69) / 12)
  }

  createFallbackEvents(gestureData) {
    // Create simple fallback events if something goes wrong
// console.log('🎵 Creating fallback events due to error')

    const fallbackEvent = {
      id: `fallback_${Date.now()}`,
      eventType: 'note',
      timestamp: Date.now(),
      properties: {
        frequency: 440, // A4
        duration: 0.3,
        velocity: 80,
        gestureAction: 'fallback',
        gestureType: 'fallback'
      }
    }

    // Handle cases where gestureData might be null/undefined
    if (gestureData && typeof gestureData === 'object') {
      fallbackEvent.userId = gestureData.userId || 'unknown'
      fallbackEvent.position = gestureData.position || { x: 0.5, y: 0.5 }
    } else {
      fallbackEvent.userId = 'unknown'
      fallbackEvent.position = { x: 0.5, y: 0.5 }
    }

    return [fallbackEvent]
  }

  // Public API methods for integration
  setKeyCenter(key, mode = 'major') {
    this.currentKey = key
    this.currentMode = mode
    this.materialLibrary.setKeyCenter(key, mode)
    this.harmonicEngine.currentKey = key
    this.harmonicEngine.currentMode = mode
  }

  setTempo(tempo) {
    this.currentTempo = Math.max(40, Math.min(200, tempo))
    this.compositionEngine.setTempo(this.currentTempo)
  }

  getCurrentStyle() {
    return this.styleAnalyzer.getCurrentStyle()
  }

  getMaterialStats() {
    return this.materialLibrary.getStats()
  }

  // Method for composition requests
  composeForRoom(roomContext) {
    try {
      return this.compositionEngine.compose(roomContext)
    } catch (error) {
// console.error('Error in room composition:', error)
      return this.compositionEngine.createFallbackComposition()
    }
  }
}

module.exports = GestureToMusicService