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
import { doc, setDoc, addDoc, collection } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { onAuthStateChanged } from 'firebase/auth'
import { useRouter } from 'next/navigation'


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
  const [raceData, setRaceData] = useState<any>({})
  const [profileData, setProfileData] = useState<any>({})
  const [currentRaceCapabilities, setCurrentRaceCapabilities] = useState<any[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [character, setCharacter] = useState({
    Nomperso: '',
    Nomjoueur: '',
    Race: '',
    Profile: '',
    devie: 'd12',
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
    const roll = () => Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6) + 3

    const FOR = roll()
    const DEX = roll()
    const CON = roll()
    const INT = roll()
    const SAG = roll()
    const CHA = roll()

    setCharacter(prev => ({
      ...prev,
      FOR,
      DEX,
      CON,
      INT,
      SAG,
      CHA,
      Defense: 10 + calculateModifier(DEX),
      PV: 1 + calculateModifier(CON) + rollDie(parseInt(character.devie.replace('d', ''))),
      Contact: 1 + calculateModifier(FOR),
      Distance: 1 + calculateModifier(DEX),
      Magie: 1 + calculateModifier(CHA),
      INIT: DEX,
    }))
  }

  useEffect(() => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid)
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

  useEffect(() => {
    const raceNames = Object.keys(raceData)
    const currentRaceName = raceNames[raceIndex]

    if (!currentRaceName) return

    const formattedRaceName = currentRaceName.toLowerCase().replace(/\s+/g, '_')

    async function loadRaceCapabilities() {
      try {
        const capabilities = await fetchJson(`/tabs/capacite_${formattedRaceName}.json`)
        setCurrentRaceCapabilities(Object.values(capabilities))
      } catch (error) {
        console.error("Error loading race capabilities:", error)
        setCurrentRaceCapabilities([])
      }
    }
    loadRaceCapabilities()
  }, [raceData, raceIndex])

  const handleCreateCharacter = async () => {
    if (!userId) {
      console.error("User ID is not set, cannot save character data.")
      return
    }

    try {
      let imageURL = character.imageURL
      if (selectedImage) {
        const imageRef = ref(storage, `users/${userId}/characters/${character.Nomperso}-image`)
        await uploadBytes(imageRef, selectedImage)
        imageURL = await getDownloadURL(imageRef)
      }

      // Save character data to Firestore with additional fields
      const characterData = {
        ...character,
        imageURL,
        type: 'joueurs',
        visibilityRadius: 150,
        x: 500,
        y: 500
      }

      // Save to user's characters collection
      await addDoc(collection(db, `users/${userId}/characters`), characterData)

      // Save to cartes/room_id/characters/id
      const roomId = '665441' // Replace with actual room ID
      await addDoc(collection(db, `cartes/${roomId}/characters`), characterData)

      console.log("Character created successfully")
      
      // Redirect to /map after successful creation
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
      const updatedData = {
        Race: raceNames[raceIndex],
        ...currentRace.modificateurs,
      }
      setCharacter(prev => ({ ...prev, ...updatedData }))
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
        devie: currentProfile.hitDie,
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

  const renderStatsSelection = useCallback(() => (
    <div className="space-y-6">
      <Button onClick={rollStats} className="w-full" variant="outline">
        <Dice6 className="mr-2 h-4 w-4" />
        Lancer les dés pour les caractéristiques
      </Button>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map(stat => (
    <div key={stat} className="space-y-2">
      <Label>{stat}</Label>
      <Input 
        value={character[stat as keyof typeof character] as number} 
        readOnly 
        className="text-center font-bold" 
      />
      <p className="text-sm text-muted-foreground text-center">
        Mod: {calculateModifier(character[stat as keyof typeof character] as number)}
      </p>
    </div>
  ))}
</div>


      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Défense et Vitalité</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            {['Defense', 'PV', 'INIT'].map(stat => (
              <div key={stat} className="space-y-2">
                <Label>{stat}</Label>
                <Input value={character[stat as keyof typeof character]} readOnly className="text-center" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compétences de combat</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            {['Contact', 'Distance', 'Magie'].map(stat => (
              <div key={stat} className="space-y-2">
                <Label>{stat}</Label>
                <Input value={character[stat as keyof typeof character]} readOnly className="text-center" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between pt-6">
        <Button onClick={prevStep} variant="outline">Précédent</Button>
        <Button onClick={nextStep} variant="outline">Suivant</Button>
      </div>
    </div>
  ), [character])

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
    <Card className="w-full max-w-4xl mx-auto">
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
  )
}
