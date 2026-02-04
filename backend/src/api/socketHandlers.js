/**
 * Socket.io Event Handlers - Orchestrator
 * Real-time WebSocket API implementation for Webarmonium
 * Constitutional requirements: <100ms WebSocket latency, anonymous sessions
 *
 * This file orchestrates domain-specific handlers from the handlers/ directory
 */

const AuthHandler = require('./handlers/AuthHandler')
const GestureHandler = require('./handlers/GestureHandler')
const DrawingHandler = require('./handlers/DrawingHandler')
const CursorHandler = require('./handlers/CursorHandler')
const MusicalHandler = require('./handlers/MusicalHandler')
const SynthHandler = require('./handlers/SynthHandler')
const AuditionHandler = require('./handlers/AuditionHandler')

const socketHandlers = {
  /**
   * Initialize socket with all event handlers
   * @param {Socket} socket - Socket.io socket instance
   * @param {Object} services - Service dependencies
   */
  initializeSocket (socket, services) {
    // Store services on socket for handler access
    socket.services = services
    socket.userId = null
    socket.roomId = null
    socket.lastActivity = Date.now()

    // Auth handlers (session management)
    AuthHandler.registerJoinLandingHandler(socket)
    AuthHandler.registerJoinRoomHandler(socket)
    AuthHandler.registerLeaveRoomHandler(socket)
    AuthHandler.registerHeartbeatHandler(socket)
    AuthHandler.registerDisconnectionHandler(socket)
    AuthHandler.registerRequestDroneHandler(socket)  // Entry #27: drone restart support

    // Gesture handlers
    GestureHandler.registerGestureHandler(socket)
    GestureHandler.registerGestureRecordHandler(socket)
    GestureHandler.registerGestureCompleteHandler(socket)
    GestureHandler.registerGestureTrailHandler(socket)

    // Musical handlers (sustained holds, events, sync)
    MusicalHandler.registerHoldStartHandler(socket)
    MusicalHandler.registerHoldEndHandler(socket)
    MusicalHandler.registerNoteStreamHandler(socket)
    MusicalHandler.registerMusicalEventHandler(socket)
    MusicalHandler.registerCompositionUpdateHandler(socket)
    MusicalHandler.registerClockSyncHandler(socket)

    // Drawing handlers (multi-user canvas)
    DrawingHandler.registerDrawStartHandler(socket)
    DrawingHandler.registerDrawPointHandler(socket)
    DrawingHandler.registerDrawEndHandler(socket)

    // Cursor handlers (position tracking)
    CursorHandler.registerCursorMoveHandler(socket)
    CursorHandler.registerCursorPositionHandler(socket)

    // Synth handlers (user timbre customization)
    SynthHandler.registerSynthParamsHandler(socket)
    SynthHandler.registerPresetRequestHandler(socket)

    // Audition handlers (SynthPanel virtual gesture generation)
    AuditionHandler.registerAuditionStartHandler(socket)
    AuditionHandler.registerAuditionStopHandler(socket)
    AuditionHandler.registerAuditionConfigHandler(socket)
    AuditionHandler.registerAuditionDisconnectHandler(socket)

    // console.log('🔌 Registered ALL handlers for socket:', socket.id)

    // Performance monitoring
    socket.on('*', () => {
      socket.lastActivity = Date.now()
    })
  }
}

module.exports = socketHandlers
