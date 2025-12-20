"use client"

import React, { useState, useMemo } from 'react'
import { Users, UserPlus, Plus, Heart, Shield, Edit, Trash2, User, Search } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { type NPC } from './personnages'

interface NPCListViewProps {
    npcs: NPC[]
    loading: boolean
    onCreateNew: () => void
    onEdit: (npc: NPC) => void
    onDelete: (id: string) => void
}

export const NPCListView = React.memo(({ npcs, loading, onCreateNew, onEdit, onDelete }: NPCListViewProps) => {
    const [searchQuery, setSearchQuery] = useState('')

    // Filter NPCs based on search query
    const filteredNpcs = useMemo(() => {
        if (!searchQuery.trim()) return npcs
        return npcs.filter(npc =>
            npc.Nomperso.toLowerCase().includes(searchQuery.toLowerCase())
        )
    }, [npcs, searchQuery])

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
                <Button
                    onClick={onCreateNew}
                    className="bg-[#c0a080] text-black font-bold hover:bg-[#b09070]"
                    size="sm"
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Nouveau PNJ
                </Button>
            </div>

            {/* Search Bar */}
            <div className="p-4 border-b border-[#333] shrink-0">
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
            </div>

            {/* NPC List */}
            <ScrollArea className="flex-1">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <p className="text-gray-500">Chargement...</p>
                    </div>
                ) : filteredNpcs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center px-4">
                        {searchQuery ? (
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
                    <div className="grid grid-cols-3 gap-3 p-4">
                        {filteredNpcs.map((npc) => (
                            <Card key={npc.id} className="bg-[#222] border-[#333] hover:border-[#c0a080]/50 transition-colors">
                                <CardContent className="p-3">
                                    <div className="flex flex-col items-center gap-1.5">
                                        {/* Token - Larger */}
                                        <div className="w-20 h-20 rounded-full border-2 border-[#c0a080] overflow-hidden bg-[#1a1a1a]">
                                            {npc.imageURL2 ? (
                                                <img src={npc.imageURL2} alt={npc.Nomperso} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <User className="w-10 h-10 text-gray-600" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Name - Smaller */}
                                        <h3 className="font-semibold text-white text-xs text-center truncate w-full">{npc.Nomperso}</h3>

                                        {/* Actions - Smaller */}
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
                )}
            </ScrollArea>
        </div>
    )
})

NPCListView.displayName = 'NPCListView'
