"use client"

import React, { useEffect, useState } from 'react'
import { X, Boxes, GripVertical } from 'lucide-react'
import { db, collection, onSnapshot } from '@/lib/firebase'
import { useGameSystem } from '@/modules/game-system/useGameSystem'
import { useDialogVisibility } from '@/contexts/DialogVisibilityContext'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import type { GroupEntity } from '@/app/[roomid]/map/types'

// Panneau embarqué (onglet UnifiedSearchDrawer) listant Salle/{roomId}/groupEntities pour les
// glisser sur la carte comme token — MJ uniquement, générique par système de jeu (aucun libellé
// "vaisseau" en dur : le nom de la catégorie vient de gameSystem.groupEntityLabel).

interface ShipDrawerProps {
    roomId: string
    isOpen: boolean
    onClose: () => void
    onDragStart: (entity: GroupEntity) => void
    isEmbedded?: boolean
}

export function ShipDrawer({ roomId, isOpen, onClose, onDragStart, isEmbedded }: ShipDrawerProps) {
    const { setDialogOpen } = useDialogVisibility()
    const { gameSystem } = useGameSystem(roomId)
    const entityLabel = gameSystem.groupEntityLabel || 'Entité'
    const [entities, setEntities] = useState<GroupEntity[]>([])

    useEffect(() => {
        setDialogOpen(isOpen)
    }, [isOpen, setDialogOpen])

    useEffect(() => {
        if (!roomId) return
        const unsub = onSnapshot(collection(db, 'Salle', roomId, 'groupEntities'), (snap) => {
            setEntities(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupEntity, 'id'>) })))
        })
        return () => unsub()
    }, [roomId])

    if (!isOpen) return null
    if (!gameSystem.groupEntityStats || gameSystem.groupEntityStats.length === 0) return null

    const fleet = entities.filter((e) => e.acquis)
    const catalog = entities.filter((e) => !e.acquis && (e.label ?? '') !== '')

    const handleDragStart = (e: React.DragEvent, entity: GroupEntity) => {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData('application/json', JSON.stringify({
            type: 'group_entity_template',
            entityId: entity.id,
            label: entity.label,
            image: entity.image,
        }))
        onDragStart(entity)
    }

    return (
        <div className={isEmbedded ? "flex flex-col h-full w-full bg-[#1a1a1a]" : "fixed right-0 top-0 h-full w-80 bg-[#1a1a1a] border-l border-[#333] z-[99999900] flex flex-col shadow-2xl"}>
            {!isEmbedded && (
                <div className="relative px-6 py-5 border-b border-[#333] bg-gradient-to-br from-[#1a1a1a] via-[#1a1a1a] to-[#252525]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#c0a080] to-[#a08060] flex items-center justify-center shadow-lg shadow-[#c0a080]/20">
                                <Boxes className="w-5 h-5 text-black" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-white tracking-tight">{entityLabel}</h2>
                                <p className="text-xs text-gray-400">Glisser sur la carte</p>
                            </div>
                        </div>
                        <Button variant="ghost" size="sm" onClick={onClose} className="h-9 w-9 p-0 rounded-lg text-gray-400 hover:text-white hover:bg-[#333] transition-all">
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

            <ScrollArea className="flex-1 bg-[#141414]">
                <div className="p-4 flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <span className="text-[11px] font-bold tracking-widest uppercase text-[#c0a080]">
                            Flotte du groupe
                        </span>
                        {fleet.length === 0 ? (
                            <p className="text-xs text-gray-500 italic">Aucun(e) {entityLabel.toLowerCase()} acquis(e).</p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {fleet.map((entity) => (
                                    <ShipCard key={entity.id} entity={entity} onDragStart={handleDragStart} />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-2">
                        <span className="text-[11px] font-bold tracking-widest uppercase text-gray-500">
                            Catalogue
                        </span>
                        {catalog.length === 0 ? (
                            <p className="text-xs text-gray-500 italic">Catalogue vide.</p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {catalog.map((entity) => (
                                    <ShipCard key={entity.id} entity={entity} onDragStart={handleDragStart} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </ScrollArea>
        </div>
    )
}

function ShipCard({ entity, onDragStart }: { entity: GroupEntity; onDragStart: (e: React.DragEvent, entity: GroupEntity) => void }) {
    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, entity)}
            className="group bg-[#1e1e1e] border border-[#333] rounded-lg p-3 cursor-move hover:border-[#c0a080]/50 hover:bg-[#252525] transition-all flex items-center gap-3"
        >
            <GripVertical className="w-4 h-4 text-gray-600 group-hover:text-[#c0a080] transition-colors flex-shrink-0" />
            <div className="h-12 w-12 rounded-lg overflow-hidden flex-shrink-0 bg-[#0a0a0a] border border-[#2a2a2a] flex items-center justify-center">
                {entity.image ? (
                    <img src={entity.image} alt="" className="w-full h-full object-contain" draggable={false} />
                ) : (
                    <Boxes className="w-5 h-5 text-gray-600" />
                )}
            </div>
            <span className="text-sm font-medium text-gray-200 truncate group-hover:text-[#c0a080] transition-colors">
                {entity.label || '(sans nom)'}
            </span>
        </div>
    )
}
