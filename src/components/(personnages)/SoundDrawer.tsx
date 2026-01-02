"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Volume2, Search, X, Plus, Trash2, Library, Music, Play, Pause, MapPin, Youtube, FileAudio, ListMusic, GripVertical, Check, StopCircle, PlayCircle, Filter } from 'lucide-react'
import { collection, onSnapshot, query, addDoc, deleteDoc, doc, setDoc, doc as firestoreDoc } from 'firebase/firestore'
import { db, realtimeDb, dbRef, update, onValue, set } from '@/lib/firebase'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { SUGGESTED_SOUNDS, SOUND_CATEGORIES } from '@/lib/suggested-sounds'
import { Badge } from "@/components/ui/badge"

// --- Types ---
interface SoundTemplate {
    id: string
    name: string
    soundUrl: string
    type: 'file' | 'youtube'
    duration?: number
    createdAt?: Date
}

interface PlaylistTrack {
    id: string
    templateId: string // Link to original template
    name: string
    soundUrl: string
    type: 'file' | 'youtube'
}

interface MusicState {
    videoId: string | null;
    isPlaying: boolean;
    videoTitle?: string;
}

interface SoundDrawerProps {
    roomId: string
    isOpen: boolean
    onClose: () => void
    onDragStart: (sound: SoundTemplate) => void
    currentCityId: string | null
}

export function SoundDrawer({ roomId, isOpen, onClose, onDragStart }: SoundDrawerProps) {
    // --- Data States ---
    const [templates, setTemplates] = useState<SoundTemplate[]>([])
    const [playlist, setPlaylist] = useState<PlaylistTrack[]>([])

    // --- UI States ---
    const [activeTab, setActiveTab] = useState<'zones' | 'quick' | 'music'>('zones')
    const [searchQuery, setSearchQuery] = useState('')
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

    // --- Library Dialog States ---
    const [isLibraryOpen, setIsLibraryOpen] = useState(false)
    const [selectedLibraryCategory, setSelectedLibraryCategory] = useState('all')
    const [librarySearch, setLibrarySearch] = useState('')
    const [playingLibraryUrl, setPlayingLibraryUrl] = useState<string | null>(null)
    const [libraryAudio, setLibraryAudio] = useState<HTMLAudioElement | null>(null)
    const [addedLibraryIds, setAddedLibraryIds] = useState<Set<string>>(new Set()) // Visual feedback

    // --- Creation States ---
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [creationType, setCreationType] = useState<'file' | 'youtube'>('file')
    const [newSoundName, setNewSoundName] = useState('')
    const [newSoundFile, setNewSoundFile] = useState<{ file: File, name: string } | null>(null)
    const [youtubeInput, setYoutubeInput] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    // --- Playback States ---
    const [globalPlayingId, setGlobalPlayingId] = useState<string | null>(null) // Quick Sound (Files)
    const [musicState, setMusicState] = useState<MusicState>({ videoId: null, isPlaying: false }) // YouTube Music

    // 1. Load Templates (Unified Library)
    useEffect(() => {
        if (!roomId || !isOpen) return
        const q = query(collection(db, `sound_templates/${roomId}/templates`))
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SoundTemplate))
            setTemplates(data)
        })
        return () => unsubscribe()
    }, [roomId, isOpen])

    // 2. Load Playlist (For Music Tab)
    useEffect(() => {
        if (!roomId || activeTab !== 'music') return
        const unsubscribe = onValue(dbRef(realtimeDb, `rooms/${roomId}/playlist`), (snapshot) => {
            const data = snapshot.val()
            setPlaylist(Array.isArray(data) ? data : [])
        })
        return () => unsubscribe()
    }, [roomId, activeTab])

    // 3. Listeners for Playback Status
    useEffect(() => {
        if (!roomId) return
        const unsubQuick = onSnapshot(firestoreDoc(db, 'global_sounds', roomId), (docSnap) => {
            const data = docSnap.data()
            setGlobalPlayingId(data?.soundUrl ? data.soundId : null)
        })
        const unsubMusic = onValue(dbRef(realtimeDb, `rooms/${roomId}/music`), (snapshot) => {
            const data = snapshot.val()
            if (data) setMusicState(data)
        })
        return () => { unsubQuick(); unsubMusic(); }
    }, [roomId])

    // Cleanup library audio on close
    useEffect(() => {
        if (!isLibraryOpen && libraryAudio) {
            libraryAudio.pause()
            setPlayingLibraryUrl(null)
        }
    }, [isLibraryOpen, libraryAudio])

    // --- Helpers ---
    const extractVideoId = (url: string): string | null => {
        const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/, /^([a-zA-Z0-9_-]{11})$/]
        for (const pattern of patterns) {
            const match = url.match(pattern)
            if (match && match[1]) return match[1]
        }
        return null
    }

    // --- Library Logic ---
    const toggleLibraryPreview = (path: string) => {
        if (playingLibraryUrl === path && libraryAudio) {
            libraryAudio.pause()
            setPlayingLibraryUrl(null)
        } else {
            if (libraryAudio) libraryAudio.pause()
            const audio = new Audio(path)
            audio.volume = 0.4
            audio.play()
            audio.onended = () => setPlayingLibraryUrl(null)
            setLibraryAudio(audio)
            setPlayingLibraryUrl(path)
        }
    }

    const addFromLibrary = async (sound: typeof SUGGESTED_SOUNDS[0]) => {
        // Visual feedback
        setAddedLibraryIds(prev => new Set(prev).add(sound.path))

        await addDoc(collection(db, `sound_templates/${roomId}/templates`), {
            name: sound.name,
            soundUrl: sound.path,
            type: 'file',
            createdAt: new Date()
        })

        // Remove checkmark after 2s
        setTimeout(() => {
            setAddedLibraryIds(prev => {
                const next = new Set(prev)
                next.delete(sound.path)
                return next
            })
        }, 2000)
    }

    // --- Handlers ---
    const handleCreate = async () => {
        if (!newSoundName) return
        if (creationType === 'file' && !newSoundFile) return
        if (creationType === 'youtube' && !extractVideoId(youtubeInput)) return

        setIsSubmitting(true)
        try {
            let soundUrl = ''
            if (creationType === 'file' && newSoundFile) {
                const storageRef = ref(getStorage(), `sounds/${roomId}/${Date.now()}_${newSoundFile.name}`)
                const snapshot = await uploadBytes(storageRef, newSoundFile.file)
                soundUrl = await getDownloadURL(snapshot.ref)
            } else {
                soundUrl = extractVideoId(youtubeInput)!
            }

            await addDoc(collection(db, `sound_templates/${roomId}/templates`), {
                name: newSoundName,
                soundUrl,
                type: creationType,
                createdAt: new Date()
            })

            setNewSoundName('')
            setNewSoundFile(null)
            setYoutubeInput('')
            setShowCreateForm(false)
            setCreationType('file')
        } catch (e) { console.error(e) } finally { setIsSubmitting(false) }
    }

    const handleDeleteTemplate = async (id: string) => {
        try { await deleteDoc(doc(db, `sound_templates/${roomId}/templates`, id)); setDeleteConfirmId(null) }
        catch (e) { console.error(e) }
    }

    const playQuickSound = async (sound: SoundTemplate) => {
        const isCurrent = globalPlayingId === sound.id
        if (isCurrent) {
            await setDoc(firestoreDoc(db, 'global_sounds', roomId), { soundUrl: null }, { merge: true })
        } else {
            await setDoc(firestoreDoc(db, 'global_sounds', roomId), { soundUrl: sound.soundUrl, soundId: sound.id, timestamp: Date.now(), type: sound.type })
        }
    }

    const addToMusicPlaylist = async (sound: SoundTemplate) => {
        const newTrack: PlaylistTrack = { id: `${Date.now()}`, templateId: sound.id, name: sound.name, soundUrl: sound.soundUrl, type: sound.type }
        await set(dbRef(realtimeDb, `rooms/${roomId}/playlist`), [...playlist, newTrack])
        if (!musicState.isPlaying && playlist.length === 0) playMusicTrack(sound)
    }

    const playMusicTrack = async (sound: SoundTemplate | PlaylistTrack) => {
        await update(dbRef(realtimeDb, `rooms/${roomId}/music`), { videoId: sound.soundUrl, videoTitle: sound.name, isPlaying: true, timestamp: 0, lastUpdate: Date.now() })
    }

    const removeFromPlaylist = async (trackId: string) => {
        const newPlaylist = playlist.filter(t => t.id !== trackId)
        await set(dbRef(realtimeDb, `rooms/${roomId}/playlist`), newPlaylist)
    }

    // --- Render Helpers ---
    const filteredTemplates = templates.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))

    const RenderIcon = ({ type }: { type: string }) => type === 'youtube'
        ? <Youtube className="w-4 h-4 text-red-500" />
        : <FileAudio className="w-4 h-4 text-[#b084ff]" />

    return (
        <>
            <div className={`fixed inset-y-0 right-0 w-80 bg-[#141414] border-l border-[#333] shadow-2xl transform transition-transform duration-300 z-50 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

                {/* HEADER */}
                <div className="p-4 border-b border-[#333] flex items-center justify-between bg-[#1a1a1a]">
                    <div className="flex items-center gap-2">
                        <Volume2 className="w-5 h-5 text-[#c0a080]" />
                        <h2 className="font-bold text-[#e0e0e0]">Sons & Musiques</h2>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-gray-400 hover:text-white">
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                {/* TABS */}
                <div className="flex border-b border-[#333]">
                    {[{ id: 'zones', icon: MapPin, label: 'Zones' }, { id: 'quick', icon: Play, label: 'Rapide' }, { id: 'music', icon: ListMusic, label: 'Musique' }].map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 px-2 py-3 text-xs font-medium transition-colors relative flex flex-col items-center gap-1 ${activeTab === tab.id ? 'text-[#c0a080] bg-[#252525]' : 'text-gray-400 hover:bg-[#1a1a1a]'}`}>
                            <tab.icon className="w-4 h-4" /> <span>{tab.label}</span>
                            {activeTab === tab.id && <div className="absolute bottom-0 w-full h-0.5 bg-[#c0a080]" />}
                        </button>
                    ))}
                </div>

                {/* ADD GLOBAL BUTTON */}
                {!showCreateForm && (
                    <div className="p-3 border-b border-[#333] bg-[#1a1a1a] flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                            <Input placeholder="Rechercher..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 bg-[#252525] border-none text-white h-8 text-xs" />
                        </div>
                        <Button onClick={() => setShowCreateForm(true)} size="sm" className="h-8 bg-[#c0a080] text-black hover:bg-[#d4b494]"><Plus className="w-4 h-4" /></Button>
                        <Button onClick={() => setIsLibraryOpen(true)} size="icon" variant="outline" className="h-8 w-8 border-[#333] text-gray-400 hover:text-white bg-transparent"><Library className="w-4 h-4" /></Button>
                    </div>
                )}

                {/* CREATE FORM */}
                {showCreateForm && (
                    <div className="p-4 bg-[#1e1e1e] border-b border-[#333] space-y-3 animate-in slide-in-from-top-2 border-l-4 border-l-[#c0a080]">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-semibold text-white text-sm">Ajouter une ressource</span>
                            <X className="w-4 h-4 cursor-pointer text-gray-400" onClick={() => setShowCreateForm(false)} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 bg-[#252525] p-1 rounded-md">
                            <button onClick={() => setCreationType('file')} className={`text-xs py-1 rounded transition ${creationType === 'file' ? 'bg-[#333] text-white' : 'text-gray-500'}`}>Fichier</button>
                            <button onClick={() => setCreationType('youtube')} className={`text-xs py-1 rounded transition ${creationType === 'youtube' ? 'bg-[#991b1b] text-white' : 'text-gray-500'}`}>YouTube</button>
                        </div>
                        <Input placeholder="Nom du son" value={newSoundName} onChange={e => setNewSoundName(e.target.value)} className="h-8 bg-[#252525]" />
                        {creationType === 'file' ? (
                            <Input type="file" accept="audio/*" className="text-xs text-gray-400 file:text-white file:bg-[#333] file:border-0 file:rounded-sm" onChange={e => {
                                const f = e.target.files?.[0]; if (f) { setNewSoundFile({ file: f, name: f.name.split('.')[0] }); if (!newSoundName) setNewSoundName(f.name.split('.')[0]); }
                            }} />
                        ) : (
                            <Input placeholder="URL YouTube" value={youtubeInput} onChange={e => setYoutubeInput(e.target.value)} className="h-8 bg-[#252525]" />
                        )}
                        <Button onClick={handleCreate} disabled={isSubmitting} size="sm" className="w-full bg-[#c0a080] text-black hover:bg-[#d4b494]">Ajouter</Button>
                    </div>
                )}

                {/* CONTENT AREA */}
                <ScrollArea className="flex-1 bg-[#121212]">
                    <div className="p-2 space-y-1">
                        {activeTab === 'music' && (
                            <div className="space-y-4">
                                {/* Playlist */}
                                {playlist.length > 0 && (
                                    <div className="space-y-1 mb-4">
                                        <div className="text-[10px] uppercase font-bold text-gray-500 px-2">Playlist en cours</div>
                                        {playlist.map(track => (
                                            <div key={track.id} className={`flex items-center gap-2 p-2 rounded bg-[#1f1f1f] border ${musicState.videoId === track.soundUrl ? 'border-[#c0a080] text-[#c0a080]' : 'border-[#333] text-gray-300'}`}>
                                                <button onClick={() => playMusicTrack(track)} className="hover:text-white"><Play className="w-3 h-3" /></button>
                                                <div className="flex-1 truncate text-xs">{track.name}</div>
                                                <button onClick={() => removeFromPlaylist(track.id)} className="text-gray-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {/* Templates */}
                                <div className="text-[10px] uppercase font-bold text-gray-500 px-2 mt-4 pb-1 border-b border-[#333]">Ajouter depuis la bibliothèque</div>
                                {filteredTemplates.map(sound => (
                                    <div key={sound.id} className="flex items-center justify-between p-2 hover:bg-[#1a1a1a] rounded group">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <RenderIcon type={sound.type} />
                                            <span className="text-xs text-gray-300 truncate">{sound.name}</span>
                                        </div>
                                        <Button onClick={() => addToMusicPlaylist(sound)} size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-[#c0a080] hover:text-black">
                                            <Plus className="w-3 h-3" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab !== 'music' && filteredTemplates.map(sound => {
                            const isPlaying = activeTab === 'quick' && globalPlayingId === sound.id;
                            return (
                                <div key={sound.id} draggable={activeTab === 'zones'} onDragStart={() => activeTab === 'zones' && onDragStart(sound)}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all group ${isPlaying ? 'bg-[#c0a080]/10 border-[#c0a080]/30' : 'bg-[#1e1e1e] border-[#333] hover:border-[#444]'} ${activeTab === 'zones' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                >
                                    {activeTab === 'zones' ? (<div className="text-gray-500 cursor-grab"><GripVertical className="w-4 h-4" /></div>) : (
                                        <button onClick={() => playQuickSound(sound)} className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${isPlaying ? 'bg-[#c0a080] text-black animate-pulse' : 'bg-[#252525] text-gray-400 hover:text-white'}`}>
                                            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                        </button>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <RenderIcon type={sound.type} />
                                            <span className={`text-sm font-medium truncate ${isPlaying ? 'text-[#c0a080]' : 'text-gray-200'}`}>{sound.name}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">{activeTab === 'zones' ? 'Glisser sur la carte' : 'Clic pour jouer'}</div>
                                    </div>
                                    {deleteConfirmId === sound.id ? (<Button size="sm" variant="destructive" className="h-6 px-2 text-[10px]" onClick={() => handleDeleteTemplate(sound.id)}>Suppr.</Button>) : (
                                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400" onClick={() => setDeleteConfirmId(sound.id)}><Trash2 className="w-3 h-3" /></Button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>
            </div>

            {/* --- CUSTOM LIBRARY MODAL (No Shadcn) --- */}
            {isLibraryOpen && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    {/* Backdrop Click to Close */}
                    <div className="absolute inset-0" onClick={() => setIsLibraryOpen(false)} />

                    {/* Modal Content */}
                    <div className="relative w-full max-w-5xl h-[85vh] bg-[#0a0a0a] border border-[#333] rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                        {/* HEADER */}
                        <div className="p-5 border-b border-[#222] bg-[#111] flex flex-col gap-4 shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-10 h-10 rounded-full bg-[#1e1e1e] flex items-center justify-center border border-[#333]">
                                        <Library className="w-5 h-5 text-[#c0a080]" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white">Bibliothèque Audio</h2>
                                        <p className="text-xs text-gray-500">Importez des sons d'ambiance et effets pour vos parties.</p>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => setIsLibraryOpen(false)} className="text-gray-400 hover:text-white">
                                    <X className="w-6 h-6" />
                                </Button>
                            </div>

                            {/* Search Bar */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <Input
                                    value={librarySearch}
                                    onChange={(e) => setLibrarySearch(e.target.value)}
                                    className="bg-[#1a1a1a] border-[#333] h-10 pl-10 text-sm focus:border-[#c0a080] placeholder:text-gray-600 text-white"
                                    placeholder="Rechercher un son (ex: pluie, épée, taverne...)"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* BODY */}
                        <div className="flex-1 flex overflow-hidden">

                            {/* SIDEBAR: CATEGORIES */}
                            <div className="w-64 bg-[#111] border-r border-[#222] flex flex-col shrink-0">
                                <ScrollArea className="flex-1 py-3 px-2">
                                    <div className="space-y-1">
                                        <Button
                                            variant="ghost"
                                            onClick={() => setSelectedLibraryCategory('all')}
                                            className={`w-full justify-start text-sm h-9 ${selectedLibraryCategory === 'all' ? 'bg-[#c0a080]/10 text-[#c0a080]' : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'}`}
                                        >
                                            <ListMusic className="w-4 h-4 mr-2" /> Tout voir
                                        </Button>
                                        <div className="h-px bg-[#222] my-2 mx-1" />
                                        <div className="px-2 pb-1 text-[10px] font-semibold text-gray-600 uppercase">Catégories</div>
                                        {SOUND_CATEGORIES.map(cat => (
                                            <Button
                                                key={cat.id}
                                                variant="ghost"
                                                onClick={() => setSelectedLibraryCategory(cat.id)}
                                                className={`w-full justify-start text-sm h-9 ${selectedLibraryCategory === cat.id ? 'bg-[#c0a080]/10 text-[#c0a080]' : 'text-gray-400 hover:text-white hover:bg-[#1a1a1a]'}`}
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-current mr-2.5 opacity-50" />
                                                {cat.label}
                                            </Button>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>

                            {/* MAIN: SOUND GRID */}
                            <div className="flex-1 bg-[#0a0a0a] flex flex-col min-w-0">
                                <ScrollArea className="flex-1 p-5">
                                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                        {SUGGESTED_SOUNDS
                                            .filter(s => {
                                                const matchesSearch = s.name.toLowerCase().includes(librarySearch.toLowerCase()) || s.category.toLowerCase().includes(librarySearch.toLowerCase())
                                                const matchesCat = selectedLibraryCategory === 'all' || s.category === selectedLibraryCategory
                                                return matchesSearch && matchesCat
                                            })
                                            .map((sound, i) => {
                                                const isPlaying = playingLibraryUrl === sound.path
                                                const isAdded = addedLibraryIds.has(sound.path)

                                                return (
                                                    <div
                                                        key={i}
                                                        className={`group relative p-3 rounded-xl border transition-all duration-200 bg-[#161616] hover:bg-[#1a1a1a] flex flex-col gap-2 ${isPlaying ? 'border-[#c0a080] shadow-[0_0_15px_-3px_rgba(192,160,128,0.2)]' : 'border-[#222] hover:border-[#444]'
                                                            }`}
                                                    >
                                                        {/* Top Row: Info */}
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0">
                                                                <div className={`text-sm font-medium truncate ${isPlaying ? 'text-[#c0a080]' : 'text-gray-200'}`}>
                                                                    {sound.name}
                                                                </div>
                                                                <div className="text-[10px] text-gray-500 truncate mt-0.5 flex items-center gap-1">
                                                                    <Badge variant="outline" className="h-[18px] px-1.5 border-[#333] bg-[#111] text-[9px] text-gray-400 font-normal rounded">
                                                                        {sound.category}
                                                                    </Badge>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Actions Row */}
                                                        <div className="flex items-center gap-2 mt-2">
                                                            {/* Play Preview */}
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={(e) => { e.stopPropagation(); toggleLibraryPreview(sound.path); }}
                                                                className={`flex-1 h-8 rounded-lg text-xs font-medium border transition-colors ${isPlaying
                                                                    ? 'bg-[#c0a080] text-black border-[#c0a080] hover:bg-[#d4b494]'
                                                                    : 'bg-[#111] border-[#333] text-gray-300 hover:bg-[#222] hover:border-[#555]'
                                                                    }`}
                                                            >
                                                                {isPlaying ? (
                                                                    <>
                                                                        <StopCircle className="w-3.5 h-3.5 mr-1.5 animate-pulse" /> Stop
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <PlayCircle className="w-3.5 h-3.5 mr-1.5" /> Écouter
                                                                    </>
                                                                )}
                                                            </Button>

                                                            {/* Add Button */}
                                                            <Button
                                                                size="icon"
                                                                onClick={(e) => { e.stopPropagation(); addFromLibrary(sound); }}
                                                                disabled={isAdded}
                                                                className={`h-8 w-8 rounded-lg shrink-0 transition-all ${isAdded
                                                                    ? 'bg-green-900/50 text-green-400 border border-green-800'
                                                                    : 'bg-[#111] border border-[#333] text-gray-400 hover:text-white hover:border-[#c0a080] hover:bg-[#c0a080]/10'
                                                                    }`}
                                                            >
                                                                {isAdded ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        }
                                    </div>

                                    {/* Empty State */}
                                    {SUGGESTED_SOUNDS.filter(s => (s.name.toLowerCase().includes(librarySearch.toLowerCase()) || s.category.includes(librarySearch))).length === 0 && (
                                        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                                            <Search className="w-12 h-12 mb-4 opacity-20" />
                                            <p>Aucun son trouvé pour "{librarySearch}"</p>
                                        </div>
                                    )}
                                </ScrollArea>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
