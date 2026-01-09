'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  X, Sword, Target, Wand2, Settings, Volume2,
  ArrowRight, Shield, Zap, Skull, Library, StopCircle, PlayCircle, Check, Music, Plus, Search
} from 'lucide-react'
import { auth, db, doc, getDoc, onAuthStateChanged, collection, getDocs, setDoc, onSnapshot, query } from '@/lib/firebase'
import { SUGGESTED_SOUNDS, SOUND_CATEGORIES } from '@/lib/suggested-sounds'
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

// --- Interfaces ---

interface Weapon {
  id?: string;
  name: string;
  numDice: number;
  numFaces: number;
  soundId?: string;
  category?: string;
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
  targetId?: string;
  targetIds?: string[];
  onClose: () => void;
}

type CombatStep = 'ATTACK_CHOICE' | 'ATTACK_ROLLING' | 'ATTACK_RESULT' | 'WEAPON_SELECT' | 'DAMAGE_ROLLING' | 'DAMAGE_RESULT'
type AttackType = 'contact' | 'distance' | 'magic' | 'custom'

// --- Components ---

const ActionCard = ({ title, icon: Icon, value, color, onClick, delay }: any) => (
  <motion.button
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay, type: "spring", stiffness: 200 }}
    whileHover={{ scale: 1.05, y: -5 }}
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className="group relative flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent hover:from-white/10 hover:to-white/5 transition-all duration-300 w-full h-48 shadow-2xl overflow-hidden"
  >
    <div className={`
      absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500
      bg-gradient-to-br ${color}
    `} />

    <div className={`p-4 rounded-full bg-black/40 border border-white/10 ${color.replace('from-', 'text-').split(' ')[0]} relative z-10 group-hover:scale-110 transition-transform`}>
      <Icon className="w-10 h-10" />
    </div>

    <div className="text-center relative z-10">
      <h3 className="text-lg font-bold uppercase tracking-widest text-white group-hover:text-[var(--accent-brown)] transition-colors">{title}</h3>
      {value !== null && (
        <span className="inline-block mt-2 px-3 py-1 bg-black/50 rounded-full text-sm font-mono text-gray-300 border border-white/5">
          +{value}
        </span>
      )}
    </div>
  </motion.button>
)

const WeaponCard = ({ weapon, onClick, onSoundClick }: { weapon: Weapon, onClick: () => void, onSoundClick: (e: any) => void }) => (
  <motion.button
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="w-full flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-[var(--accent-brown)]/50 transition-all duration-200 group relative overflow-hidden"
  >
    <div className="flex flex-col items-start gap-1">
      <span className="text-base font-bold text-gray-200 group-hover:text-white">{weapon.name.replace(/\(.*\)/, '')}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-[var(--accent-brown)] bg-[var(--accent-brown)]/10 px-1.5 py-0.5 rounded">
          {weapon.numDice}d{weapon.numFaces}
        </span>
        <div
          role="button"
          onClick={onSoundClick}
          className={`p-1 rounded hover:bg-white/20 transition-colors ${weapon.soundId ? 'text-[var(--accent-brown)]' : 'text-gray-600'}`}
        >
          <Volume2 className="w-3 h-3" />
        </div>
      </div>
    </div>
    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-500 group-hover:bg-[var(--accent-brown)] group-hover:text-black transition-all">
      <ArrowRight className="w-4 h-4" />
    </div>
  </motion.button>
)

const LoadingSpinner = () => (
  <div className="relative w-24 h-24">
    <div className="absolute inset-0 rounded-full border-4 border-white/5" />
    <div className="absolute inset-0 rounded-full border-4 border-t-[var(--accent-brown)] animate-spin" />
  </div>
)

export default function CombatPage({ attackerId, targetId, targetIds, onClose }: CombatPageProps) {
  // Navigation State
  const [step, setStep] = useState<CombatStep>('ATTACK_CHOICE')

  // Logic State
  const [attackResult, setAttackResult] = useState<number>(0)
  const [damageResult, setDamageResult] = useState<number>(0)
  const [selectedAttackType, setSelectedAttackType] = useState<AttackType>('contact')

  // Custom
  const [customRoll, setCustomRoll] = useState<CustomRoll>({ numDice: 1, numFaces: 20, modifier: 0 })
  const [customDamage, setCustomDamage] = useState<CustomRoll>({ numDice: 1, numFaces: 6, modifier: 0 })

  // Data
  const [roomId, setRoomId] = useState<string | null>(null)
  const [attackerName, setAttackerName] = useState<string>("")
  const [attackerImage, setAttackerImage] = useState<string>("")
  const [targets, setTargets] = useState<Array<{ id: string, name: string, defense: number, image?: string }>>([])

  const [attacks, setAttacks] = useState<Attacks>({ contact: null, distance: null, magie: null })
  const [weapons, setWeapons] = useState<Weapon[]>([])

  // Sounds
  const [sounds, setSounds] = useState<SoundTemplate[]>([])
  const [isSoundSelectorOpen, setIsSoundSelectorOpen] = useState(false)
  const [soundSearchQuery, setSoundSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [playingPreviewUrl, setPlayingPreviewUrl] = useState<string | null>(null)
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null)

  // Custom Flow State
  const [isCustomOpen, setIsCustomOpen] = useState(false)

  // Load Data
  useEffect(() => {
    const fetchData = async () => {
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          const uid = user.uid
          const userDoc = await getDoc(doc(db, `users/${uid}`))
          const fetchedRoomId = userDoc.exists() ? userDoc.data().room_id : null
          setRoomId(fetchedRoomId)

          if (fetchedRoomId && attackerId) {
            const attackerDoc = await getDoc(doc(db, `cartes/${fetchedRoomId}/characters/${attackerId}`))
            if (attackerDoc.exists()) {
              const data = attackerDoc.data()
              setAttackerName(data.Nomperso || "")
              setAttackerImage(data.imageURLFinal || data.imageURL2 || data.imageURL || "")
              setAttacks({
                contact: data.Contact_F || data.Contact || 0,
                distance: data.Distance_F || data.Distance || 0,
                magie: data.Magie_F || data.Magie || 0
              })
              await loadWeapons(fetchedRoomId, data.Nomperso)
            }

            // Targets
            const hasMultipleTargets = targetIds && targetIds.length > 0;
            const idsToFetch = hasMultipleTargets ? targetIds : (targetId ? [targetId] : []);
            const uniqueIds = Array.from(new Set(idsToFetch.filter(id => id)));
            const fetchedTargets = [];

            for (const tId of uniqueIds) {
              if (!tId) continue;
              const targetDoc = await getDoc(doc(db, `cartes/${fetchedRoomId}/characters/${tId}`));
              if (targetDoc.exists()) {
                const tData = targetDoc.data();
                fetchedTargets.push({
                  id: tId,
                  name: tData.Nomperso || tData.name || "Unknown",
                  defense: tData.Defense || 10,
                  image: tData.type === 'joueurs' ? (tData.imageURLFinal || tData.imageURL2 || tData.imageURL) : (tData.imageURL2 || tData.imageURL)
                });
              }
            }
            setTargets(fetchedTargets);
          }
        }
      })
    }

    const loadWeapons = async (rId: string, nom: string) => {
      const inventoryRef = collection(db, `Inventaire/${rId}/${nom}`)
      const snapshot = await getDocs(inventoryRef)
      const feats: Weapon[] = []
      snapshot.forEach(d => {
        const item = d.data()
        if (item.category === 'armes-contact' || item.category === 'armes-distance') {
          const diceParse = item.diceSelection?.match(/^(\d+)d(\d+)$/)
          feats.push({
            id: d.id,
            name: item.name || item.message,
            numDice: diceParse ? parseInt(diceParse[1]) : 1,
            numFaces: diceParse ? parseInt(diceParse[2]) : 6,
            soundId: item.soundId,
            category: item.category
          })
        }
      })
      setWeapons(feats)
    }

    fetchData()
  }, [attackerId, targetId, targetIds])

  // Load Sounds
  useEffect(() => {
    if (!roomId) return
    const q = query(collection(db, `sound_templates/${roomId}/templates`))
    const unsub = onSnapshot(q, (snap) => {
      const customS = snap.docs.map(d => ({ id: d.id, ...d.data(), category: 'custom' } as SoundTemplate))
      const defaultS = SUGGESTED_SOUNDS.map(s => ({ id: s.path, name: s.name, soundUrl: s.path, type: 'file', category: s.category } as SoundTemplate))
      setSounds([...customS, ...defaultS])
    })
    return () => unsub()
  }, [roomId])


  // --- Logic ---

  const rollDice = (numDice: number, numFaces: number, mod: number) => {
    return Array.from({ length: numDice }).reduce((acc: number) => acc + Math.floor(Math.random() * numFaces) + 1, 0) + mod
  }

  const handleAttack = (type: AttackType) => {
    setSelectedAttackType(type)
    setStep('ATTACK_ROLLING')

    // Quick delay for feel
    setTimeout(() => {
      let mod = 0
      if (type === 'contact') mod = attacks.contact || 0
      if (type === 'distance') mod = attacks.distance || 0
      if (type === 'magic') mod = attacks.magie || 0
      if (type === 'custom') mod = customRoll.modifier

      const total = type === 'custom'
        ? rollDice(customRoll.numDice, customRoll.numFaces, mod)
        : rollDice(1, 20, mod)

      setAttackResult(total)
      setStep('ATTACK_RESULT')

      // AUTO ADVANCE
      setTimeout(() => {
        setStep('WEAPON_SELECT')
      }, 1500) // 1.5s to see the big result

    }, 600)
  }

  const handleDamage = (weapon: Weapon | null) => {
    setStep('DAMAGE_ROLLING')

    setTimeout(() => {
      let dmg = 0
      const isCustomWait = (selectedAttackType === 'custom' && !weapon) // ? logic for custom step

      if (weapon && weapon.name !== "Autre") {
        dmg = rollDice(weapon.numDice, weapon.numFaces, 0)
        playWeaponSound(weapon)
      } else {
        // Fallback or Generic
        dmg = rollDice(customDamage.numDice, customDamage.numFaces, customDamage.modifier)
      }

      setDamageResult(dmg)
      setStep('DAMAGE_RESULT')
      sendReport(attackResult, dmg, weapon?.name || selectedAttackType)
    }, 600)
  }

  const sendReport = async (atk: number, dmg: number, weaponName: string) => {
    if (!roomId) return
    const targetsToReport = targets.length > 0 ? targets : [{ id: targetId || 'unknown', name: "Unknown", defense: 0 }]

    for (const t of targetsToReport) {
      try {
        await setDoc(doc(collection(db, `cartes/${roomId}/combat/${attackerId}/rapport`)), {
          type: "Attack",
          attaque_result: atk,
          degat_result: dmg,
          arme_utilisée: weaponName,
          attaquant: attackerId,
          attaquant_nom: attackerName,
          cible: t.id,
          cible_nom: t.name,
          resultat: atk >= t.defense ? "Success" : "Failure",
          timestamp: new Date().toLocaleString()
        })
      } catch (e) { console.error(e) }
    }
  }

  const playWeaponSound = async (weapon: Weapon) => {
    if (!roomId || !weapon.soundId) return
    const s = sounds.find(x => x.id === weapon.soundId)
    if (s) {
      try {
        await setDoc(doc(db, 'global_sounds', roomId), {
          soundUrl: s.soundUrl, soundId: s.id, timestamp: Date.now(), type: s.type
        })
      } catch (e) { }
    }
  }

  const reset = () => {
    setStep('ATTACK_CHOICE')
    setAttackResult(0)
    setDamageResult(0)
  }

  const handleSoundSelect = async (value: string) => {
    if (!selectedWeaponForSound) return
    const soundId = value === "none" ? "" : value

    // Optimistic update
    const updated = { ...selectedWeaponForSound, soundId }
    setWeapons(prev => prev.map(w => w.id === updated.id ? updated : w))

    if (updated.id && roomId && attackerName) {
      await setDoc(doc(db, `Inventaire/${roomId}/${attackerName}/${updated.id}`), { soundId }, { merge: true })
    }
    setIsSoundSelectorOpen(false)
  }

  const [selectedWeaponForSound, setSelectedWeaponForSound] = useState<Weapon | null>(null)

  const openSoundSelector = (e: React.MouseEvent, weapon: Weapon) => {
    e.stopPropagation()
    setSelectedWeaponForSound(weapon)
    setIsSoundSelectorOpen(true)
  }

  const togglePreview = (url: string) => {
    if (playingPreviewUrl === url && previewAudio) {
      previewAudio.pause()
      setPlayingPreviewUrl(null)
    } else {
      if (previewAudio) previewAudio.pause()
      const audio = new Audio(url)
      audio.volume = 0.5
      audio.play()
      audio.onended = () => setPlayingPreviewUrl(null)
      setPreviewAudio(audio)
      setPlayingPreviewUrl(url)
    }
  }

  // Cleanup preview on close
  useEffect(() => {
    if (!isSoundSelectorOpen && previewAudio) {
      previewAudio.pause()
      setPlayingPreviewUrl(null)
    }
  }, [isSoundSelectorOpen, previewAudio])


  // --- Render ---

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">

      <motion.div
        layout
        className="relative w-full max-w-5xl bg-[#0b0b0b] rounded-[2rem] border border-white/5 shadow-2xl flex flex-col overflow-hidden text-white"
        style={{ height: '700px', boxShadow: '0 0 100px rgba(0,0,0,0.8)' }}
      >
        {/* Background Effects */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-b from-[var(--accent-brown)]/10 to-transparent rounded-full blur-[100px] pointer-events-none opacity-40" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-t from-red-600/5 to-transparent rounded-full blur-[100px] pointer-events-none opacity-40" />

        {/* --- 1. THE VERSUS HEADER (Massive) --- */}
        <div className="h-[200px] border-b border-white/5 relative flex items-center justify-between px-16 bg-[#0a0a0a]/50">
          {/* Attacker */}
          <div className="flex items-center gap-8 relative z-10">
            <div className="relative group">
              <div className="w-32 h-32 rounded-full border-4 border-[var(--accent-brown)] shadow-[0_0_30px_rgba(192,160,128,0.2)] overflow-hidden bg-gray-800 transition-transform group-hover:scale-105">
                {attackerImage ? <img src={attackerImage} className="w-full h-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl font-bold">{attackerName[0]}</div>}
              </div>
              <div className="absolute -bottom-2 relative left-1/2 -translate-x-1/2 bg-[var(--accent-brown)] text-black font-bold uppercase text-xs px-3 py-1 rounded-full shadow-lg">Attaquant</div>
            </div>
            <div className="flex flex-col">
              <h2 className="text-3xl font-black uppercase tracking-tight text-white">{attackerName}</h2>
              <span className="text-sm text-[var(--accent-brown)] font-bold tracking-widest opacity-80">COMBAT PHASE</span>
            </div>
          </div>

          {/* VS */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="text-8xl font-black text-white/5 italic select-none">VS</span>
          </div>

          {/* Target */}
          <div className="flex items-center gap-8 text-right relative z-10">
            <div className="flex flex-col items-end">
              <h2 className="text-3xl font-black uppercase tracking-tight text-white">
                {targets.length > 1 ? `${targets.length} Cibles` : (targets[0]?.name || "Cible")}
              </h2>
            </div>
            <div className="flex -space-x-4">
              {targets.map((target, index) => (
                <div key={target.id} className="relative group" style={{ zIndex: targets.length - index }}>
                  <div className="w-32 h-32 rounded-full border-4 border-red-900 shadow-[0_0_30px_rgba(153,27,27,0.2)] overflow-hidden bg-gray-800 transition-transform group-hover:scale-105">
                    {target.image ? <img src={target.image} className="opacity-90 w-full h-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl font-bold text-red-500">?</div>}
                  </div>
                  <div className="absolute -bottom-2 relative left-1/2 -translate-x-1/2 bg-red-900 text-white font-bold uppercase text-xs px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                    {target.name}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={onClose} variant="ghost" className="absolute top-6 right-6 rounded-full hover:bg-white/10 text-gray-500 hover:text-white z-50">
            <X className="w-6 h-6" />
          </Button>
        </div>

        {/* --- 2. MAIN BATTLEFIELD (Content) --- */}
        <div className="flex-1 p-12 relative flex flex-col justify-center">

          <AnimatePresence mode="wait">

            {/* PHASE 1: SELECTION */}
            {step === 'ATTACK_CHOICE' && (
              <motion.div
                key="selection"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="w-full max-w-5xl mx-auto grid grid-cols-4 gap-6"
              >
                <ActionCard
                  title="Contact"
                  icon={Sword}
                  value={attacks.contact}
                  color="from-[var(--accent-brown)] to-orange-900/40"
                  delay={0}
                  onClick={() => handleAttack('contact')}
                />
                <ActionCard
                  title="Distance"
                  icon={Target}
                  value={attacks.distance}
                  color="from-green-500 to-emerald-900/40"
                  delay={0.1}
                  onClick={() => handleAttack('distance')}
                />
                <ActionCard
                  title="Magie"
                  icon={Wand2}
                  value={attacks.magie}
                  color="from-purple-500 to-indigo-900/40"
                  delay={0.2}
                  onClick={() => handleAttack('magic')}
                />
                <ActionCard
                  title="Custom"
                  icon={Settings}
                  value={customRoll.modifier}
                  color="from-blue-500 to-cyan-900/40"
                  delay={0.3}
                  onClick={() => setIsCustomOpen(!isCustomOpen)}
                />

                {/* Custom Configuration Bar (Revealed on click) */}
                <AnimatePresence>
                  {isCustomOpen && (
                    <motion.div
                      key="custom-config"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="col-span-4 mt-6 flex justify-center overflow-hidden"
                    >
                      <div className="bg-[#111] border border-white/5 rounded-xl p-4 flex items-center gap-4 shadow-2xl ring-1 ring-blue-500/30 mb-2">
                        <span className="text-xs font-bold uppercase text-blue-400 tracking-wider">Config Dé Custom</span>

                        <div className="h-6 w-px bg-white/10 mx-2" />

                        <div className="flex items-center gap-2">
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] text-gray-500 uppercase mb-1">Dés</span>
                            <Input
                              type="number"
                              className="h-10 w-14 text-center bg-black/40 border-white/10 text-white font-mono text-lg"
                              value={customRoll.numDice}
                              onChange={(e) => setCustomRoll({ ...customRoll, numDice: parseInt(e.target.value) || 1 })}
                            />
                          </div>
                          <span className="text-gray-500 font-bold mt-4">d</span>
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] text-gray-500 uppercase mb-1">Faces</span>
                            <Input
                              type="number"
                              className="h-10 w-14 text-center bg-black/40 border-white/10 text-white font-mono text-lg"
                              value={customRoll.numFaces}
                              onChange={(e) => setCustomRoll({ ...customRoll, numFaces: parseInt(e.target.value) || 20 })}
                            />
                          </div>
                          <span className="text-gray-500 font-bold mt-4">+</span>
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] text-gray-500 uppercase mb-1">Mod</span>
                            <Input
                              type="number"
                              className="h-10 w-14 text-center bg-black/40 border-white/10 text-white font-mono text-lg"
                              value={customRoll.modifier}
                              onChange={(e) => setCustomRoll({ ...customRoll, modifier: parseInt(e.target.value) || 0 })}
                            />
                          </div>
                        </div>

                        <Button
                          onClick={() => handleAttack('custom')}
                          className="ml-4 bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 h-10 shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.5)] transition-all"
                        >
                          LANCER
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

              </motion.div>
            )}

            {/* PHASE 2: ROLL RESULT */}
            {(step === 'ATTACK_ROLLING' || step === 'ATTACK_RESULT') && (
              <motion.div
                key="rolling"
                className="flex flex-col items-center justify-center gap-8"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -100 }}
              >
                {step === 'ATTACK_ROLLING' ? (
                  <LoadingSpinner />
                ) : (
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="relative"
                  >
                    <div className="text-[12rem] leading-none font-black text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-400 drop-shadow-2xl">
                      {attackResult}
                    </div>
                    <div className="absolute -bottom-8 inset-x-0 text-center text-xl text-gray-400 font-bold uppercase tracking-[0.5em]">
                      To Hit
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* PHASE 3: WEAPON SELECTION */}
            {step === 'WEAPON_SELECT' && (
              <motion.div
                key="weapons"
                initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -100 }}
                className="w-full max-w-2xl mx-auto flex flex-col h-full"
              >
                <h3 className="text-2xl font-bold uppercase tracking-tight text-center mb-8">Choisissez votre arme</h3>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                    {weapons.map(w => (
                      <WeaponCard key={w.id || w.name} weapon={w} onClick={() => handleDamage(w)} onSoundClick={(e) => openSoundSelector(e, w)} />
                    ))}
                  </div>

                  {/* Custom Input */}
                  <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between gap-4">
                    <span className="font-bold text-gray-400 pl-2">Custom Damage</span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        className="h-9 w-16 text-center bg-black/40 border-white/10 text-white"
                        value={customDamage.numDice} onChange={e => setCustomDamage({ ...customDamage, numDice: parseInt(e.target.value) || 1 })}
                      />
                      <span className="text-gray-500">d</span>
                      <Input
                        type="number"
                        className="h-9 w-16 text-center bg-black/40 border-white/10 text-white"
                        value={customDamage.numFaces} onChange={e => setCustomDamage({ ...customDamage, numFaces: parseInt(e.target.value) || 6 })}
                      />
                      <span className="text-gray-500">+</span>
                      <Input
                        type="number"
                        className="h-9 w-16 text-center bg-black/40 border-white/10 text-white"
                        value={customDamage.modifier} onChange={e => setCustomDamage({ ...customDamage, modifier: parseInt(e.target.value) || 0 })}
                      />
                      <Button onClick={() => handleDamage(null)} className="bg-white/10 hover:bg-white/20">Roll</Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* PHASE 4: DAMAGE RESULT */}
            {(step === 'DAMAGE_ROLLING' || step === 'DAMAGE_RESULT') && (
              <motion.div
                key="dmg"
                className="flex flex-col items-center justify-center gap-8"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              >
                {step === 'DAMAGE_ROLLING' ? (
                  <LoadingSpinner />
                ) : (
                  <div className="text-center relative z-10">
                    <motion.div
                      initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      className="text-[10rem] leading-none font-black text-red-500 drop-shadow-[0_0_60px_rgba(239,68,68,0.5)]"
                    >
                      {damageResult}
                    </motion.div>
                    <div className="text-2xl text-red-400 font-bold uppercase tracking-[0.5em] mt-4">
                      Dégâts
                    </div>

                    <div className="mt-12 flex items-center gap-6 justify-center">
                      <Button onClick={reset} variant="outline" className="h-12 border-white/10 text-gray-400 hover:text-white">
                        Nouvelle Attaque
                      </Button>
                      <Button onClick={onClose} className="h-12 bg-white text-black hover:bg-gray-200 font-bold px-8">
                        Terminer
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Sound Selector Modal Overlay (Advanced) */}
        <AnimatePresence>
          {isSoundSelectorOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[200] bg-[#0a0a0a] flex flex-col"
            >
              {/* HEADER */}
              <div className="p-5 border-b border-[#222] bg-[#111] flex flex-col gap-4 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-[#1e1e1e] flex items-center justify-center border border-[#333]">
                      <Library className="w-5 h-5 text-[var(--accent-brown)]" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">Sélectionner un Son</h2>
                      <p className="text-xs text-gray-500">Choisissez le son d'impact pour {selectedWeaponForSound?.name}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setIsSoundSelectorOpen(false)} className="text-gray-400 hover:text-white">
                    <X className="w-6 h-6" />
                  </Button>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <Input
                    value={soundSearchQuery}
                    onChange={(e) => setSoundSearchQuery(e.target.value)}
                    className="bg-[#1a1a1a] border-[#333] h-10 pl-10 text-sm focus:border-[var(--accent-brown)] placeholder:text-gray-600 text-white"
                    placeholder="Rechercher un son (ex: épée, feu, impact...)"
                    autoFocus
                  />
                </div>
              </div>

              {/* BODY: SIDEBAR + GRID */}
              <div className="flex-1 flex overflow-hidden">

                {/* SIDEBAR: CATEGORIES */}
                <div className="w-48 bg-[#111] border-r border-[#222] flex flex-col shrink-0">
                  <ScrollArea className="flex-1 py-3 px-2">
                    <div className="space-y-1">
                      <Button
                        variant="ghost"
                        onClick={() => setSelectedCategory('all')}
                        className={`w-full justify-start text-xs h-8 ${selectedCategory === 'all' ? 'bg-[var(--accent-brown)]/10 text-[var(--accent-brown)]' : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'}`}
                      >
                        <Volume2 className="w-3 h-3 mr-2" /> Tout voir
                      </Button>
                      <div className="h-px bg-[#222] my-2 mx-1" />
                      <div className="px-2 pb-1 text-[9px] font-semibold text-gray-600 uppercase">Catégories</div>
                      {SOUND_CATEGORIES.map(cat => (
                        <Button
                          key={cat.id}
                          variant="ghost"
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`w-full justify-start text-xs h-8 ${selectedCategory === cat.id ? 'bg-[var(--accent-brown)]/10 text-[var(--accent-brown)]' : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current mr-2.5 opacity-50" />
                          {cat.label}
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {/* MAIN: GRID */}
                <div className="flex-1 bg-[#0a0a0a] flex flex-col min-w-0">
                  <ScrollArea className="flex-1 p-5">
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">

                      {/* Option: Silent */}
                      <div
                        onClick={() => handleSoundSelect("none")}
                        className="group p-3 rounded-xl border border-white/5 bg-[#161616] hover:bg-[#1a1a1a] flex items-center gap-3 cursor-pointer hover:border-white/20 transition-all"
                      >
                        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-500 group-hover:text-white"><Volume2 className="w-5 h-5" /></div>
                        <span className="text-sm font-bold text-gray-400 group-hover:text-white">Silencieux</span>
                      </div>

                      {sounds.filter(s => {
                        const matchesSearch = s.name.toLowerCase().includes(soundSearchQuery.toLowerCase()) || (s.category || '').toLowerCase().includes(soundSearchQuery.toLowerCase())
                        const matchesCat = selectedCategory === 'all' || s.category === selectedCategory
                        return matchesSearch && matchesCat
                      }).map((sound, i) => {
                        const isPlaying = playingPreviewUrl === sound.soundUrl
                        const isSelected = selectedWeaponForSound?.soundId === sound.id

                        return (
                          <div
                            key={sound.id || i}
                            className={`group relative p-3 rounded-xl border transition-all duration-200 bg-[#161616] hover:bg-[#1a1a1a] flex flex-col gap-2 ${isSelected ? 'border-[var(--accent-brown)] bg-[var(--accent-brown)]/5' : 'border-[#222] hover:border-[#444]'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className={`text-sm font-medium truncate ${isSelected ? 'text-[var(--accent-brown)]' : 'text-gray-200'}`}>
                                  {sound.name}
                                </div>
                                <div className="mt-1">
                                  <Badge variant="outline" className="h-[18px] px-1.5 border-[#333] bg-[#111] text-[9px] text-gray-400 font-normal rounded">
                                    {sound.category || 'Custom'}
                                  </Badge>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mt-2">
                              {/* Play Preview */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); togglePreview(sound.soundUrl); }}
                                className={`flex-1 h-8 rounded-lg text-xs font-medium border transition-colors ${isPlaying
                                  ? 'bg-[var(--accent-brown)] text-black border-[var(--accent-brown)] hover:bg-[#d4b494]'
                                  : 'bg-[#111] border-[#333] text-gray-300 hover:bg-[#222] hover:border-[#555]'
                                  }`}
                              >
                                {isPlaying ? (
                                  <><StopCircle className="w-3.5 h-3.5 mr-1.5 animate-pulse" /> Stop</>
                                ) : (
                                  <><PlayCircle className="w-3.5 h-3.5 mr-1.5" /> Écouter</>
                                )}
                              </Button>

                              {/* Select Button */}
                              <Button
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); handleSoundSelect(sound.id); }}
                                className={`h-8 w-8 rounded-lg shrink-0 transition-all ${isSelected
                                  ? 'bg-[var(--accent-brown)] text-black'
                                  : 'bg-[#111] border border-[#333] text-gray-400 hover:text-white hover:border-[var(--accent-brown)] hover:bg-[var(--accent-brown)]/10'
                                  }`}
                              >
                                {isSelected ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </div>
  )
}
