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
import InventoryManagement from '@/components/(inventaire)/inventaire2'
import CompetenceCreator, { Voie, CustomCompetence } from '@/components/(competences)/CompetenceCreator'
import { toast } from 'sonner'



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
  const [currentTab, setCurrentTab] = useState<'info' | 'race' | 'profile' | 'competences' | 'stats' | 'inventory' | 'image'>('info')
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
    Description: '',
    Background: '',
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
    Taille: 175,
    Poids: 75,
  })

  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [customImage, setCustomImage] = useState<string>('')
  const [activeImageSource, setActiveImageSource] = useState<'race' | 'profile' | 'custom'>('custom')

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
        const [races, profiles, mappings] = await Promise.all([
          fetchJson('/tabs/race.json'),
          fetchJson('/tabs/profile.json'),
          fetchJson('/asset-mappings.json')
        ])

        // Create a lookup map: localPath -> remotePath
        const urlMap = new Map<string, string>();
        mappings.forEach((m: any) => {
          if (m.localPath && m.path) {
            urlMap.set(m.localPath, m.path);
          }
        });

        const resolveImage = (localPath: string) => {
          if (!localPath) return localPath;
          return urlMap.get(localPath) || localPath;
        };

        // Update races with remote images
        const updatedRaces = { ...races };
        Object.keys(updatedRaces).forEach(key => {
          if (updatedRaces[key].image) {
            updatedRaces[key].image = resolveImage(updatedRaces[key].image);
          }
        });

        // Update profiles with remote images
        const updatedProfiles = { ...profiles };
        Object.keys(updatedProfiles).forEach(key => {
          if (updatedProfiles[key].image) {
            updatedProfiles[key].image = resolveImage(updatedProfiles[key].image);
          }
        });

        setRaceData(updatedRaces)
        setProfileData(updatedProfiles)
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

      // (Height/Weight now managed in state)


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
        // Taille & Poids already in character object, but ensuring they are numbers
        Taille: Number(character.Taille),
        Poids: Number(character.Poids)
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
      toast.success("Personnage créé avec succès !")
      router.push(`/${roomId}/map`)
    } catch (error) {
      console.error("Error creating character:", error)
    }
  }


  const tabsOrder = ['info', 'race', 'profile', 'competences', 'stats', 'inventory', 'image'] as const;
  const nextStep = useCallback(() => {
    setCurrentTab(prev => {
      const idx = tabsOrder.indexOf(prev);
      if (idx < tabsOrder.length - 1) return tabsOrder[idx + 1];
      return prev;
    })
  }, [])
  const prevStep = useCallback(() => {
    setCurrentTab(prev => {
      const idx = tabsOrder.indexOf(prev);
      if (idx > 0) return tabsOrder[idx - 1];
      return prev;
    })
  }, [])

  const renderBasicInfo = useCallback(() => (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-zinc-400 text-xs uppercase tracking-wider">Nom du personnage</Label>
        <Input
          placeholder="Ex: Alagarth de Viveflamme"
          value={character.Nomperso}
          onChange={(e) => setCharacter(prev => ({ ...prev, Nomperso: e.target.value }))}
          className="bg-[#121212] border-[#333] text-white focus:border-[#c0a080]"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-400 text-xs uppercase tracking-wider">Description physique</Label>
        <textarea
          placeholder="Apparence, signes distinctifs, particularités..."
          value={(character as any).Description || ''}
          onChange={(e) => setCharacter(prev => ({ ...prev, Description: e.target.value }))}
          className="w-full min-h-[100px] p-3 rounded-md bg-[#121212] border border-[#333] text-white focus:border-[#c0a080] focus:ring-1 focus:ring-[#c0a080] outline-none transition-all custom-scrollbar resize-y text-sm"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-400 text-xs uppercase tracking-wider">Histoire (Background)</Label>
        <textarea
          placeholder="Origine, motivations, événements marquants..."
          value={(character as any).Background || ''}
          onChange={(e) => setCharacter(prev => ({ ...prev, Background: e.target.value }))}
          className="w-full min-h-[180px] p-3 rounded-md bg-[#121212] border border-[#333] text-white focus:border-[#c0a080] focus:ring-1 focus:ring-[#c0a080] outline-none transition-all custom-scrollbar resize-y text-sm"
        />
      </div>
    </div>
  ), [character.Nomperso, (character as any).Description, (character as any).Background])

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

      // Calculate default height/weight based on race average
      const avgHeight = (currentRace as any).tailleMoyenne || 175;
      const avgWeight = (currentRace as any).poidsMoyen || 75;

      setCharacter(prev => ({
        ...prev,
        Race: raceName,
        FOR: baseStats.FOR + (mods.FOR || 0),
        DEX: baseStats.DEX + (mods.DEX || 0),
        CON: baseStats.CON + (mods.CON || 0),
        INT: baseStats.INT + (mods.INT || 0),
        SAG: baseStats.SAG + (mods.SAG || 0),
        CHA: baseStats.CHA + (mods.CHA || 0),
        Taille: avgHeight,
        Poids: avgWeight,
      }))
      setActiveImageSource('race')
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
      <div className="flex w-full h-[85vh] bg-[#09090b] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden mt-2">
        {/* LEFT PANEL - Browser */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0c0c0e]">
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
              {currentTab === 'race'
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
            <Button onClick={prevStep} variant="outline" className="border-[#333] text-zinc-400 hover:text-white">
              <ChevronLeft className="mr-2 w-4 h-4" /> Précédent
            </Button>
            <Button
              onClick={nextStep}
              disabled={!character.Race || !character.Profile}
              className={`flex-1 font-bold transition-all ${character.Race && character.Profile ? 'bg-[#c0a080] hover:bg-[#e0c0a0] text-black shadow-lg' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
            >
              Suivant <ChevronRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    )
  }, [currentTab, character.Race, character.Profile, raceData, profileData, getPreviewImage, activeImageSource, customImage, baseStats])


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
            <div className="px-6 py-4 border-b border-[#27272a] bg-[#18181b] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-[#c0a080]" />
                <h3 className="font-serif font-bold text-zinc-200">Bonus d'Attaque & Physionomie</h3>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Attack Column */}
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-3 rounded-xl bg-[#18181b] border border-[#27272a]">
                  <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                    <Swords className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 uppercase">Contact</div>
                    <div className="text-xl font-bold text-white">{character.Contact >= 0 ? '+' : ''}{character.Contact}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-3 rounded-xl bg-[#18181b] border border-[#27272a]">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                    <Crosshair className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 uppercase">Distance</div>
                    <div className="text-xl font-bold text-white">{character.Distance >= 0 ? '+' : ''}{character.Distance}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-3 rounded-xl bg-[#18181b] border border-[#27272a]">
                  <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500 uppercase">Magie</div>
                    <div className="text-xl font-bold text-white">{character.Magie >= 0 ? '+' : ''}{character.Magie}</div>
                  </div>
                </div>
              </div>

              {/* Physionomie Column */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#18181b] border border-[#27272a] flex flex-col gap-2">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Taille (cm)</Label>
                  <Input
                    type="number"
                    value={character.Taille}
                    onChange={(e) => setCharacter(prev => ({ ...prev, Taille: Number(e.target.value) }))}
                    className="bg-[#121212] border-[#333] text-white focus:border-[#c0a080]"
                  />
                </div>
                <div className="p-4 rounded-xl bg-[#18181b] border border-[#27272a] flex flex-col gap-2">
                  <Label className="text-zinc-400 text-xs uppercase tracking-wider">Poids (kg)</Label>
                  <Input
                    type="number"
                    value={character.Poids}
                    onChange={(e) => setCharacter(prev => ({ ...prev, Poids: Number(e.target.value) }))}
                    className="bg-[#121212] border-[#333] text-white focus:border-[#c0a080]"
                  />
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
            onClick={nextStep}
            disabled={!character.Race || !character.Profile}
            className={`font-bold px-8 py-6 rounded-xl shadow-lg transition-all ${character.Race && character.Profile ? 'bg-[#c0a080] hover:bg-[#e0c0a0] text-black shadow-[#c0a080]/20' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
          >
            Suivant
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    )
  }, [character, baseStats, raceData])


  if (!userId) return <p>Loading...</p>

  const tabsList = [
    { id: 'info', label: 'INFORMATIONS', icon: User },
    { id: 'race', label: 'ESPÈCE', icon: Dna },
    { id: 'profile', label: 'PROFIL', icon: Swords },
    { id: 'competences', label: 'COMPÉTENCES', icon: Zap },
    { id: 'stats', label: 'CARACTÉRISTIQUES', icon: Dice6 },
    { id: 'inventory', label: 'INVENTAIRE', icon: BookOpen },
    { id: 'image', label: 'PORTRAIT', icon: Images }
  ] as const;

  return (
    <div className="flex flex-col items-center min-h-screen py-8 bg-background">
      {/* Top Navigation Tabs */}
      <div className="w-full max-w-[95vw] px-6 mb-8 mt-4">
        <div className="flex items-center justify-evenly relative pb-2 mx-auto max-w-4xl">
          <div className="absolute left-0 right-0 h-px bg-[#2a2a2a] bottom-0 z-0" />
          {tabsList.map((tab) => {
            const isActive = currentTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id as any)}
                className={`relative z-10 flex flex-col items-center gap-2 pb-3 px-8 transition-colors ${isActive ? 'text-[#c0a080]' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
              >
                <Icon className={`w-6 h-6 ${isActive ? 'text-white' : ''}`} />
                <span className={`text-xs font-bold tracking-widest ${isActive ? 'text-white' : ''}`}>{tab.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#c0a080] rounded-t-sm"
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className={`w-full mx-auto transition-all duration-300 ${currentTab === 'info' ? 'max-w-4xl' : 'max-w-[95vw]'}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
          >
            {currentTab === 'info' && (
              <Card className="bg-[#09090b] border-[#2a2a2a] rounded-2xl max-w-4xl mx-auto">
                <CardHeader>
                  <CardTitle className="text-2xl font-serif text-[#e4e4e7]">Informations de base</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {renderBasicInfo()}
                  <div className="flex justify-between mt-6">
                    <Button onClick={prevStep} variant="outline" className="border-[#333] text-zinc-400 hover:text-white"><ChevronLeft className="mr-2 w-4 h-4" /> Précédent</Button>
                    <Button
                      onClick={nextStep}
                      disabled={!character.Race || !character.Profile}
                      className={`font-bold transition-all ${character.Race && character.Profile ? 'bg-[#c0a080] text-black hover:bg-[#d0b090]' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
                    >
                      Suivant <ChevronRight className="ml-2 w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {(currentTab === 'race' || currentTab === 'profile') && renderSelectionPanel()}
            {currentTab === 'competences' && (
              <div className="bg-[#09090b] border border-[#2a2a2a] rounded-2xl p-6 shadow-2xl mt-2">
                <CompetenceCreator
                  initialProfile={character.Profile}
                  initialRace={character.Race}
                  onVoiesChange={(voies, customComps) => {
                    setCharacterVoies(voies);
                    setCharacterCustomCompetences(customComps);
                  }}
                />
                <div className="flex justify-between pt-6 max-w-5xl mx-auto w-full mt-4 border-t border-[#2a2a2a]">
                  <Button onClick={prevStep} variant="outline" className="border-[#333] text-zinc-400 hover:text-white"><ChevronLeft className="mr-2 w-4 h-4" /> Précédent</Button>
                  <Button
                    onClick={nextStep}
                    disabled={!character.Race || !character.Profile}
                    className={`font-bold transition-all ${character.Race && character.Profile ? 'bg-[#c0a080] text-black hover:bg-[#d0b090]' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
                  >
                    Suivant <ChevronRight className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
            {currentTab === 'stats' && renderStatsSelection()}
            {currentTab === 'inventory' && (
              <div className="bg-[#09090b] border border-[#2a2a2a] rounded-2xl p-6 shadow-2xl mt-2 h-[85vh] flex flex-col">
                <div className="flex-1 overflow-hidden">
                  {character.Nomperso ? (
                    <InventoryManagement
                      playerName={character.Nomperso}
                      roomId={roomId || 'creation'}
                      canEdit={true}
                    />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-[#121212] rounded-xl border border-[#2a2a2a]">
                      <BookOpen className="w-16 h-16 text-zinc-600 mb-4" />
                      <h3 className="text-xl font-serif text-[#e4e4e7] mb-2">Nom du personnage manquant</h3>
                      <p className="text-zinc-500 max-w-md">L'inventaire est lié à votre nom de personnage. Veuillez retourner à l'onglet "INFORMATIONS" pour définir un nom avant de gérer votre équipement.</p>
                      <Button onClick={() => setCurrentTab('info')} className="mt-6 bg-[#c0a080] text-black hover:bg-[#d0b090] font-bold">Retour aux informations</Button>
                    </div>
                  )}
                </div>
                <div className="flex justify-between pt-6 max-w-5xl mx-auto w-full mt-4 border-t border-[#2a2a2a] shrink-0">
                  <Button onClick={prevStep} variant="outline" className="border-[#333] text-zinc-400 hover:text-white"><ChevronLeft className="mr-2 w-4 h-4" /> Précédent</Button>
                  <Button
                    onClick={nextStep}
                    disabled={!character.Race || !character.Profile}
                    className={`font-bold transition-all ${character.Race && character.Profile ? 'bg-[#c0a080] text-black hover:bg-[#d0b090]' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
                  >
                    Suivant <ChevronRight className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
            {currentTab === 'image' && (
              <Card className="bg-[#09090b] border-[#2a2a2a] rounded-2xl max-w-lg mx-auto">
                <CardHeader>
                  <CardTitle className="text-2xl font-serif text-[#e4e4e7] text-center">Portrait du personnage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-8 flex flex-col items-center">
                  <div className="relative w-64 h-80 rounded-2xl overflow-hidden border border-[#2a2a2a] bg-[#121212] flex items-center justify-center shadow-lg">
                    {getPreviewImage() ? (
                      <img src={getPreviewImage()} className="w-full h-full object-cover object-top" alt="Preview" />
                    ) : (
                      <User className="w-20 h-20 text-[#333]" strokeWidth={1} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/20 to-transparent pointer-events-none" />
                  </div>

                  <div className="w-full max-w-xs">
                    <label className="bg-[#1a1a1a] border border-[#2a2a2a] p-4 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[#c0a080]/50 hover:bg-[#c0a080]/5 transition-all group w-full shadow-md">
                      <Upload className="w-6 h-6 text-zinc-500 group-hover:text-[#c0a080] mb-3" />
                      <span className="text-xs uppercase text-zinc-400 font-bold tracking-wider group-hover:text-zinc-200">Choisir une image</span>
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                  </div>

                  <div className="flex w-full justify-between mt-4 pt-6 border-t border-[#2a2a2a]">
                    <Button onClick={prevStep} variant="outline" className="border-[#333] text-zinc-400 hover:text-white"><ChevronLeft className="mr-2 w-4 h-4" /> Précédent</Button>
                    <Button onClick={handleCreateCharacter} className="bg-[#c0a080] hover:bg-[#e0c0a0] text-black font-bold flex-1 ml-4 shadow-lg shadow-[#c0a080]/20">Créer le personnage<ChevronRight className="ml-2 w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
