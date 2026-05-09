/**
 * CaptureHotkeys
 *
 * In-page recording trigger for the press-kit capture session. Activated by
 * URL param `?capture=1` to keep it hidden in normal use. Avoids the audio
 * glitch caused by switching to the monitor tab to click Record (when the
 * page being recorded loses focus, AudioContext is throttled or suspended,
 * and the resume on tab focus produces audible crackles in the recorded
 * stream).
 *
 * Bindings:
 *   1 / 2 / 3 — pick format (Desktop / Mobile / Square)
 *   R        — toggle record
 *
 * The HUD is plain DOM, layered above the PixiJS canvas. The recorder only
 * captures the compositing canvas (which is drawn from the PixiJS canvas),
 * so DOM elements are NOT visible in the recorded video.
 *
 * Exposes itself on window.CaptureHotkeys for both ES-module (landing) and
 * regular-script (rooms) consumers.
 */
class CaptureHotkeys {
  /**
   * @param {Object} opts
   * @param {Function} opts.getRecorder - Returns the active recorder instance (may be null)
   * @param {Function} [opts.constructRecorder] - Lazily constructs a recorder if missing (rooms)
   */
  constructor({ getRecorder, constructRecorder }) {
    this._getRecorder = getRecorder
    this._constructRecorder = constructRecorder || null
    this._currentFormat = 'desktop'
    this._hud = null
    this._idleHudTimer = null
    this._keyHandler = null
    this._enabled = false
    this._subscribedRecorder = null   // recorder we've already wired onRecordingEnded on
  }

  /**
   * Enables hotkeys and HUD if URL has `?capture=1`. Idempotent.
   */
  enableIfRequested() {
    if (this._enabled) return
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('capture') !== '1') return
    } catch (e) {
      return
    }
    this._enabled = true

    this._mountHud()
    this._showIdleHud()

    this._keyHandler = (e) => this._onKeyDown(e)
    window.addEventListener('keydown', this._keyHandler)
  }

  /**
   * Tear down listeners (rarely used — page generally lives for one session).
   */
  disable() {
    if (!this._enabled) return
    this._enabled = false
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler)
      this._keyHandler = null
    }
    if (this._hud && this._hud.parentNode) {
      this._hud.parentNode.removeChild(this._hud)
    }
    this._hud = null
  }

  // =========================================================================
  // Private
  // =========================================================================

  _mountHud() {
    if (this._hud) return
    const hud = document.createElement('div')
    hud.id = 'captureHud'
    hud.style.cssText = [
      'position:fixed',
      'bottom:12px',
      'right:12px',
      'padding:6px 10px',
      'background:rgba(0,0,0,0.65)',
      'color:#7CFC7A',
      'font:11px ui-monospace,Menlo,Consolas,monospace',
      'z-index:2147483647',
      'border-radius:4px',
      'pointer-events:none',
      'user-select:none',
      'border:1px solid rgba(124,252,122,0.25)'
    ].join(';')
    document.body.appendChild(hud)
    this._hud = hud
  }

  _formatLabel(fmt) {
    return ({
      desktop: 'Desktop 1920×1080',
      mobile: 'Mobile 1080×1920',
      square: 'Square 1080×1080'
    })[fmt] || fmt
  }

  _showIdleHud() {
    if (!this._hud) return
    this._hud.style.color = '#7CFC7A'
    this._hud.textContent = `capture · ${this._formatLabel(this._currentFormat)} · 1/2/3 fmt · R rec`
  }

  _flash(msg, color = '#7CFC7A', revertMs = 1500) {
    if (!this._hud) return
    this._hud.style.color = color
    this._hud.textContent = msg
    if (this._idleHudTimer) clearTimeout(this._idleHudTimer)
    if (revertMs > 0) {
      this._idleHudTimer = setTimeout(() => this._showIdleHud(), revertMs)
    }
  }

  _showRecording() {
    if (!this._hud) return
    this._hud.style.color = '#FF4040'
    this._hud.textContent = `● REC · ${this._formatLabel(this._currentFormat)} · R to stop`
  }

  /**
   * Recording HUD with actual captured dims. Color-codes orange if the actual
   * dims don't match the target (most often because the Chrome share-indicator
   * bar took ~30-40px of vertical space).
   */
  _showRecordingWith(actualDims, targetDims, color) {
    if (!this._hud) return
    this._hud.style.color = color || '#FF4040'
    const mismatch = actualDims && targetDims && actualDims !== targetDims
    const dimsPart = actualDims
      ? (mismatch ? `${actualDims} (target ${targetDims})` : actualDims)
      : this._formatLabel(this._currentFormat)
    this._hud.textContent = `● REC · ${dimsPart} · R to stop`
  }

  async _onKeyDown(e) {
    // Ignore when typing in an input
    const t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    // Ignore when modifier keys are held (avoid clobbering browser shortcuts)
    if (e.ctrlKey || e.metaKey || e.altKey) return

    if (e.key === '1' || e.key === '2' || e.key === '3') {
      const fmt = ({ '1': 'desktop', '2': 'mobile', '3': 'square' })[e.key]
      this._currentFormat = fmt
      // In window-mode capture (--app=URL) the recorder receives whatever
      // dimensions the window actually has, not the format constraints.
      // Iterate the resize so chrome-decoration and DPR quirks converge to
      // the exact target inner viewport.
      const converged = await this._tryResizeForFormat(fmt)
      const dimStr = `${window.innerWidth}×${window.innerHeight}`
      this._flash(converged
        ? `format → ${this._formatLabel(fmt)} · ${dimStr}`
        : `format → ${this._formatLabel(fmt)} · ${dimStr} (off)`,
        converged ? '#7CFC7A' : '#FFA500',
        converged ? 1500 : 4000)
      return
    }

    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      // One more convergence pass right before recording, in case the operator
      // moved/resized after the format keypress.
      await this._tryResizeForFormat(this._currentFormat)
      await this._toggleRecord()
    }
  }

  /**
   * Resize the window so its inner dimensions match the target format. Iterates
   * up to N times because:
   *   - resizeTo is asynchronous in practice; one pass measures stale inner
   *   - Some Chrome configs don't decorate-by-deltas linearly, so a single
   *     adjustment can under-shoot or over-shoot
   *   - The operator's chrome height isn't constant across launches (DevTools
   *     dock state, theme, accessibility settings)
   *
   * Returns true if convergence reached (within 2px on both axes), false if
   * resizeTo isn't supported (regular-tab contexts) or the OS clamped further
   * resizing (e.g. screen smaller than target at current DPR).
   * @private
   */
  async _tryResizeForFormat(format) {
    const TARGETS = {
      desktop: [1920, 1080],
      mobile: [1080, 1920],
      square: [1080, 1080]
    }
    const target = TARGETS[format]
    if (!target) return false
    const [targetW, targetH] = target

    const TOL = 2
    const MAX_ITERATIONS = 6
    const SETTLE_MS = 80

    let lastInnerW = -1
    let lastInnerH = -1

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const dw = targetW - window.innerWidth
      const dh = targetH - window.innerHeight
      if (Math.abs(dw) <= TOL && Math.abs(dh) <= TOL) return true

      // Stop if the previous iteration made no progress — OS/Chrome has
      // clamped the window. Returning false signals the caller (HUD) so the
      // operator knows to take action (relaunch with bigger --window-size,
      // auto-hide taskbar, etc.).
      if (i > 0 && window.innerWidth === lastInnerW && window.innerHeight === lastInnerH) {
        return false
      }
      lastInnerW = window.innerWidth
      lastInnerH = window.innerHeight

      try {
        window.resizeTo(window.outerWidth + dw, window.outerHeight + dh)
      } catch (e) {
        // resizeTo throws / is no-op in regular tab contexts (security).
        return false
      }
      await new Promise(resolve => setTimeout(resolve, SETTLE_MS))
    }

    const finalDw = targetW - window.innerWidth
    const finalDh = targetH - window.innerHeight
    return Math.abs(finalDw) <= TOL && Math.abs(finalDh) <= TOL
  }

  async _toggleRecord() {
    let rec = this._getRecorder()
    if (!rec && this._constructRecorder) {
      try { rec = this._constructRecorder() } catch (err) {
        this._flash(`error: ${err.message}`, '#FFA500', 3000)
        return
      }
    }
    if (!rec) {
      this._flash('error: recorder not ready', '#FFA500', 3000)
      return
    }

    // Subscribe once per recorder instance so the HUD updates regardless of
    // how stop was triggered: hotkey toggle, browser "stop sharing" button,
    // or any future programmatic stop. Without this hook the HUD stays on
    // "● REC" after the user clicks Chrome's Stop and then mis-fires on the
    // next keypress.
    if (rec !== this._subscribedRecorder) {
      this._subscribedRecorder = rec
      rec.onRecordingEnded = (result) => this._onRecordingEnded(result)
    }

    if (rec._isRecording) {
      this._flash('stopping…', '#FFFF55', 0)
      // Fire-and-forget — onRecordingEnded callback will land the final HUD
      // update (saved / error). Awaiting here would only duplicate the flash.
      rec.stopRecording().catch((err) => {
        this._flash(`stop error: ${err.message}`, '#FFA500', 4000)
      })
    } else {
      // Full-tab display capture (includes feed + DOM UI). Chrome shows a
      // simplified "Share / Cancel" dialog when preferCurrentTab is honored,
      // otherwise the standard picker.
      this._flash('Chrome will ask: click Share…', '#FFFF55', 0)
      const result = await rec.startDisplayRecording(this._currentFormat)
      if (result.success) {
        // Show actual captured dimensions so the operator can see immediately
        // if the Chrome share-indicator bar shrunk the viewport (e.g. 1920×1040
        // instead of 1920×1080). They can then resize the window to compensate.
        const aw = result.actualWidth
        const ah = result.actualHeight
        const target = result.format === 'desktop' ? '1920×1080'
          : result.format === 'mobile' ? '1080×1920'
          : result.format === 'square' ? '1080×1080'
          : ''
        const dimsLine = (aw && ah) ? `${aw}×${ah}` : ''
        const targetMatch = aw === 1920 && ah === 1080 || aw === 1080 && ah === 1920 || aw === 1080 && ah === 1080
        const color = targetMatch ? '#FF4040' : '#FFA500'
        this._showRecordingWith(dimsLine, target, color)
      } else if (result.error === 'share-cancelled') {
        this._flash('share cancelled', '#FFA500', 2000)
      } else if (result.error === 'audio-not-ready') {
        this._flash('press Start on the page first, then R', '#FF4040', 5000)
      } else if (result.error === 'audio-fanout-failed') {
        this._flash('audio fan-out failed — check console', '#FF4040', 5000)
      } else {
        this._flash(`start failed: ${result.error || 'unknown'}`, '#FFA500', 4000)
      }
    }
  }

  /**
   * Called by the recorder via onRecordingEnded for any stop path —
   * hotkey, browser "stop sharing" button, or programmatic stop.
   */
  _onRecordingEnded(result) {
    if (result && result.success) {
      const sizeMB = ((result.fileSize || 0) / (1024 * 1024)).toFixed(1)
      const dur = Math.round((result.duration || 0) / 1000)
      const aw = result.actualWidth
      const ah = result.actualHeight
      if (aw && ah) {
        // Authoritative file dimensions (read post-encode from the blob).
        // Compare to format target and warn loudly if they don't match — the
        // HUD-during-recording reads videoTrack.getSettings() which can
        // mis-report; this is the truth-in-the-file check.
        const targets = { desktop: [1920, 1080], mobile: [1080, 1920], square: [1080, 1080] }
        const fmt = result.format || this._currentFormat
        const target = targets[fmt]
        const matches = target && aw === target[0] && ah === target[1]
        const dimStr = `${aw}×${ah}`
        if (matches) {
          this._flash(`saved · ${dur}s · ${sizeMB} MB · ${dimStr}`, '#7CFC7A', 5000)
        } else {
          const tgtStr = target ? `target ${target[0]}×${target[1]}` : ''
          this._flash(`saved ${dimStr} (${tgtStr}) · ${sizeMB} MB`, '#FFA500', 7000)
        }
      } else {
        this._flash(`saved · ${dur}s · ${sizeMB} MB`, '#7CFC7A', 4000)
      }
    } else {
      this._flash(`ended: ${result?.error || 'no file'}`, '#FFA500', 4000)
    }
  }
}

if (typeof window !== 'undefined') {
  window.CaptureHotkeys = CaptureHotkeys
}
