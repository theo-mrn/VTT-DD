"use client"

import React, { useState, useEffect, useMemo, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Users, Shield, Heart, Zap, UserPlus, Plus,
    Dices, Image as ImageIcon, User, Check, X, RotateCcw, Trash2, Edit,
    AlertTriangle
} from 'lucide-react'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

import { type NewCharacter } from '@/app/[roomid]/map/types'
import { useParams } from 'next/navigation'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { collection, addDoc, onSnapshot, query, where, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { NPCListView } from './NPCListView'
import { NPCCreationForm } from './NPCCreationForm'
import { CategoryManager } from './CategoryManager'

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

export interface NPC {
    id: string
    Nomperso: string
    categoryId?: string
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
    Actions?: Array<{
        Nom: string;
        Description: string;
        Toucher: number;
    }>;
}

export function NPCManager({ isOpen, onClose, onSubmit, difficulty = 3 }: NPCManagerProps) {
    const params = useParams()
    const roomId = params?.roomid as string

    // State
    const [npcs, setNpcs] = useState<NPC[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [editingNpcId, setEditingNpcId] = useState<string | null>(null)
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false)
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined)

    // Creation form state
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

    // Fetch NPC Templates from Firebase
    useEffect(() => {
        if (!roomId) return

        // Use room-specific collection for NPC templates
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

    // Fetch Categories from Firebase
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

    // Generate random stats
    const generateStats = (diff: number) => {
        const base = diff * 3 + 5
        const rand = () => Math.floor(Math.random() * 6) + base

        setChar(prev => ({
            ...prev,
            niveau: diff, // Niveau basé sur la difficulté
            FOR: rand(),
            DEX: rand(),
            CON: rand(),
            INT: rand(),
            SAG: rand(),
            CHA: rand(),
            PV: base + diff * 3, // Formule réduite : ~5-35 PV au lieu de ~20-80
            PV_Max: base + diff * 3,
            Defense: 10 + Math.floor(base / 2),
            INIT: rand(),
            Contact: Math.floor(diff * 2), // Contact basé sur difficulté
            Distance: Math.floor(diff * 1.5), // Distance basé sur difficulté
            Magie: Math.floor(diff * 1.5), // Magie basé sur difficulté
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

    // Load NPC for editing
    const handleEdit = (npc: NPC) => {
        setChar({
            name: npc.Nomperso,
            niveau: npc.niveau,
            image: npc.imageURL2 ? { src: npc.imageURL2 } : null,
            visibility: 'visible',
            PV: npc.PV,
            PV_Max: npc.PV_Max,
            Defense: npc.Defense,
            Contact: npc.Contact,
            Distance: npc.Distance,
            Magie: npc.Magie,
            INIT: npc.INIT,
            INT: npc.INT,
            CHA: npc.CHA,
            nombre: 1,
            FOR: npc.FOR,
            DEX: npc.DEX,
            CON: npc.CON,
            SAG: npc.SAG
        })
        setSelectedCategoryId(npc.categoryId)
        setEditingNpcId(npc.id)
        setShowCreateForm(true)
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
                ...(selectedCategoryId && { categoryId: selectedCategoryId }),
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
            setSelectedCategoryId(undefined)
            setShowCreateForm(false)

            if (onSubmit) onSubmit({ ...char } as any)

        } catch (error) {
            console.error("Error saving NPC:", error)
        } finally {
            setIsSubmitting(false)
        }
    }

    // Confirm delete template
    const confirmDelete = async () => {
        if (!deleteConfirmId || !roomId) return
        try {
            await deleteDoc(doc(db, 'npc_templates', roomId, 'templates', deleteConfirmId))
            setDeleteConfirmId(null)
        } catch (error) {
            console.error("Error deleting NPC template:", error)
        }
    }

    // Main render - Using extracted components to prevent re-renders
    const Content = (
        <div className="h-full flex flex-col">
            {showCreateForm ? (
                <NPCCreationForm
                    char={char}
                    editingNpcId={editingNpcId}
                    difficulty={difficulty}
                    isSubmitting={isSubmitting}
                    categories={categories}
                    selectedCategoryId={selectedCategoryId}
                    onCategoryChange={setSelectedCategoryId}
                    onOpenCategoryManager={() => setIsCategoryManagerOpen(true)}
                    onCharChange={setChar}
                    onReset={() => setChar(defaultCharacter)}
                    onCancel={() => {
                        setShowCreateForm(false)
                        setEditingNpcId(null)
                        setSelectedCategoryId(undefined)
                        setChar(defaultCharacter)
                    }}
                    onSubmit={handleSubmit}
                    onImageUpload={handleImageUpload}
                    onNumChange={handleNumChange}
                    onGenerateStats={generateStats}
                />
            ) : (
                <NPCListView
                    npcs={npcs}
                    categories={categories}
                    loading={loading}
                    onCreateNew={() => setShowCreateForm(true)}
                    onEdit={handleEdit}
                    onDelete={(id) => setDeleteConfirmId(id)}
                    onManageCategories={() => setIsCategoryManagerOpen(true)}
                />
            )}

            {/* Delete Confirmation Modal */}
            <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                <DialogContent className="bg-[#1a1a1a] border-[#333] text-[#e0e0e0]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-[#c0a080]">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            Confirmer la suppression
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Êtes-vous sûr de vouloir supprimer ce modèle de PNJ ? Cette action est irréversible.
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

            {/* Category Manager Modal */}
            <CategoryManager
                isOpen={isCategoryManagerOpen}
                onClose={() => setIsCategoryManagerOpen(false)}
                roomId={roomId}
                categories={categories}
                onCategoriesChange={setCategories}
            />
        </div>
    )

    if (isOpen === undefined) {
        return Content
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose && onClose()}>
            <DialogContent className="max-w-4xl p-0 gap-0 bg-[#1a1a1a] text-[#e0e0e0] border-[#3a3a3a] overflow-hidden flex flex-col h-[85vh]">
                {Content}
            </DialogContent>
        </Dialog>
    )
}
