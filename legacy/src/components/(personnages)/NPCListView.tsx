"use client"

import React, { useMemo } from 'react'
import { User, Check, Edit, Trash2 } from 'lucide-react'
import { type NPC, type Category } from './personnages'
import { cn } from "@/lib/utils"

interface NPCGridProps {
    npcs: NPC[]
    categories: Category[]
    loading: boolean
    selectedNpcId: string | null
    onSelect: (npc: NPC) => void
    searchQuery: string
    selectedCategoryId: string | null
}

export const NPCGrid = React.memo(({
    npcs,
    categories,
    loading,
    selectedNpcId,
    onSelect,
    searchQuery,
    selectedCategoryId
}: NPCGridProps) => {

    // Filtering logic
    const filteredNPCs = useMemo(() => {
        let filtered = npcs

        // Search
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            filtered = filtered.filter(npc =>
                npc.Nomperso.toLowerCase().includes(query)
            )
        }

        // Category Filter
        if (selectedCategoryId) {
            filtered = filtered.filter(npc => {
                if (selectedCategoryId === 'none') return !npc.categoryId
                return npc.categoryId === selectedCategoryId
            })
        }

        return filtered
    }, [npcs, searchQuery, selectedCategoryId])

    if (loading) {
        return (
            <div className="w-full h-40 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-[#c0a080] border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (filteredNPCs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center px-4 opacity-50">
                <User className="w-12 h-12 text-zinc-600 mb-3" />
                <p className="text-zinc-500 font-medium">Aucun PNJ trouvé</p>
                <p className="text-xs text-zinc-600">Essayez de modifier vos filtres</p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 p-1 pb-20">
            {filteredNPCs.map((npc) => {
                const category = categories.find(c => c.id === npc.categoryId)
                return (
                    <NPCCard
                        key={npc.id}
                        npc={npc}
                        categoryName={category?.name || (npc.categoryId ? 'Inconnu' : 'Sans catégorie')}
                        isSelected={selectedNpcId === npc.id}
                        onClick={() => onSelect(npc)}
                    />
                )
            })}
        </div>
    )
})

NPCGrid.displayName = 'NPCGrid'

// --- SUB COMPONENTS ---

interface NPCCardProps {
    npc: NPC
    categoryName: string
    isSelected: boolean
    onClick: () => void
}

function NPCCard({ npc, categoryName, isSelected, onClick }: NPCCardProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "group relative flex flex-col aspect-[3/4] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 border bg-[#1a1a1a]",
                isSelected
                    ? "border-[#c0a080] ring-1 ring-[#c0a080] scale-[1.02] shadow-[0_0_20px_rgba(192,160,128,0.2)] z-10"
                    : "border-[#27272a] hover:border-[#52525b] hover:shadow-xl opacity-90 hover:opacity-100"
            )}
        >
            {/* Image Layer */}
            <div className="absolute inset-0 bg-[#1a1a1a]">
                {npc.imageURL2 ? (
                    <img
                        src={npc.imageURL2}
                        alt={npc.Nomperso}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#202022]">
                        <User className="w-12 h-12 text-[#333]" />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            </div>

            {/* Content Layer */}
            <div className="relative flex-1 flex flex-col justify-end p-3">
                <span className="text-[9px] font-bold text-[#c0a080] uppercase tracking-wider mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                    {categoryName}
                </span>
                <h3 className={cn(
                    "font-serif text-base font-bold leading-tight mb-1 transition-colors",
                    isSelected ? "text-[#c0a080]" : "text-zinc-200 group-hover:text-white"
                )}>
                    {npc.Nomperso}
                </h3>

                <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] bg-black/60 px-1.5 py-0.5 rounded text-[#c0a080] border border-[#c0a080]/30">
                        Niv. {npc.niveau}
                    </span>

                </div>
            </div>

            {/* Selection Indicator */}
            {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-[#c0a080] rounded-full flex items-center justify-center shadow-lg">
                    <Check className="w-3 h-3 text-black" strokeWidth={3} />
                </div>
            )}
        </div>
    )
}

