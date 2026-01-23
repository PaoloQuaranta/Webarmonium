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

  container.register('landingCompositionService', (backgroundCompositionService, gestureToMusicService) => {
    const LandingCompositionService = require('./LandingCompositionService')
    return new LandingCompositionService()
  }, { dependencies: ['backgroundCompositionService', 'gestureToMusicService'] })

  // Virtual user service for solo mode in normal rooms
  container.register('virtualUserService', () => {
    const VirtualUserService = require('./VirtualUserService')
    return new VirtualUserService()
  })

  // Connection tracker for polling lifecycle control
  container.register('connectionTracker', () => {
    const ConnectionTracker = require('./ConnectionTracker')
    return new ConnectionTracker()
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
    backgroundCompositionService: (service, c) => {
      // Link to gesture service for harmonic sync
      const gestureToMusicService = c.get('gestureToMusicService')
      service.setGestureToMusicService(gestureToMusicService)

      // Entry #163: Link WebMetricsPoller for key initialization (same as LandingCompositionService)
      // This allows rooms to initialize starting key from web metrics
      const webMetricsPoller = c.get('webMetricsPoller')
      service.setWebMetricsPoller(webMetricsPoller)

      // Set Socket.IO for broadcasting
      if (config.io) {
        service.setSocketIO(config.io)
      }
    },
    landingCompositionService: (service, c) => {
      // Link to gesture service for harmonic sync
      const gestureToMusicService = c.get('gestureToMusicService')
      service.setGestureToMusicService(gestureToMusicService)

      // Set Socket.IO for broadcasting
      if (config.io) {
        service.setSocketIO(config.io)
      }

      // Link WebMetricsPoller to LandingCompositionService
      const webMetricsPoller = c.get('webMetricsPoller')

      // CRITICAL: Set WebMetricsPoller reference for velocity/acceleration access
      service.setWebMetricsPoller(webMetricsPoller)

      // Link metrics update callback
      webMetricsPoller.onMetricsUpdate = (metrics) => {
        service.updateMetrics(metrics)
      }

      // NOTE: WebMetricsPoller is NOT started here anymore
      // ConnectionTracker controls polling lifecycle based on connected users
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
      }
    },
    roomManager: (service, c) => {
      // Link VirtualUserService for solo mode support
      const virtualUserService = c.get('virtualUserService')
      service.setVirtualUserService(virtualUserService)

      // Give VirtualUserService access to RoomManager
      virtualUserService.setRoomManager(service)

      // Set Socket.IO for mode transition notifications
      if (config.io) {
        service.setSocketIO(config.io)
      }
    },
    connectionTracker: (service, c) => {
      const webMetricsPoller = c.get('webMetricsPoller')
      const landingCompositionService = c.get('landingCompositionService')

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

        try {
          // Only stop if currently running
          if (landingCompositionService.isRunning) {
            landingCompositionService.stop()
          }
        } catch (error) {
          console.error('Error stopping LandingCompositionService:', error.message)
        }
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
        // landingCompositionService.start() is called in AuthHandler on join-landing
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
