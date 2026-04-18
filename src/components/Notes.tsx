'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Search, Plus, Book, X, Trash2, Edit, Save,
  MapPin, User, Scroll, Tag, Image as ImageIcon,
  Calendar, CheckCircle2, AlertTriangle, GripVertical,
  Maximize2, Minimize2, MoreVertical, LayoutGrid, List as ListIcon, Users, RotateCcw,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Heading1, Heading2, Heading3, Quote, Minus
} from 'lucide-react'
import Image from "next/image"
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import UnderlineExt from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import ResizableImage from 'tiptap-extension-resize-image'
import { motion, AnimatePresence } from "framer-motion"

import { db, auth, storage, addDoc, collection, doc, updateDoc, deleteDoc, getDocs, getDoc, serverTimestamp } from "@/lib/firebase"
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { cn } from "@/lib/utils"
import { toast } from 'sonner'
import { useGame } from '@/contexts/GameContext'

// --- TYPES ---
interface SubQuest {
  id: string;
  title: string;
  description: string;
  status: "not-started" | "in-progress" | "completed";
}

interface Tag {
  id: string;
  label: string;
}

interface Note {
  id: string;
  title: string;
  content: string;
  type: "character" | "location" | "item" | "quest" | "other" | "journal";
  tags: Tag[];
  createdAt: Date;
  updatedAt: Date;
  image?: string;
  race?: string;
  class?: string;
  region?: string;
  itemType?: string;
  questType?: "principale" | "annexe";
  questStatus?: "not-started" | "in-progress" | "completed";
  subQuests?: SubQuest[];
  isShared?: boolean;
  sharedWith?: string[] | 'all';
  createdBy?: string;
  createdByName?: string;
  _pathCharId?: string; // internal: which charId was used to store this note
}

interface RoomCharacter {
  id: string;
  name: string;
}

const NOTE_TYPES = [
  { id: 'character', label: 'Personnage', icon: User, color: 'var(--amber-500)' },
  { id: 'location', label: 'Lieu', icon: MapPin, color: 'var(--emerald-500)' },
  { id: 'item', label: 'Objet', icon: Book, color: 'var(--blue-500)' },
  { id: 'quest', label: 'Quête', icon: Scroll, color: 'var(--violet-500)' },
  { id: 'journal', label: 'Journal', icon: Calendar, color: 'var(--pink-500)' },
  { id: 'other', label: 'Autre', icon: Tag, color: 'var(--slate-500)' },
] as const;

// --- MAIN COMPONENT ---

export default function Notes() {
  const { user, isMJ, persoId: myCharId } = useGame()
  const roomId = user?.roomId ?? null
  const characterId = user?.perso ?? null

  // Data
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [characterName, setCharacterName] = useState<string>('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [roomCharacters, setRoomCharacters] = useState<{ id: string; name: string; avatar: string | null }[]>([])

  // View
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'shared'>('all')
  const [viewLayout, setViewLayout] = useState<'grid' | 'list'>('grid')

  // Editor (Custom Modal)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null)

  // Deletion
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const loadNotes = useCallback(async (rId?: string, cId?: string) => {
    const activeRoomId = rId || roomId
    const activeCharId = cId || myCharId
    const legacyCharId = characterId // ancien path par nom

    if (!activeRoomId || !activeCharId) return
    setLoading(true)

    try {
      const sharedNotesRef = collection(db, 'SharedNotes', activeRoomId, 'notes')

      // Charger les notes privées sous l'ID Firestore + l'ancien path par nom (migration)
      const paths = [collection(db, 'Notes', activeRoomId, activeCharId)]
      if (legacyCharId && legacyCharId !== activeCharId) {
        paths.push(collection(db, 'Notes', activeRoomId, legacyCharId))
      }

      const [sharedSnapshot, ...privateSnapshots] = await Promise.all([
        getDocs(sharedNotesRef),
        ...paths.map(ref => getDocs(ref)),
      ])

      const seenIds = new Set<string>()
      const privateNotesData: Note[] = []
      for (let i = 0; i < privateSnapshots.length; i++) {
        const snap = privateSnapshots[i]
        const pathCharId = i === 0 ? activeCharId : (legacyCharId ?? activeCharId)
        for (const d of snap.docs) {
          if (seenIds.has(d.id)) continue
          seenIds.add(d.id)
          privateNotesData.push({
            id: d.id,
            ...d.data(),
            tags: d.data().tags || [],
            createdAt: d.data().createdAt?.toDate() || new Date(),
            updatedAt: d.data().updatedAt?.toDate() || new Date(),
            isShared: false,
            _pathCharId: pathCharId,
          } as Note)
        }
      }

      const sharedNotesData = sharedSnapshot.docs
        .filter(d => {
          const sw = d.data().sharedWith
          const createdBy = d.data().createdBy
          // Toujours voir ses propres notes partagées (même si stockées sous ancien ID)
          if (createdBy === activeCharId || createdBy === legacyCharId) return true
          // Visible pour tous
          if (!sw || sw === 'all') return true
          // Partage ciblé : est-ce que mon ID est dans la liste ?
          if (Array.isArray(sw)) return sw.includes(activeCharId!) || (legacyCharId ? sw.includes(legacyCharId) : false)
          return false
        })
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          tags: doc.data().tags || [],
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate() || new Date(),
          isShared: true,
        })) as Note[]

      const allNotes = [...privateNotesData, ...sharedNotesData]
      setNotes(allNotes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()))
    } catch (error) {
      console.error("Error loading notes:", error)
      toast.error("Erreur lors du chargement des notes")
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [roomId, myCharId, characterId])

  useEffect(() => {
    if (!roomId || !myCharId) {
      setLoading(false)
      return
    }
    const charPromise = getDoc(doc(db, `cartes/${roomId}/characters`, myCharId)).then(charDoc => {
      if (charDoc.exists()) setCharacterName(charDoc.data().Nomperso || 'Personnage')
    })
    const roomCharsPromise = getDocs(collection(db, `cartes/${roomId}/characters`)).then(snap => {
      const players = snap.docs
        .filter(d => d.data().type === 'joueurs' && d.data().Nomperso && d.id !== myCharId)
        .map(d => ({
          id: d.id,
          name: d.data().Nomperso as string,
          avatar: d.data().imageURLFinal || d.data().imageURL2 || d.data().imageURL || null
        }))
      setRoomCharacters(players)
    })
    const notesPromise = loadNotes(roomId, myCharId)
    Promise.all([charPromise, roomCharsPromise, notesPromise]).finally(() => setLoading(false))
  }, [roomId, myCharId, loadNotes])

  const deleteStorageUrls = async (urls: string[]) => {
    await Promise.allSettled(
      urls
        .filter(u => u.includes('firebasestorage'))
        .map(u => deleteObject(ref(storage, u)).catch(() => {}))
    )
  }

  const extractInlineImages = (html: string): string[] => {
    const matches = [...html.matchAll(/src="(https:\/\/firebasestorage[^"]+)"/g)]
    return matches.map(m => m[1])
  }

  // Simple handle for generic refresh
  const handleManualRefresh = () => {
    setIsRefreshing(true)
    loadNotes()
  }

  // Actions
  const logHistory = async (message: string, isPrivate: boolean = true) => {
    if (!roomId) return;
    try {
      await addDoc(collection(db, `Historique/${roomId}/events`), {
        type: 'note',
        message,
        characterId: characterId,
        characterName: characterName,
        timestamp: serverTimestamp(),
        targetUserId: isPrivate ? auth.currentUser?.uid : null
      });
    } catch (err) {
      console.error("Erreur log note history:", err);
    }
  };

  const handleNew = () => {
    setEditingNote({
      title: '', content: '', type: 'other', tags: [], subQuests: [],
      questStatus: 'not-started', questType: 'principale'
    })
    setEditorOpen(true)
  }

  const handleEdit = (note: Note) => {
    setEditingNote({ ...note })
    setEditorOpen(true)
  }

  const handleSave = async (data: Partial<Note>) => {
    if (!roomId || !myCharId) {
      toast.error('Erreur de session', { description: `roomId=${roomId} myCharId=${myCharId} — recharge la page.` })
      return
    }

    const payload: any = {
      ...data,
      title: data.title,
      updatedAt: new Date(),
      content: data.content || '',
      tags: data.tags || []
    }
    delete payload.id
    delete payload._pathCharId

    const isSharedNote = data.isShared === true
    const wasPrivate = !data.createdBy
    const isNewNote = !data.id

    try {
      if (data.id) {
        const privatePathId = (data as any)._pathCharId || myCharId

        // Supprimer les images inline retirées du contenu
        const oldNote = notes.find(n => n.id === data.id)
        if (oldNote) {
          const oldImgs = extractInlineImages(oldNote.content || '')
          const newImgs = new Set(extractInlineImages(data.content || ''))
          await deleteStorageUrls(oldImgs.filter(u => !newImgs.has(u)))
        }

        // Converting private to shared
        if (isSharedNote && wasPrivate) {
          payload.createdAt = data.createdAt || new Date()
          payload.createdBy = myCharId
          payload.createdByName = characterName
          await addDoc(collection(db, 'SharedNotes', roomId, 'notes'), payload)
          await deleteDoc(doc(db, 'Notes', roomId, privatePathId, data.id))

          await logHistory(`${characterName} a partagé une note : [${data.title}]`, false);

          toast.success('Note partagée', {
            description: `"${data.title}" est maintenant visible par tous.`,
            duration: 2000,
          })
        }
        // Converting shared to private
        else if (!isSharedNote && !wasPrivate) {
          payload.createdAt = data.createdAt || new Date()
          await addDoc(collection(db, 'Notes', roomId, myCharId), payload)
          if (data.createdBy === myCharId) {
            await deleteDoc(doc(db, 'SharedNotes', roomId, 'notes', data.id))
          }

          toast.success('Note rendue privée', {
            description: `"${data.title}" est maintenant privée.`,
            duration: 2000,
          })
        }
        // Update existing note
        else if (isSharedNote) {
          await updateDoc(doc(db, 'SharedNotes', roomId, 'notes', data.id), payload)
          toast.success('Note modifiée', {
            description: data.title,
            duration: 2000,
          })
        } else {
          await updateDoc(doc(db, 'Notes', roomId, privatePathId, data.id), payload)
          toast.success('Note modifiée', {
            description: data.title,
            duration: 2000,
          })
        }
      } else {
        // Create new note
        payload.createdAt = new Date()

        if (isSharedNote) {
          payload.createdBy = myCharId
          payload.createdByName = characterName
          await addDoc(collection(db, 'SharedNotes', roomId, 'notes'), payload)
          await logHistory(`${characterName} a publié une note partagée : [${data.title}]`, false);
        } else {
          await addDoc(collection(db, 'Notes', roomId, myCharId), payload)
          await logHistory(`Vous avez rédigé une nouvelle note : [${data.title}]`, true);
        }

        toast.success('Note créée', {
          description: data.title,
          duration: 2000,
        })
      }
      setEditorOpen(false)
      loadNotes()
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error)
      toast.error('Erreur', {
        description: isNewNote ? "Impossible de créer la note." : "Impossible de modifier la note.",
        duration: 3000,
      })
    }
  }

  const handleDelete = async () => {
    if (!deleteId || !roomId || !myCharId) return

    const noteToDelete = notes.find(n => n.id === deleteId)
    if (!noteToDelete) return

    try {
      if (noteToDelete.isShared) {
        await deleteDoc(doc(db, 'SharedNotes', roomId, 'notes', deleteId))
      } else {
        const deletePathId = (noteToDelete as any)._pathCharId || myCharId
        await deleteDoc(doc(db, 'Notes', roomId, deletePathId, deleteId))
      }

      // Supprimer toutes les images du Storage (header + inline)
      const toDelete: string[] = []
      if (noteToDelete.image) toDelete.push(noteToDelete.image)
      toDelete.push(...extractInlineImages(noteToDelete.content || ''))
      await deleteStorageUrls(toDelete)

      toast.success('Note supprimée', {
        description: noteToDelete.title,
        duration: 2000,
      })

      setDeleteId(null)
      setEditorOpen(false)
      loadNotes()
    } catch (error) {
      console.error('Erreur lors de la suppression:', error)
      toast.error('Erreur', {
        description: "Impossible de supprimer la note.",
        duration: 3000,
      })
    }
  }

  // Quick share: convert private note to shared
  const handleQuickShare = async (note: Note) => {
    if (!roomId || !myCharId || note.isShared) return

    try {
      const payload = {
        ...note,
        isShared: true,
        createdBy: myCharId,
        createdByName: characterName,
        createdAt: note.createdAt,
        updatedAt: new Date()
      }
      delete (payload as any).id

      await addDoc(collection(db, 'SharedNotes', roomId, 'notes'), payload)

      await logHistory(`${characterName} a partagé une note : [${note.title}]`, false);

      await deleteDoc(doc(db, 'Notes', roomId, myCharId, note.id))

      toast.success('Note partagée', {
        description: `"${note.title}" est maintenant visible par tous.`,
        duration: 2000,
      })
      loadNotes()
    } catch (error) {
      console.error('Erreur lors du partage:', error)
      toast.error('Erreur', {
        description: "Impossible de partager la note.",
        duration: 3000,
      })
    }
  }

  // Filtering
  const filtered = useMemo(() => notes.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.tags.some(t => t.label.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesType = activeFilter ? n.type === activeFilter : true

    // Tab filtering
    let matchesTab = true
    if (activeTab === 'mine') {
      matchesTab = !n.isShared || n.createdBy === myCharId
    } else if (activeTab === 'shared') {
      matchesTab = n.isShared === true && n.createdBy !== myCharId
    }

    return matchesSearch && matchesType && matchesTab
  }), [notes, searchQuery, activeFilter, activeTab, myCharId])

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-[var(--accent-brown)] border-t-transparent animate-spin" /></div>

  return (
    <div className="h-full flex flex-col bg-[var(--bg-canvas)] text-[#e0e0e0] font-sans relative overflow-hidden">

      {/* TOP BAR */}
      <div className="px-8 py-6 border-b border-[var(--border-color)] bg-[var(--bg-darker)] flex flex-col gap-6 z-10 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-serif font-bold text-[var(--accent-header)] tracking-tight">Grimoire</h1>
            <div className="flex items-center gap-4">
              <p className="text-sm text-zinc-500 font-medium">Archives & Connaissances</p>
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing || loading}
                className="text-[10px] uppercase font-bold text-zinc-600 hover:text-[var(--accent-brown)] transition-colors flex items-center gap-1.5"
              >
                <RotateCcw className={cn("w-3 h-3", (isRefreshing || loading) && "animate-spin")} />
                Actualiser
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {isMJ && roomId && (
              <a
                href={`/${roomId}/scenario`}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative px-6 py-2.5 border border-[var(--accent-brown)] text-[var(--accent-brown)] font-bold uppercase tracking-widest text-xs rounded hover:bg-[var(--accent-brown)] hover:text-black transition-all overflow-hidden flex items-center"
              >
                <span className="relative z-10 flex items-center gap-2"><Book className="w-4 h-4" /> Scénario</span>
              </a>
            )}
            <button
              onClick={handleNew}
              className="group relative px-6 py-2.5 bg-[var(--accent-brown)] text-black font-bold uppercase tracking-widest text-xs rounded shadow-[0_0_20px_rgba(192,160,128,0.2)] hover:shadow-[0_0_30px_rgba(192,160,128,0.4)] hover:bg-[var(--accent-brown-hover)] transition-all overflow-hidden"
            >
              <span className="relative z-10 flex items-center gap-2"><Plus className="w-4 h-4" /> Nouvelle entrée</span>
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-[var(--accent-brown)] transition-colors" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher dans les archives..."
              className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[var(--radius-xl)] py-3 pl-11 pr-4 text-zinc-200 focus:outline-none focus:border-[var(--accent-brown)] focus:ring-1 focus:ring-[var(--accent-brown)]/20 transition-all font-medium placeholder:text-zinc-600"
            />
          </div>

          <div className="flex items-center gap-2 bg-[var(--bg-card)] p-1 rounded-[var(--radius-xl)] border border-[var(--border-color)]">
            <button onClick={() => setViewLayout('grid')} className={cn("p-2 rounded-lg transition-all", viewLayout === 'grid' ? "bg-[var(--accent-brown)]/20 text-[var(--accent-brown)]" : "text-zinc-500 hover:text-zinc-300")}><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={() => setViewLayout('list')} className={cn("p-2 rounded-lg transition-all", viewLayout === 'list' ? "bg-[var(--accent-brown)]/20 text-[var(--accent-brown)]" : "text-zinc-500 hover:text-zinc-300")}><ListIcon className="w-4 h-4" /></button>
          </div>
        </div>

        {/* TABS */}
        <div className="flex gap-2 bg-[var(--bg-card)] p-1 rounded-[var(--radius-xl)] border border-[var(--border-color)] w-fit">
          <button
            onClick={() => setActiveTab('all')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
              activeTab === 'all' ? "bg-[var(--accent-brown)] text-black" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            Toutes
          </button>
          <button
            onClick={() => setActiveTab('mine')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'mine' ? "bg-[var(--accent-brown)] text-black" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <User className="w-3 h-3" /> Mes notes
          </button>
          <button
            onClick={() => setActiveTab('shared')}
            className={cn(
              "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2",
              activeTab === 'shared' ? "bg-[var(--accent-brown)] text-black" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Users className="w-3 h-3" /> Partagées avec moi
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActiveFilter(null)} className={cn("px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border", activeFilter === null ? "bg-[var(--accent-brown)] text-black border-[var(--accent-brown)]" : "bg-transparent border-[var(--border-color)] text-zinc-500 hover:border-zinc-500")}>Tout</button>
          {NOTE_TYPES.map(t => (
            <button key={t.id} onClick={() => setActiveFilter(t.id)} className={cn("px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border flex items-center gap-2", activeFilter === t.id ? "bg-[var(--accent-brown)] text-black border-[var(--accent-brown)]" : "bg-transparent border-[var(--border-color)] text-zinc-500 hover:border-zinc-500")}>
              <t.icon className="w-3 h-3" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT GRID */}
      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[url('/grid-pattern.svg')] opacity-95">
        {notes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 opacity-50">
            <Book className="w-16 h-16 mb-4" strokeWidth={1} />
            <p className="font-serif italic text-lg">Le grimoire est vide...</p>
          </div>
        ) : (
          <div className={cn(
            "grid gap-6 pb-20",
            viewLayout === 'grid' ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" : "grid-cols-1 max-w-4xl mx-auto"
          )}>
            {filtered.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                onClick={() => handleEdit(note)}
                onQuickShare={handleQuickShare}
                layout={viewLayout}
              />
            ))}
          </div>
        )}
      </div>

      {/* CUSTOM IMMERSIVE MODAL */}
      <AnimatePresence>
        {editorOpen && editingNote && (
          <CustomEditorModal
            data={editingNote}
            roomId={roomId}
            roomCharacters={roomCharacters}
            onClose={() => setEditorOpen(false)}
            onSave={handleSave}
            onDelete={(id) => setDeleteId(id)}
          />
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION OVERLAY */}
      {deleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="bg-[var(--bg-dark)] border border-[var(--border-color)] p-6 rounded-[var(--radius-xl)] max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-500"><AlertTriangle /><h3 className="font-bold">Supprimer définitivement ?</h3></div>
            <p className="text-zinc-400 text-sm">Cette action est irréversible.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 hover:bg-white/5 rounded-lg text-sm font-medium">Annuler</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-200 border border-red-900/50 rounded-lg text-sm font-bold">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- SUB-COMPONENTS ---

function NoteCard({ note, onClick, onQuickShare, layout }: { note: Note, onClick: () => void, onQuickShare: (note: Note) => void, layout: 'grid' | 'list' }) {
  const TypeIcon = NOTE_TYPES.find(t => t.id === note.type)?.icon || Tag
  const firstInlineImage = useMemo(() => {
    if (note.image || !note.content || typeof document === 'undefined') return null
    const div = document.createElement('div')
    div.innerHTML = note.content
    return div.querySelector('img')?.src ?? null
  }, [note.image, note.content])
  const displayImage = note.image || firstInlineImage
  const hasImage = !!displayImage

  return (
    <motion.div
      layoutId={`card-${note.id}`}
      className={cn(
        "group relative bg-[var(--bg-card)] border border-[var(--border-color)] rounded-[var(--radius-xl)] overflow-hidden hover:border-[var(--accent-brown)] hover:shadow-[0_0_20px_rgba(192,160,128,0.2)] transition-all duration-300 flex",
        layout === 'list' ? "h-24 flex-row" : (hasImage ? "flex-col aspect-[3/4]" : "flex-col h-auto")
      )}
    >
      {/* Quick Share Button - Only for private notes */}
      {!note.isShared && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onQuickShare(note)
          }}
          className="absolute top-3 right-3 z-20 p-2 bg-blue-900/80 hover:bg-blue-800 border border-blue-700 rounded-[var(--radius-lg)] opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center gap-1.5 text-xs font-bold text-blue-100 shadow-lg"
          title="Partager rapidement"
        >
          <Users className="w-3 h-3" /> Partager
        </button>
      )}

      <div onClick={onClick} className="flex-1 flex cursor-pointer">
        {/* --- BACKGROUND LAYER --- */}
        {hasImage ? (
          <div className="absolute inset-0 bg-[var(--bg-dark)]">
            <Image
              src={displayImage!}
              alt={note.title}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-100"
            />
            <div className={cn("absolute inset-0 bg-gradient-to-t from-black via-[#09090b]/80 to-transparent", layout === 'list' ? "via-[#09090b]/90" : "")} />
          </div>
        ) : (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[var(--bg-card)] to-transparent opacity-50" />
            <TypeIcon className="absolute top-4 right-4 w-24 h-24 text-[var(--bg-dark)] -rotate-12 opacity-50" />
          </div>
        )}

        {/* --- CONTENT LAYER --- */}
        <div className="relative flex-1 flex flex-col p-5 z-10">

          {/* Top Badge */}
          <div className="flex justify-between items-start mb-4">
            <span className={cn(
              "px-2 py-1 rounded backdrop-blur border text-[10px] font-bold uppercase tracking-wider",
              hasImage ? "bg-black/40 border-white/5 text-[var(--accent-brown)]" : "bg-[var(--bg-card)] border-[var(--border-color)] text-zinc-400"
            )}>
              {NOTE_TYPES.find(t => t.id === note.type)?.label}
            </span>

            {/* Shared Badge */}
            {note.isShared && (
              <span className={cn(
                "px-2 py-1 rounded backdrop-blur border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1",
                hasImage ? "bg-blue-900/40 border-blue-500/30 text-blue-300" : "bg-blue-900/30 border-blue-800/50 text-blue-400"
              )}>
                <Users className="w-3 h-3" /> Partagée
              </span>
            )}
          </div>

          {/* Text Preview (Only for No-Image) */}
          {!hasImage && note.content && (
            <div
              className="text-zinc-400 text-sm leading-relaxed line-clamp-4 mb-6 font-serif opacity-80 group-hover:opacity-100 transition-opacity note-preview"
              dangerouslySetInnerHTML={{ __html: note.content }}
            />
          )}

          {/* Bottom Info */}
          <div className="mt-auto">
            <h3 className={cn(
              "font-serif font-bold text-lg leading-tight mb-1 transition-colors line-clamp-2",
              hasImage ? "text-white group-hover:text-[var(--accent-brown)]" : "text-zinc-200 group-hover:text-[var(--accent-brown)]"
            )}>
              {note.title || "Sans Titre"}
            </h3>

            {/* Shared note creator info */}
            {note.isShared && note.createdByName && (
              <p className="text-[10px] text-zinc-500 mb-2 flex items-center gap-1">
                <User className="w-3 h-3" /> Par {note.createdByName}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-500 font-medium">
              {note.type === 'character' && (
                <>
                  {note.race && <span>{note.race}</span>}
                  {note.race && note.class && <span className="opacity-50">•</span>}
                  {note.class && <span>{note.class}</span>}
                </>
              )}
              {note.type === 'location' && note.region && <span>{note.region}</span>}
            </div>

            {/* Tags */}
            {note.tags && note.tags.length > 0 && layout !== 'list' && (
              <div className={cn(
                "flex flex-wrap gap-1 mt-3 transition-opacity duration-300",
                hasImage ? "opacity-0 group-hover:opacity-100" : "pt-3 border-t border-[#2a2a2a]"
              )}>
                {note.tags.slice(0, 3).map(t => (
                  <span key={t.id} className={cn(
                    "text-[9px] px-1.5 py-0.5 rounded",
                    hasImage ? "bg-white/10 text-zinc-300" : "bg-[var(--bg-card)] text-zinc-400"
                  )}>#{t.label}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function RichTextEditor({ content, onChange, roomId }: { content: string, onChange: (html: string) => void, roomId: string | null }) {
  const [uploadingImg, setUploadingImg] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      UnderlineExt,
      ResizableImage,
      Placeholder.configure({ placeholder: 'Commencez à rédiger...' }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
    ],
    content: content || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'min-h-[400px] outline-none text-base text-zinc-300 font-serif leading-loose prose prose-invert max-w-none focus:outline-none',
      },
      handlePaste(view, event) {
        const items = event.clipboardData?.items
        if (!items || !roomId) return false
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            event.preventDefault()
            const file = item.getAsFile()
            if (!file) continue
            setUploadingImg(true)
            const storageRef = ref(storage, `notes/${roomId}/inline/${Date.now()}_paste.${item.type.split('/')[1]}`)
            uploadBytes(storageRef, file)
              .then(snap => getDownloadURL(snap.ref))
              .then(url => {
                view.dispatch(view.state.tr.replaceSelectionWith(
                  view.state.schema.nodes.image.create({ src: url })
                ))
                onChange(view.dom.innerHTML)
              })
              .finally(() => setUploadingImg(false))
            return true
          }
        }
        return false
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files
        if (!files?.length || !roomId) return false
        const file = Array.from(files).find(f => f.type.startsWith('image/'))
        if (!file) return false
        event.preventDefault()
        setUploadingImg(true)
        const storageRef = ref(storage, `notes/${roomId}/inline/${Date.now()}_${file.name}`)
        uploadBytes(storageRef, file)
          .then(snap => getDownloadURL(snap.ref))
          .then(url => {
            const { tr } = view.state
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? tr.selection.from
            view.dispatch(tr.insert(pos, view.state.schema.nodes.image.create({ src: url })))
            onChange(view.dom.innerHTML)
          })
          .finally(() => setUploadingImg(false))
        return true
      },
    },
  })

  if (!editor) return null

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f || !roomId) return
    setUploadingImg(true)
    try {
      const storageRef = ref(storage, `notes/${roomId}/inline/${Date.now()}_${f.name}`)
      await uploadBytes(storageRef, f)
      const url = await getDownloadURL(storageRef)
      editor.chain().focus().insertContent(`<img src="${url}" />`).run()
    } catch (err) {
      console.error('Erreur upload image:', err)
    } finally {
      setUploadingImg(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const Sep = () => <div className="w-px h-4 bg-[var(--border-color)] mx-0.5" />

  const ToolbarBtn = ({ onClick, active, title, children }: { onClick: () => void, active?: boolean, title: string, children: React.ReactNode }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-[var(--accent-brown)]/20 text-[var(--accent-brown)]' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`}
    >
      {children}
    </button>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-[#1a1a1a] border border-[var(--border-color)] rounded-lg sticky top-12 z-10">
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Gras"><Bold className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italique"><Italic className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Souligné"><UnderlineIcon className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Barré"><Strikethrough className="w-4 h-4" /></ToolbarBtn>
        <Sep />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Titre 1"><Heading1 className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Titre 2"><Heading2 className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Titre 3"><Heading3 className="w-4 h-4" /></ToolbarBtn>
        <Sep />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Liste"><List className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Liste numérotée"><ListOrdered className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Citation"><Quote className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} active={false} title="Séparateur"><Minus className="w-4 h-4" /></ToolbarBtn>
        <Sep />
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Gauche"><AlignLeft className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Centrer"><AlignCenter className="w-4 h-4" /></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Droite"><AlignRight className="w-4 h-4" /></ToolbarBtn>
        <Sep />
        <label title="Insérer une image" className={`p-1.5 rounded transition-colors cursor-pointer ${uploadingImg ? 'text-zinc-600' : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/5'}`}>
          {uploadingImg
            ? <div className="w-4 h-4 rounded-full border-2 border-zinc-500 border-t-transparent animate-spin" />
            : <ImageIcon className="w-4 h-4" />}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" disabled={uploadingImg} onChange={handleImageUpload} />
        </label>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}

function CustomEditorModal({ data, roomId, roomCharacters, onClose, onSave, onDelete }: { data: Partial<Note>, roomId: string | null, roomCharacters: { id: string; name: string; avatar: string | null }[], onClose: () => void, onSave: (d: Partial<Note>) => void, onDelete: (id: string) => void }) {
  const [note, setNote] = useState(data)
  const [scrolled, setScrolled] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleScroll = () => {
    if (contentRef.current) {
      setScrolled(contentRef.current.scrollTop > 50)
    }
  }

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = e.currentTarget.value.trim()
      if (val && !note.tags?.find(t => t.label === val)) {
        setNote(prev => ({ ...prev, tags: [...(prev.tags || []), { id: val.toLowerCase(), label: val }] }))
        e.currentTarget.value = ''
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      {/* Modal Window */}
      <motion.div
        initial={{ scale: 0.97, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.97, opacity: 0, y: 16 }}
        className="relative w-full max-w-5xl h-[90vh] bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-2xl shadow-2xl overflow-hidden flex flex-row"
      >
        {/* --- LEFT SIDEBAR --- */}
        <div className="w-56 shrink-0 bg-[var(--bg-darker)] border-r border-[var(--border-color)] flex flex-col overflow-y-auto custom-scrollbar">
          {/* Type selector */}
          <div className="p-4 border-b border-[var(--border-color)]">
            <p className="text-[9px] uppercase font-black tracking-widest text-zinc-600 mb-3">Type</p>
            <div className="space-y-0.5">
              {NOTE_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setNote(prev => ({ ...prev, type: t.id as any }))}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all",
                    note.type === t.id
                      ? "bg-[var(--accent-brown)]/10 text-[var(--accent-brown)]"
                      : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                  )}
                >
                  <t.icon className="w-3.5 h-3.5 shrink-0" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 space-y-5 flex-1">
            {/* Context Fields */}
            {(note.type === 'character' || note.type === 'location' || note.type === 'quest') && (
              <div className="space-y-3">
                <p className="text-[9px] uppercase font-black tracking-widest text-zinc-600">Détails</p>
                {note.type === 'character' && (<>
                  <div><label className="text-[10px] text-zinc-500 mb-1 block">Race</label><input value={note.race || ''} onChange={e => setNote(p => ({ ...p, race: e.target.value }))} className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[var(--accent-brown)] outline-none" /></div>
                  <div><label className="text-[10px] text-zinc-500 mb-1 block">Classe</label><input value={note.class || ''} onChange={e => setNote(p => ({ ...p, class: e.target.value }))} className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[var(--accent-brown)] outline-none" /></div>
                </>)}
                {note.type === 'location' && (
                  <div><label className="text-[10px] text-zinc-500 mb-1 block">Région</label><input value={note.region || ''} onChange={e => setNote(p => ({ ...p, region: e.target.value }))} className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-[var(--accent-brown)] outline-none" /></div>
                )}
                {note.type === 'quest' && (
                  <div>
                    <label className="text-[10px] text-zinc-500 mb-1.5 block">Statut</label>
                    <div className="flex bg-[var(--bg-card)] p-0.5 rounded-lg border border-[var(--border-color)]">
                      {['not-started', 'in-progress', 'completed'].map(s => (
                        <button key={s} onClick={() => setNote(p => ({ ...p, questStatus: s as any }))} className={cn("flex-1 py-1 rounded-md text-[9px] font-bold uppercase transition-all", note.questStatus === s ? "bg-[var(--accent-brown)] text-black" : "text-zinc-500")}>
                          {s === 'not-started' ? 'À faire' : s === 'in-progress' ? 'En cours' : 'Fini'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sharing */}
            <div className="pt-6 border-t border-[var(--border-color)]">
              <div className="flex items-center justify-between mb-4">
                <label className="text-[10px] uppercase font-bold text-zinc-500">Visibilité</label>
                {note.isShared && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-800/50 text-blue-400 font-bold">
                    {note.sharedWith === 'all' ? 'Tous' : `${Array.isArray(note.sharedWith) ? note.sharedWith.length : 0} joueur${(Array.isArray(note.sharedWith) && note.sharedWith.length > 1) ? 's' : ''}`}
                  </span>
                )}
              </div>

              {/* Segmented control: Privée / Partagée */}
              <div className="flex bg-[var(--bg-card)] p-1 rounded-[var(--radius-md)] border border-[var(--border-color)] mb-4">
                <button
                  onClick={() => setNote(p => ({ ...p, isShared: false, sharedWith: undefined }))}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-bold transition-all",
                    !note.isShared ? "bg-[var(--accent-brown)] text-black" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <User className="w-3 h-3" /> Privée
                </button>
                <button
                  onClick={() => setNote(p => ({ ...p, isShared: true, sharedWith: p.sharedWith ?? 'all' }))}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-[11px] font-bold transition-all",
                    note.isShared ? "bg-blue-800 text-blue-100" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <Users className="w-3 h-3" /> Partagée
                </button>
              </div>

              {/* Destinataires — seulement si partagée */}
              {note.isShared && roomCharacters.length > 0 && (
                <div className="space-y-1">
                  {/* Tout le monde */}
                  <button
                    onClick={() => setNote(p => ({ ...p, sharedWith: 'all' }))}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-xs transition-all",
                      note.sharedWith === 'all'
                        ? "bg-blue-900/30 text-blue-300"
                        : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                    )}
                  >
                    <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", note.sharedWith === 'all' ? "bg-blue-600 border-blue-500" : "border-zinc-600")}>
                      {note.sharedWith === 'all' && <div className="w-2 h-2 bg-white rounded-sm" />}
                    </div>
                    <Users className="w-3 h-3 opacity-60" />
                    <span className="font-medium">Tout le monde</span>
                  </button>

                  {/* Séparateur */}
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px bg-[var(--border-color)]" />
                    <span className="text-[9px] text-zinc-600 uppercase font-bold">ou choisir</span>
                    <div className="flex-1 h-px bg-[var(--border-color)]" />
                  </div>

                  {/* Joueurs individuels */}
                  {roomCharacters.map(char => {
                    const selected = Array.isArray(note.sharedWith) && note.sharedWith.includes(char.id)
                    const toggle = () => {
                      const current = Array.isArray(note.sharedWith) ? note.sharedWith : []
                      const next = selected ? current.filter(id => id !== char.id) : [...current, char.id]
                      setNote(p => ({ ...p, sharedWith: next.length > 0 ? next : 'all' }))
                    }
                    return (
                      <button key={char.id} onClick={toggle} className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-md)] text-xs transition-all",
                        selected ? "bg-blue-900/30 text-blue-300" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                      )}>
                        <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors", selected ? "bg-blue-600 border-blue-500" : "border-zinc-600")}>
                          {selected && <div className="w-2 h-2 bg-white rounded-sm" />}
                        </div>
                        <span className="w-6 h-6 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center text-[10px] font-bold text-zinc-300 shrink-0">
                          {char.avatar
                            ? <img src={char.avatar} alt={char.name} className="w-full h-full object-cover" />
                            : char.name[0].toUpperCase()}
                        </span>
                        <span className="font-medium truncate">{char.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {note.isShared && note.createdByName && (
                <p className="mt-3 text-[10px] text-zinc-600 flex items-center gap-1">
                  <User className="w-3 h-3" /> Créée par {note.createdByName}
                </p>
              )}
            </div>

            {/* Tags */}
            <div className="pt-4 border-t border-[var(--border-color)]">
              <p className="text-[9px] uppercase font-black tracking-widest text-zinc-600 mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {note.tags?.map(t => (
                  <span key={t.id} className="text-[10px] bg-[var(--bg-card)] border border-[var(--border-color)] px-1.5 py-0.5 rounded flex items-center gap-1 text-zinc-400">
                    #{t.label}
                    <button onClick={() => setNote(p => ({ ...p, tags: p.tags?.filter(x => x.id !== t.id) }))} className="hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
              <input placeholder="+ Tag..." onKeyDown={handleAddTag} className="w-full bg-transparent border-b border-[var(--border-color)] py-1 text-xs outline-none focus:border-[var(--accent-brown)] placeholder:text-zinc-700" />
            </div>
          </div>

          {/* Delete Action */}
          {note.id && (
            <div className="p-4 mt-auto border-t border-[var(--border-color)]">
              <button onClick={() => onDelete(note.id!)} className="flex items-center gap-2 text-red-500/70 text-xs font-medium hover:text-red-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Supprimer
              </button>
            </div>
          )}
        </div>

        {/* --- RIGHT CONTENT: CANVAS --- */}
        <div className="flex-1 flex flex-col relative bg-[#121212] min-w-0">

          {/* Top bar */}
          <div className={cn("shrink-0 px-5 py-3 flex justify-between items-center z-20 transition-all border-b", scrolled ? "bg-[#121212]/95 backdrop-blur border-[var(--border-color)]" : "border-transparent")}>
            <button onClick={onClose} className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
              <X className="w-4 h-4 text-zinc-400" />
            </button>
            <button onClick={() => onSave(note)} className="bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-black font-bold uppercase tracking-widest text-[10px] px-4 py-2 rounded-lg transition-all flex items-center gap-1.5">
              <Save className="w-3.5 h-3.5" /> Enregistrer
            </button>
          </div>

          {/* Scrollable Canvas */}
          <div ref={contentRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar">

            {/* Editor Body */}
            <div className="max-w-2xl mx-auto px-8 py-8">
              <input
                value={note.title}
                onChange={e => setNote(p => ({ ...p, title: e.target.value }))}
                placeholder="Titre du document..."
                className="w-full bg-transparent text-3xl font-serif font-bold text-[#e0e0e0] placeholder:text-zinc-700 outline-none mb-6"
              />

              <RichTextEditor
                content={note.content || ''}
                onChange={(html) => setNote(p => ({ ...p, content: html }))}
                roomId={roomId}
              />

              {/* Quest Steps if applicable */}
              {note.type === 'quest' && (
                <div className="mt-12 pt-8 border-t border-[var(--border-color)]">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[var(--accent-brown)] text-sm font-bold uppercase tracking-widest">Chroniques & Étapes</h3>
                    <button onClick={() => setNote(p => ({ ...p, subQuests: [...(p.subQuests || []), { id: Date.now().toString(), title: '', description: '', status: 'not-started' }] }))} className="text-xs text-[var(--accent-brown)] border border-[var(--accent-brown)] px-3 py-1 rounded-[var(--radius-md)] hover:bg-[var(--accent-brown)]/10">
                      + Ajouter une étape
                    </button>
                  </div>
                  <div className="space-y-3">
                    {note.subQuests?.map((sq, i) => (
                      <div key={sq.id} className="flex items-center gap-4 p-4 bg-[var(--bg-card)] rounded-[var(--radius-lg)] border border-[var(--border-color)] group">
                        <button onClick={() => {
                          const ns = [...(note.subQuests || [])];
                          ns[i].status = sq.status === 'not-started' ? 'in-progress' : sq.status === 'in-progress' ? 'completed' : 'not-started';
                          setNote(p => ({ ...p, subQuests: ns }));
                        }} className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors", sq.status === 'completed' ? "bg-green-900 border-green-500 text-green-500" : sq.status === 'in-progress' ? "bg-amber-900 border-amber-500 text-amber-500" : "border-zinc-600 text-transparent")}>
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <input
                          value={sq.title}
                          onChange={e => { const ns = [...note.subQuests || []]; ns[i].title = e.target.value; setNote(p => ({ ...p, subQuests: ns })) }}
                          placeholder="Description de l'étape..."
                          className="flex-1 bg-transparent text-zinc-200 outline-none"
                        />
                        <button onClick={() => setNote(p => ({ ...p, subQuests: p.subQuests?.filter((_, x) => x !== i) }))} className="text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Spacer */}
            <div className="h-20" />
          </div>
        </div>
      </motion.div>
    </div>
  )
}
