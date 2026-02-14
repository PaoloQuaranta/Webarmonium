/**
 * DrumBufferRenderer — Offline rendering of drum sounds into AudioBuffers.
 *
 * Instead of using live synths (MembraneSynth, NoiseSynth, MetalSynth) that
 * accumulate AudioParam automation events in Chrome (causing progressive
 * slowdown), this module pre-renders each drum sound into a ToneAudioBuffer.
 * Playback uses one-shot ToneBufferSource nodes which are garbage-collected
 * after playback — zero automation accumulation, zero recycling needed.
 *
 * Synth definitions are identical to AudioService._createDrumKit() to
 * preserve the exact same timbral character.
 */

// eslint-disable-next-line no-unused-vars
class DrumBufferRenderer {
  /**
   * Global render queue — serializes ALL Tone.Offline calls.
   * Tone.Offline temporarily swaps the global audio context. Concurrent calls
   * corrupt the save/restore chain, leaving Tone.js pointed at a dead
   * OfflineAudioContext. This queue guarantees at most one Offline render at a time.
   * @private
   */
  static _renderQueue = Promise.resolve()

  static _enqueue (fn) {
    const next = DrumBufferRenderer._renderQueue.catch(() => {}).then(fn)
    DrumBufferRenderer._renderQueue = next.catch(() => {})
    return next
  }

  /**
   * Render a bass drum buffer from parameters.
   * Uses MembraneSynth with sub-bass frequency (30-90Hz).
   * @param {Object} params - { pitch: 0-1, decay: 0-1, tone: 0-1 }
   * @returns {Promise<ToneAudioBuffer>}
   */
  static async renderBd (params) {
    return DrumBufferRenderer._enqueue(() => DrumBufferRenderer._renderBdInternal(params))
  }

  static async _renderBdInternal (params) {
    const attack = 0.001
    const decay = 0.05 + params.decay * 1.45
    const release = 0.1
    const duration = attack + decay + release + 0.15 // safety margin for tail

    const buffer = await Tone.Offline(() => {
      const bd = new Tone.MembraneSynth({
        pitchDecay: 0.05 + params.pitch * 0.3,
        octaves: 2 + params.tone * 6,
        envelope: { attack, decay, sustain: 0, release },
        volume: 4 // +4dB: compensate for perceptual quietness of sub frequencies
      }).toDestination()
      bd.frequency.value = 30 + params.pitch * 60 // 30-90Hz
      bd.triggerAttackRelease('C1', '8n', 0, 1.0)
    }, duration, 1, Tone.context?.sampleRate || 44100)

    if (!buffer || buffer.duration === 0) {
      throw new Error('[DrumBufferRenderer] Empty BD buffer')
    }
    return buffer
  }

  /**
   * Render a snare buffer from parameters.
   * Combines MembraneSynth (body) + NoiseSynth (snap) through bandpass filter.
   * Uses explicit merge node to guarantee correct summing in offline context.
   * @param {Object} params - { pitch: 0-1, decay: 0-1, tone: 0-1 }
   * @returns {Promise<ToneAudioBuffer>}
   */
  static async renderSn (params) {
    return DrumBufferRenderer._enqueue(() => DrumBufferRenderer._renderSnInternal(params))
  }

  static async _renderSnInternal (params) {
    const bodyDur = 0.001 + 0.08 + 0.05 // attack + decay + release
    const noiseDur = 0.001 + (0.05 + params.decay * 0.45) + 0.01
    const duration = Math.max(bodyDur, noiseDur) + 0.15

    const buffer = await Tone.Offline(() => {
      // Explicit merge node — don't rely on multiple .toDestination() calls
      const merge = new Tone.Gain(1).toDestination()

      // Snare body: pitched membrane thump
      const snBody = new Tone.MembraneSynth({
        pitchDecay: 0.02,
        octaves: 3,
        envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 }
      })
      snBody.frequency.value = 120 + params.pitch * 180 // 120-300Hz
      snBody.connect(merge)

      // Snare snap: filtered white noise
      const snFilter = new Tone.Filter({
        type: 'bandpass',
        frequency: 1000 + params.tone * 7000, // 1000-8000Hz
        Q: 1.5
      })
      const snNoise = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: {
          attack: 0.001,
          decay: 0.05 + params.decay * 0.45,
          sustain: 0,
          release: 0.01
        }
      })
      snNoise.connect(snFilter)
      snFilter.connect(merge)

      // Trigger both simultaneously — body at 0.6 velocity, noise at full
      snBody.triggerAttackRelease('E1', '16n', 0, 0.6)
      snNoise.triggerAttackRelease('16n', 0, 1.0)
    }, duration, 1, Tone.context?.sampleRate || 44100)

    if (!buffer || buffer.duration === 0) {
      throw new Error('[DrumBufferRenderer] Empty SN buffer')
    }
    return buffer
  }

  /**
   * Render a hi-hat buffer from parameters.
   * Uses MetalSynth for metallic partials with highpass sweep.
   * @param {Object} params - { pitch: 0-1, decay: 0-1, tone: 0-1 }
   * @returns {Promise<ToneAudioBuffer>}
   */
  static async renderHh (params) {
    return DrumBufferRenderer._enqueue(() => DrumBufferRenderer._renderHhInternal(params))
  }

  static async _renderHhInternal (params) {
    const decay = 0.08 + params.decay * 0.32
    const duration = 0.001 + decay + 0.05 + 0.15 // attack + decay + release + margin
    const freq = 200 + params.pitch * 600 // 200-800Hz

    const buffer = await Tone.Offline(() => {
      const hh = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay, release: 0.05 },
        harmonicity: 5.1 + params.tone * 3,
        resonance: 300, // highpass resting freq — tuned to let partials pass
        octaves: 4,
        volume: -12 // tame perceptually dominant high-frequency partials
      }).toDestination()
      // MetalSynth constructor IGNORES the frequency option — must set explicitly
      hh.frequency.value = freq
      // MetalSynth MUST receive frequency as first arg (inherited from Instrument)
      hh.triggerAttackRelease(freq, '16n', 0, 1.0)
    }, duration, 1, Tone.context?.sampleRate || 44100)

    if (!buffer || buffer.duration === 0) {
      throw new Error('[DrumBufferRenderer] Empty HH buffer')
    }
    return buffer
  }

  /**
   * Render an open hi-hat buffer from parameters.
   * Uses MetalSynth like HH but with longer decay for sustained metallic ring.
   * Choked by closed HH in playback layer (AudioService / UserSynthManager).
   * @param {Object} params - { pitch: 0-1, decay: 0-1, tone: 0-1 }
   * @returns {Promise<ToneAudioBuffer>}
   */
  static async renderOh (params) {
    return DrumBufferRenderer._enqueue(() => DrumBufferRenderer._renderOhInternal(params))
  }

  static async _renderOhInternal (params) {
    const decay = 0.3 + params.decay * 0.7 // 0.3-1.0s (longer than HH's 0.08-0.4s)
    const duration = 0.001 + decay + 0.1 + 0.2 // attack + decay + release + margin
    const freq = 250 + params.pitch * 700 // 250-950Hz

    const buffer = await Tone.Offline(() => {
      const oh = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay, release: 0.1 },
        harmonicity: 5.5 + params.tone * 2.5, // 5.5-8.0 (slightly above HH's 5.1-8.1)
        resonance: 300,
        octaves: 4,
        volume: -12
      }).toDestination()
      // MetalSynth constructor IGNORES the frequency option — must set explicitly
      oh.frequency.value = freq
      // MetalSynth MUST receive frequency as first arg (inherited from Instrument)
      oh.triggerAttackRelease(freq, '8n', 0, 1.0)
    }, duration, 1, Tone.context?.sampleRate || 44100)

    if (!buffer || buffer.duration === 0) {
      throw new Error('[DrumBufferRenderer] Empty OH buffer')
    }
    return buffer
  }

  /**
   * Render a complete drum kit (bd, sn, hh, oh) sequentially.
   * MUST be sequential: Tone.Offline temporarily swaps the global audio context.
   * Concurrent renders via Promise.all corrupt the context chain — each save/restore
   * captures the wrong context, leaving Tone.js pointed at an OfflineAudioContext
   * after completion. Nodes created afterwards end up in the wrong context.
   * @param {Object} patch - Drum patch from PatchDefinitions (must have .instruments)
   * @returns {Promise<{bd: ToneAudioBuffer, sn: ToneAudioBuffer, hh: ToneAudioBuffer, oh: ToneAudioBuffer}>}
   */
  static async renderKit (patch) {
    return DrumBufferRenderer._enqueue(async () => {
      const bd = await DrumBufferRenderer._renderBdInternal(patch.instruments.bd)
      const sn = await DrumBufferRenderer._renderSnInternal(patch.instruments.sn)
      const hh = await DrumBufferRenderer._renderHhInternal(patch.instruments.hh)
      const oh = await DrumBufferRenderer._renderOhInternal(patch.instruments.oh)
      return { bd, sn, hh, oh }
    })
  }
}

// Export to window for vanilla JS script loading
if (typeof window !== 'undefined') {
  window.DrumBufferRenderer = DrumBufferRenderer
}
