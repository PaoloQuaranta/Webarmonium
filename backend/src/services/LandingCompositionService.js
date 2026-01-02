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
   * Further lowered thresholds for HN and GitHub for more movement
   * @param {string} source - Source name
   * @returns {number} Activity level
   * @private
   */
  calculateActivityLevel(source) {
    const metrics = this.metrics[source]
    switch (source) {
      case 'wikipedia':
        return Math.min(1.0, metrics.editsPerMinute / 400) // ~300 edits = 0.75
      case 'hackernews':
        return Math.min(1.0, metrics.postsPerMinute / 60) // 60 posts = 1.0
      case 'github':
        return Math.min(1.0, metrics.commitsPerMinute / 20) // 25 commits = 1.25→capped
      default:
        return 0
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
   * Schedule next composition (same pattern as BackgroundCompositionService)
   * @private
   */
  scheduleNextComposition() {
    if (!this.isRunning) return

    // Calculate interval based on tempo and activity
    const currentStyle = this.styleAnalyzer.getCurrentStyle()
    const tempo = currentStyle.tempo || 120

    // Higher activity = more frequent compositions
    const activity = this.calculateOverallActivity()

    // Generate compositions every 8-16 beats (musically natural)
    const beatsPerComposition = 8 + Math.random() * 8
    const beatDuration = 60000 / tempo
    const interval = beatsPerComposition * beatDuration

    // Scale interval by activity (high activity = more frequent)
    const activityScaledInterval = interval * (1.5 - activity * 0.5)

    // Clamp to reasonable bounds
    const clampedInterval = Math.max(2000, Math.min(15000, activityScaledInterval))

    this.compositionTimer = setTimeout(() => {
      this.generateAndBroadcastComposition()
      this.scheduleNextComposition()
    }, clampedInterval)

    console.log(`🎵 Next composition in ${(clampedInterval / 1000).toFixed(1)}s (${beatsPerComposition.toFixed(0)} beats @ ${tempo} BPM, activity: ${activity.toFixed(2)})`)
  }

  /**
   * Generate and broadcast composition using CompositionEngine (same pattern as BackgroundCompositionService)
   * EMITS ONLY ONE MONOPHONIC NOTE per composition cycle to avoid polyphony
   * @private
   */
  async generateAndBroadcastComposition() {
    try {
      console.log(`🎵 Generating composition for landing room`)

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

      // CRITICAL: Select ONLY ONE virtual user to emit a note (MONOPHONIC)
      const sources = Object.keys(this.virtualUsers)
      const selectedSource = sources[Math.floor(Math.random() * sources.length)]

      const virtualGesture = this.generateVirtualGesture(selectedSource)
      const user = this.virtualUsers[selectedSource]

      if (virtualGesture.notes && virtualGesture.notes.length > 0) {
        // Use ONLY THE FIRST NOTE (monophonic)
        const note = virtualGesture.notes[0]
        const noteId = `virtual_${selectedSource}_${Date.now()}_0`
        const noteDuration = 500 + Math.random() * 700 // 500-1200ms

        // Calculate note position
        const cursor = this.targetPositions[selectedSource]
        const notePosition = {
          x: cursor.x + (Math.random() - 0.5) * 0.05,
          y: cursor.y + (Math.random() - 0.5) * 0.05
        }

        // Emit the SINGLE note
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

          console.log(`🎵 MONOPHONIC note from ${selectedSource}: ${note.frequency.toFixed(1)}Hz`)

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
          }, noteDuration)
        }, 100) // Small delay to ensure smooth playback
      }

      // Add material for ALL sources (for composition engine)
      for (const source of Object.keys(this.virtualUsers)) {
        this.addVirtualGestureMaterial(source)
      }

      // Update composition count
      this.compositionCount++

      // Generate composition using CompositionEngine (same as BackgroundCompositionService)
      const composition = this.compositionEngine.compose({
        roomId: this.landingRoomId,
        userCount: 3, // Three virtual users
        activeUsers: [
          this.virtualUsers.wikipedia.userId,
          this.virtualUsers.hackernews.userId,
          this.virtualUsers.github.userId
        ]
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
          timestamp: Date.now()
        })

        console.log(`🎵 Broadcast composition #${this.compositionCount} to landing room`)
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
   * Updated thresholds to match activity calculation
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
        // X: Within left third, based on edit rate (threshold 400)
        const wikiNorm = Math.min(metrics.editsPerMinute / 400, 1.0)
        const wikiScaled = Math.pow(wikiNorm, 0.5)
        x = user.region.xMin + (wikiScaled * (user.region.xMax - user.region.xMin))
        // Y: Based on edit size
        y = 0.1 + Math.min(Math.log10(metrics.avgEditSize + 1) / 4, 0.8)
        break
      case 'hackernews':
        // X: Within center third, based on post rate (threshold 60)
        const hnNorm = Math.min(metrics.postsPerMinute / 60, 1.0)
        const hnScaled = Math.pow(hnNorm, 0.5)
        x = user.region.xMin + (hnScaled * (user.region.xMax - user.region.xMin))
        // Y: Based on avg upvotes
        y = 0.1 + Math.min(Math.log10(metrics.avgUpvotes + 1) / 3, 0.8)
        break
      case 'github':
        // X: Within right half, based on commit rate (threshold 5 - LOWERED for more movement)
        const ghNorm = Math.min(metrics.commitsPerMinute / 5, 1.0) // Was 20, now 5 for more movement
        const ghScaled = Math.pow(ghNorm, 0.5)
        x = user.region.xMin + (ghScaled * (user.region.xMax - user.region.xMin))
        // Y: Based on new stars
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
