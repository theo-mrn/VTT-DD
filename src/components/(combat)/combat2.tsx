'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { X, Sword, Target, Wand2, Settings, Volume2, Search, Music, FileAudio } from 'lucide-react'
import { auth, db, doc, getDoc, onAuthStateChanged, collection, getDocs, setDoc, onSnapshot, query } from '@/lib/firebase'
import { SUGGESTED_SOUNDS, SOUND_CATEGORIES } from '@/lib/suggested-sounds'

interface Weapon {
  id?: string; // Inventory doc ID
  name: string;
  numDice: number;
  numFaces: number;
  soundId?: string; // Associated sound ID
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

interface SoundTemplate {
  id: string
  name: string
  soundUrl: string
  type: 'file' | 'youtube'
  category?: string
}

interface CombatPageProps {
  attackerId: string;
  targetId?: string; // Optional single target
  targetIds?: string[]; // Optional multiple targets
  onClose: () => void;
}

export default function CombatPage({ attackerId, targetId, targetIds, onClose }: CombatPageProps) {
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
  const [creatureActions, setCreatureActions] = useState<Array<{
    Nom: string;
    Description: string;
    Toucher: number;
  }>>([])

  const [targets, setTargets] = useState<Array<{ id: string, name: string, defense: number, imageURL?: string, imageURL2?: string, imageURLFinal?: string, type?: string }>>([])

  // Sound Settings
  const [sounds, setSounds] = useState<SoundTemplate[]>([])
  const [isSoundSelectorOpen, setIsSoundSelectorOpen] = useState(false)
  const [soundSearchQuery, setSoundSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [attackerName, setAttackerName] = useState<string>("") // To construct path for inventory updates

  // Load sounds
  useEffect(() => {
    if (!roomId) return

    // Load saved preference
    const savedSoundId = localStorage.getItem('vtt_combat_sound')
    if (savedSoundId) {
      // This was for a global sound, now sounds are weapon-specific.
      // We might want to remove this or adapt it if there's a "default" combat sound.
      // For now, leaving it as it was, but it won't affect weapon sounds.
    }

    const q = query(collection(db, `sound_templates/${roomId}/templates`))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customSounds = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        category: 'custom' // Mark user uploaded sounds as custom
      } as SoundTemplate))

      // Convert suggested sounds to SoundTemplate format
      const defaultSounds: SoundTemplate[] = SUGGESTED_SOUNDS.map(s => ({
        id: s.path, // Use path as ID for default sounds
        name: s.name,
        soundUrl: s.path,
        type: 'file',
        category: s.category
      }))

      // Merge: Custom first, then defaults
      setSounds([...customSounds, ...defaultSounds])
    })

    return () => unsubscribe()
  }, [roomId])

  // Update sound for the SELECTED WEAPON
  const handleSoundSelect = async (value: string) => {
    const soundId = value === "none" ? "" : value

    if (!selectedWeapon) return

    // Update Local State for immediate feedback
    const updatedWeapon = { ...selectedWeapon, soundId }
    setSelectedWeapon(updatedWeapon)
    setWeapons(prev => prev.map(w => w.name === updatedWeapon.name ? updatedWeapon : w))

    // Persist to Firestore if it's a real inventory item
    if (selectedWeapon.id && roomId && attackerName) {
      try {
        await setDoc(doc(db, `Inventaire/${roomId}/${attackerName}/${selectedWeapon.id}`), {
          soundId
        }, { merge: true })
      } catch (e) {
        console.error("Error saving weapon sound:", e)
      }
    }
  }

  const playAttackSound = async () => {
    console.log("Attempting to play attack sound...", { roomId, weapon: selectedWeapon })
    if (!roomId || !selectedWeapon || !selectedWeapon.soundId) {
      console.warn("Missing room, weapon, or soundId", { roomId, hasWeapon: !!selectedWeapon, soundId: selectedWeapon?.soundId })
      return
    }
    const sound = sounds.find(s => s.id === selectedWeapon.soundId)
    if (!sound) {
      console.warn("Sound not found in library", selectedWeapon.soundId)
      return
    }

    try {
      console.log("Broadcasting sound:", sound.name)
      // Broadcast sound to everyone on the map
      await setDoc(doc(db, 'global_sounds', roomId), {
        soundUrl: sound.soundUrl,
        soundId: sound.id,
        timestamp: Date.now(),
        type: sound.type
      })
    } catch (error) {
      console.error("Error playing sound:", error)
    }
  }

  useEffect(() => {
    const fetchData = async () => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          const uid = user.uid
          const userDoc = await getDoc(doc(db, `users/${uid}`))
          const fetchedRoomId = userDoc.exists() ? userDoc.data().room_id : null
          setRoomId(fetchedRoomId)

          if (fetchedRoomId) {
            if (!attackerId) {
              console.warn("No attackerId provided to CombatPage");
              return;
            }

            const attackerDoc = await getDoc(doc(db, `cartes/${fetchedRoomId}/characters/${attackerId}`))
            if (attackerDoc.exists()) {
              const nomperso = attackerDoc.data().Nomperso || ""
              setAttackerName(nomperso)
              await loadWeapons(fetchedRoomId, nomperso)

              setAttacks({
                contact: attackerDoc.data().Contact_F || attackerDoc.data().Contact || null,
                distance: attackerDoc.data().Distance_F || attackerDoc.data().Distance || null,
                magie: attackerDoc.data().Magie_F || attackerDoc.data().Magie || null
              })

              // Load creature Actions
              setCreatureActions(attackerDoc.data().Actions || [])
            }

            // Handle Targets (Single or Multiple)
            // Fix: Check length of targetIds to decide whether to use it or fallback to targetId
            const hasMultipleTargets = targetIds && targetIds.length > 0;
            const idsToFetch = hasMultipleTargets ? targetIds : (targetId ? [targetId] : []);

            // Filter and deduplicate
            const uniqueIds = Array.from(new Set(idsToFetch.filter(id => id)));

            const fetchedTargets: Array<{ id: string, name: string, defense: number, imageURL?: string, imageURL2?: string, imageURLFinal?: string, type?: string }> = [];

            for (const tId of uniqueIds) {
              if (!tId) continue;
              const targetDoc = await getDoc(doc(db, `cartes/${fetchedRoomId}/characters/${tId}`));
              if (targetDoc.exists()) {
                const data = targetDoc.data();
                fetchedTargets.push({
                  id: tId,
                  name: data.Nomperso || data.name || "Unknown",
                  defense: data.Defense || 10,
                  imageURL: data.imageURL,
                  imageURL2: data.imageURL2,
                  imageURLFinal: data.imageURLFinal,
                  type: data.type
                });
              }
            }
            setTargets(fetchedTargets);
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
            id: doc.id,
            name: `${item.message} (${numDice}d${numFaces})`,
            numDice,
            numFaces,
            soundId: item.soundId || ""
          })
        }
      })

      setWeapons(fetchedWeapons)
      setSelectedWeapon(fetchedWeapons[0] || null)
    }

    fetchData()
  }, [attackerId, targetId, targetIds])

  const rollDice = ({ numDice, numFaces, modifier = 0 }: CustomRoll) => {
    const rolls = Array.from({ length: numDice }, () => Math.floor(Math.random() * numFaces) + 1)
    const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier
    return { rolls, total }
  }

  const sendAttackReport = async (attackType: string, initialRoll: number | null, damageRoll: number, roomId: string | null) => {
    if (!roomId) return

    // Create a report for EACH target
    const effectiveTargets = targets.length > 0 ? targets : (targetId ? [{ id: targetId, name: "Unknown", defense: 0 }] : []);

    for (const target of effectiveTargets) {
      const uniqueResultStatus = (initialRoll || 0) > target.defense ? "Success" : "Failure";

      const reportData = {
        type: attackType,
        attaque_result: initialRoll,
        degat_result: damageRoll,
        arme_utilisée: selectedWeapon ? selectedWeapon.name : "N/A",
        attaquant: attackerId,
        attaquant_nom: attackerName,
        cible: target.id,
        cible_nom: target.name,
        resultat: uniqueResultStatus, // Store success/failure per target
        timestamp: new Date().toLocaleString()
      }
      try {
        const reportRef = doc(collection(db, `cartes/${roomId}/combat/${attackerId}/rapport`))
        await setDoc(reportRef, reportData)
      } catch (error) {
        console.error("Error saving report:", error)
      }
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

      setDamageResult(`Dégâts totaux: ${total}`)

      // Calculate success for each target (just for report purposes, UI handled in render)
      // We don't display "Success/Failure" text here anymore since it varies per target

      sendAttackReport("Attack", initialRollResult, total, roomId)
      playAttackSound()
    }
  }

  const selectedSoundId = selectedWeapon?.soundId || ""

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
            className="absolute top-3 right-3 p-2 hover:bg-accent hover:text-accent-foreground hover:opacity-100 z-10"
            size="sm"
          >
            <X className="w-4 h-4" />
          </Button>
          <CardHeader className="pb-4 relative">
            <CardTitle className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Sword className="w-5 h-5 text-[var(--accent-brown)]" />
              Combat
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            {/* 🎯 Targets List */}
            {targets.length > 0 && (
              <div className="bg-[#1a1a1a]/50 p-3 rounded-lg border border-[#333] mb-2">
                <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide flex justify-between">
                  <span>Cibles détectées</span>
                  <span className="bg-[#333] text-white px-1.5 rounded-full text-[10px]">{targets.length}</span>
                </h3>
                <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                  {targets.map(t => {
                    // Utiliser la bonne priorité selon le type de personnage
                    const imageUrl = t.type === 'joueurs'
                      ? (t.imageURLFinal || t.imageURL2 || t.imageURL)
                      : (t.imageURL2 || t.imageURL);
                    return (
                      <div key={t.id} className="flex flex-col items-center gap-1 p-2 hover:bg-white/5 rounded transition-colors">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={t.name}
                            className="w-12 h-12 rounded-full object-cover border-2 border-[#c0a080]/50"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-[#333] border-2 border-[#c0a080]/50 flex items-center justify-center">
                            <span className="text-[#c0a080] text-lg font-bold">{t.name.charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <span className="text-[var(--text-primary)] font-medium text-xs truncate max-w-[60px] text-center">{t.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <AnimatePresence>
              <motion.div className="space-y-4">

                {/* Custom Modal Selection Son */}
                <AnimatePresence>
                  {isSoundSelectorOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                      {/* Backdrop Click to Close */}
                      <div className="absolute inset-0" onClick={() => setIsSoundSelectorOpen(false)} />

                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="relative w-full max-w-4xl h-[80vh] bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] rounded-xl shadow-2xl flex flex-col overflow-hidden"
                      >
                        {/* HEADER */}
                        <div className="p-4 border-b border-[#333] bg-[#1a1a1a] flex items-center justify-between">
                          <h2 className="text-lg font-bold">Choisir un son d'attaque</h2>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsSoundSelectorOpen(false)}
                            className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                          >
                            <X className="w-5 h-5" />
                          </Button>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                          {/* SIDEBAR */}
                          <div className="w-56 bg-[#111] border-r border-[#333] flex flex-col overflow-y-auto p-2">
                            <Button
                              variant="ghost"
                              onClick={() => setSelectedCategory('all')}
                              className={`w-full justify-start text-sm mb-1 ${selectedCategory === 'all' ? 'bg-[#c0a080]/10 text-[#c0a080]' : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'}`}
                            >
                              Tout voir
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => setSelectedCategory('custom')}
                              className={`w-full justify-start text-sm mb-1 ${selectedCategory === 'custom' ? 'bg-[#c0a080]/10 text-[#c0a080]' : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'}`}
                            >
                              Mes sons (Custom)
                            </Button>

                            <div className="h-px bg-[#333] my-2 mx-1" />
                            <div className="px-2 pb-1 text-[10px] font-semibold text-gray-600 uppercase">Catégories</div>

                            {SOUND_CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                              <Button
                                key={cat.id}
                                variant="ghost"
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`w-full justify-start text-sm mb-1 ${selectedCategory === cat.id ? 'bg-[#c0a080]/10 text-[#c0a080]' : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'}`}
                              >
                                {cat.label}
                              </Button>
                            ))}
                          </div>

                          {/* MAIN CONTENT */}
                          <div className="flex-1 flex flex-col bg-[#0a0a0a]">
                            <div className="p-4 border-b border-[#333]">
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <Input
                                  placeholder="Rechercher un son..."
                                  value={soundSearchQuery}
                                  onChange={(e) => setSoundSearchQuery(e.target.value)}
                                  className="pl-9 h-9 text-sm bg-[#1a1a1a] border-[#333] text-white focus-visible:ring-1 focus-visible:ring-[#c0a080]"
                                />
                              </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4">
                              <div
                                onClick={() => { handleSoundSelect("none"); setIsSoundSelectorOpen(false); }}
                                className={`flex items-center gap-3 p-3 hover:bg-[#252525] cursor-pointer border rounded-lg border-[#333] transition-colors mb-2 ${!selectedSoundId ? 'bg-[#c0a080]/10 border-[#c0a080]' : 'bg-[#1a1a1a]'}`}
                              >
                                <div className="w-8 h-8 rounded flex items-center justify-center bg-[#252525] text-gray-400">
                                  <Volume2 className="w-4 h-4 text-gray-500" />
                                </div>
                                <span className="text-sm font-medium text-gray-400">Aucun son</span>
                                {!selectedSoundId && <span className="ml-auto text-xs text-[#c0a080]">Sélectionné</span>}
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                {sounds
                                  .filter(s => {
                                    const matchesSearch = s.name.toLowerCase().includes(soundSearchQuery.toLowerCase())
                                    const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory
                                    return matchesSearch && matchesCategory
                                  })
                                  .map(sound => (
                                    <div
                                      key={sound.id}
                                      onClick={() => { handleSoundSelect(sound.id); setIsSoundSelectorOpen(false); }}
                                      className={`flex items-center gap-3 p-3 hover:bg-[#252525] cursor-pointer border rounded-lg transition-colors ${selectedSoundId === sound.id ? 'bg-[#c0a080]/10 border-[#c0a080]' : 'bg-[#1a1a1a] border-[#333]'}`}
                                    >
                                      <div className={`w-8 h-8 rounded flex items-center justify-center ${selectedSoundId === sound.id ? 'bg-[#c0a080] text-black' : 'bg-[#252525] text-gray-400'}`}>
                                        {sound.type === 'youtube' ? <Music className="w-4 h-4" /> : <FileAudio className="w-4 h-4" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className={`text-sm font-medium truncate ${selectedSoundId === sound.id ? 'text-[#c0a080]' : 'text-gray-200'}`}>
                                          {sound.name}
                                        </div>
                                        <div className="text-[10px] text-gray-500 truncate flex items-center gap-1">
                                          {sound.category && <span className="uppercase text-[9px] bg-[#333] px-1 rounded">{sound.category}</span>}
                                          {sound.type === 'file' ? '' : '(YouTube)'}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>

                              {sounds.filter(s => {
                                const matchesSearch = s.name.toLowerCase().includes(soundSearchQuery.toLowerCase())
                                const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory
                                return matchesSearch && matchesCategory
                              }).length === 0 && (
                                  <div className="p-8 text-center text-gray-500 text-xs">
                                    Aucun son trouvé
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

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

                {/* Creature Actions - Informational Only */}
                {creatureActions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                  >
                    <Label className="text-sm font-semibold text-[var(--accent-brown)]">
                      Actions de Créature
                    </Label>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {creatureActions.map((action, index) => (
                        <div
                          key={index}
                          className="bg-black/40 border border-[#2a2a2a] rounded-md p-3 space-y-1"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-semibold text-white text-sm">{action.Nom}</h4>
                            {action.Toucher !== 0 && (
                              <span className="text-xs text-gray-400 whitespace-nowrap">
                                {action.Toucher > 0 ? '+' : ''}{action.Toucher} to hit
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed">
                            {action.Description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

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
                      <div className="flex items-center gap-2">
                        <Select onValueChange={(value) => setSelectedWeapon(weapons.find(w => w.name === value) || weapons[0])} value={selectedWeapon?.name}>
                          <SelectTrigger className="input-field flex-1">
                            <SelectValue placeholder="Sélectionner une arme" />
                          </SelectTrigger>
                          <SelectContent>
                            {weapons.map((weapon) => (
                              <SelectItem key={weapon.name} value={weapon.name}>{weapon.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          onClick={() => setIsSoundSelectorOpen(true)}
                          variant="outline"
                          className={`h-10 w-10 p-0 border-${selectedSoundId ? '[var(--accent-brown)]' : 'input'} ${selectedSoundId ? 'text-[var(--accent-brown)] bg-[var(--accent-brown)]/10' : 'text-gray-400'}`}
                          title={selectedSoundId ? `Son: ${sounds.find(s => s.id === selectedSoundId)?.name}` : "Choisir un son pour cette arme"}
                        >
                          <Volume2 className="w-4 h-4" />
                        </Button>
                      </div>
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
                className="p-3 bg-gradient-to-r from-[var(--accent-brown)]/10 to-[var(--accent-brown)]/5 border border-[var(--accent-brown)]/20 rounded-lg"
              >
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Résultats</h3>
                {attackResult && (
                  <div className="mb-2">
                    <p className="text-[var(--text-secondary)] mb-1 font-mono text-xs">{attackResult}</p>
                  </div>
                )}
                {damageResult && (
                  <p className="text-[var(--text-secondary)] font-mono text-xs font-bold border-t border-[var(--accent-brown)]/20 pt-2 mt-2">{damageResult}</p>
                )}
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div >
    </div >
  )
}
