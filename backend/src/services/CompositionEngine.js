const CounterpointEngine = require('./CounterpointEngine')
const { PHI } = require('../utils/constants')

class CompositionEngine {
  constructor(materialLibrary, styleAnalyzer, harmonicEngine) {
    this.materialLibrary = materialLibrary
    this.styleAnalyzer = styleAnalyzer
    this.harmonicEngine = harmonicEngine
    this.counterpointEngine = new CounterpointEngine()

    // Form structure management
    this.formStructure = null     // ABA, rondo, sonata, verse-chorus, etc.
    this.currentSection = 'A'     // Current section label
    this.sectionHistory = []      // History of sections visited
    this.sectionLengths = {}      // Length of each section in bars

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

  compose(roomContext) {
    try {
// console.log(`🎼 CompositionEngine: Composing for room with ${roomContext.userCount || 1} users`)

      // 1. Analyze current musical context
      const currentStyle = this.styleAnalyzer.getCurrentStyle()
// console.log(`🎼 Current style: energy=${currentStyle.energy?.toFixed(2)}, tempo=${currentStyle.tempo}`)

      // 2. Determine or maintain form structure
      if (!this.formStructure) {
        this.formStructure = this.selectForm(currentStyle)
        this.initializeFormStructure(this.formStructure)
      }

      // 3. Get available musical material
      const availableMaterial = this.getAvailableMaterial(roomContext)
// console.log(`🎼 Available material: ${availableMaterial.length} items`)

      // 4. Generate current section
      const section = this.composeSection(this.currentSection, currentStyle, availableMaterial)

      // 5. Determine next section using form logic
      this.nextSection = this.getNextSection(this.formStructure)

      // 6. Update material library with new composition
      this.updateMaterialLibrary(section)

      // 7. Return complete composition
      return {
        type: section.type,
        structure: {
          form: this.formStructure,
          currentSection: this.currentSection,
          nextSection: this.nextSection,
          sectionHistory: [...this.sectionHistory]
        },
        content: section,
        metadata: {
          tempo: this.tempo,
          keyCenter: this.keyCenter,
          mode: this.mode,
          timeSignature: this.timeSignature,
          complexity: this.complexityLevel,
          timestamp: Date.now()
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
    const formsByEnergy = {
      classical: ['theme_and_variations', 'ABA', 'rondo', 'sonata'],
      electronic: ['through_composed', 'strophic', 'verse_chorus', 'build_drop'],
      jazz: ['modal', 'AABA', 'blues', 'rhythm_changes'],
      rock: ['strophic', 'AABA', 'verse_chorus', 'intro_verse_chorus_bridge_outro'],
      default: ['strophic', 'ABA', 'verse_chorus']
    }

    // Determine dominant genre
    let genre = 'default'
    if (genreWeights.classical > 0.7) genre = 'classical'
    else if (genreWeights.electronic > 0.7) genre = 'electronic'
    else if (genreWeights.jazz > 0.7) genre = 'jazz'
    else if (genreWeights.rock > 0.7) genre = 'rock'

    const forms = formsByEnergy[genre]

    // DETERMINISTIC: energy + time variation determines form
    // Golden ratio stepping on sectionHistory creates non-repeating sequences
    // WEIGHTING: Energy dominates (70%) for musical appropriateness, time provides drift (30%)
    const historyLength = this.sectionHistory?.length || 0
    const timeVariation = (historyLength * PHI) % 1
    const combinedIndex = energy * 0.7 + timeVariation * 0.3
    const index = Math.min(Math.floor(combinedIndex * forms.length), forms.length - 1)
    return forms[index]
  }

  initializeFormStructure(form) {
// console.log(`🎼 Initializing form structure: ${form}`)

    this.formStructure = form
    this.currentSection = 'A'
    this.sectionHistory = ['A']

    // Set section lengths based on form
    switch (form) {
      case 'ABA':
        this.sectionLengths = { 'A': 8, 'B': 8 }
        break
      case 'rondo':
        this.sectionLengths = { 'A': 4, 'B': 4, 'C': 4 }
        break
      case 'sonata':
        this.sectionLengths = { 'exposition': 16, 'development': 16, 'recapitulation': 16 }
        this.currentSection = 'exposition'
        break
      case 'AABA':
        this.sectionLengths = { 'A': 8, 'B': 8 }
        break
      case 'verse_chorus':
        this.sectionLengths = { 'verse': 8, 'chorus': 8, 'bridge': 8, 'intro': 4, 'outro': 4 }
        this.currentSection = 'intro'
        break
      case 'blues':
        this.sectionLengths = { 'blues': 12 }
        break
      default:
        this.sectionLengths = { 'A': 8 }
    }
  }

  getAvailableMaterial(roomContext) {
    // Get material from library and context
    const libraryMaterial = this.materialLibrary.getMaterialForSection(this.currentSection)
    const recentMaterial = this.materialLibrary.getRecentMaterial(roomContext.roomId)

    // Combine and prioritize
    const allMaterial = [...libraryMaterial, ...recentMaterial]

    // Sort by relevance and freshness
    return allMaterial.sort((a, b) => {
      const scoreA = this.calculateMaterialScore(a, roomContext)
      const scoreB = this.calculateMaterialScore(b, roomContext)
      return scoreB - scoreA
    }).slice(0, 5) // Use top 5 most relevant materials
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
    const progression = this.harmonicEngine.generateProgression(style, sectionLength)

    // Compose based on material availability and user count
    if (material.length > 1) {
      // Multi-user: create polyphonic texture
      return this.composePolyphonic(material, progression, style, sectionLength)
    } else if (material.length === 1) {
      // Single-user: elaborate material with accompaniment
      return this.composeMonophonic(material[0], progression, style, sectionLength)
    } else {
      // No material: generate ambient/sectional material
      return this.composeAmbient(progression, style, sectionLength)
    }
  }

  composePolyphonic(materials, progression, style, sectionLength) {
    // LIMIT to 4 voices max for clarity (melody, harmony, bass, pad)
    const maxVoices = Math.min(materials.length, 4)
    const selectedMaterials = materials.slice(0, maxVoices)

// console.log(`🎼 Composing polyphonic section with ${maxVoices} voices (from ${materials.length} materials)`)

    // Create voices for each material/user with DISTINCT ROLES
    const voices = selectedMaterials.map((material, i) => {
      const voice = this.counterpointEngine.createVoice(material, i, progression)
// console.log(`🎼   Voice ${i} (${voice.voiceRole}): ${voice.notes?.length || 0} notes, timbre=${voice.timbre}`)
      return {
        ...voice,
        materialId: material.id,
        userId: material.metadata.userId,
        pan: this.counterpointEngine.calculatePan(i, maxVoices)
      }
    })

    // Validate voice leading
    const validation = this.counterpointEngine.validateVoiceLeading(voices)
    if (!validation.isValid) {
// console.log(`🎼 Voice leading issues detected: ${validation.errors.length} errors`)
      // Apply corrections if needed
      this.correctVoiceLeading(voices, validation.errors)
    }

    return {
      type: 'polyphonic',
      voices,
      progression,
      validation,
      duration: sectionLength,
      texture: this.classifyTexture(voices)
    }
  }

  composeMonophonic(material, progression, style, sectionLength) {
// console.log(`🎼 Composing monophonic section from material ${material.id}`)

    // Elaborate the primary material
    const melody = this.elaborateMaterial(material, progression, sectionLength)

    // Generate accompaniment
    const accompaniment = this.generateAccompaniment(progression, style, sectionLength)

    return {
      type: 'homophonic',
      melody,
      accompaniment,
      progression,
      duration: sectionLength,
      materialId: material.id
    }
  }

  composeAmbient(progression, style, sectionLength) {
// console.log(`🎼 Composing ambient section (no material available)`)

    // Generate textural material based on style
    const texture = this.generateAmbientTexture(style, sectionLength)
// console.log(`🎼   Ambient texture: ${texture.layers.length} layers (static texture - minimal notes)`)

    return {
      type: 'ambient',
      texture,
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

  generateAccompaniment(progression, style, sectionLength) {
    // Generate accompaniment based on genre
    const genreWeights = style.genreWeights || {}

    if (genreWeights.jazz > 0.7) {
      return this.generateJazzComping(progression)
    } else if (genreWeights.electronic > 0.7) {
      return this.generateArpeggio(progression)
    } else if (genreWeights.rock > 0.7) {
      return this.generateRockGroove(progression)
    } else {
      return this.generateChordPads(progression)
    }
  }

  generateJazzComping(progression) {
    // Generate jazz-style comping with chord voicings
    return {
      type: 'jazz_comping',
      chords: progression.map(chord => ({
        ...chord,
        voicing: this.harmonicEngine.voiceLeadToChord(60, chord, null),
        rhythm: [1, 0.5, 1.5, 1], // Swing rhythm
        articulation: 'staccato'
      }))
    }
  }

  generateArpeggio(progression) {
    // Generate electronic-style arpeggios
    return {
      type: 'arpeggio',
      pattern: progression.map(chord => ({
        ...chord,
        notes: this.harmonicEngine.buildChord(chord.chord),
        rhythm: 0.25, // Sixteenth notes
        direction: 'up'
      }))
    }
  }

  generateRockGroove(progression) {
    // Generate rock-style groove
    return {
      type: 'rock_groove',
      chords: progression.map(chord => ({
        ...chord,
        rhythm: [0.5, 0.5, 1, 1], // Rock rhythm pattern
        powerChords: true
      }))
    }
  }

  generateChordPads(progression) {
    // Generate sustained chord pads
    return {
      type: 'chord_pads',
      chords: progression.map(chord => ({
        ...chord,
        duration: chord.bars * 4, // Whole bars
        sustain: true,
        fade: 'in_out'
      }))
    }
  }

  generateAmbientTexture(style, sectionLength) {
    // Generate ambient texture based on style
    return {
      type: 'ambient_texture',
      layers: [
        { type: 'drone', pitch: 60, duration: sectionLength, volume: 0.3 },
        { type: 'pad', pitches: [64, 67, 71], duration: sectionLength, volume: 0.2 },
        { type: 'texture', noise: 'pink', filter: 'lowpass', volume: 0.1 }
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
    // Move one voice to break parallelism
    const [voice1Index, voice2Index] = error.voices
    const voice1 = voices[voice1Index]
    const voice2 = voices[voice2Index]

    // Adjust the upper voice up by a semitone
    if (voice2.notes.length > 0) {
      voice2.notes[0].pitch += 1
    }
  }

  correctVoiceCrossing(voices, error) {
    // Swap voice assignments to fix crossing
    const crossingIndex = voices.findIndex(v => v.voiceType === error.lowerVoice)
    if (crossingIndex !== -1) {
      voices[crossingIndex].voiceType = error.upperVoice
      voices[crossingIndex].notes.forEach(note => {
        note.pitch += 12 // Move up an octave
      })
    }
  }

  correctExcessiveSpacing(voices, error) {
    // Move voices closer together
    const upperIndex = voices.findIndex(v => v.voiceType === error.upperVoice)
    if (upperIndex !== -1 && voices[upperIndex].notes.length > 0) {
      voices[upperIndex].notes[0].pitch -= 6 // Move down a tritone
    }
  }

  getNextSection(form) {
    this.sectionHistory.push(this.currentSection)

    switch (form) {
      case 'ABA':
        const abaSequence = ['A', 'B', 'A']
        const nextIndex = (this.sectionHistory.length - 1) % 3
        this.currentSection = abaSequence[nextIndex]
        break

      case 'rondo':
        const rondoSequence = ['A', 'B', 'A', 'C', 'A']
        const rondoIndex = (this.sectionHistory.length - 1) % 5
        this.currentSection = rondoSequence[rondoIndex]
        break

      case 'AABA':
        if (this.sectionHistory.filter(s => s === 'A').length < 2) {
          this.currentSection = 'A'
        } else if (this.sectionHistory.filter(s => s === 'B').length === 0) {
          this.currentSection = 'B'
        } else {
          this.currentSection = 'A'
        }
        break

      case 'verse_chorus':
        const vcSequence = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro']
        const vcIndex = (this.sectionHistory.length - 1) % 8
        this.currentSection = vcSequence[vcIndex]
        break

      case 'sonata':
        const sonataSequence = ['exposition', 'development', 'recapitulation']
        const sonataIndex = Math.min(2, Math.floor((this.sectionHistory.length - 1) / 2))
        this.currentSection = sonataSequence[sonataIndex]
        break

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
    return {
      type: 'ambient',
      texture: {
        type: 'ambient_texture',
        layers: [
          { type: 'drone', pitch: 60, duration: 4, volume: 0.2 }
        ]
      },
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