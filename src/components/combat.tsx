'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sword, Shield, Wand2, Target, Cog, X } from 'lucide-react'
import { auth, db, doc, getDoc, onAuthStateChanged, collection, getDocs, setDoc } from '@/lib/firebase'

type DiceRoll = {
  numDice: number
  numFaces: number
  modifier: number
}

type Weapon = {
  name: string
  numDice: number
  numFaces: number
}
type CombatPageProps = {
  attackerId: string;
  targetId: string;
  onClose: () => void;
};


export default function CombatPage({ attackerId, targetId, onClose }: CombatPageProps) {
  const [attackResult, setAttackResult] = useState<string>("")
  const [damageRoll, setDamageRoll] = useState<number[]>([])
  const [showDamage, setShowDamage] = useState(false)
  const [showCustomFields, setShowCustomFields] = useState(false)
  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null)
  const [customRoll, setCustomRoll] = useState<DiceRoll>({ numDice: 1, numFaces: 6, modifier: 0 })
  const [defense, setDefense] = useState<number | null>(null)
  const [attacks, setAttacks] = useState<{ contact: number | null, distance: number | null, magie: number | null }>({
    contact: null,
    distance: null,
    magie: null
  })
  const [targetName, setTargetName] = useState<string>("")
  const [targetImage, setTargetImage] = useState<string>("")
  const [attackCompleted, setAttackCompleted] = useState(false)
  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [weapons, setWeapons] = useState<Weapon[]>([])
  const [roomId, setRoomId] = useState<string | null>(null)
  const [attackType, setAttackType] = useState<string>("") // Track attack type (contact, distance, magie, custom)
  const [initialRollResult, setInitialRollResult] = useState<number | null>(null) // Store initial roll result
  const [attackSuccess, setAttackSuccess] = useState<boolean>(false) // Track if attack succeeded

  useEffect(() => {
    const fetchData = async () => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          const uid = user.uid
          try {
            const userDoc = await getDoc(doc(db, `users/${uid}`))
            const fetchedRoomId = userDoc.exists() ? userDoc.data().room_id : null
            setRoomId(fetchedRoomId)

            if (fetchedRoomId) {
              const attackerDoc = await getDoc(doc(db, `cartes/${fetchedRoomId}/characters/${attackerId}`))
              if (attackerDoc.exists()) {
                const nomperso = attackerDoc.data().Nomperso || ""
                await loadWeapons(fetchedRoomId, nomperso)
                
                setAttacks({
                  contact: attackerDoc.data().Contact || null,
                  distance: attackerDoc.data().Distance || null,
                  magie: attackerDoc.data().Magie || null
                })
              }

              const targetDoc = await getDoc(doc(db, `cartes/${fetchedRoomId}/characters/${targetId}`))
              if (targetDoc.exists()) {
                setDefense(targetDoc.data().Defense || null)
                setTargetName(targetDoc.data().Nomperso || "")
                setTargetImage(targetDoc.data().imageURL || "")
              }

              const settingsDoc = await getDoc(doc(db, `cartes/${fetchedRoomId}/settings/general`))
              if (settingsDoc.exists()) {
                const currentTurn = settingsDoc.data().tour_joueur
                setIsPlayerTurn(currentTurn === attackerId)
              }
            } else {
              console.warn("room_id non trouvé pour l'utilisateur")
            }
          } catch (error) {
            console.error("Erreur lors de la récupération des données Firebase :", error)
          }
        }
      })
    }

    const loadWeapons = async (roomId: string, nomperso: string) => {
      const inventoryRef = collection(db, `Inventaire/${roomId}/${nomperso}`)
      const inventorySnapshot = await getDocs(inventoryRef)
      const fetchedWeapons: Weapon[] = []

      inventorySnapshot.forEach(doc => {
        const item = doc.data()
        if (item.category === 'armes-contact' || item.category === 'armes-distance') {
          const diceSelection = item.diceSelection || "1d6"
          const [numDice, numFaces] = diceSelection.split('d').map(Number)
          fetchedWeapons.push({
            name: item.message,
            numDice: numDice || 1,
            numFaces: numFaces || 6
          })
        }
      })

      setWeapons(fetchedWeapons)
      setSelectedWeapon(fetchedWeapons[0] || null)
    }

    fetchData()
  }, [attackerId, targetId])

  const rollDice = ({ numDice, numFaces, modifier }: DiceRoll) => {
    const rolls = Array.from({ length: numDice }, () => Math.floor(Math.random() * numFaces) + 1)
    const total = rolls.reduce((sum, roll) => sum + roll, 0) + Number(modifier)
    return { rolls, total }
  }

  const sendAttackReport = async (result: string, damage?: number) => {
    if (!roomId || !attackerId) return;
  
    // Creating a reference to the "rapport" subcollection within the combat document
    const reportRef = doc(collection(db, `cartes/${roomId}/combat/${attackerId}/rapport`));
  
    const reportData = {
      type: attackType,
      attaque_result: initialRollResult,
      réussite: attackSuccess,
      degat_result: attackSuccess ? damage : null,
      arme_utilisée: selectedWeapon ? selectedWeapon.name : "N/A",
      attaquant: attackerId,
      attaquant_nom: "Cruder", // example name, adjust as needed
      cible: targetId,
      cible_nom: targetName,
      defense: defense,
      timestamp: new Date().toLocaleString()
    };
  
    try {
      await setDoc(reportRef, reportData);
      console.log("Rapport d'attaque envoyé :", reportData);
    } catch (error) {
      console.error("Erreur lors de l'envoi du rapport d'attaque :", error);
    }
  };

  const handleAttack = (attackType: string) => {
    setDamageRoll([])
    setShowDamage(false)
    setShowCustomFields(false)
    setAttackCompleted(false)
    setAttackType(attackType) // Store the attack type for reporting

    let attackModifier = 0
    let attackLabel = ""

    if (attackType === 'contact' && attacks.contact !== null) {
      attackModifier = attacks.contact
      attackLabel = "Contact"
    } else if (attackType === 'distance' && attacks.distance !== null) {
      attackModifier = attacks.distance
      attackLabel = "Distance"
    } else if (attackType === 'magic' && attacks.magie !== null) {
      attackModifier = attacks.magie
      attackLabel = "Magie"
    }

    if (attackType === 'custom') {
      setShowCustomFields(true)
    } else {
      const { rolls, total } = rollDice({ numDice: 1, numFaces: 20, modifier: attackModifier })
      setInitialRollResult(total)
      setAttackResult(`1d20+${attackModifier} : ${total} (${attackLabel})`)
      
      const isSuccess = defense !== null && total >= defense
      setAttackSuccess(isSuccess)
      
      if (isSuccess) {
        setShowDamage(true)
      } else {
        setAttackCompleted(true)
        sendAttackReport("Échec") // Send report with failure
      }
    }
  }

  const handleCustomAttackRoll = () => {
    const { rolls, total } = rollDice(customRoll)
    setAttackResult(`Custom Roll: ${total} (1d${customRoll.numFaces}+${customRoll.modifier})`)
    setShowCustomFields(false)
    setInitialRollResult(total)
    const isSuccess = defense !== null && total >= defense
    setAttackSuccess(isSuccess)

    if (isSuccess) {
      setShowDamage(true)
    } else {
      setAttackCompleted(true)
      sendAttackReport("Échec") // Send report with failure
    }
  }

  const handleDamageRoll = () => {
    if (selectedWeapon) {
      const { rolls, total } = rollDice({
        numDice: selectedWeapon.numDice,
        numFaces: selectedWeapon.numFaces,
        modifier: customRoll.modifier
      })
      setDamageRoll(rolls)
      setAttackResult(`Dégâts totaux: ${total}`)
      setAttackCompleted(true)
      sendAttackReport("Réussite", total) // Send report with success and damage
    }
  }

  const diceSum = (rolls: number[], modifier: number) => rolls.reduce((sum, roll) => sum + roll, 0) + Number(modifier)

  if (!isPlayerTurn) {
    return (
      <div className="relative bg-white p-4 border rounded-lg max-w-md mx-auto text-center">
        <p className="text-lg font-semibold text-[#8b4513]">Ce n'est pas notre tour</p>
        <Button onClick={onClose} className="absolute top-2 right-2 text-[#4e3629]">
          <X className="w-5 h-5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-[#f0e6d2] flex flex-col items-center justify-center p-2 font-serif">
      <Card className="w-full max-w-[375px] bg-[#f0e6d2] border-2 border-[#8b4513] rounded-lg shadow-lg relative">
        <Button onClick={onClose} className="absolute top-2 right-2 text-[#4e3629]">
          <X className="w-5 h-5" />
        </Button>
        <CardHeader className="p-3 flex items-center space-x-4">
          {targetImage && <img src={targetImage} alt={targetName} className="w-12 h-12 rounded-full" />}
          <CardTitle className="text-xl font-semibold text-[#4e3629]">{targetName}</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <AnimatePresence>
            <motion.div className="grid gap-2 py-2">
              {!attackResult && (
                <div className="grid grid-cols-2 gap-2">
                  <Button onClick={() => handleAttack('magic')} className="bg-[#4e3629] hover:bg-[#6b4423] text-[#f0e6d2] text-sm">
                    <Wand2 className="mr-1" /> Magie
                  </Button>
                  <Button onClick={() => handleAttack('distance')} className="bg-[#4e3629] hover:bg-[#6b4423] text-[#f0e6d2] text-sm">
                    <Target className="mr-1" /> Distance
                  </Button>
                  <Button onClick={() => handleAttack('contact')} className="bg-[#4e3629] hover:bg-[#6b4423] text-[#f0e6d2] text-sm">
                    <Sword className="mr-1" /> Contact
                  </Button>
                  <Button onClick={() => handleAttack('custom')} className="bg-[#4e3629] hover:bg-[#6b4423] text-[#f0e6d2] text-sm">
                    <Cog className="mr-1" /> Custom
                  </Button>
                </div>
              )}
              {attackResult && (
                <div className="text-center font-semibold text-2xl text-[#8b4513] mb-2">
                  {attackResult}
                </div>
              )}
              {showCustomFields && (
                <>
                  <div className="grid grid-cols-3 items-center gap-2">
                    <Label htmlFor="numDice" className="text-[#4e3629] text-xs">Nombre de dés</Label>
                    <Input
                      id="numDice"
                      type="number"
                      value={customRoll.numDice}
                      onChange={(e) => setCustomRoll({...customRoll, numDice: parseInt(e.target.value) || 1})}
                      className="col-span-2 bg-[#e6d8c3] border-[#8b4513] text-[#4e3629] text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 items-center gap-2">
                    <Label htmlFor="numFaces" className="text-[#4e3629] text-xs">Nombre de faces</Label>
                    <Input
                      id="numFaces"
                      type="number"
                      value={customRoll.numFaces}
                      onChange={(e) => setCustomRoll({...customRoll, numFaces: parseInt(e.target.value) || 2})}
                      className="col-span-2 bg-[#e6d8c3] border-[#8b4513] text-[#4e3629] text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 items-center gap-2">
                    <Label htmlFor="modifier" className="text-[#4e3629] text-xs">Modificateur</Label>
                    <Input
                      id="modifier"
                      type="number"
                      value={customRoll.modifier}
                      onChange={(e) => setCustomRoll({...customRoll, modifier: parseInt(e.target.value) || 0})}
                      className="col-span-2 bg-[#e6d8c3] border-[#8b4513] text-[#4e3629] text-sm"
                    />
                  </div>
                  <Button 
                    onClick={handleCustomAttackRoll} 
                    className="w-full bg-[#4e3629] hover:bg-[#6b4423] text-[#f0e6d2] border border-[#8b4513] rounded-md mt-4"
                  >
                    Lancer le dé Custom
                  </Button>
                </>
              )}
              {showDamage && (
                <>
                  <Select
                    onValueChange={(value) => setSelectedWeapon(weapons.find(w => w.name === value) || weapons[0])}
                    defaultValue={selectedWeapon?.name}
                  >
                    <SelectTrigger className="w-full bg-[#e6d8c3] border-[#8b4513] text-[#4e3629] text-sm">
                      <SelectValue placeholder="Sélectionnez une arme" />
                    </SelectTrigger>
                    <SelectContent>
                      {weapons.map((weapon) => (
                        <SelectItem key={weapon.name} value={weapon.name}>{weapon.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {damageRoll.length > 0 && (
                    <div className="text-center font-semibold text-2xl text-[#8b4513] mb-2">
                      Dégâts totaux: {diceSum(damageRoll, customRoll.modifier)}
                    </div>
                  )}
                  <Button onClick={handleDamageRoll} className="w-full bg-[#4e3629] hover:bg-[#6b4423] text-[#f0e6d2] border border-[#8b4513] rounded-md mt-4">
                    Lancer les dégâts
                  </Button>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </CardContent>
        {attackCompleted && (
          <CardFooter>
            <Button 
              onClick={() => {
                setAttackResult("")
                setDamageRoll([])
                setShowDamage(false)
                setShowCustomFields(false)
                setAttackCompleted(false)
              }} 
              size="sm"
              className="w-full bg-[#4e3629] hover:bg-[#6b4423] text-[#f0e6d2] border border-[#8b4513] rounded-md"
            >
              Nouvelle attaque
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
