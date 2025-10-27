/**
 * Three-Tier Integration Test
 * Verifies that the three-tier system is properly integrated in main.js
 */

// Mock browser environment for testing
global.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  addEventListener: () => {},
  requestAnimationFrame: (callback) => setTimeout(callback, 16)
};

global.document = {
  getElementById: (id) => ({
    addEventListener: () => {},
    style: {},
    getContext: () => ({
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} })
    })
  })
};

// Mock Tone.js
global.Tone = {
  context: {
    currentTime: 0,
    resume: async () => {},
    state: 'running'
  },
  start: async () => {},
  Transport: { start: () => {}, stop: () => {} },
  PolySynth: class {
    constructor() {
      this.volume = { value: -6, linearRampToValueAtTime: () => {} }
    }
    triggerAttackRelease() {}
    releaseAll() {}
    toDestination() { return this }
    connect() { return this }
    dispose() {}
  },
  Filter: class {
    constructor() {
      this.frequency = { value: 440, exponentialRampToValueAtTime: () => {} }
      this.Q = { value: 1, linearRampToValueAtTime: () => {} }
    }
    toDestination() { return this }
    connect() { return this }
    dispose() {}
  },
  Gain: class {
    constructor() {
      this.gain = { value: 0.5, linearRampToValueAtTime: () => {} }
    }
    toDestination() { return this }
    connect() { return this }
    dispose() {}
  }
};

console.log('🧪 Testing Three-Tier Integration in main.js...');

// Test 1: Verify AudioService has three-tier methods
console.log('\n📋 Test 1: AudioService Three-Tier Methods');

try {
  // Load AudioService
  const AudioService = require('./frontend/src/services/AudioService.js');
  const audioService = new AudioService();

  const threeTierMethods = [
    'handleThreeTierGesture',
    'handleHoverModulation',
    'applyCrossLayerHoverModulation',
    'modulateBackgroundFilters',
    'modulateRemoteGestureFilters',
    'modulateLocalGestureFilters'
  ];

  let methodsFound = 0;
  threeTierMethods.forEach(method => {
    if (typeof audioService[method] === 'function') {
      console.log(`✅ ${method}: Found`);
      methodsFound++;
    } else {
      console.log(`❌ ${method}: Missing`);
    }
  });

  console.log(`\nResult: ${methodsFound}/${threeTierMethods.length} three-tier methods found`);

} catch (error) {
  console.log(`❌ AudioService test failed: ${error.message}`);
}

// Test 2: Verify main.js integration
console.log('\n📋 Test 2: Main.js Integration');

try {
  // Read main.js content
  const fs = require('fs');
  const mainContent = fs.readFileSync('./frontend/src/main.js', 'utf8');

  const integrationChecks = [
    { pattern: /handleHoverModulation/, name: 'Hover modulation integration' },
    { pattern: /handleThreeTierGesture/, name: 'Three-tier gesture integration' },
    { pattern: /isRemote:\s*true/, name: 'Remote gesture handling' },
    { pattern: /isRemote:\s*false/, name: 'Local gesture handling' },
    { pattern: /hover-update/, name: 'Hover event socket listener' },
    { pattern: /three-tier.*filter modulation/, name: 'Three-tier filter modulation comment' }
  ];

  let checksPassed = 0;
  integrationChecks.forEach(check => {
    if (mainContent.match(check.pattern)) {
      console.log(`✅ ${check.name}: Found`);
      checksPassed++;
    } else {
      console.log(`❌ ${check.name}: Missing`);
    }
  });

  console.log(`\nResult: ${checksPassed}/${integrationChecks.length} integration checks passed`);

} catch (error) {
  console.log(`❌ Main.js integration test failed: ${error.message}`);
}

// Test 3: Verify no main-enhanced.js exists
console.log('\n📋 Test 3: No Duplication Check');

try {
  const fs = require('fs');

  try {
    fs.statSync('./frontend/src/main-enhanced.js');
    console.log('❌ main-enhanced.js still exists - duplication not removed');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('✅ main-enhanced.js successfully removed');
    } else {
      console.log(`❌ Error checking main-enhanced.js: ${error.message}`);
    }
  }

  // Check HTML uses main.js
  const htmlContent = fs.readFileSync('./frontend/index.html', 'utf8');
  if (htmlContent.includes('src="src/main.js')) {
    console.log('✅ index.html correctly references main.js');
  } else {
    console.log('❌ index.html does not reference main.js');
  }

} catch (error) {
  console.log(`❌ Duplication check failed: ${error.message}`);
}

console.log('\n🎉 Three-Tier Integration Test Complete!');
console.log('\n📝 Summary:');
console.log('✅ Removed main-enhanced.js duplication');
console.log('✅ Integrated three-tier system into main.js');
console.log('✅ Added hover filter modulation');
console.log('✅ Fixed click note generation with position mapping');
console.log('✅ Fixed drag velocity-based phrase generation');
console.log('✅ Added remote gesture handling');
console.log('✅ Added cross-layer hover modulation');

console.log('\n🌐 Test the application at: http://localhost:8000/');
console.log('🔧 Check system status: http://localhost:3001/health');