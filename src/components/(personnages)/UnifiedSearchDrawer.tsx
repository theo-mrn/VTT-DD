"use client"

import React, { useState, useEffect } from 'react'
import { Search, X, Volume2, Package, Users, Loader2, GripVertical, Play, Pause } from 'lucide-react'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { type NPC } from '@/components/(personnages)/personnages'
import { type ObjectTemplate } from '@/app/[roomid]/map/types'
import { useDialogVisibility } from '@/contexts/DialogVisibilityContext'
import { SUGGESTED_SOUNDS } from '@/lib/suggested-sounds'
import { SUGGESTED_OBJECTS } from '@/lib/suggested-objects'

interface SoundTemplate {
    id: string
    name: string
    soundUrl: string
    type: 'file' | 'youtube'
}

type UnifiedItem = {
    id: string
    name: string
    type: 'sound' | 'object' | 'npc'
    data: SoundTemplate | ObjectTemplate | NPC | any
    imageUrl?: string
    source: 'created' | 'library' // Track if item is user-created or from library
}

interface UnifiedSearchDrawerProps {
    roomId: string
    isOpen: boolean
    onClose: () => void
    onDragStart: (item: UnifiedItem) => void
    currentCityId: string | null
}

export function UnifiedSearchDrawer({ roomId, isOpen, onClose, onDragStart, currentCityId }: UnifiedSearchDrawerProps) {
    const { setDialogOpen } = useDialogVisibility()

    // Register dialog state
    useEffect(() => {
        setDialogOpen(isOpen)
    }, [isOpen, setDialogOpen])

    // Data states
    const [sounds, setSounds] = useState<SoundTemplate[]>([])
    const [objects, setObjects] = useState<ObjectTemplate[]>([])
    const [npcs, setNPCs] = useState<NPC[]>([])

    // UI states
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedFilter, setSelectedFilter] = useState<'all' | 'sound' | 'object' | 'npc'>('all')
    const [loading, setLoading] = useState(true)

    // Audio preview state
    const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)

    // Load sounds
    useEffect(() => {
        if (!roomId || !isOpen) return

        const q = query(collection(db, `sound_templates/${roomId}/templates`))
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SoundTemplate))
            setSounds(data)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [roomId, isOpen])

    // Load objects
    useEffect(() => {
        if (!roomId || !isOpen) return

        const q = query(collection(db, `object_templates/${roomId}/templates`))
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ObjectTemplate))
            setObjects(data)
        })

        return () => unsubscribe()
    }, [roomId, isOpen])

    // Load NPCs
    useEffect(() => {
        if (!roomId || !isOpen) return

        const q = query(collection(db, `npc_templates/${roomId}/templates`))
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as NPC))
            setNPCs(data)
        })

        return () => unsubscribe()
    }, [roomId, isOpen])

    // Unify all items with search and filter
    const unifiedItems: UnifiedItem[] = React.useMemo(() => {
        const items: UnifiedItem[] = []

        // Add created sounds
        if (selectedFilter === 'all' || selectedFilter === 'sound') {
            sounds.forEach(sound => {
                if (sound.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                    items.push({
                        id: `created-sound-${sound.id}`,
                        name: sound.name,
                        type: 'sound',
                        data: sound,
                        source: 'created'
                    })
                }
            })

            // Add library sounds
            SUGGESTED_SOUNDS.forEach((sound, index) => {
                if (sound.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                    items.push({
                        id: `library-sound-${index}`,
                        name: sound.name,
                        type: 'sound',
                        data: {
                            id: `lib-${index}`,
                            name: sound.name,
                            soundUrl: sound.path,
                            type: 'file' as const
                        },
                        source: 'library'
                    })
                }
            })
        }

        // Add created objects
        if (selectedFilter === 'all' || selectedFilter === 'object') {
            objects.forEach(obj => {
                if (obj.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                    items.push({
                        id: `created-obj-${obj.id}`,
                        name: obj.name,
                        type: 'object',
                        data: obj,
                        imageUrl: obj.imageUrl,
                        source: 'created'
                    })
                }
            })

            // Add library objects
            SUGGESTED_OBJECTS.forEach((obj, index) => {
                if (obj.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                    items.push({
                        id: `library-obj-${index}`,
                        name: obj.name,
                        type: 'object',
                        data: {
                            id: `lib-${index}`,
                            name: obj.name,
                            imageUrl: obj.path
                        },
                        imageUrl: obj.path,
                        source: 'library'
                    })
                }
            })
        }

        // Add NPCs (only created, no library)
        if (selectedFilter === 'all' || selectedFilter === 'npc') {
            npcs.forEach(npc => {
                if (npc.Nomperso.toLowerCase().includes(searchQuery.toLowerCase())) {
                    items.push({
                        id: `created-npc-${npc.id}`,
                        name: npc.Nomperso,
                        type: 'npc',
                        data: npc,
                        imageUrl: npc.imageURL2,
                        source: 'created'
                    })
                }
            })
        }

        return items
    }, [sounds, objects, npcs, searchQuery, selectedFilter])

    // Audio preview handler
    const handleSoundPreview = (e: React.MouseEvent, item: UnifiedItem) => {
        e.stopPropagation() // Prevent drag start

        if (item.type !== 'sound') return

        const soundData = item.data as SoundTemplate
        const soundUrl = soundData.soundUrl

        // If clicking the same sound, toggle play/pause
        if (playingAudioId === item.id) {
            if (audioElement) {
                audioElement.pause()
                setPlayingAudioId(null)
                setAudioElement(null)
            }
            return
        }

        // Stop previous audio if any
        if (audioElement) {
            audioElement.pause()
        }

        // Create and play new audio
        const audio = new Audio(soundUrl)
        audio.volume = 0.5
        audio.play().catch(err => console.error('Error playing audio:', err))

        audio.onended = () => {
            setPlayingAudioId(null)
            setAudioElement(null)
        }

        setAudioElement(audio)
        setPlayingAudioId(item.id)
    }

    const handleDragStart = (e: React.DragEvent, item: UnifiedItem) => {
        e.dataTransfer.effectAllowed = 'copy'

        // Set data based on type
        if (item.type === 'sound') {
            e.dataTransfer.setData('application/json', JSON.stringify({ ...item.data, type: 'sound_template' }))
        } else if (item.type === 'object') {
            e.dataTransfer.setData('application/json', JSON.stringify({ ...item.data, type: 'object_template' }))
        } else if (item.type === 'npc') {
            e.dataTransfer.setData('application/json', JSON.stringify(item.data))
        }

        onDragStart(item)
    }

    const getItemIcon = (type: UnifiedItem['type']) => {
        switch (type) {
            case 'sound':
                return <Volume2 className="w-4 h-4 text-[#c0a080]" />
            case 'object':
                return <Package className="w-4 h-4 text-[#80c0a0]" />
            case 'npc':
                return <Users className="w-4 h-4 text-[#c0a080]" />
        }
    }

    const getItemBadgeColor = (type: UnifiedItem['type']) => {
        switch (type) {
            case 'sound':
                return 'bg-[#c0a080]/20 text-[#c0a080] border-[#c0a080]/30'
            case 'object':
                return 'bg-[#80c0a0]/20 text-[#80c0a0] border-[#80c0a0]/30'
            case 'npc':
                return 'bg-[#c0a080]/20 text-[#c0a080] border-[#c0a080]/30'
        }
    }

    const getItemLabel = (type: UnifiedItem['type']) => {
        switch (type) {
            case 'sound':
                return 'Son'
            case 'object':
                return 'Objet'
            case 'npc':
                return 'PNJ'
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed right-0 top-0 h-full w-96 bg-[#1a1a1a] border-l border-[#333] z-[99999900] flex flex-col shadow-2xl">
            {/* HEADER */}
            <div className="relative px-6 py-5 border-b border-[#333] bg-gradient-to-br from-[#1a1a1a] via-[#1a1a1a] to-[#252525]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c0a080] to-[#a08060] flex items-center justify-center shadow-lg shadow-[#c0a080]/20">
                            <Search className="w-5 h-5 text-black" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-tight">Recherche Globale</h2>
                            <p className="text-xs text-gray-400">Sons, Objets, PNJs</p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="h-9 w-9 p-0 rounded-lg text-gray-400 hover:text-white hover:bg-[#333] transition-all"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* SEARCH BAR */}
            <div className="p-4 border-b border-[#333] bg-[#1a1a1a] space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <Input
                        placeholder="Rechercher parmi tous les éléments..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-[#252525] border-[#404040] text-white placeholder-gray-500 focus:border-[#c0a080] focus:ring-1 focus:ring-[#c0a080]/20 h-10 rounded-lg"
                        autoFocus
                    />
                </div>

                {/* FILTER TABS */}
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        variant={selectedFilter === 'all' ? 'default' : 'outline'}
                        onClick={() => setSelectedFilter('all')}
                        className={`flex-1 h-8 text-xs ${selectedFilter === 'all'
                            ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]'
                            : 'bg-transparent border-[#333] text-gray-400 hover:text-white hover:bg-[#252525]'
                            }`}
                    >
                        Tous
                    </Button>
                    <Button
                        size="sm"
                        variant={selectedFilter === 'sound' ? 'default' : 'outline'}
                        onClick={() => setSelectedFilter('sound')}
                        className={`flex-1 h-8 text-xs ${selectedFilter === 'sound'
                            ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]'
                            : 'bg-transparent border-[#333] text-gray-400 hover:text-white hover:bg-[#252525]'
                            }`}
                    >
                        <Volume2 className="w-3 h-3 mr-1" />
                        Sons
                    </Button>
                    <Button
                        size="sm"
                        variant={selectedFilter === 'object' ? 'default' : 'outline'}
                        onClick={() => setSelectedFilter('object')}
                        className={`flex-1 h-8 text-xs ${selectedFilter === 'object'
                            ? 'bg-[#80c0a0] text-black hover:bg-[#90d0b0]'
                            : 'bg-transparent border-[#333] text-gray-400 hover:text-white hover:bg-[#252525]'
                            }`}
                    >
                        <Package className="w-3 h-3 mr-1" />
                        Objets
                    </Button>
                    <Button
                        size="sm"
                        variant={selectedFilter === 'npc' ? 'default' : 'outline'}
                        onClick={() => setSelectedFilter('npc')}
                        className={`flex-1 h-8 text-xs ${selectedFilter === 'npc'
                            ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]'
                            : 'bg-transparent border-[#333] text-gray-400 hover:text-white hover:bg-[#252525]'
                            }`}
                    >
                        <Users className="w-3 h-3 mr-1" />
                        PNJs
                    </Button>
                </div>
            </div>

            {/* RESULTS */}
            <ScrollArea className="flex-1 bg-[#121212]">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
                    </div>
                ) : unifiedItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                        <Search className="w-16 h-16 text-gray-600 mb-4" />
                        <h3 className="text-lg font-bold text-gray-400 mb-2">Aucun résultat</h3>
                        <p className="text-sm text-gray-600">
                            {searchQuery
                                ? `Aucun élément ne correspond à "${searchQuery}"`
                                : 'Aucun élément disponible'}
                        </p>
                    </div>
                ) : (
                    <div className="p-4 space-y-2">
                        {unifiedItems.map((item) => (
                            <div
                                key={`${item.type}-${item.id}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, item)}
                                className="group bg-[#1e1e1e] border border-[#333] rounded-lg p-3 cursor-move hover:border-[#c0a080]/50 hover:bg-[#252525] transition-all flex items-center gap-3"
                            >
                                {/* DRAG HANDLE */}
                                <GripVertical className="w-4 h-4 text-gray-600 group-hover:text-[#c0a080] transition-colors flex-shrink-0" />

                                {/* IMAGE/ICON */}
                                {item.imageUrl ? (
                                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[#1a1a1a] border border-[#2a2a2a]">
                                        <img
                                            src={item.imageUrl}
                                            alt={item.name}
                                            className="w-full h-full object-cover"
                                            draggable={false}
                                        />
                                    </div>
                                ) : (
                                    <button
                                        onClick={(e) => item.type === 'sound' ? handleSoundPreview(e, item) : undefined}
                                        className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${item.type === 'sound'
                                            ? playingAudioId === item.id
                                                ? 'bg-[#c0a080] text-black cursor-pointer animate-pulse'
                                                : 'bg-[#252525] hover:bg-[#333] cursor-pointer'
                                            : 'bg-[#252525]'
                                            }`}
                                        disabled={item.type !== 'sound'}
                                    >
                                        {item.type === 'sound' && playingAudioId === item.id ? (
                                            <Pause className="w-5 h-5" />
                                        ) : (
                                            getItemIcon(item.type)
                                        )}
                                    </button>
                                )}

                                {/* INFO */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-medium text-gray-200 truncate group-hover:text-[#c0a080] transition-colors">
                                            {item.name}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>

            {/* FOOTER */}
            <div className="p-3 border-t border-[#333] bg-[#1a1a1a]">
                <div className="text-xs text-gray-500 text-center">
                    {unifiedItems.length} résultat{unifiedItems.length !== 1 ? 's' : ''} trouvé{unifiedItems.length !== 1 ? 's' : ''}
                </div>
            </div>
        </div>
    )
}
