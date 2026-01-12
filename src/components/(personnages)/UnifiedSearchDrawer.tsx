"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { Search, X, Volume2, Package, Users, Loader2, GripVertical, Play, Pause, Folder, ChevronRight, ArrowLeft, Plus, Music, FileAudio } from 'lucide-react'
import { collection, onSnapshot, query, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { type NPC } from '@/components/(personnages)/personnages'
import { type ObjectTemplate } from '@/app/[roomid]/map/types'
import { useDialogVisibility } from '@/contexts/DialogVisibilityContext'
import { SUGGESTED_SOUNDS } from '@/lib/suggested-sounds'
import { SUGGESTED_OBJECTS, ITEM_CATEGORIES, SuggestedItem } from '@/lib/suggested-objects'
import { advancedSearch, type SearchResult } from '@/lib/advanced-search'
import { CreatureLibraryModal } from './CreatureLibraryModal'
import { type NewCharacter } from '@/app/[roomid]/map/types'

interface SoundTemplate {
    id: string
    name: string
    soundUrl: string
    type: 'file' | 'youtube'
}

interface BestiaryData {
    Nom: string
    Category?: string
    Type: string
    description: string
    image?: string
    niveau: number
    Challenge?: string
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
    const [bestiary, setBestiary] = useState<Record<string, BestiaryData>>({})

    // UI states
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')
    const [selectedFilter, setSelectedFilter] = useState<'all' | 'sound' | 'object' | 'npc'>('all')
    const [loading, setLoading] = useState(true)

    // Object Navigation State
    const [currentObjectCategory, setCurrentObjectCategory] = useState<string | null>(null)

    // Audio preview state
    const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
    const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)

    // Creation states
    const [showCreateMenu, setShowCreateMenu] = useState(false)
    const [creationType, setCreationType] = useState<'sound' | 'music' | 'object' | 'npc' | null>(null)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Sound/Music creation states
    const [newSoundName, setNewSoundName] = useState('')
    const [newSoundFile, setNewSoundFile] = useState<{ file: File, name: string } | null>(null)
    const [youtubeInput, setYoutubeInput] = useState('')
    const [soundCreationType, setSoundCreationType] = useState<'file' | 'youtube'>('file')

    // Object creation states
    const [newObjectName, setNewObjectName] = useState('')
    const [newObjectImage, setNewObjectImage] = useState<string | null>(null)

    // NPC creation states
    const [showNPCLibrary, setShowNPCLibrary] = useState(false)

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
        }, 300) // 300ms debounce

        return () => clearTimeout(timer)
    }, [searchQuery])

    // Unify all items with advanced search and filter
    const unifiedItems: UnifiedItem[] = useMemo(() => {
        const allItems: UnifiedItem[] = []

        // Collect all items based on filter
        if (selectedFilter === 'all' || selectedFilter === 'sound') {
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
        }

        if (selectedFilter === 'all' || selectedFilter === 'object') {
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
                        id: `suggested-${obj.name}-${Date.now()}`, // Create temp template
                        name: obj.name,
                        imageUrl: obj.path,
                        category: obj.category
                    },
                    imageUrl: obj.path,
                    source: 'library'
                })
            })
        }

        if (selectedFilter === 'all' || selectedFilter === 'npc') {
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
        }

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

    // Get Objects for Category View
    const getCategoryObjects = (categoryId: string): UnifiedItem[] => {
        return SUGGESTED_OBJECTS
            .filter(item => item.category === categoryId)
            .map((item, index) => ({
                id: `library-obj-${categoryId}-${index}`,
                name: item.name,
                type: 'object',
                data: {
                    id: `suggested-${item.name}-${Date.now()}`,
                    name: item.name,
                    imageUrl: item.path,
                    category: item.category
                },
                imageUrl: item.path,
                source: 'library'
            }))
    }

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

    // Helper to extract YouTube video ID
    const extractVideoId = (url: string): string | null => {
        const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/, /^([a-zA-Z0-9_-]{11})$/]
        for (const pattern of patterns) {
            const match = url.match(pattern)
            if (match && match[1]) return match[1]
        }
        return null
    }

    // Creation Handlers
    const handleCreateClick = (type: 'sound' | 'music' | 'object' | 'npc') => {
        setCreationType(type)
        setShowCreateMenu(false)

        if (type === 'npc') {
            setShowNPCLibrary(true)
        } else {
            setShowCreateForm(true)
        }
    }

    const handleSoundCreate = async () => {
        if (!newSoundName) return
        if (soundCreationType === 'file' && !newSoundFile) return
        if (soundCreationType === 'youtube' && !extractVideoId(youtubeInput)) return

        setIsSubmitting(true)
        try {
            let soundUrl = ''
            if (soundCreationType === 'file' && newSoundFile) {
                const storageRef = ref(getStorage(), `sounds/${roomId}/${Date.now()}_${newSoundFile.name}`)
                const snapshot = await uploadBytes(storageRef, newSoundFile.file)
                soundUrl = await getDownloadURL(snapshot.ref)
            } else {
                soundUrl = extractVideoId(youtubeInput)!
            }

            await addDoc(collection(db, `sound_templates/${roomId}/templates`), {
                name: newSoundName,
                soundUrl,
                type: soundCreationType,
                category: creationType === 'music' ? 'music' : 'sound',
                createdAt: new Date()
            })

            // Reset form
            setNewSoundName('')
            setNewSoundFile(null)
            setYoutubeInput('')
            setShowCreateForm(false)
            setCreationType(null)
        } catch (e) {
            console.error('Error creating sound:', e)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleObjectCreate = async () => {
        if (!newObjectName) return

        setIsSubmitting(true)
        try {
            let imageUrl = ''
            if (newObjectImage) {
                const storageRef = ref(getStorage(), `objects/${roomId}/${Date.now()}_${newObjectName}`)
                const response = await fetch(newObjectImage)
                const blob = await response.blob()
                await uploadBytes(storageRef, blob)
                imageUrl = await getDownloadURL(storageRef)
            }

            await addDoc(collection(db, `object_templates/${roomId}/templates`), {
                name: newObjectName,
                imageUrl,
                createdAt: new Date()
            })

            // Reset form
            setNewObjectName('')
            setNewObjectImage(null)
            setShowCreateForm(false)
            setCreationType(null)
        } catch (e) {
            console.error('Error creating object:', e)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleObjectImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setNewObjectImage(reader.result as string)
            }
            reader.readAsDataURL(file)
        }
    }

    const handleNPCImport = async (importedChar: NewCharacter) => {
        if (!roomId) return
        setIsSubmitting(true)
        try {
            // Image handling (upload if Base64/DataURL)
            let imageURL = (typeof importedChar.image === 'object' ? importedChar.image?.src : importedChar.image) || ''
            if (imageURL.startsWith('data:')) {
                const storage = getStorage()
                const imageRef = ref(storage, `characters/${importedChar.name}-${Date.now()}`)
                const response = await fetch(imageURL)
                const blob = await response.blob()
                await uploadBytes(imageRef, blob)
                imageURL = await getDownloadURL(imageRef)
            }

            const npcData = {
                Nomperso: importedChar.name,
                imageURL2: imageURL,
                niveau: importedChar.niveau,
                PV: importedChar.PV,
                PV_F: importedChar.PV,
                PV_Max: importedChar.PV_Max,
                Defense: importedChar.Defense,
                Defense_F: importedChar.Defense,
                Contact: importedChar.Contact,
                Distance: importedChar.Distance,
                Magie: importedChar.Magie,
                INIT: importedChar.INIT,
                FOR: importedChar.FOR,
                DEX: importedChar.DEX,
                CON: importedChar.CON,
                SAG: importedChar.SAG,
                INT: importedChar.INT,
                CHA: importedChar.CHA,
                Actions: importedChar.Actions || []
            }

            await addDoc(collection(db, `npc_templates/${roomId}/templates`), npcData)
            setShowNPCLibrary(false)
        } catch (error) {
            console.error('Error importing NPC:', error)
        } finally {
            setIsSubmitting(false)
        }
    }

    // Determine render mode
    const isObjectLibraryMode = selectedFilter === 'object' && !searchQuery;

    if (!isOpen) return null

    return (
        <>
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

                {/* SEARCH BAR & FILTERS */}
                <div className="p-4 border-b border-[#333] bg-[#1a1a1a] space-y-3">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <Input
                                placeholder="Rechercher parmi tous les éléments..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-[#252525] border-[#404040] text-white placeholder-gray-500 focus:border-[#c0a080] focus:ring-1 focus:ring-[#c0a080]/20 h-9 rounded-lg"
                                autoFocus
                            />
                        </div>

                        {/* Add Button with Dropdown */}
                        <div className="relative">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowCreateMenu(!showCreateMenu)}
                                className="h-9 px-3 rounded-lg text-[#c0a080] hover:text-white hover:bg-[#c0a080]/20 border border-[#c0a080]/30 hover:border-[#c0a080]/50 transition-all"
                                title="Créer un nouvel élément"
                            >
                                <Plus className="w-4 h-4" />
                            </Button>

                            {/* Dropdown Menu */}
                            {showCreateMenu && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-[#1e1e1e] border border-[#333] rounded-lg shadow-2xl z-50 overflow-hidden">
                                    <button
                                        onClick={() => handleCreateClick('sound')}
                                        className="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-[#252525] hover:text-[#c0a080] transition-colors flex items-center gap-3"
                                    >
                                        <Volume2 className="w-4 h-4" />
                                        Effet Musical
                                    </button>
                                    <button
                                        onClick={() => handleCreateClick('music')}
                                        className="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-[#252525] hover:text-[#c0a080] transition-colors flex items-center gap-3"
                                    >
                                        <Music className="w-4 h-4" />
                                        Musique
                                    </button>
                                    <button
                                        onClick={() => handleCreateClick('object')}
                                        className="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-[#252525] hover:text-[#80c0a0] transition-colors flex items-center gap-3"
                                    >
                                        <Package className="w-4 h-4" />
                                        Objet
                                    </button>
                                    <button
                                        onClick={() => handleCreateClick('npc')}
                                        className="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-[#252525] hover:text-[#c0a080] transition-colors flex items-center gap-3"
                                    >
                                        <Users className="w-4 h-4" />
                                        PNJ
                                    </button>
                                </div>
                            )}
                        </div>
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
                            onClick={() => {
                                setSelectedFilter('object')
                                setCurrentObjectCategory(null) // Reset navigation when switching tab
                            }}
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

                    {/* OBJECT BREADCRUMBS */}
                    {isObjectLibraryMode && (
                        <div className="flex items-center gap-1 text-sm text-gray-400 overflow-x-auto no-scrollbar whitespace-nowrap pt-2 border-t border-[#333]">
                            <button
                                onClick={() => setCurrentObjectCategory(null)}
                                className={`flex items-center hover:text-white transition-colors ${!currentObjectCategory ? 'text-white font-medium' : ''}`}
                            >
                                {currentObjectCategory && <ArrowLeft className="w-3 h-3 mr-1" />}
                                Accueil
                            </button>

                            {currentObjectCategory && (
                                <>
                                    <ChevronRight className="w-3 h-3 text-gray-600" />
                                    <span className="text-[#80c0a0] font-medium">
                                        {ITEM_CATEGORIES.find(c => c.id === currentObjectCategory)?.label || currentObjectCategory}
                                    </span>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* CREATION FORMS */}
                {showCreateForm && (creationType === 'sound' || creationType === 'music') && (
                    <div className="p-4 bg-[#1e1e1e] border-b border-[#333] space-y-3 animate-in slide-in-from-top-2">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-white text-sm">
                                {creationType === 'music' ? 'Ajouter une musique' : 'Ajouter un effet sonore'}
                            </span>
                            <X className="w-4 h-4 cursor-pointer text-gray-400 hover:text-white" onClick={() => {
                                setShowCreateForm(false)
                                setCreationType(null)
                                setNewSoundName('')
                                setNewSoundFile(null)
                                setYoutubeInput('')
                            }} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 bg-[#252525] p-1 rounded-md">
                            <button
                                onClick={() => setSoundCreationType('file')}
                                className={`text-xs py-1 rounded transition ${soundCreationType === 'file' ? 'bg-[#333] text-white' : 'text-gray-500'}`}
                            >
                                Fichier
                            </button>
                            <button
                                onClick={() => setSoundCreationType('youtube')}
                                className={`text-xs py-1 rounded transition ${soundCreationType === 'youtube' ? 'bg-[#991b1b] text-white' : 'text-gray-500'}`}
                            >
                                YouTube
                            </button>
                        </div>
                        <Input
                            placeholder="Nom du son"
                            value={newSoundName}
                            onChange={e => setNewSoundName(e.target.value)}
                            className="h-8 bg-[#252525] border-[#404040] text-white"
                        />
                        {soundCreationType === 'file' ? (
                            <Input
                                type="file"
                                accept="audio/*"
                                className="text-xs text-gray-400 file:text-white file:bg-[#333] file:border-0 file:rounded-sm h-9"
                                onChange={e => {
                                    const f = e.target.files?.[0]
                                    if (f) {
                                        setNewSoundFile({ file: f, name: f.name.split('.')[0] })
                                        if (!newSoundName) setNewSoundName(f.name.split('.')[0])
                                    }
                                }}
                            />
                        ) : (
                            <Input
                                placeholder="URL YouTube"
                                value={youtubeInput}
                                onChange={e => setYoutubeInput(e.target.value)}
                                className="h-8 bg-[#252525] border-[#404040] text-white"
                            />
                        )}
                        <Button
                            onClick={handleSoundCreate}
                            disabled={isSubmitting}
                            size="sm"
                            className="w-full bg-[#c0a080] text-black hover:bg-[#d4b494]"
                        >
                            {isSubmitting ? 'Ajout...' : 'Ajouter'}
                        </Button>
                    </div>
                )}

                {showCreateForm && creationType === 'object' && (
                    <div className="p-4 bg-[#1e1e1e] border-b border-[#333] space-y-3 animate-in slide-in-from-top-2">
                        <div className="flex justify-between items-center">
                            <span className="font-semibold text-white text-sm">Ajouter un objet</span>
                            <X className="w-4 h-4 cursor-pointer text-gray-400 hover:text-white" onClick={() => {
                                setShowCreateForm(false)
                                setCreationType(null)
                                setNewObjectName('')
                                setNewObjectImage(null)
                            }} />
                        </div>
                        <Input
                            placeholder="Nom de l'objet"
                            value={newObjectName}
                            onChange={e => setNewObjectName(e.target.value)}
                            className="h-8 bg-[#252525] border-[#404040] text-white"
                        />
                        <div>
                            <Input
                                type="file"
                                accept="image/*"
                                className="text-xs text-gray-400 file:text-white file:bg-[#333] file:border-0 file:rounded-sm h-9"
                                onChange={handleObjectImageUpload}
                            />
                            {newObjectImage && (
                                <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden border border-[#333]">
                                    <img src={newObjectImage} alt="Preview" className="w-full h-full object-cover" />
                                </div>
                            )}
                        </div>
                        <Button
                            onClick={handleObjectCreate}
                            disabled={isSubmitting}
                            size="sm"
                            className="w-full bg-[#80c0a0] text-black hover:bg-[#90d0b0]"
                        >
                            {isSubmitting ? 'Ajout...' : 'Ajouter'}
                        </Button>
                    </div>
                )}

                {/* RESULTS */}
                <ScrollArea className="flex-1 bg-[#121212]">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
                        </div>
                    ) : isObjectLibraryMode ? (
                        // OBJECT LIBRARY MODE
                        <div className="p-4">
                            {currentObjectCategory ? (
                                // CATEGORY ITEMS
                                <div className="grid grid-cols-2 gap-3">
                                    {getCategoryObjects(currentObjectCategory).map((item) => (
                                        <UnifiedDraggableCard
                                            key={item.id}
                                            item={item}
                                            onDragStart={handleDragStart}
                                            getItemIcon={getItemIcon}
                                        />
                                    ))}
                                    {getCategoryObjects(currentObjectCategory).length === 0 && (
                                        <div className="col-span-2 text-center py-10 text-gray-500 text-sm">
                                            Aucun objet dans cette catégorie
                                        </div>
                                    )}
                                </div>
                            ) : (
                                // CATEGORY LIST
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Default Categories */}
                                    {ITEM_CATEGORIES.filter(c => c.id !== 'all').map((cat) => (
                                        <button
                                            key={cat.id}
                                            onClick={() => setCurrentObjectCategory(cat.id)}
                                            className="group flex flex-col items-center justify-center p-4 rounded-xl bg-[#1e1e1e] border border-[#333] hover:border-[#80c0a0] hover:bg-[#252525] transition-all"
                                        >
                                            <div className="w-12 h-12 rounded-full bg-[#2a2a2a] flex items-center justify-center mb-3 group-hover:bg-[#80c0a0]/10 transition-colors">
                                                <Folder className="w-6 h-6 text-gray-400 group-hover:text-[#80c0a0] transition-colors" />
                                            </div>
                                            <span className="text-sm font-medium text-gray-300 group-hover:text-white">
                                                {cat.label}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : unifiedItems.length === 0 ? (
                        // NO RESULTS
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
                        // LIST MODE (Search or other tabs)
                        <div className="p-4 space-y-2">
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

                {/* FOOTER */}
                <div className="p-3 border-t border-[#333] bg-[#1a1a1a]">
                    <div className="text-xs text-gray-500 text-center">
                        {isObjectLibraryMode
                            ? (currentObjectCategory ? `${getCategoryObjects(currentObjectCategory).length} objets` : `${ITEM_CATEGORIES.length} catégories`)
                            : `${unifiedItems.length} résultat${unifiedItems.length !== 1 ? 's' : ''}`
                        }
                    </div>
                </div>
            </div>

            {/* NPC LIBRARY MODAL */}
            <CreatureLibraryModal
                isOpen={showNPCLibrary}
                onClose={() => setShowNPCLibrary(false)}
                onImport={handleNPCImport}
            />
        </>
    )
}

// Sub-component for individual item card
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
            {/* DRAG HANDLE */}
            <GripVertical className="w-4 h-4 text-gray-600 group-hover:text-[#c0a080] transition-colors flex-shrink-0" />

            {/* IMAGE/ICON */}
            {item.imageUrl ? (
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[#1a1a1a] border border-[#2a2a2a]">
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

            {/* INFO */}
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
