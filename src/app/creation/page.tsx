"use client"

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ChevronLeft, ChevronRight, Dice6 } from 'lucide-react'
import Image from 'next/image'
import { db, auth, storage } from '@/lib/firebase'
import { doc, addDoc, collection, getDoc, setDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { onAuthStateChanged } from 'firebase/auth'
import { useRouter } from 'next/navigation'


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
  const [raceIndex, setRaceIndex] = useState(0)
  const [profileIndex, setProfileIndex] = useState(0)
  const [direction, setDirection] = useState(0)

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
      if (selectedImage) {
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

      // Save character data to Firestore with additional fields
      const characterData = {
        ...character,
        imageURL,
        type: 'joueurs',
        visibilityRadius: 150,
        x: 500,
        y: 500,
        PV_Max: character.PV, // Fix key name to PV_Max
        niveau: 1, // Initialize level to 1
        Taille: taille,
        Poids: poids
      }

      await addDoc(collection(db, `users/${userId}/characters`), characterData)

      const docRef = await addDoc(collection(db, `cartes/${roomId}/characters`), characterData)

      // Update user's current character ID
      await setDoc(doc(db, 'users', userId), { persoId: docRef.id }, { merge: true })

      console.log("Character created successfully with ID:", docRef.id)

      // Redirect to /map after successful creation (change page)
      router.push('/change')
    } catch (error) {
      console.error("Error creating character:", error)
    }
  }


  const nextStep = useCallback(() => setStep(prev => Math.min(prev + 1, 5)), [])
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

  const renderRaceSelection = useCallback(() => {
    const raceNames = Object.keys(raceData)
    const currentRace = raceData[raceNames[raceIndex]]

    const nextRace = () => {
      setDirection(1)
      setRaceIndex((prevIndex) => (prevIndex + 1) % raceNames.length)
    }

    const prevRace = () => {
      setDirection(-1)
      setRaceIndex((prevIndex) => (prevIndex - 1 + raceNames.length) % raceNames.length)
    }

    const selectRace = () => {
      // Just set the race. Stats will be recalculated based on baseStats + race modifiers in a useEffect or updated manually
      const updatedData = {
        Race: raceNames[raceIndex],
      }

      // We need to re-apply modifiers to the current base stats whenever race changes
      const mods = currentRace.modificateurs || {};

      setCharacter(prev => ({
        ...prev,
        ...updatedData,
        FOR: baseStats.FOR + (mods.FOR || 0),
        DEX: baseStats.DEX + (mods.DEX || 0),
        CON: baseStats.CON + (mods.CON || 0),
        INT: baseStats.INT + (mods.INT || 0),
        SAG: baseStats.SAG + (mods.SAG || 0),
        CHA: baseStats.CHA + (mods.CHA || 0),
      }))
      nextStep()
    }

    return (
      <div className="space-y-4 text-center">
        <div className="flex items-center justify-center space-x-4">
          <Button onClick={prevRace} variant="ghost" size="icon">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <motion.div
            key={raceIndex}
            custom={direction}
            initial={{ opacity: 0, y: direction > 0 ? 100 : -100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: direction > 0 ? -100 : 100 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-2xl font-bold mb-2">{raceNames[raceIndex]}</h2>
            {currentRace.image && (
              <Image
                src={currentRace.image}
                alt={raceNames[raceIndex]}
                width={300}
                height={300}
                className="rounded-lg shadow-lg mb-4 mx-auto"
              />
            )}
            <p className="text-gray-600 mb-4">{currentRace.description}</p>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Modificateurs de caractéristiques</h3>
              {Object.entries(currentRace.modificateurs || {}).map(([stat, mod]) => (
                <p key={stat}>
                  {stat}: {mod as number > 0 ? '+' : ''}{mod as number}
                </p>
              ))}

            </div>
          </motion.div>
          <Button onClick={nextRace} variant="ghost" size="icon">
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
        <div className="flex justify-between mt-4">
          <Button onClick={prevStep}>Précédent</Button>
          <Button onClick={selectRace}>
            Choisir {raceNames[raceIndex]}
          </Button>
        </div>
      </div>
    )
  }, [raceData, raceIndex, direction])

  const renderProfileSelection = useCallback(() => {
    const profileNames = Object.keys(profileData)
    const currentProfile = profileData[profileNames[profileIndex]]

    const nextProfile = () => {
      setDirection(1)
      setProfileIndex((prevIndex) => (prevIndex + 1) % profileNames.length)
    }

    const prevProfile = () => {
      setDirection(-1)
      setProfileIndex((prevIndex) => (prevIndex - 1 + profileNames.length) % profileNames.length)
    }

    const selectProfile = () => {
      const updatedData = {
        Profile: profileNames[profileIndex],
        deVie: currentProfile.hitDie,
      }
      setCharacter(prev => ({ ...prev, ...updatedData }))
      nextStep()
    }

    return (
      <div className="space-y-4 text-center">
        <div className="flex items-center justify-center space-x-4">
          <Button onClick={prevProfile} variant="ghost" size="icon">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <motion.div
            key={profileIndex}
            custom={direction}
            initial={{ opacity: 0, y: direction > 0 ? 100 : -100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: direction > 0 ? -100 : 100 }}
            transition={{ duration: 0.3 }}
          >
            <h2 className="text-2xl font-bold mb-2">{profileNames[profileIndex]}</h2>
            {currentProfile.image && (
              <Image
                src={currentProfile.image}
                alt={profileNames[profileIndex]}
                width={300}
                height={300}
                className="rounded-lg shadow-lg mb-4 mx-auto"
              />
            )}
            <p className="text-gray-600 mb-2">{currentProfile.description}</p>
            <p className="text-gray-600 font-semibold">Dé de vie: {currentProfile.hitDie}</p>
          </motion.div>
          <Button onClick={nextProfile} variant="ghost" size="icon">
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
        <div className="flex justify-between mt-4">
          <Button onClick={prevStep}>Précédent</Button>
          <Button onClick={selectProfile}>
            Choisir {profileNames[profileIndex]}
          </Button>
        </div>
      </div>
    )
  }, [profileData, profileIndex, direction])

  const renderStatsSelection = useCallback(() => {
    // Calculate global stats for verification
    const totalBaseMods = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].reduce((sum, stat) => {
      const baseVal = baseStats[stat as keyof typeof baseStats]
      return sum + calculateModifier(baseVal)
    }, 0)

    return (
      <div className="space-y-6">
        <Button onClick={rollStats} className="w-full" variant="outline">
          <Dice6 className="mr-2 h-4 w-4" />
          Lancer les dés (Règles: 3 pairs/3 impairs, Somme Modificateurs Base = +6)
        </Button>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center border-collapse">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="p-2">Statistique</th>
                <th className="p-2 border-l">Base</th>
                <th className="p-2 text-muted-foreground">Mod. Base</th>
                <th className="p-2 border-l">Bonus Race</th>
                <th className="p-2 border-l font-bold">Total</th>
                <th className="p-2 font-bold text-primary">Mod. Final</th>
              </tr>
            </thead>
            <tbody>
              {['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map(stat => {
                const baseVal = baseStats[stat as keyof typeof baseStats]
                const baseMod = calculateModifier(baseVal)
                const raceMod = (raceData[character.Race]?.modificateurs as any)?.[stat] || 0
                const finalVal = character[stat as keyof typeof character] as number
                const finalMod = calculateModifier(finalVal)

                return (
                  <tr key={stat} className="border-b hover:bg-muted/20 transition-colors">
                    <td className="p-2 font-bold">{stat}</td>
                    <td className="p-2 border-l">{baseVal}</td>
                    <td className="p-2 text-muted-foreground">{baseMod > 0 ? '+' : ''}{baseMod}</td>
                    <td className="p-2 border-l font-medium text-blue-400">
                      {raceMod !== 0 ? (raceMod > 0 ? `+${raceMod}` : raceMod) : '-'}
                    </td>
                    <td className="p-2 border-l font-bold text-lg">{finalVal}</td>
                    <td className="p-2 font-bold text-primary text-lg">{finalMod > 0 ? '+' : ''}{finalMod}</td>
                  </tr>
                )
              })}
              <tr className="bg-muted/20 font-semibold text-xs border-t-2 border-primary/20">
                <td className="p-2 text-right">SOMME MODIFICATEURS:</td>
                <td className="p-2 border-l" colSpan={2}>Base: {totalBaseMods > 0 ? '+' : ''}{totalBaseMods} (Requis: +6)</td>
                <td className="p-2 border-l"></td>
                <td className="p-2 border-l" colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>

        <Separator />

        <div className="flex flex-wrap gap-4 justify-center">
          <Card className="flex-1 min-w-[200px]">
            <CardHeader className="py-2"><CardTitle className="text-sm">Défense & Vitalité</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-center text-sm">
              <div><div className="text-xs text-muted-foreground">DEF</div><div className="font-bold text-lg">{character.Defense}</div></div>
              <div><div className="text-xs text-muted-foreground">PV</div><div className="font-bold text-lg">{character.PV}</div></div>
              <div><div className="text-xs text-muted-foreground">INIT</div><div className="font-bold text-lg">{character.INIT}</div></div>
            </CardContent>
          </Card>
          <Card className="flex-1 min-w-[200px]">
            <CardHeader className="py-2"><CardTitle className="text-sm">Attaque</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 text-center text-sm">
              <div><div className="text-xs text-muted-foreground">Contact</div><div className="font-bold text-lg">+{character.Contact}</div></div>
              <div><div className="text-xs text-muted-foreground">Distance</div><div className="font-bold text-lg">+{character.Distance}</div></div>
              <div><div className="text-xs text-muted-foreground">Magie</div><div className="font-bold text-lg">+{character.Magie}</div></div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between pt-6">
          <Button onClick={prevStep} variant="outline">Précédent</Button>
          <Button onClick={nextStep} variant="outline">Suivant</Button>
        </div>
      </div>
    )
  }, [character, baseStats, raceData])

  const renderImageSelection = useCallback(() => (
    <div className="space-y-4">
      <Input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files ? e.target.files[0] : null
          if (file) {
            setSelectedImage(file)
            setImagePreview(URL.createObjectURL(file))
          }
        }}
      />
      {imagePreview && (
        <Image
          src={imagePreview}
          alt="Aperçu de l'image du personnage"
          width={300}
          height={300}
          className="rounded-lg shadow-lg"
        />
      )}
      <div className="flex justify-between mt-6">
        <Button onClick={prevStep} variant="outline">Précédent</Button>
        <Button onClick={handleCreateCharacter}>Créer le personnage</Button>
      </div>
    </div>
  ), [imagePreview])

  if (!userId) return <p>Loading...</p>

  return (
    <div className="flex items-center justify-center min-h-screen py-8 bg-background">
      <Card className={`w-full mx-auto transition-all duration-300 ${step === 3 ? 'max-w-[95vw]' : 'max-w-4xl'}`}>
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
              {step === 1 && renderRaceSelection()}
              {step === 2 && renderProfileSelection()}
              {step === 3 && renderStatsSelection()}
              {step === 4 && renderImageSelection()}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  )
}
