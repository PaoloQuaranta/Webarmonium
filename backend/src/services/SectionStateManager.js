/**
 * SectionStateManager.js - Entry #169
 *
 * Centralized manager for musical section state.
 * Broadcasts section changes to all composition services.
 * Ensures all voices and layers respond to the same section context.
 */

const EventEmitter = require('events')
const SectionContext = require('../composition/SectionContext')
const { getFormSequence, getFormCycleLength } = require('../composition/FormDefinitions')

// Fix #9: Constants for magic numbers
const CLEANUP_INTERVAL_MS = 60000  // 1 minute cleanup interval
const ROOM_INACTIVITY_THRESHOLD_MS = 300000  // 5 minutes of inactivity

class SectionStateManager extends EventEmitter {
  constructor() {
    super()

    // Per-room section states
    this.roomStates = new Map()  // roomId -> SectionContext

    // Landing page state (special case)
    this.landingState = null

    // Subscribers for section changes
    this.subscribers = new Map()  // roomId -> Set<callback>

    // Composition count per room (for progress tracking)
    this.compositionCounts = new Map()  // roomId -> number

    // Fix #2: Track last activity time per room for automatic cleanup
    this._lastActivityTime = new Map()  // roomId -> timestamp

    // Minimum compositions per section before transition
    this.minCompositionsPerSection = 3

    // Fix #3: Update locks to prevent race conditions
    this._updateLocks = new Map()  // roomId -> boolean

    // Fix #2: Start periodic cleanup of inactive rooms
    this._cleanupInterval = setInterval(() => {
      this._cleanupInactiveRooms()
    }, CLEANUP_INTERVAL_MS)
  }

  /**
   * Initialize section state for a room
   * @param {string} roomId - Room ID or 'landing' for landing page
   * @param {string} formType - Initial form type
   * @returns {SectionContext} Initial context
   */
  initializeState(roomId, formType = 'ABA') {
    const sequence = getFormSequence(formType)
    const firstSection = sequence[0]

    const context = SectionContext.fromForm(formType, firstSection, 0)

    if (roomId === 'landing') {
      this.landingState = context
    } else {
      this.roomStates.set(roomId, context)
    }

    this.compositionCounts.set(roomId, 0)
    // Fix #2: Track activity time
    this._updateActivityTime(roomId)

    // Broadcast initial state
    this._broadcast(roomId, context, 'initialize')

    return context
  }

  /**
   * Get current section state for a room
   * @param {string} roomId
   * @returns {SectionContext|null}
   */
  getState(roomId) {
    if (roomId === 'landing') {
      return this.landingState
    }
    return this.roomStates.get(roomId) || null
  }

  /**
   * Transition to a new section
   * @param {string} roomId
   * @param {Object} sectionConfig - New section configuration
   * @returns {SectionContext} New context
   */
  transitionSection(roomId, sectionConfig = {}) {
    const current = this.getState(roomId)
    if (!current) {
      // Initialize if not exists
      return this.initializeState(roomId, sectionConfig.formType || 'ABA')
    }

    // Create new context from config or advance to next section
    let newContext

    if (sectionConfig.sectionType) {
      // Explicit section specified
      newContext = SectionContext.fromForm(
        sectionConfig.formType || current.formType,
        sectionConfig.sectionType,
        sectionConfig.sectionIndex ?? (current.sectionIndex + 1)
      )

      // Apply any overrides
      Object.keys(sectionConfig).forEach(key => {
        if (key !== 'sectionType' && key !== 'formType' && key !== 'sectionIndex') {
          if (newContext[key] !== undefined) {
            newContext[key] = sectionConfig[key]
          }
        }
      })
    } else {
      // Advance to next section in sequence
      newContext = current.nextSection()
    }

    // Store new state
    if (roomId === 'landing') {
      this.landingState = newContext
    } else {
      this.roomStates.set(roomId, newContext)
    }

    // Reset composition count for new section
    this.compositionCounts.set(roomId, 0)

    // Broadcast transition
    this._broadcast(roomId, newContext, 'transition')

    return newContext
  }

  /**
   * Update section parameters (for linear evolution within section)
   * Fix #3: Added locking to prevent race conditions
   * @param {string} roomId
   * @param {number} deltaProgress - Progress increment (0-1)
   * @param {Object} parameterUpdates - Optional parameter overrides
   * @returns {SectionContext} Evolved context
   */
  updateProgress(roomId, deltaProgress = 0.1, parameterUpdates = {}) {
    // Fix #3: Acquire lock to prevent race conditions
    if (this._updateLocks.get(roomId)) {
      // Another update in progress, return current state
      return this.getState(roomId)
    }
    this._updateLocks.set(roomId, true)

    try {
      const current = this.getState(roomId)
      if (!current) {
        return null
      }

      // Evolve the context
      let evolved = current.evolve(deltaProgress)

      // Apply any parameter updates
      Object.keys(parameterUpdates).forEach(key => {
        if (evolved[key] !== undefined) {
          evolved[key] = parameterUpdates[key]
        }
      })

      // Store evolved state
      if (roomId === 'landing') {
        this.landingState = evolved
      } else {
        this.roomStates.set(roomId, evolved)
      }

      // Increment composition count
      const count = (this.compositionCounts.get(roomId) || 0) + 1
      this.compositionCounts.set(roomId, count)

      // Fix #2: Track activity time
      this._updateActivityTime(roomId)

      // Broadcast update (less frequent than transitions)
      this._broadcast(roomId, evolved, 'update')

      return evolved
    } finally {
      // Fix #3: Release lock
      this._updateLocks.set(roomId, false)
    }
  }

  /**
   * Check if section should transition
   * @param {string} roomId
   * @returns {boolean}
   */
  shouldTransition(roomId) {
    const current = this.getState(roomId)
    if (!current) return false

    const count = this.compositionCounts.get(roomId) || 0
    return current.shouldTransition(this.minCompositionsPerSection) ||
           count >= this.minCompositionsPerSection * 2 // Force after too many
  }

  /**
   * Change form type for a room
   * @param {string} roomId
   * @param {string} newFormType
   * @returns {SectionContext}
   */
  changeForm(roomId, newFormType) {
    return this.initializeState(roomId, newFormType)
  }

  /**
   * Subscribe to section changes for a room
   * @param {string} roomId
   * @param {Function} callback - Called with (context, eventType)
   * @returns {Function} Unsubscribe function
   */
  subscribe(roomId, callback) {
    if (!this.subscribers.has(roomId)) {
      this.subscribers.set(roomId, new Set())
    }

    this.subscribers.get(roomId).add(callback)

    // Immediately call with current state if exists
    const current = this.getState(roomId)
    if (current) {
      try {
        callback(current, 'subscribe')
      } catch (error) {
        console.error(`SectionStateManager: Error in subscriber callback for ${roomId}:`, error)
      }
    }

    // Return unsubscribe function
    return () => this.unsubscribe(roomId, callback)
  }

  /**
   * Unsubscribe from section changes
   * @param {string} roomId
   * @param {Function} callback
   */
  unsubscribe(roomId, callback) {
    const subs = this.subscribers.get(roomId)
    if (subs) {
      subs.delete(callback)
    }
  }

  /**
   * Broadcast section change to subscribers
   * @private
   */
  _broadcast(roomId, context, eventType) {
    // Notify room-specific subscribers
    const subs = this.subscribers.get(roomId)
    if (subs) {
      subs.forEach(callback => {
        try {
          callback(context, eventType)
        } catch (error) {
          console.error(`SectionStateManager: Error in subscriber callback for ${roomId}:`, error)
        }
      })
    }

    // Emit global event
    this.emit('section:change', {
      roomId,
      context: context.toJSON(),
      eventType
    })

    // Emit specific event for transitions
    if (eventType === 'transition') {
      this.emit('section:transition', {
        roomId,
        context: context.toJSON()
      })
    }
  }

  /**
   * Get all active rooms with section state
   * @returns {string[]}
   */
  getActiveRooms() {
    return Array.from(this.roomStates.keys())
  }

  /**
   * Get form progress for a room
   * @param {string} roomId
   * @returns {Object} Progress info
   */
  getProgress(roomId) {
    const context = this.getState(roomId)
    if (!context) return null

    return {
      formType: context.formType,
      currentSection: context.sectionType,
      sectionIndex: context.sectionIndex,
      totalSections: context.totalSections,
      progressInSection: context.progressionPosition,
      progressInForm: context.formCyclePosition,
      compositionsInSection: this.compositionCounts.get(roomId) || 0
    }
  }

  /**
   * Cleanup room state
   * Fix #2: Also clean up activity tracking and locks
   * @param {string} roomId
   */
  cleanupRoom(roomId) {
    this.roomStates.delete(roomId)
    this.subscribers.delete(roomId)
    this.compositionCounts.delete(roomId)
    // Fix #2: Clean up activity tracking
    this._lastActivityTime.delete(roomId)
    // Fix #3: Clean up locks
    this._updateLocks.delete(roomId)

    this.emit('room:cleanup', { roomId })
  }

  /**
   * Reset all state (for testing)
   */
  reset() {
    this.roomStates.clear()
    this.subscribers.clear()
    this.compositionCounts.clear()
    // Fix #2: Clear activity tracking
    this._lastActivityTime.clear()
    // Fix #3: Clear locks
    this._updateLocks.clear()
    this.landingState = null
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      activeRooms: this.roomStates.size,
      hasLandingState: this.landingState !== null,
      totalSubscribers: Array.from(this.subscribers.values())
        .reduce((sum, set) => sum + set.size, 0)
    }
  }

  /**
   * Fix #2: Update last activity time for a room
   * @private
   * @param {string} roomId
   */
  _updateActivityTime(roomId) {
    if (roomId !== 'landing') {
      this._lastActivityTime.set(roomId, Date.now())
    }
  }

  /**
   * Fix #2: Clean up inactive rooms to prevent memory leaks
   * @private
   */
  _cleanupInactiveRooms() {
    const now = Date.now()
    const inactiveRooms = []

    for (const [roomId, lastActivity] of this._lastActivityTime.entries()) {
      if (now - lastActivity > ROOM_INACTIVITY_THRESHOLD_MS) {
        inactiveRooms.push(roomId)
      }
    }

    for (const roomId of inactiveRooms) {
      this.cleanupRoom(roomId)
    }

    if (inactiveRooms.length > 0) {
      this.emit('rooms:cleaned', { count: inactiveRooms.length, roomIds: inactiveRooms })
    }
  }

  /**
   * Stop the cleanup interval (for testing and shutdown)
   */
  stopCleanup() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval)
      this._cleanupInterval = null
    }
  }
}

// Singleton instance
let instance = null

/**
 * Get singleton instance
 * @returns {SectionStateManager}
 */
function getSectionStateManager() {
  if (!instance) {
    instance = new SectionStateManager()
  }
  return instance
}

/**
 * Reset singleton (for testing)
 * Fix #2: Also stop cleanup interval
 */
function resetSectionStateManager() {
  if (instance) {
    instance.stopCleanup()
    instance.reset()
  }
  instance = null
}

module.exports = {
  SectionStateManager,
  getSectionStateManager,
  resetSectionStateManager
}
