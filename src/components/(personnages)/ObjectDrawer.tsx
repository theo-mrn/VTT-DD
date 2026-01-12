"use client"

import React, { useState, useEffect } from 'react'
import { Search, X, Package, ChevronRight, Folder } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { ObjectTemplate } from '@/app/[roomid]/map/types'
import { SUGGESTED_OBJECTS, ITEM_CATEGORIES, SuggestedItem } from '@/lib/suggested-objects'
import { useDialogVisibility } from '@/contexts/DialogVisibilityContext'

interface ObjectDrawerProps {
    roomId: string
    isOpen: boolean
    onClose: () => void
    onDragStart: (template: ObjectTemplate) => void
    currentCityId: string | null
}

export function ObjectDrawer({ roomId, isOpen, onClose, onDragStart, currentCityId }: ObjectDrawerProps) {
    const { setDialogOpen } = useDialogVisibility();

    // Register dialog state when drawer opens/closes
    useEffect(() => {
        setDialogOpen(isOpen);
    }, [isOpen, setDialogOpen]);

    const [searchQuery, setSearchQuery] = useState('')
    const [currentCategory, setCurrentCategory] = useState<string | null>(null)

    // Helper to get formatted name for breadcrumbs
    const getCategoryLabel = (id: string) => {
        return ITEM_CATEGORIES.find(c => c.id === id)?.label || id
    }

    // Filter items based on search or category
    const filteredItems = React.useMemo(() => {
        let items = SUGGESTED_OBJECTS;

        if (searchQuery) {
            return items.filter(item =>
                item.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        if (currentCategory && currentCategory !== 'all') {
            return items.filter(item => item.category === currentCategory);
        }

        // If no category selected (root view), we don't show items, we show categories
        return [];
    }, [searchQuery, currentCategory]);

    // Get categories to show in root view
    const visibleCategories = React.useMemo(() => {
        if (searchQuery) return []; // Don't show categories when searching
        return ITEM_CATEGORIES.filter(c => c.id !== 'all');
    }, [searchQuery]);


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

    return (
        <div className="fixed right-0 top-0 h-full w-80 bg-[#1a1a1a] border-l border-[#333] z-[99999900] flex flex-col shadow-2xl">
            {/* PREMIUM HEADER */}
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

            {/* Navigation & Search */}
            <div className="px-6 py-4 border-b border-[#333] shrink-0 bg-[#1a1a1a] flex flex-col gap-3">
                {/* Search */}
                <div className="relative w-full">
                    <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        type="text"
                        placeholder="Rechercher un objet..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 bg-[#252525] border-[#404040] text-white placeholder-gray-500 focus:border-[#80c0a0] focus:ring-1 focus:ring-[#80c0a0]/20 h-10 rounded-lg w-full"
                    />
                </div>

                {/* Breadcrumbs - Only show if not searching */}
                {!searchQuery && (
                    <div className="flex items-center gap-1 text-sm text-gray-400 overflow-x-auto no-scrollbar whitespace-nowrap">
                        <button
                            onClick={() => setCurrentCategory(null)}
                            className={`hover:text-white transition-colors ${!currentCategory ? 'text-white font-medium' : ''}`}
                        >
                            Accueil
                        </button>

                        {currentCategory && (
                            <>
                                <ChevronRight className="w-4 h-4 text-gray-600" />
                                <span className="text-[#80c0a0] font-medium">
                                    {getCategoryLabel(currentCategory)}
                                </span>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Content Area */}
            <ScrollArea className="flex-1 bg-[#141414]">
                <div className="p-5">
                    {searchQuery ? (
                        // Search Results
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
                    ) : currentCategory ? (
                        // Category Items
                        <div className="grid grid-cols-2 gap-4">
                            {filteredItems.map((item, idx) => (
                                <DraggableItem
                                    key={`${item.name}-${idx}`}
                                    item={item}
                                    onDragStart={handleDragStart}
                                />
                            ))}
                        </div>
                    ) : (
                        // Root: Categories List
                        <div className="grid grid-cols-2 gap-3">
                            {visibleCategories.map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setCurrentCategory(cat.id)}
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
