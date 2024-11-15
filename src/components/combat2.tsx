'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { X } from 'lucide-react'
import { auth, db, doc, getDoc, onAuthStateChanged, collection, getDocs, setDoc } from '@/lib/firebase'

interface Weapon {
  name: string;
  numDice: number;
  numFaces: number;
}

interface CustomRoll {
  numDice: number;
  numFaces: number;
  modifier: number;
}

interface Attacks {
  contact: number | null;
  distance: number | null;
  magie: number | null;
}

interface CombatPageProps {
  attackerId: string;
  onClose: () => void;
}

export default function CombatPage({ attackerId, onClose }: CombatPageProps) {
  const [attackResult, setAttackResult] = useState<string>("")
  const [damageResult, setDamageResult] = useState<string>("")
  const [showDamage, setShowDamage] = useState<boolean>(false)
  const [showCustomFields, setShowCustomFields] = useState<boolean>(false)
  const [selectedWeapon, setSelectedWeapon] = useState<Weapon | null>(null)
  const [customRoll, setCustomRoll] = useState<CustomRoll>({ numDice: 1, numFaces: 20, modifier: 0 })
  const [customDamage, setCustomDamage] = useState<CustomRoll>({ numDice: 1, numFaces: 6, modifier: 0 })
  const [attacks, setAttacks] = useState<Attacks>({ contact: null, distance: null, magie: null })
  const [weapons, setWeapons] = useState<Weapon[]>([{ name: "Autre", numDice: 1, numFaces: 6 }])
  const [initialRollResult, setInitialRollResult] = useState<number | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          const uid = user.uid
          const userDoc = await getDoc(doc(db, `users/${uid}`))
          const fetchedRoomId = userDoc.exists() ? userDoc.data().room_id : null
          setRoomId(fetchedRoomId)

          if (fetchedRoomId) {
            const attackerDoc = await getDoc(doc(db, `cartes/${fetchedRoomId}/characters/${attackerId}`))
            if (attackerDoc.exists()) {
              const nomperso = attackerDoc.data().Nomperso || ""
              await loadWeapons(fetchedRoomId, nomperso)
              
              setAttacks({
                contact: attackerDoc.data().Contact_F || attackerDoc.data().Contact || null,
                distance: attackerDoc.data().Distance_F || attackerDoc.data().Distance || null,
                magie: attackerDoc.data().Magie_F || attackerDoc.data().Magie || null
              })
            }
          }
        }
      })
    }

    const loadWeapons = async (roomId: string, nomperso: string) => {
      const inventoryRef = collection(db, `Inventaire/${roomId}/${nomperso}`)
      const inventorySnapshot = await getDocs(inventoryRef)
      const fetchedWeapons: Weapon[] = [{ name: "Autre", numDice: 1, numFaces: 6 }]

      inventorySnapshot.forEach(doc => {
        const item = doc.data()
        if (item.category === 'armes-contact' || item.category === 'armes-distance') {
          const diceSelection = item.diceSelection || "1d6"

          // Parse diceSelection string (e.g., "1d6")
          const dicePattern = /^(\d+)d(\d+)$/
          const match = diceSelection.match(dicePattern)
          const numDice = match ? parseInt(match[1], 10) : 1
          const numFaces = match ? parseInt(match[2], 10) : 6

          fetchedWeapons.push({
            name: `${item.message} (${numDice}d${numFaces})`, // Display dice configuration next to weapon name
            numDice,
            numFaces
          })
        }
      })

      setWeapons(fetchedWeapons)
      setSelectedWeapon(fetchedWeapons[0] || null)
    }

    fetchData()
  }, [attackerId])

  const rollDice = ({ numDice, numFaces, modifier = 0 }: CustomRoll) => {
    const rolls = Array.from({ length: numDice }, () => Math.floor(Math.random() * numFaces) + 1)
    const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier
    return { rolls, total }
  }

  const sendAttackReport = async (attackType: string, initialRoll: number | null, damageRoll: number, roomId: string | null) => {
    if (!roomId) return

    const reportData = {
      type: attackType,
      attaque_result: initialRoll,
      degat_result: damageRoll,
      arme_utilisée: selectedWeapon ? selectedWeapon.name : "N/A",
      attaquant: attackerId,
      attaquant_nom: "Attacker Name",  // replace with actual data if available
      timestamp: new Date().toLocaleString()
    }
    try {
      const reportRef = doc(collection(db, `cartes/${roomId}/combat/${attackerId}/rapport`))
      await setDoc(reportRef, reportData)
    } catch (error) {
      console.error("Error saving report:", error)
    }
  }

  const handleAttack = (attackType: string) => {
    setShowDamage(false)
    setShowCustomFields(false)
    let attackModifier = 0

    if (attackType === 'contact' && attacks.contact !== null) attackModifier = attacks.contact
    else if (attackType === 'distance' && attacks.distance !== null) attackModifier = attacks.distance
    else if (attackType === 'magic' && attacks.magie !== null) attackModifier = attacks.magie
    else if (attackType === 'custom') {
      setShowCustomFields(true)
      return
    }

    const { total } = rollDice({ numDice: 1, numFaces: 20, modifier: attackModifier })
    setInitialRollResult(total)
    setAttackResult(`Jet d'attaque: 1d20+${attackModifier} = ${total}`)
    setShowDamage(true)
  }

  const handleCustomAttackRoll = () => {
    const { total } = rollDice(customRoll)
    setInitialRollResult(total)
    setAttackResult(`Jet d'attaque personnalisé: ${customRoll.numDice}d${customRoll.numFaces}+${customRoll.modifier} = ${total}`)
    setShowDamage(true)
  }

  const handleDamageRoll = () => {
    if (selectedWeapon) {
      const weapon: CustomRoll = selectedWeapon.name === "Autre" ? customDamage : { ...selectedWeapon, modifier: 0 }
      const { total } = rollDice(weapon)
      setDamageResult(`Dégâts totaux: ${total}`)
      sendAttackReport("Success", initialRollResult, total, roomId)
    }
  }

  return (
    <div className="flex flex-col items-center p-2">
      <Card className="bg-white w-full max-w-[375px] relative">
        <Button onClick={onClose} className="absolute top-2 right-2">
          <X className="w-5 h-5" />
        </Button>
        <CardHeader className="p-3">
          <CardTitle>Combat</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <AnimatePresence>
            <motion.div className="grid gap-2 py-2">
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => handleAttack('magic')}>Magie</Button>
                <Button onClick={() => handleAttack('distance')}>Distance</Button>
                <Button onClick={() => handleAttack('contact')}>Contact</Button>
                <Button onClick={() => handleAttack('custom')}>Custom</Button>
              </div>

              {showCustomFields && (
                <div className="grid gap-2 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="customDice">Nombre de dés</Label>
                    <Input
                      id="customDice"
                      type="number"
                      value={customRoll.numDice}
                      onChange={(e) => setCustomRoll({ ...customRoll, numDice: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customFaces">Nombre de faces</Label>
                    <Input
                      id="customFaces"
                      type="number"
                      value={customRoll.numFaces}
                      onChange={(e) => setCustomRoll({ ...customRoll, numFaces: parseInt(e.target.value) || 20 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customModifier">Modificateur</Label>
                    <Input
                      id="customModifier"
                      type="number"
                      value={customRoll.modifier}
                      onChange={(e) => setCustomRoll({ ...customRoll, modifier: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <Button onClick={handleCustomAttackRoll}>Lancer le dé personnalisé</Button>
                </div>
              )}

              {showDamage && (
                <>
                  <Select onValueChange={(value) => setSelectedWeapon(weapons.find(w => w.name === value) || weapons[0])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selectionner une arme" />
                    </SelectTrigger>
                    <SelectContent>
                      {weapons.map((weapon) => (
                        <SelectItem key={weapon.name} value={weapon.name}>{weapon.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedWeapon?.name === "Autre" && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <Input
                        type="number"
                        placeholder="Nombre de dés"
                        value={customDamage.numDice}
                        onChange={(e) => setCustomDamage({ ...customDamage, numDice: parseInt(e.target.value) || 1 })}
                      />
                      <Input
                        type="number"
                        placeholder="Nombre de faces"
                        value={customDamage.numFaces}
                        onChange={(e) => setCustomDamage({ ...customDamage, numFaces: parseInt(e.target.value) || 6 })}
                      />
                      <Input
                        type="number"
                        placeholder="Modificateur"
                        value={customDamage.modifier}
                        onChange={(e) => setCustomDamage({ ...customDamage, modifier: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  )}
                  <Button onClick={handleDamageRoll} className="mt-4">Lancer les dégâts</Button>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          {attackResult && (
            <div className="mt-4 p-4 bg-gray-200 rounded-md">
              <p className="text-lg font-semibold">Résultats</p>
              <p>{attackResult}</p>
              {damageResult && <p>{damageResult}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
