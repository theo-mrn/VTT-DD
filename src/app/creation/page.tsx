"use client"

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'

const races = [
  { name: "Humain", description: "Adaptables et ambitieux", defaultHeight: 175, defaultWeight: 70, defaultAge: 25, image: "/placeholder.svg?height=300&width=300" },
  { name: "Elfe", description: "Gracieux et longévifs", defaultHeight: 180, defaultWeight: 65, defaultAge: 150, image: "/placeholder.svg?height=300&width=300" },
  { name: "Nain", description: "Robustes et traditionnels", defaultHeight: 130, defaultWeight: 80, defaultAge: 70, image: "/placeholder.svg?height=300&width=300" },
  { name: "Halfelin", description: "Petits et agiles", defaultHeight: 90, defaultWeight: 40, defaultAge: 30, image: "/placeholder.svg?height=300&width=300" },
  { name: "Demi-Orc", description: "Forts et endurants", defaultHeight: 190, defaultWeight: 100, defaultAge: 20, image: "/placeholder.svg?height=300&width=300" }
]

const profiles = [
  { name: "Barbare", description: "Un guerrier sauvage et puissant", hitDie: "d12", image: "/placeholder.svg?height=300&width=300" },
  { name: "Barde", description: "Un artiste polyvalent et charismatique", hitDie: "d8", image: "/placeholder.svg?height=300&width=300" },
  { name: "Magicien", description: "Un érudit des arcanes", hitDie: "d6", image: "/placeholder.svg?height=300&width=300" },
  { name: "Guerrier", description: "Un maître du combat", hitDie: "d10", image: "/placeholder.svg?height=300&width=300" },
  { name: "Rôdeur", description: "Un expert de la nature", hitDie: "d10", image: "/placeholder.svg?height=300&width=300" }
]

export default function CharacterCreationPage() {
  const [step, setStep] = useState(0)
  const [character, setCharacter] = useState({
    name: '',
    playerName: '',
    race: '',
    height: '',
    weight: '',
    age: '',
    profile: '',
    hitDie: '',
    equipment: [] as string[], // Specify that equipment is an array of strings
    stats: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    },
    image: null as File | null
  })
  
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [raceIndex, setRaceIndex] = useState(0)
  const [profileIndex, setProfileIndex] = useState(0)
  const [newItem, setNewItem] = useState('')
  const [direction, setDirection] = useState(0)

  const updateCharacter = useCallback((newData: Partial<typeof character>) => {
    setCharacter(prev => ({ ...prev, ...newData }))
  }, [])

  const handleImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
        updateCharacter({ image: file })
      }
      reader.readAsDataURL(file)
    }
  }, [updateCharacter])

  const nextStep = useCallback(() => setStep(prev => Math.min(prev + 1, 5)), [])
  const prevStep = useCallback(() => setStep(prev => Math.max(prev - 1, 0)), [])

  const renderBasicInfo = useCallback(() => (
    <div className="space-y-4">
      <Input
        placeholder="Nom du personnage"
        value={character.name}
        onChange={(e) => updateCharacter({ name: e.target.value })}
      />
      <Input
        placeholder="Nom du joueur"
        value={character.playerName}
        onChange={(e) => updateCharacter({ playerName: e.target.value })}
      />
    </div>
  ), [character.name, character.playerName, updateCharacter])

  const renderRaceSelection = useCallback(() => {
    const currentRace = races[raceIndex]

    const nextRace = () => {
      setDirection(1)
      setRaceIndex((prevIndex) => (prevIndex + 1) % races.length)
    }

    const prevRace = () => {
      setDirection(-1)
      setRaceIndex((prevIndex) => (prevIndex - 1 + races.length) % races.length)
    }

    const selectRace = () => {
      updateCharacter({
        race: currentRace.name,
        height: String(currentRace.defaultHeight), // Convert to string
        weight: String(currentRace.defaultWeight), // Convert to string
        age: String(currentRace.defaultAge) // Convert to string
      })
      nextStep()
    }
    

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button onClick={prevRace} variant="ghost" size="icon">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={raceIndex}
              custom={direction}
              initial={{ opacity: 0, y: direction > 0 ? 100 : -100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: direction > 0 ? -100 : 100 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <h2 className="text-2xl font-bold mb-2">{currentRace.name}</h2>
              <Image
                src={currentRace.image}
                alt={currentRace.name}
                width={300}
                height={300}
                className="rounded-lg shadow-lg mb-4 mx-auto"
              />
              <p className="text-gray-600 mb-4">{currentRace.description}</p>
              <div className="space-y-2">
                <Input
                  type="number"
                  placeholder="Taille (cm)"
                  value={character.height || currentRace.defaultHeight}
                  onChange={(e) => updateCharacter({ height: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Poids (kg)"
                  value={character.weight || currentRace.defaultWeight}
                  onChange={(e) => updateCharacter({ weight: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Âge"
                  value={character.age || currentRace.defaultAge}
                  onChange={(e) => updateCharacter({ age: e.target.value })}
                />
              </div>
            </motion.div>
          </AnimatePresence>
          <Button onClick={nextRace} variant="ghost" size="icon">
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
      </div>
    )
  }, [raceIndex, character.height, character.weight, character.age, updateCharacter, nextStep, direction])

  const renderProfileSelection = useCallback(() => {
    const currentProfile = profiles[profileIndex]

    const nextProfile = () => {
      setDirection(1)
      setProfileIndex((prevIndex) => (prevIndex + 1) % profiles.length)
    }

    const prevProfile = () => {
      setDirection(-1)
      setProfileIndex((prevIndex) => (prevIndex - 1 + profiles.length) % profiles.length)
    }

    const selectProfile = () => {
      updateCharacter({
        profile: currentProfile.name,
        hitDie: currentProfile.hitDie
      })
      nextStep()
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Button onClick={prevProfile} variant="ghost" size="icon">
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={profileIndex}
              custom={direction}
              initial={{ opacity: 0, y: direction > 0 ? 100 : -100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: direction > 0 ? -100 : 100 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <h2 className="text-2xl font-bold mb-2">{currentProfile.name}</h2>
              <Image
                src={currentProfile.image}
                alt={currentProfile.name}
                width={300}
                height={300}
                className="rounded-lg shadow-lg mb-4 mx-auto"
              />
              <p className="text-gray-600">{currentProfile.description}</p>
              <p className="text-sm text-gray-500 mt-2">
                Dé de vie: {currentProfile.hitDie}
              </p>
            </motion.div>
          </AnimatePresence>
          <Button onClick={nextProfile} variant="ghost" size="icon">
            <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
      </div>
    )
  }, [profileIndex, updateCharacter, nextStep, direction])

  const renderImageUpload = useCallback(() => (
    <div className="space-y-4">
      <label htmlFor="character-image" className="block text-sm font-medium text-gray-700 mb-2">
        Image du personnage
      </label>
      <Input
        id="character-image"
        type="file"
        accept="image/*"
        onChange={handleImageChange}
      />
      {imagePreview && (
        <img src={imagePreview} alt="Aperçu" className="mt-2 w-32 h-32 object-cover rounded-full mx-auto" />
      )}
    </div>
  ), [imagePreview, handleImageChange])

  const renderEquipmentSelection = useCallback(() => {
    const addItem = () => {
      if (newItem.trim()) {
        updateCharacter({ equipment: [...character.equipment, newItem.trim()] })
        setNewItem('')
      }
    }

    const removeItem = (index: number) => {
      const newEquipment = character.equipment.filter((_, i) => i !== index)
      updateCharacter({ equipment: newEquipment })
    }

    return (
      <div className="space-y-4">
        <div className="flex space-x-2">
          <Input
            placeholder="Nouvel objet"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
          />
          <Button onClick={addItem}>Ajouter</Button>
        </div>
        <ul className="list-disc list-inside">
          {character.equipment.map((item, index) => (
            <li key={index} className="flex justify-between items-center">
              {item}
              <Button variant="ghost" onClick={() => removeItem(index)}>Supprimer</Button>
            </li>
          ))}
        </ul>
      </div>
    )
  }, [character.equipment, newItem, updateCharacter])

  const renderStatsGeneration = useCallback(() => {
    const rollStat = () => Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6) + Math.floor(Math.random() * 6) + 3

    const generateStats = () => {
      const newStats = {
        strength: rollStat(),
        dexterity: rollStat(),
        constitution: rollStat(),
        intelligence: rollStat(),
        wisdom: rollStat(),
        charisma: rollStat()
      }
      updateCharacter({ stats: newStats })
    }

    return (
      <div className="space-y-4">
        <Button onClick={generateStats}>Générer les statistiques</Button>
        {Object.entries(character.stats).map(([stat, value]) => (
          <div key={stat} className="flex items-center space-x-2">
            <label className="w-24 capitalize">{stat}:</label>
            <Input
              type="number"
              value={value}
              onChange={(e) => updateCharacter({ stats: { ...character.stats, [stat]: parseInt(e.target.value) } })}
              min={3}
              max={18}
            />
          </div>
        ))}
      </div>
    )
  }, [character.stats, updateCharacter])

  const renderStep = useCallback(() => {
    switch (step) {
      case 0: return renderBasicInfo()
      case 1: return renderRaceSelection()
      case 2: return renderProfileSelection()
      case 3: return renderImageUpload()
      case 4: return renderEquipmentSelection()
      case 5: return renderStatsGeneration()
      default: return null
    }
  }, [step, renderBasicInfo, renderRaceSelection, renderProfileSelection, renderImageUpload, renderEquipmentSelection, renderStatsGeneration])

  const getStepTitle = useCallback(() => {
    switch (step) {
      case 0: return "Informations de base"
      case 1: return "Race"
      case 2: return "Profil"
      case 3: return "Image"
      case 4: return "Équipement"
      case 5: return "Statistiques"
      default: return ""
    }
  }, [step])

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Création de personnage - {getStepTitle()}</CardTitle>
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
            {renderStep()}
          
          </motion.div>
        </AnimatePresence>
        <div className="flex justify-between mt-6">
          {step > 0 && (
            <Button onClick={prevStep}>
              Précédent
            </Button>
          )}
          {step < 5 ? (
            <Button onClick={nextStep} className="ml-auto">
              {step === 1 ? `Choisir ${races[raceIndex].name}` :
               step === 2 ? `Choisir ${profiles[profileIndex].name}` :
               "Suivant"}
            </Button>
          ) : (
            <Button onClick={() => console.log(character)} className="ml-auto">
              Créer le personnage
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}