"use client"

import React, { useState, useMemo } from 'react'
import { Users, UserPlus, Plus, Heart, Shield, Edit, Trash2, User, Search, Folder, ChevronDown, ChevronRight, Filter } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { type NPC, type Category } from './personnages'

interface NPCListViewProps {
    npcs: NPC[]
    categories: Category[]
    loading: boolean
    onCreateNew: () => void
    onEdit: (npc: NPC) => void
    onDelete: (id: string) => void
    onManageCategories: () => void
}

export const NPCListView = React.memo(({ npcs, categories, loading, onCreateNew, onEdit, onDelete, onManageCategories }: NPCListViewProps) => {
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null)
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

    // Group NPCs by category
    const npcsByCategory = useMemo(() => {
        // Filter by search first
        let filtered = npcs
        if (searchQuery.trim()) {
            filtered = npcs.filter(npc =>
                npc.Nomperso.toLowerCase().includes(searchQuery.toLowerCase())
            )
        }

        // Filter by selected category
        if (selectedCategoryFilter) {
            filtered = filtered.filter(npc =>
                selectedCategoryFilter === 'none'
                    ? !npc.categoryId
                    : npc.categoryId === selectedCategoryFilter
            )
        }

        // Group by category
        const grouped = new Map<string, NPC[]>()

        filtered.forEach(npc => {
            const categoryId = npc.categoryId || 'none'
            if (!grouped.has(categoryId)) {
                grouped.set(categoryId, [])
            }
            grouped.get(categoryId)!.push(npc)
        })

        return grouped
    }, [npcs, searchQuery, selectedCategoryFilter])

    const toggleCategoryCollapse = (categoryId: string) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev)
            if (next.has(categoryId)) {
                next.delete(categoryId)
            } else {
                next.add(categoryId)
            }
            return next
        })
    }

    const getCategoryInfo = (categoryId: string) => {
        if (categoryId === 'none') {
            return { name: 'Sans catégorie', color: '#64748b' }
        }
        const category = categories.find(c => c.id === categoryId)
        return {
            name: category?.name || 'Catégorie inconnue',
            color: category?.color || '#c0a080'
        }
    }

    const totalNpcs = Array.from(npcsByCategory.values()).reduce((sum, npcs) => sum + npcs.length, 0)

    return (
        <div className="flex flex-col h-full bg-[#1a1a1a] text-[#e0e0e0]">
            {/* Header */}
            <div className="p-4 bg-[#141414] border-b border-[#333] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#c0a080]/10 rounded-lg border border-[#c0a080]/20">
                        <Users className="w-5 h-5 text-[#c0a080]" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[#c0a080] tracking-tight">
                            Bibliothèque de PNJ
                        </h2>
                        <p className="text-xs text-gray-500 font-medium">{npcs.length} modèle{npcs.length > 1 ? 's' : ''}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button
                        onClick={onManageCategories}
                        variant="outline"
                        className="border-[#444] text-gray-300 hover:bg-[#222] hover:text-white"
                        size="sm"
                    >
                        <Folder className="w-4 h-4 mr-2" />
                        Catégories
                    </Button>
                    <Button
                        onClick={onCreateNew}
                        className="bg-[#c0a080] text-black font-bold hover:bg-[#b09070]"
                        size="sm"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nouveau PNJ
                    </Button>
                </div>
            </div>

            {/* Search Bar and Category Filter */}
            <div className="p-4 border-b border-[#333] shrink-0 space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        type="text"
                        placeholder="Rechercher un PNJ..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-[#252525] border-[#444] text-[#e0e0e0] placeholder-gray-500 focus:border-[#c0a080] h-9"
                    />
                </div>

                {/* Category Filter Pills */}
                {categories.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <Filter className="w-3.5 h-3.5 text-gray-500" />
                        <button
                            onClick={() => setSelectedCategoryFilter(null)}
                            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${selectedCategoryFilter === null
                                ? 'bg-[#c0a080] text-black font-bold'
                                : 'bg-[#252525] text-gray-400 hover:bg-[#333]'
                                }`}
                        >
                            Toutes
                        </button>
                        <button
                            onClick={() => setSelectedCategoryFilter('none')}
                            className={`px-2.5 py-1 text-xs rounded-full transition-colors flex items-center gap-1.5 ${selectedCategoryFilter === 'none'
                                ? 'bg-[#c0a080] text-black font-bold'
                                : 'bg-[#252525] text-gray-400 hover:bg-[#333]'
                                }`}
                        >
                            <div className="w-2 h-2 rounded-full bg-gray-500" />
                            Sans catégorie
                        </button>
                        {categories.map((category) => (
                            <button
                                key={category.id}
                                onClick={() => setSelectedCategoryFilter(category.id)}
                                className={`px-2.5 py-1 text-xs rounded-full transition-colors flex items-center gap-1.5 ${selectedCategoryFilter === category.id
                                    ? 'bg-[#c0a080] text-black font-bold'
                                    : 'bg-[#252525] text-gray-400 hover:bg-[#333]'
                                    }`}
                            >
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color || '#c0a080' }} />
                                {category.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* NPC List */}
            <ScrollArea className="flex-1">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <p className="text-gray-500">Chargement...</p>
                    </div>
                ) : totalNpcs === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                        {searchQuery || selectedCategoryFilter ? (
                            <>
                                <Search className="w-16 h-16 text-gray-600 mb-4" />
                                <h3 className="text-lg font-bold text-gray-400 mb-2">Aucun résultat</h3>
                                <p className="text-sm text-gray-600">Aucun modèle ne correspond à votre recherche</p>
                            </>
                        ) : (
                            <>
                                <UserPlus className="w-16 h-16 text-gray-600 mb-4" />
                                <h3 className="text-lg font-bold text-gray-400 mb-2">Aucun modèle</h3>
                                <p className="text-sm text-gray-600 mb-4">Créez votre premier modèle de PNJ réutilisable</p>
                                <Button
                                    onClick={onCreateNew}
                                    className="bg-[#c0a080] text-black font-bold hover:bg-[#b09070]"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Créer un modèle
                                </Button>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="p-4 space-y-4">
                        {Array.from(npcsByCategory.entries()).map(([categoryId, categoryNpcs]) => {
                            const categoryInfo = getCategoryInfo(categoryId)
                            const isCollapsed = collapsedCategories.has(categoryId)

                            return (
                                <Collapsible key={categoryId} open={!isCollapsed} onOpenChange={() => toggleCategoryCollapse(categoryId)}>
                                    <div className="space-y-2">
                                        {/* Category Header */}
                                        <CollapsibleTrigger className="w-full">
                                            <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#252525] transition-colors cursor-pointer">
                                                {isCollapsed ? (
                                                    <ChevronRight className="w-4 h-4 text-gray-500" />
                                                ) : (
                                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                                )}
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: categoryInfo.color }}
                                                />
                                                <span className="font-semibold text-sm text-white">{categoryInfo.name}</span>
                                                <Badge variant="secondary" className="ml-auto bg-[#333] text-gray-400 text-xs">
                                                    {categoryNpcs.length}
                                                </Badge>
                                            </div>
                                        </CollapsibleTrigger>

                                        {/* Category NPCs */}
                                        <CollapsibleContent>
                                            <div className="grid grid-cols-3 gap-3 pl-6">
                                                {categoryNpcs.map((npc) => (
                                                    <Card key={npc.id} className="bg-[#222] border-[#333] hover:border-[#c0a080]/50 transition-colors">
                                                        <CardContent className="p-3">
                                                            <div className="flex flex-col items-center gap-1.5">
                                                                {/* Token */}
                                                                <div className="w-20 h-20 rounded-full border-2 overflow-hidden bg-[#1a1a1a]" style={{ borderColor: categoryInfo.color }}>
                                                                    {npc.imageURL2 ? (
                                                                        <img src={npc.imageURL2} alt={npc.Nomperso} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center">
                                                                            <User className="w-10 h-10 text-gray-600" />
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Name */}
                                                                <h3 className="font-semibold text-white text-xs text-center truncate w-full">{npc.Nomperso}</h3>

                                                                {/* Actions */}
                                                                <div className="flex gap-1 w-full justify-center">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0 text-[#c0a080] hover:text-[#b09070] hover:bg-[#c0a080]/10"
                                                                        onClick={() => onEdit(npc)}
                                                                    >
                                                                        <Edit className="w-3 h-3" />
                                                                    </Button>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-950/20"
                                                                        onClick={() => onDelete(npc.id)}
                                                                    >
                                                                        <Trash2 className="w-3 h-3" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                ))}
                                            </div>
                                        </CollapsibleContent>
                                    </div>
                                </Collapsible>
                            )
                        })}
                    </div>
                )}
            </ScrollArea>
        </div>
    )
})

NPCListView.displayName = 'NPCListView'
