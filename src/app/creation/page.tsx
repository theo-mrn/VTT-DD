"use client"

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ChevronLeft, ChevronRight, Dice6, Check, Images, Upload, Dna, Swords, User, BookOpen, Search, Ghost, Shield, Heart, Zap, Crosshair, Sparkles, Brain } from 'lucide-react'
import Image from 'next/image'
import { db, auth, storage } from '@/lib/firebase'
import { doc, addDoc, collection, getDoc, setDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { onAuthStateChanged } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { RaceImageSelector } from '@/components/(personnages)/RaceImageSelector'
import CompetenceCreator, { Voie, CustomCompetence } from '@/components/(competences)/CompetenceCreator'



// Types
type RaceData = {
  description: string;
  image?: string;
  modificateurs?: Record<string, number>;
}

type ProfileData = {
  description: string;
  image?: string;
  hitDie: string;
}

// Load JSON data from public directory
async function fetchJson(path: string) {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Could not fetch ${path}`)
  }
  return response.json()
}

export default function CharacterCreationPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [raceData, setRaceData] = useState<Record<string, RaceData>>({})
  const [profileData, setProfileData] = useState<Record<string, ProfileData>>({})
  const [userId, setUserId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [baseStats, setBaseStats] = useState({
    FOR: 10,
    DEX: 10,
    CON: 10,
    INT: 10,
    SAG: 10,
    CHA: 10,
  })

  const [character, setCharacter] = useState({
    Nomperso: '',
    Nomjoueur: '',
    Race: '',
    Profile: '',
    deVie: 'd12',
    FOR: 10,
    DEX: 10,
    CON: 10,
    INT: 10,
    SAG: 10,
    CHA: 10,
    Defense: 10,
    PV: 0,
    Contact: 0,
    Distance: 0,
    Magie: 0,
    INIT: 10,
    imageURL: '',
    level: 1,
  })

  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [customImage, setCustomImage] = useState<string>('')
  const [isRaceImageSelectorOpen, setIsRaceImageSelectorOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'race' | 'profile'>('race')
  const [activeImageSource, setActiveImageSource] = useState<'race' | 'profile' | 'custom'>('race')

  // Competencies State
  const [characterVoies, setCharacterVoies] = useState<Voie[]>([])
  const [characterCustomCompetences, setCharacterCustomCompetences] = useState<CustomCompetence[]>([])

  const rollDie = (sides: number) => Math.floor(Math.random() * sides) + 1

  const calculateModifier = (value: number) => Math.floor((value - 10) / 2)

  const rollStats = () => {
    // Helper to generate one stat (3d6)
    const rollOne = () => Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6) + 3

    let stats: number[] = []
    let attempts = 0
    const MAX_ATTEMPTS = 5000

    // Loop until we find a valid set
    while (attempts < MAX_ATTEMPTS) {
      stats = [rollOne(), rollOne(), rollOne(), rollOne(), rollOne(), rollOne()]

      const evenCount = stats.filter(n => n % 2 === 0).length
      // Calculate modifier sum: (val - 10) / 2 rounded down
      const totalMod = stats.reduce((sum, val) => sum + Math.floor((val - 10) / 2), 0)

      // Criteria: 3 even (implies 3 odd) and Total Modifiers == 6
      if (evenCount === 3 && totalMod === 6) {
        break
      }
      attempts++
    }

    // Safety fallback only if really unlucky (should basically never happen with 5000 attempts)
    if (attempts >= MAX_ATTEMPTS) {
      // A known valid set: 14 (+2), 14 (+2), 14 (+2), 11 (0), 11 (0), 11 (0) -> Sum +6, 3 even, 3 odd
      stats = [14, 14, 14, 11, 11, 11]
    }

    const [FOR, DEX, CON, INT, SAG, CHA] = stats

    // Save base stats
    setBaseStats({ FOR, DEX, CON, INT, SAG, CHA })

    // Apply racial modifiers
    const raceMods = raceData[character.Race]?.modificateurs || {}
    const finalFOR = FOR + (raceMods.FOR || 0)
    const finalDEX = DEX + (raceMods.DEX || 0)
    const finalCON = CON + (raceMods.CON || 0)
    const finalINT = INT + (raceMods.INT || 0)
    const finalSAG = SAG + (raceMods.SAG || 0)
    const finalCHA = CHA + (raceMods.CHA || 0)

    setCharacter(prev => ({
      ...prev,
      FOR: finalFOR,
      DEX: finalDEX,
      CON: finalCON,
      INT: finalINT,
      SAG: finalSAG,
      CHA: finalCHA,
      Defense: 18 + calculateModifier(finalDEX), // Maintained user prefered base 18
      PV: 1 + calculateModifier(finalCON) + rollDie(parseInt((character as any).deVie.replace('d', ''))),
      Contact: 1 + calculateModifier(finalFOR),
      Distance: 1 + calculateModifier(finalDEX),
      Magie: 1 + calculateModifier(finalCHA),
      INIT: finalDEX,
    }))
  }

  useEffect(() => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid)
        const userDoc = await getDoc(doc(db, `users/${user.uid}`))
        if (userDoc.exists()) {
          const userData = userDoc.data()
          setRoomId(userData.room_id)
        }
      }
    })
  }, [])

  useEffect(() => {
    async function loadData() {
      try {
        const races = await fetchJson('/tabs/race.json')
        const profiles = await fetchJson('/tabs/profile.json')
        setRaceData(races)
        setProfileData(profiles)
      } catch (error) {
        console.error("Error loading data:", error)
      }
    }
    loadData()
  }, [])



  const handleCreateCharacter = async () => {
    if (!userId || !roomId) {
      console.error("User ID or Room ID is not set, cannot save character data.")
      return
    }

    try {
      let imageURL = character.imageURL

      // Handle uploaded custom image (base64)
      if (customImage && activeImageSource === 'custom') {
        // Convert base64 to blob
        const response = await fetch(customImage)
        const blob = await response.blob()
        const imageRef = ref(storage, `users/${userId}/characters/${character.Nomperso}-image`)
        await uploadBytes(imageRef, blob)
        imageURL = await getDownloadURL(imageRef)
      }
      // Handle file input (legacy, si encore utilisé)
      else if (selectedImage) {
        const imageRef = ref(storage, `users/${userId}/characters/${character.Nomperso}-image`)
        await uploadBytes(imageRef, selectedImage)
        imageURL = await getDownloadURL(imageRef)
      }

      // Calculate random height and weight based on race
      const raceInfo = raceData[character.Race];
      let taille = 175;
      let poids = 75;

      if (raceInfo) {
        // +/- 10% variation
        const heightVar = 0.9 + Math.random() * 0.2; // 0.9 to 1.1
        const weightVar = 0.9 + Math.random() * 0.2;

        // Use defaults if data missing in json (safety)
        const avgHeight = (raceInfo as any).tailleMoyenne || 175;
        const avgWeight = (raceInfo as any).poidsMoyen || 75;

        taille = Math.floor(avgHeight * heightVar);
        poids = Math.floor(avgWeight * weightVar);
      }

      // Prepare Voies data
      const voiesData: Record<string, any> = {};
      characterVoies.forEach((voie, index) => {
        voiesData[`Voie${index + 1}`] = voie.fichier;
        voiesData[`v${index + 1}`] = 0; // Initialize ranks to 0
      });

      // Save character data to Firestore with additional fields
      const characterData = {
        ...character,
        ...voiesData, // Add voies
        imageURL,
        type: 'joueurs',
        visibilityRadius: 150,
        x: 500,
        y: 500,
        PV_Max: character.PV,
        niveau: 1,
        Taille: taille,
        Poids: poids
      }

      await addDoc(collection(db, `users/${userId}/characters`), characterData)

      const docRef = await addDoc(collection(db, `cartes/${roomId}/characters`), characterData)

      // Save Custom Competences if any
      if (characterCustomCompetences.length > 0) {
        const customCompsRef = collection(db, `cartes/${roomId}/characters/${docRef.id}/customCompetences`);
        const savePromises = characterCustomCompetences.map(cc => {
          const ccRef = doc(customCompsRef, `${cc.voieIndex}-${cc.slotIndex}`);
          return setDoc(ccRef, cc);
        });
        await Promise.all(savePromises);
      }

      // Update user's current character ID
      await setDoc(doc(db, 'users', userId), { persoId: docRef.id }, { merge: true })
      // Redirect to /map after successful creation (change page)
      router.push(`/${roomId}/map`)
    } catch (error) {
      console.error("Error creating character:", error)
    }
  }


  const nextStep = useCallback(() => setStep(prev => Math.min(prev + 1, 3)), [])
  const prevStep = useCallback(() => setStep(prev => Math.max(prev - 1, 0)), [])

  const renderBasicInfo = useCallback(() => (
    <div className="space-y-4">
      <Input
        placeholder="Nom du personnage"
        value={character.Nomperso}
        onChange={(e) => setCharacter(prev => ({ ...prev, Nomperso: e.target.value }))}
      />
      <Input
        placeholder="Nom du joueur"
        value={character.Nomjoueur}
        onChange={(e) => setCharacter(prev => ({ ...prev, Nomjoueur: e.target.value }))}
      />
    </div>
  ), [character.Nomperso, character.Nomjoueur])

  // Helper to get preview image based on active source
  const getPreviewImage = useCallback(() => {
    // Custom image always takes priority when explicitly selected
    if (activeImageSource === 'custom' && customImage) return customImage

    // For race source: prioritize gallery-selected image over default
    if (activeImageSource === 'race') {
      // If an image was selected from gallery, it's stored in character.imageURL
      if (character.imageURL) return character.imageURL
      // Otherwise fall back to default race image
      if (character.Race && raceData[character.Race]?.image) return raceData[character.Race].image
    }

    // For profile source: use profile's default image
    if (activeImageSource === 'profile' && character.Profile && profileData[character.Profile]?.image)
      return profileData[character.Profile].image

    // Fallback hierarchy
    if (customImage) return customImage
    if (character.imageURL) return character.imageURL
    if (character.Race && raceData[character.Race]?.image) return raceData[character.Race].image
    if (character.Profile && profileData[character.Profile]?.image) return profileData[character.Profile].image

    return ''
  }, [activeImageSource, customImage, character.Race, character.Profile, character.imageURL, raceData, profileData])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setCustomImage(reader.result as string)
        setActiveImageSource('custom')
      }
      reader.readAsDataURL(file)
    }
  }

  const renderSelectionPanel = useCallback(() => {
    const selectRace = (raceName: string) => {
      const currentRace = raceData[raceName]
      const mods = currentRace.modificateurs || {}

      setCharacter(prev => ({
        ...prev,
        Race: raceName,
        FOR: baseStats.FOR + (mods.FOR || 0),
        DEX: baseStats.DEX + (mods.DEX || 0),
        CON: baseStats.CON + (mods.CON || 0),
        INT: baseStats.INT + (mods.INT || 0),
        SAG: baseStats.SAG + (mods.SAG || 0),
        CHA: baseStats.CHA + (mods.CHA || 0),
      }))
      setActiveImageSource('race')
      setIsRaceImageSelectorOpen(true)
    }

    const selectProfile = (profileName: string) => {
      const currentProfile = profileData[profileName]
      setCharacter(prev => ({
        ...prev,
        Profile: profileName,
        deVie: currentProfile.hitDie,
      }))
      if (activeImageSource !== 'custom') {
        setActiveImageSource('profile')
      }
    }

    return (
      <div className="flex w-full h-[85vh] bg-[#09090b] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden">
        {/* LEFT PANEL - Browser */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0c0c0e]">
          {/* Header */}
          <div className="p-6 border-b border-[#2a2a2a] bg-[#121214] flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#c0a080]/10 rounded-lg border border-[#c0a080]/20 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-[#c0a080]" />
              </div>
              <div>
                <h1 className="text-2xl font-serif font-bold text-[#e4e4e7] tracking-tight">Création de Personnage</h1>
                <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium">Étape 1: Race et Classe</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-[#18181b] p-1 rounded-lg border border-[#27272a]">
              <button
                onClick={() => setActiveTab('race')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'race' ? 'bg-[#c0a080] text-[#09090b] shadow-md' : 'text-zinc-500 hover:text-zinc-200'
                  }`}
              >
                Races
              </button>
              <button
                onClick={() => setActiveTab('profile')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'profile' ? 'bg-[#c0a080] text-[#09090b] shadow-md' : 'text-zinc-500 hover:text-zinc-200'
                  }`}
              >
                Classes
              </button>
            </div>
          </div>

          {/* Selection Summary Bar */}
          <div className="px-6 py-2 border-b border-[#2a2a2a] bg-[#0f0f11] flex items-center gap-4 text-xs text-zinc-500 h-10">
            {character.Race ? (
              <span className="flex items-center gap-1 text-zinc-300 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                Race: {character.Race.replace('_', ' ')}
              </span>
            ) : null}

            {character.Profile ? (
              <span className="flex items-center gap-1 text-zinc-300 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                Classe: {character.Profile}
              </span>
            ) : null}

            {!character.Race && !character.Profile && (
              <span>Sélectionnez une race et une classe pour votre personnage</span>
            )}
          </div>

          {/* Content Grid */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5">
              {activeTab === 'race'
                ? Object.entries(raceData).map(([raceName, race]) => {
                  const isSelected = character.Race === raceName
                  return (
                    <div
                      key={raceName}
                      onClick={() => selectRace(raceName)}
                      className={`
                          group relative flex flex-col aspect-[3/4] rounded-xl overflow-hidden cursor-pointer transition-all duration-300
                          border
                          ${isSelected
                          ? 'border-[#c0a080] ring-1 ring-[#c0a080] scale-[1.02] shadow-[0_0_20px_rgba(192,160,128,0.2)]'
                          : 'border-[#27272a] hover:border-[#52525b] hover:shadow-xl opacity-80 hover:opacity-100'
                        }
                        `}
                    >
                      {/* Image Layer */}
                      <div className="absolute inset-0 bg-[#1a1a1a]">
                        {race.image && (
                          <img
                            src={race.image}
                            alt={raceName}
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                      </div>

                      {/* Content Layer */}
                      <div className="relative flex-1 flex flex-col justify-end p-4">
                        <h3 className={`font-serif text-lg font-bold leading-none mb-2 ${isSelected ? 'text-[#c0a080]' : 'text-zinc-200 group-hover:text-white'}`}>
                          {raceName.replace('_', ' ')}
                        </h3>

                        {/* Footer with mods */}
                        <div className="flex gap-1">
                          {Object.entries(race.modificateurs || {}).slice(0, 2).map(([k, v]) => (
                            <span key={k} className="text-[10px] bg-white/10 px-1 rounded">{k} {(v as number) > 0 ? '+' : ''}{v as number}</span>
                          ))}
                        </div>
                      </div>

                      {/* Selection Indicator */}
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-6 h-6 bg-[#c0a080] rounded-full flex items-center justify-center shadow-lg">
                          <Check className="w-4 h-4 text-black" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                  )
                })
                : Object.entries(profileData).map(([profileName, profile]) => {
                  const isSelected = character.Profile === profileName
                  return (
                    <div
                      key={profileName}
                      onClick={() => selectProfile(profileName)}
                      className={`
                          group relative flex flex-col aspect-[3/4] rounded-xl overflow-hidden cursor-pointer transition-all duration-300
                          border
                          ${isSelected
                          ? 'border-[#c0a080] ring-1 ring-[#c0a080] scale-[1.02] shadow-[0_0_20px_rgba(192,160,128,0.2)]'
                          : 'border-[#27272a] hover:border-[#52525b] hover:shadow-xl opacity-80 hover:opacity-100'
                        }
                        `}
                    >
                      {/* Image Layer */}
                      <div className="absolute inset-0 bg-[#1a1a1a]">
                        {profile.image && (
                          <img
                            src={profile.image}
                            alt={profileName}
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                      </div>

                      {/* Content Layer */}
                      <div className="relative flex-1 flex flex-col justify-end p-4">
                        <h3 className={`font-serif text-lg font-bold leading-none mb-2 ${isSelected ? 'text-[#c0a080]' : 'text-zinc-200 group-hover:text-white'}`}>
                          {profileName}
                        </h3>

                        {/* Footer */}
                        <span className="text-xs text-red-300">DV: {profile.hitDie}</span>
                      </div>

                      {/* Selection Indicator */}
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-6 h-6 bg-[#c0a080] rounded-full flex items-center justify-center shadow-lg">
                          <Check className="w-4 h-4 text-black" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                  )
                })
              }
            </div>
          </div>
        </div>

        {/* RIGHT PANEL - Preview */}
        <div className="w-[420px] border-l border-[#2a2a2a] bg-[#121212] flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-10 relative">
          <div className="flex-1 overflow-y-auto custom-scrollbar relative">
            {/* Portrait Header */}
            <div className="relative h-[400px] bg-black group overflow-hidden border-b border-[#2a2a2a]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-black opacity-30" />
              {getPreviewImage() ? (
                <img src={getPreviewImage()} className="w-full h-full object-cover object-top" alt="Preview" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#151515]">
                  <User className="w-20 h-20 text-[#333]" strokeWidth={1} />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/60 to-transparent pointer-events-none z-20" />

              {/* Image Source Buttons */}
              {((character.Race || character.Profile) || customImage) && (
                <div className="absolute top-4 left-4 z-20 flex gap-2 bg-black/60 backdrop-blur-md p-1.5 rounded-full border border-white/10">
                  {character.Race && (
                    <button
                      onClick={() => setActiveImageSource('race')}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${activeImageSource === 'race' ? 'bg-[#c0a080] text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                        }`}
                      title="Image de Race"
                    >
                      <Dna className="w-4 h-4" />
                    </button>
                  )}
                  {character.Profile && (
                    <button
                      onClick={() => setActiveImageSource('profile')}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${activeImageSource === 'profile' ? 'bg-[#c0a080] text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                        }`}
                      title="Image de Classe"
                    >
                      <Swords className="w-4 h-4" />
                    </button>
                  )}
                  {customImage && activeImageSource === 'custom' && (
                    <button
                      onClick={() => setActiveImageSource('custom')}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${activeImageSource === 'custom' ? 'bg-[#c0a080] text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-white/10'
                        }`}
                      title="Image Personnalisée"
                    >
                      <User className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Interactive Controls */}
            <div className="px-6 py-4 space-y-4">
              <label className="bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-[#c0a080]/50 transition-colors group">
                <Upload className="w-4 h-4 text-zinc-500 group-hover:text-[#c0a080] mb-1" />
                <span className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider group-hover:text-zinc-300">Image Personnalisée</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>

            {/* Stats & Info */}
            <div className="px-6 pb-24 space-y-6">
              {/* Description */}
              {(character.Race || character.Profile) && (
                <div className="prose prose-invert prose-sm">
                  {character.Race && raceData[character.Race] && (
                    <div className="mb-4">
                      <h4 className="text-[#c0a080] text-sm font-bold mb-1">{character.Race.replace('_', ' ')}</h4>
                      <p className="text-zinc-400 text-xs leading-relaxed">{raceData[character.Race].description}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(raceData[character.Race].modificateurs || {}).map(([stat, mod]) => (
                          <span key={stat} className="text-[10px] bg-[#c0a080]/10 px-2 py-0.5 rounded border border-[#c0a080]/30 text-[#c0a080]">
                            {stat} {(mod as number) > 0 ? '+' : ''}{mod as number}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {character.Profile && profileData[character.Profile] && (
                    <div>
                      <h4 className="text-[#c0a080] text-sm font-bold mb-1">{character.Profile}</h4>
                      <p className="text-zinc-400 text-xs leading-relaxed">{profileData[character.Profile].description}</p>
                      <p className="text-red-300 text-xs mt-2">Dé de vie: {profileData[character.Profile].hitDie}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-[#2a2a2a] bg-[#121212] flex gap-3 z-20">
            <button onClick={prevStep} className="px-6 py-3 rounded-xl border border-[#333] text-zinc-400 hover:text-white hover:bg-[#222] font-medium text-sm transition-colors">
              Précédent
            </button>
            <button
              onClick={nextStep}
              disabled={!character.Race || !character.Profile}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-bold tracking-wide transition-all ${character.Race && character.Profile
                ? 'bg-[#c0a080] hover:bg-[#e0c0a0] text-black shadow-lg shadow-[#c0a080]/10'
                : 'bg-[#1a1a1a] text-zinc-600 cursor-not-allowed border border-[#2a2a2a]'
                }`}
            >
              <span>Suivant</span>
            </button>
          </div>
        </div>
      </div>
    )
  }, [activeTab, character.Race, character.Profile, raceData, profileData, getPreviewImage, activeImageSource, customImage, baseStats])


  const renderStatsSelection = useCallback(() => {
    // Calculate global stats for verification
    const totalBaseMods = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].reduce((sum, stat) => {
      const baseVal = baseStats[stat as keyof typeof baseStats]
      return sum + calculateModifier(baseVal)
    }, 0)

    const StatCard = ({ label, statKey, icon: Icon }: { label: string, statKey: string, icon: any }) => {
      const baseVal = baseStats[statKey as keyof typeof baseStats]
      const raceMod = (raceData[character.Race]?.modificateurs as any)?.[statKey] || 0
      const finalVal = character[statKey as keyof typeof character] as number
      const finalMod = calculateModifier(finalVal)

      return (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 flex flex-col items-center relative overflow-hidden group hover:border-[#c0a080]/50 transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          {/* Header */}
          <div className="flex items-center gap-2 mb-3 z-10">
            <div className="p-1.5 rounded-lg bg-[#27272a] text-[#c0a080]">
              <Icon className="w-4 h-4" />
            </div>
            <span className="font-serif font-bold text-zinc-200 tracking-wide">{label}</span>
          </div>

          {/* Main Number (Modifier) */}
          <div className="relative z-10 flex flex-col items-center mb-4">
            <span className="text-4xl font-bold text-white tracking-tight flex items-center gap-1 shadow-black drop-shadow-lg">
              {finalMod > 0 ? '+' : ''}{finalMod}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[#c0a080]">Modificateur</span>
          </div>

          {/* Footer (Calculation) */}
          <div className="w-full pt-3 border-t border-[#27272a] flex justify-between items-center text-xs z-10">
            <div className="flex flex-col items-center">
              <span className="text-zinc-500">Base</span>
              <span className="font-mono text-zinc-300">{baseVal}</span>
            </div>
            <div className="text-zinc-600">+</div>
            <div className="flex flex-col items-center">
              <span className="text-zinc-500">Race</span>
              <span className={`font-mono ${raceMod !== 0 ? 'text-[#c0a080]' : 'text-zinc-600'}`}>
                {raceMod > 0 ? '+' : ''}{raceMod}
              </span>
            </div>
            <div className="text-zinc-600">=</div>
            <div className="flex flex-col items-center px-2 py-0.5 rounded bg-[#27272a]">
              <span className="text-zinc-500 text-[10px]">Score</span>
              <span className="font-mono font-bold text-white">{finalVal}</span>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="w-full h-full flex flex-col gap-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-end gap-6 bg-[#121212] p-6 rounded-2xl border border-[#27272a] shrink-0">
          <div>
            <h2 className="text-2xl font-serif font-bold text-[#e4e4e7] mb-2">Caractéristiques</h2>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Button
              onClick={rollStats}
              className="bg-[#c0a080] text-[#09090b] hover:bg-[#d0b090] border-none font-bold shadow-lg shadow-[#c0a080]/20 transition-all transform hover:scale-105 active:scale-95"
            >
              <Dice6 className="mr-2 h-4 w-4" />
              Lancer les dés
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard label="FORCE" statKey="FOR" icon={Swords} />
          <StatCard label="DEXTÉRITÉ" statKey="DEX" icon={Ghost} />
          <StatCard label="CONST." statKey="CON" icon={Heart} />
          <StatCard label="INTELL." statKey="INT" icon={Brain} />
          <StatCard label="SAGESSE" statKey="SAG" icon={BookOpen} />
          <StatCard label="CHARISME" statKey="CHA" icon={Sparkles} />
        </div>

        {/* Derived Stats Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Defense & Vitality */}
          <div className="bg-[#121212] rounded-2xl border border-[#27272a] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#27272a] bg-[#18181b] flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#c0a080]" />
              <h3 className="font-serif font-bold text-zinc-200">Défense & Vitalité</h3>
            </div>
            <div className="p-6 grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-[#18181b] rounded-xl border border-[#27272a]">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Défense</div>
                <div className="text-2xl font-bold text-white">{character.Defense}</div>
              </div>
              <div className="text-center p-3 bg-[#18181b] rounded-xl border border-[#27272a]">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">PV Max</div>
                <div className="text-2xl font-bold text-emerald-400">{character.PV}</div>
              </div>
              <div className="text-center p-3 bg-[#18181b] rounded-xl border border-[#27272a]">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Init</div>
                <div className="text-2xl font-bold text-amber-400">{character.INIT}</div>
              </div>
            </div>
          </div>

          {/* Combat Stats */}
          <div className="lg:col-span-2 bg-[#121212] rounded-2xl border border-[#27272a] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#27272a] bg-[#18181b] flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-[#c0a080]" />
              <h3 className="font-serif font-bold text-zinc-200">Bonus d'Attaque</h3>
            </div>
            <div className="p-6 grid grid-cols-3 gap-6">
              <div className="flex items-center gap-4 p-3 rounded-xl bg-[#18181b] border border-[#27272a]">
                <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                  <Swords className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <div className="text-xs text-zinc-500 uppercase">Contact</div>
                  <div className="text-xl font-bold text-white">+{character.Contact}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 rounded-xl bg-[#18181b] border border-[#27272a]">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <Crosshair className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-xs text-zinc-500 uppercase">Distance</div>
                  <div className="text-xl font-bold text-white">+{character.Distance}</div>
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 rounded-xl bg-[#18181b] border border-[#27272a]">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <div className="text-xs text-zinc-500 uppercase">Magie</div>
                  <div className="text-xl font-bold text-white">+{character.Magie}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-8 border-t border-[#2a2a2a]">
          <Button
            onClick={prevStep}
            variant="outline"
            className="border-[#333] text-zinc-400 hover:text-white hover:bg-[#222]"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Précédent
          </Button>
          <Button
            onClick={handleCreateCharacter}
            className="bg-[#c0a080] hover:bg-[#e0c0a0] text-black font-bold px-8 py-6 rounded-xl shadow-lg shadow-[#c0a080]/20"
          >
            Créer le personnage
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    )
  }, [character, baseStats, raceData])


  if (!userId) return <p>Loading...</p>

  return (
    <div className="flex items-center justify-center min-h-screen py-8 bg-background">
      <Card className={`w-full mx-auto transition-all duration-300 ${step >= 1 ? 'max-w-[95vw]' : 'max-w-4xl'}`}>
        <CardHeader>
          <CardTitle>Création de personnage</CardTitle>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -50 }}
              transition={{ duration: 0.3 }}
            >
              {step === 0 && (
                <div>
                  {renderBasicInfo()}
                  <div className="flex justify-end mt-6">
                    <Button onClick={nextStep}>Suivant</Button>
                  </div>
                </div>
              )}
              {step === 1 && renderSelectionPanel()}
              {step === 2 && (
                <CompetenceCreator
                  initialProfile={character.Profile}
                  initialRace={character.Race}
                  onVoiesChange={(voies, customComps) => {
                    setCharacterVoies(voies);
                    setCharacterCustomCompetences(customComps);
                  }}
                />
              )}
              {step === 3 && renderStatsSelection()}

              {/* Navigation buttons for Step 2 */}
              {step === 2 && (
                <div className="flex justify-between pt-6 max-w-5xl mx-auto w-full">
                  <Button onClick={prevStep} variant="outline">Précédent</Button>
                  <Button onClick={nextStep}>Suivant</Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Race Image Selector Modal */}
      {character.Race && (
        <RaceImageSelector
          isOpen={isRaceImageSelectorOpen}
          onClose={() => setIsRaceImageSelectorOpen(false)}
          onSelectImage={(imageUrl) => {
            setCharacter(prev => ({ ...prev, imageURL: imageUrl }))
            setImagePreview(imageUrl)
          }}
          raceName={character.Race}
          currentImage={character.imageURL}
          raceDefaultImage={raceData[character.Race]?.image}
        />
      )}
    </div>
  )
}
