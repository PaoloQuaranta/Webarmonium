module.exports = {
  env: {
    browser: false,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'standard'
  ],
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

    // Performance and readability
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',

    // Socket.io specific patterns
    'no-unused-expressions': ['error', { 'allowShortCircuit': true }],

    // Testing patterns
    'jest/no-disabled-tests': 'off',
    'jest/no-focused-tests': 'error'
  },
  overrides: [
    {
      files: ['tests/**/*.js'],
      env: {
        jest: true
      }
    }
  ]
}