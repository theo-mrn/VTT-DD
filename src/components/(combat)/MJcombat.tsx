import { useState, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer"
import { Plus, Minus, Dice1, ChevronRight, Sword, Skull, Shield, Heart, X, Pencil, Zap, EyeOff, Ghost, Anchor, Flame, Snowflake, Sparkles } from "lucide-react"
import { auth, db, doc, getDoc, onSnapshot, updateDoc, deleteDoc, collection, onAuthStateChanged, writeBatch } from "@/lib/firebase"
import { Dialog, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import poisonIcon from '../../app/[roomid]/map/icons/poison.svg';
import stunIcon from '../../app/[roomid]/map/icons/stun.svg';
import blindIcon from '../../app/[roomid]/map/icons/blind.svg';
import otherIcon from '../../app/[roomid]/map/icons/other.svg';

type Character = {
  cityId?: string
  id: string
  name: string
  avatar: string
  pv: number
  init: number
  initDetails?: string
  type: string
  currentInit?: number
  Defense: number
  stats?: {
    FOR: number
    DEX: number
    CON: number
    INT: number
    SAG: number
    CHA: number
  }
  conditions?: string[]
}

export const CONDITIONS = [
  { id: 'poisoned', label: 'Empoisonné', icon: Skull, iconSrc: poisonIcon, color: 'text-green-500' },
  { id: 'stunned', label: 'Etourdi', icon: Zap, iconSrc: stunIcon, color: 'text-yellow-500' },
  { id: 'blinded', label: 'Aveuglé', icon: EyeOff, iconSrc: blindIcon, color: 'text-gray-500' },
]

function ConditionManager({ character, onToggle }: { character: Character, onToggle: (charId: string, condId: string) => void }) {
  const [customCondition, setCustomCondition] = useState("")

  return (
    <div className="flex flex-col gap-2">
      {/* CONDITIONS TOGGLE */}
      <div className="flex flex-wrap gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 gap-1 px-2 border-dashed border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)]">
              <Plus className="h-3 w-3" /> Effets
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 bg-[var(--bg-card)] border-[var(--border-color)]">
            <div className="space-y-1">
              <h4 className="font-medium text-xs text-[var(--text-secondary)] mb-2 px-2">Veuillez sélectionner un état</h4>
              {CONDITIONS.map((condition) => {
                const Icon = condition.icon
                const isActive = character.conditions?.includes(condition.id)
                return (
                  <Button
                    key={condition.id}
                    variant="ghost"
                    size="sm"
                    className={`w-full justify-start gap-2 h-8 ${isActive ? 'bg-[var(--accent-brown)]/20 text-[var(--accent-brown)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-dark)]'}`}
                    onClick={() => onToggle(character.id, condition.id)}
                  >
                    {condition.iconSrc ? (
                      <img src={condition.iconSrc.src} alt={condition.label} className="w-4 h-4" />
                    ) : (
                      <Icon className={`h-4 w-4 ${condition.color}`} />
                    )}
                    <span className="text-xs">{condition.label}</span>
                    {isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--accent-brown)]" />}
                  </Button>
                )
              })}
              <div className="flex gap-2 pt-2 border-t border-[var(--border-color)]">
                <Input
                  value={customCondition}
                  onChange={(e) => setCustomCondition(e.target.value)}
                  placeholder="Autre..."
                  className="h-8 text-xs bg-[var(--bg-dark)] border-[var(--border-color)]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customCondition.trim()) {
                      onToggle(character.id, customCondition.trim());
                      setCustomCondition("");
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 hover:bg-[var(--bg-dark)]"
                  onClick={() => {
                    if (customCondition.trim()) {
                      onToggle(character.id, customCondition.trim());
                      setCustomCondition("");
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* ACTIVE CONDITIONS LIST */}
      {character.conditions && character.conditions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {character.conditions.map(c => {
            const cond = CONDITIONS.find(def => def.id === c) || { id: c, label: c, icon: Sparkles, iconSrc: otherIcon, color: 'text-purple-400' }
            const Icon = cond.icon
            return (
              <Badge key={c} variant="secondary" className="gap-1 pl-1 pr-2 h-6 bg-[var(--bg-dark)] border border-[var(--border-color)]">
                {cond.iconSrc ? (
                  <img src={cond.iconSrc.src} alt={cond.label} className="w-3 h-3" />
                ) : (
                  <Icon className={`h-3 w-3 ${cond.color}`} />
                )}
                <span className="text-[10px]">{cond.label}</span>
                <Button
                  variant="ghost"
                  className="h-3 w-3 p-0 ml-1 hover:text-red-500 hover:bg-transparent"
                  onClick={(e) => { e.stopPropagation(); onToggle(character.id, c); }}
                >
                  <X className="h-2 w-2" />
                </Button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}

type AttackReport = {
  cible_nom: string
  attaque_result: number
  arme_utilisée: string
  réussite: boolean
  type: string
  degat_result: number
  attaquant: string
  cible: string
  reportId: string
}

export function GMDashboard() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [rawCharacters, setRawCharacters] = useState<Character[]>([])
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null)
  const [currentCityId, setCurrentCityId] = useState<string | null>(null)

  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [selectedAttack, setSelectedAttack] = useState<AttackReport | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isOtherDrawerOpen, setIsOtherDrawerOpen] = useState(false)
  const [hpChange, setHpChange] = useState(0)
  const [damageChange, setDamageChange] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [attackReports, setAttackReports] = useState<AttackReport[]>([])
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null)
  const [isRollingInitiative, setIsRollingInitiative] = useState(false)

  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [viewedCharacter, setViewedCharacter] = useState<Character | null>(null)
  const [customCondition, setCustomCondition] = useState("")

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid)
      } else {
        setUserId(null)
      }
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const fetchRoomId = async () => {
      if (!userId) return
      try {
        const userDoc = await getDoc(doc(db, `users/${userId}`))
        if (userDoc.exists()) {
          const data = userDoc.data()
          setRoomId(data.room_id)
        }
      } catch (error) {
        console.error("Erreur lors de la récupération du roomId :", error)
      }
    }
    fetchRoomId()
  }, [userId])

  // 1. Listen to Room Settings (Active Player & Current City)
  useEffect(() => {
    if (!roomId) return

    const settingsRef = doc(db, `cartes/${roomId}/settings/general`)
    const unsubscribe = onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data()
        setActivePlayerId(data.tour_joueur || null)
        setCurrentCityId(data.currentCityId || null)
      }
    })

    return () => unsubscribe()
  }, [roomId])

  // 2. Listen to All Characters (Raw Data)
  useEffect(() => {
    if (!roomId) return

    const charactersRef = collection(db, `cartes/${roomId}/characters`)
    const unsubscribe = onSnapshot(charactersRef, (snapshot) => {
      const charactersData = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          cityId: data.cityId, // Capture cityId
          name: data.Nomperso || "absente",
          avatar: data.imageURLFinal || data.imageURL || data.imageURL2 || `/placeholder.svg?height=40&width=40&text=${data.Nomperso ? data.Nomperso[0] : "?"}`,
          pv: data.PV ?? 0,
          init: data.INIT ?? 0,
          initDetails: data.initDetails || "0",
          type: data.type || "pnj",
          currentInit: data.currentInit || 0,
          Defense: data.Defense || 10,
          stats: {
            FOR: data.FOR || 10,
            DEX: data.DEX || 10,
            CON: data.CON || 10,
            INT: data.INT || 10,
            SAG: data.SAG || 10,
            CHA: data.CHA || 10,
          },
          conditions: data.conditions || []
        }
      })
      setRawCharacters(charactersData)
    })

    return () => unsubscribe()
  }, [roomId])

  // 3. Compute Display Characters (Filter & Sort)
  useEffect(() => {
    let filteredChars = rawCharacters

    // Filter by City:
    // Keep characters if:
    // - They are PLAYERS (type === 'joueurs')
    // - OR (currentCityId matches character.cityId)
    // - OR (activePlayerId matches character.id) - safety to ensure turn player is always visible? Optional but good practice.
    if (currentCityId) {
      filteredChars = rawCharacters.filter(char => {
        const isPlayer = char.type === 'joueurs';
        const isAlly = char.type === 'allié'; // Assuming 'allié' exists or handled? User said 'pnj' only. 
        // Let's stick to strict: Players kept, others filtered by city.
        // Also check if type is 'joueurs' vs 'pnj'
        if (isPlayer) return true;

        // For NPCs:
        return char.cityId === currentCityId;
      });
    } else {
      // If NO city is selected (World Map mode?), maybe show all? 
      // Or only global ones?
      // User request: "pnj de la ville en cours, et non pas des autres villes"
      // If currentCityId is null, we are likely on World Map.
      // Maybe show NO NPCs? Or all? 
      // Let's assume we filter strictly. If no city selected, maybe only players?
      // But usually combat happens in a city.
      // Let's keep logic: if cityId matches.
      // If currentCityId is null, char.cityId === null ?
    }

    // Refining the filter logic based on user request:
    filteredChars = rawCharacters.filter(char => {
      // Always show players
      if (char.type === 'joueurs' || char.type === 'allié') return true;

      // If we have a current City, show NPCs of that city
      if (currentCityId) {
        return char.cityId === currentCityId;
      }

      // If no current city (World Map), show global NPCs (no cityId?) or everything?
      // Let's default to showing everything if no city filter is active (legacy behavior support), 
      // UNLESS user strictly implies "world map has no city NPCs".
      // But typically we don't want to break "All" view if something is wrong.
      // However, to be "modified to ONLY show...", I should filter.
      // If currentCityId is null, I'll filter out city-bound NPCs?
      // Let's check if 'cityId' is present on char.
      if (char.cityId) return false; // Hide city-specific NPCs on world map
      return true; // Show global NPCs
    });

    const sortedCharacters = filteredChars.sort((a, b) => (b.currentInit ?? 0) - (a.currentInit ?? 0))
    let finalCharacters = [...sortedCharacters]

    if (activePlayerId) {
      const activePlayerIndex = finalCharacters.findIndex((char) => char.id === activePlayerId)
      if (activePlayerIndex > 0) {
        const part1 = finalCharacters.slice(activePlayerIndex)
        const part2 = finalCharacters.slice(0, activePlayerIndex)
        finalCharacters = [...part1, ...part2]
      }
    }

    setCharacters(finalCharacters)
  }, [rawCharacters, currentCityId, activePlayerId])

  useEffect(() => {
    const fetchAttackReports = async () => {
      if (!roomId || characters.length === 0) return

      const firstCharacterId = characters[0]?.id
      if (!firstCharacterId) return

      const rapportRef = collection(db, `cartes/${roomId}/combat/${firstCharacterId}/rapport`)

      const unsubscribe = onSnapshot(rapportRef, (snapshot) => {
        const reportsData = snapshot.docs.map((doc) => {
          const data = doc.data()
          let targetName = data.cible_nom || "Inconnu"

          if ((!targetName || targetName === "Inconnu") && data.cible) {
            const targetChar = characters.find(c => c.id === data.cible)
            if (targetChar) {
              targetName = targetChar.name
            }
          }

          const isSuccess = data.réussite ?? (data.type === "Success" || data.type === "success")

          return {
            cible_nom: targetName,
            attaque_result: data.attaque_result || 0,
            arme_utilisée: data.arme_utilisée || "Inconnu",
            réussite: isSuccess,
            type: data.type || "N/A",
            degat_result: data.degat_result || 0,
            attaquant: data.attaquant || "",
            cible: data.cible || "",
            reportId: doc.id
          }
        })

        setAttackReports(reportsData)
      })

      return () => unsubscribe()
    }

    fetchAttackReports()
  }, [roomId, characters])

  const applyDamage = async (targetId: string, damage: number) => {
    const targetCharacter = characters.find(char => char.id === targetId)
    if (!targetCharacter || !roomId) return

    try {
      const newPv = Math.max(0, targetCharacter.pv - damage)
      const characterRef = doc(db, `cartes/${roomId}/characters/${targetId}`)
      await updateDoc(characterRef, { PV: newPv })

      setCharacters(prevChars =>
        prevChars.map(char => char.id === targetId ? { ...char, pv: newPv } : char)
      )
    } catch (error) {
      console.error("Erreur lors de l'application des dégâts :", error)
    }
  }

  const rerollInitiative = async () => {
    if (isRollingInitiative) return
    setIsRollingInitiative(true)
    const updatedCharacters = characters.map(char => {
      const diceRoll = Math.floor(Math.random() * 20) + 1
      const initValue = parseInt(char.init as unknown as string, 10) || 0
      const totalInit = initValue + diceRoll
      return {
        ...char,
        currentInit: totalInit,
        initDetails: `${initValue}+${diceRoll}=${totalInit}`
      }
    })
    const sortedCharacters = updatedCharacters.sort((a, b) => (b.currentInit ?? 0) - (a.currentInit ?? 0))
    setCharacters(sortedCharacters)

    if (roomId) {
      try {
        const batch = writeBatch(db)
        sortedCharacters.forEach(char => {
          const characterRef = doc(db, `cartes/${roomId}/characters/${char.id}`)
          batch.update(characterRef, { currentInit: char.currentInit, initDetails: char.initDetails })
        })
        await batch.commit()

        const newActiveCharacterId = sortedCharacters[0].id
        const settingsRef = doc(db, `cartes/${roomId}/settings/general`)
        await updateDoc(settingsRef, { tour_joueur: newActiveCharacterId })
      } catch (error) {
        console.error("Erreur lors de la mise à jour des initiatives :", error)
      }
    }
    setIsRollingInitiative(false)
  }

  const confirmDeleteCharacter = (character: Character) => {
    setCharacterToDelete(character)
    setIsConfirmDialogOpen(true)
  }

  const handleDeleteCharacter = async () => {
    if (!characterToDelete || !roomId) return

    const firstCharacterId = characterToDelete.id
    const combatRef = collection(db, `cartes/${roomId}/combat/${firstCharacterId}/rapport`)

    const reportsToDelete = attackReports.filter(report => report.attaquant === firstCharacterId)
    for (const report of reportsToDelete) {
      const reportRef = doc(combatRef, report.reportId)
      await deleteDoc(reportRef)
    }

    setCharacters(prevChars => {
      const [first, ...rest] = prevChars
      return [...rest, first]
    })

    try {
      const newActiveCharacterId = characters[1].id
      const settingsRef = doc(db, `cartes/${roomId}/settings/general`)
      await updateDoc(settingsRef, { tour_joueur: newActiveCharacterId })
    } catch (error) {
      console.error("Erreur lors de la mise à jour de tour_joueur :", error)
    }

    setIsConfirmDialogOpen(false)
    setCharacterToDelete(null)
  }

  const nextCharacter = async () => {
    if (!roomId || characters.length === 0) return

    const firstCharacter = characters[0]
    const combatRef = collection(db, `cartes/${roomId}/combat/${firstCharacter.id}/rapport`)

    const reportsToDelete = attackReports.filter(report => report.attaquant === firstCharacter.id)
    for (const report of reportsToDelete) {
      const reportRef = doc(combatRef, report.reportId)
      await deleteDoc(reportRef)
    }

    const newCharacters = [...characters.slice(1), firstCharacter]
    setCharacters(newCharacters)

    try {
      const newActiveCharacterId = newCharacters[0].id
      const settingsRef = doc(db, `cartes/${roomId}/settings/general`)
      await updateDoc(settingsRef, { tour_joueur: newActiveCharacterId })
    } catch (error) {
      console.error("Erreur lors de la mise à jour de tour_joueur :", error)
    }
  }

  const openDrawer = (character: Character) => {
    setSelectedCharacter(character)
    setIsDrawerOpen(true)
    setHpChange(0)
  }

  const openOtherDrawer = (attack: AttackReport) => {
    setSelectedAttack(attack)
    setIsOtherDrawerOpen(true)
    setDamageChange(attack.degat_result)
    setSelectedTarget(attack.cible)
  }

  const updateCharacterHP = async () => {
    if (selectedCharacter && roomId) {
      try {
        const newPv = Math.max(0, selectedCharacter.pv + hpChange)
        const characterRef = doc(db, `cartes/${roomId}/characters/${selectedCharacter.id}`)
        await updateDoc(characterRef, { PV: newPv })
        setCharacters(prevChars =>
          prevChars.map(char => char.id === selectedCharacter.id ? { ...char, pv: newPv } : char)
        )
      } catch (error) {
        console.error("Erreur lors de la mise à jour des PV :", error)
      } finally {
        setIsDrawerOpen(false)
      }
    }
  }

  const applyManualDamage = async () => {
    if (selectedAttack && selectedTarget && roomId) {
      await applyDamage(selectedTarget, damageChange)
      setIsOtherDrawerOpen(false)
    }
  }

  const toggleCondition = async (characterId: string, conditionId: string) => {
    if (!roomId) return

    const char = characters.find(c => c.id === characterId)
    if (!char) return

    const currentConditions = char.conditions || []
    let newConditions: string[]

    if (currentConditions.includes(conditionId)) {
      newConditions = currentConditions.filter(c => c !== conditionId)
    } else {
      newConditions = [...currentConditions, conditionId]
    }

    try {
      const characterRef = doc(db, `cartes/${roomId}/characters/${characterId}`)
      await updateDoc(characterRef, { conditions: newConditions })
    } catch (error) {
      console.error("Erreur lors de la mise à jour des conditions :", error)
    }
  }

  const activeCharacter = characters[0]

  return (
    <div className="h-full flex flex-col gap-6 p-6 bg-[var(--bg-dark)] text-[var(--text-primary)] overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-color)] shadow-sm">
        <div className="flex items-center gap-3">
          <Sword className="h-6 w-6 text-[var(--accent-brown)]" />
          <h1 className="text-2xl font-bold tracking-tight">Combat </h1>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={rerollInitiative} disabled={isRollingInitiative} className="border-[var(--border-color)] hover:bg-[var(--bg-darker)]">
            <Dice1 className="mr-2 h-4 w-4" />
            Relancer Init
          </Button>
          <Button className="button-primary" onClick={nextCharacter}>
            <ChevronRight className="mr-2 h-4 w-4" />
            Suivant
          </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-0">

        {/* Turn Order Panel (List - Left, slightly larger) */}
        <div className="lg:col-span-5 flex flex-col min-h-0">
          <Card className="flex-1 flex flex-col bg-[var(--bg-card)] border-[var(--border-color)] shadow-md overflow-hidden">
            <CardHeader className="pb-3 border-b border-[var(--border-color)]">
              <CardTitle className="flex items-center gap-2">
                <Dice1 className="h-5 w-5 text-[var(--text-secondary)]" />
                Ordre du Tour
              </CardTitle>
            </CardHeader>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {characters.slice(1).map((char, index) => (
                  <div
                    key={char.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-dark)] border border-[var(--border-color)] hover:border-[var(--accent-brown)] transition-colors group cursor-pointer"
                    onClick={() => setViewedCharacter(char)}
                  >
                    <div className="font-mono text-lg font-bold text-[var(--text-secondary)] w-6 text-center">
                      {index + 2}
                    </div>
                    <Avatar className="h-10 w-10 border border-[var(--border-color)]">
                      <AvatarImage src={char.avatar} />
                      <AvatarFallback>{char.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-[var(--text-primary)]">{char.name}</div>
                      <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
                        <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {char.pv}</span>
                        <span className="flex items-center gap-1"><Dice1 className="h-3 w-3" /> {char.initDetails}</span>
                        {char.conditions && char.conditions.length > 0 && (
                          <div className="flex gap-1 ml-2">
                            {char.conditions.map(c => {
                              const cond = CONDITIONS.find(def => def.id === c) || { id: c, label: c, icon: Sparkles, iconSrc: otherIcon, color: 'text-purple-400' }
                              const Icon = cond.icon
                              return cond.iconSrc ? (
                                <img key={c} src={cond.iconSrc.src} alt={c} className="h-3 w-3" />
                              ) : (
                                <Icon key={c} className={`h-3 w-3 ${cond.color}`} />
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8" onClick={(e) => { e.stopPropagation(); openDrawer(char); }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {characters.length <= 1 && (
                  <div className="text-center py-4 text-[var(--text-secondary)] text-sm">
                    Aucun autre personnage en attente.
                  </div>
                )}
              </div>
            </ScrollArea>
          </Card>
        </div>

        {/* Right Column: Target & Active Character */}
        <div className="lg:col-span-7 flex flex-col gap-4 min-h-0">

          {/* Viewed Character Panel (if selected) */}
          {viewedCharacter && (
            <Card className="h-fit flex flex-col border-blue-500/50 border-2 bg-[var(--bg-card)] shadow-lg overflow-hidden relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6 z-10 hover:bg-red-500/20 hover:text-red-500"
                onClick={() => setViewedCharacter(null)}
              >
                <X className="h-4 w-4" />
              </Button>
              <CardHeader className="pb-2 bg-blue-950/10">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16 border-2 border-blue-500/50 shadow-md">
                    <AvatarImage src={viewedCharacter.avatar} alt={viewedCharacter.name} className="object-cover" />
                    <AvatarFallback className="text-xl bg-[var(--bg-darker)]">{viewedCharacter.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-xl font-bold text-[var(--text-primary)]">{viewedCharacter.name}</h2>
                        </div>
                        <div className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-[var(--text-secondary)] border-blue-500/30">
                            {viewedCharacter.type.toUpperCase()}
                          </Badge>
                          <Badge className="bg-blue-900/50 text-blue-200 hover:bg-blue-900/70">
                            INIT: {viewedCharacter.currentInit}
                          </Badge>

                          {/* CONDITIONS TOGGLE & LIST */}
                          <ConditionManager character={viewedCharacter} onToggle={toggleCondition} />
                        </div>
                      </div>
                      <div className="text-right pr-8">
                        <div className="flex items-center justify-end gap-3">
                          <div className="flex flex-col items-center">
                            <span className="text-xs text-[var(--text-secondary)] font-bold uppercase">DEF</span>
                            <span className="text-xl font-bold text-[var(--text-primary)]">{viewedCharacter.Defense}</span>
                          </div>
                          <div className="h-8 w-px bg-[var(--border-color)]"></div>
                          <div className="flex flex-col items-end">
                            <div className="flex items-center gap-1 text-xl font-bold text-[var(--text-primary)]">
                              <Heart className="h-5 w-5 text-red-500 fill-red-500" />
                              {viewedCharacter.pv}
                            </div>
                            <Button variant="link" className="text-blue-400 p-0 h-auto text-xs" onClick={() => openDrawer(viewedCharacter)}>
                              Ajuster PV
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 pb-4">
                <div className="grid grid-cols-6 gap-2">
                  {viewedCharacter.stats && Object.entries(viewedCharacter.stats).map(([stat, value]) => {
                    const mod = Math.floor(((value as number) - 10) / 2)
                    const modString = mod >= 0 ? `+${mod}` : `${mod}`
                    return (
                      <div key={stat} className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded p-1 text-center">
                        <div className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{stat}</div>
                        <div className="font-mono font-bold text-sm text-[var(--text-primary)]">
                          {value} <span className="text-[10px] text-[var(--text-secondary)]">({modString})</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Target Panel (if exists) */}
          {(() => {
            const targetId = attackReports[0]?.cible
            const targetCharacter = characters.find(c => c.id === targetId)

            if (!targetCharacter) return null

            return (
              <Card className="h-fit flex flex-col border-red-900/30 border-2 bg-[var(--bg-card)] shadow-lg overflow-hidden">
                <CardHeader className="pb-2 bg-red-950/10">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 border-2 border-red-900/30 shadow-md">
                      <AvatarImage src={targetCharacter.avatar} alt={targetCharacter.name} className="object-cover" />
                      <AvatarFallback className="text-xl bg-[var(--bg-darker)]">{targetCharacter.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <Skull className="h-4 w-4 text-red-500" />
                            <h2 className="text-xl font-bold text-[var(--text-primary)]">Cible: {targetCharacter.name}</h2>
                          </div>
                          <div className="flex flex-col gap-2 mt-1">
                            <Badge variant="outline" className="text-[var(--text-secondary)] border-red-900/30 w-fit">
                              {targetCharacter.type.toUpperCase()}
                            </Badge>
                            <ConditionManager character={targetCharacter} onToggle={toggleCondition} />
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center justify-end gap-3">
                            <div className="flex flex-col items-center">
                              <span className="text-xs text-[var(--text-secondary)] font-bold uppercase">DEF</span>
                              <span className="text-xl font-bold text-[var(--text-primary)]">{targetCharacter.Defense}</span>
                            </div>
                            <div className="h-8 w-px bg-[var(--border-color)]"></div>
                            <div className="flex flex-col items-end">
                              <Button
                                variant="ghost"
                                className="flex items-center gap-2 h-auto p-1 px-2 hover:bg-white/5 -mr-2"
                                onClick={() => openDrawer(targetCharacter)}
                              >
                                <Heart className="h-5 w-5 text-red-500 fill-red-500" />
                                <span className="text-xl font-bold text-[var(--text-primary)]">{targetCharacter.pv}</span>
                                <Pencil className="h-3 w-3 text-[var(--text-secondary)] opacity-50 ml-1" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 pb-4">
                  {/* Target Stats */}
                  <div className="grid grid-cols-6 gap-2">
                    {targetCharacter.stats && Object.entries(targetCharacter.stats).map(([stat, value]) => {
                      const mod = Math.floor(((value as number) - 10) / 2)
                      const modString = mod >= 0 ? `+${mod}` : `${mod}`
                      return (
                        <div key={stat} className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded p-1 text-center">
                          <div className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{stat}</div>
                          <div className="font-mono font-bold text-sm text-[var(--text-primary)]">
                            {value} <span className="text-[10px] text-[var(--text-secondary)]">({modString})</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })()}

          {/* Active Character Panel */}
          {activeCharacter ? (
            <Card className="flex-1 min-h-0 flex flex-col border-[var(--accent-brown)] border-2 bg-[var(--bg-card)] shadow-lg overflow-hidden">
              <CardHeader className="pb-2 bg-[var(--accent-brown)]/5">
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20 border-2 border-[var(--accent-brown)] shadow-md">
                    <AvatarImage src={activeCharacter.avatar} alt={activeCharacter.name} className="object-cover" />
                    <AvatarFallback className="text-2xl bg-[var(--bg-darker)]">{activeCharacter.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <Sword className="h-5 w-5 text-[var(--accent-brown)]" />
                          <h2 className="text-2xl font-bold text-[var(--text-primary)]">{activeCharacter.name}</h2>
                        </div>
                        <div className="flex flex-col gap-2 mt-1">
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-[var(--text-secondary)] border-[var(--border-color)]">
                              {activeCharacter.type.toUpperCase()}
                            </Badge>
                            <Badge className="bg-[var(--accent-brown)] hover:bg-[var(--accent-brown)]/90">
                              INIT: {activeCharacter.currentInit}
                            </Badge>
                          </div>
                          <ConditionManager character={activeCharacter} onToggle={toggleCondition} />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-4">
                          <div className="flex flex-col items-center">
                            <span className="text-xs text-[var(--text-secondary)] font-bold uppercase">DEF</span>
                            <span className="text-2xl font-bold text-[var(--text-primary)]">{activeCharacter.Defense}</span>
                          </div>
                          <div className="h-10 w-px bg-[var(--border-color)]"></div>
                          <div className="flex flex-col items-end">
                            <Button
                              variant="ghost"
                              className="flex items-center gap-2 h-auto p-1 px-2 hover:bg-white/5 -mr-2"
                              onClick={() => openDrawer(activeCharacter)}
                            >
                              <Heart className="h-6 w-6 text-red-500 fill-red-500" />
                              <span className="text-2xl font-bold text-[var(--text-primary)]">{activeCharacter.pv}</span>
                              <Pencil className="h-4 w-4 text-[var(--text-secondary)] opacity-50 ml-1" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-4 px-6 flex-1 flex flex-col gap-4 overflow-y-auto">
                {/* Active Stats Section */}
                <div className="grid grid-cols-6 gap-2">
                  {activeCharacter.stats && Object.entries(activeCharacter.stats).map(([stat, value]) => {
                    const mod = Math.floor(((value as number) - 10) / 2)
                    const modString = mod >= 0 ? `+${mod}` : `${mod}`
                    return (
                      <div key={stat} className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded p-2 text-center">
                        <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{stat}</div>
                        <div className="font-mono font-bold text-[var(--text-primary)]">
                          {value} <span className="text-xs text-[var(--text-secondary)]">({modString})</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <Separator className="bg-[var(--border-color)]" />

                <div className="flex-1">
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <Sword className="h-4 w-4 text-[var(--text-secondary)]" />
                    Rapports d'Attaque
                  </h3>
                  {attackReports.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {attackReports.map((report) => (
                        <Card key={report.reportId} className="bg-[var(--bg-dark)] border-[var(--border-color)]">
                          <CardHeader className="p-3 pb-1">
                            <CardTitle className="text-sm flex justify-between items-center">
                              <span className="truncate">{report.arme_utilisée}</span>
                              <Badge variant={report.réussite ? "default" : "destructive"} className="text-xs px-1.5 py-0">
                                {report.réussite ? "Touché" : "Manqué"}
                              </Badge>
                            </CardTitle>
                            <CardDescription className="text-xs truncate">
                              Cible: <span className="text-[var(--text-primary)] font-medium">{report.cible_nom}</span>
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="p-3 pt-1 text-xs">
                            <div className="flex justify-between mb-1">
                              <span className="text-[var(--text-secondary)]">Jet:</span>
                              <span className="font-mono font-bold">{report.attaque_result}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[var(--text-secondary)]">Dégâts:</span>
                              <span className="font-mono font-bold text-red-400">{report.degat_result}</span>
                            </div>
                          </CardContent>
                          <CardFooter className="p-3 pt-0">
                            <Button size="sm" className="w-full h-7 text-xs button-secondary" onClick={() => openOtherDrawer(report)}>
                              Appliquer
                            </Button>
                          </CardFooter>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-[var(--text-secondary)] bg-[var(--bg-dark)]/50 rounded-lg border border-dashed border-[var(--border-color)] text-sm">
                      Aucune attaque enregistrée.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] border-2 border-dashed border-[var(--border-color)] rounded-xl">
              Aucun personnage actif
            </div>
          )}
        </div>
      </div>

      {/* Drawers and Dialogs */}
      <Drawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        <DrawerContent className="bg-[var(--bg-card)] border-t border-[var(--border-color)] max-w-2xl mx-auto">
          <DrawerHeader>
            <DrawerTitle className="text-[var(--text-primary)] text-center text-2xl">Ajuster les PV</DrawerTitle>
            <DrawerDescription className="text-[var(--text-secondary)] text-center">
              {selectedCharacter?.name} (Actuel: {selectedCharacter?.pv})
            </DrawerDescription>
          </DrawerHeader>
          <div className="p-8 flex items-center justify-center gap-8">
            <Button variant="outline" size="icon" className="h-16 w-16 rounded-full border-2 border-[var(--border-color)] hover:bg-red-500/10 hover:border-red-500 hover:text-red-500 transition-all" onClick={() => setHpChange(prev => prev - 1)}>
              <Minus className="h-8 w-8" />
            </Button>
            <div className={`text-6xl font-bold font-mono ${hpChange > 0 ? 'text-green-500' : hpChange < 0 ? 'text-red-500' : 'text-[var(--text-primary)]'}`}>
              {hpChange > 0 ? `+${hpChange}` : hpChange}
            </div>
            <Button variant="outline" size="icon" className="h-16 w-16 rounded-full border-2 border-[var(--border-color)] hover:bg-green-500/10 hover:border-green-500 hover:text-green-500 transition-all" onClick={() => setHpChange(prev => prev + 1)}>
              <Plus className="h-8 w-8" />
            </Button>
          </div>
          <DrawerFooter className="flex-row justify-center gap-4">
            <Button className="button-cancel w-32" onClick={() => setIsDrawerOpen(false)}>Annuler</Button>
            <Button className="button-primary w-32" onClick={updateCharacterHP}>Confirmer</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={isOtherDrawerOpen} onClose={() => setIsOtherDrawerOpen(false)}>
        <DrawerContent className="bg-[var(--bg-card)] border-t border-[var(--border-color)] max-w-2xl mx-auto">
          <DrawerHeader>
            <DrawerTitle className="text-[var(--text-primary)] text-center text-2xl">Appliquer Dégâts</DrawerTitle>
            <DrawerDescription className="text-center">
              Source: {selectedAttack?.attaquant} | Arme: {selectedAttack?.arme_utilisée}
            </DrawerDescription>
          </DrawerHeader>
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Cible</label>
              <Select value={selectedTarget || ""} onValueChange={setSelectedTarget}>
                <SelectTrigger className="w-full bg-[var(--bg-dark)] border-[var(--border-color)] h-12 text-lg">
                  <SelectValue placeholder="Choisir une cible" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--bg-card)] border-[var(--border-color)]">
                  {characters.map((character) => (
                    <SelectItem key={character.id} value={character.id}>
                      {character.name} ({character.pv} PV)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-center gap-8 py-4">
              <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => setDamageChange(prev => Math.max(0, prev - 1))}>
                <Minus className="h-6 w-6" />
              </Button>
              <div className="text-5xl font-bold text-red-500 font-mono">{damageChange}</div>
              <Button variant="outline" size="icon" className="h-12 w-12" onClick={() => setDamageChange(prev => prev + 1)}>
                <Plus className="h-6 w-6" />
              </Button>
            </div>
          </div>
          <DrawerFooter className="flex-row justify-center gap-4">
            <Button className="button-cancel w-32" onClick={() => setIsOtherDrawerOpen(false)}>Annuler</Button>
            <Button className="button-primary w-32" onClick={applyManualDamage}>Appliquer</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogPortal>
          <DialogOverlay className="bg-black/50 backdrop-blur-sm" />
          <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)]">
            <DialogHeader>
              <DialogTitle className="text-[var(--text-primary)]">Confirmation de suppression</DialogTitle>
              <DialogDescription className="text-[var(--text-secondary)]">
                Êtes-vous sûr de vouloir supprimer le personnage <span className="font-bold text-[var(--text-primary)]">{characterToDelete?.name}</span> ?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsConfirmDialogOpen(false)}>Annuler</Button>
              <Button variant="destructive" onClick={handleDeleteCharacter}>Supprimer</Button>
            </DialogFooter>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div >
  )
}

export default GMDashboard
