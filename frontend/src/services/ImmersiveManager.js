/**
 * ImmersiveManager - Handles immersive/fullscreen mode for rooms
 * Desktop: Uses Fullscreen API + ESC notice
 * Mobile: Hides UI only (no fullscreen)
 */
class ImmersiveManager {
  constructor(app) {
    this.app = app
    this.isImmersive = false
    this._autoHideTimeout = null
    this._autoHideDelay = 3000
    this._keyHandler = null
    this._mouseMoveHandler = null
    this._touchHandler = null
    this._fullscreenChangeHandler = null
    this._cornerHoverHandler = null
  }

  initialize() {
    const toggleBtn = document.getElementById('immersive-toggle')
    const controls = document.getElementById('immersive-controls')
    const playBtn = document.getElementById('immersive-play-btn')
    const exitBtn = document.getElementById('immersive-exit-btn')

    if (!toggleBtn) return

    // Toggle button click
    toggleBtn.addEventListener('click', () => this.toggle())

    // Exit button
    exitBtn?.addEventListener('click', () => this.exit())

    // Play/Stop button - use app's toggleAudio
    playBtn?.addEventListener('click', () => this.app.toggleAudio())

    // ESC key handler
    this._keyHandler = (e) => {
      if (e.key === 'Escape' && this.isImmersive) {
        this.exit()
      }
    }
    document.addEventListener('keydown', this._keyHandler)

    // Fullscreen change handler (browser ESC or F11) - with vendor prefixes
    this._fullscreenChangeHandler = () => {
      const fullscreenElement = document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement

      if (!fullscreenElement && this.isImmersive) {
        this._exitWithoutFullscreen()
      }
    }
    document.addEventListener('fullscreenchange', this._fullscreenChangeHandler)
    document.addEventListener('webkitfullscreenchange', this._fullscreenChangeHandler)
    document.addEventListener('mozfullscreenchange', this._fullscreenChangeHandler)
    document.addEventListener('MSFullscreenChange', this._fullscreenChangeHandler)

    // Mouse/touch shows minibar
    this._mouseMoveHandler = () => {
      if (this.isImmersive) this._showControls()
    }
    document.addEventListener('mousemove', this._mouseMoveHandler)

    this._touchHandler = () => {
      if (this.isImmersive) this._showControls()
    }
    document.addEventListener('touchstart', this._touchHandler, { passive: true })

    // Keep controls visible on hover
    controls?.addEventListener('mouseenter', () => {
      this._clearAutoHide()
      controls.classList.add('visible')
    })

    controls?.addEventListener('mouseleave', () => {
      if (this.isImmersive) this._startAutoHide()
    })

    // Corner hover detection (desktop only, non-immersive)
    this._setupCornerHover(toggleBtn)
  }

  _setupCornerHover(toggleBtn) {
    const HOVER_THRESHOLD_VERTICAL = 30
    const HOVER_THRESHOLD_HORIZONTAL = 80
    let hideTimeout = null

    this._cornerHoverHandler = (e) => {
      if (this.isImmersive) return
      const nearBottom = window.innerHeight - e.clientY < HOVER_THRESHOLD_VERTICAL
      const nearRight = window.innerWidth - e.clientX < HOVER_THRESHOLD_HORIZONTAL
      if (nearBottom && nearRight) {
        toggleBtn.classList.add('visible')
        clearTimeout(hideTimeout)
        hideTimeout = setTimeout(() => toggleBtn.classList.remove('visible'), 3000)
      }
    }
    document.addEventListener('mousemove', this._cornerHoverHandler)

    toggleBtn.addEventListener('mouseenter', () => clearTimeout(hideTimeout))
    toggleBtn.addEventListener('mouseleave', () => {
      if (!this.isImmersive) {
        hideTimeout = setTimeout(() => toggleBtn.classList.remove('visible'), 3000)
      }
    })
  }

  toggle() {
    if (this.isImmersive) {
      this.exit()
    } else {
      this.enter()
    }
  }

  async enter() {
    this.isImmersive = true
    document.body.classList.add('immersive-mode')

    // Desktop: request fullscreen with vendor prefixes
    if (!this._isMobile()) {
      try {
        const docEl = document.documentElement
        const requestFullscreen = docEl.requestFullscreen ||
          docEl.webkitRequestFullscreen ||
          docEl.mozRequestFullScreen ||
          docEl.msRequestFullscreen

        if (requestFullscreen) {
          await requestFullscreen.call(docEl)
          this._showEscNotice()
        }
      } catch (err) {
        // Fullscreen denied, continue without
      }
    }

    this._showControls()
    this._resizeCanvas()
  }

  exit() {
    this._exitWithoutFullscreen()

    // Exit browser fullscreen if active (check all vendor prefixes)
    const fullscreenElement = document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement

    if (fullscreenElement) {
      const exitFullscreen = document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.mozCancelFullScreen ||
        document.msExitFullscreen

      if (exitFullscreen) {
        exitFullscreen.call(document).catch(() => {})
      }
    }
  }

  _exitWithoutFullscreen() {
    this.isImmersive = false
    document.body.classList.remove('immersive-mode')
    document.getElementById('immersive-controls')?.classList.remove('visible')
    this._clearAutoHide()
    this._resizeCanvas()
  }

  _showControls() {
    const controls = document.getElementById('immersive-controls')
    if (controls && !controls.classList.contains('visible')) {
      controls.classList.add('visible')
    }
    this._clearAutoHide()
    this._startAutoHide()
  }

  _startAutoHide() {
    this._autoHideTimeout = setTimeout(() => {
      if (this.isImmersive) {
        document.getElementById('immersive-controls')?.classList.remove('visible')
      }
    }, this._autoHideDelay)
  }

  _clearAutoHide() {
    if (this._autoHideTimeout) {
      clearTimeout(this._autoHideTimeout)
      this._autoHideTimeout = null
    }
  }

  _showEscNotice() {
    const notice = document.getElementById('fullscreen-esc-notice')
    if (notice) {
      notice.classList.add('visible')
      setTimeout(() => notice.classList.remove('visible'), 3000)
    }
  }

  _resizeCanvas() {
    // Check if visual service exists and is initialized
    if (this.app.visualService && this.app.visualService.p5Instance) {
      requestAnimationFrame(() => {
        if (this.isImmersive) {
          this.app.visualService.resize(window.innerWidth, window.innerHeight)
        } else {
          const container = document.getElementById('p5-container')
          if (container) {
            const rect = container.getBoundingClientRect()
            this.app.visualService.resize(rect.width, rect.height)
          }
        }
      })
    }
  }

  _isMobile() {
    // Use PlatformDetection if available (Entry #46)
    if (window.PlatformDetection && typeof window.PlatformDetection.isMobile === 'function') {
      return window.PlatformDetection.isMobile()
    }

    // Fallback: hover capability check (most reliable for touch-only devices)
    const isTouchOnly = window.matchMedia('(hover: none)').matches

    // iOS devices don't support fullscreen API
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

    // Small screen in portrait orientation
    const isSmallScreen = window.innerWidth <= 768 &&
      window.matchMedia('(orientation: portrait)').matches

    return isTouchOnly || isIOS || isSmallScreen
  }

  cleanup() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler)
    }
    if (this._mouseMoveHandler) {
      document.removeEventListener('mousemove', this._mouseMoveHandler)
    }
    if (this._touchHandler) {
      document.removeEventListener('touchstart', this._touchHandler)
    }
    if (this._fullscreenChangeHandler) {
      document.removeEventListener('fullscreenchange', this._fullscreenChangeHandler)
      document.removeEventListener('webkitfullscreenchange', this._fullscreenChangeHandler)
      document.removeEventListener('mozfullscreenchange', this._fullscreenChangeHandler)
      document.removeEventListener('MSFullscreenChange', this._fullscreenChangeHandler)
    }
    if (this._cornerHoverHandler) {
      document.removeEventListener('mousemove', this._cornerHoverHandler)
    }
    this._clearAutoHide()
    document.body.classList.remove('immersive-mode')
  }
}
