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
    volume: -1,             // Sawtooth has rich harmonics, needs less boost
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
    volume: 2,              // Sine needs boost for perceived loudness
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
    volume: 0,              // Triangle is moderate, no boost needed
    effects: {
      delaySend: 0.5,       // INCREASED from 0.35 - more echoes
      reverbSend: 0.5       // More reverb - ethereal
    }
  }
}

/**
 * Real User Patches - 11 slots (0-7 synth, 8-10 drum kits)
 * SYNTH PRESETS (each uses unique oscillator type):
 * - Slot 0: SQUARE (retro, 8-bit feel)
 * - Slot 1: PULSE (nasal, reedy)
 * - Slot 2: FATSAWTOOTH (chorus, lush)
 * - Slot 3: FMSINE (bell-like, metallic)
 * - Slots 4-7: Variants of 0-3
 * DRUM KIT PRESETS (1 per room, type: 'drum'):
 * - Slot 8: 808 Kit (deep sub-bass BD, tight SN, closed HH)
 * - Slot 9: Acoustic Kit (natural resonant BD, bright SN, shimmer HH)
 * - Slot 10: Electronic Kit (punchy synthetic BD, noisy SN, glitchy HH)
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
    volume: 3,              // Square has harmonics, moderate boost
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
    volume: 5,              // Pulse/bandpass is narrow, needs boost
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
    volume: 4,              // Fatsawtooth is rich, moderate boost
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
    volume: 6,              // FM/sine has few harmonics, needs more boost
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
    volume: 3,              // Square variant, moderate boost
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
    volume: 5,              // Pulse variant, needs boost
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
    volume: 4,              // Fatsawtooth variant, moderate boost
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
    volume: 5,              // FM/sine variant, needs boost
    effects: {
      delaySend: 0.4,       // More delay
      reverbSend: 0.5       // More reverb
    }
  },

  // SLOTS 8-10: Drum kit presets
  // Only 1 drum machine per room (slots 8-10 grouped as single resource)
  // type: 'drum' enables drum mode in SynthPanel, AudioService, Audition, Sequencer

  8: {
    name: '808 Kit',
    type: 'drum',
    instruments: {
      bd: { pitch: 0.4, decay: 0.7, tone: 0.4 },
      sn: { pitch: 0.45, decay: 0.3, tone: 0.7, delay: 0.15 },
      hh: { pitch: 0.3, decay: 0.2, tone: 0.3, delay: 0.0 },
      oh: { pitch: 0.35, decay: 0.5, tone: 0.4, delay: 0.05 }
    },
    reverb: 0.2,
    volume: 0
  },

  9: {
    name: 'Acoustic Kit',
    type: 'drum',
    instruments: {
      bd: { pitch: 0.55, decay: 0.5, tone: 0.6 },
      sn: { pitch: 0.6, decay: 0.6, tone: 0.5, delay: 0.25 },
      hh: { pitch: 0.6, decay: 0.4, tone: 0.7, delay: 0.1 },
      oh: { pitch: 0.65, decay: 0.7, tone: 0.8, delay: 0.15 }
    },
    reverb: 0.45,
    volume: 0
  },

  10: {
    name: 'Electronic Kit',
    type: 'drum',
    instruments: {
      bd: { pitch: 0.5, decay: 0.3, tone: 0.9 },
      sn: { pitch: 0.35, decay: 0.8, tone: 0.8, delay: 0.4 },
      hh: { pitch: 0.7, decay: 0.1, tone: 0.9, delay: 0.35 },
      oh: { pitch: 0.75, decay: 0.3, tone: 0.95, delay: 0.4 }
    },
    reverb: 0.15,
    volume: 0
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
 * @param {number} userSlot - The slot number for real users (0-10)
 * @returns {Object|null} The patch definition or null if not found
 */
function getPatchForUser(userId, userSlot = 0) {
  if (isVirtualUser(userId)) {
    return VIRTUAL_USER_PATCHES[userId]
  }
  // Real user - use slot-based patch (11 slots: 0-7 synth + 8-10 drum kits)
  const safeSlot = Number.isFinite(userSlot) ? Math.abs(userSlot) : 0
  const slot = safeSlot % 11  // Ensure slot is 0-10
  return REAL_USER_PATCHES[slot] || REAL_USER_PATCHES[0]
}

/**
 * Get all virtual user IDs
 * @returns {Array<string>} Array of virtual user IDs
 */
function getVirtualUserIds() {
  return [...VIRTUAL_USER_IDS]
}

/**
 * Check if a preset slot is a drum kit
 * @param {number} slot - The preset slot number
 * @returns {boolean} True if drum kit preset
 */
function isDrumPreset (slot) {
  return REAL_USER_PATCHES[slot]?.type === 'drum'
}

/**
 * Drum preset slot range
 */
const DRUM_SLOTS = [8, 9, 10]

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
    DRUM_SLOTS,
    isVirtualUser,
    isDrumPreset,
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
    DRUM_SLOTS,
    isVirtualUser,
    isDrumPreset,
    getPatchForUser,
    getVirtualUserIds,
    getPatchByName
  }
}
