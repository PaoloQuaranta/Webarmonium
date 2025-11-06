/**
 * Jest Configuration for Webarmonium Frontend
 * Sprint 3: Unit testing for extracted components
 */

module.exports = {
  // Use jsdom environment for DOM testing
  testEnvironment: 'jsdom',

  // Test file patterns
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/unit/**/*.spec.js'
  ],

  // Coverage configuration
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/services/**/*.js',
    '!src/services/**/*.test.js',
    '!src/services/**/*.spec.js'
  ],

  // Coverage thresholds (Sprint 3 target: 60%)
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    },
    // Sprint 2 extracted components - higher thresholds
    './src/services/VolumeController.js': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './src/services/CanvasManager.js': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './src/services/UIManager.js': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/setup.js'],

  // Module paths
  roots: ['<rootDir>/src', '<rootDir>/tests'],

  // Transform files (if needed for ES6 modules)
  transform: {},

  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/integration/'
  ],

  // Verbose output
  verbose: true,

  // Coverage reporters
  coverageReporters: ['text', 'text-summary', 'html', 'lcov'],

  // Test timeout (for async tests)
  testTimeout: 10000
}
