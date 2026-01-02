/**
 * LandingCompositionService
 * Generates real-time musical compositions from web metrics using CompositionEngine
 *
 * Architecture (Identical to BackgroundCompositionService):
 * - Uses CompositionEngine with 6 generative algorithms
 * - Treats web metrics as "virtual gestures" that feed into the composition system
 * - Emits background-composition events for frontend playback
 * - Virtual cursors provide visual context
 *
 * Key Difference from BackgroundCompositionService:
 * - Instead of real user gestures, uses web metrics (Wikipedia, HN, GitHub) as input
 * - Continuously generates compositions (doesn't wait for user interaction)
 */

const MaterialLibrary = require('./MaterialLibrary')
const StyleAnalyzer = require('./StyleAnalyzer')
const HarmonicEngine = require('./HarmonicEngine')
const CompositionEngine = require('./CompositionEngine')
const PhraseMorphology = require('./PhraseMorphology')

class LandingCompositionService {
  constructor() {
    // Initialize musical components (same as BackgroundCompositionService)
    this.materialLibrary = new MaterialLibrary()
    this.styleAnalyzer = new StyleAnalyzer()
    this.harmonicEngine = new HarmonicEngine()
    this.phraseMorphology = new PhraseMorphology()
    this.compositionEngine = new CompositionEngine(
      this.materialLibrary,
      this.styleAnalyzer,
      this.harmonicEngine
    )

    // Landing room ID
    this.landingRoomId = 'landing-room'

    // Current metrics state
    this.metrics = {
      wikipedia: { editsPerMinute: 0, newArticles: 0, avgEditSize: 0 },
      hackernews: { postsPerMinute: 0, avgUpvotes: 0, commentCount: 0 },
      github: { commitsPerMinute: 0, openPRs: 0, newStars: 0 }
    }

    // Service state
    this.isRunning = false
    this.compositionCount = 0
    this.compositionTimer = null

    // Virtual user definitions (for cursor display and material generation)
    this.virtualUsers = {
      wikipedia: {
        userId: 'wikipedia-metrics',
        color: '#e41a1c',
        region: { xMin: 0.0, xMax: 0.33 },
        baseFrequency: 261.63 // C4
      },
      hackernews: {
        userId: 'hackernews-metrics',
        color: '#ff7f00',
        region: { xMin: 0.33, xMax: 0.50 }, // Adjusted for expanded GitHub region
        baseFrequency: 329.63 // E4
      },
      github: {
        userId: 'github-metrics',
        color: '#377eb8',
        region: { xMin: 0.50, xMax: 1.0 }, // EXPANDED: now uses half the screen instead of 1/3
        baseFrequency: 392.00 // G4
      }
    }

    // Current cursor positions for interpolation
    this.currentPositions = {
      wikipedia: { x: 0.16, y: 0.5 },
      hackernews: { x: 0.41, y: 0.5 }, // Adjusted (center of 0.33-0.50 region)
      github: { x: 0.75, y: 0.5 } // Adjusted (center of 0.50-1.0 region)
    }

    // Target positions (for interpolation)
    this.targetPositions = {
      wikipedia: { x: 0.16, y: 0.5 },
      hackernews: { x: 0.41, y: 0.5 }, // Adjusted (center of 0.33-0.50 region)
      github: { x: 0.75, y: 0.5 } // Adjusted (center of 0.50-1.0 region)
    }

    // Cursor interpolation timer
    this.cursorInterpolationTimer = null

    // Virtual gesture history for each source
    this.virtualGestureHistory = {
      wikipedia: [],
      hackernews: [],
      github: []
    }

    // Socket.io instance (set by server)
    this.io = null

    // WebMetricsPoller reference (set by server) for velocity/acceleration
    this.webMetricsPoller = null

    // Gesture generation config
    this.gestureConfig = {
      tapThreshold: 5,  // Velocity below this = tap, above = drag
      minNoteInterval: 200,  // ms
      maxNoteInterval: 2000,  // ms
      densityMultiplier: 0.3  // CONSERVATIVE: Start at 30% of normal room density
    }

    console.log('🎵 LandingCompositionService initialized (CompositionEngine mode)')
  }

  /**
   * Set Socket.IO instance for broadcasting
   * @param {SocketIO} io - Socket.IO instance
   */
  setSocketIO(io) {
    this.io = io
    console.log('🎵 LandingCompositionService: Socket.IO connected')
  }

  /**
   * Set GestureToMusicService (for harmonic sync)
   * @param {GestureToMusicService} gestureService - GestureToMusicService instance
   */
  setGestureToMusicService(gestureService) {
    this.gestureToMusicService = gestureService
  }

  /**
   * Set WebMetricsPoller for velocity/acceleration data
   * @param {WebMetricsPoller} poller - WebMetricsPoller instance
   */
  setWebMetricsPoller(poller) {
    this.webMetricsPoller = poller
    console.log('🎵 LandingCompositionService: WebMetricsPoller connected')
  }

  /**
   * Set density multiplier for gesture generation tuning
   * @param {number} multiplier - Density multiplier (0.1 = sparse, 1.0 = normal room density)
   */
  setDensityMultiplier(multiplier) {
    this.gestureConfig.densityMultiplier = Math.max(0.1, Math.min(1.0, multiplier))
    console.log(`🎵 Gesture density multiplier set to ${this.gestureConfig.densityMultiplier}`)
  }

  /**
   * Start landing composition service
   */
  start() {
    if (this.isRunning) return

    this.isRunning = true

    // Start cursor interpolation
    this.startCursorInterpolation()

    // Start continuous composition generation
    this.scheduleNextComposition()

    console.log('🎵 LandingCompositionService started (CompositionEngine mode)')
  }

  /**
   * Stop landing composition service
   */
  stop() {
    if (!this.isRunning) return

    this.isRunning = false

    // Clear composition timer
    if (this.compositionTimer) {
      clearTimeout(this.compositionTimer)
      this.compositionTimer = null
    }

    // Clear cursor interpolation timer
    if (this.cursorInterpolationTimer) {
      clearInterval(this.cursorInterpolationTimer)
      this.cursorInterpolationTimer = null
    }

    console.log('🎵 LandingCompositionService stopped')
  }

  /**
   * Calculate activity level for a source (0.0-1.0)
   * Uses HYBRID normalization: logarithmic + soft sigmoid caps
   * Preserves ALL variation information without hard thresholds
   * @param {string} source - Source name
   * @returns {number} Activity level (0.0-1.0)
   * @private
   */
  calculateActivityLevel(source) {
    const metrics = this.metrics[source]
    switch (source) {
      case 'wikipedia':
        return this.softNormalize(metrics.editsPerMinute, 400, 2000)
      case 'hackernews':
        return this.softNormalize(metrics.postsPerMinute, 60, 300)
      case 'github':
        return this.softNormalize(metrics.commitsPerMinute, 5, 50)
      default:
        return 0
    }
  }

  /**
   * HYBRID normalization: Logarithmic scaling with soft sigmoid cap for extreme outliers
   * Preserves variation for normal range, prevents extreme values from dominating
   * @param {number} value - The value to normalize
   * @param {number} referencePoint - The "normal" value (maps to ~0.7)
   * @param {number} maxCap - The maximum expected value (maps to ~0.95)
   * @returns {number} Normalized value (0.0-1.0)
   * @private
   */
  softNormalize(value, referencePoint, maxCap) {
    // Logarithmic scaling for normal range (0 to referencePoint)
    const logNorm = Math.log1p(value) / Math.log1p(referencePoint)

    // Soft sigmoid cap for extreme values (> referencePoint)
    // Maps referencePoint → 0.7, maxCap → 0.95
    if (value <= referencePoint) {
      return logNorm * 0.7  // 0 to 0.7 range for normal values
    } else {
      const excessRatio = (value - referencePoint) / (maxCap - referencePoint)
      const sigmoidCap = 0.7 + (0.25 * (1 / (1 + Math.exp(-5 * (excessRatio - 0.5)))))
      return Math.min(0.95, sigmoidCap)
    }
  }

  /**
   * Calculate overall activity level (0.0-1.0)
   * @returns {number} Overall activity level
   * @private
   */
  calculateOverallActivity() {
    const wikiActivity = this.calculateActivityLevel('wikipedia')
    const hnActivity = this.calculateActivityLevel('hackernews')
    const ghActivity = this.calculateActivityLevel('github')
    return (wikiActivity + hnActivity + ghActivity) / 3
  }

  /**
   * Generate virtual gesture from metrics
   * MONOPHONIC - generates ONLY ONE note per call
   * @param {string} source - Source name
   * @returns {Object} Virtual gesture data
   * @private
   */
  generateVirtualGesture(source) {
    const user = this.virtualUsers[source]
    const metrics = this.metrics[source]
    const activity = this.calculateActivityLevel(source)

    // Map metrics to gesture properties
    const gestureType = activity > 0.5 ? 'drag' : 'tap'
    const duration = 300 + (1 - activity) * 700 // 300-1000ms
    const intensity = 0.3 + activity * 0.7 // 0.3-1.0

    // Add random Y variation for more cursor movement
    const yVariation = (Math.random() - 0.5) * 0.4 // -0.2 to +0.2 (increased for more movement)

    // Calculate frequency based on cursor position WITH variation
    const cursor = this.targetPositions[source]
    const adjustedY = Math.max(0.1, Math.min(0.9, cursor.y + yVariation))
    const semitones = Math.round((adjustedY - 0.5) * 24) // -12 to +12
    const frequency = user.baseFrequency * Math.pow(2, semitones / 12)

    // Generate ONLY ONE note (monophonic)
    const notes = [{
      frequency,
      velocity: 0.4 + intensity * 0.5, // 0.4-0.9 velocity
      timestamp: Date.now()
    }]

    return {
      gesture: {
        type: gestureType,
        duration,
        intensity,
        startTime: Date.now(),
        endTime: Date.now() + duration,
        startX: user.region.xMin + Math.random() * (user.region.xMax - user.region.xMin),
        startY: 0.5,
        endX: user.region.xMin + Math.random() * (user.region.xMax - user.region.xMin),
        endY: 0.5
      },
      notes,
      source,
      timestamp: Date.now()
    }
  }

  /**
   * Generate metric-driven virtual gestures based on velocity/acceleration
   * Uses velocity to determine gesture type (tap vs drag) and note intervals
   * @returns {Array} Array of virtual gestures
   * @private
   */
  generateMetricDrivenGestures() {
    const gestures = []

    for (const source of Object.keys(this.virtualUsers)) {
      const velocity = this.webMetricsPoller?.getVelocity(source) || 0
      const acceleration = this.webMetricsPoller?.getAcceleration(source) || 0
      const metrics = this.metrics[source]

      // Determine gesture type based on velocity
      const absVelocity = Math.abs(velocity)
      if (absVelocity < this.gestureConfig.tapThreshold) {
        // Low velocity → Tap (sustained note with variable duration)
        gestures.push(this.generateVirtualTap(source, metrics, velocity))
      } else {
        // High velocity → Drag phrase (streaming notes)
        gestures.push(this.generateVirtualDrag(source, metrics, velocity, acceleration))
      }
    }

    return gestures
  }

  /**
   * Generate virtual tap gesture with variable duration based on metric intensity
   * @param {string} source - Source name
   * @param {Object} metrics - Current metrics for this source
   * @param {number} velocity - Current velocity
   * @returns {Object} Tap gesture data
   * @private
   */
  generateVirtualTap(source, metrics, velocity) {
    const user = this.virtualUsers[source]
    const activity = this.calculateActivityLevel(source)
    const cursor = this.targetPositions[source]

    // Duration based on metric intensity (inverse: higher activity = shorter, more frequent taps)
    // Range: 200ms (high activity) to 2000ms (low activity)
    const duration = 200 + (1 - activity) * 1800

    // Calculate frequency based on cursor position
    const semitones = Math.round((cursor.y - 0.5) * 24) // -12 to +12
    const frequency = user.baseFrequency * Math.pow(2, semitones / 12)

    // Velocity affects note velocity (loudness/intensity)
    const noteVelocity = 0.4 + Math.min(Math.abs(velocity) / 10, 0.6)

    return {
      type: 'tap',
      source: source,
      frequency: frequency,
      velocity: noteVelocity,
      duration: duration,  // Variable duration!
      position: { x: cursor.x, y: cursor.y },
      timestamp: Date.now()
    }
  }

  /**
   * Generate virtual drag gesture with streaming notes based on velocity
   * @param {string} source - Source name
   * @param {Object} metrics - Current metrics for this source
   * @param {number} velocity - Current velocity
   * @param {number} acceleration - Current acceleration
   * @returns {Object} Drag gesture data with notes array
   * @private
   */
  generateVirtualDrag(source, metrics, velocity, acceleration) {
    const user = this.virtualUsers[source]
    const activity = this.calculateActivityLevel(source)
    const cursor = this.targetPositions[source]

    // Map velocity to note interval (CONSERVATIVE: 200-2000ms)
    const interval = this.mapVelocityToInterval(velocity)

    // Generate 3-5 note phrase (conservative approach)
    const noteCount = 3 + Math.floor(Math.random() * 3)
    const notes = []

    // Melodic direction based on acceleration
    const direction = acceleration > 0 ? 'ascending' : 'descending'

    for (let i = 0; i < noteCount; i++) {
      // Calculate pitch with melodic direction
      const semitoneOffset = direction === 'ascending' ? i * 2 : -i * 2
      const semitones = Math.round((cursor.y - 0.5) * 24) + semitoneOffset
      const frequency = user.baseFrequency * Math.pow(2, semitones / 12)

      notes.push({
        frequency: frequency,
        velocity: 0.4 + activity * 0.5,
        duration: 500,  // Per-note duration
        timestamp: Date.now() + (i * interval)
      })
    }

    return {
      type: 'drag',
      source: source,
      notes: notes,
      interval: interval,
      velocity: velocity,
      acceleration: acceleration,
      position: { x: cursor.x, y: cursor.y },
      timestamp: Date.now()
    }
  }

  /**
   * Map velocity to note interval using logarithmic scaling
   * @param {number} velocity - Velocity value
   * @returns {number} Note interval in milliseconds (200-2000ms)
   * @private
   */
  mapVelocityToInterval(velocity) {
    const absVelocity = Math.abs(velocity)
    const densityMultiplier = this.gestureConfig.densityMultiplier

    // Logarithmic mapping: velocity → interval
    // High velocity = low interval (fast notes), Low velocity = high interval (slow notes)
    const baseInterval = 200 * Math.pow(10, 1 - (1 / (1 + absVelocity * densityMultiplier)))
    return Math.min(this.gestureConfig.maxNoteInterval, Math.max(this.gestureConfig.minNoteInterval, baseInterval))
  }

  /**
   * Extract modulation parameters from virtual gestures
   * Gestures CONTROL the background composition (like normal rooms)
   * @param {Array} gestures - Array of virtual gestures
   * @returns {Object} Modulation parameters for CompositionEngine
   * @private
   */
  extractModulationParams(gestures) {
    if (!gestures || gestures.length === 0) {
      return {
        tempoMultiplier: 1.0,
        densityMultiplier: 0.5,
        registerShift: 0,
        hasTaps: false,
        hasDrags: false,
        articulation: 'legato'
      }
    }

    // Calculate average velocity and position
    const avgVelocity = gestures.reduce((sum, g) => sum + (g.velocity || 0), 0) / gestures.length
    const avgPosition = gestures.reduce((sum, g) => sum + (g.position?.y || 0.5), 0) / gestures.length

    // Count gesture types
    const hasTaps = gestures.some(g => g.type === 'tap')
    const hasDrags = gestures.some(g => g.type === 'drag')

    return {
      // Drag velocity → Tempo (faster gestures = faster composition)
      tempoMultiplier: 0.8 + Math.min(avgVelocity / 10, 0.4),  // 0.8x to 1.2x

      // Gesture density → Note density
      densityMultiplier: 0.5 + Math.min(gestures.length * 0.1, 0.5),  // 0.5x to 1.0x

      // Position Y → Register (higher = higher pitch range)
      registerShift: (avgPosition - 0.5) * 2,  // -1 to +1 octave

      // Gesture types → Texture
      hasTaps: hasTaps,
      hasDrags: hasDrags,

      // Velocity trend → Articulation
      articulation: avgVelocity > 5 ? 'staccato' : 'legato'
    }
  }

  /**
   * Add virtual gesture material from metrics (same pattern as BackgroundCompositionService.addMaterial)
   * @param {string} source - Source name
   * @private
   */
  addVirtualGestureMaterial(source) {
    const virtualGesture = this.generateVirtualGesture(source)

    // Calculate gesture weight (all virtual gestures have moderate weight)
    const gestureWeight = 0.5

    // Convert to material format (same as BackgroundCompositionService)
    const material = {
      notes: virtualGesture.notes || [],
      duration: virtualGesture.gesture.duration || 1000,
      userId: this.virtualUsers[source].userId,
      gestureData: { userId: this.virtualUsers[source].userId, gesture: virtualGesture.gesture },
      weight: gestureWeight,
      timestamp: Date.now()
    }

    // Add to material library
    const materialId = this.materialLibrary.addMaterial(material)

    // Normalize gesture for StyleAnalyzer
    const avgNoteVelocity = virtualGesture.notes.reduce((sum, note) => sum + note.velocity, 0) / virtualGesture.notes.length
    const velocity = avgNoteVelocity * 100

    const acceleration = virtualGesture.gesture.intensity * 50

    let interOnsetInterval
    if (virtualGesture.notes.length >= 2) {
      interOnsetInterval = 150 // Average interval between generated notes
    }

    const normalizedGesture = {
      ...virtualGesture.gesture,
      velocity,
      acceleration,
      interOnsetInterval,
      timestamp: virtualGesture.timestamp
    }

    // Accumulate gestures for analysis
    this.virtualGestureHistory[source].push(normalizedGesture)
    if (this.virtualGestureHistory[source].length > 10) {
      this.virtualGestureHistory[source] = this.virtualGestureHistory[source].slice(-10)
    }

    // Update style analyzer with combined gesture history from all sources
    const allGestures = [
      ...this.virtualGestureHistory.wikipedia,
      ...this.virtualGestureHistory.hackernews,
      ...this.virtualGestureHistory.github
    ]

    if (allGestures.length > 0) {
      this.styleAnalyzer.analyzeGestureStyle(allGestures, gestureWeight)
      this.applyStyleToComposition()
    }

    return materialId
  }

  /**
   * Apply analyzed style to composition parameters (same as BackgroundCompositionService)
   * With tempo capping and reduced density for landing page
   * @private
   */
  applyStyleToComposition() {
    const style = this.styleAnalyzer.getCurrentStyle()

    // Map style to composition parameters - CAP TEMPO to reasonable range
    this.compositionEngine.tempo = Math.max(60, Math.min(140, Math.round(style.tempo)))

    const { keyCenter, mode } = this.selectKeyAndMode(style)
    if (keyCenter !== this.compositionEngine.keyCenter || mode !== this.compositionEngine.mode) {
      this.compositionEngine.keyCenter = keyCenter
      this.compositionEngine.mode = mode
      console.log(`🎵 Style influenced composition: ${keyCenter} ${mode}, tempo ${this.compositionEngine.tempo}`)
    }

    // REDUCE density to avoid polyphony issues (max 0.4 instead of 0.9)
    this.compositionEngine.complexityLevel = Math.min(0.5, Math.max(0.1, style.energy * 0.6))
    this.compositionEngine.density = Math.min(0.4, Math.max(0.1, style.energy * 0.6))
  }

  /**
   * Select key and mode based on style analysis (same as BackgroundCompositionService)
   * @private
   */
  selectKeyAndMode(style) {
    const modalFlavor = style.harmonicComplexity?.modalFlavor || 'major'

    const modeMap = {
      'major': 'ionian',
      'minor': 'aeolian',
      'dorian': 'dorian',
      'phrygian': 'phrygian',
      'lydian': 'lydian',
      'mixolydian': 'mixolydian',
      'locrian': 'locrian'
    }
    const mode = modeMap[modalFlavor] || 'ionian'

    const energy = style.energy || 0.5
    const keys = ['F', 'C', 'G', 'D', 'A', 'E']
    const keyIndex = Math.floor(energy * (keys.length - 1))
    const keyCenter = keys[keyIndex]

    return { keyCenter, mode }
  }

  /**
   * Schedule next composition
   * REDUCED interval from 8-15s to 2s for faster response to metrics
   * @private
   */
  scheduleNextComposition() {
    if (!this.isRunning) return

    // FIXED INTERVAL: 2 seconds for faster metric response
    const interval = 2000

    this.compositionTimer = setTimeout(() => {
      this.generateAndBroadcastComposition()
      this.scheduleNextComposition()
    }, interval)

    console.log(`🎵 Next composition in ${(interval / 1000).toFixed(1)}s`)
  }

  /**
   * Generate and broadcast composition using metric-driven virtual gestures
   * NEW ARCHITECTURE: Gestures CONTROL the background composition
   * @private
   */
  async generateAndBroadcastComposition() {
    try {
      console.log(`🎵 Generating composition for landing room (gesture-controlled)`)

      // Add random variation to target cursor positions for MORE MOVEMENT
      for (const source of Object.keys(this.virtualUsers)) {
        const currentTarget = this.targetPositions[source]
        // Add LARGER random offset (increased from 0.1 to 0.3)
        this.targetPositions[source] = {
          x: Math.max(
            this.virtualUsers[source].region.xMin,
            Math.min(this.virtualUsers[source].region.xMax, currentTarget.x + (Math.random() - 0.5) * 0.3)
          ),
          y: Math.max(0.1, Math.min(0.9, currentTarget.y + (Math.random() - 0.5) * 0.3))
        }
      }

      // STEP 1: Generate metric-driven virtual gestures
      const virtualGestures = this.generateMetricDrivenGestures()

      console.log(`🎵 Generated ${virtualGestures.length} virtual gestures:`,
        virtualGestures.map(g => `${g.source}:${g.type}(vel:${g.velocity?.toFixed(1)})`).join(', '))

      // STEP 2: Extract modulation parameters from gestures
      const modulationParams = this.extractModulationParams(virtualGestures)

      console.log(`🎵 Modulation params: tempo=${modulationParams.tempoMultiplier.toFixed(2)}, ` +
        `density=${modulationParams.densityMultiplier.toFixed(2)}, register=${modulationParams.registerShift.toFixed(1)}`)

      // STEP 3: Apply modulation to CompositionEngine BEFORE generating composition
      // Gesture velocity → Tempo
      const baseTempo = this.styleAnalyzer.getCurrentStyle()?.tempo || 120
      this.compositionEngine.tempo = Math.round(baseTempo * modulationParams.tempoMultiplier)
      this.compositionEngine.tempo = Math.max(60, Math.min(160, this.compositionEngine.tempo)) // Clamp

      // Gesture density → Note density
      this.compositionEngine.density = Math.max(0.1, Math.min(0.6, modulationParams.densityMultiplier))
      this.compositionEngine.complexityLevel = Math.max(0.1, Math.min(0.6, modulationParams.densityMultiplier))

      // Position Y → Register shift (affects pitch range)
      // Store for composition generation

      // STEP 4: Emit virtual gesture notes (tap/drag) for immediate feedback
      for (const gesture of virtualGestures) {
        await this.emitVirtualGestureNotes(gesture)
      }

      // STEP 5: Add material for ALL sources (for composition engine style analysis)
      for (const source of Object.keys(this.virtualUsers)) {
        this.addVirtualGestureMaterial(source)
      }

      // Update composition count
      this.compositionCount++

      // STEP 6: Generate composition with gesture MODULATION
      const composition = this.compositionEngine.compose({
        roomId: this.landingRoomId,
        userCount: 3, // Three virtual users
        activeUsers: [
          this.virtualUsers.wikipedia.userId,
          this.virtualUsers.hackernews.userId,
          this.virtualUsers.github.userId
        ],
        // PASS modulation parameters to composition
        modulationParams: modulationParams
      })

      console.log(`🎵 Generated ${composition.type} composition:`, {
        form: composition.structure.form,
        section: composition.structure.currentSection,
        tempo: composition.metadata.tempo,
        keyCenter: composition.metadata.keyCenter
      })

      // Broadcast composition to landing room
      if (this.io) {
        this.io.to(this.landingRoomId).emit('background-composition', {
          roomId: this.landingRoomId,
          composition,
          compositionNumber: this.compositionCount,
          modulationParams: modulationParams,
          timestamp: Date.now()
        })

        console.log(`🎵 Broadcast composition #${this.compositionCount} to landing room (gesture-controlled)`)
      } else {
        console.log(`🎵 No Socket.IO instance, composition not broadcast`)
      }

      // Update material library lifecycle
      this.materialLibrary.updateMaterialLifecycle()

    } catch (error) {
      console.error(`🎵 Error generating composition for landing room:`, error)
    }
  }

  /**
   * Emit virtual gesture notes (tap or drag phrases) to frontend
   * @param {Object} gesture - Virtual gesture data
   * @private
   */
  async emitVirtualGestureNotes(gesture) {
    if (!this.io || !this.isRunning) return

    const user = this.virtualUsers[gesture.source]
    const cursor = this.targetPositions[gesture.source]

    if (gesture.type === 'tap') {
      // Tap: single sustained note with variable duration
      const noteId = `virtual_${gesture.source}_tap_${Date.now()}`
      const notePosition = {
        x: cursor.x + (Math.random() - 0.5) * 0.05,
        y: cursor.y + (Math.random() - 0.5) * 0.05
      }

      // Emit hold:start
      this.io.to(this.landingRoomId).emit('hold:start', {
        type: 'hold:start',
        userId: user.userId,
        noteId: noteId,
        frequency: gesture.frequency,
        velocity: gesture.velocity,
        position: notePosition,
        userColor: user.color,
        isRemote: true,
        timestamp: Date.now()
      })

      console.log(`🎵 TAP from ${gesture.source}: ${gesture.frequency.toFixed(1)}Hz (${gesture.duration.toFixed(0)}ms)`)

      // Schedule hold:end
      setTimeout(() => {
        if (this.io && this.isRunning) {
          this.io.to(this.landingRoomId).emit('hold:end', {
            type: 'hold:end',
            userId: user.userId,
            noteId: noteId,
            timestamp: Date.now()
          })
        }
      }, gesture.duration)

    } else if (gesture.type === 'drag' && gesture.notes) {
      // Drag: streaming notes with proper timing
      console.log(`🎵 DRAG from ${gesture.source}: ${gesture.notes.length} notes, interval ${gesture.interval.toFixed(0)}ms`)

      for (const [index, note] of gesture.notes.entries()) {
        const noteId = `virtual_${gesture.source}_drag_${Date.now()}_${index}`
        const notePosition = {
          x: cursor.x + (Math.random() - 0.5) * 0.05,
          y: cursor.y + (Math.random() - 0.5) * 0.05
        }

        // Calculate delay for this note
        const delay = index * gesture.interval

        setTimeout(() => {
          if (!this.io || !this.isRunning) return

          // Emit hold:start
          this.io.to(this.landingRoomId).emit('hold:start', {
            type: 'hold:start',
            userId: user.userId,
            noteId: noteId,
            frequency: note.frequency,
            velocity: note.velocity,
            position: notePosition,
            userColor: user.color,
            isRemote: true,
            timestamp: Date.now()
          })

          // Schedule hold:end
          setTimeout(() => {
            if (this.io && this.isRunning) {
              this.io.to(this.landingRoomId).emit('hold:end', {
                type: 'hold:end',
                userId: user.userId,
                noteId: noteId,
                timestamp: Date.now()
              })
            }
          }, note.duration)
        }, delay)
      }
    }
  }

  /**
   * Start smooth cursor interpolation loop
   * @private
   */
  startCursorInterpolation() {
    if (this.cursorInterpolationTimer) return

    // Update cursor positions every 50ms (20fps)
    this.cursorInterpolationTimer = setInterval(() => {
      if (!this.isRunning) return

      const cursors = {}

      for (const [source, user] of Object.entries(this.virtualUsers)) {
        const current = this.currentPositions[source]
        const target = this.targetPositions[source]

        // Faster interpolation (20% per frame) for more responsive movement
        const easing = 0.2
        const newX = current.x + (target.x - current.x) * easing
        const newY = current.y + (target.y - current.y) * easing

        this.currentPositions[source] = { x: newX, y: newY }

        cursors[source] = {
          userId: user.userId,
          x: newX,
          y: newY,
          color: user.color
        }
      }

      // Broadcast interpolated cursor positions
      if (this.io) {
        this.io.to(this.landingRoomId).emit('virtual-cursors', {
          cursors: cursors,
          timestamp: Date.now()
        })
        // Debug: Log cursor positions every second (every 20th iteration)
        if (Math.random() < 0.05) {
          const cursorInfo = Object.entries(cursors).map(([s, c]) => `${s}:(${c.x.toFixed(2)},${c.y.toFixed(2)})`).join(' ')
          console.log(`🖱️ Virtual cursors: ${cursorInfo}`)
        }
      }
    }, 50)
  }

  /**
   * Update metrics from WebMetricsPoller
   * Called by WebMetricsPoller when new metrics are available
   * @param {Object} newMetrics - New metrics from WebMetricsPoller
   */
  updateMetrics(newMetrics) {
    this.metrics = newMetrics

    // Update target cursor positions based on new metrics
    for (const [source, user] of Object.entries(this.virtualUsers)) {
      this.targetPositions[source] = this.calculateCursorPosition(source, user, this.metrics[source])
    }

    // Broadcast metrics to landing room for dashboard display
    if (this.io && this.isRunning) {
      this.io.to(this.landingRoomId).emit('metrics-update', {
        metrics: this.metrics,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Calculate cursor position for a virtual user
   * Uses HYBRID normalization for X position (no hard thresholds)
   * @param {string} source - Source name
   * @param {Object} user - Virtual user definition
   * @param {Object} metrics - Current metrics
   * @returns {Object} Cursor position {x, y}
   * @private
   */
  calculateCursorPosition(source, user, metrics) {
    let x, y

    switch (source) {
      case 'wikipedia':
        // X: Within left third, based on edit rate (HYBRID normalization)
        const wikiNorm = this.softNormalize(metrics.editsPerMinute, 400, 2000)
        const wikiScaled = Math.pow(wikiNorm, 0.5)
        x = user.region.xMin + (wikiScaled * (user.region.xMax - user.region.xMin))
        // Y: Based on edit size (logarithmic scaling)
        y = 0.1 + Math.min(Math.log10(metrics.avgEditSize + 1) / 4, 0.8)
        break
      case 'hackernews':
        // X: Within center third, based on post rate (HYBRID normalization)
        const hnNorm = this.softNormalize(metrics.postsPerMinute, 60, 300)
        const hnScaled = Math.pow(hnNorm, 0.5)
        x = user.region.xMin + (hnScaled * (user.region.xMax - user.region.xMin))
        // Y: Based on avg upvotes (logarithmic scaling)
        y = 0.1 + Math.min(Math.log10(metrics.avgUpvotes + 1) / 3, 0.8)
        break
      case 'github':
        // X: Within right half, based on commit rate (HYBRID normalization)
        const ghNorm = this.softNormalize(metrics.commitsPerMinute, 5, 50)
        const ghScaled = Math.pow(ghNorm, 0.5)
        x = user.region.xMin + (ghScaled * (user.region.xMax - user.region.xMin))
        // Y: Based on new stars (logarithmic scaling)
        y = 0.1 + Math.min(Math.log10(metrics.newStars + 1) / 2, 0.8)
        // Debug logging (10% sample rate)
        if (Math.random() < 0.1) {
          console.log(`🖱️ GitHub cursor:`, {
            commitsPerMinute: metrics.commitsPerMinute,
            ghNorm: ghNorm.toFixed(3),
            calculatedX: x.toFixed(3),
            region: `${user.region.xMin}-${user.region.xMax}`
          })
        }
        break
    }

    return { x, y }
  }

  /**
   * Get current metrics
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      wikipedia: { ...this.metrics.wikipedia },
      hackernews: { ...this.metrics.hackernews },
      github: { ...this.metrics.github }
    }
  }

  /**
   * Get virtual cursor positions
   * @returns {Object} Virtual cursor positions
   */
  getVirtualCursors() {
    const cursors = {}
    for (const [source, user] of Object.entries(this.virtualUsers)) {
      const pos = this.currentPositions[source]
      cursors[source] = {
        userId: user.userId,
        x: pos.x,
        y: pos.y,
        color: user.color
      }
    }
    return cursors
  }
}

module.exports = LandingCompositionService
