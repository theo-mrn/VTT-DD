'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { X, Sword, Target, Wand2, Settings } from 'lucide-react'
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
  targetId: string;
  onClose: () => void;
}

export default function CombatPage({ attackerId, targetId, onClose }: CombatPageProps) {
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
      cible: targetId,  // Add target information
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
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="w-full max-w-md"
      >
        <Card className="card relative !bg-[var(--bg-card)] hover:!bg-[var(--bg-card)] hover:!opacity-100 transition-none">
          <Button 
            onClick={onClose} 
            variant="ghost"
            className="absolute top-3 right-3 p-2 hover:bg-accent hover:text-accent-foreground hover:opacity-100"
            size="sm"
          >
            <X className="w-4 h-4" />
          </Button>
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Sword className="w-5 h-5 text-[var(--accent-brown)]" />
              Combat
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <AnimatePresence>
              <motion.div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    onClick={() => handleAttack('magic')} 
                    className="flex items-center gap-2 !bg-primary !text-primary-foreground hover:!bg-primary/80 hover:!opacity-100"
                  >
                    <Wand2 className="w-4 h-4" />
                    Magie
                  </Button>
                  <Button 
                    onClick={() => handleAttack('distance')} 
                    className="flex items-center gap-2 !bg-primary !text-primary-foreground hover:!bg-primary/80 hover:!opacity-100"
                  >
                    <Target className="w-4 h-4" />
                    Distance
                  </Button>
                  <Button 
                    onClick={() => handleAttack('contact')} 
                    className="flex items-center gap-2 !bg-primary !text-primary-foreground hover:!bg-primary/80 hover:!opacity-100"
                  >
                    <Sword className="w-4 h-4" />
                    Contact
                  </Button>
                  <Button 
                    onClick={() => handleAttack('custom')} 
                    variant="outline"
                    className="flex items-center gap-2 hover:!bg-accent hover:!text-accent-foreground hover:!opacity-100"
                  >
                    <Settings className="w-4 h-4" />
                    Custom
                  </Button>
                </div>

                {showCustomFields && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-3 p-4 bg-[var(--accent-brown)]/5 border border-[var(--accent-brown)]/20 rounded-lg"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="customDice" className="text-[var(--text-primary)]">Nombre de dés</Label>
                      <Input
                        id="customDice"
                        type="number"
                        value={customRoll.numDice}
                        onChange={(e) => setCustomRoll({ ...customRoll, numDice: parseInt(e.target.value) || 1 })}
                        className="input-field"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customFaces" className="text-[var(--text-primary)]">Nombre de faces</Label>
                      <Input
                        id="customFaces"
                        type="number"
                        value={customRoll.numFaces}
                        onChange={(e) => setCustomRoll({ ...customRoll, numFaces: parseInt(e.target.value) || 20 })}
                        className="input-field"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customModifier" className="text-[var(--text-primary)]">Modificateur</Label>
                      <Input
                        id="customModifier"
                        type="number"
                        value={customRoll.modifier}
                        onChange={(e) => setCustomRoll({ ...customRoll, modifier: parseInt(e.target.value) || 0 })}
                        className="input-field"
                      />
                    </div>
                    <Button onClick={handleCustomAttackRoll} className="w-full bg-primary text-primary-foreground hover:bg-primary/80 hover:opacity-100">
                      Lancer le dé personnalisé
                    </Button>
                  </motion.div>
                )}

                {showDamage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-3"
                  >
                    <div className="space-y-2">
                      <Label className="text-[var(--text-primary)]">Sélectionner une arme</Label>
                      <Select onValueChange={(value) => setSelectedWeapon(weapons.find(w => w.name === value) || weapons[0])}>
                        <SelectTrigger className="input-field">
                          <SelectValue placeholder="Sélectionner une arme" />
                        </SelectTrigger>
                        <SelectContent>
                          {weapons.map((weapon) => (
                            <SelectItem key={weapon.name} value={weapon.name}>{weapon.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedWeapon?.name === "Autre" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="grid grid-cols-3 gap-2 p-3 bg-[var(--accent-brown)]/5 border border-[var(--accent-brown)]/20 rounded-lg"
                      >
                        <div className="space-y-1">
                          <Label className="text-xs text-[var(--text-secondary)]">Dés</Label>
                          <Input
                            type="number"
                            placeholder="1"
                            value={customDamage.numDice}
                            onChange={(e) => setCustomDamage({ ...customDamage, numDice: parseInt(e.target.value) || 1 })}
                            className="input-field text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-[var(--text-secondary)]">Faces</Label>
                          <Input
                            type="number"
                            placeholder="6"
                            value={customDamage.numFaces}
                            onChange={(e) => setCustomDamage({ ...customDamage, numFaces: parseInt(e.target.value) || 6 })}
                            className="input-field text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-[var(--text-secondary)]">Mod.</Label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={customDamage.modifier}
                            onChange={(e) => setCustomDamage({ ...customDamage, modifier: parseInt(e.target.value) || 0 })}
                            className="input-field text-sm"
                          />
                        </div>
                      </motion.div>
                    )}
                    <Button onClick={handleDamageRoll} className="w-full bg-primary text-primary-foreground hover:bg-primary/80 hover:opacity-100">
                      Lancer les dégâts
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>

            {(attackResult || damageResult) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-gradient-to-r from-[var(--accent-brown)]/10 to-[var(--accent-brown)]/5 border border-[var(--accent-brown)]/20 rounded-lg"
              >
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Résultats</h3>
                {attackResult && (
                  <p className="text-[var(--text-secondary)] mb-2 font-mono text-sm">{attackResult}</p>
                )}
                {damageResult && (
                  <p className="text-[var(--text-secondary)] font-mono text-sm font-bold">{damageResult}</p>
                )}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
