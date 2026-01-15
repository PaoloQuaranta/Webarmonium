/**
 * AudioService
 * Real-time audio parameter mapping and sonic feedback coordination
 * Constitutional requirement: <200ms gesture-to-sound latency, 60fps parameter updates
 *
 * Enhanced with MusicalScheduler for clock-consistent timing and LFOManager for advanced modulation
 */

// DEBUG: Verify file is loaded
// console.log('🔴🔴🔴 AudioService.js v36 LOADING 🔴🔴🔴')

// Note: MusicalScheduler and LFOManager will be loaded via global scripts
class AudioService {
  constructor() {
    this.isInitialized = false
    this.audioEngine = null
    this.gestureCapture = null

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

    // Mute and volume controls (DEPRECATED: use volumeController instead)
    this.muted = false
    this.volume = 1.0 // 0-1 range

    // Color-to-frequency mapping (10-color pool: 3 virtual + 7 real)
    // Virtual user colors (exclusive): red, orange, blue
    // Real user colors (exclusive): green, purple, yellow, magenta, pink, gray, teal
    this.colorPool = [
      '#e41a1c', '#ff7f00', '#377eb8',  // Virtual users (Wikipedia, HackerNews, GitHub)
      '#4daf4a', '#984ea3', '#ffff33', '#e7298a', '#f781bf', '#999999', '#66c2a5'  // Real users
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

    // VISIBILITY FIX: Handle tab visibility changes to prevent synth state corruption
    // When Chrome tab loses focus, AudioContext may suspend and timing gets stale
    this._boundVisibilityHandler = this._handleVisibilityChange.bind(this)
    document.addEventListener('visibilitychange', this._boundVisibilityHandler)

    // SLEEP RECOVERY FIX: Additional event handlers for device sleep scenarios
    // window focus/blur catches cases where visibilitychange doesn't fire (especially mobile)
    this._boundFocusHandler = this._handleWindowFocus.bind(this)
    this._boundBlurHandler = this._handleWindowBlur.bind(this)
    window.addEventListener('focus', this._boundFocusHandler)
    window.addEventListener('blur', this._boundBlurHandler)

    // Page Lifecycle API for iOS (freeze/resume) and cache scenarios (pageshow/pagehide)
    this._boundPageShowHandler = this._handlePageShow.bind(this)
    this._boundPageHideHandler = this._handlePageHide.bind(this)
    window.addEventListener('pageshow', this._boundPageShowHandler)
    window.addEventListener('pagehide', this._boundPageHideHandler)

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

    // Track if audio was intentionally stopped by user (not just suspended)
    this._userStoppedAudio = false
  }

  /**
   * Handle visibility change - reset synth states when tab becomes visible
   * Fixes issues with notes skipping or having wrong envelopes after window switch
   * REFACTORED: Now properly awaits context resume before checking Transport state
   */
  async _handleVisibilityChange() {
    if (document.hidden) {
      console.log('🔇 Tab hidden - AudioContext may suspend')
      this._stopAudioHealthCheck()
      return
    }

    // Entry #122: Respect user's explicit stop - don't auto-recover if user stopped audio
    if (this._userStoppedAudio) {
      console.log('🔊 Tab visible, but user stopped audio - skipping recovery')
      return
    }

    console.log('🔊 Tab visible - initiating audio recovery...')
    await this._performAudioRecovery('visibility')
  }

  /**
   * Handle window focus - catches device wake scenarios that miss visibilitychange
   * Mobile devices especially may not fire visibilitychange after sleep
   */
  async _handleWindowFocus() {
    // Entry #122: Respect user's explicit stop - don't auto-recover if user stopped audio
    if (this._userStoppedAudio) {
      console.log('🔊 Window focused, but user stopped audio - skipping recovery')
      return
    }

    console.log('🔊 Window focus received - checking audio state...')

    // Small delay to let the system stabilize after wake
    await new Promise(resolve => setTimeout(resolve, this._recoveryConfig.FOCUS_STABILIZATION_DELAY_MS))

    await this._performAudioRecovery('focus')
  }

  /**
   * Handle window blur - prepare for potential sleep
   */
  _handleWindowBlur() {
    console.log('🔇 Window blur - preparing for potential sleep')
    this._stopAudioHealthCheck()
  }

  /**
   * Handle pageshow - catches BFCache restoration and iOS resume
   * @param {PageTransitionEvent} event
   */
  async _handlePageShow(event) {
    // Entry #122: Respect user's explicit stop - don't auto-recover if user stopped audio
    if (this._userStoppedAudio) {
      console.log('🔊 Page shown, but user stopped audio - skipping recovery')
      return
    }

    if (event.persisted) {
      console.log('🔊 Page restored from BFCache - forcing audio recovery')
      await this._performAudioRecovery('pageshow-cached')
    } else if (this._isIOS && this.isInitialized && Tone.context?.state !== 'running') {
      // iOS Safari: Even non-persisted pageshow may need recovery after device wake
      console.log('🔊 iOS pageshow with suspended context - attempting recovery')
      await this._performAudioRecovery('pageshow-ios')
    } else {
      console.log('🔊 Page shown (fresh load)')
    }
  }

  /**
   * Handle pagehide - prepare for potential cache/sleep
   * @param {PageTransitionEvent} event
   */
  _handlePageHide(event) {
    console.log('🔇 Page hiding, persisted:', event.persisted)
    this._stopAudioHealthCheck()
  }

  /**
   * Centralized audio recovery logic - called by all wake/visibility handlers
   * Properly sequences: context resume -> masterVolume restore -> Transport restart -> health check
   * Includes concurrency guard to prevent racing recovery attempts
   * @param {string} trigger - What triggered this recovery ('visibility', 'focus', 'pageshow', etc.)
   */
  async _performAudioRecovery(trigger) {
    // Concurrency guard - prevent multiple simultaneous recovery attempts
    if (this._recoveryInProgress) {
      console.log(`🔊 Recovery already in progress, queueing trigger: ${trigger}`)
      this._pendingRecoveryTrigger = trigger
      return
    }

    this._recoveryInProgress = true
    console.log(`🔊 Audio recovery triggered by: ${trigger}`)

    if (!this.isInitialized) {
      console.log('🔊 Audio not initialized, skipping recovery')
      this._recoveryInProgress = false
      return
    }

    // Respect user's explicit stop - don't auto-resume if user stopped audio
    if (this._userStoppedAudio) {
      console.log('🔊 User intentionally stopped audio, skipping recovery')
      this._recoveryInProgress = false
      return
    }

    try {
      // STEP 1: Resume AudioContext if suspended (with retry logic)
      const contextResumed = await this._resumeAudioContext(trigger)

      if (!contextResumed) {
        console.warn('🔊 AudioContext resume failed - may need user gesture')
        this._stopAudioHealthCheck() // Cleanup on failure
        this._requestUserGestureForAudio()
        this._recoveryInProgress = false
        return
      }

      // STEP 2: Restore masterVolume if stuck at -Infinity (critical fix!)
      if (this.masterVolume && this.masterVolume.volume.value === -Infinity) {
        console.log('🔊 Restoring masterVolume from -Infinity to -10dB')
        this.masterVolume.volume.value = -10
      }

      // STEP 3: Restart Transport if needed (AFTER context is confirmed running)
      if (Tone.Transport?.state !== 'started' && Tone.context?.state === 'running') {
        console.log('🔊 Restarting Tone.Transport...')
        Tone.Transport.start()
      }

      // STEP 4: Reset UserSynthManager states to clear stale timing
      if (this.userSynthManager) {
        this.userSynthManager.resetAllSynthStates()
        console.log('🔊 UserSynthManager states reset')
      }

      // STEP 5: FORCE restart evolving generation after sleep recovery
      // Even if evolvingGenerationActive is true, the scheduled events may be stale
      // after iOS sleep, so we must restart to re-register Transport events
      if (this.isInitialized && !this.muted) {
        console.log('🔊 Force restarting evolving generation after recovery...')
        // Reset flag to allow startEvolvingGeneration to run
        this.evolvingGenerationActive = false
        this.startEvolvingGeneration()
      }

      // STEP 6: Start audio health monitoring to detect silent state
      this._startAudioHealthCheck()
      this._wakeRecoveryAttempts = 0

      console.log('🔊 Audio recovery complete')

      // Check if another recovery was requested during this one
      if (this._pendingRecoveryTrigger) {
        const pendingTrigger = this._pendingRecoveryTrigger
        this._pendingRecoveryTrigger = null
        this._recoveryInProgress = false
        console.log(`🔊 Processing queued recovery: ${pendingTrigger}`)
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

    console.log('🔊 Attempting to resume AudioContext:', {
      currentState: Tone.context?.state,
      trigger,
      maxAttempts,
      platform: this._isIOS ? 'iOS' : (this._needsAggressiveResume ? 'Android' : 'other')
    })

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // iOS CRITICAL: "interrupted" state requires Tone.start(), not just resume()
        // This can only work if called from a user gesture context
        if (this._isIOS && (Tone.context?.state === 'interrupted' || Tone.context?.state === 'suspended')) {
          console.log(`🔊 iOS: Trying Tone.start() on attempt ${attempt}`)
          try {
            await Tone.start()
          } catch (startError) {
            console.log('🔊 iOS Tone.start() failed (expected if not in gesture):', startError.message)
          }
        }

        // Try all available resume methods
        if (rawContext?.resume) {
          await rawContext.resume()
        }
        if (Tone.context?.resume) {
          await Tone.context.resume()
        }

        // Poll for state change with timeout
        const startTime = Date.now()

        while (Tone.context.state !== 'running' && Date.now() - startTime < config.RESUME_POLL_TIMEOUT_MS) {
          await new Promise(resolve => setTimeout(resolve, config.RESUME_POLL_INTERVAL_MS))
        }

        if (Tone.context.state === 'running') {
          console.log(`🔊 AudioContext resumed on attempt ${attempt}/${maxAttempts}`)
          return true
        }

        // Android-specific: Try suspend/resume cycle
        if (this._needsAggressiveResume && Tone.context.state !== 'running') {
          console.log(`🔊 Android: Trying suspend/resume cycle on attempt ${attempt}`)
          if (rawContext?.suspend) {
            await rawContext.suspend()
            await new Promise(resolve => setTimeout(resolve, config.ANDROID_SUSPEND_RESUME_DELAY_MS))
          }
          if (rawContext?.resume) {
            await rawContext.resume()
          }
          await new Promise(resolve => setTimeout(resolve, config.ANDROID_SUSPEND_RESUME_WAIT_MS))

          if (Tone.context.state === 'running') {
            console.log('🔊 Android suspend/resume cycle succeeded')
            return true
          }
        }

      } catch (error) {
        console.warn(`🔊 Resume attempt ${attempt}/${maxAttempts} failed:`, {
          error: error.message,
          contextState: Tone.context?.state,
          trigger
        })
      }

      // Wait before next attempt (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 50 * attempt))
    }

    console.warn('🔊 All resume attempts exhausted:', {
      finalState: Tone.context?.state,
      attempts: maxAttempts,
      trigger
    })
    return false
  }

  /**
   * Start periodic audio health checks to detect silent state
   * This catches cases where context is "running" but audio is actually silent
   * Uses adaptive intervals: longer on mobile to save battery
   */
  _startAudioHealthCheck() {
    this._stopAudioHealthCheck() // Clear any existing

    const config = this._recoveryConfig

    // Use longer interval on mobile to save battery
    const checkInterval = this._isMobile
      ? config.HEALTH_CHECK_INTERVAL_MOBILE_MS
      : config.HEALTH_CHECK_INTERVAL_DESKTOP_MS

    this._audioHealthCheckInterval = setInterval(() => {
      this._checkAudioHealth()
    }, checkInterval)

    // Entry #122: Store initial timeout ID for proper cleanup
    this._audioHealthCheckInitialTimeout = setTimeout(
      () => this._checkAudioHealth(),
      config.HEALTH_CHECK_INITIAL_DELAY_MS
    )
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
  }

  /**
   * Check if audio is actually producing sound (not just context running)
   * Respects user's explicit stop state - won't restart if user stopped audio
   */
  _checkAudioHealth() {
    if (!this.isInitialized) return

    // Respect user's explicit stop - don't attempt recovery if user stopped audio
    if (this._userStoppedAudio) return

    const contextState = Tone.context?.state

    // Check 1: Context state - must be "running"
    // iOS Safari can have "interrupted" state after device sleep
    if (contextState !== 'running') {
      console.warn('🔊 Health check: AudioContext not running', {
        state: contextState,
        isIOS: this._isIOS
      })
      // iOS "interrupted" state requires user gesture - request it
      if (contextState === 'interrupted') {
        console.warn('🔊 iOS interrupted state detected - requesting user gesture')
        this._requestUserGestureForAudio()
        return
      }
      this._attemptSilentRecovery()
      return
    }

    // Check 2: MasterVolume not stuck at -Infinity (only if not muted)
    if (this.masterVolume && this.masterVolume.volume.value === -Infinity && !this.muted) {
      console.warn('🔊 Health check: MasterVolume stuck at -Infinity')
      this.masterVolume.volume.value = -10
    }

    // Check 3: Transport should be running
    if (Tone.Transport?.state !== 'started') {
      console.warn('🔊 Health check: Transport not started')
      Tone.Transport.start()
    }

    // Check 4: Evolving generation should be active (only if not muted)
    if (!this.evolvingGenerationActive && !this.muted) {
      console.log('🔊 Health check: Restarting evolving generation')
      this.startEvolvingGeneration()
    }
  }

  /**
   * Attempt recovery when audio is suspected silent
   */
  async _attemptSilentRecovery() {
    this._wakeRecoveryAttempts++

    if (this._wakeRecoveryAttempts > this._maxWakeRecoveryAttempts) {
      console.warn('🔊 Max recovery attempts reached - requesting user interaction')
      this._stopAudioHealthCheck() // Stop checking after max attempts
      this._requestUserGestureForAudio()
      return
    }

    console.log(`🔊 Attempting silent recovery (attempt ${this._wakeRecoveryAttempts}/${this._maxWakeRecoveryAttempts})`)
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

    console.log('🔊 Dispatched audio:gesture-required event')
  }

  /**
   * Called when user interacts with the page after gesture-required event
   * Should be connected to a touch/click handler in main.js
   * Includes iOS-specific handling (very quiet tone instead of silent)
   */
  async handleUserGestureForRecovery() {
    // Entry #122: Respect user's explicit stop - don't auto-recover if user stopped audio
    // User must click Start button to resume, not just any gesture
    if (this._userStoppedAudio) {
      console.log('🔊 Gesture received, but user stopped audio - skipping recovery')
      return
    }

    console.log('🔊 User gesture received for audio recovery', {
      platform: this._isIOS ? 'iOS' : (this._isMobile ? 'mobile' : 'desktop'),
      contextState: Tone.context?.state
    })
    this._wakeRecoveryAttempts = 0

    const config = this._recoveryConfig

    // iOS CRITICAL: Must call Tone.start() FIRST from user gesture
    // This is the only way to unlock AudioContext on iOS Safari after sleep
    // Tone.start() internally handles the iOS-specific unlock mechanism
    if (this._isIOS || Tone.context?.state === 'interrupted' || Tone.context?.state === 'suspended') {
      try {
        console.log('🔊 Calling Tone.start() from user gesture...')
        await Tone.start()
        console.log('🔊 After Tone.start():', Tone.context?.state)
      } catch (e) {
        console.warn('🔊 Tone.start() failed:', e.message)
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
      console.warn('🔊 Buffer unlock failed:', e.message)
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

      // Create new AudioContext with optimized settings
      const contextOptions = {
        latencyHint: latencyHint
      }

      // Entry #56 FIX: Detect Windows browser for sample rate reduction
      const isWindowsBrowser = typeof PlatformDetection !== 'undefined' && PlatformDetection.isWindowsBrowser()

      // Entry #48/#56: Android Chrome and Windows browsers benefit from lower sample rate
      // Reduces CPU processing load and helps prevent audio dropouts
      if (isAndroidChrome || isWindowsBrowser) {
        contextOptions.sampleRate = 44100
      }

      // Only create custom context if Tone hasn't started yet
      if (window.Tone && Tone.context.state === 'suspended') {
        const customContext = new AudioContext(contextOptions)
        Tone.setContext(customContext)
        console.log(`🔊 AudioContext configured: latencyHint=${latencyHint}, sampleRate=${customContext.sampleRate}, isWindowsBrowser=${isWindowsBrowser}, isAndroidChrome=${isAndroidChrome}`)
      }
    } catch (error) {
      console.warn('⚠️ Failed to configure AudioContext:', error.message)
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
        console.log('🔧 _initializeAudioProfile: baseProfile from PlatformDetection:', baseProfile)
      } else {
        // Fallback profile
        baseProfile = {
          lookAhead: 0.1,
          updateInterval: 0.025,
          sampleRate: 48000,
          filterUpdateRate: 30,
          maxPolyphony: 8,
          backgroundLayers: ['bass', 'pad', 'chords'],
          useAmbientFilters: true,
          synthComplexity: 'full',
          tier: 'unknown',
          source: 'fallback'
        }
        console.log('🔧 _initializeAudioProfile: using fallback baseProfile')
      }

      // Entry #74: Apply UserSettings overrides
      if (typeof UserSettings !== 'undefined') {
        const userSettings = UserSettings.getAll()
        console.log('🔧 _initializeAudioProfile: UserSettings.getAll():', userSettings)
        this.audioProfile = UserSettings.getEffectiveAudioProfile(baseProfile)
        console.log(`🔧 Audio Profile with UserSettings:`, {
          tier: this.audioProfile.tier,
          source: this.audioProfile.source,
          maxPolyphony: this.audioProfile.maxPolyphony,
          backgroundLayers: this.audioProfile.backgroundLayers,
          synthComplexity: this.audioProfile.synthComplexity,
          lookAhead: this.audioProfile.lookAhead,
          sampleRate: this.audioProfile.sampleRate
        })
      } else {
        this.audioProfile = baseProfile
        console.log(`🔧 Audio Profile loaded (no UserSettings):`, {
          tier: this.audioProfile.tier,
          source: this.audioProfile.source
        })
      }

      this.isUltraLowPowerMode = this.audioProfile.synthComplexity === 'mono-sine'

      // If Ultra-Low Power mode, initialize the minimal audio engine
      if (this.isUltraLowPowerMode && typeof UltraLowPowerAudio !== 'undefined') {
        this.ultraLowPowerAudio = new UltraLowPowerAudio()
        console.log('🔋 Ultra-Low Power Audio mode enabled')
      }
    } catch (error) {
      console.warn('⚠️ Failed to initialize audio profile:', error.message)
    }
  }

  /**
   * Entry #73 FIX: Reload audio profile after Low Power mode toggle
   * Entry #74: Also reloads when UserSettings change
   * Called when user toggles Low Power mode or changes Settings to apply new settings
   */
  reloadAudioProfile() {
    try {
      console.log('🔧 AudioService: Reloading audio profile...')

      const wasUltraLow = this.isUltraLowPowerMode
      // Entry #74 FIX: Track previous background layers to detect changes
      const previousLayers = this.audioProfile?.backgroundLayers || ['bass', 'pad', 'chords']

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

      console.log(`🔧 Audio Profile reloaded:`, {
        tier: this.audioProfile.tier,
        source: this.audioProfile.source,
        maxPolyphony: this.audioProfile.maxPolyphony,
        backgroundLayers: this.audioProfile.backgroundLayers,
        synthComplexity: this.audioProfile.synthComplexity,
        lookAhead: this.audioProfile.lookAhead,
        sampleRate: this.audioProfile.sampleRate
      })

      // Update Tone.js lookAhead if changed
      if (window.Tone && this.audioProfile.lookAhead) {
        Tone.context.lookAhead = this.audioProfile.lookAhead
        console.log(`🔊 Tone.context.lookAhead updated to ${this.audioProfile.lookAhead}s`)
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
            console.log(`🔊 Released notes on disabled layer: ${layer}`)
          }
        })
      }

      // Entry #74 FIX: Update maxPolyphony and release excess voices
      if (this.audioProfile.maxPolyphony) {
        const previousMax = this.maxTotalVoices
        this.maxTotalVoices = this.audioProfile.maxPolyphony
        if (this.maxTotalVoices !== previousMax) {
          console.log(`🔊 Max polyphony updated: ${previousMax} → ${this.maxTotalVoices}`)
          // Release excess voices if we reduced the limit
          if (this.maxTotalVoices < previousMax) {
            try {
              this.managePolyphony()
            } catch (error) {
              console.warn('Failed to manage polyphony after limit reduction:', error)
            }
          }
        }
      }

      // Handle transition to/from Ultra-Low Power mode
      console.log(`🔋 Ultra-Low Power check: isUltraLow=${this.isUltraLowPowerMode}, wasUltraLow=${wasUltraLow}, UltraLowPowerAudio defined=${typeof UltraLowPowerAudio !== 'undefined'}`)
      if (this.isUltraLowPowerMode && !wasUltraLow) {
        // Switching TO Ultra-Low Power mode
        console.log('🔋 Switching TO Ultra-Low Power mode...')
        if (typeof UltraLowPowerAudio !== 'undefined' && !this.ultraLowPowerAudio) {
          this.ultraLowPowerAudio = new UltraLowPowerAudio()
          this.ultraLowPowerAudio.initialize()
          console.log('🔋 Ultra-Low Power Audio activated')
        } else {
          console.warn('🔋 UltraLowPowerAudio not available or already exists:', {
            defined: typeof UltraLowPowerAudio !== 'undefined',
            exists: !!this.ultraLowPowerAudio
          })
        }
        // Entry #90 FIX: Switch gestureSynth to simple sine oscillator
        // ERROR HANDLING: Wrap in try-catch to handle disposed synth or API changes
        try {
          if (this.gestureSynth && this.gestureSynth.oscillator && !this.gestureSynth.disposed) {
            this.gestureSynth.oscillator.type = 'sine'
            console.log('🔋 gestureSynth switched to sine oscillator')
          }
        } catch (e) {
          console.warn('🔋 Failed to switch gestureSynth oscillator:', e.message)
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
          console.log('🔋 Ultra-Low Power Audio deactivated')
        }
        // Entry #90 FIX: Restore gestureSynth to sawtooth oscillator
        // ERROR HANDLING: Wrap in try-catch to handle disposed synth or API changes
        try {
          if (this.gestureSynth && this.gestureSynth.oscillator && !this.gestureSynth.disposed) {
            this.gestureSynth.oscillator.type = 'sawtooth'
            console.log('🔋 gestureSynth restored to sawtooth oscillator')
          }
        } catch (e) {
          console.warn('🔋 Failed to restore gestureSynth oscillator:', e.message)
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
    } catch (error) {
      console.warn('⚠️ Failed to reload audio profile:', error.message)
    }
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
            console.log(`🎧 Audio stress: factor=${data.stressFactor.toFixed(2)}, mode=${data.mode}`)

            // Emit event for UI indicator
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('audio-stress-change', { detail: data }))
            }
          }

          // Handle mode changes
          this.stressMonitor.onModeChange = (data) => {
            console.log(`🎧 Audio mode changed: ${data.from} → ${data.to}`)

            // Apply degradation based on mode
            this._applyStressDegradation(data.to)

            // Emit event for UI indicator
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('audio-mode-change', { detail: data }))
            }
          }
        }

        this.stressMonitor.start(Tone.context)
        console.log('🎧 AudioStressMonitor started')
      }
    } catch (error) {
      console.warn('⚠️ Failed to start stress monitor:', error.message)
    }
  }

  /**
   * Entry #73: Apply audio degradation based on stress mode
   * @param {'normal'|'degraded'|'minimal'|'emergency'} mode
   */
  _applyStressDegradation(mode) {
    try {
      switch (mode) {
        case 'degraded':
          // Reduce filter update rate
          this.filterUpdateInterval = 100 // 10Hz
          this.ambientFilterUpdateInterval = 500 // 2Hz
          console.log('🎧 Degraded mode: Reduced filter update rates')
          break

        case 'minimal':
          // Further reduce updates, consider stopping some layers
          this.filterUpdateInterval = 200 // 5Hz
          this.ambientFilterUpdateInterval = 1000 // 1Hz
          console.log('🎧 Minimal mode: Significantly reduced audio processing')
          break

        case 'emergency':
          // Stop background composition, only play direct gestures
          if (this.evolvingGenerationActive) {
            this.stopEvolvingGeneration()
            console.log('🎧 Emergency mode: Stopped background composition')
          }
          break

        case 'normal':
        default:
          // Restore normal rates based on profile
          const filterRate = this.audioProfile?.filterUpdateRate || 30
          this.filterUpdateInterval = Math.round(1000 / filterRate)
          this.ambientFilterUpdateInterval = 200
          break
      }
    } catch (error) {
      console.warn('⚠️ Failed to apply stress degradation:', error.message)
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

    // COMPOSITION LAYERS: Always enabled (except Ultra-Low Power, handled above)
    // These are server-sent compositions that create the shared musical experience
    // They use different synths (backgroundHigh/Mid/Low) than ambient layers
    if (layerName === 'backgroundHigh' || layerName === 'backgroundMid' || layerName === 'backgroundLow') {
      return true
    }

    // AMBIENT LAYERS: Controlled by device profile
    // Check audioProfile.backgroundLayers array for bass, pad, chords
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
      // Clear user-stopped flag when explicitly starting audio
      this._userStoppedAudio = false

      // Initialize Tone.js audio context
      if (window.Tone) {
        // PERF: Configure AudioContext BEFORE starting for optimal buffer size
        this._configureAudioContext()

        // Entry #73: Load audio profile and check for Low Power mode
        this._initializeAudioProfile()

        // Always ensure Tone is started (requires user gesture from click handler)
        if (Tone.context.state !== 'running') {
          console.log('🔊 Calling Tone.start(), current state:', Tone.context.state)
          await Tone.start()
          console.log('🔊 After Tone.start(), state:', Tone.context.state)

          // Entry #46 FIX: If still suspended, try explicit context.resume() with proper polling
          // Previous implementation used fixed 50ms delay which was insufficient for audio hardware
          if (Tone.context.state !== 'running') {
            console.log('🔊 Context still suspended, trying explicit resume...')
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

                console.log(`🔊 After resume attempt ${attempt}, state:`, Tone.context.state)

                if (Tone.context.state === 'running') {
                  console.log('🔊 ✅ Context resumed successfully!')
                  break
                }
              } catch (resumeError) {
                console.warn(`🔊 Resume attempt ${attempt} failed:`, resumeError)
              }
            }

            if (Tone.context.state !== 'running') {
              console.warn('🔊 ⚠️ Context still not running after retries. User may need to click again.')
            }
          }

          // Entry #48 FIX: Android 13+ aggressive resume strategy
          // Android has stricter autoplay policies that require additional measures
          // Reduced to 3 attempts with shorter delays (total ~600ms vs 3s)
          if (Tone.context.state !== 'running' && this._needsAggressiveResume) {
            console.log('🔊 Android 13+ detected: Applying aggressive resume strategy')

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
                  console.log(`🔊 ✅ Android aggressive resume succeeded on attempt ${aggressiveAttempt}`)
                  break
                }

                // Wait before next attempt (100ms, 200ms, 300ms)
                await new Promise(resolve => setTimeout(resolve, 100 * aggressiveAttempt))

              } catch (e) {
                console.warn(`🔊 Android aggressive resume attempt ${aggressiveAttempt} failed:`, e)
              }
            }
          }
        } else {
          console.log('🔊 Tone.context already running')
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
          console.log(`🔊 Using user-specified lookAhead: ${targetLookAhead}s`)
        }

        const isWindowsChromePure = typeof PlatformDetection !== 'undefined' && PlatformDetection.isWindowsChromePure()
        Tone.context.lookAhead = targetLookAhead
        console.log(`🔊 Tone.context.lookAhead set to ${targetLookAhead}s (isWindowsChromePure=${isWindowsChromePure})`)

        // PERF: Entry #59: Use platform-specific updateInterval for Chrome Windows
        // Default is 0.025s (25ms). Higher values reduce scheduler CPU overhead
        // Chrome on Windows needs 100ms (4x default)
        const targetUpdateInterval = typeof PlatformDetection !== 'undefined'
          ? PlatformDetection.getAudioUpdateInterval()
          : 0.025

        // Always set and log - updateInterval is critical for Chrome stability
        Tone.context.updateInterval = targetUpdateInterval
        console.log(`🔊 Tone.context.updateInterval set to ${targetUpdateInterval}s (isWindowsChromePure=${isWindowsChromePure})`)

        // CRITICAL: Start Transport for scheduled events (only if context is running)
        if (Tone.context.state === 'running' && Tone.Transport.state !== 'started') {
          Tone.Transport.start()
          // console.log('🚀 Tone.Transport started for event scheduling')
        } else if (Tone.context.state !== 'running') {
          console.warn('🔊 Skipping Transport.start() - context still not running')
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
        if (!contextRunning) {
          console.warn('🔊 AudioService.start() completed but context still not running')
        }
        return contextRunning
      } else {
        throw new Error('Tone.js not available')
      }
    } catch (error) {
      // console.error('❌ Failed to start AudioService:', error)
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

    // Create master volume node for centralized control (FR-011)
    this.masterVolume = new Tone.Volume(-10).toDestination()

    // Pass masterVolume to VolumeController (Sprint 2 refactoring)
    this.volumeController.setMasterVolumeNode(this.masterVolume)

    // Create global FX buses (100% wet for send/return architecture)
    // Note: Reverb needs async initialization for impulse response
    this.reverb = new Tone.Reverb({
      decay: 3.0,        // 3 second decay
      preDelay: 0.01,    // 10ms predelay
      wet: 1.0           // 100% wet - this is a FX bus, not insert
    })

    // Connect reverb after creation (will work once ready)
    this.reverb.connect(this.masterVolume)

    // Wait for reverb to generate impulse response (non-blocking)
    this.reverb.ready.then(() => {
      // console.log('✅ Reverb impulse response ready')
    }).catch(e => {
      console.warn('Reverb initialization warning:', e.message)
    })

    this.delay = new Tone.FeedbackDelay({
      delayTime: 0.2,    // 200ms delay time
      maxDelay: 1,       // 1 second max
      feedback: 0.65,    // INCREASED from 0.55 - more echoes for landing page
      wet: 1.0           // 100% wet - this is a FX bus, not insert
    }).connect(this.masterVolume)

    // Create send buses for each FX (gain nodes to control send levels)
    this.delaySends = {
      bass: new Tone.Gain(0.15),      // 15% to delay
      pad: new Tone.Gain(0.2),        // 20% to delay
      chords: new Tone.Gain(0.35),    // 35% to delay (Entry #42: increased from 20%)
      gesture: new Tone.Gain(0.25),   // 25% to delay (more present)
      backgroundHigh: new Tone.Gain(0.2),  // 20% to delay for composition
      backgroundMid: new Tone.Gain(0.2),   // 20% to delay for composition
      backgroundLow: new Tone.Gain(0.15)   // 15% to delay for composition bass
    }

    this.reverbSends = {
      bass: new Tone.Gain(0.15),      // 15% to reverb
      pad: new Tone.Gain(0.3),        // 30% to reverb (pad loves reverb)
      chords: new Tone.Gain(0.25),    // 25% to reverb
      gesture: new Tone.Gain(0.3),    // 30% to reverb
      backgroundHigh: new Tone.Gain(0.25),  // 25% to reverb for composition
      backgroundMid: new Tone.Gain(0.25),   // 25% to reverb for composition
      backgroundLow: new Tone.Gain(0.2)     // 20% to reverb for composition bass
    }

    // Connect send buses to FX
    Object.values(this.delaySends).forEach(send => send.connect(this.delay))
    Object.values(this.reverbSends).forEach(send => send.connect(this.reverb))

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
          velocity: 0.30,    // Quieter for subtle background
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

    // OPTIMIZED: Reduced oscillator count for performance
    // bass/backgroundHigh/Mid/Low = MonoSynth (1 voice each)
    // pad = 3 voices, chords = 4 voices
    this.ambientLayers = {
      // BASS: MonoSynth - deep foundation (1 voice)
      bass: new Tone.MonoSynth({
        oscillator: {
          type: 'sawtooth'  // Rich bass tone
        },
        envelope: {
          attack: 0.01,
          decay: 0.1,
          sustain: 0.9,
          release: 0.2
        }
      }),

      // PAD: Ethereal drone layer (6 voices to handle 4s release overlap)
      pad: new Tone.PolySynth({
        oscillator: {
          type: 'triangle'  // Soft, warm
        },
        volume: +5,
        envelope: {
          attack: 0.8,
          decay: 1.5,
          sustain: 0.7,
          release: 4.0
        },
        maxPolyphony: 6  // 2 notes × 3 overlapping triggers during 4s release
      }),

      // CHORDS: Electric piano (FM synthesis, Rhodes-style)
      chords: (() => {
        const synth = new Tone.PolySynth(Tone.FMSynth, { maxPolyphony: 8 })  // 3 notes × 2-3 overlapping triggers
        synth.set({
          modulationIndex: 3.5,      // Bell-like overtones
          harmonicity: 2,            // Octave relationship
          envelope: {
            attack: 0.01,            // Fast attack
            decay: 0.4,              // Moderate decay for bell character
            sustain: 0.3,            // Low sustain (piano-like)
            release: 0.8             // Smooth release
          },
          modulationEnvelope: {
            attack: 0.01,
            decay: 0.2,
            sustain: 0.2,
            release: 0.5
          }
        })
        return synth
      })(),

      // BACKGROUND COMPOSITION LAYERS - MonoSynth with distinctive timbres
      // backgroundHigh: Pulse wave (nasal, cutting) - for melody
      backgroundHigh: new Tone.MonoSynth({
        oscillator: {
          type: 'pulse',
          width: 0.3  // Narrow pulse = nasal, distinctive
        },
        volume: +5,
        envelope: {
          attack: 0.02,
          decay: 0.2,
          sustain: 0.7,
          release: 0.5
        }
      }),

      // backgroundMid: PWM (animated pulse) - for harmony/arpeggios
      backgroundMid: new Tone.MonoSynth({
        oscillator: {
          type: 'pwm',
          modulationFrequency: 0.5  // Slow modulation for movement
        },
        volume: +5,
        envelope: {
          attack: 0.05,
          decay: 0.3,
          sustain: 0.6,
          release: 0.8
        }
      }),

      // backgroundLow: Square wave (warm, hollow) - for bass lines
      backgroundLow: new Tone.MonoSynth({
        oscillator: {
          type: 'square'  // Warm, hollow - distinct from sawtooth bass
        },
        volume: +5,
        envelope: {
          attack: 0.1,
          decay: 0.3,
          sustain: 0.8,
          release: 1.0
        }
      })
    }

    // MONOSYNTH TIMING FIX: Track last trigger time per layer to avoid
    // "Start time must be strictly greater than previous start time" error
    this.monoSynthLastTrigger = {
      bass: 0,
      backgroundHigh: 0,
      backgroundMid: 0,
      backgroundLow: 0
    }

    // Create individual filters and volumes for each layer
    this.ambientFilters = {
      bass: new Tone.Filter({ type: 'lowpass', frequency: 150, Q: 1 }),    // Deep bass (50-150Hz)
      pad: new Tone.Filter({ type: 'lowpass', frequency: 800, Q: 1.5 }),   // Mid-range pad
      chords: new Tone.Filter({ type: 'lowpass', frequency: 6000, Q: 1 }),  // FM piano needs high frequencies
      backgroundHigh: new Tone.Filter({ type: 'lowpass', frequency: 5000, Q: 1 }),  // Pulse needs brightness
      backgroundMid: new Tone.Filter({ type: 'lowpass', frequency: 3000, Q: 1 }),   // PWM needs harmonics
      backgroundLow: new Tone.Filter({ type: 'lowpass', frequency: 1500, Q: 1.5 }) // Square needs body
    }

    // Background volumes - balanced with gestures
    this.ambientVolumes = {
      bass: new Tone.Volume(0),       // INCREASED for fuller low-end
      pad: new Tone.Volume(-3),       // Entry #27: Reduced from +6dB - was too loud
      chords: new Tone.Volume(0),     // Electric piano - balanced in mix
      backgroundHigh: new Tone.Volume(+3),  // INCREASED for audible composition
      backgroundMid: new Tone.Volume(+3),   // INCREASED for audible composition
      backgroundLow: new Tone.Volume(+3)    // INCREASED for audible composition
    }

    // Connect each layer with SEND/RETURN architecture
    // Routing: synth -> filter -> volume -> [dry to master + sends to FX]
    Object.keys(this.ambientLayers).forEach(layer => {
      this.ambientLayers[layer].connect(this.ambientFilters[layer])
      this.ambientFilters[layer].connect(this.ambientVolumes[layer])

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
        console.warn('DroneVoidController: droneAmplitudeGain not initialized - controller will use fallback volume control')
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
      volume: +3,  // INCREASED from -5dB - virtual taps must be audible over background!
      envelope: {
        attack: 0.02,  // Faster attack
        decay: 0.2,   // Faster decay
        sustain: 0.3,  // Lower sustain to prevent overlapping
        release: 0.8    // Faster release
      }
    })

    // MONOSYNTH TIMING FIX: Track last trigger time for gesture synth
    this.gestureSynthLastTrigger = 0

    // Add pan node for gesture synth spatial control
    this.gesturePan = new Tone.Panner(0)

    // SEND/RETURN routing: synth -> pan -> [dry to master + sends to FX]
    // Entry #109: gestureFilter removed (was static, never modulated after Entry #105)
    this.gestureSynth.connect(this.gesturePan)

    // Create volume node for gesture dry signal (increased for prominence)
    this.gestureVolume = new Tone.Volume(+6) // +6dB - gesture prominence over background

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
      console.warn('Drone amplitude modulation setup failed:', e.message)
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
    if (this.evolvingGenerationActive) return

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
    if (this.isInitialized) {
      // console.log('🛑 Stopping AudioService - immediate silence...')

      // Mark that user intentionally stopped audio (prevents auto-recovery)
      this._userStoppedAudio = true

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
   * Update sonic parameters from gesture data per FR-002
   * System MUST translate user gestures into real-time sonic parameter modifications
   * FIX: Restored background filter modulation and added polyphony management
   * @param {Object} sonicParams - Parameters from gesture processing
   */
  updateSonicParams(sonicParams) {
    if (!this.isInitialized || !this.gestureSynth) return

    try {
      // Real-time gesture-to-sonic parameter mapping per FR-002
      const frequency = this.mapGestureToFrequency(sonicParams)
      const volume = this.mapGestureToVolume(sonicParams)
      const filterParams = this.mapGestureToFilter(sonicParams)

      // Handle both old format (number) and new format (object) for backward compatibility
      let cutoffFrequency, resonance, tremoloAmount
      if (typeof filterParams === 'object' && filterParams !== null) {
        cutoffFrequency = filterParams.cutoffFrequency
        resonance = filterParams.resonance
        tremoloAmount = filterParams.tremoloAmount || 0
      } else {
        //  treat as cutoff frequency
        cutoffFrequency = filterFreq || 1000
        resonance = 1.0
        tremoloAmount = 0
      }

      // Entry #109: gestureFilter removed - tremolo still available if needed
      if (tremoloAmount > 0 && this.gestureSynth) {
        const currentTime = Tone.context && Tone.context.currentTime ? Tone.context.currentTime : Tone.now()
        this.applyTremolo(tremoloAmount, currentTime)
      }

      // Calculate three-tier duration based on gesture velocity
      const gestureVelocity = sonicParams.velocity || 200
      const tierDuration = this.calculateThreeTierDuration(gestureVelocity, '8n')

      // Trigger gesture-responsive note with three-tier duration
      // Use volume from gesture as velocity parameter (0.5-1.0 range for prominence)
      if (this.gestureSynth && this.gestureSynth.triggerAttackRelease) {
        // Higher velocity range for local gesture prominence
        const velocity = Math.max(0.5, Math.min(1.0, 0.5 + (volume * 0.5)))

        // console.log(`🔊 LOCAL GESTURE TRIGGER:`)
        // console.log(`  ↳ Frequency: ${frequency.toFixed(1)}Hz`)
        // console.log(`  ↳ Duration: ${tierDuration}s`)
        // console.log(`  ↳ Velocity: ${velocity.toFixed(2)}`)
        // console.log(`  ↳ Synth volume: ${this.gestureSynth.volume.value}dB`)
        // console.log(`  ↳ Active voices before: ${this.gestureSynth.activeVoices}`)

        // Trigger note with full velocity (no reduction multiplier)
        // Use safe trigger for MonoSynth timing compliance
        this.safeGestureSynthTrigger(frequency, tierDuration, undefined, velocity)

        // console.log(`  ↳ Active voices after: ${this.gestureSynth.activeVoices}`)
        // console.log(`  ↳ Trigger successful!`)
      } else {
        // console.warn('🔇 Gesture synth not available for note triggering')
      }

      // FIX: Update background filters with gesture modulation
      this.updateBackgroundFilters(sonicParams)

      // Log for performance monitoring per FR-006 (<200ms latency)
      const timestamp = performance.now()
      // console.log(`🎵 Gesture processed: ${frequency.toFixed(1)}Hz at ${timestamp.toFixed(1)}ms`)

    } catch (error) {
      // console.warn('Audio playback error:', error)
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
   * Update background filters - DISABLED
   * Ambient filters controlled by composition system only.
   * @deprecated
   * @param {Object} sonicParams - Unused
   */
  updateBackgroundFilters(sonicParams) {
    // Disabled - ambient filters controlled by composition only
  }

  /**
   * Calculate filter frequency from gesture parameters
   * @param {Object} sonicParams - Sonic parameters
   * @returns {number} Filter frequency
   */
  calculateFilterFrequency(sonicParams) {
    const y = sonicParams.y || 0.5
    return 200 + ((1 - y) * 3800) // 200Hz to 4000Hz, inverted Y axis
  }

  /**
   * Calculate filter resonance from gesture parameters
   * @param {Object} sonicParams - Sonic parameters
   * @returns {number} Filter resonance (Q)
   */
  calculateFilterResonance(sonicParams) {
    const x = sonicParams.x || 0.5
    return 0.5 + (x * 4.5) // 0.5 to 5.0 Q range
  }

  /**
   * SUSTAINED HOLD: Trigger sustained note attack (gate opens)
   * Uses triggerAttack without triggerRelease for open gate control
   * @param {number} frequency - Note frequency in Hz
   * @param {number} velocity - Note velocity (0-1)
   * @param {Object} position - Canvas position {x, y}
   * @param {string} userId - Optional user ID for per-user timbre routing
   * @param {boolean} isRemote - Whether this is a remote user's note (reduces volume)
   * @returns {Object|null} Note tracking data { noteId, frequency, startTime } or null if failed
   */
  triggerSustainedNoteAttack(frequency, velocity, position, userId = null, isRemote = false) {
    // Check audio context state - try to resume if suspended
    if (Tone.context.state !== 'running') {
      console.warn('⚠️ Audio context not running:', Tone.context.state, '- attempting resume')
      if (Tone.context.state === 'suspended') {
        Tone.context.resume()
      }
      return null
    }

    // Determine which synth to use based on userId
    let synth = this.gestureSynth
    let actualFrequency = frequency
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
    // User synths have their own envelope defined in patch
    if (!useUserSynth) {
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

    // Apply volume reduction for remote users (0.9 = slight reduction, was 0.7)
    const actualVelocity = isRemote ? velocity * 0.9 : velocity

    // CRITICAL: Use triggerAttack (NOT triggerAttackRelease)
    // This opens the gate without closing it
    synth.triggerAttack(actualFrequency, now, actualVelocity)

    // Track active sustained note for later release
    if (!this.activeSustainedNotes) {
      this.activeSustainedNotes = new Map()
    }

    this.activeSustainedNotes.set(noteId, {
      noteId,
      frequency: actualFrequency,
      startTime: Date.now(),
      position,
      velocity: actualVelocity,
      synth: synth,
      userId: userId,
      useUserSynth: useUserSynth
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

    // Remove from tracking
    this.activeSustainedNotes.delete(noteId)

    const duration = Date.now() - noteData.startTime
    // console.log(`🎵 Sustained note RELEASE: ${noteData.frequency.toFixed(1)}Hz, held ${duration}ms, noteId=${noteId}, user=${noteData.userId || 'local'}`)
  }

  /**
   * Check and manage polyphony to prevent audio overload
   */
  managePolyphony() {
    if (!this.generativeState || !this.generativeState.activeVoices) return

    const totalActiveVoices = this.generativeState.activeVoices.size

    // If we're exceeding polyphony limits, clean up old voices
    if (totalActiveVoices > this.maxTotalVoices) {
      const voicesToCleanup = totalActiveVoices - this.maxTotalVoices
      const now = Date.now()

      // Find oldest voices and release them
      const voicesByAge = Array.from(this.generativeState.activeVoices.entries())
        .sort((a, b) => a[1].startTime - b[1].startTime)

      for (let i = 0; i < voicesToCleanup && i < voicesByAge.length; i++) {
        const [voiceId, voiceData] = voicesByAge[i]

        // Release the voice if it's been playing for more than 1 second
        if (now - voiceData.startTime > 1000) {
          if (voiceData.synth) {
            // Support both PolySynth (releaseAll) and MonoSynth (triggerRelease)
            if (voiceData.synth.releaseAll) {
              voiceData.synth.releaseAll()
            } else if (voiceData.synth.triggerRelease) {
              voiceData.synth.triggerRelease()
            }
          }
          this.generativeState.activeVoices.delete(voiceId)
          // console.log(`🔇 Cleaned up voice ${voiceId} for polyphony management`)
        }
      }
    }
  }

  /**
   * Track a new voice for polyphony management
   * PERFORMANCE FIX: Check limits BEFORE adding voice to prevent race conditions
   * @param {string} voiceId - Unique voice identifier
   * @param {Object} synth - Synth instance
   * @param {number} duration - Note duration
   * @returns {boolean} True if voice was tracked, false if rejected
   */
  trackVoice(voiceId, synth, duration) {
    if (!this.generativeState) return false

    // PERFORMANCE FIX: Synchronous polyphony check BEFORE adding new voice
    // This prevents exceeding voice limit which causes audio stuttering
    const currentVoices = this.generativeState.activeVoices.size

    if (currentVoices >= this.maxTotalVoices) {
      // Force release of oldest voice to make room
      const oldest = this._getOldestVoice()
      if (oldest) {
        this._forceReleaseVoice(oldest)
      } else {
        // No voice to release, reject this one
        return false
      }
    }

    // Now safe to add the new voice
    this.generativeState.activeVoices.set(voiceId, {
      synth,
      startTime: Date.now(),
      duration
    })

    // Schedule voice cleanup using Transport for audio-thread timing
    const cleanupTime = Tone.now() + duration + 0.5 // 500ms buffer
    Tone.Transport.scheduleOnce(() => {
      if (this.generativeState?.activeVoices.has(voiceId)) {
        this.generativeState.activeVoices.delete(voiceId)
      }
    }, cleanupTime)

    return true
  }

  /**
   * Get the oldest active voice for polyphony management
   * @returns {string|null} Voice ID of oldest voice, or null if none
   */
  _getOldestVoice() {
    if (!this.generativeState?.activeVoices?.size) return null

    let oldestId = null
    let oldestTime = Infinity

    for (const [voiceId, voiceData] of this.generativeState.activeVoices.entries()) {
      if (voiceData.startTime < oldestTime) {
        oldestTime = voiceData.startTime
        oldestId = voiceId
      }
    }

    return oldestId
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
        // Force immediate release without scheduling
        if (voice.synth.releaseAll) {
          voice.synth.releaseAll(Tone.now())
        } else if (voice.synth.triggerRelease) {
          voice.synth.triggerRelease(Tone.now())
        }
      }
    } catch (e) {
      // Ignore errors during force release
    }

    this.generativeState.activeVoices.delete(voiceId)
  }

  /**
   * Map gesture coordinates to frequency per FR-002
   */
  mapGestureToFrequency(sonicParams) {
    // X coordinate maps to frequency (no musical theory constraints per FR-002)
    const x = sonicParams.x || sonicParams.frequency || 0.5
    return 100 + (x * 1000) // 100Hz to 1100Hz range
  }

  /**
   * Map gesture intensity to volume per FR-002
   */
  mapGestureToVolume(sonicParams) {
    // Y coordinate or intensity maps to volume
    const intensity = sonicParams.y || sonicParams.amplitude || sonicParams.intensity || 0.5
    return Math.max(0.1, Math.min(0.8, intensity))
  }

  /**
   * Map gesture movement to filter parameters per FR-002
   * FIX: Added validation to prevent null returns and implemented three-tier modulation
   */
  mapGestureToFilter(sonicParams) {
    const tier = sonicParams.tier || 'local'

    if (tier === 'local') {
      // LOCAL MODULATION: Y controls cutoff, X controls resonance
      const y = sonicParams.y || 0.5
      const x = sonicParams.x || 0.5

      const cutoff = 200 + ((1 - y) * 3800) // 200Hz to 4000Hz, inverted Y axis
      const resonance = 0.5 + (x * 4.5) // 0.5 to 5.0 Q range

      // console.log(`🎛️ Local filter modulation: Y=${y.toFixed(2)}→cutoff=${cutoff.toFixed(1)}Hz, X=${x.toFixed(2)}→resonance=${resonance.toFixed(2)}`)

      return {
        cutoffFrequency: cutoff,
        resonance: resonance,
        tremoloAmount: 0 // No tremolo for local modulation
      }
    } else if (tier === 'remote') {
      // REMOTE MODULATION: X = LFO speed, Y = LFO amplitude that modulates cutoff frequency
      const y = sonicParams.y || 0.5
      const x = sonicParams.x || 0.5

      // X controls LFO speed (0.05Hz to 10Hz)
      const lfoSpeed = 0.05 + (x * 9.95) // 0.05Hz to 10Hz

      // Y controls LFO amplitude (0% to 100% modulation depth)
      const lfoAmplitude = y // 0.0 to 1.0 (0% to 100%)

      // console.log(`🎛️ Remote LFO modulation: X=${x.toFixed(2)}→speed=${lfoSpeed.toFixed(2)}Hz, Y=${y.toFixed(2)}→amplitude=${(lfoAmplitude * 100).toFixed(0)}%`)

      return {
        lfoSpeed: lfoSpeed,
        lfoAmplitude: lfoAmplitude,
        isRemoteLFO: true
      }
    } else {
      // Background/default modulation (no tremolo)
      const movement = sonicParams?.z ?? sonicParams?.movement ?? sonicParams?.y ?? 0.5
      const validMovement = typeof movement === 'number' && !isNaN(movement) ? movement : 0.5
      const clampedMovement = Math.max(0, Math.min(1, validMovement))

      const filterFreq = 200 + (clampedMovement * 2000) // 200Hz to 2200Hz filter range
      // console.log(`🎛️ Background filter modulation: movement=${validMovement} → freq=${filterFreq.toFixed(1)}Hz`)

      return {
        cutoffFrequency: filterFreq,
        resonance: 1.0, // Default resonance for background
        tremoloAmount: 0 // No tremolo for background
      }
    }
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

    // FIX: Apply filter modulation from remote patterns
    if (patterns && patterns.length > 0) {
      // Calculate average position for filter modulation
      const avgPosition = {
        x: patterns.reduce((sum, p) => sum + (p.x || 0.5), 0) / patterns.length,
        y: patterns.reduce((sum, p) => sum + (p.y || 0.5), 0) / patterns.length,
        z: patterns.reduce((sum, p) => sum + (p.z || 0.5), 0) / patterns.length
      }

      // Apply remote filter modulation to background
      this.updateBackgroundFilters(avgPosition)
      // console.log(`🎛️ Applied remote filter modulation: x=${avgPosition.x.toFixed(2)}, y=${avgPosition.y.toFixed(2)}`)
    }

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
   * Play background composition generated by CompositionEngine
   * Handles polyphonic, homophonic, and ambient compositions
   * @param {Object} composition - Composition from BackgroundCompositionService
   */
  playComposition(composition, isDrone = false) {
    // console.log(`🎼 playComposition called - isDrone: ${isDrone}, isInitialized: ${this.isInitialized}, muted: ${this.muted}, type: ${composition?.type}`)

    if (!this.isInitialized || this.muted) {
      // console.log('🔇 playComposition blocked - initialized:', this.isInitialized, 'muted:', this.muted)
      return
    }

    if (!composition || !composition.content) {
      console.warn('🎼 Invalid composition data')
      return
    }

    const tempo = composition.metadata?.tempo || 120

    // console.log(`🎼 Playing ${composition.type} composition${isDrone ? ' (DRONE)' : ''}:`, {
//      form: composition.structure?.form,
//      section: composition.structure?.currentSection,
//      tempo: tempo,
//      key: composition.metadata?.keyCenter
//    })

    // If this is NOT a drone and we have a drone loop running, stop it
    if (!isDrone && this.droneLoopInterval) {
      // console.log('🛑 Stopping drone loop - real composition starting')
      clearInterval(this.droneLoopInterval)
      this.droneLoopInterval = null
    }

    const content = composition.content
    const type = composition.type

    try {
      if (type === 'polyphonic' && content.voices) {
        this.playPolyphonicComposition(content, tempo)
      } else if (type === 'homophonic' && content.melody) {
        this.playHomophonicComposition(content, tempo)
      } else if (type === 'ambient' && content.texture) {
        this.playAmbientComposition(content, tempo, isDrone)
      } else {
        // console.warn('🎼 Unknown composition type:', type)
      }
    } catch (error) {
      // console.error('🎼 Error playing composition:', error)
    }
  }

  /**
   * Play polyphonic composition (multiple voices)
   * REAL-TIME FIX: Uses Tone.Transport.schedule instead of setTimeout for rock-solid timing
   * @param {Object} content - Composition content with voices
   * @param {number} tempo - Tempo in BPM (30-300)
   */
  playPolyphonicComposition(content, tempo = 120) {
    if (!content.voices || !Array.isArray(content.voices)) return

    // Calculate beat duration from tempo: beatDuration = 60 / BPM
    const beatDuration = 60 / tempo

    // REAL-TIME FIX: Use audio context time with lookahead for precise scheduling
    const now = Tone.now()
    const lookahead = 0.1 // 100ms lookahead for stable scheduling

    // Ensure Transport is running for scheduled events
    if (Tone.Transport.state !== 'started') {
      Tone.Transport.start()
    }

    // Role-based configuration (pre-allocated, no allocation during playback)
    const roleConfigs = {
      'melody': { layer: 'backgroundHigh', velocity: 0.10 },
      'harmony': { layer: 'backgroundMid', velocity: 0.06 },
      'bass': { layer: 'backgroundLow', velocity: 0.08 },
      'pad': { layer: 'backgroundLow', velocity: 0.04 }
    }
    const defaultConfig = { layer: 'backgroundMid', velocity: 0.06 }

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
        const delay = (note.startBeat || 0) * beatDuration
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
  }

  /**
   * Play homophonic composition (melody + accompaniment)
   * REAL-TIME FIX: Uses Tone.Transport.schedule instead of setTimeout
   * @param {Object} content - Composition content
   * @param {number} tempo - Tempo in BPM
   */
  playHomophonicComposition(content, tempo = 120) {
    const beatDuration = 60 / tempo
    const now = Tone.now()
    const lookahead = 0.1

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
        const velocity = 0.12
        const delay = (note.startBeat || i * 0.5) * beatDuration
        const scheduleTime = now + lookahead + delay

        const eventId = Tone.Transport.schedule((audioTime) => {
          // Use safe trigger for MonoSynth timing compliance
          this.safeMonoSynthTrigger('backgroundHigh', frequency, duration, audioTime, velocity)
        }, scheduleTime)
        this.scheduledTransportEvents.push(eventId)
      }
    }

    if (content.accompaniment) {
      this.playAccompaniment(content.accompaniment, tempo)
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
    const now = Tone.now()
    const lookahead = 0.1

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
          const delay = (chordIndex * 2 + noteIndex * 0.25) * beatDuration
          const scheduleTime = now + lookahead + delay

          const eventId = Tone.Transport.schedule((audioTime) => {
            // Use safe trigger for MonoSynth timing compliance
            this.safeMonoSynthTrigger('backgroundMid', frequency, duration, audioTime, 0.06)
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
            this.safeMonoSynthTrigger('backgroundLow', frequency, duration, audioTime, 0.05)
          }, scheduleTime)
          this.scheduledTransportEvents.push(eventId)
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

    // Clear ALL existing drone repeat events (FIX: was only clearing one, causing leak)
    if (this.droneRepeatEventIds && this.droneRepeatEventIds.length > 0) {
      for (const eventId of this.droneRepeatEventIds) {
        Tone.Transport.clear(eventId)
      }
      // console.log(`🧹 Cleared ${this.droneRepeatEventIds.length} drone repeat events`)
      this.droneRepeatEventIds = []
    }
    // Legacy cleanup (single event ID)
    if (this.droneRepeatEventId) {
      Tone.Transport.clear(this.droneRepeatEventId)
      this.droneRepeatEventId = null
    }

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
      const velocity = textureItem.velocity || 0.2
      // Entry #117: Drone notes should play simultaneously (no stagger)
      // Non-drone textures can stagger for rhythmic interest
      const delay = isDrone ? 0 : index * 0.5
      const layerName = isDrone ? 'pad' : 'backgroundLow'

      // Entry #90: Skip if layer is disabled by audio profile settings
      if (!this._isLayerEnabled(layerName)) {
        console.log(`🔇 Skipping ${layerName} - layer disabled by profile (backgroundLayers: ${JSON.stringify(this.audioProfile?.backgroundLayers)})`)
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
          }
        }, duration, repeatStartTime)
        this.droneRepeatEventIds.push(repeatEventId)
        this.scheduledTransportEvents.push(repeatEventId)
      } else {
        // For non-drone textures, use relative time scheduling
        const relativeTime = `+${0.1 + delay}`
        const eventId = Tone.Transport.schedule((audioTime) => {
          // Use safe trigger for MonoSynth timing compliance (backgroundLow is MonoSynth)
          this.safeMonoSynthTrigger(layerName, frequency, duration, audioTime, velocity)
        }, relativeTime)
        this.scheduledTransportEvents.push(eventId)
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

    // For PolySynth layers, just trigger normally
    if (!this.monoSynthLastTrigger || !(layerName in this.monoSynthLastTrigger)) {
      layer.triggerAttackRelease(frequency, duration, time, velocity)
      return
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

    // Convert relative time strings ("+0.5") to absolute time
    let requestedTime
    if (time === undefined) {
      requestedTime = Tone.now()
    } else if (typeof time === 'string' && time.startsWith('+')) {
      requestedTime = Tone.now() + parseFloat(time.substring(1))
    } else {
      requestedTime = time
    }

    const lastTime = this.gestureSynthLastTrigger || 0
    const minGap = 0.005  // 5ms minimum gap between notes
    const safeTime = Math.max(requestedTime, lastTime + minGap)

    // Update last trigger time
    this.gestureSynthLastTrigger = safeTime

    try {
      this.gestureSynth.triggerAttackRelease(frequency, duration, safeTime, velocity)
    } catch (err) {
      // If still failing, force release and retry with fresh timing
      try {
        this.gestureSynth.triggerRelease()
        const freshTime = Tone.now() + 0.01
        this.gestureSynthLastTrigger = freshTime
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
   * @param {Object} musicalEvent - Musical event data
   */
  playMusicalEvent(musicalEvent) {
    // CRITICAL: Check AudioContext state - if suspended, try to resume
    if (Tone.context?.state === 'suspended') {
      Tone.context.resume()
    }

    if (!this.isInitialized || !musicalEvent || this.muted) {
      return
    }

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

      // Duration already determined by velocity in frontend (32n/16n/8n)
      // Only apply velocity boost for accents
      if (articulation === 'marcato') {
        adjustedVelocity *= 1.2 // Slightly louder for accented notes
      }

      // Final duration clamping
      adjustedDuration = Math.max(0.02, Math.min(3.0, adjustedDuration))

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
          console.log('🔇 Transport callback - gestureSynth not available')
          return
        }

        try {
          let synth = null
          let actualFrequency = eventFrequency
          let synthData = null  // Entry #66 FIX: Declare outside if block for visibility

          if (userId && this.userSynthManager) {
            synthData = this.userSynthManager.getSynthForUser(userId)
            if (synthData && synthData.synth && !synthData.synth.disposed) {
              synth = synthData.synth
              actualFrequency = this.userSynthManager.constrainFrequencyToTessitura(eventFrequency, userId)

              // DEBUG: Log patch name for troubleshooting timbre issues
              console.log(`🎹 PATCH: "${synthData.patch?.name}" | slot=${synthData.slot} | freq=${actualFrequency.toFixed(0)}Hz | dur=${eventDuration.toFixed(2)}s | vel=${eventVelocity.toFixed(2)} | ultraLow=${this.isUltraLowPowerMode}`)

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
            // Entry #90 FIX: Use sine oscillator in Ultra-Low Power mode
            const oscType = this.isUltraLowPowerMode ? 'sine' : 'sawtooth'
            this.gestureSynth.set({
              oscillator: { type: oscType },
              envelope: {
                attack: envAttack,
                decay: envDecay,
                sustain: envSustain,
                release: envRelease
              }
            })
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
          let safeTime = time

          if (synthData && synthData.lastTriggerTime !== undefined) {
            // UserSynthManager synth - use its lastTriggerTime
            safeTime = Math.max(time, synthData.lastTriggerTime + minGap)
            synthData.lastTriggerTime = safeTime
          } else if (synth === this.gestureSynth) {
            // Fallback gestureSynth - use gestureSynthLastTrigger
            safeTime = Math.max(time, (this.gestureSynthLastTrigger || 0) + minGap)
            this.gestureSynthLastTrigger = safeTime
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
              else this.gestureSynthLastTrigger = freshTime
              synth.triggerAttackRelease(actualFrequency, eventDuration, freshTime, finalVelocity)
            } catch (retryErr) {
              // Silently fail - note will be skipped
            }
          }
        } catch (e) {
          console.log('❌ triggerAttackRelease error:', e.message)
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

      const now = Tone.now()
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
    const filterUpdateHz = typeof PlatformDetection !== 'undefined'
      ? PlatformDetection.getFilterUpdateRate()
      : 30
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
   * Play a simple note with frequency, duration and volume
   * Entry #106: Simplified replacement for removed three-tier system
   * @param {number} frequency - Note frequency in Hz
   * @param {number} duration - Duration in seconds (default 0.3)
   * @param {number} volume - Volume 0-1 (default 0.5)
   */
  playSimpleNote(frequency, duration = 0.3, volume = 0.5) {
    if (!this.isInitialized || !this.gestureSynth) return
    this.safeGestureSynthTrigger(frequency, duration, undefined, volume)
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
      this.gestureSynth.volume.value = -6 // Reset to normal volume
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

    // DELAY MODULATION: Only modulate delay time, keep feedback fixed at 0.55 (like normal rooms)
    if (this.delay) {
      // Delay time: faster with higher rhythmic density (100ms - 200ms range)
      // Matches normal rooms baseline of 0.2s at low density
      if (parameters.rhythmicDensity !== undefined) {
        const delayTime = 0.2 - (parameters.rhythmicDensity * 0.1)  // At density=0: 0.2s, at density=1: 0.1s
        this.delay.delayTime.rampTo(Math.max(0.1, delayTime), 2)  // Smooth 2s transition
      }
      // Feedback: FIXED at 0.55 (same as normal rooms, no modulation)
    }

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
}

// Export singleton instance
// Make AudioService available globally
window.AudioService = AudioService