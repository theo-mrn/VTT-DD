'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Search, Plus, Book, X, Trash2, Edit, Save,
  MapPin, User, Scroll, Tag, Image as ImageIcon,
  Calendar, CheckCircle2, AlertTriangle, GripVertical,
  Maximize2, Minimize2, MoreVertical, LayoutGrid, List as ListIcon
} from 'lucide-react'
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"

import { db, auth, addDoc, collection, doc, updateDoc, deleteDoc, onSnapshot, getDoc, onAuthStateChanged } from "@/lib/firebase"
import { cn } from "@/lib/utils"

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
}

const NOTE_TYPES = [
  { id: 'character', label: 'Personnage', icon: User, color: '#f59e0b' },
  { id: 'location', label: 'Lieu', icon: MapPin, color: '#10b981' },
  { id: 'item', label: 'Objet', icon: Book, color: '#3b82f6' },
  { id: 'quest', label: 'Quête', icon: Scroll, color: '#8b5cf6' },
  { id: 'journal', label: 'Journal', icon: Calendar, color: '#ec4899' },
  { id: 'other', label: 'Autre', icon: Tag, color: '#6b7280' },
] as const;

// --- MAIN COMPONENT ---

export default function Notes() {
  // Data
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [characterId, setCharacterId] = useState<string | null>(null)

  // View
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [viewLayout, setViewLayout] = useState<'grid' | 'list'>('grid')

  // Editor (Custom Modal)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingNote, setEditingNote] = useState<Partial<Note> | null>(null)

  // Deletion
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Auth & Data Fetching
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists()) {
          setRoomId(userDoc.data().room_id)
          setCharacterId(userDoc.data().perso)
        }
      }
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!roomId || !characterId) return
    const q = collection(db, 'Notes', roomId, characterId)
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id, ...doc.data(),
        tags: doc.data().tags || [],
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as Note[]
      setNotes(list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()))
    })
    return () => unsubscribe()
  }, [roomId, characterId])

  // Actions
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
    if (!data.title?.trim() || !roomId || !characterId) return

    const payload: any = {
      ...data,
      title: data.title,
      updatedAt: new Date(),
      content: data.content || '',
      tags: data.tags || []
    }
    delete payload.id

    if (data.id) {
      await updateDoc(doc(db, 'Notes', roomId, characterId, data.id), payload)
    } else {
      payload.createdAt = new Date()
      await addDoc(collection(db, 'Notes', roomId, characterId), payload)
    }
    setEditorOpen(false)
  }

  const handleDelete = async () => {
    if (!deleteId || !roomId || !characterId) return
    await deleteDoc(doc(db, 'Notes', roomId, characterId, deleteId))
    setDeleteId(null)
    setEditorOpen(false)
  }

  // Filtering
  const filtered = useMemo(() => notes.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.tags.some(t => t.label.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesType = activeFilter ? n.type === activeFilter : true
    return matchesSearch && matchesType
  }), [notes, searchQuery, activeFilter])

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-[#c0a080] border-t-transparent animate-spin" /></div>

  return (
    <div className="h-full flex flex-col bg-[#09090b] text-[#e0e0e0] font-sans relative overflow-hidden">

      {/* TOP BAR */}
      <div className="px-8 py-6 border-b border-[#2a2a2a] bg-[#0c0c0e] flex flex-col gap-6 z-10 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-serif font-bold text-[#e4e4e7] tracking-tight">Grimoire</h1>
            <p className="text-sm text-zinc-500 font-medium">Archives & Connaissances</p>
          </div>
          <button
            onClick={handleNew}
            className="group relative px-6 py-2.5 bg-[#c0a080] text-black font-bold uppercase tracking-widest text-xs rounded shadow-[0_0_20px_rgba(192,160,128,0.2)] hover:shadow-[0_0_30px_rgba(192,160,128,0.4)] hover:bg-[#d4b490] transition-all overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-2"><Plus className="w-4 h-4" /> Nouvelle entrée</span>
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-[#c0a080] transition-colors" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher dans les archives..."
              className="w-full bg-[#18181b] border border-[#27272a] rounded-xl py-3 pl-11 pr-4 text-zinc-200 focus:outline-none focus:border-[#c0a080] focus:ring-1 focus:ring-[#c0a080]/20 transition-all font-medium placeholder:text-zinc-600"
            />
          </div>

          <div className="flex items-center gap-2 bg-[#18181b] p-1 rounded-xl border border-[#27272a]">
            <button onClick={() => setViewLayout('grid')} className={cn("p-2 rounded-lg transition-all", viewLayout === 'grid' ? "bg-[#c0a080]/20 text-[#c0a080]" : "text-zinc-500 hover:text-zinc-300")}><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={() => setViewLayout('list')} className={cn("p-2 rounded-lg transition-all", viewLayout === 'list' ? "bg-[#c0a080]/20 text-[#c0a080]" : "text-zinc-500 hover:text-zinc-300")}><ListIcon className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActiveFilter(null)} className={cn("px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border", activeFilter === null ? "bg-[#c0a080] text-black border-[#c0a080]" : "bg-transparent border-[#27272a] text-zinc-500 hover:border-zinc-500")}>Tout</button>
          {NOTE_TYPES.map(t => (
            <button key={t.id} onClick={() => setActiveFilter(t.id)} className={cn("px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all border flex items-center gap-2", activeFilter === t.id ? "bg-[#c0a080] text-black border-[#c0a080]" : "bg-transparent border-[#27272a] text-zinc-500 hover:border-zinc-500")}>
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
              <NoteCard key={note.id} note={note} onClick={() => handleEdit(note)} layout={viewLayout} />
            ))}
          </div>
        )}
      </div>

      {/* CUSTOM IMMERSIVE MODAL */}
      <AnimatePresence>
        {editorOpen && editingNote && (
          <CustomEditorModal
            data={editingNote}
            onClose={() => setEditorOpen(false)}
            onSave={handleSave}
            onDelete={(id) => setDeleteId(id)}
          />
        )}
      </AnimatePresence>

      {/* DELETE CONFIRMATION OVERLAY */}
      {deleteId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
          <div className="bg-[#121212] border border-[#2a2a2a] p-6 rounded-2xl max-w-sm w-full shadow-2xl space-y-4">
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

function NoteCard({ note, onClick, layout }: { note: Note, onClick: () => void, layout: 'grid' | 'list' }) {
  const TypeIcon = NOTE_TYPES.find(t => t.id === note.type)?.icon || Tag
  const hasImage = !!note.image

  return (
    <motion.div
      layoutId={`card-${note.id}`}
      onClick={onClick}
      className={cn(
        "group relative bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl overflow-hidden cursor-pointer hover:border-[#c0a080] hover:shadow-[0_0_20px_rgba(192,160,128,0.2)] transition-all duration-300 flex",
        layout === 'list' ? "h-24 flex-row" : (hasImage ? "flex-col aspect-[3/4]" : "flex-col h-auto")
      )}
    >
      {/* --- BACKGROUND LAYER --- */}
      {hasImage ? (
        <div className="absolute inset-0 bg-[#121212]">
          <Image
            src={note.image!}
            alt={note.title}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-100"
          />
          <div className={cn("absolute inset-0 bg-gradient-to-t from-black via-[#09090b]/80 to-transparent", layout === 'list' ? "via-[#09090b]/90" : "")} />
        </div>
      ) : (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#25252a] to-transparent opacity-50" />
          <TypeIcon className="absolute top-4 right-4 w-24 h-24 text-[#202022] -rotate-12 opacity-50" />
        </div>
      )}

      {/* --- CONTENT LAYER --- */}
      <div className="relative flex-1 flex flex-col p-5 z-10">

        {/* Top Badge */}
        <div className="flex justify-between items-start mb-4">
          <span className={cn(
            "px-2 py-1 rounded backdrop-blur border text-[10px] font-bold uppercase tracking-wider",
            hasImage ? "bg-black/40 border-white/5 text-[#c0a080]" : "bg-[#25252a] border-[#2a2a2a] text-zinc-400"
          )}>
            {NOTE_TYPES.find(t => t.id === note.type)?.label}
          </span>
        </div>

        {/* Text Preview (Only for No-Image) */}
        {!hasImage && note.content && (
          <p className="text-zinc-400 text-sm leading-relaxed line-clamp-4 mb-6 font-serif opacity-80 group-hover:opacity-100 transition-opacity">
            {note.content}
          </p>
        )}

        {/* Bottom Info */}
        <div className="mt-auto">
          <h3 className={cn(
            "font-serif font-bold text-lg leading-tight mb-1 transition-colors line-clamp-2",
            hasImage ? "text-white group-hover:text-[#c0a080]" : "text-zinc-200 group-hover:text-[#c0a080]"
          )}>
            {note.title || "Sans Titre"}
          </h3>

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
                  hasImage ? "bg-white/10 text-zinc-300" : "bg-[#25252a] text-zinc-400"
                )}>#{t.label}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function CustomEditorModal({ data, onClose, onSave, onDelete }: { data: Partial<Note>, onClose: () => void, onSave: (d: Partial<Note>) => void, onDelete: (id: string) => void }) {
  const [note, setNote] = useState(data)
  const [scrolled, setScrolled] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleScroll = () => {
    if (contentRef.current) {
      setScrolled(contentRef.current.scrollTop > 50)
    }
  }

  // Auto-save tags
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
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        className="relative w-full max-w-6xl h-[90vh] bg-[#09090b] border border-[#2a2a2a] rounded-xl shadow-2xl overflow-hidden flex flex-row"
      >
        {/* --- LEFT SIDEBAR: PROPERTIES --- */}
        <div className="w-[320px] bg-[#0c0c0e] border-r border-[#2a2a2a] flex flex-col overflow-y-auto custom-scrollbar">
          <div className="p-6 border-b border-[#2a2a2a]">
            <h2 className="text-[#c0a080] text-xs font-bold uppercase tracking-widest mb-4">Type d'archive</h2>
            <div className="grid grid-cols-2 gap-2">
              {NOTE_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setNote(prev => ({ ...prev, type: t.id as any }))}
                  className={cn(
                    "flex flex-col items-center justify-center p-3 rounded-lg border transition-all gap-2",
                    note.type === t.id ? "bg-[#c0a080]/10 border-[#c0a080] text-[#c0a080]" : "border-[#27272a] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                  )}
                >
                  <t.icon className="w-5 h-5" />
                  <span className="text-[10px] font-bold uppercase">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 space-y-6 flex-1">
            {/* Context Fields */}
            <div className="space-y-4">
              {note.type === 'character' && (
                <>
                  <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-zinc-500">Race</label><input value={note.race || ''} onChange={e => setNote(p => ({ ...p, race: e.target.value }))} className="w-full bg-[#18181b] border border-[#27272a] rounded px-3 py-2 text-sm text-white focus:border-[#c0a080] outline-none" /></div>
                  <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-zinc-500">Classe</label><input value={note.class || ''} onChange={e => setNote(p => ({ ...p, class: e.target.value }))} className="w-full bg-[#18181b] border border-[#27272a] rounded px-3 py-2 text-sm text-white focus:border-[#c0a080] outline-none" /></div>
                </>
              )}
              {note.type === 'location' && (
                <div className="space-y-1"><label className="text-[10px] uppercase font-bold text-zinc-500">Région</label><input value={note.region || ''} onChange={e => setNote(p => ({ ...p, region: e.target.value }))} className="w-full bg-[#18181b] border border-[#27272a] rounded px-3 py-2 text-sm text-white focus:border-[#c0a080] outline-none" /></div>
              )}
              {note.type === 'quest' && (
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Statut de quête</label>
                  <div className="flex bg-[#18181b] p-1 rounded border border-[#27272a]">
                    {['not-started', 'in-progress', 'completed'].map(s => (
                      <button key={s} onClick={() => setNote(p => ({ ...p, questStatus: s as any }))} className={cn("flex-1 py-1 rounded text-[10px] font-bold uppercase", note.questStatus === s ? "bg-[#c0a080] text-black" : "text-zinc-500")}>
                        {s === 'not-started' ? 'À faire' : s === 'in-progress' ? 'En cours' : 'Fini'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="pt-6 border-t border-[#2a2a2a]">
              <label className="text-[10px] uppercase font-bold text-zinc-500 mb-3 block">Mots-clés</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {note.tags?.map(t => (
                  <span key={t.id} className="text-xs bg-[#18181b] border border-[#27272a] px-2 py-1 rounded flex items-center gap-1 text-zinc-300">
                    #{t.label}
                    <button onClick={() => setNote(p => ({ ...p, tags: p.tags?.filter(x => x.id !== t.id) }))} className="hover:text-red-400 ml-1"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <input placeholder="+ Ajouter..." onKeyDown={handleAddTag} className="w-full bg-transparent border-b border-[#27272a] py-1 text-sm outline-none focus:border-[#c0a080] placeholder:text-zinc-700" />
            </div>
          </div>

          {/* Delete Action */}
          {note.id && (
            <div className="p-6 mt-auto border-t border-[#2a2a2a]">
              <button onClick={() => onDelete(note.id!)} className="flex items-center gap-2 text-red-500 text-xs font-bold uppercase hover:text-red-400 transition-colors">
                <Trash2 className="w-4 h-4" /> Supprimer ce document
              </button>
            </div>
          )}
        </div>

        {/* --- RIGHT CONTENT: CANVAS --- */}
        <div className="flex-1 flex flex-col relative bg-[#121212]">

          {/* Floating Actions */}
          <div className={cn("absolute top-0 right-0 left-0 p-6 flex justify-between items-start z-20 transition-all duration-300", scrolled ? "bg-[#121212]/90 backdrop-blur border-b border-[#2a2a2a] py-3" : "")}>
            <div className="flex items-center gap-4">
              <button onClick={onClose} className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            <button onClick={() => onSave(note)} className="bg-[#c0a080] hover:bg-[#b09070] text-black font-bold uppercase tracking-widest text-xs px-6 py-3 rounded shadow-lg shadow-[#c0a080]/10 transition-all flex items-center gap-2">
              <Save className="w-4 h-4" /> Enregistrer
            </button>
          </div>

          {/* Scrollable Canvas */}
          <div ref={contentRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar">

            {/* Header Image */}
            <div className="h-[350px] w-full relative bg-[#09090b] shrink-0 group">
              {note.image ? (
                <img src={note.image} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
              ) : (
                <div className="w-full h-full flex items-center justify-center opacity-10 bg-[url('/grid-pattern.svg')]">
                  <ImageIcon className="w-20 h-20 text-white" strokeWidth={1} />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/40 to-transparent" />

              <label className="absolute bottom-6 right-6 bg-black/60 backdrop-blur px-4 py-2 rounded-full border border-white/10 text-xs font-bold uppercase tracking-wider text-white cursor-pointer hover:bg-black/80 flex items-center gap-2 transition-all">
                <ImageIcon className="w-4 h-4" /> Modifier l'image
                <input type="file" accept="image/*" className="hidden" onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) { const r = new FileReader(); r.onloadend = () => setNote(p => ({ ...p, image: r.result as string })); r.readAsDataURL(f); }
                }} />
              </label>
            </div>

            {/* Editor Body */}
            <div className="max-w-4xl mx-auto px-10 py-12">
              <input
                value={note.title}
                onChange={e => setNote(p => ({ ...p, title: e.target.value }))}
                placeholder="Titre du document..."
                className="w-full bg-transparent text-5xl font-serif font-bold text-[#e0e0e0] placeholder:text-zinc-700 outline-none mb-8"
              />

              <textarea
                value={note.content}
                onChange={e => setNote(p => ({ ...p, content: e.target.value }))}
                placeholder="Commencez à rédiger..."
                className="w-full min-h-[500px] bg-transparent text-lg text-zinc-300 font-serif leading-loose outline-none resize-none placeholder:text-zinc-700"
              />

              {/* Quest Steps if applicable */}
              {note.type === 'quest' && (
                <div className="mt-12 pt-8 border-t border-[#2a2a2a]">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[#c0a080] text-sm font-bold uppercase tracking-widest">Chroniques & Étapes</h3>
                    <button onClick={() => setNote(p => ({ ...p, subQuests: [...(p.subQuests || []), { id: Date.now().toString(), title: '', description: '', status: 'not-started' }] }))} className="text-xs text-[#c0a080] border border-[#c0a080] px-3 py-1 rounded hover:bg-[#c0a080]/10">
                      + Ajouter une étape
                    </button>
                  </div>
                  <div className="space-y-3">
                    {note.subQuests?.map((sq, i) => (
                      <div key={sq.id} className="flex items-center gap-4 p-4 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] group">
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
