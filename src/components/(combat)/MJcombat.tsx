import { useState, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer"
import { Plus, Minus, Dice1, ChevronRight, ChevronLeft, Sword, Skull, Shield, Heart, X, Pencil, Zap, EyeOff, Ghost, Anchor, Flame, Snowflake, Sparkles, Check, type LucideIcon } from "lucide-react"
import { db, doc, getDoc, onSnapshot, updateDoc, setDoc, deleteDoc, collection, writeBatch } from "@/lib/firebase"
import { useGame } from '@/contexts/GameContext'
import { trackDamageDealtByCharacter } from '@/lib/challenge-tracker'
import { logHistoryEvent } from '@/lib/historiqueTrackerService'
import { Dialog, DialogTrigger, DialogPortal, DialogOverlay, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { toast } from 'sonner'
import poisonIcon from '../../app/[roomid]/map/icons/poison.svg';
import stunIcon from '../../app/[roomid]/map/icons/stun.svg';
import blindIcon from '../../app/[roomid]/map/icons/blind.svg';
import otherIcon from '../../app/[roomid]/map/icons/other.svg';
import { LightRays } from "@/components/ui/light-rays"


type Character = {
  cityId?: string
  currentSceneId?: string // Track which scene/city the character is in
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
  applied: boolean
}

// Carte compacte réutilisable (Personnage actif / Cible) : avatar + PV + DEF seulement,
// pour laisser un maximum de place aux rapports d'attaque. Toute la ligne est cliquable
// et ouvre le détail (stats, conditions) en grand dans un Dialog.
function CompactCharacterCard({
  character,
  accent,
  label,
  icon: Icon,
  onToggleCondition,
  onAdjustHP,
}: {
  character: Character
  accent: 'brown' | 'red' | 'blue'
  label: string
  icon: LucideIcon
  onToggleCondition: (charId: string, condId: string) => void
  onAdjustHP: (character: Character) => void
}) {
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const accentClasses = {
    brown: { border: 'border-[var(--accent-brown)]', bg: 'bg-[var(--accent-brown)]/5', text: 'text-[var(--accent-brown)]' },
    red: { border: 'border-red-900/40', bg: 'bg-red-950/10', text: 'text-red-500' },
    blue: { border: 'border-blue-500/50', bg: 'bg-blue-950/10', text: 'text-blue-400' },
  }[accent]

  return (
    <>
      <Card
        className={`h-fit flex-shrink-0 border-2 ${accentClasses.border} bg-[var(--bg-card)] shadow-md overflow-hidden cursor-pointer hover:brightness-110 transition-[filter]`}
        onClick={() => setIsDetailOpen(true)}
      >
        <div className={`flex items-center gap-2 p-2 sm:p-2.5 ${accentClasses.bg}`}>
          <Avatar className={`h-10 w-10 shrink-0 border-2 ${accentClasses.border}`}>
            <AvatarImage src={character.avatar} alt={character.name} className="object-cover" />
            <AvatarFallback className="bg-[var(--bg-darker)]">{character.name[0]}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-0.5">
              <Icon className={`h-3 w-3 shrink-0 ${accentClasses.text}`} />
              <span className={`text-[9px] font-bold uppercase tracking-wider truncate ${accentClasses.text}`}>{label}</span>
            </div>
            <h2 className="text-sm font-bold text-[var(--text-primary)] truncate">{character.name}</h2>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="flex flex-col items-center">
              <span className="text-[8px] text-[var(--text-secondary)] font-bold uppercase">DEF</span>
              <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">{character.Defense}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[8px] text-[var(--text-secondary)] font-bold uppercase">PV</span>
              <span className="flex items-center gap-0.5 text-xs sm:text-sm font-bold text-[var(--text-primary)]">
                <Heart className="h-3 w-3 text-red-500 fill-red-500" />
                {character.pv}
              </span>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
          </div>
        </div>
      </Card>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogPortal>
          <DialogOverlay className="bg-black/60 backdrop-blur-sm" />
          <DialogContent className="sm:max-w-2xl bg-[var(--bg-card)] border-[var(--border-color)]">
            <DialogHeader>
              <div className="flex items-center gap-4">
                <Avatar className={`h-16 w-16 shrink-0 border-2 ${accentClasses.border} shadow-md`}>
                  <AvatarImage src={character.avatar} alt={character.name} className="object-cover" />
                  <AvatarFallback className="text-xl bg-[var(--bg-darker)]">{character.name[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 text-left">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-4 w-4 shrink-0 ${accentClasses.text}`} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${accentClasses.text}`}>{label}</span>
                  </div>
                  <DialogTitle className="text-2xl truncate">{character.name}</DialogTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[var(--text-secondary)] border-[var(--border-color)]">
                      {character.type.toUpperCase()}
                    </Badge>
                    {character.currentInit !== undefined && (
                      <Badge className="bg-[var(--accent-brown)]">INIT: {character.currentInit}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="flex items-stretch gap-3 mt-2">
              <div className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[var(--bg-dark)] border border-[var(--border-color)] py-3">
                <Shield className="h-5 w-5 text-[var(--text-secondary)]" />
                <span className="text-xs text-[var(--text-secondary)] uppercase font-bold">DEF</span>
                <span className="text-2xl font-bold text-[var(--text-primary)]">{character.Defense}</span>
              </div>
              <button
                onClick={() => onAdjustHP(character)}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[var(--bg-dark)] border border-[var(--border-color)] py-3 hover:brightness-110 transition-[filter]"
              >
                <Heart className="h-5 w-5 text-red-500 fill-red-500" />
                <span className="text-2xl font-bold text-[var(--text-primary)]">{character.pv}</span>
                <Pencil className="h-3.5 w-3.5 text-[var(--text-secondary)] opacity-60" />
              </button>
            </div>

            <div className="mt-3">
              <ConditionManager character={character} onToggle={onToggleCondition} />
            </div>

            {character.stats && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
                {Object.entries(character.stats).map(([stat, value]) => {
                  const mod = Math.floor(((value as number) - 10) / 2)
                  const modString = mod >= 0 ? `+${mod}` : `${mod}`
                  return (
                    <div key={stat} className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded p-2 text-center">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{stat}</div>
                      <div className="font-mono font-bold text-sm text-[var(--text-primary)]">
                        {value} <span className="text-[10px] text-[var(--text-secondary)]">({modString})</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </>
  )
}

// Bouton compact listant toutes les cibles distinctes des rapports d'attaque en cours.
// Ouvre un Dialog avec un menu de sélection ; cliquer une cible bascule le MÊME dialog
// vers sa vue détail (stats/conditions), avec un bouton Retour vers la liste — jamais
// de nouvelle carte dans la pile de droite.
function TargetsButton({
  attackReports,
  characters,
  onToggleCondition,
  onAdjustHP,
}: {
  attackReports: AttackReport[]
  characters: Character[]
  onToggleCondition: (charId: string, condId: string) => void
  onAdjustHP: (character: Character) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const targetCharacters = Array.from(new Set(attackReports.map(r => r.cible).filter(Boolean)))
    .map(id => characters.find(c => c.id === id))
    .filter((c): c is Character => !!c)

  if (targetCharacters.length === 0) return null

  const selectedCharacter = targetCharacters.find(c => c.id === selectedId) || null

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) setSelectedId(null)
  }

  return (
    <>
      <Card
        className="h-fit flex-shrink-0 border-2 border-red-900/40 bg-[var(--bg-card)] shadow-md overflow-hidden cursor-pointer hover:brightness-110 transition-[filter]"
        onClick={() => {
          // Une seule cible : sauter directement au détail, pas de sous-menu inutile.
          if (targetCharacters.length === 1) setSelectedId(targetCharacters[0].id)
          setIsOpen(true)
        }}
      >
        <div className="flex items-center gap-2 p-2 sm:p-2.5 bg-red-950/10">
          <div className="flex -space-x-2 shrink-0">
            {targetCharacters.slice(0, 4).map((c, i) => (
              <Avatar key={c.id} className="h-8 w-8 border-2 border-[var(--bg-card)]" style={{ zIndex: targetCharacters.length - i }}>
                <AvatarImage src={c.avatar} alt={c.name} className="object-cover" />
                <AvatarFallback className="text-xs bg-[var(--bg-darker)]">{c.name[0]}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <Skull className="h-3.5 w-3.5 shrink-0 text-red-500" />
            <span className="text-sm font-bold text-[var(--text-primary)] truncate">
              {targetCharacters.length > 1 ? `Cibles (${targetCharacters.length})` : `Cible : ${targetCharacters[0].name}`}
            </span>
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--text-secondary)] shrink-0" />
        </div>
      </Card>

      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogPortal>
          <DialogOverlay className="bg-black/60 backdrop-blur-sm" />
          <DialogContent className="sm:max-w-md bg-[var(--bg-card)] border-[var(--border-color)]">
            {selectedCharacter ? (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 shrink-0 border-2 border-red-900/40 shadow-md">
                      <AvatarImage src={selectedCharacter.avatar} alt={selectedCharacter.name} className="object-cover" />
                      <AvatarFallback className="text-xl bg-[var(--bg-darker)]">{selectedCharacter.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 text-left">
                      <div className="flex items-center gap-1.5">
                        <Skull className="h-4 w-4 shrink-0 text-red-500" />
                        <span className="text-xs font-bold uppercase tracking-wider text-red-500">Cible</span>
                      </div>
                      <DialogTitle className="text-2xl truncate">{selectedCharacter.name}</DialogTitle>
                      <Badge variant="outline" className="text-[var(--text-secondary)] border-[var(--border-color)] mt-1">
                        {selectedCharacter.type.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex items-stretch gap-3 mt-2">
                  <div className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[var(--bg-dark)] border border-[var(--border-color)] py-3">
                    <Shield className="h-5 w-5 text-[var(--text-secondary)]" />
                    <span className="text-xs text-[var(--text-secondary)] uppercase font-bold">DEF</span>
                    <span className="text-2xl font-bold text-[var(--text-primary)]">{selectedCharacter.Defense}</span>
                  </div>
                  <button
                    onClick={() => onAdjustHP(selectedCharacter)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[var(--bg-dark)] border border-[var(--border-color)] py-3 hover:brightness-110 transition-[filter]"
                  >
                    <Heart className="h-5 w-5 text-red-500 fill-red-500" />
                    <span className="text-2xl font-bold text-[var(--text-primary)]">{selectedCharacter.pv}</span>
                    <Pencil className="h-3.5 w-3.5 text-[var(--text-secondary)] opacity-60" />
                  </button>
                </div>

                <div className="mt-3">
                  <ConditionManager character={selectedCharacter} onToggle={onToggleCondition} />
                </div>

                {selectedCharacter.stats && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
                    {Object.entries(selectedCharacter.stats).map(([stat, value]) => {
                      const mod = Math.floor(((value as number) - 10) / 2)
                      const modString = mod >= 0 ? `+${mod}` : `${mod}`
                      return (
                        <div key={stat} className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded p-2 text-center">
                          <div className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)] font-bold">{stat}</div>
                          <div className="font-mono font-bold text-sm text-[var(--text-primary)]">
                            {value} <span className="text-[10px] text-[var(--text-secondary)]">({modString})</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {targetCharacters.length > 1 && (
                  <Button variant="outline" className="mt-4 border-[var(--border-color)]" onClick={() => setSelectedId(null)}>
                    <ChevronLeft className="h-4 w-4 mr-2" /> Retour à la liste
                  </Button>
                )}
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Cibles de l'attaque</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-2 mt-2">
                  {targetCharacters.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--bg-dark)] border border-[var(--border-color)] hover:border-red-500/50 transition-colors text-left"
                    >
                      <Avatar className="h-10 w-10 border border-[var(--border-color)]">
                        <AvatarImage src={c.avatar} alt={c.name} className="object-cover" />
                        <AvatarFallback>{c.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-[var(--text-primary)]">{c.name}</div>
                        <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
                          <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {c.pv}</span>
                          <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> {c.Defense}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </>
  )
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
  const { user } = useGame()
  const roomId = user?.roomId ?? null
  const [attackReports, setAttackReports] = useState<AttackReport[]>([])
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null)
  const [isRollingInitiative, setIsRollingInitiative] = useState(false)

  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [viewedCharacter, setViewedCharacter] = useState<Character | null>(null)
  const [customCondition, setCustomCondition] = useState("")

  // 1. Listen to Current City from Settings
  useEffect(() => {
    if (!roomId) return

    const settingsRef = doc(db, `cartes/${roomId}/settings/general`)
    const unsubscribe = onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data()
        setCurrentCityId(data.currentCityId || null)
      }
    })

    return () => unsubscribe()
  }, [roomId])

  // 2. Listen to Active Player for Current City
  useEffect(() => {
    if (!roomId || !currentCityId) {
      setActivePlayerId(null)
      return
    }

    const combatRef = doc(db, `cartes/${roomId}/cities/${currentCityId}/combat/state`)
    const unsubscribe = onSnapshot(combatRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data()
        setActivePlayerId(data.activePlayer || null)
      } else {
        setActivePlayerId(null)
      }
    })

    return () => unsubscribe()
  }, [roomId, currentCityId])

  // 2. Listen to All Characters (Raw Data)
  useEffect(() => {
    if (!roomId) return

    const charactersRef = collection(db, `cartes/${roomId}/characters`)
    const unsubscribe = onSnapshot(charactersRef, (snapshot) => {
      const charactersData = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          cityId: data.cityId, // Capture cityId (legacy)
          currentSceneId: data.currentSceneId, // Capture current scene location
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
    const filteredChars = rawCharacters.filter(char => {
      // For PLAYERS: show if following group (no assignment) OR explicitly in this scene
      if (char.type === 'joueurs') {
        // Always show players following the group (no specific scene assignment)
        if (!char.currentSceneId) {
          return true;
        }
        // Show players explicitly assigned to this scene
        if (char.currentSceneId === currentCityId) {
          return true;
        }
        return false;
      }

      // For ALLIES: same logic as players
      if (char.type === 'allié') {
        // Always show allies following the group
        if (!char.currentSceneId) return true;
        // Show allies explicitly assigned to this scene
        if (char.currentSceneId === currentCityId) return true;
        return false;
      }

      // For NPCs: only show if explicitly in this scene
      if (currentCityId) {
        const showBySceneId = char.currentSceneId === currentCityId;
        const showByCityId = char.cityId === currentCityId;
        return showBySceneId || showByCityId; // Check both properties
      }

      // If no current city (World Map mode), don't show any NPCs
      return false;
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

          const isSuccess = data.réussite === true || data.resultat === "Success" || data.resultat === "success"

          return {
            cible_nom: targetName,
            attaque_result: data.attaque_result || 0,
            arme_utilisée: data.arme_utilisée || "Inconnu",
            réussite: isSuccess,
            type: data.type || "N/A",
            degat_result: data.degat_result || 0,
            attaquant: data.attaquant || "",
            cible: data.cible || "",
            reportId: doc.id,
            applied: data.applied === true,
          }
        })

        setAttackReports(reportsData)
      })

      return () => unsubscribe()
    }

    fetchAttackReports()
  }, [roomId, characters])

  const applyDamage = async (targetId: string, damage: number, attackerPersoId?: string, weaponUsed?: string, options?: { silent?: boolean, skipDeathConfirm?: boolean }) => {
    const targetCharacter = characters.find(char => char.id === targetId)
    if (!targetCharacter || !roomId) return

    try {
      const newPv = Math.max(0, targetCharacter.pv - damage)
      const characterRef = doc(db, `cartes/${roomId}/characters/${targetId}`)
      await updateDoc(characterRef, { PV: newPv })

      setCharacters(prevChars =>
        prevChars.map(char => char.id === targetId ? { ...char, pv: newPv } : char)
      )

      // Crédite les dégâts RÉELLEMENT appliqués (validés par le MJ) au joueur
      // propriétaire du personnage attaquant.
      if (attackerPersoId && damage > 0) {
        trackDamageDealtByCharacter(roomId, attackerPersoId, damage).catch(e =>
          console.error('Error tracking damage dealt:', e)
        )
      }

      if (!options?.silent) {
        toast.success('Dégâts appliqués', {
          description: `${targetCharacter.name} : -${damage} PV (${newPv} PV restants)`,
          duration: 2000,
        })
      }

      const attacker = attackerPersoId ? characters.find(c => c.id === attackerPersoId) : undefined
      const attackerName = attacker?.name || 'Quelqu\'un'
      const withWeapon = weaponUsed ? ` (${weaponUsed})` : ''
      let historyMessage: string
      if (damage > 0) {
        historyMessage = `**${targetCharacter.name}** a reçu **${damage} dégâts** de **${attackerName}**${withWeapon} (${newPv} PV restants).`
      } else if (damage < 0) {
        historyMessage = `**${targetCharacter.name}** a reçu **${Math.abs(damage)} PV** de **${attackerName}**${withWeapon} (${newPv} PV).`
      } else {
        historyMessage = `**${targetCharacter.name}** n'a subi aucun effet de **${attackerName}**${withWeapon} (${newPv} PV).`
      }

      logHistoryEvent({
        roomId,
        type: newPv <= 0 ? 'mort' : 'combat',
        message: newPv <= 0 ? `**${targetCharacter.name}** a succombé à ses blessures !` : historyMessage,
        characterId: targetId,
        characterName: targetCharacter.name,
        characterType: targetCharacter.type,
      })

      // Événement dédié côté attaquant, pour que son historique "Par personnage"
      // montre aussi les actions qu'il a faites (pas seulement celles subies).
      // Masqué du Journal global pour éviter un doublon avec l'événement côté cible.
      if (attacker && attacker.id !== targetId) {
        const attackerVerb = damage > 0 ? 'a attaqué' : damage < 0 ? 'a soigné' : 'a attaqué (sans effet)'
        logHistoryEvent({
          roomId,
          type: 'combat',
          message: `**${attackerName}** ${attackerVerb} **${targetCharacter.name}**${withWeapon}${damage !== 0 ? ` : **${Math.abs(damage)} ${damage > 0 ? 'dégâts' : 'PV rendus'}**` : ''}.`,
          characterId: attacker.id,
          characterName: attacker.name,
          characterType: attacker.type,
          details: { hiddenFromTimeline: true },
        })
      }

      if (newPv <= 0 && targetCharacter.type !== 'joueurs' && !options?.skipDeathConfirm) {
        confirmDeleteCharacter(targetCharacter)
      }
    } catch (error) {
      console.error("Erreur lors de l'application des dégâts :", error)
      if (!options?.silent) {
        toast.error('Erreur', {
          description: "Impossible d'appliquer les dégâts.",
          duration: 3000,
        })
      }
    }
  }

  const [isBulkDeathDialogOpen, setIsBulkDeathDialogOpen] = useState(false)
  const [bulkDeathCandidates, setBulkDeathCandidates] = useState<Character[]>([])
  const [bulkDeathSelectedIds, setBulkDeathSelectedIds] = useState<Set<string>>(new Set())
  const [isApplyingAll, setIsApplyingAll] = useState(false)

  // Revue groupée avant application : liste tous les rapports en attente avec leurs
  // dégâts pré-remplis (valeur roulée), mais modifiables individuellement — le MJ peut
  // corriger une résistance/vulnérabilité ponctuelle avant de valider le lot en un clic.
  const [isBulkReviewOpen, setIsBulkReviewOpen] = useState(false)
  const [bulkReviewDamages, setBulkReviewDamages] = useState<Record<string, number>>({})
  const [bulkReviewSelectedIds, setBulkReviewSelectedIds] = useState<Set<string>>(new Set())

  const openBulkReview = () => {
    const pendingReports = attackReports.filter(r => !r.applied)
    if (pendingReports.length === 0) return

    setBulkReviewDamages(Object.fromEntries(pendingReports.map(r => [r.reportId, r.degat_result])))
    setBulkReviewSelectedIds(new Set(pendingReports.map(r => r.reportId)))
    setIsBulkReviewOpen(true)
  }

  // Applique tous les rapports sélectionnés dans la revue groupée, avec les dégâts
  // éventuellement ajustés, sans repasser par le drawer individuel. Les morts (PNJ à
  // 0 PV) ne déclenchent pas un dialog de confirmation par personnage — elles sont
  // regroupées dans un seul dialog récapitulatif à la fin, pour ne pas enchaîner N popups.
  const applyAllPendingDamage = async () => {
    if (!roomId || isApplyingAll) return
    const pendingReports = attackReports.filter(r => !r.applied && bulkReviewSelectedIds.has(r.reportId))
    if (pendingReports.length === 0) return

    setIsApplyingAll(true)
    const deaths: Character[] = []

    try {
      for (const report of pendingReports) {
        const damage = bulkReviewDamages[report.reportId] ?? report.degat_result
        const targetCharacter = characters.find(c => c.id === report.cible)
        if (targetCharacter) {
          const willDie = targetCharacter.type !== 'joueurs' && (targetCharacter.pv - damage) <= 0
          if (willDie) deaths.push({ ...targetCharacter, pv: 0 })
        }

        await applyDamage(report.cible, damage, report.attaquant, report.arme_utilisée, {
          silent: true,
          skipDeathConfirm: true,
        })

        try {
          const reportRef = doc(db, `cartes/${roomId}/combat/${report.attaquant}/rapport/${report.reportId}`)
          await updateDoc(reportRef, { applied: true, degat_result: damage })
        } catch (error) {
          console.error("Erreur lors du marquage du rapport comme appliqué :", error)
        }
      }

      toast.success('Dégâts appliqués', {
        description: `${pendingReports.length} rapport${pendingReports.length > 1 ? 's' : ''} traité${pendingReports.length > 1 ? 's' : ''}.`,
        duration: 2500,
      })

      setIsBulkReviewOpen(false)

      if (deaths.length > 0) {
        setBulkDeathCandidates(deaths)
        setBulkDeathSelectedIds(new Set(deaths.map(d => d.id)))
        setIsBulkDeathDialogOpen(true)
      }
    } finally {
      setIsApplyingAll(false)
    }
  }

  const confirmBulkDeaths = async () => {
    if (!roomId) return
    const toDelete = bulkDeathCandidates.filter(c => bulkDeathSelectedIds.has(c.id))

    for (const character of toDelete) {
      const combatRef = collection(db, `cartes/${roomId}/combat/${character.id}/rapport`)
      const reportsToDelete = attackReports.filter(report => report.attaquant === character.id)
      for (const report of reportsToDelete) {
        await deleteDoc(doc(combatRef, report.reportId))
      }
      await deleteDoc(doc(db, `cartes/${roomId}/characters/${character.id}`))
    }

    setIsBulkDeathDialogOpen(false)
    setBulkDeathCandidates([])
    setBulkDeathSelectedIds(new Set())
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
        if (currentCityId) {
          const combatRef = doc(db, `cartes/${roomId}/cities/${currentCityId}/combat/state`)
          await setDoc(combatRef, { activePlayer: newActiveCharacterId }, { merge: true })
        }

        toast.success('Initiatives relancées', {
          description: `${sortedCharacters.length} personnages ont relancé leur initiative.`,
          duration: 2000,
        })
      } catch (error) {
        console.error("Erreur lors de la mise à jour des initiatives :", error)
        toast.error('Erreur', {
          description: "Impossible de relancer les initiatives.",
          duration: 3000,
        })
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
      if (currentCityId) {
        const combatRef = doc(db, `cartes/${roomId}/cities/${currentCityId}/combat/state`)
        await setDoc(combatRef, { activePlayer: newActiveCharacterId }, { merge: true })
      }
    } catch (error) {
      console.error("Erreur lors de la mise à jour de activePlayer :", error)
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
      if (currentCityId) {
        const combatRef = doc(db, `cartes/${roomId}/cities/${currentCityId}/combat/state`)
        await setDoc(combatRef, { activePlayer: newActiveCharacterId }, { merge: true })
      }
    } catch (error) {
      console.error("Erreur lors de la mise à jour de activePlayer :", error)
    }
  }

  const previousCharacter = async () => {
    if (!roomId || characters.length === 0) return

    const lastCharacter = characters[characters.length - 1]
    const newCharacters = [lastCharacter, ...characters.slice(0, -1)]
    setCharacters(newCharacters)

    try {
      const newActiveCharacterId = newCharacters[0].id
      if (currentCityId) {
        const combatRef = doc(db, `cartes/${roomId}/cities/${currentCityId}/combat/state`)
        await setDoc(combatRef, { activePlayer: newActiveCharacterId }, { merge: true })
      }
    } catch (error) {
      console.error("Erreur lors de la mise à jour de activePlayer :", error)
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

        toast.success('PV modifiés', {
          description: `${selectedCharacter.name} : ${hpChange > 0 ? '+' : ''}${hpChange} PV (${newPv} PV)`,
          duration: 2000,
        })

        if (hpChange !== 0) {
          logHistoryEvent({
            roomId,
            type: newPv <= 0 ? 'mort' : 'combat',
            message: newPv <= 0
              ? `**${selectedCharacter.name}** a succombé à ses blessures !`
              : `**MJ** ajuste les PV de **${selectedCharacter.name}** : ${hpChange > 0 ? '+' : ''}${hpChange} (${newPv} PV).`,
            characterId: selectedCharacter.id,
            characterName: selectedCharacter.name,
            characterType: selectedCharacter.type,
          })
        }

        if (newPv <= 0 && selectedCharacter.type !== 'joueurs') {
          confirmDeleteCharacter(selectedCharacter)
        }
      } catch (error) {
        console.error("Erreur lors de la mise à jour des PV :", error)
        toast.error('Erreur', {
          description: "Impossible de modifier les PV.",
          duration: 3000,
        })
      } finally {
        setIsDrawerOpen(false)
      }
    }
  }

  const applyManualDamage = async () => {
    if (selectedAttack && selectedTarget && roomId) {
      await applyDamage(selectedTarget, damageChange, selectedAttack.attaquant, selectedAttack.arme_utilisée)

      try {
        const reportRef = doc(db, `cartes/${roomId}/combat/${selectedAttack.attaquant}/rapport/${selectedAttack.reportId}`)
        await updateDoc(reportRef, { applied: true })
      } catch (error) {
        console.error("Erreur lors du marquage du rapport comme appliqué :", error)
      }

      setIsOtherDrawerOpen(false)
    }
  }

  const toggleCondition = async (characterId: string, conditionId: string) => {
    if (!roomId) return

    const char = characters.find(c => c.id === characterId)
    if (!char) return

    const currentConditions = char.conditions || []
    let newConditions: string[]
    const isRemoving = currentConditions.includes(conditionId)

    if (isRemoving) {
      newConditions = currentConditions.filter(c => c !== conditionId)
    } else {
      newConditions = [...currentConditions, conditionId]
    }

    try {
      const characterRef = doc(db, `cartes/${roomId}/characters/${characterId}`)
      await updateDoc(characterRef, { conditions: newConditions })

      const condition = CONDITIONS.find(c => c.id === conditionId)
      const conditionLabel = condition?.label || conditionId

      toast.success(isRemoving ? 'Effet retiré' : 'Effet ajouté', {
        description: `${char.name} : ${conditionLabel}`,
        duration: 2000,
      })

      logHistoryEvent({
        roomId,
        type: 'combat',
        message: isRemoving
          ? `**${char.name}** n'est plus **${conditionLabel}**.`
          : `**${char.name}** est **${conditionLabel}**.`,
        characterId,
        characterName: char.name,
        characterType: char.type,
      })
    } catch (error) {
      console.error("Erreur lors de la mise à jour des conditions :", error)
      toast.error('Erreur', {
        description: "Impossible de modifier l'état.",
        duration: 3000,
      })
    }
  }

  const activeCharacter = characters[0]

  return (
    <div className="h-full flex flex-col gap-4 sm:gap-6 p-3 sm:p-6 bg-[var(--bg-dark)] text-[var(--text-primary)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 bg-[var(--bg-card)] p-3 sm:p-4 rounded-xl border border-[var(--border-color)] shadow-sm shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Sword className="h-5 w-5 sm:h-6 sm:w-6 text-[var(--accent-brown)] shrink-0" />
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Combat</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile: icon-only buttons */}
          <Button variant="outline" size="icon" onClick={rerollInitiative} disabled={isRollingInitiative} className="lg:hidden h-9 w-9 border-[var(--border-color)]" title="Relancer l'initiative">
            <Dice1 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={previousCharacter} className="lg:hidden h-9 w-9 border-[var(--border-color)]" title="Précédent">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="icon" onClick={nextCharacter} className="lg:hidden button-primary h-9 w-9" title="Suivant">
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Desktop: full buttons */}
          <Button variant="outline" onClick={rerollInitiative} disabled={isRollingInitiative} className="hidden lg:inline-flex border-[var(--border-color)] hover:bg-[var(--bg-darker)]">
            <Dice1 className="mr-2 h-4 w-4" /> Relancer Init
          </Button>
          <Button variant="outline" onClick={previousCharacter} className="hidden lg:inline-flex border-[var(--border-color)] hover:bg-[var(--bg-darker)]">
            <ChevronLeft className="mr-2 h-4 w-4" /> Précédent
          </Button>
          <Button className="hidden lg:inline-flex button-primary" onClick={nextCharacter}>
            <ChevronRight className="mr-2 h-4 w-4" /> Suivant
          </Button>
        </div>
      </div>

      {/* ───────── MOBILE LAYOUT ───────── */}
      <div className="lg:hidden flex-1 min-h-0 overflow-y-auto space-y-4 pb-4" style={{ touchAction: 'pan-y' }}>
        {/* Active character card */}
        {activeCharacter ? (
          <div className="rounded-2xl border-2 border-[var(--accent-brown)] bg-[var(--bg-card)] overflow-hidden">
            <div className="p-4 bg-[var(--accent-brown)]/5">
              <div className="flex items-center gap-3">
                <Avatar className="h-16 w-16 shrink-0 border-2 border-[var(--accent-brown)]">
                  <AvatarImage src={activeCharacter.avatar} alt={activeCharacter.name} className="object-cover" />
                  <AvatarFallback className="text-xl bg-[var(--bg-darker)]">{activeCharacter.name[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Sword className="h-4 w-4 text-[var(--accent-brown)] shrink-0" />
                    <h2 className="text-lg font-bold truncate">{activeCharacter.name}</h2>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-[var(--text-secondary)] border-[var(--border-color)] text-[10px] px-1.5">{activeCharacter.type.toUpperCase()}</Badge>
                    <Badge className="bg-[var(--accent-brown)] text-[10px] px-1.5">INIT {activeCharacter.currentInit}</Badge>
                  </div>
                </div>
              </div>

              {/* DEF / PV row */}
              <div className="flex items-stretch gap-2 mt-3">
                <div className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[var(--bg-dark)] border border-[var(--border-color)] py-2">
                  <Shield className="h-4 w-4 text-[var(--text-secondary)]" />
                  <span className="text-xs text-[var(--text-secondary)] uppercase font-bold">DEF</span>
                  <span className="text-lg font-bold">{activeCharacter.Defense}</span>
                </div>
                <button onClick={() => openDrawer(activeCharacter)} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[var(--bg-dark)] border border-[var(--border-color)] py-2 active:scale-95 transition-transform">
                  <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                  <span className="text-lg font-bold">{activeCharacter.pv}</span>
                  <Pencil className="h-3 w-3 text-[var(--text-secondary)] opacity-60" />
                </button>
              </div>

              {/* Conditions */}
              <div className="mt-3">
                <ConditionManager character={activeCharacter} onToggle={toggleCondition} />
              </div>
            </div>

            {/* Stats */}
            <div className="px-3 py-3 border-t border-[var(--border-color)]">
              <div className="grid grid-cols-6 gap-1.5">
                {activeCharacter.stats && Object.entries(activeCharacter.stats).map(([stat, value]) => {
                  const mod = Math.floor(((value as number) - 10) / 2)
                  return (
                    <div key={stat} className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded p-1 text-center">
                      <div className="text-[8px] uppercase text-[var(--text-secondary)] font-bold">{stat}</div>
                      <div className="font-mono font-bold text-xs">{value as number}</div>
                      <div className="text-[8px] text-[var(--text-secondary)]">{mod >= 0 ? `+${mod}` : mod}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Attack reports */}
            <div className="px-3 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2 flex items-center gap-1.5"><Sword className="h-3.5 w-3.5" /> Rapports d'attaque</h3>
              {attackReports.length > 0 ? (
                <div className="space-y-2">
                  {attackReports.map(report => (
                    <div key={report.reportId} className="rounded-lg bg-[var(--bg-dark)] border border-[var(--border-color)] p-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{report.arme_utilisée}</span>
                        <Badge variant={report.réussite ? "default" : "destructive"} className="text-[10px] px-1.5 shrink-0">{report.réussite ? "Touché" : "Manqué"}</Badge>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] truncate mb-1.5">Cible : <span className="text-[var(--text-primary)]">{report.cible_nom}</span></div>
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-[var(--text-secondary)]">Jet <b className="text-[var(--text-primary)] font-mono">{report.attaque_result}</b></span>
                        <span className="text-[var(--text-secondary)]">Dégâts <b className="text-red-400 font-mono">{report.degat_result}</b></span>
                      </div>
                      <Button size="sm" className="w-full h-8 text-xs button-secondary" onClick={() => openOtherDrawer(report)}>Appliquer</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-[var(--text-secondary)] text-xs border border-dashed border-[var(--border-color)] rounded-lg">Aucune attaque enregistrée.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-[var(--border-color)] py-10 text-center text-[var(--text-secondary)] text-sm">Aucun personnage actif</div>
        )}

        {/* Turn order list */}
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center gap-2">
            <Dice1 className="h-4 w-4 text-[var(--text-secondary)]" />
            <span className="font-bold text-sm">Ordre du tour</span>
          </div>
          <div className="p-3 space-y-2">
            {characters.slice(1).map((char, index) => (
              <div key={char.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--bg-dark)] border border-[var(--border-color)]" onClick={() => setViewedCharacter(char)}>
                <span className="font-mono text-base font-bold text-[var(--text-secondary)] w-5 text-center shrink-0">{index + 2}</span>
                <Avatar className="h-9 w-9 shrink-0 border border-[var(--border-color)]">
                  <AvatarImage src={char.avatar} />
                  <AvatarFallback>{char.name[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">{char.name}</div>
                  <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
                    <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {char.pv}</span>
                    <span className="flex items-center gap-1"><Dice1 className="h-3 w-3" /> {char.initDetails}</span>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={(e) => { e.stopPropagation(); openDrawer(char); }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {characters.length <= 1 && (
              <div className="text-center py-3 text-[var(--text-secondary)] text-sm">Aucun autre personnage en attente.</div>
            )}
          </div>
        </div>
      </div>

      {/* ───────── DESKTOP LAYOUT ───────── */}
      <div className="hidden lg:grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 h-full min-h-0 overflow-hidden">
        <LightRays />
        {/* Turn Order Panel (List - Left, slightly larger) */}
        <div className="lg:col-span-5 flex flex-col min-h-0">
          <Card className="flex-1 flex flex-col border-[var(--border-color)] shadow-md overflow-hidden">
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
        <div className="lg:col-span-7 flex flex-col gap-3 min-h-0">

          {/* Compact character cards: viewed (full-width, if any) then target + active side by side */}
          <div className="flex flex-col gap-2 shrink-0">
            {viewedCharacter && (
              <div className="relative">
                <CompactCharacterCard
                  character={viewedCharacter}
                  accent="blue"
                  label="Consulté"
                  icon={Ghost}
                  onToggleCondition={toggleCondition}
                  onAdjustHP={openDrawer}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1.5 right-10 h-6 w-6 z-10 hover:bg-red-500/20 hover:text-red-500"
                  onClick={() => setViewedCharacter(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <TargetsButton
              attackReports={attackReports}
              characters={characters}
              onToggleCondition={toggleCondition}
              onAdjustHP={openDrawer}
            />

            {activeCharacter && (
              <CompactCharacterCard
                character={activeCharacter}
                accent="brown"
                label="Personnage actif"
                icon={Sword}
                onToggleCondition={toggleCondition}
                onAdjustHP={openDrawer}
              />
            )}
          </div>

          {/* Attack Reports — gets all remaining space */}
          <Card className="flex-1 min-h-0 flex flex-col border-[var(--border-color)] shadow-md overflow-hidden">
            <CardHeader className="pb-2 border-b border-[var(--border-color)]">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Sword className="h-4 w-4 text-[var(--text-secondary)]" />
                  Rapports d'Attaque
                </span>
                {attackReports.length > 0 && (() => {
                  const pendingCount = attackReports.filter(r => !r.applied).length
                  return (
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-normal text-[var(--text-secondary)]">
                        {attackReports.length - pendingCount}/{attackReports.length} appliqués
                      </span>
                      {pendingCount > 0 && (
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-[var(--accent-brown)] text-[var(--bg-darker)] hover:opacity-90"
                          onClick={openBulkReview}
                        >
                          Tout appliquer ({pendingCount})
                        </Button>
                      )}
                    </div>
                  )
                })()}
              </CardTitle>
            </CardHeader>
            <ScrollArea className="flex-1 p-4">
              {attackReports.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {attackReports.map((report) => (
                    <div
                      key={report.reportId}
                      className={`relative flex flex-col overflow-hidden rounded-xl border bg-[var(--bg-card)] shadow-sm transition-colors ${report.applied
                        ? 'border-[var(--border-color)] opacity-55'
                        : report.réussite
                          ? 'border-[var(--accent-brown)]/40'
                          : 'border-[var(--border-color)]'
                        }`}
                    >
                      {/* Status rail */}
                      <div className={`absolute left-0 top-0 h-full w-1 ${report.applied ? 'bg-[var(--text-secondary)]/30' : report.réussite ? 'bg-[var(--accent-brown)]' : 'bg-[var(--text-secondary)]/40'}`} />

                      <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pl-5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[var(--text-primary)]">
                            <Sword className="h-3.5 w-3.5 shrink-0 text-[var(--accent-brown)]" />
                            <span className="font-semibold text-sm truncate">{report.arme_utilisée}</span>
                          </div>
                          <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                            Cible <span className="text-[var(--text-primary)] font-medium">{report.cible_nom}</span>
                          </div>
                        </div>

                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${report.réussite
                            ? 'bg-[var(--accent-brown)]/15 text-[var(--accent-brown)]'
                            : 'bg-[var(--text-secondary)]/15 text-[var(--text-secondary)]'
                            }`}
                        >
                          {report.réussite ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {report.réussite ? 'Touché' : 'Manqué'}
                        </span>
                      </div>

                      {report.attaquant === report.cible && (
                        <div className="mx-4 mt-2 ml-5 flex items-center justify-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-400">
                          <Skull className="h-3 w-3" />
                          AUTO-ATTAQUE
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 px-4 pl-5 py-3">
                        <div className="rounded-lg bg-[var(--bg-dark)] px-2.5 py-1.5 text-center">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Jet</div>
                          <div className="font-mono tabular-nums font-bold text-base text-[var(--text-primary)]">{report.attaque_result}</div>
                        </div>
                        <div className="rounded-lg bg-[var(--bg-dark)] px-2.5 py-1.5 text-center">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Dégâts</div>
                          <div className="font-mono tabular-nums font-bold text-base text-red-400">{report.degat_result}</div>
                        </div>
                      </div>

                      {report.applied ? (
                        <div className="mx-4 mb-3 ml-5 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-color)] py-2 text-xs font-bold text-[var(--text-secondary)]">
                          <Check className="h-3.5 w-3.5" />
                          Appliqué
                        </div>
                      ) : (
                        <button
                          onClick={() => openOtherDrawer(report)}
                          className="mx-4 mb-3 ml-5 rounded-lg bg-[var(--accent-brown)] py-2 text-xs font-bold text-[var(--bg-darker)] transition-opacity hover:opacity-90"
                        >
                          Appliquer
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-[var(--text-secondary)] bg-[var(--bg-dark)]/50 rounded-lg border border-dashed border-[var(--border-color)] text-sm">
                  Aucune attaque enregistrée.
                </div>
              )}
            </ScrollArea>
          </Card>
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
              <DialogTitle className="text-[var(--text-primary)]">Confirmer la mort (supprimer)</DialogTitle>
              <DialogDescription className="text-[var(--text-secondary)]">
                <span className="font-bold text-[var(--text-primary)]">{characterToDelete?.name} n'a plus de PV, le supprimer ? </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsConfirmDialogOpen(false)}>Annuler</Button>
              <Button variant="destructive" onClick={handleDeleteCharacter}>Supprimer</Button>
            </DialogFooter>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Revue groupée avant application : liste des rapports en attente, dégâts
          modifiables et désélectionnables individuellement, validés en un clic. */}
      <Dialog open={isBulkReviewOpen} onOpenChange={setIsBulkReviewOpen}>
        <DialogPortal>
          <DialogOverlay className="bg-black/50 backdrop-blur-sm" />
          <DialogContent className="sm:max-w-xl bg-[var(--bg-card)] border-[var(--border-color)]">
            <div className="flex flex-col gap-5">
              <DialogHeader>
                <DialogTitle className="text-[var(--text-primary)]">
                  Appliquer {bulkReviewSelectedIds.size} rapport{bulkReviewSelectedIds.size > 1 ? 's' : ''}
                </DialogTitle>
                <DialogDescription className="text-[var(--text-secondary)] mt-1">
                  Ajustez les dégâts si besoin, décochez ce qu'il ne faut pas appliquer.
                </DialogDescription>
              </DialogHeader>

              {/* Ajustement global : applique un delta à tous les rapports sélectionnés
                  (ex : -1 pour tout le monde après une résistance de zone), en plus des
                  champs individuels ci-dessous. */}
              <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--bg-dark)] border border-[var(--border-color)] px-4 py-3.5">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Ajustement global
                </span>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-[var(--border-color)]"
                    onClick={() => {
                      setBulkReviewDamages(prev => {
                        const next = { ...prev }
                        bulkReviewSelectedIds.forEach(id => {
                          next[id] = Math.max(0, (next[id] ?? 0) - 1)
                        })
                        return next
                      })
                    }}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="w-8 text-center text-sm text-[var(--text-secondary)]">±1</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 border-[var(--border-color)]"
                    onClick={() => {
                      setBulkReviewDamages(prev => {
                        const next = { ...prev }
                        bulkReviewSelectedIds.forEach(id => {
                          next[id] = (next[id] ?? 0) + 1
                        })
                        return next
                      })
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
                {attackReports.filter(r => !r.applied).map(report => {
                  const isSelected = bulkReviewSelectedIds.has(report.reportId)
                  return (
                    <div
                      key={report.reportId}
                      className={`flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-dark)] border border-[var(--border-color)] transition-opacity ${!isSelected ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          setBulkReviewSelectedIds(prev => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(report.reportId)
                            else next.delete(report.reportId)
                            return next
                          })
                        }}
                        className="h-4 w-4 accent-[var(--accent-brown)] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-[var(--text-primary)] truncate">{report.cible_nom}</div>
                        <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{report.arme_utilisée}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                        <Input
                          type="number"
                          disabled={!isSelected}
                          value={bulkReviewDamages[report.reportId] ?? report.degat_result}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0
                            setBulkReviewDamages(prev => ({ ...prev, [report.reportId]: val }))
                          }}
                          className="h-9 w-20 text-center bg-[var(--bg-card)] border-[var(--border-color)] font-mono tabular-nums"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              <DialogFooter className="pt-1">
                <Button variant="ghost" onClick={() => setIsBulkReviewOpen(false)}>Annuler</Button>
                <Button
                  disabled={isApplyingAll || bulkReviewSelectedIds.size === 0}
                  onClick={applyAllPendingDamage}
                  className="bg-[var(--accent-brown)] text-[var(--bg-darker)] hover:opacity-90"
                >
                  {isApplyingAll ? 'Application...' : `Appliquer (${bulkReviewSelectedIds.size})`}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Confirmation groupée des PNJ tombés à 0 PV après un "Tout appliquer" — évite
          d'enchaîner un dialog de suppression par personnage. */}
      <Dialog open={isBulkDeathDialogOpen} onOpenChange={setIsBulkDeathDialogOpen}>
        <DialogPortal>
          <DialogOverlay className="bg-black/50 backdrop-blur-sm" />
          <DialogContent className="bg-[var(--bg-card)] border-[var(--border-color)]">
            <DialogHeader>
              <DialogTitle className="text-[var(--text-primary)]">
                PNJ tombés à 0 PV ({bulkDeathCandidates.length})
              </DialogTitle>
              <DialogDescription className="text-[var(--text-secondary)]">
                Décochez ceux à conserver (ex : un boss avec une seconde phase).
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
              {bulkDeathCandidates.map(character => (
                <label
                  key={character.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--bg-dark)] border border-[var(--border-color)] cursor-pointer hover:border-red-500/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={bulkDeathSelectedIds.has(character.id)}
                    onChange={(e) => {
                      setBulkDeathSelectedIds(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(character.id)
                        else next.delete(character.id)
                        return next
                      })
                    }}
                    className="h-4 w-4 accent-red-500 shrink-0"
                  />
                  <Avatar className="h-8 w-8 border border-[var(--border-color)]">
                    <AvatarImage src={character.avatar} alt={character.name} className="object-cover" />
                    <AvatarFallback>{character.name[0]}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-[var(--text-primary)] truncate">{character.name}</span>
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsBulkDeathDialogOpen(false)}>Ignorer</Button>
              <Button variant="destructive" onClick={confirmBulkDeaths}>
                Supprimer ({bulkDeathSelectedIds.size})
              </Button>
            </DialogFooter>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </div >
  )
}

export default GMDashboard
