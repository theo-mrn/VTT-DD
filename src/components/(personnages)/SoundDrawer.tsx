"use client"

import React, { useState, useEffect, useRef } from 'react'
import { Volume2, Search, X, Plus, Trash2, Library, Music, Play, Pause, MapPin, Youtube, FileAudio, ListMusic, GripVertical, Check, StopCircle, PlayCircle, Filter, SkipBack, SkipForward, Repeat, Shuffle } from 'lucide-react'
import { collection, onSnapshot, query, addDoc, deleteDoc, doc, setDoc, doc as firestoreDoc } from 'firebase/firestore'
import { db, realtimeDb, dbRef, update, onValue, set } from '@/lib/firebase'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { SUGGESTED_SOUNDS, SOUND_CATEGORIES } from '@/lib/suggested-sounds'
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useDialogVisibility } from '@/contexts/DialogVisibilityContext'

// --- Types ---
interface SoundTemplate {
    id: string
    name: string
    soundUrl: string
    type: 'file' | 'youtube'
    category?: 'music' | 'sound'
    duration?: number
    createdAt?: Date
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
    const { setDialogOpen } = useDialogVisibility();

    // Register dialog state when drawer opens/closes
    useEffect(() => {
        setDialogOpen(isOpen);
    }, [isOpen, setDialogOpen]);
    // --- Data States ---
    const [templates, setTemplates] = useState<SoundTemplate[]>([])

    // --- UI States ---
    const [activeTab, setActiveTab] = useState<'sounds' | 'music'>('sounds') // Changed from 3 tabs to 2
    const [searchQuery, setSearchQuery] = useState('')
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

    // --- Local/Global Playback States ---
    const [isGlobalPlayback, setIsGlobalPlayback] = useState(true) // Default to global
    const [playingLocalId, setPlayingLocalId] = useState<string | null>(null)
    const localAudioRef = useRef<HTMLAudioElement | null>(null)

    // --- Library Dialog States ---
    const [isLibraryOpen, setIsLibraryOpen] = useState(false)
    const [selectedLibraryCategory, setSelectedLibraryCategory] = useState('all')
    const [librarySearch, setLibrarySearch] = useState('')
    const [playingLibraryUrl, setPlayingLibraryUrl] = useState<string | null>(null)
    const [libraryAudio, setLibraryAudio] = useState<HTMLAudioElement | null>(null)
    const [addedLibraryIds, setAddedLibraryIds] = useState<Set<string>>(new Set()) // Visual feedback

    // Playback Ref
    const lastPlayedTimestamp = useRef<number>(0)
    const activeAudioRef = useRef<HTMLAudioElement | null>(null)

    // Track if this is the first snapshot (to ignore initial state on page load)
    const isFirstSoundSnapshotRef = useRef(true)

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



    // 3. Listeners for Playback Status
    useEffect(() => {
        if (!roomId) return

        // Reset flag when effect mounts
        isFirstSoundSnapshotRef.current = true

        const unsubQuick = onSnapshot(firestoreDoc(db, 'global_sounds', roomId), (docSnap) => {
            // Skip the first snapshot (initial state) to avoid replaying old sounds
            if (isFirstSoundSnapshotRef.current) {
                isFirstSoundSnapshotRef.current = false
                return
            }

            const data = docSnap.data()
            const newSoundUrl = data?.soundUrl
            const newTimestamp = data?.timestamp || 0

            // Update UI state
            setGlobalPlayingId(newSoundUrl ? data.soundId : null)

            // Play Sound if new timestamp and we have a URL and it is a file
            if (newSoundUrl && newTimestamp > lastPlayedTimestamp.current && data?.type === 'file') {
                lastPlayedTimestamp.current = newTimestamp
                const currentSoundId = data.soundId

                // Stop previous if exists (optional, maybe we want overlap for attacks? let's stop for now to be clean)
                // actually for attacks often we want overlap, but for "quick sound" mode it seems like a player
                // Let's create a new Audio instance for new sound
                const audio = new Audio(newSoundUrl)
                audio.volume = 0.5 // Default volume
                audio.play().catch(e => console.error("Error auto-playing sound:", e))

                // Stop after 5 seconds max and reset the playing state
                setTimeout(() => {
                    audio.pause()
                    audio.currentTime = 0
                    // Only clear the playing state if this is still the current sound
                    setGlobalPlayingId(prev => prev === currentSoundId ? null : prev)
                }, 5000)
            }
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
            category: activeTab === 'music' ? 'music' : 'sound',
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

            const docRef = await addDoc(collection(db, `sound_templates/${roomId}/templates`), {
                name: newSoundName,
                soundUrl,
                type: creationType,
                category: activeTab === 'music' ? 'music' : 'sound',
                createdAt: new Date()
            })

            // If in Music tab, play it directly if nothing is playing? Or just let it appear in list.
            // Simplified: just add to list (already done via real-time listener)

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

    // New unified playSound function for local/global playback
    const playSound = async (sound: SoundTemplate) => {
        if (isGlobalPlayback) {
            // Global mode: play for everyone via Realtime DB
            const isCurrent = globalPlayingId === sound.id
            if (isCurrent) {
                await setDoc(firestoreDoc(db, 'global_sounds', roomId), { soundUrl: null }, { merge: true })
            } else {
                await setDoc(firestoreDoc(db, 'global_sounds', roomId), { soundUrl: sound.soundUrl, soundId: sound.id, timestamp: Date.now(), type: sound.type })
            }
        } else {
            // Local mode: play locally for preview
            const isCurrentlyPlaying = playingLocalId === sound.id

            if (isCurrentlyPlaying) {
                // Stop current sound
                if (localAudioRef.current) {
                    localAudioRef.current.pause()
                    localAudioRef.current = null
                }
                setPlayingLocalId(null)
            } else {
                // Stop previous sound if any
                if (localAudioRef.current) {
                    localAudioRef.current.pause()
                }

                // Play new sound locally
                const audio = new Audio(sound.soundUrl)
                audio.volume = 0.5
                audio.play().catch(err => console.error('Error playing audio:', err))

                audio.onended = () => {
                    setPlayingLocalId(null)
                    localAudioRef.current = null
                }

                localAudioRef.current = audio
                setPlayingLocalId(sound.id)
            }
        }
    }

    const playMusicTrack = async (sound: SoundTemplate) => {
        if (musicState.videoId === sound.soundUrl) {
            await update(dbRef(realtimeDb, `rooms/${roomId}/music`), { isPlaying: !musicState.isPlaying, lastUpdate: Date.now() })
        } else {
            await update(dbRef(realtimeDb, `rooms/${roomId}/music`), { videoId: sound.soundUrl, videoTitle: sound.name, isPlaying: true, timestamp: 0, lastUpdate: Date.now() })
        }
    }

    const playNext = () => {
        // Need to recalculate musicResults here or memoize it outside render
        const searchFiltered = templates.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
        const musicResults = searchFiltered.filter(t => t.category === 'music')

        if (!musicState.videoId || musicResults.length === 0) return
        const currentIndex = musicResults.findIndex(t => t.soundUrl === musicState.videoId)
        const nextIndex = (currentIndex + 1) % musicResults.length
        playMusicTrack(musicResults[nextIndex])
    }

    const playPrevious = () => {
        const searchFiltered = templates.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))
        const musicResults = searchFiltered.filter(t => t.category === 'music')

        if (!musicState.videoId || musicResults.length === 0) return
        const currentIndex = musicResults.findIndex(t => t.soundUrl === musicState.videoId)
        const prevIndex = (currentIndex - 1 + musicResults.length) % musicResults.length
        playMusicTrack(musicResults[prevIndex])
    }

    // --- Handlers --- (Adding drag start)
    const handleDragStart = (e: React.DragEvent, sound: SoundTemplate) => {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('application/json', JSON.stringify({ ...sound, type: 'sound_template' }))
        onDragStart(sound)
    }

    // --- Render Helpers ---.
    // Filter by search query first
    const searchFiltered = templates.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))

    // Then split by category
    const soundResults = searchFiltered.filter(t => t.category !== 'music') // Default to sound if undefined
    const musicResults = searchFiltered.filter(t => t.category === 'music')

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
                    {[
                        { id: 'sounds' as const, icon: Volume2, label: 'Effets Audio' },
                        { id: 'music' as const, icon: ListMusic, label: 'Musique' }
                    ].map(tab => {
                        // Check if there's active playback for this tab
                        const hasActivePlayback = tab.id === 'sounds'
                            ? (globalPlayingId !== null || playingLocalId !== null)
                            : (musicState.isPlaying && musicState.videoId !== null)

                        return (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 px-2 py-3 text-xs font-medium transition-colors relative flex flex-col items-center gap-1 ${activeTab === tab.id ? 'text-[#c0a080] bg-[#252525]' : 'text-gray-400 hover:bg-[#1a1a1a]'}`}>
                                <div className="relative">
                                    <tab.icon className="w-4 h-4" />
                                    {/* Playback Indicator */}
                                    {hasActivePlayback && (
                                        <div className={`absolute -top-1 -right-1 w-2 h-2 rounded-full animate-pulse ${tab.id === 'sounds' ? 'bg-green-500' : 'bg-[#c0a080]'
                                            }`}>
                                            <div className={`absolute inset-0 rounded-full animate-ping ${tab.id === 'sounds' ? 'bg-green-500' : 'bg-[#c0a080]'
                                                }`} />
                                        </div>
                                    )}
                                </div>
                                <span>{tab.label}</span>
                                {activeTab === tab.id && <div className="absolute bottom-0 w-full h-0.5 bg-[#c0a080]" />}
                            </button>
                        )
                    })}
                </div>

                {/* ADD GLOBAL BUTTON */}
                {!showCreateForm && (
                    <div className="p-3 border-b border-[#333] bg-[#1a1a1a] flex gap-2">
                        {activeTab === 'sounds' ? (
                            <>
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
                                    <Input placeholder="Rechercher..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-8 bg-[#252525] border-none text-white h-8 text-xs" />
                                </div>
                                <Button onClick={() => setShowCreateForm(true)} size="sm" className="h-8 bg-[#c0a080] text-black hover:bg-[#d4b494]"><Plus className="w-4 h-4" /></Button>
                                <Button onClick={() => setIsLibraryOpen(true)} size="icon" variant="outline" className="h-8 w-8 border-[#333] text-gray-400 hover:text-white bg-transparent"><Library className="w-4 h-4" /></Button>
                            </>
                        ) : (
                            <Button onClick={() => setShowCreateForm(true)} size="sm" className="w-full bg-[#c0a080] text-black hover:bg-[#d4b494] gap-2">
                                <Plus className="w-4 h-4" /> Ajouter une piste
                            </Button>
                        )}
                    </div>
                )}

                {/* CREATE FORM */}
                {showCreateForm && (
                    <div className="p-4 bg-[#1e1e1e] border-b border-[#333] space-y-3 animate-in slide-in-from-top-2 border-l-4 border-l-[#c0a080]">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-semibold text-white text-sm">
                                {activeTab === 'music' ? 'Ajouter à la playlist' : 'Ajouter un effet sonore'}
                            </span>
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

                {/* TAB DESCRIPTION + SWITCH */}
                {!showCreateForm && (
                    <div className="px-4 py-2 bg-[#1a1a1a]/50 border-b border-[#333]/50">
                        {activeTab === 'sounds' && (
                            <div className="space-y-2">
                                <p className="text-xs text-gray-400 flex items-center gap-2">
                                    <Volume2 className="w-3 h-3 text-[#c0a080]" />
                                    <span>Cliquez pour jouer, glissez pour placer sur la carte</span>
                                </p>
                                {/* Local/Global Switch */}
                                <div className="flex items-center gap-2 pt-1">
                                    <span className="text-xs text-gray-500">Mode :</span>
                                    <Switch
                                        checked={isGlobalPlayback}
                                        onCheckedChange={setIsGlobalPlayback}
                                        className="data-[state=checked]:bg-[#c0a080]"
                                    />
                                    <span className="text-xs font-medium text-gray-300">
                                        {isGlobalPlayback ? 'Global (tous les joueurs)' : 'Local (preview)'}
                                    </span>
                                </div>
                            </div>
                        )}
                        {activeTab === 'music' && (
                            <p className="text-xs text-gray-400 flex items-center gap-2">
                                <ListMusic className="w-3 h-3 text-[#c0a080]" />
                                <span>Gérez la musique pour l'ambiance de la session</span>
                            </p>
                        )}
                    </div>
                )}

                {/* CONTENT AREA */}
                <ScrollArea className="flex-1 bg-[#121212]">
                    <div className="p-2 space-y-1">
                        {/* MUSIC LIBRARY SECTION */}
                        {activeTab === 'music' && (
                            <div className="space-y-4">
                                <div className="mb-2">
                                    <div className="flex items-center justify-between px-2 py-2 bg-[#1a1a1a] rounded-lg border border-[#333]">
                                        <div className="flex items-center gap-2">
                                            <Library className="w-3.5 h-3.5 text-[#c0a080]" />
                                            <span className="text-xs font-semibold text-gray-300">Mes Musiques</span>
                                        </div>
                                        <span className="text-[10px] text-gray-500">{musicResults.length} titre{musicResults.length !== 1 ? 's' : ''}</span>
                                    </div>
                                </div>

                                {musicResults.length === 0 ? (
                                    <div className="text-center py-8 text-gray-500 text-xs">
                                        <p>Aucune musique importée.</p>
                                        <p className="mt-1">Utilisez le bouton "+" pour ajouter des titres.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {musicResults.map(sound => {
                                            const isCurrentTrack = musicState.videoId === sound.soundUrl
                                            const isPlaying = isCurrentTrack && musicState.isPlaying

                                            return (
                                                <div
                                                    key={sound.id}
                                                    onClick={() => playMusicTrack(sound)}
                                                    className={`flex items-center gap-2 p-2 rounded border transition-all cursor-pointer group ${isCurrentTrack
                                                        ? 'bg-[#c0a080]/10 border-[#c0a080]/30'
                                                        : 'bg-[#1e1e1e] border-[#333] hover:border-[#555]'
                                                        }`}
                                                >
                                                    {/* Play/Pause Button */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            playMusicTrack(sound)
                                                        }}
                                                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${isPlaying
                                                            ? 'bg-[#c0a080] text-black animate-pulse'
                                                            : 'bg-[#252525] text-gray-400 hover:bg-[#c0a080] hover:text-black'
                                                            }`}
                                                    >
                                                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                                    </button>

                                                    <RenderIcon type={sound.type} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className={`text-xs font-medium truncate ${isCurrentTrack ? 'text-[#c0a080]' : 'text-gray-200'}`}>
                                                            {sound.name}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {deleteConfirmId === sound.id ? (
                                                            <Button
                                                                size="sm"
                                                                variant="destructive"
                                                                className="h-6 px-1.5 text-[9px]"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    handleDeleteTemplate(sound.id)
                                                                }}
                                                            >
                                                                Sûr?
                                                            </Button>
                                                        ) : (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6 text-gray-600 hover:text-red-400"
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setDeleteConfirmId(sound.id)
                                                                }}
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* SOUNDS TAB - Hybrid click-to-play + drag-to-map */}
                        {activeTab === 'sounds' && soundResults.map(sound => {
                            // Check if sound is playing (global or local)
                            const isPlayingGlobal = isGlobalPlayback && globalPlayingId === sound.id
                            const isPlayingLocal = !isGlobalPlayback && playingLocalId === sound.id
                            const isPlaying = isPlayingGlobal || isPlayingLocal

                            return (
                                <div
                                    key={sound.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, sound)}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all group cursor-grab active:cursor-grabbing ${isPlaying ? 'bg-[#c0a080]/10 border-[#c0a080]/30' : 'bg-[#1e1e1e] border-[#333] hover:border-[#444]'
                                        }`}
                                >
                                    {/* Drag Handle */}
                                    <GripVertical className="w-4 h-4 text-gray-500 flex-shrink-0" />

                                    {/* Play Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation() // Prevent drag
                                            playSound(sound)
                                        }}
                                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all flex-shrink-0 ${isPlaying
                                            ? 'bg-[#c0a080] text-black animate-pulse'
                                            : 'bg-[#252525] text-gray-400 hover:bg-[#c0a080] hover:text-black'
                                            }`}
                                    >
                                        {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                                    </button>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <RenderIcon type={sound.type} />
                                            <span className={`text-sm font-medium truncate ${isPlaying ? 'text-[#c0a080]' : 'text-gray-200'}`}>
                                                {sound.name}
                                            </span>
                                        </div>
                                        <div className="text-[10px] text-gray-500">
                                            Clic pour jouer • Glisser pour placer
                                        </div>
                                    </div>

                                    {/* Delete Button */}
                                    {deleteConfirmId === sound.id ? (
                                        <Button size="sm" variant="destructive" className="h-6 px-2 text-[10px]" onClick={() => handleDeleteTemplate(sound.id)}>
                                            Suppr.
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400"
                                            onClick={() => setDeleteConfirmId(sound.id)}
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>

                {/* PREMIUM MUSIC PLAYER (Sticky Bottom) */}
                {activeTab === 'music' && (musicResults.length > 0 || musicState.videoId) && (() => {
                    // Find the current track in the music library to display its custom name
                    const currentTrack = musicResults.find(t => t.soundUrl === musicState.videoId)
                    const displayName = currentTrack?.name || musicState.videoTitle || 'Aucune lecture'

                    return (
                        <div className="bg-[#181818] border-t border-[#333] shadow-[0_-4px_20px_rgba(0,0,0,0.4)] z-10 flex flex-col shrink-0">
                            {/* Progress Bar (Visual only for now) */}
                            <div className="h-1 w-full bg-[#2a2a2a] cursor-pointer group relative">
                                <div className="absolute top-0 left-0 h-full bg-[#c0a080] w-1/3 group-hover:bg-[#d4b494] transition-colors relative">
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity transform scale-150" />
                                </div>
                            </div>

                            <div className="p-3 flex items-center justify-between gap-3">
                                {/* Track Info */}
                                <div className="flex items-center gap-3 overflow-hidden flex-1">
                                    <div className="w-10 h-10 rounded bg-[#252525] flex items-center justify-center shrink-0 border border-[#333]">
                                        <Music className="w-5 h-5 text-[#c0a080]" />
                                    </div>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm font-semibold text-white truncate max-w-[120px]">
                                            {displayName}
                                        </span>
                                        <span className="text-[10px] text-gray-500 truncate">
                                            {musicState.isPlaying ? 'En lecture...' : 'En pause'}
                                        </span>
                                    </div>
                                </div>

                                {/* Controls */}
                                <div className="flex items-center gap-2">
                                    <button className="p-1.5 text-gray-400 hover:text-white transition-colors" title="Aléatoire">
                                        <Shuffle className="w-3 h-3" />
                                    </button>
                                    <button onClick={playPrevious} className="p-1.5 text-gray-300 hover:text-white transition-colors hover:bg-[#333] rounded-full">
                                        <SkipBack className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (musicState.videoId) {
                                                update(dbRef(realtimeDb, `rooms/${roomId}/music`), { isPlaying: !musicState.isPlaying, lastUpdate: Date.now() })
                                            }
                                        }}
                                        className="w-8 h-8 rounded-full bg-[#c0a080] text-black flex items-center justify-center hover:bg-[#d4b494] transition-transform active:scale-95 shadow-lg shadow-[#c0a080]/20"
                                    >
                                        {musicState.isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                                    </button>
                                    <button onClick={playNext} className="p-1.5 text-gray-300 hover:text-white transition-colors hover:bg-[#333] rounded-full">
                                        <SkipForward className="w-4 h-4" />
                                    </button>
                                    <button className="p-1.5 text-gray-400 hover:text-white transition-colors" title="Répéter">
                                        <Repeat className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                })()}
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
