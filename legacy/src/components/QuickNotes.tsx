'use client'

import React, { useState, useRef, useEffect } from 'react'
import { User, MapPin, Book, Scroll, Calendar, Tag, X, Send } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { db, addDoc, collection } from '@/lib/firebase'
import { toast } from 'sonner'
import { useGame } from '@/contexts/GameContext'
import { useShortcuts, SHORTCUT_ACTIONS } from '@/contexts/ShortcutsContext'
import { useDialogVisibility } from '@/contexts/DialogVisibilityContext'
import { cn } from '@/lib/utils'

// Même taxonomie que Notes.tsx (src/components/Notes.tsx) — les notes créées ici
// atterrissent dans la même collection Firestore et réapparaissent telles quelles
// dans le Grimoire, prêtes à être éditées/enrichies/partagées plus tard.
const NOTE_TYPES = [
  { id: 'character', label: 'Personnage', icon: User },
  { id: 'location', label: 'Lieu', icon: MapPin },
  { id: 'item', label: 'Objet', icon: Book },
  { id: 'quest', label: 'Quête', icon: Scroll },
  { id: 'journal', label: 'Journal', icon: Calendar },
  { id: 'other', label: 'Autre', icon: Tag },
] as const

type NoteType = typeof NOTE_TYPES[number]['id']

export default function QuickNotes() {
  const { user, persoId } = useGame()
  const roomId = user?.roomId ?? null
  // Le MJ n'incarne pas de personnage (persoId reste null) : on retombe sur son UID
  // Firebase Auth comme clé de stockage stable pour ses propres notes.
  const myCharId = persoId || user?.uid || null
  const { isShortcutPressed, onActionTriggered } = useShortcuts()
  const { setDialogOpen } = useDialogVisibility()

  const [isOpen, setIsOpen] = useState(false)
  const [type, setType] = useState<NoteType>('other')
  const [text, setText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDialogOpen(isOpen)
    return () => { if (isOpen) setDialogOpen(false) }
  }, [isOpen, setDialogOpen])

  useEffect(() => {
    if (isOpen) {
      // Laisser l'animation d'entrée démarrer avant de voler le focus.
      const t = setTimeout(() => textareaRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.QUICK_NOTE)) {
        e.preventDefault()
        setIsOpen(o => !o)
      } else if (isOpen && e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isShortcutPressed, isOpen])

  // Bouton personnalisable (voir src/components/(overlays)/CustomButtons) : même effet
  // que le raccourci clavier, déclenché par clic au lieu d'une touche.
  useEffect(() => {
    return onActionTriggered(SHORTCUT_ACTIONS.QUICK_NOTE, () => setIsOpen(o => !o))
  }, [onActionTriggered])

  const reset = () => {
    setText('')
    setType('other')
  }

  const handleSave = async () => {
    const title = text.trim()
    if (!title || !roomId || !myCharId || isSaving) return

    setIsSaving(true)
    try {
      // Titre = première ligne (ou tout le texte s'il est court), contenu = texte complet.
      const firstLine = title.split('\n')[0].slice(0, 80)

      await addDoc(collection(db, 'Notes', roomId, myCharId), {
        title: firstLine,
        content: title.replace(/\n/g, '<br/>'),
        type,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      toast.success('Note enregistrée', { description: firstLine, duration: 2000 })
      reset()
      setIsOpen(false)
    } catch (error) {
      console.error('Erreur lors de la création de la quick note:', error)
      toast.error('Erreur', { description: "Impossible d'enregistrer la note.", duration: 3000 })
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDownInTextarea = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter pour enregistrer sans quitter le clavier ; Enter seul = retour à la ligne.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
  }

  if (!roomId || !myCharId) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] px-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="relative w-full max-w-lg bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
              <span className="text-xs font-bold uppercase tracking-widest text-[var(--accent-brown)]">
                Note rapide
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category selector */}
            <div className="flex items-center gap-1.5 px-4 pt-3 flex-wrap">
              {NOTE_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setType(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                    type === t.id
                      ? 'bg-[var(--accent-brown)] text-black'
                      : 'bg-[var(--bg-card)] border border-[var(--border-color)] text-zinc-400 hover:text-zinc-200'
                  )}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Text input */}
            <div className="p-4">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDownInTextarea}
                placeholder="Notez une idée, un indice, un PNJ à retenir..."
                rows={4}
                className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-3.5 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[var(--accent-brown)] transition-colors resize-none"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 pb-4">
              <span className="text-[10px] text-zinc-600">⌘/Ctrl + Entrée pour enregistrer</span>
              <button
                onClick={handleSave}
                disabled={!text.trim() || isSaving}
                className="flex items-center gap-2 bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold uppercase tracking-widest text-[10px] px-4 py-2.5 rounded-lg transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                {isSaving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
