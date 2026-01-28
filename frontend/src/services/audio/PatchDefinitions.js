/**
 * PatchDefinitions.js
 * Defines unique synth patches for virtual and real users
 * Each user has a distinctive timbre to make them sonically distinguishable
 */
// console.log('📦 PatchDefinitions.js LOADING...')

/**
 * Virtual User Patches - Analogico/Caldo Style
 * EACH USES A UNIQUE OSCILLATOR TYPE for maximum differentiation:
 * - Wikipedia: SAWTOOTH (rich harmonics for audible bass)
 * - HackerNews: SINE (pure, mellow tenor)
 * - GitHub: TRIANGLE (hollow, flute-like)
 */
const VIRTUAL_USER_PATCHES = {
  'wikipedia-metrics': {
    name: 'Rich Saw Bass',
    tessitura: 'bass',
    frequencyRange: { min: 110, max: 220 },   // A2-A3
    oscillator: {
      type: 'sawtooth'      // SAWTOOTH - rich harmonics make bass audible on all speakers
    },
    envelope: {
      attack: 0.1,          // Medium attack
      decay: 0.2,
      sustain: 0.8,         // Full body
      release: 0.5
    },
    filter: {
      type: 'lowpass',
      frequency: 600,       // Let harmonics through for audibility
      Q: 1.2
    },
    volume: 5,              // Entry #212: Balanced for perceived loudness (sawtooth -3 dB vs sine)
    effects: {
      delaySend: 0.2,       // ADDED delay send for bass echoes
      reverbSend: 0.2
    }
  },

  'hackernews-metrics': {
    name: 'Pure Sine Tenor',
    tessitura: 'tenor',
    frequencyRange: { min: 196, max: 392 },  // G3-G4
    oscillator: {
      type: 'sine'          // SINE - pure, mellow tone
    },
    envelope: {
      attack: 0.05,
      decay: 0.3,
      sustain: 0.7,
      release: 0.4
    },
    filter: {
      type: 'lowpass',
      frequency: 2000,      // Let the sine through cleanly
      Q: 0.7
    },
    volume: 8,              // Entry #212: Increased to match remote real users level
    effects: {
      delaySend: 0.4,       // INCREASED from 0.2 - more echoes
      reverbSend: 0.3
    }
  },

  'github-metrics': {
    name: 'Mellow Flute',
    tessitura: 'soprano',
    frequencyRange: { min: 523, max: 1047 },  // C5-C6
    oscillator: {
      type: 'triangle'      // TRIANGLE - hollow, soft
    },
    envelope: {
      attack: 0.08,         // Softer attack (different from HackerNews)
      decay: 0.5,           // Longer decay
      sustain: 0.4,
      release: 0.7          // Longer release - airy
    },
    filter: {
      type: 'bandpass',     // CHANGED from highpass - more flute-like resonance
      frequency: 800,       // Center frequency
      Q: 1.5                // Moderate resonance
    },
    volume: 6,              // Entry #212: Balanced for perceived loudness (triangle -2 dB vs sine)
    effects: {
      delaySend: 0.5,       // INCREASED from 0.35 - more echoes
      reverbSend: 0.5       // More reverb - ethereal
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
    volume: 9,              // BOOSTED +6dB to match gestureSynth (+3 synth + 6 gestureVolume = +9)
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
    volume: 11,             // BOOSTED +6dB to match gestureSynth level
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
    volume: 10,             // BOOSTED +6dB to match gestureSynth level
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
      decay: 0.3,           // Faster decay but higher sustain
      sustain: 0.5,         // FIXED: Was 0.1 (too quiet), now 0.5
      release: 0.5
    },
    filter: {
      type: 'highpass',
      frequency: 250,
      Q: 0.7
    },
    volume: 12,             // BOOSTED: FM/sine has few harmonics, needs significant boost
    effects: {
      delaySend: 0.25,
      reverbSend: 0.35
    }
  },

  // SLOTS 4-7: Additional patches for expanded pool (race condition handling)
  // These are variants of 0-3 with different characteristics

  4: {
    name: 'Soft Square',
    oscillator: {
      type: 'square'        // Variant of slot 0
    },
    envelope: {
      attack: 0.08,         // Softer attack than slot 0
      decay: 0.4,
      sustain: 0.6,
      release: 0.6
    },
    filter: {
      type: 'lowpass',
      frequency: 1500,      // More muffled than slot 0
      Q: 0.8
    },
    volume: 9,              // BOOSTED +6dB to match gestureSynth level
    effects: {
      delaySend: 0.3,       // More delay
      reverbSend: 0.4
    }
  },

  5: {
    name: 'Wide Pulse',
    oscillator: {
      type: 'pulse',
      width: 0.4            // Wider pulse than slot 1 (more hollow)
    },
    envelope: {
      attack: 0.06,
      decay: 0.25,
      sustain: 0.5,
      release: 0.4
    },
    filter: {
      type: 'lowpass',      // Different filter than slot 1
      frequency: 1500,
      Q: 1.2
    },
    volume: 11,             // BOOSTED +6dB to match gestureSynth level
    effects: {
      delaySend: 0.25,
      reverbSend: 0.35
    }
  },

  6: {
    name: 'Bright Chorus',
    oscillator: {
      type: 'fatsawtooth',
      count: 2,             // Fewer voices than slot 2
      spread: 40            // Wider spread - more detuned
    },
    envelope: {
      attack: 0.05,         // Faster attack than slot 2
      decay: 0.2,
      sustain: 0.8,
      release: 0.3
    },
    filter: {
      type: 'highpass',     // Different from slot 2's lowpass
      frequency: 300,
      Q: 0.5
    },
    volume: 10,             // BOOSTED +6dB to match gestureSynth level
    effects: {
      delaySend: 0.15,
      reverbSend: 0.25
    }
  },

  7: {
    name: 'Deep Bell',
    oscillator: {
      type: 'fmsine',
      modulationType: 'triangle',  // Different modulator than slot 3
      modulationIndex: 6           // Higher modulation - more metallic
    },
    envelope: {
      attack: 0.01,
      decay: 0.5,           // Longer decay than slot 3
      sustain: 0.3,
      release: 0.8          // Longer release
    },
    filter: {
      type: 'lowpass',      // Different from slot 3's highpass
      frequency: 3000,
      Q: 1.0
    },
    volume: 11,             // BOOSTED: FM/sine has few harmonics
    effects: {
      delaySend: 0.4,       // More delay
      reverbSend: 0.5       // More reverb
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
  // Real user - use slot-based patch (8 slots for race condition handling)
  const slot = Math.abs(userSlot) % 8  // Ensure slot is 0-7
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
  // console.log('✅ PatchDefinitions exported to window.PatchDefinitions')
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
