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

  async _onKeyDown(e) {
    // Ignore when typing in an input
    const t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    // Ignore when modifier keys are held (avoid clobbering browser shortcuts)
    if (e.ctrlKey || e.metaKey || e.altKey) return

    if (e.key === '1' || e.key === '2' || e.key === '3') {
      const fmt = ({ '1': 'desktop', '2': 'mobile', '3': 'square' })[e.key]
      this._currentFormat = fmt
      this._flash(`format → ${this._formatLabel(fmt)}`)
      return
    }

    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      await this._toggleRecord()
    }
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
      // Use full-tab display capture (includes feed + DOM UI). Browser will
      // prompt the user to pick a tab — preferCurrentTab pre-selects this one.
      this._flash('pick this tab in the share dialog…', '#FFFF55', 0)
      const result = await rec.startDisplayRecording(this._currentFormat)
      if (result.success) {
        this._showRecording()
      } else if (result.error === 'share-cancelled') {
        this._flash('share cancelled', '#FFA500', 2000)
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
      this._flash(`saved · ${dur}s · ${sizeMB} MB`, '#7CFC7A', 4000)
    } else {
      this._flash(`ended: ${result?.error || 'no file'}`, '#FFA500', 4000)
    }
  }
}

if (typeof window !== 'undefined') {
  window.CaptureHotkeys = CaptureHotkeys
}
