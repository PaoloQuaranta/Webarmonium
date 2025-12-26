/**
 * Socket Events Constants
 * Centralized socket event name definitions
 *
 * Naming Convention (documented for future consistency):
 * - Room/session events: kebab-case (join-room, leave-room)
 * - Musical events: colon-separated (hold:start, musical:event)
 * - Drawing events: kebab-case (draw-start, draw-point)
 * - Cursor events: kebab-case (cursor-move, cursor-position)
 *
 * Note: Event names are kept as-is for backward compatibility
 * with existing frontend implementation.
 */

// Authentication/Session events
const AUTH_EVENTS = {
  JOIN_ROOM: 'join-room',
  LEAVE_ROOM: 'leave-room',
  HEARTBEAT: 'heartbeat',
  DISCONNECT: 'disconnect'
}

// Room broadcast events
const ROOM_EVENTS = {
  ROOM_JOINED: 'room-joined',
  USER_JOINED: 'user-joined',
  USER_LEFT: 'user-left',
  USERS_INACTIVE: 'users-inactive'
}

// Gesture events
const GESTURE_EVENTS = {
  GESTURE: 'gesture',
  GESTURE_RECORD: 'gesture:record',
  GESTURE_ECHO: 'gesture-echo',
  GESTURE_BROADCAST: 'gesture-broadcast'
}

// Musical events
const MUSICAL_EVENTS = {
  HOLD_START: 'hold:start',
  HOLD_END: 'hold:end',
  MUSICAL_EVENT: 'musical:event',
  COMPOSITION_UPDATE: 'composition:update',
  CLOCK_SYNC: 'clock:sync',
  HOVER_UPDATE: 'hover-update',
  UNIFIED_MODULATION: 'unified-modulation',
  SONIC_UPDATE: 'sonic-update',
  COMPOSITIONAL_PARAMETERS: 'compositional-parameters'
}

// Drawing events
const DRAWING_EVENTS = {
  DRAW_START: 'draw-start',
  DRAW_POINT: 'draw-point',
  DRAW_END: 'draw-end',
  DRAW_STROKE: 'draw-stroke',
  DRAWING_HISTORY: 'drawing-history'
}

// Cursor events
const CURSOR_EVENTS = {
  CURSOR_MOVE: 'cursor-move',
  CURSOR_POSITION: 'cursor-position'
}

// All events combined for convenience
const SOCKET_EVENTS = {
  ...AUTH_EVENTS,
  ...ROOM_EVENTS,
  ...GESTURE_EVENTS,
  ...MUSICAL_EVENTS,
  ...DRAWING_EVENTS,
  ...CURSOR_EVENTS
}

module.exports = {
  AUTH_EVENTS,
  ROOM_EVENTS,
  GESTURE_EVENTS,
  MUSICAL_EVENTS,
  DRAWING_EVENTS,
  CURSOR_EVENTS,
  SOCKET_EVENTS
}
