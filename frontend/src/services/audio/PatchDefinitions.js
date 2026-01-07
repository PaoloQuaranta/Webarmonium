/**
 * PatchDefinitions.js
 * Defines unique synth patches for virtual and real users
 * Each user has a distinctive timbre to make them sonically distinguishable
 */
console.log('📦 PatchDefinitions.js LOADING...')

/**
 * Virtual User Patches - Analogico/Caldo Style
 * EACH USES A UNIQUE OSCILLATOR TYPE for maximum differentiation:
 * - Wikipedia: SINE (pure fundamental, you feel it)
 * - HackerNews: SAWTOOTH (rich harmonics, aggressive)
 * - GitHub: TRIANGLE (hollow, flute-like)
 */
const VIRTUAL_USER_PATCHES = {
  'wikipedia-metrics': {
    name: 'Deep Sine Drone',
    tessitura: 'bass',
    frequencyRange: { min: 55, max: 110 },   // A1-A2 (sub-bass)
    oscillator: {
      type: 'sine'          // PURE SINE - clean fundamental
    },
    envelope: {
      attack: 0.3,          // Slow swell
      decay: 0.1,
      sustain: 1.0,         // Full drone
      release: 0.8
    },
    filter: {
      type: 'lowpass',
      frequency: 150,       // Very low - only fundamentals
      Q: 0.5
    },
    volume: 5,
    effects: {
      delaySend: 0.0,       // No delay on bass
      reverbSend: 0.1
    }
  },

  'hackernews-metrics': {
    name: 'Buzzy Saw',
    tessitura: 'tenor',
    frequencyRange: { min: 196, max: 392 },  // G3-G4
    oscillator: {
      type: 'sawtooth'      // SAWTOOTH - bright, rich harmonics
    },
    envelope: {
      attack: 0.05,
      decay: 0.3,
      sustain: 0.6,
      release: 0.4
    },
    filter: {
      type: 'lowpass',
      frequency: 1800,      // Warm but present
      Q: 1.5
    },
    volume: 0,
    effects: {
      delaySend: 0.2,
      reverbSend: 0.25
    }
  },

  'github-metrics': {
    name: 'Hollow Flute',
    tessitura: 'soprano',
    frequencyRange: { min: 523, max: 1047 },  // C5-C6
    oscillator: {
      type: 'triangle'      // TRIANGLE - hollow, flute-like
    },
    envelope: {
      attack: 0.02,
      decay: 0.4,
      sustain: 0.5,
      release: 0.5
    },
    filter: {
      type: 'highpass',
      frequency: 400,
      Q: 0.7
    },
    volume: 3,
    effects: {
      delaySend: 0.3,
      reverbSend: 0.4
    }
  }
}

/**
 * Real User Patches - 4 slots for max 4 users per room
 * EACH USES A UNIQUE OSCILLATOR TYPE (different from virtual users):
 * - Slot 0: SQUARE (retro, 8-bit feel)
 * - Slot 1: PULSE (nasal, reedy)
 * - Slot 2: FATSAWTOOTH (chorus, lush)
 * - Slot 3: FMSINE (bell-like, metallic)
 */
const REAL_USER_PATCHES = {
  0: {
    name: 'Retro Square',
    oscillator: {
      type: 'square'        // SQUARE - buzzy, 8-bit character
    },
    envelope: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.4,
      release: 0.3
    },
    filter: {
      type: 'lowpass',
      frequency: 2500,
      Q: 1.2
    },
    volume: 3,              // Square is loud - boosted
    effects: {
      delaySend: 0.15,
      reverbSend: 0.2
    }
  },

  1: {
    name: 'Nasal Reed',
    oscillator: {
      type: 'pulse',
      width: 0.2            // PULSE - nasal, oboe-like
    },
    envelope: {
      attack: 0.04,
      decay: 0.15,
      sustain: 0.7,
      release: 0.25
    },
    filter: {
      type: 'bandpass',
      frequency: 1000,
      Q: 2
    },
    volume: 5,              // Boosted
    effects: {
      delaySend: 0.1,
      reverbSend: 0.2
    }
  },

  2: {
    name: 'Warm Chorus',
    oscillator: {
      type: 'fatsawtooth',
      count: 3,             // 3 voices = reasonable
      spread: 25            // Moderate detuning
    },
    envelope: {
      attack: 0.1,
      decay: 0.3,
      sustain: 0.7,
      release: 0.5
    },
    filter: {
      type: 'lowpass',
      frequency: 1800,
      Q: 0.8
    },
    volume: 4,              // Boosted
    effects: {
      delaySend: 0.2,
      reverbSend: 0.4
    }
  },

  3: {
    name: 'Bell Chime',
    oscillator: {
      type: 'fmsine',
      modulationType: 'sine',
      modulationIndex: 4    // FM - bell harmonics
    },
    envelope: {
      attack: 0.002,
      decay: 0.4,
      sustain: 0.1,
      release: 0.5
    },
    filter: {
      type: 'highpass',
      frequency: 250,
      Q: 0.7
    },
    volume: 6,              // Boosted
    effects: {
      delaySend: 0.25,
      reverbSend: 0.35
    }
  }
}

/**
 * List of virtual user IDs
 */
const VIRTUAL_USER_IDS = [
  'wikipedia-metrics',
  'hackernews-metrics',
  'github-metrics'
]

/**
 * Check if a userId belongs to a virtual user
 * @param {string} userId - The user ID to check
 * @returns {boolean} True if virtual user
 */
function isVirtualUser(userId) {
  return VIRTUAL_USER_IDS.includes(userId)
}

/**
 * Get the patch definition for a user
 * @param {string} userId - The user ID
 * @param {number} userSlot - The slot number for real users (0-3)
 * @returns {Object|null} The patch definition or null if not found
 */
function getPatchForUser(userId, userSlot = 0) {
  if (isVirtualUser(userId)) {
    return VIRTUAL_USER_PATCHES[userId]
  }
  // Real user - use slot-based patch
  const slot = Math.abs(userSlot) % 4  // Ensure slot is 0-3
  return REAL_USER_PATCHES[slot]
}

/**
 * Get all virtual user IDs
 * @returns {Array<string>} Array of virtual user IDs
 */
function getVirtualUserIds() {
  return [...VIRTUAL_USER_IDS]
}

/**
 * Get patch by name (for debugging/testing)
 * @param {string} name - The patch name
 * @returns {Object|null} The patch definition or null
 */
function getPatchByName(name) {
  // Search in virtual patches
  for (const patch of Object.values(VIRTUAL_USER_PATCHES)) {
    if (patch.name === name) return patch
  }
  // Search in real patches
  for (const patch of Object.values(REAL_USER_PATCHES)) {
    if (patch.name === name) return patch
  }
  return null
}

// Export for browser (window global)
if (typeof window !== 'undefined') {
  window.PatchDefinitions = {
    VIRTUAL_USER_PATCHES,
    REAL_USER_PATCHES,
    VIRTUAL_USER_IDS,
    isVirtualUser,
    getPatchForUser,
    getVirtualUserIds,
    getPatchByName
  }
  console.log('✅ PatchDefinitions exported to window.PatchDefinitions')
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VIRTUAL_USER_PATCHES,
    REAL_USER_PATCHES,
    VIRTUAL_USER_IDS,
    isVirtualUser,
    getPatchForUser,
    getVirtualUserIds,
    getPatchByName
  }
}
