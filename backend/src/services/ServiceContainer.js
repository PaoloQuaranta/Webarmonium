/**
 * ServiceContainer - Dependency Injection Container
 * Manages service instantiation, wiring, and lifecycle
 * Provides centralized service management for the application
 */

class ServiceContainer {
  constructor () {
    this.services = new Map()
    this.factories = new Map()
    this.singletons = new Map()
    this.initialized = false
  }

  /**
   * Register a service factory
   * @param {string} name - Service name
   * @param {Function} factory - Factory function that creates the service
   * @param {Object} options - Registration options
   * @param {boolean} options.singleton - Whether to cache instance (default: true)
   * @param {string[]} options.dependencies - Names of required dependencies
   */
  register (name, factory, options = {}) {
    const { singleton = true, dependencies = [] } = options

    this.factories.set(name, {
      factory,
      singleton,
      dependencies
    })

    return this
  }

  /**
   * Register an existing instance as a service
   * @param {string} name - Service name
   * @param {Object} instance - Service instance
   */
  registerInstance (name, instance) {
    this.singletons.set(name, instance)
    this.services.set(name, instance)
    return this
  }

  /**
   * Get a service by name
   * @param {string} name - Service name
   * @returns {Object} Service instance
   */
  get (name) {
    // Check if already instantiated
    if (this.services.has(name)) {
      return this.services.get(name)
    }

    // Check singletons
    if (this.singletons.has(name)) {
      return this.singletons.get(name)
    }

    // Create from factory
    const registration = this.factories.get(name)
    if (!registration) {
      throw new Error(`Service '${name}' not registered`)
    }

    // Resolve dependencies first
    const deps = registration.dependencies.map(dep => this.get(dep))

    // Create instance
    const instance = registration.factory(...deps)

    // Cache if singleton
    if (registration.singleton) {
      this.singletons.set(name, instance)
    }

    this.services.set(name, instance)
    return instance
  }

  /**
   * Check if a service is registered
   * @param {string} name - Service name
   * @returns {boolean}
   */
  has (name) {
    return this.factories.has(name) || this.singletons.has(name)
  }

  /**
   * Get all registered service names
   * @returns {string[]}
   */
  getServiceNames () {
    return [...new Set([...this.factories.keys(), ...this.singletons.keys()])]
  }

  /**
   * Initialize all registered services
   * Useful for eager loading and validation
   */
  initializeAll () {
    if (this.initialized) return this

    for (const name of this.factories.keys()) {
      this.get(name)
    }

    this.initialized = true
    return this
  }

  /**
   * Get all services as a plain object
   * Compatible with existing code that expects services object
   * @returns {Object} Services object
   */
  toObject () {
    const obj = {}
    for (const [name, instance] of this.services) {
      obj[name] = instance
    }
    for (const [name, instance] of this.singletons) {
      obj[name] = instance
    }
    return obj
  }

  /**
   * Wire up services with their dependencies
   * Call after all services are created to handle circular dependencies
   * @param {Object} wiring - Object mapping service names to wiring functions
   */
  wire (wiring) {
    for (const [serviceName, wireFunc] of Object.entries(wiring)) {
      const service = this.get(serviceName)
      if (service && typeof wireFunc === 'function') {
        wireFunc(service, this)
      }
    }
    return this
  }

  /**
   * Reset the container (useful for testing)
   */
  reset () {
    this.services.clear()
    this.singletons.clear()
    this.initialized = false
    return this
  }
}

/**
 * Create and configure the application service container
 * @param {Object} config - Configuration options
 * @param {Object} config.io - Socket.IO instance
 * @returns {ServiceContainer}
 */
function createServiceContainer (config = {}) {
  const container = new ServiceContainer()

  // Register external dependencies
  if (config.io) {
    container.registerInstance('io', config.io)
  }

  // Register core services
  container.register('roomManager', () => {
    const RoomManager = require('./RoomManager')
    return new RoomManager()
  })

  container.register('gestureProcessor', (roomManager) => {
    const GestureProcessor = require('./GestureProcessor')
    return new GestureProcessor(roomManager)
  }, { dependencies: ['roomManager'] })

  container.register('environmentalMemoryCoordinator', (roomManager) => {
    const EnvironmentalMemoryCoordinator = require('./EnvironmentalMemoryCoordinator')
    return new EnvironmentalMemoryCoordinator(roomManager)
  }, { dependencies: ['roomManager'] })

  container.register('gestureToMusicService', () => {
    const GestureToMusicService = require('./GestureToMusicService')
    return new GestureToMusicService()
  })

  container.register('backgroundCompositionService', () => {
    const BackgroundCompositionService = require('./BackgroundCompositionService')
    return new BackgroundCompositionService()
  })

  // Landing page services
  container.register('webMetricsPoller', () => {
    const WebMetricsPoller = require('./WebMetricsPoller')
    return new WebMetricsPoller()
  })

  // Virtual user service for solo mode in normal rooms and landing page
  container.register('virtualUserService', () => {
    const VirtualUserService = require('./VirtualUserService')
    return new VirtualUserService()
  })

  // Audition gesture service for SynthPanel audition feature
  container.register('auditionGestureService', () => {
    const AuditionGestureService = require('./AuditionGestureService')
    return new AuditionGestureService()
  })

  // Connection tracker for polling lifecycle control
  container.register('connectionTracker', () => {
    const ConnectionTracker = require('./ConnectionTracker')
    return new ConnectionTracker()
  })

  // Shared StyleAnalyzer singleton - eliminates redundant computation
  // When 3 services each had their own instance, every gesture triggered
  // analyzeGestureStyle() 3 times. Now all services share one instance.
  container.register('styleAnalyzer', () => {
    const StyleAnalyzer = require('./StyleAnalyzer')
    return new StyleAnalyzer()
  })

  return container
}

/**
 * Wire up service dependencies after creation
 * Handles circular dependencies and service linking
 * @param {ServiceContainer} container - Service container
 * @param {Object} config - Configuration with io instance
 */
function wireServices (container, config = {}) {
  container.wire({
    gestureToMusicService: (service, c) => {
      // Entry #171 fix: Link WebMetricsPoller for fresh metrics on real user gestures
      // Without this, real users would use stale metrics synced only during composition cycles
      const webMetricsPoller = c.get('webMetricsPoller')
      service.setWebMetricsPoller(webMetricsPoller)

      // Share StyleAnalyzer singleton to eliminate redundant computation
      const sharedStyleAnalyzer = c.get('styleAnalyzer')
      if (typeof service.setSharedStyleAnalyzer === 'function') {
        service.setSharedStyleAnalyzer(sharedStyleAnalyzer)
      }
    },
    backgroundCompositionService: (service, c) => {
      // Share StyleAnalyzer singleton to eliminate redundant computation
      const sharedStyleAnalyzer = c.get('styleAnalyzer')
      if (typeof service.setSharedStyleAnalyzer === 'function') {
        service.setSharedStyleAnalyzer(sharedStyleAnalyzer)
      }

      // Link to gesture service for harmonic sync
      const gestureToMusicService = c.get('gestureToMusicService')
      service.setGestureToMusicService(gestureToMusicService)

      // Entry #209: Share HarmonicEngine with GestureToMusicService
      // This ensures gesture processing uses the same harmonic context as background compositions,
      // eliminating state divergence and race conditions between the two systems.
      if (service.harmonicEngine) {
        gestureToMusicService.setSharedHarmonicEngine(service.harmonicEngine)
      } else {
        console.warn('BackgroundCompositionService missing harmonicEngine - cannot share with GestureToMusicService')
      }

      // Entry #163: Link WebMetricsPoller for key initialization (same as LandingCompositionService)
      // This allows rooms to initialize starting key from web metrics
      const webMetricsPoller = c.get('webMetricsPoller')
      service.setWebMetricsPoller(webMetricsPoller)

      // Entry #213: Link VirtualUserService for harmonic context sync in solo mode
      // Virtual users must receive key/mode updates when background composition modulates
      const virtualUserService = c.get('virtualUserService')
      service.setVirtualUserService(virtualUserService)

      // Set Socket.IO for broadcasting
      if (config.io) {
        service.setSocketIO(config.io)
      }
    },
    virtualUserService: (service, c) => {
      // Link WebMetricsPoller for activity tracking and metrics
      const webMetricsPoller = c.get('webMetricsPoller')
      service.setWebMetricsPoller(webMetricsPoller)

      // CRITICAL: Link BackgroundCompositionService
      // Virtual user gestures must contribute to background composition
      const backgroundCompositionService = c.get('backgroundCompositionService')
      service.setBackgroundCompositionService(backgroundCompositionService)

      // Set Socket.IO for broadcasting
      if (config.io) {
        service.setSocketIO(config.io)

        // Emit metrics-update to landing room when new metrics are available
        // (Replaces old LandingCompositionService.updateMetrics callback)
        const { LANDING_ROOM_ID } = require('../constants/virtualUserConfig')
        webMetricsPoller.onMetricsUpdate = (metrics) => {
          // Only emit if landing is active
          if (service.isActiveForLanding()) {
            config.io.to(LANDING_ROOM_ID).emit('metrics-update', {
              metrics,
              timestamp: Date.now()
            })
          }
        }
      }
    },
    roomManager: (service, c) => {
      // Link VirtualUserService for solo mode support
      const virtualUserService = c.get('virtualUserService')
      service.setVirtualUserService(virtualUserService)

      // Give VirtualUserService access to RoomManager
      virtualUserService.setRoomManager(service)

      // Issue #4 fix: Link AuditionGestureService for room cleanup
      const auditionGestureService = c.get('auditionGestureService')
      service.setAuditionGestureService(auditionGestureService)

      // Set Socket.IO for mode transition notifications
      if (config.io) {
        service.setSocketIO(config.io)
      }
    },
    auditionGestureService: (service, c) => {
      // Link BackgroundCompositionService for harmonic context and material
      const backgroundCompositionService = c.get('backgroundCompositionService')
      service.backgroundCompositionService = backgroundCompositionService

      // Link WebMetricsPoller for metrics source option
      const webMetricsPoller = c.get('webMetricsPoller')
      service.webMetricsPoller = webMetricsPoller

      // Set Socket.IO for broadcasting
      if (config.io) {
        service.io = config.io
      }
    },
    connectionTracker: (service, c) => {
      const webMetricsPoller = c.get('webMetricsPoller')

      // Set Socket.IO for room counting
      if (config.io) {
        service.setIO(config.io)
      }

      // Link to WebMetricsPoller for inactivity tracking
      webMetricsPoller.setConnectionTracker(service)

      // Control polling lifecycle based on connected users
      // CRITICAL: Added error handling and state checks to prevent race conditions
      service.setOnEmptyCallback(() => {
        try {
          // Only stop if currently running (idempotent)
          if (webMetricsPoller.isRunning) {
            webMetricsPoller.stop()
          }
        } catch (error) {
          console.error('Error stopping WebMetricsPoller:', error.message)
        }
        // Note: BackgroundCompositionService stops automatically when last user leaves a room
      })

      service.setOnFirstUserCallback(() => {
        try {
          // Only start if not already running (idempotent)
          if (!webMetricsPoller.isRunning) {
            webMetricsPoller.start()
          }
        } catch (error) {
          console.error('Error starting WebMetricsPoller:', error.message)
        }
        // BackgroundCompositionService.initializeForLanding() is called in AuthHandler on join-landing
      })
    }
  })

  return container
}

module.exports = {
  ServiceContainer,
  createServiceContainer,
  wireServices
}
