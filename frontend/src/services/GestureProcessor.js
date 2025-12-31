/**
 * GestureProcessor
 * Single-responsibility component for gesture-to-music processing
 * Extracted from WebarmoniumApp (main.js) as part of Sprint 4
 *
 * Responsibilities:
 * - Gesture action determination (tap vs drag - movement-based discrimination)
 * - Click/tap gesture processing (single note generation)
 * - Drag gesture processing (musical phrase generation)
 * - Local phrase generation with musical characteristics
 * - Gesture calculation helpers (speed, pitch, articulation)
 *
 * NOTE: Tap/drag discrimination now happens in real-time based on MOVEMENT (not time)
 * - EnhancedGestureCapture sets gesture.action='drag' when movement > 15px threshold
 * - No setTimeout delays - immediate processing for responsive instrumental feel
 */

class GestureProcessor {
  /**
   * @param {Object} audioService - AudioService instance for sound generation
   * @param {Object} socketService - SocketService instance for gesture transmission
   * @param {Function} drawGestureTrailCallback - Callback for visual gesture trails
   */
  constructor(audioService, socketService, drawGestureTrailCallback) {
    this.audioService = audioService
    this.socketService = socketService
    this.drawGestureTrailCallback = drawGestureTrailCallback

    // Drag phrase throttling
    this.lastDragPhraseTime = 0

    // Tap call counter for debugging
    this.tapCallCount = 0
  }

  /**
   * Main entry point for gesture processing
   * @param {Object} gesture - Gesture data
   * @param {boolean} isAudioStarted - Whether audio system is active
   */
  processGesture(gesture, isAudioStarted) {
    // CRITICAL CHECK: If drag streaming was active, notes already played in real-time
    // Skip local note generation to avoid doubling
    if (gesture.streamingWasActive) {
      // Still send to backend for multi-user sync
      const gestureToSend = {
        ...gesture,
        position: gesture.coordinates || gesture.position || { x: 0.5, y: 0.5 }
      }

      this.socketService.sendGesture(gestureToSend)

      // Draw trail if needed
      if (this.drawGestureTrailCallback) {
        this.drawGestureTrailCallback(gesture)
      }

      return // Exit early - no local audio processing needed
    }

    // CRITICAL FIX: Backend expects gesture.position { x, y } for pitch calculation
    // Frontend has gesture.coordinates but backend looks for gesture.position
    const gestureToSend = {
      ...gesture,
      position: gesture.coordinates || gesture.position || { x: 0.5, y: 0.5 }
    }

    // DEBUG: Verify position is set before sending
    // console.log('🔧 GESTURE PROCESSOR - Before sendGesture:', {
      hasCoordinates: !!gesture.coordinates,
      coordinates: gesture.coordinates,
      hasPosition: !!gestureToSend.position,
      position: gestureToSend.position,
      gestureAction: gesture.action
    })

    // Send gesture to server with position field
    this.socketService.sendGesture(gestureToSend)

    // Handle different gesture types for local audio
    if (!isAudioStarted) {
      // console.log('🎵 Gesture captured but audio not started')
      if (this.drawGestureTrailCallback) {
        this.drawGestureTrailCallback(gesture)
      }
      return
    }

    // CRITICAL FIX: Use timer to distinguish click from drag
    const gestureAction = gesture.action || this.determineGestureAction(gesture)
    // console.log('🔍 Determined gesture action:', gestureAction, 'from gesture.action:', gesture.action)

    // Clear any existing timer
    if (this.gestureTimer) {
      clearTimeout(this.gestureTimer)
      this.gestureTimer = null
    }

    const sonicParams = {
      x: gesture.coordinates.x,
      y: gesture.coordinates.y,
      intensity: gesture.intensity,
      timestamp: gesture.timestamp,
      action: gestureAction,
      device: gesture.device
    }

    // CRITICAL FIX: Immediate handling based on movement-based action discrimination
    // No setTimeout delays - tap/drag discrimination happens in real-time based on movement
    if (gestureAction === 'tap') {
      // Immediate handling for tap/click
      // console.log('🎯 TAP branch - calling processClickGesture')
      this.processClickGesture(gesture, sonicParams)
    } else if (gestureAction === 'drag') {
      // IMMEDIATE handling for drag - no delay!
      // Note: If streaming was active, we already returned early at line 47
      // This only processes drag gestures where streaming didn't activate (rare edge case)
      // console.log('🎯 DRAG branch - IMMEDIATE processing (no setTimeout)')
      this.processDragGesture(gesture, sonicParams)
    } else {
      // Fallback to original logic
      // console.log('🚯 ELSE branch - calling processGestureByAction for action:', gestureAction)
      this.processGestureByAction(gesture, sonicParams)
    }
  }

  /**
   * Process click/tap gestures - single note
   * @param {Object} gesture - Gesture data
   * @param {Object} sonicParams - Sonic parameters
   */
  processClickGesture(gesture, sonicParams) {
    // console.log('🎵 Processing TAP gesture - single note')
    // console.log('🎵 TAP gesture ID:', gesture.id, 'call count:', (this.tapCallCount = (this.tapCallCount || 0) + 1))

    if (this.audioService && this.audioService.playThreeTierNote) {
      // Calculate frequency using BOTH X and Y for maximum variation
      // Y controls octave range, X controls frequency within octave
      const octaveBase = 110 + (1 - sonicParams.y) * 440 // 110-550Hz (A2 to C#5)
      const withinOctave = sonicParams.x * 660 // 0-660Hz variation within octave
      const frequency = octaveBase + withinOctave // 110Hz to 1210Hz total range

      const tier = sonicParams.x < 0.33 ? 'background' : sonicParams.x < 0.67 ? 'remote' : 'local'

      // console.log(`🎵 Playing CLICK note: ${frequency.toFixed(1)}Hz (y=${sonicParams.y.toFixed(2)}, x=${sonicParams.x.toFixed(2)}), tier: ${tier}`)

      // Play single note directly - BYPASS three-tier system for TAP
      // This ensures our X/Y frequency calculation is respected
      // console.log('🔍 TAP intensity check:', {
        gestureIntensity: gesture.intensity,
        sonicIntensity: sonicParams.intensity,
        positionX: sonicParams.x,
        positionY: sonicParams.y
      })
      const noteVolume = 0.5 // FIXED volume - remove intensity modulation from clicks
      const noteDuration = '32n' // Very short duration for clicks

      // Direct synth access to bypass three-tier frequency mapping
      if (this.audioService.gestureSynth) {
        // Configure synth directly for short, percussive notes
        this.audioService.gestureSynth.set({
          oscillator: {
            type: tier === 'background' ? 'triangle' :
                   tier === 'remote' ? 'square' : 'sawtooth'
          },
          envelope: {
            attack: 0.01,    // Very fast attack (10ms)
            decay: 0.05,     // Quick decay (50ms)
            sustain: 0.1,    // Low sustain level (10%)
            release: 0.1     // Short release (100ms)
          }
        })

        // Trigger note directly with our calculated frequency
        this.audioService.gestureSynth.triggerAttackRelease(
          frequency,
          noteDuration,
          Tone.now(),
          noteVolume
        )

        // console.log(`🎵 DIRECT TAP note: ${frequency.toFixed(1)}Hz (y=${sonicParams.y.toFixed(2)}, x=${sonicParams.x.toFixed(2)}), tier: ${tier}`)
      }
    }
  }

  /**
   * Process drag gestures - musical phrase
   * @param {Object} gesture - Gesture data
   * @param {Object} sonicParams - Sonic parameters
   */
  processDragGesture(gesture, sonicParams) {
    // console.log('🎵 Processing DRAG gesture - musical phrase')
    // console.log('🎵 Drag details:', {
      velocity: gesture.velocity,
      dx: gesture.dx,
      dy: gesture.dy,
      position: gesture.coordinates
    })

    // CRITICAL FIX: Limit drag phrase generation to prevent polyphony overload
    const now = Date.now()
    if (this.lastDragPhraseTime && (now - this.lastDragPhraseTime) < 500) {
      // console.log('🚫 Drag phrase throttled - too recent')
      return
    }
    this.lastDragPhraseTime = now

    // PHASE 6 FIX: Use generateLocalMusicalPhrase for gesture-responsive phrases
    // This creates phrases with variable rhythm, articulation, and pitch based on:
    // - Velocity → noteCount (2-5 notes)
    // - Speed → baseDuration (0.25s-1.0s)
    // - Position → pitch range
    // - Note index → articulation (accent, legato, staccato)
    this.generateLocalMusicalPhrase(gesture, sonicParams)
  }

  /**
   * Fallback gesture processing by action
   * @param {Object} gesture - Gesture data
   * @param {Object} sonicParams - Sonic parameters
   */
  processGestureByAction(gesture, sonicParams) {
    // console.log('🚨 FALLBACK gesture processing for action:', sonicParams.action)
    // console.log('🚨 This should not happen for tap/drag - check logic!')

    // Simple fallback - generate single note
    if (this.audioService && this.audioService.playThreeTierNote) {
      const frequency = 440 // Simple fallback frequency
      this.audioService.playThreeTierNote(frequency, 'local', 100, { volume: 0.5 })
    }
  }

  /**
   * Generate local musical phrase for drag gestures
   * FIX: Added local phrase generation for immediate feedback
   * @param {Object} gesture - Gesture data
   * @param {Object} sonicParams - Sonic parameters
   */
  generateLocalMusicalPhrase(gesture, sonicParams) {
    if (!this.audioService || !this.audioService.isInitialized) {
      // console.log('🔇 AudioService not initialized for phrase generation')
      return
    }

    try {
      // Create musical phrase locally based on gesture characteristics
      const phrase = this.createLocalPhrase(gesture, sonicParams)

      // console.log(`🎵 Generated local phrase with ${phrase.length} notes`)

      // Play each note in the phrase
      phrase.forEach((note, index) => {
        setTimeout(() => {
          try {
            const musicalEvent = {
              pitch: note.pitch,
              velocity: note.velocity,
              duration: note.duration,
              articulation: note.articulation,
              eventType: 'melodic'
            }

            this.audioService.playMusicalEvent(musicalEvent)
          } catch (e) {
            // console.warn(`🔇 Error playing phrase note ${index}:`, e)
          }
        }, note.startTime * 1000) // Convert seconds to milliseconds
      })

    } catch (error) {
      // console.error('🔇 Error generating local phrase:', error)
    }
  }

  /**
   * Create local musical phrase from gesture
   * @param {Object} gesture - Gesture data
   * @param {Object} sonicParams - Sonic parameters
   * @returns {Array} Musical phrase data
   */
  createLocalPhrase(gesture, sonicParams) {
    const phrase = []

    // Calculate gesture characteristics
    const gestureSpeed = this.calculateGestureSpeed(gesture)
    const gestureLength = this.calculateGestureLength(gesture)
    const pitchRange = this.calculatePitchRange(sonicParams)

    // PHASE 6 FIX: Calculate noteCount from gesture velocity (2-5 notes)
    const velocityCalc = Math.sqrt((gesture.dx || 0) ** 2 + (gesture.dy || 0) ** 2) * 10
    const velocity = gesture.velocity || velocityCalc || 100
    const safeVelocity = typeof velocity === 'number' && !isNaN(velocity) ? velocity : 100

    // DEBUG: Enhanced velocity-based note count with better scaling
    // Problem: velocity was always ~100, giving always 4 notes
    // Solution: Use duration and intensity as additional factors
    const duration = gesture.duration || 500
    const intensity = gesture.intensity || 0.5

    // Scale factors:
    // - Fast drag (short duration) → fewer notes
    // - Slow drag (long duration) → more notes
    // - High intensity → more notes
    const durationFactor = Math.min(duration / 500, 2.0) // 0.5-2.0x based on duration
    const intensityFactor = 0.5 + intensity // 0.5-1.5x based on intensity
    const adjustedVelocity = safeVelocity * durationFactor * intensityFactor

    const noteCount = Math.max(2, Math.min(5, Math.floor(adjustedVelocity / 25)))

    // COMPOSITIONAL ENHANCEMENT: Select musical scale and melodic contour
    const timeSeed = Date.now() % 1000 // Use timestamp for variation
    const { scaleType, contourType } = this.selectMelodicContour(gesture, sonicParams, timeSeed)
    const contourPattern = this.generateContourPattern(contourType, noteCount)
    const contourData = { scaleType, contourType, contourPattern }

    // console.log(`🎼 Local: ${scaleType} ${contourType}, ${noteCount} notes`)

    let baseDuration

    if (gestureSpeed < 0.3) {
      // Slow gesture: longer notes
      baseDuration = 1.0 // 1 second base
    } else if (gestureSpeed < 0.7) {
      // Medium gesture: moderate notes
      baseDuration = 0.5 // 0.5 second base
    } else {
      // Fast gesture: shorter notes
      baseDuration = 0.25 // 0.25 second base
    }

    // Generate notes with regular rhythm patterns
    let currentTime = 0
    for (let i = 0; i < noteCount; i++) {
      // Create rhythmic variations based on note position
      let duration
      let articulation

      if (i === 0) {
        // First note: slightly longer for emphasis
        duration = baseDuration * 1.2
        articulation = 'accent'
      } else if (i === noteCount - 1) {
        // Last note: slightly longer for resolution
        duration = baseDuration * 1.1
        articulation = 'legato'
      } else if (i % 2 === 1) {
        // Odd positions: shorter for rhythmic interest
        duration = baseDuration * 0.8
        articulation = 'staccato'
      } else {
        // Even positions: base duration
        duration = baseDuration
        articulation = 'legato'
      }

      // COMPOSITIONAL ENHANCEMENT: Use musical scale and contour for pitch
      const pitch = this.calculateNoteFromGesture(sonicParams, i, noteCount, pitchRange, contourData)

      // Vary velocity based on position in phrase (crescendo/diminuendo)
      const velocityVariation = Math.sin((i / (noteCount - 1)) * Math.PI) // 0 → 1 → 0
      const noteVelocity = 50 + velocityVariation * 30 // 50-80 range with musical shape

      phrase.push({
        pitch,
        velocity: noteVelocity,
        duration,
        articulation,
        startTime: currentTime
      })

      // FIX: Regular rhythmic spacing
      currentTime += duration * 0.9 // Notes overlap slightly for musical effect
    }

    return phrase
  }

  /**
   * Simplified gesture action determination
   * @param {Object} gesture - Gesture data
   * @returns {string} Action type ('hover', 'drag', 'tap')
   */
  determineGestureAction(gesture) {
    // SIMPLIFIED LOGIC: Let the EnhancedGestureCapture handle most classification
    // We use duration as primary indicator for tap vs drag

    const duration = gesture.duration || 0
    const size = gesture.size || 0

    // console.log('🔍 Simplified gesture classification:', {
      duration: duration,
      size: size,
      direction: gesture.direction
    })

    // Simple tap: very short duration, minimal movement
    if (duration < 200 && size < 0.05) {
      // console.log('🔍 TAP - very short and small')
      return 'tap'
    }

    // Everything else is treated as drag for musical purposes
    // console.log('🔍 DRAG - default musical gesture')
    return 'drag'
  }

  /**
   * Calculate gesture speed from movement data
   * @param {Object} gesture - Gesture data
   * @returns {number} Speed (0-1)
   */
  calculateGestureSpeed(gesture) {
    // Use actual speed from gesture if available
    return gesture.speed || Math.random() * 0.8 + 0.1
  }

  /**
   * Calculate gesture length/intensity
   * @param {Object} gesture - Gesture data
   * @returns {number} Length/intensity (0-1)
   */
  calculateGestureLength(gesture) {
    return gesture.intensity || 0.5
  }

  /**
   * Calculate pitch range from gesture position
   * @param {Object} sonicParams - Sonic parameters
   * @returns {Object} Pitch range
   */
  calculatePitchRange(sonicParams) {
    // Map Y position to pitch range (inverted: top = high notes)
    const normalizedY = 1 - (sonicParams.y || 0.5)
    return {
      min: 40 + normalizedY * 30,
      max: 60 + normalizedY * 40
    }
  }

  /**
   * COMPOSITIONAL ENHANCEMENT: Get musical scale intervals
   * Uses centralized MusicalScales utility to eliminate duplication
   * @param {string} scaleType - Scale type (major, minor, pentatonic, blues, dorian)
   * @returns {Array} Intervals in semitones from root
   */
  getScaleIntervals(scaleType) {
    // Use centralized MusicalScales utility
    return window.MusicalScales.getScale(scaleType)
  }

  /**
   * COMPOSITIONAL ENHANCEMENT: Select melodic contour based on gesture
   * @param {Object} gesture - Gesture data
   * @param {Object} sonicParams - Sonic parameters
   * @param {number} timeSeed - Timestamp-based seed for variation (0-999)
   * @returns {Object} Contour data { type, intervals }
   */
  selectMelodicContour(gesture, sonicParams, timeSeed = 0) {
    // Use gesture direction to influence contour choice
    const dx = gesture.dx || 0
    const dy = gesture.dy || 0
    const velocity = gesture.velocity || 100

    // FIX: Add time-based variation to scale selection (prevents pattern repetition)
    // Use timeSeed to slightly shift boundaries
    const scaleShift = (timeSeed / 1000) * 0.1 // 0-0.1 shift

    // Determine scale type from X position (harmonic context) with variation
    let scaleType
    const x = sonicParams.x
    if (x < 0.2 + scaleShift) scaleType = 'pentatonic' // Left: Simple, consonant
    else if (x < 0.4 + scaleShift) scaleType = 'major' // Center-left: Major
    else if (x < 0.6 + scaleShift) scaleType = 'dorian' // Center-right: Modal
    else if (x < 0.8) scaleType = 'blues' // Right: Blues/tension
    else scaleType = timeSeed % 2 === 0 ? 'phrygian' : 'lydian' // Far right: Exotic modes

    // Determine contour type from gesture direction
    let contourType
    if (Math.abs(dx) > Math.abs(dy) * 2) {
      // Horizontal gesture
      contourType = dx > 0 ? 'ascending' : 'descending'
    } else if (Math.abs(dy) > Math.abs(dx) * 2) {
      // Vertical gesture
      contourType = dy > 0 ? 'arch' : 'valley'
    } else if (velocity > 150) {
      // Fast gesture
      contourType = 'zigzag'
    } else {
      // Slow/moderate gesture - add time-based variation
      contourType = timeSeed % 3 === 0 ? 'wave' : (timeSeed % 3 === 1 ? 'arch' : 'valley')
    }

    return { scaleType, contourType }
  }

  /**
   * COMPOSITIONAL ENHANCEMENT: Generate melodic contour pattern
   * @param {string} contourType - Type of melodic contour
   * @param {number} noteCount - Number of notes
   * @returns {Array} Scale degree indices (0-based)
   */
  generateContourPattern(contourType, noteCount) {
    const patterns = {
      ascending: (n) => Array.from({ length: n }, (_, i) => i), // 0,1,2,3,4
      descending: (n) => Array.from({ length: n }, (_, i) => n - 1 - i), // 4,3,2,1,0
      arch: (n) => Array.from({ length: n }, (_, i) => i < n/2 ? i*2 : (n-1-i)*2), // 0,2,4,2,0
      valley: (n) => Array.from({ length: n }, (_, i) => i < n/2 ? (n-1-i*2) : i*2-n+1), // 4,2,0,2,4
      wave: (n) => Array.from({ length: n }, (_, i) => Math.floor(Math.sin(i * Math.PI / (n-1)) * (n-1))), // Sine wave
      zigzag: (n) => Array.from({ length: n }, (_, i) => i % 2 === 0 ? i : n - 1 - i) // 0,4,2,2,4
    }

    const pattern = patterns[contourType] || patterns.ascending
    return pattern(noteCount)
  }

  /**
   * COMPOSITIONAL ENHANCEMENT: Calculate note pitch with musical structure
   * @param {Object} sonicParams - Sonic parameters
   * @param {number} noteIndex - Note index in phrase
   * @param {number} totalNotes - Total notes in phrase
   * @param {Object} pitchRange - Pitch range
   * @param {Object} contourData - Melodic contour data
   * @returns {number} MIDI pitch
   */
  calculateNoteFromGesture(sonicParams, noteIndex, totalNotes, pitchRange, contourData = null) {
    // OLD BEHAVIOR (random walk) - kept as fallback
    if (!contourData) {
      const position = noteIndex / (totalNotes - 1 || 1)
      const pitch = pitchRange.min + (pitchRange.max - pitchRange.min) * position
      return Math.round(pitch)
    }

    // NEW BEHAVIOR: Use musical scales and contours
    const { scaleType, contourType, contourPattern } = contourData

    // Get scale intervals
    const scaleIntervals = this.getScaleIntervals(scaleType)

    // Get contour index for this note
    const scaleIndex = contourPattern[noteIndex] % scaleIntervals.length

    // Calculate root note from pitch range
    const rootMIDI = Math.round(pitchRange.min)

    // Apply scale interval to get final pitch
    const scaleDegree = scaleIntervals[scaleIndex]
    const octaveShift = Math.floor(contourPattern[noteIndex] / scaleIntervals.length) * 12

    return rootMIDI + scaleDegree + octaveShift
  }

  /**
   * Select articulation based on gesture characteristics
   * @param {Object} gesture - Gesture data
   * @param {number} noteIndex - Note index
   * @param {number} totalNotes - Total notes
   * @returns {string} Articulation type
   */
  selectArticulationFromGesture(gesture, noteIndex, totalNotes) {
    // Use gesture intensity to determine articulation
    const intensity = gesture.intensity || 0.5

    if (noteIndex === 0) return 'accent' // First note accented
    if (noteIndex === totalNotes - 1) return 'legato' // Last note legato

    if (intensity > 0.7) {
      return Math.random() > 0.5 ? 'staccato' : 'accent'
    } else if (intensity < 0.3) {
      return 'legato'
    } else {
      return Math.random() > 0.6 ? 'staccato' : 'default'
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.audioService = null
    this.socketService = null
    this.drawGestureTrailCallback = null

    // console.log('✅ GestureProcessor: Cleaned up')
  }
}

// Make GestureProcessor available globally
if (typeof window !== 'undefined') {
  window.GestureProcessor = GestureProcessor
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GestureProcessor
}
