"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Search, X, Volume2, Package, Users, Loader2, GripVertical, Pause, Eye } from 'lucide-react'
import { useGMTemplates, type SoundTemplate } from '@/contexts/GMTemplatesContext'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { type NPC } from '@/components/(personnages)/personnages'
import { type ObjectTemplate } from '@/app/[roomid]/map/types'
import { useDialogVisibility } from '@/contexts/DialogVisibilityContext'
import { SUGGESTED_SOUNDS } from '@/lib/suggested-sounds'
import { SUGGESTED_OBJECTS } from '@/lib/suggested-objects'
import { advancedSearch } from '@/lib/advanced-search'
import { ExpandableTabs } from '@/components/ui/expandable-tabs'
import { NPCTemplateDrawer } from './NPCTemplateDrawer'
import { ObjectDrawer } from './ObjectDrawer'
import { SoundDrawer } from './SoundDrawer'
import { VisibilityDrawer } from './VisibilityDrawer'
import type { VisibilityState } from '@/hooks/map/useVisibilityState'

interface BestiaryData {
    Nom: string
    Type: string
    description: string
    image?: string
    niveau: number
    PV: number
    PV_Max: number
    Defense: number
    Contact: number
    Distance: number
    Magie: number
    INIT: number
    FOR: number
    DEX: number
    CON: number
    INT: number
    SAG: number
    CHA: number
    Actions?: Array<{
        Nom: string
        Description: string
        Toucher: number
    }>
}

type UnifiedItem = {
    id: string
    name: string
    type: 'sound' | 'object' | 'npc'
    data: SoundTemplate | ObjectTemplate | NPC | any
    imageUrl?: string
    source: 'created' | 'library'
}

interface UnifiedSearchDrawerProps {
    roomId: string
    isOpen: boolean
    onClose: () => void
    onDragStart: (item: UnifiedItem) => void
    currentCityId: string | null
    vs?: VisibilityState
    onClearAllObstacles?: () => void
}

export function UnifiedSearchDrawer({ roomId, isOpen, onClose, onDragStart, currentCityId, vs, onClearAllObstacles }: UnifiedSearchDrawerProps) {
    const { setDialogOpen } = useDialogVisibility()
    const {
        soundTemplates: sounds,
        objectTemplates: objects,
        npcTemplates: npcs,
        loading,
    } = useGMTemplates()

    // Register dialog state
    useEffect(() => {
        setDialogOpen(isOpen)
    }, [isOpen, setDialogOpen])

    const [bestiary, setBestiary] = useState<Record<string, BestiaryData>>({})

    // UI states
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')
    const [selectedFilter, setSelectedFilter] = useState<'all' | 'sound' | 'object' | 'npc' | 'visibility'>('all')

    // Cleanup visibility tools when switching away from 'visibility' tab or closing the drawer
    const vsRef = useRef(vs)
    useEffect(() => { vsRef.current = vs })
    useEffect(() => {
        if (selectedFilter !== 'visibility' || !isOpen) {
            (window as any).__visibilityToolsActive = false
            if (vsRef.current) {
                vsRef.current.setCurrentVisibilityTool('none')
                vsRef.current.setIsLightPlacementMode(false)
            }
        }
    }, [selectedFilter, isOpen])

    // Audio preview state
    const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)

    // Load Bestiary
    useEffect(() => {
        if (!isOpen) return

        const loadBestiary = async () => {
            try {
                const response = await fetch('/tabs/bestiairy.json')
                const data: Record<string, BestiaryData> = await response.json()
                setBestiary(data)
            } catch (error) {
                console.error('Error loading bestiary:', error)
            }
        }

        loadBestiary()
    }, [isOpen])

    // Debounce search query for better performance
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery)
        }, 300)

        return () => clearTimeout(timer)
    }, [searchQuery])

    // Unify all items with advanced search
    const unifiedItems: UnifiedItem[] = useMemo(() => {
        if (selectedFilter !== 'all') return [] // Only calculate when we are on the 'all' tab

        const allItems: UnifiedItem[] = []

        // Add created sounds
        sounds.forEach(sound => {
            allItems.push({
                id: `created-sound-${sound.id}`,
                name: sound.name,
                type: 'sound',
                data: sound,
                source: 'created'
            })
        })

        // Add library sounds
        SUGGESTED_SOUNDS.forEach((sound, index) => {
            allItems.push({
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
        })

        // Add created objects
        objects.forEach(obj => {
            allItems.push({
                id: `created-obj-${obj.id}`,
                name: obj.name,
                type: 'object',
                data: obj,
                imageUrl: obj.imageUrl,
                source: 'created'
            })
        })

        // Add library objects
        SUGGESTED_OBJECTS.forEach((obj, index) => {
            allItems.push({
                id: `library-obj-${index}`,
                name: obj.name,
                type: 'object',
                data: {
                    id: `suggested-${obj.name}-${Date.now()}`,
                    name: obj.name,
                    imageUrl: obj.path,
                    category: obj.category
                },
                imageUrl: obj.path,
                source: 'library'
            })
        })

        // Add created NPCs
        npcs.forEach(npc => {
            allItems.push({
                id: `created-npc-${npc.id}`,
                name: npc.Nomperso,
                type: 'npc',
                data: npc,
                imageUrl: npc.imageURL2,
                source: 'created'
            })
        })

        // Add bestiary creatures as library NPCs
        Object.entries(bestiary).forEach(([key, creature]) => {
            allItems.push({
                id: `library-npc-${key}`,
                name: creature.Nom,
                type: 'npc',
                data: {
                    id: `bestiary-${key}`,
                    Nomperso: creature.Nom,
                    imageURL2: creature.image,
                    niveau: creature.niveau,
                    PV: creature.PV,
                    PV_Max: creature.PV_Max,
                    Defense: creature.Defense,
                    Contact: creature.Contact,
                    Distance: creature.Distance,
                    Magie: creature.Magie,
                    INIT: creature.INIT,
                    FOR: creature.FOR,
                    DEX: creature.DEX,
                    CON: creature.CON,
                    INT: creature.INT,
                    SAG: creature.SAG,
                    CHA: creature.CHA,
                    Actions: creature.Actions || []
                },
                imageUrl: creature.image,
                source: 'library'
            })
        })

        // If no search query, return all items
        if (!debouncedQuery.trim()) {
            return allItems
        }

        // Apply advanced search
        const searchResults = advancedSearch(allItems, debouncedQuery, {
            keys: ['name'],
            threshold: 0.4,
            useSemanticSearch: true,
            includeScore: true
        })

        // Return items sorted by relevance
        return searchResults.map(result => result.item)
    }, [sounds, objects, npcs, bestiary, debouncedQuery, selectedFilter])

    // Audio preview handler
    const handleSoundPreview = (e: React.MouseEvent, item: UnifiedItem) => {
        e.stopPropagation()

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

    // Cleanup audio on close or unmount
    useEffect(() => {
        if (!isOpen && audioElement) {
            audioElement.pause()
            setAudioElement(null)
            setPlayingAudioId(null)
        }
        return () => {
            if (audioElement) {
                audioElement.pause()
            }
        }
    }, [isOpen, audioElement])

    if (!isOpen) return null

    return (
        <div className="fixed right-0 top-0 h-full w-96 bg-[#1a1a1a] border-l border-[#333] z-[99999900] flex flex-col shadow-2xl">
            {/* HEADER */}
            <div className="relative px-6 py-5 border-b border-[#333] bg-gradient-to-br from-[#1a1a1a] via-[#1a1a1a] to-[#252525] shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c0a080] to-[#a08060] flex items-center justify-center shadow-lg shadow-[#c0a080]/20">
                            <Search className="w-5 h-5 text-black" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-tight">Recherche</h2>
                            <p className="text-xs text-gray-400">Bibliothèque Globale</p>
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

            {/* FILTER TABS */}
            <div className="py-4 border-b border-[#333] bg-[#1a1a1a] shrink-0 flex justify-center w-full">
                <ExpandableTabs
                    tabs={[
                        { title: 'Toutes', icon: Search },
                        { title: 'PNJs', icon: Users },
                        { title: 'Objets', icon: Package },
                        { title: 'Sons', icon: Volume2 },
                        { title: 'Vision', icon: Eye },
                    ]}
                    activeTab={['all', 'npc', 'object', 'sound', 'visibility'].indexOf(selectedFilter)}
                    onChange={(index) => {
                        if (index !== null) {
                            setSelectedFilter((['all', 'npc', 'object', 'sound', 'visibility'] as const)[index])
                        }
                    }}
                    className="bg-transparent border-none shadow-none gap-2 !p-0 min-w-[300px] justify-center"
                    activeColor="bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)]"
                />
            </div>

            {/* CONTENT AREA */}
            {selectedFilter === 'all' && (
                <div className="flex flex-col flex-1 min-h-0">
                    <div className="p-4 border-b border-[#333] bg-[#1a1a1a] shrink-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <Input
                                placeholder="Rechercher parmi tous les éléments..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-[#252525] border-[#404040] text-white placeholder-gray-500 focus:border-[#c0a080] focus:ring-1 focus:ring-[#c0a080]/20 h-9 rounded-lg"
                                autoFocus
                            />
                        </div>
                    </div>

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
                            <div className="p-4 grid grid-cols-2 gap-3">
                                {unifiedItems.map((item) => (
                                    <UnifiedDraggableCard
                                        key={`${item.type}-${item.id}`}
                                        item={item}
                                        onDragStart={handleDragStart}
                                        handleSoundPreview={handleSoundPreview}
                                        playingAudioId={playingAudioId}
                                        getItemIcon={getItemIcon}
                                    />
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                    <div className="p-3 border-t border-[#333] bg-[#1a1a1a] shrink-0">
                        <div className="text-xs text-gray-500 text-center">
                            {`${unifiedItems.length} résultat${unifiedItems.length !== 1 ? 's' : ''}`}
                        </div>
                    </div>
                </div>
            )}

            {selectedFilter === 'npc' && (
                <div className="flex-1 min-h-0 relative">
                    <NPCTemplateDrawer
                        roomId={roomId}
                        isOpen={true}
                        onClose={onClose}
                        onDragStart={onDragStart as any}
                        currentCityId={currentCityId}
                        isEmbedded={true}
                    />
                </div>
            )}

            {selectedFilter === 'object' && (
                <div className="flex-1 min-h-0 relative">
                    <ObjectDrawer
                        roomId={roomId}
                        isOpen={true}
                        onClose={onClose}
                        onDragStart={onDragStart as any}
                        currentCityId={currentCityId}
                        isEmbedded={true}
                    />
                </div>
            )}

            {selectedFilter === 'sound' && (
                <div className="flex-1 min-h-0 relative">
                    <SoundDrawer
                        roomId={roomId}
                        isOpen={true}
                        onClose={onClose}
                        onDragStart={onDragStart as any}
                        currentCityId={currentCityId}
                        isEmbedded={true}
                    />
                </div>
            )}

            {selectedFilter === 'visibility' && vs && (
                <div className="flex-1 min-h-0 relative bg-[#1a1a1a]">
                    <VisibilityDrawer
                        isOpen={true}
                        onClose={onClose}
                        vs={vs}
                        isEmbedded={true}
                        onClearAllObstacles={onClearAllObstacles}
                    />
                </div>
            )}
        </div>
    )
}

function UnifiedDraggableCard({ item, onDragStart, handleSoundPreview, playingAudioId, getItemIcon }: {
    item: UnifiedItem,
    onDragStart: (e: React.DragEvent, item: UnifiedItem) => void,
    handleSoundPreview?: (e: React.MouseEvent, item: UnifiedItem) => void,
    playingAudioId?: string | null,
    getItemIcon: (type: UnifiedItem['type']) => React.ReactNode
}) {
    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, item)}
            className="group bg-[#1e1e1e] border border-[#333] rounded-lg p-3 cursor-move hover:border-[#c0a080]/50 hover:bg-[#252525] transition-all flex items-center gap-3"
        >
            <GripVertical className="w-4 h-4 text-gray-600 group-hover:text-[#c0a080] transition-colors flex-shrink-0" />

            {item.imageUrl ? (
                <div className="h-12 w-auto max-w-[80px] rounded-lg overflow-hidden flex-shrink-0 bg-[#1a1a1a] border border-[#2a2a2a]">
                    <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-contain"
                        draggable={false}
                    />
                </div>
            ) : (
                <button
                    onClick={(e) => (item.type === 'sound' && handleSoundPreview) ? handleSoundPreview(e, item) : undefined}
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

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-200 truncate group-hover:text-[#c0a080] transition-colors">
                        {item.name}
                    </span>
                </div>
            </div>
        </div>
    )
}
