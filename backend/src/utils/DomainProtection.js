/**
 * Domain Protection Utilities
 * Prevents unauthorized mirroring and embedding of the application
 *
 * Entry #115: Anti-mirroring protection system
 */

const { createLogger } = require('./Logger')
const protectionLogger = createLogger('domain-protection')

/**
 * Blocked domains that are known to mirror the site without authorization
 * Add new domains here as they are discovered
 */
const BLOCKED_DOMAINS = [
  'treasurecompass.org',
  'www.treasurecompass.org',
  'starlighthorizon.org',
  'www.starlighthorizon.org'
]

/**
 * Get allowed domains from environment or use defaults
 * In production, set ALLOWED_DOMAINS environment variable
 * Example: ALLOWED_DOMAINS=webarmonium.com,www.webarmonium.com,localhost
 */
function getAllowedDomains () {
  const envDomains = process.env.ALLOWED_DOMAINS
  if (envDomains) {
    return envDomains.split(',').map(d => d.trim().toLowerCase())
  }

  // Production-only allowed domains
  return [
    'webarmonium.net',
    'www.webarmonium.net'
  ]
}

/**
 * Get blocked domains (static list + environment variable additions)
 */
function getBlockedDomains () {
  const envBlocked = process.env.BLOCKED_DOMAINS
  const additionalBlocked = envBlocked
    ? envBlocked.split(',').map(d => d.trim().toLowerCase())
    : []

  return [...BLOCKED_DOMAINS, ...additionalBlocked]
}

/**
 * Extract domain from origin or referer URL
 * @param {string} url - Origin or Referer header value
 * @returns {string|null} - Extracted domain or null
 */
function extractDomain (url) {
  if (!url) return null

  try {
    // Handle protocol-relative URLs
    if (url.startsWith('//')) {
      url = 'https:' + url
    }

    // Add protocol if missing
    if (!url.includes('://')) {
      url = 'https://' + url
    }

    const parsed = new URL(url)
    return parsed.hostname.toLowerCase()
  } catch (e) {
    // Try simple extraction for malformed URLs
    const match = url.match(/(?:https?:\/\/)?([^:/\s]+)/i)
    return match ? match[1].toLowerCase() : null
  }
}

/**
 * Check if a domain is in the blocked list
 * @param {string} domain - Domain to check
 * @returns {boolean} - True if blocked
 */
function isDomainBlocked (domain) {
  if (!domain) return false

  const blocked = getBlockedDomains()
  const normalizedDomain = domain.toLowerCase()

  return blocked.some(blockedDomain => {
    // Exact match
    if (normalizedDomain === blockedDomain) return true
    // Subdomain match (e.g., api.treasurecompass.org)
    if (normalizedDomain.endsWith('.' + blockedDomain)) return true
    return false
  })
}

/**
 * Check if a domain is in the allowed list
 * @param {string} domain - Domain to check
 * @returns {boolean} - True if allowed
 */
function isDomainAllowed (domain) {
  if (!domain) return false

  const allowed = getAllowedDomains()
  const normalizedDomain = domain.toLowerCase()

  return allowed.some(allowedDomain => {
    // Exact match
    if (normalizedDomain === allowedDomain) return true
    // Subdomain match
    if (normalizedDomain.endsWith('.' + allowedDomain)) return true
    // Port variations for localhost
    if (allowedDomain === 'localhost' && normalizedDomain.startsWith('localhost')) return true
    return false
  })
}

/**
 * Validate origin/referer against protection rules
 * @param {string} origin - Origin header
 * @param {string} referer - Referer header
 * @returns {{allowed: boolean, reason?: string, domain?: string}}
 */
function validateOrigin (origin, referer) {
  const originDomain = extractDomain(origin)
  const refererDomain = extractDomain(referer)

  // Check origin first, then referer
  const domain = originDomain || refererDomain

  // No origin/referer - could be direct access, allow with caution
  if (!domain) {
    return { allowed: true, reason: 'no_origin' }
  }

  // Check blocked list first (highest priority)
  if (isDomainBlocked(domain)) {
    return {
      allowed: false,
      reason: 'blocked_domain',
      domain
    }
  }

  // In strict mode (production), require domain to be in allowed list
  const strictMode = process.env.DOMAIN_STRICT_MODE === 'true' ||
                     process.env.NODE_ENV === 'production'

  if (strictMode && !isDomainAllowed(domain)) {
    return {
      allowed: false,
      reason: 'domain_not_allowed',
      domain
    }
  }

  return { allowed: true, domain }
}

/**
 * Express middleware for domain protection
 * Blocks requests from unauthorized domains
 */
function domainProtectionMiddleware (req, res, next) {
  const origin = req.headers.origin
  const referer = req.headers.referer
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   req.socket?.remoteAddress ||
                   'unknown'

  const validation = validateOrigin(origin, referer)

  if (!validation.allowed) {
    protectionLogger.warn('Blocked request from unauthorized domain', {
      ip: clientIP,
      domain: validation.domain,
      reason: validation.reason,
      path: req.path,
      method: req.method,
      origin,
      referer
    })

    return res.status(403).json({
      success: false,
      error: 'access_denied',
      message: 'Access from this domain is not authorized'
    })
  }

  next()
}

/**
 * Socket.io middleware for domain protection
 * Validates WebSocket handshake origin
 */
function socketDomainProtection (socket, next) {
  const origin = socket.handshake.headers.origin
  const referer = socket.handshake.headers.referer
  const clientIP = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                   socket.handshake.address ||
                   'unknown'

  const validation = validateOrigin(origin, referer)

  if (!validation.allowed) {
    protectionLogger.warn('Blocked WebSocket connection from unauthorized domain', {
      ip: clientIP,
      domain: validation.domain,
      reason: validation.reason,
      socketId: socket.id,
      origin,
      referer
    })

    return next(new Error('Connection from this domain is not authorized'))
  }

  // Store validated domain on socket for later reference
  socket.validatedDomain = validation.domain
  next()
}

/**
 * Generate Content-Security-Policy header value with anti-embedding directives
 * @returns {string} - CSP header value
 */
function generateCSP () {
  const allowed = getAllowedDomains()

  // Build frame-ancestors directive
  const frameAncestors = ["'self'", ...allowed.map(d => `https://${d}`)].join(' ')

  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self' wss: ws: https:",
    "font-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    `frame-ancestors ${frameAncestors}`
  ]

  return directives.join('; ')
}

/**
 * Generate security headers for anti-mirroring protection
 * @returns {Object} - Headers object
 */
function getSecurityHeaders () {
  return {
    'Content-Security-Policy': generateCSP(),
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(self), camera=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin'
  }
}

/**
 * Express middleware to add all security headers
 */
function securityHeadersMiddleware (req, res, next) {
  const headers = getSecurityHeaders()

  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  next()
}

module.exports = {
  // Configuration
  BLOCKED_DOMAINS,
  getAllowedDomains,
  getBlockedDomains,

  // Utilities
  extractDomain,
  isDomainBlocked,
  isDomainAllowed,
  validateOrigin,

  // Middleware
  domainProtectionMiddleware,
  socketDomainProtection,
  securityHeadersMiddleware,

  // Headers
  generateCSP,
  getSecurityHeaders
}
