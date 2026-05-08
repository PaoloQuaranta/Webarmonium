/**
 * LandingPageRecorder
 * In-page recording of PixiJS canvas visuals + Tone.js audio via MediaRecorder API.
 * Used by both the landing page and jam rooms (same GenerativeVisualService /
 * AudioService surface). The class is exposed as both an ES-module export and on
 * `window.LandingPageRecorder` so non-module pages (rooms.html) can reuse it via
 * a small <script type="module"> shim.
 *
 * Architecture:
 * - Resizes PixiJS canvas to target resolution (1920x1080, 1080x1920, or 1080x1080)
 * - Compositing Canvas 2D copies each frame via post-render hook (avoids WebGL preserveDrawingBuffer issues)
 * - Audio captured via MediaStreamDestination fan-out from masterVolume
 * - OPFS streaming for 30-min recordings (~900 MB); in-memory fallback for short recordings
 * - Bypass flags on GenerativeVisualService + AudioService prevent blur/idle pauses
 * - Codec preference: MP4 (avc1+aac, Chrome 126+) → WebM VP9/VP8 fallbacks
 * - Sets `window.__webarmoniumRecording` so resize handlers in main.js / CanvasManager
 *   skip layout changes that would stomp the target resolution mid-capture
 *
 * Triggered remotely from composition monitor via Socket.io recording:command events.
 * The monitor selects source (landing vs jam room) and the backend relays the
 * command to the right socket.io room.
 */

const RECORDING_FORMATS = {
  desktop: { width: 1920, height: 1080, label: 'Desktop (YouTube)' },
  mobile: { width: 1080, height: 1920, label: 'Mobile (TikTok/Instagram)' },
  square: { width: 1080, height: 1080, label: 'Square (Instagram/social)' }
}

// VP8 first: software encoding is ~2× lighter than H.264 software, and most
// systems without dedicated H.264 hardware encoders fall back to software for
// MP4 — that path can saturate the main thread enough to cause audio dropouts.
// VP9 and MP4 follow as opt-in upgrades. Final delivery to MP4 happens in post
// (lossless ffmpeg recode at the same bitrate).
const CODEC_FALLBACK_CHAIN = [
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm'
]

// Tuned for stable A/V capture on integrated-GPU laptops without thermal
// throttling. 24fps is festival-accepted (cinema standard); 2.5 Mbps is plenty
// for generative art with smooth gradients (visually identical to 4 Mbps).
const CAPTURE_FPS = 24
const FRAME_INTERVAL_MS = 1000 / CAPTURE_FPS   // ~41.67 ms
const VIDEO_BITRATE = 2_500_000   // 2.5 Mbps
const AUDIO_BITRATE = 128_000     // 128 kbps
const TIMESLICE_MS = 10_000       // 10-second chunks
const STATUS_INTERVAL_MS = 2_000  // Status updates every 2s

export class LandingPageRecorder {
  /**
   * @param {Object} opts
   * @param {Object} opts.visualService - GenerativeVisualService instance (lands or room)
   * @param {Object} opts.audioService - AudioService instance
   * @param {string} [opts.sourceLabel] - Tag for filename, e.g. 'landing' or 'room'
   */
  constructor({ visualService, audioService, sourceLabel }) {
    this._visualService = visualService
    this._audioService = audioService
    this._sourceLabel = sourceLabel || ''

    // Recording state
    this._isRecording = false
    this._format = null
    this._recorder = null
    this._startTime = 0
    this._totalSize = 0
    this._mimeType = null
    this._fileExt = null
    this._lastFrameMs = 0   // Throttle for compositing (matches capture fps)

    // Canvas
    this._compositingCanvas = null
    this._compositingCtx = null
    this._origWidth = 0
    this._origHeight = 0

    // Audio
    this._audioDest = null
    this._nativeOutputNode = null
    this._captureGain = null

    // Display capture (getDisplayMedia path) — captures full tab incl. DOM
    this._displayStream = null

    // Storage
    this._fileWriter = null   // OPFS WritableStream
    this._chunks = null       // In-memory fallback
    this._opfsFileName = null

    // Status callback
    this._statusInterval = null
    this._onStatus = null
  }

  /**
   * Start recording in the specified format.
   * @param {string} format - 'desktop' (1920x1080), 'mobile' (1080x1920), or 'square' (1080x1080)
   * @returns {Promise<Object>} Result with success status
   */
  async startRecording(format = 'desktop') {
    if (this._isRecording) {
      return { success: false, error: 'Already recording' }
    }

    const formatConfig = RECORDING_FORMATS[format]
    if (!formatConfig) {
      return { success: false, error: `Unknown format: ${format}` }
    }

    // Lock immediately to prevent concurrent calls (async gaps below)
    this._isRecording = true

    try {
      this._format = format
      const { width: targetW, height: targetH } = formatConfig

      // 1. Save original canvas dimensions and resize to target
      if (!this._visualService.pixiAdapter) {
        throw new Error('Visual service not initialized')
      }
      this._origWidth = this._visualService.pixiAdapter.width
      this._origHeight = this._visualService.pixiAdapter.height
      this._visualService.resize(targetW, targetH)

      // 2. Create compositing canvas at target resolution
      this._compositingCanvas = document.createElement('canvas')
      this._compositingCanvas.width = targetW
      this._compositingCanvas.height = targetH
      this._compositingCtx = this._compositingCanvas.getContext('2d')

      // 3. Enable recording bypass on services (prevents idle/blur pauses)
      this._visualService._recordingBypass = true
      this._visualService.isPaused = false
      this._visualService.lastActivityTime = Date.now()
      this._audioService._recordingBypass = true

      // 4. Hook into post-render for frame compositing
      this._visualService._postRenderCallback = this._onFrame.bind(this)

      // 5. Set up audio capture from Tone.js
      const audioStream = this._setupAudioCapture()

      // 6. Create combined A/V stream
      const videoStream = this._compositingCanvas.captureStream(CAPTURE_FPS)
      const audioTracks = audioStream ? audioStream.getAudioTracks() : []
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioTracks
      ])

      // 7. Set up storage (OPFS preferred, in-memory fallback)
      await this._setupStorage()

      // 8. Select codec and create MediaRecorder
      const mimeType = this._selectCodec()
      this._mimeType = mimeType
      this._fileExt = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
      this._recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: VIDEO_BITRATE,
        audioBitsPerSecond: AUDIO_BITRATE
      })

      // Track pending OPFS writes to prevent race with close()
      this._lastWritePromise = Promise.resolve()

      this._recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this._totalSize += event.data.size
          if (this._fileWriter) {
            // Chain writes sequentially so close() can await the last one
            this._lastWritePromise = this._lastWritePromise.then(async () => {
              try {
                await this._fileWriter.write(event.data)
              } catch (e) {
                console.error('[Recorder] OPFS write error:', e)
              }
            })
          } else if (this._chunks) {
            this._chunks.push(event.data)
          }
        }
      }

      this._recorder.onerror = (event) => {
        console.error('[Recorder] MediaRecorder error:', event.error)
        this._cleanup()
      }

      // 9. Start recording
      this._recorder.start(TIMESLICE_MS)
      this._startTime = Date.now()
      this._totalSize = 0
      this._lastFrameMs = 0

      // Global flag so resize handlers (landing main.js, CanvasManager in rooms)
      // skip layout resizes that would stomp the target resolution mid-capture.
      if (typeof window !== 'undefined') {
        window.__webarmoniumRecording = true
      }

      // 10. Start status reporting
      this._startStatusReporting()

      console.log(`[Recorder] Started ${format} (${targetW}x${targetH})`)

      return {
        success: true,
        format,
        resolution: [targetW, targetH],
        mimeType
      }
    } catch (error) {
      console.error('[Recorder] Start failed:', error)
      this._cleanup()
      return { success: false, error: error.message }
    }
  }

  /**
   * Start full-tab recording via getDisplayMedia (captures DOM + canvas).
   * MUST be called from a user gesture (e.g. keypress handler) — the browser
   * shows a picker prompting the user to pick the source. With Chrome's
   * `preferCurrentTab: true` the current tab is pre-selected; one click and
   * the share starts.
   *
   * Compared to startRecording():
   * - Captures the visible-causality feed, dashboard UI, all DOM content
   * - Eliminates the per-frame drawImage GPU readback (the main-thread cost
   *   that produced the live audio crackle)
   * - Audio path is identical (Tone.js master → MediaStreamDestination)
   *
   * @param {string} format - 'desktop' / 'mobile' / 'square' (used for filename + size hint)
   * @returns {Promise<Object>} { success, format, mimeType, ... } | { success:false, error }
   */
  async startDisplayRecording(format = 'desktop') {
    if (this._isRecording) {
      return { success: false, error: 'Already recording' }
    }

    const formatConfig = RECORDING_FORMATS[format]
    if (!formatConfig) {
      return { success: false, error: `Unknown format: ${format}` }
    }

    // Lock immediately to prevent concurrent calls
    this._isRecording = true

    try {
      this._format = format
      const { width: targetW, height: targetH } = formatConfig

      // 1. Request tab capture from user.
      //
      // Chrome by default EXCLUDES the current tab from the picker for privacy
      // reasons — without selfBrowserSurface:'include' the operator looking
      // at webarmonium.net sees an empty "Chrome Tab" list (their only tab is
      // hidden). preferCurrentTab is meant to invert this and even skip the
      // picker, but it's silently ignored on some Chrome configs.
      //
      // selfBrowserSurface:'include' is the spec-compliant way to ensure the
      // current tab IS a candidate. Both options below are unknown-property-safe:
      // browsers that don't recognize them ignore them rather than throw.
      const baseConstraints = {
        selfBrowserSurface: 'include',     // Make current tab selectable in picker
        surfaceSwitching: 'include',       // Allow operator to switch source mid-session
        preferCurrentTab: true,            // Bonus: simplified dialog when honored
        displaySurface: 'browser',         // Filter picker to browser tabs only
        frameRate: { ideal: CAPTURE_FPS, max: CAPTURE_FPS },
        width: { ideal: targetW },
        height: { ideal: targetH }
      }
      let displayStream
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: baseConstraints,
          audio: false
        })
      } catch (err) {
        this._isRecording = false
        return {
          success: false,
          error: err && err.name === 'NotAllowedError' ? 'share-cancelled' : (err && err.message) || 'unknown'
        }
      }

      this._displayStream = displayStream

      // If the user hits the browser's "Stop sharing" button mid-recording,
      // gracefully stop. Otherwise the encoder keeps writing silence.
      const videoTrack = displayStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.onended = () => {
          if (this._isRecording) {
            this.stopRecording().catch(() => {})
          }
        }
      }

      // 2. Bypass on AudioService only — visualService doesn't need bypass
      //    here (no compositing path), but setting it costs nothing and keeps
      //    behavior consistent if blur happens.
      this._audioService._recordingBypass = true
      if (this._visualService) {
        this._visualService._recordingBypass = true
        this._visualService.lastActivityTime = Date.now()
      }

      // 3. Audio capture from Tone.js master
      const audioStream = this._setupAudioCapture()
      const audioTracks = audioStream ? audioStream.getAudioTracks() : []

      // 4. Combined stream: tab video + Tone.js audio
      const combinedStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...audioTracks
      ])

      // 5. Storage
      await this._setupStorage()

      // 6. Codec + recorder
      const mimeType = this._selectCodec()
      this._mimeType = mimeType
      this._fileExt = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
      this._recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: VIDEO_BITRATE,
        audioBitsPerSecond: AUDIO_BITRATE
      })

      this._lastWritePromise = Promise.resolve()
      this._recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this._totalSize += event.data.size
          if (this._fileWriter) {
            this._lastWritePromise = this._lastWritePromise.then(async () => {
              try { await this._fileWriter.write(event.data) } catch (e) { console.error('[Recorder] OPFS write error:', e) }
            })
          } else if (this._chunks) {
            this._chunks.push(event.data)
          }
        }
      }
      this._recorder.onerror = (event) => {
        console.error('[Recorder] MediaRecorder error:', event.error)
        this._cleanup()
      }

      this._recorder.start(TIMESLICE_MS)
      this._startTime = Date.now()
      this._totalSize = 0
      this._lastFrameMs = 0

      if (typeof window !== 'undefined') {
        window.__webarmoniumRecording = true
      }

      this._startStatusReporting()

      const settings = videoTrack ? videoTrack.getSettings() : {}
      console.log(`[Recorder] Display capture started (${settings.width || '?'}x${settings.height || '?'} @ ${settings.frameRate || '?'}fps, ${mimeType})`)

      return {
        success: true,
        format,
        method: 'display',
        actualWidth: settings.width,
        actualHeight: settings.height,
        actualFrameRate: settings.frameRate,
        mimeType
      }
    } catch (error) {
      console.error('[Recorder] startDisplayRecording failed:', error)
      this._cleanup()
      return { success: false, error: error.message }
    }
  }

  /**
   * Stop recording and trigger download.
   *
   * Fires `this.onRecordingEnded(result)` (if set) regardless of how stop was
   * triggered — manual hotkey, browser "stop sharing" button via the
   * videoTrack.onended hook, or programmatic call. This is the single
   * notification point external UI (e.g. CaptureHotkeys HUD) can rely on to
   * update its state when the recording transitions to stopped.
   *
   * @returns {Promise<Object>} Result with file info
   */
  async stopRecording() {
    if (!this._isRecording || !this._recorder) {
      return { success: false, error: 'Not recording' }
    }

    let result
    try {
      const duration = Date.now() - this._startTime

      // Stop MediaRecorder and wait for final data flush
      await new Promise((resolve, reject) => {
        this._recorder.onstop = resolve
        this._recorder.onerror = (e) => reject(e.error || new Error('MediaRecorder error during stop'))
        try {
          this._recorder.stop()
        } catch (e) {
          reject(e)
        }
      })

      // Capture metrics before cleanup resets them
      const totalSize = this._totalSize

      // Finalize storage and trigger download
      const fileName = await this._finalizeAndDownload(duration)

      // Cleanup (restores canvas size, clears bypass flags)
      this._cleanup()

      result = {
        success: true,
        duration,
        fileSize: totalSize,
        fileName
      }
    } catch (error) {
      console.error('[Recorder] Stop failed:', error)
      this._cleanup()
      result = { success: false, error: error.message }
    }

    // Notify external listeners (HUD, monitor) — fire even on error so the
    // HUD doesn't get stuck on "● REC" if something went wrong.
    if (typeof this.onRecordingEnded === 'function') {
      try { this.onRecordingEnded(result) } catch (e) { /* never let HUD throw break the result */ }
    }

    return result
  }

  /**
   * Get current recording status.
   * @returns {Object}
   */
  getStatus() {
    return {
      isRecording: this._isRecording,
      format: this._format,
      duration: this._isRecording ? Date.now() - this._startTime : 0,
      size: this._totalSize
    }
  }

  /**
   * Set status callback (called every STATUS_INTERVAL_MS during recording).
   * @param {Function} callback - receives status object
   */
  setStatusCallback(callback) {
    this._onStatus = callback
  }

  // =========================================================================
  // Private methods
  // =========================================================================

  /**
   * Post-render callback — composites each frame from the PixiJS canvas.
   * Called in the same event loop tick as pixiAdapter.render() to ensure
   * the WebGL framebuffer is still valid (not yet cleared by the compositor).
   *
   * PixiJS renders at display refresh (typically 60fps); captureStream samples
   * the compositing canvas at CAPTURE_FPS. Compositing every PixiJS frame is
   * therefore wasteful — and the GPU→CPU readback inside drawImage on a WebGL
   * canvas is exactly the kind of synchronous main-thread work that starves
   * the audio worklet and produces crackles. Throttle to one composite per
   * capture interval.
   *
   * @param {HTMLCanvasElement} pixiCanvas
   * @private
   */
  _onFrame(pixiCanvas) {
    if (!this._isRecording || !this._compositingCtx) return
    const now = performance.now()
    if (now - this._lastFrameMs < FRAME_INTERVAL_MS - 1) return
    this._lastFrameMs = now
    // Draw with explicit scaling to handle any size mismatch
    this._compositingCtx.drawImage(pixiCanvas,
      0, 0, pixiCanvas.width, pixiCanvas.height,
      0, 0, this._compositingCanvas.width, this._compositingCanvas.height
    )
  }

  /**
   * Set up audio capture by connecting masterVolume to a MediaStreamDestination.
   * Uses fan-out (speakers continue to work).
   * @returns {MediaStream|null}
   * @private
   */
  _setupAudioCapture() {
    try {
      const mv = this._audioService.masterVolume
      if (!mv) {
        console.warn('[Recorder] masterVolume null — no audio')
        return null
      }

      // Tone.js v14 uses standardized-audio-context internally.
      // Tone.context.rawContext is NOT the same native AudioContext as the one
      // standardized-audio-context uses for its nodes. To avoid "different audio
      // context" errors, we must create the MediaStreamDestination on the SAME
      // context that Tone.js nodes live on.
      //
      // Strategy:
      // 1. Create a Tone.Gain (lives on the correct SAC context)
      // 2. Connect masterVolume → captureGain (Tone→Tone, always works)
      // 3. Get the SAC node's .context to create MediaStreamDestination on it
      // 4. Connect captureGain's node → MediaStreamDestination (same context)

      this._captureGain = new Tone.Gain(1)
      mv.connect(this._captureGain)

      // Get the internal node from captureGain (SAC-wrapped GainNode)
      const sacNode = this._captureGain._gainNode
        || this._captureGain.input
        || this._captureGain.output
      if (!sacNode || typeof sacNode.connect !== 'function') {
        console.error('[Recorder] Cannot resolve internal node from Tone.Gain')
        return null
      }

      // Create MediaStreamDestination on the SAME context as the SAC node
      const nodeCtx = sacNode.context
      if (!nodeCtx || typeof nodeCtx.createMediaStreamDestination !== 'function') {
        console.error('[Recorder] Node context lacks createMediaStreamDestination')
        return null
      }

      this._audioDest = nodeCtx.createMediaStreamDestination()
      sacNode.connect(this._audioDest)
      this._nativeOutputNode = sacNode

      return this._audioDest.stream
    } catch (error) {
      console.error('[Recorder] Audio setup FAILED:', error.message, error)
      return null
    }
  }

  /**
   * Set up OPFS storage for streaming chunks to disk.
   * Falls back to in-memory chunks if OPFS is unavailable.
   * Note: file extension is set later in startRecording() once codec is known;
   * here we use a temp suffix and rename at finalize. We just use a unique name.
   * @private
   */
  async _setupStorage() {
    try {
      if (navigator.storage && navigator.storage.getDirectory) {
        const root = await navigator.storage.getDirectory()
        // Provisional .bin extension — final blob is wrapped with correct MIME later
        this._opfsFileName = `webarmonium-${this._format}-${Date.now()}.bin`
        const fileHandle = await root.getFileHandle(this._opfsFileName, { create: true })
        this._fileWriter = await fileHandle.createWritable()
        return
      }
    } catch (error) {
      console.warn('[Recorder] OPFS unavailable, using in-memory fallback:', error)
    }

    // Fallback: in-memory chunks
    this._chunks = []
    this._fileWriter = null
  }

  /**
   * Select the best available codec from the fallback chain.
   * @returns {string} MIME type string
   * @private
   */
  _selectCodec() {
    for (const mimeType of CODEC_FALLBACK_CHAIN) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType
      }
    }
    // Last resort — let the browser choose
    return ''
  }

  /**
   * Finalize storage and trigger file download.
   * @param {number} duration - Recording duration in ms
   * @returns {Promise<string>} File name
   * @private
   */
  async _finalizeAndDownload(duration) {
    const durationSec = Math.round(duration / 1000)
    const ext = this._fileExt || 'webm'
    const blobMime = ext === 'mp4' ? 'video/mp4' : 'video/webm'
    const sourcePrefix = this._sourceLabel ? `${this._sourceLabel}-` : ''
    const fileName = `webarmonium-${sourcePrefix}${this._format}-${durationSec}s.${ext}`

    let blob

    if (this._fileWriter) {
      // OPFS path: wait for any pending writes, then close writer
      try {
        if (this._lastWritePromise) {
          await this._lastWritePromise
        }
        await this._fileWriter.close()
      } catch (e) {
        console.error('[Recorder] OPFS writer close error:', e)
      }
      this._fileWriter = null

      // Read file back as blob for download
      try {
        const root = await navigator.storage.getDirectory()
        const fileHandle = await root.getFileHandle(this._opfsFileName)
        const file = await fileHandle.getFile()
        // Read the File into an in-memory Blob to decouple from OPFS entry
        blob = new Blob([await file.arrayBuffer()], { type: blobMime })

        // Clean up OPFS file after blob is in memory
        root.removeEntry(this._opfsFileName).catch(() => {})
      } catch (error) {
        console.error('[Recorder] OPFS read-back error:', error)
        return fileName
      }
    } else if (this._chunks && this._chunks.length > 0) {
      // In-memory path: assemble blob
      blob = new Blob(this._chunks, { type: blobMime })
      this._chunks = null
    }

    if (blob) {
      this._triggerDownload(blob, fileName)
    }

    return fileName
  }

  /**
   * Trigger browser download of a blob.
   * @param {Blob} blob
   * @param {string} fileName
   * @private
   */
  _triggerDownload(blob, fileName) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Delay revoke to ensure download completes (long recordings = large files)
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  /**
   * Start periodic status reporting.
   * @private
   */
  _startStatusReporting() {
    if (this._statusInterval) clearInterval(this._statusInterval)
    this._statusInterval = setInterval(() => {
      if (this._onStatus && this._isRecording) {
        this._onStatus(this.getStatus())
      }
    }, STATUS_INTERVAL_MS)
  }

  /**
   * Clean up all recording state and restore services.
   * @private
   */
  _cleanup() {
    this._isRecording = false

    // Clear global recording flag so resize handlers go back to normal
    if (typeof window !== 'undefined') {
      window.__webarmoniumRecording = false
    }

    // Stop status reporting
    if (this._statusInterval) {
      clearInterval(this._statusInterval)
      this._statusInterval = null
    }

    // Stop display-capture tracks (releases the share indicator and frees encoder)
    if (this._displayStream) {
      try {
        this._displayStream.getTracks().forEach(t => t.stop())
      } catch (e) { /* best effort */ }
      this._displayStream = null
    }

    // Disconnect audio capture
    if (this._captureGain) {
      try {
        this._audioService?.masterVolume?.disconnect(this._captureGain)
      } catch (e) { /* may already be disconnected */ }
      try {
        if (this._nativeOutputNode && this._audioDest) {
          this._nativeOutputNode.disconnect(this._audioDest)
        }
      } catch (e) { /* may already be disconnected */ }
      try {
        this._captureGain.dispose()
      } catch (e) { /* best effort */ }
    }
    this._captureGain = null
    this._nativeOutputNode = null
    this._audioDest = null

    // Clear recording bypass flags
    if (this._visualService) {
      this._visualService._recordingBypass = false
      this._visualService._postRenderCallback = null
    }
    if (this._audioService) {
      this._audioService._recordingBypass = false
    }

    // Restore original canvas dimensions
    if (this._origWidth > 0 && this._origHeight > 0 && this._visualService) {
      this._visualService.resize(this._origWidth, this._origHeight)
      this._origWidth = 0
      this._origHeight = 0
    }

    // Clean up compositing canvas
    this._compositingCanvas = null
    this._compositingCtx = null
    // Clean up storage
    if (this._fileWriter) {
      try { this._fileWriter.close() } catch (e) { /* best effort */ }
      this._fileWriter = null
    }
    this._chunks = null

    this._recorder = null
    this._format = null
  }

  /**
   * Format byte size for display.
   * @param {number} bytes
   * @returns {string}
   * @private
   */
  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
}

// Expose globally so non-module pages (rooms.html) can use it via
// `<script type="module">` shim or dynamic import.
if (typeof window !== 'undefined') {
  window.LandingPageRecorder = LandingPageRecorder
}
