"use client"

import React, { useState, useEffect } from 'react'
import { Users, GripVertical, Search, X, BookTemplate, Map as MapIcon, Plus, Book } from 'lucide-react'
import { collection, onSnapshot, query, getDocs, addDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type NPC } from '@/components/(personnages)/personnages'
import { NPCCreationForm } from './NPCCreationForm'
import { CreatureLibraryModal } from './CreatureLibraryModal'
import { type NewCharacter } from '@/app/[roomid]/map/types'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'

interface NPCTemplateDrawerProps {
    roomId: string
    isOpen: boolean
    onClose: () => void
    onDragStart: (template: NPC) => void
    currentCityId: string | null
}

interface ExistingNPC {
    id: string
    Nomperso: string
    imageURL2?: string
    niveau: number
    PV: number
    PV_Max: number
    Defense: number
    FOR: number
    DEX: number
    CON: number
    INT: number
    SAG: number
    CHA: number
    Contact: number
    Distance: number
    Magie: number
    INIT: number
    visibility: 'visible' | 'hidden' | 'ally'
    cityName?: string
    cityId?: string | null
}

export function NPCTemplateDrawer({ roomId, isOpen, onClose, onDragStart, currentCityId }: NPCTemplateDrawerProps) {
    const [activeTab, setActiveTab] = useState<'templates' | 'npcs'>('templates')
    const [templates, setTemplates] = useState<NPC[]>([])
    const [existingNPCs, setExistingNPCs] = useState<ExistingNPC[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(true)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [showLibraryModal, setShowLibraryModal] = useState(false)
    const [editingNpcId, setEditingNpcId] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [cities, setCities] = useState<{ id: string; name: string }[]>([])
    const [selectedCityFilter, setSelectedCityFilter] = useState<string>(currentCityId || 'all')

    // Update filter when current city changes
    useEffect(() => {
        setSelectedCityFilter(currentCityId || 'all')
    }, [currentCityId])

    // Default character for creation
    const defaultCharacter: NewCharacter = {
        name: '',
        niveau: 1,
        image: null,
        visibility: 'visible',
        PV: 20,
        PV_Max: 20,
        Defense: 10,
        Contact: 0,
        Distance: 0,
        Magie: 0,
        INIT: 10,
        INT: 10,
        CHA: 10,
        nombre: 1,
        FOR: 10,
        DEX: 10,
        CON: 10,
        SAG: 10
    }

    const [char, setChar] = useState<NewCharacter>(defaultCharacter)

    // Load NPC templates
    useEffect(() => {
        if (!roomId || !isOpen) return

        const templatesRef = collection(db, `npc_templates/${roomId}/templates`)
        const q = query(templatesRef)

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const templatesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as NPC[]
            setTemplates(templatesData)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [roomId, isOpen])

    // Load existing NPCs with real-time updates
    useEffect(() => {
        if (!roomId || !isOpen) return

        // First load cities for names
        const loadCityNames = async () => {
            const citiesRef = collection(db, 'cartes', roomId, 'cities')
            const citiesSnapshot = await getDocs(citiesRef)
            const cityNamesMap = new Map<string, string>()
            const citiesList: { id: string; name: string }[] = []
            citiesSnapshot.forEach(doc => {
                const cityName = doc.data().name || 'Ville inconnue'
                cityNamesMap.set(doc.id, cityName)
                citiesList.push({ id: doc.id, name: cityName })
            })
            setCities(citiesList)

            // Then listen to characters in real-time
            const charsRef = collection(db, 'cartes', roomId, 'characters')
            const unsubscribe = onSnapshot(charsRef, (snapshot) => {
                const npcs: ExistingNPC[] = []
                snapshot.forEach((doc) => {
                    const data = doc.data()
                    // Only PNJs (not players)
                    if (data.type !== 'joueurs') {
                        npcs.push({
                            id: doc.id,
                            Nomperso: data.Nomperso || 'Sans nom',
                            imageURL2: data.imageURL2 || data.imageURL,
                            niveau: data.niveau || 1,
                            PV: data.PV || 10,
                            PV_Max: data.PV_Max || 10,
                            Defense: data.Defense || 5,
                            FOR: data.FOR || 10,
                            DEX: data.DEX || 10,
                            CON: data.CON || 10,
                            INT: data.INT || 10,
                            SAG: data.SAG || 10,
                            CHA: data.CHA || 10,
                            Contact: data.Contact || 0,
                            Distance: data.Distance || 0,
                            Magie: data.Magie || 0,
                            INIT: data.INIT || 0,
                            visibility: data.visibility || 'hidden',
                            cityName: data.cityId ? cityNamesMap.get(data.cityId) : 'Aucune ville',
                            cityId: data.cityId || null
                        })
                    }
                })

                setExistingNPCs(npcs)
            })

            return unsubscribe
        }

        const unsubscribePromise = loadCityNames()

        return () => {
            unsubscribePromise.then(unsub => unsub?.())
        }
    }, [roomId, isOpen])

    // Generate random stats
    const generateStats = (diff: number) => {
        const base = diff * 3 + 5
        const rand = () => Math.floor(Math.random() * 6) + base

        setChar(prev => ({
            ...prev,
            niveau: diff,
            FOR: rand(),
            DEX: rand(),
            CON: rand(),
            INT: rand(),
            SAG: rand(),
            CHA: rand(),
            PV: base + diff * 3, // Formule réduite : ~5-35 PV
            PV_Max: base + diff * 3,
            Defense: 10 + Math.floor(base / 2),
            INIT: rand(),
            Contact: Math.floor(diff * 2),
            Distance: Math.floor(diff * 1.5),
            Magie: Math.floor(diff * 1.5),
            nombre: 1,
            visibility: 'visible'
        }))
    }

    // Handle Image Upload
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setChar(prev => ({ ...prev, image: { src: reader.result as string } }))
            }
            reader.readAsDataURL(file)
        }
    }

    // Handle number inputs
    const handleNumChange = (field: keyof NewCharacter, value: string) => {
        const num = parseInt(value) || 0
        setChar(prev => ({ ...prev, [field]: num }))
    }

    // Submit new or update existing NPC Template
    const handleSubmit = async () => {
        if (!char.name || !roomId) return

        setIsSubmitting(true)
        const storage = getStorage()
        const templatesRef = collection(db, 'npc_templates', roomId, 'templates')

        let imageURL = ''

        try {
            // Handle image upload
            const currentImg = typeof char.image === 'object' ? char.image?.src : char.image;
            if (currentImg) {
                if (currentImg.startsWith('data:')) {
                    const imageRef = ref(storage, `characters/${char.name}-${Date.now()}`)
                    const response = await fetch(currentImg)
                    const blob = await response.blob()
                    await uploadBytes(imageRef, blob)
                    imageURL = await getDownloadURL(imageRef)
                } else {
                    imageURL = currentImg
                }
            }

            const npcData = {
                Nomperso: char.name,
                ...(imageURL && { imageURL2: imageURL }),
                niveau: char.niveau,
                PV: char.PV,
                PV_F: char.PV,
                PV_Max: char.PV_Max || char.PV,
                Defense: char.Defense,
                Defense_F: char.Defense,
                Contact: char.Contact,
                Distance: char.Distance,
                Magie: char.Magie,
                INIT: char.INIT,
                FOR: char.FOR,
                DEX: char.DEX,
                CON: char.CON,
                SAG: char.SAG,
                INT: char.INT,
                CHA: char.CHA,
                Actions: char.Actions || []
            }

            if (editingNpcId) {
                // Update existing template
                await updateDoc(doc(db, 'npc_templates', roomId, 'templates', editingNpcId), npcData)
                setEditingNpcId(null)
            } else {
                // Create new template
                await addDoc(templatesRef, npcData)
            }

            // Reset form
            setChar(defaultCharacter)
            setShowCreateForm(false)

        } catch (error) {
            console.error("Error saving NPC:", error)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleImport = async (importedChar: NewCharacter) => {
        if (!roomId) return
        setIsSubmitting(true)
        try {
            const templatesRef = collection(db, 'npc_templates', roomId, 'templates')

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

            await addDoc(templatesRef, npcData)
            setShowLibraryModal(false)
        } catch (error) {
            console.error("Error importing NPC:", error)
        } finally {
            setIsSubmitting(false)
        }
    }

    // Filter items based on active tab
    const filteredItems = activeTab === 'templates'
        ? templates.filter(t => t.Nomperso.toLowerCase().includes(searchQuery.toLowerCase()))
        : existingNPCs
            .filter(n => {
                // Filter by search query
                const matchesSearch = n.Nomperso.toLowerCase().includes(searchQuery.toLowerCase())
                // Filter by city if a specific city is selected
                const matchesCity = selectedCityFilter === 'all' || n.cityId === selectedCityFilter
                return matchesSearch && matchesCity
            })

    const handleDragStart = (e: React.DragEvent, item: NPC | ExistingNPC) => {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('application/json', JSON.stringify(item))
        onDragStart(item as NPC)
    }

    if (!isOpen) return null

    // If showing create form, render it fullscreen
    if (showCreateForm) {
        return (
            <div className="fixed inset-0 bg-[#1a1a1a] z-50">
                <NPCCreationForm
                    char={char}
                    editingNpcId={editingNpcId}
                    difficulty={3}
                    isSubmitting={isSubmitting}
                    onCharChange={setChar}
                    onReset={() => setChar(defaultCharacter)}
                    onCancel={() => {
                        setShowCreateForm(false)
                        setEditingNpcId(null)
                        setChar(defaultCharacter)
                    }}
                    onSubmit={handleSubmit}
                    onImageUpload={handleImageUpload}
                    onNumChange={handleNumChange}
                    onGenerateStats={generateStats}
                />
            </div>
        )
    }

    return (
        <div className="fixed right-0 top-0 h-full w-80 bg-[#1a1a1a] border-l border-[#333] z-50 flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-4 bg-[#141414] border-b border-[#333] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#c0a080]/10 rounded-lg border border-[#c0a080]/20">
                        <Users className="w-5 h-5 text-[#c0a080]" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[#c0a080] tracking-tight">
                            Bibliothèque PNJ
                        </h2>
                        <p className="text-xs text-gray-500 font-medium">
                            Glissez sur la carte
                        </p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                >
                    <X className="w-4 h-4" />
                </Button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[#333] shrink-0">
                <button
                    onClick={() => setActiveTab('templates')}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'templates'
                        ? 'bg-[#222] text-[#c0a080] border-b-2 border-[#c0a080]'
                        : 'text-gray-400 hover:text-white hover:bg-[#1c1c1c]'
                        }`}
                >
                    <BookTemplate className="w-4 h-4" />
                    Templates ({templates.length})
                </button>
                <button
                    onClick={() => setActiveTab('npcs')}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'npcs'
                        ? 'bg-[#222] text-[#c0a080] border-b-2 border-[#c0a080]'
                        : 'text-gray-400 hover:text-white hover:bg-[#1c1c1c]'
                        }`}
                >
                    <MapIcon className="w-4 h-4" />
                    PNJ ({existingNPCs.length})
                </button>
            </div>

            {/* Search Bar with Add Button */}
            <div className="p-4 border-b border-[#333] shrink-0">
                {/* City filter for NPCs tab */}
                {activeTab === 'npcs' && cities.length > 0 && (
                    <div className="mb-3">
                        <Select
                            value={selectedCityFilter}
                            onValueChange={(val) => {
                                console.log('City filter changed to:', val)
                                setSelectedCityFilter(val)
                            }}
                        >
                            <SelectTrigger className="bg-[#252525] border-[#444] text-[#e0e0e0] focus:border-[#c0a080] h-9">
                                <SelectValue placeholder="Sélectionner une ville" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a1a1a] border-[#444]">
                                <SelectItem value="all" className="text-[#e0e0e0] focus:bg-[#c0a080]/20 focus:text-white">
                                    Toutes les villes
                                </SelectItem>
                                {cities.map((city) => (
                                    <SelectItem
                                        key={city.id}
                                        value={city.id}
                                        className="text-[#e0e0e0] focus:bg-[#c0a080]/20 focus:text-white"
                                    >
                                        {city.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            type="text"
                            placeholder={activeTab === 'templates' ? "Rechercher un template..." : "Rechercher un PNJ..."}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-[#252525] border-[#444] text-[#e0e0e0] placeholder-gray-500 focus:border-[#c0a080] h-9"
                        />
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowLibraryModal(true)}
                        className="h-9 w-9 p-0 text-[#c0a080] hover:text-white hover:bg-[#c0a080]/20 border border-[#c0a080]/30 hover:border-[#c0a080]/50 transition-all mr-2"
                        title="Ouvrir le grimoire"
                    >
                        <Book className="w-5 h-5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCreateForm(true)}
                        className="h-9 w-9 p-0 text-[#c0a080] hover:text-white hover:bg-[#c0a080]/20 border border-[#c0a080]/30 hover:border-[#c0a080]/50 transition-all"
                        title="Créer un nouveau template"
                    >
                        <Plus className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            {/* List */}
            <ScrollArea className="flex-1">
                {loading && activeTab === 'templates' ? (
                    <div className="flex items-center justify-center h-64">
                        <p className="text-gray-500">Chargement...</p>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                        <Users className="w-16 h-16 text-gray-600 mb-4" />
                        <h3 className="text-lg font-bold text-gray-400 mb-2">
                            {searchQuery ? 'Aucun résultat' : activeTab === 'templates' ? 'Aucun template' : 'Aucun PNJ'}
                        </h3>
                        <p className="text-sm text-gray-600">
                            {searchQuery
                                ? `Aucun ${activeTab === 'templates' ? 'template' : 'PNJ'} ne correspond à votre recherche`
                                : activeTab === 'templates'
                                    ? 'Créez des templates dans la bibliothèque de PNJ'
                                    : 'Aucun PNJ créé sur cette carte'
                            }
                        </p>
                    </div>
                ) : (
                    <div className="p-4 space-y-2">
                        {filteredItems.map((item) => (
                            <div
                                key={item.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, item)}
                                className="group bg-[#222] border border-[#333] rounded-lg p-3 cursor-move hover:border-[#c0a080]/50 hover:bg-[#252525] transition-all"
                            >
                                <div className="flex items-center gap-3">
                                    {/* Drag Handle */}
                                    <GripVertical className="w-4 h-4 text-gray-600 group-hover:text-[#c0a080] transition-colors" />

                                    {/* Token */}
                                    <div className="w-12 h-12 rounded-full border-2 border-[#c0a080] overflow-hidden flex-shrink-0 bg-[#1a1a1a]">
                                        {item.imageURL2 ? (
                                            <img
                                                src={item.imageURL2}
                                                alt={item.Nomperso}
                                                className="w-full h-full object-cover"
                                                draggable={false}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Users className="w-6 h-6 text-gray-600" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-white text-sm truncate">
                                            {item.Nomperso}
                                        </h3>
                                        <p className="text-xs text-[#c0a080]">
                                            Niveau {item.niveau}
                                        </p>
                                        {activeTab === 'npcs' && 'cityName' in item && (
                                            <p className="text-xs text-gray-500 truncate">
                                                📍 {(item as ExistingNPC).cityName}
                                            </p>
                                        )}
                                        <div className="flex gap-2 mt-1 text-xs text-gray-400">
                                            <span>PV: {item.PV_Max}</span>
                                            <span>•</span>
                                            <span>Def: {item.Defense}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>

            <CreatureLibraryModal
                isOpen={showLibraryModal}
                onClose={() => setShowLibraryModal(false)}
                onImport={handleImport}
            />
        </div>
    )
}
