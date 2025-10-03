module.exports = {
  env: {
    browser: true,
    es2021: true,
    jest: true
  },
  extends: [
    'standard'
  ],
  globals: {
    // Canvas API
    'CanvasRenderingContext2D': 'readonly',
    'HTMLCanvasElement': 'readonly',

    // Web Audio API
    'AudioContext': 'readonly',
    'webkitAudioContext': 'readonly',
    'MediaDeviceInfo': 'readonly',

    // Device APIs
    'DeviceOrientationEvent': 'readonly',
    'DeviceMotionEvent': 'readonly',

    // Tone.js (loaded via script)
    'Tone': 'readonly',

    // Socket.io client (loaded via script)
    'io': 'readonly'
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    // Constitutional requirement: Clean code quality
    'no-unused-vars': 'error',
    'no-duplicate-imports': 'error',
    'no-unreachable': 'error',
    'no-console': 'warn',

    // Performance for 60fps Canvas rendering
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',

    // Browser compatibility
    'no-undef': 'error',

    // Real-time performance patterns
    'no-unused-expressions': ['error', { 'allowShortCircuit': true }]
  },
  overrides: [
    {
      files: ['tests/**/*.js'],
      env: {
        jest: true,
        puppeteer: true
      },
      globals: {
        'page': 'readonly',
        'browser': 'readonly'
      }
    }
  ]
}