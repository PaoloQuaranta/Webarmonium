class MaterialLibrary {
  constructor() {
    // Deterministic ID counter
    this.materialCounter = 0

    // Organize materials by harmonic function
    this.materials = {
      tonic: [],      // Stable, resolving material
      dominant: [],   // Tension-building material
      subdominant: [], // Preparatory material
      chromatic: []   // Coloristic, experimental material
    }

    // Organize by character type
    this.byCharacter = {
      melodic: [],    // Melodic lines and motifs
      harmonic: [],   // Chord progressions and harmony
      rhythmic: [],   // Rhythmic patterns and grooves
      textural: []    // Atmospheric and textural elements
    }

    // Musical context tracking
    this.keyCenter = null        // Current tonal center (e.g., 'C', 'Am')
    this.mode = 'ionian'         // Current mode
    this.modulations = []       // History of key changes
    this.tempo = 120            // Current tempo

    // Material lifecycle management
    this.lifetimes = new Map()  // Material age and usage tracking
    this.maxAge = 120000        // 2 minutes in milliseconds
    this.usageThreshold = 5     // Max uses before material is considered "tired"
  }

  addMaterial(material) {
    try {
      // Analyze harmonic function
      const harmonicFunction = this.analyzeHarmonicFunction(material)
      // Categorize by character
      const character = this.analyzeCharacter(material)

      // Create material entry with metadata
      // DERIVATION: use counter-based ID instead of random
      this.materialCounter++
      const materialEntry = {
        id: material.id || `material_${this.materialCounter}_${Date.now()}`,
        content: material,
        metadata: {
          harmonicFunction,
          character,
          keyCenter: this.keyCenter,
          mode: this.mode,
          tempo: this.tempo,
          createdAt: Date.now(),
          userId: material.userId || null,
          gestureData: material.gestureData || null,
          complexity: this.calculateComplexity(material),
          emotionalValence: this.analyzeEmotionalValence(material)
        }
      }

      // Store material
      this.materials[harmonicFunction].push(materialEntry)
      this.byCharacter[character].push(materialEntry)

      // Initialize lifecycle tracking
      this.lifetimes.set(materialEntry.id, {
        age: 0,
        usageCount: 0,
        lastUsed: Date.now(),
        isVital: true
      })

      // console.log(`📚 MaterialLibrary: Added ${character} material with ${harmonicFunction} function`)
      return materialEntry.id

    } catch (error) {
      // console.error('Error adding material to library:', error)
      return null
    }
  }

  analyzeHarmonicFunction(material) {
    // Analyze material to determine harmonic function
    // Entry #161: Rebalanced thresholds for better distribution
    // Old: tonic >0.7, subdominant >0.4, dominant >0.2, chromatic else
    // New: tonic >0.8, subdominant 0.5-0.8, dominant 0.2-0.5, chromatic <0.2
    if (material.notes && material.notes.length > 0) {
      const pitches = material.notes.map(note => note.pitch % 12) // Mod 12 for pitch class
      const stability = this.calculateStability(pitches)

      if (stability > 0.8) return 'tonic'
      if (stability > 0.5) return 'subdominant'
      if (stability > 0.2) return 'dominant'
      return 'chromatic'
    }

    // For non-pitch material, analyze other characteristics
    // Entry #161: Rebalanced energy thresholds
    if (material.gestureData) {
      const energy = material.gestureData.velocity || 50
      if (energy < 20) return 'tonic'
      if (energy < 50) return 'subdominant'
      if (energy < 75) return 'dominant'
      return 'chromatic'
    }

    return 'subdominant' // Default changed from tonic
  }

  analyzeCharacter(material) {
    // Determine the character type of material
    if (material.notes && material.notes.length > 1) {
      // Analyze pitch movement to determine if melodic
      const pitchVariety = new Set(material.notes.map(n => n.pitch % 12)).size
      if (pitchVariety > 2) return 'melodic'
    }

    if (material.chords || material.harmony) {
      return 'harmonic'
    }

    if (material.rhythm || (material.notes && material.notes.some(n => n.duration))) {
      return 'rhythmic'
    }

    // Check for textural/atmospheric qualities
    if (material.type === 'pad' || material.type === 'drone' || material.type === 'texture') {
      return 'textural'
    }

    // Default classification based on gesture characteristics
    if (material.gestureData) {
      const velocity = material.gestureData.velocity || 50
      const curvature = material.gestureData.curvature || 0.5

      if (velocity < 40 && curvature > 0.6) return 'textural'
      if (velocity > 70) return 'rhythmic'
      return 'melodic'
    }

    return 'melodic' // Default
  }

  getPitchClass(key) {
    // Convert key name to pitch class number
    const noteMap = {
      'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
      'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
    }

    return noteMap[key] || 0 // Default to C
  }

  calculateStability(pitches) {
    // Calculate tonal stability based on pitch class distribution
    const tonic = this.keyCenter ? this.getPitchClass(this.keyCenter) : 0
    const dominant = (tonic + 7) % 12
    const subdominant = (tonic + 5) % 12

    let stabilityScore = 0
    pitches.forEach(pitch => {
      if (pitch === tonic) stabilityScore += 1.0
      else if (pitch === dominant) stabilityScore += 0.6
      else if (pitch === subdominant) stabilityScore += 0.4
      else if ([2, 4, 9, 11].includes(pitch)) stabilityScore += 0.2 // Diatonic non-tonal
      else stabilityScore -= 0.1 // Chromatic
    })

    return Math.max(0, Math.min(1, stabilityScore / pitches.length))
  }

  calculateComplexity(material) {
    // Calculate material complexity based on various factors
    let complexity = 0.1 // Base complexity

    if (material.notes) {
      // Pitch complexity
      const uniquePitches = new Set(material.notes.map(n => n.pitch % 12)).size
      complexity += uniquePitches * 0.05

      // Rhythmic complexity
      const uniqueDurations = new Set(material.notes.map(n => Math.round(n.duration * 4) / 4)).size
      complexity += uniqueDurations * 0.03

      // Interval complexity
      for (let i = 1; i < material.notes.length; i++) {
        const interval = Math.abs(material.notes[i].pitch - material.notes[i-1].pitch)
        if (interval > 12) complexity += 0.02 // Large intervals
        if ([1, 2, 6].includes(interval % 12)) complexity += 0.01 // Dissonant intervals
      }
    }

    // Gesture-based complexity
    if (material.gestureData) {
      const curvature = material.gestureData.curvature || 0.5
      const acceleration = Math.abs(material.gestureData.acceleration || 0)

      complexity += curvature * 0.1
      complexity += (acceleration / 100) * 0.05
    }

    return Math.min(1, complexity) // Normalize to 0-1
  }

  analyzeEmotionalValence(material) {
    // Analyze emotional characteristics
    let valence = 0.5 // Neutral

    if (material.gestureData) {
      const velocity = material.gestureData.velocity || 50
      const curvature = material.gestureData.curvature || 0.5

      // High velocity + low curvature = energetic/positive
      if (velocity > 70 && curvature < 0.4) valence += 0.3
      // Low velocity + high curvature = calm/contemplative
      else if (velocity < 40 && curvature > 0.6) valence -= 0.2
    }

    if (material.notes) {
      // Major intervals tend toward positive, minor toward negative
      const intervals = []
      for (let i = 1; i < material.notes.length; i++) {
        intervals.push((material.notes[i].pitch - material.notes[i-1].pitch) % 12)
      }

      const majorIntervals = intervals.filter(i => [4, 7].includes(i)).length
      const minorIntervals = intervals.filter(i => [3, 10].includes(i)).length

      valence += (majorIntervals - minorIntervals) * 0.05
    }

    return Math.max(0, Math.min(1, valence))
  }

  getCompatibleMaterial(currentKey, targetMood, count = 3) {
    // Get material that's harmonically compatible with current context
    const compatible = []
    const allMaterials = [...this.materials.tonic, ...this.materials.subdominant,
                          ...this.materials.dominant, ...this.materials.chromatic]

    // Filter by viability and key compatibility
    allMaterials.forEach(material => {
      const lifetime = this.lifetimes.get(material.id)
      if (!lifetime || !lifetime.isVital) return

      // Check key compatibility (same key or closely related)
      const isKeyCompatible = this.isKeyCompatible(material.metadata.keyCenter, currentKey)

      // Check mood compatibility
      const moodCompatibility = this.calculateMoodCompatibility(material, targetMood)

      // Calculate overall compatibility score
      const compatibilityScore = (isKeyCompatible ? 0.6 : 0.3) + moodCompatibility * 0.4

      if (compatibilityScore > 0.5) {
        compatible.push({
          ...material,
          compatibilityScore,
          agePenalty: lifetime.age / this.maxAge
        })
      }
    })

    // Sort by compatibility and age
    compatible.sort((a, b) => {
      const scoreA = a.compatibilityScore - a.agePenalty
      const scoreB = b.compatibilityScore - b.agePenalty
      return scoreB - scoreA
    })

    return compatible.slice(0, count)
  }

  isKeyCompatible(materialKey, currentKey) {
    if (!materialKey || !currentKey) return true
    if (materialKey === currentKey) return true

    // Check for closely related keys (relative major/minor)
    const circleOfFifths = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'Ab', 'Eb', 'Bb', 'F']
    const materialIndex = circleOfFifths.indexOf(materialKey.replace('m', ''))
    const currentIndex = circleOfFifths.indexOf(currentKey.replace('m', ''))

    if (materialIndex === -1 || currentIndex === -1) return false

    const distance = Math.abs(materialIndex - currentIndex)
    const minDistance = Math.min(distance, 12 - distance)

    // Keys within 2 steps on circle of fifths are compatible
    return minDistance <= 2
  }

  calculateMoodCompatibility(material, targetMood) {
    // Calculate how well material matches target mood
    const materialValence = material.metadata.emotionalValence || 0.5
    const targetValence = this.moodToValence(targetMood)

    return 1 - Math.abs(materialValence - targetValence)
  }

  moodToValence(mood) {
    const moodMap = {
      'happy': 0.8, 'bright': 0.7, 'energetic': 0.6,
      'neutral': 0.5, 'contemplative': 0.4,
      'sad': 0.2, 'dark': 0.3, 'tense': 0.1
    }
    return moodMap[mood] || 0.5
  }

  getRecentMaterial(roomId, limit = 10) {
    // Get recently added material for a room
    const cutoff = Date.now() - 30000 // Last 30 seconds
    const recent = []

    Object.values(this.materials).flat().forEach(material => {
      if (material.metadata.createdAt > cutoff) {
        recent.push(material)
      }
    })

    return recent
      .sort((a, b) => b.metadata.createdAt - a.metadata.createdAt)
      .slice(0, limit)
  }

  updateMaterialLifecycle() {
    // Age materials and clean up old ones
    const now = Date.now()

    this.lifetimes.forEach((lifetime, materialId) => {
      lifetime.age = now - (lifetime.createdAt || now)

      // Mark old material as non-vital
      if (lifetime.age > this.maxAge) {
        lifetime.isVital = false
      }

      // Reduce usage "tiredness" over time
      if (lifetime.usageCount > 0 && (now - lifetime.lastUsed) > 60000) {
        lifetime.usageCount = Math.max(0, lifetime.usageCount - 1)
      }
    })

    // Clean up very old material periodically
    this.cleanupOldMaterial()
  }

  cleanupOldMaterial() {
    const now = Date.now()
    const veryOldThreshold = this.maxAge * 2 // 4 minutes

    // Remove very old and overused material
    Object.keys(this.materials).forEach(functionKey => {
      this.materials[functionKey] = this.materials[functionKey].filter(material => {
        const lifetime = this.lifetimes.get(material.id)
        if (!lifetime) return false

        const isVeryOld = lifetime.age > veryOldThreshold
        const isOverused = lifetime.usageCount > this.usageThreshold * 2

        return !isVeryOld && !isOverused
      })
    })

    // Clean up by character too
    Object.keys(this.byCharacter).forEach(characterKey => {
      this.byCharacter[characterKey] = this.byCharacter[characterKey].filter(material => {
        const lifetime = this.lifetimes.get(material.id)
        return lifetime && lifetime.isVital
      })
    })

    // console.log(`🧹 MaterialLibrary: Cleaned up old material, ${this.getTotalCount()} items remaining`)
  }

  useMaterial(materialId) {
    // Mark material as used
    const lifetime = this.lifetimes.get(materialId)
    if (lifetime) {
      lifetime.usageCount++
      lifetime.lastUsed = Date.now()
    }
  }

  getTotalCount() {
    return Object.values(this.materials).reduce((total, materials) => total + materials.length, 0)
  }

  getMaterialForSection(sectionLabel) {
    // Get appropriate material for different musical sections
    switch (sectionLabel) {
      case 'A':
        // Primary material - usually stable, tonal
        return this.getCompatibleMaterial(this.keyCenter, 'neutral', 2)
      case 'B':
        // Contrasting material - more tension
        return this.getCompatibleMaterial(this.keyCenter, 'tense', 2)
      case 'C':
        // Development material - can be more complex
        return this.getCompatibleMaterial(this.keyCenter, 'energetic', 2)
      default:
        return this.getCompatibleMaterial(this.keyCenter, 'neutral', 1)
    }
  }

  setKeyCenter(key, mode = 'ionian') {
    // Update tonal center and track modulation
    if (this.keyCenter && this.keyCenter !== key) {
      this.modulations.push({
        from: this.keyCenter,
        to: key,
        mode: mode,
        timestamp: Date.now()
      })
    }

    this.keyCenter = key
    this.mode = mode
  }

  getKeyCenter() {
    return { key: this.keyCenter, mode: this.mode }
  }

  getModulationHistory() {
    return this.modulations.slice(-10) // Last 10 modulations
  }

  setTempo(tempo) {
    this.tempo = tempo
  }

  getStats() {
    // Entry #161: Calculate active materials from lifetimes
    let activeMaterials = 0
    const now = Date.now()
    for (const [id, lifetime] of this.lifetimes) {
      // Material is active if it's not expired and still vital
      const age = now - lifetime.createdAt
      const isExpired = age > this.maxAge
      const isTired = lifetime.usageCount >= this.usageThreshold
      if (!isExpired && !isTired) {
        activeMaterials++
      }
    }

    return {
      totalMaterials: this.getTotalCount(),
      activeMaterials, // Entry #161: Added active materials count
      byFunction: {
        tonic: this.materials.tonic.length,
        dominant: this.materials.dominant.length,
        subdominant: this.materials.subdominant.length,
        chromatic: this.materials.chromatic.length
      },
      byCharacter: {
        melodic: this.byCharacter.melodic.length,
        harmonic: this.byCharacter.harmonic.length,
        rhythmic: this.byCharacter.rhythmic.length,
        textural: this.byCharacter.textural.length
      },
      keyCenter: this.getKeyCenter(),
      tempo: this.tempo,
      modulations: this.modulations.length
    }
  }

  /**
   * Clear all materials from the library
   * Used for memory cleanup when service stops
   */
  clearAllMaterials() {
    // Clear all harmonic function arrays
    this.materials = {
      tonic: [],
      dominant: [],
      subdominant: [],
      chromatic: []
    }

    // Clear all character arrays
    this.byCharacter = {
      melodic: [],
      harmonic: [],
      rhythmic: [],
      textural: []
    }

    // Clear lifecycle tracking
    this.lifetimes.clear()

    // Clear modulations history
    this.modulations = []

    // Reset musical context to defaults (complete cleanup)
    this.keyCenter = null
    this.mode = 'ionian'
    this.tempo = 120
  }
}

module.exports = MaterialLibrary