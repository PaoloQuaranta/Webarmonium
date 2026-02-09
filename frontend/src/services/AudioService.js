/**
 * AudioService
 * Real-time audio parameter mapping and sonic feedback coordination
 * Constitutional requirement: <200ms gesture-to-sound latency, 60fps parameter updates
 *
 * Enhanced with MusicalScheduler for clock-consistent timing and LFOManager for advanced modulation
 */

// DEBUG: Verify file is loaded
// console.log('🔴🔴🔴 AudioService.js v36 LOADING 🔴🔴🔴')

// DEBUG FLAG: Enable/disable audio state machine logging
// Set to true for debugging, false for production to reduce console spam
// Can also be enabled via URL: ?debug=audio
const DEBUG_AUDIO_STATE = typeof window !== 'undefined' &&
  (window.location?.search?.includes('debug=audio') || false)

// Note: MusicalScheduler and LFOManager will be loaded via global scripts
class AudioService {
  constructor() {
    this.isInitialized = false
    this.audioEngine = null
    this.gestureCapture = null

    // AUDIO STATE MACHINE (replaces _userStoppedAudio and _userExplicitlyStartedAudio)
    // States: IDLE, STARTING, PLAYING, PAUSED, RESUMING, STOPPED
    this._audioState = 'IDLE'
    this._handlersRegistered = false

    // Entry #73: Device-Adaptive Audio Architecture
    this.stressMonitor = null
    this.audioProfile = null
    this.isUltraLowPowerMode = false
    this.ultraLowPowerAudio = null

    // CRITICAL: Track all scheduled timeouts for cleanup on stop
    this.scheduledTimeouts = []

    // REAL-TIME AUDIO FIX: Track Transport-scheduled events for proper cleanup
    this.scheduledTransportEvents = []

    // PERFORMANCE FIX: Track ALL drone repeat events (not just one)
    this.droneRepeatEventIds = []

    // Entry #191: Throttling for reverb decay changes (CPU-intensive impulse response regeneration)
    this._lastReverbDecayChange = 0
    this._reverbDecayThrottleMs = 2000 // Minimum 2s between decay changes

    // PERF: Platform detection for audio buffer optimization
    // Windows Chrome has higher audio latency and needs larger buffers
    this._isWindowsChrome = this._detectWindowsChrome()
    this._audioConfigured = false

    // New musical architecture services
    this.musicalScheduler = null; // Will be initialized after scripts are loaded
    this.lfoManager = null; // Will be initialized after audio context

    // Volume control (extracted component - Sprint 2 refactoring)
    this.volumeController = new VolumeController()

    // Entry #28: Drone void controller - makes drone emerge during activity voids
    this.droneVoidController = null

    // Entry #198: Composition queue for sequential playback (code review fixes)
    this._compositionQueue = []
    this._isPlayingComposition = false
    this._nextCompositionEventId = null  // Tone.Transport event ID
    this.MAX_COMPOSITION_QUEUE_SIZE = 3  // Prevent unbounded growth

    // Mute and volume controls (DEPRECATED: use volumeController instead)
    this.muted = false
    this.volume = 1.0 // 0-1 range

    // Color-to-frequency mapping (10-color pool: 3 virtual + 7 real)
    // Virtual user colors (metrics): magenta, cyan, viola
    // Real user colors (hue intermedi): lime, orange, teal, yellow, pink, sky, green
    this.colorPool = [
      '#ff2d92', '#00d4ff', '#a855f7',  // Virtual users (Wikipedia, HackerNews, GitHub)
      '#a3e635', '#fb923c', '#2dd4bf', '#facc15', '#f472b6', '#38bdf8', '#22c55e'  // Real users
    ]
    this.colorFrequencyRange = { min: 200, max: 800 } // Hz

    // Parameter mapping configuration
    this.parameterMappings = {
      frequency: {
        range: [220, 880], // A3 to A5
        curve: 'linear',   // linear, exponential, logarithmic
        smoothing: 0.1
      },
      amplitude: {
        range: [0.1, 0.8],
        curve: 'exponential',
        smoothing: 0.2
      },
      filter: {
        range: [200, 2000],
        curve: 'logarithmic',
        smoothing: 0.15
      },
      pan: {
        range: [-1, 1],
        curve: 'linear',
        smoothing: 0.05
      }
    }

    // Real-time parameter state (maintained for backward compatibility)
    this.currentParameters = {
      frequency: 440,
      amplitude: 0.5,
      waveform: 'sawtooth',
      filter: {
        type: 'none',
        cutoffFrequency: 1000,
        resonance: 1
      },
      envelope: {
        attack: 0.1,
        decay: 0.2,
        sustain: 0.7,
        release: 0.5
      },
      spatialParams: {
        pan: 0,
        distance: 0.5,
        reverbAmount: 0.2,
        elevation: 0
      },
      // Three-tier specific parameters
      tier: 'local',  // default tier for gestures
      velocity: 200,
      hysteresisThreshold: 0.15
    }

    // Collaborative pattern rate limiting
    this.lastCollaborativePatternTime = 0
    this.lastCollaborativePatterns = null

    // Ambient synth state tracking
    this.ambientSynthActive = false

    // Remote LFO for filter cutoff modulation
    this.remoteFilterLFO = null
    this.remoteLFOTargetFilters = new Set()

    // Track connected users for dynamic modulation scaling
    this.activeRemoteUsers = new Set()
    this.lastUserCountUpdate = Date.now()

    // Track last hover activity for timeout system
    this.lastHoverTime = 0
    this.hoverTimeoutDuration = 500 // 500ms timeout for hover inactivity
    this.hoverTimeoutTimer = null

    // Filter modulation throttling to prevent stuttering
    this.lastFilterUpdateTime = 0
    this.filterUpdateInterval = 50 // 50ms = 20 updates per second maximum
    this.lastFilterLogTime = 0

    // Entry #60: Separate throttle for ambient filters (slow is more musical)
    // Ambient filters don't need rapid updates - smooth transitions sound better
    this.lastAmbientFilterUpdateTime = 0
    this.ambientFilterUpdateInterval = 200 // 5Hz universal - slow is more musical

    // LFO system stub - SIMPLIFIED
    // PERF: Removed setInterval(30Hz) implementation that competed with main thread
    // The original code was already disabled via disableAllLFOSystems() but still
    // allocated timers and callbacks. Now it's a minimal stub for API compatibility.
    // Real LFO modulation uses Tone.LFO (audio thread): droneAmplitudeLFO, dronePitchLFO
    this.lfoSystem = {
      isActive: false,
      currentLFOValue: 0,
      localCutoff: 1000,
      remoteAmplitude: 0.5,
      remoteSpeed: 1.0,
      // Stub methods for cleanup compatibility
      init() { this.isActive = false; this.currentLFOValue = 0 },
      start() { /* disabled - use Tone.LFO instead */ },
      stop() { this.isActive = false },
      update() { return 0 },
      getModulatedCutoff() { return this.localCutoff },
      getCurrentLFOValue() { return 0 },
      isLFOActive() { return false }
    }

    // DEFERRED HANDLER REGISTRATION: Handlers are now registered only when start() is called
    // This prevents audio from auto-starting before user clicks Start button
    // See _registerRecoveryHandlers() and _unregisterRecoveryHandlers()
    this._boundVisibilityHandler = this._handleVisibilityChange.bind(this)
    this._boundFocusHandler = this._handleWindowFocus.bind(this)
    this._boundBlurHandler = this._handleWindowBlur.bind(this)
    this._boundPageShowHandler = this._handlePageShow.bind(this)
    this._boundPageHideHandler = this._handlePageHide.bind(this)
    // NOTE: Event listeners are NOT added here - they are added in _registerRecoveryHandlers()

    // Audio recovery configuration constants
    this._recoveryConfig = {
      MAX_WAKE_RECOVERY_ATTEMPTS: 3,
      MAX_RESUME_ATTEMPTS: 3,
      MAX_RESUME_ATTEMPTS_AGGRESSIVE: 5,
      RESUME_POLL_TIMEOUT_MS: 300,
      RESUME_POLL_INTERVAL_MS: 20,
      ANDROID_SUSPEND_RESUME_DELAY_MS: 50,
      ANDROID_SUSPEND_RESUME_WAIT_MS: 100,
      HEALTH_CHECK_INTERVAL_MOBILE_MS: 5000,  // 5 seconds on mobile (battery saving)
      HEALTH_CHECK_INTERVAL_DESKTOP_MS: 3000, // 3 seconds on desktop
      HEALTH_CHECK_INITIAL_DELAY_MS: 1000,
      FOCUS_STABILIZATION_DELAY_MS: 100,
      IOS_UNLOCK_VOLUME_DB: -60,  // Very quiet on iOS (not silent)
      IOS_UNLOCK_DURATION_MS: 100
    }

    // Audio health monitoring state
    this._audioHealthCheckInterval = null
    this._wakeRecoveryAttempts = 0
    this._maxWakeRecoveryAttempts = this._recoveryConfig.MAX_WAKE_RECOVERY_ATTEMPTS

    // Entry #PERF: Exponential backoff for health checks
    // After consecutive healthy checks, increase interval to reduce CPU usage
    // Entry #PERF-FIX: Reduced max interval from 60s to 20s for mobile
    // Mobile audio contexts suspend frequently, need faster recovery
    this._consecutiveHealthyChecks = 0
    this._currentHealthCheckInterval = null // Will be set in _startAudioHealthCheck
    this._maxHealthCheckInterval = 20000    // Max 20 seconds between checks when healthy

    // Concurrency guard for recovery
    this._recoveryInProgress = false
    this._pendingRecoveryTrigger = null

    // Platform detection for recovery behavior
    this._isIOS = typeof PlatformDetection !== 'undefined' && PlatformDetection.isIOS
      ? PlatformDetection.isIOS()
      : /iPad|iPhone|iPod/.test(navigator.userAgent)
    this._isMobile = typeof PlatformDetection !== 'undefined' && PlatformDetection.isMobile
      ? PlatformDetection.isMobile()
      : /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

    // REMOVED: _userStoppedAudio and _userExplicitlyStartedAudio
    // These boolean flags have been replaced by the _audioState state machine
    // See constructor: this._audioState = 'IDLE' | 'STARTING' | 'PLAYING' | 'PAUSED' | 'RESUMING' | 'STOPPED'

    // Entry #HarmonicCoherence: Harmonic state for scale quantization of remote frequencies
    this.currentKey = 'C'
    this.currentMode = 'ionian'
    this.currentScaleIntervals = [0, 2, 4, 5, 7, 9, 11] // Default ionian

    // Mode to interval mapping (matches backend HarmonicEngine)
    this.modeIntervals = {
      ionian: [0, 2, 4, 5, 7, 9, 11],
      dorian: [0, 2, 3, 5, 7, 9, 10],
      phrygian: [0, 1, 3, 5, 7, 8, 10],
      lydian: [0, 2, 4, 6, 7, 9, 11],
      mixolydian: [0, 2, 4, 5, 7, 9, 10],
      aeolian: [0, 2, 3, 5, 7, 8, 10],
      locrian: [0, 1, 3, 5, 6, 8, 10],
      major: [0, 2, 4, 5, 7, 9, 11],
      minor: [0, 2, 3, 5, 7, 8, 10],
      pentatonic: [0, 2, 4, 7, 9],
      // Extended modes from backend HarmonicEngine
      harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
      melodicMinor: [0, 2, 3, 5, 7, 9, 11],
      majorPentatonic: [0, 2, 4, 7, 9],
      minorPentatonic: [0, 3, 5, 7, 10],
      blues: [0, 3, 5, 6, 7, 10],
      wholeTone: [0, 2, 4, 6, 8, 10],
      diminished: [0, 2, 3, 5, 6, 8, 9, 11]
    }

    // Key to semitone offset (C=0, C#=1, etc.)
    this.keyOffsets = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    }
  }

  /**
   * Helper to set audio state with logging for debugging
   * @param {string} newState - New state to set
   * @param {string} trigger - What triggered this state change
   */
  _setState(newState, trigger = 'unknown') {
    const oldState = this._audioState
    this._audioState = newState
    if (DEBUG_AUDIO_STATE) {
      console.log(`[AudioState] ${oldState} -> ${newState} (trigger: ${trigger})`)
    }
  }

  /**
   * PUBLIC API: Check if audio is in STOPPED state
   * Use this instead of accessing _audioState directly
   * @returns {boolean} True if audio has been stopped by user
   */
  isAudioStopped() {
    return this._audioState === 'STOPPED'
  }

  /**
   * PUBLIC API: Check if audio is currently playing
   * @returns {boolean} True if audio is in PLAYING state
   */
  isAudioPlaying() {
    return this._audioState === 'PLAYING'
  }

  /**
   * PUBLIC API: Get current audio state (for debugging/UI)
   * @returns {string} Current state: IDLE, STARTING, PLAYING, RESUMING, or STOPPED
   */
  getAudioState() {
    return this._audioState
  }

  /**
   * Entry #HarmonicCoherence: Quantize a frequency to the current scale
   * Snaps frequency to nearest note in current key/mode
   * @param {number} frequency - Input frequency in Hz
   * @returns {number} Quantized frequency in Hz
   */
  quantizeToScale(frequency) {
    if (!frequency || !isFinite(frequency) || frequency <= 0) {
      return frequency
    }

    // Convert frequency to MIDI pitch
    const pitch = Math.round(12 * Math.log2(frequency / 440) + 69)

    // Get key offset (tonic)
    const tonic = this.keyOffsets[this.currentKey] || 0

    // Get scale intervals
    const scaleIntervals = this.currentScaleIntervals || this.modeIntervals.ionian

    // Calculate pitch class (0-11) and octave
    const pitchClass = ((pitch % 12) + 12) % 12 // Ensure positive
    const octave = Math.floor(pitch / 12)

    // Find nearest scale degree
    let nearestDistance = 12
    let nearestInterval = 0

    scaleIntervals.forEach(interval => {
      const scalePitchClass = (tonic + interval) % 12
      const distance = Math.min(
        Math.abs(pitchClass - scalePitchClass),
        12 - Math.abs(pitchClass - scalePitchClass) // Wrap-around distance
      )

      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestInterval = interval
      }
    })

    // Reconstruct pitch in scale
    const constrainedPitchClass = (tonic + nearestInterval) % 12
    const constrainedPitch = octave * 12 + constrainedPitchClass

    // Convert back to frequency
    return 440 * Math.pow(2, (constrainedPitch - 69) / 12)
  }

  /**
   * Entry #HarmonicCoherence: Update harmonic context from compositional parameters
   * Called when compositional-parameters event is received
   * @param {Object} params - Compositional parameters with key, mode, scaleType
   */
  updateHarmonicContext(params) {
    if (!params) return

    // Update key if provided
    if (params.key && this.keyOffsets[params.key] !== undefined) {
      this.currentKey = params.key
    }

    // Update mode - prefer full mode name, fall back to scaleType
    const mode = params.mode || params.scaleType || 'ionian'
    if (this.modeIntervals[mode]) {
      this.currentMode = mode
      this.currentScaleIntervals = this.modeIntervals[mode]
    }
  }

  /**
   * Register recovery event handlers - called only when audio starts
   * This prevents unwanted auto-recovery before user clicks Start
   */
  _registerRecoveryHandlers() {
    if (this._handlersRegistered) return

    document.addEventListener('visibilitychange', this._boundVisibilityHandler)
    window.addEventListener('focus', this._boundFocusHandler)
    window.addEventListener('blur', this._boundBlurHandler)
    window.addEventListener('pageshow', this._boundPageShowHandler)
    window.addEventListener('pagehide', this._boundPageHideHandler)

    this._handlersRegistered = true
    if (DEBUG_AUDIO_STATE) console.log('[AudioState] Recovery handlers registered')
  }

  /**
   * Unregister recovery event handlers - called when audio stops
   */
  _unregisterRecoveryHandlers() {
    if (!this._handlersRegistered) return

    document.removeEventListener('visibilitychange', this._boundVisibilityHandler)
    window.removeEventListener('focus', this._boundFocusHandler)
    window.removeEventListener('blur', this._boundBlurHandler)
    window.removeEventListener('pageshow', this._boundPageShowHandler)
    window.removeEventListener('pagehide', this._boundPageHideHandler)

    this._handlersRegistered = false
    if (DEBUG_AUDIO_STATE) console.log('[AudioState] Recovery handlers unregistered')
  }

  /**
   * Request user tap to resume audio - dispatches event for UI to show overlay
   * NEVER auto-resumes - always requires explicit user interaction
   */
  _requestTapToResume() {
    if (DEBUG_AUDIO_STATE) console.log('[AudioState] Requesting user tap to resume audio')
    window.dispatchEvent(new CustomEvent('audio:tap-to-resume'))
  }

  /**
   * Handle visibility change - SMART RECOVERY VERSION
   * When hidden: Just stop health checks, audio continues playing
   * When visible: Check if context needs recovery. Only show overlay if context is NOT running.
   */
  async _handleVisibilityChange() {
    if (document.hidden) {
      // Tab becoming hidden - audio keeps playing, just stop monitoring
      if (this._audioState === 'PLAYING') {
        this._stopAudioHealthCheck()
      }
      return
    }

    // Tab becoming visible - only request tap if context actually needs recovery
    if (this._audioState === 'PLAYING') {
      const contextState = Tone.context?.state
      if (contextState !== 'running') {
        // Context got suspended/interrupted - need user tap to recover
        if (DEBUG_AUDIO_STATE) console.log(`[AudioState] Context is ${contextState}, needs recovery`)
        this._setState('RESUMING', 'visibility-context-suspended')
        this._requestTapToResume()
      } else {
        // Context still running - just restart health check
        this._startAudioHealthCheck()
      }

      // Reload audio profile in case device tier changed while tab was hidden
      // (e.g., battery saver activated, thermal throttling)
      try {
        this.reloadAudioProfile()
      } catch (e) {
        // Ignore - non-critical
      }
    }
  }

  /**
   * Handle window focus - SMART RECOVERY VERSION
   * Only show overlay if context actually needs recovery
   */
  async _handleWindowFocus() {
    // Small delay to let the system stabilize after wake
    await new Promise(resolve => setTimeout(resolve, this._recoveryConfig.FOCUS_STABILIZATION_DELAY_MS))

    // Only check if we're supposed to be playing
    if (this._audioState === 'PLAYING') {
      const contextState = Tone.context?.state
      if (contextState !== 'running') {
        if (DEBUG_AUDIO_STATE) console.log(`[AudioState] Focus returned, context is ${contextState}, needs recovery`)
        this._setState('RESUMING', 'focus-context-suspended')
        this._requestTapToResume()
      }
    }
  }

  /**
   * Handle window blur - prepare for potential sleep
   */
  _handleWindowBlur() {
    if (this._audioState === 'PLAYING') {
      this._stopAudioHealthCheck()
    }
  }

  /**
   * Handle pageshow - catches BFCache restoration and iOS resume
   * @param {PageTransitionEvent} event
   */
  async _handlePageShow(event) {
    // Only check if we're supposed to be playing
    if (this._audioState === 'PLAYING') {
      const contextState = Tone.context?.state
      if (contextState !== 'running') {
        if (DEBUG_AUDIO_STATE) console.log(`[AudioState] Pageshow, context is ${contextState}, needs recovery`)
        this._setState('RESUMING', event.persisted ? 'pageshow-cached' : 'pageshow-context-suspended')
        this._requestTapToResume()
      } else {
        // Context still running - just restart health check
        this._startAudioHealthCheck()
      }
    }
    // If IDLE or STOPPED, do nothing - user must click Start
  }

  /**
   * Handle pagehide - prepare for potential cache/sleep
   * @param {PageTransitionEvent} event
   */
  _handlePageHide(event) {
    this._stopAudioHealthCheck()
  }

  /**
   * Resume audio from user tap - called when user taps the "Tap to Resume" overlay
   * This is the ONLY way to transition from RESUMING to PLAYING
   * Includes iOS-specific unlock logic (Tone.start() + quiet buffer)
   * @returns {Promise<boolean>} True if recovery was successful
   */
  async resumeFromTap() {
    if (this._audioState !== 'RESUMING') {
      if (DEBUG_AUDIO_STATE) console.log(`[AudioState] resumeFromTap ignored - state is ${this._audioState}`)
      return false
    }

    if (DEBUG_AUDIO_STATE) console.log('[AudioState] resumeFromTap starting...')

    try {
      // iOS CRITICAL: Tone.start() from user gesture to unlock AudioContext
      if (this._isIOS || Tone.context?.state === 'interrupted' || Tone.context?.state === 'suspended') {
        await Tone.start()
        if (DEBUG_AUDIO_STATE) console.log('[AudioState] Tone.start() called from user gesture')
      }

      // iOS: Play very quiet buffer (not silent) for complete unlock
      if (Tone.context?.state === 'running') {
        try {
          const player = new Tone.Player().toDestination()
          player.volume.value = this._isIOS ? this._recoveryConfig.IOS_UNLOCK_VOLUME_DB : -Infinity
          player.start()
          const unlockDuration = this._isIOS ? this._recoveryConfig.IOS_UNLOCK_DURATION_MS : 50
          await new Promise(resolve => setTimeout(resolve, unlockDuration))
          player.stop()
          player.dispose()
        } catch (e) {
          // Ignore unlock errors
        }
      }

      // Resume AudioContext with retry logic
      const contextResumed = await this._resumeAudioContext('user-tap')

      if (Tone.context?.state === 'running') {
        // Restore masterVolume if stuck
        if (this.masterVolume && this.masterVolume.volume.value === -Infinity) {
          this.masterVolume.volume.value = -10
        }

        // Restart Transport
        if (Tone.Transport?.state !== 'started') {
          Tone.Transport.start()
        }

        // Reset synth states
        if (this.userSynthManager) {
          this.userSynthManager.resetAllSynthStates()
        }

        // Restart generation
        this.evolvingGenerationActive = false
        this.startEvolvingGeneration()

        // Restart drone controller
        if (this.droneVoidController) {
          this.droneVoidController.reset()
          this.droneVoidController.start()
        }

        // Start health check
        this._startAudioHealthCheck()

        // Transition to PLAYING
        this._setState('PLAYING', 'resumeFromTap-success')
        return true
      } else {
        // CRITICAL: Don't leave state stuck in RESUMING - transition to STOPPED
        // User can try pressing Start again
        if (DEBUG_AUDIO_STATE) console.log('[AudioState] resumeFromTap failed - context still not running, transitioning to STOPPED')
        this._setState('STOPPED', 'resumeFromTap-failed-context')
        return false
      }
    } catch (error) {
      // CRITICAL: Don't leave state stuck in RESUMING on error
      if (DEBUG_AUDIO_STATE) console.error('[AudioState] resumeFromTap error:', error)
      this._setState('STOPPED', 'resumeFromTap-error')
      return false
    }
  }

  /**
   * Internal audio recovery logic - called ONLY from resumeFromTap()
   * NEVER called automatically - always requires explicit user tap
   * Properly sequences: context resume -> masterVolume restore -> Transport restart -> health check
   * @param {string} trigger - What triggered this recovery (for logging)
   */
  async _performAudioRecovery(trigger) {
    // Concurrency guard - prevent multiple simultaneous recovery attempts
    if (this._recoveryInProgress) {
      this._pendingRecoveryTrigger = trigger
      return
    }

    this._recoveryInProgress = true

    if (!this.isInitialized) {
      this._recoveryInProgress = false
      return
    }

    // STATE MACHINE CHECK: Only recover if in RESUMING state (user tapped overlay)
    if (this._audioState !== 'RESUMING') {
      if (DEBUG_AUDIO_STATE) console.log(`[AudioState] Recovery skipped - state is ${this._audioState}, not RESUMING`)
      this._recoveryInProgress = false
      return
    }

    try {
      // STEP 1: Resume AudioContext if suspended (with retry logic)
      const contextResumed = await this._resumeAudioContext(trigger)

      if (!contextResumed) {
        this._stopAudioHealthCheck() // Cleanup on failure
        this._requestUserGestureForAudio()
        this._recoveryInProgress = false
        return
      }

      // STEP 2: Restore masterVolume if stuck at -Infinity (critical fix!)
      if (this.masterVolume && this.masterVolume.volume.value === -Infinity) {
        this.masterVolume.volume.value = -10
      }

      // STEP 3: Restart Transport if needed (AFTER context is confirmed running)
      if (Tone.Transport?.state !== 'started' && Tone.context?.state === 'running') {
        Tone.Transport.start()
      }

      // STEP 4: Reset UserSynthManager states to clear stale timing
      if (this.userSynthManager) {
        this.userSynthManager.resetAllSynthStates()
      }

      // STEP 5: FORCE restart evolving generation after sleep recovery
      // Even if evolvingGenerationActive is true, the scheduled events may be stale
      // after iOS sleep, so we must restart to re-register Transport events
      if (this.isInitialized && !this.muted) {
        // Reset flag to allow startEvolvingGeneration to run
        this.evolvingGenerationActive = false
        this.startEvolvingGeneration()

        // Entry #129: Also restart DroneVoidController (was missing - caused only chords to restart)
        if (this.droneVoidController) {
          this.droneVoidController.reset()
          this.droneVoidController.start()
        }
      }

      // STEP 6: Start audio health monitoring to detect silent state
      this._startAudioHealthCheck()
      this._wakeRecoveryAttempts = 0


      // Check if another recovery was requested during this one
      if (this._pendingRecoveryTrigger) {
        const pendingTrigger = this._pendingRecoveryTrigger
        this._pendingRecoveryTrigger = null
        this._recoveryInProgress = false
        await this._performAudioRecovery(pendingTrigger)
        return
      }
    } catch (error) {
      console.error('🔊 Audio recovery failed:', error)
      this._stopAudioHealthCheck() // Cleanup on error
      this._requestUserGestureForAudio() // Request user help after failure
    } finally {
      this._recoveryInProgress = false
    }
  }

  /**
   * Resume AudioContext with platform-specific retry logic
   * @param {string} trigger - What triggered this resume attempt (for logging)
   * @returns {Promise<boolean>} True if context is now running
   */
  async _resumeAudioContext(trigger = 'unknown') {
    if (Tone.context?.state === 'running') {
      return true
    }

    const config = this._recoveryConfig
    const rawContext = Tone.context?.rawContext || Tone.context?._context || Tone.context
    // iOS and Android both need aggressive resume
    const needsAggressiveResume = this._needsAggressiveResume || this._isIOS
    const maxAttempts = needsAggressiveResume
      ? config.MAX_RESUME_ATTEMPTS_AGGRESSIVE
      : config.MAX_RESUME_ATTEMPTS


    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // iOS CRITICAL: "interrupted" state requires Tone.start(), not just resume()
        // This can only work if called from a user gesture context
        if (this._isIOS && (Tone.context?.state === 'interrupted' || Tone.context?.state === 'suspended')) {
          try {
            await Tone.start()
          } catch (startError) {
          }
        }

        // Try all available resume methods
        if (rawContext?.resume) {
          await rawContext.resume()
        }
        if (Tone.context?.resume) {
          await Tone.context.resume()
        }

        // AUDIO PRIORITY: Exponential backoff polling instead of constant 20ms intervals
        // Reduces main thread blocking from 15 iterations to max 6, with shorter initial delays
        const delays = [5, 10, 20, 40, 80, 145] // Total ~300ms
        for (const delay of delays) {
          if (Tone.context.state === 'running') break
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        if (Tone.context.state === 'running') {
          return true
        }

        // Android-specific: Try suspend/resume cycle
        if (this._needsAggressiveResume && Tone.context.state !== 'running') {
          if (rawContext?.suspend) {
            await rawContext.suspend()
            await new Promise(resolve => setTimeout(resolve, config.ANDROID_SUSPEND_RESUME_DELAY_MS))
          }
          if (rawContext?.resume) {
            await rawContext.resume()
          }
          await new Promise(resolve => setTimeout(resolve, config.ANDROID_SUSPEND_RESUME_WAIT_MS))

          if (Tone.context.state === 'running') {
            return true
          }
        }

      } catch (error) {
      }

      // Wait before next attempt (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 50 * attempt))
    }

    return false
  }

  /**
   * Start periodic audio health checks to detect silent state
   * This catches cases where context is "running" but audio is actually silent
   * Uses adaptive intervals: longer on mobile to save battery
   * Entry #PERF: Uses exponential backoff after consecutive healthy checks
   */
  _startAudioHealthCheck() {
    this._stopAudioHealthCheck() // Clear any existing

    const config = this._recoveryConfig

    // Reset backoff state
    this._consecutiveHealthyChecks = 0

    // Use longer interval on mobile to save battery
    this._currentHealthCheckInterval = this._isMobile
      ? config.HEALTH_CHECK_INTERVAL_MOBILE_MS
      : config.HEALTH_CHECK_INTERVAL_DESKTOP_MS

    // Entry #PERF: Schedule next check with current interval
    this._scheduleNextHealthCheck()

    // Entry #122: Store initial timeout ID for proper cleanup
    this._audioHealthCheckInitialTimeout = setTimeout(
      () => this._checkAudioHealth(),
      config.HEALTH_CHECK_INITIAL_DELAY_MS
    )
  }

  /**
   * Entry #PERF: Schedule next health check with adaptive interval
   * Uses exponential backoff after consecutive healthy checks
   * @private
   */
  _scheduleNextHealthCheck() {
    if (this._audioHealthCheckInterval) {
      clearTimeout(this._audioHealthCheckInterval)
    }

    this._audioHealthCheckInterval = setTimeout(() => {
      this._checkAudioHealth()
      // Schedule next check after this one completes
      if (this._audioState === 'PLAYING') {
        this._scheduleNextHealthCheck()
      }
    }, this._currentHealthCheckInterval)
  }

  /**
   * Entry #PERF: Update health check interval based on audio health
   * Implements exponential backoff when audio is consistently healthy
   * @param {boolean} isHealthy - Whether the current check found healthy audio
   * @private
   */
  _updateHealthCheckBackoff(isHealthy) {
    const config = this._recoveryConfig
    const baseInterval = this._isMobile
      ? config.HEALTH_CHECK_INTERVAL_MOBILE_MS
      : config.HEALTH_CHECK_INTERVAL_DESKTOP_MS

    if (isHealthy) {
      this._consecutiveHealthyChecks++
      // After 3 consecutive healthy checks, start increasing interval
      if (this._consecutiveHealthyChecks > 3) {
        // Double interval up to max, but use exponential curve
        const backoffMultiplier = Math.min(
          Math.pow(2, Math.floor((this._consecutiveHealthyChecks - 3) / 2)),
          this._maxHealthCheckInterval / baseInterval
        )
        this._currentHealthCheckInterval = Math.min(
          baseInterval * backoffMultiplier,
          this._maxHealthCheckInterval
        )
      }
    } else {
      // Reset to base interval on any unhealthy check
      this._consecutiveHealthyChecks = 0
      this._currentHealthCheckInterval = baseInterval
    }
  }

  /**
   * Stop audio health monitoring
   */
  _stopAudioHealthCheck() {
    if (this._audioHealthCheckInterval) {
      clearInterval(this._audioHealthCheckInterval)
      this._audioHealthCheckInterval = null
    }
    // Entry #122: Clear initial timeout too (was causing delayed restart after stop)
    if (this._audioHealthCheckInitialTimeout) {
      clearTimeout(this._audioHealthCheckInitialTimeout)
      this._audioHealthCheckInitialTimeout = null
    }
    // Stop voice cleanup scheduling
    this._voiceCleanupActive = false
  }

  /**
   * Check if audio is actually producing sound (not just context running)
   * Respects user's explicit stop state - won't restart if user stopped audio
   * Entry #PERF: Updates exponential backoff based on health status
   */
  _checkAudioHealth() {
    if (!this.isInitialized) return

    // STATE MACHINE: Only check health if in PLAYING state
    if (this._audioState !== 'PLAYING') return

    const contextState = Tone.context?.state

    // Check 1: Context state - must be "running"
    // If context is suspended or interrupted, request tap to resume
    if (contextState !== 'running') {
      if (DEBUG_AUDIO_STATE) console.log(`[AudioState] Health check detected context ${contextState}, requesting tap to resume`)
      this._updateHealthCheckBackoff(false) // Entry #PERF: Reset backoff
      this._setState('RESUMING', 'health-check-context-suspended')
      this._requestTapToResume()
      return
    }

    // Track if any issue was found (for backoff calculation)
    let issueFound = false

    // Check 2: MasterVolume stuck at -Infinity (only if not muted) - this is safe to auto-fix
    // This doesn't start audio, just restores volume on already-playing audio
    if (this.masterVolume && this.masterVolume.volume.value === -Infinity && !this.muted) {
      this.masterVolume.volume.value = -10
      issueFound = true
    }

    // Check 3: Transport should be running - this is safe to auto-fix
    // Transport manages scheduled events, not audio playback itself
    if (Tone.Transport?.state !== 'started') {
      Tone.Transport.start()
      issueFound = true
    }

    // Check 4: Evolving generation should be active - this is safe to auto-fix
    // This just restarts the background composition loop, doesn't start new audio
    if (!this.evolvingGenerationActive && !this.muted) {
      this.startEvolvingGeneration()
      issueFound = true
    }

    // Entry #PERF: Update backoff based on whether any issues were found
    this._updateHealthCheckBackoff(!issueFound)
  }

  /**
   * Attempt recovery when audio is suspected silent
   */
  async _attemptSilentRecovery() {
    this._wakeRecoveryAttempts++

    if (this._wakeRecoveryAttempts > this._maxWakeRecoveryAttempts) {
      this._stopAudioHealthCheck() // Stop checking after max attempts
      this._requestUserGestureForAudio()
      return
    }

    await this._performAudioRecovery('health-check')
  }

  /**
   * Request user gesture when automatic recovery fails
   * Mobile browsers often require explicit user interaction after sleep
   */
  _requestUserGestureForAudio() {
    // Dispatch custom event that main.js can listen to
    const event = new CustomEvent('audio:gesture-required', {
      detail: {
        reason: 'recovery-failed',
        attempts: this._wakeRecoveryAttempts
      }
    })
    window.dispatchEvent(event)

  }

  /**
   * Called when user interacts with the page after gesture-required event
   * Should be connected to a touch/click handler in main.js
   * Includes iOS-specific handling (very quiet tone instead of silent)
   */
  async handleUserGestureForRecovery() {
    // DEPRECATED: Use resumeFromTap() instead (state machine approach)
    // This method is kept for backward compatibility
    // Entry #122: Respect user's explicit stop - don't auto-recover if user stopped audio
    if (this._audioState === 'STOPPED' || this._audioState === 'IDLE') {
      return
    }

    this._wakeRecoveryAttempts = 0

    const config = this._recoveryConfig

    // iOS CRITICAL: Must call Tone.start() FIRST from user gesture
    // This is the only way to unlock AudioContext on iOS Safari after sleep
    // Tone.start() internally handles the iOS-specific unlock mechanism
    if (this._isIOS || Tone.context?.state === 'interrupted' || Tone.context?.state === 'suspended') {
      try {
        await Tone.start()
      } catch (e) {
      }
    }

    // Play buffer to "unlock" audio on mobile (additional unlock mechanism)
    // iOS requires very quiet (not silent) audio, other platforms can use silent
    let player = null
    try {
      // Only create player if context is running now
      if (Tone.context?.state === 'running') {
        player = new Tone.Player().toDestination()
        player.volume.value = this._isIOS ? config.IOS_UNLOCK_VOLUME_DB : -Infinity
        player.start()

        const unlockDuration = this._isIOS ? config.IOS_UNLOCK_DURATION_MS : 50
        await new Promise(resolve => setTimeout(resolve, unlockDuration))

        player.stop()
      }
    } catch (e) {
    } finally {
      // Ensure player is always disposed to prevent memory leak
      if (player) {
        try {
          player.dispose()
        } catch (disposeError) {
          // Ignore disposal errors
        }
      }
    }

    await this._performAudioRecovery('user-gesture')
  }

  /**
   * Disable all LFO systems to eliminate tremolo
   * Note: lfoSystem is already a stub, this handles Tone.LFO instances
   */
  disableAllLFOSystems() {
    // lfoSystem is now a stub - just reset flags for safety
    if (this.lfoSystem) {
      this.lfoSystem.isActive = false
      this.lfoSystem.currentLFOValue = 0
    }

    // Disable any existing Tone.LFO instances
    if (this.remoteFilterLFO) {
      this.remoteFilterLFO.stop()
      this.remoteFilterLFO.dispose()
      this.remoteFilterLFO = null
      // console.log('🛑 remoteFilterLFO destroyed')
    }

    if (this.tremoloLFO) {
      this.tremoloLFO.stop()
      this.tremoloLFO.dispose()
      this.tremoloLFO = null
      // console.log('🛑 tremoloLFO destroyed')
    }

    // console.log('✅ ALL LFO SYSTEMS DISABLED - tremolo should be eliminated')
  }

  /**
   * Initialize the three-tier audio architecture
   */
  initializeThreeTierAudio() {
    // PERF: Entry #59 - Use platform-specific filter update rate
    // Chrome on Windows benefits from lower update rate (20Hz vs 30Hz)
    const filterUpdateHz = typeof PlatformDetection !== 'undefined'
      ? PlatformDetection.getFilterUpdateRate()
      : 30

    // Continuous filter update system properties
    this.continuousFilterUpdate = {
      isActive: false,
      updateInterval: null,
      lastUpdate: 0,
      updateRate: 1000 / filterUpdateHz // Platform-specific Hz for audio filters
    }

    // Performance tracking
    this.performanceMetrics = {
      gestureToSoundLatency: [],
      averageLatency: 0,
      maxLatency: 0,
      parameterUpdatesPerSecond: 0,
      droppedUpdates: 0,
      totalUpdates: 0
    }

    // Update loop management
    this.updateLoopActive = false
    this.updateInterval = null
    this.targetFPS = 60
    this.updateTimeSlice = 1000 / this.targetFPS // ~16.67ms

    // Gesture buffer for smooth interpolation
    this.gestureBuffer = []
    this.maxBufferSize = 10

    // Audio context state
    this.audioContextState = 'not-initialized'
  }

  /**
   * Initialize audio service with dependencies
   * @param {Object} audioEngine - AudioEngine component instance
   * @param {Object} gestureCapture - GestureCapture service instance
   */
  async initialize(audioEngine, gestureCapture) {
    try {
      this.audioEngine = audioEngine
      this.gestureCapture = gestureCapture

      // Start real-time parameter update loop
      this.startUpdateLoop()

      this.isInitialized = true
      this.audioContextState = 'initialized'

      // console.log('AudioService initialized with 60fps parameter updates')

      return true
    } catch (error) {
      // console.error('AudioService initialization failed:', error)
      throw error
    }
  }

  /**
   * Detect Windows Chrome for audio buffer optimization
   * Entry #46: Now uses shared PlatformDetection utility to eliminate code duplication
   * Windows Chrome has higher audio latency and needs larger buffers to prevent glitches
   * @returns {boolean} True if running on Windows Chrome
   */
  _detectWindowsChrome() {
    // Use shared utility if available, fall back to inline detection
    if (typeof PlatformDetection !== 'undefined') {
      return PlatformDetection.isWindowsChrome()
    }
    // Fallback for safety (should not reach here with proper script loading)
    const ua = navigator.userAgent
    const isWindows = ua.includes('Windows') || navigator.platform?.includes('Win')
    const isChrome = ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')
    return isWindows && isChrome
  }

  /**
   * Configure AudioContext for optimal buffer size based on platform
   * PERF: Windows Chrome and Android Chrome need larger buffers to prevent crackles/hiccups
   * Entry #48 FIX: Extended for Android Chrome with stricter autoplay policies
   * Must be called BEFORE Tone.start() to take effect
   */
  _configureAudioContext() {
    if (this._audioConfigured) return
    this._audioConfigured = true

    try {
      // Entry #48: Use PlatformDetection for platform-aware latency hints
      // 'playback' = larger buffer (~100-200ms), most stable for music
      // 'balanced' = medium buffer (~40-60ms), good compromise
      // 'interactive' = smallest buffer (~10-20ms), prone to glitches on mobile/Windows
      const latencyHint = typeof PlatformDetection !== 'undefined'
        ? PlatformDetection.getAudioLatencyHint()
        : (this._isWindowsChrome ? 'playback' : 'balanced')

      // Entry #48: Detect Android Chrome for aggressive resume strategy
      const isAndroidChrome = typeof PlatformDetection !== 'undefined' && PlatformDetection.isAndroidChrome()
      const androidVersion = typeof PlatformDetection !== 'undefined' ? PlatformDetection.getAndroidVersion() : null

      // Android 13+ has stricter autoplay policies
      this._needsAggressiveResume = isAndroidChrome && androidVersion !== null && androidVersion >= 13

      // Create Tone.Context with optimized latencyHint
      // Note: sampleRate removed - browsers ignore it and use system audio device rate
      if (window.Tone) {
        // Don't close existing context - just create new one with our settings
        // Closing causes issues because it's async and can leave things in bad state
        const customContext = new Tone.Context({ latencyHint })
        Tone.setContext(customContext)
      }
    } catch (error) {
    }
  }

  /**
   * Entry #73: Initialize audio profile based on device capabilities
   * Entry #74: Now also integrates UserSettings overrides
   * Loads profile from PlatformDetection which combines DeviceCapabilities + platform overrides
   */
  _initializeAudioProfile() {
    try {
      // Get effective profile (combines device tier + platform + low power mode)
      let baseProfile = null
      if (typeof PlatformDetection !== 'undefined') {
        baseProfile = PlatformDetection.getEffectiveAudioProfile()
      } else {
        // Fallback profile
        baseProfile = {
          lookAhead: 0.1,
          updateInterval: 0.025,
          filterUpdateRate: 30,
          maxPolyphony: 8,
          backgroundLayers: ['bass', 'pad', 'chords'],
          useAmbientFilters: true,
          synthComplexity: 'full',
          tier: 'unknown',
          source: 'fallback'
        }
      }

      // Entry #74: Apply UserSettings overrides
      if (typeof UserSettings !== 'undefined') {
        const userSettings = UserSettings.getAll()
        this.audioProfile = UserSettings.getEffectiveAudioProfile(baseProfile)
      } else {
        this.audioProfile = baseProfile
      }

      this.isUltraLowPowerMode = this.audioProfile.synthComplexity === 'mono-sine'

      // If Ultra-Low Power mode, initialize the minimal audio engine
      if (this.isUltraLowPowerMode && typeof UltraLowPowerAudio !== 'undefined') {
        this.ultraLowPowerAudio = new UltraLowPowerAudio()
      }
    } catch (error) {
    }
  }

  /**
   * Entry #73 FIX: Reload audio profile after Low Power mode toggle
   * Entry #74: Also reloads when UserSettings change
   * Called when user toggles Low Power mode or changes Settings to apply new settings
   */
  reloadAudioProfile() {
    try {

      const wasUltraLow = this.isUltraLowPowerMode
      // Entry #74 FIX: Track previous layers to detect changes
      const previousLayers = this.audioProfile?.backgroundLayers || ['bass', 'pad', 'chords']
      const previousCompositionLayers = this.audioProfile?.compositionLayers || ['backgroundHigh', 'backgroundMid', 'backgroundLow']

      // Re-fetch base profile from PlatformDetection
      let baseProfile = null
      if (typeof PlatformDetection !== 'undefined') {
        baseProfile = PlatformDetection.getEffectiveAudioProfile()
      } else {
        baseProfile = this.audioProfile // Keep current as fallback
      }

      // Entry #74: Apply UserSettings overrides
      if (typeof UserSettings !== 'undefined') {
        this.audioProfile = UserSettings.getEffectiveAudioProfile(baseProfile)
      } else {
        this.audioProfile = baseProfile
      }

      this.isUltraLowPowerMode = this.audioProfile.synthComplexity === 'mono-sine'


      // Update Tone.js lookAhead if changed
      if (window.Tone && this.audioProfile.lookAhead) {
        Tone.context.lookAhead = this.audioProfile.lookAhead
      }

      // Entry #74 FIX: Release notes on layers that are no longer enabled
      const newLayers = this.audioProfile.backgroundLayers || []
      const disabledLayers = previousLayers.filter(layer => !newLayers.includes(layer))
      if (disabledLayers.length > 0 && this.ambientLayers) {
        disabledLayers.forEach(layer => {
          if (this.ambientLayers[layer] && !this.ambientLayers[layer].disposed) {
            if (this.ambientLayers[layer].releaseAll) {
              this.ambientLayers[layer].releaseAll(0.3)
            } else if (this.ambientLayers[layer].triggerRelease) {
              this.ambientLayers[layer].triggerRelease()
            }
          }
        })
      }

      // Release notes on composition layers that are no longer enabled
      const newCompositionLayers = this.audioProfile.compositionLayers || ['backgroundHigh', 'backgroundMid', 'backgroundLow']
      const disabledCompositionLayers = previousCompositionLayers.filter(layer => !newCompositionLayers.includes(layer))
      if (disabledCompositionLayers.length > 0 && this.ambientLayers) {
        disabledCompositionLayers.forEach(layer => {
          if (this.ambientLayers[layer] && !this.ambientLayers[layer].disposed) {
            if (this.ambientLayers[layer].releaseAll) {
              this.ambientLayers[layer].releaseAll(0.3)
            } else if (this.ambientLayers[layer].triggerRelease) {
              this.ambientLayers[layer].triggerRelease()
            }
          }
          // Remove from active voice tracking
          this._removeLayerFromActiveVoices(layer)
        })
      }

      // Entry #74 FIX: Update maxPolyphony and release excess voices
      if (this.audioProfile.maxPolyphony) {
        const previousMax = this.maxTotalVoices
        this.maxTotalVoices = this.audioProfile.maxPolyphony
        if (this.maxTotalVoices !== previousMax) {
          // Release excess voices if we reduced the limit
          if (this.maxTotalVoices < previousMax) {
            try {
              this.managePolyphony()
            } catch (error) {
            }
          }
        }
      }

      // Handle transition to/from Ultra-Low Power mode
      if (this.isUltraLowPowerMode && !wasUltraLow) {
        // Switching TO Ultra-Low Power mode
        if (typeof UltraLowPowerAudio !== 'undefined' && !this.ultraLowPowerAudio) {
          this.ultraLowPowerAudio = new UltraLowPowerAudio()
          this.ultraLowPowerAudio.initialize()
        } else {
        }
        // Entry #90 FIX: Switch gestureSynth to simple sine oscillator
        // ERROR HANDLING: Wrap in try-catch to handle disposed synth or API changes
        try {
          if (this.gestureSynth && this.gestureSynth.oscillator && !this.gestureSynth.disposed) {
            this.gestureSynth.oscillator.type = 'sine'
          }
        } catch (e) {
        }
        // Stop all background layers
        if (this.ambientLayers) {
          Object.keys(this.ambientLayers).forEach(layer => {
            if (this.ambientLayers[layer] && !this.ambientLayers[layer].disposed) {
              if (this.ambientLayers[layer].releaseAll) {
                this.ambientLayers[layer].releaseAll(0.3)
              }
            }
          })
        }
      } else if (!this.isUltraLowPowerMode && wasUltraLow) {
        // Switching FROM Ultra-Low Power mode
        if (this.ultraLowPowerAudio) {
          this.ultraLowPowerAudio.dispose()
          this.ultraLowPowerAudio = null
        }
        // Entry #90 FIX: Restore gestureSynth to sawtooth oscillator
        // ERROR HANDLING: Wrap in try-catch to handle disposed synth or API changes
        try {
          if (this.gestureSynth && this.gestureSynth.oscillator && !this.gestureSynth.disposed) {
            this.gestureSynth.oscillator.type = 'sawtooth'
          }
        } catch (e) {
        }
        // Background layers will resume naturally via _isLayerEnabled checks
      }

      // Dispatch event for UI update
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('audio-profile-change', {
          detail: {
            profile: this.audioProfile,
            isUltraLowPower: this.isUltraLowPowerMode
          }
        }))
      }

      // FIX: Recreate synths if synthComplexity changed
      const newComplexity = this.audioProfile?.synthComplexity || 'full'
      if (this._currentSynthComplexity && this._currentSynthComplexity !== newComplexity) {
        this._recreateAmbientSynths()
      }
    } catch (error) {
    }
  }

  /**
   * Get current synth complexity config from UserSettings
   * @returns {Object} Synth configuration for all layers
   */
  _getSynthConfig() {
    if (typeof UserSettings !== 'undefined' && UserSettings.getSynthComplexityConfig) {
      return UserSettings.getSynthComplexityConfig()
    }
    // Fallback to full complexity
    return {
      pad: { maxPolyphony: 6, oscillatorType: 'fattriangle', oscillatorCount: 2, spread: 15 },
      chords: { maxPolyphony: 8, synthType: 'FMSynth', harmonicity: 1.5, modulationIndex: 2.5 },
      bass: { synthType: 'FMSynth', harmonicity: 0.5, modulationIndex: 2 },
      backgroundHigh: { oscillatorType: 'pulse', width: 0.3 },
      backgroundMid: { oscillatorType: 'pwm', modulationFrequency: 0.5 },
      backgroundLow: { oscillatorType: 'square' }
    }
  }

  /**
   * Safely recreate ambient synths when settings change
   * Handles note release, disposal, and reconnection
   */
  async _recreateAmbientSynths() {
    if (!this.ambientLayers) return

    try {
      // 1. Release all active notes (pad has 2.5s release!)
      for (const layer of ['pad', 'chords']) {
        if (this.ambientLayers[layer]?.releaseAll) {
          this.ambientLayers[layer].releaseAll(0)
        }
      }
      for (const layer of ['bass', 'backgroundHigh', 'backgroundMid', 'backgroundLow']) {
        if (this.ambientLayers[layer]?.triggerRelease) {
          this.ambientLayers[layer].triggerRelease()
        }
      }

      // 2. Wait for releases to complete (avoid Tone.js errors)
      await new Promise(resolve => setTimeout(resolve, 100))

      // 3. Disconnect and dispose old synths
      for (const layer of Object.keys(this.ambientLayers)) {
        if (this.ambientLayers[layer]) {
          try {
            this.ambientLayers[layer].disconnect()
            this.ambientLayers[layer].dispose()
          } catch (e) {
            // Ignore disposal errors
          }
        }
      }

      // 4. Create new synths with updated config
      const config = this._getSynthConfig()
      this._createAmbientSynthsFromConfig(config)

      // 5. Reconnect to audio chain
      this._reconnectAmbientSynths()

      // 6. Update tracking
      this._currentSynthComplexity = this.audioProfile?.synthComplexity || 'full'

    } catch (error) {
      console.error('Error recreating ambient synths:', error)
    }
  }

  /**
   * Create ambient synths from configuration
   * @param {Object} config - Synth configuration from SYNTH_COMPLEXITY_CONFIG
   */
  _createAmbientSynthsFromConfig(config) {
    // BASS synth
    const bassConfig = config.bass || {}
    if (bassConfig.synthType === 'FMSynth') {
      this.ambientLayers.bass = new Tone.FMSynth({
        harmonicity: bassConfig.harmonicity || 0.5,
        modulationIndex: bassConfig.modulationIndex || 2,
        volume: 0,
        oscillator: { type: 'sine' },
        modulation: { type: 'sine' },
        envelope: { attack: 0.02, decay: 0.15, sustain: 0.85, release: 0.3 },
        modulationEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.3 }
      })
    } else {
      this.ambientLayers.bass = new Tone.MonoSynth({
        oscillator: { type: bassConfig.oscillatorType || 'sine' },
        volume: 0,
        envelope: { attack: 0.02, decay: 0.15, sustain: 0.85, release: 0.3 }
      })
    }

    // PAD synth (PolySynth)
    const padConfig = config.pad || {}
    this.ambientLayers.pad = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: padConfig.maxPolyphony || 6
    })
    const padOscConfig = { type: padConfig.oscillatorType || 'fattriangle' }
    if (padConfig.oscillatorCount) padOscConfig.count = padConfig.oscillatorCount
    if (padConfig.spread !== undefined) padOscConfig.spread = padConfig.spread
    this.ambientLayers.pad.set({
      oscillator: padOscConfig,
      volume: +5,
      envelope: { attack: 0.8, decay: 1.5, sustain: 0.7, release: 2.5 }
    })

    // CHORDS synth (PolySynth)
    const chordsConfig = config.chords || {}
    const ChordsSynthClass = chordsConfig.synthType === 'FMSynth' ? Tone.FMSynth : Tone.Synth
    this.ambientLayers.chords = new Tone.PolySynth(ChordsSynthClass, {
      maxPolyphony: chordsConfig.maxPolyphony || 8
    })
    if (chordsConfig.synthType === 'FMSynth') {
      this.ambientLayers.chords.set({
        harmonicity: chordsConfig.harmonicity || 1.5,
        modulationIndex: chordsConfig.modulationIndex || 2.5,
        oscillator: { type: 'sine' },
        modulation: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.5, sustain: 0.4, release: 1.0 },
        modulationEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.3, release: 0.6 }
      })
    } else {
      this.ambientLayers.chords.set({
        oscillator: { type: chordsConfig.oscillatorType || 'triangle' },
        envelope: { attack: 0.01, decay: 0.5, sustain: 0.4, release: 1.0 }
      })
    }

    // BACKGROUND HIGH synth
    const bgHighConfig = config.backgroundHigh || {}
    const bgHighOscConfig = { type: bgHighConfig.oscillatorType || 'pulse' }
    if (bgHighConfig.width !== undefined) bgHighOscConfig.width = bgHighConfig.width
    this.ambientLayers.backgroundHigh = new Tone.MonoSynth({
      oscillator: bgHighOscConfig,
      volume: +5,
      envelope: { attack: 0.02, decay: 0.2, sustain: 0.7, release: 0.5 }
    })

    // BACKGROUND MID synth
    const bgMidConfig = config.backgroundMid || {}
    const bgMidOscConfig = { type: bgMidConfig.oscillatorType || 'pwm' }
    if (bgMidConfig.modulationFrequency !== undefined) bgMidOscConfig.modulationFrequency = bgMidConfig.modulationFrequency
    this.ambientLayers.backgroundMid = new Tone.MonoSynth({
      oscillator: bgMidOscConfig,
      volume: +5,
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.6, release: 0.8 }
    })

    // BACKGROUND LOW synth
    const bgLowConfig = config.backgroundLow || {}
    this.ambientLayers.backgroundLow = new Tone.MonoSynth({
      oscillator: { type: bgLowConfig.oscillatorType || 'square' },
      volume: +5,
      envelope: { attack: 0.08, decay: 0.3, sustain: 0.8, release: 0.6 }
    })
  }

  /**
   * Reconnect ambient synths to audio chain after recreation
   */
  _reconnectAmbientSynths() {
    if (!this.ambientLayers || !this.ambientVolumes) return

    Object.keys(this.ambientLayers).forEach(layer => {
      if (this.ambientFilters?.[layer]) {
        // Full routing with filters
        this.ambientLayers[layer].connect(this.ambientFilters[layer])
        this.ambientFilters[layer].connect(this.ambientVolumes[layer])
      } else {
        // Direct routing (no filters)
        this.ambientLayers[layer].connect(this.ambientVolumes[layer])
      }
    })
  }

  /**
   * Entry #73: Start stress monitor for runtime audio adaptation
   */
  _startStressMonitor() {
    try {
      if (typeof AudioStressMonitor !== 'undefined') {
        if (!this.stressMonitor) {
          this.stressMonitor = new AudioStressMonitor()

          // Handle stress changes
          this.stressMonitor.onStressChange = (data) => {

            // Emit event for UI indicator
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('audio-stress-change', { detail: data }))
            }
          }

          // Handle mode changes
          this.stressMonitor.onModeChange = (data) => {

            // Apply degradation based on mode
            this._applyStressDegradation(data.to)

            // Emit event for UI indicator
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('audio-mode-change', { detail: data }))
            }
          }
        }

        this.stressMonitor.start(Tone.context)
      }

      // AUDIO PRIORITY: Voice cleanup via requestIdleCallback instead of setInterval
      // Defers non-critical cleanup to idle time, freeing main thread for audio scheduling
      if (!this._voiceCleanupActive) {
        this._voiceCleanupActive = true
        this._scheduleVoiceCleanup()
      }
    } catch (error) {
    }
  }

  /**
   * Entry #73: Apply audio degradation based on stress mode
   * Uses _disabledByStress Set + _isLayerEnabled() to actually release voices (saves CPU)
   * Priority order: counterpoint (priority 1) disabled first, then accompaniment (priority 2)
   * @param {'normal'|'degraded'|'minimal'|'emergency'} mode
   */
  _applyStressDegradation(mode) {
    if (!this._disabledByStress) this._disabledByStress = new Set()
    try {
      switch (mode) {
        case 'degraded':
          this.filterUpdateInterval = 100 // 10Hz
          this.ambientFilterUpdateInterval = 500 // 2Hz
          // Disable counterpoint (priority 1 — lowest, first to go)
          ;['backgroundHigh', 'backgroundMid', 'backgroundLow'].forEach(l => {
            this._disabledByStress.add(l)
            this._releaseLayer(l)
            this._removeLayerFromActiveVoices(l)
          })
          break

        case 'minimal':
          this.filterUpdateInterval = 200 // 5Hz
          this.ambientFilterUpdateInterval = 1000 // 1Hz
          // Disable counterpoint + accompaniment (priority 1 & 2)
          ;['backgroundHigh', 'backgroundMid', 'backgroundLow', 'bass', 'pad', 'chords'].forEach(l => {
            this._disabledByStress.add(l)
            this._releaseLayer(l)
            this._removeLayerFromActiveVoices(l)
          })
          break

        case 'emergency':
          // Stop everything except direct gestures
          if (this.evolvingGenerationActive) {
            this.stopEvolvingGeneration()
          }
          ;['backgroundHigh', 'backgroundMid', 'backgroundLow', 'bass', 'pad', 'chords'].forEach(l => {
            this._disabledByStress.add(l)
            this._releaseLayer(l)
            this._removeLayerFromActiveVoices(l)
          })
          break

        case 'normal':
        default:
          // Restore: clear stress-disabled set, restore normal rates
          this._disabledByStress.clear()
          const filterRate = this.audioProfile?.filterUpdateRate || 30
          this.filterUpdateInterval = Math.round(1000 / filterRate)
          this.ambientFilterUpdateInterval = 200
          break
      }
    } catch (error) {
    }
  }

  /**
   * Release all active notes on a layer synth
   * @param {string} layerName - Layer to release
   */
  _releaseLayer(layerName) {
    const layer = this.ambientLayers && this.ambientLayers[layerName]
    if (!layer || layer.disposed) return
    try {
      if (layer.releaseAll) layer.releaseAll(0.1)
      else if (layer.triggerRelease) layer.triggerRelease()
    } catch (e) {
      // Ignore release errors
    }
  }

  /**
   * Remove all active voice tracking entries for a given layer
   * @param {string} layerName - Layer name prefix to match
   */
  _removeLayerFromActiveVoices(layerName) {
    if (!this.generativeState?.activeVoices) return
    for (const [voiceId] of this.generativeState.activeVoices) {
      if (voiceId.startsWith(`mono-${layerName}`) || voiceId.startsWith(`${layerName}-`) || voiceId.startsWith(`ambient-${layerName}`)) {
        this.generativeState.activeVoices.delete(voiceId)
      }
    }
  }

  /**
   * Entry #73: Check if a background layer should be played based on profile
   *
   * LAYER ARCHITECTURE:
   * The audio system has TWO TYPES of background layers:
   *
   * 1. AMBIENT LAYERS (bass, pad, chords):
   *    - Generated algorithmically by the local client
   *    - Controlled by audioProfile.backgroundLayers array
   *    - Progressively disabled as device tier decreases:
   *      - high: ['bass', 'pad', 'chords']
   *      - medium: ['bass', 'pad']
   *      - low: ['bass']
   *      - ultra-low: [] (none)
   *
   * 2. COMPOSITION LAYERS (backgroundHigh, backgroundMid, backgroundLow):
   *    - Received from the backend via WebSocket
   *    - Not controlled by audioProfile.backgroundLayers
   *    - Always enabled EXCEPT in Ultra-Low Power mode
   *    - These represent the shared musical composition across all users
   *
   * @param {string} layerName - 'bass', 'pad', 'chords', 'backgroundHigh', 'backgroundMid', or 'backgroundLow'
   * @returns {boolean} True if layer should be played
   */
  _isLayerEnabled(layerName) {
    // In Ultra-Low Power mode, ALL background audio is disabled
    // This is the most aggressive power-saving mode for very limited devices
    if (this.isUltraLowPowerMode) return false

    // Stress degradation: check if layer was disabled by stress monitor (Step 7)
    if (this._disabledByStress && this._disabledByStress.has(layerName)) return false

    // COMPOSITION LAYERS (counterpoint): Controlled by compositionLayers profile
    // Priority 1 (lowest) — first to be reduced on lower device tiers
    if (layerName === 'backgroundHigh' || layerName === 'backgroundMid' || layerName === 'backgroundLow') {
      if (this.audioProfile && this.audioProfile.compositionLayers !== undefined) {
        return this.audioProfile.compositionLayers.includes(layerName)
      }
      return true  // backward compat: if compositionLayers field missing, all enabled
    }

    // AMBIENT LAYERS (accompaniment): Controlled by backgroundLayers profile
    // Priority 2 — reduced after counterpoint on lower device tiers
    if (this.audioProfile && this.audioProfile.backgroundLayers) {
      return this.audioProfile.backgroundLayers.includes(layerName)
    }

    // Default: all layers enabled (for backwards compatibility)
    return true
  }

  /**
   * Entry #73: Get current audio status for UI
   * @returns {Object} Status info
   */
  getAudioStatus() {
    return {
      tier: this.audioProfile?.tier || 'unknown',
      isUltraLowPower: this.isUltraLowPowerMode,
      stressMode: this.stressMonitor?.getMode() || 'unknown',
      stressFactor: this.stressMonitor?.getStressFactor() || 1.0,
      enabledLayers: this.audioProfile?.backgroundLayers || ['bass', 'pad', 'chords'],
      isDegraded: this.stressMonitor?.isDegraded() || false
    }
  }

  /**
   * Start the audio engine
   * @returns {Promise} Resolves when audio context is ready
   */
  async start() {
    try {
      // STATE MACHINE: Check if already playing or starting
      if (this._audioState === 'PLAYING') {
        if (DEBUG_AUDIO_STATE) console.log('[AudioState] start() called but already PLAYING')
        return true
      }
      if (this._audioState === 'STARTING') {
        if (DEBUG_AUDIO_STATE) console.log('[AudioState] start() called but already STARTING')
        return false
      }

      // Transition to STARTING state
      this._setState('STARTING', 'start()')

      // Initialize Tone.js audio context
      if (window.Tone) {
        // PERF: Configure AudioContext BEFORE starting for optimal buffer size
        this._configureAudioContext()

        // Entry #73: Load audio profile and check for Low Power mode
        this._initializeAudioProfile()

        // Always ensure Tone is started (requires user gesture from click handler)
        if (Tone.context.state !== 'running') {
          await Tone.start()

          // Entry #46 FIX: If still suspended, try explicit context.resume() with proper polling
          // Previous implementation used fixed 50ms delay which was insufficient for audio hardware
          if (Tone.context.state !== 'running') {
            const rawContext = Tone.context.rawContext || Tone.context._context || Tone.context

            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                // Try to resume the raw AudioContext
                if (rawContext?.resume) {
                  await rawContext.resume()
                }
                // Also try Tone.context.resume if available
                if (Tone.context?.resume) {
                  await Tone.context.resume()
                }

                // Entry #46 FIX: Poll for state change with timeout instead of fixed delay
                // Audio hardware initialization can take variable time
                const pollTimeout = 500  // Max wait per attempt
                const pollInterval = 10   // Check every 10ms
                const startTime = Date.now()

                while (Tone.context.state !== 'running' && Date.now() - startTime < pollTimeout) {
                  await new Promise(resolve => setTimeout(resolve, pollInterval))
                }


                if (Tone.context.state === 'running') {
                  break
                }
              } catch (resumeError) {
              }
            }

            if (Tone.context.state !== 'running') {
            }
          }

          // Entry #48 FIX: Android 13+ aggressive resume strategy
          // Android has stricter autoplay policies that require additional measures
          // Reduced to 3 attempts with shorter delays (total ~600ms vs 3s)
          if (Tone.context.state !== 'running' && this._needsAggressiveResume) {

            for (let aggressiveAttempt = 1; aggressiveAttempt <= 3; aggressiveAttempt++) {
              try {
                const rawContext = Tone.context.rawContext || Tone.context._context || Tone.context

                // 1. Resume with all available methods first
                if (rawContext?.resume) {
                  await rawContext.resume()
                }
                if (Tone.context?.resume) {
                  await Tone.context.resume()
                }

                // 2. If still not running, try suspend/resume cycle
                if (Tone.context.state !== 'running' && rawContext?.suspend) {
                  await rawContext.suspend()
                  await new Promise(resolve => setTimeout(resolve, 50))
                  if (rawContext?.resume) {
                    await rawContext.resume()
                  }
                }

                // 3. Play silent buffer to "warm up" audio path (only if running)
                if (Tone.context.state === 'running') {
                  try {
                    const player = new Tone.Player().toDestination()
                    player.volume.value = -Infinity
                    player.start()
                    await new Promise(resolve => setTimeout(resolve, 30))
                    player.stop()
                    player.dispose()
                  } catch (e) {
                    // Ignore - just trying to warm up
                  }
                }

                // Poll for state change (shorter timeout)
                const pollStart = Date.now()
                while (Tone.context.state !== 'running' && Date.now() - pollStart < 200) {
                  await new Promise(resolve => setTimeout(resolve, 20))
                }

                if (Tone.context.state === 'running') {
                  break
                }

                // Wait before next attempt (100ms, 200ms, 300ms)
                await new Promise(resolve => setTimeout(resolve, 100 * aggressiveAttempt))

              } catch (e) {
              }
            }
          }
        } else {
        }

        // PERF: Entry #48/#59: Use platform-specific lookAhead for better scheduling buffer
        // Default is 0.05 (50ms), increase based on platform for stability
        // Chrome on Windows needs VERY aggressive settings (250ms)
        // Entry #90 FIX: Respect user's audioProfile.lookAhead if set
        let targetLookAhead = typeof PlatformDetection !== 'undefined'
          ? PlatformDetection.getAudioLookAhead()
          : (this._isWindowsChrome ? 0.15 : 0.1)

        // Chrome-specific override - even more aggressive (250ms)
        const chromeLookAhead = typeof PlatformDetection !== 'undefined' && typeof PlatformDetection.getAudioLookAheadChrome === 'function'
          ? PlatformDetection.getAudioLookAheadChrome()
          : null
        if (chromeLookAhead !== null) {
          targetLookAhead = chromeLookAhead
        }

        // Entry #90 FIX: Use user's lookAhead setting if specified (via UserSettings)
        // This takes priority over platform detection
        if (this.audioProfile && this.audioProfile.lookAhead && this.audioProfile.source === 'user-settings') {
          targetLookAhead = this.audioProfile.lookAhead
        }

        const isWindowsChromePure = typeof PlatformDetection !== 'undefined' && PlatformDetection.isWindowsChromePure()
        Tone.context.lookAhead = targetLookAhead

        // PERF: Entry #59: Use platform-specific updateInterval for Chrome Windows
        // Default is 0.025s (25ms). Higher values reduce scheduler CPU overhead
        // Chrome on Windows needs 100ms (4x default)
        // FIX: Use audioProfile.updateInterval if set by user, otherwise platform default
        const targetUpdateInterval = this.audioProfile?.updateInterval
          || (typeof PlatformDetection !== 'undefined' ? PlatformDetection.getAudioUpdateInterval() : 0.025)

        // Always set and log - updateInterval is critical for Chrome stability
        Tone.context.updateInterval = targetUpdateInterval

        // CRITICAL: Start Transport for scheduled events (only if context is running)
        if (Tone.context.state === 'running' && Tone.Transport.state !== 'started') {
          Tone.Transport.start()
          // console.log('🚀 Tone.Transport started for event scheduling')
        } else if (Tone.context.state !== 'running') {
        }

        // Entry #73: Start stress monitor after Transport is running
        this._startStressMonitor()

        // CRITICAL: Ensure audioContext is properly set
        this.audioContext = Tone.context
        // console.log('🔊 AudioContext set:', !!this.audioContext, 'state:', Tone.context?.state)

        // Create continuous generative music system if not already created
        // This will create new synths on first call, or reuse existing synths on subsequent calls
        // CRITICAL: Also check ambientLayers - initialize() may set isInitialized without creating synths
        if (!this.isInitialized || !this.ambientLayers) {
          // console.log('🔨 Starting audio system (will create or reuse synths)...')

          // This either creates new synths or reuses existing ones
          this.createContinuousGenerativeSystem()

          // Always restart generation loops
          this.startUpdateLoop()

          // Initialize new musical architecture services (only on first start)
          if (!this.musicalScheduler) {
            this.initializeNewMusicalArchitecture()
          }

          this.isInitialized = true
          // console.log('🔊 AudioService initialized successfully - Continuous generative music active')
        }

        // CRITICAL: Always restore master volume after stop() (was set to -Infinity)
        if (this.masterVolume && this.masterVolume.volume.value === -Infinity) {
          this.masterVolume.volume.value = -10
          // console.log('🔊 Master volume restored to -10dB')
        }

        // Verify components
        if (this.masterVolume && this.gestureSynth) {
          // console.log('✅ Audio components verified:', {
//            gestureSynthDisposed: this.gestureSynth.disposed,
//            masterVolumeExists: !!this.masterVolume,
//            masterVolumeValue: this.masterVolume.volume.value
////          })
        } else {
          // console.error('❌ Missing audio components:', {
//            masterVolume: !!this.masterVolume,
//            gestureSynth: !!this.gestureSynth
////          })
        }

        // Return true only if context is actually running
        const contextRunning = Tone.context.state === 'running'
        if (contextRunning) {
          // STATE MACHINE: Transition to PLAYING and register recovery handlers
          this._registerRecoveryHandlers()
          this._setState('PLAYING', 'start()-success')
        } else {
          // Failed to start - return to IDLE
          this._setState('IDLE', 'start()-context-not-running')
        }
        return contextRunning
      } else {
        this._setState('IDLE', 'start()-no-tone')
        throw new Error('Tone.js not available')
      }
    } catch (error) {
      // console.error('❌ Failed to start AudioService:', error)
      this._setState('IDLE', 'start()-error')
      throw error
    }
  }

  /**
   * Create continuous generative music system per FR-001
   * System MUST continuously generate ambient music even when no users are present
   * EVOLUTIVE: Now creates dynamic, evolving background composition with polyphony management
   * FIX: Never dispose synths - reuse existing synths to avoid "Synth was already disposed" error
   */
  createContinuousGenerativeSystem() {
    // console.log('🔨 Creating continuous generative system...')
    // console.log('🔖 AUDIOSERVICE VERSION: 2025-01-18-SEND-RETURN-v12')
    // console.log('✅ PRIME RHYTHMS: 3700, 5300, 7900 (LCM=43 HOURS)')
    // console.log('✅ PATTERNS + MICROVARIATIONS: rhythm × pattern × jitter(±5%)')
    // console.log('✅ FLAT ENVELOPES: attack/release 5ms ONLY - envelope does NOT mask pattern!')
    // console.log('✅ Pattern system: 12 contrasted patterns (LONG/SHORT/MIXED/EVEN)')
    // console.log('✅ FX ARCHITECTURE: Send/Return buses for delay and reverb (global FX)')
    // console.log('✅ Send levels: bass(15%), pad(20/30%), chords(20/25%), gesture(25/30%)')
    // console.log('🎯 Duration = EXACT pattern multiplier - no envelope artifacts!')

    // CRITICAL FIX: Never dispose synths immediately!
    // Tone.js internal timeouts from triggerAttackRelease() may still be scheduled
    // Disposing while these timeouts are pending causes "Synth was already disposed" error
    // Instead, we reuse existing synths if they exist

    // If synths already exist, skip creation and just reuse them
    if (this.gestureSynth && this.ambientLayers && this.masterVolume) {
      // console.log('♻️ Reusing existing synths (never dispose to avoid Tone.js timeout errors)')

      // Entry #27: Release ALL synths including ambientLayers to free voices for drone
      // Without this, pad's 4-second release keeps voices occupied = max polyphony exceeded
      if (this.gestureSynth && !this.gestureSynth.disposed) {
        this.gestureSynth.triggerRelease()  // MonoSynth uses triggerRelease()
      }
      if (this.ambientLayers) {
        Object.keys(this.ambientLayers).forEach(layer => {
          try {
            if (this.ambientLayers[layer] && !this.ambientLayers[layer].disposed) {
              // Support both PolySynth (releaseAll) and MonoSynth (triggerRelease)
              if (this.ambientLayers[layer].releaseAll) {
                this.ambientLayers[layer].releaseAll(0.05)
              } else if (this.ambientLayers[layer].triggerRelease) {
                this.ambientLayers[layer].triggerRelease()
              }
            }
          } catch (e) {
            // Ignore errors
          }
        })
      }
      // console.log('✅ All synths released and ready to reuse')

      // Restart evolving generation (was stopped by stop())
      if (!this.evolvingGenerationActive) {
        this.startEvolvingGeneration()
        // console.log('♻️ Restarted evolving generation with existing synths')
      }

      // Entry #28: Reset and restart DroneVoidController on synth reuse
      if (this.droneVoidController) {
        this.droneVoidController.reset()
        this.droneVoidController.start()
      }

      return // Exit early - synths already exist and are ready
    }

    // console.log('🆕 Creating new synths (first time initialization)...')

    // NOTE: Audio context is configured in _configureAudioContext() with platform-specific
    // latencyHint and lookAhead settings. Do not override here.

    // Create master volume node for centralized control (FR-011)
    this.masterVolume = new Tone.Volume(-10).toDestination()

    // Pass masterVolume to VolumeController (Sprint 2 refactoring)
    this.volumeController.setMasterVolumeNode(this.masterVolume)

    // Create global FX buses (100% wet for send/return architecture)
    // Note: Reverb needs async initialization for impulse response
    // PERFORMANCE: Reduced decay from 3.0s to 1.5s - halves impulse response CPU cost
    this.reverb = new Tone.Reverb({
      decay: 1.5,        // 1.5 second decay (was 3.0 - CPU intensive)
      preDelay: 0.01,    // 10ms predelay
      wet: 1.0           // 100% wet - this is a FX bus, not insert
    })

    // Connect reverb after creation (will work once ready)
    this.reverb.connect(this.masterVolume)

    // Wait for reverb to generate impulse response (non-blocking)
    this.reverb.ready.then(() => {
      // console.log('✅ Reverb impulse response ready')
    }).catch(e => {
    })

    this.delay = new Tone.FeedbackDelay({
      delayTime: 0.2,    // 200ms delay time
      maxDelay: 1,       // 1 second max
      feedback: 0.65,    // INCREASED from 0.55 - more echoes for landing page
      wet: 1.0           // 100% wet - this is a FX bus, not insert
    }).connect(this.masterVolume)

    // Create send buses for each FX (gain nodes to control send levels)
    this.delaySends = {
      bass: new Tone.Gain(0.20),      // Entry #216b: 20% delay - organ sub echoes
      pad: new Tone.Gain(0.30),       // Entry #216b: 30% delay - shimmer chorus trails
      chords: new Tone.Gain(0.30),    // Entry #216b: 30% delay - warm piano rhythmic echoes
      gesture: new Tone.Gain(0.25),   // 25% to delay (more present)
      backgroundHigh: new Tone.Gain(0.20),  // Entry #219c: 20% delay - pulse clarity
      backgroundMid: new Tone.Gain(0.20),   // Entry #219c: 20% delay - pwm space
      backgroundLow: new Tone.Gain(0.15)    // Entry #219c: 15% delay - square bass definition
    }

    this.reverbSends = {
      bass: new Tone.Gain(0.25),      // Entry #216b: 25% reverb - organ sub depth
      pad: new Tone.Gain(0.40),       // Entry #216b: 40% reverb - shimmer chorus ethereal
      chords: new Tone.Gain(0.30),    // Entry #216b: 30% reverb - warm piano room
      gesture: new Tone.Gain(0.3),    // 30% to reverb
      backgroundHigh: new Tone.Gain(0.25),  // Entry #219c: 25% reverb - pulse room
      backgroundMid: new Tone.Gain(0.25),   // Entry #219c: 25% reverb - pwm ambience
      backgroundLow: new Tone.Gain(0.20)    // Entry #219c: 20% reverb - square bass depth
    }

    // Connect send buses to FX
    Object.values(this.delaySends).forEach(send => send.connect(this.delay))
    Object.values(this.reverbSends).forEach(send => send.connect(this.reverb))

    // Voice stealing priority levels (higher = more protected)
    this.VOICE_PRIORITY = { COUNTERPOINT: 1, ACCOMPANIMENT: 2, REMOTE_GESTURE: 3, LOCAL_GESTURE: 4 }
    this.LAYER_PRIORITY_MAP = {
      backgroundHigh: 1, backgroundMid: 1, backgroundLow: 1,
      bass: 2, pad: 2, chords: 2
    }

    // OPTIMIZATION: Bucketed voice stealing (Phase 2)
    // Group voices by priority for O(1) insertion, O(n) sorting only on small buckets
    this.voicesByPriority = {
      1: [],  // COUNTERPOINT (lowest priority, steal first)
      2: [],  // ACCOMPANIMENT
      3: []   // REMOTE_GESTURE (never steal LOCAL_GESTURE priority 4)
    }

    // Stress-disabled layers (populated by _applyStressDegradation)
    this._disabledByStress = new Set()

    // Initialize generative composition state
    this.generativeState = {
      // INITIALIZATION FIX: activeVoices must be a Map for polyphony management
      // Without this, managePolyphony() would fail on first call
      activeVoices: new Map(),

      currentScale: [0, 2, 4, 7, 9], // Pentatonic major
      currentTonic: 220, // A3
      harmonicProgression: 0,
      evolutionCycle: 0,
      userInfluence: 0,
      lastUserActivity: Date.now(),
      evolutionSpeed: 8000, // Base evolution cycle
      complexity: 0.3, // Starting complexity

      // RHYTHMIC PATTERNS: Highly contrasted combinations to eliminate repetition
      // Categories: LONG-dominant, SHORT-dominant, MIXED, EVEN
      rhythmPatterns: [
        // LONG-dominant patterns (sustained notes)
        [3.0],                      // 0: single very long note
        [2.0, 1.0],                 // 1: long + medium
        [1.5, 1.5],                 // 2: two sustained notes

        // SHORT-dominant patterns (rapid notes)
        [0.3, 0.3, 0.3, 0.3],       // 3: four rapid notes
        [0.4, 0.4, 0.4, 0.4, 0.4],  // 4: five rapid notes
        [0.25, 0.25, 0.5],          // 5: very fast triplet

        // MIXED patterns (contrast within pattern)
        [0.5, 1.5],                 // 6: classic short-long
        [1.5, 0.5],                 // 7: inverted long-short
        [0.3, 2.0],                 // 8: very short + very long (dramatic)
        [2.0, 0.3],                 // 9: very long + very short (dramatic inverted)

        // EVEN patterns (steady pulse)
        [1.0, 1.0, 1.0],            // 10: steady triplet
        [0.8, 0.8, 0.8, 0.8],       // 11: steady quadruplet
      ],

      // SIMPLIFIED STRUCTURE: Bass + Pad + Chords
      // Event density hierarchy: bass > chords > pad
      // MUSICALLY SYNCHRONIZED RHYTHMS: All based on chordDuration (8000ms = 1 bar)
      // chordDuration = 8000ms represents 1 bar at 120bpm (4/4 time)
      // This creates organic, musically coherent composition
      layers: {
        bass: {
          nextNoteTime: 0,
          rhythm: 2000,      // 1/4 bar = 1 beat (4 events per chord change)
          currentNote: 0,    // Current scale degree
          octave: -2,        // Two octaves below tonic (55-110Hz range)
          velocity: 0.45,    // Balanced velocity
          lastFrequency: null,  // Track for release
          currentPatternIndex: 3,  // Start with SHORT pattern (four rapid)
          patternPosition: 0       // Position within the pattern
        },
        pad: {
          nextNoteTime: 1200,  // Offset start to avoid initial cluster
          rhythm: 16000,     // 2 bars (plays every 2 chord changes for sustained harmony)
          currentNotes: [2, 4],  // Two notes for pad (third and fifth)
          octave: 0,         // Same as tonic (220Hz range)
          velocity: 0.10,    // Entry #188d: Drones quieter than gestures
          lastFrequencies: [],  // Track for release
          currentPatternIndex: 0,  // Start with LONG pattern (single sustained)
          patternPosition: 0
        },
        chords: {
          nextNoteTime: 2400, // Different offset
          rhythm: 4000,      // 1/2 bar (2 events per chord change for rhythmic interest)
          currentChord: 0,   // Index in progression
          octave: 1,         // One octave above tonic (440Hz range)
          velocity: 0.40,    // Moderate velocity
          lastFrequencies: [],  // Track for release
          currentPatternIndex: 10,  // Start with EVEN pattern (steady triplet)
          patternPosition: 0
        }
      },

      // HARMONIC CONTEXT - Multiple progressions for variety
      availableProgressions: [
        { name: 'I-V-vi-IV', degrees: [0, 4, 5, 3], mood: 'uplifting' },     // Pop progression
        { name: 'I-IV-V-IV', degrees: [0, 3, 4, 3], mood: 'driving' },       // Rock progression
        { name: 'i-VI-III-VII', degrees: [0, 5, 2, 6], mood: 'dramatic' },   // Minor progression
        { name: 'I-vi-IV-V', degrees: [0, 5, 3, 4], mood: 'circular' },      // Classic progression
        { name: 'I-V-vi-iii-IV', degrees: [0, 4, 5, 2, 3], mood: 'flowing' },// Extended progression
        { name: 'I-iii-vi-IV', degrees: [0, 2, 5, 3], mood: 'melancholic' }, // Sad progression
        { name: 'I-VII-IV-V', degrees: [0, 6, 3, 4], mood: 'mysterious' }    // Modal progression
      ],
      currentProgressionIndex: 0,
      chordProgression: [0, 4, 5, 3], // Start with I-V-vi-IV
      currentChord: 0,
      chordDuration: 8000, // Time on each chord in milliseconds
      lastChordChange: Date.now(), // Track when chord last changed
      progressionCycles: 0, // How many times through current progression
      nextProgressionChange: 4 // Change progression after N cycles
    }

    // FIX: Create synths from configuration (respects user quality settings)
    // Synth complexity is determined by audioProfile.synthComplexity
    // See SYNTH_COMPLEXITY_CONFIG in UserSettings.js for tier configurations
    this.ambientLayers = {}
    const synthConfig = this._getSynthConfig()
    this._createAmbientSynthsFromConfig(synthConfig)
    this._currentSynthComplexity = this.audioProfile?.synthComplexity || 'full'

    // MONOSYNTH TIMING FIX: Track last trigger time per layer to avoid
    // "Start time must be strictly greater than previous start time" error
    this.monoSynthLastTrigger = {
      bass: 0,
      backgroundHigh: 0,
      backgroundMid: 0,
      backgroundLow: 0
    }

    // Create individual filters and volumes for each layer
    // FIX: Only create filters if useAmbientFilters is enabled (saves CPU on low-end devices)
    if (this.audioProfile?.useAmbientFilters !== false) {
      this.ambientFilters = {
        bass: new Tone.Filter({ type: 'lowpass', frequency: 300, Q: 1.2 }),   // Entry #216b: FM sub needs low-mids for richness
        pad: new Tone.Filter({ type: 'lowpass', frequency: 2000, Q: 0.8 }),   // Entry #216b: Fattriangle shimmer needs highs
        chords: new Tone.Filter({ type: 'lowpass', frequency: 4000, Q: 1 }),  // Entry #216b: Warm FM needs less highs than bell
        backgroundHigh: new Tone.Filter({ type: 'lowpass', frequency: 5000, Q: 1 }),    // Entry #219c: Pulse needs brightness
        backgroundMid: new Tone.Filter({ type: 'lowpass', frequency: 3000, Q: 1 }),     // Entry #219c: PWM needs harmonics
        backgroundLow: new Tone.Filter({ type: 'lowpass', frequency: 1500, Q: 1.5 })    // Entry #219c: Square needs body
      }
    } else {
      // No filters - synths will connect directly to volumes
      this.ambientFilters = null
    }

    // Background volumes - balanced with gestures
    // Entry #216c: Increased all background volumes (+3-6 dB) - was too quiet
    this.ambientVolumes = {
      bass: new Tone.Volume(+3),      // Entry #216c: +3 dB (was 0) - fuller foundation
      pad: new Tone.Volume(0),        // Entry #216c: 0 dB (was -3) - more presence
      chords: new Tone.Volume(+3),    // Entry #216c: +3 dB (was 0) - more definition
      backgroundHigh: new Tone.Volume(0),   // Entry #216c: 0 dB (was -3) - melody audible
      backgroundMid: new Tone.Volume(-3),   // Entry #216c: -3 dB (was -6) - harmony present
      backgroundLow: new Tone.Volume(-3)    // Entry #216c: -3 dB (was -6) - bass foundation
    }

    // Connect each layer with SEND/RETURN architecture
    // Routing: synth -> filter -> volume -> [dry to master + sends to FX]
    // FIX: If filters disabled, route directly: synth -> volume
    Object.keys(this.ambientLayers).forEach(layer => {
      if (this.ambientFilters?.[layer]) {
        // Full routing with filters
        this.ambientLayers[layer].connect(this.ambientFilters[layer])
        this.ambientFilters[layer].connect(this.ambientVolumes[layer])
      } else {
        // Direct routing (no filters - saves CPU)
        this.ambientLayers[layer].connect(this.ambientVolumes[layer])
      }

      // Dry signal to master
      this.ambientVolumes[layer].connect(this.masterVolume)

      // Send to delay bus
      this.ambientVolumes[layer].connect(this.delaySends[layer])

      // Send to reverb bus
      this.ambientVolumes[layer].connect(this.reverbSends[layer])
    })

    // Setup drone modulations (amplitude, filter, pitch drift)
    this.setupDroneModulation()

    // Entry #28: Initialize and start DroneVoidController
    // Must be after setupDroneModulation() to have access to droneAmplitudeGain
    if (typeof DroneVoidController !== 'undefined') {
      // Critical #3: Verify initialization dependencies before starting
      if (!this.droneAmplitudeGain) {
      }
      this.droneVoidController = new DroneVoidController(this)
      this.droneVoidController.start()
      // console.log('DroneVoidController: Initialized - drone starts silent until activity void')
    }

    // Create gesture-responsive synth - MONOPHONIC (true MonoSynth)
    // MonoSynth is structurally monophonic - only one note can play at a time
    this.gestureSynth = new Tone.MonoSynth({
      oscillator: {
        type: 'sawtooth'
      },
      volume: 0,  // 0dB - equalized with remote/virtual users
      envelope: {
        attack: 0.02,  // Faster attack
        decay: 0.2,   // Faster decay
        sustain: 0.3,  // Lower sustain to prevent overlapping
        release: 0.8    // Faster release
      }
    })

    // MONOSYNTH TIMING FIX: Track last trigger times for different code paths
    this._sustainedHoldLastTrigger = 0  // Context time tracker (for sustained holds, playSimpleNote)
    this._playMusicalEventLastTrigger = 0  // Context time tracker (for playMusicalEvent gestureSynth path)

    // Add pan node for gesture synth spatial control
    this.gesturePan = new Tone.Panner(0)

    // Entry #SynthUI: Create gestureFilter for UI control (re-added for SynthPanel)
    this.gestureFilter = new Tone.Filter({
      type: 'lowpass',
      frequency: 8000,  // Wide open by default
      Q: 1
    })

    // Track current preset (null = default sawtooth)
    this.currentPresetSlot = null
    this.currentPatch = null

    // SEND/RETURN routing: synth -> filter -> pan -> [dry to master + sends to FX]
    this.gestureSynth.connect(this.gestureFilter)
    this.gestureFilter.connect(this.gesturePan)

    // Create volume node for gesture dry signal (increased for prominence)
    this.gestureVolume = new Tone.Volume(0) // 0dB - equalized with remote/virtual gestures

    // Dry signal routing: pan -> volume -> master
    this.gesturePan.connect(this.gestureVolume)
    this.gestureVolume.connect(this.masterVolume)

    // Send to delay bus
    this.gesturePan.connect(this.delaySends.gesture)

    // Send to reverb bus
    this.gesturePan.connect(this.reverbSends.gesture)

    // console.log('🔌 Gesture routing: gestureSynth → filter → pan → [gestureVolume → master + sends to FX]')
    // console.log('🔊 Gesture synth volume:', this.gestureSynth.volume.value, 'dB')
    // console.log('🔊 Gesture dry volume:', this.gestureVolume.volume.value, 'dB')

    // Polyphony management
    this.maxTotalVoices = 8 // Maximum total voices across all synths

    // Initialize UserSynthManager for per-user unique timbres
    // Each user (real or virtual) gets their own synth with unique patch
    // console.log('🔍 Checking UserSynthManager availability:', typeof UserSynthManager)
    // console.log('🔍 Checking PatchDefinitions availability:', typeof window.PatchDefinitions)
    if (typeof UserSynthManager !== 'undefined') {
      this.userSynthManager = new UserSynthManager({
        masterVolume: this.masterVolume,
        delay: this.delay,
        reverb: this.reverb
      })
      // console.log('✅ UserSynthManager: Initialized for per-user timbres')

      // Apply slot lookup if socketService was already set (from main.js init)
      if (this.socketService) {
        this.userSynthManager.setSlotLookup((userId) => {
          return this.socketService.getSlotForUser(userId)
        })
        // console.log('🎹 UserSynthManager: Slot lookup applied from existing socketService')
      }
    } else {
      console.error('❌ UserSynthManager NOT AVAILABLE - all users will have same timbre!')
    }

    // DISABLED: Old single-event generative system
    // Now using BackgroundCompositionService which generates structured compositions
    // this.startEvolvingGeneration()

    // console.log('🎵 Audio system initialized - BackgroundCompositionService generates compositions from backend')
  }

  /**
   * Set socket service for slot lookup (called from main.js after room join)
   * This enables backend-assigned exclusive slots for each user
   * @param {SocketService} socketService - The socket service instance
   */
  setSocketService(socketService) {
    this.socketService = socketService

    // Configure UserSynthManager to use backend-assigned slots
    if (this.userSynthManager && socketService) {
      this.userSynthManager.setSlotLookup((userId) => {
        return socketService.getSlotForUser(userId)
      })
      // console.log('🎹 AudioService: Slot lookup configured via SocketService')
    }
  }

  /**
   * Setup drone modulations for organic, evolving pad sound
   * - Amplitude LFO: Very slow breathing (20-50 second cycles)
   * - Filter LFO: Slow timbral evolution
   * - Pitch drift: Subtle detuning for organic feel
   */
  setupDroneModulation() {
    // Guard: ensure ambient layers exist before setting up modulation
    if (!this.ambientFilters?.pad || !this.ambientVolumes?.pad || !this.ambientLayers?.pad) {
      // console.warn('Drone modulation skipped: ambient layers not ready')
      return
    }

    try {
      // AMPLITUDE MODULATION: Very slow tremolo effect
      // Frequency 0.03 Hz = ~33 second cycle (very slow breathing)
      this.droneAmplitudeLFO = new Tone.LFO({
        frequency: 0.03,  // 33 second cycle
        min: -6,          // -6dB minimum (quieter)
        max: 0,           // 0dB maximum (full volume)
        type: 'sine'
      })

      // Create a Gain node for amplitude modulation
      this.droneAmplitudeGain = new Tone.Gain(1)

      // Re-route pad: disconnect from filter, insert gain
      // New chain: pad -> filter -> amplitudeGain -> volume -> master
      this.ambientFilters.pad.disconnect(this.ambientVolumes.pad)
      this.ambientFilters.pad.connect(this.droneAmplitudeGain)
      this.droneAmplitudeGain.connect(this.ambientVolumes.pad)

      // Connect LFO to volume node
      this.droneAmplitudeLFO.connect(this.ambientVolumes.pad.volume)
      this.droneAmplitudeLFO.start()

      // REMOVED: droneFilterLFO (was 50 second cycle on pad.frequency)
      // Reason: Conflicts with updateBackgroundFilters. Keeping only amplitude LFO for volume modulation.
    } catch (e) {
    }

    // PITCH DRIFT: Subtle organic detuning
    // Frequency 0.05 Hz = 20 second cycle, very subtle range
    this.dronePitchLFO = new Tone.LFO({
      frequency: 0.05,   // 20 second cycle
      min: -8,           // -8 cents
      max: 8,            // +8 cents
      type: 'sine'
    })

    // Connect to pad detune (PolySynth.detune may not be connectable in all Tone.js versions)
    try {
      if (this.ambientLayers.pad && this.ambientLayers.pad.detune) {
        this.dronePitchLFO.connect(this.ambientLayers.pad.detune)
        this.dronePitchLFO.start()
      }
    } catch (e) {
      // Pitch drift not available for PolySynth - skip gracefully
      // console.warn('Pitch drift LFO not connected:', e.message)
    }

    // Randomize LFO phases so they don't all sync up
    this.droneAmplitudeLFO.phase = Math.random() * 360
    if (this.dronePitchLFO.state === 'started') {
      this.dronePitchLFO.phase = Math.random() * 360
    }

    // console.log('🎵 Drone modulation setup complete: amplitude (33s), pitch (20s)')
  }

  /**
   * Start evolving generative music system with independent voices
   * REAL-TIME FIX: Uses Transport.scheduleRepeat for rock-solid timing
   * MUSICAL COMPOSITION: Multi-voice counterpoint with voice leading
   */
  startEvolvingGeneration() {
    // ============================================================================
    // Entry #206: LOCAL GENERATIVE LOOP PERMANENTLY DISABLED
    // ============================================================================
    // Accompaniment (bass, pad, keys) now comes from the backend via polyphonic compositions.
    // This ensures all layers use the same harmonic progression, tempo, and genre.
    //
    // DO NOT RE-ENABLE: This would conflict with backend-coordinated accompaniment.
    // If you need to restore local generation, coordinate with backend's orchestration system.
    //
    // The function is kept (not deleted) because it's called from 12+ places in AudioService.
    // Those call sites expect the function to exist and handle the "should I generate?" decision.
    // ============================================================================
    return

    // --- DISABLED CODE BELOW (kept for reference) ---
    if (this.evolvingGenerationActive) return

    // STATE MACHINE: Don't start if audio is stopped
    if (this._audioState === 'STOPPED') {
      return
    }

    this.evolvingGenerationActive = true
    this.lastVoiceUpdateTime = Date.now()

    // Ensure Transport is running
    if (Tone.Transport.state !== 'started') {
      Tone.Transport.start()
    }

    // REAL-TIME FIX: Pre-cache layer names to avoid Object.keys allocation in loop
    const layerNames = Object.keys(this.generativeState.layers)

    // Composition tick function - called precisely by Transport
    const compositionTick = () => {
      if (!this.evolvingGenerationActive || !this.isInitialized) {
        return
      }

      try {
        const now = Date.now()
        const deltaTime = now - this.lastVoiceUpdateTime
        this.lastVoiceUpdateTime = now

        // Update each layer independently using for loop (no allocation)
        for (let i = 0; i < layerNames.length; i++) {
          const layerName = layerNames[i]
          const layer = this.generativeState.layers[layerName]

          // Check if it's time for this layer to play
          layer.nextNoteTime -= deltaTime
          if (layer.nextNoteTime <= 0) {
            this.playLayer(layerName)

            // PATTERN-BASED RHYTHM SYSTEM
            const currentPattern = this.generativeState.rhythmPatterns[layer.currentPatternIndex]
            const patternMultiplier = currentPattern[layer.patternPosition]

            // Advance position in pattern
            layer.patternPosition++

            // If pattern is complete, choose a new random pattern
            if (layer.patternPosition >= currentPattern.length) {
              const oldPattern = layer.currentPatternIndex
              do {
                layer.currentPatternIndex = Math.floor(Math.random() * this.generativeState.rhythmPatterns.length)
              } while (layer.currentPatternIndex === oldPattern && this.generativeState.rhythmPatterns.length > 1)

              layer.patternPosition = 0
            }

            // PATTERN + MICROVARIATIONS for organic timing
            const baseTime = layer.rhythm * patternMultiplier
            const jitter = 1 + (Math.random() - 0.5) * 0.1
            layer.nextNoteTime = baseTime * jitter
          }
        }

        // Harmonic progression change based on actual time
        const timeSinceChordChange = now - this.generativeState.lastChordChange
        if (timeSinceChordChange >= this.generativeState.chordDuration) {
          this.advanceHarmony()
          this.generativeState.lastChordChange = now
        }

        this.generativeState.evolutionCycle++

      } catch (error) {
        // Silently handle errors to prevent loop disruption
      }
    }

    // REAL-TIME FIX: Use Transport.scheduleRepeat instead of recursive setTimeout
    // This schedules on the audio thread, immune to main thread congestion
    // 100ms interval (0.1 seconds) for responsive scheduling
    const startTime = Tone.now() + 2 // 2 second delay like original

    this.compositionLoopEventId = Tone.Transport.scheduleRepeat((audioTime) => {
      // Entry #73 FIX: Record timing for stress monitoring (composition loop)
      if (this.stressMonitor) {
        this.stressMonitor.recordTiming(audioTime, Tone.now())
      }

      // The callback timing is precise, but we do the work synchronously
      // This is still better than setTimeout because the *timing* is audio-accurate
      compositionTick()
    }, 0.1, startTime) // 100ms interval

    // Track for cleanup
    this.scheduledTransportEvents.push(this.compositionLoopEventId)
  }

  /**
   * Update generative state based on user activity and musical context
   */
  updateGenerativeState() {
    const state = this.generativeState
    state.evolutionCycle++

    // Time-based evolution (organic change over time)
    const timeFactor = Math.sin(state.evolutionCycle * 0.05) * 0.5 + 0.5
    state.complexity = 0.2 + timeFactor * 0.4 + state.userInfluence * 0.4

    // User activity influence (recent gestures increase complexity)
    const timeSinceActivity = Date.now() - state.lastUserActivity
    const activityDecay = Math.max(0, 1 - timeSinceActivity / 30000) // 30 second decay
    state.userInfluence *= 0.95 // Gradual decay
    state.userInfluence = Math.max(0.1, state.userInfluence)

    // Harmonic progression advancement
    if (Math.random() < 0.3 + state.complexity * 0.2) {
      state.harmonicProgression = (state.harmonicProgression + 1) % state.currentScale.length
    }

    // Occasional key changes (based on evolution cycles)
    if (state.evolutionCycle % 20 === 0) {
      this.mutateHarmonicContext()
    }

    // Adjust evolution speed based on complexity
    state.evolutionSpeed = 4000 + (1 - state.complexity) * 6000 + Math.random() * 2000
  }

  /**
   * Mutate harmonic context for variety
   */
  mutateHarmonicContext() {
    const state = this.generativeState
    const mutationTypes = ['tonic_shift', 'scale_change', 'mode_change']
    const mutation = mutationTypes[Math.floor(Math.random() * mutationTypes.length)]

    switch (mutation) {
      case 'tonic_shift':
        // Shift tonic by a musical interval
        const intervals = [3, 4, 5, 7, 9] // Minor third, major third, perfect fourth, fifth, major sixth
        const interval = intervals[Math.floor(Math.random() * intervals.length)]
        state.currentTonic = 110 + (state.currentTonic + interval * 20) % 440 // Keep in reasonable range
        break

      case 'scale_change':
        // Change scale type
        const scales = {
          pentatonic_major: [0, 2, 4, 7, 9],
          pentatonic_minor: [0, 3, 5, 7, 10],
          natural_minor: [0, 2, 3, 5, 7, 8, 10],
          dorian: [0, 2, 3, 5, 7, 9, 10],
          mixolydian: [0, 2, 4, 5, 7, 9, 10]
        }
        const scaleNames = Object.keys(scales)
        const newScaleName = scaleNames[Math.floor(Math.random() * scaleNames.length)]
        state.currentScale = scales[newScaleName]
        break

      case 'mode_change':
        // Invert or modify current scale
        if (Math.random() > 0.5) {
          // Add chromatic tones
          state.currentScale = [...state.currentScale, 1, 6, 8, 11].slice(0, 7)
        }
        break
    }

    // console.log(`🎵 Harmonic mutation: ${mutation}, new tonic: ${state.currentTonic}Hz`)
  }

  // OLD FUNCTIONS REMOVED - Now using simplified playLayer() system
  // generateEvolvingLayer() and selectNotesForLayer() have been replaced
  // with bass + pad + chords architecture to reduce polyphony

  /**
   * Play a musical layer (bass, pad, or chords)
   * SIMPLIFIED COMPOSITION: Clear bass + sustained pad + triad chords
   * @param {string} layerName - Name of layer ('bass', 'pad', 'chords')
   */
  playLayer(layerName) {
    // console.log(`🎹 playLayer CALLED for ${layerName} at ${Date.now()}`)

    const state = this.generativeState
    const layer = state.layers[layerName]
    const scale = state.currentScale

    if (!this.ambientLayers || this.muted) return

    // Entry #73: Skip layer if disabled by device profile
    if (!this._isLayerEnabled(layerName)) return

    const synth = this.ambientLayers[layerName]
    if (!synth) return

    // Get current chord root from progression
    const chordRoot = state.chordProgression[state.currentChord]
    const chordRootIndex = scale.indexOf(chordRoot)

    // Release previous notes moved inside layer-specific code
    // to prevent releasing notes we're about to retrigger

    // Calculate frequencies based on layer type
    let frequencies = []

    // PATTERN-BASED DURATION: Match note duration to rhythmic pattern
    // Duration should reflect the pattern multiplier for coherent rhythm
    const currentPattern = state.rhythmPatterns[layer.currentPatternIndex]
    const currentPosition = (layer.patternPosition - 1 + currentPattern.length) % currentPattern.length
    const patternMultiplier = currentPattern[currentPosition]

    // Base durations per layer
    let baseDuration
    if (layerName === 'bass') {
      baseDuration = 1.0  // 1 second base
    } else if (layerName === 'pad') {
      baseDuration = 2.5  // 2.5 seconds base (longer sustains)
    } else if (layerName === 'chords') {
      baseDuration = 1.8  // 1.8 seconds base
    }

    // Duration matches pattern: if pattern says 2.0x rhythm, note lasts 2.0x duration
    // This creates coherent relationship between note spacing and note length
    // Articulation: notes slightly shorter than inter-onset for clarity (80%)
    const articulationFactor = 0.8 - (state.complexity * 0.1)  // Higher complexity = more staccato
    const duration = baseDuration * patternMultiplier * articulationFactor

    // DEBUG: Log pattern usage for duration calculation
    // console.log(`🎼 ${layerName} DURATION: pattern[${currentPosition}]=${patternMultiplier} → dur=${duration.toFixed(2)}s (from pattern ${layer.currentPatternIndex}: [${currentPattern.join(', ')}])`)

    if (layerName === 'bass') {
      // BASS: ONLY root note - NO variation to avoid repetitive melodic pattern
      // Previous variation [root, fifth, root+octave] created "C-G-C" repetition
      // User perceived this as "note played twice" pattern
      const scaleNote = chordRoot
      const frequency = state.currentTonic * Math.pow(2, (scaleNote / 12) + layer.octave)
      frequencies = [frequency]

      // CRITICAL: Release previous note (bass is MonoSynth, uses triggerRelease)
      try {
        synth.triggerRelease()
      } catch (e) {
        // Ignore release errors
      }
      layer.lastFrequency = frequency

    } else if (layerName === 'pad') {
      // PAD: Third and fifth (2 notes)
      const third = scale[(chordRootIndex + 2) % scale.length]
      const fifth = scale[(chordRootIndex + 4) % scale.length]

      // octave=0 → same as tonic
      const freq3 = state.currentTonic * Math.pow(2, (third / 12) + layer.octave)
      const freq5 = state.currentTonic * Math.pow(2, (fifth / 12) + layer.octave)
      frequencies = [freq3, freq5]

      // CRITICAL: Release with short time to immediately free voices
      try {
        synth.releaseAll(0.1)  // 100ms release for pad (slightly longer for smooth transition)
      } catch (e) {
        // Ignore release errors
      }
      layer.lastFrequencies = frequencies

    } else if (layerName === 'chords') {
      // CHORDS: Triad (root, third, fifth)
      const root = chordRoot
      const third = scale[(chordRootIndex + 2) % scale.length]
      const fifth = scale[(chordRootIndex + 4) % scale.length]

      // octave=1 → one octave above tonic
      const freqR = state.currentTonic * Math.pow(2, (root / 12) + layer.octave)
      const freq3 = state.currentTonic * Math.pow(2, (third / 12) + layer.octave)
      const freq5 = state.currentTonic * Math.pow(2, (fifth / 12) + layer.octave)
      frequencies = [freqR, freq3, freq5]

      // CRITICAL: Release with short time to immediately free voices
      try {
        synth.releaseAll(0.05)  // 50ms release for chords
      } catch (e) {
        // Ignore release errors
      }
      layer.lastFrequencies = frequencies
    }

    // ORGANIC VELOCITY VARIATION: Musical dynamics
    // Each layer varies around its base velocity with different ranges
    let velocityVariation
    if (layerName === 'bass') {
      // Bass: ±20% variation for rhythmic emphasis
      velocityVariation = 0.8 + Math.random() * 0.4
    } else if (layerName === 'pad') {
      // Pad: ±15% variation for subtle swells
      velocityVariation = 0.85 + Math.random() * 0.3
    } else if (layerName === 'chords') {
      // Chords: ±25% variation for dynamic interest
      velocityVariation = 0.75 + Math.random() * 0.5
    }

    // Complexity adds micro-variations in dynamics
    const dynamicFactor = 0.9 + (Math.random() * 0.2) * state.complexity
    const playVelocity = layer.velocity * velocityVariation * dynamicFactor

    // Trigger notes
    // REAL-TIME FIX: Use for loop instead of forEach to avoid closure allocation
    try {
      const triggerTime = Tone.now()

      for (let i = 0; i < frequencies.length; i++) {
        synth.triggerAttackRelease(frequencies[i], duration, triggerTime, playVelocity)
      }
    } catch (error) {
      // Silently handle errors
    }
  }

  /**
   * Advance harmonic progression
   * Changes current chord in progression and evolves progressions
   */
  advanceHarmony() {
    const state = this.generativeState
    state.currentChord = (state.currentChord + 1) % state.chordProgression.length

    // If we completed a full progression cycle
    if (state.currentChord === 0) {
      state.progressionCycles++

      // Change progression after N cycles based on collective metrics
      if (state.progressionCycles >= state.nextProgressionChange) {
        this.changeProgression()
        state.progressionCycles = 0
        // Vary the cycles between changes (3-6 cycles)
        state.nextProgressionChange = 3 + Math.floor(Math.random() * 4)
      }
    }

    const currentProg = state.availableProgressions[state.currentProgressionIndex]
    // console.log(`🎵 Harmony: ${currentProg.name} chord ${state.currentChord}/${state.chordProgression.length} (root: ${state.chordProgression[state.currentChord]})`)

    // Occasional key modulation
    if (state.evolutionCycle % 32 === 0 && Math.random() < 0.2) {
      this.mutateHarmonicContext()
    }
  }

  /**
   * Change to a different chord progression based on activity
   */
  changeProgression() {
    const state = this.generativeState

    // Use complexity to choose progression mood
    let targetMoods
    if (state.complexity > 0.7) {
      // High energy: use driving/uplifting progressions
      targetMoods = ['driving', 'uplifting', 'flowing']
    } else if (state.complexity > 0.4) {
      // Medium energy: use circular/mysterious progressions
      targetMoods = ['circular', 'mysterious', 'flowing']
    } else {
      // Low energy: use melancholic/dramatic progressions
      targetMoods = ['melancholic', 'dramatic', 'mysterious']
    }

    // Filter progressions by mood
    const suitableProgressions = state.availableProgressions
      .map((prog, index) => ({ ...prog, index }))
      .filter(prog => targetMoods.includes(prog.mood))

    // Choose random from suitable progressions (avoid current)
    const options = suitableProgressions.filter(p => p.index !== state.currentProgressionIndex)
    if (options.length > 0) {
      const chosen = options[Math.floor(Math.random() * options.length)]
      state.currentProgressionIndex = chosen.index
      state.chordProgression = chosen.degrees
      state.currentChord = 0 // Reset to beginning of new progression

      // console.log(`🎼 PROGRESSION CHANGE: ${chosen.name} (${chosen.mood}) complexity=${state.complexity.toFixed(2)}`)
    }
  }

  /**
   * Test audio to verify setup
   */
  testAudio() {
    if (!this.ambientSynth) return

    // console.log('🔊 Testing audio - you should hear a test tone')
    this.ambientSynth.triggerAttackRelease(440, '4n', undefined, 0.5)

    setTimeout(() => {
      // console.log('🔊 Audio test completed')
    }, 1000)
  }

  /**
   * Stop the audio engine
   */
  stop() {
    // STATE MACHINE: Transition to STOPPED
    // This prevents any recovery from happening (handlers check state)
    this._setState('STOPPED', 'stop()')

    // Unregister recovery handlers - no more visibility/focus events
    this._unregisterRecoveryHandlers()

    if (this.isInitialized) {

      // STEP 0: Stop health monitoring (prevent recovery attempts during stop)
      this._stopAudioHealthCheck()

      // STEP 0b: MUTE EVERYTHING IMMEDIATELY (before anything else)
      if (this.masterVolume) {
        this.masterVolume.volume.value = -Infinity
        // console.log('🔇 Master volume set to -Infinity (immediate silence)')
      }

      // STEP 1: Clear ALL scheduled timeouts (prevents future notes)
      // console.log(`⏱️ Clearing ${this.scheduledTimeouts.length} scheduled timeouts...`)
      this.scheduledTimeouts.forEach(timeoutId => {
        clearTimeout(timeoutId)
      })
      this.scheduledTimeouts = []
      // console.log('✅ All timeouts cleared')

      // Entry #198: Clear composition queue and scheduled playback event
      if (this._nextCompositionEventId !== null) {
        try {
          Tone.Transport.clear(this._nextCompositionEventId)
        } catch (e) {
          // Event may already be cleared
        }
        this._nextCompositionEventId = null
      }
      this._compositionQueue = []
      this._isPlayingComposition = false

      // STEP 2: Clear scheduled Transport events and stop Transport
      try {
        // Clear individual scheduled events first
        if (this.scheduledTransportEvents && this.scheduledTransportEvents.length > 0) {
          this.scheduledTransportEvents.forEach(eventId => {
            try {
              Tone.Transport.clear(eventId)
            } catch (e) {
              // Event may already be cleared
            }
          })
          this.scheduledTransportEvents = []
        }

        if (Tone.Transport) {
          Tone.Transport.stop()
          Tone.Transport.cancel()  // Cancel all future events
          // console.log('✅ Transport stopped and all events cancelled')
        }
      } catch (error) {
        // console.warn('⚠️ Transport error:', error.message)
      }

      // Entry #28: Stop DroneVoidController
      if (this.droneVoidController) {
        this.droneVoidController.stop()
      }

      // PERFORMANCE: Dispose drone LFOs to prevent memory leak
      if (this.droneAmplitudeLFO) {
        try {
          this.droneAmplitudeLFO.stop()
          this.droneAmplitudeLFO.dispose()
          this.droneAmplitudeLFO = null
        } catch (e) {
          // Expected if LFO already disposed, warn on unexpected errors
          if (e.message && !e.message.includes('disposed')) {
            console.warn('⚠️ droneAmplitudeLFO disposal error:', e.message)
          }
        }
      }
      if (this.dronePitchLFO) {
        try {
          this.dronePitchLFO.stop()
          this.dronePitchLFO.dispose()
          this.dronePitchLFO = null
        } catch (e) {
          // Expected if LFO already disposed, warn on unexpected errors
          if (e.message && !e.message.includes('disposed')) {
            console.warn('⚠️ dronePitchLFO disposal error:', e.message)
          }
        }
      }

      // STEP 3: Stop generation
      this.evolvingGenerationActive = false
      this.stopUpdateLoop()

      // STEP 4: Release all active sustained notes before stopping
      if (this.activeSustainedNotes && this.activeSustainedNotes.size > 0) {
        // console.log(`🛑 Releasing ${this.activeSustainedNotes.size} active sustained notes`)
        for (const [noteId, noteData] of this.activeSustainedNotes.entries()) {
          try {
            this.gestureSynth.triggerRelease(noteData.frequency, Tone.now())
          } catch (e) {
            // console.warn(`⚠️ Error releasing sustained note ${noteId}:`, e.message)
          }
        }
        this.activeSustainedNotes.clear()
      }

      // STEP 5: Release all notes on all synths
      // console.log('🎹 Releasing all notes on all synths...')

      try {
        if (this.gestureSynth && !this.gestureSynth.disposed) {
          this.gestureSynth.triggerRelease()  // MonoSynth uses triggerRelease()
        }
      } catch (e) {
        // console.warn('⚠️ gestureSynth triggerRelease error:', e.message)
      }

      if (this.ambientLayers) {
        Object.keys(this.ambientLayers).forEach(layer => {
          try {
            if (this.ambientLayers[layer] && !this.ambientLayers[layer].disposed) {
              // Support both PolySynth (releaseAll) and MonoSynth (triggerRelease)
              if (this.ambientLayers[layer].releaseAll) {
                this.ambientLayers[layer].releaseAll()
              } else if (this.ambientLayers[layer].triggerRelease) {
                this.ambientLayers[layer].triggerRelease()
              }
            }
          } catch (e) {
            // console.warn(`⚠️ ${layer} release error:`, e.message)
          }
        })
      }

      // console.log('✅ All notes released')

      // Mark as uninitialized to force recreation of synths on next start()
      // This ensures old synths with scheduled events are properly disposed
      this.isInitialized = false

      // console.log('🔇 AudioService stopped - will recreate synths on next start')
    }
  }

  /**
   * Update filter parameters directly (for remote filter modulation)
   * FIX: Added this missing method for hover and remote filter modulation
   * @param {Object} filterParams - Filter parameters
   */
  updateFilterParams(filterParams) {
    if (!this.isInitialized) {
      // console.log('🔇 updateFilterParams blocked - audio not initialized')
      return
    }

    // THROTTLING: Prevent stuttering by limiting filter update frequency
    const now = Date.now()
    if (now - this.lastFilterUpdateTime < this.filterUpdateInterval) {
      // Skip this update to prevent audio stuttering
      return
    }
    this.lastFilterUpdateTime = now

    try {
      // Reduce console log frequency to prevent spam
      if (now - (this.lastFilterUpdateTime || 0) > 500) {
        // console.log('🎛️ Applying filter params:', filterParams)
      }

      // Ensure Tone.js context is started
      if (Tone.context.state !== 'running') {
        // console.log('🎛️ Starting Tone.js context for filter modulation')
        Tone.start()
        // Give it a moment to start
        setTimeout(() => this.applyFilterModulation(filterParams), 100)
        return
      }

      this.applyFilterModulation(filterParams)

    } catch (error) {
      // console.warn('🔇 Error updating filter params:', error)
    }
  }


  /**
   * SUSTAINED HOLD: Trigger sustained note attack (gate opens)
   * Uses triggerAttack without triggerRelease for open gate control
   *
   * SYNTH ROUTING LOGIC:
   * - userId = null  → Uses gestureSynth (customizable via SynthPanel, for local user)
   * - userId = <id>  → Uses userSynthManager per-user synth (for remote users, unique timbres)
   *
   * IMPORTANT: Local gestures MUST pass userId=null to receive SynthPanel customizations.
   * Remote gestures MUST pass userId to get per-user timbre isolation.
   *
   * @param {number} frequency - Note frequency in Hz
   * @param {number} velocity - Note velocity (0-1)
   * @param {Object} position - Canvas position {x, y}
   * @param {string|null} userId - User ID for routing: null=gestureSynth, string=userSynthManager
   * @param {boolean} isRemote - Whether this is a remote user's note (reduces volume)
   * @returns {Object|null} Note tracking data { noteId, frequency, startTime } or null if failed
   */
  triggerSustainedNoteAttack(frequency, velocity, position, userId = null, isRemote = false) {
    // Check audio context state - try to resume if suspended
    if (Tone.context.state !== 'running') {
      if (Tone.context.state === 'suspended') {
        Tone.context.resume()
      }
      return null
    }

    // Determine which synth to use based on userId
    let synth = this.gestureSynth
    // Entry #HarmonicCoherence: Quantize remote frequencies to current scale (defense in depth)
    let actualFrequency = isRemote ? this.quantizeToScale(frequency) : frequency
    let useUserSynth = false

    // If userId provided and UserSynthManager available, use per-user synth
    if (userId && this.userSynthManager) {
      const synthData = this.userSynthManager.getSynthForUser(userId)
      if (synthData && synthData.synth) {
        synth = synthData.synth
        useUserSynth = true
        // Apply tessitura constraint for this user
        actualFrequency = this.userSynthManager.constrainFrequencyToTessitura(frequency, userId)
      }
    }

    if (!synth || synth.disposed) {
      // console.warn('🚫 Synth not available for sustained note')
      return null
    }

    // Configure envelope for sustained hold (only for default gestureSynth)
    // Entry #SynthUIFix: Store original envelope to restore after release
    let originalEnvelope = null
    if (!useUserSynth && this.gestureSynth.envelope) {
      // Save user's SynthPanel envelope settings
      originalEnvelope = {
        attack: this.gestureSynth.envelope.attack,
        decay: this.gestureSynth.envelope.decay,
        sustain: this.gestureSynth.envelope.sustain,
        release: this.gestureSynth.envelope.release
      }
      // Override for sustained hold behavior
      this.gestureSynth.set({
        envelope: {
          attack: 0.005,      // 5ms - instant response
          decay: 0.01,        // 10ms - quick to sustain level
          sustain: 1.0,       // Full sustain - note held at max level
          release: 0.05       // 50ms - smooth release when gate closes (prevents clicks)
        }
      })
    }

    const noteId = `sustained-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const now = Tone.now()

    // Entry #SynthUIFix: MONOSYNTH TIMING FIX - Ensure strictly increasing start times
    // IMPORTANT: Use separate tracker for sustained holds (context time) vs playMusicalEvent (Transport time)
    const minGap = 0.005  // 5ms minimum gap between notes
    let safeTime = now

    if (useUserSynth) {
      // UserSynthManager synth - use synthData's lastTriggerTime
      const synthData = this.userSynthManager.userSynths.get(userId)
      if (synthData && synthData.lastTriggerTime !== undefined) {
        safeTime = Math.max(now, synthData.lastTriggerTime + minGap)
        synthData.lastTriggerTime = safeTime
      }
    } else {
      // gestureSynth - use dedicated sustained hold tracker (NOT gestureSynthLastTrigger which uses Transport time)
      if (!this._sustainedHoldLastTrigger) this._sustainedHoldLastTrigger = 0
      safeTime = Math.max(now, this._sustainedHoldLastTrigger + minGap)
      this._sustainedHoldLastTrigger = safeTime
    }

    // All users play at equal velocity - no remote reduction
    const actualVelocity = velocity

    // CRITICAL: Use triggerAttack (NOT triggerAttackRelease)
    // This opens the gate without closing it
    // Entry #SynthUIFix: Add try/catch with retry - MonoSynth internal state may conflict with Transport-scheduled notes
    try {
      synth.triggerAttack(actualFrequency, safeTime, actualVelocity)
    } catch (err) {
      // MonoSynth timing conflict - release and retry with fresh time
      try {
        synth.triggerRelease()
        const freshTime = Tone.now() + 0.01
        this._sustainedHoldLastTrigger = freshTime
        synth.triggerAttack(actualFrequency, freshTime, actualVelocity)
      } catch (retryErr) {
        // console.warn('Sustained note trigger failed after retry:', retryErr.message)
        return null
      }
    }

    // Track active sustained note for later release
    if (!this.activeSustainedNotes) {
      this.activeSustainedNotes = new Map()
    }

    // Voice priority tracking for sustained notes
    const voiceTrackingId = `sustained-${noteId}`
    const voicePriority = userId ? this.VOICE_PRIORITY.REMOTE_GESTURE : this.VOICE_PRIORITY.LOCAL_GESTURE
    this.trackVoice(voiceTrackingId, synth, 30, voicePriority)

    this.activeSustainedNotes.set(noteId, {
      noteId,
      frequency: actualFrequency,
      startTime: Date.now(),
      position,
      velocity: actualVelocity,
      synth: synth,
      userId: userId,
      useUserSynth: useUserSynth,
      originalEnvelope: originalEnvelope,  // Entry #SynthUIFix: Store for restoration on release
      voiceTrackingId  // For activeVoices cleanup on release
    })

    // console.log(`🎵 Sustained note ATTACK: ${actualFrequency.toFixed(1)}Hz, vel=${actualVelocity.toFixed(2)}, noteId=${noteId}, user=${userId || 'local'}`)

    return { noteId, frequency: actualFrequency, startTime: Date.now() }
  }

  /**
   * SUSTAINED HOLD: Release sustained note (gate closes)
   * @param {string} noteId - Note ID from triggerSustainedNoteAttack
   */
  triggerSustainedNoteRelease(noteId) {
    const noteData = this.activeSustainedNotes?.get(noteId)
    if (!noteData) {
      // console.warn(`⚠️ No active sustained note found for ${noteId}`)
      return
    }

    // Use the synth that was stored when the note was triggered
    const synth = noteData.synth
    if (!synth || synth.disposed) {
      // console.warn('🚫 Synth not available for note release')
      this.activeSustainedNotes.delete(noteId)
      return
    }

    // CRITICAL: Trigger release - MonoSynth.triggerRelease(time?) does NOT take frequency
    // MonoSynth is monophonic, only one note can play at a time
    const now = Tone.now()
    synth.triggerRelease(now)

    // Entry #SynthUIFix: Restore user's SynthPanel envelope after release completes
    if (noteData.originalEnvelope && synth === this.gestureSynth && !synth.disposed) {
      // Wait for release envelope to complete before restoring (50ms release + buffer)
      setTimeout(() => {
        if (this.gestureSynth && !this.gestureSynth.disposed) {
          try {
            this.gestureSynth.set({ envelope: noteData.originalEnvelope })
          } catch (e) {
            // Synth may have been disposed, ignore
          }
        }
      }, 100)
    }

    // Remove from voice tracking (always attempt, even if trackVoice() had failed)
    if (noteData.voiceTrackingId) {
      // OPTIMIZATION FIX: Remove from bucket to prevent stale entries
      const voiceData = this.generativeState?.activeVoices?.get(noteData.voiceTrackingId)
      if (voiceData && voiceData.priority !== undefined) {
        this._removeFromBucket(noteData.voiceTrackingId, voiceData.priority)
      }
      this.generativeState?.activeVoices?.delete(noteData.voiceTrackingId)
    }

    // Remove from tracking
    this.activeSustainedNotes.delete(noteId)

    const duration = Date.now() - noteData.startTime
    // console.log(`🎵 Sustained note RELEASE: ${noteData.frequency.toFixed(1)}Hz, held ${duration}ms, noteId=${noteId}, user=${noteData.userId || 'local'}`)
  }

  /**
   * Check and manage polyphony to prevent audio overload.
   * Priority-aware: steals lowest priority first, then oldest among ties.
   * Never steals LOCAL_GESTURE (priority 4) or isPolySynth voices.
   */
  /**
   * OPTIMIZATION FIX: Remove voice from priority bucket to prevent stale entries
   * Called whenever a voice is manually released or cleaned up
   * @param {string} voiceId - Voice identifier
   * @param {number} priority - Voice priority level (1-4)
   */
  _removeFromBucket(voiceId, priority) {
    // Only remove if it's in a bucket (local gestures with priority >= 4 aren't tracked)
    if (priority < this.VOICE_PRIORITY.LOCAL_GESTURE && this.voicesByPriority[priority]) {
      const bucket = this.voicesByPriority[priority]
      const index = bucket.findIndex(entry => entry.voiceId === voiceId)
      if (index !== -1) {
        bucket.splice(index, 1)
      }
    }
  }

  /**
   * OPTIMIZATION: Bucketed voice stealing (Phase 2)
   * Reduces O(n log n) sort to O(1) insertion + O(n) sort on small buckets only
   * CPU savings: 50-70% for voice management
   */
  managePolyphony() {
    if (!this.generativeState || !this.generativeState.activeVoices) return

    const totalActiveVoices = this.generativeState.activeVoices.size

    if (totalActiveVoices > this.maxTotalVoices) {
      const voicesToCleanup = totalActiveVoices - this.maxTotalVoices
      const now = Date.now()

      let cleaned = 0

      // OPTIMIZATION: Iterate through priority buckets (lowest to highest)
      // Only sort the small bucket we're stealing from
      for (const priority of [1, 2, 3]) {
        if (cleaned >= voicesToCleanup) break

        const bucket = this.voicesByPriority[priority]
        if (!bucket || bucket.length === 0) continue

        // Sort only this small bucket (typically 5-10 voices)
        bucket.sort((a, b) => a.startTime - b.startTime)

        // Steal oldest voices from this priority level
        for (let i = 0; i < bucket.length && cleaned < voicesToCleanup; i++) {
          const { voiceId } = bucket[i]
          const voiceData = this.generativeState.activeVoices.get(voiceId)

          if (!voiceData) {
            // Voice already cleaned up, remove from bucket
            bucket.splice(i, 1)
            i--
            continue
          }

          // Skip PolySynth voices (Tone.js manages internally)
          if (voiceData.isPolySynth) continue

          // Only steal voices older than 1 second
          if (now - voiceData.startTime > 1000) {
            if (voiceData.synth) {
              if (voiceData.synth.releaseAll) {
                voiceData.synth.releaseAll()
              } else if (voiceData.synth.triggerRelease) {
                voiceData.synth.triggerRelease()
              }
            }
            this.generativeState.activeVoices.delete(voiceId)
            bucket.splice(i, 1)  // Remove from bucket
            i--
            cleaned++
          }
        }
      }
    }
  }

  /**
   * Track a new voice for polyphony management
   * PERFORMANCE FIX: Check limits BEFORE adding voice to prevent race conditions
   * @param {string} voiceId - Unique voice identifier
   * @param {Object} synth - Synth instance
   * @param {number} duration - Note duration in seconds
   * @param {number} priority - Voice priority (1=counterpoint, 2=accompaniment, 3=remote, 4=local)
   * @param {boolean} isPolySynth - If true, excluded from external stealing (Tone.js manages internally)
   * @returns {boolean} True if voice was tracked, false if rejected
   */
  trackVoice(voiceId, synth, duration, priority = 1, isPolySynth = false) {
    if (!this.generativeState) return false

    const currentVoices = this.generativeState.activeVoices.size

    // FAST PATH: Pool not full, just add directly
    if (currentVoices < this.maxTotalVoices) {
      const startTime = Date.now()
      this.generativeState.activeVoices.set(voiceId, {
        synth, startTime, duration, priority, isPolySynth
      })
      // OPTIMIZATION: Add to priority bucket (skip LOCAL_GESTURE priority 4)
      if (priority < this.VOICE_PRIORITY.LOCAL_GESTURE && this.voicesByPriority[priority]) {
        this.voicesByPriority[priority].push({ voiceId, startTime })
      }
      return true
    }

    // SLOW PATH: Pool full, find a voice to steal
    const victim = this._getStealableVoice(priority)
    if (victim) {
      this._forceReleaseVoice(victim)
    } else {
      // No stealable voice found — reject
      return false
    }

    const startTime = Date.now()
    this.generativeState.activeVoices.set(voiceId, {
      synth, startTime, duration, priority, isPolySynth
    })
    // OPTIMIZATION: Add to priority bucket (skip LOCAL_GESTURE priority 4)
    if (priority < this.VOICE_PRIORITY.LOCAL_GESTURE && this.voicesByPriority[priority]) {
      this.voicesByPriority[priority].push({ voiceId, startTime })
    }
    return true
  }

  /**
   * Generate a unique voice ID
   * @param {string} prefix - Voice ID prefix
   * @returns {string} Unique voice ID
   */
  _generateVoiceId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
  }

  /**
   * AUDIO PRIORITY: Schedule voice cleanup during browser idle time
   * Uses requestIdleCallback to avoid competing with audio scheduling on main thread
   * Hybrid approach: immediate cleanup if voice count exceeds threshold
   * @private
   */
  _scheduleVoiceCleanup() {
    if (!this.isInitialized) {
      this._voiceCleanupActive = false
      return
    }

    const doCleanup = () => {
      this._cleanupExpiredVoices()
      if (this.isInitialized) {
        this._scheduleVoiceCleanup()
      } else {
        this._voiceCleanupActive = false
      }
    }

    // Immediate cleanup if voice count is high (prevent memory leak)
    const voiceCount = this.generativeState?.activeVoices?.size || 0
    if (voiceCount > 50) {
      doCleanup()
      return
    }

    // Defer to idle time with fallback
    const rIC = window.requestIdleCallback ||
      ((cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 16))
    rIC(doCleanup, { timeout: 1000 })
  }

  /**
   * Cleanup expired voice entries
   */
  _cleanupExpiredVoices() {
    if (!this.generativeState?.activeVoices) return
    const now = Date.now()
    for (const [voiceId, v] of this.generativeState.activeVoices) {
      if (now - v.startTime > v.duration * 1000 + 250) {
        // OPTIMIZATION FIX: Remove from bucket to prevent stale entries
        if (v.priority !== undefined) {
          this._removeFromBucket(voiceId, v.priority)
        }
        this.generativeState.activeVoices.delete(voiceId)
      }
    }
  }

  /**
   * Get the best voice to steal using priority-based selection with anti-deadlock fallback.
   * 4-level strategy:
   *   1. Steal lowest-priority voice (below incoming), oldest among ties
   *   2. Steal same-priority voice (oldest first) — prevents deadlock
   *   3. Emergency: steal oldest non-local, non-PolySynth voice
   *   4. Last resort: steal oldest PolySynth voice (but never LOCAL_GESTURE)
   * NEVER steals LOCAL_GESTURE (priority 4).
   * @param {number} incomingPriority - Priority of the voice requesting a slot
   * @returns {string|null} Voice ID to steal, or null if none stealable
   */
  _getStealableVoice(incomingPriority) {
    if (!this.generativeState?.activeVoices?.size) return null

    let lowerBestId = null
    let lowerBestPriority = Infinity
    let lowerBestTime = Infinity

    let sameBestId = null
    let sameBestTime = Infinity

    let emergencyBestId = null
    let emergencyBestTime = Infinity

    let lastResortBestId = null
    let lastResortBestTime = Infinity

    for (const [voiceId, voice] of this.generativeState.activeVoices) {
      const vp = voice.priority || 1

      // Never steal local gestures
      if (vp >= this.VOICE_PRIORITY.LOCAL_GESTURE) continue

      // Level 4 (last resort): any non-local voice including PolySynth
      if (voice.startTime < lastResortBestTime) {
        lastResortBestId = voiceId
        lastResortBestTime = voice.startTime
      }

      // Levels 1-3 exclude PolySynth
      if (voice.isPolySynth) continue

      // Level 1: lower priority than incoming
      if (vp < incomingPriority) {
        if (vp < lowerBestPriority || (vp === lowerBestPriority && voice.startTime < lowerBestTime)) {
          lowerBestId = voiceId
          lowerBestPriority = vp
          lowerBestTime = voice.startTime
        }
      }

      // Level 2: same priority as incoming (oldest first)
      if (vp === incomingPriority && voice.startTime < sameBestTime) {
        sameBestId = voiceId
        sameBestTime = voice.startTime
      }

      // Level 3: emergency — any non-local, non-PolySynth voice (oldest)
      if (voice.startTime < emergencyBestTime) {
        emergencyBestId = voiceId
        emergencyBestTime = voice.startTime
      }
    }

    return lowerBestId || sameBestId || emergencyBestId || lastResortBestId
  }

  /**
   * Force immediate release of a voice (for polyphony management)
   * @param {string} voiceId - Voice ID to release
   */
  _forceReleaseVoice(voiceId) {
    const voice = this.generativeState?.activeVoices.get(voiceId)
    if (!voice) return

    try {
      if (voice.synth) {
        if (voice.synth.releaseAll) {
          voice.synth.releaseAll(Tone.now())
        } else if (voice.synth.triggerRelease) {
          voice.synth.triggerRelease(Tone.now())
        }
      }
    } catch (e) {
      // Ignore errors during force release
    }

    // OPTIMIZATION FIX: Remove from bucket to prevent stale entries
    if (voice.priority !== undefined) {
      this._removeFromBucket(voiceId, voice.priority)
    }

    this.generativeState.activeVoices.delete(voiceId)
  }

  /**
   * Update sound patterns from collaborative data
   * Plays audio feedback for remote users' gestures (FR-003)
   * EVOLUTIVE: Also influences generative composition and adds filter modulation
   * FIX: Added remote filter modulation and note hanging prevention
   * @param {Array} patterns - Sound patterns from other users
   */
  updatePatterns(patterns) {
    if (!this.isInitialized || this.muted) {
      // console.log('🔇 updatePatterns blocked - initialized:', this.isInitialized, 'muted:', this.muted)
      return
    }

    // Rate limiting: prevent spamming collaborative patterns
    const now = Date.now()
    if (this.lastCollaborativePatternTime && (now - this.lastCollaborativePatternTime < 500)) {
      // console.log('🔇 Collaborative patterns rate limited')
      return
    }
    this.lastCollaborativePatternTime = now

    // Store patterns for later processing
    this.collaborativePatterns = patterns || []
    // console.log('🎵 Updated collaborative patterns:', patterns?.length || 0)

    // EVOLUTIVE: Update generative state based on user activity
    if (this.generativeState && patterns && patterns.length > 0) {
      // Update user activity timestamp
      this.generativeState.lastUserActivity = now

      // Increase user influence based on pattern intensity
      const avgIntensity = patterns.reduce((sum, p) => sum + (p.intensity || p.y || 0.5), 0) / patterns.length
      this.generativeState.userInfluence = Math.min(1.0, this.generativeState.userInfluence + avgIntensity * 0.2)

      // Influence harmonic progression based on pattern positions
      const avgX = patterns.reduce((sum, p) => sum + (p.x || 0.5), 0) / patterns.length
      if (avgX > 0.7) {
        // Right side activity: advance harmony
        this.generativeState.harmonicProgression = (this.generativeState.harmonicProgression + 1) % this.generativeState.currentScale.length
      } else if (avgX < 0.3) {
        // Left side activity: add chromatic tension
        if (this.generativeState.complexity < 0.7) {
          this.generativeState.complexity += 0.1
        }
      }

      // console.log(`🎵 User influence updated: ${this.generativeState.userInfluence.toFixed(2)}, complexity: ${this.generativeState.complexity.toFixed(2)}`)
    }

    // Check if patterns are the same as last time to avoid repetition
    if (this.lastCollaborativePatterns && this.arePatternsEqual(this.lastCollaborativePatterns, patterns)) {
      // console.log('🔇 Skipping duplicate collaborative patterns')
      return
    }
    this.lastCollaborativePatterns = [...(patterns || [])]

    // Play audio feedback for each pattern from remote users (FR-003, FR-006)
    // FIX: Added note hanging prevention and safe note management
    if (patterns && patterns.length > 0 && this.gestureSynth) {
      // Initialize notes tracking if not exists
      if (!this.activeNotes) {
        this.activeNotes = new Map()
      }

      patterns.forEach((pattern, index) => {
        // Stagger sounds slightly to avoid clipping (20ms per pattern)
        const delay = index * 0.02
        const noteId = `remote_${Date.now()}_${index}`

        try {
          // Use pattern frequency if available, otherwise derive from position with added variation
          let frequency = pattern.frequency
          if (!frequency) {
            if (pattern.x) {
              frequency = 200 + (pattern.x * 600) // 200-800Hz range
            } else {
              // Add variation to prevent same note spam
              frequency = 300 + Math.random() * 400 // 300-700Hz range with randomness
            }
          }

          // Use pattern intensity as velocity parameter with variation
          let intensity = pattern.intensity || pattern.y || 0.5
          if (!pattern.intensity && !pattern.y) {
            // Add some randomness if no intensity provided
            intensity = 0.3 + Math.random() * 0.4 // 0.3-0.7 range
          }
          // FIXED: Increased from 0.1-0.4 to 0.5-0.9 for audible remote patterns
          const velocity = 0.5 + (intensity * 0.4) // 0.5-0.9 range for audible collaborative audio

          // FIX: Use very short duration to prevent hanging
          const duration = 0.1 // 100ms maximum for remote notes

          // console.log(`🎵 Playing collaborative pattern ${index}: ${frequency.toFixed(1)}Hz, duration: ${duration}s, intensity: ${intensity.toFixed(2)}`)

          // Play short note with guaranteed release (FR-006: <200ms latency)
          // Use safe trigger for MonoSynth timing compliance
          this.safeGestureSynthTrigger(frequency, duration, `+${delay}`, velocity)

          // Track the note for cleanup
          this.activeNotes.set(noteId, {
            frequency,
            startTime: Tone.context.currentTime + delay,
            synth: this.gestureSynth
          })

          // Schedule automatic cleanup to prevent hanging
          setTimeout(() => {
            if (this.activeNotes.has(noteId)) {
              try {
                this.gestureSynth.triggerRelease(frequency)
                this.activeNotes.delete(noteId)
                // console.log(`🔇 Auto-released remote note: ${frequency.toFixed(1)}Hz`)
              } catch (e) {
                // Ignore release errors
                this.activeNotes.delete(noteId)
              }
            }
          }, (delay + duration) * 1000 + 500) // Add 500ms buffer

        } catch (error) {
          // console.warn('🔇 Error playing collaborative pattern:', error)
        }
      })

      // Cleanup old notes periodically
      this.cleanupHangingNotes()
    }
  }

  /**
   * Entry #206: Clean up stale scheduled events to prevent memory buildup
   * Tone.js automatically removes executed events from Transport, but our tracking
   * array still holds the stale eventIds. This method clears them periodically.
   *
   * Strategy: Keep last 100 events max. Events in Tone.js Transport that have
   * already fired are automatically removed, so clearing stale IDs is safe.
   * @private
   */
  _cleanupStaleEvents() {
    if (!this.scheduledTransportEvents) {
      this.scheduledTransportEvents = []
      return
    }

    // If array is small, no cleanup needed
    if (this.scheduledTransportEvents.length <= 100) {
      return
    }

    // Keep only the most recent 100 events (older ones have likely already fired)
    // Drone events are preserved separately via droneRepeatEventIds
    const droneEventIds = new Set(this.droneRepeatEventIds || [])
    const recentEvents = this.scheduledTransportEvents.slice(-100)

    // Clear old events from Transport (they may already be gone, that's OK)
    const oldEvents = this.scheduledTransportEvents.slice(0, -100)
    oldEvents.forEach(eventId => {
      if (!droneEventIds.has(eventId)) {
        try {
          Tone.Transport.clear(eventId)
        } catch (e) {
          // Event already cleared or executed - this is expected
        }
      }
    })

    this.scheduledTransportEvents = recentEvents
    // console.log(`🧹 Cleaned up ${oldEvents.length} stale events, kept ${recentEvents.length}`)
  }

  /**
   * Entry #192: Clear pending composition notes before playing new composition
   * Prevents overlap/stutter when compositions arrive faster than they play
   */
  clearPendingCompositionNotes() {
    if (!this.scheduledTransportEvents || this.scheduledTransportEvents.length === 0) {
      return
    }

    // Create defensive copy to avoid concurrent modification issues
    // (Web Audio callbacks could add events during iteration)
    const currentEvents = [...this.scheduledTransportEvents]
    const droneEventIds = new Set(this.droneRepeatEventIds || [])
    const eventsToKeep = []

    currentEvents.forEach(eventId => {
      if (droneEventIds.has(eventId)) {
        eventsToKeep.push(eventId)
      } else {
        try {
          Tone.Transport.clear(eventId)
        } catch (e) {
          // Event may already be cleared
        }
      }
    })

    this.scheduledTransportEvents = eventsToKeep
  }

  /**
   * Play background composition generated by CompositionEngine
   * Handles polyphonic, homophonic, and ambient compositions
   * Entry #175: Added style parameter for genre-aware audio playback
   * @param {Object} composition - Composition from BackgroundCompositionService
   * @param {boolean} isDrone - Whether this is a drone composition
   * @param {Object} style - Style info with genreWeights, dominantGenre, energy
   */
  playComposition(composition, isDrone = false, style = {}) {
    // STATE MACHINE: Don't play if audio is stopped
    if (this._audioState === 'STOPPED') {
      return
    }

    if (!this.isInitialized || this.muted) {
      return
    }

    if (!composition || !composition.content) {
      return
    }

    // Drones play immediately (they're ambient background)
    if (isDrone) {
      this._playCompositionNow(composition, isDrone, style)
      return
    }

    // Entry #197: Queue-based sequential playback
    // Instead of playing immediately, queue compositions and play them in sequence
    // This prevents gaps and ensures beat-quantized transitions

    // Entry #198: Limit queue size to prevent unbounded growth
    if (this._compositionQueue.length >= this.MAX_COMPOSITION_QUEUE_SIZE) {
      // Drop oldest composition (FIFO eviction)
      this._compositionQueue.shift()
    }

    // Add to queue with metadata
    this._compositionQueue.push({ composition, style, addedAt: Tone.Transport.seconds })

    // If nothing is currently playing, start playback
    if (!this._isPlayingComposition) {
      this._playNextFromQueue()
    }
  }

  /**
   * Entry #197: Play the next composition from queue
   * Entry #198: Added state validation, Tone.Transport scheduling, time signature support
   * @private
   */
  _playNextFromQueue() {
    // Entry #198: State validation to prevent race condition
    if (this._audioState === 'STOPPED' || this._audioState === 'IDLE') {
      this._isPlayingComposition = false
      this._compositionQueue = []
      return
    }

    if (!this._compositionQueue || this._compositionQueue.length === 0) {
      this._isPlayingComposition = false
      return
    }

    this._isPlayingComposition = true
    const { composition, style } = this._compositionQueue.shift()

    // Calculate composition duration in seconds
    const tempo = composition.metadata?.tempo || 120

    // Entry #202: Prefer metadata.durationBeats for exact alignment with backend note distribution
    // Falls back to calculated value for backwards compatibility
    let totalBeats
    if (composition.metadata?.durationBeats) {
      totalBeats = composition.metadata.durationBeats
    } else {
      const durationBars = composition.content?.duration || 4  // Entry #205: bars, typically 4
      const timeSignature = composition.metadata?.timeSignature || '4/4'
      const beatsPerBar = parseInt(timeSignature.split('/')[0], 10) || 4
      totalBeats = durationBars * beatsPerBar
    }

    const durationSeconds = (totalBeats * 60) / tempo

    // Play the composition now
    this._playCompositionNow(composition, false, style)

    // Entry #198: Use Tone.Transport.scheduleOnce for precise audio-clock timing
    // This prevents drift when tab is backgrounded
    const endTime = Tone.Transport.seconds + durationSeconds

    // Clear previous scheduled event if any
    if (this._nextCompositionEventId !== null) {
      try {
        Tone.Transport.clear(this._nextCompositionEventId)
      } catch (e) {
        // Event may already be cleared
      }
    }

    this._nextCompositionEventId = Tone.Transport.scheduleOnce(() => {
      this._playNextFromQueue()
    }, endTime)

    // Track for cleanup
    this.scheduledTransportEvents.push(this._nextCompositionEventId)
  }

  /**
   * Entry #197: Actually play a composition (internal method)
   * @private
   */
  _playCompositionNow(composition, isDrone, style) {
    // Entry #206: Clear old scheduled events to prevent memory buildup
    // Events from previous compositions that have already executed are stale
    // but remain in the array. This cleanup removes them before adding new ones.
    this._cleanupStaleEvents()

    // Entry #175: Store style for use in playback methods
    this.currentStyle = style
    this.applyGenreToSynths(style)

    // Entry #213: Sync harmonic context with composition being played
    // This ensures user notes are quantized to the same key/mode as the current composition
    const keyCenter = composition.metadata?.keyCenter
    const mode = composition.metadata?.mode
    if (keyCenter && mode) {
      this.currentKey = keyCenter
      this.currentMode = mode
      this.currentScaleIntervals = this.modeIntervals[mode] || this.modeIntervals.ionian
    }

    // If this is NOT a drone and we have a drone loop running, stop it
    if (!isDrone && this.droneLoopInterval) {
      clearInterval(this.droneLoopInterval)
      this.droneLoopInterval = null
    }

    const content = composition.content
    const type = composition.type
    const tempo = composition.metadata?.tempo || 120

    try {
      if (type === 'polyphonic' && content.voices) {
        this.playPolyphonicComposition(content, tempo)
      } else if (type === 'homophonic' && content.melody) {
        this.playHomophonicComposition(content, tempo)
      } else if (type === 'ambient' && content.texture) {
        this.playAmbientComposition(content, tempo, isDrone)
      }
    } catch (error) {
      // Silent fail - continue to next composition
    }
  }

  /**
   * Entry #175: Get velocity configuration based on dominant genre
   * Different genres have distinct dynamic profiles
   * @param {Object} style - Style info with dominantGenre
   * @returns {Object} Velocity config for each voice role
   */
  getVelocityConfig(style) {
    const genre = style?.dominantGenre || 'ambient'
    // Entry #188d: Background must be quieter than gestures (local/remote/virtual)
    const configs = {
      ambient:     { melody: 0.15, harmony: 0.12, bass: 0.14, pad: 0.08 },
      jazz:        { melody: 0.18, harmony: 0.14, bass: 0.16, pad: 0.09 },
      electronic:  { melody: 0.18, harmony: 0.15, bass: 0.17, pad: 0.10 },
      rock:        { melody: 0.20, harmony: 0.16, bass: 0.18, pad: 0.11 },
      classical:   { melody: 0.16, harmony: 0.13, bass: 0.14, pad: 0.08 }
    }
    return configs[genre] || configs.ambient
  }

  /**
   * Entry #175: Apply genre-specific envelope settings to synths
   * Entry #181: Extended to apply delay feedback, delay time, and reverb from synthParams
   * Different genres have distinct attack/release characteristics
   * @param {Object} style - Style info with dominantGenre and synthParams
   */
  applyGenreToSynths(style) {
    if (!this.ambientLayers || !style?.dominantGenre) return

    // Skip if genre hasn't changed (unless synthParams are provided)
    const hasNewSynthParams = style.synthParams && this._lastSynthParams !== style.synthParams
    if (this._lastAppliedGenre === style.dominantGenre && !hasNewSynthParams) return
    this._lastAppliedGenre = style.dominantGenre
    this._lastSynthParams = style.synthParams

    // Entry #181: Use backend synthParams if available, else fallback to hardcoded configs
    const synthParams = style.synthParams
    let cfg
    if (synthParams) {
      cfg = {
        attack: synthParams.attackTime ?? 0.03,
        decay: 0.3,
        sustain: 0.6,
        release: synthParams.releaseTime ?? 0.4
      }
    } else {
      // Legacy fallback configs
      const configs = {
        ambient:    { attack: 0.5,  decay: 0.8, sustain: 0.7, release: 2.0 },
        jazz:       { attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.3 },
        electronic: { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.2 },
        rock:       { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.4 },
        classical:  { attack: 0.1,  decay: 0.4, sustain: 0.6, release: 0.8 }
      }
      cfg = configs[style.dominantGenre] || configs.ambient
    }

    // Apply envelope to melodic layers (backgroundHigh, backgroundMid, backgroundLow)
    const melodicLayers = ['backgroundHigh', 'backgroundMid', 'backgroundLow']
    for (const layerName of melodicLayers) {
      const layer = this.ambientLayers[layerName]
      if (layer && layer.set) {
        try {
          layer.set({
            envelope: {
              attack: cfg.attack,
              decay: cfg.decay,
              sustain: cfg.sustain,
              release: cfg.release
            }
          })
        } catch (e) {
          // Synth may be disposed, ignore
        }
      }
    }

    // Entry #181: Apply delay feedback and delay time from synthParams
    // Entry #181b: Add proper initialization checks to prevent race conditions
    if (synthParams && this.delay && !this.delay.disposed) {
      try {
        if (synthParams.delayFeedback !== undefined && this.delay.feedback) {
          // Smooth ramp to new feedback value
          this.delay.feedback.rampTo(synthParams.delayFeedback, 0.5)
        }
        if (synthParams.delayTime !== undefined && this.delay.delayTime) {
          // Smooth ramp to new delay time
          this.delay.delayTime.rampTo(synthParams.delayTime, 0.5)
        }
      } catch (e) {
        // Delay may not be ready, ignore
      }
    }

    // Entry #181: Adjust reverb send levels based on reverbSend parameter
    // (Reverb decay is handled separately in Entry #191 below with throttling)
    if (synthParams && this.reverbSends) {
      const reverbLevel = synthParams.reverbSend ?? 0.3
      try {
        // Adjust all reverb sends proportionally
        for (const [layerName, sendGain] of Object.entries(this.reverbSends)) {
          if (sendGain && sendGain.gain) {
            // Scale the base send level by the genre's reverb preference
            const baseLevel = layerName === 'pad' ? 0.3 : layerName === 'bass' ? 0.15 : 0.25
            sendGain.gain.rampTo(baseLevel * (reverbLevel / 0.3), 0.5)
          }
        }
      } catch (e) {
        // Sends may not be ready, ignore
      }
    }

    // Entry #181: Adjust delay send levels based on delaySend parameter
    if (synthParams && this.delaySends) {
      const delayLevel = synthParams.delaySend ?? 0.25
      try {
        for (const [layerName, sendGain] of Object.entries(this.delaySends)) {
          if (sendGain && sendGain.gain) {
            // Scale the base send level by the genre's delay preference
            const baseLevel = layerName === 'chords' ? 0.35 : layerName === 'bass' ? 0.15 : 0.2
            sendGain.gain.rampTo(baseLevel * (delayLevel / 0.25), 0.5)
          }
        }
      } catch (e) {
        // Sends may not be ready, ignore
      }
    }

    // Entry #191: Apply reverb decay from synthParams (regenerates impulse response)
    // This is throttled to prevent excessive CPU usage from impulse response regeneration
    if (synthParams && synthParams.reverbDecay !== undefined && this.reverb && !this.reverb.disposed) {
      try {
        const currentDecay = this.reverb.decay
        const targetDecay = synthParams.reverbDecay
        // Only update if decay changed significantly (>0.5s difference) and throttle permits
        if (Math.abs(currentDecay - targetDecay) > 0.5) {
          const now = Date.now()
          if (now - this._lastReverbDecayChange > this._reverbDecayThrottleMs) {
            this.reverb.decay = targetDecay
            this._lastReverbDecayChange = now
            // console.log(`🎛️ Reverb decay updated: ${currentDecay.toFixed(1)}s → ${targetDecay.toFixed(1)}s (${style.dominantGenre})`)
          }
        }
      } catch (e) {
        // Reverb may not be ready or disposed, ignore
      }
    }

    // console.log(`🎨 Applied ${style.dominantGenre} envelope: attack=${cfg.attack}, release=${cfg.release}`)
    // Entry #181: Log delay/reverb params if present
    // if (synthParams) {
    //   console.log(`🎛️ Applied ${style.dominantGenre} effects: delayFB=${synthParams.delayFeedback}, delayTime=${synthParams.delayTime}, reverbSend=${synthParams.reverbSend}`)
    // }
  }

  /**
   * Entry #188: Placeholder for gesture-based density modulation (diradamento)
   * User clarification: "diradamento" means reducing NUMBER of voices/notes, not volume
   * TODO: Implement voice-thinning in backend CompositionEngine based on active hold count
   * For now this is a no-op - the monitoring infrastructure exists but doesn't modify audio
   * @param {number} activeHoldsCount - Number of active prolonged gestures (unused for now)
   */
  applyGestureDensityModulation(_activeHoldsCount) {
    // Entry #188: No-op - volume-based modulation removed per user feedback
    // Future: Pass _activeHoldsCount to backend for voice count reduction in compositions
  }

  /**
   * Play polyphonic composition (multiple voices)
   * REAL-TIME FIX: Uses Tone.Transport.schedule instead of setTimeout for rock-solid timing
   * Entry #175: Uses genre-aware velocities
   * @param {Object} content - Composition content with voices
   * @param {number} tempo - Tempo in BPM (30-300)
   */
  playPolyphonicComposition(content, tempo = 120) {
    if (!content.voices || !Array.isArray(content.voices)) return

    // Calculate beat duration from tempo: beatDuration = 60 / BPM
    const beatDuration = 60 / tempo

    // Entry #201: Use Transport.seconds (not Tone.now()) for Transport.schedule()
    // Tone.now() is AudioContext time, Transport.schedule expects Transport timeline
    const now = Tone.Transport.seconds
    const lookahead = 0.1 // 100ms lookahead for stable scheduling

    // Ensure Transport is running for scheduled events
    if (Tone.Transport.state !== 'started') {
      Tone.Transport.start()
    }

    // Entry #175: Get genre-aware velocity configuration
    const velocityConfig = this.getVelocityConfig(this.currentStyle)
    const roleConfigs = {
      'melody': { layer: 'backgroundHigh', velocity: velocityConfig.melody },
      'harmony': { layer: 'backgroundMid', velocity: velocityConfig.harmony },
      'bass': { layer: 'backgroundLow', velocity: velocityConfig.bass },
      'pad': { layer: 'backgroundLow', velocity: velocityConfig.pad }
    }
    const defaultConfig = { layer: 'backgroundMid', velocity: velocityConfig.harmony }

    // Entry #175: Jazz swing flag
    const isJazz = this.currentStyle?.dominantGenre === 'jazz'

    // REAL-TIME FIX: Use for loops instead of forEach to avoid closure allocation
    const voices = content.voices
    for (let voiceIndex = 0; voiceIndex < voices.length; voiceIndex++) {
      const voice = voices[voiceIndex]
      if (!voice.notes || !Array.isArray(voice.notes)) continue

      const voiceRole = voice.voiceRole || 'harmony'
      const roleConfig = roleConfigs[voiceRole] || defaultConfig
      const layerName = roleConfig.layer
      const velocity = roleConfig.velocity

      const notes = voice.notes
      for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
        const note = notes[noteIndex]
        const pitch = note.pitch || 60
        const frequency = this.midiToFrequency(pitch)
        const duration = note.duration || 0.5

        // Entry #175: Calculate delay with optional jazz swing
        let delay = (note.startBeat || 0) * beatDuration
        if (isJazz) {
          // Swing: delay off-beat notes (between 0.4 and 0.6 of the beat) by 12%
          const beatFraction = (note.startBeat || 0) % 1
          if (beatFraction > 0.4 && beatFraction < 0.6) {
            delay += beatDuration * 0.12
          }
        }
        const scheduleTime = now + lookahead + delay

        // REAL-TIME FIX: Schedule on audio thread via Transport
        // This runs on the Web Audio thread, immune to main thread congestion
        const eventId = Tone.Transport.schedule((audioTime) => {
          // Use safe trigger for MonoSynth timing compliance
          this.safeMonoSynthTrigger(layerName, frequency, duration, audioTime, velocity)
        }, scheduleTime)

        // Track for cleanup
        this.scheduledTransportEvents.push(eventId)
      }
    }

    // Entry #206: Play accompaniment layers if present
    if (content.accompaniment) {
      this.playPolyphonicAccompaniment(content.accompaniment, tempo, now, beatDuration)
    }
  }

  /**
   * Entry #206: Play accompaniment for polyphonic compositions
   * Handles bass_accomp, pad, and keys layers
   * @param {Object} accompaniment - Accompaniment object with layers
   * @param {number} tempo - Tempo in BPM
   * @param {number} now - Current transport time
   * @param {number} beatDuration - Duration of one beat in seconds
   */
  playPolyphonicAccompaniment(accompaniment, tempo, now, beatDuration) {
    // Entry #206 FIX: Validate inputs to prevent silent failures
    if (!accompaniment || typeof accompaniment !== 'object') {
      return
    }
    if (!isFinite(tempo) || tempo <= 0 || !isFinite(now) || !isFinite(beatDuration)) {
      return
    }

    const lookahead = 0.1
    // Entry #208: Reduce all accompaniment velocities to prevent clipping
    // when playing alongside counterpoint voices
    // Entry #212: Increased from 0.35 to 0.55 to restore accompaniment presence
    const accompVelocityScale = 0.55

    // Play bass accompaniment on bass synth (MonoSynth - requires strictly increasing times)
    // Entry #209: Sort notes and ensure minimum gap to prevent "Start time must be strictly greater" error
    if (accompaniment.bass_accomp?.notes) {
      const notes = [...accompaniment.bass_accomp.notes].sort((a, b) => (a.startBeat || 0) - (b.startBeat || 0))
      const minGap = 0.01  // 10ms minimum gap between bass notes
      let lastBassTime = 0

      for (let i = 0; i < notes.length; i++) {
        const note = notes[i]
        const pitch = note.pitch || 36
        const frequency = this.midiToFrequency(pitch)
        const duration = (note.duration || 0.5) * beatDuration
        const velocity = (note.velocity || 0.6) * accompVelocityScale
        const delay = (note.startBeat || 0) * beatDuration

        // Ensure strictly increasing schedule times for MonoSynth
        const rawScheduleTime = now + lookahead + delay
        const scheduleTime = Math.max(rawScheduleTime, lastBassTime + minGap)
        lastBassTime = scheduleTime

        const eventId = Tone.Transport.schedule((audioTime) => {
          // Use bass synth from ambientLayers via safe trigger (MonoSynth timing)
          this.safeMonoSynthTrigger('bass', frequency, duration, audioTime, velocity)
        }, scheduleTime)
        this.scheduledTransportEvents.push(eventId)
      }
    }

    // Play pad accompaniment on pad synth (PolySynth)
    if (accompaniment.pad?.notes) {
      const notes = accompaniment.pad.notes
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i]
        const pitch = note.pitch || 60
        const frequency = this.midiToFrequency(pitch)
        const duration = (note.duration || 2.0) * beatDuration
        const velocity = (note.velocity || 0.4) * accompVelocityScale
        const delay = (note.startBeat || 0) * beatDuration
        const scheduleTime = now + lookahead + delay

        const padDur = duration
        const eventId = Tone.Transport.schedule((audioTime) => {
          // Use pad synth from ambientLayers (PolySynth)
          if (this.ambientLayers && this.ambientLayers.pad && !this.ambientLayers.pad.disposed) {
            try {
              this.ambientLayers.pad.triggerAttackRelease(frequency, padDur, audioTime, velocity)
              // Track PolySynth voice (excluded from external stealing)
              this.trackVoice(this._generateVoiceId('pad'), this.ambientLayers.pad, padDur, this.VOICE_PRIORITY.ACCOMPANIMENT, true)
            } catch (e) { /* ignore */ }
          }
        }, scheduleTime)
        this.scheduledTransportEvents.push(eventId)
      }
    }

    // Play keys accompaniment on chords synth (FM)
    if (accompaniment.keys?.notes) {
      const notes = accompaniment.keys.notes
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i]
        const pitch = note.pitch || 60
        const frequency = this.midiToFrequency(pitch)
        const duration = (note.duration || 0.5) * beatDuration
        const velocity = (note.velocity || 0.5) * accompVelocityScale
        const delay = (note.startBeat || 0) * beatDuration
        const scheduleTime = now + lookahead + delay

        const keysDur = duration
        const eventId = Tone.Transport.schedule((audioTime) => {
          // Use chords synth from ambientLayers (FM synth)
          if (this.ambientLayers && this.ambientLayers.chords && !this.ambientLayers.chords.disposed) {
            try {
              this.ambientLayers.chords.triggerAttackRelease(frequency, keysDur, audioTime, velocity)
              // Track PolySynth voice (excluded from external stealing)
              this.trackVoice(this._generateVoiceId('chords'), this.ambientLayers.chords, keysDur, this.VOICE_PRIORITY.ACCOMPANIMENT, true)
            } catch (e) { /* ignore */ }
          }
        }, scheduleTime)
        this.scheduledTransportEvents.push(eventId)
      }
    }
  }

  /**
   * Play homophonic composition (melody + accompaniment)
   * REAL-TIME FIX: Uses Tone.Transport.schedule instead of setTimeout
   * @param {Object} content - Composition content
   * @param {number} tempo - Tempo in BPM
   */
  playHomophonicComposition(content, tempo = 120) {
    const beatDuration = 60 / tempo
    // Entry #201: Use Transport.seconds for Transport.schedule()
    const now = Tone.Transport.seconds
    const lookahead = 0.1

    // Entry #175: Get genre-aware velocity configuration
    const velocityConfig = this.getVelocityConfig(this.currentStyle)
    const isJazz = this.currentStyle?.dominantGenre === 'jazz'

    // Ensure Transport is running
    if (Tone.Transport.state !== 'started') {
      Tone.Transport.start()
    }

    if (content.melody && content.melody.notes) {
      const notes = content.melody.notes
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i]
        const pitch = note.pitch || 60
        const frequency = this.midiToFrequency(pitch)
        const duration = note.duration || 0.5
        const velocity = velocityConfig.melody

        // Entry #175: Calculate delay with optional jazz swing
        let delay = (note.startBeat || i * 0.5) * beatDuration
        if (isJazz) {
          const beatFraction = (note.startBeat || i * 0.5) % 1
          if (beatFraction > 0.4 && beatFraction < 0.6) {
            delay += beatDuration * 0.12
          }
        }
        const scheduleTime = now + lookahead + delay

        const eventId = Tone.Transport.schedule((audioTime) => {
          // Use safe trigger for MonoSynth timing compliance
          this.safeMonoSynthTrigger('backgroundHigh', frequency, duration, audioTime, velocity)
        }, scheduleTime)
        this.scheduledTransportEvents.push(eventId)
      }
    }

    if (content.accompaniment) {
      // Entry #223: Check if accompaniment uses new format (bass_accomp, pad, keys)
      // or legacy format (type: 'arpeggio', 'chord_pads', etc.)
      if (content.accompaniment.bass_accomp || content.accompaniment.pad || content.accompaniment.keys) {
        // New format from AccompanimentEngine - use polyphonic player
        this.playPolyphonicAccompaniment(content.accompaniment, tempo, now, beatDuration)
      } else {
        // Legacy format - use old player for backward compatibility
        this.playAccompaniment(content.accompaniment, tempo)
      }
    }
  }

  /**
   * Play accompaniment (arpeggios, chord pads)
   * REAL-TIME FIX: Uses Tone.Transport.schedule instead of setTimeout
   * @param {Object} accompaniment - Accompaniment data
   * @param {number} tempo - Tempo in BPM
   */
  playAccompaniment(accompaniment, tempo = 120) {
    const beatDuration = 60 / tempo
    const type = accompaniment.type
    // Entry #201: Use Transport.seconds for Transport.schedule()
    const now = Tone.Transport.seconds
    const lookahead = 0.1

    // Entry #175: Get genre-aware velocity configuration
    const velocityConfig = this.getVelocityConfig(this.currentStyle)
    const isJazz = this.currentStyle?.dominantGenre === 'jazz'

    // Ensure Transport is running
    if (Tone.Transport.state !== 'started') {
      Tone.Transport.start()
    }

    if (type === 'arpeggio' && accompaniment.pattern) {
      const pattern = accompaniment.pattern
      for (let chordIndex = 0; chordIndex < pattern.length; chordIndex++) {
        const chord = pattern[chordIndex]
        if (!chord.notes || !Array.isArray(chord.notes)) continue

        const chordNotes = chord.notes
        for (let noteIndex = 0; noteIndex < chordNotes.length; noteIndex++) {
          const pitch = chordNotes[noteIndex]
          const frequency = this.midiToFrequency(pitch)
          const duration = chord.rhythm || 0.25

          // Entry #175: Calculate delay with optional jazz swing
          let delay = (chordIndex * 2 + noteIndex * 0.25) * beatDuration
          if (isJazz) {
            const beatFraction = (chordIndex * 2 + noteIndex * 0.25) % 1
            if (beatFraction > 0.4 && beatFraction < 0.6) {
              delay += beatDuration * 0.12
            }
          }
          const scheduleTime = now + lookahead + delay

          const eventId = Tone.Transport.schedule((audioTime) => {
            // Use safe trigger for MonoSynth timing compliance
            this.safeMonoSynthTrigger('backgroundMid', frequency, duration, audioTime, velocityConfig.harmony)
          }, scheduleTime)
          this.scheduledTransportEvents.push(eventId)
        }
      }
    } else if (type === 'chord_pads' && accompaniment.chords) {
      const chords = accompaniment.chords
      for (let index = 0; index < chords.length; index++) {
        const chord = chords[index]
        const chordNotes = this.buildChordFromName(chord.chord || 'C')
        const baseDelay = index * 4 * beatDuration

        for (let j = 0; j < chordNotes.length; j++) {
          const pitch = chordNotes[j]
          const frequency = this.midiToFrequency(pitch)
          const duration = chord.duration || 4
          const scheduleTime = now + lookahead + baseDelay

          const eventId = Tone.Transport.schedule((audioTime) => {
            // Use safe trigger for MonoSynth timing compliance
            this.safeMonoSynthTrigger('backgroundLow', frequency, duration, audioTime, velocityConfig.pad)
          }, scheduleTime)
          this.scheduledTransportEvents.push(eventId)
        }
      }
    } else if (type === 'jazz_comping' && accompaniment.chords) {
      // Entry #181b: Jazz comping with swing timing and anticipations
      const swingAmount = accompaniment.swingAmount || 0.67
      const syncopation = accompaniment.syncopation || 0.7
      const chords = accompaniment.chords

      for (let chordIndex = 0; chordIndex < chords.length; chordIndex++) {
        const chord = chords[chordIndex]
        if (!chord) continue
        const chordNotes = chord.voicing || this.buildChordFromName(chord.chord || 'C')
        if (!chordNotes || chordNotes.length === 0) continue
        const rhythm = chord.rhythm || [1.5, 0.5, 1, 1]

        let currentBeat = chordIndex * 4
        for (let noteIdx = 0; noteIdx < rhythm.length; noteIdx++) {
          const duration = rhythm[noteIdx]
          let beatPosition = currentBeat
          // Apply swing
          const beatFraction = beatPosition % 1
          if (swingAmount > 0 && beatFraction >= 0.4 && beatFraction <= 0.6) {
            beatPosition += (swingAmount - 0.5) * 0.33
          }
          // Apply anticipation only if beatPosition allows
          const shouldAnticipate = chord.anticipate || (noteIdx === 0 && Math.random() < syncopation * 0.4)
          if (shouldAnticipate && beatPosition >= 0.1) {
            beatPosition -= 0.1
          }

          const delay = Math.max(0, beatPosition * beatDuration)
          const scheduleTime = now + lookahead + delay

          for (let j = 0; j < chordNotes.length; j++) {
            const pitch = chordNotes[j]
            const frequency = this.midiToFrequency(pitch)
            const noteDuration = duration * 0.85  // Portato

            const eventId = Tone.Transport.schedule((audioTime) => {
              this.safeMonoSynthTrigger('backgroundMid', frequency, noteDuration, audioTime, velocityConfig.harmony * 1.2)
            }, scheduleTime)
            this.scheduledTransportEvents.push(eventId)
          }
          currentBeat += duration
        }
      }
    } else if (type === 'rock_groove' && accompaniment.chords) {
      // Entry #181b: Rock groove with backbeat accents and power chords
      const syncopation = accompaniment.syncopation || 0.4
      const chords = accompaniment.chords

      for (let chordIndex = 0; chordIndex < chords.length; chordIndex++) {
        const chord = chords[chordIndex]
        if (!chord) continue
        const builtChord = this.buildChordFromName(chord.chord || 'C')
        if (!builtChord || builtChord.length === 0) continue
        const rootNote = builtChord[0]
        const powerChord = [rootNote, rootNote + 7]
        const rhythm = chord.rhythm || [0.5, 0.5, 0.5, 0.5]

        let currentBeat = chordIndex * 2
        for (let noteIdx = 0; noteIdx < rhythm.length; noteIdx++) {
          const duration = rhythm[noteIdx]
          const isBackbeat = noteIdx % 2 === 1
          const velocity = isBackbeat ? velocityConfig.harmony * 1.5 : velocityConfig.harmony

          let beatPosition = currentBeat
          const pushAmount = 0.05 * syncopation
          if ((chord.pushBeat || (noteIdx === 0 && syncopation > 0.3)) && beatPosition >= pushAmount) {
            beatPosition -= pushAmount
          }

          const delay = Math.max(0, beatPosition * beatDuration)
          const scheduleTime = now + lookahead + delay

          for (let j = 0; j < powerChord.length; j++) {
            const pitch = powerChord[j]
            const frequency = this.midiToFrequency(pitch)
            const noteDuration = duration * 0.8

            const eventId = Tone.Transport.schedule((audioTime) => {
              this.safeMonoSynthTrigger('backgroundMid', frequency, noteDuration, audioTime, velocity)
            }, scheduleTime)
            this.scheduledTransportEvents.push(eventId)
          }
          currentBeat += duration
        }
      }
    } else if (type === 'ambient_pads' && accompaniment.chords) {
      // Entry #181b: Ambient pads with very long sustains
      const chords = accompaniment.chords

      for (let chordIndex = 0; chordIndex < chords.length; chordIndex++) {
        const chord = chords[chordIndex]
        if (!chord) continue
        const chordNotes = chord.voicing || this.buildChordFromName(chord.chord || 'C')
        if (!chordNotes || chordNotes.length === 0) continue
        const duration = chord.duration || 8
        const baseDelay = chordIndex * duration * beatDuration

        for (let noteIdx = 0; noteIdx < chordNotes.length; noteIdx++) {
          const pitch = chordNotes[noteIdx]
          const frequency = this.midiToFrequency(pitch)
          const velocity = velocityConfig.pad * (0.5 + noteIdx * 0.1)
          const stagger = noteIdx * 0.15
          const scheduleTime = now + lookahead + baseDelay + stagger

          const eventId = Tone.Transport.schedule((audioTime) => {
            this.safeMonoSynthTrigger('backgroundLow', frequency, duration, audioTime, velocity)
          }, scheduleTime)
          this.scheduledTransportEvents.push(eventId)
        }
      }
    } else if (type === 'alberti_bass' && accompaniment.chords) {
      // Entry #181b: Alberti bass pattern (broken chord: root-5th-3rd-5th)
      const chords = accompaniment.chords

      for (let chordIndex = 0; chordIndex < chords.length; chordIndex++) {
        const chord = chords[chordIndex]
        if (!chord) continue
        const chordNotes = chord.voicing || this.buildChordFromName(chord.chord || 'C')
        if (!chordNotes || chordNotes.length < 3) continue

        const pattern = [
          chordNotes[0] - 12,  // Root (octave down)
          chordNotes[2] - 12,  // 5th (octave down)
          chordNotes[1] - 12,  // 3rd (octave down)
          chordNotes[2] - 12   // 5th (octave down)
        ]
        const rhythm = chord.rhythm || [0.5, 0.5, 0.5, 0.5]

        let currentBeat = chordIndex * 2
        for (let noteIdx = 0; noteIdx < pattern.length; noteIdx++) {
          const pitch = pattern[noteIdx]
          const frequency = this.midiToFrequency(pitch)
          const duration = rhythm[noteIdx % rhythm.length] * 0.9
          const delay = currentBeat * beatDuration
          const scheduleTime = now + lookahead + delay

          const eventId = Tone.Transport.schedule((audioTime) => {
            this.safeMonoSynthTrigger('backgroundLow', frequency, duration, audioTime, velocityConfig.bass)
          }, scheduleTime)
          this.scheduledTransportEvents.push(eventId)
          currentBeat += rhythm[noteIdx % rhythm.length]
        }
      }
    } else if (type === 'block_chords' && accompaniment.chords) {
      // Entry #181b: Block chords (full voicings, legato)
      const chords = accompaniment.chords

      for (let chordIndex = 0; chordIndex < chords.length; chordIndex++) {
        const chord = chords[chordIndex]
        if (!chord) continue
        const chordNotes = chord.voicing || this.buildChordFromName(chord.chord || 'C')
        if (!chordNotes || chordNotes.length === 0) continue
        const rhythm = chord.rhythm || [1, 1, 1, 1]

        let currentBeat = chordIndex * 4
        for (let noteIdx = 0; noteIdx < rhythm.length; noteIdx++) {
          const duration = rhythm[noteIdx]
          const delay = currentBeat * beatDuration
          const scheduleTime = now + lookahead + delay

          for (let j = 0; j < chordNotes.length; j++) {
            const pitch = chordNotes[j]
            const frequency = this.midiToFrequency(pitch)
            const noteDuration = duration * 0.95  // Legato

            const eventId = Tone.Transport.schedule((audioTime) => {
              this.safeMonoSynthTrigger('backgroundMid', frequency, noteDuration, audioTime, velocityConfig.harmony)
            }, scheduleTime)
            this.scheduledTransportEvents.push(eventId)
          }
          currentBeat += duration
        }
      }
    }
  }

  /**
   * Play ambient composition (textural)
   * REAL-TIME FIX: Uses Tone.Transport.schedule/scheduleRepeat instead of setTimeout/setInterval
   * @param {Object} content - Composition content
   * @param {number} tempo - Tempo in BPM
   */
  playAmbientComposition(content, tempo = 120, isDrone = false) {
    if (!content.texture || !Array.isArray(content.texture)) {
      return
    }

    // console.log(`🎵 playAmbientComposition called - isDrone: ${isDrone}, texture items: ${content.texture.length}, pad exists: ${!!this.ambientLayers?.pad}`)

    // Ensure Transport is running
    if (Tone.Transport.state !== 'started') {
      // console.log('🚀 Starting Transport (was stopped)')
      Tone.Transport.start()
    }

    // CRITICAL: Ensure masterVolume is not muted (could happen after stop/start)
    if (this.masterVolume && this.masterVolume.volume.value === -Infinity) {
      // console.log('🔊 Restoring masterVolume from -Infinity to -10dB')
      this.masterVolume.volume.value = -10
    }

    // Entry #188f: Save old event IDs for delayed cleanup (prevents gap during transition)
    const oldRepeatEventIds = this.droneRepeatEventIds ? [...this.droneRepeatEventIds] : []
    const oldLegacyEventId = this.droneRepeatEventId
    this.droneRepeatEventIds = []
    this.droneRepeatEventId = null

    // Clear old events AFTER a short delay to allow overlap with new events
    setTimeout(() => {
      for (const eventId of oldRepeatEventIds) {
        try { Tone.Transport.clear(eventId) } catch (e) { /* already cleared */ }
      }
      if (oldLegacyEventId) {
        try { Tone.Transport.clear(oldLegacyEventId) } catch (e) { /* already cleared */ }
      }
    }, 500)  // 500ms overlap for smooth transition

    const texture = content.texture
    // POLYPHONY FIX: Limit drone textures to pad's maxPolyphony (3 voices)
    const maxDroneVoices = 3
    const maxTextures = isDrone ? Math.min(texture.length, maxDroneVoices) : texture.length

    for (let index = 0; index < maxTextures; index++) {
      const textureItem = texture[index]
      if (!textureItem.note) continue

      const midiNote = this.noteNameToMidi(textureItem.note)
      const frequency = this.midiToFrequency(midiNote)
      const duration = (textureItem.duration || 8000) / 1000
      // Entry #188d: Background textures quieter than gestures
      const velocity = textureItem.velocity || 0.12
      // Entry #117: Drone notes should play simultaneously (no stagger)
      // Non-drone textures can stagger for rhythmic interest
      const delay = isDrone ? 0 : index * 0.5
      // Entry #188g: All ambient textures use 'pad' layer (PolySynth) to avoid
      // conflicts with polyphonic/homophonic compositions that use backgroundLow (MonoSynth)
      const layerName = 'pad'

      // Entry #90: Skip if layer is disabled by audio profile settings
      if (!this._isLayerEnabled(layerName)) {
        continue
      }

      if (isDrone) {
        // Entry #27 FIX: For drones, trigger IMMEDIATELY using Tone.now() (AudioContext time)
        // Don't use Transport.schedule() which uses Transport time (can be out of sync after stop/start)
        const layer = this.ambientLayers && this.ambientLayers[layerName]
        if (layer) {
          // POLYPHONY FIX: Release all before first drone trigger (only on first drone)
          if (index === 0) {
            try {
              layer.releaseAll(0.05)
            } catch (e) {
              // Ignore release errors
            }
          }
          const audioTime = Tone.now() + 0.05 + delay
          // console.log(`🎹 DRONE IMMEDIATE: freq=${frequency.toFixed(1)}Hz, time=${audioTime.toFixed(2)}s`)
          layer.triggerAttackRelease(frequency, duration, audioTime, velocity)
          // Track PolySynth voice (excluded from external stealing, counted in budget)
          this.trackVoice(this._generateVoiceId('ambient-pad'), layer, duration, this.VOICE_PRIORITY.ACCOMPANIMENT, true)
        }

        // Schedule repeating drone using RELATIVE time syntax ("+8" means 8 seconds from now)
        // PERFORMANCE FIX: Store ALL event IDs in array (was overwriting single ID, causing leak)
        const repeatStartTime = `+${duration + delay}`
        const repeatEventId = Tone.Transport.scheduleRepeat((audioTime) => {
          // Entry #90: Check if layer is still enabled (user may have changed settings)
          if (!this._isLayerEnabled('pad')) {
            return  // Skip this repeat - layer was disabled
          }
          if (this.ambientLayers && this.ambientLayers.pad) {
            // POLYPHONY FIX: Release ALL previous notes before triggering new one
            // This prevents voice accumulation in the PolySynth (max 3 voices)
            try {
              this.ambientLayers.pad.releaseAll(0.05)  // Quick release to free voices
            } catch (e) {
              // Ignore release errors
            }
            this.ambientLayers.pad.triggerAttackRelease(frequency, duration, audioTime, velocity)
            // Track repeating PolySynth voice
            this.trackVoice(this._generateVoiceId('ambient-pad'), this.ambientLayers.pad, duration, this.VOICE_PRIORITY.ACCOMPANIMENT, true)
          }
        }, duration, repeatStartTime)
        this.droneRepeatEventIds.push(repeatEventId)
        this.scheduledTransportEvents.push(repeatEventId)
      } else {
        // Entry #188g: Non-drone ambient textures use same PolySynth approach as drones
        // First trigger immediately using pad layer (PolySynth)
        const layer = this.ambientLayers && this.ambientLayers.pad
        if (layer) {
          const audioTime = Tone.now() + 0.1 + delay
          layer.triggerAttackRelease(frequency, duration, audioTime, velocity)
          // Track PolySynth voice (excluded from external stealing, counted in budget)
          this.trackVoice(this._generateVoiceId('ambient-pad'), layer, duration, this.VOICE_PRIORITY.ACCOMPANIMENT, true)
        }

        // Schedule repeating (same pattern as drones)
        const repeatStartTime = `+${duration + 0.1 + delay}`
        const repeatEventId = Tone.Transport.scheduleRepeat((audioTime) => {
          if (!this._isLayerEnabled('pad')) {
            return
          }
          if (this.ambientLayers && this.ambientLayers.pad) {
            try {
              this.ambientLayers.pad.releaseAll(0.05)
            } catch (e) { /* ignore */ }
            this.ambientLayers.pad.triggerAttackRelease(frequency, duration, audioTime, velocity)
            // Track repeating PolySynth voice
            this.trackVoice(this._generateVoiceId('ambient-pad'), this.ambientLayers.pad, duration, this.VOICE_PRIORITY.ACCOMPANIMENT, true)
          }
        }, duration, repeatStartTime)
        this.droneRepeatEventIds.push(repeatEventId)
        this.scheduledTransportEvents.push(repeatEventId)
      }
    }
  }

  /**
   * Convert note name to MIDI number (e.g., "C3" -> 48)
   */
  noteNameToMidi(noteName) {
    const noteMap = {
      'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
    }

    const match = noteName.match(/^([A-G])([#b]?)(\d+)$/)
    if (!match) return 60  // Default to C4

    const [, note, accidental, octave] = match
    let midiNote = noteMap[note] + (parseInt(octave) + 1) * 12

    if (accidental === '#') midiNote += 1
    if (accidental === 'b') midiNote -= 1

    return midiNote
  }

  /**
   * Convert MIDI note to frequency
   */
  midiToFrequency(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12)
  }

  /**
   * Safely trigger MonoSynth with proper timing
   * MonoSynth requires strictly increasing start times - this helper ensures that
   * @param {string} layerName - Name of the MonoSynth layer
   * @param {number} frequency - Frequency in Hz
   * @param {number|string} duration - Duration in seconds or Tone.js notation
   * @param {number} time - Audio context time to trigger at
   * @param {number} velocity - Velocity 0-1
   */
  safeMonoSynthTrigger(layerName, frequency, duration, time, velocity) {
    // Entry #90: Skip if layer is disabled by audio profile settings
    if (!this._isLayerEnabled(layerName)) return

    const layer = this.ambientLayers && this.ambientLayers[layerName]
    if (!layer) return

    // Voice priority tracking: MonoSynth uses fixed voiceId per layer (overwrites previous)
    const durationSec = typeof duration === 'number' ? duration : 0.5
    const priority = this.LAYER_PRIORITY_MAP[layerName] || 1

    // For PolySynth layers, just trigger normally (no MonoSynth timing logic)
    if (!this.monoSynthLastTrigger || !(layerName in this.monoSynthLastTrigger)) {
      layer.triggerAttackRelease(frequency, duration, time, velocity)
      // Track PolySynth voice (excluded from external stealing)
      if (this.generativeState) {
        const polyVoiceId = this._generateVoiceId(layerName)
        this.trackVoice(polyVoiceId, layer, durationSec, priority, true)
      }
      return
    }

    // MonoSynth: fixed voiceId per layer — overwrite previous entry
    if (this.generativeState) {
      const voiceId = `mono-${layerName}`
      this.generativeState.activeVoices.delete(voiceId)
      if (!this.trackVoice(voiceId, layer, durationSec, priority)) return
    }

    // MonoSynth: ensure time is strictly greater than last trigger
    const lastTime = this.monoSynthLastTrigger[layerName] || 0
    const minGap = 0.005  // 5ms minimum gap between notes
    const safeTime = Math.max(time, lastTime + minGap)

    // Update last trigger time
    this.monoSynthLastTrigger[layerName] = safeTime

    try {
      layer.triggerAttackRelease(frequency, duration, safeTime, velocity)
    } catch (err) {
      // If still failing, force release and retry with fresh timing
      try {
        layer.triggerRelease()
        const freshTime = Tone.now() + 0.01
        this.monoSynthLastTrigger[layerName] = freshTime
        layer.triggerAttackRelease(frequency, duration, freshTime, velocity)
      } catch (retryErr) {
        // Silently fail - note will be skipped
      }
    }
  }

  /**
   * Safely trigger gestureSynth (MonoSynth) with proper timing
   * @param {number} frequency - Frequency in Hz
   * @param {number|string} duration - Duration in seconds or Tone.js notation
   * @param {number} time - Audio context time (undefined for immediate)
   * @param {number} velocity - Velocity 0-1
   */
  safeGestureSynthTrigger(frequency, duration, time, velocity) {
    if (!this.gestureSynth) return

    // Voice priority tracking: MonoSynth uses fixed voiceId (overwrites previous)
    const durationSec = typeof duration === 'number' ? duration : 0.5
    if (this.generativeState) {
      this.generativeState.activeVoices.delete('mono-gesture')
      if (!this.trackVoice('mono-gesture', this.gestureSynth, durationSec, this.VOICE_PRIORITY.LOCAL_GESTURE)) return
    }

    // Convert relative time strings ("+0.5") to absolute time
    let requestedTime
    if (time === undefined) {
      requestedTime = Tone.now()
    } else if (typeof time === 'string' && time.startsWith('+')) {
      requestedTime = Tone.now() + parseFloat(time.substring(1))
    } else {
      requestedTime = time
    }

    // Entry #SynthUIFix: Use context-time tracker, NOT gestureSynthLastTrigger (which uses Transport time)
    if (!this._sustainedHoldLastTrigger) this._sustainedHoldLastTrigger = 0
    const minGap = 0.005  // 5ms minimum gap between notes
    const safeTime = Math.max(requestedTime, this._sustainedHoldLastTrigger + minGap)

    // Update context-time tracker
    this._sustainedHoldLastTrigger = safeTime

    try {
      this.gestureSynth.triggerAttackRelease(frequency, duration, safeTime, velocity)
    } catch (err) {
      // If still failing, force release and retry with fresh timing
      try {
        this.gestureSynth.triggerRelease()
        const freshTime = Tone.now() + 0.01
        this._sustainedHoldLastTrigger = freshTime
        this.gestureSynth.triggerAttackRelease(frequency, duration, freshTime, velocity)
      } catch (retryErr) {
        // Silently fail - note will be skipped
      }
    }
  }

  /**
   * Build chord from chord name
   */
  buildChordFromName(chordName) {
    const noteMap = {
      'C': 60, 'C#': 61, 'Db': 61, 'D': 62, 'D#': 63, 'Eb': 63,
      'E': 64, 'F': 65, 'F#': 66, 'Gb': 66, 'G': 67, 'G#': 68,
      'Ab': 68, 'A': 69, 'A#': 70, 'Bb': 70, 'B': 71
    }

    const rootMatch = chordName.match(/^([A-G][#b]?)/)
    if (!rootMatch) return [60, 64, 67]

    const root = noteMap[rootMatch[1]] || 60

    if (chordName.includes('m')) {
      return [root, root + 3, root + 7]
    } else if (chordName.includes('7')) {
      return [root, root + 4, root + 7, root + 10]
    } else {
      return [root, root + 4, root + 7]
    }
  }

  /**
   * Cleanup hanging notes to prevent audio issues
   * FIX: Added note hanging prevention
   */
  cleanupHangingNotes() {
    if (!this.activeNotes || !this.gestureSynth) return

    const now = Tone.context.currentTime
    const maxDuration = 2.0 // Maximum 2 seconds for any note

    // Release any notes that have been playing too long
    this.activeNotes.forEach((noteData, noteId) => {
      if (now - noteData.startTime > maxDuration) {
        try {
          noteData.synth.triggerRelease(noteData.frequency)
          this.activeNotes.delete(noteId)
          // console.log(`🔇 Force-released hanging note: ${noteData.frequency.toFixed(1)}Hz`)
        } catch (e) {
          this.activeNotes.delete(noteId)
        }
      }
    })
  }

  /**
   * Play sound effect for remote drawing stroke
   * Maps user color to frequency in 200-800Hz range
   * @param {string} color - User's assigned color (hex format #rrggbb)
   */
  playDrawSound(color) {
    // console.log(`🔊 playDrawSound called - muted: ${this.muted}, volume: ${this.volume}, initialized: ${this.isInitialized}`)

    if (!this.isInitialized || this.muted || !this.gestureSynth) {
      // console.log(`🔇 Audio blocked - muted: ${this.muted}, initialized: ${this.isInitialized}`)
      return
    }

    try {
      // Map color to frequency
      const frequency = this.mapColorToFrequency(color)

      if (!frequency) {
        // console.warn('AudioService: Invalid color for draw sound', color)
        return
      }

      // Play short beep (volume controlled by masterVolume)
      // console.log(`🎵 Playing draw sound at frequency ${frequency}Hz`)
      // Use safe trigger for MonoSynth timing compliance
      this.safeGestureSynthTrigger(frequency, '16n', undefined, 0.3)

    } catch (error) {
      // console.warn('AudioService: Error playing draw sound', error)
    }
  }

  /**
   * Play musical event from gesture with proper articulation and duration
   * FIX: Enhanced duration normalization and articulation support
   * EVOLUTIVE: Integrates user phrases into background composition
   * Entry #175b: Added style parameter for genre-aware velocity scaling
   *
   * SYNTH ROUTING LOGIC (via musicalEvent.userId):
   * - userId = null/undefined → Uses gestureSynth (customizable via SynthPanel, for local user)
   * - userId = <id>          → Uses userSynthManager per-user synth (for remote users)
   *
   * IMPORTANT: Local gestures MUST set userId=null to receive SynthPanel customizations.
   *
   * @param {Object} musicalEvent - Musical event data (includes userId for routing)
   * @param {Object} style - Optional style object with dominantGenre for velocity scaling
   */
  playMusicalEvent(musicalEvent, style = null) {
    // CRITICAL: Check AudioContext state - if suspended, try to resume
    if (Tone.context?.state === 'suspended') {
      Tone.context.resume()
    }

    if (!this.isInitialized || !musicalEvent || this.muted) {
      return
    }

    // Entry #175b: Use provided style or fall back to currentStyle
    const activeStyle = style || this.currentStyle || {}

    const startTime = performance.now()

    try {
      // Handle both frontend format (pitch, velocity, duration) and backend format (properties.frequency, properties.duration)
      let pitch, velocity, duration, articulation, frequency

      if (musicalEvent.properties) {
        // Backend format - use properties directly
        frequency = musicalEvent.properties.frequency
        duration = musicalEvent.properties.duration
        velocity = musicalEvent.properties.velocity || 50
        articulation = musicalEvent.properties.articulation || 'default'

        // TAP PITCH DEBUG: Log for tap events
        if (musicalEvent.properties.noteIndex === 0 && musicalEvent.properties.totalNotes === 1) {
          // console.log('🎯 TAP RECEIVED IN FRONTEND:', {
//            userId: musicalEvent.userId?.substring(0, 8),
//            pitch: musicalEvent.properties.pitch,
//            frequency: frequency?.toFixed(1),
//            position: musicalEvent.position
////          })
        }

        // console.log('🎵 Playing backend musical event:', {
//          frequency: frequency?.toFixed(1),
//          duration,
//          velocity,
//          noteIndex: musicalEvent.properties.noteIndex,
//          totalNotes: musicalEvent.properties.totalNotes
////        })
      } else {
        // Frontend format
        pitch = musicalEvent.pitch
        velocity = musicalEvent.velocity
        duration = musicalEvent.duration
        articulation = musicalEvent.articulation

        if (pitch === undefined || velocity === undefined || duration === undefined) {
          // console.warn('🔇 Invalid musical event data:', { pitch, velocity, duration, articulation })
          return
        }

        // Convert MIDI pitch to frequency
        frequency = this.midiNoteToFrequency(pitch)
      }

      // FIX: Convert Tone.js duration notation to seconds
      let normalizedDuration = duration
      if (typeof duration === 'string') {
        // Manual conversion of Tone.js notation to seconds (120 BPM)
        // More reliable than Tone.Time() which requires Transport context
        const durationMap = {
          '32n': 0.0625,  // 1/32 note at 120 BPM
          '16n': 0.125,   // 1/16 note at 120 BPM
          '8n': 0.25,     // 1/8 note at 120 BPM
          '4n': 0.5,      // 1/4 note at 120 BPM
          '2n': 1.0,      // 1/2 note at 120 BPM
          '1n': 2.0       // whole note at 120 BPM
        }

        normalizedDuration = durationMap[duration] || 0.125

        // console.log('🎵 Duration conversion:', {
//          input: duration,
//          output: normalizedDuration,
//          articulation: articulation
////        })
      } else if (typeof duration === 'number') {
        // Frontend format: duration is ALREADY in seconds (0.25-1.2s from createLocalPhrase)
        // Don't multiply by 0.25 - that was wrong!
        // Just clamp to reasonable range
        normalizedDuration = Math.max(0.05, Math.min(4.0, duration))
      }

      // Apply velocity normalization (articulation affects only envelope, not duration)
      let adjustedDuration = normalizedDuration
      let adjustedVelocity

      // Handle different velocity ranges for backend vs frontend format
      if (musicalEvent.properties) {
        // Backend format: velocity is typically 0-100, normalize to 0-1
        adjustedVelocity = Math.max(0.1, Math.min(1.0, (velocity || 50) / 100))
      } else {
        // Frontend format: velocity is MIDI 0-127
        adjustedVelocity = Math.max(0.1, Math.min(1.0, velocity / 127))
      }

      // Entry #175b: Apply genre-based velocity scaling
      // Entry #188d: Updated baseline to 0.17 (background quieter than gestures)
      const velocityConfig = this.getVelocityConfig(activeStyle)
      adjustedVelocity *= (velocityConfig.melody / 0.17) // Scale relative to default melody velocity

      // Duration already determined by velocity in frontend (32n/16n/8n)
      // Only apply velocity boost for accents
      if (articulation === 'marcato') {
        adjustedVelocity *= 1.2 // Slightly louder for accented notes
      }

      // Final duration clamping
      adjustedDuration = Math.max(0.02, Math.min(3.0, adjustedDuration))

      // Entry #SynthUIFix: Ensure Transport is running before scheduling
      // Without this, scheduled events can be delayed by seconds
      if (Tone.Transport.state !== 'started') {
        Tone.Transport.start()
      }

      // PERFORMANCE FIX: Use Transport.schedule for audio-thread scheduling
      // This prevents main thread congestion from delaying audio callbacks
      // Key insight: schedule on audio thread, not main thread with setTimeout

      // Pre-compute all values outside the callback to reduce GC pressure
      // Entry #46 FIX: Ensure isStreamed is strictly boolean to prevent truthy string bugs
      const isStreamed = musicalEvent.properties?.isStreamed === true
      const userId = musicalEvent.userId
      const eventFrequency = frequency
      const eventDuration = adjustedDuration
      const eventVelocity = adjustedVelocity
      const eventArticulation = articulation

      // Pre-compute envelope based on articulation (avoid object creation in callback)
      let envAttack, envDecay, envSustain, envRelease
      switch (eventArticulation) {
        case 'staccato':
          envAttack = 0.005
          envDecay = eventDuration * 0.2
          envSustain = 0.3
          envRelease = eventDuration * 0.3
          break
        case 'marcato':
          envAttack = 0.01
          envDecay = eventDuration * 0.3
          envSustain = 0.5
          envRelease = eventDuration * 0.4
          break
        case 'legato':
          envAttack = eventDuration * 0.1
          envDecay = eventDuration * 0.2
          envSustain = 0.7
          envRelease = eventDuration * 0.7
          break
        default:
          envAttack = 0.005
          envDecay = 0.02
          envSustain = 0.1
          envRelease = 0.05
      }

      // Schedule audio event on the audio thread using Transport.schedule
      // This ensures precise timing regardless of main thread load
      // FIX: Use "+0" for immediate playback - Transport.schedule expects Transport time, not Tone.now()
      const scheduleTime = "+0"  // Immediate in Transport time

      const transportEventId = Tone.Transport.schedule((time) => {
        // Entry #73 FIX: Record timing for stress monitoring
        if (this.stressMonitor) {
          this.stressMonitor.recordTiming(time, Tone.now())
        }

        if (!this.gestureSynth || this.gestureSynth.disposed) {
          return
        }

        try {
          let synth = null
          // Entry #HarmonicCoherence: Quantize incoming frequency to current scale
          let actualFrequency = this.quantizeToScale(eventFrequency)
          let synthData = null  // Entry #66 FIX: Declare outside if block for visibility

          if (userId && this.userSynthManager) {
            synthData = this.userSynthManager.getSynthForUser(userId)
            if (synthData && synthData.synth && !synthData.synth.disposed) {
              synth = synthData.synth
              actualFrequency = this.userSynthManager.constrainFrequencyToTessitura(eventFrequency, userId)

              // DEBUG: Log patch name for troubleshooting timbre issues

              // Apply oscillator config
              // Entry #90 FIX: In Ultra-Low Power mode, force simple sine oscillator
              if (this.isUltraLowPowerMode) {
                try {
                  synth.set({ oscillator: { type: 'sine' } })
                } catch (e) {
                  // Ignore oscillator set errors
                }
              } else {
                const patchOsc = synthData.patch?.oscillator
                if (patchOsc && patchOsc.type !== 'fmsine') {
                  try {
                    synth.set({ oscillator: patchOsc })
                  } catch (e) {
                    // Ignore oscillator set errors
                  }
                }
              }
            }
          }

          // Fallback to gestureSynth
          if (!synth) {
            synth = this.gestureSynth
            // Entry #SynthUI: Only override oscillator in Ultra-Low Power mode
            // Otherwise preserve the user's selected preset oscillator type
            if (this.isUltraLowPowerMode) {
              this.gestureSynth.set({
                oscillator: { type: 'sine' },
                envelope: {
                  attack: envAttack,
                  decay: envDecay,
                  sustain: envSustain,
                  release: envRelease
                }
              })
            } else if (!this._hasCustomEnvelope) {
              // Only update envelope if user hasn't set custom values via SynthPanel
              // When _hasCustomEnvelope is true, preserve user's SynthPanel envelope settings
              this.gestureSynth.set({
                envelope: {
                  attack: envAttack,
                  decay: envDecay,
                  sustain: envSustain,
                  release: envRelease
                }
              })
            }
            // If _hasCustomEnvelope is true, don't touch envelope - user's settings are preserved
          }

          // Voice priority tracking: done after synth lookup so we have actual synth reference
          // MonoSynth fixed voiceId per synth prevents stale entries
          const voicePriority = userId ? this.VOICE_PRIORITY.REMOTE_GESTURE : this.VOICE_PRIORITY.LOCAL_GESTURE
          const voiceId = userId ? `mono-remote-${userId}` : 'mono-gesture'
          if (this.generativeState) {
            this.generativeState.activeVoices.delete(voiceId)
            this.trackVoice(voiceId, synth, eventDuration, voicePriority)
          }

          // Volume hierarchy: local (×1.15 boost) > remote (×1.0)
          // Local gestures get a slight boost for prominence
          // Entry #46 FIX: Defensive validation for velocity to prevent NaN/invalid values
          const safeVelocity = (typeof eventVelocity === 'number' && !isNaN(eventVelocity))
            ? Math.max(0, Math.min(1.0, eventVelocity))
            : 0.7  // Default fallback
          const finalVelocity = isStreamed ? safeVelocity : Math.min(1.0, safeVelocity * 1.15)

          // Entry #66: MONOSYNTH TIMING FIX - Ensure strictly increasing start times
          // MonoSynth requires each note's start time > previous note's start time
          const minGap = 0.005  // 5ms minimum gap between notes
          // Entry #SynthUIFix: Use Tone.now() for gestureSynth path (consistent with UserSynthManager.triggerNote)
          // The callback's `time` can be misaligned with audio context time, causing delays
          const now = Tone.now()
          let safeTime = now

          if (synthData && synthData.lastTriggerTime !== undefined) {
            // UserSynthManager synth - use its lastTriggerTime (context time based)
            safeTime = Math.max(now, synthData.lastTriggerTime + minGap)
            synthData.lastTriggerTime = safeTime
          } else if (synth === this.gestureSynth) {
            // gestureSynth - use context time tracker for consistency
            safeTime = Math.max(now, (this._playMusicalEventLastTrigger || 0) + minGap)
            this._playMusicalEventLastTrigger = safeTime
          }

          try {
            synth.triggerAttackRelease(
              actualFrequency,
              eventDuration,
              safeTime,
              finalVelocity
            )
          } catch (triggerErr) {
            // If still failing, force release and retry with fresh timing
            try {
              synth.triggerRelease()
              const freshTime = Tone.now() + 0.01
              if (synthData) synthData.lastTriggerTime = freshTime
              else this._playMusicalEventLastTrigger = freshTime
              synth.triggerAttackRelease(actualFrequency, eventDuration, freshTime, finalVelocity)
            } catch (retryErr) {
              // Silently fail - note will be skipped
            }
          }
        } catch (e) {
        }
      }, scheduleTime)

      // Store Transport event ID for cleanup (not setTimeout ID)
      if (!this.scheduledTransportEvents) this.scheduledTransportEvents = []
      this.scheduledTransportEvents.push(transportEventId)

      // EVOLUTIVE: Integrate user phrase into background composition
      this.integrateUserPhraseIntoBackground(musicalEvent, frequency, adjustedDuration)

      // Track performance
      const latency = performance.now() - startTime
      if (latency > 50) {
        // console.warn(`🐌 High musical event latency: ${latency.toFixed(1)}ms`)
      }

    } catch (error) {
      // console.error('🔇 Error playing musical event:', error)
    }
  }

  /**
   * Integrate user phrase into background composition
   * EVOLUTIVE: Makes background respond to user musical input
   * @param {Object} musicalEvent - Musical event data
   * @param {number} frequency - Note frequency
   * @param {number} duration - Note duration
   */
  integrateUserPhraseIntoBackground(musicalEvent, frequency, duration) {
    if (!this.generativeState || !this.ambientLayers) return

    const state = this.generativeState

    // Update user influence based on musical event characteristics
    state.userInfluence = Math.min(1.0, state.userInfluence + 0.1)
    state.lastUserActivity = Date.now()

    // Extract musical characteristics from the event
    const midiPitch = musicalEvent.pitch
    const velocity = musicalEvent.velocity || 64
    const articulation = musicalEvent.articulation || 'default'

    // Update generative complexity based on user input
    if (articulation === 'staccato') {
      state.complexity = Math.min(1.0, state.complexity + 0.05) // Staccato = increase complexity
    } else if (articulation === 'legato') {
      state.complexity = Math.max(0.1, state.complexity - 0.03) // Legato = slightly decrease
    }

    // Influence harmonic progression based on pitch
    if (midiPitch) {
      const pitchClass = midiPitch % 12
      const currentTonicClass = Math.round(state.currentTonic) % 12

      // If user plays a note far from current tonic, consider modulating
      const pitchDistance = Math.min((pitchClass - currentTonicClass + 12) % 12,
                                   (currentTonicClass - pitchClass + 12) % 12)

      if (pitchDistance > 4) { // More than a major third away
        if (Math.random() > 0.7) {
          // Consider harmonic modulation
          this.considerHarmonicModulation(state, pitchClass)
        }
      }
    }

    // Add rhythmic influence based on duration
    if (duration < 0.2) {
      // Short notes = increase rhythmic complexity
      state.rhythmicComplexity = Math.min(1.0, state.rhythmicComplexity + 0.1)
    } else if (duration > 1.0) {
      // Long notes = decrease rhythmic complexity, increase harmonic tension
      state.rhythmicComplexity = Math.max(0.2, state.rhythmicComplexity - 0.05)
      state.harmonicTension = Math.min(1.0, (state.harmonicTension || 0.3) + 0.1)
    }

    // Log integration for debugging
    // console.log(`🎵 Integrated user phrase: influence=${state.userInfluence.toFixed(2)}, complexity=${state.complexity.toFixed(2)}`)

    // Trigger immediate background evolution for ANY user influence to show response
    if (state.userInfluence > 0.2) {
      this.triggerImmediateBackgroundEvolution()
      // console.log(`🎵 Triggered background evolution due to user input (influence: ${state.userInfluence.toFixed(2)})`)
    }

    // Also trigger immediate filter response to show background is reacting
    this.triggerBackgroundFilterResponse(frequency, duration)
  }

  /**
   * Consider harmonic modulation based on user input
   * @param {Object} state - Generative state
   * @param {number} targetPitchClass - Target pitch class for modulation
   */
  considerHarmonicModulation(state, targetPitchClass) {
    const currentTonicClass = Math.round(state.currentTonic) % 12

    // Calculate modulation interval
    let modulationInterval = (targetPitchClass - currentTonicClass + 12) % 12

    // Favor musically meaningful intervals
    const meaningfulIntervals = [5, 7, 2, 9, 4] // Fifth, seventh, second, sixth, third
    const closestInterval = meaningfulIntervals.reduce((prev, curr) => {
      const prevDist = Math.abs((prev - modulationInterval + 12) % 12)
      const currDist = Math.abs((curr - modulationInterval + 12) % 12)
      return currDist < prevDist ? curr : prev
    })

    // Apply modulation if it's meaningful
    if (closestInterval <= 7) {
      state.pendingModulation = closestInterval
      // console.log(`🎵 User input suggests modulation: ${closestInterval} semitones`)
    }
  }

  /**
   * Trigger immediate background evolution based on user input
   */
  triggerImmediateBackgroundEvolution() {
    if (!this.generativeState || !this.ambientLayers) return

    const state = this.generativeState

    // Apply pending modulation if exists
    if (state.pendingModulation) {
      const frequencyRatio = Math.pow(2, state.pendingModulation / 12)
      state.currentTonic *= frequencyRatio
      state.currentTonic = Math.max(110, Math.min(440, state.currentTonic))
      state.pendingModulation = null
      // console.log(`🎵 Applied user-driven modulation: new tonic=${state.currentTonic.toFixed(1)}Hz`)
    }

    // Update scale based on user complexity preferences
    if (state.complexity > 0.7) {
      // High complexity: add chromatic notes
      if (state.currentScale.length === 5) {
        state.currentScale = [0, 2, 4, 7, 9, 11] // Add 7th
      }
    } else if (state.complexity < 0.3) {
      // Low complexity: simplify to pentatonic
      state.currentScale = [0, 2, 4, 7, 9]
    }

    // Background layers now evolve automatically through playLayer() composition loop
    // No need to trigger immediate regeneration
    // console.log(`🎵 User influence applied to generative state`)
  }

  /**
   * Trigger background filter response - DISABLED
   * Ambient filters controlled by composition system only.
   * @deprecated
   * @param {number} frequency - Unused
   * @param {number} duration - Unused
   */
  triggerBackgroundFilterResponse(frequency, duration) {
    // Disabled - ambient filters controlled by composition only
  }

  
  /**
   * Setup remote LFO for filter cutoff modulation
   * @param {number} speed - LFO frequency in Hz (0.1 to 10Hz)
   * @param {number} amplitude - LFO amplitude (0.0 to 1.0)
   */
  setupRemoteFilterLFO(speed, amplitude) {
    // DISABLED: Remote filter LFO functionality removed - stub for backward compatibility
  }

  /**
   * Calculate modulation scaling based on user count
   * @param {number} userCount - Number of active users
   * @returns {number} Scaling multiplier
   */
  calculateModulationScaling(userCount) {
    if (userCount === 1) {
      return 3.0 // 3x amplitude for single user
    } else if (userCount === 2) {
      return 2.0 // 2x amplitude for 2 users
    } else if (userCount <= 4) {
      return 1.5 // 1.5x amplitude for 3-4 users
    } else if (userCount <= 8) {
      return 1.2 // 1.2x amplitude for 5-8 users
    } else {
      return 1.0 // No scaling for 9+ users
    }
  }

  /**
   * Update active remote users tracking
   * @param {string} userId - User ID to track
   * @param {boolean} isActive - Whether user is active
   */
  updateActiveRemoteUser(userId, isActive = true) {
    if (isActive) {
      this.activeRemoteUsers.add(userId)
      this.lastUserCountUpdate = Date.now()
    } else {
      this.activeRemoteUsers.delete(userId)
    }

    // Clean up old users (remove inactive users after 10 seconds)
    const now = Date.now()
    if (now - this.lastUserCountUpdate > 10000) {
      // Could implement cleanup logic here if needed
      this.lastUserCountUpdate = now
    }

    // console.log(`👥 Active remote users: ${this.activeRemoteUsers.size}`)
  }

  /**
   * Connect LFO directly to all relevant filters (bypassing gain nodes)
   */
  connectLFOToFiltersDirect() {
    if (!this.remoteFilterLFO) return

    // Clear existing connections
    this.remoteLFOTargetFilters.clear()

    // Entry #109: gestureFilter removed

    // Connect directly to ambient filter frequencies
    if (this.ambientFilters) {
      Object.keys(this.ambientFilters).forEach(layerName => {
        const filter = this.ambientFilters[layerName]
        if (filter && filter.frequency) {
          this.remoteFilterLFO.connect(filter.frequency)
          this.remoteLFOTargetFilters.add(layerName)
        }
      })
      // console.log(`🔗 Remote LFO connected directly to ${Object.keys(this.ambientFilters).length} ambient filters`)
    }

    // console.log(`🔗 Remote LFO directly connected to ${this.remoteLFOTargetFilters.size} total filters`)
  }

  /**
   * Connect LFO to all relevant filters 
   */
  connectLFOToFilters() {
    if (!this.remoteFilterLFO) return

    // Entry #109: gestureFilter removed

    // Connect to ambient filters
    if (this.ambientFilters) {
      Object.keys(this.ambientFilters).forEach(layerName => {
        const filter = this.ambientFilters[layerName]
        if (filter && filter.frequency) {
          const lfoGain = new Tone.Gain(1).connect(filter.frequency)
          this.remoteFilterLFO.connect(lfoGain)
          this.remoteLFOTargetFilters.add(lfoGain)
        }
      })
    }

    // console.log(`🔗 Remote LFO connected to ${this.remoteLFOTargetFilters.size} filters`)
  }

  /**
   * Stop remote filter LFO
   */
  stopRemoteFilterLFO() {
    // DISABLED: Remote filter LFO functionality removed - stub for backward compatibility
  }

  /**
   * Apply tremolo effect to gesture synth for remote modulation high range
   * @param {number} amount - Tremolo amount (0-1)
   * @param {number} currentTime - Current audio context time
   */
  applyTremolo(amount, currentTime = Tone.now()) {
    // DISABLED: Tremolo functionality removed - stub for backward compatibility
  }


  /**
   * Test filter modulation with a dramatic sweep
   * Call this method to verify filter modulation is working
   */
  testFilterModulation() {
    if (!this.isInitialized || !this.ambientFilters) {
      // console.warn('Cannot test filter modulation - not initialized')
      return
    }

    // console.log('🧪 Starting filter modulation test...')

    // Create a dramatic filter sweep over 2 seconds
    const startTime = Tone.now()
    const endTime = startTime + 2

    // Sweep all filters from low to high frequency
    Object.keys(this.ambientFilters).forEach(layerName => {
      const filter = this.ambientFilters[layerName]

      // Start at low frequency
      filter.frequency.setValueAtTime(100, startTime)

      // Sweep to high frequency
      filter.frequency.linearRampToValueAtTime(5000, endTime)

      // console.log(`🧪 ${layerName} filter sweep: 100Hz → 5000Hz over 2 seconds`)
    })

    // Entry #109: gestureFilter removed

    // console.log('🧪 Filter test initiated - you should hear dramatic filter sweeps opening up')
  }

  /**
   * Force start background music if it's not playing
   * REAL-TIME FIX: Uses Transport.schedule for proper audio timing
   */
  forceStartBackground() {
    if (!this.isInitialized || !this.ambientLayers) {
      return
    }

    if (this.muted) {
      return
    }

    try {
      // Ensure Transport is running
      if (Tone.Transport.state !== 'started') {
        Tone.Transport.start()
      }

      // Entry #201: Use Transport.seconds for Transport.schedule()
      const now = Tone.Transport.seconds
      const lookahead = 0.1
      const layerNames = Object.keys(this.ambientLayers)

      // Force play notes on each layer using for loops (no allocation)
      for (let layerIdx = 0; layerIdx < layerNames.length; layerIdx++) {
        const layer = layerNames[layerIdx]
        // Entry #90: Skip if layer is disabled by audio profile settings
        if (!this._isLayerEnabled(layer)) continue
        const synth = this.ambientLayers[layer]
        if (!synth) continue

        const state = this.generativeState
        if (!state) continue

        // Select notes based on layer type
        let notes = []
        switch (layer) {
          case 'bass':
            notes = [state.currentTonic, state.currentTonic * 0.75]
            break
          case 'pad':
            notes = [state.currentTonic * 1.25, state.currentTonic * 1.5]
            break
          case 'chords':
            notes = [state.currentTonic * 2, state.currentTonic * 2.5]
            break
        }

        // REAL-TIME FIX: Schedule notes with Transport for precise timing
        for (let i = 0; i < notes.length; i++) {
          const freq = notes[i]
          const staggerDelay = i * 0.2 // 200ms stagger
          const scheduleTime = now + lookahead + staggerDelay

          // Schedule attack
          const attackEventId = Tone.Transport.schedule((audioTime) => {
            try {
              synth.triggerAttack(freq, audioTime, 0.2)
            } catch (e) {
              // Ignore errors
            }
          }, scheduleTime)
          this.scheduledTransportEvents.push(attackEventId)

          // Schedule release 3 seconds after attack
          const releaseEventId = Tone.Transport.schedule((audioTime) => {
            try {
              synth.triggerRelease(freq, audioTime)
            } catch (e) {
              // Ignore errors
            }
          }, scheduleTime + 3)
          this.scheduledTransportEvents.push(releaseEventId)
        }
      }

      // If evolution is not active, restart it
      if (!this.evolvingGenerationActive) {
        this.evolvingGenerationActive = true
        this.startEvolvingGeneration()
      }

    } catch (error) {
      // Silently handle errors
    }
  }

  /**
   * Convert MIDI note number to frequency
   * @param {number} midiNote - MIDI note number (0-127)
   * @returns {number} Frequency in Hz
   */
  midiNoteToFrequency(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12)
  }

  /**
   * Map color to frequency based on 10-color pool
   * @param {string} color - Hex color (#rrggbb)
   * @returns {number|null} Frequency in Hz (200-800) or null if invalid
   */
  mapColorToFrequency(color) {
    if (!color || typeof color !== 'string') {
      return null
    }

    // Normalize color to lowercase
    const normalizedColor = color.toLowerCase()

    // Find color index in pool
    const colorIndex = this.colorPool.findIndex(c => c.toLowerCase() === normalizedColor)

    if (colorIndex === -1) {
      // console.warn('AudioService: Color not in pool', color)
      return null
    }

    // Map index (0-9) to frequency (200-800Hz)
    const { min, max } = this.colorFrequencyRange
    const frequency = min + (colorIndex / (this.colorPool.length - 1)) * (max - min)

    return frequency
  }

  /**
   * Set mute state (FR-011)
   * Controls master volume node in real-time
   * @param {boolean} muted - True to mute, false to unmute
   */
  setMuted(muted) {
    // Delegate to VolumeController (Sprint 2 refactoring)
    this.volumeController.setMuted(muted)

    // Update deprecated state for backward compatibility
    this.muted = this.volumeController.isMuted()
  }

  /**
   * Set volume level (FR-011)
   * Controls master volume node in real-time
   * @param {number} volume - Volume level (0-1)
   */
  setVolume(volume) {
    // Delegate to VolumeController (Sprint 2 refactoring)
    this.volumeController.setVolume(volume)

    // Update deprecated state for backward compatibility
    this.volume = this.volumeController.getVolume()
  }

  /**
   * Get current mute state
   * @returns {boolean} True if muted
   */
  isMuted() {
    // Delegate to VolumeController (Sprint 2 refactoring)
    return this.volumeController.isMuted()
  }

  /**
   * Get current volume level
   * @returns {number} Volume (0-1)
   */
  getVolume() {
    // Delegate to VolumeController (Sprint 2 refactoring)
    return this.volumeController.getVolume()
  }

  /**
   * Process gesture and generate real-time audio parameters
   * @param {Object} gestureData - Normalized gesture data
   * @returns {Object} Audio parameters for immediate feedback
   */
  processGestureAudio(gestureData) {
    if (!this.isInitialized) {
      // console.warn('AudioService not initialized')
      return null
    }

    const startTime = performance.now()

    try {
      // Add gesture to buffer for interpolation
      this.addGestureToBuffer(gestureData)

      // Generate audio parameters from gesture
      const audioParams = this.mapGestureToAudio(gestureData)

      // Update current parameter state
      this.updateCurrentParameters(audioParams)

      // Calculate processing latency
      const processingLatency = performance.now() - startTime

      // Track performance metrics
      this.updatePerformanceMetrics(processingLatency)

      // Constitutional requirement check
      if (processingLatency > 200) {
        // console.warn(`Gesture-to-audio latency ${processingLatency}ms exceeds 200ms constitutional requirement`)
      }

      return {
        ...audioParams,
        processingLatency,
        timestamp: Date.now()
      }

    } catch (error) {
      // console.error('Error processing gesture audio:', error)
      return null
    }
  }

  /**
   * Map gesture data to audio parameters
   * @param {Object} gestureData - Gesture data
   * @returns {Object} Audio parameters
   */
  mapGestureToAudio(gestureData) {
    const { type, coordinates, intensity } = gestureData

    // Base parameter calculation
    let audioParams = {
      frequency: this.mapCoordinateToParameter('frequency', coordinates.x),
      amplitude: this.mapIntensityToParameter('amplitude', intensity),
      waveform: this.selectWaveformFromGesture(gestureData),
      filter: this.generateFilterFromCoordinates(coordinates),
      envelope: this.generateEnvelopeFromGesture(gestureData),
      spatialParams: this.generateSpatialParameters(coordinates)
    }

    // Device-specific parameter adjustments
    audioParams = this.applyDeviceSpecificMappings(audioParams, type)

    // Apply parameter smoothing
    audioParams = this.applySmoothingToParameters(audioParams)

    return audioParams
  }

  /**
   * Map coordinate to parameter using configured mapping
   * @param {string} parameterName - Parameter to map
   * @param {number} value - Input value (0-1)
   * @returns {number} Mapped parameter value
   */
  mapCoordinateToParameter(parameterName, value) {
    const mapping = this.parameterMappings[parameterName]
    if (!mapping) return value

    const [min, max] = mapping.range

    let mappedValue
    switch (mapping.curve) {
      case 'exponential':
        mappedValue = min + (max - min) * Math.pow(value, 2)
        break
      case 'logarithmic':
        mappedValue = min + (max - min) * Math.log(value * 9 + 1) / Math.log(10)
        break
      case 'linear':
      default:
        mappedValue = min + (max - min) * value
        break
    }

    return mappedValue
  }

  /**
   * Map intensity to amplitude parameter
   * @param {string} parameterName - Parameter name
   * @param {number} intensity - Gesture intensity (0-1)
   * @returns {number} Mapped amplitude
   */
  mapIntensityToParameter(parameterName, intensity) {
    const mapping = this.parameterMappings[parameterName]
    if (!mapping) return intensity

    const [min, max] = mapping.range

    // Exponential curve for more natural volume response
    const mappedValue = min + (max - min) * Math.pow(intensity, 1.5)

    return Math.max(min, Math.min(max, mappedValue))
  }

  /**
   * Select waveform based on gesture characteristics
   * @param {Object} gestureData - Gesture data
   * @returns {string} Waveform type
   */
  selectWaveformFromGesture(gestureData) {
    const { type, intensity, coordinates } = gestureData

    // Device-based waveform selection
    switch (type) {
      case 'mouse':
        // Mouse gestures: smooth waveforms for precise control
        return coordinates.y > 0.6 ? 'sine' : 'triangle'

      case 'touch':
        // Touch gestures: more organic waveforms
        if (intensity > 0.8) return 'square'
        if (intensity > 0.5) return 'sawtooth'
        return 'triangle'

      case 'gyroscope':
        // Gyroscope: textural waveforms
        if (coordinates.z > 0.7) return 'sawtooth'
        if (coordinates.z < 0.3) return 'triangle'
        return 'sine'

      default:
        return 'sine'
    }
  }

  /**
   * Generate filter parameters from coordinates
   * @param {Object} coordinates - Gesture coordinates
   * @returns {Object} Filter parameters
   */
  generateFilterFromCoordinates(coordinates) {
    const { x, y, z } = coordinates

    let filterType = 'none'
    let cutoffFrequency = 1000
    let resonance = 1

    // Y coordinate determines filter type and cutoff
    if (y < 0.3) {
      filterType = 'lowpass'
      cutoffFrequency = this.mapCoordinateToParameter('filter', x)
      resonance = 1 + (0.3 - y) * 20 // Higher resonance for lower Y
    } else if (y > 0.7) {
      filterType = 'highpass'
      cutoffFrequency = this.mapCoordinateToParameter('filter', x) * 0.5
      resonance = 1 + (y - 0.7) * 10 // Higher resonance for higher Y
    } else if (x > 0.4 && x < 0.6) {
      filterType = 'bandpass'
      cutoffFrequency = this.mapCoordinateToParameter('filter', y)
      resonance = 2 + Math.abs(x - 0.5) * 10
    }

    // Z coordinate (gyroscope) modulates filter sweep
    if (z !== undefined) {
      cutoffFrequency *= (0.5 + z * 0.5) // 0.5x to 1.0x modulation
    }

    return {
      type: filterType,
      cutoffFrequency: Math.max(100, Math.min(4000, cutoffFrequency)),
      resonance: Math.max(0.1, Math.min(20, resonance))
    }
  }

  /**
   * Generate envelope parameters from gesture characteristics
   * @param {Object} gestureData - Gesture data
   * @returns {Object} ADSR envelope parameters
   */
  generateEnvelopeFromGesture(gestureData) {
    const { type, intensity, coordinates } = gestureData

    let envelope = {
      attack: 0.1,
      decay: 0.2,
      sustain: 0.7,
      release: 0.5
    }

    // Adjust envelope based on gesture type
    switch (type) {
      case 'touch':
        // Touch: quick attack, variable sustain
        envelope.attack = 0.01 + intensity * 0.1
        envelope.sustain = Math.max(0.3, intensity)
        envelope.release = 0.2 + (1 - intensity) * 0.5
        break

      case 'mouse':
        // Mouse: smooth envelopes
        envelope.attack = 0.05 + coordinates.y * 0.2
        envelope.decay = 0.1 + coordinates.x * 0.3
        envelope.sustain = 0.5 + intensity * 0.4
        envelope.release = 0.3 + (1 - coordinates.y) * 0.4
        break

      case 'gyroscope':
        // Gyroscope: atmospheric envelopes
        envelope.attack = 0.2 + coordinates.z * 0.3
        envelope.decay = 0.3 + coordinates.x * 0.2
        envelope.sustain = 0.7 + coordinates.y * 0.2
        envelope.release = 0.5 + coordinates.z * 0.5
        break
    }

    // Clamp values to reasonable ranges
    envelope.attack = Math.max(0.001, Math.min(2.0, envelope.attack))
    envelope.decay = Math.max(0.001, Math.min(2.0, envelope.decay))
    envelope.sustain = Math.max(0.0, Math.min(1.0, envelope.sustain))
    envelope.release = Math.max(0.001, Math.min(3.0, envelope.release))

    return envelope
  }

  /**
   * Generate spatial audio parameters
   * @param {Object} coordinates - Gesture coordinates
   * @returns {Object} Spatial parameters
   */
  generateSpatialParameters(coordinates) {
    const { x, y, z } = coordinates

    return {
      pan: this.mapCoordinateToParameter('pan', x),
      distance: y, // Y coordinate as distance (0 = near, 1 = far)
      reverbAmount: Math.max(0, Math.min(1, y * 0.8)), // More reverb for distant sounds
      elevation: z !== undefined ? (z * 2) - 1 : 0 // Z as elevation (-1 to +1)
    }
  }

  /**
   * Apply device-specific parameter mappings
   * @param {Object} audioParams - Base audio parameters
   * @param {string} deviceType - Device type
   * @returns {Object} Adjusted parameters
   */
  applyDeviceSpecificMappings(audioParams, deviceType) {
    const adjusted = { ...audioParams }

    switch (deviceType) {
      case 'touch':
        // Touch devices: boost dynamics for finger interaction
        adjusted.amplitude *= 1.2
        adjusted.filter.resonance *= 1.1
        break

      case 'gyroscope':
        // Gyroscope: smoother transitions for motion control
        adjusted.envelope.attack *= 1.5
        adjusted.envelope.release *= 1.3
        break

      case 'mouse':
        // Mouse: precise control, no adjustment needed
        break
    }

    return adjusted
  }

  /**
   * Apply smoothing to parameters to reduce jitter
   * @param {Object} audioParams - New parameters
   * @returns {Object} Smoothed parameters
   */
  applySmoothingToParameters(audioParams) {
    const smoothed = {}

    Object.keys(audioParams).forEach(key => {
      if (typeof audioParams[key] === 'number') {
        const smoothingFactor = this.parameterMappings[key]?.smoothing || 0.1
        const currentValue = this.currentParameters[key] || audioParams[key]

        smoothed[key] = currentValue + (audioParams[key] - currentValue) * smoothingFactor
      } else {
        smoothed[key] = audioParams[key]
      }
    })

    return smoothed
  }

  /**
   * Add gesture to buffer for interpolation
   * @param {Object} gestureData - Gesture data
   */
  addGestureToBuffer(gestureData) {
    this.gestureBuffer.push({
      ...gestureData,
      bufferTimestamp: performance.now()
    })

    // Limit buffer size
    if (this.gestureBuffer.length > this.maxBufferSize) {
      this.gestureBuffer.shift()
    }
  }

  /**
   * Update current parameter state
   * @param {Object} newParams - New parameter values
   */
  updateCurrentParameters(newParams) {
    // Deep merge parameters
    this.currentParameters = {
      ...this.currentParameters,
      ...newParams,
      filter: {
        ...this.currentParameters.filter,
        ...newParams.filter
      },
      envelope: {
        ...this.currentParameters.envelope,
        ...newParams.envelope
      },
      spatialParams: {
        ...this.currentParameters.spatialParams,
        ...newParams.spatialParams
      }
    }
  }

  /**
   * Start parameter update loop
   * REAL-TIME FIX: Uses Transport.scheduleRepeat instead of requestAnimationFrame
   * This ensures parameter updates are immune to main thread congestion
   */
  startUpdateLoop() {
    if (this.updateLoopActive) return

    this.updateLoopActive = true

    // Ensure Transport is running
    if (Tone.Transport.state !== 'started') {
      Tone.Transport.start()
    }

    // REAL-TIME FIX: Use Transport.scheduleRepeat (sufficient for audio params)
    // rAF runs at display refresh rate and competes with rendering workloads
    // Transport scheduling is on the audio thread and immune to main thread congestion
    // PERF: Entry #59 - Use platform-specific rate (20Hz for Chrome Windows, 30Hz default)
    // FIX: Use audioProfile.filterUpdateRate if set by user, otherwise platform default
    const filterUpdateHz = this.audioProfile?.filterUpdateRate
      || (typeof PlatformDetection !== 'undefined' ? PlatformDetection.getFilterUpdateRate() : 30)
    const updateInterval = 1 / filterUpdateHz

    this.parameterUpdateEventId = Tone.Transport.scheduleRepeat(() => {
      if (!this.updateLoopActive) return
      this.performParameterUpdate()
    }, updateInterval)

    // Track for cleanup
    this.scheduledTransportEvents.push(this.parameterUpdateEventId)
  }

  /**
   * Stop parameter update loop
   */
  stopUpdateLoop() {
    this.updateLoopActive = false

    // Clear the scheduled repeat event
    if (this.parameterUpdateEventId) {
      try {
        Tone.Transport.clear(this.parameterUpdateEventId)
      } catch (e) {
        // Event may already be cleared
      }
      this.parameterUpdateEventId = null
    }
  }

  /**
   * Initialize new musical architecture components
   */
  initializeNewMusicalArchitecture() {
    try {
      // Check if global classes are available
      if (typeof window.MusicalScheduler === 'undefined') {
        // console.warn('⚠️ MusicalScheduler not available - musical timing features disabled');
        return;
      }

      if (typeof window.LFOManager === 'undefined') {
        // console.warn('⚠️ LFOManager not available - modulation features disabled');
        return;
      }

      // Initialize Musical Scheduler
      this.musicalScheduler = new window.MusicalScheduler();

      // Initialize LFO Manager with audio context
      this.lfoManager = new window.LFOManager(this);

      // Start Musical Scheduler
      this.musicalScheduler.start();

      // Setup event listeners for cross-service communication
      this.setupMusicalArchitectureEvents();

      // console.log('🎵 New musical architecture initialized - MusicalScheduler and LFOManager active');
    } catch (error) {
      // console.error('🔴 Failed to initialize new musical architecture:', error);
    }
  }

  /**
   * Setup cross-service event communication
   */
  setupMusicalArchitectureEvents() {
    // Musical Scheduler events
    this.musicalScheduler.on('tick', (data) => {
      // Use musical timing for precise parameter updates
      this.onMusicalTick(data);
    });

    this.musicalScheduler.on('beat', (data) => {
      // Trigger beat-synchronized effects
      this.onMusicalBeat(data);
    });

    // LFO Manager events
    this.lfoManager.on('lfo:remote-sync', (data) => {
      // Handle remote LFO synchronization
      this.onRemoteLFOSync(data);
    });
  }

  /**
   * Handle musical timing ticks
   */
  onMusicalTick(data) {
    // Update timing-sensitive parameters on musical boundaries
    if (data.sixteenth === 0) {
      // Reset or evolve parameters on beat boundaries
      this.evolveParametersOnBeat(data);
    }
  }

  /**
   * Handle musical beats
   * Entry #60: Removed downbeat emphasis - effect was imperceptible
   */
  onMusicalBeat() {
    // Entry #60: Downbeat emphasis removed - was imperceptible, just wasted CPU
  }

  /**
   * Handle remote LFO synchronization
   */
  onRemoteLFOSync(data) {
    // Apply remote modulation effects
    this.applyRemoteModulation(data);
  }

  /**
   * Evolve parameters on musical beat boundaries
   */
  evolveParametersOnBeat(data) {
    // Slowly evolve background parameters
    if (this.generativeState) {
      // Evolve ambient parameters slightly on each beat
      this.evolveAmbientParameters(data.beat, data.bar);
    }
  }

  /**
   * Apply remote modulation from LFOManager
   */
  applyRemoteModulation(data) {
    // Apply modulation to appropriate audio parameters
    if (data.data.modulation && this.isInitialized) {
      const { target, amount } = data.data.modulation;

      switch (target) {
        case 'filter':
          this.applyRemoteFilterModulation(amount);
          break;
        case 'volume':
          this.applyRemoteVolumeModulation(amount);
          break;
        case 'pan':
          this.applyRemotePanModulation(amount);
          break;
      }
    }
  }

  /**
   * Schedule a musical event with clock-consistent timing
   */
  scheduleMusicalEvent(callback, data, isRemote = false, timestamp = null) {
    if (!this.musicalScheduler) {
      // Fallback to direct execution if scheduler not available
      callback(data);
      return;
    }

    if (isRemote) {
      return this.musicalScheduler.scheduleRemoteEvent(callback, data, timestamp);
    } else {
      return this.musicalScheduler.scheduleLocalEvent(callback, data);
    }
  }

  /**
   * Handle hover start with LFO integration
   */
  handleHoverStart(gestureData, targetInstrument = 'filter') {
    if (!this.lfoManager) return null;

    // Create LFO based on hover gesture
    const lfoId = this.lfoManager.handleLocalHoverStart(gestureData, targetInstrument);

    // console.log(`🎛️ Hover start - LFO created: ${lfoId}`);
    return lfoId;
  }

  /**
   * Handle hover update with LFO integration
   */
  handleHoverUpdate(gestureData, lfoId) {
    if (!this.lfoManager || !lfoId) return;

    this.lfoManager.handleLocalHoverUpdate(gestureData, lfoId);
  }

  /**
   * Handle hover end with LFO cleanup
   */
  handleHoverEnd(gestureData) {
    if (!this.lfoManager) return;

    const sourceId = `local_${gestureData.gestureId}`;
    this.lfoManager.handleLocalHoverEnd(sourceId);
  }

  /**
   * Process remote hover data for synchronized LFOs
   */
  processRemoteHoverData(remoteData) {
    if (!this.lfoManager) return;

    this.lfoManager.handleRemoteHoverData(remoteData);
  }

  /**
   * Create ambient global LFO
   */
  createAmbientLFO(config = {}) {
    if (!this.lfoManager) return null;

    return this.lfoManager.createGlobalLFO({
      ...config,
      target: config.target || 'filter',
      name: config.name || 'ambient'
    });
  }

  /**
   * Get musical timing status
   */
  getMusicalTimingStatus() {
    return {
      scheduler: this.musicalScheduler ? this.musicalScheduler.getStatus() : null,
      lfoManager: this.lfoManager ? this.lfoManager.getStatus() : null,
      isInitialized: !!(this.musicalScheduler && this.lfoManager)
    };
  }

  /**
   * Apply remote filter modulation
   */
  applyRemoteFilterModulation(amount) {
    // Entry #109: gestureFilter removed - no-op for API compatibility
  }

  /**
   * Apply remote volume modulation
   */
  applyRemoteVolumeModulation(amount) {
    if (this.masterVolume && this.masterVolume.gain) {
      const currentVolume = this.masterVolume.gain.value;
      const modulationRange = currentVolume * 0.2; // 20% modulation range
      const newVolume = Math.max(0.1, currentVolume + (amount * modulationRange));
      this.masterVolume.gain.rampTo(newVolume, 0.05);
    }
  }

  /**
   * Apply remote pan modulation
   */
  applyRemotePanModulation(amount) {
    if (this.gestureSynth && this.gestureSynth.pan) {
      this.gestureSynth.pan.rampTo(amount, 0.1);
    }
  }

  /**
   * Evolve ambient parameters on beat boundaries
   */
  evolveAmbientParameters(beat, bar) {
    if (this.ambientFilters && this.ambientFilters.length > 0) {
      // Slowly evolve filter frequencies
      this.ambientFilters.forEach((filter, index) => {
        if (filter && filter.frequency) {
          const currentFreq = filter.frequency.value;
          const evolution = Math.sin((bar + beat + index) * 0.1) * 50;
          filter.frequency.rampTo(currentFreq + evolution, 0.5);
        }
      });
    }
  }

  /**
   * Perform parameter update for current frame
   */
  performParameterUpdate() {
    // DISABILITATO: Update loop potrebbe causare tremoli non necessari
    // if (!this.audioEngine || this.gestureBuffer.length === 0) return
    return // Completamente disabilitato per prevenire tremoli

    /*
    try {
      // Interpolate parameters from gesture buffer
      const interpolatedParams = this.interpolateParametersFromBuffer()

      // Send parameters to audio engine
      if (this.audioEngine.updateSonicParameters) {
        this.audioEngine.updateSonicParameters(interpolatedParams)
      }

      this.performanceMetrics.totalUpdates++

    } catch (error) {
      // console.error('Parameter update failed:', error)
      this.performanceMetrics.droppedUpdates++
    }
    */
  }

  /**
   * Interpolate parameters from gesture buffer
   * @returns {Object} Interpolated parameters
   */
  interpolateParametersFromBuffer() {
    if (this.gestureBuffer.length === 0) {
      return this.currentParameters
    }

    // Use most recent gesture for now (could implement smoother interpolation)
    const recentGesture = this.gestureBuffer[this.gestureBuffer.length - 1]
    return this.mapGestureToAudio(recentGesture)
  }

  /**
   * Update performance metrics
   * @param {number} latency - Processing latency
   */
  updatePerformanceMetrics(latency) {
    this.performanceMetrics.gestureToSoundLatency.push(latency)

    // Keep only recent measurements
    if (this.performanceMetrics.gestureToSoundLatency.length > 100) {
      this.performanceMetrics.gestureToSoundLatency.shift()
    }

    // Calculate average latency
    this.performanceMetrics.averageLatency =
      this.performanceMetrics.gestureToSoundLatency.reduce((a, b) => a + b, 0) /
      this.performanceMetrics.gestureToSoundLatency.length

    // Track maximum latency
    this.performanceMetrics.maxLatency = Math.max(
      this.performanceMetrics.maxLatency,
      latency
    )
  }

  /**
   * Get current parameter state
   * @returns {Object} Current parameters
   */
  getCurrentParameters() {
    return { ...this.currentParameters }
  }

  /**
   * Update parameter mapping configuration
   * @param {string} parameter - Parameter name
   * @param {Object} mapping - Mapping configuration
   */
  updateParameterMapping(parameter, mapping) {
    if (this.parameterMappings[parameter]) {
      this.parameterMappings[parameter] = {
        ...this.parameterMappings[parameter],
        ...mapping
      }
      // console.log(`Updated ${parameter} mapping:`, this.parameterMappings[parameter])
    }
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance metrics
   */
  getPerformanceStats() {
    return {
      ...this.performanceMetrics,
      updateLoopActive: this.updateLoopActive,
      bufferSize: this.gestureBuffer.length,
      audioContextState: this.audioContextState
    }
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceStats() {
    this.performanceMetrics = {
      gestureToSoundLatency: [],
      averageLatency: 0,
      maxLatency: 0,
      parameterUpdatesPerSecond: 0,
      droppedUpdates: 0,
      totalUpdates: 0
    }
    // console.log('AudioService performance metrics reset')
  }


  /**
   * Apply filter modulation with proper validation
   * @param {Object} filterParams - Filter modulation parameters
   */
  applyFilterModulation(filterParams) {
    try {
      // Reduce console log frequency to prevent spam
      const now = Date.now()
      if (now - (this.lastFilterLogTime || 0) > 1000) {
        // console.log('🎛️ Applying filter modulation:', filterParams)
        this.lastFilterLogTime = now
      }

      // Validate Tone context is ready
      if (!Tone.context || !Tone.context.currentTime) {
        // console.warn('🔇 Tone context not ready for filter modulation')
        return
      }

      // Handle both parameter naming conventions: frequency or cutoffFrequency
      const cutoffFrequency = filterParams.frequency || filterParams.cutoffFrequency
      const resonance = filterParams.resonance

      // Validate we have valid parameters
      if (cutoffFrequency === null || cutoffFrequency === undefined) {
        // console.warn('🔇 Invalid cutoff frequency for filter modulation')
        return
      }

      // Apply to ambient filters (for hover modulation) - FIX: use plural variable name
      if (this.ambientFilters) {
        Object.keys(this.ambientFilters).forEach(layerName => {
          const filter = this.ambientFilters[layerName]
          if (filter && filter.frequency && typeof filter.frequency.exponentialRampToValueAtTime === 'function') {
            // Apply different frequency ranges for each layer
            let targetFrequency = cutoffFrequency
            if (layerName === 'bass') {
              targetFrequency = Math.max(50, Math.min(500, cutoffFrequency * 0.3)) // Bass range
            } else if (layerName === 'pad') {
              targetFrequency = Math.max(150, Math.min(2000, cutoffFrequency * 0.8)) // Pad range
            } else if (layerName === 'chords') {
              targetFrequency = Math.max(200, Math.min(4000, cutoffFrequency * 1.5)) // Chords range
            }

            // Use smooth transitions instead of immediate changes to prevent audio artifacts
            const rampTime = 0.1 // 100ms smooth transition
            filter.frequency.linearRampToValueAtTime(targetFrequency, Tone.context.currentTime + rampTime)

            // Apply resonance if available with smooth transition
            if (filter.Q && resonance && typeof filter.Q.linearRampToValueAtTime === 'function') {
              let resonanceValue = resonance
              if (layerName === 'bass') {
                resonanceValue = resonance * 1.5 // Subtle bass resonance
              } else if (layerName === 'pad') {
                resonanceValue = resonance * 2 // Moderate pad resonance
              } else if (layerName === 'chords') {
                resonanceValue = resonance * 2.5 // Strong chords resonance
              }

              const clampedResonance = Math.max(0.1, Math.min(10, resonanceValue))
              filter.Q.linearRampToValueAtTime(clampedResonance, Tone.context.currentTime + rampTime)
            }
          }
        })
      }

      // Apply to ambient pads (if they exist)
      if (this.audioEngine && this.audioEngine.voices && this.audioEngine.voices.ambient) {
        Object.values(this.audioEngine.voices.ambient).forEach(voice => {
          if (voice.filter && voice.filter.frequency && typeof voice.filter.frequency.setValueAtTime === 'function') {
            // Map cutoff frequency to appropriate range (200-8000 Hz)
            const cutoffRange = cutoffFrequency * 80 + 200 // 0-1 to 200-8000Hz
            voice.filter.frequency.setValueAtTime(cutoffRange, Tone.context.currentTime)

            // Apply resonance if available
            if (voice.filter.Q && resonance && typeof voice.filter.Q.setValueAtTime === 'function') {
              const resonanceRange = resonance * 15 // 0-1 to 0-15
              voice.filter.Q.setValueAtTime(resonanceRange, Tone.context.currentTime)
            }
          }
        })
        // console.log('✨ Applied filter to ambient voices')
      }

      // Apply to gesture voices
      if (this.audioEngine && this.audioEngine.voices && this.audioEngine.voices.gesture) {
        Object.values(this.audioEngine.voices.gesture).forEach(voice => {
          if (voice.filter && voice.filter.frequency && typeof voice.filter.frequency.setValueAtTime === 'function') {
            const cutoffRange = cutoffFrequency * 80 + 200
            voice.filter.frequency.setValueAtTime(cutoffRange, Tone.context.currentTime)

            if (voice.filter.Q && resonance && typeof voice.filter.Q.setValueAtTime === 'function') {
              const resonanceRange = resonance * 15
              voice.filter.Q.setValueAtTime(resonanceRange, Tone.context.currentTime)
            }
          }
        })
        // console.log('✨ Applied filter to gesture voices')
      }

      // Entry #109: gestureFilter removed

      // Also apply to collaborative pattern voices if they exist
      if (this.audioEngine && this.audioEngine.collaborativePatterns) {
        this.audioEngine.collaborativePatterns.forEach(pattern => {
          if (pattern.oscillator && pattern.filter && pattern.filter.frequency && typeof pattern.filter.frequency.setValueAtTime === 'function') {
            const cutoffRange = cutoffFrequency * 80 + 200
            pattern.filter.frequency.setValueAtTime(cutoffRange, Tone.context.currentTime)

            if (pattern.filter.Q && resonance && typeof pattern.filter.Q.setValueAtTime === 'function') {
              const resonanceRange = resonance * 15
              pattern.filter.Q.setValueAtTime(resonanceRange, Tone.context.currentTime)
            }
          }
        })
        // console.log('✨ Applied filter to collaborative patterns')
      }

    } catch (error) {
      // console.error('❌ Filter modulation failed:', error)
    }
  }

  /**
   * Check if two pattern arrays are equal (for duplicate prevention)
   * @param {Array} patterns1 - First pattern array
   * @param {Array} patterns2 - Second pattern array
   * @returns {boolean} True if patterns are effectively the same
   */
  arePatternsEqual(patterns1, patterns2) {
    if (!patterns1 || !patterns2) return false
    if (patterns1.length !== patterns2.length) return false

    return patterns1.every((pattern1, index) => {
      const pattern2 = patterns2[index]
      // Add more detailed logging to debug pattern values
      // console.log('🔍 Comparing patterns:', {
//        pattern1: { x: pattern1.x, y: pattern1.y, intensity: pattern1.intensity, frequency: pattern1.frequency },
//        pattern2: { x: pattern2.x, y: pattern2.y, intensity: pattern2.intensity, frequency: pattern2.frequency }
////      })
      return pattern1.x === pattern2.x &&
             pattern1.y === pattern2.y &&
             pattern1.intensity === pattern2.intensity &&
             pattern1.frequency === pattern2.frequency
    })
  }

  /**
   * Stop hover modulation when gesture ends
   * @param {string} userId - User ID to stop tracking
   */
  stopHoverModulation(userId) {
    // Stop tracking this user
    this.updateActiveRemoteUser(userId, false)

    // If no more active remote users, stop remote LFO
    if (this.activeRemoteUsers.size === 0) {
      this.stopRemoteFilterLFO()
      // console.log('🛑 Stopped remote LFO - no active users')
    }
  }

  /**
   * Reset filters to safe values that allow audio passage
   * Critical fix for when mouse exits canvas and audio disappears
   */
  resetFiltersToSafeValues() {
    if (!this.ambientFilters || !Tone.context) return

    const currentTime = Tone.context.currentTime

    // console.log('🔧 Resetting filters to safe values for audio continuation')

    // CRITICAL FIX: Stop any active tremolo LFO that could cause excessive modulation
    if (this.tremoloLFO) {
      // console.log('🛑 STOPPING tremoloLFO - preventing excessive modulation')
      this.tremoloLFO.stop()
      this.tremoloLFO.dispose()
      this.tremoloLFO = null
    }

    // CRITICAL FIX: Stop the main lfoSystem that runs at 30Hz - this is likely the main tremolo source
    if (this.lfoSystem) {
      // console.log('🛑 STOPPING lfoSystem - preventing excessive 30Hz tremolo')
      this.lfoSystem.stop()
    }

    // Reset ambient filters to original values
    if (this.ambientFilters.bass) {
      this.ambientFilters.bass.frequency.linearRampToValueAtTime(150, currentTime + 0.1)
      this.ambientFilters.bass.Q.linearRampToValueAtTime(1, currentTime + 0.1)
      // console.log('🔧 Bass filter reset: 150Hz, Q=1')
    }

    if (this.ambientFilters.pad) {
      this.ambientFilters.pad.frequency.linearRampToValueAtTime(800, currentTime + 0.1)
      this.ambientFilters.pad.Q.linearRampToValueAtTime(1.5, currentTime + 0.1)
      // console.log('🔧 Pad filter reset: 800Hz, Q=1.5')
    }

    if (this.ambientFilters.chords) {
      this.ambientFilters.chords.frequency.linearRampToValueAtTime(2000, currentTime + 0.1)
      this.ambientFilters.chords.Q.linearRampToValueAtTime(2, currentTime + 0.1)
      // console.log('🔧 Chords filter reset: 2000Hz, Q=2')
    }

    // Entry #109: gestureFilter removed

    // CRITICAL FIX: Reset gesture synth volume to prevent tremolo from persisting
    if (this.gestureSynth && this.gestureSynth.volume) {
      this.gestureSynth.volume.value = 0 // Reset to equalized volume
      // console.log('🔧 Gesture synth volume reset to normal')
    }

    // Ensure background evolution continues
    if (!this.evolvingGenerationActive && this.isInitialized && !this.muted) {
      // console.log('🎵 Restarting background evolution after filter reset')
      this.evolvingGenerationActive = true
      this.startEvolvingGeneration()
    }
  }

  /**
   * Force stop ALL LFO systems (emergency cleanup)
   */
  forceStopAllLFO() {
    // console.log('🚨 FORCE STOPPING ALL LFO SYSTEMS')

    // Stop remote filter LFO
    this.stopRemoteFilterLFO()

    // Stop old tremolo LFO
    if (this.tremoloLFO) {
      this.tremoloLFO.stop()
      this.tremoloLFO.dispose()
      this.tremoloLFO = null
      // console.log('🛑 Stopped tremoloLFO')
    }

    // Stop old lfoSystem
    if (this.lfoSystem && this.lfoSystem.stop) {
      this.lfoSystem.stop()
      // console.log('🛑 Stopped lfoSystem')
    }

    // Clear hover timeout
    if (this.hoverTimeoutTimer) {
      clearTimeout(this.hoverTimeoutTimer)
      this.hoverTimeoutTimer = null
    }

    // console.log('✅ All LFO systems force stopped')
  }

  /**
   * Cleanup resources
   */



  /**
   * Apply unified modulation - DISABLED (Entry #105)
   * Aggregate filter modulation system removed for performance and simplicity.
   * Method kept as no-op for API compatibility.
   * @param {Object} modulationData - Ignored
   */
  applyUnifiedModulation(modulationData) {
    // Entry #105: Aggregate filter modulation completely removed
    // No-op for API compatibility
  }

  cleanup() {
    this.stopUpdateLoop()
    this.lfoSystem.stop()
    this.stopRemoteFilterLFO() // Stop remote filter LFO

    // Clear hover timeout timer
    if (this.hoverTimeoutTimer) {
      clearTimeout(this.hoverTimeoutTimer)
      this.hoverTimeoutTimer = null
    }

    // FORCE STOP any tremolo LFO that might be causing issues
    if (this.tremoloLFO) {
      // console.log('🛑 FORCE STOPPING tremoloLFO during cleanup')
      this.tremoloLFO.stop()
      this.tremoloLFO.dispose()
      this.tremoloLFO = null
    }

    // Cleanup new musical architecture services
    if (this.musicalScheduler && typeof this.musicalScheduler.dispose === 'function') {
      // console.log('🛑 Stopping MusicalScheduler')
      this.musicalScheduler.stop()
      this.musicalScheduler.dispose()
      this.musicalScheduler = null
    }

    if (this.lfoManager && typeof this.lfoManager.dispose === 'function') {
      // console.log('🛑 Disposing LFOManager')
      this.lfoManager.dispose()
      this.lfoManager = null
    }

    // Cleanup UserSynthManager - dispose all per-user synths
    if (this.userSynthManager && typeof this.userSynthManager.cleanupAll === 'function') {
      // console.log('🛑 Cleaning up UserSynthManager')
      this.userSynthManager.cleanupAll()
      this.userSynthManager = null
    }

    // SLEEP RECOVERY FIX: Remove event listeners added in constructor
    this._stopAudioHealthCheck()
    if (this._boundVisibilityHandler) {
      document.removeEventListener('visibilitychange', this._boundVisibilityHandler)
    }
    if (this._boundFocusHandler) {
      window.removeEventListener('focus', this._boundFocusHandler)
    }
    if (this._boundBlurHandler) {
      window.removeEventListener('blur', this._boundBlurHandler)
    }
    if (this._boundPageShowHandler) {
      window.removeEventListener('pageshow', this._boundPageShowHandler)
    }
    if (this._boundPageHideHandler) {
      window.removeEventListener('pagehide', this._boundPageHideHandler)
    }

    this.gestureBuffer = []
    this.audioEngine = null
    this.gestureCapture = null
    this.isInitialized = false

    // console.log('AudioService cleanup completed - all LFO and musical timing systems stopped')
  }

  /**
   * Update compositional parameters from collective metrics
   * Influences background generative system based on room activity
   * @param {Object} parameters - Compositional parameters from backend
   */
  updateCompositionalParameters(parameters) {
    if (!this.generativeState || !parameters) return

    // console.log('🎼 Updating generative system with collective parameters:', parameters)

    // Map scale type to actual scale
    const scales = {
      'pentatonic': [0, 2, 4, 7, 9],
      'major': [0, 2, 4, 5, 7, 9, 11],
      'minor': [0, 2, 3, 5, 7, 8, 10]
    }

    // Update scale if changed
    if (parameters.scaleType) {
      this.generativeState.currentScale = scales[parameters.scaleType] || scales['pentatonic']
    }

    // Update base octave (affects tonic frequency)
    if (parameters.baseOctave) {
      // Convert octave to frequency (C note)
      const baseFreq = 32.7 * Math.pow(2, parameters.baseOctave) // C0 = 32.7Hz
      this.generativeState.currentTonic = baseFreq
    }

    // Update complexity based on harmonic density (1-4 voices)
    if (parameters.harmonicDensity) {
      this.generativeState.complexity = Math.min(parameters.harmonicDensity / 4, 1)
    }

    // LAYER INFLUENCE: Rhythmic density affects layer rhythms
    if (parameters.rhythmicDensity !== undefined && this.generativeState.layers) {
      // Higher density = faster note generation
      const speedFactor = 1 + parameters.rhythmicDensity
      Object.keys(this.generativeState.layers).forEach(layerName => {
        const layer = this.generativeState.layers[layerName]
        // CRITICAL: Use PRIME NUMBERS to prevent rhythmic synchronization
        // Previous values (4000, 6000, 8000) were exact multiples → LCM=24000ms
        // All layers synchronized every 24 seconds creating "ta-taaaan" pattern
        const baseRhythm = {
          bass: 3700,   // PRIME-ISH: Ensures bass never aligns with others
          pad: 5300,    // PRIME: Completely independent rhythm
          chords: 7900  // PRIME: Maximum desynchronization
        }[layerName]
        layer.rhythm = baseRhythm / speedFactor
      })
    }

    // HARMONIC DENSITY: Affects chord complexity
    if (parameters.harmonicDensity !== undefined && this.generativeState) {
      // Higher density = more complex harmonies (could extend triads to 7ths)
      this.generativeState.complexity = 0.3 + parameters.harmonicDensity * 0.4
    }

    // ARTICULATION BIAS: Affects velocity
    if (parameters.articulationBias && this.generativeState.layers) {
      const velocityMap = {
        'staccato': 0.3,  // Lighter
        'marcato': 0.5,   // Medium
        'legato': 0.6     // Fuller
      }
      const baseVelocity = velocityMap[parameters.articulationBias] || 0.4
      Object.keys(this.generativeState.layers).forEach(layerName => {
        this.generativeState.layers[layerName].velocity = baseVelocity * (0.9 + Math.random() * 0.2)
      })
    }

    // Apply mode (influences harmonic progression choice)
    if (parameters.mode) {
      this.generativeState.mode = parameters.mode
    }

    // DELAY: Fixed at 200ms, no modulation (Entry #186)

    // console.log('🎵 Updated generative state:', {
//      scale: this.generativeState.currentScale,
//      tonic: this.generativeState.currentTonic.toFixed(1),
//      complexity: this.generativeState.complexity.toFixed(2),
//      bassRhythm: this.generativeState.layers.bass.rhythm.toFixed(0),
//      activeLayers: Object.keys(this.generativeState.layers).length,
//      delayTime: this.delay ? this.delay.delayTime.value.toFixed(2) : 'N/A',
//      delayFeedback: this.delay ? this.delay.feedback.value.toFixed(2) : 'N/A'
////    })
  }

  // ==================== Entry #28: Drone Activity Registration ====================

  /**
   * Register activity for drone void detection
   * Call this when any musical activity occurs (gesture start, note play, etc.)
   */
  registerDroneActivity() {
    if (this.droneVoidController) {
      this.droneVoidController.registerActivity()
    }
  }

  /**
   * Register a note starting for drone void detection
   * Call this when a note/sound starts playing
   * @param {string} noteId - Unique identifier for the note
   */
  registerDroneNoteStart(noteId) {
    if (this.droneVoidController) {
      this.droneVoidController.registerNoteStart(noteId)
    }
  }

  /**
   * Register a note ending for drone void detection
   * Call this when a note/sound stops playing
   * @param {string} noteId - Unique identifier for the note
   */
  registerDroneNoteEnd(noteId) {
    if (this.droneVoidController) {
      this.droneVoidController.registerNoteEnd(noteId)
    }
  }

  /**
   * Update user influence for drone void detection
   * @param {number} influence - 0-1 value representing activity level
   */
  updateDroneUserInfluence(influence) {
    if (this.droneVoidController) {
      this.droneVoidController.updateUserInfluence(influence)
    }
  }

  // ============================================================
  // SYNTH PRESET & PARAMETER CONTROL (Entry #SynthUI)
  // Allows users to select presets and customize their local synth
  // ============================================================

  /**
   * Select a preset and recreate the local gesture synth
   * @param {number} slot - Preset slot (0-10: 0-7 synth, 8-10 drum)
   * @returns {boolean} Success status
   */
  selectPreset(slot) {
    if (!window.PatchDefinitions) {
      console.error('[AudioService] PatchDefinitions not available')
      return false
    }

    // Verify audio routing nodes are initialized
    if (!this.gesturePan || !this.gestureVolume) {
      console.warn('[AudioService] Audio nodes not ready yet, deferring preset selection')
      return false
    }

    const patch = window.PatchDefinitions.REAL_USER_PATCHES[slot]
    if (!patch) {
      console.error(`[AudioService] Invalid preset slot: ${slot}`)
      return false
    }

    try {
      // Handle drum kit vs melodic synth
      if (patch.type === 'drum') {
        // Dispose melodic synth if switching to drums
        if (this.gestureSynth) {
          this.gestureSynth.disconnect()
          this.gestureSynth.dispose()
          this.gestureSynth = null
        }
        if (this.gestureFilter) {
          this.gestureFilter.disconnect()
          this.gestureFilter.dispose()
          this.gestureFilter = null
        }
        // Dispose previous drum kit if any
        this._disposeDrumKit()
        // Create and connect new drum kit
        this.drumSynths = this._createDrumKit(patch)
        this._connectDrumKit(this.drumSynths, patch)
        this.isDrumMode = true
        this.currentPresetSlot = slot
        this.currentPatch = patch
        return true
      }

      // Switching from drum to melodic: dispose drum kit
      if (this.isDrumMode) {
        this._disposeDrumKit()
      }

      // Disconnect and dispose old synth
      if (this.gestureSynth) {
        this.gestureSynth.disconnect()
        this.gestureSynth.dispose()
      }
      if (this.gestureFilter) {
        this.gestureFilter.disconnect()
        this.gestureFilter.dispose()
      }

      // Create new synth based on patch oscillator type
      const oscType = patch.oscillator.type

      if (oscType === 'fmsine') {
        // FM Synthesis
        this.gestureSynth = new Tone.FMSynth({
          modulationIndex: patch.oscillator.modulationIndex || 4,
          modulationType: patch.oscillator.modulationType || 'sine',
          envelope: patch.envelope,
          volume: patch.volume || 0
        })
      } else if (oscType === 'pulse') {
        // Pulse wave
        this.gestureSynth = new Tone.MonoSynth({
          oscillator: {
            type: 'pulse',
            width: patch.oscillator.width || 0.3
          },
          envelope: patch.envelope,
          volume: patch.volume || 0
        })
      } else if (oscType.startsWith('fat')) {
        // Fat oscillators (fatsawtooth, fatsquare, etc.)
        this.gestureSynth = new Tone.MonoSynth({
          oscillator: {
            type: oscType,
            count: patch.oscillator.count || 3,
            spread: patch.oscillator.spread || 25
          },
          envelope: patch.envelope,
          volume: patch.volume || 0
        })
      } else {
        // Basic oscillator types (sine, sawtooth, triangle, square)
        this.gestureSynth = new Tone.MonoSynth({
          oscillator: { type: oscType },
          envelope: patch.envelope,
          volume: patch.volume || 0
        })
      }

      // Create filter based on patch
      this.gestureFilter = new Tone.Filter({
        type: patch.filter?.type || 'lowpass',
        frequency: patch.filter?.frequency || 2000,
        Q: patch.filter?.Q || 1
      })

      // Reconnect signal chain: synth -> filter -> pan -> [volume -> master + FX sends]
      this.gestureSynth.connect(this.gestureFilter)
      this.gestureFilter.connect(this.gesturePan)
      // gesturePan is already connected to gestureVolume -> master + FX sends

      // Update effect sends from patch
      if (this.delaySends?.gesture && patch.effects?.delaySend !== undefined) {
        this.delaySends.gesture.gain.value = patch.effects.delaySend
      }
      if (this.reverbSends?.gesture && patch.effects?.reverbSend !== undefined) {
        this.reverbSends.gesture.gain.value = patch.effects.reverbSend
      }

      // Store current preset info
      this.currentPresetSlot = slot
      this.currentPatch = patch

      // Reset timing trackers
      this._sustainedHoldLastTrigger = 0  // Context time tracker (sustained holds, playSimpleNote)
      this._playMusicalEventLastTrigger = 0  // Context time tracker (playMusicalEvent gestureSynth path)

      // Reset custom envelope flag - preset loads its own envelope
      this._hasCustomEnvelope = false

      return true
    } catch (error) {
      console.error('[AudioService] Failed to select preset:', error)
      return false
    }
  }

  /**
   * Get current preset slot
   * @returns {number|null} Current preset slot or null if default
   */
  getCurrentPresetSlot() {
    return this.currentPresetSlot ?? null
  }

  /**
   * Apply synth parameters from SynthPanel UI
   * @param {Object} params - Synth parameters
   */
  setSynthParams(params) {
    if (!this.gestureSynth || !params) return

    try {
      // Oscillator-specific parameters
      if (this.gestureSynth instanceof Tone.FMSynth) {
        if (params.modulationIndex !== undefined) {
          this.gestureSynth.modulationIndex.rampTo(params.modulationIndex, 0.3)
        }
        if (params.modulationType !== undefined) {
          // modulationType can't be changed at runtime, need to recreate synth
          // This is handled by selectPreset() instead
        }
      } else if (this.gestureSynth.oscillator) {
        const oscType = this.gestureSynth.oscillator.type
        if (oscType === 'pulse' && params.pulseWidth !== undefined) {
          if (this.gestureSynth.oscillator.width) {
            this.gestureSynth.oscillator.width.rampTo(
              Math.max(0.1, Math.min(0.9, params.pulseWidth)),
              0.3
            )
          }
        } else if (oscType?.startsWith?.('fat') && params.fatSpread !== undefined) {
          // FatOscillator spread can be set directly
          this.gestureSynth.oscillator.spread = Math.max(5, Math.min(50, params.fatSpread))
        }
      }

      // Envelope parameters (all synth types) - full synth range
      const envParams = {}
      if (params.attack !== undefined) {
        envParams.attack = Math.max(0.001, Math.min(4.0, params.attack))
      }
      if (params.decay !== undefined) {
        envParams.decay = Math.max(0.001, Math.min(8.0, params.decay))
      }
      if (params.sustain !== undefined) {
        envParams.sustain = Math.max(0.0, Math.min(1.0, params.sustain))
      }
      if (params.release !== undefined) {
        envParams.release = Math.max(0.001, Math.min(10.0, params.release))
      }
      if (Object.keys(envParams).length > 0) {
        this.gestureSynth.set({ envelope: envParams })
        // Mark that user has set custom envelope - don't override in playMusicalEvent
        this._hasCustomEnvelope = true
      }

      // Filter parameters - full synth range
      if (this.gestureFilter) {
        if (params.filterType !== undefined) {
          this.gestureFilter.type = params.filterType
        }
        if (params.filterCutoff !== undefined) {
          this.gestureFilter.frequency.rampTo(
            Math.max(20, Math.min(20000, params.filterCutoff)),
            0.3
          )
        }
        if (params.filterQ !== undefined) {
          this.gestureFilter.Q.rampTo(
            Math.max(0.1, Math.min(20.0, params.filterQ)),
            0.3
          )
        }
      }

      // Volume and Pan
      if (params.volume !== undefined && this.gestureVolume) {
        this.gestureVolume.volume.rampTo(
          Math.max(-12, Math.min(12, params.volume)),
          0.3
        )
      }
      if (params.pan !== undefined && this.gesturePan) {
        this.gesturePan.pan.rampTo(
          Math.max(-1, Math.min(1, params.pan)),
          0.3
        )
      }

      // Effect sends - full range (0-1.0)
      if (params.delaySend !== undefined && this.delaySends?.gesture) {
        this.delaySends.gesture.gain.rampTo(
          Math.max(0, Math.min(1.0, params.delaySend)),
          0.3
        )
      }
      if (params.reverbSend !== undefined && this.reverbSends?.gesture) {
        this.reverbSends.gesture.gain.rampTo(
          Math.max(0, Math.min(1.0, params.reverbSend)),
          0.3
        )
      }
    } catch (error) {
      console.error('[AudioService] Failed to set synth params:', error)
    }
  }

  /**
   * Get current synth parameters
   * @returns {Object} Current synth parameters
   */
  getSynthParams() {
    const params = {
      presetSlot: this.currentPresetSlot ?? null
    }

    // Drum mode: return drum params
    if (this.isDrumMode && this.drumSynths) {
      params.isDrum = true
      // Return current instrument params from synths
      return params
    }

    if (this.gestureSynth) {
      // Oscillator-specific
      if (this.gestureSynth instanceof Tone.FMSynth) {
        params.modulationIndex = this.gestureSynth.modulationIndex.value
      } else if (this.gestureSynth.oscillator) {
        const oscType = this.gestureSynth.oscillator.type
        if (oscType === 'pulse' && this.gestureSynth.oscillator.width) {
          params.pulseWidth = this.gestureSynth.oscillator.width.value
        } else if (oscType?.startsWith?.('fat')) {
          params.fatSpread = this.gestureSynth.oscillator.spread
        }
      }

      // Envelope
      if (this.gestureSynth.envelope) {
        params.attack = this.gestureSynth.envelope.attack
        params.decay = this.gestureSynth.envelope.decay
        params.sustain = this.gestureSynth.envelope.sustain
        params.release = this.gestureSynth.envelope.release
      }
    }

    // Filter
    if (this.gestureFilter) {
      params.filterType = this.gestureFilter.type
      params.filterCutoff = this.gestureFilter.frequency.value
      params.filterQ = this.gestureFilter.Q.value
    }

    // Volume and Pan
    if (this.gestureVolume) {
      params.volume = this.gestureVolume.volume.value
    }
    if (this.gesturePan) {
      params.pan = this.gesturePan.pan.value
    }

    // Effect sends
    if (this.delaySends?.gesture) {
      params.delaySend = this.delaySends.gesture.gain.value
    }
    if (this.reverbSends?.gesture) {
      params.reverbSend = this.reverbSends.gesture.gain.value
    }

    return params
  }

  /**
   * Apply remote user's synth params to their synth
   * Called when receiving synth:params from another user
   * @param {string} userId - Remote user ID
   * @param {Object} params - Their synth parameters
   * @param {number} presetSlot - Their selected preset slot
   */
  applyRemoteSynthParams(userId, params, presetSlot) {
    if (!this.userSynthManager) return

    // Persist custom params flag BEFORE cleanup — survives synth destruction/recreation
    this.userSynthManager.usersWithCustomParams.add(userId)

    // If preset changed, clean up old synth so it gets recreated with new slot
    const existingSynth = this.userSynthManager.userSynths.get(userId)
    if (existingSynth && presetSlot !== undefined) {
      const currentSlot = existingSynth.slot
      if (currentSlot !== presetSlot) {
        // Preset changed - cleanup and let next note create new synth
        this.userSynthManager.cleanupUserSynth(userId)
        // Store the new slot for when synth is recreated
        // (UserSynthManager will use slotLookupFn which should return the new slot)
      }
    }

    // Get or create synth for this user
    const synthData = this.userSynthManager.getSynthForUser(userId)
    if (!synthData?.synth) return

    // Mark per-synth flag too (fast check in applyStyleToAllSynths)
    synthData.hasCustomParams = true

    try {
      // Apply oscillator-specific params
      if (synthData.synth instanceof Tone.FMSynth) {
        if (params.modulationIndex !== undefined) {
          synthData.synth.modulationIndex.rampTo(params.modulationIndex, 0.3)
        }
      } else if (synthData.synth.oscillator) {
        const oscType = synthData.synth.oscillator.type
        if (oscType === 'pulse' && params.pulseWidth !== undefined && synthData.synth.oscillator.width) {
          synthData.synth.oscillator.width.rampTo(params.pulseWidth, 0.3)
        } else if (oscType?.startsWith?.('fat') && params.fatSpread !== undefined) {
          synthData.synth.oscillator.spread = params.fatSpread
        }
      }

      // Apply envelope
      const envParams = {}
      if (params.attack !== undefined) envParams.attack = params.attack
      if (params.decay !== undefined) envParams.decay = params.decay
      if (params.sustain !== undefined) envParams.sustain = params.sustain
      if (params.release !== undefined) envParams.release = params.release
      if (Object.keys(envParams).length > 0) {
        synthData.synth.set({ envelope: envParams })
      }

      // Apply filter
      if (synthData.filter) {
        if (params.filterType !== undefined) synthData.filter.type = params.filterType
        if (params.filterCutoff !== undefined) synthData.filter.frequency.rampTo(params.filterCutoff, 0.3)
        if (params.filterQ !== undefined) synthData.filter.Q.rampTo(params.filterQ, 0.3)
      }

      // Apply volume
      if (synthData.volume && params.volume !== undefined) {
        synthData.volume.volume.rampTo(params.volume, 0.3)
      }

      // Apply pan
      if (synthData.pan && params.pan !== undefined) {
        synthData.pan.pan.rampTo(params.pan, 0.3)
      }

      // Apply effect sends
      if (synthData.delaySend && params.delaySend !== undefined) {
        synthData.delaySend.gain.rampTo(params.delaySend, 0.3)
      }
      if (synthData.reverbSend && params.reverbSend !== undefined) {
        synthData.reverbSend.gain.rampTo(params.reverbSend, 0.3)
      }
    } catch (error) {
      console.error(`[AudioService] Failed to apply remote synth params for ${userId}:`, error)
    }
  }

  /**
   * Get list of free preset slots (not used by other users)
   * @returns {number[]} Array of available slot numbers
   */
  getFreeSynthSlots() {
    const allSlots = [0, 1, 2, 3, 4, 5, 6, 7]
    const mySlot = this.currentPresetSlot

    if (!this.socketService) {
      return allSlots
    }

    // Get slots occupied by other users
    const occupiedSlots = this.socketService.getOccupiedPresetSlots?.() || []

    // Filter: slots not occupied by others (but my current slot is always available)
    return allSlots.filter(s => !occupiedSlots.includes(s) || s === mySlot)
  }

  // ============================================================
  // DRUM KIT SYNTHESIS
  // ============================================================

  /**
   * Create drum kit synths from patch definition
   * @param {Object} patch - Drum kit patch definition
   * @returns {Object} Drum kit synths object
   */
  _createDrumKit (patch) {
    const inst = patch.instruments
    const kit = {}

    // === BASS DRUM: MembraneSynth ===
    kit.bd = new Tone.MembraneSynth({
      pitchDecay: 0.05 + inst.bd.pitch * 0.3,
      octaves: 2 + inst.bd.tone * 6,
      envelope: {
        attack: 0.001,
        decay: 0.05 + inst.bd.decay * 1.45,
        sustain: 0,
        release: 0.1
      }
    })
    kit.bd.frequency.value = 30 + inst.bd.pitch * 60 // 30-90Hz

    // === SNARE: MembraneSynth (body) + NoiseSynth (snap) ===
    kit.snBody = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 3,
      envelope: {
        attack: 0.001,
        decay: 0.08,
        sustain: 0,
        release: 0.05
      }
    })
    kit.snBody.frequency.value = 120 + inst.sn.pitch * 180 // 120-300Hz

    kit.snNoise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: {
        attack: 0.001,
        decay: 0.05 + inst.sn.decay * 0.45,
        sustain: 0,
        release: 0.01
      }
    })

    kit.snFilter = new Tone.Filter({
      type: 'bandpass',
      frequency: 1000 + inst.sn.tone * 7000,
      Q: 1.5
    })

    kit.snMerge = new Tone.Gain(1)
    kit.snBody.connect(kit.snMerge)
    kit.snNoise.connect(kit.snFilter)
    kit.snFilter.connect(kit.snMerge)

    // === HI-HAT: MetalSynth ===
    kit.hh = new Tone.MetalSynth({
      frequency: 200 + inst.hh.pitch * 400,
      envelope: {
        attack: 0.001,
        decay: 0.01 + inst.hh.decay * 0.29,
        release: 0.01
      },
      harmonicity: 0.5 + inst.hh.tone * 4.5,
      resonance: 4000,
      volume: -6
    })

    return kit
  }

  /**
   * Connect drum kit to audio routing (reuses existing global nodes)
   * @param {Object} kit - Drum kit synths object
   * @param {Object} patch - Drum kit patch definition
   */
  _connectDrumKit (kit, patch) {
    const inst = patch.instruments

    // BD → gain → gesturePan
    kit.bdGain = new Tone.Gain(1)
    kit.bd.connect(kit.bdGain)
    kit.bdGain.connect(this.gesturePan)

    // SN (merged body+noise) → gesturePan
    kit.snMerge.connect(this.gesturePan)

    // HH → gain → gesturePan
    kit.hhGain = new Tone.Gain(1)
    kit.hh.connect(kit.hhGain)
    kit.hhGain.connect(this.gesturePan)

    // Delay sends (SN + HH only, BD has no delay)
    if (this.delaySends?.gesture) {
      const delayNode = this.delaySends.gesture // existing gesture delay send node
      kit.snDelaySend = new Tone.Gain(inst.sn.delay || 0.15)
      kit.snMerge.connect(kit.snDelaySend)
      kit.snDelaySend.connect(delayNode)

      kit.hhDelaySend = new Tone.Gain(inst.hh.delay || 0)
      kit.hhGain.connect(kit.hhDelaySend)
      kit.hhDelaySend.connect(delayNode)
    }

    // Reverb sends (all 3, BD with special behavior: max 20%, only above 50% slider)
    if (this.reverbSends?.gesture) {
      const reverbNode = this.reverbSends.gesture
      kit.bdReverbSend = new Tone.Gain(0)
      kit.bdGain.connect(kit.bdReverbSend)
      kit.bdReverbSend.connect(reverbNode)

      kit.snReverbSend = new Tone.Gain(patch.reverb || 0)
      kit.snMerge.connect(kit.snReverbSend)
      kit.snReverbSend.connect(reverbNode)

      kit.hhReverbSend = new Tone.Gain(patch.reverb || 0)
      kit.hhGain.connect(kit.hhReverbSend)
      kit.hhReverbSend.connect(reverbNode)
    }
  }

  /**
   * Play a drum hit on the local drum kit
   * @param {string} instrument - 'bd', 'sn', or 'hh'
   * @param {number} velocity - Hit velocity (0-1)
   */
  playDrumHit (instrument, velocity = 0.7) {
    if (!this.drumSynths || !this.isDrumMode) return

    try {
      const kit = this.drumSynths
      const now = Tone.now()
      const safeTime = Math.max(now, (this._lastDrumTrigger || 0) + 0.01)
      this._lastDrumTrigger = safeTime
      const vel = Math.max(0.1, Math.min(1.0, velocity))

      switch (instrument) {
        case 'bd':
          kit.bd.triggerAttackRelease('C1', '8n', safeTime, vel)
          break
        case 'sn':
          kit.snBody.triggerAttackRelease('E1', '16n', safeTime, vel * 0.6)
          kit.snNoise.triggerAttackRelease('16n', safeTime, vel)
          break
        case 'hh':
          kit.hh.triggerAttackRelease('32n', safeTime, vel)
          break
      }
    } catch (error) {
      console.warn('[AudioService] playDrumHit failed:', error.message)
    }
  }

  /**
   * Apply drum parameter changes from UI sliders
   * @param {Object} params - Drum parameters { bd: {pitch,decay,tone}, sn: {...,delay}, hh: {...,delay}, reverb }
   */
  setDrumParams (params) {
    if (!this.drumSynths || !this.isDrumMode || !params) return
    const kit = this.drumSynths

    try {
      // BD params
      if (params.bd) {
        if (params.bd.pitch !== undefined) {
          kit.bd.frequency.rampTo(30 + params.bd.pitch * 60, 0.1)
          kit.bd.set({ pitchDecay: 0.05 + params.bd.pitch * 0.3 })
        }
        if (params.bd.decay !== undefined) {
          kit.bd.set({ envelope: { decay: 0.05 + params.bd.decay * 1.45 } })
        }
        if (params.bd.tone !== undefined) {
          kit.bd.set({ octaves: 2 + params.bd.tone * 6 })
        }
      }

      // SN params
      if (params.sn) {
        if (params.sn.pitch !== undefined) {
          kit.snBody.frequency.rampTo(120 + params.sn.pitch * 180, 0.1)
        }
        if (params.sn.decay !== undefined) {
          kit.snNoise.set({ envelope: { decay: 0.05 + params.sn.decay * 0.45 } })
        }
        if (params.sn.tone !== undefined) {
          kit.snFilter.frequency.rampTo(1000 + params.sn.tone * 7000, 0.1)
        }
        if (params.sn.delay !== undefined && kit.snDelaySend) {
          kit.snDelaySend.gain.rampTo(params.sn.delay, 0.1)
        }
      }

      // HH params
      if (params.hh) {
        if (params.hh.pitch !== undefined) {
          kit.hh.set({ frequency: 200 + params.hh.pitch * 400 })
        }
        if (params.hh.decay !== undefined) {
          kit.hh.set({ envelope: { decay: 0.01 + params.hh.decay * 0.29 } })
        }
        if (params.hh.tone !== undefined) {
          kit.hh.set({ harmonicity: 0.5 + params.hh.tone * 4.5 })
        }
        if (params.hh.delay !== undefined && kit.hhDelaySend) {
          kit.hhDelaySend.gain.rampTo(params.hh.delay, 0.1)
        }
      }

      // Reverb (global slider, BD special behavior)
      if (params.reverb !== undefined) {
        const r = params.reverb
        if (kit.snReverbSend) kit.snReverbSend.gain.rampTo(r, 0.1)
        if (kit.hhReverbSend) kit.hhReverbSend.gain.rampTo(r, 0.1)
        // BD: 0% below 50% slider, then 0-20% mapped from 50%-100% range
        if (kit.bdReverbSend) {
          kit.bdReverbSend.gain.rampTo(r > 0.5 ? (r - 0.5) * 2 * 0.2 : 0, 0.1)
        }
      }
    } catch (error) {
      console.warn('[AudioService] setDrumParams failed:', error.message)
    }
  }

  /**
   * Dispose all drum kit synths and nodes
   */
  _disposeDrumKit () {
    if (!this.drumSynths) return

    const nodes = [
      this.drumSynths.bd, this.drumSynths.bdGain, this.drumSynths.bdReverbSend,
      this.drumSynths.snBody, this.drumSynths.snNoise, this.drumSynths.snFilter,
      this.drumSynths.snMerge, this.drumSynths.snDelaySend, this.drumSynths.snReverbSend,
      this.drumSynths.hh, this.drumSynths.hhGain, this.drumSynths.hhDelaySend, this.drumSynths.hhReverbSend
    ]
    nodes.forEach(n => {
      if (n && !n.disposed) {
        try { n.disconnect(); n.dispose() } catch (e) { /* already disposed */ }
      }
    })
    this.drumSynths = null
    this.isDrumMode = false
    this._lastDrumTrigger = 0
  }

  /**
   * Entry #SynthUI: Play a simple note for audition/preview purposes
   * Used by SynthPanel "Generate Gestures" feature
   * @param {number} frequency - Note frequency in Hz
   * @param {number} duration - Note duration in seconds
   * @param {number} intensity - Note intensity/velocity (0-1)
   */
  playSimpleNote (frequency, duration, intensity = 0.5) {
    if (!this.gestureSynth) {
      console.warn('[AudioService] playSimpleNote: gestureSynth not available')
      return
    }

    try {
      const now = Tone.now()
      // Entry #SynthUIFix: Use context-time tracker, NOT gestureSynthLastTrigger (which uses Transport time)
      if (!this._sustainedHoldLastTrigger) this._sustainedHoldLastTrigger = 0
      const safeTime = Math.max(now, this._sustainedHoldLastTrigger + 0.05)
      const velocity = Math.max(0.1, Math.min(1.0, intensity))

      // Clamp frequency to safe range
      const safeFreq = Math.max(65, Math.min(2000, frequency))
      const safeDuration = Math.max(0.1, Math.min(4.0, duration))

      this._sustainedHoldLastTrigger = safeTime
      this.gestureSynth.triggerAttackRelease(safeFreq, safeDuration, safeTime, velocity)
    } catch (error) {
      console.warn('[AudioService] playSimpleNote failed:', error.message)
    }
  }
}

// Export singleton instance
// Make AudioService available globally
window.AudioService = AudioService