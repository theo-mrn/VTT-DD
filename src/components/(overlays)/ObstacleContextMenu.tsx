"use client";

import React from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { Trash2, X, DoorOpen, ArrowRight, Link2, Box, Layers, Lock, Unlock } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Obstacle } from '@/lib/visibility';

interface ObstacleContextMenuProps {
    obstacles: Obstacle[];
    selectedIds: string[];
    isOpen: boolean;
    isInClosedLoop: boolean;
    isMJ: boolean;
    onClose: () => void;
    onDelete: (obstacleId: string) => void;
    onDeleteConnected: (obstacleId: string) => void;
    onToggleDoor: (obstacleId: string) => void;
    onToggleLock: (obstacleId: string) => void;
    onInvertDirection: (obstacleId: string) => void;
    onConvertTo: (obstacleId: string, newType: 'wall' | 'one-way-wall' | 'door' | 'window') => void;
    onToggleRoomMode: (obstacleId: string) => void;
}

function getObstacleLabel(obs: Obstacle): string {
    switch (obs.type) {
        case 'door': return 'Porte';
        case 'one-way-wall': return 'Mur sens-unique';
        case 'window': return 'Fenêtre';
        case 'wall': return 'Mur';
        default: return 'Obstacle';
    }
}

export default function ObstacleContextMenu({
    obstacles,
    selectedIds,
    isOpen,
    isInClosedLoop,
    isMJ,
    onClose,
    onDelete,
    onDeleteConnected,
    onToggleDoor,
    onToggleLock,
    onInvertDirection,
    onConvertTo,
    onToggleRoomMode,
}: ObstacleContextMenuProps) {
    const dragControls = useDragControls();

    if (!isOpen || selectedIds.length === 0) return null;

    const selectedObs = obstacles.find(o => o.id === selectedIds[0]);
    const selectedId = selectedIds[0];

    if (!selectedObs) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    drag
                    dragControls={dragControls}
                    dragListener={false}
                    dragMomentum={false}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="fixed right-24 top-24 w-64 bg-[#1e1e1e]/95 backdrop-blur-md border border-[#333] rounded-xl shadow-2xl z-[9999] flex flex-col overflow-hidden"
                >
                    {/* Header */}
                    <div
                        className="flex items-center justify-between px-4 py-3 border-b border-[#333] cursor-move"
                        onPointerDown={(e) => dragControls.start(e)}
                    >
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#c0a080] to-[#a08060] flex items-center justify-center">
                                <svg className="w-4 h-4 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                                    <polyline points="4,18 10,8 18,12 22,4" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            <h3 className="text-sm font-bold text-white">
                                {getObstacleLabel(selectedObs)}
                            </h3>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg text-gray-400 hover:text-white hover:bg-[#333]"
                            onClick={onClose}
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    {/* Body */}
                    <div className="p-3 space-y-2">
                        {/* Type-specific actions */}
                        {/* Door actions (visible par tous) */}
                        {selectedObs.type === 'door' && (
                            <Button
                                variant="outline"
                                className={`w-full justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] text-gray-300 ${selectedObs.isOpen ? 'hover:text-red-400' : 'hover:text-green-400'}`}
                                onClick={() => onToggleDoor(selectedId)}
                            >
                                <DoorOpen size={16} />
                                {selectedObs.isOpen ? 'Fermer la porte' : 'Ouvrir la porte'}
                                {selectedObs.isLocked && !isMJ && (
                                    <Lock size={12} className="ml-auto text-yellow-500" />
                                )}
                            </Button>
                        )}

                        {/* MJ-only actions */}
                        {isMJ && selectedObs.type === 'door' && (
                            <Button
                                variant="outline"
                                className={`w-full justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] text-gray-300 ${selectedObs.isLocked ? 'hover:text-green-400' : 'hover:text-yellow-400'}`}
                                onClick={() => onToggleLock(selectedId)}
                            >
                                {selectedObs.isLocked ? <Unlock size={16} /> : <Lock size={16} />}
                                {selectedObs.isLocked ? 'Déverrouiller' : 'Verrouiller'}
                            </Button>
                        )}

                        {isMJ && selectedObs.type === 'one-way-wall' && (
                            <Button
                                variant="outline"
                                className="w-full justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-orange-400 text-gray-300"
                                onClick={() => onInvertDirection(selectedId)}
                            >
                                <ArrowRight size={16} />
                                Inverser le sens
                            </Button>
                        )}

                        {/* Room mode toggle (MJ only, only for walls in closed loops) */}
                        {isMJ && isInClosedLoop && (
                            <Button
                                variant="outline"
                                className={`w-full justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] text-gray-300 ${selectedObs.roomMode === 'individual' ? 'hover:text-purple-400' : 'hover:text-blue-400'}`}
                                onClick={() => onToggleRoomMode(selectedId)}
                            >
                                {selectedObs.roomMode === 'individual' ? (
                                    <>
                                        <Box size={16} />
                                        Passer en mode Salle
                                    </>
                                ) : (
                                    <>
                                        <Layers size={16} />
                                        Passer en mode Obstacles
                                    </>
                                )}
                            </Button>
                        )}

                        {/* MJ-only: Convert & Delete */}
                        {isMJ && (
                            <>
                                <Separator className="bg-[#333] my-1" />

                                {/* Convert type */}
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium px-1">Convertir en</p>
                                <div className="grid grid-cols-4 gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`h-8 text-xs ${selectedObs.type === 'wall' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'}`}
                                        onClick={() => onConvertTo(selectedId, 'wall')}
                                        title="Mur"
                                    >
                                        <div className="w-3 h-3 bg-current rounded-[1px]" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`h-8 text-xs ${selectedObs.type === 'one-way-wall' ? 'bg-orange-500/20 text-orange-400' : 'text-gray-400 hover:text-orange-400'}`}
                                        onClick={() => onConvertTo(selectedId, 'one-way-wall')}
                                        title="Sens unique"
                                    >
                                        <ArrowRight className="w-3 h-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`h-8 text-xs ${selectedObs.type === 'door' ? 'bg-green-500/20 text-green-400' : 'text-gray-400 hover:text-green-400'}`}
                                        onClick={() => onConvertTo(selectedId, 'door')}
                                        title="Porte"
                                    >
                                        <DoorOpen className="w-3 h-3" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className={`h-8 text-xs ${selectedObs.type === 'window' ? 'bg-blue-400/20 text-blue-400' : 'text-gray-400 hover:text-blue-400'}`}
                                        onClick={() => onConvertTo(selectedId, 'window')}
                                        title="Fenêtre"
                                    >
                                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                            <rect x="3" y="3" width="18" height="18" rx="2" />
                                            <line x1="12" y1="3" x2="12" y2="21" />
                                            <line x1="3" y1="12" x2="21" y2="12" />
                                        </svg>
                                    </Button>
                                </div>

                                <Separator className="bg-[#333] my-1" />

                                {/* Delete actions */}
                                <Button
                                    variant="outline"
                                    className="w-full justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-red-400 text-gray-300"
                                    onClick={() => onDelete(selectedId)}
                                >
                                    <Trash2 size={16} />
                                    Supprimer ce mur
                                </Button>
                                <Button
                                    variant="outline"
                                    className="w-full justify-start gap-2 bg-[#252525] border-[#333] hover:bg-[#333] hover:text-red-400 text-gray-300"
                                    onClick={() => onDeleteConnected(selectedId)}
                                >
                                    <Link2 size={16} />
                                    Supprimer les murs adjacents
                                </Button>
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
