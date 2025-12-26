/**
 * Constants barrel export
 */

const MusicConstants = require('./MusicConstants')
const SocketEvents = require('./SocketEvents')

module.exports = {
  ...MusicConstants,
  ...SocketEvents
}
