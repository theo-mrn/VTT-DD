"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { Plus, X, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useGame } from "@/contexts/GameContext"
import { useShortcuts, SHORTCUT_ACTIONS } from "@/contexts/ShortcutsContext"
import { cn } from "@/lib/utils"
import { AVAILABLE_ACTIONS, getAvailableActions, ACTION_CATEGORIES } from "@/lib/customActions"

type CustomButton = {
  id: string
  actionId: string
  xPct: number // position en % de la fenêtre, pour rester cohérent au redimensionnement
  yPct: number
}

const STORAGE_KEY_PREFIX = "vtt_custom_buttons_"

function loadButtons(uid: string | undefined): CustomButton[] {
  if (!uid || typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + uid)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveButtons(uid: string | undefined, buttons: CustomButton[]) {
  if (!uid || typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + uid, JSON.stringify(buttons))
  } catch (e) {
    console.error("Failed to save custom buttons", e)
  }
}

function FloatingButton({
  button,
  action,
  editMode,
  isActive,
  onDragEnd,
  onRemove,
  onTrigger,
}: {
  button: CustomButton
  action: (typeof AVAILABLE_ACTIONS)[number]
  editMode: boolean
  isActive: boolean
  onDragEnd: (id: string, xPct: number, yPct: number) => void
  onRemove: (id: string) => void
  onTrigger: (actionId: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!editMode) return
    e.preventDefault()
    draggingRef.current = true
    movedRef.current = false
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    movedRef.current = true
    const xPct = (e.clientX / window.innerWidth) * 100
    const yPct = (e.clientY / window.innerHeight) * 100
    if (ref.current) {
      ref.current.style.left = `${xPct}%`
      ref.current.style.top = `${yPct}%`
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    const xPct = Math.min(98, Math.max(2, (e.clientX / window.innerWidth) * 100))
    const yPct = Math.min(96, Math.max(4, (e.clientY / window.innerHeight) * 100))
    onDragEnd(button.id, xPct, yPct)
    // Le click qui suit pointerup doit voir movedRef=true pour être ignoré (évite de
    // déclencher l'action après un drag) — mais on le remet à false juste après, sinon
    // il reste bloqué à true pour tous les clics futurs une fois l'édition terminée.
    setTimeout(() => { movedRef.current = false }, 0)
  }

  const Icon = action.icon

  return (
    <div
      ref={ref}
      data-custom-button=""
      className="fixed z-[65] -translate-x-1/2 -translate-y-1/2 touch-none"
      style={{ left: `${button.xPct}%`, top: `${button.yPct}%` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <button
        onClick={() => { if (!movedRef.current) onTrigger(action.id) }}
        className={cn(
          "relative flex items-center justify-center w-12 h-12 rounded-full shadow-lg transition-all",
          isActive
            ? "bg-emerald-500 text-black ring-2 ring-emerald-300 ring-offset-2 ring-offset-transparent hover:brightness-110"
            : "bg-[var(--accent-brown)] text-black hover:brightness-110",
          editMode && "cursor-grab active:cursor-grabbing ring-2 ring-white/40 ring-offset-2 ring-offset-transparent"
        )}
        title={action.label}
      >
        <Icon className="w-5 h-5" />
        {editMode && (
          <span
            onClick={(e) => { e.stopPropagation(); onRemove(button.id) }}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-500"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>
    </div>
  )
}

function AddButtonMenu({
  isMJ,
  onPick,
  onClose,
}: {
  isMJ: boolean
  onPick: (actionId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [])

  const filteredActions = getAvailableActions(isMJ).filter(a =>
    a.label.toLowerCase().includes(query.trim().toLowerCase())
  )
  const groups = ACTION_CATEGORIES
    .map(category => ({ category, actions: filteredActions.filter(a => a.category === category) }))
    .filter(g => g.actions.length > 0)

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-2xl w-full max-w-3xl h-[85vh] max-h-[720px] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <span className="text-base font-bold text-[var(--text-primary)]">Ajouter un bouton</span>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-white/5">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une action..."
              className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg pl-9 pr-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-zinc-600 outline-none focus:border-[var(--accent-brown)] transition-colors"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {groups.map(group => (
            <div key={group.category}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-brown)] mb-2.5">
                {group.category}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {group.actions.map(a => (
                  <button
                    key={a.id}
                    onClick={() => onPick(a.id)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--accent-brown)] text-[var(--text-primary)] text-sm transition-colors"
                  >
                    <a.icon className="w-4 h-4 text-[var(--accent-brown)] shrink-0" />
                    <span className="truncate">{a.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="text-center py-10 text-zinc-600 text-sm italic">
              Aucune action trouvée.
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function CustomButtons() {
  const { user, isMJ } = useGame()
  const { triggerAction, onActionTriggered, setIsCustomButtonsEditModeActive, activeMapTools } = useShortcuts()

  const [buttons, setButtons] = useState<CustomButton[]>([])
  const [editMode, setEditMode] = useState(false)
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  useEffect(() => {
    setButtons(loadButtons(user?.uid))
  }, [user?.uid])

  // Activé depuis MapToolbar (bouton "Personnaliser mes boutons") plutôt qu'une
  // poignée flottante dédiée — voir TOOLS.CUSTOMIZE_BUTTONS dans useToolbarActions.tsx.
  useEffect(() => {
    return onActionTriggered(SHORTCUT_ACTIONS.TOGGLE_CUSTOM_BUTTONS_EDIT, () => setEditMode(e => !e))
  }, [onActionTriggered])

  // Reflète editMode dans le state partagé du contexte, pour que MapToolbar (composant
  // frère, monté ailleurs dans l'arbre) puisse afficher son bouton en actif tant que
  // l'édition est ouverte.
  useEffect(() => {
    setIsCustomButtonsEditModeActive(editMode)
  }, [editMode, setIsCustomButtonsEditModeActive])

  const persist = useCallback((next: CustomButton[]) => {
    setButtons(next)
    saveButtons(user?.uid, next)
  }, [user?.uid])

  const handleAdd = (actionId: string) => {
    const newButton: CustomButton = {
      id: crypto.randomUUID(),
      actionId,
      xPct: 50,
      yPct: 50,
    }
    persist([...buttons, newButton])
    setIsPickerOpen(false)
  }

  const handleDragEnd = (id: string, xPct: number, yPct: number) => {
    persist(buttons.map(b => b.id === id ? { ...b, xPct, yPct } : b))
  }

  const handleRemove = (id: string) => {
    persist(buttons.filter(b => b.id !== id))
  }

  return (
    <>
      {buttons.map(button => {
        const action = AVAILABLE_ACTIONS.find(a => a.id === button.actionId)
        if (!action) return null
        if ((action.mjOnly && !isMJ) || (action.hiddenForMJ && isMJ)) return null
        return (
          <FloatingButton
            key={button.id}
            button={button}
            action={action}
            editMode={editMode}
            isActive={!!action.mapToolId && activeMapTools.includes(action.mapToolId)}
            onDragEnd={handleDragEnd}
            onRemove={handleRemove}
            onTrigger={triggerAction}
          />
        )
      })}

      {/* En mode édition (activé depuis MapToolbar), un "+" flottant reste disponible
          pour ajouter un bouton — il n'a pas vraiment sa place dans la barre d'outils. */}
      {editMode && (
        <div className="fixed bottom-[calc(var(--dock-h,56px)+12px)] right-3 z-[66]">
          <Button
            size="icon"
            className="rounded-full bg-[var(--accent-brown)] text-black hover:brightness-110 shadow-lg h-10 w-10"
            onClick={() => setIsPickerOpen(true)}
            title="Ajouter un bouton"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}

      {isPickerOpen && (
        <AddButtonMenu isMJ={isMJ} onPick={handleAdd} onClose={() => setIsPickerOpen(false)} />
      )}
    </>
  )
}
