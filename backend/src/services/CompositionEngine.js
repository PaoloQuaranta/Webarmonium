const CounterpointEngine = require('./CounterpointEngine')
const PhraseMorphology = require('./PhraseMorphology')
const AccompanimentEngine = require('./AccompanimentEngine')
const { PHI } = require('../utils/constants')
const {
  getGenreCharacteristics,
  getRhythmPattern,
  getArticulation,
  getSwingAmount,
  getSyncopation,
  getOrchestration
} = require('../utils/GenreCharacteristics')

class CompositionEngine {
  constructor(materialLibrary, styleAnalyzer, harmonicEngine) {
    this.materialLibrary = materialLibrary
    this.styleAnalyzer = styleAnalyzer
    this.harmonicEngine = harmonicEngine
    this.counterpointEngine = new CounterpointEngine()
    // Fix #5: Add PhraseMorphology for raw gesture contour processing
    this.phraseMorphology = new PhraseMorphology()
    // Entry #211: AccompanimentEngine for sophisticated accompaniment generation
    this.accompanimentEngine = new AccompanimentEngine(harmonicEngine)

    // Form structure management
    this.formStructure = null     // ABA, rondo, sonata, verse-chorus, etc.
    this.currentSection = 'A'     // Current section label
    this.lastComposedSection = 'A' // Entry #163: Track what was actually composed (for monitor)
    this.sectionHistory = []      // History of sections visited
    this.sectionLengths = {}      // Length of each section in bars
    this.formCycleLength = 1      // Minimum sections to complete one full cycle (Entry #163)
    this.compositionsInSection = 0 // Entry #163: Track compositions within current section
    this.minCompositionsPerSection = 3 // Entry #163: Minimum compositions before section can advance

    // Composition parameters
    this.tempo = 120
    this.keyCenter = 'C'
    this.mode = 'ionian'
    this.timeSignature = '4/4'

    // Composition strategy
    this.complexityLevel = 0.5     // 0-1, affects elaboration
    this.density = 0.5             // 0-1, affects note density
    this.tensionLevel = 0.5        // 0-1, affects harmonic tension

    // Musical development tracking
    this.motifs = []               // Developed motifs
    this.themes = []               // Musical themes
    this.developmentHistory = []   // Track development techniques used
  }

  /**
   * Update tensionLevel based on style, gestureWeight, and sectionContext
   * Entry #NEW: Integrates previously unused tensionLevel parameter for harmonic variety
   * @param {Object} style - Current style from StyleAnalyzer
   * @param {number} gestureWeight - Gesture influence weight (0-1, higher = more recent gestures)
   * @param {Object} sectionContext - Current section context from FormDefinitions
   */
  updateTensionLevel(style, gestureWeight, sectionContext) {
    // Combine: energy + gestureWeight + section harmonicTension
    // Each contributes proportionally to final tension
    const energyContribution = (style?.energy || 0.5) * 0.4
    const gestureContribution = (gestureWeight || 0.5) * 0.3
    const sectionTension = sectionContext?.harmonicTension || 0.3
    const sectionContribution = sectionTension * 0.3

    this.tensionLevel = Math.min(1, Math.max(0,
      energyContribution + gestureContribution + sectionContribution
    ))
  }

  /**
   * Get genre-based density multiplier
   * Entry #NEW: Makes density genre-aware (rock/electronic = dense, ambient/classical = sparse)
   * @param {Object} genreWeights - Genre weights from StyleAnalyzer
   * @returns {number} Density multiplier (0.7-1.3 range)
   */
  getGenreDensityMultiplier(genreWeights) {
    // Weight density by dominant genre characteristics
    const densityWeights = {
      rock: 1.3,
      electronic: 1.2,
      rhythmic: 1.2,
      jazz: 1.1,
      melodic: 1.0,
      classical: 0.9,
      ambient: 0.7,
      experimental: 1.0
    }

    let totalWeight = 0
    let weightedDensity = 0
    Object.entries(genreWeights || {}).forEach(([genre, weight]) => {
      if (densityWeights[genre] && weight > 0) {
        weightedDensity += weight * densityWeights[genre]
        totalWeight += weight
      }
    })

    return totalWeight > 0 ? weightedDensity / totalWeight : 1.0
  }

  compose(roomContext) {
    try {
// console.log(`🎼 CompositionEngine: Composing for room with ${roomContext.userCount || 1} users`)

      // Store compositionCount for temporal variation (Entry #114)
      this.compositionCount = roomContext.compositionCount || 0

      // Entry #169: Store sectionContext for section-aware composition
      this.sectionContext = roomContext.sectionContext || null

      // Entry #171: Store webMetrics for deterministic harmonic variety
      this.webMetrics = roomContext.webMetrics || null

      // DEBUG Entry #117: Log compositionCount to verify it changes

      // 1. Analyze current musical context
      const currentStyle = this.styleAnalyzer.getCurrentStyle()
// console.log(`🎼 Current style: energy=${currentStyle.energy?.toFixed(2)}, tempo=${currentStyle.tempo}`)

      // 2. Determine or maintain form structure
      // Entry #117: Reset form every ~8 compositions to avoid repetitive structure
      // Using PHI to determine when to reset creates natural variety
      // Entry #168: Form can only change AFTER completing at least one full cycle through all sections
      const hasCompletedCycle = this.sectionHistory.length >= this.formCycleLength
      const wantsToReset = this.compositionCount > 0 && ((this.compositionCount * PHI) % 1) < 0.12
      const shouldResetForm = !this.formStructure || (hasCompletedCycle && wantsToReset)
      if (shouldResetForm) {
        this.formStructure = this.selectForm(currentStyle)
        this.initializeFormStructure(this.formStructure)
      }

      // 3. Get available musical material
      const availableMaterial = this.getAvailableMaterial(roomContext)
      // DEBUG Entry #117: Log material count
// console.log(`🎼 Available material: ${availableMaterial.length} items`)

      // Entry #NEW: Update tensionLevel based on style, gestureWeight, and sectionContext
      const gestureWeight = roomContext.gestureWeight || 0.5
      this.updateTensionLevel(currentStyle, gestureWeight, this.sectionContext)

      // 4. Generate current section
      // Entry #163: Track composed section for monitor and section persistence
      const composedSection = this.currentSection
      this.lastComposedSection = composedSection
      this.compositionsInSection++
      const section = this.composeSection(composedSection, currentStyle, availableMaterial)

      // 5. Determine next section - only advance after minimum compositions in current section
      // Entry #163: Sections persist for multiple compositions to allow music to develop
      if (this.compositionsInSection >= this.minCompositionsPerSection) {
        this.getNextSection(this.formStructure)
        this.compositionsInSection = 0  // Reset counter for new section
      }
      // After getNextSection(), this.currentSection may be the NEXT section (if advanced)

      // 6. Update material library with new composition
      this.updateMaterialLibrary(section)

      // 7. Return complete composition
      // Entry #205: Calculate durationBeats for frontend timing (default 4 bars = 16 beats)
      const sectionLengthBars = section.duration || 4
      const beatsPerBar = 4 // Assuming 4/4 time for note distribution
      const durationBeats = sectionLengthBars * beatsPerBar

      return {
        type: section.type,
        structure: {
          form: this.formStructure,
          currentSection: composedSection,              // Section that was just composed
          nextSection: this.currentSection,             // Section that will be composed next
          compositionsInSection: this.compositionsInSection, // How many compositions in this section
          sectionHistory: [...this.sectionHistory]
        },
        content: section,
        metadata: {
          tempo: this.tempo,
          keyCenter: this.keyCenter,
          mode: this.mode,
          timeSignature: this.timeSignature,
          complexity: this.complexityLevel,
          timestamp: Date.now(),
          // Entry #202: Add duration info for frontend timing
          sectionLength: sectionLengthBars,  // Duration in bars
          durationBeats: durationBeats       // Duration in beats (for Transport scheduling)
        }
      }

    } catch (error) {
// console.error('Error in composition:', error)
      return this.createFallbackComposition()
    }
  }

  selectForm(style) {
    const genreWeights = style.genreWeights || {}
    // Normalize energy to 0-1 range to prevent out-of-bounds access
    const rawEnergy = style.energy || 0.5
    const energy = Math.max(0, Math.min(1, rawEnergy))

    // Forms ordered by energy level (low to high)
    // DERIVATION: energy level determines form selection within genre
    // Entry #161: Expanded default forms for more variety
    const formsByEnergy = {
      classical: ['theme_and_variations', 'ABA', 'rondo', 'sonata'],
      electronic: ['through_composed', 'strophic', 'verse_chorus', 'build_drop'],
      jazz: ['modal', 'AABA', 'blues', 'rhythm_changes'],
      rock: ['strophic', 'AABA', 'verse_chorus', 'intro_verse_chorus_bridge_outro'],
      ambient: ['through_composed', 'strophic', 'ABA'],
      melodic: ['ABA', 'verse_chorus', 'rondo'],
      default: ['strophic', 'ABA', 'verse_chorus', 'rondo', 'through_composed']
    }

    // Entry #161: Lowered threshold from 0.7 to 0.4 for more genre-specific forms
    // Also added progressive fallback using top 2 genres
    let genre = 'default'
    const sortedGenres = Object.entries(genreWeights)
      .filter(([g]) => formsByEnergy[g]) // Only genres with defined forms
      .sort((a, b) => b[1] - a[1]) // Sort by weight descending

    if (sortedGenres.length > 0 && sortedGenres[0][1] > 0.4) {
      genre = sortedGenres[0][0]
    } else if (sortedGenres.length > 1) {
      // Progressive fallback: use top genre if it's significantly higher than average
      const topWeight = sortedGenres[0][1]
      const avgWeight = Object.values(genreWeights).reduce((a, b) => a + b, 0) / Object.keys(genreWeights).length
      if (topWeight > avgWeight * 1.5) {
        genre = sortedGenres[0][0]
      }
    }

    const forms = formsByEnergy[genre] || formsByEnergy.default

    // Entry #165: Fixed form distribution - was ABA 48%, through_composed 1%
    // Problem: combinedIndex * forms.length biases toward lower indices
    // Solution: Use PHI stepping directly on array to ensure uniform distribution
    const compCount = this.compositionCount || 0
    const historyLength = this.sectionHistory?.length || 0

    // PHI stepping through forms array - each composition steps by PHI indices
    // This creates maximally spread sequence: 0, 1.618, 3.236, 4.854, 1.472, ...
    const phiStep = (compCount * PHI + historyLength * PHI * PHI) % forms.length

    // Energy still influences selection but with reduced weight
    // Energy shifts the PHI sequence by up to 1 position
    const energyShift = energy * 0.8

    // Final index combines PHI stepping with energy influence
    const rawIndex = (phiStep + energyShift) % forms.length
    const index = Math.floor(rawIndex)

    return forms[index]
  }

  initializeFormStructure(form) {
// console.log(`🎼 Initializing form structure: ${form}`)

    this.formStructure = form
    // Entry #163: sectionHistory starts EMPTY - first section added when getNextSection() is called
    // This ensures linear progression: index = history.length % cycleLength
    this.sectionHistory = []
    this.compositionsInSection = 0  // Entry #163: Reset counter for new form

    // Entry #211: Reset accompaniment voice leading state for new form
    if (this.accompanimentEngine) {
      this.accompanimentEngine.resetVoiceLeading()
    }

    // Set section lengths, starting section, and cycle length based on form
    // Entry #163: formCycleLength = minimum sections to complete one full form cycle
    // Entry #205: Halved all section lengths to reduce gaps between phrases
    // Original values were 8 bars = 32 beats, now 4 bars = 16 beats
    switch (form) {
      case 'ABA':
        this.sectionLengths = { 'A': 4, 'B': 4 }
        this.currentSection = 'A'
        this.formCycleLength = 3  // A → B → A
        break
      case 'rondo':
        this.sectionLengths = { 'A': 2, 'B': 2, 'C': 2 }
        this.currentSection = 'A'
        this.formCycleLength = 5  // A → B → A → C → A
        break
      case 'sonata':
        this.sectionLengths = { 'exposition': 8, 'development': 8, 'recapitulation': 8 }
        this.currentSection = 'exposition'
        this.formCycleLength = 3  // exposition → development → recapitulation
        break
      case 'AABA':
        this.sectionLengths = { 'A': 4, 'B': 4 }
        this.currentSection = 'A'
        this.formCycleLength = 4  // A → A → B → A
        break
      case 'verse_chorus':
        this.sectionLengths = { 'verse': 4, 'chorus': 4, 'bridge': 4, 'intro': 2, 'outro': 2 }
        this.currentSection = 'intro'
        this.formCycleLength = 8  // intro → verse → chorus → verse → chorus → bridge → chorus → outro
        break
      case 'blues':
        this.sectionLengths = { 'blues': 6 }
        this.currentSection = 'blues'
        this.formCycleLength = 1  // Single 6-bar cycle (halved from 12)
        break
      case 'theme_and_variations':
        this.sectionLengths = { 'theme': 4, 'var1': 4, 'var2': 4, 'var3': 4 }
        this.currentSection = 'theme'
        this.formCycleLength = 4  // theme → var1 → var2 → var3
        break
      case 'through_composed':
        this.sectionLengths = { 'A': 4, 'B': 4, 'C': 4 }
        this.currentSection = 'A'
        this.formCycleLength = 3  // A → B → C
        break
      case 'strophic':
        this.sectionLengths = { 'strophe': 4 }
        this.currentSection = 'strophe'
        this.formCycleLength = 3  // 3 strophes minimum
        break
      case 'build_drop':
        this.sectionLengths = { 'build': 4, 'drop': 4, 'breakdown': 2 }
        this.currentSection = 'build'
        this.formCycleLength = 3  // build → drop → breakdown
        break
      case 'modal':
        this.sectionLengths = { 'A': 4, 'B': 4 }
        this.currentSection = 'A'
        this.formCycleLength = 4  // A → A → B → A
        break
      case 'rhythm_changes':
        this.sectionLengths = { 'A': 4, 'B': 4 }
        this.currentSection = 'A'
        this.formCycleLength = 4  // A → A → B → A (16-bar form)
        break
      case 'intro_verse_chorus_bridge_outro':
        this.sectionLengths = { 'intro': 2, 'verse': 4, 'chorus': 4, 'bridge': 4, 'outro': 2 }
        this.currentSection = 'intro'
        this.formCycleLength = 5  // intro → verse → chorus → bridge → outro
        break
      default:
        this.sectionLengths = { 'A': 4 }
        this.currentSection = 'A'
        this.formCycleLength = 3  // Default: at least 3 sections
    }
  }

  getAvailableMaterial(roomContext) {
    // Get material from library and context
    const libraryMaterial = this.materialLibrary.getMaterialForSection(this.currentSection)
    const recentMaterial = this.materialLibrary.getRecentMaterial(roomContext.roomId)

    // Combine and prioritize
    const allMaterial = [...libraryMaterial, ...recentMaterial]

    // Fix #5: Retrieve raw gestures for the current section and convert to material
    if (this.sectionContext) {
      const rawGestures = this.materialLibrary.getRawGesturesForSection(this.sectionContext, 3)
      const rawGestureMaterial = this._convertRawGesturesToMaterial(rawGestures)
      allMaterial.push(...rawGestureMaterial)
    }

    // Sort by relevance and freshness
    return allMaterial.sort((a, b) => {
      const scoreA = this.calculateMaterialScore(a, roomContext)
      const scoreB = this.calculateMaterialScore(b, roomContext)
      return scoreB - scoreA
    }).slice(0, 5) // Use top 5 most relevant materials
  }

  /**
   * Fix #5: Convert raw gestures to material entries using PhraseMorphology
   * This allows raw gesture contours to be used in the composition flow
   * @param {RawGestureData[]} rawGestures - Raw gestures from MaterialLibrary
   * @returns {Object[]} Material entries compatible with composition flow
   * @private
   */
  _convertRawGesturesToMaterial(rawGestures) {
    if (!rawGestures || rawGestures.length === 0) return []

    const musicalContext = {
      key: this.keyCenter,
      mode: this.mode,
      tempo: this.tempo
    }

    return rawGestures.map(rawGesture => {
      // Get the raw contour from the gesture (stored as property on RawGestureData)
      const contour = rawGesture.contour

      if (!contour || contour.length === 0) return null

      // Use PhraseMorphology to generate phrase from raw contour
      const phrase = this.phraseMorphology.generatePhraseFromContour(
        contour,
        musicalContext,
        this.sectionContext,
        {
          gestureType: rawGesture.gestalt || 'linear',
          velocity: rawGesture.velocity || 0.5,
          curvature: rawGesture.curvature || 0.5
        }
      )

      if (!phrase) return null

      // Wrap as material entry
      return {
        id: `raw_phrase_${rawGesture.id || Date.now()}`,
        content: {
          notes: phrase.notes || [],
          type: 'melody',
          fromRawGesture: true
        },
        metadata: {
          harmonicFunction: rawGesture.harmonicFunction || 'subdominant',
          character: rawGesture.character || 'melodic',
          keyCenter: this.keyCenter,
          mode: this.mode,
          tempo: this.tempo,
          createdAt: rawGesture.timestamp || Date.now(),
          userId: rawGesture.userId,
          complexity: rawGesture.getComplexity(),
          emotionalValence: 0.5,
          fromRawGesture: true
        }
      }
    }).filter(m => m !== null)
  }

  calculateMaterialScore(material, roomContext) {
    let score = 0

    // Age freshness
    const age = Date.now() - (material.metadata?.createdAt || 0)
    const ageScore = Math.max(0, 1 - age / 120000) // Decay over 2 minutes
    score += ageScore * 0.3

    // Complexity matching
    const materialComplexity = material.metadata?.complexity || 0.5
    const complexityMatch = 1 - Math.abs(materialComplexity - this.complexityLevel)
    score += complexityMatch * 0.2

    // Mood compatibility
    const currentMood = this.getCurrentMood()
    const moodCompatibility = this.styleAnalyzer.calculateMoodCompatibility(material, currentMood)
    score += moodCompatibility * 0.3

    // User relevance (if material belongs to active users)
    if (roomContext.activeUsers && material.metadata.userId) {
      if (roomContext.activeUsers.includes(material.metadata.userId)) {
        score += 0.2
      }
    }

    return score
  }

  getCurrentMood() {
    const style = this.styleAnalyzer.getCurrentStyle()
    const energy = style.energy || 0.5

    if (energy > 0.7) return 'energetic'
    if (energy < 0.3) return 'contemplative'
    return 'neutral'
  }

  composeSection(sectionLabel, style, material) {
    const sectionLength = this.sectionLengths[sectionLabel] || 8

    // Generate harmonic progression for the section
    // Entry #117: Pass compositionCount for temporal variation in progression selection
    // Entry #169: Pass sectionContext for tension-aware progression
    // Entry #171: Pass webMetrics for deterministic harmonic variety
    // Entry #NEW: Pass tensionLevel for harmonic complexity control
    const progression = this.harmonicEngine.generateProgression(
      style, sectionLength, this.compositionCount, this.sectionContext, this.webMetrics, this.tensionLevel
    )
    // Entry #117: Sync keyCenter from HarmonicEngine (which now varies by compositionCount)
    this.keyCenter = this.harmonicEngine.currentKey
    this.mode = this.harmonicEngine.currentMode

    // Compose based on material availability and user count
    if (material.length > 1) {
      // Multi-user: create polyphonic texture
      // Entry #169: Pass sectionContext for voice role application
      return this.composePolyphonic(material, progression, style, sectionLength, this.sectionContext)
    } else if (material.length === 1) {
      // Single-user: elaborate material with accompaniment
      return this.composeMonophonic(material[0], progression, style, sectionLength, this.sectionContext)
    } else {
      // No material: generate ambient/sectional material
      return this.composeAmbient(progression, style, sectionLength, this.sectionContext)
    }
  }

  composePolyphonic(materials, progression, style, sectionLength, sectionContext = null) {
    // Entry #180: Get genre for genre-aware voice creation
    const genre = style?.forcedGenre || this._getDominantGenreFromWeights(style?.genreWeights) || 'melodic'

    // Entry #206: Get orchestration config for this genre
    const orchestration = getOrchestration(genre)

    // Entry #180: Use genre-specific voice count instead of fixed 4
    const genreConfig = getGenreCharacteristics(genre)
    const genreVoiceCount = genreConfig?.voiceConfig?.voiceCount || 4
    const maxVoices = Math.min(materials.length, genreVoiceCount)
    const selectedMaterials = materials.slice(0, maxVoices)

// console.log(`🎼 Composing polyphonic section with ${maxVoices} voices for genre ${genre}`)

    // Create voices for each material/user with DISTINCT ROLES
    const voicesRaw = selectedMaterials.map((material, i) => {
      // Pass compositionCount for temporal variation (Entry #114)
      // Entry #169: Pass sectionContext for voice role application
      // Entry #180: Pass genre for genre-aware voice creation
      // Entry #202: Pass sectionLength so notes span full composition duration
      const voice = this.counterpointEngine.createVoice(material, i, progression, this.compositionCount, sectionContext, genre, sectionLength)

      // Entry #180: Voice may be null if genre doesn't need this many voices
      if (!voice) return null

// console.log(`🎼   Voice ${i} (${voice.voiceRole}): ${voice.notes?.length || 0} notes, timbre=${voice.timbre}`)
      return {
        ...voice,
        materialId: material.id,
        userId: material.metadata.userId,
        genre: genre
      }
    }).filter(v => v !== null) // Entry #180: Filter out null voices

    // Entry #180b: Recalculate pan positions AFTER filtering null voices
    // This ensures pan spread is correct for actual voice count
    const voices = voicesRaw.map((voice, index) => ({
      ...voice,
      pan: this.counterpointEngine.calculatePan(index, voicesRaw.length)
    }))

    // Validate voice leading
    const validation = this.counterpointEngine.validateVoiceLeading(voices)
    if (!validation.isValid) {
// console.log(`🎼 Voice leading issues detected: ${validation.errors.length} errors`)
      // Apply corrections if needed
      this.correctVoiceLeading(voices, validation.errors)
    }

    // Entry #117: Clamp all pitches back to voice range after corrections
    // This prevents voice leading corrections from moving notes outside playable range
    voices.forEach(voice => {
      const { min, max } = voice.range
      voice.notes.forEach(note => {
        while (note.pitch < min) note.pitch += 12
        while (note.pitch > max) note.pitch -= 12
      })
    })

    // Entry #206: Generate full accompaniment
    const fullAccompaniment = this.generateFullAccompaniment(progression, style, sectionLength)

    // Entry #206: Filter counterpoint voices based on orchestration
    const activeVoices = voices.filter(v => {
      // Map voice roles to orchestration counterpoint roles
      const roleMap = {
        'melody': 'melody',
        'harmony': 'harmony',
        'bass': 'bass_voice',
        'pad': 'harmony'  // Pad voices treated as harmony
      }
      const mappedRole = roleMap[v.voiceRole] || v.voiceRole
      return orchestration.counterpoint.includes(mappedRole) ||
             orchestration.counterpoint.includes(v.voiceRole)
    })

    // Entry #206: Filter accompaniment based on orchestration
    const activeAccompaniment = {}
    if (orchestration.accompaniment.includes('bass_accomp') && fullAccompaniment.bass_accomp) {
      activeAccompaniment.bass_accomp = fullAccompaniment.bass_accomp
    }
    if (orchestration.accompaniment.includes('pad') && fullAccompaniment.pad) {
      activeAccompaniment.pad = fullAccompaniment.pad
    }
    if (orchestration.accompaniment.includes('keys') && fullAccompaniment.keys) {
      activeAccompaniment.keys = fullAccompaniment.keys
    }

    // Entry #206: Apply velocity scaling from orchestration
    const velocities = orchestration.velocities || {}
    activeVoices.forEach(voice => {
      const velocityScale = velocities[voice.voiceRole] || velocities.melody || 1.0
      voice.notes.forEach(note => {
        note.velocity = (note.velocity || 0.7) * velocityScale
      })
    })

    // Apply velocity to accompaniment
    Object.keys(activeAccompaniment).forEach(layer => {
      const velocityScale = velocities[layer] || 0.5
      if (activeAccompaniment[layer].notes) {
        activeAccompaniment[layer].notes.forEach(note => {
          note.velocity = (note.velocity || 0.6) * velocityScale
        })
      }
    })

    return {
      type: 'polyphonic',
      voices: activeVoices,
      accompaniment: Object.keys(activeAccompaniment).length > 0 ? activeAccompaniment : null,
      orchestration,  // Include for frontend debugging
      progression,
      validation,
      duration: sectionLength,
      texture: this.classifyTexture(activeVoices)
    }
  }

  composeMonophonic(material, progression, style, sectionLength, sectionContext = null) {
// console.log(`🎼 Composing monophonic section from material ${material.id}`)

    // Elaborate the primary material
    // Entry #169: Pass sectionContext for development technique application
    const melody = this.elaborateMaterial(material, progression, sectionLength, sectionContext)

    // Generate accompaniment
    const accompaniment = this.generateAccompaniment(progression, style, sectionLength)

    return {
      type: 'homophonic',
      melody,
      accompaniment,
      progression,
      duration: sectionLength,
      materialId: material.id,
      sectionParams: sectionContext ? {
        thematicRole: sectionContext.thematicRole,
        developmentTechnique: sectionContext.developmentTechnique
      } : null
    }
  }

  composeAmbient(progression, style, sectionLength, sectionContext = null) {
// console.log(`🎼 Composing ambient section (no material available)`)

    // Fix #5: Try to use raw gestures for melodic content before falling back to pure ambient
    if (sectionContext) {
      const rawGestures = this.materialLibrary.getRawGesturesForSection(sectionContext, 2)
      if (rawGestures && rawGestures.length > 0) {
        const rawMaterial = this._convertRawGesturesToMaterial(rawGestures)
        if (rawMaterial.length > 0) {
          // Use raw gesture material for a more melodic ambient section
          return this.composeMonophonic(rawMaterial[0], progression, style, sectionLength, sectionContext)
        }
      }
    }

    // Generate textural material based on style
    const texture = this.generateAmbientTexture(style, sectionLength)
// console.log(`🎼   Ambient texture: ${texture.layers.length} layers (static texture - minimal notes)`)

    // Entry #187: Extract layers array to match frontend expected format
    // Frontend playAmbientComposition expects texture to be an array, not an object
    return {
      type: 'ambient',
      texture: texture.layers,
      progression,
      duration: sectionLength,
      atmosphere: this.selectAtmosphere(style)
    }
  }

  elaborateMaterial(material, progression, sectionLength) {
    // Select elaboration technique based on material age and usage
    const technique = this.selectElaborationTechnique(material)

// console.log(`🎼 Elaborating material with technique: ${technique}`)

    let elaborated
    switch (technique) {
      case 'repeat':
        elaborated = this.repeatMaterial(material, sectionLength)
        break
      case 'vary':
        elaborated = this.varyMaterial(material, progression)
        break
      case 'sequence':
        elaborated = this.sequenceMaterial(material, progression)
        break
      case 'fragment':
        elaborated = this.fragmentMaterial(material, progression)
        break
      case 'augment':
        elaborated = this.augmentMaterial(material)
        break
      case 'diminish':
        elaborated = this.diminishMaterial(material)
        break
      case 'invert':
        elaborated = this.invertMaterial(material)
        break
      case 'retrograde':
        elaborated = this.retrogradeMaterial(material)
        break
      default:
        elaborated = material.content || material
    }

    // Track development
    this.developmentHistory.push({
      technique,
      materialId: material.id,
      timestamp: Date.now()
    })
    // Memory leak prevention: cap history to prevent unbounded growth
    if (this.developmentHistory.length > 100) {
      this.developmentHistory = this.developmentHistory.slice(-100)
    }

    return elaborated
  }

  selectElaborationTechnique(material) {
    const lifetime = this.materialLibrary.lifetimes.get(material.id)
    if (!lifetime) return 'repeat'

    const age = lifetime.age || 0
    const usage = lifetime.usageCount || 0

    // Young material: basic techniques
    if (age < 30000) { // Less than 30 seconds
      if (usage < 2) return 'repeat'
      return 'vary'
    }

    // Middle-aged material: moderate techniques
    if (age < 60000) { // Less than 1 minute
      if (usage < 4) return 'sequence'
      return 'fragment'
    }

    // Old material: advanced techniques
    // DERIVATION: golden ratio stepping breaks predictable cycling
    const advancedTechniques = ['augment', 'diminish', 'invert', 'retrograde']
    const safeUsage = usage || 0
    const techniqueIndex = Math.floor((safeUsage * PHI) % 1 * advancedTechniques.length)
    return advancedTechniques[techniqueIndex]
  }

  // Material elaboration techniques
  repeatMaterial(material, sectionLength) {
    if (!material.content?.notes) return material

    const originalNotes = material.content.notes
    const targetNotes = Math.ceil(sectionLength * 2) // Approximate notes needed
    const repeatedNotes = []

    for (let i = 0; i < targetNotes; i++) {
      const sourceNote = originalNotes[i % originalNotes.length]
      repeatedNotes.push({
        ...sourceNote,
        startBeat: (i * sourceNote.duration)
      })
    }

    return {
      ...material.content,
      notes: repeatedNotes,
      technique: 'repeat'
    }
  }

  varyMaterial(material, progression) {
    if (!material.content?.notes) return material

    const notes = material.content.notes
    const noteCount = notes.length

    // Apply variations derived from note properties
    // DERIVATION: position in phrase determines variation amount
    const variedNotes = notes.map((note, i) => {
      // Position factor: notes at phrase boundaries get more variation
      const positionFactor = Math.sin((i / noteCount) * Math.PI) // Peak in middle

      // Duration variation: derived from note's velocity (louder = more stable)
      const velocityFactor = (note.velocity || 80) / 127
      const durationVariation = 0.8 + (1 - velocityFactor) * 0.4 // 0.8-1.2

      // Velocity variation: derived from position in phrase (phrase contour)
      const velocityChange = (positionFactor - 0.5) * 20 // -10 to +10

      // Pitch variation: only at specific phrase positions (every 3rd note after position 0.5)
      const shouldVaryPitch = i > noteCount * 0.5 && i % 3 === 0
      const pitchVariation = shouldVaryPitch ? (i % 2 === 0 ? 2 : -2) : 0

      return {
        ...note,
        duration: note.duration * durationVariation,
        velocity: Math.max(40, Math.min(120, note.velocity + velocityChange)),
        pitch: note.pitch + pitchVariation
      }
    })

    return {
      ...material.content,
      notes: variedNotes,
      technique: 'variation'
    }
  }

  sequenceMaterial(material, progression) {
    if (!material.content?.notes) return material

    const originalNotes = material.content.notes
    const sequencedNotes = []

    // Create sequence at different pitch levels
    const transpositions = [0, 5, 7, -5] // Root, P4, P5, P4 down
    let currentTransposition = 0

    for (let i = 0; i < originalNotes.length * 2; i++) {
      const sourceNote = originalNotes[i % originalNotes.length]
      currentTransposition = transpositions[Math.floor(i / originalNotes.length) % transpositions.length]

      sequencedNotes.push({
        ...sourceNote,
        pitch: sourceNote.pitch + currentTransposition,
        startBeat: (i * sourceNote.duration)
      })
    }

    return {
      ...material.content,
      notes: sequencedNotes,
      technique: 'sequence'
    }
  }

  fragmentMaterial(material, progression) {
    if (!material.content?.notes) return material

    const originalNotes = material.content.notes
    const fragmentSize = Math.max(2, Math.floor(originalNotes.length / 2))

    // DERIVATION: fragment start position from average pitch of material
    // Higher average pitch → start later in phrase (more varied fragments)
    const avgPitch = originalNotes.reduce((sum, n) => sum + (n.pitch || 60), 0) / originalNotes.length
    const normalizedPitch = (avgPitch - 48) / 48 // Normalize around middle C range
    const fragmentStart = Math.floor(normalizedPitch * (originalNotes.length - fragmentSize))
    const safeStart = Math.max(0, Math.min(fragmentStart, originalNotes.length - fragmentSize))
    const fragment = originalNotes.slice(safeStart, safeStart + fragmentSize)

    // Repeat fragment with variations
    const fragmentedNotes = []
    for (let repeat = 0; repeat < 3; repeat++) {
      fragment.forEach((note, i) => {
        fragmentedNotes.push({
          ...note,
          pitch: note.pitch + (repeat * 5), // Transpose each repetition
          startBeat: (repeat * fragmentSize * note.duration) + (i * note.duration),
          velocity: note.velocity * (1 - repeat * 0.1) // Get slightly softer
        })
      })
    }

    return {
      ...material.content,
      notes: fragmentedNotes,
      technique: 'fragment'
    }
  }

  augmentMaterial(material) {
    if (!material.content?.notes) return material

    // Double all durations (augmentation)
    const augmentedNotes = material.content.notes.map(note => ({
      ...note,
      duration: note.duration * 2,
      startBeat: (note.startBeat || 0) * 2
    }))

    return {
      ...material.content,
      notes: augmentedNotes,
      technique: 'augmentation'
    }
  }

  diminishMaterial(material) {
    if (!material.content?.notes) return material

    // Halve all durations (diminution)
    const diminishedNotes = material.content.notes.map(note => ({
      ...note,
      duration: note.duration * 0.5,
      velocity: Math.min(127, note.velocity * 1.1) // Slightly louder to compensate
    }))

    return {
      ...material.content,
      notes: diminishedNotes,
      technique: 'diminution'
    }
  }

  invertMaterial(material) {
    if (!material.content?.notes) return material

    // Calculate pitch center for inversion
    const pitches = material.content.notes.map(note => note.pitch)
    const center = (Math.min(...pitches) + Math.max(...pitches)) / 2

    const invertedNotes = material.content.notes.map(note => ({
      ...note,
      pitch: Math.round(2 * center - note.pitch) // Invert around center
    }))

    return {
      ...material.content,
      notes: invertedNotes,
      technique: 'inversion'
    }
  }

  retrogradeMaterial(material) {
    if (!material.content?.notes) return material

    // Reverse the order of notes
    const reversedNotes = [...material.content.notes].reverse()
    const totalDuration = material.content.notes.reduce((sum, note) => sum + note.duration, 0)

    // Recalculate start times
    let currentTime = 0
    reversedNotes.forEach(note => {
      note.startBeat = currentTime
      currentTime += note.duration
    })

    return {
      ...material.content,
      notes: reversedNotes,
      technique: 'retrograde'
    }
  }

  /**
   * Generate accompaniment based on genre - Entry #180: Now uses genre-specific rhythm patterns
   * @param {Array} progression - Chord progression
   * @param {Object} style - Style object with forcedGenre or genreWeights
   * @param {number} sectionLength - Section length in bars
   * @returns {Object} Accompaniment object
   */
  generateAccompaniment(progression, style, sectionLength) {
    // Entry #180: Use forcedGenre if available, otherwise determine from weights
    const genre = style.forcedGenre || this._getDominantGenreFromWeights(style.genreWeights)

    // Get genre-specific rhythm pattern (cycles through patterns based on compositionCount)
    const rhythmPattern = getRhythmPattern(genre, 'accompaniment', this.compositionCount || 0)
    const articulation = getArticulation(genre)
    const swingAmount = getSwingAmount(genre)
    const syncopation = getSyncopation(genre)

    // Route to genre-specific generator with rhythm pattern
    // Entry #180b: Pass swingAmount and syncopation to all generators
    switch (genre) {
      case 'jazz':
        return this.generateJazzComping(progression, rhythmPattern, swingAmount, syncopation)
      case 'electronic':
        return this.generateArpeggio(progression, rhythmPattern, syncopation)
      case 'rhythmic':
        // Rhythmic/funk has slight swing and high syncopation
        return this.generateArpeggio(progression, rhythmPattern, syncopation, swingAmount)
      case 'rock':
        return this.generateRockGroove(progression, rhythmPattern, articulation, syncopation)
      case 'ambient':
        return this.generateAmbientPads(progression, rhythmPattern)
      case 'classical':
        return this.generateClassicalAccompaniment(progression, rhythmPattern, syncopation)
      case 'experimental':
        return this.generateArpeggio(progression, rhythmPattern, syncopation, swingAmount)
      default:
        return this.generateChordPads(progression, rhythmPattern, genre, syncopation)
    }
  }

  /**
   * Helper to get dominant genre from weights
   */
  _getDominantGenreFromWeights(genreWeights) {
    if (!genreWeights) return 'melodic'

    let maxWeight = 0
    let dominant = 'melodic'

    for (const [genre, weight] of Object.entries(genreWeights)) {
      if (weight > maxWeight) {
        maxWeight = weight
        dominant = genre
      }
    }

    return dominant
  }

  /**
   * Generate jazz-style comping with swing feel - Entry #180: Now accepts rhythm pattern
   * Entry #180b: Added syncopation parameter for anticipation probability
   */
  generateJazzComping(progression, rhythmPattern = [1, 0.5, 1.5, 1], swingAmount = 0.67, syncopation = 0.7) {
    return {
      type: 'jazz_comping',
      swingAmount: swingAmount,       // 2:1 swing ratio for triplet feel
      syncopation: syncopation,       // Probability of anticipations/off-beat accents
      chords: progression.map((chord, index) => ({
        ...chord,
        voicing: this.harmonicEngine.voiceLeadToChord(60, chord, null),
        rhythm: rhythmPattern,
        articulation: index % 3 === 0 ? 'staccato' : 'portato', // Varied articulation
        anticipate: Math.random() < syncopation * 0.5 // Random anticipation based on syncopation
      }))
    }
  }

  /**
   * Generate electronic-style arpeggios - Entry #180: Now accepts rhythm pattern
   * Entry #180b: Added syncopation and optional swing for rhythmic/funk genres
   */
  generateArpeggio(progression, rhythmPattern = [0.25, 0.25, 0.25, 0.25], syncopation = 0.6, swingAmount = 0) {
    // Entry #180: Vary arpeggio direction based on composition count
    const directions = ['up', 'down', 'updown', 'random']
    const dirIndex = (this.compositionCount || 0) % directions.length

    return {
      type: 'arpeggio',
      swingAmount: swingAmount,       // 0 for electronic, slight for rhythmic/funk
      syncopation: syncopation,       // Off-beat probability
      pattern: progression.map((chord, index) => ({
        ...chord,
        notes: this.harmonicEngine.buildChord(chord.chord),
        rhythm: rhythmPattern,
        direction: directions[(dirIndex + index) % directions.length],
        // Entry #180b: Apply syncopation as velocity accent on off-beats
        accentOffBeats: syncopation > 0.5
      }))
    }
  }

  /**
   * Generate rock-style groove - Entry #180: Now accepts rhythm pattern
   * Entry #180b: Added syncopation for push/pull feel
   */
  generateRockGroove(progression, rhythmPattern = [0.5, 0.5, 0.5, 0.5], articulation = 'marcato', syncopation = 0.4) {
    return {
      type: 'rock_groove',
      syncopation: syncopation,       // Some push/pull but mostly on-beat
      chords: progression.map((chord, index) => ({
        ...chord,
        rhythm: rhythmPattern,
        powerChords: true,
        articulation: articulation,
        accent: index % 2 === 1,       // Backbeat accent (beats 2 and 4)
        // Entry #180b: Random push based on syncopation level
        pushBeat: Math.random() < syncopation * 0.3
      }))
    }
  }

  /**
   * Generate ambient pads - Entry #180: New method for ambient genre
   */
  generateAmbientPads(progression, rhythmPattern = [8]) {
    return {
      type: 'ambient_pads',
      chords: progression.map(chord => ({
        ...chord,
        duration: rhythmPattern[0] || chord.bars * 4,
        sustain: true,
        fade: 'in_out',
        articulation: 'legato',
        volume: 0.6 // Softer
      }))
    }
  }

  /**
   * Generate classical-style accompaniment - Entry #180: New method for classical genre
   * Entry #180b: Added syncopation (minimal for classical)
   */
  generateClassicalAccompaniment(progression, rhythmPattern = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], syncopation = 0.15) {
    // Alberti bass style or block chords
    const isAlberti = rhythmPattern.length >= 4 && rhythmPattern[0] <= 0.5

    return {
      type: isAlberti ? 'alberti_bass' : 'block_chords',
      syncopation: syncopation,       // Minimal syncopation for classical
      chords: progression.map(chord => ({
        ...chord,
        rhythm: rhythmPattern,
        voicing: this.harmonicEngine.voiceLeadToChord(48, chord, null), // Lower register
        articulation: 'legato',
        pattern: isAlberti ? 'broken' : 'block'
      }))
    }
  }

  /**
   * Generate sustained chord pads - Entry #180: Now accepts rhythm pattern and genre
   * Entry #180b: Added syncopation parameter
   */
  generateChordPads(progression, rhythmPattern = [4], genre = 'melodic', syncopation = 0.25) {
    const genreConfig = getGenreCharacteristics(genre)
    const synthParams = genreConfig?.synthParams || {}

    return {
      type: 'chord_pads',
      syncopation: syncopation,
      chords: progression.map(chord => ({
        ...chord,
        duration: rhythmPattern[0] || chord.bars * 4,
        sustain: true,
        fade: genre === 'ambient' ? 'in_out' : 'none',
        articulation: genreConfig?.articulation || 'normal',
        filterCutoff: synthParams.filterCutoff // Pass to frontend for filter modulation
      }))
    }
  }

  /**
   * Entry #211: Generate full accompaniment using AccompanimentEngine
   * Creates bass_accomp, pad, and keys with voice leading, dynamics, and PHI variation
   * Filtered by orchestration in composePolyphonic
   * @param {Array} progression - Chord progression
   * @param {Object} style - Style object with forcedGenre or genreWeights
   * @param {number} sectionLength - Section length in bars
   * @returns {Object} Full accompaniment with bass_accomp, pad, and keys
   */
  generateFullAccompaniment(progression, style, sectionLength) {
    const genre = style?.forcedGenre || this._getDominantGenreFromWeights(style?.genreWeights) || 'melodic'

    // Entry #211: Delegate to AccompanimentEngine for sophisticated generation
    return {
      bass_accomp: this.accompanimentEngine.generateBassAccompaniment(
        progression,
        genre,
        sectionLength,
        this.sectionContext,
        this.compositionCount || 0
      ),
      pad: this.accompanimentEngine.generatePadAccompaniment(
        progression,
        genre,
        sectionLength,
        this.sectionContext,
        this.compositionCount || 0
      ),
      keys: this.accompanimentEngine.generateKeysAccompaniment(
        progression,
        genre,
        sectionLength,
        this.sectionContext,
        this.compositionCount || 0
      )
    }
  }

// Entry #211: Legacy accompaniment methods removed - now delegated to AccompanimentEngine

  generateAmbientTexture(style, sectionLength) {
    // Entry #187: Convert bars to milliseconds for frontend compatibility
    // Frontend playAmbientComposition expects duration in milliseconds
    // Formula: bars * 4 beats/bar * (60000ms/tempo) = duration in ms
    const tempo = this.tempo || 120
    const durationMs = sectionLength * 4 * (60000 / tempo)

    // Entry #187: Add note names (required by frontend for playback)
    // Frontend checks for textureItem.note property
    const keyCenter = this.keyCenter || 'C'
    const droneNote = `${keyCenter}3`
    const fifthMap = { 'C': 'G', 'D': 'A', 'E': 'B', 'F': 'C', 'G': 'D', 'A': 'E', 'B': 'F#' }
    const fifthNote = `${fifthMap[keyCenter] || 'G'}3`
    const thirdNote = `${keyCenter}4`

    return {
      type: 'ambient_texture',
      layers: [
        { type: 'drone', note: droneNote, duration: durationMs, velocity: 0.3, articulation: 'legato' },
        { type: 'drone', note: fifthNote, duration: durationMs, velocity: 0.2, articulation: 'legato' },
        { type: 'drone', note: thirdNote, duration: durationMs, velocity: 0.15, articulation: 'legato' }
      ],
      atmosphere: this.selectAtmosphere(style)
    }
  }

  selectAtmosphere(style) {
    const energy = style.energy || 0.5

    if (energy > 0.7) return 'energetic'
    if (energy < 0.3) return 'calm'
    return 'neutral'
  }

  classifyTexture(voices) {
    // Classify the texture type
    if (voices.length === 1) return 'monophonic'
    if (voices.length === 2) return 'duophonic'
    if (voices.length <= 4) return 'polyphonic'
    return 'dense'
  }

  correctVoiceLeading(voices, errors) {
    // Apply corrections for voice leading issues
    errors.forEach(error => {
      switch (error.type) {
        case 'parallel_perfect_interval':
          this.correctParallelInterval(voices, error)
          break
        case 'voice_crossing':
          this.correctVoiceCrossing(voices, error)
          break
        case 'excessive_spacing':
          this.correctExcessiveSpacing(voices, error)
          break
      }
    })
  }

  correctParallelInterval(voices, error) {
    // Entry #117: Fixed cumulative correction bug
    // Only correct first note once per voice
    const [voice1Index, voice2Index] = error.voices
    const voice2 = voices[voice2Index]

    if (voice2 && voice2.notes.length > 0 && !voice2._parallelCorrected) {
      voice2.notes[0].pitch += 1
      voice2._parallelCorrected = true
    }
  }

  correctVoiceCrossing(voices, error) {
    // Entry #117: Fixed cumulative correction bug
    // Only correct if not already corrected (track with _crossingCorrected flag)
    const crossingIndex = voices.findIndex(v => v.voiceType === error.lowerVoice)
    if (crossingIndex !== -1 && !voices[crossingIndex]._crossingCorrected) {
      voices[crossingIndex].voiceType = error.upperVoice
      voices[crossingIndex].notes.forEach(note => {
        note.pitch += 12 // Move up an octave
      })
      voices[crossingIndex]._crossingCorrected = true // Prevent cumulative corrections
    }
  }

  correctExcessiveSpacing(voices, error) {
    // Entry #117: Fixed cumulative correction bug
    // Only correct once per voice
    const upperIndex = voices.findIndex(v => v.voiceType === error.upperVoice)
    if (upperIndex !== -1 && voices[upperIndex].notes.length > 0 && !voices[upperIndex]._spacingCorrected) {
      voices[upperIndex].notes[0].pitch -= 6 // Move down a tritone
      voices[upperIndex]._spacingCorrected = true
    }
  }

  getNextSection(form) {
    // Entry #163: Push current section to history FIRST, then calculate next
    // With sectionHistory starting empty, index = history.length % cycleLength gives linear progression
    this.sectionHistory.push(this.currentSection)
    // Memory leak prevention: cap history to prevent unbounded growth
    if (this.sectionHistory.length > 100) {
      this.sectionHistory = this.sectionHistory.slice(-100)
    }
    const historyLen = this.sectionHistory.length

    switch (form) {
      case 'ABA': {
        const sequence = ['A', 'B', 'A']
        this.currentSection = sequence[historyLen % sequence.length]
        break
      }

      case 'rondo': {
        const sequence = ['A', 'B', 'A', 'C', 'A']
        this.currentSection = sequence[historyLen % sequence.length]
        break
      }

      case 'AABA': {
        const sequence = ['A', 'A', 'B', 'A']
        this.currentSection = sequence[historyLen % sequence.length]
        break
      }

      case 'verse_chorus': {
        const sequence = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro']
        this.currentSection = sequence[historyLen % sequence.length]
        break
      }

      case 'sonata': {
        const sequence = ['exposition', 'development', 'recapitulation']
        this.currentSection = sequence[historyLen % sequence.length]
        break
      }

      case 'theme_and_variations': {
        const sequence = ['theme', 'var1', 'var2', 'var3']
        this.currentSection = sequence[historyLen % sequence.length]
        break
      }

      case 'through_composed': {
        const sequence = ['A', 'B', 'C']
        this.currentSection = sequence[historyLen % sequence.length]
        break
      }

      case 'strophic': {
        // Strophic: same section repeated
        this.currentSection = 'strophe'
        break
      }

      case 'build_drop': {
        const sequence = ['build', 'drop', 'breakdown']
        this.currentSection = sequence[historyLen % sequence.length]
        break
      }

      case 'modal': {
        const sequence = ['A', 'A', 'B', 'A']
        this.currentSection = sequence[historyLen % sequence.length]
        break
      }

      case 'rhythm_changes': {
        const sequence = ['A', 'A', 'B', 'A']
        this.currentSection = sequence[historyLen % sequence.length]
        break
      }

      case 'intro_verse_chorus_bridge_outro': {
        const sequence = ['intro', 'verse', 'chorus', 'bridge', 'outro']
        this.currentSection = sequence[historyLen % sequence.length]
        break
      }

      case 'blues': {
        this.currentSection = 'blues'
        break
      }

      default:
        this.currentSection = 'A'
    }

    return this.currentSection
  }

  updateMaterialLibrary(section) {
    // Add generated section to material library for future use
    this.materialLibrary.addMaterial({
      type: 'composition_section',
      content: section,
      section: this.currentSection,
      form: this.formStructure,
      timestamp: Date.now()
    })
  }

  createFallbackComposition() {
    // Create a simple fallback composition if something goes wrong
    // Entry #187: Use array format and milliseconds for frontend compatibility
    const tempo = 120
    const durationMs = 4 * 4 * (60000 / tempo)  // 4 bars * 4 beats * ms/beat = 8000ms
    return {
      type: 'ambient',
      texture: [
        { type: 'drone', note: 'C3', duration: durationMs, velocity: 0.2, articulation: 'legato' }
      ],
      progression: [{ chord: 'C', function: 'tonic', bars: 4 }],
      metadata: {
        tempo: 120,
        keyCenter: 'C',
        mode: 'ionian',
        fallback: true
      }
    }
  }

  // Public API methods
  setTempo(tempo) {
    this.tempo = Math.max(40, Math.min(200, tempo))
  }

  setKeyCenter(key, mode = 'ionian') {
    this.keyCenter = key
    this.mode = mode
    this.materialLibrary.setKeyCenter(key, mode)
    this.harmonicEngine.currentKey = key
    this.harmonicEngine.currentMode = mode
  }

  setComplexity(level) {
    this.complexityLevel = Math.max(0, Math.min(1, level))
  }

  getCompositionStats() {
    return {
      form: this.formStructure,
      currentSection: this.currentSection,
      sectionHistory: [...this.sectionHistory],
      developmentTechniques: this.developmentHistory.length,
      materialStats: this.materialLibrary.getStats()
    }
  }
}

module.exports = CompositionEngine