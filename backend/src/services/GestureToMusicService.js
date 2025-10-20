class GestureToMusicService {
  constructor() {
    this.lastGestureTime = {}
    this.gestureCount = {}
  }

  processGesture(gestureData) {
    console.log('🎵 GestureToMusicService processing gesture:', gestureData)

    // Extract data from gesture object with better fallbacks
    const userId = gestureData.userId || 'unknown'
    const gesture = gestureData.gesture || {}
    const gestureAction = gesture.action || gestureData.gestureAction || 'unknown'
    const gestureType = gesture.type || gestureData.gestureType || 'unknown'
    const position = gesture.coordinates ?
      { x: gesture.coordinates[0] || 0.5, y: gesture.coordinates[1] || 0.5 } :
      (gesture.position || gestureData.position || { x: 0.5, y: 0.5 })
    const velocity = gesture.velocity || gestureData.velocity || 50
    const intensity = gesture.intensity || gestureData.intensity || 0.5

    console.log('🎵 Extracted gesture data:', {
      userId,
      gestureAction,
      gestureType,
      position,
      velocity,
      intensity
    })

    // Create basic musical event from gesture
    const musicalEvent = {
      id: `musical_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      eventType: 'note',
      userId: userId,
      timestamp: Date.now(),
      position: position,
      properties: {
        velocity: velocity,
        intensity: intensity,
        gestureAction: gestureAction,
        gestureType: gestureType
      }
    }

    // Map gesture actions to musical properties
    switch (gestureAction) {
      case 'drag':
        musicalEvent.properties.frequency = 440 + (position?.y || 0.5) * 440
        musicalEvent.properties.duration = 0.5
        break
      case 'hover':
        musicalEvent.eventType = 'filter_modulation'
        musicalEvent.properties.controlType = 'filter'
        musicalEvent.properties.frequency = 200 + (position?.x || 0.5) * 2000 // 200Hz to 2200Hz
        musicalEvent.properties.resonance = 1 + (position?.y || 0.5) * 3 // 1 to 4
        musicalEvent.properties.value = (position?.x || 0.5) * 100
        break
      case 'tap':
        musicalEvent.eventType = 'note'
        musicalEvent.properties.frequency = 523.25 // C5
        musicalEvent.properties.duration = 0.1
        break
      default:
        musicalEvent.properties.frequency = 440
        musicalEvent.properties.duration = 0.3
    }

    return [musicalEvent]
  }
}

module.exports = GestureToMusicService