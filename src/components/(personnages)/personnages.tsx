"use client"

import React, { useState, useEffect, useMemo } from 'react'
import {
    Users, Shield, Heart, Zap, UserPlus, Plus,
    Dices, Image as ImageIcon, User, Check, X, RotateCcw, Trash2, Edit,
    AlertTriangle, Search, BookOpen, Swords, Dna, Pencil, ScanFace
} from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

import { type NewCharacter } from '@/app/[roomid]/map/types'
import { useParams } from 'next/navigation'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { collection, addDoc, onSnapshot, query, where, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { NPCGrid } from './NPCListView'
import { CreatureLibraryModal } from './CreatureLibraryModal'
import { CategoryManager } from './CategoryManager'
import { cn } from '@/lib/utils'

interface NPCManagerProps {
    isOpen?: boolean
    onClose?: () => void
    onSubmit?: (character: NewCharacter) => void
    difficulty?: number
}

export interface Category {
    id: string
    name: string
    color?: string
    icon?: string
}

// Update NPC interface to include imageURL
export interface NPC {
    id: string
    Nomperso: string
    categoryId?: string
    imageURL?: string // Base image
    imageURL2?: string // Token/Composite
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

    // Actions are sometimes flexible in Firestore, defining type
    Actions?: Array<{
        Nom: string;
        Description: string;
        Toucher: number;
    }>;
}

export function NPCManager({ isOpen, onClose, onSubmit, difficulty = 3 }: NPCManagerProps) {
    const params = useParams()
    const roomId = params?.roomid as string

    // Data State
    const [npcs, setNpcs] = useState<NPC[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)

    // View State
    const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'view' | 'edit' | 'create'>('view')
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

    // Modals
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false)
    const [showLibraryModal, setShowLibraryModal] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Form State (for creation/edit)
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

    // Fetch Data
    useEffect(() => {
        if (!roomId) return
        const templatesRef = collection(db, 'npc_templates', roomId, 'templates')
        const unsubscribe = onSnapshot(templatesRef, (snapshot) => {
            const npcList: NPC[] = []
            snapshot.forEach((doc) => {
                npcList.push({ id: doc.id, ...doc.data() } as NPC)
            })
            setNpcs(npcList)
            setLoading(false)
        })
        return () => unsubscribe()
    }, [roomId])

    useEffect(() => {
        if (!roomId) return
        const categoriesRef = collection(db, 'npc_templates', roomId, 'categories')
        const unsubscribe = onSnapshot(categoriesRef, (snapshot) => {
            const categoryList: Category[] = []
            snapshot.forEach((doc) => {
                categoryList.push({ id: doc.id, ...doc.data() } as Category)
            })
            setCategories(categoryList)
        })
        return () => unsubscribe()
    }, [roomId])

    // Handlers
    const handleCreateNew = () => {
        setChar(defaultCharacter)
        generateStats(difficulty) // Pre-fill with difficulty
        setSelectedNpcId(null)
        setViewMode('create')
    }

    const handleEdit = (npc: NPC) => {
        setChar({
            name: npc.Nomperso,
            niveau: npc.niveau,
            image: npc.imageURL2 ? { src: npc.imageURL2 } : null,
            visibility: 'visible',
            PV: npc.PV,
            PV_Max: npc.PV_Max || npc.PV,
            Defense: npc.Defense,
            Contact: npc.Contact,
            Distance: npc.Distance,
            Magie: npc.Magie,
            INIT: npc.INIT,
            INT: npc.INT || 10,
            CHA: npc.CHA || 10,
            nombre: 1,
            FOR: npc.FOR || 10,
            DEX: npc.DEX || 10,
            CON: npc.CON || 10,
            SAG: npc.SAG || 10,
            // Preserve other fields if needed
        })
        setSelectedCategoryId(npc.categoryId || null) // Set category to form context if needed
        setSelectedNpcId(npc.id)
        setViewMode('edit')
    }

    const handleSelectNPC = (npc: NPC) => {
        if (viewMode === 'edit' || viewMode === 'create') {
            // Confirm discard? For now just switch.
        }
        setSelectedNpcId(npc.id)
        setViewMode('view')
    }

    const generateStats = (diff: number) => {
        const base = diff * 3 + 5
        const rand = () => Math.floor(Math.random() * 6) + base
        setChar(prev => ({
            ...prev,
            niveau: diff,
            FOR: rand(), DEX: rand(), CON: rand(), INT: rand(), SAG: rand(), CHA: rand(),
            PV: base + diff * 3,
            PV_Max: base + diff * 3,
            Defense: 10 + Math.floor(base / 2),
            INIT: rand(),
            Contact: Math.floor(diff * 2),
            Distance: Math.floor(diff * 1.5),
            Magie: Math.floor(diff * 1.5),
        }))
    }

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

    const handleNumChange = (field: keyof NewCharacter, value: string) => {
        const num = parseInt(value) || 0
        setChar(prev => ({ ...prev, [field]: num }))
    }

    const handleSubmit = async () => {
        if (!char.name || !roomId) return
        setIsSubmitting(true)

        try {
            const storage = getStorage()
            const templatesRef = collection(db, 'npc_templates', roomId, 'templates')
            let imageURL = ''

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

            const npcData: any = {
                Nomperso: char.name,
                ...(imageURL && { imageURL2: imageURL }),
                ...(selectedCategoryId && selectedCategoryId !== 'none' && { categoryId: selectedCategoryId }),
                niveau: char.niveau,
                PV: char.PV, PV_F: char.PV, PV_Max: char.PV_Max || char.PV,
                Defense: char.Defense, Defense_F: char.Defense,
                Contact: char.Contact, Distance: char.Distance, Magie: char.Magie,
                INIT: char.INIT,
                FOR: char.FOR, DEX: char.DEX, CON: char.CON, SAG: char.SAG, INT: char.INT, CHA: char.CHA,
            }

            if (viewMode === 'edit' && selectedNpcId) {
                await updateDoc(doc(db, 'npc_templates', roomId, 'templates', selectedNpcId), npcData)
            } else {
                await addDoc(templatesRef, npcData)
            }

            // Reset
            setChar(defaultCharacter)
            setViewMode('view')
            setIsSubmitting(false)
            // Ideally select the newly created NPC, but for now just go back to view
            if (viewMode === 'create' && onSubmit) {
                // Should we invoke immediately? Maybe not if managing library.
            }

        } catch (error) {
            console.error("Error saving NPC:", error)
            setIsSubmitting(false)
        }
    }

    const handleImport = async (importedChar: NewCharacter) => {
        if (!roomId) return
        setIsSubmitting(true)
        try {
            const templatesRef = collection(db, 'npc_templates', roomId, 'templates')
            const storage = getStorage()

            // 1. Handle Final Image (Token) -> imageURL2
            let tokenURL = (typeof importedChar.image === 'object' ? importedChar.image?.src : importedChar.image) || ''
            if (tokenURL.startsWith('data:')) {
                const imageRef = ref(storage, `characters/token_${importedChar.name}-${Date.now()}`)
                const response = await fetch(tokenURL)
                const blob = await response.blob()
                await uploadBytes(imageRef, blob)
                tokenURL = await getDownloadURL(imageRef)
            }

            // 2. Handle Base Image -> imageURL
            let baseURL = importedChar.imageURL || ''
            if (baseURL.startsWith('data:')) {
                const imageRef = ref(storage, `characters/base_${importedChar.name}-${Date.now()}`)
                const response = await fetch(baseURL)
                const blob = await response.blob()
                await uploadBytes(imageRef, blob)
                baseURL = await getDownloadURL(imageRef)
            }

            const npcData = {
                Nomperso: importedChar.name,
                imageURL: baseURL,
                imageURL2: tokenURL,
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

    const confirmDelete = async () => {
        if (!deleteConfirmId || !roomId) return
        try {
            await deleteDoc(doc(db, 'npc_templates', roomId, 'templates', deleteConfirmId))
            setDeleteConfirmId(null)
            if (selectedNpcId === deleteConfirmId) {
                setSelectedNpcId(null)
                setViewMode('view')
            }
        } catch (error) {
            console.error("Error deleting NPC template:", error)
        }
    }

    // derived
    const selectedNPC = useMemo(() => npcs.find(n => n.id === selectedNpcId), [npcs, selectedNpcId])

    const Content = (
        <div className="flex h-full bg-[#09090b] text-[#e0e0e0] overflow-hidden rounded-2xl border border-[#2a2a2a] shadow-2xl relative">

            {/* --- LEFT PANEL: BROWSER (65%) --- */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#0c0c0e]">
                {/* Header */}
                <div className="p-6 border-b border-[#2a2a2a] bg-[#121214] flex flex-wrap justify-between items-center gap-4 lg:gap-6">
                    <div>
                        <h1 className="text-lg font-serif font-bold text-[#e4e4e7] tracking-tight">Bibliothèque du Grimoire</h1>
                    </div>

                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px] max-w-sm group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-[#c0a080] transition-colors" />
                        <input
                            type="text"
                            placeholder="Rechercher..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#18181b] border border-[#27272a] rounded-full py-2 pl-10 pr-4 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#c0a080] focus:ring-1 focus:ring-[#c0a080]/50 transition-all text-sm"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowLibraryModal(true)}
                            className="text-[#c0a080] hover:text-white hover:bg-[#c0a080]/20 border border-[#c0a080]/30 hover:border-[#c0a080]/50 transition-all h-9 w-9"
                            title="Ouvrir le grimoire de monstres"
                        >
                            <BookOpen className="w-5 h-5" />
                        </Button>

                        <Button onClick={handleCreateNew} className="bg-[#c0a080] text-black font-bold hover:bg-[#b09070] h-9 px-4 text-xs uppercase tracking-wide">
                            <Plus className="w-3 h-3 mr-2" />
                            Nouveau
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <div className="px-6 py-3 border-b border-[#2a2a2a] bg-[#0f0f11] flex flex-wrap items-center gap-2">
                    {/* ... filters ... */}
                    <button
                        onClick={() => setSelectedCategoryId(null)}
                        className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                            selectedCategoryId === null
                                ? "bg-[#c0a080] text-black shadow-lg"
                                : "bg-[#18181b] border border-[#27272a] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        Tout afficher
                    </button>
                    <div className="w-px h-6 bg-[#27272a] mx-1" />
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategoryId(cat.id)}
                            className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-2",
                                selectedCategoryId === cat.id
                                    ? "bg-[#c0a080] text-black shadow-lg"
                                    : "bg-[#18181b] border border-[#27272a] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            {cat.color && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />}
                            {cat.name}
                        </button>
                    ))}
                    <button
                        onClick={() => setSelectedCategoryId('none')}
                        className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                            selectedCategoryId === 'none'
                                ? "bg-[#c0a080] text-black shadow-lg"
                                : "bg-[#18181b] border border-[#27272a] text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        Sans catégorie
                    </button>

                    <div className="flex-1 min-w-[20px]" />
                    <Button
                        onClick={() => setIsCategoryManagerOpen(true)}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-zinc-500 hover:text-[#c0a080] ml-auto"
                        title="Gérer les catégories"
                    >
                        <Edit className="w-4 h-4" />
                    </Button>
                </div>

                {/* Grid Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-[url('/grid-pattern.svg')] bg-repeat opacity-90 p-6">
                    <NPCGrid
                        npcs={npcs}
                        categories={categories}
                        loading={loading}
                        selectedNpcId={selectedNpcId}
                        onSelect={handleSelectNPC}
                        searchQuery={searchQuery}
                        selectedCategoryId={selectedCategoryId}
                    />
                </div>
            </div>

            {/* --- RIGHT PANEL: INSPECTOR (35%) --- */}
            <div className="w-[400px] border-l border-[#2a2a2a] bg-[#121212] flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-10 relative">
                {/* Close Button within panel */}
                {onClose && (
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-50 p-2 bg-black/40 text-white/70 hover:text-white rounded-full hover:bg-black/80 backdrop-blur-sm border border-white/5 transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}

                {(viewMode === 'create' || viewMode === 'edit' || selectedNPC) ? (
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <InspectorView
                            mode={viewMode}
                            npc={selectedNPC}
                            char={char}
                            category={categories.find(c => c.id === (viewMode === 'view' ? selectedNPC?.categoryId : selectedCategoryId))}
                            categories={categories}
                            onEditTrigger={() => selectedNPC && handleEdit(selectedNPC)}
                            onDeleteTrigger={() => selectedNPC && setDeleteConfirmId(selectedNPC.id)}
                            onSave={handleSubmit}
                            onCancel={() => {
                                setViewMode('view')
                                if (viewMode === 'create') setSelectedNpcId(null)
                            }}
                            onChange={(field, value) => {
                                if (['PV', 'PV_Max', 'Defense', 'INIT', 'Contact', 'Distance', 'Magie', 'FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA', 'niveau'].includes(field)) {
                                    handleNumChange(field, String(value))
                                } else {
                                    setChar(prev => ({ ...prev, [field]: value }))
                                }
                            }}
                            onImageUpload={handleImageUpload}
                            onCategoryChange={(id) => setSelectedCategoryId(id)}
                        />
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 p-8 text-center">
                        <div className="w-20 h-20 rounded-full bg-[#1a1a1a] border border-[#2a2a2a] flex items-center justify-center mb-6">
                            <User className="w-8 h-8 opacity-20" />
                        </div>
                        <h3 className="text-lg font-serif font-bold text-zinc-500 mb-2">Inspecteur</h3>
                        <p className="text-sm">Sélectionnez un personnage dans la grille pour voir ses détails et statistiques.</p>
                    </div>
                )}
            </div>

            {/* Modals */}
            <CategoryManager
                isOpen={isCategoryManagerOpen}
                onClose={() => setIsCategoryManagerOpen(false)}
                roomId={roomId}
                categories={categories}
                onCategoriesChange={setCategories}
            />

            <CreatureLibraryModal
                isOpen={showLibraryModal}
                onClose={() => setShowLibraryModal(false)}
                onImport={handleImport}
            />

            <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                <DialogContent className="bg-[#1a1a1a] border-[#333] text-[#e0e0e0]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-[#c0a080]">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            Confirmer la suppression
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Êtes-vous sûr de vouloir supprimer ce modèle ? Cette action est irréversible.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-gray-400 hover:text-white hover:bg-[#222]"
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={confirmDelete}
                            className="bg-red-600 text-white font-bold hover:bg-red-700"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    )

    if (isOpen === undefined) {
        return <div className="h-[85vh]">{Content}</div>
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose && onClose()}>
            <DialogContent className="max-w-[95vw] h-[90vh] p-0 gap-0 bg-transparent border-none shadow-none outline-none">
                {Content}
            </DialogContent>
        </Dialog>
    )
}

// --- INSPECTOR SUB COMPONENT ---

interface InspectorViewProps {
    mode: 'view' | 'edit' | 'create'
    npc?: NPC
    char?: NewCharacter
    category?: Category
    categories: Category[]
    onEditTrigger: () => void
    onDeleteTrigger: () => void
    onSave: () => void
    onCancel: () => void
    onChange: (field: keyof NewCharacter, value: any) => void
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
    onCategoryChange: (id: string | null) => void
}

function InspectorView({
    mode, npc, char, category, categories,
    onEditTrigger, onDeleteTrigger, onSave, onCancel,
    onChange, onImageUpload, onCategoryChange
}: InspectorViewProps) {

    const isEditing = mode === 'edit' || mode === 'create'
    const displayData = isEditing ? char : npc

    // Helper to get value safe
    const getVal = (field: keyof NewCharacter, fallback?: any) => {
        if (isEditing && char) return (char as any)[field]
        if (!isEditing && npc) {
            // Map NPC fields to NewCharacter fields if names differ
            if (field === 'name') return (npc as any).Nomperso
            if (field === 'PV_Max') return (npc as any).PV_Max
            return (npc as any)[field]
        }
        return fallback
    }

    const hasBaseImage = !!(isEditing ? char?.imageURL : npc?.imageURL)
    const [showToken, setShowToken] = useState(!hasBaseImage)

    // Reset view preference when character changes
    useEffect(() => {
        setShowToken(!hasBaseImage)
    }, [npc?.id, hasBaseImage])

    const getTokenUrl = () => {
        if (isEditing && char) return (typeof char?.image === 'object' ? (char.image as any)?.src : char?.image)
        return npc?.imageURL2
    }
    const getBaseUrl = () => {
        if (isEditing && char) return char?.imageURL
        return npc?.imageURL
    }

    const imageSrc = showToken ? (getTokenUrl() || getBaseUrl()) : (getBaseUrl() || getTokenUrl())

    return (
        <div className="flex flex-col h-full overflow-hidden relative">
            {/* 1. Header Image */}
            <div className="relative h-80 bg-black group shrink-0 overflow-hidden border-b border-[#2a2a2a]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-black opacity-30" />

                {imageSrc ? (
                    <img
                        src={imageSrc}
                        className={cn(
                            "transition-all duration-700",
                            showToken ? "w-full h-full object-contain object-center p-8" : "w-full h-full object-cover object-top hover:scale-105"
                        )}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#151515]">
                        <User className="w-20 h-20 text-[#333]" strokeWidth={1} />
                    </div>
                )}

                <div className={cn("absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/60 to-transparent pointer-events-none transition-opacity duration-500", showToken ? "opacity-0" : "")} />

                {/* View Toggle (Token / Image) - Only if base image exists */}
                {hasBaseImage && (
                    <div className="absolute top-4 left-4 z-20 flex gap-2 bg-black/60 backdrop-blur-md p-1.5 rounded-full border border-white/10">
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowToken(true) }}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showToken ? 'bg-[#c0a080] text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                            title="Vue Token"
                        >
                            <ScanFace className="w-4 h-4" />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowToken(false) }}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${!showToken ? 'bg-[#c0a080] text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                            title="Vue Image Complète"
                        >
                            <ImageIcon className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Edit overlay for Image */}
                {isEditing && (
                    <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 text-white font-bold text-sm hover:bg-black/80">
                            <ImageIcon className="w-4 h-4" />
                            <span>Changer l'image</span>
                        </div>
                        <input type="file" accept="image/*" className="hidden" onChange={onImageUpload} />
                    </label>
                )}

                <div className="absolute bottom-6 left-6 right-6 z-10">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        {/* Category Selector/Badge */}
                        {isEditing ? (
                            <select
                                className="bg-[#c0a080] text-black text-[10px] uppercase font-bold tracking-wider rounded px-2 py-1 outline-none cursor-pointer border-none"
                                value={isEditing && char ? (categories.find(c => c.id === category?.id)?.id || '') : ''}
                                onChange={(e) => onCategoryChange(e.target.value || null)}
                            >
                                <option value="">Sans catégorie</option>
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        ) : (
                            category && (
                                <Badge className="bg-[#c0a080] text-black hover:bg-[#c0a080] border-none text-[10px] uppercase font-bold tracking-wider">
                                    {category.name}
                                </Badge>
                            )
                        )}

                        {/* Level Input/Badge */}
                        {isEditing ? (
                            <div className="flex items-center bg-black/50 backdrop-blur rounded border border-white/20 px-2 py-0.5">
                                <span className="text-[10px] uppercase text-white/60 font-bold mr-1">Niv</span>
                                <input
                                    type="number"
                                    min="0" max="99"
                                    value={getVal('niveau')}
                                    onChange={(e) => onChange('niveau', e.target.value)}
                                    className="w-8 bg-transparent text-white text-[10px] font-bold text-center outline-none"
                                />
                            </div>
                        ) : (
                            <Badge variant="outline" className="border-white/20 text-white/60 text-[10px] uppercase font-bold tracking-wider">
                                Niveau {getVal('niveau')}
                            </Badge>
                        )}
                    </div>

                    {/* Name Input/Title */}
                    {isEditing ? (
                        <div className="relative group/input">
                            <input
                                type="text"
                                value={getVal('name', '')}
                                onChange={(e) => onChange('name', e.target.value)}
                                placeholder="Nom du personnage"
                                className="w-full bg-transparent text-3xl font-serif font-bold text-white leading-none drop-shadow-md outline-none border-b border-transparent hover:border-white/20 focus:border-[#c0a080] transition-colors placeholder:text-white/30"
                            />
                            <Pencil className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 pointer-events-none opacity-0 group-hover/input:opacity-100 transition-opacity" />
                        </div>
                    ) : (
                        <h2 className="text-3xl font-serif font-bold text-white leading-none drop-shadow-md">
                            {getVal('name')}
                        </h2>
                    )}
                </div>
            </div>

            {/* 2. Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">

                {/* Stats Grid */}
                <div className="space-y-3">
                    <h3 className="text-[#c0a080] text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#c0a080]" />
                        Statistiques de Combat
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                        <StatBlock label="PV" value={getVal('PV_Max')} onChange={isEditing ? (v) => { onChange('PV', v); onChange('PV_Max', v) } : undefined} color="text-green-400" icon={<Heart className="w-3 h-3" />} />
                        <StatBlock label="DEF" value={getVal('Defense')} onChange={isEditing ? (v) => onChange('Defense', v) : undefined} color="text-blue-400" icon={<Shield className="w-3 h-3" />} />
                        <StatBlock label="INIT" value={getVal('INIT')} onChange={isEditing ? (v) => onChange('INIT', v) : undefined} color="text-yellow-400" icon={<Zap className="w-3 h-3" />} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <StatBlock label="Contact" value={getVal('Contact')} onChange={isEditing ? (v) => onChange('Contact', v) : undefined} color="text-red-400" />
                        <StatBlock label="Distance" value={getVal('Distance')} onChange={isEditing ? (v) => onChange('Distance', v) : undefined} color="text-emerald-400" />
                        <StatBlock label="Magie" value={getVal('Magie')} onChange={isEditing ? (v) => onChange('Magie', v) : undefined} color="text-purple-400" />
                    </div>
                </div>

                {/* Attributes */}
                <div className="space-y-3">
                    <h3 className="text-[#c0a080] text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#c0a080]" />
                        Caractéristiques
                    </h3>
                    <div className="grid grid-cols-6 gap-2 bg-[#1a1a1a] p-3 rounded-lg border border-[#2a2a2a]">
                        {['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map((attr) => (
                            <div key={attr} className="flex flex-col items-center gap-1">
                                <span className="text-[9px] font-bold text-zinc-500 uppercase">{attr}</span>
                                {isEditing ? (
                                    <input
                                        type="number"
                                        value={(char as any)?.[attr] || 10}
                                        onChange={(e) => onChange(attr as keyof NewCharacter, e.target.value)}
                                        className="w-full bg-[#121212] border border-[#333] rounded text-center text-sm font-mono font-bold text-[#e0e0e0] focus:border-[#c0a080] outline-none py-1"
                                    />
                                ) : (
                                    <span className="text-sm font-mono font-bold text-[#e0e0e0]">
                                        {(npc as any)?.[attr]}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 3. Footer Actions */}
            <div className="p-6 border-t border-[#2a2a2a] bg-[#121212] flex gap-3 z-20">
                {isEditing ? (
                    <>
                        <Button
                            variant="outline"
                            onClick={onCancel}
                            className="border-[#333] text-zinc-400 hover:text-white hover:bg-[#222]"
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={onSave}
                            className="flex-1 bg-[#c0a080] text-black font-bold hover:bg-[#b09070]"
                        >
                            Sauvegarder
                        </Button>
                    </>
                ) : (
                    <>
                        <Button
                            onClick={onEditTrigger}
                            className="flex-1 bg-[#c0a080] text-black font-bold hover:bg-[#b09070]"
                        >
                            <Edit className="w-4 h-4 mr-2" />
                            Modifier
                        </Button>
                        <Button
                            variant="outline"
                            onClick={onDeleteTrigger}
                            className="border-[#333] text-red-500 hover:text-red-400 hover:bg-red-500/10 px-3"
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </>
                )}
            </div>
        </div>
    )
}

function StatBlock({ label, value, subValue, onChange, color, icon }: { label: string, value: number, subValue?: string, onChange?: (val: string) => void, color: string, icon?: React.ReactNode }) {
    return (
        <div className="bg-[#1e1e20] p-2.5 rounded border border-[#2a2a2a] flex flex-col items-center justify-center gap-1 group focus-within:border-[#c0a080]/50 transition-colors">
            <span className="text-zinc-500 text-[9px] uppercase font-bold flex items-center gap-1">
                {icon} {label}
            </span>
            {onChange ? (
                <input
                    type="number"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`bg-transparent text-center font-mono font-bold text-xl outline-none w-full ${color}`}
                />
            ) : (
                <span className={`font-mono font-bold text-xl ${color}`}>
                    {value}{subValue}
                </span>
            )}
        </div>
    )
}
