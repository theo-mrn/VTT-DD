"use client"

import React, { useState, useEffect } from 'react'
import { Box, GripVertical, Search, X, Plus, Trash2, Library, Image as ImageIcon, Package } from 'lucide-react'
import { collection, onSnapshot, query, addDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { ObjectTemplate } from '@/app/[roomid]/map/types'
import { SUGGESTED_OBJECTS, ITEM_CATEGORIES, SuggestedItem } from '@/lib/suggested-objects'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"

interface ObjectDrawerProps {
    roomId: string
    isOpen: boolean
    onClose: () => void
    onDragStart: (template: ObjectTemplate) => void
    currentCityId: string | null
}

export function ObjectDrawer({ roomId, isOpen, onClose, onDragStart, currentCityId }: ObjectDrawerProps) {
    const [templates, setTemplates] = useState<ObjectTemplate[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(true)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [newObjectImage, setNewObjectImage] = useState<{ src: string, file: File } | null>(null)
    const [newObjectName, setNewObjectName] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

    const [isLibraryOpen, setIsLibraryOpen] = useState(false)
    const [selectedLibraryCategory, setSelectedLibraryCategory] = useState<string>('all')
    const [selectedLibraryItem, setSelectedLibraryItem] = useState<SuggestedItem | null>(null)

    // Load templates
    useEffect(() => {
        if (!roomId || !isOpen) return

        const templatesRef = collection(db, `object_templates/${roomId}/templates`)
        const q = query(templatesRef)

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const templatesData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as ObjectTemplate[]
            setTemplates(templatesData)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [roomId, isOpen])

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setNewObjectImage({ src: reader.result as string, file })
                // Auto-fill name if empty
                if (!newObjectName) {
                    setNewObjectName(file.name.split('.')[0])
                }
            }
            reader.readAsDataURL(file)
        }
    }

    const handleLibraryItemSelect = (item: SuggestedItem) => {
        setNewObjectImage({ src: item.path, file: null as any })
        setNewObjectName(item.name)
        setIsLibraryOpen(false)
    }

    const handleSubmit = async () => {
        if (!newObjectName || !newObjectImage || !roomId) return

        setIsSubmitting(true)
        const storage = getStorage()

        try {
            let imageUrl: string

            if (newObjectImage.file) {
                const imageRef = ref(storage, `objects/${roomId}/${newObjectName}-${Date.now()}`)
                await uploadBytes(imageRef, newObjectImage.file)
                imageUrl = await getDownloadURL(imageRef)
            } else {
                imageUrl = newObjectImage.src
            }

            await addDoc(collection(db, `object_templates/${roomId}/templates`), {
                name: newObjectName,
                imageUrl,
                createdAt: new Date()
            })

            // Reset
            setNewObjectName('')
            setNewObjectImage(null)
            setShowCreateForm(false)

        } catch (error) {
            console.error("Error creating object:", error)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteConfirmId || !roomId) return
        try {
            await deleteDoc(doc(db, `object_templates/${roomId}/templates`, deleteConfirmId))
            setDeleteConfirmId(null)
        } catch (error) {
            console.error("Error deleting object template:", error)
        }
    }

    const handleDragStart = (e: React.DragEvent, item: ObjectTemplate) => {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('application/json', JSON.stringify({ ...item, type: 'object_template' }))
        onDragStart(item)
    }

    if (!isOpen) return null

    // Helper for filtered items
    const filteredItems = templates.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()))

    return (
        <div className="fixed right-0 top-0 h-full w-80 bg-[#1a1a1a] border-l border-[#333] z-50 flex flex-col shadow-2xl">
            {/* PREMIUM HEADER */}
            <div className="relative px-6 py-5 border-b border-[#333] bg-gradient-to-br from-[#1a1a1a] via-[#1a1a1a] to-[#252525]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#80c0a0] to-[#60a080] flex items-center justify-center shadow-lg shadow-[#80c0a0]/20">
                            <Package className="w-5 h-5 text-black" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-tight">Objets</h2>
                            <p className="text-xs text-gray-400">Glissez sur la carte</p>
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

            {/* Creation Form */}
            {showCreateForm ? (
                <div className="p-6 bg-gradient-to-b from-[#1e1e1e] to-[#1a1a1a] border-b border-[#333] space-y-5">
                    {/* Form Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-6 bg-gradient-to-b from-[#80c0a0] to-[#60a080] rounded-full" />
                            <h3 className="text-white font-semibold text-base">Nouvel Objet</h3>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowCreateForm(false)}
                            className="h-7 w-7 p-0 text-gray-400 hover:text-white rounded-lg hover:bg-[#333]"
                        >
                            <X className="w-3.5 h-3.5" />
                        </Button>
                    </div>

                    {/* Image Selection - Two Equal Columns */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Upload Area */}
                        <div
                            className="group relative h-44 border-2 border-dashed border-[#404040] rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[#80c0a0] transition-all bg-gradient-to-br from-[#1a1a1a] to-[#252525] overflow-hidden hover:shadow-lg hover:shadow-[#80c0a0]/10"
                            onClick={() => document.getElementById('object-upload')?.click()}
                        >
                            {newObjectImage ? (
                                <>
                                    <img
                                        src={newObjectImage.src}
                                        alt="Preview"
                                        className="h-full w-full object-contain p-3"
                                    />
                                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <span className="text-xs text-white font-medium">Changer</span>
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center gap-2.5 px-2">
                                    <div className="w-12 h-12 rounded-full bg-[#2a2a2a] flex items-center justify-center group-hover:bg-[#80c0a0]/20 transition-colors">
                                        <ImageIcon className="w-6 h-6 text-gray-500 group-hover:text-[#80c0a0] transition-colors" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs text-gray-300 font-semibold mb-0.5">Upload</p>
                                        <p className="text-[10px] text-gray-500 leading-tight">PNG, JPG<br />max 10MB</p>
                                    </div>
                                </div>
                            )}
                            <input
                                id="object-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageUpload}
                            />
                        </div>

                        {/* Library Button */}
                        <div
                            className="group h-44 border-2 border-dashed border-[#404040] flex flex-col items-center justify-center gap-2.5 hover:bg-[#252525] hover:border-[#80c0a0] hover:shadow-lg hover:shadow-[#80c0a0]/10 transition-all rounded-xl bg-gradient-to-br from-[#1a1a1a] to-[#222] cursor-pointer"
                            onClick={() => setIsLibraryOpen(true)}
                        >
                            <div className="w-12 h-12 rounded-full bg-[#2a2a2a] flex items-center justify-center group-hover:bg-[#80c0a0]/20 transition-colors">
                                <Library className="w-6 h-6 text-gray-400 group-hover:text-[#80c0a0] transition-colors" />
                            </div>
                            <div className="text-center px-2">
                                <p className="text-xs text-gray-300 font-semibold mb-0.5">Bibliothèque</p>
                                <p className="text-[10px] text-gray-500">150 objets</p>
                            </div>
                        </div>
                    </div>

                    {/* Name Input */}
                    <div className="space-y-2">
                        <label className="text-xs text-gray-400 font-medium">Nom de l'objet</label>
                        <Input
                            placeholder="Ex: Potion de soin"
                            value={newObjectName}
                            onChange={(e) => setNewObjectName(e.target.value)}
                            className="bg-[#1a1a1a] border-[#404040] text-white placeholder-gray-500 focus:border-[#80c0a0] focus:ring-1 focus:ring-[#80c0a0]/20 h-11 rounded-lg"
                        />
                    </div>

                    {/* Create Button */}
                    <Button
                        className="w-full bg-gradient-to-r from-[#80c0a0] to-[#60a080] text-black font-semibold hover:from-[#90d0b0] hover:to-[#70b090] h-11 rounded-lg shadow-lg shadow-[#80c0a0]/20 hover:shadow-[#80c0a0]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!newObjectName || !newObjectImage || isSubmitting}
                        onClick={handleSubmit}
                    >
                        {isSubmitting ? (
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                                <span>Création...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <Plus className="w-4 h-4" />
                                <span>Créer l'objet</span>
                            </div>
                        )}
                    </Button>
                </div>
            ) : (
                <div className="px-6 py-4 border-b border-[#333] shrink-0 bg-[#1a1a1a]">
                    <div className="flex items-center gap-3">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                type="text"
                                placeholder="Rechercher un objet..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 pr-4 bg-[#252525] border-[#404040] text-white placeholder-gray-500 focus:border-[#80c0a0] focus:ring-1 focus:ring-[#80c0a0]/20 h-10 rounded-lg"
                            />
                        </div>
                        {/* Add Button */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowCreateForm(true)}
                            className="h-10 w-10 p-0 rounded-lg bg-gradient-to-br from-[#80c0a0] to-[#60a080] text-black hover:from-[#90d0b0] hover:to-[#70b090] shadow-lg shadow-[#80c0a0]/20 hover:shadow-[#80c0a0]/30 transition-all"
                        >
                            <Plus className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            )}

            {/* List */}
            <ScrollArea className="flex-1">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <p className="text-gray-500">Chargement...</p>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                        <Box className="w-16 h-16 text-gray-600 mb-4" />
                        <h3 className="text-lg font-bold text-gray-400 mb-2">Aucun objet</h3>
                        <p className="text-sm text-gray-600">Créez votre premier objet</p>
                    </div>
                ) : (
                    <div className="p-5 grid grid-cols-2 gap-4">
                        {filteredItems.map((item) => (
                            <div
                                key={item.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, item)}
                                className="group relative bg-gradient-to-br from-[#222] to-[#1a1a1a] border border-[#333] rounded-xl p-3 cursor-move hover:border-[#80c0a0] hover:shadow-xl hover:shadow-[#80c0a0]/20 transition-all duration-200 flex flex-col items-center gap-2.5"
                            >
                                {/* Image Container */}
                                <div className="w-full aspect-square flex items-center justify-center p-2.5 bg-[#1a1a1a] rounded-lg overflow-hidden border border-[#2a2a2a] group-hover:border-[#333] transition-colors">
                                    <img
                                        src={item.imageUrl}
                                        alt={item.name}
                                        className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-200"
                                        draggable={false}
                                    />
                                </div>

                                {/* Name */}
                                <div className="w-full text-center">
                                    <span className="text-xs text-gray-300 font-medium truncate block group-hover:text-[#80c0a0] transition-colors">
                                        {item.name}
                                    </span>
                                </div>

                                {/* Delete Button */}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="absolute top-2 right-2 h-7 w-7 p-0 rounded-lg opacity-0 group-hover:opacity-100 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-red-500/20 hover:text-red-400 border border-[#333] hover:border-red-500/50 transition-all"
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setDeleteConfirmId(item.id)
                                    }}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </Button>

                                {/* Drag Indicator */}
                                <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-50 transition-opacity">
                                    <div className="grid grid-cols-2 gap-0.5">
                                        {[...Array(4)].map((_, i) => (
                                            <div key={i} className="w-1 h-1 rounded-full bg-gray-500" />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>

            {/* Delete Confirmation Modal */}
            <Dialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                <DialogContent className="bg-[#1a1a1a] border-[#333] text-[#e0e0e0]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-[#80c0a0]">
                            Supprimer cet objet ?
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            Cette action est irréversible.
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
                            onClick={handleDelete}
                            className="bg-red-600 text-white font-bold hover:bg-red-700"
                        >
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* CUSTOM FULL SCREEN LIBRARY MODAL */}
            {isLibraryOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
                    <div className="w-[95vw] h-[90vh] bg-[#1a1a1a] border border-[#333] rounded-lg flex flex-col overflow-hidden">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-[#333] flex items-center justify-between shrink-0">
                            <div>
                                <div className="flex items-center gap-2 text-[#80c0a0]">
                                    <Library className="w-5 h-5" />
                                    <h2 className="text-xl font-bold">Bibliothèque d'objets</h2>
                                </div>
                                <p className="text-sm text-gray-400 mt-1">Sélectionnez un objet</p>
                            </div>
                            <button
                                onClick={() => setIsLibraryOpen(false)}
                                className="p-2 hover:bg-[#222] rounded-lg transition-colors text-gray-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body with sidebar and grid */}
                        <div className="flex flex-1 min-h-0">
                            {/* Sidebar */}
                            <div className="w-56 bg-[#141414] border-r border-[#333] shrink-0 overflow-y-auto">
                                <div className="p-3 space-y-1">
                                    {ITEM_CATEGORIES.map(cat => (
                                        <button
                                            key={cat.id}
                                            onClick={() => setSelectedLibraryCategory(cat.id)}
                                            className={`w-full text-left px-4 py-2.5 rounded-md text-sm transition-colors ${selectedLibraryCategory === cat.id
                                                ? 'bg-[#80c0a0] text-black font-semibold'
                                                : 'text-gray-400 hover:text-white hover:bg-[#222]'
                                                }`}
                                        >
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Grid */}
                            <div className="flex-1 overflow-y-auto bg-[#0a0a0a]">
                                <div className="p-6">
                                    <div className="grid grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3">
                                        {SUGGESTED_OBJECTS
                                            .filter(item => selectedLibraryCategory === 'all' || item.category === selectedLibraryCategory)
                                            .map((item, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => handleLibraryItemSelect(item)}
                                                    className="group bg-[#1a1a1a] border border-[#333] rounded-lg p-2 hover:border-[#80c0a0] hover:bg-[#222] transition-all focus:outline-none focus:ring-2 focus:ring-[#80c0a0]"
                                                >
                                                    <div className="w-full pb-[100%] relative mb-2">
                                                        <img
                                                            src={item.path}
                                                            alt={item.name}
                                                            className="absolute inset-0 w-full h-full object-contain p-1"
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-gray-500 text-center truncate group-hover:text-[#80c0a0]">
                                                        {item.name}
                                                    </p>
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
