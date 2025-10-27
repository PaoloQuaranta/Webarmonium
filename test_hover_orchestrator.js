/**
 * Test per il nuovo sistema HoverOrchestrator
 * Verifica il funzionamento dell'analisi aggregata e modulazione unificata
 */

const io = require('socket.io-client')
const HoverOrchestrator = require('./backend/src/services/HoverOrchestrator')

// Configuration
const SERVER_URL = 'http://localhost:3001'
const TEST_ROOM = 'test-hover-orchestrator'
const TEST_USERS = [
  { id: 'user-1', color: '#FF6B6B' },
  { id: 'user-2', color: '#4ECDC4' },
  { id: 'user-3', color: '#45B7D1' }
]

class HoverOrchestratorTest {
  constructor() {
    this.clients = []
    this.testResults = {
      connectedClients: 0,
      hoverEventsSent: 0,
      unifiedModulationsReceived: 0,
      orchestratorState: null,
      latencyStats: [],
      errors: []
    }
  }

  async runTest() {
    console.log('🧪 Starting HoverOrchestrator Test Suite')
    console.log('=' .repeat(50))

    try {
      // Phase 1: Connect multiple clients
      await this.connectClients()

      // Phase 2: Join test room
      await this.joinRoom()

      // Phase 3: Send coordinated hover patterns
      await this.sendHoverPatterns()

      // Phase 4: Analyze results
      await this.analyzeResults()

      // Phase 5: Cleanup
      await this.cleanup()

      console.log('✅ HoverOrchestrator test completed successfully')

    } catch (error) {
      console.error('❌ Test failed:', error)
      this.testResults.errors.push(error.message)
    }

    this.printSummary()
  }

  async connectClients() {
    console.log('📡 Phase 1: Connecting test clients...')

    for (const user of TEST_USERS) {
      const client = io(SERVER_URL, {
        transports: ['websocket'],
        forceNew: true
      })

      // Setup event listeners
      this.setupClientListeners(client, user)

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Connection timeout for ${user.id}`))
        }, 5000)

        client.on('connect', () => {
          clearTimeout(timeout)
          console.log(`✅ ${user.id} connected`)
          resolve()
        })

        client.on('connect_error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

      this.clients.push({ socket: client, user })
      this.testResults.connectedClients++
    }

    console.log(`📊 Connected ${this.testResults.connectedClients} clients`)
  }

  setupClientListeners(client, user) {
    // Track room events
    client.on('room-joined', (data) => {
      console.log(`🏠 ${user.id} joined room ${data.roomId}`)
    })

    // Track unified modulations
    client.on('unified-modulation', (data) => {
      const receivedAt = Date.now()
      const latency = receivedAt - data.timestamp

      console.log(`🎛️ ${user.id} received unified modulation (gen ${data.modulation.generation}):`, {
        roomId: data.roomId,
        lfoFreq: data.modulation.lfoFrequency.toFixed(2),
        lfoAmp: data.modulation.lfoAmplitude.toFixed(2),
        filterCutoff: data.modulation.filterCutoff.toFixed(0),
        users: data.analysis.uniqueUsers,
        density: data.analysis.density.toFixed(1),
        latency: `${latency}ms`
      })

      this.testResults.unifiedModulationsReceived++
      this.testResults.latencyStats.push(latency)

      // Store orchestrator state from first client
      if (user.id === 'user-1') {
        this.testResults.orchestratorState = data.analysis
      }
    })

    // Debug: raw hover events
    client.on('hover-update-raw', (data) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🐛 ${user.id} received raw hover:`, data)
      }
    })

    // Track errors
    client.on('error', (error) => {
      console.error(`❌ ${user.id} error:`, error)
      this.testResults.errors.push(`${user.id}: ${error.message}`)
    })
  }

  async joinRoom() {
    console.log(`🏠 Phase 2: Joining room ${TEST_ROOM}...`)

    const joinPromises = this.clients.map(({ socket, user }) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Room join timeout for ${user.id}`))
        }, 5000)

        socket.emit('join-room', {
          roomId: TEST_ROOM,
          userData: {
            device: 'desktop',
            platform: 'test',
            capabilities: { mouse: true, touch: false, gyroscope: false }
          }
        }, (response) => {
          clearTimeout(timeout)
          if (response.success) {
            resolve(response)
          } else {
            reject(new Error(`Room join failed for ${user.id}: ${response.error?.message}`))
          }
        })
      })
    })

    await Promise.all(joinPromises)
    console.log(`✅ All clients joined room ${TEST_ROOM}`)
  }

  async sendHoverPatterns() {
    console.log('🎯 Phase 3: Sending coordinated hover patterns...')

    // Pattern 1: Cluster hovers (simulating users hovering in same area)
    console.log('📍 Pattern 1: Cluster hovers in upper-left quadrant')
    await this.sendClusterPattern(0.2, 0.2, 3000) // x=0.2, y=0.2 for 3 seconds

    await this.delay(1000)

    // Pattern 2: Distributed hovers (simulating users in different areas)
    console.log('📍 Pattern 2: Distributed hovers across canvas')
    await this.sendDistributedPattern(4000) // 4 seconds

    await this.delay(1000)

    // Pattern 3: Flow pattern (simulating movement across canvas)
    console.log('📍 Pattern 3: Flow pattern across canvas')
    await this.sendFlowPattern(5000) // 5 seconds

    await this.delay(2000) // Wait for final processing

    console.log(`📊 Total hover events sent: ${this.testResults.hoverEventsSent}`)
  }

  async sendClusterPattern(centerX, centerY, duration) {
    const startTime = Date.now()
    const endTime = startTime + duration
    const interval = 100 // Send hover every 100ms

    while (Date.now() < endTime) {
      const promises = this.clients.map(({ socket, user }, index) => {
        // Add small random offset around center for each user
        const offsetX = (Math.random() - 0.5) * 0.1 // ±0.05 range
        const offsetY = (Math.random() - 0.5) * 0.1
        const intensity = 0.5 + (Math.random() - 0.5) * 0.3 // 0.35-0.65 range

        const hoverData = {
          position: {
            x: Math.max(0, Math.min(1, centerX + offsetX)),
            y: Math.max(0, Math.min(1, centerY + offsetY))
          },
          velocity: 30 + Math.random() * 20,
          intensity: Math.max(0, Math.min(1, intensity)),
          userId: user.id,
          timestamp: Date.now()
        }

        return new Promise(resolve => {
          socket.emit('hover-update', hoverData)
          this.testResults.hoverEventsSent++
          resolve()
        })
      })

      await Promise.all(promises)
      await this.delay(interval)
    }
  }

  async sendDistributedPattern(duration) {
    const startTime = Date.now()
    const endTime = startTime + duration
    const interval = 150 // Slower updates for distributed pattern

    // Assign each user to a different quadrant
    const positions = [
      { x: 0.2, y: 0.2 }, // upper-left
      { x: 0.8, y: 0.2 }, // upper-right
      { x: 0.5, y: 0.7 }  // bottom-center
    ]

    while (Date.now() < endTime) {
      const promises = this.clients.map(({ socket, user }, index) => {
        const basePos = positions[index]
        const offsetX = (Math.random() - 0.5) * 0.15
        const offsetY = (Math.random() - 0.5) * 0.15
        const intensity = 0.3 + Math.random() * 0.4

        const hoverData = {
          position: {
            x: Math.max(0, Math.min(1, basePos.x + offsetX)),
            y: Math.max(0, Math.min(1, basePos.y + offsetY))
          },
          velocity: 20 + Math.random() * 30,
          intensity: Math.max(0, Math.min(1, intensity)),
          userId: user.id,
          timestamp: Date.now()
        }

        return new Promise(resolve => {
          socket.emit('hover-update', hoverData)
          this.testResults.hoverEventsSent++
          resolve()
        })
      })

      await Promise.all(promises)
      await this.delay(interval)
    }
  }

  async sendFlowPattern(duration) {
    const startTime = Date.now()
    const endTime = startTime + duration
    const interval = 80 // Faster updates for flow pattern

    while (Date.now() < endTime) {
      const progress = (Date.now() - startTime) / duration

      const promises = this.clients.map(({ socket, user }, index) => {
        // Create flowing movement pattern
        const phaseOffset = (index / this.clients.length) * Math.PI * 2
        const x = 0.5 + Math.sin(progress * Math.PI * 2 + phaseOffset) * 0.3
        const y = 0.5 + Math.cos(progress * Math.PI * 2 + phaseOffset) * 0.3
        const intensity = 0.4 + Math.sin(progress * Math.PI * 4 + phaseOffset) * 0.3

        const hoverData = {
          position: {
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y))
          },
          velocity: 40 + Math.sin(progress * Math.PI * 2) * 20,
          intensity: Math.max(0, Math.min(1, intensity)),
          userId: user.id,
          timestamp: Date.now()
        }

        return new Promise(resolve => {
          socket.emit('hover-update', hoverData)
          this.testResults.hoverEventsSent++
          resolve()
        })
      })

      await Promise.all(promises)
      await this.delay(interval)
    }
  }

  async analyzeResults() {
    console.log('📊 Phase 4: Analyzing test results...')

    if (this.testResults.latencyStats.length > 0) {
      const avgLatency = this.testResults.latencyStats.reduce((a, b) => a + b, 0) / this.testResults.latencyStats.length
      const maxLatency = Math.max(...this.testResults.latencyStats)
      const minLatency = Math.min(...this.testResults.latencyStats)

      console.log('📈 Unified Modulation Latency Stats:')
      console.log(`  Average: ${avgLatency.toFixed(2)}ms`)
      console.log(`  Min: ${minLatency.toFixed(2)}ms`)
      console.log(`  Max: ${maxLatency.toFixed(2)}ms`)

      // Check constitutional requirement (<100ms)
      if (avgLatency > 100) {
        console.warn(`⚠️ Average latency ${avgLatency.toFixed(2)}ms exceeds 100ms constitutional requirement`)
      } else {
        console.log(`✅ Latency within constitutional requirements`)
      }
    }

    if (this.testResults.orchestratorState) {
      console.log('🎛️ Final Orchestrator State:')
      console.log(`  Hover count: ${this.testResults.orchestratorState.hoverCount}`)
      console.log(`  Unique users: ${this.testResults.orchestratorState.uniqueUsers}`)
      console.log(`  Density: ${this.testResults.orchestratorState.density.toFixed(1)} hover/sec`)
      console.log(`  Spatial variance: ${this.testResults.orchestratorState.spatialVariance.toFixed(3)}`)

      const patterns = this.testResults.orchestratorState.patterns
      console.log('🔍 Pattern Analysis:')
      console.log(`  Cluster centers: ${patterns.clusterCenters.length}`)
      console.log(`  Flow direction: (${patterns.flowDirection.x.toFixed(2)}, ${patterns.flowDirection.y.toFixed(2)})`)
      console.log(`  Rhythm period: ${patterns.rhythmAnalysis.period.toFixed(0)}ms`)
      console.log(`  Rhythm regularity: ${patterns.rhythmAnalysis.regularity.toFixed(2)}`)
      console.log(`  Hotspot zones: ${patterns.hotspotZones.length}`)
    }
  }

  async cleanup() {
    console.log('🧹 Phase 5: Cleaning up test resources...')

    // Leave room and disconnect all clients
    const leavePromises = this.clients.map(({ socket, user }) => {
      return new Promise(resolve => {
        socket.emit('leave-room', {}, () => {
          socket.disconnect()
          console.log(`🔌 ${user.id} disconnected`)
          resolve()
        })
      })
    })

    await Promise.all(leavePromises)
    this.clients = []
  }

  printSummary() {
    console.log('\n' + '='.repeat(50))
    console.log('📋 TEST SUMMARY')
    console.log('='.repeat(50))
    console.log(`✅ Connected clients: ${this.testResults.connectedClients}/${TEST_USERS.length}`)
    console.log(`📤 Hover events sent: ${this.testResults.hoverEventsSent}`)
    console.log(`📥 Unified modulations received: ${this.testResults.unifiedModulationsReceived}`)
    console.log(`⚡ Average latency: ${this.testResults.latencyStats.length > 0 ?
      (this.testResults.latencyStats.reduce((a, b) => a + b, 0) / this.testResults.latencyStats.length).toFixed(2) : 'N/A'}ms`)
    console.log(`❌ Errors: ${this.testResults.errors.length}`)

    if (this.testResults.errors.length > 0) {
      console.log('\n❌ Errors encountered:')
      this.testResults.errors.forEach(error => console.log(`  - ${error}`))
    }

    if (this.testResults.unifiedModulationsReceived > 0) {
      console.log('\n✅ HoverOrchestrator test: PASSED')
      console.log('   - Multi-user hover aggregation working')
      console.log('   - Unified modulation generation working')
      console.log('   - Real-time broadcasting functional')
    } else {
      console.log('\n❌ HoverOrchestrator test: FAILED')
      console.log('   - No unified modulations received')
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Run the test
if (require.main === module) {
  const test = new HoverOrchestratorTest()
  test.runTest().catch(console.error)
}

module.exports = HoverOrchestratorTest