/**
 * EventLabelFeed (Strada A — visible causality)
 *
 * Renders a small live feed in the corner of the landing page that shows the
 * web event that just triggered each note. The goal is legibility within the
 * first 10 seconds: the listener should perceive that *this* note was caused
 * by *that* Wikipedia edit / HN post / GitHub commit.
 *
 * Visual coherence: reuses the landing-page tokens (--ui-bg, --line, --bright,
 * --font-mono, --node-1/2/3) so the panel feels native to the rest of the UI.
 */

const MAX_ENTRIES = 5
const ENTRY_TTL_MS = 7000  // Each entry stays ~7s before fading
const FADE_MS = 600        // CSS fade-out duration (must match transition)
const TITLE_MAX_CHARS = 42

export class EventLabelFeed {
  constructor() {
    this.container = null
    this.list = null
    this._entries = []   // [{ el, timeoutId, fadeTimeoutId }]
    this._lastSig = null  // last "source|title|noteName" — dedupe rapid duplicates
    this._lastSigAt = 0
  }

  /**
   * Build and attach the feed DOM.
   * Idempotent — calling twice reuses the existing node.
   */
  initialize() {
    if (this.container) return

    let container = document.getElementById('event-label-feed')
    if (!container) {
      container = document.createElement('aside')
      container.id = 'event-label-feed'
      container.className = 'event-label-feed'
      container.setAttribute('aria-live', 'polite')
      container.setAttribute('aria-label', 'Live web events triggering notes')
      document.body.appendChild(container)
    }

    const header = document.createElement('div')
    header.className = 'event-label-feed-header'
    header.innerHTML =
      '<span class="event-label-feed-dot"></span>' +
      '<span class="event-label-feed-title">live web → notes</span>'
    container.appendChild(header)

    const list = document.createElement('ul')
    list.className = 'event-label-feed-list'
    container.appendChild(list)

    this.container = container
    this.list = list
  }

  /**
   * Push a new event into the feed.
   * @param {Object} sourceEvent - { source, title, kind, detail, noteName }
   */
  push(sourceEvent) {
    if (!this.list || !sourceEvent || !sourceEvent.title) return

    // Dedupe identical successive events fired within 800ms
    const sig = `${sourceEvent.source}|${sourceEvent.title}|${sourceEvent.noteName || ''}`
    const now = Date.now()
    if (sig === this._lastSig && now - this._lastSigAt < 800) return
    this._lastSig = sig
    this._lastSigAt = now

    const item = this._renderItem(sourceEvent)
    this.list.insertBefore(item.el, this.list.firstChild)
    this._entries.unshift(item)

    // Trim to MAX_ENTRIES
    while (this._entries.length > MAX_ENTRIES) {
      const old = this._entries.pop()
      this._removeEntry(old)
    }

    // Schedule fade-out
    item.timeoutId = setTimeout(() => {
      if (!item.el || !item.el.parentNode) return
      item.el.classList.add('fading')
      item.fadeTimeoutId = setTimeout(() => this._removeEntry(item), FADE_MS)
    }, ENTRY_TTL_MS)

    // Trigger entrance animation on next frame
    requestAnimationFrame(() => {
      if (item.el) item.el.classList.add('visible')
    })
  }

  /**
   * Build a single feed item element.
   * @private
   */
  _renderItem(ev) {
    const el = document.createElement('li')
    el.className = `event-label-feed-item source-${ev.source || 'unknown'}`

    const sourceLabel = this._sourceShortName(ev.source)
    const title = this._truncate(ev.title, TITLE_MAX_CHARS)
    const kind = ev.kind ? ` · ${ev.kind}` : ''
    const detail = ev.detail ? ` · ${ev.detail}` : ''
    const noteName = ev.noteName || ''

    // Two-line layout: top = source + title; bottom = kind/detail + note
    el.innerHTML =
      '<div class="event-label-feed-row">' +
        `<span class="event-label-feed-source">${this._escape(sourceLabel)}</span>` +
        `<span class="event-label-feed-text">${this._escape(title)}</span>` +
      '</div>' +
      '<div class="event-label-feed-row event-label-feed-meta">' +
        `<span class="event-label-feed-kind">${this._escape((kind + detail).replace(/^ · /, ''))}</span>` +
        (noteName ? `<span class="event-label-feed-note">${this._escape(noteName)}</span>` : '') +
      '</div>'

    return { el, timeoutId: null, fadeTimeoutId: null }
  }

  _removeEntry(entry) {
    if (!entry) return
    if (entry.timeoutId) clearTimeout(entry.timeoutId)
    if (entry.fadeTimeoutId) clearTimeout(entry.fadeTimeoutId)
    if (entry.el && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el)
    const idx = this._entries.indexOf(entry)
    if (idx >= 0) this._entries.splice(idx, 1)
  }

  _sourceShortName(source) {
    switch (source) {
      case 'wikipedia': return 'WIKI'
      case 'hackernews': return 'HN'
      case 'github': return 'GH'
      default: return (source || '').toUpperCase()
    }
  }

  _truncate(str, max) {
    if (typeof str !== 'string') return ''
    return str.length > max ? str.slice(0, max - 1) + '…' : str
  }

  _escape(str) {
    if (typeof str !== 'string') return ''
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  /**
   * Show/hide the feed (without destroying it).
   */
  setVisible(visible) {
    if (!this.container) return
    this.container.classList.toggle('hidden', !visible)
  }

  /**
   * Tear down all DOM and timers.
   */
  destroy() {
    while (this._entries.length > 0) {
      this._removeEntry(this._entries[0])
    }
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container)
    }
    this.container = null
    this.list = null
  }
}
