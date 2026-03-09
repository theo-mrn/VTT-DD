"use client"

import React, { useState, useEffect } from 'react'
import { Search, X, Package, Plus, Loader2, Upload } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ObjectTemplate } from '@/app/[roomid]/map/types'
import { SUGGESTED_OBJECTS, SuggestedItem } from '@/lib/suggested-objects'
import { useDialogVisibility } from '@/contexts/DialogVisibilityContext'
import { useGMTemplates } from '@/contexts/GMTemplatesContext'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { advancedSearch } from '@/lib/advanced-search'

interface ObjectDrawerProps {
    roomId: string
    isOpen: boolean
    onClose: () => void
    onDragStart: (template: ObjectTemplate) => void
    currentCityId: string | null
    isEmbedded?: boolean
}

export function ObjectDrawer({ roomId, isOpen, onClose, onDragStart, currentCityId, isEmbedded }: ObjectDrawerProps) {
    const { setDialogOpen } = useDialogVisibility();
    const { objectTemplates, addObjectTemplate } = useGMTemplates();

    // Search and Nav States
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')

    // Form States
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [newObjectName, setNewObjectName] = useState('')
    const [newObjectImage, setNewObjectImage] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Register dialog state when drawer opens/closes
    useEffect(() => {
        setDialogOpen(isOpen || showCreateForm);
    }, [isOpen, showCreateForm, setDialogOpen]);

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery)
        }, 300)

        return () => clearTimeout(timer)
    }, [searchQuery])

    // Filter items based on search
    const filteredItems = React.useMemo(() => {
        // Map custom templates to the SuggestedItem structure so they render the same
        const customItemsMapped: SuggestedItem[] = objectTemplates.map(t => ({
            name: t.name,
            path: t.imageUrl,
            category: t.category || 'other'
        }));

        const items = [...SUGGESTED_OBJECTS, ...customItemsMapped];

        if (!debouncedQuery.trim()) {
            return items;
        }

        const searchResults = advancedSearch(items, debouncedQuery, {
            keys: ['name'],
            threshold: 0.4,
            useSemanticSearch: true,
            includeScore: true
        });

        // Search returns array of { item, score }, we just need the item
        return searchResults.map(result => result.item as SuggestedItem);
    }, [debouncedQuery, objectTemplates]);

    // Handle Image Upload for Custom Object
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setNewObjectImage(reader.result as string)
            }
            reader.readAsDataURL(file)
        }
    }

    // Submit Custom Object
    const handleCreateSubmit = async () => {
        if (!newObjectName || !roomId) return

        setIsSubmitting(true)
        const storage = getStorage()

        let imageURL = ''

        try {
            if (newObjectImage) {
                if (newObjectImage.startsWith('data:')) {
                    const imageRef = ref(storage, `objects/${newObjectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${Date.now()}`)
                    const response = await fetch(newObjectImage)
                    const blob = await response.blob()
                    await uploadBytes(imageRef, blob)
                    imageURL = await getDownloadURL(imageRef)
                } else {
                    imageURL = newObjectImage
                }
            }

            const objectData = {
                name: newObjectName,
                imageUrl: imageURL,
                category: 'custom'
            }

            await addObjectTemplate(objectData)

            // Success cleanup
            setNewObjectName('')
            setNewObjectImage(null)
            setShowCreateForm(false)
        } catch (error) {
            console.error("Error saving object template:", error)
        } finally {
            setIsSubmitting(false)
        }
    }


    const handleDragStart = (e: React.DragEvent, item: SuggestedItem) => {
        e.dataTransfer.effectAllowed = 'copy'

        const template: ObjectTemplate = {
            id: `suggested-${item.name}-${Date.now()}`,
            name: item.name,
            imageUrl: item.path,
            category: item.category
        };

        e.dataTransfer.setData('application/json', JSON.stringify({ ...template, type: 'object_template' }))
        onDragStart(template)
    }

    if (!isOpen) return null

    // If showing create form, render it fullscreen within the container
    if (showCreateForm) {
        return (
            <div className={isEmbedded ? "flex flex-col h-full w-full bg-[#1a1a1a]" : "fixed right-0 top-0 h-full w-80 bg-[#1a1a1a] border-l border-[#333] z-[99999900] flex flex-col shadow-2xl"}>
                <div className="p-4 bg-[#141414] border-b border-[#333] flex items-center justify-between shrink-0">
                    <h2 className="text-lg font-bold text-[#80c0a0] tracking-tight">Nouvel Objet</h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowCreateForm(false)}
                        className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                        disabled={isSubmitting}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
                <ScrollArea className="flex-1 p-5">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400">Nom de l'objet *</label>
                            <Input
                                value={newObjectName}
                                onChange={(e) => setNewObjectName(e.target.value)}
                                className="bg-[#2a2a2a] border-[#333] text-white focus:border-[#80c0a0]"
                                placeholder="ex: Caisse en bois"
                                disabled={isSubmitting}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-medium text-gray-400">Image</label>
                            <div className="relative aspect-square w-full rounded-xl border-2 border-dashed border-[#333] hover:border-[#80c0a0] transition-colors overflow-hidden group">
                                {newObjectImage ? (
                                    <img src={newObjectImage} alt="Preview" className="w-full h-full object-contain p-2" />
                                ) : (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 group-hover:text-[#80c0a0]">
                                        <Upload className="w-8 h-8 mb-2 opacity-50" />
                                        <span className="text-xs font-medium">Importer une image</span>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    disabled={isSubmitting}
                                />
                            </div>
                        </div>

                        <div className="pt-4">
                            <Button
                                onClick={handleCreateSubmit}
                                disabled={!newObjectName || isSubmitting}
                                className="w-full bg-[#80c0a0] text-black hover:bg-[#60a080] font-bold"
                            >
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                {isSubmitting ? 'Création...' : 'Créer l\'objet'}
                            </Button>
                        </div>
                    </div>
                </ScrollArea>
            </div>
        )
    }

    return (
        <div className={isEmbedded ? "flex flex-col h-full w-full bg-[#1a1a1a]" : "fixed right-0 top-0 h-full w-80 bg-[#1a1a1a] border-l border-[#333] z-[99999900] flex flex-col shadow-2xl"}>
            {/* PREMIUM HEADER */}
            {!isEmbedded && (
                <div className="relative px-6 py-5 border-b border-[#333] bg-gradient-to-br from-[#1a1a1a] via-[#1a1a1a] to-[#252525]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#80c0a0] to-[#60a080] flex items-center justify-center shadow-lg shadow-[#80c0a0]/20">
                                <Package className="w-5 h-5 text-black" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white tracking-tight">Objets</h2>
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
            )}

            {/* Navigation & Search */}
            <div className="px-6 py-4 border-b border-[#333] shrink-0 bg-[#1a1a1a] flex flex-col gap-3">
                {/* Search */}
                <div className="flex items-center gap-2 w-full">
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            type="text"
                            placeholder="Rechercher un objet..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-4 bg-[#252525] border-[#404040] text-white placeholder-gray-500 focus:border-[#80c0a0] focus:ring-1 focus:ring-[#80c0a0]/20 h-10 rounded-lg w-full"
                        />
                    </div>
                    <Button
                        onClick={() => setShowCreateForm(true)}
                        className="h-10 w-10 p-0 shrink-0 bg-[#80c0a0]/10 text-[#80c0a0] hover:bg-[#80c0a0]/20 border border-[#80c0a0]/20 rounded-lg"
                        title="Ajouter un objet personnalisé"
                    >
                        <Plus className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            {/* Content Area */}
            <ScrollArea className="flex-1 bg-[#141414]">
                <div className="p-5">
                    {/* Items List */}
                    <div className="grid grid-cols-2 gap-4">
                        {filteredItems.length > 0 ? (
                            filteredItems.map((item, idx) => (
                                <DraggableItem
                                    key={`${item.name}-${idx}`}
                                    item={item}
                                    onDragStart={handleDragStart}
                                />
                            ))
                        ) : (
                            <div className="col-span-2 flex flex-col items-center justify-center py-10 text-gray-500">
                                <Search className="w-8 h-8 mb-2 opacity-20" />
                                <p>Aucun objet trouvé</p>
                            </div>
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    )
}

function DraggableItem({ item, onDragStart }: { item: SuggestedItem, onDragStart: (e: React.DragEvent, item: SuggestedItem) => void }) {
    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, item)}
            className="group relative bg-[#1e1e1e] border border-[#333] rounded-xl p-3 cursor-move hover:border-[#80c0a0] hover:shadow-xl hover:shadow-[#80c0a0]/10 transition-all duration-200 flex flex-col items-center gap-2.5"
        >
            {/* Image Container */}
            <div className="w-full aspect-square flex items-center justify-center p-2.5 bg-[#141414] rounded-lg overflow-hidden border border-[#2a2a2a] group-hover:border-[#333] transition-colors">
                <img
                    src={item.path}
                    alt={item.name}
                    className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform duration-200"
                    draggable={false}
                />
            </div>

            {/* Name */}
            <div className="w-full text-center">
                <span className="text-[10px] text-gray-400 font-medium truncate block group-hover:text-[#80c0a0] transition-colors uppercase tracking-wider">
                    {item.name}
                </span>
            </div>

            {/* Drag Indicator */}
            <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-50 transition-opacity">
                <div className="grid grid-cols-2 gap-0.5">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="w-0.5 h-0.5 rounded-full bg-gray-500" />
                    ))}
                </div>
            </div>
        </div>
    )
}
