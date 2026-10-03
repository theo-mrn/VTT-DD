"use client"

import React, { useState, useEffect } from 'react'
import { Folder, Plus, Edit, Trash2, X, Check, Palette } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { type Category } from './personnages'

interface CategoryManagerProps {
    isOpen: boolean
    onClose: () => void
    roomId: string
    categories: Category[]
    onCategoriesChange: (categories: Category[]) => void
}

// Palette de couleurs prédéfinies
const COLOR_PALETTE = [
    '#c0a080', // Bronze (couleur principale de l'app)
    '#ef4444', // Red
    '#f59e0b', // Amber
    '#10b981', // Green
    '#3b82f6', // Blue
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#64748b', // Slate
]

export function CategoryManager({ isOpen, onClose, roomId, categories, onCategoriesChange }: CategoryManagerProps) {
    const [isCreating, setIsCreating] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [newCategory, setNewCategory] = useState({ name: '', color: COLOR_PALETTE[0] })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

    const handleCreate = async () => {
        if (!newCategory.name.trim() || !roomId) return

        setIsSubmitting(true)
        try {
            const categoriesRef = collection(db, 'npc_templates', roomId, 'categories')
            await addDoc(categoriesRef, {
                name: newCategory.name.trim(),
                color: newCategory.color,
                createdAt: new Date()
            })
            setNewCategory({ name: '', color: COLOR_PALETTE[0] })
            setIsCreating(false)
        } catch (error) {
            console.error("Error creating category:", error)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleUpdate = async () => {
        if (!newCategory.name.trim() || !editingId || !roomId) return

        setIsSubmitting(true)
        try {
            const categoryRef = doc(db, 'npc_templates', roomId, 'categories', editingId)
            await updateDoc(categoryRef, {
                name: newCategory.name.trim(),
                color: newCategory.color,
            })
            setNewCategory({ name: '', color: COLOR_PALETTE[0] })
            setEditingId(null)
        } catch (error) {
            console.error("Error updating category:", error)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteConfirmId || !roomId) return

        try {
            await deleteDoc(doc(db, 'npc_templates', roomId, 'categories', deleteConfirmId))
            setDeleteConfirmId(null)
        } catch (error) {
            console.error("Error deleting category:", error)
        }
    }

    const startEdit = (category: Category) => {
        setNewCategory({ name: category.name, color: category.color || COLOR_PALETTE[0] })
        setEditingId(category.id)
        setIsCreating(true)
    }

    const cancelEdit = () => {
        setNewCategory({ name: '', color: COLOR_PALETTE[0] })
        setEditingId(null)
        setIsCreating(false)
    }

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="max-w-2xl bg-[#1a1a1a] border-[#333] text-[#e0e0e0]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-[#c0a080]">
                            <Folder className="w-5 h-5" />
                            Gestion des catégories
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Organisez vos PNJ en créant des catégories personnalisées
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Create/Edit Form */}
                        {isCreating ? (
                            <Card className="bg-[#222] border-[#444]">
                                <CardContent className="p-4 space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[#c0a080]">Nom de la catégorie</Label>
                                        <Input
                                            value={newCategory.name}
                                            onChange={(e) => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="Ex: Alliés, Ennemis, Marchands..."
                                            className="bg-[#1a1a1a] border-[#444] text-[#e0e0e0]"
                                            autoFocus
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[#c0a080]">Couleur</Label>
                                        <div className="flex gap-2">
                                            {COLOR_PALETTE.map((color) => (
                                                <button
                                                    key={color}
                                                    onClick={() => setNewCategory(prev => ({ ...prev, color }))}
                                                    className={`w-8 h-8 rounded-full border-2 transition-all ${newCategory.color === color
                                                            ? 'border-white scale-110'
                                                            : 'border-[#444] hover:border-[#666]'
                                                        }`}
                                                    style={{ backgroundColor: color }}
                                                >
                                                    {newCategory.color === color && (
                                                        <Check className="w-4 h-4 text-white mx-auto" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex gap-2 justify-end">
                                        <Button
                                            variant="ghost"
                                            onClick={cancelEdit}
                                            className="text-gray-400 hover:text-white"
                                        >
                                            <X className="w-4 h-4 mr-2" />
                                            Annuler
                                        </Button>
                                        <Button
                                            onClick={editingId ? handleUpdate : handleCreate}
                                            disabled={!newCategory.name.trim() || isSubmitting}
                                            className="bg-[#c0a080] text-black font-bold hover:bg-[#b09070]"
                                        >
                                            <Check className="w-4 h-4 mr-2" />
                                            {editingId ? 'Modifier' : 'Créer'}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            <Button
                                onClick={() => setIsCreating(true)}
                                className="w-full bg-[#c0a080] text-black font-bold hover:bg-[#b09070]"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Nouvelle catégorie
                            </Button>
                        )}

                        {/* Categories List */}
                        <ScrollArea className="h-[300px]">
                            {categories.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 text-center">
                                    <Folder className="w-16 h-16 text-gray-600 mb-4" />
                                    <h3 className="text-lg font-bold text-gray-400 mb-2">Aucune catégorie</h3>
                                    <p className="text-sm text-gray-600">Créez votre première catégorie pour organiser vos PNJ</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {categories.map((category) => (
                                        <Card key={category.id} className="bg-[#222] border-[#333] hover:border-[#444] transition-colors">
                                            <CardContent className="p-3 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="w-4 h-4 rounded-full"
                                                        style={{ backgroundColor: category.color || COLOR_PALETTE[0] }}
                                                    />
                                                    <span className="font-medium text-white">{category.name}</span>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-[#c0a080] hover:text-[#b09070] hover:bg-[#c0a080]/10"
                                                        onClick={() => startEdit(category)}
                                                    >
                                                        <Edit className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-950/20"
                                                        onClick={() => setDeleteConfirmId(category.id)}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            className="text-gray-400 hover:text-white"
                        >
                            Fermer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Modal */}
            <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                <DialogContent className="bg-[#1a1a1a] border-[#333] text-[#e0e0e0]">
                    <DialogHeader>
                        <DialogTitle className="text-[#c0a080]">Confirmer la suppression</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Êtes-vous sûr de vouloir supprimer cette catégorie ? Les PNJ de cette catégorie ne seront pas supprimés et passeront en "Sans catégorie".
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-gray-400 hover:text-white"
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={handleDelete}
                            className="bg-red-600 text-white font-bold hover:bg-red-700"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
