/**
 * MusicalScheduler - Clock-consistent scheduler for Webarmonium
 *
 * This scheduler prioritizes maintaining a constant, predictable clock
 * over low latency, ensuring perfect synchronization between local
 * and remote gestures. Remote events may wait but will always be
 * scheduled in perfect sync with the local clock.
 */
// Use Tone.js from global window object

class MusicalScheduler {
  constructor() {
    this.isInitialized = false;
    this.isRunning = false;
    this.tempo = 120;
    this.timeSignature = [4, 4];
    this.lookahead = 0.1; // 100ms lookahead for scheduling
    this.scheduleAheadTime = 0.25; // Schedule events 250ms ahead
    this.nextTickTime = 0;
    this.timerWorker = null;

    // Event queues for different sources
    this.localEventQueue = [];
    this.remoteEventQueue = [];
    this.scheduledEvents = new Map(); // Track scheduled events

    // Clock synchronization
    this.localClockOffset = 0;
    this.remoteClockTolerance = 0.05; // 50ms tolerance for remote events
    this.lastProcessedRemoteTime = 0;

    // Musical timing tracking
    this.currentBar = 0;
    this.currentBeat = 0;
    this.currentSixteenth = 0;

    // Event listeners
    this.eventListeners = {
      'tick': [],
      'beat': [],
      'bar': [],
      'event:scheduled': [],
      'event:executed': []
    };

    this._initialize();
  }

  /**
   * Initialize the scheduler with Tone.js Transport
   */
  _initialize() {
    if (this.isInitialized) return;

    try {
      // Configure Tone.js Transport for precise timing
      if (window.Tone && window.Tone.Transport) {
        window.Tone.Transport.bpm.value = this.tempo;
        window.Tone.Transport.timeSignature = this.timeSignature;
      }

      // Initialize the scheduling worker
      this._initializeSchedulingWorker();

      this.isInitialized = true;
      // console.log('[MusicalScheduler] Initialized with clock consistency priority');
    } catch (error) {
      // console.error('[MusicalScheduler] Initialization failed:', error);
    }
  }

  /**
   * Initialize web worker for precise timing
   */
  _initializeSchedulingWorker() {
    // Create worker code as a blob for precise timing
    const workerCode = `
      let timerID = null;
      let interval = 25; // 25ms intervals for precise scheduling

      self.onmessage = function(e) {
        if (e.data === 'start') {
          timerID = setInterval(() => {
            self.postMessage('tick');
          }, interval);
        } else if (e.data === 'stop') {
          clearInterval(timerID);
          timerID = null;
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);

    this.timerWorker = new Worker(workerUrl);
    this.timerWorker.onmessage = () => this._schedulerTick();
  }

  /**
   * Start the musical scheduler
   */
  start() {
    if (!this.isInitialized) {
      this._initialize();
    }

    if (this.isRunning) return;

    try {
      // Start Tone.js Transport
      if (window.Tone && window.Tone.Transport) {
        window.Tone.Transport.start();
      }

      // Start our scheduling worker
      this.timerWorker.postMessage('start');

      this.isRunning = true;
      this.nextTickTime = (window.Tone && window.Tone.Now) ? window.Tone.Now() : Date.now() / 1000 + this.lookahead;

      // console.log('[MusicalScheduler] Started - prioritizing clock consistency');
      this._emit('scheduler:started', {
        tempo: this.tempo,
        timeSignature: this.timeSignature
      });
    } catch (error) {
      // console.error('[MusicalScheduler] Failed to start:', error);
    }
  }

  /**
   * Stop the musical scheduler
   */
  stop() {
    if (!this.isRunning) return;

    try {
      // Stop Tone.js Transport
      if (window.Tone && window.Tone.Transport) {
        window.Tone.Transport.stop();
      }

      // Stop scheduling worker
      this.timerWorker.postMessage('stop');

      this.isRunning = false;

      // Clear all scheduled events
      this.scheduledEvents.clear();
      this.localEventQueue.length = 0;
      this.remoteEventQueue.length = 0;

      // console.log('[MusicalScheduler] Stopped');
      this._emit('scheduler:stopped');
    } catch (error) {
      // console.error('[MusicalScheduler] Failed to stop:', error);
    }
  }

  /**
   * Main scheduling tick - maintains clock consistency
   */
  _schedulerTick() {
    if (!this.isRunning) return;

    const currentTime = (window.Tone && window.Tone.Now) ? window.Tone.Now() : Date.now() / 1000;

    // Update next tick time for precise intervals
    while (this.nextTickTime < currentTime + this.scheduleAheadTime) {
      this._processTick(this.nextTickTime);
      this.nextTickTime += 0.025; // 25ms ticks (40Hz)
    }
  }

  /**
   * Process a single scheduling tick
   */
  _processTick(tickTime) {
    // Update musical position
    this._updateMusicalPosition(tickTime);

    // Process local events (immediate scheduling)
    this._processLocalEvents(tickTime);

    // Process remote events with clock synchronization
    this._processRemoteEvents(tickTime);

    // Emit tick event for position tracking
    this._emit('tick', {
      time: tickTime,
      bar: this.currentBar,
      beat: this.currentBeat,
      sixteenth: this.currentSixteenth,
      position: (window.Tone && window.Tone.Transport) ? window.Tone.Transport.position : '0:0:0'
    });
  }

  /**
   * Update current musical position
   */
  _updateMusicalPosition(time) {
    const position = (window.Tone && window.Tone.Transport) ? window.Tone.Transport.position : '0:0:0';
    const parts = position.split(':');

    if (parts.length >= 3) {
      this.currentBar = parseInt(parts[0]) || 0;
      this.currentBeat = parseInt(parts[1]) || 0;
      this.currentSixteenth = parseInt(parts[2]) || 0;

      // Emit musical position events
      if (this.currentSixteenth === 0) {
        this._emit('beat', {
          bar: this.currentBar,
          beat: this.currentBeat,
          time: time
        });

        if (this.currentBeat === 0) {
          this._emit('bar', {
            bar: this.currentBar,
            time: time
          });
        }
      }
    }
  }

  /**
   * Process local events (highest priority)
   */
  _processLocalEvents(tickTime) {
    // Sort local events by time
    this.localEventQueue.sort((a, b) => a.time - b.time);

    while (this.localEventQueue.length > 0) {
      const event = this.localEventQueue[0];

      if (event.time <= tickTime + this.lookahead) {
        this.localEventQueue.shift();
        this._executeEvent(event, 'local');
      } else {
        break;
      }
    }
  }

  /**
   * Process remote events with clock synchronization
   */
  _processRemoteEvents(tickTime) {
    // Sort remote events by time
    this.remoteEventQueue.sort((a, b) => a.time - b.time);

    while (this.remoteEventQueue.length > 0) {
      const event = this.remoteEventQueue[0];

      // Calculate scheduled time with clock synchronization
      const scheduledTime = this._calculateSynchronizedTime(event, tickTime);

      if (scheduledTime <= tickTime + this.scheduleAheadTime) {
        this.remoteEventQueue.shift();

        // Schedule event at synchronized time
        this._scheduleEventAtTime(event, scheduledTime, 'remote');
      } else {
        break;
      }
    }
  }

  /**
   * Calculate synchronized time for remote events
   * This ensures remote events align with our local clock
   */
  _calculateSynchronizedTime(event, currentTickTime) {
    const eventTime = event.time;

    // Convert remote timestamp to local clock time
    const localTime = eventTime + this.localClockOffset;

    // Find the next musical grid position that accommodates this event
    const nextGridPosition = this._findNextGridPosition(localTime, currentTickTime);

    // Don't schedule too far in the past
    const minTime = currentTickTime + 0.01; // 10ms minimum delay
    const finalTime = Math.max(nextGridPosition, minTime);

    return finalTime;
  }

  /**
   * Find the next suitable grid position for timing alignment
   */
  _findNextGridPosition(targetTime, currentTime) {
    // Get current transport position and calculate grid intervals
    const secondsPerBeat = 60 / this.tempo;
    const secondsPerSixteenth = secondsPerBeat / 4;

    // Calculate how many sixteenth notes until the target
    const currentTimePos = (window.Tone && window.Tone.Transport) ? window.Tone.Transport.secondsToTime(currentTime) : '0:0:0';
    const targetTimePos = (window.Tone && window.Tone.Transport) ? window.Tone.Transport.secondsToTime(targetTime) : '0:0:0';

    // Find the next sixteenth note boundary after the target
    let scheduledTime = targetTime;

    // Snap to nearest sixteenth note boundary for better groove
    const sixteenthRemainder = targetTime % secondsPerSixteenth;
    if (sixteenthRemainder > 0) {
      scheduledTime = targetTime + (secondsPerSixteenth - sixteenthRemainder);
    }

    // Ensure we're not scheduling too close to current time
    if (scheduledTime < currentTime + 0.01) {
      const nextSixteenth = Math.ceil((currentTime + 0.01) / secondsPerSixteenth);
      scheduledTime = nextSixteenth * secondsPerSixteenth;
    }

    return scheduledTime;
  }

  /**
   * Execute an event immediately
   */
  _executeEvent(event, source) {
    try {
      // Execute the callback
      if (typeof event.callback === 'function') {
        event.callback(event.data);
      }

      // Track execution
      this._emit('event:executed', {
        eventId: event.id,
        source: source,
        time: (window.Tone && window.Tone.Now) ? window.Tone.Now() : Date.now() / 1000,
        data: event.data
      });

      // Remove from tracking
      if (this.scheduledEvents.has(event.id)) {
        this.scheduledEvents.delete(event.id);
      }
    } catch (error) {
      // console.error('[MusicalScheduler] Event execution failed:', error);
    }
  }

  /**
   * Schedule an event at a specific time
   */
  _scheduleEventAtTime(event, time, source) {
    const eventId = this._generateEventId();

    const scheduledEvent = {
      ...event,
      id: eventId,
      scheduledTime: time,
      source: source
    };

    // Track the scheduled event
    this.scheduledEvents.set(eventId, scheduledEvent);

    // Schedule with Tone.js Transport
    if (window.Tone && window.Tone.Transport && window.Tone.Transport.schedule) {
      window.Tone.Transport.schedule((scheduledTime) => {
        this._executeEvent(scheduledEvent, source);
      }, time);
    }

    this._emit('event:scheduled', {
      eventId: eventId,
      source: source,
      scheduledTime: time,
      data: event.data
    });
  }

  /**
   * Schedule a local gesture event (immediate priority)
   */
  scheduleLocalEvent(callback, data, time = null) {
    const event = {
      id: this._generateEventId(),
      callback: callback,
      data: data,
      time: time || ((window.Tone && window.Tone.Now) ? window.Tone.Now() : Date.now() / 1000),
      timestamp: Date.now()
    };

    this.localEventQueue.push(event);
    return event.id;
  }

  /**
   * Schedule a remote gesture event (clock-synced priority)
   */
  scheduleRemoteEvent(callback, data, timestamp = null) {
    const event = {
      id: this._generateEventId(),
      callback: callback,
      data: data,
      time: timestamp || Date.now(),
      timestamp: timestamp || Date.now(),
      remoteTimestamp: timestamp
    };

    this.remoteEventQueue.push(event);
    return event.id;
  }

  /**
   * Cancel a scheduled event
   */
  cancelEvent(eventId) {
    // Remove from queues
    this.localEventQueue = this.localEventQueue.filter(e => e.id !== eventId);
    this.remoteEventQueue = this.remoteEventQueue.filter(e => e.id !== eventId);

    // Cancel in Tone.js if already scheduled
    if (this.scheduledEvents.has(eventId)) {
      if (window.Tone && window.Tone.Transport && window.Tone.Transport.clear) {
        window.Tone.Transport.clear(eventId);
      }
      this.scheduledEvents.delete(eventId);
    }
  }

  /**
   * Set tempo (BPM)
   */
  setTempo(bpm, rampTime = 1) {
    this.tempo = bpm;

    if (this.isInitialized && window.Tone && window.Tone.Transport) {
      window.Tone.Transport.bpm.rampTo(bpm, rampTime);
    }

    this._emit('tempo:changed', { bpm: bpm, rampTime: rampTime });
  }

  /**
   * Set time signature
   */
  setTimeSignature(numerator, denominator = 4) {
    this.timeSignature = [numerator, denominator];

    if (this.isInitialized && window.Tone && window.Tone.Transport) {
      window.Tone.Transport.timeSignature = this.timeSignature;
    }

    this._emit('timeSignature:changed', {
      numerator: numerator,
      denominator: denominator
    });
  }

  /**
   * Get current transport position in musical terms
   */
  getMusicalPosition() {
    return {
      bar: this.currentBar,
      beat: this.currentBeat,
      sixteenth: this.currentSixteenth,
      position: (window.Tone && window.Tone.Transport) ? window.Tone.Transport.position : '0:0:0',
      seconds: (window.Tone && window.Tone.Transport) ? window.Tone.Transport.seconds : 0,
      tempo: this.tempo
    };
  }

  /**
   * Convert seconds to musical time string
   */
  secondsToMusicalTime(seconds) {
    if (!this.isInitialized || !window.Tone || !window.Tone.Transport) return '0:0:0';
    return window.Tone.Transport.secondsToTime(seconds);
  }

  /**
   * Convert musical time string to seconds
   */
  musicalTimeToSeconds(musicalTime) {
    if (!this.isInitialized || !window.Tone || !window.Tone.Transport) return 0;
    return window.Tone.Transport.timeToSeconds(musicalTime);
  }

  /**
   * Get scheduling status and metrics
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isRunning: this.isRunning,
      tempo: this.tempo,
      timeSignature: this.timeSignature,
      currentMusicalPosition: this.getMusicalPosition(),
      queuedEvents: {
        local: this.localEventQueue.length,
        remote: this.remoteEventQueue.length
      },
      scheduledEvents: this.scheduledEvents.size,
      clockOffset: this.localClockOffset
    };
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event]
        .filter(cb => cb !== callback);
    }
  }

  /**
   * Emit event to listeners
   */
  _emit(event, data) {
    if (this.eventListeners[event]) {
      this.eventListeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          // console.error(`[MusicalScheduler] Event listener error for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Generate unique event ID
   */
  _generateEventId() {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stop();

    if (this.timerWorker) {
      this.timerWorker.terminate();
      this.timerWorker = null;
    }

    // Clear all references
    this.localEventQueue.length = 0;
    this.remoteEventQueue.length = 0;
    this.scheduledEvents.clear();
    this.eventListeners = {};

    this.isInitialized = false;
    // console.log('[MusicalScheduler] Disposed');
  }
}

// Make available globally
window.MusicalScheduler = MusicalScheduler;